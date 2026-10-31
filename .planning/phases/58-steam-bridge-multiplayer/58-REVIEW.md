---
phase: 58-steam-bridge-multiplayer
reviewed: 2026-10-31T19:35:00Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - meta/bridgeCensus.ts
  - meta/buildSteamBridgeShims.ts
  - meta/extractProtonInventory.ts
  - meta/gen_vtables.ts
  - meta/msvcCallbackLayout.ts
  - meta/sdk/wire-policy.json
  - native/steam-bridge/helper/bridge_helper.c
  - native/steam-bridge/helper/gamelib_callresult.h
  - native/steam-bridge/helper/gamelib_cbqueue.h
  - native/steam-bridge/steamclient-layer/lsteamclient/steamclient_main.c
  - src/backend/storeManagers/steam/bridge/drm/drmTrace.ts
  - src/backend/storeManagers/steam/bridge/interfaceVersions.ts
  - src/backend/storeManagers/steam/bridge/protocol.ts
  - src/backend/storeManagers/steam/bridge/shimCoverage.ts
  - src/common/steamclientLayerCatalogue.ts
  - meta/__tests__/bridgeCensus.test.ts
  - meta/__tests__/gen_vtables.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/cbqueue.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
  - src/backend/storeManagers/steam/bridge/drm/__tests__/drmTrace.test.ts
findings:
  critical: 2
  warning: 9
  info: 5
  total: 16
status: issues_found
---

# Phase 58: Code Review Report

**Reviewed:** 2026-10-31T19:35:00Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

The configured `diff_base` (`c40fb3b47^`) is an upstream Heroic commit, so `git diff` shows the whole
history (about 12,000 commits) as new. I narrowed the review to the Phase 58 range, starting at
`648b4b49c^` (the first `(58-` commit), plus the out-of-plan DRM fix `cda12da3f`
(GetAppBuildId). I checked the generated shim behaviour against the emitter text in
`meta/gen_vtables.ts`.

Bounds checking in the helper is mostly careful. The wire request decoders (`gl_net_*`,
`gl_mms_*`), the slot-11 and slot-12 encoders and the `gameserveritem_t` repack all check lengths
before every copy, and I found no out-of-bounds read or write in them. Trace privacy holds: no raw
SteamID64 reaches a log line in the helper or the DRM layer, and peer ordinals are used as designed.

The real defects are in what happens around those checks:
- undefined behaviour in the Sockets/Messages receive evidence path (the pre-existing
  self-initialised `iface`, confirmed below);
- a legacy-P2P oversize policy that wedges the channel;
- server-browser state (pool objects, the issued-handle ring, the details buffer) that goes wrong
  under normal server-browser load;
- GetAppBuildId trace evidence that the TypeScript parser throws away.

## Critical Issues

### CR-01: Self-initialised `const int iface` is undefined behaviour and mislabels or drops Sockets receive evidence

**File:** `native/steam-bridge/helper/bridge_helper.c:1070`
**Issue:** `const int iface = which == 2 ? GL_NET_IFACE_MESSAGES : iface;` reads `iface` inside its
own initialiser. For `which == 0` (ReceiveMessagesOnConnection) and `which == 1` (OnPollGroup) the
value is indeterminate, which is UB. Introduced in `81d9130b4` (58-16); before that change the
Sockets constant was used directly. In practice, clang folds `select(c, K, undef)` to `K`, so on
the usual build every Sockets `recv`/`oversize` NET line is logged as `iface=Messages`. Without
that fold, the garbage value either fails `gl_net_evidence`'s range check, so the line is silently
dropped, or lands on Matchmaking/Networking. Either way, the D-08 census (`classifyMultiplayerEvidence`)
gets wrong or missing `recv` evidence for the Sockets interface, and the strict "verified"
criterion depends on that evidence. `helperIntegration.test.ts:2096` pins the call text
`gl_net_evidence(1, GL_NET_KIND_RECV, iface, ...` and never checks the value, so the test cannot
catch this.
**Fix:**
```c
const int iface = which == 2 ? GL_NET_IFACE_MESSAGES : GL_NET_IFACE_SOCKETS;
```
Add `-Werror=uninitialized` (or `-Wall -Werror`) to `buildHelperCompileArgv`. Also add a
host-harness test that runs `gl_nets_receive(0, …)` and asserts `iface=Sockets` in the emitted line.

### CR-02: Legacy ReadP2PPacket leaves an oversize packet at the head of the channel, so the channel stalls permanently or the game's read loop spins

**File:** `native/steam-bridge/helper/bridge_helper.c:656-671`
**Issue:** When `avail > limit`, where `limit = min(cubDest, capacity, 61440, respCap-20)`, the
helper logs `oversize` and returns `ret=0` without consuming the packet. `IsP2PPacketAvailable` is
wired separately and keeps reporting that same packet. Legacy reliable P2P allows packets up to
1 MB. The standard pattern `while (IsP2PPacketAvailable(&n)) { buf = alloc(n); ReadP2PPacket(buf, n, ...); }`
(Steamworks.NET, Facepunch, hand-rolled loops) never makes progress: the game either busy-loops
inside one frame or, if it breaks out on failure, never reads anything on that channel again. The
Sockets path (`gl_nets_receive`, line 1114) does the opposite and drops the oversize message, so
the two paths are inconsistent. "Never truncated" is met, but the cost is a dead channel.
**Fix:** consume and discard the packet on the helper side, then report the drop:
```c
if (avail > limit) {
  uint8_t *scratch = avail <= (1u << 20) ? malloc(avail) : NULL;
  uint32_t got = 0; uint64_t r = 0;
  if (scratch) {
    (void)g_bd_flat_SteamNetworking006_ReadP2PPacket(self, scratch, avail, &got, &r, chan);
    gl_cbq_secure_zero(scratch, avail);
    free(scratch);
  }
  gl_net_evidence(1, GL_NET_KIND_OVERSIZE, GL_NET_IFACE_NETWORKING, 0, avail, GL_NET_PATH_UNKNOWN);
}
```
Alternatively, raise the 61440 cap to the legacy maximum and stream the packet over a larger frame.

## Warnings

### WR-01: The GetAppBuildId trace lines (`event=apps`) are rejected by the trace parser and never reach the app log

**File:** `native/steam-bridge/steamclient-layer/lsteamclient/steamclient_main.c:424-434`, `src/backend/storeManagers/steam/bridge/drm/drmTrace.ts:96-103,234-260`
**Issue:** `gamelib_apps_emit` writes `[drm-trace] ... event=apps op=build-id ret=N` and
`op=build-id-given`. `parseDrmTraceLine` has no regex for `event=apps`, so `parseDrmTraceFile`
counts both lines as `rejected` and `games.ts:1074` never re-logs them. The commit message and
the code comment both say these two integers are traced, but no consumer can ever see them, so
nothing records whether the override fired. No test covers the grammar.
**Fix:** Add `TRACE_APPS_RE = /^\[drm-trace\] appId=(\d{1,10}) pid=([1-9]\d{0,9}) role=(game|helper) event=apps op=(build-id|build-id-given) ret=(-?\d{1,10})$/`
and a matching `DrmTraceEvent` variant plus formatter branch. Then add a drmTrace test that
round-trips both lines.

### WR-02: The appmanifest lookup is hard-wired to the default library and matches the first `"buildid"` token anywhere in the file

**File:** `native/steam-bridge/steamclient-layer/lsteamclient/steamclient_main.c:450,459-471`
**Issue:**
1. The path is always `C:\Program Files (x86)\Steam\steamapps\appmanifest_<id>.acf`. A game in
   any other bottle library folder (listed in `libraryfolders.vdf`) silently falls back to Mac
   Steam's answer. That answer is the wrong build id (0), which is the exact Raft mismatch this
   fix was written for.
2. The scan matches the literal `"buildid"` anywhere: inside a value (for example
   `"name" "buildid"`), or in a nested block that appears before the top-level key. The ACF is
   not parsed as KeyValues.
3. One `ReadFile` call with no loop. That is acceptable for local files, but a short read just
   returns 0.

**Fix:** Require the match at the top level: depth 1, at the start of a line after whitespace,
and in key position (preceded only by whitespace since the last newline). If the default path
misses, also try the library roots from `steamapps\libraryfolders.vdf`, or pass the resolved
manifest path in through an env var set by the launcher (validated like `GAMELIB_DRM_TRACE_FILE`).

### WR-03: The server-browser pool recycles objects Mac Steam still holds, so responses go to the wrong query

**File:** `native/steam-bridge/helper/bridge_helper.c:1691-1702,1907-1913`
**Issue:** Each query group has 8 static response objects. `gl_mms_obj_acquire` recycles the
oldest object even while its query is still outstanding in Mac Steam. CancelServerQuery goes
through the generic path, so it never releases the helper's binding either. A server browser that
pings or queries more than 8 servers at once (normal for favourites/history refresh) will have
Mac Steam call back on a recycled object. The old server's `gameserveritem_t`, players or rules
are then delivered under the new query's handle and released early, and the real response for
the new query arrives on an unbound object and is dropped (`handle 0`). The code comment accepts
this as "misattributes one event"; with more than 8 queries in flight it happens every time, not
once.
**Fix:** Raise `GL_MMS_POOL` to match the shim's 64-entry map. When the pool is full, refuse the
query (return -1) instead of recycling a live object. Release the binding on CancelServerQuery,
for example by giving it a `helperCustom` that calls Mac CancelServerQuery and then
`gl_mms_obj_release`.

### WR-04: The issued-handle ring evicts live requests and never forgets released ones

**File:** `native/steam-bridge/helper/bridge_helper.c:1825-1840,1962`
**Issue:** `gl_mms_issue` overwrites `g_mms_issued` round-robin and nothing removes an entry on
ReleaseRequest (generic path). This causes two failures:
1. A long-lived list request, such as Favorites kept open while Internet is refreshed 64 times,
   is evicted. After that `gl_mms_get_server_details` returns `present=0` for every server of a
   request that is still live. The shim's own 64-entry table still holds the request, so the
   symptom is a server list with no details.
2. Released handles stay "issued". A new Mac handle whose low 32 bits match a stale released
   one is refused and released right away (line 1881), so the server list request fails for no
   reason.

Once (1) has happened, the collision guard no longer covers the evicted live handle, so the
shim's `gl_mms_commit` dup branch (`gen_vtables.ts` ~3606) can overwrite a live entry's `obj`/`h64`.
**Fix:** Give ReleaseRequest a `helperCustom` that removes the handle from `g_mms_issued`. Make the
ring a set with explicit free slots and refuse new requests when it is full, rather than evicting.

### WR-05: GetServerDetails returns one per-request buffer that the next call overwrites

**File:** `meta/gen_vtables.ts:3719-3747`
**Issue:** The shim returns `gl_mms_tab[f].details`, a single 380-byte slot per request. Real
Steam returns a stable pointer per server, valid until ReleaseRequest. A game that collects
`gameserveritem_t*` for every index and then sorts or filters them (a common server-browser
pattern) sees every pointer alias the last server fetched. Another thread's
`gl_mms_get_server_details` can also rewrite the buffer while the game is reading it.
**Fix:** Cache details per `(request, iServer)`: allocate on first fetch and free on unmap. A
bounded per-request array is enough, since Mac `GetServerCount` gives the upper bound.

### WR-06: The NET evidence budget (32 lines, every send/recv logged) can starve the join and recv lines that D-08 needs

**File:** `native/steam-bridge/helper/bridge_helper.c:570-592,1141`; emitter `meta/gen_vtables.ts:7655-7667`
**Issue:** Every successful wired send and every receive with `n>0` emits a NET line, and after 32
lines the cap silences everything. A host that sends a world-sync burst of more than 32 packets
before the first inbound message, or before the 1221/504 join note resolves through slot 10,
never logs `recv` or `join`. `classifyMultiplayerEvidence` then returns `unverified` for a
session that worked, a false negative on the strict gate. The `path` kind is already latched
once per value; `send`/`recv` are not.
**Fix:** Latch `send`, `recv` and `oversize` once per `(kind, iface)`, the way `g_*_path_seen`
does, so that `join` is always within budget. Alternatively, give `join` its own budget that is
not shared with the others.

### WR-07: The P2P fallback accepts any remote, and the one it accepts is the latest 1202 rather than the one reported

**File:** `native/steam-bridge/helper/bridge_helper.c:1385-1396,1523-1526,2274`
**Issue:** `gl_p2p_fallback_accept` accepts `g_p2p_last_remote`, which is the most recent 1202 the
pump saw, not the remote in the 1202 whose dispatch the shim is reporting. With two 1202s in
flight, the first report accepts the second peer and the first peer is never accepted. More
broadly, when the game has no 1202 listener, the helper accepts a session from any Steam user who
sends one. That widens the attack surface: arbitrary peers can push packets into the game's
`ReadP2PPacket`, which a non-listening game on real Steam would not see unless it had sent to
that peer first. Separately, once 16 remotes are recorded the dedupe stops and every later 1202
is re-accepted.
**Fix:** Queue the remotes per 1202 (FIFO matching the order of slot-6 pops) and accept the one
matching the report. Limit the fallback to remotes the game has already sent to, or to the
current lobby's members, which matches real Steam's implicit-accept rule.

### WR-08: Sockets/Messages receive drops messages silently on handle-queue eviction and keeps stale queues after close

**File:** `native/steam-bridge/helper/bridge_helper.c:998-1036,1114-1119`
**Issue:**
1. When all 32 carry queues are in use, `gl_nets_queue_find(..., 1)` evicts another
   connection's whole queue through `gl_nets_queue_clear` and logs no `oversize` line, so the
   loss of reliable messages leaves no evidence.
2. Queues are never cleared on CloseConnection or DestroyPollGroup, so a reused handle value can
   be handed the previous connection's messages.
3. Any message over 61260 bytes is dropped. GNS allows reliable messages up to 512 KB, so a
   reliable stream loses a message silently from the game's point of view, which desyncs it.

**Fix:** Log `oversize` (or a dedicated `drop` kind) for every record freed in `gl_nets_queue_clear`
on eviction. Clear the queue in the CloseConnection/DestroyPollGroup/CloseChannelWithUser paths.
Document the 61260-byte ceiling as a known limitation in the shim coverage notes, or stream large
messages across several frames.

### WR-09: A held GameLobbyJoinRequested_t (333) never expires

**File:** `meta/gen_vtables.ts:4421-4441,4472-4481`
**Issue:** The latest 333 is held with no time limit and is delivered whenever a 333 listener
registers, even hours later. Call results held the same way expire after
`CALL_RESULT_HELD_EXPIRY_MS` (10 s). A stale invite can make the game join a lobby the user
clicked long ago, or one that no longer exists. Also, while no relay listener is registered at
all, `do_bcast` is false and the drain is skipped, so the hold never applies. The invite sits in
the 32-slot helper ring, where a slot-11/12 pump can evict it.
**Fix:** Stamp `born_ms` on held relay entries and expire them, for example after 60 s for 333.
Consider draining slot 6 when only hold rows are relevant.

## Info

### IN-01: GetAppBuildId casts both ISteamApps 007 and 008 params to the 007 struct without a static assert

**File:** `native/steam-bridge/steamclient-layer/lsteamclient/steamclient_main.c:480`
**Issue:** The P2P block pins the shared layout with `_Static_assert` (lines 372-379). The apps
block only asserts it in a comment.
**Fix:** `_Static_assert(offsetof(struct ISteamApps_STEAMAPPS_INTERFACE_VERSION007_GetAppBuildId_params, _ret) == offsetof(struct ISteamApps_STEAMAPPS_INTERFACE_VERSION008_GetAppBuildId_params, _ret), "apps layout");`

### IN-02: The apps trace lines use the P2P line budget

**File:** `native/steam-bridge/steamclient-layer/lsteamclient/steamclient_main.c:430`
**Issue:** `gamelib_apps_emit` claims keys through `gamelib_trace_claim`, which counts against
`GAMELIB_TRACE_MAX_P2P` (32). That budget exists so join evidence is not crowded out (comment at
line 266).
**Fix:** Give apps lines their own small budget.

### IN-03: `zeroHandleParam` on `hServerQuery` treats 0 as invalid, but the HServerQuery sentinel is -1

**File:** `meta/sdk/wire-policy.json:1458-1462`; `meta/gen_vtables.ts:5680-5687`
**Issue:** If Mac Steam ever issues HServerQuery 0, CancelServerQuery(0) unmaps the shim entry
and then returns without forwarding, so the Mac query is never cancelled and the helper pool
object stays bound. Unverified whether Mac Steam issues 0; flagged for confirmation.
**Fix:** For the query class, compare against `-1` (`HSERVERQUERY_INVALID`) instead of 0.

### IN-04: The GetAppBuildId override and the P2P trace are no-ops on 32-bit DRM games

**File:** `native/steam-bridge/steamclient-layer/lsteamclient/steamclient_main.c:499-501`
**Issue:** The `#else` stubs mean an i386 DRM title keeps Mac Steam's wrong build id. Worth
recording in the coverage notes.

### IN-05: `newestSiblingMethods` ignores a `helperInterface` preserved from the existing manifest

**File:** `meta/extractProtonInventory.ts:931-948`
**Issue:** It reads only `entry.helperInterface` from the acceptance entry. A family whose
helperInterface is preserved from disk through `preserveAccessorFields` (58-12) gets no
signature-mismatch demotion on re-extraction.
**Fix:** Fall back to the on-disk manifest's `helperInterface` when the acceptance entry omits it.

---

_Reviewed: 2026-10-31T19:35:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
