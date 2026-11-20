---
phase: 83-native-seam-gamelib-core-and-process-shutdown-contract
plan: 05
subsystem: infra
tags: [ipc-contract, schema-snapshot, native-seam, census, port-complete, version-parity]
status: complete

requires:
  - phase: 83-native-seam-gamelib-core-and-process-shutdown-contract
    provides: nativeChannels.json manifest, nativeChannelNames(), NativeRouter (plan 83-03)
provides:
  - src/common/types/ipc/ipcSchemaSnapshot.json, the committed per-channel kind/owner/args snapshot, drift-checked by check:ipc-contract
  - renderIpcSchemaSnapshot, SNAPSHOT_CHANNELS_FLOOR and the two-owner refusal in meta/genIpcContract.ts
  - src/backend/testUtils/ipcRegistrationScan.ts, the single registration matcher
  - nativeChannelOwnership.test.ts (TS half of the one-owner test, exact ZERO_LITERAL_OWNER and MULTI_REGISTRATION ledgers)
  - nativeSeamPortComplete.test.ts, the manifest-derived *PortComplete template
  - appVersionParity.test.ts
affects: [83-06 (openExternalUrl moves under these gates), every later native slice]

actuals:
  tokens: 60000
  tasks: 3
  commits: 3
plan_head_before: 75ca7d1aba296483a6621da566544e7b56f519a5
plan_head_after: 4a187897841e109ceea7fc2797df924026db3754

tech-stack:
  added: []
  patterns:
    - "A generated, committed snapshot beside the generated Rust file; --check reports each stale file by name"
    - "Exact reason-per-entry ledgers (not ceilings) for the zero-owner and multi-registration censuses, with file sets pinned"
    - "PortComplete gate derived from a manifest, so a later slice is covered without editing it"

key-files:
  created:
    - src/common/types/ipc/ipcSchemaSnapshot.json
    - src/backend/testUtils/ipcRegistrationScan.ts
    - src/backend/sidecar/__tests__/nativeChannelOwnership.test.ts
    - src/backend/__tests__/nativeSeamPortComplete.test.ts
    - meta/__tests__/appVersionParity.test.ts
  modified:
    - meta/genIpcContract.ts
    - meta/__tests__/genIpcContract.test.ts
    - .prettierignore
    - src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts

key-decisions:
  - "Snapshot floor 231 = 237 measured renderer channels (236 sidecar + 1 native) minus 6, on 2026-11-20"
  - "Native snapshot entries carry `returns` as a fifth, last key; sidecar entries have four keys, and `$schema` is stripped from every args schema to keep the file small and stable"
  - "The renderer-channel floor in nativeChannelOwnership.test.ts is a local constant pinned equal to SNAPSHOT_CHANNELS_FLOOR by a test that reads meta/genIpcContract.ts, not an import (src does not import meta)"
  - "MULTI_REGISTRATION records the exact file set per channel, so a real extra registration fails even though all six measured entries are comment quotes"

requirements-completed: [FND-03]

coverage:
  - id: D1
    description: "pnpm gen:ipc-contract writes ipcSchemaSnapshot.json (channel, kind, owner, args per renderer channel, sorted, byte-stable); check:ipc-contract fails naming whichever of the two generated files is stale"
    requirement: FND-03
    verification:
      - kind: unit
        ref: "meta/__tests__/genIpcContract.test.ts#IPC schema snapshot (83-05, D-06) (8 tests); pnpm check:ipc-contract; recorded drift run (max(1_000_000)->2_000_000 in clipboard.ts exits 1 naming the snapshot, reverted)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The snapshot generator cannot pass on an empty or truncated scan, and refuses a native channel that also has a sidecar schema or colliding push"
    requirement: FND-03
    verification:
      - kind: unit
        ref: "genIpcContract.test.ts (empty entries, entries cut to 10, two-owner collisions in renderIpcContract and renderIpcSchemaSnapshot)"
        status: pass
    human_judgment: false
  - id: D3
    description: "TS one-owner test: no manifest channel is registered in non-test src/backend or has a zod entry; the zero-owner and multi-registration sets equal exact ledgers; floors with empty and truncated input tests"
    requirement: FND-03
    verification:
      - kind: unit
        ref: "src/backend/sidecar/__tests__/nativeChannelOwnership.test.ts (12 tests); recorded run: a temporary deps.ipc.handle('getHeroicVersion') failed (1) naming getHeroicVersion, reverted"
        status: pass
    human_judgment: false
  - id: D4
    description: "nativeSeamPortComplete derives forbidden registrations, zod keys and GAMELIB_<SLICE> flags from the manifest; survivors kept; floor, empty-input and scan-can-fail self-tests"
    requirement: FND-03
    verification:
      - kind: unit
        ref: "src/backend/__tests__/nativeSeamPortComplete.test.ts (14 tests, including getHeroicVersion and slice app-shell cases); recorded run: a temporary GAMELIB_APP_SHELL text failed the slice case, reverted"
        status: pass
    human_judgment: false
  - id: D5
    description: "package.json, Cargo.toml [package] and tauri.conf.json carry the same version (0.8.0)"
    requirement: FND-03
    verification:
      - kind: unit
        ref: "meta/__tests__/appVersionParity.test.ts (4 tests)"
        status: pass
    human_judgment: false
---

# Phase 83 Plan 05: Seam gates Summary

**A committed, drift-checked IPC schema snapshot (237 renderer channels: kind, owner, args) with floor and two-owner guards, the TS half of the one-owner test with exact ledgers, a manifest-derived native `*PortComplete` gate, and an app-version parity gate.**

## Performance

- **Duration:** about 40 min (start time was not captured at launch; estimate)
- **Completed:** 2026-11-20
- **Tasks:** 3 (task 1 tracer)
- **Files:** 5 created, 4 modified

## Accomplishments

- `renderIpcSchemaSnapshot` plus `SNAPSHOT_CHANNELS_FLOOR = 231` (measured 237: 236 sidecar, 1 native). `pnpm gen:ipc-contract` now writes both generated files; `--check` compares both and prints `::error::<path> is stale; run pnpm gen:ipc-contract` for each that differs. `ipc_contract.rs` is byte-unchanged by this work. The snapshot is prettier-ignored (probe-verified) and the pre-commit `src/common/types/ipc/*` path filter already covers it.
- Two-owner refusal is one helper (`assertSingleOwner`) used by both renderers: `native channel <name> also has a sidecar schema (two owners)` for a channelSchemas key or a colliding push key.
- `ipcRegistrationScan.ts` is the one registration matcher (`scanRegistrations(dir)` returns invoke, send, channel-to-files and a scanned-file count); `ipcSchemaCoverage` imports it.
- `nativeChannelOwnership.test.ts`, measured 2026-11-20: renderer channels 237 (floor 231, pinned equal to the generator's by a test), backend files walked 617 (floor 567); zero-owner ledger is exactly `getSignInProbeOutcomes` (registered through `handleTyped(deps.ipc, ...)`, which the literal matcher does not see); multi-registration ledger is exactly six channels (`changeLanguage`, `getCrossoverIndex`, `logoutSteam`, `openDialog`, `quit`, `setGameMetadataOverride`).
- `nativeSeamPortComplete.test.ts`: walk floor 1281 (measured 1381 over src, meta, src-tauri/src), forbidden-registration matcher also covers `handleTyped(..., 'name')`.
- `appVersionParity.test.ts`: all three read 0.8.0; the `[package]`-table parser is self-tested against a conflicting `[dependencies]` version line.

## Task Commits

1. **Task 1 (tracer): snapshot, drift check, floor, two-owner refusal** - `9f8dbfcf9` (feat)
2. **Task 2: TS ownership census, shared scan, ledgers** - `f453de350` (test)
3. **Task 3: manifest-derived PortComplete and version parity** - `4a1878978` (test)

`plan_head_before..HEAD` measures 3 commits, all this plan's. Tracer gate: `<verify>` is automated-only and `human_verify_mode` is end-of-phase, so its checks were re-run end-to-end before expansion and passed; no checkpoint.

## Decisions Made

See `key-decisions`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The two-owner refusal landed in Task 1, not Task 2**
- **Found during:** Task 1
- **Issue:** `renderIpcContract` and `renderIpcSchemaSnapshot` share one collision helper; splitting it across commits would have left a half-guarded generator and a stale test.
- **Fix:** `assertSingleOwner` and its tests (including replacing the old "listed once" test, which asserted the behaviour now refused) shipped with the tracer. Task 2 carries the TS census.
- **Commit:** 9f8dbfcf9

**2. [Measurement differs from plan] Zero-owner ledger has 1 entry and the multi-registration entries are comment quotes**
- The plan expected about 13 zero-owner names and `quit` in two files. Re-measured: Phase 82 removed the stubs, leaving 1 zero-owner name. The six multi-registration channels each have exactly one live registration; the second file is a docstring quoting the old `addListener`/`addHandler` call, because the moved matcher does not strip comments (behaviour kept, so `ipcSchemaCoverage` reads the same registered set as before). The ledger therefore pins the exact file set per channel, so a real extra registration still fails. Stripping comments in the shared scan would empty this ledger but changes `ipcSchemaCoverage`'s input; left as a follow-up decision.

**Total deviations:** 2 (1 blocking, 1 measurement). **Impact:** none on scope or behaviour.

## Issues Encountered

- `eslint` reports one pre-existing `no-base-to-string` warning at `meta/genIpcContract.ts:464` (`title ?? i`); not introduced here.
- `.planning/STATE.md` showed as modified in `git status` once mid-run (another session); not touched by this plan's code commits.

## Known Stubs

None.

## Threat Flags

None beyond the register. T-83-14: snapshot plus `check:ipc-contract` (recorded drift run exits 1 naming the snapshot). T-83-15: generator refusal plus TS census (recorded temporary registration fails naming the channel). T-83-16: floors plus empty and truncated-input tests in all three gates. No dependency added.

## Next Phase Readiness

Ready for 83-06: moving `openExternalUrl` to Rust will add a manifest entry, a snapshot diff and automatic PortComplete coverage with no gate edits. The renderer floor (231) and walk floors should be re-measured if that slice changes counts materially; the generator floor and the ownership test's local copy must move together (a test enforces it).

## Self-Check: PASSED

- Created files present: ipcSchemaSnapshot.json, ipcRegistrationScan.ts, nativeChannelOwnership.test.ts, nativeSeamPortComplete.test.ts, appVersionParity.test.ts.
- Commits found: 9f8dbfcf9, f453de350, 4a1878978.
- Acceptance re-run: `ipcSchemaSnapshot.json` in genIpcContract.ts 1 and in .prettierignore 1; `"owner": "native"` 1 and `"owner": "sidecar"` 236 in the snapshot; `two owners` 2 in genIpcContract.ts; `ZERO_LITERAL_OWNER` 5, `MULTI_REGISTRATION` 5, `assertAtOrAboveFloor` 5 in the ownership test; `nativeChannels.json` 2 and `assertAtOrAboveFloor` 5 in PortComplete; `tauri.conf.json` 3 in the parity test.
- Plan verification: `pnpm check:ipc-contract` passes and failed on the recorded drift; the six named jest suites pass (100 tests); `pnpm codecheck`, `pnpm find-deadcode`, `pnpm backend-di-ceilings` pass; prettier `--check` clean on every written path that prettier sees (snapshot confirmed ignored).
