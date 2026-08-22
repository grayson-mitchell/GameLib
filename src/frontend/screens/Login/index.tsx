import React, { useContext, useEffect, useRef, useState } from 'react'
import classNames from 'classnames'
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
import SteamLogin from './components/SteamLogin'
import HumbleLogin from './components/HumbleLogin'
import ContextProvider from '../../state/ContextProvider'
import { useAwaited } from '../../hooks/useAwaited'
import { hasHelp } from 'frontend/hooks/hasHelp'
import { steamConfigStore } from 'frontend/helpers/electronStores'
import { isSteamConnected } from './steamTileState'

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

// Mirrors Dialog.tsx's `transitionDuration={500}` (its Slide exit transition
// needs a full 500ms of mounted time to play), for BOTH the Steam and Humble
// overlays. loginCrossfade.test.ts asserts this and the two other sources
// (Dialog.tsx's own literal, Login/index.scss's transition duration) agree.
const LOGIN_DIALOG_EXIT_MS = 500

type LoginOverlay = 'steam' | 'humble'

export default React.memo(function NewLogin() {
  const { epic, gog, amazon, zoom, steam, humble, refreshLibrary } =
    useContext(ContextProvider)
  const { t } = useTranslation()
  // Fork-owned strings live in gamelib.json — translation.json is upstream's
  // and meta/i18nCatalogChurnGuard.ts fails the build on any fork edit to it.
  const { t: tGamelib } = useTranslation('gamelib')

  hasHelp(
    'login',
    t('help.title.login', 'Login'),
    <p>{t('help.content.login', 'Log in into the different stores.')}</p>
  )

  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [showSidLogin, setShowSidLogin] = useState(false)
  // Login overlay lifecycle (Task 2, 36-01; generalised beyond Steam-only by
  // quick task 260821-iri Task 3). `mountedOverlay` controls whether an
  // overlay (SteamLogin or HumbleLogin) is in the tree at all; `openOverlay`
  // is the semantic "a sign-in surface is up" flag that feeds `loginInFlight`
  // below and clears synchronously on dismiss (see dismissLoginOverlay).
  // `overlayMountKey` forces a fresh overlay mount on reopen so a reopen
  // during the teardown window never resurrects stale internal state --
  // `Dialog` mounts with `open` initialised to `true`, so a remount is the
  // only way to reopen it, and for Humble it is additionally what restarts
  // the login watch. `overlayUnmountTimerRef` holds the pending
  // deferred-unmount timer handle.
  const [mountedOverlay, setMountedOverlay] = useState<LoginOverlay | null>(
    null
  )
  const [openOverlay, setOpenOverlay] = useState<LoginOverlay | null>(null)
  const [overlayMountKey, setOverlayMountKey] = useState(0)
  const overlayUnmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  // The explicit, stated guard this phase's ROADMAP obligation asks for.
  // Named separately rather than inlined so the six tile call sites read the
  // guard's intent directly -- this is the seam a future phase widens when a
  // third store adopts the overlay shape.
  const loginInFlight = openOverlay !== null
  const [isEpicLoggedIn, setIsEpicLoggedIn] = useState(Boolean(epic.username))
  const [isGogLoggedIn, setIsGogLoggedIn] = useState(Boolean(gog.username))
  const [isAmazonLoggedIn, setIsAmazonLoggedIn] = useState(
    Boolean(amazon.user_id)
  )
  const [isZoomLoggedIn, setIsZoomLoggedIn] = useState(Boolean(zoom.username))
  // Read straight from the store rather than from GlobalState: the backend
  // latches this on a routine library refresh, long after GlobalState was
  // constructed, and the renderer's snapshot is kept live by
  // STORE_CHANGED_CHANNEL (backend/electron_store.ts announces on set/delete).
  // Re-read in the effect below so navigating to this screen always shows the
  // current verdict without needing a dedicated push channel.
  const [steamCredentialsMissing, setSteamCredentialsMissing] = useState(() =>
    Boolean(steamConfigStore.get_nodefault('credentialsMissing'))
  )
  const [isSteamLoggedIn, setIsSteamLoggedIn] = useState(
    isSteamConnected(steam?.username, steamCredentialsMissing)
  )
  // Runner only shows `buttonText` (the reconnect prompt) in its
  // not-logged-in branch, so when the session has expired we present the
  // tile as "not logged in" (D-09: tile flips to Session expired — Reconnect)
  // even though a username is still cached in state.
  //
  // D-02/D-16: connected state is driven by `isLoggedIn` (set once the
  // gamekeys endpoint validates a session), NOT `username` — identity is a
  // best-effort fetch and is frequently absent (e.g. a 404). Quick task
  // 260815-kt0: `Runner` no longer renders any identity value at all — every
  // store's tile shows the same uniform "Connected" indicator once
  // `isLoggedIn` is true, regardless of whether a username was ever fetched.
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

  useEffect(() => {
    setLoading(false)
  }, [epic, gog])

  useEffect(() => {
    setIsEpicLoggedIn(Boolean(epic.username))
    setIsGogLoggedIn(Boolean(gog.username))
    setIsAmazonLoggedIn(Boolean(amazon.user_id))
    setIsZoomLoggedIn(Boolean(zoom.username))
    const credentialsMissing = Boolean(
      steamConfigStore.get_nodefault('credentialsMissing')
    )
    setSteamCredentialsMissing(credentialsMissing)
    setIsSteamLoggedIn(isSteamConnected(steam?.username, credentialsMissing))
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

  // Cleanup: a pending deferred-unmount timer must never fire against an
  // unmounted component.
  useEffect(() => {
    return () => {
      if (overlayUnmountTimerRef.current) {
        clearTimeout(overlayUnmountTimerRef.current)
      }
    }
  }, [])

  function openLoginOverlay(which: LoginOverlay) {
    // Clear any pending unmount timer and bump the mount key so a reopen
    // during the teardown window remounts the overlay at its initial state
    // instead of resurrecting the previous open's state -- Dialog mounts
    // with `open` initialised to `true`, so a remount is the only way to
    // reopen it. For Humble, the remount is additionally what restarts the
    // login watch.
    if (overlayUnmountTimerRef.current) {
      clearTimeout(overlayUnmountTimerRef.current)
      overlayUnmountTimerRef.current = null
    }
    setOverlayMountKey((key) => key + 1)
    setMountedOverlay(which)
    setOpenOverlay(which)
  }

  function dismissLoginOverlay() {
    // T-34.4.2-41: the semantic flag clears on the dismiss action itself,
    // synchronously and immediately -- never on the teardown timer -- so
    // the guard can never stay latched.
    setOpenOverlay(null)
    if (overlayUnmountTimerRef.current) {
      clearTimeout(overlayUnmountTimerRef.current)
    }
    overlayUnmountTimerRef.current = setTimeout(() => {
      setMountedOverlay(null)
      overlayUnmountTimerRef.current = null
    }, LOGIN_DIALOG_EXIT_MS)
  }

  async function handleLibraryClick() {
    await refreshLibrary({ runInBackground: false, origin: 'login-screen' })
    navigate('/')
  }

  if (loading) {
    return <UpdateComponent />
  }

  return (
    <div className={classNames('loginPage', { loginFlowOpen: loginInFlight })}>
      {showSidLogin && (
        <SIDLogin
          backdropClick={() => {
            setShowSidLogin(false)
          }}
        />
      )}
      <div className="loginBackground"></div>
      {mountedOverlay === 'steam' && (
        <SteamLogin key={overlayMountKey} dismiss={dismissLoginOverlay} />
      )}
      {mountedOverlay === 'humble' && (
        <HumbleLogin key={overlayMountKey} dismiss={dismissLoginOverlay} />
      )}

      {/* T-34.4.2-39/-41: `inert` is the React-18 string-empty form (boolean
          `inert` is React-19-only; this project pins react@^18.3.1). No
          `tabIndex` here -- the tiles are bare `<div onClick>` with no
          tabIndex/role, already outside the tab order, so a container
          tabIndex would protect nothing (operator-dropped lock, see
          36-01-PLAN.md locked_decisions). No `aria-hidden` here either --
          this wrapper holds two genuinely focusable controls
          (LanguageSelector, goToLibrary) and `aria-hidden` over focusable
          descendants is an ARIA violation; MUI's Dialog focus trap covers
          the pre-Safari-15.5 slice where `inert` does not. */}
      <div
        className="loginContentWrapper"
        inert={loginInFlight ? '' : undefined}
      >
        <div className="runnerList">
          <div className="runnerHeader">
            <img src={GameLibIcon} className="runnerHeaderIcon" alt="GameLib" />
          </div>

          {oldMac && <p className="disabledMessage">{oldMacMessage}</p>}

          <div className="runnerGroup">
            <Runner
              class="epic"
              buttonText={t('login.epic', 'Epic Games Login')}
              loginUrl={epicLoginPath}
              icon={() => <EpicLogo />}
              isLoggedIn={isEpicLoggedIn}
              logoutAction={epic.logout}
              // Quick task 260822-r3g (2026-08-22) REVERTS the F-34.5-G6-01 Epic tile pivot
              // and puts ROADMAP Phase 34.7 ON HOLD. The pivot existed because Epic's embedded
              // WebKit login hit Talon's anti-bot 403 under Tauri, which made SIDLogin the
              // primary tile there. The pristine (zero-injection) WKWebView login window
              // defeated that 403 and the embedded login now completes a fresh logged-out
              // sign-in on macOS, so the embedded login is the PRIMARY tile again -- meaning
              // `login.epic` ("Epic Games Login") names it, and SIDLogin is once more the
              // "Alternative Login Method" tile. No shell branch is left: Epic is wired
              // identically under Electron and Tauri, exactly as before the pivot. The
              // `deprecatedTile` marker went with it -- with 34.7 on hold, no sign-in path on
              // this screen is scheduled for deletion. (`Runner` still SUPPORTS both props;
              // only this call site stopped passing them.)
              alternativeLoginAction={() => setShowSidLogin(true)}
              disabled={oldMac || loginInFlight}
            />
            <Runner
              class="gog"
              buttonText={t('login.gog', 'GOG Login')}
              icon={() => <GOGLogo />}
              loginUrl={gogLoginPath}
              isLoggedIn={isGogLoggedIn}
              logoutAction={gog.logout}
              disabled={oldMac || loginInFlight}
            />
            <Runner
              class="nile"
              buttonText={t('login.amazon', 'Amazon Login')}
              icon={() => <AmazonLogo />}
              loginUrl={amazonLoginPath}
              isLoggedIn={isAmazonLoggedIn}
              logoutAction={amazon.logout}
              disabled={oldMac || loginInFlight}
            />
            {zoom.enabled && (
              <Runner
                class="zoom"
                buttonText={t('login.zoom', 'Zoom Login')}
                icon={() => <ZoomLogo />}
                loginUrl={zoomLoginPath}
                isLoggedIn={isZoomLoggedIn}
                logoutAction={zoom.logout}
                disabled={oldMac || loginInFlight}
              />
            )}
            <Runner
              class="steam"
              buttonText={
                steamCredentialsMissing
                  ? tGamelib(
                      'gamelib:login.steamReconnect',
                      'Sign-in expired — Reconnect'
                    )
                  : t('login.steam', 'Steam Login')
              }
              icon={() => <SteamLogo />}
              loginUrl={steamLoginPath}
              isLoggedIn={isSteamLoggedIn}
              logoutAction={steam?.logout ?? (() => Promise.resolve())}
              primaryLoginAction={() => openLoginOverlay('steam')}
              disabled={oldMac || loginInFlight}
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
              logoutAction={humble?.logout ?? (() => Promise.resolve())}
              primaryLoginAction={() => openLoginOverlay('humble')}
              disabled={oldMac || loginInFlight}
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
        <div className="loginActions">
          <LanguageSelector
            flagPossition={FlagPosition.PREPEND}
            showWeblateLink={false}
            hideLabel={true}
          />
          <button
            onClick={async () => handleLibraryClick()}
            className="goToLibrary"
          >
            {t('button.go_to_library', 'Go to Library')}
          </button>
        </div>
      </div>
    </div>
  )
})
