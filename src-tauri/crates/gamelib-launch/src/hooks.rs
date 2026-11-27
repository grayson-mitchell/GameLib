//! The seam from the Rust launch services to the TypeScript managers (88.2-09, D-26).
//!
//! The funnel and the runner's error handling reach a few things only the TS library managers own. Until
//! 91 and 92 move the managers into Rust, each of those is a call back into TS, and this trait is the one
//! place the crate names them: the shell implements [`ManagerHooks`] over its sidecar channel, a test
//! implements it with [`testing::RecordingHooks`], and a context with none (the CLI, a headless run)
//! answers every hook as unavailable.
//!
//! 88.2 introduced exactly two ops, [`ManagerHooks::game_title`] and [`ManagerHooks::force_uninstall`];
//! 88.3-04 adds the funnel's two, [`ManagerHooks::launch_facts`] and [`ManagerHooks::launch`]. Every op added is
//! a TS channel the managers implement until 91 and 92, so the trait stays as small as the callers allow. The
//! two new ops have a default body that answers `unavailable`: the shell's implementation gets them with the
//! transport of 88.3-06, and a context with no hooks already answers every hook that way.
//!
//! A hook failing is an answer, not a crash: [`HookError`] carries a fixed category word and never a
//! payload (T-88.2-14), so a failure can be logged without carrying a title, a path or an error text.

use gamelib_core::process::BoxFuture;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::funnel::log::LogHandOffWire;
use crate::runner::RunnerName;

/// A hook that could not answer. The word is a fixed category (`"unavailable"`, `"failed"`, ...), never
/// the text of the underlying error: a title or a path must not reach a log through this type.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HookError(pub &'static str);

/// The global settings a launch reads (`config.getSettings()`): the TS read them three to five times per launch
/// (D-20 candidate); the funnel asks once, with the rest of the facts.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GlobalFacts {
    #[serde(default)]
    pub minimize_on_launch: bool,
    #[serde(default)]
    pub no_tray_icon: bool,
    #[serde(default)]
    pub disable_logs: bool,
    #[serde(default)]
    pub disable_playtime_sync: bool,
}

/// What the funnel needs to know about a game before it launches (`launch_facts`): the TS `getGameInfo()` and
/// `getSettings()` answers as JSON the funnel reads by key, whether the game is native, the game config's
/// `verboseLogs` (a different store from `settings`, so it is its own field: D-20 candidate), the global
/// settings and whether this process was started without a window (`isCLINoGui`).
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LaunchFacts {
    pub game_info: Value,
    pub settings: Value,
    #[serde(default)]
    pub is_native: bool,
    #[serde(default)]
    pub verbose_logs: bool,
    #[serde(default)]
    pub global: GlobalFacts,
    #[serde(default)]
    pub cli_no_gui: bool,
}

/// What the `launch` hook is told (`game.launch(logWriter, launchArguments, args, skipVersionCheck)`): the
/// arguments exactly as the TS passed them (an absent one stays absent) and the per-game log's state, which
/// says whether the rotation is still owed.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchHookArgs {
    pub launch_arguments: Option<Value>,
    pub args: Option<Vec<String>>,
    pub skip_version_check: Option<bool>,
    pub log: LogHandOffWire,
}

/// What the `launch` hook answers when the game's process is over: whether the launch worked (`game.launch`'s
/// boolean) and whether its facade claimed the per-game log's rotation (so the funnel never rotates it again).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LaunchHookReply {
    pub launched: bool,
    #[serde(default)]
    pub rotated: bool,
}

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

    /// What the funnel reads before a launch (`getGameInfo`, `getSettings`, `isNative`, the game config's
    /// `verboseLogs`, the global settings). Unavailable unless an implementation answers it.
    fn launch_facts(
        &self,
        _runner: RunnerName,
        _app_name: &str,
    ) -> BoxFuture<Result<LaunchFacts, HookError>> {
        Box::pin(async { Err(HookError("unavailable")) })
    }

    /// `game.launch(...)` and its presence calls: runs the game and answers when it is over. It may take
    /// hours, so the funnel races it against the shutdown token. Unavailable unless an implementation answers it.
    fn launch(
        &self,
        _runner: RunnerName,
        _app_name: &str,
        _args: LaunchHookArgs,
    ) -> BoxFuture<Result<LaunchHookReply, HookError>> {
        Box::pin(async { Err(HookError("unavailable")) })
    }
}

#[cfg(feature = "testing")]
pub mod testing {
    use std::sync::{Arc, Mutex};

    use gamelib_core::process::BoxFuture;
    use serde_json::{json, Value};

    use super::{HookError, LaunchFacts, LaunchHookArgs, LaunchHookReply, ManagerHooks};
    use crate::funnel::testing::Tape;
    use crate::runner::RunnerName;

    /// One call a [`RecordingHooks`] saw.
    #[derive(Debug, Clone, PartialEq)]
    pub enum HookCall {
        LaunchFacts {
            runner: RunnerName,
            app_name: String,
        },
        Launch {
            runner: RunnerName,
            app_name: String,
            args: LaunchHookArgs,
        },
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
        facts: Result<LaunchFacts, HookError>,
        launch: Result<LaunchHookReply, HookError>,
        /// The launch hook never answers (a game that never ends), so a test can end the launch another way.
        launch_pends: bool,
        /// Run when the launch hook is called, before it answers (a test moves its clock by the session here).
        on_launch: Option<Arc<dyn Fn() + Send + Sync>>,
        calls: Mutex<Vec<HookCall>>,
        tape: Option<Tape>,
    }

    impl Default for RecordingHooks {
        fn default() -> Self {
            RecordingHooks {
                title: Err(HookError("unavailable")),
                force_uninstall: Ok(()),
                facts: Err(HookError("unavailable")),
                launch: Err(HookError("unavailable")),
                launch_pends: false,
                on_launch: None,
                calls: Mutex::new(Vec::new()),
                tape: None,
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

        /// Every facts read answers `facts`.
        pub fn with_launch_facts(
            mut self,
            facts: Result<LaunchFacts, HookError>,
        ) -> RecordingHooks {
            self.facts = facts;
            self
        }

        /// Every `launch` call answers `reply`.
        pub fn with_launch(mut self, reply: Result<LaunchHookReply, HookError>) -> RecordingHooks {
            self.launch = reply;
            self
        }

        /// The `launch` hook never answers.
        pub fn with_launch_pending(mut self) -> RecordingHooks {
            self.launch_pends = true;
            self
        }

        /// `effect` runs when the `launch` hook is called, before it answers.
        pub fn with_on_launch(mut self, effect: Arc<dyn Fn() + Send + Sync>) -> RecordingHooks {
            self.on_launch = Some(effect);
            self
        }

        /// Writes the `launch` call, in the TS recorder's `hook` event shape, to `tape`.
        pub fn with_tape(mut self, tape: Tape) -> RecordingHooks {
            self.tape = Some(tape);
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

        fn launch_facts(
            &self,
            runner: RunnerName,
            app_name: &str,
        ) -> BoxFuture<Result<LaunchFacts, HookError>> {
            self.calls
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .push(HookCall::LaunchFacts {
                    runner,
                    app_name: app_name.to_string(),
                });
            let answer = self.facts.clone();
            Box::pin(async move { answer })
        }

        fn launch(
            &self,
            runner: RunnerName,
            app_name: &str,
            args: LaunchHookArgs,
        ) -> BoxFuture<Result<LaunchHookReply, HookError>> {
            self.calls
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .push(HookCall::Launch {
                    runner,
                    app_name: app_name.to_string(),
                    args: args.clone(),
                });
            if let Some(tape) = &self.tape {
                // The TS recorder wrote `game.launch`'s arguments as a list, an absent one as null, and the
                // writer as its target plus whether an earlier entry had claimed the rotation.
                tape(json!({
                    "kind": "hook",
                    "hook": "launch",
                    "runner": runner.as_str(),
                    "args": [
                        args.launch_arguments.clone().unwrap_or(Value::Null),
                        args.args.clone().map_or(Value::Null, |a| json!(a)),
                        args.skip_version_check.map_or(Value::Null, |b| json!(b)),
                    ],
                    "writer": {
                        "target": serde_json::to_value(&args.log.target).unwrap_or(Value::Null),
                        "rotationClaimed": !args.log.rotate && !args.log.disabled,
                    },
                }));
            }
            if let Some(effect) = &self.on_launch {
                effect();
            }
            if self.launch_pends {
                return Box::pin(std::future::pending());
            }
            let answer = self.launch;
            Box::pin(async move { answer })
        }
    }
}
