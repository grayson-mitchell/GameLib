//! The runner against real children (88.2-07), the Rust twins of the four `Layer-2: real children` tests of
//! `commandRunner.test.ts` plus the cases the scripted replay cannot show: a real exit code, a real signal,
//! the stderr join, an abort that kills the child's whole group, and a 60-read transcript keeping the last 50.
//!
//! Every child runs through `SpecProcRunner` (a `SpawnClass::Helper` tokio child) on a fresh `FakeHome`
//! environment, never the real profile. Unix only: the children are `/bin/sh` scripts.
#![cfg(unix)]

use std::collections::BTreeMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use gamelib_core::clock::SystemClock;
use gamelib_core::process::Pipe;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform as InfoPlatform};
use gamelib_info::http::ReqwestHttp;
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_launch::ctx::LaunchCtx;
use gamelib_launch::runner::call_runner::{
    call_runner, run_abort, ExecResult, RunnerCallArgs, RunnerHost, RunnerProps, SpawnClassArg,
};
use gamelib_launch::runner::stream::{LaunchLogSink, OutputSink};
use gamelib_launch::runner::{RunnerErrors, RunnerName};
use gamelib_log::{Level, Prefix, TargetBatch};
use gamelib_proc::SpecProcRunner;
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::WineCtx;

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// Writes nothing: a real run's log entries are not what these tests look at.
struct QuietLog;

impl LaunchLogSink for QuietLog {
    fn stamp(&self) -> (u64, i32) {
        (0, 0)
    }
    fn submit(&self, _batches: Vec<TargetBatch>) {}
    fn general(&self, _prefix: Prefix, _level: Level, _msg: &str) {}
}

#[derive(Default)]
struct Errors {
    calls: Mutex<Vec<String>>,
}

impl RunnerErrors for Errors {
    fn handle(&self, error: &str, _app_name: &str, _runner: RunnerName) {
        lock(&self.calls).push(error.to_string());
    }
}

/// Records every chunk (and runs `on_first` once, on the first), as a TS `onOutput` observer does.
struct Observer {
    chunks: Mutex<Vec<(Pipe, String)>>,
    on_first: Mutex<Option<Box<dyn FnOnce() + Send>>>,
}

impl Observer {
    fn new() -> Arc<Observer> {
        Arc::new(Observer {
            chunks: Mutex::new(Vec::new()),
            on_first: Mutex::new(None),
        })
    }

    fn on_first(self: &Arc<Self>, f: impl FnOnce() + Send + 'static) {
        *lock(&self.on_first) = Some(Box::new(f));
    }

    fn stdout_chunks(&self) -> Vec<String> {
        lock(&self.chunks)
            .iter()
            .filter(|(pipe, _)| *pipe == Pipe::Stdout)
            .map(|(_, text)| text.clone())
            .collect()
    }
}

impl OutputSink for Observer {
    fn chunk(&self, pipe: Pipe, text: &str) {
        lock(&self.chunks).push((pipe, text.to_string()));
        if let Some(f) = lock(&self.on_first).take() {
            f();
        }
    }
}

struct Rig {
    home: FakeHome,
    ctx: LaunchCtx,
    errors: Arc<Errors>,
}

impl Rig {
    fn new(prefix: &str) -> Rig {
        let home = FakeHome::new(prefix);
        let root = home.root().to_path_buf();
        let app_folder = root.join(".config").join("GameLib");
        let engine = Arc::new(
            EngineCtx::new(
                Arc::new(StoreHost::new()),
                Arc::new(SystemClock),
                Platform::Linux,
                EnginePaths {
                    tools_path: app_folder.join("tools"),
                    user_data: root.join("userdata"),
                    app_folder: app_folder.clone(),
                    user_home: root.clone(),
                    temp: root.join("tmp"),
                },
                Shutdown::new(),
            )
            .with_proc(Arc::new(SpecProcRunner)),
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
            InfoPlatform::Linux,
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
        let errors = Arc::new(Errors::default());
        let ctx = LaunchCtx::new(engine, knownfix, wine, info)
            .with_log_sink(Arc::new(QuietLog))
            .with_errors(errors.clone());
        Rig { home, ctx, errors }
    }

    /// The fake profile's variables and a fixed `PATH`: the environment a child is given.
    fn host(&self) -> RunnerHost {
        let mut env: BTreeMap<String, String> = self
            .home
            .env()
            .into_iter()
            .map(|(k, v)| (k.to_string(), v.to_string_lossy().into_owned()))
            .collect();
        env.insert("PATH".into(), "/usr/bin:/bin".into());
        RunnerHost {
            env,
            path: String::new(),
        }
    }

    fn args(&self, script: &str, abort_id: &str, observe: bool) -> RunnerCallArgs {
        RunnerCallArgs {
            stream_id: String::new(),
            command_parts: vec!["-c".into(), script.into()],
            runner: RunnerProps {
                name: RunnerName::Gog,
                bin: "/bin/sh".into(),
                dir: None,
                log_prefix: "Gog".into(),
            },
            env: Default::default(),
            wrappers: Vec::new(),
            log_message_prefix: None,
            log_targets: Vec::new(),
            log_sanitizer: None,
            abort_id: Some(abort_id.into()),
            track_key: None,
            cwd: None,
            skip_error_handler: false,
            observe,
            spawn_class: SpawnClassArg::Helper,
        }
    }

    async fn run(&self, args: RunnerCallArgs, sink: Arc<dyn OutputSink>) -> ExecResult {
        call_runner(&self.ctx, args, &self.host(), sink).await
    }
}

fn alive(pid: &str) -> bool {
    std::process::Command::new("kill")
        .args(["-0", pid])
        .stderr(std::process::Stdio::null())
        .status()
        .is_ok_and(|s| s.success())
}

fn read_pid(path: &Path) -> String {
    std::fs::read_to_string(path)
        .unwrap_or_default()
        .trim()
        .to_string()
}

async fn wait_for_file(path: &Path) {
    for _ in 0..400 {
        if path.exists() && !read_pid(path).is_empty() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    panic!("{path:?} never appeared");
}

fn null_sink() -> Arc<dyn OutputSink> {
    Observer::new()
}

// `Layer-2: runWineCommand with resolveOnExit resolves within 2000 ms while a pipe-holding grandchild
// lingers`. The TS callRunner waits for the pipes to close; the Rust runner gives the pipes a bounded drain
// after the child exits, so a grandchild that holds them for 8 s does not hold the result.
#[tokio::test]
async fn a_pipe_holding_grandchild_does_not_hold_the_result_past_the_post_exit_drain() {
    let rig = Rig::new("runner-real-grandchild-");
    let started = Instant::now();
    let result = rig
        .run(
            rig.args("(sleep 8 &) ; echo hi", "real-grandchild", true),
            Observer::new(),
        )
        .await;
    assert!(
        started.elapsed() < Duration::from_secs(5),
        "the run waited {:?} for a lingering grandchild",
        started.elapsed()
    );
    assert_eq!(result.error, None, "{result:?}");
    assert_eq!(result.stdout, "hi");
}

// `Layer-2: runWineCommand without resolveOnExit returns the exit code and output of a plain child`:
// for the runner, a real non-zero exit is the error and the child's output reached the error handler.
#[tokio::test]
async fn a_plain_child_with_output_and_a_non_zero_exit_reaches_the_error_handler() {
    let rig = Rig::new("runner-real-plain-");
    let result = rig
        .run(
            rig.args("echo out; echo err >&2; exit 4", "real-plain", false),
            null_sink(),
        )
        .await;
    assert_eq!(result.error.as_deref(), Some("Process exited with code 4"));
    let calls = lock(&rig.errors.calls).clone();
    assert!(
        calls.iter().any(|c| c.contains("out") && c.contains("err")),
        "the error handler was handed {calls:?}"
    );
}

// `Layer-2: callRunner aborted mid-run kills the child (abort path) and leaves nothing tracked`, and the
// child's whole group goes with it.
#[tokio::test]
async fn an_abort_mid_run_ends_the_run_and_kills_the_childs_group() {
    let rig = Rig::new("runner-real-abort-");
    let leader = rig.home.root().join("leader.pid");
    let grandchild = rig.home.root().join("grandchild.pid");
    let script = format!(
        "echo $$ > {l}; sleep 100 & echo $! > {g}; echo ready; wait",
        l = leader.display(),
        g = grandchild.display()
    );
    let observer = Observer::new();
    let ctx = rig.ctx.clone();
    observer.on_first(move || {
        assert!(run_abort(&ctx, "real-abort"));
    });
    let started = Instant::now();
    let result = rig
        .run(rig.args(&script, "real-abort", true), observer)
        .await;
    assert_eq!(result.abort, Some(true), "{result:?}");
    assert_eq!(result.error, None);
    assert!(started.elapsed() < Duration::from_secs(10));
    wait_for_file(&leader).await;
    wait_for_file(&grandchild).await;
    // Nothing is left tracked, and neither process survived.
    assert!(!run_abort(&rig.ctx, "real-abort"));
    for _ in 0..40 {
        if !alive(&read_pid(&leader)) && !alive(&read_pid(&grandchild)) {
            return;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!("the aborted run's processes are still alive");
}

// `Layer-2: callRunner reports a real non-zero exit as .error`.
#[tokio::test]
async fn a_real_non_zero_exit_is_the_error() {
    let rig = Rig::new("runner-real-exit-");
    let mut args = rig.args("exit 3", "real-exit", false);
    args.skip_error_handler = true;
    let result = rig.run(args, null_sink()).await;
    assert_eq!(result.error.as_deref(), Some("Process exited with code 3"));
    assert_eq!(result.stderr, "Process exited with code 3");
    assert!(lock(&rig.errors.calls).is_empty(), "skipErrorHandler");
}

#[tokio::test]
async fn a_child_ended_by_a_signal_is_an_error_naming_it() {
    let rig = Rig::new("runner-real-signal-");
    let mut args = rig.args("kill -TERM $$", "real-signal", false);
    args.skip_error_handler = true;
    let result = rig.run(args, null_sink()).await;
    assert_eq!(
        result.error.as_deref(),
        Some("Process terminated with signal SIGTERM")
    );
}

#[tokio::test]
async fn stderr_chunks_join_with_a_newline_and_stdout_chunks_with_nothing() {
    let rig = Rig::new("runner-real-join-");
    let script = "echo e1 >&2; sleep 0.3; echo e2 >&2; echo o1; sleep 0.3; echo o2";
    let observer = Observer::new();
    let result = rig
        .run(rig.args(script, "real-join", true), observer.clone())
        .await;
    assert_eq!(result.error, None, "{result:?}");
    assert_eq!(result.stderr, "e1\ne2");
    assert_eq!(result.stdout, "o1o2");
    assert!(result.full_command.starts_with("/bin/sh -c "));
}

// A 60-read transcript keeps the last 50 reads (the window counts chunks, not bytes), each chunk trimmed
// and joined with nothing: what the observer saw, last 50, is what the result holds.
#[tokio::test]
async fn a_sixty_chunk_transcript_keeps_the_last_fifty_reads() {
    let rig = Rig::new("runner-real-window-");
    let script = "i=1; while [ $i -le 60 ]; do echo line$i; sleep 0.05; i=$((i+1)); done";
    let observer = Observer::new();
    let result = rig
        .run(rig.args(script, "real-window", true), observer.clone())
        .await;
    assert_eq!(result.error, None, "{result:?}");
    let seen = observer.stdout_chunks();
    assert!(!seen.is_empty());
    let kept: Vec<String> = seen
        .iter()
        .rev()
        .take(50)
        .rev()
        .map(|c| c.trim().to_string())
        .collect();
    assert_eq!(result.stdout, kept.join(""));
    assert!(result.stdout.ends_with("line60"));
    if seen.len() > 50 {
        assert!(
            !result.stdout.contains("line1line2"),
            "the oldest reads left the window"
        );
    }
}

#[tokio::test]
async fn a_program_that_does_not_exist_is_a_spawn_error_not_a_hang() {
    let rig = Rig::new("runner-real-missing-");
    let mut args = rig.args("x", "real-missing", false);
    args.runner.bin = "/nonexistent/runner-binary".into();
    let result = rig.run(args, null_sink()).await;
    let error = result.error.expect("an error");
    assert!(error.starts_with("spawn "), "{error}");
    assert_eq!(result.stderr, error);
}
