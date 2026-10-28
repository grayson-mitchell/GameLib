---
created: 2026-10-29
title: "D-UAT-13: native install completed while Steam runs shows Play, not 'Restart Steam to finish' (Windows)"
source: Phase 21 Windows UAT pass 2026-10-29 (21-UAT.md D-UAT-13)
area: steam
files:
  - .planning/milestones/v0.7-phases/21-steam-native-install/21-UAT.md
  - src/backend/storeManagers/steam/library.ts
  - src/frontend/screens/Game/GamePage/components/MainButton.tsx
severity: major
platform: windows
ready: code
---

Reproduced twice on Windows with Steam running throughout: Darkest Dungeon (resume path) and Total
War: PHARAOH DYNASTIES (first install). On finalize the install poll logs "badge flipped to installed"
and the detail page shows Play; Play opens Steam's install dialog because the running client has not
re-read the new StateFlags 4 manifest. The steam-waiting-for-restart state (21-16) is never entered, so
D-UAT-07's button fix (ab0500c6) cannot be exercised. macOS 1a did show the restart hint, so look for
what differs on Windows. Debug session: .planning/debug/steam-waiting-for-restart-windows.md.
