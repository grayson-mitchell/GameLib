//! The direct Windows path refuses a batch file the way Node does (88.2-14, T-88.2-20): Node 18.20.2 and later (the
//! project needs 22) will not start a `.bat` or `.cmd` without a shell and throws `spawn EINVAL`, where
//! Rust's std would run it through cmd.exe and its argument rules. `windows_quoting.rs` proves the Node side on the
//! Windows leg; this file proves the Rust side on every host, by running the op as a Windows context over the
//! scripted spawn seam, so a refusal is told from a spawn by the seam's record.

mod common;

use std::sync::Arc;

use common::*;
use gamelib_engine::ctx::Platform;
use gamelib_engine::testing::RecordingLog;
use gamelib_launch::runner::call_runner::{call_runner, ExecResult, RunnerCallArgs, RunnerHost};
use gamelib_launch::runner::stream::NullSink;
use serde_json::json;

fn call(bin: &str, parts: &[&str], class: &str) -> RunnerCallArgs {
    serde_json::from_value(json!({
        "commandParts": parts,
        "runner": { "name": "sideload", "bin": bin, "dir": "C:\\Games", "logPrefix": "Sideload" },
        "abortId": "batch-test",
        "spawnClass": class,
        "skipErrorHandler": true,
    }))
    .expect("a call")
}

/// Runs `args` as a Windows context; answers the result and how many spawns the seam saw.
fn run(platform: Platform, path: &str, args: RunnerCallArgs) -> (ExecResult, usize) {
    let rig = Rig::new();
    let runner = Arc::new(CaseRunner::new(vec![Step::default()]));
    let ctx = rig
        .launch_ctx(platform, runner.clone(), Arc::new(RecordingLog::new()))
        .with_log_sink(Arc::new(RecordingLogSink::default()));
    let host = RunnerHost {
        env: rig.pinned_env(),
        path: path.to_string(),
    };
    let result = runtime().block_on(call_runner(&ctx, args, &host, Arc::new(NullSink)));
    let spawns = lock(&runner.specs).len();
    (result, spawns)
}

#[test]
fn a_batch_file_is_refused_with_nodes_text_and_never_spawned() {
    for bin in ["echo.bat", "echo.cmd", "ECHO.BAT", "Setup.Cmd"] {
        let (result, spawns) = run(Platform::Windows, "", call(bin, &["a b", "c"], "helper"));
        assert_eq!(result.error.as_deref(), Some("spawn EINVAL"), "{bin}");
        assert_eq!(result.stderr, "spawn EINVAL");
        assert_eq!(result.abort, None, "a refusal is an error, not an abort");
        assert_eq!(spawns, 0, "{bin} reached the spawn seam");
    }
}

#[test]
fn a_batch_file_is_refused_for_a_game_run_too() {
    let (result, spawns) = run(Platform::Windows, "", call("run.cmd", &[], "game"));
    assert_eq!(result.error.as_deref(), Some("spawn EINVAL"));
    assert_eq!(spawns, 0);
}

#[test]
fn an_executable_is_not_refused() {
    let (result, spawns) = run(Platform::Windows, "", call("echo.exe", &["x"], "helper"));
    assert_eq!(spawns, 1);
    assert!(result.error.is_none(), "{result:?}");
}

#[test]
fn only_windows_refuses() {
    // Off Windows a `.bat` is a file with an odd name, never a batch file: no refusal.
    let (result, spawns) = run(Platform::Linux, "", call("echo.bat", &[], "helper"));
    assert_eq!(spawns, 1);
    assert!(result.error.is_none(), "{result:?}");
}

#[test]
fn the_powershell_form_runs_a_batch_file_so_it_is_not_refused() {
    // `Start-Process` starts a batch file; the program here is `powershell`, with the batch file in its argument
    // string. The probe looks for `powershell.exe` in the host's `PATH`.
    let dir = Rig::new();
    let bin = dir.root().join("bin");
    std::fs::create_dir_all(&bin).unwrap();
    std::fs::write(bin.join("powershell.exe"), b"").unwrap();
    let path = bin.to_string_lossy().into_owned();
    let (result, spawns) = run(Platform::Windows, &path, call("echo.bat", &["x"], "helper"));
    assert_eq!(spawns, 1, "{result:?}");
    assert!(result.error.is_none(), "{result:?}");
}
