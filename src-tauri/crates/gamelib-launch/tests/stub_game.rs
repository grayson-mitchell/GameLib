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
use gamelib_core::process::{BoxFuture, Pipe};
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform as InfoPlatform};
use gamelib_info::http::ReqwestHttp;
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_launch::ctx::LaunchCtx;
use gamelib_launch::dispatch;
use gamelib_launch::funnel::steps::testing::RecordingSteps;
use gamelib_launch::funnel::{run::run_launch, FunnelHost, LaunchParams, LaunchStatus};
use gamelib_launch::game::capture::capture_file;
use gamelib_launch::game::end::{wait_end, Ended, GameEnd};
use gamelib_launch::game::registry::{GameEntry, RunIds, TrackedRegistry};
use gamelib_launch::hooks::{
    HookError, LaunchFacts, LaunchHookArgs, LaunchHookReply, ManagerHooks,
};
use gamelib_launch::runner::call_runner::{
    call_runner, ExecResult, RunnerCallArgs, RunnerHost, RunnerProps, SpawnClassArg,
};
use gamelib_launch::runner::stream::{LaunchLogSink, LogHandOff, OutputSink};
use gamelib_launch::runner::{RunnerErrors, RunnerName};
use gamelib_log::frame::FrameTarget;
use gamelib_log::{Entry, Level, Prefix, TargetBatch};
use gamelib_proc::kill_tree::kill_game_tree;
use gamelib_proc::probe;
use gamelib_proc::{spawn_game_tracked, KillOutcome};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::WineCtx;
use tokio_util::sync::CancellationToken;

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
    /// The general (`gamelib.log`) lines.
    general: Mutex<Vec<String>>,
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
    fn general(&self, _prefix: Prefix, _level: Level, msg: &str) {
        lock(&self.general).push(msg.to_string());
    }
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
    // The kill answers once the tree is counted gone; the processes read as exited a moment later on
    // Windows (a terminated process is signalled after its threads end), so the probe from outside
    // polls to the test's limit instead of reading once. A member that escaped the kill never dies and
    // still fails here.
    wait_async(
        "the game and its child to be gone after the quit-kill",
        || !probe::is_alive(game[0]) && !probe::is_alive(game[1]),
    )
    .await;

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
    wait_async("the game and its child to be gone", || {
        !probe::is_alive(game[0]) && !probe::is_alive(game[1])
    })
    .await;
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
    wait_async("the game and its child to be gone", || {
        !probe::is_alive(game[0]) && !probe::is_alive(game[1])
    })
    .await;
}

/// Spawns the stub with `args` as a tracked game on a fresh fake profile and registers it the way a run
/// does, answering the registry entry `wait_end` reads. The leader is put in `strays` at once, so a failing
/// arm leaves nothing behind.
fn register_stub(home: &FakeHome, args: &[&str], strays: &mut Strays) -> GameEntry {
    let mut cmd = std::process::Command::new(STUB);
    cmd.args(args);
    home.apply(&mut cmd);
    let handle = spawn_game_tracked(cmd, None).expect("spawn the stub game");
    strays.add(handle.pid);
    let registry = TrackedRegistry::new();
    let ids = RunIds {
        runner: "sideload".to_string(),
        key: "wait-end".to_string(),
        abort_id: "wait-end-abort".to_string(),
        stream_id: String::new(),
    };
    let id = registry.register_game(ids, 0, CancellationToken::new(), handle);
    registry.entry(id).expect("the entry just registered")
}

/// WR-07: a game that exits with 259 (`STILL_ACTIVE`, which is also a legal exit code) is over. On Windows
/// the liveness read took 259 for "still running" and `wait_end` never ended; there the status must read
/// 259 too. On unix the exit status is 259 truncated to 3 and the run settles regardless, so the arm only
/// discriminates on Windows.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn an_exit_code_of_259_ends_the_run() {
    let home = FakeHome::new("stub-game-259-");
    let mut strays = Strays(Vec::new());
    let entry = register_stub(&home, &["exit", "--code", "259"], &mut strays);
    let never = CancellationToken::new();

    let ended = tokio::time::timeout(LIMIT, wait_end(&entry, GameEnd::Close, &never))
        .await
        .expect("the run of a game that exited with 259 never ended");
    match ended {
        Ended::Finished(status) => {
            #[cfg(windows)]
            assert_eq!(status.and_then(|s| s.code()), Some(259));
            #[cfg(not(windows))]
            let _ = status;
        }
        Ended::Shutdown => panic!("nothing cancelled the run, yet it read as a shutdown"),
    }
    assert!(entry.ended.load(std::sync::atomic::Ordering::SeqCst));
}

/// WR-02: `wait_end` never blocks a tokio worker on the game handle's lock. A registry kill holds that lock
/// for its whole kill (D-27), so a shutdown that fires meanwhile must still be answered within a poll
/// period. The game's leader is gone and its child keeps the group (or Job) alive, so `wait_end` sits in the
/// group poll; a std thread holds the handle's lock for 2 s, as a kill does, and the token fires 300 ms
/// into the wait. Blocking on the lock would answer only when the holder lets go, about 2 s in.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_cancel_is_answered_while_a_kill_holds_the_handle() {
    let home = FakeHome::new("stub-game-lockheld-");
    let mut strays = Strays(Vec::new());
    let pids_file = home.root().join("lockheld-pids.txt");
    let pids = pids_file.to_string_lossy().into_owned();
    let entry = register_stub(
        &home,
        &[
            "game",
            "--pids",
            &pids,
            "--child",
            "--lines",
            "0",
            "--exit-after-ms",
            "0",
        ],
        &mut strays,
    );
    wait_async("both pids published and the leader gone", || {
        recorded_pids(&pids_file, 2).is_some() && !probe::is_alive(entry.pid)
    })
    .await;
    let game = recorded_pids(&pids_file, 2).expect("pids");
    strays.add(game[1]);

    let (held_tx, held_rx) = std::sync::mpsc::channel();
    let holder = {
        let handle = entry.handle.clone();
        std::thread::spawn(move || {
            let guard = lock(&handle);
            held_tx.send(()).expect("report the lock held");
            std::thread::sleep(Duration::from_secs(2));
            drop(guard);
        })
    };
    held_rx
        .recv_timeout(LIMIT)
        .expect("the holder never took the lock");

    let token = CancellationToken::new();
    {
        let token = token.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(300)).await;
            token.cancel();
        });
    }
    let started = Instant::now();
    let ended = wait_end(&entry, GameEnd::Close, &token).await;
    let elapsed = started.elapsed();
    assert!(
        matches!(ended, Ended::Shutdown),
        "the cancel was not answered as a shutdown: {ended:?}"
    );
    assert!(
        elapsed < Duration::from_secs(1),
        "the cancel waited for the handle's lock: {elapsed:?}"
    );

    // Tidy up: the holder lets go, the tree is ended through the handle and the leader reaped.
    holder.join().expect("the lock holder");
    let mut handle = lock(&entry.handle);
    let _ = handle.kill_tree(Duration::from_millis(500));
    let _ = handle.reap_status();
}

// ---------------------------------------------------------------------------------------------
// 88.3-05, the 88.3 stub_game row (D-04, D-16): the single-flight join through the funnel, on a real game
// ---------------------------------------------------------------------------------------------

/// The managers of a funnel test whose `launch` hook runs a real game-class `call_runner` of the stub game, with
/// the funnel's own hand-off target as the log target: the part of `game.launch` that spawns, over the real
/// spawn seam. Each launch writes the pids to a file of its own, so a count of files and lines is a count of games
/// the stub itself started, not of what the registry under test believes.
struct StubGameHooks {
    /// A context without these hooks (they would otherwise hold a reference to themselves).
    ctx: LaunchCtx,
    recorded: Arc<Recorded>,
    pids_dir: std::path::PathBuf,
    /// How long each stub game lives.
    exit_after_ms: u64,
    launches: std::sync::atomic::AtomicUsize,
}

impl StubGameHooks {
    fn pids_file(&self, launch: usize) -> std::path::PathBuf {
        self.pids_dir.join(format!("launch-{launch}-pids.txt"))
    }

    fn launches(&self) -> usize {
        self.launches.load(std::sync::atomic::Ordering::SeqCst)
    }
}

impl ManagerHooks for StubGameHooks {
    fn game_title(
        &self,
        _runner: RunnerName,
        app_name: &str,
    ) -> BoxFuture<Result<String, HookError>> {
        let title = app_name.to_string();
        Box::pin(async move { Ok(title) })
    }

    fn force_uninstall(
        &self,
        _runner: RunnerName,
        _app_name: &str,
    ) -> BoxFuture<Result<(), HookError>> {
        Box::pin(async { Ok(()) })
    }

    fn launch_facts(
        &self,
        _runner: RunnerName,
        app_name: &str,
    ) -> BoxFuture<Result<LaunchFacts, HookError>> {
        let facts: LaunchFacts = serde_json::from_value(serde_json::json!({
            "gameInfo": { "title": app_name, "install": {} },
            "settings": { "verboseLogs": true },
            "isNative": true,
            "verboseLogs": true,
        }))
        .expect("the facts read");
        Box::pin(async move { Ok(facts) })
    }

    fn launch(
        &self,
        _runner: RunnerName,
        _app_name: &str,
        args: LaunchHookArgs,
    ) -> BoxFuture<Result<LaunchHookReply, HookError>> {
        let launch = self
            .launches
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let pids = self.pids_file(launch).to_string_lossy().into_owned();
        let exit_after = self.exit_after_ms.to_string();
        let mut call = game_call(
            &format!("funnel-launch-{launch}"),
            &[
                "game",
                "--pids",
                &pids,
                "--lines",
                "3",
                "--exit-after-ms",
                &exit_after,
            ],
        );
        // The log target is the funnel's hand-off, as `game.launch` writes the game's output to its writer.
        call.log_targets = vec![args.log.to_runner_hand_off()];
        let (ctx, recorded) = (self.ctx.clone(), self.recorded.clone());
        Box::pin(async move {
            let host = RunnerHost {
                env: BTreeMap::new(),
                path: String::new(),
            };
            let result = call_runner(&ctx, call, &host, recorded).await;
            Ok(LaunchHookReply {
                launched: result.error.is_none() && result.abort.is_none(),
                rotated: false,
            })
        })
    }
}

fn funnel_params() -> LaunchParams {
    LaunchParams {
        app_name: "stubapp".to_string(),
        runner: RunnerName::Sideload,
        launch_arguments: None,
        skip_version_check: None,
        args: None,
    }
}

/// A funnel context over the real spawn seam: the stub's hooks, recording steps, no window.
fn funnel_ctx(
    home: &FakeHome,
    recorded: &Arc<Recorded>,
    exit_after_ms: u64,
) -> (LaunchCtx, Arc<StubGameHooks>) {
    let base = ctx_over(home.root(), recorded.clone());
    let hooks = Arc::new(StubGameHooks {
        ctx: base.clone(),
        recorded: recorded.clone(),
        pids_dir: home.root().to_path_buf(),
        exit_after_ms,
        launches: std::sync::atomic::AtomicUsize::new(0),
    });
    let ctx = base
        .with_hooks(hooks.clone())
        .with_steps(Arc::new(RecordingSteps::new()));
    (ctx, hooks)
}

/// The one pid a launch's stub game recorded, read from its own file.
fn game_pid(hooks: &StubGameHooks, launch: usize) -> u32 {
    recorded_pids(&hooks.pids_file(launch), 1)
        .unwrap_or_else(|| panic!("launch {launch} published no single pid"))[0]
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn two_plays_through_the_funnel_spawn_one_game() {
    let home = FakeHome::new("stub-game-funnel-");
    let recorded = Arc::new(Recorded::default());
    // Long enough that the second Play is certainly made while the first game still runs.
    let (ctx, hooks) = funnel_ctx(&home, &recorded, 2_000);
    let mut strays = Strays(Vec::new());

    let first = {
        let ctx = ctx.clone();
        tokio::spawn(async move { run_launch(&ctx, funnel_params(), &FunnelHost::default()).await })
    };
    wait_async("the first Play's game to publish its pid", || {
        recorded_pids(&hooks.pids_file(0), 1).is_some()
    })
    .await;
    strays.add(game_pid(&hooks, 0));
    let second = {
        let ctx = ctx.clone();
        tokio::spawn(async move { run_launch(&ctx, funnel_params(), &FunnelHost::default()).await })
    };

    let (first, second) = (
        tokio::time::timeout(LIMIT, first)
            .await
            .expect("the first Play settles"),
        tokio::time::timeout(LIMIT, second)
            .await
            .expect("the second Play settles"),
    );
    // Both answer the first's status, after the game exits.
    assert_eq!(first.expect("task"), Ok(LaunchStatus::Done));
    assert_eq!(second.expect("task"), Ok(LaunchStatus::Done));

    // One game: one `launch` hook, one `call_runner`, one pid file (counted from what the stub wrote, not from
    // the registry under test), one spawn the sink was told about, and no second file.
    assert_eq!(hooks.launches(), 1, "one call_runner for two Plays");
    assert!(
        !hooks.pids_file(1).exists(),
        "no second game wrote its pids"
    );
    assert_eq!(*lock(&recorded.pids), vec![game_pid(&hooks, 0)]);
    assert!(
        !probe::is_alive(game_pid(&hooks, 0)),
        "the Plays settled while the game still ran"
    );
    assert!(ctx.flights.is_empty(), "the flight is given back");

    // The WR-03 line is written once, by the joiner.
    let joined = lock(&recorded.general)
        .iter()
        .filter(|line| line.contains("already in progress; joining it (WR-03)"))
        .count();
    assert_eq!(joined, 1, "the joiner line is written once");

    // The game's capture output reached the per-game log, in order, and the log closed once.
    let written: String = lock(&recorded.raw).iter().cloned().collect();
    assert!(
        written.contains(&expected_lines(3)),
        "the game's output is in the per-game log: {written:?}"
    );
    assert_eq!(written.matches("End of log").count(), 1);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_play_after_the_first_settles_launches_again() {
    let home = FakeHome::new("stub-game-funnel-again-");
    let recorded = Arc::new(Recorded::default());
    let (ctx, hooks) = funnel_ctx(&home, &recorded, 300);
    let mut strays = Strays(Vec::new());

    let first = run_launch(&ctx, funnel_params(), &FunnelHost::default()).await;
    assert_eq!(first, Ok(LaunchStatus::Done));
    strays.add(game_pid(&hooks, 0));
    assert!(ctx.flights.is_empty());

    let second = run_launch(&ctx, funnel_params(), &FunnelHost::default()).await;
    assert_eq!(second, Ok(LaunchStatus::Done));
    strays.add(game_pid(&hooks, 1));

    assert_eq!(
        hooks.launches(),
        2,
        "a Play after the first settled is a launch of its own"
    );
    assert_ne!(
        game_pid(&hooks, 0),
        game_pid(&hooks, 1),
        "two games, two pids"
    );
    let joined = lock(&recorded.general)
        .iter()
        .filter(|line| line.contains("(WR-03)"))
        .count();
    assert_eq!(joined, 0, "nothing joined");
}
