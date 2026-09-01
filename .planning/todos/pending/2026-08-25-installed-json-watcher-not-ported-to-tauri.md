---
created: 2026-08-25
title: "`main.ts`'s `installed.json` file-watcher never fires under Tauri"
source: 34.6-LIVE-GATE.md Step 7 (plan 34.6-12, 2026-08-24) -- "a todo is owed for this but not filed by this task, per instruction"; treated as owed to the phase's closing-artefacts plan (34.6-14), no other plan named it
status: pending
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
