---
created: 2026-10-26
title: "Steam bridge x86 callback dispatch (Run(void*) slot 1, thiscall) has no live confirmation"
source: 55-05 (P55-9 deferred)
area: steam-bridge
files:
  - meta/gen_vtables.ts
  - meta/msvcCallbackLayout.ts
severity: minor
platform: macos
ready: live-gate
resolved: 2026-10-27
resolved_by: quick-261027-m1r
---

## What is covered

- Compiler measurement of the callback layout on i686.
- The host harness (55-04) exercising the registry and dispatch core.
- The x86 PE compile gate: `pnpm build-steam-bridge` builds the x86 steam_api.dll.

## What is not covered

The x86 `__thiscall` dispatch of `Run(void*)` (vtable slot 1) through a game's callback object is never executed.
The 55-04 host harness uses an empty `THISCALL` macro, and no 32-bit title that registers callback 168 has been run
through the bridge. The x64 path is gated by the Abiotic Factor live gate (55-LIVE-GATE.md).

## Wine PE harness (P55-9)

Not built in this phase but feasible: it can seed the shim through a fake loopback helper that answers CONTROL
slot 6 with a canned 168 frame, with no change to the real helper.

## Trigger to pick this up

The first 32-bit bridged title that registers callback 168, or any change to the x86 dispatch path.

## Resolution

Closed 2026-10-27 as **harness-confirmed** by operator decision (quick 261027-m1r).

**What ran.** The real x86 `steam_api.dll` was built with `buildShimCompileArgv`'s exact argv, the same as
`pnpm build-steam-bridge`. A zig-built PE32 exe registered three MSVC-layout callback objects for 168 (two
hand-written `ret 4` thiscall thunks and one compiler-emitted thiscall callee) plus a decoy for 152. It ran under
CrossOver 26.3's `wineloader` with a throwaway WINEPREFIX in a fake-HOME profile. A fake loopback helper in the jest
process answered HELLO, slot 6 (one canned 168 frame) and slot 10. `bridge_helper.c` is unchanged.

**What was asserted, with measured values.** ECX equalled the registered object for each thunk record (A=0043AB40,
B=0043AB58; the C++ callee got C=0043AB70 as `this`). The 2572-byte payload matched in all three calls. iCallback read
168 at offset 8, with the registered flag set at offset 4. The return address (0x7ba9300d) lay inside the shim image
(base 7BA90000). ESP at both thunk entries was 0x0144e850, and ESP was unchanged across every RunCallbacks call
(0x0144fac0 before and after). The helper saw CBDISP id=168 n=3 held=0, and the decoy 152 object was never called.

**Negative control.** The mutant thunk with a bare `ret` (no callee pop) crashed with access violation 0xc0000005
(exit code 3, `FAIL crash code=0xc0000005`) before reaching the ESP check, so the check cannot be passed by a
callee that fails to pop its argument.

**Not covered.** No real 32-bit title that registers callback 168 has been exercised live through the bridge yet.
The harness proves the shim's dispatch ABI under Wine, not a game's real CCallback object or a real helper ring. The
original trigger still applies: when the first 32-bit bridged title registers 168, check the helper's CBDISP log line
for that title as the first live confirmation.

**Re-run.** `pnpm test:x86-callback-wine`. The test is `meta/__tests__/x86CallbackWineHarness.test.ts`; it self-skips
without CrossOver or zig unless `GAMELIB_REQUIRE_WINE_HARNESS=1`.
