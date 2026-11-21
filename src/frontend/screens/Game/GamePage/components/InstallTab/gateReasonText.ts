import type { TFunction } from 'i18next'
import type { GateReason } from '../../actions/installActionGates'

/**
 * Phase 100 (D-11): the tooltip a disabled Install-tab action carries. One
 * literal `t()` call per reason (the GameStatus `waitingCauseText` idiom) so
 * the key parser and the hard-coded-string gate see each key beside its
 * default.
 */
export function gateReasonText(reason: GateReason, t: TFunction): string {
  switch (reason) {
    case 'moving':
      return t(
        'gamelib:gamepage.installTab.reason.moving',
        'Wait for the move to finish'
      )
    case 'verifying':
      return t(
        'gamelib:gamepage.installTab.reason.verifying',
        'Wait for the verify to finish'
      )
    case 'updating':
      return t(
        'gamelib:gamepage.installTab.reason.updating',
        'Wait for the update to finish'
      )
    case 'installing':
      return t(
        'gamelib:gamepage.installTab.reason.installing',
        'Wait for the install to finish'
      )
    case 'settingFolder':
      return t(
        'gamelib:gamepage.installTab.reason.settingFolder',
        'Wait for the folder change to finish'
      )
    case 'syncing':
      return t(
        'gamelib:gamepage.installTab.reason.syncing',
        'Wait for the save sync to finish'
      )
    case 'launching':
      return t(
        'gamelib:gamepage.installTab.reason.launching',
        'Wait for the game to start'
      )
    case 'playing':
      return t(
        'gamelib:gamepage.installTab.reason.playing',
        'Quit the game first'
      )
    case 'queued':
      return t(
        'gamelib:gamepage.installTab.reason.queued',
        'Wait for the queued download'
      )
    case 'uninstalling':
      return t(
        'gamelib:gamepage.installTab.reason.uninstalling',
        'Wait for the uninstall to finish'
      )
  }
}
