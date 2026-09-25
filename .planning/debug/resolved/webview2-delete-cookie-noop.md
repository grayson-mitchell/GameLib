---
status: resolved
trigger: "wry WebView2 delete_cookie() removes nothing — every Epic logout on Windows ends in a user-visible error dialog"
created: 2026-09-26
updated: 2026-09-26
source_todo: .planning/todos/pending/2026-09-26-webview2-delete-cookie-does-not-remove-epic-cookies.md
platform: windows (session running on the operator's Windows 11 machine)
---

## Symptoms

- **Expected:** On Windows, Epic sign-in → library populates → sign-out completes with no error
  dialog, and `%LOCALAPPDATA%\GameLib\logs\gamelib.log` carries
  `post-clear verification — 0 Epic-owned cookie(s) remain across 5 domain(s)`.
- **Actual:** Sign-out shows "Your account was signed out on this device, but the browser session
  could not be fully cleared..." dialog. Log (commit `59df4c1b6`, `pnpm tauri:dev` debug build):

      Legendary logout: cleared 0 epicgames.com cookie(s) (measured post-removal delta) — cookie census before(total=60, matched=10, verdict=SUPPORTED_NONEMPTY) after(total=59, matched=9, verdict=SUPPORTED_NONEMPTY)
      Legendary logout: cleared 0 unrealengine.com cookie(s) (measured post-removal delta) — cookie census before(total=59, matched=1, verdict=SUPPORTED_NONEMPTY) after(total=59, matched=1, verdict=SUPPORTED_NONEMPTY)
      Legendary logout step clearEpicCookies FAILED (logout will report failure): Error: Legendary logout: domain-scoped cookie clear removed nothing for epicgames.com, unrealengine.com despite the jar proving cookies were present beforehand (...)

- **Errors:** above; every `window.delete_cookie(cookie)` call returned `Ok`.
- **Timeline:** Never verified working on Windows. Declared UNVERIFIED in
  `src-tauri/src/main.rs` (~7327-7335, D-09 / REQ-34.4.1-13). First measured in Phase 38 sitting 5
  (quick 260926-a1l, item 38-W06). macOS unaffected (WKWebsiteDataStore branch).
- **Reproduction:** Windows, `pnpm tauri:dev`, sign in to Epic, let library populate, sign out.

## Constraints (DATA — from operator/todo)

- Do NOT loosen the `legendary/user.ts:458-467` guard (D-35-19-15). It is correct; it fails closed.
  Loosening recreates the fail-open substitution `bea07cd17` removed.
- `verified_delete_count(before, after)` = `before.saturating_sub(after)` (`main.rs:~2130`) is
  honest measurement — do not replace it with an attempted count.
- Desk Chromium reproduction does NOT reproduce WebView2 behaviour
  (`.planning/debug/resolved/steam-caret-dropdown-dead.md`); verify on this machine's real WebView2.
- Fake-HOME two-profile rule applies to any direct sidecar/binary runs (CLAUDE.md).
- Once fixed, update the `main.rs` UNVERIFIED comment to record the measurement outcome.

## Hypotheses to test (none established)

1. **Async completion:** WebView2 `ICoreWebView2CookieManager::DeleteCookie` completes
   asynchronously; the synchronous `count_matching` re-read samples before deletion lands. Evidence
   for: TS census saw epicgames.com 10→9 after Rust's bracket reported 0. Evidence against: only one
   of ten disappeared; could be a session cookie expiring. Fix if it holds: awaited/settled removal
   (e.g. poll re-read until stable, or use a completion-bearing API), not a different removal call.
2. **Match miss:** wry's `delete_cookie` builds a cookie via `CreateCookie(name, value, domain, path)`
   and calls `DeleteCookie`; WebView2 matching on name+domain+path may miss on leading-dot domains
   (`.epicgames.com` vs `epicgames.com`), host-only vs domain cookies, or path mismatch.
   Alternative API: `DeleteCookies(name, uri)` / `DeleteCookiesWithDomainAndPath` /
   `DeleteAllCookies`.
3. Check the wry version in `src-tauri/Cargo.lock` and read wry's Windows `delete_cookie`
   implementation from the cargo registry source before theorising further.

## Current Focus

hypothesis: RESOLVED — three stacked causes (leading dot, async delete, partitioned cookie), all live-measured
next_action: none — live gate passed 2026-09-26

## Evidence

- 2026-09-26: `src-tauri/Cargo.lock` resolves wry 0.55.1, cookie 0.18.1, webview2-com 0.38.2.
- 2026-09-26: wry-0.55.1 `webview2/mod.rs:1681-1689` `delete_cookie` rebuilds the cookie via
  `cookie_into_win32` (`:1569-1616`), which passes `cookie.domain()` to `CreateCookie`, then calls
  `DeleteCookie` on the rebuilt object. Nothing from the original WebView2 cookie object is reused.
- 2026-09-26: cookie-0.18.1 `lib.rs:777-785`: `domain()` does
  `domain.strip_prefix(".").or(Some(domain))`; its own doc test asserts
  `Domain=.crates.io` → `domain() == Some("crates.io")`.
- 2026-09-26: WebView2 considers `.epicgames.com` and `epicgames.com` different cookie domains
  (domain vs host-only cookie). So every domain cookie's delete targets a nonexistent host-only
  cookie → `S_OK`, nothing removed. Host-only cookies would round-trip intact, which is consistent
  with the one epicgames.com cookie (10→9) that the TS census saw disappear.
- 2026-09-26: `main.rs` already records the identical round-trip-loses-a-property shape as the
  macOS root cause (wry `cookie_into_wkwebview`), fixed there by bypassing wry.
- 2026-09-26: wry `webkitgtk/mod.rs:975-979` `cookie_into_soup_cookie` also reads `domain()` →
  Linux suspected to have the same defect; unmeasured.

- 2026-09-26 live run 1 (leading-dot fix): epicgames.com before=9 after=1 settle_rereads=20;
  unrealengine.com before=1 after=0 settle_rereads=1 (→ removal IS async; H1 real but secondary).
  gamelib.log now reaches `post-clear verification — 1 Epic-owned cookie(s) remain`
  (epicgames.com=1), which then fails the guard, correctly.
- 2026-09-26 live run 2 (diagnostic): the survivor is `cf_clearance`, domain `.www.epicgames.com`,
  path `/`, secure, http_only, SameSite=None. Value hash identical before-delete and after-settle
  (d432cda3) → NOT re-set; no `DeleteCookie refused` line → WebView2 accepted and ignored it.
  `__cf_bm` with the IDENTICAL domain/path/flags WAS removed. Working hypothesis: `cf_clearance`
  is a partitioned (CHIPS) cookie, which `ICoreWebView2CookieManager::DeleteCookie` cannot address.
  Fix under test: CDP `Storage.getCookies` + `Network.deleteCookies` with `partitionKey` for
  survivors.

- 2026-09-26 live run 3 (CDP pass): `CDP cleanup issued=1 partitioned=1`, `after CDP cleanup
  after=0`; no error dialog; gamelib.log `post-clear verification — 0 Epic-owned cookie(s) remain
  across 5 domain(s)` with five zeroes. Partitioned-cookie hypothesis CONFIRMED.

## Eliminated

- Re-set by a live page: eliminated for the survivor — its value hash was unchanged across the
  delete and the 2s settle window.
- Refused delete: eliminated — no `DeleteCookie` call returned an error.
- Domain/path mismatch for the survivor: eliminated — `__cf_bm` with identical domain, path and
  flags was removed by the same call.

## Resolution

root_cause: Three stacked causes. (1) wry's WebView2 `delete_cookie` rebuilds the cookie from
  `cookie::Cookie`, whose `domain()` strips the leading dot, so domain cookies were deleted as
  nonexistent host-only cookies. (2) `DeleteCookie` is asynchronous, so an immediate re-read can
  still see a cookie that is about to go. (3) `DeleteCookie` cannot remove a partitioned (CHIPS)
  cookie — Cloudflare's `cf_clearance`.
fix: Windows arm of `humble_login_clear_cookies` calls `ICoreWebView2CookieManager` directly via
  `with_webview` — `GetCookies`, filter with the same matcher `count_matching` uses, `DeleteCookie`
  on the original cookie objects — then a bounded settle re-read (`CLEAR_COOKIES_SETTLE`, 2s); any
  survivors get a CDP pass (`Storage.getCookies` + `Network.deleteCookies` with `partitionKey`,
  `webview2_cdp_delete_matching_cookies`) and a second settle re-read. The count is still
  `verified_delete_count(before, after)`; the legendary/user.ts guard is untouched. Linux split
  into its own arm, still declared unverified (now suspected to share cause 1).
verification: LIVE on Windows 11 (operator, `pnpm tauri:dev`, real Epic account): sign-in →
  library → sign-out with no error dialog; gamelib.log post-clear verification 0 across 5 domains.
  Desk: `cargo check` clean (no new warnings), `cargo test` verified_delete_count 3/3 and
  cookie_domain 5/5, `cargoFeatures.test.ts` 12/12 (Cargo.lock gains only 2 dependency edges).
  Temporary cookie-dump diagnostic removed before commit.
files_changed: src-tauri/src/main.rs, src-tauri/Cargo.toml, src-tauri/Cargo.lock
