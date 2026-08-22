---
created: 2026-08-15T08:50:00.000Z
title: "Port Heroic small-polish trio: ProgressDialog hideProgress, typos, Game Arguments label"
area: ui/polish
needs: port
status: CLOSED
resolved_by: "Direct port, 2026-08-22 — 966b3944a (a), 30e4ac652 (b, see note), b00e41337 (c, see note)"
severity: trivial
upstream:
  - 1f1ef64e0 (Heroic v2.22.1 — Hide ProgressDialog's indeterminate bar when it makes no sense, #5743)
  - a6bf657bd (Heroic v2.22.1 — Fix various typos, #5761)
  - adefbca62 (Heroic v2.22.1 — Description of "Game Arguments" option, #5810)
files:
  - src/frontend/components/UI/ProgressDialog/index.tsx
  - src/frontend/screens/Settings/sections/SyncSaves/gog.tsx
  - src/frontend/screens/Settings/sections/SyncSaves/legendary.tsx
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

## Resolution (2026-08-22)

All three ported, one commit each.

**(a) `966b3944a`** — clean. Note the `files:` list above originally omitted the two SyncSaves
call sites, which are the whole point of the upstream commit; they were added and pass
`hideProgress` unconditionally. GameLib's D-03 `declined` state clears both Winetricks loading
flags, so the declined panel now also stops showing a bar for work that will never happen.

**(b) `30e4ac652`** — content correct, **commit attribution wrong**: a concurrent session
staged-and-committed the whole tree between this session's `git add` and its `git commit`, so
these four files rode along inside that session's `test(37-04)` commit. Not rewritten — another
session was live in the repo. This is the known `gsd-sdk-commit-stages-entire-tree` hazard.

**(c) `b00e41337`** — landed with this closure commit. It was first committed cleanly on its
own as `8b886e178`, but a concurrent session unwound that commit (leaving its changes staged),
so the very next commit in this session re-captured them. Same hazard as (b), other direction.

**Locale finding (governs (b) and (c)).** Both upstream commits also touch
`public/locales/en/translation.json`, and that half is **not optional**: the `t(key, default)`
fallback is inert while the key exists in the catalog, so a code-only port renders the OLD string
and looks like a no-op. Both string values were changed in `translation.json` as well, preserving
GameLib's `Heroic` -> `GameLib` branding in the Valve-Proton message. `i18nCatalogChurnGuard`'s
live-tree assertion diffs **working tree vs index**, so a staged/committed catalog edit passes it
— the guard targets leftover `pnpm i18n` parser churn, not deliberate upstream-value ports.
Verified green after each commit. `pnpm lint-translations` exits 0 (its "Empty translation"
output is pre-existing noise across other locales).
