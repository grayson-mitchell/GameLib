---
phase: 81-unify-the-steam-restart-hold-into-restart-on-play
plan: 18
subsystem: steam-polling
status: complete
tags: [steam, restart-hold-removal, deletion-gate, dead-code]
requires: [81-17]
provides:
  - steamClientProcess.ts reduced to the "which Steam client pids exist" leaf (listSteamClientPids and its two parsers)
  - the Phase 81 deletion gate (restart hold deleted, D-11/D-13) in steamPollsPortComplete.test.ts
affects: [81-19, 81-20]
tech-stack:
  added: []
  patterns: [string-aware Rust comment stripper for source-text gates, allow-list gate with a once-proven failing direction]
key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/steamClientProcess.ts
    - src/backend/storeManagers/steam/__tests__/steamClientProcess.test.ts
    - src/backend/storeManagers/steam/depotRust/__tests__/rustSecondary.test.ts
    - src/backend/storeManagers/steam/__tests__/library.refresh.test.ts
    - src/backend/storeManagers/steam/__tests__/library.installedMap.test.ts
    - src/backend/storeManagers/steam/__tests__/library.installRoot.test.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/backend/storeManagers/steam/__tests__/library.macArch.test.ts
    - src/backend/storeManagers/steam/__tests__/library.resumeBreadcrumbs.test.ts
    - src/backend/__tests__/steamPollsPortComplete.test.ts
decisions:
  - "The gate's Rust comment stripper is a small state machine (line comments, nested block comments, string and raw-string literals, char literals) rather than a regex, so a URL in a string does not swallow the rest of a line and a quoted symbol still counts as code"
  - "The gate asserts the legitimate survivors (hold_migration, steampoll_hold_drain/discard, steampoll_running_hold, RunningPoll::hold, steam-waiting-for-restart) do not contain any forbidden needle, so a future edit to the lists cannot start catching them unnoticed"
metrics:
  tasks: 2
  files: 10
  completed: 2026-11-18
commits: 2
plan_head_before: 59c1098d91695e84f1fa742961c5abf1c9034e20
plan_head_after: 7a00a4081ab09379234f8b454e91c3b38f80fcbf
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
---

# Phase 81 Plan 18: delete the TS start-token probe, pin the hold's absence Summary

The TS Steam start-token probe (dead since Phase 80) is gone, and a Phase 81 gate in steamPollsPortComplete.test.ts now fails if any restart-hold file, symbol, the re-arm, or a writer of `steam_restart_hold.json` comes back.

## Commits

- 65e61fa71: refactor(81-18) delete the unused TS Steam start-token probe (tracer)
- 7a00a4081: test(81-18) the Phase 81 restart-hold deletion gate

## What was built

- **Task 1 (tracer).** `parsePidTokenLines`, `readSteamProcessStartTokens`, `START_TOKEN_TIMEOUT_MS` and the `run` helper's timeout parameter are deleted from steamClientProcess.ts; its header no longer describes the hold and now says the Rust steam_process.rs is the only start-token probe left (D-11). The two describe blocks for the deleted functions and the now-unused `at` import went from steamClientProcess.test.ts; the `readSteamProcessStartTokens: jest.fn()` key (and its "quick 261029-pkp" comment) went from the seven mock factories. No jest.mock count changed, so backendDiCeilings needed no edit. The file keeps `parseTasklistSteamPids`, `parsePgrepPids`, `SteamProbeDeps` and `listSteamClientPids`.
- **Task 2.** New `describe('restart hold deleted (Phase 81 D-11/D-13)')` block: hold.rs and rearm.rs (src and tests) stay deleted; none of ten hold/re-arm symbols appears in comment-stripped Rust under gamelib-steampoll/src, gamelib-steampoll-cli/src and src-tauri/src; none of six hold symbols appears in comment-stripped TS under src and meta (existing walk, `__tests__` skipped); only hold_migration.rs and profile.rs may mention `steam_restart_hold` in Rust code; plus a stripper self-test, a survivors-not-forbidden check and an anti-vacuity check (>= 30 Rust files, all three directories hit). The existing KEPT list is unchanged. The block runs 10 tests (31 in the file).

## Failing direction proved (acceptance criterion)

Each probe was applied, the gate run, then reverted:

1. `pub struct HoldStore;` appended to src-tauri/crates/gamelib-steampoll/src/lib.rs: "no hold or re-arm symbol remains in the Rust sources" failed naming `lib.rs: HoldStore`. `git diff --quiet -- src-tauri/crates/gamelib-steampoll/src/lib.rs` succeeded after `git checkout --` of that one file.
2. `const X: &str = "steam_restart_hold.json";` appended to gamelib-steampoll/src/outbox.rs: "only the D-12 migration and the profile path mention steam_restart_hold" failed naming outbox.rs. Reverted.
3. An empty gamelib-steampoll/src/rearm.rs created: "rearm.rs stays deleted" failed. Removed.

## Deviations from Plan

None - plan executed exactly as written. One authoring slip fixed in-flight: a block-comment terminator written inside the gate's own JSDoc closed the comment early (Prettier syntax error); the sentence was reworded before the first run.

## Verification

- `cargo test -p gamelib-steampoll` and `-p gamelib-steampoll-cli` (src-tauri/): all green.
- `pnpm exec jest src/backend/storeManagers/steam src/backend/sidecar src/backend/__tests__ src/common src/frontend/screens/Game`: 453 suites pass; the only 2 failures are the logged pre-existing `storeKinds.test.ts` and `acfUpdateReplay.test.ts`.
- `pnpm codecheck`, `pnpm lint` (0 errors): green. Prettier check green on all ten files (none ignored).
- `pnpm -s find-deadcode` and `pnpm -s backend-di-ceilings`: only the logged pre-existing findings (NativePortDataStyle, NativePortMac; launchWithoutSteam, NativePortInfo, LaunchWithoutSteam, NoticeStack); nothing from this plan.
- Note: `pnpm exec jest` occasionally re-ran a pnpm install (husky, helper-binary download) in this environment; no tracked file changed.

## Known Stubs

None.

## Threat Flags

None. T-81-53 (hold reintroduced silently) is mitigated by the gate above; no runtime surface was added.

## Self-Check: PASSED

- steamClientProcess.ts, steamClientProcess.test.ts and steamPollsPortComplete.test.ts exist and are committed.
- Commits 65e61fa71 and 7a00a4081 are ancestors of HEAD.
- `grep -rn readSteamProcessStartTokens src meta` finds only the gate's own forbidden-list entry.
