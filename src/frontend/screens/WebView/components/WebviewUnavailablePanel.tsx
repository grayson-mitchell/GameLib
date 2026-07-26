import { useTranslation } from 'react-i18next'

interface Props {
  runner?: string
}

/**
 * D-04 (REQ-34.4-12): the honest "not available on this build" panel for
 * the embedded-browser login surface (Humble, Epic, GOG, Amazon).
 *
 * 34.1 D-12 made `getWebviewPreloadPath` return a declared-empty `''`
 * under Tauri, and `WebView/index.tsx`'s `!webviewPreloadPath` branch used
 * to return a bare `<></>` — so a Tauri user clicking "Log in to Humble"
 * (or any other storefront login) saw a blank screen with no error, no
 * log line, no explanation. This panel replaces that silence with a
 * concrete, honest statement of the gap and a working next step.
 *
 * No hooks of its own besides `useTranslation`, mirroring the
 * `CrossoverBadge.tsx` / `MacArchBadge.tsx` extraction pattern — invoked
 * directly as a plain function in its own test, no jsdom /
 * react-test-renderer required (see `src/frontend/jest.config.js`'s
 * docstring for why).
 *
 * No copy affordance: the simplest choice that trivially satisfies
 * `navigator-clipboard-noops-under-tauri` (a copy button would have to
 * route through `window.api.clipboardWriteText`, never
 * `navigator.clipboard`, which resolves WITHOUT writing under Tauri's
 * WKWebView and never rejects).
 *
 * The real fix — a shared `<webview>`/`session.fromPartition` seam — is
 * Phase 34.4.1's (D-01). This panel is a stopgap that only covers the
 * gap between 34.1 D-12 parking the login story here and 34.4.1 landing
 * it for real.
 */
const WebviewUnavailablePanel = ({ runner }: Props) => {
  const { t } = useTranslation()

  const runnerLabel = runner
    ? runner.charAt(0).toUpperCase() + runner.slice(1)
    : undefined

  const heading = t(
    'webview.unavailable.heading',
    'Login is not available on this build'
  )

  const bodyBase = t(
    'webview.unavailable.body',
    "GameLib's Tauri build does not yet embed a browser view for store logins."
  )
  const bodyStoreSuffix = runnerLabel
    ? ' ' +
      t(
        'webview.unavailable.store-suffix',
        `Signing in to ${runnerLabel} is unavailable here.`
      )
    : ''
  const body = bodyBase + bodyStoreSuffix

  const nextStep = t(
    'webview.unavailable.next-step',
    'Use the Electron build (npm start in a dev checkout, or the regular ' +
      'GameLib app) to sign in instead — the session carries across, ' +
      'since both builds share the same app data folder.'
  )

  return (
    <div className="WebView__unavailablePanel">
      <h2 className="WebView__unavailablePanel-heading">{heading}</h2>
      <p className="WebView__unavailablePanel-body">{body}</p>
      <p className="WebView__unavailablePanel-nextStep">{nextStep}</p>
    </div>
  )
}

export default WebviewUnavailablePanel
