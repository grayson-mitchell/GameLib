import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation, useParams } from 'react-router-dom'

import { ToggleSwitch, UpdateComponent } from 'frontend/components/UI'
import WebviewControls from 'frontend/components/UI/WebviewControls'
import ContextProvider from 'frontend/state/ContextProvider'
import './index.css'
import LoginWarning from '../Login/components/LoginWarning'
import { NileLoginData } from 'common/types/nile'
import type { WebviewTag, DidFailLoadEvent } from 'backend/platform'
import { isTauri } from '../../../preload/tauriTransport'
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
import {
  Dialog,
  DialogContent,
  DialogHeader
} from 'frontend/components/UI/Dialog'

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
  const { t } = useTranslation()
  const { epic, gog, amazon, zoom, connectivity, completeOAuthLogin } =
    useContext(ContextProvider)
  const [loading, setLoading] = useState<{
    refresh: boolean
    message: string
  }>(() => ({
    refresh: true,
    message: t('loading.website', 'Loading Website')
  }))
  const [amazonLoginData, setAmazonLoginData] = useState<NileLoginData | null>(
    null
  )
  const navigate = useNavigate()
  const webviewRef = useRef<WebviewTag>(null)

  // `store` is set to epic/gog/amazon depending on which storefront we're
  // supposed to show, `runner` is set to a runner if we're supposed to show its
  // login prompt
  const { store, runner } = useParams()

  // Phase 34.4.1 Plan 09 (D-04, REQ-34.4.1-08), extended by Phase 34.5 Plan 26 (F-34.5-G6-02
  // layer 2, F-34.5-G6-03): drives the real per-runner OAuth capture for the four OAuth login
  // runners. Called unconditionally alongside this component's other hooks (React's
  // rules-of-hooks) -- the hook's OWN internal guard is what makes it a no-op for
  // `runner === 'humble'`/`undefined`/any non-OAuth value, not a conditional call here. Its
  // result is only consumed by the `!webviewPreloadPath` branch below. `completeOAuthLogin` is
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
  const gogEmbedRegExp = new RegExp('https://embed.gog.com/on_login_success?')
  const gogLoginUrl = GOG_LOGIN_URL
  const zoomLoginUrl = ZOOM_LOGIN_URL
  const humbleLoginUrl = 'https://www.humblebundle.com/login'

  const trueAsStr = 'true' as unknown as boolean | undefined

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
    '/loginweb/nile': amazonLoginData ? amazonLoginData.url : '',
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
    // Quick task 260806-teb Task 1: under Tauri this effect's only two consumers are
    // BOTH unreachable -- `urls['/loginweb/nile']` feeds the `<webview>` `src`, which is
    // never rendered under Tauri (the render returns `<TauriLoginPanel>` first), and
    // `handleAmazonLogin` is only reached via the webview event-listener effect, whose
    // `webviewRef.current` stays null. So this effect used to pay a ~12.8s `nile auth`
    // spawn (pyinstaller-onefile-spawn-tax) purely to discard the result, racing
    // useTauriOAuthLogin.ts:196's OWN getAmazonLoginData() call -- the one that actually
    // feeds the sign-in window. Do NOT "restore" this as dead defensive code:
    // useTauriOAuthLogin.ts is the single remaining owner of that fetch under Tauri.
    if (isTauri()) return
    console.log('Loading amazon login data')

    setLoading({
      refresh: true,
      message: t('status.preparing_login', 'Preparing Login...')
    })
    amazon.getLoginData().then((data) => {
      setAmazonLoginData(data)
      setLoading({
        ...loading,
        refresh: false
      })
    })
  }, [pathname])

  const handleAmazonLogin = (code: string) => {
    if (!amazonLoginData) {
      console.error('Could not login to Amazon because login data is missing')
      return
    }

    setLoading({
      refresh: true,
      message: t('status.logging', 'Logging In...')
    })
    amazon
      .login({
        client_id: amazonLoginData.client_id,
        code: code,
        code_verifier: amazonLoginData.code_verifier,
        serial: amazonLoginData.serial
      })
      .then(() => {
        handleSuccessfulLogin()
      })
  }

  const handleSuccessfulLogin = () => {
    navigate('/login')
  }

  const [webviewPreloadPath, setWebviewPreloadPath] = useState('')
  useEffect(() => {
    const fetchWebviewPreloadPath = async () => {
      const path = await window.api.getWebviewPreloadPath()
      setWebviewPreloadPath(path)
    }

    void fetchWebviewPreloadPath()
  }, [])

  useLayoutEffect(() => {
    const webview = webviewRef.current
    if (webview) {
      const loadstop = async () => {
        setLoading({ ...loading, refresh: false })
        // Humble's login surface (its own fetched standard-Chrome UA, applied
        // via the webview's `useragent` attribute) now lives in
        // HumbleLoginSurface.tsx — this component no longer renders a humble
        // route at all, so the generic fake 'Chrome/200.0' UA below applies
        // unconditionally to the runners that remain here.
        const userAgent =
          startUrl === epicLoginUrl
            ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) EpicGamesLauncher'
            : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/200.0'
        if (webview.getUserAgent() != userAgent) {
          webview.setUserAgent(userAgent)
        }
        // Ignore the login handling if not on login page
        if (!runner) {
          return
        } else if (runner === 'gog') {
          const pageUrl = webview.getURL()
          if (pageUrl.match(gogEmbedRegExp)) {
            const parsedURL = new URL(pageUrl)
            const code = parsedURL.searchParams.get('code')
            if (code) {
              setLoading({
                refresh: true,
                message: t('status.logging', 'Logging In...')
              })
              gog.login(code).then(() => handleSuccessfulLogin())
            }
          }
        } else if (runner === 'nile') {
          const pageURL = webview.getURL()
          const parsedURL = new URL(pageURL)
          const code = parsedURL.searchParams.get(
            'openid.oa2.authorization_code'
          )
          if (code) {
            handleAmazonLogin(code)
          }
        } else if (runner == 'legendary') {
          const pageUrl = webview.getURL()
          const parsedUrl = new URL(pageUrl)
          if (parsedUrl.hostname === 'localhost') {
            const code = parsedUrl.searchParams.get('code')
            if (code) {
              setLoading({
                refresh: true,
                message: t('status.logging', 'Logging In...')
              })
              epic.login(code).then(() => handleSuccessfulLogin())
            }
          }
        }
      }

      const onerror = ({ validatedURL }: DidFailLoadEvent) => {
        if (validatedURL && validatedURL.match(/track\.adtraction\.com/)) {
          const parsedUrl = new URL(validatedURL)
          const redirectUrl = parsedUrl.searchParams.get('url')
          const url = new URL(redirectUrl || 'https://gog.com')
          // Remove any port definitions
          // Recently GOG made a change where they started to provide a port
          // in a URL that adtraction is supposed to redirect to.
          // This leads to urls like https://gog.com:80
          // That address is unreachable
          //
          // Add a entry below if you notice this line of code and cringe
          // - username - DD/MM/YY
          // - imLinguin - 01/07/24
          url.port = ''
          webview.loadURL(url.toString())
          if (!localStorage.getItem('adtraction-warning')) {
            setShowAdtractionWarning(true)
          }
        }
      }

      webview.addEventListener('dom-ready', loadstop)
      webview.addEventListener('did-fail-load', onerror)
      // if the page title changed it's because the store loaded so there's
      // connectivity, we can update the status without waiting for the checks
      const updateConnectivity = () => {
        if (connectivity.status !== 'online') {
          window.api.setConnectivityOnline()
        }
      }
      webview.addEventListener('page-title-updated', updateConnectivity)

      return () => {
        webview.removeEventListener('dom-ready', loadstop)
        webview.removeEventListener('did-fail-load', onerror)
        webview.removeEventListener('page-title-updated', updateConnectivity)
      }
    }
    return
  }, [webviewRef.current, amazonLoginData, runner, webviewPreloadPath])

  useEffect(() => {
    const webview = webviewRef.current
    if (webview) {
      const onNavigate = () => {
        if (store) {
          const url = webview.getURL()
          if (validStoredUrl(url, store)) {
            sessionStorage.setItem(`last-url-${store}`, webview.getURL())
          }
        }
      }

      const onLoginNavigate = () => {
        if (runner === 'zoom') {
          const pageURL = webview.getURL()
          const parsedURL = new URL(pageURL)
          const token = parsedURL.searchParams.get('li_token')
          if (token) {
            setLoading({
              refresh: true,
              message: t('status.logging', 'Logging In...')
            })
            zoom.login(pageURL).then(() => handleSuccessfulLogin())
          }
        }
      }

      // this one is needed for gog/amazon
      webview.addEventListener('did-navigate', onNavigate)
      // this one is needed for epic
      webview.addEventListener('did-navigate-in-page', onNavigate)
      webview.addEventListener('did-navigate', onLoginNavigate)

      return () => {
        webview.removeEventListener('did-navigate', onNavigate)
        webview.removeEventListener('did-navigate-in-page', onNavigate)
        webview.removeEventListener('did-navigate', onLoginNavigate)
      }
    }

    return
  }, [webviewRef.current, store, runner])

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

  // Handle back/forward mouse buttons to navigate inside webview
  useEffect(() => {
    if (!webviewRef.current) return

    const webview = webviewRef.current

    const handleMouseBackForward = (ev: MouseEvent) => {
      // 3 and 4 are the typical `button` value for mouse back/forward buttons on mouseup events
      switch (ev.button) {
        case 3:
          if (webview.canGoBack()) {
            ev.preventDefault()
            webview.goBack()
          }
          break
        case 4:
          if (webview.canGoForward()) {
            ev.preventDefault()
            webview.goForward()
          }
          break
      }
    }

    document.addEventListener('mouseup', handleMouseBackForward)

    return () => {
      document.removeEventListener('mouseup', handleMouseBackForward)
    }
  }, [webviewRef.current])

  // Quick task 260821-iri: Humble's login surface (state, watch, webview,
  // navigation relay) now lives entirely in HumbleLoginSurface.tsx, hosted
  // by the Login screen's own co-mounted `HumbleLogin` overlay. This route
  // stays alive, unchanged in URL, for `HumbleExpiryToast` and
  // `Humble/Keys`, which still navigate here directly. Placed AFTER every
  // hook above (rules of hooks) and BEFORE the `!webviewPreloadPath` branch
  // below, whose own Tauri/humble special-casing this early return replaces.
  if (runner === 'humble') {
    return (
      <HumbleLoginSurface
        onDone={() => navigate('/login')}
        onCancelled={() => navigate('/login')}
      />
    )
  }

  if (!webviewPreloadPath) {
    if (isTauri() && isLoginPathname(pathname)) {
      // D-06 (REQ-34.4.1-07/-08): Phase 34.4.1 shipped a real Rust
      // login-window seam, so the old blanket "not available on this
      // build" message here would now be a lie for login routes. They
      // drive TauriLoginPanel instead: Humble gets an honest in-progress
      // surface, and the four OAuth runners get a declared-blocked one
      // naming the exact backend channel and Phase 34.5.
      return <TauriLoginPanel runner={runner} state={oauthLoginState} />
    }
    if (isTauri()) {
      // D-05: in-app store and wiki browsing was never this phase's job --
      // log the gap so it is legible to a developer too ("logged, never
      // silent"), and let the user escape to the system browser via
      // WebviewUnavailablePanel's Open-in-browser button.
      window.api.logInfo(
        `[WebView] in-app store/wiki browsing unavailable under Tauri (pathname=${pathname}) -- tracked as its own deferral (D-05)`
      )
      return <WebviewUnavailablePanel url={startUrl} />
    }
    // Structurally unreachable on Electron: it always resolves a real
    // preload path via getWebviewPreloadPath. Kept as a distinct branch
    // (not merged with the Tauri cases above) so a test can assert
    // Electron's shape never changes (D-04's rider). What landed instead
    // of the old single stopgap: TauriLoginPanel for login routes and a
    // reworded WebviewUnavailablePanel for store/wiki routes (Phase
    // 34.4.1 D-06).
    return <></>
  }

  return (
    <div className="WebView">
      {webviewRef.current && (
        <WebviewControls
          webview={webviewRef.current}
          initURL={startUrl}
          openInBrowser={!startUrl.startsWith('login')}
        />
      )}
      {loading.refresh && <UpdateComponent message={loading.message} />}
      <webview
        key={store}
        ref={webviewRef}
        className="WebView__webview"
        partition={`persist:${startUrl === epicLoginUrl ? 'epicstore' : store}`}
        src={startUrl}
        allowpopups={trueAsStr}
        preload={webviewPreloadPath}
      />
      {showLoginWarningFor && (
        <LoginWarning
          warnLoginForStore={showLoginWarningFor}
          onClose={onLoginWarningClosed}
        />
      )}
      {showAdtractionWarning && (
        <Dialog
          showCloseButton={true}
          onClose={() => {
            setShowAdtractionWarning(false)
            if (dontShowAdtractionWarning)
              localStorage.setItem('adtraction-warning', 'true')
          }}
        >
          <DialogHeader
            onClose={() => {
              setShowAdtractionWarning(false)
              if (dontShowAdtractionWarning)
                localStorage.setItem('adtraction-warning', 'true')
            }}
          >
            {t('adtraction-locked.title', 'Adtraction is blocked')}
          </DialogHeader>
          <DialogContent>
            <p>
              {t(
                'adtraction-locked.description',
                'It seems the track.adtraction.com domain was unable to load or is blocked. With adtraction, any purchase you make in the GOG store supports GameLib financially. Consider removing the block if you wish to contribute.'
              )}
            </p>
            <ToggleSwitch
              htmlId="dont-show-adtraction-warning-checkbox"
              value={dontShowAdtractionWarning}
              handleChange={(e) =>
                setDontShowAdtractionWarning(e.target.checked)
              }
              title={t(
                'adtraction-locked.dont-show-again',
                "Don't show this warning again"
              )}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
