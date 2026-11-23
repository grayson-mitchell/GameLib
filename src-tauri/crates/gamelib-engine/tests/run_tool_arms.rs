//! The two profile arms of the CrossOver probes (D-18, 87-44) and the tool runner's guards, as tests.
//!
//! `run_tool` is the **isolated** arm: five allowlisted programs, exactly the eight profile variables
//! pointed at a fresh 0700 directory (`replace_env`), empty stdin, a 1 MiB output cap, the directory
//! removed afterwards. `probe_demo_status` is the declared **real-profile** arm: it keeps the inherited
//! environment (`replace_env: false`), because CrossOver reads its licence from the real HOME (spike 060).
//! A cancel id maps to a `CancellationToken` (Pitfall 10: an `AbortSignal` cannot cross `rustInvoke`).
//! POSIX only, as the TS oracle's replays are.
#![cfg(unix)]

use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use gamelib_core::clock::SystemClock;
use gamelib_core::process::{BoxFuture, LineSink, ProcSpec, SpecOutput, SpecRunner};
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::crossover::demo_status::probe_demo_status;
use gamelib_engine::crossover::run_tool::{isolated_env, run_tool, RunToolArgs, ALLOWED_TOOLS};
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::testing::ScriptedSpecRunner;
use gamelib_store::host::StoreHost;
use gamelib_testutil::{FakeHome, ENV_KEYS};
use serde_json::json;

fn ctx_over(home: &FakeHome, proc: Arc<dyn SpecRunner>) -> EngineCtx {
    let root = home.root().to_path_buf();
    EngineCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        Platform::Mac,
        EnginePaths {
            app_folder: root.clone(),
            user_data: root.clone(),
            tools_path: root.join("tools"),
            user_home: root.clone(),
            temp: root.join("tmp"),
        },
        Shutdown::new(),
    )
    .with_proc(proc)
}

fn args(tool: &str) -> RunToolArgs {
    RunToolArgs {
        tool: tool.to_string(),
        args: vec!["-x".to_string()],
        timeout_ms: 5_000,
        cancel_id: None,
    }
}

fn tmp_entries(home: &FakeHome) -> Vec<String> {
    match std::fs::read_dir(home.root().join("tmp")) {
        Ok(dir) => dir
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect(),
        Err(_) => Vec::new(),
    }
}

/// What `Inspect` saw of one run: the profile directory, its mode and the environment.
type Seen = (PathBuf, u32, Vec<(String, String)>);

/// Looks at the isolated profile while the child "runs", the only time it exists.
#[derive(Default)]
struct Inspect {
    seen: Mutex<Vec<Seen>>,
}

impl SpecRunner for Inspect {
    fn run(&self, spec: ProcSpec, _on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
        let home = spec
            .env
            .iter()
            .find(|(k, _)| k == "HOME")
            .map(|(_, v)| PathBuf::from(v))
            .unwrap();
        let mode = std::fs::metadata(&home).unwrap().permissions().mode() & 0o7777;
        self.seen
            .lock()
            .unwrap()
            .push((home, mode, spec.env.clone()));
        Box::pin(async {
            SpecOutput {
                code: Some(0),
                ..SpecOutput::default()
            }
        })
    }
}

/// A child that runs until its cancel token fires, as a killed tree would.
struct UntilCancelled {
    started: tokio::sync::Notify,
}

impl SpecRunner for UntilCancelled {
    fn run(&self, spec: ProcSpec, _on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
        let token = spec
            .cancel
            .expect("a cancel id passes its token into the spec");
        self.started.notify_one();
        Box::pin(async move {
            token.cancelled().await;
            SpecOutput {
                code: None,
                cancelled: true,
                ..SpecOutput::default()
            }
        })
    }
}

#[tokio::test]
async fn a_program_outside_the_five_entry_allowlist_is_refused_without_spawning() {
    let home = FakeHome::new("engine-run-tool-");
    let runner = Arc::new(ScriptedSpecRunner::new(Vec::new()));
    let ctx = ctx_over(&home, runner.clone());
    assert_eq!(ALLOWED_TOOLS.len(), 5);
    for tool in [
        "/bin/sh",
        "/usr/bin/env",
        "cp",
        "/bin/cp ",
        "/BIN/CP",
        "",
        "/usr/bin/open",
    ] {
        let result = run_tool(&ctx, args(tool)).await;
        assert_eq!(result.code, None, "{tool:?}");
        assert_eq!(result.stderr, format!("tool not allowed: {tool}"));
        assert!(!result.timed_out && !result.aborted);
    }
    assert!(runner.spawns().is_empty());
    // A cancel id that is not 1 to 64 of [A-Za-z0-9_-] is refused too, before anything is made.
    let mut bad = args("/bin/cp");
    bad.cancel_id = Some("a b".to_string());
    assert_eq!(run_tool(&ctx, bad).await.stderr, "invalid cancel id");
    assert!(runner.spawns().is_empty());
    assert!(tmp_entries(&home).is_empty());
}

#[tokio::test]
async fn an_allowed_program_runs_with_exactly_the_eight_isolated_variables_and_the_dir_is_removed()
{
    let home = FakeHome::new("engine-run-tool-");
    let inspect = Arc::new(Inspect::default());
    let ctx = ctx_over(&home, inspect.clone());
    let runner = Arc::new(ScriptedSpecRunner::new(Vec::new()).on_program(
        "/usr/bin/plutil",
        SpecOutput {
            code: Some(0),
            stdout: "out".into(),
            stderr: "err".into(),
            ..SpecOutput::default()
        },
    ));
    let recording = ctx_over(&home, runner.clone());

    for (program, label) in ALLOWED_TOOLS {
        let result = run_tool(&ctx, args(program)).await;
        assert_eq!(result.code, Some(0), "{program}");
        assert!(
            tmp_entries(&home).is_empty(),
            "{label}: the profile is removed afterwards"
        );
    }
    let seen = inspect.seen.lock().unwrap().clone();
    assert_eq!(seen.len(), 5);
    let reference = FakeHome::new("engine-run-tool-ref-");
    for (profile, mode, env) in seen {
        assert_eq!(mode, 0o700, "a fresh 0700 directory (owner write kept)");
        assert!(profile.starts_with(home.root().join("tmp")));
        let keys: Vec<&str> = env.iter().map(|(k, _)| k.as_str()).collect();
        assert_eq!(
            keys,
            ENV_KEYS.to_vec(),
            "exactly the eight, in the harness order"
        );
        // The same layout as the harness's fake profile, rooted at this run's directory.
        for ((key, value), (ref_key, ref_value)) in env.iter().zip(reference.env()) {
            assert_eq!(key, ref_key);
            let relative = ref_value.strip_prefix(reference.root()).unwrap();
            assert_eq!(PathBuf::from(value), profile.join(relative), "{key}");
        }
    }

    let result = run_tool(&recording, args("/usr/bin/plutil")).await;
    assert_eq!(
        (result.code, result.stdout.as_str(), result.stderr.as_str()),
        (Some(0), "out", "err")
    );
    let spawn = &runner.spawns()[0];
    assert!(
        spawn.replace_env,
        "the isolated arm replaces the environment"
    );
    assert_eq!(spawn.stdin.as_deref(), Some(""));
    assert_eq!(spawn.timeout, Some(Duration::from_millis(5_000)));
    assert_eq!(spawn.max_buffer, 1024 * 1024);
    assert_eq!(spawn.argv, ["-x"]);
    assert_eq!(spawn.label, "engine-plutil");
}

#[tokio::test]
async fn a_cancel_id_cancelled_mid_run_kills_the_child_and_answers_aborted() {
    let home = FakeHome::new("engine-run-tool-");
    let runner = Arc::new(UntilCancelled {
        started: tokio::sync::Notify::new(),
    });
    let ctx = Arc::new(ctx_over(&home, runner.clone()));
    let mut call = args("/bin/cp");
    call.cancel_id = Some("run-1".to_string());
    let running = {
        let ctx = ctx.clone();
        tokio::spawn(async move { run_tool(&ctx, call).await })
    };
    runner.started.notified().await;
    // The run is registered before it spawns; the op cancels it by id.
    let answer = gamelib_engine::dispatch("engine_cancel", &[json!({"cancelId": "run-1"})], &ctx)
        .await
        .unwrap();
    assert_eq!(answer, json!(true));
    let result = running.await.unwrap();
    assert!(result.aborted && result.code.is_none() && !result.timed_out);
    // The registration ended with the run; an unknown or finished id is `false`.
    for id in ["run-1", "never-registered"] {
        let answer = gamelib_engine::dispatch("engine_cancel", &[json!({"cancelId": id})], &ctx)
            .await
            .unwrap();
        assert_eq!(answer, json!(false), "{id}");
    }
    assert!(tmp_entries(&home).is_empty());
    let bad = gamelib_engine::dispatch("engine_cancel", &[json!({"cancelId": "a/b"})], &ctx).await;
    assert_eq!(bad, Err("engine_cancel:bad-args".to_string()));
}

#[tokio::test]
async fn the_demo_status_spec_keeps_the_inherited_env_while_run_tool_does_not() {
    let home = FakeHome::new("engine-run-tool-");
    let runner = Arc::new(
        ScriptedSpecRunner::new(Vec::new())
            .on_program(
                "/cx/bin/wine",
                SpecOutput {
                    code: Some(0),
                    stdout: "Standard version".into(),
                    ..SpecOutput::default()
                },
            )
            .on_program(
                "/bin/cp",
                SpecOutput {
                    code: Some(0),
                    ..SpecOutput::default()
                },
            ),
    );
    let ctx = ctx_over(&home, runner.clone());
    let probe = probe_demo_status(&ctx, "/cx/bin", "GameLib-gog-1", None, None).await;
    assert_eq!(probe.to_value()["status"], json!({"kind": "licensed"}));
    run_tool(&ctx, args("/bin/cp")).await;
    let spawns = runner.spawns();
    let (demo, tool) = (&spawns[0], &spawns[1]);
    assert!(
        !demo.replace_env,
        "real-profile arm: the process environment is inherited"
    );
    assert_eq!(demo.env_set.keys().collect::<Vec<_>>(), ["CX_BOTTLE"]);
    assert!(tool.replace_env, "isolated arm: nothing is inherited");
    assert_eq!(tool.env_set.len(), 8);
}

#[tokio::test]
async fn a_real_allowlisted_spawn_goes_through_the_proc_seam_and_leaves_no_profile_behind() {
    let home = FakeHome::new("engine-run-tool-");
    let work = home.root().join("work");
    std::fs::create_dir_all(&work).unwrap();
    std::fs::write(work.join("a.txt"), b"copied").unwrap();
    // The default context runner is the app's `SpecProcRunner`.
    let ctx = EngineCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        Platform::Mac,
        EnginePaths {
            app_folder: home.root().to_path_buf(),
            user_data: home.root().to_path_buf(),
            tools_path: home.root().join("tools"),
            user_home: home.root().to_path_buf(),
            temp: home.root().join("tmp"),
        },
        Shutdown::new(),
    );
    let mut call = args("/bin/cp");
    call.args = vec![
        work.join("a.txt").to_string_lossy().into_owned(),
        work.join("b.txt").to_string_lossy().into_owned(),
    ];
    let result = run_tool(&ctx, call).await;
    assert_eq!(result.code, Some(0), "{result:?}");
    assert_eq!(std::fs::read(work.join("b.txt")).unwrap(), b"copied");
    assert!(tmp_entries(&home).is_empty());
}

#[test]
fn the_isolated_profile_is_unique_private_and_removed_on_drop() {
    let home = FakeHome::new("engine-run-tool-");
    let ctx = ctx_over(&home, Arc::new(ScriptedSpecRunner::new(Vec::new())));
    let (a, b) = (isolated_env(&ctx).unwrap(), isolated_env(&ctx).unwrap());
    assert_ne!(a.root(), b.root());
    for p in [&a, &b] {
        let mode = std::fs::metadata(p.root()).unwrap().permissions().mode() & 0o7777;
        assert_eq!(mode, 0o700);
    }
    let gone = a.root().to_path_buf();
    drop(a);
    assert!(!gone.exists());
    assert!(b.root().exists());
}
