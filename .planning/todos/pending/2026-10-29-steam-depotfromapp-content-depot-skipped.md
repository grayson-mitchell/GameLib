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
---

Total War: PHARAOH DYNASTIES (2951630): GameLib planned 3 depots; after a Steam restart Steam queued an
update that added depot 372531 (204 MB, game content, not in SharedDepots) to InstalledDepots.
Hypothesis: depot/select.ts:188 skips every depotfromapp depot as a shared redist, while Steam only
routes sharedinstall depots to SharedDepots. Confirm against the PICS appinfo for 2951630 before
fixing. Debug session: .planning/debug/steam-depotfromapp-content-depot.md.
