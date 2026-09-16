import { NEEDS_GUI_WINETRICKS_VERBS } from './verbs'

// Phase 44, plan 01. Pure row-state precedence + per-verb error attribution
// for the Winetricks Browse UI. No React, no i18n, no I/O -- unit-testable
// under the Common jest project's plain node environment.

// Six mutually-exclusive action-slot states. The UI-SPEC's seventh row
// variant, "Available + Cached", is DELIBERATELY NOT a member here: `cached`
// is an orthogonal modifier carried on `WinetricksComponent` and rendered as
// a badge alongside whichever one of these six states applies. Do not add a
// seventh member for it.
export type WinetricksRowState =
  | 'available'
  | 'installing'
  | 'installingElsewhere'
  | 'installed'
  | 'needsGui'
  | 'errored'

// Per-verb error set. A plain readonly record (not a Set) so React state
// identity comparisons stay cheap and the value is trivially serialisable.
export type VerbErrorMap = Readonly<Record<string, true>>

/**
 * The row-state precedence function. Order is load-bearing and matches the
 * ordinals below -- see `deriveRowState.test.ts` for a case per rule that
 * would pass under a wrong ordering.
 */
export function deriveRowState(input: {
  verb: string
  installed: readonly string[]
  installing: boolean
  installingComponent: string
  erroredVerbs: VerbErrorMap
}): WinetricksRowState {
  const { verb, installed, installing, installingComponent, erroredVerbs } =
    input

  // (1) C-4 / ROADMAP fence 3: unconditional, wins over every other state --
  // a Needs-GUI verb must never show an Install affordance regardless of
  // installing/installed/errored status.
  if (NEEDS_GUI_WINETRICKS_VERBS.has(verb)) {
    return 'needsGui'
  }

  // (2) This verb is the one currently installing.
  if (installing && installingComponent === verb) {
    return 'installing'
  }

  // (3) Already installed -- wins over a stale error flag from a prior run.
  if (installed.includes(verb)) {
    return 'installed'
  }

  // (4) Flagged by a prior attempt's error attribution.
  if (erroredVerbs[verb]) {
    return 'errored'
  }

  // (5) Some OTHER verb is installing right now.
  if (installing) {
    return 'installingElsewhere'
  }

  // (6) Default.
  return 'available'
}

/**
 * The correlation function RESEARCH Pitfall 2 identifies as unowned:
 * nothing in this repo today attributes a progress log line to the verb
 * that produced it. `ProgressDialog/index.tsx:68-91` classifies lines for
 * CSS colour only, in one flat shared log, with no per-verb attribution.
 * `payload.installingComponent` is the correlation key that makes
 * attribution possible here.
 *
 * Returns `current` UNCHANGED (same object reference) when there is no verb
 * to attribute to, when no message matches, or when the verb is already
 * flagged -- a fresh object on every progress event would re-render all
 * (potentially 567) rows for no reason.
 */
export function attributeProgressEvent(
  current: VerbErrorMap,
  payload: { messages: string[]; installingComponent: string }
): VerbErrorMap {
  const { installingComponent, messages } = payload

  if (installingComponent === '') {
    return current
  }

  if (current[installingComponent]) {
    return current
  }

  // Borrowed verbatim from ProgressDialog/index.tsx:68-91 for the string
  // test only -- including its exact looseness (a leading-space substring
  // match, not a word boundary). Do not tighten this independently of that
  // file; they are meant to agree on what counts as an error line.
  const hasError = messages.some((message) =>
    message.toLowerCase().includes(' err')
  )

  if (!hasError) {
    return current
  }

  return { ...current, [installingComponent]: true }
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
