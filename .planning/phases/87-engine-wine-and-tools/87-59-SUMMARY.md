---
phase: 87-engine-wine-and-tools
plan: 59
subsystem: live-macos-gate
tags: [live-gate, svc-02, d-11, d-12, signed-build, crossover, fallback-engine, winetricks, wine-manager, uat, macos]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: "87-01's gate contract (87-HUMAN-UAT.md); 87-58's CI proof and the version-bumped release recipe; the shipped Rust engine, bottle, wine-manager and tools crates"
provides:
  - "87-HUMAN-UAT.md scored on the operator's Mac with the signed 0.13.0 build over the signed 0.12.0 build: item 1 issue, item 2 pass, item 3 blocked, item 4 issue; Pre-run re-check, Run record, Findings and observations, Closing inventory"
  - "87-VALIDATION.md '## Signed builds (D-12)': the signed Phase 87 build (release/v0.13, run 45314401170) with identity equal to the Phase 86 build; gate line moved from blocked to pending"
affects: [87-verification, 87-gaps, phase-99]

actuals:
  tokens: 150000
  tasks: 3
  commits: 3

plan_head_before: 65b47bfa1328fe2f62e920578f210e052e6080b8
plan_head_after: 51484af2b91d9774c1207c05443287fa85e8fa18
commits: 3

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/87-engine-wine-and-tools/87-59-SUMMARY.md
  modified:
    - .planning/phases/87-engine-wine-and-tools/87-HUMAN-UAT.md
    - .planning/phases/87-engine-wine-and-tools/87-VALIDATION.md

key-decisions:
  - "The operator chose 'Cut a signed build' after 87-58 left the gate blocked: release/v0.13 from main 65b47bfa1 plus a 0.13.0 version bump (8a0096bae, off main, pushed), one dry_run=false dispatch (run 45314401170) producing the draft GameLib v0.13.0; no other draft, tag or main was touched."
  - "Operator decision A on the unwired engine log: score on amended evidence, a missing engine log line is not a finding, the wiring goes to a gap plan."
  - "Three of the seven named titles (Soma, Balrum, Conquest of Elysium 3) are native Mac installs with no bottle or engine step; the runs used Trash Goblin (Epic), Avernum 6 and Schedule I (Steam bridge) and Isaac's own bottle as the throwaway for item 2."
  - "Items scored by the contract: not fully met is issue, an untestable half is blocked; SVC-02 is NOT marked complete here because items 1 and 4 carry issues and item 3's removal half is blocked."

requirements-completed: []

duration: about 6h25m of wall clock with the operator (2026-11-24T02:45Z to 09:12Z)
completed: 2026-11-24
---

# Phase 87 Plan 59: Live macOS gate Summary

**The Phase 87 gate ran on the operator's Mac with the signed 0.13.0 build over the signed 0.12.0 build. The engine step, the CrossOver-first selection, the built-in fallback with its download, toast and badge, the CrossOver re-adopt with the save intact and the expired-trial routing all behave. Three real defects came out: the offline refusal does not fire, Winetricks runs against the wrong prefix and fails silently, and the wine-manager cannot install a release that was never installed.**

## Scores

| Item | Result | Key evidence |
|---|---|---|
| 1. CrossOver first, fallback, re-adopt | **issue** | Healthy: `reason=cx-healthy`, no toast. Fallback: `reason=cx-missing` on Avernum 6 (bridge, D3D11) and Trash Goblin (Epic), 228 MB pin downloaded in about 12 s with progress, toast and badge, DXVK in use. Re-adopt: marker pinned back to crossover, `saveinfo.dat` sha256 `7eb70257...` unchanged. NOT met: the offline refusal (a real download was attempted and failed, `step.rs:513-537` never refused); the 180 s hold is blocked (Conquest of Elysium 3 is Mac-native) |
| 2. Expired trial to Staging | **pass** | 5 days: in-page notice "CrossOver trial: 5 days remaining ..." with a Buy CrossOver button; expired: `engine=pinned ... reason=cx-expired`, toast, badge, Staging wineserver. Licence untouched; Isaac's bottle restored (tree sha256 `f963b4eb...`). Isaac itself showed no window on Staging (observation) |
| 3. Bottles | **blocked** | Reuse half passes (Avernum 6 marker, `cxbottle.conf`, birth time and the 46-entry bottle count unchanged). Removal half cannot be exercised: "Remove prefix" is disabled for the default prefix and targets the stored prefix, not the per-game bottle (TS survivors); sibling byte-equal at the close |
| 4. Tools and downloads | **issue** | Wine-manager install of never-installed entries rejected (`IpcValidationError ... at 0.isInstalled`); remove then reinstall of Wine-11.21 works with progress; the list stays stale until a restart; Winetricks `fontsmooth=bgr` ran on `Prefixes/shared` with `regedit ... not found` and no failure banner; DXVK toggle blocked by design; DXMT blocked (`winemac.so` has 0 `macdrv` exports) |

Summary counters: total 4, passed 1, issues 2, blocked 1, pending 0, skipped 0. Frontmatter `status: partial`.

## SVC-02's live half

**Proven on macOS:** engine selection in Rust (`engine=crossover ... cx-healthy`, `engine=pinned ... cx-missing`, `cx-expired`), per-game bottle reuse, the first-need pinned-engine download with progress, the fallback toast and badge, the in-place bottle switch and CrossOver's re-adoption with the save intact, the 7-day trial notice and the expired-trial routing, the signed build over the signed build with no Keychain prompt, and a 51 ms clean exit on every quit.

**Not proven, with defects:** the offline refusal (F1), the Winetricks and wine-manager tools (F2, F3, F4) and the bottle removal route (F5). SVC-02 is not marked complete. The five findings, the non-gate observations and the deferred engine-log gap are in `87-HUMAN-UAT.md` "## Findings and observations"; the fixes belong in `/gsd-plan-phase 87 --gaps`.

## Task Commits

1. **Task 1 (tracer): pre-run re-check** - `c2a3d25f1` (signed build record, gate line pending) and `546d19fe8` (Pre-run re-check in 87-HUMAN-UAT.md). The release branch commit `8a0096bae` (version bump to 0.13.0) lives on `release/v0.13`, not on main.
2. **Task 2: operator run** - no commit (captures under the session scratchpad, never committed).
3. **Task 3: scoring** - `51484af2b` (docs(87-59): score the Phase 87 live macOS gate).

`commits: 3` is `git rev-list --count 65b47bfa1..51484af2b`; no other session landed on main during the run.

## Deviations from Plan

### Plan truths not met as worded

**1. [Rule 3 - Blocking] The signed build did not exist at the start (87-58's gate was blocked)**
- **Found during:** start. **Fix:** the operator chose a signed build; `release/v0.13` was cut in a separate worktree, pushed, built once with `dry_run=false` (run `45314401170`, all legs green), downloaded and verified (codesign, spctl, stapler, designated requirement equal to the installed 0.12.0). The worktree was removed afterwards. **Commits:** `8a0096bae` (release branch), `c2a3d25f1`.

**2. [Contract] Three IMPOSSIBLE log rows amended to observation evidence**
- The shell wires no `EngineLog` (`ctx.log` is `None`): `[engine-notice]`, `Engine: downloading`, the launch-deadline lines, the offline gate's warn and the DXMT skip line never reach `gamelib.log`. Scored on observation per operator decision A.

**3. [Contract] Titles substituted** (see key-decisions): native Mac installs cannot carry the engine items.

**4. [Rule 3 - Blocking] The Task 1 and Task 3 verify parse checks cannot return 4 items**
- Under gsd-core's parser the pass result (`UAT_PASS_RESULTS`) is dropped from `items`, so a scored file with one pass returns 3 items (`headingsSeen 0`); the same defect 86-26 recorded. `grep -c '^### [0-9]'` gives 4, no `result: pending` remains, and `pnpm planning-gates` passes 12/12. The plan file was not edited.

**5. [Contract] Item 2 on Isaac's own bottle, not a clone**
- A clone cannot be tied to a game id, so the operator approved backdating Isaac's bottle (P3 copy, restored and hash-verified).

No code was changed (D-06).

## Authentication gates

None. Item 2 needed a recorded operator approval (given), the pin move and the deletion of the Winetricks-created `Prefixes/shared` each had one.

## Non-gate observations (for the orchestrator's todo list)

Disabled "Remove prefix" toggle low contrast in every theme; game page opened from Downloads has no way back to the Library except the app-level tabs; `[ERROR][Backend] Aborting not possible. Could not find a matching abort controller` on Stop of a Steam bridge title; Isaac relaunch exits about 1 s after the wine command (four times) and Isaac shows no window on Staging after an expired trial, resembling Trash Goblin's launch-1 exit on CrossOver (one possible pattern, unexplained, 0.12.0 not compared); Racine shows not installed in the library but is installed on disk; Bloody Hell's install path is broken; Stop on a non-Steam CrossOver game does not end it (F3); the Wine Manager list is stale after a Rust install or remove (F4). Owed checks not run: 56b-1, 56b-2, 56b-3, 56c-3.

## Known Stubs

None. This plan wrote only planning artifacts (and a version bump on a release branch).

## Issues Encountered

None that blocked scoring. The shared tree's `.planning/STATE.md`, `ROADMAP.md`, `state.json` and spike and todo dirt belong to other sessions and were left alone; this plan's own STATE and ROADMAP hunks are committed separately.

## Closing state

`/Applications/GameLib.app` is the signed 0.13.0 build; the 0.12.0 app is kept in the session directory. The pin directories, Isaac's bottle, the notices store, the licence file and Caravan SandWitch's bottle are restored or verified unchanged; Avernum 6's bottle still has a pinned marker (the next CrossOver launch re-adopts it) and Trash Goblin is installed. `~/Games/GameLib/Prefixes/shared` was deleted with approval. The captures (12G, mode 0700) stay under the session scratchpad; delete them once Phase 87 is verified.

## Next Phase Readiness

All 59 plans of Phase 87 have SUMMARYs. The phase is ready for `/gsd-verify-work 87`; the verifier should expect gaps F1 to F5 and the engine-log decision, and a `/gsd-plan-phase 87 --gaps` cycle with a new signed build for the live re-check.

## Self-Check: PASSED

- FOUND: .planning/phases/87-engine-wine-and-tools/87-HUMAN-UAT.md (4 scored items, Summary 1/2/0/0/1)
- FOUND: .planning/phases/87-engine-wine-and-tools/87-59-SUMMARY.md
- FOUND commits (ancestors of HEAD): c2a3d25f1, 546d19fe8, 51484af2b; `8a0096bae` is on origin/release/v0.13
