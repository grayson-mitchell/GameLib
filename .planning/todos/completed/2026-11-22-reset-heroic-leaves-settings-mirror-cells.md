---
created: 2026-11-22T12:00:00.000Z
title: "resetHeroic deletes the settings documents but never drops their mirror cells (Phase 85 review C-WR-01)"
area: stores
files:
  - src/backend/utils.ts (resetHeroic, ~392-435)
  - src/backend/sidecar/shellFilesFlowRegistration.ts (registerShellFilesFlows deps)
  - src/backend/sidecar/handlers.ts (registerHandlers wiring)
  - src/backend/stores/settingsDocs.ts (~125)
  - src/backend/stores/mirrorCell.ts (~355-366)
severity: minor
platform: any
ready: code
---

## Problem

Phase 85 code review finding C-WR-01 (round 1, `5714cafea`). After a confirmed removal the uninstaller calls
`dropSettingsDoc` (`uninstaller.ts`). `resetHeroic` removes `GamesConfig/` and `config.json` through the same
`guardedRemoveTree`, and the shell evicts the open stores (`safety_dispatch.rs`), but TS never drops the
matching mirror cells. So until the 1 s relaunch timer fires:

1. `settingsDocExists` and `readSettingsDoc` keep serving the deleted documents from the cell.
2. A settings write lands at shell rev 1. The surviving cell's `baseRev` is N, so it treats the `applied`
   ack as a no-op. The write reaches disk, but no reader can see it.

The window is short, and the relaunch reloads from disk, which is why this is `minor`.

## Why it was not fixed with the other warnings

The 85 fixer skipped it on 2026-11-22. `resetHeroic` has no store root, and wiring one in means editing
`shellFilesFlowRegistration.ts` and `handlers.ts`. Both files held uncommitted GOG-offline debug work at
the time (`.planning/debug/gog-offline-empties-cache.md`). Pick this up once that work is committed.

## Fix (from 85-REVIEW-FIX.md, iteration 1)

- Add `storeRoot` to the deps of `registerShellFilesFlows` and of `resetHeroic`.
- Add a `MirrorRegistry` method that drops every cell whose path `docKeyOf` recognises
  (`settings/global` and every `GamesConfig/*`).
- Call it after `removed.outcome === 'removed'`.

Another option from the review: the shell sends a `reset` event or rev epoch on eviction. That is a
cross-layer protocol change, so prefer the TS fix above.

Test: a jest case that runs a reset with a populated settings cell. After the reset, `readSettingsDoc`
must miss, and a later write must be visible.

## Resolution

Fixed 2026-11-23 in quick task 261123-9x9 (`31e9f7a2e`, `31bd2e304`), with the TS fix above. `MirrorRegistry.dropWhere(match)`
drops cells by predicate. `dropAllSettingsDocs(root)` in `settingsDocs.ts` uses it with the `docKeyOf` filter, so
`settings/global` and every `GamesConfig/*` cell go. `resetHeroic` takes an optional `storeRoot` and calls it after
`removed.outcome === 'removed'`, before the relaunch timer. `registerShellFilesFlows` requires `storeRoot`, and
`handlers.ts` passes `deps.services.storeRoot`. The regression test in `src/backend/stores/__tests__/settingsDocs.test.ts`
raises three settings cells to rev 3, then resets. Afterwards `readSettingsDoc` and `settingsDocExists` miss, and a write
acked at rev 1 can be read. It failed on the unfixed code. Two more cases show a refused reset keeps every cell and a
cell that is not a settings document survives.

Not covered: the cached `GameConfig`/`GlobalConfig` objects still hold the old settings in memory until the relaunch (the
C-WR-02 shape, for reset instead of uninstall).
