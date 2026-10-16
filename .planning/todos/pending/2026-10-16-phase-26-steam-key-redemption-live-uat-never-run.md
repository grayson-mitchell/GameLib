---
created: 2026-10-16
title: "Phase 26 Steam key redemption: all 5 live UAT items never run"
source: v0.7 close - Phase 26 (26-HUMAN-UAT.md, 26-VERIFICATION.md)
area: steam
files:
  - .planning/milestones/v0.7-phases/26-steam-key-redemption/26-HUMAN-UAT.md
severity: medium
platform: any
ready: human
resolves_phase: null
parked: 2026-10-16
parked_by: operator
revisit_trigger: "the next time anyone has a spare Steam key and a signed-in Steam session - cheap to fold into any live Steam gate, NOT a commitment"
---

All five items are still `pending` since 2026-07-20: code is verified 6/6, nothing was ever exercised
against a live CM session. PARKED, not passed.

1. Redeem a valid unowned key - success names the game, it appears in the library with no restart.
2. Redeem a key for an already-owned title - distinct "already owned" copy.
3. A key shaped like a real one that Steam rejects - distinct "invalid key" copy, modal stays open.
4. Sidebar "Redeem a Steam key" absent when logged out, present right after a real login.
5. After any real attempt, `grep` of `gamelib.log` finds no raw key value (the SPEC-mandated final check).

Discharge: items 1-3 need a spare key, an owned-title key and a junk key; 5 only after one of them.
