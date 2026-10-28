// Bounded, ReAct-style audit agent (spec Section 6, L7, L9, L10).
//
// SAFETY decisions, all enforced here in server code:
//   1. The loop runs at most MAX_STEPS times.
//   2. The planner can only pick names from TOOL_ALLOWLIST; anything else
//      stops the audit safely with status "failed".
//   3. Tool arguments from the planner are never trusted: they are re-grounded
//      against findings computed by deterministic code.
//   4. A drafted message stops the loop at "awaiting_approval". Approval only
//      records a local simulation — `sent` is always false.

import { randomUUID } from 'node:crypto';

import { HttpError } from '../errors.js';
import {
  AgentDecisionSchema,
  TOOL_ALLOWLIST,
  TOOL_NAMES,
  formatZodError,
} from '../models/schemas.js';
import {
  calculateAnnualLeakage,
  detectStealthHikes,
  generateCancellationScript,
} from '../tools/financeTools.js';
import { money, round2 } from '../tools/money.js';

export const MAX_STEPS = 6;
const SKIPPED_RESULT = Object.freeze({ skipped: 'No price hike found.' });

const sameMerchant = (a, b) =>
  String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

function log(session, type, message, details = {}) {
  session.audit_log.push({ time: new Date().toISOString(), type, message, details });
}

// L9 — summary text, built from deterministic findings only.
export function buildSummary(findings) {
  if (findings.length === 0) {
    return 'No subscription price hikes above 10% were found in the provided data.';
  }
  return findings
    .map(
      (f) =>
        `${f.merchant} increased from $${money(f.old_amount)} to $${money(f.new_amount)} ` +
        `(+${f.change_pct.toFixed(1)}%). Current annualized cost: $${money(f.new_amount * 12)}.`,
    )
    .join(' ');
}

// The planner returns untrusted data: check the allowlist first, then the shape.
function validateDecision(rawDecision) {
  const toolName = rawDecision?.tool_name;
  if (!TOOL_ALLOWLIST.includes(toolName)) {
    throw new Error(`Tool is not allowed: ${String(toolName)}`);
  }
  const parsed = AgentDecisionSchema.safeParse(rawDecision);
  if (!parsed.success) {
    throw new Error(`Planner returned an invalid decision: ${formatZodError(parsed.error)}`);
  }
  return parsed.data;
}

// Grounding for calculate_annual_leakage: merchant AND amount must match a real finding.
function groundForCalculation(findings, args) {
  const claimed = Number(args.monthly_amount);
  const exact = findings.find(
    (f) => sameMerchant(f.merchant, args.merchant) && Math.abs(f.new_amount - claimed) <= 0.001,
  );
  return exact ?? findings[0] ?? null;
}

// Grounding for generate_cancellation_script: match by merchant.
function groundForDraft(findings, args) {
  return findings.find((f) => sameMerchant(f.merchant, args.merchant)) ?? findings[0] ?? null;
}

/**
 * Run a full audit. `transactions` and `goal` must already be validated.
 * Always returns the stored session (even when the audit fails).
 */
export async function runAudit({ transactions, goal, aiService, store }) {
  const session = {
    session_id: randomUUID(),
    status: 'analyzing',
    goal,
    findings: [],
    pending_action: null,
    audit_log: [],
    summary: '',
    steps: 0,
  };
  const toolResults = [];
  log(session, 'started', 'Audit started.', { transaction_count: transactions.length });

  try {
    while (session.steps < MAX_STEPS) {
      session.steps += 1;

      const rawDecision = await aiService.chooseNextStep(
        goal,
        structuredClone(session.findings),
        structuredClone(toolResults),
        [...TOOL_ALLOWLIST],
      );
      const decision = validateDecision(rawDecision);
      const { tool_name: tool, arguments: args } = decision;
      log(session, 'plan', decision.message || `Selected ${tool}.`, { tool, arguments: args });

      if (tool === TOOL_NAMES.FINISH) break;

      let result;
      if (tool === TOOL_NAMES.DETECT) {
        // Always runs on the request's transactions — never on planner arguments.
        result = detectStealthHikes(transactions);
        session.findings = result;
      } else if (tool === TOOL_NAMES.CALCULATE) {
        const finding = groundForCalculation(session.findings, args);
        result = finding
          ? calculateAnnualLeakage(finding.merchant, finding.new_amount)
          : { ...SKIPPED_RESULT };
      } else if (tool === TOOL_NAMES.DRAFT) {
        const finding = groundForDraft(session.findings, args);
        if (finding) {
          result = generateCancellationScript(finding.merchant, finding.old_amount, finding.new_amount);
          session.pending_action = {
            type: 'review_subscription_change',
            merchant: finding.merchant,
            old_amount: finding.old_amount,
            new_amount: finding.new_amount,
            change_pct: finding.change_pct,
            date: finding.date,
            annual_cost: round2(finding.new_amount * 12),
            monthly_increase: finding.monthly_increase,
            draft: result.draft,
            sent: false,
          };
        } else {
          result = { ...SKIPPED_RESULT };
        }
      } else {
        // Unreachable thanks to validateDecision, kept as a second line of defence.
        throw new Error(`Tool is not allowed: ${tool}`);
      }

      toolResults.push({ tool, result });
      const skipped = 'skipped' in result;
      log(session, 'tool', skipped ? `Skipped ${tool}: no price hike found.` : `Executed ${tool}.`, result);

      if (session.pending_action) {
        // Human-in-the-loop gate: stop here and wait for an explicit decision.
        session.status = 'awaiting_approval';
        session.summary = buildSummary(session.findings);
        log(session, 'approval_required', 'Draft ready. Waiting for human approval; nothing has been sent.', {
          merchant: session.pending_action.merchant,
        });
        return store.save(session);
      }
    }

    session.status = 'done';
    session.summary =
      buildSummary(session.findings) ||
      'Audit completed. No subscription price hikes above the threshold were found.';
    log(session, 'completed', 'Audit completed.', { steps: session.steps });
  } catch (error) {
    session.status = 'failed';
    session.pending_action = null;
    session.summary = `Audit stopped safely: ${error.message}`;
    log(session, 'error', `Audit stopped safely: ${error.message}`, {});
  }

  return store.save(session);
}

/** L10 — record a human decision. Approval is a LOCAL SIMULATION only. */
export function recordApproval({ store, sessionId, decision, reason }) {
  const session = store.get(sessionId);
  if (!session) {
    throw new HttpError(404, 'Audit session not found. Start a new audit.');
  }
  if (session.status !== 'awaiting_approval' || !session.pending_action) {
    throw new HttpError(409, 'This audit has no pending approval.');
  }

  const action = session.pending_action;
  if (decision === 'approve') {
    session.status = 'executing';
    // Nothing external happens here — by design there is no mail client, no
    // merchant/bank request and no payment call anywhere in this codebase.
    action.simulated_execution = 'Approved and recorded locally; no external message was sent.';
    action.approved = true;
    log(session, 'approved_simulation', 'Human approved. Action simulated locally; no message was sent.', {
      merchant: action.merchant,
      reason: reason ?? null,
    });
    session.status = 'done';
    session.summary += ' Demo action approved and simulated; no message was sent.';
  } else {
    action.approved = false;
    log(session, 'rejected', 'Human rejected the proposed action. Nothing was sent.', {
      merchant: action.merchant,
      reason: reason ?? null,
    });
    session.status = 'done';
    session.summary += ' Proposed action rejected; nothing was sent.';
  }

  action.sent = false; // always
  return store.save(session);
}
