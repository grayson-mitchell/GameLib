---
phase: 45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self
plan: 06
subsystem: backend-winetricks
tags: [winetricks, classifier, ipc, sidecar, tdd, jest]

requires:
  - phase: 45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self
    provides: "45-01 queue, apply guard and environment store; 45-04 metadata parser and visibility predicate"
provides:
  - "classifyWinetricksLine / splitOutputChunk / parseUnsupportedWineVersion / appendLogLine -- a pure backend line classifier (D-15)"
  - "runWithArgs routes every stdout/stderr line through the classifier; progressOfWinetricks events carry lines and percent (D-14)"
  - "Winetricks.queue run.log: classified lines appended per verb, progress replaced, capped at 200 (D-18/E9)"
  - "Environment store fed on every run, including the tab-open list-all (D-16)"
  - "listAvailable annotated from the script on disk and filtered by isVisibleVerb; apply guard re-checks visibility (D-09/D-17/D-19)"
affects: [45-07, 45-08, 45-11, 45-12]

actuals:
  tokens: 14900
  tasks: 3
  commits: 6
  plan_head_before: 7289b433d6d36f196b915d1df96f73af6d61e91e
  plan_head_after: c5185572995592e4d0b78ad0be8a5662dcee601d

tech-stack:
  added: []
  patterns:
    - "Pure backend classifier module (type-only import) with anchored, bounded regexes; routing by kind lives in runWithArgs"
    - "Bounded line buffer helper (appendLogLine) shared by the per-flush delta and the queue run log: progress replaces progress across wine noise, oldest dropped past the cap"
    - "mtime:size keyed parse cache for a downloaded script, degrading to unannotated data plus one warning when unreadable"

key-files:
  created:
    - src/backend/tools/winetricksOutputClassifier.ts
    - src/backend/tools/__tests__/winetricksOutputClassifier.test.ts
    - src/backend/tools/__tests__/winetricksListAvailable.test.ts
  modified:
    - src/backend/tools/index.ts
    - src/backend/tools/winetricksQueue.ts
    - src/backend/tools/winetricksApplyGuard.ts
    - src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts
    - src/backend/tools/__tests__/winetricksQueue.test.ts
    - src/backend/tools/__tests__/winetricksApplyGuard.test.ts

key-decisions:
  - "A generic non-fatal `warning:` line classifies as `environment` (logged at warning level), not `error` and not `info`: w_die is only a warning: line, so the exit code, not the text, decides failure; the synthetic exit-code error line carries that"
  - "`Aborting.` / `returned status N` is checked BEFORE environment so a failed w_try arriving behind a `warning:` prefix is an error"
  - "Noise lines are forwarded in `lines` and kept in run.log (the plan says every classified line), bounded by the 200-entry cap; they are logged at debug only"
  - "stdout under returnOutput (the list-all parser input) is never classified and is passed through byte-for-byte; stderr is always classified, which is what lets the tab-open list-all record an unsupported-wine notice"
  - "The apply-guard cache now holds the filtered (visible) catalog, so a hidden verb is refused by membership first and by the isVisibleVerb re-check as defence in depth"
  - "Long lines are truncated to 2000 chars and an over-cap partial line is flushed in 65536-char segments rather than dropped (T-45-17)"

patterns-established:
  - "Classify where the raw text exists; the frontend never re-parses a raw line"
  - "RED evidence via an inert, type-correct stub (an unused optional parameter, or a null-returning module) so ts-jest fails on assertions, not on a compile error or missing module"

requirements-completed: [D-09, D-14, D-15, D-16, D-17, D-19]

coverage:
  - id: D1
    description: "Every winetricks line is classified in the backend into progress/noise/info/environment/error; curl meter rows are never logged at ERROR or forwarded raw; wine fixme/err channels and dashed rules are debug-only noise"
    requirement: D-15
    verification:
      - kind: unit
        ref: "src/backend/tools/__tests__/winetricksOutputClassifier.test.ts#classifyWinetricksLine"
        status: pass
      - kind: unit
        ref: "src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts#output is classified at its source (D-15)"
        status: pass
    human_judgment: false
  - id: D2
    description: "progressOfWinetricks events carry the classified delta lines and the latest curl percent; a failed run ends with a synthetic error line naming the exit code"
    requirement: D-14
    verification:
      - kind: unit
        ref: "src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts#output is classified at its source (D-15)"
        status: pass
      - kind: unit
        ref: "src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts#a non-zero exit appends a synthetic error line naming the exit code to the Done lines"
        status: pass
    human_judgment: false
  - id: D3
    description: "The queue appends classified lines to run.log (progress replaced, cap 200) so a remounted tab rebuilds its log from winetricksQueueState; no queue push per line"
    requirement: D-15
    verification:
      - kind: unit
        ref: "src/backend/tools/__tests__/winetricksQueue.test.ts#WinetricksQueue run log (D-18 / E9)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The unsupported-wine version (including from the tab-open list-all) and the exact sorted missing subset of 7z/cabextract/zenity/unzip/curl (empty clears) feed the environment store"
    requirement: D-16
    verification:
      - kind: unit
        ref: "src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts#environment recording (D-16)"
        status: pass
    human_judgment: false
  - id: D5
    description: "listAvailable returns only visible verbs annotated with title/publisher/year/media/conflicts/homepage/needsGui parsed from the script on disk (cached by mtime:size, one spawn only); the apply guard refuses annihilate, foobar2000, 3dmark06 and accepts gdiplus_winxp"
    requirement: D-19
    verification:
      - kind: unit
        ref: "src/backend/tools/__tests__/winetricksListAvailable.test.ts"
        status: pass
      - kind: unit
        ref: "src/backend/tools/__tests__/winetricksApplyGuard.test.ts#assertWinetricksApplyPayload hidden verbs (D-09/D-17, T-45-16)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The measured before/after ERROR-share of real [WineTricks] log lines (846-line / 40%-noise baseline) -- not performable on this Windows executor box"
    requirement: D-15
    verification: []
    human_judgment: true
    rationale: "The local gamelib.log has zero [WineTricks] lines (winetricks never ran on this machine); the measurement needs the macOS operator's log and is carried to the 45-12 live gate"

duration: 13min
completed: 2026-10-10
status: complete
---

# Phase 45 Plan 06: Backend Output Classifier, Run Log, Environment Feed and Annotated Catalog Summary

**A pure line classifier (progress/noise/info/environment/error) now sits in `runWithArgs` so only real failures reach `logError`, progress is a percentage, a failed verb ends with an exit-code error line, the queue keeps a capped run log, the environment store is fed on every run, and `listAvailable` returns only installable verbs annotated from the downloaded script.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-10-10T09:01:58Z
- **Completed:** 2026-10-10T09:15:00Z
- **Tasks:** 3 (each RED then GREEN)
- **Files modified:** 9 (3 created, 6 modified)

## Accomplishments

- `winetricksOutputClassifier.ts` (pure, type-only import) turns the stderr firehose into five kinds. Curl meter rows give a `percent`; `NNNN:fixme:`/`err:` wine channels and dashed rules are `noise`; `Aborting.` / `returned status N` are `error` even behind a `warning:` prefix; the unsupported-wine and missing-dependency sentences are `environment`. `splitOutputChunk` splits on `\n` and `\r` and caps the unterminated remainder at 65536 chars (T-45-17).
- `runWithArgs` keeps one remainder per stream and routes each line by kind (`progress` no log, `noise` debug, `info` info, `environment` warning plus `recordUnsupportedWine`, `error` ERROR). `progressOfWinetricks` flushes now carry `lines` (the delta, progress lines replacing each other) and `percent`. A non-zero exit appends `winetricks exited with code N` as an `error` line on the Done event. `grep -c "logError(data"` is 0.
- `checkDependencies(runner, appName, envs, appendMessage)` records the sorted missing subset (an empty one clears) via `recordMissingDependencies`; a probe that throws counts as missing and the fire-and-forget call site has a `.catch`.
- `Winetricks.install`/`runWithArgs` take a trailing `onLine`; the queue uses it to append to `run.log` (progress replaced, 200-entry cap, no queue push per line), so a remounted tab can rebuild its log from `winetricksQueueState`.
- `Winetricks.scriptMetadata()` parses `${toolsPath}/winetricks` once per `mtimeMs:size` (parseWinetricksMetadata + deriveNeedsGuiVerbs); `listAvailable` merges it in and returns `filterVisibleCatalog(...)`. `list-all` is still the only spawn. The guard re-checks `isVisibleVerb` on the matched entry.

## Task Commits

1. **Task 1: pure output classifier**
   - `0127870e4` test(45-06): failing tests (RED)
   - `a355503a9` feat(45-06): implement the classifier (GREEN)
2. **Task 2: classified runWithArgs output, run log, environment feed**
   - `f14955a32` test(45-06): failing tests (RED)
   - `86acf449d` feat(45-06): classify output at its source and feed the run log (GREEN)
3. **Task 3: annotated, visibility-filtered listAvailable and hardened guard**
   - `fe482d701` test(45-06): failing tests (RED)
   - `c51855729` feat(45-06): annotate listAvailable and filter by D-09 (GREEN)

**Plan metadata:** the `docs(45-06)` commit that carries this file.

## RED evidence (quoted before each GREEN)

- Task 1 (`npx jest --selectProjects Backend winetricksOutputClassifier`, inert null-returning stub): `Tests: 26 failed, 8 passed, 34 total`, every failure an assertion on the planned behaviour (for example `splitOutputChunk('', 'a\r\nb\r\n')` received `lines: []`, and a 70,000-char chunk left a remainder of 70000 against `<= 65536`).
- Task 2 (`winetricksInstallLifecycle winetricksQueue`, with only an inert unused `onLine` parameter added so ts-jest compiles): `Tests: 17 failed, 15 passed, 32 total`, for example `expect(logError).not.toHaveBeenCalled()` received 1 call, and `recordUnsupportedWine` expected `("gog","game","7.7")` never called. Some later tests in those suites fail partly because an earlier red test left the single-flight slot occupied; the first failure in each group is the assertion.
- Task 3 (`winetricksListAvailable winetricksApplyGuard`, no stub needed): `Tests: 11 failed, 14 passed, 25 total`, for example `Expected value: not "foobar2000"` received `["foobar2000","3dmark06","vcrun2019","gdiplus_winxp","fontsmooth=rgb"]`, and the stale-catalog guard cases `Received function did not throw`.

GREEN results: classifier 39/39, `winetricks` pattern 7 suites / 121 tests pass, `npm run codecheck` clean, `findDeadcode` 22/22.

## D-15 measurement against the real log -- NOT PERFORMED here

The plan's one-off measurement (share of `[WineTricks]` lines the classifier would log at ERROR versus the roadmap's 846-line / 40%-noise baseline) could not be done on the Windows executor box. The local log at `C:/Users/grays/AppData/Local/GameLib/logs/gamelib.log` contains **0** `[WineTricks]` lines (winetricks never ran on this machine); the plan's macOS path `~/Library/Logs/GameLib/gamelib.log` does not exist here. No counts were fabricated and no other logs were searched. The baseline comparison is **deferred to the macOS operator session and carried to the 45-12 live gate**. The classifier itself was written test-first against the measured script facts in the plan's `<interfaces>` block, which do not depend on the log. See "Known, Accepted, Temporary State" and "Issues Encountered".

## Files Created/Modified

- `src/backend/tools/winetricksOutputClassifier.ts` - `classifyWinetricksLine`, `splitOutputChunk`, `parseUnsupportedWineVersion`, `appendLogLine`
- `src/backend/tools/__tests__/winetricksOutputClassifier.test.ts` - 39 classifier, splitter and buffer-helper tests
- `src/backend/tools/__tests__/winetricksListAvailable.test.ts` - metadata merge, visibility filter, single-spawn, degraded-read and mtime-cache proof against the committed fixture script
- `src/backend/tools/index.ts` - classified stream path, `lines`/`percent` flush, exit line, `onLine`, `checkDependencies` recording, `scriptMetadata`, annotated and filtered `listAvailable`
- `src/backend/tools/winetricksQueue.ts` - passes `onLine` that appends to `run.log`
- `src/backend/tools/winetricksApplyGuard.ts` - `isVisibleVerb` re-check on the matched catalog entry
- `src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts`, `winetricksQueue.test.ts`, `winetricksApplyGuard.test.ts` - new behaviour pinned; two existing expectations updated from raw chunks (`...\n`) to line text

## Decisions Made

See `key-decisions` above. In short: generic `warning:` is `environment`; error patterns win over the `warning:` prefix; noise is forwarded but bounded; list-all stdout is never classified; the guard cache holds the visible list; over-long lines are bounded rather than dropped.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `appendLogLine` shared bounded-buffer helper to the classifier module**
- **Found during:** Task 2
- **Issue:** The plan needs "progress lines replace the previous progress line, capped" in two places (the per-flush pending delta in `runWithArgs` and the queue's `run.log`). Duplicating it would let the two drift, and an unbounded pending buffer under a wine `fixme` flood would violate the same DoS reasoning as T-45-17.
- **Fix:** One exported pure `appendLogLine(buffer, line, cap=200)` in `winetricksOutputClassifier.ts`, used by both. A progress line replaces the previous progress line only across wine noise (not across an `info` line), carrying the last percent when a header replaces a row. Tested directly (5 cases).
- **Files modified:** `src/backend/tools/winetricksOutputClassifier.ts`, `src/backend/tools/__tests__/winetricksOutputClassifier.test.ts`
- **Committed in:** `86acf449d` (Task 2 GREEN)

**2. [Rule 3 - Blocking] Inert unused `onLine` parameter in the Task 2 RED commit**
- **Found during:** Task 2 RED
- **Issue:** ts-jest type-checks the suites, so calling `Winetricks.install(..., onLine)` before the parameter existed would fail on a compile error (INVALID_RED), not on the behaviour.
- **Fix:** Added the optional parameter to `install` (forwarded) and `runWithArgs` (unused, `void`) in the RED commit, mirroring 45-04's type-correct stub precedent; the GREEN commit wires it.
- **Committed in:** `f14955a32` (RED), completed in `86acf449d`

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking). No architectural change, no new IPC channel, locale key, CLI flag or timer.
**Impact on plan:** Both support the plan's stated behaviour; no scope creep. `src/common/types/ipc.ts` still carries a now-stale comment ("unused by this plan") on `lines`/`percent`; that file is outside this plan's `files_modified` and the comment is harmless.

## TDD Gate Compliance

Each of the three `tdd="true"` tasks has a `test(45-06)` RED commit before its `feat(45-06)` GREEN commit (`git log --grep "^test\(45-06\)"` shows 3, `"^feat\(45-06\)"` shows 3). RED commits carried inert stubs only where a compile error would otherwise have been the failure (Tasks 1 and 2). The plan is `type: execute`, so the plan-level `check tdd-red-evidence` verdict command was not run; the RED runs are quoted above. No REFACTOR commit was needed.

## Issues Encountered

- **D-15 real-log measurement not performable on the Windows executor box.** `gamelib.log` here has 0 `[WineTricks]` lines. The 846-line / 40%-noise baseline comparison is deferred to the macOS operator session and carried to the 45-12 live gate (also listed under Known, Accepted, Temporary State).
- `src/backend/sidecar/__tests__/wineToolsFlows.test.ts` has one failing case on this Windows box (`spawn Sid Meier's Civilization V.exe ENOENT` in a non-Windows-branch hardening case). It is the pre-existing platform-path failure, unrelated to this plan; CI is ubuntu-only. `flowRegistrationCensus`, `runnerSliceRegistration` and `invokeReturnValueSweep` pass.

## Known, Accepted, Temporary State

- **D-15 measurement deferred (see above).** Owner: 45-12 live gate on macOS. The classifier is fully test-pinned; only the before/after ERROR-share figure against the real 846-line log is outstanding.
- **Metadata source on the umu path:** `listAvailable` always reads metadata from the downloaded script at `${toolsPath}/winetricks`, whereas umu runs its own winetricks, which may differ by version. Accepted and recorded in a code comment.
- **Frontend still on the old consumer:** `ProgressDialog` still substring-classifies `messages`; the new `lines`/`percent` fields are populated and available but the tab that consumes them is a later plan.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None. Scanned the created/modified files; no hardcoded-empty UI values or placeholder text.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or schema at a trust boundary: the script path read is the fixed `${toolsPath}/winetricks` (T-45-18, accepted), and T-45-15/16/17 are mitigated and test-pinned.

## Next Phase Readiness

- The renderer can now read `lines` (kind-tagged) and `percent` from `progressOfWinetricks`, the Done event's trailing `error` line, and `run.log` / `environment` from `winetricksQueueState`; `WinetricksComponent` metadata fields are populated and hidden verbs never reach the renderer.
- No new IPC channels, so the census pins (65 handle / 4 listen) are unchanged.
- 45-12 must run the D-15 real-log measurement on the macOS operator session and the unattended-install half of the `gdiplus_winxp` D-17 check.

---
*Phase: 45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self*
*Completed: 2026-10-10*

## Self-Check: PASSED

All 9 created/modified source files and all 6 task commits (`0127870e4`, `a355503a9`, `f14955a32`, `86acf449d`, `fe482d701`, `c51855729`) confirmed present; plan-level acceptance greps pass (`logError(data` count 0, `classifyWinetricksLine` and `filterVisibleCatalog` in `index.ts`, classifier import grep 0); `npm run codecheck` clean, scoped jest and `findDeadcode` green.
