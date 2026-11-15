//! Process-wide runtime (R4) and the real `ProcessRunner` / `Clock`.
//!
//! The runtime is crate-private and exposed only as a `Handle`. Children are spawned argv-only,
//! never with an `env` literal, with `kill_on_drop(true)` and a null stdin.

use crate::host::{BoxFuture, Clock, ProcessRunner, RunOutput, StreamingChild};
use std::process::Stdio;
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::runtime::{Handle, Runtime};

fn runtime() -> &'static Runtime {
    static RT: OnceLock<Runtime> = OnceLock::new();
    RT.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .max_blocking_threads(8)
            .thread_name("steampoll")
            .enable_all()
            .build()
            .expect("steampoll runtime")
    })
}

/// Handle of the poll runtime. The shell passes this to `Registry::new`.
pub fn handle() -> Handle {
    runtime().handle().clone()
}

pub struct SystemClock;

impl Clock for SystemClock {
    fn now_ms(&self) -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    }
}

pub struct TokioRunner;

impl ProcessRunner for TokioRunner {
    fn run(&self, program: &str, argv: Vec<String>, timeout: Duration) -> BoxFuture<RunOutput> {
        let program = program.to_string();
        Box::pin(async move {
            let mut cmd = tokio::process::Command::new(&program);
            cmd.args(&argv)
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .kill_on_drop(true);
            let Ok(child) = cmd.spawn() else {
                return RunOutput::default();
            };
            // On timeout the wait future is dropped, and kill_on_drop kills the child.
            match tokio::time::timeout(timeout, child.wait_with_output()).await {
                Ok(Ok(out)) => RunOutput {
                    code: out.status.code(),
                    stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
                    stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
                },
                _ => RunOutput::default(),
            }
        })
    }

    fn spawn_streaming(&self, program: &str, argv: Vec<String>) -> std::io::Result<StreamingChild> {
        let mut cmd = tokio::process::Command::new(program);
        cmd.args(&argv)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        let mut child = cmd.spawn()?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| std::io::Error::other("no stdout"))?;
        let (tx, rx) = tokio::sync::mpsc::channel(256);
        let kill = tokio_util::sync::CancellationToken::new();
        let token = kill.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            loop {
                tokio::select! {
                    _ = token.cancelled() => break,
                    line = lines.next_line() => match line {
                        Ok(Some(l)) => {
                            if tx.send(l).await.is_err() {
                                break;
                            }
                        }
                        _ => break,
                    },
                }
            }
            // Dropping `child` here kills it (kill_on_drop).
            drop(child);
        });
        Ok(StreamingChild { lines: rx, kill })
    }
}
