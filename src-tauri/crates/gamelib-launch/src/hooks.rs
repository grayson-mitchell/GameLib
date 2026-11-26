//! The seam from the Rust launch services to the TypeScript managers (88.2-09, D-26).
//!
//! The funnel and the runner's error handling reach a few things only the TS library managers own. Until
//! 91 and 92 move the managers into Rust, each of those is a call back into TS, and this trait is the one
//! place the crate names them: the shell implements [`ManagerHooks`] over its sidecar channel, a test
//! implements it with [`testing::RecordingHooks`], and a context with none (the CLI, a headless run)
//! answers every hook as unavailable.
//!
//! 88.2 introduces exactly two ops, [`ManagerHooks::game_title`] and [`ManagerHooks::force_uninstall`];
//! 88.3 adds the funnel's ops to this same trait. Every op added is a TS channel the managers implement
//! until 91 and 92, so the trait stays as small as the callers allow.
//!
//! A hook failing is an answer, not a crash: [`HookError`] carries a fixed category word and never a
//! payload (T-88.2-14), so a failure can be logged without carrying a title, a path or an error text.

use gamelib_core::process::BoxFuture;

use crate::runner::RunnerName;

/// A hook that could not answer. The word is a fixed category (`"unavailable"`, `"failed"`, ...), never
/// the text of the underlying error: a title or a path must not reach a log through this type.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HookError(pub &'static str);

/// What the TS library managers answer to the Rust launch services.
///
/// The returned futures own their arguments (the implementation copies what it needs before it builds
/// the future), so a caller may drop a borrow of its own as soon as the call is made.
pub trait ManagerHooks: Send + Sync {
    /// The game's title as the manager knows it (`resolveTitleForGame`). The caller falls back to the app
    /// name on an error, and on an empty answer.
    fn game_title(
        &self,
        runner: RunnerName,
        app_name: &str,
    ) -> BoxFuture<Result<String, HookError>>;

    /// Removes the game from the installed list without touching its files (`game.forceUninstall()`).
    fn force_uninstall(
        &self,
        runner: RunnerName,
        app_name: &str,
    ) -> BoxFuture<Result<(), HookError>>;
}

#[cfg(feature = "testing")]
pub mod testing {
    use std::sync::Mutex;

    use gamelib_core::process::BoxFuture;

    use super::{HookError, ManagerHooks};
    use crate::runner::RunnerName;

    /// One call a [`RecordingHooks`] saw.
    #[derive(Debug, Clone, PartialEq, Eq)]
    pub enum HookCall {
        GameTitle {
            runner: RunnerName,
            app_name: String,
        },
        ForceUninstall {
            runner: RunnerName,
            app_name: String,
        },
    }

    /// Hooks that answer from a script and record every call, in order. By default a title lookup fails
    /// (`unavailable`) and a force uninstall succeeds.
    pub struct RecordingHooks {
        title: Result<String, HookError>,
        force_uninstall: Result<(), HookError>,
        calls: Mutex<Vec<HookCall>>,
    }

    impl Default for RecordingHooks {
        fn default() -> Self {
            RecordingHooks {
                title: Err(HookError("unavailable")),
                force_uninstall: Ok(()),
                calls: Mutex::new(Vec::new()),
            }
        }
    }

    impl RecordingHooks {
        pub fn new() -> RecordingHooks {
            RecordingHooks::default()
        }

        /// Every title lookup answers `title`.
        pub fn with_title(mut self, title: Result<String, HookError>) -> RecordingHooks {
            self.title = title;
            self
        }

        /// Every force uninstall answers `result`.
        pub fn with_force_uninstall(mut self, result: Result<(), HookError>) -> RecordingHooks {
            self.force_uninstall = result;
            self
        }

        /// Every call so far, in order.
        pub fn calls(&self) -> Vec<HookCall> {
            self.calls.lock().unwrap_or_else(|e| e.into_inner()).clone()
        }
    }

    impl ManagerHooks for RecordingHooks {
        fn game_title(
            &self,
            runner: RunnerName,
            app_name: &str,
        ) -> BoxFuture<Result<String, HookError>> {
            self.calls
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .push(HookCall::GameTitle {
                    runner,
                    app_name: app_name.to_string(),
                });
            let answer = self.title.clone();
            Box::pin(async move { answer })
        }

        fn force_uninstall(
            &self,
            runner: RunnerName,
            app_name: &str,
        ) -> BoxFuture<Result<(), HookError>> {
            self.calls
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .push(HookCall::ForceUninstall {
                    runner,
                    app_name: app_name.to_string(),
                });
            let answer = self.force_uninstall;
            Box::pin(async move { answer })
        }
    }
}
