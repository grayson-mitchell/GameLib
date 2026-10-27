---
phase: quick-261027-i4x
plan: 01
subsystem: steam-bridge
tags: [x64, null-object, sret, proton-inventory, shim]
requirements: [QUICK-I4X-01, QUICK-I4X-02, QUICK-I4X-03]
key-files:
  created: [meta/sdk/x64-null-sret-inventory.json]
  modified:
    - meta/extractProtonInventory.ts
    - meta/gen_vtables.ts
    - meta/__tests__/extractProtonInventory.test.ts
    - meta/__tests__/gen_vtables.test.ts
    - meta/__tests__/shimAbiGate.test.ts
    - native/steam-bridge/generated/steam_api_shim.c
    - .planning/todos/pending/2026-10-26-x64-null-object-sret-aware-per-family.md
completed: 2026-10-27
---

# Quick 261027-i4x: per-version sret-aware x64 null objects

Closes 51-REVIEW WR-03 in code: an unserved x64 runtime-lookup version that Proton ships with sret slots now gets a per-EXACT-version null object whose sret slots zero-fill the struct and return RDX in RAX. Unknown or NULL versions keep the generic all-zero object.

## Commits
- 056a07e17 feat: inventory extractor + meta/sdk/x64-null-sret-inventory.json (74 versions, 189 sret slots, 2267 total slots)
- 651debb69 feat: generator emits per-version null objects and `x64_null_object_for_version`; 5 fallback sites rewired; shim regenerated
- (third) docs: todo progress note (todo stays pending, `ready: live-gate`)

## Results
- jest gen_vtables + shimAbiGate + extractProtonInventory: 3 suites, 290 tests passed.
- build-steam-bridge: x86, x64 and steamclient64 compile gates PASSED.
- codecheck, find-deadcode, planning-gates (12/12) green; lint 0 errors (pre-existing warnings only).
- Only steam_api_shim.c changed among generated outputs.

## Deviations
- The `NullSretInventory` types live in gen_vtables.ts (import direction per plan), so commit 056a07e17 alone does not typecheck; it does together with 651debb69.
- Inventory count: 74 versions / 2267 total slots matches the plan (189 of those slots are sret).
- shimAbiGate: clang emits `movq %rdx, %rax`, so the assertion accepts `mov` or `movq`.

## Remaining
Live Wine gate on ELEX (411300); versions unknown to the pinned Proton inventory still get the generic object.
