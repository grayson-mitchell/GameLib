---
quick_id: 260922-k2o
title: 'Shrink the used-in-module ledger: 33 verified-safe un-exports, baseline lines deleted in the same commits'
date: 2026-09-22
mode: quick
resolves_todo: .planning/todos/pending/2026-09-21-the-204-entry-used-in-module-ledger-freezes-an-export-keyword-cleanup.md
status: partial (33 of 203 shipped; todo rewritten, not closed)
---

# Summary — shrink the `used-in-module` dead-code ledger

Dropped the `export` keyword from 33 symbols verified, individually, to have no importer in any
tracked file: 21 test-internal symbols (bucket A) across 9 files, and 12 `meta/` build-script
symbols (bucket C) across 3 files. `meta/deadcode-baseline-used-in-module.txt` shrank from 203 to
170 identities; `unreachable` never moved from 47. `pnpm find-deadcode` was green at every commit.

## What shipped, per task

**Task 1 — bucket A (21 symbols, 9 files, commit `a76bfbb5d`).** Un-exported test-internal helpers
in `src/backend/__tests__/constants.test.ts`, `src/frontend/__tests__/muiTabsSelectorScoping.test.ts`,
`src/backend/__tests__/helpers/workflowSteps.ts`,
`src/backend/sidecar/__tests__/externalDynamicImportGate.test.ts`,
`src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts`,
`src/backend/humble/__tests__/fixtures/steamGames.ts`,
`src/backend/sidecar/__tests__/helpers/sidecarHarness.ts`,
`src/backend/storeManagers/steam/__tests__/fixtures/cdnAuthSendFixture.ts`, and
`src/frontend/screens/Game/GamePage/components/__tests__/permanentlyMountedPolls.test.ts`. Each
un-export carries a reasoned comment in the shape of the in-repo precedent
(`src/frontend/screens/Game/GameSubMenu/repairFailure.ts:5`). The matching 21 baseline lines were
deleted in the same commit. Gate: `used-in-module: 182 OK` (203 − 21).

**Task 2 — `meta/` bucket C (12 symbols, 3 files, commit `f7269b413`).** Un-exported
`OnedirRunnerSpec`, `UpstreamPyinstallerCommand`, `OnedirCommandResult`, `OnedirInvocationResult`,
`buildRunner` in `meta/buildRunnersOnedir.ts`; `TIMESTAMP_RETRY_DELAYS_MS`, `CliOptions`,
`SignResult` in `meta/signMachOResources.ts`; `DecodedPng`, `HUE_SPLIT_DEGREES`,
`buildHueSegmentedTemplateAlpha`, `encodeRgba` in `meta/trayIconVariants.ts`. Left
`InvocationForm`, `DECOMPRESS_WORKER_ENTRY_PATH`, and `DownloadedBinary` exported per the plan's
named traps. Matching 12 baseline lines deleted in the same commit. Gate:
`used-in-module: 170 OK` (182 − 12).

**Task 3 — corrected the ledger's own annotation (commit `5938867ac`).** Updated the header count
(170), the `CLUSTER` note (39 `meta/` entries remain, not 51; split is now 36 structural
false-positives / 3 genuinely-not-safe, not 36/15), replaced the "15 safe candidates" list with the
3 that remain and *why* each is not safe (naming the importer file and line for each), and added a
dated 2026-09-22 measurement line recording this task's 33-identity removal.

**Task 4 — full gate sweep and todo rewrite.** See "Gate output" below for every command run, with
real pasted output. Rewrote the pending todo in place (commit `3133ffd5c`) rather than closing it:
this task shipped 33 of 203, not the whole cleanup its original title implied, and closing on that
title would have discarded the untested bucket-B (64) and `src/` bucket-C (104) siblings. The
rewritten todo records the new counts, the corrected bucket table, the 3 named not-safe entries,
and the remaining scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Task 4's `pnpm typecheck` command name is wrong — the actual script is `codecheck`**
- **Found during:** Task 4, step 2
- **Issue:** The plan instructs `pnpm typecheck`. `package.json` has no `typecheck` script; running
  it fails with `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "typecheck" not found` (pnpm even
  suggests `codecheck`).
- **Fix:** Ran `pnpm codecheck` (`tsc --noEmit`) instead. Exit 0, no output.
- **Files modified:** none (command substitution only)
- **Commit:** n/a (no code change)

**2. [Rule 1 - Bug] Un-exporting `encodeRgba` in Task 2 shortened its signature below prettier's line-length threshold**
- **Found during:** Task 4, step 4 (`npx prettier --check meta/ src/`)
- **Issue:** `function encodeRgba(width: number, height: number, pixels: Buffer): Buffer {` now
  fits on one line without the `export ` prefix; prettier flagged
  `meta/trayIconVariants.ts` as needing a reflow the multi-line form no longer satisfies.
- **Fix:** Collapsed the parameter list to one line, matching prettier's own formatted output
  exactly (verified via `npx prettier` diff before applying).
- **Files modified:** `meta/trayIconVariants.ts`
- **Commit:** `6a8f3ef89`

No other deviations. `InvocationForm`, `DECOMPRESS_WORKER_ENTRY_PATH`, and `DownloadedBinary` were
left exported exactly as the plan required; none of the three named traps was touched.

## Gate output — Task 4, real pasted output

### 1. `pnpm find-deadcode`

```
> gamelib@0.7.0 find-deadcode /Users/graysonmitchell/Projects/GameLib
> node meta/findDeadcode.cjs

unreachable: 47 OK | used-in-module: 170 OK
```
Exit 0.

### 2. `pnpm typecheck` → corrected to `pnpm codecheck` (see Deviation 1)

```
> gamelib@0.7.0 codecheck /Users/graysonmitchell/Projects/GameLib
> tsc --noEmit
```
Exit 0, no output (clean).

### 3. `pnpm lint`

```
✖ 638 problems (0 errors, 638 warnings)
  0 errors and 71 warnings potentially fixable with the `--fix` option.

production: PASS | tests: PASS
```
Exit 0. **638/638 — exactly the documented zero-headroom TESTS ceiling. No drift.**

### 4. `npx prettier --check meta/ src/`

First run (before Deviation 2's fix):
```
Checking formatting...
[warn] meta/trayIconVariants.ts
[warn] Code style issues found in the above file. Run Prettier with --write to fix.
```
Exit 1. Fixed per Deviation 2. Re-run:
```
Checking formatting...
All matched files use Prettier code style!
```
Exit 0.

### 5. Touched jest suites

Primary touched suites:
```
PASS Backend src/backend/sidecar/__tests__/externalDynamicImportGate.test.ts
PASS Frontend src/frontend/screens/Game/GamePage/components/__tests__/permanentlyMountedPolls.test.ts
PASS Frontend src/frontend/__tests__/muiTabsSelectorScoping.test.ts
PASS Backend src/backend/__tests__/constants.test.ts
PASS Backend src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts

Test Suites: 5 passed, 5 total
Tests:       128 passed, 128 total
```
Exit 0.

Fixture/helper importer directories (`src/backend/humble/__tests__/`,
`src/backend/storeManagers/steam/__tests__/`, `src/backend/sidecar/__tests__/`, `meta/__tests__/`):
```
Test Suites: 161 passed, 161 total
Tests:       2 skipped, 4669 passed, 4671 total
```
Exit 0. (One unrelated pre-existing "Cannot log after tests are done" console warning surfaced from
`src/backend/sidecar/downloadQueueFlowRegistration.ts` during `storeLayer.test.ts` — a known async
logging quirk in a module this task never touched; not a failure, out of scope, not fixed here.)

### 6. `pnpm planning-gates`

```
[PASS] .planning/phases/34.2-.../currency-gate.py
[PASS] .planning/phases/34.3-.../ported-channels-gate.py
[PASS] .planning/phases/34.4-.../ported-channels-gate.py
[PASS] .planning/phases/34.4.1-.../ported-channels-gate.py
[PASS] .planning/phases/34.4.1-.../seam-parity-sweep-gate.py
[PASS] .planning/phases/34.5-.../ported-channels-gate.py
[PASS] .planning/phases/34.5-.../preload-surface-gate.py
[PASS] .planning/phases/40-.../model-a-retirement-gate.py
[PASS] .planning/planning-envelope-tag-gate.py
[PASS] .planning/planning-frontmatter-gate.py
[PASS] .planning/todos/todo-frontmatter-gate.py
[PASS] .planning/uat-visibility-gate.py

12/12 planning gates passed.
```
Exit 0. Also re-ran `python3 .planning/todos/todo-frontmatter-gate.py` standalone after rewriting
the todo, to isolate that its frontmatter (`severity: minor` / `platform: any` / `ready: code`,
bare/lowercase/exact, in order) still conforms: `OK: 21 pending todo(s) all carry in-vocabulary
severity, platform, ready triage keys.`

## What the plan got right, and what it did not

- The plan's `pnpm typecheck` step name was wrong (see Deviation 1). Everything else in the plan
  matched what was measured: the 33-symbol scope, the three named traps, the expected identity
  counts at 182 and 170, and the `unreachable: 47` invariant all held exactly.
- The plan's re-derivation (bucket A=21, meta bucket C 12 safe + 3 not-safe) was independently
  re-verified here before each edit: every un-exported symbol was greped repo-wide (`.ts`, `.tsx`,
  and for `meta/` symbols also `.cjs`/`.mjs`/`.js`) to confirm zero cross-file importers before
  touching it, and the two symbols the plan flagged as deliberately excluded from Task 1
  (`steamOwnedGameX`, `steamOwnedBatmanArkhamKnight` — inflated bucket-A false positives from the
  original triage, correctly excluded) were confirmed to have real cross-file test importers.

## Known Stubs

None. This task only removed `export` keywords and ledger lines; no new UI surface, no new data
path.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes — every change
is a keyword deletion plus documentation.

## Self-Check

Verifying claimed files exist and claimed commits are in history:

```
FOUND: meta/deadcode-baseline-used-in-module.txt
FOUND: meta/trayIconVariants.ts
FOUND: meta/buildRunnersOnedir.ts
FOUND: meta/signMachOResources.ts
FOUND: .planning/todos/pending/2026-09-21-the-204-entry-used-in-module-ledger-freezes-an-export-keyword-cleanup.md
FOUND: a76bfbb5d
FOUND: f7269b413
FOUND: 5938867ac
FOUND: 6a8f3ef89
FOUND: 3133ffd5c
```

## Self-Check: PASSED

## Commits

| Task | Commit | Message |
| ---- | ------ | ------- |
| 1 | `a76bfbb5d` | refactor(quick-260922-k2o): un-export 21 test-internal deadcode-ledger symbols (bucket A) |
| 2 | `f7269b413` | refactor(quick-260922-k2o): un-export 12 verified-safe meta/ deadcode-ledger symbols (bucket C) |
| 3 | `5938867ac` | docs(quick-260922-k2o): correct the used-in-module ledger's own annotation |
| 4 (deviation) | `6a8f3ef89` | style(quick-260922-k2o): reflow encodeRgba's param list to one line |
| 4 | `3133ffd5c` | docs(quick-260922-k2o): rewrite the used-in-module ledger todo in place, not closed |
