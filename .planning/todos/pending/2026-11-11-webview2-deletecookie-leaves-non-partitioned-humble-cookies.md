---
created: 2026-11-11T00:00:00.000Z
title: 'WebView2 DeleteCookie leaves non-partitioned Humble cookies'
area: shell
severity: minor
platform: windows
ready: live-gate
files:
  - src-tauri/src/login_window/humble_cookies.rs:804-965
  - .planning/debug/resolved/webview2-delete-cookie-noop.md
---

## Problem

Live Humble disconnect on Windows 11 (2026-11-11, the Windows half of the
`split-rpc-humble-login-clear-cookies-into-named-steps` live gate) logged:

```
[shell] humble_login_clear_cookies: before=35 after=25 settle_rereads=20
[shell] humble_login_clear_cookies: CDP cleanup issued=25 partitioned=2
[shell] humble_login_clear_cookies: after CDP cleanup after=0
```

The end state is correct (`after=0`, verified count 35), so this is not a live defect today. But
`remove_window_cookies_windows`'s first pass, `ICoreWebView2CookieManager::DeleteCookie` on the
original `GetCookies` objects, removed only 10 of 35 matching cookies, and 25 survived the full
2s settle window (`settle_rereads=20`). Only 2 of those 25 were partitioned (CHIPS). The arm's
header comment says partitioned cookies are the only `DeleteCookie` survivors, measured on Epic
(2026-09-26: `before=9 after=1`, the one survivor being `cf_clearance`). For Humble, 23
non-partitioned cookies also survived. So the CDP `Network.deleteCookies` pass is doing most of the
clearing instead of mopping up stragglers, and the header comment's claim does not hold for Humble.

Consequence if the CDP pass ever fails (`CDP cleanup failed:` arm): most Humble cookies would
remain after disconnect. The TS guard fails closed on a residual, so the user sees a failed
disconnect rather than a silent half-logout. That bounds the blast radius and is why this is
`minor`.

Not caused by the named-steps split (`56d8e4509`): that commit moved this fn verbatim. No earlier
Humble-on-Windows measurement exists to compare against.

## Solution

TBD. Investigate on the Windows machine:

- Which 23 non-partitioned cookies survive? Log count-only properties (domain shape such as a
  leading dot or host-only, path, `IsHttpOnly`, `IsSecure`, `SameSite`, session vs persistent),
  never names or values (T-34.4.1-02).
- Whether `DeleteCookie` is still async-pending after 2s (try a longer settle), or genuinely refuses.
- Whether `DeleteCookiesWithDomainAndPath`, or CDP alone, is the more honest primary path, then
  correct the header comment to match what is measured.

## Progress (2026-11-11, debug session `webview2-humble-deletecookie`)

A debug-build-only, count-only diagnostics arm (`src-tauri/src/login_window/windows_cookie_diag.rs`)
is in and waits on one live Humble sign-in + disconnect on Windows. It never logs a cookie name,
value or domain. Where the lines land: the shell's `[shell]` stderr goes to the terminal running
`pnpm tauri:dev`, NOT `gamelib.log` (zero `[shell]` lines there); the `DIAG` lines are also appended
to `%LOCALAPPDATA%\GameLib\logs\humble-cookie-diag.log`. Remove the arm once the mechanism is
settled; its file header lists every removal site.
