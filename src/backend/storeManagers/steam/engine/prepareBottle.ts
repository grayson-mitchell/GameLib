/**
 * The caller-side half of the bottle switch (Phase 87, 87-42, D-03): the engine switch itself is Rust's
 * (`enginewine/bottles.ts` `prepareBottleForEngine`, one typed call). Everything that cannot be one value crosses
 * here, once, for every caller (the Steam launch, the DRM launch, the install's redist step and the still-TS
 * non-Steam launch):
 *
 * - **The pin download.** Rust downloads no engine yet. A restore to CrossOver whose DXVK source is the pinned engine
 *   answers `dxvk-failed` ("no DXVK source to restore") before it stops, installs or writes anything, so the bottle
 *   and its marker are exactly as they were. When the caller supplied `ensurePinEngine` (the TS download, with its
 *   progress report), it runs here and the call is made once more, which is where the TS switch resolved its restore
 *   source. Without one the refusal stands.
 * - **The status update.** `onSwitching` ran inside the TS switch before the first stop; the reply's `changed` tells
 *   the caller a real change happened, so it runs once after a real change (late, but the same one status).
 * - **The selection view.** The reply's `selection` is what Rust registered; the sync reads see it through the view.
 */
import type { GameSettings } from 'common/types'
import { prepareBottleForEngine } from 'backend/enginewine/bottles'
import type {
  PrepareBottleReply,
  PrepareBottleRequest
} from 'backend/enginewine/bottles'
import { engineSelectionView } from 'backend/enginewine/selectionView'
import {
  readBottleEngineMarkerSummary,
  ENGINE_PINS,
  pinById
} from 'backend/enginewine/twin'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import type { AppPaths } from 'backend/process/context'
import type { EnginePin, NonCrossoverEngine } from 'common/types/engine'
import { pinnedEngineReader } from './pinnedEngine'

/** The result the callers branch on: the TS `PrepareResult`. */
export type PrepareOutcome =
  | { ok: true; changed: boolean }
  | Extract<PrepareBottleReply, { ok: false }>

export interface PrepareBottleCall extends PrepareBottleRequest {
  /** Makes a pinned engine available (downloads it when absent); null when that fails. */
  ensurePinEngine?: (pin: EnginePin) => Promise<NonCrossoverEngine | null>
  /** Called once after a real engine change. */
  onSwitching?: () => void
  /** The settings values for the CrossOver restore are the caller's; nothing here reads a game. */
  crossoverSettings?: GameSettings
}

/** Detail Rust answers a restore whose DXVK source is missing (the switch refuses before any stop). */
const NO_RESTORE_SOURCE = /^no DXVK source to restore/

export async function prepareBottle(
  services: {
    paths: Pick<AppPaths, 'userHome' | 'toolsPath'>
  } & RustInvokeDeps,
  call: PrepareBottleCall
): Promise<PrepareOutcome> {
  const { ensurePinEngine, onSwitching, ...request } = call
  const deps: RustInvokeDeps = {
    requestRustInvoke: services.requestRustInvoke
  }
  const send = async (): Promise<PrepareBottleReply> =>
    (await prepareBottleForEngine(deps, {
      ...request,
      registerSelection: true
    })) as PrepareBottleReply

  let reply = await send()
  if (
    !reply.ok &&
    reply.reason === 'dxvk-failed' &&
    NO_RESTORE_SOURCE.test(reply.detail) &&
    ensurePinEngine &&
    request.next.kind === 'crossover'
  ) {
    const marker = readBottleEngineMarkerSummary(
      { paths: services.paths, fallback: pinnedEngineReader(services.paths) },
      request.bottleName
    )
    const pin =
      (marker?.pinId ? pinById(marker.pinId) : null) ?? ENGINE_PINS.current
    await ensurePinEngine(pin)
    reply = await send()
  }
  if (!reply.ok) return reply
  if (reply.selection) engineSelectionView.apply(request.key, reply.selection)
  if (reply.changed) onSwitching?.()
  return { ok: true, changed: reply.changed }
}
