---
phase: quick-260912-qop
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: ['QT-260912-qop']
files_modified:
  - src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts
  - .planning/todos/pending/2026-09-05-getdefaultsavepath-live-redrive-never-taken-against-a-real-legendary-title.md
  - .planning/quick/260912-qop-getgameinfo-forcereload-stale-map/260912-qop-SUMMARY.md

must_haves:
  truths:
    - 'A jest test demonstrates that `getGameInfo(appName, true)` returns the OLD `save_path` even though `installed.json` on disk has already been rewritten with a NEW one.'
    - 'The SAME assertion, re-run after an explicit `refreshInstalled()`, returns the NEW `save_path` — the positive control, without which the stale assertion proves nothing.'
    - 'A write-through control proves the NEW value really was on disk at the moment of the stale read, so the staleness cannot be blamed on a failed fixture write.'
    - 'The returned GameInfo is proven to be a real, fully-loaded record (defined, correct title, is_installed true) — so none of the five `loadFile()` early-return traps can make the probe pass for the wrong reason.'
    - 'The probe is demonstrated CAPABLE OF FAILING via two recorded negative-control mutations, whose verbatim failure output is captured in the summary.'
    - 'No production source is modified: `src/backend/save_sync.ts` and `src/backend/storeManagers/legendary/library.ts` are byte-identical to HEAD after the work.'
    - 'The suite runs green and the test count demonstrably moved (not a zero-match run that exits 0).'
  artifacts:
    - path: 'src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts'
      provides: 'Characterisation probe pinning the stale-map read of save_path, with positive, write-through and trap-guard controls'
      contains: 'refreshInstalled'
      min_lines: 120
  key_links:
    - from: 'src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts'
      to: 'src/backend/storeManagers/legendary/library.ts'
      via: 'real (unmocked) import of the library manager under test'
      pattern: "from '\\.\\./library'"
    - from: 'src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts'
      to: 'src/backend/storeManagers/legendary/constants.ts'
      via: 'jest.mock factory redirecting legendaryConfigPath to a disposable temp dir'
      pattern: "jest\\.mock\\('\\.\\./constants'"
---

<objective>
MEASURE — do not fix — the claim that `LegendaryLibraryManager.getGameInfo(appName, forceReload = true)`
does not re-read `installed.json`. It re-reads the *metadata* file and merges install fields from the
module-scope `installedGames` map, which only `refreshInstalled()` ever writes. The `save_path` readback
in `save_sync.ts` therefore can return a STALE value immediately after `legendary sync-saves` has written
a fresh one to disk.

Purpose: the claim is currently only a static reading of source. This turns it into a repeatable
desk measurement. It is the desk-provable half of the pending todo
`2026-09-05-getdefaultsavepath-live-redrive-never-taken-against-a-real-legendary-title.md`; it does NOT
discharge that todo, whose condition is a LIVE gate.

Output: one jest characterisation test, a recorded negative control, and a note appended to the todo.

**Explicitly OUT of scope.** Do not edit `src/backend/save_sync.ts`. Do not edit
`src/backend/storeManagers/legendary/library.ts`. Do not add a `refreshInstalled()` call to production
code. This task produces a MEASUREMENT; the fix is a separate task gated on this result.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/260912-qop-getgameinfo-forcereload-stale-map/260912-qop-CONTEXT.md
@./CLAUDE.md

Nearest conventions to copy (read these, do not re-derive the mechanism):
- `src/backend/storeManagers/legendary/__tests__/user.test.ts` — same directory. Its header comment
  explains the `jest.mock('../constants', ...)` precedent: `./constants` transitively pulls
  `backend/constants/paths.ts`, which reads `app.getPath`/`app.isPackaged` at MODULE SCOPE. The whole
  chain is mocked rather than hand-stubbing electron's `app`. This plan uses the same seam.
- `src/backend/storeManagers/gog/__tests__/library.test.ts` — a library-manager suite. Its header
  documents the `resetMocks: true` consequence and the store-manager circular-import trap.
</context>

<interfaces>
Established mechanism, verified at 5ded84fab. Anchors are exact — use them, do not re-derive.

`src/backend/storeManagers/legendary/library.ts`
```
L58   let installedGames: Map<string, InstalledJsonMetadata> = new Map()   // module scope
L131  refreshInstalled()          // THE ONLY writer of installedGames; reads join(legendaryConfigPath, 'installed.json')
L203  getGameInfo(appName, forceReload = false)
L204    if (!this.hasGame(appName)) return undefined
L212    if (!library.has(appName) || forceReload) this.loadFile(appName)
L215    return library.get(appName)
L485  private loadFile(app_name)  // reads metadata/<app>.json, then:
L557    const info = installedGames.get(app_name)   // <-- THE STALE MAP, not the file
L564    ...destructures save_path from `info`
L640    save_path,                                  // TOP-LEVEL field on GameInfo (NOT under `install`)
L634    is_installed: info !== undefined
L682  hasGame = (appName: string) => allGames.has(appName)
L83   loadGamesInAccount()        // public; populates allGames from readdirSync(legendaryMetadata)
```

`src/backend/save_sync.ts`, `getDefaultLegendarySavePath()`
```
L72-85  await runRunnerCommand({ subcommand: 'sync-saves', '--skip-upload', '--skip-download', '--accept-path' })
L89-91  const { save_path: new_save_path } = libraryManagerMap['legendary'].getGameInfo(appName, true)!
L92-97  if (!new_save_path) logError(['Unable to compute default save path for', appName], ...)
```
There is NO `refreshInstalled()` between the subprocess and the readback. That absence is the defect.

`src/backend/storeManagers/legendary/constants.ts` — the mock surface
```ts
legendaryConfigPath   // base
legendaryUserInfo     = join(legendaryConfigPath, 'user.json')
legendaryInstalled    = join(legendaryConfigPath, 'installed.json')
thirdPartyInstalled   = join(legendaryConfigPath, 'third-party-installed.json')
legendaryMetadata     = join(legendaryConfigPath, 'metadata')
epicRedistPath
```
Note `refreshInstalled()` does NOT import `legendaryInstalled` — it recomputes
`join(legendaryConfigPath, 'installed.json')` inline at L132. Mocking `legendaryConfigPath` covers both.
`./thirdParty`'s `getInstalledGames()` reads `thirdPartyInstalled` from the same module, so the mock must
supply that key too or it will read a real path.

`InstalledJsonMetadata` (`src/common/types/legendary.ts` L14-33) — required fixture fields:
`app_name, base_urls, can_run_offline, egl_guid, executable, install_path, install_size, install_tags,
is_dlc, launch_parameters, needs_verification, platform, prereq_info, requires_ot, title, version`,
optional `manifest_path`, `save_path`.
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write the stale-map characterisation probe with its three controls</name>
  <files>src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts</files>

  <behavior>
The probe drives the REAL, unmocked `LegendaryLibraryManager` against REAL files on disk. Sequence:

1. Write `metadata/Iris.json` and an `installed.json` whose `Iris.save_path` is the OLD sentinel.
2. `manager.loadGamesInAccount()` then `manager.refreshInstalled()` — simulates app startup.
3. Rewrite `installed.json` on disk with the NEW sentinel — simulates what `legendary sync-saves
   --accept-path` does inside `getDefaultLegendarySavePath()`.
4. Call `manager.getGameInfo('Iris', true)` — the exact call save_sync.ts L89-91 makes.

Assertions, ALL of which are load-bearing:

- TRAP GUARD (must come FIRST): the returned info is `toBeDefined()`, its `title` equals the fixture
  title, and `is_installed` is `true`. A `loadFile()` early-return or a `hasGame()` miss yields
  `undefined` here, so this guard is what stops the probe passing for the wrong reason.
- WRITE-THROUGH CONTROL: read `installed.json` back with real `fs` at this same point and assert its
  parsed `Iris.save_path` IS the NEW sentinel. This proves the staleness is in the map, not in a
  fixture write that silently failed.
- THE DEFECT (characterisation, asserted GREEN): `info.save_path` is the OLD sentinel. Comment it
  loudly as the defect being pinned, and name the test so intent is unmissable — this assertion is
  expected to FLIP TO RED the day someone fixes `getGameInfo`/`save_sync`, and that flip is the signal
  we want.
- POSITIVE CONTROL: call `manager.refreshInstalled()`, then the SAME `getGameInfo('Iris', true)` again,
  and assert `save_path` is now the NEW sentinel. Without this arm the stale assertion is satisfiable
  by a probe that wired up nothing.
- A guard that the two sentinels are distinct strings, so the two arms can never be trivially equal.

Do NOT assert anything about the 500ms `installedJsonWatcher` debounce. That is a live-timing property,
not desk-provable, and is out of scope.
  </behavior>

  <action>
Create the test file at the path above. Follow the naming style already in that directory
(`epicCookieCensus.test.ts`, `epicLogoutDomains.test.ts`). Open with a header comment stating the claim
being measured, the file:line anchors from `<interfaces>`, and that this is a CHARACTERISATION test
pinning a defect — a future red here means the defect was fixed, not that the test broke.

FIXTURE ROOT. Mock `../constants` with a factory that mints its own disposable directory, so no `const`
is referenced before initialisation under jest's hoisting. Inside the factory use
`jest.requireActual` for `fs`/`path`/`os`, mint the root with `mkdtempSync`, prefer
`process.env.GAMELIB_JEST_RUN_ROOT` as the parent when set (the run root from `jest.globalSetup.js`)
and fall back to `tmpdir()`, `chmodSync(root, 0o700)`, and return ALL SIX keys the real module exports
(`legendaryConfigPath`, `legendaryUserInfo`, `legendaryInstalled`, `thirdPartyInstalled`,
`legendaryMetadata`, `epicRedistPath`). The test body then imports `legendaryConfigPath` /
`legendaryMetadata` from `'../constants'` to learn where to write. Precedent: `user.test.ts`'s own
`jest.mock('../constants', ...)` and the reason recorded in its header.

DO NOT MOCK `graceful-fs` OR `fs`. The entire question is whether `getGameInfo` consults the file. A
mocked filesystem would measure the mock. Real files under a 0700 mkdtemp root are hermetic.

MODULE MOCKS. `library.ts` pulls a wide import surface; mock only what the loader actually demands, and
add mocks one at a time in response to real failures rather than pre-emptively. Expected starting set:
`backend/logger` (logInfo/logError/logWarning/logDebug + `LogPrefix` with `Legendary` and `Backend`),
`../../../utils` (must export `formatEpicStoreUrl`, `getLegendaryBin`, `isEpicServiceOffline`,
`getFileSize`, `axiosClient` — `getFileSize` and `formatEpicStoreUrl` are called on the loadFile path at
L594/L622), `../../../launcher` (`callRunner`), `backend/online_monitor`, `./electronStores`
(`libraryStore`, `installStore`, `gamesOverrideStore` as get/set/has/delete stubs), `../user`
(`LegendaryUser`), and `../games` if the `LegendaryGame` import chain explodes. Leave
`backend/constants/environment` and `backend/schemas` REAL — nothing here needs to override `isWindows`,
and `user.test.ts` documents that the object-literal getter form of that mock is silently inert.

`resetMocks: true` is set for this jest project: it wipes factory-time `jest.fn(() => ...)`
implementations before the FIRST test runs. Re-establish every implementation you depend on in
`beforeEach`, exactly as `gog/__tests__/library.test.ts` and `user.test.ts` do.

METADATA FIXTURE — the five `loadFile()` early-return traps. `loadGameMetadata` parses
`metadata/Iris.json` and `loadFile` then reads `data.metadata`, so the file must be shaped
`{ "app_name": "Iris", "app_title": "...", "metadata": { ... } }`. The inner object MUST:
  - set `namespace` to something that is NOT `'ue'` (L501);
  - include a `categories` ARRAY that contains none of `assets` / `asset-format` / `plugins` /
    `projects` (L499-504) and no `mods` (L524). `categories` is destructured without a default and
    `.find()` is called on it OUTSIDE the try/catch — an absent `categories` throws rather than
    returning false, so it is mandatory;
  - include a `releaseInfo` array whose platforms are NOT exclusively `Android`/`iOS` (L529-535), and
    whose `[0].platform` exists (L602). Use `['Mac', 'Windows']`;
  - include `title`, `description`, `developer`, and a `customAttributes` object (its absence only logs
    a warning, but include it — `CloudSaveFolder_MAC` matches the real-world `Iris` / Phoenix Point
    anchor and keeps the log clean);
  - be valid JSON (L487-496 returns false on a parse failure).
Use appName `Iris`, platform `Mac` for fixture realism. NEVER read the operator's real
`~/Library/Application Support/GameLib/legendaryConfig` — the probe must be hermetic.

`installed.json` fixture: an object keyed by app name (`refreshInstalled` does `Object.entries` on it),
value satisfying `InstalledJsonMetadata` per `<interfaces>`, with `platform: 'Mac'`.

SENTINELS: two obviously distinct, greppable strings, e.g. `/qop/OLD-stale-save-path` and
`/qop/NEW-fresh-save-path`. Assert `save_path` at the TOP LEVEL of the returned GameInfo (L640) — it is
NOT under `install`, and `save_sync.ts` L89 destructures it top-level.

Add no `eslint-disable` comments. `pnpm lint` in this repo runs against two ceilings with almost no
headroom, and an orphaned disable directive costs +2 against them.
  </action>

  <verify>
    <automated>npx jest --selectProjects Backend --runTestsByPath src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts 2>&1 | tail -20</automated>
  </verify>

  <done>
The run reports `Tests: N passed` with N >= 1 and `Suites: 1 passed`. A run reporting `No tests found`
or 0 tests is a FAILURE, not a pass — `--selectProjects` is case-sensitive (the displayName is exactly
`Backend`) and exits 0 when it matches nothing. Read the count, do not read the exit code.

Also: run the command as its OWN invocation, never chained after the file write with `&&` — jest in the
same shell command as a write has been observed reading the stale file in this repo.
  </done>
</task>

<task type="auto">
  <name>Task 2: Prove the probe can fail — two recorded negative controls</name>
  <files>src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts</files>

  <action>
A green two-arm test whose arms happen to use the same value proves nothing. Before believing Task 1,
demonstrate that each arm is genuinely driven by what it claims to measure. Perform BOTH mutations, one
at a time, capture the VERBATIM jest failure output for each, then revert. Nothing from this task is
committed except the captured output, which goes in the summary (Task 3).

NC-1 — proves the stale arm is reading a real OLD value, not `undefined` and not a mock.
  Mutation: in the defect assertion only, change the expected value from the OLD sentinel to the NEW
  sentinel.
  Required observation: the test FAILS, and the failure message shows `Received:` = the OLD sentinel.
  Falsification: if it passes, `getGameInfo` is NOT returning the stale value and the whole premise is
  wrong — STOP and record that instead. If `Received:` is `undefined`, a `loadFile()` trap or
  `hasGame()` is firing and the trap guard from Task 1 was not doing its job — fix the fixture.

NC-2 — proves the positive control is genuinely driven by the disk rewrite + `refreshInstalled()`.
  Mutation: comment out ONLY the step that rewrites `installed.json` with the NEW sentinel.
  Required observation: the POSITIVE CONTROL arm FAILS, with `Expected:` NEW and `Received:` OLD.
  Falsification: if the positive control still passes with the rewrite removed, it is not reading the
  file at all and the arm is decorative — the fixture wiring is wrong, fix it and re-run both controls.

After both are recorded, `git diff` the test file against HEAD and confirm it is back to the Task 1
state (a leftover mutation is exactly how a probe ships measuring nothing). Re-run the suite and
confirm it is green again.
  </action>

  <verify>
    <automated>git status --porcelain -- src/backend/save_sync.ts src/backend/storeManagers/legendary/library.ts</automated>
  </verify>

  <done>
Both negative controls were run, each produced the REQUIRED failure (not merely "some failure"), and the
verbatim `Expected:`/`Received:` lines are captured for the summary. Both mutations are reverted and the
suite is green again on a fresh invocation.

The scope gate above prints NOTHING. Empty output means neither production file was touched. Both
pathspecs exist at HEAD, so a silent zero-match cannot make this gate vacuous — but if you are unsure,
sanity-check the gate by running it against a path you know is dirty and confirming it prints.
  </done>
</task>

<task type="auto">
  <name>Task 3: Record the measurement against the todo and write the summary</name>
  <files>.planning/todos/pending/2026-09-05-getdefaultsavepath-live-redrive-never-taken-against-a-real-legendary-title.md, .planning/quick/260912-qop-getgameinfo-forcereload-stale-map/260912-qop-SUMMARY.md</files>

  <action>
Append a dated section to the pending todo recording: that the desk half is now MEASURED (not merely
read from source), the test file path, the two sentinel values, and the verbatim negative-control
output. State plainly that this does NOT discharge the todo — its condition is a LIVE gate against a
real legendary title, and the 500ms `installedJsonWatcher` debounce race remains unmeasured. The todo
stays in `pending/`; do NOT move it to `completed/`.

Do not alter the todo's existing `severity:` / `platform:` / `ready:` frontmatter values unless the
measurement genuinely changes one; if you do change `ready:`, it must stay inside the bare, lowercase,
exact vocabulary (`code` | `live-gate` | `human` | `blocked`) — this is CI-enforced by
`.planning/todos/todo-frontmatter-gate.py`.

Write the SUMMARY. It must state the result as a measurement with its controls, and carry the open
question below as an explicit heading rather than silently resolving it.

OPEN QUESTION to record (answered NO at planning time, re-affirm or correct it): does making this
behaviour observable require a production source change? Planning found it does NOT — `refreshInstalled`
and `getGameInfo` are both public, `hasGame` is satisfied via the public `loadGamesInAccount()`, and the
fixture root is reachable by mocking `../constants` alone. If the executor nonetheless concludes a
source edit is required, STOP and write that conclusion into the summary as an unresolved open question.
Do NOT make the edit.
  </action>

  <verify>
    <automated>pnpm planning-gates 2>&1 | tail -15</automated>
  </verify>

  <done>
Planning gates pass at their pre-existing count (they were 11/11 at `5ded84fab`; report the number you
observe rather than assuming). The todo remains in `pending/` with its three required frontmatter keys
intact. The summary records the result, the three controls, the two negative controls verbatim, and the
open question.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| test process → filesystem | The probe writes real files; an unconstrained root could clobber the operator's real `legendaryConfig` |
| fixture JSON → `JSON.parse` | Attacker-controlled input in production; fully controlled by us here |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-qop-01 | Tampering | test fixture root | mitigate | `mkdtempSync` + `chmodSync(0o700)` under the run root minted by `jest.globalSetup.js`; unpredictable suffix defeats the world-writable-`/tmp` symlink-capture vector that WR-07 closed. Never a fixed path. |
| T-qop-02 | Tampering | operator's real `legendaryConfig` | mitigate | `jest.mock('../constants')` redirects `legendaryConfigPath` before `library.ts` loads; `jest.setupContainment.ts` redirects `homedir()`/`HOME` for the whole backend project as defence in depth. The plan forbids reading the real config path. |
| T-qop-03 | Tampering | production source | mitigate | Task 2's `git status --porcelain` gate over `save_sync.ts` and `library.ts` must print nothing. |
| T-qop-SC | Tampering | npm/pip/cargo installs | n/a | No packages are installed by this plan. `jest`, `ts-jest` and `graceful-fs` are already present; no dependency is added, so the package legitimacy gate has no surface here. |
</threat_model>

<verification>
1. `npx jest --selectProjects Backend --runTestsByPath src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts` — green, with a non-zero test count READ FROM THE OUTPUT.
2. Both negative controls produced their REQUIRED failure and were reverted.
3. `git status --porcelain -- src/backend/save_sync.ts src/backend/storeManagers/legendary/library.ts` — empty.
4. `npx tsc --noEmit -p tsconfig.json` (or the repo's `codecheck`) — clean. Note that a tsc gate cannot
   see lint errors, so run lint separately.
5. `pnpm lint` — no new errors, and no `eslint-disable` added by this work.
6. `pnpm planning-gates` — at its pre-existing count.
</verification>

<success_criteria>
The claim "`getGameInfo(appName, forceReload=true)` does not re-read `installed.json`" has moved from a
static reading of source to a repeatable, hermetic measurement with a positive control, a write-through
control, a trap guard against all five `loadFile()` early returns, and two recorded negative controls
proving the probe can fail. No production code changed. The pending todo records the desk half as
measured and remains open on its live gate.
</success_criteria>

<output>
Create `.planning/quick/260912-qop-getgameinfo-forcereload-stale-map/260912-qop-SUMMARY.md` when done.
</output>
