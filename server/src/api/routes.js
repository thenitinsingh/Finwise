// HTTP routes for the JSON API (spec Section 4). Every error is returned as
// `{"detail": "message"}` by the error handler in src/app.js.

import express from 'express';
import multer from 'multer';

import { getSampleTransactions, SAMPLE_CURRENCY, SAMPLE_SOURCE } from '../data/sampleTransactions.js';
import { AiNotConfiguredError, HttpError, OutOfScopeError } from '../errors.js';
import { ApprovalRequestSchema, AuditRequestSchema, ChatRequestSchema, formatZodError } from '../models/schemas.js';
import { buildFinanceContext } from '../tools/financeTools.js';
import { recordApproval, runAudit } from './auditAgent.js';
import { MAX_UPLOAD_BYTES, extractTransactions } from './extraction.js';

// Uploads stay in memory only (PRIVACY: never written to disk).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fieldSize: 2 * 1024 * 1024 },
});

function parseOrThrow(schema, body) {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) throw new HttpError(400, formatZodError(parsed.error));
  return parsed.data;
}

export function createApiRouter({ aiService, store }) {
  const router = express.Router();

  // F1 — health check
  router.get('/health', (req, res) => {
    res.json({ status: 'ok', ai_configured: aiService.isConfigured() });
  });

  // F2 — fictional sample data
  router.get('/sample', (req, res) => {
    res.json({ transactions: getSampleTransactions(), currency: SAMPLE_CURRENCY, source: SAMPLE_SOURCE });
  });

  // F3 — extraction (the AI call itself lives in the AI service stub)
  router.post('/extract', upload.single('file'), async (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    const result = await extractTransactions({ text, file: req.file ?? null }, aiService);
    res.json(result);
  });

  // Chat — personal-finance coach. Numbers come from code (buildFinanceContext);
  // Gemini only explains them. Off-topic questions get a 422 with a clear message.
  router.post('/chat', async (req, res) => {
    const { message, history, transactions, currency } = parseOrThrow(ChatRequestSchema, req.body);
    const context = buildFinanceContext(transactions, currency);
    try {
      const { reply } = await aiService.chat({ message, history, context });
      res.json({ reply });
    } catch (error) {
      if (error instanceof OutOfScopeError) throw new HttpError(422, error.message);
      if (error instanceof AiNotConfiguredError) throw new HttpError(503, error.message);
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, `The assistant could not answer: ${error.message}`);
    }
  });

  // F6 — start a bounded audit
  router.post('/audits', async (req, res) => {
    if (Array.isArray(req.body?.transactions) && req.body.transactions.length === 0) {
      throw new HttpError(400, 'Add transactions before starting an audit.');
    }
    const { transactions, goal } = parseOrThrow(AuditRequestSchema, req.body);
    const session = await runAudit({ transactions, goal, aiService, store });
    res.json(session);
  });

  // F9 — read a session
  router.get('/audits/:sessionId', (req, res) => {
    const session = store.get(req.params.sessionId);
    if (!session) throw new HttpError(404, 'Audit session not found.');
    res.json(session);
  });

  // F7 — human approval gate (local simulation only)
  router.post('/audits/:sessionId/approval', (req, res) => {
    // Check the session first so an unknown id is a 404 even with a bad body.
    if (!store.get(req.params.sessionId)) {
      throw new HttpError(404, 'Audit session not found. Start a new audit.');
    }
    const { decision, reason } = parseOrThrow(ApprovalRequestSchema, req.body);
    const session = recordApproval({ store, sessionId: req.params.sessionId, decision, reason });
    res.json(session);
  });

  return router;
}
