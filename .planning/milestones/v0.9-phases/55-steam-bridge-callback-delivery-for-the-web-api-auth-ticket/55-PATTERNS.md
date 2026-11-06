# Phase 55: Steam bridge callback delivery for the web-API auth ticket - Pattern Map

**Mapped:** 2026-10-26
**Files analyzed:** 13 (11 modified, 2 new + 1 optional new)
**Analogs found:** 13 / 13 (one partial: the shim registry has no in-repo structural analog beyond the lock/transact pattern)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `meta/sdk/wire-policy.json` (+ `SteamUser.GetAuthTicketForWebApi`) | config | request-response | same file, `GetAuthSessionTicket` block (53-14) lines 11-28; `in-string` at ~125-160 | exact |
| `meta/sdk/isteamuser.manifest.json` (slot 14) | config | request-response | same file slot 13 lines 259-291 | exact |
| `meta/gen_vtables.ts` (callback-family bodies + `GL_CB_*` constants) | generator | transform | same file `FLAT_EXPORT_BODIES` lines ~855-873 (`SteamAPI_Shutdown` body is the lock-using precedent) | exact |
| `native/steam-bridge/generated/steam_api_shim.c` (GENERATED, never hand-edit) | shim (generated) | request-response + event-driven | own `bridge_transact` :325-365, `gamelib_report_init` :380-390, `SteamAPI_Shutdown` :22410 | role-match |
| `native/steam-bridge/generated/bridge_dispatch.h` (GENERATED) | generated dispatch | request-response | 53-14 `SteamUser023.GetAuthSessionTicket` case | exact |
| `native/steam-bridge/helper/bridge_helper.c` (slot 6 + manual dispatch + ring) | helper / controller | request-response (pull queue) | own `CONTROL_SLOT_REPORT_INIT` handler :571-603, `pump_callbacks` :283-288, `load_steam_api` :310 | exact |
| `native/steam-bridge/helper/gamelib_cbqueue.h` (NEW, optional) | utility | batch/queue | none structural; `#include "...bridge_dispatch.h"` at `bridge_helper.c:125` for include style | partial |
| `src/backend/storeManagers/steam/bridge/protocol.ts` | config/protocol | request-response | own `CONTROL_SLOT` :96-114 | exact |
| `meta/__tests__/gen_vtables.test.ts` (new describes) | test | source-pin | `describe('53-14: GetAuthSessionTicket forward (D-53-06)')` :2575-2670 | exact |
| `meta/__tests__/msvcCallbackBaseLayout.test.ts` (NEW) | test | spawn pinned zig | `meta/__tests__/shimAbiGate.test.ts` :177-260 | exact |
| `meta/__tests__/fixtures/` CCallbackBase C++ fixture (NEW) | fixture | n/a | `meta/__tests__/fixtures/*` (committed fixtures dir); content from RESEARCH.md "Code Examples" | role-match |
| `src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts` | test | source-pin | `describe('protocol -- CONTROL_SLOT.reportVersion')` :172-190 | exact |
| `src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts` | test | integration (spawn) | `REPORT_INIT` test :699-760 | exact |
| `.planning/spikes/006-cpp-vtable-abi/*` -> optional Wine PE harness (P55-9) | test harness | manual | `.planning/spikes/006-cpp-vtable-abi/run.sh`, `harness.c` | role-match |

## Pattern Assignments

### `meta/sdk/wire-policy.json` and `meta/sdk/isteamuser.manifest.json` (config, request-response)

**Analog:** `GetAuthSessionTicket` entry, 53-14. Current slot-14 stub in manifest (lines 292-304) has no `mode`:

```json
{ "slot": 14, "name": "GetAuthTicketForWebApi", "returns": "uint32", "returnKind": "int32",
  "stackBytes": 4,
  "params": [ { "name": "pchIdentity", "type": "const char*" } ] }
```

**Pattern to copy** (manifest 259-291 ends with these two keys; add the same after `params`, and add `"kind": "in-string"` to `pchIdentity`):
```json
"mode": "wire",
"helperFlat": "SteamAPI_ISteamUser_GetAuthSessionTicket"
```
wire-policy.json lines 11-28 shape (sibling of `BLoggedOn` / `GetSteamID`, line 5-10):
```json
"GetSteamID": { "helperFlat": "SteamAPI_ISteamUser_GetSteamID" },
"GetAuthSessionTicket": { "helperFlat": "...", "helperNativeArgs": 4,
  "params": { "pcbTicket": { "kind": "out-value", "valueType": "uint32" } } }
```
Add: `"GetAuthTicketForWebApi": { "helperFlat": "SteamAPI_ISteamUser_GetAuthTicketForWebApi", "params": { "pchIdentity": { "kind": "in-string" } } }`. For the `in-string` kind precedent see wire-policy.json ~125-160 (`pchName`, UserStats). Only SteamUser023 contains the method (SteamUser021 does not). Do not set `helperNativeArgs` (the 53-14 4-arg case was for a trailing null param; here native arity equals manifest arity). Keep policy and manifest consistent by hand or re-run `pnpm extract-proton-inventory --versions SteamUser023`; then `pnpm gen-vtables`.

### `meta/gen_vtables.ts` (generator, transform)

**Analog:** `FLAT_EXPORT_BODIES`-style record, lines ~855-873. The bodies are single C strings; `SteamAPI_Shutdown` (just above 855) shows how a lock-using multi-line body is built with `'...\n' +` concatenation:

```ts
  SteamAPI_RunCallbacks: 'void SteamAPI_RunCallbacks(void) { }',
  SteamAPI_RegisterCallback:
    'void SteamAPI_RegisterCallback(void *pCallback, int iCallback) { (void)pCallback; (void)iCallback; }',
  SteamAPI_UnregisterCallback:
    'void SteamAPI_UnregisterCallback(void *pCallback) { (void)pCallback; }',
  SteamAPI_RegisterCallResult: '... { (void)pCallback; (void)hAPICall; }',   // KEEP as no-op (out of scope)
  SteamAPI_UnregisterCallResult: '...',                                       // KEEP
```
Replace the first three bodies with the registry/drain/dispatch code (RESEARCH Pattern 3: own `SRWLOCK g_cb_registry_lock`, fixed 512-entry table, `GL_CB_*` constants emitted from named TS consts). Also extend `SteamAPI_Shutdown` body (it takes `g_bridge_lock`) to clear the registry (under the registry lock, never while holding `g_bridge_lock`). Leave `LIFECYCLE_NOOP_SPECS` (`:692-701`, `ManualDispatch_*`, `Steam_RunCallbacks` `:782`, `SteamGameServer_RunCallbacks` `:664`) untouched (scope boundary). Emit the new `BRIDGE_CONTROL_SLOT_DRAIN_CALLBACKS 6` define next to the existing group (see shim excerpt below; that group is generated from the generator's prelude, find with `grep -n BRIDGE_CONTROL_SLOT_REPORT_INIT meta/gen_vtables.ts`).

### `steam_api_shim.c` (generated; excerpts the generator output must follow)

**Lock + transact** (lines 150-156, 358-365):
```c
static SRWLOCK g_bridge_lock = SRWLOCK_INIT;   // Not recursive: nothing that holds it may call bridge_transact again.
static int bridge_transact(uint16_t ordinal, uint16_t slot, const uint8_t *argBuf, uint32_t argLen,
                            uint8_t *retBuf, uint32_t retBufCap, uint32_t *retLenOut) {
  AcquireSRWLockExclusive(&g_bridge_lock);
  int ok = bridge_transact_locked(ordinal, slot, argBuf, argLen, retBuf, retBufCap, retLenOut);
  ReleaseSRWLockExclusive(&g_bridge_lock);
  return ok;
}
```
**Pitfall 3 anchor** (line 340-342): `if (retLen > retBufCap) return 0;` returns WITHOUT draining the body, so the drain `retbuf` must be >= 2572+12 bytes.

**CONTROL define group** (lines 43-60, add one entry in the same commented style):
```c
#define BRIDGE_CONTROL_ORDINAL 0xffff
#define BRIDGE_CONTROL_SLOT_REPORT_INIT 5
```
**Fire-and-forget CONTROL caller** (lines 380-390, copy for the drain caller: stack buffers, `bridge_transact(BRIDGE_CONTROL_ORDINAL, BRIDGE_CONTROL_SLOT_x, ...)`, bounded static counter, unguarded for x86):
```c
static int g_gamelib_init_reports = 0;
static void gamelib_report_init(uint32_t fn, int32_t ret) {
  uint8_t req[8]; uint8_t retbuf[1]; uint32_t retlen = 0;
  if (g_gamelib_init_reports >= 8) return;
  g_gamelib_init_reports++;
  memcpy(req, &fn, 4); memcpy(req + 4, &ret, 4);
  (void)bridge_transact(BRIDGE_CONTROL_ORDINAL, BRIDGE_CONTROL_SLOT_REPORT_INIT, req, 8, retbuf, sizeof(retbuf), &retlen);
}
```
Drain caller differences: non-OK / `!ok` => treat as zero callbacks (version skew, P55-6); call it only with NO lock held; dispatch loop after it returns.

**THISCALL** (lines 142-146): `#if defined(__i386__) #define THISCALL __attribute__((thiscall)) #else #define THISCALL #endif`; use for the `gl_cb_run1_fn` typedef (RESEARCH Pattern 3 snippet, slot 1, flags/iCallback offsets per arch).

**Shutdown** (lines 22410-22419): lock-acquire/release shape to mirror for registry clearing.

### `native/steam-bridge/helper/bridge_helper.c` (helper, request-response pull queue)

**Slot define** (lines 142-158; add after REPORT_INIT, same comment style):
```c
#define CONTROL_ORDINAL 0xffff
// D-53-15 (quick 261025-kax): ...
#define CONTROL_SLOT_REPORT_INIT 5
// add: Phase 55: ... #define CONTROL_SLOT_DRAIN_CALLBACKS 6
```
**dlsym resolution** (lines 310-311): `RunCB = (RunCallbacks_t)dlsym(g_dylib_handle, "SteamAPI_RunCallbacks");` -> add `dlsym` for `SteamAPI_ManualDispatch_Init/RunFrame/GetNextCallback/FreeLastCallback` and `SteamAPI_GetHSteamPipe`; a missing export must degrade (drain answers count 0), same as the `SteamInternal_CreateInterface` WARN-and-continue handling at :313-318. Call `ManualDispatch_Init` once after `InitFlat` succeeds.

**Replace `pump_callbacks()`** (lines 283-288, called only from WHOAMI at :484):
```c
static void pump_callbacks(void) { for (int i = 0; i < 3; i++) { RunCB(); usleep(50 * 1000); } }
```
Must become a manual pump feeding the SAME ring (never `RunCB` once `ManualDispatch_Init` ran, Pitfall 6).

**Handler template** (CONTROL branch, lines 571-603; drain handler goes just before the `send_response(... STATUS_ERR ...) // unknown control slot` fallthrough at :604):
```c
if (slot == CONTROL_SLOT_REPORT_INIT) {
  // D-53-15: answerable pre-init (like HELLO). T-kax-01: bounds-check before the copy,
  // closed code table, only table strings and %d reach the log.
  if (argBlob == NULL || argLen < 8) { send_response(fd, requestId, STATUS_ERR, NULL, 0); return; }
  ...
  char imsg[160];
  snprintf(imsg, sizeof imsg, "fn=%s ret=%d ok=%d session=%d", ...);
  logts("GINIT", imsg);
  send_response(fd, requestId, STATUS_OK, NULL, 0);
  return;
}
send_response(fd, requestId, STATUS_ERR, NULL, 0); // unknown control slot
```
Log helper: `logts(const char *cat, const char *msg)` (:223). New log line: category e.g. `CBQ`, integers only (`result`, `cub`), NEVER ticket bytes. Not-inited answers STATUS_OK count 0 (unlike WHOAMI, which returns STATUS_ERR at :481).

**Response framing:** `send_response(fd, requestId, status, retBlob, retLen)` (:425). `MAX_FRAME_BYTES 65536` (:140); bounds-check precedent :654-661.

### `native/steam-bridge/helper/gamelib_cbqueue.h` (NEW, optional; utility, queue)

**Analog:** none structural. Style reference is `bridge_dispatch.h` being `#include`d at `bridge_helper.c:125`. Use RESEARCH Pattern 2 (`#pragma pack(push,4) CallbackMsg_t`, 8 x 2572 B ring, allowlist {168}, drop-oldest, zero on pop, `cub <= 2572` cap). Keep it header-only and free of dylib/socket deps so a host-compile jest test can include it. If added, `buildHelperCompileArgv()` (meta/buildSteamBridgeShims.ts) may need an `-I` check; verify the include path resolves relative to the helper dir.

### `src/backend/storeManagers/steam/bridge/protocol.ts` (protocol constants)

**Analog:** `CONTROL_SLOT` lines 96-114. Add, in the same commented style:
```ts
  // D-53-15 (quick 261025-kax): ...
  reportInit: 5
} as const
```
-> `reportInit: 5,` then `// Phase 55: shim drains queued Steam callbacks ... drainCallbacks: 6`. `Object.values(CONTROL_SLOT)` distinctness is already tested (`protocol.test.ts:165-170`); is `encodeControl` keyed by name (grep `encodeControl` before adding, it may take `keyof typeof CONTROL_SLOT`).

### `meta/__tests__/gen_vtables.test.ts` (new describes, source-pin)

**Analog:** `describe('53-14: GetAuthSessionTicket forward (D-53-06)')`, lines 2575-2670. Reusable helpers inside that block:
```ts
const user21: InterfaceManifestV2 = JSON.parse(readFileSync(join(SDK_DIR, 'isteamuser021.manifest.json'), 'utf-8'))
const methodOf = (m, name) => m.methods.find((x) => x.name === name)!
const body = (c: string, fn: string): string => {
  const m = c.match(new RegExp(`${fn}\\(void \\*self[^{]*\\) \\{[\\s\\S]*?\\n\\}`))
  expect(m).not.toBeNull(); return m![0]
}
const c = generateShimC([isteamuser, user21])
const dispatch = generateDispatchHeader([isteamuser, user21])
const caseBody = (label: string): string => {
  const start = dispatch.indexOf(`// ${label}\n`)
  expect(start).toBeGreaterThan(-1)
  return dispatch.slice(start, dispatch.indexOf('\n    }\n', start))
}
```
Assertions to mimic: `expect(validateManifest(isteamuser)).toEqual([])`; `g.mode` toBe `'wire'`; `g.helperFlat`; `dispatch` toContain typedef text `BDFlatFn_SteamUser023_GetAuthTicketForWebApi_t`; `caseBody('SteamUser023.GetAuthTicketForWebApi')`; stub body no longer `return 0;`. Existing pins that WILL break and must be updated: `:266-306` (literal RunCallbacks/Register* bodies), and any pin of the `vt_SteamUser023_GetAuthTicketForWebApi` stub (`grep -n GetAuthTicketForWebApi meta/__tests__/gen_vtables.test.ts`). New `-t` names required by VALIDATION: `"GetAuthTicketForWebApi"`, `"callback registry"`.

### `meta/__tests__/msvcCallbackBaseLayout.test.ts` (NEW; unit, spawns pinned zig)

**Analog:** `meta/__tests__/shimAbiGate.test.ts` lines 177-260. Copy skeleton:
```ts
describe('...', () => {
  let skipReason: string | null = null
  let zigBinPath = ''
  const createdProfiles: FakeHomeProfile[] = []
  beforeAll(async () => {
    if (process.platform !== 'darwin') { skipReason = `... requires darwin ..., got "${process.platform}"`; return }
    try { zigBinPath = await downloadZig() }
    catch (error) { skipReason = `zig unresolvable via downloadZig: ${(error as Error).message}` }
  }, 180000)
  afterAll(() => { for (const profile of createdProfiles) profile.dispose() })   // D4: fresh profile per spawn
  ...
  const fakeHome = createFakeHomeProfile({ prefix: 'gamelib-shimabigate-' })
  createdProfiles.push(fakeHome)
  const env = fakeHome.childEnv()
  const compile = await spawnArgv(zigBinPath, [ 'cc', '-target', zigTarget, ... ], env)
```
Reuse `spawnArgv` (defined in shimAbiGate.test.ts; copy or find where it is declared above line 170) and `downloadZig` import. Command differs: `[zigBinPath, 'clang', '-cc1', '-triple', 'x86_64-pc-windows-msvc' | 'i686-pc-windows-msvc', '-fdump-vtable-layouts', '-fdump-record-layouts-simple', '-fms-extensions', '-fms-compatibility', '-std=c++14', fixture, '-emit-llvm-only']`. Assert parsed indices/offsets equal the exported generator constants (export them from `meta/gen_vtables.ts`). Skip with an explicit reason when zig is absent (match the `skipReason` idiom used in shimAbiGate, with `if (skipReason) return` inside each `it`; check how that file consumes `skipReason`).

### `src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts`

**Analog:** lines 172-190, copy verbatim with `reportVersion` -> `drainCallbacks`, `4` -> `6`, regexes `#define BRIDGE_CONTROL_SLOT_DRAIN_CALLBACKS (\d+)` (shim) and `#define CONTROL_SLOT_DRAIN_CALLBACKS (\d+)` (helper):
```ts
const shimValue = /#define BRIDGE_CONTROL_SLOT_REPORT_VERSION (\d+)/.exec(shim)
const helperValue = /#define CONTROL_SLOT_REPORT_VERSION (\d+)/.exec(helper)
expect(Number(shimValue![1])).toBe(CONTROL_SLOT.reportVersion)
```

### `src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts` (new `DRAIN` tests)

**Analog:** the `REPORT_INIT` test (lines 699-760) inside `describeDarwinOnly(...)` (:215). Skeleton:
```ts
test('DRAIN ...', async () => {
  const stageDir = mkdtempSync(join(profile.root, 'report-init-'))
  const child = spawn(compiledHelperPath, ['--appid', '480', '--port', '0'],
    { cwd: stageDir, stdio: ['ignore', 'pipe', 'pipe'], env: profile.childEnv() })   // fake-HOME env, never a literal
  let stderr = ''
  child.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
  try {
    const port = await new Promise<number>((resolvePromise, reject) => { /* poll stderr for /LISTEN 127\.0\.0\.1:(\d+)/ ... 5000ms */ })
    const socket = new Socket()
    await new Promise<void>((res, rej) => { socket.once('error', rej); socket.connect(port, '127.0.0.1', () => res()) })
    const afterStartup = stderr.length
    expect((await sendFrameOnSocket(socket, encodeRequest(1, CONTROL_ORDINAL, CONTROL_SLOT.drainCallbacks, Buffer.alloc(0)))).status).toBe(STATUS_OK)
    ...
  } finally { child.kill() }
}, 15000)
```
Use `sendFrameOnSocket` (:188), `encodeRequest`, `CONTROL_SLOT`, `STATUS_OK` already imported (:63-70). Assertions: OK + `retBlob` is `u32 0` when not inited (no Steam in the isolated profile); stderr contains no ticket-ish bytes; the unknown-slot-STATUS_ERR test at ~:357 stays valid for slot 7. Compile happens once in `beforeAll` (:220-232) under `createFakeHomeProfile({ prefix })` plus `buildHelperCompileArgv()`; do not add another compile. If `gamelib_cbqueue.h` is adopted for a host unit test, compile it through `profile.childEnv()` the same way.

## Shared Patterns

### Fake-HOME isolation (gamelib-conventions)
**Source:** `src/backend/testUtils/fakeHomeProfile.ts` (`createFakeHomeProfile`, `.childEnv()`, `.root`, `.dispose()`)
**Apply to:** every jest test that spawns clang, zig, objdump or the helper (msvcCallbackBaseLayout, helperIntegration additions, any cbqueue host test). Never `env: { ... }` literals. If a defect only arms under a populated profile, add a named real-profile arm with justification (not expected here). `fakeHomeIsolation.test.ts` gates in-repo spawn sites.

### Generated files
**Apply to:** `steam_api_shim.c`, `bridge_dispatch.h`. Never hand-edit; `pnpm gen-vtables`; verify idempotent with `git diff --exit-code native/steam-bridge/generated meta/sdk` (P55-8). Check `npx prettier --file-info` for generated paths before writing a `<verify>` prettier check; omit it and say so if ignored.

### Lock discipline (082ff80db)
**Source:** `steam_api_shim.c:150-156, 358-365`. `g_bridge_lock` is non-recursive. Dispatch to game `Run()` only with NO shim lock held; registry has its own SRWLOCK; never hold the registry lock across `bridge_transact`.

### Helper bounds-check-then-act, closed tables, integer-only logging
**Source:** `bridge_helper.c:571-603` (REPORT_INIT, T-kax-01). **Apply to:** drain handler and its log line. Credential rule: the ticket is never logged (`meta/__tests__/logSecretGate.test.ts`).

### Slot constant triple-pin
**Source:** `protocol.ts:96-114` <-> `bridge_helper.c:142-158` <-> shim `:43-60`; pinned by `protocol.test.ts:172-190`.

### Version skew
Old helper answers unknown slot with `STATUS_ERR` (`bridge_helper.c:604`); shim treats `!ok` or non-OK as zero callbacks.

### Sidecar rules
No sidecar timer/socket is added; if any `src/backend` TS besides `protocol.ts` (non-runtime constant, but the sidecar bundle imports it) changes, restart `tauri dev` and compare `build/main/sidecar.js` mtime before live testing.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Shim callback registry (inside generated C) | shim state | event-driven | No existing registry/table of game-owned pointers in the shim; use RESEARCH Pattern 3 plus the SRWLOCK precedent above |
| `gamelib_cbqueue.h` ring | utility | queue | No existing bounded ring in the helper; use RESEARCH Pattern 2 |
| `CCallbackBase` C++ MSVC fixture | fixture | n/a | No C++ fixtures exist under `meta/__tests__/fixtures/`; build from RESEARCH "Code Examples" (two pure `Run` overloads, `GetCallbackSizeBytes`, protected `m_nCallbackFlags`/`m_iCallback`, `CCallbackImpl<N>` with virtual dtor, `CCallback<T,P>`) |
| Helper manual dispatch (`CallbackMsg_t`, `ManualDispatch_*`) | helper | pull | No manual-dispatch code in repo (only no-op shim stubs `gen_vtables.ts:692-701`); use RESEARCH Pattern 2 |
| Wine PE harness (P55-9, optional) | harness | manual | Closest: `.planning/spikes/006-cpp-vtable-abi/{harness.c,run.sh,build.sh}`, which calls a vtable slot via MSVC `__thiscall`; extend it with a hand-built callback object |

## Metadata

**Analog search scope:** `meta/`, `meta/sdk/`, `meta/__tests__/`, `native/steam-bridge/{helper,generated}/`, `src/backend/storeManagers/steam/bridge/`, `src/backend/testUtils/`, `.planning/spikes/006-cpp-vtable-abi/`
**Files scanned:** ~14 read in targeted ranges (large generated files only by range)
**Pattern extraction date:** 2026-10-26
