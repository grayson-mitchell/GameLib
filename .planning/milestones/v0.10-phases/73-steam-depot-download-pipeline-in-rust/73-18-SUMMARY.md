---
phase: 73-steam-depot-download-pipeline-in-rust
plan: 18
subsystem: steam-depot
tags: [steam-depot, rust, live-gate, uat, ci, delete-gate]
requires: [73-17]
provides:
  - "73-UAT.md complete: 8 pass, item 9 issue accepted by the operator"
  - "73-PARITY.md: live-UAT record, four CI runs, D-15 delete gate with three checked conditions"
affects: [73-19, 73-20]
tech-stack:
  added: []
  patterns:
    - "Live-gate harness: 1 s process/install-tree monitor plus cumulative tail -F log copies, because every launch rotates gamelib.log"
    - "Allocated-size (du -sk) progress thresholds, because the Rust writer preallocates sparse files"
key-files:
  created:
    - .planning/todos/pending/2026-11-09-stale-steam-queue-head-cancel-deletes-complete-install.md
    - .planning/phases/73-steam-depot-download-pipeline-in-rust/73-18-SUMMARY.md
  modified:
    - .planning/phases/73-steam-depot-download-pipeline-in-rust/73-UAT.md
    - .planning/phases/73-steam-depot-download-pipeline-in-rust/73-PARITY.md
    - .planning/todos/pending/2026-11-09-sidecar-orphaned-after-tauri-dev-ctrl-c.md
key-decisions:
  - "UAT item 9 (sidecar orphaned after Force Quit) accepted for the D-15 gate: a pre-existing sidecar exit-contract defect, tracked in the orphan todo; the Rust pipeline stopped all writes at Force Quit"
  - "Stale Steam queue head cancel-delete data loss filed as critical and scheduled as the first work item after phase 73"
  - "Item 4 used the dead-sidecar dialog's Quit, not Restart: app.restart() under tauri dev has never been exercised"
  - "CI 'commit under test' is the first all-green rust-test.yml run containing every phase-73 fix (a1134fe42); intervening pushes carried unrelated commits"
requirements-completed: [P73-D, P73-E, D-08, D-15]
duration: about 3 h (operator-driven live UAT in four app sessions, then four CI iterations)
completed: 2026-11-09
---

# Phase 73 Plan 18: Live macOS UAT, three CI legs and the D-15 delete gate Summary

The Rust depot pipeline passed the live macOS gate: 8 of 9 items passed and the operator accepted item 9. CI went green on Windows, macOS and Linux after four runs, which found and fixed a real Windows defect that could have written depot files outside the library. All three D-15 delete-gate conditions are recorded as met, so plan 73-19 may run.

## Tasks

| Task | Commits | Result |
| ---- | ------- | ------ |
| 1 Live macOS UAT | 61808651b (preflight), 89347dd9d (results and todos), 3d5d8faf5 (PARITY/STATE notes) | 8 pass, item 9 issue (accepted) |
| 2 Three CI legs | 05359e8bd, e6ea9431b, 30b5297da (red runs recorded); final record in the Task 3 commit | Green at run 42600886049 (`a1134fe42`) |
| 3 Delete gate | this plan's final docs commit | `## Delete gate (D-15)` with three `- [x]` lines |

## Live UAT (Rust default, `pnpm tauri:dev`, four sessions)

- **Install:** Civ V (8930) completed with `acf=4 macho=14` and launched through `steam://rungameid`.
- **Pause and resume:** cancelled, then verify_only `missing=6694`, then completed with 3.12 GB fetched, against 5.55 GB for a full install.
- **Cancel:** DREDGE cancelled (`acf=1026`) and the partial install was removed.
- **Sidecar EOF:** the kill logged `depot jobs cancelled on sidecar EOF: 1`, and no file was written after it.
- **Startup resume:** verify_only on relaunch, through a Resume Install click (existing design).
- **Bridge install:** Schedule I installed into a fresh bottle (`acf=4`), with bridge `HELLO` and `GINIT ok=1`.
- **Shared redist:** the 228980 job ran (`acf=none pk=19`).
- **select_files restore:** `acf=none`, and the restored backup has the same sha1 as before.
- **Force Quit (item 9):** downloads stopped with the shell, but the sidecar survived under pid 1 for 3 min 41 s after logging stdin EOF, held by open TCP sockets. This is an issue, and the operator accepted it.

## CI iterations (rust-test.yml)

| Run | Head | Result | What it found |
| --- | ---- | ------ | ------------- |
| 42596120066 | 5eb2d54f6 | red | Windows `gamelib-depot` download tests (drive prefix lost in `post.rs` `lexical_resolve`; real defect); macOS clippy `needless_range_loop` (from 71-20) |
| 42597998166 | 66da27b35 | red | Windows shell test `install_root_guard` used POSIX-only fixtures |
| 42599306709 | 6274f3a97 | red | Windows clippy: `stat_identity` dead on win32; `unused_variables` ceiling fell |
| 42600886049 | a1134fe42 | **green** | all three legs, including depot tests, static codec linkage and both clippy ratchets |

The fixes were made by the orchestrator outside this plan: `14528f0a5`, `cf65f54db`, `684d20424`.

## Deviations from Plan

1. **[Harness] Kill threshold.** `kill-sidecar-at.sh` was switched to `du -sk`, because `download.rs` preallocates sparse files with `set_len`, so a sum of stat sizes overstates progress.
2. **[UAT wording] Expected text differed from behaviour in three items, with no defect behind any of them:**
   - Item 4: a persisted Steam queue head is not resumed automatically after relaunch.
   - Item 8: the restore rewrites `.gamelib-orig`, not the live DLL.
   - Item 2: a verify_only line appears between the cancel and the completion.
3. **[Item 3 title] Cancel ran on DREDGE.** The Steam client had already finished Zomboid after item 9.
4. **[Pre-push gates] Earlier phase-73 plans left two pre-push gates red.** The meta-scope codecheck (`2bb87b6e4`) and knip find-deadcode (`9c1b6773a`, 13 dead exports) had to be fixed before the first push. This is recorded in 73-PARITY.
5. **[Commit under test] Each CI run covered a newer head.** Later unrelated commits were pushed with the fixes, so each run's head is newer than the fix commit. The green run contains every phase-73 commit.
6. **[Not re-tested] Items 6 and 8.** The live UAT ran before quick-261109-uv4 moved the shared-redist ledger onto the store engine. Items 6 and 8 were not re-run against that change.

## Issues found

- **Critical: data loss.** Cancelling a stale persisted Steam queue head deleted a complete 8.2 GB install. The queue head was never re-checked after Steam took over the install, the cancelled job downgraded the ACF to 1026, and cancel-delete then trusted that ACF. This is in the TS layer and likely affects the TS pipeline too. Todo `2026-11-09-stale-steam-queue-head-cancel-deletes-complete-install.md` is scheduled right after phase 73.
- **Sidecar orphan after Force Quit (item 9).** The repro and lsof evidence are on todo `2026-11-09-sidecar-orphaned-after-tauri-dev-ctrl-c.md`.

## Known Stubs

None.

## Threat Flags

None. T-73-66: the UAT and PARITY entries carry only proof lines and basenames, with no tokens, and full logs stay in the scratchpad. T-73-67: the delete gate is recorded with three checked lines before plan 19.

## Self-Check: PASSED

- FOUND: 73-UAT.md (`status: complete`, 9 resolved `result:` lines), 73-PARITY.md (`## Delete gate (D-15)`, 3 `- [x]`), both todos, this SUMMARY
- FOUND commits: 61808651b, 89347dd9d, 3d5d8faf5, 05359e8bd, e6ea9431b, 30b5297da
