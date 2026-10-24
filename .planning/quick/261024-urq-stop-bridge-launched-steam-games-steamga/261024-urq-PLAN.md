---
phase: quick-261024-urq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/bottle.ts
  - src/backend/storeManagers/steam/__tests__/bottle.test.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - .planning/todos/pending/2026-10-24-stop-is-a-no-op-for-bridge-launched-games.md
  - .planning/todos/completed/2026-10-24-stop-is-a-no-op-for-bridge-launched-games.md
autonomous: true
requirements:
  - TODO-2026-10-24-stop-is-a-no-op-for-bridge-launched-games

must_haves:
  truths:
    - "Clicking Stop on a game launched into its own per-game bridge bottle (GameLibSteamBridge-<appId>) kills that bottle's Wine processes via a WINEPREFIX-scoped `wineserver -k`"
    - "After Stop on the bridge route, the bridge helper for that appId is torn down and the monitor emits its terminal `done`, so the UI leaves Playing"
    - "Stop never runs `wineserver -k` against the legacy shared bridge bottle, the Phase 17 Steam bottle, or the shared GOG/Epic bottle"
    - "Stop during an in-flight native depot download still only aborts the download (unchanged)"
    - "Stop on a bottled-Steam launch still only ends the monitor and kills nothing (unchanged, separate decision)"
    - "Stop with no download, no bridge launch, and no live monitor still logs the 'Steam owns process lifecycle' no-op (unchanged)"
  artifacts:
    - path: "src/backend/storeManagers/steam/bottle.ts"
      provides: "stopPerGameBridgeBottle(appId): guarded, per-game-only wineserver -k"
      contains: "export async function stopPerGameBridgeBottle"
    - path: "src/backend/storeManagers/steam/games.ts"
      provides: "bridge-launch record + bridge branch in SteamGame.stop()"
      contains: "bridgeLaunchBottles"
    - path: ".planning/todos/completed/2026-10-24-stop-is-a-no-op-for-bridge-launched-games.md"
      provides: "closed todo with a Closed section"
  key_links:
    - from: "SteamGame.fireBridgeWineLaunch"
      to: "bridgeLaunchBottles map"
      via: "set(appId, bridgeBottleSettings.wineCrossoverBottle) before runWineCommand"
      pattern: "bridgeLaunchBottles\\.set"
    - from: "SteamGame.stop"
      to: "stopPerGameBridgeBottle"
      via: "only when the recorded bottle === bridgeBottleNameFor(appId)"
      pattern: "stopPerGameBridgeBottle\\("
    - from: "stopPerGameBridgeBottle"
      to: "killBottleWineServer"
      via: "existing WINEPREFIX-scoped spawn (T-17-DoS) — no new spawn site"
      pattern: "killBottleWineServer\\(name"
---

<objective>
Make "Playing (Stop)" actually stop a game launched through the native Steam bridge on macOS.

Today `SteamGame.stop()` (src/backend/storeManagers/steam/games.ts, `async stop(` ~line 3781)
aborts in-flight native depot downloads, then (quick 261024-gvu) ends a live bottle/bridge
monitor WITHOUT killing anything, then falls through to the "Steam owns process lifecycle; no-op"
warning. On the bridge route GameLib spawns the Wine command itself into a per-app bottle, so the
"Steam owns it" premise is false. Operator log (Manor Lords 1363080, three clicks, nothing
happened) is in the todo.

Fix: record which bridge bottle each bridge launch used; on Stop, if that bottle is the game's own
per-game bottle, `wineserver -k` it (WINEPREFIX-scoped, reusing bottle.ts's existing
`killBottleWineServer`), then `stopBridgeHelper(appId)` and `stopBottleProcessMonitor(appId)`
(terminal `done` -> UI leaves Playing). Bottled-Steam stays a no-op-kill (separate decision — do
not change). Native/download paths unchanged.

Output: guarded `stopPerGameBridgeBottle` in bottle.ts, bridge branch in stop(), unit tests, todo
closed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-10-24-stop-is-a-no-op-for-bridge-launched-games.md
@.claude/skills/gamelib-conventions/SKILL.md  (sections "Fake-HOME isolation" and "A formatter check belongs in every task's <verify>")

<interfaces>
Extracted from the codebase — use directly, no exploration needed.

src/backend/storeManagers/steam/bottle.ts
- line 73: `const wineserverIn = (binDir: string): string => join(binDir, 'wineserver')`
- ~line 651: module-private `async function killBottleWineServer(bottleName: string, knownBinDir?: string): Promise<void>`
  — resolves the CrossOver bin dir, spawns `spawnAsync(wineserverIn(binDir), ['-k'], { env: { ...process.env, WINEPREFIX: getBottleDir(bottleName), CX_ROOT: cxRootFrom(binDir) } })`,
  best-effort (logs warning, never throws; logs + returns if no CrossOver). Its SCOPE-FENCE doc
  (T-17-DoS) requires WINEPREFIX to be exactly the target bottle's dir, never unset.
- `export function bridgeBottleNameFor(appId: string): string | null` — `GameLibSteamBridge-<appId>`, null for non-numeric.
- `export function resolveBridgeBottleName(appId)`, `export function findBridgeInstallBottle(appId)` — per-game vs legacy shared (`DEFAULT_BRIDGE_BOTTLE_NAME` = `GameLibSteamBridge`).
- `export function getBridgeBottleSettings(appId): GameSettings` — `wineCrossoverBottle` is the resolved bottle name.
- ~line 1482: `export async function removePerGameBridgeBottle(appId)` — the guard chain to mirror:
  (1) `bridgeBottleNameFor(appId)` non-null; (2) `sanitizeBottleName(name) === name`;
  (3) name not in forbidden set {DEFAULT_BRIDGE_BOTTLE_NAME, DEFAULT_STEAM_BOTTLE_NAME, trimmed
  `steamBottleConfigStore.get_nodefault('bottleName')`, trimmed `GlobalConfig.get().getSettings().wineCrossoverBottle`};
  (4) containment via `relative(resolve(bottlesRoot), resolve(getBottleDir(name))) === name`;
  then absent dir -> 'absent', else `killBottleWineServer(name)` ...

src/backend/storeManagers/steam/bottleProcessMonitor.ts
- `export function stopBottleProcessMonitor(appId: string): void` — sends the terminal `done` once and tears the entry down. Does NOT fire `onStopped`. No-op for unknown appId.
- `export function getBottleProcessMonitorPhase(appId): 'starting' | 'running' | null`
- A natural "matched processes gone" poll fires `done` + `onStopped` once; all terminal paths are idempotent with each other.

src/backend/storeManagers/steam/bridge/helperProcess.ts
- `export function stopBridgeHelper(appId: string): void` — no-op when no helper for appId; already imported into games.ts (line ~99).

src/backend/storeManagers/steam/games.ts
- line ~163: `const nativeInstallsInFlight = new Map<string, NativeInstallEntry>()` (module-scope state pattern).
- line ~219: `export function __resetBridgeFailedSessionForTests(): void` (test-hook naming/doc pattern).
- `private async fireBridgeWineLaunch(exePath, bridgeBottleSettings: GameSettings)` (~line 3036):
  starts the monitor with `kind: 'bridge'`, `bottleDir: getBottleDir(bridgeBottleSettings.wineCrossoverBottle)`,
  `onStopped: () => stopBridgeHelper(this.appId)` (only when `installRoot` resolves; else logs
  "no process monitor started"), then fires `runWineCommand({... wait: false})` un-awaited and routes
  settlement to `handle?.launcherExited()`.
- `async stop(_stopWine?: boolean)` (~line 3781): download-abort branch -> gvu monitor branch -> no-op warning.

src/backend/storeManagers/steam/__tests__/games.test.ts
- `const APP_ID = '570'` (numeric). `jest.mock('../bottle', ...)` at ~line 255 (resetMocks is on:
  plain arrow fns survive, jest.fn() implementations are wiped per test); `bridgeBottleNameFor` is a
  mirrored plain arrow fn. `jest.mock('../bridge/helperProcess')` ~346 (`stopBridgeHelper: jest.fn()`),
  `jest.mock('../bottleProcessMonitor')` ~369 (`startBottleProcessMonitor`, `getBottleProcessMonitorPhase`, `stopBottleProcessMonitor`).
- Bridge launch harness: `describe('SteamGame.launch() — Phase 24 Plan 08 bridge routing ...')` ~line 1679;
  the "allowlisted launch" test (~1752) shows how to drive a bridge launch
  (`bridgeAllowlist.has` -> true, `resolveBridgeLaunchExe` -> RESOLVED_EXE_PATH, `game.launch({} as any)`);
  its mocked `getBridgeBottleSettings` yields `{ wineCrossoverBottle: 'GameLibSteamBridge' }` (the LEGACY
  shared name) — per-game tests must override it to `{ wineCrossoverBottle: 'GameLibSteamBridge-570' }`.
- Existing stop() describes: '— no-op' (~2992), '— pending launch monitor (261024-gvu)' (~3004, has a
  `warnedNoOp()` helper), '— D-02 native depot-download abort' (~3037).

src/backend/storeManagers/steam/__tests__/bottle.test.ts
- `describe('removePerGameBridgeBottle')` ~line 2168: pattern for asserting the wineserver spawn
  (`mockedSpawnAsync.mock.calls.find(([bin]) => String(bin).includes('wineserver'))`, args `['-k']`,
  `env.WINEPREFIX === getBottleDir(perGameName)`), with `mockedExistsSync`, `mockedGetNodefault`, `mockedGlobalConfigGet`.
</interfaces>

Fake-HOME convention: this plan adds NO new spawn site. The only spawn is the existing
`killBottleWineServer` in bottle.ts, whose env literal sets WINEPREFIX/CX_ROOT only (none of the
eight home/config variables), which is why it already passes `fakeHomeIsolation.test.ts`. Do not
hand-roll a new `spawnAsync`/`spawn` call for the kill — route through `killBottleWineServer`. The
fake-HOME gate is still run in verify to prove that.

Sidecar exit contract: the kill is an awaited one-shot `spawnAsync` that completes; no timer, watcher
or long-lived handle is created. Do not add a retry timer or polling loop in stop().
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: bottle.ts — guarded per-game-only bridge bottle stop (stopPerGameBridgeBottle)</name>
  <files>src/backend/storeManagers/steam/bottle.ts, src/backend/storeManagers/steam/__tests__/bottle.test.ts</files>
  <behavior>
    - stopPerGameBridgeBottle('206040') with the per-game dir present spawns exactly one wineserver with args ['-k'], env.WINEPREFIX === getBottleDir('GameLibSteamBridge-206040'), env.CX_ROOT set; returns { status: 'stopped' }
    - non-numeric appId ('abc') returns { status: 'refused' } and spawns nothing
    - per-game name colliding with a forbidden bottle (e.g. GlobalConfig wineCrossoverBottle === 'GameLibSteamBridge-206040', or the stored Phase 17 bottleName equal to it) returns { status: 'refused' } and spawns nothing
    - per-game bottle dir absent returns { status: 'absent' } and spawns nothing
    - never spawns cxbottle and never calls rmSync (it stops, it does not delete)
  </behavior>
  <action>
Add `export async function stopPerGameBridgeBottle(appId: string): Promise<{ status: 'stopped' } | { status: 'absent' } | { status: 'refused'; error: string }>` to bottle.ts, placed directly after `removePerGameBridgeBottle`.

It must only ever target `bridgeBottleNameFor(appId)` — the game's OWN per-game bottle — because `wineserver -k` kills every process in a prefix and is only safe when the prefix is single-game (todo: "safe because the bottle is per-app"). Apply the same guard chain as `removePerGameBridgeBottle` steps (1)-(4) (numeric name, sanitize round-trip, forbidden set, Bottles-root containment) before any side effect. Preferred: extract steps (1)-(4) into one module-private helper (e.g. `guardPerGameBridgeBottleName(appId, caller: string)` returning `{ ok: true; name } | { ok: false; error }`) and call it from both functions so the two guard chains cannot drift — but keep `removePerGameBridgeBottle`'s existing return shapes and log message text byte-identical so its existing bottle.test.ts cases stay green (thread the caller name into the log prefix). If extraction would change any existing message, instead duplicate the four guards inline in the new function.

Then: `existsSync(getBottleDir(name))` false -> log info and return `{ status: 'absent' }`. Otherwise `await killBottleWineServer(name)` (existing WINEPREFIX-scoped, best-effort, never throws — T-17-DoS) and return `{ status: 'stopped' }`. Log at info: `stopPerGameBridgeBottle: wineserver -k for bottle "<name>" (appId <appId>)`. Never throw. Write a doc comment stating: per-game-only scope and why; that it stops, never deletes; that it is the Stop-button counterpart of removePerGameBridgeBottle (quick 261024-urq).

Tests: add `describe('stopPerGameBridgeBottle')` next to `describe('removePerGameBridgeBottle')` in bottle.test.ts, reusing that describe's mock setup (mockedExistsSync / mockedSpawnAsync / mockedGetNodefault / mockedGlobalConfigGet), covering every <behavior> bullet. Write the tests first and see them fail, then implement.
  </action>
  <verify>
    <automated>pnpm jest src/backend/storeManagers/steam/__tests__/bottle.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts && pnpm codecheck && npx prettier --check src/backend/storeManagers/steam/bottle.ts src/backend/storeManagers/steam/__tests__/bottle.test.ts</automated>
  </verify>
  <done>stopPerGameBridgeBottle exported; new describe green; every pre-existing bottle.test.ts case (incl. removePerGameBridgeBottle) still green; fakeHomeIsolation gate green; tsc clean; prettier clean on both paths.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: games.ts — record the bridge launch bottle and kill it from SteamGame.stop()</name>
  <files>src/backend/storeManagers/steam/games.ts, src/backend/storeManagers/steam/__tests__/games.test.ts</files>
  <behavior>
    - Bridge launch into the per-game bottle (getBridgeBottleSettings -> { wineCrossoverBottle: 'GameLibSteamBridge-570' }), then stop(): stopPerGameBridgeBottle called once with '570', then stopBridgeHelper('570') and stopBottleProcessMonitor('570') called; no 'Steam owns process lifecycle' warning
    - Same, with the monitor phase 'starting' (game still launching): the kill still happens (Stop during launch stops the launch)
    - Bridge launch into the LEGACY shared bottle ('GameLibSteamBridge'), then stop(): stopPerGameBridgeBottle NOT called; stopBridgeHelper and stopBottleProcessMonitor ARE called; a warning names the shared bottle as the reason no kill ran
    - Bridge launch, then the monitor's onStopped fires (game exited on its own), then stop(): stopPerGameBridgeBottle NOT called (record cleared)
    - A second stop() after a bridge stop() does not kill again (record cleared by the first)
    - Bottled-Steam route (no bridge launch recorded, getBottleProcessMonitorPhase 'running'): stopPerGameBridgeBottle NOT called; stopBottleProcessMonitor called (261024-gvu behaviour unchanged)
    - In-flight native depot download: stop() aborts it and returns; stopPerGameBridgeBottle, stopBridgeHelper, stopBottleProcessMonitor NOT called
    - Nothing recorded, no monitor: the no-op warning still logs
  </behavior>
  <action>
In games.ts:

(a) Add module-scope state beside `nativeInstallsInFlight`: `const bridgeLaunchBottles = new Map<string, string>()` with a doc comment — appId -> the bridge bottle name a live bridge launch was fired into; the single source stop() consults to detect the bridge route (the monitor alone is insufficient: no monitor starts when `installRoot` is unresolved, and the monitor does not carry the bottle name). Add `export function __resetBridgeLaunchBottlesForTests(): void` mirroring `__resetBridgeFailedSessionForTests`'s doc/shape.

(b) In `fireBridgeWineLaunch`, immediately before `runWineCommand`, `bridgeLaunchBottles.set(this.appId, bridgeBottleSettings.wineCrossoverBottle)`. Clear it when the game ends on its own: change the monitor's `onStopped` to delete the record then call `stopBridgeHelper(this.appId)`; and when NO monitor was started (`handle === null`), delete the record in the wine promise's settlement (both fulfil and reject arms). Keep the existing launcherExited routing and reportLaunchFailure exactly as they are. Also delete the record in the outer catch (launch failed). Only delete if the stored value is still the one this launch set, so a superseding relaunch's record is not clobbered by the earlier launch's late settlement.

(c) In `stop()`, keep the download-abort branch FIRST and unchanged. Insert a bridge branch BEFORE the 261024-gvu monitor branch: if `bridgeLaunchBottles.get(this.appId)` is set, delete the record, then:
  - if the recorded bottle `=== bridgeBottleNameFor(this.appId)` (import from './bottle'): log info `SteamGame.stop: stopping bridge-launched appId <id> — wineserver -k in its per-game bottle <name>` and `await stopPerGameBridgeBottle(this.appId)`; log a warning if the result status is not 'stopped' (include the status/error);
  - else (legacy shared bottle): log a warning that the game runs in the shared bridge bottle <name>, so the bottle-wide kill is refused (it would kill other games); the game process is not killed;
  - in both cases then call `stopBridgeHelper(this.appId)` and `stopBottleProcessMonitor(this.appId)` (dynamic import of './bottleProcessMonitor' as the gvu branch does) and return. Both are idempotent with the monitor's own natural "processes gone" path, which may win the race right after the kill — that is fine.
  Rewrite the stop() doc comment: it currently claims GameLib "cannot observe or terminate Steam game processes" and that the bottle path falls through to a no-op — now false for the bridge route. State the three routes: native download -> abort; bridge (GameLib spawned the Wine command) -> per-game wineserver -k + helper stop + terminal done; bottled-Steam -> monitor end only, no kill (separate decision, quick 261024-urq leaves it); otherwise no-op. Leave the gvu branch's own comment accurate for bottled-Steam. Do not change the bottled-Steam branch's behaviour.

Tests in games.test.ts: add `stopPerGameBridgeBottle: jest.fn()` to the `jest.mock('../bottle', ...)` factory. Add a new `describe('SteamGame.stop() — bridge route kills the per-game bottle (261024-urq)')` placed inside or adjacent to the bridge-routing launch describe (~1679) so it reuses that describe's beforeEach mocks (envMock.isMac, allowlist, resolveBridgeLaunchExe, ensureBridgeHelperReady, etc.); drive the record with a real `game.launch({} as any)` rather than poking the map; call `__resetBridgeLaunchBottlesForTests()` in beforeEach. Since resetMocks wipes jest.fn implementations, set `getBridgeBottleSettings` and `stopPerGameBridgeBottle` (mockResolvedValue({ status: 'stopped' })) per test. Cover every <behavior> bullet; the bottled-Steam, download-abort and no-op bullets may extend the existing stop() describes (~2992-3110) by adding `expect(stopPerGameBridgeBottle).not.toHaveBeenCalled()`. Write tests first, see them fail, then implement.
  </action>
  <verify>
    <automated>pnpm jest src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/__tests__/bottle.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts && pnpm codecheck && pnpm lint && npx prettier --check src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/games.test.ts</automated>
  </verify>
  <done>All <behavior> bullets have passing tests; every pre-existing games.test.ts case still green (notably the allowlisted-launch onStopped -> stopBridgeHelper assertion and the gvu stop tests); tsc clean; `pnpm lint` both ceilings PASS; prettier clean on both paths.</done>
</task>

<task type="auto">
  <name>Task 3: Close the todo</name>
  <files>.planning/todos/pending/2026-10-24-stop-is-a-no-op-for-bridge-launched-games.md, .planning/todos/completed/2026-10-24-stop-is-a-no-op-for-bridge-launched-games.md</files>
  <action>
Follow commit 731776408 ("chore(quick-261024-uir): close todo"): `git mv` the todo from `.planning/todos/pending/` to `.planning/todos/completed/` (same filename), leave its frontmatter untouched, and append a `## Closed 2026-10-24: <one-line outcome>` section matching that commit's shape — a short "Cause:" paragraph (stop() treated every non-download Steam route as Steam-owned; on the bridge route GameLib spawns Wine itself), what changed (per-game WINEPREFIX-scoped wineserver -k via stopPerGameBridgeBottle, helper stop, terminal done), and a "Not done here:" paragraph naming: bottled-Steam Stop still kills nothing (separate decision); a game still living in the legacy shared GameLibSteamBridge bottle gets helper/monitor teardown but no kill; live verification on the operator's Mac (Manor Lords 1363080) has not been run. Hand-match the surrounding wrap (~100 cols). Commit as `chore(quick-261024-urq): close todo`.
  </action>
  <verify>
    <automated>test -f .planning/todos/completed/2026-10-24-stop-is-a-no-op-for-bridge-launched-games.md && test ! -e .planning/todos/pending/2026-10-24-stop-is-a-no-op-for-bridge-launched-games.md && grep -q '^## Closed 2026-10-24' .planning/todos/completed/2026-10-24-stop-is-a-no-op-for-bridge-launched-games.md && pnpm planning-gates</automated>
    Prettier check omitted deliberately: `.planning/` is prettier-ignored (`npx prettier --file-info` reports `"ignored": true`), so `--check` over it would be a vacuous green.
  </verify>
  <done>Todo lives in completed/ with a Closed section; pending/ copy gone; planning-gates green; committed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer -> backend stop IPC | appId arrives from the UI; it selects which bottle gets `wineserver -k` |
| backend -> CrossOver wineserver | process-killing spawn scoped by WINEPREFIX |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-urq-01 | Denial of Service | stopPerGameBridgeBottle | mitigate | Bottle name only ever derived via bridgeBottleNameFor (numeric appId), sanitize round-trip, forbidden set (legacy shared bridge, Phase 17 Steam, stored, shared GOG/Epic bottle) and Bottles-root containment before any spawn; WINEPREFIX always set to that dir via killBottleWineServer (T-17-DoS) — never unset, so the default prefix is unreachable |
| T-urq-02 | Denial of Service | SteamGame.stop legacy branch | mitigate | stop() kills only when the recorded launch bottle === bridgeBottleNameFor(appId); a shared-bottle launch gets helper/monitor teardown only, never a bottle-wide kill |
| T-urq-03 | Tampering | spawn env | accept | No new spawn site; reuses killBottleWineServer, whose env sets only WINEPREFIX/CX_ROOT; fakeHomeIsolation gate run in verify |
| T-urq-04 | Repudiation | stop() | accept | Every branch logs which route ran and the bottle name; local desktop app, no audit requirement |
</threat_model>

<verification>
- `pnpm jest src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/__tests__/bottle.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts` green
- `pnpm codecheck` and `pnpm lint` green
- `npx prettier --check` over the four source/test paths clean
- `grep -n "stopPerGameBridgeBottle(" src/backend/storeManagers/steam/games.ts` shows the call inside stop() guarded by `bridgeBottleNameFor`
- Live check (not automatable here, record as not run in SUMMARY): on macOS launch a bridge game, click Stop — expect the log line `SteamGame.stop: stopping bridge-launched appId ...`, the game window closes, `stopBridgeHelper: terminating the bridge helper`, UI returns to Play
</verification>

<success_criteria>
- Stop on a per-game-bottle bridge launch kills that bottle's processes, tears down the helper and returns the UI to Play
- No path can `wineserver -k` a shared bottle
- Download-abort, bottled-Steam and plain no-op behaviours unchanged and pinned by tests
- Todo moved to completed/ with a Closed section
</success_criteria>

<output>
Create `.planning/quick/261024-urq-stop-bridge-launched-steam-games-steamga/261024-urq-SUMMARY.md` when done
</output>
