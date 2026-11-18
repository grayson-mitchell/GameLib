---
phase: quick-261119-gzt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/runningFromFolder.ts
  - src/backend/storeManagers/steam/__tests__/steamLaunchWatch.test.ts
  - src/backend/storeManagers/steam/__tests__/runningFromFolder.test.ts
  - .planning/todos/pending/2026-11-18-steam-launch-watch-misses-script-launched-game-on-relaunch.md
  - .planning/todos/completed/2026-11-18-steam-launch-watch-misses-script-launched-game-on-relaunch.md
autonomous: true
requirements: [QUICK-261119-gzt]

estimate:
  tokens: 70000
  raw_tokens: 70000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "On macOS, a Steam game started by a shell launcher inside its install folder is found by scanSteamLaunchedPids. Bastion's shape, `/bin/bash <folder>/Bastion.app/Contents/MacOS/Bastion` with child `./Bastion.bin.osx`, yields both pids. An `exec ./Game.bin.osx` launcher, which leaves only the relative child, yields that child. The launch watch then sends `playing` and later exactly one `done`, and Stop gets real pids instead of no-process"
    - "A relaunch that returns `already-watching` keeps the watch scanning for a full start window measured from the relaunch. A game that first appears after the original window, but inside the relaunch window, sends `playing` (T12 is green both at HEAD and after the fix. T13, the script-launched Bastion variant, is red at HEAD and green after it)"
    - "Nothing that was excluded before is matched now: a process that only names the folder as an argument (`/usr/bin/tail -f <folder>/log.txt`, `/bin/zsh -c source ... <folder>/x`), a sibling folder (`Bastion2`), a Steam helper, the sidecar's own pids, and a relative-argv process whose kernel-reported executable is outside the folder (`target/debug/gamelib-shell`)"
    - "lsof runs only on darwin, and only when at least one relative-argv candidate remains after excluded pids and direct matches are removed. Its argv is exactly `-a -nP -p <comma-joined candidate pids> -d txt -F pn` and it is never spawned with an empty pid list. If lsof fails (timeout, abort, truncation, spawn error, or an exit code other than 0 or 1), the scan returns only the argv matches and does not throw. A ps failure still throws, as it does today"
    - "On Linux a relative-argv candidate is resolved through deps.readExe (/proc/<pid>/exe) and lsof is never spawned. The win32 PowerShell path is unchanged"
    - "The source todo is in .planning/todos/completed/ with a `## Resolution` note naming the root cause, the fix commits and the pending Bastion live check"
  artifacts:
    - path: "src/backend/storeManagers/steam/runningFromFolder.ts"
      provides: "SHELL_LAUNCHER rule in psOutputPidsInFolder, exported pure psOutputRelativeArgvPids and lsofExecutablePaths, relative-argv resolution in findPidsRunningFromFolder (darwin lsof txt, linux readExe), optional readExe/realpath on PidScanDeps"
      contains: "/usr/sbin/lsof"
    - path: "src/backend/storeManagers/steam/__tests__/steamLaunchWatch.test.ts"
      provides: "T12 (already-watching relaunch, game appears after the original window) and T13 (the same with the measured Bastion script-launched ps/lsof shapes, appId 107100)"
      contains: "T13"
    - path: "src/backend/storeManagers/steam/__tests__/runningFromFolder.test.ts"
      provides: "Unit coverage for the shell rule, relative-argv candidates, lsof parsing, darwin lsof gating and failure degradation, linux readExe resolution"
      contains: "lsofExecutablePaths"
    - path: ".planning/todos/completed/2026-11-18-steam-launch-watch-misses-script-launched-game-on-relaunch.md"
      provides: "Closed todo with a Resolution section"
      contains: "## Resolution"
  key_links:
    - from: "src/backend/storeManagers/steam/steamLaunchWatch.ts"
      to: "src/backend/storeManagers/steam/stopSteamLaunchedGame.ts"
      via: "runPosix calls scanSteamLaunchedPids(deps, folder, { psTimeoutMs }) every pollMs (steamLaunchWatch.ts:233)"
      pattern: "scanSteamLaunchedPids"
    - from: "src/backend/storeManagers/steam/stopSteamLaunchedGame.ts"
      to: "src/backend/storeManagers/steam/runningFromFolder.ts"
      via: "scanSteamLaunchedPids passes its whole deps object (runner, platform, readExe, realpath, selfPids) to findPidsRunningFromFolder (stopSteamLaunchedGame.ts:128). The new optional PidScanDeps fields are filled from that object, so this file does not change"
      pattern: "findPidsRunningFromFolder"
---

<objective>
Make the Steam launch watch and Stop see a game started by a shell launcher on macOS (and the same shape on Linux), so GameLib's button changes to Playing while Bastion (107100) runs. Lock in that an `already-watching` relaunch extends the search window. Close the source todo.

Purpose: the Phase 81 live gate (L2, 2026-11-18) left the button on "Play" for the whole time Bastion ran. Stop shares the same scan, so it would also have reported no-process.
Output: a fixed matcher in runningFromFolder.ts, two watch tests, matcher unit tests, and the todo moved to completed/.

## Root cause (established at planning, with evidence)

1. **The ps matcher drops both script-launched process shapes. This is the cause.** `psOutputPidsInFolder` (src/backend/storeManagers/steam/runningFromFolder.ts:58-77) admits a pid only when its `ps -o pid=,args=` text starts with `<folder>/` (line 72). On macOS, `ps` prints argv, not the executable path. The installed `Bastion.app/Contents/MacOS/Bastion` is a `#!/bin/bash` script that changes into its own directory (`dirname "$0"`) and then runs `./Bastion.bin.osx $@` (read from the operator's install). A planning-time probe on this Mac reproduced that layout and measured two ps lines: `/bin/bash <abs folder>/.../MacOS/Probe` for the launcher, and `./Probe.bin.osx 7` for the child. `ps -o comm=` also showed `./Probe.bin.osx`. Neither line starts with the folder, so every scan at steamLaunchWatch.ts:233 returned [] while Bastion ran, until the bail at :265-266. Quick 261118-uma measured the same thing on the Rust side (src-tauri/crates/gamelib-steampoll/src/running_scan.rs:12-14): `./Bastion.bin.osx` matches only by executable path. On Linux, the same args pre-filter drops the relative child before the /proc exe filter at stopSteamLaunchedGame.ts:132-146 ever sees it.
2. **`noteRelaunch()` is not at fault.** steamLaunchWatch.ts:169-172 resets `origin`. Line :265 re-reads `origin` on every iteration. The posix loop (:222-269) keeps scanning while `!entry.shown` until that window ends. The log timeline agrees: the bail at 21:29:36 came 92 s after the 21:28:04 relaunch (the 90 s window plus one 2 s poll). Had the window not been reset, the bail would have come about 90 s after the 21:26:50 first launch, near 21:28:20. Existing test T7b already covers the reset with empty scans. T12 below adds the missing case: a process that appears only after the relaunch.

## Fix design (Claude's discretion, recorded)

- **Shell-launcher rule.** A ps line matches when it is an sh-family interpreter, then zero or more single-dash option tokens, then a script path inside the folder. An interpreter running a script that lives in the install folder is part of the game.
- **Relative-argv resolution by executable path.** On darwin, run one bounded `/usr/sbin/lsof -a -nP -p <pids> -d txt -F pn` over only the processes whose argv[0] is a relative path. Each pid's first `txt` name is its executable, which matches `proc_pidpath`. lsof prints canonical paths, so each path is compared against both the folder and realpath(folder). Measured at planning: 0.04-0.05 s for two pids. The candidate set is usually empty: the only relative-argv process on this Mac was GameLib's own dev shell (`target/debug/gamelib-shell`), which is the sidecar's `process.ppid` and so is already in selfPids. On Linux, use the `readExe` that deps already carries. The precedent for lsof through the runner, with no env, is src/backend/storeManagers/steam/bridge/drm/bottleProcesses.ts:118-176.
- **Rejected:**
  - A new Rust op returning pids from libproc. It needs wiring across the Rust dispatch, the sidecarTransport constant and the deps, which is too much for a quick task.
  - Parent-chain (ppid) inference. It misses `exec ./game` launchers. Measured: the exec-style child had its launcher's parent as its ppid, and no bash was left to match.
  - Using `readRunningAppId()` as the signal. It returns only the lowest running appId and gives no pids for Stop.
- **Measured hazards for the executor:**
  - `lsof -a -p ""` (an empty pid list) listed an unrelated process (pid 380, ImageThumbnailExtension), so never spawn it with no candidates.
  - On this Mac, a copied `/bin/sleep` was SIGKILLed, and a copied Homebrew `node` fails with `@rpath/libnode` not loaded. Do not try a real-process test. Use scripted fixtures in the measured shapes.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-11-18-steam-launch-watch-misses-script-launched-game-on-relaunch.md
@src/backend/storeManagers/steam/runningFromFolder.ts
@src/backend/storeManagers/steam/stopSteamLaunchedGame.ts
@src/backend/storeManagers/steam/steamLaunchWatch.ts
@src/backend/storeManagers/steam/steamLaunchedDeps.ts
@src/backend/storeManagers/steam/__tests__/steamLaunchWatch.test.ts
@src/backend/storeManagers/steam/__tests__/runningFromFolder.test.ts
@src/backend/testUtils/scriptedRunner.ts

Conventions that apply (Skill("gamelib-conventions")):
- Every `<verify>` runs `npx prettier --check` over exactly the paths written. `npx prettier --file-info` was measured at planning: all three source and test paths are `"ignored": false` (typescript), and the `.planning/todos/...` paths are `"ignored": true`.
- Fake-HOME rule: the new lsof child passes no `env`, just like the existing ps arm (runningFromFolder.ts:186-190). Both read only the process table, so nothing is profile-dependent and no real-profile arm is needed. Never add a hand-rolled `env` literal (src/backend/__tests__/fakeHomeIsolation.test.ts gates this). The tests spawn no real process.
- Sidecar exit contract: lsof goes through `deps.runner.run`, which unrefs the child, its pipes and its kill timer (see the bridge/drm/boundedListing.ts header). It is bounded by the scan's timeout and runs only during a watch or Stop scan, never at boot.
- `pnpm backend-di-ceilings` is red at HEAD on four files this plan does not touch (launchWithoutSteam.test.ts, NoticeStack.test.tsx, NativePortInfo.test.tsx, LaunchWithoutSteam.test.tsx; measured), so it is not in `<verify>`. Do not add `jest.mock` in the new tests: use the scripted runner, as the existing tests do.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: End-to-end "already-watching relaunch of a script-launched game sends playing" on darwin</name>
  <files>src/backend/storeManagers/steam/__tests__/steamLaunchWatch.test.ts, src/backend/storeManagers/steam/runningFromFolder.ts</files>
  <behavior>
    - T12 (bookkeeping lock). setup with startWindowMs 10000 and the plain absolute PRESENT shape. Run 3 empty scans (t = 6 s), then call startSteamLaunchWatch again, which returns `already-watching`. Keep ps empty past the original 10 s window, through t = 12 s. The game first appears at t = 14 s. Expect sent to equal ['playing'], then after two empty scans ['playing', 'done'], with the registry empty and clock.pendingCount() at 0. This must pass at HEAD, before any source change. Record that HEAD result in the SUMMARY as the evidence that noteRelaunch is not at fault.
    - T13 (the incident). The same timeline with appId '107100' and setup option acf 'Bastion', so the folder is /lib/steamapps/common/Bastion. From t = 14 s the ps step stdout has three lines: `501 /bin/bash /lib/steamapps/common/Bastion/Bastion.app/Contents/MacOS/Bastion`, then `502 ./Bastion.bin.osx`, then `900 ./gamelib-shell` (900 is in setup's selfPids). A repeat `/usr/sbin/lsof` step answers code 0 with stdout `p502`, `ftxt`, `n/lib/steamapps/common/Bastion/Bastion.app/Contents/MacOS/Bastion.bin.osx`, `ftxt`, `n/usr/lib/dyld` (one per line). Expect:
      - sent equals ['playing'];
      - the capture log's info line reads `appId 107100 running: pids [501, 502] under /lib/steamapps/common/Bastion`;
      - every recorded lsof call's argv is exactly ['-a', '-nP', '-p', '502', '-d', 'txt', '-F', 'pn'] (pid 501 is a direct match and 900 is excluded, so neither reaches lsof);
      - after two empty ps scans, one `done`.
      Before the source change, T13 fails with sent [], because the bash line and the relative line both miss runningFromFolder.ts:72.
  </behavior>
  <action>
    Write T12 and T13 first, after T11 in the existing `describe('steamLaunchWatch')`. Reuse the file's helpers: `setup`, `tick`, `EMPTY`, `PRESENT`, scripted `ScriptStep`s, and `repeat: true` where a step recurs. Run the file and confirm T12 passes and T13 fails. Then change only src/backend/storeManagers/steam/runningFromFolder.ts:
    (a) Add a module constant `SHELL_LAUNCHER`. It matches an optional absolute directory, then an interpreter basename of sh, bash, dash, ksh or zsh, then whitespace, then zero or more option tokens of the form `-letters` followed by whitespace. In `psOutputPidsInFolder`, admit a line when `args` starts with the prefix (today's rule) OR when `SHELL_LAUNCHER` matches at the start of `args` and the rest of `args` starts with the prefix. Keep the pid, excludePids and `STEAM_HELPER` checks exactly as they are.
    (b) Export a pure `psOutputRelativeArgvPids(output, excludePids)`. It uses the same line regex and pid guards (pid > 1, a safe integer, not excluded, not `STEAM_HELPER`). A line is a candidate when its first whitespace-delimited token does not start with `/` but does contain `/`. That covers `./x`, `../x` and `a/b`, and excludes `-zsh`, `login` and `(sshd)`. Return the pids sorted and unique.
    (c) Export a pure `lsofExecutablePaths(output): Map<number, string>` that parses `-F pn` records. A `p<digits>` line starts a record. For each pid, the first `n` line that follows an `ftxt` line is its executable. Later `txt` names and non-txt fds are ignored, and unparseable lines are skipped. It never throws.
    (d) Add optional `readExe?: (pid: number) => string | undefined` and `realpath?: (p: string) => string` to `PidScanDeps`. In the posix arm of `findPidsRunningFromFolder`, after the existing ps call and failure check, compute `direct` with `psOutputPidsInFolder`, then the relative candidates minus `direct`. If there are no candidates, return `direct` unchanged; that is today's path and spawns no extra process. On darwin, call `deps.runner.run` once with `/usr/sbin/lsof` and argv ['-a', '-nP', '-p', candidates joined by ',', '-d', 'txt', '-F', 'pn'], options { timeoutMs: the same timeout as ps, stdin: '' }, and no env. Treat a thrown error, timedOut, aborted, truncated, or a code other than 0 or 1 (lsof exits 1 when a listed pid has exited, as bottleProcesses.ts:118 records) as "no relative matches". Otherwise parse with `lsofExecutablePaths`. Admit a candidate when its executable starts with the normalized folder plus sep, or with the normalized `deps.realpath?.(folder)` plus sep (wrap the realpath call in try/catch and fall back to the folder), and the executable does not match `STEAM_HELPER`. Return `direct` together with the admitted candidates, sorted and unique. A ps failure still throws as it does today. Leave the linux arm for Task 2: in this task, when the platform is not darwin, skip resolution and return `direct`.
    (e) Update the doc comments in the same pass: the module header (lines 10-16) names lsof beside ps as a process-table-only read that passes no env, and the `psOutputPidsInFolder` comment (lines 51-57) describes the shell-launcher exception. Do not edit stopSteamLaunchedGame.ts or steamLaunchWatch.ts. Nothing in their logic is wrong (root cause 2), and `scanSteamLaunchedPids` already passes `readExe` and `realpath` through.
  </action>
  <verify>
    <automated>npx jest src/backend/storeManagers/steam/__tests__/steamLaunchWatch.test.ts src/backend/storeManagers/steam/__tests__/runningFromFolder.test.ts src/backend/storeManagers/steam/__tests__/stopSteamLaunchedGame.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts && npx tsc --noEmit && test "$(grep -cE "it\('T1[23] " src/backend/storeManagers/steam/__tests__/steamLaunchWatch.test.ts)" -ge 2 && test "$(grep -vE '^\s*(\*|//|/\*)' src/backend/storeManagers/steam/runningFromFolder.ts | grep -c "'/usr/sbin/lsof'")" -ge 1 && npx prettier --check src/backend/storeManagers/steam/runningFromFolder.ts src/backend/storeManagers/steam/__tests__/steamLaunchWatch.test.ts && npx eslint src/backend/storeManagers/steam/runningFromFolder.ts src/backend/storeManagers/steam/__tests__/steamLaunchWatch.test.ts</automated>
    Baselines measured at planning: the four jest suites PASS (99 passed, 1 skipped); `npx tsc --noEmit` exits 0; the T12/T13 count is [HEAD=0 EXPECT>=2]; the non-comment `'/usr/sbin/lsof'` count in runningFromFolder.ts is [HEAD=0 EXPECT>=1]; prettier and eslint are clean on both paths at HEAD.
  </verify>
  <done>T12 passed at HEAD and still passes. T13 failed at HEAD and now passes. All earlier tests in the four suites stay green. The SUMMARY records the HEAD results of T12 and T13 as the evidence for root causes 1 and 2.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Linux resolution and matcher edge coverage (shell rule negatives, lsof gating, failure degradation)</name>
  <files>src/backend/storeManagers/steam/runningFromFolder.ts, src/backend/storeManagers/steam/__tests__/runningFromFolder.test.ts</files>
  <behavior>
    - psOutputPidsInFolder with folder /x/common/Bastion:
      - admits `/bin/bash /x/common/Bastion/Bastion.app/Contents/MacOS/Bastion`, `bash /x/common/Bastion/run.sh` (the env-shebang shape), `/bin/sh -e /x/common/Bastion/run.sh`, `/bin/zsh /x/common/Bastion/x` and `/bin/bash -c /x/common/Bastion/run.sh`;
      - rejects `/bin/bash /x/common/Bastion2/run.sh`, `/bin/zsh -c source /tmp/s.sh && cd /x/common/Bastion/x` (measured shape: the planner's own shell carried the folder this way), `/usr/bin/tail -f /x/common/Bastion/log.txt`, `/usr/bin/python3 /x/common/Bastion/x.py` (not in the interpreter set), `/bin/bash /x/common/Bastion/steam_osx`, and an excluded pid;
      - the existing WazHack cases stay green.
    - psOutputRelativeArgvPids:
      - candidates: `./Bastion.bin.osx`, `../bin/game -x` and `target/debug/gamelib-shell`;
      - not candidates: an absolute path, `-zsh`, `login`, `(sshd)`, pid 1, an excluded pid, `./steamwebhelper` and a garbage line.
    - lsofExecutablePaths:
      - two records, each with a txt executable followed by `/usr/lib/dyld`, map each pid to its first txt only;
      - a record with only a `cwd` fd is absent;
      - garbage input gives an empty map.
    - findPidsRunningFromFolder on darwin, with a scripted runner and folder /x/common/Bastion:
      - the Bastion shape returns [501, 502], with exactly one lsof call carrying `-p 502` and options timeoutMs 2000 and stdin '';
      - an exec-style shape (only `502 ./Bastion.bin.osx`) returns [502];
      - with no relative lines, the runner has exactly 1 call (ps only);
      - when the only relative line is an excludePids pid, no lsof call is made;
      - when deps.realpath maps the folder to /private/x/common/Bastion and lsof reports /private/x/common/Bastion/..., the pid is admitted;
      - an lsof executable in /x/common/Bastion2/... or /Users/u/dev/target/debug/gamelib-shell is rejected;
      - lsof code 1 with stdout is parsed;
      - lsof timedOut, lsof code 2, and an unscripted lsof call (the runner throws) each resolve to the direct matches only and do not reject;
      - the existing ps-failure tests still reject.
    - findPidsRunningFromFolder on linux:
      - a `502 ./Bastion.bin.x86_64` line with deps.readExe returning `/x/common/Bastion/Bastion.bin.x86_64` (also with a ` (deleted)` suffix) is admitted;
      - readExe returning undefined, or a path outside the folder, is not;
      - the linux runner never sees an lsof call.
  </behavior>
  <action>
    Add the behavior cases to src/backend/storeManagers/steam/__tests__/runningFromFolder.test.ts: extend the existing `describe('psOutputPidsInFolder')`, add new `describe` blocks for `psOutputRelativeArgvPids` and `lsofExecutablePaths`, and add cases inside `describe('findPidsRunningFromFolder (scripted runner)')`. Use the existing `createScriptedRunner` step style, matching lsof steps by `cmd: '/usr/sbin/lsof'` plus `argv` or `match`. Run the tests and see the linux cases fail. Then finish the linux branch of the step (d) resolution in src/backend/storeManagers/steam/runningFromFolder.ts. On linux, resolve each candidate with `deps.readExe?.(pid)`, strip a trailing ` (deleted)` exactly as stopSteamLaunchedGame.ts:140 does, and admit it under the same folder/realpath/STEAM_HELPER rule as darwin. If `readExe` is absent, admit nothing. Never spawn lsof on linux.
    Document on `findPidsRunningFromFolder` that on linux a shell-launcher pid admitted by the args rule is then dropped by scanSteamLaunchedPids' /proc exe filter (its exe is the interpreter), and that this is intended: the relative child admitted through readExe is the game.
    Fix any Task 1 edge case that these tests expose in the same file. Keep each new function pure apart from the one runner call, and never let lsof failure throw.
  </action>
  <verify>
    <automated>npx jest src/backend/storeManagers/steam/__tests__/runningFromFolder.test.ts src/backend/storeManagers/steam/__tests__/stopSteamLaunchedGame.test.ts src/backend/storeManagers/steam/__tests__/steamLaunchWatch.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts && npx tsc --noEmit && test "$(grep -c 'lsofExecutablePaths' src/backend/storeManagers/steam/__tests__/runningFromFolder.test.ts)" -ge 2 && test "$(grep -c 'psOutputRelativeArgvPids' src/backend/storeManagers/steam/__tests__/runningFromFolder.test.ts)" -ge 2 && npx prettier --check src/backend/storeManagers/steam/runningFromFolder.ts src/backend/storeManagers/steam/__tests__/runningFromFolder.test.ts && npx eslint src/backend/storeManagers/steam/runningFromFolder.ts src/backend/storeManagers/steam/__tests__/runningFromFolder.test.ts</automated>
    Baselines measured at planning: the `lsofExecutablePaths` and `psOutputRelativeArgvPids` counts in the test file are [HEAD=0 EXPECT>=2] each (one import plus at least one use); prettier and eslint are clean on both paths at HEAD.
  </verify>
  <done>Every behavior case passes on this Mac. The linux cases make no lsof call. No earlier test in the four suites regresses. runningFromFolder.ts stays far under the steam line ceiling of 1000 lines (240 at HEAD).</done>
</task>

<task type="auto">
  <name>Task 3: Close the todo with a resolution note and record the post-fix Bastion live check</name>
  <files>.planning/todos/pending/2026-11-18-steam-launch-watch-misses-script-launched-game-on-relaunch.md, .planning/todos/completed/2026-11-18-steam-launch-watch-misses-script-launched-game-on-relaunch.md</files>
  <action>
    Use `git mv` to move .planning/todos/pending/2026-11-18-steam-launch-watch-misses-script-launched-game-on-relaunch.md into .planning/todos/completed/. Keep its frontmatter unchanged. Append a `## Resolution` section in the wrap and voice of the other completed todos (for example .planning/todos/completed/2026-11-17-ci-head-check-pinned-steam-api.md), with:
    - "Done by quick 261119-gzt" and the commit hashes of Tasks 1-2.
    - The root cause in two or three sentences, matching this plan's Root cause section: `psOutputPidsInFolder` admitted only argv[0] inside the folder, and macOS ps prints argv, so `/bin/bash <folder>/...` and `./Bastion.bin.osx` were both missed. noteRelaunch was refuted by the 92 s bail timing and by T12 passing at HEAD.
    - The fix: the shell-launcher rule, plus resolution of a relative argv[0] by executable path (lsof txt on darwin, /proc exe on linux), which also gives Stop real pids.
    - The live check as a non-blocking post-fix item: "Live check pending (ready: live-gate): Bastion 107100 Play shows Playing and Stop ends it; run after a `pnpm tauri:dev` restart."
    Then run `graphify update .`, which is local only because graphify-out/ is gitignored; skip it if graphify is not on PATH. There is no prettier check: both todo paths are prettier-ignored (`"ignored": true`, measured), so a check would prove nothing. Match the surrounding corpus by hand instead.
  </action>
  <verify>
    <automated>test ! -e .planning/todos/pending/2026-11-18-steam-launch-watch-misses-script-launched-game-on-relaunch.md && test -f .planning/todos/completed/2026-11-18-steam-launch-watch-misses-script-launched-game-on-relaunch.md && test "$(grep -c '^## Resolution' .planning/todos/completed/2026-11-18-steam-launch-watch-misses-script-launched-game-on-relaunch.md)" -ge 1 && grep -q 'Live check pending' .planning/todos/completed/2026-11-18-steam-launch-watch-misses-script-launched-game-on-relaunch.md && pnpm planning-gates</automated>
    Baselines measured at planning: the completed file is absent at HEAD, so its `## Resolution` heading count is [HEAD=0 EXPECT>=1]; `pnpm planning-gates` gives 12/12 PASS at HEAD. There is no prettier check because every path written is prettier-ignored.
    <human-check>Post-fix, non-blocking (todo `ready: live-gate`). Record the outcome in the SUMMARY under "Post-fix human check" as `pending` until the operator runs it:
    1. Restart the dev app with `pnpm tauri:dev`. tauri dev does not rebuild the sidecar, so confirm that sidecar.js is newer than the fix commit.
    2. Press Play on Bastion (107100). Expected: the button shows Playing within about 2 s of the game window appearing, and gamelib.log has `SteamGame.watch: appId 107100 running: pids [<bash pid>, <Bastion.bin.osx pid>] under .../steamapps/common/Bastion`.
    3. Press Stop. Expected: Bastion quits, gamelib.log has `SteamGame.stop: stopping Steam-launched appId 107100: SIGTERM pids [...]`, and the button returns to Play.
    4. Optional relaunch path: press Play again before the game window appears. Expected: no second `watching` line, and Playing still shows once the game is up.</human-check>
  </verify>
  <done>The todo is in completed/ with a Resolution note, nothing is left in pending/, planning gates pass, and the live check is recorded as pending in the SUMMARY.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| process table -> sidecar | `ps` argv text and `lsof` executable paths for every same-user process. Any same-user process chooses its own argv, cwd and binary location. |
| sidecar -> other processes | Stop SIGTERMs and SIGKILLs the pids this matcher returns, so a false match is a wrong-process signal. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-gzt-01 | Spoofing | runningFromFolder.ts SHELL_LAUNCHER rule | low | mitigate | Only an sh-family interpreter whose script operand starts with `<folder>/` matches. The prefix is sibling-proof (normalized folder plus sep), and a command string that merely mentions the folder (`-c source ... <folder>`) does not match. STEAM_HELPER and selfPids exclusions still apply. Task 2 tests cover the negative shapes. A same-uid process could already signal these pids itself. |
| T-gzt-02 | Spoofing | relative-argv candidates | low | mitigate | A candidate is admitted only by its kernel-reported executable (lsof `txt`, or /proc exe), never by argv text, and that executable must sit under the folder or its realpath. A relative-argv process outside the folder (`target/debug/gamelib-shell`) is rejected in the tests. |
| T-gzt-03 | Denial of Service | lsof spawn in the watch's 2 s scan | low | mitigate | lsof is spawned only when at least one relative-argv candidate remains after selfPids and direct matches are removed (measured: none outside GameLib's own pids), restricted to those pids with `-a -p`, never with an empty list, and bounded by the scan timeout. It goes through the runner, which unrefs the child (sidecar exit contract), and never runs at boot. A failure degrades to the argv result. |
| T-gzt-04 | Tampering | lsof argv construction | low | mitigate | The `-p` list joins integers already parsed by `^\s*(\d+)` with safe-integer and pid > 1 guards. The binary is the absolute `/usr/sbin/lsof`, run through the runner with an argv array and no shell, so nothing from argv text reaches lsof's arguments. |
| T-gzt-05 | Information Disclosure | lsof executable paths | low | mitigate | Paths stay in memory inside findPidsRunningFromFolder. Only pids are returned. The existing log line names pids and the game's own install folder, and other processes' paths are never logged. |
| T-gzt-SC | Tampering | npm/pip/cargo installs | high | accept | This plan installs no packages and adds no dependencies, so the package-legitimacy gate has nothing to check. |
</threat_model>

<verification>
- `npx jest src/backend/storeManagers/steam/__tests__/steamLaunchWatch.test.ts src/backend/storeManagers/steam/__tests__/runningFromFolder.test.ts src/backend/storeManagers/steam/__tests__/stopSteamLaunchedGame.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts` is green.
- `npx tsc --noEmit` exits 0.
- `npx prettier --check` and `npx eslint` are clean over src/backend/storeManagers/steam/runningFromFolder.ts, src/backend/storeManagers/steam/__tests__/steamLaunchWatch.test.ts and src/backend/storeManagers/steam/__tests__/runningFromFolder.test.ts.
- `pnpm planning-gates` gives 12/12.
- The SUMMARY records the HEAD results of T12 (pass) and T13 (fail), plus the pending Bastion live check.
</verification>

<success_criteria>
- A script-launched Mac game (bash launcher plus a relative child, or an exec-style relative child) is found by the shared scan, so the launch watch sends `playing` and later `done`, and Stop signals real pids.
- An `already-watching` relaunch whose game appears after the original window still sends `playing` (T12, plus T13 for the Bastion shapes).
- No previously excluded process shape becomes a match. lsof runs only for darwin relative-argv candidates and never throws the scan.
- The source todo is closed with a Resolution note, and the live Bastion check is recorded as a pending post-fix human item.
</success_criteria>

<output>
Create `.planning/quick/261119-gzt-steamgame-watch-misses-a-running-game-af/261119-gzt-SUMMARY.md` when done
</output>
