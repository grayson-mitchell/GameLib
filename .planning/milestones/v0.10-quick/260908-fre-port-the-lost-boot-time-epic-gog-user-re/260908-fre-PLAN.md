---
phase: quick-260908-fre
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/sidecar/bootstrap.ts
  - src/backend/sidecar/__tests__/bootstrapUserReconcile.test.ts
  - src/backend/sidecar/__tests__/testContainment.test.ts
  - .planning/todos/pending/2026-09-06-boot-time-epic-and-gog-user-reconciliation-lost.md
autonomous: true
requirements:
  - TODO-2026-09-06-boot-time-epic-and-gog-user-reconciliation-lost
user_setup: []

must_haves:
  truths:
    - "At sidecar boot, once online, a stale Epic `userInfo` in configStore is deleted when legendary is no longer logged in."
    - "At sidecar boot, once online, GOG user details are refreshed when the user is logged into GOG."
    - "The exact log string `User Not Found, removing it from Store` is emitted with `forceLog: true` on the delete path — the todo's own evidence string."
    - "Neither leg can fail boot: a throw in the deferred callback, or a rejection from `getUserDetails()`, is caught and logged, never escalated to the process guards."
    - "The reconciliation runs exactly once per process, even though `init()` is called many times per jest file."
  artifacts:
    - path: "src/backend/sidecar/bootstrap.ts"
      provides: "Block E — exported `reconcileStoreUsersWhenOnline()` plus its guarded call site in `init()`"
      contains: "export function reconcileStoreUsersWhenOnline"
    - path: "src/backend/sidecar/__tests__/bootstrapUserReconcile.test.ts"
      provides: "Dedicated suite: wiring proof through `init()` plus the four behavioural arms and the two never-fail-boot arms"
      min_lines: 120
    - path: "src/backend/sidecar/__tests__/testContainment.test.ts"
      provides: "Registration of the new suite in `STRUCTURALLY_CONTAINED_SUITES` so the T-34.2-83 set-equality gate stays green"
      contains: "bootstrapUserReconcile.test.ts"
    - path: ".planning/todos/completed/2026-09-06-boot-time-epic-and-gog-user-reconciliation-lost.md"
      provides: "Closed todo, moved from pending/ with a RESOLVED status naming this quick task"
      contains: "RESOLVED 2026-09-08"
  key_links:
    - from: "src/backend/sidecar/bootstrap.ts init()"
      to: "reconcileStoreUsersWhenOnline()"
      via: "guarded call before the READY_SENTINEL write"
      pattern: "storeUserReconcileInitialized"
    - from: "reconcileStoreUsersWhenOnline()"
      to: "backend/online_monitor runOnceWhenOnline"
      via: "deferred-until-online callback"
      pattern: "runOnceWhenOnline\\("
    - from: "reconcileStoreUsersWhenOnline()"
      to: "backend/constants/key_value_stores configStore"
      via: "delete of the stale Epic userInfo key"
      pattern: "configStore\\.delete\\('userInfo'\\)"
    - from: "reconcileStoreUsersWhenOnline()"
      to: "GOGUser.getUserDetails"
      via: "floated promise with an explicit .catch"
      pattern: "getUserDetails\\(\\)[\\s\\S]{0,80}catch"
---

<objective>
Restore the boot-time Epic/GOG user reconciliation that was deleted with `src/backend/main.ts`
in commit `5643c7583` ("feat(35-14)!: delete the Electron entry points"), porting it into the
Tauri sidecar's `bootstrap.ts` as "Block E".

Purpose: two side effects have had no successor on the shipping runtime since that commit —
a stale Epic `userInfo` is never reconciled away at boot (the UI can show a phantom logged-in
Epic user after legendary's credentials go bad), and GOG user details are never refreshed at
boot (username/avatar go stale until the next explicit login).

Output: an exported `reconcileStoreUsersWhenOnline()` helper plus its guarded call site in
`init()`, a dedicated jest suite proving both the wiring and the behaviour, the containment-gate
registration that new suite requires, and the todo closed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/todos/pending/2026-09-06-boot-time-epic-and-gog-user-reconciliation-lost.md

@src/backend/sidecar/bootstrap.ts
@src/backend/sidecar/__tests__/playtimeLockBootClear.test.ts
@src/backend/storeManagers/legendary/user.ts
@src/backend/storeManagers/gog/user.ts

Project skill: `Skill("spike-findings-gamelib")` — Tauri sidecar architecture, the
`main.ts`-deletion fallout class this task belongs to.
</context>

<established_facts>
All of the following were verified at planning time against the live tree. Do not re-derive
them; build on them. Anything you *do* re-check, re-check because you are about to depend on a
detail this section does not state — not to reconfirm what it does.

**1. The premise holds.** `src/backend/main.ts` was deleted in `5643c7583`. `grep -rn "removing
it from Store" src/` returns ZERO hits. No `runOnceWhenOnline` call site anywhere in `src/`
performs Epic/GOG user reconciliation.

**2. The exact deleted source**, from `git show 5643c7583^:src/backend/main.ts` lines 442-457,
inside `app.whenReady()`:

    runOnceWhenOnline(async () => {
      const isLoggedIn = LegendaryUser.isLoggedIn()
      if (!isLoggedIn) {
        logInfo('User Not Found, removing it from Store', {
          prefix: LogPrefix.Backend,
          forceLog: true
        })
        configStore.delete('userInfo')
      }
      // Update user details
      if (GOGUser.isLoggedIn()) {
        GOGUser.getUserDetails()
      }
    })

**3. `configStore` is the same store.** `backend/constants/key_value_stores`' `configStore` is
what `LegendaryUser` itself imports (`legendary/user.ts:9`), so `configStore.delete('userInfo')`
targets exactly the key `LegendaryUser.getUserInfo()` writes at `legendary/user.ts:684`.

**4. A partial lazy mitigation already exists — acknowledge it, do not duplicate it.**
`LegendaryUser.getUserInfo()` (`legendary/user.ts:678-681`) already does
`configStore.delete('userInfo')` when `!isLoggedIn()`. That path only runs when something
*calls* `getUserInfo()`. The boot-time leg is genuinely missing. State the blast radius
honestly in the SUMMARY: this restores the eager boot-time reconciliation, it does not fix a
total absence of reconciliation.

**5. `LogOptions` still accepts the object form.** `backend/logger/types.ts` declares
`type LogOptions = FullLogOptions | LogPrefix` where `FullLogOptions = { prefix?, forceLog? }`,
and `LogWriter.logBase` (`log_writer.ts:156-166`) branches on `typeof options_or_prefix ===
'string'`. So `logInfo(msg, { prefix: LogPrefix.Backend, forceLog: true })` compiles and behaves
today, verbatim, exactly as the deleted `main.ts` line wrote it.

**6. `runOnceWhenOnline` is usable at that point in `init()`.** `initOnlineMonitor()` is already
called inside `init()` ahead of Block A; Block B's comment says exactly this about
`fetchLastestReleases`. Its signature is `(callback: () => unknown) => void`
(`online_monitor.ts:136-142`) — **the callback's return value is discarded**, and when offline
the callback is deferred onto `connectivityEmitter.once('online', ...)`.

**7. Block D is the structural precedent.** `clearStrandedPlaytimeSyncLock()`
(`bootstrap.ts:297-313`) is an exported top-level helper with a doc comment, wrapping its own
body in try/catch, called from a `if (!playtimeLockClearInitialized)` guard in `init()` between
Block C and the `output.write(READY_SENTINEL)` line. It was itself a port of a lost `main.ts`
side effect (quick-260907-odi). Follow its shape.

**8. Test containment is structural, so the real developer config is safe.**
`src/backend/jest.config.js` registers `setupFiles: ['<rootDir>/src/backend/
jest.setupContainment.ts']` for the whole `Backend` project, redirecting
HOME/USERPROFILE/APPDATA/XDG_* before any test file's own imports run. A real
`configStore.delete('userInfo')` inside a jest worker therefore hits a disposable per-run root,
not `~/Library/Application Support/GameLib`. No per-suite `jest.mock('os', ...)` is needed, and
Block D's suite deliberately declares none.

**9. `bootstrapWirings.test.ts` cannot host this.** It calls `init()` at line 320, long before
any new describe block appended to it would run — the module-scope once-guard would already be
consumed, so a boot-wiring test placed there could only ever measure a no-op. This is the exact
reasoning `playtimeLockBootClear.test.ts`'s docstring records for its own existence. A virgin
file gets a virgin module registry and a virgin guard flag for free.

**10. Adding a new suite trips a set-equality gate.**
`src/backend/sidecar/__tests__/testContainment.test.ts` Block C, test `T-34.2-83`, asserts that
every `*.test.ts` in that directory is classified by exactly one of `IN_SCOPE_SUITES` (4
entries) or `STRUCTURALLY_CONTAINED_SUITES`. Measured at planning time: 4 + 57 = 61 declared,
61 on disk, `unclassified: []`, `phantom: []` — **the gate is GREEN at HEAD**. Adding a suite
without registering it turns it RED.

**11. That file's running docstring count is stale prose, not a gate.** The comment above
`STRUCTURALLY_CONTAINED_SUITES` (`testContainment.test.ts:842`) says "59 `*.test.ts` files: 4
`IN_SCOPE_SUITES` + 55 below". The measured reality is 61 = 4 + 57. Two prior additions
incremented the list without updating the prose. Do not blindly write "56"; write the count you
measure.

**12. `structuralContainment.test.ts` will NOT need registration** — its `node:os` gate only
fires on a file that mentions the `'node:os'` specifier AND `homedir`/`userInfo`. Your new suite
will mention the string `'userInfo'` (it is the configStore key) but must never mention
`'node:os'`, so the gate stays inert. Do not add a `node:os` reference to that file.

**13. `loggerCallSiteGuard.test.ts` is irrelevant here** — it is scoped to `logError` call sites
in `loggerFlowRegistration.ts`, not a general logger-form gate over `bootstrap.ts`.
</established_facts>

<design_decisions>
Settle these as written. Each is a decision, with its reason, not a suggestion.

**D1 — Exported helper, not an inline block.** Name it `reconcileStoreUsersWhenOnline()`,
exported, with a doc comment, following Block D's `clearStrandedPlaytimeSyncLock()` exactly.
Blocks A and B are inline because their bodies are two lines and a try/catch; this body has two
independent legs, four branches, and a floated promise, and it must be directly unit-testable
without going through `init()` (Block D's suite proves the value of that split: its three tests
call the helper directly and only one goes through `init()`).

**D2 — Placement: after Block D, immediately before `output.write(READY_SENTINEL)`.**
Constraints, in order: it must be after `initLogger()` (it logs, and `heroicLogWriter` is unset
before that — the standing `sidecar-console-and-logger-are-invisible` finding); it must be after
`initOnlineMonitor()` (it calls `runOnceWhenOnline`, the same requirement Block B's comment
already records); and it should be before READY so the reconciliation is at least *queued*
before the frontend can issue its first `getUserInfo`-shaped RPC. Appending after Block D
satisfies all three while leaving the existing A→B→C→D sequence byte-identical, so the diff
cannot perturb any ordering another gate depends on. Say this in the block comment.

**D3 — The callback needs its OWN try/catch; the outer one cannot cover it.** This is the
subtle part and the reason the block is not a one-liner. When offline, `runOnceWhenOnline`
defers the callback to `connectivityEmitter.once('online', ...)`, so the callback body runs on a
LATER turn, outside the stack frame of any `try` wrapping the `runOnceWhenOnline(...)` call
itself. A `try { runOnceWhenOnline(cb) } catch {}` therefore protects only the registration, not
the work. Both `LegendaryUser.isLoggedIn()` (an `existsSync`) and `configStore.delete()` can
throw. So: an inner try/catch around the whole callback body, AND an outer try/catch around the
`runOnceWhenOnline` call — the house rule from this file's other blocks is that a boot-time
block must never fail boot, and here that costs two guards, not one. Comment the inner one with
this reasoning so a future reader does not "simplify" it away.

**D4 — `getUserDetails()`'s promise gets an explicit `.catch`.** `runOnceWhenOnline`'s callback
return is discarded, so a rejection would surface as an unhandled rejection. `processGuards`
would catch it, but relying on the process-wide net for a known-floatable promise is exactly
what `deliverStartupProtocolUrl` (`Promise.resolve(...).catch(...)`) and the migrations block
(`.catch((error: unknown) => logWarning(...))`) already refuse to do in this file. Note that
`GOGUser.getUserDetails()` does `await axios.get(...).catch(...)` internally but can still
reject EARLIER — `getCredentials()` (`gog/user.ts:303`) spawns a `gogdl auth` subprocess. Use
the migrations block's shape: a sync call, `.catch(...)`, logging at `logWarning`.

**D5 — Preserve the log line VERBATIM, including `forceLog: true`, and do NOT add this file's
`[bootstrap]` prefix to it.** The string is `'User Not Found, removing it from Store'` with
options `{ prefix: LogPrefix.Backend, forceLog: true }`. This deviates from the local convention
visible in every other block in `bootstrap.ts` (which uses `logInfo(msg, LogPrefix.Backend)` and
a `[bootstrap] ` message prefix), and the deviation is deliberate: this exact literal is the
string the todo's bundle-level evidence greps for, and it is the receipt that proves the port
shipped. Prefixing it would silently invalidate the todo's own closing evidence. Put that reason
in a comment on the line. Your NEW diagnostic lines (the two catch arms) should follow the
local `[bootstrap] ` convention — only the ported line is exempt.

**D6 — Keep the `if (GOGUser.isLoggedIn())` guard even though `getUserDetails()` re-checks it.**
`getUserDetails()` (`gog/user.ts:235-238`) does its own `if (!this.isLoggedIn())` and returns
after a `logWarning('User is not logged in')`. Calling it unguarded would still be *correct*,
but would emit that warning on every boot for every user who does not use GOG. Keeping the outer
guard preserves fidelity to the deleted source AND keeps the log clean. Same for the ordering:
Epic leg first, GOG leg second, matching `main.ts`.

**D7 — Dedicated test file `src/backend/sidecar/__tests__/bootstrapUserReconcile.test.ts`.**
Per established fact 9. Model its mock preamble on `playtimeLockBootClear.test.ts`.

**D8 — Register the new suite in `STRUCTURALLY_CONTAINED_SUITES`.** Per established facts 10
and 11.
</design_decisions>

<tasks>

<task type="auto">
  <name>Task 1: Add Block E to bootstrap.ts — the helper, the guard, the call site</name>
  <files>src/backend/sidecar/bootstrap.ts</files>
  <action>
Add four imports alongside the existing ones, each placed with the file's existing import
grouping rather than appended blindly:
  - `runOnceWhenOnline` — extend the existing `import { initOnlineMonitor } from '../online_monitor'`
    into `import { initOnlineMonitor, runOnceWhenOnline } from '../online_monitor'`.
  - `LegendaryUser` from `'../storeManagers/legendary/user'`
  - `GOGUser` from `'../storeManagers/gog/user'`
  - `configStore` from `'backend/constants/key_value_stores'`

Before writing the import comment, run `grep -rn "storeManagers/legendary/user\|storeManagers/gog/user" src/backend/sidecar/` and confirm whether the sidecar's already-imported graph (`./handlers` → the flow-registration modules, e.g. `runnerAuthFlowRegistration`) already pulls these in. State what you find in a short comment in the Block D idiom — "adds NO new module to the sidecar bundle, this is a second binding onto an already-resident module" if true, or the honest opposite if not. Do not assert the convenient answer without running the grep.

Add a module-scope guard beside the existing seven, with a comment matching their shape:

  let storeUserReconcileInitialized = false

Add the exported helper next to `clearStrandedPlaytimeSyncLock()`:

  export function reconcileStoreUsersWhenOnline(): void

Its doc comment must record: the `main.ts:442-457` provenance and the `5643c7583` deletion; the
D4 promise-floating reason; the D3 two-guards reason; the D5 verbatim-string reason; and the
established-fact-4 honesty note that `LegendaryUser.getUserInfo()` already has a lazy variant of
the Epic leg, so this restores the EAGER boot-time reconciliation rather than the only one.

Body: an outer try/catch around a single `runOnceWhenOnline(() => { ... })` registration. Inside
the callback, a try/catch around both legs. Epic leg: `if (!LegendaryUser.isLoggedIn())` →
`logInfo('User Not Found, removing it from Store', { prefix: LogPrefix.Backend, forceLog: true })`
then `configStore.delete('userInfo')`. GOG leg: `if (GOGUser.isLoggedIn())` →
`GOGUser.getUserDetails().catch((error: unknown) => logWarning(...))`. Both catch arms log at
`logWarning` with a `[bootstrap] ` prefixed message naming `reconcileStoreUsersWhenOnline`, in
the exact shape of the existing `clearStrandedPlaytimeSyncLock()` catch arm.

The callback is SYNCHRONOUS (`() => {...}`, not `async`) — unlike the deleted `main.ts` version,
which was `async` for no reason it ever used. `runOnceWhenOnline` discards the return either
way, and a sync callback makes the floated `getUserDetails()` promise and its `.catch`
syntactically obvious instead of hiding behind an unawaited `async` frame. Note this deliberate
divergence from the ported source in the doc comment.

Call site, in `init()`, appended after Block D's `if (!playtimeLockClearInitialized)` block and
BEFORE `output.write(...READY_SENTINEL...)`:

  // Block E — boot-time Epic/GOG user reconciliation (todo 2026-09-06, quick-260908-fre).
  // ...placement rationale per D2...
  if (!storeUserReconcileInitialized) {
    storeUserReconcileInitialized = true
    reconcileStoreUsersWhenOnline()
  }

No try/catch at the call site — the helper owns that, matching Block D's call site exactly.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
    Also: `npx eslint src/backend/sidecar/bootstrap.ts` reports no NEW errors (this repo's
    `lint` script runs with `--max-warnings 4157`, i.e. the baseline is not zero — compare
    against the file's state before your edit, do not read a nonzero global count as your
    regression).
  </verify>
  <done>`reconcileStoreUsersWhenOnline` is exported from `bootstrap.ts`, called from `init()` behind `storeUserReconcileInitialized` before the READY_SENTINEL write, and `npx tsc --noEmit` is clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Dedicated suite proving the wiring and both legs, plus its containment registration</name>
  <files>src/backend/sidecar/__tests__/bootstrapUserReconcile.test.ts, src/backend/sidecar/__tests__/testContainment.test.ts</files>
  <behavior>
Seven cases. The first goes through `init()`; the rest call the helper directly.

  1. WIRING PROOF (must be the FIRST test in the file that calls `init()`, per Block D's own
     ordering rule — the module-scope guard is consumed by the first call): with
     `LegendaryUser.isLoggedIn` spied to `false` and `configStore` seeded with a `userInfo`
     value, `init(new PassThrough(), new PassThrough())` leaves `userInfo` absent and emits the
     exact log call. This proves the helper is CALLED from `init()`, not merely exported.
  2. Epic logged OUT: seeded `userInfo` is deleted, and `logInfo` was called with exactly
     `'User Not Found, removing it from Store'` and exactly
     `{ prefix: LogPrefix.Backend, forceLog: true }`. Assert the options object, not just the
     message — `forceLog` is the receipt D5 exists to protect, and a message-only assertion
     would pass with it dropped.
  3. Epic logged IN: seeded `userInfo` SURVIVES and no such `logInfo` call is made.
  4. GOG logged IN: `GOGUser.getUserDetails` called exactly once.
  5. GOG logged OUT: `GOGUser.getUserDetails` NOT called.
  6. Never-fails-boot, async arm: `GOGUser.getUserDetails` spied to return a rejected promise —
     the helper returns normally, and after a microtask flush (`await new Promise(setImmediate)`)
     a `logWarning` naming `reconcileStoreUsersWhenOnline` was emitted. This is what proves D4's
     `.catch` exists; without it the test would surface as an unhandled rejection instead.
  7. Never-fails-boot, sync arm: `LegendaryUser.isLoggedIn` spied to throw — the helper does not
     throw, and a `logWarning` is emitted. This is what proves D3's INNER guard exists; note in
     a comment that the outer guard alone cannot satisfy this test once `runOnceWhenOnline` is
     mocked to defer rather than invoke inline.
  </behavior>
  <action>
Create `src/backend/sidecar/__tests__/bootstrapUserReconcile.test.ts`, modelled on
`playtimeLockBootClear.test.ts` — read that file first and follow its structure, its docstring
discipline, and its mock preamble.

Mock preamble, BEFORE the imports:
  - `jest.mock('backend/store_backend', ...)` routed at `jest.requireActual('../fileStore').default`
    — copy Block D's block verbatim.
  - `jest.mock('axios', ...)` — copy Block D's block verbatim. Load-bearing: `init()` runs
    Block B's `fetchLastestReleases()`, and with `runOnceWhenOnline` mocked to invoke inline
    (below) that body actually executes instead of parking on the emitter.
  - `jest.mock('../../online_monitor', ...)` spreading `jest.requireActual` and overriding
    `initOnlineMonitor: jest.fn()`, `isOnline: jest.fn(() => true)`, and
    `runOnceWhenOnline: jest.fn((cb: () => unknown) => cb())`. Explain in a comment that
    invoking inline is what makes the assertions synchronous, and that this is the standard
    pattern across the sidecar suites.

Do NOT add a per-suite `jest.mock('os', ...)` — containment is structural (established fact 8),
and `jest.setupContainment.ts` SHADOWS per-suite os mocks anyway. Say so in the docstring, as
Block D's file does. Do NOT reference the `'node:os'` specifier anywhere in this file
(established fact 12).

Spy on `LegendaryUser.isLoggedIn`, `GOGUser.isLoggedIn` and `GOGUser.getUserDetails` with
`jest.spyOn` on the imported class objects — these are static property lookups performed at call
time, so the spy intercepts. Do NOT let the tests read the real values: under containment
`LegendaryUser.isLoggedIn()` is an `existsSync` against a disposable root and `GOGUser
.isLoggedIn()` reads the real `configStore` — both would be *contained* but not *deterministic*,
and case 3 needs a true value the environment will never supply on its own.

Note that `src/backend/jest.config.js` sets `resetMocks: true`, so spies do not leak between
tests; still call `mockRestore()` explicitly where Block D's file does, for symmetry.

Then register the new file in `testContainment.test.ts`'s `STRUCTURALLY_CONTAINED_SUITES`.
Alphabetical position: between `'bootstrap.test.ts'` and `'bootstrapWirings.test.ts'` (`.` sorts
before `U` sorts before `W`). Append a paragraph to that constant's docstring in the existing
running-log idiom, naming this quick task and the reason the suite is structurally contained
(no `pathShim`/`backend/logger/paths` four-element kit, so it cannot be an `IN_SCOPE_SUITE`;
containment comes from the project-wide `setupFiles` registration). Per established fact 11,
MEASURE the counts rather than incrementing the stale figure — recompute the on-disk `*.test.ts`
count and the two list lengths, and write what you measure. Flag the stale "59 / 55" figure as a
correction in your SUMMARY.
  </action>
  <verify>
    <automated>npx jest src/backend/sidecar/__tests__/bootstrapUserReconcile.test.ts</automated>
    Then the gate that the new file perturbs:
    <automated>npx jest src/backend/sidecar/__tests__/testContainment.test.ts</automated>
    Use a plain PATH filter as written. Do NOT use `--selectProjects` (case-sensitive, and exits
    0 on a miss) and do NOT use `-t` (it is a regex, so `(` matches nothing).

    MUTATION PROOF — the suite must be shown load-bearing, not merely green:
    1. Comment out the `reconcileStoreUsersWhenOnline()` call inside `init()`'s Block E guard,
       re-run the suite, and confirm the WIRING PROOF test (case 1) fails. Restore.
    2. Delete `forceLog: true` from the ported `logInfo` options object, re-run, confirm case 2
       fails. Restore.
    3. Delete the `.catch(...)` from the `getUserDetails()` call, re-run, confirm case 6 fails.
       Restore.
    Paste the three RED outputs into the SUMMARY. A green run alone proves nothing here.
  </verify>
  <done>The new suite is green on its own, `testContainment.test.ts` is green with the new registration, and all three mutations were observed RED and reverted.</done>
</task>

<task type="auto">
  <name>Task 3: Regression sweep, close the todo, record the receipt</name>
  <files>.planning/todos/pending/2026-09-06-boot-time-epic-and-gog-user-reconciliation-lost.md</files>
  <action>
Run the regression set for the files Block E perturbs — `init()` now does strictly more work, and
two suites drive it repeatedly:

  npx jest src/backend/sidecar/__tests__/bootstrap.test.ts src/backend/sidecar/__tests__/bootstrapWirings.test.ts src/backend/sidecar/__tests__/playtimeLockBootClear.test.ts src/backend/sidecar/__tests__/structuralContainment.test.ts

Pay attention to `bootstrapWirings.test.ts`'s idempotency test ("two init() calls yield exactly
one fetch and one listener") — if `storeUserReconcileInitialized` is wrong, that family is where
it shows. If anything is red, diagnose it rather than adjusting the test: a red here means the
guard or the placement is wrong.

Do NOT run `pnpm test:ci` as your gate. It is a known-RED full run at HEAD with ZERO failing
assertions (a leaked store-embed timer); treating it as a pass/fail signal for this change would
misattribute a pre-existing condition. If you run it for information, name the baseline sha.

CLOSING RECEIPT — the todo's own evidence form is bundle-level. Rebuild the sidecar and grep the
bundle for the string whose ZERO occurrences the todo recorded:

  pnpm build:sidecar
  grep -c 'User Not Found, removing it from Store' build/main/sidecar.js

Expect >= 1 where the todo measured 0. Record the bundle's byte size and mtime alongside the
count, matching the todo's own evidence format. If `build:sidecar` is unavailable or fails for a
reason unrelated to this change, say so explicitly and fall back to naming case 2 of the new
suite as the receipt — do not silently skip this and imply the bundle was checked.

A source-level `grep` of `bootstrap.ts` for that literal is NOT an acceptable substitute: the
string now also appears inside your own block comment (D5 explains why it must not be prefixed),
so a source grep is satisfied by the prose that names it. The jest `toHaveBeenCalledWith`
assertion and the bundle grep are the comment-immune receipts.

Close the todo. Convention, confirmed at planning time by listing
`.planning/todos/completed/` (98 files; `RESOLVED` and `CLOSED` are both in use, and every
2026-09-0x closure uses `RESOLVED <date> by quick-<id>. <prose>`):
  1. Edit the frontmatter `status:` from `OPEN` to a quoted
     `"RESOLVED 2026-09-08 by quick-260908-fre. ..."` string whose prose states WHAT was
     restored, that the Epic leg had a partial lazy mitigation already (established fact 4) so
     the bug's blast radius was narrower than the todo's Consequence section implies, and what
     is explicitly NOT closed by this.
  2. `git mv` the file from `.planning/todos/pending/` to `.planning/todos/completed/`, keeping
     the filename unchanged.

Check whether any other pending todo cross-references this one before closing
(`grep -rln "boot-time-epic-and-gog\|A4" .planning/todos/pending/`) — the source sweep
`quick-260906-gej` filed a family of findings from one FINDINGS.md, and a sibling may name this
row. Do not close a sibling you did not fix; just note the relationship.
  </action>
  <verify>
    <automated>npx jest src/backend/sidecar/__tests__/bootstrap.test.ts src/backend/sidecar/__tests__/bootstrapWirings.test.ts src/backend/sidecar/__tests__/playtimeLockBootClear.test.ts src/backend/sidecar/__tests__/structuralContainment.test.ts</automated>
    <automated>test -f .planning/todos/completed/2026-09-06-boot-time-epic-and-gog-user-reconciliation-lost.md && ! test -f .planning/todos/pending/2026-09-06-boot-time-epic-and-gog-user-reconciliation-lost.md</automated>
  </verify>
  <done>The four regression suites are green, the todo is moved to `completed/` with a RESOLVED status naming this quick task, and the bundle-level receipt (count, size, mtime) is recorded in the SUMMARY — or its unavailability is stated explicitly.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| sidecar → local filesystem | `configStore` read/write and `existsSync(legendaryUserInfo)` |
| sidecar → GOG API | `getUserDetails()` → `getCredentials()` (`gogdl auth` subprocess) → `api.gog.com` |

No NEW boundary is introduced: both were already crossed by the same code called from other
paths. This change only adds a boot-time trigger for crossings that already occur.

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-fre-01 | Information disclosure | the ported `logInfo` line | accept | The message is a fixed literal carrying no user identifier, account id, or token. `forceLog: true` writes it even when logging is disabled — that is the pre-existing upstream behaviour being restored verbatim (D5), not a new decision, and the constant string leaks nothing. |
| T-fre-02 | Denial of service | `reconcileStoreUsersWhenOnline()` at boot | mitigate | Two try/catch layers (D3) plus an explicit `.catch` on the floated promise (D4) mean neither a sync throw nor a `gogdl auth` subprocess failure can fail boot or reach `processGuards`. Cases 6 and 7 of Task 2 prove both arms, and the mutation step proves the `.catch` is load-bearing. |
| T-fre-03 | Tampering | `configStore.delete('userInfo')` under test | mitigate | Structural containment (`jest.setupContainment.ts`, registered via the backend project's `setupFiles`) redirects HOME/APPDATA before any test import, so the delete cannot reach the developer's real `~/Library/Application Support/GameLib`. This is the recorded `tests-clobbering-real-steam-store` failure mode; it is closed by construction here, not by suite-author opt-in. |
| T-fre-SC | Tampering | package installs | n/a | This plan installs no packages. All four new imports resolve to first-party modules already in the sidecar's graph. No legitimacy audit is required. |
</threat_model>

<verification>
1. `npx tsc --noEmit` clean.
2. `npx jest src/backend/sidecar/__tests__/bootstrapUserReconcile.test.ts` green, all 7 cases.
3. All three mutations observed RED and reverted, with output pasted into the SUMMARY.
4. `npx jest src/backend/sidecar/__tests__/testContainment.test.ts` green — `T-34.2-83` set
   equality holds with the new suite registered.
5. `npx jest` over `bootstrap.test.ts`, `bootstrapWirings.test.ts`,
   `playtimeLockBootClear.test.ts`, `structuralContainment.test.ts` green.
6. Bundle receipt recorded, or its unavailability stated explicitly.
7. Todo moved to `.planning/todos/completed/` with a `RESOLVED 2026-09-08` status.
8. No user-facing strings added — this is backend log output only, so no `gamelib.json` work and
   no i18n gate involvement. If that turns out to be false, the string goes in
   `public/locales/en/gamelib.json`, never `translation.json`.
</verification>

<success_criteria>
- Sidecar boot performs the Epic `userInfo` reconciliation and the GOG user-details refresh that
  `5643c7583` removed, deferred until online, exactly once per process.
- The literal `User Not Found, removing it from Store` is emitted with
  `{ prefix: LogPrefix.Backend, forceLog: true }` and is present in the built sidecar bundle.
- Neither leg can fail boot; both never-fail-boot arms are proven by mutation, not asserted.
- The containment set-equality gate is still green with the new suite registered.
- The todo is closed with an honest status that does not overclaim the bug's blast radius.
</success_criteria>

<output>
Create `.planning/quick/260908-fre-port-the-lost-boot-time-epic-gog-user-re/260908-fre-SUMMARY.md` when done.

The SUMMARY must record, beyond the usual: the three mutation RED outputs; the bundle grep count
with the bundle's size and mtime (or an explicit statement that the build was unavailable); the
measured `testContainment.test.ts` counts and the correction of the stale "59 / 55" docstring
figure; and the established-fact-4 honesty note that the Epic leg already had a partial lazy
mitigation via `LegendaryUser.getUserInfo()`, so what shipped here is the restoration of the
EAGER boot-time reconciliation rather than the only reconciliation that exists.
</output>
