//! The collaborators of the prepare steps, as a trait (the pattern of `gamelib_engine::launch::step::StepDeps`).
//!
//! Production is [`CtxPrepareDeps`]: every call is the real function over the context (the system-information
//! read and the anti-cheat lookup of `gamelib-info`, the Epic status check, the PATH scan, the gamescope help
//! probe, the Wine runtimes and the CrossOver bottle query, and for `prepare_wine_begin` the engine's launch
//! settings, `validWine`, the global default Wine and the winetricks log read, and for `prepare_wine_finish`
//! the known-fix registry and overlay env, the DXVK family, the winetricks verbs, the tool-settings resolver, a
//! wine command on a game and the launch deadline). The goldens use `testing::ScriptedPrepareDeps`, which
//! answers the calls the TS scripted (the system information, the anti-cheat answer, the executables on the
//! PATH, the umu runtime's state, the engine's launch settings, each Wine's validity, the winetricks list and
//! every one of the finish step's calls) and records each one, and runs the rest for real over the context's
//! seams.

use std::collections::BTreeMap;
use std::future::Future;
use std::pin::Pin;

use gamelib_engine::config::global_settings;
use gamelib_engine::dxvk::{DxvkAction, DxvkRequest, DxvkTool};
use gamelib_engine::key::engine_key_for;
use gamelib_engine::launch::step::{arm_engine_launch_deadline, ArmOptions, DeadlineGame};
use gamelib_engine::tool_settings::{
    resolve_tool_settings_for_id, CtxToolSettingsDeps, ToolGameId, ToolSettingsResult,
};
use gamelib_info::anticheat::{info as anticheat_info, InfoArgs};
use gamelib_info::sysinfo::format::format_system_info;
use gamelib_info::sysinfo::get_system_info;
use gamelib_knownfix::types::Runner;
use gamelib_wine::runtimes;
use gamelib_wine::tools::{dxvk, HostWineRunner, ToolsHost};
use gamelib_wine::wine_cmd::command::{find_on_path, run_wine_command_for_game, ForGameArgs};
use gamelib_wine::wine_cmd::env::GameSettingsView;
use gamelib_wine::wine_cmd::valid::valid_wine;
use gamelib_wine::wine_cmd::{WineHost, WineInstallation};
use gamelib_wine::winetricks::install::{install, list_installed};
use gamelib_wine::winetricks::{is_verb_shape, HostLauncher, Session, Target, ToolSettings};
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

    /// `launchSettingsFor`: the stored settings with the running launch's engine overlaid (`key` is the engine
    /// key of the game, `None` for a game that has none; the settings come back unchanged then).
    fn launch_settings(&self, key: Option<String>, stored: Value) -> Value;

    /// `validWine`: whether the wine exists on disk as its type requires.
    fn valid_wine(&self, wine: &WineInstallation) -> bool;

    /// The default wine of the global settings (`config.getSettings().wineVersion`), `None` when there is none
    /// or it is not a wine installation.
    fn global_default_wine(&self) -> Option<WineInstallation>;

    /// `winetricksListInstalled`: the lines of the game's `winetricks.log`, read with the settings this launch
    /// holds (empty when they are unusable or the log is not there).
    fn winetricks_installed(&self, settings: &Value, runner: Runner, app_name: &str)
        -> Vec<String>;

    /// `applyKnownFixProfileRegistry`: the game's tier-2 profile registry entries applied to its own prefix. `Err`
    /// is a category word; the TS settled it as a warning and the launch went on.
    fn apply_profile_registry(
        &self,
        app_name: String,
        runner: Runner,
        settings: Value,
    ) -> Fut<'_, Result<(), String>>;

    /// `knownFixProfileOverlayEnv`: the overlay env of the game's tier-2 profile, resolved against the tier-1 env
    /// and the process env's overlay keys. `Err` is a category word; the TS settled it as a warning and `{}`.
    fn profile_overlay_env(
        &self,
        request: OverlayEnvRequest,
    ) -> Fut<'_, Result<BTreeMap<String, String>, String>>;

    /// `dxvkInstallRemove` with the `backup` action: the DXVK family tool put into the prefix the settings name.
    /// `Err` is a category word; the TS rejected, which failed the launch.
    fn dxvk_backup(&self, settings: Value, tool: DxvkTool) -> Fut<'_, Result<bool, String>>;

    /// `winetricksInstallVerbs`: one outcome word per verb (`installed`, `failed`, `refused`), one after another.
    fn winetricks_install(
        &self,
        settings: Value,
        runner: Runner,
        app_name: String,
        verbs: Vec<String>,
    ) -> Fut<'_, Vec<String>>;

    /// `resolveEngineToolSettings` with the bottle ensured: the settings a tool on this game runs with.
    fn resolve_tool_settings(
        &self,
        runner: Runner,
        app_name: String,
        stored: Value,
    ) -> Fut<'_, ToolSettingsResult>;

    /// `runWineCommandForGame`: one wine command on a game, in the game's own bottle. `Err` is a category word
    /// for a command the shape guard refused (a refusal of a guard is the empty result and `Ok`).
    fn run_wine_command_for_game(&self, request: ForGameRequest) -> Fut<'_, Result<(), String>>;

    /// `armEngineLaunchDeadline`. `Err` is a category word; the TS logged a warning and the launch went on.
    fn arm_deadline(&self, request: DeadlineRequest) -> Fut<'_, Result<(), String>>;
}

/// What `knownFixProfileOverlayEnv` is asked: the game, its launch settings, the tier-1 env and the process env's
/// overlay keys (the only part of the process environment that crosses, T-88-33).
#[derive(Debug, Clone, PartialEq)]
pub struct OverlayEnvRequest {
    pub app_name: String,
    pub runner: Runner,
    pub settings: Value,
    pub tier1_env: BTreeMap<String, String>,
    pub process_env_base: BTreeMap<String, String>,
}

/// One wine command of a known fix's `runInPrefix`, with the facts the TS `gameCommandFacts` gathered.
#[derive(Debug, Clone, PartialEq)]
pub struct ForGameRequest {
    pub runner: Runner,
    pub app_name: String,
    /// What the tool-settings resolver answered for the game.
    pub resolved: ToolSettingsResult,
    pub steam_eligible: bool,
    pub folder_name: Option<String>,
    pub install_path: Option<String>,
    pub command_parts: Vec<String>,
    pub wait: bool,
    pub proton_verb: String,
}

/// The game the launch deadline speaks for.
#[derive(Debug, Clone, PartialEq)]
pub struct DeadlineRequest {
    pub runner: Runner,
    pub app_name: String,
    pub title: String,
    pub install_path: Option<String>,
}

/// The collaborators of the app: every one is the real function. `host` is the process facts the shell read
/// (the `PATH` the executables are searched on, the process environment a wine command inherits).
pub struct CtxPrepareDeps<'a> {
    pub ctx: &'a LaunchCtx,
    pub host: &'a WineHost,
    /// The tool facts the shell built (the bundled `public` directory, the online monitor's answer, the wine
    /// host), for the DXVK family; without them a tool runs with the wine host alone.
    pub tools: Option<&'a ToolsHost>,
}

impl<'a> CtxPrepareDeps<'a> {
    pub fn new(ctx: &'a LaunchCtx, host: &'a WineHost) -> CtxPrepareDeps<'a> {
        CtxPrepareDeps {
            ctx,
            host,
            tools: None,
        }
    }

    /// The same collaborators with the tool facts the DXVK family runs under.
    pub fn with_tools(mut self, tools: &'a ToolsHost) -> CtxPrepareDeps<'a> {
        self.tools = Some(tools);
        self
    }

    fn tools_host(&self) -> ToolsHost {
        self.tools.cloned().unwrap_or_else(|| ToolsHost {
            wine: self.host.clone(),
            ..ToolsHost::default()
        })
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

    fn launch_settings(&self, key: Option<String>, stored: Value) -> Value {
        self.ctx.engine.launch_settings.get_launch_settings(
            &self.ctx.engine,
            key.as_deref(),
            &stored,
        )
    }

    fn valid_wine(&self, wine: &WineInstallation) -> bool {
        valid_wine(
            Some(wine),
            self.ctx.engine.platform,
            self.host.darwin_release.as_deref(),
            &|path| path.exists(),
        )
    }

    fn global_default_wine(&self) -> Option<WineInstallation> {
        let mut settings = global_settings(&self.ctx.engine);
        serde_json::from_value(settings.remove("wineVersion")?).ok()
    }

    fn winetricks_installed(
        &self,
        settings: &Value,
        runner: Runner,
        app_name: &str,
    ) -> Vec<String> {
        let Ok(view) = serde_json::from_value::<GameSettingsView>(settings.clone()) else {
            return Vec::new();
        };
        let launcher = HostLauncher { host: self.host };
        let session = Session {
            ctx: &self.ctx.wine,
            host: self.host,
            launcher: &launcher,
        };
        let target = Target {
            runner: runner.as_str(),
            app_name,
            settings: ToolSettings::Resolved(Box::new(view)),
        };
        list_installed(&session, &target)
    }

    fn apply_profile_registry(
        &self,
        app_name: String,
        runner: Runner,
        settings: Value,
    ) -> Fut<'_, Result<(), String>> {
        Box::pin(async move {
            gamelib_knownfix::registry::apply_known_fix_profile_registry(
                &self.ctx.knownfix,
                &app_name,
                runner,
                &settings,
            )
            .await
            .map_err(str::to_string)
        })
    }

    fn profile_overlay_env(
        &self,
        request: OverlayEnvRequest,
    ) -> Fut<'_, Result<BTreeMap<String, String>, String>> {
        Box::pin(async move {
            Ok(gamelib_knownfix::overlay::env::profile_overlay_env(
                &self.ctx.knownfix,
                &request.app_name,
                request.runner,
                &request.settings,
                &request.tier1_env,
                &request.process_env_base,
            )
            .await)
        })
    }

    fn dxvk_backup(&self, settings: Value, tool: DxvkTool) -> Fut<'_, Result<bool, String>> {
        Box::pin(async move {
            let host = self.tools_host();
            let runner = HostWineRunner { host: &host.wine };
            dxvk::install_remove(
                &self.ctx.wine,
                &host,
                &runner,
                DxvkRequest {
                    settings,
                    tool,
                    action: DxvkAction::Backup,
                    source: None,
                },
            )
            .await
            .map_err(|error| error.to_string())
        })
    }

    fn winetricks_install(
        &self,
        settings: Value,
        runner: Runner,
        app_name: String,
        verbs: Vec<String>,
    ) -> Fut<'_, Vec<String>> {
        Box::pin(async move {
            let view = serde_json::from_value::<GameSettingsView>(settings).ok();
            let launcher = HostLauncher { host: self.host };
            let session = Session {
                ctx: &self.ctx.wine,
                host: self.host,
                launcher: &launcher,
            };
            let mut outcomes = Vec::with_capacity(verbs.len());
            for verb in &verbs {
                // One verb after another, never a batch; a verb that is no verb never reaches an argv and a
                // failed verb does not stop the rest.
                let outcome = match &view {
                    Some(view) if is_verb_shape(verb) => {
                        let target = Target {
                            runner: runner.as_str(),
                            app_name: &app_name,
                            settings: ToolSettings::Resolved(Box::new(view.clone())),
                        };
                        install(&session, &target, verb, None).await.as_str()
                    }
                    _ => "failed",
                };
                outcomes.push(outcome.to_string());
            }
            outcomes
        })
    }

    fn resolve_tool_settings(
        &self,
        runner: Runner,
        app_name: String,
        stored: Value,
    ) -> Fut<'_, ToolSettingsResult> {
        Box::pin(async move {
            let deps = CtxToolSettingsDeps::new(&self.ctx.engine);
            let id = ToolGameId {
                runner: runner.as_str(),
                app_name: &app_name,
                platform: None,
            };
            resolve_tool_settings_for_id(&self.ctx.engine, &deps, &id, &stored, true).await
        })
    }

    fn run_wine_command_for_game(&self, request: ForGameRequest) -> Fut<'_, Result<(), String>> {
        Box::pin(async move {
            let (settings, unavailable) = match request.resolved {
                ToolSettingsResult::Stored { settings }
                | ToolSettingsResult::Engine { settings, .. } => (
                    serde_json::from_value::<GameSettingsView>(settings).ok(),
                    None,
                ),
                ToolSettingsResult::Unavailable { reason } => {
                    (None, Some(reason.as_str().to_string()))
                }
            };
            // Settings the wine core cannot read are no usable wine environment, as for any other game.
            let unavailable =
                unavailable.or_else(|| settings.is_none().then(|| "unusable".to_string()));
            let args = ForGameArgs {
                runner: request.runner.as_str().to_string(),
                app_name: request.app_name,
                settings,
                unavailable,
                steam_eligible: request.steam_eligible,
                is_native: false,
                folder_name: request.folder_name,
                install_path: request.install_path,
                pending_install: false,
                command_parts: Value::Array(
                    request
                        .command_parts
                        .into_iter()
                        .map(Value::String)
                        .collect(),
                ),
                wait: request.wait,
                proton_verb: Some(request.proton_verb),
                start_folder: None,
            };
            run_wine_command_for_game(&self.ctx.wine, args, self.host)
                .await
                .map(|_| ())
                .map_err(|_| "bad-command-parts".to_string())
        })
    }

    fn arm_deadline(&self, request: DeadlineRequest) -> Fut<'_, Result<(), String>> {
        Box::pin(async move {
            let key = engine_key_for(request.runner.as_str(), &request.app_name);
            let game = DeadlineGame {
                runner: request.runner.as_str().to_string(),
                app_name: request.app_name,
                title: request.title,
                install_path: request.install_path.unwrap_or_default(),
            };
            arm_engine_launch_deadline(
                &self.ctx.engine,
                &game,
                key.as_deref(),
                &ArmOptions::default(),
            )
            .map(|_| ())
            .map_err(|error| error.as_str().to_string())
        })
    }
}

/// The scripted collaborators of the goldens (feature `testing`).
#[cfg(feature = "testing")]
pub mod testing {
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
        /// `engine_launch_settings_get` with the key and the stored settings.
        LaunchSettings(Option<String>, Value),
        /// `wine_valid` with the wine.
        WineValid(WineInstallation),
        /// `wine_winetricks_list_installed` with the runner, the app and the settings read with.
        WinetricksInstalled(String, String, Value),
        /// `knownfix_apply_profile_registry` with the app, the runner and the launch settings.
        ApplyProfileRegistry(String, String, Value),
        /// `knownfix_profile_overlay_env`.
        ProfileOverlayEnv(OverlayEnvRequest),
        /// `wine_dxvk_install_remove` with the settings and the tool (the action is `backup`).
        DxvkBackup(Value, DxvkTool),
        /// `wine_winetricks_install` with the runner, the app, the settings and the verbs.
        WinetricksInstall(String, String, Value, Vec<String>),
        /// `engine_resolve_tool_settings` with the runner, the app and the stored settings.
        ResolveToolSettings(String, String, Value),
        /// `wine_run_command_for_game`.
        RunWineCommandForGame(ForGameRequest),
        /// `engine_launch_arm_deadline`.
        ArmDeadline(DeadlineRequest),
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
                Call::LaunchSettings(key, stored) => json!({
                    "kind": "rust",
                    "channel": "engine_launch_settings_get",
                    "args": [{ "key": key, "stored": stored }]
                }),
                Call::WineValid(wine) => json!({
                    "kind": "rust", "channel": "wine_valid", "args": [wine]
                }),
                Call::WinetricksInstalled(runner, app_name, settings) => json!({
                    "kind": "rust",
                    "channel": "wine_winetricks_list_installed",
                    "args": [{ "runner": runner, "appName": app_name, "settings": settings }]
                }),
                Call::ApplyProfileRegistry(app_name, runner, settings) => json!({
                    "kind": "rust",
                    "channel": "knownfix_apply_profile_registry",
                    "args": [{ "appName": app_name, "runner": runner, "gameSettings": settings }]
                }),
                Call::ProfileOverlayEnv(request) => json!({
                    "kind": "rust",
                    "channel": "knownfix_profile_overlay_env",
                    "args": [{
                        "appName": request.app_name,
                        "runner": request.runner.as_str(),
                        "gameSettings": request.settings,
                        "tier1Env": request.tier1_env,
                        "processEnvBase": request.process_env_base,
                    }]
                }),
                Call::DxvkBackup(settings, tool) => json!({
                    "kind": "rust",
                    "channel": "wine_dxvk_install_remove",
                    "args": [{ "settings": settings, "tool": tool.as_str(), "action": "backup" }]
                }),
                Call::WinetricksInstall(runner, app_name, settings, verbs) => json!({
                    "kind": "rust",
                    "channel": "wine_winetricks_install",
                    "args": [{ "runner": runner, "appName": app_name, "settings": settings }, verbs]
                }),
                Call::ResolveToolSettings(runner, app_name, stored) => json!({
                    "kind": "rust",
                    "channel": "engine_resolve_tool_settings",
                    "args": [{
                        "runner": runner, "appName": app_name, "stored": stored, "ensureBottle": true
                    }]
                }),
                Call::RunWineCommandForGame(request) => {
                    let mut args = serde_json::Map::new();
                    args.insert("runner".into(), json!(request.runner.as_str()));
                    args.insert("appName".into(), json!(request.app_name));
                    match &request.resolved {
                        ToolSettingsResult::Stored { settings }
                        | ToolSettingsResult::Engine { settings, .. } => {
                            args.insert("settings".into(), settings.clone());
                        }
                        ToolSettingsResult::Unavailable { reason } => {
                            args.insert("unavailable".into(), json!(reason.as_str()));
                        }
                    }
                    args.insert("steamEligible".into(), json!(request.steam_eligible));
                    args.insert("isNative".into(), json!(false));
                    if let Some(folder) = &request.folder_name {
                        args.insert("folderName".into(), json!(folder));
                    }
                    if let Some(path) = &request.install_path {
                        args.insert("installPath".into(), json!(path));
                    }
                    args.insert("commandParts".into(), json!(request.command_parts));
                    args.insert("wait".into(), json!(request.wait));
                    args.insert("protonVerb".into(), json!(request.proton_verb));
                    json!({
                        "kind": "rust",
                        "channel": "wine_run_command_for_game",
                        "args": [Value::Object(args)]
                    })
                }
                Call::ArmDeadline(request) => {
                    let mut arg = serde_json::Map::new();
                    arg.insert("runner".into(), json!(request.runner.as_str()));
                    arg.insert("appName".into(), json!(request.app_name));
                    arg.insert("title".into(), json!(request.title));
                    if let Some(path) = &request.install_path {
                        arg.insert("installPath".into(), json!(path));
                    }
                    json!({
                        "kind": "rust",
                        "channel": "engine_launch_arm_deadline",
                        "args": [Value::Object(arg)]
                    })
                }
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
        /// What the engine's launch-settings overlay answers; `None` answers the stored settings unchanged.
        pub launch_settings_reply: Option<Value>,
        /// Each wine's validity, by name; a name that is not listed is valid.
        pub wine_validity: BTreeMap<String, bool>,
        /// The default wine of the global settings.
        pub default_wine: Option<WineInstallation>,
        /// The lines of the winetricks log.
        pub winetricks: Vec<String>,
        /// Whether each runtime is installed, by name; one that is not listed answers `runtime_installed`.
        pub runtimes_installed: BTreeMap<String, bool>,
        /// What the known-fix registry step answers (`Err` is a rejection).
        pub registry_reply: Result<(), String>,
        /// What the known-fix overlay env answers (`Err` is a rejection).
        pub overlay_reply: Result<BTreeMap<String, String>, String>,
        /// What a DXVK family install answers (`Err` is a rejection).
        pub dxvk_reply: Result<bool, String>,
        /// What a winetricks install answers, one list of outcome words per call, in order; a call past the
        /// end answers `installed` for each verb.
        pub winetricks_replies: Vec<Vec<String>>,
        /// What the tool-settings resolver answers, one per call, in order; a call past the end answers the
        /// stored settings it was given.
        pub tool_settings_replies: Vec<ToolSettingsResult>,
        /// What the launch deadline arm answers (`Err` is a rejection).
        pub deadline_reply: Result<(), String>,
        cursors: Mutex<(usize, usize)>,
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
                launch_settings_reply: None,
                wine_validity: BTreeMap::new(),
                default_wine: None,
                winetricks: Vec::new(),
                runtimes_installed: BTreeMap::new(),
                registry_reply: Ok(()),
                overlay_reply: Ok(BTreeMap::new()),
                dxvk_reply: Ok(true),
                winetricks_replies: Vec::new(),
                tool_settings_replies: Vec::new(),
                deadline_reply: Ok(()),
                cursors: Mutex::new((0, 0)),
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
            Box::pin(async move {
                self.runtimes_installed
                    .get(name)
                    .copied()
                    .unwrap_or(self.runtime_installed)
            })
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

        fn launch_settings(&self, key: Option<String>, stored: Value) -> Value {
            self.record(Call::LaunchSettings(key, stored.clone()));
            self.launch_settings_reply.clone().unwrap_or(stored)
        }

        fn valid_wine(&self, wine: &WineInstallation) -> bool {
            self.record(Call::WineValid(wine.clone()));
            self.wine_validity.get(&wine.name).copied().unwrap_or(true)
        }

        fn global_default_wine(&self) -> Option<WineInstallation> {
            self.default_wine.clone()
        }

        fn winetricks_installed(
            &self,
            settings: &Value,
            runner: Runner,
            app_name: &str,
        ) -> Vec<String> {
            self.record(Call::WinetricksInstalled(
                runner.as_str().to_string(),
                app_name.to_string(),
                settings.clone(),
            ));
            self.winetricks.clone()
        }

        fn apply_profile_registry(
            &self,
            app_name: String,
            runner: Runner,
            settings: Value,
        ) -> Fut<'_, Result<(), String>> {
            self.record(Call::ApplyProfileRegistry(
                app_name,
                runner.as_str().to_string(),
                settings,
            ));
            Box::pin(async move { self.registry_reply.clone() })
        }

        fn profile_overlay_env(
            &self,
            request: OverlayEnvRequest,
        ) -> Fut<'_, Result<BTreeMap<String, String>, String>> {
            self.record(Call::ProfileOverlayEnv(request));
            Box::pin(async move { self.overlay_reply.clone() })
        }

        fn dxvk_backup(&self, settings: Value, tool: DxvkTool) -> Fut<'_, Result<bool, String>> {
            self.record(Call::DxvkBackup(settings, tool));
            Box::pin(async move { self.dxvk_reply.clone() })
        }

        fn winetricks_install(
            &self,
            settings: Value,
            runner: Runner,
            app_name: String,
            verbs: Vec<String>,
        ) -> Fut<'_, Vec<String>> {
            let at = {
                let mut cursors = self.cursors.lock().unwrap_or_else(|e| e.into_inner());
                cursors.0 += 1;
                cursors.0 - 1
            };
            let reply = self
                .winetricks_replies
                .get(at)
                .cloned()
                .unwrap_or_else(|| verbs.iter().map(|_| "installed".to_string()).collect());
            self.record(Call::WinetricksInstall(
                runner.as_str().to_string(),
                app_name,
                settings,
                verbs,
            ));
            Box::pin(async move { reply })
        }

        fn resolve_tool_settings(
            &self,
            runner: Runner,
            app_name: String,
            stored: Value,
        ) -> Fut<'_, ToolSettingsResult> {
            let at = {
                let mut cursors = self.cursors.lock().unwrap_or_else(|e| e.into_inner());
                cursors.1 += 1;
                cursors.1 - 1
            };
            let reply = self
                .tool_settings_replies
                .get(at)
                .cloned()
                .unwrap_or_else(|| ToolSettingsResult::Stored {
                    settings: stored.clone(),
                });
            self.record(Call::ResolveToolSettings(
                runner.as_str().to_string(),
                app_name,
                stored,
            ));
            Box::pin(async move { reply })
        }

        fn run_wine_command_for_game(
            &self,
            request: ForGameRequest,
        ) -> Fut<'_, Result<(), String>> {
            self.record(Call::RunWineCommandForGame(request));
            Box::pin(async move { Ok(()) })
        }

        fn arm_deadline(&self, request: DeadlineRequest) -> Fut<'_, Result<(), String>> {
            self.record(Call::ArmDeadline(request));
            Box::pin(async move { self.deadline_reply.clone() })
        }
    }
}
