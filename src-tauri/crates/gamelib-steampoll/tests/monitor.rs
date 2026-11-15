//! Monitor cases from steamDownloadMonitor.test.ts, plus the watchdog-literal equality check and
//! one real-process stop() test (macOS).

use gamelib_steampoll::acf_state::PollRoots;
use gamelib_steampoll::host::{
    BoxFuture, Clock, PollHost, ProcessRunner, RunOutput, StreamingChild,
};
use gamelib_steampoll::monitor::*;
use gamelib_steampoll::testing::{FakeClock, RecordingHost, ScriptedRunner};
use std::io::Write;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

const STARTED: &str = "[x] AppID 43160 update started : download 0/8736151712, store 0/0 \r\n";
const STARTED_OTHER: &str =
    "[x] AppID 238320 update started : download 0/2813215248, store 0/0 \r\n";
const PGREP: &str = "/usr/bin/pgrep -x steam_osx";

type Spawn = (String, Vec<String>, mpsc::Sender<String>, CancellationToken);

/// Runner that records spawns and lets the test feed stdout, end a child, and see its kill token.
#[derive(Default)]
struct FeedRunner {
    inner: ScriptedRunner,
    spawns: Mutex<Vec<Spawn>>,
}

impl ProcessRunner for FeedRunner {
    fn run(&self, program: &str, argv: Vec<String>, t: Duration) -> BoxFuture<RunOutput> {
        self.inner.run(program, argv, t)
    }
    fn spawn_streaming(&self, program: &str, argv: Vec<String>) -> std::io::Result<StreamingChild> {
        let (tx, rx) = mpsc::channel(64);
        let kill = CancellationToken::new();
        self.spawns
            .lock()
            .unwrap()
            .push((program.into(), argv, tx, kill.clone()));
        Ok(StreamingChild { lines: rx, kill })
    }
}

impl FeedRunner {
    fn count(&self) -> usize {
        self.spawns.lock().unwrap().len()
    }
    fn tx(&self, n: usize) -> mpsc::Sender<String> {
        self.spawns.lock().unwrap()[n].2.clone()
    }
    fn token(&self, n: usize) -> CancellationToken {
        self.spawns.lock().unwrap()[n].3.clone()
    }
    async fn feed(&self, n: usize, chunk: &str) {
        let tx = self.tx(n);
        for l in chunk.split('\n').filter(|l| !l.is_empty()) {
            tx.send(format!("{l}\n")).await.unwrap();
        }
        settle().await;
    }
}

async fn settle() {
    for _ in 0..20 {
        tokio::task::yield_now().await;
    }
    tokio::time::sleep(Duration::from_millis(10)).await;
}

struct Fx {
    mon: DownloadMonitor,
    runner: Arc<FeedRunner>,
    clock: Arc<FakeClock>,
    _dir: tempfile::TempDir,
    roots: PollRoots,
}

fn fx(tail: &str, pgrep: Option<RunOutput>, darwin: bool) -> Fx {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("logs")).unwrap();
    std::fs::write(dir.path().join("logs/content_log.txt"), tail).unwrap();
    let runner = Arc::new(FeedRunner::default());
    runner.inner.on(
        PGREP,
        vec![pgrep.unwrap_or(RunOutput {
            code: Some(0),
            stdout: "900\n500\n".into(),
            stderr: String::new(),
        })],
    );
    let clock = Arc::new(FakeClock::new(0));
    let host: Arc<dyn PollHost> = Arc::new(RecordingHost::default());
    let mon = DownloadMonitor::with_platform(
        host,
        runner.clone(),
        clock.clone() as Arc<dyn Clock>,
        darwin,
    );
    let roots = PollRoots {
        steam_root: dir.path().to_string_lossy().into_owned(),
        bottle_steamapps_root: None,
        bridge_steamapps_root: None,
    };
    Fx {
        mon,
        runner,
        clock,
        _dir: dir,
        roots,
    }
}

fn block(rows: &[(&str, u64)]) -> String {
    let mut s = ",bytes_in,\r\n".to_string();
    for (f, v) in rows {
        s += &format!("tcp4 {f},{v},\r\n");
    }
    s
}

#[test]
fn watchdog_literal_matches_childwatchdog_ts() {
    let ts = std::fs::read_to_string(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../src/backend/storeManagers/steam/childWatchdog.ts"),
    )
    .unwrap();
    let start = ts.find("WATCHDOG_SH = `").unwrap() + "WATCHDOG_SH = `".len();
    let end = start + ts[start..].find("`\n").unwrap();
    assert_eq!(&ts[start..end], WATCHDOG_SH);
}

#[tokio::test]
async fn spawns_the_watchdog_around_script_nettop_for_the_lowest_pid_with_shell_pid_anchor() {
    let f = fx(STARTED, None, true);
    f.mon.start("43160", &f.roots).await;
    assert_eq!(f.runner.count(), 1);
    let inner: Vec<String> = [
        "/usr/bin/script",
        "-q",
        "/dev/null",
        "/usr/bin/nettop",
        "-x",
        "-n",
        "-L",
        "0",
        "-s",
        "1",
        "-J",
        "bytes_in",
        "-p",
        "500",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    // RecordingHost::shell_pid() is 1.
    let (file, args) = build_watchdog_spawn(1, 500, &inner);
    let spawns = f.runner.spawns.lock().unwrap();
    assert_eq!(spawns[0].0, "/bin/sh");
    assert_eq!(spawns[0].0, file);
    assert_eq!(spawns[0].1, args);
    assert_eq!(&spawns[0].1[..3], ["-c", WATCHDOG_SH, "gamelib-watchdog"]);
    assert_eq!(&spawns[0].1[3..5], ["1", "500"]);
}

#[tokio::test]
async fn start_is_idempotent_per_app_id() {
    let f = fx(STARTED, None, true);
    tokio::join!(
        f.mon.start("43160", &f.roots),
        f.mon.start("43160", &f.roots)
    );
    assert_eq!(f.runner.count(), 1);
}

#[tokio::test]
async fn does_not_spawn_non_darwin_no_pids_unknown_pids() {
    let f = fx(STARTED, None, false);
    f.mon.start("43160", &f.roots).await;
    assert_eq!(f.runner.count(), 0);
    assert_eq!(f.mon.read("43160"), None);

    let none = fx(
        STARTED,
        Some(RunOutput {
            code: Some(1),
            ..RunOutput::default()
        }),
        true,
    );
    none.mon.start("43160", &none.roots).await;
    assert_eq!(none.runner.count(), 0);
    assert_eq!(none.mon.read("43160"), None);

    let unknown = fx(
        STARTED,
        Some(RunOutput {
            code: None,
            ..RunOutput::default()
        }),
        true,
    );
    unknown.mon.start("43160", &unknown.roots).await;
    assert_eq!(unknown.runner.count(), 0);
    assert_eq!(unknown.mon.read("43160"), None);
}

#[tokio::test]
async fn reads_bytes_and_speed_from_two_blocks_plus_the_log_anchor() {
    let f = fx(STARTED, None, true);
    f.mon.start("43160", &f.roots).await;
    f.clock.set(1000);
    f.runner.feed(0, &block(&[("a<->b", 1000)])).await;
    assert_eq!(f.mon.read("43160"), None); // one block
    f.clock.set(2000);
    f.runner
        .feed(0, &block(&[("a<->b", 3000), ("c<->d", 500)]))
        .await;
    f.clock.set(3000);
    f.runner
        .feed(0, &block(&[("a<->b", 4000), ("c<->d", 500)]))
        .await;
    f.clock.set(4000);
    f.runner.feed(0, ",bytes_in,\r\n").await; // closes the third block (sample)
    let r = f.mon.read("43160").unwrap();
    assert_eq!(r.bytes_total, 8736151712.0);
    assert_eq!(r.bytes_done, 2000.0 + 500.0 + 1000.0);
    assert!(r.speed_bytes_per_sec.unwrap() > 0.0);
}

#[tokio::test]
async fn none_with_no_active_update_or_two_active_updates() {
    let none = fx("", None, true);
    none.mon.start("43160", &none.roots).await;
    none.runner
        .feed(0, &(block(&[("x", 1)]) + &block(&[("x", 2)])))
        .await;
    assert_eq!(none.mon.read("43160"), None);

    let two = fx(&format!("{STARTED}{STARTED_OTHER}"), None, true);
    two.mon.start("43160", &two.roots).await;
    two.runner
        .feed(0, &(block(&[("x", 1)]) + &block(&[("x", 2)])))
        .await;
    assert_eq!(two.mon.read("43160"), None);
}

#[tokio::test]
async fn ignores_a_ghost_update_from_before_the_last_client_start() {
    let ghost =
        "[2026-10-25 21:38:12] AppID 284100 update started : download 0/223021728, store 0/0 \r\n";
    let boot = "[2026-11-03 19:49:43] Client version: 1792618285\r\n";
    let live =
        "[2026-11-05 17:29:38] AppID 333300 update started : download 0/5000, store 0/0 \r\n";
    let f = fx(&format!("{ghost}{boot}{live}"), None, true);
    f.mon.start("333300", &f.roots).await;
    f.runner
        .feed(0, &(block(&[("x", 1)]) + &block(&[("x", 2)])))
        .await;
    f.runner.feed(0, &block(&[("x", 502)])).await;
    let r = f.mon.read("333300").unwrap();
    assert_eq!(r.bytes_total, 5000.0);
    assert_eq!(r.bytes_done, 501.0);
}

#[tokio::test]
async fn keeps_this_app_anchor_that_predates_the_monitor() {
    let f = fx(&format!("[x] Client version: 1\r\n{STARTED}"), None, true);
    f.mon.start("43160", &f.roots).await;
    f.runner
        .feed(0, &(block(&[("x", 1)]) + &block(&[("x", 2)])))
        .await;
    assert_eq!(f.mon.read("43160").unwrap().bytes_total, 8736151712.0);
}

#[tokio::test]
async fn falls_back_for_a_genuine_concurrent_pair_in_the_same_session() {
    let f = fx(
        &format!("[x] Client version: 1\r\n{STARTED_OTHER}{STARTED}"),
        None,
        true,
    );
    f.mon.start("43160", &f.roots).await;
    f.runner
        .feed(0, &(block(&[("x", 1)]) + &block(&[("x", 2)])))
        .await;
    assert_eq!(f.mon.read("43160"), None);
}

#[tokio::test]
async fn falls_back_after_the_child_exits() {
    let f = fx(STARTED, None, true);
    f.mon.start("43160", &f.roots).await;
    f.runner
        .feed(0, &(block(&[("x", 1)]) + &block(&[("x", 2)])))
        .await;
    assert!(f.mon.read("43160").is_some());
    // Child exit = its stdout closes.
    let spawn = f.runner.spawns.lock().unwrap().remove(0);
    drop(spawn);
    settle().await;
    assert_eq!(f.mon.read("43160"), None);
}

#[tokio::test]
async fn stop_kills_the_child_and_stop_all_stops_every_live_monitor() {
    let f = fx(STARTED, None, true);
    f.mon.start("43160", &f.roots).await;
    let t0 = f.runner.token(0);
    f.mon.stop("43160");
    assert!(t0.is_cancelled());
    assert_eq!(f.mon.read("43160"), None);

    f.mon.start("1", &f.roots).await;
    f.mon.start("2", &f.roots).await;
    f.mon.stop_all();
    assert!(f.runner.token(1).is_cancelled());
    assert!(f.runner.token(2).is_cancelled());
}

/// pgrep blocks until released, so `stop` can land during the pid lookup.
struct GatedPgrep {
    gate: Arc<tokio::sync::Notify>,
    spawned: Arc<std::sync::atomic::AtomicUsize>,
}

impl ProcessRunner for GatedPgrep {
    fn run(&self, _p: &str, _a: Vec<String>, _t: Duration) -> BoxFuture<RunOutput> {
        let gate = self.gate.clone();
        Box::pin(async move {
            gate.notified().await;
            RunOutput {
                code: Some(0),
                stdout: "500\n".into(),
                stderr: String::new(),
            }
        })
    }
    fn spawn_streaming(&self, _p: &str, _a: Vec<String>) -> std::io::Result<StreamingChild> {
        self.spawned
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        Err(std::io::Error::other("unexpected spawn"))
    }
}

#[tokio::test]
async fn stop_during_pid_lookup_prevents_the_spawn() {
    let gate = Arc::new(tokio::sync::Notify::new());
    let spawned = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let dir = tempfile::tempdir().unwrap();
    let mon = Arc::new(DownloadMonitor::with_platform(
        Arc::new(RecordingHost::default()),
        Arc::new(GatedPgrep {
            gate: gate.clone(),
            spawned: spawned.clone(),
        }),
        Arc::new(FakeClock::new(0)),
        true,
    ));
    let roots = PollRoots {
        steam_root: dir.path().to_string_lossy().into_owned(),
        bottle_steamapps_root: None,
        bridge_steamapps_root: None,
    };
    let m2 = mon.clone();
    let task = tokio::spawn(async move { m2.start("43160", &roots).await });
    settle().await; // start is parked inside pgrep
    mon.stop("43160");
    gate.notify_one();
    task.await.unwrap();
    assert_eq!(spawned.load(std::sync::atomic::Ordering::SeqCst), 0);
    assert_eq!(mon.read("43160"), None);
}

#[test]
fn content_log_tail_first_read_incremental_and_rotation() {
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("c.txt");
    std::fs::write(&p, "one\ntwo\n").unwrap();
    let (t, off) = read_content_log_tail(&p, None).unwrap();
    assert_eq!((t.as_str(), off), ("one\ntwo\n", 8));
    std::fs::OpenOptions::new()
        .append(true)
        .open(&p)
        .unwrap()
        .write_all(b"three\n")
        .unwrap();
    let (t, off) = read_content_log_tail(&p, Some(off)).unwrap();
    assert_eq!((t.as_str(), off), ("three\n", 14));
    std::fs::write(&p, "x\n").unwrap(); // rotated: smaller than the offset
    let (t, off) = read_content_log_tail(&p, Some(14)).unwrap();
    assert_eq!((t.as_str(), off), ("x\n", 2));
    assert!(read_content_log_tail(&dir.path().join("missing"), None).is_err());
}

#[test]
fn content_log_tail_is_bounded_and_drops_the_partial_first_line() {
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("big.txt");
    let line = "0123456789\n";
    let n = (MAX_TAIL_BYTES as usize / line.len()) + 100;
    std::fs::write(&p, line.repeat(n)).unwrap();
    let (t, off) = read_content_log_tail(&p, None).unwrap();
    assert_eq!(off, (n * line.len()) as u64);
    assert!(t.len() as u64 <= MAX_TAIL_BYTES);
    assert!(t.starts_with("0123456789\n"));
}

#[cfg(target_os = "macos")]
#[tokio::test]
async fn stop_kills_a_real_child() {
    use gamelib_steampoll::runtime::TokioRunner;

    /// Runs pgrep from a script, and replaces the watchdog with a pid-recording sleeper.
    struct RealChild {
        pid_file: std::path::PathBuf,
    }
    impl ProcessRunner for RealChild {
        fn run(&self, _p: &str, _a: Vec<String>, _t: Duration) -> BoxFuture<RunOutput> {
            Box::pin(async {
                RunOutput {
                    code: Some(0),
                    stdout: "500\n".into(),
                    stderr: String::new(),
                }
            })
        }
        fn spawn_streaming(&self, _p: &str, _a: Vec<String>) -> std::io::Result<StreamingChild> {
            let script = format!("echo $$ > '{}'; exec sleep 30", self.pid_file.display());
            TokioRunner.spawn_streaming("/bin/sh", vec!["-c".into(), script])
        }
    }

    let dir = tempfile::tempdir().unwrap();
    let pid_file = dir.path().join("pid");
    let mon = DownloadMonitor::with_platform(
        Arc::new(RecordingHost::default()),
        Arc::new(RealChild {
            pid_file: pid_file.clone(),
        }),
        Arc::new(FakeClock::new(0)),
        true,
    );
    let roots = PollRoots {
        steam_root: dir.path().to_string_lossy().into_owned(),
        bottle_steamapps_root: None,
        bridge_steamapps_root: None,
    };
    mon.start("1", &roots).await;
    let mut pid = String::new();
    for _ in 0..100 {
        pid = std::fs::read_to_string(&pid_file).unwrap_or_default();
        if pid.trim().len() > 1 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    let pid = pid.trim().to_string();
    assert!(!pid.is_empty(), "child never wrote its pid");
    let alive = |pid: &str| {
        std::process::Command::new("/bin/kill")
            .args(["-0", pid])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    };
    assert!(alive(&pid));
    mon.stop("1");
    let mut gone = false;
    for _ in 0..100 {
        if !alive(&pid) {
            gone = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert!(gone, "child {pid} survived stop() for 2 s");
}
