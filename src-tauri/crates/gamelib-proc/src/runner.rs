//! `ProcRunner`: core's `ProcessRunner` over `SpawnClass::Helper` tokio children. The semantics
//! are those of steampoll's `TokioRunner` (argv only, null stdin, a timeout drops the wait future
//! so `kill_on_drop` kills the child, a cancelled stream drops the child), with every child
//! additionally registered in the global `ChildSet` so the exit path can reach it.

use crate::spawn::spawn_helper_tokio;
use gamelib_core::process::{BoxFuture, RunOutput, StreamingChild};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, BufReader};

pub struct ProcRunner {
    label: &'static str,
}

impl ProcRunner {
    /// A runner whose children are registered under `label` (shown by `ChildSet::labels`, and in
    /// the exit report when one needs the hard kill).
    pub fn helper(label: &'static str) -> ProcRunner {
        ProcRunner { label }
    }
}

impl gamelib_core::process::ProcessRunner for ProcRunner {
    fn run(&self, program: &str, argv: Vec<String>, timeout: Duration) -> BoxFuture<RunOutput> {
        let program = program.to_string();
        let label = self.label;
        Box::pin(async move {
            let mut cmd = tokio::process::Command::new(&program);
            cmd.args(&argv)
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            // The guard lives in this future, so the pid is unregistered when the child is gone.
            let Ok((child, _guard)) = spawn_helper_tokio(&mut cmd, label) else {
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
            .stderr(Stdio::null());
        let (mut child, guard) = spawn_helper_tokio(&mut cmd, self.label)?;
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
            // Dropping `child` here kills it (kill_on_drop); the guard unregisters its pid.
            drop(child);
            drop(guard);
        });
        Ok(StreamingChild { lines: rx, kill })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::children::global;
    use gamelib_core::process::ProcessRunner;

    #[tokio::test]
    async fn run_of_a_missing_program_is_the_default_output() {
        let r = ProcRunner::helper("runner-test-missing");
        let out = r
            .run(
                "gamelib-proc-no-such-program",
                vec![],
                Duration::from_secs(5),
            )
            .await;
        assert_eq!(out, RunOutput::default());
    }

    #[cfg(unix)]
    fn echo_x() -> (&'static str, Vec<String>) {
        ("/bin/sh", vec!["-c".into(), "echo x".into()])
    }

    #[cfg(windows)]
    fn echo_x() -> (&'static str, Vec<String>) {
        ("cmd", vec!["/C".into(), "echo x".into()])
    }

    #[tokio::test]
    async fn run_returns_stdout() {
        let r = ProcRunner::helper("runner-test-echo");
        let (program, argv) = echo_x();
        let out = r.run(program, argv, Duration::from_secs(15)).await;
        assert_eq!(out.code, Some(0));
        assert_eq!(out.stdout.trim(), "x");
    }

    #[tokio::test]
    async fn run_unregisters_its_child_when_it_returns() {
        // The set is process-wide and the tests run in parallel, so check this test's own label
        // rather than a total count.
        let label = "runner-test-unregister";
        let r = ProcRunner::helper(label);
        let (program, argv) = echo_x();
        let out = r.run(program, argv, Duration::from_secs(15)).await;
        assert_eq!(out.code, Some(0));
        assert!(
            !global().labels().contains(&label),
            "a finished run must leave nothing registered"
        );
    }
}
