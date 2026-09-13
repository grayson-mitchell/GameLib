---
phase: quick-260912-rvv
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: ['QT-260912-rvv']
files_modified:
  - src/backend/save_sync.ts
  - src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts
  - src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts
  - .planning/todos/pending/2026-09-05-getdefaultsavepath-live-redrive-never-taken-against-a-real-legendary-title.md
  - .planning/quick/260912-rvv-refresh-installed-before-savepath-read/260912-rvv-SUMMARY.md

must_haves:
  truths:
    - 'A NEW jest regression test drives the exported `getDefaultSavePath(appName, "legendary", [])` and proves the FIRST call returns the save path that `legendary sync-saves --accept-path` just wrote, not a stale/empty one.'
    - 'The `runRunnerCommand` stub WRITES a fresh `save_path` into the fixture `installed.json` as its side effect — exactly what `sync-saves --accept-path` does. Per CONTEXT decision "This fix needs its OWN regression test": a stub that does not write the file makes the test vacuous and it would pass with OR without the fix.'
    - 'The test uses the REAL `LegendaryLibraryManager.getGameInfo` and the REAL `refreshInstalled` (only `runRunnerCommand` and `getGame` are stubbed), so the stale-map mechanism the fix addresses is actually exercised rather than simulated by a mock.'
    - 'Two arms: the EMPTY arm (map holds `save_path: null`, mirrors the live evidence where the UI persisted `savesPath: ""`) and the STALE arm (map holds a non-empty OLD sentinel) — so the test cannot pass merely because an absent record trivially reads as absent.'
    - 'Anti-vacuity controls hold inside the test: the stub is asserted to have been CALLED with `sync-saves` + `--accept-path`; a write-through control proves the NEW value really reached disk; a sentinel-distinctness guard; and a trap guard proving the manager resolves a real, fully-loaded record (defined, correct title) so neither arm can pass on an `undefined` GameInfo.'
    - 'Per CONTEXT decision "The fix goes in save_sync.ts, not library.ts": `src/backend/storeManagers/legendary/library.ts` is byte-identical to HEAD after the work, proven by an empty `git diff` scope gate.'
    - 'Per CONTEXT decision "The existing characterisation probe stays GREEN": `getGameInfoForceReloadStaleness.test.ts` remains GREEN and is modified ONLY by a header-comment note. If it goes red, work STOPS and the cause is investigated rather than the test adjusted.'
    - 'Per CONTEXT decision "Negative control is required again": the `refreshInstalled()` line is removed, the new test is observed FAILING with its required signatures (EMPTY arm `Received: ""`, STALE arm `Received: "/rvv/OLD-stale-save-path"`, `Tests: 2 failed`), then restored and re-observed green — with verbatim output captured in the summary.'
    - 'The false-assumption comment at `save_sync.ts:86-87` ("Legendary will have saved this path in `installed.json` (so the GameInfo)") is corrected — it is the exact wrong belief that produced this defect.'
    - 'No `eslint-disable` is added and the two `pnpm lint` COUNTS do not rise (the tests ceiling has ZERO headroom repo-wide); ceilings are not raised.'
    - 'The summary records that this fix stops RECURRENCE but does not repair DAMAGE: any game config already carrying `savesPath: ""` from a pre-fix run keeps it until the computation is re-triggered. Cleanup owed, named not silently absorbed.'
    - 'The summary records that this does NOT close the parent todo — a LIVE AFTER-run does. The todo stays in `pending/` with `ready: live-gate` and its frontmatter unchanged.'
  artifacts:
    - path: 'src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts'
      provides: 'Regression test proving getDefaultSavePath returns the fresh save path on the FIRST call, with a file-writing runRunnerCommand stub and four anti-vacuity controls'
      contains: 'refreshInstalled'
      min_lines: 140
    - path: 'src/backend/save_sync.ts'
      provides: 'refreshInstalled() call immediately before the getGameInfo readback, plus the corrected comment'
      contains: 'refreshInstalled'
  key_links:
    - from: 'src/backend/save_sync.ts'
      to: 'src/backend/storeManagers/legendary/library.ts'
      via: "libraryManagerMap['legendary'].refreshInstalled() before the getGameInfo(appName, true) readback"
      pattern: "libraryManagerMap\\[\\s*'legendary'\\s*\\]\\s*\\.?\\s*[\\n\\s]*refreshInstalled\\(\\)"
    - from: 'src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts'
      to: 'src/backend/save_sync.ts'
      via: 'real (unmocked) import of the function under test'
      pattern: "from '\\.\\./save_sync'"
    - from: 'src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts'
      to: 'src/backend/storeManagers/legendary/library.ts'
      via: 'jest.mock factory injecting a REAL LegendaryLibraryManager into libraryManagerMap via jest.requireActual'
      pattern: 'requireActual'
---

<objective>
FIX the defect measured twice (desk + live) by quick `260912-qop`: `getDefaultLegendarySavePath()`
runs `legendary sync-saves --accept-path` (which rewrites `save_path` into `installed.json` on
disk) and immediately reads it back via `getGameInfo(appName, true)` with nothing refreshing the
module-scope `installedGames` map in between — so the Cloud Saves Sync save-path field is left
EMPTY on the first call.

The production change is ONE line plus a corrected comment. **The hard part is the regression
test, and it is the part most likely to be faked.**

Purpose: make the first call correct, and leave behind a test that genuinely fails without the fix.
Output: the one-line fix in `save_sync.ts`, a new regression test with a file-writing stub and four
anti-vacuity controls, a recorded revert/restore negative control, and a summary.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/260912-rvv-refresh-installed-before-savepath-read/260912-rvv-CONTEXT.md
@.planning/quick/260912-qop-getgameinfo-forcereload-stale-map/260912-qop-SUMMARY.md
@src/backend/save_sync.ts
@src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts
@.planning/todos/pending/2026-09-05-getdefaultsavepath-live-redrive-never-taken-against-a-real-legendary-title.md

Read these two with `graphify query` first if any further orientation is needed
(`graphify-out/graph.json` exists; project rule). CONTEXT.md already carries exact anchors — use
them directly rather than re-deriving.
</context>

<interfaces>
<!-- Verbatim anchors the executor needs. No codebase scavenger hunt required. -->

**The insertion point — `src/backend/save_sync.ts:85-98` at `358fbdc7d`:**

```typescript
  )

  // If the save path was computed successfully, Legendary will have saved
  // this path in `installed.json` (so the GameInfo)
  const { save_path: new_save_path } = libraryManagerMap[
    'legendary'
  ].getGameInfo(appName, true)!
  if (!new_save_path) {
    logError(
      ['Unable to compute default save path for', appName],
      LogPrefix.Legendary
    )
    return ''
  }
```

The comment at L86-87 is the false assumption itself: the path IS in `installed.json`, but the
`GameInfo` readback does not consult `installed.json` — it merges install fields from the
module-scope `installedGames` map, which only `refreshInstalled()` writes.

**Precedent for the exact call shape — `src/backend/sidecar/installedJsonWatcher.ts:105-112`:**

```typescript
      // refreshInstalled() is synchronous in production (library.ts:131, no `async`), but the
      // `await` is load-bearing for the test contract: ...
      // eslint-disable-next-line @typescript-eslint/await-thenable
      await libraryManagerMap['legendary'].refreshInstalled()
```

That `await` + `eslint-disable` pair exists ONLY to serve `installedJsonWatcher.test.ts`'s
`mockRejectedValueOnce` contract. **Do NOT copy it here.** `refreshInstalled()` is declared without
`async` (`library.ts:131`) and returns `void`; a bare synchronous call needs no `await` and
therefore no disable directive — and the tests lint scope has ZERO free warning slots.

**`src/backend/storeManagers/legendary/library.ts` (do NOT modify):**

```typescript
// L58  module scope, shared across all manager instances:
let installedGames: Map<string, InstalledJsonMetadata> = new Map()
// L61
export default class LegendaryLibraryManager implements LibraryManager {
  private readonly gameCache: Map<LegendaryAppName, LegendaryGame> = new Map()
  async init() { this.loadGamesInAccount(); this.refreshInstalled() }   // L64-67
  getGame(id: string): LegendaryGame                                     // L69
  loadGamesInAccount()                                                   // L83
  getGameInfo(appName: string, forceReload = false): GameInfo | undefined // L203
  refreshInstalled()                                                     // L131 — NOT async
  async runRunnerCommand(command: LegendaryCommand, options?: CallRunnerOptions): Promise<ExecResult> // L684
}
```

The class has NO explicit constructor — construction is side-effect free (`loadGamesInAccount()`
lives in `init()`, not the constructor). So a `new LegendaryLibraryManager()` inside a `jest.mock`
factory is safe even before any fixture exists on disk.

**The entry point the test drives — `src/backend/save_sync.ts:17-36, 218`:**

```typescript
async function getDefaultSavePath(
  appName: string,
  runner: Runner,
  alreadyDefinedGogSaves: GOGCloudSavesLocation[]
): Promise<string | GOGCloudSavesLocation[]>
// ...
export { getDefaultSavePath }   // L218 — the ONLY export; getDefaultLegendarySavePath is private
```

`getDefaultLegendarySavePath` is module-private, so the test drives the exported
`getDefaultSavePath(APP_NAME, 'legendary', [])` and narrows the result to `string`.

**`save_sync.ts`'s own imports, which define the mock surface the test must cover:**

```typescript
import { getWinePath, setupWineEnvVars, verifyWinePrefix } from './launcher'
import { logDebug, LogPrefix, logInfo, logError, logWarning } from './logger'
import { getShellPath } from './utils'
import { app } from 'backend/platform'
import { libraryManagerMap } from 'backend/storeManagers'
import { LegendaryAppName } from './storeManagers/legendary/commands/base'
import { legendaryInstalled } from './storeManagers/legendary/constants'
```

`LegendaryAppName` is `z.string().brand(...)` (`commands/base.ts:7`) — a plain branded string, so
`'Iris'` parses. Leave it UNMOCKED.

**Reusable mock-boundary set:** `getGameInfoForceReloadStaleness.test.ts:69-174` already establishes
a working, hermetic mock set for `library.ts`'s module graph (`../constants` mkdtemp factory,
`backend/logger`, `../../../utils`, `../../../launcher`, `backend/online_monitor`,
`../electronStores`, `../user`, `../games`). Port it path-adjusted for a file in
`src/backend/__tests__/` and extend it as Task 1 specifies. Do not re-derive it.
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write the regression test FIRST and observe it RED against unfixed production code</name>
  <files>src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts</files>
  <behavior>
    Two arms, both driving the real `getDefaultSavePath(APP_NAME, 'legendary', [])`:

    - EMPTY arm — `installed.json` and the seeded in-memory map both hold `save_path: null`
      (the real first-call state, and the one that produced the live `savesPath: ''`). The stub
      writes `/rvv/NEW-fresh-save-path`. REQUIRED: the resolved value is
      `/rvv/NEW-fresh-save-path`. Without the fix this resolves to `''` via the
      `if (!new_save_path)` logError branch.
    - STALE arm — both hold `/rvv/OLD-stale-save-path`; the stub writes
      `/rvv/NEW-fresh-save-path`. REQUIRED: the resolved value is `/rvv/NEW-fresh-save-path`.
      Without the fix this resolves to `/rvv/OLD-stale-save-path`. This arm exists so the EMPTY
      arm cannot be the whole test: an assertion that only distinguishes "empty" from "non-empty"
      would also be satisfied by a stale-but-present value, which is the defect wearing a
      different mask.
  </behavior>
  <action>
    Create `src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts`. Do NOT touch any
    production file in this task — the point is to see the test born RED.

    Mocks. Start from the mock set at `getGameInfoForceReloadStaleness.test.ts:69-174`,
    path-adjusted for `src/backend/__tests__/` (`../storeManagers/legendary/constants`,
    `backend/logger`, `../utils`, `../launcher`, `backend/online_monitor`,
    `../storeManagers/legendary/electronStores`, `../storeManagers/legendary/user`,
    `../storeManagers/legendary/games`). jest mocks by RESOLVED module, so mocking
    `../storeManagers/legendary/constants` here also covers `library.ts`'s own `../constants`
    import and `save_sync.ts`'s `./storeManagers/legendary/constants` import — one hermetic
    mkdtemp fixture root serves both, which is required because `save_sync` reads
    `legendaryInstalled` while `library.ts` joins `legendaryConfigPath` + `installed.json`.
    Extend the ported set with: `../launcher` gaining `getWinePath`, `setupWineEnvVars` and
    `verifyWinePrefix` jest.fn()s; `../utils` gaining `getShellPath`; and a `backend/platform`
    mock exposing `app.getPath`.

    The load-bearing mock is `backend/storeManagers`. Its factory must inject a REAL
    `LegendaryLibraryManager` — `jest.requireActual('backend/storeManagers/legendary/library')`
    `.default`, constructed in the factory (safe: no explicit constructor) — under key `legendary`,
    plus a bare stub under `gog` for typing. Using the real manager is the whole point: the fix's
    effect is a REAL `refreshInstalled()` repopulating the REAL module-scope `installedGames` map
    that the REAL `getGameInfo` reads. A fully-mocked `getGameInfo` would test the mock, not the
    defect. Note that `jest.requireActual` bypasses mocks for `library.ts` itself while its own
    imports still resolve through the mock registry, which is why the ported mock set is what makes
    this cheap. Export a module-level handle to the constructed manager so the test body can spy on
    it.

    Fixtures. Reuse `getGameInfoForceReloadStaleness.test.ts`'s `metadataInner` and
    `installedJsonFixture(savePath)` shapes verbatim (they are already built to clear all five
    `loadFile()` early-return traps) — with `installedJsonFixture` widened to accept `null` for the
    EMPTY arm. `APP_NAME = 'Iris'`, title `Phoenix Point`. Sentinels
    `OLD_SENTINEL = '/rvv/OLD-stale-save-path'` and `NEW_SENTINEL = '/rvv/NEW-fresh-save-path'`.

    Per-arm setup, in a helper so both arms share it. `resetMocks: true` in
    `src/backend/jest.config.js` wipes spy implementations between tests, so every spy is
    (re-)established inside the test/`beforeEach`, never at factory time:
    (1) write `metadata/Iris.json` and `installed.json` with the arm's initial `save_path`;
    (2) `manager.loadGamesInAccount()` then `manager.refreshInstalled()` — this seeds the
    module-scope map with the STALE value, which is the precondition the whole test rests on;
    (3) `jest.spyOn(manager, 'getGame')` returning a minimal fake game with
    `getGameInfo: () => ({ save_folder: '<some folder>', save_path: '' })`,
    `isNative: () => true` and `getSettings: async () => ({})`. `save_path` is deliberately FALSY
    in both arms so the L45-65 "discard the stored path" branch is skipped and `isNative() === true`
    so `verifyWinePrefix` is never reached — the arm under test is the readback, not those branches;
    (4) `jest.spyOn(manager, 'runRunnerCommand')` with an implementation that WRITES
    `installedJsonFixture(NEW_SENTINEL)` to the fixture `installed.json` and returns an
    `ExecResult` (`src/common/types.ts:169`). **This side effect is mandatory — it is what
    `sync-saves --accept-path` does. A stub that only resolves makes the test vacuous and it would
    then pass with OR without the fix.**
    Leave `getGameInfo` and `refreshInstalled` UNSTUBBED — they are the mechanism under measurement.

    Four anti-vacuity controls, all in both arms:
    (a) sentinel-distinctness guard — `expect(OLD_SENTINEL).not.toBe(NEW_SENTINEL)` and
        `expect(NEW_SENTINEL).not.toBe('')`;
    (b) trap guard BEFORE the call — `manager.getGameInfo(APP_NAME, true)` is defined with
        `title === 'Phoenix Point'` and `is_installed === true`. Without this, an `undefined`
        GameInfo would make `save_sync.ts:89-91`'s non-null destructure throw a TypeError, and the
        EMPTY arm would "fail without the fix" for entirely the wrong reason;
    (c) stub-was-called assertion AFTER the call — `runRunnerCommand` called exactly once, its
        first argument carrying `subcommand: 'sync-saves'` and `'--accept-path': true`;
    (d) write-through control AFTER the call — read the fixture `installed.json` off disk and
        assert `save_path === NEW_SENTINEL`, so a silently failed stub write cannot be mistaken for
        a stale read.

    Header comment: state that this is a REGRESSION test (contrast with qop's characterisation
    probe), name the two arms and their required without-fix signatures, name the mock boundaries
    and — explicitly — why the `runRunnerCommand` stub writes the file. Add no `eslint-disable`
    anywhere.

    Observe it RED. Run the file and capture the output verbatim. REQUIRED signature before
    proceeding: `Tests: 2 failed`, with the EMPTY arm reporting
    `Expected: "/rvv/NEW-fresh-save-path"` / `Received: ""` and the STALE arm reporting
    `Received: "/rvv/OLD-stale-save-path"`. If either arm fails with a TypeError, ReferenceError,
    `Cannot find module`, or `Received: undefined`, the failure is a wiring error and NOT the
    defect — fix the wiring and re-observe. Do not proceed to Task 2 on a wrong-reason red.
  </action>
  <verify>
    <automated>npx jest --selectProjects Backend src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts 2>&1 | tail -40</automated>
    <!-- Read the COUNT, not the exit code: --selectProjects is case-sensitive and exits 0 on no
         match. Expect exactly `Tests: 2 failed`. A `0 total` or a passing run at this point both
         mean the test is not measuring what it claims. Run jest as its OWN command, never chained
         after a file write — chained runs have read stale in this repo. -->
    <automated>git diff --name-only -- src/backend/save_sync.ts src/backend/storeManagers/legendary/library.ts | wc -l</automated>
    <!-- MUST be 0: no production file is touched in Task 1. -->
  </verify>
  <done>The new test file exists, runs 2 tests, both FAIL with the required signatures above (not wiring errors), and no production source has been modified. Verbatim red output captured for the summary.</done>
</task>

<task type="auto">
  <name>Task 2: Apply the one-line fix and the comment correction, and observe GREEN</name>
  <files>src/backend/save_sync.ts, src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts</files>
  <action>
    In `src/backend/save_sync.ts`, inside `getDefaultLegendarySavePath()`, insert a bare
    synchronous `libraryManagerMap['legendary'].refreshInstalled()` immediately after the
    `runRunnerCommand` call (which currently ends at L85) and immediately BEFORE the
    `getGameInfo(appName, true)` readback at L89-91. Per the CONTEXT decision "Precedent for the
    exact call shape": same `libraryManagerMap['legendary']` shape as
    `installedJsonWatcher.ts:112`, but withOUT that site's `await` and withOUT its
    `eslint-disable` — `refreshInstalled()` returns `void`, an `await` would be flagged by
    `@typescript-eslint/await-thenable`, and a directive costs warning budget the tests scope does
    not have.

    Replace the false comment at L86-87 ("If the save path was computed successfully, Legendary
    will have saved this path in `installed.json` (so the GameInfo)"). The corrected comment must
    say what is actually true and why the new line exists: `sync-saves --accept-path` writes
    `save_path` into `installed.json` on DISK, but `getGameInfo` merges install fields from the
    module-scope `installedGames` map, which only `refreshInstalled()` writes — so without the
    refresh the readback returns a stale (or absent) value even though the fresh one is already on
    disk. Cite the measurement (quick `260912-qop`) and note that
    `sidecar/installedJsonWatcher.ts`'s 500ms debounce cannot win this race (proven live: the
    `refreshLibrary` push is logged AFTER the error) so the watcher is not a substitute for this
    call. Do not delete or weaken the watcher.

    Change nothing else in `save_sync.ts`. Change NOTHING in
    `src/backend/storeManagers/legendary/library.ts`.

    Then add a HEADER-COMMENT NOTE ONLY to
    `src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts`: its
    L28-33 paragraph predicts the probe will "FLIP TO RED the day someone fixes
    `getGameInfo`/`save_sync` (e.g. by adding a `refreshInstalled()` call before the readback)".
    That prediction is WRONG and this task is the proof — the probe pins `getGameInfo`, which this
    fix does not change, so it stays GREEN. Record that, name quick `260912-rvv` and the new
    regression test as where the fix's signal now lives, and state that if this probe DOES go red,
    something unintended changed in `library.ts`: STOP and investigate rather than adjusting the
    test. **Modify no code, no assertion, no mock and no fixture in that file — comment text only.**
    If the probe goes red after this task, stop and investigate; do not edit it to pass.
  </action>
  <verify>
    <automated>npx jest --selectProjects Backend src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts 2>&1 | tail -20</automated>
    <!-- Expect `Tests: 2 passed`. -->
    <automated>npx jest --selectProjects Backend src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts 2>&1 | tail -20</automated>
    <!-- Expect `Tests: 1 passed`. RED here means library.ts changed unintentionally: STOP. -->
    <automated>git diff -- src/backend/storeManagers/legendary/library.ts | wc -l</automated>
    <!-- Scope gate. MUST be 0. -->
    <automated>git diff -- src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | grep -vE '^[+-]\s*(\*|/\*|//)' | wc -l</automated>
    <!-- Comment-only gate: MUST be 0 non-comment changed lines in the qop probe. -->
    <automated>grep -vE '^\s*(//|\*|/\*)' src/backend/save_sync.ts | grep -c 'refreshInstalled()'</automated>
    <!-- Expect 1, counted with comment lines stripped so the new explanatory comment cannot
         satisfy its own gate. -->
    <automated>grep -c 'eslint-disable' src/backend/save_sync.ts || true</automated>
    <!-- Expect 0: no directive added, so neither lint ceiling can move because of one. -->
  </verify>
  <done>`save_sync.ts` carries exactly one real (non-comment) `refreshInstalled()` call placed before the readback with a corrected comment; the new test is 2/2 green; the qop probe is still green; `library.ts` is byte-identical to HEAD; the qop probe's diff is comment-only.</done>
</task>

<task type="auto">
  <name>Task 3: Negative control round-trip, repo-wide gates, and the summary</name>
  <files>.planning/todos/pending/2026-09-05-getdefaultsavepath-live-redrive-never-taken-against-a-real-legendary-title.md, .planning/quick/260912-rvv-refresh-installed-before-savepath-read/260912-rvv-SUMMARY.md</files>
  <action>
    NEGATIVE CONTROL (required by the CONTEXT decision "Negative control is required again", and
    with its required observation named, not merely "it fails"). Use the Edit tool to remove the
    `refreshInstalled()` line from `save_sync.ts` — do NOT use `git stash` (it strands concurrent
    sessions in this repo) and do NOT `git checkout --` the file (the post-checkout hook fires).
    Run the new test as a separate command and capture output VERBATIM.

    REQUIRED observation: `Tests: 2 failed`. The EMPTY arm must report
    `Expected: "/rvv/NEW-fresh-save-path"` / `Received: ""`; the STALE arm must report
    `Received: "/rvv/OLD-stale-save-path"`. Only ONE arm failing means the other arm is vacuous —
    investigate rather than proceeding. A TypeError / `Received: undefined` is a wrong-reason
    failure — investigate. Then restore the line with Edit, re-run, and require `Tests: 2 passed`.
    Confirm the restored file is what Task 2 produced (`git diff -- src/backend/save_sync.ts`
    shows the single added call plus the comment change, nothing else). The round-trip is what
    proves the test is coupled to THAT line rather than to an incidental edit; Task 1's born-red
    run is corroborating evidence, not a substitute for it.

    REPO-WIDE GATES, measured before/after rather than against numbers pinned in this plan (pinned
    baselines rot and have produced false reds here):
    - `pnpm codecheck` — clean.
    - Full Backend project run — read the suite/test COUNTS and compare the failure set against
      the pre-change run. Do NOT run `pnpm test:ci`: it exits 1 at HEAD with ZERO failing tests
      from a leaked 60s `rustInvoke('store_embed_open')` timer, unowned and unrelated. A green
      per-project run plus a red full run is that known bug, not this change.
    - `pnpm lint` — it prints TWO `problems (` lines (production first, tests second). Record BOTH
      numbers and compare them to a pre-change measurement. The tests ceiling has ZERO free slots
      repo-wide, so the new test file must contribute ZERO warnings. If a count rises, fix the
      offending construct in the new test file. **Do NOT raise `SRC_CEILING` or `TESTS_CEILING`.**
    - `pnpm planning-gates` — expect 11/11; re-measure rather than assuming.
    - `graphify update .` to keep the knowledge graph current (project rule). Note that
      `graphify update` deletes `graph.html`.

    TODO. Append a dated note to the pending todo. It must say: the code-side cause is now fixed
    (`refreshInstalled()` before the readback, quick `260912-rvv`) and desk-proven by
    `src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts` with a verified negative
    control; the todo remains OPEN because its discharge condition is a LIVE re-drive confirming the
    Cloud Saves Sync field populates on the FIRST call, and only a live AFTER-run satisfies that.
    Leave `status: OPEN`, `severity: medium`, `platform: any` and `ready: live-gate` EXACTLY as they
    are, keep the file in `pending/`, and add no new frontmatter keys — the todo-frontmatter gate
    matches values bare, lowercase and exact.

    SUMMARY at `.planning/quick/260912-rvv-refresh-installed-before-savepath-read/260912-rvv-SUMMARY.md`.
    Include: the one-line diff of `save_sync.ts`; the test's design and WHY the stub writes the
    file (the vacuity it forecloses); the verbatim born-red output from Task 1; the verbatim
    negative-control output with both arm signatures; the restored-green confirmation; the two lint
    counts before and after; the Backend suite counts; the scope-gate results proving `library.ts`
    untouched and the qop probe comment-only. Also record, explicitly:
    - CLEANUP OWED — this fix stops RECURRENCE but does not repair DAMAGE. Any game config already
      carrying `savesPath: ''` from a pre-fix run keeps that empty value until the save-path
      computation is re-triggered for that game. Not fixed here (narrow fix); named so it is not
      silently absorbed.
    - This does NOT close the parent todo; a live AFTER-run does.
    - The qop probe's "will flip to red" prediction was wrong, and why.
  </action>
  <verify>
    <automated>npx jest --selectProjects Backend src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts 2>&1 | tail -20</automated>
    <!-- Post-restore: expect `Tests: 2 passed`. -->
    <automated>npx jest --selectProjects Backend 2>&1 | tail -15</automated>
    <!-- Read suites/tests COUNTS; compare the failure set to the pre-change run. -->
    <automated>pnpm codecheck 2>&1 | tail -5</automated>
    <automated>pnpm lint 2>&1 | grep -E 'problems \(|CEILING|ceiling|FAIL|PASS' | tail -10</automated>
    <!-- Assert the two COUNTS numerically, not the exit code. -->
    <automated>pnpm planning-gates 2>&1 | tail -8</automated>
    <automated>git diff -- src/backend/storeManagers/legendary/library.ts | wc -l</automated>
    <!-- Still 0 after the negative-control round-trip. -->
    <automated>grep -c 'ready: live-gate' .planning/todos/pending/2026-09-05-getdefaultsavepath-live-redrive-never-taken-against-a-real-legendary-title.md</automated>
    <!-- Expect 1: the todo stays live-gate in pending/. -->
  </verify>
  <done>Negative control recorded verbatim with both required arm signatures and a restored-green confirmation; codecheck clean; Backend project run shows no new failures; both lint counts unchanged with no ceiling raised; planning gates 11/11; `library.ts` untouched; todo annotated and still OPEN / `ready: live-gate` in `pending/`; summary written including the CLEANUP OWED note.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| `legendary` CLI → `installed.json` → GameLib in-memory map | An external process writes a file GameLib reads back; the staleness window between the two is the defect. |
| test fixture root → operator's real config | A mis-scoped `../constants` mock would let a test read or write the operator's real `legendaryConfig`. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-rvv-01 | Tampering | new test's `../storeManagers/legendary/constants` mock | mitigate | mkdtemp fixture root under `GAMELIB_JEST_RUN_ROOT`, chmod 0700, per `getGameInfoForceReloadStaleness.test.ts:69-97`; the unpredictable suffix is the control. Never point at the real `legendaryConfig`. |
| T-rvv-02 | Tampering | `runRunnerCommand` spy | mitigate | The stub replaces the real CLI invocation entirely, so no `legendary` binary is executed and no real `sync-saves` touches the operator's account. |
| T-rvv-03 | Information disclosure | `refreshInstalled()` added to a logging-adjacent path | accept | `refreshInstalled()` reads a local file and logs no save-path content; the existing `logInfo(['Computed save path:', ...])` already logs the path and is unchanged by this plan. |
| T-rvv-SC | Tampering | npm/pip/cargo installs | n/a | This plan installs NO packages. No `package.json` change; `RESEARCH.md` package-legitimacy gate therefore does not apply. |
</threat_model>

<verification>
- New test: `Tests: 2 failed` before the fix (with the two required arm signatures), `Tests: 2 passed` after, `2 failed` again on revert, `2 passed` again on restore.
- `getGameInfoForceReloadStaleness.test.ts`: GREEN throughout; its diff is comment-only.
- `src/backend/storeManagers/legendary/library.ts`: empty `git diff` at every checkpoint.
- `src/backend/save_sync.ts`: exactly ONE non-comment `refreshInstalled()` occurrence, placed before the `getGameInfo(appName, true)` readback; zero `eslint-disable` directives.
- `pnpm codecheck` clean; Backend project run introduces no new failures; both `pnpm lint` counts unchanged with no ceiling raised; `pnpm planning-gates` 11/11.
- Todo remains in `pending/` with `status: OPEN`, `severity: medium`, `platform: any`, `ready: live-gate`.
</verification>

<success_criteria>
- [ ] The first call to `getDefaultSavePath(appName, 'legendary', [])` returns the path `sync-saves --accept-path` just wrote, proven by a test that FAILS without the fix.
- [ ] The `runRunnerCommand` stub writes the fixture `installed.json`, and the test asserts both that the stub was called with `sync-saves` + `--accept-path` and that the new value reached disk — so a non-writing stub cannot masquerade as a pass.
- [ ] The test exercises the REAL `getGameInfo` and REAL `refreshInstalled` (only `getGame` and `runRunnerCommand` are stubbed).
- [ ] Negative-control round-trip recorded verbatim with both required arm signatures, plus restored-green.
- [ ] `library.ts` untouched; the qop probe still green and comment-only-modified.
- [ ] No `eslint-disable` added; neither lint ceiling raised; both counts unchanged.
- [ ] Summary names the CLEANUP OWED (`savesPath: ''` already persisted in game configs is not repaired) and states that a LIVE AFTER-run — not this task — closes the parent todo.
</success_criteria>

<output>
Create `.planning/quick/260912-rvv-refresh-installed-before-savepath-read/260912-rvv-SUMMARY.md` when done.
</output>
