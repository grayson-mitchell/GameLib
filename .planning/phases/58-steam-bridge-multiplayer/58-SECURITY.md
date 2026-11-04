---
phase: 58
slug: steam-bridge-multiplayer
status: verified
threats_open: 0
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
created: 2026-11-04
---

# Phase 58 - Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
>
> Built from the `<threat_model>` blocks of plans 58-01..58-37 (pre-extracted register, 125 rows) and verified against the
> implementation (helper C, generator, shim output, sidecar TS, Tauri shell, frontend, tests, committed evidence files). No new-threat
> scan was performed. SUMMARY `## Threat Flags` (58-10, 58-11, 58-29, 58-30, 58-31) report nothing beyond the register, so there are no
> unregistered flags. 58-REVIEW-FIX.md was read: WR-01..WR-05 changed three mitigations (T-58-99, T-58-112, T-58-111 family); each is
> re-verified against current code and noted below.

**Path shorthand:** `H` = `native/steam-bridge/helper/bridge_helper.c`, `CBQ` = `native/steam-bridge/helper/gamelib_cbqueue.h`,
`CR` = `native/steam-bridge/helper/gamelib_callresult.h`, `GV` = `meta/gen_vtables.ts`, `EPI` = `meta/extractProtonInventory.ts`,
`BC` = `meta/bridgeCensus.ts`, `DT` = `src/backend/storeManagers/steam/bridge/drm/drmTrace.ts`,
`BR` = `src/backend/storeManagers/steam/bridge`, `BT` = `BR/__tests__`, `P` = `.planning/phases/58-steam-bridge-multiplayer`.

---

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Windows game / shim -> helper (loopback TCP, per-spawn 256-bit secret) | Game-controlled bytes cross into the Mac-side helper; all lengths and ids are attacker-influenced |
| Helper -> Mac Steam (flat API) | Helper calls only its own C objects; Windows function pointers must never cross |
| Remote Steam peers -> helper (P2P, Sockets, Messages, lobbies) | Peer packets, identities and invites arrive through Mac Steam |
| Helper stderr -> sidecar -> UI (INVITE line, picker window) | A log line is a UI trigger; game-controlled strings must not forge it |
| Sidecar -> Tauri shell -> picker window | appId/ackId land in a URL |
| Operator evidence (LIVE-GATE, TITLES, DIAGNOSIS, /tmp captures) -> repo | Committed evidence must carry no SteamID64, IP or persona name |
| Release asset -> installer (p58/p58c steamclient-layer archive) | Published binary must match a pinned hash |
| Proton source -> generator | Pinned refs only |

---

## Threat Register

All 124 distinct threats are CLOSED. `T-58-111..116` are each used twice (see Notes); the plan is given in parentheses.

### Plans 58-01..58-09 (measurement, generator, trace, census, wire bounds, ring, publish)

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-58-01 | Info disclosure | mitigate | CLOSED | `P/58-01-TITLES.md`: no 17-digit id (grep `7656119\|\b[0-9]{17}\b` over every phase doc returned nothing); plan verify at `58-01-PLAN.md:131` |
| T-58-02 | Tampering | accept | CLOSED | AR-1 |
| T-58-03 | Info disclosure | mitigate | CLOSED | Capture under `/tmp/gamelib-58-01-*`, not in `git ls-files`; SUMMARY records the path (`58-01-SUMMARY.md:52`); residual cleanup, Notes |
| T-58-04 | Tampering | mitigate | CLOSED | `meta/__tests__/msvcCallbackBaseLayout.test.ts:6-7,85,134` arm B re-measures on darwin |
| T-58-05 | Info disclosure (licence) | mitigate | CLOSED | `meta/__tests__/fixtures/steam_callback_structs.cpp:1-12` "field names, types and declaration order only; no header text" |
| T-58-SC | Tampering | accept | CLOSED | AR-2; `git log -- package.json pnpm-lock.yaml` over the phase window shows no dependency change |
| T-58-06 | Tampering | mitigate | CLOSED | `EPI:77-80` `ALLOWED_PROTON_REFS` (two 40-hex SHAs), `EPI:722,894-898` throw before fetch |
| T-58-07 | Tampering | mitigate | CLOSED | `EPI` reads only the `VTABLE_ADD_FUNC` block (3 refs); `EPI.test.ts:370` slot-count assertion |
| T-58-08 | DoS | mitigate | CLOSED | `GV:540,546` alias duplicates of own and other manifests' exports rejected in `validateManifest` |
| T-58-09 | Info disclosure | mitigate | CLOSED | `steamclient_main.c:781-826` closed 13-id set; only id, resp/state enum and peer ordinal formatted |
| T-58-10 | Tampering | mitigate | CLOSED | `DT:26,96-97,142-147` anchored regex, `id=([1-9]\d{0,4})`, `MAX_DRM_TRACE_LINE_CHARS=512` checked first |
| T-58-11 | DoS | mitigate | CLOSED | `steamclient_main.c:817-818` `gamelib_trace_claim` per-id dedup; `DT:105` `MAX_DRM_P2P_EVENTS=256` |
| T-58-12 | Tampering (provenance) | mitigate | CLOSED | `meta/__tests__/buildLsteamclient.test.ts:84-87` strip test; `PINS.md:41-48,64` and `NOTICE:19` "exactly seven"; 7 `GAMELIB-DRM-TRACE BEGIN` markers in `steamclient_main.c` |
| T-58-13 | Spoofing | mitigate | CLOSED | `BC:807-811` bracket-anchored `bridge helper [<appid>]:` prefix; `BC:2373` helper-role lines never count |
| T-58-14 | Tampering | mitigate | CLOSED | `BC:2287-2288` `NET_LINE_RE` anchored at payload start, closed vocabulary |
| T-58-15 | Info disclosure | mitigate | CLOSED | `BC:2371-2400` fixed phrases and counts; `BC:2578` output line |
| T-58-16 | DoS / Tampering | mitigate | CLOSED | `GV:4912-4915` shim sends over-limit marker; generated `bridge_dispatch.h:4103-4104` refuses with `*respLen=0; return 1` before copy ("T-58-16"); `GV:992` 61440 cap |
| T-58-17 | Tampering | mitigate | CLOSED | `GV:458-486` structSize equals measured x64 size and x64/mac/x86 layouts identical, else generation fails |
| T-58-18 | Elev. of privilege | mitigate | CLOSED | `GV:614-632,719-721` `shimLocal` methods never marshal params and have no helper case |
| T-58-19 | DoS | mitigate | CLOSED | `GV:5580` static buffers under `g_bridge_lock`; `bridge_dispatch.h:4099` static 61440 buffers |
| T-58-20 | Spoofing | mitigate | CLOSED | `H:2866-2871` slot 12 / `CR` slot 11 behind auth gate (`H:2538`), exact argLen, unknown -> STATUS_ERR (`H:2890`); `BT/helperIntegration.test.ts:1517,1563` |
| T-58-21 | Tampering | mitigate | CLOSED | slot 10 id allowlist (`BT/helperIntegration.test.ts:1396`); counts bounded |
| T-58-22 | Info disclosure | mitigate | CLOSED | `H:612-670` closed word tables plus integers; `BT/helperIntegration.test.ts:1517` "NET/CBQ formats carry no %s" |
| T-58-23 | Info disclosure | mitigate | CLOSED | `CBQ:247,291` `gl_cbq_secure_zero` on pop/evict; `CR:140,146,175,250,256,294,318`; `H:2882-2887` zero after send |
| T-58-24 | DoS | mitigate | CLOSED | `CBQ:33-34` ring 32, pump 64 |
| T-58-25 | Tampering | mitigate | CLOSED | `src/common/steamclientLayerCatalogue.ts:90-133` per-file sha256 pins; `steamclientLayerInstall.ts` `verifyComponentDir`; asset later republished as `-p58c` (Notes) |
| T-58-26 | Repudiation | mitigate | CLOSED | `P/58-08-SUMMARY.md:45,61` "Operator saw and approved this hash. Published"; `P/58-08-LIVE-GATE.md:280` Run record |
| T-58-27 | DoS | mitigate | CLOSED | `P/58-08-SUMMARY.md:45`, `P/58-08-LIVE-GATE.md:27,34` no `--clobber`; Phase 56 asset stays |
| T-58-28 | Info disclosure | mitigate | CLOSED | Gate session dirs under `/tmp`, none tracked; `58-09-SUMMARY.md:62` deletion instruction; `/tmp/gamelib-gate-*` already removed |
| T-58-29 | Info disclosure | mitigate | CLOSED | `P/58-08-LIVE-GATE.md:250` records "local bound sockets only", path as word; no SteamID64/IP found in file |
| T-58-30 | Repudiation | mitigate | CLOSED | `P/58-08-LIVE-GATE.md:250,321` operator statements verbatim |

### Plans 58-10..58-21 (call results, networking, Messages, GameServer scope, MMServers)

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-58-31 | Tampering | mitigate | CLOSED | `GV:3537-3547` count==1, `cub==size`, `failed<=1`, `len==24+cub` before use, else 0 |
| T-58-32 | DoS | mitigate | CLOSED | `GV:3061-3064` registry 64, held 16, expiry 10 s; `GV:3388` overflow counted not grown |
| T-58-33 | Info disclosure | mitigate | CLOSED | `GV:3496,3511` zero on expiry and delivery; `GV:3047-3057` 168 never a call result |
| T-58-34 | Elev. of privilege | mitigate | CLOSED | `GV:3486` "Called with NO lock held"; ERRORCHECK harness `meta/__tests__/callbackRegistryHost.test.ts:3` |
| T-58-35 | Tampering | mitigate | CLOSED | `GV:4066` size check; `GV:4237-4250` copy only when id and cub match, then zero |
| T-58-36 | DoS | mitigate | CLOSED | `GV:4022-4023` res 16 / FIFO 32; `GV:4067-4081` oldest evicted; `GV:4162` 10 s expiry |
| T-58-37 | Info disclosure | mitigate | CLOSED | `GV:4388-4396` `gl_md_free_last` zeroes the slot; eviction zeroes at `GV:4074` |
| T-58-38 | Tampering | mitigate | CLOSED | `bridge_dispatch.h:4104,4561` in-buffer past cap refused; `GV:973` 4096 in-string cap |
| T-58-39 | Tampering | mitigate | CLOSED | `GV:1129-1145` uint16 out-value is 2 bytes; `isteammatchmaking009.manifest.json:53-59` |
| T-58-40 | Info disclosure | mitigate | CLOSED | `H:2956` `logts("CALL", bd_call_name(ci))` interface.method only; lobby ids never formatted (`H:2330` "Never logs the id") |
| T-58-41 | DoS / Tampering | mitigate | CLOSED | `H:680,711-770` `IsP2PPacketAvailable` probe, `limit=min(cubDest,cap,61440,room)`, oversize never truncated; `BT/helperIntegration.test.ts:2251` source pin |
| T-58-42 | Info disclosure | mitigate | CLOSED | `H:743-750,761` discard path zeroes scratch, `remote` stays 0; failed read zeroes `resp+20`; evidence line carries size only |
| T-58-43 | Spoofing | accept | CLOSED | AR-3 (current code is stricter than the accepted text, see Notes) |
| T-58-44 | Elev. of privilege | mitigate | CLOSED | `H:824-838` type 5 and ids 201-207 refused; `H:1498` same for open options; `GV:1460,2129` Ptr/Callback_* stay shim-side |
| T-58-45 | Tampering | mitigate | CLOSED | `H:838-846` per-type exact length, `len<=4096`, NUL check, scope/type range |
| T-58-46 | DoS | mitigate | CLOSED | `GV:1485-1496` `CFG_STORE_MAX 256`, `MSG_MAX_DATA 1 MiB`; `GV:2020-2036` alloc bounded and Release frees once |
| T-58-47 | Tampering | mitigate | CLOSED | `GV:1031,1037,2649-2680` ParseString bounded to the measured struct, typed Generic getters |
| T-58-48 | Tampering | mitigate | CLOSED | `H:1214-1222` per-record `cb` checked against `GL_NETS_RECORDS_MAX`; `GV:2390` shim decode `cb > rem - header` breaks; `H:1032` batch 64 |
| T-58-49 | DoS | mitigate | CLOSED | `H:1035-1037,1115-1130` 256 records x 32 handles x 1 MiB, oldest dropped with oversize NET line |
| T-58-50 | Elev. of privilege | mitigate | CLOSED | `H:1498` helper refuses Ptr and Callback_* options; `GV:2434-2435` filtered shim-side |
| T-58-51 | Info disclosure | mitigate | CLOSED | `H:1235` `gl_nets_release` immediately; `H:1075-1081` `gl_nets_rec_free` zeroes; NET lines integers only |
| T-58-52 | Tampering | mitigate | CLOSED | `H:1171-1175` `gl_net_receive_messages_ch` shares `gl_nets_receive` (same bounds) |
| T-58-53 | Spoofing | mitigate | CLOSED | no `AcceptSessionWithUser` anywhere in `H` (grep: zero matches) |
| T-58-54 | Info disclosure | mitigate | CLOSED | NET lines from literal tables only (`H:612-670`) |
| T-58-67 | Info disclosure | mitigate | CLOSED | `P/58-01-TITLES.md` re-measure clean of 17-digit ids |
| T-58-68 | Info disclosure | mitigate | CLOSED | `58-17-SUMMARY.md:30,49` capture outside repo, deletion requested; residual cleanup, Notes |
| T-58-55 | Spoofing | mitigate | CLOSED | `CBQ:97,181-217` exact-size rows for 333/337; only Mac pipe feeds them; never logged |
| T-58-56 | Tampering | mitigate | CLOSED | `meta/signatureEquality.ts` imported at `GV:56`; `isteamnetworkingsockets012.manifest.json` built from its own block |
| T-58-57 | Info disclosure | mitigate | CLOSED | `GV:973` in-string cap 4096; no value logged (`H:2956` logs name only) |
| T-58-69 | Spoofing | mitigate | CLOSED | Surface not shipped: `58-19-SUMMARY.md` D-10 decision `none` (SteamGameServer not wired); `H` has no `SteamGameServer_Init`; slot 13 is the HELLO-gated friend list (T-58-95) |
| T-58-70 | DoS | mitigate | CLOSED | Same: no game-server pipe exists |
| T-58-71 | Repudiation | mitigate | CLOSED | `58-19-SUMMARY.md` records branch taken and that `none` was resolved by the plan's own rule |
| T-58-58 | Elev. of privilege | mitigate | CLOSED | `H:1933-1956` helper responses are its own C callbacks that push events; game vtables invoked shim-side (`GV:3600+`, 64-entry map) |
| T-58-59 | Tampering | mitigate | CLOSED | `H:2236-2262` `gl_mms_is_issued`, index vs `GetServerCount`, fixed `GL_MMS_GSI_SIZE` repack; `H:2108-2112` filters <=32, each NUL-terminated within 256 |
| T-58-60 | Spoofing | mitigate | CLOSED | `H:2867-2871` auth-gated, `argLen != 0` refused; `BT/helperIntegration.test.ts:1563` |
| T-58-72 | DoS | mitigate | CLOSED | `CR:201,250-256` ring 64, oldest evicted and zeroed; one event per drain (`H:2874-2880`) |
| T-58-73 | Tampering | mitigate | CLOSED | `GV:3600-4000` count/kind/cub validated; strings NUL-terminated into shim buffers (`GV:3940-3942`) |
| T-58-74 | Elev. of privilege | mitigate | CLOSED | `GV:3590-3720` `gl_mms_tab` holds game pointers shim-side only, zeroed on release (`GV:3643,3672`) |
| T-58-75 | DoS | mitigate | CLOSED | `GV:3590` `GL_MMS_MAP_CAP 64`, `GV:3606` `GL_MMS_DETAILS_CAP 1024`; overflow fails |

### Plans 58-22..58-37 (gates, diagnosis, invite picker, auth hardening)

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-58-61 | Info disclosure | mitigate | CLOSED | `P/58-22-LIVE-GATE.md` contract; no SteamID64 or private IPv4 in file (grep) |
| T-58-62 | Repudiation | mitigate | CLOSED | `P/58-25-DIAGNOSIS.md:88` "Operator answers (verbatim, 2026-11-01)"; gate files record answers verbatim |
| T-58-63 | Info disclosure | mitigate | CLOSED | `58-23-PLAN.md:105` verify refuses SteamID64 and private IPv4; independent re-grep of `58-22-LIVE-GATE.md`, `58-33-LIVE-GATE.md`, `58-08-LIVE-GATE.md`: none |
| T-58-64 | Info disclosure | mitigate | CLOSED | `58-23-SUMMARY.md:60`; session dir not tracked and no longer present in `/tmp` |
| T-58-65 | Repudiation | mitigate | CLOSED | `58-24-SUMMARY.md:23,36` cites gate file and records FAIL as not done |
| T-58-66 | Tampering | mitigate | CLOSED | `BT/allowlist.test.ts:164-180` bundled `bridge-allowlist.json` must have `knownBad` equal `[]` |
| T-58-80 | Info disclosure | mitigate | CLOSED | `P/58-25-DIAGNOSIS.md`: no SteamID64 or private IPv4 (grep) |
| T-58-81 | Repudiation | mitigate | CLOSED | `P/58-25-DIAGNOSIS.md:88` verbatim with date |
| T-58-82 | DoS | mitigate | CLOSED | `H:739-741` `avail <= (1u << 20)` before `malloc`; above the cap packet left and recorded |
| T-58-83 | Info disclosure | mitigate | CLOSED | `H:748` `gl_cbq_secure_zero(scratch, avail)` before `free`; `dremote` is a local, never copied to resp |
| T-58-84 | Tampering | mitigate | CLOSED | `meta/buildSteamBridgeShims.ts:358` `-Werror=uninitialized`; `BT/helperNetHarness.test.ts:131-138` asserts exact `iface=Sockets` and `not iface=Messages` |
| T-58-85 | Elev. of privilege | mitigate | CLOSED | `BT/helperNetHarness.test.ts:5,36` `createFakeHomeProfile({ prefix: 'gamelib-nethar-' })` |
| T-58-86 | DoS | mitigate | CLOSED | `BC:2525-2549` regular-file check, size cap, exit 2 on refusal; `BC:1636` `lstatSync` + not symlink |
| T-58-87 | Tampering | mitigate | CLOSED | `DT:101-102` `TRACE_APPS_RE` anchored, bounded digits, closed op set |
| T-58-88 | Spoofing | mitigate | CLOSED | `BC:2373-2406` attributed helper payloads for the requested appid only; host/client booleans never change `status` |
| T-58-89 | Elev. of privilege | accept | CLOSED | AR-4 (todo present and later fixed) |
| T-58-90 | DoS | mitigate | CLOSED | `H:322-345,623-650` join 16 + 3 x 4 x 8 budget, "112 lines"; cap lines from closed tables |
| T-58-91 | Repudiation | mitigate | CLOSED | `H:1100-1105,1115-1122` eviction and drop-oldest emit `GL_NET_KIND_OVERSIZE` with the count |
| T-58-92 | Info disclosure | mitigate | CLOSED | `H:1084-1087,1365,1385` `gl_nets_queue_clear` on CloseConnection/DestroyPollGroup, `gl_nets_rec_free` zeroes |
| T-58-93 | Spoofing | mitigate | CLOSED | `GV:3030` `holdExpiryMs: 60000` on 333; `GV:4523-4531` stale held message cleared, never delivered |
| T-58-94 | Info disclosure | mitigate | CLOSED | `H:635-646` cap note built from `k_kind`/`k_iface` literals only |
| T-58-95 | Spoofing | mitigate | CLOSED | `H:2538-2545` auth gate precedes slots 13/14; `BT/helperNetHarness.test.ts:332`, `BT/helperIntegration.test.ts:1897` |
| T-58-96 | Info disclosure | mitigate | CLOSED | `H:2408-2441,2892-2903` snapshot keeps ids in `g_friend_snapshot`, wire has token+name only; `H:2441` logs `friends n=%u`; zero of resp buffer after send |
| T-58-97 | Tampering | mitigate | CLOSED | `H:2335-2340` lobby set only by game's own `ActivateGameOverlayInviteDialog`; `H:2906-2918` slot 14 argLen 4 token only |
| T-58-98 | Elev. of privilege / abuse | mitigate | CLOSED | `H:2450-2487` refuses with no/awaiting lobby, `GL_INVITE_EXPIRY_MS 600000`, token generation and index bound (WR-04) |
| T-58-99 | DoS | mitigate | CLOSED | `H:2344-2350` dialog line limited by 2 s gap; `H:2358-2378` MMS lines capped 4 per op. Deviation: the 16-line cap was removed by review fix WR-01 (Notes) |
| T-58-100 | Tampering | mitigate | CLOSED | `H:2068-2069` low-32 collision with a different issued handle refused (no recycle) |
| T-58-101 | DoS | mitigate | CLOSED | `H:1925-1936` acquire returns -1 when pool bound; `GL_MMS_ISSUED_MAX 64` |
| T-58-102 | Info disclosure | mitigate | CLOSED | `H:2207` Release zeroes the issued entry, so `GetServerDetails` returns 0 (`H:2254`) |
| T-58-103 | Spoofing | mitigate | CLOSED | `BR/helperProcess.ts:112` anchored `^\[[^\]]*\] INVITE +dialog appid=(\d+)\r?$`; `:440-447` appid equals expected, own child stream, 2 s debounce |
| T-58-104 | Tampering | mitigate | CLOSED | `src/backend/sidecar/steamAuthFlowRegistration.ts:420-442` appId `/^\d{1,10}$/`, integer ordinal >= 0; `BR/inviteBridge.ts:124-126` range check; helper `H:2477` bound again |
| T-58-105 | Info disclosure | mitigate | CLOSED | `BR/inviteBridge.ts` fixed-word logs; `BT/inviteBridge.test.ts:231,239-241` source grep that no log call interpolates name/ordinal |
| T-58-106 | DoS | mitigate | CLOSED | `BR/inviteBridge.ts:46,59-67` single-shot socket, `CONTROL_TIMEOUT_MS 3000`, `timeout.unref()`, destroy on settle |
| T-58-107 | Tampering | mitigate | CLOSED | `H:2524-2528` `shim attached` only when argLen equals bare secret length (probe role byte suppresses); `BT/helperIntegration.test.ts:1777` |
| T-58-108 | Info disclosure | mitigate | CLOSED | `SteamBridgeInviteDialog/index.tsx` renders names via React only, no `console.*` in dialog or `SteamBridgeInvite.ts`; test `SteamBridgeInviteDialog.test.tsx:148` spies console |
| T-58-109 | Spoofing / phishing | mitigate | CLOSED | Opens only from the validated helper INVITE line (T-58-103); dialog title names the game (`index.tsx:74-76`). Delivery changed to a dedicated window (Notes) |
| T-58-110 | Tampering | mitigate | CLOSED | Validated in `steamAuthFlowRegistration.ts:430-442` and bounded helper-side `H:2477` |
| T-58-111 (58-33) | Info disclosure | mitigate | CLOSED | `P/58-33-LIVE-GATE.md`: no SteamID64 or private IPv4 or persona names (grep) |
| T-58-112 (58-33) | Repudiation | mitigate | CLOSED | `P/58-33-LIVE-GATE.md` answers verbatim; `58-34-SUMMARY.md` |
| T-58-113 (58-33) | Tampering | mitigate | CLOSED | `P/58-33-LIVE-GATE.md` separate launches, one HELLO per archived log, census on own `--log` (`BC:2525`) |
| T-58-114 (58-34) | Info disclosure | mitigate | CLOSED | `P/58-33-LIVE-GATE.md` clean of ids/IPs; path as a word |
| T-58-115 (58-34) | Info disclosure | mitigate | CLOSED | `58-34-SUMMARY.md:62` deletion instruction; directory not in repo and no longer in `/tmp` |
| T-58-116 (58-34) | Repudiation | mitigate | CLOSED | `P/58-33-LIVE-GATE.md` per-direction scoring from own archived log + census; verbatim answers |
| T-58-111 (58-35) | Elev. of privilege | mitigate | CLOSED | `H:2971-2972,2991-2992,3038` `authenticated`/`helloLogged` live in `gl_conn`; `H:2507-2521` mismatched HELLO demotes only its own connection; `BT/helperIntegration.test.ts:1919` |
| T-58-112 (58-35) | DoS | mitigate | CLOSED | `H:274,267` 16 conns, 5 s inactivity close (`H:3055-3063`), non-blocking recv (`H:3004`), `SO_SNDTIMEO` 250 ms (`H:3094-3096`); tests `:1976,2018,2062`. Deviation: full table evicts the oldest unauthenticated slot (WR-02) |
| T-58-113 (58-35) | Tampering | mitigate | CLOSED | `H:3018-3030` `totalLen > MAX_FRAME_BYTES` and `< REQUEST_HEADER_BYTES` closed before body; `H:3011` recv bounded `want - have`; `H:2976` buffer `4 + MAX_FRAME_BYTES` |
| T-58-114 (58-35) | Tampering | mitigate | CLOSED | `BT/helperIntegration.test.ts:2095` `expect(src).not.toMatch(/pthread_create\|\bfork\(/)`; no `pthread`/`fork` in `H` |
| T-58-115 (58-35) | Repudiation / evidence | mitigate | CLOSED | `H:3055-3063` cadence kept; probe HELLO logs no `shim attached` (`H:2524`); tests `:1777,1976` |
| T-58-116 (58-36) | Spoofing / focus stealing | mitigate | CLOSED | `BR/helperProcess.ts:438-447` own appid, own child stream, 2 s debounce. Deviation: quick 261101-llf replaced the main-window raise with a dedicated `bridge-invite` window (`src-tauri/src/main.rs:2405-2432` validates appId 1-10 digits and ackId <=64 `[0-9A-Za-z-]`; `:8596` navigation allow-list), so no focus theft of the main window |
| T-58-117 | Tampering | accept | CLOSED | AR-5 |
| T-58-118 | Info disclosure | mitigate | CLOSED | `BR/helperProcess.ts:455-466` logs appId, fixed words and integer elapsed/timeout only |
| T-58-119 | DoS | mitigate | CLOSED | `src/backend/dialog/displayAck.ts:21,40-42` 15 s `setTimeout` with `timer.unref()`; no import-time work |
| T-58-120 | Info disclosure | mitigate | CLOSED | `P/58-37-SUMMARY.md` counts and fixed words only; no ids/IPs/names (grep) |
| T-58-121 | Repudiation | mitigate | CLOSED | `P/58-37-SUMMARY.md:26-28` mtimes newer than fix commits, strings present, FRESH verify |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-1 | T-58-02 | Game binaries are only read with `objdump`/`strings`; nothing from the install dir is executed by Claude. | plan 58-01 | 2026-11-04 |
| AR-2 | T-58-SC | No package installs in plans 58-02/58-03 (RESEARCH Package Legitimacy Audit: none). Verified: no `package.json`/`pnpm-lock.yaml` change in the phase window. | plan 58-02/03 | 2026-11-04 |
| AR-3 | T-58-43 | Fallback accept only for remotes Mac Steam itself raised a 1202 for, only when the game has no listener; mirrors Steam's own friend auto-accept; logged `src=helper`. Current code is stricter than the accepted text: `H:1560-1640` accepts only a remote the game already sent to or one sharing a live lobby (WR-07 fix, quick-261101-iah). | plan 58-13 | 2026-11-04 |
| AR-4 | T-58-89 | WR-07 deferral documented in a `severity: major` todo: `.planning/todos/completed/2026-11-01-legacy-p2p-fallback-accept-any-remote.md` (exists; `severity: major`). The todo is now closed ("Fixed in quick-261101-iah, code commit 2238d27c6"), so the exposure no longer exists; `H:1560-1640` `gl_p2p_allowed` confirms. | plan 58-27 | 2026-11-04 |
| AR-5 | T-58-117 | `acknowledgeDialogDisplay` ignores non-string, unknown and repeated ids (`src/backend/dialog/displayAck.ts:44-52`: returns false unless the id is pending, deletes the entry on first ack); the ack only selects a diagnostic log word, no control-flow effect (`BR/helperProcess.ts:459-466`). | plan 58-36 | 2026-11-04 |

---

## Notes (non-blocking)

- **ID collision.** `T-58-111..T-58-116` are each used for two different threats: plans 58-33/58-34 (evidence-file hygiene and scoring) and
  plans 58-35/58-36 (per-connection auth, flood, frame bounds, thread affinity, census segmenting, focus). Both sets are recorded above and
  disambiguated by plan. `T-58-SC` appears in 58-02 and 58-03 with the same accept and is recorded once. Net 124 threats: 119 mitigate, 5 accept.
- **T-58-99 (WR-01 deviation).** The helper's 16-line `INVITE dialog` cap was removed because the line is the backend's picker trigger.
  The 2 s gap (`H:2344-2350`) and the backend 2 s debounce (`helperProcess.ts:115,446`) still bound volume. Treated as equivalent.
- **T-58-112 / T-58-111 (58-35) (WR-02/WR-03 deviation).** "accept-then-close when full" became "evict the oldest unauthenticated slot, else close"
  plus a 5 s auth deadline (`H:276-280,3063`); send timeout lowered to 250 ms. Stronger than planned. Authenticated slots are never evicted.
- **T-58-109 / T-58-116 (quick 261101-llf).** The planned main-window raise is gone; a dedicated `bridge-invite` window is opened through
  `bridge_invite_picker_open` with Rust-side revalidation of both ids. 58-37-SUMMARY still cites "raise requested", which predates that change.
- **T-58-69 / T-58-70 / T-58-71.** SteamGameServer was not wired (58-19, D-10 `none`); the mitigations have no code to attach to and the attack surface does not exist.
  If a later phase wires it, these must be re-verified.
- **T-58-43 / T-58-89.** The accepted exposure (any Steam user can push packets into a non-listening game) was fixed after acceptance (WR-07).
  The accept entries remain for the audit trail; the residual risk is nil.
- **T-58-25.** The pinned asset was later republished as `steamclient-layer-cx26.3.0.39832-p58c.tar.gz`; per-file sha256 pins are in `steamclientLayerCatalogue.ts:90-133`.
- **Housekeeping (T-58-03, T-58-68, outside the repo).** `/tmp/gamelib-58-01-20261031T001305Z` and `/tmp/gamelib-58-17-20261031T062510Z` still exist.
  The 58-17 SUMMARY notes lobby ids in a bottle log; the operator should delete both. All other capture dirs named in the plans are already gone.
  Not tracked by git; not a repo-side gap.
- Verification of the native and shim mitigations is by source reading plus the cited tests; the tests were not re-run in this audit.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-04 | 124 | 124 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-04
