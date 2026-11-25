//! The second half of `prepareWineLaunch` (`launcher.ts`): from the store-setup point to the returned env.
//!
//! In the TypeScript order it runs the known fix's `installFixes` when the begin step added the game to the
//! prefix, applies the tier-2 profile registry, reads the tier-1 env (unless the caller's store merges its
//! own), resolves the tier-2 overlay env, logs the known-fix env line, installs the GOG Galaxy dummy, puts the
//! DXVK family in a wine-type wine's prefix, downloads the EAC and BattlEye runtimes when online and absent,
//! builds the wine env and arms the engine's launch deadline. The reply is `{ success, envVars, knownFixEnv, log }`
//! with `envVars` the wine env with the known-fix env merged over it.
//!
//! The store-setup hook between the halves stays TypeScript (D-30, D-26 interim): the adapter (88.1-15) runs it
//! when the begin step said the prefix was updated, then calls this step with the settings the begin step
//! returned. The per-game log is the adapter's writer's, so the lines this step adds come back as data:
//! `{ level, parts }`.
//!
//! The tier-2 data is `gamelib-knownfix`'s alone: the registry and overlay calls read the profile themselves, and
//! the remote layer never contributes a tier-2 key (prohibition 6). A failed registry step, overlay env or
//! deadline arm is a fixed-text warning and the launch goes on (the TS settle semantics); the warnings carry no
//! error text, since the TS ones carried `Error: ...` strings that can name paths (T-88.1-12).

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use gamelib_engine::ctx::Platform;
use gamelib_engine::dxvk::DxvkTool;
use gamelib_engine::jsutil::{js_to_string, js_truthy};
use gamelib_knownfix::catalogue::catalogue;
use gamelib_knownfix::overlay::env::{log_known_fix_env, EnvLine};
use gamelib_wine::tools::ToolsHost;
use gamelib_wine::wine_cmd::command::{run_wine_command, WineCommandArgs};
use gamelib_wine::wine_cmd::env::GameSettingsView;
use gamelib_wine::wine_cmd::WineKind;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::deps::{DeadlineRequest, OverlayEnvRequest, PrepareDeps};
use super::install_fixes::{install_fixes, FixGame};
use super::launch::{LogEntry, RunnerArg};
use super::wine_path::{get_wine_path, PathVariant};
use crate::builders::env::setup_wine_env_vars;
use crate::builders::known_fix_env::known_fix_env;
use crate::ctx::LaunchCtx;

/// What the finish step is told about the game and the begin step's answer. Strict: an unknown key is a bad
/// argument.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrepareWineFinishArgs {
    pub runner: RunnerArg,
    pub app_name: String,
    pub title: String,
    /// `gameInfo.install?.install_path`.
    #[serde(default)]
    pub install_path: Option<String>,
    /// `gameInfo.folder_name`: the game id of the wine env.
    #[serde(default)]
    pub folder_name: Option<String>,
    /// The launch settings the begin step handed back (a JSON object): what the winetricks verbs, the DXVK
    /// family, the registry, the overlay and the wine env run with.
    pub settings: Value,
    /// The game's own stored settings, before the engine's overlay (what `gameCommandFacts` read): a known fix's
    /// programs resolve their tool settings from these, and the resolver overlays the engine itself.
    pub stored_settings: Value,
    /// `prefixUpdated` of the begin step: whether this launch added the game to its prefix or bottle.
    pub prefix_updated: bool,
    /// `opts.mergesTier1Env !== false`: whether this step reads the tier-1 env (a store that merges its own
    /// passes `false`).
    #[serde(default = "yes")]
    pub merges_tier1_env: bool,
    /// `isStore(gameInfo, 'gog')`.
    #[serde(default)]
    pub is_gog: bool,
    /// `experimentalFeatures?.cometSupport`: only an explicit `false` turns the GOG dummy off.
    #[serde(default)]
    pub comet_support: Option<bool>,
}

fn yes() -> bool {
    true
}

/// The finish step's answer: the TS `LaunchPreperationResult` fields it decides (`success`, `envVars`,
/// `knownFixEnv`) and the per-game log lines it adds.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareWineFinishReply {
    pub success: bool,
    /// The wine env with `known_fix_env` merged over it.
    pub env_vars: BTreeMap<String, String>,
    pub known_fix_env: BTreeMap<String, String>,
    pub log: Vec<LogEntry>,
}

/// `C:\ProgramData\GOG.com\Galaxy\redists\GalaxyCommunication.exe`, where the GOG dummy service lives.
const GALAXY_COMMUNICATION_WIN_PATH: &str =
    "C:\\ProgramData\\GOG.com\\Galaxy\\redists\\GalaxyCommunication.exe";

/// The line logged when the GOG dummy could not be put in the prefix (the TS appended the error, which names
/// paths).
const GALAXY_DUMMY_FAILED: &str = "Failed to install GalaxyCommunication dummy into the prefix";

/// The process-env keys an overlay's env is resolved against (T-88-33): every target env var of the catalogue
/// plus `GST_PLUGIN_PATH_1_0`, and only those that are set. The rest of the environment never crosses.
fn overlay_base_env(host: &gamelib_wine::wine_cmd::WineHost) -> BTreeMap<String, String> {
    let mut keys: BTreeSet<&str> = catalogue()
        .map(|catalogue| catalogue.target_env.values().map(String::as_str).collect())
        .unwrap_or_default();
    keys.insert("GST_PLUGIN_PATH_1_0");
    keys.into_iter()
        .filter_map(|key| {
            host.env
                .get(key)
                .map(|value| (key.to_string(), value.to_string()))
        })
        .collect()
}

/// The tier-1 env as the TS normalised it: `Object.entries(raw)` with every value `String()`ed (WR-06), and
/// nothing for a value that is not an object. A list is an object to JavaScript, with its indices as keys.
fn tier1_entries(raw: &Value) -> Vec<(String, String)> {
    match raw {
        Value::Object(map) => map
            .iter()
            .map(|(key, value)| (key.clone(), js_to_string(value)))
            .collect(),
        Value::Array(items) => items
            .iter()
            .enumerate()
            .map(|(index, value)| (index.to_string(), js_to_string(value)))
            .collect(),
        _ => Vec::new(),
    }
}

fn warn(ctx: &LaunchCtx, line: &str) {
    if let Some(log) = ctx.engine.log.as_ref() {
        log.warn(line);
    }
}

fn error(ctx: &LaunchCtx, line: &str) {
    if let Some(log) = ctx.engine.log.as_ref() {
        log.error(line);
    }
}

/// Puts the GOG Galaxy dummy service in the prefix when it is not there: `winepath` for where it belongs, the
/// bundled `GalaxyCommunication.exe` copied there, then `sc create` for the service. `Err` is any step that
/// failed; the caller logs one fixed line and goes on.
async fn install_galaxy_dummy(
    ctx: &LaunchCtx,
    view: &GameSettingsView,
    host: &ToolsHost,
) -> Result<(), ()> {
    let destination = get_wine_path(
        ctx,
        view,
        GALAXY_COMMUNICATION_WIN_PATH,
        PathVariant::Unix,
        &host.wine,
    )
    .await;
    // An empty answer is a path the copy could not be made to (T-88.1-33): the TS tried and failed.
    if destination.is_empty() {
        return Err(());
    }
    let destination = Path::new(&destination);
    if destination.exists() {
        return Ok(());
    }
    let source = host
        .public_dir
        .as_ref()
        .ok_or(())?
        .join("bin")
        .join("x64")
        .join("win32")
        .join("GalaxyCommunication.exe");
    if let Some(folder) = destination.parent() {
        std::fs::create_dir_all(folder).map_err(|_| ())?;
    }
    std::fs::copy(&source, destination).map_err(|_| ())?;
    run_wine_command(
        &ctx.wine,
        WineCommandArgs {
            game_settings: Some(view.clone()),
            command_parts: [
                "sc",
                "create",
                "GalaxyCommunication",
                &format!("binpath={GALAXY_COMMUNICATION_WIN_PATH}"),
            ]
            .iter()
            .map(|part| part.to_string())
            .collect(),
            proton_verb: Some("runinprefix".to_string()),
            ..WineCommandArgs::default()
        },
        &host.wine,
    )
    .await;
    Ok(())
}

/// `prepareWineLaunch` from the store-setup point on. `Err` is a fixed reason: `bad-args` for settings that are
/// not game settings, `failed` for a step the TS did not settle (an install fix that could not run, a DXVK
/// family or runtime step that was rejected); the causes are logged as fixed text and never returned.
pub async fn prepare_wine_finish(
    ctx: &LaunchCtx,
    deps: &dyn PrepareDeps,
    args: PrepareWineFinishArgs,
    host: &ToolsHost,
) -> Result<PrepareWineFinishReply, &'static str> {
    const BAD_ARGS: &str = "bad-args";
    const FAILED: &str = "failed";

    if !args.settings.is_object() || !args.stored_settings.is_object() {
        return Err(BAD_ARGS);
    }
    let view: GameSettingsView =
        serde_json::from_value(args.settings.clone()).map_err(|_| BAD_ARGS)?;
    let runner = args.runner.0;
    let app_name = args.app_name.as_str();
    let label = format!("{} {app_name}", runner.as_str());
    let settings = &args.settings;
    let mut log: Vec<LogEntry> = Vec::new();

    if args.prefix_updated {
        install_fixes(
            ctx,
            deps,
            FixGame {
                app_name,
                runner,
                folder_name: args.folder_name.as_deref(),
                install_path: args.install_path.as_deref(),
            },
            settings,
            &args.stored_settings,
        )
        .await?;
    }

    // Tier-2 profile registry, every launch: a failure is a warning and the launch goes on.
    if deps
        .apply_profile_registry(app_name.to_string(), runner, settings.clone())
        .await
        .is_err()
    {
        warn(
            ctx,
            &format!("{label}: known-fix registry step failed; launching without it"),
        );
    }

    // Tier-2 overlays: installed on demand, env merged last. The tier-1 env is normalised with `String()`
    // (WR-06) because the overlay call takes a pure string map, and is skipped for a store that merges its own.
    let tier1: Vec<(String, String)> = if args.merges_tier1_env {
        tier1_entries(&known_fix_env(ctx, app_name, runner))
    } else {
        Vec::new()
    };
    let known_fix_env = match deps
        .profile_overlay_env(OverlayEnvRequest {
            app_name: app_name.to_string(),
            runner,
            settings: settings.clone(),
            tier1_env: tier1.iter().cloned().collect(),
            process_env_base: overlay_base_env(&host.wine),
        })
        .await
    {
        Ok(env) => env,
        Err(_) => {
            warn(
                ctx,
                &format!("{label}: overlay env failed; launching without it"),
            );
            BTreeMap::new()
        }
    };
    let entries: Vec<EnvLine> = tier1
        .iter()
        .map(|(key, value)| EnvLine {
            key: key.clone(),
            value: value.clone(),
            source: "tier-1".to_string(),
        })
        .chain(known_fix_env.iter().map(|(key, value)| EnvLine {
            key: key.clone(),
            value: value.clone(),
            source: "overlay".to_string(),
        }))
        .collect();
    if let Some(line) = log_known_fix_env(&ctx.knownfix, &label, &entries) {
        log.push(LogEntry {
            level: "info",
            parts: vec![Value::String(line)],
        });
    }

    // The GOG Galaxy dummy service: a failure is one fixed line, and the launch goes on.
    if args.is_gog && args.comet_support != Some(false) {
        let dummy = install_galaxy_dummy(ctx, &view, host).await;
        if dummy.is_err() {
            error(ctx, GALAXY_DUMMY_FAILED);
        }
    }

    // The DXVK family, for a wine-type wine only (the install runs in Rust, with the settings this step holds).
    let linux = ctx.engine.platform == Platform::Linux;
    if view.wine_version.kind == WineKind::Wine {
        let wanted = [
            (DxvkTool::Dxvk, "autoInstallDxvk", true),
            (DxvkTool::DxvkNvapi, "autoInstallDxvkNvapi", linux),
            (DxvkTool::Vkd3d, "autoInstallVkd3d", linux),
        ];
        for (tool, key, allowed) in wanted {
            if allowed && settings.get(key).is_some_and(js_truthy) {
                if let Err(category) = deps.dxvk_backup(settings.clone(), tool).await {
                    error(
                        ctx,
                        &format!("The {} install failed: {category}", tool.as_str()),
                    );
                    return Err(FAILED);
                }
            }
        }
    }

    // The anti-cheat runtimes, when online and absent.
    for (key, name) in [
        ("eacRuntime", "eac_runtime"),
        ("battlEyeRuntime", "battleye_runtime"),
    ] {
        if settings.get(key).is_some_and(js_truthy)
            && host.online
            && !deps.runtime_is_installed(name).await
        {
            deps.runtime_download(name).await;
        }
    }

    let mut env_vars = setup_wine_env_vars(ctx, &view, args.folder_name.as_deref(), &host.wine);

    // After the install fixes and the overlay env, so a prerequisite installer never counts against the
    // deadline. A plain-prefix launch arms nothing, and a failed arm must not fail a launch that is otherwise
    // ready.
    if deps
        .arm_deadline(DeadlineRequest {
            runner,
            app_name: app_name.to_string(),
            title: args.title.clone(),
            install_path: args.install_path.clone(),
        })
        .await
        .is_err()
    {
        warn(ctx, "Engine: the launch deadline could not be armed");
    }

    env_vars.extend(known_fix_env.clone());
    Ok(PrepareWineFinishReply {
        success: true,
        env_vars,
        known_fix_env,
        log,
    })
}
