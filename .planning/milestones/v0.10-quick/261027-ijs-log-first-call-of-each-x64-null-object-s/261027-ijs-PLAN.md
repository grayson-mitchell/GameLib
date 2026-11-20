---
phase: quick-261027-ijs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - native/steam-bridge/helper/bridge_helper.c
  - src/backend/storeManagers/steam/bridge/protocol.ts
  - src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
  - meta/gen_vtables.ts
  - meta/__tests__/gen_vtables.test.ts
  - meta/__tests__/shimAbiGate.test.ts
  - native/steam-bridge/generated/steam_api_shim.c
  - .planning/todos/pending/2026-10-26-x64-null-object-sret-aware-per-family.md
autonomous: true
requirements: [QUICK-IJS-01, QUICK-IJS-02, QUICK-IJS-03]

must_haves:
  truths:
    - "The first time a game calls a given (version, slot) x64 sret null-object method, the helper logs exactly one line `NULLSRET  <version> slot=<n> size=<bytes>` (logts's two-space category separator)"
    - "A second call of the same (version, slot) sends nothing: the shim reports one-shot per site via an interlocked flag"
    - "Every sret null-object method still zero-fills structSize bytes at ret and returns ret in RAX, whether or not the report succeeded, HELLO happened, or a helper exists at all"
    - "The helper refuses REPORT_NULL_SRET on an unauthenticated connection, rejects malformed frames without logging, sanitises the version string, and caps NULLSRET lines per process"
    - "The ABI gate still proves, by disassembly, that the incoming RDX is what comes back in RAX for the new per-(version, slot) function shape"
  artifacts:
    - path: "native/steam-bridge/helper/bridge_helper.c"
      provides: "CONTROL_SLOT_REPORT_NULL_SRET 7 handler logging NULLSRET"
      contains: "#define CONTROL_SLOT_REPORT_NULL_SRET 7"
    - path: "src/backend/storeManagers/steam/bridge/protocol.ts"
      provides: "CONTROL_SLOT.reportNullSret = 7"
      contains: "reportNullSret: 7"
    - path: "meta/gen_vtables.ts"
      provides: "per-(version, slot) sret functions, site table, one-shot reporter"
      contains: "BRIDGE_CONTROL_SLOT_REPORT_NULL_SRET"
    - path: "native/steam-bridge/generated/steam_api_shim.c"
      provides: "regenerated shim with 189 distinct sret null functions"
      contains: "x64_null_sret_note"
  key_links:
    - from: "meta/gen_vtables.ts (x64_null_sret_note)"
      to: "bridge_helper.c CONTROL_SLOT_REPORT_NULL_SRET"
      via: "bridge_transact(BRIDGE_CONTROL_ORDINAL, BRIDGE_CONTROL_SLOT_REPORT_NULL_SRET, {u32 slot, u32 size, u32 vlen, ver})"
      pattern: "BRIDGE_CONTROL_SLOT_REPORT_NULL_SRET"
    - from: "protocol.ts CONTROL_SLOT.reportNullSret"
      to: "shim #define and helper #define"
      via: "protocol.test.ts parity regex"
      pattern: "REPORT_NULL_SRET \\(\\\\d\\+\\)|REPORT_NULL_SRET"
---

<objective>
Instrument the per-version x64 sret null objects from quick 261027-i4x so the helper logs one `NULLSRET <version> slot=<n> size=<bytes>` line the first time a game calls each (version, slot) sret null method.

Purpose: the ELEX (411300) live gate for todo `2026-10-26-x64-null-object-sret-aware-per-family.md` was inconclusive. ELEX did not crash but hangs on its loading screen (a separate issue), and null-object calls never leave the shim, so there was no evidence that a SteamController003 sret slot was ever called. Only the shim inside the game process sends these lines, so they are game-originated by construction.

Output: new control slot 7 (helper, protocol.ts, shim), one distinct generated function per (version, slot) sret site (189 today), adapted generator and ABI-gate tests, rebuilt shim and helper artifacts, and a one-line Progress note on the todo.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/quick/261027-i4x-wr-03-per-version-sret-aware-x64-null-ob/261027-i4x-SUMMARY.md

Load `Skill("gamelib-conventions")` before writing any `<verify>` evidence. It covers the prettier rule and the fake-HOME rule (helperIntegration.test.ts already spawns through `createFakeHomeProfile()`; new tests reuse `authedEnv()` and `startAuthHelper` and never hand-roll an `env` literal).

<interfaces>
Existing code the executor builds on (extracted, so no exploration is needed):

meta/gen_vtables.ts
- `emitX64NullSretObjects(manifests, inventory)` (~line 1622). It validates the inventory, then emits per-SIZE functions `static void *vt_x64_null_sret_${n}(void *self, void *ret) { (void)self; if (ret != NULL) memset(ret, 0, ${n}); return ret; }`. For each kept version it emits `g_x64_null_${id}_vtbl[slotCount]` with `id = version.toLowerCase().replace(/[^a-z0-9_]/g, '_')`, plus `g_x64_null_${id}_instance`, `g_x64_null_sret_objects[]` and `x64_null_object_for_version(const char *)`. Its output is spliced inside the preamble's `#if defined(__x86_64__)` block (~line 3233), which comes AFTER `bridge_transact` (~line 3174) and `gamelib_report_init` (~line 3192), so both are in scope.
- The control-slot defines are in the preamble template at ~lines 2812-2832: `BRIDGE_CONTROL_ORDINAL 0xffff`, `_HELLO 2`, `_CREATE_INTERFACE 3`, `_REPORT_VERSION 4`, `_REPORT_INIT 5`, `_DRAIN_CALLBACKS 6`.
- The model reporter is `gamelib_report_init` (~line 3192): fixed-size request, `uint8_t retbuf[1]; uint32_t retlen = 0;`, and `(void)bridge_transact(...)` with the result ignored. `flat_report_unknown_version` (~line 3292) is the model for the `{u32 len, bytes}` encoding.
- Lock rule comment (~line 3204): g_cb_registry_lock is never held across bridge_transact or a game Run call, and g_bridge_lock (non-recursive SRWLOCK) is never held while calling into the registry. `bridge_transact` acquires g_bridge_lock itself.

native/steam-bridge/helper/bridge_helper.c
- Defines ~168-183: `CONTROL_SLOT_HEALTH 0` through `CONTROL_SLOT_DRAIN_CALLBACKS 6`. The module doc ~lines 80-98 lists the authenticated slots and describes REPORT_INIT.
- `static unsigned g_ginit_logged = 0;` (~line 581). `static void sanitize_ver(const char *in, char *out, size_t outSize)` (~line 586) bounds to 128 characters and replaces non-printable bytes with '?'.
- The auth gate (~line 639, `if (!*authenticated) { log_auth_refused(...); STATUS_ERR }`) sits BEFORE every non-HEALTH/HELLO handler, so a handler placed after it is authenticated automatically.
- REPORT_VERSION handler (~line 702) is the model: check argBlob/argLen, check bounds before memcpy, cap the count, then `sanitize_ver`, `snprintf`, `logts("NOVER", msg)` and `send_response(fd, requestId, STATUS_OK, NULL, 0)`. Once over the cap it still answers STATUS_OK. Unknown control slots fall through to `STATUS_ERR` (~line 791).
- `static void logts(const char *cat, const char *msg)` (~line 274) prints `CAT  msg`.

src/backend/storeManagers/steam/bridge/protocol.ts
- `export const CONTROL_SLOT = { health: 0, ..., reportInit: 5, drainCallbacks: 6 } as const` (~line 109).

Tests:
- protocol.test.ts ~line 197: drainCallbacks parity test. It regex-reads both C files for the #define value.
- helperIntegration.test.ts: darwin-only. REPORT_VERSION tests ~544/666, REPORT_INIT test ~731 (spawn with `authedEnv()`), unauthenticated-refusal test ~977 (loops over `[id, slot, blob]` triples).
- gen_vtables.test.ts ~1650-1780: synthetic and real-inventory assertions on `vt_x64_null_sret_${n}` names and per-slot vtable entries `(vfn)vt_x64_null_sret_16,`.
- shimAbiGate.test.ts: `NULL_SRET_FUNC = 'vt_x64_null_sret_16'` (line 108), `NULL_SRET_INVENTORY` with GameLibNullAbi001 slot 1 size 16 (line 111), and the test at ~line 370 asserting `/\bmovq?\s+%rdx,\s*%rax\b/` plus a plain final ret. It compiles at -O2 (SHIM_RELEASE_CFLAGS) with zig 0.16.0.

Inventory facts: meta/sdk/x64-null-sret-inventory.json has 189 sret slots, max structSize 40, longest version name 36 characters.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Helper slot 7 (REPORT_NULL_SRET then NULLSRET) and protocol.ts constant</name>
  <files>native/steam-bridge/helper/bridge_helper.c, src/backend/storeManagers/steam/bridge/protocol.ts, src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts</files>
  <behavior>
    - An authenticated frame {u32 slot=12, u32 size=16, u32 vlen=18, "SteamController003"} returns STATUS_OK and stderr gains `NULLSRET  SteamController003 slot=12 size=16`.
    - Each malformed frame returns STATUS_ERR and logs no NULLSRET. Cases: argLen < 12; vlen == 0; vlen > 128; 12 + vlen > argLen; slot >= 256; size == 0; size > 4096.
    - A version containing a newline or other control byte is logged with '?' in its place, so a version string cannot inject a log line.
    - After 64 logged NULLSRET lines, further valid frames still return STATUS_OK but log nothing (exactly 64 lines).
    - On an unauthenticated socket, slot 7 returns STATUS_ERR and logs no NULLSRET (add it to the WR-03 refusal loop and that test's no-NULLSRET assertion).
    - No NULLSRET test frame produces a CALL line.
  </behavior>
  <action>
Wire contract, decided here. The shim sends the version STRING, not a table index, so the helper holds no version knowledge and no shim/helper table can drift. Request argBlob is little-endian `{u32 slot, u32 structSize, u32 vlen, vlen bytes of version}` with no NUL.

In bridge_helper.c:
- Add `#define CONTROL_SLOT_REPORT_NULL_SRET 7` after CONTROL_SLOT_DRAIN_CALLBACKS, with a one-line comment (quick 261027-ijs: the shim reports the first call of each per-version x64 sret null-object slot, logged as NULLSRET).
- Add REPORT_NULL_SRET to the module doc's list of authenticated slots (~line 83), plus a short bullet like the REPORT_INIT bullet. The bullet says NULLSRET is written only from this wire handler, which only the in-game shim drives.
- Add `static unsigned g_nullsret_logged = 0;` next to g_ginit_logged and a `#define NULLSRET_LOG_MAX 64`. Rationale for 64: 189 sites exist, the shim is already one-shot per site, and a game touches only a handful.
- Add the handler after the REPORT_INIT handler, i.e. after the auth gate, so it is authenticated by construction. Model it on REPORT_VERSION, in this order:
  1. Require argBlob != NULL and argLen >= 12.
  2. memcpy the three u32 values.
  3. Reject with STATUS_ERR if slot >= 256 (X64_NULL_OBJECT_SLOTS), size == 0, size > 4096, vlen == 0, vlen > 128, or (uint64_t)12 + vlen > argLen. All of these checks happen before any copy.
  4. If g_nullsret_logged >= NULLSRET_LOG_MAX, answer STATUS_OK without logging.
  5. Otherwise increment, copy into `char ver[129]`, NUL-terminate, `sanitize_ver` into a 132-byte buffer, `snprintf` "%s slot=%u size=%u", `logts("NULLSRET", msg)` and answer STATUS_OK.
- Answer regardless of g_inited, like REPORT_INIT, because null objects are handed out exactly when Steam did not serve a version. Never call pump_callbacks or bridge_dispatch.

In protocol.ts add `reportNullSret: 7` to CONTROL_SLOT after drainCallbacks, with a matching comment. Nothing in the sidecar sends this slot. The constant exists for the parity test and the helper tests.

In helperIntegration.test.ts:
- Add a describe-block test "REPORT_NULL_SRET logs NULLSRET, rejects malformed frames, sanitises, caps at 64, never logs CALL", modelled on the REPORT_INIT test at ~731. Spawn with `authedEnv()` under `profile.root`; no hand-rolled env, per the fake-HOME convention.
- Extend the WR-03 unauthenticated loop at ~997 with `[7, CONTROL_SLOT.reportNullSret, <valid 12+n blob>]` and its negative stderr assertion to cover NULLSRET. Renumber the following request ids if they collide.
- Write the tests first, run them, and see them fail (slot 7 answers STATUS_ERR today). Then implement.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts && npx prettier --check src/backend/storeManagers/steam/bridge/protocol.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts</automated>
    Prettier is not run on bridge_helper.c. `npx prettier --file-info native/steam-bridge/helper/bridge_helper.c` reports `"inferredParser": null`, so prettier has no parser for it and the check would prove nothing.
  </verify>
  <done>The helperIntegration suite passes on darwin, including the new NULLSRET test and the extended WR-03 refusal test. The helper defines CONTROL_SLOT_REPORT_NULL_SRET 7. protocol.ts exports reportNullSret: 7. Prettier is clean on both TS files.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Generator emits one sret function per (version, slot) plus a one-shot reporter; regenerate the shim; adapt the tests</name>
  <files>meta/gen_vtables.ts, native/steam-bridge/generated/steam_api_shim.c, meta/__tests__/gen_vtables.test.ts, meta/__tests__/shimAbiGate.test.ts, src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts</files>
  <behavior>
    - gen_vtables (synthetic inventory): each sret site gets its own `static void *vt_x64_null_sret_${id}_s${slot}(void *self, void *ret)`, and the vtable entry at that slot names it. Two versions with the same struct size get DIFFERENT functions. No `vt_x64_null_sret_${n}` per-size function remains.
    - gen_vtables: a site table `g_x64_null_sret_sites[]` holds {version, slot, size} rows in emission order, and each function passes its own site index K to `x64_null_sret_note(K)`. A test asserts that for every row, the function at K's vtable slot calls note(K) and memsets the row's size.
    - gen_vtables: `x64_null_sret_note` uses `InterlockedCompareExchange` on a `static volatile LONG g_x64_null_sret_reported[COUNT]` flag and sends `BRIDGE_CONTROL_SLOT_REPORT_NULL_SRET` with a {u32 slot, u32 size, u32 vlen, ver} request. It ignores the bridge_transact result.
    - gen_vtables (real inventory): exactly 189 distinct `vt_x64_null_sret_*_s*` definitions, and the ELEX-relevant `SteamController003` sites at slots 9 and 12 exist. The no-inventory case still emits none of these symbols and no note function.
    - The preamble defines `#define BRIDGE_CONTROL_SLOT_REPORT_NULL_SRET 7`. A protocol.test.ts parity test, modelled on the drainCallbacks test, asserts the shim and helper defines equal CONTROL_SLOT.reportNullSret (7).
    - shimAbiGate x64: the function for GameLibNullAbi001 slot 1 returns the incoming %rdx in %rax and ends in a plain ret (no $imm).
  </behavior>
  <action>
In emitX64NullSretObjects (meta/gen_vtables.ts), keep all inventory validation and the per-version vtables, instances, `g_x64_null_sret_objects` and `x64_null_object_for_version` exactly as they are. Change only what the sret vtable entries point to.

1. Collect every kept (version, sret slot) pair in deterministic order: versions sorted, as today, then slots ascending. Assign site index K = 0..N-1.
2. Emit, in this order:
   - `#define GLIB_X64_NULL_SRET_SITES N`
   - `static const struct { const char *version; uint32_t slot; uint32_t size; } g_x64_null_sret_sites[GLIB_X64_NULL_SRET_SITES]` with one row per site.
   - `static volatile LONG g_x64_null_sret_reported[GLIB_X64_NULL_SRET_SITES];`
   - `static void x64_null_sret_note(uint32_t k)`. Body: return if k >= N. Return if `InterlockedCompareExchange(&g_x64_null_sret_reported[k], 1, 0) != 0`. Otherwise build `uint8_t req[12 + 128]` with slot, size, and vlen = strlen bounded at 128, then the version bytes. Call `(void)bridge_transact(BRIDGE_CONTROL_ORDINAL, BRIDGE_CONTROL_SLOT_REPORT_NULL_SRET, req, 12 + vlen, retbuf, sizeof(retbuf), &retlen)` with `uint8_t retbuf[1]; uint32_t retlen = 0;`, as in gamelib_report_init.
   - Then one function per site: `static void *vt_x64_null_sret_${id}_s${slot}(void *self, void *ret) { (void)self; if (ret != NULL) memset(ret, 0, ${size}); x64_null_sret_note(${K}); return ret; }`.
3. Memset happens before the note, so the struct is already zeroed if the transport is slow. `ret` is returned unconditionally, so the return value never depends on the report.
4. Point each vtable sret entry at its site function instead of the per-size one, and delete the per-size emission. When the table is empty, emit none of this: no sites define, no note function, nothing unused that would warn.

Thread safety and lock rules:
- The interlocked flag makes the report one-shot per site even under concurrent first calls.
- Do not hold any lock in note; bridge_transact takes g_bridge_lock itself. This is safe because the null objects are only ever handed to the game, so no shim code path calls through one while holding g_bridge_lock or g_cb_registry_lock. Confirm this with `grep -n "g_x64_null_.*_instance\|x64_null_object_for_version" native/steam-bridge/generated/steam_api_shim.c`: every hit must be a definition or a `return` to the caller. Record the result in the SUMMARY.
- If HELLO has not happened, the helper refuses with STATUS_ERR. If there is no helper, bridge_transact returns 0. Either way the note is consumed and ignored, by design: one attempt per site.
- Update the doc comment above X64_NULL_OBJECT_SLOTS / emitX64NullSretObjects and the preamble comment at ~line 3224 to describe the per-site functions and NULLSRET.

In the preamble template add `#define BRIDGE_CONTROL_SLOT_REPORT_NULL_SRET 7` after DRAIN_CALLBACKS, with a comment naming the helper's NULLSRET line and noting that an old helper answers STATUS_ERR, which is harmless.

Run `pnpm gen-vtables` to regenerate. Only native/steam-bridge/generated/steam_api_shim.c should change among the generated outputs; check `git status` and report any other diff.

Tests:
- In gen_vtables.test.ts, update the ~1650-1780 assertions from the per-size names to the per-site names, and add the behaviors above.
- In shimAbiGate.test.ts, set NULL_SRET_FUNC to `vt_x64_null_sret_gamelibnullabi001_s1` and keep NULL_SRET_INVENTORY. The function now makes a call, so at -O2 clang will likely keep RDX in a callee-saved register (Win64: rbx, rsi, rdi, r12-r15) across the call, or spill it to the stack, instead of emitting a literal `mov %rdx,%rax`. Compile once, read the actual disassembly block, then write an assertion that proves the RDX-to-RAX dataflow:
  - either a direct `mov %rdx,%rax`;
  - or `mov %rdx,%R` followed later by `mov %R,%rax`, where R is captured from the first match;
  - or the equivalent spill to `disp(%rsp)` and reload into %rax.
  Keep the plain-final-ret assertion. Update the test title and comment to say the function makes a call and RDX is preserved through a callee-saved register. Do not weaken it to "mentions rdx".
- In protocol.test.ts add the reportNullSret parity test.

Write or adjust the tests first and watch them fail against the old generator, then implement.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts && test "$(grep -c '^static void \*vt_x64_null_sret_.*_s[0-9]*(void \*self, void \*ret)' native/steam-bridge/generated/steam_api_shim.c)" = 189 && npx prettier --check meta/gen_vtables.ts meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts</automated>
    Prettier is not run on steam_api_shim.c because its `--file-info` reports `"inferredParser": null`. shimAbiGate must actually run, not print "SKIPPED". Confirm that zig resolved in the jest output.
  </verify>
  <done>The three suites pass with shimAbiGate not skipped. The regenerated shim has 189 distinct per-site sret functions, one note function and the slot-7 define. No per-size `vt_x64_null_sret_<N>` function remains. The protocol parity test proves shim, helper and protocol.ts agree on 7.</done>
</task>

<task type="auto">
  <name>Task 3: Rebuild both artifacts, run the repo gates, and note progress on the todo</name>
  <files>.planning/todos/pending/2026-10-26-x64-null-object-sret-aware-per-family.md</files>
  <action>
1. Run `pnpm build-steam-bridge`. It compiles BOTH the macOS helper (clang, from native/steam-bridge/helper/bridge_helper.c, into public/bin/arm64/darwin/steam-bridge-helper) AND the zig shims (steam_api.dll, steam_api64.dll, steamclient64.dll) from the already-regenerated generated/steam_api_shim.c. It does NOT run gen-vtables, which Task 2 already did.
2. Confirm that all four artifacts in public/bin/arm64/darwin/ have mtimes newer than this task's start. Run `strings public/bin/arm64/darwin/steam-bridge-helper | grep NULLSRET` and `strings public/bin/arm64/darwin/steam_api64.dll | grep SteamController003`; both must hit.
3. Run `pnpm codecheck`, `pnpm lint`, `pnpm find-deadcode` and `pnpm planning-gates`. All must be green, apart from pre-existing lint warnings.
4. Run `graphify update .`.
5. Commit Tasks 1-3 code, then append ONE line to the END of the todo's `## Progress` section (before `## Done when`). Do NOT touch its frontmatter. The line reads: `- 2026-10-27 (quick 261027-ijs, <short sha of the Task 2 commit>): NULLSRET instrumentation landed. The helper logs NULLSRET <version> slot=<n> size=<bytes> on the first call of each per-version sret null slot. ELEX (411300) rerun pending: restart pnpm tauri dev, launch ELEX, grep the helper log for NULLSRET SteamController003.`
6. Commit the todo line separately.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && strings public/bin/arm64/darwin/steam-bridge-helper | grep -q NULLSRET && strings public/bin/arm64/darwin/steam_api64.dll | grep -q SteamController003 && pnpm codecheck && pnpm find-deadcode && pnpm planning-gates && git diff HEAD~1 -- .planning/todos/pending/2026-10-26-x64-null-object-sret-aware-per-family.md | grep -c '^[-+][a-z_]*:' | grep -qx 0</automated>
    The todo file is prettier-ignored (`--file-info` reports `"ignored": true`), so no prettier check is run on it. Every other path written in this task is a binary build output.
  </verify>
  <done>The helper and all three shim DLLs are rebuilt and contain the new code. codecheck, lint, find-deadcode and planning-gates are green. The todo has one new Progress line naming the commit, its frontmatter is unchanged, and it stays pending with `ready: live-gate`.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| game process (shim) to helper loopback socket | REPORT_NULL_SRET frames cross here; any local process could also connect |
| helper to log file | The version string is written to a log line |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ijs-01 | Tampering | bridge_helper.c REPORT_NULL_SRET handler | mitigate | Bounds (argLen >= 12, 0 < vlen <= 128, 12+vlen <= argLen, slot < 256, 0 < size <= 4096) are checked before memcpy into the fixed char[129] |
| T-ijs-02 | Tampering (log injection) | NULLSRET log line | mitigate | sanitize_ver replaces non-printable bytes with '?'; only the sanitised string and %u integers reach snprintf |
| T-ijs-03 | Denial of service | helper log | mitigate | NULLSRET_LOG_MAX = 64 per process on the helper; shim is one-shot per site (189 max) |
| T-ijs-04 | Spoofing | slot 7 from a non-shim local process | mitigate | Handler sits after the WR-03 auth gate; unauthenticated sockets get STATUS_ERR (tested) |
| T-ijs-05 | Denial of service | game thread in x64_null_sret_note | accept | Same transport exposure as gamelib_report_init and flat_report_unknown_version: one blocking round trip per site, at most once per site, result ignored; no lock held by note itself |
| T-ijs-06 | Elevation (deadlock) | g_bridge_lock reentry | mitigate | Null objects are only returned to the game; Task 2 greps that no shim path invokes them under g_bridge_lock or g_cb_registry_lock |
</threat_model>

<verification>
- Tasks 1 and 2: the jest suites pass (helperIntegration, gen_vtables, shimAbiGate not skipped, protocol).
- The regenerated shim has 189 per-site sret functions; only steam_api_shim.c changed among the generated outputs.
- `pnpm build-steam-bridge` rebuilt the helper and the DLLs; codecheck, lint, find-deadcode and planning-gates are green.
- The todo frontmatter is unchanged.
</verification>

<success_criteria>
A game calling any per-version x64 sret null slot for the first time produces exactly one helper `NULLSRET <version> slot=<n> size=<bytes>` line. The call's zero-fill and RDX-to-RAX return are unchanged and proven by the ABI gate. The rebuilt artifacts are ready for the ELEX rerun.
</success_criteria>

<output>
Create `.planning/quick/261027-ijs-log-first-call-of-each-x64-null-object-s/261027-ijs-SUMMARY.md` when done.
</output>
