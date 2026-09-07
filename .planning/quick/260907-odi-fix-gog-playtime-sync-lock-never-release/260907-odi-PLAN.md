---
task: 260907-odi
type: quick
title: 'Fix the GOG playtime sync lock — release it on throw, clear a stranded one at boot'
source_todo: .planning/todos/pending/2026-09-06-gog-playtime-sync-lock-never-cleared-at-boot.md
finding: A1 (quick-260906-gej sweep, FINDINGS.md section A)
severity: major
autonomous: true
files_modified:
  - src/backend/storeManagers/gog/library.ts
  - src/backend/sidecar/bootstrap.ts
  - src/backend/storeManagers/gog/__tests__/library.test.ts
  - src/backend/sidecar/__tests__/playtimeLockBootClear.test.ts

must_haves:
  truths:
    - 'A rejection from postPlaytimeSession() releases the lock instead of stranding it'
    - 'A rejection from postPlaytimeSession() leaves the queued sessions intact — none are lost'
    - 'A sidecar boot that finds a stranded lock clears it and says so in the log'
    - 'A sidecar boot with no stranded lock logs nothing about playtime locks'
    - 'GOG playtime sync can no longer be wedged permanently by one interrupted sync'
  artifacts:
    - path: src/backend/storeManagers/gog/library.ts
      provides: 'try/finally around syncQueuedPlaytime critical section'
      contains: 'finally'
    - path: src/backend/sidecar/bootstrap.ts
      provides: 'Block D — boot-time stranded playtime-lock clear'
      contains: 'clearStrandedPlaytimeSyncLock'
    - path: src/backend/storeManagers/gog/__tests__/library.test.ts
      provides: 'LEG 1 regression coverage (lock released on throw, queue preserved)'
    - path: src/backend/sidecar/__tests__/playtimeLockBootClear.test.ts
      provides: 'LEG 2 regression coverage (stranded arm, clean arm, init() wiring proof)'
  key_links:
    - from: src/backend/sidecar/bootstrap.ts
      to: src/backend/storeManagers/gog/electronStores.ts
      via: 'import { playtimeSyncQueue }'
      pattern: "playtimeSyncQueue.*storeManagers/gog/electronStores"
    - from: 'init()'
      to: 'clearStrandedPlaytimeSyncLock()'
      via: 'guarded Block D call site before READY_SENTINEL'
      pattern: 'clearStrandedPlaytimeSyncLock\('
---

<objective>
Fix finding A1: GOG playtime sync is permanently wedged after one interrupted sync.

`syncQueuedPlaytime()` (`gog/library.ts:169`) is a critical section guarded by a sentinel key,
with no `try/finally` and no boot-time recovery. Once the `lock` key is stranded, it is
stranded **forever**, and every subsequent `syncQueuedPlaytime()` call short-circuits at line
170.

Purpose: restore GOG playtime sync's ability to recover from both of its failure modes.
Output: two source fixes, two regression suites, one closed todo.

## The defect is already diagnosed — do NOT re-diagnose it

Recorded here so the fix comments can cite the mechanism accurately:

- `playtimeSyncQueue` is a `CacheStore` backed by a real file under `store_cache/`
  (`gog/electronStores.ts:42`). It survives process restarts.
- `CacheStore` has a lifespan/expiry path, but expiry is evaluated **only inside `get()`**
  (`cache.ts:64-88`, which deletes the stale key and returns the fallback). The guard at
  `library.ts:170` uses `has()` (`cache.ts:142`), a raw `current_store.has(key)` passthrough
  with **no expiry check at all**. Nothing anywhere calls `get('lock')`, so the expiring path
  is never reached for that key. The lock therefore never ages out.
- The deleted Electron `main.ts:469` cleared a stranded lock at every boot
  (`playtimeSyncQueue.delete('lock')`). That line has **no successor** in the Tauri sidecar
  (`src/backend/main.ts` no longer exists; confirmed at planning time).

## Both legs are required — they cover DISJOINT failure modes

| Leg | Covers | Cannot cover |
|-----|--------|--------------|
| LEG 1 — `try/finally` | An in-process throw (network error, rejected promise) during the post loop | Process death: SIGKILL, a crash, a power loss. `finally` never runs. |
| LEG 2 — boot-time clear | Process death mid-sync, on the next boot | Nothing — but it only runs at boot, so within a single long-lived session a throw would still wedge sync until restart. |

Neither leg alone fixes the wedge. Ship both.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/todos/pending/2026-09-06-gog-playtime-sync-lock-never-cleared-at-boot.md
@CLAUDE.md

Source under change:
@src/backend/storeManagers/gog/library.ts
@src/backend/sidecar/bootstrap.ts

Mechanism reference (read-only — do NOT modify):
@src/backend/cache.ts
@src/backend/storeManagers/gog/electronStores.ts

Test files:
@src/backend/storeManagers/gog/__tests__/library.test.ts

Shape precedent for the new sidecar test file (read this before writing it — it is the
repo's established answer to "how do you test a once-guarded boot block"):
@src/backend/sidecar/__tests__/migrationsWiring.test.ts
</context>

<interfaces>
<!-- Extracted at planning time. Use these directly — no codebase exploration needed. -->

Current critical section, `src/backend/storeManagers/gog/library.ts:169-207` (verbatim shape):

  async syncQueuedPlaytime() {
    if (playtimeSyncQueue.has('lock')) { return }
    const userData: UserData | undefined = configStore.get_nodefault('userData')
    if (!userData) { logError(...); return }
    const queue = playtimeSyncQueue.get(userData.galaxyUserId, [])
    if (queue.length === 0) { return }
    playtimeSyncQueue.set('lock', [])
    const failed = []
    for (const session of queue) { ...await this.postPlaytimeSession(session)... }
    playtimeSyncQueue.set(userData.galaxyUserId, failed)
    playtimeSyncQueue.delete('lock')
    logInfo([...])
  }

`postPlaytimeSession` is a PUBLIC method on `export default class GOGLibraryManager`
(`library.ts:70`), constructed in tests as `new GOGLibraryManager()` — so
`jest.spyOn(manager, 'postPlaytimeSession')` works directly.

From `src/backend/cache.ts`:

  public get(key: KeyType, fallback?: ValueType)   // L64 — expiry evaluated HERE only
  public set(key: KeyType, value: ValueType)       // L110
  public delete(key: KeyType)                      // L122
  public has(key: string)                          // L142 — raw passthrough, NO expiry check

From `src/backend/storeManagers/gog/electronStores.ts:42`:

  const playtimeSyncQueue = new CacheStore<Array<GOGSessionSyncQueueItem>>(
    'gog_playtime_sync_queue'
  )

Existing module-scope idempotency guards in `src/backend/sidecar/bootstrap.ts` (L140-174) —
the convention Task 2 must follow:

  let loggerInitialized = false
  let onlineMonitorInitialized = false
  let i18nInitialized = false
  let anticheatListenerRegistered = false
  let releasesFetchInitialized = false
  let migrationsInitialized = false
  let protocolUrlHandlerRegistered = false

Existing exported module-scope helpers called from `init()` (the convention Task 2's extracted
helper follows):

  export function deliverStartupProtocolUrl(...)   // bootstrap.ts:202
  export function registerProtocolUrlHandler(): void  // bootstrap.ts:245
  export function init(input, output): void        // bootstrap.ts:265

Block landmarks inside `init()`:

  L593  // Block A — re-homed `releasesInfoReady` anticheat listener (D-04)
  L640  // Block B — fetchLastestReleases() (D-07)
  L656  // Block C — the `installed.json` watcher (Phase 35 plan 35-10, REQ-35-16)
  L688  output.write(`${READY_SENTINEL}\n`)
  L693  deliverStartupProtocolUrl()   // deliberately AFTER the sentinel

Already-present mock scaffolding in `gog/__tests__/library.test.ts` (L80-109) — extend, do not
rebuild:

  jest.mock('../electronStores', () => ({
    ...
    configStore: { get_nodefault: jest.fn(), set: jest.fn(), clear: jest.fn() },
    playtimeSyncQueue: { has: jest.fn(), get: jest.fn(), set: jest.fn(), delete: jest.fn() }
  }))

  const mockIsOnline = jest.fn(() => true)   // L50 — set TRUE in the new tests (see fences)

The file's established convention (documented in its own header, L60-66): `jest.config.js` sets
`resetMocks: true`, so factory-supplied implementations are wiped before the first test runs.
Mocks that need behaviour are declared as module-scope `const mockX = jest.fn()` and wired into
the factory as `(...a: unknown[]) => mockX(...a)` delegating arrows (the arrow is a plain
function and survives the reset; the impl is installed in `beforeEach`).
</interfaces>

<scope_fences>
Three things are deliberately NOT in scope. Do not helpfully fix them.

1. **The adjacent double-push bug at `gog/library.ts:188-196`.** When offline, the loop pushes
   the session to `failed` and then STILL calls `postPlaytimeSession(session)`, so a failure
   pushes the same session twice — a missing `continue`. It is a real defect inherited verbatim
   from upstream Heroic, and it is SEPARATE. Leave it exactly as it is. The LEG 1 test must set
   `mockIsOnline.mockReturnValue(true)` so this branch is never entered and the new test never
   accidentally depends on the buggy shape.

2. **The boot-time queue DRAIN.** Do NOT restore `runOnceWhenOnline(() => syncQueuedPlaytime())`
   in bootstrap. That is finding A2, separately filed as
   `.planning/todos/pending/2026-09-06-queued-gog-playtime-never-drains-at-boot.md`. This task
   only CLEARS the lock; it does not make sync run at boot.

3. **Any other finding's code.** No opportunistic edits outside the four files in
   `files_modified`.
</scope_fences>

<concurrent_session_hazard>
**Another session is ACTIVE in this repo right now with uncommitted work.** Measured at planning
time (`git status --porcelain`):

     M .planning/ROADMAP.md
     M .planning/STATE.md
    ?? .planning/phases/42-humble-key-platform-identity-evidenced-key-type-table-drivin/
    ?? .claude/skills/archify/
    ?? skills-lock.json

That is another session's in-flight Phase 42 work. The set changed between this task's briefing
and planning (an `enrichmentFlows.test.ts` modification disappeared; the Phase 42 directory
appeared), which is direct evidence the other session is moving right now. Treat the working
tree as hostile.

Binding rules for this task:

- **Do NOT update `.planning/STATE.md`, and never stage it.** This is a deliberate, stated
  deviation from the normal quick-task flow. Staging STATE.md would commit the other session's
  Phase 42 Roadmap-Evolution entry inside this fix commit. Record the deviation in SUMMARY.md so
  the STATE row can be added later.
- **Do NOT touch or stage `.planning/ROADMAP.md`.** (Quick tasks never do anyway.)
- **Stage ONLY explicit paths.** Never `git add -A`, never `git add .`, never
  `gsd-sdk query commit` — the SDK stages the entire tree (standing finding
  `gsd-sdk-commit-stages-entire-tree`). Use `git add <explicit path> <explicit path> ...` and
  verify with `git status --porcelain` **before** committing.
- **Never `git stash`, `git reset`, `git revert`, or `git checkout`.** Any of these would strand
  the other session's work. `git checkout -- <file>` additionally fires this repo's post-checkout
  hook, which throws (standing finding `git-checkout-fires-post-checkout-hook`). If a file must
  be restored, use `git show HEAD:<path> > <path>`.
- `graphify-out/` is untracked in this repo (verified: `git ls-files graphify-out` returns
  0 files), so `graphify update .` cannot dirty the index. Still confirm with
  `git status --porcelain` before staging.
</concurrent_session_hazard>

<red_then_green_discipline>
Every test in this plan must be proven RED against the current code before the fix lands, and
GREEN after. "Tests pass" is not acceptable evidence — a test written after the fix can pass
while measuring nothing (this repo has been burned by that repeatedly).

For each task, the executor must record in SUMMARY.md, verbatim:
- the exact jest command run,
- the RED output line(s) (the failing assertion and its actual-vs-expected), taken BEFORE the
  source edit,
- the GREEN output line(s), taken AFTER.

**Never chain a file write and a jest run in one shell command with `&&`.** The standing finding
`jest-in-the-same-command-as-a-write-reads-stale` recorded a wrong count reaching a committed
summary that way. Write the file. Then, as a separate tool call, run jest.
</red_then_green_discipline>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: LEG 1 — release the lock on a throw (try/finally)</name>
  <files>
    src/backend/storeManagers/gog/__tests__/library.test.ts
    src/backend/storeManagers/gog/library.ts
  </files>

  <behavior>
    New describe block in `library.test.ts`, titled to name the finding, e.g.
    `'finding A1 LEG 1 -- syncQueuedPlaytime releases the lock when postPlaytimeSession throws'`.

    - Test 1 (the regression): with two queued sessions and `postPlaytimeSession` rejecting,
      `syncQueuedPlaytime()` settles and `playtimeSyncQueue.has('lock')` is `false` afterward.
      RED today: the rejection propagates out of the function with `lock` still set.
    - Test 2 (the property that must NOT be "improved" away): after the same rejection,
      `playtimeSyncQueue.get(galaxyUserId, [])` still returns BOTH original sessions — the queue
      was not overwritten, so no session was lost.
    - Test 3 (do not regress the happy path): with `postPlaytimeSession` resolving
      `{ status: 201 }` for both sessions, the lock is released AND the queue is overwritten with
      the (empty) `failed` array — proving the `finally` did not change success-path semantics.
  </behavior>

  <action>
    STEP A — extend the existing `jest.mock('../electronStores', ...)` factory at L80-109. Do not
    rebuild it. Following the file's own delegating-arrow convention (documented in its header at
    L60-66, and used by `mockLibraryStoreGet` et al.), add module-scope declarations near the
    existing `const mockLibraryStoreGet = jest.fn()` group:

      mockPlaytimeHas, mockPlaytimeGet, mockPlaytimeSet, mockPlaytimeDelete,
      mockConfigStoreGetNodefault

    and rewire the factory's `playtimeSyncQueue` and `configStore.get_nodefault` entries to
    `(...a: unknown[]) => mockX(...a)` arrows. Verified at planning time: NO existing test in this
    file references `configStore` or `playtimeSyncQueue` (the only occurrence of each is the
    factory itself), so this promotion cannot disturb the three existing describe blocks.

    STEP B — in the new describe's `beforeEach`, back the four playtime mocks with a real
    `Map<string, unknown>` so `has()` reflects true state rather than a canned boolean. `get` must
    honour the two-arg fallback form (`get(key, fallback)`) because `syncQueuedPlaytime` calls
    `playtimeSyncQueue.get(userData.galaxyUserId, [])`. Point `mockConfigStoreGetNodefault` at
    `{ galaxyUserId: 'gid-1' }`, and set `mockIsOnline.mockReturnValue(true)` (see scope fence 1 —
    the offline branch is a separate, out-of-scope defect and this suite must not touch it).
    Drive failure with `jest.spyOn(manager, 'postPlaytimeSession')` — it is a public method.

    STEP C — run jest on this file and CAPTURE THE RED OUTPUT before editing any source.

    STEP D — apply LEG 1 to `syncQueuedPlaytime()`. The required structure, exactly:

      playtimeSyncQueue.set('lock', [])
      const failed = []
      try {
        for (...) { ...unchanged... }
        playtimeSyncQueue.set(userData.galaxyUserId, failed)
      } finally {
        playtimeSyncQueue.delete('lock')
      }
      logInfo(...)

    The `set(userData.galaxyUserId, failed)` line stays INSIDE the `try`, as its last statement.
    This is deliberate and load-bearing: if the loop throws, that line does not run, so the queue
    keeps its original contents and no sessions are lost — only the lock is released. **Do not
    "improve" this by moving that `set` into the `finally`.** Doing so would overwrite the full
    queue with a partial `failed` array on every throw, silently discarding sessions. Say this in
    a code comment at the `finally`, so the next reader does not undo it.

    Add a second short comment above the `has('lock')` guard recording WHY a stranded lock is
    permanent: `playtimeSyncQueue` is a file-backed `CacheStore` that survives restarts, and
    `CacheStore` evaluates its lifespan only inside `get()` (`cache.ts:64-88`) — `has()`
    (`cache.ts:142`) is a raw passthrough with no expiry check, and nothing ever calls
    `get('lock')`, so the expiring path is unreachable for this key. Reference the companion boot
    clear in `bootstrap.ts` (Block D) so the two legs are discoverable from each other.

    Leave the loop body byte-identical — scope fence 1.

    STEP E — re-run jest as a SEPARATE tool call (never `&&` after a write) and capture GREEN.
  </action>

  <verify>
    <automated>npx jest src/backend/storeManagers/gog/__tests__/library.test.ts</automated>
  </verify>

  <done>
    All three new tests green, and the three pre-existing describe blocks in the file still green
    (same run). RED output captured before the source edit and GREEN after, both quoted in
    SUMMARY.md. `gog/library.ts:188-196` unchanged.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: LEG 2 — clear a stranded lock at sidecar boot (Block D)</name>
  <files>
    src/backend/sidecar/__tests__/playtimeLockBootClear.test.ts
    src/backend/sidecar/bootstrap.ts
  </files>

  <behavior>
    New file `src/backend/sidecar/__tests__/playtimeLockBootClear.test.ts`, modelled on
    `migrationsWiring.test.ts` (read it first — same problem, same shape).

    - Test 1, WIRING PROOF (must be the FIRST test in the file that calls `init()`): seed
      `playtimeSyncQueue.set('lock', [])` on the real store, then `init(new PassThrough(), new
      PassThrough())`, then assert `playtimeSyncQueue.has('lock') === false` and that the exact
      warning text was logged. This is the test that proves the helper is actually CALLED from
      `init()`, not merely present. RED today: `init()` has no such call at all.
    - Test 2, STRANDED ARM: call the exported helper directly with a seeded lock — lock gone,
      exact message logged once.
    - Test 3, CLEAN ARM: call the exported helper directly with NO lock seeded — the store is
      untouched and NOTHING is logged. A normal boot must be silent here.
  </behavior>

  <action>
    STEP A — read `src/backend/sidecar/__tests__/migrationsWiring.test.ts` in full before writing.
    It is the repo's established precedent for testing a once-guarded boot block, including its
    `jest.mock('backend/store_backend', ...)` routing and its explicit note that containment comes
    from `src/backend/jest.setupContainment.ts`'s `setupFiles` registration, NOT a per-suite
    `jest.mock('os')`.

    WHY A DEDICATED FILE, and not `bootstrap.test.ts` as the briefing proposed. Verified at
    planning time: `bootstrap.test.ts` already calls `init()` at ~L138 ("reaches READY under bare
    node"), long before any new describe block would run. A module-scope once-guard flag — which
    this block must have, per the file's convention — would already be consumed, so a
    boot-clear test placed later in that file could only ever measure a no-op. The alternatives
    were both worse: `jest.resetModules()` + a fresh `require('../bootstrap')` re-evaluates
    `installElectronHook`, which has NO idempotency guard (verified: `installElectronHook.ts:44-46`
    rebinds `Module._load` unconditionally) and would leave a nested global hook in the worker for
    every subsequent suite. A virgin file gets a virgin registry and a virgin flag for free, with
    zero module tricks. `migrationsWiring.test.ts` exists for exactly this reason. **Record this
    deviation and its measured justification in SUMMARY.md.**

    STEP B — write the test file. Test 1 must be first. For Tests 2 and 3, spy on the logger the
    way `bootstrap.test.ts:281` does (`jest.spyOn(loggerModule, 'logWarning')` against
    `import * as loggerModule from '../../logger'` — `bootstrap.ts` imports from `'../logger'`,
    which resolves to the same `src/backend/logger` module object, so the spy is visible to it).
    Assert on the emitted log TEXT, not merely that a logger function was called — same standard
    as the `GAMELIB_SHELL_EXE` receipt tests.

    STEP C — run jest on the new file and CAPTURE THE RED OUTPUT before editing `bootstrap.ts`.
    Expect Test 1 to fail on the surviving lock and Tests 2-3 to fail on the missing export.

    STEP D — add the import to `bootstrap.ts`, placed in the Step 2 region **after**
    `import './handlers'` (never before it — Step 1's `installElectronHook` must have run, and
    `./handlers` has already pulled this module in transitively by then anyway). This file's
    curated-import discipline requires the reason in the comment:

      // Block D (finding A1, quick-260907-odi). Adds NO new module to the sidecar bundle:
      // `sidecar/storeRegistration.ts:61` already imports `playtimeSyncQueue` from this exact
      // module, so this is a second binding onto an already-resident singleton, not a new edge.
      import { playtimeSyncQueue } from '../storeManagers/gog/electronStores'

    STEP E — add the module-scope guard flag alongside the existing seven (after
    `protocolUrlHandlerRegistered`, ~L174), matching their comment style — same stated reason:
    `bootstrap.test.ts` / `*Flows.test.ts` call `init()` many times per file, production calls it
    once:

      let playtimeLockClearInitialized = false

    STEP F — add the exported helper at module scope, following the
    `deliverStartupProtocolUrl` / `registerProtocolUrlHandler` precedent (both are exported
    module-scope helpers called from `init()`; the export exists so the two arms are directly
    testable under the once-guard):

      export function clearStrandedPlaytimeSyncLock(): void

    Body requirements:
    - Check `playtimeSyncQueue.has('lock')` FIRST and return silently if absent. Log only when it
      actually clears something, so a stranded lock becomes OBSERVABLE rather than silently
      healed. A normal boot must log nothing here.
    - On the clearing path: `playtimeSyncQueue.delete('lock')` then exactly
      `logWarning('[bootstrap] Cleared a stranded GOG playtime sync lock left by an interrupted sync', LogPrefix.Backend)`.
      `logWarning`, not `logInfo`: a stranded lock means a previous sync died mid-flight, which is
      an anomaly worth surfacing, and the file already reserves `logWarning` for its abnormal
      boot paths.
    - Wrap the whole body in `try/catch`, logging a `logWarning` on failure. This file's standing
      rule is that a boot-time block must never fail boot.
    - Header comment must state: what `main.ts:469` did and that it has no successor; that this is
      the process-death half of a two-leg fix whose other half is the `try/finally` in
      `gog/library.ts` (`finally` cannot survive SIGKILL, which is why this exists); and that the
      lock never ages out on its own because `CacheStore.has()` skips the expiry check that only
      `get()` performs.

    STEP G — add the guarded call site as **Block D**, immediately after Block C's
    `startInstalledJsonWatcher()` block (~L686) and immediately **before**
    `output.write(\`${READY_SENTINEL}\n\`)` at L688. Placement rationale for the comment: after
    `initLogger()` (the helper logs, and `heroicLogWriter` is unset before that — the standing
    `sidecar-console-and-logger-are-invisible` finding), and before READY so the lock is already
    clear by the time any RPC-driven playtime sync can arrive. This mirrors `main.ts`'s ordering
    intent, where the clear ran during app startup rather than lazily. Shape matches Blocks A/B:

      if (!playtimeLockClearInitialized) {
        playtimeLockClearInitialized = true
        clearStrandedPlaytimeSyncLock()
      }

    STEP H — re-run jest on the new file as a SEPARATE tool call and capture GREEN. Then run
    `bootstrap.test.ts` too, to prove Block D did not disturb the existing boot sequence.
  </action>

  <verify>
    <automated>npx jest src/backend/sidecar/__tests__/playtimeLockBootClear.test.ts src/backend/sidecar/__tests__/bootstrap.test.ts</automated>
  </verify>

  <done>
    All three new tests green; `bootstrap.test.ts` still fully green. RED captured before the
    `bootstrap.ts` edit, GREEN after, both quoted in SUMMARY.md. Block D sits between Block C and
    the `READY_SENTINEL` write. No boot-time DRAIN was added (scope fence 2).
  </done>
</task>

<task type="auto">
  <name>Task 3: Gates — graph refresh, full backend suite, typecheck, lint, prettier</name>
  <files>(no source changes — verification only)</files>

  <action>
    STEP A — `graphify update .` (CLAUDE.md requires it after a source change; AST-only, no API
    cost). Then `git status --porcelain` and confirm nothing under `graphify-out/` appears —
    it is untracked in this repo (verified at planning time). Note that `graphify update .`
    deletes `graph.html` as a side effect (standing finding); that is expected and, because the
    directory is untracked, has no staging consequence. Do not stage anything from it.

    STEP B — run the full backend jest project once:
      `npx jest src/backend`
    Compare the failure set against HEAD's known baseline before attributing anything to this
    change. Standing finding `full-suite-run-manufactures-failures-under-load`: a full run can
    manufacture failures that a targeted run does not. If a failure appears, hold the commit
    constant and vary the tree to attribute it (`hold-the-commit-constant-vary-the-tree`) —
    do NOT record "pre-existing" without naming the sha you compared against.

    STEP C — `pnpm codecheck` (this is `tsc --noEmit` only; standing finding
    `verifier-tsc-gate-cannot-see-lint-errors` — it says NOTHING about lint).

    STEP D — `pnpm lint` separately. Note the script carries a warning budget
    (`eslint --cache --max-warnings 4157 .`). If the new code pushes the count over budget, FIX
    the new warnings. Do not raise the budget number.

    STEP E — `npx prettier --check` on the four touched files, run against the real files in the
    repo (never a temp copy — standing finding `prettier-check-on-a-temp-copy-resolves-a-different-config`).
    The `.husky/pre-push` prettier gate is known to re-redden; dry-run it, never assume.
    Fix with `npx prettier --write` on those exact paths if it complains.
  </action>

  <verify>
    <automated>npx jest src/backend && npx tsc --noEmit</automated>
  </verify>

  <done>
    Backend suite green (or every failure attributed to a named baseline sha, with the comparison
    method stated). `tsc --noEmit` clean. `pnpm lint` within budget. `prettier --check` clean on
    all four touched files. `graphify-out/` confirmed absent from `git status --porcelain`.
  </done>
</task>

<task type="auto">
  <name>Task 4: Close the todo, commit by explicit path, write SUMMARY</name>
  <files>
    .planning/todos/completed/2026-09-06-gog-playtime-sync-lock-never-cleared-at-boot.md
    .planning/quick/260907-odi-fix-gog-playtime-sync-lock-never-release/260907-odi-SUMMARY.md
  </files>

  <action>
    STEP A — close the todo:
      `git mv .planning/todos/pending/2026-09-06-gog-playtime-sync-lock-never-cleared-at-boot.md .planning/todos/completed/`
    Then edit the moved file: set the `status:` field to a prose RESOLVED string matching the
    directory's recent convention (e.g. `status: "RESOLVED 2026-09-07 by quick-260907-odi. ..."`).
    The resolution text must state:
    - BOTH legs shipped, and that they cover disjoint failure modes (in-process throw vs process
      death) — neither alone would have fixed the wedge;
    - that the todo's own "Fix sketch" prescribed only the boot-clear leg and explicitly argued
      against changing `syncQueuedPlaytime()` itself; that half of its reasoning is superseded —
      the boot clear alone leaves an in-session throw wedging sync until the next restart;
    - that **A2 remains OPEN**: the queue still does not DRAIN at boot
      (`2026-09-06-queued-gog-playtime-never-drains-at-boot.md`). This task cleared the lock; it
      did not make sync run.
    Add a `closed:` / `closed_by:` pair if the surrounding files use one.

    STEP B — stage by EXPLICIT PATH ONLY. Never `git add -A`, never `git add .`, never
    `gsd-sdk query commit`. Exactly these paths and no others:

      git add \
        src/backend/storeManagers/gog/library.ts \
        src/backend/sidecar/bootstrap.ts \
        src/backend/storeManagers/gog/__tests__/library.test.ts \
        src/backend/sidecar/__tests__/playtimeLockBootClear.test.ts \
        .planning/todos/completed/2026-09-06-gog-playtime-sync-lock-never-cleared-at-boot.md \
        .planning/todos/pending/2026-09-06-gog-playtime-sync-lock-never-cleared-at-boot.md \
        .planning/quick/260907-odi-fix-gog-playtime-sync-lock-never-release/

    (the pending path is staged so the `git mv` deletion is recorded; if `git mv` already staged
    both sides, this is a harmless no-op.)

    STEP C — **before committing**, run `git status --porcelain` and confirm:
    - `.planning/STATE.md` shows ` M` (unstaged) — NOT `M ` or `MM`;
    - `.planning/ROADMAP.md` shows ` M` (unstaged);
    - `.planning/phases/42-*/`, `.claude/skills/archify/` and `skills-lock.json` remain `??`.
    If any of the other session's files appear staged, `git restore --staged <path>` that path
    (index-only; it does not touch the working tree and does not fire the post-checkout hook).
    **Do not proceed until the staged set is exactly the seven paths above.**

    STEP D — commit with `git commit -m "..."` (NOT the SDK). Message:
      `fix(gog): release the playtime sync lock on throw and clear a stranded one at boot`
    with a body naming finding A1, both legs, and the fact that A2 stays open.

    STEP E — write SUMMARY.md at
    `.planning/quick/260907-odi-fix-gog-playtime-sync-lock-never-release/260907-odi-SUMMARY.md`,
    including:
    - the RED-then-GREEN evidence for both legs, quoted verbatim (per
      `<red_then_green_discipline>`);
    - the DELIBERATE DEVIATION: STATE.md was NOT updated and NOT staged, because another session
      held uncommitted Phase 42 work in ROADMAP.md and STATE.md at execution time. The STATE row
      for this task must be added later, by hand, once that session lands. State this loudly —
      an omitted STATE row that nobody records becomes an invisible gap.
    - the SECOND DEVIATION: the LEG 2 boot test lives in a new
      `sidecar/__tests__/playtimeLockBootClear.test.ts` rather than in `bootstrap.test.ts`, with
      the measured reason (the once-guard is already consumed by `bootstrap.test.ts`'s earlier
      `init()` at ~L138; `installElectronHook` has no idempotency guard so `resetModules` was
      rejected; `migrationsWiring.test.ts` is the standing precedent).
    - the OUT-OF-SCOPE items left standing, by name: the `gog/library.ts:188-196` double-push
      (missing `continue`, inherited from upstream Heroic) and finding A2 (no boot drain).
  </action>

  <verify>
    <automated>git show --stat HEAD | grep -qv 'STATE.md' && git show --stat HEAD</automated>
  </verify>

  <done>
    Todo moved to `completed/` with a RESOLVED status naming both legs and A2's continued open
    state. Commit contains exactly the seven intended paths — `git show --stat HEAD` shows NO
    `.planning/STATE.md` and NO `.planning/ROADMAP.md`. The other session's working-tree changes
    are still present and unstaged after the commit. SUMMARY.md written with RED/GREEN evidence
    and both deviations recorded.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| gameplay.gog.com → sidecar | Remote HTTP responses drive the loop that owns the lock; a hostile or merely broken endpoint can throw at will. |
| on-disk `store_cache/gog_playtime_sync_queue.json` → sidecar | A persisted file read at boot; its contents outlive the process. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ODI-01 | Denial of Service | `syncQueuedPlaytime()` lock | mitigate | This IS the defect. A single failed HTTP call permanently disables playtime sync — a self-inflicted DoS reachable by any transient network error. Closed by LEG 1 (`try/finally`) plus LEG 2 (boot clear). |
| T-ODI-02 | Tampering | queued session data | mitigate | The `set(galaxyUserId, failed)` stays inside the `try` so a throw cannot overwrite the queue with a partial `failed` array. Explicitly called out in Task 1 STEP D with a code comment forbidding the "improvement" that would break it. |
| T-ODI-03 | Denial of Service | `bootstrap.ts` `init()` | mitigate | Block D is wrapped in `try/catch` per the file's standing rule: a boot-time block must never fail boot. A corrupt/unreadable cache file cannot prevent the sidecar reaching READY. |
| T-ODI-04 | Information Disclosure | Block D's warning log | accept | The emitted message is a fixed string with no user data, no `galaxyUserId`, and no session contents. |
| T-ODI-SC | Tampering | npm/pip/cargo installs | n/a | **No package installs in this task.** All four touched files use existing in-repo imports; `playtimeSyncQueue` is already resident in the sidecar bundle via `storeRegistration.ts:61`. No legitimacy audit required. |
</threat_model>

<verification>
1. `npx jest src/backend/storeManagers/gog/__tests__/library.test.ts` — green, including the three
   pre-existing describe blocks.
2. `npx jest src/backend/sidecar/__tests__/playtimeLockBootClear.test.ts src/backend/sidecar/__tests__/bootstrap.test.ts` — green.
3. `npx jest src/backend` — green, or every failure attributed to a named baseline sha.
4. `pnpm codecheck` clean; `pnpm lint` within its 4157 budget; `npx prettier --check` clean on the
   four touched files.
5. `git show --stat HEAD` contains NO `.planning/STATE.md` and NO `.planning/ROADMAP.md`.
6. `git status --porcelain` after the commit still shows the other session's ` M` ROADMAP.md,
   ` M` STATE.md, and its `??` entries — untouched.
7. `grep -n 'finally' src/backend/storeManagers/gog/library.ts` finds the new block; the
   double-push at L188-196 is unchanged (`git diff HEAD~1 -- src/backend/storeManagers/gog/library.ts`
   shows no edit inside the loop body).
</verification>

<success_criteria>
- A rejecting `postPlaytimeSession` no longer strands the lock, and no queued session is lost.
- A sidecar boot that finds a stranded lock clears it and emits exactly one warning naming it;
  a clean boot emits nothing.
- Both behaviours are pinned by tests proven RED before the fix and GREEN after, with the
  evidence quoted in SUMMARY.md.
- The todo is closed with a resolution naming both legs and stating that A2 remains open.
- The commit contains only this task's seven paths; the concurrent session's uncommitted Phase 42
  work is untouched and still uncommitted.
- The skipped STATE.md update is recorded in SUMMARY.md as a deliberate deviation to be repaired
  later, not silently dropped.
</success_criteria>

<output>
Create `.planning/quick/260907-odi-fix-gog-playtime-sync-lock-never-release/260907-odi-SUMMARY.md`
when done.
</output>
</content>
</invoke>
