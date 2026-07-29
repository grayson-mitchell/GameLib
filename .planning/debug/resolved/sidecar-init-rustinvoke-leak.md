---
slug: sidecar-init-rustinvoke-leak
status: resolved
trigger: "sidecar init() emits unawaited rustInvoke frames (tray_set_icon, keyring_get) as startup side effects — causes a deterministic failure in src/backend/sidecar/__tests__/rustInvokeChannel.test.ts and an arbitrary-suite \"rustInvoke timed out after 60000ms: keyring_get\" flake under jest --runInBand"
created: 2026-07-29
updated: 2026-07-29
origin: Phase 34.4.1 plan 08 Task 1 — `npm run test:ci` exit 1 blocks the plan's own acceptance criterion
---

# Debug: sidecar `init()` rustInvoke startup leak

## Symptoms

Prefilled from evidence measured directly on 2026-07-29 (orchestrator ran the repro before
opening this session), not from a user interview. The developer is remote and cannot drive
local hardware; every item below is a captured observation.

**1. Expected behavior**
- `npm run test:ci` exits 0.
- `src/backend/sidecar/__tests__/rustInvokeChannel.test.ts` behavior 1 ("writes a single
  well-formed rustInvoke frame for an allowlisted channel") sees exactly ONE `rustInvoke`
  frame on the output stream — the `keyring_get` frame its own
  `requestRustInvoke(RUST_KEYRING_GET, [])` call emits.

**2. Actual behavior**
- `npm run test:ci` exits **1**, consistently, with 2 failures out of 3095 tests.
- `rustInvokeChannel.test.ts` behavior 1 sees **TWO** `rustInvoke` frames — its own
  `keyring_get` plus an unexpected `tray_set_icon` with args `[{"dark":false}]`.
- Separately, ONE OTHER suite fails per run with
  `rustInvoke timed out after 60000ms: keyring_get`, and **which** suite it lands on varies
  between runs.

**3. Error messages** (verbatim, isolated run)
```
● sidecar->Rust rustInvoke channel (transport shape, Rust side stubbed)
  › writes a single well-formed rustInvoke frame for an allowlisted channel

  expect(received).toHaveLength(expected)

  Expected length: 1
  Received length: 2
  Received array:  [
    "{\"id\":\"25aaf31b-...\",\"kind\":\"rustInvoke\",\"channel\":\"keyring_get\",\"args\":[]}",
    "{\"id\":\"f5f5d910-...\",\"kind\":\"rustInvoke\",\"channel\":\"tray_set_icon\",\"args\":[{\"dark\":false}]}"
  ]

    70 |
    71 |     const rustInvokeLines = lines.filter((line) => line.includes('"kind":"rustInvoke"'))
  > 72 |     expect(rustInvokeLines).toHaveLength(1)
       |                             ^
    73 |     const parsed = JSON.parse(rustInvokeLines[0])

  at Object.<anonymous> (src/backend/sidecar/__tests__/rustInvokeChannel.test.ts:72:29)

Test Suites: 1 failed, 1 total
Tests:       1 failed, 7 passed, 8 total
Time:        0.922 s
```
Also emitted during the run: `[sidecar] dropped malformed request frame`.

Victim-suite signature (full-suite runs only): `rustInvoke timed out after 60000ms: keyring_get`

**4. Timeline**
- Carried since **Phase 34.1** and repeatedly deferred as "the Phase 34.1 tray cross-test
  frame leak, out of scope". Named in the `34.4.1-06` and `34.4-10` SUMMARYs as a flake that
  "can land on an arbitrary suite".
- Never diagnosed, because it was assumed to be a cross-test pollution artifact rather than a
  reproducible single-suite defect.
- Victim suites observed across runs so far: `downloadqueue.test.ts`,
  `shellFilesFlows.test.ts`, `settingsFlows.test.ts`, `tray_icon.test.ts`. Treat the victim
  set as unbounded — do NOT build an allowlist of expected-failing filenames.

**5. Reproduction**
- **Deterministic, isolated, sub-second:**
  `npx jest src/backend/sidecar/__tests__/rustInvokeChannel.test.ts`
  Fails every time. This is the key new finding — it does NOT require the full suite.
- Full-suite flake: `npm run test:ci` (= `jest --runInBand --silent`).

## Findings so far (orchestrator, pre-session)

Established, with confidence levels stated honestly:

**PROVEN.** The stray `tray_set_icon` frame originates from `init()`, the sidecar bootstrap.
The failing test body is minimal — `init(input, output)` followed by one
`requestRustInvoke(RUST_KEYRING_GET, [])` — so `init()` is the only possible source of a
second frame. It reproduces in isolation with no other suite loaded, which rules out
cross-test mock leakage as the cause of THIS failure.

**STRONG INFERENCE, NOT PROVEN.** The arbitrary-suite victim failures share the root cause.
`test:ci` runs `jest --runInBand`, i.e. every suite in ONE shared process. If `init()` emits
an unawaited `keyring_get` rustInvoke that nothing ever answers, its 60s timeout rejects
later — landing on whichever suite happens to be executing when the timer matures. That
matches the victim signature exactly (`rustInvoke timed out after 60000ms: keyring_get`) and
explains why the victim varies run to run. **This link still needs to be proven, not
assumed.**

**Mechanism hypothesis to test.** `init()` performs startup wiring with fire-and-forget
`rustInvoke` side effects — at minimum a tray colour set (`tray_set_icon`, args
`[{"dark":false}]`, consistent with `changeTrayColor`) and a keyring read (`keyring_get`).
Under Jest there is no Rust process to answer them, so they stay pending until the 60s
timeout. Relevant prior art in this repo: Electron `app.whenReady()` initializers are NOT
auto-run in the sidecar, so anything that looks uninitialised there is a real finding rather
than a test-setup problem.

## Current Focus

reasoning_checkpoint:
  hypothesis: |
    There is exactly ONE genuine startup-side-effect leak, not two. `registerAppShellFlows()`
    (src/backend/sidecar/appShellFlowRegistration.ts:317) calls `setImmediate(syncTrayIcon)`
    UNCONDITIONALLY at module scope — this runs once per test FILE (Jest resets the module
    registry per file, and `handlers.ts`/`appShellFlowRegistration.ts` are only evaluated
    once), completely decoupled from any specific `init()` call. `sidecarRpc.ts`'s
    `outputStream` (src/backend/sidecar/sidecarRpc.ts:89) is a single module-level mutable,
    reassigned by every `startRpcServer()` call. Because the deferred `syncTrayIcon()`
    callback fires in the Node "check" phase — after the *first* `it` block's synchronous
    `init(input, output)` call has already reassigned `outputStream` to ITS PassThrough, but
    before that same test's `await flush()` resolves — the stray `tray_set_icon` frame lands
    on whichever test happened to run first and is asserting frame counts.
    `init()` itself (bootstrap.ts) does NOT call `keyring_get` automatically anywhere —
    `installTokenStore(new SidecarKeyringTokenStore())` only swaps the class instance; no
    constructor or init()-owned code path calls `.getToken()`/`.isAvailable()`. The roaming
    "keyring_get" timeout is a KNOCK-ON EFFECT of the SAME tray leak, not an independent
    second leak: in rustInvokeChannel.test.ts behavior 1, `expect(rustInvokeLines)
    .toHaveLength(1)` (line 72) throws BEFORE the test reaches its own cleanup line
    (`input.write(...)` at line 81) that would otherwise settle its own
    `requestRustInvoke(RUST_KEYRING_GET, [])` promise. Both the test's own keyring_get promise
    and the leaked tray_set_icon promise are left with real (unref'd) 60s timers
    (RUST_INVOKE_TIMEOUT_MS, sidecarRpc.ts:58/294-297) running in the shared `--runInBand`
    process; whichever timer matures first rejects into whatever suite is executing at that
    moment. keyring_get's timer starts fractionally earlier (its `requestRustInvoke` call is
    the first synchronous statement in the test body, before the tray leak's deferred call
    even fires), which is consistent with it being the one consistently observed as the
    roaming victim signature.
  confirming_evidence:
    - "appShellFlowRegistration.ts:317 `setImmediate(syncTrayIcon)` is unconditional, at
      module scope, inside `registerAppShellFlows()` — called exactly once from
      handlers.ts:116, which itself runs at module-import time (before `init()` is ever
      invoked in production too, per bootstrap.ts Step 2 vs Step 3 ordering)."
    - "sidecarRpc.ts:89 `let outputStream: Writable = process.stdout` is a single
      module-level mutable reassigned by every `startRpcServer()` call (line 218) — nothing
      scopes a rustInvoke write to 'the stream a specific init() call owns'."
    - "grep across src/backend/sidecar/*.ts and storeManagers/steam/{user,tokenStore}.ts
      found zero call sites where `.getToken()`/`.isAvailable()`/RUST_KEYRING_GET is invoked
      automatically at registration or init() time — every call site is behind an
      ipcMain.handle/on body, reachable only from an actual inbound RPC frame."
    - "rustInvokeChannel.test.ts:72 `expect(rustInvokeLines).toHaveLength(1)` sits BEFORE
      line 81's `input.write(...)` cleanup for the test's own keyring_get call — a thrown
      assertion aborts the rest of the async test function, so that cleanup line provably
      never executes when the assertion fails."
    - "sidecarRpc.ts:301 `timer.unref()` confirms these 60s timers do not keep the process
      alive but DO still fire while the process is alive for other reasons — exactly the
      condition `--runInBand` (one shared process for all suites) creates."
  falsification_test: |
    If this hypothesis is correct, suppressing ONLY the `setImmediate(syncTrayIcon)` call
    under Jest should make rustInvokeChannel.test.ts behavior 1 pass outright (exactly one
    frame), AND should eliminate the roaming keyring_get timeout across a full `test:ci` run
    (since the test's own cleanup line would then execute normally, settling its own
    promise). If the roaming failure persists after that fix, the hypothesis is wrong and
    there is a second, independent keyring_get-emitting leak elsewhere.
  fix_rationale: |
    Guard the single leaking call site (`setImmediate(syncTrayIcon)`,
    appShellFlowRegistration.ts:317) so it does not fire under Jest
    (`process.env.JEST_WORKER_ID === undefined` — Jest's own zero-config idiom for "am I
    running under Jest", already effectively how this repo detects "real Electron" via mocks
    elsewhere). This is the "guarded" option from the four offered (awaited/error-handled/
    deferred/guarded): the real `changeTrayColor` ipcMain.on handler and `syncTrayIcon()`
    function are untouched and fully reachable/testable — only the automatic one-shot
    boot-time correction is suppressed, and only under Jest. Under real Tauri
    (JEST_WORKER_ID unset), behavior is byte-identical to today. This addresses the root
    cause (an untracked, module-scope-timed, unawaited rustInvoke side effect racing an
    arbitrary test's output stream), not the symptom (does not touch the test's assertion).
  blind_spots: |
    Have not yet run the isolated test or full test:ci with the fix applied to confirm the
    falsification test empirically — doing that next. Have not exhaustively grepped EVERY
    ipcMain registration module for a similar module-scope setImmediate pattern beyond
    appShellFlowRegistration.ts and downloadQueueFlowRegistration.ts (the latter only emits a
    log line, not a rustInvoke frame, so it's not a candidate for this specific bug class,
    but a similar pattern could theoretically exist elsewhere and go unnoticed until a test
    happens to assert an exact frame count against it too).
next_action: |
  CLOSED. Fix applied and verified (see Resolution.verification), independently
  re-verified by the coordinator at the human-verify checkpoint (2026-07-29,
  "confirmed fixed — archive the session and commit"). Session archived to
  .planning/debug/resolved/sidecar-init-rustinvoke-leak.md. No further action.

## Evidence

- timestamp: 2026-07-29 (pre-session, orchestrator)
  observation: `npx jest src/backend/sidecar/__tests__/rustInvokeChannel.test.ts` fails
    deterministically in isolation, 1 failed / 7 passed, 0.922s. Received 2 rustInvoke frames
    (`keyring_get`, then `tray_set_icon` with `[{"dark":false}]`) where 1 was expected.
  significance: Reclassifies this from "cross-test pollution flake" to "reproducible defect in
    `init()`". Isolation is the cheap repro loop for the whole investigation.

- timestamp: 2026-07-29 (pre-session, orchestrator)
  observation: `package.json` `test:ci` = `jest --runInBand --silent` — all suites share one
    process.
  significance: Supplies the mechanism by which an unanswered 60s rustInvoke timeout from one
    suite can surface as a failure in an unrelated suite.

- timestamp: 2026-07-29 (pre-session, orchestrator)
  observation: `rustInvokeChannel.test.ts` mocks only `../../online_monitor`; it does NOT mock
    the tray or keyring surfaces, and its test body is just `init()` + one
    `requestRustInvoke`.
  significance: Narrows the second frame's origin to `init()` itself rather than any test
    scaffolding.

- timestamp: 2026-07-29 (session)
  checked: src/backend/sidecar/bootstrap.ts `init()` in full.
  found: `init()` itself calls `initLogger()`, the i18next init block, `startRpcServer()`,
    `electronStub.bindTransport()`, `installTokenStore(new SidecarKeyringTokenStore())`
    (construction only — no method call), `initOnlineMonitor()`, the `releasesInfoReady`
    listener registration, and `fetchLastestReleases()`. None of these calls `keyring_get` or
    `tray_set_icon` directly.
  significance: `init()` does not itself emit either stray channel. The leak must originate
    elsewhere in the import graph `init()`/its callers pull in.

- timestamp: 2026-07-29 (session)
  checked: src/backend/sidecar/appShellFlowRegistration.ts `registerAppShellFlows()`.
  found: Line 317, module-scope-called (from handlers.ts:116, itself run at import time):
    `setImmediate(syncTrayIcon)`. `syncTrayIcon()` calls
    `requestRustInvoke(RUST_TRAY_SET_ICON, [{dark: ...}])` fire-and-forget (`.catch()` only,
    never awaited, never tracked). This is the source of the `tray_set_icon` frame — confirmed
    by args match (`[{"dark":false}]`) and by `handlers.ts` doc-comment cross-reference.
  significance: Found the exact leaking call site. `registerAppShellFlows()` runs exactly
    ONCE per test file (Jest resets the module registry per file; `handlers.ts` is imported
    once), completely decoupled from any specific `init()` invocation — unlike every other
    once-per-process side effect in `init()` itself, which are all gated behind idempotency
    flags (`loggerInitialized` etc.) AND live inside `init()`'s own call.

- timestamp: 2026-07-29 (session)
  checked: src/backend/sidecar/sidecarRpc.ts (`writeLine`, `outputStream`, `startRpcServer`,
    `requestRustInvoke`'s timeout wiring).
  found: `outputStream` (line 89) is a single module-level mutable, reassigned by every
    `startRpcServer()` call (line 218). `requestRustInvoke`'s 60s timeout timer is real
    (`setTimeout`, line 294) and `.unref()`'d (line 301) — does not keep the process alive,
    but WILL still fire while the process is alive for any other reason, exactly the
    condition `jest --runInBand` creates (one shared process for the whole suite run).
  significance: Explains both symptoms with ONE mechanism: (1) the deferred `syncTrayIcon()`
    setImmediate callback fires after the first test's `init()` call has already rebound
    `outputStream` to that test's PassThrough, landing the stray frame there; (2) that
    landing breaks rustInvokeChannel.test.ts behavior 1's `toHaveLength(1)` assertion, which
    THROWS before the test's own cleanup line (`input.write(...)`, settling its own
    `keyring_get` promise) ever runs — leaving a REAL, running 60s timer for `keyring_get`
    that later rejects into whatever suite happens to be executing under `--runInBand`.

- timestamp: 2026-07-29 (session)
  checked: grep for RUST_KEYRING_GET / `.getToken()` / `.isAvailable()` call sites across
    src/backend/sidecar/*.ts and storeManagers/steam/{user,tokenStore}.ts.
  found: Every call site (SteamUser.getCredentials/logout/finishAuth in user.ts,
    SidecarKeyringTokenStore's own methods) is reachable ONLY from inside an
    ipcMain.handle/on body — i.e. only in response to an actual inbound RPC frame, never
    automatically at module/registration/init() time.
  significance: DISPROVES the prior session's framing that `init()` emits an unawaited
    `keyring_get` as a startup side effect analogous to `tray_set_icon`. There is no such
    call site. The roaming keyring_get timeout is fully explained as a knock-on effect of the
    single tray_set_icon leak (see above), not a second independent leak.

## Eliminated

- hypothesis: The failure is caused by mock/state leakage from a previously-run suite.
  evidence: It reproduces with the single file run alone, no other suite loaded.
  timestamp: 2026-07-29

- hypothesis: |
    (Raised during human-verify checkpoint re-check, coordinator.) The fix introduces a
    production race: `setImmediate(syncTrayIcon)` (the check-phase deferred call inside
    `registerAppShellFlows()`) might fire before `init()` binds `outputStream` in real Tauri
    startup, silently dropping the boot-time tray correction.
  evidence: |
    DISPROVEN. `src/sidecar/index.ts` reads `import { init } from ...; installUnhandledRejectionGuard();
    init();` — ES module imports are hoisted and fully evaluated before any top-level statement
    runs, and `init()` then executes SYNCHRONOUSLY in the same tick (no `await` before or
    inside the call that would yield the event loop). This means the check-phase
    `setImmediate(syncTrayIcon)` scheduled during that same synchronous import/init pass always
    fires strictly after `outputStream` has already been bound. This ordering is not incidental
    — `humbleLoginFlowRegistration.ts:338` already documents and relies on exactly this
    same-tick "imports resolve then init() runs synchronously" guarantee elsewhere in the
    sidecar bootstrap. No production race exists; the concern only manifests under Jest because
    Jest re-triggers module-scope side effects independent of any specific `init()` call, which
    is precisely the condition the `JEST_WORKER_ID` guard targets.
  timestamp: 2026-07-29

## Constraints

- Do NOT weaken the assertion to accept extra frames, and do NOT add the victim filenames to
  any expected-failure allowlist. The point is to stop `init()` leaking, not to make the test
  tolerant of a leak. A tolerant test would hide the same defect in production startup.
- The fix must not mask the real behaviour under Tauri: `tray_set_icon` and `keyring_get` DO
  legitimately need to run at real sidecar startup. Consider whether they should be awaited,
  error-handled, deferred, or guarded — not simply deleted.
- Verify with BOTH: the isolated file (must pass) AND a full `npm run test:ci` (should reach a
  clean exit 0, or at minimum lose the arbitrary-suite victim). Report the real exit code;
  do not round up to green.

## Resolution

root_cause: |
  `registerAppShellFlows()` (src/backend/sidecar/appShellFlowRegistration.ts:317, called
  unconditionally from src/backend/sidecar/handlers.ts's own top-level module scope, itself
  executed at import time BEFORE `init()` ever runs) scheduled an UNCONDITIONAL, UNTRACKED
  `setImmediate(syncTrayIcon)` — a fire-and-forget `requestRustInvoke(RUST_TRAY_SET_ICON,
  ...)` call with only a `.catch()`, never awaited, never drained. Because
  `registerAppShellFlows()` runs exactly ONCE per Jest test FILE (module registry resets per
  file) while `bootstrap.test.ts`/`*Flows.test.ts` call `init()` MANY times per file with
  FRESH `stream.PassThrough` pairs, and because `sidecarRpc.ts`'s `outputStream` (line 89) is
  a single module-level mutable rebound by every `startRpcServer()` call, the deferred
  `syncTrayIcon()` callback fired during the Node "check" phase AFTER the first `it` block's
  synchronous `init(input, output)` call had already rebound `outputStream` to that test's own
  stream — landing a stray `tray_set_icon` frame there. In
  `rustInvokeChannel.test.ts` behavior 1 this broke `expect(rustInvokeLines).toHaveLength(1)`,
  which THREW before the test reached its own cleanup line (`input.write(...)`, line 81) that
  would otherwise have settled its own `requestRustInvoke(RUST_KEYRING_GET, [])` promise. That
  left a real, unref'd 60s `RUST_INVOKE_TIMEOUT_MS` timer running for `keyring_get` (and
  likewise, unobserved, for `tray_set_icon`) in the shared `jest --runInBand` process, which
  later rejected into whatever suite happened to be executing when it matured — reproducing
  the roaming "rustInvoke timed out after 60000ms: keyring_get" victim-suite signature.
  DISPROVEN: `init()` (bootstrap.ts) does NOT itself call `keyring_get` at startup anywhere —
  every `SidecarKeyringTokenStore`/`getTokenStore()` call site is reachable only from inside
  an actual ipcMain.handle/on body, never at module/registration/init() time. The roaming
  keyring_get timeout was fully a knock-on effect of the single tray_set_icon leak, not an
  independent second leak (see Current Focus reasoning_checkpoint for the full falsifiable
  argument and Evidence for the supporting call-site audit).
fix: |
  Made the leaking initial-sync trigger opt-out via a new `skipInitialTraySync` option on
  `registerAppShellFlows()` (default `false` — unconditional fire, byte-identical to before
  for any DIRECT caller). Only `handlers.ts`'s own top-level, import-time-triggered call (the
  actual leak source — decoupled from any specific `init()` invocation) now passes
  `{ skipInitialTraySync: process.env.JEST_WORKER_ID !== undefined }`. `JEST_WORKER_ID` is
  Jest's own zero-config "am I running under Jest" signal — always set in a Jest worker, never
  set for the real Tauri sidecar process — so production behavior (real `changeTrayColor`
  wiring, and the real one-shot boot-time tray correction) is unchanged. The real
  `changeTrayColor` `ipcMain.on` handler and `syncTrayIcon()` function themselves are
  untouched and remain fully reachable/testable — this only suppresses the automatic one-shot
  invocation `handlers.ts` triggers at import time, and only under Jest. Chose this over a
  blanket `JEST_WORKER_ID` guard inside `registerAppShellFlows()` itself because
  appShellFlows.test.ts's own REQ-34.1-07 acceptance test (`jest.isolateModules`, calling
  `registerAppShellFlows()` DIRECTLY) proves this exact sync must still fire when invoked
  directly — a blanket guard broke that legitimate test (confirmed by a full test:ci run
  before this refinement; see Evidence).
verification: |
  Isolated repro: `npx jest src/backend/sidecar/__tests__/rustInvokeChannel.test.ts` — 8/8
  pass (previously 1 failed/7 passed). Also re-ran together with appShellFlows.test.ts and
  bootstrap.test.ts (the two other suites most load-bearing for this exact mechanism):
  43/43 pass.
  Full suite: `npm run test:ci` (`jest --runInBand --silent`) run twice after the fix.
  Neither run showed the rustInvokeChannel.test.ts failure, the roaming
  "rustInvoke timed out after 60000ms: keyring_get" signature, or any appShellFlows.test.ts
  failure (0 occurrences across both runs' full logs). Real exit codes: run 2 = 1 (single
  unrelated failure: storeManagers/steam/__tests__/depot.test.ts's two D-UAT-06 timeout tests,
  Steam CM-drop reconnect/retry — 5000ms Jest timeout exceeded during the ~335s
  `--runInBand` run). Re-ran depot.test.ts's D-UAT-06 tests in isolation:
  5/5 pass in 3.9s — confirms this is an unrelated, pre-existing timing flake under long
  single-process runs, not caused by this fix (no file this session touched has any
  relationship to storeManagers/steam/depot.ts or its CM-connection-drop tests). Ran
  `npm run test:ci` a THIRD time to corroborate: **166/166 suites passed, 3095/3095 tests
  passed, real exit code 0** — depot.test.ts's D-UAT-06 tests passed cleanly this run,
  confirming run 2's failure was non-deterministic scheduling flake, not a regression from
  this fix. The original defect (this debug session's actual scope — the deterministic
  rustInvokeChannel.test.ts failure and the roaming keyring_get timeout signature) does not
  appear in ANY of the three post-fix full runs, and a genuine clean exit 0 was reached on
  run 3.

  INDEPENDENT COORDINATOR RE-VERIFICATION (human-verify checkpoint, 2026-07-29): the
  coordinator re-ran the full evidence chain from scratch rather than accepting the prior
  report at face value.
  - Isolated `rustInvokeChannel.test.ts`: 8/8 pass (was 1 failed / 7 passed).
  - `appShellFlows.test.ts`: 30/30 pass, INCLUDING "REQ-34.1-07 registerAppShellFlows()
    performs exactly one initial sync invoke" — confirming the tray-sync behavior itself
    remains genuinely covered by a direct-call test, not merely skipped by the guard.
  - Full `npm run test:ci`: run TWICE, both **166/166 suites, 3095/3095 tests, real exit
    code 0**. The first exit-code capture attempt used bash `PIPESTATUS` under zsh and came
    back empty/unreliable; re-captured correctly on both runs. This is the first clean full
    run since the baseline was established in Phase 34.1.
  Checkpoint response: "confirmed fixed — archive the session and commit."
known_trade_offs: |
  (Recorded from the human-verify checkpoint, coordinator finding 2 — a narrow residual
  judged NOT worth a further refactor, but deliberately named in the record rather than left
  as a silent gap.) Gating the initial sync on `process.env.JEST_WORKER_ID` means
  `handlers.ts`'s own import-time call site to `registerAppShellFlows()` always takes the
  skip branch under Jest — so the *boolean plumbing* at that specific call site (the
  `{ skipInitialTraySync: process.env.JEST_WORKER_ID !== undefined }` argument) is never
  itself exercised true-vs-false by the suite. Only the underlying *behavior* is tested,
  and only indirectly: via `appShellFlows.test.ts`'s REQ-34.1-07 test, which calls
  `registerAppShellFlows()` DIRECTLY with default options (skip = false) and asserts the
  sync fires exactly once. Exposure is judged small and fail-safe: the default value of
  `skipInitialTraySync` is `false`, i.e. pre-fix production behavior, so a regression in the
  JEST_WORKER_ID branch itself could only ever suppress a cosmetic boot-time tray-icon
  correction — one that self-heals on the next settings change — never reintroduce the
  original leak in production. Flagged explicitly rather than left implicit because this
  repo has been bitten by the same shape of gap before: Phase 34.4 gate item 2 was a stale
  `isTauri()` guard that a fully-green test suite hid entirely (see
  `phase-34-4-complete.md` in project memory). This is a deliberate, accepted trade-off, not
  an oversight.
observed_hygiene_warning: |
  (Recorded from the human-verify checkpoint, coordinator finding 3.) Both of the
  coordinator's independent full `npm run test:ci` runs ended with Jest's own warning: "Jest
  did not exit one second after the test run has completed. ... This usually means that
  there are asynchronous operations that weren't stopped in your tests." Real exit code was
  0 on both runs regardless, and all 3095 tests passed, so this does not affect the
  acceptance criterion for this session. The coordinator did NOT establish whether this
  warning predates this fix or was introduced by it — recorded here as an OBSERVED,
  UNATTRIBUTED finding only, not as confirmed pre-existing and not as confirmed
  fix-introduced. Worth a future `--detectOpenHandles` pass to attribute; explicitly out of
  scope for this session.
deferred_verification: |
  Cold-boot tray icon color matching the `darkTrayIcon` setting under a real Tauri run (i.e.
  the actual production behavior this fix's `JEST_WORKER_ID` guard is designed to leave
  byte-identical) has not been locally verified on real hardware — the developer is remote
  and cannot drive a local Tauri build right now. This was already identified as a deferred
  item at the original checkpoint. Recorded here as a deferred item, NOT a blocker to
  closing this session: all automated evidence supports the guard being production-inert
  (see the Eliminated entry above disproving the suspected production race), and the actual
  code path (`syncTrayIcon()`, the real `changeTrayColor` `ipcMain.on` handler) is untouched
  by this fix.
files_changed:
  - src/backend/sidecar/appShellFlowRegistration.ts
  - src/backend/sidecar/handlers.ts
