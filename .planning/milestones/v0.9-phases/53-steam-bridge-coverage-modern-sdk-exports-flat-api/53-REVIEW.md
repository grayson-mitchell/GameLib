---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
reviewed: 2026-10-25T00:00:00Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - meta/gen_vtables.ts
  - meta/bridgeCensus.ts
  - native/steam-bridge/helper/bridge_helper.c
  - src/backend/storeManagers/steam/bridge/bridgeScan.ts
  - src/backend/storeManagers/steam/bridge/bridgeVerdict.ts
  - src/backend/storeManagers/steam/bridge/interfaceVersions.ts
  - src/backend/storeManagers/steam/bridge/managedImports.ts
  - src/backend/storeManagers/steam/bridge/protocol.ts
  - src/backend/storeManagers/steam/bridge/shimCoverage.ts
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
  - src/backend/storeManagers/steam/electronStores.ts
  - meta/__tests__/bridgeCensus.test.ts
  - meta/__tests__/gen_vtables.test.ts
  - meta/__tests__/shimAbiGate.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/bridgeScan.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/managedImports.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
findings:
  critical: 1
  warning: 7
  info: 4
  total: 12
status: issues_found
---

# Phase 53: Code Review Report

**Reviewed:** 2026-10-25
**Depth:** standard (phase-53 diff hunks `a9d456961..HEAD`, plus spot-checks of generated `steam_api_shim.c` and the meta/sdk manifests it is generated from)
**Files Reviewed:** 18
**Status:** issues_found

## Summary

I traced the parts the brief named as risky:

- **ECMA-335 reader.** I checked every one of the 0x00-0x1C row sizes and coded-index tag lists against II.22/II.24.2.6, and all of them are correct. Bounds, row caps and the byte budget hold up against hostile input.
- **Helper REPORT_VERSION handler.** The length check, buffer sizes (129/132/192) and sanitising are correct.
- **Flat-API generator.** For ordinary `returnKind: 'class'` methods the generated C follows the rules: sret methods pass a zeroed `uint64_t out` and return it (for example `GetAppOwner` and `GetChatMemberByIndex`), and narrow GPR arguments are cast twice, like `(int32_t)(uint32_t)aN`.

The serious defect is a group of methods the generator does not recognise as sret. The SteamInput006 and SteamGameServer014/015 manifests added in 53-01 describe struct returns as `returnKind: 'pointer'` plus an explicit `_ret` parameter. The generator gives these methods the wrong flat ABI, and it also skips its own `> 8 bytes` guard for them.

There are also smaller problems:

- AnyCPU detection ignores the ILONLY flag.
- The census CALL evidence regex is anchored to a per-chunk prefix, not a per-line one.
- The helper's CALL trace fires before dispatch succeeds.
- The managed-scan verdict can mix data from two arches.

I found nothing new about the four known issues.

## Critical Issues

### CR-01: Flat exports for `_ret`-modelled struct returns use the wrong Win64 ABI (SteamInput006 / SteamGameServer014/015)

**File:** `meta/gen_vtables.ts:1665-1690` (flatRetType), `:1757-1795` (emitFlatCase), `:1866` (size guard); generated output `native/steam-bridge/generated/steam_api_shim.c:17494`, `:17994`, `:18050`, `:18126`
**Issue:** `isteaminput006.manifest.json` (`GetDigitalActionData`, `GetAnalogActionData`, `GetMotionData`) and `isteamgameserver014/015.manifest.json` (`GetPublicIP`) describe a struct return as `returns: "X_t*", returnKind: "pointer"` with an explicit first parameter `{name: "_ret", type: "X_t*"}`. These are Proton's `__thiscall` shapes. `emitFlatExports` treats `_ret` as an ordinary flat argument, so it generates code like this:

```c
void * SteamAPI_ISteamInput_GetAnalogActionData(void *self, void * a1, uint64_t a2, uint64_t a3)
void * SteamAPI_ISteamGameServer_GetPublicIP(void *self, void * a1)
```

The real flat functions are free C functions that return the struct by value. `InputAnalogActionData_t`, `InputMotionData_t` and `SteamIPAddress_t` are all larger than 8 bytes, so the Win64 C ABI passes the hidden return pointer in **RCX** and `self` in **RDX**. The generated body therefore compares the caller's return buffer with `&g_steaminput006_instance`, the comparison never matches, and the function returns `0`. As a result the caller's struct is never written, so Steamworks.NET marshals uninitialised stack data, and RAX is NULL where the ABI says it must hold the hidden pointer. Any caller that reads the result through RAX dereferences NULL.

`InputDigitalActionData_t` is 2 bytes and should come back in AX. Instead the generated code passes the game's `inputHandle` to the slot proxy as a `_ret` pointer, and the parameters after it are shifted by one. The proxy currently ignores everything and returns NULL, so this case returns 0 by luck. The first wire-mode version, or the first proxy that writes through `_ret`, writes to an address equal to the input handle.

The generator's guard `returnKind === 'class' && structSize > 8` (line 1866) exists to catch exactly this ("the flat function can only return up to 8 bytes in RAX"). These methods get past it because they are labelled `pointer`. All four names appear in `steamworksNetFlatNames.json`, so Mono titles really do call them.

**Fix:** Treat a leading `_ret` parameter on a `pointer` return as sret, and reject what cannot be represented:

```ts
const hasExplicitRet = (m: MethodSignature) =>
  m.params[0]?.name === '_ret' && m.params[0].type.endsWith('*')
// in emitFlatExports, before grouping:
if (hasExplicitRet(method)) {
  // Flat C ABI: >8-byte by-value return -> hidden ptr in RCX, self in RDX.
  // Either emit `void Flat(void *ret, void *self, ...rest)` that forwards
  // (self, ret, ...rest) to the slot and returns ret, or throw / list in
  // FLAT_UNREPRESENTABLE_CASES until a struct-size field exists.
  throw new Error(`flat export: ${m.interface}.${method.name} has an explicit _ret; unsupported`)
}
```

Also give these manifests a `structSize`, so the generator can tell a <=8-byte value return in RAX (`InputDigitalActionData_t`) from a >8-byte hidden pointer in RCX. Add a gen_vtables test that fails on any x64 manifest method with `params[0].name === '_ret'` and no explicit handling.

## Warnings

### WR-01: Vtable proxies for `_ret` struct returns return NULL instead of the hidden pointer (SteamInput006, SteamGameServer014/015)

**File:** `native/steam-bridge/generated/steam_api_shim.c:13762-13765`, `:13786-13789`, `:14462-14465` (generated by `meta/gen_vtables.ts` stub emission from the 53-01 manifests)
**Issue:** `vt_SteamInput006_GetDigitalActionData`, `vt_SteamInput006_GetAnalogActionData` and `vt_SteamGameServer015_GetPublicIP` are `return NULL;` with no write through `_ret`. In the MSVC x64 member-function ABI the callee must fill `*_ret` and return `_ret` in RAX, and compiled callers commonly read the result through RAX. A C++ (UE/native) game that reaches SteamInput006 through `SteamInternal_FindOrCreateUserInterface` will dereference NULL. The `class`-kind stubs do this correctly (`memset(sretOut,0,8); return sretOut;`), but these `pointer`-kind `_ret` methods do not.
**Fix:** For a `pointer` return whose first parameter is `_ret`, emit a stub that zeroes `_ret` (this needs the struct size, the same gap as CR-01) and returns it. Until then, mark these manifests' methods unrepresentable, or do not serve SteamInput006 on x64.

### WR-02: AnyCPU rule ignores COMIMAGE_FLAGS_ILONLY, so mixed-mode I386 assemblies read as x64

**File:** `src/backend/storeManagers/steam/bridge/managedImports.ts:166-175`
**Issue:** `effectiveLaunchArch` returns `'x64'` for any I386 PE with a CLR header that lacks 32BITREQUIRED and 32BITPREFERRED. A mixed-mode (C++/CLI) image lacks `COMIMAGE_FLAGS_ILONLY` (0x1) and contains native x86 code, so it always loads as a 32-bit process. Both `shimGenerate` (`launchArch`, `exeArch` stamp) and the census then consider `steam_api64.dll` for an x86 process, which gives the wrong dll and the wrong shim.
**Fix:**
```ts
const COMIMAGE_FLAGS_ILONLY = 0x1
if (machine === 'x86' && clrFlags !== null &&
    (clrFlags & COMIMAGE_FLAGS_ILONLY) !== 0 &&
    (clrFlags & bit32) === 0) return 'x64'
```
Add a test for flags `0x0` (mixed-mode) that expects `'x86'`.

### WR-03: Census CALL evidence regex depends on the per-chunk log prefix, so CALL lines after the first in a chunk are missed

**File:** `meta/bridgeCensus.ts:787-801` (findGameCall); relay at `src/backend/storeManagers/steam/bridge/helperProcess.ts:301-303`
**Issue:** `helperProcess.ts` logs each stderr `data` chunk once, as `bridge helper [<appid>]: ${text.trim()}`. A chunk often holds several helper lines, because the HELLO and the first CALLs arrive in a burst and Node merges successive writes into one chunk. Only the first line of the chunk carries the `bridge helper [id]:` prefix. `findGameCall` requires that prefix directly before `[ts] CALL`, so a CALL on the second or later line of a chunk is invisible. That gives Godot, GameMaker, unknown-engine and Unreal titles false `unverified` results. The HELLO regex has no prefix anchor, so the two regexes disagree.
**Fix:** Either split relayed stderr into lines and prefix each one in `helperProcess.ts`:
```ts
for (const line of text.split('\n')) if (line.trim()) logWarning(`bridge helper [${appId}]: ${line.trim()}`, LogPrefix.Steam)
```
or attribute CALL lines in the census by the most recent `bridge helper [id]:` prefix seen, not by requiring the prefix on the same line.

### WR-04: Helper CALL trace fires before dispatch succeeds, so failed calls count as "verified" evidence

**File:** `native/steam-bridge/helper/bridge_helper.c:567-571`
**Issue:** The CALL line is logged as soon as `bd_call_index` finds the (ordinal, slot) pair, before `bridge_dispatch` runs. A request that fails the param-bounds checks, or that hits an unresolved helper symbol, still logs `CALL X.Y`. For Godot, GameMaker and unknown engines (and as an Unreal fallback), `classifyBridgeEvidence` treats any CALL as `verified` (D-53-13). A broken session can therefore be counted as verified. The per-method `g_call_seen` latch also means a later successful call to the same method is never logged.
**Fix:** Log after dispatch, and only on success:
```c
uint8_t status = bridge_dispatch(...);
if (status == STATUS_OK && ci >= 0 && !g_call_seen[ci]) { g_call_seen[ci] = 1; logts("CALL", bd_call_name(ci)); }
```

### WR-05: `managedScan` verdict can pair one arch's assembly count with another arch's unserved count

**File:** `src/backend/storeManagers/steam/bridge/shimGenerate.ts:1001-1012`
**Issue:** `managedChosen` falls back to `[...managedByName.values()][0]` when `primaryName` has no managed entry. `unservedFamilyImports` is always read from `unservedManaged.get(primaryName) ?? 0`. With the fallback, the persisted verdict carries `assemblies` from the other dll name and `unservedFamilyImports: 0`, which is a silently wrong count.
**Fix:** Resolve the key once and use it for both fields:
```ts
const managedKey = managedByName.has(primaryName) ? primaryName : [...managedByName.keys()][0]
const managedChosen = managedKey ? managedByName.get(managedKey) : undefined
... unservedFamilyImports: unservedManaged.get(managedKey!) ?? 0
```

### WR-06: REPORT_VERSION has no helper-side rate limit, so a game process can flood the app log

**File:** `native/steam-bridge/helper/bridge_helper.c:523-547`
**Issue:** The 16-report cap (T-53-25) exists only in the shim (`g_flat_version_reports`). The helper accepts slot 4 before init, from any connected peer, as many times as it is sent, and writes a `NOVER` line each time. The brief treats the game process as untrusted. A process that writes frames directly to the helper's socket, or one that reconnects repeatedly, gets unbounded log writes into `gamelib.log`, and that pushes real evidence out of the census's 12-file and 32 MiB tail window.
**Fix:** Add a helper-side counter, for example `static unsigned g_nover_logged; if (g_nover_logged++ >= 16) { send_response(fd, requestId, STATUS_OK, NULL, 0); return; }`, before the `logts`.

### WR-07: Generator size guard treats a missing `structSize` as 0, so an unsized class return stack-overflows `out`

**File:** `meta/gen_vtables.ts:1866`
**Issue:** `(method.structSize ?? 0) > 8` accepts a `class` return that has no `structSize`. `emitFlatCase` then passes `&out` (a `uint64_t`) as the hidden pointer, and any proxy or wire path that writes the real struct size overruns the flat function's stack frame. Every current x64 class method does carry `structSize: 8`, so this is latent. The guard should fail closed.
**Fix:**
```ts
if (method.returnKind === 'class' && (method.structSize === undefined || method.structSize > 8)) throw new Error(...)
```

### WR-08: The SteamFriends018 manifest's explicit `_ret` plus `class` shape feeds the flat generator shifted arguments

**File:** `meta/sdk/isteamfriends.manifest.json` (widened to x64 in 53-01); consumed at `meta/gen_vtables.ts:1757-1795`; output `steam_api_shim.c:16118-16123`, `:16156-16161`
**Issue:** The 018 manifest marks `GetFriendByIndex`, `GetClanByIndex`, `GetChatMemberByIndex` and four other methods as `returnKind: 'class'` and also lists `_ret` as a parameter, while dropping their real last parameter. `isSretReturn` is true, so the flat body passes `&out` as the hidden pointer and then passes the game's first flat argument (for example `iClan`, or the `steamIDClan` value) as `(void *)` `_ret`. It is harmless today only because these 018 methods are stubs that touch only `sretOut`. 53-04-SUMMARY records the omitted parameters but not the argument shift into a pointer slot. The generator neither detects nor rejects the combination of `class` and `_ret`. If any of these methods goes wire, a SteamID value becomes a pointer that gets written through.
**Fix:** In `emitFlatExports`, throw on `returnKind === 'class' && params[0]?.name === '_ret'`, and re-extract the 018 manifest now (the summary already defers this to "when Friends018 goes wire"), not later.

## Info

### IN-01: `g_call_seen` declaration splits the T-52-09 comment from `sanitize_ver`

**File:** `native/steam-bridge/helper/bridge_helper.c:425-427`
**Issue:** The new array sits between `sanitize_ver`'s doc comment and the function, so the comment now reads as if it describes `g_call_seen`.
**Fix:** Move the declaration above the comment, with its own D-53-13 comment.

### IN-02: Census module-level accumulators are never reset

**File:** `meta/bridgeCensus.ts:1117`, `:1121`
**Issue:** `judgedSymbols` and `scanWarnings` are module globals with no reset in `runCensus`. A second run in the same process (tests, REPL) double-counts the x86 modern/flat total and the warning total.
**Fix:** Reset both at the top of `runCensus`, or make them locals that are passed through.

### IN-03: `isContainedWithin` rejects legitimate children whose names start with `..`

**File:** `src/backend/storeManagers/steam/bridge/bridgeScan.ts:76-77`
**Issue:** `rel.startsWith('..')` also matches a child directory named `..data` or `...`. This was lifted verbatim, but the module is now the shared copy.
**Fix:** `rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)`.

### IN-04: `detectEngine` classifies any top-level `*_data` entry as Unity

**File:** `meta/bridgeCensus.ts:754-760`
**Issue:** Names like `save_data` or `game_data` select the Unity evidence rule (Player.log only, and CALL ignored). Non-Unity titles then lose the CALL-based verification path.
**Fix:** Require `<exe stem>_Data`, matching an exe basename found in the same install, or require `UnityPlayer.dll`.

---

_Reviewed: 2026-10-25_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
