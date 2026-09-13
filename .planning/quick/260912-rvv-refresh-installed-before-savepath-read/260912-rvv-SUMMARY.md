# Quick 260912-rvv: refresh `installedGames` before the save_path readback -- Summary

One-liner: `getDefaultLegendarySavePath()` now calls `libraryManagerMap['legendary'].refreshInstalled()`
immediately before its `getGameInfo(appName, true)` readback, closing the stale-map race measured
by quick 260912-qop.

## The fix (one line + corrected comment)

```diff
--- a/src/backend/save_sync.ts
+++ b/src/backend/save_sync.ts
@@ -84,8 +84,16 @@ async function getDefaultLegendarySavePath(appName: string): Promise<string> {
     }
   )

-  // If the save path was computed successfully, Legendary will have saved
-  // this path in `installed.json` (so the GameInfo)
+  // `sync-saves --accept-path` above rewrites `save_path` into `installed.json` on DISK, but
+  // `getGameInfo` merges install fields from the module-scope `installedGames` map, which is
+  // only rebuilt by `refreshInstalled()` -- so without an explicit refresh here, the readback
+  // below can return a stale (or absent) value even though the fresh one is already on disk
+  // (measured desk + live by quick task 260912-qop). `sidecar/installedJsonWatcher.ts`'s
+  // 500ms debounce cannot substitute for this call: live evidence shows its `refreshLibrary`
+  // push landing AFTER the "Unable to compute default save path" error, so it loses the race
+  // for this, the very first read. Do not remove or weaken the watcher -- it still correctly
+  // heals the map for subsequent reads; it simply cannot win this particular one.
+  libraryManagerMap['legendary'].refreshInstalled()
   const { save_path: new_save_path } = libraryManagerMap[
     'legendary'
   ].getGameInfo(appName, true)!
```

`refreshInstalled()` returns `void`, so no `await`/`eslint-disable` pair was needed or added (the
`installedJsonWatcher.ts:112` precedent's `await` + disable was deliberately NOT copied, per the
plan's explicit constraint).

Commit: `d3bc389d1` -- `fix(quick-260912-rvv): refresh installedGames before the save_path readback`

## The regression test, and why the stub writes the file

New file: `src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts` (commit `df3dc3de6`,
lint-fixed in `52a47888d`).

This test is a **regression test for the fix**, not a characterisation of the defect (that role
is already filled by the qop probe). It drives the real, exported `getDefaultSavePath('Iris',
'legendary', [])` end to end. Only two seams are stubbed:

- `manager.getGame` -- returns a fake `LegendaryGame`-shaped object (`isNative`, `getSettings`,
  `getGameInfo`).
- `manager.runRunnerCommand` -- instead of a bare mock resolving `undefined`, its implementation
  **writes `NEW_SENTINEL` into the fixture `installed.json` on disk** before resolving, because
  that disk write is exactly what `legendary sync-saves --accept-path` performs in production.
  A mock that skipped the write would make the test pass identically with or without the fix
  (the single highest anti-vacuity risk called out in the plan) -- there would be nothing on disk
  for `refreshInstalled()` to discover, so removing the fix line would not change the readback at
  all.

`getGameInfo` and `refreshInstalled` themselves are the REAL `LegendaryLibraryManager` methods,
obtained via `jest.requireActual` inside a `jest.mock('backend/storeManagers', ...)` factory (this
avoids `backend/storeManagers/index.ts` eagerly constructing every other store manager at import
time).

Two arms, each with a distinct sentinel pair (`OLD_SENTINEL = '/rvv/OLD-stale-save-path'`,
`NEW_SENTINEL = '/rvv/NEW-fresh-save-path'`, both distinct from the qop probe's own
`/qop/...` sentinels):

- **EMPTY arm** -- `installed.json` and the seeded map both start with `save_path: null` (the
  real first-ever-sync state for a legendary title).
- **STALE arm** -- both start with a non-empty `OLD_SENTINEL`, ruling out "presence of any value"
  as a false signal distinct from freshness.

Four anti-vacuity controls, present in both arms:

1. **Sentinel-distinctness guard** -- asserts `OLD_SENTINEL !== NEW_SENTINEL` before anything
   else runs.
2. **Trap guard** -- calls `manager.getGameInfo(APP_NAME, true)` right after seeding and asserts
   it still reflects the seeded (pre-sync) state, ruling out an accidental early refresh.
3. **Stub-called assertion** -- `runRunnerCommand` `toHaveBeenCalledTimes(1)` and
   `toMatchObject({ subcommand: 'sync-saves', '--accept-path': true })`, proving the code path
   under test actually ran and did not short-circuit.
4. **Write-through control** -- reads `installed.json` directly off disk after the call and
   asserts it holds `NEW_SENTINEL`, proving the stub's write landed independently of whatever the
   in-memory map reports.

## Task 1: born RED against unfixed code

Captured against the tree state before the fix line existed (test file present, `save_sync.ts`
still on its original comment/no-refresh code):

```
FAIL Backend src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts
  getDefaultSavePath(appName, "legendary", []) refreshes installedGames before the save_path readback (quick 260912-rvv)
    ✕ EMPTY arm: first call resolves to the fresh path, not "" (installed.json/map start with save_path: null -- the real first-sync state) (3 ms)
    ✕ STALE arm: first call resolves to the fresh path, not the old one (installed.json/map start with a non-empty OLD sentinel -- rules out "presence" alone as the signal) (1 ms)

  ● ... EMPTY arm ...
    expect(received).toBe(expected) // Object.is equality
    Expected: "/rvv/NEW-fresh-save-path"
    Received: ""
      at Object.<anonymous> (src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts:431:24)

  ● ... STALE arm ...
    expect(received).toBe(expected) // Object.is equality
    Expected: "/rvv/NEW-fresh-save-path"
    Received: "/rvv/OLD-stale-save-path"
      at Object.<anonymous> (src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts:468:24)

Test Suites: 1 failed, 1 total
Tests:       2 failed, 2 total
```

Both failure signatures are the correct-reason reds specified by the plan: EMPTY arm receives
`""` (the `if (!new_save_path)` `logError` branch fired on the still-null map value), STALE arm
receives the old sentinel (a present-but-wrong value slipping past that same guard). Neither is a
TypeError, ReferenceError, `Cannot find module`, or a bare `Received: undefined` -- no wiring
issues to fix before proceeding.

## Task 2: fix applied, GREEN

After adding the `refreshInstalled()` line and corrected comment:

```
PASS Backend src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts
    ✓ EMPTY arm: first call resolves to the fresh path, not "" (...) (2 ms)
    ✓ STALE arm: first call resolves to the fresh path, not the old one (...)

Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
```

Commit: `df3dc3de6` (test, born red) then `d3bc389d1` (fix, green).

### qop probe stayed green, its own prediction disavowed

`src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts` still
passes 1/1 (verbatim):

```
PASS Backend src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts
  getGameInfo(appName, forceReload=true) stale-map characterisation (quick 260912-qop)
    ✓ save_path from getGameInfo(appName, true) is STALE immediately after installed.json is rewritten on disk, and becomes fresh only after an explicit refreshInstalled() (characterisation of the getDefaultLegendarySavePath() readback defect) (2 ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
```

Its header comment was edited to record that its earlier "will flip to red" prediction about this
exact fix was wrong: the probe pins `getGameInfo` itself, which the fix does not touch (it adds a
call *before* `getGameInfo`, in `save_sync.ts`, not inside `library.ts`). Diff confirms the edit
is comment-only:

```
$ git diff --stat 358fbdc7d 52a47888d -- .../getGameInfoForceReloadStaleness.test.ts
 1 file changed, 11 insertions(+)
$ git diff 358fbdc7d 52a47888d -- .../getGameInfoForceReloadStaleness.test.ts | grep -E '^[+-][^+-]' | grep -vE '^\+\s*(//|\*)'
(no output -- zero non-comment lines changed)
```

Commit: `52a47888d` also carries this edit (bundled with the lint fix, since both touched only
test files and were verified together -- see commit list below).

## Task 3: negative control, gates, restore

### Negative control (fix line removed)

Temporarily removed `libraryManagerMap['legendary'].refreshInstalled()` from `save_sync.ts` and
reran the new test. Output is byte-identical to the Task 1 born-red capture -- same two failure
signatures, same line-accurate `Received` values:

```
FAIL Backend src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts
    ✕ EMPTY arm ... Expected: "/rvv/NEW-fresh-save-path"  Received: ""
    ✕ STALE arm ... Expected: "/rvv/NEW-fresh-save-path"  Received: "/rvv/OLD-stale-save-path"

Test Suites: 1 failed, 1 total
Tests:       2 failed, 2 total
```

This confirms the test is coupled to that one line, not to some other incidental change in the
same commit.

### Restored, GREEN again

Re-applied the exact same `refreshInstalled()` line and reran:

```
PASS Backend src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts
    ✓ EMPTY arm ...
    ✓ STALE arm ...

Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
```

`git diff -- src/backend/save_sync.ts` against the committed state was empty after restoring,
confirmed by `git diff df3dc3de6 d3bc389d1 -- src/backend/save_sync.ts` showing exactly the
diff quoted above (comment replacement + one new line) and nothing else.

### Scope gates (library.ts untouched, throughout)

```
$ git diff --stat 358fbdc7d 52a47888d -- src/backend/storeManagers/legendary/library.ts
(no output)
```

Empty at every checkpoint checked, including immediately after the negative-control restore.

### Lint: before / after, both ceilings

Before the lint-cleanup fix (2 new `@typescript-eslint/require-await` warnings from `async () =>`
functions with no `await` inside, both in the new test file):

```
✖ 1123 problems (0 errors, 1123 warnings)   [production]
✖ 640 problems (0 errors, 640 warnings)     [tests]
ESLint found too many warnings (maximum: 638).
production: PASS | tests: FAIL
```

Isolated via `npx eslint` against only the 3 changed/new files: 2 of the 4 warnings shown were the
new test file's `getSettings: async () => ({})` and `mockImplementation(async () => {...})`
(no `await` inside either); the other 2 (`save_sync.ts` lines 53/56, `no-unsafe-assignment` /
`no-unsafe-member-access`) were confirmed pre-existing, outside my diff's touched lines, and left
alone (out of scope per the deviation rules).

Fix: removed the unneeded `async` keyword from both functions in the test file, returning
`Promise.resolve(...)` directly instead. After:

```
✖ 1123 problems (0 errors, 1123 warnings)   [production -- unchanged]
✖ 638 problems (0 errors, 638 warnings)     [tests -- back to baseline]
production: PASS | tests: PASS
```

638 after = 640 (with my 2 unfixed warnings) minus 2 (fixed) = the pre-existing baseline exactly.
No ceiling was raised; the new test file contributes zero warnings.

Commit: `52a47888d` -- `test(quick-260912-rvv): drop unneeded async from two test stubs` (also
carries the qop-probe comment update, verified above to be comment-only).

### codecheck

`tsc --noEmit` -- clean, zero output, zero errors.

### Backend suite

Baseline (measured by the orchestrator at `358fbdc7d`, not re-derived, not attributed to this
change): `1 failed, 213 passed, 214 total` suites / `1 failed, 1 skipped, 4834 passed, 4836 total`
tests, sole failure `expirationAlerts.test.ts:441` (unrelated).

After this quick task (full run):

```
Test Suites: 1 failed, 214 passed, 215 total
Tests:       1 failed, 1 skipped, 4836 passed, 4838 total
```

Delta: +1 suite (the new test file), +2 tests (its two arms), same single pre-existing failure at
`expirationAlerts.test.ts:441` (verbatim, unrelated to this change, not fixed, not counted as a
regression introduced here):

```
Expected substring: not "7"
Received string: "Safe Title's Humble key now expires on 7/31/2026"
  at Object.<anonymous> (src/backend/humble/__tests__/expirationAlerts.test.ts:441:27)
```

No other suite regressed.

### planning-gates

`pnpm planning-gates` -- `11/11 planning gates passed.` (matches the orchestrator's measured
baseline; unchanged by this task).

### graphify

`graphify update .` run after the code change; regenerated `graph.html` as expected (deletion +
regeneration is normal per its own documented behaviour, not a defect).

## Commits (source only, explicit paths, no `gsd-sdk query commit`)

| Commit | Type | Message |
|---|---|---|
| `df3dc3de6` | test | `test(quick-260912-rvv): pin getDefaultSavePath("legendary") stale first-call readback` |
| `d3bc389d1` | fix | `fix(quick-260912-rvv): refresh installedGames before the save_path readback` |
| `52a47888d` | test | `test(quick-260912-rvv): drop unneeded async from two test stubs` |

None of these commits include the todo edit, this SUMMARY.md, `.planning/STATE.md`, or
`.planning/ROADMAP.md` -- those are left for the orchestrator, per commit discipline. No
foreign dirty paths (`.claude/skills/archify/`, the `260912-d84` quick dir, `skills-lock.json`,
the completed humble-keys todo) were touched or staged by this task.

## CLEANUP OWED

This fix stops the defect from **recurring**; it does not repair **damage already done**. Any game
config that already persisted `savesPath: ''` from a pre-fix run (i.e., a prior first-call
`getDefaultLegendarySavePath()` that returned `''` because of this exact staleness) keeps that
empty value on disk until the user re-triggers the save-path computation for that title. This fix
does not scan for or repair already-empty `savesPath` fields in existing configs -- that is a
separate, unscheduled cleanup, not covered by this quick task.

## Does this close the parent todo?

**No.** `.planning/todos/pending/2026-09-05-getdefaultsavepath-live-redrive-never-taken-against-a-real-legendary-title.md`
remains OPEN (frontmatter unchanged: `status: OPEN`, `severity: medium`, `platform: any`,
`ready: live-gate`). A new dated section was appended (not committed, per commit discipline)
recording that the code-side cause is now fixed and desk-proven with a verified negative control.
The todo's discharge condition is unchanged and is a LIVE gate: a live session against a real,
installed legendary title confirming the Cloud Saves Sync save-path field populates on the FIRST
call. This quick task took no live measurement -- only a live AFTER-run can satisfy that
condition. The 500ms `installedJsonWatcher` debounce race referenced in the todo is also still
unmeasured at the live-timing level; the fix comment documents why the watcher cannot substitute
for this explicit refresh (live evidence: its `refreshLibrary` push lands after the
"Unable to compute default save path" error on the very first read), but that documentation is
not itself a live measurement.

## Deviations from Plan

None outside the two explicitly-anticipated auto-fixes below, both within Rule 1 (bug) /
scope-bounded lint cleanup on files this task itself introduced:

**1. [Rule 1 - Bug] Removed 2 self-introduced `@typescript-eslint/require-await` warnings**
- **Found during:** Task 3, running `pnpm lint` gate.
- **Issue:** two `async` functions in the new test file (`getSettings` stub, `runRunnerCommand`
  mock implementation) had no `await` inside, pushing the "tests" lint ceiling from 638 to 640
  and flipping `tests: FAIL`.
- **Fix:** removed `async`, returned `Promise.resolve(...)` directly from both.
- **Files modified:** `src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts`
- **Commit:** `52a47888d`

## Self-Check: PASSED

- `src/backend/save_sync.ts` -- FOUND, diff matches quoted patch exactly.
- `src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts` -- FOUND.
- `src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts` --
  FOUND, comment-only diff confirmed (0 non-comment lines changed).
- `src/backend/storeManagers/legendary/library.ts` -- confirmed UNCHANGED (empty diff across the
  full commit range, rechecked after the negative-control restore).
- Commit `df3dc3de6` -- FOUND in `git log --oneline`.
- Commit `d3bc389d1` -- FOUND in `git log --oneline`.
- Commit `52a47888d` -- FOUND in `git log --oneline`.
- `.planning/todos/pending/2026-09-05-getdefaultsavepath-live-redrive-never-taken-against-a-real-legendary-title.md`
  -- FOUND, new dated section appended, frontmatter verified unchanged
  (`status: OPEN`, `severity: medium`, `platform: any`, `ready: live-gate`), file still in
  `pending/`, no new frontmatter keys added, edit NOT committed.
