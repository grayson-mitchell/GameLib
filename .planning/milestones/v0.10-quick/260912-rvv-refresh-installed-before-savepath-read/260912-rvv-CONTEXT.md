# Quick Task 260912-rvv: refreshInstalled() before the save_path readback - Context

**Gathered:** 2026-09-13
**Status:** Ready for planning

<domain>
## Task Boundary

Fix the defect measured twice (desk + live) by quick task `260912-qop`:
`getDefaultLegendarySavePath()` in `src/backend/save_sync.ts` runs
`legendary sync-saves --accept-path` (which writes a fresh `save_path` into `installed.json`) and
then reads it back via `getGameInfo(appName, true)` with nothing refreshing the in-memory
`installedGames` map in between. The readback therefore returns a STALE value and the Cloud Saves
Sync save-path field is left EMPTY on the first call.

**The fix:** call `refreshInstalled()` immediately before the readback.

IN scope: `src/backend/save_sync.ts` + a NEW regression test proving the first call now returns the
fresh path.
OUT of scope: changing `getGameInfo`'s semantics in
`src/backend/storeManagers/legendary/library.ts`. Making `getGameInfo` consult `installed.json`
directly would fix this too, but it changes a method with many callers for the benefit of one — a
far wider blast radius for the same outcome.

</domain>

<decisions>
## Implementation Decisions

### The fix goes in save_sync.ts, not library.ts
Narrow, local, and matches existing precedent. Do NOT touch `library.ts`.

### Precedent for the exact call shape
`src/backend/sidecar/installedJsonWatcher.ts:112` already does
`await libraryManagerMap['legendary'].refreshInstalled()`. Use the same shape.
`libraryManagerMap` is a plain object literal (`storeManagers/index.ts:14`), so
`libraryManagerMap['legendary']` is the concrete `LegendaryLibraryManager` and `refreshInstalled`
is directly reachable — no cast needed. Note `refreshInstalled()` is declared WITHOUT `async`
(`library.ts:131`), so it returns `void`, not a promise; follow whatever the watcher's existing
style does rather than inventing a new one, and do not add an `await` that lint will flag as
awaiting a non-thenable.

### **The existing characterisation probe stays GREEN — it is NOT the signal for this fix**
`getGameInfoForceReloadStaleness.test.ts` (quick `260912-qop`) pins **`getGameInfo`**, not
`getDefaultLegendarySavePath`. This fix does not change `getGameInfo`, so that test **must remain
green and must NOT be modified except for a header-comment note**. An earlier statement in the
session that "the fix will flip it red" was WRONG — do not act on it, and do not "fix" that test.
If it DOES go red, something unintended changed in `library.ts` — stop and investigate.

### This fix needs its OWN regression test
Because of the above, the fix is otherwise UNTESTED. Add a test that drives
`getDefaultLegendarySavePath` (or the `getDefaultSavePath` entry point) and asserts the FIRST call
returns the fresh path. The hard part is simulating legendary: `runRunnerCommand` must be stubbed
so that it WRITES a new `save_path` into the fixture `installed.json` as its side effect, exactly
as `sync-saves --accept-path` does. A stub that does not write the file tests nothing.

### Negative control is required again
Prove the new test can fail: revert the `refreshInstalled()` line, confirm the new test FAILS with
an empty/stale path, then restore. A regression test that passes both with and without the fix is
worthless — and this project has hit that exact shape before.

</decisions>

<specifics>
## Evidence this fix is warranted (already measured — do not re-derive)

**Desk (hermetic jest, commit `7d6a9dbd4`):** with `installed.json` rewritten on disk,
`getGameInfo('Iris', true).save_path` returns the OLD value; after an explicit
`refreshInstalled()` the SAME call returns the NEW value. Trap guard, write-through control and
two negative controls all held.

**Live (2026-09-12 20:03, real app, real Epic account, Phoenix Point / `Iris`):**
```
(20:03:18) [Legendary]: Computing default save path for Iris
(20:03:18) [Legendary]: Getting default save path: ... legendary sync-saves Iris --skip-upload --skip-download --accept-path
(20:03:19) [Legendary]: installed.json updated, refreshing library     <- watcher fires
(20:03:19) [Legendary]: installed.json updated, refreshing library
(20:03:20) [ERROR]    : Unable to compute default save path for Iris   <- THE DEFECT
(20:03:20) [Frontend] : [refreshLibrary] runner=legendary origin=push  <- debounced refresh lands AFTER
```
After that run, `installed.json` held the CORRECT path on disk (directory verified to exist) while
the UI persisted `savesPath: ''`. Correct value on disk, empty value to the UI.

Log preserved at `~/Library/Logs/GameLib/gamelib.log.qop-livegate-BEFORE-fix-20260912-200406`.

**This also settles the parent todo's premise:** the ported `installedJsonWatcher` CANNOT fix the
first call. Its 500ms debounce fired one second before the error and still lost the race — the
`refreshLibrary` push is logged AFTER the error, proving the ordering.

## Code anchors (verified at 358fbdc7d)

`src/backend/save_sync.ts`, `getDefaultLegendarySavePath()`:
- L71-85: `await libraryManagerMap['legendary'].runRunnerCommand({ subcommand: 'sync-saves', ... })`
- L86-87: comment "If the save path was computed successfully, Legendary will have saved this path
  in `installed.json` (so the GameInfo)" — this comment is exactly the false assumption; update it.
- L88-90: `const { save_path: new_save_path } = libraryManagerMap['legendary'].getGameInfo(appName, true)!`
  ** <- INSERT THE REFRESH IMMEDIATELY BEFORE THIS **
- L91-97: `if (!new_save_path) logError(['Unable to compute default save path for', appName], ...)`

</specifics>

<canonical_refs>
## Canonical References

- `.planning/quick/260912-qop-getgameinfo-forcereload-stale-map/260912-qop-SUMMARY.md` — the
  measurement this fix acts on.
- `.planning/todos/pending/2026-09-05-getdefaultsavepath-live-redrive-never-taken-against-a-real-legendary-title.md`
  — the todo. Its discharge condition is a LIVE re-drive confirming the field populates on the
  FIRST call. This fix task does NOT close it; a live AFTER-run does. Leave it in `pending/`.
- `src/backend/sidecar/installedJsonWatcher.ts` — the watcher, now proven insufficient for the
  first call. Do NOT remove or change it; it is still correct for what it does (healing the map
  for subsequent reads), it simply cannot win this race.

## Repo gotchas that apply

- Backend jest project `displayName` is exactly `Backend`; `--selectProjects` is case-sensitive and
  exits 0 on no match. Read the test COUNT, not the exit code.
- `resetMocks: true` wipes factory-time mock implementations; re-establish them in `beforeEach`.
- Do not run jest in the same shell command as a file write — it has read stale in this repo.
- `pnpm lint` runs against two ceilings with almost no headroom; an orphaned `eslint-disable` costs
  +2. Add none.
- `pnpm planning-gates` baseline is 11/11 at `358fbdc7d`.

</canonical_refs>
