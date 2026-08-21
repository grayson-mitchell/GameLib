/**
 * Metadata-override handler body (Phase 34.2, D-01/D-03/D-08).
 *
 * Backs `main.ts`'s `addListener('setGameMetadataOverride', ...)`
 * registration with a byte-identical body, extracted so the Node sidecar can
 * import the same behavior the Electron build runs (single source of
 * truth). `main.ts` keeps the registration line as a one-line delegation to
 * this export.
 *
 * The other two override channels, `getGameMetadataOverride` and
 * `getAllGameOverrides`, are NOT extracted -- this is deliberate. Their
 * `main.ts` handlers are already bare pass-throughs to
 * `game_overrides/index.ts`'s clean exports, so there is no body to move --
 * the sidecar registration (plan 34.2-04) imports `getGameOverrides`/
 * `getAllGameOverrides` from `../game_overrides` directly. 19-channel
 * reconciliation for this slice: 15 in `dispatch.ts` + 1 here + 2
 * already-clean pass-throughs + 1 (`getKnownFixes`, plan 34.2-03's
 * `knownFixes.ts`) = 19.
 *
 * `sendFrontendMessage` is exported from `backend/ipc.ts`, which imports the
 * real `electron` -- so this module cannot import it directly. The
 * `metadataChanged` push is resolved via dependency injection instead of a
 * second implementation: `setMetadataChangedNotifier` installs the push
 * function at runtime. `main.ts` installs a `sendFrontendMessage`-backed
 * notifier at import time, producing the byte-identical
 * `sendFrontendMessage('metadataChanged', getAllGameOverrides())` call it
 * replaces. The sidecar's registration module (plan 34.2-04) installs one
 * backed by `electronStub`'s own relay, riding the EXISTING generic
 * `frontend_message` relay -- zero new Rust arms expected (the Phase 29
 * `storeChanged` precedent); if new Rust work seems necessary, stop and ask
 * why.
 *
 * MUST NOT import `electron` (or anything that transitively reaches it) --
 * including `backend/ipc`.
 */

import { getAllGameOverrides, setGameOverrides } from '../game_overrides'
import type { GameMetadataOverride } from '../game_overrides/electronStores'
import { logWarning, LogPrefix } from '../logger'

type MetadataChangedNotifier = (
  overrides: Record<string, GameMetadataOverride>
) => void

let hasWarnedNoNotifier = false

let metadataChangedNotifier: MetadataChangedNotifier = () => {
  if (!hasWarnedNoNotifier) {
    hasWarnedNoNotifier = true
    logWarning(
      'setGameMetadataOverride: no metadataChanged notifier installed -- the ' +
        'store write succeeded but no frontend push was sent. Call ' +
        'setMetadataChangedNotifier() at startup to install one.',
      LogPrefix.Backend
    )
  }
}

/**
 * Installs the function that pushes `metadataChanged` to the frontend.
 * `main.ts` installs a `sendFrontendMessage`-backed notifier at module
 * scope; the sidecar registration module installs one backed by
 * `electronStub`'s own relay.
 */
export function setMetadataChangedNotifier(fn: MetadataChangedNotifier): void {
  metadataChangedNotifier = fn
}

export function setGameMetadataOverride(args: {
  appName: string
  title?: string
  art_cover?: string
  art_square?: string
}): void {
  const { appName, title, art_cover, art_square } = args
  setGameOverrides(appName, { title, art_cover, art_square })
  metadataChangedNotifier(getAllGameOverrides())
}
