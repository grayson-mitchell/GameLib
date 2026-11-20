//! Seams the machines run against. The shell implements these for real; `testing` fakes them.

use crate::events::{AckReply, StateEvent};
use serde_json::{Map, Value};
use std::path::PathBuf;

pub use gamelib_core::clock::Clock;
pub use gamelib_core::process::{BoxFuture, ProcessRunner, RunOutput, StreamingChild};

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
