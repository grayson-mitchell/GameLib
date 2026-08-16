---
quick_id: 260816-vgc
type: execute
mode: quick
wave: 1
depends_on: []
autonomous: true
files_modified:
  - src/backend/downloadmanager/__tests__/utils.test.ts
  - src/backend/downloadmanager/utils.ts
  - .planning/todos/pending/2026-08-16-orphaned-depot-download-outlives-failure.md
  - .planning/todos/pending/2026-08-16-aborted-depot-residue-has-no-acf.md

must_haves:
  truths:
    - "A DownloadManager install failure (watchdog trip, resolved error, or thrown error) issues the same abort a user Cancel issues — callAbortController(appName), and SteamGame.stop(false) for the steam runner."
    - "The abort fires for all three terminal-failure shapes, not just the watchdog trip."
    - "A successful install and a user-cancelled install do NOT trigger the new abort (no double-abort, no regression)."
    - "A non-steam runner gets callAbortController but NOT .stop() — legendary's stop() calls killPattern('legendary') and must not fire automatically."
    - "nativeInstallsInFlight is released on the failure path (SteamGame.stop flips `aborted`, the abort unwinds runNativeDepotDownload, whose finally deletes the entry), so an immediate retry starts a fresh run instead of joining a tearing-down one."
  artifacts:
    - path: "src/backend/downloadmanager/utils.ts"
      provides: "failure-path abort routed through the cancel-path primitives"
      contains: "callAbortController"
    - path: "src/backend/downloadmanager/__tests__/utils.test.ts"
      provides: "RED-proven regression specs for the failure-path abort"
    - path: ".planning/todos/pending/2026-08-16-aborted-depot-residue-has-no-acf.md"
      provides: "explicit deferral of the partial-byte/.acf reconcilability bullet"
  key_links:
    - from: "src/backend/downloadmanager/utils.ts (installQueueElement finally, status === 'error')"
      to: "backend/utils/aborthandler/aborthandler.callAbortController"
      via: "direct call, runner-agnostic"
      pattern: "callAbortController\\(appName\\)"
    - from: "src/backend/downloadmanager/utils.ts"
      to: "SteamGame.stop(false)"
      via: "libraryManagerMap[runner].getGame(appName).stop(false), steam-gated"
      pattern: "\\.stop\\(false\\)"
---

<objective>
A Steam native depot install that FAILS does not abort its own in-flight depot download. On
2026-08-16 a HUMANKIND (`1124300`) install was declared failed at 21:36:40 with
`install did not settle — connection may be stale`, and the chunk-stream loop kept running for
~5 more minutes, writing 4,486 orphaned files with no `appmanifest_*.acf` ever written.

The abort machinery already exists and works — a user Cancel on the same build, same session,
14 minutes later logged `SteamGame: aborting in-flight native depot download for appId 1091500`
and the chunk loop stopped the same second.

Purpose: route the DownloadManager failure path through the same two calls the Cancel path
already makes, so a failed install stops consuming bandwidth and disk.
Output: a RED-proven regression suite, a ~15-line change in `downloadmanager/utils.ts`, and an
explicit deferral record for the one requirement this fix does not close.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/todos/pending/2026-08-16-orphaned-depot-download-outlives-failure.md
@./CLAUDE.md

Project skill (invoke before editing Steam depot code): `Skill("spike-findings-gamelib")`

**Codebase-exploration rule (project hook):** `graphify-out/graph.json` exists. If you need to
explore beyond the files named in this plan, run `graphify query "<question>"` /
`graphify explain "<concept>"` / `graphify path "<A>" "<B>"` BEFORE grepping or reading raw
source. The orientation for this plan has already been done — the findings below are the result.
You should not need broad exploration.

**Working-tree hygiene (MANDATORY):**
`src/backend/storeManagers/steam/library.ts` and
`src/backend/storeManagers/steam/__tests__/library.test.ts` carry PRE-EXISTING uncommitted
changes from concurrent work. Leave them completely alone.
- NEVER run `git stash` (this has stranded a concurrent session's work twice in this repo).
- NEVER run `git checkout --` / `git restore` on any file.
- Stage ONLY the files this plan modifies, by explicit path. No `git add -A`, no `git add .`.
- You are working directly on branch `fix/steam-native-install-stability`. No worktree
  (GameLib worktrees are hard-blocked by a `.husky/post-checkout` hook).
</context>

<interfaces>
<!-- Extracted from the codebase during planning. Use these directly — no exploration needed. -->

**The Cancel path that already works** — `src/backend/downloadmanager/downloadqueue.ts`:

```
L329  function cancelCurrentDownload({ removeDownloaded = false }) {
L337    if (isRunning()) { stopCurrentDownload() }
...
L378  function stopCurrentDownload() {
L379    const { appName, runner } = currentElement!.params
L380    callAbortController(appName)
L381    libraryManagerMap[runner].getGame(appName).stop(false)
L382  }
```

`stopCurrentDownload` is NOT exported, and `downloadqueue.ts` imports `installQueueElement` from
`./utils` — so `utils.ts` must NOT import from `downloadqueue.ts` (circular). Call the two
primitives directly instead. `downloadqueue.ts:11` shows the import path:
`import { callAbortController } from 'backend/utils/aborthandler/aborthandler'`.

**`callAbortController` is safe to call unconditionally** — `src/backend/utils/aborthandler/aborthandler.ts`:

```
L12  function callAbortController(id: string) {
L13    if (abortControllers.has(id)) { ... if (!abortController.signal.aborted) abortController.abort() ... }
```
Unregistered id → silent no-op. Already-aborted → no-op (idempotent by design).

**`SteamGame.stop()`** — `src/backend/storeManagers/steam/games.ts` L2494:

```ts
async stop(_stopWine?: boolean): Promise<void> {
  const inFlight = nativeInstallsInFlight.get(this.appId)
  if (inFlight) {
    logInfo(`SteamGame: aborting in-flight native depot download for appId ${this.appId}`, LogPrefix.Steam)
    inFlight.aborted = true          // T-23-15 bookkeeping — REQUIRED, see below
    callAbortController(this.appId)
    return
  }
  logWarning(`SteamGame.stop: Steam owns process lifecycle for appId ${this.appId}; no-op`, LogPrefix.Steam)
}
```

**Why `callAbortController` ALONE is not enough for steam.** `installDepotDownload` (games.ts
L1388) joins an existing entry when `aborted === false`:

```ts
const existing = nativeInstallsInFlight.get(this.appId)
if (existing) {
  if (!existing.aborted) { return existing.promise }   // JOIN — a retry would get the dying run's result
  await existing.promise.catch(() => undefined)        // tearing down — wait, then start fresh
}
```
Only `stop()` flips `aborted`. Without it, an immediate user retry joins the tearing-down promise
and instantly "fails" again. `stop()` is what makes the retry bullet true.

**Why `.stop()` must be steam-gated.** `legendary/games.ts` L1081 `stop()` calls
`killPattern('legendary')` — on Windows that kills EVERY legendary process, not just this
install's. Acceptable for a deliberate user cancel; not acceptable as an automatic reaction to any
install error. `callAbortController` is the correct, targeted kill for gogdl/legendary child
processes and stays runner-agnostic.

**The failure path to change** — `src/backend/downloadmanager/utils.ts`, `installQueueElement`:

- L152-169: `await withTimeout(...install(...), INSTALL_WATCHDOG_MS, 'installQueueElement install watchdog')`.
  **`withTimeout` rejects the OUTER promise but does nothing to the inner one** — this is exactly
  how the depot run got orphaned. Nothing else in this function touches it.
- L170-181: try-branch — `status = resultStatus`, returns `{ status: resultStatus }`.
- L182-191: catch-branch — sets `installErrorReason` (`'install did not settle — connection may be stale'`
  on a watchdog trip), `status = 'error'`, returns `{ status: 'error' }`.
- L192-232: `finally` — already the single convergence point for all three failure shapes; already
  gated on `status === 'error'` at L213 and L221 (badge-clear + failure dialog).
- The logger import at L1 is `import { logError, LogPrefix, logWarning } from 'backend/logger'` —
  **`logInfo` is NOT imported yet.**

**Test file** — `src/backend/downloadmanager/__tests__/utils.test.ts` (425 lines, 5 describes):

- The `backend/logger` mock (L24-28) exports ONLY `logError`, `logWarning`, `LogPrefix`.
  Adding a `logInfo` call to `utils.ts` without extending this mock throws `logInfo is not a function`.
- The `backend/storeManagers` mock (L33-48) returns games with `{ install, getGameInfo }` — **no
  `stop`**. Adding a `.stop()` call without extending this mock throws `stop is not a function`
  and breaks the existing green specs.
- `jest.config.js` sets `resetMocks: true` — every `describe` re-applies its
  `getGame.mockReturnValue({...})` in `beforeEach` (L122-132, L251-257, L325+, and the later
  describes). **Every one of those re-application sites must also gain `stop`.**
- There is no `aborthandler` mock in this file yet. The sibling `downloadqueue.test.ts` L95-96 has
  the exact precedent to copy:
  `jest.mock('backend/utils/aborthandler/aborthandler', () => ({ callAbortController: jest.fn() }))`.
- `makeParams()` (L105) defaults to `appName: '1091500'`, `runner: 'steam'`.
- The watchdog describe (L249) shows the fake-timer idiom:
  `installMock.mockReturnValue(new Promise(() => {}))` then `await jest.advanceTimersByTimeAsync(10 * 60 * 1000)`.
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add RED regression specs for the failure-path abort</name>
  <files>src/backend/downloadmanager/__tests__/utils.test.ts</files>
  <behavior>
    New describe block: `installQueueElement — orphaned-depot abort: a terminal install failure
    routes through the same abort as user Cancel`. Six specs:

    - Spec 1 (the reported defect — watchdog trip): `installMock.mockReturnValue(new Promise(() => {}))`,
      fake timers advanced 10 minutes. After the returned `{status:'error'}`:
      `callAbortController` called with `'1091500'` AND the game's `stop` called with `false`.
    - Spec 2 (install resolves `{status:'error'}`): same two assertions.
    - Spec 3 (install THROWS/rejects): same two assertions. (Three distinct failure shapes all
      converge on the `finally`; a gate written only in the catch block would pass 1 and 3 and
      fail 2 — that is the point of covering all three.)
    - Spec 4 (regression — `{status:'done'}`): `callAbortController` NOT called, `stop` NOT called.
    - Spec 5 (regression — `{status:'abort'}`, i.e. a user cancel that already aborted):
      `callAbortController` NOT called, `stop` NOT called. Guards against re-issuing an abort the
      cancel path already issued.
    - Spec 6 (blast-radius gate — `runner: 'gog'` with `{status:'error'}`):
      `callAbortController` IS called, but the game's `stop` is NOT. Guards the legendary
      `killPattern` hazard documented in `<interfaces>`.
  </behavior>
  <action>
    Extend the existing mocks first, or every currently-green spec in this file will break:

    1. Add `logInfo: jest.fn()` to the `backend/logger` mock factory (L24-28).
    2. Add a module-scoped `const stopMock = jest.fn()` next to `installMock` (L30), and add
       `stop: stopMock` to BOTH `getGame` mock return values in the `backend/storeManagers` factory
       (L33-48) AND to every `getGame.mockReturnValue({...})` re-application inside every
       `beforeEach` in the file (there are several — `resetMocks: true` wipes them per test).
       Search the whole file for `getGame as jest.Mock).mockReturnValue` and fix every hit.
    3. Add the aborthandler mock, copying the precedent at `downloadqueue.test.ts` L95-96:
       `jest.mock('backend/utils/aborthandler/aborthandler', () => ({ callAbortController: jest.fn() }))`
       and import `callAbortController` from that path for assertions.
    4. Write the six specs described in `<behavior>` in a new describe block appended to the file,
       with its own `beforeEach` mirroring the existing convention (re-apply `getGameInfoMock`,
       both `getGame` return values including `stop`, `isOnline`, `existsSync`) and an
       `afterEach(() => jest.useRealTimers())` for the fake-timer spec.
    5. Head the describe block with a comment naming the live evidence: HUMANKIND `1124300`,
       2026-08-16 21:36:40, chunk loop ran ~5 min past the failure, 4,486 orphaned files, no `.acf`;
       and that the Cancel path on `1091500` at 21:50:44 stopped the loop the same second.

    Do NOT touch `src/backend/downloadmanager/utils.ts` in this task — the new specs MUST fail
    against the unmodified source. That failure is the proof the specs are not vacuous.
  </action>
  <verify>
    <automated>pnpm jest src/backend/downloadmanager/__tests__/utils.test.ts 2>&1 | tail -40</automated>
  </verify>
  <done>
    Specs 1, 2, 3 and 6 FAIL (they assert calls that the unmodified source never makes).
    Specs 4 and 5 pass (they assert absence). EVERY pre-existing spec in the file still passes —
    if any pre-existing spec now fails, a mock extension was missed; fix it before continuing.
    Record the exact RED failure line for spec 1 in the summary.
  </done>
</task>

<task type="auto">
  <name>Task 2: Route the failure path through the cancel path's abort</name>
  <files>src/backend/downloadmanager/utils.ts</files>
  <action>
    In `installQueueElement`, make the terminal-error path issue the same abort the Cancel path
    issues. Do NOT redesign the download manager; do not add new state; do not touch
    `downloadqueue.ts`, `games.ts` or `depot.ts`.

    1. Extend the L1 logger import to include `logInfo`.
    2. Add `import { callAbortController } from 'backend/utils/aborthandler/aborthandler'`
       (leaf module — no cycle; `downloadqueue.ts:11` uses the identical specifier). Do NOT import
       anything from `./downloadqueue` — `downloadqueue.ts` imports this file, so that would be a
       cycle.
    3. In the existing `finally` block, inside a new `if (status === 'error')` branch placed
       BEFORE the badge-clear `sendGameStatusUpdate` (issue the abort as early as possible):
       - `logInfo` a line naming the appName and the reason, e.g.
         `Aborting in-flight download for ${appName} after terminal install failure`, with
         `LogPrefix.DownloadManager`. This line is the live-verification anchor — it must be
         greppable in the app log.
       - `callAbortController(appName)` — runner-agnostic. Safe when nothing is registered
         (see `<interfaces>`).
       - For `runner === 'steam'` ONLY: `libraryManagerMap[runner].getGame(appName).stop(false)`.
         Mirror `stopCurrentDownload`'s fire-and-forget shape (do NOT `await` it inside `finally`);
         attach a `.catch(...)` that logs via `logWarning` so a rejection can never surface as an
         unhandled rejection.
    4. Add a comment block above the branch recording: (a) `withTimeout` rejects the OUTER promise
       only — the inner `install()` run keeps going, which is how the depot run was orphaned;
       (b) `stop()` is required in addition to `callAbortController` because only `stop()` flips
       `nativeInstallsInFlight`'s `aborted` flag, without which an immediate retry JOINS the
       tearing-down run (games.ts L1388-1400); (c) `.stop()` is steam-gated because legendary's
       `stop()` calls `killPattern('legendary')`, whose blast radius is acceptable for a deliberate
       user cancel but not for an automatic failure reaction.

    Note for the summary (no code required): routing through the abort also makes
    `downloadSteamDepots` return `'cancelled'`, so `runNativeDepotDownload`'s cancelled branch runs
    `markSteamInstallIncomplete(appId)` — the library entry becomes incomplete/resumable rather
    than silently stale. Confirm this by reading games.ts L1509-1518; do not modify it.
  </action>
  <verify>
    <automated>pnpm jest src/backend/downloadmanager/__tests__/utils.test.ts 2>&1 | tail -20 && pnpm codecheck && pnpm lint 2>&1 | tail -20</automated>
  </verify>
  <done>
    All six new specs pass, all pre-existing specs in the file pass, `tsc --noEmit` is clean, and
    `eslint` reports zero errors. (`pnpm codecheck` is `tsc` only — it cannot see lint errors, and
    CI lint is a separate workflow. Both gates must be run.)
    Then run `pnpm jest src/backend/downloadmanager src/backend/storeManagers/steam` once — no new
    failures versus the branch baseline. If `storeManagers/steam` has pre-existing failures from
    the uncommitted `library.ts` work, note them as pre-existing and do not fix them.
  </done>
</task>

<task type="auto">
  <name>Task 3: Record the deferral and the live-verification recipe, then commit</name>
  <files>.planning/todos/pending/2026-08-16-aborted-depot-residue-has-no-acf.md, .planning/todos/pending/2026-08-16-orphaned-depot-download-outlives-failure.md</files>
  <action>
    Three of the source todo's four "what good looks like" bullets are closed by Task 2 (abort
    fires; abort is the same one Cancel uses; `nativeInstallsInFlight` releases because `stop()`
    flips `aborted` and the unwinding run's `finally` deletes the entry). The fourth is NOT, and
    must be recorded rather than silently dropped.

    1. Create `.planning/todos/pending/2026-08-16-aborted-depot-residue-has-no-acf.md` with
       frontmatter matching the existing todo's shape (`created`, `title`, `area: steam-depot`,
       `files:` listing `src/backend/storeManagers/steam/depot.ts` and
       `src/backend/storeManagers/steam/library.ts`). Body must state:
       - The residue problem: an aborted/failed native depot run leaves partial bytes under
         `steamapps/common/<installdir>` with NO `appmanifest_*.acf`, so 23-03's reconciler — which
         keys off the `.acf` — cannot see them. Quick task `260816-vgc` stopped the residue from
         GROWING; it did not make it reconcilable or clean it up.
       - What `260816-vgc` DID buy: the abort routes into `runNativeDepotDownload`'s `cancelled`
         branch, which calls `markSteamInstallIncomplete`, so the persisted library entry is marked
         incomplete/resumable. The remaining gap is strictly the ON-DISK residue.
       - Why it was deferred, honestly: closing it means either writing a partial `.acf` (touches
         depot.ts's manifest write ordering, which Phase 23 hardened over ten plans) or deleting a
         partial install directory (destructive, and would break resume). Neither is safe to bolt
         onto an abort-routing fix. This is a scope call, not a difficulty call.
    2. Append a `## Resolution` section to
       `.planning/todos/pending/2026-08-16-orphaned-depot-download-outlives-failure.md`: which
       bullets closed, which deferred (linking the new todo by filename), the files changed, and
       the live verification recipe below. Leave the file in `pending/` — the live gate has not
       been run. Do not move it to `done/`.

    Live verification recipe — write this into the Resolution section; do NOT run it here:
    The fix cannot be proven by the canceller's own report. Prove it by ABSENCE.
    - Start a native Steam install and let it fail (or force a watchdog trip).
    - In the app log, find the failure line `Installation of <appId> failed with:`.
    - Assert the new `Aborting in-flight download for <appId> after terminal install failure` line
      appears within the same second, followed by
      `SteamGame: aborting in-flight native depot download for appId <appId>`.
    - Assert ZERO `[Timing] chunk-stream stats` lines for that appId appear AFTER the failure line.
      This absence is the proof — not the abort log line, which is a mutating call's self-report.
    - Assert the on-disk file count under `steamapps/common/<installdir>` freezes: run
      `find <dir> -type f | wc -l` twice, 60s apart, same number.
    - Assert an immediate retry starts a NEW run (a fresh
      `[Timing] runNativeDepotDownload: ensureSteamClientReady` line) rather than returning instantly.
    State plainly in the section that jest CANNOT reach this property: the unit specs prove the
    failure path INVOKES the abort primitives; only the log-absence check proves the chunk loop
    actually stops.

    3. Commit. Stage ONLY, by explicit path: `src/backend/downloadmanager/utils.ts`,
       `src/backend/downloadmanager/__tests__/utils.test.ts`, and the two
       `.planning/todos/pending/` files. Never `git add -A`. Never `git stash`. Never
       `git checkout --`. Confirm with `git status --short` that
       `src/backend/storeManagers/steam/library.ts` and its test remain modified-but-unstaged
       (leading ` M`, not `M `). Commit message:
       `fix(steam): abort in-flight depot download on install failure`
  </action>
  <verify>
    <automated>test -f .planning/todos/pending/2026-08-16-aborted-depot-residue-has-no-acf.md && grep -q "Resolution" .planning/todos/pending/2026-08-16-orphaned-depot-download-outlives-failure.md && git status --short src/backend/storeManagers/steam/library.ts && git show --stat HEAD | tail -12</automated>
  </verify>
  <done>
    The deferral todo exists in `pending/`; the source todo has a `## Resolution` section naming
    the three closed bullets, the one deferred bullet, and the log-absence live recipe.
    `git status --short src/backend/storeManagers/steam/library.ts` still shows an unstaged
    modification (` M`) — the concurrent session's work is untouched.
    `git show --stat HEAD` lists exactly four files: the two `src/backend/downloadmanager/` files
    and the two `.planning/todos/pending/` files. Nothing else.
  </done>
</task>

</tasks>

<verification>
1. `pnpm jest src/backend/downloadmanager/__tests__/utils.test.ts` — all specs green, including the
   six new ones, and every pre-existing spec.
2. `pnpm codecheck` — clean.
3. `pnpm lint` — zero errors (a separate CI workflow from `tsc`; `codecheck` cannot see lint).
4. `git show --stat HEAD` — exactly four files, none of them under `storeManagers/steam/`.
5. `git status --short` — `src/backend/storeManagers/steam/library.ts` and
   `src/backend/storeManagers/steam/__tests__/library.test.ts` still unstaged and modified.
</verification>

<success_criteria>
- `installQueueElement`'s terminal-error path calls `callAbortController(appName)` for every runner
  and `getGame(appName).stop(false)` for the steam runner, from the single `finally` convergence
  point that all three failure shapes reach.
- The specs guarding this were proven RED against the unmodified source before the fix landed.
- The success path and the user-cancel path are unchanged (specs 4 and 5).
- A non-steam runner never triggers `.stop()` (spec 6).
- The one unclosed requirement (on-disk residue with no `.acf`) is recorded as an explicit,
  reasoned deferral in `.planning/todos/pending/`, not silently dropped.
- The concurrent session's uncommitted `library.ts` work is untouched and unstaged.
</success_criteria>

<output>
Create `.planning/quick/260816-vgc-fix-the-orphaned-depot-download-route-th/260816-vgc-SUMMARY.md`
when done. It must record: the RED failure output for spec 1, the final diff shape of
`downloadmanager/utils.ts`, the deferral, and an explicit statement that the LIVE log-absence gate
has NOT been run and remains the only proof the chunk loop actually stops.
</output>
