---
created: 2026-09-05T00:00:00.000Z
title: "getDefaultSavePath live re-drive against a real legendary title -- never taken since the installed.json watcher was ported"
area: tauri-sidecar
status: OPEN
severity: medium
source: quick-260905-upz, residue of 2026-08-25-installed-json-watcher-not-ported-to-tauri.md (second, unsatisfied discharge conjunct)
blocked_by: "nothing external -- needs a live app session with an installed legendary title; unscheduled, not blocked"
files:
  - src/backend/save_sync.ts
  - src/backend/sidecar/installedJsonWatcher.ts
  - src/backend/storeManagers/legendary/library.ts
---

# getDefaultSavePath live re-drive never taken against a real legendary title

## Context

Parent todo `2026-08-25-installed-json-watcher-not-ported-to-tauri.md` closed 2026-09-05 as
PARTIAL: its discharge condition was a conjunction of (a) the `installed.json` watcher mechanism
being ported into the sidecar, and (b) a live re-drive of `getDefaultSavePath` against a real
legendary title returning a non-empty save path on the FIRST call. Only (a) was verified in this
session.

## What was verified (mechanism only)

```
$ grep -vE '^\s*(//|\*|/\*)' src/backend/sidecar/bootstrap.ts | grep -n 'startInstalledJsonWatcher'
10:import { startInstalledJsonWatcher } from './installedJsonWatcher'
307:      startInstalledJsonWatcher()

$ grep -c "installed.json updated, refreshing library" build/main/sidecar.js
1
```

## What is still unverified

The original symptom (`2026-08-24-installed-json-watcher-never-ported-to-the-tauri-sidecar.md`):
opening a game's Cloud Saves Sync settings left the save-path field EMPTY because GameLib's
readback of `installed.json` raced ahead of the watcher's refresh. The watcher now exists in the
sidecar's bootstrap, but nobody has re-driven the actual user gesture (trigger a legendary
save-path computation, then immediately check the settings field) against a real installed
legendary title to confirm the field now populates on the FIRST call rather than only after an app
restart or a full library refresh masks the gap.

## Discharge condition

One live session: install (or use an already-installed) legendary title, trigger
`getDefaultSavePath` (e.g. open that game's Cloud Saves Sync settings for the first time in the
session), and confirm the save-path field populates on the first call -- not after a restart, not
after a manual full-library refresh papers over it.

## Notes

`resolves_phase: null` -- not owned by a live phase. Not externally blocked, just requires hardware
with an installed legendary title and has not yet been scheduled.
