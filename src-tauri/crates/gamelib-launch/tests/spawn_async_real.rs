//! spawnAsync against real children (88.2-14, D-30, D-21): the cases the scripted replay cannot show, and the two
//! titles of `spawnAsync.test.ts` that need a real child (88.2-05's not-ported map points here): "real child: exit
//! code and stdout" and "A-WR-4: a timeout reports timedOut (SIGKILL, code null); an abort reports aborted".
//!
//! Every test goes through the op, [`gamelib_launch::dispatch`] with `launch_spawn_async` (and `launch_runner_kill`
//! for the abort), on a fresh `FakeHome` environment, never the real profile (D-22). A child is `/bin/sh`, so the
//! file is unix only.
#![cfg(unix)]

mod common;

use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};

use common::*;
use gamelib_engine::ctx::Platform;
use gamelib_engine::testing::RecordingLog;
use gamelib_launch::ctx::LaunchCtx;
use gamelib_proc::SpecProcRunner;
use serde_json::{json, Value};

struct Setup {
    rig: Rig,
    ctx: LaunchCtx,
}

fn setup() -> Setup {
    let rig = Rig::new();
    let ctx = rig.launch_ctx(
        Platform::Linux,
        Arc::new(SpecProcRunner),
        Arc::new(RecordingLog::new()),
    );
    Setup { rig, ctx }
}

/// The env a `/bin/sh` child needs to find nothing but its own builtins and `sleep`.
fn base_env() -> Value {
    json!({ "PATH": "/usr/bin:/bin" })
}

fn call(command: &str, args: &[&str], extra: Value) -> Value {
    let mut call =
        json!({ "streamId": "stream-1", "command": command, "args": args, "env": base_env() });
    if let Value::Object(extra) = extra {
        for (key, value) in extra {
            call[key] = value;
        }
    }
    call
}

fn sh(script: &str, extra: Value) -> Value {
    call("/bin/sh", &["-c", script], extra)
}

async fn run(ctx: &LaunchCtx, call: Value) -> Result<Value, String> {
    gamelib_launch::dispatch("launch_spawn_async", &[call], ctx).await
}

/// Whether `pid` is a live process (a short synchronous probe, as the spawn convention allows).
fn alive(pid: &str) -> bool {
    std::process::Command::new("/bin/sh")
        .args(["-c", &format!("kill -0 {pid}")])
        .env_clear()
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false)
}

/// Waits for the pid file a script wrote, answering the pid.
async fn pid_in(path: &Path) -> String {
    for _ in 0..500 {
        if let Ok(text) = std::fs::read_to_string(path) {
            if text.ends_with('\n') {
                return text.trim().to_string();
            }
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    panic!("{path:?} never appeared");
}

/// "real child: exit code and stdout": a non-zero exit is reported, not thrown, with the output kept.
#[test]
fn a_real_child_answers_its_exit_code_and_stdout() {
    let s = setup();
    let answer = runtime()
        .block_on(run(
            &s.ctx,
            sh("printf ok; printf warn >&2; exit 3", json!({})),
        ))
        .expect("a result");
    assert_eq!(
        answer,
        json!({ "code": 3, "stdout": "ok", "stderr": "warn", "timedOut": false, "aborted": false })
    );
}

/// An env passed replaces the inherited one, and the cwd is the one given.
#[test]
fn a_real_child_gets_exactly_the_env_and_the_cwd_it_was_given() {
    let s = setup();
    let dir = s.rig.root().join("work");
    std::fs::create_dir_all(&dir).unwrap();
    let env = json!({ "PATH": "/usr/bin:/bin", "ONLY": "mine" });
    let answer = runtime()
        .block_on(run(
            &s.ctx,
            sh(
                "echo \"only=$ONLY home=${HOME-unset} cwd=$(pwd)\"",
                json!({ "env": env, "cwd": dir.to_string_lossy() }),
            ),
        ))
        .expect("a result");
    let want_cwd = std::fs::canonicalize(&dir).unwrap();
    assert_eq!(answer["code"], 0);
    assert_eq!(
        answer["stdout"].as_str().unwrap().trim(),
        format!("only=mine home=unset cwd={}", want_cwd.display())
    );
}

/// "A-WR-4", the timeout half: SIGKILL on the child's group, `timedOut: true`, `code: null`, and the
/// grandchild the script started is gone too (T-88.2-21).
#[test]
fn a_timeout_kills_the_child_group_and_answers_timed_out_with_a_null_code() {
    let s = setup();
    let pidfile = s.rig.root().join("grandchild.pid");
    let script = format!("sleep 30 &\necho $! > '{}'\nwait", pidfile.display());
    let started = Instant::now();
    let rt = runtime();
    let answer = rt
        .block_on(run(&s.ctx, sh(&script, json!({ "timeoutMs": 300 }))))
        .expect("a result");
    assert_eq!(answer["code"], Value::Null);
    assert_eq!(answer["timedOut"], true);
    assert_eq!(answer["aborted"], false);
    assert!(
        started.elapsed() < Duration::from_secs(10),
        "{:?}",
        started.elapsed()
    );
    let pid = std::fs::read_to_string(&pidfile)
        .expect("the script ran")
        .trim()
        .to_string();
    // The kill is a signal; the grandchild's exit is reaped by init a moment later.
    let mut gone = false;
    for _ in 0..100 {
        if !alive(&pid) {
            gone = true;
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    assert!(gone, "the grandchild {pid} outlived the timeout");
}

/// "A-WR-4", the abort half: `launch_runner_kill` on the stream id ends the real child mid-run, the call
/// resolves with `aborted: true` (never an error), and the child's group is gone.
#[test]
fn a_runner_kill_mid_run_answers_aborted_as_a_resolved_result() {
    let s = setup();
    let pidfile = s.rig.root().join("grandchild.pid");
    let script = format!(
        "printf started\nsleep 30 &\necho $! > '{}'\nwait",
        pidfile.display()
    );
    let rt = runtime();
    let (answer, killed, pid) = rt.block_on(async {
        let work = run(&s.ctx, sh(&script, json!({})));
        let abort = async {
            let pid = pid_in(&pidfile).await;
            let killed =
                gamelib_launch::dispatch("launch_runner_kill", &[json!("stream-1")], &s.ctx)
                    .await
                    .expect("the kill answers");
            (killed, pid)
        };
        let (answer, (killed, pid)) = tokio::join!(work, abort);
        (answer, killed, pid)
    });
    let answer = answer.expect("an abort resolves, it never rejects");
    assert_eq!(killed, json!(1));
    assert_eq!(answer["code"], Value::Null);
    assert_eq!(answer["aborted"], true);
    assert_eq!(answer["timedOut"], false);
    assert_eq!(answer["stdout"], "started");
    let mut gone = false;
    for _ in 0..100 {
        if !alive(&pid) {
            gone = true;
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    assert!(gone, "the grandchild {pid} outlived the kill");
    // The run gave its registry entry back: a second kill ends nothing.
    let again = rt
        .block_on(gamelib_launch::dispatch(
            "launch_runner_kill",
            &[json!("stream-1")],
            &s.ctx,
        ))
        .unwrap();
    assert_eq!(again, json!(0));
}

/// A program that cannot be started is an error the adapter rejects with, never a result.
#[test]
fn a_program_that_cannot_start_is_an_error_not_a_result() {
    let s = setup();
    let missing = s.rig.root().join("nope").to_string_lossy().into_owned();
    let answer = runtime().block_on(run(&s.ctx, call(&missing, &[], json!({}))));
    let message = answer.expect_err("a missing program rejects");
    assert!(!message.is_empty());
    // A rejection is not the bad-args answer.
    assert_ne!(message, "launch_spawn_async:bad-args");
}

/// A child that prints 200 lines answers an output that ends with its last line (the window keeps the tail of
/// the stream, joined untrimmed; the 50-chunk bound itself is the golden's).
#[test]
fn a_chatty_child_answers_the_tail_of_its_output() {
    let s = setup();
    let answer = runtime()
        .block_on(run(
            &s.ctx,
            sh(
                "i=0; while [ $i -lt 200 ]; do echo line-$i; i=$((i+1)); done",
                json!({}),
            ),
        ))
        .expect("a result");
    let stdout = answer["stdout"].as_str().unwrap();
    assert!(stdout.ends_with("line-199\n"), "{stdout}");
}
