import { useTranslation } from 'react-i18next'

// Not exported: used only within this module (ts-prune / `pnpm find-deadcode`
// flagged the previously-exported form as a used-in-module finding -- there
// is no external consumer, so the export served no purpose).
type WebviewUnavailableReason = 'platform' | 'epic' | 'epic-challenged'

interface Props {
  url?: string
  /**
   * Phase 40 Plan 10 (D-02/D-08, REQ-40-12): which of the three honest,
   * distinct reasons this panel is showing for. Defaults to `'platform'` --
   * the pre-existing D-34 deep-link-to-an-unconfigured-origin call site in
   * `WebView/index.tsx` does not know or care which applies, and
   * `'platform'` is the most general of the three (it was this panel's ONLY
   * reason before Phase 40 Plan 10 minted `'epic'`).
   */
  reason?: WebviewUnavailableReason
  /**
   * D-10 (Phase 50 Plan 03): retry callback for `reason="epic-challenged"`
   * only -- wired to the Epic subview's navigate-to-start-URL-and-show
   * command by the caller. Mirrors the `url &&` guard the Open in browser
   * button already uses: when absent, the Try again button is not rendered
   * at all (never rendered disabled), so the panel never shows a dead
   * control.
   */
  onTryAgain?: () => void
}

/**
 * D-10/D-11 (Phase 50 Plan 03, UI-SPEC Copywriting Contract): extends the
 * pre-existing two-branch `reason === 'epic' ? ... : ...` ternaries to
 * three. Deliberately NOT a `Record<WebviewUnavailableReason, ...>` lookup
 * keyed by `reason` -- `i18next-parser` (see `i18next-parser.config.js`'s
 * `lexers.functions: ['t', 'tGamelib']`) statically greps for a LITERAL
 * string as `tGamelib`'s first argument; a call site like
 * `tGamelib(copy.headingKey, ...)` has no literal for it to find, so the
 * key would never get minted into `gamelib.json` at all (caught running
 * this task's own `pnpm i18n` step: `epic-challenged.heading`/`.body` were
 * silently absent from the diff while the sibling literal
 * `tGamelib('webview.unavailable.epic-challenged.tryAgain', ...)` call a
 * few lines below minted correctly). Every branch below is therefore its
 * own literal `tGamelib(...)` call, not a table lookup.
 */

/**
 * D-06 (REQ-34.4.1-07), reworded by Phase 40 Plan 10 (D-02/D-08, REQ-40-12)
 * into three distinct, honest reasons for `/store/*`, `/wiki` and
 * `store-page?store-url=` routes under Tauri:
 *
 * - `reason="platform"` (D-02): macOS, Linux and Windows all embed (the
 *   Linux arm per the positioning todo's 2026-09-28 decision (a): a real
 *   GTK-box-native embed rather than none; Windows since quick 261012-f25,
 *   WebView2 `add_child` through the macOS positioning path -- spike 027
 *   measured it on a harness, the shipped-app live run is still owed as
 *   Phase 38 ledger items, D-04). `src/preload/tauriAttach.ts` yields only
 *   those three platform values, so the branch in `WebView/index.tsx`'s
 *   platform gate is a defensive fallback (an unknown platform value). This
 *   reason is still reached on EVERY OS by the D-34 deep-link escape hatch,
 *   which renders this panel with no `reason` (so the default applies) for
 *   a deep link to an unconfigured origin. That is why the body copy names
 *   no OS.
 * - `reason="epic"` (D-05/D-08): as of Phase 50 (the D-05 call,
 *   `.planning/todos/completed/2026-10-12-make-the-d-05-call-*`), `/store/epic`
 *   embeds on macOS through the Rust-managed raw WKWebView subview Phase 50
 *   shipped -- this reason no longer applies there. It still applies on
 *   Windows and Linux, which have not adopted that subview. The history
 *   behind why the ORIGINAL embedded-child-webview approach was scoped out
 *   everywhere, and why a second, raw subview does not hit the same gate,
 *   is measured in full in
 *   `.planning/spikes/024-epic-store-in-embedded-child-webview/README.md`
 *   (eleven runs closing the question as a Cloudflare Turnstile challenge
 *   specific to Tauri's embedded-child webview construction, then five
 *   more runs proving a pristine/raw WKWebView subview does not hit it).
 *   This doc comment update does not restate that measurement, only the
 *   current rule it produced. The copy stays restrained, never an
 *   accusation that Epic blocks in-app browsing -- this edit does not
 *   change the user-facing copy, which stays true on Windows and Linux.
 *   The Epic tile stays in `NavShell/components/StoresPanel/index.tsx`
 *   (D-08): a tile leading to a working open-in-browser escape hatch beats
 *   no tile.
 * - `reason="epic-challenged"` (D-10/D-11, Phase 50 Plan 03): macOS-only,
 *   rendered when the raw WKWebView subview itself reports a Cloudflare
 *   challenge it cannot complete (Phase 50 Plan 02's challenge detection).
 *   Unlike the other two reasons this one offers a Try again button
 *   (`onTryAgain`) because a challenge is transient and retryable (D-11),
 *   never sticky -- the panel introduces no colour override for it, since
 *   nothing here is an error state.
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
const WebviewUnavailablePanel = ({
  url,
  reason = 'platform',
  onTryAgain
}: Props) => {
  const { t: tGamelib } = useTranslation('gamelib')

  const heading =
    reason === 'epic-challenged'
      ? tGamelib(
          'webview.unavailable.epic-challenged.heading',
          'Epic Store browsing is temporarily blocked'
        )
      : reason === 'epic'
        ? tGamelib(
            'webview.unavailable.epic.heading',
            "Epic Store browsing isn't available in-app yet"
          )
        : tGamelib(
            'webview.unavailable.platform.heading',
            "In-app store and wiki browsing isn't available on this platform yet"
          )

  const body =
    reason === 'epic-challenged'
      ? tGamelib(
          'webview.unavailable.epic-challenged.body',
          "Epic asked for a security check this view can't complete."
        )
      : reason === 'epic'
        ? tGamelib(
            'webview.unavailable.epic.body',
            "GameLib doesn't yet embed Epic Store pages in-app."
          )
        : tGamelib(
            'webview.unavailable.platform.body',
            "GameLib can't open this page in its in-app store and wiki browser."
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

  const tryAgainLabel = tGamelib(
    'webview.unavailable.epic-challenged.tryAgain',
    'Try again'
  )

  return (
    <div className="WebView__unavailablePanel">
      <h2 className="WebView__unavailablePanel-heading">{heading}</h2>
      <p className="WebView__unavailablePanel-body">{body}</p>
      <p className="WebView__unavailablePanel-nextStep">{nextStep}</p>
      {reason === 'epic-challenged' && onTryAgain && (
        <button
          type="button"
          className="WebView__unavailablePanel-tryAgain"
          onClick={() => onTryAgain()}
        >
          {tryAgainLabel}
        </button>
      )}
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
