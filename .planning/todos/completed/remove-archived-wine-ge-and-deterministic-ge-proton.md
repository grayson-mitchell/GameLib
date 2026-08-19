---
created: 2026-08-15T08:50:00.000Z
title: "Remove archived Wine-GE from the Wine Manager + make GE-Proton downloads deterministic"
area: wine/linux
needs: port
status: OPEN
severity: minor
upstream:
  - bdafb95ff (Heroic v2.22.1 — Remove Wine-GE from the wine manager options, #5251)
  - feb170afb (Heroic v2.22.1 — Make GE-Proton downloads deterministic, #5708)
files:
  - src/backend/wine/manager/downloader/main.ts
  - src/backend/wine/manager/downloader/constants.ts
  - src/backend/wine/manager/downloader/utilities.ts
  - src/backend/wine/manager/utils.ts
  - src/frontend/screens/WineManager/index.tsx
  - src/common/types.ts
---

## Problem

**GameLib still offers Wine-GE to Linux users, and it is an abandoned build.**
GloriousEggroll archived `wine-ge-custom`; upstream dropped it from the Wine Manager in
Heroic v2.22.1. GameLib still lists it — verified 2026-08-15 at
`src/backend/wine/manager/downloader/main.ts:59` (`type: 'Wine-GE'`) with
`downloader/constants.ts` still pointing at
`https://api.github.com/repos/GloriousEggroll/wine-ge-custom/releases`, plus consumers in
`wine/manager/utils.ts:35,99,100`. So a Linux user can browse to and install a dead Wine.

Separately, GE-Proton downloads are non-deterministic — upstream `feb170afb` adds 19
self-contained lines to `downloader/utilities.ts` to fix that. No locale churn in that one.

## Solution

Port both as one task (`git show bdafb95ff`, `git show feb170afb` — Heroic upstream is git
remote `origin`).

GameLib's wine downloader is only **1 line diverged** from fork base
(`WineManager/index.tsx`), so this applies near-clean.

**Locale decision — already made, do not relitigate:** upstream's Wine-GE removal strips a key
from 47 locale catalogs. Apply the precedent set by quick task `260810-tr4` (the Steam Runtime
launch-wrapper removal): **leave the orphaned locale keys INERT** rather than churning the
catalogs. Rationale, unchanged from that task: `i18nCatalogChurnGuard` forbids fork edits to
upstream-owned catalogs (asserted live under `test:ci`), `lintTranslations` tolerates extras by
design (`printExtraTransations = false`), and upstream themselves left catalog cleanup to Weblate.

Note this is Linux-only user-visible change, so visual UAT needs a Linux GUI.
