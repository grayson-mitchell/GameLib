//! The Linux stub-gamescope smoke (88.1 SC3, D-13): stub `gamescope` scripts on a FakeHome `PATH`, found
//! through `find_on_path`, probed through the real `SpecProcRunner` (a `gamelib-proc` Helper spawn) and
//! turned into the built command. It pins the three forms of the probe end to end: the new CLI, the old
//! CLI and a help that never ends.
//!
//! The goldens replay the probe over a scripted runner; this is the one place the real spawn seam, the
//! 5 s bound and the reaping of a cut-off child are exercised. One test function runs the three stubs in
//! turn: a script written and executed while another thread forks races `ETXTBSY` on Linux.

#![cfg(target_os = "linux")]

use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use gamelib_launch::builders::gamescope::{
    build_gamescope_command, probe_gamescope_help, GamescopeSettings,
};
use gamelib_proc::probe::is_alive;
use gamelib_proc::spec::SpecProcRunner;
use gamelib_testutil::FakeHome;
use gamelib_wine::wine_cmd::command::find_on_path;
use gamelib_wine::wine_cmd::env::EnvSnapshot;
use gamelib_wine::wine_cmd::WineHost;
use serde_json::json;

const LIMIT: Duration = Duration::from_secs(15);
const POLL: Duration = Duration::from_millis(50);

/// Polls `pred` until it holds or `LIMIT` passes; never a fixed wait.
fn wait_until(what: &str, mut pred: impl FnMut() -> bool) {
    let deadline = Instant::now() + LIMIT;
    while !pred() {
        assert!(Instant::now() < deadline, "timed out waiting for: {what}");
        std::thread::park_timeout(POLL);
    }
}

/// Writes an executable `gamescope` stub with `body` into its own `bin` directory under the fake HOME
/// and returns that directory.
fn stub(home: &FakeHome, name: &str, body: &str) -> PathBuf {
    let bin = home.root().join("stubs").join(name).join("bin");
    std::fs::create_dir_all(&bin).unwrap();
    let script = bin.join("gamescope");
    std::fs::write(&script, format!("#!/bin/sh\n{body}\n")).unwrap();
    std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
    bin
}

/// The host facts with `bin` as the whole `PATH`: only that stub can be found.
fn host_with_path(bin: &Path) -> WineHost {
    WineHost {
        env: EnvSnapshot::from_pairs([("PATH", bin.to_string_lossy().into_owned())]),
        ..WineHost::default()
    }
}

fn fsr_settings() -> GamescopeSettings {
    serde_json::from_value(json!({"enableUpscaling": true, "upscaleMethod": "fsr"})).unwrap()
}

/// Finds `gamescope` on `bin`, probes it for real and builds the command from what it printed.
async fn probe_and_build(bin: &Path) -> (String, Vec<String>) {
    let found = find_on_path("gamescope", &host_with_path(bin)).expect("the stub is on the PATH");
    assert_eq!(found, bin.join("gamescope"));
    let program = found.to_string_lossy().into_owned();
    let help = probe_gamescope_help(&SpecProcRunner, &program).await;
    let argv = build_gamescope_command(&program, &fsr_settings(), &help, false).unwrap();
    (help, argv)
}

#[tokio::test(flavor = "multi_thread")]
async fn a_stub_gamescope_builds_the_new_cli_the_old_cli_and_the_timeout_form() {
    let home = FakeHome::new("launch-stub-gamescope-");

    // New CLI: the help text lists `-F, --filter`.
    let new_bin = stub(&home, "new", "echo 'usage ... -F, --filter ...' >&2");
    let (help, argv) = probe_and_build(&new_bin).await;
    assert!(help.contains("-F, --filter"), "{help:?}");
    assert_eq!(argv[1..], ["-F", "fsr", "--"], "{argv:?}");

    // Old CLI: no `-F, --filter` in the help text.
    let old_bin = stub(&home, "old", "echo 'usage ... -U, --fsr-upscaling' >&2");
    let (help, argv) = probe_and_build(&old_bin).await;
    assert!(!help.contains("-F, --filter"), "{help:?}");
    assert_eq!(argv[1..], ["-U", "--"], "{argv:?}");

    // A help that never ends: cut off at the 5 s bound, answered '' (the old-CLI form), and reaped.
    let pid_file = home.root().join("slow.pid");
    let slow_bin = stub(
        &home,
        "slow",
        &format!("echo $$ > '{}'\nexec sleep 30", pid_file.display()),
    );
    let started = Instant::now();
    let (help, argv) = probe_and_build(&slow_bin).await;
    let took = started.elapsed();
    assert_eq!(help, "");
    assert_eq!(argv[1..], ["-U", "--"], "{argv:?}");
    assert!(
        took >= Duration::from_secs(4),
        "the probe returned early: {took:?}"
    );
    assert!(took < LIMIT, "the probe was not bounded: {took:?}");
    let pid: u32 = std::fs::read_to_string(&pid_file)
        .expect("the slow stub wrote its pid")
        .trim()
        .parse()
        .unwrap();
    wait_until("the cut-off stub to be gone", || !is_alive(pid));
}
