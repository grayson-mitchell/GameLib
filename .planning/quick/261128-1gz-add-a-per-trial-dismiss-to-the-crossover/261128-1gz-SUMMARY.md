---
phase: quick-261128-1gz
plan: 01
subsystem: engine-notices
tags: [crossover, trial-notice, dismiss, rust, ipc, renderer]
status: complete
requires:
  - "87-49 native dismissEngineNotice channel"
provides:
  - "per-trial Dismiss for the CrossOver trial notice, persisted in Rust"
  - "Buy CrossOver click logged to gamelib.log"
affects:
  - src-tauri/crates/gamelib-engine/src/state/notices.rs
  - src-tauri/crates/gamelib-engine/src/state/engine_state.rs
  - src-tauri/src/engine_dispatch.rs
  - src/common/types/ipc/nativeChannels.json
  - src/frontend/screens/Game/GamePage/components/EngineNotices.tsx
key-files:
  modified:
    - src-tauri/crates/gamelib-engine/src/state/notices.rs
    - src-tauri/crates/gamelib-engine/src/state/engine_state.rs
    - src-tauri/crates/gamelib-engine/src/lib.rs
    - src-tauri/src/engine_dispatch.rs
    - src/common/types/ipc/nativeChannels.json
    - src/common/types/ipc/ipcSchemaSnapshot.json
    - src/common/types/engine.ts
    - src/common/types/ipc/native.ts
    - src/common/types/ipc/engine.ts
    - src/frontend/state/EngineState.ts
    - src/frontend/screens/Game/GamePage/components/EngineNotices.tsx
    - .planning/phases/87-engine-wine-and-tools/87-HUMAN-UAT.md
decisions:
  - "Trial identity is the estimated end day (UTC epoch day + daysRemaining), max kept, 3-day slack"
  - "Rust logs only the new crossover-trial kind, so goldens' logs == 0 holds"
metrics:
  tasks: 3
  commits: 3
plan_head_before: b7ca72fffe8fe5cd2d8140db7256594ba00f3c0f
plan_head_after: bd011bf028870bc0737475103402205cb409d0cc
commits: 3
actuals:
  tasks: 3
  commits: 3
completed: 2026-11-28
---

# Quick 261128-1gz: Per-trial Dismiss for the CrossOver trial notice

The in-page CrossOver trial notice now has a Dismiss button next to Buy CrossOver. The dismissal is stored by Rust alone and keyed by the trial's estimated end day, so it stays hidden for that trial and a later trial shows it again. Both clicks are logged.

## Commits

- `22cfe62cb` feat: dismiss the CrossOver trial notice per trial (Rust arm, `compute()` check, three-arm decode, IPC contract, renderer button)
- `0aa7c8102` feat: log Buy CrossOver clicks on the trial notice
- `bd011bf02` docs: reword 87 UAT item 2 and close the trial-notice todo (todo moved to `completed/` with a Resolution)

## What was built

- `notices.rs`: `crossover-trial` dismiss arm; `TRIAL_DISMISSED_END_DAY_KEY` (`crossoverTrialNoticeDismissedEndDay`), `TRIAL_DISMISS_SLACK_DAYS` (3), `trial_end_day`, `is_trial_notice_dismissed`. A count above 7 returns `{ok:false}` and writes nothing. One `Engine: CrossOver trial notice dismissed daysRemaining=.. trialEndDay=.. ok=..` line through `ctx.log`.
- `engine_state.rs`: `compute()` takes `now_ms` and hides a dismissed trial; both the page read and the launch publish pass `ctx.clock.now_ms()`.
- `engine_dispatch.rs`: `parse_dismissal_args` decodes three strict arms. `nativeChannels.json` has the widened type and valid/invalid vectors; `ipcSchemaSnapshot.json` regenerated (`ipc_contract.rs` unchanged).
- Renderer: `hideNotice(.., 'trial')`, Dismiss button, `window.api.logInfo` line on Buy CrossOver.
- 87-HUMAN-UAT item 2 `expected:` reworded; no `result:` line changed (checked against HEAD).

## Verification run (Windows)

Baselines at HEAD first: jest 4 suites / 47 tests green; `gamelib-engine` lib `state::` 10 passed; shell `dismiss_engine_notice` 2 and `native_manifest` 8 passed.

After:
- `gamelib-engine` lib `state::` 14 passed (4 new, including the end-to-end dismiss/hide/same-trial/new-trial/refusal/log test through the real StoreHost, which runs on Windows).
- shell `dismiss_engine_notice` 2 passed (decode test renamed to "three strict arms" with the new cases); `native_manifest` 8 passed (new vectors replayed).
- jest 4 suites, 49 tests passed.
- `cargo clippy -p gamelib-engine --all-targets --features testing -D warnings` clean; `cargo fmt --check` and `rustfmt --check engine_dispatch.rs` clean.
- `pnpm check:ipc-contract`, `pnpm codecheck`, `pnpm planning-gates` (12/12) green; prettier `--check` clean on the 8 non-ignored paths.
- No golden fixture edited; `is_trial_notice_dismissed` is wired into `compute()` in code.

Could not run on Windows: the `#[cfg(unix)]` shell write test (extended with trial `{ok:true}` and `daysRemaining: 8` `{ok:false}` cases; it does compile-check only by inspection here) and `golden_state.rs` / `roundtrip_state.rs` (unix-only). Both run in CI. Not run live: the 56c-3 check and a live click of Dismiss and Buy; recorded as owed in the todo Resolution.

## Deviations from Plan

- The extra `cfg(unix)` write-test assertions were not compiled locally (Windows). `engine_dispatch.rs` uses `Arc::clone(&engine)` for the earlier `no-crossover` call so `engine` is available for the new trial calls; this is untested until CI.
- Test-first order: the Rust tests and implementation were written together (the Rust tests passed on first run, so no RED was observed for them). The jest tests (Dismiss, `hideNotice 'trial'`, Buy log) were run red before their implementation.
- The "extra key" invalid vector is `{kind:'crossover-trial', daysRemaining:5, extra:1}` rather than the plan's `{daysRemaining:5, extra:1}`, so it tests strictness of the right arm.
- `graphify update .` took over three minutes and finished in the background; it printed only a semantic-extraction tip and nothing was staged from it.

## Known Stubs

None.

## Threat Flags

None. No new network endpoint or auth path; the new store key is a constant and the payload is strictly decoded (T-261128-1gz-01 to -04 mitigated as planned).

## Self-Check: PASSED

Commits `22cfe62cb`, `0aa7c8102`, `bd011bf02` exist; the todo is in `completed/` with one `## Resolution`; the pending path is gone.
