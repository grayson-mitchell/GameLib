---
created: 2026-09-26
title: 'wry WebView2 delete_cookie() removes nothing — every Epic logout on Windows ends in a user-visible error dialog'
found_during: Phase 38 sitting 5 (quick 260926-a1l), item 38-W06
severity: major
platform: windows
ready: live-gate
area: login-window-cookies
files:
  - src-tauri/src/main.rs
  - src/backend/storeManagers/legendary/user.ts
---

## What was measured

Windows 11, `pnpm tauri:dev` debug build, commit `59df4c1b6`, real Epic account, full sign-in →
library populates → sign-out cycle. Verbatim from `%LOCALAPPDATA%\GameLib\logs\gamelib.log`:

    Legendary logout: cleared 0 epicgames.com cookie(s) (measured post-removal delta) — cookie census before(total=60, matched=10, verdict=SUPPORTED_NONEMPTY) after(total=59, matched=9, verdict=SUPPORTED_NONEMPTY)
    Legendary logout: cleared 0 unrealengine.com cookie(s) (measured post-removal delta) — cookie census before(total=59, matched=1, verdict=SUPPORTED_NONEMPTY) after(total=59, matched=1, verdict=SUPPORTED_NONEMPTY)
    Legendary logout step clearEpicCookies FAILED (logout will report failure): Error: Legendary logout: domain-scoped cookie clear removed nothing for epicgames.com, unrealengine.com despite the jar proving cookies were present beforehand (epicgames.com=0, fortnite.com=0, unrealengine.com=0, twinmotion.com=0, metahuman.com=0)

User-visible consequence, quoted by the operator:

> Your account was signed out on this device, but the browser session could not be fully cleared.
> On a shared computer, sign out again or clear your browser data for this site to make sure your
> session doesn't stay accessible.

## Mechanism

`src-tauri/src/main.rs:7325-7352`, the `#[cfg(not(target_os = "macos"))]` arm of
`humble_login_clear_cookies`, collects every domain-matching cookie, calls
`window.delete_cookie(cookie)` on each (all returned `Ok` — no error surfaced), then re-reads via
`count_matching` and returns `verified_delete_count(before, after)` =
`before.saturating_sub(after)` (`main.rs:2130`). It returned **0** for both populated domains.

`legendary/user.ts:458-467` then classifies a host whose BEFORE census proves `SUPPORTED_NONEMPTY`
but whose measured delta is zero as **broken**, and throws. **That guard is working correctly and
is not the defect** — it is the D-35-19-15 rule that exists so a healthy primary-domain clear
cannot mask a broken secondary-domain one. Do not "fix" this by loosening the guard; that would
recreate the exact fail-open substitution `bea07cd17` removed.

## This was a declared risk, not a surprise

`main.rs:7327-7335` says so in writing, and the comment should be updated once this is resolved:

> `---- Linux/Windows: UNVERIFIED on the existing wry delete_cookie() path (D-09,
> REQ-34.4.1-13) ... Only the dishonest ATTEMPTED count is fixed here; the deletion mechanism
> itself is UNCHANGED and DECLARED unverified, never silently assumed fixed (nor silently assumed
> still broken).`

Sitting 5 is the measurement that comment was waiting for. macOS is unaffected: it takes the
`WKWebsiteDataStore` branch, never `delete_cookie()`.

## Hypothesis, explicitly NOT established

The TypeScript census bracketing the whole Rust call saw `epicgames.com` go from `matched=10` to
`matched=9` (total 60 → 59) while Rust's own tighter bracket reported 0. Exactly one cookie
disappeared **between Rust's post-removal re-read and the TypeScript one**. That is *consistent
with* WebView2's `delete_cookie` completing asynchronously — the synchronous `count_matching`
re-read sampling too early — but **two timestamps are not a measurement of a mechanism.** It could
equally be a session cookie expiring. Test the async hypothesis before building on it; if it
holds, the fix is an awaited/settled removal rather than a different removal call.

`severity: major` — a store integration's logout is broken on an entire platform and the failure
is *correctly* surfaced to the user as an error, so the blast radius is every Windows Epic user.
Not `critical`: no data loss, and the guard fails closed rather than falsely certifying a clear.

`ready: live-gate` — the desk cannot see this. The resolved
`.planning/debug/resolved/steam-caret-dropdown-dead.md` session established that a faithful
Chromium reproduction does **not** reproduce WebView2-specific behaviour, and that only live CDP on
the operator's Windows machine settles it.

## Verification (once fixed)

On Windows: sign in to Epic, confirm the library populates, sign out. No error dialog, and
`gamelib.log` carries `post-clear verification — 0 Epic-owned cookie(s) remain across 5 domain(s)`
with five numeric zeroes. Note that this line **cannot appear today at all**, because the clear
step throws before the verification sweep runs — its appearance is itself part of the fix.

## Cross-references

- `38-W06`'s discharged entry in `38-VERIFICATION.md` — the full sitting record
- `.planning/debug/resolved/epic-cookie-clear-read-divergence.md` residual 2 — where this
  originated, now closed with this outcome. That session stays RESOLVED: its subject was the read
  divergence, and the reads are now proven healthy on Windows.
