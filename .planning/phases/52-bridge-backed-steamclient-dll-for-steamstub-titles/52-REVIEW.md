---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
reviewed: 2026-10-24T04:49:08Z
depth: standard
files_reviewed: 38
files_reviewed_list:
  - meta/__tests__/buildSteamBridgeShims.test.ts
  - meta/__tests__/gen_vtables.test.ts
  - meta/buildSteamBridgeShims.ts
  - meta/gen_vtables.ts
  - meta/sdk/acceptance-interface-versions.json
  - meta/sdk/isteamclient014.manifest.json
  - meta/sdk/isteamclient017.manifest.json
  - meta/sdk/isteamnetworking006.manifest.json
  - meta/sdk/isteamremotestorage016.manifest.json
  - meta/sdk/isteamuser.manifest.json
  - meta/sdk/ordinals.json
  - meta/sdk/wire-policy.json
  - native/steam-bridge/generated/bridge_dispatch.h
  - native/steam-bridge/generated/steam_api64.def
  - native/steam-bridge/generated/steam_api_shim.c
  - native/steam-bridge/helper/bridge_helper.c
  - native/steam-bridge/steamclient/steamclient_fwd.c
  - src/backend/constants/paths.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/bridgeVerdict.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/fixtures/objdumpImports.ts
  - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/importScan.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/peSections.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/steamClientSetup.test.ts
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
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 52: Code Review Report (re-review after gap closure 52-13..52-18)

**Reviewed:** 2026-10-24T04:49:08Z
**Depth:** standard. The gap-closure diff `21d2ab34b..HEAD` was read in full. The 38 scoped files were read in context. `steam_api_shim.c` was spot-checked only: the CR-01 gating, the new x64 exports and the iface table.
**Files Reviewed:** 38
**Status:** issues_found

## Summary

The gap-closure plans fixed the critical finding and the four warnings that were not deferred, and they fixed them correctly:

- **CR-01:** the forwarded `GetISteam*` lookups are now gated on `g_bridge_steamstub_path_active`. Ordinary x64 titles get the proxy or the null object again.
- **WR-01 / WR-02:** the `reg add` is bounded, and exit code 0 is the only thing accepted as success.
- **WR-03:** no title is guessed to be x64.
- **WR-04:** a fresh `drmWrapper` now overrides the persisted one.

The prior "withheld result carries no `drmWrapper`" gap is also closed. No new critical defect was found.

Three new warnings:

1. **CR-01 is fixed only for lookups.** The eight non-lookup `ISteamClient` methods are still forwarded to the helper's live native client for **every** x64 title. Before the phase they were local stubs. The deferred WR-07 risk therefore applies to all x64 titles, not only SteamStub ones (WR-09).
2. **The Grim Dawn re-gate evidence shows the SteamStub check rejecting before it calls any method on the returned interface** (WR-10). In the trace, the stub calls `CreateInterface` twice, looks up a `Steam_*` export, which fails, calls `GetModuleFileNameW` on the forwarder module, and then shows a `MessageBox`. None of the forwarded `ISteamClient` plumbing is reached. Whatever decides "Load Error 3" is a local input. The candidates GameLib controls are the forwarder's single-export surface (`CreateInterface` only) and the unwritten ActiveProcess `pid`.
3. **The single-exe withhold path can still claim "launching with the game's own steam_api" when no `steam_api64.dll` exists at all** (WR-11).

**ELEX Friends sign-out:** no code in scope explains it. ELEX's helper log has no FWD lines, so none of the phase-52 forwarding code (lookups or lifecycle methods) ran for 411300. The two account-session events in that run both come from code that predates this phase and is outside this review's scope:
- the steam-user `client.logOn({ refreshToken })` on Play (`src/backend/storeManagers/steam/user.ts:663`, outside this review's file list);
- the helper's `SteamAPI_Init` against the Mac client.

Neither is shown to cause the sign-out, so no finding is raised.

## Status of prior findings (52-REVIEW at `21d2ab34b`)

| ID | Prior title (short) | Status now | Evidence |
| --- | --- | --- | --- |
| CR-01 | `wire` flip removed the x64 null-object fallback for every x64 title | **Fixed, for lookups** (52-14: `ff4a777cf`, `2221c018b`, `1937a36c3`) | `gen_vtables.ts:1064-1069` emits `if (!g_bridge_steamstub_path_active) { local ?: &g_x64_null_object_instance }` ahead of `bridge_transact`. The flag is declared under `__x86_64__` (generated `steam_api_shim.c:606`) and set only in `GameLibBridge_CreateInterface` after the NULL check (`steam_api_shim.c:9545`). Every 017/014 `GetISteam*` is gated (`steam_api_shim.c:5432` ff., `8064` ff.). Live: ELEX 52-UAT item 12 shows no `[bridge-steamstub]` and no FWD. Residual: the non-lookup methods are not gated, see **WR-09**. |
| WR-01 | `wait: true` blocks on `wineserver --wait`, unbounded | **Fixed** (52-16 `098314e3e`) | `steamClientSetup.ts:194-242`: `wait: false`, `Promise.race` against an unref'd 15 s timer, cleared in `finally`. The orphaned reg child after a timeout is deferred (deferred-items #9). |
| WR-02 | A wine run that never happened counted as success | **Fixed** (52-16 `098314e3e`) | `steamClientSetup.ts:221` `res.code !== 0` (covers `undefined` and `null`). Tested. |
| WR-03 | `'x64'` arch default suppresses the x86 notice | **Fixed** (52-16 `dccb9f6a1`) | `games.ts:2987-3004`: `exeArch ?? verdict.arch ?? persisted.arch`, no literal default; unknown arch maps to `error`, which fires the `setup-error` notice. |
| WR-04 | Persisted `drmWrapper` never clearable on `already-placed` | **Fixed** (52-15 `42aa4aa09`, 52-16 `dccb9f6a1`) | `detectDrmWrapper` returns `'none'`. `withDrmWrapper` stamps every non-error status. `games.ts:2845-2865`: fresh value wins, and a stale persisted `steamstub` is cleared when there is no verdict. The misleading comment is corrected. |
| WR-05 | Global HKCU `SteamClientDll64` never cleaned up | **Deferred, still open** (deferred-items 52-16 #1) | Code unchanged. The revisit condition ("a second title shares a bridge bottle") is too narrow. The **same** title reaches it when it goes `withheld` after an earlier `placed` launch. The withhold path restores the original `steam_api64.dll` but leaves `steamclient64.dll` and `SteamClientDll64` in place. The forwarder's `GetProcAddress(…, "GameLibBridge_CreateInterface")` (`steamclient_fwd.c:42`) then fails against Valve's DLL, so the forwarder answers NULL. The revisit condition should cover this case. |
| WR-06 | Overwrites a shipped `steamclient64.dll`; follows symlinks | **Deferred, still open** (#2) | `steamClientSetup.ts:159-162` unchanged. |
| WR-07 | Forwarded `ISteamClient` lifecycle methods act on the helper's session | **Deferred, still open** (#3); **scope wider than recorded** | The 52-14 gate does not cover these methods. They are forwarded for every x64 title, not only forwarded (SteamStub) ones. See **WR-09**. |
| WR-08 | Identity-only bypass via `GetISteamGenericInterface` / slot 3 | **Deferred, still open** (#4) | `bridge_helper.c:486-517` still has no `g_bd_identity_only` check. |
| IN-01 | Static request buffer and hello flag | **Deferred, still open** (#5) | `gen_vtables.ts:762-763` unchanged. |
| IN-02 | Duplicate sanitizer and containment helpers | **Deferred, still open** (#6) | Unchanged. 52-15 adds a third near-copy (`probeOriginalBackup` vs `restoreOriginalIfBackedUp`, see IN-05). |
| IN-03 | Closure misses delay imports; case-sensitive | **Deferred, still open** (#7) | Unchanged. |
| IN-04 | Forwarder re-LoadLibrary on every failed resolve | **Deferred, still open** (#8) | `steamclient_fwd.c:35-43` unchanged. |
| (unnumbered) | `withheld` result carries no `drmWrapper` / notice | **Fixed** (52-15, 52-16) | `shimGenerate.ts:704-710` stamps `withheld`; `games.ts:2897-2905` fires `steamstub-unforwarded:withheld`. |

## Narrative Findings (AI reviewer)

## Warnings

### WR-09: The CR-01 gate covers only the `GetISteam*` lookups. CreateSteamPipe, BReleaseSteamPipe, ConnectToGlobalUser, CreateLocalUser, ReleaseUser, RunFrame, GetIPCCallCount and BShutdownIfAllPipesClosed still forward to the native client for every x64 title

**File:** `meta/gen_vtables.ts:1115-1121` (only the lookup branch reads the flag), and the general wire emitter below it. In the generated `native/steam-bridge/generated/steam_api_shim.c`: `5366`, `5376`, `5388`, `5400`, `5418`, `5849`, `5857`, `5872` (SteamClient017) and `7998`, `8008`, `8020`, `8032`, `8050`, `8481`, `8489`, `8504` (SteamClient014).
**Issue:** 52-14's summary says "Ordinary x64 titles … again get [the] pre-phase" behaviour. That holds for lookups only.

Before the phase, at `7ed535984`, these methods were local stubs. For example, `vt_SteamClient017_BReleaseSteamPipe(void *self, uint32_t dummy0) { return 0; }` and `vt_SteamClient017_ReleaseUser(...) {}`.

Now they call `bridge_transact(16|22, slot, …)` whatever the state of `g_bridge_steamstub_path_active`. The helper then runs them against its own live native `ISteamClient` (`bridge_dispatch.h:1842-1894`).

This affects any x64 title, SteamStub or not, that calls `SteamClient()->…` lifecycle methods. Examples are older-SDK titles that manage pipes themselves, or a shutdown path that calls `BReleaseSteamPipe(SteamAPI_GetHSteamPipe())` or `ReleaseUser(1, 1)` with the shim's hard-coded handles (1/1). Such a title now releases or shuts down the **helper's** pipe and user. Every later wire call in the session then fails, and nothing reports it.

This is exactly the WR-07 risk. WR-07 was deferred with the revisit condition "a *forwarded* title loses wire calls". The population is in fact every x64 bridge title. Nothing has been observed yet: ELEX's helper log has no FWD lines, so ELEX did not call these methods.
**Fix:** Give the non-lookup SteamClient wire methods the same leading branch as the lookups. Off the SteamStub path, they answer the pre-phase stub value:
```c
// emitted for SteamClient-family wire methods that are not version lookups
#if defined(__x86_64__)
  if (!g_bridge_steamstub_path_active) { return 0; }   /* void methods: just `return;` */
#endif
```
Generate it from `emitVtableStub`'s wire branch when `manifest.family === 'SteamClient'`. Extend the `assertGated` test (`gen_vtables.test.ts:1821`) to iterate over every wire method of c17/c14, not only `/GetISteam/` ones. Also widen deferred-items 52-16 #3's revisit condition to "any x64 bridge title".

### WR-10: Grim Dawn re-gate trace: the SteamStub check rejects right after `CreateInterface` without calling any method on the interface it got back. The forwarder's export surface and module identity are the in-code inputs left

**File:** `native/steam-bridge/steamclient/steamclient_fwd.c:46` (the only export). Evidence: `/tmp/gamelib-gate-52r-20261024T033525Z/round-regate.cxlog` (product-written clone state, 52-UAT item 10).
**Issue:** The trace for the game process (`00d0:00d4`) after `Loaded '...\x64\steamclient64.dll' OK.` (cxlog `:23479`) is:
1. `LdrGetDllHandleEx "steam_api64.dll"` and `GetModuleFileNameW …steam_api64.dll` (`:23600-23602`). These are the forwarder's `resolve()` and the shim's cfg lookup.
2. Three `MSG_WAITALL` recvs: HELLO (1) and `CreateInterface SteamClient017` (2). These match the helper's `HELLO` and first `FWD` line.
3. `LdrGetProcedureAddress "Steam_ReleaseThreadLocalMemory" … not found` (`:23610`).
4. Two more recvs: `CreateInterface SteamClient014`.
5. `GetModuleFileNameW …\x64\steamclient64.dll` (`:23614`, on module `00006FFFFD210000`, the forwarder).
6. Immediately afterwards `FindResourceExW user32 "MSGBOX"` and `explorer.exe /desktop` start. This is the Application Load Error 3 box.

No `CreateSteamPipe`, `ConnectToGlobalUser` or `GetISteam*` reached the helper. Every one of those is a wire method that logs a FWD line (`bridge_dispatch.h:1843-1918`), so their absence is real, not a logging gap.

So the stub's verdict does not depend on anything the shim proxy or the helper answers after `CreateInterface`. The 52-14 gating and the forwarded-lookup plumbing are never reached for this title. The inputs GameLib controls at that point are:
- the forwarder module itself. It exports only `CreateInterface`, while a genuine `steamclient64.dll` also exports the `Steam_*` flat entry points (`Steam_ReleaseThreadLocalMemory`, `Steam_BGetCallback`, `Steam_FreeLastCallback`, `Steam_GetAPICallResult`, `Steam_IsKnownInterface`, `Steam_NotifyMissingInterface`, …). The stub queried its path right before the box. Its location in the game directory rather than a Steam install directory is another difference.
- the ActiveProcess `pid` that GameLib does not write (decision 1, option-c).

The failed lookup at step 3 names `Grim Dawn.exe` as the module that was searched, not the forwarder. So "the stub needs `Steam_*` exports from steamclient64" is **not proven** by this trace. It is a lead.
**Fix:** This is diagnosis work, not a code change yet. For the Gap-5 investigation plan:
- Re-run the trace round with `+relay` limited to `kernel32.GetProcAddress`, `GetModuleFileNameW`, `OpenProcess` and `ReadFile`/`CreateFileW` on the forwarder path. That shows which export names and file or path checks the stub makes between steps 4 and 6.
- Record the export table of a genuine `steamclient64.dll` (from `objdump -p`, no binary in the repo) next to the forwarder's.
- Until one of those is settled, do not spend more effort on post-`CreateInterface` forwarding: the trace shows it is not on the failing path.

### WR-11: The single-exe withhold path still withholds when there is no `steam_api` file to fall back to

**File:** `src/backend/storeManagers/steam/bridge/shimGenerate.ts:1433-1449` (with `withholdIfRestorable`, `:897-909`)
**Issue:** 52-15's rule says to withhold only when there is a game-original `steam_api` to launch with. In the single-exe branch, `shimTargets` is `targetIsGameLibShim ? [shimPath] : []`. When the exe statically imports `steam_api64.dll` but nothing exists at `shimPath` (`targetExists === false`), `shimTargets` is `[]`. `[].every(...)` is `true`, so `withhold()` runs. It logs "launching with the game's own steam_api, no helper" and returns `withheld`.

`games.ts:2893-2911` then launches the exe directly, and it fails at load with a missing-DLL error. The log line is false: the same false-log class that 52-UAT Gap 1-4 recorded, and that 52-15 set out to remove.
**Fix:** Treat an absent target as "nothing to fall back to" and take the refresh path:
```ts
if (delayMissing.length > 0 || unservable.length > 0) {
  const withheld = targetExists
    ? withholdIfRestorable({ ..., shimTargets: targetIsGameLibShim ? [shimPath] : [] })
    : null
  if (withheld) return withheld
  refreshGaps.push(...delayMissing, ...unservable)
}
```
Add a test for "static import, no dll on disk, unservable version", which should give `placed-miss` and no "game's own steam_api" warning.

## Info

### IN-05: A restore failure partway through `withhold()` leaves the disk half-restored, and the probe duplicates the restore checks

**File:** `src/backend/storeManagers/steam/bridge/shimGenerate.ts:850-875, 916-930`
**Issue:** On the multi-DLL path, if the first target restores and the second's `copyFileSync` fails, `withhold()` returns `error` with no rollback. One dll is now the game original and the other is a GameLib shim. The `error` string also drops the reason, which only `restoreOriginalIfBackedUp`'s own warning carries. Separately, `probeOriginalBackup` repeats the containment, lstat and shim-bytes checks of `restoreOriginalIfBackedUp` line for line (see deferred IN-02).
**Fix:** Have `restoreOriginalIfBackedUp` take a `{ dryRun: true }` flag instead of a twin function. On a partial failure, re-copy the shim over the already-restored targets, or name the restored files in the error.

### IN-06: The restore-failure test relies on `chmod 0o444`, and it does not restore the mode in a `finally`

**File:** `src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts:1985-1990`
**Issue:** Under root, as in many CI containers, `copyFileSync` ignores the read-only mode. The restore then succeeds and the `expect(result.status).toBe('error')` assertion fails. Also, if `placeShimForGame` throws, the mode is never reset.
**Fix:** Make the target a directory, or a dangling path whose parent is a file, so the copy fails for any uid. Or skip the test when `process.getuid?.() === 0`. Move the `chmodSync(dll, 0o644)` into `finally`.

### IN-07: The placed-miss warning on the refresh path describes the wrong failure mode

**File:** `src/backend/storeManagers/steam/bridge/shimGenerate.ts:1474-1477`
**Issue:** `placedMissing` now includes unservable interface versions and delay-imported symbols from the refresh path. The warning still says "A static-import miss is expected to fail at load with a Windows entry-point error". That statement is false for both kinds of gap: a version gap falls back to the null object or NULL at runtime, and a delay-import gap fails at first call.
**Fix:** Split the message. Keep the entry-point sentence only for static-import misses, and name refresh gaps separately (for example "unservable interface versions answered by the null object").

### IN-08: The `reg add` timeout starts before `runWineCommand`'s own prefix and boot work

**File:** `src/backend/storeManagers/steam/bridge/steamClientSetup.ts:194-210`
**Issue:** The 15 s window covers `validWine`, prefix verification and a cold CrossOver bottle start, as well as `reg.exe` itself. A cold first launch can exceed it. The result is then `error`, which fires the `setup-error` notice, while the orphaned child still writes the value a few seconds later (deferred #9). So the notice and the registry state disagree for that launch.
**Fix:** If this is observed, warm the bottle first (a cheap `wine cmd /c exit` under the same bound), or raise the bound for the first `reg add` only. Log the elapsed time on timeout so this case can be told apart from a real hang.

---

_Reviewed: 2026-10-24T04:49:08Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
