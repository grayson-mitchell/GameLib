---
phase: 05-branding-about-polish
reviewed: 2026-07-02T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - .vscode/launch.json
  - public/changelog.json
  - scripts/verify-branding.cjs
  - src/backend/__tests__/utils.test.ts
  - src/backend/config.ts
  - src/backend/constants/paths.ts
  - src/backend/launcher.ts
  - src/backend/logger/paths.ts
  - src/backend/storeManagers/gog/presence.ts
  - src/backend/storeManagers/gog/setup.ts
  - src/backend/storeManagers/zoom/games.ts
  - src/backend/tray_icon/__tests__/tray_icon.test.ts
  - src/backend/tray_icon/tray_icon.ts
  - src/backend/updater.ts
  - src/backend/utils.ts
findings:
  critical: 1
  warning: 3
  info: 1
  total: 5
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-07-02
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Phase 5 is a branding/about-polish pass: string rebrands (Heroic → GameLib) across
backend dialogs, tray tooltip, Discord presence, log/config path constants, a new
bundled `public/changelog.json` read locally by `getCurrentChangelog`, and an
extended `verify-branding.cjs` gate. The rebrand work is largely clean and the
`getCurrentChangelog` refactor is well-tested.

Two real defects stand out. First (BLOCKER): gutting `getLatestReleases()` (D-04)
left `GITHUB_API` as an unused import, and `notify` is also unused — both trip
`@typescript-eslint/no-unused-vars: 'error'`, so `pnpm lint` fails. The phase's
`codecheck` gate is only `tsc --noEmit` (which does not flag unused imports), which
is why this slipped through. Second, for a phase explicitly scoped to "about polish,"
two user-facing surfaces still point at the upstream Heroic project: the About panel
`website` and the update dialog's Changelog button. The new `verify-branding.cjs`
does not cover either, so it reports GREEN while these remain.

I verified the changelog show-logic (frontend `ChangelogModal`) against the bundled
file shape and the `Release` type — that path is consistent and not defective. The
`<appData>/heroic` → `<appData>/GameLib` migration is guarded correctly and is inert
under the test electron mock (tmpdir), so it does not corrupt real config during tests.

## Critical Issues

### CR-01: Unused imports fail the enforced ESLint gate (`pnpm lint`)

**File:** `src/backend/utils.ts:72` (and `src/backend/utils.ts:46`)
**Issue:**
`eslint.config.mjs` sets `@typescript-eslint/no-unused-vars` to `'error'`. Running
`npx eslint src/backend/utils.ts` reports **2 errors**:

```
46:10  error  'notify' is defined but never used.      @typescript-eslint/no-unused-vars
72:10  error  'GITHUB_API' is defined but never used.  @typescript-eslint/no-unused-vars
```

`GITHUB_API` was the sole dependency of `getLatestReleases()`; commit `054f9740`
(D-04) replaced that function body with `return []` but did not remove the import
(confirmed: the pre-change file used `axiosClient.get<Release[]>(GITHUB_API)` at old
line 793). `notify` (from `./dialog/dialog`) also lost its only call site during the
branding refactor. The phase's `codecheck` script is `tsc --noEmit` only (no
`noUnusedLocals`), so it passes — but the repo's `lint` script (`eslint --cache .`)
will fail CI.

**Fix:** Remove the dead imports.

```ts
// line 46 — drop `notify`
import { showDialogBoxModalAuto } from './dialog/dialog'

// line 72 — delete entirely (no longer referenced)
// import { GITHUB_API } from './constants/urls'
```

## Warnings

### WR-01: About panel still links to the Heroic website

**File:** `src/backend/utils.ts:237`
**Issue:** `showAboutWindow()` sets `website: 'https://heroicgameslauncher.com'`. The
native About panel is the exact surface this phase ("about polish") targets. The
`applicationName` was rebranded to `'GameLib'` but the website link was not, so users
opening About are sent to the upstream project.
**Fix:** Point at GameLib's site/repo (or drop the field until one exists):

```ts
website: 'https://github.com/grayson-mitchell/GameLib'
```

### WR-02: Update dialog "Changelog" button opens Heroic's GitHub releases

**File:** `src/backend/updater.ts:52-53`
**Issue:** The `showAutoupdateDialog` Changelog handler calls
`shell.openExternal('https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/releases')`.
This dialog is bound to `autoUpdater.on('update-available', ...)` (electron-updater's
own check), which is independent of the now-suppressed `getLatestReleases()`. If an
update is ever surfaced, the Changelog button sends users to the upstream Heroic
project rather than GameLib.
**Fix:** Repoint to GameLib releases (or reuse the bundled changelog):

```ts
shell.openExternal('https://github.com/grayson-mitchell/GameLib/releases')
```

### WR-03: `verify-branding.cjs` gives false confidence and crashes ungracefully on missing files

**File:** `scripts/verify-branding.cjs:81-133`
**Issue:** The gate asserts `showAboutWindow applicationName: 'GameLib'` but never
checks the About panel `website` (WR-01) or the updater Changelog URL (WR-02), so it
reports GREEN while user-facing Heroic references remain — the very defects this phase
should catch. Separately, the file loaders at lines 34-37 (`require`/`readFileSync`)
throw an uncaught exception (stack trace, no `FAIL` line) if any target file is
missing, instead of recording a clean failure.
**Fix:** Add regression guards for the About `website` and the updater releases URL
(e.g. `check("utils.ts About website is not heroicgameslauncher.com", !utilsTs.includes("heroicgameslauncher.com"))`
and a matching check against `updater.ts`), and wrap file loads in try/catch that
routes to `check(..., false)`.

## Info

### IN-01: Filesystem migration runs as a top-level module side effect

**File:** `src/backend/constants/paths.ts:32-43`
**Issue:** The one-time `<appData>/heroic` → `<appData>/GameLib` `renameSync` executes
at module import time. It is correctly guarded (`existsSync(legacy) && !existsSync(new)`,
skipped under `CI==='e2e'`, wrapped in try/catch) and is inert in unit tests because
the electron mock returns a `tmpdir()` appData path — so no real defect today. However,
import-time filesystem mutation is fragile: it fires for any process that imports
`paths.ts` (including future test suites that do not set `CI=e2e`), and only the config
dir is migrated (logs under `Library/Logs/GameLib`, `<XDG_STATE_HOME>/GameLib`, etc. are
not carried over).
**Fix:** Move the migration into an explicit `migrateLegacyConfig()` invoked once from
app startup, rather than executing on import.

---

_Reviewed: 2026-07-02_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
