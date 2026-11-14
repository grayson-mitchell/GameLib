---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 33
subsystem: steam-cm
tags: [rust, refresh, parity-sweep, enrichment]
key-files:
  created:
    - meta/steamcmRefreshParitySweep.ts
  modified:
    - src-tauri/crates/gamelib-steamcm/src/refresh/enrich.rs
    - src-tauri/crates/gamelib-steamcm/src/refresh/store_http.rs
    - .planning/phases/79-rust-cm-client-replacing-steam-user-and-steam-session/79-PARITY.md
metrics:
  tasks: 3
  completed: 2026-11-15
status: partial
---

# Phase 79 Plan 33: Refresh parity sweep Summary

Built and ran a redacted TS-vs-Rust Refresh parity sweep; the operator decided the three divergences (cap in-Refresh store enrichment at 50, make a store 403 stop the stage like 429, accept explicit `l=english`), and the 403 stop and cap are implemented and unit-tested. The post-fix live re-sweep did NOT complete cleanly, so the Refresh section stays pending, not approved.

## Commits
- de9262a4f, 989b404ea: sweep harness
- f74a46596: sweep waits out a store throttle before each store-heavy phase
- (delisted-verdict tweak)
- 371199f09: Rust `appdetails` sends `l=english`
- 06f3e50a2: PARITY Refresh section
- 2f836a4a1: Refresh enrich stage stops on 403 like 429 and caps at 50 requests per Refresh (`ENRICH_REFRESH_MAX_REQUESTS`)

## Operator decisions (verbatim)
Chose "Fix DV-11 and cap DV-10":
- DV-79-10 accepted with a change: per-Refresh cap of about 50 store requests; concurrency 5 and 20 s budget stay.
- DV-79-11 rejected: HTTP 403 stops the stage exactly like 429.
- DV-79-12 accepted.

## Fixes
- 403 now sets `rateLimited`, sends the 403 app plus unstarted and in-flight apps to `not_reached`, no further requests. The lazy single-app `steamcm_store_enrich` op is neither capped nor stopped. Summary shape unchanged, so no TS change.
- Tests added: `stage_stops_at_the_first_403`, `stage_caps_requests_per_refresh` (80 apps: attempted 50, 30 not_reached), `lazy_single_app_fetch_is_not_capped_or_stopped`. `cargo test -p gamelib-steamcm --lib` 270 passed; clippy `--all-targets -D warnings` and `cargo fmt --check` clean.

## Deviations from Plan
- [Rule 1] 371199f09 (`l=english` on the Rust store request) is outside the plan's `files_modified`; found because Rust got German text in 12 of 18 direct calls. Accepted as DV-79-12.
- Lazy enrichment is a deterministic 60-app sample per side (not all owned apps): the store answers 403 after a burst, so the full set is not feasible.
- The sweep ran under a fake HOME, so install state is not compared (same TS on both paths).
- The anonymous CM client is not wired in the in-process TS side; TS takes the held-session fallback for platform and metacritic captures.
- Plan verify lines like `cargo test -p X a:: b::` are invalid; used `--lib -- a:: b::`.

## Re-sweep result (not clean)
Three runs after the fix:
1. Exit 1. Store still throttled for Rust: enrich attempted=5, enriched=0, rateLimited, notReached=390 (403/429 stop held; the 50 cap not exercised live). Equal on all compared apps for name, art, metacritic, playtime, last played, demo membership. Unexplained: 1 app (`is_windows_native` empty on Rust, `steamPlatformsCaptured` differs). Rust reported demos=0 (ts 11), so 390 vs 401 entries; likely a demos failure, not investigated.
2. and 3. Exit 1 before comparison: TS `steam-user` threw a null-buffer `TypeError` in `apps.js:298` twice in a row. Stopped rather than looping.

## Open
- 1 unexplained platform-capture app; Rust demos=0 on run 1.
- A clean re-run is needed (avoid or fix the steam-user null-buffer crash, wait out the store throttle) to exercise the 50 cap live and set `Status: APPROVED (Refresh)`.

## Known Stubs
None.
