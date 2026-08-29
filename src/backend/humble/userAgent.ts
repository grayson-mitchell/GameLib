import { app } from 'backend/platform'

/**
 * Standard (non-Electron) browser user agent for Humble-facing requests.
 *
 * Google's SSO detects embedded browsers via the `Electron/x.y.z` and
 * app-name UA tokens and then restricts auth options — forcing passkey-only
 * verification (WebAuthn platform authenticators are unavailable inside an
 * embedded browser, so that prompt can never complete) or blocking outright
 * with `disallowed_useragent`. Presenting a plain Chrome UA restores the
 * password / "Try another way" flows.
 *
 * Derived from Electron's own `app.userAgentFallback` (NOT hardcoded) so the
 * platform token and Chrome version stay in parity with the actual runtime
 * Chromium — a stale hardcoded Chrome version is itself an embedded-browser
 * signal.
 *
 * Hoisted out of user.ts into its own module (debug session
 * humble-reveal-key-fails, round 6) so backend/humble/adapter.ts's
 * electron-`net`-based reveal POST transport can import it WITHOUT creating
 * a circular dependency — user.ts already imports getGamekeys/
 * getAccountIdentity from adapter.ts, so adapter.ts importing FROM user.ts
 * would cycle back on itself. user.ts re-exports this symbol so its existing
 * callers (ipc_handler.ts, user.test.ts) are unaffected by the move.
 */
export function standardBrowserUserAgent(): string {
  const fallback = app.userAgentFallback
  const platform = /^Mozilla\/5\.0 \(([^)]+)\)/.exec(fallback)?.[1]
  const chromeVersion = /Chrome\/(\S+)/.exec(fallback)?.[1]
  if (!platform || !chromeVersion) {
    // Defensive: the fallback shape is stable across Electron versions, but
    // if it ever changes, at least strip the Electron-identifying token.
    return fallback.replace(/ Electron\/\S+/, '')
  }
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
}
