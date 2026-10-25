---
phase: quick-261025-kax
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - meta/gen_vtables.ts
  - native/steam-bridge/generated/steam_api_shim.c
  - meta/__tests__/gen_vtables.test.ts
  - native/steam-bridge/helper/bridge_helper.c
  - src/backend/storeManagers/steam/bridge/protocol.ts
  - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
  - meta/bridgeCensus.ts
  - meta/__tests__/bridgeCensus.test.ts
autonomous: false
requirements: [D-53-15]

must_haves:
  truths:
    - "When a game in a bridge bottle calls the shim's SteamAPI_Init (x86 and x64), or SteamInternal_SteamAPI_Init (x64), and the HELLO succeeds, gamelib.log gets one line `bridge helper [<appid>]: [<ts>] GINIT  fn=<name> ret=<n> ok=<0|1> session=<0|1>`"
    - "The helper's own SteamAPI_InitFlat never produces a GINIT line. It still logs under the separate `INIT` category, and GINIT is written only from the wire handler for CONTROL slot 5"
    - "The census counts HELLO plus an anchored `GINIT ... ok=1 session=1` line as verified only when the row's judged steam_api import set is non-empty and made up entirely of the init/shutdown family"
    - "These all leave a row unverified: a GINIT failure line, a missing GINIT line on an init-only row, a GINIT success on a row with wider imports, a forged GINIT inside a FWD/NOVER payload, and a GINIT with no HELLO. Mac Steam In-Game is still not an input"
    - "Before the live run, the census verdict for every row except 206060 is byte-identical to the pre-change census"
    - "Avernum 6 206060 is launched live through GameLibSteamBridge-206060 and the `pnpm bridge-census` majority line is recorded verbatim"
  artifacts:
    - path: "meta/gen_vtables.ts"
      provides: "BRIDGE_CONTROL_SLOT_REPORT_INIT, gamelib_bridge_hello(), gamelib_report_init(), the reworked SteamAPI_Init / SteamInternal_SteamAPI_Init bodies"
      contains: "BRIDGE_CONTROL_SLOT_REPORT_INIT"
    - path: "native/steam-bridge/generated/steam_api_shim.c"
      provides: "Regenerated shim (via pnpm gen-vtables only)"
      contains: "gamelib_report_init"
    - path: "native/steam-bridge/helper/bridge_helper.c"
      provides: "CONTROL_SLOT_REPORT_INIT handler that logs GINIT"
      contains: "CONTROL_SLOT_REPORT_INIT"
    - path: "meta/bridgeCensus.ts"
      provides: "INIT_SHUTDOWN_FAMILY, isInitOnlyImportSet, findGameInit, the initOnlyImports branch in classifyBridgeEvidence"
      exports: ["isInitOnlyImportSet", "classifyBridgeEvidence"]
  key_links:
    - from: "shim SteamAPI_Init (game process, Wine bottle)"
      to: "bridge_helper.c CONTROL_SLOT_REPORT_INIT"
      via: "bridge_transact(BRIDGE_CONTROL_ORDINAL, 5, {u32 fn, i32 ret})"
      pattern: "BRIDGE_CONTROL_SLOT_REPORT_INIT"
    - from: "meta/bridgeCensus.ts classifyInstalledTitle"
      to: "classifyBridgeEvidence initOnlyImports"
      via: "isInitOnlyImportSet over the same judged symbol array pushed to judgedSymbols (D-53-12 shared scan)"
      pattern: "isInitOnlyImportSet\\("
---

<objective>
Implement D-53-15 so that Avernum 6 (206060), whose exe imports only `SteamAPI_Init` and
`SteamAPI_Shutdown` from steam_api.dll, can be bridge-verified. Then prove it with a live launch
and record the census line.

Purpose: the phase-53 done-when is short by exactly one verified row. Census is now
`9 of 18 Steamworks-using rows verified (majority: no)`. If Avernum 6 inits cleanly live, the
expected result is `10 of 18 ... (majority: yes)`.

Scope is D-53-15 only. Do NOT touch the Overlooting second-call gap, WR-01
(emitHiddenFallback), WR-02 (bottleDllOverrides), Unclaimed World 284100, or SteamAPI_InitSafe
export coverage (the old-SDK todo).

Output: a GINIT trace from the shim through the helper, the census init-only branch with
negative tests, and the live census line recorded verbatim in SUMMARY.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-CONTEXT.md
@.planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-18-SUMMARY.md

Load `Skill("gamelib-conventions")` before writing verify blocks or spawning anything.

## Mechanism decision (game-originated vs helper-originated init)

This is the planner's decision, recorded here so the executor does not re-derive it.

- The helper is a native macOS process. It calls `libsteam_api.dylib`'s `SteamAPI_InitFlat`
  in-process and logs that under the `INIT` category (bridge_helper.c ~L320-360, L756). It
  never sends wire requests to itself.
- The only thing that sends frames to the helper's 127.0.0.1 ephemeral port is the shim, which
  is loaded inside the game process in the Wine bottle (bridge_helper.c already relies on this
  for CALL: "Game-originated by construction").
- So game init gets a **new CONTROL slot 5 (REPORT_INIT)** and a **new log category `GINIT`**,
  which only the slot-5 wire handler emits. The helper's own init can never produce a GINIT
  line, and the census never reads `INIT` lines.
- The line carries only fixed tokens. The function name comes from a helper-side table indexed
  by a u32 code and unknown codes are rejected. Integers are printed with %d. No game-supplied
  string reaches the line, so it cannot be forged through it. Following 53-18, the census also
  anchors at payload start, so a GINIT-looking string inside a FWD/NOVER payload never matches.
- `session=` is the helper's `g_inited`. HELLO and REPORT_INIT are answered before init, the
  same as HELLO today, so the shim's `SteamAPI_Init` returns 1 even when the helper has no live
  Steam session. The census therefore requires `ok=1 session=1`: the game's own init succeeded
  and a live Steam session stood behind the bridge. This is stricter than ok alone.
- **Which init exports are "served"** (D-53-15: "where served"):
  - `SteamAPI_Init` (x86 + x64) reports with code 0.
  - `SteamInternal_SteamAPI_Init` (x64 only) reports with code 1.
  - `SteamAPI_InitFlat` is a stub that returns without opening a bridge connection, so no game
    init happens through the bridge. It stays unchanged and does not report.
  - `SteamAPI_InitSafe` is not exported by either shim (see the 284100 crash) and stays out of
    scope.
  - The helper's name table still includes InitSafe (code 2) and InitFlat (code 3). If they are
    ever served, the census accepts them without a change.
- A failed HELLO means the transport is unusable, so the shim sends the report only after HELLO
  succeeds. A failed init therefore leaves **no** GINIT line, which the census reads as the
  "missing" case (unverified). The helper still formats `ok=0` lines for codes whose ret
  signals failure, and the census treats those as unverified too.

<interfaces>
From native/steam-bridge/generated/steam_api_shim.c (generated by meta/gen_vtables.ts. Edit the generator, never the .c):
- L47-56: `#define BRIDGE_CONTROL_ORDINAL 0xffff`, `BRIDGE_CONTROL_SLOT_HELLO 2`, `..._CREATE_INTERFACE 3`, `..._REPORT_VERSION 4` (generator source of REPORT_VERSION define: meta/gen_vtables.ts ~L2260)
- L330: `static int bridge_transact(uint16_t ordinal, uint16_t slot, const uint8_t *argBuf, uint32_t argLen, uint8_t *retBuf, uint32_t retBufCap, uint32_t *retLenOut)` (reconnects once on transport failure)
- Current `SteamAPI_Init` body (generator FLAT_EXPORT_BODIES.SteamAPI_Init ~L806): marker keepalive via `const char *volatile gamelib_marker_keepalive = g_gamelib_shim_marker;` then HELLO transact, return 1/0. The keepalive MUST stay in SteamAPI_Init (generator ~L2330 comment: the census and the version-capture pass grep the built DLL for "GameLibSteamBridgeShim/2").
- Current `SteamInternal_SteamAPI_Init` (generator ~L901, x64 only) calls `SteamAPI_Init()`, returns 0 ok / 2 fail, bumps `g_gamelib_context_counter`, writes pOutErrMsg.
- Pattern to copy for a bounded fire-and-forget report: `flat_report_unknown_version` (generator ~L2590-2607), which caps at 16 and ignores the result. NOTE: that block is x64-guarded. The new init helpers must NOT be, because x86 needs them.
- `SteamAPI_InitFlat` body: `int SteamAPI_InitFlat(char *pErrMsg) { (void)pErrMsg; return 0; }` stays unchanged.

From native/steam-bridge/helper/bridge_helper.c:
- L137-147 CONTROL_ORDINAL / CONTROL_SLOT_* defines. `#define STATUS_OK 0`, `STATUS_ERR 1`
- L212 `static void logts(const char *cat, const char *msg)` prints `[%s] %-6s %s\n` to stderr. The backend prefixes each line with `bridge helper [<appid>]: ` in gamelib.log
- L528-558 REPORT_VERSION handler: the pattern to copy (bounds check, then process cap `g_nover_logged >= 16`, then log, then STATUS_OK)
- `g_inited` (L181): helper's own live-session flag

From src/backend/storeManagers/steam/bridge/protocol.ts L96-111: `export const CONTROL_SLOT = { health: 0, whoami: 1, hello: 2, createInterface: 3, reportVersion: 4 } as const`

From meta/bridgeCensus.ts:
- L796 `HELPER_PREFIX`, L804 `attributeHelperLines(appid, text): string[]`, L827 `helloRegex(appid)`, L888 `findGameCalls` (scan attributed payloads after the first HELLO: copy this shape for findGameInit)
- L932 `export function classifyBridgeEvidence(input: { appid; appLogTexts; gameLogTexts; engine? }): BridgeEvidence`
- L1528 `function collectEvidence(entry, appLogFiles, engine): BridgeEvidence`. Called at L1786 BEFORE the scan. The judged symbol array is built at ~L1950: `[...symbols, ...(importerEvidence?.symbols ?? []), ...(managed?.kind === 'mono' ? managed.symbols : [])]`
- `CensusManaged` = `{kind:'mono',...symbols} | {kind:'il2cpp',...} | {kind:'none'}`
- Test pattern: meta/__tests__/bridgeCensus.test.ts L1559 describe('53-18: anchored census evidence ...'). Its helpers: `P = 'bridge helper [1234]: '`, `hello`, `call()`, `fwd()`
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
<name>Task 1: Shim reports game init over CONTROL slot 5, helper logs GINIT</name>
<files>meta/gen_vtables.ts, native/steam-bridge/generated/steam_api_shim.c, meta/__tests__/gen_vtables.test.ts, native/steam-bridge/helper/bridge_helper.c, src/backend/storeManagers/steam/bridge/protocol.ts, src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts</files>
<behavior>
- gen_vtables: generated C defines `BRIDGE_CONTROL_SLOT_REPORT_INIT 5`, `GAMELIB_INIT_FN_STEAMAPI_INIT 0` and `GAMELIB_INIT_FN_STEAMINTERNAL_INIT 1`.
- gen_vtables: `gamelib_report_init` and `gamelib_bridge_hello` are emitted OUTSIDE any `#if defined(__x86_64__)` guard, before the `// === Flat SteamAPI_* exports` header.
- gen_vtables: the SteamAPI_Init body still contains the marker keepalive, calls `gamelib_bridge_hello()`, and calls `gamelib_report_init(GAMELIB_INIT_FN_STEAMAPI_INIT` only on success.
- gen_vtables: the SteamInternal_SteamAPI_Init body calls `gamelib_bridge_hello()` and no longer calls `SteamAPI_Init()`, so there is no double report. It reports `GAMELIB_INIT_FN_STEAMINTERNAL_INIT` with ret 0, and still returns 0 on ok and 2 on fail. This updates the existing test at ~L1713.
- gen_vtables: the SteamAPI_InitFlat body is byte-identical to today and has no report.
- gen_vtables: the report helper caps at 8 per process.
- helper integration (real compiled helper, Darwin): a REPORT_INIT frame `{u32 0, i32 1}` answers STATUS_OK and logs `GINIT  fn=SteamAPI_Init ret=1 ok=1 session=0` (no live session in the test).
- helper integration: `{u32 1, i32 0}` logs `fn=SteamInternal_SteamAPI_Init ret=0 ok=1`, and `{u32 1, i32 2}` logs `ok=0`.
- helper integration: argLen < 8, a NULL blob, or code >= 4 answers STATUS_ERR and logs nothing.
- helper integration: at most 8 GINIT lines per process, and later frames still answer STATUS_OK.
- helper integration: a REPORT_INIT frame never logs CALL or INIT.
</behavior>
<action>
Per D-53-15 and the mechanism decision in context.

(a) Generator, meta/gen_vtables.ts. Add the `BRIDGE_CONTROL_SLOT_REPORT_INIT 5` define next to the
REPORT_VERSION define (~L2260), with a D-53-15 comment, plus the two GAMELIB_INIT_FN_* code
defines. Emit two static functions, unguarded so they exist in both arches, after bridge_transact
and before the flat-exports header:
- `static int gamelib_bridge_hello(void)` does the existing HELLO transact and returns 1/0.
- `static void gamelib_report_init(uint32_t fn, int32_t ret)` builds an 8-byte little-endian
  request (fn then ret, written with memcpy as bridge_transact does). It keeps a static counter
  that stops after 8 reports, calls bridge_transact on slot 5, and ignores the result.

Rewrite FLAT_EXPORT_BODIES.SteamAPI_Init:
1. Keep the keepalive lines verbatim.
2. `int ok = gamelib_bridge_hello();`
3. `if (ok) gamelib_report_init(GAMELIB_INIT_FN_STEAMAPI_INIT, 1);`
4. `return ok;`

Rewrite SteamInternal_SteamAPI_Init:
- Call `gamelib_bridge_hello()` instead of `SteamAPI_Init()`.
- On success, report code 1 with ret 0, then keep the counter bump and pOutErrMsg handling exactly
  as they are.
- On failure, do not report (transport unusable) and keep the 2 / errmsg path.

Leave SteamAPI_InitFlat untouched (not served, see context). Update the comments at ~L897-900.

Run `pnpm gen-vtables`. Never hand-edit steam_api_shim.c. No exported symbol changes, so
shimExports.generated.ts must stay unchanged.

(b) Helper, native/steam-bridge/helper/bridge_helper.c. Add `#define CONTROL_SLOT_REPORT_INIT 5`
with a D-53-15 comment. Add a static name table indexed by code:
- 0 SteamAPI_Init
- 1 SteamInternal_SteamAPI_Init
- 2 SteamAPI_InitSafe
- 3 SteamAPI_InitFlat

The ok rule: codes 0 and 2 are bool APIs, so ok = ret != 0. Codes 1 and 3 are ESteamAPIInitResult,
so ok = ret == 0.

In dispatch_and_respond's CONTROL branch, add a handler modeled on REPORT_VERSION. It is answerable
before init:
- Bounds-check (argBlob non-NULL, argLen >= 8) and reject code >= 4. Either failure answers
  STATUS_ERR with no log.
- Cap with `g_ginit_logged >= 8`: over the cap, answer STATUS_OK without logging.
- Otherwise snprintf `fn=%s ret=%d ok=%d session=%d` (session = g_inited ? 1 : 0), call
  `logts("GINIT", msg)`, and answer STATUS_OK.

Extend the module doc comment's slot list with slot 5, and state there why the helper's own init
can never emit GINIT.

(c) protocol.ts: add `reportInit: 5` to CONTROL_SLOT, with a comment.

(d) Tests. In meta/__tests__/gen_vtables.test.ts, pin the gen_vtables behaviors. In
helperIntegration.test.ts, add the helper behaviors as a new test next to the REPORT_VERSION
tests (~L516-695), reusing that file's existing frame-building, spawn and fake-HOME helpers
exactly. Do not hand-roll an env literal (fake-HOME rule).

Write the tests first and watch them fail, then implement.
</action>
<verify>
<automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm gen-vtables && git add -N native/steam-bridge/generated && cp native/steam-bridge/generated/steam_api_shim.c "$TMPDIR/shim1.c" && pnpm gen-vtables && cmp native/steam-bridge/generated/steam_api_shim.c "$TMPDIR/shim1.c" && git diff --exit-code src/backend/storeManagers/steam/bridge/shimExports.generated.ts && npx jest meta/__tests__/gen_vtables.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts && pnpm build-steam-bridge && strings public/bin/arm64/darwin/steam_api.dll | grep -c 'GameLibSteamBridgeShim/2' && npx prettier --check meta/gen_vtables.ts meta/__tests__/gen_vtables.test.ts src/backend/storeManagers/steam/bridge/protocol.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts</automated>
Prettier scope: `native/steam-bridge/helper/bridge_helper.c` and `native/steam-bridge/generated/steam_api_shim.c` report `{ "ignored": false, "inferredParser": null }`. Prettier has no C parser, so they are omitted from the check on purpose. The C is checked by compiling it in `pnpm build-steam-bridge`.
</verify>
<done>
- `pnpm gen-vtables` is idempotent, and shimExports.generated.ts is unchanged.
- gen_vtables, helperIntegration and protocol tests pass, including the new GINIT, malformed,
  unknown-code and cap cases.
- Both shims and the helper build.
- The x86 shim still carries the marker string.
- Scoped prettier is green.
</done>
</task>

<task type="auto" tdd="true">
<name>Task 2: Census counts HELLO + GINIT success for init-only import rows only</name>
<files>meta/bridgeCensus.ts, meta/__tests__/bridgeCensus.test.ts</files>
<behavior>
- `isInitOnlyImportSet`:
  - `['SteamAPI_Init','SteamAPI_Shutdown']` is true.
  - `['SteamInternal_SteamAPI_Init','SteamAPI_Shutdown']` is true.
  - `[]` is false.
  - `['SteamAPI_Init','SteamAPI_RunCallbacks']` is false.
  - `['SteamAPI_Init','SteamAPI_Shutdown','SteamUser']` is false.
  - Any runtime-loaded marker token is false.
- `classifyBridgeEvidence`, with initOnlyImports true and engine 'unknown':
  - HELLO + `GINIT  fn=SteamAPI_Init ret=1 ok=1 session=1` gives `{status:'verified', detail:'game init SteamAPI_Init'}`.
  - The same line with `session=0` gives unverified, 'game init failed'.
  - HELLO + `GINIT  fn=SteamAPI_Init ret=0 ok=0 session=1` gives unverified, 'game init failed'.
  - HELLO alone gives unverified, 'no game init line'.
  - A GINIT success with no HELLO gives unverified, 'no HELLO'.
  - A GINIT success that appears only BEFORE the HELLO gives unverified, 'no game init line'.
  - A GINIT success attributed to a different appid gives unverified, 'no game init line'.
  - A forged FWD payload `x] GINIT  fn=SteamAPI_Init ret=1 ok=1 session=1` gives unverified, 'no game init line'.
  - A GINIT line with an unknown fn token gives unverified, 'no game init line'.
  - A helper `INIT` line (the helper's own SteamAPI_InitFlat success text) gives unverified, 'no game init line'.
- `classifyBridgeEvidence`, with initOnlyImports false or absent: HELLO + GINIT success on a godot/unknown row still gives 'no game-originated call'. Every existing test passes unchanged.
</behavior>
<action>
Per D-53-15, and D-53-12 for the shared scan.

(a) In meta/bridgeCensus.ts, define `INIT_SHUTDOWN_FAMILY`, a ReadonlySet of these 5 names:
- SteamAPI_Init
- SteamAPI_InitSafe
- SteamAPI_InitFlat
- SteamInternal_SteamAPI_Init
- SteamAPI_Shutdown

Export `isInitOnlyImportSet(symbols: string[]): boolean`. It is true only when the set is
non-empty and every symbol is in the family. It is pure, with a doc comment that cites D-53-15.

(b) Add `findGameInit(appid, appLogTexts)`, shaped like findGameCalls: attributed payloads only,
scanned after the first HELLO for that appid. Use the anchored regex
`^\[[^\]]*\]\s+GINIT\s+fn=(SteamAPI_Init|SteamInternal_SteamAPI_Init|SteamAPI_InitSafe|SteamAPI_InitFlat)\s+ret=(-?\d+)\s+ok=([01])\s+session=([01])\s*$`.
Return `{ fn, success }` for the first line where ok=1 and session=1. Otherwise return the first
matching non-success line as success false. With no match, return null.

(c) Add optional `initOnlyImports?: boolean` to classifyBridgeEvidence's input. Directly after the
existing HELLO check, add the branch:
- `if (input.initOnlyImports === true)`:
  - success: return verified, `game init <fn>`
  - non-success line: return unverified, 'game init failed'
  - null: return unverified, 'no game init line'
- Strict: an init-only row never falls through to the engine logic. That is D-53-15's "a failed or
  missing init line is unverified".
- Rows without the flag take exactly the current path.

Extend the doc comment: helper-originated INIT and In-Game are never inputs.

(d) Driver, classifyInstalledTitle. Move evidence collection after the judged symbol array is
built:
- Compute that array once into a local, push it into judgedSymbols as today, and derive
  `initOnly = isInitOnlyImportSet(judged) && managed?.kind !== 'il2cpp'`. Unscanned IL2CPP Steam
  usage is never assumed init-only.
- Pass it through `collectEvidence(entry, appLogFiles, engine, initOnly)` into
  classifyBridgeEvidence.
- The `!selected` early-return path calls collectEvidence with false.
- The symbols come only from the shared bridgeScan / importParse results already in hand. Add no
  new PE parsing.

(e) Before editing anything, capture `pnpm bridge-census` stdout to
`$TMPDIR/census-before.txt`. After the change, capture it to `$TMPDIR/census-after.txt`. Diff the
two: the ONLY permitted change is the 206060 row's evidence detail, which goes from
'no game-originated call' to 'no game init line'. The live run has not happened yet, so the majority
line must still read `9 of 18 Steamworks-using rows verified (majority: no)`. Any other row
changing is a defect, so stop and fix it. Also confirm from the census output, or a one-off debug
print you then remove, that 206060 is judged init-only. If it is not, stop and report what its
judged symbol set contains.

Write the tests first and watch them fail, then implement.
</action>
<verify>
<automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest meta/__tests__/bridgeCensus.test.ts && pnpm bridge-census > "$TMPDIR/census-after.txt" && diff "$TMPDIR/census-before.txt" "$TMPDIR/census-after.txt"; grep -F '9 of 18 Steamworks-using rows verified (majority: no)' "$TMPDIR/census-after.txt" && npx prettier --check meta/bridgeCensus.ts meta/__tests__/bridgeCensus.test.ts</automated>
The diff is expected to show exactly one changed line, the 206060 row. Inspect it rather than treat a non-zero diff exit as failure.
</verify>
<done>
- All bridgeCensus tests pass, including the ten negative cases.
- The pre/post census diff touches only the 206060 row, and the count stays 9 of 18.
- 206060 is confirmed judged init-only.
- Scoped prettier is green.
</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
<name>Task 3: Live Avernum 6 launch through the bridge, then census</name>
<files>(none, live verification. Results are recorded in 261025-kax-SUMMARY.md)</files>
<action>Rebuild and stage the app automatically, have the operator launch Avernum 6, then collect evidence and run the census as described below.</action>
<what-built>
The shim now reports the game's own SteamAPI_Init result over CONTROL slot 5, the helper logs it as
GINIT, and the census counts HELLO + GINIT success for init-only rows.

Before presenting this checkpoint, the executor does all of the following automatically:
1. Stop any running GameLib shell: `pgrep -fl gamelib-shell`. A previous pid 19982 may still be
   alive. Send SIGTERM to each pid, wait until pgrep shows none, and use SIGKILL only if one
   survives 10s.
2. `pnpm build-steam-bridge`. Record the new size of `public/bin/arm64/darwin/steam_api.dll`
   (it was 290304 before this task).
3. `pnpm tauri:dev:packaged`. It is expected to exit 1 only at the updater-signing step. Confirm
   the build itself completed.
4. Confirm `build/main/sidecar.js` mtime is newer than `git log -1 --format=%ct`. Per user memory,
   tauri dev does not rebuild the sidecar. If it is not newer, rebuild before continuing.
5. Note the current line count of the newest `~/Library/Logs/GameLib/gamelib*.log` so the new
   lines can be isolated afterwards.
6. Start the freshly built debug app.
</what-built>
<how-to-verify>
1. In the freshly built GameLib, launch Avernum 6 (206060). It must run in the
   `GameLibSteamBridge-206060` bottle and must not reroute to bottled Steam.
2. Play to the main menu, or a little past it, then quit the game normally. SteamAPI_Shutdown
   runs at that point.
3. Reply "approved" with a one-line note on how the game behaved, or describe any issue.

After approval, the executor does the following automatically and records everything verbatim in
SUMMARY:
- the bottle's steam_api.dll size (under the Avernum 6 install in
  `~/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-206060/`), which must equal
  the built x86 size from step 2
- the new `bridge helper [206060]:` lines from gamelib.log, specifically the HELLO and the
  GINIT (expected: `GINIT  fn=SteamAPI_Init ret=1 ok=1 session=1`)
- any NOVER/CALL lines
- the full `pnpm bridge-census` output, with the majority line quoted verbatim (expected if init
  succeeded: `10 of 18 Steamworks-using rows verified (majority: yes)`) and the 206060 row's
  evidence cell

If GINIT is missing or reads ok=0 / session=0, record that as the honest result (206060
unverified). Do not loosen the rule. Mac Steam In-Game status is not evidence and must not be
cited.
</how-to-verify>
<verify>
<automated>cd /Users/graysonmitchell/Projects/GameLib && grep -h 'bridge helper \[206060\]' ~/Library/Logs/GameLib/*.log | grep -E 'HELLO|GINIT' | tail -5 && pnpm bridge-census | grep -E 'Steamworks-using rows verified|206060'</automated>
No files are written in this task other than .planning (prettier-ignored), so there is no prettier check.
</verify>
<done>
- The operator approved the live launch.
- SUMMARY records verbatim: the shim size, the HELLO and GINIT lines, and the census majority line
  plus the 206060 row.
</done>
<resume-signal>Type "approved" with a short note on how the game ran, or describe issues</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| game process (Wine) → helper loopback socket | Untrusted game code can send any frame to the helper's 127.0.0.1 port |
| gamelib.log → census | The census parses log text that can contain game-influenced strings (FWD/NOVER versions) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-kax-01 | Tampering | bridge_helper.c REPORT_INIT handler | mitigate | argLen >= 8 and non-NULL blob, checked before memcpy. Code < 4, indexing a fixed name table. Only %d integers and table strings are formatted, so no game bytes reach the log |
| T-kax-02 | Spoofing | census GINIT matcher | mitigate | Payload-start anchored regex on attributed helper lines after HELLO (53-18 pattern). A closed fn alternation. A negative test for a forged GINIT inside a FWD payload |
| T-kax-03 | Spoofing | helper's own init vs game init | mitigate | A distinct GINIT category, emitted only from the slot-5 wire handler. The helper's in-process init logs INIT, which the census never reads. Covered by a negative test |
| T-kax-04 | Denial of Service | helper log / shim reports | mitigate | Shim caps at 8 reports per process. Helper caps at 8 GINIT lines per process |
| T-kax-05 | Elevation (of verdict) | census init-only branch | mitigate | Gated on isInitOnlyImportSet over the shared-scan judged symbols, excluding IL2CPP. ok=1 AND session=1 are both required. The pre/post census diff guards against other rows changing |
| T-kax-06 | Information disclosure | GINIT line | accept | Carries an appid prefix, a fixed function name and integers only. No paths or account fields (T-51-39 discipline) |
</threat_model>

<verification>
- `pnpm gen-vtables` is idempotent, and the generated shim contains gamelib_report_init outside x64 guards.
- jest passes for meta/__tests__/gen_vtables.test.ts, meta/__tests__/bridgeCensus.test.ts,
  helperIntegration.test.ts and protocol.test.ts.
- The pre-live census differs from baseline only on the 206060 row.
- The live census line is recorded verbatim.
</verification>

<success_criteria>
- D-53-15 is implemented end to end: shim (x86 + x64), then helper GINIT, then census init-only
  branch, with negative tests for each excluded case.
- No other census row's verdict changes.
- Live Avernum 6 result recorded honestly. Expected `10 of 18 Steamworks-using rows verified
  (majority: yes)` if init succeeds.
</success_criteria>

<output>
Create `.planning/quick/261025-kax-avernum-6-init-only-bridge-verification-/261025-kax-SUMMARY.md` when done.
</output>
