//! Phase 81 D-08: the Rust reader for the helper's `--steam-appstate` line. One test per behavior:
//! what each helper line maps to, every failure shape, the argv and the last-line rule.

use gamelib_steampoll::app_state::{read_app_state, AppStateOutcome};
use gamelib_steampoll::constants::ADOPTION_HELPER_TIMEOUT_MS;
use gamelib_steampoll::events::{AckReply, StateEvent};
use gamelib_steampoll::host::{
    BoxFuture, Notification, PollHost, ProcessRunner, RunOutput, StreamingChild,
};
use gamelib_steampoll::testing::ScriptedRunner;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

struct HelperHost(Option<PathBuf>);

impl PollHost for HelperHost {
    fn emit_frontend(&self, _: &str, _: Vec<Value>) {}
    fn notify(&self, _: Notification) {}
    fn state_event(&self, _: StateEvent) -> BoxFuture<AckReply> {
        Box::pin(async { AckReply::default() })
    }
    fn bridge_helper_path(&self) -> Option<PathBuf> {
        self.0.clone()
    }
    fn shell_pid(&self) -> u32 {
        1
    }
}

fn out(code: Option<i32>, stdout: &str) -> RunOutput {
    RunOutput {
        code,
        stdout: stdout.into(),
        stderr: String::new(),
    }
}

fn helper() -> (tempfile::TempDir, HelperHost, String) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("steam-bridge-helper");
    std::fs::write(&path, "").unwrap();
    let p = path.to_string_lossy().into_owned();
    (dir, HelperHost(Some(path)), p)
}

fn unavailable(reason: &str) -> AppStateOutcome {
    AppStateOutcome::Unavailable {
        reason: reason.into(),
    }
}

/// Records the argv and timeout the reader passes, and answers with one scripted output.
struct RecordingRunner {
    calls: Mutex<Vec<(String, Vec<String>, Duration)>>,
    answer: RunOutput,
}

impl ProcessRunner for RecordingRunner {
    fn run(&self, program: &str, argv: Vec<String>, timeout: Duration) -> BoxFuture<RunOutput> {
        self.calls
            .lock()
            .unwrap()
            .push((program.to_string(), argv, timeout));
        let answer = self.answer.clone();
        Box::pin(async move { answer })
    }
    fn spawn_streaming(&self, _: &str, _: Vec<String>) -> std::io::Result<StreamingChild> {
        Err(std::io::Error::other("unused"))
    }
}

#[tokio::test]
async fn an_ok_line_maps_to_logged_on_state_and_installed() {
    let (_d, host, p) = helper();
    let runner = ScriptedRunner::default();
    runner.on(
        &format!("{p} --steam-appstate 440"),
        vec![out(
            Some(0),
            r#"{"result":"ok","loggedOn":1,"state":4,"installed":15}"#,
        )],
    );
    assert_eq!(
        read_app_state(&host, &runner, "440").await,
        AppStateOutcome::Ok {
            logged_on: true,
            state: Some(4),
            installed: Some(15)
        }
    );
}

#[tokio::test]
async fn a_signed_out_line_with_null_fields_maps_to_none() {
    let (_d, host, p) = helper();
    let runner = ScriptedRunner::default();
    runner.on(
        &format!("{p} --steam-appstate 440"),
        vec![out(
            Some(0),
            r#"{"result":"ok","loggedOn":0,"state":null,"installed":null}"#,
        )],
    );
    assert_eq!(
        read_app_state(&host, &runner, "440").await,
        AppStateOutcome::Ok {
            logged_on: false,
            state: None,
            installed: None
        }
    );
}

#[tokio::test]
async fn steam_not_running_is_its_own_outcome_and_other_reasons_are_unavailable() {
    let (_d, host, p) = helper();
    let runner = ScriptedRunner::default();
    let key = format!("{p} --steam-appstate 440");
    runner.on(
        &key,
        vec![out(
            Some(2),
            r#"{"result":"unavailable","reason":"steam-not-running"}"#,
        )],
    );
    assert_eq!(
        read_app_state(&host, &runner, "440").await,
        AppStateOutcome::SteamNotRunning
    );
    for reason in [
        "steamclient-missing",
        "unsupported-arch",
        "method-unverified:BLoggedOn",
    ] {
        runner.on(
            &key,
            vec![out(
                Some(2),
                &format!(r#"{{"result":"unavailable","reason":"{reason}"}}"#),
            )],
        );
        assert_eq!(
            read_app_state(&host, &runner, "440").await,
            unavailable(reason)
        );
    }
}

#[tokio::test]
async fn garbage_empty_incomplete_and_negative_output_is_helper_failed() {
    let (_d, host, p) = helper();
    let runner = ScriptedRunner::default();
    let key = format!("{p} --steam-appstate 440");
    for o in [
        out(Some(0), "not json"),
        out(Some(0), ""),
        out(Some(0), "[1,2]"),
        out(Some(0), r#"{"result":"weird"}"#),
        // An ok line without loggedOn.
        out(Some(0), r#"{"result":"ok","state":4,"installed":1}"#),
        // A loggedOn that is not 0 or 1.
        out(
            Some(0),
            r#"{"result":"ok","loggedOn":2,"state":4,"installed":1}"#,
        ),
        out(
            Some(0),
            r#"{"result":"ok","loggedOn":"1","state":4,"installed":1}"#,
        ),
        // A negative or fractional state.
        out(
            Some(0),
            r#"{"result":"ok","loggedOn":1,"state":-1,"installed":1}"#,
        ),
        out(
            Some(0),
            r#"{"result":"ok","loggedOn":1,"state":4,"installed":-3}"#,
        ),
        out(
            Some(0),
            r#"{"result":"ok","loggedOn":1,"state":4.5,"installed":1}"#,
        ),
        // The usage line is not an answer.
        out(Some(64), r#"{"result":"usage","error":"bad-appid"}"#),
        // Unavailable without a reason.
        out(Some(2), r#"{"result":"unavailable"}"#),
    ] {
        runner.on(&key, vec![o.clone()]);
        assert_eq!(
            read_app_state(&host, &runner, "440").await,
            unavailable("helper-failed"),
            "{o:?}"
        );
    }
}

#[tokio::test]
async fn a_spawn_failure_or_timeout_is_helper_failed() {
    let (_d, host, p) = helper();
    let runner = ScriptedRunner::default();
    runner.on(&format!("{p} --steam-appstate 440"), vec![out(None, "")]);
    assert_eq!(
        read_app_state(&host, &runner, "440").await,
        unavailable("helper-failed")
    );
}

#[tokio::test]
async fn stdout_over_64_kib_is_helper_failed() {
    let (_d, host, p) = helper();
    let runner = ScriptedRunner::default();
    let big = format!(
        "{}\n{}",
        "x".repeat(64 * 1024 + 1),
        r#"{"result":"ok","loggedOn":1,"state":4,"installed":1}"#
    );
    runner.on(
        &format!("{p} --steam-appstate 440"),
        vec![out(Some(0), &big)],
    );
    assert_eq!(
        read_app_state(&host, &runner, "440").await,
        unavailable("helper-failed")
    );
}

#[tokio::test]
async fn a_missing_helper_is_helper_missing_and_nothing_spawns() {
    let runner = ScriptedRunner::default();
    assert_eq!(
        read_app_state(&HelperHost(None), &runner, "440").await,
        unavailable("helper-missing")
    );
    // A path that does not exist on disk counts as missing too.
    let gone = HelperHost(Some(PathBuf::from("/nonexistent/steam-bridge-helper")));
    assert_eq!(
        read_app_state(&gone, &runner, "440").await,
        unavailable("helper-missing")
    );
    assert!(runner.calls().is_empty());
}

#[tokio::test]
async fn a_bad_app_id_is_bad_appid_and_nothing_spawns() {
    let (_d, host, _p) = helper();
    let runner = ScriptedRunner::default();
    for id in ["", "abc", "44 0", "12345678901", "-1", "4;rm"] {
        assert_eq!(
            read_app_state(&host, &runner, id).await,
            unavailable("bad-appid"),
            "{id:?}"
        );
    }
    assert!(runner.calls().is_empty());
}

#[tokio::test]
async fn the_argv_is_exactly_flag_and_app_id_with_the_helper_timeout() {
    let (_d, host, p) = helper();
    let runner = RecordingRunner {
        calls: Mutex::new(vec![]),
        answer: out(
            Some(0),
            r#"{"result":"ok","loggedOn":1,"state":1,"installed":2}"#,
        ),
    };
    read_app_state(&host, &runner, "1234567890").await;
    let calls = runner.calls.lock().unwrap();
    assert_eq!(calls.len(), 1);
    let (program, argv, timeout) = &calls[0];
    assert_eq!(program, &p);
    assert_eq!(
        argv,
        &vec!["--steam-appstate".to_string(), "1234567890".to_string()]
    );
    assert_eq!(*timeout, Duration::from_millis(ADOPTION_HELPER_TIMEOUT_MS));
}

#[tokio::test]
async fn the_last_non_empty_stdout_line_is_the_one_parsed() {
    let (_d, host, p) = helper();
    let runner = ScriptedRunner::default();
    runner.on(
        &format!("{p} --steam-appstate 440"),
        vec![out(
            Some(0),
            "noise\n{\"result\":\"ok\",\"loggedOn\":0,\"state\":null,\"installed\":null}\n{\"result\":\"ok\",\"loggedOn\":1,\"state\":4,\"installed\":9}\n\n",
        )],
    );
    assert_eq!(
        read_app_state(&host, &runner, "440").await,
        AppStateOutcome::Ok {
            logged_on: true,
            state: Some(4),
            installed: Some(9)
        }
    );
}
