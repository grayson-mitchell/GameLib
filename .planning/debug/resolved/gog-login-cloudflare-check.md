---
status: resolved
trigger: "gog login now does not work, cloudflare check has been added in the page 'click if human' fails"
created: 2026-10-29
updated: 2026-10-29
---

## Symptoms

- expected: GOG sign-in window (auth.gog.com) lets the user pass Cloudflare's human check, sign in, and the app captures the `embed.gog.com/on_login_success?code=` redirect.
- actual: Cloudflare "verify you are human" (Turnstile) check appears on the GOG login page inside the macOS login window and clicking it fails, so login cannot proceed.
- errors: none reported beyond the failed Cloudflare check.
- timeline: started recently; GOG login worked before GOG added the Cloudflare check (server-side change on GOG's side).
- reproduction: macOS, `pnpm tauri:dev`, open GOG login from the app, click the Cloudflare checkbox.

## Current Focus

hypothesis: Turnstile detects Tauri's injected scripts in the login window (Tauri IPC/core init scripts plus `login_origin_banner_script`, `login_chrome_css_script`, `login_scrollbar_inset_script`, `login_cancel_strip_script` initialization_scripts in the `humble_login_open` arm, src-tauri/src/main.rs ~8357-8582).
test: route GOG's login through the macOS pristine WKWebView (`open_pristine_epic_login_window`, main.rs:4214), currently gated to Epic only by `is_epic_login` (main.rs:8234, `EPIC_LOGIN_HOST` main.rs:3903).
expecting: Cloudflare check passes in the pristine window; redirect captured via `EpicPristineNavDelegate`'s per-main-frame `nav` events (oauthLoginCapture.ts:304 matches any event kind).
next_action: gather initial evidence, then implement the widened pristine route (host-keyed, e.g. auth.gog.com) and hand to the user for live verification.

## Evidence

- timestamp: 2026-10-29
  checked: GOG user agent in src/backend/sidecar/oauthLoginCapture.ts:72
  found: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/200.0` — fake Chrome version, wrong platform for a macOS WKWebView.
  implication: plausible Turnstile mismatch signal, but see Eliminated.
- timestamp: 2026-10-29
  checked: EpicPristineNavDelegate (main.rs ~3985-4060)
  found: emits `finished` only for localhost redirects (Epic), but pushes a `nav` event for every main-frame navigation and allows it.
  implication: GOG's embed.gog.com redirect would surface as a `nav` event; oauthLoginCapture matches regardless of kind.
- timestamp: 2026-10-29
  checked: sidecar spawn (main.rs:12023)
  found: no env_clear; sidecar inherits environment.
  implication: GAMELIB_OAUTH_UA_GOG override reached the sidecar during the user's test.

## Eliminated

- hypothesis: user agent alone causes the Turnstile failure
  evidence: user ran with `GAMELIB_OAUTH_UA_GOG="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0.1 Safari/605.1.15"` (installed Safari 27.0.1); check still failed.
  timestamp: 2026-10-29

## Resolution

root_cause: GOG added a Cloudflare human check to auth.gog.com. In the macOS login window it failed on two signals together: Tauri's injected scripts in the WebviewWindowBuilder login path, and a UA claiming Windows Chrome/200.0 on a WKWebView engine. Each fix alone still failed (user-tested); both together pass.
fix: 0f38bc416 routes auth.gog.com through the pristine WKWebView on macOS (GOG_LOGIN_HOST gate); follow-up commit makes GOG's default UA on macOS an honest Safari 27.0.1 UA (oauthLoginCapture.ts GOG_MAC_SAFARI_USER_AGENT).
verification: user live-tested 2026-10-29 with pristine route + Safari UA (via GAMELIB_OAUTH_UA_GOG): Cloudflare check passed and login worked. Default-UA build not separately re-run live. oauthLoginCapture.test.ts 55/55.
files_changed: src-tauri/src/main.rs, src/backend/sidecar/oauthLoginCapture.ts, src/backend/sidecar/__tests__/oauthLoginCapture.test.ts
