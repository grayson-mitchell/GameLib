---
phase: 100-game-page-without-the-menu
plan: 14
subsystem: ui
tags: [react, danger-zone, useRowAction, uninstall, i18n, uat]

requires:
  - phase: 100-game-page-without-the-menu
    provides: "100-11 timeout list, 100-12 RowFailure retryDisabled and test harness, 100-13 stillRunning hand-off and gate-aware Retry"
provides:
  - "Remove all copies and Uninstall run through useRowAction: busy label, inline failure, gate-aware Retry that re-confirms"
  - "UninstallModal optional runUninstall prop; its default path catches and logs the rejection"
  - "100-HUMAN-UAT.md items 19 and 20 (pending); 100-REVIEW-DISPOSITION.md five findings fixed"
affects: [100-verify-work, library-card-uninstall]

actuals:
  tokens: 8800
  tasks: 3
  commits: 5
plan_head_before: 9785c9ea9f1e509dea7dc042253066c6f8ad582a
plan_head_after: 11ae6dd82bf5b764e8d981daf8d430b00ddd6691

tech-stack:
  added: []
  patterns:
    - "A caller-supplied runner prop (runUninstall) lets a shared modal report through the caller's row while keeping a safe default"
    - "Test rejections are pre-handled (rejection.catch) so the defect under test fails assertions instead of crashing the jest worker"

key-files:
  created: []
  modified:
    - src/frontend/screens/Game/GamePage/actions/useUninstallActions.ts
    - src/frontend/screens/Game/GamePage/components/InstallTab/DangerZone.tsx
    - src/frontend/components/UI/UninstallModal/index.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/index.css
    - src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabRows.test.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts
    - public/locales/en/gamelib.json
    - meta/i18nCatalogPresenceBaseline.json
    - .planning/phases/100-game-page-without-the-menu/100-HUMAN-UAT.md
    - .planning/phases/100-game-page-without-the-menu/100-REVIEW-DISPOSITION.md

key-decisions:
  - "A partial sweep (refused > 0) or an error answer from steamRemoveAllCopies is a failure, because a copy is still on disk (D-18)"
  - "Retry for Remove all copies is startRemoveAllCopies and Retry for Uninstall is startUninstall, so both go back through their confirmation (D-13)"
  - "The Uninstall button is busy when its own row is busy or the gate reason is 'uninstalling', and then drops its tooltip"
  - "A rejection on the confirm-modal route reports through the danger zone's uninstall row via runUninstall; the library card keeps the modal's own catch-and-log default"

patterns-established:
  - "Every danger-zone invoke goes through useRowAction; no destructive invoke is un-awaited"

requirements-completed: [D-10, D-11, D-12, D-13, D-14, D-18]

duration: 25min
completed: 2026-11-22
status: complete
---

# Phase 100 Plan 14: Danger zone failure paths, UAT additions and final gate run Summary

**Remove all copies and Uninstall now run through useRowAction, so a rejection, error answer or refused root shows red text under the danger zone with a Retry that re-confirms, and UninstallModal no longer drops its rejection.**

## Performance

- **Duration:** about 25 min of wall time for the three tasks, plus the full gate battery
- **Tasks:** 3 (one tracer, one auto, one auto with the gate run)
- **Files modified:** 10 (plus the i18n presence baseline regenerated twice)
- **Commits:** 5 (two RED, two GREEN, one planning)

## Accomplishments

- WR-05 closed. `onRemoveAllCopiesYesClick` no longer has an unhandled path: the sweep runs in `allCopiesRow.run(...)` with `isFailure = Boolean(result.error) || result.refused > 0`. The button reads "Removing copies…" with `aria-busy` and ignores clicks while it runs. The failure shows "Couldn't remove every copy. Details are in the log." and its Retry re-opens "Remove all copies?".
- The delegated Steam `window.api.uninstall(appName, runner, false, false)` is now awaited inside `uninstallRow.run`, and the confirm-modal route reports through the same row via the new `runUninstall` prop on UninstallModal. Both routes show "Uninstall failed. Details are in the log." with a Retry that calls `startUninstall` (asks the route again, so the confirmation decision is asked again).
- UninstallModal's default path (the library card, DLC list) now catches and logs `uninstall failed for <appName>: ...` instead of producing an unhandled rejection.
- The Uninstall button reads "Uninstalling…" while its own invoke runs or the game status reads uninstalling; Retry links stay inert behind their gate (`retryDisabled` plus the gate's reason).
- 100-HUMAN-UAT.md now carries 20 pending items (19: Steam game with no version still shows Verify; 20: a Move over 60 seconds). 100-REVIEW-DISPOSITION.md records CR-01, CR-02, WR-02, WR-04 and WR-05 as fixed with their summaries.

## Task Commits

1. **Task 1 (tracer): failed Remove all copies shows in the danger zone**
   - RED `0240e999c` (test): 6 failing cases (refused root, error answer, rejection, retry re-confirms, inert retry, busy label)
   - GREEN `5393a8958` (feat): hook, DangerZone, `.dangerButton.is-busy`, two i18n keys and baseline entries
2. **Task 2: Uninstall failures on both routes, UninstallModal stops dropping its rejection**
   - RED `9aa508fb4` (test): 5 behavioural cases in installTabRows plus the UninstallModal shape assertion in installTabSource
   - GREEN `eb7eef233` (feat): `uninstallRow`, `runModalUninstall`, `runUninstall` prop and catch-and-log default, busy label, two i18n keys
3. **Task 3: UAT items 19-20, review dispositions, gate run** - `11ae6dd82` (docs)

**Plan metadata:** the SUMMARY commit that follows this file. STATE.md, state.json and ROADMAP.md were deliberately not touched (see Deviations).

## RED evidence and TDD gate

- RED 1 (`0240e999c`): installTabRows.test.tsx, "Danger zone (WR-05)" block. Observed: 6 of the 7 new cases failed on their assertions (no RowFailure found after a refused/error/rejected sweep, the awaited Yes-click rejected, `showDialogModal` retry case had no failure to retry, the busy label never appeared). The seventh case (clean sweep, no failure) passed by construction. Semantic assessment: each failing case reached its planned assertion for the intended reason (the danger zone had no failure path); no import, syntax or fixture failure.
- RED 2 (`9aa508fb4`): 6 of 6 new cases failed (5 behavioural, 1 source shape). First draft crashed the jest worker because the un-awaited rejection was itself unhandled; the mock rejection was pre-handled (`rejection.catch(() => undefined)`) so the RED fails on assertions rather than on a worker crash.
- `gsd_run check tdd-red-evidence` was not run: the plan is `type: execute` with `tdd="true"` tasks, not a `type: tdd` plan, and the evidence is the committed jest output above.
- Gate order holds: `test(100-14)` precedes `feat(100-14)` for both tasks. No refactor commit was needed.

## Files Created/Modified

- `useUninstallActions.ts` - `allCopiesRow` and `uninstallRow` through `useRowAction`; returns failed/busy/retry values and `runModalUninstall`
- `DangerZone.tsx` - busy labels, `is-busy`/`aria-busy`/`aria-disabled`, two `RowFailure` lines with gate-aware Retry, `runUninstall={runModalUninstall}` (still exactly one UninstallModal)
- `UninstallModal/index.tsx` - optional `runUninstall` prop; default path try/catch with `window.api.logError`
- `InstallTab/index.css` - `.dangerButton.is-busy` (pulse, `animation: none` under reduced motion) and `.dangerZone > .rowFailure`
- `installTabRows.test.tsx` - "Danger zone (WR-05)" block (7 sweep cases, 5 uninstall cases); no new `jest.mock` call, so the DI shard stays at the existing ceiling
- `installTabSource.test.ts` - UninstallModal shape assertion
- `public/locales/en/gamelib.json`, `meta/i18nCatalogPresenceBaseline.json` - four keys (`busy.removingAllCopies`, `failure.removeAllCopies`, `busy.uninstalling`, `failure.uninstall`) and their baseline pairs; the baseline recorded only this plan's keys

## Decisions Made

See `key-decisions` above. One placement note: the two `RowFailure` lines sit after both buttons and before the modal, in the order Uninstall then Remove all copies.

## Deviations from Plan

None - plan executed exactly as written. Mechanical adjustments that are not deviations:

- The plan's `<verify>` loop `for f in $F` does not word-split in zsh; commands were run with arrays or under bash.
- installTabRows.test.tsx keeps its three `jest.mock` calls (the WhatsNewLink stub from 100-12 made it three), none added.
- The plan said Task 3's commit uses `git commit -- <paths>`; all commits used explicit paths. No foreign hunks existed in the catalog files, so no hunk staging was needed.

**Orchestrator-driven skips (not deviations from the plan):** per the dispatch's `<sequential_execution>` block, the `state.*`, `roadmap.*` and `requirements.mark-complete` steps were skipped, and STATE.md, state.json and ROADMAP.md were not touched. Phase 100 is out-of-band and the orchestrator owns tracking. The `requirements` frontmatter is copied to `requirements-completed` above for it to use.

## Final gate run (on the tree at `11ae6dd82`)

| Gate | Result |
|------|--------|
| `pnpm test:ci` | 1 failed suite of 1130: `src/backend/__tests__/cargoFeatures.test.ts`. 23909 tests passed. **Pre-existing, not this plan.** See below. |
| `pnpm codecheck` | PASS |
| `pnpm lint` | PASS (production PASS, tests PASS) |
| `pnpm find-deadcode` | One finding: `meta/genStoreSchemas.ts` (types, Member). **Pre-existing, from the other session's 85-08; not on this phase's paths.** Nothing from this plan. |
| `pnpm gameinfo-narrowing-ceiling` | PASS (901 files, 43 allowlisted) |
| `pnpm backend-di-ceilings --shard frontend-screens-game` | PASS; the full run has 0 `FAIL:` lines naming `src/frontend/` |
| `pnpm i18n && pnpm i18n-churn-guard` | clean; i18n reports no restored keys and left the tree unmodified, churn guard clean |
| Meta i18n suites (lintTranslations, genI18nGateScope, hardcodedStringGate) | PASS (236 passed, 1 skipped) |
| Frontend suites `screens/Game` and `components/UI` | PASS (127 suites, 2059 tests) |
| `pnpm planning-gates` | 12/12 passed |
| `cd src-tauri && cargo test --bin gamelib-shell exempt` | 8 passed |

**cargoFeatures failure (owner: another session, not touched).** The Cargo.lock crate-name pin in `cargoFeatures.test.ts` reports `jiff, jiff-core, jiff-static, jiff-tzdb, jiff-tzdb-platform, portable-atomic, portable-atomic-util` as appeared. They entered the lockfile in `8fcadab94 fix(deps): replace chrono with jiff in gamelib-log (RUSTSEC-2026-0543)`, which did not update the pin. This plan touches no Cargo file (`git status` was clean after the cargo run, and the plan's diff lists none). Per the 100-10 precedent it is recorded here and left for whoever owns that dependency change: the pin needs `EXPECTED_LOCKFILE_CRATE_NAMES` updated after the supply-chain review its message asks for.

## Issues Encountered

- The first RED run for Task 2 crashed the jest worker (the defect under test is an un-awaited rejection, which is unhandled). Fixed by pre-handling the mock rejection, as noted above.
- `tsc` caught `noUncheckedIndexedAccess` errors in the new test helpers; fixed with a `firstFailure` helper and typed `mock.calls`.

## Open review findings (scope note)

WR-01, WR-03 and IN-01 to IN-06 stay `open`, as planned. WR-03 is partly served by installTabRows.test.tsx, but its stale guard header and CloudSavesSync's behavioural test remain; that is recorded here, not in the disposition file.

## Known Stubs

None.

## Threat Flags

None. The only new trust-boundary surface is the existing renderer to sidecar `uninstall` and `steamRemoveAllCopies` invokes, which the plan's threat model (T-100-36 to T-100-40) already covers: rejections are logged through `reportRowActionFailure` or the modal's catch, Retry re-confirms, danger buttons ignore clicks while busy, failure text is fixed and translated, and UAT items are `result: pending`.

## Next Phase Readiness

All five gap-round plans (100-11 to 100-14, with 100-10's UAT) are done. The branch is ready for `/gsd-verify-work 100`; the operator runs items 1-20 live. The one red test gate on the final tree (`cargoFeatures`) and the one knip finding (`genStoreSchemas`) both belong to other sessions' commits.

## Self-Check: PASSED

- All ten files in `key-files.modified` exist on disk and are tracked.
- Commits `0240e999c`, `5393a8958`, `9aa508fb4`, `eb7eef233`, `11ae6dd82` are ancestors of HEAD on `phase/100-gap-closure`.
- `git rev-list --count 9785c9ea9..HEAD` measured 5 before this SUMMARY was committed.
- uat.cjs parses exactly 20 items with `headingsSeen: 0`; the disposition set is exactly CR-01, CR-02, WR-02, WR-04, WR-05 in both the YAML and the table.

---
*Phase: 100-game-page-without-the-menu*
*Completed: 2026-11-22*
