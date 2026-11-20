---
phase: quick-261026-qvc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - meta/gen_vtables.ts
  - meta/__tests__/gen_vtables.test.ts
  - meta/__tests__/shimAbiGate.test.ts
  - meta/sdk/isteamfriends.manifest.json
  - meta/sdk/isteamfriends011.manifest.json
  - meta/sdk/isteamfriends013.manifest.json
  - meta/sdk/isteamfriends015.manifest.json
  - meta/sdk/isteamfriends017.manifest.json
  - native/steam-bridge/generated/steam_api_shim.c
  - native/steam-bridge/generated/bridge_dispatch.h
  - .planning/todos/pending/2026-10-25-overlooting-godot-null-call-before-shim.md
autonomous: true
requirements: [QVC-01]

must_haves:
  truths:
    - "A game calling ISteamFriends::GetFriendPersonaName(CSteamID) on any served SteamFriends version (011/013/015/017/018) reaches the helper through bridge_transact instead of a local empty-string stub"
    - "The helper dispatch case reads the 8-byte CSteamID from the request blob as uint64_t and passes it to SteamAPI_ISteamFriends_GetFriendPersonaName(self, uint64), then logs a CALL line on success"
    - "The shim thunk is ABI-correct on both arches: i386 __thiscall takes 8 stack bytes and ends in ret $0x8; x64 takes the value in %rdx and ends in a plain ret"
    - "The returned name is copied into a shim-owned static buffer (CR-01), identical to GetPersonaName"
    - "CGameID stays rejected as a by-value wire param; only CSteamID is admitted"
  artifacts:
    - path: "meta/gen_vtables.ts"
      provides: "Narrowed by-value struct rejection (CGameID only) with recorded decision"
      contains: "STRUCT_PARAM_TYPES"
    - path: "native/steam-bridge/generated/steam_api_shim.c"
      provides: "Wired vt_SteamFriends0xx_GetFriendPersonaName thunks"
      contains: "vt_SteamFriends018_GetFriendPersonaName(void *self, uint64_t steamIDFriend)"
    - path: "native/steam-bridge/generated/bridge_dispatch.h"
      provides: "Dispatch cases + typed flat fn for GetFriendPersonaName"
      contains: "SteamAPI_ISteamFriends_GetFriendPersonaName"
  key_links:
    - from: "meta/sdk/isteamfriends*.manifest.json GetFriendPersonaName"
      to: "generated shim + dispatch"
      via: "mode: wire + helperFlat"
      pattern: "\"helperFlat\": \"SteamAPI_ISteamFriends_GetFriendPersonaName\""
    - from: "vt_SteamFriends018_GetFriendPersonaName"
      to: "bridge_transact(2, 6, ...)"
      via: "8-byte memcpy into argbuf"
      pattern: "bridge_transact\\(2, 6,"
---

<objective>
Wire `ISteamFriends::GetFriendPersonaName(CSteamID)` through the macOS steam bridge so Overlooting (3410180, Godot 4.4 + GodotSteam) produces a second distinct game CALL (`SteamFriends018.GetFriendPersonaName`) alongside `SteamUser023.GetSteamID`, which is what its census row needs to become verified.

Purpose: Overlooting's main_screen calls `Steam.getSteamID()` and then `Steam.getFriendPersonaName(<that id>)`. It never calls getPersonaName. Today slot 6 of SteamFriends018 is a generated stub returning "", so the helper sees only one game call and the census reads `unverified (1 game call; needs 2 incl. identity)`. The generator currently refuses any by-value CSteamID wire param (`STRUCT_PARAM_TYPES`), so wiring this needs a narrowly scoped generator change first.

Output: a narrowed generator rule, five manifest edits, regenerated shim and dispatch header, rebuilt shims and helper, tests, and the todo's evidence section.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.claude/skills/gamelib-conventions/SKILL.md
@.planning/todos/pending/2026-10-25-overlooting-godot-null-call-before-shim.md

Established diagnosis (do not re-derive): see the orchestrator description captured in the objective. Census IDENTITY_CALL regex in meta/bridgeCensus.ts (~L882) stays UNCHANGED.

<interfaces>
Planner-verified facts (read once; no exploration needed):

meta/gen_vtables.ts
- L122-127: `STRUCT_PARAM_TYPES = new Set(['CSteamID', 'CGameID'])` with the comment "a future method needing one of these as a genuine wire param must use a different kind (none exists for this yet) or stay a stub".
- L418-428 in `validateManifest`: for a wire method, kind 'value' (or absent) param whose type is in STRUCT_PARAM_TYPES pushes error `by-value struct param "<name>" (type "<type>") is not supported for wire params`.
- L219-230: `WIDTH_8_TYPES` already includes CSteamID and CGameID, so `paramWidth('CSteamID') === 8`, `computeRetN` gives 8 (matches manifest stackBytes 8).
- L462-467: `cType('CSteamID') === 'uint64_t'`. `emitVtableStub` (L1704) builds the wire signature from `cType(p.type) p.name`, so a wired method becomes `static const char * THISCALL vt_X_GetFriendPersonaName(void *self, uint64_t steamIDFriend)`.
- L1362-1420 `packArgsBlock`: kind 'value' emits `memcpy(argbuf + argOff, &<name>, <paramWidth>); argOff += <width>;` -> 8 bytes for CSteamID.
- L1773-1795: the string-return branch (shim-owned `<funcName>_buf[STRING_RETURN_BUF_BYTES]`, CR-01). It is taken automatically for returnKind 'string'.
- L3221-3229 `dispatchCType` = `cType` (CSteamID -> uint64_t on the helper side, documented with the GetSteamID precedent). L3529-3537 in `emitDispatchCase`: value params are read as `<ct> arg_x; memcpy(&arg_x, arg + off, <paramWidth>)` with an argLen bounds check. So the helper side already handles an 8-byte value param; no wire method in any manifest exercises one yet (planner grep: zero wire methods with a uint64/int64/CSteamID value param).
- L2110-2140 `flatArgType`: CSteamID already maps to `{ c: 'uint64_t', cls: 'gpr' }` (game-facing flat exports, not touched here; the shim has no `SteamAPI_ISteamFriends_GetFriendPersonaName` flat export and none is needed, because GodotSteam reaches ISteamFriends through the vtable).
- L3155 `computeWireTableHash`: changes when a method becomes wire. The test "does not change the wire-table hash" (gen_vtables.test.ts ~L1152) compares the committed `BRIDGE_DISPATCH_TABLE_HASH` in bridge_dispatch.h against the computed one, so regeneration keeps it green. The current hash `e05aec2c174d` appears only in the two generated files.

ABI (why uint64_t is correct for CSteamID by value): CSteamID is an 8-byte trivially-copyable aggregate. MSVC x64 passes it in a GPR as an integer (RDX after `this` in RCX), the same as uint64_t. i386 __thiscall pushes its 8 bytes on the stack at 4-byte alignment and the callee pops 8 (`ret $0x8`), the same as uint64_t under zig's `x86-windows-gnu` thiscall. The current stub shape `(void *self, uint32_t dummy0, uint32_t dummy1)` already proves stackBytes 8.

Manifests (each has GetPersonaName wired at slot 0 with `"mode": "wire"`, `"helperFlat": "SteamAPI_ISteamFriends_GetPersonaName"`, and `helperInterface: SteamAPI_SteamFriends_v018`):
- isteamfriends.manifest.json = SteamFriends018, ordinal 2, arches [x86, x64], GetFriendPersonaName at slot 6
- isteamfriends011.manifest.json = SteamFriends011, ordinal 4, arches [x86], slot 7
- isteamfriends013.manifest.json = SteamFriends013, ordinal 8, slot 7
- isteamfriends015.manifest.json = SteamFriends015, ordinal 18, slot 7
- isteamfriends017.manifest.json = SteamFriends017, ordinal 28, slot 7
Each GetFriendPersonaName entry is currently: `{"slot": N, "name": "GetFriendPersonaName", "returns": "const char*", "returnKind": "string", "stackBytes": 8, "params": [{"name": "steamIDFriend", "type": "CSteamID"}]}` (no mode, so it inherits manifest-level `"mode": "stub"`).

Existing tests to extend:
- meta/__tests__/gen_vtables.test.ts L971-983: `it('flags a by-value struct param (CSteamID)')` -- must be inverted/replaced.
- gen_vtables.test.ts L328-410: the 24-CR-01 GetPersonaName shim-owned-buffer pins (body-regex + buffer assertions over the generator output AND the committed shim). Mirror these for GetFriendPersonaName.
- gen_vtables.test.ts L1177-1235: dispatch-header pins (`typedef const char * (*BDFlatFn_SteamFriends018_GetPersonaName_t)(void *);`, case-body regex `/SteamFriends018\.GetPersonaName\n([\s\S]*?)\n {4}\}/`).
- meta/__tests__/shimAbiGate.test.ts: real zig compile + objdump for i386 and x86_64 using `FIXTURE_MANIFEST` (GameLibAbiGate001, ordinal 9000, arches [x86, x64], `_TESTONLY` method names), `exportSymbolForDisasm`, `extractFunctionBlock`, `lastReturnInstruction`. Uses `createFakeHomeProfile()` already (two-profile rule satisfied; do not add hand-rolled env).

Build/test commands: `pnpm gen-vtables` (rewrites native/steam-bridge/generated/*), `pnpm build-steam-bridge` (helper via clang + steam_api.dll / steam_api64.dll via pinned zig), tests via `npx jest <paths>`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Admit CSteamID as a by-value wire param, wire GetFriendPersonaName in all five SteamFriends manifests, regenerate</name>
  <files>meta/gen_vtables.ts, meta/__tests__/gen_vtables.test.ts, meta/__tests__/shimAbiGate.test.ts, meta/sdk/isteamfriends.manifest.json, meta/sdk/isteamfriends011.manifest.json, meta/sdk/isteamfriends013.manifest.json, meta/sdk/isteamfriends015.manifest.json, meta/sdk/isteamfriends017.manifest.json, native/steam-bridge/generated/steam_api_shim.c, native/steam-bridge/generated/bridge_dispatch.h</files>
  <behavior>
    - validateManifest: a wire method with a kind-'value' (or kind-absent) `CSteamID` param produces NO by-value-struct error; the same with a `CGameID` param STILL produces the `by-value struct param` error.
    - generateShimC over the committed manifests: for each of SteamFriends018 (slot 6) and 011/013/015/017 (slot 7), `vt_<iface>_GetFriendPersonaName(void *self, uint64_t steamIDFriend)` exists, its body contains `memcpy(argbuf + argOff, &steamIDFriend, 8); argOff += 8;`, calls `bridge_transact(<ordinal>, <slot>, argbuf, argOff, retbuf, sizeof(retbuf), &retlen)`, copies into `vt_<iface>_GetFriendPersonaName_buf`, NUL-terminates at retlen and returns the buffer (CR-01 shape identical to GetPersonaName); its header comment no longer carries `(STUB)`; no `dummy0` appears in its signature. The same pins hold for the committed native/steam-bridge/generated/steam_api_shim.c (committed artifact == generator output).
    - generateDispatchHeader: contains `dlsym(dylibHandle, "SteamAPI_ISteamFriends_GetFriendPersonaName")` and `typedef const char * (*BDFlatFn_SteamFriends018_GetFriendPersonaName_t)(void *, uint64_t);` (match the exact typedef spelling the generator emits for a one-param method; adjust the literal to the real output, never the generator to the literal). The `SteamFriends018.GetFriendPersonaName` case body reads the arg as `uint64_t` with an 8-byte memcpy guarded by an argLen check, passes it to the flat fn, and encodes the result as `[u32 len][bytes]` capped at 255 like GetPersonaName.
    - The dispatch case's CALL/log path does not print the steamIDFriend value or the returned name (extend or mirror the existing "logs no CSteamID or 64-bit values" assertion at gen_vtables.test.ts ~L2141 for this case).
    - shimAbiGate: add a second fixture method to FIXTURE_MANIFEST, e.g. slot 1 `GetFixtureFriendName_TESTONLY`, `mode: 'wire'`, returns `const char*`, returnKind 'string', stackBytes 8, params `[{ name: 'steamIDFriend', type: 'CSteamID' }]`, with a `note` marking it synthetic. i386: its last return instruction matches `ret[a-z]*\s+\$0x8`. x64: its block stores from `%rdx` (the 8-byte value arrives in RDX, not split across registers and not read via a pointer in RDX) and its last return is a plain `ret` with no `$0x` immediate. Export it via `exportSymbolForDisasm` alongside TARGET_FUNC. Tune the x64 regex against the real objdump output (scratchpad), keeping the semantic "value sourced from %rdx".
  </behavior>
  <action>
Write the tests above first (RED: the validateManifest CSteamID case and the shim/dispatch pins fail before the change), then implement.

Generator (meta/gen_vtables.ts): shrink `STRUCT_PARAM_TYPES` to `new Set(['CGameID'])` and rewrite its doc comment to record the decision: CSteamID is admitted as a kind-'value' wire param because it is an 8-byte trivially-copyable aggregate that both Win32 ABIs pass exactly like uint64_t (MSVC x64: one GPR; i386 __thiscall: 8 stack bytes, callee pops 8), and Steam's macOS flat API takes it as a plain uint64 (same precedent as GetSteamID's return at dispatchCType); first consumer is GetFriendPersonaName (quick 261026-qvc, Overlooting 3410180). CGameID stays rejected: it is ABI-identical but has no consumer, and its flat-API parameter shape has not been checked against a real caller, so admitting it now would be an unexercised path (re-evaluate when a CGameID wire method is actually needed). Keep the error message text unchanged so the CGameID test still matches `by-value struct param`. Do not touch cType, paramWidth, packArgsBlock, dispatchCType or emitDispatchCase unless a test proves they emit something wrong for an 8-byte value param; if one does, fix it there and say why in the SUMMARY.

Manifests: in each of the five isteamfriends*.manifest.json files, add `"mode": "wire"` and `"helperFlat": "SteamAPI_ISteamFriends_GetFriendPersonaName"` to the GetFriendPersonaName entry, using the same key placement as that file's GetPersonaName entry. Leave slot, stackBytes, returnKind 'string' and params untouched (the string-return path is what gives the CR-01 shim-owned buffer). Do NOT wire GetFriendPersonaNameHistory or any other CSteamID method (out of scope).

Update the existing L971 test to the CGameID rejection case plus a new CSteamID acceptance case. Update any test that enumerates "the production wire methods" or counts wire slots if the new methods break it, adding GetFriendPersonaName rather than loosening the assertion.

Regenerate with `pnpm gen-vtables` and commit the regenerated native/steam-bridge/generated/steam_api_shim.c and bridge_dispatch.h (the .def files should not change; if they do, explain why in the SUMMARY). Confirm the wire-table hash changed from `e05aec2c174d` and that only the two generated files carry the new value.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts && grep -c "vt_SteamFriends0[0-9]*_GetFriendPersonaName(void \*self, uint64_t steamIDFriend)" native/steam-bridge/generated/steam_api_shim.c && grep -c '"helperFlat": "SteamAPI_ISteamFriends_GetFriendPersonaName"' meta/sdk/isteamfriends*.manifest.json && npx tsc --noEmit -p . && npx prettier --check meta/gen_vtables.ts meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts meta/sdk/isteamfriends.manifest.json meta/sdk/isteamfriends011.manifest.json meta/sdk/isteamfriends013.manifest.json meta/sdk/isteamfriends015.manifest.json meta/sdk/isteamfriends017.manifest.json</automated>
  </verify>
  <done>Both jest suites pass (shimAbiGate actually runs, not skipped, on this Mac); the shim grep counts 5 wired thunks; each of the five manifests has exactly one GetFriendPersonaName helperFlat; CGameID is still rejected; typecheck and the scoped prettier check pass. The generated .c/.h are C sources outside prettier's parsers and are deliberately not in the prettier list.</done>
</task>

<task type="auto">
  <name>Task 2: Rebuild shims and helper, run the bridge suites, refresh graphify, record evidence in the todo</name>
  <files>.planning/todos/pending/2026-10-25-overlooting-godot-null-call-before-shim.md</files>
  <action>
Run `pnpm build-steam-bridge` (the repo's existing build; it compiles bridge_helper.c with clang and steam_api.dll / steam_api64.dll with the pinned zig). It must exit 0. Record the new byte sizes with `stat -f %z` for public/bin/arm64/darwin/steam_api.dll, steam_api64.dll and steam-bridge-helper (use the paths the build log prints if the arch directory differs). Compare against the prior recorded sizes (steam_api64.dll 497664 / 501248, steam_api.dll 290304, helper 153376 in 53-UAT / 261025-t7i). Do NOT rewrite historical UAT result lines; just record the new values in the todo evidence and the SUMMARY, and grep `src/` and `meta/` for any test or code that hard-codes one of those sizes (`grep -rn "497664\|501248\|290304" src meta`). If a live assertion depends on a size, update it to the new measured value and name it in the SUMMARY.

Run the wider bridge-related jest suites to catch knock-on breakage: `npx jest meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts meta/__tests__/buildSteamBridgeShims.test.ts src/backend/storeManagers/steam/bridge`. shimCoverage.ts is interface-level (SteamFriends0xx already `mode: 'wire'`) and needs no edit; touch it only if a test there fails. Leave meta/bridgeCensus.ts IDENTITY_CALL unchanged.

Run `graphify update .` (CLAUDE.md).

Append a `## 261026-qvc evidence` section to .planning/todos/pending/2026-10-25-overlooting-godot-null-call-before-shim.md (append only; do not alter earlier sections). Content, in the file's existing prose style, dated 2026-10-26: the second root cause (after the 53-19 nvapi fix): Overlooting's main_screen.gdc calls `Steam.getSteamID` then `Steam.getFriendPersonaName(<own id>)` and prints `Usernam: ` + result, never getPersonaName; GetFriendPersonaName was a generated stub (slot 6 of SteamFriends018) that returned "" with no bridge_transact, which is why godot.log showed an empty name and the census saw one game call. The fix: generator now admits CSteamID as an 8-byte by-value wire param (CGameID still rejected, with the reason), GetFriendPersonaName wired in SteamFriends011/013/015/017/018 to `SteamAPI_ISteamFriends_GetFriendPersonaName`, new wire-table hash, and the new built sizes. Next: a live re-run (packaged build; restart dev so the rebuilt helper is used, per the "tauri dev does not rebuild the sidecar" note) must show HELLO plus CALLs for both `SteamUser023.GetSteamID` and `SteamFriends018.GetFriendPersonaName`, a non-empty `Usernam:` line in godot.log, and the census row verified. Keep the frontmatter byte-for-byte as it is: `severity: major`, `platform: macos`, `ready: live-gate`, in that order, bare lowercase.

Then run `pnpm planning-gates` to prove the todo frontmatter still passes.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm build-steam-bridge && npx jest meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts meta/__tests__/buildSteamBridgeShims.test.ts src/backend/storeManagers/steam/bridge && grep -c "^## 261026-qvc evidence" .planning/todos/pending/2026-10-25-overlooting-godot-null-call-before-shim.md && grep -c "^ready: live-gate$" .planning/todos/pending/2026-10-25-overlooting-godot-null-call-before-shim.md && pnpm planning-gates && npx prettier --file-info .planning/todos/pending/2026-10-25-overlooting-godot-null-call-before-shim.md</automated>
  </verify>
  <done>Build exits 0 with new sizes recorded; all listed suites pass; graphify updated; the todo has exactly one `## 261026-qvc evidence` section and unchanged frontmatter with `ready: live-gate`; planning-gates passes. The only path this task writes (the todo .md) is prettier-ignored (`--file-info` reports `"ignored": true`, measured at planning time), so the scoped `prettier --check` is omitted for it per the gamelib-conventions verify rule and the `--file-info` call stands in its place.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| game process (Wine) -> shim -> helper socket | The game supplies the 8-byte steamIDFriend; the helper parses it from the request blob |
| helper -> game | A persona name string travels back to the game |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-qvc-01 | Tampering | emitDispatchCase value read for steamIDFriend | mitigate | The generated case keeps the existing `if (argLen < off + 8) { *respLen = 0; return 1; }` bounds check before the memcpy. Task 1 pins it in the dispatch-case test |
| T-qvc-02 | Information disclosure | helper CALL/FWD logging | mitigate | The CALL line names only the method. The test asserts neither steamIDFriend nor the returned name is logged for this case |
| T-qvc-03 | Information disclosure | friend persona name returned to the game | accept | Real Steam returns the same name to any caller. The bridge only reproduces the contract the game is already entitled to |
| T-qvc-04 | Tampering (memory) | shim string return | mitigate | The response goes through the CR-01 shim-owned buffer path: the length is capped by retbuf (STRING_RETURN_BUF_BYTES - 1) and NUL-terminated. The shim never returns a remote pointer |
| T-qvc-05 | Denial of service | ABI mismatch corrupting the game's stack | mitigate | shimAbiGate measures `ret $0x8` on i386 and RDX-sourced value with a plain ret on x64 from a real zig compile |
</threat_model>

<verification>
- Generator, ABI-gate and build suites green; shimAbiGate executed (not skipped).
- Committed generated shim/dispatch equal generator output (existing committed-artifact pins plus new GetFriendPersonaName pins).
- No new npm/pip/cargo installs (no package legitimacy gate needed).
- Census regex untouched: `git diff --stat meta/bridgeCensus.ts` is empty.
</verification>

<success_criteria>
- GetFriendPersonaName is wired in all five served SteamFriends versions. The helper dispatches it to `SteamAPI_ISteamFriends_GetFriendPersonaName` with a uint64 steamID.
- Only CSteamID is newly admitted as a by-value wire param, and the generator comment records the reason and the CGameID exclusion.
- Shims and helper rebuild cleanly. The new sizes are recorded.
- The todo carries the 261026-qvc evidence section, still `ready: live-gate`.
</success_criteria>

<output>
Create `.planning/quick/261026-qvc-wire-steamfriends-getfriendpersonaname-t/261026-qvc-SUMMARY.md` when done.
</output>
