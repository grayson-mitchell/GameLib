import { useTranslation } from 'react-i18next'

interface Props {
  url?: string
}

/**
 * D-06 (REQ-34.4.1-07): the honest "in-app store and wiki browsing is not
 * available on this build" panel for `/store/*`, `/wiki` and
 * `store-page?store-url=` routes under Tauri.
 *
 * Until Phase 34.4.1 plan 05, this panel also covered the LOGIN case
 * (Humble/Epic/GOG/Amazon) with the same blanket "not available on this
 * build" copy -- an accurate statement while 34.1 D-12 had login itself
 * not working under Tauri at all. Phase 34.4.1 shipped a real Rust
 * login-window seam (plans 01-04), so showing a login route this message
 * would now be a lie. The login case moved to `TauriLoginPanel`; this
 * component now covers only the store/wiki gap, which was never this
 * phase's job (D-05) and is tracked as its own future work, not a
 * "not available" dead end -- hence the Open-in-browser escape hatch below.
 *
 * No hooks of its own besides `useTranslation`, mirroring the
 * `CrossoverBadge.tsx` / `MacArchBadge.tsx` extraction pattern -- invoked
 * directly as a plain function in its own test, no jsdom /
 * react-test-renderer required (see `src/frontend/jest.config.js`'s
 * docstring for why).
 *
 * The "Open in browser" button routes through the already-ported
 * `window.api.openExternalUrl` (never `navigator.clipboard`, which
 * resolves WITHOUT writing under Tauri's WKWebView, and never a raw
 * `shell.openExternal` call) -- T-34.4.1-26.
 */
const WebviewUnavailablePanel = ({ url }: Props) => {
  const { t: tGamelib } = useTranslation('gamelib')

  const heading = tGamelib(
    'webview.unavailable.heading',
    'In-app store and wiki browsing is not available on this build'
  )

  const body = tGamelib(
    'webview.unavailable.body',
    "GameLib's Tauri build does not yet embed a browser view for the " +
      'store and wiki pages.'
  )

  const nextStep = tGamelib(
    'webview.unavailable.next-step',
    'This is tracked as its own future work -- for now, use the button ' +
      'below to open it in your system browser instead.'
  )

  const openInBrowserLabel = tGamelib(
    'webview.unavailable.open-in-browser',
    'Open in browser'
  )

  return (
    <div className="WebView__unavailablePanel">
      <h2 className="WebView__unavailablePanel-heading">{heading}</h2>
      <p className="WebView__unavailablePanel-body">{body}</p>
      <p className="WebView__unavailablePanel-nextStep">{nextStep}</p>
      {url && (
        <button
          type="button"
          className="WebView__unavailablePanel-openInBrowser"
          onClick={() => window.api.openExternalUrl(url)}
        >
          {openInBrowserLabel}
        </button>
      )}
    </div>
  )
}

export default WebviewUnavailablePanel
