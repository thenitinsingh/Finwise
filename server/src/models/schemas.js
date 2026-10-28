// Schemas for every model in spec Section 5, implemented with Zod.
// JSON keys match the spec exactly (snake_case).
//
// Anything that comes from the outside world — request bodies AND the AI
// service's output — is parsed through these schemas before it is used.

import { z } from 'zod';

export const CATEGORIES = [
  'Dining',
  'Fuel',
  'Shopping',
  'Subscriptions',
  'Food delivery',
  'Income',
  'Bills',
  'Other',
];

export const TOOL_NAMES = {
  DETECT: 'detect_stealth_hikes',
  CALCULATE: 'calculate_annual_leakage',
  DRAFT: 'generate_cancellation_script',
  FINISH: 'finish',
};

// The only tools the agent may ever call.
export const TOOL_ALLOWLIST = Object.freeze([
  TOOL_NAMES.DETECT,
  TOOL_NAMES.CALCULATE,
  TOOL_NAMES.DRAFT,
  TOOL_NAMES.FINISH,
]);

export const DEFAULT_GOAL = 'Audit my transactions for subscription traps and silent price hikes.';

export const SESSION_STATUSES = ['analyzing', 'awaiting_approval', 'executing', 'done', 'failed'];

export const CategorySchema = z.enum(CATEGORIES);

// A real calendar date in ISO YYYY-MM-DD form (rejects 2026-02-30).
const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD or null')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(y, m - 1, d));
    return (
      parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d
    );
  }, 'date is not a valid calendar date');

export const TransactionSchema = z.object({
  merchant: z
    .string({ error: 'merchant is required' })
    .trim()
    .min(1, 'merchant must not be empty')
    .max(120, 'merchant must be at most 120 characters'),
  // Unclear dates stay null — they are never guessed.
  date: IsoDateSchema.nullable().default(null),
  category: CategorySchema.default('Other'),
  // Positive = charge, negative = refund/credit. Plain number, no currency symbol.
  // (Zod numbers reject NaN and Infinity.)
  amount: z.number({ error: 'amount must be a number' }),
  raw_line: z.string().max(2000).nullable().default(null),
});

export const StatementSchema = z.object({
  transactions: z.array(z.unknown()),
  notes: z.array(z.string()).default([]),
});

export const AuditRequestSchema = z.object({
  transactions: z.array(TransactionSchema).max(5000, 'At most 5000 transactions per audit.'),
  goal: z
    .string()
    .trim()
    .max(2000, 'goal must be at most 2000 characters')
    .default(DEFAULT_GOAL)
    .transform((goal) => goal || DEFAULT_GOAL),
});

export const ApprovalRequestSchema = z.object({
  decision: z.enum(['approve', 'reject'], { error: 'decision must be "approve" or "reject"' }),
  reason: z.string().trim().max(500).nullable().optional().default(null),
});

// Planner output. Arguments are a flat map of simple values.
const SimpleValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const AgentDecisionSchema = z.object({
  tool_name: z.enum(TOOL_ALLOWLIST),
  arguments: z.record(z.string(), SimpleValueSchema).default({}),
  message: z.string().default(''),
});

// Formats a Zod error as a single readable line, e.g. "amount: amount must be a number".
export function formatZodError(error) {
  return error.issues
    .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
    .join('; ');
}

// Chat request: the question, recent turns and the transactions currently on the dashboard.
export const MAX_CHAT_MESSAGE_CHARS = 1000;

export const ChatRequestSchema = z.object({
  message: z
    .string({ error: 'message is required' })
    .trim()
    .min(1, 'Type a question first.')
    .max(MAX_CHAT_MESSAGE_CHARS, `Please keep your question under ${MAX_CHAT_MESSAGE_CHARS} characters.`),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(4000),
      }),
    )
    .max(40)
    .default([]),
  transactions: z.array(TransactionSchema).max(5000, 'At most 5000 transactions.').default([]),
  currency: z.string().trim().max(8).default('USD'),
});
