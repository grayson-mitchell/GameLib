---
phase: quick-261027-g9o
plan: 01
subsystem: steam-install-poller
tags: [steam, install-poll, bottle, native-handoff]
key-files:
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
metrics:
  completed: 2026-10-27
---

# Quick 261027-g9o: Install poller adopts handoff source

The `activePolls` entry now owns a mutable `source`, read per tick (`pollInstallOnce(appId, entry.source)`). The existing-entry upgrade branch adopts an explicit, differing `source` only together with `isNativeHandoff: true`. This removes the false "stopped after grace window ... user may have cancelled" warning when a resumed bare native poll later receives the bottle finalize handoff.

## Changes

- `library.ts`: added `source: AcfSource` to the entry type with JSDoc, initialised it in the entry literal, and made the tick read `entry.source`. The upgrade branch logs the switch, assigns the source, and resets `lastBytesDownloaded`, `lastTickMs`, `stalledTicks` and `absentTicksSinceSeen`. `ticks` is kept, so MAX_TICKS stays an absolute cap. `startInstallPolling` JSDoc extended.
- `library.test.ts`: Tests E (RED at HEAD), F and G (interaction pins) in the idempotency describe. The fixture makes only the bottle root exist, so E discriminates between roots.

## Commits

- `3a20a68f9` test(quick-261027-g9o): pin install-poll handoff source adoption
- `6a36daf3b` fix(quick-261027-g9o): install poller adopts handoff source on isNativeHandoff upgrade

## Verification

- RED: at HEAD, Test E failed (no installed push); F and G passed.
- GREEN: `npx jest .../library.test.ts` passed, 242/242.
- `npx tsc --noEmit` was clean. `prettier --check` was clean on both files. The grep for `pollInstallOnce(appId, entry.source)` found 1 match.
- `graphify update .` was run.
- games.ts and the other user-modified files were not touched.

## Deviations from Plan

None. Each test uses try/finally to reset `existsSync` to `mockReturnValue(true)`, because `jest.clearAllMocks` does not reset implementations.

## Self-Check: PASSED
