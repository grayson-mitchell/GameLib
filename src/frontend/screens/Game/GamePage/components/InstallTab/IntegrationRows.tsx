import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GameInfo } from 'common/types'
import { toggleShortcuts } from '../../../GameSubMenu/shortcutsToggle'
import { SwitchRow } from './SwitchRow'

interface Props {
  gameInfo: GameInfo
  platform: string
}

/**
 * Phase 100 (D-01): the "Library & integration" group of the Install tab.
 * Plan 01 carries only the shortcuts switch; later plans add Runs for me and
 * Show in Steam here. The group renders only when a row applies.
 *
 * The switch flips from the backend's answer alone (`toggleShortcuts`), its
 * pending state pulses inside the row, and a failure shows fixed text with a
 * Retry link (D-12, D-18). The raw error only reaches the log.
 */
const IntegrationRows = ({ gameInfo, platform }: Props) => {
  const { t } = useTranslation('gamelib')
  const { app_name: appName, runner } = gameInfo
  const isInstalled = Boolean(gameInfo.is_installed)

  const [hasShortcuts, setHasShortcuts] = useState(false)
  const [shortcutsBusy, setShortcutsBusy] = useState(false)
  const [shortcutsFailed, setShortcutsFailed] = useState(false)

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

  if (!isInstalled) return null

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

  const busyLabel = hasShortcuts
    ? t('gamepage.installTab.switch.removing', 'Removing…')
    : t('gamepage.installTab.switch.adding', 'Adding…')

  return (
    <section className="installGroup">
      <h3 className="installGroup__title">
        {t('gamepage.installTab.libraryGroup', 'Library & integration')}
      </h3>
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
    </section>
  )
}

export default IntegrationRows
