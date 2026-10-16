---
phase: 40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we
plan: 04
subsystem: security
tags: [tauri, wry, cookies, threat-model, capabilities, scheme-policy, gog, amazon, nile]

# Dependency graph
requires:
  - phase: 40-02
    provides: "STORE_EMBED_LABEL child webview created via Window::add_child, and the login-window seam's clear_default_data_store_cookies_for_domain / verified_delete_count machinery Epic's own logout already used"
provides:
  - "40-THREAT-MODEL.md: full STRIDE register for the store/wiki embed surface, with the D-26 two-leg (window+origin) capability conjunction proven from vendored ACL source rather than a runtime ACL refusal"
  - "Scheme-policy navigation containment wired into the embed's WebviewBuilder (block gamelib://, allow http/https, hand off steam://, default-deny everything else) plus on_new_window/on_download hooks routing to the system browser"
  - "GOG and Amazon logout now clear their session cookies from the shared default cookie jar (D-15), verified by an independent before/after re-read, never trusted from the removal call's own signal"
affects: [40-05, 40-06, 40-07, 40-08, 40-09, 40-10, 40-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-storefront cookie-domain allow-list + sentinel no-window label, mirroring legendary/user.ts's EPIC_COOKIE_HOSTS/EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL exactly, kept as separate lists per storefront rather than widening the Epic list"
    - "Scheme-policy navigation containment: a single classify-then-dispatch function consulted by on_navigation/on_new_window/on_download alike, so all three hooks enforce identical policy"
    - "Dual-defense IPC wrapper (sync try/catch + conditional .catch()) for converting a fire-and-forget ipcMain.on handler's underlying call from sync to async without changing the handler's own contract"

key-files:
  created:
    - .planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-THREAT-MODEL.md
    - src/backend/storeManagers/gog/__tests__/logoutCookies.test.ts
    - src/backend/storeManagers/nile/__tests__/logoutCookies.test.ts
  modified:
    - src-tauri/src/main.rs
    - src-tauri/capabilities/default.json
    - src/backend/storeManagers/gog/user.ts
    - src/backend/storeManagers/nile/user.ts
    - src/backend/sidecar/runnerAuthFlowRegistration.ts

key-decisions:
  - "D-26 capability scoping: default.json stays windows:[\"main\"] with no webviews field and no remote grant. A defence-in-depth attempt to scope to webviews:[\"main\"] (excluding store-embed from the window leg) was evaluated and reverted -- the window leg is satisfied for store-embed either way (tauri-utils capability.rs:150-154's own doc comment: a window match enables all webviews of that window regardless of the webviews field), so the change bought no additional denial and the ORIGIN leg (Origin::matches requiring a remote grant this capability never declares) is what actually forecloses remote-origin IPC eligibility."
  - "D-15 fix scope: GOG and Amazon each get their own separate Rust const/fn (STORE_LOGOUT_COOKIE_DOMAINS/store_logout_cookie_domain_matches), OR'd into Epic's existing no-window fallback gate, rather than widening EPIC_COOKIE_DOMAINS itself -- keeps Epic's own tested/named list untouched."
  - "Single apex domain per storefront (gog.com, amazon.com) is sufficient -- cookie_domain_matches's suffix-match logic already covers every observed subdomain (login.gog.com, www.gog.com, www.amazon.com) without listing them separately."
  - "Cookie-clear steps are macOS-gated at the TypeScript level (isMac short-circuit) rather than given a cross-platform window-opening fallback -- no Tauri leg ships on Windows/Linux yet (Phase 38), so there is no live non-macOS target to support today."
  - "Cookie-side failures are non-fatal to logout() (mirrors Humble's simpler disconnect() pattern, not Legendary's FATAL_WIPE_STEP-promotes-to-rejection pattern) -- credential-side cleanup must complete even if every cookie-side step throws, and logout() must never reject since ipcMain.on is fire-and-forget."
  - "Epic sibling-apex disposition: recorded, not discharged. Epic embedding remains out of Phase 40 scope per D-05; no owning phase assigned yet."

patterns-established:
  - "New Rust cookie-domain allow-lists always pair with a TS-side host list in the same commit (a domain added on one side and not the other is a silent half-fix -- documented in both source locations this plan touched)."

requirements-completed: [REQ-40-04, REQ-40-11]

# Metrics
duration: ~25min (commit-to-commit across a3-commit sequence; total session wall-clock longer due to a context-compaction boundary mid-plan)
completed: 2026-09-04
---

# Phase 40 Plan 04: Store-browser threat model, scheme-policy containment, and the GOG/Amazon cookie-jar logout fix Summary

**Threat-modelled the store/wiki embed surface (STRIDE register + proven D-26 capability conjunction), wired scheme-policy navigation containment into the Rust embed builder, and fixed the D-15 cookie-jar leak that left stale GOG/Amazon session cookies behind after logout.**

## Performance

- **Tasks:** 3/3 completed
- **Files modified:** 5 (2 new test files, 3 new/updated production files, plus the threat model doc and capability description from Task 1)
- **Task commits:** 3, plus this metadata commit

## Accomplishments

- Wrote `40-THREAT-MODEL.md`: `## Trust Boundaries`, `## STRIDE Threat Register` (T-40-04-01 through -09 plus T-40-04-SC), and `## Controls verified` with the D-26 two-leg (window + origin) conjunction proven from vendored ACL source (`tauri-utils-2.9.3/src/acl/capability.rs`, `tauri-2.11.5/src/ipc/authority.rs`) rather than an observed runtime refusal.
- Extended `capabilities/default.json`'s description to document why `store-embed` matches the WINDOW leg like any other webview of `main`, why that alone does not grant remote-origin IPC eligibility, and why a `webviews`-scoped defence-in-depth attempt was evaluated and reverted.
- Replaced the store-embed navigation placeholder in `main.rs` with a real scheme policy: block the app's own `gamelib://` scheme, allow `http`/`https` freely (store checkout depends on free navigation), hand off `steam://` to the OS, default-deny everything else -- consulted identically by `on_navigation`, `on_new_window`, and `on_download` through one classify-then-dispatch function, with `on_new_window`/downloads routed to the system browser rather than opened in-embed.
- Fixed D-15: GOG and Amazon logout now clear their session cookies from the shared default cookie jar, one domain at a time, via the same macOS default-data-store fallback mechanism Epic's logout already used -- gated by a new, separate `STORE_LOGOUT_COOKIE_DOMAINS`/`store_logout_cookie_domain_matches` allow-list OR'd into both `humble_login_clear_cookies` and `humble_login_cookies_for_domain`'s no-window dispatch gate.
- Credential-side cleanup for both GOG and Amazon logout is proven (by new unit tests) to run first and complete even when the cookie-side step throws or rejects, and `logout()` itself never rejects because of a cookie-side failure.
- The verified-delete count (never the removal call's own signal -- WebKit bug #184938, wry's cookie-delete lies about success) is consumed per domain: logged on success, and a zero count against a non-empty before-census produces a `logWarning`, proven by new unit tests for both the warn and no-warn (empty jar) cases.

## Task Commits

Each task was committed atomically:

1. **Task 1: Threat model + capability description extension** - `a7189d051` (docs)
2. **Task 2: Scheme-policy navigation containment in `store_embed_open`** - `41dd0c722` (feat)
3. **Task 3: GOG/Amazon cookie-jar logout fix (D-15)** - `84fc0ea90` (fix)

**Plan metadata:** committed alongside this SUMMARY (see final commit below).

## Files Created/Modified

- `.planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-THREAT-MODEL.md` - STRIDE register + D-26 conjunction proof (Task 1)
- `src-tauri/capabilities/default.json` - description extended to cover `store-embed`'s scoping (Task 1)
- `src-tauri/src/main.rs` - scheme policy for `store_embed_open` (Task 2); `STORE_LOGOUT_COOKIE_DOMAINS`/`store_logout_cookie_domain_matches` + widened no-window fallback gates + 4 new unit tests (Task 3)
- `src/backend/storeManagers/gog/user.ts` - `GOG_COOKIE_HOSTS`/`GOG_COOKIE_CLEAR_NO_WINDOW_LABEL`/`clearGogCookiesForLogout()`, async `logout()` (Task 3)
- `src/backend/storeManagers/nile/user.ts` - `AMAZON_COOKIE_HOSTS`/`AMAZON_COOKIE_CLEAR_NO_WINDOW_LABEL`/`clearAmazonCookiesForLogout()`, updated `logout()` (Task 3)
- `src/backend/sidecar/runnerAuthFlowRegistration.ts` - `logoutGOG` dual-defense wrapper (sync try/catch + conditional `.catch()`) and stale-comment updates for the new async `GOGUser.logout()` signature and the D-15-supersedes-T-34.5-37 disposition on `logoutAmazon` (Task 3, deviation -- see below)
- `src/backend/storeManagers/gog/__tests__/logoutCookies.test.ts` - new (Task 3)
- `src/backend/storeManagers/nile/__tests__/logoutCookies.test.ts` - new (Task 3)

## Capability Scoping Decision (Task 1)

`capabilities/default.json` remains `"windows": ["main"]` with no `"webviews"` key and no `"remote"` key. `store-embed` (the child webview `Window::add_child` creates) matches this capability's WINDOW leg exactly like any other webview of `main`, per `tauri-utils-2.9.3/src/acl/capability.rs:150-154`'s own doc comment: a window match "will be enabled on all the webviews of that window, regardless of the value of `webviews`." A defence-in-depth attempt to instead scope `"webviews": ["main"]` (deliberately excluding the `store-embed` label from the window leg) was evaluated during Task 1 and reverted: it bought no additional denial, because the window leg was never the control doing the denying. The ORIGIN leg of the same conjunction (`Origin::matches`, `tauri-2.11.5/src/ipc/authority.rs:57-67`) requires a `remote` grant naming the origin's URL before a `Remote`-origin webview can match any resolved command's execution context at all -- and this capability declares no `remote` key. That is the control that actually forecloses `store-embed` (or any other remote-origin webview) from reaching app-defined IPC commands. `grep -rn "remote" src-tauri/capabilities/` returns only this capability's own prose description (which discusses the absence of a `remote` grant at length) and never a `"remote"` config key -- verified as part of this plan's own verification pass.

## Scheme Policy (Task 2)

| Scheme | Policy | Mechanism |
|---|---|---|
| `gamelib://` (app's own deep-link scheme) | Blocked | `on_navigation` returns `false`; D-29 |
| `http://` / `https://` | Allowed freely | `on_navigation` returns `true` -- store checkout depends on unrestricted navigation within the embed |
| `steam://` | Handed off | Routed through the single external-open function to the OS, not opened in-embed |
| Any other scheme | Default-deny | `on_navigation` returns `false` |
| `window.open()` targets | Handed off | `on_new_window` routes to the same single external-open function, never opened as an in-app child webview |
| Downloads | Handed off | `on_download` routes to the same single external-open function |

All three hooks (`on_navigation`, `on_new_window`, `on_download`) consult the same classify-then-dispatch scheme-policy function and route external opens through the same single function, so the policy cannot drift between hooks. Unit tests cover block (`gamelib://`), allow (`http`/`https`), hand-off (`steam://`), and default-deny (unknown scheme) -- `store_embed_navigation_policy_*` in `cargo test`'s output.

## GOG/Amazon Cookie-Clear Design (Task 3)

Per-domain cookie census/clear is macOS-gated and driven by the login-window seam's `cookiesForDomain`/`clearCookies` methods (the same seam Epic's logout already uses), targeting a sentinel label (`gog-cookie-clear-no-window` / `amazon-cookie-clear-no-window`) that can never resolve to a real Tauri-managed window, which routes both Rust dispatch arms straight to their macOS default-data-store fallback.

**Live per-domain cookie census before/after logout was NOT performed in this execution** -- no live browser session was available in this sandboxed environment to produce a real before/after count for GOG or Amazon. The domain-list design (one apex per storefront, suffix-matched Rust-side by the existing `cookie_domain_matches`) structurally covers every subdomain a prior investigation's snapshot recorded (`gog.com`, `login.gog.com`, `www.gog.com`, `amazon.com`, `www.amazon.com`) without listing them separately, but this coverage claim is a structural argument from the comparator's own logic, not a live-measured count, and should be flagged as an assumption pending a live UAT pass.

Rust-side gate widening: a new, separate `STORE_LOGOUT_COOKIE_DOMAINS`/`store_logout_cookie_domain_matches` (rather than widening `EPIC_COOKIE_DOMAINS` itself) is OR'd into both `humble_login_clear_cookies` and `humble_login_cookies_for_domain`'s existing `existing_window.is_none() && epic_cookie_domain_matches(domain)` gate, so GOG and Amazon reach the identical fallback via their own sentinel labels without touching Epic's own tested list.

**Epic sibling-apex disposition:** recorded, not discharged. The four Epic sibling-apex domains noted in a prior investigation remain unaddressed by this plan -- Epic embedding stays out of Phase 40 scope per D-05, and no phase currently owns closing that gap.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/2 - blocking + missing correctness] Updated `runnerAuthFlowRegistration.ts` outside the plan's declared `files_modified`**
- **Found during:** Task 3
- **Issue:** Making `GOGUser.logout()` async (required to `await` the new cookie-clear step) changes its return type from `void` to `Promise<void>`. `runnerAuthFlowRegistration.ts`'s `logoutGOG` listener calls it via `ipcMain.on` (a fire-and-forget send channel) with a bare synchronous call and no promise handling -- an unhandled async rejection from the new cookie-clear path would surface only as an unhandled-rejection warning, never reaching any caller, and the file's own header docblock and the `logoutAmazon` handler's inline comment ("Do NOT add a cookie clear to this path") were now stale/incorrect given D-15's `mitigate` disposition superseding the prior `accept` (T-34.5-37).
- **Fix:** Wrapped the `logoutGOG` call in a dual-defense pattern -- a synchronous `try/catch` (for a synchronously-throwing implementation or mock) plus a conditional `.catch()` chain (for a genuinely-rejecting promise) -- and updated both the header docblock and the `logoutAmazon` handler's comment to describe the new reasoning and disposition. This was necessary to complete Task 3 correctly (Rule 3, blocking) and to avoid leaving stale/misleading documentation behind (Rule 2).
- **Files modified:** `src/backend/sidecar/runnerAuthFlowRegistration.ts`
- **Commit:** `84fc0ea90`

No other deviations. Tasks 1 and 2 executed exactly as planned (see their own commits for detail); this deviation is the only addition outside the plan's declared scope, and it is a direct, necessary consequence of Task 3's own declared change.

## Verification

All of the plan's `<verification>` checks passed:

- `cd src-tauri && cargo check` -- 0 errors.
- `cd src-tauri && cargo test` -- 224 passed, 0 failed, 1 ignored (pre-existing, unrelated to this plan).
- `pnpm codecheck` -- exits 0.
- `pnpm exec jest src/backend/storeManagers/gog src/backend/storeManagers/nile src/backend/storeManagers/legendary` -- 10 suites, 109 tests, all passed (includes the 2 new `logoutCookies.test.ts` files).
- `pnpm exec jest src/backend/sidecar/__tests__/runnerAuthFlows.test.ts` -- 30 tests, all passed, including the T-34.5-18 synchronous-throw and healthy-mock tests, unchanged.
- `grep -rn "remote" src-tauri/capabilities/` -- only the capability's own prose description, no `"remote"` config key.
- `grep -rn "data_store_identifier" src-tauri/` -- zero matches.
- `git diff --stat src-tauri/Cargo.lock pnpm-lock.yaml` -- empty (no new packages).
- Threat model contains all three required headings with 9 STRIDE rows plus one supply-chain row, and the `## Controls verified` section carries the D-26 conjunction proof.
- Scheme-policy unit tests cover block/allow/hand-off/default-deny (`store_embed_navigation_policy_*`).

## Known Stubs

None. This plan touched no UI-facing data flow -- it is threat-modelling, Rust navigation policy, and a backend logout fix.

## Threat Flags

None. This plan's changes are themselves the threat-mitigation work (D-26 through D-29, D-15) -- no new unmodelled surface was introduced; the scheme policy and cookie-clear fix reduce surface rather than adding it.

## Self-Check: PASSED

- FOUND: `.planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-THREAT-MODEL.md`
- FOUND: `src/backend/storeManagers/gog/__tests__/logoutCookies.test.ts`
- FOUND: `src/backend/storeManagers/nile/__tests__/logoutCookies.test.ts`
- FOUND: commit `a7189d051`
- FOUND: commit `41dd0c722`
- FOUND: commit `84fc0ea90`
