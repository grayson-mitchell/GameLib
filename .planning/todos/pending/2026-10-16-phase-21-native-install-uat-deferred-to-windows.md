---
created: 2026-10-16
title: "Phase 21 native-install UAT: 4a/4b/4c client-setup items need a Steam-absent / never-launched machine"
source: v0.7 close - Phase 21 (21-UAT.md, user decision 2026-07-20); narrowed 2026-10-29 Windows pass
area: steam
files:
  - .planning/milestones/v0.7-phases/21-steam-native-install/21-UAT.md
severity: medium
platform: windows
ready: blocked
resolves_phase: null
blocked_by: "a Windows account or VM where Steam is not installed (4a), then installed but never launched (4b/4c); the operator's Windows box has Steam installed and launched"
parked: 2026-10-16
parked_by: operator
revisit_trigger: "a fresh Windows local user account or VM is available - fold into the next Windows live gate"
---

Remaining: 4a (D-10 guided client install, consent → visible non-silent `SteamSetup.exe`), 4b (D-11
"launch Steam once" banner; GameLib never writes `libraryfolders.vdf`), 4c (auto-continue to download
once Steam is ready). PARKED, not passed.

Ran 2026-10-29 on the operator's Windows box via `/gsd-verify-work 21`: 1c, 1d, 2b, 2c PASS (findings
D-UAT-11..14 recorded in 21-UAT.md "Windows hardware pass"). D-UAT-07 HW re-verify is BLOCKED by
D-UAT-13 (the waiting-for-restart state is never entered on Windows), so it moves with D-UAT-13, not
with this todo.
