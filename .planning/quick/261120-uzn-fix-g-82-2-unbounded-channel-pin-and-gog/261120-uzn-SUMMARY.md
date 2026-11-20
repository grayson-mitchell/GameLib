---
phase: quick-261120-uzn
plan: 01
subsystem: gog-install
tags: [gog, windows, powershell, uac, elevation, testing]
status: complete
requirements: [G-82-2, 82-UAT-DEFERRED-GOG-WINDOWS-DIALOGS]
key-files:
  created:
    - src/backend/storeManagers/gog/windowsElevation.ts
    - src/backend/storeManagers/gog/__tests__/windowsElevation.test.ts
    - src/backend/storeManagers/gog/__tests__/setupElevation.win32.test.ts
    - .planning/todos/pending/2026-11-20-gog-windows-elevation-live-check.md
  modified:
    - src/backend/storeManagers/gog/games.ts
    - src/backend/storeManagers/gog/setup.ts
    - src/backend/storeManagers/gog/__tests__/uninstallSafety.test.ts
    - src/backend/__tests__/dialogOptionForwarding.test.ts
    - .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-UAT.md
commits: 3
plan_head_before: 417f972f191b189e439147e0594ec8d98182551d
plan_head_after: afacd26eefde2ccca93947f76079a30db5e9a204
actuals:
  tokens: 13200
  tasks: 3
  commits: 3
completed: 2026-11-20
---

# Quick 261120-uzn: G-82-2 channel pin and GOG Windows elevation Summary

One shared `windowsElevation` module now launches every GOG elevated program on Windows through single-quoted PowerShell literals. The uninstall passes `/KEEPSAVES`, and GOG setup runs all its elevated steps under one UAC prompt. The CI-red `UNBOUNDED_RUST_CHANNELS` pin also lists `RUST_SAFETY_REMOVE_TREE`.

## Commits

| Task | Commit | What |
| ---- | ------ | ---- |
| 1 (tracer) | 03533bd97 | `windowsElevation.ts` (literal quoting, CommandLineToArgvW quoting, `runElevatedSteps`), wired through the GOG uninstall and the DLC uninstall in `games.ts` |
| 2 | 6d3710cdf | `batchStatement` and the batched `runElevatedSteps`; `setup.ts` queues steps and flushes once |
| 3 | afacd26ee | `dialogOptionForwarding.test.ts` pin, `82-UAT.md` updates, the live-check todo |

`git rev-list --count` over the ledger base reports 4, not 3: a concurrent Phase 83 session committed `917f3e290` (a different plan) between my commits. The `commits: 3` above counts only this task's commits.

## What changed

- **G-82-2.** `RUST_SAFETY_REMOVE_TREE` added to EXPECTED with the WR-03 comment; test renamed; set-equality and length assertions untouched. `dialogOptionForwarding.test.ts` went red to green (18/18).
- **Uninstall dialog.** The Windows branch built the full switch set for its log line but passed PowerShell only `/verysilent` and `/dir=`. It now passes `/VERYSILENT /ProductId=<id> /galaxyclient /KEEPSAVES /dir=<install dir>`. The wine branch command is byte-identical to before.
- **Paths with spaces.** The uninstaller path was handed to PowerShell bare and split at the space, so the uninstaller never launched. It is now a literal.
- **`$(...)` expansion.** `setup.ts` wrapped GOG-supplied strings in double-quoted PowerShell strings run elevated. Every value is now a single-quoted literal (T-261120-uzn-01).
- **One setup prompt.** `runSetupCommand` queues on Windows; `runGogSetup` flushes the queue in a `finally` through `runElevatedSteps`. Several steps share one hidden elevated `powershell.exe -EncodedCommand`; one step elevates directly; a batch over `MAX_BATCH_STATEMENT_CHARS` (30,000) falls back to one prompt per step.
- **Phase 82 guard order** is unchanged: `checkRemoval` before the uninstaller, `guardedRemoveTree` after. All `uninstallSafety` assertions still pass.

## Planner decisions carried out

- Batched the setup prompts rather than deferring (measured feasible on this machine).
- The uninstall keeps its UAC prompt. The reasoning is in a comment above the Windows branch in `games.ts` and in the todo.
- Already-installed redists are not detected or skipped.
- The live UAC behaviour is a `ready: live-gate` todo, not a blocking checkpoint.

## Verification

- Baselines before editing: `uninstallSafety`, `fakeHomeIsolation` and `setup.engine` green; `dialogOptionForwarding` red (the G-82-2 failure).
- After: `windowsElevation` 16/16, `setupElevation.win32` 2/2, `uninstallSafety` 8/8 (the Windows-only test ran, not skipped), `setup.engine` 10/10, `fakeHomeIsolation` 7/7, `dialogOptionForwarding` 18/18. The two real-PowerShell round trips ran and passed on this Windows box.
- `pnpm codecheck` clean. `pnpm backend-di-ceilings` PASS (jestMock=1865, unchanged). `pnpm find-deadcode` PASS (312 baselined). ESLint: 0 errors; the warnings it reports in `games.ts` and `setup.ts` are pre-existing (`any` from `JSON.parse` and `ini`, `shlex` named-export caution). Prettier clean on every non-ignored path written. The todo frontmatter gate passes (11 pending todos).
- The elevated path is not exercised live: the round trips run unelevated.

## Deviations from Plan

- **[Rule 3 - Blocking] `toStartProcessArgumentList` made module-private.** `pnpm find-deadcode` flagged it as a new dead export; the plan said to make such a helper private rather than raise the knip baseline. It is covered through `startProcessStatement` and `elevatedStartProcessArgs`.
- **Pre-existing edit swept into the Task 3 commit.** `82-UAT.md` already carried an uncommitted operator edit (test 2's result line now records that the Rust test rerun went green, confirming the macOS steampoll flake). It sits in the same file as my G-82-2 edit and went into `afacd26ee` with it.

Otherwise the plan was executed as written.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. T-261120-uzn-01, -02, -05 and -06 are mitigated and tested; -03 is accepted and recorded in the live-check todo.

## Self-Check: PASSED

- Files found: `windowsElevation.ts`, `windowsElevation.test.ts`, `setupElevation.win32.test.ts`, and the live-check todo.
- Commits found: 03533bd97, 6d3710cdf, afacd26ee.
- Only paths in the plan's `files_modified` were staged; the unrelated dirty files (`.planning/state.json`, `public/locales/en/gamelib.json`, `.planning/debug/*`, `.planning/milestone.lock`, `.planning/quick/261114-2gg-*`) were left alone.
