---
phase: quick-261120-uzn
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/gog/windowsElevation.ts
  - src/backend/storeManagers/gog/__tests__/windowsElevation.test.ts
  - src/backend/storeManagers/gog/games.ts
  - src/backend/storeManagers/gog/__tests__/uninstallSafety.test.ts
  - src/backend/storeManagers/gog/setup.ts
  - src/backend/storeManagers/gog/__tests__/setupElevation.win32.test.ts
  - src/backend/__tests__/dialogOptionForwarding.test.ts
  - .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-UAT.md
  - .planning/todos/pending/2026-11-20-gog-windows-elevation-live-check.md
autonomous: true
requirements:
  - G-82-2
  - 82-UAT-DEFERRED-GOG-WINDOWS-DIALOGS

estimate:
  tokens: 110000
  raw_tokens: 110000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "dialogOptionForwarding.test.ts passes: its exact-set and length pin of UNBOUNDED_RUST_CHANNELS lists RUST_SAFETY_REMOVE_TREE (Phase 82 WR-03), and the set-equality and length assertions are unchanged"
    - "On Windows, a GOG uninstall runs unins000.exe once, elevated, with /VERYSILENT, /ProductId=<id>, /galaxyclient and /KEEPSAVES plus /dir=<install dir>, so GOG's 'keep saved games?' dialog has no reason to appear"
    - "The arguments arrive exactly as written, for install paths that contain spaces, apostrophes, square brackets, $ or backticks (measured through real PowerShell on this machine)"
    - "No value that reaches an elevated PowerShell statement (install paths, GOG-supplied version names, languages, product ids) can be run as PowerShell code: every value is a single-quoted literal"
    - "On Windows, GOG setup's elevated steps (script interpreter, support executables and every redist) run under one UAC prompt instead of one prompt per step; one step still elevates directly; an oversized batch falls back to one prompt per step"
    - "The Phase 82 removal guard order is unchanged: checkRemoval runs before unins000.exe, and guardedRemoveTree runs after it"
    - "82-UAT.md records G-82-2 as resolved by 261120-uzn, the deferred GOG entry says what this task addressed and what is still open, and the open live check is a todo carrying severity, platform and ready"
  artifacts:
    - path: src/backend/storeManagers/gog/windowsElevation.ts
      provides: "PowerShell literal quoting, the GOG uninstaller switch set, the single and batched elevated Start-Process builders, and runElevatedSteps"
      contains: "export async function runElevatedSteps"
    - path: src/backend/storeManagers/gog/__tests__/windowsElevation.test.ts
      provides: "pure quoting and builder tests (every OS) plus real-PowerShell round trips (Windows only)"
      contains: "261120-uzn"
    - path: src/backend/storeManagers/gog/games.ts
      provides: "uninstall and DLC uninstall elevate through runElevatedSteps with the full switch set"
      contains: "gogUninstallStep"
    - path: src/backend/storeManagers/gog/setup.ts
      provides: "setup steps are queued on Windows and flushed once through runElevatedSteps"
      contains: "runElevatedSteps"
    - path: src/backend/storeManagers/gog/__tests__/setupElevation.win32.test.ts
      provides: "Windows-only proof that a script-interpreter game with two redists makes exactly one elevated spawn"
      contains: "261120-uzn"
    - path: src/backend/__tests__/dialogOptionForwarding.test.ts
      provides: "exact-set pin including RUST_SAFETY_REMOVE_TREE"
      contains: "'RUST_SAFETY_REMOVE_TREE'"
    - path: .planning/todos/pending/2026-11-20-gog-windows-elevation-live-check.md
      provides: "the owed live check on Windows, with the uninstall-UAC investigation result"
      contains: "ready: live-gate"
  key_links:
    - from: src/backend/storeManagers/gog/games.ts
      to: src/backend/storeManagers/gog/windowsElevation.ts
      via: "uninstall() Windows branch calls runElevatedSteps(this.deps, [gogUninstallStep(...)])"
      pattern: "runElevatedSteps\\("
    - from: src/backend/storeManagers/gog/setup.ts
      to: src/backend/storeManagers/gog/windowsElevation.ts
      via: "runGogSetup flushes the queued ElevatedStep list through runElevatedSteps in a finally"
      pattern: "runElevatedSteps\\("
    - from: src/backend/__tests__/dialogOptionForwarding.test.ts
      to: src/backend/sidecar/sidecarRpc.ts
      via: "regex reads the UNBOUNDED_RUST_CHANNELS array literal and compares it to EXPECTED"
      pattern: "RUST_SAFETY_REMOVE_TREE"
---

<objective>
Two operator-confirmed fixes from the Phase 82 UAT session (2026-11-20).

1. G-82-2 (CI red, Test run 44823008791): Phase 82 WR-03 added `RUST_SAFETY_REMOVE_TREE` to
   `UNBOUNDED_RUST_CHANNELS` in `src/backend/sidecar/sidecarRpc.ts`, but the exact-set pin in
   `src/backend/__tests__/dialogOptionForwarding.test.ts` was not updated. Add it to EXPECTED and
   close the gap in 82-UAT.md.

2. GOG on Windows shows external windows: a "keep saved games?" dialog on uninstall, a UAC prompt
   on uninstall, and three UAC prompts installing Balrum (GOG setup plus vcredist).
   - Cause of the dialog (confirmed by reading `games.ts` ~1198-1247): the Windows branch builds and
     logs the full Galaxy switch set (`/VERYSILENT /ProductId=<id> /galaxyclient /KEEPSAVES`) but
     hands PowerShell only `/verysilent` and `/dir=`. GOG's uninstaller asks about saves unless it
     gets `/KEEPSAVES`. The wine branch and the Windows DLC uninstall already pass the full set.
   - A second defect found while planning, measured on this machine: the uninstaller path is handed
     to PowerShell bare. PowerShell 5.1 rebuilds its script text from argv without quotes, so a path
     with a space (`...\Some Game\unins000.exe`) is split into two tokens and Start-Process never
     launches the uninstaller. `setup.ts` has the same bare-path pattern, and wraps every argument in
     a double-quoted PowerShell string, which runs `$(...)` sub-expressions. Those strings carry
     GOG-supplied version names and run elevated.
   - The redist prompts come from `src/backend/storeManagers/gog/setup.ts` `runSetupCommand`, not
     games.ts:1340-1380 (that range is the DLC uninstall inside `update()`). Each setup step is its
     own elevated PowerShell call, so you get one UAC prompt per step.

Planner decisions, made under the discretion the operator gave (record them in the SUMMARY):
- **Batch the setup prompts. This replaces the alternative of deferring it to a todo.** It was
  feasible because three things were measured on this machine on 2026-11-20 through real Windows
  PowerShell 5.1, launched without elevation:
  - single-quoted literals carry spaces, apostrophes, `$`, backticks and an injection-shaped value
    verbatim from node, through powershell.exe and Start-Process, to the target's argv;
  - Start-Process accepts an `-EncodedCommand` of 32,560 characters;
  - Start-Process treats `-FilePath` and `-WorkingDirectory` as wildcard paths. An unescaped `[x]`
    folder fails with "Cannot perform operation because the wildcard path ... did not resolve" and
    a backtick-escaped one works.
- **The uninstall keeps its UAC prompt.** No GOG `unins000.exe` exists on this machine whose
  manifest could be read. Launched without elevation, it would either self-elevate (the same single
  prompt) or run unelevated and fail to remove any machine-wide registry entries that the elevated
  setup step wrote, leaving them orphaned while the files are deleted anyway. One prompt per
  uninstall is therefore the honest floor for now. The todo records how to settle it.
- **Skipping redists that are already installed is not done.** It needs a per-dependency
  detection table, which is not a quick task. The batch makes an already-installed redist cost no
  extra prompt anyway.
- The live UAC behaviour can only be confirmed by the operator. It is recorded as a
  `ready: live-gate` todo, not as a blocking checkpoint.

Output: the shared `windowsElevation.ts` module and its tests; the fixed GOG uninstall and DLC
uninstall; batched setup elevation; the G-82-2 test pin; the 82-UAT.md updates; and one pending todo.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-UAT.md
@src/backend/storeManagers/gog/setup.ts
@src/backend/storeManagers/gog/__tests__/uninstallSafety.test.ts

Read only these ranges of the large files:
- `src/backend/storeManagers/gog/games.ts` lines 1161-1290 (`uninstall`) and 1325-1390 (the DLC
  uninstall inside `update()`).
- `src/backend/__tests__/dialogOptionForwarding.test.ts` lines 170-245.
- `src/backend/sidecar/sidecarRpc.ts` lines 120-165 (the WR-03 docblock and the array).

Project conventions (`Skill("gamelib-conventions")`):
- Every `<verify>` runs `npx prettier --check` over the exact non-ignored paths written. `.planning/**`
  is prettier-ignored, so Task 3 says so instead of checking it.
- Child processes spawned from tests go through `createRealRunner()` (fresh fake-HOME profile by
  default). Never hand-roll an `env` literal.
- A new todo carries `severity:`, `platform:`, `ready:`, bare and lowercase, in that order.
- `pnpm backend-di-ceilings` is a shrink-only ratchet on `jest.mock` calls. A new test file that
  contains any jest.mock, jest.doMock or jest.setMock call fails it, so every new test here is
  dependency-injected. It was green at planning time (jestMock=1865 across 448 files), and
  `pnpm find-deadcode` was green too (312 baselined).

The working tree is dirty with unrelated files: `.planning/state.json`, `public/locales/en/gamelib.json`,
the `src/backend/sidecar/*` files, `.planning/debug/*`, `.planning/milestone.lock` and
`.planning/quick/261114-2gg-*`. Stage only the paths in `files_modified`, by explicit path. Never
use `git add -A` or `git add .`.

This Windows box has about 108 jest suites that are red before any change (see memory). Run only
the targeted suites. Run each targeted suite once BEFORE editing to record its baseline. A suite
that is already red before your edit is reported in the SUMMARY, not fixed.

<interfaces>
Existing code the executor uses. Extracted at planning time, so no further exploration is needed.

src/backend/spawnAsync.ts:
  export type SpawnAsync = (command: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number; signal?: AbortSignal; windowsHide?: boolean }, onOutput?: (data: string) => void) => Promise<{ code: number | null; stdout: string; stderr: string; timedOut?: boolean; aborted?: boolean }>
  export function createSpawnAsync(deps: { runner: ProcessRunner }): SpawnAsync
  (windowsHide defaults to false. Any options key outside cwd/env/timeout/signal/windowsHide throws.)

src/backend/testUtils/realRunner.ts:
  export function createRealRunner(opts?: { realProfile?: { justification: string } }): { runner: ProcessRunner; profile: FakeHomeProfile | null; dispose(): void }
  (Precedent for a Windows-only real-PowerShell test: src/backend/shortcuts/__tests__/windowsShortcut.win32.test.ts uses `const winDescribe = process.platform === 'win32' ? describe : describe.skip`.)

src/backend/storeManagers/steam/clientSetup.ts:52 (private; leave it alone):
  function toPowerShellLiteral(value: string): string { return `'${value.replaceAll("'", "''")}'` }
  It also launches `powershell -NoProfile -NonInteractive Start-Process ... -Verb RunAs` with `{ windowsHide: true }`. This is the precedent showing that a hidden outer shell still raises UAC.

src/backend/storeManagers/gog/setup.ts:
  default export setup(deps: SetupDeps, appName: string, installInfo?: GogInstalledInfo, installRedist = true): Promise<void>
  On Windows: setup -> runGogSetup(deps, appName, gameInfo, stored, installRedist). Four call sites invoke runSetupCommand(deps, wineArgs): v1 support_commands, v2 scriptinterpreter per product, v2 temp_executable per product, and one per redist dependency. Every wineArgs carries commandParts [exe, ...args] and startFolder.
  sendGameStatusUpdate(deps, payload) needs only deps.sendFrontendMessage(channel, payload) and deps.appRuntime.events.emit(name, payload).
  Paths come from deriveGogPaths(deps.paths): { gogdlConfigPath, gogRedistPath, gogSupportPath }. The game manifest is at <gogdlConfigPath>/manifests/<appName>. The redist manifest is at <gogRedistPath>/.gogdl-redist-manifest with shape { depots: [{ dependencyId, readableName, executable: { path, arguments } }] }. The ISI is at <gogRedistPath>/__redist/ISI/scriptinterpreter.exe.

src/backend/storeManagers/gog/__tests__/uninstallSafety.test.ts harness:
  build(requestRustInvoke) returns { game, sent, installedSet, unins: { wine, spawn, winePath }, installedList }. Its deps.spawnAsync stub only counts calls today. installDir = join(root, 'games', 'Some Game'), which contains a space. ID = '1207658930'. The logger needs `beforeAll(() => initHeadless())`.
</interfaces>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1 (tracer): shared literal-safe elevation module, wired end-to-end through the GOG Windows uninstall</name>
  <files>src/backend/storeManagers/gog/windowsElevation.ts, src/backend/storeManagers/gog/__tests__/windowsElevation.test.ts, src/backend/storeManagers/gog/games.ts, src/backend/storeManagers/gog/__tests__/uninstallSafety.test.ts</files>
  <behavior>
    Pure tests in windowsElevation.test.ts run on every OS, including ubuntu CI. Title each describe with "261120-uzn".
    - toPowerShellLiteral("Baldur's Gate") returns 'Baldur''s Gate' wrapped in single quotes. A value holding `$x`, a backtick or `$(calc)` comes back unchanged inside the quotes.
    - toPowerShellPathLiteral escapes each backtick, `[` and `]` with a preceding backtick before quoting. A path without those characters equals toPowerShellLiteral of the same path.
    - toWindowsArgument follows the CommandLineToArgvW rules: `/KEEPSAVES` is unchanged. `/dir=C:\a b` becomes `"/dir=C:\a b"`. An embedded `"` becomes `\"`. Backslashes before a quote are doubled, and so are trailing backslashes before the closing quote (`C:\a b\` becomes `"C:\a b\\"`). An empty string becomes `""`.
    - gogUninstallerSwitches('1207658930') equals ['/VERYSILENT', '/ProductId=1207658930', '/galaxyclient', '/KEEPSAVES'].
    - gogUninstallStep(path, id, dir) has filePath = path, args = [...gogUninstallerSwitches(id), '/dir=' + dir], and no workingDirectory.
    - elevatedStartProcessArgs(step) equals ['-NoProfile', '-NonInteractive', '-Command', statement]. The statement starts with "Start-Process -FilePath ", contains "-Verb RunAs" and "-Wait", and contains each switch as its own single-quoted -ArgumentList item. When step.args is empty, the statement has no -ArgumentList.
    - runElevatedSteps with a recording spawnAsync stub: 0 steps make no spawn and return { spawns: 0, failed: 0 }. 1 step makes exactly one spawn of ('powershell', elevatedStartProcessArgs(step), { windowsHide: true }), with cwd added only when step.workingDirectory is set. A stub that resolves with code 1 gives { spawns: 1, failed: 1 } and does not throw. A stub that rejects makes runElevatedSteps reject, because it does not swallow spawn failures.
    Windows-only round trip in the same file (winDescribe, 60 s timeout). It runs real PowerShell through createSpawnAsync({ runner: createRealRunner().runner }), WITHOUT elevation, using powershellCommandArgs(startProcessStatement(step, { elevate: false })).
    - The step launches process.execPath on a small probe script, written by the test into a mkdtemp folder whose name contains a space, an apostrophe and `[x]`. That folder is also the step's workingDirectory.
    - The probe writes { args: process.argv.slice(3), cwd: process.cwd() } as JSON to argv[2].
    - The probe args are: the four GOG switches; a /dir= value containing a space, an apostrophe, `[GOG]`, `$env:USERNAME` and a backtick; a value with an embedded double quote; a value ending in a backslash after a space; and an injection-shaped value. The injection value is a single quote, then "; New-Item -ItemType File -Path ", then a single-quoted marker path, then "; ", then a single quote.
    - Assertions: recorded args deep-equal the input list, recorded cwd equals the bracketed folder, and the marker file does NOT exist.
    uninstallSafety.test.ts:
    - Extend the harness stub to record { command, args, options } per spawnAsync call. The existing counters and every existing assertion stay as they are.
    - Add a test that runs only on Windows (`process.platform === 'win32' ? it : it.skip`). After a yes verdict, exactly one spawn is recorded: command 'powershell', args deep-equal elevatedStartProcessArgs(gogUninstallStep(join(installDir, 'unins000.exe'), ID, installDir)), options deep-equal { windowsHide: true }, and the joined args contain '/KEEPSAVES', '/galaxyclient' and '/ProductId=1207658930' as single-quoted items.
  </behavior>
  <action>
    Implements operator item 2 (uninstall dialogs). This is the thinnest path through every layer:
    the new module, the games.ts call site, and real PowerShell. Task 2 reuses the module.

    Before editing, run the verify suites once and note their baseline on this machine.

    Create src/backend/storeManagers/gog/windowsElevation.ts with a header comment. The comment
    records three facts measured on 2026-11-20 with Windows PowerShell 5.1:
    - argv tokens are re-joined without quotes, so a bare path with a space splits;
    - double-quoted PowerShell strings expand `$(...)`, and GOG-supplied strings reach elevated
      statements;
    - Start-Process resolves -FilePath and -WorkingDirectory as wildcard paths, so `[`, `]` and
      backtick must be backtick-escaped.

    The module exports the following.
    - interface ElevatedStep { filePath: string; args: readonly string[]; workingDirectory?: string }.
    - toPowerShellLiteral(value): wrap in single quotes and double every apostrophe.
    - toPowerShellPathLiteral(path): backtick-escape backtick, `[` and `]`, then call
      toPowerShellLiteral.
    - toWindowsArgument(arg): MSVCRT/CommandLineToArgvW quoting, as in libuv's quote_cmd_arg.
      Return the arg unchanged when it is non-empty and holds no whitespace and no double quote.
      Otherwise wrap it in double quotes, escape each embedded quote with a backslash, and double
      the backslashes that precede a quote or the closing quote.
    - toStartProcessArgumentList(args): args mapped through toWindowsArgument, then
      toPowerShellLiteral, joined with commas.
    - startProcessStatement(step, opts: { elevate: boolean; hidden?: boolean }): one PowerShell
      statement in this order: "Start-Process -FilePath" plus the path literal; " -ArgumentList"
      plus the list, only when args is non-empty; " -WorkingDirectory" plus the path literal, only
      when set; " -WindowStyle Hidden" when hidden; " -Verb RunAs" when elevate; " -Wait".
    - powershellCommandArgs(statement): ['-NoProfile', '-NonInteractive', '-Command', statement].
    - elevatedStartProcessArgs(step): powershellCommandArgs(startProcessStatement(step,
      { elevate: true })).
    - gogUninstallerSwitches(productId): the four Galaxy switches, in the order listed in
      `<behavior>`.
    - gogUninstallStep(uninstallerPath, productId, installDirectory): returns an ElevatedStep.
    - async runElevatedSteps(deps: { spawnAsync: SpawnAsync }, steps): resolves to
      { spawns, failed }.
      - Before spawning, log each step's file path and its joined args with logInfo
        (LogPrefix.Gog).
      - Spawn with { windowsHide: true }, adding cwd only when the step has a workingDirectory.
      - Count a non-zero or null code as failed, and logWarning the code plus trimmed stderr. A
        declined UAC prompt lands here.
      - Do not catch a spawnAsync rejection.
      - In this task, handle 0 steps and 1 step. Treat more than one step as one spawn per step
        for now. Task 2 adds batching.

    Import SpawnAsync as a type from backend/spawnAsync, and logInfo, logWarning and LogPrefix from
    backend/logger. Do not import child_process.

    games.ts uninstall() (operator item 2):
    - Keep the checkRemoval guard block and the guardedRemoveTree call exactly where they are.
    - Build the switch list once with gogUninstallerSwitches(this.id). The wine command becomes
      the uninstaller path followed by those switches, which is byte-identical to today's command,
      so the wine branch is otherwise untouched.
    - In the Windows branch, replace the hand-built PowerShell argv with
      `await runElevatedSteps(this.deps, [gogUninstallStep(uninstallerPath, this.id, installDirectory)])`.
    - Make the "Executing uninstall command" log line show what actually runs on each OS: the
      switches plus /dir= on Windows, the existing command on wine.
    - Above the Windows branch, add a comment explaining why elevation stays: the planner decision
      in `<objective>`, with no manifest available to read and either outcome giving no gain or
      orphaned machine-wide registry entries.

    games.ts update(), the DLC uninstall: the Windows branch becomes
    `await runElevatedSteps(this.deps, [{ filePath: uninstallExeFile, args: gogUninstallerSwitches(productId), workingDirectory: gameData.install.install_path! }])`.
    The relative exe name resolves against the working directory, as it did through cwd before.
    The wine DLC branch uses `[uninstallExeFile, ...gogUninstallerSwitches(productId)]` as its
    commandParts. It is the same switch set in Galaxy order, and Inno Setup switches do not depend
    on order. After this, games.ts assembles no PowerShell argv of its own.

    Write the tests listed in `<behavior>`, with no jest.mock of any kind. The pure runElevatedSteps
    tests need `beforeAll(() => initHeadless())` from backend/logger, as uninstallSafety.test.ts
    does. The round trip disposes its runner and removes its temp folder in afterAll.
  </action>
  <verify>
    <automated>npx jest --runTestsByPath src/backend/storeManagers/gog/__tests__/windowsElevation.test.ts src/backend/storeManagers/gog/__tests__/uninstallSafety.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts && pnpm codecheck && npx eslint src/backend/storeManagers/gog/windowsElevation.ts src/backend/storeManagers/gog/games.ts src/backend/storeManagers/gog/__tests__/windowsElevation.test.ts src/backend/storeManagers/gog/__tests__/uninstallSafety.test.ts && pnpm backend-di-ceilings && npx prettier --check src/backend/storeManagers/gog/windowsElevation.ts src/backend/storeManagers/gog/__tests__/windowsElevation.test.ts src/backend/storeManagers/gog/games.ts src/backend/storeManagers/gog/__tests__/uninstallSafety.test.ts && test "$(grep -v '^[[:space:]]*//' src/backend/storeManagers/gog/games.ts | grep -c "'-Verb'")" -eq 0 && test "$(grep -v '^[[:space:]]*//' src/backend/storeManagers/gog/games.ts | grep -c 'runElevatedSteps(')" -ge 2 && test "$(grep -c 'gogUninstallStep(' src/backend/storeManagers/gog/games.ts)" -ge 1</automated>
    On this Windows machine, the jest output must show the winDescribe round trip and the
    Windows-only uninstallSafety test as passed, not skipped. Confirm it with
    `npx jest --runTestsByPath src/backend/storeManagers/gog/__tests__/windowsElevation.test.ts src/backend/storeManagers/gog/__tests__/uninstallSafety.test.ts --verbose`.
  </verify>
  <done>On Windows, the GOG uninstall elevates once with /VERYSILENT /ProductId /galaxyclient /KEEPSAVES /dir=. The arguments survive spaces, apostrophes, brackets, `$`, backticks and an injection attempt through real PowerShell. games.ts builds no PowerShell argv itself. The Phase 82 guard tests are unchanged and green. Every listed gate passes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: one UAC prompt for all GOG setup steps on Windows (batched elevation)</name>
  <files>src/backend/storeManagers/gog/windowsElevation.ts, src/backend/storeManagers/gog/__tests__/windowsElevation.test.ts, src/backend/storeManagers/gog/setup.ts, src/backend/storeManagers/gog/__tests__/setupElevation.win32.test.ts</files>
  <behavior>
    Pure tests in windowsElevation.test.ts, run on every OS:
    - batchStatement([a, b, c], { elevate: true }) is one Start-Process statement whose FilePath literal is 'powershell.exe'. It contains "-WindowStyle Hidden", "-Verb RunAs" and "-Wait", and its -ArgumentList is '-NoProfile','-NonInteractive','-EncodedCommand' followed by a base64 item.
    - Decoding that base64 as UTF-16LE gives exactly three lines, in order: startProcessStatement(a, { elevate: false }), then the same for b and then c. No line contains "RunAs".
    - runElevatedSteps with 3 small steps makes exactly ONE spawn of ('powershell', powershellCommandArgs(batchStatement(steps, { elevate: true })), { windowsHide: true }) and returns { spawns: 1, failed: 0 }.
    - runElevatedSteps with steps whose batch statement exceeds MAX_BATCH_STATEMENT_CHARS (for example two steps, each with one 20,000-character argument) falls back to one direct elevated spawn per step, in order.
    Windows-only round trip (winDescribe), not elevated:
    - Run powershellCommandArgs(batchStatement([step1, missing, step2], { elevate: false })) through createRealRunner. `missing` points at a non-existent .exe in the temp folder.
    - The probe script is extended so that argv[3] is a path whose existence it records. step1 checks a path that does not exist. step2 checks step1's output file.
    - Assertions: both output files exist with exact args; step2 recorded that step1's file already existed, which proves order and -Wait; the missing exe did not stop step2. Each statement is its own PowerShell statement and no $ErrorActionPreference = 'Stop' is set, so a failing step does not end the batch.
    setupElevation.win32.test.ts. It is skipped on other OSes, uses real temp files and DI, with no jest.mock:
    - Call setup(deps, ID) for a v2 manifest with scriptInterpreter: true, dependencies ['MSVC2017', 'MSVC2017_x64'], products [{ productId: ID }], an existing ISI file, and a redist manifest listing both dependencies. Exactly ONE spawnAsync call is recorded. Its command is 'powershell' and its 4th arg holds "-Verb RunAs" once plus an -EncodedCommand. The decoded script has 3 lines: the scriptinterpreter.exe step first, carrying '/ProductId=<ID>' and a -WorkingDirectory of the install path; then the MSVC2017 executable; then the MSVC2017_x64 executable. Each redist line has a -WorkingDirectory of gogRedistPath.
    - setup(deps, ID, undefined, false) queues only the ISI step, so exactly one spawn is made, through elevatedStartProcessArgs, with no -EncodedCommand.
  </behavior>
  <action>
    Implements operator item 2 (redist prompts) per the planner decision in `<objective>`.

    windowsElevation.ts:
    - Export MAX_BATCH_STATEMENT_CHARS = 30_000. Its comment cites the 32,767-character
      CreateProcess command-line limit and the 32,560-character -EncodedCommand measured through
      Start-Process on 2026-11-20.
    - Export batchStatement(steps, opts: { elevate: boolean }). It joins
      startProcessStatement(step, { elevate: false }) for each step with newlines, encodes the
      result as UTF-16LE base64 with Buffer, and returns startProcessStatement for filePath
      'powershell.exe', args ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { elevate: opts.elevate, hidden: true }. Do not set $ErrorActionPreference: each step stays
      independent, as it is today, where one failing step does not stop the next.
    - Extend runElevatedSteps for more than one step. When batchStatement(steps,
      { elevate: true }) fits within the cap, make one spawn of
      powershellCommandArgs(batchStatement(...)) with { windowsHide: true }, and log one line naming
      the step count. Otherwise make one direct elevated spawn per step, in order, and log a warning
      that the batch was too long.
    - Keep the per-step logInfo lines from Task 1. The UAC prompt now names Windows PowerShell, so
      the log is where the user can see what they approved.

    setup.ts. Rename the existing runGogSetup to collectGogSetupSteps and give it a trailing
    parameter `elevated: ElevatedStep[]`. Keep its body as it is, so no lines are re-indented.

    Change runSetupCommand to take that list as its third parameter:
    - On Windows, it pushes { filePath: exe, args, workingDirectory: wineArgs.startFolder }, keeps
      the existing throw for an empty command, and returns without spawning.
    - Elsewhere, it returns deps.commandRunner.runWineCommand(wineArgs), unchanged.
    - Delete the old inline Windows quoting, including the "super quotes" mapper.
    - Pass `elevated` at all four call sites.

    Add a new runGogSetup with the original signature. It creates the list, awaits
    collectGogSetupSteps inside try, and flushes in finally. The flush runs only when the list is
    non-empty: send one status update { appName, runner: 'gog', status: 'redist', context: 'GOG' }
    so the label does not keep only the last redist name, then await runElevatedSteps(deps,
    elevated). This flushes on every exit path: the redist-manifest parse-failure return, and a
    throw after steps were queued. Today, steps that ran before such an exit still ran, so behaviour
    stays the same. On macOS and Linux the list stays empty and nothing changes.

    After this change, setup.ts assembles no PowerShell argv of its own. Every value reaching
    PowerShell is now a single-quoted literal, which closes the `$(...)` expansion of GOG-supplied
    version names and paths that existed before.

    If `pnpm find-deadcode` flags a new export from windowsElevation.ts, make that helper private
    to the module (and test it through the exported functions that use it). Do not raise the knip
    baseline.

    Write the tests listed in `<behavior>`, with no jest.mock of any kind.
    setupElevation.win32.test.ts builds deps by hand: paths from createTestAppPaths(root) under a
    tmp root whose install folder name contains a space; libraryManagers.gog.getGameInfo returning
    { title, install: { platform: 'windows', install_path, language: 'en-US', buildId, version,
    installedDLCs: [] } }; gameConfigs.get returning { config: {} }; sendFrontendMessage and
    appRuntime.events.emit as no-ops; and a recording spawnAsync. Use `beforeAll(() =>
    initHeadless())`, and clean up the tmp root in afterAll. Write its header like the precedent
    windowsShortcut.win32.test.ts: Windows only, skipped elsewhere, so ubuntu CI never runs it.
  </action>
  <verify>
    <automated>npx jest --runTestsByPath src/backend/storeManagers/gog/__tests__/windowsElevation.test.ts src/backend/storeManagers/gog/__tests__/setupElevation.win32.test.ts src/backend/storeManagers/gog/__tests__/setup.engine.test.ts src/backend/storeManagers/gog/__tests__/uninstallSafety.test.ts && pnpm codecheck && npx eslint src/backend/storeManagers/gog/windowsElevation.ts src/backend/storeManagers/gog/setup.ts src/backend/storeManagers/gog/__tests__/windowsElevation.test.ts src/backend/storeManagers/gog/__tests__/setupElevation.win32.test.ts && pnpm backend-di-ceilings && pnpm find-deadcode && npx prettier --check src/backend/storeManagers/gog/windowsElevation.ts src/backend/storeManagers/gog/setup.ts src/backend/storeManagers/gog/__tests__/windowsElevation.test.ts src/backend/storeManagers/gog/__tests__/setupElevation.win32.test.ts && test "$(grep -v '^[[:space:]]*//' src/backend/storeManagers/gog/setup.ts | grep -c "'-Verb'")" -eq 0 && test "$(grep -v '^[[:space:]]*//' src/backend/storeManagers/gog/setup.ts | grep -c 'runElevatedSteps(')" -eq 1 && test "$(grep -c 'export const MAX_BATCH_STATEMENT_CHARS' src/backend/storeManagers/gog/windowsElevation.ts)" -eq 1</automated>
    On this Windows machine, `--verbose` must show the setupElevation.win32 tests and the batch
    round trip as passed, not skipped. setup.engine.test.ts (macOS engine path,
    isWindows mocked false) must stay green, since it proves the wine path is unchanged.
  </verify>
  <done>On Windows, a GOG setup with a script interpreter and two redists makes one elevated PowerShell spawn that runs the three steps in order. A single step elevates directly. An oversized batch falls back to one prompt per step. Wine setup is unchanged. setup.ts builds no PowerShell argv itself. Every listed gate passes.</done>
</task>

<task type="auto">
  <name>Task 3: G-82-2 pin, 82-UAT.md updates, and the live-check todo</name>
  <files>src/backend/__tests__/dialogOptionForwarding.test.ts, .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-UAT.md, .planning/todos/pending/2026-11-20-gog-windows-elevation-live-check.md</files>
  <action>
    Implements operator item 1, then records both items.

    dialogOptionForwarding.test.ts:
    - Append 'RUST_SAFETY_REMOVE_TREE' as the last EXPECTED entry, after
      'RUST_STEAMCM_WRAP_RESTORE_IF_OWED', matching the order in sidecarRpc.ts. Give it a comment
      in the same style as the others: Phase 82 WR-03, where safety_remove_tree runs a guarded
      recursive delete whose duration scales with the install tree, not a clock; a 60 s cut-off
      would report failed while Rust keeps deleting (rustInvokeChannel.test.ts proves the channel
      is unbounded); the read-only safety_check_removal stays bounded; and it is not a dialog
      channel either.
    - Rename the test to 'contains exactly the dialog, depot, Rust CM and safety remove channels'.
    - Do not touch the set-equality or length assertions, the import test or the self-test. The
      import test already passes, because sidecarRpc.ts imports RUST_SAFETY_REMOVE_TREE from
      'common/types/sidecarTransport' (line 60).

    82-UAT.md, `## Gaps`, entry G-82-2. Edit it in place and keep every other field:
    - set the status value to resolved;
    - insert `resolved_by: 261120-uzn` and `resolved_at: 2026-11-20` directly after the status line,
      as the 47-UAT.md precedent does.

    Leave test 2's result line, the `## Summary` counts and `status: complete` unchanged, since they
    are history. Bump the frontmatter `updated:` to the current UTC time.

    82-UAT.md, `## Deferred Follow-Ups`, the first entry (the GOG one). Append to its idea string a
    sentence saying it is partially addressed by quick task 261120-uzn on 2026-11-20:
    - the Windows uninstall now passes /VERYSILENT /ProductId /galaxyclient /KEEPSAVES and /dir with
      literal-safe quoting, so the keep-saved-games dialog should not appear, and paths with spaces
      now reach the uninstaller at all;
    - GOG setup's elevated steps run under one UAC prompt instead of one each.
    Then say what is still open: the uninstall keeps one UAC prompt on purpose, and nothing is
    live-verified yet; both are tracked in
    .planning/todos/pending/2026-11-20-gog-windows-elevation-live-check.md.

    Keep the value one double-quoted line, using single quotes inside as the existing text does,
    and keep deferred_at.

    Create .planning/todos/pending/2026-11-20-gog-windows-elevation-live-check.md, following the
    frontmatter shape of the existing pending todos (created as an ISO timestamp, a quoted title,
    area: gog-install, and a files list naming windowsElevation.ts, setup.ts and games.ts), then
    exactly these three lines, in this order:
    - `severity: medium`
    - `platform: windows`
    - `ready: live-gate`

    Body sections:
    - `## Problem`: what 261120-uzn changed, and that no UAC behaviour was observed live.
    - `## What to check`: run in pnpm tauri:dev on Windows.
      - Install Balrum. Expect exactly one UAC prompt, naming Windows PowerShell, and the VC++
        redist actually installed.
      - Decline that prompt once. Expect setup to finish with a warning in the GOG log and no
        further prompts.
      - Uninstall Balrum. Expect one UAC prompt, no keep-saved-games dialog, and the saves kept.
      - Uninstall a GOG game whose folder name has a space. Expect the uninstaller to run.
      - Note whether the hidden inner PowerShell window stays hidden under elevation.
    - `## Uninstall UAC (investigated, kept)`: the reasoning from the games.ts comment. Settle it by
      reading the embedded manifest of an installed game's unins000.exe (requestedExecutionLevel)
      and checking whether its setup wrote machine-wide registry keys. Drop elevation only if the
      uninstaller is asInvoker AND nothing machine-wide needs removing.
    - `## Trade-off`: the single prompt now shows Windows PowerShell with an encoded command instead
      of each installer's own name; the per-step log lines are the record of what was approved.
  </action>
  <verify>
    <automated>npx jest --runTestsByPath src/backend/__tests__/dialogOptionForwarding.test.ts && npx prettier --check src/backend/__tests__/dialogOptionForwarding.test.ts && test "$(grep -c "'RUST_SAFETY_REMOVE_TREE'" src/backend/__tests__/dialogOptionForwarding.test.ts)" -ge 1 && grep -q 'contains exactly the dialog, depot, Rust CM and safety remove channels' src/backend/__tests__/dialogOptionForwarding.test.ts && grep -q 'expect(members).toHaveLength(EXPECTED.length)' src/backend/__tests__/dialogOptionForwarding.test.ts && grep -A3 'gap_id: G-82-2' .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-UAT.md | grep -q '^  status: resolved$' && grep -q '^  resolved_by: 261120-uzn$' .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-UAT.md && grep -q '^  resolved_at: 2026-11-20$' .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-UAT.md && test "$(grep -c '261120-uzn' .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-UAT.md)" -ge 2 && grep -q '^result: issue' .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-UAT.md && test -e .planning/todos/pending/2026-11-20-gog-windows-elevation-live-check.md && grep -q '^platform: windows$' .planning/todos/pending/2026-11-20-gog-windows-elevation-live-check.md && grep -q '^ready: live-gate$' .planning/todos/pending/2026-11-20-gog-windows-elevation-live-check.md && python .planning/todos/todo-frontmatter-gate.py</automated>
    `python`, not `python3`: on this Windows box `python3` is the Microsoft Store stub ("Python was
    not found"), while `python` is 3.12.10 and runs the gate (checked at planning time: OK, 10
    pending todos).
    No prettier check is run on 82-UAT.md or the todo. Both are under `.planning/`, which is
    prettier-ignored (`--file-info` reports `"ignored": true`), so a check would be a vacuous green.
    Match the surrounding corpus by hand instead.
  </verify>
  <done>dialogOptionForwarding.test.ts is green with RUST_SAFETY_REMOVE_TREE pinned and the exact-set and length assertions intact. G-82-2 is resolved in 82-UAT.md with resolved_by and resolved_at. The GOG deferred entry says what was addressed and what is open. The live-check todo passes the todo frontmatter gate.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GameLib sidecar (user) → elevated PowerShell (administrator) | Every value interpolated into the elevated statement crosses into an administrator context |
| GOG API / gogdl manifests → setup arguments | Version names, languages, product ids and redist arguments come from remote data and reach the elevated statement |
| User-chosen install path → uninstaller and setup arguments | Folder names can contain spaces, apostrophes, `$`, backticks and brackets |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261120-uzn-01 | Elevation of Privilege | setup.ts runSetupCommand (before this task): GOG-supplied strings sit in double-quoted PowerShell strings run with -Verb RunAs, so `$(...)` would execute as administrator | high | mitigate | Every value goes through toPowerShellLiteral, a single-quoted literal with apostrophes doubled. Paths also pass through toPowerShellPathLiteral. The Task 1 Windows round trip feeds an injection-shaped argument and asserts it arrives verbatim and that its marker file is never created |
| T-261120-uzn-02 | Tampering | toWindowsArgument / Start-Process argument joining | medium | mitigate | CommandLineToArgvW quoting (embedded quotes, trailing backslashes), with pure tests on every OS plus a real round trip on Windows asserting deep-equal argv |
| T-261120-uzn-03 | Repudiation | batched elevation: one UAC prompt names Windows PowerShell with an encoded command instead of each installer | medium | accept | Operator-requested trade (fewer prompts). runElevatedSteps logs every step's executable and arguments before elevating. Only steps that runGogSetup already ran elevated are batched; no new executable source is added. Recorded in the live-check todo |
| T-261120-uzn-04 | Tampering | redist and support executables live in user-writable folders and run elevated | low | accept | Pre-existing and unchanged by this task. The same executables were elevated one by one before |
| T-261120-uzn-05 | Denial of Service | a batch over the command-line limit | low | mitigate | MAX_BATCH_STATEMENT_CHARS (30,000, below the 32,767 limit) falls back to one elevated spawn per step, with a test |
| T-261120-uzn-06 | Tampering | GOG uninstall guard order (Phase 82 D-10) | medium | mitigate | checkRemoval stays before unins000.exe and guardedRemoveTree after it. The existing uninstallSafety.test.ts assertions are kept unchanged and must stay green |
| T-261120-uzn-SC | Tampering | npm/pip/cargo installs | high | mitigate | No package installs in this plan; no lockfile changes |
</threat_model>

<verification>
- The targeted jest suites from Tasks 1-3 are green on this Windows machine. The win32-only tests
  show as passed, not skipped. Compare with the baseline recorded before editing.
- `pnpm codecheck`, `pnpm backend-di-ceilings` and `pnpm find-deadcode` are green.
- `git show --stat` for this task's commits lists only paths in `files_modified`. None of the
  unrelated dirty files was staged.
- After the last code commit, run `graphify update .` (CLAUDE.md requires it after code changes;
  AST-only).
</verification>

<success_criteria>
- The CI Test workflow's dialogOptionForwarding failure (G-82-2) is fixed, without loosening the
  exact-set pin.
- On Windows, a GOG uninstall passes the full Galaxy silent switch set, so the keep-saved-games
  dialog is no longer requested, and it works for install paths with spaces.
- On Windows, GOG setup asks for administrator permission once instead of once per redist.
- No GOG-supplied or path-derived string can run as PowerShell code in an elevated context.
- 82-UAT.md and the new todo record exactly what was fixed, what was deliberately kept (the
  uninstall prompt) and what still needs the operator's live check.
</success_criteria>

<output>
Create `.planning/quick/261120-uzn-fix-g-82-2-unbounded-channel-pin-and-gog/261120-uzn-SUMMARY.md` when done
</output>
