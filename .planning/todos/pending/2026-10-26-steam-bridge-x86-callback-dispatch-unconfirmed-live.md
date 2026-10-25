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
