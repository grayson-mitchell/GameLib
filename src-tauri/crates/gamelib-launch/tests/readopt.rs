//! The launch record and the funnel session it hangs on (88.3-07, D-08): the reader's refusals, the five launch
//! sites finding their funnel session from the `{ runner, key }` they register under, and the member snapshot a
//! Wine-shaped launch (the leader exits, the group lives) keeps in its record.
//!
//! Every run is on a fresh `FakeHome`; every wait polls to a deadline.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use gamelib_core::clock::SystemClock;
use gamelib_core::emitter::FrontendEmitter;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform as InfoPlatform};
use gamelib_info::http::ReqwestHttp;
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_launch::ctx::LaunchCtx;
use gamelib_launch::funnel::playtime::iso_string;
use gamelib_launch::funnel::session::{SessionFacts, SessionGuard};
use gamelib_launch::game::readopt::{
    announce, start, start_bounded, start_with_host, READOPT_RECORD_CAP,
};
use gamelib_launch::game::record::{
    read_record, record_path, remove_record, write_atomic, LaunchRecord, RecordError, RecordMember,
    RecordState, RECORD_MAX_BYTES, RECORD_VERSION,
};
use gamelib_launch::runner::call_runner::{
    call_runner, RunnerCallArgs, RunnerHost, RunnerProps, SpawnClassArg,
};
use gamelib_launch::runner::script::{ScriptRunArgs, ScriptStage};
use gamelib_launch::runner::stream::{LaunchLogSink, NullSink};
use gamelib_launch::runner::wine_command::run_prepared_game_for_test;
use gamelib_launch::runner::RunnerName;
use gamelib_log::{Level, Prefix, TargetBatch};
use gamelib_proc::kill_tree::kill_game_tree;
use gamelib_proc::probe;
use gamelib_proc::{spawn_game_tracked, GameHandle};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::WineCtx;
use gamelib_wine::wine_cmd::command::PreparedWine;

const STUB: &str = env!("CARGO_BIN_EXE_gamelib-launch-stub-game");
const LIMIT: Duration = Duration::from_secs(15);
const POLL: Duration = Duration::from_millis(50);

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

/// Ends the game trees it was handed when dropped, on pass or panic.
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

fn app_folder(home: &FakeHome) -> PathBuf {
    home.root().join(".config").join("GameLib")
}

fn ctx_over(home: &FakeHome) -> LaunchCtx {
    ctx_with(home, None)
}

/// [`ctx_over`] with the emitter the renderer's pushes go to.
fn ctx_with(home: &FakeHome, emitter: Option<Arc<dyn FrontendEmitter>>) -> LaunchCtx {
    let root = home.root();
    let app_folder = app_folder(home);
    let mut engine = EngineCtx::new(
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
    .with_proc(Arc::new(gamelib_proc::SpecProcRunner));
    if let Some(emitter) = emitter {
        engine = engine.with_emitter(emitter);
    }
    let engine = Arc::new(engine);
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
}

/// The game's own pid, once the stub has published its pid file (it does so a moment after it starts).
async fn first_pid(file: &Path) -> u32 {
    let mut found = None;
    wait_async("the game's pid file", || {
        found = std::fs::read_to_string(file)
            .ok()
            .and_then(|text| text.lines().next().and_then(|l| l.trim().parse().ok()));
        found.is_some()
    })
    .await;
    found.expect("the game's pid")
}

fn sample() -> LaunchRecord {
    LaunchRecord {
        version: RECORD_VERSION,
        runner: "sideload".to_string(),
        app_name: "alpha".to_string(),
        pid: 4242,
        stamp: 99,
        pgid: 4242,
        members: vec![RecordMember {
            pid: 4243,
            stamp: 100,
        }],
        launch_started_at_ms: 1,
        start_playing_at_ms: 2,
        state: RecordState::Running,
        killed_at_ms: None,
        after_script: None,
    }
}

/// Writes `value` as the record file, mode 0600 on unix, and answers its path.
fn plant(dir: &Path, name: &str, bytes: &[u8]) -> PathBuf {
    let path = dir.join(name);
    std::fs::write(&path, bytes).expect("plant");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).expect("mode");
    }
    path
}

// ---------------------------------------------------------------------------------------------
// The reader's five refusals
// ---------------------------------------------------------------------------------------------

#[test]
fn a_good_record_reads_back_exactly() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = record_path(dir.path(), RunnerName::Sideload, "alpha");
    write_atomic(&path, &sample()).expect("writes");
    let read = read_record(&path).expect("a record this build wrote reads");
    assert_eq!((read.pid, read.stamp, read.pgid), (4242, 99, 4242));
    assert_eq!(read.state, RecordState::Running);
}

#[cfg(unix)]
#[test]
fn the_reader_refuses_a_symlink_and_touches_nothing() {
    let dir = tempfile::tempdir().expect("tempdir");
    let real = dir.path().join("real.json");
    std::fs::write(&real, serde_json::to_vec(&sample()).expect("json")).expect("real");
    let link = dir.path().join("link.json");
    std::os::unix::fs::symlink(&real, &link).expect("symlink");
    assert_eq!(read_record(&link).err(), Some(RecordError::NotRegular));
    assert!(
        real.exists() && link.symlink_metadata().is_ok(),
        "nothing was touched"
    );
}

#[test]
fn the_reader_refuses_a_file_over_64_kib() {
    let dir = tempfile::tempdir().expect("tempdir");
    let big = vec![b' '; RECORD_MAX_BYTES as usize + 1];
    let path = plant(dir.path(), "big.json", &big);
    assert_eq!(read_record(&path).err(), Some(RecordError::TooLarge));
    assert!(path.exists());
}

#[cfg(unix)]
#[test]
fn the_reader_refuses_a_record_readable_by_others() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempfile::tempdir().expect("tempdir");
    let path = plant(
        dir.path(),
        "open.json",
        &serde_json::to_vec(&sample()).expect("json"),
    );
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).expect("mode");
    assert_eq!(read_record(&path).err(), Some(RecordError::Insecure));
    assert!(path.exists());
}

#[test]
fn the_reader_refuses_an_unknown_field() {
    let dir = tempfile::tempdir().expect("tempdir");
    let mut value = serde_json::to_value(sample()).expect("value");
    value["surprise"] = serde_json::json!(true);
    let path = plant(
        dir.path(),
        "extra.json",
        &serde_json::to_vec(&value).expect("json"),
    );
    assert_eq!(read_record(&path).err(), Some(RecordError::Decode));
    assert!(path.exists());
}

#[test]
fn the_reader_refuses_a_wrong_version() {
    let dir = tempfile::tempdir().expect("tempdir");
    let mut value = serde_json::to_value(sample()).expect("value");
    value["version"] = serde_json::json!(2);
    let path = plant(
        dir.path(),
        "v2.json",
        &serde_json::to_vec(&value).expect("json"),
    );
    assert_eq!(read_record(&path).err(), Some(RecordError::Version));
    // A removal takes a regular file only: the one computed path, never a folder.
    assert!(remove_record(&path).is_ok());
    assert_eq!(remove_record(dir.path()), Err(RecordError::NotRegular));
    assert!(dir.path().exists());
}

// ---------------------------------------------------------------------------------------------
// The five launch sites find their funnel session
// ---------------------------------------------------------------------------------------------

fn begin(ctx: &LaunchCtx, home: &FakeHome, runner: RunnerName, app: &str) -> SessionGuard {
    ctx.sessions.begin(SessionFacts {
        runner,
        app_name: app.to_string(),
        launch_started_at_ms: 10,
        start_playing_at_ms: 20,
        after_script: None,
        record_path: record_path(&app_folder(home), runner, app),
        on_quit: None,
    })
}

/// The call a store launch site makes, with only the identity fields set the way the site sets them.
fn site_call(
    runner: RunnerName,
    abort_id: Option<&str>,
    track_key: Option<&str>,
    stub_args: &[&str],
) -> RunnerCallArgs {
    RunnerCallArgs {
        stream_id: String::new(),
        command_parts: stub_args.iter().map(|a| (*a).to_string()).collect(),
        runner: RunnerProps {
            name: runner,
            bin: STUB.to_string(),
            dir: None,
            log_prefix: "Backend".to_string(),
        },
        env: Default::default(),
        wrappers: Vec::new(),
        log_message_prefix: None,
        log_targets: Vec::new(),
        log_sanitizer: None,
        abort_id: abort_id.map(str::to_string),
        track_key: track_key.map(str::to_string),
        cwd: None,
        skip_error_handler: false,
        observe: true,
        spawn_class: SpawnClassArg::Game,
    }
}

/// Runs one call of a launch site under a session of the funnel's runner and proves the record is written for
/// that very game while it runs, and not for any other session.
async fn a_site_finds_its_session(
    runner: RunnerName,
    abort_id: Option<&str>,
    track_key: Option<&str>,
) {
    let home = FakeHome::new("readopt-site-");
    let ctx = ctx_over(&home);
    let mut strays = Strays(Vec::new());
    let app = "siteapp";
    let _own = begin(&ctx, &home, runner, app);
    // A session of another game never gets this run's record.
    let _other = begin(&ctx, &home, runner, "otherapp");
    let pids_file = home.root().join("pids.txt");
    let pids = pids_file.to_string_lossy().into_owned();
    let call = site_call(
        runner,
        abort_id,
        track_key,
        &["game", "--pids", &pids, "--exit-after-ms", "1200"],
    );
    let run = {
        let ctx = ctx.clone();
        tokio::spawn(async move {
            let host = RunnerHost {
                env: BTreeMap::new(),
                path: String::new(),
            };
            call_runner(&ctx, call, &host, Arc::new(NullSink)).await
        })
    };
    let path = record_path(&app_folder(&home), runner, app);
    wait_async("the site's record", || read_record(&path).is_ok()).await;
    let pid = first_pid(&pids_file).await;
    strays.add(pid);
    let record = read_record(&path).expect("record");
    assert_eq!(record.pid, pid, "{runner:?}: the record names this game");
    assert_eq!(record.runner, runner.as_str());
    assert_eq!(record.app_name, app);
    assert!(
        !record_path(&app_folder(&home), runner, "otherapp").exists(),
        "{runner:?}: another session's record was written"
    );
    let result = tokio::time::timeout(LIMIT, run)
        .await
        .expect("the run settles")
        .expect("task");
    assert_eq!(result.error, None);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_legendary_site_finds_its_session() {
    // `runRunnerCommand(command, { abortId: this.appName, spawnClass: 'game' })`: no trackKey.
    a_site_finds_its_session(RunnerName::Legendary, Some("siteapp"), None).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_gog_site_finds_its_session() {
    // `runRunnerCommand(commandParts, { abortId: this.id, spawnClass: 'game' })`: no trackKey.
    a_site_finds_its_session(RunnerName::Gog, Some("siteapp"), None).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_nile_site_finds_its_session() {
    // `runRunnerCommand(commandParts, { abortId: this.id, spawnClass: 'game' })`: no trackKey.
    a_site_finds_its_session(RunnerName::Nile, Some("siteapp"), None).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_sideload_native_site_finds_its_session() {
    // `callRunner(extraArgs, { name: runner, ... }, { trackKey: appName, spawnClass: 'game' })`: no abortId.
    a_site_finds_its_session(RunnerName::Sideload, None, Some("siteapp")).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_sideload_wine_site_finds_its_session() {
    // `runWineCommand({ options: { trackKey: appName, spawnClass: 'game' } })` registers under the runner `wine`.
    let home = FakeHome::new("readopt-wine-site-");
    let ctx = ctx_over(&home);
    let mut strays = Strays(Vec::new());
    let app = "siteapp";
    let _own = begin(&ctx, &home, RunnerName::Sideload, app);
    let pids_file = home.root().join("pids.txt");
    let prepared = PreparedWine {
        program: STUB.to_string(),
        argv: vec![
            "game".to_string(),
            "--pids".to_string(),
            pids_file.to_string_lossy().into_owned(),
            "--exit-after-ms".to_string(),
            "1200".to_string(),
        ],
        env: Vec::new(),
        cwd: None,
        header_bin: STUB.to_string(),
        header_parts: String::new(),
        debug_parts: Vec::new(),
        wineserver: None,
        wait: false,
        wine_prefix: String::new(),
    };
    let run = {
        let ctx = ctx.clone();
        tokio::spawn(async move { run_prepared_game_for_test(&ctx, &prepared, app).await })
    };
    let path = record_path(&app_folder(&home), RunnerName::Sideload, app);
    wait_async("the wine site's record", || read_record(&path).is_ok()).await;
    let pid = first_pid(&pids_file).await;
    strays.add(pid);
    let record = read_record(&path).expect("record");
    assert_eq!(record.pid, pid);
    assert_eq!(record.runner, "sideload", "the funnel's runner, not `wine`");
    assert_eq!(record.app_name, app);
    tokio::time::timeout(LIMIT, run)
        .await
        .expect("the run settles")
        .expect("task");
}

// ---------------------------------------------------------------------------------------------
// The member snapshot when the leader exits and its group lives (Pitfall 10, D-31)
// ---------------------------------------------------------------------------------------------

#[cfg(unix)]
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_record_keeps_the_members_when_the_leader_exits_and_its_child_lives() {
    let home = FakeHome::new("readopt-members-");
    let ctx = ctx_over(&home);
    let mut strays = Strays(Vec::new());
    let app = "siteapp";
    let _own = begin(&ctx, &home, RunnerName::Sideload, app);
    let pids_file = home.root().join("pids.txt");
    let pids = pids_file.to_string_lossy().into_owned();
    // The leader exits after 400 ms; its child (the Wine loader's game) lives for 3 s.
    let call = site_call(
        RunnerName::Sideload,
        None,
        Some(app),
        &[
            "game",
            "--pids",
            &pids,
            "--child",
            "--child-exit-ms",
            "3000",
            "--exit-after-ms",
            "400",
        ],
    );
    let run = {
        let ctx = ctx.clone();
        tokio::spawn(async move {
            let host = RunnerHost {
                env: BTreeMap::new(),
                path: String::new(),
            };
            call_runner(&ctx, call, &host, Arc::new(NullSink)).await
        })
    };
    let path = record_path(&app_folder(&home), RunnerName::Sideload, app);
    wait_async("the record", || read_record(&path).is_ok()).await;
    // The record starts with no members; the rewrite after the leader's exit names the child.
    let pids_text = loop {
        if let Ok(text) = std::fs::read_to_string(&pids_file) {
            if text.lines().count() == 2 {
                break text;
            }
        }
        tokio::time::sleep(POLL).await;
    };
    let game: Vec<u32> = pids_text
        .lines()
        .filter_map(|l| l.trim().parse().ok())
        .collect();
    strays.add(game[0]);
    strays.add(game[1]);
    let child_stamp = probe::start_time(game[1]).expect("the child's stamp");
    wait_async("the member list to name the child", || {
        read_record(&path).is_ok_and(|r| {
            r.members
                == vec![RecordMember {
                    pid: game[1],
                    stamp: child_stamp,
                }]
        })
    })
    .await;
    let record = read_record(&path).expect("record");
    assert_eq!(record.pid, game[0], "the leader is still the recorded one");
    assert_eq!(record.state, RecordState::Running);
    tokio::time::timeout(LIMIT, run)
        .await
        .expect("the run settles")
        .expect("task");
}

// ---------------------------------------------------------------------------------------------
// 88.3-09, the boot scan: what it adopts, what it refuses, what it owes (D-08, D-31)
// ---------------------------------------------------------------------------------------------

/// The `gamelib.log` lines a context's sink was given, and the per-game log's.
#[derive(Default)]
struct Lines {
    general: Mutex<Vec<String>>,
}

impl Lines {
    fn general(&self) -> Vec<String> {
        lock(&self.general).clone()
    }
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl LaunchLogSink for Lines {
    fn stamp(&self) -> (u64, i32) {
        (0, 0)
    }
    fn submit(&self, _batches: Vec<TargetBatch>) {}
    fn general(&self, _prefix: Prefix, _level: Level, msg: &str) {
        lock(&self.general).push(msg.to_string());
    }
}

/// What the renderer was pushed.
#[derive(Default)]
struct Pushed(Mutex<Vec<(String, Vec<serde_json::Value>)>>);

impl Pushed {
    /// The `gameStatusUpdate` payloads, in order.
    fn statuses(&self) -> Vec<serde_json::Value> {
        lock(&self.0)
            .iter()
            .filter(|(channel, _)| channel == "gameStatusUpdate")
            .flat_map(|(_, args)| args.clone())
            .collect()
    }
}

impl FrontendEmitter for Pushed {
    fn emit(&self, channel: &str, args: Vec<serde_json::Value>) {
        lock(&self.0).push((channel.to_string(), args));
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("clock")
        .as_millis() as u64
}

/// A program that writes `marker` and nothing else, and needs no environment on unix.
fn marker_script(dir: &Path, marker: &Path) -> PathBuf {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let script = dir.join("after.sh");
        std::fs::write(&script, format!("#!/bin/sh\n: > '{}'\n", marker.display()))
            .expect("script");
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).expect("mode");
        script
    }
    #[cfg(windows)]
    {
        let script = dir.join("after.bat");
        std::fs::write(
            &script,
            format!("@echo off\r\necho done> \"{}\"\r\n", marker.display()),
        )
        .expect("script");
        script
    }
}

fn script_host() -> RunnerHost {
    let env = if cfg!(windows) {
        ["SystemRoot", "ComSpec", "PATH"]
            .iter()
            .filter_map(|name| std::env::var(name).ok().map(|v| ((*name).to_string(), v)))
            .collect()
    } else {
        BTreeMap::new()
    };
    RunnerHost {
        env,
        path: String::new(),
    }
}

fn after_script(script: &Path, app: &str) -> ScriptRunArgs {
    ScriptRunArgs {
        script_path: script.to_string_lossy().into_owned(),
        stage: ScriptStage::After,
        app_name: app.to_string(),
        executable: None,
        prefix: None,
        runner: "sideload".to_string(),
        title: app.to_string(),
        install_path: None,
        settings_json: "{}".to_string(),
        info_json: "{}".to_string(),
        verbose: false,
        log_target: None,
    }
}

/// A running record for `app` as the funnel writes it.
fn running_record(app: &str, pid: u32, stamp: u64) -> LaunchRecord {
    let now = now_ms();
    LaunchRecord {
        version: RECORD_VERSION,
        runner: "sideload".to_string(),
        app_name: app.to_string(),
        pid,
        stamp,
        pgid: pid,
        members: Vec::new(),
        launch_started_at_ms: now.saturating_sub(5_000),
        start_playing_at_ms: now.saturating_sub(4_000),
        state: RecordState::Running,
        killed_at_ms: None,
        after_script: None,
    }
}

fn write_record(home: &FakeHome, record: &LaunchRecord) -> PathBuf {
    let path = record_path(&app_folder(home), RunnerName::Sideload, &record.app_name);
    write_atomic(&path, record).expect("the record is written");
    path
}

/// The stub as a game of its own session that idles until it is ended, with its handle kept by the caller (the
/// record names the game, and the test, not a funnel, is its parent). Its leader and stamp are the proof.
fn spawn_idle_game(home: &FakeHome, strays: &mut Strays) -> (GameHandle, u32, u64) {
    let mut cmd = std::process::Command::new(STUB);
    cmd.arg("idle")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    home.apply(&mut cmd);
    let handle = spawn_game_tracked(cmd, None).expect("spawn the idle game");
    let (pid, stamp) = (handle.pid, handle.stamp.expect("the game's start stamp"));
    strays.add(pid);
    (handle, pid, stamp)
}

/// The pid of a program that has already exited and been reaped.
fn dead_pid() -> u32 {
    let mut child = std::process::Command::new(STUB)
        .arg("exit")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .expect("spawn exit");
    let pid = child.id();
    child.wait().expect("reap");
    pid
}

/// What the timestamp store holds for `app` under `key`.
fn stored(home: &FakeHome, app: &str, key: &str) -> Option<serde_json::Value> {
    let text = std::fs::read_to_string(
        home.root()
            .join("userdata")
            .join("store")
            .join("timestamp.json"),
    )
    .ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    value.pointer(&format!("/{app}/{key}")).cloned()
}

fn lines_with(lines: &Lines, needle: &str) -> usize {
    lines
        .general()
        .iter()
        .filter(|line| line.contains(needle))
        .count()
}

/// T-88.3-20: a record whose pid is alive with another start stamp is some other process now. It is removed and
/// nothing is signalled, the named process included.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_record_whose_pid_is_alive_with_another_stamp_is_removed_and_nothing_is_signalled() {
    let home = FakeHome::new("readopt-wrongstamp-");
    let ctx = ctx_over(&home);
    let mut strays = Strays(Vec::new());
    let (_handle, pid, stamp) = spawn_idle_game(&home, &mut strays);
    let path = write_record(&home, &running_record("stubapp", pid, stamp + 1));

    let report = start(&ctx);
    assert_eq!(
        (
            report.adopted,
            report.removed,
            report.owed_scripts,
            report.skipped
        ),
        (0, 1, 0, 0)
    );
    assert!(!path.exists(), "the record of another process is removed");
    assert!(!ctx.registry.games_running());
    // Not signalled: the process the record named is still running, with its own stamp.
    tokio::time::sleep(Duration::from_millis(500)).await;
    assert!(probe::is_alive(pid), "the named process was signalled");
    assert_eq!(probe::start_time(pid), Some(stamp));
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_record_whose_game_is_gone_is_removed_without_playtime() {
    let home = FakeHome::new("readopt-gone-");
    let ctx = ctx_over(&home);
    let path = write_record(&home, &running_record("stubapp", dead_pid(), 12345));

    let report = start(&ctx);
    assert_eq!((report.adopted, report.removed), (0, 1));
    assert!(!path.exists());
    assert!(!ctx.registry.games_running());
    assert_eq!(stored(&home, "stubapp", "lastPlayed"), None);
    assert_eq!(stored(&home, "stubapp", "totalPlayed"), None);
}

/// D-31: a launch the quit ended owes its after script to the next start. It runs there, bounded and held by a
/// registrant, records no second play time, and the record goes.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_quit_killed_record_runs_its_after_script_at_boot_then_is_removed() {
    let home = FakeHome::new("readopt-owed-");
    let ctx = ctx_over(&home);
    let marker = home.root().join("owed-ran.txt");
    let script = marker_script(home.root(), &marker);
    let mut record = running_record("stubapp", dead_pid(), 12345);
    record.state = RecordState::QuitKilled;
    record.killed_at_ms = Some(now_ms());
    record.after_script = Some(after_script(&script, "stubapp"));
    let path = write_record(&home, &record);

    let report = start_with_host(&ctx, &script_host());
    assert_eq!(
        (report.adopted, report.owed_scripts, report.skipped),
        (0, 1, 0)
    );
    wait_async("the owed after script to run", || marker.exists()).await;
    wait_async("the record to be removed after the script", || {
        !path.exists()
    })
    .await;
    assert_eq!(
        stored(&home, "stubapp", "lastPlayed"),
        None,
        "a second play time was recorded"
    );
    assert!(!ctx.registry.games_running());
    // Its registrants are gone with it: nothing is left for the exit to wait for.
    assert_eq!(
        ctx.engine.shutdown.drain(Duration::from_secs(2)),
        Vec::<&'static str>::new()
    );
}

/// T-88.3-21: a boot reads at most 64 records and stops at its deadline; the rest stay on disk with one line.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_boot_scan_stops_at_its_record_cap_and_its_deadline() {
    let home = FakeHome::new("readopt-cap-");
    let lines = Arc::new(Lines::default());
    let ctx = ctx_over(&home).with_log_sink(lines.clone());
    let gone = dead_pid();
    for n in 0..100 {
        write_record(&home, &running_record(&format!("app-{n:03}"), gone, 12345));
    }
    let launches = app_folder(&home).join("launches");
    let json_files = || {
        std::fs::read_dir(&launches)
            .expect("launches")
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().ends_with(".json"))
            .count()
    };
    assert_eq!(json_files(), 100);

    // The cap: 64 read (each a gone game, so removed), 36 left, one line.
    let report = start(&ctx);
    assert_eq!(READOPT_RECORD_CAP, 64);
    assert_eq!((report.removed, report.skipped), (64, 36), "{report:?}");
    assert_eq!(json_files(), 36);
    assert_eq!(
        lines_with(&lines, "left 36 launch records for the next start"),
        1
    );

    // The deadline: a boot that has no time left reads none and leaves them all, with one more line.
    let report = start_bounded(&ctx, &RunnerHost::default(), 64, Duration::ZERO);
    assert_eq!((report.removed, report.skipped), (0, 36), "{report:?}");
    assert_eq!(json_files(), 36);
    assert_eq!(
        lines_with(&lines, "left 36 launch records for the next start"),
        2
    );
}

/// A file the scan cannot read as a record is removed only when it is a regular file of the current user's; a
/// link or a folder named like a record is left alone and nothing behind the link is touched.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn an_invalid_record_is_removed_only_when_it_is_a_regular_file_of_ours() {
    let home = FakeHome::new("readopt-invalid-");
    let lines = Arc::new(Lines::default());
    let ctx = ctx_over(&home).with_log_sink(lines.clone());
    let launches = app_folder(&home).join("launches");
    std::fs::create_dir_all(&launches).expect("launches");

    // Ours and regular: garbage, a record filed under another name, and (unix) a readable-by-others record.
    let garbage = plant(&launches, "sideload-garbage.json", b"{ not json");
    let misfiled = launches.join("sideload-misfiled.json");
    write_atomic(&misfiled, &running_record("elsewhere", dead_pid(), 1)).expect("misfiled");
    #[cfg(unix)]
    let loose = {
        use std::os::unix::fs::PermissionsExt;
        let path = launches.join("sideload-loose.json");
        write_atomic(&path, &running_record("loose", dead_pid(), 1)).expect("loose");
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).expect("mode");
        path
    };

    // Not removed: a symlink (its target is untouched) and a directory.
    let victim = home.root().join("victim.txt");
    std::fs::write(&victim, b"keep").expect("victim");
    #[cfg(unix)]
    let link = {
        let path = launches.join("sideload-link.json");
        std::os::unix::fs::symlink(&victim, &path).expect("symlink");
        path
    };
    let folder = launches.join("sideload-folder.json");
    std::fs::create_dir(&folder).expect("folder");

    let report = start(&ctx);
    let removed_files = if cfg!(unix) { 3 } else { 2 };
    let left = if cfg!(unix) { 2 } else { 1 };
    assert_eq!(
        (report.adopted, report.removed, report.skipped),
        (0, removed_files, left),
        "{report:?}"
    );
    assert!(!garbage.exists(), "garbage of ours is removed");
    assert!(
        !misfiled.exists(),
        "a record under the wrong name is removed"
    );
    #[cfg(unix)]
    {
        assert!(
            !loose.exists(),
            "a record of ours readable by others is removed"
        );
        assert!(link.symlink_metadata().is_ok(), "the link was removed");
    }
    assert_eq!(std::fs::read(&victim).expect("victim"), b"keep");
    assert!(folder.is_dir(), "the folder was removed");
    assert_eq!(lines_with(&lines, "refused and left in place"), left);
}

/// A game adopted at boot is in the registry: a manager's Stop (`kill_tracked`) ends it through its proof, its
/// session finishes like a live one's (play time, the after script, the record removed).
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_stop_of_an_adopted_game_ends_it_through_its_proof() {
    let home = FakeHome::new("readopt-stop-");
    let ctx = ctx_over(&home);
    let mut strays = Strays(Vec::new());
    let marker = home.root().join("stop-ran.txt");
    let script = marker_script(home.root(), &marker);
    let (_handle, pid, stamp) = spawn_idle_game(&home, &mut strays);
    let mut record = running_record("stubapp", pid, stamp);
    record.after_script = Some(after_script(&script, "stubapp"));
    let path = write_record(&home, &record);

    let report = start_with_host(&ctx, &script_host());
    assert_eq!(report.adopted, 1, "{report:?}");
    assert!(ctx.registry.games_running(), "the quit dialog would ask");
    assert!(probe::is_alive(pid));

    let stopped = ctx
        .registry
        .kill_tracked(&ctx.engine.shutdown, Some("sideload"), Some("stubapp"))
        .await;
    assert_eq!(stopped, 1);
    wait_async("the game to end", || !probe::is_alive(pid)).await;
    wait_async("the session to finish", || {
        !ctx.registry.games_running() && !path.exists() && ctx.sessions.is_empty()
    })
    .await;
    // A Stop is not the quit: play time and the after script, as at the end of a live launch.
    assert!(stored(&home, "stubapp", "lastPlayed").is_some());
    wait_async("the after script", || marker.exists()).await;
}

/// D-31 for a re-adopted game: the quit's kill (`kill_all`) records play time at the kill, marks the record
/// `quitKilled` and leaves the after script owed.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_quit_kill_of_an_adopted_game_records_playtime_at_the_kill() {
    let home = FakeHome::new("readopt-quit-");
    let ctx = ctx_over(&home);
    let mut strays = Strays(Vec::new());
    let marker = home.root().join("quit-ran.txt");
    let script = marker_script(home.root(), &marker);
    let (_handle, pid, stamp) = spawn_idle_game(&home, &mut strays);
    let mut record = running_record("stubapp", pid, stamp);
    record.after_script = Some(after_script(&script, "stubapp"));
    let path = write_record(&home, &record);

    assert_eq!(start_with_host(&ctx, &script_host()).adopted, 1);
    let t0 = now_ms();
    let killed = ctx.registry.kill_all(&ctx.engine.shutdown).await;
    let t1 = now_ms();
    assert_eq!(killed, 1);
    wait_async("the game to end", || !probe::is_alive(pid)).await;
    wait_async("the watch to finish", || {
        !ctx.registry.games_running() && ctx.sessions.is_empty()
    })
    .await;

    let kept = read_record(&path).expect("the record is kept for the next start");
    assert_eq!(kept.state, RecordState::QuitKilled);
    let killed_at = kept.killed_at_ms.expect("the kill time");
    assert!(
        (t0..=t1).contains(&killed_at),
        "{killed_at} not in {t0}..={t1}"
    );
    assert!(kept.after_script.is_some(), "the script is still owed");
    assert_eq!(
        stored(&home, "stubapp", "lastPlayed"),
        Some(serde_json::json!(iso_string(killed_at))),
        "play time is recorded at the kill"
    );
    assert!(stored(&home, "stubapp", "totalPlayed").is_some());
    assert!(!marker.exists(), "the after script ran at the quit");
}

/// Pitfall 9: nothing is announced until the renderer listens; `announce` then says Playing for every adopted
/// game and marks the context, and a game adopted after that is announced as it is adopted.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn announce_sends_playing_for_every_adopted_game_and_later_adoptions_at_once() {
    let home = FakeHome::new("readopt-announce-");
    let pushed = Arc::new(Pushed::default());
    let ctx = ctx_with(&home, Some(pushed.clone()));
    let mut strays = Strays(Vec::new());
    let (_a, pid_a, stamp_a) = spawn_idle_game(&home, &mut strays);
    let (_b, pid_b, stamp_b) = spawn_idle_game(&home, &mut strays);
    write_record(&home, &running_record("first", pid_a, stamp_a));

    assert_eq!(start(&ctx).adopted, 1);
    assert!(
        pushed.statuses().is_empty(),
        "announced before the renderer listens: {:?}",
        pushed.statuses()
    );
    assert_eq!(announce(&ctx), 1);
    assert_eq!(
        pushed.statuses(),
        vec![serde_json::json!({ "appName": "first", "runner": "sideload", "status": "playing" })]
    );

    // A second start after the mark (a game adopted later) is announced at once, with no second `announce`.
    write_record(&home, &running_record("second", pid_b, stamp_b));
    assert_eq!(start(&ctx).adopted, 1);
    assert_eq!(
        pushed.statuses().last(),
        Some(
            &serde_json::json!({ "appName": "second", "runner": "sideload", "status": "playing" })
        )
    );
    assert_eq!(
        announce(&ctx),
        2,
        "both are announced again on the next frontendReady"
    );

    // Ended by the quit's kill, both leave the registry.
    assert_eq!(ctx.registry.kill_all(&ctx.engine.shutdown).await, 2);
    wait_async("both watches to finish", || !ctx.registry.games_running()).await;
}
