import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { hasCapability } from 'common/storeCapabilities'
import type { GameInfo } from 'common/types'
import useSetting from 'frontend/hooks/useSetting'
import GameContext from '../../../GameContext'
import { toggleShortcuts } from '../../actions/shortcutsToggle'
import { cloudSavesPathMissing } from '../../actions/cloudSync'
import { useSteamShortcut } from '../../actions/useSteamShortcut'
import RunsForMeToggle from '../RunsForMeToggle'
import { SwitchRow } from './SwitchRow'

interface Props {
  gameInfo: GameInfo
  platform: string
}

/**
 * Phase 100 (D-01): the "Library & integration" group of the Install tab.
 * Shortcuts, Auto-sync saves and Show in Steam live here, with Runs for me first
 * on macOS. A game that is not installed shows Show in Steam alone; the group
 * renders only when a row applies.
 *
 * The switch flips from the backend's answer alone (`toggleShortcuts`), its
 * pending state pulses inside the row, and a failure shows fixed text with a
 * Retry link (D-12, D-18). The raw error only reaches the log.
 */
const IntegrationRows = ({ gameInfo, platform }: Props) => {
  const { t } = useTranslation('gamelib')
  const { app_name: appName, runner } = gameInfo
  const isInstalled = Boolean(gameInfo.is_installed)
  const { is } = useContext(GameContext)

  const [autoSyncSaves, setAutoSyncSaves] = useSetting('autoSyncSaves', false)
  const [savesPath] = useSetting('savesPath', '')
  const [gogSaves] = useSetting('gogSaves', [])

  const [hasShortcuts, setHasShortcuts] = useState(false)
  const [shortcutsBusy, setShortcutsBusy] = useState(false)
  const [shortcutsFailed, setShortcutsFailed] = useState(false)

  // Steam games are already in Steam; every other runner can be added as a
  // non-Steam shortcut, installed or not.
  const canShowInSteam = hasCapability(runner, 'canAddSteamShortcut')
  const { addedToSteam, steamRefresh, steamFailed, handleAddToSteam } =
    useSteamShortcut(appName, runner, canShowInSteam)

  useEffect(() => {
    if (!isInstalled) return
    let cancelled = false
    window.api
      .shortcutsExists(appName, runner)
      .then((exists) => {
        if (!cancelled) setHasShortcuts(exists)
      })
      .catch((error) => {
        window.api.logError(`shortcutsExists failed for ${appName}: ${error}`)
      })
    return () => {
      cancelled = true
    }
  }, [isInstalled, appName, runner])

  if (!isInstalled && !canShowInSteam) return null

  const handleShortcuts = () =>
    toggleShortcuts({
      hasShortcuts,
      appName,
      runner,
      setHasShortcuts,
      setBusy: setShortcutsBusy,
      setFailed: setShortcutsFailed
    })

  // What `addShortcut(appName, runner, true)` writes per OS: one .app in
  // ~/Applications on macOS, a Desktop and a Start Menu .lnk on Windows, a
  // Desktop and an applications .desktop on Linux.
  const shortcutsLabel =
    platform === 'darwin'
      ? t('gamepage.installTab.shortcuts.macLabel', 'Applications shortcut')
      : platform === 'win32'
        ? t(
            'gamepage.installTab.shortcuts.windowsLabel',
            'Desktop & Start menu shortcuts'
          )
        : t(
            'gamepage.installTab.shortcuts.linuxLabel',
            'Desktop & app menu shortcuts'
          )

  // D-03: Auto-sync is its own switch, not part of the Cloud saves row.
  const showAutoSync =
    hasCapability(runner, 'supportsCloudSaves') &&
    Boolean(gameInfo.cloud_save_enabled) &&
    !is.linuxNative
  const autoSyncNeedsFolder = cloudSavesPathMissing({
    runner,
    savesPath,
    gogSaves
  })

  const busyLabel = hasShortcuts
    ? t('gamepage.installTab.switch.removing', 'Removing…')
    : t('gamepage.installTab.switch.adding', 'Adding…')

  const steamBusyLabel = addedToSteam
    ? t('gamepage.installTab.switch.removing', 'Removing…')
    : t('gamepage.installTab.switch.adding', 'Adding…')

  const showInSteamRow = canShowInSteam && (
    <SwitchRow
      id="installTabShowInSteam"
      label={t('gamepage.installTab.showInSteam.label', 'Show in Steam')}
      description={t(
        'gamepage.installTab.showInSteam.description',
        'Adds a non-Steam shortcut, so the game appears in Big Picture and on Steam Deck.'
      )}
      checked={addedToSteam}
      busy={steamRefresh}
      busyLabel={steamBusyLabel}
      failure={
        steamFailed && !steamRefresh
          ? {
              message: t(
                'gamepage.installTab.showInSteam.failed',
                "Couldn't update the Steam shortcut. Details are in the log."
              ),
              retryLabel: t('gamepage.installTab.retry', 'Retry'),
              onRetry: handleAddToSteam
            }
          : undefined
      }
      onToggle={handleAddToSteam}
    />
  )

  return (
    <section className="installGroup">
      <h3 className="installGroup__title">
        {t('gamepage.installTab.libraryGroup', 'Library & integration')}
      </h3>
      {isInstalled && <RunsForMeToggle gameInfo={gameInfo} />}
      {isInstalled && showAutoSync && (
        <SwitchRow
          id="installTabAutoSync"
          label={t('gamepage.installTab.autoSync.label', 'Auto-sync saves')}
          description={t(
            'gamepage.installTab.autoSync.description',
            'Downloads your saves before you play and uploads them when you quit.'
          )}
          checked={autoSyncSaves}
          disabled={autoSyncNeedsFolder}
          disabledReason={
            autoSyncNeedsFolder
              ? t(
                  'gamepage.installTab.autoSync.needsFolder',
                  'Set a saves folder in ⚙ → Cloud Saves Sync first.'
                )
              : undefined
          }
          onToggle={() => setAutoSyncSaves(!autoSyncSaves)}
        />
      )}
      {isInstalled && (
        <SwitchRow
          id="installTabShortcuts"
          label={shortcutsLabel}
          description={t(
            'gamepage.installTab.shortcuts.description',
            'Opens the game without opening GameLib first.'
          )}
          checked={hasShortcuts}
          busy={shortcutsBusy}
          busyLabel={busyLabel}
          failure={
            shortcutsFailed && !shortcutsBusy
              ? {
                  message: t(
                    'gamepage.installTab.shortcuts.failed',
                    "Couldn't update the shortcuts. Details are in the log."
                  ),
                  retryLabel: t('gamepage.installTab.retry', 'Retry'),
                  onRetry: handleShortcuts
                }
              : undefined
          }
          onToggle={handleShortcuts}
        />
      )}
      {showInSteamRow}
    </section>
  )
}

export default IntegrationRows
