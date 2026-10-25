---
phase: 55-steam-bridge-callback-delivery-for-the-web-api-auth-ticket
plan: 02
subsystem: steam-bridge
tags: [msvc-abi, vtable, ccallbackbase, zig, measurement]
requires: []
provides:
  - MSVC_CCALLBACKBASE_* constants (meta/msvcCallbackLayout.ts) for 55-04 gen_vtables
affects: [55-04]
tech-stack:
  added: []
  patterns: [two-arm test (committed dump in CI, live re-measure on darwin)]
key-files:
  created:
    - meta/__tests__/fixtures/msvc_ccallbackbase.cpp
    - meta/__tests__/fixtures/msvc_ccallbackbase.layout.txt
    - meta/msvcCallbackLayout.ts
    - meta/__tests__/msvcCallbackBaseLayout.test.ts
  modified: []
key-decisions:
  - "Constants live in a new module, not gen_vtables.ts, so 55-02 shares no file with 55-01"
metrics:
  tasks: 2
  files: 4
completed: 2026-10-26
---

# Phase 55 Plan 02: MSVC CCallbackBase Layout Summary

Compiler-measured (pinned zig 0.16.0, MS-ABI emulation) vtable slots and field offsets of the Steamworks CCallbackBase, pinned as named constants with a two-arm test.

## Measurements (both x86_64 and i686 triples)

- Slot 0 = `Run(void*, bool, SteamAPICall_t)`, slot 1 = `Run(void*)`, slot 2 = `GetCallbackSizeBytes()`. Research confirmed; no override.
- FieldOffsets (bits) x64 [64, 96] -> flags +8, m_iCallback +12; x86 [32, 64] -> +4 / +8.

## Verification

- `npx jest meta/__tests__/msvcCallbackBaseLayout.test.ts`: 5/5 pass on this Mac, Arm B executed (not skipped) for both triples.
- `fakeHomeIsolation.test.ts`: 7/7 pass.
- Acceptance regex (adapted): `^ *1 \| void CCallbackBase::Run\(void \*\)$` matches in both triples' VFTable blocks (dumper prints a header, 3-space indent, no `[pure]` in the VFTable-indices block).
- Prettier: the .cpp and .txt fixtures have no prettier parser (no check applies); the .ts files pass `prettier --check`.

## Deviations from Plan

None in behavior. Notes:
- The raw dump also contains the `-fdump-record-layouts-simple` AST output (with pointer addresses), committed verbatim as the plan specifies; the parser reads only the VFTable block and the CCallbackBase record.
- Arm B supplies the other triple's section from the committed dump so the single parser (which requires both triples) can be reused.
- The pre-commit prettier hook rejected the first RED commit; reformatted and recommitted.

## Commits

- c663900f7: fixture and measured dump
- 4eb416fde: failing test (RED)
- dbaf3ae86: constants module and parser (GREEN)

## Known Stubs

None.

## Self-Check: PASSED
