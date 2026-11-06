# Phase 58: Steam bridge multiplayer - Pattern Map

**Mapped:** 2026-10-30
**Files analyzed:** 22 (new or modified)
**Analogs found:** 20 / 22 (two partial, see "No Analog Found")

Source of file list: 58-RESEARCH.md "Suggested plan decomposition" (58-01..58-16) plus CONTEXT.md.
Primary analog for the whole callback-delivery half of the phase is quick 261027-k51
(`.planning/quick/261027-k51-forward-userstatsreceived-t-1101-from-he/261027-k51-SUMMARY.md`; commits
`0fa7ab853` layout + repack + state machine, `04388899d` helper pump + slots 9/10, `1919475ce` gen_vtables relay row).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `meta/__tests__/fixtures/steam_callback_structs.cpp` + `.layout.txt` (extend) | test fixture | transform (measure) | same files (k51) | exact (extend) |
| `meta/msvcCallbackLayout.ts` (generalise beyond `USER_STATS_RECEIVED_LAYOUT`) | utility | transform | same file | exact (extend) |
| `meta/__tests__/msvcCallbackBaseLayout.test.ts` (extend) | test | transform | same file (two-arm: committed dump + live zig on darwin) | exact |
| `meta/sdk/isteammatchmaking009`, `isteammatchmakingservers002/003`, `isteamnetworking005/006`, new `isteamnetworkingsockets012/013`, `isteamnetworkingutils004`, `isteamnetworkingmessages002` `.manifest.json` | config (manifest) | request-response | `meta/sdk/isteamuserstats011.manifest.json` | exact (helperInterface) / role-match (new files) |
| `meta/sdk/wire-policy.json` (new family blocks) | config | request-response | `SteamUserStats` + `SteamUser.GetAuthSessionTicket` blocks | exact |
| `meta/gen_vtables.ts` (new ParamKinds, `WIRE_LAYOUT_DOC`, `CALLBACK_RELAY_TABLE` rows, call-result registry) | generator | request-response + event-driven | same file, k51 relay row + `out-buffer` kind | exact (extend) |
| `meta/__tests__/gen_vtables.test.ts`, `callbackRegistryHost.test.ts`, `shimAbiGate.test.ts` (extend) | test | host-compiled C harness | same files (k51) | exact |
| `native/steam-bridge/helper/gamelib_cbqueue.h` (allowlist rows, repack fns, size tables) | utility (header-only, no I/O) | event-driven queue | same file, `gl_cbq_allow[]` + `gl_cbq_repack_user_stats` | exact |
| `native/steam-bridge/helper/bridge_helper.c` (pump routing, new CONTROL slot, NET log lines, networking calls) | service | event-driven + request-response | same file, `gl_manual_pump_into_ring` + slots 9/10 | exact |
| `src/backend/storeManagers/steam/bridge/protocol.ts` (`CONTROL_SLOT.<new> = 11`) | config/protocol | request-response | `CONTROL_SLOT` k51 entries 9, 10 | exact |
| `src/backend/storeManagers/steam/bridge/__tests__/{protocol,cbqueue,helperIntegration}.test.ts` (extend) | test | host harness / spawn helper | same files (k51) | exact |
| `native/steam-bridge/generated/steam_api_shim.c` (generated, never hand-edited) | generated | event-driven | k51 regenerated shim | exact |
| `src/backend/storeManagers/steam/bridge/shimCoverage.ts` (served tables, `SHIM_EXPORT_SET_VERSION`) | config | transform | same file, lines 200-205 / 254-259 | exact |
| `native/steam-bridge/steamclient-layer/lsteamclient/steamclient_main.c` (trace block 6, `event=callback`) | service (Wine-side C) | event-driven | same file, `GAMELIB-DRM-TRACE` blocks 1-5 | exact |
| `src/backend/storeManagers/steam/bridge/drm/drmTrace.ts` (+ `__tests__/drmTrace.test.ts`) | utility (parser) | transform | same file, `TRACE_CALL_RE` / `formatDrmTraceLine` | exact |
| `native/steam-bridge/steamclient-layer/lsteamclient/PINS.md`, `steamclient-layer/NOTICE`, `meta/__tests__/buildLsteamclient.test.ts` (block count) | config/test | transform | blocks-count assertion (update "five" to "six") | role-match |
| `meta/bridgeCensus.ts` (`classifyMultiplayerEvidence`, NET lines, `[drm-trace] event=callback`) | utility (classifier) | transform | `classifyDrmEvidence` (1033-1090) + `classifyBridgeEvidence` (1110) | exact (extend) |
| `meta/__tests__/bridgeCensus.test.ts` (fixture log text) | test | transform | same file | exact |
| `.planning/phases/58-.../58-01 titles file` (measured .bind, arch, imports) | doc | batch | `importScan.ts` + `peSteamDrm.ts` + `pnpm bridge-census` output | role-match |
| `.planning/phases/58-.../58-NN-LIVE-GATE.md` (TCP both directions, Raft DRM) + `58-UAT.md` | live-gate contract | operator-run | `56-15-LIVE-GATE.md`, `56-UAT.md` | exact |
| `bridge-allowlist.json` / D-12 | data | none | n/a | no-op (D-16) |
| Flat `SteamNetworkingIdentity_*` / `IPAddr_*` local implementations (58-08) | shim util | request-response (local) | `GAMESERVER_FLAT_STUBS` (gen_vtables.ts 669) | partial |
| Call-result registry + CONTROL slot 11 (58-05) | shim + helper | event-driven | k51 relay/held + slot 9/10 | partial (call results are new) |

## Pattern Assignments

### Callback allowlist, wire form, repack (`native/steam-bridge/helper/gamelib_cbqueue.h`)

**Analog:** same file, k51 rows. Header-only, no I/O, so a host-compiled harness unit-tests it (`cbqueue.test.ts`).

**Closed allowlist with WIRE sizes** (lines 85-95):
```c
typedef struct { int32_t id; uint32_t size; } gl_cbq_allow_row;
/* Rows are WIRE sizes (what the shim relays). Any row whose Mac struct differs from the
 * wire form (a uint64 member, RESEARCH Pitfall 7) is never offered raw from the pump but
 * goes through its repack first. */
static const gl_cbq_allow_row gl_cbq_allow[] = {
    {GL_CBQ_ID_GET_TICKET_FOR_WEB_API_RESPONSE, GL_CBQ_MAX_PARAM_BYTES},
    {GL_CBQ_ID_USER_STATS_RECEIVED, GL_CBQ_USR_WIN_SIZE}};
```
`gl_cbq_offer` (127-145) rejects `cub != want`, so every new row (503-507 lobby, 1202/1203 P2P, 1221/1222/1251/1252/1281 sockets, 703 for call results) needs an exact size; mac-vs-wire pairs get `GL_CBQ_<X>_MAC_SIZE` / `_WIN_SIZE` defines and `_Static_assert(offsetof/sizeof)` rows, exactly as lines 37-45, 63-83.

**Repack** (176-183): zero the output, `memcpy` each field from its Mac offset to its MSVC offset (padding stays zero). Copy this shape per struct that has a uint64 after a 4-byte member.

**Ring constraints to respect:** `GL_CBQ_MAX_PARAM_BYTES 2572` per slot, `GL_CBQ_RING_SLOTS 8`, zero-on-pop and zero-on-evict (`gl_cbq_secure_zero`). Networking payloads do NOT fit this ring (see No Analog Found).

**Secret hygiene:** slot zeroed on pop/evict, callers never log bytes (file header lines 14-15).

### `native/steam-bridge/helper/bridge_helper.c` (pump routing, new slot, NET lines)

**Analog:** same file, `gl_manual_pump_into_ring` (547-) and slots 9/10 (945-1026).

**Pump routing pattern** (554-560, 589-603): per-id branch for repacked ids, generic `else` offers allowlisted ids. `FreeLastCallback` is always called after a true `GetNextCallback`; a 703 `SteamAPICallCompleted_t` fetches its payload via `g_md_get_api_call_result` BEFORE the free (comment 545-546). Call results for lobby calls (`LobbyCreated_t`, `LobbyMatchList_t`, `LobbyEnter_t` as call result) follow the 703 branch at 560-588: match `done.m_hAsyncCall == pending`, check `done.m_iCallback` and `done.m_cubParam` against the expected size, `GetAPICallResult`, repack, offer, `gl_cbq_secure_zero(buf)`. Generalise `g_stats.pending_call` into a small bounded pending-call table.

**Integer-only logging** (504-519): `logts_f` + literal format at every call site (T-55-08, T-k51-03). Existing DRAIN source pin forbids `%s` in any CBQ format; k51 used a macro with literal branches:
```c
#define GL_LOG_STATS_OBS(srcword, appword, actword, res) \
  logts_f("CBQ", "stats iCallback=1101 src=" srcword " result=%d app=" appword " action=" actword, (int)(res))
```
New `NET` lines (D-08 evidence: join callback, send, receive, direct-vs-relayed marker) must follow this: fixed words and integers only, never SteamID, IP, handle, payload (Security V7). Cap with `if (g_x_logged >= 32) return;` plus one cap line (`CBDISP_LOG_MAX` pattern, 1014-1021).

**CONTROL slot handler pattern** (slot 9 at 945-997, slot 10 at 998-1026), copy for new slot 11:
```c
if (slot == CONTROL_SLOT_REPORT_CB_DISPATCH) {
  // behind the auth gate; exactly 12 bytes; id must be allowlisted; bounded counts. Never pumps or dispatches.
  if (argBlob == NULL || argLen != 12) { send_response(fd, requestId, STATUS_ERR, NULL, 0); return; }
  ...
  if (gl_cbq_allowed_size(did) == 0 || dn > CBDISP_MAX_TARGETS || dheld > 1) { send_response(... STATUS_ERR ...); return; }
```
Rules shown: length validated before reading; unknown values return `STATUS_ERR`; identity-only mode (`g_bd_identity_only`) refuses app-scoped calls (967-972); never sleeps (the shim holds `g_bridge_lock` in `recv`); add `#define CONTROL_SLOT_<NAME> 11` next to lines 221-223. WR-03: every CONTROL slot other than HEALTH/HELLO sits behind the HELLO auth gate (comment 769-771).

**Slot-number note:** the k51 SUMMARY (deviation 1) changed `helperIntegration.test.ts`'s "unknown CONTROL slot" from 9 to 11. Slot 11 becomes real in 58-05, so that test must move to 12.

### `src/backend/storeManagers/steam/bridge/protocol.ts` (CONTROL slot)

**Analog:** `CONTROL_SLOT` (lines 109-143). Append `<name>: 11` with a comment in the k51 style (who sends it, what the helper does, "Nothing in the sidecar sends this"). Never reuse slot 3 (retired, line 117). Old/new peer tolerance: an old helper answers `STATUS_ERR` to an unknown slot and the shim ignores it (k51 SUMMARY "Behaviour notes").

### `meta/gen_vtables.ts` (ParamKinds, WIRE_LAYOUT_DOC, relay table, call-result registry)

**Analog:** same file.

**ParamKind union and doc** (78-91, 577-606). New kinds (`in-buffer`, `in-struct`/`out-struct`, `out-messages`) are added to the `ParamKind` union (line 78), validated in the manifest checker (447-460: `out-buffer` requires `sizeParam`; `lenParam` sibling must be `out-value`; `null-in` accepted), documented in `WIRE_LAYOUT_DOC` (request blob rules, then response blob rules), sized in the worst-case width function (1440-1442: `in-string` is `4 + WIRE_IN_STRING_MAX_BYTES`, `out-value`/`null-in` 0, `out-buffer` 4), and emitted in both the request packer (~1475-1499) and the response decoder (2292-2295). Fail closed on oversize: copy the `in-string` rule (len = MAX+1 and no bytes, helper refuses, 55 WR-04). Cap policy must cite the existing `WIRE_IN_STRING_MAX_BYTES` / `WIRE_OUT_BUFFER_MAX_BYTES` constants. Return-after-out limitations are enforced at 3913-3960 (`generateDispatchHeader` throws rather than silently mis-encoding); a new kind that needs a return-then-out layout must lift that explicitly.

**Relay table** (888-896), add one row per relayed callback; `hold` only for non-credential ids that can arrive before a listener registers:
```ts
export const CALLBACK_RELAY_TABLE = [
  { id: 168, size: 2572, hold: false },
  { id: 1101, size: USER_STATS_RECEIVED_LAYOUT.x64.size, hold: true }
] as const
export const CALLBACK_HELD_MAX_BYTES = 64
```
The x64/x86 equality guard (878-886) must be replicated for each new layout (one relay row serves both DLLs). `CALLBACK_HELD_MAX_BYTES 64` is checked at generation (945); lobby/connection-status structs exceeding 64 need either a bigger constant or `hold: false`. `CALLBACK_DRAIN_RESP_MAX_BYTES` (877) mirrors the helper `GL_CBQ_DRAIN_RESP_MAX_BYTES` and is cross-pinned in `gen_vtables.test.ts`.

**Shim RunCallbacks relay loop** (generated text, 1150-1245): held messages retried first (1171-1195), then up to `GL_CB_DRAIN_MAX_PER_RUN` drains; each drain validates `count==1`, `size == cub`, `len == 12+cub`, delivers via `gl_cb_deliver`, holds if no target and the row has `hold`, then `gl_cb_report_dispatch(id, n, held)` (the CBDISP report). Lock rule: no `vt_`, `gl_cb_report_dispatch`, `gl_cb_dispatch_one` etc. inside any `GL_CB_LOCK()`..`UNLOCK()` region (k51 "Lock check", `regions 18 hits 0`; keep it as a test). Call results are the new part: the three-arg `Run(void*, bool, SteamAPICall_t)` is vslot 0 on MSVC (`MSVC_CCALLBACKBASE_VSLOT_RUN_3ARG`, msvcCallbackLayout.ts 16-21), so a registry for pending call handles must dispatch slot 0, not slot 1.

**helperInterface manifest pattern:** `meta/sdk/isteamuserstats011.manifest.json` lines 1-10 (`"mode": "stub"`, `"helperInterface": "SteamAPI_SteamUserStats_v013"`, `"flatAccessor"`), methods carry `"mode": "wire"` / `"helperFallback": true`. Matchmaking009 currently has NO `helperInterface` (lines 1-13 show only `flatAccessor` and `source`). 58-03 adds `helperInterface` to the in-scope stub manifests. Method entries use `slot`, `name`, `returns`, `returnKind`, `stackBytes`, `params[{name,type,kind}]`. New manifests for MMServers003, Sockets012/013, Utils004, Messages002 come from `pnpm extract-proton-inventory` (`meta/extractProtonInventory.ts`), not hand-written.

### `meta/sdk/wire-policy.json`

**Analog:** `SteamUser.GetAuthSessionTicket` (an `out-buffer` with `sizeParam`/`lenParam`, an `out-value`, and `null-in`) and the `SteamUserStats` block:
```json
"GetAuthSessionTicket": {
  "helperFlat": "SteamAPI_ISteamUser_GetAuthSessionTicket",
  "helperNativeArgs": 4,
  "params": {
    "pTicket": { "kind": "out-buffer", "sizeParam": "cbMaxTicket", "lenParam": "pcbTicket" },
    "pcbTicket": { "kind": "out-value", "valueType": "uint32" },
    "pSteamNetworkingIdentity": { "kind": "null-in" }
  }
}
```
Keyed by family then method; `helperFlat` names the real `libsteam_api.dylib` flat export (verify with `nm -gU`, as research did); `"helperFallback": true` marks shim-local fallbacks (RequestCurrentStats). Config-callback setters (function pointers) must stay shim-local, never forwarded (Security table, Pattern 4).

### `meta/msvcCallbackLayout.ts` and fixtures

**Analog:** same file (222 lines): `MSVC_CCALLBACKBASE_*` constants (16-27), `parseMsvcCallbackLayoutDump` (96-) over `=== triple: <triple>` sections for `x86_64-pc-windows-msvc` and `i686-pc-windows-msvc`, throwing rather than defaulting on a missing triple or block. `USER_STATS_RECEIVED_LAYOUT` (consumed at gen_vtables.ts 880-895) is the one struct-layout export to generalise into a table keyed by callback name. Measurements are MEASURED, never assumed: add each struct to `meta/__tests__/fixtures/steam_callback_structs.cpp`, re-dump to `.layout.txt` (raw), and pin in `msvcCallbackBaseLayout.test.ts` two arms (committed dump; live zig re-measure on darwin; k51 "Arm B ran for all three triples; no SKIPPED line"). k51 table form: triples `x86_64-pc-windows-msvc`, `i686-pc-windows-msvc`, `arm64-apple-macosx (pack 4)` with size and field offsets. `SteamNetworkingMessage_t` has pointer members, so x64 and x86 differ and need either two relay rows or a normalised wire form (decision for 58-02; see No Analog Found).

### `src/backend/storeManagers/steam/bridge/shimCoverage.ts`

**Analog:** same file. Served-version tables at lines 200-205 (`SHIM_SERVED_INTERFACE_VERSIONS`) and 254-259 (`SHIM64_SERVED_INTERFACE_VERSIONS`), e.g. `['SteamMatchMaking009', { family: 'SteamMatchMaking', mode: 'stub' }]`, flipped to `mode: 'wire'` as versions are wired (D-07), with new `SteamNetworkingSockets*` / `Utils` / `Messages` entries added (none exist today). Then `SHIM_EXPORT_SET_VERSION` (432, `computeExportSetVersion`) must change when the export set changes (D-20 precedent) and `isScanVerdictNowCovered` (688) decides previously-stubbed titles are now covered. D-13: the stub notice code is untouched; wired versions simply stop triggering it.

### DRM trace block 6 (`steamclient_main.c` + `drmTrace.ts`)

**Analog:** the existing five `GAMELIB-DRM-TRACE BEGIN/END` fenced blocks (lines 2-20, 74-257, 273-275, 293-295, 611-613). Exactly the strip rule: everything between the fences is removable and must reproduce upstream bytes (`buildLsteamclient.test.ts`, block count 5 to 6; PINS.md and NOTICE document the six-block rule).

**Emit pattern** (193-195, 248-):
```c
out = snprintf( buf, sizeof(buf), "[drm-trace] appId=%s pid=%lu role=%s event=create-interface iface=%s\n",
                gamelib_trace_appid, (unsigned long)GetCurrentProcessId(), gamelib_trace_role, iface );
if (out > 0 && (size_t)out < sizeof(buf)) gamelib_trace_write( buf, out );
```
Rules to copy: names from the game are untrusted, validated with `gamelib_trace_name_ok` and a length cap before formatting; dedup by FNV-1a hash into `gamelib_trace_hashes` (lock-free `gamelib_trace_seen` fast path, `EnterCriticalSection` for insert); global caps `GAMELIB_TRACE_MAX_LINES 256`, `MAX_NAMES 64`; only enabled when `GAMELIB_DRM_TRACE_FILE` is an absolute path. The new `event=callback` hook belongs in `execute_pending_callbacks` (lines ~611-640: the `switch (params.callback->type)` and the Wine-side callback delivery); log the callback id as an integer from a closed set, never payload, SteamID, IP or handle. Note the existing `gamelib_trace_call` filter only emits names starting `ISteam`, so `SendP2PPacket` etc. already trace as `event=call name=ISteamNetworking_..._SendP2PPacket`; the missing evidence is the inbound `LobbyEnter_t` / connection-status callbacks, which is why a callback event is needed.

**Parser pattern** (`drmTrace.ts` 63-66, 78-120): regex per event, bounded character classes, `role=(game|helper)`, returns `null` on any mismatch, plus a canonical `formatDrmTraceLine` used by the 56-12 re-log. Add `TRACE_CALLBACK_RE` (`event=callback id=(\d{1,5})`) and extend `DrmTraceEvent` and `formatDrmTraceLine`. Size limits: `MAX_DRM_TRACE_BYTES 262144`, `MAX_DRM_TRACE_LINES 1024`, `MAX_DRM_TRACE_LINE_CHARS 512`.

### `meta/bridgeCensus.ts` (`classifyMultiplayerEvidence`)

**Analog:** `classifyDrmEvidence` (1033-1090) for the DRM mode, `classifyBridgeEvidence` (1110) for dispatch between modes; D-53-13 per-engine evidence for TCP mode.

**Core shape to copy** (1033-1088): collect events across log texts into `Set`s, gate in order (`anchored` -> `pidConflict` -> any `role=game` interface -> game-log failure), return `{ status: 'verified'|'unverified', detail }` with a short detail string; the "counting" filter excludes plumbing names (`ISteamClient_*`, `SetMinidumpSteamID`). Multiplayer analog: the D-08 bar is three predicates (game-originated join callback; at least one game-originated send AND one receive; operator confirmation is a UAT item, not census). `classifyMultiplayerEvidence` should be pure, take the same `appLogTexts`/`gameLogTexts` inputs, and require `role=game` in DRM mode and non-helper lines in TCP mode (`attributeHelperLines`, 814; helper-originated calls never count). The direct-vs-relayed marker is recorded in `detail`, not gated (D-06). Extend `bridgeCensus.test.ts` with fixture log text (Wave 0 gap).

### Live-gate contracts (`58-NN-LIVE-GATE.md`, `58-UAT.md`)

**Analog:** `.planning/phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/56-15-LIVE-GATE.md` (item bodies 189-240) and `56-UAT.md`; authoring rules in `.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md` (Structural Reachability Review, dual-sink evidence capture; sections 4a emitter/sink table, 4b item/precondition table, 4c absence-observability, 4d pairing pass, 4e external state, 4f gesture sequence).

**Header pattern** (lines 1-20): gate subject; "Authored by: plan X. Run by: plan Y"; "Decision D-E: the author never runs the gate"; standing rule restating strict-verified (game-originated only, helper lines and Mac Steam In-Game never count, failure never reroutes to bottled Steam); "A green test suite never closes this gate"; Paths block (`<session>`, `SIDECAR`, `APPDIR`, `TRACEDIR`, `BOTTLE(<id>)`).
**Preconditions table** (PC1-PC10): ID, precondition, command, positive observable. PC6 pattern (exactly one fresh dev app; check `stat -f %m build/main/sidecar.js` against the relevant commit time) is mandatory because `tauri dev` does not rebuild the sidecar.
**Item format (UAT rule):** `### N. <title>` at column 0; `expected:` inline; `result:` begins with a bare or bracketed status word (`pass`, `issue`, ...) before any prose. Items name their sink: `(sink: SIDECAR copy, launch N)`.
**Item 10 pattern** (networking lead, `grep -c SteamNetworkingSocketsSerialized005` per capture file, all 0 in 56-15): 58's DRM-mode gate repeats this grep over every Raft capture, and the result decides whether `serialized005.patch` is carried. Raft was already `pass` in 56-15 item 8, using the identical anchor + `role=game` + census evidence method.
Two-directional requirement (D-05) means the contract needs one item per direction per mode (host/peer-joins; peer-hosts/GameLib-joins), each with the three D-08 predicates and the operator same-world confirmation as its own item. Account preflight (58-01: friend, invite, join with plain Steam between the two accounts) is a precondition set, not a scored item.

### Test patterns

- **Host-compiled C harnesses** (`cbqueue.test.ts` "harness PASS lines=29 CASES=29"; `callbackRegistryHost.test.ts` 22 cases incl. `relay_1101_dispatch`, `hold_1101_until_listener`, `hold_dispatches_before_new_drain`, `no_hold_168`, `report_hook_unlocked`): copy case naming and add `relay_<id>_dispatch`, call-result register / complete / late-register hold / unregister race.
- **Helper integration** (`helperIntegration.test.ts`): spawns the helper; must use `createFakeHomeProfile()` (never a hand-rolled `env`), and declare any named real-profile arm.
- **Source pins** (k51 deviation 4): a test greps `bridge_helper.c` that no NET/CBQ format string carries `%s` or logs ids/handles; copy for NET lines. Run `logSecretGate`.
- **Build gate:** `pnpm gen-vtables && pnpm build-steam-bridge`; `shimAbiGate.test.ts` compile gate for `steam_api.dll`, `steam_api64.dll`, `steamclient64.dll` (`ret N` for x86 and x64).
- **Prettier in `<verify>`:** `.c`, `.h`, `.cpp`, `.layout.txt` have no parser (k51: "not checked"); check TS/JSON/MD paths only after `--file-info`.

## Shared Patterns

### Strict, game-originated evidence only
**Source:** `meta/bridgeCensus.ts` 1033-1090; `56-15-LIVE-GATE.md` header
**Apply to:** census classifier, every trace line, every live-gate item. `role=game|helper` on every line; helper-originated and Mac Steam In-Game never count.

### Integer-only, closed-vocabulary logging
**Source:** `native/steam-bridge/helper/bridge_helper.c` 504-535, 1014-1023
**Apply to:** helper NET/CBQ/CBDISP lines, DRM trace `event=callback`. Literal format string at every site, capped at 32 lines plus one cap line, no SteamID/IP/handle/payload.

### Authenticated, bounded CONTROL handlers
**Source:** `bridge_helper.c` 945-1026; `protocol.ts` 109-143
**Apply to:** new slot 11. HELLO-gated (WR-03), exact `argLen`, validate before reading, `STATUS_ERR` on anything unlisted, never sleeps, secure-zero response buffers (`gl_cbq_secure_zero(out, sizeof out)` at 1050).

### Fail closed on size, never truncate
**Source:** `gen_vtables.ts` `WIRE_LAYOUT_DOC` (in-string oversize rule), `gamelib_cbqueue.h` `gl_cbq_offer` (`cub != want` drops)
**Apply to:** every new `in-buffer`/`out-messages` length (cap before allocation, T-24-03).

### Measured layouts, two-arm tests
**Source:** `meta/msvcCallbackLayout.ts`, `msvcCallbackBaseLayout.test.ts`, k51 SUMMARY "Measured layout"
**Apply to:** each relayed struct; never hand-assume sizes.

### Regenerate, never hand-edit the shim
**Source:** k51 SUMMARY (verification block)
**Apply to:** `native/steam-bridge/generated/steam_api_shim.c`. Each code plan ends with `pnpm gen-vtables && pnpm build-steam-bridge`; record artifact mtimes (`public/bin/arm64/darwin/*`) for the live gate.

### Operator live gates
**Source:** `56-15-LIVE-GATE.md`, project memory
**Apply to:** 58-14, 58-15. Author is not runner; restart `pnpm tauri:dev` before live testing; fresh worktree needs `build:sidecar-sea` + `vite build` + `build-steam-bridge`.

## No Analog Found

| File / concern | Role | Data Flow | Reason |
|---|---|---|---|
| Networking payload buffers (`SendP2PPacket`/`ReadP2PPacket`, `SendMessageToConnection`, `ReceiveMessagesOnConnection`) | shim + helper | streaming | The cbqueue ring is 8 slots of at most 2572 bytes, one message per drain, and is callback-only. No existing wire kind carries a request buffer into the helper (`in-buffer`) or a variable list of messages out (`out-messages`). Use RESEARCH.md designs; Proton `networking_message_pool` (in `build/lsteamclient-work/`) is the ownership precedent for `SteamNetworkingMessage_t` and `Release`. Closest partial: `out-buffer` with `lenParam` (GetAuthSessionTicket) for the response half. |
| Call-result registry and held-result table (shim) | shim | event-driven | k51 relays broadcast callbacks and uses one hard-coded 703 + `pending_call` in the helper; there is no general pending-call table, and no shim-side registration of `Run(void*, bool, SteamAPICall_t)` targets. Partial analog: the registry/held code at gen_vtables.ts ~1000-1245 and the helper 703 branch (560-588). |
| Flat `SteamNetworkingIdentity_*` / `IPAddr_*` local implementations | shim | request-response (local) | Only `GAMESERVER_FLAT_STUBS` (gen_vtables.ts 669) exists, which are stubs, not real implementations. |
| Shim-local config-callback setters (function pointers) | shim | local | No existing method keeps a Windows function pointer shim-local; closest is `helperFallback: true` (RequestCurrentStats). |

## Metadata

**Analog search scope:** `native/steam-bridge/{helper,shim,generated,steamclient-layer}`, `meta/` (gen_vtables, msvcCallbackLayout, bridgeCensus, sdk manifests, wire-policy), `src/backend/storeManagers/steam/bridge/` (protocol, shimCoverage, drm/drmTrace), `.planning/quick/261027-k51-*`, Phase 56 live-gate files.
**Files scanned:** ~20 read in whole or in targeted ranges (bridge_helper.c, gen_vtables.ts, bridgeCensus.ts are large; read by grep-located ranges).
**Not re-read per rule:** all excerpts above are from non-overlapping ranges. `graphify query` was not run; line numbers were taken from direct grep/read of the working tree at 2026-10-30 and may drift if k-series commits land first.
**Pattern extraction date:** 2026-10-30
