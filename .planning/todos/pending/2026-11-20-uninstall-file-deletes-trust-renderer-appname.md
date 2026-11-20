---
created: 2026-11-20T00:00:00.000Z
title: 'removeFixFile and removeSettingsAndLogs join the renderer-supplied appName into a delete path, so an appName like ../../x deletes x.json'
area: backend
files:
  - src/backend/utils/uninstaller.ts
severity: medium
platform: any
ready: code
source: 'phase 82 plan 07 (guard adoption); out of scope there because both are single-file deletes, outside D-10/D-11'
---

## Problem

`removeFixFile` and `removeSettingsAndLogs` in `src/backend/utils/uninstaller.ts` build their delete
paths with `join(fixesPath, `${appName}-${store}.json`)` and `join(gamesConfigPath, `${appName}.json`)`
(also `.log` and `-lastPlay.log`). `appName` comes from the renderer through the `uninstall` IPC, which
validates it only as a non-empty string. An `appName` such as `../../x` therefore makes `join` resolve
outside `fixesPath` / `gamesConfigPath` and deletes `x.json`, `x.log` or `x-lastPlay.log` there.

Only a fixed set of suffixes can be deleted and nothing recursive runs, so the blast radius is small. It
is still a delete path built from untrusted input with no containment check.

## Direction

Route both through the shared guard (`guardedRemoveTree` in `src/backend/safety/rustSafety.ts`) with
`kind: 'app-data'` targets and `trustRoot: deps.paths.fixesPath` / `deps.paths.gamesConfigPath`, so a
path that leaves its root is refused by the crate (`outside-trust-root`) rather than deleted. Add an
injected-rejection test per site, as 82-07 does for the prefix. Alternatively reject an `appName` that
is not a plain file name at the IPC schema.
