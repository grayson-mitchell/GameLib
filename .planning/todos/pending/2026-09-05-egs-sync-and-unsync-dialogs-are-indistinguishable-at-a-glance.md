---
created: 2026-09-05T00:00:00.000Z
title: "EGS Sync / Unsync success dialogs render under an identical title -- a one-word body is the only difference"
area: ui-settings
status: OPEN
severity: minor
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
