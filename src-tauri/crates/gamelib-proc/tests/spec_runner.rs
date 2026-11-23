//! `SpecProcRunner` against real children: env and replace_env reach the child, the working
//! directory is honoured, stdin text is read, a timeout and a cancel kill the child (and, on unix,
//! what it started), a 2 MiB output under a 1 MiB cap is truncated, and `on_line` sees each line.
//! Every child's environment is built from a `FakeHome` (convention 2), except the one named
//! real-profile arm below.

use gamelib_core::process::{ProcSpec, SpecRunner};
use gamelib_proc::{global, SpecProcRunner};
use gamelib_testutil::FakeHome;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;

/// A shell one-liner: `/bin/sh -c` on unix, `cmd /C` on Windows.
fn shell(label: &'static str, unix: &str, windows: &str) -> ProcSpec {
    if cfg!(windows) {
        let mut spec = ProcSpec::new(label, "cmd");
        spec.argv = vec!["/C".into(), windows.into()];
        spec
    } else {
        let mut spec = ProcSpec::new(label, "/bin/sh");
        spec.argv = vec!["-c".into(), unix.into()];
        spec
    }
}

fn sleeper(label: &'static str) -> ProcSpec {
    if cfg!(windows) {
        let mut spec = ProcSpec::new(label, "ping");
        spec.argv = vec!["-n".into(), "30".into(), "127.0.0.1".into()];
        spec
    } else {
        let mut spec = ProcSpec::new(label, "/bin/sleep");
        spec.argv = vec!["30".into()];
        spec
    }
}

fn lines(text: &str) -> Vec<String> {
    text.lines().map(|l| l.trim().to_string()).collect()
}

fn fake_env(home: &FakeHome) -> Vec<(String, String)> {
    home.env()
        .into_iter()
        .map(|(k, v)| (k.to_string(), v.to_string_lossy().into_owned()))
        .collect()
}

#[tokio::test]
async fn env_reaches_the_child_and_replace_env_drops_the_rest() {
    let home = FakeHome::new("gamelib-spec-env");
    let mut spec = shell(
        "spec-test-env",
        r#"echo "$GL_SPEC_A"; echo "$HOME"; echo "${USER-unset}""#,
        "echo %GL_SPEC_A%& echo %USERPROFILE%& echo %GL_SPEC_UNSET%",
    );
    spec.env = fake_env(&home);
    spec.env.push(("GL_SPEC_A".into(), "one".into()));
    spec.replace_env = true;
    let out = SpecProcRunner.run(spec, None).await;
    assert_eq!(out.code, Some(0), "{out:?}");
    let got = lines(&out.stdout);
    assert_eq!(got[0], "one");
    assert_eq!(
        std::fs::canonicalize(&got[1]).expect("HOME is a real path"),
        std::fs::canonicalize(home.root()).expect("profile root")
    );
    // With replace_env the operator's USER (set on every unix CI leg and dev box) is not inherited.
    if cfg!(unix) {
        assert_eq!(got[2], "unset");
    }
}

/// With replace_env off the child sees exactly the variables a bare `Command` would, which is
/// the environment of the process running this test. Real-profile arm (convention 2): the child
/// inherits the operator's `HOME`, which is the defect this flag exists to avoid, and the arm only
/// reads it. It proves inheritance is the default without leaning on a variable of our own.
#[tokio::test]
async fn without_replace_env_the_child_inherits_the_parent_environment() {
    let (var, unix, windows) = ("HOME", r#"echo "$HOME""#, "echo %USERPROFILE%");
    let want = std::env::var(if cfg!(windows) { "USERPROFILE" } else { var })
        .expect("the test runner has a home directory variable");
    let mut spec = shell("spec-test-inherit", unix, windows);
    spec.env = vec![("GL_SPEC_A".into(), "added".into())];
    let out = SpecProcRunner.run(spec, None).await;
    assert_eq!(out.code, Some(0), "{out:?}");
    assert_eq!(lines(&out.stdout)[0], want);
}

#[cfg(unix)]
#[tokio::test]
async fn replace_env_gives_the_child_exactly_the_listed_variables() {
    let home = FakeHome::new("gamelib-spec-exact");
    let mut spec = ProcSpec::new("spec-test-exact", "/usr/bin/env");
    spec.env = fake_env(&home);
    spec.env.push(("GL_SPEC_A".into(), "one".into()));
    spec.replace_env = true;
    let out = SpecProcRunner.run(spec, None).await;
    assert_eq!(out.code, Some(0), "{out:?}");
    let mut names: Vec<&str> = out
        .stdout
        .lines()
        .filter_map(|l| l.split_once('=').map(|(k, _)| k))
        .collect();
    names.sort_unstable();
    let mut want: Vec<&str> = gamelib_testutil::ENV_KEYS.to_vec();
    want.push("GL_SPEC_A");
    want.sort_unstable();
    assert_eq!(names, want);
}

#[tokio::test]
async fn the_working_directory_is_honoured() {
    let home = FakeHome::new("gamelib-spec-cwd");
    let mut spec = shell("spec-test-cwd", "pwd -P", "cd");
    spec.env = fake_env(&home);
    spec.cwd = Some(home.root().to_path_buf());
    let out = SpecProcRunner.run(spec, None).await;
    assert_eq!(out.code, Some(0), "{out:?}");
    assert_eq!(
        std::fs::canonicalize(lines(&out.stdout)[0].as_str()).expect("cwd is a real path"),
        std::fs::canonicalize(home.root()).expect("profile root")
    );
}

#[tokio::test]
async fn stdin_text_is_read_by_the_child() {
    let mut spec = if cfg!(windows) {
        let mut s = ProcSpec::new("spec-test-stdin", "findstr");
        s.argv = vec!["^".into()];
        s
    } else {
        ProcSpec::new("spec-test-stdin", "/bin/cat")
    };
    spec.stdin = Some("hello\nworld\n".into());
    let out = SpecProcRunner.run(spec, None).await;
    assert_eq!(out.code, Some(0), "{out:?}");
    assert_eq!(lines(&out.stdout), ["hello", "world"]);
}

#[tokio::test]
async fn a_timeout_kills_the_child_and_unregisters_it() {
    let label = "spec-test-timeout";
    let mut spec = sleeper(label);
    spec.timeout = Some(Duration::from_millis(300));
    let started = Instant::now();
    let out = SpecProcRunner.run(spec, None).await;
    assert!(out.timed_out, "{out:?}");
    assert!(!out.cancelled);
    assert_eq!(out.code, None);
    assert!(started.elapsed() < Duration::from_secs(10));
    assert!(
        !global().labels().contains(&label),
        "a timed-out run must leave nothing registered"
    );
}

#[tokio::test]
async fn a_cancel_kills_the_child_and_says_so() {
    let label = "spec-test-cancel";
    let token = CancellationToken::new();
    let mut spec = sleeper(label);
    spec.cancel = Some(token.clone());
    let run = tokio::spawn(SpecProcRunner.run(spec, None));
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert!(global().labels().contains(&label), "registered while alive");
    token.cancel();
    let out = run.await.expect("the run task");
    assert!(out.cancelled, "{out:?}");
    assert!(!out.timed_out);
    assert_eq!(out.code, None);
    assert!(!global().labels().contains(&label));
}

#[tokio::test]
async fn output_past_max_buffer_is_truncated_not_held() {
    let mut spec = if cfg!(windows) {
        let mut s = ProcSpec::new("spec-test-cap", "powershell");
        s.argv = vec![
            "-NoProfile".into(),
            "-Command".into(),
            "[Console]::Out.Write('x' * 2097152)".into(),
        ];
        s
    } else {
        shell(
            "spec-test-cap",
            "head -c 2097152 /dev/zero | tr '\\0' x",
            "",
        )
    };
    spec.max_buffer = 1024 * 1024;
    spec.timeout = Some(Duration::from_secs(60));
    let out = SpecProcRunner.run(spec, None).await;
    assert_eq!(out.code, Some(0), "{:?}", (out.code, out.timed_out));
    assert!(out.truncated);
    assert_eq!(out.stdout.len(), 1024 * 1024);
}

#[tokio::test]
async fn on_line_sees_each_stdout_line() {
    let seen = Arc::new(Mutex::new(Vec::<String>::new()));
    let sink = seen.clone();
    let spec = shell(
        "spec-test-lines",
        "printf 'a\\nb\\r\\nc'",
        "echo a& echo b& echo c",
    );
    let out = SpecProcRunner
        .run(
            spec,
            Some(Box::new(move |l: &str| {
                sink.lock().expect("sink").push(l.trim().to_string());
            })),
        )
        .await;
    assert_eq!(out.code, Some(0), "{out:?}");
    assert_eq!(*seen.lock().expect("seen"), ["a", "b", "c"]);
}

#[tokio::test]
async fn a_missing_program_is_a_spawn_error_not_a_flag() {
    let spec = ProcSpec::new("spec-test-missing", "gamelib-spec-no-such-program");
    let out = SpecProcRunner.run(spec, None).await;
    assert_eq!(out.code, None);
    assert!(!out.timed_out && !out.cancelled && !out.truncated);
    assert!(
        out.stderr.contains("gamelib-spec-no-such-program"),
        "{out:?}"
    );
    assert!(!global().labels().contains(&"spec-test-missing"));
}

/// The timeout reaches what the child started, not only the child (a winetricks run that hangs in
/// a wine process). The child backgrounds a sleeper and prints its pid.
#[cfg(unix)]
#[tokio::test]
async fn a_timeout_kills_the_grandchild_too() {
    use gamelib_proc::probe::is_alive;
    let pid = Arc::new(Mutex::new(None::<u32>));
    let sink = pid.clone();
    let mut spec = shell("spec-test-tree-timeout", "sleep 30 & echo $!; wait", "");
    spec.timeout = Some(Duration::from_millis(800));
    let out = SpecProcRunner
        .run(
            spec,
            Some(Box::new(move |l: &str| {
                *sink.lock().expect("sink") = l.trim().parse().ok();
            })),
        )
        .await;
    assert!(out.timed_out, "{out:?}");
    let grandchild = pid
        .lock()
        .expect("pid")
        .expect("the child printed its sleeper's pid");
    let deadline = Instant::now() + Duration::from_secs(10);
    while is_alive(grandchild) {
        assert!(
            Instant::now() < deadline,
            "grandchild {grandchild} outlived the timed-out run"
        );
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

/// A descendant that keeps the output pipe open after the child exits does not hold the run open.
#[cfg(unix)]
#[tokio::test]
async fn a_daemonised_descendant_holding_the_pipe_does_not_stall_the_run() {
    let spec = shell("spec-test-daemon", "sleep 8 & echo done", "");
    let started = Instant::now();
    let out = SpecProcRunner.run(spec, None).await;
    assert_eq!(out.code, Some(0), "{out:?}");
    assert_eq!(lines(&out.stdout), ["done"]);
    assert!(
        started.elapsed() < Duration::from_secs(6),
        "the run waited {:?} for a descendant's pipe",
        started.elapsed()
    );
}
