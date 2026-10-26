---
phase: quick-261027-c4g
plan: 01
subsystem: shortcuts
tags: [macos, i18n, toast, gamelib-namespace]
requires: [261026-ctm, 261026-b9r]
provides: [macDesktopShortcutWanted, macDesktopShortcutPresent, box.shortcuts.messageMacDesktop, box.shortcuts.messageRemoveMacDesktop]
key-files:
  modified:
    - src/backend/shortcuts/shortcuts/shortcuts.ts
    - src/backend/shortcuts/ipc_handler.ts
    - src/backend/sidecar/shortcutsFlowRegistration.ts
    - src/backend/sidecar/__tests__/shortcutsFlows.test.ts
    - public/locales/*/gamelib.json
    - public/locales/*/gamelib.mt.json
  created:
    - src/backend/shortcuts/__tests__/macShortcutToast.test.ts
decisions:
  - Add toast follows the addDesktopShortcuts setting; remove toast follows a pre-removal disk snapshot.
  - 48 non-English strings hand-authored (no ANTHROPIC_API_KEY) and validated with validateTranslation().
metrics:
  completed: 2026-10-27
---

# Quick 261027-c4g: macOS shortcut toast names the Desktop

On macOS the Add toast now says "Applications folder and on the Desktop" when the Desktop link
is made. The Remove toast says so when a Desktop item was on disk before removal.

## Commits
- e922e5286: helpers, both send sites, tests at both sites
- 2141cdf84: 2 keys in 49 gamelib catalogs, 48 mt.json stamps, todo closed

## What changed
- `shortcuts.ts`: `macDesktopShortcutWanted()` and `macDesktopShortcutPresent(title)`.
- `ipc_handler.ts` and `sidecar/shortcutsFlowRegistration.ts` choose keys identically. Remove
  snapshots the disk before `removeShortcuts()`. All `t()` calls use literal keys.
- Tests: new `macShortcutToast.test.ts` (5 cases) and a `261027-c4g` describe in
  `shortcutsFlows.test.ts` (5 cases), covering add on/off, remove with link and toggle off,
  remove without link and toggle on, and non-mac.
- Todo moved to `.planning/todos/completed/` with a closing note.

## Verification
- jest `src/backend/shortcuts` + `shortcutsFlows` + `flowRegistrationCensus`: 9 suites, 178 tests pass.
- `pnpm codecheck`: clean. Scoped prettier on the five .ts paths: clean.
- `gamelibCatalogParity`, `i18nGlossary`, `i18nCatalogChurnGuard`: pass. `i18n-churn-guard`: clean.
  `planning-gates`: 12/12.
- `validateTranslation()` over 96 (locale,key) pairs: 0 problems; sabotage control reported 2 problems.

## Deviations
- **[Rule 1] Existing test widened.** In `shortcutsFlows.test.ts` the 261012-ca6 "removeShortcut
  deletes the .app" case accepts the new Desktop key too: `containedApp` creates the Desktop path
  (index 0 on darwin), so on a mac host the pre-removal snapshot correctly sees a Desktop item.
- **Translations hand-authored** (no API key). Existing wording of the Applications folder and
  Desktop in each locale's `translation.json` was mirrored where present.
- The Task 1 tests were written after the implementation, not before (no separate RED commit).

## Pre-existing failures (not caused by this task)
- `meta/__tests__/lintTranslations.test.ts` (2 tests: live-tree zero hard failures, baseline
  drift) and `pnpm lint-translations:gamelib` (624 hard failures) fail. Every finding is an
  unlocalised key from other work: `steam.bridge.setup.{notInited,steamNotRunning,steamNotSignedIn}`,
  `steam.bridge.waiting.*` (uncommitted 261027-aue) and `downloadManager.cancelDialog.*` (already
  committed). Zero findings mention `box.shortcuts.message*`.

## Commit hygiene
`public/locales/en/gamelib.json` carried an uncommitted foreign steam-bridge hunk. The commit was
built from the HEAD blob via `git update-index --cacheinfo`; `git diff --cached` showed only the
`box.shortcuts` hunk, and the working tree still holds the foreign hunk plus the new keys.

## Known Stubs
None.

## Self-Check: PASSED
Both commits exist (e922e5286, 2141cdf84); the new test file, SUMMARY, and the completed todo exist.
