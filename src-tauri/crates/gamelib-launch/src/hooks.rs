//! The seam from the Rust launch services to the TypeScript managers (88.2-09, D-26).
//!
//! The funnel and the runner's error handling reach a few things only the TS library managers own. Until
//! 91 and 92 move the managers into Rust, each of those is a call back into TS, and this trait is the one
//! place the crate names them: the shell implements [`ManagerHooks`] over its sidecar channel, a test
//! implements it with [`testing::RecordingHooks`], and a context with none (the CLI, a headless run)
//! answers every hook as unavailable.
//!
//! 88.2 introduced exactly two ops, [`ManagerHooks::game_title`] and [`ManagerHooks::force_uninstall`];
//! 88.3-04 adds the funnel's two, [`ManagerHooks::launch_facts`] and [`ManagerHooks::launch`]; 88.3-05 adds the
//! other six the rest of the funnel calls (D-26): [`ManagerHooks::sync_saves`], [`ManagerHooks::set_presence`],
//! [`ManagerHooks::clear_presence`], [`ManagerHooks::persist_bottle_wine_version`],
//! [`ManagerHooks::update_gog_playtime`] and [`ManagerHooks::wine_settings_write`]. Every op added is a TS
//! channel the managers implement until 91 and 92, so the trait stays as small as the callers allow. Each new
//! op has a default body that answers `unavailable`: the shell's implementation gets them with the transport
//! of 88.3-06, and a context with no hooks already answers every hook that way.
//!
//! A hook whose TS call throws answers the fixed category `failed` and the TS handler writes its own error
//! line, so no error text crosses into Rust (T-88.2-14). A hook a store does not define answers `unavailable`.
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

/// Which half of the cloud-saves sync a call asks for (`game.syncSaves`'s first argument).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum SyncDirection {
    /// `--skip-upload`: before the launch, saves come down.
    SkipUpload,
    /// `--skip-download`: after the launch, saves go up.
    SkipDownload,
}

impl SyncDirection {
    /// The flag the legendary and GOG sync commands take.
    pub fn flag(self) -> &'static str {
        match self {
            SyncDirection::SkipUpload => "--skip-upload",
            SyncDirection::SkipDownload => "--skip-download",
        }
    }
}

/// What `game.syncSaves(direction, savesPath, gogSaves)` is told, as the TS passed it: the game's settings
/// values, an absent one staying `null`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSavesArgs {
    pub direction: SyncDirection,
    pub saves_path: Value,
    pub gog_saves: Value,
}

/// The two `wineVersion` writes the Wine check's reply asks for (T-88.1-40, T-88.3-10): the global setting
/// (the default wine just downloaded), written first, and the game's own. Only that one key is ever written,
/// and only with the wine Rust's own check chose.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct WineSettingsWrite {
    pub global: Option<Value>,
    pub game: Option<Value>,
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

    /// `game.syncSaves(...)`: one half of the cloud-saves sync. A `failed` answer means the TS call threw and
    /// its handler wrote the error line; the launch goes on either way.
    fn sync_saves(
        &self,
        _runner: RunnerName,
        _app_name: &str,
        _args: SyncSavesArgs,
    ) -> BoxFuture<Result<(), HookError>> {
        Box::pin(async { Err(HookError("unavailable")) })
    }

    /// `launchHooks[runner].setPresence?.(appName)`. `unavailable` when the store defines none.
    fn set_presence(
        &self,
        _runner: RunnerName,
        _app_name: &str,
    ) -> BoxFuture<Result<(), HookError>> {
        Box::pin(async { Err(HookError("unavailable")) })
    }

    /// `launchHooks[runner].clearPresence?.()`. `unavailable` when the store defines none.
    fn clear_presence(&self, _runner: RunnerName) -> BoxFuture<Result<(), HookError>> {
        Box::pin(async { Err(HookError("unavailable")) })
    }

    /// `launchHooks[runner].persistBottleWineVersion?.(wineVersion)` (the Steam bottle's re-persist after a
    /// passing Wine check). `unavailable` when the store defines none.
    fn persist_bottle_wine_version(
        &self,
        _runner: RunnerName,
        _app_name: &str,
        _wine: Value,
    ) -> BoxFuture<Result<(), HookError>> {
        Box::pin(async { Err(HookError("unavailable")) })
    }

    /// `libraryManagers.gog.getGame(app).updateGOGPlaytime(start, end)`, the instants as `toISOString` text.
    fn update_gog_playtime(
        &self,
        _app_name: &str,
        _start_iso: &str,
        _end_iso: &str,
    ) -> BoxFuture<Result<(), HookError>> {
        Box::pin(async { Err(HookError("unavailable")) })
    }

    /// The Wine check's two `wineVersion` writes (`config.setSetting`, then the game config's `setSetting`).
    fn wine_settings_write(
        &self,
        _app_name: &str,
        _write: WineSettingsWrite,
    ) -> BoxFuture<Result<(), HookError>> {
        Box::pin(async { Err(HookError("unavailable")) })
    }
}

#[cfg(feature = "testing")]
pub mod testing {
    use std::sync::{Arc, Mutex};

    use gamelib_core::process::BoxFuture;
    use serde_json::{json, Value};

    use super::{
        HookError, LaunchFacts, LaunchHookArgs, LaunchHookReply, ManagerHooks, SyncDirection,
        SyncSavesArgs, WineSettingsWrite,
    };
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
        SyncSaves {
            runner: RunnerName,
            app_name: String,
            args: SyncSavesArgs,
        },
        SetPresence {
            runner: RunnerName,
            app_name: String,
        },
        ClearPresence {
            runner: RunnerName,
        },
        PersistBottleWineVersion {
            runner: RunnerName,
            app_name: String,
            wine: Value,
        },
        UpdateGogPlaytime {
            app_name: String,
            start_iso: String,
            end_iso: String,
        },
        WineSettingsWrite {
            app_name: String,
            write: WineSettingsWrite,
        },
    }

    /// Hooks that answer from a script and record every call, in order. By default a title lookup fails
    /// (`unavailable`), a force uninstall succeeds, the store defines no presence and no bottle hook, a sync and a
    /// playtime post succeed and a Wine settings write succeeds.
    ///
    /// A scripted rejection (`with_*_rejection`) stands for "the TS call threw": the hook answers the fixed
    /// category `failed` and, with a tape, writes the lines the TS handler of 88.3-08 writes in production around
    /// that rejection (so the order across the seam is part of what a replay compares).
    pub struct RecordingHooks {
        title: Result<String, HookError>,
        force_uninstall: Result<(), HookError>,
        facts: Result<LaunchFacts, HookError>,
        launch: Result<LaunchHookReply, HookError>,
        /// The launch hook never answers (a game that never ends), so a test can end the launch another way.
        launch_pends: bool,
        /// `game.launch` rejects with this message: the TS handler writes the exception lines.
        launch_rejection: Option<String>,
        /// Run when the launch hook is called, before it answers (a test moves its clock by the session here).
        on_launch: Option<Arc<dyn Fn() + Send + Sync>>,
        /// Run when the facts are read (a test flips its network state here, as the TS recorder's `getSettings`).
        on_facts: Option<Arc<dyn Fn() + Send + Sync>>,
        sync_saves: Result<(), String>,
        presence_defined: bool,
        persist_defined: bool,
        update_gog: Result<(), String>,
        wine_write: Result<(), HookError>,
        /// The title the TS handler's own lines carry.
        line_title: String,
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
                launch_rejection: None,
                on_launch: None,
                on_facts: None,
                sync_saves: Ok(()),
                presence_defined: false,
                persist_defined: false,
                update_gog: Ok(()),
                wine_write: Ok(()),
                line_title: String::new(),
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

        /// `game.launch` rejects with `message`; the hook answers a game that did not launch, after the lines
        /// the TS handler writes for the exception.
        pub fn with_launch_rejection(mut self, message: &str) -> RecordingHooks {
            self.launch_rejection = Some(message.to_string());
            self
        }

        /// `effect` runs when the `launch` hook is called, before it answers.
        pub fn with_on_launch(mut self, effect: Arc<dyn Fn() + Send + Sync>) -> RecordingHooks {
            self.on_launch = Some(effect);
            self
        }

        /// `effect` runs when the facts are read, before they are answered.
        pub fn with_on_facts(mut self, effect: Arc<dyn Fn() + Send + Sync>) -> RecordingHooks {
            self.on_facts = Some(effect);
            self
        }

        /// Every `sync_saves` call answers `reply`; an `Err` is the message the TS call rejected with.
        pub fn with_sync_saves(mut self, reply: Result<(), String>) -> RecordingHooks {
            self.sync_saves = reply;
            self
        }

        /// The store defines `setPresence` and `clearPresence` (the GOG store does).
        pub fn with_presence(mut self, defined: bool) -> RecordingHooks {
            self.presence_defined = defined;
            self
        }

        /// The store defines `persistBottleWineVersion` (the Steam store does).
        pub fn with_persist_bottle_wine_version(mut self, defined: bool) -> RecordingHooks {
            self.persist_defined = defined;
            self
        }

        /// Every `update_gog_playtime` call answers `reply`; an `Err` is the message the TS call rejected with.
        pub fn with_update_gog_playtime(mut self, reply: Result<(), String>) -> RecordingHooks {
            self.update_gog = reply;
            self
        }

        /// Every `wine_settings_write` call answers `reply`.
        pub fn with_wine_settings_write(mut self, reply: Result<(), HookError>) -> RecordingHooks {
            self.wine_write = reply;
            self
        }

        /// The game title the TS handler's own error lines carry (`Error while downloading saves for <title>.`).
        pub fn with_line_title(mut self, title: &str) -> RecordingHooks {
            self.line_title = title.to_string();
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

        fn note(&self, call: HookCall) {
            self.calls
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .push(call);
        }

        fn tape(&self, event: Value) {
            if let Some(tape) = &self.tape {
                tape(event);
            }
        }

        fn hook_event(&self, hook: &str, runner: &str, args: Vec<Value>) {
            self.tape(json!({ "kind": "hook", "hook": hook, "runner": runner, "args": args }));
        }

        /// A line the TS handler writes to `gamelib.log`.
        fn general_error(&self, text: &str) {
            self.tape(
                json!({ "kind": "log", "level": "error", "prefix": "Backend", "text": text }),
            );
        }
    }

    impl ManagerHooks for RecordingHooks {
        fn game_title(
            &self,
            runner: RunnerName,
            app_name: &str,
        ) -> BoxFuture<Result<String, HookError>> {
            self.note(HookCall::GameTitle {
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
            self.note(HookCall::ForceUninstall {
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
            self.note(HookCall::LaunchFacts {
                runner,
                app_name: app_name.to_string(),
            });
            if let Some(effect) = &self.on_facts {
                effect();
            }
            let answer = self.facts.clone();
            Box::pin(async move { answer })
        }

        fn launch(
            &self,
            runner: RunnerName,
            app_name: &str,
            args: LaunchHookArgs,
        ) -> BoxFuture<Result<LaunchHookReply, HookError>> {
            self.note(HookCall::Launch {
                runner,
                app_name: app_name.to_string(),
                args: args.clone(),
            });
            // The TS recorder wrote `game.launch`'s arguments as a list, an absent one as null, and the
            // writer as its target plus whether an earlier entry had claimed the rotation.
            self.tape(json!({
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
                    // Derived by the tape from the frames written so far, as the TS recorder did.
                    "rotationClaimed": Value::Null,
                },
            }));
            if let Some(effect) = &self.on_launch {
                effect();
            }
            if self.launch_pends {
                return Box::pin(std::future::pending());
            }
            if let Some(message) = &self.launch_rejection {
                // The TS handler's `.catch`: the exception into `gamelib.log` and the game's log, the first
                // per-game line carrying the rotation the funnel still owed.
                let exception = format!("Error: {message}");
                self.general_error(&exception);
                let mut rotated = false;
                if !args.log.disabled {
                    let target = serde_json::to_value(&args.log.target).unwrap_or(Value::Null);
                    for (index, text) in [
                        "An exception occurred when launching the game:".to_string(),
                        exception,
                    ]
                    .into_iter()
                    .enumerate()
                    {
                        let rotate = index == 0 && args.log.rotate;
                        rotated |= rotate;
                        self.tape(json!({
                            "kind": "gameLog",
                            "target": target,
                            "rotate": rotate,
                            "level": "ERROR",
                            "prefix": "",
                            "text": text,
                        }));
                    }
                }
                return Box::pin(async move {
                    Ok(LaunchHookReply {
                        launched: false,
                        rotated,
                    })
                });
            }
            let answer = self.launch;
            Box::pin(async move { answer })
        }

        fn sync_saves(
            &self,
            runner: RunnerName,
            app_name: &str,
            args: SyncSavesArgs,
        ) -> BoxFuture<Result<(), HookError>> {
            self.note(HookCall::SyncSaves {
                runner,
                app_name: app_name.to_string(),
                args: args.clone(),
            });
            self.hook_event(
                "syncSaves",
                runner.as_str(),
                vec![
                    json!(args.direction.flag()),
                    args.saves_path.clone(),
                    args.gog_saves.clone(),
                ],
            );
            let answer = match &self.sync_saves {
                Ok(()) => Ok(()),
                Err(message) => {
                    // The TS handler's own error line, as the funnel wrote it when it still made the call.
                    let line = match args.direction {
                        SyncDirection::SkipUpload => format!(
                            "Error while downloading saves for {}. Error: {message}",
                            self.line_title
                        ),
                        SyncDirection::SkipDownload => format!(
                            "Error uploading saves for {}. Error: Error: {message}",
                            self.line_title
                        ),
                    };
                    self.general_error(&line);
                    Err(HookError("failed"))
                }
            };
            Box::pin(async move { answer })
        }

        fn set_presence(
            &self,
            runner: RunnerName,
            app_name: &str,
        ) -> BoxFuture<Result<(), HookError>> {
            self.note(HookCall::SetPresence {
                runner,
                app_name: app_name.to_string(),
            });
            let answer = if self.presence_defined {
                self.hook_event("setPresence", runner.as_str(), vec![json!(app_name)]);
                Ok(())
            } else {
                Err(HookError("unavailable"))
            };
            Box::pin(async move { answer })
        }

        fn clear_presence(&self, runner: RunnerName) -> BoxFuture<Result<(), HookError>> {
            self.note(HookCall::ClearPresence { runner });
            let answer = if self.presence_defined {
                self.hook_event("clearPresence", runner.as_str(), vec![]);
                Ok(())
            } else {
                Err(HookError("unavailable"))
            };
            Box::pin(async move { answer })
        }

        fn persist_bottle_wine_version(
            &self,
            runner: RunnerName,
            app_name: &str,
            wine: Value,
        ) -> BoxFuture<Result<(), HookError>> {
            self.note(HookCall::PersistBottleWineVersion {
                runner,
                app_name: app_name.to_string(),
                wine: wine.clone(),
            });
            let answer = if self.persist_defined {
                self.hook_event("persistBottleWineVersion", runner.as_str(), vec![wine]);
                Ok(())
            } else {
                Err(HookError("unavailable"))
            };
            Box::pin(async move { answer })
        }

        fn update_gog_playtime(
            &self,
            app_name: &str,
            start_iso: &str,
            end_iso: &str,
        ) -> BoxFuture<Result<(), HookError>> {
            self.note(HookCall::UpdateGogPlaytime {
                app_name: app_name.to_string(),
                start_iso: start_iso.to_string(),
                end_iso: end_iso.to_string(),
            });
            self.hook_event(
                "updateGOGPlaytime",
                "gog",
                vec![json!(start_iso), json!(end_iso)],
            );
            let answer = match &self.update_gog {
                Ok(()) => Ok(()),
                Err(_) => Err(HookError("failed")),
            };
            Box::pin(async move { answer })
        }

        fn wine_settings_write(
            &self,
            app_name: &str,
            write: WineSettingsWrite,
        ) -> BoxFuture<Result<(), HookError>> {
            self.note(HookCall::WineSettingsWrite {
                app_name: app_name.to_string(),
                write: write.clone(),
            });
            // The global write came first in the TS.
            if let Some(global) = &write.global {
                self.tape(json!({
                    "kind": "config",
                    "member": "setSetting",
                    "args": ["wineVersion", global],
                }));
            }
            if let Some(game) = &write.game {
                self.tape(json!({
                    "kind": "gameConfig",
                    "member": "setSetting",
                    "appName": app_name,
                    "args": ["wineVersion", game],
                }));
            }
            let answer = self.wine_write;
            Box::pin(async move { answer })
        }
    }
}
