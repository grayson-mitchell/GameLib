---
phase: quick-261113-qu7
plan: 01
status: complete
subsystem: steam-bridge
tags: [shim, remotestorage, dredmor, 98800]
requirements: [TODO-261113-BRIDGE-SHIM-REMOTESTORAGE-V008-UNSERVABLE]
key-files:
  created:
    - meta/sdk/isteamremotestorage008.manifest.json
  modified:
    - src/backend/storeManagers/steam/bridge/__tests__/fixtures/objdumpImports.ts
    - meta/sdk/acceptance-interface-versions.json
    - meta/sdk/ordinals.json
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts
    - native/steam-bridge/generated/steam_api_shim.c
    - native/steam-bridge/generated/steam_api.def
  deleted:
    - .planning/todos/pending/2026-11-13-bridge-shim-remotestorage-v008-unservable.md
---

# Quick 261113-qu7: RemoteStorage v008 served as a stub for Dungeons of Dredmor

The x86 shim now exports `SteamAPI_SteamRemoteStorage_v008` and serves `STEAMREMOTESTORAGE_INTERFACE_VERSION008` as a cloud-disabled stub, from a manifest extracted from Proton's pinned lsteamclient tree (`2c620c0f...`, ordinal 74, 51 methods, 0 wired, no helperInterface).

## Commits

- `2cb955e94` feat: Dredmor fixtures, acceptance row, v008 manifest
- `58af1adf3` test (RED): Dredmor acceptance block
- `b6fe30870` feat (GREEN): shimCoverage served entry and export, regenerated shim, todo deleted

## Measurements (re-taken this session, matched the plan)

- Original `steam_api.dll`: 105808 bytes, sha256 `61846524...aee63` (not the shim).
- 15 interface-version strings and the 10-import `steam_api.dll` table matched the plan exactly. No extra imports.

## Verification

- RED: the Dredmor block failed 3 of 4 tests (v008 not served, unservable list non-empty, coverage) before wiring.
- GREEN: shimCoverage.test.ts and gen_vtables.test.ts pass (468 tests). Task 1's gen_vtables run had one expected failure (the committed `.def` had not yet been regenerated); it cleared after `pnpm gen-vtables`.
- `pnpm gen-vtables` is idempotent against the staged output; `steam_api.def` lists the v008 export once. `steam_api64.def` and `bridge_dispatch.h` unchanged (stub mode).
- `pnpm build-steam-bridge`: Compile gate PASSED (x86) and PASSED (x64).
- `pnpm planning-gates`: 12/12 passed.
- Prettier `--check` clean on all changed .ts/.json files (all reported a parser, none ignored; generated .c/.def not listed).
- No new `/Users/` path added to fixtures.

## Deviations

None.

## Outstanding human follow-up (NOT verified)

Live launch verification of Dungeons of Dredmor (98800) has NOT been done, and the bridge for 98800 is not claimed verified. The strict bar needs a shim HELLO plus a clean game Steam-init log. To check: run `pnpm build:sidecar` / `pnpm build-steam-bridge`, restart `pnpm tauri:dev` (it does not rebuild the sidecar), launch Dredmor, and confirm the launch log no longer says "shim withheld: coverage gaps STEAMREMOTESTORAGE_INTERFACE_VERSION008". Reaching the game menu does not count.
