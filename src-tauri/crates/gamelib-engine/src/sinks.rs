//! What an engine op says to the outside, as seams: the UI sinks (D-02) and the log.
//!
//! The TS engine step shows a system notification, raises the main window, shows an in-app dialog
//! with an acknowledgement id and pushes a message at the sidecar (`engineDialogs.ts`). A Rust op
//! has no window of its own, so each of those is a method of [`EngineUi`], which the shell
//! implements (over the tray, the main window and the sidecar relay) and tests replace with a
//! recording fake. The CLI has none (`EngineCtx::ui` is `None`), so a headless run never opens a
//! window or notifies anyone.

use gamelib_core::emitter::FrontendEmitter;
use serde_json::Value;

/// The window-facing surface of the engine step.
pub trait EngineUi: Send + Sync + 'static {
    /// A system notification: no window raise, no modal.
    fn notify(&self, title: &str, body: &str);

    /// An in-app dialog (`kind` is the dialog type, `MESSAGE` for a notice). `ack_id` is the id the
    /// renderer echoes back once it has displayed the dialog, so the caller can tell a shown dialog
    /// from a lost one. `true` when the dialog frame was sent.
    fn show_dialog(&self, title: &str, body: &str, kind: &str, ack_id: &str) -> bool;

    /// Brings the main window to the front (a refused launch: the user pressed Play and nothing
    /// else will say why it did nothing).
    fn raise_main_window(&self);

    /// A frame for the sidecar over its IPC channel (a Rust op telling a TS owner that state moved).
    fn send_to_sidecar(&self, channel: &str, args: Vec<Value>);
}

/// The engine's log. A line is fixed text (an op name, a short tag, a count); it never carries a URL,
/// a query, a header, a token or a profile path (T-86-15 and the same rule as `gamelib-info`).
pub trait EngineLog: Send + Sync + 'static {
    fn info(&self, line: &str);
    fn warn(&self, line: &str);
    fn error(&self, line: &str);
}

/// The emitter a context gets until the shell's is wired in: the push goes nowhere.
#[derive(Debug, Default, Clone, Copy)]
pub struct NullEmitter;

impl FrontendEmitter for NullEmitter {
    fn emit(&self, _channel: &str, _args: Vec<Value>) {}
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn the_null_emitter_swallows_a_push_through_a_shared_trait_object() {
        let emitter: Arc<dyn FrontendEmitter> = Arc::new(NullEmitter);
        emitter.emit(
            "gameStatusUpdate",
            vec![serde_json::json!({"appName": "480"})],
        );
    }
}
