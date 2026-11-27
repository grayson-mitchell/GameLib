---
phase: quick-261127-vy3
plan: 01
subsystem: known-fixes
tags: [protonfixes, importer, meta, known-fixes, dev-tool]
requires:
  - "quick 261029-gow (dllOverrides key)"
  - "quick 261029-mbl (launchArgs / exeOverride keys)"
provides:
  - "pnpm import-protonfixes: offline umu-protonfixes to GameLib candidate local fixes"
affects:
  - "2026-10-29-protonfixes-import-dev-tool todo (ready: blocked, Dashboard integration remains)"
tech-stack:
  added: []
  patterns:
    - "meta entry script via meta/runTs.cjs, main() guarded by JEST_WORKER_ID"
    - "hand-written linear Python tokenizer; static parse only"
key-files:
  created:
    - meta/importProtonfixes.ts
    - meta/__tests__/importProtonfixes.test.ts
  modified:
    - package.json
    - knip.jsonc
    - .planning/todos/pending/2026-10-29-protonfixes-import-dev-tool.md
decisions:
  - "dllOverrides only with a statically known exe (basename of a mapped replace_command target); never invented"
  - "WINEDLLOVERRIDES and a regedit_add on HKCU Software Wine DllOverrides feed dllOverrides, not envVariables/registry"
  - "PROTON_* env vars unmapped (proton-launcher-env)"
  - "elif/else/except/finally lines are folded into the compound statement above, so a try/except counts as one unmapped statement"
  - "A literal of the wrong type for a helper argument (for example append_argument(5)) is non-literal-argument"
status: complete
completed: 2026-11-27
duration: "about 1.5 h (start time not captured)"
commits: 3
plan_head_before: bf4356048af4887cc0630ef98205b96f65758fe7
plan_head_after: c4317397a762e2cbe54558ac5d4673b3d0c2e618
actuals:
  tokens: 22300
  tasks: 3
  commits: 3
---

# Phase quick-261127-vy3 Plan 01: Offline umu-protonfixes importer Summary

Offline `pnpm import-protonfixes` translates the declarative subset of umu-protonfixes `gamefixes-steam/*.py` into attributed GameLib tier-1 and tier-2 candidate files, and a real run over a fresh clone produced 184 translated, 35 partial and 100 skipped entries.

## What was built

- `meta/importProtonfixes.ts`: reads the checkout as text only (no child-process module, no network, no execution). Safe enumeration (lstat, symlinks followed only inside the checkout, 256 KiB cap, filenames from `^[0-9]{1,10}\.py$` digits only), a linear Python tokenizer and statement model, helper translation, an internal validator that mirrors GameLib's accept rules, BSD-2-Clause attribution (fails closed without a BSD-2 LICENSE; BSD-3 is rejected), and `report.json` plus a stdout summary. No timestamps, so re-runs are byte-identical. Flags: `--source`, `--out`, `--source-rev`, `--source-url`, `--only`, `--overwrite`. `--out` inside `public/fixes` is refused; a non-empty `--out` is refused unless it is this tool's own output and `--overwrite` is given.
- `meta/__tests__/importProtonfixes.test.ts`: 48 jest cases (tokenizer, each helper, classification, attribution, unsafe input, determinism, `--only`, and the allow-list drift check against `gamelib-knownfix/src/types.rs`).
- `package.json` script `import-protonfixes`; `knip.jsonc` entry (baseline stays at 308).
- The pending todo gets a Progress section and `ready: blocked` (in the planning-gates vocabulary; `pnpm planning-gates` 12/12).

## Real run

- Upstream: `https://github.com/Open-Wine-Components/umu-protonfixes`, revision `d4912aee4bc2f98dab47d8cdf843a6ca9e85978c` (`git clone --depth 1`, disposable HOME, never executed).
- Census of `gamefixes-steam/`: 319 entries, 19 symlinks (all to sibling `<appId>.py` files), 2 names not matching `^[0-9]+\.py$` (`__init__.py`, `default.py`), 4 files with no `def main` (`6020`, `6030`, `9010`, `__init__`), 306 `from protonfixes import util`, helper tally led by protontricks 282, set_environment 50, winedll_override 42, replace_command 37, regedit_add 33, append_argument 29. LICENSE is BSD 2-Clause, `Copyright (c) 2018, Chris Simons`.
- Counts (319 total, sums reconcile with the directory entry count): **translated 184, partial 35, skipped 100**.
- Skip reasons: nothing-mapped 72, no-main 13, only-not-applicable 10, empty-main 3, not-an-appid-file 2. (no-main is 13, not 4: nine more files define `main_with_id` or similar instead of `main`, and the 22330 symlink family points at one of them.)
- Top 10 unmapped reasons (statements): non-declarative-statement 130, dll-override-exe-unknown 34, unsupported-call 16, module-level-statement 10, unsupported-helper:set_cpu_topology_limit 9, unsupported-helper:import_saves_folder 9, proton-launcher-env 5, non-literal-argument 5, invalid-value 5, unsupported-registry-type 4.
- Output files: 213 tier-1 `<appId>-steam.json` and 7 tier-2 `<appId>-steam.profile.json` (all registry-only), 220 files in total, equal to the sum of non-empty `emitted` lists in `report.json`. Every one carries BSD-2-Clause.
- dllOverrides left out for lack of an exe: 34 overrides in 27 files (`dll-override-exe-unknown`). No upstream file combines a mapped `replace_command` exe with a literal dll override, so no `dllOverrides` entry was emitted in this run.
- Location: `/Users/graysonmitchell/Projects/GameLib/scratchpad/protonfixes-candidates/` (candidates in `fixes/`, plus `report.json`). Gitignored; `git ls-files scratchpad` is empty. The clone is `scratchpad/umu-protonfixes/`.
- Using a candidate: copy the `<appId>-steam.json` / `.profile.json` pair into GameLib's `fixes/local/` app folder, launch it on the Mac, and promote through the Phase 57 PR flow with real evidence replacing the upstream `evidence` link.

## Fidelity spot-check (read upstream `.py` against candidates)

| appId | status | verdict |
| --- | --- | --- |
| 7670 | translated (profile) | faithful: winebus `DisableHidraw` REG_DWORD 1 mapped, esync/fsync noted as not applicable, no tier-1 file |
| 49520 | translated (tier 1) | faithful: winetricks physx, launchArgs `-NoSplash`, exeOverride `Borderlands2.exe` with caveat note |
| 8190 | translated (tier 1) | faithful: three winetricks verbs in order, launchArgs `-borderless` |
| 39510 | partial | faithful: protontricks and PULSE_LATENCY_MSEC mapped; `set_resolution()`, the `*dsound` wildcard (invalid-value) and the two dll overrides (no exe) are listed in the unmapped note |
| 40970 | partial | faithful: only `directplay` mapped; the two calls inside `if` blocks are not extracted, module constants listed as module-level-statement |
| 3590 | partial | faithful: `-changedir` mapped; the assignment and `if` after it unmapped |
| 39210 | skipped (nothing-mapped) | faithful: every call sits inside an `if`; nothing extracted |
| 46500 | skipped (nothing-mapped) | faithful: all inside an `if`, subprocess use never touched |
| 9350 | skipped (only-not-applicable) | faithful: esync/fsync only |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] try/except counted as two unmapped statements**
- **Found during:** Task 1 (RED test run)
- **Issue:** `except`/`else`/`elif`/`finally` lines at the same indent were each classified as their own non-declarative statement.
- **Fix:** continuation clauses fold into the compound statement above (in main's body and at module level); regression case in the suite.
- **Files modified:** meta/importProtonfixes.ts, meta/__tests__/importProtonfixes.test.ts
- **Commit:** 3af1ae608

**2. [Rule 1 - Bug] wrong-type literal reported as invalid-value**
- **Found during:** Task 2 (GREEN)
- **Issue:** `append_argument(5)` gave `invalid-value`; the plan's behavior list says a non-string argument is non-literal-argument or bad-arguments.
- **Fix:** a literal of the wrong type for a helper argument is `non-literal-argument`.
- **Commit:** aaa00221f

### Plan-process note

I wrote the whole importer in one pass, then built the Task 1 commit by temporarily limiting the helper signatures to protontricks, so the tracer commit is the protontricks slice. The Task 2 tests were added against that slice first and failed (22 of 48) before the six mappings were restored.

## Deferred Issues / out of scope

- `pnpm codecheck` currently exits non-zero on two errors in `src/backend/__tests__/runnerCallSites.test.ts` (lines 166 and 187, "Object is possibly 'undefined'"). That file has uncommitted edits from a concurrent session and is not touched by this plan; none of the errors is in `meta/importProtonfixes.ts` or its test. The importer compiles clean under `tsconfig.meta.json`.
- Commit count: the measured range `plan_head_before..plan_head_after` holds 4 commits because a concurrent session landed `c2b535d79` (88.2-30) between this plan's commits. This plan made 3 commits.

## Known Stubs

None.

## Threat Flags

None. The importer spawns nothing, uses no network API and writes only under the `--out` directory it is given.

## Verification

- `npx jest --selectProjects Meta --runTestsByPath meta/__tests__/importProtonfixes.test.ts`: 48 passed.
- `npx eslint --max-warnings 0` and `npx prettier --check` over the two meta files, package.json and knip.jsonc: pass.
- `pnpm -s find-deadcode`: PASS, 308 baselined findings (unchanged). `pnpm -s planning-gates`: 12/12.
- Real-run gates: report counts sum to 319, every candidate attributed, nothing under `scratchpad/` tracked.

## Self-Check: PASSED

- FOUND: meta/importProtonfixes.ts, meta/__tests__/importProtonfixes.test.ts, scratchpad/protonfixes-candidates/report.json
- FOUND commits 3af1ae608, aaa00221f, c4317397a (ancestors of HEAD)
