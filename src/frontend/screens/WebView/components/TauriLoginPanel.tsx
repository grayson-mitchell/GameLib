import { useTranslation } from 'react-i18next'

interface Props {
  runner?: string
  // Reserved for plan 34.4.1-09: a per-runner capture state (redirect
  // succeeded/failed/pending) that will layer on top of this render tree
  // without restructuring it. Always `undefined` today, which renders the
  // static declared-blocked copy below for every non-Humble runner.
  state?: unknown
}

// D-04/REQ-34.4.1-08: the backend sign-in channel each OAuth runner's login
// route is waiting on. Nothing about these names is Humble-specific -- the
// Rust arms this panel's sibling seam drives (`humble_login_open` et al.,
// `src-tauri/src/main.rs`) never reference Humble by name either, so the
// SAME mechanism is capable of serving all five runners once each channel
// below is ported (plan 34.4.1-09 wires the calls; this panel only names
// the gap).
const OAUTH_CHANNEL_BY_RUNNER: Record<string, string> = {
  legendary: 'login',
  gog: 'authGOG',
  nile: 'authAmazon',
  zoom: 'authZoom'
}

/**
 * D-06/D-04 (REQ-34.4.1-07/REQ-34.4.1-08): the honest embedded-login
 * surface for the Tauri build's login routes -- the login half of the
 * branch `WebviewUnavailablePanel` used to cover alone with one blanket
 * "not available on this build" message. Phase 34.4.1 shipped a real Rust
 * login-window seam for Humble (plans 01-04), so showing Humble's login
 * route that message would now be a lie; the store/wiki-only half of the
 * old panel stayed behind in `WebviewUnavailablePanel` (this plan's Task 3).
 *
 * Two surfaces, chosen by `runner`:
 *
 *  - `runner === 'humble'`: an IN-PROGRESS surface. A native sign-in window
 *    is already open (see `WebView/index.tsx`'s humble login-watch effect,
 *    which starts it on mount); this page updates itself automatically once
 *    that watch resolves. No cancel button here -- leaving the route already
 *    issues `humbleStopLogin` via that effect's cleanup (D-06 silent
 *    cancel); a second, user-visible cancel path would need its own
 *    contract this plan does not define.
 *
 *  - any other runner (`legendary`/`gog`/`nile`/`zoom`), or no runner at
 *    all: the DECLARED-BLOCKED surface. Names the exact backend channel
 *    that is not ported to this build yet and the phase it lands in
 *    (34.5), and logs the same fact once via `window.api.logInfo`
 *    ("logged, never silent" -- 34.1 D-13 house style). This is D-04's
 *    declaration made visible to the user instead of a blank screen or a
 *    silent hang.
 *
 * WORDING CONSTRAINT (what makes this component reusable by plan 34.4.1-09
 * instead of rewritten by it): the declared-blocked copy is about the
 * BACKEND CHANNEL being unported, never about sign-in "not having been
 * attempted". Plan 34.4.1-09 wires a real per-runner capture in front of
 * this surface one wave later, and any claim that no sign-in was attempted
 * would become false at that point.
 *
 * No hooks besides `useTranslation` -- mirrors the `CrossoverBadge.tsx` /
 * `WebviewUnavailablePanel.tsx` extraction pattern so this component can be
 * invoked directly as a plain function in its own test (no jsdom /
 * react-test-renderer installed; see `src/frontend/jest.config.js`'s
 * docstring). The `window.api.logInfo` call therefore runs synchronously in
 * the render body rather than inside a `useEffect` -- the same convention
 * `WebView/index.tsx` already uses for its own Tauri-gap log line, and the
 * only shape a hookless, DOM-less test harness can observe.
 *
 * Never calls `navigator.clipboard` -- it resolves WITHOUT writing under
 * Tauri's WKWebView and never rejects (navigator-clipboard-noops-under-
 * tauri). Any future copy affordance here must use
 * `window.api.clipboardWriteText` instead.
 */
const TauriLoginPanel = ({ runner }: Props) => {
  const { t } = useTranslation()

  if (runner === 'humble') {
    const heading = t(
      'webview.login.humble.heading',
      'Signing in to Humble Bundle'
    )
    const body = t(
      'webview.login.humble.body',
      'A sign-in window has opened. Complete sign-in there — this ' +
        'page updates automatically once it succeeds.'
    )

    return (
      <div className="WebView__unavailablePanel">
        <h2 className="WebView__unavailablePanel-heading">{heading}</h2>
        <p className="WebView__unavailablePanel-body">{body}</p>
      </div>
    )
  }

  const channel = runner ? OAUTH_CHANNEL_BY_RUNNER[runner] : undefined
  const runnerLabel = runner
    ? runner.charAt(0).toUpperCase() + runner.slice(1)
    : undefined
  const channelLabel = channel ? `\`${channel}\`` : 'the sign-in channel'

  // "logged, never silent" (34.1 D-13): a developer watching the log sees
  // exactly which runner/channel is blocked, even though the user-facing
  // copy below is the primary signal (T-34.4.1-27).
  window.api.logInfo(
    `[TauriLoginPanel] declared-blocked: runner=${
      runner ?? 'unknown'
    } channel=${channel ?? 'unknown'} -- lands in Phase 34.5`
  )

  const heading = t(
    'webview.login.blocked.heading',
    runnerLabel
      ? `Signing in to ${runnerLabel} is not wired up yet`
      : 'Signing in is not wired up yet'
  )
  const body = t(
    'webview.login.blocked.body',
    `Your sign-in cannot be completed yet: ${channelLabel} is not ported ` +
      'to this build. This lands in Phase 34.5.'
  )

  return (
    <div className="WebView__unavailablePanel">
      <h2 className="WebView__unavailablePanel-heading">{heading}</h2>
      <p className="WebView__unavailablePanel-body">{body}</p>
    </div>
  )
}

export default TauriLoginPanel
