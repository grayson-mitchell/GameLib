---
slug: bootstrapwirings-log-drop
status: resolved
trigger: "bootstrapWirings protocol-url log assertion fails ~1 in 8 full-suite runs"
created: 2026-09-08
updated: 2026-09-08
source_todo: .planning/todos/pending/2026-09-06-bootstrapwirings-protocol-url-log-assertion-drops-under-load.md
---

# bootstrapWirings protocol-url log assertion drops under load

## Symptoms

(Prefilled from the source todo — the operator directed "action todo", all five symptom
fields are already recorded there. Not re-gathered by interview.)

- **Expected behavior:** `bootstrapWirings.test.ts` "Test A (behaviour, real log file):
  deliverStartupProtocolUrl makes the real LogWriter write the [ProtocolHandler] Received
  line" passes on every full-suite run.
- **Actual behavior:** the test fails in ~1 of 8 full `npx jest --selectProjects Backend`
  runs. Reproduced in BOTH of two independent 8-run loops taken ~14 hours apart on the same
  tree, so it is not a one-off.
- **Error messages:** `FAIL Backend src/backend/sidecar/__tests__/bootstrapWirings.test.ts`
  on that test. The same run also emits `Cannot log after tests are done. Did you forget to
  wait for something async in your test?` — the todo flags this as genuine signal (async work
  outliving the test), not noise.
- **Timeline:** observed 2026-09-06 during the post-fix measurement loops of debug session
  `anticheat-response-frame-drop`.
- **Reproduction:** repeated full-project runs: `npx jest --selectProjects Backend`.

## Current Focus

- **hypothesis (PRIMARY, H2):** `LogWriter` **archives the Received line away**, so the poll
  can never succeed and always burns its full deadline. `writeString`
  (`log_writer.ts:119-127`) gates the rotate on `if (!this.#wasWrittenTo)` and calls the
  SYNCHRONOUS `#archiveOldLogFile()` → `renameSync(logFilePath, logFilePath + '.old')`. But
  `#wasWrittenTo` is only set true at line 149, AFTER `await fsPromises.appendFile(...)`
  RESOLVES. The kernel creates the file when the appendFile syscall runs, which is strictly
  earlier than the JS continuation that flips the flag. Any other `writeString` entering that
  window sees `#wasWrittenTo === false` AND `existsSync(logFilePath) === true`, and renames
  the live log — including anything already written into it — to `.old`.

  Concretely, with boot line A and the Received line B both in the false-window:
  - B wins the race: B's appendFile creates the file containing B → A enters, sees the file,
    `renameSync` moves **B's content to `.old`** → A appends to a fresh log. `logFilePath`
    now holds A only. The Received line is GONE from the polled file, permanently. The
    `waitFor` predicate can never become true, so it spins to its deadline. ✗ FAIL
  - A wins the race: A's content is archived instead and B lands in the fresh log. ✓ PASS

  That is a coin-flip decided by libuv threadpool completion order — exactly the load
  dependence reported, and it explains ABSENCE (not lateness) of the line, which a purely
  slow-I/O theory does not. The archive check sits BEFORE the `await this.#messageWaitPromise`
  serialization (line 130), so the serial write queue does NOT protect it.

  This would be a **production defect, not just a test defect**: sidecar boot log lines can be
  silently moved to `gamelib.log.old` whenever several fire-and-forget log calls race the
  first write.
- **hypothesis (SECONDARY, H1):** zero-headroom timeout race — `waitFor`'s default
  `timeoutMs = 5000` equals jest's default per-test timeout, and the test's clock starts
  ~180ms earlier, so jest's deadline always fires first and `waitFor`'s own error message is
  unreachable dead code. This does not by itself CAUSE the failure, but it is why the failure
  reports as a bare jest timeout with no diagnostic — and it is a real (if lesser) defect
  regardless of H2.
- **test:** (a) finish the 8-run base-rate loop, counting per-SUITE not by run exit code (the
  `electronUntouched` red below contaminates run-level counts); (b) capture the VERBATIM
  failure text — "Exceeded timeout of 5000 ms" vs "waitFor: condition not met"; (c) decisive
  test for H2: assert on `logFilePath + '.old'` — if H2 holds, a failing run leaves the
  Received line sitting in the `.old` sibling; (d) drive `LogWriter` directly with two racing
  `logInfo` calls to reproduce the rename deterministically, without jest load.
- **expecting:** H2 predicts the Received line is present in `${logFilePath}.old` and absent
  from `logFilePath` on a failing run, and that the failure text is jest's "Exceeded timeout
  of 5000 ms" (never `waitFor: condition not met`, per H1).
- **OUTCOME — H2 CONFIRMED, H1 confirmed as a lesser diagnosis defect.** The direct
  `LogWriter` race repro (path (d)) fired on unmodified code and the mutation check holds. See
  Resolution. Path (a) completed with a 0/8 reproduction rate for the ORIGINAL flake, so paths
  (b) and (c) never got a failing run to read — the honest limit is recorded in Resolution.
- **next_action:** none — session resolved. If the flake recurs, go straight to path (c):
  assert on `${logFilePath}.old`.
- **reasoning_checkpoint (kept, and it paid off):** H2 was reached by reading the write path
  and was NOT treated as established until the direct race repro fired. The competing benign
  reading recorded here — "if `init()`'s first appendFile always resolves before
  `deliverStartupProtocolUrl` is called, H2 cannot fire" — is still live, and is precisely why
  the Resolution does not claim H2 caused the two 2026-09-06 observations. Separately, the
  first attempt at the H2 fix was WRONG in a way this checkpoint did not anticipate: it
  conflated the rotate gate with the `mkdir` gate and regressed 17 suites. Confirming a root
  cause did not make the first remedy correct — cf. memory
  `a-todos-measurement-can-be-sound-and-its-remedy-wrong`.

## Evidence

- timestamp: 2026-09-08 — **Baseline, file in isolation.** `npx jest --selectProjects Backend
  --runTestsByPath src/backend/sidecar/__tests__/bootstrapWirings.test.ts --verbose` → 13/13
  pass, 2.524s wall. Test A itself: **223 ms**. Every other test in the file sits at 180–225 ms
  too, so essentially all of Test A's 223 ms is the shared `setupIsolatedBootstrap()`
  `isolateModules` require; the `waitFor` poll contributes ~40 ms at most. Reaching the 5000 ms
  deadline therefore needs a ~22x slowdown.
- timestamp: 2026-09-08 — **`--selectProjects Backend` verified non-vacuous** (memory
  `jest-selectprojects-is-case-sensitive-and-exits-zero`: it fails OPEN). Full run reports
  `Test Suites: 207 total`, `Tests: 4654 total`. Not a run that selected nothing.
- timestamp: 2026-09-08 — **The poll ALREADY EXISTS.** The source todo's suggested next step
  ("if it awaits a fixed `setTimeout`/`setImmediate` chain before asserting, remedy is to
  poll") is already shipped: `bootstrapWirings.test.ts:492` awaits `waitFor(...)` polling the
  log file CONTENT, and its docstring (line 186-188) states it exists precisely because "a
  fixed number of setImmediate ticks cannot reliably bound" real I/O. The todo's prescribed
  remedy is therefore not the open work — cf. memory
  `a-todos-prescribed-fix-can-already-be-shipped`.
- timestamp: 2026-09-08 — **The zero-headroom race.** `waitFor` (line 189-191) defaults
  `timeoutMs = 5000, intervalMs = 20`. `src/backend/jest.config.js` sets no `testTimeout`, so
  jest's per-test default is also 5000 ms. Contrast the pattern the todo itself cites as the
  model: `enrichmentFlows.test.ts`'s `waitForResponse(frames, id, timeoutMs = 3000)` — 3000 <
  5000 deliberately leaves headroom so the poll reports a useful error before jest kills the
  test.
- timestamp: 2026-09-08 — **Write path is serialized real I/O.** `LogWriter.writeString`
  (`src/backend/logger/log_writer.ts:106-150`) awaits `this.#messageWaitPromise` — a serial
  chain across ALL queued messages — then `await fsPromises.appendFile(...)` (line 148), real
  libuv-threadpool I/O. `init()` queues its own boot diagnostics ahead of the ProtocolHandler
  line, so the assertion waits on N serialized threadpool round-trips, not one. `formatter.ts`
  is microtask-only, so it is not the slow part.
- timestamp: 2026-09-08 — **Load slowdown measured.** Under a full 207-suite run the
  `bootstrapWirings.test.ts` FILE took 7.876s vs 2.524s in isolation (~3.1x) in run 1, and
  under 5s in run 2. So load does stretch this file materially, but a 3x file-level stretch is
  still well short of the 22x Test A would need — tail latency, not mean, is the open question.
- timestamp: 2026-09-08 — **UNRELATED DETERMINISTIC RED FOUND AT HEAD (not this todo).**
  Runs 1 and 2 both failed with `Tests: 1 failed`, but the failing suite was
  `electronUntouched.test.ts`, NOT bootstrapWirings — bootstrapWirings PASSED in both. The
  failing assertion is a by-construction source gate: "keyringTokenStore.ts and bootstrap.ts
  never reference configStore/TOKEN_STORE_KEY/TOKEN_PREFIX". `bootstrap.ts:91` now has
  `import { configStore } from '../constants/key_value_stores'`, added TODAY by
  `204025b39 2026-09-08 feat(quick-260908-fre): restore boot-time Epic/GOG user
  reconciliation`. This is a pure source-text read, therefore deterministic, not a flake, and
  it is not tracked in `.planning/todos/pending/`. It also contaminates any "N runs failed"
  count for this session — the bootstrapWirings rate must be counted per-SUITE, not from the
  run-level exit code.

## Eliminated

- hypothesis: "Test A waits on a fixed delay before asserting" (the source todo's stated
  suspicion and prescribed remedy).
  why: refuted by direct read — Test A already polls via `waitFor` on the file's CONTENT, and
  the helper was written for exactly this reason. The defect, if the poll is at fault, is the
  poll's DEADLINE having no headroom under jest's own, not the absence of a poll.

## Resolution

- **root_cause:** `LogWriter.writeString`'s one-time rotate gate was open for the whole
  duration of the first write. `if (!this.#wasWrittenTo) { this.#archiveOldLogFile() ... }`
  guarded a SYNCHRONOUS `renameSync(logFilePath, logFilePath + '.old')`, but `#wasWrittenTo`
  was only set to `true` after `await fsPromises.appendFile(...)` RESOLVED. The append's bytes
  reach the file when libuv dispatches the syscall on a threadpool thread; the continuation
  that flipped the flag ran only once the event loop picked the completion up. Every
  `writeString` entering in that gap saw `#wasWrittenTo === false` and an existing file, and
  renamed the live log — with everything already written into it — to `.old`.

  No production caller awaits `logXXX()`, so overlapping entry is the normal case, and the
  gap's width is set by OS scheduling, which is what makes the symptom load-dependent.

  Applied to the reported test: `protocol.ts:61` logs `Received <url>` and `protocol.ts:117`
  logs `Could not receive game data for ...` back-to-back on the runner-less missing-game path
  the test drives. If `init()`'s first boot append is still unresolved when line 117 enters,
  line 117 rotates the file and carries line 61's `Received` line into `.old`. The polled
  `logFilePath` can then never contain it, so `waitFor` burns its full deadline — the line is
  ABSENT, not merely late, which a slow-I/O theory does not explain. Jest kills the test at
  its own 5000 ms while the writes are still in flight, producing the reported "Cannot log
  after tests are done" warning.

- **fix:**
  1. `src/backend/logger/log_writer.ts` — claim the rotation synchronously (`#wasWrittenTo =
     true` as the first statement inside the gate, before any `await`), making the rotate
     exactly-once per writer, which is what the constructor docstring already described as
     intended. Removed the now-redundant post-append assignment.
  2. Same file — split directory creation out of that gate into a memoized
     `#ensureLogDirectory()` awaited by EVERY write. Required: the first attempt at (1) alone
     regressed 17 suites / 38 tests with `ENOENT` on `appendFile`, because closing the gate
     early also stopped subsequent writes from awaiting the shared `mkdir`. Rotation must
     happen once; the directory must be awaited by all of them.
  3. `src/backend/sidecar/__tests__/bootstrapWirings.test.ts` — `jest.setTimeout(20000)`.
     DIAGNOSIS QUALITY ONLY, explicitly not a flake remedy: `waitFor`'s 5000 ms default
     equalled jest's per-test default while each test burns ~200 ms of setup first, so jest's
     deadline always won and `waitFor`'s message was unreachable dead code. Raising the
     ceiling (rather than lowering `waitFor`, which would tighten the i18next poll that
     legitimately takes ~800 ms cold and ~2.4 s under load) lets the poll lose on its own
     terms and name the predicate that never came true. Tests still fail at 5 s.

- **verification:**
  - New RED-first regression test in `logWriter.test.ts` reproduced the drop deterministically
    on unmodified code (`.old` created, first line gone), with a serialized negative control
    passing — proving the interleaving is the cause, not the held append. It holds the
    `appendFile` resolution for a fixed span to widen a window that is real but OS-scheduled;
    the three pre-existing tests in that file all `await` their single write, which is exactly
    why they never caught this.
  - Mutation: moving `#wasWrittenTo = true` back after the append (keeping the `mkdir` fix)
    turns that one test RED again and leaves the other four green. The fix is load-bearing and
    the test is specific to it.
  - Full Backend suite: `Tests: 1 failed, 2 skipped, 4653 passed, 4656 total` — back to the
    pre-change baseline. The single failure is `electronUntouched.test.ts`, the unrelated
    deterministic red at HEAD recorded in Evidence, which failed identically in all 8 baseline
    runs before any edit. Test total rose 4654 → 4656 (the two new tests).
  - `tsc --noEmit` exit 0; `eslint` 0 errors and 0 new warnings on the changed files; prettier
    clean.

- **HONEST LIMIT ON THIS RESULT:** the reported ~1-in-8 flake did **not** reproduce here —
  `bootstrapWirings.test.ts` PASSED in 8/8 full Backend runs before any change was made (it
  did stretch to 5.6–7.9 s under load vs 2.5 s isolated, confirming genuine load sensitivity).
  So there is no before/after rate comparison and no captured failing run to inspect. What is
  established is that the `LogWriter` rotation race is REAL, reproducible on demand, and
  supplies a complete mechanism for the exact reported symptom. What is NOT established is
  that it was the cause of those specific two observations. If the failure recurs, the
  decisive check is now cheap and is recorded in the todo: assert on `${logFilePath}.old`.

- **files_changed:**
  - `src/backend/logger/log_writer.ts`
  - `src/backend/logger/__tests__/logWriter.test.ts`
  - `src/backend/sidecar/__tests__/bootstrapWirings.test.ts`

- **wider blast radius (not test-only):** this was a production log-loss defect. Any
  fire-and-forget log line racing the first write of a `LogWriter` could be moved to
  `gamelib.log.old` and vanish from `gamelib.log`. Sidecar boot is the densest such burst, so
  boot diagnostics were the most exposed — which also means past investigations that read
  `gamelib.log` and found an expected boot line missing may have been reading a truncated file.
