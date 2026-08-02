import { useEffect, useState } from 'react'

import { isTauri } from '../../../preload/tauriTransport'
import { UNPORTED_CHANNEL_MARKER } from 'common/types/sidecarTransport'
import type { OAuthCaptureOutcome, OAuthRunner } from 'common/types/oauthLogin'
import type { NileLoginData } from 'common/types/nile'
import { EPIC_LOGIN_URL, GOG_LOGIN_URL, ZOOM_LOGIN_URL } from './loginRoutes'

/**
 * The renderer half of REQ-34.4.1-08's "wired" claim (Phase 34.4.1 Plan 09, D-04), extended by
 * Phase 34.5 Plan 26 (F-34.5-G6-02 layer 2, F-34.5-G6-03): drives `window.api.oauthCaptureLogin`
 * for one of the four OAuth login runners, then hands the captured code/token directly to that
 * runner's now-ported auth channel (`login`/`authGOG`/`authAmazon`/`authZoom`) inside a
 * `try`/`catch` that turns an `UNPORTED_CHANNEL_MARKER` rejection into `{ phase: 'blocked' }`
 * (legacy defensive code, kept for any channel a future runner has not yet ported) and any other
 * rejection into `{ phase: 'error' }` — never swallowed, never mislabelled, and never allowed to
 * float as an unhandled rejection.
 *
 * Once Phase 34.5 ported these channels for real, a resolved `{ status: 'done' }` response
 * stopped being merely "the hook's job is done" — it is the ONE place a Tauri OAuth login can
 * trigger the post-login completion work `GlobalState.tsx`'s `epicLogin`/`gogLogin`/
 * `amazonLogin`/`zoomLogin` wrappers perform for Electron's `<webview>` path (`setState` of the
 * signed-in username plus `handleSuccessfulLogin(runner)` -> `refreshLibrary`). This hook still
 * calls the raw `window.api.*` channel itself (so it keeps owning the `UNPORTED_CHANNEL_MARKER`
 * catch — the wrappers have no try/catch of their own, verified read-only as T-34.4.1-46) and,
 * on `status === 'done'`, invokes the injected `onLoginSuccess` completion callback with exactly
 * the payload `createOAuthLoginCompletion` below needs to reproduce that same post-login work —
 * routed through `GlobalState`'s own `handleSuccessfulLogin`, never a second, parallel refresh
 * path. `GlobalState.tsx` wires `completeOAuthLogin = createOAuthLoginCompletion({...})` and
 * exposes it on context; `index.tsx` passes it as this hook's second argument. Electron never
 * reaches any of this — the `isTauri()` guard below is still first and unconditional.
 *
 * Plan 34.5-34: cancellation (effect teardown) suppresses React state updates ONLY — it must
 * never abandon an irreversible side effect (a credential already written to disk) or a
 * perishable one (a single-use OAuth code); a future "cleanup" that restores an early return on
 * `cancelled` at the capture or auth-exchange sites would silently reintroduce that defect.
 *
 * Quick task 260803-eee: the popup-close (`oauthCaptureLogin` resolving `{ status: 'captured' }`)
 * to token-exchange-complete (`status: 'done'`) window is 5–27 s of dead UI under Tauri — the user
 * stares at the static "Signing in to <Runner>" panel with no indication anything is happening.
 * The `finalizing` phase below fills that gap. It needs no new IPC channel: `oauthCaptureLogin`'s
 * own resolution already IS the popup-closed signal, so the transition is inserted at the existing
 * captured/non-captured fork, immediately before the auth-exchange call.
 */
export type TauriOAuthLoginState =
  | { phase: 'idle' }
  | { phase: 'awaiting' }
  | { phase: 'finalizing'; runner: OAuthRunner }
  | { phase: 'blocked'; runner: OAuthRunner; channel: string }
  | { phase: 'cancelled' }
  | { phase: 'timeout' }
  | { phase: 'error'; message: string }

// D-04/REQ-34.4.1-08: the backend sign-in channel each runner's captured code is handed to.
// Mirrors TauriLoginPanel.tsx's own OAUTH_CHANNEL_BY_RUNNER map (plan 05) exactly — kept as a
// separate copy rather than a shared import, since the two modules use it for different
// purposes (this one recognises WHICH channel just rejected; the panel only names it in copy)
// and neither is the other's implementation detail.
const OAUTH_CHANNEL_BY_RUNNER: Record<OAuthRunner, string> = {
  legendary: 'login',
  gog: 'authGOG',
  nile: 'authAmazon',
  zoom: 'authZoom'
}

const OAUTH_RUNNERS: readonly OAuthRunner[] = ['legendary', 'gog', 'nile', 'zoom']

function isOAuthRunner(value: unknown): value is OAuthRunner {
  return (
    typeof value === 'string' && (OAUTH_RUNNERS as readonly string[]).includes(value)
  )
}

// Phase 34.5 Plan 26 (F-34.5-G6-02 layer 2): the minimal shape a `status === 'done'` auth-channel
// response is reduced to before it is handed to the completion callback. Deliberately loose
// (username/user_id, never the raw per-runner response object) so `GlobalState.tsx` never has to
// import this hook's runner-specific response-shape knowledge -- it only needs to know what to
// DO with a signed-in username, exactly like its own epicLogin/gogLogin/amazonLogin/zoomLogin
// wrappers already do.
export type OAuthLoginCompletionPayload = {
  runner: OAuthRunner
  username?: string
  user_id?: string
}

// Dependencies `createOAuthLoginCompletion` needs to reproduce the post-login half of
// GlobalState.tsx's epicLogin/gogLogin/amazonLogin/zoomLogin wrappers -- setting the runner's
// username into state, then routing through the EXISTING `handleSuccessfulLogin` (which itself
// calls `refreshLibrary`), never a second, parallel refresh path (per this plan's domain
// context). `setState` is intentionally loosely typed: GlobalState's own `PureComponent<Props>`
// has no explicit State generic (defaults to `{}`), so `this.setState(...)` already accepts any
// shape at the call site this factory is bound into.
export type OAuthLoginCompletionDeps = {
  setState: (update: Record<string, unknown>) => void
  handleSuccessfulLogin: (runner: OAuthRunner) => void
}

/**
 * Builds the completion callback `GlobalState.tsx` exposes on context as `completeOAuthLogin`
 * (Phase 34.5 Plan 26). Exported (rather than inlined into the class) so this exact wiring can be
 * driven directly in tests, with `setState`/`handleSuccessfulLogin` spied, without instantiating
 * the full `GlobalState` React component (see `useTauriOAuthLogin.test.tsx`'s "library refresh"
 * suite).
 */
export function createOAuthLoginCompletion(
  deps: OAuthLoginCompletionDeps
): (payload: OAuthLoginCompletionPayload) => void {
  return ({ runner, username, user_id }) => {
    switch (runner) {
      case 'legendary':
        deps.setState({ epic: { library: [], username } })
        break
      case 'gog':
        deps.setState({ gog: { library: [], username } })
        break
      case 'nile':
        deps.setState({ amazon: { library: [], user_id, username } })
        break
      case 'zoom':
        deps.setState({ zoom: { library: [], username, enabled: true } })
        break
    }
    deps.handleSuccessfulLogin(runner)
  }
}

/**
 * Guard first: outside Tauri, or for any runner that isn't one of the four OAuth runners
 * (`undefined`, `'humble'`, an unrecognized string), this is a total no-op — `{ phase: 'idle' }`
 * and nothing started, and `onLoginSuccess` is never invoked. No other gate exists (a stale
 * premise in a guard's own comment is exactly how 34.4's gate item 2 shipped a
 * registered-but-unreachable channel).
 *
 * Quick task 260803-eee Task 4: `onCancelled` is the user-cancelled sibling of `onLoginSuccess`,
 * called directly at the `outcome.status === 'cancelled'` site rather than through
 * `safeSetState`'s `!cancelled` gate -- the same pattern `onLoginSuccess` uses so a mid-flight
 * teardown cannot suppress it. `WebView/index.tsx`'s `handleTauriOAuthCancelled` wires this to
 * `navigate('/login')` (guarded by its own `mountedRef`, not this hook's `cancelled`) so the
 * panel does not get stuck on the cancelled surface indefinitely -- the cancel-path counterpart
 * of the success-path navigation fixed by `handleTauriOAuthSuccess`. Scoped strictly to
 * `cancelled`: timeout/error/unsupported keep their own retry-affordance surfaces and are
 * untouched by this callback. Like its timeout/error/unsupported siblings, `onCancelled` is still
 * reachable only through the shared pre-capture short-circuit a few lines above (an effect torn
 * down before `oauthCaptureLogin` resolves returns before any of these four branches run) --
 * that guard is not something this callback overrides.
 */
export function useTauriOAuthLogin(
  runner: OAuthRunner | undefined,
  onLoginSuccess?: (payload: OAuthLoginCompletionPayload) => void,
  onCancelled?: () => void
): TauriOAuthLoginState {
  const [state, setState] = useState<TauriOAuthLoginState>({ phase: 'idle' })

  useEffect(() => {
    if (!isTauri() || !isOAuthRunner(runner)) {
      setState({ phase: 'idle' })
      return
    }

    // Captured in a local so a stale closure can never observe a later `runner` prop change —
    // this effect re-runs on every `runner` change anyway (deps below), but this keeps every
    // reference inside `run()` explicit about which runner it belongs to.
    const activeRunner = runner
    let cancelled = false
    // Plan 34.5-34 Task 1: distinguishes "the effect was torn down while nothing was in
    // flight" from "the effect was torn down mid-login" -- set true at every terminal path of
    // `run()`, read only by the cleanup's teardown-diagnostic line below. Plan 34.5-34 Task 2
    // reuses this SAME flag to guard against invoking `onLoginSuccess` twice.
    let reachedTerminal = false

    // Plan 34.5-34 Task 2: the ONE place `cancelled` is allowed to have any effect at all --
    // every state update in `run()` goes through this helper instead of the raw setter, so the
    // gate is checkable in one place rather than scattered across N early returns.
    function safeSetState(next: TauriOAuthLoginState): void {
      if (!cancelled) {
        setState(next)
      }
    }

    async function run(): Promise<void> {
      safeSetState({ phase: 'awaiting' })

      let url: string
      let amazonData: NileLoginData | undefined
      try {
        if (activeRunner === 'legendary') {
          url = EPIC_LOGIN_URL
        } else if (activeRunner === 'gog') {
          url = GOG_LOGIN_URL
        } else if (activeRunner === 'zoom') {
          url = ZOOM_LOGIN_URL
        } else {
          // nile: account-session-dependent, fetched fresh per attempt (mirrors index.tsx's
          // own /loginweb/nile effect) -- client_id/code_verifier/serial are kept for the
          // authAmazon call below, never re-derived.
          amazonData = await window.api.getAmazonLoginData()
          url = amazonData.url
        }
      } catch (error) {
        if (cancelled) {
          window.api.logInfo(
            `[useTauriOAuthLogin] runner=${activeRunner} phase=cancelled-midflight at=login-url`
          )
          return
        }
        const message = error instanceof Error ? error.message : String(error)
        window.api.logInfo(
          `[useTauriOAuthLogin] runner=${activeRunner} phase=error (failed to resolve login url)`
        )
        reachedTerminal = true
        safeSetState({ phase: 'error', message })
        return
      }

      let outcome: OAuthCaptureOutcome
      try {
        outcome = await window.api.oauthCaptureLogin({
          runner: activeRunner,
          url
        })
      } catch (error) {
        if (cancelled) {
          window.api.logInfo(
            `[useTauriOAuthLogin] runner=${activeRunner} phase=cancelled-midflight at=capture-transport`
          )
          return
        }
        const message = error instanceof Error ? error.message : String(error)
        // Distinct literal on purpose (mirrors UNPORTED_CHANNEL_MARKER/STORE_LAZY_MISS_MARKER):
        // a transport failure (e.g. the pre-34.5-23 60s/300s invoke-bound mismatch, F-34.5-G6-02)
        // is a different defect from a resolved { status: 'error' } outcome below, and a future
        // reader must be able to tell them apart from the log alone.
        window.api.logInfo(
          `[useTauriOAuthLogin] runner=${activeRunner} phase=error capture-transport-failed message=${message}`
        )
        reachedTerminal = true
        safeSetState({ phase: 'error', message })
        return
      }
      if (cancelled) {
        // Plan 34.5-34 Task 2: `cancelled` gates state updates only -- a `captured` outcome
        // holds a single-use OAuth code that would otherwise be discarded forever, so it falls
        // through to the auth exchange below instead of returning. Every OTHER outcome carries
        // nothing to propagate, so it still returns here (nothing lost by returning).
        window.api.logInfo(
          `[useTauriOAuthLogin] runner=${activeRunner} phase=cancelled-midflight at=capture`
        )
        if (outcome.status !== 'captured') {
          reachedTerminal = true
          return
        }
      }

      if (outcome.status === 'cancelled') {
        window.api.logInfo(`[useTauriOAuthLogin] runner=${activeRunner} phase=cancelled`)
        reachedTerminal = true
        // Quick task 260803-eee Task 4: called directly, NOT routed through `safeSetState`'s own
        // `!cancelled` gate -- the navigation this drives in WebView/index.tsx cannot be
        // suppressed the way the terminal state update can be. (This branch is only reached at
        // all when a `captured`-outcome fall-through, or a not-yet-torn-down effect, got here in
        // the first place -- the same pre-capture short-circuit above that already governs the
        // timeout/error/unsupported siblings applies equally here; nothing about `onCancelled`
        // changes that shared gate.)
        onCancelled?.()
        safeSetState({ phase: 'cancelled' })
        return
      }
      if (outcome.status === 'timeout') {
        window.api.logInfo(`[useTauriOAuthLogin] runner=${activeRunner} phase=timeout`)
        reachedTerminal = true
        safeSetState({ phase: 'timeout' })
        return
      }
      if (outcome.status === 'unsupported') {
        window.api.logInfo(`[useTauriOAuthLogin] runner=${activeRunner} phase=error (unsupported)`)
        reachedTerminal = true
        safeSetState({
          phase: 'error',
          message: 'OAuth capture is not supported on this build'
        })
        return
      }
      if (outcome.status === 'error') {
        window.api.logInfo(`[useTauriOAuthLogin] runner=${activeRunner} phase=error`)
        reachedTerminal = true
        safeSetState({ phase: 'error', message: outcome.message })
        return
      }

      // outcome.status === 'captured' -- hand the code/token to the runner's now-ported auth
      // channel. A registered-but-not-yet-ported runner is EXPECTED to reject with
      // UNPORTED_CHANNEL_MARKER -- that rejection is caught below, never thrown past this
      // function. A resolved response is checked for `status === 'done'` before this hook ever
      // treats the login as successful (F-34.5-G6-02 layer 2, F-34.5-G6-03): a resolved-but-
      // refused response must never masquerade as "not wired up yet".
      //
      // Quick task 260803-eee: the popup just closed and the auth-exchange call below is about
      // to start -- this is the exact boundary the finalizing phase names. Not a terminal phase
      // (reachedTerminal stays untouched), so it never suppresses the onLoginSuccess invocation
      // further down.
      window.api.logInfo(
        `[useTauriOAuthLogin] runner=${activeRunner} phase=finalizing (capture complete, exchanging with auth channel)`
      )
      safeSetState({ phase: 'finalizing', runner: activeRunner })
      try {
        let status: string
        let username: string | undefined
        let user_id: string | undefined

        if (activeRunner === 'legendary') {
          const response = await window.api.login(outcome.code ?? '')
          status = response.status
          username = response.data?.displayName
        } else if (activeRunner === 'gog') {
          const response = await window.api.authGOG(outcome.code ?? '')
          status = response.status
          username = response.data?.username
        } else if (activeRunner === 'nile') {
          if (!amazonData) {
            throw new Error('missing Amazon login data for authAmazon')
          }
          const response = await window.api.authAmazon({
            client_id: amazonData.client_id,
            code: outcome.code ?? '',
            code_verifier: amazonData.code_verifier,
            serial: amazonData.serial
          })
          status = response.status
          username = response.user?.name
          user_id = response.user?.user_id
        } else {
          // zoom: authZoom takes the FULL redirect url, never the token value. Its response
          // carries no user data -- mirrors GlobalState.tsx's zoomLogin, which fetches
          // getZoomUserInfo() separately only once status is confirmed 'done'.
          const response = await window.api.authZoom(outcome.redirectUrl)
          status = response.status
          if (status === 'done') {
            const userInfo = await window.api.getZoomUserInfo()
            username = userInfo?.username
          }
        }
        if (cancelled) {
          // Plan 34.5-34 Task 2: reached AFTER the backend has already written the credential
          // to disk (or refused it) -- `authStatus=done` here is the unambiguous signature of a
          // completed authentication that must still propagate below. `cancelled` gates the
          // state update (via safeSetState) only; it never gates `onLoginSuccess`.
          window.api.logInfo(
            `[useTauriOAuthLogin] runner=${activeRunner} phase=cancelled-midflight at=auth authStatus=${status}`
          )
        }

        if (status === 'done') {
          // The auth channel accepted the captured code -- hand the login on to the SAME
          // completion path GlobalState.tsx's own wrappers use (setState +
          // handleSuccessfulLogin -> refreshLibrary), never a second, parallel refresh path.
          // Always fires, whether or not teardown landed first (Plan 34.5-34 Task 2) -- an
          // already-persisted credential must never be discarded.
          window.api.logInfo(
            `[useTauriOAuthLogin] runner=${activeRunner} phase=idle (login completed, library refresh triggered)`
          )
          if (!reachedTerminal) {
            reachedTerminal = true
            onLoginSuccess?.({ runner: activeRunner, username, user_id })
          }
          safeSetState({ phase: 'idle' })
        } else {
          // A resolved-but-refused response (e.g. { status: 'failed' }/{ status: 'error' }) is a
          // REAL backend refusal, not a "channel not wired up yet" state -- it must never present
          // as blocked, and onLoginSuccess must never be invoked for it.
          window.api.logInfo(
            `[useTauriOAuthLogin] runner=${activeRunner} phase=error (auth channel refused: status=${status})`
          )
          reachedTerminal = true
          safeSetState({
            phase: 'error',
            message: `Login failed for ${activeRunner}: status=${status}`
          })
        }
      } catch (error) {
        // Not one of Task 1's four named cancellation sites (`capture`, `auth`, `login-url`,
        // `capture-transport`) -- this guard catches a REJECTED auth-channel call, which (like
        // login-url/capture-transport) has nothing irreversible to lose, so it is intentionally
        // left un-instrumented per this plan's fixed `<site>` vocabulary.
        if (cancelled) return
        const message = error instanceof Error ? error.message : String(error)
        if (message.includes(UNPORTED_CHANNEL_MARKER)) {
          const channel = OAUTH_CHANNEL_BY_RUNNER[activeRunner]
          window.api.logInfo(
            `[useTauriOAuthLogin] runner=${activeRunner} phase=blocked channel=${channel}`
          )
          reachedTerminal = true
          safeSetState({ phase: 'blocked', runner: activeRunner, channel })
        } else {
          // A REAL backend failure must never be mislabelled as "waiting for Phase 34.5".
          window.api.logInfo(`[useTauriOAuthLogin] runner=${activeRunner} phase=error`)
          reachedTerminal = true
          safeSetState({ phase: 'error', message })
        }
      }
    }

    void run()

    return () => {
      cancelled = true
      // Plan 34.5-34 Task 1: the observation that distinguishes "torn down while nothing was
      // happening" from "torn down mid-login" -- the discrimination the checkpoint could not
      // make from the log alone.
      window.api.logInfo(
        `[useTauriOAuthLogin] runner=${activeRunner} phase=teardown inflight=${!reachedTerminal}`
      )
    }
  }, [runner, onLoginSuccess, onCancelled])

  return state
}
