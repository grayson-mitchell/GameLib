/**
 * Phase 82 (FND-02, D-06): the ONE place the sidecar talks to the gamelib-safety crate. Every
 * destructive call site goes through `checkRemoval` / `guardedRemoveTree`; this is the only module
 * that contains a catch around a safety rustInvoke, so call sites never add their own and cannot
 * fail open. A rejected, timed-out or malformed reply reads as `unknown` (check) or `failed`
 * (remove), never as permission.
 *
 * Exit contract: no timers, no handles, no work at import, no module-level mutable state.
 */
import { z } from 'zod'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import {
  SAFETY_REASONS,
  SAFETY_VERDICTS,
  type RemovalReason,
  type SafetyItem,
  type SafetyOutcome,
  type SafetyRemoveReply,
  type SafetyReply,
  type SafetyRequest,
  type SafetyVerdict
} from 'common/types/safety'
import {
  RUST_SAFETY_CHECK_REMOVAL,
  RUST_SAFETY_REMOVE_TREE,
  type RustSafetyChannel
} from 'common/types/sidecarTransport'

const itemSchema = z.object({
  id: z.string(),
  verdict: z.enum(SAFETY_VERDICTS),
  reason: z.enum(SAFETY_REASONS),
  otherKey: z.string().optional(),
  isLink: z.boolean(),
  absent: z.boolean()
})

const replySchema = z.object({
  overall: z.enum(SAFETY_VERDICTS),
  items: z.array(itemSchema)
})

const removeReplySchema = replySchema.extend({
  outcome: z.enum(['refused', 'removed', 'failed'])
})

type AdapterFailure = Extract<RemovalReason, 'rust-invoke-failed' | 'bad-reply'>

/** Kleene AND, the same fold the crate applies: `no` beats `unknown`, everything else needs all `yes`. */
function foldVerdicts(
  items: readonly { verdict: SafetyVerdict }[]
): SafetyVerdict {
  let out: SafetyVerdict = 'yes'
  for (const { verdict } of items) {
    if (verdict === 'no') return 'no'
    if (verdict === 'unknown') out = 'unknown'
  }
  return out
}

/**
 * A reply is trusted only when it answers the request it was asked: one item per target in order
 * and an `overall` equal to the fold of its items. Anything else reads as `bad-reply`.
 */
function answersRequest(
  req: SafetyRequest,
  reply: { overall: SafetyVerdict; items: readonly SafetyItem[] }
): boolean {
  if (reply.items.length !== req.targets.length) return false
  if (!req.targets.every((t, i) => reply.items[i]?.id === t.id)) return false
  return foldVerdicts(reply.items) === reply.overall
}

function failedReply(req: SafetyRequest, reason: AdapterFailure): SafetyReply {
  return {
    overall: 'unknown',
    items: req.targets.map((t) => ({
      id: t.id,
      verdict: 'unknown',
      reason,
      isLink: false,
      absent: false
    }))
  }
}

type Invoked =
  | { ok: true; raw: unknown }
  | { ok: false; reason: 'rust-invoke-failed' }

/** The single catch: a rejection or timeout of the safety rustInvoke becomes a typed failure. */
async function invokeSafety(
  deps: RustInvokeDeps,
  channel: RustSafetyChannel,
  req: SafetyRequest
): Promise<Invoked> {
  try {
    return { ok: true, raw: await deps.requestRustInvoke(channel, [req]) }
  } catch {
    return { ok: false, reason: 'rust-invoke-failed' }
  }
}

/** Read-only. Overall `yes` is the only answer that permits a destructive op. */
export async function checkRemoval(
  deps: RustInvokeDeps,
  req: SafetyRequest
): Promise<SafetyReply> {
  const res = await invokeSafety(deps, RUST_SAFETY_CHECK_REMOVAL, req)
  if (!res.ok) return failedReply(req, res.reason)
  const parsed = replySchema.safeParse(res.raw)
  if (!parsed.success || !answersRequest(req, parsed.data)) {
    return failedReply(req, 'bad-reply')
  }
  return parsed.data
}

/**
 * Re-checks and deletes inside the Rust call (D-14). A rejection or malformed reply is outcome
 * `failed`: the delete's effect is unconfirmed, so callers keep their state and must not claim
 * nothing was deleted.
 */
export async function removeTree(
  deps: RustInvokeDeps,
  req: SafetyRequest
): Promise<SafetyRemoveReply> {
  const res = await invokeSafety(deps, RUST_SAFETY_REMOVE_TREE, req)
  if (!res.ok) return { ...failedReply(req, res.reason), outcome: 'failed' }
  const parsed = removeReplySchema.safeParse(res.raw)
  if (
    !parsed.success ||
    !answersRequest(req, parsed.data) ||
    // The outcome must agree with the verdict: a removal needs `yes`, a refusal needs not-`yes`.
    (parsed.data.outcome === 'removed' && parsed.data.overall !== 'yes') ||
    (parsed.data.outcome === 'refused' && parsed.data.overall === 'yes')
  ) {
    return { ...failedReply(req, 'bad-reply'), outcome: 'failed' }
  }
  return parsed.data
}

/** The first item that is not `yes`, which is the one a refusal notice names. */
export function firstBlockingItem(reply: SafetyReply): SafetyItem | undefined {
  return reply.items.find((i) => i.verdict !== 'yes')
}

export interface GuardedRemoval {
  outcome: SafetyOutcome
  /** The first blocking item's reason, when there is one. */
  reason?: RemovalReason
  /** The other game's key on `nested-known-install` / `inside-known-install`. */
  otherKey?: string
  reply: SafetyRemoveReply
}

/**
 * Check first, then delete only on an overall `yes`. `refused` means nothing was attempted;
 * `failed` means a delete ran and its effect is not confirmed clean.
 */
export async function guardedRemoveTree(
  deps: RustInvokeDeps,
  req: SafetyRequest
): Promise<GuardedRemoval> {
  const check = await checkRemoval(deps, req)
  if (check.overall !== 'yes') {
    return blocked('refused', { ...check, outcome: 'refused' })
  }
  const removed = await removeTree(deps, req)
  return blocked(removed.outcome, removed)
}

function blocked(
  outcome: SafetyOutcome,
  reply: SafetyRemoveReply
): GuardedRemoval {
  const item = firstBlockingItem(reply)
  return {
    outcome,
    ...(item ? { reason: item.reason } : {}),
    ...(item?.otherKey !== undefined ? { otherKey: item.otherKey } : {}),
    reply
  }
}
