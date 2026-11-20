//! Process-wide runtime (R4) and the real `Clock`.
//!
//! The runtime is crate-private and exposed only as a `Handle`. The production `ProcessRunner` is
//! `gamelib_proc::runner::ProcRunner` (Phase 83, D-14), built by the shell; the crate's own
//! real-spawn runner below exists only under the `testing` feature.

use std::sync::OnceLock;
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

pub use gamelib_core::clock::SystemClock;

/// A real-spawn `ProcessRunner` for this crate's own tests (argv only, null stdin, `kill_on_drop`).
/// Production spawns go through `gamelib_proc::runner::ProcRunner` (D-14), which also registers
/// every child with the exit path and the reaper, so this runner is compiled only with `testing`.
#[cfg(feature = "testing")]
pub use tokio_runner::TokioRunner;

#[cfg(feature = "testing")]
mod tokio_runner {
    use crate::host::{BoxFuture, ProcessRunner, RunOutput, StreamingChild};
    use std::process::Stdio;
    use std::time::Duration;
    use tokio::io::{AsyncBufReadExt, BufReader};

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

        fn spawn_streaming(
            &self,
            program: &str,
            argv: Vec<String>,
        ) -> std::io::Result<StreamingChild> {
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
}
