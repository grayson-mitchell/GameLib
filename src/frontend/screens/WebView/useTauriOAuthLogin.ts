import { useEffect, useState } from 'react'

import { isTauri } from '../../../preload/tauriTransport'
import { UNPORTED_CHANNEL_MARKER } from 'common/types/sidecarTransport'
import type { OAuthCaptureOutcome, OAuthRunner } from 'common/types/oauthLogin'
import type { NileLoginData } from 'common/types/nile'
import { EPIC_LOGIN_URL, GOG_LOGIN_URL, ZOOM_LOGIN_URL } from './loginRoutes'

/**
 * The renderer half of REQ-34.4.1-08's "wired" claim (Phase 34.4.1 Plan 09, D-04): drives
 * `window.api.oauthCaptureLogin` for one of the four OAuth login runners, then hands the
 * captured code/token to that runner's still-unported auth channel (`login`/`authGOG`/
 * `authAmazon`/`authZoom`) inside a `try`/`catch` that turns the EXPECTED
 * `UNPORTED_CHANNEL_MARKER` rejection into the declared Phase-34.5 `blocked` state — never
 * swallowed, never mislabelled, and never allowed to float as an unhandled rejection.
 * `GlobalState.tsx`'s `epicLogin`/`gogLogin`/`amazonLogin`/`zoomLogin` have no try/catch of
 * their own (verified read-only, T-34.4.1-46) — this hook calls the raw `window.api.*` channels
 * directly rather than those wrappers, precisely so it can own the catch without touching
 * `GlobalState.tsx` (byte-identical for Electron, per D-04's rider).
 */
export type TauriOAuthLoginState =
  | { phase: 'idle' }
  | { phase: 'awaiting' }
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

/**
 * Guard first: outside Tauri, or for any runner that isn't one of the four OAuth runners
 * (`undefined`, `'humble'`, an unrecognized string), this is a total no-op — `{ phase: 'idle' }`
 * and nothing started. No other gate exists (a stale premise in a guard's own comment is exactly
 * how 34.4's gate item 2 shipped a registered-but-unreachable channel).
 */
export function useTauriOAuthLogin(runner: OAuthRunner | undefined): TauriOAuthLoginState {
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

    async function run(): Promise<void> {
      setState({ phase: 'awaiting' })

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
        if (cancelled) return
        const message = error instanceof Error ? error.message : String(error)
        window.api.logInfo(
          `[useTauriOAuthLogin] runner=${activeRunner} phase=error (failed to resolve login url)`
        )
        setState({ phase: 'error', message })
        return
      }

      const outcome: OAuthCaptureOutcome = await window.api.oauthCaptureLogin({
        runner: activeRunner,
        url
      })
      if (cancelled) return

      if (outcome.status === 'cancelled') {
        window.api.logInfo(`[useTauriOAuthLogin] runner=${activeRunner} phase=cancelled`)
        setState({ phase: 'cancelled' })
        return
      }
      if (outcome.status === 'timeout') {
        window.api.logInfo(`[useTauriOAuthLogin] runner=${activeRunner} phase=timeout`)
        setState({ phase: 'timeout' })
        return
      }
      if (outcome.status === 'unsupported') {
        window.api.logInfo(`[useTauriOAuthLogin] runner=${activeRunner} phase=error (unsupported)`)
        setState({
          phase: 'error',
          message: 'OAuth capture is not supported on this build'
        })
        return
      }
      if (outcome.status === 'error') {
        window.api.logInfo(`[useTauriOAuthLogin] runner=${activeRunner} phase=error`)
        setState({ phase: 'error', message: outcome.message })
        return
      }

      // outcome.status === 'captured' -- hand the code/token to the still-unported auth
      // channel. D-04/SEAM Invariant B: this call is EXPECTED to reject with
      // UNPORTED_CHANNEL_MARKER until Phase 34.5 -- that rejection is caught below, never
      // thrown past this function.
      try {
        if (activeRunner === 'legendary') {
          await window.api.login(outcome.code ?? '')
        } else if (activeRunner === 'gog') {
          await window.api.authGOG(outcome.code ?? '')
        } else if (activeRunner === 'nile') {
          if (!amazonData) {
            throw new Error('missing Amazon login data for authAmazon')
          }
          await window.api.authAmazon({
            client_id: amazonData.client_id,
            code: outcome.code ?? '',
            code_verifier: amazonData.code_verifier,
            serial: amazonData.serial
          })
        } else {
          // zoom: authZoom takes the FULL redirect url, never the token value.
          await window.api.authZoom(outcome.redirectUrl)
        }
        if (cancelled) return
        // Resolved WITHOUT throwing -- Phase 34.5 has landed and this channel is real now.
        // This hook's own job (capture) is done; fall through to idle rather than forcing
        // 'blocked' -- it must never become the thing that blocks 34.5.
        window.api.logInfo(`[useTauriOAuthLogin] runner=${activeRunner} phase=idle (channel resolved)`)
        setState({ phase: 'idle' })
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : String(error)
        if (message.includes(UNPORTED_CHANNEL_MARKER)) {
          const channel = OAUTH_CHANNEL_BY_RUNNER[activeRunner]
          window.api.logInfo(
            `[useTauriOAuthLogin] runner=${activeRunner} phase=blocked channel=${channel}`
          )
          setState({ phase: 'blocked', runner: activeRunner, channel })
        } else {
          // A REAL backend failure must never be mislabelled as "waiting for Phase 34.5".
          window.api.logInfo(`[useTauriOAuthLogin] runner=${activeRunner} phase=error`)
          setState({ phase: 'error', message })
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [runner])

  return state
}
