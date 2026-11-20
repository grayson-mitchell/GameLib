//! Process-lifetime harness (Phase 83 D-13): a stand-in for the shell spawns a process tree through
//! gamelib-proc; the test drives it and probes liveness from the outside, independently of the
//! code under test.
//!
//! Liveness is "exists and is not a zombie" (`probe::is_alive`). Every wait polls every 100 ms up
//! to 15 s; nothing sleeps a fixed time. A drop guard kills the surviving game pids so CI never
//! accumulates strays.

use gamelib_proc::probe::is_alive;
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
}

impl Paths {
    fn new(home: &FakeHome) -> Paths {
        Paths {
            game_log: home.root().join("game.log"),
            game_pids: home.root().join("game-pids.txt"),
        }
    }
}

/// The stand-in parent with the fake profile applied (Convention 2: never a hand-rolled env
/// literal) and stdin/stdout piped for the driver.
fn standin(home: &FakeHome, paths: &Paths) -> Command {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_gamelib-proc-standin"));
    cmd.arg("parent")
        .arg("--game-log")
        .arg(&paths.game_log)
        .arg("--game-pids")
        .arg(&paths.game_pids)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        // Not inherited: if a bug leaves an orphan behind, it must not hold the test runner's
        // stderr pipe open and turn a red run into a hung one.
        .stderr(Stdio::null());
    home.apply(&mut cmd);
    cmd
}

struct Run {
    child: Child,
    stdin: Option<ChildStdin>,
    manifest: serde_json::Value,
}

impl Run {
    fn start(home: &FakeHome, paths: &Paths) -> Run {
        let mut child = standin(home, paths).spawn().expect("spawn stand-in");
        let stdout = child.stdout.take().expect("piped stdout");
        let stdin = child.stdin.take();
        // Read the manifest line on a thread so a hung stand-in fails the test, not hangs it.
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let mut line = String::new();
            let _ = BufReader::new(stdout).read_line(&mut line);
            let _ = tx.send(line);
        });
        let line = rx.recv_timeout(LIMIT).expect("manifest line within 15 s");
        let manifest: serde_json::Value = serde_json::from_str(line.trim()).expect("manifest JSON");
        Run {
            child,
            stdin,
            manifest,
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

    /// Hard-kills the stand-in parent: SIGKILL on unix, TerminateProcess on Windows.
    #[cfg(windows)]
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
