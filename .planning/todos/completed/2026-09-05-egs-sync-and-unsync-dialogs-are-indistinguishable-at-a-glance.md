---
created: 2026-09-05T00:00:00.000Z
title: "EGS Sync / Unsync success dialogs render under an identical title -- a one-word body is the only difference"
area: ui-settings
status: "RESOLVED 2026-09-08 by quick 260908-iq8. Titles now name the resulting STATE -- `settings.egsSyncEnabledTitle` ('EGS Sync Enabled') vs `settings.egsSyncDisabledTitle` ('EGS Sync Disabled') -- NOT the todo's suggested 'EGS Sync' vs 'EGS Unsync': "Unsync" is not ordinary English and still reads as a near-duplicate at a glance, which is the failure being fixed. The todo's icon/colour alternative is UNREACHABLE, not merely unchosen: `DialogType` is `'MESSAGE' | 'ERROR'` (src/common/types.ts:33) and MessageBoxModal branches only on 'ERROR', so there is no success variant to style. Fixing the hardcoded literal also closed an incidental i18n gap -- the title was never translatable. SCOPE GREW: the plan assumed en/de/fr; lintTranslations R13 went RED with 92 unrecorded missing pairs because i18nCatalogPresenceBaseline.json had just been taken to totalPairs: 0 by quick 260908-gx3 that same day. Regenerating was rejected (the file states it is a record of a gap, not permission to grow it), so all 49 locales were filled. The 46 non-en/de/fr strings are HAND-AUTHORED, grounded in each locale's own message.sync/message.unsync/setting.egs-sync vocabulary, because `pnpm machine-fill-gamelib` still returns HTTP 401 on the well-formed 108-char sk-ant- key in ~/.gamelib.env -- the 2026-08-28 blocker is still live. Those 46 have had NO native-speaker or pipeline review, and D-09 never-overwrite means a future machine-fill will NOT revisit them. Gates: meta 38 suites/1040 green, frontend 156 suites/2353 green, new egsSyncDialogTitles.test.ts 13 specs (two non-vacuity arms, both against live data), lint-translations 0/0, direct key-set diff 49/49 parity at 226 keys, tsc/eslint/prettier clean."
severity: minor
platform: any
ready: code
source: quick-260905-upz, residue of 2026-08-24-pathselectionbox-onblur-silently-unlinks-egs-sync.md (suggested fix #3, unaddressed by that closure)
files:
  - src/frontend/screens/Settings/components/EgsSettings.tsx
---

# EGS Sync / Unsync success dialogs render under an identical title

## Context

Parent todo `2026-08-24-pathselectionbox-onblur-silently-unlinks-egs-sync.md` closed 2026-09-05 as
PARTIAL: its suggested fixes #1/#2 (a spurious blur no longer silently unlinks EGS sync) are
satisfied by Guard G1 in `PathSelectionBox`'s `commitPath`. Suggested fix #3 was NOT addressed and
is filed here as the sole remaining live part of that parent's finding.

## The gap, measured directly

```
$ grep -n "message.unsync\|message.sync\|title:" src/frontend/screens/Settings/components/EgsSettings.tsx
36:          title: t('box.error.title', 'Error')
43:            newPath === 'unlink' ? t('message.unsync') : t('message.sync'),
44:          title: 'EGS Sync'
```

Both the sync-succeeded and unsync-succeeded dialogs render under the literal, identical title
`'EGS Sync'`. The only distinguishing signal is the dialog body, which differs by one word
(`message.sync` -> "Sync Complete" vs `message.unsync` -> "Unsync Complete").

## Why this still matters

This is now the ONLY live part of its parent's finding, and the parent's own argument for it
survives unchanged: the operator who filed the parent todo read an "Unsync Complete" body under a
"EGS Sync" title as confirmation that sync had been ENABLED, and only learned otherwise from the
log. Guard G1 stops the specific *accidental unlink on blur* trigger that produced that exact
scenario -- but every other path that legitimately reaches the unsync dialog (an intentional
unlink) still carries the same misreport risk: a user could misread a genuine, correct "Unsync
Complete" as a sync confirmation, purely because the title never changes.

## Suggested fix

Make the two dialog titles (or otherwise make the two outcomes) visually distinguishable at a
glance -- e.g. `title: 'EGS Sync'` vs `title: 'EGS Unsync'`, or a distinct icon/colour treatment.
Low-risk, no architectural change: this is a string/prop change in the same dialog call.

## Notes

`resolves_phase: null` -- not owned by a live phase, not auto-closable by one.
