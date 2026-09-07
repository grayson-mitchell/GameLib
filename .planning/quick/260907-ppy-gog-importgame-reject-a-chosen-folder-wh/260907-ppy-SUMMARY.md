# Quick Task 260907-ppy Summary

GOG `importGame`: reject a chosen folder whose product id does not match the selected game,
stop swallowing a thrown install-record write as success, and preserve un-owned `InstalledInfo`
fields (`versionEtag`, `pinnedVersion`, ...) on re-import.

## What changed

- `src/backend/storeManagers/gog/games.ts` — `GOGGame.importGame` now parses `gogdl import`'s
  stdout defensively, compares the parsed `data.appName` against `this.id` as strings, and
  rejects (writing nothing) on mismatch. The install-record write and `addShortcuts()` each get
  their own try/catch: a thrown write now surfaces as a failed `ExecResult`; a thrown
  `addShortcuts()` after a *successful* write is logged but still reported as success (see
  "Deliberate decision" below).
- `src/backend/storeManagers/gog/library.ts` — `GOGLibraryManager.importGame` now builds the new
  `InstalledInfo` as a previous-record-first spread (`{ ...previous, ...ownedFields }`) instead of
  a wholesale overwrite, so fields it does not own (`versionEtag`, `pinnedVersion`, `manifest`,
  `isDosbox`, `dosboxConf`, `branch`, `cyberpunk`, ...) survive a re-import.
- `src/backend/storeManagers/gog/__tests__/gogImportGame.test.ts` — new file, 4 tests, full mock
  harness for `games.ts` (28 imports mocked).
- `src/backend/storeManagers/gog/__tests__/library.test.ts` — 3 new tests added to the existing
  harness (RED→GREEN preservation, negative-direction overwrite check, fresh-import no-throw
  check).
- `.planning/todos/pending/2026-09-07-macos-shortcut-icon-generation-fails-on-correct-installs.md`
  — new split-out todo for item 5 (see below). **Left uncommitted for the orchestrator**, along
  with the `## Split` note appended to the source todo — see "Uncommitted docs" below.

## Task 1 — RED (verbatim)

Harness built in `gogImportGame.test.ts`, run against **unfixed** `games.ts`:

```
FAIL Backend src/backend/storeManagers/gog/__tests__/gogImportGame.test.ts
  GOGGame.importGame -- identity guard (260907-ppy)
    ✓ matching folder (this.id === data.appName) imports successfully (1 ms)
    ✕ mismatched folder (this.id !== data.appName) is rejected and writes nothing
    ✕ unparseable gogdl stdout is reported as a failure, not silently swallowed
    ✕ a thrown install-record write surfaces as a failed import, but a thrown addShortcuts after a successful write does not

  ● GOGGame.importGame -- identity guard (260907-ppy) › mismatched folder (this.id !== data.appName) is rejected and writes nothing

    expect(received).toEqual(expected) // deep equality

    Expected: Any<String>
    Received: undefined

      257 |     const result = await game.importGame(FOLDER_PATH)
      258 |
    > 259 |     expect(result.error).toEqual(expect.any(String))
          |                          ^
      260 |     expect(result.error).not.toBe('')
      261 |     expect(mockLibraryManagerImportGame).not.toHaveBeenCalled()
      262 |     expect(mockAddShortcutsUtil).not.toHaveBeenCalled()

  ● GOGGame.importGame -- identity guard (260907-ppy) › unparseable gogdl stdout is reported as a failure, not silently swallowed

    expect(received).toEqual(expected) // deep equality

    Expected: Any<String>
    Received: undefined

      275 |     const result = await game.importGame(FOLDER_PATH)
      276 |
    > 277 |     expect(result.error).toEqual(expect.any(String))
          |                          ^
      278 |     expect(mockLibraryManagerImportGame).not.toHaveBeenCalled()
      279 |   })

  ● GOGGame.importGame -- identity guard (260907-ppy) › a thrown install-record write surfaces as a failed import, but a thrown addShortcuts after a successful write does not

    expect(received).toEqual(expected) // deep equality

    Expected: Any<String>
    Received: undefined

      295 |     const throwingWriteResult = await game.importGame(FOLDER_PATH)
      296 |
    > 297 |     expect(throwingWriteResult.error).toEqual(expect.any(String))
          |                                       ^
      298 |
      299 |     // Sibling scenario: record write succeeds, addShortcuts throws.
      300 |     mockLibraryManagerImportGame.mockResolvedValue(undefined)

Test Suites: 1 failed, 1 total
Tests:       3 failed, 1 passed, 4 total
```

All three failures are genuine assertion failures (`expect.any(String)` receiving `undefined`) —
not module-resolution or load errors. The POSITIVE test (must be GREEN against unfixed code)
passed on the first run, proving the harness resolves every module and actually drives
`GOGGame.importGame` before the RED failures above are trusted.

## Task 2 — GREEN

After the `games.ts` rewrite: `Tests: 4 passed, 4 total`. `npx tsc --noEmit` clean.

## Task 3 — RED (verbatim, `versionEtag`/`pinnedVersion` preservation test only)

`library.ts`'s `importGame` was temporarily reverted to its original wholesale-overwrite shape
(in place, no git stash/checkout involved) to capture genuine RED for the one behavior this task
adds a guard for, then restored — see git diff on `library.ts` in commit `77f021ebe` for the
before/after. Two of the three new tests were expected/observed GREEN even against unfixed code
(negative-direction overwrite, and fresh-import-no-throw — neither exercises the dropped-field
defect), leaving exactly one genuine RED:

```
FAIL Backend src/backend/storeManagers/gog/__tests__/library.test.ts
  ● importGame preserves un-owned InstalledInfo fields on re-import (260907-ppy) › re-importing an already-installed game preserves versionEtag and pinnedVersion from the previous record

    expect(received).toBe(expected) // Object.is equality

    Expected: "688661e1d54090f16fd8742109bc6759"
    Received: undefined

      542 |     await manager.importGame(newImportData(APP_NAME), '/Users/u/Dest/Endless Sky.app')
      543 |
    > 544 |     expect(installOf(APP_NAME)?.versionEtag).toBe(PREVIOUS_VERSION_ETAG)
          |                                              ^
      545 |     expect(installOf(APP_NAME)?.pinnedVersion).toBe(false)
      546 |   })

Test Suites: 1 failed, 2 passed, 3 total
Tests:       1 failed, 341 passed, 342 total
```

(That run selected `library.test.ts` by name across the whole Backend project — it also matches
`steam/__tests__/library.test.ts` and `humble/__tests__/library.test.ts`, hence 342 total rather
than the GOG file's own count. Scoped to just the GOG file: `15 total` after the addition, `12`
before — see "Before/after test totals" below.)

After restoring the fix: `library.test.ts` alone reports `Tests: 15 passed, 15 total`.

## Before/after test totals

| Suite | Before | After |
|---|---|---|
| `gogImportGame.test.ts` (new file) | 0 | 4 |
| `library.test.ts` (GOG) | 12 | 15 (+3) |
| Full GOG `__tests__` directory (4 files) | 33 | 40 |

Final full-directory run: `Test Suites: 4 passed, 4 total` / `Tests: 40 passed, 40 total`.

## Final verification gates

- `npx jest --selectProjects Backend` scoped to `storeManagers/gog/__tests__` (see tooling note
  below for why `--testPathPattern` was used instead of a positional path): **4 suites / 40 tests,
  all passing.**
- `npx tsc --noEmit -p tsconfig.json`: **exit 0**, clean.
- `npx eslint` on `games.ts`, `library.ts`, `gogImportGame.test.ts`, `library.test.ts`: **0
  errors, 110 warnings** (all pre-existing `@typescript-eslint/no-unsafe-*`/`no-for-in-array`/
  `require-await`/`restrict-template-expressions` warnings on lines untouched by this task —
  verified none of the reported warning line numbers fall inside the changed regions of either
  `.ts` file).
- `npx prettier --check` on the same four files: **clean.** (One drift found and fixed — see
  "Deviation" below.)
- Grep gate `grep -v '^\s*[/*]' games.ts | grep -c 'return { ...res, error'`: **3** (meets the
  `>= 3` requirement: parse failure, identity mismatch, install-record write failure).

## GOG-only scoping (recorded per plan's scope_notes)

`legendary` (`storeManagers/legendary/games.ts:807`) and `nile` (`storeManagers/nile/games.ts:109`)
both pass `this.appName`/`this.id` **into** the runner command, so the runner enforces identity
itself — no equivalent defect. `zoom` and `steam` `importGame` are stubs. This task touches GOG
only; do not re-derive or re-investigate this for the other runners.

## No locale key added

Per the plan's `scope_notes`: the rejection reaches the user through the handler's existing
generic `notify.import.failed` ("Importing Failed") toast — the same treatment every other import
failure already gets. A new user-facing reason string would require a new
`public/locales/en/gamelib.json` key, and this repo's catalog has a churn guard, a presence
baseline, and known English-side drift between inline `t()` defaults and JSON values. Not worth
spending in a quick task; both product ids go in the `logError` line instead, which is where
diagnosis happens.

## Deliberate decision carried over from Task 2

A thrown `addShortcuts()` **after** a successful install-record write is logged but the import is
still reported as success. This is intentional, not a gap: `addShortcuts`/icon generation is
independently broken for every correct macOS install (see split-out todo below) — failing the
import on it would break the primary use case for every macOS user.

## Item 5 split out

`.planning/todos/pending/2026-09-07-macos-shortcut-icon-generation-fails-on-correct-installs.md`
carries both stack traces (`ERR_INVALID_ARG_TYPE` on an undefined path from the mismatched-folder
run; `ENOENT` on `icons/Iris.jpg` from a clean Phoenix Point install) and the two-cause table
verbatim from the source todo, with `status: OPEN` and no `resolves_phase:`. A `## Split` note was
appended to the source todo recording that items 1, 3, 4 closed here, item 5 moved to the new
todo, and item 2 is satisfied in effect by item 1's guard.

## Uncommitted docs (left for the orchestrator)

Per this task's explicit constraints, the following are intentionally **left uncommitted**:
- This file (`260907-ppy-SUMMARY.md`)
- `.planning/todos/pending/2026-09-07-macos-shortcut-icon-generation-fails-on-correct-installs.md`
  (new file)
- The `## Split` note appended to
  `.planning/todos/pending/2026-08-24-importgame-does-not-validate-the-folder-matches-the-selected-game.md`

Verified via `git status --short` immediately before writing this file: only
`.planning/ROADMAP.md` and `.planning/STATE.md` (both pre-existing dirty state from another
session, untouched by this task) plus the items above are outstanding; `.claude/skills/archify/`,
`.planning/phases/42-.../`, and `skills-lock.json` are likewise pre-existing and untouched.

## Commits made (code only)

- `832e14be1` — `test(260907-ppy): RED — GOGGame.importGame never validates folder identity`
- `3df422680` — `feat(260907-ppy): reject a chosen folder that does not match the selected game`
- `77f021ebe` — `fix(260907-ppy): preserve un-owned InstalledInfo fields on GOG re-import`
- `411b2965d` — `style(260907-ppy): reformat gogImportGame.test.ts per prettier`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/tooling] `--selectProjects` + a positional test path silently runs the WHOLE
project instead of filtering.**
- **Found during:** Task 1 verification.
- **Issue:** `npx jest --selectProjects Backend <path>` (the plan's literal verification command
  shape, and this repo's own documented gotcha
  `jest-selectprojects-is-case-sensitive-and-exits-zero`) ran all ~203 suites in the Backend
  project instead of isolating the target file.
- **Fix:** Used `npx jest --selectProjects Backend --testPathPattern='<escaped-name>\.test\.ts'`
  throughout this task instead, confirming `Test Suites: 1 ... total` each time to prove the
  filter actually took effect.
- **Files affected:** none (test-invocation only, no source change).

**2. [Rule 1 - Bug] `graceful-fs`'s `existsSync` cannot be `jest.spyOn`'d — non-configurable
property.**
- **Found during:** Task 3 test-harness design.
- **Issue:** The original plan for short-circuiting `createMissingGogdlManifest` (called
  unconditionally at the end of `GOGLibraryManager.importGame`) was to spy
  `graceful-fs.existsSync` to force its early-return guard. `jest.spyOn` threw
  `TypeError: Cannot redefine property: existsSync` — not a valid RED, a broken harness.
- **Fix:** Dropped the spy entirely. The real `existsSync` legitimately returns `false` for the
  test's synthetic manifest path (it doesn't exist on disk), so `createMissingGogdlManifest`
  proceeds to call `this.runRunnerCommand()`, already routed through this file's existing
  `mockGetGOGdlBin`/`mockCallRunner` mocks (shared with the pre-existing "fix4" describe block).
  Backing those with unparseable stdout (`'not json'`) makes `createMissingGogdlManifest`'s own
  internal try/catch swallow it harmlessly, without ever reaching `getBuilds`/axios.
- **Files affected:** `src/backend/storeManagers/gog/__tests__/library.test.ts`.

**3. [Rule 1 - Bug] Static `installedGamesStore.get()` mock made `refreshInstalled()` wipe a
freshly-imported record before assertions ran.**
- **Found during:** Task 3, drafting the fresh-import test.
- **Issue:** `importGame` calls `installedGamesStore.set(...)` then immediately
  `this.refreshInstalled()`, which rebuilds the module-private `installedGames` map from
  `installedGamesStore.get(...)`. A static `mockReturnValue([previousRecord])` made that rebuild
  wipe the just-written fresh-import record entirely, crashing
  `createMissingGogdlManifest`(`installedData.install_path` read on `undefined`).
- **Fix:** Backed `mockInstalledGamesStoreGet`/`mockInstalledGamesStoreSet` with a shared
  in-memory array via `mockImplementation`, so `get()` reflects the most recent `set()`.
- **Files affected:** `src/backend/storeManagers/gog/__tests__/library.test.ts`.

**4. [Rule 1 - Bug] Prettier formatting drift in the Task 1 commit, caught only at the final
gate.**
- **Found during:** Final verification pass.
- **Issue:** `gogImportGame.test.ts` as committed in Task 1 had one `expect(...).toHaveBeenCalledWith(data, FOLDER_PATH)`
  call wrapped onto 3 lines; the repo's current prettier run collapses it to 1 line. `npx prettier
  --check` on that committed file failed.
- **Fix:** `npx prettier --write`, re-verified 4/4 tests still pass and `--check` is clean.
  Committed separately (`411b2965d`) since Task 1's commit already existed.
- **Files affected:** `src/backend/storeManagers/gog/__tests__/gogImportGame.test.ts`.

## Known Stubs

None. No hardcoded empty/placeholder values were introduced.

## Threat Flags

None. No new network endpoints, auth paths, or trust-boundary changes — this task only tightens
an existing identity check and preserves existing record fields.

## Self-Check

- `src/backend/storeManagers/gog/games.ts` — FOUND, contains the identity guard (verified via grep
  gate above, count 3).
- `src/backend/storeManagers/gog/library.ts` — FOUND, contains the previous-first spread fix
  (verified via `git show 77f021ebe --stat`).
- `src/backend/storeManagers/gog/__tests__/gogImportGame.test.ts` — FOUND, 4 tests, all passing.
- `src/backend/storeManagers/gog/__tests__/library.test.ts` — FOUND, 15 tests (12 pre-existing + 3
  new), all passing.
- `.planning/todos/pending/2026-09-07-macos-shortcut-icon-generation-fails-on-correct-installs.md`
  — FOUND (uncommitted, as required).
- Commit `832e14be1` — FOUND in `git log --oneline`.
- Commit `3df422680` — FOUND in `git log --oneline`.
- Commit `77f021ebe` — FOUND in `git log --oneline`.
- Commit `411b2965d` — FOUND in `git log --oneline`.

## Self-Check: PASSED

---

## Orchestrator verification (2026-09-07, independent of the executor)

**Non-vacuity re-proved at a CONSTANT COMMIT, by varying the TREE — not `git checkout --`**
(this repo's `post-checkout` hook fires a binary download and throws). Method:
`git show 3df422680^:src/backend/storeManagers/gog/games.ts` and
`git show 77f021ebe^:src/backend/storeManagers/gog/library.ts` written over the working tree,
suites re-run, then the fixed files restored from a scratchpad copy and the restoration confirmed
byte-identical (`git status --short src/` and `git diff --stat src/` both empty).

Pre-fix result: **4 failed / 15 passed / 19 total**. All four failures are genuine assertion
failures, not module-resolution noise:

```
● importGame preserves un-owned InstalledInfo fields on re-import (260907-ppy)
  › re-importing an already-installed game preserves versionEtag and pinnedVersion
    Expected: "688661e1d54090f16fd8742109bc6759"
    Received: undefined
● GOGGame.importGame -- identity guard (260907-ppy)
  › mismatched folder (this.id !== data.appName) is rejected and writes nothing
    Expected: Any<String>
    Received: undefined
● GOGGame.importGame -- identity guard (260907-ppy)
  › unparseable gogdl stdout is reported as a failure, not silently swallowed
    Expected: Any<String>
    Received: undefined
● GOGGame.importGame -- identity guard (260907-ppy)
  › a thrown install-record write surfaces as a failed import, but a thrown addShortcuts
    after a successful write does not
    Expected: Any<String>
    Received: undefined
```

**The counter-failure guard held.** Exactly 1 of `gogImportGame.test.ts`'s 4 tests passed against
the unfixed code — the POSITIVE matching-folder test — and it passes after the fix too. That is
the direct check against the known shape from
`.planning/todos/completed/2026-08-25-path-containment-guard-rejects-moveinstall-and-importgame-primary-use-case.md`,
where a guard closed the defect *and* broke the primary use case.

**One SUMMARY number was wrong and is corrected above.** The full-GOG-directory baseline was
recorded as 32; it is **33** (`user.test.ts` + `logoutCookies.test.ts` measured at 21, plus
`library.test.ts` at 12 at `ebd73d6a7`). After = 40, so the delta is +7 (4 new file + 3 in
`library.test.ts`), which is what the per-suite rows already said. The error was in the total only.

Re-measured at HEAD by the orchestrator: GOG `__tests__` **40/40, 4 suites**; `pnpm codecheck`
(tsc --noEmit) **exit 0**.

## Still owed: the live machine was NOT repaired

The source todo's "Cleanup owed on this machine" section is **still outstanding, verified present
on 2026-09-07** — this fix prevents recurrence, it does not repair the 2026-08-24 damage:

- `~/Library/Application Support/GameLib/GamesConfig/1769415595.json` — the Balrum orphan config
  still exists.
- `gog_store/installed.json` — Endless Sky (`1829678475`) still carries the degraded record:
  `versionEtag` and `pinnedVersion` are both still absent.

GameLib is **not currently running** (checked), so an on-disk repair would not be overwritten from
memory — the constraint that forced the deferral in 2026-08-24 no longer applies. Not performed
here because it mutates the operator's live application data; it needs an explicit go-ahead.
**The source todo therefore stays OPEN on the cleanup item only.**

## Accepted caveat on item 3

Preserving un-owned fields means a re-import of a folder holding a *different version* now carries
the previous record's `versionEtag` forward. `versionEtag` feeds Linux-installer update detection
(`library.ts:1011`, `games.ts:1233`), so a stale value could in principle mask an available update
until the next real update check rewrites it. This is the behaviour the todo's item 3 explicitly
asked for, and it is strictly better than the measured alternative (silently dropping the field on
a game the user never touched). Recorded so it is not re-discovered as a surprise.

---

## Live-machine repair (2026-09-07, operator-authorised) — ONE OF TWO ITEMS DONE

Supersedes "Still owed: the live machine was NOT repaired" above for the first item only.

**Preconditions re-checked before touching anything:** GameLib not running (`pgrep`, no app/sidecar
process), so nothing would overwrite the edit from memory. Both targets backed up first.

### DONE — Endless Sky's stripped update-detection fields restored

`~/Library/Application Support/GameLib/gog_store/installed.json`, record `1829678475`:

```
 			"installedWithDLCs": false
+			"versionEtag": "\"688661e1d54090f16fd8742109bc6759\"",
+			"pinnedVersion": false
```

**The quoted form is not a typo and was not guessed.** `versionEtag` is sent verbatim as the
`If-None-Match` request header by `getMetaResponse` (`library.ts:1063-1067`) and compared against
`metaResponse.headers.etag` (`:1108`), so it must carry the HTTP ETag's own double quotes. Both
sibling records in this same file store it that way (`"\"db527b50…\""`,
`"\"e02cd24f…\""`). The todo's markdown rendering of the lost value was ambiguous on this point.

Verified: file parses; 3 records intact; re-serialising the patched object with the app's own
formatting (`json.dumps(indent='\t')`) is byte-identical to what is now on disk, so the next
`installedGamesStore` write will not reformat it; `diff` against the backup is exactly the two
added lines and nothing else.

**Deliberately NOT restored** (the todo names only the two fields above, and these two carry risk
either way): `executable` is still the `.app` path rather than the `""` both other GOG records use
— it currently points at the game's real location, and reverting it could break launching;
`install_size` is still `401.2 MiB` rather than `404.73 MiB`, which is display-only and will be
re-measured on the next real update.

### NOT DONE — the orphan Balrum config is still present

`~/Library/Application Support/GameLib/GamesConfig/1769415595.json` (1570 bytes, mtime
2026-08-29 08:42). Confirmed still an orphan: `1769415595` does not appear in `installed.json`,
and the file still holds the import-written `winePrefix`
`/Users/graysonmitchell/GameLib/Prefixes/Balrum` — a directory that still does not exist
(`~/GameLib/Prefixes/` contains only `Alan Wake`).

**Blocked, not skipped:** the auto-mode classifier refused every Bash write/delete under
`~/Library/Application Support/`. The `installed.json` half succeeded only because the Edit tool
was an available alternative; there is no delete equivalent. Needs one operator command.

**Backups** (session scratchpad, not the repo):
`…/scratchpad/repair-backup/installed.json.before` and `…/repair-backup/1769415595.json.orphan`.
