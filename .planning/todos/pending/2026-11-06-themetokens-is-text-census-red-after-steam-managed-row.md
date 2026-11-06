---
created: 2026-11-06T19:10:00.000Z
title: "themeTokens is-text render-site census is red (29 vs 27) since the Downloads Managed-by-Steam row added two `button is-text` sites"
area: ui-theme
files:
  - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts (render-site census ~3024)
  - src/frontend/screens/DownloadManager/components/SteamManagedItem/SteamManagedItemView.tsx (lines 61, 69)
  - src/frontend/screens/DownloadManager/index.tsx (line 179, the existing pure is-text site)
severity: minor
platform: any
ready: code
---

## Problem

`themeTokens.test.ts` → "Game-menu .is-link family … (261015-7tt)" → "render-site
census: re-derived F1 counts match exactly (27 total, …)" fails:
`Expected length: 27, Received length: 29`.

The census greps every frontend `.tsx` for `className="…is-text…"` and pins the
total. Per-file counts now (2026-11-06):

| file | sites |
| --- | --- |
| `screens/Game/GameSubMenu/index.tsx` | 21 (is-link) |
| `screens/Game/GamePage/components/MainButton.tsx` | 1 (is-link) |
| `screens/Game/GamePage/components/SteamEngineNotices.tsx` | 4 |
| `screens/DownloadManager/index.tsx` | 1 |
| `screens/DownloadManager/components/SteamManagedItem/SteamManagedItemView.tsx` | **2 (new)** |

The two new sites are the Pause and Cancel buttons on the Downloads "Managed by
Steam" row, added in quick 261105-vfq (`c4c6d434f`). That quick task's jest run
covered the steam storeManager folder and SteamManagedItem only, so it never ran
this census. Quick 261106-pvk later saw the failure and wrongly reported it as
unrelated to the session's work.

The is-link counts (22 total, 21 GameSubMenu, 1 MainButton) and the
SteamEngineNotices count (4) are unchanged; only the total is off.

## Solution

1. Decide whether the new row's buttons are meant to be `button is-text`. They
   copy the existing Downloads pure-is-text button (`DownloadManager/index.tsx:179`),
   so the likely answer is yes.
2. If yes: check that the contrast reasoning behind this census covers a
   `.button.is-text` on the Downloads row surface (the same surface as the
   line-179 site). Then update the census to pin 29 total and add a
   `SteamManagedItemView.tsx` arm (2 sites) next to the pure DownloadManager
   arm, with a comment naming 261105-vfq.
3. If no: change the row's classes and leave the census at 27.

Verify: `npx jest src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts`
passes, plus a scoped `npx prettier --check` on the edited files.
