import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader } from '../Dialog'
import type { AppManagementStatus } from 'common/types'
import { appManagementView } from './welcomeState'
import './index.scss'

const CROSSOVER_URL = 'https://www.codeweavers.com/crossover'

type Props = {
  onClose: () => void
  platform: NodeJS.Platform | 'unknown'
}

/**
 * First-run welcome (quick 261026-b9r). Replaces the changelog on the first
 * ever launch only. Three parts: log into your stores; macOS: Windows games
 * need CrossOver (support CodeWeavers); macOS with CrossOver installed: grant
 * App Management. Never claims GameLib installs or sets up CrossOver.
 */
export function WelcomeModal({ onClose, platform }: Props) {
  const { t } = useTranslation('gamelib')
  const isMac = platform === 'darwin'
  const [status, setStatus] = useState<AppManagementStatus | undefined>(
    undefined
  )

  const check = useCallback(() => {
    window.api
      .getAppManagementStatus()
      .then((result) => setStatus(result))
      .catch(() => setStatus('unknown'))
  }, [])

  useEffect(() => {
    // Linux/Windows never probe.
    if (!isMac) return
    check()
    const onFocus = () => check()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [isMac, check])

  const view = appManagementView(status ?? 'not-needed')
  // Literal keys (not view.statusKey) so the i18n extractors can see them.
  const statusText =
    status === 'granted'
      ? t(
          'welcome.appManagement.status.granted',
          'App Management access is allowed.'
        )
      : status === 'denied'
        ? t(
            'welcome.appManagement.status.denied',
            'App Management access is not allowed yet.'
          )
        : t(
            'welcome.appManagement.status.unknown',
            'GameLib could not tell whether App Management access is allowed.'
          )
  const showAppManagement = isMac && status !== undefined && view.visible

  return (
    <div className="welcomeModal">
      <Dialog onClose={onClose} showCloseButton={true}>
        <DialogHeader onClose={onClose}>
          <div>{t('welcome.title', 'Welcome to GameLib')}</div>
        </DialogHeader>
        <DialogContent>
          <div className="welcomeModal__content">
            <section className="welcomeModal__section">
              <h3>{t('welcome.stores.title', 'Log into your stores')}</h3>
              <p>
                {t(
                  'welcome.stores.body',
                  'Open Manage Accounts and log into the stores you use (Epic Games, GOG, Amazon Games and Steam) so your libraries appear here.'
                )}
              </p>
            </section>

            {isMac && (
              <section className="welcomeModal__section">
                <h3>
                  {t('welcome.crossover.title', 'Windows games on macOS')}
                </h3>
                <p>
                  {t(
                    'welcome.crossover.body',
                    'Windows games run on macOS through CrossOver, paid software made by CodeWeavers. If you play Windows games, please support CodeWeavers by buying CrossOver.'
                  )}
                </p>
                {status === 'not-needed' && (
                  <p>
                    {t(
                      'welcome.crossover.missing',
                      'CrossOver was not found on this Mac. Install it from codeweavers.com before installing Windows games.'
                    )}
                  </p>
                )}
                <button
                  className="button is-secondary"
                  onClick={() => window.api.openExternalUrl(CROSSOVER_URL)}
                >
                  {t('welcome.crossover.buy', 'Get CrossOver')}
                </button>
              </section>
            )}

            {isMac && status === undefined && (
              <p className="welcomeModal__status">
                {t('welcome.appManagement.status.checking', 'Checking…')}
              </p>
            )}

            {showAppManagement && (
              <section className="welcomeModal__section">
                <h3>
                  {t('welcome.appManagement.title', 'Allow App Management')}
                </h3>
                <p>
                  {t(
                    'welcome.appManagement.reason',
                    'CrossOver changes files inside app bundles when it sets up a game bottle, and macOS asks for the "App Management" permission for that. Without it, Windows game installs stall partway through with a macOS notification.'
                  )}
                </p>
                <p
                  className={`welcomeModal__status welcomeModal__status--${status}`}
                  role="status"
                >
                  {statusText}
                </p>
                {status === 'unknown' && (
                  <p>
                    {t(
                      'welcome.appManagement.unknownHelp',
                      'Open System Settings > Privacy & Security > App Management and make sure GameLib is switched on.'
                    )}
                  </p>
                )}
                {view.showRelaunch && (
                  <p>
                    {t(
                      'welcome.appManagement.relaunchNote',
                      'The permission takes effect after GameLib relaunches.'
                    )}
                  </p>
                )}
                <div className="welcomeModal__buttons">
                  {view.showOpenSettings && (
                    <button
                      className="button is-primary"
                      onClick={() => window.api.openAppManagementSettings()}
                    >
                      {t(
                        'welcome.appManagement.openSettings',
                        'Open System Settings'
                      )}
                    </button>
                  )}
                  <button className="button is-secondary" onClick={check}>
                    {t('welcome.appManagement.checkAgain', 'Check again')}
                  </button>
                  {view.showRelaunch && (
                    <button
                      className="button is-primary"
                      onClick={() => window.api.relaunchApp()}
                    >
                      {t('welcome.appManagement.relaunch', 'Relaunch GameLib')}
                    </button>
                  )}
                </div>
              </section>
            )}

            <div className="welcomeModal__buttons">
              <button className="button is-primary" onClick={onClose}>
                {t('welcome.getStarted', 'Get started')}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
