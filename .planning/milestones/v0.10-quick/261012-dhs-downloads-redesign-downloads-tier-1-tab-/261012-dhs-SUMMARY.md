---
phase: quick-261012-dhs
plan: 01
subsystem: frontend/nav-shell + frontend/download-manager
tags: [navigation, downloads, i18n, ui]
status: complete
commits: 3
plan_head_before: 5edddc8ab32008c312024c8883a147f1d49670a6
plan_head_after: f6c4e02d591b8cc815ed43129d2f0fd04a7fd0b8
requirements: [QUICK-261012-dhs]
key-files:
  created:
    - src/frontend/components/UI/NavShell/components/DownloadsTabIcon/index.tsx
    - src/frontend/components/UI/NavShell/__tests__/DownloadsTabIcon.test.tsx
    - src/frontend/screens/DownloadManager/components/DownloadHero/index.tsx
    - src/frontend/screens/DownloadManager/components/DownloadHero/index.css
    - src/frontend/screens/DownloadManager/components/DownloadHero/heroModel.ts
    - src/frontend/screens/DownloadManager/components/DownloadHero/__tests__/heroModel.test.ts
    - src/frontend/screens/DownloadManager/__tests__/downloadManagerLayout.test.ts
  deleted:
    - src/frontend/components/UI/NavShell/components/DownloadsRing/ (index.tsx, index.scss)
    - src/frontend/components/UI/NavShell/__tests__/DownloadsRing.test.tsx
    - src/frontend/components/UI/NavShell/__tests__/downloadsRingStyles.test.ts
    - src/frontend/screens/DownloadManager/DownloadManagerHeader/index.tsx
actuals:
  tasks: 3
  commits: 3
---

# Quick 261012-dhs: Downloads tab, Steam-style Download Manager

Downloads is now the fourth tier-1 tab (Accounts, Library, Stores, Downloads, Settings) with a live queue-count badge. The navbar ring is gone. The Download Manager page has one edge-to-edge progress bar, a cover-art hero, and "Up Next" / "Completed" sections divided by 1px separators. The user's reversal of "Downloads is not a tab" is recorded in `sketch-findings-gamelib`.

## Commits

| Task | Hash | Message |
| ---- | ---- | ------- |
| 1 (tracer) | `22a5daa2c` | feat(261012-dhs): Downloads becomes the fourth tier-1 tab with a queue-count badge; navbar ring removed (D-01, D-02, D-03) |
| 2 | `e5b437090` | feat(261012-dhs): Steam-style Download Manager -- edge-to-edge progress bar, cover-art hero, Up Next / Completed sections with separators (D-04) |
| 3 | `f6c4e02d5` | docs(261012-dhs): record the user's Downloads-tab reversal in sketch-findings; repoint comments off the deleted ring (D-05) |

D-06 (`graphify update .`) ran at the end of Task 3 and succeeded. `graphify-out/` is gitignored.

## Measured gate results

**Task 1**
- `jest src/frontend/components/UI/NavShell`: 30 suites, 600 tests, all pass (matches the plan's expected 30 suites).
- `pnpm codecheck`: clean. eslint: 0 errors, 5 warnings (the same `no-unsafe-member-access` and `no-base-to-string` patterns the deleted ring test used). Prettier clean over all 13 non-ignored paths.
- Scope node check: `scope-ok`.
- Post-commit Meta: `hardcodedStringGate` PASS (about 157 s). `genI18nGateScope` fails only on the pre-existing A-17 ANTI-ROT.

**Task 2**
- RED observed first: `heroModel` suite failed with "Cannot find module '../heroModel'", and `downloadManagerLayout` failed against the old page. Both then went green.
- `jest src/frontend/screens/DownloadManager` plus `cssTokenSweep` and `shellTokens`: 6 suites, 67 tests, pass.
- `pnpm codecheck` clean. `pnpm find-deadcode` reports `unreachable: 46 OK | used-in-module: 0 OK`.
- eslint on the touched files: 0 errors. I fixed three warnings in the new `DownloadHero` file (floating promise, `require-await`, exhaustive-deps). The 3 remaining warnings are in the pre-existing `DownloadManager/index.tsx`.
- `pnpm i18n --fail-on-update`: Added/Restored/Unreferenced keys all 0. `pnpm i18n-churn-guard`: clean. Prettier clean over all 12 non-ignored paths. `public/locales/en/gamelib.json` is prettier-ignored, so it is not checked; that is deliberate.
- Presence baseline: gamelib lint went from `816 findings, 96 hard failures` (pre-check matched the plan) to `864 findings, 0 hard failures`. `totalPairs` 720 to 864. `downloadManager.upNext`, `library.tileSize.label` and `library.tileSize.valueText` are each missing from 48 locales. The diff removes only the old `generatedAt` and `totalPairs` lines.
- Meta (run before the commit, so on the working tree): `lintTranslations` PASS (previously red), `hardcodedStringGate` PASS (149 s).
- Generator cross-check after the commit: the only diff lines are `+` for the three pre-existing foreign paths (`LibraryTileSizeSlider/index.tsx`, `GameSubMenu/shortcutsToggle.ts`, `libraryTileSize.ts`). `meta/i18nForkTouchedFiles.json` was restored afterwards and `git status --short meta/` is empty.

**Task 3**
- `jest` over NavShell, Dropdown, DownloadManager and GameCard: 39 suites, 742 tests, all pass.
- eslint 0 errors. Prettier clean over the 7 non-ignored paths. The two `.claude/skills` files are prettier-ignored, so no check was run on them.
- `grep -c 261012-dhs`: `navigation-shell.md` 3, `SKILL.md` 1.
- `git status --short` afterwards shows only the pre-existing uncommitted files.

## Planner refinements to the brief (implemented as written)

1. The separator is drawn from `color-mix(in srgb, var(--text-secondary) 30%, transparent)`, not `var(--divider)`. `--divider` is declared in only 2 of 10 themes.
2. The hero art fades with a `mask-image` and a scrim that mixes `--body-background` down to `transparent`, not to a solid colour. 9 of 10 themes paint a gradient behind the content.
3. The art is a `CachedImage` `<img>` with a fallback list, never a CSS `background-image` (T-261012-dhs-01). A layout gate enforces this.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `themeTokens.test.ts` no-drag floor pinned the deleted ring**
- **Found during:** Task 1, first NavShell jest run.
- **Issue:** `has at least two no-drag declarations excluding interactive children` failed. Deleting `.NavShell__navRight` and its nested `.DownloadsRing { -webkit-app-region: no-drag }` leaves one no-drag (`.NavTabs`). The plan did not list this file.
- **Fix:** The floor is now 1 and the title says "excluding the interactive tab strip", with a comment naming this task. The companion test that `.NavShell__navbar` itself has no `no-drag` is unchanged.
- **Files modified:** `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts`
- **Commit:** `22a5daa2c`

**2. [Rule 1 - Bug] `genI18nGateScope.test.ts` pinned the artifact file counts**
- **Found during:** Task 2, the pre-commit Meta run.
- **Issue:** A0, A3 and A4 assert the scope artifact has exactly 207 files and the fork-touched artifact exactly 249. Task 2's two new files (`DownloadHero/index.tsx`, `heroModel.ts`) make them 209 and 251. Task 1's ring-for-icon swap nets zero. The plan never mentioned this file; the 261011-txc precedent did the same re-pin.
- **Fix:** Re-pinned to 209 and 251 in A0, A2 (title), A3 and A4, and added a dated comment entry matching the precedent. After the fix only A-17 ANTI-ROT fails.
- **Files modified:** `meta/__tests__/genI18nGateScope.test.ts`
- **Commit:** `e5b437090`

**3. [Rule 1 - cleanup] Three eslint warnings in the new `DownloadHero`**
- The effect now guards on `!appName` (not `!element`), so `[appName, runner]` is a complete dependency list. The async call is prefixed with `void`, and `stopInstallation` is a plain function returning the helper's promise. Behaviour is the same as the plan's.
- **Commit:** `e5b437090`

### Notes on plan fidelity
- `ProgressHeader` is rendered inside the hero panel (the `.downloadHero__speed` band), as specified.
- The "Other Keys" comment in `DownloadManager/index.tsx` is kept. `queue.label.downloading` and `queue.label.queued` are no longer referenced in code; `pnpm i18n --fail-on-update` reports 0 unreferenced keys, so no catalogue change was needed.

## Deliberately left alone

- **Pre-existing ANTI-ROT drift.** `genI18nGateScope` test `A-17 ANTI-ROT` still fails. It reads committed `git diff <base> HEAD`, and the drift is exactly three foreign paths from other quick tasks (`LibraryTileSizeSlider/index.tsx`, `shortcutsToggle.ts`, `libraryTileSize.ts`). None belong to this task, and the generator cross-check proves our hand edits introduce no other drift. Adding them would trip the A-03 ratchet.
- **96 `library.tileSize.*` baseline pairs.** The presence-baseline writer cannot record one key alone, so regenerating also recorded the 96 pre-existing pairs from 261011-t4y (T-261012-dhs-04). This is stated in the Task 2 commit body.
- `.planning/state.json`, `.planning/milestone.lock`, `.planning/debug/` were never staged.

## Open items

1. **Live visual check (owed).** The repo has no jsdom or CSS engine in jest, so none of the following is verified. Look at it live in `midnightMirage`, `gruvbox_dark` and `dracula`, and note the operator's zoom (divide reported px by the zoom factor):
   - The five-tab strip fits the navbar, and the count badge is not clipped by MUI's `overflow: hidden` on the tab.
   - The badge position and contrast (`--accent` fill with `--body-background` text).
   - The Download Manager hero: art readability against the scrim, the mask fade having no seam against the content gradient, the edge-to-edge bar touching the window edge, and the separator lines visible in all three themes.
   - Pause/resume and cancel from the hero work against a real download.
2. `DownloadManager/index.tsx` remains in the declared unscanned debt, unchanged.

## Known Stubs

None.

## Threat Flags

None. No new endpoints, auth paths or file access. The hero reuses the existing `handleStopInstallation` call and confirmation dialog.

## Self-Check: PASSED

Files verified present: `DownloadsTabIcon/index.tsx`, `DownloadsTabIcon.test.tsx`, `DownloadHero/index.tsx`, `DownloadHero/index.css`, `DownloadHero/heroModel.ts`, `heroModel.test.ts`, `downloadManagerLayout.test.ts`. Deleted files absent. Commits `22a5daa2c`, `e5b437090`, `f6c4e02d5` are in `git log`. `git rev-list --count 5edddc8ab..HEAD` returns 3.
