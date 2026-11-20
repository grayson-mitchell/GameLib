//! Process-lifetime harness (Phase 83 D-13): a stand-in for the shell spawns a process tree through
//! gamelib-proc; the test drives it and probes liveness from the outside, independently of the
//! code under test.
//!
//! Liveness is "exists and is not a zombie" (`probe::is_alive`). Every wait polls every 100 ms up
//! to 15 s; nothing sleeps a fixed time.

use gamelib_proc::probe::is_alive;
use gamelib_testutil::FakeHome;
use std::io::{BufRead, BufReader, Write};
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

/// The stand-in parent with the fake profile applied (Convention 2: never a hand-rolled env
/// literal) and stdin/stdout piped for the driver.
fn standin(home: &FakeHome) -> Command {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_gamelib-proc-standin"));
    cmd.arg("parent")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());
    home.apply(&mut cmd);
    cmd
}

struct Run {
    child: Child,
    stdin: Option<ChildStdin>,
    manifest: serde_json::Value,
}

impl Run {
    fn start(home: &FakeHome) -> Run {
        let mut child = standin(home).spawn().expect("spawn stand-in");
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

#[test]
fn graceful_quit_terminates_the_helper() {
    let home = FakeHome::new("gamelib-proc-orphans");
    let mut run = Run::start(&home);
    let helpers = run.pids("helpers");
    assert_eq!(helpers.len(), 1);
    assert!(is_alive(helpers[0]), "helper alive before quit");

    run.quit();
    run.wait_for_parent_exit();
    wait_until("the helper to die", || !is_alive(helpers[0]));
}
