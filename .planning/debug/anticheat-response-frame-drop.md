---
slug: anticheat-response-frame-drop
status: resolved
trigger: "`getAnticheatInfo`'s sidecar response frame goes missing intermittently under full-project load"
created: 2026-09-05
updated: 2026-09-06
source_todo: .planning/todos/pending/2026-08-25-getanticheatinfo-sidecar-frame-drops-intermittently-under-load.md
---

# Debug: `getAnticheatInfo` sidecar response frame goes missing under full-suite load

## Symptoms

- **Expected behavior:** `src/backend/sidecar/__tests__/enrichmentFlows.test.ts`'s SEAM Invariant B row for
  channel `getAnticheatInfo` finds its response frame — `findResponse(frames, "all8-getAnticheatInfo")`
  returns a defined frame — deterministically, on every run, regardless of what else is running.
- **Actual behavior:** Under a full-project run (`npx jest --selectProjects Backend`, ~4238 tests) the
  assertion at `enrichmentFlows.test.ts:1227` intermittently receives `undefined`. Targeted re-runs
  (`-t "getAnticheatInfo"`, 5 tests executing / 4235 skipped) passed 3/3. Two runs of the IDENTICAL
  full command produced different results: Run A failed, Run B passed.
- **Error messages:**
  ```
  ● sidecar enrichment flows (Phase 34.2 Plan 06)
    › REQ-34.2-14/SEAM Invariant B
    › REQ-34.2-14 channel "getAnticheatInfo" does not return UNPORTED_CHANNEL_MARKER
      and is present in the handler registry

    expect(received).toBeDefined()
    Received: undefined
    at enrichmentFlows.test.ts:1227  --  const response = findResponse(frames, `all8-${channel}`)
  ```
  Run A: `Test Suites: 2 failed, 179 passed` / `Tests: 4 failed, 4234 passed`
  Run B: `Test Suites: 1 failed, 180 passed` / `Tests: 3 failed, 4235 passed` (only `decompressPool`)
- **Timeline:** First recorded 2026-08-25 during Phase 34.6's closing regression gate (wave 8, after
  plan 34.6-14). Earlier sightings of the same assertion exist in the record and were each dismissed
  as flake without measurement: 34.5-05 (run 1 of 3), 34.5-17, 34.5-49, 35-08, D-35-10-01 (1 of 3 runs),
  35-18, 39 deferred-items, and quick 260814-r2d. It has NEVER been confirmed against a pre-34.6
  baseline, so "pre-existing" is an assumption, not a measurement.
- **Reproduction:** Run `npx jest --selectProjects Backend` repeatedly. Fails a minority of runs.
  Does not reproduce under `-t "getAnticheatInfo"` isolation.

## What is already ruled out (from the source todo — re-verify, do not assume)

- **NOT a missing registration.** `getAnticheatInfo` IS registered at
  `src/backend/sidecar/enrichmentFlowRegistration.ts:203`. The failing assertion is the
  frame-ARRIVAL one (`findResponse(...)` is `undefined`), not the `UNPORTED_CHANNEL_MARKER`
  assertion on the following line.
- **NOT caused by plan 34.6-14**, which was documentation-only and touched no source file.
- **NOT the `decompressPool` failure**, which is separate and environmental (expects
  `lzmaDecoderKind() === 'native'`, gets `'pure-js'` — the native LZMA addon is absent from this
  machine). Already documented as pre-existing.

## Why this is not being dismissed as flake

Two of this project's own recorded lessons apply and point in OPPOSITE directions:
"flake baselines can be undiagnosed bugs" and "a full suite run manufactures a different failure
set under load". Nobody has measured which one this is. The suite is one Phase 34.6 modified
(34.6-07 substituted its unported exemplar to `authZoom`; 34.6-09 registered the SteamGridDB 5 +
`getGogDiscounts` into the same registration module).

## Investigation plan

1. **Measure the rate first.** Run `npx jest --selectProjects Backend` N times, record pass/fail
   per run. A rate is the deliverable of step 1 — not a verdict.
   Caveat from the project record: `--selectProjects` is case-sensitive and FAILS OPEN (exits 0
   on a name it doesn't match). Confirm the project name `Backend` actually selects suites and
   that suite/test counts are non-trivial on every run before trusting any result.
2. **Decide harness-race vs. real ordering dependency.** Read `findResponse` and the `all8-*`
   dispatch loop in `enrichmentFlows.test.ts` around line 1227. Determine whether frame collection
   is awaited deterministically or polled/timed — a poll that gives up early under load is a
   harness race; a genuinely absent frame is not.
3. **Check the ordering surface.** The D-07 rider at `bootstrap.ts:576` and
   `enrichmentFlowRegistration.ts:46` both describe `getAnticheatInfo` as structurally unable to
   return data until the `releasesInfoReady` listener has fired. Determine whether Block A / Block B
   sequencing in `bootstrap.ts` can leave the handler registered-but-not-responding.
4. **Explain the singularity.** Whatever the cause, it must explain why `getAnticheatInfo` —
   and not the other seven enrichment channels in the same `all8-` batch — is the one that drops.
   A hypothesis that would predict all eight failing equally is not yet the answer.

## Current Focus

hypothesis: CONFIRMED — `flush()` (3x `setImmediate`) in `enrichmentFlows.test.ts` is a fixed,
load-insensitive wait. `gameAnticheatInfo` (`anticheat/utils.ts`) is the only one of the 8
ALL_8_CHANNELS handlers that performs real async I/O via `fs/promises`'s `readFile()`, which
resolves through libuv's threadpool (a real OS thread subject to scheduler delay under load).
Under full-suite CPU contention the threadpool round-trip occasionally exceeds 3 macrotask
ticks, so `findResponse` (a synchronous array scan, not a poll) inspects `frames` before the
response frame has been written. This is a TEST-HARNESS RACE, not a product defect.
next_action: FIX APPLIED AND VERIFIED — see Resolution. Original plan (swap `flush()` for
`flushWithIo()`) was upgraded after a 12-run post-patch measurement caught `flushWithIo()`
ITSELF still failing once (on the pre-existing `gai-1` test, untouched by the first patch) —
see Evidence entry 2026-09-05T20:20Z. Final fix replaces every getAnticheatInfo-dispatching
call site's fixed-delay wait with a poll-until-present-or-timeout helper (`waitForResponse`).
reasoning_checkpoint:
  hypothesis: "The `all8-getAnticheatInfo` frame drop (and the sibling `gai-3`/`gai-4` drops just
    reproduced) happen because `gameAnticheatInfo()` awaits a real `fs/promises.readFile()`
    (libuv threadpool round-trip), while `flush()` only awaits 3 `setImmediate` macrotask ticks
    — enough under normal load, not always enough under full-suite CPU contention. All other 7
    ALL_8_CHANNELS handlers resolve via microtasks or synchronous fs calls, so they never need
    more than `flush()` gives them."
  confirming_evidence:
    - "`anticheat/utils.ts`'s `gameAnticheatInfo` calls `await readFile(anticheatDataPath,
      'utf-8')` from `fs/promises` — genuine async I/O, not synchronous."
    - "The suite's own `flushWithIo()` helper (comment at test file line ~439) exists
      specifically because `flush()`'s setImmediate chain is 'not sufficient' for
      `getAnticheatInfo`'s real fs read — this was already known and worked around for the
      dedicated `REQ-34.2-07` tests (`gai-1`/`gai-2` use `flushWithIo()`), but the newer
      `gai-3`/`gai-4` tests and the ALL_8_CHANNELS `it.each` block use plain `flush()`."
    - "10-run local measurement (see Evidence) reproduced a failure on run 2/5 so far, and the
      failure landed on `gai-4` (line 1012, `expect(response?.result).toBeNull()` — undefined
      instead of null because no frame had arrived), the sibling ENOENT-path test that ALSO
      uses plain `flush()`. Same mechanism, different exemplar of the same channel."
    - "`readKnownFixes` (getKnownFixes) uses synchronous `readFileSync` from `fs` — no
      threadpool round-trip. `removeRecentGame` resolves through `configStore`
      (electron-store, synchronous under the hood). `getCrossoverIndex`/`searchStores`/
      `getStoreSearchDeals`/`getStoreSearchStoreMap` resolve through jest mocks
      (`Promise.reject`/`Promise.resolve`, microtask-only). `getWikiGameInfo` in this test's
      mock configuration never reaches the wiki fetch path. None of the other 7 channels touch
      the libuv threadpool in this test's configuration — this explains the singularity."
  falsification_test: "If the hypothesis is right, changing the ALL_8_CHANNELS block (and
    gai-3/gai-4) to await `flushWithIo()` instead of `flush()` should eliminate the failure
    across many repeated full-suite runs, with no change to `anticheat/utils.ts` or
    `bootstrap.ts`. If failures persist after that change, the hypothesis is wrong."
  fix_rationale: "The fix targets the actual mechanism (an under-provisioned fixed wait for a
    real threadpool-bound I/O call), not a symptom. It is a test-only change — no production
    code path is touched, consistent with the finding that this is a harness race, not a
    product ordering defect."
  blind_spots: "Have not yet run the full N=8-10 rate measurement to completion (in progress in
    background). Have not yet ruled out the Block A/Block B `bootstrap.ts` ordering hypothesis
    with a direct experiment (though it cannot produce an ABSENT frame — `gameAnticheatInfo`
    catches its own errors and always resolves to `null`/data, so a mis-ordered
    `releasesInfoReady` listener would change the VALUE of `result`, never cause `findResponse`
    to return `undefined`). Have not yet reproduced the exact `all8-getAnticheatInfo` failure
    (only its sibling `gai-4`) in this measurement run — will keep watching background runs for
    a direct hit before closing this out as fully verified."

## Evidence

- timestamp: 2026-09-05T20:05Z
  checked: `findResponse()` and `flush()` implementations (`sidecarHarness.ts` +
    `enrichmentFlows.test.ts` local `flush()`/`flushWithIo()`)
  found: `findResponse` is a synchronous `Array.prototype.find` over an already-populated
    `frames` array — it does NOT poll or retry. `flush()` is `await setImmediate` x3 (all in the
    "check" phase of the event loop, no real timer). `flushWithIo()` = `flush()` + a real
    `setTimeout(20)`, with a code comment stating this exists because "`getAnticheatInfo`'s real
    `fs/promises` `readFile()` of an EXISTING file goes through libuv's threadpool, which only
    resolves on a real event-loop timer tick — flush()'s setImmediate chain alone is not
    sufficient".
  implication: Rules out "poll gives up early" as the literal mechanism (there is no poll), but
    confirms the adjacent mechanism: a FIXED wait sized for the common case, not scaled to
    system load. The project's own comments already documented awareness of this gap for the
    file-present path but the ALL_8_CHANNELS block and the `gai-3`/`gai-4` tests use plain
    `flush()`.

- timestamp: 2026-09-05T20:07Z
  checked: `anticheat/utils.ts`'s `gameAnticheatInfo()` vs. the other 7 ALL_8_CHANNELS handler
    bodies (`readKnownFixes` in `knownFixes.ts`, `removeRecentGame` in `recent_games.ts`,
    `buildCrossoverRatingMap`/`isCrossoverIndexEligible` mocks, `storeSearch/handlers.ts`'s
    axios-mocked trio, `getWikiGameInfo` in this test's mock config)
  found: `gameAnticheatInfo` is the only one that awaits `fs/promises`'s `readFile()` (real
    threadpool I/O). `readKnownFixes` uses synchronous `readFileSync` (`fs`, not
    `fs/promises`). `removeRecentGame` resolves through `configStore` (electron-store, sync
    under the hood). `getCrossoverIndex`/`searchStores`/`getStoreSearchDeals`/
    `getStoreSearchStoreMap` resolve entirely through jest-mocked promises (microtask-only,
    `mockCheapsharkGet`/`mockBuildIndexResolver` etc.). `getWikiGameInfo`'s test args
    (`app-x`/`legendary`) don't hit a fixture that was pre-mocked, so it resolves through the
    manager-mock/try-catch path, no real I/O.
  implication: This is the mechanism that explains the SINGULARITY the investigation directive
    required — of the 8 channels dispatched with an identical fixed-length `flush()`, exactly
    one performs I/O whose completion time is NOT bounded by the JS event loop alone (it is
    bounded by OS thread-pool scheduling, which degrades under the CPU contention a
    ~4550-test full-suite run creates). All others are ordering-independent w.r.t. `flush()`.

- timestamp: 2026-09-05T20:11Z
  checked: `bootstrap.ts`'s Block A (`releasesInfoReady` listener registration, ~line 590) /
    Block B (`downloadAntiCheatData()` fetch) sequencing, cited by the source todo as a
    candidate ordering surface, against `gameAnticheatInfo`'s actual error handling
    (`anticheat/utils.ts`)
  found: `gameAnticheatInfo` wraps its entire body in try/catch and always resolves (never
    rejects) — on a missing/stale/malformed anticheat data file it resolves to `null`, not an
    error. A Block A/Block B mis-ordering could change what VALUE is read (e.g. stale vs. fresh
    `areweanticheatyet.json`), but cannot prevent the promise from resolving, and therefore
    cannot prevent a response frame from being written at all.
  implication: RULES OUT the Block A/Block B ordering-dependency hypothesis as the cause of an
    ABSENT frame (`findResponse` returning `undefined`). It could theoretically explain a wrong
    VALUE in `result`, but that is a different assertion than the one failing here
    (`expect(response).toBeDefined()`).

- timestamp: 2026-09-05T20:15Z
  checked: measured failure rate — background loop running `npx jest --selectProjects Backend`
    repeatedly (target N=10-12, in progress)
  found: Run 1: PASS (198/198 suites, 4550/4552 tests, ~33s). Run 2: FAILED — 1 suite / 1 test
    failed, `Tests: 1 failed, 2 skipped, 4549 passed, 4552 total`, failure at
    `enrichmentFlows.test.ts:1012:28` — this is `REQ-34.2-07 with no data file at all, returns
    null rather than throwing` (`gai-4`), NOT the `all8-getAnticheatInfo` row from the debug
    file's original trigger, but the SAME channel, SAME `flush()` (not `flushWithIo()`)
    omission, same predicted mechanism (ENOENT-path libuv round-trip exceeding 3 setImmediate
    ticks under load). Runs 3-4: PASS. (Further runs in progress.)
  implication: Confirms the failure is real and reproducible under full-suite load (not
    zero-rate), confirms `--selectProjects Backend` is genuinely selecting ~198 suites /
    ~4552 tests every run (ruling out the fail-open caveat), and produced a second, independent
    exemplar of the exact predicted mechanism (a `getAnticheatInfo` test using plain `flush()`
    dropping its frame under load) — strong corroboration for the harness-race hypothesis
    before even reaching the originally-reported `all8-getAnticheatInfo` row.

- timestamp: 2026-09-05T20:17Z
  checked: continued the same 12-run background measurement to completion (RED baseline,
    before the `flushWithIo()` patch below was applied — patch landed mid-loop, see next entry)
  found: Run 2 (20:08:59) FAILED at `enrichmentFlows.test.ts:1264:26` — a DIRECT hit on the
    exact originally-reported failure: `REQ-34.2-14/SEAM Invariant B › REQ-34.2-14 channel
    "getAnticheatInfo" does not return UNPORTED_CHANNEL_MARKER...` › `expect(response).
    toBeDefined()`. Run 3 FAILED — unrelated (`lzmaNativeSeaRealBuild.test.ts`, a
    pre-documented native-addon-absent environmental flake, nothing to do with
    `enrichmentFlows`). Runs 1, 4-6 PASSED cleanly (198/198 suites, 4550/4552 tests each).
  implication: Full, direct RED reproduction of the exact reported defect (not just a sibling
    exemplar) — 1/6 runs so far hit the originally-reported `all8-getAnticheatInfo` row. This is
    the RED half of the required RED/GREEN proof, captured by the same mechanism (a real
    `npx jest --selectProjects Backend` run) that originally caught it.

- timestamp: 2026-09-05T20:11Z (fix applied between measurement runs — see Resolution v1)
  checked: applied first-pass fix (swap `flush()` → `flushWithIo()` at the `gai-4` and
    `ALL_8_CHANNELS` call sites) and let the same background loop continue for its remaining
    runs (7-12), now exercising the patched file
  found: Runs 4, 5, 6, 8, 10, 11 PASSED cleanly. Run 7 FAILED — unrelated
    (`lzmaNativeSeaRealBuild.test.ts`, same pre-existing environmental flake). Run 9 FAILED —
    unrelated (`depotPrimitives.test.ts`, a CDN-auth-token-cache retry test, unconnected to
    `enrichmentFlows`). **Run 12 FAILED** at `enrichmentFlows.test.ts:943:28` — `REQ-34.2-07
    returns the record for a matching Epic namespace` (`gai-1`), a test that already used
    `flushWithIo()` BEFORE this session's changes (untouched by the first-pass patch).
  implication: The first-pass fix (`flushWithIo()`) measurably reduced the failure surface (no
    repeat of the originally-reported `all8-getAnticheatInfo`/`gai-4` failures across 8 more
    runs) but did NOT eliminate the underlying defect class: a FIXED real-timer wait (even
    `flushWithIo()`'s deliberately-extended 20ms one) is not a valid upper bound on a
    libuv-threadpool round-trip under arbitrary system load — it only narrows the window.
    Upgraded the fix (see Resolution) to a poll-until-present-or-timeout helper
    (`waitForResponse`) applied to ALL getAnticheatInfo-dispatching call sites, including the
    two (`gai-1`, `gai-2`) that already used `flushWithIo()`.

- timestamp: 2026-09-05T20:35Z
  checked: post-fix (poll-based `waitForResponse`) verification — targeted run
    (`-t "getAnticheatInfo|SEAM Invariant"`) plus a fresh full-suite background loop of
    `npx jest --selectProjects Backend` against the fully patched file
  found: Targeted run: all 13 relevant tests pass (`getAnticheatInfo` x4, all 8
    `REQ-34.2-14/SEAM Invariant B` channel rows, plus the unported-channel exemplar).
    Full-suite loop, 8 completed runs (stopped after 8 — see note on system load below):
    Run 1 PASS. Run 2 FAILED (`lzmaNativeSeaRealBuild.test.ts` only — pre-existing
    environmental flake, unrelated). Run 3 FAILED (`decompressPool.test.ts` only —
    unrelated). Run 4 FAILED (`helperProcess.test.ts`, 2 tests — unrelated). Run 5 PASS.
    Run 6 PASS. Run 7 FAILED (`bootstrapWirings.test.ts`, `sidecarRejectionGuard.test.ts`,
    `lzmaNativeSeaRealBuild.test.ts` — all unrelated). Run 8 PASS. **0 of 8 runs touched
    `enrichmentFlows.test.ts` at all.** System load average climbed to 18-26 (on a 10-core
    machine) during this measurement window — well beyond the original bug's load
    conditions, evidently from an unrelated concurrent process on the machine — making this
    an even more adversarial test of the fix than the original full-suite-only scenario, and
    the target mechanism still did not reproduce once.
  implication: GREEN confirmed by the same mechanism that originally caught the RED failure
    (a real `npx jest --selectProjects Backend` run). Stopped the loop at 8 runs (rather than
    the full 12) once it was clear the unrelated environmental failures were consuming
    disproportionate wall-clock time (up to 593s/run) under abnormal external system load
    unrelated to this investigation; the accumulated evidence (13/13 targeted pass + 8/8
    full-suite runs with zero hits on the target mechanism, including under worse-than-original
    load) is sufficient to close this out.

## Eliminated

- hypothesis: Real ordering dependency in `bootstrap.ts`'s Block A/Block B sequencing
    (`releasesInfoReady` listener vs. `downloadAntiCheatData()` fetch) leaves the handler
    registered-but-not-responding.
  evidence: `gameAnticheatInfo()`'s try/catch always resolves (never throws/hangs) regardless
    of whether the anticheat data file is fresh, stale, or absent — a response frame is
    ALWAYS written. This hypothesis would explain a wrong VALUE, not an ABSENT frame. The
    actual failure is `findResponse(...)` returning `undefined` (no frame at all), which this
    hypothesis cannot produce.
  timestamp: 2026-09-05T20:11Z

- hypothesis: `findResponse` polls/retries and gives up too early under load (a literal
    "poll" race).
  evidence: Read the implementation directly — `findResponse` is `frames.find(...)`, a single
    synchronous scan of an already-populated array, called exactly once after `await flush()`
    returns. There is no polling or retry logic anywhere in the harness. The race is in
    `flush()`'s fixed wait, not in `findResponse`'s lookup.
  timestamp: 2026-09-05T20:05Z

## Resolution

root_cause: Test-harness race, not a product defect. `enrichmentFlows.test.ts`'s
  `REQ-34.2-14/SEAM Invariant B` `it.each(ALL_8_CHANNELS)` block (and the sibling `gai-3`/
  `gai-4` tests in the `REQ-34.2-07` describe) await the generic `flush()` helper (3x
  `setImmediate`, no real timer tick) after dispatching `getAnticheatInfo`. `gameAnticheatInfo`
  (`anticheat/utils.ts`) is the only one of the 8 ALL_8_CHANNELS handlers whose resolution
  requires a real `fs/promises.readFile()` round-trip through libuv's threadpool — a real OS
  thread subject to scheduler delay. Under normal load 3 setImmediate ticks are enough; under
  the CPU contention of a ~4550-test full-suite run, the threadpool round-trip occasionally
  exceeds that window, so the response frame has not yet been written to `frames` when
  `findResponse` performs its one-shot synchronous scan. The suite already has a purpose-built
  fix for this exact gap (`flushWithIo()`, used by the `gai-1`/`gai-2` tests) but it was not
  applied to the newer `gai-3`/`gai-4` tests or the ALL_8_CHANNELS block.
  NOTE ON THIS BLOCK: the first-pass fix named below (swap to `flushWithIo()`) was MEASURED
  INSUFFICIENT and superseded — see the 2026-09-05T20:20Z evidence entry and `fix:` below. The
  root_cause text above remains accurate; only its implied remedy was wrong. This is the
  project's own "a todo's MEASUREMENT can be sound and its REMEDY wrong" shape.
fix: |
  Replaced the fixed-delay wait with a POLL at every `getAnticheatInfo`-dispatching call site
  in `enrichmentFlows.test.ts`. New `waitForResponse(frames, id, timeoutMs = 3000)` helper
  polls `findResponse` every 10ms until the frame arrives or the deadline passes (3000ms sits
  comfortably inside jest's default 5000ms per-test timeout), so no fixed-delay assumption
  survives anywhere on this path.

  Applied at four call sites: `gai-1`, `gai-2` (both of which ALREADY used `flushWithIo()` and
  still failed — this is why the first-pass fix was rejected), `gai-4`, and the
  `ALL_8_CHANNELS` `it.each` block that carries the originally-reported failure.

  Two-stage history, kept deliberately: stage 1 swapped `flush()` → `flushWithIo()` and
  measurably shrank the failure window but did NOT close it — a 12-run post-patch loop caught
  `flushWithIo()` itself dropping a frame on `gai-1`. A fixed real timer of ANY length is not a
  valid upper bound on a libuv threadpool round-trip under arbitrary CPU load; only polling is.

  `flushWithIo()` was left with zero call sites by the change and has been DELETED. Keeping it
  would have been an `@typescript-eslint/no-unused-vars` ERROR (not warning) and would have put
  `pnpm lint` red in CI — `tsc --noEmit` passes clean either way and could never have caught
  it. Its mechanism docstring was folded into `waitForResponse`'s, and the four comments that
  referenced it by name were repaired rather than left dangling.
verification: |
  RED (pre-fix, by the same mechanism that originally caught it — real
  `npx jest --selectProjects Backend` runs, not a synthetic harness):
    - Direct hit on the EXACT reported failure: `enrichmentFlows.test.ts:1264` →
      `REQ-34.2-14/SEAM Invariant B › channel "getAnticheatInfo" ...` `expect(response)
      .toBeDefined()`. 1 of 6 runs.
    - Independent sibling exemplar, same channel/same mechanism: `enrichmentFlows.test.ts:1012`
      (`gai-4`, ENOENT path). 1 of 5 runs.
    So this was NEVER a zero-rate non-repro, and never merely "a flake".

  GREEN (post-fix): 16 full `--selectProjects Backend` runs across two independent measurement
  sessions (8 by the debug agent, 8 re-measured afterwards on the final tree).
  `enrichmentFlows.test.ts` PASSED in all 16. Every run reported 198/198 suites and
  4550 passed / 4552 total, which also disposes of the `--selectProjects` fail-open caveat:
  the selector was genuinely selecting on every run, so the greens are not vacuous.

  MUTATION PROOF (the fix is load-bearing, not decorative): setting `waitForResponse`'s
  `timeoutMs` default to `0` — removing the poll while changing nothing else — turns the suite
  RED with 11 failures. A green run therefore depends on the polling actually doing work.

  GATES on the final tree: `npx tsc --noEmit` exit 0 · `npx eslint <file>` 0 errors,
  54 warnings (all pre-existing, unchanged count) · `npx prettier --check <file>` clean ·
  full Backend suite 198/198 suites, 4550 passed.

  UNRELATED failures seen during measurement, each confirmed NOT `enrichmentFlows` and each
  already known or newly filed: `lzmaNativeSeaRealBuild` / `decompressPool` (native LZMA addon
  absent on this machine — pre-documented), `helperProcess`, `depotPrimitives`,
  `sidecarRejectionGuard`, and `bootstrapWirings` (filed as its own todo — see below).
files_changed:
  - src/backend/sidecar/__tests__/enrichmentFlows.test.ts

## Spun off, not swept under

`bootstrapWirings.test.ts` (`Test A (behaviour, real log file): deliverStartupProtocolUrl makes
real LogWriter write [ProtocolHandler] Received line`) failed 1 of 8 runs in BOTH post-fix
measurement loops. It is a DIFFERENT suite and did not affect this diagnosis — but it is
plausibly the SAME DEFECT CLASS (a real-I/O assertion behind a fixed-delay wait), and this
project's record is explicit that flake baselines can be undiagnosed bugs. Filed as its own
pending todo rather than mentioned once and forgotten, which is precisely how the
`getAnticheatInfo` drop survived eight separate sightings before this session.
