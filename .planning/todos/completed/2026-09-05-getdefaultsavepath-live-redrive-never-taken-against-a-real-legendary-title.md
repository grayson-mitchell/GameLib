---
created: 2026-09-05T00:00:00.000Z
title: "getDefaultSavePath live re-drive against a real legendary title -- never taken since the installed.json watcher was ported"
area: tauri-sidecar
status: OPEN
severity: medium
platform: any
ready: live-gate
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

## 2026-09-12 update -- desk half now MEASURED (quick 260912-qop)

The mechanism claim in "What was verified" above (`getGameInfo(appName, true)` merging install
fields from the stale, module-scope `installedGames` map instead of re-reading `installed.json`)
was previously only a static reading of source. It has now been turned into a repeatable, hermetic
jest measurement:

- Test file: `src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts`
  (commit `7d6a9dbd4`).
- Sentinels: `/qop/OLD-stale-save-path` (written to `installed.json` before the simulated
  `sync-saves` rewrite) and `/qop/NEW-fresh-save-path` (written after, simulating what
  `legendary sync-saves --accept-path` does inside `getDefaultLegendarySavePath()`).
- Result: `manager.getGameInfo('Iris', true)` returns `save_path = OLD_SENTINEL` immediately after
  `installed.json` on disk already holds `NEW_SENTINEL` (confirmed by a write-through control
  reading the file directly), and returns `NEW_SENTINEL` only after an explicit
  `manager.refreshInstalled()` is called before the same `getGameInfo` call (positive control). A
  trap guard (`toBeDefined()`, title, `is_installed === true`) rules out the five `loadFile()`
  early-return paths as an alternate explanation.
- Two negative controls proved the probe can genuinely fail (verbatim output in
  `.planning/quick/260912-qop-getgameinfo-forcereload-stale-map/260912-qop-SUMMARY.md`):
  - NC-1 (flip the defect assertion's expected value to the NEW sentinel): failed with
    `Received: "/qop/OLD-stale-save-path"` -- the stale arm is reading a real value, not
    `undefined` and not a mock.
  - NC-2 (remove the disk-rewrite step): failed at the write-through control with
    `Expected: "/qop/NEW-fresh-save-path"` / `Received: "/qop/OLD-stale-save-path"` (jest's
    fail-fast semantics surface this arm first in the sequential `it()` block); a supplementary
    isolated run with the write-through control's own assertion also suppressed surfaced the
    identical failure signature precisely at the positive-control assertion, confirming that arm
    is genuinely disk-driven and not decorative.
- No production source was modified: `src/backend/save_sync.ts` and
  `src/backend/storeManagers/legendary/library.ts` are unchanged.

**This does NOT discharge this todo.** The discharge condition remains a LIVE gate: a live session
against a real, installed legendary title confirming the save-path field populates on the first
call. The 500ms `installedJsonWatcher` debounce race is still unmeasured -- it is a live-timing
property, out of scope for a desk-level jest probe. This todo stays in `pending/`.

## 2026-09-12 update -- code-side cause now FIXED (quick 260912-rvv)

The stale-readback mechanism measured by quick `260912-qop` above has now been fixed at its
source. `getDefaultLegendarySavePath()` in `src/backend/save_sync.ts` now calls
`libraryManagerMap['legendary'].refreshInstalled()` immediately before the
`getGameInfo(appName, true)` readback, so the module-scope `installedGames` map is rebuilt from
`installed.json` before it is read, closing the staleness window `260912-qop` measured.

Desk-proven by a new regression test,
`src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts`, which drives the real,
exported `getDefaultSavePath('Iris', 'legendary', [])` end to end (only `getGame` and
`runRunnerCommand` are stubbed; `getGameInfo` and `refreshInstalled` are real) across two arms
(an EMPTY start state and a STALE start state), with a `runRunnerCommand` stub that performs the
same `installed.json` disk write `sync-saves --accept-path` does in production. A verified
negative control confirms the test is coupled to that one line: removing the
`refreshInstalled()` call reproduces both arms' pre-fix failures (`Received: ""` and
`Received: "/rvv/OLD-stale-save-path"`), and restoring it returns both tests to green.

**This still does NOT discharge this todo.** The discharge condition is unchanged: a LIVE
session against a real, installed legendary title confirming the Cloud Saves Sync save-path
field populates on the FIRST call. Only a live AFTER-run satisfies that; this quick task fixed
the code and desk-proved the fix, but took no live measurement. This todo stays in `pending/`
with `status: OPEN`, `severity: medium`, `platform: any`, `ready: live-gate` unchanged.
