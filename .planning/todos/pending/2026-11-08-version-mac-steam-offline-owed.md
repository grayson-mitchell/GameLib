---
created: 2026-11-08
title: "Version mac-steam-offline-owed.json (the owed goonline record) with the Phase 68 engine"
area: steam
files:
  - src/backend/storeManagers/steam/macSteamOffline.ts
severity: minor
platform: macos
ready: code
---

**File:** `<appFolder>/mac-steam-offline-owed.json` (mode 0o600), written by `recordOnlineDebt` in
`src/backend/storeManagers/steam/macSteamOffline.ts`.

**Holds:** `{since, by, pid}`, the goonline a go-offline wrap owes Mac Steam. It is read at boot by
`restoreMacSteamOnlineIfOwed`, the only cover for a `kill -9` of the sidecar.

**Why it counts as user data:** it is the only record that Mac Steam was taken offline on the
user's behalf. If a future build changes the shape and misreads an old record, the user's Mac Steam
stays logged off with Friends down and nothing in GameLib knows to restore it.

**Reuse:** Phase 68's engine (`src/backend/storeVersioning/`) is the mechanism: `prepareStoreFile`
with a codec. No shape change is planned today, so this is a latent trap.

See `.planning/phases/68-versioned-persisted-stores-and-migrations/68-INVENTORY.md`.
