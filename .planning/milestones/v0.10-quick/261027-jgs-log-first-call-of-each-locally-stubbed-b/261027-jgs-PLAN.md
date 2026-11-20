---
phase: quick-261027-jgs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - native/steam-bridge/helper/bridge_helper.c
  - src/backend/storeManagers/steam/bridge/protocol.ts
  - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts
  - meta/gen_vtables.ts
  - meta/__tests__/gen_vtables.test.ts
  - meta/__tests__/shimAbiGate.test.ts
  - native/steam-bridge/generated/steam_api_shim.c
autonomous: true
requirements: [QUICK-JGS-01, QUICK-JGS-02, QUICK-JGS-03]

must_haves:
  truths:
    - "The first time a game calls a manifest method that the shim answers locally (stub mode, helperFallback, or the SteamClient WR-09 off-path gate), the helper logs exactly one line `STUBCALL <VERSION>.<Method> slot=<n> kind=<stub|fallback|offpath>`"
    - "The first time a game calls a non-sret slot of ANY x64 null object, the helper logs exactly one line `STUBCALL <VERSION> slot=<n> kind=null`, where VERSION is the exact interface version the game requested (an unserved version not in the sret inventory included, e.g. STEAMREMOTESTORAGE_INTERFACE_VERSION014), or `unknown` for a NULL request or pool overflow"
    - "A second call of the same site sends nothing; a failed report (no helper, before HELLO, old helper) re-arms the site, at most 3 attempts per site"
    - "No stub's return value, out-params, sret zero-fill or callee-clean `ret N` changes; a null-object non-sret slot still returns 0 in RAX; sret null slots keep their ijs NULLSRET function and do not also emit STUBCALL"
    - "The helper refuses REPORT_STUB_CALL on an unauthenticated socket, rejects malformed frames without logging, sanitises version and method, and caps STUBCALL at 256 lines per process with one cap-reached line"
  artifacts:
    - path: "native/steam-bridge/helper/bridge_helper.c"
      provides: "CONTROL_SLOT_REPORT_STUB_CALL 8 handler logging STUBCALL"
      contains: "#define CONTROL_SLOT_REPORT_STUB_CALL 8"
    - path: "src/backend/storeManagers/steam/bridge/protocol.ts"
      provides: "CONTROL_SLOT.reportStubCall = 8"
      contains: "reportStubCall: 8"
    - path: "meta/gen_vtables.ts"
      provides: "gamelib_stubcall_note reporter, per-function one-shot state in every locally-answered manifest method, 256 per-slot x64 null thunks, per-version null-object pool"
      contains: "gamelib_stubcall_note"
    - path: "native/steam-bridge/generated/steam_api_shim.c"
      provides: "regenerated shim"
      contains: "#define BRIDGE_CONTROL_SLOT_REPORT_STUB_CALL 8"
  key_links:
    - from: "meta/gen_vtables.ts (gamelib_stubcall_note)"
      to: "bridge_helper.c CONTROL_SLOT_REPORT_STUB_CALL"
      via: "bridge_transact(BRIDGE_CONTROL_ORDINAL, BRIDGE_CONTROL_SLOT_REPORT_STUB_CALL, {u32 kind, u32 slot, u32 vlen, u32 mlen, ver, method})"
      pattern: "BRIDGE_CONTROL_SLOT_REPORT_STUB_CALL"
    - from: "protocol.ts CONTROL_SLOT.reportStubCall"
      to: "shim #define and helper #define"
      via: "protocol.test.ts parity regex"
      pattern: "REPORT_STUB_CALL"
    - from: "x64 null-object vtables (generic, per-version, pool)"
      to: "x64_null_call_note(self, N)"
      via: "vt_x64_null_s<N> per-slot thunks identify the instance from self"
      pattern: "vt_x64_null_s[0-9]+"
---

<objective>
Make every locally-answered Steam interface call visible. The first time the game calls a method the shim answers without a wire round-trip, the helper logs one `STUBCALL` line naming the interface version and the method (or the slot, for null objects).

Purpose: ELEX (411300) makes exactly one wired call (`CALL STEAMAPPS_INTERFACE_VERSION008.BIsSubscribedApp`) and then hangs on its loading screen on both D3DMetal and DXVK. 16 interfaces are stubbed for it. The hypothesis is that the loading screen waits on a SteamAPICall_t or callback that a local stub never delivers. Today stubbed and null-object calls are invisible. The STUBCALL timeline (timestamped by logts, interleaved with CALL lines) is the evidence for or against that hypothesis.

Output: control slot 8 (helper, protocol.ts, shim); a shared one-shot reporter in the shim; a report site in every stub / helperFallback / off-path local answer; 256 per-slot x64 null thunks replacing `vt_x64_null_object`; a bounded per-version pool so unknown versions get their own null object; adapted tests; rebuilt helper and DLLs.
</objective>

<design>
Decisions made at planning time. The executor does not revisit them.

1. **Wire contract: strings, not ordinals.** The shim sends the version and method strings it already has at generation time, like ijs. The helper holds no name table, so the shim and helper cannot drift. Null objects have no manifest and therefore no method name: they send version plus slot, with an empty method. argBlob is little-endian `{u32 kind, u32 slot, u32 vlen, u32 mlen, vlen bytes version, mlen bytes method}` with no NULs. The kinds are 0 = stub (manifest `mode: 'stub'`, via emitStubBody), 1 = fallback (`helperFallback`), 2 = offpath (SteamClient WR-09 `steamClientOffPathGate` local return), and 3 = null (x64 null-object non-sret slot).
2. **New slot 8, not a generalised slot 7.** NULLSRET (slot 7), its sites, its tests and its 64-line cap are untouched. sret null slots keep reporting NULLSRET only. STUBCALL covers everything else that answers locally.
3. **Per-site state lives in the function.** Each instrumented manifest function declares a block-scope `static volatile LONG gamelib_sc[2];` (`[0]` = reported flag, `[1]` = attempts) and calls `gamelib_stubcall_note(gamelib_sc, "<interface>", "<Method>", <slot>, <KIND>)`. This needs no global index table that could drift, and identical version literals are merged by the compiler.
4. **Null objects: 256 per-slot thunks plus instance identification from `self`.** Each null instance is a distinct object, so `vt_x64_null_s<N>(void *self)` calls `x64_null_call_note(self, N)` and returns 0. The note maps `self` to an instance index by address only. It checks the pool array by range and alignment, then scans the named-instance pointer table (generic first, then every per-version instance). It never dereferences `self`. An unrecognised `self` is not reported. Unknown versions get a distinct instance from a 32-entry pool (`GLIB_X64_NULL_POOL`), so the line carries the exact requested version. A NULL request or pool overflow falls back to the generic instance, whose version string is `unknown`.
5. **Reporters are `__attribute__((noinline))`.** They are a cold path. This keeps every thunk and stub a simple "call, then set the return" shape that the ABI gate can prove.
6. **Coverage boundary.** In scope are all vtable-level local answers on x86 and x64 (the generated code is shared, so x86 is free) and the x64 null objects. Flat `SteamAPI_I*` exports into a served instance route through the same vtable slot function, so they are covered by construction. Out of scope, with reasons:
   - The SteamClient GetISteamXxx lookups are not reported. They return a proxy or a null object, and the first call on that object is what gets reported.
   - The flat-export fall-through for a non-served `self` is not reported.
   - The GameServer flat stubs, lifecycle no-ops and legacy CSteamworks exports are not reported. They are not interface methods, ELEX evidence does not depend on them, and each would need its own site table.
   The SUMMARY lists all of these as known gaps.
</design>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/quick/261027-ijs-log-first-call-of-each-x64-null-object-s/261027-ijs-SUMMARY.md
@.planning/quick/261027-ijs-log-first-call-of-each-x64-null-object-s/261027-ijs-PLAN.md

Load `Skill("gamelib-conventions")` before writing any `<verify>` evidence. It carries the scoped prettier rule and the fake-HOME rule: helperIntegration.test.ts already spawns through `createFakeHomeProfile()`, and new tests reuse `authedEnv()` / `startAuthHelper` and never hand-roll an `env` literal.

Do not edit any todo file. In particular, do not edit the WR-03 todo or `2026-10-26-x64-null-object-sret-aware-per-family.md`. This quick task has no todo.

<interfaces>
Extracted at planning time so the executor does not need to explore.

meta/gen_vtables.ts
- `emitStubBody(manifest, method, header, funcName, sret, stringReturn)` (~line 1458) has 4 return shapes: sret (memset sretOut, return sretOut), string (return ""), void (optional textOutPrelude), and value (textOutPrelude, then `return <zeroLiteral>`). The x86 signature comes from `stackBytes` dummies and is THISCALL (callee-cleans).
- `emitVtableStub` (~line 1927) checks, in order:
  1. `isSteamClientVersionLookupMethod`, which goes to emitSteamClientForwardedLookup (wire) or emitSteamClientVersionLookupStub (stub). Neither is instrumented.
  2. `method.helperFallback !== undefined`, a void or `return <literal>` body. Instrument it as kind fallback.
  3. `methodMode === 'stub'`, which goes to emitStubBody. Instrument it as kind stub.
  4. Wire. `steamClientOffPathGate` (~line 1797) emits `#if defined(__x86_64__)\n  if (!g_bridge_steamstub_path_active) { return<value>; }\n#endif\n`. Instrument that block as kind offpath.
- Preamble control defines are at ~line 2862-2878 (`BRIDGE_CONTROL_SLOT_REPORT_NULL_SRET 7` is the last). `gamelib_report_init` is at ~line 3240 (unguarded, so x86 has bridge_transact). The callback-registry lock-rule comment follows it. `typedef void *vfn;` comes next, then the `#if defined(__x86_64__)` null-object block at ~line 3273: `vt_x64_null_object`, `g_x64_null_object_vtbl[X64_NULL_OBJECT_SLOTS]`, `struct GLibX64NullObject { vfn *vptr; }`, `g_x64_null_object_instance`, then `${emitX64NullSretObjects(...)}`.
- `emitX64NullSretObjects` (~line 1623) emits the ijs sret site table, `x64_null_sret_note`, the per-site sret functions, `g_x64_null_${id}_vtbl` (non-sret entries `(vfn)vt_x64_null_object,`), `g_x64_null_${id}_instance`, `g_x64_null_sret_objects[]` and `x64_null_object_for_version(const char *)`. That function is the single choke point for every null-object handout: SteamInternal_CreateInterface/FindOrCreate* (~lines 1239/1287/1296), the lookup stubs and the forwarded lookups. The vtable sections are emitted after the preamble, so a reporter defined in the preamble is visible to every stub.
- `X64_NULL_OBJECT_SLOTS = 256`. `STEAM_CLIENT_FAMILY = 'SteamClient'`.

native/steam-bridge/helper/bridge_helper.c
- Defines are at ~176-193 (`CONTROL_SLOT_REPORT_NULL_SRET 7` is the last). The module doc bullet for REPORT_NULL_SRET is at ~101-106.
- `g_ginit_logged`, `NULLSRET_LOG_MAX 64` and `g_nullsret_logged` are at ~589-595. `sanitize_ver(in, out, outSize)` (~600) bounds the output to 128 characters and turns non-printable bytes into '?'.
- The auth gate (~653) sits before every non-HEALTH/HELLO handler. The REPORT_NULL_SRET handler (~779-813) is the exact model: bounds check, then copy, then sanitise, then logts, then STATUS_OK. Over the cap it answers STATUS_OK without logging.
- `logts(cat, msg)` prints `[ts] %-6s msg`, so `STUBCALL` (8 characters) is followed by ONE space.

src/backend/storeManagers/steam/bridge/protocol.ts: `CONTROL_SLOT` ends `reportNullSret: 7` (~line 132).

Tests:
- helperIntegration.test.ts: the NULLSRET test at ~861 is the model (spawn with `authedEnv()` under `profile.root`, `rawFrame`). The WR-03 unauthenticated loop is at ~1103 (it already has a `nullSretBlob`).
- protocol.test.ts: the reportNullSret parity test at ~220-240 is the model.
- shimAbiGate.test.ts: `FIXTURE_MANIFEST` GameLibAbiGate001 is `mode: 'stub'`, and its slot 0 `GetFixtureID_TESTONLY` is a stub sret (`TARGET_FUNC`). Its x64 test (~307) asserts `mov %rdx,%rax` and `movq $0x0,(%rdx)`, and its i386 test (~326) asserts `ret $0x4`. Both will see the new note call. `NULL_OBJECT_FUNC = 'vt_x64_null_object'` (~107) feeds the plain-ret test at ~359. The ijs sret gate at ~371 has the rdx->R->rax dataflow matcher; factor it into a helper and reuse it. `NULL_SRET_INVENTORY` GameLibNullAbi001 has slotCount 2 with sret at slot 1, so slot 0 is a non-sret null slot that uses `vt_x64_null_s0`.
- gen_vtables.test.ts: the null-object assertions at ~1640-1870 and ~2814 reference `(vfn)vt_x64_null_object,` and `return (void *)&g_x64_null_object_instance;`. The real-inventory ijs test computes its site count from the inventory minus served versions.

Locked regions in the current shim, checked at planning time:
- `bridge_transact` (~444) and `SteamAPI_Shutdown` (~26424) hold g_bridge_lock.
- The registry functions (~556-707) hold g_cb_registry_lock.
None of these regions calls through a vtable or calls a `vt_*` function. The executor re-confirms this after regeneration.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Helper slot 8 (REPORT_STUB_CALL then STUBCALL) and the protocol.ts constant</name>
  <files>native/steam-bridge/helper/bridge_helper.c, src/backend/storeManagers/steam/bridge/protocol.ts, src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts</files>
  <behavior>
    - Authenticated frame {kind=0, slot=4, "STEAMAPPS_INTERFACE_VERSION008", "GetDLCCount"} returns STATUS_OK, and stderr gains `STUBCALL STEAMAPPS_INTERFACE_VERSION008.GetDLCCount slot=4 kind=stub`. Kinds 1 and 2 log `kind=fallback` and `kind=offpath`.
    - {kind=3, slot=12, "STEAMREMOTESTORAGE_INTERFACE_VERSION014", mlen=0} logs `STUBCALL STEAMREMOTESTORAGE_INTERFACE_VERSION014 slot=12 kind=null`, with no dot.
    - Each of these malformed frames returns STATUS_ERR and logs no STUBCALL: argLen < 16; kind >= 4; slot >= 256; vlen == 0; vlen > 128; mlen > 128; 16 + vlen + mlen > argLen; kind 3 with mlen != 0; kind 0-2 with mlen == 0.
    - Control bytes (e.g. a newline) in the version or the method are logged as '?'.
    - After 256 STUBCALL lines, more valid frames still return STATUS_OK. Exactly one extra line `STUBCALL cap of 256 reached; later first calls are not logged` appears, and nothing after it.
    - An unauthenticated socket gets STATUS_ERR for slot 8 and no STUBCALL line.
    - No STUBCALL frame produces a CALL line.
  </behavior>
  <action>
Implements design decisions 1 and 2. Do not touch the NULLSRET handler or its cap.

In bridge_helper.c:
- Add `#define CONTROL_SLOT_REPORT_STUB_CALL 8` after CONTROL_SLOT_REPORT_NULL_SRET. Add a one-line comment: quick 261027-jgs, the shim reports the first call of each locally-answered method or x64 null-object slot, logged as STUBCALL.
- Add a module-doc bullet after the REPORT_NULL_SRET bullet. It states the argBlob layout from design 1, the four kind names, that the slot is authenticated only, that version and method are sanitised, the 256 cap, and that STUBCALL is written only from this wire handler, which only the in-game shim drives.
- Next to g_nullsret_logged, add:
  - `#define STUBCALL_LOG_MAX 256`, with a comment: about 2000 manifest stub sites exist and the shim is one-shot per site, but ELEX alone stubs 16 interfaces, so the cap is higher than NULLSRET's.
  - `static unsigned g_stubcall_logged = 0;`
  - `static int g_stubcall_cap_noted = 0;`
  - `static const char *const k_stubcall_kind[4] = {"stub","fallback","offpath","null"};`
- Add the handler right after the REPORT_NULL_SRET handler, so it sits behind the auth gate. Model it exactly on that handler, in this order:
  1. Require argBlob != NULL and argLen >= 16.
  2. memcpy the four u32 values.
  3. Reject with STATUS_ERR, before any copy, if any of these hold: kind >= 4; slot >= 256; vlen == 0 or vlen > 128; mlen > 128; (uint64_t)16 + vlen + mlen > argLen; (kind == 3) != (mlen == 0).
  4. If g_stubcall_logged >= STUBCALL_LOG_MAX: log the cap line once (guarded by g_stubcall_cap_noted), then answer STATUS_OK.
  5. Otherwise increment the counter. Copy into `char sver[129]` and `char smeth[129]`, NUL-terminate, and `sanitize_ver` each into its own 132-byte buffer. Then `snprintf` into a 320-byte message: for kind 3, "%s slot=%u kind=%s"; otherwise "%s.%s slot=%u kind=%s". Then `logts("STUBCALL", msg)` and answer STATUS_OK.
- Answer regardless of g_inited. Never pump callbacks or dispatch.

In protocol.ts, add `reportStubCall: 8` after reportNullSret, with a comment matching the reportNullSret one: nothing in the sidecar sends it; it exists for the parity and helper tests.

In helperIntegration.test.ts:
- Add a test "REPORT_STUB_CALL logs STUBCALL, rejects malformed frames, sanitises, caps at 256 with one cap line, never logs CALL", modelled on the NULLSRET test (~861). Build frames with a local `stubCallBlob(kind, slot, ver, method)` helper.
- Count the cap from the constant used in the test, never from a literal repeated across assertions. Send STUBCALL_MAX + 5 valid frames, then assert that the number of `STUBCALL ` lines equals STUBCALL_MAX + 1 and the last of them is the cap line.
- Extend the WR-03 unauthenticated test (~1103) with a slot-8 frame. Assert STATUS_ERR, and add `STUBCALL` to that test's negative stderr assertions. Renumber the following request ids if they collide.
- Write the tests first, run them, and confirm they fail (slot 8 answers STATUS_ERR today). Then implement.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts && npx prettier --file-info src/backend/storeManagers/steam/bridge/protocol.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts && npx prettier --check src/backend/storeManagers/steam/bridge/protocol.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts</automated>
    Prettier is not run on bridge_helper.c. Its `--file-info` reports `"inferredParser": null`, so prettier has no C parser and the check would prove nothing. The two TS paths must report `"ignored": false`; if either is ignored, say so in the SUMMARY.
  </verify>
  <done>The helperIntegration suite passes on darwin, including the new STUBCALL test and the extended WR-03 test. The helper defines CONTROL_SLOT_REPORT_STUB_CALL 8. protocol.ts exports reportStubCall: 8. The NULLSRET test is unchanged and still passes. Prettier is clean on both TS paths.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Shim reporter plus a one-shot report site in every locally-answered manifest method; regenerate</name>
  <files>meta/gen_vtables.ts, meta/__tests__/gen_vtables.test.ts, meta/__tests__/shimAbiGate.test.ts, src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts, native/steam-bridge/generated/steam_api_shim.c</files>
  <behavior>
    - The preamble defines `#define BRIDGE_CONTROL_SLOT_REPORT_STUB_CALL 8` and `GAMELIB_STUBCALL_KIND_STUB 0`, `_FALLBACK 1`, `_OFFPATH 2` and `_NULL 3`. It also defines one `__attribute__((noinline)) static void gamelib_stubcall_note(volatile LONG *st, const char *ver, const char *method, uint32_t slot, uint32_t kind)` outside any arch guard.
    - The note returns at once if `InterlockedCompareExchange(&st[0], 1, 0) != 0` or `InterlockedIncrement(&st[1]) > 3`. Version and method lengths are bounded at 128 by a bounded loop, not by an unbounded strlen. A NULL method means mlen 0. It sends `{kind, slot, vlen, mlen, ver, method}` on slot 8 and runs `InterlockedExchange(&st[0], 0)` when `bridge_transact` returns 0.
    - Every emitStubBody shape (sret, string, void, value) declares `static volatile LONG gamelib_sc[2];` and calls `gamelib_stubcall_note(gamelib_sc, "<interface>", "<Method>", <slot>, GAMELIB_STUBCALL_KIND_STUB)`. The call comes after the memset or text-out prelude and before the return. The returned value or pointer is the same as before.
    - Both helperFallback shapes report with KIND_FALLBACK. The SteamClient off-path gate becomes `if (!g_bridge_steamstub_path_active) { static volatile LONG gamelib_sc[2]; gamelib_stubcall_note(gamelib_sc, ..., GAMELIB_STUBCALL_KIND_OFFPATH); return<value>; }`, still inside its `#if defined(__x86_64__)`.
    - The SteamClient version-lookup stubs and forwarded lookups, and every wire body outside the off-path gate, contain no `gamelib_stubcall_note`.
    - Real manifests: the number of `gamelib_stubcall_note(gamelib_sc, ` call sites equals a count computed in the test from the loaded manifests. The rule is: count a method when it is not a SteamClient version lookup AND (it has helperFallback, OR its effective mode is stub, OR its family is SteamClient). Each site's literals match its own manifest's interface, method name and slot.
    - protocol.test.ts gains a reportStubCall parity test: the shim and helper `#define` values equal CONTROL_SLOT.reportStubCall (8).
    - shimAbiGate: the i386 `ret $0x4` test for TARGET_FUNC still passes unchanged, which proves callee-clean survives the added call. The x64 TARGET_FUNC test proves that the incoming %rdx is returned in %rax, directly or through a callee-saved register, using the shared dataflow helper factored out of the ijs sret test. It also proves a zero store goes through %rdx or through that parked register, that %rcx is never used as the store base, and that the last ret is plain.
  </behavior>
  <action>
Implements design decisions 1, 3, 5 and 6 for manifest methods.

1. Preamble:
   - Add the slot-8 define after REPORT_NULL_SRET, with the comment: quick 261027-jgs; the helper logs STUBCALL; an old helper answers STATUS_ERR, which re-arms the site at most 3 times and is otherwise harmless.
   - Add the four KIND defines.
   - Define `gamelib_stubcall_note` right after `gamelib_report_init` (unguarded; it needs bridge_transact, which is defined above it). Use a local `uint8_t req[16 + 128 + 128]` and `uint8_t retbuf[1]; uint32_t retlen = 0;`.
   - Add a comment saying it holds no lock itself (bridge_transact takes g_bridge_lock), never touches the caller's return value or out-params, and is noinline because it is a cold path and to keep the ABI-gate shapes simple (design 5).
2. Thread the site through emitVtableStub and emitStubBody:
   - Add a small helper `stubCallSite(manifest, method, kindDefine)` that returns the two C lines (the `static volatile LONG gamelib_sc[2];` declaration and the call). Use it in all four emitStubBody shapes and both helperFallback shapes. In C, the static declaration must precede the first statement, so place it before `(void)self;`.
   - Check how the shimAbiGate linkage substitution (`static ... FUNC(` to `__declspec(dllexport)`) treats a block-scope static. It must still match only the function definition line.
   - In steamClientOffPathGate, put the block-scope static and the note inside the braces of the `if`.
   - Interface and method strings are generator-controlled identifiers. Assert in the generator that they match `/^[A-Za-z0-9_]+$/` before emitting them as C literals, and throw if not.
3. Update the emitStubBody doc comment and the X64/preamble comments that describe stubs as "never calls bridge_transact". A stub still never forwards its call. It sends one diagnostic report, once.
4. Run `pnpm gen-vtables`. Only native/steam-bridge/generated/steam_api_shim.c should change among the generated outputs (check `git status`). Report any other diff.
5. Lock check, recorded in the SUMMARY. In the regenerated shim, list every region between `AcquireSRWLockExclusive(&g_bridge_lock)` / `GL_CB_LOCK()` and its release, and confirm that none of them calls through a `vt[` vtable or calls any `vt_` function. If one does, stop and report rather than shipping a deadlock.
6. Tests:
   - gen_vtables.test.ts: synthetic tests for each shape and kind, plus the real-manifest count and literal-match test described in the behavior block. Compute the expected count in the test from `loadManifests`-equivalent data; never hard-code it. Update any existing exact-text stub assertions to include the new lines rather than deleting them.
   - protocol.test.ts: add the parity test.
   - shimAbiGate.test.ts: factor out the rdx-dataflow helper and adapt the x64 TARGET_FUNC test. Compile once and read the real disassembly before writing the store-base assertion. Do not weaken it to "mentions rdx".
   - Write the tests first and watch them fail against the old generator.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts && EXP=$(node -e 'const fs=require("fs"),d="meta/sdk";let n=0;for(const f of fs.readdirSync(d).filter(f=>f.endsWith(".manifest.json"))){const m=JSON.parse(fs.readFileSync(d+"/"+f,"utf8"));for(const x of m.methods){const lookup=m.family==="SteamClient"&&x.name.replace(/^DEPRECATED_/,"").startsWith("GetISteam")&&x.params.some(p=>p.type==="const char*");if(lookup)continue;if(x.helperFallback!==undefined||(x.mode??m.mode)==="stub"||m.family==="SteamClient")n++}}console.log(n)') && GOT=$(grep -v '^ *//' native/steam-bridge/generated/steam_api_shim.c | grep -c 'gamelib_stubcall_note(gamelib_sc, ') && echo "expected=$EXP got=$GOT" && test "$EXP" = "$GOT" && npx prettier --file-info meta/gen_vtables.ts meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts && npx prettier --check meta/gen_vtables.ts meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts</automated>
    Prettier is not run on steam_api_shim.c because it is a C file and `--file-info` reports `"inferredParser": null`. shimAbiGate must actually run, not print "SKIPPED"; confirm zig resolved in the jest output. If the node rule and the generator disagree, find out why before changing either; a mismatch is a finding, not a number to tune.
  </verify>
  <done>The three suites pass, with shimAbiGate not skipped. The regenerated shim has exactly the data-computed number of manifest report sites, the slot-8 define and one noinline reporter. The lock check is recorded. The parity test proves the shim, the helper and protocol.ts agree on 8.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Per-slot x64 null thunks and a per-version null-object pool; regenerate, rebuild, run the gates</name>
  <files>meta/gen_vtables.ts, meta/__tests__/gen_vtables.test.ts, meta/__tests__/shimAbiGate.test.ts, native/steam-bridge/generated/steam_api_shim.c</files>
  <behavior>
    - `vt_x64_null_object` is gone. Exactly X64_NULL_OBJECT_SLOTS thunks `static void *vt_x64_null_s<N>(void *self) { x64_null_call_note(self, N); return 0; }` exist, forward-declared before the generic vtable. Generic vtable entry i is `(vfn)vt_x64_null_s<i>,`. Every per-version vtable's non-sret entry i is `(vfn)vt_x64_null_s<i>,`. Sret entries are unchanged (the ijs per-site functions).
    - A named-instance table `g_x64_null_named[]` (generic `&g_x64_null_object_instance` first, then every `&g_x64_null_${id}_instance` in emission order) has a parallel `g_x64_null_named_ver[]` (`"unknown"`, then the exact version strings). The pool is `#define GLIB_X64_NULL_POOL 32`, `g_x64_null_pool[GLIB_X64_NULL_POOL]` (each `{ g_x64_null_object_vtbl }`), `g_x64_null_pool_ver[GLIB_X64_NULL_POOL][64]`, a used count, and `static SRWLOCK g_x64_null_pool_lock`. The state array is `static volatile LONG g_x64_null_call_state[<named count> + GLIB_X64_NULL_POOL][X64_NULL_OBJECT_SLOTS][2]`.
    - `x64_null_call_note(void *self, uint32_t slot)` is noinline. It returns if slot >= X64_NULL_OBJECT_SLOTS. It maps self to an index by address only: first a pool range-and-alignment check, then a scan of g_x64_null_named. It returns without reporting for an unknown self. It then calls `gamelib_stubcall_note(g_x64_null_call_state[idx][slot], <version>, NULL, slot, GAMELIB_STUBCALL_KIND_NULL)`.
    - `x64_null_object_for_version(version)` behaves as follows:
      - NULL returns the generic instance.
      - An exact per-version (sret inventory) match returns that instance, as today.
      - Otherwise, under g_x64_null_pool_lock, it finds an existing pool entry whose stored version equals the request (bounded at 63 characters) or claims the next free one, copying the version with a bounded copy and NUL. The lock is released on every path before returning.
      - When the pool is full it returns the generic instance.
      - The same version string always yields the same pointer.
    - No-inventory case: the thunks, the generic object, the pool and x64_null_call_note are still emitted (they no longer depend on the inventory). The ijs sret symbols are still absent.
    - shimAbiGate x64: `vt_x64_null_s0` (GameLibNullAbi001 slot 0 is non-sret) contains a call. After the last call, %eax is zeroed (`xor %eax,%eax` or `mov $0x0,%eax`, in any operand-size spelling), no later instruction writes %al/%ax/%eax/%rax, and the last ret is plain (no `$imm`). The ijs NULL_SRET_FUNC gate still passes.
  </behavior>
  <action>
Implements design decisions 4 and 5. Leave the ijs NULLSRET machinery (site table, `x64_null_sret_note`, per-site sret functions, `g_x64_null_sret_objects`) untouched.

1. In the preamble's x64 block:
   - Replace `vt_x64_null_object` with a forward declaration `static void x64_null_call_note(void *self, uint32_t slot);` followed by the 256 generated thunks.
   - Build `g_x64_null_object_vtbl` from the thunks.
   - Keep `struct GLibX64NullObject { vfn *vptr; }` and `g_x64_null_object_instance` as they are, so the struct layout the game reads is unchanged.
   - Update the 51-15 comment: Win64 is caller-cleans, so a per-slot thunk is arity-safe. It reports its first call per (instance, slot) as STUBCALL kind=null and still returns 0 in RAX.
   - Note the accepted change: XMM0 for a float-returning null slot was never set and is still unspecified.
2. In emitX64NullSretObjects:
   - Switch non-sret entries to `vt_x64_null_s<i>`.
   - After the per-version instances, emit the named table, the version table, the pool, the state array, `x64_null_call_note`, and the new `x64_null_object_for_version`.
   - Add a lock-rule comment: g_x64_null_pool_lock is a leaf lock, held only for the pool search and insert, and never held across any call or bridge_transact.
   - The comparison for pool hits must use a bounded comparison against the stored truncated copy (copy up to 63 bytes, compare with strncmp up to 63 plus a length check), so that a game-supplied string is never read unbounded beyond what strcmp on a NUL-terminated game string already does today.
   - Update the X64_NULL_OBJECT_SLOTS doc comment: unknown versions now get a distinct pooled instance (for identification only; the behaviour is still all-zero), and the REMAINING GAP about sret slots on unknown versions still holds.
3. Run `pnpm gen-vtables`. Check that only steam_api_shim.c changed among the generated outputs.
4. Re-run the Task 2 lock check for the new pool lock. Confirm that `x64_null_object_for_version` is never called while g_bridge_lock or g_cb_registry_lock is held (the ijs grep: every hit is a definition or a `return` to the caller). Record the result in the SUMMARY.
5. Tests:
   - gen_vtables.test.ts: migrate the `(vfn)vt_x64_null_object,` and `return (void *)&g_x64_null_object_instance;` assertions intentionally, to the new entries and the new fallback paths. Add synthetic tests for the behaviors above, including thunk count == X64_NULL_OBJECT_SLOTS (imported) and the per-version non-sret entries naming `vt_x64_null_s<i>`.
   - shimAbiGate.test.ts: set NULL_OBJECT_FUNC to `vt_x64_null_s0` and extend that test with the RAX-zero assertions. Compile once and read the block first.
   - Write the tests first and watch them fail.
6. Run `pnpm build-steam-bridge`. It builds the macOS helper from bridge_helper.c and the three zig DLLs from the regenerated shim; it does not run gen-vtables. Confirm all four artifacts in public/bin/arm64/darwin/ are newer than this task's start. Then run `strings public/bin/arm64/darwin/steam-bridge-helper | grep -c STUBCALL` and `strings public/bin/arm64/darwin/steam_api64.dll | grep STEAMAPPS_INTERFACE_VERSION008`; both must hit.
7. Run `pnpm codecheck`, `pnpm lint` (errors 0; pre-existing warnings are fine), `pnpm find-deadcode` and `pnpm planning-gates`. Then run `graphify update .`.
8. The SUMMARY includes operator steps for the ELEX rerun:
   1. Restart `pnpm tauri dev` (dev does not rebuild or restage the helper and DLLs until restart).
   2. Launch ELEX (411300).
   3. Read the helper log in time order: the CALL line, every STUBCALL line, and especially the last STUBCALL before the hang.
   4. A kind=stub on a SteamAPICall_t-returning method (e.g. FileReadAsync, or any UGC/RemoteStorage async) is the lead for the hypothesis.
   The SUMMARY also lists the known gaps from design 6.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts && SHIM=native/steam-bridge/generated/steam_api_shim.c && SLOTS=$(grep -o 'g_x64_null_object_vtbl\[[0-9]*\]' $SHIM | head -1 | tr -dc 0-9) && THUNKS=$(grep -c '^static void \*vt_x64_null_s[0-9]*(void \*self) {' $SHIM) && echo "slots=$SLOTS thunks=$THUNKS" && test "$SLOTS" = "$THUNKS" && test "$(grep -v '^ *//' $SHIM | grep -c 'vt_x64_null_object\b')" = 0 && SITES=$(grep -o '#define GLIB_X64_NULL_SRET_SITES [0-9]*' $SHIM | tr -dc 0-9) && test "$(grep -c '^static void \*vt_x64_null_sret_.*_s[0-9]*(void \*self, void \*ret)' $SHIM)" = "$SITES" && strings public/bin/arm64/darwin/steam-bridge-helper | grep -q STUBCALL && strings public/bin/arm64/darwin/steam_api64.dll | grep -q STEAMAPPS_INTERFACE_VERSION008 && pnpm codecheck && pnpm find-deadcode && pnpm planning-gates && npx prettier --file-info meta/gen_vtables.ts meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts && npx prettier --check meta/gen_vtables.ts meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts</automated>
    Prettier is not run on steam_api_shim.c (C, `"inferredParser": null`) or on the binary build outputs. shimAbiGate must run, not skip. Every count above is derived from the generated file itself (the vtable size and the GLIB_X64_NULL_SRET_SITES define), not hard-coded.
  </verify>
  <done>
    - Every x64 null-object non-sret slot is a per-slot thunk that reports STUBCALL kind=null once per (instance, slot) and returns 0 in RAX, proven by disassembly.
    - Unknown versions get distinct pooled instances carrying their exact version.
    - The NULLSRET sites are unchanged, and their count equals the define.
    - The helper and all three DLLs are rebuilt.
    - codecheck, lint (0 errors), find-deadcode and planning-gates are green, and the graph is updated.
    - The SUMMARY records the lock checks, the operator steps and the known gaps.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| game process (shim) to helper loopback socket | REPORT_STUB_CALL frames cross here; any local process could also connect |
| helper to log | Version and method strings are written into a log line |
| game to shim null-object pool | The game supplies the requested version string and the `self` pointer |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-jgs-01 | Tampering | bridge_helper.c REPORT_STUB_CALL handler | mitigate | All bounds (argLen >= 16, kind < 4, slot < 256, 0 < vlen <= 128, mlen <= 128, 16+vlen+mlen <= argLen, kind/mlen consistency) are checked before memcpy into fixed char[129] buffers |
| T-jgs-02 | Tampering (log injection) | STUBCALL line | mitigate | sanitize_ver on both version and method; kind printed from a closed 4-entry table; slot is %u |
| T-jgs-03 | Denial of service | helper log | mitigate | STUBCALL_LOG_MAX 256 with a single cap line; shim is one-shot per site with at most 3 attempts |
| T-jgs-04 | Spoofing | slot 8 from a non-shim local process | mitigate | Handler sits after the WR-03 auth gate; unauthenticated refusal is tested |
| T-jgs-05 | Elevation (deadlock) | g_bridge_lock / g_cb_registry_lock / g_x64_null_pool_lock | mitigate | Reporter holds no lock; the pool lock is a leaf held only for search and insert; Tasks 2 and 3 confirm by grep that no locked region calls a vtable or vt_ function and that x64_null_object_for_version is never called under a lock |
| T-jgs-06 | Tampering (memory safety) | x64_null_call_note mapping self | mitigate | self is identified by address comparison only (pool range plus alignment, named-table scan), never dereferenced; slot is bounds-checked; unknown self is ignored |
| T-jgs-07 | Tampering (memory safety) | pool version copy | mitigate | Bounded copy to 63 bytes plus NUL into a fixed buffer under the pool lock; overflow falls back to the generic instance |
| T-jgs-08 | Denial of service | game thread blocked in the first-call report | accept | Same exposure as gamelib_report_init and NULLSRET: one blocking loopback round trip per site, at most 3 per site, result ignored |
| T-jgs-09 | Information disclosure | XMM0 on float-returning null slots | accept | XMM0 was never set by the old null function either; the value is unspecified in both cases |
</threat_model>

<verification>
- helperIntegration, gen_vtables, shimAbiGate (not skipped) and protocol suites pass.
- The number of manifest report sites in the shim equals the count computed from meta/sdk manifests. The number of null thunks equals the generic vtable size. The number of NULLSRET sites equals GLIB_X64_NULL_SRET_SITES. No live `vt_x64_null_object` remains.
- Only steam_api_shim.c changed among the generated outputs. The helper and DLLs are rebuilt, and `strings` finds STUBCALL in the helper and the manifest literals in steam_api64.dll.
- codecheck, lint (0 errors), find-deadcode and planning-gates are green.
</verification>

<success_criteria>
When ELEX is relaunched against the rebuilt artifacts, the helper log shows, interleaved with the single CALL line, one timestamped STUBCALL line for the first call of every locally-answered method (`<VERSION>.<Method> kind=stub|fallback|offpath`) and every null-object slot (`<VERSION> slot=<n> kind=null`). No locally-answered return value changed, the x86 callee-clean and x64 RDX/RAX contracts are proven by disassembly, and NULLSRET behaves exactly as before.
</success_criteria>

<output>
Create `.planning/quick/261027-jgs-log-first-call-of-each-locally-stubbed-b/261027-jgs-SUMMARY.md` when done.
</output>
