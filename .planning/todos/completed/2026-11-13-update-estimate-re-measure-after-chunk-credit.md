---
created: 2026-11-13T00:00:00.000Z
title: 'Re-measure the bridge update size estimate against real downloads after 74-17'
area: steam
severity: minor
platform: any
ready: live-gate
source: '.planning/phases/74-steam-game-updates/74-UAT.md item 5 and 74-VERIFICATION.md (deferred by the 74 gap-closure round 3, 2026-11-13)'
files:
  - src/backend/storeManagers/steam/depotRust/updateEstimate.ts
  - src-tauri/crates/gamelib-depot/src/delta.rs
---

## Problem

UAT 5 (round 1) measured the pre-click estimate at about 7x the real download on Manor Lords
(`download <= 7.0 GB`, 0.96 GB fetched) and about 3x on Mining Mechs. Plan 74-17 then changed
the estimate to credit old-manifest chunks and count new depots (WR-02), but no live item has
re-measured it since, so it is unknown whether the "about" figure is now a useful guide.

## Fix direction

Re-run the measurement on Manor Lords 1363080 and Mining Mechs 1603180 (restage them stale per
spike 070): record "Show update size" against the `[depot-rust] outcome ... bytes=` of the real
update. If still more than about 2x high, the estimate likely does not credit chunks reusable from
local files that the delta reuses; fix it in the Rust summarize path.

## Done when

Both fixtures' estimates are within about 2x of the real download, recorded in a UAT item.

## Resolution

2026-11-14: done, no code change. 74-17's chunk credit already makes the estimate exact on both
fixtures: Manor Lords 960,127,440 and Mining Mechs 5,979,200, equal to the real downloads
(1.00x, was about 7x and 3x). Measured offline on the cached manifest pairs that UAT items 3
and 5 downloaded; the old formula reproduces the round-1 estimates byte for byte as a control.
Recorded as 74-UAT item 31; the item 5 gap is marked resolved.
