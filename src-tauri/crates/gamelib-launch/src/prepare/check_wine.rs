//! `checkWineBeforeLaunch` and `downloadDefaultWine` (`utils.ts`, D-28): the wine self-heal a launch runs before it
//! builds its command.
//!
//! In the TypeScript order `checkWineBeforeLaunch` asks whether the game's wine is valid; if it is, the launch goes
//! on. If it is not, it tries the global default wine, and when that is valid asks the user whether to continue
//! with it. When the default is not valid either, it lists the wines installed on the machine: a valid first one
//! is offered to the user the same way, and an empty list or an invalid first one downloads the default wine for
//! the OS (`downloadDefaultWine`) and, when that works, carries on with it without asking.
//!
//! Pitfall 7 and D-30 interim: the game's config and the global settings are TypeScript's (`games-config` stays 85's,
//! the global settings move with 98), so no wine setting is written here. The reply carries every write as data:
//! `wineVersion` (the wine the caller ends up with, absent when the game's own wine stays), `persistGameWine` (the
//! game's `wineVersion` setting is to be written with it) and `globalWineVersion` (the global `wineVersion` setting
//! is to be written with the downloaded wine). The in-place change of the caller's `gameSettings.wineVersion` the
//! TS made is the adapter's: it sets it from `wineVersion`.
//!
//! The per-game log is the TS `LogWriter`'s, so the lines this step adds come back as data, `{ level, parts }`,
//! with the parts as the TS passed them (`logWarning(['Wine version', name, '...'])` is one array part). The
//! backend log lines go through `EngineCtx.log` as fixed text: wine names and fixed words, never a wine binary
//! path and never the text of an error.
//!
//! The wine manager (refresh, list, install) and the alternative-wine discovery run in process through
//! [`PrepareDeps`]; none of them goes back through the sidecar. The question is asked through the context's
//! [`super::dialogs::LaunchDialogs`]: a dismissal is "No" (the last button, as the TS `showMessageBox` mapped it,
//! T-88.1-34), and a context with no dialog source answers every question as a dismissal.
//!
//! D-20 quirks kept as the TS has them (todos filed by 88.1-04): `isMacSonomaOrHigher` tests the Darwin major
//! against 14, so Ventura gets the Game Porting Toolkit; and a failed alternative-wine discovery escapes
//! `checkWineBeforeLaunch` as a failure (an `Err`, where `downloadDefaultWine` catches and logs it).

use gamelib_wine::wine_cmd::{WineHost, WineInstallation};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::deps::PrepareDeps;
use super::dialogs;
use super::launch::{LogEntry, RunnerArg};
use crate::ctx::LaunchCtx;

/// What the check is told about the game. Strict: an unknown key is a bad argument.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CheckWineArgs {
    pub app_name: String,
    pub runner: RunnerArg,
    /// `gameSettings.wineVersion` (a JSON object): the game's own wine.
    pub wine_version: Value,
    /// `gameSettings.verboseLogs`.
    #[serde(default)]
    pub verbose_logs: bool,
    /// `config.getSettings().disableLogs`.
    #[serde(default)]
    pub disable_logs: bool,
}

/// The check's answer: whether the launch goes on, and the writes the caller is to make.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckWineReply {
    /// `checkWineBeforeLaunch`'s boolean.
    pub ok: bool,
    /// The wine the caller ends up with, when it is not the game's own.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wine_version: Option<WineInstallation>,
    /// The game's `wineVersion` setting is to be written with `wineVersion`.
    pub persist_game_wine: bool,
    /// The global `wineVersion` setting is to be written with this (the wine just downloaded).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub global_wine_version: Option<WineInstallation>,
    /// The per-game log lines the TS wrote through its `LogWriter`, in order.
    pub log: Vec<LogEntry>,
}

impl CheckWineReply {
    fn stays(ok: bool, log: Vec<LogEntry>) -> CheckWineReply {
        CheckWineReply {
            ok,
            wine_version: None,
            persist_game_wine: false,
            global_wine_version: None,
            log,
        }
    }

    fn changes(
        wine: WineInstallation,
        global: Option<WineInstallation>,
        log: Vec<LogEntry>,
    ) -> CheckWineReply {
        CheckWineReply {
            ok: true,
            wine_version: Some(wine),
            persist_game_wine: true,
            global_wine_version: global,
            log,
        }
    }
}

fn log_info(ctx: &LaunchCtx, line: &str) {
    if let Some(log) = &ctx.engine.log {
        log.info(line);
    }
}

fn log_error(ctx: &LaunchCtx, line: &str) {
    if let Some(log) = &ctx.engine.log {
        log.error(line);
    }
}

fn game_line(level: &'static str, parts: &[&str]) -> LogEntry {
    LogEntry {
        level,
        parts: vec![Value::Array(
            parts
                .iter()
                .map(|p| Value::String((*p).to_string()))
                .collect(),
        )],
    }
}

/// A wine installation out of a persisted value: the six declared keys only, each of `lib`, `lib32` and
/// `wineserver` when it is text, `name` as text (empty when absent). `None` when it is no usable installation (not
/// an object, no text `bin`, no `type` of the four), which the TS `validWine` answered `false`.
fn wine_of(value: &Value) -> Option<WineInstallation> {
    let object = value.as_object()?;
    let mut kept = Map::new();
    kept.insert(
        "bin".to_string(),
        object.get("bin").filter(|bin| bin.is_string())?.clone(),
    );
    kept.insert(
        "name".to_string(),
        match object.get("name") {
            Some(name) if name.is_string() => name.clone(),
            _ => Value::String(String::new()),
        },
    );
    kept.insert(
        "type".to_string(),
        object.get("type").filter(|kind| kind.is_string())?.clone(),
    );
    for key in ["lib", "lib32", "wineserver"] {
        if let Some(text) = object.get(key).filter(|text| text.is_string()) {
            kept.insert(key.to_string(), text.clone());
        }
    }
    serde_json::from_value(Value::Object(kept)).ok()
}

/// `ContinueWithFoundWine`: the two-button question, `true` when the user answered Yes. A dismissal, any other
/// button and a context with no dialog source are "No".
fn continue_with_found_wine(ctx: &LaunchCtx, selected_wine: &str, found_wine: &str) -> bool {
    let i18n = &ctx.engine.i18n;
    let none = Map::<String, Value>::new();
    let title = i18n.t("box.warning.wine-change.title", "Wine not found!", &none);
    let mut params = Map::new();
    params.insert("newline".to_string(), Value::String("\n".to_string()));
    params.insert(
        "selectedWine".to_string(),
        Value::String(selected_wine.to_string()),
    );
    params.insert(
        "foundWine".to_string(),
        Value::String(found_wine.to_string()),
    );
    let message = i18n.t(
        "box.warning.wine-change.message",
        "We could not find the selected wine version to launch this title ({{selectedWine}}). {{newline}} We found another one, do you want to continue launching using {{foundWine}} ?",
        &params,
    );
    let buttons = [
        i18n.t("box.yes", "Yes", &none),
        i18n.t("box.no", "No", &none),
    ];
    dialogs::ask(ctx, &title, &message, &buttons) == Some(0)
}

/// `checkWineBeforeLaunch`. `Err` is a fixed reason: `bad-args` for a game wine that is not an object.
pub async fn check_wine_before_launch(
    ctx: &LaunchCtx,
    deps: &dyn PrepareDeps,
    args: CheckWineArgs,
    _host: &WineHost,
) -> Result<CheckWineReply, &'static str> {
    const BAD_ARGS: &str = "bad-args";

    if !args.wine_version.is_object() {
        return Err(BAD_ARGS);
    }
    let selected_name = args
        .wine_version
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    let game_wine = wine_of(&args.wine_version);
    if game_wine.as_ref().is_some_and(|wine| deps.valid_wine(wine)) {
        return Ok(CheckWineReply::stays(true, Vec::new()));
    }

    let mut log: Vec<LogEntry> = Vec::new();
    if !args.disable_logs {
        log_error(
            ctx,
            &format!("Wine version {selected_name} is not valid, trying another one."),
        );
    }
    if args.verbose_logs {
        log.push(game_line(
            "warning",
            &[
                "Wine version",
                &selected_name,
                "is not valid, trying another one.\n",
            ],
        ));
    }

    // Check if the default wine is valid now.
    let default_wine = deps.global_default_wine();
    let default_is_valid = default_wine
        .as_ref()
        .is_some_and(|wine| deps.valid_wine(wine));
    if let (true, Some(default_wine)) = (default_is_valid, default_wine) {
        if continue_with_found_wine(ctx, &selected_name, &default_wine.name) {
            log_info(
                ctx,
                &format!("Changing wine version to {}", default_wine.name),
            );
            if args.verbose_logs {
                log.push(game_line(
                    "info",
                    &["Changing wine version to", &default_wine.name, "\n"],
                ));
            }
            return Ok(CheckWineReply::changes(default_wine, None, log));
        }
        log_info(ctx, "User canceled the launch");
        return Ok(CheckWineReply::stays(false, log));
    }

    // The alternative-wine and download branches are Task 2 of 88.1-14; until they land the answer is "not ok".
    Ok(CheckWineReply::stays(false, log))
}
