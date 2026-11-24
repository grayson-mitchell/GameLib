---
phase: 87-engine-wine-and-tools
plan: 65
subsystem: wine-tools
tags: [stop, shutdownWine, crossover, bottle, wineserver, svc-02, gap-closure, rust-invoke]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: "87-59 gate item 5 finding F3 (Stop leaves a CrossOver bottle game running) and 87-60's killBottleWineServerWith shim over engine_bottle_kill_wineserver"
provides:
  - "shutdownWine routes a CrossOver launch overlay (wineVersion.type crossover, a non-empty wineCrossoverBottle, a wineserver) to killBottleWineServerWith with the bottle name, that wineserver, CX_ROOT (the wineserver's bin directory's parent), CX_BOTTLE and the 15 000 ms cap"
  - "A false reply or a rejected call from that kill logs one fixed-text warning (no path, no bottle name) and resolves; Stop never throws for it"
  - "src/backend/utils.ts listed in BOTTLES_SHIM_IMPORTERS so the shim schedule stays green"
affects: [87-69 re-run item 5]

actuals:
  tokens: 2600
  tasks: 2
  commits: 4

plan_head_before: 3942755b89d104577d569c80d4e653529c855113
plan_head_after: 73e2104f36b69be04428d7b62857013448988728
commits: 4

tech-stack:
  added: []
  patterns:
    - "A CrossOver bottle overlay keeps the stored winePrefix and names its bottle only in wineCrossoverBottle, so any process action on it goes through the bottle name (Rust sets WINEPREFIX to the bottle's directory), never the stored prefix"

key-files:
  created: []
  modified:
    - src/backend/utils.ts
    - src/backend/__tests__/utilsRunner.test.ts
    - src/backend/__tests__/engineWineShimSchedule.test.ts

key-decisions:
  - "No new Rust op or shim: Stop reuses the existing guarded, capped engine_bottle_kill_wineserver (a gamelib-proc helper spawn)"
  - "shutdownWine's deps widened with RustInvokeDeps; every store manager already passes this.deps, which carries requestRustInvoke, so no caller changed"
  - "The two pre-existing branches (explicit wineserver with WINEPREFIX; wineboot -k) are untouched"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "Stop of a non-Steam game on CrossOver in its own bottle ends that bottle's wineserver (one engine_bottle_kill_wineserver call with the bottle name, wineserver, CX_ROOT, CX_BOTTLE and the 15 s cap, no spawnAsync call)"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/__tests__/utilsRunner.test.ts#shutdownWine a CrossOver bottle overlay kills that bottle wineserver through Rust, never the stored prefix"
        status: pass
    human_judgment: true
    rationale: "Whether CrossOver's wineserver honours WINEPREFIX plus CX_ROOT and actually ends the running game is only provable live (87-69 re-run item 5)"
  - id: D2
    description: "A false reply or rejected CrossOver kill is a single warning and never throws out of stop(); an empty bottle name or a missing wineserver keeps the current spawn or wineboot path"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/__tests__/utilsRunner.test.ts#shutdownWine (false reply, rejected, fall-through cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The shim schedule names utils.ts as an importer of enginewine/bottles.ts"
    verification:
      - kind: unit
        ref: "src/backend/__tests__/engineWineShimSchedule.test.ts"
        status: pass
    human_judgment: false

duration: 14min
completed: 2026-11-25
---

# Phase 87 Plan 65: Stop on a CrossOver bottle Summary

**Stop of a non-Steam CrossOver game now ends its own bottle's wineserver, by routing shutdownWine's crossover overlay to the existing guarded Rust kill instead of `wineserver -k` against the shared stored prefix.**

## Performance

- **Duration:** ~14 min
- **Completed:** 2026-11-25
- **Tasks:** 2 (a tracer and a TDD task)
- **Files modified:** 3

## Accomplishments

- F3 Stop half: on 87-59's Trash Goblin shape (Epic, CrossOver, own bottle) `shutdownWine` ran `wineserver -k` with `WINEPREFIX` = the shared stored prefix and left the game running. The overlay case now makes one `engine_bottle_kill_wineserver` call (`bottleName`, `wineserverBin`, `extraEnv {CX_ROOT, CX_BOTTLE}`, `timeoutMs 15000`) and spawns nothing in TS.
- Failure arms: a `false` reply or a rejected call logs one fixed-text warning and resolves (T-87-116, T-87-117).
- Every other shape is unchanged: explicit wineserver with the settings' prefix, and `wineboot -k` through `runWineCommand`; a crossover overlay with an empty bottle name or no wineserver falls through to them (tested).
- The schedule row (`src/backend/utils.ts` in `BOTTLES_SHIM_IMPORTERS`) landed in the same commit as the new import, so no commit leaves the schedule gate red.

## Task Commits

1. **Task 1: Tracer, CrossOver overlay Stop through Rust + schedule importer row**
   - `b98d9daac` test (red): the overlay case failed on the real defect (a `wineserver -k` spawn with the shared prefix)
   - `5442561c8` feat (green)
2. **Task 2: Failure arms never throw out of Stop**
   - `799240734` test (red): the false-reply and rejection cases failed (no warning; the rejection propagated)
   - `73e2104f3` feat (green)

**Plan metadata:** the docs commit following this summary.

## TDD Gate Compliance

RED and GREEN commits are present and ordered for both tasks. RED evidence (jest, run on the unmodified code): Task 1's target test failed on `expect(calls).toEqual([])` with a `/cx/bin/wineserver -k` spawn carrying `WINEPREFIX=/home/Games/GameLib/Prefixes/shared`, the planned assertion for the planned reason. Task 2's two target tests failed (a `false` reply logged no warning; a rejected call rejected out of `shutdownWine`); the fall-through cases already passed, as expected, since that path is today's behaviour. The RED evidence was not run through `gsd check tdd-red-evidence`; jest's console output was inspected semantically instead. No REFACTOR commit.

## Files Created/Modified

- `src/backend/utils.ts` - `shutdownWine` takes `RustInvokeDeps` and routes the crossover bottle overlay to `killBottleWineServerWith`
- `src/backend/__tests__/utilsRunner.test.ts` - overlay, false-reply, rejection and fall-through cases; the two existing cases now pass `requestRustInvoke` and the first asserts it is not called
- `src/backend/__tests__/engineWineShimSchedule.test.ts` - `utils.ts` in `BOTTLES_SHIM_IMPORTERS`

## Decisions Made

None beyond the plan; no new Rust op, no new shim.

## Deviations from Plan

None - plan executed exactly as written. (The two pre-existing shutdownWine tests gained a `requestRustInvoke` field because the widened deps type requires it; that is the plan's own deps widening, not extra scope.)

## Issues Encountered

None. Verification: utilsRunner, engineWineShimSchedule and engineWinePortComplete (386 tests), the legendary/gog/nile/sideload suites (290 passed), `pnpm codecheck` clean, prettier check clean on the three files (none are prettier-ignored). Acceptance greps: `killBottleWineServerWith` appears twice outside comments in utils.ts; one `utils.ts` row inside the importer array.

## Known Stubs

None.

## Threat Flags

None. The only new surface is the existing, already-guarded `engine_bottle_kill_wineserver` op, reached from `shutdownWine` with a bottle name from Rust's own launch overlay (T-87-115).

## Next Phase Readiness

Ready for 87-69 re-run item 5. The live proof is open: that CrossOver's wineserver honours `WINEPREFIX` (set by Rust to the bottle directory) with `CX_ROOT`/`CX_BOTTLE` and ends the game on Stop.

## Self-Check: PASSED

- Modified files exist; commits `b98d9daac`, `5442561c8`, `799240734`, `73e2104f3` are ancestors of HEAD.
