# Phase 52: Bridge-backed steamclient.dll for SteamStub titles - Research

**Researched:** 2026-10-24
**Domain:** Native Steam bridge (PE shim generator + arm64 helper + CrossOver bottle setup), macOS
**Confidence:** MEDIUM-HIGH on wiring and file-level mechanics (read from code this session). MEDIUM on what the native client accepts (version strings seen in the binary, acceptance not exercised). LOW on what the SteamStub check does after `CreateInterface`, which is only discoverable live.

## User Constraints (from ROADMAP `### Phase 52`; no CONTEXT.md exists)

### Locked Decisions
- **Goal:** Steam games wrapped with Steamworks DRM ("SteamStub", a `.bind` PE section) run through the native Steam bridge in their own per-game bottle. The stub's launch check is answered by the genuine signed-in Mac Steam client, with no Windows Steam client in the bottle and the exe unmodified.
- **Scope 1:** `meta/gen_vtables.ts`: `SteamClient017` and `014` genuinely forward to the helper's native `ISteamClient` (pipe/user handles served helper-side, not constants). `GetISteam*` logs the versions requested on the real path, and hands out forwarding proxies for the versions the stub needs.
- **Scope 2:** The forwarder `steamclient.dll` / `steamclient64.dll` (zig-built, as spike 039), resolving through the game's own shim module so the helper keeps one connection.
- **Scope 3:** Bottle setup at launch: write `ActiveProcess\SteamClientDll`/`SteamClientDll64`/`Universe`/`pid` and place the DLLs. Never create `HKLM\Software\Valve\Steam` (spike 036: its presence diverts the game into `steam.exe -applaunch`).
- **Scope 4:** `.bind` detection at install/scan time, so a SteamStub title is known before launch and gets an honest notice rather than "game stopped after 2s of play".
- **Scope 5:** The five missing modern-SDK `SteamInternal_*` exports and the DLL-importer scan gap Grim Dawn hits next (`2026-10-23-x64-shim-lacks-modern-sdk-steaminternal-exports-and-scan-misses-dll-importers.md`).
- **Boundary (locked):** every answer the stub receives comes from the native client. No stand-in that answers on its own, no DRM reconstruction. CEG titles (spikes 035-037) stay out of scope and keep the `drm-wrapped` -> bottled-Steam route.
- **Done when:** Grim Dawn (219990) launches from GameLib through its per-game bridge bottle, gets past SteamStub (no `steam://run` in a `--cx-log` trace), reaches its main menu, and Mac Steam shows it In-Game.
- **Depends on:** Phase 51 (generator, helper dispatch, per-game bridge bottles, x64 shim).

### Claude's Discretion
Everything not listed above: forwarder-DLL vs shim-hosted entry point, log channel, x86 coverage, notice shape, wire-op design. Recommendations are below.

### Deferred Ideas (OUT OF SCOPE)
- CEG / DIPC handling (spikes 035-037). Any logging fake `ISteamClient`, any stand-in, any disassembly or reverse engineering of the SteamStub wrapper or of CEG.
- Scan of the Unreal bootstrap exe (`2026-10-24-bridge-scan-reads-unreal-bootstrap-exe-and-misses-the-shipping-binary.md`) and the Unity managed-assembly flat-API todo are siblings, not this phase.

<phase_requirements>
## Phase Requirements

No requirement IDs were minted (ROADMAP: `Requirements: TBD`). The planner should key plans to the five Scope items above and to the Done-when gate.
</phase_requirements>

## Summary

The work is ~80% generator and helper plumbing, ~15% bottle setup, and ~5% a tiny forwarder DLL. Spike 039 proved the plumbing: the stub loads the registered DLL, takes the shim's `SteamClient017` and then asks for `SteamClient014`. It failed (exit 51) because the shim's `SteamClient017` methods are local constants (`CreateSteamPipe`/`ConnectToGlobalUser` return `1`, wire-policy `helperFallback`) and everything else is a `STUB` (manifest `mode: "stub"`). So the stub never reached the native client; the helper saw no `HELLO`. The fix is a policy change in `meta/sdk` data plus three generator extensions. It is not a rewrite.

The native client surface exists and is reachable with no new dlopen. The already-loaded `libsteam_api.dylib` exports a plain C `SteamClient()` accessor and the flat `SteamAPI_ISteamClient_*` functions (verified with `nm` on this machine), and `steamclient.dylib` contains the literal strings `SteamClient006`..`SteamClient023` including `014` and `017`. The helper can therefore serve ISteamClient by setting manifest `helperInterface: "SteamClient"` and `helperFlat: "SteamAPI_ISteamClient_<Method>"` per method; the existing dispatch generator does the rest. Proton's `lsteamclient` does exactly this shape (native `CreateInterface`, then a per-version Windows-ABI wrapper; handles are passed through unchanged).

Three generator gaps must be closed, all in code read this session: (1) the helper dispatch refuses `pointer` returns (`assertDispatchable`, gen_vtables.ts:1740), so `GetISteam*` cannot be wire methods yet; (2) `GetISteam*` is special-cased to a local lookup that falls back to a made-up null object (gen_vtables.ts:958, 891-921), which is a local answer and must not be used on the forwarded path; (3) `pchVersion` needs `kind: "in-string"`. The log channel is free: every line the helper writes to stderr already lands in `gamelib.log` as `bridge helper [appId]: ...` (helperProcess.ts:301-307).

**Primary recommendation:** Flip the `SteamClient` rows of `meta/sdk/wire-policy.json` and manifests from fallback/stub to `helperFlat` wire, add a `SteamClient014` manifest (first 29 slots of 017, same flat names), extend the generator so `GetISteam*` asks the helper (native `GetISteam*` non-NULL?) and then maps to the shim's own per-version proxy or returns NULL (never the null object), log every forwarded ISteamClient call helper-side, and ship a thin zig-built `steamclient(64).dll` placed beside the primary shim that calls a new shim-exported `GameLibBridge_CreateInterface`. Discover the stub's follow-up calls from the helper log on the live Grim Dawn gate, not by guessing.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Answering `CreateInterface("SteamClient0NN")` | Native helper (asks `SteamInternal_CreateInterface`) | PE shim (returns its proxy) | Only the genuine client may decide a version is supported |
| ISteamClient method forwarding (pipe/user/GetISteam*) | Native helper (flat `SteamAPI_ISteamClient_*`) | PE shim (marshal only) | Handles and acceptance live in the signed-in client's process space |
| Child-interface proxies (SteamUser019, ...) | PE shim (existing per-version vtables) | Helper (existing wire dispatch) | Windows-ABI vtables must live in the game process |
| Forwarder DLL (`steamclient64.dll`) | PE (in bottle) | Shim | Registry slot needs a real file with `CreateInterface` export |
| Registry + DLL placement at launch | Backend (`games.ts` launch path) | `runWineCommand reg add` | Bottle state is backend-owned, already done for shim and cfg |
| `.bind` detection | Backend scan (`importScan`/`shimGenerate`) | Persisted verdict store | Pure PE-header read at install and launch |
| Log of requested versions | Native helper stderr | `gamelib.log` via helperProcess | Zero new channel; already captured |
| Notice to user | Backend verdict + i18n notice | Frontend dialog | Existing notice vocabulary |

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| zig cc | 0.16.0 pinned (`meta/downloadZig.ts:40`; `.build-tools/zig/zig version` -> 0.16.0) | Cross-compile forwarder PEs (`x86_64-windows-gnu`, `x86-windows-gnu`) | Same toolchain/flags as shims (`SHIM_RELEASE_CFLAGS`) [VERIFIED: local] |
| clang (system) | Apple clang 21.0.0 | Helper build (`buildHelperCompileArgv`) | Existing [VERIFIED: local] |
| `meta/gen_vtables.ts` + `meta/sdk/*.manifest.json` | in-repo | Single source for shim vtables and helper dispatch | Phase 51 design [VERIFIED: code] |
| `pnpm extract-proton-inventory --versions SteamClient014` | in-repo | Authoring a manifest from Proton `proton_9.0` @ `2c620c0f...` | Procedure used for every prior added version (commit e9519488d) [VERIFIED: git] |
| `runWineCommand` + `reg add` | in-repo | Registry writes in a bottle | Precedent: `storeManagers/legendary/setup.ts:35`, `tools/index.ts:328` [VERIFIED: code] |
| jest 29 | in-repo | Unit and generator tests | Existing |

### Supporting
| Tool | Purpose | When |
|------|---------|------|
| `/usr/bin/objdump` (Apple LLVM) | Existing PE import scan | Import closure for Engine.dll; `-h` lists sections but a pure-TS section parse is preferred |
| `meta/__tests__/shimAbiGate.test.ts` pattern | Real zig compile + objdump | ABI gate for any new x64 vtable shape |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Forwarder DLL + shim-hosted entry | Export `CreateInterface` from the shim and point the registry at the shim | Fewer artifacts, but the stub then loads a DLL named `steam_api64.dll` as its "steamclient"; naming fidelity is untested (spike 039 proved only a `steamclient64.dll` name). Keep as fallback if the forwarder naming turns out irrelevant and placement becomes a burden |
| Helper uses `SteamClient()` + flat `SteamAPI_ISteamClient_*` | dlopen `steamclient.dylib` and call `CreateInterface` directly | A second client load needs its own pipe/IPC bring-up; flat API reuses the helper's single `InitFlat` identity (todo: "Keep the helper's existing identity, no new auth") |

**Installation:** none. No new npm/PyPI/crates packages. Zig is already pinned and downloaded by `downloadZig`.

**Version verification:** zig 0.16.0 confirmed locally; Proton ref pinned in `meta/extractProtonInventory.ts` (`PINNED_PROTON_SHA`). No registry packages involved.

## Package Legitimacy Audit

No external packages are installed by this phase. slopcheck not run (nothing to check). Packages removed: none. Packages flagged: none.

## Architecture Patterns

### System Architecture Diagram

```
  Grim Dawn.exe (SteamStub .bind)                     Mac side
  (in per-game bridge bottle, Wine)
        |
        | 1. reads HKCU\Software\Valve\Steam\ActiveProcess\SteamClientDll64
        v                                   (written by backend at launch: reg add)
  steamclient64.dll  (zig forwarder, placed beside primary shim)
        |  CreateInterface(name, &rc)
        v
  steam_api64.dll  (GameLib shim; already loaded by Engine.dll, found via GetModuleHandle)
        |  GameLibBridge_CreateInterface(name)
        |     a) wire: ask helper "does native accept <name>?"  ------------+
        |     b) yes -> return local g_steamclient0NN_instance             |
        |        no  -> return NULL (rc=1)                                  |
        v                                                                   |
  SteamClient0NN vtable (generated, FORWARDING)                             |
        |  CreateSteamPipe / ConnectToGlobalUser / GetISteam*(ver) ...      |
        |  bridge_transact(ordinal, slot, args)  [TCP 127.0.0.1:port, ONE connection]
        v                                                                   v
  steam-bridge-helper (arm64, one per appId, serves one connection)  <------+
        |  bridge_dispatch (generated): flat SteamAPI_ISteamClient_*(SteamClient(), ...)
        |  logts("FWD", method + version + native result)  -> stderr -> gamelib.log
        v
  libsteam_api.dylib  -> steamclient.dylib -> Mach service ipcserver -> signed-in Mac Steam
        ^
        | GetISteam*(ver) non-NULL?  -> shim maps ver -> existing proxy (g_iface_table) else NULL + log
```

### Recommended Project Structure
```
meta/sdk/isteamclient017.manifest.json   # modify: helperInterface + wire methods
meta/sdk/isteamclient014.manifest.json   # new (extractor), ordinal 22 expected
meta/sdk/wire-policy.json                # SteamClient rows: helperFlat instead of helperFallback
meta/gen_vtables.ts                      # lookup-stub forwarding, pointer-presence dispatch, 5 SteamInternal_*, GameLibBridge_CreateInterface
native/steam-bridge/steamclient/steamclient_fwd.c   # new hand-written forwarder (from spike 039)
native/steam-bridge/helper/bridge_helper.c          # CREATE_INTERFACE control slot, FWD logging
meta/buildSteamBridgeShims.ts            # compile steamclient.dll + steamclient64.dll
src/backend/constants/paths.ts           # builtBridgeSteamClientPath / 64
src/backend/storeManagers/steam/bridge/
  steamClientSetup.ts                    # new: place forwarder(s), reg add values (pure argv builder + runner)
  peSections.ts                          # new: zero-import PE section-name parser
  importParse.ts                         # add parseImportedDllNames (closure walk)
  shimGenerate.ts                        # drmWrapper detection; closure scan; forwarder placement hook
```

### Pattern 1: Make an ISteamClient method forward (data-only for plain methods)
**What:** In `wire-policy.json`, replace `{"helperFallback": 1}` by `{"helperFlat": "SteamAPI_ISteamClient_CreateSteamPipe"}`; in the manifest add `"helperInterface": "SteamClient"` and per-method `"mode": "wire"`. The extractor overlays policy per `(family, method)` (extractProtonInventory.ts ~L497-530), so the family-level policy applies to every SteamClient version automatically.
**Evidence:** current policy rows `wire-policy.json:229-234`; manifest 017 is `mode: "stub"`, `complete: true`, 37 slots, only slots 0 and 2 wire+`helperFallback` (read this session). `isWireDispatchMethod` (gen_vtables.ts:1577) excludes `helperFallback` methods from dispatch; `assertDispatchable` (1740) requires `helperFlat` + manifest `helperInterface`.
**Helper accessor:** dispatch does `dlsym(handle, helperInterface)()` once after `InitFlat` (generateDispatchHeader initBody). `SteamClient` is exported as a C symbol (`nm`: `_SteamClient`), so no hand-written accessor is needed.
```jsonc
// meta/sdk/wire-policy.json (shape; flat names verified to exist in libsteam_api.dylib via nm)
"SteamClient": {
  "CreateSteamPipe":     { "helperFlat": "SteamAPI_ISteamClient_CreateSteamPipe" },
  "BReleaseSteamPipe":   { "helperFlat": "SteamAPI_ISteamClient_BReleaseSteamPipe" },
  "ConnectToGlobalUser": { "helperFlat": "SteamAPI_ISteamClient_ConnectToGlobalUser" },
  "CreateLocalUser":     { "helperFlat": "SteamAPI_ISteamClient_CreateLocalUser" }, // phSteamPipe needs kind:"out-value", valueType:"int32"
  "ReleaseUser":         { "helperFlat": "SteamAPI_ISteamClient_ReleaseUser" },
  "GetIPCCallCount":     { "helperFlat": "SteamAPI_ISteamClient_GetIPCCallCount" }
  // GetISteam* rows: see Pattern 2
}
```

### Pattern 2: Forwarded `GetISteam*` (the one real generator extension)
**What:** Today `emitSteamClientVersionLookupStub` (gen_vtables.ts:891) ignores the handles and resolves purely locally, returning `g_x64_null_object_instance` on a miss (line 897-921). That answers locally, which the boundary forbids on this path. Replace for SteamClient methods marked wire with: pack `(hUser, hPipe, version in-string)` -> `bridge_transact` -> helper calls `SteamAPI_ISteamClient_GetISteamXxx(self, hUser, hPipe, version)` and replies `int32 present = (ptr != NULL)` -> shim: present && `resolve_iface_by_exact_version(version)` non-NULL returns the local proxy; otherwise returns NULL (and the helper log shows `native=present` vs `native=NULL` so an un-proxied version is visible).
**Generator changes:** (a) manifest params `pchVersion` get `"kind": "in-string"` (validateManifest rejects an unmarked `const char*` wire param, gen_vtables.ts:~340); (b) `dispatchReturnWidth` (1703) returns `null` for `pointer`, so add a narrow case: SteamClient-family `pointer` return encodes 4-byte presence, emitted in `emitDispatchCase` (1793); (c) `computeRetN`/`stackBytes` already match (12 = 3 x 4); (d) `emitVtableStub` ordering at 958 must route wire-marked lookup methods to the new emitter and keep the old local lookup only for `mode: stub`.
**Mapping to existing proxies:** the shim's `g_iface_table` (steam_api_shim.c:7506, ~21 compiled versions) is the map; no per-handle state exists (D-51-01 single pipe/user).
**Decision for the planner:** an unproxied-but-native-present version returns NULL, not the null object. Rationale: the null object is a made-up success. [ASSUMED] that returning NULL is acceptable to the stub for versions it does not truly need; the live gate will show.

### Pattern 3: Add a manifest version (confirmed procedure)
1. `pnpm extract-proton-inventory --versions SteamClient014` (reads Proton `winISteamClient.c` at the pinned SHA; assigns the next ordinal from `meta/sdk/ordinals.json`, append-only; applies wire-policy overlay; runs prettier).
2. Hand-add `helperInterface: "SteamClient"` and `arches` (the extractor does not write `helperInterface`; see `isteamuser019.manifest.json` for the shape).
3. `pnpm gen-vtables` (regenerates `steam_api_shim.c`, `steam_api.def`, `steam_api64.def`, `bridge_dispatch.h`; commit all).
4. Mirror in `src/backend/storeManagers/steam/bridge/shimCoverage.ts`: `SHIM64_SERVED_INTERFACE_VERSIONS`, `SHIM64_EXPORTED_SYMBOLS` (the `.def` pin test fails both ways otherwise); `SHIM_EXPORT_SET_VERSION` changes automatically.
5. Update `shimCoverage.test.ts`, `gen_vtables.test.ts` pins; run the zig compile gate.
Precedent commits: e9519488d (manifests), 8628ea5a7 (regen + coverage).
**SteamClient014 layout** [CITED: ValveSoftware/Proton proton_9.0 lsteamclient/winISteamClient.c]: 29 methods, `CreateSteamPipe, BReleaseSteamPipe, ConnectToGlobalUser, CreateLocalUser, ReleaseUser, GetISteamUser, GetISteamGameServer, SetLocalIPBinding, GetISteamFriends, GetISteamUtils(hPipe,ver), GetISteamMatchmaking, GetISteamMatchmakingServers, GetISteamGenericInterface, GetISteamUserStats, GetISteamGameServerStats, GetISteamApps, GetISteamNetworking, GetISteamRemoteStorage, GetISteamScreenshots, RunFrame, GetIPCCallCount, SetWarningMessageHook, BShutdownIfAllPipesClosed, GetISteamHTTP, GetISteamUnifiedMessages, GetISteamController, GetISteamUGC, GetISteamAppList, GetISteamMusic`. Compared with the 017 manifest slots 0-28 this is the same order and arity (017 only adds slots 29-36). Note the wire-policy keys are method names, so `GetISteamUnifiedMessages` appears in 014 but is `DEPRECATED_GetISteamUnifiedMessages` in 017; handle in the policy if forwarded.

### Pattern 4: Hand-offs the helper must NOT make
Flat exports that do not exist in the installed dylib (nm): `RunFrame`, `CreateGlobalUser`, `GetISteamUnifiedMessages`, `GetISteamAppList`, `GetISteamMusicRemote`. Dispatch is NULL-tolerant per symbol (`T-51-23`: unresolved -> `STATUS_ERR` -> shim returns 0/NULL), which is an honest "native has no such function". Callback-pointer methods (`SetWarningMessageHook`, `Set_SteamAPI_CPostAPIResultInProcess`, `Remove_...`, `Set_SteamAPI_CCheckCallbackRegisteredInProcess`) take a Windows function pointer the native side cannot call; keep them as manifest `stub` (no-ops) and note it. [ASSUMED] that the stub does not depend on them; the log will show if it calls them (they stay local, so add a `FWD`-style local log line in the shim? no, shim has no log channel; see Open Question 2).

### Anti-Patterns to Avoid
- **Returning `g_x64_null_object_instance` from a forwarded `GetISteam*`.** Local made-up success; breaks the boundary.
- **A second helper connection.** The helper serves one connection at a time (single `accept` loop, bridge_helper.c:646). A forwarder that opens its own socket would block or evict the shim. Always go through the one shim module.
- **Creating `HKLM\Software\Valve\Steam` or `Wow6432Node\Valve`.** Add a unit test over the reg argv that rejects `HKLM`/`HKEY_LOCAL_MACHINE`.
- **Keying on `GetModuleFileName(NULL)` to find the shim** (spike 039). Wrong for games whose shim is not in the exe dir.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Windows-ABI vtables for SteamClient | Hand-written C vtables | `gen_vtables.ts` manifest path | THISCALL/retN/sret handled, ABI gate tests exist |
| Helper dispatch for ISteamClient | New switch statements in `bridge_helper.c` | `helperFlat` + `helperInterface` in manifests | Table hash `BRIDGE_SHIM_TABLE_HASH == BRIDGE_DISPATCH_TABLE_HASH` keeps both ends in sync |
| Reading a version list | Guessing which versions the stub wants | Helper `FWD` log from the live gate | Boundary: discover by forwarding |
| Registry writes | Editing `user.reg` text | `runWineCommand` + `reg add ... /f` | Existing precedent; wineserver owns the file |
| PE section reading | Spawning objdump and regexing | ~25-line Buffer parser (DOS `e_lfanew` -> COFF -> section table) | No process, trivially unit-testable, matches the zero-import `importParse.ts` discipline |
| The Win path of a placed DLL | String concatenation by hand | `relative(<bottle>/drive_c, path)` with `/`->`\` and `C:\` prefix, behind `isContainedWithin` | Same containment idiom as `shimGenerate.ts`/`bridgeConfig.ts` |

**Key insight:** every piece of the forwarding already has a seam in Phase 51; the phase is mostly turning off local fallbacks and adding the three small generator capabilities.

## Runtime State Inventory

Not a rename/refactor/migration phase. Omitted. (Bottle state written at launch is covered under Bottle Setup and Pitfalls.)

## Q&A against the eight research questions

### Q1. Generator: STUB vs HELPER FALLBACK vs forwarded
- Decision order inside `emitVtableStub` (gen_vtables.ts:923): (1) SteamClient `GetISteam*` with a `const char*` param -> local lookup stub (958); (2) `method.helperFallback !== undefined` -> constant return, never transacts, excluded from dispatch (967); (3) `methodMode === 'stub'` (method `mode` override else manifest `mode`) -> zero/NULL/empty body sized by `stackBytes` (992, `emitStubBody` 773); (4) otherwise wire: pack args per `kind`, `bridge_transact(ordinal, slot, ...)`.
- 017 today: manifest `mode: "stub"`; slots 0 and 2 `wire`+`helperFallback: 1` (from `wire-policy.json:229-234`); `GetISteam*` take path (1). `arches: ["x64"]`, ordinal 16.
- (a) Forward ISteamClient: Pattern 1 (data) plus Pattern 2 (generator). (b) `SteamClient014`: Pattern 3; manifest arches `["x64"]` first. (c) x86: the generator is arch-neutral (`THISCALL` macro, `archGuard`); a dual-arch SteamClient needs `arches: ["x86","x64"]` plus a shim entry for x86. x86 has no `SteamInternal_CreateInterface` (MODERN family is x64-only, gen_vtables.ts:647), so x86 must use the shim-hosted `GameLibBridge_CreateInterface` (below). Not needed for Grim Dawn's x64 done-when. [ASSUMED] the x86 stub asks the same 017/014 pair.
- (c') Logging: shim has no logging today; use the helper. In the generated dispatch case for `family === 'SteamClient'` emit `logts("FWD", ...)` (declare `logts` available to `bridge_dispatch.h` since it is `#include`d into `bridge_helper.c`, where `logts` is defined above it? `logts` is defined at bridge_helper.c:195, after the `#include` at ~L113; add a forward declaration in the header preamble or move the include). Log: interface+method, decoded version string, native result (present/NULL). Do not log SteamIDs. Lines surface in `gamelib.log` as `bridge helper [<appId>]: [ts] FWD ...` (helperProcess.ts:301-307, `logWarning`).

### Q2. Helper side
- Use `SteamClient()` (C symbol exported by the installed `libsteam_api.dylib`) as `self`, and the flat `SteamAPI_ISteamClient_*` functions. All of CreateSteamPipe, BReleaseSteamPipe, ConnectToGlobalUser, CreateLocalUser, ReleaseUser, SetLocalIPBinding, GetISteamUser/GameServer/Friends/Utils/Matchmaking/MatchmakingServers/GenericInterface/UserStats/GameServerStats/Apps/Networking/RemoteStorage/Screenshots/HTTP/Controller/UGC/Music/HTMLSurface/Inventory/Video/ParentalSettings, GetIPCCallCount, BShutdownIfAllPipesClosed, SetWarningMessageHook are present [VERIFIED: `nm -gU` on the installed dylib, this machine]. Also exported: `SteamInternal_CreateInterface`, `SteamAPI_GetHSteamPipe/User`.
- Versions accepted: `steamclient.dylib` contains the literal strings `SteamClient006`..`SteamClient023` [VERIFIED: `strings`]; `libsteam_api.dylib` contains `SteamClient017` and `SteamClient023`. String presence is not proof of acceptance. The acceptance question is best answered by the client itself: add a hand-written control slot (e.g. `CONTROL_SLOT_CREATE_INTERFACE = 3`, protocol.ts `CONTROL_SLOT` and `bridge_helper.c` `dispatch_and_respond`) that calls `SteamInternal_CreateInterface(name)` and returns 1 if non-NULL. [ASSUMED] `SteamInternal_CreateInterface` reaches `steamclient`'s `CreateInterface`, which is how the SDK builds `SteamClient()`; verify live. It is only valid after `InitFlat` succeeds (`g_inited`), otherwise `STATUS_ERR` -> the shim returns NULL, an honest "no client".
- Handles: Proton passes `hSteamPipe`/`hSteamUser` through unchanged in the generated wrappers (visible in `winISteamClient.c`: `.hSteamPipe = hSteamPipe`) and only wraps returned interface pointers by version (`create_win_interface(pchVersion, ptr)`), and its `CreateInterface` is `native CreateInterface` then `create_win_interface(name, ptr)` [CITED: github.com/ValveSoftware/Proton lsteamclient/steamclient_main.c, winISteamClient.c, proton_9.0]. GameLib mirrors this: real helper-side handle values go to the game, come back verbatim, and the shim's child proxies ignore them (D-51-01, one pipe/user per helper).
- Caveat: `SteamAPI_GetHSteamPipe/User` in the shim are constants `1` (gen_vtables.ts:~676). A game mixing those with handles from forwarded `CreateSteamPipe` passes inconsistent values. Leave as-is for the first live run; if the log shows a native NULL caused by handle `1`, forward them (the dylib exports both).
- Risk: a game-issued `BReleaseSteamPipe`/`ReleaseUser`/`BShutdownIfAllPipesClosed` reaches the helper's real client. The helper's own `InitFlat` pipe is never handed out (constants), so this is low risk, but watch it in the first live log. Do not add a local "refuse" guard unless the log shows damage; if one is needed it is a protective drop, not an answer, and should be called out in the plan.

### Q3. Child interfaces
Existing proxies are keyed by exact version in `g_iface_table` (steam_api_shim.c:7506) and resolved by `resolve_iface_by_exact_version` (7584), used by both `SteamInternal_CreateInterface` (7663) and the SteamClient `GetISteam*` stubs. Missing versions are added with Pattern 3. The version list the stub needs is unknown and must be read off the helper `FWD` log; the plan must treat "add proxies for logged versions" as a discovered, iterative task bounded by a cap, not a fixed deliverable.

### Q4. Forwarder DLL
- Build: add `compileSteamClientForwarder()` to `meta/buildSteamBridgeShims.ts` next to `compileShim64()` (same `zig cc -target x86_64-windows-gnu -shared ...SHIM_RELEASE_CFLAGS`, no `-lws2_32` needed because the forwarder only calls into the shim). Outputs `public/bin/<arch>/darwin/steamclient64.dll` and `steamclient.dll`; add path constants beside `builtBridgeShim64Path` (paths.ts:114). The Tauri bundle already ships the whole `build/bin/<arch>/darwin` dir (comment at paths.ts:109). zig also emits `<name>.pdb` and an import `.lib` named after the source file (see `SHIM64_BUILD_BYPRODUCTS` rationale at buildSteamBridgeShims.ts ~L254); extend the prune list or the forwarder will leak ~2.8 MB of byproducts into the bundle. Add argv tests like `buildShim64CompileArgv`'s.
- Placement: beside the primary shim (the one adjacent to the launch exe), so the forwarder is guaranteed to have the shim's `gamelib_bridge.cfg` neighbourhood and its sibling. `placeShimForGame` already returns `shimPaths`; use `dirname(shimPaths[0])` after choosing the shim in `dirname(exe)` when it exists.
- Resolving the shim: do not use `GetModuleFileName(NULL)` (spike 039, wrong for exe/DLL in different dirs). Order: `GetModuleHandleW(L"steam_api64.dll")` (the instance the game's own import already loaded: keeps one module, one socket), then `GetModuleHandleExW(FROM_ADDRESS)` for the forwarder's own dir and `LoadLibraryW(<dir>\steam_api64.dll)`. Two shim copies in two paths (e.g. `x64\` and `compat\`) would be two module instances and two connections; the by-name lookup prevents that.
- Entry: the forwarder calls a shim export `GameLibBridge_CreateInterface(const char *name, int *rc)` that does the helper acceptance check and local proxy lookup, instead of relying on `SteamInternal_CreateInterface` (which does not exist on x86 and returns the null object on a miss). Add the export to both `.def` files, `SHIM_EXPORTED_SYMBOLS`/`SHIM64_EXPORTED_SYMBOLS`, and tests. The forwarder keeps spike 039's one-line `CreateInterface(name, rc)` and exports nothing else; the real DLL's 41 `Steam_*` exports (`spikes/038.../exports64.txt`) were not needed in p1 (the probe exported only `CreateInterface` and the stub made exactly two calls) [VERIFIED: 038 evidence].
- Trade-off vs shim-hosted `CreateInterface` (point the registry at `steam_api64.dll`): no extra artifact or placement, but untested name fidelity, and the registry holds one path while games can carry several shim copies; the stub could load a different copy than the one the game imports. The forwarder with by-name lookup avoids the duplicate-instance risk, so recommend it. If the live gate shows the stub does not care about the DLL name, the shim-hosted route is a simplification available later.

### Q5. Bottle setup
- Where: `launchBridgeGame()` in `games.ts`, after `writeBridgeConfig` succeeds (L2736-2758) and before `fireBridgeWineLaunch` (L2766). `shimPaths` is already in scope there. Gate it on `verdict.scan.drmWrapper === 'steamstub'` (see Q6) to limit blast radius; it is cheap to widen later.
- How: one `runWineCommand({ gameSettings: bridgeBottleSettings, commandParts: ['reg','add', <key>, '/v', <name>, '/t', 'REG_SZ', '/d', <winpath>, '/f'], wait: true, protonVerb: 'run' })` per value (the shape used at `storeManagers/legendary/setup.ts:35` and `tools/index.ts:328`). Keys under `HKCU\Software\Valve\Steam\ActiveProcess`: `SteamClientDll`, `SteamClientDll64` (REG_SZ, Windows paths), `Universe` (REG_SZ `Public`, as spike 036 `dipc_responder.c:125`), `pid` (REG_DWORD). Build the argv in a pure function (`buildSteamClientRegistryCommands(winPaths)`) so it is unit-testable; the runner stays thin. `HKCU` has no Wow64 redirection for `Software\Valve`; the x64 stub in b1 opened `HKCU\Software\Valve\Steam\ActiveProcess` directly [VERIFIED: 038 evidence.txt].
- `pid`: in spike 036/038 the responder process wrote a live `pid` (Proton's `steam.exe` stub does the same). In the product there is no such process. Whether the stub validates `pid` is unknown; write it only if the live gate shows the stub needs it (Open Question 1).
- Windows path of a placed DLL: `C:\` + path relative to `<bottle>/drive_c` with `\` separators, after `isContainedWithin(bottleDir, path)`.
- Never write HKLM. Add a test that no generated argv contains `HKLM`/`HKEY_LOCAL_MACHINE`.
- Cost: each `runWineCommand` spawns wine (~1 s). Batch the writes with a single `cmd /c` is not recommended (quoting); instead skip the whole step when the placed DLL path and a marker already match a persisted record, or accept the cost on SteamStub titles only.

### Q6. `.bind` detection
- PE headers: `importParse.ts` parses only `objdump --private-headers` stdout and never sees sections; `objdump --private-headers` output contains no section table (checked: only `DLL Name:` lines matched). `objdump -h` does list `.bind` for Grim Dawn: `9 .bind 00039248 0000000140448000` [VERIFIED: local objdump -h of `x64/Grim Dawn.exe`, a section listing only].
- Recommended: new zero-import `peSections.ts` with `parsePeSectionNames(buf: Buffer): string[]` (read first ~4 KiB-8 KiB: `e_lfanew` at 0x3C, `NumberOfSections` at +6, `SizeOfOptionalHeader` at +20, 40-byte entries starting at `+24+SizeOfOptionalHeader`; bound `e_lfanew` and the section count). Call it from `placeShimForGame` where `resolvedExePath` is known (shimGenerate.ts ~L350) and return `drmWrapper: 'steamstub'` on the verdicts.
- Verdict flow: add optional `drmWrapper` to `SteamBridgeScanVerdict` (electronStores.ts:197) and to `bridgeScanVerdictSchema` (bridgeVerdict.ts:~35). The zod object is non-strict, so an unknown key is silently stripped on read. This is the single easiest bug to ship. Do not add a new known-bad reason (allowlist.ts `KNOWN_BAD_REASONS` is a closed taxonomy with a bidirectional compile-time check). `resolveBridgeRoute` needs no change (SteamStub titles stay on the bridge).
- Notice: reuse the existing `[bridge-notice]` log line and `maybeNotifyBridgeLimited` (games.ts ~L2530) pattern for a one-time informational note. A new route reason would touch `common/types/steam.ts`, `NOTICE_REASONS` (bridgeRoute.ts:48), the frontend dialog and i18n (`public/locales/en/gamelib.json`, hardcoded-string and translation gates). Recommend: log + `notify()` only, no dialog (Open Question 3).
- Section name `.bind` for SteamStub generally: [ASSUMED] (community knowledge; confirmed only for Grim Dawn here).

### Q7. The five `SteamInternal_*` exports
Signatures [CITED: github.com/Detanup01/gbe_fork dll/dll.cpp, used for signatures only; the SDK header `steam_api_internal.h` is the authority and is not in the repo, so the plan should have the operator confirm against the pinned SDK]:
- `void *SteamInternal_ContextInit(void *pContextInitData)`: struct is `{ void (*pFn)(void *pCtx); uintp counter; <ctx> }`. If `p->counter != g_global_counter`: call `p->pFn(&p->ctx)`, set `p->counter`; return `&p->ctx`. Use a constant global counter and a simple lock.
- `void *SteamInternal_FindOrCreateUserInterface(HSteamUser hUser, const char *pszVersion)` and `...GameServerInterface(...)`: resolve by exact version through `resolve_iface_by_exact_version` (same as `SteamInternal_CreateInterface`, gen_vtables.ts:653-680). User variant forwards the version; game-server variant returns the unsupported answer (no GameServer, D-51-14).
- `ESteamAPIInitResult SteamInternal_SteamAPI_Init(const char *pszInternalCheckInterfaceVersions, char *pOutErrMsg)`: send CONTROL HELLO exactly like `SteamAPI_Init` (FLAT_EXPORT_BODIES, gen_vtables.ts:~600) and return `0` (OK) or the "no Steam client" result; fill `pOutErrMsg` (SteamErrMsg is a 1024-byte buffer) on failure. [ASSUMED] enum values OK=0, FailedGeneric=1, NoSteamClient=2, VersionMismatch=3.
- `ESteamAPIInitResult SteamInternal_GameServer_Init_V2(uint32 ip, uint16 gamePort, uint16 queryPort, EServerMode mode, const char *version, const char *checkVersions, char *errMsg)`: failure stub (cdecl, `(void)`-style variadic-safe like `GAMESERVER_FLAT_STUBS`).
- Generator: add the five names to `MODERN_LOOKUP_FLAT_EXPORTS` and their bodies to the `Record` (the typed `Record` forces a body per name, gen_vtables.ts:653), they land in the x64 `.def` only; update `SHIM64_EXPORTED_SYMBOLS`. x86 stays unchanged unless a 32-bit title needs it (pin test `SHIM_EXPORTED_SYMBOLS` untouched). Spike 038 corrected the todo: Wine binds unresolved imports to stubs, so Engine.dll loads regardless; the exports matter at call time, after SteamStub passes.
- Scan gap: `scanSteamApiImports` reads one exe only. Add a bounded static-import closure: from the exe's `objdump --private-headers` output list every `DLL Name:` (new pure `parseImportedDllNames` in `importParse.ts`), and for each name that exists in the same directory, scan it for a `steam_api(64)` block (depth <= 2; Grim Dawn: exe -> Engine.dll). This is far cheaper than objdumping the whole tree. Merge symbols and arch; place the shim in the exe dir and in the importing DLL's dir if different. Bump nothing manually: `SHIM_EXPORT_SET_VERSION` is computed.

### Q8. See Validation Architecture.

## Common Pitfalls

### Pitfall 1: A forwarded `GetISteam*` that still answers locally
**What goes wrong:** Keeping the null-object fallback means the stub is handed a fake success for a version native never confirmed.
**How to avoid:** New emitter returns NULL on native-NULL or no local proxy; a test asserts the wire-marked lookup body contains no `g_x64_null_object_instance`.
**Warning signs:** helper log shows `native=NULL` but stub continues as if supported.

### Pitfall 2: zod strips the new verdict field
**What goes wrong:** `drmWrapper` persists in the store type but `bridgeScanVerdictSchema` (non-strict) drops it on `readBridgeVerdict`, so launch-time gating never sees it.
**How to avoid:** Add to both type and schema; a `bridgeVerdict.test.ts` round-trip test.

### Pitfall 3: Two shim instances, two connections
**What goes wrong:** The forwarder loads `compat\steam_api64.dll` while Engine.dll loaded `x64\steam_api64.dll`; the second socket blocks on the single-connection helper, or the cfg is missing.
**How to avoid:** by-name `GetModuleHandleW` first; cfg already written beside every `shimPaths` entry (bridgeConfig.ts).

### Pitfall 4: Dispatch hash drift
**What goes wrong:** Changing a manifest without regenerating leaves `BRIDGE_SHIM_TABLE_HASH != BRIDGE_DISPATCH_TABLE_HASH`.
**How to avoid:** run `pnpm gen-vtables` and commit all four generated files; existing pin tests catch it.

### Pitfall 5: Bool return width on arm64
**What goes wrong:** Flat `BReleaseSteamPipe`/`BShutdownIfAllPipesClosed` return C `bool`; dispatch types it `int` (`cType('bool')` = `int`, gen_vtables.ts:~395) and copies 4 bytes. The same path is already used by `BIsSubscribed` and proven live, so likely fine; mask to 1 byte for the new methods if the live log shows odd values. [ASSUMED]

### Pitfall 6: The helper idle timeout
The helper closes an idle persistent connection after 5 s (`SO_RCVTIMEO`), and the shim retries once on a fresh socket (`bridge_transact`, steam_api_shim.c:~340). Pipes/users created by forwarded calls live in the helper process, not the connection, so they survive reconnects. Do not hold per-connection state in the helper.

### Pitfall 7: `HKLM` side effects
Even a `reg add` of a parent key under HKLM diverts games into `steam.exe -applaunch` (spike 036). Only HKCU values.

### Pitfall 8: zig byproducts and bundle size
New DLL targets emit `.pdb`/`.lib` into `public/bin/<arch>/darwin`; extend the prune list or each ships (~2.8 MB measured for the shim, quick-260901-kl2).

### Pitfall 9: Conventions that apply to the plan text
Per `Skill("gamelib-conventions")`: any `<verify>` over `.ts/.c/.json` under `meta/`, `src/`, `native/` runs `npx prettier --check` on the exact paths (check `--file-info` first; `.planning/**` is ignored, so omit it there). Any in-repo spawn site goes through `createFakeHomeProfile()` (helper integration test pattern). The live-gate contract must be authored by a different plan than the one that runs it (live-gate-contract-authoring, decision D-E), with dual-sink append-and-archive capture of the `--cx-log` trace and `gamelib.log`.

## Code Examples

### Forwarder (hand-written, from spike 039, corrected resolution order)
```c
// Source: .planning/spikes/039-steamstub-forwarding-client/steamclient_fwd.c (+ research changes)
#include <windows.h>
typedef void *(*GBCI)(const char *, int *);
static GBCI resolve(void) {
  HMODULE h = GetModuleHandleW(L"steam_api64.dll");          // the instance the game already loaded
  if (!h) {
    HMODULE self; wchar_t p[MAX_PATH];
    if (GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                           (LPCWSTR)&resolve, &self)) {
      DWORD n = GetModuleFileNameW(self, p, MAX_PATH);
      while (n && p[n - 1] != L'\\') n--;
      p[n] = 0; wcscat(p, L"steam_api64.dll");
      h = LoadLibraryW(p);
    }
  }
  return h ? (GBCI)GetProcAddress(h, "GameLibBridge_CreateInterface") : NULL;
}
__declspec(dllexport) void *CreateInterface(const char *name, int *rc) {
  GBCI f = resolve(); int local = 1; void *r = f ? f(name, &local) : NULL;
  if (rc) *rc = r ? 0 : 1; return r;                         // answers nothing itself
}
```

### Registry argv builder (pure, testable)
```ts
// Shape only. HKCU only; value names from spike 036/038.
const KEY = 'HKCU\\Software\\Valve\\Steam\\ActiveProcess'
export function buildSteamClientRegistryCommands(p: { dll?: string; dll64?: string }): string[][] {
  const add = (v: string, t: string, d: string) => ['reg', 'add', KEY, '/v', v, '/t', t, '/d', d, '/f']
  return [
    ...(p.dll ? [add('SteamClientDll', 'REG_SZ', p.dll)] : []),
    ...(p.dll64 ? [add('SteamClientDll64', 'REG_SZ', p.dll64)] : []),
    add('Universe', 'REG_SZ', 'Public')
  ]
}
```

### PE section names (pure)
```ts
// Source: PE/COFF layout (Microsoft PE format spec); bound every read.
export function parsePeSectionNames(buf: Buffer): string[] {
  if (buf.length < 0x40 || buf.readUInt16LE(0) !== 0x5a4d) return []
  const pe = buf.readUInt32LE(0x3c)
  if (pe + 24 > buf.length || buf.readUInt32LE(pe) !== 0x4550) return []
  const n = Math.min(buf.readUInt16LE(pe + 6), 96)
  const table = pe + 24 + buf.readUInt16LE(pe + 20)
  const out: string[] = []
  for (let i = 0; i < n && table + (i + 1) * 40 <= buf.length; i++)
    out.push(buf.toString('latin1', table + i * 40, table + i * 40 + 8).replace(/\0+$/, ''))
  return out
}
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Local constants for `CreateSteamPipe`/`ConnectToGlobalUser` (`helperFallback`) | Real native handles via flat `SteamAPI_ISteamClient_*` | Needed for the stub to see the genuine client |
| Null object for unknown versions | Native-confirmed proxy or NULL | Keeps the boundary |
| Single-exe import scan | Static-import closure | Names Engine.dll's symbols |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `SteamInternal_CreateInterface(name)` in the installed dylib reaches steamclient's `CreateInterface` and returns NULL for unsupported names | Q2 | The acceptance probe gives wrong answers; fall back to treating `SteamClient()` success + a `GetISteam*` native probe as the signal |
| A2 | Returning NULL (not a null object) for unproxied versions is acceptable to the stub | Pattern 2 | Stub may then exit; discovered live and fixed by adding proxies |
| A3 | `.bind` marks SteamStub across variants | Q6 | Some wrapped titles missed, no wrong routing (detection is informational) |
| A4 | The stub does not need `ActiveProcess\pid` | Q5 | Stub exits again; needs a live PID, which touches stand-in questions (user decision) |
| A5 | x86 stub asks the same 017/014 pair | Q1 | 32-bit titles need more versions |
| A6 | `ESteamAPIInitResult` values and `SteamErrMsg` size | Q7 | Wrong init result for modern-SDK games; confirm against the pinned SDK header |
| A7 | Callback-pointer ISteamClient methods are not needed by the stub | Pattern 4 | Stub fails in an uncovered method; log would not show shim-local calls (Open Q 2) |
| A8 | Bool return width is safe for the new bool-returning flat calls | Pitfall 5 | Garbage truthiness; mask to 1 byte |

## Open Questions

1. **Does the stub read `ActiveProcess\pid` (or require a live process)?**
   - Known: 038 b1 opened the key with no values and fell back; p1/f1 had a responder-written `pid`.
   - Unclear: whether the missing pid alone changes the outcome.
   - Recommendation: first live run without `pid`; if the stub exits, bring the question to the user before adding any live-process writer, since it edges toward the Proton `steam.exe` stub pattern.
2. **How to see shim-local method calls (e.g. callback setters) the stub makes?**
   - Known: forwarded calls log helper-side; local ones leave no trace.
   - Recommendation: keep the set of local-only methods tiny (callback pointers only). If a gap shows, add a `CONTROL` "note" slot so the shim can tell the helper which local method was invoked (a log, not an answer). Decide only if needed.
3. **Notice shape for `.bind` titles.** Log-only vs `notify()` vs a new route reason with dialog and i18n. Recommend log plus one-time `notify()`; escalate only if the user wants a dialog.
4. **Gate the registry/forwarder on `drmWrapper === 'steamstub'` or always for bridge bottles?** Recommend gated.
5. **Scratch bottle `GameLibSpikeGD`** listed in the brief is not present in `~/Library/Application Support/CrossOver/Bottles` (only `GameLibSteamBridge-219990`). The plan must either recreate it by APFS clone or run the gate in the product bottle with a backup.
6. **x86 scope.** Grim Dawn done-when is x64; x86 forwarder/manifests can follow once x64 is live.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| zig | Forwarder + shim build | yes | 0.16.0 | `downloadZig` |
| clang | Helper build | yes | Apple clang 21.0.0 | none needed |
| Node | meta scripts, jest | yes | v22.23.4 | none |
| `/usr/bin/objdump` | Import scan, ad hoc `-h` | yes | Apple LLVM | pure-TS parser for sections |
| Native Mac Steam (libsteam_api.dylib, steamclient.dylib) | Helper, live gate | yes | arm64 + x86_64 slices; process running | none (live gate needs it signed in) |
| CrossOver | Live gate | yes | `/Applications/CrossOver.app` | none |
| Grim Dawn bottle | Live gate | yes | `GameLibSteamBridge-219990`, `steam_api.dll` at root present | scratch clone missing (Open Q 5) |

**Missing dependencies with no fallback:** none for build; live gate requires Steam signed in.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | jest 29 (`pnpm test`; projects under `src/` and `meta/__tests__`) |
| Config file | `jest.config.*`, `meta/jest.config.js` |
| Quick run command | `npx jest meta/__tests__/gen_vtables.test.ts src/backend/storeManagers/steam/bridge --silent` |
| Full suite command | `pnpm test:ci` |

### Phase Requirements -> Test Map
| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| SteamClient manifests forward (wire, `helperFlat`, no `helperFallback`, `helperInterface: "SteamClient"`) and `014` prefix equals `017` slots 0-28 | unit | `npx jest meta/__tests__/gen_vtables.test.ts` | exists; add cases |
| Forwarded `GetISteam*` body: wire call, no `g_x64_null_object_instance`, in-string version, presence decode | generator text pin | same | add |
| Dispatch presence encoding for pointer returns; hash parity shim vs dispatch | unit | same | add |
| Five `SteamInternal_*` in `steam_api64.def` only; `SHIM64_EXPORTED_SYMBOLS` pin both directions; `GameLibBridge_CreateInterface` in both defs | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts` | exists; update |
| New x64 vtable shape assembles | compile gate | `npx jest meta/__tests__/shimAbiGate.test.ts` (needs zig) | exists |
| Forwarder compile argv + prune list | unit | `npx jest meta/__tests__/buildSteamBridgeShims.test.ts` | exists; add |
| `parsePeSectionNames` (synthetic buffers: `.bind`, truncated, bad `e_lfanew`, >96 sections) | unit | `npx jest ...peSections.test.ts` | Wave 0 |
| `parseImportedDllNames` + closure picks Engine.dll; merged symbols/arch | unit | `npx jest ...importScan.test.ts` | exists; add fixtures in `__tests__/fixtures/objdumpImports.ts` |
| `drmWrapper` survives `readBridgeVerdict` round-trip | unit | `npx jest ...bridgeVerdict.test.ts` | exists; add |
| Registry argv: HKCU only, no HKLM, argv-form, Windows path derivation, containment rejection | unit | `npx jest ...steamClientSetup.test.ts` | Wave 0 |
| Helper compiles with FWD logging + CREATE_INTERFACE slot; unknown slot still `STATUS_ERR` | integration (darwin) | `npx jest ...helperIntegration.test.ts` | exists |
| Grim Dawn passes SteamStub, main menu, Mac Steam In-Game, no `steam://run` in `--cx-log` | live gate | manual, contract authored by a separate plan | n/a (live) |

### Sampling Rate
- **Per task commit:** quick run command above plus scoped `npx prettier --check` over the exact written paths (skip for `.planning/**`, ignored).
- **Per wave merge:** `pnpm gen-vtables` produces no diff, `pnpm test:ci`, `pnpm build-steam-bridge` compile gates pass.
- **Phase gate:** full suite green, then the live gate.

### What can only be discovered live
Which `ISteamClient` methods and which `GetISteam*` versions the stub requests after `CreateInterface`; whether `pid` is needed; whether the native client accepts 014/017 via `SteamInternal_CreateInterface`; whether a NULL for an un-proxied version is tolerated. Plan structure: build and ship forwarding with logging, run the gate once, read `gamelib.log` `FWD` lines, add proxies/policy rows for what was requested, re-run. Cap the iteration count in the plan, and have a different plan author the gate contract than the one that runs it. Use dual-sink append-and-archive capture (`tee -a`, per-launch delimiters, archive `gamelib.log` before it rotates).

### Wave 0 Gaps
- [ ] `peSections.test.ts`, `steamClientSetup.test.ts`: new files.
- [ ] Fixture for Engine.dll-style import chain in `__tests__/fixtures/objdumpImports.ts`.
- [ ] Possibly a generator test fixture for a pointer-presence wire method.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | The helper reuses the existing signed-in client; no new auth |
| V3 Session Management | no | Pipe/user handles are native-client state |
| V4 Access Control | yes | Helper stays loopback-only; identity-only mode must keep refusing app-scoped families (gen_vtables.ts:1804 gates) and must not widen to ISteamClient forwarding in a way that bypasses `g_bd_identity_only`. Decide: refuse forwarded ISteamClient `GetISteam*` for app-scoped families in identity-only mode |
| V5 Input Validation | yes | In-string cap 4096, frame cap 65536 (existing); numeric appId, `isContainedWithin`, argv-form spawn (no shell); PE parser bounds every read |
| V6 Cryptography | no | None added |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal when placing DLLs / registry paths | Tampering | Containment check against the bottle dir before copy and before building the registry value |
| Shell injection through registry value or path | Tampering | argv-form `runWineCommand` parts only |
| Malformed PE read | DoS | Bounded section parser, sized read |
| Helper log leaking identity | Info disclosure | Log method names, versions and present/NULL only; no SteamIDs or tokens (`logSecretGate` applies to src logs) |
| Forwarding releases the helper's own session | DoS | Never hand out the init pipe; watch the live log |

## Sources

### Primary (HIGH confidence)
- Repo code read this session: `meta/gen_vtables.ts` (L647-680, 773, 852-1000, 1577-1620, 1703-1960, 2134-2234), `meta/sdk/isteamclient017.manifest.json`, `meta/sdk/wire-policy.json`, `native/steam-bridge/helper/bridge_helper.c`, `native/steam-bridge/generated/steam_api_shim.c`, `src/backend/storeManagers/steam/bridge/*`, `games.ts` L1140-1215, 1530-1640, 2400-2830, `meta/buildSteamBridgeShims.ts`.
- Local machine: `nm -gU`/`strings` of the installed `libsteam_api.dylib` and `steamclient.dylib`; `objdump -h` of Grim Dawn's x64 exe (section list only); zig 0.16.0.
- Spikes 036, 038, 039 READMEs and evidence.

### Secondary (MEDIUM confidence)
- ValveSoftware/Proton `proton_9.0` `lsteamclient/winISteamClient.c` (SteamClient014 layout, handle passthrough) and `steamclient_main.c` (`CreateInterface` shape) via raw.githubusercontent.com.
- Detanup01/gbe_fork `dll/dll.cpp` for `SteamInternal_*` signatures only (an emulator; not a design source).

### Tertiary (LOW confidence)
- `.bind` as SteamStub's section name beyond Grim Dawn: community comments only.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all in-repo tooling, versions verified.
- Architecture: MEDIUM-HIGH - seams read in code; the native-acceptance probe and handle behaviour are unverified live.
- Pitfalls: MEDIUM - several are code-derived (zod strip, null object, single connection), the rest are flagged assumptions.

**Research date:** 2026-10-24
**Valid until:** 2026-11-07 (the installed Steam client updates `libsteam_api.dylib`; re-run the `nm`/`strings` checks at plan time)
