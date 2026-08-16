---
phase: quick-260817-dib
plan: 01
subsystem: downloadmanager
tags: [steam, install, watchdog, timeout, backend-events, i18n]

requires:
  - phase: quick-260816-vgc
    provides: "the failure-path abort (callAbortController + steam-gated stop(false)) in installQueueElement's finally block, left unmodified here"
provides:
  - "withStallTimeout -- a runner-agnostic no-progress (stall) watchdog re-armed only on an ADVANCE in backendEvents' progressUpdate-<appName> payloads"
  - "Steam native depot progress routed onto backendEvents via sendProgressUpdate, so the watchdog can re-arm for Steam installs"
  - "box.error.install.stalled dialog copy naming the observed no-progress window, distinct from the inner-CM-timeout 'connection may be stale' copy"
  - "LIVE-GATE.md operator recipe (Gate A/Gate B) proving the wall-clock property against a real multi-GB download"
affects: [23-10, steam-depot-download, download-watchdog]

tech-stack:
  added: []
  patterns:
    - "Re-armable stall watchdog: race a promise against a deadline that resets only on an observed ADVANCE (higher percent, or changed bytes string), never on event arrival -- required because depot.ts's 1s heartbeat emits progress whether or not bytes moved"
    - "Split diagnostic surfaces on a terminal error: a stable, greppable English log line (for live-gate evidence) vs. an i18n'd dialog string, chosen per failure classification (isStallError vs isTimeoutError)"

key-files:
  created:
    - src/backend/downloadmanager/installStallWatchdog.ts
    - src/backend/downloadmanager/__tests__/installStallWatchdog.test.ts
    - .planning/quick/260817-dib-make-the-install-watchdog-a-progress-bas/LIVE-GATE.md
    - .planning/quick/260817-dib-make-the-install-watchdog-a-progress-bas/abort-gate/monitor-abort-gate.sh
    - .planning/quick/260817-dib-make-the-install-watchdog-a-progress-bas/abort-gate/monitor-abort-gate-gateA.sh
  modified:
    - src/backend/downloadmanager/utils.ts
    - src/backend/downloadmanager/__tests__/utils.test.ts
    - src/backend/storeManagers/steam/depot.ts
    - src/backend/storeManagers/steam/__tests__/depot.test.ts

key-decisions:
  - "Kept INSTALL_NO_PROGRESS_TIMEOUT_MS at the same 480000ms value as the old INSTALL_WATCHDOG_MS -- only the semantics changed (total-duration -> no-progress), so no runner gains new false-trip risk"
  - "Re-arm on ADVANCE (percent up or bytes string changed), never on event ARRIVAL -- an arrival-armed watchdog would never trip for Steam because depot.ts's PROGRESS_HEARTBEAT_MS heartbeat emits every second regardless of chunk activity"
  - "Split the stall branch's diagnostic: errorMessage(...) gets a stable, non-i18n'd English string naming the observed no-progress window (the live gate greps this); the dialog gets i18next.t('box.error.install.stalled', ...) with {{minutes}} (never {{count}}, which is reserved by i18next)"
  - "Did not add box.error.install.stalled to public/locales/en/translation.json -- its sibling box.error.install.failed is already absent from the catalog, and pnpm lint-translations does not demand it (confirmed by running it and checking exit code + absence of any 'stalled' complaint)"
  - "Converted downloadmanager/__tests__/utils.test.ts's plain i18next.t mock into a jest.fn() (mockT) so the honest-copy spec can assert on the KEY i18next.t was called with, not on rendered English -- required a file-scope beforeEach re-establishing its implementation, since resetMocks:true wipes even a jest.fn(impl)'s factory-time implementation before every test (confirmed empirically via a throwaway probe test before committing to this design)"
  - "depot.test.ts's backend/utils mock stays wholesale (per the checker's resolved warning): sendProgressUpdate is a bare jest.fn() with its ipc-forwarding implementation re-established in the downloadDepotFiles describe's beforeEach, asserting on the mock's own call arguments rather than on backendEvents -- the real emit-to-bus behavior is proven for real in downloadmanager/__tests__/utils.test.ts instead"

requirements-completed: [QUICK-260817-dib]

duration: ~14min
completed: 2026-08-17
---

# Quick Task 260817-dib: Install watchdog -> no-progress bound Summary

**Converted `installQueueElement`'s 8-minute install bound from a total-duration ceiling to a re-armable no-progress window, unblocking native Steam installs of any length as long as they keep advancing.**

## Performance

- **Duration:** ~14 min (first commit `e92d0dc03` 10:04:55 -> last commit `f021b6a7d` 10:18:52, both +12:00)
- **Tasks:** 3/3 completed
- **Files modified:** 4 (utils.ts, utils.test.ts, depot.ts, depot.test.ts)
- **Files created:** 5 (installStallWatchdog.ts + its test, LIVE-GATE.md + 2 harness scripts)

## Accomplishments

- `INSTALL_WATCHDOG_MS` (a total-duration ceiling that wrapped the ENTIRE `install()` await, including Steam's whole depot download) is gone. Replaced with `withStallTimeout`, a runner-agnostic no-progress watchdog re-armed only by an observed ADVANCE on `backendEvents`' `progressUpdate-<appName>` bus.
- Steam's native depot download (`depot.ts`) now routes its progress through `sendProgressUpdate` (backend/utils) instead of a raw `sendFrontendMessage`, so it reaches the bus the watchdog listens on. Without this, Steam installs had no progress signal reaching `backendEvents` at all, and the watchdog could never re-arm for them.
- Terminal-error copy now distinguishes a genuine stall (new `box.error.install.stalled` key, "No download progress for N minutes") from an inner CM-timeout (`connection may be stale`, unchanged) -- the misdirection that applied the connection-fault copy to every timeout, including a healthy-but-slow install, is fixed.
- The `260816-vgc` failure-path abort (`callAbortController` + steam-gated `stop(false)`, `utils.ts:193-277`) is untouched byte-for-byte; a stall trip still reaches it through the same `status = 'error'` assignment.
- `LIVE-GATE.md` documents the operator recipe (Gate A: proof-by-absence that a long healthy install is never killed; Gate B: proof that a genuine stall, produced by blackholing the CDN to an unroutable IP, still trips and still aborts) to close the gap jest's fake timers cannot close: real wall-clock time against a real multi-GB download.

## Task Commits

1. **Task 1a: RED spec for the stall watchdog** - `e92d0dc03` (test)
2. **Task 1b: implement withStallTimeout** - `8738b6422` (feat)
3. **Task 2: wire the watchdog into installQueueElement + route Steam progress onto the bus** - `4d2b319e8` (fix)
4. **Task 3: LIVE-GATE.md operator recipe** - `f021b6a7d` (docs)

_Note: Task 1 (`tdd="true"`) split into a test commit (RED, confirmed failing against the not-yet-written module) then an implementation commit (GREEN, all 10 specs passing) per the TDD execution flow. Task 2's RED was confirmed against the real pre-fix `utils.ts` (see "RED/GREEN evidence" below) and landed as a single `fix` commit since it's a wiring change across two already-existing modules rather than a new-feature RED/GREEN split._

## Files Created/Modified

- `src/backend/downloadmanager/installStallWatchdog.ts` - `withStallTimeout`, `isStallError`, `INSTALL_NO_PROGRESS_TIMEOUT_MS`; runner-agnostic, imports nothing from `storeManagers/steam`
- `src/backend/downloadmanager/__tests__/installStallWatchdog.test.ts` - 10 specs: the two decisive ones (20-min-survival vs. the old ceiling; anti-vacuity vs. the literal Steam heartbeat), plus advance-scoping, transparent pass-through, listener hygiene, and cross-appName scoping
- `src/backend/downloadmanager/utils.ts` - `installQueueElement` now calls `withStallTimeout` instead of `withTimeout`; catch block gained an `isStallError` branch ahead of `isTimeoutError`, splitting the log diagnostic from the dialog's i18n'd copy
- `src/backend/downloadmanager/__tests__/utils.test.ts` - renamed the D-01b describe block to name the stall semantics; added 4 new specs (RED-the-defect, stall-still-aborts, honest-copy, inner-CM-timeout-preserved) alongside the 2 pre-existing specs (both kept green, unmodified)
- `src/backend/storeManagers/steam/depot.ts` - `emitProgress` now calls `sendProgressUpdate` (backend/utils) instead of a raw `sendFrontendMessage`; removed the now-unused `sendFrontendMessage` import
- `src/backend/storeManagers/steam/__tests__/depot.test.ts` - `backend/utils` mock gained a `sendProgressUpdate` jest.fn(), re-established each test to forward into the already-mocked ipc module (keeping the 3 pre-existing `sendFrontendMessage('progressUpdate', ...)` assertions green, unmodified); added 1 new spec asserting on the mock's own call arguments (per the plan-checker's resolved warning)
- `.planning/quick/260817-dib-make-the-install-watchdog-a-progress-bas/LIVE-GATE.md` - Gate A/Gate B operator recipe, blackhole-IP instruction, anti-false-pass calibration step
- `.planning/quick/260817-dib-make-the-install-watchdog-a-progress-bas/abort-gate/monitor-abort-gate.sh` - unmodified copy of the sibling todo's Gate B harness
- `.planning/quick/260817-dib-make-the-install-watchdog-a-progress-bas/abort-gate/monitor-abort-gate-gateA.sh` - new, inverted variant for Gate A (FAIL_RE's appearance is the failure condition; its absence across an extended ~75min window is the pass condition)

## Decisions Made

See `key-decisions` in the frontmatter above. The two most load-bearing:

1. **Re-arm on advance, never on arrival.** This is the whole point of the anti-vacuity spec in Task 1: a watchdog that re-arms on any `progressUpdate-<appName>` event ARRIVING would never trip for Steam, because `depot.ts` runs a 1-second heartbeat that emits an "honest ~0 MB/s" progress payload every second regardless of whether any chunk actually landed. The spec replays that literal heartbeat payload (`percent: 14, bytes: '5.23 GB'`, unchanged, every 1000ms) and asserts the watchdog still trips at ~stallMs.
2. **Keep the value, change the meaning.** `INSTALL_NO_PROGRESS_TIMEOUT_MS` is still 480000ms (8 minutes) -- the same number `INSTALL_WATCHDOG_MS` was. Because the number didn't move, this introduces zero new false-trip risk for any of the six runners; only Steam's total-duration false-trips (the actual defect) are removed.

## RED/GREEN evidence

**Task 1 (installStallWatchdog.test.ts):** ran the full 10-spec file with the not-yet-written module temporarily moved aside:
```
FAIL Backend src/backend/downloadmanager/__tests__/installStallWatchdog.test.ts
  ● Test suite failed to run
    Cannot find module '../installStallWatchdog' from '...'
Test Suites: 1 failed, 1 total
Tests:       0 total
```
Restored the module -> `Tests: 10 passed, 10 total`.

**Task 2 (utils.test.ts), against the REAL pre-fix `utils.ts`** (before `withTimeout` was swapped for `withStallTimeout` and before the `isStallError` catch branch existed):
```
✕ RED (the defect): advancing progress every 100s keeps a native Steam install running past 20 minutes of fake time -- no error, no dialog
    Expected: false
    Received: true
✕ honest copy: a stall trip uses box.error.install.stalled and the dialog does not say "connection may be stale"
    Expected: "box.error.install.stalled", Any<String>, ObjectContaining {"minutes": Any<Number>}
    Received
           1: "box.error.title", "Error"
           2: "box.error.install.failed", "The installation of {{title}} failed: {{error}}", {"error": "install did not settle — connection may be stale", "title": "Test Game"}
Tests:       2 failed, 19 skipped, 4 passed, 25 total
```
This is the decisive proof: the OLD code killed an advancing, healthy install at the fixed 8-minute ceiling, and used the connection-fault copy even for a genuine stall. After implementing: `Tests: 25 passed, 25 total` (all pre-existing specs unmodified and green).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed an implicit-`any` tsc error introduced by wrapping i18next's `t` mock in `jest.fn()`**
- **Found during:** Task 2, running `pnpm codecheck` after adding the honest-copy spec
- **Issue:** `mockT`'s `.replace(/{{(\w+)}}/g, (match, token) => ...)` callback parameters lost inference once wrapped in `jest.fn(...)`, producing `TS7006` at two call sites (the initial factory implementation and the file-scope `beforeEach` re-establishment)
- **Fix:** Added explicit `(match: string, token: string)` annotations at both sites
- **Files modified:** `src/backend/downloadmanager/__tests__/utils.test.ts`
- **Verification:** `pnpm codecheck` clean
- **Committed in:** `4d2b319e8` (Task 2 commit)

**2. [Rule 1 - Bug] Removed an eslint-flagged unnecessary type assertion in the depot.test.ts mock forwarder**
- **Found during:** Task 2, running `pnpm lint` on the four touched files
- **Issue:** `jest.requireMock('backend/ipc') as { sendFrontendMessage: (...) => void }` was flagged `@typescript-eslint/no-unnecessary-type-assertion` (an ERROR, not a warning) because `jest.requireMock`'s return type didn't change under the assertion
- **Fix:** Replaced the inline object-shape assertion with a `const mockedIpc: { sendFrontendMessage: jest.Mock } = jest.requireMock('backend/ipc')` typed-variable form instead
- **Files modified:** `src/backend/storeManagers/steam/__tests__/depot.test.ts`
- **Verification:** `pnpm exec eslint src/backend/storeManagers/steam/__tests__/depot.test.ts` reports 0 errors (121 pre-existing-style warnings only, all `no-unsafe-*`/`no-floating-promises`/`require-await` categories consistent with the rest of the file)
- **Committed in:** `4d2b319e8` (Task 2 commit)

**3. [Rule 3 - Blocking] Converted the plain i18next.t test-mock function into a jest.fn(), requiring a file-scope beforeEach to survive resetMocks:true**
- **Found during:** Task 2, implementing the "honest copy" spec, which needed to assert on `i18next.t`'s call arguments (per the plan-checker's own guidance: "Assert on the i18next.t key argument, not on rendered English")
- **Issue:** The existing mock was a plain arrow function (not spy-able). Converting it to `jest.fn(impl)` broke every OTHER spec in the file that depends on `t()`'s fallback-interpolation behavior, because `jest.config.js`'s `resetMocks: true` wipes even a `jest.fn(impl)`'s factory-time implementation before EVERY test (confirmed empirically with a throwaway probe test, then deleted)
- **Fix:** Added a single file-scope `beforeEach` (registered outside any `describe`, so it runs before every test in the file) that re-establishes `mockT`'s implementation, rather than duplicating the re-establishment into each of the file's 5 separate `describe` blocks
- **Files modified:** `src/backend/downloadmanager/__tests__/utils.test.ts`
- **Verification:** all 25 specs in the file pass, including all 7 pre-existing specs in the unrelated `debug/steam-cancel-abort-thread-a` describe block that also depend on `t()`'s interpolation
- **Committed in:** `4d2b319e8` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking lint/type errors, 1 blocking test-infrastructure gap). All contained to the same commit as the task that surfaced them. No scope creep -- no other files touched, no architectural changes.

## Threat Flags

None. This plan's own `<threat_model>` already covered the security-relevant surface (re-arm-on-arrival DoS, sideload losing its bound, the in-process `backendEvents` trust boundary, listener-leak repudiation, and the `260816-vgc` abort weakening risk) -- all five threats were mitigated exactly as planned, with no new surface introduced beyond what the threat register already named.

## Known Stubs

None. `withStallTimeout` is fully wired end-to-end: `installQueueElement` calls it for real, `depot.ts` emits real progress onto the real bus it listens on, and the dialog/log copy is live, not placeholder text.

## Issues Encountered

None beyond the three auto-fixed deviations above.

## Next Phase Readiness

- `23-10` Tasks 1 and 2 (both requiring a completed multi-GB native Steam install) are unblocked in code. The wall-clock property itself is NOT yet verified on real hardware -- `LIVE-GATE.md` Gate A must be run (as part of phase 23 wave 10) before the sibling todo `2026-08-16-eight-minute-install-watchdog-makes-long-native-steam-instal.md` can close.
- Gate B (the negative property -- a genuine stall still trips) is documented but likewise not yet run live.

---
*Quick task: 260817-dib*
*Completed: 2026-08-17*

## Self-Check: PASSED

All 10 created/modified files verified present on disk; all 4 commit hashes (`e92d0dc03`, `8738b6422`, `4d2b319e8`, `f021b6a7d`) verified present in `git log --oneline --all`.
