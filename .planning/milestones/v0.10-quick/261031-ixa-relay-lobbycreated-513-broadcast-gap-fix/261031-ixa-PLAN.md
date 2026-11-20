---
phase: quick-261031-ixa
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - native/steam-bridge/helper/gamelib_cbqueue.h
  - native/steam-bridge/helper/gamelib_callresult.h
  - native/steam-bridge/helper/bridge_helper.c
  - src/backend/storeManagers/steam/bridge/protocol.ts
  - src/backend/storeManagers/steam/bridge/__tests__/fixtures/cbqueue_harness.c
  - src/backend/storeManagers/steam/bridge/__tests__/cbqueue.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
  - meta/gen_vtables.ts
  - meta/__tests__/gen_vtables.test.ts
  - meta/__tests__/fixtures/callback_registry_harness.c
  - meta/__tests__/callbackRegistryHost.test.ts
  - native/steam-bridge/generated/steam_api_shim.c
  - native/steam-bridge/generated/bridge_dispatch.h
autonomous: false
requirements: [M-03, M-05]

must_haves:
  truths:
    - "When Mac Steam emits the LobbyCreated_t (513) broadcast, the helper queues it, repacked from the 12-byte Mac layout to the 16-byte x64 MSVC layout (m_eResult@0, m_ulSteamIDLobby@8), and logs `CBQ queued iCallback=513 cub=16`"
    - "The shim relays 513 to a game that registered a Callback<LobbyCreated_t> (CCallback or manual dispatch), and the existing 703 call-result path still completes a CallResult<LobbyCreated_t> for the same CreateLobby. A game that registers both sees both."
    - "510 (LobbyMatchList_t) stays call-result-only. The SUMMARY gives the reason: no live broadcast observation, and the SDK does not document it as a broadcast"
    - "A tracked call result that completes in the helper logs `CBQ callresult iCallback=<id> failed=<0|1> cub=<n>` once per id. The shim pulling it over slot 11 logs `CBQ callresult iCallback=<id> action=drained` once per id. The shim delivering it (CCallResult::Run, or a successful GetAPICallResult) logs `CBDISP iCallback=<id> targets=1 src=callresult`"
    - "An unlisted-id drop line says whether the id is a call-result id: `CBQ unlisted iCallback=<id> action=drop callresult=1` or `callresult=0`"
    - "Steady 1281/1222 traffic early in a session can no longer hide a later 513 line. CBQ queued/dropped lines and CBDISP lines are budgeted per id (4 each, at most 32 distinct ids), not by one process-wide cap. The shim's report budget is also per id, and it never spends a report on id 703, which the helper refuses"
    - "Operator: Schedule I hosted from GameLib logs `CBQ queued iCallback=513` and `CBDISP iCallback=513`, then calls SteamMatchMaking009.SetLobbyData. 'Add a player' no longer shows a blank host version"
  artifacts:
    - path: "native/steam-bridge/helper/gamelib_cbqueue.h"
      provides: "513 broadcast allowlist row with the measured field map"
      contains: "gl_cbq_map_513"
    - path: "native/steam-bridge/helper/gamelib_callresult.h"
      provides: "513 call-result rows resolve to the shared broadcast row (no duplicate map)"
      contains: "GL_CBQ_ID_LOBBY_CREATED"
    - path: "native/steam-bridge/helper/bridge_helper.c"
      provides: "callresult completion/drain logs, callresult= tag on unlisted drops, src=callresult CBDISP kind, per-id log budgets"
      contains: "callresult iCallback=%d"
    - path: "meta/gen_vtables.ts"
      provides: "LobbyCreated_t relay row, call-result delivery reported with kind 2, per-id shim report budget"
      contains: "broadcastRelayRow('LobbyCreated_t', false)"
    - path: "native/steam-bridge/generated/steam_api_shim.c"
      provides: "regenerated shim carrying `{513, 16u, 0}` in gl_cb_relay_table"
      contains: "{513, 16u, 0}"
  key_links:
    - from: "bridge_helper.c gl_manual_pump_into_ring (generic broadcast branch)"
      to: "gamelib_cbqueue.h gl_cbq_allow row 513"
      via: "gl_cbq_row(513) -> gl_cbq_repack_fields -> gl_cbq_offer"
      pattern: "GL_CBQ_ROW\\(GL_CBQ_ID_LOBBY_CREATED"
    - from: "meta/gen_vtables.ts CALLBACK_RELAY_TABLE"
      to: "generated gl_cb_relay_table / gl_cb_relay_size"
      via: "generateCallbackRegistryC relayRows"
      pattern: "\\{513, 16u, 0\\}"
    - from: "generated gl_cr_deliver / gl_md_get_api_call_result"
      to: "helper CONTROL_SLOT_REPORT_CB_DISPATCH"
      via: "gl_cb_report_dispatch(id, 1, 2)"
      pattern: "gl_cb_report_dispatch\\(id, 1, 2\\)"
---

<objective>
Close the Phase 58 gap seen live on Schedule I: Free Sample (3205720, TCP mode). Mac Steam broadcast
LobbyCreated_t (513). The helper dropped it as `CBQ unlisted iCallback=513 action=drop`, so the
game's `Callback<LobbyCreated_t>` handler never ran and never wrote its version into lobby data (no
SetLobbyData call). The result is "version mismatch — Host version: [blank]". Relay 513 as a
broadcast as well as the existing 703 call result, audit the other call-result ids, and make
call-result completion, drain and delivery visible in the helper log.

Purpose: a lobby-hosting game reaches its own lobby-created handler, as it does under real Steam.
Output: helper + shim changes, regenerated generated/ files, a rebuilt bridge, updated tests and
pins, and an operator live check.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.claude/skills/gamelib-conventions/SKILL.md
@.planning/phases/58-steam-bridge-multiplayer/58-07-SUMMARY.md
@.planning/phases/58-steam-bridge-multiplayer/58-10-SUMMARY.md

Live evidence: /tmp/gamelib-58-01-20261031T001305Z/launch-gamelib.prev.log (read-only). Across the
whole capture the helper logged `unlisted` for 1040011, 1040015, 1040044, 1270006, 1270009, 304,
336, 348 and 513. 510 was never seen as a broadcast. Only 9 CBDISP lines were logged, so the helper
cap of 32 was not hit. But the shim's process-wide report cap (16, `InterlockedIncrement(&g_gl_cb_reports) > 16`)
is also spent by manual-dispatch GetNext reports for the synthesized 703, which the helper refuses
with STATUS_ERR and never logs. So a 513 delivery could already have been invisible.

<interfaces>
Facts the executor needs, taken from the code, so no exploration is required:

gamelib_cbqueue.h (helper):
- Already defines GL_CBQ_ID_LOBBY_CREATED 513, GL_CBQ_LOBBYCREATED_MAC_SIZE 12 and GL_CBQ_LOBBYCREATED_WIN_SIZE 16. 513 has NO row in `gl_cbq_allow[]` (15 rows: 168, 1101, 503, 504, 505, 506, 507, 512, 1202, 1203, 1221, 1222, 1251, 1252, 1281).
- `gl_cbq_field_map {macOff, winOff, width}`, `GL_CBQ_ROW(id, win, mac, map)`, `gl_cbq_row(id)`, `gl_cbq_allowed_size(id)`, `gl_cbq_repack_fields(mac, win, row)`, `gl_cbq_note_unlisted(id)` (returns 1 the first time an id is seen).

gamelib_callresult.h (helper):
- `static const gl_cbq_field_map gl_cr_map_513[] = {{0, 0, 4}, {4, 8, 8}};`, with a gl_cr_rows entry for 513 and one for 510. `gl_cr_row(id)` checks gl_cr_rows first, then resolves 504 through `gl_cbq_row(id)`.
- `gl_cr_allowed_size`, `gl_cr_mac_size`, `gl_cr_lookup`, `gl_cr_complete`, `gl_cr_pop`.

bridge_helper.c:
- Pump `gl_manual_pump_into_ring()` (~1405-1507). The 703 branch has a `crId != 0` sub-branch that calls `gl_cr_complete(... 0)` on success and `gl_cr_complete(..., NULL, 0, 1)` on failure. It also calls `gl_cr_untrack` on an id or size mismatch. The generic branch logs `logts_f("CBQ", "unlisted iCallback=%d action=drop", ...)` and gates queued/dropped lines on `g_cbq_logged < 32` (declared ~284).
- Slot 10 `CONTROL_SLOT_REPORT_CB_DISPATCH` (~1897-1935) takes a 12-byte blob `{i32 id, u32 dn, u32 dheld}`. It rejects `dheld > 1`. It accepts ids with `gl_cbq_allowed_size(did) || gl_cr_allowed_size(did)`. It promotes `g_join_note` to a NET join, caps lines at CBDISP_LOG_MAX 32 (~300) with a one-time "cap of 32 reached" line (`g_cbdisp_logged`, `g_cbdisp_cap_noted`), and logs `CBDISP iCallback=%d targets=%u held=%u`.
- Slot 11 `CONTROL_SLOT_DRAIN_CALL_RESULTS` (~1962) runs `cn = gl_cr_pop(&g_cr, cout, sizeof cout)`. A reply with count 1 carries the id at byte offset 12.

meta/gen_vtables.ts:
- `broadcastRelayRow(name, hold)` (~2858). `CALLBACK_RELAY_TABLE` (~2874; 168, 1101, then 13 broadcastRelayRow rows). `CALL_RESULT_TABLE` (~2894; 513, 510, 504).
- Generated registry: `gl_cr_deliver` (~3264) ends with `gl_cb_report_dispatch(id, 1, 0)`. `gl_md_get_api_call_result` (~3618) copies the result and zeroes the entry on success, and does not report. `gl_md_get_next` (~3741) reports `(id, 1, 0)` once per front message, including the synthesized 703.
- Embedder `gl_cb_report_dispatch` (~6491) uses `static volatile LONG g_gl_cb_reports` with `> 16`. It is emitted BEFORE `${generateCallbackRegistryC()}`.

meta/msvcCallbackLayout.ts CALLBACK_LAYOUTS.LobbyCreated_t: id 513; x64 and x86 {size 16, m_eResult 0, m_ulSteamIDLobby 8}; mac {size 12, m_eResult 0, m_ulSteamIDLobby 4}.

Deployment facts, for Task 3: `pnpm build-steam-bridge` writes `public/bin/arm64/darwin/steam-bridge-helper`
and `public/bin/<arch>/darwin/steam_api{,64}.dll` (`src/backend/constants/paths.ts`
steamBridgeHelperPath / builtBridgeShim64Path). Every bridge launch runs `placeShimForGame()`
(games.ts ~3556; byte-identity check, so a stale shim in the game dir is refreshed with no
reinstall) and spawns the helper from steamBridgeHelperPath through `ensureHelperSpawned`
(helperProcess.ts ~333).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Helper relays 513 as a broadcast and logs call-result completion, drain and delivery</name>
  <files>native/steam-bridge/helper/gamelib_cbqueue.h, native/steam-bridge/helper/gamelib_callresult.h, native/steam-bridge/helper/bridge_helper.c, src/backend/storeManagers/steam/bridge/protocol.ts, src/backend/storeManagers/steam/bridge/__tests__/fixtures/cbqueue_harness.c, src/backend/storeManagers/steam/bridge/__tests__/cbqueue.test.ts, src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts</files>
  <behavior>
    - cbqueue harness `relay_row_sizes`: `gl_cbq_allowed_size(513) == 16`. `gl_cbq_allowed_size(510) == 0` and `gl_cbq_allowed_size(703) == 0` still hold.
    - New harness case `offer_513_broadcast`: a 12-byte Mac buffer with eResult=1 at 0 and lobby id 0x0110000100000042 at 4, repacked through `gl_cbq_row(513)` and offered with cub 16, is queued. Popped, the result is iCallback 513, cub 16, eResult at 0, lobby id at 8, and bytes 4..7 are zero.
    - `repack_513_positions` and the cr_* cases still pass, now with `gl_cr_row(513) == gl_cbq_row(513)` (one shared row). `gl_cr_mac_size(513) == 12` is unchanged.
    - cbqueue.test.ts cross-pin: the header's `gl_cbq_map_513` text equals the triples derived from CALLBACK_LAYOUTS.LobbyCreated_t: `{m_eResult mac, m_eResult x64, 4}` and `{m_ulSteamIDLobby mac, m_ulSteamIDLobby x64, 8}`, i.e. `{{0, 0, 4}, {4, 8, 8}}`.
    - helperIntegration slot 10: `cbDispatchBlob(513, 1, 2)` gets STATUS_OK and logs `CBDISP iCallback=513 targets=1 src=callresult`. `cbDispatchBlob(1101, 1, 2)` (not a call-result id) gets STATUS_ERR. `cbDispatchBlob(513, 1, 3)` gets STATUS_ERR. Neither ERR case logs a CBDISP line.
    - helperIntegration CBDISP budget (rewrite the existing 40-report test): after the earlier 1101/168 lines, 40 more `(1101, 1, 0)` reports produce exactly 4 CBDISP lines for 1101 in total, plus exactly one `CBDISP cap reached iCallback=1101` line. A `(168, 2, 0)` report sent after that is still logged, which proves the budget is per id.
    - Source pins: `CBQ", "unlisted iCallback=%d action=drop callresult=1"` and `... callresult=0"` are both present, and the old bare `action=drop"` format is gone. A `CBQ", "callresult iCallback=%d failed=%d cub=%u"` format and a `CBQ", "callresult iCallback=%d action=drained"` format exist. Every NET/CBQ/CBDISP format still matches the existing no-`%s`/`%p`/`%llu`/`%lx` and no-steamid/gameid/pending_call pins.
  </behavior>
  <action>
gamelib_cbqueue.h (per fix requirement 1):
- Add `static const gl_cbq_field_map gl_cbq_map_513[] = {{0, 0, 4}, {4, 8, 8}};` next to the other maps. Comment it with the layout: m_eResult@0, m_ulSteamIDLobby 4 (Mac pack 4) -> 8 (MSVC pack 8), measured in CALLBACK_LAYOUTS.
- Add `GL_CBQ_ROW(GL_CBQ_ID_LOBBY_CREATED, GL_CBQ_LOBBYCREATED_WIN_SIZE, GL_CBQ_LOBBYCREATED_MAC_SIZE, gl_cbq_map_513)` to `gl_cbq_allow[]`, after the 512 row.
- Update the block comment: 513 is relayed both as a broadcast and as a call result, because real Steam delivers LobbyCreated_t both ways and Steamworks.NET games may listen through either `Callback<>` or `CallResult<>`.

gamelib_callresult.h:
- Delete `gl_cr_map_513` and the 513 entry in `gl_cr_rows`. Make `gl_cr_row` resolve 513 through `gl_cbq_row`, exactly as it already resolves 504. Update the "504 shares the broadcast row" comment to name 504 and 513.
- Keep `GL_CR_ID_LOBBY_CREATED`. The track, complete and pop behaviour must not change.

bridge_helper.c, observability (requirements 3 and 4):
- (a) Add a small per-id log budget: a struct array of `{int32_t id; uint8_t n;}` with 32 slots plus a count, and one function that takes (budget, id, max) and returns 1 = log it, 2 = first refusal (emit a cap line), 0 = silent. When all 32 slots are taken, a new id returns 0.
  - Replace the `g_cbq_logged < 32` gate on the pump's queued/dropped lines with a CBQ budget of 4 per id. No cap line is needed for CBQ.
  - Replace `g_cbdisp_logged` / `CBDISP_LOG_MAX` / `g_cbdisp_cap_noted` with a CBDISP budget of 4 per id. On a return of 2, log the literal-format line `logts_f("CBDISP", "cap reached iCallback=%d", (int)did)`.
  - Delete the now-unused globals and define, so no unused-variable warning trips -Werror.
- (b) Unlisted drop: split the existing `logts_f` into two literal formats chosen by `gl_cr_allowed_size(msg.m_iCallback) != 0`: `"unlisted iCallback=%d action=drop callresult=1"` and `"unlisted iCallback=%d action=drop callresult=0"`. Two literals, not `%s`: the 58-07/58-13 pins forbid `%s` in CBQ formats.
- (c) In the 703 `crId != 0` branch, log once per id through a separate budget (max 1):
  - on completion: `logts_f("CBQ", "callresult iCallback=%d failed=%d cub=%u", (int)crId, failedFlag, (unsigned)macSize)`. Log it for both the success path and the failed path, and only when `gl_cr_complete` returned 1.
  - on the mismatch/untrack path: `logts_f("CBQ", "callresult iCallback=%d action=mismatch", (int)crId)`.
  - Do NOT log the handle (`m_hAsyncCall`), the requested h=… included. The NET/CBQ grammar never carries handles, and the id is enough to triage. Record this deviation from the request's example format in the SUMMARY.
- (d) In the slot 11 handler, after `gl_cr_pop` returns a reply with count 1, read the id from offset 12. Log `logts_f("CBQ", "callresult iCallback=%d action=drained", id)` once per id, using the same max-1 budget kind as (c) but a separate instance.
- (e) Slot 10: the third word becomes a kind: 0 = dispatched/dropped (as today), 1 = held, 2 = call result delivered.
  - Reject `dheld > 2`.
  - Reject kind 2 unless `gl_cr_allowed_size(did) != 0` and `dn <= 1`.
  - Keep the `g_join_note` promotion for every kind.
  - For kind 2, log the literal format `"iCallback=%d targets=%u src=callresult"`. For kinds 0 and 1, keep the existing `"iCallback=%d targets=%u held=%u"`.
  - Update the slot-10 comment. An old shim never sends 2. A new shim against an old helper gets STATUS_ERR, and the shim ignores that result, so only a log line is lost.

protocol.ts: update the slot-10 comment near line 140 so it documents the third word as a kind (0/1/2). Comment only, no code change.

Tests: update the cbqueue harness and cbqueue.test.ts CASES (add `offer_513_broadcast`), and helperIntegration (the unlisted pin, the CBDISP budget test rewrite, the new slot-10 kind-2 assertions, and source pins for the two callresult formats), following the behaviour list above.

Do not touch: the 1101 stats path, the 168 credential handling, the 504/1221 join classifier, or 510's call-result-only status.

Audit (requirement 2), to record in the SUMMARY:
- 504 is already relayed as a broadcast.
- 513 is added on live evidence (`unlisted iCallback=513` in the capture).
- 510 is not added. It was never observed as a broadcast in the capture, and the SDK documents LobbyMatchList_t only as the RequestLobbyList call result.
- The new `callresult=1` tag on unlisted drops will flag 510 if Mac Steam ever broadcasts it.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm exec jest src/backend/storeManagers/steam/bridge/__tests__/cbqueue.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts && npx prettier --check src/backend/storeManagers/steam/bridge/protocol.ts src/backend/storeManagers/steam/bridge/__tests__/cbqueue.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts</automated>
    Prettier scope: `npx prettier --file-info` reports `inferredParser: null` for bridge_helper.c, gamelib_cbqueue.h, gamelib_callresult.h and cbqueue_harness.c. They are not ignored, but prettier has no C parser, so a check over them would error rather than prove anything. They are deliberately left out of the check. Compile correctness for them comes from the cbqueue harness (`clang -Wall -Werror`) and helperIntegration (it compiles the real bridge_helper.c).
  </verify>
  <done>513 is in gl_cbq_allow with the {0,0,4},{4,8,8} map, and gl_cr_row(513) shares that row. The pump logs callresult completion/mismatch once per id, the slot-11 drain logs once per id, unlisted drops carry callresult=0|1, slot 10 accepts kind 2 and logs src=callresult, and CBQ/CBDISP lines are budgeted per id. The named jest suites and the scoped prettier check pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Shim relays 513, reports call-result delivery as kind 2 with a per-id budget; regenerate and build</name>
  <files>meta/gen_vtables.ts, meta/__tests__/gen_vtables.test.ts, meta/__tests__/fixtures/callback_registry_harness.c, meta/__tests__/callbackRegistryHost.test.ts, native/steam-bridge/generated/steam_api_shim.c, native/steam-bridge/generated/bridge_dispatch.h</files>
  <behavior>
    - gen_vtables.test 58-10 relay test: the broadcast id list includes 513 (14 ids). `{513, 16u, 0}` is in the registry source, `arches` is undefined, and the x64 and x86 sizes are equal. Rename the test title from "13" to "14".
    - `CALL_RESULT_TABLE.map(r => r.id)` is still `[513, 510, 504]`. 510 is still NOT in CALLBACK_RELAY_TABLE (assert it explicitly).
    - Embedder hook test (replaces "capped at 16"): the hook body contains no `> 16` process-wide cap. It indexes a generated `gl_cb_report_ids[]` array, which is the deduplicated union of CALLBACK_RELAY_TABLE and CALL_RESULT_TABLE ids and does NOT contain 703. It returns early for an id not in that array, and caps each id at 4 reports with an Interlocked per-id counter.
    - The registry source contains `gl_cb_report_dispatch(id, 1, 2)` inside `gl_cr_deliver`, and a kind-2 report in `gl_md_get_api_call_result` on its success path, called after `GL_CB_UNLOCK()`.
    - callback registry harness: `cr_report_hook` expects held/kind == 2 for both deliveries. New case `md_callresult_report`: a manual-dispatch result fetched through `gl_md_get_api_call_result` produces exactly one report (id 513, nd 1, kind 2) with no lock held, and a fetch with the wrong id or size produces none. New case `relay_513_dispatch`: a slot-6 reply of id 513 with cub 16 is dispatched to a registered 513 CCallback. Add both names to callbackRegistryHost.test.ts CASES.
  </behavior>
  <action>
meta/gen_vtables.ts:
- (a) Add `broadcastRelayRow('LobbyCreated_t', false)` to CALLBACK_RELAY_TABLE, after LobbyKicked_t, per requirement 1 (mirrors the helper row from Task 1). Update the doc comment: 513 is both a broadcast and a call result. A game with Callback<> and CallResult<> sees both. Each path is independent: the broadcast goes through slot 6 into the relay/FIFO, and the call result goes through slot 11 into Run or GetAPICallResult.
- (b) In the generated `gl_cr_deliver`, change the final report to `gl_cb_report_dispatch(id, 1, 2)`.
- (c) In the generated `gl_md_get_api_call_result`, record success in a local. After `GL_CB_UNLOCK()`, call `gl_cb_report_dispatch((int32_t)iExpected, 1, 2)` when it succeeded. The lock rule says the hook is never called under the registry lock.
- (d) Rewrite the embedder `gl_cb_report_dispatch` (~6491):
  - Emit `static const int32_t gl_cb_report_ids[]` from the deduplicated union of CALLBACK_RELAY_TABLE and CALL_RESULT_TABLE ids, and `static volatile LONG g_gl_cb_report_n[<count>]`.
  - Find the id's index by linear scan. Return when the id is not found; this covers 703, which the helper refuses, so GetNext of the synthesized 703 no longer spends budget.
  - Return when `InterlockedIncrement(&g_gl_cb_report_n[i]) > 4`.
  - Leave the 12-byte frame unchanged.
  - Update the comment to say this is a per-id budget of 4, and why: one process-wide cap of 16 was spent by early 1281/1222 traffic and by refused 703 reports.
- Check that the 32-bit path compiles. `#if !defined(__i386__)` guards only the md FIFO code, and the hook is shared.

Then:
- Run `pnpm gen-vtables` to regenerate native/steam-bridge/generated/. Commit steam_api_shim.c and any bridge_dispatch.h change.
- Update the tests above (gen_vtables.test.ts, callback_registry_harness.c, callbackRegistryHost.test.ts).

Build: before running `pnpm build-steam-bridge`, run `pgrep -fl steam-bridge-helper`. The operator has Schedule I running on a helper spawned from public/bin.
- If a helper is running, do NOT run the build. Overwriting the binary of a running Mach-O helper risks a code-signature kill of the operator's live session. Record "build deferred to operator step 1" in the SUMMARY. The compile proof for this task then rests on the jest suites, which compile the registry, the harness and the real helper, and on wireExtendedCompile / shimAbiGate.
- If no helper is running, run `pnpm build-steam-bridge` and record its exit status.

Do not launch games, restart tauri dev, or read or write ~/Library/Logs/GameLib. Stage only the paths in this plan's files_modified list. Unrelated user changes are uncommitted in the tree. Never use git stash.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm gen-vtables && pnpm exec jest meta/__tests__/gen_vtables.test.ts meta/__tests__/callbackRegistryHost.test.ts meta/__tests__/shimAbiGate.test.ts meta/__tests__/wireExtendedCompile.test.ts meta/__tests__/x86CallbackWineHarness.test.ts meta/__tests__/msvcCallbackBaseLayout.test.ts src/backend/storeManagers/steam/bridge/__tests__/cbqueue.test.ts && npx prettier --check meta/gen_vtables.ts meta/__tests__/gen_vtables.test.ts meta/__tests__/callbackRegistryHost.test.ts</automated>
    After committing, a second `pnpm gen-vtables` must leave `git status --porcelain native/steam-bridge/generated/` empty, which proves the generated files are up to date. Prettier scope: callback_registry_harness.c and the generated .c/.h have `inferredParser: null` (no C parser) and are deliberately left out of the check. Known unrelated failures to ignore if a wider sweep is run: the steamclientLayerNotice NOTICE pin (intentional until 58-08), genI18nGateScope A-17, and i18nCatalogChurnGuard on the live tree.
  </verify>
  <done>CALLBACK_RELAY_TABLE carries 513 at 16 bytes, and the regenerated shim has `{513, 16u, 0}`. Call-result delivery (Run and GetAPICallResult) reports kind 2. The shim's report budget is 4 per id and never reports 703. The named suites and the scoped prettier check pass. The bridge build either ran with exit 0, or was deferred because a live helper was running, and the SUMMARY records which.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Operator live check on Schedule I (host a lobby)</name>
  <files>none (operator-only; the executor does not launch games, restart tauri dev or touch ~/Library/Logs/GameLib)</files>
  <action>The executor stops here and presents the how-to-verify steps to the operator verbatim, adding whether the Task 2 build ran or was deferred. The operator performs the steps.</action>
  <verify>Operator confirms that `CBQ queued iCallback=513`, `CBDISP iCallback=513` and `CALL SteamMatchMaking009.SetLobbyData` appear after Host, and that the host version is not blank.</verify>
  <done>Operator replies "approved", or pastes log lines that the SUMMARY then records.</done>
  <what-built>
The helper relays LobbyCreated_t (513) as a broadcast, repacked to 16 bytes, while still completing the CreateLobby call result through 703. Call-result completion, drain and delivery now each log a line. The shim and helper log budgets are per id, so a late 513 line cannot be crowded out.
  </what-built>
  <how-to-verify>
1. Quit Schedule I. Then confirm no stale helper is alive: `pgrep -fl steam-bridge-helper` must print nothing. If it prints anything, quit GameLib, or `kill` that pid.
2. If the SUMMARY says "build deferred", run `pnpm build-steam-bridge` now and confirm it exits 0. Confirm the helper is fresh with `stat -f '%Sm' public/bin/arm64/darwin/steam-bridge-helper`; the time should be just now.
3. Restart tauri dev. It does not rebuild the sidecar, but no sidecar code changed here. The restart guarantees the old helper process is gone and the next launch spawns the new binary from public/bin. No reinstall is needed: every bridge launch runs placeShimForGame, which compares the game's steam_api64.dll byte-for-byte with public/bin and replaces it when it differs.
4. Launch Schedule I: Free Sample (3205720) from GameLib, then choose Host.
5. In the GameLib log, after the `HELLO shim attached appid=3205720` line, expect all of the following:
   - `CALL SteamMatchMaking009.CreateLobby`
   - `CBQ queued iCallback=513 cub=16` (no `unlisted iCallback=513`)
   - `CBQ callresult iCallback=513 failed=0 cub=12`
   - `CBQ callresult iCallback=513 action=drained`
   - at least one `CBDISP iCallback=513 targets=1 ...`: `held=0` for the broadcast and/or `src=callresult` for the call result
   - then `CALL SteamMatchMaking009.SetLobbyData`
6. In game, open "add a player". The host version must now read 0.2.9f8 (not blank).
7. Report back the 513-related lines and whether SetLobbyData appeared. If only `src=callresult` appears and SetLobbyData is still missing, say so: the game would then be listening some other way, and that is a follow-up.
  </how-to-verify>
  <resume-signal>Type "approved", or paste the relevant log lines and describe what is still wrong</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Mac Steam -> helper pump | Callback bytes from steamclient (trusted vendor, but size-checked against the measured layout) |
| shim (in Wine game process) -> helper CONTROL slots 10/11 | Authenticated loopback frames. The game process is untrusted for content. |
| helper -> GameLib log | Log lines must never carry SteamIDs, handles or ticket bytes |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ixa-01 | Information disclosure | new CBQ callresult / drained lines | mitigate | Integer id, failed flag and size only. No handle, no lobby SteamID. The existing source pins forbid `%s`/`%p`/`%llu`/`%lx` and steamid/gameid/pending_call tokens in CBQ/CBDISP formats, and Task 1 extends them to the new formats |
| T-ixa-02 | Tampering | 513 broadcast repack | mitigate | Queued only when `cub == GL_CBQ_LOBBYCREATED_MAC_SIZE` (12). The field map is bounds-checked in gl_cbq_repack_fields and cross-pinned to CALLBACK_LAYOUTS in cbqueue.test.ts. The offer demands the exact wire size of 16 |
| T-ixa-03 | Denial of service | slot 10 kind 2 / per-id log budgets | mitigate | Kind is bounded to 0..2, kind 2 is accepted only for call-result ids with dn <= 1, and the per-id budgets have a fixed 32-id table (new ids beyond it are silent). The shim budget is 4 per id over a fixed generated id list |
| T-ixa-04 | Information disclosure | LobbyCreated_t contents relayed to the game | accept | The game is the intended recipient of its own lobby id, which real Steam delivers the same way. The bytes are never logged, and the ring/entries are secure-zeroed on pop as today |
| T-ixa-05 | Denial of service | build overwriting a running helper binary | mitigate | Task 2 checks `pgrep` first and defers the build to the operator when a helper is live |
</threat_model>

<verification>
- `grep -c 'GL_CBQ_ROW(GL_CBQ_ID_LOBBY_CREATED' native/steam-bridge/helper/gamelib_cbqueue.h` is 1, and `grep -c '{513, 16u, 0}' native/steam-bridge/generated/steam_api_shim.c` is at least 1.
- `grep -v '^\s*//' native/steam-bridge/helper/bridge_helper.c | grep -c 'action=drop"'` is 0 (the old bare format is gone).
- Task 1 and Task 2 jest suites are green, as is a scoped prettier check on the touched TS.
- Operator check (Task 3) approved.
</verification>

<success_criteria>
- 513 is relayed as a broadcast (helper row + shim row), repacked 12 -> 16, and the 703 call-result path still works.
- The call-result audit is recorded in the SUMMARY: 504 already relayed, 513 added on evidence, 510 not added, with reasons.
- Call-result completion, drain and delivery are each visible in the helper log, and unlisted drops carry `callresult=0|1`.
- Live: Schedule I calls SetLobbyData after hosting, and the host version is no longer blank.
</success_criteria>

<output>
Create `.planning/quick/261031-ixa-relay-lobbycreated-513-broadcast-gap-fix/261031-ixa-SUMMARY.md` when done. Include the call-result audit table, the handle-omission deviation from the requested `CR complete h=…` format, the build-ran-or-deferred note, and the exact operator steps from Task 3.
</output>
