---
status: complete
quick_id: 261114-l1j
date: 2026-11-14
commits: [f206a4589, ac626471c, b805f4db9]
---

# Quick 261114-l1j: Settings auto-update toggle drift

Pinned the Settings toggle read path (`readSetting`), resynced the `store/config.json` settings mirror from config.json at sidecar boot (`resyncSettingsMirror`), corrected 74-UAT and closed the todo.

## Tasks
1. `f206a4589` readSetting exported and used by getSetting; new test (RED first, then green).
2. `ac626471c` `src/backend/settingsMirrorResync.ts` + test; called once in the bootstrap 'config' step.
3. `b805f4db9` 74-UAT preconditions, items 20/28 and their gaps annotated; todo moved to completed with Resolution.

## Deviations
- [Rule 3] bootstrap: `requireServices(state)` throws in the 'config' step (needs every service), so added a small `requireStores(state)` helper next to `requireStoreRoot`.
- [Rule 1] `skeletonFlows.test.ts` WR-12 pinned `configStore` has no `settings` key; boot now creates it. Changed the assertion to check the rejected `/tmp/evil.sh` write did not land in `settings.wineVersion.bin`.
- UAT line numbers differed from the plan; located by content. Also added the config.json wording to the precondition at items 21-ish (autoUpdateGames off/ON lines) beyond the four named.

## Verification
- jest: useSettingsContext (3 suites, 15 tests), settingsMirrorResync, all of src/backend/sidecar/__tests__ pass. One run showed outboundHttpRegistry.test.ts failing once (timing); passes alone (9/9), unrelated.
- prettier, `pnpm codecheck`, `pnpm build:sidecar` clean; `resyncSettingsMirror(` count in bootstrap.ts is 1.
- `pnpm planning-gates`: 11/12. The failing gate is `.planning/state-sdk-field-anchor-gate.py` against STATE.md, which I did not touch (clean in git). Pre-existing/orchestrator-owned, not fixed.
- Prettier --check omitted for the UAT file and todo (`ignored: true`).

## Self-Check: PASSED
