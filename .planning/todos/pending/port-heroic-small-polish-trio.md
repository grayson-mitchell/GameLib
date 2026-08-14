---
created: 2026-08-15T08:50:00.000Z
title: "Port Heroic small-polish trio: ProgressDialog hideProgress, typos, Game Arguments label"
area: ui/polish
needs: port
status: OPEN
severity: trivial
upstream:
  - 1f1ef64e0 (Heroic v2.22.1 — Hide ProgressDialog's indeterminate bar when it makes no sense, #5743)
  - a6bf657bd (Heroic v2.22.1 — Fix various typos, #5761)
  - adefbca62 (Heroic v2.22.1 — Description of "Game Arguments" option, #5810)
files:
  - src/frontend/components/UI/ProgressDialog/index.tsx
  - src/frontend/components/UI/Winetricks/index.tsx
  - src/backend/wiki_game_info/steamdeck/utils.ts
  - src/frontend/screens/Settings/components/ShowValveProton.tsx
  - src/frontend/screens/Settings/components/LauncherArgs.tsx
---

## Problem

Three trivial upstream commits from Heroic v2.22.1. All target files are **untouched by GameLib
since fork base**, so all three apply clean. Batched into one task because individually none of
them justifies a session.

**(a) `1f1ef64e0`** — `ProgressDialog` gains a `hideProgress?: boolean` prop so the indeterminate
`LinearProgress` bar is hidden when it conveys nothing. Bundled with it: `Winetricks` gains
`guiOpen` state so it tracks the tool's real lifecycle, setting it via `.finally()` on the
`callTool` promise instead of firing and forgetting.

**(b) `a6bf657bd`** — typo fixes in `src/backend/wiki_game_info/steamdeck/utils.ts` (and its
test) and `src/frontend/screens/Settings/components/ShowValveProton.tsx`.

**(c) `adefbca62`** — the Game Arguments label gains a fallback string:
`t('options.gameargs.title')` → `t('options.gameargs.title', 'Game Arguments (appended to game
launch command)')`.

## Solution

Port all three, one commit each (`git show 1f1ef64e0`, `git show a6bf657bd`,
`git show adefbca62` — Heroic upstream is git remote `origin`).

**Locale note:** (b) and (c) each also touch `public/locales/en/translation.json`. Neither adds a
*new* key — (c) adds a fallback default to an existing key — so the blocking localisation gate
should not be implicated, but confirm before assuming. Apply GameLib's existing locale policy
(fork-owned strings live in `gamelib.json`; upstream-owned catalogs are guarded by
`i18nCatalogChurnGuard`).

Related: [[port-heroic-gamepad-nintendo-layout-and-key-repeat]] (same upstream review batch).
