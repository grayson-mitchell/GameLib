---
phase: 100-game-page-without-the-menu
plan: 12
subsystem: ui
tags: [react, install-tab, gap-closure, cr-01, wr-03, tdd, i18n]
status: complete

requires:
  - phase: 100-game-page-without-the-menu
    provides: "VersionRow, FactRow/FactAction, RowFailure, useRowAction and installActionGates from plans 100-01..100-10"
provides:
  - "VersionRow renders for every installed store-catalogue game, with or without a version; a missing version reads Unknown and never 'up to date', so Verify, Update and What's new stay reachable for bridge installs and ACF buildid 0 (CR-01, D-14)"
  - "RowFailure takes retryDisabled / retryDisabledReason; a failed Verify's Retry is inert (aria-disabled, reason tooltip, early return) while gates.verify is disabled (D-11, D-12)"
  - "installTabRows.test.tsx: the first behavioural hook-harness render test of an Install-tab row (slot-backed useState/useReducer, held useContext, __beginRender/__resetMount/__setContext), for 100-13 and 100-14 to extend"
affects: [100-13, 100-14, verify-work]

plan_head_before: e0b8d2f162e0dade4d9fe2a3c0658b8fa1dd7ded
plan_head_after: 10b7ef05ddfc3fe51fb042226d4f352bd8284286

actuals:
  tokens: 5200
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Render-testing a hook-using row under jest.mock('react') with withStoreHooks plus slot-backed useState/useReducer and a held useContext"
    - "Row-failure Retry follows the repeated action's own gate through aria-disabled plus an early return, never the disabled attribute"

key-files:
  created:
    - src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabRows.test.tsx
  modified:
    - src/frontend/screens/Game/GamePage/components/InstallTab/VersionRow.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/SwitchRow.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/index.css
    - src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/SwitchRow.test.tsx
    - meta/backendDiCeilings/frontend-screens-game.json
    - public/locales/en/gamelib.json
    - meta/i18nCatalogPresenceBaseline.json

key-decisions:
  - "No version reads 'Unknown' (new key gamepage.installTab.versionUnknown); the 'up to date' string is only ever shown beside a version, because GameLib cannot vouch for a build it cannot name"
  - "The available-update text still shows without a version, but only when hasUpdate"
  - "Retry is inert through aria-disabled + title + early return, the FactAction rule (research Pitfall 9), so the reason tooltip shows and the control stays in the gamepad focus ring"

requirements-completed: [D-01, D-11, D-12, D-13, D-14, D-19]

coverage:
  - id: D1
    description: "An installed Steam game with no install.version shows a Version row reading Unknown with Verify beside it; Verify starts repair with no confirmation"
    verification:
      - kind: test
        ref: "InstallTab/__tests__/installTabRows.test.tsx#VersionRow (renders Verify and an Unknown value for an installed Steam game with no version; starts repair with the game app name and runner when Verify is clicked)"
        status: pass
    human_judgment: false
  - id: D2
    description: "An installed Epic/GOG/Amazon game with no version shows Verify and Update; a game with a version still reads '<version> · up to date'; a no-version game with a pending update reads Unknown plus '· <new> available' and never 'up to date'"
    verification:
      - kind: test
        ref: "installTabRows.test.tsx#VersionRow (Legendary no version, up to date, Unknown plus available)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Sideloaded, third-party-managed, browser and not-installed games still render no Version row"
    verification:
      - kind: test
        ref: "installTabRows.test.tsx#VersionRow it.each guards (4 cases)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A failed Verify shows the fixed inline message with a live Retry, and the Retry is inert with 'Wait for the move to finish' during a move"
    verification:
      - kind: test
        ref: "installTabRows.test.tsx#a failed Verify (2 cases); SwitchRow.test.tsx RowFailure inert/live retry (2 cases)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The inert Retry looks disabled (greyed, not-allowed cursor) in the real window"
    verification: []
    human_judgment: true
    rationale: "Visual treatment of .rowFailure__retry[aria-disabled] is not asserted by any test; no jsdom or screenshot harness covers it"

metrics:
  duration: "~35 min"
  completed: 2026-11-21
---

# Phase 100 Plan 12: Version row for every installed game, gate-aware Retry Summary

**VersionRow no longer disappears for games with no version (bridge Steam installs, ACF buildid 0): it reads "Unknown" with Verify (and Update on Epic/GOG/Amazon) beside it, and a failed Verify's Retry is inert while the Verify gate is disabled, proven by the first real render test of an Install-tab row.**

## Accomplishments

- CR-01 (verification gap 1): the `!version` clause is gone from VersionRow's guard, so D-14's "every action stays reachable" holds for Verify and Repair. A missing version renders `gamepage.installTab.versionUnknown` ("Unknown"); "· up to date" appears only beside a real version; the available text appears beside Unknown only when an update is pending.
- D-11 for row failures: `RowFailure` gains `retryDisabled` / `retryDisabledReason`. VersionRow passes `gates.verify.disabled` and the gate's reason text, so Retry cannot start a verify during a move or while a Steam game plays. Plan 100-13 reuses this for the Move row.
- WR-03: `installTabRows.test.tsx` calls the real VersionRow as a plain function under a `jest.mock('react')` harness with real `installActionGates` gates, not a `readFileSync` grep. It would have caught CR-01.

## TDD Gate Compliance

| Task | RED | GREEN |
| ---- | --- | ----- |
| 1 | ff7936491 `test(100-12)` | b50fc3aa0 `feat(100-12)` |
| 2 | 94a8a3f9f `test(100-12)` | 10b7ef05d `feat(100-12)` |

No REFACTOR commits (nothing to clean up).

RED evidence (jest is not in the `tdd-red-evidence` classifier's report formats, so the target failures were read from the unmodified jest report and judged semantically):

- Task 1 (`pnpm exec jest --runTestsByPath .../installTabRows.test.tsx`, exit 1, 4 failed / 5 passed): the target "renders Verify and an Unknown value for an installed Steam game with no version" failed on `expect(tree).not.toBeNull()` with `Received: null`, which is the version gate returning null. The Legendary-no-version, Unknown-plus-available and click-Verify cases failed the same way (`Cannot read properties of null (reading 'props')`). The four guard cases and the "up to date" case passed, as expected, because that behaviour is unchanged. semanticAssessment: the targets executed and failed on the planned assertion for the intended reason (null instead of a FactRow); no import, fixture or syntax fault.
- Task 2 (exit 1, 3 failed): "inert retry carries aria-disabled" `Expected: true, Received: undefined`; the two failed-Verify cases `Expected: false / true, Received: undefined` on `retryDisabled`. semanticAssessment: assertions on the new props, failing because the props did not exist yet. The live-retry-without-aria-disabled case was green at RED, which is correct since it pins unchanged behaviour.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Third jest.mock, shard ceiling 3 instead of 2**
- **Found during:** Task 1, first RED run
- **Issue:** Importing VersionRow loads WhatsNewLink, then GameChangeLog, then `sanitize-html`, whose `htmlparser2` dependency is an ES module jest cannot parse ("Cannot use import statement outside a module"), so the suite failed to run at all.
- **Fix:** One extra `jest.mock('../WhatsNewLink', ...)` stub (the row only places the link, and the existing source test still pins `<WhatsNewLink />`). The file now has three `jest.mock(` calls, so the DI shard entry is `installTabRows.test.tsx: 3`, not the plan's 2. The plan's acceptance criterion "prints 2" therefore reads 3; every other criterion holds. Plans 100-13 and 100-14 should expect a ceiling of 3, and still add no new `jest.mock(`.
- **Files modified:** installTabRows.test.tsx, meta/backendDiCeilings/frontend-screens-game.json
- **Commit:** ff7936491

**Total deviations:** 1 auto-fixed (1 blocking). **Impact:** none on behaviour; only the mock count and the shard value differ from the plan text.

## Issues Encountered

- `pnpm find-deadcode` fails with `new knip finding: types | meta/genStoreSchemas.ts | Member`. That file is not touched by this plan (last changed in a5ee4883c, plan 85-08, the other session's phase). Out of scope per the scope boundary; no new finding comes from this plan's files. Logged here as a deferred item for whoever owns 85-08.
- `tauriAttach` and `tauriWindowChrome` print console.log/console.warn noise at import (VersionRow imports `frontend/helpers`). It is harmless and does not affect the results; adding a mock for `frontend/helpers` would have cost another `jest.mock`.
- Shell note: zsh does not word-split `$F`; the plan's `<verify>` loop needs an array or `bash` when run from zsh. The checks were re-run with an array and passed.

## Verification Results

- `jest --runTestsByPath` installTabRows, SwitchRow, FactRow, installTabSource: 59 passed.
- `jest --selectProjects Frontend --testPathPattern screens/Game/GamePage`: 799 passed.
- `jest --selectProjects Meta --testPathPattern 'lintTranslations|genI18nGateScope|hardcodedStringGate'`: 236 passed, 1 skipped.
- `pnpm codecheck`: 0 errors. `pnpm lint`: exit 0 (0 errors, warnings only). `pnpm backend-di-ceilings --shard frontend-screens-game`: PASS; full-run `FAIL:.*src/frontend/` count 0.
- `npx prettier --check` over the written paths: clean (`gamelib.json` is prettier-ignored and left out on purpose).
- `pnpm find-deadcode`: red, on the pre-existing `meta/genStoreSchemas.ts` finding above, not on this plan's files.

## Known Stubs

None. (`jest.mock('../WhatsNewLink')` is a test stub, not shipped code.)

## Threat Flags

None. T-100-31 (fixed message only; the raw rejection reaches the log, not the row) is unchanged and pinned by the "fixed inline message and logs once" test. T-100-32 (Retry cannot start a repair the Verify button would refuse) is mitigated by `retryDisabled: gates.verify.disabled` and covered by the move case.

## Orchestration Notes

Per the sequential-execution brief, STATE.md, state.json and ROADMAP.md were not touched and no `state.*` / `roadmap.*` verbs were run; the orchestrator owns tracking writes for this out-of-band phase. i18n: the catalog gained one English key; the presence baseline gained its per-locale entries (48 pairs, all `versionUnknown`); no foreign hunks were present.

## Self-Check: PASSED

- installTabRows.test.tsx, VersionRow.tsx, SwitchRow.tsx, index.css present on disk.
- Commits ff7936491, b50fc3aa0, 94a8a3f9f, 10b7ef05d are ancestors of HEAD.
