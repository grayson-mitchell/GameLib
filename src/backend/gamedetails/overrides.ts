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
 * `getAllGameOverrides`, are native `info` channels served by Rust since
 * Phase 86 (86-10) and have no sidecar body. The write goes to Rust too
 * (86-11, `../info/gameOverrides`): the store write, the cleanup of the
 * game's stored images and the log lines' boolean all come from the
 * `info_overrides_set` op. 19-channel reconciliation for this slice: 15 in
 * `dispatch.ts` + 1 here + 2 native + 1 (`getKnownFixes`, plan 34.2-03's
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
 * backed by `platformApi`'s own relay, riding the EXISTING generic
 * `frontend_message` relay -- zero new Rust arms expected (the Phase 29
 * `storeChanged` precedent); if new Rust work seems necessary, stop and ask
 * why.
 *
 * MUST NOT import `electron` (or anything that transitively reaches it) --
 * including `backend/ipc`.
 */

import type { MetadataOverride } from 'common/types/ipc/gameDetails'
import type { RustInvokeDeps } from '../host/rustInvokeDeps'
import { getAllGameOverrides, setGameOverrides } from '../info/gameOverrides'
import { logError, logInfo, logWarning, LogPrefix } from '../logger'
import type { MiscRuntimeSlice } from '../miscRuntime'

const logPrefix: LogPrefix = 'GameOverrides'

export type MetadataChangedNotifier = (
  overrides: Record<string, MetadataOverride>
) => void

export interface MetadataOverrides {
  /** Pushes the changed overrides to the frontend through the notifier given at construction. */
  notifyChanged(overrides: Record<string, MetadataOverride>): void
}

/**
 * The `metadataChanged` push of one boot (66.4-18, D-05). The notifier is a constructor dependency:
 * the boot builds it over its own push, so nothing installs it late. Built with none (a test that
 * does not observe the push), the write still succeeds and a single warning per instance says no
 * push was sent.
 */
export function createMetadataOverrides(deps: {
  notify?: MetadataChangedNotifier
}): MetadataOverrides {
  let hasWarnedNoNotifier = false
  return {
    notifyChanged(overrides) {
      if (deps.notify) {
        deps.notify(overrides)
        return
      }
      if (!hasWarnedNoNotifier) {
        hasWarnedNoNotifier = true
        logWarning(
          'setGameMetadataOverride: no metadataChanged notifier was given -- the ' +
            'store write succeeded but no frontend push was sent.',
          LogPrefix.Backend
        )
      }
    }
  }
}

export async function setGameMetadataOverride(
  deps: RustInvokeDeps & MiscRuntimeSlice<'metadataOverrides'>,
  args: {
    appName: string
    title?: string
    art_cover?: string
    art_square?: string
  }
): Promise<void> {
  const { appName, title, art_cover, art_square } = args
  // The crate has no logger: it resolves the boolean the TS write returned, and the two log lines
  // the TS write wrote come from it here.
  const saved = await setGameOverrides(deps, appName, {
    title,
    art_cover,
    art_square
  })
  if (saved === true) {
    logInfo(`Saved overrides for ${appName}`, logPrefix)
  } else {
    logError(`Failed to save overrides for ${appName}`, logPrefix)
  }
  deps.miscRuntime.metadataOverrides.notifyChanged(
    (await getAllGameOverrides(deps)) as Record<string, MetadataOverride>
  )
}
