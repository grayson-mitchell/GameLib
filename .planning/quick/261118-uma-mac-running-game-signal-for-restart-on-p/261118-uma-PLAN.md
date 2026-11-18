---
phase: quick-261118-uma
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/crates/gamelib-steampoll/Cargo.toml
  - src-tauri/Cargo.lock
  - src-tauri/crates/gamelib-steampoll/src/lib.rs
  - src-tauri/crates/gamelib-steampoll/src/running_scan.rs
  - src-tauri/crates/gamelib-steampoll/src/running.rs
  - src-tauri/crates/gamelib-steampoll/src/dispatch.rs
  - src-tauri/crates/gamelib-steampoll/tests/dispatch.rs
  - src-tauri/crates/gamelib-steampoll/tests/running_scan.rs
  - src/backend/storeManagers/steam/library/runningPoll.ts
  - src/backend/storeManagers/steam/__tests__/macSteamAdoption.test.ts
  - .planning/todos/pending/2026-11-18-mac-restart-on-play-ignores-running-game-no-runningappid.md
autonomous: false
requirements: [QUICK-261118-uma]

estimate:
  tokens: 110000
  raw_tokens: 110000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "On macOS, while a Steam game runs whose executable lives under <library>/steamapps/common/<installdir>/ of any Steam library (libraryfolders.vdf or the Steam root), the rustInvoke op steampoll_read_running_app_id returns that game's appId instead of 0, non-strict and strict. This holds even though Mac registry.vdf has no RunningAppID and even when the game's argv is relative (Bastion's ./Bastion.bin.osx)"
    - "On the Mac, pressing Play on a pending game while another Steam game runs shows the in-app notice 'Quit the game running in Steam, then press Play to finish setting up <name>.', Steam is not quit, and gamelib.log has '[Steam] not restarting Steam for <C>: game <A> is running' and no 'fired steam://exit to adopt <C>'. 'Restart Steam now' refuses the same way"
    - "Windows and Linux answers are unchanged: off Darwin the process scan is never called (Windows native registry read, Linux registry.vdf then reaper scan, as before)"
    - "The 5 s RunningPoll's Darwin probe stays registry-only: RunningPoll::for_platform still calls read_running_app_id, so the Mac Playing status stays with the launch watch (261111-9mj) and nothing scans every tick"
    - "With no game running, or only processes outside every Steam library, the op returns 0. With no Steam library on disk it returns 0 without listing processes"
    - "A strict read (readRunningAppIdOrThrow, the uninstall guard) errors instead of answering 0 when the process list cannot be read, so decideSteamNativeDelete refuses with running-check-failed"
    - "No child process is spawned by the scan (libproc syscalls in the Rust shell) and no new crate enters src-tauri/Cargo.lock"
  artifacts:
    - path: "src-tauri/crates/gamelib-steampoll/src/running_scan.rs"
      provides: "ExeLister type alias, list_process_exe_paths (macOS libproc: proc_listallpids + proc_pidpath), app_id_from_exe_paths (library prefix + ACF installdir match), scan_running_app_id (library resolution, strict semantics)"
      contains: "proc_pidpath"
    - path: "src-tauri/crates/gamelib-steampoll/src/running.rs"
      provides: "read_running_app_id_or_process_scan: registry/native read first, Darwin-only scan fallback when that reads 0"
      contains: "read_running_app_id_or_process_scan"
    - path: "src-tauri/crates/gamelib-steampoll/tests/dispatch.rs"
      provides: "macOS-only live test: a copied test binary run with a relative argv0 from a scratch Steam library is reported by the dispatch op, then 0 once killed"
      contains: "running_scan_sleeper"
    - path: "src-tauri/crates/gamelib-steampoll/tests/running_scan.rs"
      provides: "Cross-platform contract tests for the matcher, library resolution, strict semantics and the off-Darwin no-scan guarantee"
    - path: "src/backend/storeManagers/steam/__tests__/macSteamAdoption.test.ts"
      provides: "Seam test: createRestartDeps on darwin plus a non-zero steampoll reply makes restartSteamForAdoption refuse without quitting Steam (no readRunningAppId stub)"
      contains: "RUST_STEAMPOLL_READ_RUNNING_APP_ID"
  key_links:
    - from: "src-tauri/crates/gamelib-steampoll/src/dispatch.rs"
      to: "src-tauri/crates/gamelib-steampoll/src/running.rs"
      via: "steampoll_read_running_app_id arm calls read_running_app_id_or_process_scan(..., &list_process_exe_paths)"
      pattern: "read_running_app_id_or_process_scan"
    - from: "src-tauri/crates/gamelib-steampoll/src/running.rs"
      to: "src-tauri/crates/gamelib-steampoll/src/running_scan.rs"
      via: "Darwin + 0 from registry.vdf -> scan_running_app_id(profile_home, steam_root, strict, lister)"
      pattern: "scan_running_app_id"
    - from: "src/backend/storeManagers/steam/macSteamAdoption.ts"
      to: "src/backend/storeManagers/steam/library/runningPoll.ts"
      via: "createRestartDeps.readRunningAppId -> readMacRunningAppId -> invokeSteamPoll(RUST_STEAMPOLL_READ_RUNNING_APP_ID, { strict: false })"
      pattern: "readMacRunningAppId"
    - from: "src-tauri/crates/gamelib-steampoll/src/running.rs"
      to: "src-tauri/crates/gamelib-steampoll/src/running.rs"
      via: "RunningPoll::for_platform keeps calling read_running_app_id (NOT the scan variant)"
      pattern: "read_running_app_id\\(platform, &home, root.as_deref\\(\\), &\\*runner, false\\)"
---

<objective>
Give macOS a real "a game is running in Steam" signal so that restart-on-Play and "Restart Steam now" refuse while a game runs. This fixes phase-81 live-gate item 5 and the todo `2026-11-18-mac-restart-on-play-ignores-running-game-no-runningappid.md`.

Purpose: on Mac, `restartSteamForAdoption` (`src/backend/storeManagers/steam/macSteamAdoption.ts`) refuses only when `deps.readRunningAppId()` is non-zero. That reader goes to the Rust op `steampoll_read_running_app_id`, whose Darwin arm (`src-tauri/crates/gamelib-steampoll/src/running.rs`, `read_running_app_id`) only parses `registry.vdf`. Mac Steam never writes RunningAppID there: 615 bytes with two games running at the 2026-11-18 gate, and the same on 2026-11-11 with WazHack. So it always answers 0, and Steam was restarted under Avadon. The refusal notice and its "Launch without Steam" action (81-07, D-05) cannot be reached on Mac.

Output: a Rust process scan by executable path, mapped to an appId through the Steam libraries' ACF `installdir`. It is used by the on-demand `steampoll_read_running_app_id` op on Darwin when `registry.vdf` reads 0. The plan also adds cross-platform and macOS-live Rust tests, a TS seam test, and a live check on the Mac.

Decisions made in planning (no CONTEXT.md exists for a quick task; these are the planner's calls, with reasons):

1. **Fix the shared on-demand reader, not just the restart path.** Every TS reader (`readMacRunningAppId`, `readRunningAppId`, `readRunningAppIdOrThrow` in `src/backend/storeManagers/steam/library/runningPoll.ts`) goes through the single Rust op `steampoll_read_running_app_id`. Fixing the op's Darwin answer fixes all the Mac guards at once with no TS logic change: restart-on-Play (`playAdoption.ts`), "Restart Steam now" (`adoptionStatus.ts`), the uninstall guard (`gameUninstall.ts`, strict) and the update guard (`updateNative.ts`). It is safe for each of them. The two restart guards refuse on any non-zero answer, which is the fix. `decideSteamNativeDelete` (`nativeDelete.ts`) and `updateRegisteredSteamGame` compare the answer to their own appId, so a different running game never refuses them. They only gain a refusal when their own game runs, which is correct, and delete keeps its posix folder check. `steamLaunchWatch.ts` calls `readRunningAppId` only in its win32 loop, so it is unaffected.
2. **Do NOT change the 5 s RunningPoll probe.** `RunningPoll::for_platform` keeps calling the registry-only `read_running_app_id`. Scanning there would hand Mac Playing status from the launch watch (261111-9mj, `steamLaunchWatch.ts` header) to the poller. It would also report games GameLib launched without Steam, and it would scan every 5 s. Those are UI behaviour changes this todo does not ask for and the gate does not cover.
3. **Rust, not TS.** The probe is Rust by D-13 ("the whole probe runs in Rust"), and Linux already has the same shape: registry first, then a process fallback (`linux_fallback`). Rust can read the real executable path through libproc with no child process. A TS `ps` scan sees only argv, and Bastion's game process has a relative argv.
4. **Executable path, not argv.** Measured on this Mac during planning (2026-11-18): a process started as `./mygame` shows `ps` args `./mygame`, while `proc_pidpath` returns `/private/tmp/.../steamapps/common/My Game/My.app/Contents/MacOS/mygame`. Bastion's shell launcher (`/bin/bash .../Bastion.app/Contents/MacOS/Bastion`, exe `/bin/bash`) does not match, but its child `./Bastion.bin.osx` does, so the game is found. argv parsing (KERN_PROCARGS2) is not added: the executable path covers both launches observed live.
5. **No helper subcommand.** `steam-bridge-helper` (`native/steam-bridge/helper/bridge_helper.c`) has no running-app query. Its subcommands are `--steam-installapp`, `--steam-owned-apps`, `--steam-uninstallapp` and `--steam-appstate`. Adding one would mean new, unverified IClient vtable work.
6. **A false positive fails safe.** A game GameLib launched "without Steam" from a Steam library also reads as running, so the restart is refused. That is the safe side, because such games often hold a live Steam API connection that a Steam restart would break. The user's remedy is simply to quit the game.
7. **Several games running:** the reader returns the lowest matching appId, so the answer is deterministic. That is enough for the restart guards, which refuse on any non-zero answer. For the equality guards it is a known limit: if two games run, the update guard can miss the higher one. Before this change those guards never refused on Mac at all.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/todos/pending/2026-11-18-mac-restart-on-play-ignores-running-game-no-runningappid.md
@.planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-HUMAN-UAT.md (item 5 at line 107 only; item 4 at line 100)

Source to read before editing (extract everything in one pass each):
@src-tauri/crates/gamelib-steampoll/src/running.rs (lines 1-90 probe; 160-180 for_platform)
@src-tauri/crates/gamelib-steampoll/src/dispatch.rs (lines 15-25 imports; 475-500 the steampoll_read_running_app_id arm)
@src-tauri/crates/gamelib-steampoll/src/acf_state.rs (lines 69-96: pub fn steam_libraries)
@src-tauri/crates/gamelib-steamfiles/src/library.rs (lines 110-200: scan_acfs, ScannedAcf; AcfRecord.appid/installdir are Option<String>)
@src-tauri/crates/gamelib-steampoll/tests/dispatch.rs (lines 1-45 guard/install/write_acf; 355-374 the existing read_running_app_id asserts)
@src-tauri/crates/gamelib-steampoll/tests/running.rs (lines 1-15 imports; 86-210 probe tests, ScriptedRunner usage)
@src/backend/storeManagers/steam/library/runningPoll.ts
@src/backend/storeManagers/steam/macSteamAdoption.ts (lines 315-470: RestartDeps, createRestartDeps, restartSteamForAdoption)
@src/backend/storeManagers/steam/__tests__/macSteamAdoption.test.ts (lines 1-60 imports; 550-634 describe('createRestartDeps'))

Planning-time measurements (this Mac, 2026-11-18). Do not re-measure, rely on them:
- `proc_listallpids(NULL, 0)` returned 969. With a 1033-slot `c_int` buffer it returned 950, a pid COUNT, not bytes. 923 of the 950 `proc_pidpath` calls succeeded; 26 failed (other-user or kernel processes, which are skipped). The whole scan took 2.23 ms, including Python ctypes overhead.
- `/tmp` is a symlink to `/private/tmp`, and `$TMPDIR`/tempfile's `/var/folders/...` resolves to `/private/var/folders/...`. `proc_pidpath` returns the canonical form, so a library path must be compared both as given AND canonicalized.
- A copy of an Apple platform binary (`/bin/sleep`) is SIGKILLed at exec (exit 137). An ad-hoc-signed, locally built binary runs. So the live test's sleeper must be a copy of the cargo test binary itself (`std::env::current_exe()`), never a system binary.
- libc 0.2.186 is already in `src-tauri/Cargo.lock` and declared by the shell crate. It exports `proc_listallpids`, `proc_pidpath` and `PROC_PIDPATHINFO_MAXSIZE` (4096) on Apple targets. `grep -c '^name = ' src-tauri/Cargo.lock` = 684.
- Baselines at HEAD: `cargo test -p gamelib-steampoll --test running` 26 passed; `npx jest src/backend/storeManagers/steam/__tests__/macSteamAdoption.test.ts` 63 passed; `cargo fmt -p gamelib-steampoll --check` exit 0; `npx eslint` over the two TS files: 0 errors, 7 warnings (all pre-existing `require-await` warnings in the test file).
- prettier `--file-info`: both TS files `"ignored": false, "inferredParser": "typescript"`. `.rs` and `.toml` report `"inferredParser": null`, so prettier cannot check them and `cargo fmt` is the formatter gate for Rust. The `.planning/` todo is prettier-ignored, so no prettier check is run on it (it would prove nothing).

Execution rules (from the planning context and gamelib-conventions):
- Sequential on main, no worktrees. Other sessions dirty the tree and commit concurrently: stage and commit ONLY this plan's explicit paths (`git add <paths>` then `git commit -m "..." -- <paths>`). Never use `git add -A`/`.`, and never a gsd-tools `commit` without `--files`. Before committing `src-tauri/Cargo.lock`, confirm with `git diff src-tauri/Cargo.lock` that its only change is the one `"libc",` line in the gamelib-steampoll entry. If another session's edits are mixed in, stop and report.
- Sidecar exit contract: not touched. The scan runs in the Rust shell (the rustInvoke op), spawns no child, holds no handle and does nothing at boot. No TS timer, watcher or spawn is added.
- Fake-HOME isolation: no TS spawn site is added. The one new Rust test child is profile-free (`env_clear()` plus a single marker variable) and only sleeps.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: End-to-end slice: Darwin steampoll_read_running_app_id finds a Steam-library process by executable path</name>
  <files>src-tauri/crates/gamelib-steampoll/tests/dispatch.rs, src-tauri/crates/gamelib-steampoll/Cargo.toml, src-tauri/Cargo.lock, src-tauri/crates/gamelib-steampoll/src/lib.rs, src-tauri/crates/gamelib-steampoll/src/running_scan.rs, src-tauri/crates/gamelib-steampoll/src/running.rs, src-tauri/crates/gamelib-steampoll/src/dispatch.rs</files>
  <behavior>
    - macOS live (RED before the change, since today the op reads registry.vdf only and answers 0): a scratch HOME holds `Library/Application Support/Steam/steamapps/libraryfolders.vdf`. It lists the Steam root as "0" and a second library at a non-canonical tempdir path `<tmp>/Ext Lib` as "1". `<tmp>/Ext Lib/steamapps/appmanifest_4242.acf` has installdir "Fixture Game". A copy of the test binary sits at `<tmp>/Ext Lib/steamapps/common/Fixture Game/Fixture.app/Contents/MacOS/fixture`. Before the child is spawned, the op answers 0. After the copy is spawned with argv0 "./fixture", the op answers 4242 within 5 s, both with `{"strict": false}` and with `{"strict": true}`. Once the child is killed and reaped, it answers 0 again within 5 s.
    - The existing dispatch asserts (scratch HOME with no Steam dir: the op answers 0 for `{"strict": false}`, `[]` and `[null]`, and strict with no HOME errors) still pass unchanged.
  </behavior>
  <action>
RED first. In `src-tauri/crates/gamelib-steampoll/tests/dispatch.rs`, add a `#[cfg(target_os = "macos")]` test named `darwin_running_app_id_finds_a_steam_library_process_by_executable_path` that implements the first behavior bullet. Take `guard()`, build both tempdirs with `tempfile`, and call the existing `install(home)` helper. Write the ACF with the same tab-separated `"AppState"` shape as the file's `write_acf` helper, but with installdir "Fixture Game". The existing helper hardcodes "Game", so add a small sibling helper or a parameter. Write libraryfolders.vdf as nested `"libraryfolders" { "0" { "path" "<root>" } "1" { "path" "<ext>" } }`.

Spawn the sleeper as follows. Copy `std::env::current_exe()` into the fixture path; the copy keeps the linker's ad-hoc signature (see the context measurements). Spawn it by absolute path with `std::os::unix::process::CommandExt::arg0("./fixture")`, which reproduces Bastion.bin.osx's relative argv. Use `env_clear()` plus `GAMELIB_RUNNING_SCAN_SLEEPER=1`, stdout and stderr null, and the args `--exact running_scan_sleeper --ignored --test-threads=1`. Keep the `Child` in a local guard struct whose `Drop` kills and waits, so a failed assert never leaks a process.

Add the sleeper itself to the same file: `#[test] #[ignore] fn running_scan_sleeper()`. It sleeps 30 s only when `GAMELIB_RUNNING_SCAN_SLEEPER` is set and returns at once otherwise, so it is bounded even if orphaned. Poll the op every 50 ms, with a 5 s cap, both before asserting 4242 and after the kill.

Run `cd src-tauri && cargo test -p gamelib-steampoll --test dispatch darwin_running_app_id` and confirm it FAILS (the op answers 0). Do not commit the red state on its own; it goes into the one commit with the implementation.

GREEN:
(1) `src-tauri/crates/gamelib-steampoll/Cargo.toml`: add a `[target.'cfg(target_os = "macos")'.dependencies]` table with `libc = "0.2.186"`. Precede it with a short comment: running_scan.rs calls libproc directly, and libc is already resolved in Cargo.lock at this version, so no new crate enters the tree (the same "declare what your own code calls" discipline as `src-tauri/Cargo.toml`'s libc comment).

(2) New `src-tauri/crates/gamelib-steampoll/src/running_scan.rs`. Start it with a module doc that cites quick 261118-uma, the todo and the measurements in the context block: relative argv versus proc_pidpath, the /private canonical form, the pid-count return, about 2 ms with no child process. It contains:
- `pub type ExeLister = dyn Fn() -> Result<Vec<PathBuf>, String> + Send + Sync;`. The alias keeps `clippy::type_complexity` from firing at the use sites.
- `pub fn list_process_exe_paths() -> Result<Vec<PathBuf>, String>`. On `target_os = "macos"`: call `libc::proc_listallpids(null_mut, 0)` for a count n, and return Err when n <= 0. Allocate a zeroed `Vec<c_int>` of n + 256 slots and call `proc_listallpids` again with the buffer's BYTE size. The return value is a pid COUNT; clamp it to the buffer length, and return Err when it is <= 0. For each pid > 0, call `libc::proc_pidpath` with a `PROC_PIDPATHINFO_MAXSIZE` byte buffer. On r > 0, take bytes `[..r]` (clamped to the buffer) into a `PathBuf` via `OsStr::from_bytes`; on r <= 0, skip the pid (EPERM/ESRCH). Every `unsafe` block is minimal and carries a `// SAFETY:` comment naming the buffer and size it passes. On every other target the function returns `Ok(Vec::new())`; it is never reached in production because only the Darwin arm calls it.
- `pub fn app_id_from_exe_paths(exe_paths: &[PathBuf], libraries: &[PathBuf]) -> u32`. For each library, the candidate prefixes are the library as given and its `std::fs::canonicalize` form (deduplicated), each joined with `steamapps/common`. An exe path matches a prefix by `Path::starts_with`, which compares whole components, so `Bastion2` never matches `Bastion`. The remainder after the prefix must have at least 2 components (the game folder plus something inside it); its first component is the candidate folder name. If no exe path yields a candidate, return 0 without reading any ACF; this is the cheap path when no game runs. Otherwise, for each library that produced a candidate, call `gamelib_steamfiles::library::scan_acfs` once for `<library>/steamapps`. A record matches when its `installdir` equals the folder name ignoring ASCII case (default APFS is case-insensitive). Its appId is `record.appid` parsed as a u32 > 0, falling back to the digits in the `appmanifest_<id>.acf` file name. Return the smallest matching appId (decision 7), or 0. The ACF installdir is only compared, never joined into a path.
- `pub fn scan_running_app_id(profile_home: &Path, steam_root: Option<&str>, strict: bool, lister: &ExeLister) -> Result<u32, String>`. The root is `steam_root` when it is non-empty, else `profile_home/Library/Application Support/Steam`, the same place the registry.vdf probe reads. The libraries are `crate::acf_state::steam_libraries(root, strict)?`, so strict propagates an I/O failure of an existing libraryfolders.vdf, plus the root itself, keeping only existing directories, deduplicated. If no library is left, return `Ok(0)` WITHOUT calling the lister. A lister `Err` is `Err(format!("running app id: process list failed: {e}"))` when strict and `Ok(0)` otherwise. Else return `Ok(app_id_from_exe_paths(&paths, &libraries))`.

(3) `src-tauri/crates/gamelib-steampoll/src/lib.rs`: add `pub mod running_scan;` after `pub mod running;`.

(4) `src-tauri/crates/gamelib-steampoll/src/running.rs`: add `pub async fn read_running_app_id_or_process_scan(platform: Platform, profile_home: &Path, steam_root: Option<&str>, runner: &dyn ProcessRunner, strict: bool, lister: &ExeLister) -> Result<u32, String>`. It awaits `read_running_app_id(...)?` first. When that is non-zero, or the platform is not Darwin, it returns it unchanged (Windows and Linux stay exactly as before). Otherwise it returns `scan_running_app_id(profile_home, steam_root, strict, lister)`. A strict Err from the registry step, such as no profile home, therefore still surfaces before any scan.
Update the module doc and `read_running_app_id`'s doc: the `_steam_root` note, and that the on-demand op adds the Darwin scan. Add a sentence to `RunningPoll::for_platform`'s doc saying its Darwin probe deliberately stays registry-only (decision 2: Playing status belongs to the launch watch, games launched without Steam would be reported, and it would scan every tick). Do NOT change `for_platform`'s call.

(5) `src-tauri/crates/gamelib-steampoll/src/dispatch.rs`: in the `steampoll_read_running_app_id` arm, replace the `read_running_app_id(...)` call with `read_running_app_id_or_process_scan(platform, &f.home, root.as_deref(), &*f.runner, a.strict, &list_process_exe_paths)`, and update the `use` lines. If nothing else in dispatch.rs uses `read_running_app_id`, drop it from the import so no unused-import warning is left.

Then run the verify command. Commit only these seven paths. First check that `git diff src-tauri/Cargo.lock` shows only the added `"libc",` line inside the gamelib-steampoll package entry. Message: `fix(quick-261118-uma): read the running Mac Steam game from the process table`.
  </action>
  <verify>
    <automated>cd src-tauri && cargo test -p gamelib-steampoll --test dispatch --test running && cargo fmt -p gamelib-steampoll --check && cd .. && test "$(grep -c '^name = ' src-tauri/Cargo.lock)" -le 684 && test "$(grep -v '^[[:space:]]*//' src-tauri/crates/gamelib-steampoll/src/dispatch.rs | grep -c 'read_running_app_id_or_process_scan')" -ge 1 && test "$(grep -c 'read_running_app_id(platform, &home, root.as_deref(), &\*runner, false)' src-tauri/crates/gamelib-steampoll/src/running.rs)" -ge 1 && test "$(grep -v '^[[:space:]]*//' src-tauri/crates/gamelib-steampoll/src/running_scan.rs | grep -c 'proc_pidpath')" -ge 1</automated>
    Gate baselines, in command order. Cargo.lock package names [HEAD=684 EXPECT<=684 GUARD MUTATION: a dependency on any crate not already in the lock adds a `name = ` line and turns this red]. The dispatch.rs scan call [HEAD=0 EXPECT>=1]. The for_platform registry-only call in running.rs [HEAD=1 EXPECT>=1 GUARD MUTATION: switching RunningPoll::for_platform to the scan variant removes the literal and turns this red]. proc_pidpath in running_scan.rs [HEAD=error:2 EXPECT>=1]. `cargo fmt -p gamelib-steampoll --check` exited 0 at HEAD and must still exit 0. Prettier is deliberately omitted: every file in this task is .rs, .toml or .lock (`inferredParser: null`), so prettier cannot check them, and cargo fmt is the formatter gate. The macOS live test must have been seen RED before the implementation; record the red run in the SUMMARY.
  </verify>
  <done>On this Mac, the new dispatch test passes: a relative-argv process whose executable is in a scratch Steam library's `steamapps/common/Fixture Game/` makes `steampoll_read_running_app_id` answer 4242 (strict and non-strict), then 0 after it is killed. All existing dispatch and running tests pass. RunningPoll::for_platform is unchanged. Cargo.lock gained one dependency line and no package. The seven paths are committed and nothing else.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Pin the matcher contract on every OS, and the TS seam that turns a non-zero reply into the refusal</name>
  <files>src-tauri/crates/gamelib-steampoll/tests/running_scan.rs, src-tauri/crates/gamelib-steampoll/src/running_scan.rs, src/backend/storeManagers/steam/library/runningPoll.ts, src/backend/storeManagers/steam/__tests__/macSteamAdoption.test.ts</files>
  <behavior>
    Rust, new `tests/running_scan.rs`. Every case runs on all three CI OSes unless marked; fixtures are tempdirs and the lister is injected:
    - Avadon shape: an exe at `<lib>/steamapps/common/Avadon The Black Fortress/Avadon.app/Contents/MacOS/Avadon` plus an ACF for 112100 with that installdir gives 112100.
    - Bastion shape: the lister returns `/bin/bash` and `<lib>/steamapps/common/Bastion/Bastion.app/Contents/MacOS/Bastion.bin.osx`, with an ACF for 107100 and installdir "Bastion"; the answer is 107100 (matched on the child's exe path, not on argv).
    - With both games running the answer is 107100, the lowest.
    - Each of these gives 0: a sibling folder `Bastion2` with no ACF; a folder under common/ with no matching ACF; an exe sitting directly in `steamapps/common/`; Steam's own `<root>/Steam.AppBundle/Steam/Contents/MacOS/steam_osx`; an `/Applications/...` app.
    - ACF installdir "bastion" against folder "Bastion" gives 107100 (case-insensitive).
    - `#[cfg(unix)]`: a library passed through a symlink, with the exe path given under the symlink's canonical target, still matches.
    - `scan_running_app_id`: a game in a second library listed only in `<root>/steamapps/libraryfolders.vdf` is found. With `steam_root` None, the root falls back to `<home>/Library/Application Support/Steam`. With no Steam directory the answer is `Ok(0)` and the lister is never called (an AtomicBool flag). A lister Err gives `Ok(0)` non-strict and an `Err` containing "process list failed" strict.
    - `read_running_app_id_or_process_scan`: Darwin with registry.vdf RunningAppID 7000 gives 7000 and the lister is never called. Darwin with no registry.vdf and a matching lister gives the scanned appId. Linux with a registry.vdf value gives that value with the lister never called. Linux with registry 0 takes the reaper path (ScriptedRunner `ps -eo args` with no reaper line) and gives 0, lister never called. Win32 never calls the lister.
    TS, `macSteamAdoption.test.ts`, inside `describe('createRestartDeps')`. No `readRunningAppId` stub: this closes the gap the todo names, where unit tests passed because they stubbed it.
    - On darwin, a `requestRustInvoke` jest.fn resolving 112100 makes `restartSteamForAdoption('208400', createRestartDeps(base({ requestRustInvoke, macSteam })))` resolve `{ kind: 'game-running', runningAppId: 112100 }`. `requestRustInvoke` was called with `RUST_STEAMPOLL_READ_RUNNING_APP_ID` and `[{ strict: false }]`; `macSteam.openUrlDetached` and `sendFrontendMessage` were never called (no steam://exit, no steam-starting status).
    - On darwin, a rejected `requestRustInvoke` makes `deps.readRunningAppId()` resolve 0 (non-strict, unchanged behaviour).
  </behavior>
  <action>
Write `src-tauri/crates/gamelib-steampoll/tests/running_scan.rs` for the Rust behaviors above. Import `gamelib_steampoll::running_scan::{app_id_from_exe_paths, scan_running_app_id}`, `gamelib_steampoll::running::read_running_app_id_or_process_scan`, `gamelib_steampoll::profile::Platform` and `gamelib_steampoll::testing::ScriptedRunner`. Build ACF fixtures with the same tab-separated `"AppState"` text as `tests/dispatch.rs`'s `write_acf`, and the registry.vdf fixture as in `tests/running.rs`'s `reg_vdf`. The reaper case reuses the `runner.on("ps -eo args", ...)` pattern from `tests/running.rs`. Use `tokio::test` for the async cases.

Run the tests. Any case that fails exposes a defect in Task 1's `running_scan.rs`: fix it there to the stated contract, and never weaken a test to fit the code. Some cases may pass at once because Task 1 implemented the spec; record which ones were red in the SUMMARY.

TS: in `src/backend/storeManagers/steam/__tests__/macSteamAdoption.test.ts`, add the two seam tests above inside the existing `describe('createRestartDeps')`, using its `base()` helper. Import `RUST_STEAMPOLL_READ_RUNNING_APP_ID` from `common/types/sidecarTransport` (`restartSteamForAdoption` is already imported). Type the jest.fn so `pnpm codecheck` passes, casting through the `requestRustInvoke` parameter type of `createRestartDeps` if needed. Do not write async arrow functions without an await: the file is at 7 `require-await` warnings and must not rise.

In `src/backend/storeManagers/steam/library/runningPoll.ts`, change doc comments only, no logic. `readMacRunningAppId`'s comment becomes: registry.vdf first, then, because Mac Steam writes no RunningAppID, the Rust op's process scan by executable path under every Steam library's `steamapps/common/<installdir>` (quick 261118-uma). The 5 s poller does not scan. `readRunningAppId`'s comment notes the same Darwin fallback.

Then run the verify command, including the workspace clippy ratchet. New code must add zero clippy warnings, and the ratchet fails on a rise. If the count for a lint FALLS, lower that ceiling in `meta/clippyRatchet.cjs` in this commit and add that path to the commit, as the ratchet demands. If the ratchet reports a rise you cannot clear, stop and report it rather than raising a ceiling.

Run `graphify update .` (graphify-out is gitignored). Commit only this task's paths (plus `meta/clippyRatchet.cjs` only in the fall case). Message: `test(quick-261118-uma): pin the Mac running-game scan contract and the restart refusal seam`.
  </action>
  <verify>
    <automated>cd src-tauri && cargo test -p gamelib-steampoll && cargo fmt -p gamelib-steampoll --check && cargo +1.99.1 clippy --workspace --all-targets --message-format=json > "$TMPDIR/uma-clippy.json" && node ../meta/clippyRatchet.cjs "$TMPDIR/uma-clippy.json" --list && cd .. && npx jest --runTestsByPath src/backend/storeManagers/steam/__tests__/macSteamAdoption.test.ts && pnpm codecheck && npx eslint --max-warnings 7 src/backend/storeManagers/steam/library/runningPoll.ts src/backend/storeManagers/steam/__tests__/macSteamAdoption.test.ts && for p in src/backend/storeManagers/steam/library/runningPoll.ts src/backend/storeManagers/steam/__tests__/macSteamAdoption.test.ts; do npx prettier --file-info "$p" | grep -Eq '"ignored":[[:space:]]*false' || { echo "UNEXPECTED ignored: $p"; exit 1; }; done && npx prettier --check src/backend/storeManagers/steam/library/runningPoll.ts src/backend/storeManagers/steam/__tests__/macSteamAdoption.test.ts && test "$(grep -c 'RUST_STEAMPOLL_READ_RUNNING_APP_ID' src/backend/storeManagers/steam/__tests__/macSteamAdoption.test.ts)" -ge 1</automated>
    Gate baseline: `RUST_STEAMPOLL_READ_RUNNING_APP_ID` in the test file [HEAD=0 EXPECT>=1]. The rest are not count gates, so they carry no notation:
    - macSteamAdoption.test.ts reported 63 passed at HEAD and must report at least 65.
    - eslint over the two TS files reported 7 warnings at HEAD; `--max-warnings 7` holds them there.
    - `cargo test -p gamelib-steampoll` is green at HEAD and must stay green with the new running_scan target.
    - The clippy ratchet must exit 0.
    Prettier covers only the two TS files (both `ignored: false`, typescript). The .rs files have no prettier parser and are gated by cargo fmt.
  </verify>
  <done>Every Rust contract case passes on this Mac, and the cases are written to pass on the Windows and Linux CI legs (no macOS-only assumption outside cfg). The TS seam test proves a non-zero steampoll reply on darwin yields `game-running` with no steam://exit, without stubbing readRunningAppId. The runningPoll.ts docs describe the Darwin fallback. The clippy ratchet, codecheck, eslint (≤7 warnings) and the scoped prettier check are green. This task's paths are committed and nothing else.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Live on the Mac: Play and "Restart Steam now" refuse while a Steam game runs</name>
  <what-built>On Mac, the Rust running-app op now finds a running Steam game by its executable path under the Steam libraries, so restart-on-Play and "Restart Steam now" refuse instead of quitting Steam under the game (phase-81 item 5 defect).</what-built>
  <how-to-verify>
1. Quit GameLib if it is running. From the repo root run `pnpm tauri:dev` (never `tauri:dev:run`). This recompiles the Rust shell with the change. No sidecar rebuild is needed: the TS changes are comments and tests only.
2. Make sure one game C shows the note "Steam will restart once when you press Play." Any pending game works; 208400 (Avernum: Escape from the Pit) was still pending after the phase-81 gate. If none is pending, install a small owned Mac game with Settings InstallApp OFF. Note C's appId.
3. Start game A from Steam's own library (for example Avadon 112100). In a terminal, check that `ps -A -o pid=,args= | grep -i 'steamapps/common' | grep -v grep` lists it, and note the Steam pid from `pgrep -x steam_osx`.
4. In GameLib, press Play on C. Expect the in-app notice "Quit the game running in Steam, then press Play to finish setting up <C's name>.", with a "Launch without Steam" button unless C has Steam DRM. Steam must not quit: `pgrep -x steam_osx` prints the same pid. No Steam install dialog appears, and C still shows its note. Then check the log. `grep -n "not restarting Steam for <C>" ~/Library/Logs/GameLib/gamelib.log` should show `[Steam] not restarting Steam for <C>: game <A> is running`, and `grep -c "fired steam://exit to adopt <C>" ~/Library/Logs/GameLib/gamelib.log` should print 0.
5. Press "Restart Steam now" on C. Expect the same refusal: the log line appears again and the Steam pid is unchanged.
6. Optional, for the relative-argv case: quit A, start Bastion (107100) from Steam, and repeat step 4. The log line should name 107100.
7. Quit the game(s). Do not press Play on C again unless you want C adopted now, because with no game running it restarts Steam.
  </how-to-verify>
  <resume-signal>Type "approved", or describe what differed (paste the gamelib.log lines and both steam_osx pids).</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| process table -> Rust shell | Executable paths of every same-user process, read through libproc. Any same-user process can choose where its binary lives. |
| user filesystem -> Rust shell | libraryfolders.vdf and appmanifest ACFs in user-writable Steam libraries. They are parsed only for the installdir/appid of a library that holds a candidate process. |
| sidecar -> Rust shell | The rustInvoke op `steampoll_read_running_app_id` with args `{ strict? }` only. Paths and the Steam root come from the shell's own profile and HOME, never from the caller. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-uma-01 | Spoofing | running_scan.rs app_id_from_exe_paths | low | accept | A same-user process placed under a library's steamapps/common/<installdir> reads as that game running, so the restart (and that game's update or delete) is refused. That is the fail-safe side: no restart, no delete. A same-uid attacker can already do far more. |
| T-uma-02 | Denial of Service | list_process_exe_paths / scan_acfs | low | mitigate | No child process. The pid count is bounded by the kernel and the buffer is sized from it. The whole scan measured 2.23 ms for 950 pids. ACFs are read only when an exe path already falls under a library's steamapps/common, and scan_acfs caps directory entries (MAX_DIR_ENTRIES). It runs only on demand (Play, Restart Steam now, uninstall, update), never in the 5 s poll and never at boot. |
| T-uma-03 | Tampering | unsafe libproc FFI (proc_listallpids, proc_pidpath) | medium | mitigate | Buffers are sized exactly: n + 256 c_int slots with their byte size passed, and a PROC_PIDPATHINFO_MAXSIZE byte buffer. Returned lengths are clamped to the buffer, and pids <= 0 are skipped. Each unsafe block is minimal with a SAFETY comment, and the macOS live test exercises the real calls. |
| T-uma-04 | Information Disclosure | exe-path list in the shell | low | mitigate | Paths stay in memory inside the op. Only the matched appId (a number) crosses back to the sidecar, and paths are never logged or returned. |
| T-uma-05 | Tampering | ACF installdir from a user-writable file | low | mitigate | installdir is only compared (ASCII case-insensitive) with one path component that came from the kernel's exe path. It is never joined into a path for reading, writing or deleting. |
| T-uma-06 | Denial of Service | false negative: game whose process lives outside a library (java-style launcher, symlinked game folder, bridged/bottled game run by wine) | medium | accept | It reads 0, which is the pre-change behaviour, so Steam may still be restarted under such a game. No such case was seen at the gate (Avadon and Bastion both match). Bridged games are out of this todo's scope. |
| T-uma-SC | Tampering | cargo dependency libc = "0.2.186" in gamelib-steampoll | high | mitigate | No new package enters the supply chain. libc 0.2.186 is already in src-tauri/Cargo.lock and already declared by the shell crate. The gate `grep -c '^name = ' src-tauri/Cargo.lock` stays at 684, and the Cargo.lock diff is one `"libc",` dependency line. There are no npm/pip installs, so no legitimacy checkpoint is needed. |
</threat_model>

<verification>
- `cd src-tauri && cargo test -p gamelib-steampoll` is green on this Mac, including the macOS-only live dispatch test and the new running_scan target.
- `cargo fmt -p gamelib-steampoll --check` exits 0. The workspace clippy ratchet (`cargo +1.99.1 clippy --workspace --all-targets` piped into `meta/clippyRatchet.cjs`) exits 0.
- `npx jest --runTestsByPath src/backend/storeManagers/steam/__tests__/macSteamAdoption.test.ts` reports at least 65 passed; `pnpm codecheck` is green; eslint over the two TS files stays at 7 warnings or fewer; the scoped `npx prettier --check` over the two TS files is green.
- `grep -c '^name = ' src-tauri/Cargo.lock` = 684. `RunningPoll::for_platform` still calls the registry-only `read_running_app_id`.
- Live (Task 3): Play and "Restart Steam now" on a pending game refuse while a Steam game runs on the Mac; the Steam pid is unchanged; the gamelib.log refusal line is present, and there is no `fired steam://exit to adopt <C>`.
</verification>

<success_criteria>
- Mac restart-on-Play and "Restart Steam now" refuse while a Steam-launched game runs, both a Mach-O exe like Avadon and a shell-launched game with a relative argv like Bastion, showing the 81-07 notice with "Launch without Steam" where eligible.
- The Mac uninstall guard (strict) and update guard now see their own game running; a failed process listing makes the strict read refuse rather than read 0.
- Windows and Linux running-app answers, and the Mac 5 s poller, are byte-for-byte unchanged in behaviour.
- No new crate, no child process, nothing new at sidecar boot.
</success_criteria>

<output>
Create `.planning/quick/261118-uma-mac-running-game-signal-for-restart-on-p/261118-uma-SUMMARY.md` when done. Record: the red run of the Task 1 live test; which Task 2 cases were red; the commits; the clippy ratchet result; and the operator's Task 3 result with the log lines and pids.

After the operator types "approved" for Task 3, do the following. `git mv` `.planning/todos/pending/2026-11-18-mac-restart-on-play-ignores-running-game-no-runningappid.md` into `.planning/todos/completed/`. Append a `## Resolution` section to it naming quick 261118-uma, both commit hashes and the live result. Commit only the two paths of that move plus the SUMMARY.

Leave `81-HUMAN-UAT.md` item 5's `result:` for the phase-81 gate re-run; its full steps also score "Launch without Steam", the per-game toggle and the DRM sub-check. Say in the SUMMARY that item 5 is now ready to re-run. If the operator reports an issue, leave the todo in `pending/` and record the failure in the SUMMARY instead.
</output>
