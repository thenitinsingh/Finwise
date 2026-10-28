// ============================================================================
// AI SERVICE — the single boundary between this app and any LLM (Google Gemini).
//
// Exposed operations:
//   extractStatement(text?, fileBytes?, mimeType?) → Statement
//   chat({ message, history, context })            → { reply }
//   chooseNextStep(goal, findings, toolResults, availableTools) → AgentDecision
//
// Rules:
//   • Gemini is called through its REST API with Node's built-in fetch, so no
//     SDK is needed. This is the ONLY file that talks to an LLM.
//   • The API layer treats whatever is returned as untrusted: it re-validates
//     every transaction and does all money maths in code.
//   • The API key is never logged and never sent to the client.
// ============================================================================

import { isAiKeyConfigured } from '../config.js';
import { AiNotConfiguredError, OutOfScopeError } from '../errors.js';
import { TOOL_NAMES } from '../models/schemas.js';
import {
  CHAT_PROMPT,
  EXTRACTION_PROMPT,
  NOT_FINANCE_DOCUMENT_MESSAGE,
  OUT_OF_SCOPE_CHAT_MESSAGE,
} from './prompts.js';

export { EXTRACTION_PROMPT, CHAT_PROMPT };

export const AI_NOT_CONFIGURED_MESSAGE =
  'AI is not configured. Add AI_API_KEY to server/.env and restart the server.';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const REQUEST_TIMEOUT_MS = 60_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/**
 * Where to send the request. All Gemini API keys (the older "AIza..." keys and the
 * newer "AQ..." auth keys that AI Studio creates now) go to the same address and are
 * sent in the x-goog-api-key header, so the key never appears in a URL or an error.
 */
export function geminiRequestTarget(apiKey, model) {
  return {
    url: `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`,
    headers: { 'x-goog-api-key': apiKey },
  };
}

/** Pull the first JSON object out of a model reply (tolerates ```json fences and stray prose). */
export function parseJsonReply(text) {
  const raw = String(text ?? '').trim();
  if (!raw) throw new Error('the model returned an empty response');
  const unfenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(unfenced.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    throw new Error('the model did not return valid JSON');
  }
}

// Turns a Gemini HTTP error into a short, helpful message (never includes the key).
function describeGeminiError(status, body) {
  const message = body?.error?.message ?? '';
  if (status === 400 && /api key/i.test(message)) return 'Gemini rejected the API key. Check AI_API_KEY in server/.env.';
  if (status === 401 || status === 403) return 'Gemini refused the request (invalid key or no access). Check AI_API_KEY.';
  if (status === 404) return `Gemini says: ${message || 'not found'}. Check AI_MODEL in server/.env (e.g. gemini-3.5-flash-lite). Older models such as gemini-2.5-flash are closed to new accounts.`;
  if (status === 429) return 'Gemini rate limit or quota reached. Wait a minute and try again.';
  if (status >= 500) return 'Gemini is temporarily unavailable. Please try again.';
  return message ? `Gemini error: ${message}` : `Gemini request failed (HTTP ${status}).`;
}

export class AiService {
  constructor(config) {
    this.model = config.aiModel;
    this.apiKey = config.aiApiKey;
    this.keyConfigured = isAiKeyConfigured(config);
  }

  /** True when an API key is present and is not the placeholder. Reported by /api/health. */
  isConfigured() {
    return this.keyConfigured;
  }

  // One Gemini generateContent call that must return JSON. Retries once on
  // transient errors (rate limit / overload).
  async #generateJson({ systemPrompt, parts, contents, maxOutputTokens = 8192 }) {
    if (!this.keyConfigured) throw new AiNotConfiguredError(AI_NOT_CONFIGURED_MESSAGE);

    const body = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: contents ?? [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens,
        responseMimeType: 'application/json',
      },
    };

    let lastError;
    const started = Date.now();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let response;
      try {
        const target = geminiRequestTarget(this.apiKey, this.model);
        response = await fetch(target.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...target.headers },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        if (error?.name === 'TimeoutError') {
          // Do not retry a timeout: it would just double the wait.
          throw new Error('Gemini took too long to respond (over 60 seconds). Please try again or use a smaller file.');
        }
        lastError = new Error('Could not reach Gemini. Check your internet connection.');
        continue;
      }

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        // handled below
      }

      if (!response.ok) {
        lastError = new Error(describeGeminiError(response.status, payload));
        if (RETRYABLE_STATUSES.has(response.status) && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          continue;
        }
        throw lastError;
      }

      const candidate = payload?.candidates?.[0];
      if (!candidate) {
        const blocked = payload?.promptFeedback?.blockReason;
        throw new Error(blocked ? `Gemini blocked this input (${blocked}).` : 'Gemini returned no answer.');
      }
      const text = (candidate.content?.parts ?? []).map((part) => part.text ?? '').join('');
      if (candidate.finishReason === 'MAX_TOKENS') {
        throw new Error('The document is too large to read in one go. Try a shorter statement or fewer pages.');
      }
      if (!text.trim()) {
        throw new Error(
          candidate.finishReason && candidate.finishReason !== 'STOP'
            ? `Gemini stopped without an answer (${candidate.finishReason}).`
            : 'Gemini returned an empty answer.',
        );
      }
      console.log(`Gemini call finished in ${((Date.now() - started) / 1000).toFixed(1)} s`);
      return parseJsonReply(text);
    }
    throw lastError ?? new Error('Gemini request failed.');
  }

  /**
   * Extract a Statement ({transactions, notes}) from text and/or a file.
   * Throws OutOfScopeError when the input is not financial data,
   * AiNotConfiguredError (→ 503) without a key, a plain Error on failures (→ 502).
   */
  async extractStatement(text = null, fileBytes = null, mimeType = null) {
    if (!this.keyConfigured) throw new AiNotConfiguredError(AI_NOT_CONFIGURED_MESSAGE);

    const parts = [];
    if (fileBytes) {
      parts.push({ inlineData: { mimeType: mimeType || 'application/octet-stream', data: Buffer.from(fileBytes).toString('base64') } });
    }
    parts.push({
      text: text
        ? `Extract the transactions from the input below (and from the attached file, if any).\n\n<input>\n${text}\n</input>`
        : 'Extract the transactions from the attached file.',
    });

    const result = await this.#generateJson({ systemPrompt: EXTRACTION_PROMPT, parts, maxOutputTokens: 32768 });

    if (result?.is_financial_document === false) {
      const why = typeof result.rejection_reason === 'string' ? result.rejection_reason.trim() : '';
      throw new OutOfScopeError(why ? `${NOT_FINANCE_DOCUMENT_MESSAGE} (It looks like: ${why})` : NOT_FINANCE_DOCUMENT_MESSAGE);
    }
    return {
      transactions: Array.isArray(result?.transactions) ? result.transactions : [],
      notes: Array.isArray(result?.notes) ? result.notes.filter((note) => typeof note === 'string') : [],
    };
  }

  /**
   * Personal-finance coach. `context` is the deterministic summary built by
   * code (see buildFinanceContext); `history` is the recent chat turns.
   * Throws OutOfScopeError when the question is not about personal finance.
   */
  async chat({ message, history = [], context }) {
    if (!this.keyConfigured) throw new AiNotConfiguredError(AI_NOT_CONFIGURED_MESSAGE);

    const contents = [];
    for (const turn of history.slice(-8)) {
      contents.push({ role: turn.role === 'assistant' ? 'model' : 'user', parts: [{ text: turn.content }] });
    }
    contents.push({
      role: 'user',
      parts: [
        {
          text:
            `<finance_context>\n${JSON.stringify(context)}\n</finance_context>\n\n` +
            `<user_question>\n${message}\n</user_question>`,
        },
      ],
    });

    // Gemini requires the conversation to start with a user turn.
    while (contents.length > 1 && contents[0].role !== 'user') contents.shift();

    const result = await this.#generateJson({ systemPrompt: CHAT_PROMPT, contents, maxOutputTokens: 2048 });
    const reply = typeof result?.reply === 'string' ? result.reply.trim() : '';
    if (result?.in_scope === false) {
      throw new OutOfScopeError(reply || OUT_OF_SCOPE_CHAT_MESSAGE);
    }
    if (!reply) throw new Error('Gemini returned an empty answer.');
    return { reply };
  }

  /**
   * Decide the agent's next step. The audit planner is deterministic on purpose:
   * the tool order never needs an LLM, it is cheaper, and it cannot be talked
   * into a different action by text inside the transactions.
   */
  async chooseNextStep(goal, findings, toolResults, availableTools) {
    void goal;
    void availableTools;
    return offlinePlanner(findings, toolResults);
  }
}

/**
 * Deterministic planner (fully implemented).
 * On the sample data: detect → calculate → draft, then the loop stops for approval.
 */
export function offlinePlanner(findings, toolResults) {
  const hasRun = (name) => toolResults.some((result) => result.tool === name);
  const hike = findings.find((finding) => finding.change_pct > 0);

  if (!hasRun(TOOL_NAMES.DETECT)) {
    return { tool_name: TOOL_NAMES.DETECT, arguments: {}, message: 'Check recurring charges for increases.' };
  }
  if (hike && !hasRun(TOOL_NAMES.CALCULATE)) {
    return {
      tool_name: TOOL_NAMES.CALCULATE,
      arguments: { merchant: hike.merchant, monthly_amount: hike.new_amount },
      message: 'Calculate the annualized subscription cost.',
    };
  }
  if (hike && !hasRun(TOOL_NAMES.DRAFT)) {
    return {
      tool_name: TOOL_NAMES.DRAFT,
      arguments: { merchant: hike.merchant, old_amount: hike.old_amount, new_amount: hike.new_amount },
      message: 'Prepare a draft for human review.',
    };
  }
  return {
    tool_name: TOOL_NAMES.FINISH,
    arguments: {},
    message: 'Audit complete; review any proposed action before proceeding.',
  };
}