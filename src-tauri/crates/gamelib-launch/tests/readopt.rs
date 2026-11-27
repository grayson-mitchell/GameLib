//! The launch record and the funnel session it hangs on (88.3-07, D-08): the reader's refusals, the five launch
//! sites finding their funnel session from the `{ runner, key }` they register under, and the member snapshot a
//! Wine-shaped launch (the leader exits, the group lives) keeps in its record.
//!
//! Every run is on a fresh `FakeHome`; every wait polls to a deadline.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform as InfoPlatform};
use gamelib_info::http::ReqwestHttp;
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_launch::ctx::LaunchCtx;
use gamelib_launch::funnel::session::{SessionFacts, SessionGuard};
use gamelib_launch::game::record::{
    read_record, record_path, remove_record, write_atomic, LaunchRecord, RecordError, RecordMember,
    RecordState, RECORD_MAX_BYTES, RECORD_VERSION,
};
use gamelib_launch::runner::call_runner::{
    call_runner, RunnerCallArgs, RunnerHost, RunnerProps, SpawnClassArg,
};
use gamelib_launch::runner::stream::NullSink;
use gamelib_launch::runner::wine_command::run_prepared_game_for_test;
use gamelib_launch::runner::RunnerName;
use gamelib_proc::kill_tree::kill_game_tree;
use gamelib_proc::probe;
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
    let root = home.root();
    let app_folder = app_folder(home);
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
