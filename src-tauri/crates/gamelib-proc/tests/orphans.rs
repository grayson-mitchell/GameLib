//! Process-lifetime harness (Phase 83 D-13): a stand-in for the shell spawns a process tree through
//! gamelib-proc; the test drives it and probes liveness from the outside, independently of the
//! code under test.
//!
//! Liveness is "exists and is not a zombie" (`probe::is_alive`). Every wait polls every 100 ms up
//! to 15 s; nothing sleeps a fixed time. A drop guard kills the surviving game pids so CI never
//! accumulates strays.

use gamelib_proc::adopt::{identify, snapshot_members, AdoptProof, Identity, Member};
use gamelib_proc::probe::is_alive;
use gamelib_proc::{
    kill_tree::{kill_adopted_tree, kill_game_tree},
    KillOutcome,
};
use gamelib_testutil::FakeHome;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

const POLL: Duration = Duration::from_millis(100);
const LIMIT: Duration = Duration::from_secs(15);

fn wait_until(what: &str, mut pred: impl FnMut() -> bool) {
    let deadline = Instant::now() + LIMIT;
    loop {
        if pred() {
            return;
        }
        assert!(Instant::now() < deadline, "timed out waiting for: {what}");
        std::thread::sleep(POLL);
    }
}

/// Kills every recorded game pid when dropped, on pass or panic.
struct Strays(Vec<u32>);

impl Drop for Strays {
    fn drop(&mut self) {
        for pid in &self.0 {
            kill_pid(*pid);
        }
    }
}

#[cfg(unix)]
fn kill_pid(pid: u32) {
    // SAFETY: signals one pid the stand-in reported to this test; no pointers are dereferenced.
    unsafe {
        libc::kill(pid as libc::pid_t, libc::SIGKILL);
    }
}

#[cfg(windows)]
fn kill_pid(pid: u32) {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};
    // SAFETY: OpenProcess takes plain values and returns null on failure; a valid handle is
    // terminated and closed exactly once.
    unsafe {
        let h = OpenProcess(PROCESS_TERMINATE, 0, pid);
        if !h.is_null() {
            TerminateProcess(h, 1);
            CloseHandle(h);
        }
    }
}

/// Where the stand-in puts its game's log and the game child's pid, both inside the fake profile.
/// One segment per `join` (Windows paths).
struct Paths {
    game_log: PathBuf,
    game_pids: PathBuf,
    /// The stand-in's stderr, which its reaper inherits: where `[reaper] ...` lines land.
    standin_err: PathBuf,
    /// Where the Node stand-in sidecar writes its two children's pids.
    node_pids: PathBuf,
    /// Where the stand-in writes the game's `<pid> <stamp>` record (`--game-stamp`).
    game_stamp: PathBuf,
}

impl Paths {
    fn new(home: &FakeHome) -> Paths {
        Paths {
            game_log: home.root().join("game.log"),
            game_pids: home.root().join("game-pids.txt"),
            standin_err: home.root().join("standin.err"),
            node_pids: home.root().join("node-pids.json"),
            game_stamp: home.root().join("game-stamp.txt"),
        }
    }
}

/// The stand-in parent with the fake profile applied (Convention 2: never a hand-rolled env
/// literal) and stdin/stdout piped for the driver. `extra` are stand-in flags (`--no-reaper`, ...).
fn standin(home: &FakeHome, paths: &Paths, extra: &[&str]) -> Command {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_gamelib-proc-standin"));
    cmd.arg("parent")
        .arg("--game-log")
        .arg(&paths.game_log)
        .arg("--game-pids")
        .arg(&paths.game_pids)
        .args(extra)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        // A file, never the runner's stderr pipe: if a bug leaves an orphan (or the reaper) behind,
        // it must not hold that pipe open and turn a red run into a hung one. The reaper inherits
        // this file, so its status lines are readable after the fact.
        .stderr(Stdio::from(
            std::fs::File::create(&paths.standin_err).expect("create stand-in stderr file"),
        ));
    home.apply(&mut cmd);
    cmd
}

struct Run {
    child: Child,
    stdin: Option<ChildStdin>,
    manifest: serde_json::Value,
    /// Every stdout line after the manifest, read on a thread so a hung stand-in fails a test
    /// instead of hanging it.
    lines: mpsc::Receiver<String>,
}

impl Run {
    fn start(home: &FakeHome, paths: &Paths) -> Run {
        Run::start_with(home, paths, &[])
    }

    fn start_with(home: &FakeHome, paths: &Paths, extra: &[&str]) -> Run {
        let mut child = standin(home, paths, extra).spawn().expect("spawn stand-in");
        let stdout = child.stdout.take().expect("piped stdout");
        let stdin = child.stdin.take();
        // Read stdout on a thread so a hung stand-in fails the test, not hangs it. The first line
        // is the manifest; the reader keeps going so the stand-in's later lines have somewhere
        // to land (a closed pipe would make its next write fail).
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(l) = line else { break };
                if tx.send(l).is_err() {
                    break;
                }
            }
        });
        let line = rx.recv_timeout(LIMIT).expect("manifest line within 15 s");
        let manifest: serde_json::Value = serde_json::from_str(line.trim()).expect("manifest JSON");
        Run {
            child,
            stdin,
            manifest,
            lines: rx,
        }
    }

    /// Writes one line to the stand-in without closing its stdin.
    fn send(&mut self, line: &str) {
        let stdin = self.stdin.as_mut().expect("stdin still open");
        writeln!(stdin, "{line}").expect("write line");
        stdin.flush().expect("flush line");
    }

    /// Waits (bounded) for the stand-in to print `expected` as a stdout line.
    fn expect_line(&self, expected: &str) {
        let deadline = Instant::now() + LIMIT;
        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            match self.lines.recv_timeout(left) {
                Ok(l) if l.trim() == expected => return,
                Ok(_) => {}
                Err(_) => panic!("timed out waiting for the stand-in to print: {expected}"),
            }
        }
    }

    fn pids(&self, key: &str) -> Vec<u32> {
        self.manifest[key]
            .as_array()
            .unwrap_or_else(|| panic!("manifest has no '{key}'"))
            .iter()
            .map(|v| v.as_u64().expect("pid") as u32)
            .collect()
    }

    fn quit(&mut self) {
        let mut stdin = self.stdin.take().expect("stdin still open");
        writeln!(stdin, "quit").expect("write quit");
        stdin.flush().expect("flush quit");
    }

    /// The reaper's pid, when the stand-in started one (unix, without `--no-reaper`).
    #[cfg(unix)]
    fn reaper_pid(&self) -> Option<u32> {
        self.manifest["reaper"].as_u64().map(|p| p as u32)
    }

    /// Hard-kills the stand-in parent: SIGKILL on unix, TerminateProcess on Windows.
    fn kill_parent(&mut self) {
        self.child.kill().expect("kill the stand-in parent");
    }

    fn wait_for_parent_exit(&mut self) {
        wait_until("the stand-in parent to exit", || {
            matches!(self.child.try_wait(), Ok(Some(_)))
        });
    }
}

impl Drop for Run {
    fn drop(&mut self) {
        // A failed test must not leave the stand-in behind: closing stdin makes it drain and exit.
        self.stdin.take();
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Everything the stand-in (and so its reaper) wrote to stderr.
#[cfg(unix)]
fn standin_stderr(paths: &Paths) -> String {
    std::fs::read_to_string(&paths.standin_err).unwrap_or_default()
}

fn file_len(path: &PathBuf) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

/// After the parent is gone: every helper and grandchild dies, the game tree does not.
fn assert_helpers_die_and_game_survives(run: &Run, paths: &Paths) {
    let helpers = run.pids("helpers");
    let grandchildren = run.pids("grandchildren");
    let games = run.pids("games");
    wait_until("every helper and grandchild to die", || {
        helpers
            .iter()
            .chain(grandchildren.iter())
            .all(|p| !is_alive(*p))
    });
    for g in &games {
        assert!(is_alive(*g), "game process {g} must survive");
    }
    // Alive is not enough (a stopped process is "alive"): the game must still be writing to the
    // log it was given, i.e. a closed parent pipe did not take it down (Pitfall 5).
    let before = file_len(&paths.game_log);
    wait_until("the game to keep writing to its log", || {
        file_len(&paths.game_log) > before
    });
    for g in &games {
        assert!(is_alive(*g), "game process {g} must still be alive");
    }
    println!("game tree alive after the parent left: {games:?}");
}

#[test]
fn graceful_quit_terminates_the_helper() {
    let home = FakeHome::new("gamelib-proc-orphans");
    let paths = Paths::new(&home);
    let mut run = Run::start(&home, &paths);
    let _strays = Strays(run.pids("games"));
    let helpers = run.pids("helpers");
    assert!(!helpers.is_empty());
    assert!(is_alive(helpers[0]), "helper alive before quit");

    run.quit();
    run.wait_for_parent_exit();
    wait_until("the helper to die", || !is_alive(helpers[0]));
}

#[test]
fn graceful_quit_kills_helpers_and_grandchildren_and_spares_the_game() {
    let home = FakeHome::new("gamelib-proc-orphans");
    let paths = Paths::new(&home);
    let mut run = Run::start(&home, &paths);
    let _strays = Strays(run.pids("games"));
    assert_eq!(run.pids("helpers").len(), 3);
    assert_eq!(run.pids("grandchildren").len(), 1);
    assert_eq!(run.pids("games").len(), 2);
    for p in run
        .pids("helpers")
        .into_iter()
        .chain(run.pids("grandchildren"))
        .chain(run.pids("games"))
    {
        assert!(is_alive(p), "pid {p} alive before quit");
    }

    run.quit();
    run.wait_for_parent_exit();
    assert_helpers_die_and_game_survives(&run, &paths);
}

/// Windows has no reaper: the kernel closes the dead parent's Job handles, which kills every
/// member. The game was never in a Job.
#[cfg(windows)]
#[test]
fn sigkill_kills_helpers_and_grandchildren_and_spares_the_game() {
    let home = FakeHome::new("gamelib-proc-orphans");
    let paths = Paths::new(&home);
    let mut run = Run::start(&home, &paths);
    let _strays = Strays(run.pids("games"));

    run.kill_parent();
    run.wait_for_parent_exit();
    assert_helpers_die_and_game_survives(&run, &paths);
}

/// Unix has a reaper: after SIGKILL of the parent, a separate process sees the control pipe hit EOF
/// and kills every registered group. The game tree is not registered, so it survives (D-08).
#[cfg(unix)]
#[test]
fn sigkill_kills_helpers_and_spares_the_game() {
    let home = FakeHome::new("gamelib-proc-orphans");
    let paths = Paths::new(&home);
    let mut run = Run::start(&home, &paths);
    let _strays = Strays(run.pids("games"));
    let reaper = run.reaper_pid().expect("the stand-in started a reaper");
    assert!(is_alive(reaper), "reaper alive before the kill");
    for p in run
        .pids("helpers")
        .into_iter()
        .chain(run.pids("grandchildren"))
    {
        assert!(is_alive(p), "pid {p} alive before the kill");
    }

    run.kill_parent();
    run.wait_for_parent_exit();
    assert_helpers_die_and_game_survives(&run, &paths);
    // The reaper exits on its own once it has reaped, and says so.
    wait_until("the reaper to exit", || !is_alive(reaper));
    wait_until("the reaper's status line", || {
        standin_stderr(&paths).contains("[reaper] parent gone: signalled ")
    });
    println!("{}", standin_stderr(&paths));
    for g in run.pids("games") {
        assert!(
            is_alive(g),
            "game process {g} must survive the reaper's exit"
        );
    }
}

/// Negative control (Pitfall 7): with the reaper disabled, a SIGKILL of the parent leaves its
/// helper alive. This is what makes the positive leg above non-vacuous: the probe demonstrably sees
/// an orphan. The test kills the survivors itself so CI never accumulates them.
#[cfg(unix)]
#[test]
fn sigkill_without_reaper_leaves_the_helper_alive() {
    let home = FakeHome::new("gamelib-proc-orphans");
    let paths = Paths::new(&home);
    let mut run = Run::start_with(&home, &paths, &["--no-reaper"]);
    assert_eq!(
        run.reaper_pid(),
        None,
        "--no-reaper must not start a reaper"
    );
    let survivors: Vec<u32> = run
        .pids("helpers")
        .into_iter()
        .chain(run.pids("grandchildren"))
        .chain(run.pids("games"))
        .collect();
    let _strays = Strays(survivors.clone());

    run.kill_parent();
    run.wait_for_parent_exit();
    // Longer than a working reaper needs to SIGTERM an idle helper: if one were running, these
    // would be dead by now. A bounded observation window, not a fixed sleep for a result.
    let until = Instant::now() + Duration::from_millis(2500);
    while Instant::now() < until {
        for p in &survivors {
            assert!(is_alive(*p), "pid {p} should be an orphan, still alive");
        }
        std::thread::sleep(POLL);
    }
    println!("orphans alive without a reaper: {survivors:?}");
}

/// Graceful quit: `disarm` then EOF makes the reaper exit by itself without signalling anything
/// (the helpers are already gone through `terminate_all`, the game was never registered).
#[cfg(unix)]
#[test]
fn graceful_quit_disarms_the_reaper() {
    let home = FakeHome::new("gamelib-proc-orphans");
    let paths = Paths::new(&home);
    let mut run = Run::start(&home, &paths);
    let _strays = Strays(run.pids("games"));
    let reaper = run.reaper_pid().expect("the stand-in started a reaper");
    assert!(is_alive(reaper), "reaper alive before quit");

    run.quit();
    run.wait_for_parent_exit();
    let quit_at = Instant::now();
    wait_until("the reaper to exit by itself", || !is_alive(reaper));
    assert!(
        quit_at.elapsed() < Duration::from_secs(5),
        "reaper took {:?} to exit after a graceful quit",
        quit_at.elapsed()
    );
    wait_until("the reaper's disarmed line", || {
        standin_stderr(&paths).contains("[reaper] disarmed")
    });
    assert!(
        !standin_stderr(&paths).contains("parent gone"),
        "a graceful quit must not reap: {}",
        standin_stderr(&paths)
    );
    assert_helpers_die_and_game_survives(&run, &paths);
}

/// A leaked duplicate of the control pipe's write end (here: a sleeper helper holding it as its
/// stdin) keeps the pipe open after the parent dies, so EOF never arrives. The reaper's
/// `getppid()` poll is the secondary trigger that still reaps.
#[cfg(unix)]
#[test]
fn sigkill_with_a_leaked_pipe_still_reaps() {
    let home = FakeHome::new("gamelib-proc-orphans");
    let paths = Paths::new(&home);
    let mut run = Run::start_with(&home, &paths, &["--leak-pipe"]);
    let _strays = Strays(run.pids("games"));
    let reaper = run.reaper_pid().expect("the stand-in started a reaper");
    assert_eq!(
        run.pids("helpers").len(),
        4,
        "the sleeper is the fourth helper"
    );
    let sleeper = run.pids("helpers")[3];
    assert!(is_alive(sleeper), "sleeper alive before the kill");

    run.kill_parent();
    run.wait_for_parent_exit();
    let killed_at = Instant::now();
    wait_until("the leaked-pipe reap", || {
        run.pids("helpers")
            .iter()
            .chain(run.pids("grandchildren").iter())
            .all(|p| !is_alive(*p))
            && !is_alive(reaper)
    });
    assert!(
        killed_at.elapsed() < Duration::from_secs(8),
        "the getppid trigger took {:?}",
        killed_at.elapsed()
    );
    assert_helpers_die_and_game_survives(&run, &paths);
    assert!(standin_stderr(&paths).contains("[reaper] parent gone: signalled "));
}

/// `true` when `node` runs. Missing node is a hard failure on CI (a skipped leg there would be a
/// green that proves nothing) and a printed skip locally, the rule `gamelib-testutil`'s
/// `require_link` follows.
fn node_available() -> bool {
    let ok = Command::new("node")
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if !ok {
        if std::env::var("CI").is_ok() {
            panic!("node is required on CI for the Node stand-in leg but `node --version` failed");
        }
        println!("SKIP node_standin_children_die_with_the_parent: node is not installed");
    }
    ok
}

/// D-10: the TS runner's tracked children are plain (non-detached) `child_process.spawn` children,
/// so they live in their parent's process group (unix, killed by the reaper) or its Job (Windows,
/// killed by the kernel when the dead parent's handles close). A SIGKILL of the shell must take
/// the Node sidecar and both of its children with it.
#[test]
fn node_standin_children_die_with_the_parent() {
    if !node_available() {
        return;
    }
    let home = FakeHome::new("gamelib-proc-orphans");
    let paths = Paths::new(&home);
    let node_pids = paths.node_pids.to_string_lossy().into_owned();
    let mut run = Run::start_with(&home, &paths, &["--node-sidecar", &node_pids]);
    let _strays = Strays(
        run.pids("games")
            .into_iter()
            .chain(run.pids("helpers"))
            .chain(run.pids("grandchildren"))
            .collect(),
    );
    let helpers = run.pids("helpers");
    let grandchildren = run.pids("grandchildren");
    assert_eq!(helpers.len(), 4, "node sidecar is the fourth helper");
    assert_eq!(grandchildren.len(), 3, "the node sidecar's two children");
    let node = helpers[3];
    for p in std::iter::once(&node).chain(&grandchildren[1..]) {
        assert!(is_alive(*p), "pid {p} alive before the kill");
    }

    run.kill_parent();
    run.wait_for_parent_exit();
    wait_until("the node sidecar and both its children to die", || {
        !is_alive(node) && grandchildren[1..].iter().all(|p| !is_alive(*p))
    });
    assert_helpers_die_and_game_survives(&run, &paths);
}

/// The winetricks shape (D-17): a child run through `SpecProcRunner` that itself starts a
/// grandchild. The stand-in's `--spec-tree` flag adds that child to `helpers` and its grandchild to
/// `grandchildren`, so the shared assertion covers both. Unix has the reaper after a SIGKILL;
/// Windows has the kill-on-close Job. The game tree is not registered, so it survives (D-08).
#[test]
fn sigkill_kills_spec_child_and_grandchild() {
    let home = FakeHome::new("gamelib-proc-orphans");
    let paths = Paths::new(&home);
    let mut run = Run::start_with(&home, &paths, &["--spec-tree"]);
    let _strays = Strays(
        run.pids("games")
            .into_iter()
            .chain(run.pids("helpers"))
            .chain(run.pids("grandchildren"))
            .collect(),
    );
    let helpers = run.pids("helpers");
    let grandchildren = run.pids("grandchildren");
    assert_eq!(helpers.len(), 4, "the spec child is the fourth helper");
    assert_eq!(grandchildren.len(), 2, "and its grandchild the second");
    let (spec_child, spec_grandchild) = (helpers[3], grandchildren[1]);
    assert!(is_alive(spec_child), "spec child alive before the kill");
    assert!(
        is_alive(spec_grandchild),
        "spec grandchild alive before the kill"
    );

    run.kill_parent();
    run.wait_for_parent_exit();
    wait_until("the spec child and its grandchild to die", || {
        !is_alive(spec_child) && !is_alive(spec_grandchild)
    });
    assert_helpers_die_and_game_survives(&run, &paths);
}

/// As above, after a graceful quit: the stand-in drains the `ChildSet`, which reaches the spec
/// child's group (unix) or Job (Windows) and so its grandchild.
#[test]
fn graceful_quit_kills_spec_child_and_grandchild() {
    let home = FakeHome::new("gamelib-proc-orphans");
    let paths = Paths::new(&home);
    let mut run = Run::start_with(&home, &paths, &["--spec-tree"]);
    let _strays = Strays(
        run.pids("games")
            .into_iter()
            .chain(run.pids("helpers"))
            .chain(run.pids("grandchildren"))
            .collect(),
    );
    let helpers = run.pids("helpers");
    let grandchildren = run.pids("grandchildren");
    assert_eq!(helpers.len(), 4, "the spec child is the fourth helper");
    assert_eq!(grandchildren.len(), 2, "and its grandchild the second");
    let (spec_child, spec_grandchild) = (helpers[3], grandchildren[1]);
    assert!(is_alive(spec_child), "spec child alive before quit");
    assert!(
        is_alive(spec_grandchild),
        "spec grandchild alive before quit"
    );

    run.quit();
    run.wait_for_parent_exit();
    wait_until("the spec child and its grandchild to die", || {
        !is_alive(spec_child) && !is_alive(spec_grandchild)
    });
    assert_helpers_die_and_game_survives(&run, &paths);
}

/// WR-01: a helper's group member that ignores SIGTERM must not outlive a graceful quit. The
/// stand-in's `--stubborn-tree` flag adds two helpers (an owned one from `spawn_helper_with_pipes`
/// and a tokio-registered one through `SpecProcRunner`), each with a grandchild that ignores
/// SIGTERM. The helpers themselves end on SIGTERM, so only a group-based wait plus the SIGKILL at
/// the deadline reaches the grandchildren.
#[cfg(unix)]
#[test]
fn graceful_quit_sigkills_helper_grandchildren_that_ignore_sigterm() {
    let home = FakeHome::new("gamelib-proc-orphans");
    let paths = Paths::new(&home);
    let mut run = Run::start_with(&home, &paths, &["--stubborn-tree"]);
    let _strays = Strays(
        run.pids("games")
            .into_iter()
            .chain(run.pids("helpers"))
            .chain(run.pids("grandchildren"))
            .collect(),
    );
    let helpers = run.pids("helpers");
    let grandchildren = run.pids("grandchildren");
    assert_eq!(
        helpers.len(),
        5,
        "the two stubborn trees are helpers 4 and 5"
    );
    assert_eq!(grandchildren.len(), 3, "and their grandchildren 2 and 3");
    for p in helpers[3..].iter().chain(grandchildren[1..].iter()) {
        assert!(is_alive(*p), "pid {p} alive before quit");
    }

    run.quit();
    run.wait_for_parent_exit();
    wait_until("the stubborn grandchildren to die", || {
        grandchildren[1..].iter().all(|p| !is_alive(*p))
    });
    assert_helpers_die_and_game_survives(&run, &paths);
}

/// WR-03: a `SpecProcRunner` child that ends on its own leaves what it started running, across the
/// run's return and a graceful quit. The stand-in's `--spec-detach` flag runs a `detach` child (it
/// starts one `idle` grandchild and exits 0) and prints the manifest only after that run has
/// returned; the grandchild's pid is the manifest's `detached`. On Windows HEAD (before the fix) the
/// guard drop closes the kill-on-close Job and kills it before the manifest is printed; on unix the
/// reaper and `terminate_all` never knew the entry after its clean exit, so it passes there.
#[test]
fn a_spec_childs_background_process_survives_its_clean_exit_and_the_quit() {
    let home = FakeHome::new("gamelib-proc-orphans");
    let paths = Paths::new(&home);
    let mut run = Run::start_with(&home, &paths, &["--spec-detach"]);
    let detached = run.pids("detached");
    assert_eq!(detached.len(), 1, "one detached grandchild");
    let _strays = Strays(
        run.pids("games")
            .into_iter()
            .chain(run.pids("helpers"))
            .chain(run.pids("grandchildren"))
            .chain(detached.iter().copied())
            .collect(),
    );
    assert!(
        is_alive(detached[0]),
        "the detached grandchild is alive after its parent's clean exit"
    );

    run.quit();
    run.wait_for_parent_exit();
    // A bounded observation window (polled, never one sleep deciding a result): the quit drained
    // every helper, and the detached process must still be here after all of it.
    let until = Instant::now() + Duration::from_millis(2500);
    while Instant::now() < until {
        assert!(
            is_alive(detached[0]),
            "the detached grandchild {} died with the quit",
            detached[0]
        );
        std::thread::sleep(POLL);
    }
    assert_helpers_die_and_game_survives(&run, &paths);
}

/// The game's `<pid> <stamp>` record the stand-in wrote for `--game-stamp`.
fn read_game_stamp(paths: &Paths) -> (u32, u64) {
    let text = std::fs::read_to_string(&paths.game_stamp).expect("the stand-in wrote a game stamp");
    let mut fields = text.split_whitespace();
    let pid = fields
        .next()
        .and_then(|f| f.parse().ok())
        .expect("game pid");
    let stamp = fields
        .next()
        .and_then(|f| f.parse().ok())
        .expect("game stamp");
    (pid, stamp)
}

/// An unrelated process the kill must not touch: the stand-in in `idle` mode, spawned by the test
/// with the fake profile applied. Its pid is registered with `strays` so CI never keeps it, and
/// the returned `Child` is held by the caller until the end of the test.
fn spawn_bystander(home: &FakeHome, strays: &mut Strays) -> (Child, u32) {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_gamelib-proc-standin"));
    cmd.arg("idle")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    home.apply(&mut cmd);
    let child = cmd.spawn().expect("spawn the bystander");
    let pid = child.id();
    strays.0.push(pid);
    assert!(is_alive(pid), "the bystander is alive before the kill");
    (child, pid)
}

/// SC2, the concurrency edge: a hard kill of the parent leaves the game and its grandchild alive (a
/// Game is never in the reaper's set or a kill-on-close Job), and a stamp-checked kill from a
/// different process (this test) then removes both. Liveness is probed from outside with
/// `probe::is_alive`. Shared by the unix and Windows arms; on Windows it proves that a named Game
/// Job without kill-on-close can be reopened by name after its creator died (flagged assumption A5).
fn parent_killed_game_spared_then_stamped_kill_removes_its_tree() {
    let home = FakeHome::new("gamelib-proc-orphans");
    let paths = Paths::new(&home);
    let stamp_path = paths.game_stamp.to_string_lossy().into_owned();
    let mut run = Run::start_with(&home, &paths, &["--game-stamp", &stamp_path]);
    let games = run.pids("games");
    let mut strays = Strays(games.clone());
    let (_bystander, bystander) = spawn_bystander(&home, &mut strays);
    let (pid, stamp) = read_game_stamp(&paths);
    assert_eq!(games.len(), 2, "the game and its game-child");
    assert_eq!(games[0], pid, "the stamp record names the game leader");
    for g in &games {
        assert!(is_alive(*g), "game process {g} alive before the kill");
    }

    run.kill_parent();
    run.wait_for_parent_exit();
    // The game and its grandchild survive the parent, and the game keeps writing to its log.
    let before = file_len(&paths.game_log);
    wait_until("the game to keep writing to its log", || {
        file_len(&paths.game_log) > before
    });
    for g in &games {
        assert!(is_alive(*g), "game process {g} must survive the parent");
    }

    let outcome = kill_game_tree(pid, stamp, Duration::from_millis(1500));
    assert_eq!(outcome, KillOutcome::Killed);
    wait_until("the game and its grandchild to die", || {
        games.iter().all(|g| !is_alive(*g))
    });
    assert!(
        is_alive(bystander),
        "an unrelated process must survive the stamped kill"
    );
}

#[cfg(unix)]
#[test]
fn sigkill_spares_game_then_stamped_kill_removes_its_tree() {
    parent_killed_game_spared_then_stamped_kill_removes_its_tree();
}

/// The Windows arm of the above and the proof of flagged assumption A5: `TerminateProcess` on the
/// stand-in parent closes its handles and the Game Job (no kill-on-close) keeps the game and its
/// grandchild running. A5 as first stated (that the Job can then be reopened by name) failed on
/// windows-latest: the name goes with the last handle. `kill_game_tree` therefore falls back to
/// the stamped leader's parent-linked descendants, and this arm proves that both end.
#[cfg(windows)]
#[test]
fn terminate_parent_spares_game_then_stamped_kill_removes_its_tree() {
    parent_killed_game_spared_then_stamped_kill_removes_its_tree();
}

/// The kill is stamp-checked (prohibition 5 at the mechanism): a stamp that is not the leader's
/// start stamp, the shape of a recycled pid, answers `NotOurs` and signals nothing. `wrong` maps the
/// real stamp to the one passed: a newer one (`+ 1`) and an older one (a recycled pid's predecessor).
fn wrong_stamp_kill_signals_nothing(wrong: impl Fn(u64) -> u64) {
    let home = FakeHome::new("gamelib-proc-orphans");
    let paths = Paths::new(&home);
    let stamp_path = paths.game_stamp.to_string_lossy().into_owned();
    let mut run = Run::start_with(&home, &paths, &["--game-stamp", &stamp_path]);
    let games = run.pids("games");
    let _strays = Strays(games.clone());
    let (pid, stamp) = read_game_stamp(&paths);

    run.kill_parent();
    run.wait_for_parent_exit();
    let outcome = kill_game_tree(pid, wrong(stamp), Duration::from_millis(1500));
    assert_eq!(outcome, KillOutcome::NotOurs);
    // Alive is not enough (a stopped process is "alive"): the game must still be writing too.
    let before = file_len(&paths.game_log);
    wait_until("the game to keep writing after the refused kill", || {
        file_len(&paths.game_log) > before
    });
    for g in &games {
        assert!(
            is_alive(*g),
            "game process {g} must survive a wrong-stamp kill"
        );
    }
}

#[cfg(unix)]
#[test]
fn stamped_kill_with_a_wrong_stamp_signals_nothing() {
    wrong_stamp_kill_signals_nothing(|stamp| stamp + 1);
}

#[cfg(unix)]
#[test]
fn stamped_kill_with_an_older_stamp_signals_nothing() {
    wrong_stamp_kill_signals_nothing(|stamp| stamp.saturating_sub(1_000_000));
}

#[cfg(windows)]
#[test]
fn windows_stamped_kill_with_a_wrong_stamp_signals_nothing() {
    wrong_stamp_kill_signals_nothing(|stamp| stamp + 1);
}

#[cfg(windows)]
#[test]
fn windows_stamped_kill_with_an_older_stamp_signals_nothing() {
    wrong_stamp_kill_signals_nothing(|stamp| stamp.saturating_sub(1_000_000));
}

/// A tracked game whose stand-in parent is still alive, so the parent's `GameHandle` keeps the named
/// Game Job openable. The fields are held for the test's lifetime (the run keeps the parent alive,
/// `strays` kills what is left).
#[cfg(windows)]
struct LiveJobGame {
    _run: Run,
    games: Vec<u32>,
    _strays: Strays,
    _bystander_child: Child,
    bystander: u32,
    pid: u32,
    stamp: u64,
}

#[cfg(windows)]
fn live_job_game(home: &FakeHome, paths: &Paths) -> LiveJobGame {
    let stamp_path = paths.game_stamp.to_string_lossy().into_owned();
    let run = Run::start_with(home, paths, &["--game-stamp", &stamp_path]);
    let games = run.pids("games");
    let mut strays = Strays(games.clone());
    let (bystander_child, bystander) = spawn_bystander(home, &mut strays);
    let (pid, stamp) = read_game_stamp(paths);
    assert_eq!(games.len(), 2, "the game and its game-child");
    assert!(
        gamelib_proc::job::GameJob::open(pid, stamp).is_some(),
        "the parent holds the Game Job, so its name opens (non-vacuity)"
    );
    LiveJobGame {
        _run: run,
        games,
        _strays: strays,
        _bystander_child: bystander_child,
        bystander,
        pid,
        stamp,
    }
}

/// The Job arm with a live name, never run on CI before: the parent is alive, `GameJob::open`
/// finds the Job, `TerminateJobObject` ends the game and its grandchild, and the held leader reads
/// as exited, so `Killed` is answered without the walk. A bystander survives.
#[cfg(windows)]
#[test]
fn windows_stamped_kill_over_a_live_game_job_removes_its_tree() {
    let home = FakeHome::new("gamelib-proc-orphans");
    let paths = Paths::new(&home);
    let live = live_job_game(&home, &paths);
    let (games, bystander, pid, stamp) = (&live.games, live.bystander, live.pid, live.stamp);
    let outcome = kill_game_tree(pid, stamp, Duration::from_millis(1500));
    assert_eq!(outcome, KillOutcome::Killed);
    wait_until("the game and its grandchild to die", || {
        games.iter().all(|g| !is_alive(*g))
    });
    assert!(is_alive(bystander), "the bystander must survive");
}

/// WR-04: the Job is opened with query rights only, so its terminate fails. The kill must not
/// answer `Killed` while the game runs: it falls back to the stamped walk, which ends the game and
/// its grandchild. Red before the fix by construction (the terminate result was dropped).
#[cfg(windows)]
#[test]
fn windows_a_game_job_that_cannot_terminate_falls_back_to_the_walk() {
    let home = FakeHome::new("gamelib-proc-orphans");
    let paths = Paths::new(&home);
    let live = live_job_game(&home, &paths);
    let (games, bystander, pid, stamp) = (&live.games, live.bystander, live.pid, live.stamp);
    let outcome = gamelib_proc::kill_tree::harness_kill_game_tree_query_only_job(
        pid,
        stamp,
        Duration::from_millis(1500),
    );
    assert_eq!(outcome, KillOutcome::Killed);
    wait_until("the game and its grandchild to die", || {
        games.iter().all(|g| !is_alive(*g))
    });
    assert!(is_alive(bystander), "the bystander must survive");
}

/// WR-04, the realistic hole: once the parent is gone the Game Job's name is free, and any process
/// in the session can create a Job under it. An empty squatter terminates "successfully" and holds
/// no active processes, so the old kill answered `Killed` while the game ran. Now the held leader
/// is not signalled, so the kill walks the descendants instead.
#[cfg(windows)]
#[test]
fn windows_a_squatted_game_job_name_falls_back_to_the_walk() {
    use std::os::windows::io::{FromRawHandle, OwnedHandle};
    use windows_sys::Win32::System::JobObjects::CreateJobObjectW;

    let home = FakeHome::new("gamelib-proc-orphans");
    let paths = Paths::new(&home);
    let stamp_path = paths.game_stamp.to_string_lossy().into_owned();
    let mut run = Run::start_with(&home, &paths, &["--game-stamp", &stamp_path]);
    let games = run.pids("games");
    let mut strays = Strays(games.clone());
    let (_bystander_child, bystander) = spawn_bystander(&home, &mut strays);
    let (pid, stamp) = read_game_stamp(&paths);

    run.kill_parent();
    run.wait_for_parent_exit();
    // The same name format as `job.rs`'s private `game_job_name`.
    let name: Vec<u16> = format!("Local\\GameLib-Game-{pid}-{stamp}")
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    // SAFETY: null attributes are allowed and `name` is NUL-terminated UTF-16 that outlives the call.
    let raw = unsafe { CreateJobObjectW(std::ptr::null(), name.as_ptr()) };
    assert!(!raw.is_null(), "create the squatting Job");
    // SAFETY: `raw` is a valid, uniquely-owned handle, held until the end of the test.
    let _squat = unsafe { OwnedHandle::from_raw_handle(raw as _) };
    assert!(
        gamelib_proc::job::GameJob::open(pid, stamp).is_some(),
        "the squatting Job is the one the kill will open (non-vacuity)"
    );

    let outcome = kill_game_tree(pid, stamp, Duration::from_millis(1500));
    assert_eq!(outcome, KillOutcome::Killed);
    wait_until("the game and its grandchild to die", || {
        games.iter().all(|g| !is_alive(*g))
    });
    assert!(is_alive(bystander), "the bystander must survive");
}

/// The own-handle path: the test spawns a `game-tree` game through `spawn_game_tracked`, whose
/// leader exits at once and leaves one grandchild. `wait_leader_exit` must leave the leader an
/// unreaped zombie (so its pid and pgid cannot be recycled), and `kill_tree` must still reach the
/// grandchild through the surviving group. That the leader was never reaped is proved by `reap`
/// succeeding at the end (a reaped child is ECHILD). This is the flagged assumption about
/// `waitid(WNOWAIT)` on this OS.
#[cfg(unix)]
#[test]
fn own_handle_kill_reaches_a_grandchild_after_the_leader_exits() {
    use gamelib_proc::probe::group_alive;
    #[cfg(target_os = "linux")]
    use gamelib_proc::probe::start_time;
    use gamelib_proc::spawn_game_tracked;

    let home = FakeHome::new("gamelib-proc-orphans");
    let paths = Paths::new(&home);
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_gamelib-proc-standin"));
    cmd.arg("game-tree")
        .arg("--game-pids")
        .arg(&paths.game_pids);
    home.apply(&mut cmd);
    let mut game = spawn_game_tracked(cmd, None).expect("spawn game-tree");
    let pid = game.pid;
    let mut grandchild = None;
    wait_until("the game to record its child", || {
        grandchild = std::fs::read_to_string(&paths.game_pids)
            .ok()
            .and_then(|t| t.trim().parse::<u32>().ok());
        grandchild.is_some()
    });
    let grandchild = grandchild.expect("the grandchild's pid");
    // Not the leader: it is reaped by `reap` below, after which its pid may belong to anyone.
    let _strays = Strays(vec![grandchild]);
    assert!(
        is_alive(grandchild),
        "grandchild alive before the leader exits"
    );

    game.wait_leader_exit()
        .expect("wait for the leader without reaping it");
    // Measured platform fact, not a requirement of the handle (which owns the unreaped leader and
    // needs no stamp): Linux still reads a zombie's start stamp from /proc, macOS `proc_pidinfo`
    // cannot read a zombie at all. The stamp may also be `None` for a game that had already
    // exited when it was read.
    #[cfg(target_os = "linux")]
    if let Some(stamp) = game.stamp {
        assert_eq!(
            start_time(pid),
            Some(stamp),
            "the unreaped leader still reads its stamp"
        );
    }
    assert!(
        !is_alive(pid),
        "the leader has exited (a zombie is not alive)"
    );
    assert!(game.group_alive(), "the grandchild keeps the group alive");
    assert!(group_alive(pid));
    assert!(
        is_alive(grandchild),
        "grandchild alive after the leader exited"
    );

    let outcome = game.kill_tree(Duration::from_millis(1500));
    assert_eq!(outcome, KillOutcome::Killed);
    wait_until("the grandchild to die", || !is_alive(grandchild));
    assert!(!game.group_alive(), "the group is empty after the kill");
    game.reap()
        .expect("reap the leader once its group is empty");
}

/// One helper's tree ended by pid (`ChildSet::terminate_one`): the tree helper and its grandchild go;
/// the two idle helpers and the game are untouched (T-88.2-04). A graceful quit afterwards still
/// drains the rest.
fn terminate_one_ends_a_helper_and_its_grandchild_only() {
    let home = FakeHome::new("gamelib-proc-orphans");
    let paths = Paths::new(&home);
    let mut run = Run::start_with(&home, &paths, &["--terminate-one"]);
    let _strays = Strays(run.pids("games"));
    let helpers = run.pids("helpers");
    let grandchildren = run.pids("grandchildren");
    assert_eq!(helpers.len(), 3, "two idle helpers and the tree helper");
    assert_eq!(grandchildren.len(), 1, "the tree helper's grandchild");
    let (idle_1, idle_2, tree) = (helpers[0], helpers[1], helpers[2]);
    for p in helpers
        .iter()
        .chain(&grandchildren)
        .chain(&run.pids("games"))
    {
        assert!(is_alive(*p), "pid {p} alive before the kill");
    }

    run.send("kill-one");
    run.expect_line("done");
    wait_until("the tree helper and its grandchild to die", || {
        !is_alive(tree) && !is_alive(grandchildren[0])
    });
    for p in [idle_1, idle_2].iter().chain(&run.pids("games")) {
        assert!(is_alive(*p), "pid {p} must survive a single-helper kill");
    }

    run.quit();
    run.wait_for_parent_exit();
    wait_until("the remaining helpers to die", || {
        !is_alive(idle_1) && !is_alive(idle_2)
    });
    assert_helpers_die_and_game_survives(&run, &paths);
}

#[cfg(unix)]
#[test]
fn terminate_one_kills_a_helper_and_its_grandchild() {
    terminate_one_ends_a_helper_and_its_grandchild_only();
}

/// Windows: the helper's own kill-on-close Job is terminated, so the helper and its grandchild go.
#[cfg(windows)]
#[test]
fn windows_terminate_one_kills_a_helper_and_its_grandchild() {
    terminate_one_ends_a_helper_and_its_grandchild_only();
}

/// A tracked game the stand-in spawned, for the adopted-game arms: the run (its parent still alive
/// until a test kills it), the leader's recorded `<pid> <stamp>`, the member (the game's child) and
/// an unrelated bystander the kills must never touch. `_strays` kills what a failing test leaves.
struct AdoptedGame {
    run: Run,
    paths: Paths,
    _home: FakeHome,
    _strays: Strays,
    _bystander_child: Child,
    pid: u32,
    stamp: u64,
    member: u32,
    bystander: u32,
}

/// Starts the stand-in with `--game-stamp` and, for `leader_exit_ms`, a game leader that exits that
/// long after it has recorded its child (the Wine loader shape, Pitfall 10).
fn adopted_game(leader_exit_ms: Option<&str>) -> AdoptedGame {
    let home = FakeHome::new("gamelib-proc-orphans");
    let paths = Paths::new(&home);
    let stamp_path = paths.game_stamp.to_string_lossy().into_owned();
    let mut extra = vec!["--game-stamp", stamp_path.as_str()];
    if let Some(ms) = leader_exit_ms {
        extra.extend(["--game-leader-exit-ms", ms]);
    }
    let run = Run::start_with(&home, &paths, &extra);
    let games = run.pids("games");
    assert_eq!(games.len(), 2, "the game leader and its child");
    let mut strays = Strays(games.clone());
    let (bystander_child, bystander) = spawn_bystander(&home, &mut strays);
    let (pid, stamp) = read_game_stamp(&paths);
    assert_eq!(games[0], pid, "the stamp record names the game leader");
    AdoptedGame {
        run,
        paths,
        _home: home,
        _strays: strays,
        _bystander_child: bystander_child,
        pid,
        stamp,
        member: games[1],
        bystander,
    }
}

impl AdoptedGame {
    /// The leader's proof: the recorded leader plus the members GameLib would have seen.
    fn proof(&self, members: Vec<Member>) -> AdoptProof {
        AdoptProof {
            leader_pid: self.pid,
            leader_stamp: self.stamp,
            members,
        }
    }

    /// Waits for the game leader to exit on its own (its child keeps running).
    fn wait_for_leader_exit(&self) {
        wait_until("the game leader to exit", || !is_alive(self.pid));
        assert!(
            is_alive(self.member),
            "the game's child outlives its leader"
        );
    }

    fn assert_nothing_else_died(&self) {
        assert!(
            is_alive(self.bystander),
            "an unrelated process must survive"
        );
    }
}

/// D-31 at the mechanism, leader half: the parent is hard-killed, the leader still runs, the proof
/// answers `Leader`, and `kill_adopted_tree` ends the leader and its child. Shared by both OSes.
fn adopted_leader_matches_after_parent_kill() {
    let mut game = adopted_game(None);
    // Taken while GameLib runs, as the shell will: the proof a later launch keeps.
    let members = snapshot_members(game.pid, game.pid);
    #[cfg(unix)]
    assert_eq!(
        members,
        vec![Member {
            pid: game.member,
            stamp: gamelib_proc::probe::start_time(game.member).expect("member stamp"),
        }],
        "the snapshot lists the game's child and not its leader"
    );
    game.run.kill_parent();
    game.run.wait_for_parent_exit();
    assert!(is_alive(game.pid) && is_alive(game.member));

    let proof = game.proof(members);
    assert_eq!(identify(&proof), Identity::Leader);
    assert_eq!(
        kill_adopted_tree(&proof, Duration::from_millis(1500)),
        KillOutcome::Killed
    );
    wait_until("the game and its child to die", || {
        !is_alive(game.pid) && !is_alive(game.member)
    });
    game.assert_nothing_else_died();
}

#[cfg(unix)]
#[test]
fn adopted_leader_matches_after_parent_sigkill() {
    adopted_leader_matches_after_parent_kill();
}

#[cfg(windows)]
#[test]
fn windows_adopted_leader_matches_after_parent_terminate() {
    adopted_leader_matches_after_parent_kill();
}

/// Pitfall 10: the leader has exited and the parent is gone, so a bare pid-and-stamp kill answers
/// `Gone` while the game runs. The member proof still matches and ends the group.
#[cfg(unix)]
#[test]
fn adopted_member_matches_after_the_leader_exits_and_the_parent_is_sigkilled() {
    use gamelib_proc::probe::{group_alive, start_time};
    let mut game = adopted_game(Some("300"));
    game.wait_for_leader_exit();
    let members = snapshot_members(game.pid, game.pid);
    assert_eq!(
        members,
        vec![Member {
            pid: game.member,
            stamp: start_time(game.member).expect("member stamp"),
        }],
        "the snapshot lists the surviving member"
    );
    game.run.kill_parent();
    game.run.wait_for_parent_exit();

    let proof = game.proof(members);
    // Non-vacuity: the leader-only kill cannot find this game, and the group is still alive.
    assert_eq!(
        kill_game_tree(game.pid, game.stamp, Duration::from_millis(100)),
        KillOutcome::Gone,
        "the leader is gone, so a pid-and-stamp kill sees nothing"
    );
    assert!(group_alive(game.pid), "the member keeps the group alive");
    assert!(is_alive(game.member));

    assert_eq!(identify(&proof), Identity::Member(game.member));
    assert_eq!(
        kill_adopted_tree(&proof, Duration::from_millis(1500)),
        KillOutcome::Killed
    );
    wait_until("the member to die and the group to empty", || {
        !is_alive(game.member) && !group_alive(game.pid)
    });
    game.assert_nothing_else_died();
}

/// Windows has no groups; a tree is the Game Job, and its name opens only while a handle to it is
/// held (88.2-25), so the parent stays alive here: the leader exits, the Job still holds the
/// child, and `kill_adopted_tree` ends it. A crashed parent drops the name, which is the
/// leader-alive arm above.
#[cfg(windows)]
#[test]
fn windows_adopted_job_matches_after_the_leader_exits_while_the_parent_holds_it() {
    let game = adopted_game(Some("300"));
    game.wait_for_leader_exit();
    let proof = game.proof(Vec::new());
    assert_eq!(identify(&proof), Identity::Job);
    assert_eq!(
        kill_adopted_tree(&proof, Duration::from_millis(1500)),
        KillOutcome::Killed
    );
    wait_until("the game's child to die", || !is_alive(game.member));
    game.assert_nothing_else_died();
}

/// Prohibition 5, leader half: a recorded stamp that is not the live leader's (a recycled pid)
/// answers `NotOurs` before any member is consulted, signals nothing, and the leader keeps running.
/// The proof carries a member that would match on its own.
fn adopted_proof_with_a_wrong_stamp_is_not_ours_body(wrong: impl Fn(u64) -> u64) {
    let mut game = adopted_game(None);
    let members = vec![Member {
        pid: game.member,
        stamp: gamelib_proc::probe::start_time(game.member).expect("member stamp"),
    }];
    game.run.kill_parent();
    game.run.wait_for_parent_exit();
    let proof = AdoptProof {
        leader_pid: game.pid,
        leader_stamp: wrong(game.stamp),
        members,
    };
    assert_eq!(identify(&proof), Identity::NotOurs);
    assert_eq!(
        kill_adopted_tree(&proof, Duration::from_millis(1500)),
        KillOutcome::NotOurs
    );
    // Alive is not enough (a stopped process is "alive"): the game must still be writing too.
    let before = file_len(&game.paths.game_log);
    wait_until("the game to keep writing after the refused kill", || {
        file_len(&game.paths.game_log) > before
    });
    assert!(is_alive(game.pid), "the leader must survive");
    assert!(is_alive(game.member), "the member must survive");
    game.assert_nothing_else_died();
}

#[cfg(unix)]
#[test]
fn adopted_proof_with_a_wrong_stamp_is_not_ours() {
    adopted_proof_with_a_wrong_stamp_is_not_ours_body(|stamp| stamp + 1);
}

#[cfg(unix)]
#[test]
fn adopted_proof_with_an_older_stamp_is_not_ours() {
    adopted_proof_with_a_wrong_stamp_is_not_ours_body(|stamp| stamp.saturating_sub(1_000_000));
}

#[cfg(windows)]
#[test]
fn windows_adopted_proof_with_a_wrong_stamp_is_not_ours() {
    adopted_proof_with_a_wrong_stamp_is_not_ours_body(|stamp| stamp + 1);
}

/// Prohibition 5, member half: the leader has exited and the proof's stamps are off by one. Unix: the
/// member's recorded stamp differs, so it proves nothing. Windows: the Game Job is named for the
/// leader's stamp, so no Job of that name opens. Either way `Gone`, nothing is signalled and the
/// game's child keeps running.
fn adopted_proof_with_wrong_stamps_after_the_leader_exits_is_gone() {
    let mut game = adopted_game(Some("300"));
    game.wait_for_leader_exit();
    let member_stamp = gamelib_proc::probe::start_time(game.member).expect("member stamp");
    if cfg!(unix) {
        game.run.kill_parent();
        game.run.wait_for_parent_exit();
    }
    let proof = AdoptProof {
        leader_pid: game.pid,
        leader_stamp: game.stamp + 1,
        members: vec![Member {
            pid: game.member,
            stamp: member_stamp + 1,
        }],
    };
    assert_eq!(identify(&proof), Identity::Gone);
    assert_eq!(
        kill_adopted_tree(&proof, Duration::from_millis(1500)),
        KillOutcome::Gone
    );
    // Hold the check open a little: a kill that signalled late would still be caught.
    let until = Instant::now() + Duration::from_millis(1000);
    while Instant::now() < until {
        assert!(
            is_alive(game.member),
            "the member must survive a refused kill"
        );
        std::thread::sleep(POLL);
    }
    game.assert_nothing_else_died();
}

#[cfg(unix)]
#[test]
fn adopted_member_with_a_wrong_stamp_is_gone() {
    adopted_proof_with_wrong_stamps_after_the_leader_exits_is_gone();
}

#[cfg(windows)]
#[test]
fn windows_adopted_job_with_a_wrong_stamp_is_gone() {
    adopted_proof_with_wrong_stamps_after_the_leader_exits_is_gone();
}

/// A reaped pid with no recorded member alive: nothing to prove, nothing signalled.
fn kill_adopted_tree_on_an_empty_group_is_gone_body() {
    #[cfg(unix)]
    let mut cmd = Command::new("/bin/sh");
    #[cfg(unix)]
    cmd.args(["-c", "exit 0"]);
    #[cfg(windows)]
    let mut cmd = Command::new("cmd");
    #[cfg(windows)]
    cmd.args(["/C", "exit 0"]);
    let mut child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn a process that exits at once");
    let pid = child.id();
    child.wait().expect("reap it");
    let proof = AdoptProof {
        leader_pid: pid,
        leader_stamp: 1,
        members: Vec::new(),
    };
    assert_eq!(identify(&proof), Identity::Gone);
    assert_eq!(
        kill_adopted_tree(&proof, Duration::from_millis(200)),
        KillOutcome::Gone
    );
}

#[cfg(unix)]
#[test]
fn kill_adopted_tree_on_an_empty_group_is_gone() {
    kill_adopted_tree_on_an_empty_group_is_gone_body();
}

#[cfg(windows)]
#[test]
fn windows_kill_adopted_tree_on_an_empty_job_is_gone() {
    kill_adopted_tree_on_an_empty_group_is_gone_body();
}

/// The member check includes the group: a live process with its recorded stamp that is NOT in group
/// `leader_pid` proves nothing (a recycled leader pid with the member since moved, or a forged
/// proof naming a bystander), so it is `Gone` and the bystander is not signalled.
#[cfg(unix)]
#[test]
fn adopted_member_outside_the_recorded_group_is_gone() {
    let home = FakeHome::new("gamelib-proc-orphans");
    let mut strays = Strays(Vec::new());
    let (_bystander_child, bystander) = spawn_bystander(&home, &mut strays);
    let stamp = gamelib_proc::probe::start_time(bystander).expect("bystander stamp");
    // A reaped pid as the leader: not alive, so only the member is consulted.
    let mut gone = Command::new("/bin/sh")
        .args(["-c", "exit 0"])
        .spawn()
        .expect("spawn");
    let leader_pid = gone.id();
    gone.wait().expect("reap");
    let proof = AdoptProof {
        leader_pid,
        leader_stamp: 1,
        members: vec![Member {
            pid: bystander,
            stamp,
        }],
    };
    assert_eq!(identify(&proof), Identity::Gone);
    assert_eq!(
        kill_adopted_tree(&proof, Duration::from_millis(500)),
        KillOutcome::Gone
    );
    assert!(
        is_alive(bystander),
        "a process outside the group is never signalled"
    );
}
