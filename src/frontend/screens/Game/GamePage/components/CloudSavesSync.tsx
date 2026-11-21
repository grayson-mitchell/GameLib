import { useContext, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Menu, MenuItem } from '@mui/material'
import { hasCapability, isStore } from 'common/storeCapabilities'
import type { GameInfo, SyncType } from 'common/types'
import InfoIcon from 'frontend/components/UI/InfoIcon'
import useSetting from 'frontend/hooks/useSetting'
import { syncSaves } from 'frontend/helpers'
import useUiState from 'frontend/state/uiState'
import GameContext from '../../GameContext'
import {
  cloudSavesPathMissing,
  cloudSavesValue,
  executeCloudSync,
  needsForceConfirm
} from '../actions/cloudSync'
import type {
  InstallActionGate,
  InstallActionId
} from '../actions/installActionGates'
import { useRowAction } from '../actions/rowAction'
import { FactAction, FactRow } from './InstallTab/FactRow'
import { gateReasonText } from './InstallTab/gateReasonText'

interface Props {
  gameInfo: GameInfo
  gates: Record<InstallActionId, InstallActionGate>
}

/**
 * Phase 100 (D-03, D-21): the Cloud saves fact. Its value reads the state that
 * exists today (Syncing…, Auto-sync on, Manual or Unsupported), [Sync now ▾]
 * opens the four sync commands on click only, and [Open saves folder] opens the
 * folder. Force download and force upload keep their overwrite confirmation
 * (T-100-14). A sync the renderer sees reject shows fixed text under the row
 * with Retry instead of an error dialog (D-12, D-18); the raw error reaches
 * only the log.
 */
const CloudSavesSync = ({ gameInfo, gates }: Props) => {
  const { t } = useTranslation('gamelib')
  const { t: tCommon } = useTranslation()
  const { t: tGamepage } = useTranslation('gamepage')
  const { gameSettings, is } = useContext(GameContext)
  const showDialogModal = useUiState((s) => s.showDialogModal)
  const syncRow = useRowAction('syncSaves', gameInfo.app_name)

  const [autoSyncSaves] = useSetting('autoSyncSaves', false)
  const [savesPath] = useSetting('savesPath', '')
  const [gogSaves] = useSetting('gogSaves', [])

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [lastSyncType, setLastSyncType] = useState<SyncType | null>(null)

  if (!gameSettings) return null
  if (!gameInfo.is_installed) return null
  if (!hasCapability(gameInfo.runner, 'hasStoreCatalog')) return null
  if (!gameInfo.cloud_save_enabled) return null

  const { runner } = gameInfo
  const label = t('gamelib:gamepage.installTab.cloudSaves.label', 'Cloud saves')
  const supported = !is.linuxNative

  if (!supported) {
    return (
      <FactRow label={label} className="fact--withHelp">
        {tGamepage('cloud_save_unsupported', 'Unsupported')}
        <InfoIcon
          text={tGamepage(
            'help.cloud_save_unsupported',
            'This game does not support cloud saves. This information is provided by the game developers. Some games do implement their own cloud save system'
          )}
        />
      </FactRow>
    )
  }

  const isSyncing = syncRow.phase === 'busy' || is.syncing
  const value = cloudSavesValue({
    supported,
    isSyncing,
    autoSync: autoSyncSaves
  })
  const valueText = {
    unsupported: tGamepage('cloud_save_unsupported', 'Unsupported'),
    syncing: t('gamelib:gamepage.installTab.cloudSaves.syncing', 'Syncing…'),
    auto: t('gamelib:gamepage.installTab.cloudSaves.auto', 'Auto-sync on'),
    manual: t('gamelib:gamepage.installTab.cloudSaves.manual', 'Manual')
  }[value]

  const pathMissing = cloudSavesPathMissing({
    runner,
    savesPath,
    gogSaves
  })

  const reasonFor = (gate: InstallActionGate) =>
    gate.reason ? gateReasonText(gate.reason, t) : undefined

  const closeMenu = () => setAnchorEl(null)

  const runSync = (syncType: SyncType) => {
    setLastSyncType(syncType)
    return syncRow.run(() =>
      executeCloudSync({
        appName: gameInfo.app_name,
        runner,
        syncType,
        savesPath,
        gogSaves,
        syncSaves
      })
    )
  }

  const handleSync = (syncType: SyncType) => {
    closeMenu()
    if (needsForceConfirm(syncType)) {
      showDialogModal({
        title: tGamepage('box.warning.title', 'Warning'),
        message:
          (syncType as string) === '--force-upload'
            ? tGamepage(
                'box.sync.force_upload_warning',
                'Cloud saves will be overwritten. Do you want to proceed?'
              )
            : tGamepage(
                'box.sync.force_download_warning',
                'Local saves will be erased. Do you want to proceed?'
              ),
        buttons: [
          {
            text: tGamepage('box.yes'),
            onClick: () => runSync(syncType)
          },
          {
            text: tGamepage('box.no'),
            onClick: () => null // Close handled by dialog
          }
        ]
      })
      return
    }
    return runSync(syncType)
  }

  const handleOpenFolder = () => {
    if (isStore(runner, 'gog')) {
      gogSaves.forEach((save) => {
        window.api.openFolder(save.location)
      })
    } else {
      window.api.openFolder(savesPath)
    }
  }

  const syncCommands = [
    { name: tCommon('setting.manualsync.download'), value: '--skip-upload' },
    { name: tCommon('setting.manualsync.upload'), value: '--skip-download' },
    {
      name: tCommon('setting.manualsync.forcedownload'),
      value: '--force-download'
    },
    { name: tCommon('setting.manualsync.forceupload'), value: '--force-upload' }
  ]

  return (
    <>
      <FactRow
        label={label}
        failure={
          syncRow.phase === 'failed'
            ? {
                message: t(
                  'gamelib:gamepage.installTab.cloudSaves.failed',
                  'Syncing saves failed. Details are in the log.'
                ),
                retryLabel: t('gamelib:gamepage.installTab.retry', 'Retry'),
                onRetry: () => {
                  if (lastSyncType) handleSync(lastSyncType)
                }
              }
            : undefined
        }
        actions={
          <>
            {gates.syncNow.show && (
              <FactAction
                label={t(
                  'gamelib:gamepage.installTab.cloudSaves.syncNow',
                  'Sync now ▾'
                )}
                busy={isSyncing}
                busyLabel={t(
                  'gamelib:gamepage.installTab.cloudSaves.syncing',
                  'Syncing…'
                )}
                disabled={gates.syncNow.disabled || pathMissing}
                disabledReason={
                  reasonFor(gates.syncNow) ??
                  (pathMissing
                    ? t(
                        'gamelib:gamepage.installTab.cloudSaves.needsFolder',
                        'Set a saves folder in ⚙ → Cloud Saves Sync first.'
                      )
                    : undefined)
                }
                onClick={(event) => setAnchorEl(event.currentTarget)}
              />
            )}
            {gates.openSaves.show && (
              <FactAction
                label={t(
                  'gamelib:gamepage.installTab.cloudSaves.openFolder',
                  'Open saves folder'
                )}
                disabled={gates.openSaves.disabled || pathMissing}
                disabledReason={
                  pathMissing
                    ? t(
                        'gamelib:gamepage.installTab.cloudSaves.needsFolder',
                        'Set a saves folder in ⚙ → Cloud Saves Sync first.'
                      )
                    : reasonFor(gates.openSaves)
                }
                onClick={handleOpenFolder}
              />
            )}
          </>
        }
      >
        {valueText}
      </FactRow>
      <Menu
        id="cloudSavesSyncMenu"
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        {syncCommands.map((command) => (
          <MenuItem
            key={command.value}
            divider={command.value === '--skip-download'}
            onClick={() => handleSync(command.value as SyncType)}
            disabled={pathMissing || isSyncing}
          >
            {command.name}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}

export default CloudSavesSync
