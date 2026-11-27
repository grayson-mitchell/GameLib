---
created: 2026-11-27T09:55:00Z
title: "Declined GOG setup UAC prompt still reports the install as successful"
area: gog-install
severity: medium
platform: windows
ready: code
files:
  - src/backend/storeManagers/gog/setup.ts
  - src/backend/storeManagers/gog/windowsElevation.ts
  - src/backend/storeManagers/gog/games.ts
---

## Problem

Found in the 2026-11-27 live check of GOG Windows elevation (see the closed
`2026-11-20-gog-windows-elevation-live-check.md`, item 2). Reinstalling Balrum at 22:27:12 and
declining the single UAC prompt logged `Running 3 elevated steps under one prompt`, then
`[WARNING] Elevated step exited with code 1 stderrLength=476`, and no further prompts. GameLib then
showed an "installed" toast, and the store lists Balrum as installed with no unins000.exe and no
setup applied (no redists, no uninstaller).

The cause in code: `runElevatedSteps` returns `{ spawns, failed }`, and `runGogSetup` (setup.ts
~198) awaits it and ignores `failed`. Severity is medium: the game is marked installed without its
redists or its uninstaller, but reinstalling and accepting the prompt works around it.

## What to decide/do

A setup failure (`failed > 0`) should reach the install result, so the install is reported failed or
needs-setup with a retry, never "installed". Unit-testable with a spawnAsync stub that resolves with
code 1, which `windowsElevation.test.ts` already does for the steps. Confirm live by declining once.
