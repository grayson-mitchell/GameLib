---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
reviewed: 2026-10-24T02:53:42Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - meta/gen_vtables.ts
  - meta/buildSteamBridgeShims.ts
  - native/steam-bridge/helper/bridge_helper.c
  - native/steam-bridge/steamclient/steamclient_fwd.c
  - src/backend/constants/paths.ts
  - src/backend/storeManagers/steam/bridge/bridgeVerdict.ts
  - src/backend/storeManagers/steam/bridge/importParse.ts
  - src/backend/storeManagers/steam/bridge/importScan.ts
  - src/backend/storeManagers/steam/bridge/peSections.ts
  - src/backend/storeManagers/steam/bridge/protocol.ts
  - src/backend/storeManagers/steam/bridge/shimCoverage.ts
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
  - src/backend/storeManagers/steam/bridge/steamClientSetup.ts
  - src/backend/storeManagers/steam/electronStores.ts
  - src/backend/storeManagers/steam/games.ts
findings:
  critical: 1
  warning: 8
  info: 4
  total: 13
status: issues_found
---

# Phase 52: Code Review Report

**Reviewed:** 2026-10-24T02:53:42Z
**Depth:** standard (diff `7ed535984..HEAD`, plus spot-checks of the generated `steam_api_shim.c` / `bridge_dispatch.h`)
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Phase 52 adds four things: a CONTROL slot 3 (`CREATE_INTERFACE`) in the helper, the shim export `GameLibBridge_CreateInterface`, an x64 `steamclient64.dll` forwarder plus its HKCU registration, and SteamStub `.bind` detection that drives forwarder setup at launch. It also moves `SteamClient017`/`SteamClient014` from `stub` to `wire`, and adds a bounded static-import closure to the import scan.

The native frame handling is sound. The helper's slot-3 handler checks `len` against both 4096 and `argLen` before it copies anything. The forwarder's `MAX_PATH` concatenation has bounds. The PE section parser checks every read against the buffer length. The registry argv cannot be injected into (it is an argv array, the path is drive-anchored, and quotes, CR, LF and NUL are rejected).

The main defect is outside the SteamStub path. The `stub` to `wire` flip applies to every x64 bridge title. It removes the x64 null-object fallback from every `ISteamClient::GetISteamXxx` lookup, so lookups that used to return a safe object now return NULL. Other problems:
- The forwarder setup uses `wait: true`, which adds a blocking `wineserver --wait`.
- A wine run that never happens is accepted as a successful `reg add`.
- The `x64` arch default and the stale `drmWrapper` fallback can both lead to a "placed" result, which suppresses the user notice, for titles where forwarding cannot work.

The known withhold-guard gap (placeShimForGame's `withheld` result has no `drmWrapper`) is not re-reported here. Two of the warnings below (WR-03, WR-04) are other ways that the notice the phase promises ends up false or missing.

## Critical Issues

### CR-01: Flipping SteamClient017/014 to `wire` removes the x64 null-object fallback for every x64 title, not just SteamStub ones

**File:** `src/backend/storeManagers/steam/bridge/shimCoverage.ts:300-301`, `meta/gen_vtables.ts:1039-1065` (`emitSteamClientForwardedLookup`), `meta/gen_vtables.ts:1102-1107`
**Issue:** Before this phase, every x64 `vt_SteamClient017_GetISteamXxx` returned `resolve_iface_by_exact_version(v)` and fell back to `&g_x64_null_object_instance` when that missed. You can see this in the base `steam_api_shim.c`, for example `vt_SteamClient017_GetISteamMatchmaking`. Now that the manifest is `wire`, the generator emits `emitSteamClientForwardedLookup`, which returns NULL in three cases:
1. The helper transport fails. This now includes the helper running with `g_inited == 0`.
2. The native client answers NULL. This includes `GetISteamUserStats` / `GetISteamRemoteStorage` in identity-only mode, which the new T-52-03 gate at `gen_vtables.ts:2026` refuses on purpose.
3. Native says the interface is present but the shim does not serve that exact version. `resolve_iface_by_exact_version` only knows the shim's own table, so this covers Matchmaking, Networking, HTTP, UGC, Screenshots, Controller, Inventory and the rest.

Older-SDK titles that build a `CSteamAPIContext` through `SteamClient()->GetISteamXxx(...)` treat any NULL as a failed init. Titles that skip the NULL check dereference it and crash. ELEX (411300), the title that justified the SteamClient017 manifest in 51-15, was measured working on the null-object path. That path is now gone for it and for every other x64 title, whether or not it has SteamStub.

Two related points:
- The forwarded lookup also passes the game's `hSteamUser`/`hSteamPipe` through to the native client. The shim hands those handles out as hard-coded `1`/`1` (`SteamAPI_GetHSteamUser`/`GetHSteamPipe`). Whether the native answer is "present" therefore depends on the helper's real handles also being 1, which nothing guarantees.
- The "never fabricate" rule (T-52-02) was written for the SteamStub check. It has been applied to the whole population of x64 titles.

**Fix:** Keep the forwarded behaviour on the SteamStub entry point and restore the null-object fallback for ordinary lookups. For example, return the proxy (or null object) whenever the shim serves or stubs the version, and forward only when the call came through `GameLibBridge_CreateInterface`:
```c
// emitSteamClientForwardedLookup body
void *local = resolve_iface_by_exact_version(pchVersion);
if (!g_steamstub_path_active) {            // set by GameLibBridge_CreateInterface
#if defined(__x86_64__)
  return local ? local : (void *)&g_x64_null_object_instance;
#endif
}
/* SteamStub path: existing presence round-trip, NULL on refusal */
```
Alternatively, give the SteamStub path its own proxy instance that has forwarded lookups, and leave the `SteamClient017` instance that `SteamAPI_SteamClient_v017` / `SteamInternal_CreateInterface` return in `stub` mode. Either way, re-run the ELEX bridge-verified gate before this ships.

## Warnings

### WR-01: `wait: true` makes each `reg add` block on `wineserver --wait`, twice per SteamStub launch, with no bound

**File:** `src/backend/storeManagers/steam/bridge/steamClientSetup.ts:191-196`
**Issue:** For `wait: true`, `runWineCommand` spawns `wineserver --wait` once the child closes (`launcher.ts` close handler). The bridge runtime is CrossOver, and `resolveCrossoverWine` sets `wineserver`, so the wait really runs. `wineserver --wait` only returns when the bottle's wineserver exits. That means:
- every SteamStub launch pays the wineserver persistence timeout twice, because there are two separate `reg add` invocations;
- if any other process is alive in that bottle (a stuck previous instance, a launcher left behind, `explorer.exe` / `winedevice`), the launch hangs with no timeout. It happens before `fireBridgeWineLaunch`, so the Play button just spins.

No other call site under `steam/` uses `wait: true`.
**Fix:** Use `wait: false` and await the `reg.exe` child's own exit code, or run a single `reg import` of a generated `.reg` file. Wrap the whole operation in a timeout (for example `Promise.race` with 15 s) that maps to `{ status: 'error' }`.

### WR-02: A wine run that never happened is treated as a successful registry write

**File:** `src/backend/storeManagers/steam/bridge/steamClientSetup.ts:197`
**Issue:** `runWineCommand` returns `{ stdout: '', stderr: 'Invalid wine' }` with **no `code`** when `validWine` fails. `res.code !== undefined && res.code !== 0` is then false, so the loop counts the write as success. It returns `status: 'placed'` and logs `registered ... under HKCU ActiveProcess`, even though nothing was written. `games.ts` then logs `[bridge-steamstub] ... forwarder placed` and never shows the SteamStub notice. This is the same kind of false log line that the 52 UAT gaps already record.
**Fix:**
```ts
if (res.code !== 0) {   // undefined (never spawned) and null (signalled) are both failures
  return { status: 'error', error: `reg add ${valueName} failed (code=${String(res.code)}, stderr=${res.stderr.slice(0, 200)})` }
}
```

### WR-03: The `'x64'` arch default can mark an x86 SteamStub title as "placed" and suppress the honest notice

**File:** `src/backend/storeManagers/steam/games.ts:2969-2970`
**Issue:** `arch: shimResult.verdict?.arch ?? persistedScan?.arch ?? ('x64' as const)`. An `already-placed` result has no verdict. If no scan was persisted (legacy installs, or a verdict the store pruned), an x86 `.bind` title falls through to `'x64'`. Setup then writes `SteamClientDll64`, which an x86 SteamStub never reads, and returns `placed`. As a result the `x86-deferred` notice that decision 6 requires never fires. The user gets the silent few-seconds exit with no explanation.
**Fix:** Read the arch from the exe when the verdict does not carry it. `readPeMachineArch` is already imported in `shimGenerate.ts`. If the arch is still unknown, return `unavailable`/`setup-error` instead of guessing x64:
```ts
const arch = shimResult.verdict?.arch ?? persistedScan?.arch ?? readPeMachineArch(exePath)
if (arch !== 'x86' && arch !== 'x64') this.maybeNotifySteamStubUnforwarded('setup-error')
```

### WR-04: The persisted `drmWrapper` can never be cleared on the `already-placed` path

**File:** `src/backend/storeManagers/steam/games.ts:2842-2845`, `src/backend/storeManagers/steam/bridge/shimGenerate.ts:701`
**Issue:** `withDrmWrapper` re-reads the exe's section table on every launch. When it finds no `.bind`, it returns the result unchanged, with the key absent. `games.ts` then falls back with `?? persistedScan?.drmWrapper`. That `??` chain cannot tell "freshly checked: not SteamStub" apart from "not checked". If an update strips SteamStub from the exe but leaves the shim byte-identical (a common de-DRM patch), the result is `already-placed` and the stale persisted `steamstub` brings back forwarder setup and the registry write on every launch. The comment at line 2841 also says the flag is "NOT stamped on ... 'no-steam-api'", but `withDrmWrapper` does stamp the `no-steam-api` verdict (`shimGenerate.ts`, inside `withDrmWrapper`).
**Fix:** Have `withDrmWrapper` always report the fresh detection explicitly, for example `drmWrapper: 'steamstub' | 'none'`. In `games.ts`, use the persisted value only when the fresh field is truly absent (an error or a status that skips detection). Also fix the comment.

### WR-05: Global HKCU `ActiveProcess\SteamClientDll64` is never cleaned up and stays stale across titles in the shared bridge bottle

**File:** `src/backend/storeManagers/steam/bridge/steamClientSetup.ts:180-225`, `src/backend/storeManagers/steam/games.ts:2958-2986`
**Issue:** The value is written only when it is needed and never removed. `getBridgeBottleSettings` can resolve to the legacy **shared** bridge bottle. In that case, title A's registration (pointing into A's install directory) stays in force for every later launch of title B in the same bottle. This includes `withheld` launches where B's original `steam_api64.dll` is still in place and will read `ActiveProcess`. It also stays after A is uninstalled, so it points to a missing file. The same applies when setup later returns `unavailable`/`error` for A: the earlier registration still points at the earlier forwarder. The user then sees the "could not connect" notice while a forwarder is in fact still registered.
**Fix:** On every bridge launch that does not end in `placed`, delete the value (`reg delete <key> /v SteamClientDll64 /f`, treating "not found" as OK). Alternatively, scope the write to per-game bottles only and refuse in the shared bottle.

### WR-06: Forwarder overwrites a game-shipped `steamclient64.dll` with no backup

**File:** `src/backend/storeManagers/steam/bridge/steamClientSetup.ts:158-161`
**Issue:** If the target directory already contains a `steamclient64.dll` that is not byte-identical (some titles and bundled server components ship one), `copyFileSync` replaces it silently. Unlike the shim's handling of `steam_api64.dll`, no original is kept, so the change cannot be undone short of a depot verify. `copyFileSync` also follows a symlink at the destination, so the containment check, which is lexical `resolve`/`relative` only, does not stop a write through a symlinked path component or a symlink at `forwarderPath`.
**Fix:** If the existing file is not GameLib's forwarder, rename it to `steamclient64.dll.gamelib-orig` before copying, or refuse with `status: 'error'`. `lstat` the destination and refuse symlinks. Run `realpathSync` on `targetDir` before the containment check.

### WR-07: Forwarded `ISteamClient` lifecycle methods act on the helper's own native session with handles the game supplies

**File:** `meta/gen_vtables.ts:2003-2190` (`emitDispatchCase`, `isForwardedClient` branch); generated `bridge_dispatch.h` cases `SteamClient017.BReleaseSteamPipe` / `ReleaseUser` / `BShutdownIfAllPipesClosed` / `CreateSteamPipe` / `ConnectToGlobalUser`
**Issue:** With `wire` mode, the game's `BReleaseSteamPipe(h)`, `ReleaseUser(pipe, user)` and `BShutdownIfAllPipesClosed()` run against the helper's live native client with whatever handle values the game passes. The shim gives every game `hSteamPipe = 1` / `hSteamUser = 1` (`SteamAPI_GetHSteamPipe`/`GetHSteamUser`). A title that releases "its" global pipe at shutdown or on a reconnect can therefore release the **helper's** pipe or user. After that, every wire call for the rest of the session fails, and nothing notices. Pipes the game creates through `CreateSteamPipe` are also never tracked or reclaimed.
**Fix:** In the generator, keep a helper-side set of the pipe and user handles that forwarded `CreateSteamPipe`/`ConnectToGlobalUser`/`CreateLocalUser` returned. Refuse `BReleaseSteamPipe`/`ReleaseUser` for any handle outside that set, and answer `BShutdownIfAllPipesClosed` locally with `false`.

### WR-08: The identity-only app-scoped gate can be bypassed through `GetISteamGenericInterface` and CONTROL slot 3

**File:** `meta/gen_vtables.ts:1980-1984, 2026-2030`; `native/steam-bridge/helper/bridge_helper.c:486-518`
**Issue:** T-52-03 refuses `GetISteamUserStats`/`GetISteamRemoteStorage`/`GetISteamGameServerStats` in identity-only mode. But `GetISteamGenericInterface("STEAMUSERSTATS_INTERFACE_VERSION011")` and `GameLibBridge_CreateInterface` (CONTROL slot 3, which has no `g_bd_identity_only` check) still ask the native client and hand back the shim's UserStats proxy. Each family's own dispatch gate still blocks the actual method calls, so no data leaks today. However, the threat model claims that refusal "via ISteamClient too", and that claim is only partly true. There is also a second path to the native `SteamInternal_CreateInterface`, which accepts any version string the game chooses.
**Fix:** Apply the same version-prefix check (`STEAMUSERSTATS_`, `STEAMREMOTESTORAGE_`, `SteamGameServerStats`) to `GetISteamGenericInterface` and to the slot-3 handler when `g_bd_identity_only` is set.

## Info

### IN-01: `GameLibBridge_CreateInterface` uses a static request buffer and a static hello flag

**File:** `meta/gen_vtables.ts:761-783`
**Issue:** `static uint8_t s_req[4100]` and `static int s_hello_sent` add shared mutable state for no benefit: a 4100-byte stack buffer is fine on x64. If SteamStub's check thread and a game thread call in at the same moment, the request bytes can be corrupted. The transport has no lock either, which predates this phase, but this change adds a new race window ahead of it.
**Fix:** Use a stack buffer. If a hello flag is still needed, share it with `SteamAPI_Init`'s handshake.

### IN-02: Duplicate sanitizer and containment helpers

**File:** `native/steam-bridge/helper/bridge_helper.c:425-432` vs `meta/gen_vtables.ts` (`bd_fwd_sanitize` emitted into `bridge_dispatch.h`); `importScan.ts:74` vs `steamClientSetup.ts:37`
**Issue:** `sanitize_ver` re-implements `bd_fwd_sanitize`, which is already in scope in the helper through the included header. `isContainedWithin` is copied a second time. Copies like these drift apart.
**Fix:** Call `bd_fwd_sanitize` from the slot-3 handler. Move `isContainedWithin` into one shared module.

### IN-03: The import closure misses delay imports and is case-sensitive on case-sensitive volumes

**File:** `src/backend/storeManagers/steam/bridge/importScan.ts:100, 110-117`
**Issue:** Closure DLLs are read with `objdump --private-headers` only. A followed DLL that delay-imports `steam_api` (the Manor Lords pattern, one level down) is therefore missed. `existsSync(join(dir, name))` uses the PE's stored spelling (often `ENGINE.DLL`), so on a case-sensitive APFS or external volume the closure silently finds nothing.
**Fix:** Also run `readDelayImports` on each followed DLL. Resolve names case-insensitively with a single `readdirSync(dir)` map.

### IN-04: The forwarder takes a new LoadLibrary reference on every failed resolve

**File:** `native/steam-bridge/steamclient/steamclient_fwd.c:35-43`
**Issue:** `g_fn` is cached only on success. If the loaded `steam_api64.dll` is not the shim (the export is missing), every `CreateInterface` call repeats `GetModuleHandleW`. If that misses, it calls `LoadLibraryW`, which bumps the refcount each time. This is harmless but unbounded, and it hides the "wrong steam_api loaded" condition with no trace.
**Fix:** Cache a "resolution attempted" flag alongside `g_fn`. Optionally `OutputDebugStringA` once when the shim export is missing.

---

_Reviewed: 2026-10-24T02:53:42Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
