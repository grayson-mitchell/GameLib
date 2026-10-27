---
phase: quick-261027-m1r
plan: 01
subsystem: steam-bridge
tags: [wine, x86, thiscall, callbacks, harness]
requirements: [P55-9]
key-files:
  created:
    - meta/__tests__/fixtures/x86_callback_pe_harness.c
    - meta/__tests__/x86CallbackWineHarness.test.ts
  modified:
    - package.json
    - .planning/todos/completed/2026-10-26-steam-bridge-x86-callback-dispatch-unconfirmed-live.md
metrics:
  completed: 2026-10-27
---

# Quick 261027-m1r: Wine PE harness for x86 bridge callback dispatch

The real x86 `steam_api.dll` shim, run under CrossOver 26.3's Wine, dispatches `Run(void*)` at vtable slot 1 via
`__thiscall` with the correct `this`, payload, callback id and balanced stack. The todo is closed as harness-confirmed.

## Commits

- 6328396dc: PE harness fixture
- c9a679272: jest Wine harness and `test:x86-callback-wine` script
- 178e519fd: todo moved to completed with Resolution

## Measured values (normal variant, 8093 ms; mutant 7951 ms)

- module 7BA90000, loaded from the run dir, marker `GameLibSteamBridgeShim/2` found
- objects A=0043AB40 B=0043AB58 C=0043AB70 D=0043AB88; dispatch order A, C, B; D (152) never called; no trap hits
- all three records: param 0144F084 (payload memcmp ok), icallback 168
- thunk ESP at entry: 0x0144e850 for both; return address 0x7ba9300d inside the shim image
- outer ESP across RunCallbacks: 0x0144fac0 before and after, no mismatch
- helper frames: HELLO(secret), DRAIN (168 served once), one CBDISP id=168 n=3 held=0
- mutant (bare `ret`): `FAIL crash code=0xc0000005`, exit code 3, so the ESP check was not passed

## Verification

- `pnpm test:x86-callback-wine`: 12 passed, 12 total, 0 skipped
- callbackRegistryHost.test.ts: 22 passed; fakeHomeIsolation.test.ts: 7 passed
- `git diff` on native/steam-bridge and meta/gen_vtables.ts: empty
- prettier clean on the .ts and package.json; `pnpm planning-gates` 12/12; `graphify update .` run
- The fixture .c file is not covered by prettier (no C parser), so no format check applies.

## Deviations

None. No shim defect found. No binaries committed.

## Caveat

No real 32-bit title registering callback 168 has been exercised live; the closure is harness-confirmed only.

## Self-Check: PASSED
