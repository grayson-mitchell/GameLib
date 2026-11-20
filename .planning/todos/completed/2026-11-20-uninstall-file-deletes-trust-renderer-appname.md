---
created: 2026-11-20T00:00:00.000Z
title: 'removeFixFile and removeSettingsAndLogs join the renderer-supplied appName into a delete path, so an appName like ../../x deletes x.json'
area: backend
files:
  - src/backend/utils/uninstaller.ts
severity: medium
platform: any
ready: code
resolved: 2026-11-20
resolution: "fixed by quick 261120-ux8: both deletes go through guardedRemoveTree with app-data targets under the fixesPath / gamesConfigPath trust roots (outside-trust-root refuses an escape), and the uninstall IPC rejects a non-plain-name appName"
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

## Resolution (2026-11-20, quick 261120-ux8)

Three commits:

- `fix(quick-261120-ux8): guard removeFixFile behind the Rust safety check with an app-data trust root`
- `fix(quick-261120-ux8): guard removeSettingsAndLogs behind the Rust safety check under the GamesConfig trust root`
- `fix(quick-261120-ux8): reject a non-plain-name appName at the uninstall IPC and close the todo`

The stake was bigger than the todo's `x.json` example: `../config` with "remove settings" resolved
to `appFolder/config.json`, GameLib's own global settings file, and deleted it. The settings test
now pins that file as kept.

A refusal or failure is one closed-set log line (`[safety] remove-fix-file <outcome>: <reason>` /
`[safety] remove-settings <outcome>: <reason>`) with no appName and no path, and no toast. These
deletes sit outside Phase 82's D-10/D-11/D-13; the game is already uninstalled when they run, a
leftover settings or fix JSON is harmless, and a toast would need a new refusal kind plus renderer
copy and locale strings.

Only existing candidate files are sent to the guard (an `existsSync` pre-filter). That is not a
safety check, since everything sent is still guarded and the crate re-checks on delete. It spares a
Rust round trip, and a canonicalize-failed refusal for a missing trust root, in the common no-file
case.
