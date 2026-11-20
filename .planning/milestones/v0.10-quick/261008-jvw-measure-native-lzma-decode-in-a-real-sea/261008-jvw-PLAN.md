---
phase: quick-261008-jvw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts
  - src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts
  - src/backend/storeManagers/steam/depot/lzmaLoader.ts
  - src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts
  - src/backend/storeManagers/steam/__tests__/decompressPool.test.ts
  - .planning/quick/261008-jvw-measure-native-lzma-decode-in-a-real-sea/measure-selftest.ts
  - .planning/quick/261008-jvw-measure-native-lzma-decode-in-a-real-sea/measurement/
  - .planning/todos/pending/2026-10-05-native-lzma-depot-decode-is-switched-off-with-no-tracking-todo.md
  - .planning/todos/completed/2026-10-05-native-lzma-depot-decode-is-switched-off-with-no-tracking-todo.md
  - .planning/todos/pending/2026-10-08-native-lzma-decode-reenable-or-delete-needs-operator-decision.md
autonomous: true
requirements:
  - QUICK-261008-jvw

estimate:
  tokens: 75000
  raw_tokens: 75000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "If `process.dlopen` throws in `lzmaNativeBinding.ts`'s SEA branch, the temp `.node` file is removed and the ORIGINAL dlopen error propagates; the success path still removes it exactly once, after dlopen (unit-tested, RED before the fix)."
    - "No file under `src/` points at the debug doc's pre-move location; all 8 references name `.planning/debug/resolved/sea-native-lzma-real-chunk-decode-hang.md`."
    - "A real, cold-built SEA binary with native decode locally forced on was run 20 times (or until its first failure) under a fresh `createFakeHomeProfile()` per run, and every run's `SELFTEST pool=` `nativeWorkers` and `SELFTEST decode=` line is on disk in the task dir — so whether `b79765af2` works end-to-end inside a real SEA binary is answered by measurement, not inferred."
    - "HEAD ships `const NATIVE_LZMA_DECODE_ENABLED = false` and the native SEA test as `test.skip(`; the working tree under `src/` matches HEAD after the measurement."
    - "The sidecar binary left in `src-tauri/binaries/` is a shipped-state build, proven by a control run reporting `nativeWorkers:0` and `decode=ok`."
    - "The 2026-10-05 todo carries a `## Resolution (2026-10-08)` section with the measurement table and an operator recommendation (re-enable checklist vs delete), and sits in `completed/` only because a successor pending todo with valid triage keys now tracks the operator's decision."
  artifacts:
    - path: src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts
      provides: "SEA-branch temp-file cleanup in a `finally` around `process.dlopen`"
      contains: "finally"
    - path: src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts
      provides: "dlopen-throws cleanup tests in the `lzmaNativeBinding SEA branch` describe"
    - path: .planning/quick/261008-jvw-measure-native-lzma-decode-in-a-real-sea/measure-selftest.ts
      provides: "Bounded, fake-HOME self-test driver (one fresh profile per run, stall sampling, system snapshots)"
    - path: .planning/quick/261008-jvw-measure-native-lzma-decode-in-a-real-sea/measurement/native-driver.txt
      provides: "Per-run table + RESULT line for the native-forced binary"
    - path: .planning/quick/261008-jvw-measure-native-lzma-decode-in-a-real-sea/measurement/control-driver.txt
      provides: "Per-run table + RESULT line for the reverted (shipped-state) binary"
    - path: .planning/todos/completed/2026-10-05-native-lzma-depot-decode-is-switched-off-with-no-tracking-todo.md
      provides: "Resolution (2026-10-08) section + operator recommendation"
    - path: .planning/todos/pending/2026-10-08-native-lzma-decode-reenable-or-delete-needs-operator-decision.md
      provides: "Successor tracker for the re-enable-vs-delete decision (severity/platform/ready keys)"
  key_links:
    - from: "lzmaNativeBinding.ts SEA branch"
      to: "rmSync(addonPath)"
      via: "try { process.dlopen } finally { try { rmSync } catch {} }"
      pattern: "finally"
    - from: "measure-selftest.ts"
      to: "src/backend/testUtils/fakeHomeProfile.ts"
      via: "createFakeHomeProfile() per run; childEnv(); dispose() in finally"
      pattern: "createFakeHomeProfile"
    - from: "lzmaLoader.ts kill-switch doc comment"
      to: ".planning/debug/resolved/sea-native-lzma-real-chunk-decode-hang.md"
      via: "path reference (must match lzmaNativeSeaRealBuild.test.ts's — 'the two must be updated together')"
      pattern: "debug/resolved/sea-native-lzma-real-chunk-decode-hang.md"
---

<objective>
Close todo `2026-10-05-native-lzma-depot-decode-is-switched-off-with-no-tracking-todo` in three moves:
fix the latent temp-file leak in the dormant native path, MEASURE whether the native path
(including `b79765af2`'s liblzma-5.2.3 known-size header rewrite) actually decodes end-to-end inside
a real compiled SEA binary — for the first time since the kill switch went in on 2026-08-18 — and
hand the re-enable-vs-delete decision to the operator with evidence and a recommendation.

Purpose: Phase 23.1's ~5.8-6.6x decode speedup does not ship, and nothing tracks that. The open
question is under a STANDING OPERATOR DECISION (2026-08-18, coordinator-directed:
`NATIVE_LZMA_DECODE_ENABLED` stays `false`, no flip without a fresh recurrence and fresh diagnostics).
This plan produces the fresh diagnostics; it does NOT make the decision, flip the shipped constant, or
leave the native test un-skipped.

Output: one fix commit (code + tests + 8 path refs), one measurement commit (driver + captures, no
source change), one docs commit (todo resolution, successor todo, move to `completed/`).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/todos/pending/2026-10-05-native-lzma-depot-decode-is-switched-off-with-no-tracking-todo.md
@.planning/todos/completed/2026-09-12-lzma-sea-real-sized-decode-test-skip-may-now-pass.md

Read only the `## Resolution` section (from line 127) of
`.planning/debug/resolved/sea-native-lzma-real-chunk-decode-hang.md` — the file is large.

Source (read the named ranges only):
- `src/backend/storeManagers/steam/depot/lzmaLoader.ts` L44-97 (kill switch + HOW TO SAFELY RE-ENABLE criteria 1-3), L345-365 (the kill-switch `logWarning` string array)
- `src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts` L190-262 (SEA branch at L215-239)
- `src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts` L1-30, L116-163 (the `lzmaNativeBinding SEA branch` describe — copy its mocking pattern exactly)
- `src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts` L156-251 (beforeAll build, per-test fake profile, test 1 asserting `nativeWorkers` 0), L311-329 (pure-JS test), L406-447 (the skipped native test)
- `src/backend/storeManagers/steam/depot/decompressPoolSelfTest.ts` L79-126 (what the self-test prints and when it exits 0)
- `src/backend/testUtils/fakeHomeProfile.ts` L102-130 (`root`, `env`, `childEnv()`, `registerCapture()`, `dispose()`)
- Driver precedent: `.planning/quick/260930-aof-re-run-phase-38-item-38-w05-sitting-12-l/appimage_smoke.ts` L25-56 (run through `meta/runTs.cjs`; imports `createFakeHomeProfile` via `../../../src/backend/testUtils/fakeHomeProfile`; `__dirname` is NOT the task dir under runTs)

Facts measured at planning time (2026-10-08) — rely on them, re-check only where a step says so:
- The stale debug path occurs 8 times under `src/`, not 2: `lzmaLoader.ts` L62 (doc comment) and L361 (a RUNTIME string inside the kill-switch `logWarning` array); `lzmaNativeSeaRealBuild.test.ts` L52, L215, L277, L393; `decompressPool.test.ts` L803, L936. `decompressPool.test.ts` L965 asserts the logged text with the basename-only regex `/sea-native-lzma-real-chunk-decode-hang\.md/`, so the L361 string must keep the full path as ONE contiguous string element. The test file's own L394-396 says the lzmaLoader.ts reference and it "must be updated together" — so all 8 move together.
- Unit baseline: `npx jest --testPathPattern 'steam/__tests__/(lzmaNativeBinding|decompressPool)\.test|meta/__tests__/(buildSidecarSea|esbuildWorkerBundleShared)\.test'` → 4 suites, 125 tests, all pass.
- `npx prettier --file-info` reports `"ignored": false` (parser typescript) for all five `src/` files this plan edits, and `--check` over them is green at baseline. Every `.planning/` path reports `"ignored": true`.
- `timeout`/`gtimeout` are NOT installed on this Mac. Bounding is done inside the driver (`spawn` + kill timer), never by a shell wrapper.
- `build/` is entirely untracked and also holds `build/locales` (a `src-tauri/tauri.conf.json` L55 resource), `build/renderer`, `build/preload`, icons and entitlements that `pnpm build:sidecar-sea` does NOT regenerate. A literal `rm -rf build` would break the operator's next `tauri dev`/`tauri build`. "Cold" in this plan therefore deletes exactly what `build:sidecar-sea` produces: `build/main/sidecar.js`, `build/main/sidecar-sea-bundle.js`, `build/main/decompressWorker-sea-bundle.js`, `build/sea-config.json`, `build/sidecar-prep.blob`, and `src-tauri/binaries/gamelib-sidecar-*` (keep `src-tauri/binaries/.gitignore`). Do not delete `build/main/decompressWorker.js` (dev worker, a different build).
- The host binary is `src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin`. No `gamelib-sidecar`/`tauri dev` process was running at planning time.
- At planning time the Mac showed `kern.memorystatus_vm_pressure_level: 2` and ~22.9 GB of 24.5 GB swap in use. The 2026-08-18 closure named memory pressure/swapping as an axis it never replicated, so the system snapshots below are evidence, not ceremony.
- `lzma-native` has been pinned at 8.0.6 since `9b7437874` (2026-08-18 12:28), i.e. before the hang was found. Spike 023 (`.planning/spikes/023-sea-native-addon-dlopen/sea-worker-entry.cjs` L25-41) decoded a KNOWN-size alone header via lzma-native 8.0.6 `aloneDecoder` and logged `byteIdentical:true` with the 5.76-6.64x speedups (`run.log`), while `b79765af2`'s message says liblzma 5.2.3 rejects known-size + end-of-stream-marker streams outright. Both cannot be fully true unless the spike fixture's payload lacked an end marker (unverified). This bears on how much weight the speedup figure carries; Task 3 records it as an open tension, not a conclusion.

Executor notes (from operator memory):
- Check for a live app/sidecar with `ps -axo pid,command | grep -E '[g]amelib-sidecar|[t]auri dev'` (the bracket form cannot match its own shell; plain `pgrep -f` false-matches the monitor/shell running it). If anything is running, NOTE it in the SUMMARY and do not kill it — a running `tauri dev` relaunches on every commit and uses `src-tauri/binaries/`.
- Revert by snapshot + `cp`, then prove with `git diff --exit-code`. Do not use `git checkout --` as the revert tool.
- Do not retry a failed native run. A failure is the fresh recurrence the 2026-08-18 decision asked for; the first failing run's captures are the evidence.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Clean up the SEA temp .node on dlopen failure; point all 8 src/ references at the resolved debug doc</name>
  <files>src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts, src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts, src/backend/storeManagers/steam/depot/lzmaLoader.ts, src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts, src/backend/storeManagers/steam/__tests__/decompressPool.test.ts</files>
  <behavior>
    - Test A (RED before the fix): with `node:sea` mocked `isSea: () => true`, `getRawAsset` returning a 4-byte ArrayBuffer, `writeFileSync`/`rmSync` spied as no-ops and `process.dlopen` mocked to throw `new Error('dlopen boom')`, calling the resolver throws `dlopen boom`, and `rmSync` was called exactly once with the exact path `writeFileSync` was called with (first arg of its first call).
    - Test B (RED before the fix): same, but `rmSync` ALSO throws (`new Error('EBUSY')`) — the resolver still throws `dlopen boom` (the cleanup error never masks the dlopen error), and `rmSync` was attempted exactly once.
    - Test C (green before and after — regression pin): success path (`dlopen` no-op) calls `rmSync` exactly once with the written path, and `rmSync`'s `mock.invocationCallOrder[0]` is greater than `dlopen`'s.
  </behavior>
  <action>
RED first. Add Tests A-C inside the existing `describe('lzmaNativeBinding SEA branch', ...)` in
`lzmaNativeBinding.test.ts`, reusing that describe's `afterEach` and copying its existing test's
mocking pattern exactly: `jest.doMock('node:sea', ...)`, load via `jest.isolateModules(() => loadFresh())`,
then spy `writeFileSync`/`rmSync` through `require('node:fs')` (the ESM-namespace spy throws
"Cannot redefine property" under this repo's ts-jest transform — the existing comment says so; keep the
same eslint-disable comments). Run the test filter in `<verify>` and confirm A and B fail and C passes
against the unmodified source; record that RED output in the SUMMARY.

GREEN. In `lzmaNativeBinding.ts`'s SEA branch (the `if (sea && sea.isSea())` block, ~L215-239), wrap
the `process.dlopen(nativeModule, addonPath)` call in `try` and move the EXISTING `rmSync(addonPath)`
call — with its own inner `try`/`catch` and its Windows comment — into the `finally`, so both the
success and the throw paths remove the temp file. Do not add a `catch` around dlopen: the error must
still propagate (lzma-native's import rejects and `lzmaLoader.ts` falls back to pure-JS, unchanged), and
`cachedBinding` must stay unassigned on a throw so a later call retries. Keep the existing Windows
comment verbatim and add one sentence beside it: on the throw path nothing is mapped, so removal
succeeds on every OS; the inner catch exists for the success path on Windows. The `writeFileSync`
call stays outside the `try` (if the write itself throws there is no file to remove, and `rmSync` on a
missing path would only add a second error to swallow).

PATHS. Replace every `src/` reference to the debug doc's pre-move location (the path with no
`resolved/` segment between `.planning/debug/` and the filename) with
`.planning/debug/resolved/sea-native-lzma-real-chunk-decode-hang.md` — all 8 sites listed in
`<context>`, not just the two the todo names (live observation at planning time; the test file's own
comment says the lzmaLoader.ts reference and it move together). For the runtime string at
`lzmaLoader.ts` ~L361, keep the full new path as ONE string element (decompressPool.test.ts L965
matches on it) and keep the logged sentence otherwise identical; you may re-break neighbouring array
elements by hand if the line grows, since prettier will not split a string literal. Re-wrap the
edited comment lines by hand to roughly match their neighbours' width; prettier does not reflow
comments. No other wording changes.

Commit (explicit paths only, never `git add -A`):
`fix(steam): remove the SEA temp .node when process.dlopen throws; repoint 8 stale debug-doc refs`.
  </action>
  <verify>
    <automated>npx jest --testPathPattern 'steam/__tests__/(lzmaNativeBinding|decompressPool)\.test|meta/__tests__/(buildSidecarSea|esbuildWorkerBundleShared)\.test'</automated>
    <automated>git grep -q 'debug/sea-native-lzma' -- src; test $? -eq 1</automated>
    <automated>git grep -c 'debug/resolved/sea-native-lzma-real-chunk-decode-hang.md' -- src > "$TMPDIR/jvw-refs.txt" && test "$(awk -F: '{s+=$NF} END {print s}' "$TMPDIR/jvw-refs.txt")" = 8</automated>
    <automated>pnpm codecheck</automated>
    <automated>npx eslint src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts src/backend/storeManagers/steam/depot/lzmaLoader.ts src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts src/backend/storeManagers/steam/__tests__/decompressPool.test.ts</automated>
    <automated>npx prettier --check src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts src/backend/storeManagers/steam/depot/lzmaLoader.ts src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts src/backend/storeManagers/steam/__tests__/decompressPool.test.ts</automated>
    <automated>git show HEAD:src/backend/storeManagers/steam/depot/lzmaLoader.ts > "$TMPDIR/jvw-loader-head.ts" && test "$(grep -c 'const NATIVE_LZMA_DECODE_ENABLED = false' "$TMPDIR/jvw-loader-head.ts")" = 1</automated>
  </verify>
  <done>4 suites green with 128 tests (125 baseline + 3 new; A and B were observed RED first); zero `src/` references to the pre-move path and exactly 8 to the resolved path; codecheck, eslint and scoped prettier green; committed with the kill switch still `false` at HEAD.</done>
</task>

<task type="auto">
  <name>Task 2: Measure native decode in a real cold-built SEA binary (flip local and uncommitted), then revert, rebuild and prove the shipped state</name>
  <files>.planning/quick/261008-jvw-measure-native-lzma-decode-in-a-real-sea/measure-selftest.ts, .planning/quick/261008-jvw-measure-native-lzma-decode-in-a-real-sea/measurement/</files>
  <action>
All paths are repo-root-relative; run every command from the checkout root. Let TASK be
`.planning/quick/261008-jvw-measure-native-lzma-decode-in-a-real-sea` and OUT be `TASK/measurement`.

STEP 0 — preflight. `git status --short -- src` must be empty (Task 1 committed). Run the
bracket-form `ps` check from `<context>` and record the result. Snapshot `lzmaLoader.ts` and
`lzmaNativeSeaRealBuild.test.ts` into your scratchpad with `cp` (the revert source).

STEP 1 — write the driver `TASK/measure-selftest.ts` (precedent: the appimage_smoke.ts driver named in
`<context>`; run as `node meta/runTs.cjs --bundle --platform=node --target=node22 TASK/measure-selftest.ts <args>`).
Header comment: what it measures, the run command, and why it is isolated-only — the
`GAMELIB_SIDECAR_SELFTEST=decompress-pool` branch never calls `init()` (`src/sidecar/index.ts` L71-75),
so no profile-dependent code is reachable and a real-profile arm would add exposure without coverage
(the two-profile rule's justification, per Skill("gamelib-conventions")). Arguments: `--label`,
`--runs`, `--expect-native-workers`, `--out` (resolve against `process.cwd()`; `__dirname` is a runTs
temp dir). Behaviour:
  a. Locate exactly one `gamelib-sidecar-*` file in `src-tauri/binaries/` (else exit 2). Write the
     header of `OUT/<label>-driver.txt`: ISO timestamp, `git rev-parse HEAD`, `git diff --stat -- src`
     (so the file itself proves whether the flip was present), binary path, size and mtime.
  b. Write `OUT/<label>-system-before.txt`: `uptime`, `sysctl vm.swapusage kern.memorystatus_vm_pressure_level`,
     `vm_stat`, `pmset -g therm`, `top -l 1 -n 15 -o cpu -stats pid,command,cpu,mem` — each through
     `spawnSync` with a 30 s timeout, never throwing.
  c. For each run, sequentially: a FRESH `createFakeHomeProfile({ prefix: 'gamelib-261008-jvw-' })`;
     async `spawn` of the binary with `profile.childEnv({ ...process.env, GAMELIB_SIDECAR_SELFTEST: 'decompress-pool' })`
     and `stdio: ['ignore', 'pipe', 'pipe']`. If still running at 8 s (healthy runs finish in ~2 s;
     the pool's own per-task timeout is 15 s), write `OUT/<label>-run-<i>-system-at-stall.txt` (same
     commands as b) and run `/usr/bin/sample <pid> 5 -file OUT/<label>-run-<i>.sample.txt`
     (spawnSync, 30 s cap) — this is opportunistic evidence and does not by itself fail the run. At
     60 s, SIGKILL. Record wall ms, exit code, signal; parse the `SELFTEST pool=` JSON (`size`,
     `inlineFallback`, `nativeWorkers`) and the `SELFTEST decode=` line. Before disposing, append to
     the run log any lines mentioning `lzma` or `DecompressPool` from `*.log` files under
     `profile.root` (the loader's own once-per-process choice line, if it is logged there). Write
     `OUT/<label>-run-<i>.log` = a one-line run header + stdout + stderr. `profile.dispose()` in
     `finally`.
  d. PASS iff exit code 0, the decode line starts with `SELFTEST decode=ok bytes=65536 match=true`,
     `inlineFallback` is false and `nativeWorkers` equals `--expect-native-workers`. On the first
     non-PASS run: write `OUT/<label>-system-after-fail.txt`, stop (no further runs), exit 1.
  e. Append a per-run table (run, wall ms, exit, nativeWorkers, inlineFallback, decode line) to
     `OUT/<label>-driver.txt` and end it with exactly one line
     `RESULT label=<label> pass=<k>/<n> expectNativeWorkers=<e>` where n is the runs requested. Echo
     the same to stdout. Exit 0 only if k equals n.

STEP 2 — flip (local, uncommitted). With the Edit tool, change the value of the
`NATIVE_LZMA_DECODE_ENABLED` constant in `src/backend/storeManagers/steam/depot/lzmaLoader.ts` (~L97)
from false to true. `git diff --stat -- src` must show exactly one file, one line changed.

STEP 3 — cold build. Delete exactly the SEA build outputs listed in `<context>` (NOT all of
`build/`), then `pnpm build:sidecar-sea > OUT/build-native.txt 2>&1`. All six outputs must exist
again afterwards (that existence after deletion is the proof of cold).

STEP 4 — native runs. Driver with `--label native --runs 20 --expect-native-workers 2 --out OUT`.
20 matches the 2026-09-12 pure-JS baseline (20/20). Three outcomes, record whichever happens:
  - PASS 20/20: native engaged on both workers and `b79765af2` decoded the self-test's VZ chunk
    inside a real SEA binary every time.
  - native engaged but decode failed or stalled: STOP. Do not rerun, do not rebuild, do not attempt
    a fix. The run's log, sample and system snapshots are the evidence. Skip STEP 5; write
    `OUT/jest-skipped-reason.txt` saying why.
  - `nativeWorkers` 0 with the flip in place: the loader fell back to pure-JS, so this run proves
    nothing about `b79765af2`. Pull the loader's fallback reason out of the run log; skip STEP 5 as
    above.

STEP 5 — jest, once (only after a 20/20 PASS). In `lzmaNativeSeaRealBuild.test.ts` (~L429) change
the native test's `test.skip(` to `test(` with the Edit tool, then
`npx jest --testPathPattern lzmaNativeSeaRealBuild > OUT/jest-native.txt 2>&1` (the suite's own
`beforeAll` rebuilds the SEA binary). EXPECTED with the flip: `Tests: 1 failed, 2 passed, 3 total`,
where the ONE failure is test 1's `expect(stats.nativeWorkers).toBe(0)` receiving 2 — that failure
is the positive control proving the flip reached the jest-built binary. The pure-JS-named test passes
while actually running native (it asserts no codec). The native test must pass. Any other shape is a
finding: record it, do not rerun.

STEP 6 — revert and prove. `cp` both snapshots back. `git diff --exit-code -- src` must exit 0 (Task
1 is committed, so ANY diff means the revert is incomplete). Re-run the two HEAD greps from `<verify>`
against the working tree as well (`grep -c` on the files themselves).

STEP 7 — control rebuild, which also restores the shipped-state binary for the operator. Delete the
same SEA outputs, `pnpm build:sidecar-sea > OUT/build-control.txt 2>&1`, then the driver with
`--label control --runs 3 --expect-native-workers 0 --out OUT`. It must PASS 3/3. If the control
fails, that is a pure-JS recurrence — capture, do not rerun, report it prominently.

STEP 8 — leak scan (the `<verify>` block's grep over OUT must find nothing). Then stage ONLY
`TASK/measure-selftest.ts` and `OUT/`; `git diff --cached --name-only` must list nothing outside
TASK. Commit: `docs(quick-261008-jvw): measure native lzma decode in a real SEA binary (kill switch untouched)`.

Prettier: every path this task writes is under `.planning/`, which prettier ignores (`--file-info`
reports `"ignored": true`), so a `--check` here would be vacuous; the `<verify>` block records that
probe instead of a check, per the gamelib-conventions formatter rule.
  </action>
  <verify>
    <automated>git show HEAD:src/backend/storeManagers/steam/depot/lzmaLoader.ts > "$TMPDIR/jvw-loader-head.ts" && test "$(grep -c 'const NATIVE_LZMA_DECODE_ENABLED = false' "$TMPDIR/jvw-loader-head.ts")" = 1</automated>
    <automated>git show HEAD:src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts > "$TMPDIR/jvw-sea-test-head.ts" && test "$(grep -c "test.skip('the REAL compiled SEA binary correctly decodes a real-sized (64KB) chunk via the NATIVE path" "$TMPDIR/jvw-sea-test-head.ts")" = 1</automated>
    <automated>git diff --exit-code -- src</automated>
    <automated>grep -q '^RESULT label=native pass=' .planning/quick/261008-jvw-measure-native-lzma-decode-in-a-real-sea/measurement/native-driver.txt</automated>
    <automated>grep -q '^RESULT label=control pass=3/3 expectNativeWorkers=0' .planning/quick/261008-jvw-measure-native-lzma-decode-in-a-real-sea/measurement/control-driver.txt</automated>
    <automated>test -s .planning/quick/261008-jvw-measure-native-lzma-decode-in-a-real-sea/measurement/jest-native.txt || test -s .planning/quick/261008-jvw-measure-native-lzma-decode-in-a-real-sea/measurement/jest-skipped-reason.txt</automated>
    <automated>! grep -rEl 'galaxyUserId|refresh_token|access_token|steamLoginSecure|accountName' .planning/quick/261008-jvw-measure-native-lzma-decode-in-a-real-sea/measurement</automated>
    <automated>npx prettier --file-info .planning/quick/261008-jvw-measure-native-lzma-decode-in-a-real-sea/measure-selftest.ts | grep -Eq '"ignored":[[:space:]]*true'</automated>
  </verify>
  <done>`native-driver.txt` ends in a RESULT line and every run's `nativeWorkers` + decode line is on disk (or the first failure is, with its sample and system snapshots); `jest-native.txt` shows the expected 1-failed/2-passed shape with the native test passing, or a reason file explains why it was skipped; the source tree under `src/` is byte-identical to HEAD; the control build reports 3/3 at `nativeWorkers:0`, so the binary left on disk is shipped-state; committed with only task-dir paths staged.</done>
</task>

<task type="auto">
  <name>Task 3: Record the resolution, file the successor decision todo, move the original to completed, and give the operator a recommendation</name>
  <files>.planning/todos/pending/2026-10-05-native-lzma-depot-decode-is-switched-off-with-no-tracking-todo.md, .planning/todos/completed/2026-10-05-native-lzma-depot-decode-is-switched-off-with-no-tracking-todo.md, .planning/todos/pending/2026-10-08-native-lzma-decode-reenable-or-delete-needs-operator-decision.md</files>
  <action>
RESOLUTION. Append `## Resolution (2026-10-08)` to the 2026-10-05 todo, matching the sibling's
(2026-09-12) plain-table style. It must contain:
  1. A measurement table: native direct runs (k/20 or runs-until-failure, `nativeWorkers`,
     `inlineFallback`, decode line, exit codes, wall-ms range), the jest run (per-test outcome,
     including test 1's expected `nativeWorkers` failure as the positive control), control direct
     runs (3/3 at `nativeWorkers:0`), HEAD SHA measured, and the memory-pressure level and swap
     figures from `native-system-before.txt`.
  2. One plain sentence: "`b79765af2` works end-to-end in a real compiled SEA binary: YES / NO /
     UNDETERMINED (native did not engage)", with the evidence it rests on.
  3. What is NOT claimed: the self-test decodes a synthetic 64 KiB filler through the real
     VZ/AES/SHA-1 pool path, not real Steam depot bytes; darwin-arm64 only (linux-x64/win32-x64 native
     loading was never verified, 23.1-01 Assumption A2); one machine; a non-recurrence is not a root
     cause for the 2026-08-18 hang; the speedup was not re-measured.
  4. The updated non-recurrence tally with the configuration split: 2026-08-18 40 runs (both
     codecs), 2026-09-12 20 direct + 5 jest (pure-JS), today's native and control runs. State which
     of those exercised native with `b79765af2` in the build — only today's.
  5. The open provenance tension from `<context>` (spike 023 decoded a known-size header
     byte-identically on lzma-native 8.0.6 vs `b79765af2`'s claim that liblzma 5.2.3 rejects that
     shape), stated as unresolved, with its consequence: the 5.8-6.6x figure has not been measured
     through the post-`b79765af2` adapter.
  6. What this task fixed: the dlopen temp-file leak (Task 1's commit SHA) and the 8 stale paths.
Also, in the todo's frontmatter `files:` list, replace the stale debug-doc entry with the `resolved/`
path.

RECOMMENDATION (also goes verbatim into the SUMMARY and into your final output). Weigh: ~5.8-6.6x
real-chunk speedup (23.1-01-SUMMARY.md line 13, with the tension above), decode being the binding
install constraint (23.1-04-PLAN.md L61-62: network flat at ~150-280 ms/chunk, pure-JS decode ~5-7
MB/s per thread), the tally, and today's result. Pick the branch that matches the measurement:
  - 20/20 PASS + native jest test PASS: recommend RE-ENABLE through a dedicated follow-up, contingent
    on the operator explicitly REVISING the 2026-08-18 standing decision — its literal precondition
    (a fresh recurrence) has not happened and cannot be manufactured. Walk the lzmaLoader.ts "HOW TO
    SAFELY RE-ENABLE" checklist: criterion 1 — the debug doc is `status: resolved` but
    `resolution_type: closed_unreproduced` with root cause UNKNOWN, so it is met by its letter but not
    by its "understood root cause" clause: operator's call. Criterion 2 — met by today's run (cite the
    numbers). Criterion 3 — NOT met: the native test passed locally today but stays skipped; flipping
    the constant must also change test 1's `nativeWorkers` assertion from 0 to the pool size in the
    same commit (measured today: it fails otherwise); and a live Steam depot install end-to-end on the
    operator's Mac is still required — use it to re-measure native vs pure-JS decode throughput, which
    settles the speedup tension. Say plainly that if the operator will not revise the decision this
    milestone, deleting the native path beats keeping dormant code (the original todo's concern), and
    name at minimum what deletion touches: `lzmaNativeBinding.ts`, the native adapter and kill switch
    in `lzmaLoader.ts`, the node-gyp-build alias and SEA asset embedding in `meta/buildSidecarSea.ts` /
    `meta/esbuildWorkerBundleShared.ts`, the `lzma-native` dependency, and their tests.
  - Native engaged but decode failed or stalled: this IS the fresh recurrence with fresh diagnostics
    the standing decision asked for. Recommend: do NOT re-enable and do NOT delete yet — open
    `/gsd-debug` seeded with the captured run log, `sample` output and system snapshots.
  - Native did not engage: today's run says nothing about `b79765af2`; recommend a desk
    investigation of the loader's fallback reason (re-enabling would be a silent no-op until it is
    fixed).

SUCCESSOR TODO. Create `.planning/todos/pending/2026-10-08-native-lzma-decode-reenable-or-delete-needs-operator-decision.md`
mirroring the original's frontmatter shape (`created`, `title`, `area: steam`, then `severity:`,
`platform:`, `ready:` — bare, lowercase, in that order, per Skill("gamelib-conventions"), then
`found_by` and `files`). Values: `severity: medium`; for the PASS branch `platform: any` and
`ready: human` (the blocker is the operator's decision); for either failure branch `platform: macos`
and `ready: code` (a desk-reproducible SEA failure on the operator's Mac). Body: the decision (or
the debug ask), a link to the completed todo's Resolution section and to TASK, and the
recommendation in two or three lines. Run `pnpm planning-gates`; if it fails, fix the successor's
frontmatter — never the gate's vocabulary.

MOVE. Only once the successor exists and `pnpm planning-gates` is green — that is the clean hand-off
this plan's brief requires, because moving the original without a tracker recreates the exact
"nothing tracks it" problem the todo was filed for — `git mv` the 2026-10-05 todo from
`.planning/todos/pending/` to `.planning/todos/completed/`. If the successor cannot be made to pass
the gate, leave the original in `pending/` and say so.

Commit only these three todo paths: `docs(quick-261008-jvw): resolve the native-lzma kill-switch todo; hand the re-enable decision to the operator`.

Prettier: all three paths are under `.planning/` and ignored, so `--check` would be vacuous — match
the surrounding todo corpus by hand (wrap width, table style, key order).
  </action>
  <verify>
    <automated>test "$(grep -c '^## Resolution (2026-10-08)' .planning/todos/completed/2026-10-05-native-lzma-depot-decode-is-switched-off-with-no-tracking-todo.md)" = 1</automated>
    <automated>test ! -e .planning/todos/pending/2026-10-05-native-lzma-depot-decode-is-switched-off-with-no-tracking-todo.md</automated>
    <automated>grep -Eq '^ready: (human|code)$' .planning/todos/pending/2026-10-08-native-lzma-decode-reenable-or-delete-needs-operator-decision.md</automated>
    <automated>pnpm planning-gates</automated>
    <automated>git show HEAD:src/backend/storeManagers/steam/depot/lzmaLoader.ts > "$TMPDIR/jvw-loader-head.ts" && test "$(grep -c 'const NATIVE_LZMA_DECODE_ENABLED = false' "$TMPDIR/jvw-loader-head.ts")" = 1</automated>
    <automated>git show HEAD:src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts > "$TMPDIR/jvw-sea-test-head.ts" && test "$(grep -c "test.skip('the REAL compiled SEA binary correctly decodes a real-sized (64KB) chunk via the NATIVE path" "$TMPDIR/jvw-sea-test-head.ts")" = 1</automated>
    <automated>npx prettier --file-info .planning/todos/pending/2026-10-08-native-lzma-decode-reenable-or-delete-needs-operator-decision.md | grep -Eq '"ignored":[[:space:]]*true'</automated>
  </verify>
  <done>The completed todo states, in one sentence backed by the table, whether `b79765af2` works end-to-end in a real SEA binary; the successor pending todo carries valid triage keys and planning-gates is green; the original is in `completed/`; HEAD still ships the kill switch `false` and the native test skipped; the SUMMARY and the final output carry the operator recommendation for the branch the measurement landed in.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| working tree -> commit | A temporary measurement flip of a shipped safety switch lives in the tree during Task 2 |
| sidecar child -> committed captures | Stdout/stderr of a spawned sidecar binary is written into a committed `.planning/` directory |
| SEA process -> `os.tmpdir()` | The SEA branch writes an executable `.node` into a world-writable directory |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261008-jvw-01 | Tampering | `lzmaLoader.ts` kill switch / native `test.skip` | high | mitigate | No commit happens while the flip exists (Task 2 commits only after STEP 6); revert by snapshot `cp`; `git diff --exit-code -- src` plus positive `git show HEAD:` greps for `= false` and `test.skip(` in Tasks 1, 2 and 3; Task 2 stages only task-dir paths and checks `git diff --cached --name-only` |
| T-261008-jvw-02 | Information disclosure | `measurement/` captures | medium | mitigate | Fresh `createFakeHomeProfile()` per run, disposed in `finally`; the self-test branch never calls `init()`, so no store session is loaded; leak-scan grep over `measurement/` before commit |
| T-261008-jvw-03 | Elevation of privilege | SEA temp `.node` in `os.tmpdir()` | low | mitigate | Task 1's `finally` removes the file on the dlopen-throw path too; the unpredictable pid+random name (T-23.1-03-01) and `0o600` mode are unchanged |
| T-261008-jvw-04 | Denial of service | hung sidecar during measurement | medium | mitigate | Driver kills each run at 60 s (pool task timeout 15 s, jest per-test 30 s); stall sampling at 8 s is bounded at 30 s; no shell `timeout` dependency |
| T-261008-jvw-05 | Denial of service | operator's local build tree | medium | mitigate | Cold step deletes only the six SEA outputs, never `build/` wholesale (keeps `build/locales`, `build/renderer`, `build/preload`); the control rebuild leaves a shipped-state sidecar binary on disk, proven at `nativeWorkers:0` |
| T-261008-jvw-SC | Tampering | npm/pip/cargo installs | high | accept | No package is installed or upgraded by this plan; `lzma-native@8.0.6` is already exact-pinned (`9b7437874`) |
</threat_model>

<verification>
- `git show HEAD:` greps: the kill switch is `false` and the native test is `test.skip(` after every commit in this plan.
- `git diff --exit-code -- src` is clean at the end.
- The 4-suite unit filter is green (128 tests); codecheck, eslint and scoped prettier are green on the five `src/` files.
- `measurement/native-driver.txt` and `measurement/control-driver.txt` each end with a RESULT line; control is `pass=3/3 expectNativeWorkers=0`.
- `pnpm planning-gates` is green with the successor todo in `pending/`.
</verification>

<success_criteria>
- The dormant native path no longer leaks a temp `.node` when `dlopen` throws, proven by tests that were RED first.
- Whether `b79765af2` decodes end-to-end inside a real compiled SEA binary is answered by measurement (YES / NO / UNDETERMINED) and written down with its evidence and limits.
- Nothing about the shipped behaviour changed: kill switch `false`, native test skipped, shipped-state binary on disk.
- The operator decision is tracked by a pending todo, and the recommendation covers the re-enable checklist (criteria 1-3, criterion 3 needing a live Steam depot install) against delete.
</success_criteria>

<output>
Create `.planning/quick/261008-jvw-measure-native-lzma-decode-in-a-real-sea/261008-jvw-SUMMARY.md` when done. It must include: Task 1's RED output, the measurement table, the one-sentence `b79765af2` verdict, any process found running at STEP 0, and the operator recommendation verbatim.
</output>
