---
created: 2026-11-02
title: "D-UAT-15: with the Steam client absent or never launched, the install dialog first shows \"library couldn't be reached. Reconnect the drive\""
source: Phase 21 UAT 4a/4b, Windows client-setup pass 2026-11-02 (21-UAT.md)
area: steam
files:
  - src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx
  - public/locales/en/gamelib.json
severity: minor
platform: any
ready: code
---

Both 4a (client absent) and 4b (installed, never launched) showed `steam.install.libraryMissingOnlyNotice`
("Your Steam library couldn't be reached. Reconnect the drive, then try again.") before the correct
D-10/D-11 prompt. Operator: "the first error window should be skipped, the second is the relivent
error" and the "Reconnect the drive" sentence assumes a removable drive. The `library-missing`
degrade should not win when the client itself is absent or never launched; separately reconsider
the drive wording. Not yet root-caused (where `steamDegrade.reason` is computed).
