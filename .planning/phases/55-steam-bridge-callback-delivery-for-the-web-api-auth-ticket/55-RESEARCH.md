# Phase 55: Steam bridge callback delivery for the web-API auth ticket - Research

**Researched:** 2026-10-26
**Domain:** Win32 PE shim (zig/mingw, hand-built MSVC-ABI vtables) plus Mach-O helper (clang) bridging Steamworks callbacks over a loopback TCP wire
**Confidence:** HIGH on repo facts and the vtable measurement. MEDIUM on helper-side behaviour of the real Mac `libsteam_api.dylib` (exports verified, runtime behaviour only provable live).

## User Constraints (from CONTEXT.md)

No CONTEXT.md exists. The user chose to continue without discuss-phase. Per the orchestrator, **the roadmap goal is the locked scope**:

### Locked Decisions
- `ISteamUser::GetAuthTicketForWebApi(pchIdentity)` is forwarded to real Mac Steam through the helper.
- The helper captures `GetTicketForWebApiResponse_t` (callback 168) from its own callback pump and queues it.
- The shim records `SteamAPI_RegisterCallback` registrations. `SteamAPI_RunCallbacks` drains queued callbacks over a **new CONTROL slot** and dispatches them to the registered `CCallbackBase` objects.
- The MSVC vtable slot of `Run(void*)` is **measured** on x64 and x86, never assumed.
- Done when (live gate): Abiotic Factor (427410) reaches an interactive main menu and the game log shows an EOS Connect user login.
- Depends on Phase 53. Requirement IDs: none assigned (TBD). Success criteria are derived below.

### Claude's Discretion
Everything the roadmap does not pin: wire layout of the drain slot, queue sizing, polling cadence, helper pump mechanism, test seams, live-gate procedure details.

### Deferred Ideas (OUT OF SCOPE)
None recorded. Research-recommended scope exclusions are listed under "Scope boundaries" so the planner can confirm them.

## Project Constraints (from CLAUDE.md)

- Bridge "verified" is strict (memory `bridge-verified-criterion-is-strict`): HELLO plus a clean game-side Steam-init log. For UE titles, read `Saved/Logs`. In-Game never counts. Do **not** reroute to bottled Steam (memory `bottled-steam-is-narrow-fallback`; no DRM here).
- `tauri dev` does **not** rebuild the sidecar (memory). This phase edits only `meta/`, `native/` and `protocol.ts`; the shim is redeployed by `placeShimForGame` on byte mismatch. If any `src/backend` file changes, restart dev before a live test and compare `build/main/sidecar.js` mtime.
- Spawning a child process from `src/` or `meta/` (including jest tests that compile or run the helper or zig) must use `createFakeHomeProfile()` (`src/backend/testUtils/fakeHomeProfile.ts`), never a hand-rolled `env` literal.
- Every task `<verify>` block runs `npx prettier --check` over the exact paths written, never `.`. Run `npx prettier --file-info <path>` first. `native/steam-bridge/generated/*` may be prettier-ignored. If every path is ignored, say so and omit the check.
- Any new sidecar timer, socket or handle must be `unref()`'d. This phase should add none (the work is in the shim and helper, not the sidecar).
- UAT item shape: `### N.` at column 0, inline `expected:`, `result:` opening with a bare or bracketed status word.
- Todos in `.planning/todos/pending/` carry `severity:`, `platform:`, `ready:` in that order.
- Use `graphify query` first for codebase questions. Never read `GRAPH_REPORT.md` or `graph.json` whole. Run `graphify update .` after code changes.
- Do not raise upstream-Heroic deviation as a concern.
- Skills the planner should load: `spike-findings-gamelib` (reference `macos-steam-bridge.md`, and `live-gate-contract-authoring.md` for the gate), `gamelib-conventions`.

## Summary

Abiotic Factor's EOS user login runs through UE `GetLinkedAccountAuthToken` with token type WebAPI. That calls `ISteamUser::GetAuthTicketForWebApi` and waits for callback 168. Today the shim stubs the call (`vt_SteamUser023_GetAuthTicketForWebApi`, returns handle 0, `native/steam-bridge/generated/steam_api_shim.c:797-800`) and `SteamAPI_RunCallbacks` / `RegisterCallback` / `UnregisterCallback` / `RegisterCallResult` are empty (`steam_api_shim.c:22404-22420`). So 168 can never arrive. The game retries every ~10 s and the menu stays on "Loading". Evidence is in `.planning/debug/abiotic-factor-loading-hang.md` (shim trace at 10:30: game registers 168 at init, RunCallbacks runs on tid 444, the ticket request loop runs on tid 220).

The fix has three independent pieces, each small, all driven from the generator and the helper:

1. **Forward the call.** Pure data change: add `GetAuthTicketForWebApi` to `meta/sdk/wire-policy.json` and the manifest(s) as `mode: wire`, `helperFlat: SteamAPI_ISteamUser_GetAuthTicketForWebApi`, param `pchIdentity` kind `in-string`. This is the exact pattern 53-14 used for `GetAuthSessionTicket`, and `in-string` is already used by the UserStats entries. The real dylib exports the flat function (verified with `nm`).
2. **Helper captures callback 168.** The helper currently never dispatches callbacks except a 3x `RunCB()` warm-up inside WHOAMI (`bridge_helper.c:283-288, 484`), and registers no handler, so a pump alone would drop everything. Use the SDK's **manual dispatch** flat API (`SteamAPI_ManualDispatch_Init/RunFrame/GetNextCallback/FreeLastCallback` plus `SteamAPI_GetHSteamPipe`, all exported by the installed dylib). It returns `{iCallback, raw bytes}` with no C++ vtable authoring on the Mac side. Queue allowlisted callbacks (168 only) in a bounded ring. Serve them over a new `CONTROL_SLOT_DRAIN_CALLBACKS = 6`.
3. **Shim records registrations and dispatches.** `SteamAPI_RegisterCallback(pCallback, iCallback)` stores the pair and sets the object's registered flag and `m_iCallback`. `SteamAPI_RunCallbacks` drains over slot 6 (outside every shim lock) and calls `Run(void*)` on each matching object through the **measured** MSVC vtable slot.

**Measured vtable layout (this session, clang MS-ABI vtable dumper, pinned zig 0.16.0, x64 and x86 give identical indices):** index 0 = `Run(void*, bool, SteamAPICall_t)`, **index 1 = `Run(void*)`**, index 2 = `GetCallbackSizeBytes()`, index 3 = the virtual destructor that `CCallbackImpl` adds. This is the MSVC "overloads in reverse declaration order" quirk, so assuming the declaration order (slot 0 = `Run(void*)`) would be wrong. Object layout: x64 vptr at +0, `m_nCallbackFlags` at +8, `m_iCallback` at +12. x86 vptr at +0, flags at +4, `m_iCallback` at +8. Calling convention: x86 `__thiscall` (the shim's existing `THISCALL` macro), x64 plain.

**Primary recommendation:** Implement as three tasks in dependency order (generator+manifest forward; helper manual-dispatch queue + CONTROL slot 6 + protocol.ts; shim registry/dispatch with measured slots), with the vtable measurement itself pinned as a jest test that runs pinned zig against a fixture, so "measured, never assumed" is enforced in CI. Gate live on Abiotic with the dual-sink capture standard.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Forward `GetAuthTicketForWebApi(pchIdentity)` | Shim (Win32 PE, in bottle) | Helper (Mac) | Shim marshals the vtable call; helper calls real `SteamAPI_ISteamUser_GetAuthTicketForWebApi` |
| Receive callback 168 from Steam | Helper (Mac, owns the Steam connection) | — | Only the helper holds an HSteamPipe to Mac Steam |
| Queue and transport callback bytes | Helper queue | Wire protocol (CONTROL slot 6) | Pull model: shim polls, helper never pushes (single-threaded, single-client) |
| Registry of `CCallbackBase` objects | Shim | — | Objects live in the game process; only the shim sees them |
| Dispatch to game handlers | Shim, on the thread that called `RunCallbacks` | — | Matches real Steam semantics; game handlers expect the pumping thread |
| Slot/offset knowledge of MSVC `CCallbackBase` | Generator (`meta/gen_vtables.ts`) as named constants | jest measurement test | Single source of truth, verified against the compiler |
| Spawn/redeploy helper and shim | Sidecar (`helperProcess.ts`, `placeShimForGame`) | — | Unchanged by this phase |

## Where Everything Lives (file:line evidence)

| Piece | Location |
|-------|----------|
| Shim source (generated, 34767 lines) | `native/steam-bridge/generated/steam_api_shim.c`; generator `meta/gen_vtables.ts` (3806 lines). **Never hand-edit the .c**; regenerate with `pnpm gen-vtables` |
| Flat-export bodies for the callback family | `meta/gen_vtables.ts:866-873` (`SteamAPI_RunCallbacks: 'void SteamAPI_RunCallbacks(void) { }'`, Register/Unregister/RegisterCallResult/UnregisterCallResult); emitted at `steam_api_shim.c:22404-22420` |
| Other callback-ish no-ops (not in scope, see below) | `Steam_RunCallbacks` `meta/gen_vtables.ts:782` (x64 only); `SteamGameServer_RunCallbacks` `:664`; `SteamAPI_ManualDispatch_*` `LIFECYCLE_NOOP_SPECS` `:692-701` (GetNextCallback/GetAPICallResult return false) |
| Stub to replace | `steam_api_shim.c:797-800` `vt_SteamUser023_GetAuthTicketForWebApi(void *self, uint32_t dummy0) { return 0; }`; manifest `meta/sdk/isteamuser.manifest.json:292-304` (slot 14, `stackBytes 4`, param `pchIdentity` `const char*`, no `mode`) |
| Precedent for forwarding a method | 53-14: `meta/sdk/wire-policy.json` `SteamUser.GetAuthSessionTicket` block (lines 11-28), manifest `isteamuser.manifest.json:259-291` (`"mode": "wire"`, `"helperFlat"`). 53-14-SUMMARY lists files touched: `meta/gen_vtables.ts`, `meta/extractProtonInventory.ts`, `meta/sdk/wire-policy.json`, `meta/sdk/isteamuser.manifest.json`, `isteamuser021.manifest.json`, `bridge_dispatch.h`, `steam_api_shim.c`. Test precedent: `meta/__tests__/gen_vtables.test.ts:2575-2670` |
| `in-string` precedent | `wire-policy.json:125-160` (`pchName` kind `in-string`); wire doc `steam_api_shim.c:71-80`; cap `WIRE_IN_STRING_MAX_BYTES 4096` |
| Only manifest containing the method | `meta/sdk/isteamuser.manifest.json` (SteamUser023, ordinal 1). `grep GetAuthTicketForWebApi meta/sdk/*.json` matches no other file |
| Helper (Mac, clang, 819 lines) | `native/steam-bridge/helper/bridge_helper.c`; generated dispatch `native/steam-bridge/generated/bridge_dispatch.h` (7470 lines, `#include`d at `bridge_helper.c:125`) |
| CONTROL protocol | Helper: `bridge_helper.c:142-158` (`CONTROL_ORDINAL 0xffff`; slots HEALTH 0, WHOAMI 1, HELLO 2, CREATE_INTERFACE 3, REPORT_VERSION 4, REPORT_INIT 5), handler `dispatch_and_respond` `:465-606`. Shim: `steam_api_shim.c:43-60` (`BRIDGE_CONTROL_*` defines), callers `:366-386`. TS: `src/backend/storeManagers/steam/bridge/protocol.ts:96-114` (`CONTROL_SLOT`). **Next free slot = 6** |
| Wire frame | Request `[4B len][4B id][2B ordinal][2B slot][args]`, response `[4B len][4B id][1B status][ret]`; `MAX_FRAME_BYTES 65536`; helper bounds-checks before reading (`bridge_helper.c:654-661`) |
| SRWLOCK serialization (082ff80db) | `steam_api_shim.c:150-156` (`static SRWLOCK g_bridge_lock`), `bridge_transact` `:358-365`, `SteamAPI_Shutdown` takes it `:22410-22419`. **Non-recursive.** Comment says "nothing that holds it may call bridge_transact again" |
| THISCALL macro | `steam_api_shim.c:142-146` (`__attribute__((thiscall))` on `__i386__`, empty on x64). One generated .c compiles for both targets |
| Existing helper pump | `bridge_helper.c:283-288` `pump_callbacks()` (3x `RunCB()` + `usleep(50ms)`), called only from WHOAMI `:484`. `RunCB` dlsym'd `:310`. The helper registers **no** callback objects |
| Helper is single-threaded, one client | `main()` accept loop `:805-818`; `serve_connection` `:643-681`; `SO_RCVTIMEO` 5 s `:172, :813-816` closes idle connections; shim reconnects once (`bridge_transact_locked` `:343-356`) |
| Build | `meta/buildSteamBridgeShims.ts`: helper via `/usr/bin/clang`; shim x86 via `zig cc -target x86-windows-gnu`, x64 via the 64-bit equivalent; `SHIM_RELEASE_CFLAGS = ['-O2','-fno-sanitize=undefined']` (`:461`); non-zero exit or missing DLL fails the build (compile gates). Pinned zig 0.16.0 in `.build-tools/zig/zig` (`meta/downloadZig.ts:40`) |
| Helper integration test pattern | `src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts`: compiles the real `bridge_helper.c` with clang via `buildHelperCompileArgv()` under `createFakeHomeProfile()`, spawns it, drives raw CONTROL frames (examples: REPORT_INIT test `:699`, source-pin test `:820`) |
| Generator pin tests | `meta/__tests__/gen_vtables.test.ts` (256 tests across it plus `buildSteamBridgeShims.test.ts`, passed in 0.75 s this session). Tests pin literal flat bodies, e.g. `:2976 expect(c).toContain('void Steam_RunCallbacks(void) { }')`, `:266-306` for RunCallbacks/Register* exports |

## Standard Stack

No new external packages. Everything is repo-local C and TypeScript plus the already-pinned toolchain.

### Core
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| zig cc (pinned) | 0.16.0 `.build-tools/zig/zig` | Cross-compile PE shim (x86, x64) and run the vtable measurement | Already the project toolchain (`meta/downloadZig.ts`). Its bundled clang implements the MS C++ ABI vtable dumper `-fdump-vtable-layouts` [VERIFIED: ran it this session] |
| Apple clang | 21.0.0 (`/usr/bin/clang`) | Build the helper | Already used by `buildHelperCompileArgv()` |
| `libsteam_api.dylib` flat API | Installed Mac Steam, universal | `SteamAPI_ISteamUser_GetAuthTicketForWebApi`, `SteamAPI_ManualDispatch_*`, `SteamAPI_GetHSteamPipe` | `nm -gU` shows all present [VERIFIED: nm on `~/Library/Application Support/Steam/.../libsteam_api.dylib`, 2026-10-26] |
| jest 29 / ts-jest | repo | Unit and source-pin tests | Existing (`pnpm test`, `pnpm test:ci`) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Helper manual dispatch (`ManualDispatch_*`) | Helper registers a C-authored fake `CCallbackBase` (Itanium vtable on arm64) via the dylib's `SteamAPI_RegisterCallback`, then calls `RunCB` | Needs a hand-built Itanium vtable plus the dylib's registration semantics. More ABI surface and nothing in the repo to measure it against. Use only as fallback if manual dispatch misbehaves live (LOW confidence it is needed) |
| Pull (shim polls slot 6 from RunCallbacks) | Helper pushes over the socket | Helper is single-threaded and single-client; the shim's `recv` has no timeout and an unsolicited frame would desync the request/response pairing. Pull it is |
| Queue every callback | Allowlist {168} | Relaying unrelated callbacks (overlay, persona) changes behaviour of all 18 bridged titles. Allowlist keeps blast radius at titles that register 168 |

**Installation:** none. **Version verification:** no new registry packages are added, so the npm/PyPI slopcheck gate does not apply.

## Package Legitimacy Audit

No external packages are installed or recommended by this phase. Packages removed due to slopcheck [SLOP]: none. Packages flagged [SUS]: none.

## Architecture Patterns

### System Architecture Diagram

```
 Game (UE, MSVC, in CrossOver bottle)                 steam_api64.dll shim (zig, PE)                Helper (arm64 clang)            Mac Steam
 ------------------------------------                 -----------------------------                 --------------------            ---------
 init: CCallback<168> ctor
   -> SteamAPI_RegisterCallback(this,168) ---------->  registry[]  += {this,168}
                                                        this->flags |= 1; this->m_iCallback = 168
 thread A: SteamUser()->GetAuthTicketForWebApi(id)
   -> vt_SteamUser023 slot 14 (WIRE) ---------------->  bridge_transact(ord1,slot14,in-string) ->  bridge_dispatch ->
                                                        [g_bridge_lock held only for the trip]      SteamAPI_ISteamUser_GetAuthTicketForWebApi ----> issues request
   <-- HAuthTicket handle (real, nonzero) <------------                                             <------ handle
                                                                                                                                  ... async ...
 thread B: SteamAPI_RunCallbacks() (each tick)
   -> gate: any registered iCallback in allowlist? ->   throttle (>= N ms since last drain)
        no: return immediately (zero cost for other titles)
        yes: bridge_transact(CONTROL 0xffff, slot 6) --------------------->  DRAIN: ManualDispatch_RunFrame(pipe);
                                                                                    loop GetNextCallback / FreeLastCallback:
                                                                                      iCallback in allowlist -> ring push
                                                                                      else dropped
                                                                                    pop one -> [count][iCallback][cub][bytes] <---- GetTicketForWebApiResponse_t (168)
   <-- 0 or 1 messages (repeat while count==1, capped) <--
   [g_bridge_lock RELEASED before any game code runs]
   snapshot registry entries with iCallback==168 (registry lock, copy out)
   for each: re-check still registered; call vtbl[RUN1_SLOT](obj, bytes)   <-- game handler runs on thread B
 game: handler -> EOS Connect login with the web-API ticket -> LogEOS* user login line -> main menu
```

### Recommended Project Structure
```
meta/gen_vtables.ts                       # callback family bodies + named measured constants
meta/sdk/wire-policy.json                 # + SteamUser.GetAuthTicketForWebApi (wire, in-string)
meta/sdk/isteamuser.manifest.json         # + mode wire, helperFlat (SteamUser023 only)
native/steam-bridge/helper/bridge_helper.c            # CONTROL_SLOT_DRAIN_CALLBACKS=6, manual dispatch, wiring
native/steam-bridge/helper/gamelib_cbqueue.h          # NEW (recommended): ring + encode, host-testable
src/backend/storeManagers/steam/bridge/protocol.ts    # CONTROL_SLOT.drainCallbacks = 6
meta/__tests__/gen_vtables.test.ts                    # pins for forward + registry + constants
meta/__tests__/msvcCallbackBaseLayout.test.ts         # NEW: runs pinned zig dumper, asserts slots/offsets
src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts   # + slot 6 cases
src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts            # + slot 6 pin
```

### Pattern 1: Forward via manifest and wire-policy (53-14 precedent)
**What:** declare the method `wire`, name the flat symbol, mark the C string `in-string`.
**Example (shape to add to `isteamuser.manifest.json` slot 14 and mirror in `wire-policy.json`):**
```json
{
  "slot": 14,
  "name": "GetAuthTicketForWebApi",
  "returns": "uint32",
  "returnKind": "int32",
  "stackBytes": 4,
  "params": [{ "name": "pchIdentity", "type": "const char*", "kind": "in-string" }],
  "mode": "wire",
  "helperFlat": "SteamAPI_ISteamUser_GetAuthTicketForWebApi"
}
```
`wire-policy.json`: `"GetAuthTicketForWebApi": { "helperFlat": "SteamAPI_ISteamUser_GetAuthTicketForWebApi", "params": { "pchIdentity": { "kind": "in-string" } } }` under `SteamUser`. The flat prototype is `HAuthTicket SteamAPI_ISteamUser_GetAuthTicketForWebApi(ISteamUser* self, const char* pchIdentity)` [CITED: SteamworksSDK `steam_api_flat.h:75`]. A NULL identity packs `len=0xFFFFFFFF` and the helper passes NULL (documented in the wire doc, `steam_api_shim.c:71-80`). The manifests are produced or overlaid by `meta/extractProtonInventory.ts`, which fetches from the network at a pinned SHA; 53-14 touched manifests plus policy plus the extractor, so the planner must keep policy and manifest consistent (hand-edit both, or re-run `pnpm extract-proton-inventory --versions SteamUser023` and review the diff). Then `pnpm gen-vtables` regenerates the shim, `bridge_dispatch.h` and the table hash (`BRIDGE_SHIM_TABLE_HASH` / `BRIDGE_DISPATCH_TABLE_HASH`); do not hand-edit those.

### Pattern 2: Helper manual dispatch with a bounded allowlist queue
**What:** after `InitFlat` succeeds, call `SteamAPI_ManualDispatch_Init()` once, then on each DRAIN request do `RunFrame(pipe)`, loop `GetNextCallback`, copy allowlisted messages into a ring, always `FreeLastCallback`.
**SDK contract [CITED: SteamworksSDK `steam_api.h:206-225`]:** `Init` "must be called after SteamAPI_Init, but before you use any of the other manual dispatch functions"; if you use manual dispatch you "must NOT use SteamAPI_RunCallbacks"; after `GetNextCallback` returns true you MUST call `FreeLastCallback` before the next `GetNextCallback`.
**Consequences:** `pump_callbacks()` (3x `RunCB` + `usleep`) must be replaced by a manual pump that feeds the same ring (so WHOAMI cannot swallow 168), and the drain handler must not sleep (the shim blocks in `recv` with no timeout while holding `g_bridge_lock`).
```c
/* CallbackMsg_t, [CITED: steam_api_internal.h:192]. pack 4 on macOS/Linux, pack 8 on Windows;
 * field OFFSETS are 0,4,8,16 either way, only sizeof differs (20 vs 24). Use pack(4) in the helper. */
#pragma pack(push, 4)
typedef struct { int32_t m_hSteamUser; int32_t m_iCallback; uint8_t *m_pubParam; int32_t m_cubParam; } CallbackMsg_t;
#pragma pack(pop)
```
Pipe from `SteamAPI_GetHSteamPipe()` (exported). `GetTicketForWebApiResponse_t` [CITED: SteamworksSDK `isteamuser.h:426-434`]: `k_iCallback = k_iSteamUserCallbacks + 68` (= 168), then `HAuthTicket m_hAuthTicket; EResult m_eResult; int m_cubTicket; uint8 m_rgubTicket[2560];` = 4+4+4+2560 = **2572 bytes**, identical under pack 4 and pack 8 (no 64-bit members), so **no repack is needed for 168**. Any future relayed callback with a uint64 member does need a pack-4 to pack-8 repack (the skill reference's "repack pack(4)->pack(8)" warning); that is why the allowlist is a closed table.

Suggested drain wire (planner may adjust, keep it one message per round trip): request has no args; response blob `[u32 count (0|1)]` then if 1 `[i32 iCallback][u32 cub][cub bytes]`. Bound `cub <= 2572` helper-side and size the shim's `retbuf` to at least 2572+12; see Pitfall 3.

### Pattern 3: Shim registry plus out-of-lock dispatch
**What:** a fixed static table (e.g. 512 entries of `{void *cb; int iCallback}`) behind its **own** SRWLOCK (not `g_bridge_lock`). `RegisterCallback` and `UnregisterCallback` mutate it. `RunCallbacks` copies matching entries under the registry lock, releases it, re-validates each pointer is still registered immediately before the call, and invokes outside every lock. The game's handler may itself call `SteamAPI_Register/UnregisterCallback` or any Steam method (which takes `g_bridge_lock`); invoking while holding either non-recursive lock deadlocks.
**Register semantics (faithful to the real DLL):** set `*(uint8*)(obj+FLAGS_OFF) |= 0x01` and `*(int*)(obj+ICALLBACK_OFF) = iCallback`; `Unregister` clears bit 0. Evidence: `CCallbackImpl::~CCallbackImpl() { if (m_nCallbackFlags & k_ECallbackFlagsRegistered) SteamAPI_UnregisterCallback(this); }` [CITED: SteamworksSDK `steam_api_common.h:166`], and `CCallbackBase` members are `protected` with `friend class CCallbackMgr` (`:152`), i.e. the manager is what sets them. If the shim does not set the flag, the destructor never unregisters and the registry holds a dangling pointer, which is a crash on the next dispatch. Setting the flag is harmless even if the real DLL did not (the destructor then calls Unregister, which the shim handles). Preserve the existing gameserver bit (`|=`, never `=`). Skip entries whose flags have bit 0x02 (`k_ECallbackFlagsGameServer`): those belong to `SteamGameServer_RunCallbacks`, out of scope.
**Dispatch call (named constants emitted by the generator, values from the measurement):**
```c
#if defined(__i386__)
#define GL_CB_FLAGS_OFF 4
#define GL_CB_ICALLBACK_OFF 8
#else
#define GL_CB_FLAGS_OFF 8
#define GL_CB_ICALLBACK_OFF 12
#endif
#define GL_CB_VSLOT_RUN_1ARG 1   /* MEASURED: MSVC reverses the overload pair; slot 0 is Run(void*,bool,SteamAPICall_t) */
typedef void (THISCALL *gl_cb_run1_fn)(void *self, void *pvParam);
static void gl_cb_dispatch_one(void *cb, void *param) {
  void **vtbl = *(void ***)cb;
  ((gl_cb_run1_fn)vtbl[GL_CB_VSLOT_RUN_1ARG])(cb, param);
}
```
`CCallbackImpl::Run(void*,bool,SteamAPICall_t)` just forwards to `Run(void*)` and `CCallback::Run(void*)` is the real handler [CITED: `steam_api_common.h:171-172, 226`], so calling slot 1 is what the SDK's own manager does for plain callbacks.

### Anti-Patterns to Avoid
- **Assuming slot 0 = `Run(void*)`** (declaration order, and what the Itanium/GCC ABI gives). On MSVC it is slot 1. The roadmap forbids assuming; see the measurement test.
- **Dispatching while holding `g_bridge_lock` or the registry lock.** Deadlock on any re-entrant Steam call from the handler.
- **Reusing `pump_callbacks()`** (50 ms sleeps x3) in the drain path.
- **Pushing frames from the helper.** Breaks request/response pairing.
- **Logging ticket bytes.** The web-API ticket is a credential; log result code and size only (`meta/__tests__/logSecretGate.test.ts` exists as a gate for log secrets).
- **Polling the helper from every game's `RunCallbacks`.** Gate on "a registered callback is in the allowlist" so the other bridged titles see zero behaviour change.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Receiving Steam callbacks in the helper | A fake C++ `CCallbackBase` with a hand-made Itanium vtable | `SteamAPI_ManualDispatch_*` from the dylib | SDK-documented raw `{iCallback, bytes}` path; Steamworks.NET itself runs entirely on it |
| Knowing MSVC slot order | Reasoning from declaration order | `zig clang -cc1 -fdump-vtable-layouts` test (below) | The compiler is the measurement tool; encodes the reversed-overload rule |
| Forwarding a Steam method over the wire | New hand-written marshal code | Manifest `wire` + `in-string` + `pnpm gen-vtables` | Generator owns shim and dispatch table and their shared hash |
| Test-compile of the helper | Ad-hoc clang command | `buildHelperCompileArgv()` under `createFakeHomeProfile()` | Same argv the product build uses; isolation rule |
| Locking | Custom spinlocks | `SRWLOCK` (already in shim) | Consistent with 082ff80db |

**Key insight:** Every moving part already has a generator or precedent. The only genuinely new low-level facts are the three MSVC constants (slot 1, flags offset, `m_iCallback` offset), and those are mechanically measurable.

## Runtime State Inventory

This is not a rename or migration phase. Omitted deliberately. One live-state note: a helper process from a previous launch is per-appId and long-lived until its game exits; a **stale old-binary helper** answers slot 6 with `STATUS_ERR` ("unknown control slot", `bridge_helper.c:604`), so the shim must treat a non-OK drain as "no callbacks" and never crash. Before the live gate, confirm no `steam-bridge-helper` is running (`pgrep -fl steam-bridge-helper` was empty at research time).

## Common Pitfalls

### Pitfall 1: Wrong vtable slot
**What goes wrong:** Calling slot 0 invokes `Run(void*, bool, SteamAPICall_t)` with garbage `bIOFailure`/`hSteamAPICall`. Harmless for `CCallbackImpl` (it forwards) but wrong for `CCallResult`, and a different-SDK object could crash.
**Why:** MSVC lays out overloaded virtuals grouped and in reverse declaration order [CITED: GCC bug 53398 "In opposite msc reverts them"; D bug 11802; LLVM MS-ABI vtable code]. **Measured:** index 0 = 3-arg Run, index 1 = 1-arg Run, 2 = GetCallbackSizeBytes, 3 = virtual dtor (x64 and x86, `CCallbackBase` / `CCallbackImpl<4>` / `CCallback<Obj,P>` hierarchies, zig 0.16.0 clang).
**Avoid:** generator constants plus the measurement test. **Warning sign:** handler never fires although the registry holds the object, or `RunCallbacks` crashes.
**Honest limit:** the measurement is clang's emulation of the MSVC ABI, corroborated by the three external sources, not a disassembly of a real MSVC-built game. The live gate is the independent confirmation. Optional extra check: disassemble Abiotic's `CCallbackImpl` vtable to confirm (not required).

### Pitfall 2: Deadlock from non-recursive `g_bridge_lock`
Dispatch must happen after `bridge_transact` returns and with no shim lock held. A handler that calls `GetAuthSessionTicket` or `GetSteamID` re-enters `bridge_transact`. Test it: a unit with a fake callback that calls Register/Unregister and a bridge call from inside `Run`.

### Pitfall 3: `retLen > retBufCap` desyncs the stream
`bridge_transact_once` returns 0 **without reading the body** when the response is larger than the caller's buffer (`steam_api_shim.c:340-342`), leaving unread bytes on the socket and corrupting the next frame. The drain `retbuf` must be at least the helper's maximum drain response (2572 + framing), and the helper must cap what it sends.

### Pitfall 4: The retry-on-transport-failure resends a destructive request
`bridge_transact_locked` resends the whole request once after a transport failure. If the helper already popped a message and the response was lost, 168 is lost. Acceptable here (UE re-requests every ~10 s per the debug evidence), but document it; do not add ack complexity unless a live run shows loss.

### Pitfall 5: Idle-connection timeout and polling cost
The helper closes any connection idle 5 s (`bridge_helper.c:172, 813-816`); the shim reconnects. UE calls `RunCallbacks` every tick. One loopback round trip measured 0-2 ms in the trace. **Recommendation:** gate (a) on "some registered `iCallback` is in the allowlist" and throttle (b) to at most one drain per ~30 ms using `GetTickCount64`. Ticket latency is not time-critical. Planner chooses the constant; keep it a named define.

### Pitfall 6: `ManualDispatch_Init` is one-way
After it, the helper must never call `SteamAPI_RunCallbacks` (SDK contract). Remove or rewrite `pump_callbacks()`, and keep `RunCB` unused. If the helper's init fails (`g_inited == 0`), DRAIN answers `STATUS_OK` with count 0 (testable without Steam).

### Pitfall 7: Struct packing differences
168 is pack-agnostic (all 4-byte members). `CallbackMsg_t` has pointer plus ints: declare it `#pragma pack(push,4)` in the helper. Do not generalize the queue to arbitrary callbacks without a repack step.

### Pitfall 8: Stale diagnostic Engine.ini, and the live gate needs verbose EOS logging
The debug notes say a verbose-logging `Engine.ini` was left in the bottle for verification. **It is not there now** (checked 2026-10-26: `.../AbioticFactor/Saved/Config/Windows/` holds only `GameUserSettings.ini` and `Settings.ini`). The gate must (re)create it, or else the "EOS Connect user login" line may not be logged at the default verbosity. Content from the debug file: `[Core.Log]` with `LogEOSSDK`, `LogEOS`, `LogEOSSubsystem`, `LogOnline`, `LogOnlineIdentity`, `LogOnlineSession`, `LogHttp` set to `Verbose`. The exact login line text is **unknown until observed**; see Open Questions.

### Pitfall 9: Version skew between shim and helper
New shim plus old helper: slot 6 returns `STATUS_ERR`, shim treats as no callbacks. Old shim plus new helper: unused slot. Both directions must be harmless. The helper binary and the shim are both rebuilt by `pnpm build-steam-bridge` into `public/bin/arm64/darwin/`; the sidecar redeploys the shim on byte mismatch.

### Pitfall 10: Old SDK and legacy callback exports
x64 has `Steam_RunCallbacks` / `Steam_RegisterInterfaceFuncs` (`meta/gen_vtables.ts:782`) for old-SDK titles. Decide explicitly (see scope) rather than leave an inconsistent half-state.

## Code Examples

### MSVC vtable measurement, to be turned into a jest test
```bash
# Source: run this session with the repo-pinned zig 0.16.0 (.build-tools/zig/zig); output identical for both triples.
zig clang -cc1 -triple x86_64-pc-windows-msvc -fdump-vtable-layouts -fms-extensions -fms-compatibility -std=c++14 cb2.cpp -emit-llvm-only
#   VFTable indices for 'CCallbackBase' ...
#      0 | void CCallbackBase::Run(void *, bool, SteamAPICall_t)
#      1 | void CCallbackBase::Run(void *)
#      2 | int CCallbackBase::GetCallbackSizeBytes()
#      3 | CCallbackImpl<4>::~CCallbackImpl() [scalar deleting]
zig clang -cc1 -triple i686-pc-windows-msvc ... -fdump-record-layouts-simple ...
#   CCallbackBase FieldOffsets (bits): x64 [64, 96] => flags +8, m_iCallback +12 ; x86 [32, 64] => flags +4, m_iCallback +8
```
The fixture (`cb2.cpp`) reproduces the SDK's `CCallbackBase` (two pure `Run` overloads then pure `GetCallbackSizeBytes`, `protected uint8 m_nCallbackFlags; int m_iCallback`, **no** virtual destructor in the base), `CCallbackImpl<N>` (protected base, virtual dtor, forwarding `Run`), and `CCallback<T,P>`. I rebuilt it from the SDK text fetched this session; the planner should commit it under `meta/__tests__/fixtures/` and have the jest test spawn the pinned zig (guarded: skip with an explicit reason if `.build-tools/zig/zig` is absent, like the darwin-only helper test) under `createFakeHomeProfile()`, then assert the printed indices and offsets equal the generator's constants.

### Helper drain handler skeleton (non-blocking)
```c
/* Source: pattern from bridge_helper.c REPORT_INIT handler :571-603 (bounds, closed table, status codes). */
if (slot == CONTROL_SLOT_DRAIN_CALLBACKS) {
  uint8_t out[4 + 4 + 4 + GL_CB_MAX_PARAM];          /* count + iCallback + cub + bytes */
  uint32_t n = 0;
  if (g_inited) { gl_manual_pump_into_ring(); n = gl_ring_pop_encode(out, sizeof out); }
  else { uint32_t zero = 0; memcpy(out, &zero, 4); n = 4; }
  send_response(fd, requestId, STATUS_OK, out, n);   /* never sleeps; never logs ticket bytes */
  return;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `SteamAPI_RunCallbacks` + `CCallback` objects | Manual dispatch (`SteamAPI_ManualDispatch_*`) | SDK 1.4x onward; Steamworks.NET `CallbackDispatcher.RunFrame` uses it exclusively | Unity/Steamworks.NET titles never call `RunCallbacks` and never register `CCallbackBase`; they hit the `ManualDispatch_*` no-ops (answer false). This phase does not fix them |
| `GetAuthSessionTicket` (returns bytes synchronously) | `GetAuthTicketForWebApi` (handle now, bytes in callback 168) | SDK 1.57+ (the shim's SteamUser023) | Requires callback delivery, which is exactly this phase |

## Scope boundaries (research recommendation; planner to confirm)

- **Manual-dispatch consumers (Steamworks.NET / Unity games): explicitly OUT OF SCOPE.** Abiotic's trace shows `RegisterCallback`/`RunCallbacks`, not manual dispatch. Steamworks.NET's `RunFrame` uses `ManualDispatch_RunFrame/GetNextCallback` and never `SteamAPI_RunCallbacks` [CITED: Steamworks.NET `CallbackDispatcher.cs`]. The shim's `SteamAPI_ManualDispatch_*` are no-ops that answer false (`meta/gen_vtables.ts:692-701`, 53 decision). The drain slot payload (`iCallback` + raw bytes) is deliberately the shape `GetNextCallback` would need, so a later phase can implement it from the same queue. I did not find, in the repo, per-title data saying which target games import `ManualDispatch_*` (the census fixtures only list the names); treat that as unmeasured, not as "none".
- **Call results (`SteamAPI_RegisterCallResult`, `SteamAPICallCompleted_t` 703): OUT OF SCOPE.** 168 is a plain callback, not a call result. Leave `RegisterCallResult` / `UnregisterCallResult` as no-ops.
- **`SteamGameServer_RunCallbacks`, `Steam_RunCallbacks` (old-SDK x64):** OUT OF SCOPE; leave as-is (state it in the plan).
- **Other callback IDs** (the 20 the game registered: 1202, 1203, 101, 103, 102, 115, 168, 143, 337, 333, 504, 506, 505, 1101, 1102, 1108, 331, 704, 336, 304): the shim records all registrations (needed for correct flag handling), the helper allowlists **only 168**.

## Threading model

- `RunCallbacks` runs on the OSS Steam thread (tid 444 in the trace), the ticket request on another (tid 220). Dispatch must run on the thread that called `RunCallbacks`, which falls out of Pattern 3. Multiple concurrent `RunCallbacks` callers are legal in the real SDK; here each one's drain is serialized by `g_bridge_lock` and gets distinct messages.
- The registry lock must be separate from `g_bridge_lock`. Lock order if both are ever needed: never hold registry lock across `bridge_transact`.
- The helper stays single-threaded; all queue work happens on its serve thread.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The real `libsteam_api.dylib` `CCallbackMgr` sets `m_iCallback` and the registered flag inside `SteamAPI_RegisterCallback` (inferred from `friend class CCallbackMgr`, protected members, and the dtor check; the SDK header does not show the registration body) | Pattern 3 | Low: setting them in the shim is safe either way (idempotent) |
| A2 | Mac Steam's manual dispatch returns callback 168 for a ticket requested by the helper's own `ISteamUser` with the helper's HSteamUser, and `m_hAuthTicket` equals the handle returned to the game | Pattern 2 | Medium: if 168 does not appear, fall back to the fake-`CCallbackBase` helper approach (LOW confidence design, unverified). Provable only live or with a one-off helper log |
| A3 | UE's EOS Connect login proceeds once 168 arrives with the same handle (no further missing callbacks such as 163/other, no overlay requirement) | Summary | Medium: a second blocker would surface only live; the gate wording must allow recording "next blocker" without calling the phase failed on this mechanism |
| A4 | Identity string UE passes is short (typically `epiconlineservices`); not captured in this repo's evidence | Pattern 1 | Low: `in-string` caps at 4096 |
| A5 | MSVC (real) matches clang's MS-ABI vtable emulation for this hierarchy | Pitfall 1 | Low-Medium: three external sources agree on reverse order; live gate is the final check |
| A6 | A 30 ms drain throttle is adequate for EOS login latency | Pitfall 5 | Low: tunable constant |

## Open Questions

1. **What exactly is the "EOS Connect user login" log line?**
   - Known: today's verbose run shows EOS platform boot, SDKConfig, and a client-credentials `EOSAuth TokenGrant`/`ConnectClientAuthTask Success` with **no** user login line (`abiotic-factor-loading-hang.md`, 10:25 run). The current Saved log (88 KB) has only `LogOnlineIdentity: STEAM: Obtained steam authticket` and an EOSAuth overlay warning at default verbosity.
   - Unclear: the literal text to grep.
   - Recommendation: the gate's pass condition should be defined by presence of any `LogEOS*Connect*` (login/`EOS_Connect_Login`/`ConnectLogin`) success line that is absent in the pre-fix baseline logs (`AbioticFactor-backup-2026.10.24-23.53.33.log`, `AbioticFactor.log` of 10:31), plus the interactive menu confirmed by the operator. The first live run should record the observed literal, then the UAT item pins it. Also require, as a precondition, that the `Engine.ini` is recreated (Pitfall 8).
2. **Does the helper need to call `ManualDispatch_RunFrame` on every request, or only on DRAIN?** Recommendation: only on DRAIN (Steam queues callbacks per pipe until pumped). Revisit only if a live run shows the queue overflowing for a game that never polls.
3. **Throttle value and registry size** are planner choices (suggested 30 ms; 512 entries; helper ring of 8 x 2572 B).
4. **Re-run the extractor or hand-edit the manifests?** Either is acceptable; the 53-14 plan did both policy and manifest. Confirm `gen_vtables.test.ts` still passes (it pins hashes by recomputation, not literals; `grep` found no test pinning `5505719d7a6f`).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| zig (pinned) | Shim build, vtable measurement test | yes | 0.16.0 at `.build-tools/zig/zig` (also Homebrew 0.17.0 on PATH, not the pinned one) | `meta/downloadZig.ts` re-downloads |
| Apple clang | Helper build, host-side unit tests | yes | 21.0.0 | — |
| Node / pnpm | Everything | yes | v22.23.4 / 10.28.0 | — |
| Mac Steam + `libsteam_api.dylib` | Helper runtime, live gate | yes, running and signed in | exports verified | — |
| CrossOver.app | Live gate, optional Wine PE harness | yes | `/Applications/CrossOver.app` | — |
| Bottle `GameLibSteamBridge-427410` with Abiotic installed | Live gate | yes | `.../Bottles/GameLibSteamBridge-427410`, `gamelib_bridge.cfg` present beside the game | — |
| Running `gamelib-shell` dev instance | Live gate | yes, PID 5294 at research time | — | Live-gate rule: assert exactly one instance before each launch |
| Running `steam-bridge-helper` | — | none running | — | — |

**Missing with no fallback:** none. **Note:** built artifacts currently in `public/bin/arm64/darwin/` (helper, `steam_api.dll` 284672, `steam_api64.dll` 499200, 10:34 today) predate this phase; rebuild with `pnpm gen-vtables && pnpm build-steam-bridge`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | jest 29.7 + ts-jest |
| Config file | `jest.config.js` |
| Quick run command | `npx jest meta/__tests__/gen_vtables.test.ts meta/__tests__/buildSteamBridgeShims.test.ts --silent` (0.75 s, 256 tests, green at research time) |
| Full suite command | `pnpm test:ci` |
| Bridge-area run | `npx jest src/backend/storeManagers/steam/bridge meta/__tests__/gen_vtables.test.ts --silent` |
| Build gate | `pnpm gen-vtables && pnpm build-steam-bridge` (x86, x64 and steamclient64 compile gates; non-zero exit fails) |

### Phase success criteria (derived; no requirement IDs assigned) → test map
| ID | Behavior | Test Type | Automated Command | File Exists? |
|----|----------|-----------|-------------------|-------------|
| P55-1 | `GetAuthTicketForWebApi` is `wire` in SteamUser023 with `in-string` `pchIdentity` and `helperFlat SteamAPI_ISteamUser_GetAuthTicketForWebApi`; shim stub body gone; dispatch header contains the case | unit (source pin) | `npx jest meta/__tests__/gen_vtables.test.ts -t "GetAuthTicketForWebApi"` | Wave 0 (new describe, modelled on `:2575`) |
| P55-2 | MSVC `CCallbackBase` slots and offsets measured on x64 and x86 equal the generator constants (Run1 = 1, flags/iCallback offsets) | unit (spawns pinned zig) | `npx jest meta/__tests__/msvcCallbackBaseLayout.test.ts` | Wave 0 |
| P55-3 | Shim records registrations, sets flag and `m_iCallback`, clears on unregister, dispatches matching `iCallback` only, skips gameserver-flagged, tolerates handler that re-registers/unregisters/bridge-calls, no lock held during `Run` | unit: either host-compile an extracted portable core with a fake MSVC-layout object, or source-pin the generated text | `npx jest meta/__tests__/gen_vtables.test.ts -t "callback registry"` (and host-compile test if adopted) | Wave 0 |
| P55-4 | Drain slot 6 declared in helper, shim and `protocol.ts` with equal values | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts` | exists; extend |
| P55-5 | Helper: DRAIN answers `STATUS_OK` count 0 when not inited; never sleeps; ring bounded; allowlist {168}; oversize cub dropped; `CallbackMsg_t` offsets asserted; no ticket bytes logged | integration (real clang build, fake HOME, raw frames) plus host unit of `gamelib_cbqueue.h` | `npx jest src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts -t "DRAIN"` | exists; extend (darwin only, skipped elsewhere) |
| P55-6 | Version skew: old helper answers unknown slot with `STATUS_ERR` (already tested at `helperIntegration.test.ts:357`), shim treats as empty | source pin | gen_vtables test on drain call site | Wave 0 |
| P55-7 | Both PE targets compile and link with the new code | build gate | `pnpm gen-vtables && pnpm build-steam-bridge` then check `public/bin/arm64/darwin/steam_api.dll` and `steam_api64.dll` mtimes | exists |
| P55-8 | Regeneration is idempotent and committed (no drift) | CI-style | `pnpm gen-vtables && git diff --exit-code native/steam-bridge/generated meta/sdk` | exists |
| P55-9 (optional, strongly recommended) | PE harness in the bottle: build with zig for x64 and x86 a tiny exe that hand-builds an MSVC-layout callback object (vtable order from the measured constants), registers 168, and calls `RunCallbacks` against a helper with the ring pre-seeded (needs a test seam) or against live Steam | manual-semi-automated via CrossOver (`.planning/spikes/006-cpp-vtable-abi/run.sh` is the template) | `CX_BOTTLE=GameLibSteam /Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine "C:\harness.exe"` | Wave 0 / planner discretion |
| P55-LIVE | Abiotic Factor 427410: HELLO for 427410; `CALL SteamUser023.GetAuthTicketForWebApi` in `gamelib.log`; helper logs a ticket-callback-queued line (result and size only); game log shows EOS Connect user login; operator confirms interactive main menu | live gate (human) | see procedure below | n/a |

### Sampling Rate
- **Per task commit:** the quick run command above plus the task's own jest `-t`, plus `npx prettier --check <exact paths>` (check `--file-info` first; `native/steam-bridge/generated/*` may be ignored, in which case say so and omit).
- **Per wave merge:** bridge-area run plus `pnpm gen-vtables && pnpm build-steam-bridge`.
- **Phase gate:** `pnpm test:ci` green, then the live gate. A green suite never closes the live gate (`live-gate-contract-authoring.md` Section 4(ii)).

### Wave 0 Gaps
- [ ] `meta/__tests__/msvcCallbackBaseLayout.test.ts` and `meta/__tests__/fixtures/` CCallbackBase fixture (P55-2)
- [ ] New describe blocks in `meta/__tests__/gen_vtables.test.ts` (P55-1, P55-3, P55-6)
- [ ] Extend `protocol.test.ts` and `helperIntegration.test.ts` (P55-4, P55-5)
- [ ] Optionally `native/steam-bridge/helper/gamelib_cbqueue.h` plus a host-compile test (P55-5), and the Wine PE harness (P55-9)
- [ ] Re-create the bottle `Engine.ini` as a **gate precondition step**, not a committed artifact (Pitfall 8)

### Live gate procedure (Abiotic Factor 427410)

Authoring rules from `live-gate-contract-authoring.md`: the plan that authors the gate may not run it; the plan must include a Structural Reachability Review table (item, surface, ask, verdict, evidence) over all seven tests; use the dual-sink capture standard.

Sinks and paths (verified this session):
- **Game log:** `~/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-427410/drive_c/users/crossover/AppData/Local/AbioticFactor/Saved/Logs/AbioticFactor.log` (older sessions rotate to `AbioticFactor-backup-*.log` beside it; the census reads the stale backups, a known defect, so read only the current file).
- **Helper stderr and sidecar logs:** `~/Library/Logs/GameLib/gamelib.log` (helper lines appear as `[WARNING]: [Steam]: bridge helper [427410]: [ts] HELLO|CALL|...`). Sidecar-emitted lines never reach the terminal transcript (Test 3 sink clause), so do not demand helper lines from `terminal.log`. Archive `gamelib.log` per launch before the next launch renames it to `.old` (`log_writer.ts:72-74`).
- **Shim-side evidence (optional):** the saved diagnostic patch `.planning/debug/abiotic-factor-loading-hang.trace.patch` writes `gamelib_bridge_trace.log` beside the DLL, includes the local-stub trace, and breaks one `gen_vtables.test.ts` pin; it is for diagnosis only and must not be committed. Prefer new helper-side log lines (`gamelib.log` is a captured sink) for gate evidence.
- **Dev app:** `gamelib-shell` was already running. Assert exactly one instance (`pgrep -f 'target/debug/gamelib-shell'`) before each launch. Editing only `meta/`, `native/`, `protocol.ts` needs no sidecar restart; if `src/backend` TypeScript changes, restart `tauri dev` and compare `build/main/sidecar.js` mtime (memory `tauri-dev-does-not-rebuild-sidecar`).

Steps: (1) preconditions: no running `steam-bridge-helper`, Mac Steam signed in, `pnpm gen-vtables && pnpm build-steam-bridge` done, recreate `Engine.ini`, record the baseline log counts; (2) launch 427410 from GameLib; (3) expect in `gamelib.log`: `HELLO shim attached appid=427410`, `CALL SteamUser023.GetAuthTicketForWebApi`, and the new helper line for the queued 168 (result code and size, no bytes); (4) expect in `AbioticFactor.log`: an EOS Connect user login line absent from baseline (see Open Question 1) and **no** repeating pair of `Obtained steam authticket` lines 10 s apart; (5) operator confirms the interactive main menu (the only judgement a log cannot make). Strict-verified rule applies: HELLO plus clean game-side log; In-Game never counts. Record the shim size equals the built `steam_api64.dll` size.

## Security Domain

`security_enforcement` is not disabled in `.planning/config.json`, so included.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (no new login flow) | — |
| V3 Session Management | no | — |
| V4 Access Control | yes (loopback boundary) | helper binds `INADDR_LOOPBACK` only (existing T-51-01); unchanged |
| V5 Input Validation | yes | Frame length cap `MAX_FRAME_BYTES`, `in-string` cap 4096, drain response size cap, registry capacity bound, allowlist of `iCallback`, `cub <= 2572` |
| V6 Cryptography | no | The ticket is opaque bytes from Steam; never parsed, hashed or logged |
| V8 Data Protection | yes | Web-API ticket is a credential: never log bytes, never write to disk, keep only in the bounded in-memory ring, overwrite on pop |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Another local process connects to the helper port and drains the ticket | Information disclosure | Existing mitigation is loopback-only plus an OS-assigned port written to a per-game cfg; this phase adds a queue of a credential, so keep the ring tiny and drop-oldest, and note the port is not authenticated (pre-existing posture, flag in the plan rather than redesign) |
| Oversized or malformed drain response overruns shim buffer | Tampering / DoS | Helper caps `cub`; shim `retbuf >= max` (Pitfall 3) |
| Dangling `CCallbackBase*` after game frees it | Tampering / crash | Set registered flag so the SDK dtor unregisters; re-validate membership right before each call; clear registry on `SteamAPI_Shutdown` |
| Log injection or secret leakage via new helper log line | Information disclosure | Log only integers (`result`, `cub`) from a closed format; `logSecretGate` test |
| Registry flood | DoS | Fixed capacity, ignore overflow, log once |

## Sources

### Primary (HIGH confidence)
- Repo files read this session with line evidence: `bridge_helper.c` (whole), `steam_api_shim.c` (header, locks, transact, vtable slot 13/14, flat exports), `meta/gen_vtables.ts` (flat bodies, no-op specs, flat export doc), `meta/sdk/isteamuser.manifest.json`, `wire-policy.json`, `protocol.ts`, `buildSteamBridgeShims.ts`, `helperIntegration.test.ts`, the debug file and trace patch, the originating todo, 53-14/53-UAT excerpts, the spike skill references.
- Measurements run this session: `zig clang -cc1 -fdump-vtable-layouts` / `-fdump-record-layouts-simple` for `x86_64-pc-windows-msvc` and `i686-pc-windows-msvc` with zig 0.16.0 (pinned) and 0.17.0; `nm -gU` of the installed `libsteam_api.dylib`.
- Steamworks SDK headers (GitHub mirror `rlabrecque/SteamworksSDK`, fetched and grepped locally): `steam_api_common.h` (CCallbackBase/CCallbackImpl/CCallResult/CCallback, lines 138-230), `isteamuser.h:426-434` (`GetTicketForWebApiResponse_t`), `steam_api.h:160-225` and `steam_api_internal.h:192` (manual dispatch, `CallbackMsg_t`), `steam_api_flat.h:75`, `steamclientpublic.h:1146-1163` (pack macros). Official doc: Valve ISteamUser page says the ticket arrives in `GetTicketForWebApiResponse_t` and the call returns `k_HAuthTicketInvalid` on failure (via search snippet; `partner.steamgames.com/doc/api/ISteamUser`).
- Steamworks.NET `CallbackDispatcher.cs` (raw.githubusercontent.com/rlabrecque/Steamworks.NET): `RunFrame` uses manual dispatch only.

### Secondary (MEDIUM confidence)
- GCC bug 53398 (https://gcc.gnu.org/pipermail/gcc-bugs/2012-May/412454.html): "In opposite msc reverts them". D bug 11802 (https://issues.dlang.org/bugs/11802/, fetch failed, relied on search summary) and the LLVM MS-ABI vtable test log, both stating MSVC groups overloads and reverses their order.

### Tertiary (LOW confidence)
- Fake-`CCallbackBase` fallback design for the helper (not tested). Unreal forum thread on `GetAuthTicketForWebApi` invalid-handle check (search snippet only).

## Metadata

**Confidence breakdown:**
- Standard stack / where things live: HIGH. Read directly, all file:line cited.
- Architecture (pull queue, manual dispatch, out-of-lock dispatch): MEDIUM-HIGH. Manual dispatch contract is SDK-documented and exports verified, but delivery of 168 to a helper-owned pipe is only provable live.
- MSVC slot and offsets: HIGH for the compiler measurement and external corroboration, with the live gate as independent confirmation.
- Pitfalls: HIGH (drawn from this repo's code paths).

**Research date:** 2026-10-26
**Valid until:** 2026-11-25 (stable code; the Mac Steam dylib can change with any Steam update, re-run `nm` on the dylib if the gate is delayed).
