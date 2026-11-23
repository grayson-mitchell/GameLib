---
phase: 87-engine-wine-and-tools
plan: 01
subsystem: testing
tags: [live-gate, uat, macos, crossover, wine-staging, state-ownership, store-mirror-schedule]

requires:
  - phase: 86-pure-leaf-services
    provides: the signed Phase 86 build identity, the 86-HUMAN-UAT.md contract shape, the 86 D-24 schedule precedent
provides:
  - 87-HUMAN-UAT.md, the Phase 87 live macOS gate contract (four D-11 items, D-12 signed upgrade, seven-test review)
  - the 82 state-ownership amendment for Phase 87 (D-05) with the storeMirrorSchedule SCHEDULE moved in the same commit
  - ROADMAP Phase 87 success criterion 4 reworded for scheduled resolvers (D-23)
affects: [87-59, 87-02, 87-03, 88-launch, 96-bridge-launch, 98-shell-cutover]

actuals:
  tokens: 14200
  tasks: 3
  commits: 3

plan_head_before: ca6cc1d43a0f4a34a3c4914954d2181b41f685c3
plan_head_after: 1f7ded83f799d2bcfaeaf2ded16b25258289cc9f

tech-stack:
  added: []
  patterns:
    - "live gate authored before code and run by a different plan (D-E), every row CONDITIONAL until 87-59 Task 1 re-greps the Rust emitters"

key-files:
  created:
    - .planning/phases/87-engine-wine-and-tools/87-HUMAN-UAT.md
  modified:
    - .planning/phases/87-engine-wine-and-tools/87-VALIDATION.md
    - .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md
    - src/backend/__tests__/storeMirrorSchedule.test.ts
    - .planning/ROADMAP.md

key-decisions:
  - "Item 4's DXMT half is driven through a wine-manager Wine-Staging-macOS install and uninstall (the -DXMT copy appears and disappears), because no per-bottle DXMT control exists"
  - "The offline-refusal sub-check runs first under no-crossover.sb while the pinned engine is still absent, and the 180 s hold runs last, each on its own launch"
  - "Item 4 runs on the throwaway bottle before item 2 backdates it, so item 2 is last in the run order"

patterns-established:
  - "Gate contract rows that depend on external state name a positive observable (directory listing, toggle rendering, log line), never an absent app file"

requirements-completed: [SVC-02]

duration: 5min
completed: 2026-11-23
status: complete
---

# Phase 87 Plan 01: Live gate contract and ownership amendment Summary

**The SVC-02 live macOS gate (87-HUMAN-UAT.md, four items on a signed 87 build over the signed 86 build) is authored with a seven-test Structural Reachability Review before any port code, and the 82 state-ownership table, its mirror-schedule test and ROADMAP SC4 now say what Phase 87 actually moves.**

## Performance

- **Duration:** about 5 min of wall clock (the executor clock read 00:37Z at start, 00:42Z at the last commit)
- **Tasks:** 3
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments

- `87-HUMAN-UAT.md` parses as exactly four items (`parseUatItemsWithStats`: 4 items, `headingsSeen` 0) and carries builds-under-test with the D-12 rule, deliberate behaviour changes, preflight P1-P7 (ditto copies, licence existence-only, sandbox profiles), run order, evidence capture, required literals (every row CONDITIONAL, re-check 87-59 Task 1), the Structural Reachability Review (Tests 1-7; Test 5: 63 pairs considered, 10 flagged), the D-09 coverage table (all 11 research rows mapped) and the withdrawn-from-scoring list.
- The seven-test review changed the contract itself: DXMT has no per-bottle control, the DXVK toggle renders only for a plain `wine` version, the offline-refusal arm needs the pin absent, and the backdate destroys the throwaway bottle, so item 2 runs last. These are applied to the items and run order, not left as notes.
- `82-STATE-OWNERSHIP.md` has the `### 2026-11-23 (Phase 87 planning, D-05, D-22..D-24)` amendment: `pci_ids_device` and `pci_ids_vendor` TS-mirror-deleted 87 to 88, `info-caches:systemInfo` flip 87 to 88, `steam-engines-dir` file corrected to `<appFolder>/tools/steam-engines/`, `tools-state` and `winetricks-queue` Rust owner to `gamelib-wine`, the ledger dropped from `engine-runtime`'s persisted notes, the `engineSelectionView` write-through note until 96, and `wineDownloaderInfoStore` and `steam_engine_notices` recorded as staying at 87. No row gains a second `*`.
- `storeMirrorSchedule.test.ts` SCHEDULE moved in the same commit (12 tests pass) and ROADMAP SC4 reads "except scheduled resolvers listed in the schedule test (D-23)".

## Task Commits

1. **Task 1: Tracer, the contract end to end** - `553fb4bf4` (docs)
2. **Task 2: Structural Reachability Review, required literals, D-09 coverage, evidence capture** - `624fa5ba7` (docs)
3. **Task 3: 82 ownership amendment, mirror schedule, ROADMAP SC4** - `1f7ded83f` (docs)

**Plan metadata:** committed separately (docs: complete plan).

## Files Created/Modified

- `.planning/phases/87-engine-wine-and-tools/87-HUMAN-UAT.md` - the Phase 87 live macOS gate contract, run by 87-59
- `.planning/phases/87-engine-wine-and-tools/87-VALIDATION.md` - references repointed to `87-HUMAN-UAT.md` and `enginewine/__tests__/twinVectors.test.ts`
- `.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md` - cell edits plus the Phase 87 amendment
- `src/backend/__tests__/storeMirrorSchedule.test.ts` - `pci_ids_device: 88`, `pci_ids_vendor: 88`, header note
- `.planning/ROADMAP.md` - Phase 87 SC4 wording

## Decisions Made

- DXMT is scored through the wine manager's Wine-Staging-macOS install and uninstall (the `-DXMT` copy appears and disappears), because `src/backend/tools/dxmt.ts` creates the copy from the `wineVersionInstalled` listener and the UI has no per-bottle DXMT control. If the shipped `winemac.so` fails DXMT's export check (`Not creating DXMT copy of`), that half scores `blocked`, not failed.
- The flagged assumption (spec-less edge probe): the SVC-02 edge-coverage row is unclassified and unresolved. It is covered by the explicit concurrency, idempotency, offline and newer-marker edge truths in 87-38, 87-41, 87-46 and 87-47 and by this gate, and is not claimed as a verified edge.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Item 4 asked for DXMT install and remove on a bottle, which no UI gesture performs**
- **Found during:** Task 2 (Structural Reachability Review, Test 7)
- **Issue:** the only DXMT surfaces are the `wineVersionInstalled` and `wineVersionUninstalled` listeners (`dxmt.ts`) and the `-DXMT` wine-version suffix; no component installs DXMT on a bottle. As planned the DXMT half could never pass.
- **Fix:** item 4's `expected:` and the run order now drive DXMT through a wine-manager Wine-Staging-macOS install and uninstall, with a positive observable (the `<installDir>-DXMT` directory) and a `blocked` disposition for the export-check skip. The DXVK half is scoped to a game whose wine version is type `wine`, because `AutoDXVK.tsx` renders nothing otherwise.
- **Files modified:** `.planning/phases/87-engine-wine-and-tools/87-HUMAN-UAT.md`
- **Committed in:** `624fa5ba7`

**2. [Rule 1 - Bug] The ordering of item 1's sub-checks would have made the offline refusal unreachable**
- **Found during:** Task 2 (Test 6)
- **Issue:** `offlineLaunchCertainlyBlocked` refuses only when the pinned engine is absent (crossover-missing arm) or a restore needs an absent pin. Downloading the pin before the offline check removes the premise.
- **Fix:** the offline-refusal sub-check runs first under `no-crossover.sb` with the pin absent, with a positive preflight observable (the `tools/steam-engines/` listing) and a `blocked` disposition if the pin already exists.
- **Files modified:** `.planning/phases/87-engine-wine-and-tools/87-HUMAN-UAT.md`
- **Committed in:** `624fa5ba7`

**3. [Rule 3 - Blocking] The amendment's own rows matched the task's verify greps twice**
- **Found during:** Task 3
- **Issue:** the amendment table rows for `pci_ids_device` and `steam-engines-dir` also satisfied the verify greps that expect exactly one match in the persisted-stores table.
- **Fix:** reworded the amendment rows (unbackticked row label for the engines folder, "The GPU info moves to 88") so each grep matches the persisted-stores row only.
- **Files modified:** `.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md`
- **Committed in:** `1f7ded83f`

---

**Total deviations:** 3 auto-fixed (2 bug, 1 blocking)
**Impact on plan:** all three make the contract and the table truthful; no scope creep.

## Issues Encountered

None beyond the deviations above. Task 3's `pnpm planning-gates` and `storeMirrorSchedule.test.ts` pass; prettier over the one TS file passes (the three planning docs are prettier-ignored).

## Known Stubs

None. The contract's required-literals rows are deliberately CONDITIONAL until 87-59 Task 1 re-greps the Rust emitters; that is the contract's design, not a stub.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 87-02 and 87-03 can start (Wave 1). 87-59 runs the gate on the signed Phase 87 build recorded by 87-58 in `87-VALIDATION.md` "## Signed builds (D-12)" (that section does not exist yet).
- The operator names the gate titles and the throwaway bottle in P5 at run time.

## Self-Check: PASSED

- FOUND: `.planning/phases/87-engine-wine-and-tools/87-HUMAN-UAT.md`
- FOUND: `.planning/phases/87-engine-wine-and-tools/87-01-SUMMARY.md`
- FOUND commits: `553fb4bf4`, `624fa5ba7`, `1f7ded83f` (ancestors of HEAD)
- Re-ran task acceptance criteria and the plan verification: UAT parse 4 items / headingsSeen 0; `87-UAT.md` references in 87-VALIDATION.md 0; `pci_ids_device: 88` 1, `pci_ids_device: 87` 0; SC4 wording 1; jest 12 passed; planning-gates 12/12.

---
*Phase: 87-engine-wine-and-tools*
*Completed: 2026-11-23*
