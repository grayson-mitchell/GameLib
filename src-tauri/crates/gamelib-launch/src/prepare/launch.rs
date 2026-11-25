//! `prepareLaunch` (`launcher.ts`): what a store manager runs before it builds its game command. It decides
//! offline mode, writes the opening of the game's launch log (the game, whether it is native, where it is
//! installed, the system information, the settings and the anti-cheat status), and on Linux finds the
//! MangoHud, GameMode and Gamescope wrappers and fetches the umu runtime.
//!
//! D-30 interim: the per-game log is written by the TypeScript `LogWriter`, the only writer and rotator of
//! it until 88.3. This step therefore returns its log lines as data, `{ level, parts }`, in the order the TS
//! wrote them; every part is exactly the value the TS passed to `logWriter.logInfo` or `logWarning`, so the
//! writer formats it identically. Lines that went to the app's own log (the gamescope warning, the Epic
//! status lines) go to the engine log as fixed text.
//!
//! Discord presence is never constructed: the operator decision of 2026-11-17 (the 82 amendment, `discord-rpc-dropped`
//! in `golden/prepare_launch/deltas.json`) deletes the TS client rather than porting it, so the reply carries no
//! `rpcClient`.
//!
//! The facts only the TypeScript has arrive as arguments ([`PrepareLaunchArgs`]): whether the game is native,
//! whether the legendary store's session has expired, the install path (the folder name for a sideload), the
//! third-party app that manages it and its Epic namespace. The process facts the shell read arrive as
//! [`PrepareHost`].

use gamelib_engine::ctx::Platform;
use gamelib_knownfix::types::Runner;
use gamelib_wine::wine_cmd::env::GameSettingsView;
use gamelib_wine::wine_cmd::WineHost;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{json, Value};

use super::deps::PrepareDeps;
use super::settings_log::{filter_game_settings_for_log, js_truthy};
use crate::ctx::LaunchCtx;

/// A runner name, one of the closed set of five.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RunnerArg(pub Runner);

impl<'de> Deserialize<'de> for RunnerArg {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<RunnerArg, D::Error> {
        let name = String::deserialize(deserializer)?;
        Runner::parse(&name)
            .map(RunnerArg)
            .ok_or_else(|| serde::de::Error::custom("unknown runner"))
    }
}

/// What `prepare_launch` is told about the game. Strict: an unknown key is a bad argument.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrepareLaunchArgs {
    /// The merged `GameSettings` of the game (a JSON object).
    pub settings: Value,
    pub runner: RunnerArg,
    pub app_name: String,
    pub title: String,
    /// `Boolean(gameInfo.canRunOffline)`.
    #[serde(default)]
    pub can_run_offline: bool,
    /// `gameInfo.thirdPartyManagedApp`: the app that manages the game, when one does.
    #[serde(default)]
    pub third_party_managed_app: Option<String>,
    /// `gameInfo.install.install_path`, or the folder name of a sideload; `None` when the game info has none.
    #[serde(default)]
    pub install_path: Option<String>,
    /// `game.isNative()`.
    #[serde(default)]
    pub is_native: bool,
    /// Whether the legendary store's session has expired (the probe's latch, read once by the TS).
    #[serde(default)]
    pub store_expired: bool,
    /// The Epic namespace of a legendary game, for the anti-cheat lookup.
    #[serde(default)]
    pub namespace: Option<String>,
}

/// The facts of the running process the shell read and hands the crate, which reads no environment variable
/// of its own: the wine host (the `PATH`, the process environment) and the four environment constants
/// `launcher.ts` imports.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrepareHost {
    #[serde(default)]
    pub wine: WineHost,
    /// `isSteamDeckGameMode`.
    #[serde(default)]
    pub steam_deck_game_mode: bool,
    /// `isSteamDeck` when it is true for a reason other than game mode (the desktop mode); game mode always
    /// counts.
    #[serde(default)]
    pub steam_deck: bool,
    /// `isFlatpak`.
    #[serde(default)]
    pub flatpak: bool,
    /// `flatpakRuntimeVersion`.
    #[serde(default)]
    pub flatpak_runtime_version: String,
}

impl PrepareHost {
    fn steam_deck(&self) -> bool {
        self.steam_deck || self.steam_deck_game_mode
    }
}

/// One line of the game's launch log: `logWriter.logInfo(...parts)` or `logWriter.logWarning(...parts)`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LogEntry {
    pub level: &'static str,
    pub parts: Vec<Value>,
}

/// `LaunchPreperationResult`, with the log lines this step wrote.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareLaunchReply {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mango_hud_command: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_mode_bin: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_scope_command: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offline_mode: Option<bool>,
    /// The per-game log lines, in the order the TS wrote them.
    pub log: Vec<LogEntry>,
}

impl PrepareLaunchReply {
    /// The reply without its log: the shape of the golden's `result.json` (the TS reply).
    pub fn result_value(&self) -> Value {
        let mut value = serde_json::to_value(self).unwrap_or(Value::Null);
        if let Some(fields) = value.as_object_mut() {
            fields.remove("log");
        }
        value
    }
}

/// `resolveEpicOfflineMode` (`storeManagers/legendary/epicOfflineMode.ts`) as the TS applied it through the
/// runner's launch hook (only the legendary hook has one): offline mode is never turned off, and an expired
/// store session turns it on for a legendary game that can run offline.
pub fn resolve_epic_offline_mode(
    offline_mode: bool,
    runner: Runner,
    can_run_offline: bool,
    store_expired: bool,
) -> bool {
    offline_mode || (runner == Runner::Legendary && can_run_offline && store_expired)
}

fn entry(level: &'static str, parts: Vec<Value>) -> LogEntry {
    LogEntry { level, parts }
}

fn info(parts: Vec<Value>) -> LogEntry {
    entry("info", parts)
}

/// `String(value)` for the values an anti-cheat entry holds (`${info.status}`, `${info.anticheats}`): an array
/// joins its elements with `,` (a `null` one is empty), a string is itself.
fn js_to_string(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(text) => text.clone(),
        Value::Array(items) => items.iter().map(js_to_string).collect::<Vec<_>>().join(","),
        Value::Object(_) => "[object Object]".to_string(),
        other => other.to_string(),
    }
}

fn settings_flag(settings: &Value, key: &str) -> bool {
    settings.get(key).is_some_and(js_truthy)
}

/// The text of a non-empty string field.
fn settings_text<'a>(settings: &'a Value, key: &str) -> Option<&'a str> {
    settings
        .get(key)
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
}

/// `prepareLaunch`: the reply and the log lines of one launch's preparation. `Err` is only an unterminated
/// quote in the gamescope additional options (Linux), which the TS threw (shlex's own message).
pub async fn prepare_launch(
    ctx: &LaunchCtx,
    deps: &dyn PrepareDeps,
    args: PrepareLaunchArgs,
    host: &PrepareHost,
) -> Result<PrepareLaunchReply, String> {
    let platform = ctx.engine.platform;
    let runner = args.runner.0;
    let settings = &args.settings;
    let mut log: Vec<LogEntry> = Vec::new();

    let mut offline_mode = settings_flag(settings, "offlineMode") || !ctx.engine.is_online();
    if !offline_mode && runner == Runner::Legendary {
        offline_mode = deps.epic_service_offline().await;
    }

    // R8 (Phase 49): an expired Epic store goes offline for games that can run offline. The flag is read once,
    // here (it arrives as an argument), so a probe that latches it after this point only affects the next launch.
    offline_mode = resolve_epic_offline_mode(
        offline_mode,
        runner,
        args.can_run_offline,
        args.store_expired,
    );

    // Check if the game needs an internet connection.
    if !args.can_run_offline && offline_mode {
        log.push(entry(
            "warning",
            vec![json!(
                "Offline Mode is on but the game does not allow offline mode explicitly."
            )],
        ));
    }

    log.push(info(vec![json!([
        "Launching",
        format!("\"{}\" ({})", args.title, runner.as_str())
    ])]));
    log.push(info(vec![json!(["Native?", args.is_native])]));

    if args
        .third_party_managed_app
        .as_deref()
        .is_some_and(|app| !app.is_empty())
    {
        if platform != Platform::Windows {
            let mut prefix_or_bottle_folder =
                settings_text(settings, "winePrefix").map(str::to_string);
            let crossover = settings
                .get("wineVersion")
                .and_then(|wine| wine.get("type"))
                .and_then(Value::as_str)
                == Some("crossover");
            if platform == Platform::Mac && crossover {
                prefix_or_bottle_folder =
                    match serde_json::from_value::<GameSettingsView>(settings.clone()) {
                        Ok(view) => deps.crossover_bottle_folder(view).await,
                        Err(_) => None,
                    };
            }
            if let Some(folder) = prefix_or_bottle_folder.filter(|folder| !folder.is_empty()) {
                log.push(info(vec![json!(["Installed in:", folder])]));
            }
        }
        log.push(info(vec![json!([
            "Managed by a third-party app:",
            args.third_party_managed_app,
            "\n\n"
        ])]));
    } else {
        log.push(info(vec![json!([
            "Installed in:",
            args.install_path,
            "\n\n"
        ])]));
    }

    let system_info = deps.system_info_text().await.map_or_else(
        || "System information could not be read.".to_string(),
        |text| format!("\n{text}\n\n"),
    );
    log.push(info(vec![json!(["System Info:", system_info])]));

    let steam_deck = host.steam_deck();
    let stored_at = ctx
        .engine
        .paths
        .app_folder
        .join("GamesConfig")
        .join(format!("{}.json", args.app_name));
    log.push(info(vec![json!([
        "Game Settings:",
        filter_game_settings_for_log(settings, platform, !args.is_native, steam_deck),
        "\n",
        format!("Stored at: {}", stored_at.to_string_lossy()),
        "\n\n"
    ])]));

    let anticheat = deps.anticheat_info(args.namespace.clone()).await;
    let status = anticheat.get("status").filter(|status| js_truthy(status));
    log.push(info(vec![json!(status.map_or_else(
        String::new,
        |status| format!("Anticheat Status: {}", js_to_string(status))
    ))]));
    let anticheats = anticheat.get("anticheats").filter(|list| js_truthy(list));
    log.push(info(vec![json!([anticheats.map_or_else(
        String::new,
        |list| format!("Anticheats: {}\n\n", js_to_string(list))
    )])]));

    // If we are not on Linux, we can return here. (The Linux branch is 88.1-11 Task 3.)
    Ok(PrepareLaunchReply {
        success: true,
        offline_mode: Some(offline_mode),
        log,
        ..PrepareLaunchReply::default()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_expired_store_only_turns_offline_mode_on_for_a_legendary_game_that_can_run_offline() {
        use Runner::{Gog, Legendary, Sideload};
        // Never turned off.
        for runner in [Legendary, Gog] {
            for expired in [false, true] {
                assert!(resolve_epic_offline_mode(true, runner, false, expired));
                assert!(resolve_epic_offline_mode(true, runner, true, expired));
            }
        }
        assert!(resolve_epic_offline_mode(false, Legendary, true, true));
        assert!(!resolve_epic_offline_mode(false, Legendary, false, true));
        assert!(!resolve_epic_offline_mode(false, Legendary, true, false));
        for runner in [Gog, Sideload] {
            assert!(!resolve_epic_offline_mode(false, runner, true, true));
        }
    }

    #[test]
    fn an_anticheat_value_is_stringified_as_javascript_does() {
        assert_eq!(
            js_to_string(&json!(["Easy Anti-Cheat", "BattlEye"])),
            "Easy Anti-Cheat,BattlEye"
        );
        // The recorded quirk: an empty list is truthy and prints an empty value.
        assert_eq!(js_to_string(&json!([])), "");
        assert_eq!(
            js_to_string(&json!([null, "a", ["b", "c"], 1, true])),
            ",a,b,c,1,true"
        );
        assert_eq!(js_to_string(&json!("Working")), "Working");
        assert_eq!(js_to_string(&json!({"a": 1})), "[object Object]");
    }

    #[test]
    fn the_arguments_are_strict_and_the_runner_is_one_of_five() {
        let ok = json!({"settings": {}, "runner": "gog", "appName": "a", "title": "T"});
        assert!(serde_json::from_value::<PrepareLaunchArgs>(ok.clone()).is_ok());
        for bad in [
            json!({"settings": {}, "runner": "epic", "appName": "a", "title": "T"}),
            json!({"settings": {}, "runner": "gog", "appName": "a", "title": "T", "extra": 1}),
            json!({"settings": {}, "runner": "gog", "title": "T"}),
        ] {
            assert!(serde_json::from_value::<PrepareLaunchArgs>(bad).is_err());
        }
        assert!(serde_json::from_value::<PrepareHost>(json!({"unknownFact": 1})).is_err());
        let host: PrepareHost = serde_json::from_value(json!({"steamDeckGameMode": true})).unwrap();
        assert!(host.steam_deck());
    }

    #[test]
    fn a_reply_serialises_to_the_ts_shape_without_its_log() {
        let reply = PrepareLaunchReply {
            success: false,
            failure_reason: Some("why".to_string()),
            log: vec![info(vec![json!("x")])],
            ..PrepareLaunchReply::default()
        };
        assert_eq!(
            reply.result_value(),
            json!({"success": false, "failureReason": "why"})
        );
        let full = PrepareLaunchReply {
            success: true,
            mango_hud_command: Some(vec!["/m".into(), "--dlsym".into()]),
            game_mode_bin: Some("/g".into()),
            game_scope_command: Some(vec![]),
            offline_mode: Some(false),
            ..PrepareLaunchReply::default()
        };
        assert_eq!(
            full.result_value(),
            json!({"success": true, "mangoHudCommand": ["/m", "--dlsym"], "gameModeBin": "/g",
                   "gameScopeCommand": [], "offlineMode": false})
        );
    }
}
