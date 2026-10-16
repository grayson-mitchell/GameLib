# Deferred Items -- discovered during 36-01 execution

Out-of-scope failures found while running `npm run test:ci` as part of
36-01's full-plan verification. Both are pre-existing -- confirmed NOT
caused by any 36-01 commit -- and are logged here rather than fixed, per
the executor's scope-boundary rule ("only auto-fix issues directly caused
by the current task's changes").

## 1. `meta/__tests__/genI18nGateScope.test.ts` -- A-17 ANTI-ROT failure

**Symptom:** `forkTouchedSnapshot.files` (the committed
`meta/i18nForkTouchedFiles.json`) is missing
`src/frontend/components/UI/Dialog/components/Dialog.tsx`, which the live
git-derived fork-touched-files list now includes.

**Root cause:** `Dialog.tsx` was last modified by commit `1b7fa0eaa
fix(quick-260820-kq0): round 3 -- fix the Dialog primitive itself,
app-wide`, a prior quick task. That task's propagation missed regenerating
`meta/i18nForkTouchedFiles.json` after touching a new fork-owned file.
Confirmed via `git log --oneline a9e055eb0^..HEAD --
src/frontend/components/UI/Dialog/components/Dialog.tsx` returning empty --
no 36-01 commit touched this file.

**Not fixed here:** regenerating the snapshot is a `meta/` tooling action
outside 36-01's scope (login overlay/crossfade/guard) and outside the
files this plan's `files_modified` list covers.

## 2. `meta/__tests__/hardcodedStringGate.test.ts` -- stale D-18 allowlist entry

**Symptom:** `report.staleExemptions` contains
`src/frontend/screens/Login/components/SteamLogin/index.tsx`. The D-18
allowlist (`meta/i18nGateAllowlist.json`) records `expectedCount: 27` for
this file; the AST scanner (`scanSource()`) now measures 26.

**Root cause, isolated:** confirmed pre-existing, NOT caused by 36-01
Task 1. Extracted the file's content as of the commit immediately before
Task 1 (`git show a9e055eb0^:...`) and ran the same scanner against it
directly -- it also measures 26, not 27. The drift from 27 to 26 predates
this plan entirely; Task 1's edits (Props/closeWindow rewrite, 4
`navigate('/login')` -> `closeWindow()` call sites, 4 prose comment fixes)
touch no JSX text, JSX attribute, or other AST node kind this scanner
classifies as a violation, and measuring both the pre-Task-1 and
post-Task-1 file states independently confirmed the count is identical
(26) in both.

**Not fixed here:** correcting the allowlist's `expectedCount` is a
`meta/` tooling/D-18 registry action, not part of 36-01's scope, and the
actual root cause (what dropped the count from 27 to 26, and when) was not
investigated further -- flagging for whoever owns the D-18 allowlist to
re-measure and update `meta/i18nGateAllowlist.json`.
