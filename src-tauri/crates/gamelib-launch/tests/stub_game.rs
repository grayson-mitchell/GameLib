//! The game class against a stub game (88.2-10): the launch arm (the output reaches the capture file, the
//! sink and the window in order, and the call resolves only after a grandchild has ended) and the
//! parent-SIGKILL arm (a game survives the death of the process that ran the op). The quit-kill arm is
//! 88.2-11's.
//!
//! Runs on macOS, Linux and Windows: the stub (`gamelib-launch-stub-game`, feature `harness`) is the game,
//! and every wait polls to a deadline (no fixed sleep decides a result). Every run is on a fresh `FakeHome`,
//! never the real profile.

use std::collections::BTreeMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use gamelib_core::clock::SystemClock;
use gamelib_core::process::Pipe;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform as InfoPlatform};
use gamelib_info::http::ReqwestHttp;
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_launch::ctx::LaunchCtx;
use gamelib_launch::game::capture::capture_file;
use gamelib_launch::runner::call_runner::{
    call_runner, ExecResult, RunnerCallArgs, RunnerHost, RunnerProps, SpawnClassArg,
};
use gamelib_launch::runner::stream::{LaunchLogSink, LogHandOff, OutputSink};
use gamelib_launch::runner::{RunnerErrors, RunnerName};
use gamelib_log::frame::FrameTarget;
use gamelib_log::{Entry, Level, Prefix, TargetBatch};
use gamelib_proc::kill_tree::kill_game_tree;
use gamelib_proc::probe;
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::WineCtx;

const STUB: &str = env!("CARGO_BIN_EXE_gamelib-launch-stub-game");

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// The pids the stub game recorded (the leader first), once the file is published.
fn recorded_pids(file: &Path, want: usize) -> Option<Vec<u32>> {
    let text = std::fs::read_to_string(file).ok()?;
    let pids: Vec<u32> = text.lines().filter_map(|l| l.trim().parse().ok()).collect();
    (pids.len() == want).then_some(pids)
}

/// Ends the game trees it was handed when dropped, on pass or panic, so a failed run leaves no stray.
struct Strays(Vec<(u32, Option<u64>)>);

impl Strays {
    fn add(&mut self, pid: u32) {
        self.0.push((pid, probe::start_time(pid)));
    }
}

impl Drop for Strays {
    fn drop(&mut self) {
        for (pid, stamp) in &self.0 {
            if let Some(stamp) = stamp {
                let _ = kill_game_tree(*pid, *stamp, Duration::from_millis(500));
            }
        }
    }
}

fn host_platform() -> Platform {
    if cfg!(target_os = "macos") {
        Platform::Mac
    } else if cfg!(windows) {
        Platform::Windows
    } else {
        Platform::Linux
    }
}

fn info_platform() -> InfoPlatform {
    if cfg!(target_os = "macos") {
        InfoPlatform::Mac
    } else if cfg!(windows) {
        InfoPlatform::Windows
    } else {
        InfoPlatform::Linux
    }
}

/// Keeps what the log sink and the output sink were given.
#[derive(Default)]
struct Recorded {
    raw: Mutex<Vec<String>>,
    chunks: Mutex<Vec<(Pipe, String)>>,
    pids: Mutex<Vec<u32>>,
}

impl LaunchLogSink for Recorded {
    fn stamp(&self) -> (u64, i32) {
        (0, 0)
    }
    fn submit(&self, batches: Vec<TargetBatch>) {
        for batch in batches {
            for entry in batch.entries {
                if let Entry::Raw(text) = entry {
                    lock(&self.raw).push(text);
                }
            }
        }
    }
    fn general(&self, _prefix: Prefix, _level: Level, _msg: &str) {}
}

impl OutputSink for Recorded {
    fn chunk(&self, pipe: Pipe, text: &str) {
        lock(&self.chunks).push((pipe, text.to_string()));
    }
    fn spawned(&self, pid: u32) {
        lock(&self.pids).push(pid);
    }
}

struct QuietErrors;

impl RunnerErrors for QuietErrors {
    fn handle(&self, _error: &str, _app_name: &str, _runner: RunnerName) {}
}

fn ctx_over(root: &Path, log: Arc<Recorded>) -> LaunchCtx {
    let app_folder = root.join(".config").join("GameLib");
    let engine = Arc::new(
        EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            host_platform(),
            EnginePaths {
                tools_path: app_folder.join("tools"),
                user_data: root.join("userdata"),
                app_folder: app_folder.clone(),
                user_home: root.to_path_buf(),
                temp: root.join("tmp"),
            },
            Shutdown::new(),
        )
        .with_proc(Arc::new(gamelib_proc::SpecProcRunner)),
    );
    let knownfix = Arc::new(KnownFixCtx::new(
        engine.clone(),
        None,
        "https://relay.test",
        "0.0.0",
    ));
    let wine = Arc::new(WineCtx::new(engine.clone(), app_folder.join("tools")));
    let info = Arc::new(InfoCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        info_platform(),
        InfoPaths {
            app_folder: app_folder.clone(),
            user_data: app_folder,
            temp: root.join("tmp"),
            public_dir: None,
        },
        "0.0.0".to_string(),
        Shutdown::new(),
        Arc::new(ReqwestHttp::new()),
    ));
    LaunchCtx::new(engine, knownfix, wine, info)
        .with_log_sink(log)
        .with_errors(Arc::new(QuietErrors))
}

/// The call that launches the stub game as the game class. A sideload names no app, so the capture file is
/// named for the track key.
fn game_call(track_key: &str, stub_args: &[&str]) -> RunnerCallArgs {
    RunnerCallArgs {
        stream_id: String::new(),
        command_parts: stub_args.iter().map(|a| (*a).to_string()).collect(),
        runner: RunnerProps {
            name: RunnerName::Sideload,
            bin: STUB.to_string(),
            dir: None,
            log_prefix: "Sideload".to_string(),
        },
        env: Default::default(),
        wrappers: Vec::new(),
        log_message_prefix: None,
        log_targets: vec![LogHandOff {
            target: FrameTarget {
                kind: "runner".to_string(),
                app_name: None,
                runner: Some("sideload".to_string()),
                log_type: None,
            },
            disabled: false,
            rotate: true,
        }],
        log_sanitizer: None,
        abort_id: Some(track_key.to_string()),
        track_key: Some(track_key.to_string()),
        cwd: None,
        skip_error_handler: false,
        observe: true,
        spawn_class: SpawnClassArg::Game,
    }
}

fn expected_lines(n: usize) -> String {
    (0..n).map(|i| format!("line {i}\n")).collect()
}

#[tokio::test]
async fn launch_tails_output_and_waits_for_the_grandchild() {
    let home = FakeHome::new("stub-game-launch-");
    let recorded = Arc::new(Recorded::default());
    let ctx = ctx_over(home.root(), recorded.clone());
    let pids_file = home.root().join("pids.txt");
    let mut strays = Strays(Vec::new());

    // The game prints 20 lines and exits after 300 ms; its child lives 800 ms, so it ends 500 ms after
    // the leader.
    let pids = pids_file.to_string_lossy().into_owned();
    let call = game_call(
        "launch-tail",
        &[
            "game",
            "--pids",
            &pids,
            "--child",
            "--child-exit-ms",
            "800",
            "--lines",
            "20",
            "--exit-after-ms",
            "300",
        ],
    );
    let host = RunnerHost {
        env: BTreeMap::new(),
        path: String::new(),
    };
    let started = Instant::now();
    let result: ExecResult = call_runner(&ctx, call, &host, recorded.clone()).await;
    let elapsed = started.elapsed();

    let game = recorded_pids(&pids_file, 2).expect("the game published its pids");
    strays.add(game[0]);
    strays.add(game[1]);
    assert_eq!(result.error, None, "the call failed: {result:?}");
    assert_eq!(result.abort, None);
    assert!(
        !probe::is_alive(game[1]),
        "the call resolved while the game's child ({}) was still running",
        game[1]
    );
    assert!(
        elapsed >= Duration::from_millis(700),
        "the call resolved after {elapsed:?}, before the child's 800 ms life ended"
    );
    assert_eq!(
        *lock(&recorded.pids),
        vec![game[0]],
        "runnerSpawned names the leader"
    );

    // The capture file: private, and holding the 20 lines (stdout and stderr share it).
    let capture = capture_file(
        &home.root().join(".config").join("GameLib"),
        RunnerName::Sideload,
        "launch-tail",
    );
    assert_eq!(
        std::fs::read_to_string(&capture).expect("capture file"),
        expected_lines(20)
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(&capture)
            .expect("meta")
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600, "the capture file must be 0600");
    }

    // The sink saw the same bytes, in order, and the window (the result) holds them.
    let streamed: String = lock(&recorded.chunks)
        .iter()
        .map(|(pipe, text)| {
            assert_eq!(*pipe, Pipe::Stdout, "a capture file has one stream");
            text.as_str()
        })
        .collect();
    assert_eq!(streamed, expected_lines(20));
    assert!(result.stdout.contains("line 0") && result.stdout.contains("line 19"));

    // The log writer got the output, in order, as raw entries (the command line is a structured one).
    let written: String = lock(&recorded.raw).iter().cloned().collect();
    assert_eq!(written, expected_lines(20));
}
