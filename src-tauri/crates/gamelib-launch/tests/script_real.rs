//! A launch script against a real child (88.2-13, D-21, D-22): the cases the scripted replay cannot show. A real
//! executable script is the program itself (empty argv, no shell), starts in the install folder with the
//! `HEROIC_GAME_*` block under the host environment, a non-zero exit still answers `true`, the output reaches
//! the game's log only with verbose logs on, a script that left a background process holding the pipes resolves
//! on its exit, and a script that cannot start answers an error.
//!
//! The child runs through `SpecProcRunner` (a `SpawnClass::Helper` tokio child) on a fresh `FakeHome`
//! environment, never the real profile (the app's real-profile arm is the host env the shell passes). Unix
//! only: the scripts are `/bin/sh`.
#![cfg(unix)]

mod common;

use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};

use common::*;
use gamelib_engine::ctx::Platform;
use gamelib_engine::testing::RecordingLog;
use gamelib_launch::runner::call_runner::RunnerHost;
use gamelib_launch::runner::script::{run_script_for_game, ScriptRunArgs, ScriptStage};
use gamelib_launch::runner::stream::LogHandOff;
use gamelib_log::frame::FrameTarget;
use gamelib_proc::SpecProcRunner;

fn script_at(dir: &Path, name: &str, body: &str) -> String {
    let path = dir.join(name);
    std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
    path.to_string_lossy().into_owned()
}

fn args(script: String, install: &Path, verbose: bool) -> ScriptRunArgs {
    ScriptRunArgs {
        script_path: script,
        stage: ScriptStage::Before,
        app_name: "real-app".into(),
        executable: Some("bin/game".into()),
        prefix: None,
        runner: "gog".into(),
        title: "Real".into(),
        install_path: Some(install.to_string_lossy().into_owned()),
        settings_json: "{\"a\":1}".into(),
        info_json: "{\"b\":\"ü\"}".into(),
        verbose,
        log_target: Some(LogHandOff {
            target: FrameTarget {
                kind: "game".into(),
                app_name: Some("real-app".into()),
                runner: Some("gog".into()),
                log_type: Some("launch".into()),
            },
            disabled: false,
            rotate: true,
        }),
    }
}

struct Setup {
    rig: Rig,
    sink: Arc<RecordingLogSink>,
    ctx: gamelib_launch::ctx::LaunchCtx,
    host: RunnerHost,
    install: std::path::PathBuf,
}

fn setup() -> Setup {
    let rig = Rig::new();
    let sink = Arc::new(RecordingLogSink::default());
    let ctx = rig
        .launch_ctx(
            Platform::Linux,
            Arc::new(SpecProcRunner),
            Arc::new(RecordingLog::new()),
        )
        .with_log_sink(sink.clone());
    let install = rig.root().join("Games").join("real app");
    std::fs::create_dir_all(&install).unwrap();
    let host = RunnerHost {
        env: rig.pinned_env(),
        path: String::new(),
    };
    Setup {
        rig,
        sink,
        ctx,
        host,
        install,
    }
}

fn raw_text(sink: &RecordingLogSink) -> String {
    lock(&sink.frames)
        .iter()
        .filter_map(|f| f["raw"].as_str())
        .collect()
}

#[test]
fn a_script_runs_in_the_install_folder_with_the_game_env_under_the_host_env_and_its_output_is_logged(
) {
    let s = setup();
    let script = script_at(
        s.rig.root(),
        "before.sh",
        "echo \"cwd=$(pwd) app=$HEROIC_GAME_APP_NAME stage=$HEROIC_GAME_SCRIPT_STAGE info=$HEROIC_GAME_INFO home=$HOME args=$#\"\necho warn >&2\nexit 2",
    );
    let answer = runtime().block_on(run_script_for_game(
        &s.ctx,
        args(script, &s.install, true),
        &s.host,
    ));
    // A non-zero exit is not a failure.
    assert_eq!(answer, Ok(true));
    let text = raw_text(&s.sink);
    let want_cwd = std::fs::canonicalize(&s.install).unwrap();
    assert!(
        text.contains(&format!("cwd={}", want_cwd.display())),
        "{text}"
    );
    assert!(
        text.contains("app=real-app stage=before info={\"b\":\"ü\"}"),
        "{text}"
    );
    // The script's HOME is the host env's: the fake profile here.
    assert!(
        text.contains(&format!("home={} args=0", s.rig.root().display())),
        "{text}"
    );
    assert!(text.contains("warn"), "{text}");
    assert!(lock(&s.sink.general).is_empty());
}

#[test]
fn a_quiet_script_writes_nothing_to_any_log() {
    let s = setup();
    let script = script_at(s.rig.root(), "quiet.sh", "echo loud");
    let answer = runtime().block_on(run_script_for_game(
        &s.ctx,
        args(script, &s.install, false),
        &s.host,
    ));
    assert_eq!(answer, Ok(true));
    assert!(lock(&s.sink.frames).is_empty());
}

#[test]
fn a_script_that_left_a_background_process_holding_the_pipes_resolves_on_its_exit() {
    let s = setup();
    let script = script_at(s.rig.root(), "bg.sh", "sleep 5 &\necho started");
    let started = Instant::now();
    let answer = runtime().block_on(run_script_for_game(
        &s.ctx,
        args(script, &s.install, true),
        &s.host,
    ));
    assert_eq!(answer, Ok(true));
    assert!(
        started.elapsed() < Duration::from_secs(4),
        "waited for the background process: {:?}",
        started.elapsed()
    );
}

#[test]
fn a_script_that_cannot_start_answers_an_error_and_a_verbose_run_writes_it_to_the_game_log() {
    let s = setup();
    let missing = s.rig.root().join("nope.sh").to_string_lossy().into_owned();
    let answer = runtime().block_on(run_script_for_game(
        &s.ctx,
        args(missing, &s.install, true),
        &s.host,
    ));
    let message = answer.expect_err("a missing script is an error");
    assert!(!message.is_empty());
    let frames = lock(&s.sink.frames).clone();
    assert_eq!(frames.len(), 1);
    assert_eq!(frames[0]["rotate"], true);
    assert_eq!(frames[0]["line"]["level"], "ERROR");
    assert!(lock(&s.sink.general).is_empty());
}
