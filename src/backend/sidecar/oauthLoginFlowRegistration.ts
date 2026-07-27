/**
 * Curated channel registration for the OAuth login-capture driver (Phase 34.4.1 Plan 09,
 * D-01/D-04, REQ-34.4.1-08).
 *
 * Registers exactly one channel, `oauthCaptureLogin`, onto `electronStub`'s `ipcMain` recorder.
 * It is a `handle` (never a `send`) because the renderer must await the typed outcome — a
 * send-kind mistake here would fail 100% SILENTLY at runtime (no reject, no timeout, no log
 * line — `sidecar-send-channels-fail-silently`), so both directions are cross-checked in
 * `__tests__/oauthLoginCapture.test.ts`'s registration-kind describe block.
 *
 * Kept in its own dedicated module (rather than folded into `humbleLoginFlowRegistration.ts`)
 * specifically so the claim "this plan adds exactly one new channel, used by four OAuth login
 * routes" stays auditable from one file — mirrors the same discipline
 * `clipboardFlowRegistration.ts` and `humbleLoginFlowRegistration.ts` already established for
 * their own slices.
 *
 * D-01/D-02 (curated-import discipline, inherited from Phase 30 D-08 -> ... -> Phase 34.4.1
 * D-01/D-02): import `./oauthLoginCapture` and `./electronStub` directly, and NOTHING else — no
 * feature module's `ipc_handler.ts`, no `humble/*` module (this channel captures a redirect
 * code, it does not authenticate — Humble's own six browser-auth channels are a completely
 * separate concern registered by their own dedicated module).
 *
 * This channel is Tauri-only by construction: the Electron renderer never reaches it, because
 * `WebView/index.tsx` still renders its `<webview>` there and never calls
 * `window.api.oauthCaptureLogin` on that build (Task 3's hook guards on `isTauri()` first). Under
 * Electron, `captureOAuthLogin()`'s own `getLoginWindowSeam() === null` check resolves
 * `{ status: 'unsupported' }` immediately regardless — this handler would be harmless even if
 * somehow invoked there, but it is registered in the sidecar's curated module graph only, which
 * never runs under Electron's main process at all.
 *
 * D-04/REQ-34.4.1-08 boundary (do not blur this): this channel captures a redirect code — it does
 * NOT authenticate. `login`, `authGOG`, `authAmazon` and `authZoom` remain unported and still
 * reject with `UNPORTED_CHANNEL_MARKER` until Phase 34.5 (SEAM Invariant B). This module never
 * touches those four channels' registrations or signatures.
 */

import { ipcMain } from './electronStub'
import { captureOAuthLogin } from './oauthLoginCapture'
import type { OAuthRunner, OAuthCaptureOutcome } from '../../common/types/oauthLogin'

const KNOWN_RUNNERS: readonly OAuthRunner[] = ['legendary', 'gog', 'nile', 'zoom']

function isKnownRunner(value: unknown): value is OAuthRunner {
  return typeof value === 'string' && (KNOWN_RUNNERS as readonly string[]).includes(value)
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Registers the single `oauthCaptureLogin` handle channel. Called once from `handlers.ts`
 * (module scope) -- this module owns no side effects at import time beyond the imports above.
 *
 * Validates `params` at the boundary: an unknown `runner` or a non-https `url` resolves
 * `{ status: 'error', message }` rather than being forwarded to `captureOAuthLogin` — a
 * renderer-supplied runner/url is attacker-influencable input (T-34.4.1's own threat register),
 * and this is the one gate between that input and actually opening a real login window. The body
 * catches everything and RESOLVES a typed outcome; it never rejects
 * (`sidecar-dialog-reject-crashes`).
 */
export function registerOAuthLoginFlows(): void {
  ipcMain.handle('oauthCaptureLogin', async (_event: unknown, ...args: unknown[]) => {
    const params = args[0] as { runner?: unknown; url?: unknown } | undefined

    if (!isKnownRunner(params?.runner)) {
      const outcome: OAuthCaptureOutcome = {
        status: 'error',
        message: `oauthCaptureLogin: unknown runner (expected one of ${KNOWN_RUNNERS.join(', ')})`
      }
      return outcome
    }
    if (!isHttpsUrl(params?.url)) {
      const outcome: OAuthCaptureOutcome = {
        status: 'error',
        message: 'oauthCaptureLogin: url must be a non-empty https URL'
      }
      return outcome
    }

    try {
      return await captureOAuthLogin(params.runner, params.url)
    } catch (error) {
      // captureOAuthLogin() itself never rejects (it resolves a typed { status: 'error' }
      // outcome on every internal failure) -- this catch exists only as an outer fail-safe so a
      // future regression there can never propagate into an unhandled rejection here.
      const outcome: OAuthCaptureOutcome = {
        status: 'error',
        message: error instanceof Error ? error.message : String(error)
      }
      return outcome
    }
  })
}
