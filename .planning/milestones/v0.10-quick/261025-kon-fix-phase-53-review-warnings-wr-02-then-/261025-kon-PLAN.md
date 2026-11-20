---
phase: quick-261025-kon
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/bridge/bottleDllOverrides.ts
  - src/backend/storeManagers/steam/bridge/__tests__/bottleDllOverrides.test.ts
  - meta/gen_vtables.ts
  - meta/__tests__/gen_vtables.test.ts
  - native/steam-bridge/generated/steam_api_shim.c # only if optional IN-01 is taken, and then comment-only
autonomous: true
requirements: [53-GAP2-WR-02, 53-GAP2-WR-01]

must_haves:
  truths:
    - "A DLL override whose runWineCommand result has no code, code null, or a nonzero code logs exactly one warning that includes the appId, the dll, the code and (truncated) stderr"
    - "A DLL override with code === 0 logs no warning"
    - "applyBridgeBottleDllOverrides still never rejects and still returns the settings object it was given"
    - "emitHiddenFallback throws at generation for a zero-param dropped RAX-form version returning class, float, double or void, naming the interface, version triple and method"
    - "emitHiddenFallback still dispatches a zero-param dropped version returning an integer/pointer scalar (int32/bool, int64, pointer, string)"
    - "pnpm gen-vtables produces no diff to native/steam-bridge/generated/* or shimExports.generated.ts for today's manifests"
  artifacts:
    - path: "src/backend/storeManagers/steam/bridge/bottleDllOverrides.ts"
      provides: "code === 0 success predicate"
      contains: "code !== 0"
    - path: "meta/gen_vtables.ts"
      provides: "return-kind fail-closed guard in emitHiddenFallback"
      contains: "only integer/pointer scalars"
  key_links:
    - from: "src/backend/storeManagers/steam/bridge/bottleDllOverrides.ts"
      to: "runWineCommand result shape (src/backend/launcher.ts ~1506 and ~1579)"
      via: "result?.code !== 0"
      pattern: "code !== 0"
    - from: "meta/gen_vtables.ts emitHiddenFallback"
      to: "flatRetType / method.returnKind"
      via: "guard before the dispatch emission"
      pattern: "returnKind"
---

<objective>
Fix two phase-53 code-review warnings from 53-GAP2-REVIEW.md, in order: WR-02 (the Overlooting nvapi64
override can fail silently because success is inferred from a falsy `code`) and WR-01 (the hidden-pointer
fallback in the shim generator dispatches any zero-param dropped version as an integer return, regardless of
its return kind).

Purpose: WR-02 makes a non-applied override visible in the log, so a rip=0 fault on 3410180 can be told apart
from an override that was applied but did not help. WR-01 closes a generator hole that would silently
reintroduce the CR-01 bug class (stub writes a struct through RDX) or return garbage for float/double.
Output: two source fixes, each with tests; generated artifacts unchanged.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-GAP2-REVIEW.md
@src/backend/storeManagers/steam/bridge/bottleDllOverrides.ts
@src/backend/storeManagers/steam/bridge/__tests__/bottleDllOverrides.test.ts

<interfaces>
runWineCommand result shapes (src/backend/launcher.ts), read during planning:
- Invalid wine (~line 1506): resolves `{ stdout: '', stderr: 'Invalid wine' }` -- NO `code` key.
- Child close (~line 1579): resolves `{ stderr, stdout, code }` where `code` is the Node `close` code:
  a number on normal exit, `null` when killed by a signal.
So the only success is `code === 0` (strict). `undefined`, `null` and any nonzero number are failures.

bottleDllOverrides.ts today (lines ~62-74): `if (result?.code) logWarning(...exited with code ...)` inside a
per-dll try/catch, inside an outer try/catch around the lazy `import('backend/launcher')`.
Test file mocks: `jest.mock('backend/launcher')` -> `mockRunWineCommand`, `jest.mock('backend/logger')` ->
only `logWarning` (via `mockLogWarning`) and presumably `LogPrefix`; default
`mockRunWineCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 })` in beforeEach; existing test
"never rejects: a non-zero exit code logs one warning" at ~line 96.

meta/gen_vtables.ts:
- `flatRetType(method)` ~line 1803: returnKind 'void'|'class'|'pointer'|'string'|'float'|'double'|'int64'|'int32'
  (bool is int32 with slotC 'int'). Note 'class' maps to cls 'gpr', so checking `cls === 'gpr'` alone is NOT
  sufficient -- class must be rejected explicitly.
- `emitHiddenFallback(hiddenSize, dropped, served)` ~line 2023. Loop over `dropped`: skips
  `isHiddenPointerFlatReturn(d.method)`; throws if `d.method.params.length > 0` (message contains
  `FLAT_UNREPRESENTABLE_CASES` -- an existing test regex `/Fx\.Get\.Fx002.*FLAT_UNREPRESENTABLE_CASES/`
  depends on it); then emits `if (ret == (void *)&g_<iface>_instance) { vfn *vt = ...; return (void
  *)(uintptr_t)((<slotC> (*)(void *))vt[<slot>])(ret); }`.
  53-17 guard order (must be preserved): NULL guard, dropped dispatches, served-instance `return NULL` guards,
  memset.
- `FlatCase` has `manifest` (InterfaceManifest, `.interface`), `method` (`.name`, `.returnKind`, `.params`,
  `.slot`), `triple` (`Family.FlatName.Interface`).
- excludedNote ~line 2123-2138 emits `/* not dispatched: <triple> (unrepresentable register class) */`; the
  thrown error ~2141-2147 ends "List the version(s) to leave undispatched in FLAT_UNREPRESENTABLE_CASES."

meta/__tests__/gen_vtables.test.ts fixtures (~line 2164): `flatMethod(slot, name, returns, returnKind, params
= [], extra = {})`, `flatFixture(iface, ordinal, methods, family = 'Fx')`; exports used: `emitFlatExports`,
`generateShimC`, `functionBody`. Existing describe block "53-17 CR-01: hidden-pointer flat fallback never
writes through a shim instance" at ~line 2679 -- add new cases there. Test at ~line 2290 asserts
`'not dispatched: Fx.Foo.Fx001'` for a NON-hidden export; it must keep passing.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: WR-02 -- require code === 0 for a DLL override to count as applied</name>
  <files>src/backend/storeManagers/steam/bridge/bottleDllOverrides.ts, src/backend/storeManagers/steam/bridge/__tests__/bottleDllOverrides.test.ts</files>
  <behavior>
    - result `{ stdout: '', stderr: 'Invalid wine' }` (no code) -> resolves to SETTINGS, exactly one warning containing '3410180', 'nvapi64', 'code=undefined' and 'Invalid wine'
    - result `{ stdout: '', stderr: 'killed', code: null }` -> one warning containing 'code=null' and 'killed'
    - result `{ code: 1, stderr: 'ERROR: access denied' }` -> one warning containing 'code=1' and the stderr text (extend the existing nonzero test)
    - result `{ code: 0 }` -> no warning (assert mockLogWarning not called)
    - resolved `undefined` result (defensive) -> one warning, no throw
    - a stderr longer than 200 chars is truncated to 200 in the warning
  </behavior>
  <action>
    Write the tests first in the existing describe block (they must fail on the current `if (result?.code)` for
    the missing-code and null-code cases), then change the predicate in applyBridgeBottleDllOverrides to treat
    anything other than a strict `result?.code === 0` as failure, per the WR-02 fix in 53-GAP2-REVIEW.md. The
    warning text: `Steam ${appId}: DLL override ${dll} did not confirm success (code=${String(result?.code)},
    stderr=${(result?.stderr ?? '').slice(0, 200)})` with LogPrefix.Steam. Keep both try/catch layers and the
    `return bridgeBottleSettings` exactly as they are -- the never-reject contract is unchanged. Update the
    file's header doc comment sentence about failures if it implies only exit codes are checked. Do not add a
    success logInfo (not requested; would also need the logger mock widened). Do not touch IN-04 (exe basename)
    -- out of scope.
  </action>
  <verify>
    <automated>npx jest src/backend/storeManagers/steam/bridge/__tests__/bottleDllOverrides.test.ts && npx eslint src/backend/storeManagers/steam/bridge/bottleDllOverrides.ts src/backend/storeManagers/steam/bridge/__tests__/bottleDllOverrides.test.ts && npx prettier --check src/backend/storeManagers/steam/bridge/bottleDllOverrides.ts src/backend/storeManagers/steam/bridge/__tests__/bottleDllOverrides.test.ts</automated>
  </verify>
  <done>Missing/null/nonzero code each log one warning with code and stderr; code 0 logs none; function still never rejects; suite, eslint and scoped prettier pass (both paths confirmed not prettier-ignored via --file-info at planning time).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: WR-01 -- emitHiddenFallback fails closed for non-integer/pointer dropped returns</name>
  <files>meta/gen_vtables.ts, meta/__tests__/gen_vtables.test.ts</files>
  <behavior>
    Fixture shape for every case: Fx001 with a zero-param `Get` returning a 16-byte class (hidden pointer),
    Fx002 with a zero-param `Get` of the kind under test; call `emitFlatExports(m, ['Fx.Get.Fx002'])`.
    - Fx002 returns class with structSize 8 -> throws; message matches /Fx002/ and /Get/ and /class/
    - Fx002 returns float -> throws naming Fx002, Get, float
    - Fx002 returns double -> throws naming Fx002, Get, double
    - Fx002 returns void -> throws naming Fx002, Get, void
    - Fx002 returns uint32 (int32) -> does not throw; body contains `if (ret == (void *)&g_fx002_instance)` and `(void *)(uintptr_t)((uint32_t (*)(void *))vt[0])(ret)` before `memset(ret, 0, 16)`
    - Fx002 returns pointer -> does not throw; dispatch line uses `void *` slot cast
    - existing "takes parameters fails closed" test still matches /Fx\.Get\.Fx002.*FLAT_UNREPRESENTABLE_CASES/
  </behavior>
  <action>
    Add the tests to the "53-17 CR-01: hidden-pointer flat fallback never writes through a shim instance"
    describe block, confirm the throw cases fail on current code (if any fixture never reaches
    emitHiddenFallback because reconcileFlatPrototype reports no problem for it, adjust that fixture so it does,
    and say so in the summary). Then in emitHiddenFallback, after the existing params-length throw (keep it
    first and its message unchanged), add a guard that throws unless `d.method.returnKind` is one of int32,
    int64, pointer, string -- reject class explicitly, because flatRetType maps class to cls 'gpr'. Message:
    `flat export ${d.triple}: dropped RAX-form version ${d.manifest.interface}.${d.method.name} returns
    ${d.method.returnKind}; only integer/pointer scalars are dispatched from the hidden-pointer fallback (fail
    closed, 53-17 WR-01)`. Update the function's doc comment to say (b) dispatches only integer/pointer
    scalars and anything else throws.

    Then regenerate and prove determinism: run `pnpm gen-vtables` twice; the generated outputs must be
    byte-identical to HEAD (today's only dropped case is 012 GetPublicIP, uint32).

    Optional IN-01, only after the determinism gate above passes: in emitFlatExports, when proto.hiddenSize is
    not null, the excludedNote for a dropped case that emitHiddenFallback dispatches (zero params, not hidden
    pointer, integer/pointer return) reads `/* dispatched via ret-is-instance fallback: <triple> (RAX form) */`
    instead of "not dispatched"; reword the thrown error tail to "List the version(s) that need a separate
    calling convention in FLAT_UNREPRESENTABLE_CASES." Non-hidden exports keep "not dispatched" (test at ~line
    2290). Take IN-01 only if the resulting `git diff -U0 native/steam-bridge/generated/` changes exactly the
    one comment line (steam_api_shim.c ~23527) and nothing else, and shimExports.generated.ts and the .def/.h
    files are unchanged; otherwise revert IN-01 entirely and note it as skipped. Do not touch IN-02/IN-03/IN-04.
  </action>
  <verify>
    <automated>npx jest meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts && pnpm gen-vtables && pnpm gen-vtables && git diff --exit-code src/backend/storeManagers/steam/bridge/shimExports.generated.ts native/steam-bridge/generated/steam_api.def native/steam-bridge/generated/steam_api64.def native/steam-bridge/generated/bridge_dispatch.h && test "$(git diff -U0 native/steam-bridge/generated/steam_api_shim.c | grep -E '^[+-][^+-]' | grep -vcE '^[+-]/\* (not dispatched|dispatched via ret-is-instance fallback): SteamGameServer\.GetPublicIP\.SteamGameServer012')" = "0" && npx eslint meta/gen_vtables.ts meta/__tests__/gen_vtables.test.ts && npx prettier --check meta/gen_vtables.ts meta/__tests__/gen_vtables.test.ts</automated>
  </verify>
  <done>Class/float/double/void zero-param dropped versions throw at generation naming interface, triple and method; int32/pointer still dispatch; generated .def/.h/shimExports.generated.ts unchanged; steam_api_shim.c unchanged (WR-01 alone) or differs only in the one 012 comment line (if IN-01 taken); jest, eslint and scoped prettier pass (both TS paths confirmed not prettier-ignored; generated C is not a prettier target).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GameLib backend -> wine reg.exe | Fixed command parts from a frozen in-code table; no user input |
| Generator -> game process | Generated shim C runs inside the game; a wrong calling convention is an arbitrary memory write |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-kon-01 | Repudiation | bottleDllOverrides.ts | mitigate | Strict `code === 0`; every other outcome logs a warning with code and 200-char stderr |
| T-kon-02 | Information disclosure | bottleDllOverrides.ts warning | accept | stderr from reg.exe in a local log; truncated to 200 chars, no secrets in that path |
| T-kon-03 | Tampering (memory) | gen_vtables.ts emitHiddenFallback | mitigate | Generation-time throw for class/float/double/void dropped returns, so no sret-less or wrong-register dispatch can be emitted |
</threat_model>

<verification>
- Both task verify commands pass.
- `git status` shows only the four TS files (plus, if IN-01 was taken, one comment line in steam_api_shim.c).
</verification>

<success_criteria>
- WR-02: override failure without a truthy code is no longer silent; tests cover missing, null, nonzero, zero.
- WR-01: generator refuses non-integer/pointer zero-param dropped returns with a named error; int/pointer dispatch unchanged; regeneration idempotent with no generated diff (or one comment line under IN-01).
</success_criteria>

<output>
Create `.planning/quick/261025-kon-fix-phase-53-review-warnings-wr-02-then-/261025-kon-SUMMARY.md` when done
</output>
