---
phase: quick-261011-iel
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/tools/winetricksOutputClassifier.ts
  - src/backend/tools/index.ts
  - src/backend/tools/winetricksEnvironment.ts
  - src/backend/tools/__tests__/winetricksListAvailable.test.ts
  - src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts
  - src/backend/tools/__tests__/winetricksOutputClassifier.test.ts
  - .planning/todos/pending/2026-10-11-gptk-banner-cannot-appear-at-tab-open-because-list-all-skips-the-version-check.md
  - .planning/todos/completed/2026-10-11-gptk-banner-cannot-appear-at-tab-open-because-list-all-skips-the-version-check.md
autonomous: true
requirements: [45-12-G6, D-16]

estimate:
  tokens: 90000
  raw_tokens: 90000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Opening the Winetricks tab on a GPTK 7.7 bottle (the list-all run) records unsupportedWineVersion '7.7' for that runner:appName before any install runs. The value comes from the bottle's own `wine --version`, not from winetricks output."
    - "The version string is derived exactly as winetricks derives `_wine_version_stripped` (script lines 5104/5114). For the same wine, the probe's value therefore equals what parseUnsupportedWineVersion captures from winetricks' own warning, so a later install records the same string and fires no second listener."
    - "The unsupported test is winetricks' own `w_wine_version_in ,7.99`, compared field by field as numbers. 7.7, 1.9.22 and 7.99 are unsupported. 8.0, 9.0 and 10.0 are supported."
    - "A probe that parses as supported clears a previously recorded unsupported version (decision recorded in Task 2). A probe that fails, times out, overflows or cannot be parsed changes nothing, logs one logWarning at most, and never fails or delays the list."
    - "A list-all call spawns exactly one winetricks process (args ['list-all']) and makes exactly one execFile(wineBin, ['--version']). An install run (-q verb) never runs the probe."
    - "The probe is bounded: execFile with no shell, a 5000 ms timeout with SIGKILL and a 16 KiB maxBuffer. Our code creates no timer, watcher or socket, and nothing runs at sidecar boot."
    - "The frontend is unchanged (the report shape is unchanged). 45-LIVE-GATE.md and 45-UAT.md are not touched. The todo moves to .planning/todos/completed/ with a Resolution section."
  artifacts:
    - path: src/backend/tools/winetricksOutputClassifier.ts
      provides: "pure parseWineVersionOutput(raw) and isUnsupportedWineVersion(version), next to parseUnsupportedWineVersion"
      contains: "export function parseWineVersionOutput"
    - path: src/backend/tools/index.ts
      provides: "Winetricks.checkWineVersion, plus the single execFile probe site gated on list runs inside runWithArgs"
      contains: "checkWineVersion"
    - path: src/backend/tools/winetricksEnvironment.ts
      provides: "recordUnsupportedWine accepting null (clear), idempotent"
      contains: "version: string | null"
    - path: src/backend/tools/__tests__/winetricksListAvailable.test.ts
      provides: "end-to-end list-all -> report pins, the probe re-pins, clear/unknown/failure cases"
    - path: src/backend/tools/__tests__/winetricksOutputClassifier.test.ts
      provides: "parser table, parity property, threshold table"
    - path: .planning/todos/completed/2026-10-11-gptk-banner-cannot-appear-at-tab-open-because-list-all-skips-the-version-check.md
      provides: "closed todo with a Resolution section"
      contains: "## Resolution"
  key_links:
    - from: "Winetricks.runWithArgs (returnOutput branch, beside the checkDependencies call)"
      to: "Winetricks.checkWineVersion"
      via: "fire-and-forget call with .catch(logWarning), passing wineBin and the same envs the list-all child gets"
      pattern: "checkWineVersion\\("
    - from: "Winetricks.checkWineVersion"
      to: "recordUnsupportedWine"
      via: "parseWineVersionOutput -> isUnsupportedWineVersion -> record(version | null)"
      pattern: "recordUnsupportedWine\\("
    - from: "recordUnsupportedWine"
      to: "frontend EnvironmentBanner"
      via: "onEnvironmentChanged -> winetricksQueueChanged push (winetricksQueue.ts:43), or the winetricksQueueState read the tab makes after listAvailable resolves (WinetricksSettings/index.tsx ~L254)"
      pattern: "onEnvironmentChanged"
---

<objective>
Make the D-16 GPTK environment banner appear the moment the Winetricks tab opens, closing live-gate
45-12 G6 (`issue`) and the todo
`2026-10-11-gptk-banner-cannot-appear-at-tab-open-because-list-all-skips-the-version-check.md`.

Purpose: winetricks sets `export _W_wine_not_needed=1` for every `list*` verb except
`list-installed` (script line 5471), so `winetricks_wine_setup` returns before its version check
(line 5119). The tab-open `list-all` therefore never prints "Your version of wine X is no longer
supported upstream", and `recordUnsupportedWine` (written only from that line today) has nothing
to record until the first `-q` install. D-16 says the banner is visible on opening the tab. That is
unreachable on this build.

Output: at list-all time the sidecar runs the bottle's wine binary with `--version`. It derives the
version string byte-for-byte as winetricks does and records it when winetricks' own `,7.99` rule
says unsupported. If the wine is supported, it clears a stale record. The frontend is unchanged.
The todo moves to completed.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md (1.5 MB — do NOT read whole; `head -40` only if needed)
@CLAUDE.md
@.claude/skills/gamelib-conventions/SKILL.md (fake-HOME two-profile rule; sidecar exit contract; `<verify>` prettier rule)
@.planning/todos/pending/2026-10-11-gptk-banner-cannot-appear-at-tab-open-because-list-all-skips-the-version-check.md
@src/backend/tools/winetricksEnvironment.ts
@src/backend/tools/winetricksOutputClassifier.ts
@src/backend/tools/__tests__/winetricksListAvailable.test.ts
@src/backend/tools/__tests__/winetricksOutputClassifier.test.ts

Read only these ranges of the large files:
- `src/backend/tools/index.ts` L1-90 (imports), L572-855 (`runWithArgs`: `wineBin` at ~L628, `envs` at ~L671, the `checkDependencies(...)` fire-and-forget call at ~L748-754, `spawn(winetricks, args, { env: envs })` at ~L759), L856-918 (`listAvailable`), L1019-1052 (`checkDependencies`, the shape to mirror).
- `src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts` L1-130 (mocks + harness) and L425-445 (the `environment recording (D-16)` list-all test).

Measured facts this plan builds on (planner, 2026-10-11, cwd = repo root):
- GPTK bottle binary `~/Library/Application Support/gamelib/tools/game-porting-toolkit/Game-Porting-Toolkit-latest/Contents/Resources/wine/bin/wine64`. Run under a fresh disposable fake HOME with `WINEDEBUG=-all ... --version`, stdout is exactly `wine-7.7 (Game Porting Toolkit 1.1)\n` (36 bytes, `od -c`), stderr is 0 bytes, it takes ~15 ms warm (3 runs), and the fake HOME holds 0 entries afterwards (no prefix created). `45-LIVE-GATE.md:41` records the same string for the gate's bottle.
- Winetricks derivation (pinned script, `~/Library/Application Support/heroic/tools/winetricks`). L5104 `WINETRICKS_WINE_VERSION=$(winetricks_early_wine --version | sed 's/.*wine/wine/')`, where `winetricks_early_wine` runs `WINEDEBUG=-all "$WINE" "$@"` and strips `\r`. L5114 `_wine_version_stripped=$(echo ... | cut -d ' ' -f1 | sed -e 's/wine-//' -e 's/-rc.*//')`. L5118 `if w_wine_version_in ,7.99`. That is `w_compare_wine_version -le 7.99`, a `sort -t. -k1,1n -k2,2n -k3,3n` position check, so numeric fields, not strings.
- Baseline, before any edit: `pnpm jest <winetricksListAvailable, winetricksInstallLifecycle, winetricksOutputClassifier, winetricksQueue, fakeHomeIsolation tests> --selectProjects Backend` gives `Test Suites: 5 passed, 5 total`, `Tests: 86 passed, 86 total`.
- Why `execFile` and not `spawn` for the probe. `winetricksListAvailable.test.ts`'s `listAvailableWith` drives `children[children.length - 1]` as the list-all child, and `winetricksInstallLifecycle.test.ts`'s `spawned(n)` asserts exact child counts on list runs (L199 `spawned(2)`, L428 `spawned(1)`). A second `spawn` would make the probe's child the "last child" and break every list test in both files. `execFile` leaves every existing `mockSpawn` pin exactly true. The two files then add an `execFile` mock and new pins on top.
- Both test files mock `child_process` as `{ ...jest.requireActual('child_process'), spawn: ... }`. Without an added `execFile` mock, the REAL `execFile` would try `/fake/wine/bin/wine`. `winetricksQueue.test.ts` never reaches a list run (`catalogFor` is spied, installs pass `returnOutput=false`), so it needs no change. `wineToolsFlows.test.ts` mocks `../../tools` wholesale.
- The frontend already accepts a run-less `winetricksQueueChanged` push for this game and replaces `queueState` wholesale (`WinetricksSettings/index.tsx:300-316`). It also reads `winetricksQueueState` after `listAvailable` + `listInstalled` resolve (~L254). So the banner needs no frontend change, which is the same path the missing-dependencies half of D-16 already uses.
- `fakeHomeIsolation.test.ts` flags a file that contains a spawn-family call (its regex includes `execFile(`) AND assigns any of HOME, USERPROFILE, APPDATA, LOCALAPPDATA, XDG_CONFIG_HOME, XDG_STATE_HOME, XDG_DATA_HOME or XDG_CACHE_HOME as an object-literal key. `tools/index.ts` already contains `spawn(` and passes. The probe's env literal assigns WINEDEBUG only.

<interfaces>
Existing contracts the executor builds on (verified at planning time):
- `src/backend/tools/winetricksEnvironment.ts:58` — `recordUnsupportedWine(runner: Runner, appName: string, version: string): void`. It returns early when `current.unsupportedWineVersion === version`, otherwise sets the value and calls `changeListener?.(runner, appName)`.
- `src/backend/tools/winetricksEnvironment.ts:28` — `getEnvironmentReport(runner, appName): WinetricksEnvironmentReport` (fresh copy). `:22` `onEnvironmentChanged(listener)` uses a single slot.
- `src/common/types.ts:910` — `WinetricksEnvironmentReport { unsupportedWineVersion: string | null; missingDependencies: string[] }` (unchanged by this plan).
- `src/backend/tools/winetricksOutputClassifier.ts:42` — `parseUnsupportedWineVersion(line: string): string | null`, regex `/Your version of wine (\S+) is no longer supported upstream/`. The module imports nothing but a type (header L3-8). Keep it that way.
- `Winetricks.checkDependencies(runner: Runner, appName: string, envs: Record<string, string>, appendMessage: (message: string) => void)` in `src/backend/tools/index.ts` (~L1019). It is called fire-and-forget from `runWithArgs` with `.catch((error) => logWarning(['Winetricks dependency check failed:', error], LogPrefix.WineTricks))`.
- `runWithArgs(runner, appName, args, returnOutput = false, envOverrides?, component = '', onDone?, onLine?)`. Only `listAvailable` passes `returnOutput = true` (with `{ LANG: 'C', LC_ALL: 'C' }`). `Winetricks.install` passes `false`.
- Backend jest config has `resetMocks: true` (`src/backend/jest.config.js:11`): every mock implementation is stripped before each test, so defaults belong in `beforeEach`.
</interfaces>

<assumption_delta_decision>
noun: writer of WinetricksEnvironmentReport.unsupportedWineVersion (singular -> plural: the handleLine `environment` branch, now joined by the list-all probe)
decision: add-alongside
rationale: Both writers derive the same string from the same binary with the same rule, so they cannot disagree for one wine. The probe is the only writer that may clear (null). The classifier branch stays for install runs, where winetricks prints its own warning.
</assumption_delta_decision>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Tracer — GPTK 7.7 at list-all reaches the environment report (probe, parser, list-run gate)</name>
  <files>src/backend/tools/winetricksOutputClassifier.ts, src/backend/tools/index.ts, src/backend/tools/__tests__/winetricksListAvailable.test.ts, src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts</files>
  <behavior>
    - In winetricksListAvailable.test.ts, listAvailable('gog', 'gptk-bottle') with the execFile stand-in answering stdout `wine-7.7 (Game Porting Toolkit 1.1)\n` (the measured GPTK bytes) leaves getEnvironmentReport('gog', 'gptk-bottle').unsupportedWineVersion === '7.7' once the list resolves. The returned list is unchanged (vcrun2019, gdiplus_winxp, fontsmooth=rgb).
    - The same call invokes the execFile stand-in once, with first argument '/fake/wine/bin/wine' and second argument ['--version']. Its options object has env.WINEDEBUG === '-all', env.LANG === 'C' (the same env the list-all child gets, overrides included) and env.WINEPREFIX === '/fake/prefix'.
    - With the stand-in answering an Error carrying code 'ENOENT', listAvailable('gog', 'enoent-bottle') still resolves to the same three verbs. The report for that app stays null and logWarning is called exactly once (the script is readable in this test, so that one warning is the probe's).
    - Every pre-existing test in winetricksListAvailable.test.ts and winetricksInstallLifecycle.test.ts passes UNCHANGED. Their mockSpawn counts and `spawned(n)` counts stay exact because the probe is not a spawn.
  </behavior>
  <action>
RED first. Write the tests below, run the Task 1 jest command and observe the new tests fail (execFile never called, report null). Then implement.

Test harness, winetricksListAvailable.test.ts:
- Declare `mockExecFile = jest.fn()` beside the other module-scope mocks.
- Add an `execFile` property to the existing `jest.mock('child_process', ...)` factory, forwarding to mockExecFile with the same arrow idiom `spawn` uses.
- In `beforeEach` (resetMocks strips implementations, so the default must live here and never at module scope), give mockExecFile a default implementation. It takes the LAST argument as the callback and calls it synchronously with (null, 'wine-9.0\n', ''). That is a supported wine, so every pre-existing test records nothing and logs nothing new. The default returns undefined.
- Add an optional `appName` parameter (default 'game') to `listAvailableWith` and pass it through to `Winetricks.listAvailable`.
- Import `getEnvironmentReport` from '../winetricksEnvironment'. That module is real in this file, so its Map persists across tests: give every new test its own appName.
- Add a describe titled 'unsupported-wine probe at list-all time (261011-iel, D-16)' holding the three new behaviours. After `await listAvailableWith(...)`, call `await flushMicrotasks()` before reading the report.

Test harness, winetricksInstallLifecycle.test.ts:
- Add `mockExecFile` and the same `execFile` forward to its `child_process` mock. Give it NO default implementation. It stays inert: it never calls its callback, so the probe never settles and records or logs nothing. This file pins winetricks' event lifecycle and its logDebug/logError counts (including `logDebug` not called on a list run, ~L395), not the probe.
- Add a one-line comment at the mock saying exactly that. It keeps the file header's "NO REAL WINE OR WINETRICKS IS SPAWNED" claim true now that a list run probes wine.

Implementation, winetricksOutputClassifier.ts. Add two pure exports directly below `parseUnsupportedWineVersion`:
- `parseWineVersionOutput(raw: string): string | null` reproduces winetricks' derivation step for step:
  - take the first line of `raw` that is non-empty after removing `\r` (`winetricks_early_wine` strips `\r`);
  - replace the greedy match of `.*wine` on that line with `wine` (sed `s/.*wine/wine/`: first match, greedy, so up to the LAST lowercase `wine`);
  - keep the text before the first space (`cut -d ' ' -f1`);
  - remove the first occurrence of `wine-`;
  - remove `-rc` and everything after it;
  - return the result only if it starts with a decimal digit, otherwise null.
- `isUnsupportedWineVersion(version: string): boolean` is winetricks' `w_wine_version_in ,7.99`:
  - split `version` on '.' and take the first three fields;
  - parse each with parseInt base 10, treating NaN or a missing field as 0 (as `sort -n` does);
  - compare the fields numerically, in order, against (7, 99, 0) and return true iff less than or equal. Never compare strings: '10.0' must be supported.
- Add one bullet to the header's "Measured facts" list naming the derivation (script L5104/L5114/L5118). Keep the module importing nothing but a type.

Implementation, src/backend/tools/index.ts:
- Import `execFile` alongside `spawn` from 'child_process'. Import `parseWineVersionOutput` and `isUnsupportedWineVersion` from './winetricksOutputClassifier'.
- Add module-level constants `WINE_VERSION_PROBE_TIMEOUT_MS = 5_000` and `WINE_VERSION_PROBE_MAX_BUFFER = 16 * 1024`. Their comment cites the measurement above: 36 bytes stdout, 0 bytes stderr, ~15 ms warm, GPTK wine64, 2026-10-11.
- Add a non-exported module-level function `readWineVersionOutput(wineBin: string, envs: Record<string, string>)` returning `Promise<{ stdout: string } | { error: unknown }>`.
  - It wraps execFile's CALLBACK form in `new Promise`, with options: env = a spread of envs plus WINEDEBUG '-all', encoding 'utf8', timeout, killSignal 'SIGKILL', maxBuffer.
  - The callback resolves `{ error }` when error is non-null, else `{ stdout: String(stdout) }`. A try/catch around the call resolves `{ error }` on a synchronous throw.
  - Never touch the returned ChildProcess. Do not unref it either: it is a bounded child (5 s, SIGKILL), it runs beside the list-all child (which is itself referenced and has no timeout), and the Rust shell's process-group kill reaps it at app exit. Say so in a two-line comment.
  - Do not convert execFile with Node's util promise-conversion helper. The native function's custom hook is what makes it resolve `{ stdout, stderr }`; a jest stand-in has no such hook and would resolve a bare string, so tests and production would see different shapes.
  - Do not use execAsync or exec. They run through a shell, and a wine path containing a quote would break the `'${wineBin}'` quoting that the compatibility_layers.ts sites rely on.
- Add a new `Winetricks` method `checkWineVersion(runner: Runner, appName: string, wineBin: string, envs: Record<string, string>): Promise<void>`, placed directly after `checkDependencies` (same family, same envs type). It does the following:
  - await readWineVersionOutput;
  - on `{ error }`, call logWarning once with ['Could not read the wine version for the winetricks environment banner:', error] and LogPrefix.WineTricks, then return;
  - otherwise parse stdout with parseWineVersionOutput. On null, call logWarning once naming the first 200 characters of stdout, then return;
  - when isUnsupportedWineVersion(version) is true, call recordUnsupportedWine(runner, appName, version). Task 2 adds the supported branch.
  - Log nothing on success.
- In `runWithArgs`, add the gate directly after the existing `Winetricks.checkDependencies(...).catch(...)` statement and before the `Running ...` logInfo and the `spawn` call:
  - when `returnOutput` is true, call `Winetricks.checkWineVersion(runner, appName, wineBin, envs)` fire-and-forget, with a `.catch` that calls logWarning once (mirroring checkDependencies' catch).
  - Write a 3-6 line comment covering four points. (1) list-all is the one run where winetricks skips its own check: `_W_wine_not_needed=1` at script L5471, and the early return before L5119. (2) Install runs print winetricks' own warning, which the `environment` branch of handleLine already records, so they are not probed. (3) It is fire-and-forget like checkDependencies; the record reaches the tab through `onEnvironmentChanged`, which pushes `winetricksQueueChanged`, or through the tab's `winetricksQueueState` read after listAvailable resolves. (4) Only listAvailable passes returnOutput true.

Conventions:
- Fake-HOME two-profile rule: this is a production spawn site, and the child must inherit the user's real environment because it runs the user's wine. The env literal assigns WINEDEBUG only, none of the eight keys, so `fakeHomeIsolation.test.ts` stays green. Tests replace execFile, so no child process is created and no fake profile is needed. Do not write any of the eight keys into a test env fixture.
- Sidecar exit contract: our code creates no timer, watcher or socket. execFile's own timeout timer is cleared by Node when the child exits. Nothing runs at boot.

Commit, after the verify passes: `fix(winetricks): derive the unsupported-wine banner from wine --version at list-all time (261011-iel)`.
  </action>
  <verify>
    <automated>pnpm jest src/backend/tools/__tests__/winetricksListAvailable.test.ts src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts src/backend/tools/__tests__/winetricksOutputClassifier.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts --selectProjects Backend --silent</automated>
    <automated>test "$(grep -v '^[[:space:]]*//' src/backend/tools/index.ts | grep -c 'execFile(')" -eq 1 && pnpm codecheck && npx eslint src/backend/tools/index.ts src/backend/tools/winetricksOutputClassifier.ts src/backend/tools/__tests__/winetricksListAvailable.test.ts src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts</automated>
    <automated>npx prettier --file-info src/backend/tools/index.ts | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --file-info src/backend/tools/winetricksOutputClassifier.ts | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --file-info src/backend/tools/__tests__/winetricksListAvailable.test.ts | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --file-info src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --check src/backend/tools/index.ts src/backend/tools/winetricksOutputClassifier.ts src/backend/tools/__tests__/winetricksListAvailable.test.ts src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts</automated>
  </verify>
  <done>
The new describe was observed RED before the implementation and GREEN after. All four jest files pass, and every pre-existing test in them is unchanged. tools/index.ts has exactly one execFile call site, outside comments. codecheck, eslint and scoped prettier exit 0. One `fix(winetricks): ... (261011-iel)` commit.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Expansion — exact derivation table, numeric threshold, clear-on-supported, failure modes, precise re-pins</name>
  <files>src/backend/tools/winetricksEnvironment.ts, src/backend/tools/index.ts, src/backend/tools/__tests__/winetricksOutputClassifier.test.ts, src/backend/tools/__tests__/winetricksListAvailable.test.ts, src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts</files>
  <behavior>
    - parseWineVersionOutput table (it.each):
      - 'wine-7.7 (Game Porting Toolkit 1.1)\n' -> '7.7'
      - 'wine-7.7\n' -> '7.7'
      - 'wine-1.9.22 (Debian 1.9.22-1)\n' -> '1.9.22'
      - 'wine-1.9.22 (Staging)\n' -> '1.9.22'
      - 'wine-2.0 (Debian 2.0-1)\n' -> '2.0'
      - 'wine-2.0-rc1\n' -> '2.0'
      - 'wine-9.0\r\n' -> '9.0'
      - 'wine-10.0\n' -> '10.0'
      - '\nwine-8.0\n' -> '8.0'
      - 'prefix junk wine-7.7\n' -> '7.7' (greedy sed parity)
      - '' -> null; '\n\n' -> null; 'not a version\n' -> null
    - Parity property: for every row of the table that yields a version v, parseUnsupportedWineVersion(`warning: Your version of wine ${v} is no longer supported upstream. You should upgrade to 8.x`) === v. That is the probe string equalling what the classifier captures from winetricks' own line.
    - isUnsupportedWineVersion table:
      - true: '7.7', '1.9.22', '2.0', '7.99', '7'
      - false: '8.0', '8.21', '9.0', '10.0', '7.99.1'
    - Clear: with an onEnvironmentChanged jest.fn listener registered, listing 'switch-bottle' runs as follows:
      - stand-in answers 'wine-9.0\n': listener not called, report null;
      - then 'wine-7.7 (Game Porting Toolkit 1.1)\n': listener called once, report '7.7';
      - the same 7.7 again: still once;
      - then 'wine-9.0\n': twice, report null.
    - Unknown never clears: 'unknown-bottle' records '7.7', then the stand-in answers stdout ''. The report stays '7.7' and logWarning is called exactly once in that second call.
    - Synchronous throw: the stand-in throws. listAvailable still resolves to the three verbs, the report is unchanged and logWarning is called once.
    - Bounds pin: the options object carries timeout 5000, killSignal 'SIGKILL', maxBuffer 16384 and encoding 'utf8'.
    - Re-pin of the existing test 'invokes the winetricks process exactly once per call (list-all only, no second metadata spawn)'. Keep both existing mockSpawn assertions verbatim (toHaveBeenCalledTimes(1), args ['list-all']). Add: mockExecFile toHaveBeenCalledTimes(1), calls[0][0] === '/fake/wine/bin/wine', calls[0][1] deep-equals ['--version']. Retitle it to end '... plus exactly one wine --version probe (execFile, not a winetricks spawn)'.
    - Re-pin of 'does not re-read the script while its mtime and size are unchanged': keep mockSpawn toHaveBeenCalledTimes(2) and add mockExecFile toHaveBeenCalledTimes(2). The probe is NOT cached, because a bottle's wine can change between tab opens.
    - winetricksInstallLifecycle.test.ts:
      - a Winetricks.install run (spawned(1), exit/close 0) leaves mockExecFile not called;
      - the existing 'records the wine version from the unsupported-wine notice during a list-all run' test additionally asserts mockExecFile toHaveBeenCalledTimes(1) with ['--version'] as its second argument.
  </behavior>
  <action>
RED first. Write all the tests above, then run the Task 2 jest command. The clear rows (the listener fire count and the report going back to null) must fail against Task 1's code, which never clears. Record the RED line. The table, parity, threshold, failure and re-pin rows are expected to pass already (Task 1 implemented them). That is fine for expansion pins; do not weaken a row to force a RED.

Implementation, per D-16 and the planning decision on stale records. In winetricksEnvironment.ts, widen recordUnsupportedWine's `version` parameter to `string | null`, with a short doc comment:
- null means "this bottle's wine is supported", and only the list-all probe writes it;
- the existing equality early-return already makes null -> null a no-op, so the listener does not fire.
Leave every other line of the module unchanged.

In `Winetricks.checkWineVersion` (tools/index.ts), replace the unsupported-only branch with a call to recordUnsupportedWine(runner, appName, isUnsupportedWineVersion(version) ? version : null). Add a 3-5 line comment recording the decision to CLEAR. Its four reasons:
- the probe runs against the bottle's CURRENT wine at every tab open;
- it uses winetricks' own derivation and threshold, so for one binary it cannot disagree with the install-time record;
- without clearing, switching a bottle from GPTK 7.7 to a supported wine leaves a false banner for the whole sidecar life;
- recordMissingDependencies already clears on an empty subset.
State in the same comment that a failed, timed-out, oversized or unparseable probe never clears: absence of evidence is not evidence.

Write tests per the behavior block:
- classifier tests go in winetricksOutputClassifier.test.ts, as new describes `parseWineVersionOutput` and `isUnsupportedWineVersion`, placed beside the existing `parseUnsupportedWineVersion` describe, with the parity property as an it.each over the version-yielding rows;
- the probe, clear, unknown, throw and bounds tests and both re-pins go in winetricksListAvailable.test.ts, each with its own appName;
- the install-never-probes test and the extra assertion on the D-16 list-all test go in winetricksInstallLifecycle.test.ts.
Register the listener in winetricksListAvailable.test.ts with `onEnvironmentChanged` from '../winetricksEnvironment'. The slot is single and the queue module is not loaded in that file, so a jest.fn listener is safe there.

Then run the verify. When it is GREEN, run `graphify update .` (AST-only, per CLAUDE.md; ~40-80 s; it does not gate). Commit `fix(winetricks): clear a stale unsupported-wine record when the bottle's wine is supported (261011-iel)`.
  </action>
  <verify>
    <automated>pnpm jest src/backend/tools/__tests__/winetricksListAvailable.test.ts src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts src/backend/tools/__tests__/winetricksOutputClassifier.test.ts src/backend/tools/__tests__/winetricksQueue.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts --selectProjects Backend --silent</automated>
    <automated>pnpm codecheck && npx eslint src/backend/tools/index.ts src/backend/tools/winetricksEnvironment.ts src/backend/tools/__tests__/winetricksOutputClassifier.test.ts src/backend/tools/__tests__/winetricksListAvailable.test.ts src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts && pnpm find-deadcode</automated>
    <automated>npx prettier --file-info src/backend/tools/index.ts | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --file-info src/backend/tools/winetricksEnvironment.ts | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --file-info src/backend/tools/__tests__/winetricksOutputClassifier.test.ts | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --file-info src/backend/tools/__tests__/winetricksListAvailable.test.ts | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --file-info src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --check src/backend/tools/index.ts src/backend/tools/winetricksEnvironment.ts src/backend/tools/__tests__/winetricksOutputClassifier.test.ts src/backend/tools/__tests__/winetricksListAvailable.test.ts src/backend/tools/__tests__/winetricksInstallLifecycle.test.ts</automated>
  </verify>
  <done>
The clear rows were observed RED, with the failing line recorded for the SUMMARY, and GREEN after. All five jest files pass. winetricksQueue.test.ts is untouched and still green. The suite total is the 86 baseline plus the new tests, with 0 failures. codecheck, eslint, find-deadcode and scoped prettier exit 0. `graphify update .` has run. One `fix(winetricks): ... (261011-iel)` commit.
  </done>
</task>

<task type="auto">
  <name>Task 3: Close the todo; leave the live-gate record and UAT file alone</name>
  <files>.planning/todos/pending/2026-10-11-gptk-banner-cannot-appear-at-tab-open-because-list-all-skips-the-version-check.md, .planning/todos/completed/2026-10-11-gptk-banner-cannot-appear-at-tab-open-because-list-all-skips-the-version-check.md</files>
  <action>
Move the todo with `git mv` from `.planning/todos/pending/` to `.planning/todos/completed/` (the sibling-closed-todo directory, confirmed by `ls .planning/todos/`). Do not change its frontmatter; the sibling closed todos keep theirs verbatim. Append a section headed `## Resolution (2026-10-11, quick 261011-iel, commits <task1-hash>, <task2-hash>)`, with the real short hashes. Hand-match the file's existing wrap of about 100 columns. The section has six short paragraphs:
(a) Mechanism: at list-all time `runWithArgs` runs `Winetricks.checkWineVersion`. It calls `execFile(wineBin, ['--version'])` with no shell, WINEDEBUG=-all and the list child's env, bounded at 5 s with SIGKILL and 16 KiB, fire-and-forget like `checkDependencies`. The report reaches the tab via the `winetricksQueueChanged` push or the tab's `winetricksQueueState` read.
(b) Derivation: it mirrors winetricks' own steps (script L5104/L5114, threshold `,7.99` at L5118, compared as numbers), so GPTK's `wine-7.7 (Game Porting Toolkit 1.1)` gives the same `7.7` the install-time warning gives.
(c) Decision: a supported wine clears a stale record. A failed or unparseable probe changes nothing.
(d) Pins: the test names, the RED line observed in each task, and the GREEN totals.
(e) NOT live-verified. 45-LIVE-GATE.md G6 and 45-UAT.md item 6 both stay `issue`. The operator re-scores them at the next 45-12 re-run: open Alan Wake's Winetricks tab before any Apply in a fresh launch, and record `wine64 --version`.
(f) The gate file was deliberately left unannotated. It is a dated run record whose own text says "the criteria above are unchanged" and "nothing in the Results was inferred". It is not a `*-UAT.md` file, so the UAT item-shape rule does not govern it. A desk-only fix pointer placed under `### G6` would edit the criterion block and read as a re-score. The pointer lives here instead.

Do not edit `.planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-LIVE-GATE.md` or `.../45-UAT.md`. Do not touch STATE.md: the orchestrator owns it.

Run `pnpm planning-gates` (completed/ is exempt from the todo-frontmatter gate; run it anyway, since a gate must stay green). Commit with `docs(quick-261011-iel): close the GPTK tab-open banner todo`.

Prettier: `.planning/` is in `.prettierignore`, so `--check` over these paths is vacuous. The verify below proves the path is ignored and omits the check, per the conventions skill.
  </action>
  <verify>
    <automated>test -f .planning/todos/completed/2026-10-11-gptk-banner-cannot-appear-at-tab-open-because-list-all-skips-the-version-check.md && test ! -e .planning/todos/pending/2026-10-11-gptk-banner-cannot-appear-at-tab-open-because-list-all-skips-the-version-check.md && grep -q '^## Resolution (2026-10-11, quick 261011-iel' .planning/todos/completed/2026-10-11-gptk-banner-cannot-appear-at-tab-open-because-list-all-skips-the-version-check.md && git diff --quiet HEAD -- .planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-LIVE-GATE.md .planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-UAT.md && pnpm planning-gates</automated>
    <automated>npx prettier --file-info .planning/todos/completed/2026-10-11-gptk-banner-cannot-appear-at-tab-open-because-list-all-skips-the-version-check.md | grep -Eq '"ignored":[[:space:]]*true' && echo "prettier ignores .planning/ — --check deliberately omitted (vacuous)"</automated>
  </verify>
  <done>
The todo is in completed/ and absent from pending/. It carries the Resolution section with real hashes. 45-LIVE-GATE.md and 45-UAT.md have no diff. planning-gates exits 0. One `docs(quick-261011-iel): ...` commit, containing only the moved todo.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user wine settings -> sidecar child process | `wineBin` comes from the game's configurable wine selection. It is the same value the list-all child and every install and launch already use. |
| child stdout -> environment report -> renderer | Untrusted bytes from a third-party binary become a string shown in the banner. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261011-iel-01 | Elevation of Privilege / Tampering | `readWineVersionOutput` execFile(wineBin) | medium | mitigate | `execFile` takes an argv array with no shell, so a wine path containing quotes or metacharacters cannot inject (unlike the `'${wineBin}' --version` execAsync sites in compatibility_layers.ts). The binary and env are the same ones the list-all child already receives, so no new trust is granted. |
| T-261011-iel-02 | Denial of Service | probe child that never exits | medium | mitigate | execFile `timeout: 5000` plus `killSignal: 'SIGKILL'`. The call is fire-and-forget, so the list never waits on it. Our code creates no timer. It runs on a renderer listAvailable call, not at boot. At app exit the Rust shell's process-group kill reaps it. |
| T-261011-iel-03 | Denial of Service | unbounded child stdout/stderr | low | mitigate | `maxBuffer: 16384`. Overflow makes Node kill the child and pass an error, which changes nothing. The logged excerpt is capped at 200 chars. |
| T-261011-iel-04 | Tampering (integrity of displayed state) | stale or incorrect banner | medium | mitigate | A definitive supported parse clears the record. An unknown result never clears. A derivation identical to winetricks', backed by a parity test against `parseUnsupportedWineVersion`, means the probe and install-time records cannot disagree for one binary. The listener fires only on change. |
| T-261011-iel-05 | Denial of Service | unhandled spawn failure (ENOENT, EACCES, sync throw) crashing the sidecar | high | mitigate | The callback form surfaces async spawn errors through the callback (no unlistened 'error' emitter), and try/catch converts a synchronous throw. Both resolve `{ error }`, then one logWarning. The runWithArgs call site keeps a `.catch`. Pinned by the ENOENT and throw tests. |
| T-261011-iel-06 | Information Disclosure | logWarning text | low | accept | It logs the error object (which may include the binary path, already logged by `Running ...`) or ≤200 chars of a version banner. Neither is a secret. |
| T-261011-iel-SC | Tampering | npm/pip/cargo installs | high | accept | This plan installs no packages, so there is nothing to gate. `child_process` is a Node built-in. |
</threat_model>

<verification>
- Backend jest over the five touched or adjacent files passes. Totals are the 86 baseline plus the new tests, with 0 failures.
- `pnpm codecheck`, scoped `npx eslint`, `pnpm find-deadcode` and `pnpm lint` (both ceilings) exit 0.
- Scoped `npx prettier --check` over every written `src/` path exits 0, after `--file-info` confirms each one is not ignored. `.planning/` paths are proven ignored and their check is omitted.
- `fakeHomeIsolation.test.ts` is green, and no test env fixture assigns any of the eight home/config/state keys.
- `git diff --stat` for the code commits touches only the six `src/backend/tools/` paths in files_modified. `src/frontend/` and `public/locales/` are byte-unchanged.
- Live (owed, not in this plan): first tab open on the GPTK bottle in a fresh launch, before any Apply, shows the banner with version 7.7. The operator records it at the next 45-12 re-run, which re-scores G6 and 45-UAT item 6.
</verification>

<success_criteria>
- A list-all run on a wine older than 8 records the winetricks-identical version string before any install, so the D-16 banner is reachable at tab open.
- A supported wine clears a stale record. A failed or unknown probe is silent apart from one warning, and the list itself is never affected.
- Exactly one winetricks spawn and one `wine --version` execFile happen per list call, and none happen on install runs. All of this is pinned.
- The todo is closed with a Resolution. The live-gate record and the UAT file are untouched.
</success_criteria>

<output>
Create `.planning/quick/261011-iel-gptk-environment-banner-d-16-cannot-appe/261011-iel-SUMMARY.md` when done. Include the RED line observed in each task, the GREEN totals, both fix commit hashes, and the owed live re-score of G6 / 45-UAT item 6.
</output>
