import type { Runner } from 'common/types'
import { hasCapability } from 'common/storeCapabilities'
import type { GameContextType } from 'frontend/types'

/**
 * Phase 100 (D-11): which Install-tab actions show, which are disabled and
 * why. Pure: it carries the show gates and disabled expressions the old
 * ⋮ menu held, so every row asks one place.
 *
 * D-11: while a long action runs, only the actions that conflict with it are
 * disabled (Verify, Modify, Set folder and Uninstall during a move); the ones
 * that do not (Open, Open prefix, Open saves folder, What's new) stay live.
 *
 * Phase 101 will flip the Steam Move/Verify gates here; today Steam hides
 * Move, Set folder and Update and shows Verify.
 */

export type InstallActionId =
  | 'open'
  | 'move'
  | 'setFolder'
  | 'modify'
  | 'verify'
  | 'update'
  | 'whatsNew'
  | 'openPrefix'
  | 'syncNow'
  | 'openSaves'
  | 'uninstall'
  | 'removeAllCopies'
  | 'locate'

export type GateReason =
  | 'uninstalling'
  | 'moving'
  | 'verifying'
  | 'updating'
  | 'installing'
  | 'settingFolder'
  | 'syncing'
  | 'launching'
  | 'playing'
  | 'queued'

export interface InstallActionGate {
  show: boolean
  disabled: boolean
  reason?: GateReason
}

export interface InstallActionGateInput {
  is: GameContextType['is']
  runner: Runner
  isInstalled: boolean
  isThirdPartyManaged: boolean
  isBrowserGame: boolean
  hasWinePrefix: boolean
  hasChangelog: boolean
  cloudSavesAvailable: boolean
  settingFolder?: boolean
}

/**
 * The highest-priority long action running for this game, if any:
 * uninstalling > moving > verifying > updating > installing > settingFolder >
 * syncing > launching > queued.
 */
export function activeLongAction(
  is: GameContextType['is'],
  isInstalled: boolean,
  settingFolder?: boolean
): GateReason | undefined {
  if (is.uninstalling) return 'uninstalling'
  if (is.moving) return 'moving'
  if (is.reparing) return 'verifying'
  if (is.updating) return 'updating'
  if (isInstalled && is.installing) return 'installing'
  if (settingFolder) return 'settingFolder'
  if (is.syncing) return 'syncing'
  if (is.launching) return 'launching'
  if (is.queued) return 'queued'
  return undefined
}

const live: InstallActionGate = { show: true, disabled: false }
const hidden: InstallActionGate = { show: false, disabled: false }

export function installActionGates({
  is,
  runner,
  isInstalled,
  isThirdPartyManaged,
  isBrowserGame,
  hasWinePrefix,
  hasChangelog,
  cloudSavesAvailable,
  settingFolder
}: InstallActionGateInput): Record<InstallActionId, InstallActionGate> {
  // The same two derivations the old ⋮ menu used.
  const isSideloaded = !hasCapability(runner, 'hasStoreCatalog')
  const isSteam = !hasCapability(runner, 'winePrefixToolsAvailable')

  const active = activeLongAction(is, isInstalled, settingFolder)

  /** Disabled by any long action, or by the game running. */
  const conflicting = (show: boolean): InstallActionGate => {
    if (!show) return hidden
    if (active) return { show, disabled: true, reason: active }
    if (is.playing) return { show, disabled: true, reason: 'playing' }
    return live
  }

  const managedStore =
    isInstalled && !isSideloaded && !isSteam && !isThirdPartyManaged

  let verify: InstallActionGate = hidden
  if (isInstalled && !isSideloaded && !isThirdPartyManaged) {
    if (active) {
      verify = { show: true, disabled: true, reason: active }
    } else if (isSteam && is.playing) {
      verify = { show: true, disabled: true, reason: 'playing' }
    } else {
      verify = live
    }
  }

  let locate: InstallActionGate = hidden
  if (!isInstalled && !isSteam) {
    if (is.installing || is.importing) {
      locate = { show: true, disabled: true, reason: 'installing' }
    } else if (is.queued) {
      locate = { show: true, disabled: true, reason: 'queued' }
    } else {
      locate = live
    }
  }

  const unaffected = (show: boolean): InstallActionGate =>
    show ? live : hidden

  return {
    open: unaffected(isInstalled && !isThirdPartyManaged && !isBrowserGame),
    move: conflicting(managedStore),
    setFolder: conflicting(managedStore),
    modify: conflicting(
      isInstalled &&
        hasCapability(runner, 'supportsModifyInstall') &&
        !isThirdPartyManaged
    ),
    verify,
    update: conflicting(managedStore),
    whatsNew: unaffected(!isSideloaded && hasChangelog),
    openPrefix: unaffected(isInstalled && hasWinePrefix && !isSteam),
    syncNow: conflicting(isInstalled && cloudSavesAvailable),
    openSaves: unaffected(isInstalled && cloudSavesAvailable),
    uninstall: conflicting(isInstalled),
    removeAllCopies: conflicting(isInstalled && isSteam),
    locate
  }
}
