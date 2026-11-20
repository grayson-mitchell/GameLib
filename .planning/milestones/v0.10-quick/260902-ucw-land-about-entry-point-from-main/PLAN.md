---
id: 260902-ucw
slug: land-about-entry-point-from-main
date: 2026-09-02
status: in-progress
---

# Quick 260902-ucw — land the About entry point (the 4 commits stranded on main)

`main` carries 4 commits absent from `fix/steam-native-install-stability`. They are the complete
topological set (`git rev-list HEAD..main` = 4). Only one has code.

| commit | content |
|---|---|
| `dea20f7be` | **feat(nav): About entry point in the Settings panel** — the code |
| `bc7911a9b` | STATE.md quick-task row for 260822-tv4 |
| `69417641b` | 34.1 UAT: item 8b verified live under Tauri |
| `09141117c` | closes the pre-breadcrumb orphan-scan todo |

Verified genuinely absent, not superseded: `showAboutWindow` has **0** references in the branch's
entire `src/frontend`, `about.navLabel` is absent from `en/gamelib.json`, and
`SettingsPanel/index.tsx` contains **0** occurrences of "about".

## Why it matters

The About row is the About window's ONLY entry point under Tauri. `tauriShowAboutWindow` has been
implemented since 34.1 but had no caller outside `tray_icon.ts`'s Electron tray menu, which Tauri
does not run. Without this row the window is unreachable.

## Pre-checks already done

- `showAboutWindow` still exists: `common/types/ipc.ts:90`, `preload/api/helpers.ts:14`,
  `backend/utils.ts:247`. **It is now Tauri-direct** — Phase 35 plan 17 collapsed the Electron
  fallback, so the commit's doc comment claiming an "`isTauri()` switch" is STALE and must be
  corrected on landing rather than ported verbatim.
- `SettingsPanel/index.tsx` is already in BOTH `i18nGateScope.json` and
  `i18nForkTouchedFiles.json`, so no A-17 artifact or count-pin work is needed.

## Tasks

1. Cherry-pick `dea20f7be`; resolve conflicts (branch has reworked this panel since 2026-08-22).
2. Correct the stale `isTauri()` sentence in the ported doc comment.
3. Cherry-pick the 3 doc commits, resolving STATE.md/todo conflicts additively.
4. Verify and commit.

## Constraints

- NEVER `git checkout -- <file>` / `git stash` / `git reset --hard`. `cherry-pick --abort` is the
  designed escape hatch and fires no post-checkout hook.
- New strings go in `gamelib.json`, NEVER `translation.json`.
- `pnpm i18n --fail-on-update` WRITES locale files even when it passes — check
  `git status -- public/locales/` after.
- Commit with explicit pathspecs. Leave `.planning/phases/40-...` untracked.

## Success criteria

- `SettingsPanel.test.tsx` and `destinationCoverage.test.tsx` green, including the new
  "About calls window.api.showAboutWindow" spec.
- Full `pnpm test` 0 failing suites; lint 0 errors; prettier clean.
- `hardcodedStringGate` still green (the panel is in the BLOCKING scope).
- `git rev-list HEAD..main` becomes 0.
