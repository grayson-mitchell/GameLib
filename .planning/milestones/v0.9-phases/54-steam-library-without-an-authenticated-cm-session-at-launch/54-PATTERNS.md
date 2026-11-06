# Phase 54: No authenticated Steam logon at launch, browse or Play - Pattern Map

**Mapped:** 2026-10-27
**Files analyzed:** 22 (7 new, 15 modified)
**Analogs found:** 21 / 22 (1 partial: the connection_log watcher has only a spike analog)

Scope note: Track B (Web API owned-games, `webApiToken.ts`, `ownedGamesWebApi.ts`, B1/B2/B3) is OUT OF SCOPE per ROADMAP and is deliberately absent. Where the RESEARCH Finding 1 B1/B2 text conflicts with the 2026-10-27 addendum and ROADMAP, the addendum wins: Friends sign-out on authenticated work is NOT accepted; every authenticated logon runs inside the macOS go-offline wrap.

All paths are under `/Users/graysonmitchell/Projects/GameLib/`. Steam backend dir abbreviated `S/` = `src/backend/storeManagers/steam/`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `S/anonymousClient.ts` (NEW) | service | request-response (PICS) + connection lifecycle | `S/user.ts` `connectSteamUserClient` (lines 605-691) + `S/platformCapture.ts` `withPlatformCaptureLock` (240-250) | role-match |
| `S/macSteamOffline.ts` (NEW; wrap + `readMacSteamCmState` + `watchConnectionLog`) | utility | event-driven (file tail + URL verbs) | `.planning/spikes/046b-wrap-around-logon/wrap.mjs` (`tail`, `until`) + `S/games.ts:2718` `shell.openExternal` | partial (spike only) |
| `S/user.ts` (MOD: `acquireAuthenticated`, refcount, `autoRelogin:false`, drop sign-in persona logon, logout closes both) | service | request-response / session lifecycle | itself: `ensureConnected` 241-477, `connectSteamUserClient` 605-691, `releaseForShutdown` 591-603, `logout` 496-` | exact (self) |
| `S/authTrigger.ts` (MOD: deterministic launch deferral) | utility | state gate | itself (80-123) | exact (self) |
| `S/library.ts` (MOD: `refresh()` gating, platform capture on anonymous client) | service | CRUD + request-response | itself: `refresh()` 940-1030, capture call ~1043 | exact (self) |
| `S/depot.ts` (MOD: scoped session, `LastOwner` from persisted SteamID) | service | batch / streaming | itself: `getDepotClient` 403-420, 508-524, 785, 1305, 3848 | exact (self) |
| `S/platformCapture.ts` (MOD: feed anonymous client) | service | batch (bulk PICS) | itself: `PlatformCapturePicsClient` 252-262 | exact (self) |
| `S/installLocation.ts` (MOD: `fetchInstalldir` anonymous) | service | request-response | itself 236-310 | exact (self) |
| `S/bridge/launchTarget.ts` (MOD: `resolveBridgeLaunchExe` anonymous) | service | request-response | itself 80-190 | exact (self) |
| `S/games.ts` (MOD: `getExtraInfo` 1020-1045, install/redeem entry points acquire+release, Play) | controller | request-response | itself | exact (self) |
| `src/backend/__tests__/steamAuthSessionPolicy.test.ts` (NEW) | test (source gate) | transform (file walk) | `src/backend/__tests__/fakeHomeIsolation.test.ts` | exact |
| `S/__tests__/anonymousClient.test.ts` (NEW) | test | request-response | `S/__tests__/user.test.ts` (mock block 14-148) | role-match |
| `S/__tests__/authSessionLifecycle.test.ts` (NEW) | test | event-driven (fake timers) | `S/__tests__/user.test.ts` + `steamStartupKeyringDeferral.test.ts` | role-match |
| `S/__tests__/macSteamOfflineWrap.test.ts` (NEW) | test | event-driven | `S/__tests__/user.test.ts` | role-match |
| `S/__tests__/steamStartupKeyringDeferral.test.ts`, `authTrigger.test.ts`, `user.test.ts`, `library.test.ts`, `platformCapture.test.ts`, `installLocation.test.ts` (MOD) | test | mixed | themselves | exact (self) |
| `src/frontend/state/SteamGoOfflineNotice.ts` (NEW, zustand store + signal handler) | store | event-driven (backend push) | `src/frontend/state/SteamBridgeRouteNotice.ts` | exact |
| `src/frontend/screens/.../SteamGoOfflineNotice.tsx` (NEW dialog; mount in `App.tsx` next to line 132) | component | event-driven | `src/frontend/screens/Game/GamePage/components/SteamBridgeRouteNotice.tsx` | exact |
| `src/common/types/ipc.ts` (MOD: new `steamGoOfflineRequired` push type) | config (IPC contract) | pub-sub | `steamBridgeRouteNotice` at ipc.ts:792-799 | exact |
| `src/preload/api/steam.ts` (MOD: `handleSteamGoOfflineRequired = frontendListenerSlot(...)`) | provider | pub-sub | line 38 | exact |
| `src/frontend/state/GlobalState.tsx` (MOD: register listener) | provider | pub-sub | lines 1681-1686 | exact |
| `.planning/research/STEAM-STACK.md`, `CLAUDE.md` Steam stack para (MOD: docs) | config (docs) | n/a | STEAM-STACK.md tables (lines 22, 30, 63) | exact (self) |

---

## Pattern Assignments

### `S/anonymousClient.ts` (service, request-response + lifecycle)

**Analog A:** `S/user.ts` `connectSteamUserClient` (605-691) for client construction, 15 s bounded connect, `error` capture, never leave a half-open client.
**Analog B:** `S/platformCapture.ts:240-250` for serialising work through a module-level promise chain.
**Analog C:** `S/withTimeout.ts` (`withTimeout(promise, ms, label)`, `isTimeout`) and `S/constants.ts` (`STEAM_PICS_TIMEOUT_MS = 25000`, `STEAM_PICS_BULK_TIMEOUT_MS`, `STEAM_INSTALLDIR_CONNECT_TIMEOUT_MS`).

**Imports pattern** (user.ts 1-23, trimmed to what the module needs):
```typescript
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { withTimeout } from './withTimeout'
import SteamUserLib from 'steam-user'
```
The `AnonymousSteam` module must not import `user.ts` (keeps the source gate simple and avoids a cycle; `authTrigger.ts` is the precedent for "LEAF module by design", authTrigger.ts lines 1-9).

**Client construction + connect timeout** (user.ts 615-628, 689):
```typescript
const client = new SteamUserLib({ enablePicsCache: false })
return new Promise<string>((resolve) => {
  const timeout = setTimeout(() => { /* warn + resolve fallback */ }, 15000)
  client.once('loggedOn', async () => { clearTimeout(timeout) /* ... */ })
  client.once('error', (err: Error) => { clearTimeout(timeout) /* ... */ })
  client.logOn({ refreshToken })   // anonymous variant: client.logOn({ anonymous: true })
})
```
Anonymous variant differences (RESEARCH Pattern 1, probed live): `client.logOn({ anonymous: true })`; on timeout or `error`, call `client.logOff()` so steam-user reconnect timers cannot hold the loop (user.ts 591-603 documents the exit-contract rationale: "an anonymous-logged-on client keeps a bare node process alive indefinitely; `logOff()` lets it drain in ~100ms"). Single in-flight connect promise = same dedupe idea as `connectingPromise` (user.ts 370-377):
```typescript
if (!this.connectingPromise) {
  this.connectingPromise = this.connectSteamUserClient(outcome.token).finally(() => {
    this.connectingPromise = null
  })
}
await this.connectingPromise
```
**Serialisation idiom** (platformCapture.ts 240-250):
```typescript
const run = platformCaptureChain.then(section, section)
platformCaptureChain = run.then(() => undefined, () => undefined)
return run
```
**Idle timer / exit contract** (house spelling, used at bottle.ts:504, library.ts:3109): `timer.unref?.()` (optional call, because jest fake timers return no `unref`).
**Shutdown hook:** expose `releaseAnonymousForShutdown()`; call it from the same place that calls `SteamUser.releaseForShutdown()` (grep that caller; stdin-EOF path). `logout()` must also close it (RESEARCH row 13).
**Logon-mode log line (SC1 runtime evidence):** `logInfo('[Steam] CM logon mode=anonymous reason=...', LogPrefix.Steam)`; same format with `mode=authenticated` in `user.ts`.
**Return shape:** hand callers the narrow `PlatformCapturePicsClient`-style structural interface (platformCapture.ts 252-262), not the real `steam-user` type.
**`public_only` handling:** callers keep their existing `undefined`/fail-soft handling (RESEARCH Finding 4 caveat, Pitfall 3); add a fixture `{appid, public_only: true, common: {...}}` in tests.

---

### `S/macSteamOffline.ts` (utility, event-driven) - the go-offline wrap

**Analog:** `.planning/spikes/046b-wrap-around-logon/wrap.mjs` (no production analog exists; treat as the only partial match). Production verb call: `S/games.ts:2718` `await shell.openExternal(url, { activate: false })`, import at games.ts:3 `import { shell } from 'backend/platform'`.

**Byte-offset tail that survives truncation** (wrap.mjs 30-42), port to TypeScript with `node:fs`:
```javascript
function tail(path) {
  let offset = statSync(path).size
  return () => {
    const size = statSync(path).size
    if (size < offset) offset = 0
    if (size === offset) return []
    const buf = Buffer.alloc(size - offset)
    const fd = openSync(path, 'r')
    readSync(fd, buf, 0, buf.length, offset)
    offset = size
    return buf.toString('utf8').split('\n').filter(Boolean)
  }
}
```
Changes required vs the spike: `closeSync(fd)` in a `finally` (spike leaks fd); strip the trailing CR from each line; take the offset BEFORE firing `gooffline` (RESEARCH Pattern 3); the poll is a bounded loop (5 s) using a timer that is `unref?.()`'d.
**Poll/until shape** (wrap.mjs 44-53): 250 ms `sleep` loop with a deadline, regexes `/user initiated logoff/` for LogOff and `/RecvMsgClientLogOnResponse\(\) : processing complete/` for logon complete.
**Verbs** (wrap.mjs 69, 87 use `open -g`; production uses `shell.openExternal`, RESEARCH Finding 10): `steam://open/gooffline`, `steam://open/goonline`. macOS only: gate on `platform === 'darwin'` (user.ts imports `platform` from `'process'`, line 16).
**Wrap skeleton to copy** (RESEARCH Pattern 3, 54-RESEARCH.md lines 52-66): `readMacSteamCmState()` -> if not `'Logged On'` call `connect()` directly with NO toggle and NO `goonline`; else watch, fire `gooffline`, if no LogOff within 5 s throw `GuidedOfflineRequired` (never log on), `try { return await connect() } finally { await shell.openExternal('steam://open/goonline') }`.
**Log path:** `~/Library/Application Support/Steam/logs/connection_log.txt`. Resolve the home via the same helper other Steam macOS code uses (check `S/constants.ts` `STEAM_INSTALL_PATHS`, imported in user.ts:4) rather than `os.homedir()` inline; tests must not touch the real profile (CLAUDE.md fake-HOME rule applies if any test spawns).
**Test (ROADMAP SC6, `macSteamOfflineWrap.test.ts`):** four cases are mandatory: already offline (no toggle, no `goonline`), LogOff seen, LogOff not seen (guided fallback, `connect` never called), `connect` throws (`goonline` still fires); plus non-darwin passthrough.

---

### `S/user.ts` (MOD) - authenticated entry point

**Analog:** itself. Rename/privatise `ensureConnected` (241-477) as the implementation body; add the public entry point beside it.

**New entry point shape** (RESEARCH Pattern 2, lines 270-276):
```typescript
const release = await SteamUser.acquireAuthenticated('user-install')
try { /* buildDepotPlan ... downloadDepotFiles ... finalize */ } finally { release() }
```
`release` idempotent; last release arms an `unref?.()`'d idle timer (30-60 s) that calls `client.logOff()` and nulls `this.client`. Existing `releaseForShutdown()` (591-603) already sets `shuttingDown` and `logOff()`s; keep it and make it also cancel the idle timer.

**Reuse as-is inside the entry point:** keyring outcome branch (user.ts 331-362), epoch capture (368), `reportLogonVerdict('healthy'|'expired', epochAtStart)` (391, 428, 469-474), `getLogonFailure()` early-out (410-431). Keep the `connectingPromise` dedupe (370-377) so concurrent acquires share one logon.

**Constructor change** (line 615): `new SteamUserLib({ enablePicsCache: false })` becomes `new SteamUserLib({ enablePicsCache: false, autoRelogin: false })`. Treat `disconnected` as session ended (null `this.client`).
**Canary relog change** (lines 269-320): replace the `client.relog()` branch with: null the stale client and re-enter the wrapped cold path (ROADMAP: "canary `relog()` and any reconnect go back through the wrap"). Delete the `relogStarted`/`RELOG_GRACE_MS` branch or reduce it to the re-entry.
**Wrap placement:** the cold `connectSteamUserClient(outcome.token)` call (371) is what `withMacSteamOffline(...)` wraps; the wrap lives only in the first-acquire path so the refcount and the source gate cover it.
**Sign-in persona logon removal** (RESEARCH Finding 8, row 12): `finishAuth` (561) and QR handler (~768-798) call `connectSteamUserClient` only for `getPersonas` (654). Replace with the `steam-session` `session.accountName`/`steamID` already available; persist `userData.steamId`. Note QR handler assigns `this.connectingPromise = connectPromise.finally(...)` (797-799); that goes away with the logon.
**Error-handling excerpt to preserve** (user.ts 335-347, wording matters, test pins it):
```typescript
if (outcome.status === 'unreadable') {
  logWarning(`Steam: refresh token read failed (${outcome.reason}) — this is retryable, ` +
    'keeping the signed-in session and NOT clearing any credentials', LogPrefix.Steam)
  return false
}
```
**Guided fallback signal:** on `GuidedOfflineRequired`, `sendFrontendMessage('steamGoOfflineRequired', {...})` (pattern below) and return `false`/throw a typed error; never log on.
**`redeemKey`** (1044-1048): `const connected = await this.ensureConnected()` becomes acquire/release.

---

### `S/authTrigger.ts` (MOD) - deterministic launch deferral

**Analog:** itself. Current sticky gate (80-102):
```typescript
let unlocked = false
export function noteSteamAuthTrigger(trigger: SteamAuthTrigger): boolean {
  lastTrigger = trigger
  if (!DELIBERATE_TRIGGERS.has(trigger)) return false
  if (unlocked) return false
  unlocked = true
  return true
}
```
Problem to fix (ROADMAP goal): `'boot-probe'` is in `DELIBERATE_TRIGGERS` (line 57), so it unlocks the gate for a later automatic `refresh()`, and `library.ts:957` `if (!isSteamAuthUnlocked())` then lets the mount refresh reach `ensureConnected()`. Pattern to follow for the fix: keep the allowlist idiom (`DELIBERATE_TRIGGERS` Set, `ORIGIN_TO_TRIGGER` own-property-guarded lookup 147-155) and separate "may read the keyring" from "may open a CM logon" (e.g. remove `'boot-probe'` from the logon-unlocking set but keep keyring-probe behaviour; `'game-page'` and `'user-play'` also stop being logon triggers). Unit test must cover both orderings (boot probe first, mount refresh first) per SC1. Module header comment block (1-28) records the REVERSAL history; append a Phase 54 REVERSAL note in the same style.

---

### `S/library.ts` (MOD) - `refresh()` and platform capture

**Analog:** itself, `refresh()` 940-1030. Five exit paths with a tri-state `steamSyncStatus` (exactly one emit per exit, 34.15 D-07):
```typescript
if (!isSteamAuthUnlocked()) {
  logInfo(`Steam: library refresh deferred until a deliberate Steam action — no keyring_get issued (trigger=${currentTriggerLabel()})`, LogPrefix.Steam)
  sendFrontendMessage('steamSyncStatus', { status: 'idle' })
  return null
}
sendFrontendMessage('steamSyncStatus', { status: 'syncing' })
const connected = await SteamUser.ensureConnected()
const client = SteamUser.getClient()
```
Disposition: launch/mount refresh keeps emitting `idle` and returns the cached list; explicit Refresh (`'user-refresh'`) acquires `acquireAuthenticated('user-refresh')` and releases in `finally` after `getUserOwnedApps(client.steamID, {includePlayedFreeGames:true})` (~995). `captureOwnedAppPlatforms(client as PlatformCapturePicsClient, appIds)` (~1043) switches to the anonymous client. A new exit path (guided go-offline required) must keep the one-emit-per-exit rule and the existing failed-reason vocabulary. Also check `library.ts:406` resume path (`buildDepotPlan`) is inside an acquire.

---

### `S/depot.ts` (MOD)

**Analog:** itself. Sites: `getDepotClient()` 403-420 (`SteamUser.getClient()` then throw), `withPlanBuildRetry` 508-524 (`await SteamUser.ensureConnected()` on retry), `buildDepotPlan` 785, `downloadSharedRedistDepots` 1305, `prescreenBridgeDepots` ~1024.
Replace the `ensureConnected()` calls with "session already held by the caller's `acquireAuthenticated`"; retries re-enter the entry point, not a bare connect. Keep depot-side helpers (`depot/cdnAuth.ts`, `appinfoOrder.ts`, `reconcile.ts`) unchanged.

**`LastOwner` fix** (depot.ts 3841-3848, current):
```typescript
const lastOwner = SteamUser.getClient()?.steamID?.getSteamID64()
```
Replace with the persisted SteamID: `configStore.get('userData')?.steamId` (the store is `S/electronStores.ts`, used at user.ts:3, 267, 360). Keep the "falls back to manifest.ts's own '0' default" semantics and add a `depot.finalize.test.ts` case where `getClient()` is null (session closed).

---

### `S/platformCapture.ts`, `S/installLocation.ts`, `S/bridge/launchTarget.ts` (MOD)

**Analog:** each file itself; the three share one shape, so apply one edit pattern.
Current shape to remove (launchTarget.ts 100-114; identical in installLocation.ts 245-271):
```typescript
let client = SteamUser.getClient()
if (!client) {
  try {
    await withTimeout(SteamUser.ensureConnected(), STEAM_INSTALLDIR_CONNECT_TIMEOUT_MS, 'resolveBridgeLaunchExe ensureConnected')
  } catch (err) { logWarning(`...ensureConnected timed out/failed ...: ${String(err)}`, LogPrefix.Steam) }
  client = SteamUser.getClient()
  if (!client) return undefined
}
```
Replace with `const client = await AnonymousSteam.getClient()` (bounded, returns null on failure), keeping `if (!client) return undefined`. Keep the PICS call and its bound unchanged (launchTarget.ts 132-139 / installLocation.ts 289-296):
```typescript
const { apps } = await withTimeout(client.getProductInfo([numericAppId], [], true), STEAM_PICS_TIMEOUT_MS, 'resolveBridgeLaunchExe getProductInfo')
```
`fetchInstalldir`: on a `public_only` miss, fall back to the authenticated client only if an install session is already open (`SteamUser.getClient()` non-null, never `ensureConnected()`). `resolveBridgeLaunchExe` (Play, games.ts:2874): prefer the placed shim / ACF `installdir` and use PICS only to fill gaps (RESEARCH Pitfall 3). `NUMERIC_APP_ID` guard stays first.
`platformCapture.ts`: no signature change needed; `PlatformCapturePicsClient` (252-262) is the structural seam the anonymous client satisfies; its tests already use a plain object.

---

### `S/games.ts` (MOD)

**Analog:** itself.
- `getExtraInfo()` 1020-1045: delete the `void SteamUser.ensureConnected().catch(...)` block. Keep `noteSteamAuthTrigger('game-page')` only if still needed for the keyring gate; with the gate decoupled from logon it likely goes too. Current block:
```typescript
if (noteSteamAuthTrigger('game-page')) {
  void SteamUser.ensureConnected().catch((err) => { logWarning([...], LogPrefix.Steam) })
}
```
- Install entry points (`runNativeDepotDownload` ~2213, `prescreenBridgeDepots` caller ~1243, `resumeInterruptedSteamInstall` ~1116, shared-redist caller `bridge/sharedRedistInstall.ts:364`): wrap in `acquireAuthenticated` + `finally release()`; AbortSignal cancel must still release.
- Backend-raised guided-step push: copy the `steamBridgeRouteNotice` emitter (games.ts 1296-1304):
```typescript
sendFrontendMessage('steamBridgeRouteNotice', {
  appName: this.appId, reason: noticeReason, knownBadReason: bridgeRoute.knownBadReason,
  missingSymbols: bridgeRoute.missingSymbols, route: bridgeRoute.route, userRoute: bridgeRoute.userRoute
})
return { status: 'done', deferredToSetup: true }
```
For the go-offline step the emit originates in `user.ts`/the wrap (not `SteamGame`), and the install returns a deferred status the same way (`deferredToSetup: true`) so the UI does not show a failed install.

---

### `src/backend/__tests__/steamAuthSessionPolicy.test.ts` (test, source gate)

**Analog:** `src/backend/__tests__/fakeHomeIsolation.test.ts` (exact). Copy structure and idioms:

**Imports** (28-32):
```typescript
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { stripSourceComments } from '../testUtils/stripSourceComments'
```
**Walk + prune + normalise** (34-52, 144-168): `REPO_ROOT = join(__dirname, '..', '..', '..')`, `PRUNED_DIRS`, `SCANNED_EXT = /\.(ts|tsx|cjs|js)$/`, `toRepoRel` (the ONLY caller of `relative()`, `.split(sep).join('/')`), `walk`, `collectScannedFiles`. Scan root `src` only (plus `meta` optional).
**Anti-vacuity floor** (45-55, 248-252):
```typescript
const MIN_FILES_SCANNED = 600   // re-measure at implementation time; set near half the real count
expect(scannedFiles.length).toBeGreaterThanOrEqual(MIN_FILES_SCANNED)
expect(scannedRelPaths).toContain(HELPER_REL_PATH)  // here: user.ts, depot.ts, anonymousClient.ts must be scanned
```
**Comment stripping on all matching** (179): `const source = stripSourceComments(readFileSync(absolute, 'utf-8'))`. `stripSourceComments` strips block comments then whole-line `//` comments; trailing `//` comments are NOT stripped and it preserves `"steam://..."` literals (stripSourceComments.ts header). Do not match raw source.
**Allow-list + skip-list reachability test** (254-267): every allow-listed path must be in `scannedRelPaths`, so a rename turns the gate red. Allow-list files: `user.ts` for `logOn(... refreshToken ...)`; a named set (depot.ts, library.ts, games.ts, sharedRedistInstall.ts, user.ts) for `SteamUser.(acquireAuthenticated|ensureConnected)(`.
**Exemption anchors** (100-120, 203-221): if any file is exempted, give it `reason` + `anchors` read from the file's own raw header (the one place that does NOT strip), copied onto a single line from disk.
**Rules to encode (RESEARCH Code Examples 339-345 + ROADMAP SC3 and SC6):**
1. `/logOn\(\s*\{[^}]*refreshToken/` only in `S/user.ts`.
2. `SteamUser.ensureConnected(` is not called from anywhere (private) or only from user.ts; `acquireAuthenticated(` only from allow-list.
3. `new SteamUserLib(`/`new SteamUser(` constructed with `autoRelogin: false` wherever authenticated (SC6).
4. `.relog(` does not appear outside the wrap path.
5. `bridge/launchTarget.ts`, `installLocation.ts`, `platformCapture.ts`, `games.ts getExtraInfo` contain no `ensureConnected`/`acquireAuthenticated` (SC1/SC2).
6. Non-vacuity: assert the allow-listed files DO contain a match (rule 1 matches in user.ts), so an emptied regex cannot pass. Same idea as fakeHomeIsolation's "imports its key list" check (269-273).
Gate conventions: file in `src/backend/__tests__/`; CLAUDE.md `<verify>` rule: `npx prettier --check` scoped over exact paths after `--file-info`.

---

### `S/__tests__/anonymousClient.test.ts`, `authSessionLifecycle.test.ts`, `macSteamOfflineWrap.test.ts` (tests)

**Analog:** `S/__tests__/user.test.ts`. Mock block to copy (lines 14-148): `jest.mock('backend/platform', ...)` (19), `jest.mock('backend/ipc', ...)` (32), `jest.mock('backend/logger', ...)` (38), `jest.mock('graceful-fs', ...)` (55), `jest.mock('../electronStores', ...)` (67), `jest.mock('steam-session', ...)` (103), and the steam-user mock:
```typescript
const MockSteamUserLib = jest.fn(() => mockSteamUserInstance) as any
jest.mock('steam-user', () => MockSteamUserLib)
// per-test: MockSteamUserLib.mockImplementation(() => mockSteamUserInstance)  (line 204)
// two-client tests: MockSteamUserLib.mockImplementationOnce(() => clientA) / (() => clientB)  (1376-1377)
```
Launch-scenario assertions per RESEARCH 347-355: `logOn` called once with `{ anonymous: true }`, never with `refreshToken`. Lifecycle: refcount, concurrent acquire shares one logon, last release -> `logOff` after grace using fake timers (`unref?.()` spelling is why), abort releases. For the real-`SteamUser` + real `library.ts`/`games.ts` structural proof (both orderings of boot-probe/mount refresh), follow `steamStartupKeyringDeferral.test.ts` (header 1-30: does NOT mock `./user`, installs a spy `TokenStore` through the production `setTokenStore()` seam).
Do not use a real `~/Library/Application Support/Steam` path in tests: inject the log path or mock `fs`.

---

### Guided "Go Offline" frontend step

**Analog (exact):** the backend-pushed `steamBridgeRouteNotice` chain. Replicate its five links with a new channel `steamGoOfflineRequired`.

1. **IPC type** - `src/common/types/ipc.ts:792-799` shape (a one-way push, function type returning void):
```typescript
steamBridgeRouteNotice: (payload: { appName: string; reason: ...; ... }) => void
```
2. **Preload** - `src/preload/api/steam.ts:36-38`:
```typescript
// one-way push -- games.ts's install() emits, SteamBridgeRouteNotice.ts subscribes. No handler, listener only.
export const handleSteamBridgeRouteNotice = frontendListenerSlot('steamBridgeRouteNotice')
```
3. **Backend emit** - `sendFrontendMessage('steamBridgeRouteNotice', {...})` (games.ts:1296). Import `sendFrontendMessage` the way library.ts does (it emits `steamSyncStatus` at library.ts:959, 969, 993).
4. **Store + signal handler** - `src/frontend/state/SteamBridgeRouteNotice.ts` (zustand `create`; `open`/`close`; a standalone exported handler so tests need no GlobalState mount, because the frontend jest config has no jsdom):
```typescript
export const useSteamBridgeRouteNotice = create<SteamBridgeRouteNoticeState>()((set) => ({
  isOpen: false, /* ... */
  open: (payload) => set({ isOpen: true, ...payload }),
  close: () => set({ isOpen: false, /* reset */ })
}))
export const handleSteamBridgeRouteNoticeSignal = (_e: IpcRendererEvent, payload: SteamBridgeRouteNoticePayload): void => {
  useSteamBridgeRouteNotice.getState().open(payload)
}
```
   Add `// ts-prune-ignore-next` on payload interfaces consumed only through inferred types, as the analog does.
5. **Register + mount** - `GlobalState.tsx:1686` `window.api.handleSteamBridgeRouteNotice(handleSteamBridgeRouteNoticeSignal)` (inside the same listener-registration block, lines 1678-1690) and `App.tsx:37` import + `App.tsx:132` `<SteamBridgeRouteNotice />`.
6. **Dialog component** - `.../GamePage/components/SteamBridgeRouteNotice.tsx`: imports (1-13) `Dialog, DialogContent, DialogFooter, DialogHeader` from `'frontend/components/UI/Dialog'`; `useTranslation('gamelib')`; i18n keys with inline `defaultValue`s (`t('steam.bridge.routeNotice.titleBridge', '...')`); buttons `className="button is-primary"` / `"button is-secondary outline"`; busy + error state, handlers use `void handler()` so no promise floats; early `return null` when `!isOpen`. Copy the structure; actions for this step: "I've gone offline, retry" (calls a new invoke that re-enters the acquire; backend refuses if LogOff still not seen), "Cancel". Body copy must say the user should choose Steam menu > Go Offline; do not promise Friends recovery (RESEARCH Finding 5 note).
   Retry invoke: copy `makeHandlerInvoker` usage in preload/api/steam.ts (e.g. line 28 `steamFinishBottledInstall = makeHandlerInvoker('steamFinishBottledInstall')`) plus its backend handler registration (find via `graphify explain "steamFinishBottledInstall"`).
7. **Test** - copy the store-level test style from the existing `__tests__` next to `SteamBridgeRouteNotice` (call `handleSteamGoOfflineRequiredSignal` directly).

Secondary analogs if a non-modal surface is preferred: `SteamBottleSetup.tsx` (513 lines, `steamBottleSetupRequired` push, `preload/api/steam.ts:35`) and `SteamClientSetup.tsx`. SteamBridgeRouteNotice is the closest because it is a short informational-plus-action dialog with no multi-step form.

---

### `.planning/research/STEAM-STACK.md` and `CLAUDE.md` (docs MOD)

**Analog:** the existing tables. Edit rows: Authentication row for steam-user (line 22), Library Data row (line 30, says `getOwnedApps()`; code actually uses `getUserOwnedApps`, library.ts ~995), and "Alternatives Rejected" Steam Web API row (line 63). Add a dated "Reopened by Phase 54" note: any authenticated steam-user CM logon signs the Mac Steam Friends list out (debug `friends-signout-steam-user`); steam-user is used anonymously for public PICS and authenticated only for explicit Refresh, sign-in and installs, wrapped on macOS in the go-offline trick (spike 046); Web API stays rejected as primary because Valve refuses SteamClient refresh tokens for access tokens without an authenticated CM (RESEARCH Finding 1). `.planning` is prettier-ignored; `CLAUDE.md` is not: run `npx prettier --file-info` first, `--check` only on `CLAUDE.md` if edited (CLAUDE.md conventions row 5).

---

## Shared Patterns

### Sidecar exit contract (every new timer, socket, client handle)
**Source:** `S/bottle.ts:504`, `S/bottleProcessMonitor.ts:213`, `S/cancelDelete.ts:103`, `S/library.ts:3109`; `S/user.ts` 584-603 (rationale).
**Apply to:** `anonymousClient.ts` (connect timeout, idle timer), `user.ts` (idle grace timer), `macSteamOffline.ts` (log poll).
```typescript
timer.unref?.()            // optional call: jest fake timers return no unref
```
Plus: no unbounded in-flight work at boot (bound every connect/poll with `withTimeout` or a deadline); `logOff()` the client on connect failure; `releaseForShutdown()` closes both clients. `unref()` does not fix an unbounded in-flight request. `pnpm smoke:sidecar` is a weak backstop (misses slow exit).

### Bounded CM calls
**Source:** `S/withTimeout.ts`; constants `STEAM_PICS_TIMEOUT_MS` (25 s single app), `STEAM_PICS_BULK_TIMEOUT_MS` (90 s bulk), `STEAM_INSTALLDIR_CONNECT_TIMEOUT_MS` in `S/constants.ts`.
**Apply to:** every `getProductInfo` on the anonymous client and every anonymous connect.

### Logging, no secrets
**Source:** `import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'` (user.ts:2); array form for errors `logWarning(['msg:', err], LogPrefix.Steam)`; `[Timing]` prefix for timing lines. Never log tokens; log line per logon `[Steam] CM logon mode=anonymous|authenticated reason=...` is the SC1 runtime evidence and the UAT check.

### Tri-state sync status
**Source:** `S/library.ts` `refresh()` 940-1030, `sendFrontendMessage('steamSyncStatus', { status: 'idle' | 'syncing' | ... })`. Exactly one terminal emit per exit path; keep vocabulary.

### Credential verdict reporting
**Source:** `S/user.ts` `reportLogonVerdict` (224) + `captureSignInEpoch('steam')` (368) + `applySignInVerdict`. Only the authenticated entry point reports verdicts; fenced, write-if-changed. Since launch no longer connects, the "token dead" signal appears at the next install/Refresh (RESEARCH Pitfall 8).

### Numeric appId guard
**Source:** `NUMERIC_APP_ID.test(appId)` at the top of `resolveBridgeLaunchExe` (launchTarget.ts 91-97) and `fetchInstalldir` (installLocation.ts 236-243). Keep first in any refactor.

### Source-gate idiom
**Source:** `src/backend/__tests__/fakeHomeIsolation.test.ts`, `src/backend/testUtils/stripSourceComments.ts`. Always match on comment-stripped source, always add a non-vacuity floor, always test that allow-list entries are reachable.

### Repo conventions to honour in plans (CLAUDE.md)
- `<verify>` blocks: `npx prettier --check` over the exact paths written, check `--file-info` first; `.planning` is ignored.
- Child-process spawns in tests: `createFakeHomeProfile()`; never a hand-rolled env literal.
- UAT file `54-UAT.md`: `### N.` at column 0, `expected:` inline, `result:` starting with a bare status word.
- `tauri dev` does not rebuild the sidecar: restart dev and check `sidecar.js` mtime before any live gate (memory note).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `S/macSteamOffline.ts` (log tail / `readMacSteamCmState`) | utility | file tail, event-driven | No production code tails a file or reads Steam's `connection_log.txt`; only the spike `.planning/spikes/046b-wrap-around-logon/wrap.mjs` (and 046a `probe.mjs`) exist. Plan from RESEARCH Pattern 3 + the spike, with fd-close and unref fixes noted above. |
| Refcounted session with idle grace (`acquireAuthenticated`) | service | session lifecycle | No existing refcounted acquire/release in the Steam managers; closest are `connectingPromise` dedupe (user.ts 370-377) and `platformCaptureChain` (platformCapture.ts 240-250). Build from RESEARCH Pattern 2. |

## Metadata

**Analog search scope:** `src/backend/storeManagers/steam/` (+ `bridge/`, `__tests__/`), `src/backend/__tests__/`, `src/backend/testUtils/`, `src/frontend/state/`, `src/frontend/screens/Game/GamePage/components/`, `src/preload/api/`, `src/common/types/ipc.ts`, `.planning/spikes/046b-*`, `.planning/research/STEAM-STACK.md`. Located via `graphify query` (frontend dialog raised by backend) then targeted grep.
**Files scanned:** about 25 read in full or by range.
**Pattern extraction date:** 2026-10-27
