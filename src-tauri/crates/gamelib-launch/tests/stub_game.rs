//! The game class against a stub game (88.2-10): the launch arm (the output reaches the capture file, the
//! sink and the window in order, and the call resolves only after a grandchild has ended) and the
//! parent-SIGKILL arm (a game survives the death of the process that ran the op), and (88.2-11) the
//! quit-kill arm (`launch_tracked_kill_all` ends a running game's tree and the run reads as an abort), the
//! filtered tracked kill and the abort id reaching a game.
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
use gamelib_launch::dispatch;
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
use gamelib_proc::KillOutcome;
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::WineCtx;

const STUB: &str = env!("CARGO_BIN_EXE_gamelib-launch-stub-game");
const POLL: Duration = Duration::from_millis(100);
const LIMIT: Duration = Duration::from_secs(15);

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// Polls `pred` every 100 ms for up to 15 s; the panic names what it was waiting for.
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

/// The stub in its `shell` mode: a stand-in for GameLib that runs `launch_runner_call` over a context rooted
/// in `user_data`, with the fake profile applied (never a hand-rolled env literal). Its stderr goes to a file,
/// so a leftover process can never hold a pipe the test waits on.
fn shell(home: &FakeHome, user_data: &Path, call: &RunnerCallArgs) -> std::process::Child {
    let args = serde_json::json!([call_json(call), null]);
    let mut cmd = std::process::Command::new(STUB);
    cmd.arg("shell")
        .arg("--user-data")
        .arg(user_data)
        .arg("--args")
        .arg(args.to_string())
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::from(
            std::fs::File::create(home.root().join("shell.err")).expect("shell stderr file"),
        ));
    home.apply(&mut cmd);
    cmd.spawn().expect("spawn the stand-in shell")
}

/// What the wire carries of a game call the test built (`RunnerCallArgs` is read from the wire only).
fn call_json(call: &RunnerCallArgs) -> serde_json::Value {
    serde_json::json!({
        "streamId": call.stream_id,
        "commandParts": call.command_parts,
        "runner": {
            "name": call.runner.name.as_str(),
            "bin": call.runner.bin,
            "logPrefix": call.runner.log_prefix,
        },
        "abortId": call.abort_id,
        "trackKey": call.track_key,
        "spawnClass": "game",
    })
}

fn file_len(path: &Path) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

/// D-05: a crash, Force Quit or `kill -9` of GameLib leaves the game running. The shell stand-in runs the
/// real launch op, the stub game it launched keeps writing its capture file after the shell is killed
/// (SIGKILL on unix, TerminateProcess on Windows), and only then is it ended, by a stamp-checked
/// `kill_game_tree` from this process.
#[test]
fn parent_sigkill_leaves_the_game_running() {
    let home = FakeHome::new("stub-game-sigkill-");
    let user_data = home.root().join("gamelib-data");
    let pids_file = home.root().join("pids.txt");
    let mut strays = Strays(Vec::new());

    // No `--lines` and no exit: the game writes a line every 50 ms until it is ended.
    let pids = pids_file.to_string_lossy().into_owned();
    let mut call = game_call("sigkill", &["game", "--pids", &pids, "--child"]);
    call.observe = false;
    call.log_targets.clear();
    let mut shell = shell(&home, &user_data, &call);
    let shell_pid = shell.id();

    wait_until("the game to publish both pids", || {
        recorded_pids(&pids_file, 2).is_some()
    });
    let game = recorded_pids(&pids_file, 2).expect("pids");
    strays.add(game[0]);
    strays.add(game[1]);
    let stamp = probe::start_time(game[0]);
    let capture = capture_file(&user_data, RunnerName::Sideload, "sigkill");
    wait_until("the game to write its capture file", || {
        file_len(&capture) > 0
    });
    assert!(
        probe::is_alive(shell_pid),
        "the shell must still be running the op"
    );

    // The process that ran the op dies without any chance to clean up.
    shell.kill().expect("kill the shell");
    shell.wait().expect("reap the shell");
    wait_until("the shell to be gone", || !probe::is_alive(shell_pid));

    assert!(probe::is_alive(game[0]), "the game died with its parent");
    assert!(
        probe::is_alive(game[1]),
        "the game's child died with its parent"
    );
    let before = file_len(&capture);
    wait_until("the capture file to keep growing", || {
        file_len(&capture) > before
    });
    assert!(probe::is_alive(game[0]) && probe::is_alive(game[1]));

    // Another process ends the tree, with the stamp probed at launch.
    let stamp = stamp.expect("the game's start stamp");
    assert_eq!(
        kill_game_tree(game[0], stamp, Duration::from_millis(1500)),
        KillOutcome::Killed
    );
    wait_until("the game and its child to end", || {
        !probe::is_alive(game[0]) && !probe::is_alive(game[1])
    });
}

/// Starts the stub game as a game-class call on its own task and waits until it is registered, its pids are
/// published and (for the capture file) it has written something. Answers the run's handle and the pids.
async fn start_game(
    ctx: &LaunchCtx,
    recorded: &Arc<Recorded>,
    home: &FakeHome,
    track_key: &str,
    strays: &mut Strays,
) -> (tokio::task::JoinHandle<ExecResult>, Vec<u32>) {
    let pids_file = home.root().join(format!("{track_key}-pids.txt"));
    let pids = pids_file.to_string_lossy().into_owned();
    let call = game_call(track_key, &["game", "--pids", &pids, "--child"]);
    let host = RunnerHost {
        env: BTreeMap::new(),
        path: String::new(),
    };
    let run = {
        let (ctx, recorded) = (ctx.clone(), recorded.clone());
        tokio::spawn(async move { call_runner(&ctx, call, &host, recorded).await })
    };
    wait_async("the game to be registered and publish both pids", || {
        ctx.registry.games_running() && recorded_pids(&pids_file, 2).is_some()
    })
    .await;
    let game = recorded_pids(&pids_file, 2).expect("pids");
    strays.add(game[0]);
    strays.add(game[1]);
    (run, game)
}

/// `wait_until` for a test that runs on a tokio runtime: it yields instead of blocking the worker.
async fn wait_async(what: &str, mut pred: impl FnMut() -> bool) {
    let deadline = Instant::now() + LIMIT;
    loop {
        if pred() {
            return;
        }
        assert!(Instant::now() < deadline, "timed out waiting for: {what}");
        tokio::time::sleep(POLL).await;
    }
}

async fn finished(run: tokio::task::JoinHandle<ExecResult>) -> ExecResult {
    tokio::time::timeout(LIMIT, run)
        .await
        .expect("the run did not settle after the kill")
        .expect("the run task")
}

/// SC4, the quit-kill arm: the quit's Yes is `launch_tracked_kill_all`. It ends a running game and the
/// grandchild it started (probed from outside, never through the registry), the run settles as an abort,
/// and `launch_games_running` reads false afterwards.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn quit_kill_ends_the_game_tree_and_reads_as_abort() {
    let home = FakeHome::new("stub-game-quit-");
    let recorded = Arc::new(Recorded::default());
    let ctx = ctx_over(home.root(), recorded.clone());
    let mut strays = Strays(Vec::new());
    let (run, game) = start_game(&ctx, &recorded, &home, "quit-kill", &mut strays).await;

    assert_eq!(
        dispatch("launch_games_running", &[], &ctx).await,
        Ok(serde_json::json!(true))
    );
    assert!(probe::is_alive(game[0]) && probe::is_alive(game[1]));

    let started = Instant::now();
    let killed = dispatch("launch_tracked_kill_all", &[], &ctx).await;
    assert_eq!(killed, Ok(serde_json::json!(1)));
    assert!(
        started.elapsed() < Duration::from_secs(3),
        "the kill outlasted the child grace: {:?}",
        started.elapsed()
    );
    assert!(
        !probe::is_alive(game[0]) && !probe::is_alive(game[1]),
        "the game or its child survived the quit-kill"
    );

    let result = finished(run).await;
    assert_eq!(result.error, None, "a kill is not an error: {result:?}");
    assert_eq!(result.abort, Some(true));
    assert_eq!(
        dispatch("launch_games_running", &[], &ctx).await,
        Ok(serde_json::json!(false))
    );
    // Nothing is left to kill, and the registrant the kill took has been given back.
    assert_eq!(
        dispatch("launch_tracked_kill_all", &[], &ctx).await,
        Ok(serde_json::json!(0))
    );
    // `drain` answers the names still registered: the kill's registrant is not among them.
    assert!(ctx
        .engine
        .shutdown
        .drain(Duration::from_millis(50))
        .is_empty());
}

/// The TS filter: a runner or key that matches nothing ends nothing and leaves the game running; the game's
/// own `{ runner, key }` ends it.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_filtered_tracked_kill_ends_only_the_game_it_names() {
    let home = FakeHome::new("stub-game-filter-");
    let recorded = Arc::new(Recorded::default());
    let ctx = ctx_over(home.root(), recorded.clone());
    let mut strays = Strays(Vec::new());
    let (run, game) = start_game(&ctx, &recorded, &home, "filter-key", &mut strays).await;

    for filter in [
        serde_json::json!({ "runner": "sideload", "key": "not-this-one" }),
        serde_json::json!({ "runner": "nile" }),
        serde_json::json!({ "key": "not-this-one" }),
    ] {
        assert_eq!(
            dispatch("launch_tracked_kill", std::slice::from_ref(&filter), &ctx).await,
            Ok(serde_json::json!(0)),
            "{filter}"
        );
    }
    assert!(
        probe::is_alive(game[0]) && probe::is_alive(game[1]),
        "a filter that matched nothing ended the game"
    );
    assert!(ctx.registry.games_running());

    let own = serde_json::json!({ "runner": "sideload", "key": "filter-key" });
    assert_eq!(
        dispatch("launch_tracked_kill", &[own], &ctx).await,
        Ok(serde_json::json!(1))
    );
    let result = finished(run).await;
    assert_eq!(result.abort, Some(true));
    assert!(!probe::is_alive(game[0]) && !probe::is_alive(game[1]));
}

/// The abort id reaches a game run too (`run_abort` alone finds only helper runs): the tree ends and the run
/// settles as an abort. An id nothing answers to is `false`.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn the_abort_id_ends_a_game_run_through_its_handle() {
    let home = FakeHome::new("stub-game-abort-");
    let recorded = Arc::new(Recorded::default());
    let ctx = ctx_over(home.root(), recorded.clone());
    let mut strays = Strays(Vec::new());
    let (run, game) = start_game(&ctx, &recorded, &home, "abort-key", &mut strays).await;

    assert_eq!(
        dispatch("launch_runner_abort", &[serde_json::json!("nobody")], &ctx).await,
        Ok(serde_json::json!(false))
    );
    assert!(probe::is_alive(game[0]));
    assert_eq!(
        dispatch(
            "launch_runner_abort",
            &[serde_json::json!("abort-key")],
            &ctx
        )
        .await,
        Ok(serde_json::json!(true))
    );
    let result = finished(run).await;
    assert_eq!(result.abort, Some(true));
    assert!(!probe::is_alive(game[0]) && !probe::is_alive(game[1]));
}
