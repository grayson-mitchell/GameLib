---
created: 2026-10-16
title: "Phase 21 native-install UAT: 7 items deferred to a Windows box, never run"
source: v0.7 close - Phase 21 (21-UAT.md, user decision 2026-07-20)
area: steam
files:
  - .planning/milestones/v0.7-phases/21-steam-native-install/21-UAT.md
severity: medium
platform: windows
ready: blocked
resolves_phase: null
blocked_by: "operator's Windows machine; nobody is scheduled to run these"
parked: 2026-10-16
parked_by: operator
revisit_trigger: "the next Windows live gate (Phase 38's 38-W items run on Windows) - fold these in then"
---

Items 1c (hard-DRM launch), 1d (cancel -> 1026 -> Steam repair, HW re-run), 2b (SHA1 byte-correctness),
2c (real multi-depot remainder), 4a/4b/4c (guided client install, prompt-to-launch, continue-to-download)
were deferred 2026-07-20. PARKED, not passed. macOS passed 1a/1b/2a only.

Also still unverified on hardware: D-UAT-07 (GamePage action button) was code-fixed in `ab0500c6`, with
"pending HW re-verify" recorded in 21-UAT.md frontmatter.
