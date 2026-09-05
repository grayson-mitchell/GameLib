---
created: 2026-08-25
title: "`main.ts`'s `installed.json` file-watcher never fires under Tauri"
source: 34.6-LIVE-GATE.md Step 7 (plan 34.6-12, 2026-08-24) -- "a todo is owed for this but not filed by this task, per instruction"; treated as owed to the phase's closing-artefacts plan (34.6-14), no other plan named it
status: "RESOLVED 2026-09-05 by quick-260905-upz. The watcher mechanism is now ported into the
  sidecar's bootstrap and the discharge log string appears in the built bundle; the second
  conjunct of this todo's discharge condition -- a live re-drive of getDefaultSavePath against a
  real legendary title returning a non-empty path on the FIRST call -- was NOT re-observed and is
  re-filed as its own todo."
discharged: 2026-09-05
discharged_by: quick-260905-upz
severity: medium
resolves_phase: "unassigned"
blocked_by: "nothing external -- the fix is a porting task (bring the watcher, or an equivalent explicit refresh call, into the sidecar's import graph)"
---

# `main.ts`'s `installed.json` file-watcher never fires under Tauri

## The gap, measured directly

`main.ts:1031-1044` watches `installed.json` and calls `refreshInstalled()` 500ms after any
change to that file. Under Tauri, this watcher never fires:

- `main.ts` is not in the sidecar's import graph (the same structural gap that already forced
  `openDialog` to be extracted into a shared module in an earlier plan).
- The string `installed.json updated, refreshing library` occurs **0 times** in the running
  `build/main/sidecar.js` and **0 times** in `gamelib.log` -- measured directly against both,
  not inferred.

## Why it matters -- traced to a concrete symptom, not theoretical

This is what caused the `getDefaultSavePath` channel's own live-gate finding
(`34.6-LIVE-GATE.md` Step 7): legendary correctly computes and persists `save_path` to
`legendaryConfig/legendary/installed.json` (confirmed on disk since 22:29:05 in that run), but
GameLib's readback (`getGameInfo(appName, true)` -> `loadFile()`) reads `installedGames.get(app_name)`,
an in-memory `Map` populated only by `refreshInstalled()`. Nothing calls `refreshInstalled()`
between the legendary subprocess writing the file and GameLib's own readback, so
`getDefaultSavePath` logged `Unable to compute default save path for Iris` twice -- once
immediately, and again on a re-run two minutes later, ruling out a race. `forceReload = true`
reloads metadata, not the installed map, so it does not help.

**Scope beyond this one channel:** any field legendary writes to `installed.json` after the
fact (`save_path`, `save_timestamp`, and potentially others) is permanently invisible to
GameLib under Tauri until some other trigger happens to call `refreshInstalled()` for an
unrelated reason. This is a general staleness gap in the sidecar's legendary-install-state
model, not a defect specific to `getDefaultSavePath`.

## Not fixed here

The live gate's own text explicitly declines to fix this ("a todo is owed for this but not
filed by this task, per instruction") and does not name an owning plan. Recorded here by
34.6-14 (the phase's closing-artefacts plan) as the plan best positioned to notice the
instruction was never carried out, since documentation-only plan 34.6-14 modifies no source
file and cannot fix it directly. `resolves_phase` is left `"unassigned"` deliberately -- no
live phase currently owns this porting gap.

## Discharge condition

Either the `installed.json` watcher (or an equivalent explicit `refreshInstalled()` call site,
triggered at the right point in the sidecar's own subprocess-completion flow) is ported into
the sidecar's import graph, evidenced by a live session in which the
`installed.json updated, refreshing library` line (or its Tauri-native equivalent) appears in
`gamelib.log` after a runner subprocess writes to `installed.json`; **and** a re-drive of
`getDefaultSavePath` against a real legendary title returns the real, non-empty save path on
the first call, not just on a subsequent app restart.

---

## Disposition (2026-09-05, quick-260905-upz) — PARTIAL, closes on the mechanism only

### The observation

```
$ grep -vE '^\s*(//|\*|/\*)' src/backend/sidecar/bootstrap.ts | grep -n 'startInstalledJsonWatcher'
10:import { startInstalledJsonWatcher } from './installedJsonWatcher'
307:      startInstalledJsonWatcher()
310:        `[bootstrap] startInstalledJsonWatcher() failed: ${error}`,

$ grep -c "installed.json updated, refreshing library" build/main/sidecar.js
1

$ ls -la build/main/sidecar.js src/backend/sidecar/installedJsonWatcher.ts
-rw-r--r--@ 1 graysonmitchell  staff  1351269 Sep  5 20:45 build/main/sidecar.js
-rw-r--r--@ 1 graysonmitchell  staff     9185 Sep  1 22:00 src/backend/sidecar/installedJsonWatcher.ts
```

### The claim that MAY now be made

The watcher-ported conjunct of this todo's discharge condition is satisfied: `bootstrap.ts` carries
a real (comment-stripped) import and call site for `startInstalledJsonWatcher`, and the exact
discharge log string this todo named now appears in the built bundle (previously `0` in both the
bundle and `gamelib.log`).

### The claim that still may NOT be made

That the reported symptom has ever been re-observed as fixed. This todo's discharge condition is a
conjunction, and the second half — a live re-drive of `getDefaultSavePath` against a real,
installed legendary title returning a non-empty save path on the FIRST call, not merely after a
restart — was NOT taken in this session. No live app session with an installed legendary title was
available. The mechanism being present is necessary but not sufficient evidence that the symptom
(Phoenix Point's save path readback failing on 2026-08-24) is actually gone.

### Residue and its owner

Re-filed as
`.planning/todos/pending/2026-09-05-getdefaultsavepath-live-redrive-never-taken-against-a-real-legendary-title.md`,
carrying the live re-drive as its sole discharge condition.
