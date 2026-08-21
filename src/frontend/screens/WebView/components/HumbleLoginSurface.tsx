import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import ContextProvider from 'frontend/state/ContextProvider'
import TauriLoginPanel from './TauriLoginPanel'
import type { TauriOAuthLoginState } from '../useTauriOAuthLogin'
import { attachHumbleLoginChromeCss } from './humbleLoginChromeCss'

interface Props {
  onDone: () => void
  onCancelled: () => void
}

const humbleLoginUrl = 'https://www.humblebundle.com/login'
const trueAsStr = 'true' as unknown as boolean | undefined

/**
 * Shell-agnostic Humble login surface. Extracted verbatim (quick task
 * 260821-iri, Task 1) from `WebView/index.tsx`'s `runner === 'humble'`
 * branch so the Login screen's new `HumbleLogin` Dialog overlay (Task 2) can
 * host it in-tree without hard-navigating to `/loginweb/humble`. Every
 * comment below carries D-05/D-06/D-16/D-17, F-34.4.2-19 and quick task
 * 260808-gl6 rationale forward unchanged from its pre-extraction home.
 *
 * Renders (in this exact, load-bearing order): the Tauri in-progress panel
 * when there is no webview preload path, then holds render until the
 * standard-Chrome UA has been fetched, then the embedded Electron
 * `<webview>` itself.
 */
export default function HumbleLoginSurface({ onDone, onCancelled }: Props) {
  const { t } = useTranslation()
  const { humble } = useContext(ContextProvider)
  const webviewRef = useRef<Electron.WebviewTag>(null)

  const [webviewPreloadPath, setWebviewPreloadPath] = useState('')
  useEffect(() => {
    const fetchWebviewPreloadPath = async () => {
      const path = await window.api.getWebviewPreloadPath()
      setWebviewPreloadPath(path)
    }

    void fetchWebviewPreloadPath()
  }, [])

  // D-05/D-07/UA note: the /loginweb/humble webview needs a standard-Chrome
  // user agent (not the fake 'Chrome/200.0' applied to other login runners
  // in WebView/index.tsx) so Google SSO offers its normal password / "Try
  // another way" flows. Fetched once per mount of this surface.
  const [humbleLoginUserAgent, setHumbleLoginUserAgent] = useState('')
  useEffect(() => {
    const fetchHumbleLoginUserAgent = async () => {
      const userAgent = await window.api.humbleGetLoginUserAgent()
      setHumbleLoginUserAgent(userAgent)
    }

    void fetchHumbleLoginUserAgent()
  }, [])

  // F-34.4.2-19 fix: `result.status === 'error'`/`'waiting'` used to be silently swallowed
  // here — the promise settled, but nothing told `TauriLoginPanel` (still statically rendering
  // "a sign-in window has opened" for `runner === 'humble'` regardless of any watch outcome),
  // so the user was left staring at a lying in-progress message forever. This state is what
  // lets the two of them agree: 'error'/'timeout' route through the SAME
  // `TauriOAuthLoginState` shape the four OAuth runners already use, so `TauriLoginPanel`'s
  // existing generic error/timeout branches (heading, body, Retry button) render for humble
  // too, instead of a humble-specific copy/path having to be invented from scratch.
  const [humbleLoginState, setHumbleLoginState] =
    useState<TauriOAuthLoginState>({ phase: 'idle' })

  // Drives the main-process login watch (D-05/D-06/D-16) from this surface:
  // starts it exactly once on mount (reconnect() instead of startLogin()
  // when arriving with an expired session), applies the resulting login
  // state on acceptance, and issues the D-06 silent-cancel signal on
  // unmount / leaving the surface.
  useEffect(() => {
    let mounted = true

    async function runHumbleLoginWatch() {
      const result = humble.expired
        ? await window.api.humbleReconnect()
        : await window.api.humbleStartLogin()
      // A late resolution after this surface unmounted must not call back —
      // the user already left it (D-06 silent cancel).
      if (!mounted) return
      if (result.status === 'done') {
        await humble.login(result)
        onDone()
      } else if (result.status === 'cancelled') {
        // Quick task 260808-gl6: the user closed the sign-in window. That is how you back
        // out of signing in, not a failure — so this dismisses back to Manage Accounts and
        // leaves `humbleLoginState` at 'idle', deliberately rendering NO panel. Ordered before
        // the 'error' branch below, which keeps its failure surface for the outcomes that
        // genuinely are failures (the UNDECIDABLE / UNSUPPORTED_OR_ERROR cookie-read verdicts
        // in `humble/user.ts`'s watch).
        window.api.logInfo(
          '[WebView] runner=humble phase=cancelled (sign-in window closed by the user)'
        )
        onCancelled()
      } else if (result.status === 'error') {
        // F-34.4.2-19: the backend watch gave up (e.g. the login window became
        // unreachable — see the humble-isloggedin-never-set debug session). Surface it
        // rather than leaving the static "signing in" copy on screen forever.
        window.api.logInfo(
          '[WebView] runner=humble phase=error (login watch settled with status=error)'
        )
        setHumbleLoginState({
          phase: 'error',
          message: t(
            'webview.login.humble.error.window_unreachable',
            'the Humble sign-in window closed or could not be reached'
          )
        })
      } else if (result.status === 'waiting') {
        // Only reachable HERE (i.e. while still mounted) via WR-03's ten-minute watch
        // deadline — `stopLogin()`'s own `{ status: 'waiting' }` settle always races an
        // unmount that has already set `mounted = false` first, so that path never reaches
        // this branch. Treated exactly like the OAuth runners' own 'timeout' phase.
        window.api.logInfo(
          '[WebView] runner=humble phase=timeout (login watch deadline elapsed)'
        )
        setHumbleLoginState({ phase: 'timeout' })
      }
    }

    void runHumbleLoginWatch()

    return () => {
      mounted = false
      window.api.humbleStopLogin()
    }
    // Only ever run once per mount of this surface — re-running on every
    // `humble` context update would restart the login watch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // D-17: relays the webview's navigation events to the main-process
  // login watch so a rejected candidate cookie is force-revalidated
  // (bypassing the poll-path throttle) — e.g. the SSO redirect landing
  // back on humblebundle.com.
  useLayoutEffect(() => {
    const webview = webviewRef.current
    if (webview) {
      const onHumbleLoginNavigate = () => {
        window.api.humbleLoginNavigated()
      }

      webview.addEventListener('did-navigate', onHumbleLoginNavigate)
      webview.addEventListener('did-navigate-in-page', onHumbleLoginNavigate)

      return () => {
        webview.removeEventListener('did-navigate', onHumbleLoginNavigate)
        webview.removeEventListener(
          'did-navigate-in-page',
          onHumbleLoginNavigate
        )
      }
    }
    return
  }, [webviewRef.current])

  // Login-chrome CSS (quick task 260822-di1, D-1): hides Humble's marketing footer so the
  // sign-in page reads as app UI. Delegates entirely to attachHumbleLoginChromeCss
  // (WebView/components/humbleLoginChromeCss.ts), which wires dom-ready -> insertCSS and is
  // re-applied on every navigation (Electron drops inserted CSS on navigation).
  useLayoutEffect(() => {
    const webview = webviewRef.current
    if (webview) {
      return attachHumbleLoginChromeCss(webview)
    }
    return
  }, [webviewRef.current])

  if (!webviewPreloadPath) {
    return <TauriLoginPanel runner="humble" state={humbleLoginState} />
  }

  // The humble login surface must not render until its standard-Chrome UA
  // has been fetched — applying it late (after the webview's first request)
  // would defeat the SSO fix (UA note).
  if (!humbleLoginUserAgent) {
    return <></>
  }

  return (
    <webview
      ref={webviewRef}
      className="HumbleLoginSurface__webview"
      partition="persist:humble"
      src={humbleLoginUrl}
      preload={webviewPreloadPath}
      useragent={humbleLoginUserAgent}
      allowpopups={trueAsStr}
    />
  )
}
