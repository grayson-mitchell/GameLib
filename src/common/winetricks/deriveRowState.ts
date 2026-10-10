import type { WinetricksQueueRun } from 'common/types'

// Phase 44 plan 01 introduced the row-state precedence; Phase 45 plan 05
// reshapes it for the checkbox model and the backend-owned install queue. Pure,
// no React, no i18n, no I/O -- unit-testable under the Common jest project's
// plain node environment.

// Six mutually-exclusive row states (D-10, D-13). `cached` is NOT a member: it
// is an orthogonal modifier carried on `WinetricksComponent` and rendered as a
// badge alongside whichever one of these applies. A verb that needs the
// interactive installer never reaches this function -- it is filtered out of
// the catalog by the backend (D-09, D-17).
//
// Exported because the row component imports it.
export type WinetricksRowState =
  | 'available'
  | 'selected'
  | 'queued'
  | 'installing'
  | 'installed'
  | 'errored'

// Per-verb error set. A plain readonly record (not a Set) so React state
// identity comparisons stay cheap and the value is trivially serialisable.
export type VerbErrorMap = Readonly<Record<string, true>>

/**
 * The row-state precedence function. Order is load-bearing and matches the
 * numbered rules below -- see `deriveRowState.test.ts` for a case per rule
 * that would pass under a wrong ordering.
 *
 * `run` is this game's queue run (or null). A tick means exactly one thing,
 * "will be installed" (D-10), so an installed row is never selectable.
 */
export function deriveRowState(input: {
  verb: string
  installed: readonly string[]
  selected: boolean
  run: Pick<WinetricksQueueRun, 'outcomes' | 'currentVerb' | 'status'> | null
  erroredVerbs: VerbErrorMap
}): WinetricksRowState {
  const { verb, installed, selected, run, erroredVerbs } = input
  const runIsLive = run !== null && run.status === 'running'

  // (1) The verb the live run is installing right now.
  if (runIsLive && run.currentVerb === verb) {
    return 'installing'
  }

  // (2) Already installed -- wins over a stale error flag, a queue entry and a
  // tick, so an installed row can never be selected again (D-10).
  if (installed.includes(verb)) {
    return 'installed'
  }

  // (3) Waiting its turn in the live run. A finished run never queues a row,
  // so a stale pending outcome cannot lock it (D-13).
  if (runIsLive && run.outcomes[verb] === 'pending') {
    return 'queued'
  }

  // (4) Flagged by a prior run's failed outcome.
  if (erroredVerbs[verb]) {
    return 'errored'
  }

  // (5) Ticked for the next batch.
  if (selected) {
    return 'selected'
  }

  // (6) Default.
  return 'available'
}

/**
 * Folds a queue run's per-verb outcomes into the error map (D-12). A `failed`
 * outcome flags the verb; an `installing` or `installed` outcome clears a
 * previous flag (a fresh attempt started or succeeded). Failure arrives as an
 * outcome the backend derives from the exit code, so nothing here inspects log
 * text.
 *
 * Returns `current` UNCHANGED (same object reference) for a null run and
 * whenever the fold changes nothing -- a fresh object on every queue push
 * would re-render all (potentially 567) rows for no reason.
 */
export function foldRunOutcomes(
  current: VerbErrorMap,
  run: Pick<WinetricksQueueRun, 'verbs' | 'outcomes'> | null
): VerbErrorMap {
  if (run === null) {
    return current
  }

  let next: Record<string, true> | null = null
  for (const verb of run.verbs) {
    const outcome = run.outcomes[verb]
    const flagged = (next ?? current)[verb] === true
    if (outcome === 'failed' && !flagged) {
      next = next ?? { ...current }
      next[verb] = true
    } else if (
      (outcome === 'installing' || outcome === 'installed') &&
      flagged
    ) {
      next = next ?? { ...current }
      delete next[verb]
    }
  }
  return next ?? current
}

/**
 * Clears a verb's error flag. Called when a fresh install attempt starts on
 * that verb (UI-SPEC row Errored: "Clears back to Available the moment a
 * new install attempt starts on that verb"). Returns `current` unchanged
 * when the verb was not flagged.
 */
export function clearVerbError(
  current: VerbErrorMap,
  verb: string
): VerbErrorMap {
  if (!current[verb]) {
    return current
  }

  const next = { ...current }
  delete next[verb]
  return next
}
