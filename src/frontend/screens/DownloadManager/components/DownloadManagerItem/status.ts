// D-UAT-06: a genuine (non-cancel) install/update failure was previously
// rendered identically to a user cancel/abort — "(Canceled)" label, X-remove
// only, no way to retry. Extracted as a pure, hook-free function so it's
// directly unit-testable (this project has no jsdom/react-test-renderer —
// see sibling components' __tests__ for the established pattern of testing
// classification logic in isolation rather than invoking hook-using
// components as plain functions).
//
// Scoped to runner === 'steam' only: gog/epic/amazon keep their existing
// merged error+cancel "(Canceled)" treatment byte-for-byte unchanged
// (D-UAT-06 acceptance: "Do NOT regress GOG/Epic/Amazon").

import { DMStatus, Runner } from 'common/types'

export interface DMItemStatusInfo {
  finished: boolean
  /** True only for a genuine, non-cancel Steam install/update failure. Never
   *  true for an abort (user cancel) — and never true for any other runner. */
  isSteamError: boolean
  /** True for a genuine cancel/abort — or, for every non-steam runner, ALSO
   *  true for a plain error (unchanged legacy behavior, preserved for
   *  gog/epic/amazon parity). */
  canceled: boolean
  /** D-UAT-08: a finished Steam error item needs its OWN, separate remove
   *  affordance — the main-action button for isSteamError is Retry-only (it
   *  re-enqueues via window.api.install/updateGame), so without this a
   *  finished-failed Steam item could never be dismissed without also
   *  re-triggering the install. True only for a non-current (i.e. finished)
   *  Steam error — never for gog/epic/amazon, which keep dismissing a failed
   *  item via the shared "canceled" main-action click, unchanged. */
  showRemoveAction: boolean
}

export function classifyDMItemStatus(
  status: DMStatus | undefined,
  runner: Runner,
  current: boolean
): DMItemStatusInfo {
  const finished = status === 'done'
  const isSteamError = runner === 'steam' && status === 'error'
  const canceled =
    !isSteamError && (status === 'error' || (status === 'abort' && !current))
  const showRemoveAction = isSteamError && !current

  return { finished, isSteamError, canceled, showRemoveAction }
}
