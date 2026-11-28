---
created: 2026-11-27T09:55:00Z
title: "GOG setup's single UAC prompt names Windows PowerShell, not the game"
area: gog-install
severity: minor
platform: windows
ready: code
files:
  - src/backend/storeManagers/gog/windowsElevation.ts
  - src/backend/storeManagers/gog/setup.ts
---

## Problem

Found in the 2026-11-27 live check of GOG Windows elevation. The single setup UAC prompt names
"Windows PowerShell", which the operator found "bit unclear that is the game install". This is the
trade-off recorded in the closed `2026-11-20-gog-windows-elevation-live-check.md`: batching the
steps under one prompt shows PowerShell with an encoded command instead of each installer's own
name.

## Idea

Show a GameLib notice just before the prompt, such as "Windows will ask for permission to finish
installing <game>", through the existing notice or toast path, with the string in the gamelib locale
namespace. Consider the same for the uninstall prompt. Note that `public/locales/` is
prettier-ignored shipped source.
