---
phase: 58-steam-bridge-multiplayer
plan: 30
subsystem: steam-bridge-helper
tags: [gap-closure, native, c, server-browser]
requires: [58-29]
provides:
  - non-recycling server-browser query pool (64, matches the shim map)
  - free-slot issued-handle set
  - helperCustom gl_mms_cancel_server_query and gl_mms_release_request
affects: [native/steam-bridge/helper/bridge_helper.c]
key-files:
  modified:
    - native/steam-bridge/helper/bridge_helper.c
    - meta/sdk/wire-policy.json
    - meta/sdk/isteammatchmakingservers003.manifest.json
    - native/steam-bridge/generated/bridge_dispatch.h
    - native/steam-bridge/generated/steam_api_shim.c
    - meta/__tests__/gen_vtables.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/fixtures/net_harness_driver.c
    - src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts
decisions:
  - GL_MMS_POOL = 64 = GL_MMS_MAP_CAP in meta/gen_vtables.ts
  - Cancel/Release forward to Mac first, then drop the helper binding
metrics:
  tasks: 2
  completed: 2026-11-01
---

# Phase 58 Plan 30: Server-browser state defects Summary

WR-03 and WR-04 are closed: a live server query is never recycled (a full pool answers -1), and the issued list-handle set uses free slots with removal on ReleaseRequest.

## What changed

- **WR-03:** `GL_MMS_POOL` is 64. `gl_mms_obj_acquire` returns -1 when full; the query answers `q = -1` without calling Mac. `age` and `g_mms_clock` are gone. New `gl_mms_cancel_server_query` calls Mac CancelServerQuery, then frees any binding with that handle.
- **WR-04:** `gl_mms_issue` keeps the equal-handle and low-32 collision checks, stores in the first zero slot, and returns 0 when none is free (caller releases the Mac request and answers 0). `g_mms_issued_next` is removed. New `gl_mms_release_request` calls Mac ReleaseRequest, then zeroes the entry.
- wire-policy `CancelServerQuery` / `ReleaseRequest` now carry `helperCustom`, keeping `stackBytes`, `zeroHandleParam`, `unmapHandle`. The 003 manifest was hand-edited to match; `pnpm gen-vtables` regenerated the header and shim.
- Six harness cases: mms-pool-full, mms-cancel-releases, mms-cancel-unknown, mms-issued-full, mms-release-frees, mms-collision.

## Verification

- `helperNetHarness` (26 tests), `gen_vtables`, and the whole `src/backend/storeManagers/steam/bridge` tree: 36 suites pass.
- `pnpm gen-vtables` and `pnpm build-steam-bridge` exit 0; both Windows compile gates PASSED.
- Prettier clean on the touched `.ts`/`.json` files. `meta/__tests__` shows only the known unrelated failures.

## Commits

- `fix(58-30)`: both tasks in one commit. The two fixes edit the same helper block, wire-policy, generated files and harness driver, so they were not separable.

## Deviations from Plan

**1. [Rule 3] Manifest hand-edited** (`pnpm extract-proton-inventory` is broken): added `helperCustom` to the two entries in `isteammatchmakingservers003.manifest.json`.
**2. [Rule 1] Test pins:** `gen_vtables.test.ts` custom-prototype list gained both new functions, and the "base text only" fixture now also excludes SteamMatchMakingServers003.
**3.** Tasks committed together (see above).

## Known Stubs

None.

## Threat Flags

None. T-58-100 to T-58-102 are mitigated and covered by the harness cases.

## Self-Check: PASSED
