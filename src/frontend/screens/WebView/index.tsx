import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation, useParams } from 'react-router-dom'

import ContextProvider from 'frontend/state/ContextProvider'
import './index.css'
import WebviewUnavailablePanel from './components/WebviewUnavailablePanel'
import TauriLoginPanel from './components/TauriLoginPanel'
import HumbleLoginSurface from './components/HumbleLoginSurface'
import { useTauriOAuthLogin } from './useTauriOAuthLogin'
import type { OAuthLoginCompletionPayload } from './useTauriOAuthLogin'
import type { OAuthRunner } from 'common/types/oauthLogin'
import {
  isLoginPathname,
  EPIC_LOGIN_URL,
  GOG_LOGIN_URL,
  ZOOM_LOGIN_URL
} from './loginRoutes'

const validStoredUrl = (url: string, store: string) => {
  switch (store) {
    case 'epic':
      return url.includes('epicgames.com')
    case 'gog':
      return url.includes('gog.com')
    case 'amazon':
      return url.includes('gaming.amazon.com')
    case 'zoom':
      return url.includes('zoom-platform.com')
    case 'steam':
      return url.includes('store.steampowered.com')
    default:
      return false
  }
}

export default function WebView() {
  const { i18n } = useTranslation()
  const { pathname, search } = useLocation()
  const { epic, gog, amazon, zoom, completeOAuthLogin } =
    useContext(ContextProvider)
  const navigate = useNavigate()

  // `store` is set to epic/gog/amazon depending on which storefront we're
  // supposed to show, `runner` is set to a runner if we're supposed to show its
  // login prompt
  const { store, runner } = useParams()

  // Phase 34.4.1 Plan 09 (D-04, REQ-34.4.1-08), extended by Phase 34.5 Plan 26 (F-34.5-G6-02
  // layer 2, F-34.5-G6-03): drives the real per-runner OAuth capture for the four OAuth login
  // runners. Called unconditionally alongside this component's other hooks (React's
  // rules-of-hooks) -- the hook's OWN internal guard is what makes it a no-op for
  // `runner === 'humble'`/`undefined`/any non-OAuth value, not a conditional call here. Its
  // result is only consumed by the login-pathname branch below.  `completeOAuthLogin` is
  // GlobalState.tsx's own post-login completion path (setState + handleSuccessfulLogin ->
  // refreshLibrary) -- passing it here is what makes a captured OAuth login actually refresh the
  // library instead of silently landing nowhere.
  // True-unmount flag. NOT the same thing as the hook's own `cancelled` — see
  // `handleTauriOAuthSuccess` below for why that distinction is the whole bug. Empty deps, so
  // this cleanup runs on unmount ONLY, never on a dependency-identity change.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  /**
   * Post-login completion for the Tauri OAuth path: finish the login AND leave the login
   * surface, which is what every other successful-login path in this file already does
   * (`handleSuccessfulLogin` -> `navigate('/login')` for Electron's epic/gog/zoom/amazon
   * branches; the humble watch's own `navigate('/login')` at the `status === 'done'` arm).
   *
   * THE BUG THIS FIXES: the Tauri path completed the login but never navigated, so the user
   * stayed on the WebView login route staring at `TauriLoginPanel`. The panel could not
   * recover on its own either — `useTauriOAuthLogin` routes its terminal
   * `setState({ phase: 'idle' })` through `safeSetState`, which is gated on `!cancelled`, and
   * a teardown lands mid-flight on this path (`phase=cancelled-midflight at=auth
   * authStatus=done` is logged immediately before every success). So the panel stayed at
   * `awaiting` — "Signing in to Gog" — indefinitely, while the login had in fact succeeded and
   * the library had refreshed underneath it.
   *
   * Navigating rather than un-gating that state update is deliberate: `phase: 'idle'` renders
   * the DECLARED-BLOCKED copy, so forcing the panel to idle would replace "Signing in…" with a
   * message implying the sign-in channel is unported — a worse lie than the stuck spinner. The
   * correct end state after a successful login is not a better panel, it is not being on the
   * login page at all.
   *
   * Guarded by `mountedRef`, NOT by the hook's `cancelled`, mirroring the humble watch's own
   * "a late resolution after the route unmounted must not navigate" rule. The two are not
   * interchangeable: `cancelled` means "this effect instance was superseded", which is TRUE on
   * every successful login here while the user is still sitting on the route. Gating on it
   * would reintroduce the exact bug.
   *
   * Stable identity via `useCallback` over two stable inputs — `completeOAuthLogin` is a
   * GlobalState class field and `navigate` is stable in react-router v6 — because
   * `onLoginSuccess` is one of `useTauriOAuthLogin`'s effect dependencies. A wrapper that
   * changed identity per render would re-run the capture effect on every render.
   */
  const handleTauriOAuthSuccess = useCallback(
    (payload: OAuthLoginCompletionPayload) => {
      completeOAuthLogin(payload)
      if (mountedRef.current) {
        navigate('/login')
      }
    },
    [completeOAuthLogin, navigate]
  )

  /**
   * Quick task 260803-eee Task 4: the cancel-path sibling of `handleTauriOAuthSuccess` above.
   *
   * THE BUG THIS FIXES: closing the native popup without completing sign-in correctly lands
   * `useTauriOAuthLogin` on `{ phase: 'cancelled' }` (unlike the success path, this state
   * transition is NOT suppressed by the mid-flight teardown, since `TauriLoginPanel` does render
   * its cancelled surface). But nothing then leaves the login route — the user is stuck on
   * "Signing in to <Runner> was cancelled" indefinitely instead of returning to Manage Accounts.
   *
   * Guarded by `mountedRef` (true-unmount), not the hook's `cancelled`/teardown flag — same
   * reasoning as `handleTauriOAuthSuccess`: this callback itself is invoked unconditionally by
   * the hook (see `useTauriOAuthLogin.ts`'s `onCancelled` call site), so gating navigation on the
   * hook's internal flag here would be checking the wrong thing.
   *
   * Deliberately NOT wired to timeout/error/unsupported — those keep their own retry-affordance
   * surfaces (a Retry button); only the user-cancelled outcome exits automatically.
   */
  const handleTauriOAuthCancelled = useCallback(() => {
    if (mountedRef.current) {
      navigate('/login')
    }
  }, [navigate])

  const oauthLoginState = useTauriOAuthLogin(
    runner as OAuthRunner | undefined,
    handleTauriOAuthSuccess,
    handleTauriOAuthCancelled
  )

  let lang = i18n.language
  if (i18n.language === 'pt') {
    lang = 'pt-BR'
  }

  // Lifted into loginRoutes.ts (Phase 34.4.1 Plan 09) so useTauriOAuthLogin.ts can import the
  // SAME literals rather than duplicating them — one definition, two consumers.
  const epicLoginUrl = EPIC_LOGIN_URL

  const epicStore = `https://www.epicgames.com/store/${lang}/`
  const gogStore = `https://af.gog.com?as=1838482841`
  const amazonStore = `https://gaming.amazon.com`
  const zoomStore = `https://www.zoom-platform.com`
  const steamStore = 'https://store.steampowered.com/'
  const wikiURL =
    'https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/wiki'
  const gogLoginUrl = GOG_LOGIN_URL
  const zoomLoginUrl = ZOOM_LOGIN_URL
  const humbleLoginUrl = 'https://www.humblebundle.com/login'

  const urls: { [pathname: string]: string } = {
    '/store/epic': epicStore,
    '/store/gog': gogStore,
    '/store/amazon': amazonStore,
    '/store/zoom': zoomStore,
    '/store/steam': steamStore,
    '/wiki': wikiURL,
    '/loginEpic': epicLoginUrl,
    '/loginGOG': gogLoginUrl,
    '/loginweb/legendary': epicLoginUrl,
    '/loginweb/gog': gogLoginUrl,
    // Phase 40 Plan 01 (D-09): the `amazonLoginData` state that used to populate this key fed
    // only the deleted Electron `<webview>` amazon-login flow (`handleAmazonLogin`, removed by
    // this plan). `useTauriOAuthLogin.ts`'s own `getAmazonLoginData()` call is the single
    // remaining owner of that fetch -- see
    // `.planning/todos/pending/2026-09-01-webview-amazonlogindata-is-permanently-null.md` for
    // the folded todo this deletion resolves. Do NOT re-add a fetch here: the double-spawn cost
    // is the measured ~12.8s-per-call regression named in the no-op effect below.
    '/loginweb/nile': '',
    '/loginweb/zoom': zoomLoginUrl,
    '/loginweb/humble': humbleLoginUrl
  }
  let startUrl = urls[pathname]

  if (store) {
    sessionStorage.setItem('last-store', store)
    const lastUrl = sessionStorage.getItem(`last-url-${store}`)
    if (lastUrl && validStoredUrl(lastUrl, store)) {
      startUrl = lastUrl
    }
  }

  if (pathname.match(/store-page/)) {
    const searchParams = new URLSearchParams(search)
    const queryParam = searchParams.get('store-url')
    if (queryParam) {
      startUrl = queryParam
    }
  }

  useEffect(() => {
    if (pathname !== '/loginweb/nile') return
    // Quick task 260806-teb Task 1 / Phase 35 plan 17: this effect used to load Amazon
    // login data for the Electron `<webview>` amazon flow (`urls['/loginweb/nile']` feeds
    // the `<webview>` `src`; `handleAmazonLogin` is reached via the webview
    // event-listener effect). That flow no longer exists -- Tauri is the only shell, the
    // render always returns `<TauriLoginPanel>` first, and `useTauriOAuthLogin.ts`'s own
    // `getAmazonLoginData()` call is the single remaining owner of that fetch.
    //
    // Do NOT "restore" the deleted body -- not even unconditionally. This effect's own
    // `nile auth --login --non-interactive` spawn is the exact ~12.8s-per-call cost quick
    // task 260806-teb measured and fixed by preventing a SECOND, redundant spawn racing
    // `useTauriOAuthLogin.ts`'s own call (pyinstaller-onefile-spawn-tax). Re-adding a call
    // here -- guarded or not -- reintroduces that double-spawn.
    //
    // Phase 40 Plan 01 (D-09): the Model A `<webview>` this comment refers to is now fully
    // deleted (not merely dead) -- `handleAmazonLogin`, `amazonLoginData`, and every webview
    // event-listener effect are gone from this file. This effect itself stays as the
    // historical record of why no fetch belongs here.
  }, [pathname])

  const handleSuccessfulLogin = () => {
    navigate('/login')
  }

  const [showLoginWarningFor, setShowLoginWarningFor] = useState<
    null | 'epic' | 'gog' | 'amazon' | 'zoom'
  >(null)

  const [showAdtractionWarning, setShowAdtractionWarning] =
    useState<boolean>(false)

  const [dontShowAdtractionWarning, setDontShowAdtractionWarning] =
    useState<boolean>(false)

  useEffect(() => {
    if (
      startUrl.match(/epicgames\.com/) &&
      startUrl.indexOf('/id/login') < 0 &&
      !epic.username
    ) {
      setShowLoginWarningFor('epic')
    } else if (
      startUrl.match(/gog\.com/) &&
      !startUrl.match(/auth\.gog\.com/) &&
      !gog.username
    ) {
      setShowLoginWarningFor('gog')
    } else if (startUrl.match(/gaming\.amazon\.com/) && !amazon.user_id) {
      setShowLoginWarningFor('amazon')
    } else if (startUrl.match(/zoom-platform\.com\/$/) && !zoom.username) {
      setShowLoginWarningFor('zoom')
    } else {
      setShowLoginWarningFor(null)
    }
  }, [startUrl])

  const onLoginWarningClosed = () => {
    setShowLoginWarningFor(null)
  }

  // Phase 40 Plan 01 (D-09/D-10): Task 2 deletes this file's entire Model A render --
  // the `<webview>` element, `WebviewControls`, the `UpdateComponent` loading indicator,
  // the `LoginWarning` render, and the adtraction `Dialog` -- but explicitly does NOT
  // delete the state/effects/handlers above (`handleSuccessfulLogin`, `showLoginWarningFor`
  // and its effect, `showAdtractionWarning`/`dontShowAdtractionWarning`,
  // `onLoginWarningClosed`) per 40-01-PLAN.md's own "Do NOT delete" list: they are Model B
  // / route logic re-consumed when plan 40-07 rebuilds this chrome around the new embed
  // slot (D-24), not ported fresh. That leaves them with no reader in THIS plan's render --
  // referenced here only to keep them alive for the linter during that interim window.
  void handleSuccessfulLogin
  void showLoginWarningFor
  void onLoginWarningClosed
  void showAdtractionWarning
  void setShowAdtractionWarning
  void dontShowAdtractionWarning
  void setDontShowAdtractionWarning

  // Quick task 260821-iri: Humble's login surface (state, watch, webview,
  // navigation relay) now lives entirely in HumbleLoginSurface.tsx, hosted
  // by the Login screen's own co-mounted `HumbleLogin` overlay. This route
  // stays alive, unchanged in URL, for `HumbleExpiryToast` and
  // `Humble/Keys`, which still navigate here directly. Placed AFTER every
  // hook above (rules of hooks) and BEFORE the login-pathname branch below.
  if (runner === 'humble') {
    return (
      <HumbleLoginSurface
        onDone={() => navigate('/login')}
        onCancelled={() => navigate('/login')}
      />
    )
  }

  if (isLoginPathname(pathname)) {
    // D-06 (REQ-34.4.1-07/-08): Phase 34.4.1 shipped a real Rust
    // login-window seam, so the old blanket "not available on this
    // build" message here would now be a lie for login routes. They
    // drive TauriLoginPanel instead: Humble gets an honest in-progress
    // surface, and the four OAuth runners get a declared-blocked one
    // naming the exact backend channel and Phase 34.5.
    //
    // Phase 40 Plan 01 (D-09): this used to be one arm of a
    // `!webviewPreloadPath` guard shared with the store/wiki arm below.
    // That guard is now fully retired -- `getWebviewPreloadPath`
    // (`backend/sidecar/appShellFlowRegistration.ts`, D-12) is untouched by
    // this plan and still returns a declared-empty string under Tauri, but
    // nothing in this file reads it any longer. Both arms are unconditional
    // now, split solely on `isLoginPathname(pathname)`.
    return <TauriLoginPanel runner={runner} state={oauthLoginState} />
  }

  // D-05: in-app store and wiki browsing was never this phase's job --
  // log the gap so it is legible to a developer too ("logged, never
  // silent"), and let the user escape to the system browser via
  // WebviewUnavailablePanel's Open-in-browser button. Phase 40 retires
  // Model A entirely (D-09/D-10); this remains the store/wiki surface
  // until plan 40-07+ replaces it with the Tauri child-webview embed.
  window.api.logInfo(
    `[WebView] in-app store/wiki browsing unavailable under Tauri (pathname=${pathname}) -- tracked as its own deferral (D-05)`
  )
  return <WebviewUnavailablePanel url={startUrl} />
}
