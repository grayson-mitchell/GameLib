//! Child-process seam: the trait the machines run against, the real implementations live elsewhere.

use std::future::Future;
use std::pin::Pin;
use std::time::Duration;

pub type BoxFuture<T> = Pin<Box<dyn Future<Output = T> + Send>>;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RunOutput {
    /// `None` on spawn error or timeout.
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

/// A long-lived child: its stdout lines, and a token whose cancellation kills it.
pub struct StreamingChild {
    pub lines: tokio::sync::mpsc::Receiver<String>,
    pub kill: tokio_util::sync::CancellationToken,
}

pub trait ProcessRunner: Send + Sync + 'static {
    fn run(&self, program: &str, argv: Vec<String>, timeout: Duration) -> BoxFuture<RunOutput>;
    /// Must be called from inside a tokio runtime.
    fn spawn_streaming(&self, program: &str, argv: Vec<String>) -> std::io::Result<StreamingChild>;
}
