---
created: 2026-11-13T00:00:00.000Z
title: 'Esc does not dismiss the three-button native launch prompt'
area: steam
severity: medium
platform: macos
ready: code
source: '74-UAT item 16 step 3 (2026-11-13): macOS beeps and the box stays open'
files:
  - src/backend/storeManagers/steam/updateLaunchPrompt.ts
  - src-tauri/src/dialogs.rs
---

The 74-14 three-button YesNoCancelCustom native box has no cancel/Esc key equivalent, so Esc beeps and the box stays open. Intended: Esc launches the current build and never updates. Give the cancel-role button a key equivalent (or map Esc to Play anyway) in the native dialog.
