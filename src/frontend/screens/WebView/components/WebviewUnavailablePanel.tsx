import { useTranslation } from 'react-i18next'

export type WebviewUnavailableReason = 'platform' | 'epic'

interface Props {
  url?: string
  /**
   * Phase 40 Plan 10 (D-02/D-08, REQ-40-12): which of the two honest,
   * distinct reasons this panel is showing for. Defaults to `'platform'` --
   * the pre-existing D-34 deep-link-to-an-unconfigured-origin call site in
   * `WebView/index.tsx` does not know or care which of the two applies, and
   * `'platform'` is the more general of the two (it was this panel's ONLY
   * reason before this plan minted the `'epic'` case).
   */
  reason?: WebviewUnavailableReason
}

/**
 * D-06 (REQ-34.4.1-07), reworded by Phase 40 Plan 10 (D-02/D-08, REQ-40-12)
 * into two distinct, honest reasons for `/store/*`, `/wiki` and
 * `store-page?store-url=` routes under Tauri:
 *
 * - `reason="platform"` (D-02): the live embed (Phase 40) is macOS-only.
 *   Windows and Linux name the platform as the reason, not "this build" --
 *   every spike behind the embed (016/017/018) is macOS-only and none of
 *   that evidence transfers to the Windows/Linux wry backends (filed as
 *   Phase 38 ledger items, D-04).
 * - `reason="epic"` (D-05/D-08): `/store/epic` is scoped out of the embed on
 *   EVERY platform, including macOS, because a Tauri-managed child webview
 *   (`Window::add_child`) still inherits the injected globals that are the
 *   confirmed, root-caused Talon fingerprint (2026-08-03) -- the
 *   pristine-WKWebView escape hatch that defeated Talon was a separate
 *   window with no wry webview at all, which `add_child` cannot produce.
 *   This is a PREDICTED failure with a known mechanism, not a proven one for
 *   store pages specifically (the confirmed 403 is on a login endpoint) --
 *   so the copy is deliberately provisional, never an accusation that Epic
 *   blocks in-app browsing. The Epic tile stays in
 *   `NavShell/components/StoresPanel/index.tsx` (D-08): a tile leading to a
 *   working open-in-browser escape hatch beats no tile. The spike that will
 *   settle the open question runs alongside Phase 40 and blocks nothing
 *   (`.planning/spikes/MANIFEST.md`).
 *
 * Until Phase 34.4.1 plan 05, this panel also covered the LOGIN case
 * (Humble/Epic/GOG/Amazon) with the same blanket "not available on this
 * build" copy -- an accurate statement while 34.1 D-12 had login itself
 * not working under Tauri at all. Phase 34.4.1 shipped a real Rust
 * login-window seam (plans 01-04), so showing a login route this message
 * would now be a lie. The login case moved to `TauriLoginPanel`; this
 * component now covers only the store/wiki gap.
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
const WebviewUnavailablePanel = ({ url, reason = 'platform' }: Props) => {
  const { t: tGamelib } = useTranslation('gamelib')

  const heading =
    reason === 'epic'
      ? tGamelib(
          'webview.unavailable.epic.heading',
          "Epic Store browsing isn't available in-app yet"
        )
      : tGamelib(
          'webview.unavailable.platform.heading',
          "In-app store and wiki browsing isn't available on this platform yet"
        )

  const body =
    reason === 'epic'
      ? tGamelib(
          'webview.unavailable.epic.body',
          "GameLib doesn't yet embed Epic Store pages in-app."
        )
      : tGamelib(
          'webview.unavailable.platform.body',
          "GameLib's in-app store and wiki browsing is available on " +
            "macOS. It isn't available on this platform yet."
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
