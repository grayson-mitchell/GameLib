---
quick_id: 260907-ppy
type: execute
mode: quick
title: "GOG importGame: reject a chosen folder whose product id does not match the selected game"
source_todo: .planning/todos/pending/2026-08-24-importgame-does-not-validate-the-folder-matches-the-selected-game.md
files_modified:
  - src/backend/storeManagers/gog/games.ts
  - src/backend/storeManagers/gog/library.ts
  - src/backend/storeManagers/gog/__tests__/gogImportGame.test.ts
  - src/backend/storeManagers/gog/__tests__/library.test.ts
  - .planning/todos/pending/2026-09-07-macos-shortcut-icon-generation-fails-on-correct-installs.md
autonomous: true
must_haves:
  truths:
    - "Selecting game A and pointing importGame at a folder containing game B produces a reported FAILURE, and writes no install record, no config, no shortcuts."
    - "Selecting game A and pointing importGame at game A's own folder still imports successfully: install record written, shortcuts added, 'Game Imported' notification fires."
    - "A thrown failure from the install-record write reaches the user as a failed import instead of being logged and reported as success."
    - "Re-importing an already-installed game does not drop versionEtag or pinnedVersion from its install record."
  artifacts:
    - path: src/backend/storeManagers/gog/__tests__/gogImportGame.test.ts
      provides: "Wiring tests for GOGGame.importGame, both directions"
    - path: .planning/todos/pending/2026-09-07-macos-shortcut-icon-generation-fails-on-correct-installs.md
      provides: "Split-out todo for item 5 so it survives closure of the source todo"
  key_links:
    - from: src/backend/storeManagers/gog/games.ts
      to: "ExecResult.error"
      via: "mismatch returns an error-shaped ExecResult so the existing handler failure path runs"
---

<objective>
Close items 1, 3 and 4 of the 2026-08-24 `importGame` todo.

`GOGGame.importGame(folderPath)` runs `gogdl import <folderPath>` with **no app-id argument**
and never compares the product id gogdl reports against `this.id`. `GOGLibraryManager.importGame`
then keys `installedGames` / `installed.json` on the **folder's** product id while the caller's
config write, wine prefix, shortcuts, notification and log line all use `this.id`. The live
evidence: selecting Balrum (`1769415595`) and pointing at an Endless Sky folder
(`1829678475`) wrote Endless Sky's install record, Balrum's orphan `GamesConfig/1769415595.json`,
and a **success** toast.

Purpose: make a mismatched folder a clean, reported failure that writes nothing; stop a thrown
import failure from being reported as success; stop the install-record rewrite from silently
dropping fields it does not own.

Output: a guard + honest error propagation in `games.ts`, field preservation in `library.ts`,
tests proving both directions, and a split-out todo for the macOS icon defect.
</objective>

<scope_notes>

**GOG is the only affected runner — do not widen.** `legendary`
(`storeManagers/legendary/games.ts:807`) and `nile` (`storeManagers/nile/games.ts:109`) both pass
`this.appName` / `this.id` **into** the runner command, so the runner enforces identity itself.
`zoom` and `steam` `importGame` are stubs. This task touches GOG only. Record this finding in the
SUMMARY so nobody re-derives it.

**No handler change is needed and none is permitted here.** The IPC handler at
`src/backend/sidecar/installFlowRegistration.ts:502` already destructures
`const { abort, error } = await ...importGame(path, platform)` and, when `error` is truthy, calls
`abortMessage()` (notify "Importing Failed" + status `done`) and returns **before** the
`winePrefix` config write and **before** the "Game Imported" notification. It also wraps the call
in `try/catch` with the same `abortMessage()`. So expressing the rejection as a returned
`ExecResult` with `error` set simultaneously kills the orphan `GamesConfig/<id>.json` and the false
success toast, with zero handler edits.

**No new user-visible string, deliberately.** The rejection reaches the user through the handler's
existing generic `notify.import.failed` ("Importing Failed") toast — the same treatment every other
import failure already gets. The defect being fixed is *silent corruption reported as success*;
converting it into a correctly-reported failure is the fix. A specific user-facing *reason* string
would require a new `public/locales/en/gamelib.json` key, and this repo's catalog has a churn
guard, a presence baseline, and known English-side drift between inline `t()` defaults and JSON
values (`installFlows.pathRejectedBodyImport` already differs between source and catalog). That is
not worth spending in a quick task. **Do not add a locale key.** Both product ids go in the
`logError` line, which is where diagnosis happens. If a nicer message is wanted later it is a
separate UX task — note that in the SUMMARY.

**Item 5 is OUT and must be split out, not dropped.** The `getIcon` / icns failures are proven
INDEPENDENT by the todo itself: the same pair fires on a clean, correct Phoenix Point install, and
the two observed runs have DIFFERENT proximate causes (`ERR_INVALID_ARG_TYPE` — `path` was
`undefined` — vs `ENOENT` on `icons/Iris.jpg`). Task 3 files it as its own pending todo.

</scope_notes>

<context>
@.planning/todos/pending/2026-08-24-importgame-does-not-validate-the-folder-matches-the-selected-game.md
@src/backend/storeManagers/gog/games.ts
@src/backend/storeManagers/gog/library.ts
@src/backend/storeManagers/gog/__tests__/library.test.ts
</context>

<interfaces>
<!-- Extracted at HEAD. Use directly; no exploration needed. -->

`src/common/types.ts:170`
```
export type ExecResult = {
  stderr: string
  stdout: string
  fullCommand?: string
  error?: string
  abort?: boolean
}
```

`src/common/types.ts:507` — `GOGImportData` (gogdl's parsed stdout). `data.appName` is the
**folder's** product id.

`src/common/types.ts:361` — `InstalledInfo`. Fields the import legitimately owns:
`appName`, `install_path`, `executable`, `install_size`, `is_dlc`, `version`, `platform`,
`buildId`, `language`, `installedDLCs`, `installedWithDLCs`. Fields it does **not** own and must
not drop: `manifest`, `isDosbox`, `dosboxConf`, `versionEtag`, `branch`, `pinnedVersion`,
`cyberpunk` (and any other optional field present on the previous record).

`src/backend/storeManagers/gog/library.ts:68` — `const installedGames: Map<string, InstalledInfo>`
is module-private; `library.ts:878 refreshInstalled()` rebuilds it from
`installedGamesStore.get('installed', [])`.

Current `GOGGame.importGame` (`src/backend/storeManagers/gog/games.ts:204-233`) — the whole defect
in one block: `runRunnerCommand(['import', folderPath])`, early-return on `abort` / `error`, then
```
try {
  await libraryManagerMap['gog'].importGame(JSON.parse(res.stdout), folderPath)
  this.addShortcuts()          // floating promise, never awaited
} catch (error) {
  logError([...], LogPrefix.Gog)   // swallowed
}
return res                        // still success-shaped
```
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED — build the GOGGame.importGame test harness and prove the defect</name>
  <files>src/backend/storeManagers/gog/__tests__/gogImportGame.test.ts</files>
  <behavior>
    Four tests. Write them ALL before touching production code.

    1. POSITIVE (must be GREEN against unfixed code): `this.id === data.appName`.
       `libraryManagerMap['gog'].importGame` is called once with the parsed data and the folder
       path; `addShortcuts` is called; the returned `ExecResult` has no `error` and no `abort`.
    2. MISMATCH (must be RED): `this.id = '1769415595'`, gogdl stdout reports
       `appName: '1829678475'`. Assert (a) the returned `ExecResult.error` is a non-empty string,
       (b) `libraryManagerMap['gog'].importGame` was NOT called, (c) `addShortcuts` was NOT called.
    3. UNPARSEABLE STDOUT (must be RED): `res.stdout` is `'not json'`. Assert the returned
       `ExecResult.error` is set and `libraryManagerMap['gog'].importGame` was not called.
       (Today `JSON.parse` throws, the catch logs, and a success-shaped `res` is returned.)
    4. THROWN INSTALL-RECORD WRITE (must be RED): `libraryManagerMap['gog'].importGame` rejects.
       Assert the returned `ExecResult.error` is set (the failure reaches the user).
       Also assert the sibling: when `addShortcuts` rejects but the record write SUCCEEDED, the
       returned result has NO `error` — a shortcut failure after a correct install is not a failed
       import. This half is expected GREEN-by-accident today; keep it, it is the regression pin for
       Task 2.
  </behavior>
  <action>
Create `src/backend/storeManagers/gog/__tests__/gogImportGame.test.ts`. This is a jest harness for
`src/backend/storeManagers/gog/games.ts`, which has ~28 import statements — mock aggressively.

Mirror the mock strategy already proven in `src/backend/storeManagers/gog/__tests__/library.test.ts`
(read it first): `resetMocks: true` is set in `src/backend/jest.config.js`, so every mock
implementation must be re-established in `beforeEach`. Declare `jest.mock` factories with
`mockX = jest.fn()` consts hoisted above them, exactly as that file does.

Minimum mock surface for `../games`:
- `jest.mock('../..', () => ({ libraryManagerMap: { gog: { runRunnerCommand: ..., importGame: ..., getGameInfo: ... } } }))` — this is the `import { libraryManagerMap } from '..'` at `games.ts:1`.
- `backend/logger` (logInfo/logError/logWarning/logDebug/LogPrefix/createGameLogWriter/getRunnerLogWriter)
- `../electronStores`, `../constants`, `../redist`, `../user`, `../setup`
- `../../game_config`, `../../config`, `../../utils`, `../../launcher`, `../../ipc`,
  `../../dialog/dialog`, `../../shortcuts/shortcuts/shortcuts`,
  `../../shortcuts/nonesteamgame/nonesteamgame`
- `i18next` (`{ t: (k, d) => d }`), `axios`, `graceful-fs`, `fs/promises`, `ini`, `shlex`,
  `child_process`, `backend/online_monitor`, `backend/constants/environment`,
  `backend/constants/paths`, `backend/utils/compatibility_layers`,
  `backend/wiki_game_info/umu/utils`, `backend/longLivedChildren`

Add mocks one at a time until the file loads. **Getting the harness to load is Task 1's real
cost — budget for it.** Do not shortcut it by testing a pure helper only: this project has a
recorded failure shape where the pure half was tested and the wired half was dead
(`suite-tests-the-pure-half-cli-half-cannot-run`). The wiring in `GOGGame.importGame` is exactly
what must be pinned.

For `addShortcuts`: it is a method on `GOGGame` that delegates to `addShortcutsUtil` from
`../../shortcuts/shortcuts/shortcuts`. Spy on the util mock rather than patching the instance, so
the test observes the real call path.

**Order of work, and the RED evidence this task must produce:**
1. Get test 1 (POSITIVE) passing against UNFIXED code first. This is the load-bearing step: it
   proves the harness resolves every module and actually drives `GOGGame.importGame`. Only then
   are tests 2-4's failures trustworthy.
2. Run all four. Record the verbatim failure output for tests 2, 3 and 4 in the SUMMARY.
   **Expected failure kind: genuine assertion failures**, e.g.
   `expect(received).toEqual(expect.any(String)) — Received: undefined` for `result.error`, and
   `expect(jest.fn()).not.toHaveBeenCalled() — Number of calls: 1` for the install-record write.
   A module-resolution error, a `Cannot read properties of undefined`, or a "0 calls" error on a
   mock that was never wired is NOT a valid RED — it means the harness is broken, not the code.
   If you see one, fix the harness and re-run before declaring RED.
3. Do NOT modify `games.ts` in this task.
  </action>
  <verify>
    <automated>npx jest --selectProjects Backend src/backend/storeManagers/gog/__tests__/gogImportGame.test.ts 2>&1 | tail -40</automated>
  </verify>
  <done>
Test file exists with 4 tests. Run reports exactly 1 passed (the POSITIVE test) and 3 failed.
Test-count assertion: the run must report `Tests: 3 failed, 1 passed, 4 total` — `--selectProjects`
can exit 0 having matched nothing (`jest-selectprojects-is-case-sensitive-and-exits-zero`), so a
run reporting 0 total is a FAILURE of this task, not a pass. The three failure messages are
recorded verbatim in the SUMMARY and each is an assertion failure, not a load error.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN — reject the mismatch and stop swallowing import failures</name>
  <files>src/backend/storeManagers/gog/games.ts</files>
  <behavior>All four tests from Task 1 pass, including the POSITIVE one unchanged.</behavior>
  <action>
Rewrite `GOGGame.importGame` (`src/backend/storeManagers/gog/games.ts:204-233`). Keep the existing
`runRunnerCommand` call and the `res.abort` / `res.error` early returns as they are. Then:

1. **Parse defensively.** Wrap `JSON.parse(res.stdout)` in its own try/catch. On a parse failure,
   `logError` and `return { ...res, error: <message> }` — an unparseable gogdl payload must not
   report success.

2. **Reject the mismatch (item 1, non-negotiable).** After a successful parse, compare the parsed
   `GOGImportData.appName` against `this.id`. Compare as strings (`String(x)`) — GOG product ids
   are numeric-looking strings and a loose comparison here would be a silent trap. On mismatch:
   - `logError` a line naming BOTH ids and identifying which is which, e.g.
     `Refusing to import: the chosen folder contains GOG product ${data.appName}, but the selected game is ${this.id}`,
     with `LogPrefix.Gog`.
   - `return { ...res, error: <that same message> }`.
   - Write NOTHING: do not call `libraryManagerMap['gog'].importGame`, do not call
     `this.addShortcuts()`. Returning `error` is what makes the handler skip the config write and
     the success toast — see `<scope_notes>`.
   Add a short comment above the guard citing this quick task id (`260907-ppy`) and the fact that
   `gogdl import` takes no app-id argument, so this is the only place identity can be enforced.

3. **Split the swallowing try/catch in two (item 4).**
   - The install-record write gets its own try/catch: on throw, `logError` AND
     `return { ...res, error: <message> }` so the failure reaches the user. Today it is logged and
     a success-shaped `res` is returned — that is the third defect in the todo.
   - `this.addShortcuts()` gets its own `await` (it is currently a floating promise) inside its own
     try/catch. On throw: `logError` with a distinct message that plainly says the game imported
     but shortcut creation failed — and then **still return the success-shaped `res`**.
     A shortcut failure after a CORRECT install must not be reported as a failed import. This is a
     deliberate decision, not an oversight: the todo proves macOS shortcut generation is currently
     broken for *every* correct install too, so failing the import on it would break the primary
     use case. Leave a comment stating this and pointing at the todo Task 3 files.

Do not change the method signature or its `Promise<ExecResult>` return type. Do not touch the IPC
handler. Do not add a locale key.

Known failure shape to avoid: a guard that also breaks the primary use case
(`.planning/todos/completed/2026-08-25-path-containment-guard-rejects-moveinstall-and-importgame-primary-use-case.md`).
The POSITIVE test is the pin — if it goes red, the guard is wrong, not the test.
  </action>
  <verify>
    <automated>npx jest --selectProjects Backend src/backend/storeManagers/gog/__tests__/gogImportGame.test.ts 2>&1 | tail -20</automated>
  </verify>
  <done>
Run reports `Tests: 4 passed, 4 total`, 0 failed. A run reporting fewer than 4 total is a failure
of this task. `npx tsc --noEmit -p tsconfig.json` is clean for `games.ts` (no new type errors).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: preserve un-owned install-record fields, and split out the macOS icon defect</name>
  <files>src/backend/storeManagers/gog/library.ts, src/backend/storeManagers/gog/__tests__/library.test.ts, .planning/todos/pending/2026-09-07-macos-shortcut-icon-generation-fails-on-correct-installs.md</files>
  <behavior>
    In `library.test.ts` (the harness already exists there — do NOT build a new one):

    1. RED then GREEN: `installedGamesStore` already holds a record for `1829678475` carrying
       `versionEtag: '688661e1d54090f16fd8742109bc6759'` and `pinnedVersion: false`. Call
       `GOGLibraryManager.importGame(data, path)` for that same appName. Assert the record written
       via `installedGamesStore.set('installed', ...)` STILL carries both fields.
       Expected RED: `expect(record.versionEtag).toBe('688661e1d54090f16fd8742109bc6759')` receiving
       `undefined` — a genuine assertion failure. Record it verbatim.
    2. NEGATIVE DIRECTION: the import-owned fields are still overwritten — assert the written record
       carries the NEW `version`, `buildId`, `platform`, `install_path`, `executable` and
       `installedDLCs` from `data`, not the previous record's values. Preservation must not become
       staleness.
    3. FRESH IMPORT: an appName with no previous record still produces a complete `InstalledInfo`
       and does not throw.
  </behavior>
  <action>
**Part A — `src/backend/storeManagers/gog/library.ts:936 importGame`.** It builds a fresh
`InstalledInfo` and overwrites the previous record wholesale. The live evidence shows `versionEtag`
and `pinnedVersion` silently dropped, degrading update detection for a game the user never touched.

Read the previous record from the module-private `installedGames` map
(`installedGames.get(data.appName)`) BEFORE constructing the new one, then build the new record as
previous-first spread with the import-owned fields on top:
`const installInfo: InstalledInfo = { ...previous, appName: ..., install_path: ..., /* etc */ }`.
Spreading `undefined` is legal, so the fresh-import path needs no branch. The owned-vs-un-owned
field split is enumerated in `<interfaces>` above — do not widen it.

On `versionEtag` specifically: preserving a possibly-older etag is the fail-SAFE direction. A stale
`If-None-Match` yields a 200 from GOG and an update is reported; dropping the field entirely is
what breaks detection. Do not "helpfully" clear it.

Add a comment citing quick task `260907-ppy` and the dropped-field evidence.

**Part B — file the split-out todo.** Create
`.planning/todos/pending/2026-09-07-macos-shortcut-icon-generation-fails-on-correct-installs.md`
with the same frontmatter shape as the source todo (`created`, `title`, `area`, `status: OPEN`,
`severity`, `files`). Carry across, verbatim, item 5's evidence from the source todo: both stack
traces, the fact that the SAME pair fires on a clean correct Phoenix Point install
(2026-08-24 22:26:55), and the table showing the two DIFFERENT proximate causes
(`ERR_INVALID_ARG_TYPE` — `path` undefined — vs `ENOENT` on `icons/Iris.jpg`). State that a fix
targeting one will not close the other, and that Task 2 of this quick task deliberately logs rather
than fails the import on shortcut errors *because* this is broken for correct installs too. No
`resolves_phase:`.

Then append a `## Split` note to the SOURCE todo
(`.planning/todos/pending/2026-08-24-importgame-does-not-validate-the-folder-matches-the-selected-game.md`)
recording that items 1, 3 and 4 were closed by quick task `260907-ppy`, that item 5 moved to the new
todo (name the file), and that item 2 ("derive from ONE resolved identity") is satisfied in effect
by item 1's guard — after the guard, `data.appName` and `this.id` are provably equal, so the two
identities cannot diverge. Do not close the source todo in this task; leave that to the operator.
  </action>
  <verify>
    <automated>npx jest --selectProjects Backend src/backend/storeManagers/gog/__tests__/library.test.ts 2>&1 | tail -20 && ls .planning/todos/pending/2026-09-07-macos-shortcut-icon-generation-fails-on-correct-installs.md</automated>
  </verify>
  <done>
`library.test.ts` passes with 3 more tests than at HEAD (state the before/after total in the
SUMMARY; a run reporting the same total as HEAD means the new tests were not collected). The
RED message for the `versionEtag` assertion is recorded verbatim in the SUMMARY. The new todo file
exists and carries both stack traces and the two-cause table. The source todo has a `## Split` note.
  </done>
</task>

</tasks>

<verification>
Run the whole GOG suite plus a typecheck, as separate commands (a `&&`-chained jest immediately
after a file write can read a stale module — `jest-in-the-same-command-as-a-write-reads-stale`):

```
npx jest --selectProjects Backend src/backend/storeManagers/gog/__tests__
npx tsc --noEmit -p tsconfig.json
npx eslint src/backend/storeManagers/gog/games.ts src/backend/storeManagers/gog/library.ts src/backend/storeManagers/gog/__tests__/gogImportGame.test.ts
npx prettier --check src/backend/storeManagers/gog/games.ts src/backend/storeManagers/gog/library.ts src/backend/storeManagers/gog/__tests__/gogImportGame.test.ts
```

Assert the jest run's total test count, not just its exit code.

Grep gate — the guard must actually be wired, not just present in a comment. Strip comments before
counting (`raw-source-gate-is-satisfied-by-the-prose-that-names-it`):

```
grep -v '^\s*[/*]' src/backend/storeManagers/gog/games.ts | grep -c 'return { ...res, error'
```
must be >= 3 (parse failure, identity mismatch, install-record write failure).
</verification>

<success_criteria>
- A mismatched folder returns `ExecResult` with `error` set, writes no install record and no
  shortcuts, and the existing handler turns it into "Importing Failed" with status `done` —
  no orphan `GamesConfig/<id>.json`, no success toast.
- A MATCHING folder still imports successfully end to end: install record written, shortcuts
  called, no `error` on the result. Pinned by a test that was GREEN before the fix and is GREEN
  after.
- An unparseable gogdl payload and a thrown install-record write both surface as failures.
- A shortcut failure after a correct install is logged, not reported as a failed import.
- Re-importing an already-installed game preserves `versionEtag` and `pinnedVersion` while still
  refreshing the import-owned fields.
- Item 5 lives on in its own pending todo; the source todo records the split.
</success_criteria>

<output>
Create `.planning/quick/260907-ppy-gog-importgame-reject-a-chosen-folder-wh/260907-ppy-SUMMARY.md`
when done. It MUST contain: the verbatim RED failure messages from Task 1 (3) and Task 3 (1); the
before/after test totals for both suites; the GOG-only scoping finding; and the note that no locale
key was added, with the reason.
</output>
