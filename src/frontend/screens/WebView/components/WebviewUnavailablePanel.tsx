import { useTranslation } from 'react-i18next'

// Not exported: used only within this module (ts-prune / `pnpm find-deadcode`
// flagged the previously-exported form as a used-in-module finding -- there
// is no external consumer, so the export served no purpose).
type WebviewUnavailableReason = 'platform' | 'epic'

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
 * - `reason="platform"` (D-02): the live embed ships on macOS and Linux (the
 *   Linux arm per the positioning todo's 2026-09-28 decision (a): a real
 *   GTK-box-native embed rather than none). Windows alone now reaches this
 *   panel. The claim that the only embed evidence is Mac-restricted is
 *   stale: 025/026 validated a native Linux `add_child` and its GtkBox
 *   lever, and 028/029 then measured the GtkFixed reparent lever at
 *   100/100 allocation reliability; 027 cross-checked Windows and got a
 *   live Windows 11 PASS on 2026-09-30, discharging `38-E01` -- but that
 *   run was a HARNESS, not the shipped app, so Windows embedding remains
 *   unbuilt (filed as Phase 38 ledger items, D-04; the macOS evidence is
 *   still 016/017/018).
 * - `reason="epic"` (D-05/D-08): `/store/epic` is scoped out of the embed on
 *   EVERY platform, including macOS. Spike 024 measured why, across five
 *   runs, and closed the question
 *   (`.planning/spikes/024-epic-store-in-embedded-child-webview/README.md`):
 *   the gate is a Cloudflare Turnstile challenge. The injected globals, read
 *   from inside the loaded Epic page, were present in the run that rendered
 *   fine as well as in the runs that were challenged, so the 2026-08-03
 *   Talon login-endpoint mechanism is REFUTED, not confirmed -- it does not
 *   explain the store gate. This is measured and permanent, not predicted:
 *   the follow-up todo closed WONTFIX on 2026-09-15. The copy stays
 *   restrained, never an accusation that Epic blocks in-app browsing -- run
 *   1 rendered the store fully and all five runs share one residential IP,
 *   leaving reputation-vs-webview unseparated; this edit does not change
 *   the user-facing copy. The Epic tile stays in
 *   `NavShell/components/StoresPanel/index.tsx` (D-08): a tile leading to a
 *   working open-in-browser escape hatch beats no tile.
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
