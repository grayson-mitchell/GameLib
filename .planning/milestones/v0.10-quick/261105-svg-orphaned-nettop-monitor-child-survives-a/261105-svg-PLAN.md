---
phase: quick-261105-svg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/childWatchdog.ts
  - src/backend/storeManagers/steam/__tests__/childWatchdog.test.ts
  - src/backend/storeManagers/steam/steamDownloadMonitor.ts
  - src/backend/storeManagers/steam/__tests__/steamDownloadMonitor.test.ts
  - .planning/todos/pending/2026-11-05-orphaned-nettop-after-sidecar-kill.md
  - .planning/todos/completed/2026-11-05-orphaned-nettop-after-sidecar-kill.md
autonomous: true
requirements: [QUICK-261105-svg]

must_haves:
  truths:
    - "After the spawning node process is SIGKILLed, the script and nettop children of a download monitor are gone within 5 seconds, with no next sidecar boot needed"
    - "If the script middle process dies first (the SIGPIPE shape seen in the field: nettop ppid 1, no script parent), the recorded nettop grandchild is still killed once the parent is gone"
    - "A clean stop (SIGTERM to the monitor child, from stopSteamDownloadMonitor, stopAllSteamDownloadMonitors or the Rust process-group SIGTERM) still removes script and nettop within 2 seconds"
    - "When the pinned Steam pid exits, the monitor tree exits instead of idling forever"
    - "The sidecar exit contract is unchanged: the monitor child and its stdout are still unref'd, no timer, watcher or interval is added in node, and the spawn still passes no env"
  artifacts:
    - path: "src/backend/storeManagers/steam/childWatchdog.ts"
      provides: "WATCHDOG_SH script constant and buildWatchdogSpawn(parentPid, watchPid, inner) returning { file: '/bin/sh', args }"
      exports: ["WATCHDOG_SH", "buildWatchdogSpawn"]
    - path: "src/backend/storeManagers/steam/__tests__/childWatchdog.test.ts"
      provides: "real-process tests of the watchdog (parent SIGKILL, middle-dies-first, clean SIGTERM, watched pid exit) plus an env-gated live nettop proof"
    - path: "src/backend/storeManagers/steam/steamDownloadMonitor.ts"
      provides: "monitor spawns the nettop tree through buildWatchdogSpawn with the sidecar pid"
      contains: "buildWatchdogSpawn"
    - path: ".planning/todos/completed/2026-11-05-orphaned-nettop-after-sidecar-kill.md"
      provides: "closed todo with a Resolution section citing the measured kill-to-gone times"
  key_links:
    - from: "src/backend/storeManagers/steam/steamDownloadMonitor.ts"
      to: "src/backend/storeManagers/steam/childWatchdog.ts"
      via: "startSteamDownloadMonitor calls buildWatchdogSpawn(deps.parentPid, steamPid, nettopArgv)"
      pattern: "buildWatchdogSpawn\\("
    - from: "WATCHDOG_SH"
      to: "the sidecar pid"
      via: "kill -0 poll of the explicit parent pid passed as $1 (not $PPID, which is frozen at sh start)"
      pattern: "kill -0"
---

<objective>
Make a Steam download monitor's `script` + `nettop` children unable to outlive a hard-killed sidecar, then close the todo `.planning/todos/pending/2026-11-05-orphaned-nettop-after-sidecar-kill.md`. Its "Done when" is the acceptance bar: a parent-death watchdog, proved by SIGKILLing the parent mid-run.

Purpose: SIGKILL or Force Quit of the sidecar skips both the Node stop paths and the Rust `shutdown_child`, which leaves an orphaned nettop idling for days (seen: pid 16358, ppid 1, running from 2026-11-02 to 2026-11-05).

Output: a small `/bin/sh` watchdog wrapper (childWatchdog.ts) that the monitor spawns in place of bare `script`, real-process tests for it, an env-gated live proof against real script/nettop, and the closed todo.

Design (Claude's discretion, chosen over a reap at next boot because it works without a next boot, which is the orchestrator's stated preference):
- The node child becomes `/bin/sh -c WATCHDOG_SH gamelib-watchdog <parentPid> <watchPid> <inner argv...>`. The inner argv is the existing script/nettop argv, unchanged.
- The watchdog runs the inner argv in the background, records its pid (`m`), and on every tick records the inner process's children (`pgrep -P m`; keep the last non-empty result). It must record them because of the field evidence: the orphan had **no script parent**. The likely cause is that script died of SIGPIPE writing to the dead sidecar's pipe, leaving nettop reparented to launchd. Killing script alone would miss nettop.
- The loop continues while `kill -0` succeeds for the parent pid AND the inner pid AND the watched (Steam) pid. Each tick waits as `sleep 1 & wait $!` so that a TERM trap fires immediately rather than after the sleep.
- On loop exit, and in a TERM/INT/HUP trap, a cleanup kills the recorded grandchildren and the inner pid with TERM, then exits. The sh writes nothing to stdout, so the dead pipe cannot SIGPIPE it.
- It passes the parent pid explicitly, never `$PPID`: once the parent dies, sh is reparented, but `$PPID` stays frozen at its start-time value.
- Everything runs in the child, not in node. That keeps the sidecar exit contract intact: node gains no timer, no watcher and no extra handle, and the single child plus its stdout stay unref'd.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-11-05-orphaned-nettop-after-sidecar-kill.md
@src/backend/storeManagers/steam/steamDownloadMonitor.ts
@src/backend/storeManagers/steam/__tests__/steamDownloadMonitor.test.ts

Load `Skill("gamelib-conventions")` sections "Fake-HOME isolation", "The sidecar's exit contract" and "A formatter check belongs in every task's `<verify>`" before editing.

<interfaces>
From src/backend/storeManagers/steam/steamDownloadMonitor.ts (current):
- `export type MonitorChild = { stdout: ({ on(e:'data', cb) } & { unref?() }) | null; on(e: string, cb); kill(signal?): unknown; unref(): void }`
- `export type MonitorDeps = { platform; listPids: () => Promise<number[] | undefined>; spawn: (file: string, args: string[], options: { stdio: ['ignore','pipe','ignore'] }) => MonitorChild; readTail; now }`
- `defaultDeps()` builds deps. Its spawn passes no `env` (the two-profile rule: nettop reads no profile).
- Lines 186-204 currently call `deps.spawn('/usr/bin/script', ['-q','/dev/null','/usr/bin/nettop','-x','-n','-L','0','-s','1','-J','bytes_in','-p', String(pid)], { stdio: ['ignore','pipe','ignore'] })`, where `pid = Math.min(...pids)`.
- `kill(m)` sends `m.child?.kill('SIGTERM')`. stopAllSteamDownloadMonitors runs at stdin EOF (stdinEofRelease.ts).
- The module docstring (lines 1-19) states the exit-contract and two-profile reasoning. It must be updated to describe the watchdog.

From the existing test: `setup()` builds a FakeChild plus deps with `platform: 'darwin'` and `listPids: async () => [900, 500]`. The first test asserts the exact spawn file/args, that there is no `env`, and that unref is called.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add the parent-death watchdog and route the monitor spawn through it</name>
  <files>src/backend/storeManagers/steam/childWatchdog.ts, src/backend/storeManagers/steam/__tests__/childWatchdog.test.ts, src/backend/storeManagers/steam/steamDownloadMonitor.ts, src/backend/storeManagers/steam/__tests__/steamDownloadMonitor.test.ts</files>
  <behavior>
    Tests in childWatchdog.test.ts run real processes. Skip them with `describe.skip` on win32 only; they must pass on darwin and on linux CI, where /bin/sh, pgrep and sleep all exist. Each test spawns a throwaway parent: `process.execPath -e <src>`, with no `env` (it reads no profile, and it is not the sidecar or SEA binary, so the fake-HOME harness is not required; say so in a comment). The parent spawns the watchdog via buildWatchdogSpawn, using `process.pid` as parentPid and stdio ['ignore','pipe','ignore'], and unrefs the child and its stdout. It prints the watchdog pid as a line on its own stdout, then idles on a ref'd `setInterval`. The test resolves the inner pid and grandchild pid with `pgrep -P`, retrying for up to 2s. The fake inner command is `/bin/sh -c 'sleep 300 & wait'`, which gives the same middle/grandchild shape as script/nettop.
    - Test 1 (hard kill): SIGKILL the throwaway parent. Within 5s, `kill -0` fails for the watchdog, the inner sh and the sleep grandchild.
    - Test 2 (middle dies first, the field shape): SIGKILL the inner sh. The grandchild sleep survives it, matching the orphan with no script parent. Then SIGKILL the throwaway parent. Within 5s the grandchild is gone.
    - Test 3 (clean stop): SIGTERM the watchdog pid while the parent is alive. Within 2s the watchdog, the inner sh and the grandchild are all gone. Kill the parent afterwards.
    - Test 4 (watched pid exits): the test spawns its own `sleep 300` as watchPid. Kill it. Within 5s the inner tree and the watchdog are gone, while the parent is still alive.
    - Test 5 (pure): buildWatchdogSpawn(11, 22, ['/x','a']) returns `{ file: '/bin/sh', args: ['-c', WATCHDOG_SH, 'gamelib-watchdog', '11', '22', '/x', 'a'] }`.
    Every test kills any leftover pid it discovered in afterEach (best-effort SIGKILL) so a failing run leaves no strays.
    In steamDownloadMonitor.test.ts, update the first test. The spawn now has file '/bin/sh' and args equal to buildWatchdogSpawn(4242, 500, the unchanged script/nettop argv).args, where setup supplies `parentPid: 4242`. It still asserts that there is no env property and that unref is called on both child and stdout. All other existing tests stay green unchanged.
  </behavior>
  <action>
    Create src/backend/storeManagers/steam/childWatchdog.ts, exporting `WATCHDOG_SH` (a string constant holding the POSIX sh program) and `buildWatchdogSpawn(parentPid: number, watchPid: number, inner: string[]): { file: string; args: string[] }`. The second returns file `/bin/sh` and args `['-c', WATCHDOG_SH, 'gamelib-watchdog', String(parentPid), String(watchPid), ...inner]`. The positional `$0` name is `gamelib-watchdog`, which makes the process identifiable in `ps`.

    WATCHDOG_SH behaviour, in order:
    1. Read `p=$1` and `w=$2`, then `shift 2`.
    2. Start `"$@" &` and store `m=$!`, with `g=` empty.
    3. Define `cleanup`. It does a best-effort `kill` (TERM, stderr to /dev/null) of `$g` and `$m`, kills the in-flight tick sleep if one is set, and exits 0.
    4. Set `trap cleanup TERM INT HUP`.
    5. Loop while `kill -0 "$p" && kill -0 "$m" && kill -0 "$w"` (each 2>/dev/null). In each tick, set `c=$(pgrep -P "$m" 2>/dev/null)` and, if non-empty, `g=$c`. Then run `sleep 1 & s=$!; wait "$s"`.
    6. After the loop, call `cleanup`.

    Rules for the script:
    - Use only builtins plus pgrep and sleep, resolved through PATH; the spawn inherits the sidecar's PATH.
    - The sh writes nothing to stdout.
    - Do not use `exec` and do not use `$PPID` (see the objective for why).
    - Header comment: give the hard-kill rationale, the field evidence (nettop ppid 1, no script parent, likely from script dying of SIGPIPE), and why the explicit parent pid is used.
    - Accepted pid-reuse risk: a kill on a recycled pid inside one 1s tick is possible but negligible, because macOS pids increment. Note this in the comment.

    In steamDownloadMonitor.ts:
    - Add `parentPid: number` to MonitorDeps. Set it to `process.pid` in defaultDeps.
    - Keep the existing script/nettop argv exactly. Build it as a local `inner` array (`['/usr/bin/script','-q','/dev/null','/usr/bin/nettop',...,'-p',String(pid)]`), then call `const { file, args } = buildWatchdogSpawn(deps.parentPid, pid, inner)` and `deps.spawn(file, args, { stdio: ['ignore','pipe','ignore'] })`. Still pass no env.
    - Leave `child.unref()`, `child.stdout?.unref?.()`, `kill(m)` with SIGTERM, and the error/exit handlers unchanged. The child's 'exit' now also fires when Steam exits, which already routes to fail(m) and so to the ACF fallback. That is correct.
    - Rewrite the module docstring's exit-contract paragraph. The node child is now the sh watchdog, and the watchdog makes the tree die within about 1s of a hard sidecar kill. Rust shutdown_child remains the backstop for normal exit, because the watchdog traps the group SIGTERM and kills script and nettop. Nettop runs in script's own pty session, so the group signal never reached it directly.
    - Do not add any timer, interval or watcher in node, per the sidecar exit contract.

    Update steamDownloadMonitor.test.ts: add `parentPid: 4242` to setup() deps and update the first test per the behavior block. Write the tests first and run them red, then implement.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --runTestsByPath src/backend/storeManagers/steam/__tests__/childWatchdog.test.ts src/backend/storeManagers/steam/__tests__/steamDownloadMonitor.test.ts && pnpm codecheck && npx prettier --check src/backend/storeManagers/steam/childWatchdog.ts src/backend/storeManagers/steam/__tests__/childWatchdog.test.ts src/backend/storeManagers/steam/steamDownloadMonitor.ts src/backend/storeManagers/steam/__tests__/steamDownloadMonitor.test.ts && npx jest --runTestsByPath src/backend/__tests__/fakeHomeIsolation.test.ts && pnpm lint</automated>
  </verify>
  <done>All 5 watchdog tests and the full steamDownloadMonitor suite pass. codecheck, lint, prettier (all 4 paths are prettier-visible .ts) and the fakeHomeIsolation gate are green. Every pid each test discovered is confirmed dead by the test itself. The monitor spawns `/bin/sh` with the watchdog args and passes no env.</done>
</task>

<task type="auto">
  <name>Task 2: Live proof against real script/nettop: baseline orphan, then fixed</name>
  <files>src/backend/storeManagers/steam/__tests__/childWatchdog.test.ts</files>
  <action>
    Add a darwin-only, env-gated live block to childWatchdog.test.ts. Gate it with `describe.skip` unless `process.platform === 'darwin'` and `process.env.GAMELIB_LIVE_NETTOP === '1'`, following the precedent of GAMELIB_REQUIRE_WINE_HARNESS in package.json. State in a comment that the block is skipped by default and is not a CI gate, so its skip is not a false green.

    The block pins nettop to a harness-owned `sleep 600` pid, never to Steam. It reads no user profile and touches no app state.

    It runs two arms. Each arm starts a throwaway `process.execPath -e` parent (no env) that spawns with stdio ['ignore','pipe','ignore'], unrefs, prints the child pid, and idles on a ref'd interval. The harness reads 3 seconds of output from the parent so that nettop is running and writing. It then SIGKILLs the parent and polls `pgrep -f "nettop -x -n -L 0 -s 1 -J bytes_in -p <sleepPid>"` and `kill -0` on the script pid.
    1. Baseline arm: the parent spawns the OLD shape, which is bare `/usr/bin/script -q /dev/null /usr/bin/nettop ... -p <sleepPid>` with no watchdog. Assert that a nettop matching that sleep pid is STILL present 6s after the SIGKILL. This reproduces the orphan the todo only inferred. Record whether script died, which tests the SIGPIPE hypothesis. Then SIGKILL the orphan explicitly.
       - If the baseline does NOT orphan, do not fake it. Record the observed outcome in the SUMMARY and convert the assertion to a logged observation. The fixed arm stays the acceptance bar.
    2. Fixed arm: the parent spawns `buildWatchdogSpawn(process.pid, sleepPid, <same inner argv>)`. Assert that nettop, script and the watchdog are all gone within 5s of the SIGKILL. Record the measured kill-to-gone milliseconds.

    afterEach SIGKILLs every pid the arm discovered, plus the sleep. Run the block with the env var set and capture the measured numbers for the SUMMARY and the todo resolution.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && GAMELIB_LIVE_NETTOP=1 npx jest --runTestsByPath src/backend/storeManagers/steam/__tests__/childWatchdog.test.ts --verbose && npx jest --runTestsByPath src/backend/storeManagers/steam/__tests__/childWatchdog.test.ts && npx prettier --check src/backend/storeManagers/steam/__tests__/childWatchdog.test.ts</automated>
    <manual-note>Stray-process check is asserted inside the tests (afterEach + per-arm kill -0), not by a global pgrep here: a global pgrep for nettop or gamelib-watchdog would false-fail whenever the operator's own GameLib is mid-download.</manual-note>
  </verify>
  <done>With GAMELIB_LIVE_NETTOP=1 the fixed arm passes: nettop, script and the watchdog are gone within 5s of the parent SIGKILL. The baseline result (orphaned or not, and whether script survived) and the kill-to-gone ms are recorded. Without the env var the live block is skipped and the rest of the suite passes. No harness-pinned nettop is left running.</done>
</task>

<task type="auto">
  <name>Task 3: Close the todo with a resolution note</name>
  <files>.planning/todos/pending/2026-11-05-orphaned-nettop-after-sidecar-kill.md, .planning/todos/completed/2026-11-05-orphaned-nettop-after-sidecar-kill.md</files>
  <action>
    Move the todo with `git mv` from .planning/todos/pending/ to .planning/todos/completed/. Keep the frontmatter, including `severity: minor`, `platform: macos` and `ready: code` (bare, lowercase, in that order).

    Append a `## Resolution` section, matching the prose style of the completed todo 2026-11-01-invite-picker-raises-whole-main-window.md. It must cover:
    - the fix: the /bin/sh parent-death watchdog in childWatchdog.ts, spawned by steamDownloadMonitor.ts, polling the explicit sidecar pid every 1s and killing script plus the recorded nettop
    - why the nettop pid is recorded (the field orphan had no script parent)
    - the measured baseline outcome from Task 2, stated honestly whether or not it orphaned
    - the measured fixed-arm kill-to-gone time
    - the added behaviour that the tree now exits when the pinned Steam pid exits
    - the rerun command (`GAMELIB_LIVE_NETTOP=1 npx jest --runTestsByPath src/backend/storeManagers/steam/__tests__/childWatchdog.test.ts`)
    - what is not covered: the proof SIGKILLs a throwaway node parent, not the packaged SEA sidecar under the Tauri shell, mid-download. The watchdog keys only on the parent pid, so the mechanism is identical.

    Both paths are under .planning, which prettier ignores, so the formatter check is vacuous there and is omitted. Confirm with --file-info.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test ! -e .planning/todos/pending/2026-11-05-orphaned-nettop-after-sidecar-kill.md && grep -q '^## Resolution' .planning/todos/completed/2026-11-05-orphaned-nettop-after-sidecar-kill.md && npx prettier --file-info .planning/todos/completed/2026-11-05-orphaned-nettop-after-sidecar-kill.md | grep -Eq '"ignored":[[:space:]]*true' && pnpm planning-gates</automated>
  </verify>
  <done>The todo is in completed/ with its triage frontmatter intact and a Resolution section carrying the measured numbers. pnpm planning-gates is green. The prettier check is omitted because the path is prettier-ignored (confirmed by --file-info).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| sidecar → /bin/sh watchdog | node passes only integers (pids) and a fixed argv; no user-controlled strings reach `sh -c` |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-svg-01 | Tampering | WATCHDOG_SH via `sh -c` | mitigate | The script is a constant. Pids and the inner argv are passed as positional parameters (`$1`, `$2`, `"$@"`) and never interpolated into the script string. The pure test (Test 5) pins the exact args. |
| T-svg-02 | Denial of service | kill of a recycled pid | accept | The window is one 1s tick after the recorded process exits. macOS pids increment, and the kill is same-uid only. |
| T-svg-03 | Denial of service | sidecar exit contract | mitigate | No new node handle, timer or watcher. The child and its stdout stay unref'd; the existing test asserts both. |
| T-svg-04 | Information disclosure | test spawns | mitigate | No env is passed and no profile is read. The live arm pins nettop to a harness-owned sleep pid, never Steam or user app state. afterEach kills every discovered pid. |
</threat_model>

<verification>
- Unit and real-process watchdog tests are green on darwin, and linux-compatible.
- The live env-gated proof shows nettop, script and the watchdog gone within 5s of a parent SIGKILL.
- The steamDownloadMonitor suite, codecheck, lint, the fakeHomeIsolation gate and prettier over the 4 .ts paths are green.
- The todo is closed with measured numbers, and planning-gates is green.
</verification>

<success_criteria>
A monitor child cannot outlive its sidecar after a hard kill. This is proved by SIGKILLing the spawning node process with real script/nettop running and observing the tree gone within 5s, while clean stops and the sidecar exit contract are unchanged.
</success_criteria>

<output>
Create `.planning/quick/261105-svg-orphaned-nettop-monitor-child-survives-a/261105-svg-SUMMARY.md` when done
</output>
