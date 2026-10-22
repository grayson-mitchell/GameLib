---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
reviewed: 2026-10-22T09:49:40Z
depth: standard
files_reviewed: 110
files_reviewed_list:
  - meta/__tests__/bridgeCensus.test.ts
  - meta/__tests__/buildSteamBridgeShims.test.ts
  - meta/__tests__/extractProtonInventory.test.ts
  - meta/__tests__/fixtures/abi-exercise.manifest.json
  - meta/__tests__/fixtures/protonThunkExcerpt.txt
  - meta/__tests__/gen_vtables.test.ts
  - meta/__tests__/shimAbiGate.test.ts
  - meta/bridgeCensus.ts
  - meta/buildSteamBridgeShims.ts
  - meta/extractProtonInventory.ts
  - meta/gen_vtables.ts
  - meta/lintScoped.cjs
  - meta/sdk/acceptance-interface-versions.json
  - meta/sdk/isteamapps004.manifest.json
  - meta/sdk/isteamapps008.manifest.json
  - meta/sdk/isteamclient017.manifest.json
  - meta/sdk/isteamfriends.manifest.json
  - meta/sdk/isteamfriends011.manifest.json
  - meta/sdk/isteamfriends015.manifest.json
  - meta/sdk/isteammatchmaking009.manifest.json
  - meta/sdk/isteammatchmakingservers002.manifest.json
  - meta/sdk/isteamnetworking005.manifest.json
  - meta/sdk/isteamremotestorage005.manifest.json
  - meta/sdk/isteamremotestorage010.manifest.json
  - meta/sdk/isteamremotestorage013.manifest.json
  - meta/sdk/isteamuser.manifest.json
  - meta/sdk/isteamuser016.manifest.json
  - meta/sdk/isteamuser019.manifest.json
  - meta/sdk/isteamuserstats010.manifest.json
  - meta/sdk/isteamuserstats011.manifest.json
  - meta/sdk/isteamutils005.manifest.json
  - meta/sdk/isteamutils008.manifest.json
  - meta/sdk/ordinals.json
  - meta/sdk/wire-policy.json
  - native/steam-bridge/generated/bridge_dispatch.h
  - native/steam-bridge/generated/steam_api.def
  - native/steam-bridge/generated/steam_api64.def
  - native/steam-bridge/generated/steam_api_shim.c
  - native/steam-bridge/helper/bridge_helper.c
  - public/bin/.gitignore
  - public/locales/de/gamelib.mt.json
  - public/locales/en/gamelib.json
  - src/backend/constants/paths.ts
  - src/backend/sidecar/__tests__/steamAuthFlows.test.ts
  - src/backend/sidecar/steamAuthFlowRegistration.ts
  - src/backend/storeManagers/steam/__tests__/bottle.test.ts
  - src/backend/storeManagers/steam/__tests__/bottleLaunchSignals.test.ts
  - src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts
  - src/backend/storeManagers/steam/__tests__/depot.prescreen.test.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/backend/storeManagers/steam/__tests__/installFormIpc.test.ts
  - src/backend/storeManagers/steam/__tests__/library.test.ts
  - src/backend/storeManagers/steam/__tests__/metadataCapture.test.ts
  - src/backend/storeManagers/steam/__tests__/removeCopies.test.ts
  - src/backend/storeManagers/steam/__tests__/steamStartupKeyringDeferral.test.ts
  - src/backend/storeManagers/steam/bottle.ts
  - src/backend/storeManagers/steam/bottleLaunchSignals.ts
  - src/backend/storeManagers/steam/bottleProcessMonitor.ts
  - src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/bridgeConfig.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/bridgeRoute.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/bridgeVerdict.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/fixtures/objdumpImports.ts
  - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/importScan.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/interfaceVersions.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/launchTarget.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
  - src/backend/storeManagers/steam/bridge/allowlist.ts
  - src/backend/storeManagers/steam/bridge/bridge-allowlist.json
  - src/backend/storeManagers/steam/bridge/bridgeConfig.ts
  - src/backend/storeManagers/steam/bridge/bridgeRoute.ts
  - src/backend/storeManagers/steam/bridge/bridgeVerdict.ts
  - src/backend/storeManagers/steam/bridge/helperProcess.ts
  - src/backend/storeManagers/steam/bridge/importParse.ts
  - src/backend/storeManagers/steam/bridge/importScan.ts
  - src/backend/storeManagers/steam/bridge/interfaceVersions.ts
  - src/backend/storeManagers/steam/bridge/launchTarget.ts
  - src/backend/storeManagers/steam/bridge/protocol.ts
  - src/backend/storeManagers/steam/bridge/shimCoverage.ts
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/electronStores.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/installFormIpc.ts
  - src/backend/storeManagers/steam/library.ts
  - src/common/types/ipc.ts
  - src/common/types/steam.ts
  - src/frontend/App.tsx
  - src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
  - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
  - src/frontend/screens/Game/GamePage/components/SteamBridgeRouteNotice.tsx
  - src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.tsx
  - src/frontend/screens/Game/GamePage/components/__tests__/bridgeRouteDisplay.test.ts
  - src/frontend/screens/Game/GamePage/components/bridgeRouteDisplay.ts
  - src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx
  - src/frontend/screens/Library/components/InstallModal/__tests__/steamBridgeRouteLine.test.ts
  - src/frontend/screens/Library/components/InstallModal/steamBridgeRouteLine.ts
  - src/frontend/state/BottleLaunchWaiting.ts
  - src/frontend/state/GlobalState.tsx
  - src/frontend/state/SteamBridgeRouteNotice.ts
  - src/frontend/state/SteamBridgeSetup.ts
  - src/frontend/state/__tests__/BottleLaunchWaiting.test.ts
  - src/frontend/state/__tests__/SteamBridgeRouteNotice.test.ts
  - src/frontend/state/__tests__/SteamBridgeSetup.test.ts
  - src/preload/__tests__/steamInstallFormApi.test.ts
  - src/preload/api/steam.ts
findings:
  critical: 4
  warning: 11
  info: 5
  total: 20
status: issues_found
---

# Phase 51: Code Review Report

**Reviewed:** 2026-10-22T09:49:40Z
**Depth:** standard
**Files Reviewed:** 110
**Status:** issues_found

## Summary

I reviewed the phase-51 diff (`324e60687^..HEAD`) at standard depth. Most of the time went on the
routing and verdict family (`games.ts`, `bridge/bridgeRoute.ts`, `bridge/bridgeVerdict.ts`,
`bridge/shimCoverage.ts`, `bridge/shimGenerate.ts`, `bridge/interfaceVersions.ts`,
`bridge/helperProcess.ts`, `bridge/bridgeConfig.ts`), the generated shim and its generator
(`meta/gen_vtables.ts`, `native/steam-bridge/generated/steam_api_shim.c`), and the native helper
(`native/steam-bridge/helper/bridge_helper.c`). I only checked the test files, the manifest JSON and
the locale JSON for obvious defects.

The structure of the routing brain is sound. The defects sit where two independently maintained
sources must agree but are never cross-checked:

- the coverage model's notion of "served" versus what the generated shim actually returns;
- the backend's interface-family spelling versus the shim's;
- the x86 export and served sets versus the x64 ones.

In each case the shim gets a verdict of "covered" or "stubbed" that it cannot honour, so a game is
routed to the bridge and then gets a NULL interface or a re-download loop.

The live gate already filed eight defects (see the caller's list), and none of them is repeated
below. CR-04 sits next to the filed prescreen-basename bug, but it is a separate defect in the exe
import scan and the prescreen overwrite.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: `isScanVerdictNowCovered` ignores arch, so a persisted miss auto-clears and loops a full re-download every session

**File:** `src/backend/storeManagers/steam/bridge/shimCoverage.ts:483-493` (also consumed at `bridge/bridgeRoute.ts:192-201` and `games.ts:2238`)
**Issue:** A stored miss entry counts as "covered" if it appears in **any** of the four sets: the x86
exports, the x64 exports, the x86 served versions or the x64 served versions. `scan.arch` is never
consulted. The sets are deliberately disjoint by arch:

- `SteamInternal_CreateInterface`, `SteamAPI_GetHSteamUser` and `SteamAPI_GetHSteamPipe` are x64-only exports.
- `SteamUser019`, `SteamFriends015`, `SteamUtils008`, `STEAMAPPS_INTERFACE_VERSION008` and `SteamClient017` are x64-only served versions.
- `SteamUser023` and `SteamAPI_SteamUser_v023` are x86-only.

An x86 title built against SDK 1.37–1.41 imports `SteamInternal_CreateInterface`, `SteamAPI_GetHSteamUser`
and `SteamAPI_GetHSteamPipe` from `steam_api.dll`. A runtime-lookup x86 title requires
`SteamUser019` and similar versions. Both produce a genuine x86 miss.

That miss is then judged "now covered" immediately, so two things happen:

1. `clearStaleBridgeVerdict()` deletes it at the top of every `install()` and `launch()`.
2. `resolveBridgeRoute` row 5 skips it even before deletion.

The title routes back to `pending-scan` → `installBridgeGame` and downloads the full game into a
per-game bridge bottle. The shim misses again with the identical missing list, the bottle is
deleted (`games.ts:1583`), and the steamBridgeSetupRequired fallback dialog opens. The
`failedThisSession` set only breaks this loop until the next app start, so every session repeats
it: a multi-GB download followed by a delete, with the scan-miss notice
(`noticeAcknowledgedFor`) never reachable.
**Fix:** Check membership against the scanned arch only.
```ts
export function isScanVerdictNowCovered(scan: {
  arch: 'x86' | 'x64'
  missingSymbols: string[]
}): boolean {
  const exported = scan.arch === 'x86' ? SHIM_EXPORTED_SYMBOLS : SHIM64_EXPORTED_SYMBOLS
  const served = scan.arch === 'x86' ? SHIM_SERVED_INTERFACE_VERSIONS : SHIM64_SERVED_INTERFACE_VERSIONS
  return scan.missingSymbols.every((e) => exported.has(e) || served.has(e))
}
```
Add a regression test: an x86 miss of `['SteamInternal_CreateInterface']` must stay uncovered.

### CR-02: Matchmaking bare accessors always return NULL because family casing differs between backend and shim

**File:** `src/backend/storeManagers/steam/bridge/interfaceVersions.ts:83-84`, `meta/sdk/isteammatchmaking009.manifest.json`, `meta/sdk/isteammatchmakingservers002.manifest.json`, `meta/gen_vtables.ts:522-525`, `native/steam-bridge/generated/steam_api_shim.c:7381-7382,7408,7450-7455`
**Issue:** The backend and the shim spell the matchmaking family differently, so the lookup can never match:

1. **Backend.** `BARE_ACCESSOR_FAMILY` maps the import `SteamMatchmaking` to family `SteamMatchMaking`
   (capital M). `writeBridgeConfig` therefore writes `iface.SteamMatchMaking=SteamMatchMaking009`.
2. **Shim table.** The manifests declare `"family": "SteamMatchmaking"` and
   `"family": "SteamMatchmakingServers"` (lowercase m). The generated `g_iface_table` rows are
   therefore `{ "SteamMatchMaking009", "SteamMatchmaking", ... }`.
3. **Bare accessor.** The exported bare accessor calls `resolve_bare_iface("SteamMatchmaking")`,
   which `strcmp`s, case-sensitively, against the cfg family `SteamMatchMaking`. That never matches,
   so it returns `NULL`.

`BARE_ACCESSOR_FAMILY_OVERRIDES` in the generator expects the manifest family to be `SteamMatchMaking`, so
the generator, the manifests and the backend all disagree.

The coverage check treats `SteamMatchMaking009` as served (stub), so the title is routed to the bridge
and launched. Its first `SteamMatchmaking()->...` call then dereferences NULL and crashes the game.
**Fix:** Pick one spelling end to end. The simplest fix is to set the manifest `family` to
`SteamMatchMaking` / `SteamMatchMakingServers`, which is what the overrides table and
`SHIM_SERVED_INTERFACE_VERSIONS` already assume. Then regenerate, and add a pin test asserting that every
`BARE_ACCESSOR_FAMILY` value equals some manifest `family` string exactly.

### CR-03: On x64, coverage reports an unserved bare-accessor version as "stubbed", but the shim returns NULL for it

**File:** `src/backend/storeManagers/steam/bridge/shimCoverage.ts:420-433`, `meta/gen_vtables.ts:2146-2170` (generated `resolve_bare_iface`)
**Issue:** `evaluateShimCoverageWith` moves an unserved x64 required version into `stubbedInterfaces`
(it is never added to `missingSymbols`), on the premise that the null-object fallback answers it.
That fallback is only wired into `SteamInternal_CreateInterface` and the `ISteamClient::GetISteamXxx`
stubs. The bare accessors (`SteamUser()`, `SteamApps()` and so on, which are exported on x64)
go through `resolve_bare_iface`, and that function returns `NULL` when the cfg version is not in
`g_iface_table`.

Example: an x64 game that imports bare `SteamUser` and needs `SteamUser020`. The scan comes back
clean with a stub notice, so the game is placed and launched. `SteamUser()` then returns NULL and the
game crashes.
**Fix:** Do one of the following:

- On `__x86_64__`, have `resolve_bare_iface` fall back to `&g_x64_null_object_instance` (after
  addressing WR-03).
- Restrict the null-object branch in `evaluateShimCoverageWith` to games for which
  `usesRuntimeInterfaceLookup(symbols)` is true, and keep bare-accessor misses in `missingSymbols`.

### CR-04: Exe-only import scan sends runtime-loaded `steam_api` titles to the bridge with no shim or helper, and erases the prescreen evidence

**File:** `src/backend/storeManagers/steam/games.ts:1624-1626`, `games.ts:2651-2656`, `src/backend/storeManagers/steam/bridge/shimGenerate.ts:291-310`, `bridge/bridgeRoute.ts:225-227`
**Issue:** `placeShimForGame` decides `no-steam-api` from the **launch exe's** import table alone.
Many engines never import `steam_api*.dll` from the exe:

- Unity loads it from `Plugins/` via P/Invoke.
- Source loads it from engine/client DLLs.
- GameMaker and others load it via extension DLLs or `LoadLibrary`.

Phase 51 widens routing so that every bottle-eligible non-seed title defaults to `pending-scan` →
bridge, so all of these engines now take the bridge path. The sequence for each such title is:

1. **Install.** It installs into the bridge bottle and gets status `no-steam-api`.
2. **Evidence overwritten.** `installBridgeGame` then calls `setBridgeSteamApiPrescreen(appId, 'none')`.
   This overwrites a prescreen that, once the filed basename bug is fixed, will have recorded
   `x86`/`x64`/`both`, meaning the depot really does ship a `steam_api*.dll`.
3. **Routing is locked in.** Row 9 now routes the title to the bridge permanently, as
   `no-steam-api`.
4. **Launch.** `launchBridgeGame` skips the helper and `writeBridgeConfig`. The game loads its own
   original `steam_api.dll` inside a bottle with no Steam client. `SteamAPI_RestartAppIfNecessary`
   or `SteamAPI_Init` fails, and many titles quit immediately.

The bottled-Steam fallback is never offered, because nothing marks this as a failure.
**Fix:**

- When the exe imports nothing but the prescreen, or a walk of the install dir, finds a
  `steam_api*.dll`, record a distinct verdict, for example `steamApi: 'dynamic'`, and route it to the
  bottle (or scan the DLL's importers), instead of `no-steam-api`.
- At minimum, never downgrade a non-`none`/`unknown` prescreen value to `'none'` on line 1625.

## Warnings

### WR-01: Auto-clearing a scan deletes the only copy of `interfaceVersions` for an already-shimmed title, leaving it stuck as a miss

**File:** `src/backend/storeManagers/steam/bridge/bridgeVerdict.ts:146-157`, `games.ts:2238-2249`, `bridge/shimGenerate.ts:367-371`
**Issue:** The `shimGenerate.ts` header says that for a target that already carries an older GameLib
shim, `persistedInterfaceVersions` is "the ONLY source left". It feeds only from the persisted scan.

1. **Upgrade misses.** After a shim upgrade, an installed bridge game misses at launch. The miss
   verdict stores `interfaceVersions`.
2. **Scan cleared.** Once a later release covers that miss, `clearBridgeScanVerdict` removes the
   whole `scan`, including `interfaceVersions`.
3. **Next launch.** `placeShimForGame` finds the old shim, with `persistedInterfaceVersions`
   undefined and `dllVersions = []`. Every bare-accessor family becomes `<family>@unknown-version`,
   which can never be covered.

The title is now a permanent scan-miss, and only an uninstall and reinstall fixes it.
**Fix:**

- Keep `interfaceVersions` when clearing: store it outside `scan`, or clear only
  `status`/`missingSymbols`.
- Have `launchBridgeGame` read the pool from that retained field.

### WR-02: Helper runs `SteamAPI_InitFlat` before entering its accept loop, so HEALTH is not answerable "immediately at process start"

**File:** `native/steam-bridge/helper/bridge_helper.c:~636-660`, `src/backend/storeManagers/steam/bridge/helperProcess.ts:26-27,76-79,459-484`
**Issue:** `main()` logs `LISTEN`, then synchronously runs `load_steam_api()` and
`init_steam_api_once()`, and only after that enters `accept()`. Meanwhile the backend sees the
port and starts probing: 6 attempts, each a 250 ms sleep plus a 250 ms timeout. A probe connect
completes into the listen backlog, but nobody reads it until init returns.

If `dlopen` plus `InitFlat` takes longer than about 3 s, the helper is reported `unreachable` and the
launch fails with a bridge-setup dialog. That can happen on a cold Steam IPC, or when Steam is
mid-update. The module doc in `helperProcess.ts` claims HEALTH is answerable before init completes,
which the code contradicts. The risk is higher now than before phase 51, because the helper is
spawned per launch rather than being long-lived.
**Fix:** Run init on a separate thread, or serve accepts while init proceeds (g_inited already gates
WHOAMI). Alternatively, emit `LISTEN` only after init, and size the port wait budget to cover it.

### WR-03: The x64 null object returns 0 for struct-return (sret) slots, which crashes the caller

**File:** `meta/gen_vtables.ts:837-845,1478-1488` (generated `steam_api_shim.c:338`)
**Issue:** MSVC x64 returns user-defined types from member functions through a hidden pointer
(RDX) and expects RAX to hold that pointer. The generator already models this for i386
(`returnKind === 'class'`), and Proton's `GetSteamID` handling confirms the same rule on Win64.

`vt_x64_null_object` returns `0` in RAX for every slot. Any sret method on an unserved interface,
such as `ISteamController::GetDigitalActionData` or `GetAnalogActionData` (both in ELEX's unmanifested
`SteamController` set), makes the caller read through address 0. The comment's guarantee of
"never a crash" is false.
**Fix:** No single function can be correct for both sret and scalar slots. Either:

- Generate per-family null objects from the Proton inventory, with sret slots returning their
  second argument after zero-filling it; or
- Stop counting x64 unserved families as stubbed when their known method set contains sret slots.

At minimum, correct the doc comment and add the risk to the D-51-02 notice.

### WR-04: The shim's single socket and request id are shared across game threads without a lock

**File:** `meta/gen_vtables.ts:1270-1474` (generated `bridge_ensure_connected` / `bridge_transact_once`)
**Issue:** `g_bridge_sock`, `g_next_request_id` and the send/recv sequence are unsynchronized.
Games commonly call Steam interfaces from several threads, for example stats or overlay calls
alongside `RunCallbacks` on the main thread. Two concurrent transacts interleave frames on one
stream, and a request-id mismatch triggers `closesocket` under the other thread's feet. This was
present before phase 51, but this phase multiplies the served surface (UserStats, Apps, Utils,
RemoteStorage), which makes cross-thread calls far likelier.
**Fix:** Wrap `bridge_transact` (and the lazy connect/port load) in a `CRITICAL_SECTION`, initialized
once via `InitOnceExecuteOnce`.

### WR-05: The process monitor's give-up and never-matched paths never call `onStopped`, so the helper leaks until quit

**File:** `src/backend/storeManagers/steam/bottleProcessMonitor.ts:250-264` (and the open-ended no-match loop)
**Issue:** `onStopped`, which wires up `stopBridgeHelper`, fires only on the
"matched process(es) gone" branch.

- When `ps` fails `MAX_CONSECUTIVE_SPAWN_FAILURES` times, `clearEntry` runs and the function
  returns without calling it.
- A bridge game that crashes before its first match keeps the monitor polling forever and never
  reaches it either.

In both cases the per-appId helper, an authenticated Steam session, outlives the game. This is
separate from the filed "monitor starts after the wine child exits" defect, and it survives that fix.
**Fix:** Call `entry.onStopped` (guarded, once) on every terminal path other than supersede-cancel.
For `kind: 'bridge'`, add a bounded no-match deadline that also fires it.

### WR-06: Helper child handles are not `unref()`'d, which breaks the sidecar exit contract

**File:** `src/backend/storeManagers/steam/bridge/helperProcess.ts:245-255,295-324`
**Issue:** The CLAUDE.md sidecar convention says to `unref()` every child handle so the sidecar can
drain at stdin EOF. The per-appId helper `ChildProcess` and its piped `stdout`/`stderr` are never
unref'd. Combined with WR-05 and the filed monitor bug, a leaked helper keeps the sidecar's event
loop alive past stdin EOF. The Rust shell then SIGKILLs the sidecar, and because the helper is not
detached it is orphaned, holding a signed-in Steam API session.
**Fix:** After spawning, call `child.unref()`, `child.stdout?.unref?.()` and `child.stderr?.unref?.()`.
Ensure a stdin-EOF path reaches `shutdownAllBridgeHelpers()`. Note that `shutdownLongLivedChildren`
only runs on the explicit quit path.

### WR-07: A Win64 "shim-not-built" at install time is not persisted, so the title re-downloads every session

**File:** `src/backend/storeManagers/steam/games.ts:1567-1609`
**Issue:** On `shim-not-built` with arch `x64`, the code deletes the bridge bottle and marks the
failure for this session only. It writes no scan verdict and no `steamApi: 'x64'`.

The prescreen has already stored a non-undefined value (`'unknown'`, `'both'`, or `'none'` under
the filed basename bug), so it will never run again. Row 6 (`isX64`) therefore never fires on the
next launch of the app, and the title returns to `pending-scan` → full bridge download → delete,
once per session. This happens whenever `steam_api64.dll` is absent from the bundle, for example in
a dev build or a packaging regression.
**Fix:** In the `isWin64NoShim` branch, call `setBridgeSteamApiPrescreen(this.appId, 'x64')`, or persist
a scan with `arch: 'x64'`, so that row 6 short-circuits the next install.

### WR-08: Widened `pending-scan` routing ignores an existing GameLibSteam location on install/resume

**File:** `src/backend/storeManagers/steam/games.ts:1071-1084,1146-1194`
**Issue:** `launch()` and `uninstall()` were correctly switched to location-based routing
(`findBridgeInstallBottle`). `install()` was not. `install()` still routes purely on eligibility,
which now defaults every non-seed bottle-eligible title to the bridge.

Consider a title with an interrupted pre-upgrade `installBottleNative` download in `GameLibSteam`,
flagged `steamResumePending`:

1. The resume pass runs against the bottle copy.
2. Execution then falls through to `installBridgeGame`, which starts a fresh download into a new
   per-game bridge bottle.
3. The partial bits in `GameLibSteam` are orphaned, and two copies now exist.

**Fix:** Before computing `bridgeRoute`, check whether a bottle ACF or install path already exists for
this appId, as `getBridgeRouteVerdict` does with `installedIn`. If it does, keep the bottled path.

### WR-09: `findBridgeInstallBottle` and `resolveBridgeBottleName` can disagree, sending launch/uninstall to an empty bottle

**File:** `src/backend/storeManagers/steam/bottle.ts:1170-1192,1219-1246`, `games.ts:2397,2558`, `library.ts:2189-2190`
**Issue:** The trigger is a per-game bottle that is provisioned but holds no manifest, while the
legacy shared bottle holds this appId. That state is left behind by a bridge reinstall whose
download failed after inline provisioning.

- **Decision step.** `findBridgeInstallBottle` returns the legacy bottle.
- **Execution step.** `launchBridgeGame`, `resolveBridgeLaunchExe`, `uninstallBridgeGame` and
  `removeSteamInstallCopy` all re-resolve through `resolveBridgeBottleName`, which picks the
  per-game bottle because it is ready.

The result is that launch fails the existence gate and marks the game bridge-failed. Uninstall
targets the wrong bottle, and `removeSteamInstallCopy` deletes the per-game bottle while leaving the
legacy copy behind.
**Fix:** Pass the bottle name returned by `findBridgeInstallBottle` through to `launchBridgeGame` and
`uninstallBridgeGame`, or make `resolveBridgeBottleName` step 1 also require the manifest.

### WR-10: LISTEN-line parsing splits each stderr chunk independently, so a split line loses the port

**File:** `src/backend/storeManagers/steam/bridge/helperProcess.ts:301-307`
**Issue:** `data.toString().split('\n')` is run per chunk, with no carry-over between chunks. If the
helper's `[ts] LISTEN 127.0.0.1:NNNNN appid=...` line arrives split across two `data` events, the
regex never matches. `portReady` then never settles and the launch reports `unreachable`. stderr is
unbuffered on the C side, but the pipe gives no guarantee about chunking.
**Fix:** Keep a per-child `pending` string: append each chunk, split, and keep the last
(unterminated) segment for the next event.

### WR-11: Route-override writes are fire-and-forget, ignore `{ ok: false }`, and persist before the user confirms

**File:** `src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx:231-252`, `src/frontend/screens/Game/GamePage/components/SteamBridgeRouteNotice.tsx:96-101`
**Issue:** The two components share related problems:

- **Persisted before confirmation.** The install dialog's "Use the Windows Steam client instead"
  toggle writes `userRoute` to the persisted store immediately. Cancelling the dialog leaves the
  game permanently forced to the bottle.
- **Clobbers an existing override.** The toggle also maps "off" to `null`, which silently deletes a
  prior `'bridge'` override.
- **Failures ignored.** `handleSetSteamBridgeUserRoute` reports failures as a resolved
  `{ ok: false }`, never a rejection. Both call sites ignore the result: the notice proceeds to
  `installSteamGame` even when the route or acknowledgement was not recorded, which leads straight
  back to the same notice.

**Fix:** Do the following:

- Hold the toggle state locally and send it with the Install action.
- Check `result.ok` and surface the error instead of installing.
- When unchecking, restore the previous `userRoute` rather than writing `null`.

## Info

### IN-01: `shimExportSetVersion` is stamped onto every verdict but never read

**File:** `src/backend/storeManagers/steam/bridge/shimCoverage.ts:323-360`, `electronStores.ts` (`SteamBridgeScanVerdict` docs)
**Issue:** The docs say the stamp is "exactly the signal `isScanVerdictNowCovered` uses". It does
not: that function only does set membership. This is dead persisted data with a misleading
contract.
**Fix:** Either short-circuit on `scan.shimExportSetVersion === SHIM_EXPORT_SET_VERSION`, meaning
nothing changed so the miss is still not covered, or drop the claim from the docs.

### IN-02: `steamBridgeSetupRequired` is emitted twice for one helper failure

**File:** `src/backend/storeManagers/steam/bridge/helperProcess.ts:543-546,572-575,618-621`, `games.ts:~2660-2670`
**Issue:** `ensureBridgeHelperReady` sends the message itself, then `launchBridgeGame` sends it again
with `fallbackAvailable`. The doc's "exactly one steamBridgeSetupRequired" claim does not hold. It
is harmless today only because the second message overwrites the first in the store.
**Fix:** Emit from one layer only.

### IN-03: `writeBridgeConfig` does not validate `iface` family/version characters

**File:** `src/backend/storeManagers/steam/bridge/bridgeConfig.ts:146-151`
**Issue:** `interfaceVersions` can come from the persisted store, which `bridgeVerdict.ts` itself
calls untrusted, and the Zod schema there is `record(string, string)`. A value containing `\n` can
inject a `port=` line into `gamelib_bridge.cfg`, and the shim parser takes the last valid `port=`.
**Fix:** Reject keys and values that do not match `/^[A-Za-z0-9_]{1,63}$/`, both in `writeBridgeConfig`
and in `bridgeScanVerdictSchema`.

### IN-04: Shim `bridge_transact_once` leaves the response body unread on `retLen > retBufCap` and on underflow

**File:** `meta/gen_vtables.ts:~1440-1446`
**Issue:** `respLen - 5` underflows when `respLen < 5`. An oversize body is never drained, so the
stream desyncs, and recovery relies only on the next call's request-id mismatch forcing a reconnect.
**Fix:** Reject `respLen < 5` as a transport failure, and drain or close the socket when the body
exceeds the buffer.

### IN-05: `meta/bridgeCensus.ts` classifies differently from the live path

**File:** `meta/bridgeCensus.ts` (`classifyCensusTitle`, `chooseExe`)
**Issue:** The census and the live path disagree in three places:

| Aspect | Census | Live path |
| --- | --- | --- |
| Executable scanned | First exe found that imports `steam_api` | PICS launch exe |
| Version problems | Classified before coverage | Folded into `missingSymbols` |
| Exe with no `steam_api` import | `bridge` | Hits CR-04 |

So the census "routed" count overstates real bridge coverage.
**Fix:** Reuse the live launch-exe resolution where possible, and label `no-steam-api` rows
separately from genuine `bridge` rows.

---

_Reviewed: 2026-10-22T09:49:40Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
