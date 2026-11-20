---
phase: quick-261101-iah
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - native/steam-bridge/helper/bridge_helper.c
  - src/backend/storeManagers/steam/bridge/__tests__/fixtures/net_harness_driver.c
  - src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
  - .planning/todos/pending/2026-11-01-legacy-p2p-fallback-accept-any-remote.md
  - .planning/todos/completed/2026-11-01-legacy-p2p-fallback-accept-any-remote.md
  - .planning/todos/pending/2026-11-01-p2p-fallback-shim-report-budget.md
  - .planning/phases/58-steam-bridge-multiplayer/58-VERIFICATION.md
  - .planning/STATE.md
autonomous: true
requirements: [WR-07]

must_haves:
  truths:
    - "Two 1202s served in order A then B, each reported with no listener, accept A then B: each report accepts the remote of the 1202 it reports, never the latest one"
    - "A 1202 from a remote the game never sent to and that is not a member of a lobby the game entered is refused: AcceptP2PSessionWithUser is not called"
    - "A remote the game sent a SendP2PPacket to, or a member of a lobby the game entered (504 with response 1), is accepted"
    - "No bounded table degrades to accept-all when full: the sent-to ring and lobby ring evict oldest (an evicted peer is refused), the served FIFO overflow is skipped in step so later reports still pair exactly, and there is no accept-once table left to saturate"
    - "No SteamID reaches a log line; the fallback still logs only fixed strings"
  artifacts:
    - path: "native/steam-bridge/helper/bridge_helper.c"
      provides: "served-1202 FIFO, sent-to ring, lobby ring, allowlisted gl_p2p_fallback_accept(remote)"
      contains: "GL_P2P_SERVED_MAX"
    - path: "src/backend/storeManagers/steam/bridge/__tests__/fixtures/net_harness_driver.c"
      provides: "p2pfb-* host-harness cases against fake Accept/lobby/drain symbols"
      contains: "p2pfb-order"
    - path: "src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts"
      provides: "jest assertions for each p2pfb-* case"
      contains: "p2pfb-stranger"
  key_links:
    - from: "dispatch_and_respond CONTROL_SLOT_DRAIN_CALLBACKS branch"
      to: "gl_p2p_note_served"
      via: "after gl_cbq_pop_encode, before gl_cbq_secure_zero(out)"
      pattern: "gl_p2p_note_served\\("
    - from: "dispatch_and_respond CONTROL_SLOT_REPORT_CB_DISPATCH branch"
      to: "gl_p2p_on_report"
      via: "every validated 1202 report pops exactly one served remote"
      pattern: "gl_p2p_on_report\\("
    - from: "dispatch_and_respond generic dispatch (next to gl_mms_lobby_log)"
      to: "gl_p2p_note_call"
      via: "STATUS_OK SendP2PPacket records its steamIDRemote in the sent-to ring"
      pattern: "gl_p2p_note_call\\("
---

<objective>
Close 58-REVIEW WR-07 (todo `.planning/todos/pending/2026-11-01-legacy-p2p-fallback-accept-any-remote.md`).
The helper's legacy-P2P fallback (`gl_p2p_fallback_accept`, bridge_helper.c ~1505) runs when the
shim reports a 1202 (P2PSessionRequest_t) that reached no listener. It has three defects:

1. It accepts `g_p2p_last_remote`, the latest 1202 the PUMP saw (captured ~1643), not the remote of
   the 1202 being reported. With two 1202s in flight the first peer is never accepted.
2. It accepts a session from any Steam user, so a stranger can push packets into a non-listening
   game's ReadP2PPacket. Real Steam only implicitly accepts peers the game has sent to.
3. After 16 recorded remotes the accept-once dedupe stops recording and every later 1202 is
   re-accepted.

Purpose: the fallback accepts exactly the reported peer, and only a peer the game already talks to.
Output: helper fix (helper only, no shim/generator change), host-harness cases, updated source pin,
todo closed, M-03 caveat text updated, one follow-up todo.

**Verification is harness-only.** No legacy-TCP-mode title is under live test (Schedule I uses
Sockets; Raft runs in DRM mode through the genuine client). M-03 therefore stays "VERIFIED with
caveats"; do NOT promote it to plain verified.
</objective>

<design>
Chosen design (implement exactly this; each choice is justified here so the executor does not
re-decide it):

**A. Per-1202 remote: served FIFO, paired at slot 6, not the pump.** The shim learns of each 1202
only by popping it through CONTROL_SLOT_DRAIN_CALLBACKS (slot 6; one message per round trip), then
delivers it and reports it through slot 10 before its next drain (gen_vtables.ts drain loop
~4535-4575: `gl_cb_deliver` then `gl_cb_report_dispatch(id, ndispatched, 0)`; 1202 is NOT a hold
row, gen_vtables.ts:3021, so a 1202 report is always `held=0`). So the helper records the remote at
SERVE time from the encoded Win bytes (`out + 12`, P2PSessionRequest_t.m_steamIDRemote at offset 0,
GL_CBQ_P2PSESSIONREQUEST_WIN_SIZE 8) into a FIFO, and every validated 1202 report on slot 10 pops
exactly one entry, whatever its counts. Only a report with `dn == 0 && dheld == 0` uses the popped
remote for a fallback accept. The pump-time `g_p2p_last_remote` / `g_p2p_last_valid` capture is
deleted. This is the review's own fix ("FIFO matching the order of slot-6 pops") and keeps the shim
and its 12-byte report frame unchanged, so there is no DLL redeploy and no old/new-peer skew.
Rejected alternative: carrying the remote inside the slot-10 frame. It is exact but needs a
generator change, a regenerated shim and a new frame length, and the allowlist (B) already bounds
the residual mis-pairing risk below.

**B. Allowlist: sent-to peers OR members of a lobby the game entered.** Real Steam's rule is that
sending a packet to a user implicitly accepts that user's session. Two sources, either suffices:
- Sent-to ring: every STATUS_OK SteamNetworking006.SendP2PPacket dispatch records its
  `steamIDRemote` (first 8 arg bytes; generated case at bridge_dispatch.h ~6660). Hooked in the
  helper next to `gl_mms_lobby_log` (bridge_helper.c ~2763), never in generated code.
- Lobby ring: every LobbyEnter (504) the pump sees with `m_EChatRoomEnterResponse == 1`
  (GL_CBQ_LOBBYENTER_MAC_OFF_RESPONSE 16) records `m_ulSteamIDLobby` (Mac offset 0). At accept time
  membership is checked LIVE with `g_bd_flat_SteamMatchMaking009_GetNumLobbyMembers` /
  `GetLobbyMemberByIndex` on `g_bd_self_steammatchmaking009`. Steam returns members only for
  lobbies the user is in, so a lobby the game has since left fails closed with no leave tracking.
Remote 0, a NULL flat pointer, or a NULL self pointer fails closed (refuse).

**C. Bounded tables: every one fails CLOSED when full; the accept-once table is removed.**
- Sent-to ring `GL_P2P_SENT_MAX 64` and lobby ring `GL_P2P_LOBBY_MAX 4`: insert skips a duplicate,
  otherwise overwrites the oldest. An evicted peer stops being allowlisted (refused), never the
  reverse.
- Served FIFO `GL_P2P_SERVED_MAX 32`: on overflow drop the oldest entry and increment
  `g_p2p_served_skip`; a report that finds `skip > 0` decrements it and accepts nothing. That keeps
  every later report paired with its own 1202 (the dropped entries' reports are consumed in step).
  An empty FIFO on report accepts nothing.
- The accept-once table (`g_p2p_accepted[]`, `GL_P2P_REMOTE_MAX 16`) is DELETED rather than given
  an eviction policy. Justification: (1) with A, each report is one 1202, so there is no duplicate
  report of one 1202 left to suppress; (2) a 1202 from a peer means Steam has no open session with
  it (it closed or timed out), and a real listener would accept again, so accept-once blocked
  reconnects; (3) after B the table is no longer a security gate, so its saturation behaviour is
  moot and the cleanest way to stop it degrading is not to have it. Volume stays bounded by the
  per-1202 pairing and by the shim's per-id report budget.
- Popped FIFO slots are zeroed (58-13: SteamIDs never linger).

**D. Logging.** Fixed strings only, no `logts_f` in the fallback body (existing pin), no SteamID or
lobby id ever logged: accept keeps `logts("CBQ", "p2p-accept src=helper")`; refuse logs
`logts("CBQ", "p2p-accept src=helper action=refused")`. Each has its own static budget
(`GL_P2P_LOG_MAX 16`, then silent). Skips and empty-FIFO reports log nothing.

**Residual risk (write into the SUMMARY and the todo Result):** a lost slot-10 report (transport
failure) or two shim threads running callbacks concurrently can pair a report with an adjacent
served 1202. B bounds the consequence to accepting a peer the game already sends to or shares a
lobby with, never a stranger. Separately, the shim's per-id report budget (4 per process,
gen_vtables.ts ~7192) caps fallback accepts at the first four 1202 reports per game process; that is
pre-existing and out of scope here, filed as a follow-up todo in Task 3.
</design>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/todos/pending/2026-11-01-legacy-p2p-fallback-accept-any-remote.md
@.planning/quick/261101-i00-fix-wr-05-per-request-iserver-stable-get/261101-i00-SUMMARY.md

Read before editing (scoped; bridge_helper.c is ~3,090 lines, read only these ranges):
- native/steam-bridge/helper/bridge_helper.c 655-667 (GL_P2P_* defines and P2P globals)
- native/steam-bridge/helper/bridge_helper.c 1500-1540 (gl_p2p_fallback_accept, gl_note_join_from_mac)
- native/steam-bridge/helper/bridge_helper.c 1630-1650 (pump: queued row, 1202 capture to delete)
- native/steam-bridge/helper/bridge_helper.c 2580-2645 (slot 10 report handler, slot 6 drain handler)
- native/steam-bridge/helper/bridge_helper.c 2755-2770 (generic dispatch, gl_mms_lobby_log hook)
- native/steam-bridge/helper/gamelib_cbqueue.h 98-125, 140-145 (1202/504 ids, sizes, offsets)
- src/backend/storeManagers/steam/bridge/__tests__/fixtures/net_harness_driver.c 1-10, 144-160, 294-330, 475-495 (include trick, fake wiring, control_call, main dispatch on argv)
- src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts 1-60 (runBoth, compile)
- src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts 2222-2233 (58-13 source pin to update)

<interfaces>
Existing (bridge_helper.c):
- `static void logts(const char *cat, const char *msg);` fixed string; `logts_f` literal formats only.
- `static uint32_t gl_cbq_pop_encode(gl_cbq_ring *r, uint8_t *out, uint32_t cap);` writes
  `[u32 count=1][i32 id][u32 cub][cub bytes]`, returns 12+cub (or 4 when empty, 0 on cap error).
- `gl_cbq_offer(&g_cbq, id, winBytes, winSize)` returns 1 when queued (drops new on full).
- `static void gl_cbq_secure_zero(void *p, size_t n);`
- `int bd_call_index(uint32_t ordinal, uint32_t slot);` with `BD_ORDINAL_SteamNetworking006`,
  `BD_SLOT_SteamNetworking006_SendP2PPacket` (0) from bridge_dispatch.h.
- Flat fns (bridge_dispatch.h): `g_bd_flat_SteamNetworking006_AcceptP2PSessionWithUser(void*, uint64_t)`,
  `int32_t g_bd_flat_SteamMatchMaking009_GetNumLobbyMembers(void*, uint64_t lobby)`,
  `uint64_t g_bd_flat_SteamMatchMaking009_GetLobbyMemberByIndex(void*, uint64_t lobby, int32_t i)`;
  selves `g_bd_self_steamnetworking006`, `g_bd_self_steammatchmaking009`.
- Slot 6 is served only when `g_inited && g_manual_dispatch`, after `gl_manual_pump_into_ring()`
  which calls `g_md_run_frame(g_hpipe)` and `g_md_get_next(...)` (static fn pointers, ~288-291).
- Slot 10 validation (keep unchanged): argLen 12, id allowlisted, `dn <= CBDISP_MAX_TARGETS`,
  `dheld <= 2`. Current call: `if (did == GL_CBQ_ID_P2P_SESSION_REQUEST && dn == 0 && dheld == 0) gl_p2p_fallback_accept();`

New (this plan):
- `static void gl_p2p_note_served(const uint8_t *out, uint32_t n);` push when `n == 12 + GL_CBQ_P2PSESSIONREQUEST_WIN_SIZE` and id at `out+4` is 1202.
- `static void gl_p2p_on_report(uint32_t dn, uint32_t dheld);` pop one (honour skip); accept iff `dn == 0 && dheld == 0`.
- `static void gl_p2p_note_call(int ci, const uint8_t *args, uint32_t argLen);` SendP2PPacket -> sent-to ring.
- `static void gl_p2p_note_lobby_from_mac(int32_t id, const uint8_t *mac);` 504 response 1 -> lobby ring.
- `static int gl_p2p_allowed(uint64_t remote);` sent-to ring hit OR live lobby membership.
- `static void gl_p2p_fallback_accept(uint64_t remote);` allowlist, then Accept + fixed log, or refuse log.

Harness pattern: the driver `#define main gl_helper_real_main` + `#include "bridge_helper.c"`, so it
can assign every `static` global and call every `static` function directly; `control_call(1, slot,
arg, len, &status, body, cap)` drives `dispatch_and_respond` on a socketpair. Cases dispatch on
`argv[1]`; the jest side calls `runBoth(name)` and asserts stdout/stderr.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Host-harness cases for per-1202, allowlisted fallback accept (RED)</name>
  <files>src/backend/storeManagers/steam/bridge/__tests__/fixtures/net_harness_driver.c, src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts, src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts</files>
  <behavior>
    - p2pfb-order: sent-to A and B; serve A then B via slot 6; two slot-10 reports (1202,0,0) -> Accept called with A then B, in that order (stdout prints both indices).
    - p2pfb-stranger: serve X (never sent to, no lobby); report (1202,0,0) -> 0 Accept calls; stderr has `p2p-accept src=helper action=refused`; X's decimal and hex forms never appear in stderr.
    - p2pfb-lobby: note a 504 (response 1) for lobby L whose fake member list holds Y; serve Y; report -> Accept(Y). Variant in the same case: a 504 with response 2 for lobby M (member Z) records nothing, serve Z, report -> refused. Variant: fake GetNumLobbyMembers returns 0 for L (left the lobby) -> serve Y again, report -> refused.
    - p2pfb-listener: serve A then B (both sent-to); report (1202,1,0) then (1202,0,0) -> exactly one Accept, with B (the listener report consumed A).
    - p2pfb-empty: report (1202,0,0) with nothing served -> 0 Accept calls, no crash.
    - p2pfb-reaccept: sent-to A; serve A, report, serve A, report -> 2 Accept calls (no accept-once table).
    - p2pfb-sent-evict: SendP2PPacket to 65 distinct peers P0..P64 (GL_P2P_SENT_MAX 64); serve P0, report -> refused (evicted fails closed); serve P64, report -> accepted.
    - p2pfb-overflow: all peers sent-to; serve 40 distinct remotes R0..R39 with no reports (GL_P2P_SERVED_MAX 32); then 9 reports (1202,0,0) -> the first 8 accept nothing (skip), the 9th accepts R8 exactly.
    - p2pfb-strangers-flood: serve and report 40 distinct never-sent-to remotes -> 0 Accept calls (the old 16-entry saturation path cannot reopen).
    - Source pin (helperIntegration.test.ts 58-13 test): drop the `GL_P2P_REMOTE_MAX 16` / `g_p2p_accepted_n` assertions; assert instead `#define GL_P2P_SERVED_MAX 32`, `#define GL_P2P_SENT_MAX 64`, `#define GL_P2P_LOBBY_MAX 4`, that `g_p2p_last_remote` and `g_p2p_accepted` are absent from the comment-stripped source, that the slot-6 branch calls `gl_p2p_note_served(` before its `gl_cbq_secure_zero(out`, that the slot-10 branch calls `gl_p2p_on_report(`, and that the generic dispatch calls `gl_p2p_note_call(`. Keep the existing assertions on the fixed `p2p-accept src=helper` line, no `%s` in NET/CBQ logs, and no `logts_f` in the gl_p2p_fallback_accept body.
  </behavior>
  <action>
In net_harness_driver.c add a `p2pfb-` branch in main() (BEFORE the existing `strncmp(c, "p2p-", 4)`
branch, and note `"p2pfb-"` does not match `"p2p-"`, so ordering is only for readability). Setup for
every p2pfb case: `g_dylib_handle = RTLD_DEFAULT` (already done above), `g_inited = 1`,
`g_manual_dispatch = 1`, fake `g_md_run_frame` (no-op) and fake `g_md_get_next` (returns 0, nothing
pumped) so slot 6 serves only what the case put in `g_cbq`; `g_bd_self_steamnetworking006 =
(void *)3`, `g_bd_self_steammatchmaking009 = (void *)2`; `g_bd_flat_SteamNetworking006_AcceptP2PSessionWithUser`
= a fake that records each remote into a static array and count; the two lobby fakes read a static
member table keyed by lobby id. Match the fake signatures to the typedefs in bridge_dispatch.h
(grep `BDFlatFn_SteamMatchMaking009_GetNumLobbyMembers_t` etc.) and to `MDRunFrame_t` / `MDGetNext_t`
in bridge_helper.c ~288.

Small static helpers in the driver: `serve(uint64_t remote)` = `gl_cbq_offer(&g_cbq, GL_CBQ_ID_P2P_SESSION_REQUEST, &remote, 8)` then `control_call(1, CONTROL_SLOT_DRAIN_CALLBACKS, NULL, 0, ...)` (this drives the real slot-6 wiring; for p2pfb-overflow, offering 40 entries can exceed the cbq ring, so serve one at a time: offer one, drain one); `report(uint32_t dn)` = `control_call(1, CONTROL_SLOT_REPORT_CB_DISPATCH, {1202, dn, 0}, 12, ...)`; `sent(uint64_t remote)` = `gl_p2p_note_call(bd_call_index(BD_ORDINAL_SteamNetworking006, BD_SLOT_SteamNetworking006_SendP2PPacket), args, len)` with args = 8-byte remote followed by the rest of a plausible SendP2PPacket blob (the hook reads only the first 8 bytes and requires argLen >= 8), mirroring how mms-lobby-args calls gl_mms_lobby_log directly; `lobby_enter(uint64_t lobby, int32_t resp)` = a 20-byte Mac LobbyEnter buffer (lobby at 0, response at GL_CBQ_LOBBYENTER_MAC_OFF_RESPONSE) passed to `gl_p2p_note_lobby_from_mac(GL_CBQ_ID_LOBBY_ENTER, buf)`. Each case prints `accepts=N` plus the accepted remotes' indices (never the raw ids) on stdout. Use SteamID-shaped constants (e.g. 76561198100000000ull + i).

In helperNetHarness.test.ts add one `test(...)` per case inside the existing darwin-only describe, using `runBoth`, asserting the behavior bullets (exact `accepts=` and index output; for p2pfb-stranger also `expect(err).not.toContain(String(X))` and the lowercase-hex form). Update the 58-13 source pin in helperIntegration.test.ts as the last behavior bullet says; rename its title to describe the new invariants.

This task is RED: the driver will not compile until Task 2 adds the new functions. Do not commit it alone; Task 2 commits both.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test "$(grep -c 'p2pfb-' src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts)" -ge 9 && test "$(grep -v '^\s*//' src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts | grep -c 'GL_P2P_REMOTE_MAX 16')" = 0 && npx prettier --file-info src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts && npx prettier --file-info src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts && npx prettier --check src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts   # net_harness_driver.c: prettier has no C parser (inferredParser null), so no --check applies to it; clang compiling it in Task 2 is its check</automated>
  </verify>
  <done>Nine p2pfb-* cases exist in the driver and in jest; the source pin asserts the new invariants and no longer asserts the 16-entry accept table; both TS files are prettier-clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Served FIFO, allowlist and fail-closed tables in bridge_helper.c (GREEN)</name>
  <files>native/steam-bridge/helper/bridge_helper.c</files>
  <behavior>
    - Every Task 1 case passes; every existing helperNetHarness and helperIntegration test still passes (the slot-10 CBDISP test may send 1202 reports with nothing served: empty FIFO, no accept, fine).
    - `pnpm build-steam-bridge` compiles the helper with clang (`-Werror=uninitialized` included).
  </behavior>
  <action>
Implement the `<design>` section exactly (WR-07). Concretely:

1. Globals block (~655-667): delete `GL_P2P_REMOTE_MAX`, `g_p2p_accepted[]`, `g_p2p_accepted_n`, `g_p2p_last_remote`, `g_p2p_last_valid`. Keep `GL_P2P_MAX_READ` and `g_p2p_path_seen`. Add `#define GL_P2P_SERVED_MAX 32`, `#define GL_P2P_SENT_MAX 64`, `#define GL_P2P_LOBBY_MAX 4`, `#define GL_P2P_LOBBY_MEMBERS_MAX 250` (Steam's lobby size ceiling; bounds the member loop), `#define GL_P2P_LOG_MAX 16`; the served FIFO (array, head, count, `g_p2p_served_skip`), the sent-to ring (array, next, n), the lobby ring (array, next, n). Comment block: helper-only, never logged, each table fails closed when full (per design C), and why the accept-once table is gone (design C, three reasons, one line each).

2. Replace gl_p2p_fallback_accept with the six functions in `<interfaces>` "New". `gl_p2p_note_served`: read id from `out + 4` and cub from `out + 8`; push only for 1202 with cub == GL_CBQ_P2PSESSIONREQUEST_WIN_SIZE and n == 12 + cub; on full, zero and drop the head and increment skip. `gl_p2p_on_report`: if skip > 0, decrement and return; if count == 0 return; pop head into a local, zero the slot; if `dn == 0 && dheld == 0` call `gl_p2p_fallback_accept(remote)`; zero the local. `gl_p2p_allowed`: remote != 0; linear scan of the sent-to ring; then for each recorded lobby, if both lobby flat fns and the matchmaking self are non-NULL, `n = GetNumLobbyMembers(self, lobby)`, clamp to `[0, GL_P2P_LOBBY_MEMBERS_MAX]`, compare each `GetLobbyMemberByIndex(self, lobby, i)`. `gl_p2p_fallback_accept(remote)`: return if the Accept fn or networking self is NULL; if allowed, call Accept and `logts("CBQ", "p2p-accept src=helper")` within its log budget; else `logts("CBQ", "p2p-accept src=helper action=refused")` within its own budget. No `logts_f` in this body (the source pin checks it). Update the M-04 comment above it to state the new contract: the remote of the reported 1202, accepted only if sent-to or a live lobby co-member, matching Steam's implicit-accept rule (58-REVIEW WR-07).

3. Wiring:
   - Pump (~1643): delete the `memcpy(&g_p2p_last_remote, ...)` / `g_p2p_last_valid = 1` block. In the same `row != NULL && size ok` branch add `if (msg.m_iCallback == GL_CBQ_ID_LOBBY_ENTER) gl_p2p_note_lobby_from_mac(msg.m_iCallback, msg.m_pubParam);` independent of `queued` (entering the lobby is Steam truth whether or not the ring had room). The size check that guards this branch already equals GL_CBQ_LOBBYENTER_MAC_SIZE for 504.
   - Slot 6 drain (~2629): after `n = gl_cbq_pop_encode(...)` and before `gl_cbq_secure_zero(out, ...)`, call `gl_p2p_note_served(out, n)` (only in the `g_inited && g_manual_dispatch` path).
   - Slot 10 (~2597): replace the 1202 line with `if (did == GL_CBQ_ID_P2P_SESSION_REQUEST) gl_p2p_on_report(dn, dheld);` so every 1202 report pops one entry. Leave all validation above it unchanged.
   - Generic dispatch (~2763): next to `gl_mms_lobby_log`, `if (status == STATUS_OK) gl_p2p_note_call(ci, argBlob, argLen);`. gl_p2p_note_call compares ci against `bd_call_index(BD_ORDINAL_SteamNetworking006, BD_SLOT_SteamNetworking006_SendP2PPacket)`, requires argLen >= 8, reads the u64 remote, ignores 0.
   Declare the new functions before first use if the file order requires it (the slot handlers are later in the file than ~1505, so defining them where gl_p2p_fallback_accept was is enough; check the pump at ~1643 also comes after).

4. Update the module doc comment for slot 10 / 1202 if it describes "latest remote" or "once per remote" (grep `1202` in the top comment, lines ~55-130), so the prose matches the new contract.

5. Run `pnpm build-steam-bridge` (clang helper compile; record if the later zig shim step fails for an environmental reason after the helper compiled; the shim sources are untouched so `git diff --name-only native/steam-bridge/generated meta/gen_vtables.ts` must be empty). Then `graphify update .`.

Commit Tasks 1+2 together: `fix(steam-bridge): legacy P2P fallback accepts only the reported, allowlisted remote (WR-07)` with the attribution trailer from the system reminder.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm build-steam-bridge && test -z "$(git diff --name-only native/steam-bridge/generated meta/gen_vtables.ts)" && npx jest src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts src/backend/storeManagers/steam/bridge/__tests__/cbqueue.test.ts && test "$(grep -v '^\s*//' native/steam-bridge/helper/bridge_helper.c | grep -c 'g_p2p_last_remote\|g_p2p_accepted')" = 0 && npx prettier --check src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts   # bridge_helper.c: prettier --file-info reports inferredParser null (no C parser), so it is excluded; clang in build-steam-bridge and in helperNetHarness is its check</automated>
  </verify>
  <done>All p2pfb-* harness cases pass on darwin (the describe is not skipped); existing helper tests pass; helper compiles; no shim or generator diff; pump-time last-remote capture and the accept-once table are gone.</done>
</task>

<task type="auto">
  <name>Task 3: Close the todo, update the M-03 caveat, file the report-budget follow-up, STATE row</name>
  <files>.planning/todos/pending/2026-11-01-legacy-p2p-fallback-accept-any-remote.md, .planning/todos/completed/2026-11-01-legacy-p2p-fallback-accept-any-remote.md, .planning/todos/pending/2026-11-01-p2p-fallback-shim-report-budget.md, .planning/phases/58-steam-bridge-multiplayer/58-VERIFICATION.md, .planning/STATE.md</files>
  <action>
1. Close the todo the way 261101-i00 did (commit 8bd4fdd8f): `git mv .planning/todos/pending/2026-11-01-legacy-p2p-fallback-accept-any-remote.md .planning/todos/completed/`, keep the frontmatter unchanged, append `## Result`: fixed in quick-261101-iah (name the Task 2 commit hash); per-1202 remote from a served FIFO paired with slot-10 reports; accept only sent-to peers or live lobby co-members; sent-to/lobby rings evict oldest (fail closed), served-FIFO overflow skipped in step, accept-once table removed (one-line reason); the residual mis-pairing risk and its bound (design section); verification is harness-only (name the nine p2pfb-* cases), because no legacy-TCP-mode title is under live test. State explicitly: the "Risk accepted" paragraph's attack surface is closed in code, and M-03 stays "verified with caveats" because the legacy fallback is not live-verified.

2. 58-VERIFICATION.md, M-03 row (the `| M-03 | ... | VERIFIED with caveats | ... |` line, ~69): keep the status cell `VERIFIED with caveats`. In the evidence cell append: "WR-07 fixed in code (quick-261101-iah: fallback accepts only the reported 1202's remote, and only sent-to peers or lobby co-members); harness-only, the legacy-P2P fallback is not live-tested on a legacy-TCP-mode title." Also correct that row's "CR-02 and WR-03/04/05/08 open" list ONLY for IDs with hard evidence of closure: WR-05 is closed by quick-261101-i00 (completed todo `2026-11-01-mmservers-getserverdetails-shared-buffer.md`, commit 9793f4039). For CR-02, WR-03, WR-04, WR-08, change the wording only if a file in `.planning/todos/completed/` or a commit subject (`git log --oneline --grep=<ID>`) names that 58 ID as fixed; otherwise leave it listed as open. Do not touch the frontmatter score line or any other row, and do not promote M-03.

3. New pending todo `.planning/todos/pending/2026-11-01-p2p-fallback-shim-report-budget.md`, frontmatter keys in this exact order with bare lowercase values: `created: 2026-11-01`, `title: '...'`, `area: steam-bridge`, `files: meta/gen_vtables.ts:7186-7197,native/steam-bridge/helper/bridge_helper.c` (re-check the line range with grep `gl_cb_report_dispatch(int32_t id`), then `severity: minor`, `platform: any`, `ready: code`. Body: the shim's per-id report budget of 4 (`gl_cb_report_dispatch`) also gates the helper's legacy-P2P fallback, so a non-listening legacy title gets helper accepts for at most its first four 1202 reports per process; any fix must keep the slot-10 report one-per-1202 so the served FIFO stays paired (e.g. exempt 1202 from the budget while keeping the helper's CBDISP log budget). Found while fixing WR-07 in quick-261101-iah; no live title currently hits it.

4. STATE.md: add a quick-task table row after the 261101-i00 row (same column shape), and update "Last activity" to `2026-11-01 - Completed quick task 261101-iah: WR-07 legacy P2P fallback accepts only the reported, allowlisted remote`. Row verification cell: harness pass counts, build-steam-bridge result, "no legacy-TCP-mode title under live test; M-03 stays verified with caveats".

Commit: `docs(quick-261101-iah): close WR-07 legacy P2P fallback todo` (todo move + new todo + 58-VERIFICATION), then the SUMMARY/PLAN/STATE docs commit after the SUMMARY is written, as i00 did.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test ! -e .planning/todos/pending/2026-11-01-legacy-p2p-fallback-accept-any-remote.md && grep -q '^## Result' .planning/todos/completed/2026-11-01-legacy-p2p-fallback-accept-any-remote.md && grep -q '^| M-03 | .*| VERIFIED with caveats | .*WR-07 fixed in code' .planning/phases/58-steam-bridge-multiplayer/58-VERIFICATION.md && grep -q 'ready: code' .planning/todos/pending/2026-11-01-p2p-fallback-shim-report-budget.md && pnpm planning-gates   # prettier: every path here is under .planning/, which `npx prettier --file-info` reports ignored (.prettierignore), so no --check applies</automated>
  </verify>
  <done>WR-07 todo lives only in completed/ with a Result; M-03 row still "VERIFIED with caveats" and names the WR-07 fix and the live-test gap; WR-05 shown closed; follow-up todo passes the frontmatter gate; STATE row added; planning gates pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| remote Steam user -> Mac Steam -> helper pump | any Steam user can send a 1202 (P2PSessionRequest) to the local account |
| shim (game process) -> helper slot 10 | dispatch reports are game-process input; counts are validated, remote is not carried |
| helper -> Steam AcceptP2PSessionWithUser | accepting opens a packet channel into the game's ReadP2PPacket |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-iah-01 | S/E (spoofed peer gains a channel) | gl_p2p_fallback_accept | mitigate | accept only sent-to peers or live lobby co-members (gl_p2p_allowed); p2pfb-stranger and p2pfb-strangers-flood prove refusal |
| T-iah-02 | T (wrong peer accepted) | report pairing | mitigate | served FIFO popped once per 1202 report, skip counter on overflow; p2pfb-order, p2pfb-listener, p2pfb-overflow |
| T-iah-03 | D (table saturation reopens accept-all) | sent-to ring, lobby ring, served FIFO | mitigate | all evict oldest or skip in step and fail closed; accept-once table removed; p2pfb-sent-evict |
| T-iah-04 | I (SteamID disclosure) | logs, scratch | mitigate | fixed-string logs only, budgeted; popped FIFO slots zeroed; p2pfb-stranger asserts the id never reaches stderr; source pin forbids logts_f in the fallback |
| T-iah-05 | T (mis-pairing after a lost report or concurrent shim threads) | report pairing | accept | consequence bounded by T-iah-01 to an allowlisted peer; documented in the todo Result |
</threat_model>

<verification>
- `npx jest src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts src/backend/storeManagers/steam/bridge/__tests__/cbqueue.test.ts` green on darwin, harness not skipped.
- `pnpm build-steam-bridge` compiles the helper; `git diff --name-only native/steam-bridge/generated meta/gen_vtables.ts` empty (helper-only fix).
- prettier clean on the two TS test files (the only prettier-parseable paths written).
- `pnpm planning-gates` green.
- No live gate: no legacy-TCP-mode title is under live test; say so in the SUMMARY.
</verification>

<success_criteria>
- All three WR-07 defects disproven by named harness cases: wrong-remote (p2pfb-order, p2pfb-listener), accept-any (p2pfb-stranger, p2pfb-lobby refusals), saturation (p2pfb-strangers-flood, p2pfb-sent-evict, p2pfb-overflow).
- Shim and generator untouched.
- Todo in completed/ with Result; M-03 still "VERIFIED with caveats" with the WR-07 fix and live-test gap recorded; report-budget follow-up todo filed.
</success_criteria>

<output>
Create `.planning/quick/261101-iah-legacy-p2p-fallback-accept-only-the-repo/261101-iah-SUMMARY.md` when done (same shape as 261101-i00-SUMMARY.md: Commits, What changed, Verification, Deviations, Self-Check).
</output>
