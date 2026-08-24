---
created: 2026-08-24T00:00:00.000Z
title: "The `installed.json` watcher that refreshes legendary's in-memory install map lives in `main.ts` and was NEVER ported to the sidecar — so any field legendary writes itself is permanently invisible under Tauri"
area: tauri-sidecar
status: OPEN
severity: major
files:
  - src/backend/main.ts
  - src/backend/storeManagers/legendary/library.ts
  - src/backend/save_sync.ts
---

## Observed

Found by the operator on 2026-08-24 driving **step 7 of `34.6-LIVE-GATE.md`**, on commit
`c13b9e398`.

Opening Phoenix Point -> Settings -> Cloud Saves Sync left the save-path field EMPTY, with:

```
(22:29:03) [Legendary]: Getting default save path: … legendary sync-saves Iris --skip-upload --skip-download --accept-path
(22:29:03) [Legendary]: Computing save path for save folder {UserLibrary}/Application Support/com.snapshotgames.phoenixpoint/EGS/{EpicID}/
(22:29:05) [ERROR]:   [Legendary]: Unable to compute default save path for Iris
(22:29:05) [INFO]:    Iris: Setting savesPath to ""
```

**Legendary computed it correctly.** Running the identical command by hand resolves the path and
persists it — `legendaryConfig/legendary/installed.json` has carried a correct `save_path` since
**22:29:05**, the same second GameLib declared failure. GameLib failed to READ BACK a value that was
already on disk.

Not a race: the operator retried at 22:31:04 and it failed again at 22:31:06, with the value having
sat on disk for two minutes.

## Immediate cause

`save_sync.ts:71-96` runs the legendary subprocess, then reads the result back with:

```ts
const { save_path } = libraryManagerMap['legendary'].getGameInfo(appName, true)!
if (!save_path) { logError(['Unable to compute default save path for', appName], …); return '' }
```

`getGameInfo(appName, true)` -> `loadFile()` -> `installedGames.get(app_name)`, and `installedGames`
is an **in-memory `Map`** populated ONLY by `refreshInstalled()` (`legendary/library.ts:131`), which
reads `installed.json` from disk. Nothing calls it between the subprocess writing the file and the
readback. The `forceReload = true` argument reloads METADATA, not the installed map.

## Root cause — the refresh mechanism is not in the sidecar at all

`main.ts:1031-1044` installs exactly the missing piece:

```ts
watch(legendaryInstalled, () => {
  logInfo('installed.json updated, refreshing library', LogPrefix.Legendary)
  … setTimeout(() => libraryManagerMap['legendary'].refreshInstalled(), 500)
})
```

**Measured — it does not exist under Tauri:**

| Check | Result |
|---|---|
| `grep -c "installed.json updated, refreshing library" build/main/sidecar.js` | **0** |
| `grep -c "installed.json updated" gamelib.log` | **0** — never fired, ever |

`main.ts` is not in the sidecar's import graph. This is the same structural gap that already forced
`openDialog` to be extracted out of `main.ts` into `backend/utils/openDialog.ts` so both builds could
share one implementation.

## Why this is bigger than save paths

`installedGames` is the ONLY source for several `GameInfo` fields, and legendary writes to
`installed.json` on its own for more than save paths (`save_path`, `save_timestamp`, and anything a
future legendary version adds). Under Tauri **none of those writes are ever picked up** until
something independently calls `refreshInstalled()` — `refresh()` does, so a full library refresh
masks the bug and makes it look intermittent.

**Generalisation worth acting on:** `main.ts` side effects that are not IPC handlers — watchers,
timers, event subscriptions — are invisible to the channel-by-channel IPC porting inventory, because
they have no channel name to appear under. Nobody has swept for others. That sweep is the valuable
part of this todo.

## Suggested fix

1. Minimal: call `refreshInstalled()` in `save_sync.ts` after the subprocess returns and before the
   readback. Fixes the reported symptom, not the class.
2. Correct: port the `installed.json` watcher into the sidecar's own bootstrap, the same way
   `openDialog` was extracted — one implementation both builds import.
3. **Sweep `main.ts` for other unported non-handler side effects** (`watch(`, `setInterval`,
   `.on(` subscriptions) and check each against `build/main/sidecar.js`. Grepping the bundle for a
   distinctive log string, as done here, is a cheap and decisive test.

## Notes

No `resolves_phase:` — must not be auto-closed by Phase 34.6. Step 7 of `34.6-LIVE-GATE.md` PASSED
despite this, because `savesPath` is a user-settable field and the operator entered the path
manually; `getDefaultSavePath` itself is recorded as a working channel with this defect behind it.

Related: [[initstoremanagers-dead-under-tauri]] · [[migrations-never-run-in-tauri-sidecar]] ·
[[sidecar-guard-first-import-breaks-electron-hook]] · [[census-by-wrong-namespace-misses-call-sites]]
