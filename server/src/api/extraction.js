// Extraction pipeline for POST /api/extract (spec Section 6, L1).
//
// Two validation layers:
//   1. The AI service is asked for structured output matching Statement.
//   2. Server code re-validates EVERY returned row against TransactionSchema.
//      Invalid rows are reported in `validation_errors` and never reach the dashboard.

import { parse as parseCsv } from 'csv-parse/sync';

import { AiNotConfiguredError, HttpError, OutOfScopeError } from '../errors.js';
import { StatementSchema, TransactionSchema, formatZodError } from '../models/schemas.js';
import { normalizeRow } from './normalize.js';

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024; // 12 MB
export const MAX_AI_TEXT_CHARS = 100_000;
export const CSV_PREFIX = 'CSV rows (extract/normalize only; do not invent values):';

const capText = (text) => (text.length > MAX_AI_TEXT_CHARS ? text.slice(0, MAX_AI_TEXT_CHARS) : text);

const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
const SUPPORTED_MIME = new Set(['application/pdf', ...Object.values(IMAGE_TYPES)]);
export const UNSUPPORTED_FILE_MESSAGE = 'Unsupported file type. Please upload a PNG, JPG, WEBP, PDF, CSV or TXT file.';

// Browsers sometimes label files "application/octet-stream" (or a Windows
// "application/vnd.ms-excel" for CSV), so the extension is checked as well.
function fileKind(file) {
  const extension = (file.originalname ?? '').split('.').pop().toLowerCase();
  const mime = (file.mimetype ?? '').toLowerCase();
  if (mime === 'text/csv' || extension === 'csv') return { kind: 'csv' };
  if (mime === 'text/plain' || extension === 'txt') return { kind: 'text' };
  if (SUPPORTED_MIME.has(mime)) return { kind: 'binary', mime };
  if (extension === 'pdf') return { kind: 'binary', mime: 'application/pdf' };
  if (IMAGE_TYPES[extension]) return { kind: 'binary', mime: IMAGE_TYPES[extension] };
  return { kind: 'unsupported' };
}

// Server code parses the table; the AI is only asked to normalise the rows.
function csvToPrompt(buffer) {
  let decoded;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new HttpError(400, 'CSV must be UTF-8 encoded.');
  }
  decoded = decoded.replace(/^﻿/, ''); // tolerate a BOM

  let rows;
  try {
    rows = parseCsv(decoded, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true });
  } catch (error) {
    throw new HttpError(400, `Could not read CSV: ${error.message}`);
  }
  if (rows.length === 0) {
    throw new HttpError(400, 'Could not read CSV: the file has no data rows.');
  }
  return `${CSV_PREFIX}\n${JSON.stringify(rows, null, 2)}`;
}

/**
 * @param {{ text?: string, file?: { buffer: Buffer, mimetype?: string, originalname?: string, size: number } }} input
 * @param {import('../ai/aiService.js').AiService} aiService
 */
export async function extractTransactions({ text, file }, aiService) {
  const trimmedText = typeof text === 'string' ? text.trim() : '';

  if (!trimmedText && !file) {
    throw new HttpError(400, 'Paste transaction text or choose a file.');
  }
  if (file) {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new HttpError(413, 'Please use a file smaller than 12 MB for this classroom demo.');
    }
    if (!file.buffer || file.size === 0) {
      throw new HttpError(400, 'The selected file is empty.');
    }
  }

  const kind = file ? fileKind(file) : null;
  if (kind?.kind === 'unsupported') throw new HttpError(400, UNSUPPORTED_FILE_MESSAGE);

  let statement;
  try {
    if (kind?.kind === 'csv') {
      const csvText = capText(csvToPrompt(file.buffer));
      statement = await aiService.extractStatement(trimmedText ? `${csvText}\n\n${capText(trimmedText)}` : csvText, null, null);
    } else if (kind?.kind === 'text') {
      const fileText = new TextDecoder('utf-8').decode(file.buffer).trim();
      const combined = [trimmedText, fileText].filter(Boolean).join('\n');
      if (!combined) throw new HttpError(400, 'The selected file is empty.');
      statement = await aiService.extractStatement(capText(combined), null, null);
    } else {
      statement = await aiService.extractStatement(
        trimmedText ? capText(trimmedText) : null,
        file ? file.buffer : null,
        kind ? kind.mime : null,
      );
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof OutOfScopeError) throw new HttpError(422, error.message);
    if (error instanceof AiNotConfiguredError) throw new HttpError(503, error.message);
    // No automatic retry: the user retries manually.
    throw new HttpError(502, `AI extraction failed: ${error.message}`);
  }

  // Layer 1 check: the overall shape must be a Statement.
  const parsedStatement = StatementSchema.safeParse(statement);
  if (!parsedStatement.success) {
    throw new HttpError(
      502,
      `AI extraction failed: response did not match the Statement schema (${formatZodError(parsedStatement.error)})`,
    );
  }

  // Layer 2: re-validate every row. Only valid, typed records go to the client.
  const transactions = [];
  const validationErrors = [];
  const notes = [...parsedStatement.data.notes];
  parsedStatement.data.transactions.forEach((row, index) => {
    const result = TransactionSchema.safeParse(normalizeRow(row, notes));
    if (result.success) {
      transactions.push(result.data);
    } else {
      validationErrors.push({ row: index + 1, error: formatZodError(result.error) });
    }
  });

  return {
    transactions,
    notes,
    validation_errors: validationErrors,
    count: transactions.length,
  };
}
