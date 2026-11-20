---
phase: quick-261106-qvp
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - native/steam-bridge/helper/bridge_helper.c
  - src/backend/storeManagers/steam/bridge/protocol.ts
  - src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/fixtures/net_harness_driver.c
  - meta/gen_vtables.ts
  - meta/__tests__/fixtures/callback_registry_harness.c
  - meta/__tests__/callbackRegistryHost.test.ts
  - native/steam-bridge/generated/steam_api_shim.c
  - .planning/todos/pending/2026-11-01-callback-1298-on-bridge-join-path.md
autonomous: true
requirements: [D-09]
must_haves:
  truths:
    - "The helper's one-per-id unlisted drop line carries the payload size: `CBQ unlisted iCallback=<id> action=drop callresult=<0|1> cub=<m_cubParam>`; the prefix `CBQ unlisted iCallback=<id> action=drop` is byte-identical to before, so the 58-33 grep `CBQ +unlisted iCallback=<id> action=drop` still matches"
    - "When a game registers a C++ CCallback for an id that is not in the relay table through the shim's SteamAPI_RegisterCallback, the helper logs `CBREG iCallback=<id> role=game path=register` once per id (at most 32 distinct ids)"
    - "When a game calls SteamAPI_ManualDispatch_Init through the shim, the helper logs exactly one `CBREG role=game path=manual-dispatch registration=unobservable` line, so the log itself says registration could not be seen"
    - "The shim never transacts with the helper from inside SteamAPI_RegisterCallback or SteamAPI_ManualDispatch_Init; reports are queued and flushed from the next RunCallbacks / ManualDispatch_RunFrame with no registry lock held"
    - "A shim with an old helper (no slot 15) and an old shim with a new helper both keep working: the report result is ignored"
    - "The todo records which registration paths are observable and gives the gate runner a static fallback step for a manual-dispatch title"
  artifacts:
    - path: "native/steam-bridge/helper/bridge_helper.c"
      provides: "cub on the unlisted line; CONTROL_SLOT_REPORT_CB_REGISTER 15 handler logging CBREG"
      contains: "CONTROL_SLOT_REPORT_CB_REGISTER 15"
    - path: "meta/gen_vtables.ts"
      provides: "registry-side pending CBREG reports, flush from the run paths, embedder hook gl_cb_report_register"
      contains: "gl_cb_report_register"
    - path: "native/steam-bridge/generated/steam_api_shim.c"
      provides: "regenerated shim source (pnpm gen-vtables)"
    - path: "src/backend/storeManagers/steam/bridge/protocol.ts"
      provides: "CONTROL_SLOT.reportCbRegister = 15"
  key_links:
    - from: "meta/gen_vtables.ts gl_cb_register"
      to: "helper CONTROL slot 15"
      via: "pending report flushed by the run path -> gl_cb_report_register -> bridge_transact(BRIDGE_CONTROL_ORDINAL, BRIDGE_CONTROL_SLOT_REPORT_CB_REGISTER, 8-byte blob)"
      pattern: "BRIDGE_CONTROL_SLOT_REPORT_CB_REGISTER"
    - from: "protocol.ts CONTROL_SLOT.reportCbRegister"
      to: "bridge_helper.c #define CONTROL_SLOT_REPORT_CB_REGISTER and gen_vtables.ts #define BRIDGE_CONTROL_SLOT_REPORT_CB_REGISTER"
      via: "protocol.test.ts parity pin"
      pattern: "REPORT_CB_REGISTER (\\d+)"
---

<objective>
Callback 1298, step 1 (todo `2026-11-01-callback-1298-on-bridge-join-path.md`, D-09 follow-up from 58-33 item 7). Make the next live join gate able to answer two questions from logs alone:
(1) does the GAME register a listener for iCallback 1298, and (2) what is 1298's payload size (m_cubParam) as Mac Steam delivers it.

Purpose: decide later, with evidence, whether 1298 needs a relay row. This plan adds NO relay row, NO struct layout and NO struct name (D-09: nothing wired speculatively; the todo forbids guessing a name).

Output: a `cub=` field on the helper's unlisted drop line; a new CONTROL slot 15 (`REPORT_CB_REGISTER`) logged as `CBREG`; shim-side reporting of game registrations of unlisted ids and of manual-dispatch mode; tests; regenerated shim; a gate-runner step in the todo.

Registration observability (state this verbatim in the SUMMARY):
- C++ `CCallback` objects through the shim's `SteamAPI_RegisterCallback` (x64 and x86; the registry is shared): OBSERVABLE, logged `CBREG iCallback=<id> role=game path=register`.
- Manual dispatch (`SteamAPI_ManualDispatch_Init` / `RunFrame` / `GetNextCallback`, used by Steamworks.NET and Facepunch.Steamworks): NOT OBSERVABLE. The managed dispatcher keeps its listener table internally and never tells the shim which ids it wants. The shim logs one `CBREG role=game path=manual-dispatch registration=unobservable` line so the gate cannot mistake absence of `CBREG path=register` for "no listener".
- `SteamAPI_RegisterCallResult`: NOT LOGGED. It carries a call handle, not an id (`gl_cr_register(cb, h)`), and 1298 arrives as a broadcast callback, not a call result. The existing `callresult=` field on the unlisted line already says whether the helper's call-result table knows the id.
- DRM mode (genuine `steam_api64.dll` + GameLib `lsteamclient`, `role=game` trace): NOT OBSERVABLE. Registration lives in the genuine DLL's callback manager; lsteamclient only sees `Steam_BGetCallback` polling. No code change there (that would also mean re-publishing the pinned lsteamclient archive); recorded as a notes line in the todo.
- The test title Schedule I (3205720) is Unity/Mono with Steamworks.NET 2024.8.0 (58-01-TITLES.md), so it is expected to run in manual-dispatch mode in bridge-shim mode. Question (1) is therefore expected to be answered by the static fallback step written in Task 3, and the new `CBREG path=manual-dispatch` line confirms the mode at the gate. Question (2) is answered by the new `cub=` field regardless of mode.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-11-01-callback-1298-on-bridge-join-path.md

Load `Skill("gamelib-conventions")` (verify-block formatter rule; todo frontmatter rule) and skim `Skill("spike-findings-gamelib")` reference `macos-steam-bridge.md` before editing bridge code.

Source anchors (read these ranges, do not explore further unless a grep is needed):
- `native/steam-bridge/helper/bridge_helper.c` ~1771-1780: the unlisted drop site (`gl_cbq_note_unlisted`, two `logts_f("CBQ", "unlisted iCallback=%d action=drop callresult=%d")` literals). ~85-140: the CONTROL slot doc block. ~225-246: `CONTROL_SLOT_*` defines (14 is the highest; 15 is free, protocol.test.ts notes 13/14 were taken by 58-29). ~335-360: `gl_logbudget` / `gl_logbudget_take` (1 = log, 2 = first refusal, 0 = silent; 32-id table) and the existing `g_cbdisp_budget`. ~2770-2810: the slot 10 `REPORT_CB_DISPATCH` handler, the pattern to copy (auth-gated, exact-length blob, validate, `send_response`).
- `meta/gen_vtables.ts` ~3080-3135: registry embedder contract doc. ~3298-3325: `gl_cb_register` (takes `GL_CB_LOCK`, has an early-return overflow path). ~3383: `gl_cr_register` (handle only, no id). ~4266: `gl_md_init` (x64 only, inside `#if !defined(__i386__)`). ~4272: `gl_md_run_frame`. The RunCallbacks body the `SteamAPI_RunCallbacks` export calls (grep `SteamAPI_RunCallbacks` in gen_vtables.ts to find it). ~6620: `#define BRIDGE_CONTROL_SLOT_REPORT_CB_DISPATCH 10`. ~7063-7088: `gl_cb_report_dispatch` embedder implementation (the transport pattern).
- `meta/__tests__/fixtures/callback_registry_harness.c` ~140-160: the `gl_cb_report_dispatch` test hook (records reports, asserts the lock is not held). `meta/__tests__/callbackRegistryHost.test.ts` line 19: `CASES` list.
- `src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts` ~123-131 `cbDispatchBlob`, ~1396-1475 the slot 10 test (pattern for slot 15), ~1643-1667 the 58-07 source pin that pins the unlisted literals.
- `src/backend/storeManagers/steam/bridge/__tests__/fixtures/net_harness_driver.c` ~186-215: `inj_push`, `inj_pump`, `inj_setup` (inject a callback into the helper's manual pump); ~522 case dispatch on `argv[1]`. `helperNetHarness.test.ts`: how cases are run and stderr asserted.
- `src/backend/storeManagers/steam/bridge/protocol.ts` ~109-166: `CONTROL_SLOT` (ends `inviteFriend: 14`). `protocol.test.ts` ~294-312 and ~479-492: slot parity pins against the helper and shim defines.

Interfaces (existing):
- helper: `static int gl_logbudget_take(gl_logbudget *b, int32_t id, unsigned max);` `static int gl_cbq_allowed_size(int32_t id);` (0 = not listed) `static int gl_cr_allowed_size(int32_t id);` `logts_f(const char *cat, const char *fmt, ...)`; `send_response(fd, requestId, STATUS_OK|STATUS_ERR, NULL, 0)`.
- shim embedder: `static int bridge_transact(uint16_t ordinal, uint16_t slot, const uint8_t *req, uint32_t reqLen, uint8_t *resp, uint32_t cap, uint32_t *lenOut);` (lazily connects and HELLOs, which is why it must not be called from inside RegisterCallback, see Task 2).
- registry: `gl_cb_relay_size(int32_t id)` (0 = not a relay row), `GL_CB_LOCK()/GL_CB_UNLOCK()`.

New wire contract (both sides must match): CONTROL slot 15 `REPORT_CB_REGISTER`, argBlob exactly 8 bytes `{i32 iCallback, u32 path}`; path 0 = register (iCallback > 0), path 1 = manual-dispatch init (iCallback == 0). Any other shape -> STATUS_ERR, no log.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Helper — cub on the unlisted line, CONTROL slot 15 CBREG handler, protocol slot</name>
  <files>native/steam-bridge/helper/bridge_helper.c, src/backend/storeManagers/steam/bridge/protocol.ts, src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts, src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts, src/backend/storeManagers/steam/bridge/__tests__/fixtures/net_harness_driver.c, src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts</files>
  <behavior>
    - net harness case `unlisted-cub`: injecting iCallback 1298 with m_cubParam 12 then pumping prints exactly one line ending `CBQ unlisted iCallback=1298 action=drop callresult=0 cub=12`; a second 1298 injection prints no further unlisted line (once-per-id kept).
    - source pin (58-07 test): the two literals become `unlisted iCallback=%d action=drop callresult=1 cub=%d` and `... callresult=0 cub=%d`; `not.toMatch(/action=drop"/)` still holds; no `%s/%p/%llu/%lx`.
    - slot 15 integration test: refused unauthenticated; after auth, blobs of length 0/7/9, `{0,0}`, `{-5,0}`, `{1298,2}`, `{7,1}` each STATUS_ERR with no `CBREG` in stderr; `{1101,0}` (a listed id) STATUS_OK with no `CBREG` line; `{1298,0}` logs ` CBREG iCallback=1298 role=game path=register` once and a repeat logs nothing more; `{0,1}` twice logs ` CBREG role=game path=manual-dispatch registration=unobservable` exactly once; 40 distinct unlisted ids log at most 32 `path=register` lines; no `CALL` line is produced.
    - protocol test: `CONTROL_SLOT.reportCbRegister` is 15, equals `#define CONTROL_SLOT_REPORT_CB_REGISTER` in bridge_helper.c, and all slot values stay distinct (the shim-define parity assertion is added in Task 2 once the define exists, or here guarded so it passes only when present: prefer adding it in Task 2).
  </behavior>
  <action>
1. Unlisted line (answers question 2): at the drop site (~1777/1779) change both format literals to append ` cub=%d` at the END and pass `(int)msg.m_cubParam`. Keep `CBQ`, `unlisted iCallback=%d action=drop callresult=` byte-identical. Do not change `gl_cbq_note_unlisted` (once per id, 32 ids) — that already bounds it. No struct, no relay row, no name.
2. Slot 15: add `#define CONTROL_SLOT_REPORT_CB_REGISTER 15` after `CONTROL_SLOT_INVITE_FRIEND 14` with a one-line comment (quick 261106-qvp: the shim reports game registrations of unlisted callback ids, logged as CBREG). Document it in the slot doc block (~85-140) in the same style as REPORT_CB_DISPATCH, including the four observability facts from the objective in one sentence (manual dispatch and DRM mode cannot be observed). Add `static gl_logbudget g_cbreg_budget;` and `static int g_cbreg_md_logged;` beside `g_cbdisp_budget`. Add a handler next to the slot 10 handler, behind the same auth gate, never pumping and never logging CALL: require `argBlob != NULL && argLen == 8`; read `int32_t rid`, `uint32_t rpath`; valid shapes are (path 0, rid > 0) and (path 1, rid == 0), anything else STATUS_ERR with no log. Path 0: if `gl_cbq_allowed_size(rid) != 0 || gl_cr_allowed_size(rid) != 0` reply STATUS_OK silently (listed ids are not interesting); else if `gl_logbudget_take(&g_cbreg_budget, rid, 1) == 1` emit `logts_f("CBREG", "iCallback=%d role=game path=register", (int)rid)`; ids past the 32-id table are silent (bounded at 32 lines). Path 1: emit `logts_f("CBREG", "role=game path=manual-dispatch registration=unobservable")` only when `g_cbreg_md_logged` is 0, then set it. Reply STATUS_OK. Integers and fixed words only.
3. protocol.ts: add `reportCbRegister: 15` after `inviteFriend: 14` with a comment mirroring the helper's (`{i32 iCallback, u32 path}`; path 0 register, 1 manual-dispatch init; an old helper answers STATUS_ERR, harmless).
4. Tests: in protocol.test.ts add a `describe('protocol -- CONTROL_SLOT.reportCbRegister (quick 261106-qvp)')` asserting 15, distinctness, and helper `#define` parity (copy the 479-492 pattern). In helperIntegration.test.ts update the 58-07 pin literals and add the slot 15 test from the behavior list, copying the slot 10 test's harness (`startAuthHelper`, `encodeRequest`, `sendFrameOnSocket`, `authenticate`, `settle`) with a `cbRegisterBlob(id, path)` builder beside `cbDispatchBlob`. In net_harness_driver.c add case `unlisted-cub` using `inj_setup`, `inj_push(1298, 0, 0)` (m_cubParam is 12 there), `inj_pump`, twice; in helperNetHarness.test.ts add the test asserting one matching line (match with a regex anchored on ` CBQ unlisted iCallback=1298 action=drop callresult=0 cub=12\n` and count == 1). If 1298 happens to be in the helper's call-result table the expected word is `callresult=1`; check `gl_cr_allowed_size` rows and write the expectation accordingly, do not change the table.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --runTestsByPath src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts && npx prettier --check src/backend/storeManagers/steam/bridge/protocol.ts src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts</automated>
    Formatter note: the two `.c` files report `"ignored": false, "inferredParser": null` under `npx prettier --file-info` (prettier has no C parser), so they are deliberately left out of the `--check`; the four `.ts` paths are checked.
  </verify>
  <done>All three suites green on darwin; the unlisted line carries `cub=` at the end with the old prefix intact; slot 15 logs CBREG per the behavior list and refuses malformed frames silently; protocol slot 15 is pinned to the helper define.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Shim — queue CBREG reports from RegisterCallback and ManualDispatch_Init, flush from the run paths</name>
  <files>meta/gen_vtables.ts, meta/__tests__/fixtures/callback_registry_harness.c, meta/__tests__/callbackRegistryHost.test.ts, src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts, native/steam-bridge/generated/steam_api_shim.c</files>
  <behavior>
    - `cbreg_unlisted_reported`: register object A for 1298, run callbacks once -> exactly one `gl_cb_report_register(1298, 0)` with the registry lock NOT held; register object B for 1298 and run again -> no second report.
    - `cbreg_listed_silent`: register a relay-table id (one that `gl_cb_relay_size` accepts, e.g. 1101) and run -> no register report.
    - `cbreg_not_in_register`: no `gl_cb_report_register` call happens inside `gl_cb_register` itself (the hook count is unchanged immediately after register, before any run).
    - `cbreg_cap`: 40 distinct unlisted ids registered then run -> exactly 32 reports.
    - `cbreg_md_once` (x64 harness build only, like the other md cases): `gl_md_init()` twice then `gl_md_run_frame()` -> exactly one `gl_cb_report_register(0, 1)`.
    - existing harness cases all still PASS (`report_hook_unlocked` etc.).
  </behavior>
  <action>
Why deferred: `bridge_transact` lazily connects and HELLOs; games construct `CCallback` objects in static initialisers, possibly before SteamAPI_Init and under the loader lock, so a socket round trip from inside `SteamAPI_RegisterCallback` is unsafe and slows registration. Reports are therefore queued and flushed later.
1. In `generateCallbackRegistryC()` add to the embedder-contract doc: `void gl_cb_report_register(int32_t id, uint32_t path)` (quick 261106-qvp: told with no lock held; path 0 register, 1 manual-dispatch init; result ignored). Add registry state: `gl_cbreg_ids[32]`, `gl_cbreg_n` (distinct ids recorded), `gl_cbreg_flushed` (how many of them were already reported), and `gl_cbreg_md_pending` / `gl_cbreg_md_done`. In `gl_cb_register`, while the lock is already held and on EVERY path including the capacity-overflow early return (the question is whether the game asked, not whether the registry stored it): if `gl_cb_relay_size(id) == 0`, the id is not already in `gl_cbreg_ids`, and `gl_cbreg_n < 32`, append it. Never call the hook here. In `gl_md_init` (x64) set `gl_cbreg_md_pending = 1` if not `gl_cbreg_md_done`.
2. Add a `gl_cbreg_flush()` that, under the lock, copies the unreported ids (from `gl_cbreg_flushed` to `gl_cbreg_n`) to a local array, advances `gl_cbreg_flushed`, takes and clears the md pending flag (setting done), unlocks, then calls `gl_cb_report_register(id, 0)` for each copied id and `gl_cb_report_register(0, 1)` if md was taken. Call it at the start of the RunCallbacks body (before any in-flight / interval early return, so a throttled run still flushes) and at the start of `gl_md_run_frame` (x64). The lock rule in the doc ("never held across the transport") must stay true.
3. In the shim embedder add `#define BRIDGE_CONTROL_SLOT_REPORT_CB_REGISTER 15` beside `..._REPORT_CB_DISPATCH 10` with the one-line comment, and implement `gl_cb_report_register` beside `gl_cb_report_dispatch`: 8-byte req `{id, path}` via `memcpy`, `(void)bridge_transact(BRIDGE_CONTROL_ORDINAL, BRIDGE_CONTROL_SLOT_REPORT_CB_REGISTER, req, 8, retbuf, sizeof(retbuf), &retlen);` result ignored (an old helper answers STATUS_ERR). Define it for both archs (outside the x64-only block). Any other file that embeds `generateCallbackRegistryC()` output must also define the hook: `git grep -n gl_cb_report_dispatch -- meta src` lists them; give each a matching definition (the registry harness records calls).
4. Harness: in callback_registry_harness.c add a `gl_cb_report_register` hook mirroring the dispatch hook (trylock assert the lock is not held, record `{id, path}` in its own array) and the cases above; add the case names to `CASES` in callbackRegistryHost.test.ts. In protocol.test.ts extend the Task 1 describe with shim parity: `#define BRIDGE_CONTROL_SLOT_REPORT_CB_REGISTER (\d+)` read from `meta/gen_vtables.ts` (same way the reportCbDispatch test reads the shim value at ~311) equals 15.
5. Run `pnpm gen-vtables` to regenerate `native/steam-bridge/generated/*` (commit the regenerated `steam_api_shim.c`; it is a committed generated file and must match the generator), then `pnpm build-steam-bridge`. The shim export set must not change (no new exports; .def unchanged).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm gen-vtables && pnpm build-steam-bridge && npx jest --runTestsByPath meta/__tests__/callbackRegistryHost.test.ts meta/__tests__/gen_vtables.test.ts src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts && git diff --quiet -- native/steam-bridge/generated/steam_api64.def native/steam-bridge/generated/steam_api.def && LC_ALL=C grep -a -c "BRIDGE_CONTROL_SLOT_REPORT_CB_REGISTER 15" native/steam-bridge/generated/steam_api_shim.c && npx prettier --check meta/gen_vtables.ts meta/__tests__/callbackRegistryHost.test.ts src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts</automated>
    Formatter note: `callback_registry_harness.c` and the generated `steam_api_shim.c` have no prettier parser (`"inferredParser": null`) and are omitted from `--check`.
  </verify>
  <done>Registry harness cases (new and old) PASS; gen_vtables and shimGenerate suites green; the bridge builds; .def files unchanged; the regenerated shim contains slot 15 and `gl_cb_report_register`; nothing transacts inside RegisterCallback.</done>
</task>

<task type="auto">
  <name>Task 3: Gate-runner step and observability notes in the todo; full check and graph update</name>
  <files>.planning/todos/pending/2026-11-01-callback-1298-on-bridge-join-path.md</files>
  <action>
Append a `## Step 1 evidence (quick 261106-qvp)` section to the todo. Keep its frontmatter exactly as is (severity: minor, platform: macos, ready: human, in that order). Content, as short prose and a numbered list:
1. Observability notes line (the one-line notes field): "Registration observable only for C++ CCallback via the shim's SteamAPI_RegisterCallback (`CBREG iCallback=<id> role=game path=register`); not observable under manual dispatch (`CBREG role=game path=manual-dispatch registration=unobservable` is logged instead), for RegisterCallResult (handle-keyed), or in DRM mode (genuine steam_api64.dll keeps the list; lsteamclient sees only BGetCallback)."
2. Gate log reads, per launch segment (after the launch's last HELLO, `bridge helper [3205720]:` lines only): the `cub=` value from `CBQ +unlisted iCallback=1298 action=drop callresult=[01] cub=[0-9]+` (question 2; record the number, the line appears once per process); count of `CBREG iCallback=1298 role=game path=register` (1 = the game registered a C++ listener); count of `CBREG role=game path=manual-dispatch registration=unobservable` (1 = manual-dispatch mode; then a 0 for the register line means "unknown", never "no listener").
3. Static fallback for a manual-dispatch Mono title (Schedule I: Steamworks.NET 2024.8.0, 58-01-TITLES.md), a gate-runner step, not code: Steamworks.NET tags each callback struct with `CallbackIdentity(int)`, whose custom-attribute blob for 1298 is the bytes `08 01 00 12 05 00 00 00 00` (blob length 8, prolog 0x0001, int32 1298 = 0x512, zero named args). Count it in `<GameDir>/<Name>_Data/Managed/com.rlabrecque.steamworks.net.dll` with stdlib Python, path passed as an argument and run isolated: `python3 -I -c "import sys;print(open(sys.argv[1],'rb').read().count(bytes.fromhex('080100120500000000')))" <path>`. 0 = this Steamworks.NET build defines no struct for 1298, so no managed Callback for it can exist in the game. 1 or more = a struct exists; resolve its type name only with a metadata tool already installed (`command -v monodis ikdasm ilspycmd`; install nothing), then count that exact name in the other `Managed/*.dll` files (Assembly-CSharp, FishNet, FishySteamworks) as a TypeRef string. If no tool is present, record "struct present, name unresolved" and do not write a name. This mirrors how D-08a established that Raft's assemblies referenced neither 504 nor 1221.
4. What still decides the todo: the cub number plus the listener answer go to the operator; a relay row and layout remain a later step and need the struct identified from the runtime, not guessed.
Then run the full affected suites once more together and refresh the graph (`graphify update .`, per CLAUDE.md). This task writes only a `.planning/` path, which prettier ignores (`"ignored": true`), so the formatter check is deliberately omitted here; `pnpm planning-gates` covers the todo's frontmatter.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm planning-gates && grep -v '^#' .planning/todos/pending/2026-11-01-callback-1298-on-bridge-join-path.md | grep -c "080100120500000000" && npx jest --runTestsByPath src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts meta/__tests__/callbackRegistryHost.test.ts meta/__tests__/gen_vtables.test.ts && pnpm codecheck && graphify update .</automated>
    Formatter: no `--check` — the only path written (`.planning/todos/pending/...`) is prettier-ignored, so a check would be vacuous.
  </verify>
  <done>The todo carries the Step 1 section with the notes line, the three log reads and the static fallback; planning-gates, the suites and codecheck are green; the graph is updated.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| game process (shim) -> helper CONTROL socket | the game-side shim sends a new 8-byte report on slot 15; the game is semi-trusted code |
| helper -> log file | integers and fixed words written to the launch log that the gate reads |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-qvp-01 | Spoofing | helper slot 15 | mitigate | handler sits behind the existing per-launch secret auth gate like slot 10; unauthenticated frames get STATUS_ERR (tested) |
| T-qvp-02 | Denial of service | helper log | mitigate | `gl_logbudget_take` once per id, 32-id table; manual-dispatch line once per process; malformed frames rejected with no log (tested: 40 ids -> at most 32 lines) |
| T-qvp-03 | Tampering | helper slot 15 parser | mitigate | exact `argLen == 8`, only (path 0, id > 0) or (path 1, id 0) accepted; no pointer or string fields, so no injection into log text |
| T-qvp-04 | Denial of service | shim RegisterCallback | mitigate | no socket I/O in RegisterCallback or ManualDispatch_Init; queued and flushed from run paths with no registry lock held (harness `cbreg_not_in_register`, `report_hook_unlocked`) |
| T-qvp-05 | Information disclosure | CBREG / unlisted lines | accept | only callback ids, a payload byte count and fixed words; no SteamID, payload bytes or handles are logged |
</threat_model>

<verification>
- `CBQ unlisted iCallback=<id> action=drop` prefix unchanged; `cub=` appended last.
- Slot 15 is 15 in protocol.ts, bridge_helper.c and gen_vtables.ts (pinned by protocol.test.ts).
- The bridge builds (`pnpm build-steam-bridge`) and the .def export lists are unchanged.
- No relay row, struct layout or struct name was added anywhere (`git diff` shows no change to the relay/allow tables or `msvcCallbackLayout.ts`).
</verification>

<success_criteria>
At the next live join gate, from logs alone: the `cub=` value of 1298 is read off the unlisted line; for a C++ CCallback title `CBREG iCallback=1298 role=game path=register` answers whether the game listens; for a manual-dispatch title the log says registration is unobservable and the todo's static step answers it instead; DRM mode and call results are stated as unobservable rather than claimed.
</success_criteria>

<output>
Create `.planning/quick/261106-qvp-callback-1298-step-1-log-game-listener-r/261106-qvp-SUMMARY.md` when done, including the observability list from the objective verbatim.
</output>
