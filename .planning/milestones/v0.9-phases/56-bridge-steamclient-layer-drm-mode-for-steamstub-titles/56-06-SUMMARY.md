---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 06
subsystem: bridge-drm
tags: [ntdll, pe-patch, allowlist, crossover]
requires: [56-03 detour payload]
provides: [applyNtdllPatch, findNtdllPatchRow, supportedCrossoverBuilds]
affects: [56-08]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/drm/ntdllPatchTable.ts
    - src/backend/storeManagers/steam/bridge/drm/ntdllPatch.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/ntdllPatch.test.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/ntdllPatch.realCrossover.test.ts
decisions:
  - "Allowlist is the table: only 26.3.0.39832 with clean sha 6dff64c0...2387 yields a row"
metrics:
  completed: 2026-10-28
---

# Phase 56 Plan 06: ntdll patch applier and CrossOver allowlist Summary

Pure, never-throwing x64 ntdll detour applier (NotProton `.npdet` layout) plus a one-row pinned table that doubles as the D-09 CrossOver allowlist.

## Exported signatures (for 56-08)

- `type NtdllPatchRow` = { crossoverBuild, cleanSize, cleanSha256, hookRva, stolenBytes (hex), sectionName, sectionRva, sectionVirtualSize, sectionRawSize, sectionCharacteristics, payloadSha256, patchedSha256 }
- `const NTDLL_PATCH_ROWS: Readonly<Record<string, NtdllPatchRow>>`
- `findNtdllPatchRow(build: string, cleanSha256: string): NtdllPatchRow | null`
- `supportedCrossoverBuilds(): string[]`
- `type NtdllPatchResult = { status: 'patched'; bytes: Buffer } | { status: 'refused'; reason: string }`
- `applyNtdllPatch(cleanBytes: Buffer, payload: Buffer, row: NtdllPatchRow): NtdllPatchResult`

56-08 maps `refused` to `drmStepError('runner-patch', reason)` and a null row to `unsupported-crossover`. The applier never writes; the caller writes to the APFS clone.

## Commits

- 200934bde feat(56-06): table + applier + synthetic-PE suite
- f09d81d6d test(56-06): real CrossOver check

## Verification

- Synthetic suite and real-CrossOver suite: 12 tests passed, 0 skipped. The real test ran on this Mac (payload built by 56-03 was present) and reproduced patched sha c0e21a9a...e97e.
- prettier check, `pnpm codecheck` pass. No BigInt, ASCII only, imports only `crypto` and the table, ts-prune markers 4 and 2.
- The synthetic patched sha (fb011347...34ad) was pinned from a first run, as the plan directs.
- `pnpm find-deadcode` printed nothing for the new modules.

## Deviations from Plan

None - plan executed as written.

## Notes

- `gsd-sdk requirements.mark-complete` reports REQUIREMENTS.md missing (known).

## Self-Check: PASSED
