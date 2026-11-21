import type { Runner } from 'common/types'
import { hasCapability } from 'common/storeCapabilities'
import { showSteamMainButtonInstallOptions } from 'frontend/helpers/steamInstallOptionsEntry'

/**
 * Phase 100 (D-20): the footer Install button keeps opening the install modal;
 * its ▾ carries the one secondary door for the game's store.
 *
 * - Steam: "Install with options…" (the existing predicate, unchanged).
 * - Every other store, plus sideloaded and third-party-managed games:
 *   "Locate existing installation…". Those last two never reach DownloadDialog,
 *   so this is their only import door — the ▾ is deliberately NOT gated on the
 *   install button being disabled (`installDisabled` is true for an unsupported
 *   third-party game), mirroring the old ⋮ menu's gate.
 *
 * The ▾ is unmounted, not disabled, while the game is installing, importing or
 * queued (WR-14 / S4: Dropdown has no disabled prop, so unmounting is the only
 * way to take it out of the focus ring).
 */
export type InstallCaretItem = 'steamOptions' | 'locate'

export interface InstallCaretState {
  runner: Runner
  isInstalled: boolean
  isQueued: boolean
  isInstalling: boolean
  isImporting: boolean
  isDelisted: boolean
  installDisabled: boolean
}

export function installCaretItem({
  runner,
  isInstalled,
  isQueued,
  isInstalling,
  isImporting,
  isDelisted,
  installDisabled
}: InstallCaretState): InstallCaretItem | null {
  if (
    showSteamMainButtonInstallOptions({
      runner,
      isInstalled,
      isQueued,
      isDelisted,
      installDisabled
    })
  ) {
    return 'steamOptions'
  }
  if (
    !isInstalled &&
    !isQueued &&
    !isInstalling &&
    !isImporting &&
    hasCapability(runner, 'winePrefixToolsAvailable')
  ) {
    return 'locate'
  }
  return null
}
