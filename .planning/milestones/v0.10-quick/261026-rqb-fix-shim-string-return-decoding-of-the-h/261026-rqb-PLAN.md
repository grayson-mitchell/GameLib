---
phase: quick-261026-rqb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - meta/gen_vtables.ts
  - meta/__tests__/gen_vtables.test.ts
  - meta/__tests__/stringReturnRoundTrip.test.ts
  - meta/__tests__/fixtures/string_return_roundtrip_harness.c
  - native/steam-bridge/generated/steam_api_shim.c
  - .planning/todos/pending/2026-10-25-overlooting-godot-null-call-before-shim.md
  - .planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-UAT.md
autonomous: true
requirements: [RQB-01]

must_haves:
  truths:
    - "Every wired const char* return (GetPersonaName, GetFriendPersonaName, GetCurrentGameLanguage, ... on every interface and arch) hands the game exactly the helper's string bytes, NUL-terminated, never the 4-byte length prefix"
    - "A malformed string response (retlen < 4, declared len > retlen - 4, declared len >= STRING_RETURN_BUF_BYTES) yields an empty string, never an over-read or an unterminated buffer"
    - "The shim's string retbuf is large enough for the helper's largest encode (4 + DISPATCH_STRING_RETURN_MAX_BYTES), so a 252..255-byte string no longer trips bridge_transact's oversize-response connection drop"
    - "A compiled host harness round-trips the helper's generated encode through the shim's generated decode, so the two sides cannot drift silently again"
    - "The 261026-qvc live gate (census verified, name garbled as 0x07) is recorded in the Overlooting todo and in 53-UAT item 36, with status word still issue"
  artifacts:
    - path: "meta/gen_vtables.ts"
      provides: "Single-source string-return encode/decode emitters used by both the shim and dispatch generators"
      contains: "emitStringReturnDecode"
    - path: "native/steam-bridge/generated/steam_api_shim.c"
      provides: "Regenerated shim whose string-return thunks decode [u32 len][bytes]"
      contains: "STRING_RETURN_WIRE_BYTES"
    - path: "meta/__tests__/stringReturnRoundTrip.test.ts"
      provides: "clang-compiled encode->decode round-trip harness"
    - path: "meta/__tests__/fixtures/string_return_roundtrip_harness.c"
      provides: "Harness cases (empty, 7-byte, 128, 255, 300-capped, NULL, malformed)"
  key_links:
    - from: "emitVtableStub string-return branch"
      to: "emitStringReturnDecode"
      via: "direct call; no inline copy of the decode"
      pattern: "emitStringReturnDecode\\("
    - from: "emitDispatchCase string branch"
      to: "emitStringReturnEncodeLines"
      via: "direct call; no inline copy of the encode"
      pattern: "emitStringReturnEncodeLines\\("
    - from: "stringReturnRoundTrip.test.ts"
      to: "both emitters"
      via: "generated header written into a createFakeHomeProfile root and #included by the harness"
      pattern: "emitStringReturnEncodeLines|emitStringReturnDecode"
---

<objective>
Fix the generated shim's string-return decode. The helper encodes every `returnKind: 'string'` result as `[u32 len][bytes]` (gen_vtables.ts ~L3583-3593), but the shim branch (~L1798-1820) does `memcpy(<fn>_buf, retbuf, retlen)` and NUL-terminates at `retlen`. So the game receives the 4-byte little-endian length prefix as the string. For any name shorter than 256 bytes the second byte is 0x00, so the game sees a one-byte control string. Live proof (do not re-derive): Overlooting's godot.log line `Usernam: ` is hex `55 73 65 72 6e 61 6d 3a 20 07 0a`, where 0x07 is the length of a 7-byte name.

The defect is in the generator, so it hits every wired string-return thunk on every interface and arch: 68 `retbuf, retlen` sites in the committed shim (GetPersonaName, GetFriendPersonaName, GetCurrentGameLanguage and the rest). Flat exports dispatch into the same vtable thunks, so one generator fix covers them all. Census rows for Vampire's Fall 1167950, Mining Mechs 1603180 and Rogue Waters 1691190 read `verified` because the census only checks that CALLs happened. It does not check returned values.

Purpose: games that read a persona name or language get real data instead of garbage. The fix also gives the encode/decode contract one generator source plus a compiled round-trip proof.

Output: the generator fix, a regenerated shim, the generator tests, a host round-trip harness, rebuilt binaries with recorded sizes, and the evidence in the todo and the UAT.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.claude/skills/gamelib-conventions/SKILL.md
@.planning/quick/261026-qvc-wire-steamfriends-getfriendpersonaname-t/261026-qvc-SUMMARY.md

<interfaces>
Planner-verified facts. Read once; no further exploration is needed.

meta/gen_vtables.ts
- L296-303: `STRING_RETURN_BUF_BYTES = 256`. Its doc comment says "plus a NUL terminator written at `retlen`, so the usable transact buffer is one byte smaller". That describes the defective raw copy, so rewrite it.
- L567-597: `WIRE_LAYOUT_DOC`. The response blob already documents `[u32 len][bytes] (returnKind 'string', decoded by the dedicated string-return branch)`. The DOC is correct and the shim branch disagrees with it. Tighten the DOC to state the shim's decode rule (len <= retlen - 4 and len < STRING_RETURN_BUF_BYTES, otherwise ""). The DOC is embedded in the generated shim header, so the shim text changes there too.
- L1798-1821: the shim `if (stringReturn)` branch in `emitVtableStub`. It has the wrong CR-01 comment ("the helper sends the raw string bytes (length implied by the response frame, protocol.ts)"), `uint8_t retbuf[STRING_RETURN_BUF_BYTES - 1]` (255), `memcpy(${funcName}_buf, retbuf, retlen); ${funcName}_buf[retlen] = '\0';`. The failure path writes `${funcName}_buf[0] = '\0'` and returns the buffer. Keep that.
- L3197: `DISPATCH_STRING_RETURN_MAX_BYTES = 255`. L3583-3593: the dispatch encode is `const char *result = <call>;`, then `if (result == NULL) { *respLen = 0; return 1; }`, strlen capped at 255, `if (respCap < 4 + strLen) {...return 1;}`, `memcpy(resp, &strLen, 4); memcpy(resp + 4, result, strLen); *respLen = 4 + strLen; return 0;`. The helper side is CORRECT. Leave its emitted text unchanged.
- L1931-1950: the out-buffer decode already reads `[u32 declLen]` before copying (`memcpy(&declLen, retbuf + respOff, 4); respOff += 4;`, then clamps). The planner checked it and it does NOT have this defect. The other shim retbuf consumers also read their values correctly: sret (structSize raw, L1837), the scalar return (retWidth raw, L1877), the presence/lookup path (4-byte int, L1704) and the CREATE_INTERFACE control slot (`retlen != 4`, L1335-1336). None of them is length-prefixed on the wire.
- L2661-2664: the shim header emits `#define STRING_RETURN_BUF_BYTES ${STRING_RETURN_BUF_BYTES}`.
- `emitVtableStub` (L1713) and `emitDispatchCase` (L3403) are NOT exported. `generateShimC`, `generateDispatchHeader`, `generateCallbackRegistryC` and `computeWireTableHash` are exported.
- `computeWireTableHash` (L3164) hashes the manifests, not the emitted code, so this change must NOT move `BRIDGE_DISPATCH_TABLE_HASH` (currently `00e358feeee6`), and bridge_dispatch.h must regenerate byte-identical.

native/steam-bridge/generated/steam_api_shim.c, `bridge_transact_once` (~L301-346): if the response payload `retLen > retBufCap`, it closesocket()s and returns 0 (55 WR-02). With today's 255-byte string retbuf, a 252..255-byte string (encoded 256..259 bytes) drops the bridge connection. Sizing retbuf to `4 + DISPATCH_STRING_RETURN_MAX_BYTES` (259) closes this latent mismatch. Record it in the SUMMARY.

src/backend/storeManagers/steam/bridge/protocol.ts: frame-level only (request_id/status/length). It has no string-return encode or decode, so there is no TS-side agreement to fix. State this in the SUMMARY.

Existing tests that pin the DEFECTIVE shape and must be inverted, not deleted:
- meta/__tests__/gen_vtables.test.ts ~L378-410 (24-CR-01 GetPersonaName pins). These expect `uint8_t retbuf[STRING_RETURN_BUF_BYTES - 1]`, `memcpy(vt_SteamFriends018_GetPersonaName_buf, retbuf, retlen);` and `vt_SteamFriends018_GetPersonaName_buf[retlen] = '\0';`.
- gen_vtables.test.ts ~L414-460 (261026-qvc GetFriendPersonaName pins). These carry the same three literals for each of the 5 SteamFriends versions.
- Grep `meta/` and `src/` for `retbuf, retlen)` and `_buf[retlen]` in case other tests pin the shape.

Host-harness precedent: meta/__tests__/callbackRegistryHost.test.ts + meta/__tests__/fixtures/callback_registry_harness.c. The test writes generated C into a `createFakeHomeProfile({ prefix })` root, compiles with `clang -std=c11 -Wall -Werror -I <root> -o <exe> <harness>` via a local `spawnArgv(cmd, args, profile.childEnv())`, runs it, asserts one `PASS <case>\n` line per case plus exit 0 with no `FAIL`, skips only on clang ENOENT, and calls `profile.dispose()` in afterAll. The harness `#include`s the generated file and uses a `CHECK(c)` macro that prints `FAIL <case> <expr>:<line>` and exits 1. Copy this pattern exactly. It satisfies the fake-HOME two-profile rule: isolated by default, and nothing here is profile-dependent, so no real-profile arm is needed. Say so in the test's header comment.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Single-source the string-return encode/decode in the generator, fix the shim decode, regenerate</name>
  <files>meta/gen_vtables.ts, meta/__tests__/gen_vtables.test.ts, native/steam-bridge/generated/steam_api_shim.c</files>
  <behavior>
    - The `emitStringReturnDecode(bufName)` output (new export) reads a 4-byte length from `retbuf` only after checking `retlen >= 4`. It accepts the length only when it is `<= retlen - 4` and `< STRING_RETURN_BUF_BYTES`, then copies that many bytes from `retbuf + 4` into bufName, NUL-terminates at the decoded length and returns bufName. Every other branch writes `bufName[0] = '\0'` and returns bufName. The output contains neither `memcpy(<bufName>, retbuf, retlen)` nor `<bufName>[retlen]`.
    - The `emitStringReturnEncodeLines(resultVar)` output (new export) joined with '\n' is byte-identical to the helper string encode emitted today (the NULL check through `return 0;`, at the same 6-space indent).
    - generateShimC over the committed manifests: every `static const char * THISCALL vt_*` string-return thunk declares `uint8_t retbuf[STRING_RETURN_WIRE_BYTES]` and contains `emitStringReturnDecode('<fn>_buf')` verbatim. Assert this for vt_SteamFriends018_GetPersonaName and for all 5 GetFriendPersonaName cases. Also add one sweep assertion: zero `retbuf, retlen)` matches anywhere in the shim. The same pins hold for the committed native/steam-bridge/generated/steam_api_shim.c.
    - The shim header emits `#define STRING_RETURN_WIRE_BYTES <n>`, where n = 4 + DISPATCH_STRING_RETURN_MAX_BYTES. A test asserts `DISPATCH_STRING_RETURN_MAX_BYTES < STRING_RETURN_BUF_BYTES`, so the decoded string plus its NUL always fits, and asserts the exported STRING_RETURN_WIRE_BYTES equals 4 + DISPATCH_STRING_RETURN_MAX_BYTES.
    - generateDispatchHeader: the SteamFriends018.GetPersonaName case body contains `emitStringReturnEncodeLines('result').join('\n')` verbatim. The committed bridge_dispatch.h is unchanged and its BRIDGE_DISPATCH_TABLE_HASH still equals `computeWireTableHash`.
    - The existing 24-CR-01 and 261026-qvc tests are updated to the new shape. They keep their `not.toContain('retbuf[4]')`, failure-path `_buf[0] = '\0'` and `return <fn>_buf;` assertions, and gain `not.toContain('_buf, retbuf, retlen)')` as the regression pin.
  </behavior>
  <action>
Write the tests first (RED), then implement. Add the new tests to meta/__tests__/gen_vtables.test.ts in a `describe('quick 261026-rqb: string-return wire decode ([u32 len][bytes])')` block. Invert the existing pins listed in the interfaces block rather than deleting them.

In meta/gen_vtables.ts:
(1) Add `export const STRING_RETURN_WIRE_BYTES = 4 + DISPATCH_STRING_RETURN_MAX_BYTES`. Place it after DISPATCH_STRING_RETURN_MAX_BYTES, or move that constant up if declaration order requires it; there must be no use before definition. Emit `#define STRING_RETURN_WIRE_BYTES ${STRING_RETURN_WIRE_BYTES}` next to the existing STRING_RETURN_BUF_BYTES define (~L2664).
(2) Add `export function emitStringReturnEncodeLines(resultVar: string): string[]`. Move the current dispatch string-encode lines into it unchanged, from the NULL check to `return 0;`, with `result` replaced by resultVar. The dispatch branch then emits `const char *result = <call>;` followed by these lines.
(3) Add `export function emitStringReturnDecode(bufName: string): string`. It returns the shim-side C text that runs after a successful bridge_transact, with the semantics in the behavior block. Use explicit unsigned arithmetic: compare `retlen < 4` first, so `retlen - 4` can never wrap. Use 2-space indent to match the surrounding thunk body.
(4) Rewrite the shim `if (stringReturn)` branch to declare `uint8_t retbuf[STRING_RETURN_WIRE_BYTES]` and to keep the existing transact-failure early return. After it, append `emitStringReturnDecode(\`${funcName}_buf\`)`. Replace the CR-01 comment's false parenthetical with the truth: the helper encodes `[u32 len][bytes]` (see WIRE_LAYOUT_DOC and emitStringReturnEncodeLines), and this branch decodes through the same-module emitter so the two sides share one definition. Cite quick 261026-rqb and the 0x07 godot.log evidence in one line.
(5) Rewrite the STRING_RETURN_BUF_BYTES doc comment. It is now the decoded-string buffer, with the NUL written at the decoded length, and it must exceed DISPATCH_STRING_RETURN_MAX_BYTES.
(6) Add the shim decode rule to WIRE_LAYOUT_DOC's string-return clause.

Do not change any other retbuf consumer. The out-buffer, sret, scalar, presence and control-slot decodes were checked and are not length-prefix defects (see interfaces); record that conclusion in the SUMMARY. If a test proves one of them wrong, fix it and name it.

Regenerate with `pnpm gen-vtables`. Only steam_api_shim.c should change. If bridge_dispatch.h or a .def file changes, stop and explain the change in the SUMMARY before continuing.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm gen-vtables && git diff --quiet -- native/steam-bridge/generated/bridge_dispatch.h native/steam-bridge/generated/steam_api.def native/steam-bridge/generated/steam_api64.def && test "$(grep -c 'retbuf, retlen)' native/steam-bridge/generated/steam_api_shim.c)" = "0" && grep -c '^#define STRING_RETURN_WIRE_BYTES 259$' native/steam-bridge/generated/steam_api_shim.c && npx jest meta/__tests__/gen_vtables.test.ts && npx tsc --noEmit -p . && npx prettier --check meta/gen_vtables.ts meta/__tests__/gen_vtables.test.ts</automated>
  </verify>
  <done>gen_vtables suite green. The committed shim has zero raw `retbuf, retlen)` copies and defines STRING_RETURN_WIRE_BYTES 259. bridge_dispatch.h and both .def files are byte-unchanged. Typecheck and the scoped prettier check pass. The generated .c is a C source with no prettier parser, so it is deliberately not in the prettier list.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Compiled host round-trip harness: helper encode feeds shim decode</name>
  <files>meta/__tests__/stringReturnRoundTrip.test.ts, meta/__tests__/fixtures/string_return_roundtrip_harness.c</files>
  <behavior>
    - PASS empty: result "" encodes as 4 bytes, and the decode yields "" with strlen 0.
    - PASS seven_byte_name: result "Tester7" decodes to exactly "Tester7" (memcmp + strlen 7). The first decoded byte is NOT 0x07. This pins the live regression.
    - PASS len_128 and PASS len_255: these lengths round-trip byte-exact, and respLen is <= STRING_RETURN_WIRE_BYTES. That is the capacity the shim's retbuf passes to bridge_transact, so a real transact would not trip the oversize drop.
    - PASS capped_300: a 300-byte result is capped by the encoder to 255. The decode yields the first 255 bytes, NUL-terminated.
    - PASS null_result: the encoder returns status 1 with respLen 0. The harness models a failed transact as the shim's failure path, so the decoded buffer holds "".
    - PASS malformed_short: retlen 0, 1 and 3 each decode to "".
    - PASS malformed_overlong: a declared len of 10 with retlen 8 decodes to "". A declared len of STRING_RETURN_BUF_BYTES with a full-size retbuf decodes to "". A declared len of 0xFFFFFFFF decodes to "". None of these reads past retlen. Compile with `-fsanitize=address,undefined` if clang on this Mac supports it (probe once; if the probe fails, drop the flag and record that in the SUMMARY).
    - The harness exits 0 with no FAIL line.
  </behavior>
  <action>
Create meta/__tests__/stringReturnRoundTrip.test.ts following the callbackRegistryHost.test.ts pattern exactly (see interfaces). In beforeAll, create a `createFakeHomeProfile({ prefix: 'gamelib-strret-' })` and write `gl_string_return.h` into its root, built from the generator's own exports so no literal is duplicated: the `#define STRING_RETURN_BUF_BYTES` and `#define STRING_RETURN_WIRE_BYTES` lines from the exported constants. Then add a function `static uint8_t gl_encode(const char *result, uint8_t *resp, uint32_t respCap, uint32_t *respLen)` whose body is `emitStringReturnEncodeLines('result').join('\n')`. Then add a function `static const char *gl_decode(const uint8_t *retbuf, uint32_t retlen, char *gl_buf)` whose body is `emitStringReturnDecode('gl_buf')`. If the decode text needs bufName to be an array rather than a pointer, adjust the wrapper signature to fit, never the emitter. Then compile meta/__tests__/fixtures/string_return_roundtrip_harness.c with `clang -std=c11 -Wall -Werror -I <root>` and run it under `profile.childEnv()`. Skip only on clang ENOENT. Register no captures beyond the profile, and dispose it in afterAll.

The harness #includes `gl_string_return.h`. For each case it builds a result string, calls gl_encode into a `uint8_t resp[4096]` (the helper's BRIDGE_DISPATCH_RESP_SCRATCH_BYTES), and checks `respLen <= STRING_RETURN_WIRE_BYTES`. It then copies resp into a `uint8_t retbuf[STRING_RETURN_WIRE_BYTES]`, exactly as bridge_transact would, and calls gl_decode on a `char buf[STRING_RETURN_BUF_BYTES]`. The malformed cases hand-build retbuf/retlen directly and skip gl_encode. It prints `PASS <case>` per case using the CHECK/fail_at shape from callback_registry_harness.c. The test's header comment states the fake-HOME two-profile reasoning: isolated, with no profile-dependent behaviour, so there is no real-profile arm. The test asserts one `PASS <name>\n` per case, plus exit 0 and no FAIL.

Prove RED once, in a scratchpad copy rather than the repo. Temporarily swap the decode body for the old raw copy (`memcpy(gl_buf, retbuf, retlen); gl_buf[retlen] = 0; return gl_buf;`) and confirm seven_byte_name FAILs. Note the outcome in the SUMMARY.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest meta/__tests__/stringReturnRoundTrip.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts && npx tsc --noEmit -p . && npx prettier --file-info meta/__tests__/fixtures/string_return_roundtrip_harness.c && npx prettier --check meta/__tests__/stringReturnRoundTrip.test.ts</automated>
  </verify>
  <done>The round-trip suite runs (not skipped) on this Mac, with every case PASS and exit 0. The fakeHomeIsolation gate stays green. Typecheck passes and the scoped prettier check passes on the .ts file. The `--file-info` output for the .c harness is recorded in the SUMMARY: expected `inferredParser: null`, which is why the .c file is not in the --check list.</done>
</task>

<task type="auto">
  <name>Task 3: Rebuild, run bridge suites, graphify, and record the live-gate evidence in the todo and 53-UAT item 36</name>
  <files>.planning/todos/pending/2026-10-25-overlooting-godot-null-call-before-shim.md, .planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-UAT.md</files>
  <action>
Run `pnpm build-steam-bridge`; it must exit 0. Record the sizes with `stat -f %z` for public/bin/arm64/darwin/steam_api.dll, steam_api64.dll and steam-bridge-helper. Use the paths the build log prints if they differ. The prior sizes were 290304, 505344 and 156688. The two DLLs are expected to change. The helper is expected to stay the same, because bridge_dispatch.h did not change. If it moves anyway, say why. Run `grep -rn "505344\|290304\|156688" src meta` and update any live assertion that depends on a size, naming it in the SUMMARY. Do not rewrite historical UAT size text.

Run `npx jest meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts meta/__tests__/buildSteamBridgeShims.test.ts meta/__tests__/stringReturnRoundTrip.test.ts src/backend/storeManagers/steam/bridge`. shimAbiGate must execute (not skip). Its real-x64-shim compile also proves the new decode compiles under zig. Then run `graphify update .`.

Append `## 261026-rqb evidence (2026-10-26)` to the END of .planning/todos/pending/2026-10-25-overlooting-godot-null-call-before-shim.md. Do not alter any earlier section. Leave the frontmatter byte-for-byte unchanged (`severity: major`, `platform: macos`, `ready: live-gate`). Write it in the file's existing prose style, covering:
(a) The 261026-qvc live gate. 2026-10-26 19:48 and 19:50, on the rebuilt packaged debug bundle (helper 156688, steam_api64.dll 505344), launched via `gamelib://launch?appName=3410180&runner=steam`. The nvapi64 override applied and there was no page fault. The log showed HELLO, `GINIT fn=SteamInternal_SteamAPI_Init ret=0 ok=1`, `CALL SteamUser023.GetSteamID` and `CALL SteamFriends018.GetFriendPersonaName`, with no NOVER. `pnpm bridge-census` reads 3410180 `verified`. The operator quit cleanly via the game's Quit button at 19:55 and the menu behaved normally.
(b) The name is still wrong. The godot.log `Usernam: ` line hex is `55 73 65 72 6e 61 6d 3a 20 07 0a`. 0x07 is the low byte of the 4-byte LE length prefix of a 7-byte name, and the following 0x00 terminates the string.
(c) The root cause. The generated shim string-return branch copied the whole `[u32 len][bytes]` reply raw. It sat in the generator, so it affected every wired string return on every interface and arch: GetPersonaName (Vampire's Fall 1167950, Mining Mechs 1603180), GetCurrentGameLanguage (Rogue Waters 1691190, Mining Mechs) and others. Those census rows read verified only because the census checks that CALLs happened, not what they returned.
(d) The fix. Single-sourced encode/decode emitters; the decode rule; the retbuf resized to 259, which also closes the 252..255-byte oversize-drop mismatch; the round-trip harness; the new sizes.
(e) A HYPOTHESIS line, explicitly labelled unproven: Mining Mechs' Win32 error dialogs (todo `completed/2026-10-25-mining-mechs-win32-error-dialogs-on-launch.md`) may come from a garbage GetCurrentGameLanguage. It is recorded here because that todo is under completed/ and carries an unrelated uncommitted user edit, so this task does not touch it.
(f) Next: a live re-run on a packaged build with the rebuilt shim must show the real persona name after `Usernam:` in godot.log. Restart dev so the rebuilt helper and shim are used.

In .planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-UAT.md, edit ONLY the `result:` line of `### 36. Overlooting 3410180 (Godot, nvapi64 override)`. Leave the heading and `expected:` untouched. Per the UAT shape rule, the line stays a single column-0 `result:` line opening with the bare status word `issue`. No bold may precede the word. The status stays `issue`, because the name is still wrong; the gamelib-conventions UAT section has no rule overriding that. Put this run's evidence first, in parentheses straight after the word: the 261026-qvc rerun of 2026-10-26 19:48/19:50 with HELLO, the GINIT ok=1, both CALLs, no NOVER, census `verified`, the clean quit at 19:55, `Usernam:` decoded as the single byte 0x07 (length prefix) with the root cause named and fixed in 261026-rqb, and a pending live re-run to show the real name. Then keep the previous result text verbatim, introduced as `Earlier run (53-20, 14:03): ...`.

Then run `pnpm planning-gates`. If `audit-uat` is on PATH, also run it (gsd-core `audit-uat --raw`) and confirm 53-UAT.md has no `parse_gap`. If it is not available, say so in the SUMMARY. Stage and commit only the files in this plan's files_modified, plus any size-assertion file named above and the graphify outputs if the repo tracks them. NEVER stage .planning/todos/completed/2026-10-25-mining-mechs-win32-error-dialogs-on-launch.md: it has an unrelated uncommitted user modification. Use `git add <explicit paths>`, never `git add -A` or `git add .`, and confirm with `git diff --cached --name-only` before committing.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm build-steam-bridge && npx jest meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts meta/__tests__/buildSteamBridgeShims.test.ts meta/__tests__/stringReturnRoundTrip.test.ts src/backend/storeManagers/steam/bridge && grep -c "^## 261026-rqb evidence" .planning/todos/pending/2026-10-25-overlooting-godot-null-call-before-shim.md && grep -c "^ready: live-gate$" .planning/todos/pending/2026-10-25-overlooting-godot-null-call-before-shim.md && awk '/^### 36\./{p=1;next} /^### 37\./{p=0} p && /^result: issue /' .planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-UAT.md | grep -c "261026-rqb" && pnpm planning-gates && npx prettier --file-info .planning/todos/pending/2026-10-25-overlooting-godot-null-call-before-shim.md .planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-UAT.md && test -z "$(git diff --cached --name-only | grep mining-mechs)"</automated>
    Both .planning paths are prettier-ignored. The `--file-info` probe should print `"ignored": true` for each, so a `--check` over them would be vacuous and is deliberately omitted per the formatter convention. This task writes no other prettier-visible path.
  </verify>
  <done>The bridge builds. All five suites pass, with shimAbiGate executed. New sizes are recorded. graphify is refreshed. The todo has the 261026-rqb section and unchanged frontmatter. UAT item 36's result opens with `issue (` and cites 261026-rqb, with the earlier text preserved. planning-gates passes. The mining-mechs todo is neither staged nor modified by this task.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| helper -> shim (TCP response frame) | Response bytes come from the helper process. The shim treats the declared string length as untrusted. |
| shim -> game (returned const char*) | The game reads until NUL from a shim-owned static buffer. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-rqb-01 | Tampering / Elevation | emitStringReturnDecode | mitigate | Check `retlen >= 4` before subtracting. Require the declared len to be `<= retlen - 4` and `< STRING_RETURN_BUF_BYTES`, otherwise return "". The compiled harness pins the malformed_short and malformed_overlong cases, under ASan/UBSan where available. |
| T-rqb-02 | Information disclosure | shim string buffer | mitigate | Always NUL-terminate at the decoded length, so the game never reads stale bytes past the string. The harness checks strlen equals the expected length. |
| T-rqb-03 | Denial of service | bridge_transact oversize drop | mitigate | Size retbuf to STRING_RETURN_WIRE_BYTES (4 + DISPATCH_STRING_RETURN_MAX_BYTES), so the helper's maximum encode never exceeds the shim's cap. The harness pins it with the len_255 and capped_300 cases. |
| T-rqb-04 | Information disclosure | todo/UAT evidence | accept | The evidence records the name length (7) and hex of the line only, never the persona name itself. |
</threat_model>

<verification>
- The shim contains zero raw `retbuf, retlen)` copies. Every string thunk uses the shared decode.
- bridge_dispatch.h is byte-unchanged and the wire-table hash still reads `00e358feeee6`.
- The round-trip harness proves helper encode followed by shim decode is the identity for lengths 0..255 and caps at 255.
- gen_vtables, shimAbiGate, buildSteamBridgeShims, stringReturnRoundTrip and the steam/bridge suites are green. tsc and planning-gates are green.
</verification>

<success_criteria>
- A game calling GetPersonaName, GetFriendPersonaName or GetCurrentGameLanguage through the rebuilt shim receives the helper's real string. The live confirmation is deferred to the next Overlooting run, recorded as the todo's Next.
- The Overlooting todo and 53-UAT item 36 record the 261026-qvc live gate and the root cause. The UAT status stays `issue`.
- The Mining Mechs hypothesis is recorded as unproven, in the Overlooting todo and the SUMMARY, without touching the completed/ file.
</success_criteria>

<output>
Create `.planning/quick/261026-rqb-fix-shim-string-return-decoding-of-the-h/261026-rqb-SUMMARY.md` when done. It must include: new sizes, the other-retbuf-consumers conclusion, the protocol.ts finding, the RED proof outcome, the ASan availability, the prettier `--file-info` results, and the note that the completed/ mining-mechs todo was deliberately left untouched along with the hypothesis.
</output>
