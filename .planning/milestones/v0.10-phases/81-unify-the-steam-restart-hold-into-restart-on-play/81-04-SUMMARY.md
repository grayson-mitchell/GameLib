---
phase: 81-unify-the-steam-restart-hold-into-restart-on-play
plan: 04
subsystem: steam-polling
status: complete
tags: [rust, c, macos, steam, adoption, bridge-helper, steamclient]
requires: [81-01]
provides:
  - "steam-bridge-helper --steam-appstate <appId>: one JSON line with loggedOn, install state and installed-app count (gamelib_appstate.h, dispatched from bridge_helper.c)"
  - "gamelib-steampoll app_state module: read_app_state and AppStateOutcome"
  - "macOS adoption watch: helper evidence \"helper\", signedIn reading, helper-refuted pid change, D-09 one-shot InstallApp fallback"
  - "constants ADOPTION_HELPER_TIMEOUT_MS, ADOPTION_HELPER_SIGNED_IN_MIN_INTERVAL_MS, ADOPTION_INSTALLAPP_FALLBACK_DELAY_MS"
affects: [81-05, 81-09, 81-20]
tech-stack:
  added: []
  patterns: [forked-child RTTI getter scan reused from gamelib_installapp.h, function-ID unique-slot resolution, fake-runner reader tests, per-entry helper cache gated by sign-in state]
key-files:
  created:
    - native/steam-bridge/helper/gamelib_appstate.h
    - src-tauri/crates/gamelib-steampoll/src/app_state.rs
    - src-tauri/crates/gamelib-steampoll/tests/app_state.rs
    - src/backend/storeManagers/steam/__tests__/steamAppStateHelper.test.ts
  modified:
    - native/steam-bridge/helper/bridge_helper.c
    - src-tauri/crates/gamelib-steampoll/src/adoption.rs
    - src-tauri/crates/gamelib-steampoll/src/constants.rs
    - src-tauri/crates/gamelib-steampoll/src/lib.rs
    - src-tauri/crates/gamelib-steampoll/tests/adoption.rs
decisions:
  - "One shared evaluate() serves the tick and read(): the helper is gated per entry (always on unknown or signed-out, once per 15 s while signed in and the pid list is unchanged, immediately on a pid-list change or while a D-09 window is open), and read() uses a fresh cache so it always asks once"
  - "The helper state is read even when loggedOn is 0: spike 083 shows the library (state 1026) loads about 1 s before BLoggedOn turns 1, so a signed-out reading still carries a usable state"
  - "A helper answer with a definite state that lacks bit 4 refutes a pid change (D-07); state null, unavailable and steam-not-running leave the pid rule standing"
  - "An ok line with loggedOn outside 0 or 1, or a state/installed that is negative, fractional or over u32, is helper-failed rather than best-effort parsed"
metrics:
  tasks: 2
  files: 9
  completed: 2026-11-18
commits: 2
plan_head_before: d56067cbcce5443c553f32c031c0fba654c53850
plan_head_after: cf7647ccd6698f83e409e533efdf5b70091ab198
actuals:
  tokens: 13000
  tasks: 2
  commits: 2
---

# Phase 81 Plan 04: macOS helper reading for the adoption watch Summary

The macOS adoption watch now asks Steam itself, through a new `--steam-appstate` helper subcommand, whether it is signed in and what install state it holds for the app, so the 112100 case (Steam open at its sign-in screen, the operator signs in, the same pid adopts) is detected within a tick and InstallApp fires only in the one case D-09 allows.

## Commits

- 200f16c57: feat(81-04) `--steam-appstate` helper subcommand and its Rust reader (tracer)
- cf7647ccd: feat(81-04) macOS adoption watch reads the helper

## What was built

- **Task 1 (tracer).** `gamelib_appstate.h` (GameLib-owned) adds `gamelib_appstate_main`: argument parse through `gl_ia_parse_app_id`, any extra argument is a usage line (exit 64), non-arm64 prints `unsupported-arch`. `gl_as_run` mirrors `gl_ia_run`: stdout fd swap, `alarm(8)`, the forked-child RTTI scan for the app-manager getter slot, `steam-not-running` and `not-signed-in` mapped to unavailable and `loggedOn 0` respectively (A1), IClientUser from engine slot 8 with an RTTI check, `BLoggedOn` on its unique function-ID slot inside steamclient.dylib, then `GetAppInstallState` (0xeaf2) and `GetNumInstalledApps` on unique slots (an unresolved slot gives `null`). It re-attaches on every call and never reads or prints a SteamID. `bridge_helper.c` dispatches it beside `--steam-uninstallapp`, before the secret block and the socket server. `app_state.rs` is a copy of the `request_steam_install_app` shape: appId 1-10 digits, helper path only from the host, argv array, 64 KiB cap, last non-empty line, typed outcome.
- **Task 2.** `adoption.rs` Darwin evaluation: per-entry `HelperCache` (last helper time, signed-in, state, saw-signed-out, signed-in-at, install-app-fired) plus a watch-level sorted pid list. Evidence order: ACF rewrite, helper bit 4 (`"helper"`), pid change unless the helper definitely says not 4, with `signedIn` from `loggedOn` and unknown (None) when the helper cannot answer. D-09 InstallApp is requested in exactly one place (`maybe_fire_install_app`), marked fired and persisted before the call, with the library root taken as the manifest path's grandparent. Windows and Linux never spawn the helper.

## Verification

- `pnpm exec jest steamAppStateHelper steamInstallAppHelper`: 20 passed on this Mac (the darwin describe runs, real clang compile of the helper under a fake HOME); `prettier --check` clean on the new test.
- `cargo test -p gamelib-steampoll --test adoption --test app_state --test update`: 29 + 10 + 34 passed. `cargo clippy --all-targets -D warnings` and `cargo fmt --check` clean.
- `pnpm build-steam-bridge` builds the helper with the new header (clang `-Wall -Wextra` shows nothing for it).
- Mutation checks on the new logic (each made the matching tests fail, then restored): opening the D-09 window without a prior signed-out reading, a 0 ms fallback delay, and disabling the helper refutation of a pid change.
- Acceptance greps: `--steam-appstate` in bridge_helper.c (2), `0xeaf2u` in the header, zero `steamid` matches outside comments, `"--steam-appstate"` in app_state.rs, one `request_steam_install_app(` call site in adoption.rs, three new constants.

## Deviations from Plan

**1. [TDD order] Task 1 helper tests ran after the C implementation.** The plan is `type: execute`; the Rust reader tests were written first and observed failing to compile (no `app_state` module), while the compiled-helper Jest test was written after `gamelib_appstate.h` because it can only fail once the dispatch exists. Task 2 tests were written after the implementation and checked by the three mutations above.

**2. [Interpretation] `read_app_state` appears on two lines of adoption.rs, not two call sites.** The acceptance count (>= 2, "tick and read") is satisfied by the `use` and one call: the tick and `read()` share a single `evaluate()`, which is the one place the helper is called. `read()` forces the call by passing a fresh cache.

**3. [Out of scope] Pre-existing reds logged to `deferred-items.md`.** `contracts.rs::ops_sorted_and_unique` expects 24 ops and the table has 27 since 81-02; `cargo doc -D warnings` fails on a `testing::RecordingHost` link in `lib.rs`. The phase-level reds listed in the dispatch (`backend-di-ceilings`, `find-deadcode`, `acfUpdateReplay`) were not touched or run.

**4. [Process] `plan_head_before` is the HEAD when this executor started.** The count of 2 matches this plan's two commits; no commit from the concurrent session landed in the range.

## Known Stubs

None. The helper is intentionally not run against live Steam here; that is the 81-20 live gate.

## Threat Flags

None beyond the plan's threat model (T-81-10 through T-81-14 mitigated as specified: appId validated in Rust and in `gl_ia_parse_app_id`, no shell, extra argument rejected; slots verified at run time with RTTI re-check; no SteamID printed; `alarm(8)` plus the Rust timeout plus the 15 s gate; InstallApp once per record behind the experimental setting and an observed sign-in).

## Live gate (operator, 81-20)

Rebuild with `pnpm build-steam-bridge`, then run the bundled helper against real Steam signed in, at the sign-in screen, and not running, and confirm `{"result":"ok","loggedOn":1,"state":4,...}`, `{"result":"ok","loggedOn":0,...}` and `{"result":"unavailable","reason":"steam-not-running"}`. The slot resolution for `GetAppInstallState` through `gl_ia_find_method_slot` (it requires the interface-17 marker, unlike spike 083's probe) is only proven against a live client.

## Self-Check: PASSED

Created files exist (`gamelib_appstate.h`, `app_state.rs`, `tests/app_state.rs`, `steamAppStateHelper.test.ts`) and both commits (200f16c57, cf7647ccd) are ancestors of HEAD.
