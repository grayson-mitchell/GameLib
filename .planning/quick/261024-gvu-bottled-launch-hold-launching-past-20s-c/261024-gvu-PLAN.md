---
phase: quick-261024-gvu
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/bottleProcessMonitor.ts
  - src/backend/storeManagers/steam/bottle.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts
  - src/backend/storeManagers/steam/__tests__/bottle.test.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
  - src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.bottleWaiting.test.tsx
  - public/locales/*/gamelib.json
  - .planning/todos/completed/2026-10-23-bottled-launch-gives-up-after-20s-while-steam-is-still-starting-the-game.md
  - .planning/todos/completed/2026-10-24-play-button-flickers-back-to-play-between-launching-and-playing.md
autonomous: true
requirements: [TODO-2026-10-23-bottled-launch-gives-up-after-20s, TODO-2026-10-24-play-button-flickers]

must_haves:
  truths:
    - "After Play on a bottled-Steam or bridge launch, the Play button shows Launching (disabled) continuously until the game process is matched (then Playing) — it never shows Play in between"
    - "A bottled-Steam launch whose classifier says cause=none past the 20s grace window is still Launching, the monitor is still polling, and the page says Steam is still starting the game (not 'Likely causes' as the headline)"
    - "A second Play/launch request for an appId whose bottle/bridge monitor is still active dispatches NO second -applaunch (or second wine exe)"
    - "Launching is cleared on every monitor terminal path: first match (playing), launcherExited with no match, ps give-up, poll-loop crash, dispatch failure, and an explicit stop (Stop waiting / kill)"
    - "A user stuck waiting on a bottled launch has an escape: a Stop waiting control on the waiting panel that ends the wait and re-enables Play"
  artifacts:
    - path: "src/backend/storeManagers/steam/bottleProcessMonitor.ts"
      provides: "launching hold owned by the monitor, single terminal status, getBottleProcessMonitorPhase export"
      contains: "getBottleProcessMonitorPhase"
    - path: "src/backend/storeManagers/steam/games.ts"
      provides: "single-flight launch guard + stop() ending a pending monitor"
    - path: "src/frontend/screens/Game/GamePage/components/GameStatus.tsx"
      provides: "cause=none 'still starting' copy + Stop waiting button"
  key_links:
    - from: "bottleProcessMonitor.ts startBottleProcessMonitor"
      to: "frontend GlobalState.handleGameStatus"
      via: "sendFrontendMessage('gameStatusUpdate', {status:'launching'}) before the launch IPC resolves"
      pattern: "status: 'launching'"
    - from: "games.ts SteamGame.launch (bottle-eligible block)"
      to: "bottleProcessMonitor.getBottleProcessMonitorPhase"
      via: "lazy import, early return true when phase !== null"
      pattern: "getBottleProcessMonitorPhase"
    - from: "GameStatus.tsx Stop waiting button"
      to: "SteamGame.stop -> stopBottleProcessMonitor"
      via: "window.api.kill(appName, 'steam') -> gamedetails/dispatch.ts kill()"
      pattern: "stopBottleProcessMonitor"
---

<objective>
Fix the Steam bottled/bridge launch state hand-off so the Play button stays "Launching" from the click
until the game process is matched (or the launch genuinely ends), never re-dispatches `-applaunch` while one
is pending, and presents cause=none past the 20s grace as "still starting".

Purpose: closes `2026-10-23-bottled-launch-gives-up-after-20s-while-steam-is-still-starting-the-game.md`
and folds in `2026-10-24-play-button-flickers-back-to-play-between-launching-and-playing.md` — the SAME
root cause (below).

Output: monitor-owned launching state, single-flight launch guard, stop escape, updated waiting copy, unit
tests, both todos moved to `completed/`.
</objective>

<root_cause>
Investigated 2026-10-24 (do not re-derive; act on it):

1. Steam launches deliberately BYPASS `launcher.ts launchEventCallback` — `sidecar/steamFlowRegistration.ts
   handleLaunch` (`runner === 'steam'` branch, ~line 361) and `protocol.ts:215` call
   `storeManagers/steam/launchDispatch.ts dispatchSteamLaunch()` -> `SteamGame.launch()` directly. So the
   backend NEVER emits `gameStatusUpdate {status:'launching'}` for any Steam launch.
2. The only "Launching" the user sees is the frontend-local `playClicked` in
   `src/frontend/screens/Game/GamePage/index.tsx` (`handlePlay`, ~lines 676-691: `setPlayClicked(true)`,
   `await launch(...)`, `setPlayClicked(false)`; consumed at line 405 `launching: isLaunching || playClicked`).
3. `SteamGame.launch()` (`games.ts:2513`) resolves as soon as the command is HANDED OFF:
   bottled route -> `bottle.ts dispatchToBottledSteam('launch')` (~line 1018) returns `{status:'done'}`
   after `runWineCommand({wait:false})`; bridge route -> `fireBridgeWineLaunch` (~games.ts:2908) returns
   `true` without awaiting the wine promise. So `playClicked` drops to false and the button shows **Play**.
4. `playing` arrives only when `bottleProcessMonitor.ts recordFirstMatch()` (~line 240) matches the game
   process — 1-2s later on bridge (the flicker todo), or minutes later on a bottled first run with DXSETUP
   (the 20s todo). Nothing "gives up" at 20s: at `WAITING_FOR_STEAM_GRACE_MS` (20000, `bottleLaunchSignals.ts:46`)
   `runPollLoop` (~line 384-414) logs `[bottle-waiting] appId=… cause=none` and sends
   `steamBottleLaunchWaiting`; the monitor keeps polling (LD-4, no deadline). The operator sees Play because
   of (3), plus "Waiting for Steam… Likely causes:" from `GameStatus.tsx` (~lines 207-248) which renders the
   likely-causes list as the headline even when `detectedCause === null`.
5. Because Play is re-enabled, each click calls `SteamGame.launch()` again -> another `-applaunch`; there is
   no single-flight guard (`startBottleProcessMonitor` just supersedes the previous monitor at line 460).

Both todos share the hand-off in (3)/(4) -> fold the flicker fix in. Fix: the MONITOR owns a backend
`launching` status from the moment it is started (before `SteamGame.launch()` returns), and emits exactly one
terminal status on every exit path. The stuck-after-exit todo
(`2026-10-23-game-page-stuck-on-launching-after-bottled-steam-game-exits.md`) is NOT folded in and stays
pending, but this plan must not worsen it: every path out of the monitor clears `launching`.
</root_cause>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.claude/skills/gamelib-conventions/SKILL.md
@.planning/todos/pending/2026-10-23-bottled-launch-gives-up-after-20s-while-steam-is-still-starting-the-game.md
@.planning/todos/pending/2026-10-24-play-button-flickers-back-to-play-between-launching-and-playing.md
@src/backend/storeManagers/steam/bottleProcessMonitor.ts

<interfaces>
From src/backend/storeManagers/steam/bottleProcessMonitor.ts (current):
- `interface MonitorEntry { cancelled; timers; onStopped?; everMatched; matchedAt; stoppedFired; kind }`
- `const activeMonitors = new Map<string, MonitorEntry>()`
- `function clearEntry(appId, entry)`, `function fireStoppedOnce(appId, entry)`,
  `function recordFirstMatch(appId, entry, matches)` (sends status 'playing')
- `runPollLoop(...)`: ps give-up branch (~line 300-319, sends 'done' ONLY if everMatched),
  "gone" branch (~line 355-372, sends 'done'), waiting block (~line 380-414)
- `export function startBottleProcessMonitor(args): BottleProcessMonitorHandle | null` — returns null
  (no monitor) when `!isMac` or installPath not under `<bottleDir>/drive_c`; calls
  `stopBottleProcessMonitor(appId)` to supersede; poll-loop catch (~line 477) only `clearEntry`s.
- `handle.launcherExited()` no-match path (~line 501-506): fires onStopped + clearEntry, sends NO status.
- `export function stopBottleProcessMonitor(appId: string): void`
- `export function __stopAllBottleProcessMonitors(): void`, `__getActiveMonitorKindForTests(appId)`

From src/backend/gamedetails/dispatch.ts:150:
  `export async function kill(appName, runner) { callAbortController(appName); return libraryManagerMap[runner].getGame(appName).stop() }`

From src/frontend/state/GlobalState.tsx handleGameStatus (~line 1486): 'playing' | 'done' clear
`useBottleLaunchWaiting` entry; 'launching'/'playing' are pushed into libraryStatus; 'done'/'error' remove it.
`MainButton.tsx:47` disables Play while `is.launching`; GamePage `is.launching = status==='launching' || playClicked`.

Tests: `bottle.test.ts:108` and `games.test.ts:357` each `jest.mock('../bottleProcessMonitor', () => ({...}))`
with a factory — any new export used by bottle.ts/games.ts MUST be added to those factories.
`bottleProcessMonitor.test.ts` mocks `../../../ipc` sendFrontendMessage and `../bottleLaunchSignals`
(classifier defaults to null, GRACE 20000, RECHECK 15000); jest `resetMocks: true`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Monitor owns the launching state with exactly one terminal status; bottle.ts starts it before dispatch</name>
  <files>src/backend/storeManagers/steam/bottleProcessMonitor.ts, src/backend/storeManagers/steam/bottle.ts, src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts, src/backend/storeManagers/steam/__tests__/bottle.test.ts</files>
  <behavior>
    - startBottleProcessMonitor (mac, valid prefix) synchronously sends gameStatusUpdate {appName, runner:'steam', status:'launching'} before returning (both kinds).
    - bottled-steam, classifier returns null, timers advanced to 20s + 15s + 15s with empty ps: NO 'done' is sent, `getBottleProcessMonitorPhase(appId) === 'starting'`, `[bottle-waiting] … cause=none` logged once, steamBottleLaunchWaiting sent once with detectedCause null (no give-up at 20s).
    - First match sends 'playing' and phase becomes 'running'; gone sends exactly one 'done' and phase null.
    - launcherExited with no match sends exactly one 'done' (new) plus onStopped once.
    - ps give-up after 20 consecutive failures with no match now sends 'done' (previously only when everMatched).
    - External stopBottleProcessMonitor(appId) while 'starting' or 'running' sends exactly one 'done'; calling it again sends nothing.
    - Supersede: a second startBottleProcessMonitor for the same appId sends NO 'done' for the first entry (only a fresh 'launching'), and the first entry's onStopped does not fire.
    - __stopAllBottleProcessMonitors (test teardown) sends no status; jest.getTimerCount() still returns to 0.
    - bottle.ts tellBottledSteamToLaunch: startBottleProcessMonitor is called (awaited import) BEFORE runWineCommand; when runWineCommand rejects, stopBottleProcessMonitor(appId) is called and the result is {status:'error'}.
  </behavior>
  <action>
In `bottleProcessMonitor.ts`:
(a) Add `terminalSent: boolean` to `MonitorEntry` (init false) and a helper `sendTerminalDoneOnce(appId, entry)` that, if not already sent, sets the flag and sends `gameStatusUpdate {appName: appId, runner: 'steam', status: 'done'}`. Route the existing "gone" branch's 'done' through it.
(b) In `startBottleProcessMonitor`, after `activeMonitors.set(appId, entry)` and BEFORE starting the poll loop, send `gameStatusUpdate {status: 'launching'}` for the appId, with a comment citing this quick task and the root cause (Steam launches bypass launchEventCallback, so nothing else emits launching; the monitor holds it until started/gave-up/stop). Keep the supersede by calling a new internal `cancelMonitor(appId, {silent: true})` instead of the public stop so the superseded entry emits no 'done' (the new 'launching' immediately follows).
(c) Make every no-supersede terminal path emit the terminal 'done' once: ps give-up branch (drop the `if (entry.everMatched)` guard — call `sendTerminalDoneOnce` unconditionally), the poll-loop `catch` in startBottleProcessMonitor, and `launcherExited`'s no-match path. Do NOT add any deadline or give-up to the no-match wait — LD-4 stands; cause=none past grace is "still starting" and keeps polling.
(d) Public `stopBottleProcessMonitor(appId)`: if an entry exists, `sendTerminalDoneOnce` then `clearEntry` (does not fire onStopped, unchanged contract). `__stopAllBottleProcessMonitors` must stay silent: have it call the internal silent cancel, so existing tests' teardown does not emit.
(e) Export `getBottleProcessMonitorPhase(appId): 'starting' | 'running' | null` — null when no live entry, 'running' when `everMatched`, else 'starting'. Update the module header's Exports paragraph.
(f) Update the existing tests that assert exact sendFrontendMessage call counts or "emits nothing" (e.g. "four consecutive empty polls emit nothing", "first ps match emits exactly one playing", "starting a second monitor … cancels the first", the 51-23 launcherExited tests, the D-51-16 waiting tests) to account for the initial 'launching' and the new 'done's — filter by status where needed; do not weaken what each test proves. Add the new behavior tests listed above.

In `bottle.ts dispatchToBottledSteam` 'launch' branch (~line 1074-1110): replace the detached `void (async () => { await import('./bottleProcessMonitor'); startBottleProcessMonitor(...) })()` with an awaited lazy import + synchronous start inside its own try/catch (same log on failure, still non-fatal), so the 'launching' push is sent before `runWineCommand` and therefore before the launch IPC resolves. In the outer `catch` (runWineCommand failed), when `verb === 'launch'`, lazily import and call `stopBottleProcessMonitor(appId)` (wrapped so it can never throw) before returning the error, so a failed dispatch never leaves Launching held. Add `stopBottleProcessMonitor` to `bottle.test.ts`'s `jest.mock('../bottleProcessMonitor')` factory and add the two bottle.ts behavior tests. Do not reroute any title to the bottled path (bottled Steam is a narrow fallback).
  </action>
  <verify>
    <automated>npx jest src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts src/backend/storeManagers/steam/__tests__/bottle.test.ts && npx tsc --noEmit && npx prettier --check src/backend/storeManagers/steam/bottleProcessMonitor.ts src/backend/storeManagers/steam/bottle.ts src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts src/backend/storeManagers/steam/__tests__/bottle.test.ts</automated>
  </verify>
  <done>All listed behaviors have passing tests; launching is emitted at monitor start; every non-supersede exit emits exactly one 'done' or a 'playing' then 'done'; no deadline added; tsc and scoped prettier clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Single-flight launch guard and a stop() that ends a pending monitor</name>
  <files>src/backend/storeManagers/steam/games.ts, src/backend/storeManagers/steam/__tests__/games.test.ts</files>
  <behavior>
    - Bottle-eligible title with getBottleProcessMonitorPhase(appId) === 'starting': launch() resolves true, calls neither tellBottledSteamToLaunch nor runWineCommand/launchBridgeGame, and logs one info line naming the appId and phase.
    - Same with phase 'running': no dispatch, resolves true.
    - Phase null: existing routing unchanged (bridge vs bottled tests still pass).
    - stop() with no in-flight depot download and phase !== null: calls stopBottleProcessMonitor(appId) and logs it; does NOT log the "Steam owns process lifecycle … no-op" warning.
    - stop() with phase null: unchanged no-op warning. In-flight depot abort path unchanged.
  </behavior>
  <action>
In `SteamGame.launch()` (`games.ts:2513`), at the top of the `if (this.isBottleEligible())` block (before the bridge `findBridgeInstallBottle` routing, so it covers both bridge and bottled routes), lazily import `getBottleProcessMonitorPhase` from `./bottleProcessMonitor` (lazy, matching `fireBridgeWineLaunch`'s existing pattern). If the phase is non-null, log `SteamGame: appId <id> launch already <phase> — not dispatching another` via logInfo/LogPrefix.Steam and return true: the active monitor keeps owning the status, so no second `-applaunch` or second wine exe is spawned and no new status is emitted. Comment cites this quick task and the todo's "each click queues another -applaunch".
In `SteamGame.stop()` (~line 3631), after the in-flight depot branch and before the no-op warning: lazily import `getBottleProcessMonitorPhase` and `stopBottleProcessMonitor`; if phase is non-null, log and call `stopBottleProcessMonitor(this.appId)` (which emits the terminal 'done', clearing Launching and the waiting panel) and return. Note in a comment that this does not kill the game process (Steam/Wine still owns it) — it only ends GameLib's wait/tracking; for a 'running' game it is an explicit user stop of tracking. Keep the existing warning for phase null.
Add `getBottleProcessMonitorPhase: jest.fn()` (default null via beforeEach, given resetMocks) and `stopBottleProcessMonitor: jest.fn()` to `games.test.ts`'s `jest.mock('../bottleProcessMonitor')` factory (~line 357) and add the behavior tests next to the existing bottle-eligible launch tests (~line 1500-1545).
  </action>
  <verify>
    <automated>npx jest src/backend/storeManagers/steam/__tests__/games.test.ts && npx tsc --noEmit && npx prettier --check src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/games.test.ts</automated>
  </verify>
  <done>A pending/running monitor blocks a second dispatch on both routes; stop() ends a pending monitor (clearing Launching) instead of no-op; existing routing tests unchanged and green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: "Still starting" copy for cause=none, Stop waiting button, and close both todos</name>
  <files>src/frontend/screens/Game/GamePage/components/GameStatus.tsx, src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.bottleWaiting.test.tsx, public/locales/*/gamelib.json, .planning/todos/completed/2026-10-23-bottled-launch-gives-up-after-20s-while-steam-is-still-starting-the-game.md, .planning/todos/completed/2026-10-24-play-button-flickers-back-to-play-between-launching-and-playing.md</files>
  <behavior>
    - waitingEntry with detectedCause null: renders the "starting" title and intro (not "Waiting for Steam…" as the headline); the likely-causes list renders under the "If it does not start" heading instead of "Likely causes:".
    - waitingEntry with a detected cause: unchanged (title "Waiting for Steam…", "Most likely:", other causes under "Likely causes:").
    - Both cases render a Stop waiting button whose onClick calls window.api.kill(appName, 'steam').
    - No waitingEntry: nothing from the waiting panel renders.
  </behavior>
  <action>
In `GameStatus.tsx` waiting panel (~lines 207-248): when `waitingEntry.detectedCause === null`, render title `gamelib:steam.bottle.waiting.startingTitle` default "Steam is still starting the game…", intro `gamelib:steam.bottle.waiting.startingIntro` default "A first launch can take several minutes while Steam installs the game's prerequisites.", and the causes list under `gamelib:steam.bottle.waiting.ifNotStarting` default "If it still does not start, check:". Keep the detected-cause branch exactly as is. Add a button (reuse an existing button class used on the game page, e.g. the one used near this component; no new SCSS) labelled `gamelib:steam.bottle.waiting.stopWaiting` default "Stop waiting" that calls `window.api.kill(gameInfo.app_name, 'steam')` — this is the escape hatch now that Launching is held with no deadline (LD-4). Literal `tGamelib(...)` calls, matching the file's existing convention so the hard-coded-string gate sees them.
Catalog: add the four keys under `steam.bottle.waiting` in `public/locales/en/gamelib.json` with values equal to the defaults (alphabetical key order as in the surrounding block). The existing waiting keys exist in all 49 locale `gamelib.json` files — find how 51-04 propagated them (`git log -S '"mostLikely"' --oneline -- public/locales | tail -1`, then `git show --stat` it) and mirror that exactly (if other locales carry English copies, add the same English copies in the same position). Then run `pnpm lint-translations:gamelib` and `pnpm i18n-churn-guard` and fix anything they flag.
Test: create `GameStatus.bottleWaiting.test.tsx` following `MainButton.steamWaitingRestart.test.tsx`'s no-jsdom pattern (mock react useContext, the shared `faithfulTranslate` react-i18next mock, mock `frontend/state/BottleLaunchWaiting`'s `useBottleLaunchWaiting` to return a chosen entry, mock `@mui/material` / `react-router-dom` if needed, stub `window.api.kill`), invoke the component as a function and search the element tree for the behaviors above, including invoking the button's onClick.
Close the todos (pattern from commit 913e79da8): `git mv` each of the two todo files from `.planning/todos/pending/` to `.planning/todos/completed/` and append a `## Closed 2026-10-24: <one-line>` section stating the root cause (Steam launches bypass launchEventCallback; launching was only the frontend playClicked, dropped when the hand-off returned), what changed (monitor-owned launching + single terminal status, single-flight guard, Stop waiting, still-starting copy), the quick task id 261024-gvu, and that live verification on the Mac (XCOM 200510 bottled first run; a bridge title such as Manor Lords 1363080) is still owed. Do not touch `2026-10-23-game-page-stuck-on-launching-after-bottled-steam-game-exits.md`. Completed todos are exempt from the triage gate but keep their frontmatter unchanged.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.bottleWaiting.test.tsx src/frontend/screens/Game/GamePage/components/__tests__/mainButtonCatalogDefaults.test.ts src/frontend/state/__tests__/BottleLaunchWaiting.test.ts && pnpm lint-translations:gamelib && pnpm i18n-churn-guard && pnpm planning-gates && npx tsc --noEmit && npx prettier --check src/frontend/screens/Game/GamePage/components/GameStatus.tsx src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.bottleWaiting.test.tsx && test -f .planning/todos/completed/2026-10-23-bottled-launch-gives-up-after-20s-while-steam-is-still-starting-the-game.md && test -f .planning/todos/completed/2026-10-24-play-button-flickers-back-to-play-between-launching-and-playing.md && test ! -e .planning/todos/pending/2026-10-23-bottled-launch-gives-up-after-20s-while-steam-is-still-starting-the-game.md</automated>
    Prettier note: `public/locales/` and `.planning/` are prettier-ignored (confirm with `npx prettier --file-info public/locales/en/gamelib.json` reporting `"ignored": true`), so they are deliberately omitted from the --check list; hand-match the surrounding 4-space JSON indentation and key order.
  </verify>
  <done>cause=none shows "still starting" copy, Stop waiting ends the wait via kill -> stop(); catalog gates green; both todos in completed/ with a closure section; stuck-after-exit todo untouched.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer -> sidecar `kill`/`launch` IPC | appName from the renderer reaches SteamGame.launch/stop |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gvu-01 | Denial of service | single-flight guard in SteamGame.launch | mitigate | guard keyed on a live monitor only; every monitor exit path clears the entry and emits 'done', and stop() clears a pending monitor, so a wedged guard is user-recoverable without restart |
| T-gvu-02 | Tampering | appId in -applaunch | accept | unchanged: dispatchToBottledSteam's NUMERIC_APP_ID guard still runs before any dispatch |
| T-gvu-03 | Denial of service | sidecar exit contract | mitigate | no new timers/handles; monitor timers remain tracked + unref'd via trackedSleep |
</threat_model>

<verification>
- `npx jest src/backend/storeManagers/steam/__tests__ src/frontend/screens/Game/GamePage/components/__tests__ src/frontend/state/__tests__/BottleLaunchWaiting.test.ts` green.
- `npx tsc --noEmit` and `pnpm lint` (ceilings PASS) clean.
- grep: `grep -n "status: 'launching'" src/backend/storeManagers/steam/bottleProcessMonitor.ts` returns 1 match; `grep -n "getBottleProcessMonitorPhase" src/backend/storeManagers/steam/games.ts` returns at least 2.
- Live verification (operator, not part of this plan's gate): XCOM 200510 bottled first run stays Launching through DXSETUP; Manor Lords 1363080 bridge shows Launching -> Playing with no Play in between. Per the strict bridge criterion, a bridge Launching->Playing UI pass is NOT a bridge "verified" claim.
</verification>

<success_criteria>
- No Play state between click and Playing on bottled or bridge launches.
- No give-up and no Play re-enable at 20s on cause=none; copy says still starting.
- One -applaunch per appId while a monitor is live.
- Launching cleared on started, every give-up path, dispatch failure, and stop.
- Both todos in `.planning/todos/completed/` with closure notes; stuck-after-exit todo still pending.
</success_criteria>

<output>
Create `.planning/quick/261024-gvu-bottled-launch-hold-launching-past-20s-c/261024-gvu-SUMMARY.md` when done
</output>
