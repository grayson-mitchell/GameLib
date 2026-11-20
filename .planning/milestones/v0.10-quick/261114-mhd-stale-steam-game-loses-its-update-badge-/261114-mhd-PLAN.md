---
phase: quick-261114-mhd
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/state/libraryState.ts
  - src/frontend/state/__tests__/libraryState.test.ts
autonomous: true
requirements: [QUICK-261114-mhd]

must_haves:
  truths:
    - "Whenever the frontend store removes any appId from gameUpdates, gamelib.log gets exactly one line starting `[gameUpdates] dropped` that names the dropped appIds and the code path"
    - "A handleGameStatus drop line names the prior status and the new status (e.g. prior=updating new=done)"
    - "A refresh drop line names origin, runner scope, checkUpdates true/false, and whether the list came from checkGameUpdates or the start-of-refresh snapshot"
    - "Replaying the launch statuses of a stale Steam bridge game (launching -> playing -> done, and steam-starting/engine-download before launching) keeps the appId in gameUpdates and emits no drop line"
    - "updating -> done still drops the appId (74-27 semantics unchanged) and now emits the drop line"
  artifacts:
    - path: "src/frontend/state/libraryState.ts"
      provides: "`[gameUpdates] dropped` diagnostic in handleGameStatus and refresh; refresh() takes an optional 4th `origin` arg threaded from refreshLibrary"
      contains: "[gameUpdates] dropped"
    - path: "src/frontend/state/__tests__/libraryState.test.ts"
      provides: "launch-status sequence tests pinning the badge across play, plus drop-log assertions for handleGameStatus and refresh"
      contains: "[gameUpdates] dropped"
  key_links:
    - from: "refreshLibrary in src/frontend/state/libraryState.ts"
      to: "refresh(library, checkForUpdates, undefined, origin)"
      via: "origin threaded as the new optional 4th parameter"
      pattern: "refresh\\(library, checkForUpdates, undefined, origin\\)"
    - from: "handleGameStatus / refresh set() calls that shrink gameUpdates"
      to: "window.api.logInfo"
      via: "one log line per shrinking write"
      pattern: "\\[gameUpdates\\] dropped"
---

<objective>
Instrument the two places the frontend shrinks `gameUpdates` so a live repro of the todo
`.planning/todos/pending/2026-11-13-stale-game-loses-update-badge-after-play.md` names the cause in
gamelib.log, and pin the launch-status sequence for a stale bridge game with a libraryState test.

Purpose: the stale Hell Clock 1782460 badge vanished after Play anyway + quit, and the 2026-11-13
logs rotated away. The user chose "instrument, then repro". This plan is diagnosis only: it does
NOT change badge semantics, does NOT fix the refresh() stale-snapshot race, does NOT touch backend
code, and does NOT move the todo to completed.

Output: a permanent, cheap, grep-able `[gameUpdates] dropped` log line in libraryState.ts and a
sequence test in libraryState.test.ts.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-11-13-stale-game-loses-update-badge-after-play.md
@src/frontend/state/libraryState.ts
@src/frontend/state/__tests__/libraryState.test.ts

Static findings already established (do not re-investigate):
- `gameUpdates` shrinks in exactly two places in libraryState.ts: (A) `handleGameStatus`, the
  `['error','done']` branch when `currentApp.status === 'updating'` (it filters appName out, writes
  localStorage `updates`, then `set({ gameUpdates: updatedGamesUpdates })`); (B) `refresh()`'s final
  functional `set((prev) => ({ gameUpdates: updates, ... }))`, where `updates` is either the result
  of `window.api.checkGameUpdates()` (checkUpdates=true and it resolved) or the `gameUpdates`
  snapshot destructured from `get()` at the START of refresh(), before the awaited cache loads. A
  stale snapshot can clobber a concurrent newer write.
- No Steam bridge launch code emits 'updating'; launch statuses are launching / playing / done /
  winetricks / redist / engine-download / steam-starting.

<interfaces>
From src/frontend/state/libraryState.ts (current):
- `export type RefreshLibraryOptions = RefreshOptions & { origin?: string }`
- LibraryState.refresh: `(library?: Runner | 'all', checkUpdates?: boolean, overridesArg?: Record<string, GameOverride>) => Promise<void>` (interface ~line 79; impl `refresh: async (library, checkUpdates = false, overridesArg) =>` ~line 525)
- refreshLibrary impl (~line 379) destructures `origin = 'unknown'`, already logs `[refreshLibrary] runner=${runnerScope} origin=${origin}`, and calls `await get().refresh(library, checkForUpdates)` (~line 436). That is the only production caller of refresh().
- handleGameStatus (~line 262) reads `const { libraryStatus, gameUpdates } = get()` and `currentApp`.

From src/frontend/state/__tests__/libraryState.test.ts (current):
- describe 'libraryState library data' (~line 300): window.api mock already has `logInfo: (m) => infos.push(m)`, `checkGameUpdates: () => updatesResult()`, `refreshLibrary`; `updatesResult` defaults to `async () => ['upd']`. Existing test 'checkUpdates stores the result and keeps old updates on failure' (~line 436).
- describe 'libraryState handleGameStatus (hot path)' (~line 576): window.api mock has logError/storeHas/storeGet/storeSet but NO logInfo; `push({ appName, ...status })` defaults `status: 'installing', runner: 'legendary'`; `refreshLibrary` is replaced with a stub recording into `refreshCalls`. Existing tests 'an update finishing drops the app from gameUpdates...' (~line 683) and 'a Steam hand-off holds Updating until the poll ends...' (~line 700) walk updating -> done.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Log every gameUpdates drop in handleGameStatus and refresh; thread origin into refresh()</name>
  <files>src/frontend/state/libraryState.ts, src/frontend/state/__tests__/libraryState.test.ts</files>
  <action>
In src/frontend/state/libraryState.ts:

1. Thread origin into refresh(). Add an optional 4th parameter `origin?: string` to the
   `LibraryState.refresh` interface signature and the implementation (`refresh: async (library,
   checkUpdates = false, overridesArg, origin = 'unknown') =>`). In refreshLibrary change
   `await get().refresh(library, checkForUpdates)` to
   `await get().refresh(library, checkForUpdates, undefined, origin)`. Do not change
   RefreshLibraryOptions or any other caller; leave overridesArg semantics alone.

2. refresh() drop log. Track where `updates` came from with a local
   `let updatesSource: 'checkGameUpdates' | 'start-snapshot' | 'start-snapshot-after-check-failed'`,
   initialised to 'start-snapshot', set to 'checkGameUpdates' after `window.api.checkGameUpdates()`
   resolves, and to 'start-snapshot-after-check-failed' in its catch (keep the existing logError).
   Inside the existing final functional `set((prev) => { ... })`, before building `next`, compute
   `dropped = prev.gameUpdates.filter((id) => !updates.includes(id))` and
   `snapshotStale = prev.gameUpdates !== gameUpdates` (reference compare against the start
   snapshot: true means another write landed during this refresh's awaits, i.e. the race), and
   capture both into `let` variables declared before the set() call. Keep the set() updater
   otherwise byte-identical (still writes `gameUpdates: updates`; no fix). Immediately after the
   set() call, if `dropped.length > 0`, call `window.api.logInfo` once with exactly this shape:
   `[gameUpdates] dropped appIds=<comma-joined> path=refresh origin=<origin> runner=<library ?? 'all'> checkUpdates=<true|false> source=<updatesSource> snapshotStale=<true|false>`.
   Comment briefly that the line is the diagnostic for the 2026-11-13 stale-badge todo and is
   intentionally permanent (fires only on a shrink, which is rare).

3. handleGameStatus drop log. In the `currentApp.status === 'updating'` branch of the
   `['error','done']` block, after computing `updatedGamesUpdates`, if `gameUpdates.includes(appName)`
   call `window.api.logInfo` once:
   `[gameUpdates] dropped appIds=<appName> path=handleGameStatus prior=<currentApp.status> new=<status> runner=<runner>`.
   Do not alter the filter, the refreshLibrary call, the localStorage write or the set() calls.

No debug flag gating (constraint: permanent). Do not touch backend code or any other frontend file.

In src/frontend/state/__tests__/libraryState.test.ts: the 'libraryState handleGameStatus (hot
path)' describe's beforeEach window.api mock has no logInfo, so the existing updating -> done tests
would now throw. Add a module-level `let hotInfos: string[] = []`, reset it in that beforeEach,
and add `logInfo: (m: string) => hotInfos.push(m)` to that mock. No other test changes in this
task.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx prettier --file-info src/frontend/state/libraryState.ts && npx prettier --file-info src/frontend/state/__tests__/libraryState.test.ts && npx jest src/frontend/state/__tests__/libraryState.test.ts && npx prettier --check src/frontend/state/libraryState.ts src/frontend/state/__tests__/libraryState.test.ts && npx eslint src/frontend/state/libraryState.ts src/frontend/state/__tests__/libraryState.test.ts && npx tsc --noEmit && grep -c "\[gameUpdates\] dropped" src/frontend/state/libraryState.ts && grep -c "refresh(library, checkForUpdates, undefined, origin)" src/frontend/state/libraryState.ts</automated>
  </verify>
  <done>Both paths emit the `[gameUpdates] dropped` line only when gameUpdates actually shrinks; refreshLibrary passes origin into refresh(); the existing libraryState test file passes unchanged in behavior (only the hot-path mock gained logInfo); prettier (both files report ignored:false, checked scoped), eslint scoped and tsc green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Pin the stale bridge game's launch-status sequence and the drop log</name>
  <files>src/frontend/state/__tests__/libraryState.test.ts</files>
  <behavior>
    - Launch sequence (runner 'steam'): gameUpdates ['1782460','z']; push launching -> playing -> done for appName '1782460'. After each step gameUpdates still contains '1782460'; at the end gameUpdates equals ['1782460','z'], hotInfos has no entry containing '[gameUpdates] dropped', and refreshCalls is exactly one call with no checkForUpdates key ({ runInBackground: true, library: 'steam', origin: 'game-status' }).
    - Variant: steam-starting -> engine-download -> launching -> playing -> done. Same assertions.
    - updating -> done (runner 'steam'): gameUpdates ['1782460','z'] ends ['z'] and hotInfos contains exactly one line equal to `[gameUpdates] dropped appIds=1782460 path=handleGameStatus prior=updating new=done runner=steam`.
    - refresh drop via check (library data describe): gameUpdates ['old','keep'], updatesResult -> ['keep']; `await lib().refresh('steam', true, undefined, 'manual')` -> gameUpdates ['keep'] and infos contains a line starting `[gameUpdates] dropped appIds=old path=refresh origin=manual runner=steam checkUpdates=true source=checkGameUpdates snapshotStale=false`.
    - refresh without a shrink: gameUpdates ['keep'], `await lib().refresh(undefined, false)` -> no infos entry contains '[gameUpdates] dropped'.
    - refresh check failure: updatesResult throws; gameUpdates ['a'] stays ['a'] and no drop line (snapshot equals prev, so nothing shrinks).
  </behavior>
  <action>
Add the three handleGameStatus cases inside the existing 'libraryState handleGameStatus (hot path)'
describe, using its `push` helper with `runner: 'steam'` and the `hotInfos` / `refreshCalls`
collectors from Task 1. Name the launch tests so they reference the todo, e.g. "a stale Steam game
keeps its update badge through launching -> playing -> done (todo 2026-11-13)". Drive the two
launch sequences from an array of statuses in a loop (as the existing 74 UAT 17 test does) and
assert `lib().gameUpdates.includes('1782460')` after every step.

Add the three refresh cases inside the existing 'libraryState library data' describe, reusing its
`infos`, `updatesResult` and `lib()`; pass origin as the 4th refresh() argument added in Task 1.
Use `toContain` / `some(startsWith)` for the refresh line so the assertion pins the field order
exactly as written in the behavior block.

These tests pin the CURRENT semantics: they are expected to pass against Task 1's code. If the
launch-sequence tests fail, stop and report it in the SUMMARY as a finding (it would mean the
frontend reducer itself drops the badge on a launch sequence) rather than changing
handleGameStatus. Do not use jest.mock; follow the file's existing window.api assignment pattern.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx prettier --file-info src/frontend/state/__tests__/libraryState.test.ts && npx jest src/frontend/state/__tests__/libraryState.test.ts && npx prettier --check src/frontend/state/__tests__/libraryState.test.ts && npx eslint src/frontend/state/__tests__/libraryState.test.ts && npx tsc --noEmit && ! grep -n "jest.mock" src/frontend/state/__tests__/libraryState.test.ts && grep -c "1782460" src/frontend/state/__tests__/libraryState.test.ts</automated>
  </verify>
  <done>libraryState.test.ts has the two launch-sequence tests (badge kept, no drop log, no update-check refresh), the updating -> done drop-log test, and three refresh drop-log tests; the whole file passes; prettier (scoped), eslint (scoped) and tsc green; git diff touches only the two planned files.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer -> gamelib.log | new log lines carry Steam appIds, runner names and status words only |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261114-mhd-01 | Information disclosure | `[gameUpdates] dropped` line in libraryState.ts | accept | Contents are public appIds, runner names and status enums; no titles, paths, tokens or account data are logged |
| T-261114-mhd-02 | Denial of service | log volume | accept | Line fires only when gameUpdates shrinks (update completion or a refresh that removes an entry), which is rare; no per-status or per-refresh unconditional logging |
</threat_model>

<verification>
- `npx jest src/frontend/state/__tests__/libraryState.test.ts` green.
- `npx tsc --noEmit` green; scoped prettier and eslint green on the two files.
- `git diff --stat` shows only src/frontend/state/libraryState.ts and src/frontend/state/__tests__/libraryState.test.ts.
- No backend file changed; the todo stays in .planning/todos/pending/.
</verification>

<success_criteria>
- Every frontend write that removes an appId from gameUpdates produces one `[gameUpdates] dropped` line naming the path and its inputs.
- The launch-status sequence for a stale Steam bridge game is pinned by tests that keep the badge.
- Badge semantics and the refresh() race are unchanged (diagnosis only).
</success_criteria>

<output>
Create `.planning/quick/261114-mhd-stale-steam-game-loses-its-update-badge-/261114-mhd-SUMMARY.md` when done.

The SUMMARY must:
- State this is instrumentation only; the todo `.planning/todos/pending/2026-11-13-stale-game-loses-update-badge-after-play.md` stays pending until the captured log names the cause and a fix lands.
- Give the live-repro step verbatim: restart the app with `pnpm tauri:dev` (never `tauri:dev:run`; no sidecar rebuild is needed, this is a frontend-only change), play stale Hell Clock 1782460 via the launch prompt's Play anyway, quit the game, confirm whether the badge is gone, then run `grep '\[gameUpdates\] dropped' ~/Library/Logs/gamelib/gamelib.log` (and the surrounding `[refreshLibrary] runner=... origin=...` lines).
- Explain how to read the result: `path=handleGameStatus prior=updating` means something emitted 'updating' for the game during launch; `path=refresh source=checkGameUpdates` means the backend check (detectSteamUpdates) omitted the app; `path=refresh source=start-snapshot... snapshotStale=true` means the stale-snapshot race clobbered a newer write; no line at all while the badge is gone means the loss is not in the frontend store (e.g. render/selection or localStorage seeding).
</output>
