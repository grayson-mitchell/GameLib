//! The collaborators of `prepare_launch`, as a trait (the pattern of `gamelib_engine::launch::step::StepDeps`).
//!
//! Production is [`CtxPrepareDeps`]: every call is the real function over the context (the system-information
//! read and the anti-cheat lookup of `gamelib-info`, the Epic status check, the PATH scan, the gamescope help
//! probe, the Wine runtimes and the CrossOver bottle query). The goldens use `testing::ScriptedPrepareDeps`,
//! which answers the calls the TS scripted (the system information, the anti-cheat answer, the executables on
//! the PATH, the umu runtime's state) and records each one, and runs the rest for real over the context's seams.

use std::future::Future;
use std::pin::Pin;

use gamelib_info::anticheat::{info as anticheat_info, InfoArgs};
use gamelib_info::sysinfo::format::format_system_info;
use gamelib_info::sysinfo::get_system_info;
use gamelib_wine::runtimes;
use gamelib_wine::wine_cmd::command::find_on_path;
use gamelib_wine::wine_cmd::env::GameSettingsView;
use gamelib_wine::wine_cmd::WineHost;
use serde_json::Value;

use super::crossover::crossover_bottle_folder;
use super::epic::{epic_service_offline, EpicService};
use crate::builders::gamescope::probe_gamescope_help;
use crate::ctx::LaunchCtx;

/// A boxed, sendable future that may borrow from its caller.
pub type Fut<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// The calls `prepare_launch` makes outside pure code. Names, paths and bins are owned or `'static` so a
/// scripted implementation can record them.
pub trait PrepareDeps: Send + Sync {
    /// `formatSystemInfo` of the one cached `getSystemInfo` read: the text the launch log prints. `None` when
    /// the read failed (a probe could not start, the host listed no CPU).
    fn system_info_text(&self) -> Fut<'_, Option<String>>;

    /// `gameAnticheatInfo`: the anti-cheat entry of the game whose Epic namespace this is, or `null`.
    fn anticheat_info(&self, namespace: Option<String>) -> Fut<'_, Value>;

    /// `isEpicServiceOffline` for the Epic Games Store.
    fn epic_service_offline(&self) -> Fut<'_, bool>;

    /// `searchForExecutableOnPath`: the first executable file named `name` on the `PATH`.
    fn search_on_path(&self, name: &'static str) -> Option<String>;

    /// `probeGamescopeHelp`: the `--help` text of the gamescope at `bin` (empty when the probe fails).
    fn gamescope_help(&self, bin: String) -> Fut<'_, String>;

    /// `isRuntimeInstalled`.
    fn runtime_is_installed(&self, name: &'static str) -> Fut<'_, bool>;

    /// `downloadRuntime`.
    fn runtime_download(&self, name: &'static str) -> Fut<'_, bool>;

    /// `getUmuPath(deps) === deps.paths.defaultUmuPath`: no `umu-run` on the `PATH`, so the runtime's own copy
    /// is the one used.
    fn umu_path_is_default(&self) -> bool;

    /// `getCrossoverBottleFolder`.
    fn crossover_bottle_folder(&self, settings: GameSettingsView) -> Fut<'_, Option<String>>;
}

/// The collaborators of the app: every one is the real function. `host` is the process facts the shell read
/// (the `PATH` the executables are searched on, the process environment a wine command inherits).
pub struct CtxPrepareDeps<'a> {
    pub ctx: &'a LaunchCtx,
    pub host: &'a WineHost,
}

impl<'a> CtxPrepareDeps<'a> {
    pub fn new(ctx: &'a LaunchCtx, host: &'a WineHost) -> CtxPrepareDeps<'a> {
        CtxPrepareDeps { ctx, host }
    }
}

impl PrepareDeps for CtxPrepareDeps<'_> {
    fn system_info_text(&self) -> Fut<'_, Option<String>> {
        Box::pin(async move {
            let info = get_system_info(&self.ctx.info, true).await.ok()?;
            Some(format_system_info(&info, self.ctx.info.platform))
        })
    }

    fn anticheat_info(&self, namespace: Option<String>) -> Fut<'_, Value> {
        Box::pin(async move {
            // A namespace past the lookup's bound is an error there and no anti-cheat entry here.
            anticheat_info(
                &self.ctx.info,
                InfoArgs {
                    app_namespace: namespace,
                },
            )
            .unwrap_or(Value::Null)
        })
    }

    fn epic_service_offline(&self) -> Fut<'_, bool> {
        Box::pin(epic_service_offline(self.ctx, EpicService::EpicGamesStore))
    }

    fn search_on_path(&self, name: &'static str) -> Option<String> {
        find_on_path(name, self.host).map(|path| path.to_string_lossy().into_owned())
    }

    fn gamescope_help(&self, bin: String) -> Fut<'_, String> {
        Box::pin(async move { probe_gamescope_help(&*self.ctx.engine.proc, &bin).await })
    }

    fn runtime_is_installed(&self, name: &'static str) -> Fut<'_, bool> {
        Box::pin(runtimes::is_installed(&self.ctx.wine, name))
    }

    fn runtime_download(&self, name: &'static str) -> Fut<'_, bool> {
        Box::pin(runtimes::download(&self.ctx.wine, name))
    }

    fn umu_path_is_default(&self) -> bool {
        find_on_path("umu-run", self.host).is_none()
    }

    fn crossover_bottle_folder(&self, settings: GameSettingsView) -> Fut<'_, Option<String>> {
        Box::pin(async move { crossover_bottle_folder(&self.ctx.wine, &settings, self.host).await })
    }
}

/// The scripted collaborators of the goldens (feature `testing`).
#[cfg(feature = "testing")]
pub mod testing {
    use std::collections::BTreeMap;
    use std::sync::Mutex;

    use serde_json::{json, Value};

    use super::*;

    /// One scripted call `prepare_launch` made, in the vocabulary of the golden's `requests.json` (the TS
    /// recorded each as a `rustInvoke` request).
    #[derive(Debug, Clone, PartialEq)]
    pub enum Call {
        /// `info_anticheat_info` with the namespace.
        AnticheatInfo(Option<String>),
        /// `wine_runtime_is_installed` with the runtime.
        RuntimeIsInstalled(String),
        /// `wine_runtime_download` with the runtime.
        RuntimeDownload(String),
    }

    impl Call {
        /// The `requests.json` entry the TS recorded for the same call.
        pub fn to_request(&self) -> Value {
            match self {
                Call::AnticheatInfo(None) => {
                    json!({"kind": "rust", "channel": "info_anticheat_info", "args": [{}]})
                }
                Call::AnticheatInfo(Some(namespace)) => json!({
                    "kind": "rust",
                    "channel": "info_anticheat_info",
                    "args": [{ "appNamespace": namespace }]
                }),
                Call::RuntimeIsInstalled(name) => json!({
                    "kind": "rust", "channel": "wine_runtime_is_installed", "args": [name]
                }),
                Call::RuntimeDownload(name) => json!({
                    "kind": "rust", "channel": "wine_runtime_download", "args": [name]
                }),
            }
        }
    }

    /// The deps of a golden: what the TS scripted is answered from the case's input and recorded; the Epic
    /// check, the gamescope help probe and the CrossOver bottle query run for real over the context's seams
    /// (a replayed fetch and a scripted spawn runner).
    pub struct ScriptedPrepareDeps<'a> {
        real: CtxPrepareDeps<'a>,
        /// The text the system-information line shows; `None` is a failed read.
        pub system_info: Option<String>,
        /// What the anti-cheat lookup answers.
        pub anticheat: Value,
        /// Where each executable is, by name; an absent or `null` entry is not on the `PATH`.
        pub executables: BTreeMap<String, Option<String>>,
        /// Whether the umu runtime is installed.
        pub runtime_installed: bool,
        /// What the umu runtime download answers.
        pub download_answer: bool,
        calls: Mutex<Vec<Call>>,
    }

    impl<'a> ScriptedPrepareDeps<'a> {
        pub fn new(ctx: &'a LaunchCtx, host: &'a WineHost) -> ScriptedPrepareDeps<'a> {
            ScriptedPrepareDeps {
                real: CtxPrepareDeps::new(ctx, host),
                system_info: None,
                anticheat: Value::Null,
                executables: BTreeMap::new(),
                runtime_installed: false,
                download_answer: true,
                calls: Mutex::new(Vec::new()),
            }
        }

        /// Every scripted call so far, in order.
        pub fn calls(&self) -> Vec<Call> {
            self.calls.lock().unwrap_or_else(|e| e.into_inner()).clone()
        }

        fn record(&self, call: Call) {
            self.calls
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .push(call);
        }
    }

    impl PrepareDeps for ScriptedPrepareDeps<'_> {
        fn system_info_text(&self) -> Fut<'_, Option<String>> {
            Box::pin(async move { self.system_info.clone() })
        }

        fn anticheat_info(&self, namespace: Option<String>) -> Fut<'_, Value> {
            self.record(Call::AnticheatInfo(namespace));
            Box::pin(async move { self.anticheat.clone() })
        }

        fn epic_service_offline(&self) -> Fut<'_, bool> {
            self.real.epic_service_offline()
        }

        fn search_on_path(&self, name: &'static str) -> Option<String> {
            self.executables.get(name).cloned().flatten()
        }

        fn gamescope_help(&self, bin: String) -> Fut<'_, String> {
            self.real.gamescope_help(bin)
        }

        fn runtime_is_installed(&self, name: &'static str) -> Fut<'_, bool> {
            self.record(Call::RuntimeIsInstalled(name.to_string()));
            Box::pin(async move { self.runtime_installed })
        }

        fn runtime_download(&self, name: &'static str) -> Fut<'_, bool> {
            self.record(Call::RuntimeDownload(name.to_string()));
            Box::pin(async move { self.download_answer })
        }

        fn umu_path_is_default(&self) -> bool {
            self.search_on_path("umu-run").is_none()
        }

        fn crossover_bottle_folder(&self, settings: GameSettingsView) -> Fut<'_, Option<String>> {
            self.real.crossover_bottle_folder(settings)
        }
    }
}
