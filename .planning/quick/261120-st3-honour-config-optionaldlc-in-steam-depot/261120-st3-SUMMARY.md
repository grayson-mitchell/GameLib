---
phase: quick-261120-st3
plan: 01
subsystem: steam-depot-download
tags: [steam, depot-selection, optionaldlc, pics]
requires: []
provides:
  - "select.ts config.optionaldlc opt-in DLC filter"
  - "DepotSelectOpts.enabledOptInDlc (caller opt-in set)"
affects:
  - src/backend/storeManagers/steam/depot/select.ts
tech-stack:
  added: []
  patterns: ["narrowed source census with RED specimens"]
key-files:
  created:
    - .planning/todos/pending/2026-11-20-opt-in-dlc-depots-have-no-enable-path-and-drop-from-updates.md
  modified:
    - src/backend/storeManagers/steam/depot/select.ts
    - src/backend/storeManagers/steam/__tests__/depot.test.ts
    - .planning/codebase/CONCERNS.md
    - .planning/todos/completed/2026-10-29-depot-selection-installs-config-optionaldlc-opt-in-dlc.md
key-decisions:
  - "Skip a depot only when BOTH its config.optionaldlc and that DLC app's own extended.optionaldlc '1' say opt-in; missing DLC appinfo keeps the depot"
  - "plan.ts unchanged: buildDepotRefs passes no enabled set, so Steam's default (unticked) applies"
  - "D-02 census exempts only the exact word-bounded optionaldlc key"
requirements-completed:
  - TODO-2026-10-29-depot-selection-installs-config-optionaldlc-opt-in-dlc
status: complete
commits: 3
plan_head_before: c3e3855c60fec1d8bcb8b91696c692d75c35c7c6
plan_head_after: 9911ffcfbe1a379de478fb722269f40615f0495d
actuals:
  tokens: 20000
  tasks: 3
  commits: 3
---

# Quick 261120-st3: Honour config.optionaldlc in Steam depot selection Summary

`selectAllDepots` now skips depots whose `config.optionaldlc` names an opt-in DLC (DLC app's `extended.optionaldlc` "1") unless the caller lists that DLC in the new `DepotSelectOpts.enabledOptInDlc`; a Windows-target Dota 2 selection no longer pulls the 5.9 GB Workshop Tools depot 381450 or 401531, while the Vulkan depots 401535/401536 are still selected.

Note on `commits`: the ledger base (`8c673f5cc`) predates an unrelated `a768db700 docs(82-04)` commit that landed on main during the run. `git rev-list --count` therefore reads 4; this plan's own commits are 3.

## Commits

| Task | Commit | Files |
| ---- | ------ | ----- |
| 1 (tracer) | `b73f3851a` fix: skip config.optionaldlc depots of opt-in DLC | select.ts, depot.test.ts |
| 2 | `5687a2970` feat: caller opt-in set, edge-case tests | select.ts, depot.test.ts |
| 3 | `9911ffcfb` docs: close the todo, file the follow-up | completed/2026-10-29 todo, pending/2026-11-20 todo, CONCERNS.md |

## Evidence (package 0)

Mac Steam's local `~/Library/Application Support/Steam/appcache/packageinfo.vdf` shows package 0 (the base "Steam" licence every account holds; licensetype 1, billingtype 0) lists appids 570, 313250 (Workshop Tools), 401530 (OpenGL), 476580 (Vulkan) AND depotids 381450, 401531. `getOwnedSets` (`src/backend/storeManagers/steam/depot/plan.ts:202`) builds the owned set from every licence's packageinfo with no package-0 filter, so depot 381450 (5.9 GB) counts as owned before any opt-in. The defect is real.

## What changed

- `select.ts`: `optionaldlc` fields on `DepotConfig` and `SteamAppInfo.extended`; non-exported `optInDlcNotEnabled(dlcInfos, enabled)`; `selectDepots` trailing `disabledOptInDlc` param (default empty set); one ids-only skip log line `skipped depot <id> (optionaldlc=<dlc>: opt-in DLC not enabled)`; header and JSDoc updated.
- `depot.test.ts`: D-02 census routed through `d02CensusText` (strips only `\boptionaldlc\b`); 3 new D-02 RED specimens plus a control; new describe `config.optionaldlc opt-in DLC (quick 261120-st3)` with 7 tests (default skip, log content, re-include, missing DLC appinfo, numeric flag, default argument, legacy depot-level optional).
- Todo `2026-10-29-...` moved to completed/ with `resolved`/`resolution` and a Resolution section; follow-up `2026-11-20-opt-in-dlc-depots-have-no-enable-path-and-drop-from-updates.md` filed in pending/ (severity medium, platform any, ready code); CONCERNS.md repointed.

## Verification

- depot.test.ts: 80/80 pass. The 7 select-consuming suites: 7 suites, 164 tests pass (HEAD baseline 153, plus 11 new).
- `-t D-02`: 8 passing (HEAD 4); `-t 261120-st3`: 7 (Task 1 alone: 2).
- `pnpm codecheck` exit 0; eslint `--max-warnings 0` on both TS files exit 0; `npx prettier --check` on both passes.
- `git diff --quiet c0fbfa775 -- .../depot/plan.ts` exit 0 (plan.ts untouched).
- `todo-frontmatter-gate.py`: `OK: 10 pending todo(s)`.
- Formatter check omitted for Task 3: every path is under `.planning/` (prettier-ignored).
- `graphify update .` run (exit 0).

## Deviations from Plan

**1. [Process] TDD RED shown only for Tasks 1's tests.** Test A/B were run RED against HEAD before the select.ts change (both failed). Task 2's five edge-case tests were written in the same step as the `enabledOptInDlc` option, so their RED was not run separately; they all pass and the re-include test cannot pass without the option.

**2. [Rule 3 - Blocking] Lint/type fixes in new tests.** Removed an unused `selectDepots` import in Task 1 (re-added in Task 2), an unnecessary `as string` assertion, and used numeric `size: 10` in the 20902-shaped fixture because `DepotManifestEntry.size` is a number. No plan impact.

Otherwise the plan executed as written.

## Known Stubs

None.

## Threat Flags

None. No new endpoints, auth paths or file access; the new log line carries ids only.

## Follow-up

`.planning/todos/pending/2026-11-20-opt-in-dlc-depots-have-no-enable-path-and-drop-from-updates.md`: no caller supplies `enabledOptInDlc`, and an installed opt-in depot drops from updates.

Also recorded: `depotPrimitives.test.ts` (and with it all select.ts unit coverage except the beta-branch tests) was deleted in `859b6d80e` (73-20); the new select tests live in `depot.test.ts`.

## Self-Check: PASSED

Files exist (select.ts, depot.test.ts, both todos, CONCERNS.md); commits b73f3851a, 5687a2970, 9911ffcfb are ancestors of HEAD.
