---
phase: 85-store-host-config-and-versioned-migrations
plan: 20
subsystem: testing
tags: [live-gate, macos, keychain, codesign, store-host, uat]

requires:
  - phase: 85-03
    provides: the live macOS gate contract 85-HUMAN-UAT.md (eight items, preflight, capture plan)
  - phase: 85-19
    provides: the signed, notarized Phase 85 build (draft v0.11.0) with identity equal to the v0.10.0 baseline
provides:
  - the scored Phase 85 live gate on the operator's Mac (6 pass, 2 issue), with pre-run re-check, run-time count and closing inventory
  - SC3 / FND-07 live evidence - zero Keychain prompts across the signed v0.10.0 -> v0.11.0 upgrade
affects: [85-21, 85-22, 85-23, 85-24, 85-25, gsd-verify-work 85]

actuals:
  tokens: 9000      # chars/4 over the realized diff: 85-HUMAN-UAT.md (20522 added chars) + this SUMMARY
  tasks: 3
  commits: 22       # MEASURED: git rev-list --count plan_head_before..plan_head_after; only 3 are this plan's (a68c019df, a90c128d0, 441e09a5e) - the other 19 are concurrent Phase 84 and quick-task commits on main
plan_head_before: 87d6b1d319b45f7f8a4f937736d6102a65fa1872
plan_head_after: 441e09a5eee1b928b3cfe4319fabd82b54fe81c5

tech-stack:
  added: []
  patterns:
    - "Keychain prompt capture is proven non-vacuous by the baseline's own logged prompt (securityd 'displaying keychain prompt') plus a credential read in the scored launch"
    - "One checkpoint per operator step; every copy, corruption, restore and capture done by the executor between them"

key-files:
  created:
    - .planning/phases/85-store-host-config-and-versioned-migrations/85-20-SUMMARY.md
  modified:
    - .planning/phases/85-store-host-config-and-versioned-migrations/85-HUMAN-UAT.md

key-decisions:
  - "Required literals row `store write failed` was IMPOSSIBLE (no emitter); the run stopped and the orchestrator applied A1: `refused a store write: write failed` (renderer writes), with the note that a failed sidecar frame write leaves no gamelib.log trace"
  - "P2's `pgrep -fl GameLib` matched unrelated processes holding the repo path; the orchestrator applied A3: `pgrep -fl 'gamelib-shell|GameLib\\.app|build/main/sidecar\\.js'` plus the reaper check"
  - "Item 2 scored issue, not pass: Humble and Epic were never signed in on v0.10.0, so those sub-checks could not be exercised (precondition context, not a Phase 85 regression)"
  - "The offline first boot emptying the GOG caches is a todo, not a block on 85-21 (operator decision): .planning/todos/pending/2026-11-22-gog-offline-launch-empties-library-cache.md"

patterns-established:
  - "Live gate amendments are recorded in the contract as orchestrator amendments beside the verdict they replace"

requirements-completed: []  # plan requirements FND-06, FND-07 are shared with 85-21..85-25; not complete until those finish

coverage:
  - id: D1
    description: "Signed v0.10.0 -> signed v0.11.0 upgrade with zero Keychain prompts (item 1, SC3)"
    requirement: FND-07
    verification:
      - kind: manual_procedural
        ref: "85-HUMAN-UAT.md item 1; keychain-1.log 0 'displaying keychain prompt'; gamelib-launch-1.log keyring_get steam-refresh-token outcome=found"
        status: pass
    human_judgment: true
    rationale: "Live operator observation on signed builds (no dialog seen) is part of the evidence; verify-work confirms SC3"
  - id: D2
    description: "Stored credentials still work after the upgrade (item 2)"
    requirement: FND-07
    verification:
      - kind: manual_procedural
        ref: "85-HUMAN-UAT.md item 2"
        status: fail
    human_judgment: true
    rationale: "Steam and P4 met; Humble and Epic sub-checks not exercisable (never signed in on v0.10.0) - the operator decides whether to accept"
  - id: D3
    description: "Existing data loads unchanged across the upgrade (item 3, SC1)"
    requirement: FND-06
    verification:
      - kind: manual_procedural
        ref: "85-HUMAN-UAT.md item 3; snapshot-v010.txt vs snapshot-after-launch1.txt / snapshot-launch1-running.txt"
        status: fail
    human_judgment: true
    rationale: "Versions and settings equal; GOG count 0 vs 10 after the offline first boot (todo filed)"
  - id: D4
    description: "Settings persist in the TS byte format; corrupt store kept and reported; newer store read-only and untouched; pre-migration backup; quit flush in budget (items 4-8, SC2, D-18, D-21)"
    requirement: FND-06
    verification:
      - kind: manual_procedural
        ref: "85-HUMAN-UAT.md items 4-8 (byte checks, cmp, P7, exit finished in 50-52 ms)"
        status: pass
    human_judgment: true
    rationale: "Live run on the operator's profile; the byte/cmp evidence is recorded, verify-work signs off"

duration: 1h 24min
completed: 2026-11-22
status: complete
---

# Phase 85 Plan 20: Live macOS gate on signed builds Summary

**The signed v0.10.0 -> signed v0.11.0 (Phase 85) upgrade raised zero Keychain prompts, and the Rust store host behaved as specified on the operator's real profile across eight launches; two items are `issue`: item 2 (Humble and Epic never signed in on the baseline) and item 3 (an offline first boot emptied the GOG caches, now a todo).**

## Performance

- **Duration:** 1h 24min
- **Started:** 2026-11-22T03:36:18Z
- **Completed:** 2026-11-22T05:00:12Z
- **Tasks:** 3 (Task 2 was the operator-driven run; one checkpoint per operator step)
- **Files modified:** 1 (plus this SUMMARY)

## Accomplishments

- **SC3 / FND-07: no Keychain prompt across the signed upgrade.** `keychain-1.log` (15,749 lines) has 0 `displaying keychain prompt` events, while launch 1 read `steam-refresh-token` (`outcome=found`). The capture is not vacuous: it caught the one baseline prompt at P5, where the operator chose Always Allow.
- **Items 4-8 pass, all with byte or `cmp` evidence:**
  - Settings keep the TS byte formats.
  - A corrupt `store/timestamp.json` was kept beside its `.corrupt.<stamp>.json` copy and reported as Play history.
  - `download-manager.json` at schemaVersion 99 opened read-only with the newer-GameLib notice.
  - A v1 `steam_library.json` migrated to schemaVersion 3, with a byte-identical `.v1.` backup.
  - Every launch exited in 50-52 ms, with 0 `still running`, 0 `store frame rejected` and 0 `refused a store write` lines.
- **Required literals all REACHABLE after A1.** The pre-run re-check found one row IMPOSSIBLE and stopped the run, as the plan requires.
- **Profile left unedited.** Every edited store was restored and `cmp`-checked. The profile copies were deleted after scoring.

## Task Commits

1. **Task 1: pre-run re-check** - `a68c019df` (docs). Then `a90c128d0` (docs) applied the orchestrator's amendments A1 and A3, re-ran P2 and recorded P3 to P5.
2. **Task 2: operator run** - no commit. Captures live in `/tmp/gamelib-gate-2026-11-22T03:38:53Z/`, never committed.
3. **Task 3: scoring** - `441e09a5e` (docs)

**Plan metadata:** recorded in the final docs commit (SUMMARY, STATE, ROADMAP)

## Files Created/Modified

- `.planning/phases/85-store-host-config-and-versioned-migrations/85-HUMAN-UAT.md` - pre-run re-check, A1/A3 amendments, eight scored results, run-time count, closing inventory, frontmatter `status: partial`

## Results

| Item | Status | One-line evidence |
|------|--------|-------------------|
| 1 Signed upgrade, zero Keychain prompts | pass | 0 prompt events in `keychain-1.log`; credential read; operator "dialog: none" |
| 2 Stored credentials still work | issue | Steam Refresh with no sign-in prompt, P4 unchanged; Humble and Epic not signed in on v0.10.0 either |
| 3 Existing data loads unchanged | issue | versions and settings equal; GOG count 0 vs 10 while launch 1 ran offline |
| 4 Settings persist in TS byte format | pass | 2-space, no trailing newline; tab plus envelope; values persisted and reverted |
| 5 Corrupt store kept and reported | pass | `.corrupt.` copy equals the edited bytes; notice names Play history; `failed` log line |
| 6 Newer store read-only | pass | newer-GameLib notice; `is read-only: newer` line; file untouched |
| 7 Pre-migration backup | pass | `1 migrated`, schemaVersion 3, `.v1.` backup byte-identical |
| 8 Quit flushes inside the budget | pass | `exit finished in 51 ms`, no `still running`; toggle persisted |

**SC3: proven.** The identities were equal (85-VALIDATION.md), and item 1 passes on real signed builds. The SC3 line in 85-VALIDATION.md is left for `/gsd-verify-work`. SC1 is proven for versions and settings, but not for the GOG cache count (item 3). SC2 is proven (items 5-7).

**GOG offline emptying:** see `.planning/todos/pending/2026-11-22-gog-offline-launch-empties-library-cache.md` (operator decision: a todo, not a block on 85-21).

## Decisions Made

- Applied the orchestrator's A1 (the `store write failed` literal replaced by `refused a store write: write failed`, with the sidecar-frame boundary note) and A3 (the narrowed P2 pattern). Both are recorded in the contract as orchestrator amendments.
- Scored item 2 `issue` with the precondition context (Humble and Epic never signed in on the baseline) rather than `pass`. The plan rule is that an unmet `expected:` is an `issue`.
- Did not restore the GOG caches after launch 1. The online Refresh had already refilled them with the same 10 app ids, and a restore would have overwritten fresher data.

## Deviations from Plan

**1. [Rule 1 - Contract defect] Required literals row `store write failed` IMPOSSIBLE**
- **Found during:** Task 1
- **Issue:** no code emits the literal, so its "must be ABSENT" can never fail (Test 4)
- **Fix:** stopped before Task 2 per the plan. The orchestrator chose A1, applied in `a90c128d0`.
- **Files modified:** 85-HUMAN-UAT.md

**2. [Rule 3 - Blocking] P2 pattern matched unrelated processes, and a dev instance was live**
- **Found during:** Task 1
- **Issue:** `pgrep -fl GameLib` matched other sessions' shells. A `pnpm tauri:dev` run against the same profile was also live, so P3 could not be taken.
- **Fix:** A3 applied. The operator quit the dev run, then P2 came back clean and P3 was taken.

**3. [Rule 1 - Capture gap] Live instance count recorded for launch 1 only**
- **Found during:** Task 3 inventory
- **Issue:** `shell-pid-N.txt` exists only for launch 1.
- **Fix:** none possible after the fact. For launches 2-8, P2 was clean before each launch and each log has exactly one `store boot: ` line and one `exit finished in ` line. Recorded in the contract's closing inventory.

**Total deviations:** 3 (2 contract defects amended by the orchestrator, 1 capture gap disclosed). **Impact:** no item's evidence depends on the missing counts.

## Issues Encountered

- **The offline first boot emptied `gog_library.json` and `gog_api_info.json`** (item 3). Handed to the todo above.
- **The Refresh button gives no click feedback.** Not a gate item. Filed by the orchestrator as `.planning/todos/pending/2026-11-22-refresh-button-gives-no-click-feedback.md`. The click is received (`origin=action-icons-refresh-button`).

## Known Stubs

None.

## User Setup Required

None. Note: `/Applications/GameLib.app` is now the signed v0.11.0 draft build. The signed v0.10.0 is at `/tmp/gamelib-gate-2026-11-22T03:38:53Z/app-v010/GameLib.app`.

## Next Phase Readiness

- 85-21 (the D-03 deletion) may start once the operator accepts the two `issue` results. The GOG item is already accepted as a todo. Item 2's Humble and Epic sub-checks were never exercisable.
- The kept captures (`notes.log`, the `gamelib-*.log` and `keychain-*.log` files, the snapshots, and `launch1-gog_library.emptied.json`) remain in `/tmp/gamelib-gate-2026-11-22T03:38:53Z/`. The logs carry local paths and store names.

---
*Phase: 85-store-host-config-and-versioned-migrations*
*Completed: 2026-11-22*

## Self-Check: PASSED

Commits a68c019df, a90c128d0 and 441e09a5e are ancestors of HEAD; 85-HUMAN-UAT.md, this SUMMARY, the GOG todo and the two kept gate files exist; /Applications/GameLib.app is 0.11.0.
