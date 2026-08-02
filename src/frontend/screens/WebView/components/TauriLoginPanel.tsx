import { useTranslation } from 'react-i18next'

import type { TauriOAuthLoginState } from '../useTauriOAuthLogin'

interface Props {
  runner?: string
  // Wired by plan 34.4.1-09: the per-runner capture state useTauriOAuthLogin() produces.
  // `undefined` (the default -- also what every plan-05 test still passes) renders the ORIGINAL
  // static declared-blocked copy below, unchanged, so no pre-existing test regresses. A defined
  // `state` layers the real capture phases on top of the SAME render tree, exactly as plan 05
  // reserved this prop to allow.
  state?: TauriOAuthLoginState
}

// D-04/REQ-34.4.1-08: the backend sign-in channel each OAuth runner's login route is waiting on.
// Nothing about these names is Humble-specific -- the Rust arms this panel's sibling seam drives
// (`humble_login_open` et al., `src-tauri/src/main.rs`) never reference Humble by name either,
// so the SAME mechanism serves all five runners. Plan 34.4.1-09 wires the real per-runner
// capture (`useTauriOAuthLogin.ts`) in front of this panel; this map only names the gap for
// whichever phase still needs to.
const OAUTH_CHANNEL_BY_RUNNER: Record<string, string> = {
  legendary: 'login',
  gog: 'authGOG',
  nile: 'authAmazon',
  zoom: 'authZoom'
}

/**
 * D-06/D-04 (REQ-34.4.1-07/REQ-34.4.1-08): the honest embedded-login surface for the Tauri
 * build's login routes.
 *
 * Two top-level surfaces, chosen by `runner`:
 *
 *  - `runner === 'humble'`: unchanged from plan 05 -- an IN-PROGRESS surface. A native sign-in
 *    window is already open; this page updates itself automatically once that watch resolves.
 *
 *  - any other runner (`legendary`/`gog`/`nile`/`zoom`), or no runner at all: the OAuth surface,
 *    now driven by `state` (plan 34.4.1-09):
 *      - `state` undefined/absent, or `{ phase: 'idle' }`: the ORIGINAL plan-05 declared-blocked
 *        copy (byte-identical wording) -- the safe default for a build where the capture hook
 *        was never wired in front of this component at all.
 *      - `{ phase: 'awaiting' }`: a real sign-in window is open and being watched.
 *      - `{ phase: 'blocked', runner, channel }`: a REAL capture just succeeded and the backend
 *        channel rejected it as unported -- REWORDED from plan 05's default so it never implies
 *        nothing was attempted (see the module doc comment in `useTauriOAuthLogin.ts`).
 *      - `{ phase: 'cancelled' | 'timeout' | 'error' }`: their own honest one-liners, each with a
 *        Retry button (`window.location.reload()` -- no new hook, keeps this component
 *        invocable as a plain function per this project's hookless/DOM-less test convention).
 *
 * No hooks besides `useTranslation` -- mirrors the `CrossoverBadge.tsx` / `WebviewUnavailablePanel.tsx`
 * extraction pattern so this component can still be invoked directly as a plain function in its
 * own test (no jsdom / react-test-renderer installed).
 *
 * Never calls `navigator.clipboard` -- see `navigator-clipboard-noops-under-tauri`.
 */
const TauriLoginPanel = ({ runner, state }: Props) => {
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
  const phase = state?.phase

  const retryButton = (
    <button
      type="button"
      className="WebView__unavailablePanel-retry"
      onClick={() => window.location.reload()}
    >
      {t('webview.login.oauth.retry', 'Retry')}
    </button>
  )

  if (phase === 'awaiting') {
    const heading = t(
      'webview.login.oauth.awaiting.heading',
      runnerLabel ? `Signing in to ${runnerLabel}` : 'Signing in'
    )
    const body = t(
      'webview.login.oauth.awaiting.body',
      'A sign-in window has opened. Complete sign-in there.'
    )
    return (
      <div className="WebView__unavailablePanel">
        <h2 className="WebView__unavailablePanel-heading">{heading}</h2>
        <p className="WebView__unavailablePanel-body">{body}</p>
      </div>
    )
  }

  if (state && phase === 'finalizing') {
    // Quick task 260803-eee: the popup just closed and the token exchange is in flight (roughly
    // 5-27 s). Prefer the runner carried on the state itself (set alongside `phase`) over the
    // separately-passed `runner` prop, mirroring the `blocked` branch below -- the state is the
    // single source of truth for which runner this transient phase belongs to.
    const finalizingRunnerLabel = state.runner
      ? state.runner.charAt(0).toUpperCase() + state.runner.slice(1)
      : runnerLabel
    const heading = t(
      'webview.login.oauth.finalizing.heading',
      finalizingRunnerLabel
        ? `Finalizing sign-in with ${finalizingRunnerLabel}…`
        : 'Finalizing sign-in…'
    )
    const body = t(
      'webview.login.oauth.finalizing.body',
      'Sign-in captured. Completing the exchange with the store — this can take a few seconds.'
    )
    window.api.logInfo(
      `[TauriLoginPanel] runner=${state.runner} phase=finalizing`
    )
    return (
      <div className="WebView__unavailablePanel">
        <div
          className="WebView__unavailablePanel-spinner"
          role="progressbar"
          aria-hidden="true"
        />
        <h2 className="WebView__unavailablePanel-heading">{heading}</h2>
        <p className="WebView__unavailablePanel-body">{body}</p>
      </div>
    )
  }

  if (phase === 'cancelled') {
    const heading = t(
      'webview.login.oauth.cancelled.heading',
      runnerLabel ? `Signing in to ${runnerLabel} was cancelled` : 'Sign-in was cancelled'
    )
    const body = t(
      'webview.login.oauth.cancelled.body',
      'The sign-in window was closed before completing. You can try again.'
    )
    window.api.logInfo(
      `[TauriLoginPanel] runner=${runner ?? 'unknown'} phase=cancelled`
    )
    return (
      <div className="WebView__unavailablePanel">
        <h2 className="WebView__unavailablePanel-heading">{heading}</h2>
        <p className="WebView__unavailablePanel-body">{body}</p>
        {retryButton}
      </div>
    )
  }

  if (phase === 'timeout') {
    const heading = t(
      'webview.login.oauth.timeout.heading',
      runnerLabel ? `Signing in to ${runnerLabel} timed out` : 'Sign-in timed out'
    )
    const body = t(
      'webview.login.oauth.timeout.body',
      'The sign-in window took too long to complete. You can try again.'
    )
    window.api.logInfo(
      `[TauriLoginPanel] runner=${runner ?? 'unknown'} phase=timeout`
    )
    return (
      <div className="WebView__unavailablePanel">
        <h2 className="WebView__unavailablePanel-heading">{heading}</h2>
        <p className="WebView__unavailablePanel-body">{body}</p>
        {retryButton}
      </div>
    )
  }

  if (phase === 'error') {
    const heading = t(
      'webview.login.oauth.error.heading',
      runnerLabel ? `Signing in to ${runnerLabel} failed` : 'Sign-in failed'
    )
    const body = t(
      'webview.login.oauth.error.body',
      `Something went wrong while signing in: ${state?.message ?? 'unknown error'}`
    )
    window.api.logInfo(
      `[TauriLoginPanel] runner=${runner ?? 'unknown'} phase=error message=${state?.message ?? 'unknown'}`
    )
    return (
      <div className="WebView__unavailablePanel">
        <h2 className="WebView__unavailablePanel-heading">{heading}</h2>
        <p className="WebView__unavailablePanel-body">{body}</p>
        {retryButton}
      </div>
    )
  }

  if (state && phase === 'blocked') {
    // REWORDED (Task 3): plan 05's default copy below is written for a world where no capture
    // happened at all. Once a real capture has succeeded and the backend channel is what
    // rejected it, the copy must say so -- never implying nothing was attempted.
    const heading = t(
      'webview.login.oauth.blocked.heading',
      runnerLabel
        ? `Signing in to ${runnerLabel} was captured, but can't finish yet`
        : "Sign-in was captured, but can't finish yet"
    )
    const body = t(
      'webview.login.oauth.blocked.body',
      `Your sign-in was captured successfully, but the ${channelLabel} backend channel is not ` +
        'ported to this build yet. This lands in Phase 34.5.'
    )
    window.api.logInfo(
      `[TauriLoginPanel] captured-blocked: runner=${state.runner} channel=${state.channel} -- lands in Phase 34.5`
    )
    return (
      <div className="WebView__unavailablePanel">
        <h2 className="WebView__unavailablePanel-heading">{heading}</h2>
        <p className="WebView__unavailablePanel-body">{body}</p>
      </div>
    )
  }

  // phase is undefined ('idle') or `state` was never supplied at all -- the ORIGINAL plan-05
  // declared-blocked default, byte-identical wording, so every plan-05 test keeps passing.
  // "logged, never silent" (34.1 D-13): a developer watching the log sees exactly which
  // runner/channel is blocked, even though the user-facing copy below is the primary signal
  // (T-34.4.1-27).
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
