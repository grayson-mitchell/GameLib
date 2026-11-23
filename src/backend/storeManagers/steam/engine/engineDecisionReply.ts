/**
 * Narrowing of the engine decision replies the Steam bridge gets from Rust (Phase 87, 87-54).
 *
 * The shims in `enginewine/decision.ts` resolve `unknown` (their body is one returned typed call, D-06), so each call
 * site narrows the reply here instead of casting. Rust encodes the TS `LaunchDecision`, `CreationDecision` and
 * `CrossoverPreflight` shapes exactly (pinned by the crate's own tests); a reply that is not one of them is a defect on
 * the other side of the wire, so it throws rather than letting a launch run on a guess.
 */
import type {
  CreationDecision,
  CrossoverPreflight,
  LaunchDecision
} from 'backend/enginewine/decision'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function malformed(what: string, reply: unknown): Error {
  return new Error(
    `engine ${what} reply was not understood: ${
      isRecord(reply) ? `kind ${String(reply.kind)}` : typeof reply
    }`
  )
}

const PREFLIGHT_KINDS: readonly string[] = [
  'healthy',
  'expired',
  'broken',
  'missing'
]

/** The CrossOver pre-flight Rust answered. */
export function preflightFrom(reply: unknown): CrossoverPreflight {
  if (!isRecord(reply) || !PREFLIGHT_KINDS.includes(String(reply.kind))) {
    throw malformed('pre-flight', reply)
  }
  return reply as CrossoverPreflight
}

/** The launch decision Rust answered. */
export function launchDecisionFrom(reply: unknown): LaunchDecision {
  if (!isRecord(reply)) throw malformed('launch decision', reply)
  if (reply.kind === 'unavailable') {
    return reply as LaunchDecision
  }
  if (
    reply.kind !== 'use' ||
    !isRecord(reply.selection) ||
    !Array.isArray(reply.logLines)
  ) {
    throw malformed('launch decision', reply)
  }
  return reply as LaunchDecision
}

/** The creation decision Rust answered (the op wraps it with the create cap, which the decision already carries). */
export function creationDecisionFrom(reply: unknown): CreationDecision {
  const decision = isRecord(reply) ? reply.decision : undefined
  if (
    !isRecord(decision) ||
    (decision.kind !== 'crossover' && decision.kind !== 'pinned')
  ) {
    throw malformed('creation decision', reply)
  }
  return decision as CreationDecision
}
