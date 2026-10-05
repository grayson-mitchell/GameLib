---
created: 2026-10-05T00:00:00.000Z
title: "pathShim desktop/documents ignore user-dirs.dirs (Linux) and OneDrive redirection (Windows); shortcut write errors are swallowed"
area: shortcuts
severity: medium
platform: any
ready: code
found_by: "Code review of phase 34.5 (non-Steam runners, Wine and shortcuts), 2026-10-05"
files:
  - src/backend/sidecar/pathShim.ts:94-97
  - src/backend/sidecar/pathShim.ts:104-108
  - src/backend/shortcuts/shortcuts/shortcuts.ts:72-79
---

## Problem

Electron read `~/.config/user-dirs.dirs`; the shim reads only the `XDG_DESKTOP_DIR` env var, which
is almost never exported. On Windows it ignores OneDrive redirection of Desktop and Documents. The
`writeFile` callbacks in `shortcuts.ts:72-79` drop the error and log "Shortcut saved" anyway.

## Failure scenario

On a localized Linux desktop (e.g. `~/Schreibtisch`) `~/Desktop` doesn't exist; the write fails
silently, the success toast shows, and `shortcutsExists` stays false. On Windows, GOG default save
paths under `documents` resolve wrong.

## Suggested fix

Parse `user-dirs.dirs` (or run `xdg-user-dir DESKTOP` via argv); on Windows use the known-folder
path; check `writeFile` errors and report failure.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.
