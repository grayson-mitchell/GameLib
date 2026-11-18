//! Seams the machines run against. The shell implements these for real; `testing` fakes them.

use crate::events::{AckReply, StateEvent};
use serde_json::{Map, Value};
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::time::Duration;

pub type BoxFuture<T> = Pin<Box<dyn Future<Output = T> + Send>>;

/// Text of a notification: literal, or an i18n key rendered by gamelib-i18n.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NotifyText {
    Literal(String),
    Key {
        key: String,
        default: String,
        params: Map<String, Value>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Notification {
    pub title: NotifyText,
    pub body: NotifyText,
}

pub trait PollHost: Send + Sync + 'static {
    /// Emit a webview message on `channel` (gameStatusUpdate, progressUpdate, steamRequestNotice).
    fn emit_frontend(&self, channel: &str, args: Vec<Value>);
    fn notify(&self, n: Notification);
    /// Send a state event to the sidecar and wait for its ack (D-05).
    fn state_event(&self, ev: StateEvent) -> BoxFuture<AckReply>;
    fn bridge_helper_path(&self) -> Option<PathBuf>;
    fn shell_pid(&self) -> u32;
}

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

/// Wall clock for `recordedAt`, `lastTickMs`, `lastSteamProbeMs`. Ticks use `tokio::time`.
pub trait Clock: Send + Sync + 'static {
    fn now_ms(&self) -> u64;
}
