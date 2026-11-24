---
created: 2026-11-24T10:00:00.000Z
title: "Library install state disagrees with disk: Racine shows not installed, Bloody Hell's path is broken"
area: library
files:
  - src/backend/storeManagers/gog (gog_library.json and gog_store/installed.json, the two stores that disagree)
severity: medium
platform: macos
ready: live-gate
---

## Problem

In the 87-59 live gate (2026-11-24), two GOG titles showed install state that disagrees with the disk:

- Racine (GOG 1192621307) is installed on disk and listed installed in `gog_store/installed.json`, but `gog_library.json` says
  `is_installed: False`, so the library hides it as not installed.
- Bloody Hell's stored install path points at a folder that does not exist (`Bloody Hell x`, next to the real one under
  `~/Games/GameLib`).

The gate bottles for both existed, so item 3 could not use them. It is not known which build or action produced the
disagreement; the profile predates the Phase 87 run.

## Not fixed in Phase 87

Recorded from the 87-59 run's non-gate observations. The user decided on 2026-11-24 to fix the five gate findings (F1 to F5)
and the engine log in Phase 87 and to track the rest as todos, so this is deliberately not planned there.

## To do

Find which writer updates `gog_library.json` after an install and why it left Racine as not installed, and decide whether the
library should reconcile against `installed.json` and the disk on load. Check the Bloody Hell path against the folder name
(a trailing character) before assuming a code defect.
