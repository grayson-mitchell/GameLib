//! What the launch funnel asks of the shell (88.3-04): the main window, the display-sleep blocker and the
//! app exit. The crate is Tauri-free, so the shell implements [`FunnelShell`] and a context with none (the CLI,
//! a headless run) skips every one of these: no window to hide, no blocker to hold, no app to exit.

use std::sync::Mutex;

/// The window and power facts of one launch. Every call is fire and forget except the blocker, which answers
/// the id to stop it with (`None` when none could be started).
pub trait FunnelShell: Send + Sync {
    /// `appState.hideMainWindow()`.
    fn hide_main_window(&self);
    /// `appState.wakeLock.start(kind)`; `kind` is `prevent-display-sleep`.
    fn wake_lock_start(&self, kind: &str) -> Option<u32>;
    /// `appState.wakeLock.stop(id)`.
    fn wake_lock_stop(&self, id: u32);
    /// `appState.exit()`: a launch made without a window ends the app with the game.
    fn exit_app(&self);
}

/// The display-sleep blocker a context holds (the TS launcher's per-instance `PowerState`): one id, held by
/// the first launch that needs it and given back by the launch that ends while it is held.
#[derive(Debug, Default)]
pub struct PowerState {
    display_id: Mutex<Option<u32>>,
}

impl PowerState {
    pub fn new() -> PowerState {
        PowerState::default()
    }

    fn slot(&self) -> std::sync::MutexGuard<'_, Option<u32>> {
        self.display_id.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Whether a blocker is held. An id of 0 counts as not held, as `!deps.power.displayId` did in the TS.
    pub fn is_held(&self) -> bool {
        matches!(*self.slot(), Some(id) if id != 0)
    }

    pub fn set(&self, id: Option<u32>) {
        *self.slot() = id;
    }

    /// Takes the held id, leaving none: `None` when nothing is held (a `null` id in the TS).
    pub fn take(&self) -> Option<u32> {
        self.slot().take()
    }
}

#[cfg(feature = "testing")]
pub mod testing {
    use std::sync::Mutex;

    use serde_json::json;

    use super::FunnelShell;
    use crate::funnel::testing::Tape;

    /// The id the TS oracle's fake `wakeLock.start` answered.
    pub const WAKE_LOCK_ID: u32 = 7;

    /// One call a [`RecordingShell`] saw.
    #[derive(Debug, Clone, PartialEq, Eq)]
    pub enum ShellCall {
        HideMainWindow,
        WakeLockStart(String),
        WakeLockStop(u32),
        ExitApp,
    }

    /// A shell that records every call and answers [`WAKE_LOCK_ID`] (or none) for the blocker. With a tape it
    /// also writes each call, in the TS recorder's `appState` event shape, so one list holds the order across
    /// every recorder.
    pub struct RecordingShell {
        wake_lock: Option<u32>,
        calls: Mutex<Vec<ShellCall>>,
        tape: Option<Tape>,
    }

    impl Default for RecordingShell {
        fn default() -> Self {
            RecordingShell {
                wake_lock: Some(WAKE_LOCK_ID),
                calls: Mutex::new(Vec::new()),
                tape: None,
            }
        }
    }

    impl RecordingShell {
        pub fn new() -> RecordingShell {
            RecordingShell::default()
        }

        /// The id `wake_lock_start` answers (`None`: no blocker could be started).
        pub fn with_wake_lock(mut self, id: Option<u32>) -> RecordingShell {
            self.wake_lock = id;
            self
        }

        pub fn with_tape(mut self, tape: Tape) -> RecordingShell {
            self.tape = Some(tape);
            self
        }

        pub fn calls(&self) -> Vec<ShellCall> {
            self.calls.lock().unwrap_or_else(|e| e.into_inner()).clone()
        }

        fn note(&self, call: ShellCall, member: &str, args: Vec<serde_json::Value>) {
            self.calls
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .push(call);
            if let Some(tape) = &self.tape {
                tape(json!({ "kind": "appState", "member": member, "args": args }));
            }
        }
    }

    impl FunnelShell for RecordingShell {
        fn hide_main_window(&self) {
            self.note(ShellCall::HideMainWindow, "hideMainWindow", vec![]);
        }

        fn wake_lock_start(&self, kind: &str) -> Option<u32> {
            self.note(
                ShellCall::WakeLockStart(kind.to_string()),
                "wakeLock.start",
                vec![json!(kind)],
            );
            self.wake_lock
        }

        fn wake_lock_stop(&self, id: u32) {
            self.note(
                ShellCall::WakeLockStop(id),
                "wakeLock.stop",
                vec![json!(id)],
            );
        }

        fn exit_app(&self) {
            self.note(ShellCall::ExitApp, "exit", vec![]);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_zero_id_is_not_a_held_blocker_and_take_gives_the_id_back_once() {
        let power = PowerState::new();
        assert!(!power.is_held());
        power.set(Some(0));
        assert!(!power.is_held());
        power.set(Some(7));
        assert!(power.is_held());
        assert_eq!(power.take(), Some(7));
        assert_eq!(power.take(), None);
        assert!(!power.is_held());
    }
}
