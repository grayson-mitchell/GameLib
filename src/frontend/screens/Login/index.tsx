import React, { useContext, useEffect, useState } from 'react'
import './index.scss'
import Runner from './components/Runner'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import EpicLogo from 'frontend/assets/epic-logo.svg?react'
import GOGLogo from 'frontend/assets/gog-logo.svg?react'
import GameLibIcon from 'frontend/assets/gamelib-icon.png'
import AmazonLogo from 'frontend/assets/amazon-logo.svg?react'
import ZoomLogo from 'frontend/assets/zoom-logo.svg?react'
import SteamLogo from 'frontend/assets/steam-logo.svg?react'
import HumbleLogo from 'frontend/assets/humble-logo.svg?react'

import {
  LanguageSelector,
  UpdateComponent,
  WarningMessage
} from '../../components/UI'
import { FlagPosition } from '../../components/UI/LanguageSelector'
import SIDLogin from './components/SIDLogin'
import ContextProvider from '../../state/ContextProvider'
import { useAwaited } from '../../hooks/useAwaited'
import { hasHelp } from 'frontend/hooks/hasHelp'
import { isTauri } from '../../../preload/tauriTransport'

export const epicLoginPath = '/loginweb/legendary'
export const gogLoginPath = '/loginweb/gog'
export const amazonLoginPath = '/loginweb/nile'
export const zoomLoginPath = '/loginweb/zoom'
export const steamLoginPath = '/loginweb/steam'
// D-05: Humble now logs in through the embedded Stores WebView, matching the
// other runners above, instead of the retired popup BrowserWindow. This is
// the single source of truth for the Humble login route — the D-09 reconnect
// toast (HumbleExpiryToast) imports it from here too.
export const humbleLoginPath = '/loginweb/humble'

export default React.memo(function NewLogin() {
  const { epic, gog, amazon, zoom, steam, humble, refreshLibrary } =
    useContext(ContextProvider)
  const { t } = useTranslation()

  hasHelp(
    'login',
    t('help.title.login', 'Login'),
    <p>{t('help.content.login', 'Log in into the different stores.')}</p>
  )

  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [showSidLogin, setShowSidLogin] = useState(false)
  const [isEpicLoggedIn, setIsEpicLoggedIn] = useState(Boolean(epic.username))
  const [isGogLoggedIn, setIsGogLoggedIn] = useState(Boolean(gog.username))
  const [isAmazonLoggedIn, setIsAmazonLoggedIn] = useState(
    Boolean(amazon.user_id)
  )
  const [isZoomLoggedIn, setIsZoomLoggedIn] = useState(Boolean(zoom.username))
  const [isSteamLoggedIn, setIsSteamLoggedIn] = useState(Boolean(steam?.username))
  // Runner only shows `buttonText` (the reconnect prompt) in its
  // not-logged-in branch, so when the session has expired we present the
  // tile as "not logged in" (D-09: tile flips to Session expired — Reconnect)
  // even though a username is still cached in state.
  //
  // D-02/D-16: connected state is driven by `isLoggedIn` (set once the
  // gamekeys endpoint validates a session), NOT `username` — identity is a
  // best-effort fetch and is frequently absent (e.g. a 404), but the tile
  // must still show connected via the generic "Connected" fallback below.
  const [isHumbleLoggedIn, setIsHumbleLoggedIn] = useState(
    Boolean(humble?.isLoggedIn) && !humble?.expired
  )

  const systemInfo = useAwaited(window.api.systemInfo.get)

  let oldMac = false
  let oldMacMessage = ''
  if (systemInfo?.OS.platform === 'darwin') {
    const version = parseInt(systemInfo.OS.version.split('.')[0])
    if (version < 12) {
      oldMac = true
      oldMacMessage = t(
        'login.old-mac',
        'Your macOS version is {{version}}. macOS 12 or newer is required to log in.',
        { version: systemInfo.OS.version }
      )
    }
  }

  const loginMessage = t(
    'login.message',
    'Login with your platform. You can login to more than one platform at the same time.'
  )

  useEffect(() => {
    setLoading(false)
  }, [epic, gog])

  useEffect(() => {
    setIsEpicLoggedIn(Boolean(epic.username))
    setIsGogLoggedIn(Boolean(gog.username))
    setIsAmazonLoggedIn(Boolean(amazon.user_id))
    setIsZoomLoggedIn(Boolean(zoom.username))
    setIsSteamLoggedIn(Boolean(steam?.username))
    setIsHumbleLoggedIn(Boolean(humble?.isLoggedIn) && !humble?.expired)
  }, [
    epic.username,
    gog.username,
    amazon.user_id,
    zoom.username,
    steam?.username,
    humble?.isLoggedIn,
    humble?.expired,
    t
  ])

  async function handleLibraryClick() {
    await refreshLibrary({ runInBackground: false })
    navigate('/')
  }

  if (loading) {
    return <UpdateComponent />
  }

  return (
    <div className="loginPage">
      {showSidLogin && (
        <SIDLogin
          backdropClick={() => {
            setShowSidLogin(false)
          }}
        />
      )}
      <div className="loginBackground"></div>

      <div className="loginContentWrapper">
        <div className="runnerList">
          <div className="runnerHeader">
            <img
              src={GameLibIcon}
              className="runnerHeaderIcon"
              alt="GameLib"
            />
            <div className="runnerHeaderText">
              <h1 className="title">GameLib</h1>
            </div>

            {!loading && (
              <LanguageSelector
                flagPossition={FlagPosition.PREPEND}
                showWeblateLink={true}
              />
            )}
          </div>

          <p className="runnerMessage">{loginMessage}</p>
          {oldMac && <p className="disabledMessage">{oldMacMessage}</p>}

          <div className="runnerGroup">
            <Runner
              class="epic"
              buttonText={t('login.epic', 'Epic Games Login')}
              loginUrl={epicLoginPath}
              icon={() => <EpicLogo />}
              isLoggedIn={isEpicLoggedIn}
              user={epic.username}
              logoutAction={epic.logout}
              // F-34.5-G6-01 (2026-08-03): under Tauri, Epic's embedded WebKit login hits
              // Epic's Talon anti-bot 403 (see debug file `descriptor_findings_2026_08_03T09_00_00`),
              // so SIDLogin (real system browser) is the PRIMARY tile there, while the embedded
              // login stays reachable as the "Alternative Login Method" tile for continued 403
              // experimentation. Under Electron `isTauri()` is false: primaryLoginAction is
              // undefined (primary tile navigates to the embedded route as before) and the
              // alternative tile is SIDLogin -- identical to the original behavior.
              primaryLoginAction={
                isTauri() ? () => setShowSidLogin(true) : undefined
              }
              alternativeLoginAction={
                isTauri()
                  ? () => navigate(epicLoginPath)
                  : () => setShowSidLogin(true)
              }
              // Quick task 260805-d62: mark the SIDLogin tile (the interactive legendary/SID
              // login) as deletion-pending ahead of ROADMAP Phase 34.7 -- this reads inverted
              // relative to intuition on purpose. Per the F-34.5-G6-01 pivot documented above,
              // under Tauri the PRIMARY tile is SIDLogin and the ALTERNATIVE tile is the
              // embedded web login; under Electron the roles are reversed. Naming the SIDLogin
              // tile in both shells means the embedded web login is never marked red.
              deprecatedTile={isTauri() ? 'primary' : 'alternative'}
              disabled={oldMac}
            />
            <Runner
              class="gog"
              buttonText={t('login.gog', 'GOG Login')}
              icon={() => <GOGLogo />}
              loginUrl={gogLoginPath}
              isLoggedIn={isGogLoggedIn}
              user={gog.username}
              logoutAction={gog.logout}
              disabled={oldMac}
            />
            <Runner
              class="nile"
              buttonText={t('login.amazon', 'Amazon Login')}
              icon={() => <AmazonLogo />}
              loginUrl={amazonLoginPath}
              isLoggedIn={isAmazonLoggedIn}
              user={amazon.username || 'Unknown'}
              logoutAction={amazon.logout}
              disabled={oldMac}
            />
            {zoom.enabled && (
              <Runner
                class="zoom"
                buttonText={t('login.zoom', 'Zoom Login')}
                icon={() => <ZoomLogo />}
                loginUrl={zoomLoginPath}
                isLoggedIn={isZoomLoggedIn}
                user={zoom.username}
                logoutAction={zoom.logout}
                disabled={oldMac}
              />
            )}
            <Runner
              class="steam"
              buttonText={t('login.steam', 'Steam Login')}
              icon={() => <SteamLogo />}
              loginUrl={steamLoginPath}
              isLoggedIn={isSteamLoggedIn}
              user={steam?.username ?? undefined}
              logoutAction={steam?.logout ?? (() => Promise.resolve())}
              disabled={oldMac}
            />
            <Runner
              class="humble"
              buttonText={
                humble?.expired
                  ? t('login.humble_reconnect', 'Session expired — Reconnect')
                  : t('login.humble', 'Humble Bundle Login')
              }
              icon={() => <HumbleLogo />}
              loginUrl={humbleLoginPath}
              isLoggedIn={isHumbleLoggedIn}
              user={
                humble?.username ??
                t('login.humble_connected', 'Connected')
              }
              logoutAction={humble?.logout ?? (() => Promise.resolve())}
              disabled={oldMac}
            />
          </div>
          {humble?.encryptionDegraded && (
            <WarningMessage className="humbleEncryptionWarning">
              {t(
                'login.humble_encryption_degraded',
                'Your system does not support secure credential storage. The Humble Bundle session is stored with reduced encryption.'
              )}
            </WarningMessage>
          )}
        </div>
        <button
          onClick={async () => handleLibraryClick()}
          className="goToLibrary"
        >
          {t('button.go_to_library', 'Go to Library')}
        </button>
      </div>
    </div>
  )
})
