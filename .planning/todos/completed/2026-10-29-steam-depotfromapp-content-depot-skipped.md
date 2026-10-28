---
created: 2026-10-29
title: "D-UAT-14: depot selection skips cross-app (depotfromapp) content depots; Steam fetches them as an update"
source: Phase 21 Windows UAT pass 2026-10-29 (21-UAT.md D-UAT-14)
area: steam
files:
  - .planning/milestones/v0.7-phases/21-steam-native-install/21-UAT.md
  - src/backend/storeManagers/steam/depot/select.ts
severity: major
platform: any
ready: code
resolved: 2026-10-29
resolution: "fixed in 1bceff9a8: select.ts now skips only sharedinstall depots, so a depotfromapp depot with its own manifest (PHARAOH DYNASTIES 372531) is planned; live plan-build gate passed on WARHAMMER III 1142710 (3 -> 5 depots, key and manifest issued); full install + Steam restart not exercised"
---

Total War: PHARAOH DYNASTIES (2951630): GameLib planned 3 depots; after a Steam restart Steam queued an
update that added depot 372531 (204 MB, game content, not in SharedDepots) to InstalledDepots.
Hypothesis: depot/select.ts:188 skips every depotfromapp depot as a shared redist, while Steam only
routes sharedinstall depots to SharedDepots. Confirm against the PICS appinfo for 2951630 before
fixing. Debug session: .planning/debug/steam-depotfromapp-content-depot.md.
