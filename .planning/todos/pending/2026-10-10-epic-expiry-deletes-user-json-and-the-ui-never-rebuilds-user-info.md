---
created: 2026-10-09T21:30:00.000Z
title: 'Epic expiry: legendary deletes user.json and the renderer never rebuilds userInfo, so the Reconnect tile is visible for one session only (F-49-R1-1)'
area: auth
severity: major
platform: any
ready: code
found_by: "plan 49-12, Phase 49 macOS live gate Run 1 (49-LIVE-GATE.md)"
files:
  - src/backend/storeManagers/legendary/user.ts
  - src/frontend/state/GlobalState.tsx
  - src/backend/signInProbe/classify.ts
---

# Epic expiry deletes user.json; the UI then reads Epic as never connected

Measured in Run 1, launch 2 (`49-LIVE-GATE.md` § Run 1, F-49-R1-1). With an invalid refresh token,
`legendary 0.21.0 status --json` logs `Stored credentials are no longer valid` **and removes
`legendaryConfig/legendary/user.json`**. The probe latched `expired` correctly, but:

- `LegendaryUser.isLoggedIn()` is `existsSync(user.json)` (`legendary/user.ts:707-709`), so the
  next boot does not probe Epic at all.
- `getUserInfo()` purges `userInfo` from the backend config store when the file is absent
  (`user.ts:713`), and `GlobalState.tsx:1859` only calls `getUserInfo()` when `userInfo`
  already exists, so nothing ever rebuilds it even after the file is restored.
- Net effect observed in launches 3 and 4: Accounts tile reads "EPIC GAMES LOGIN", Library shows
  "Epic Games is not connected", while `legendary_store/config.json` still carried
  `expired: true` until the clear launch. The "Sign-in expired — Reconnect" copy is visible only
  in the session that latched it.

Decide the intended model: either the `expired` latch must survive the file deletion and win over
"not connected" in both the row and the tile, or the probe must treat a missing file with a set
`expired` flag as expired. Add a test that simulates the deletion.
