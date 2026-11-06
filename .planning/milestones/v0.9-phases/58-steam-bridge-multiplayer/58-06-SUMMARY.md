---
phase: 58-steam-bridge-multiplayer
plan: 06
subsystem: steam-bridge
tags: [generator, wire, vtables, in-buffer, structs, shimLocal, helperCustom]
requires: [58-02, 58-03]
provides:
  - "ParamKind in-buffer | in-struct | out-struct; ParamSignature.structSize/capBytes; MethodSignature.shimLocal/helperCustom"
  - "WIRE_LARGE_MAX_BYTES (61440), WIRE_IN_BUFFER_MAX_BYTES, SHIM_LOCAL_BODIES, computeDispatchRespScratchBytes"
  - "overlay passthrough of structSize, capBytes, shimLocal, helperCustom from wire-policy"
affects: [58-12, 58-15, 58-16, 58-21]
key-files:
  created:
    - meta/__tests__/wireExtendedCompile.test.ts
  modified:
    - meta/gen_vtables.ts
    - meta/__tests__/gen_vtables.test.ts
    - meta/extractProtonInventory.ts
    - meta/__tests__/extractProtonInventory.test.ts
key-decisions:
  - "Extended WIRE_LAYOUT_DOC paragraphs are embedded in the generated files only when a manifest uses a new kind or mode, so the committed shim and dispatch header stay byte-identical"
  - "Large frames (request or response over 4160 bytes) use static buffers with g_bridge_lock held across pack, bridge_transact_locked and decode; smaller ones keep stack arrays"
  - "in-buffer helper decode also requires the sibling lenParam value to equal the bytes sent"
requirements-completed: [M-03]
completed: 2026-10-31
---

# Phase 58 Plan 06: Generator kinds for matchmaking and networking Summary

The vtable/dispatch generator now carries variable-length and fixed-struct parameters (`in-buffer`, `in-struct`, `out-struct`, `out-buffer` `capBytes`) and two method modes (`shimLocal`, `helperCustom`), all fail-closed and bounded. No manifest uses them yet; `pnpm gen-vtables` leaves `native/steam-bridge/generated/` byte-identical.

## Commits
- 4a94bc06b feat(58-06): wire-policy overlay passes structSize, capBytes, shimLocal, helperCustom
- 6235ba75d feat(58-06): generator kinds, validation, emission, golden tests and compile gate

## What was built
- Validation: `in-buffer` needs a sibling by-value integer `lenParam`; `in-struct`/`out-struct` need a struct in `CALLBACK_LAYOUTS` whose `structSize` equals the measured x64 size and whose x64 and mac layouts (and x86 when the manifest targets x86) match size and every field offset, otherwise the error contains `needs repack`; `capBytes` only on `out-buffer`, 1..61440; `helperCustom` matches `^gl_[a-z0-9_]{1,48}$` and still needs `helperFlat`; `shimLocal` needs a `SHIM_LOCAL_BODIES` entry.
- Shim: `in-buffer` sends `[u32 len][bytes]`, or `[u32 61441]` with no bytes when over cap, negative, or NULL with a positive length. `in-struct` sends `[u8 present][bytes]`. `out-struct` decodes `[u8 present][bytes]` into a non-NULL game pointer only when present is 1. `shimLocal` emits the named body and no helper case.
- Helper: `in-buffer` refuses len over cap or past `argLen` before any copy and requires `lenParam == len`; `in-struct` passes NULL when present is 0; `out-struct` fills a zeroed helper buffer and appends `[u8 1][bytes]`; `helperCustom` calls `gl_x(self, arg, argLen, resp, respCap, &len)` with a prototype emitted only when used. `BRIDGE_DISPATCH_RESP_SCRATCH_BYTES` is `max(4096, largest capBytes or out-struct response)`.
- Tests: 22 golden/validation tests in `gen_vtables.test.ts`, one overlay test, and `wireExtendedCompile.test.ts` which compiles a synthetic manifest using every kind through zig (`x86_64-windows-gnu`, full shim) and host clang (`-fsyntax-only -Wall -Wextra`) via `createFakeHomeProfile()`.

## Verification
- `pnpm exec jest` gen_vtables, extractProtonInventory, shimAbiGate, wireExtendedCompile: 340 passed
- `pnpm gen-vtables && pnpm build-steam-bridge`: exit 0, `git diff --quiet -- native/steam-bridge/generated/` clean
- `pnpm codecheck` exit 0; prettier check clean on all touched files

## Deviations from Plan

**1. [Interpretation] WIRE_LAYOUT_DOC embedding.** The plan asks for new WIRE_LAYOUT_DOC sections and byte-identical generated output. Both hold: the exported `WIRE_LAYOUT_DOC` contains the new sections, while the generated files embed the base text unless a manifest uses a new kind or mode (`wireLayoutDocFor`). New `#define`s are likewise avoided; limits are emitted as literals.

**2. Single commit for Tasks 1 and 2 in gen_vtables.ts.** Both tasks edit the same file in interleaved hunks, so they landed in one commit (6235ba75d); the overlay changes have their own commit.

**3. Added `meta/__tests__/wireExtendedCompile.test.ts`** (not in the plan's file list) for the real compile gate, since shimAbiGate cannot take an injected manifest set.

## Deferred Issues
`meta/__tests__/steamclientLayerNotice.test.ts` (NOTICE sha256 pin) fails in the full `meta` run. It does not touch gen_vtables or the extractor and is out of scope; plus the known genI18nGateScope A-17 and `live tree` failures from the uncommitted gamepage.json edit.

## Known Stubs
None. `SHIM_LOCAL_BODIES` is intentionally empty; wiring plans add entries.

## Notes for downstream plans
- `bridge_helper.c` was not touched: a `helperCustom` function must be defined there before any manifest uses one. Its request buffer (`g_argbuf`) and `MAX_FRAME_BYTES` are already 65536, so a 61440-byte `in-buffer` fits; `g_dispatch_respbuf` is sized from the generated `BRIDGE_DISPATCH_RESP_SCRATCH_BYTES`.
- `out-messages` is left to 58-15 as planned.

## Self-Check: PASSED
- Commits 4a94bc06b and 6235ba75d present; `wireExtendedCompile.test.ts` exists.
