//! The first half of `prepareWineLaunch` (`launcher.ts`): everything up to the store-setup point.
//!
//! In the TypeScript order it overlays the engine's launch settings, checks the game's wine (then the default
//! wine) is valid, on macOS with a CrossOver wine checks the bottle exists, reads the winetricks log for the
//! launch log, leaves a slot for the EOS overlay line (Linux, Legendary), warns when offline mode is set for a
//! game that cannot run offline, creates the wine prefix when it is missing (`verify_wine_prefix`, in
//! process), names the prefix or CrossOver bottle folder and records the game in its `installed_games` file.
//!
//! D-30 and D-26 interim: the store-setup hook (`launchHooks[runner].prepareLaunch`, the GOG, Legendary and Nile
//! setup) stays TypeScript and runs between this step and 88.1-13's finish step in the launcher adapter
//! (88.1-15); `prefixUpdated` is what tells the adapter to run it, and 88.3 moves that seam behind the
//! manager hooks. The per-game log is written by the TS `LogWriter`, so this step returns its lines as data, in
//! the order the TS wrote them: `{ level, parts }`, or `{ slot: "eosOverlay" }` where the adapter writes
//! `EOS Overlay: Enabled` or `Not enabled` from the runner's `isOverlayEnabled` hook. The app's own
//! `Created/Updated Wineprefix at <prefix>` line names a path and stays the adapter's, written when
//! `prefixUpdated` is true from `settings.winePrefix`.
//!
//! The reply's `settings` are the launch settings the finish step is handed.

use std::path::Path;

use gamelib_engine::ctx::Platform;
use gamelib_engine::key::engine_key_for;
use gamelib_wine::wine_cmd::env::GameSettingsView;
use gamelib_wine::wine_cmd::prefix::verify_wine_prefix;
use gamelib_wine::wine_cmd::WineHost;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::deps::PrepareDeps;
use super::installed_games;
use super::launch::{LogEntry, RunnerArg};
use super::settings_log::js_truthy;
use crate::ctx::LaunchCtx;

/// What the begin step is told about the game. Strict: an unknown key is a bad argument.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrepareWineBeginArgs {
    pub runner: RunnerArg,
    pub app_name: String,
    pub title: String,
    /// `Boolean(gameInfo.canRunOffline)`.
    #[serde(default)]
    pub can_run_offline: bool,
    /// `gameInfo.folder_name`.
    #[serde(default)]
    pub folder_name: Option<String>,
    /// The merged `GameSettings` of the game (a JSON object), before the engine's overlay.
    pub stored_settings: Value,
}

/// One line of the begin step's launch log, in the order the TS wrote it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(untagged)]
pub enum BeginEntry {
    /// `logWriter.logInfo(...parts)` or `logWarning(...parts)`.
    Line(LogEntry),
    /// Where the adapter writes the EOS overlay line, from the runner's `isOverlayEnabled` hook.
    Slot { slot: &'static str },
}

/// The begin step's answer: the TS `LaunchPreperationResult` fields it decides (`success`, `failureReason`),
/// whether the prefix or bottle gained this game (`prefixUpdated`, what runs the store-setup hook), the launch
/// settings the finish step is handed and the launch log lines.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareWineBeginReply {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_reason: Option<String>,
    pub prefix_updated: bool,
    /// Only on success: the settings the rest of the step runs with.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub settings: Option<Value>,
    pub log: Vec<BeginEntry>,
}

impl PrepareWineBeginReply {
    fn failed(reason: Option<String>, log: Vec<BeginEntry>) -> PrepareWineBeginReply {
        PrepareWineBeginReply {
            success: false,
            failure_reason: reason,
            prefix_updated: false,
            settings: None,
            log,
        }
    }
}

fn line(level: &'static str, text: String) -> BeginEntry {
    BeginEntry::Line(LogEntry {
        level,
        parts: vec![Value::String(text)],
    })
}

/// The warning the TS logged for offline mode on a game that cannot run offline.
const OFFLINE_WARNING: &str = "Warning: 'offlineMode' is turned on but the game does not support offline mode. Disable 'offlineMode' in the game's settings.";

/// `prepareWineLaunch` up to the store-setup point. `Err` is a fixed reason (`bad-args` for settings that are
/// not game settings, `failed` for a wine prefix or an `installed_games` file that could not be written); the
/// causes name paths, which are logged as fixed text and never returned.
pub async fn prepare_wine_begin(
    ctx: &LaunchCtx,
    deps: &dyn PrepareDeps,
    args: PrepareWineBeginArgs,
    host: &WineHost,
) -> Result<PrepareWineBeginReply, &'static str> {
    const BAD_ARGS: &str = "bad-args";
    const FAILED: &str = "failed";

    if !args.stored_settings.is_object() {
        return Err(BAD_ARGS);
    }
    let platform = ctx.engine.platform;
    let runner = args.runner.0;
    let key = engine_key_for(runner.as_str(), &args.app_name);
    let settings = deps.launch_settings(key, args.stored_settings);
    let view: GameSettingsView = serde_json::from_value(settings.clone()).map_err(|_| BAD_ARGS)?;

    if !deps.valid_wine(&view.wine_version) {
        // The game's wine is not valid: the global default has to be, or the launch stops. (The TS carried on
        // with the game's own wine when the default was valid; golden/prepare_wine records that as is.)
        let default_is_valid = deps
            .global_default_wine()
            .is_some_and(|default| deps.valid_wine(&default));
        if !default_is_valid {
            return Ok(PrepareWineBeginReply::failed(None, Vec::new()));
        }
    }

    let mut log: Vec<BeginEntry> = Vec::new();

    let installed = deps.winetricks_installed(&settings, runner, &args.app_name);
    log.push(line(
        "info",
        format!("Winetricks packages: {}\n\n", installed.join(", ")),
    ));

    // Only Legendary on Linux has the overlay hook: on Windows the overlay is installed globally, on macOS it
    // does not work.
    if platform == Platform::Linux && runner == gamelib_knownfix::types::Runner::Legendary {
        log.push(BeginEntry::Slot { slot: "eosOverlay" });
    }

    let offline_mode = settings.get("offlineMode").is_some_and(js_truthy);
    if offline_mode && !args.can_run_offline {
        log.push(line("warning", OFFLINE_WARNING.to_string()));
    }

    // Creates the wine prefix when it is missing (`wineboot --init`, or umu's `createprefix`), in process.
    if verify_wine_prefix(&ctx.wine, &view, host).await.is_err() {
        return Err(FAILED);
    }

    let prefix_or_bottle_folder = Some(view.wine_prefix.clone());

    // The folder is null when the CrossOver bottle is not configured properly, and empty when no prefix is.
    let mut prefix_updated = false;
    if let Some(folder) = prefix_or_bottle_folder.filter(|folder| !folder.is_empty()) {
        match installed_games::update(Path::new(&folder), &args.app_name) {
            Ok(updated) => prefix_updated = updated,
            Err(_) => {
                if let Some(app_log) = &ctx.engine.log {
                    app_log.error("the installed_games file could not be updated");
                }
                return Err(FAILED);
            }
        }
    }

    Ok(PrepareWineBeginReply {
        success: true,
        failure_reason: None,
        prefix_updated,
        settings: Some(settings),
        log,
    })
}
