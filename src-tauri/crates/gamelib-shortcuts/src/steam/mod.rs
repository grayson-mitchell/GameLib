//! Add to Steam, Remove from Steam and "is it in Steam", ported from `nonesteamgame.ts` (SVC-05, D-09 item 4).
//!
//! A non-Steam shortcut is an entry in Steam's per-user `<steam>/userdata/<user>/config/shortcuts.vdf` plus
//! grid art next to it. Every user folder under `userdata` is handled (not `0`, not `ac`, not a plain file).
//! The file is reached only through [`SteamShortcutsFile`], which the shell implements over the
//! `gamelib-steamfiles` read and apply (one atomic temp-and-rename write per edit): this crate never writes a
//! `shortcuts.vdf` itself (T-94-36). The game's Steam id comes through [`WikiLookup`], the shell's seam over
//! `gamelib-info`; a lookup that found nothing, or failed (WR-42), still writes the shortcut, with the game's
//! own art.
//!
//! Outcomes (D-17): an add raises `notify.finished.add.steam.{success,corrupt}` or the error dialog
//! `box.error.add.steam.*`, a removal `notify.finished.remove.steam.{success,corrupt}`, through the shell's
//! UI and the catalog (`t_unescaped` for the dialog text, which the TS rendered with `escapeValue: false`; a
//! game title in a notification is escaped as i18next escapes it).
//!
//! Choices the TS did not make:
//! - an unset or empty `defaultSteamPath` is the "userdata does not exist" outcome without touching the
//!   disk (the TS joined it onto the working folder);
//! - the user folders are visited in name order;
//! - an unparseable `lastPlayed` means now (see [`entry::last_play_time`]);
//! - a folder that cannot be created is that user's error, not a crash;
//! - `LaunchOptions` percent-encodes the app name and runner (quick 261128-4j2).
//!
//! Removal proves the entry is GameLib's first (quick 261125-uzz). The TS removed the first entry whose
//! `AppName` equals the game's title, whoever wrote it; here an entry goes only when its `LaunchOptions` carry
//! GameLib's launch URL for this game's app name ([`proves_app_name`]). In each user's file the target is the
//! first entry titled like the game that proves it, named to the edit by its exact `LaunchOptions`, which
//! `gamelib-steamfiles` matches again on its own locked re-read. A same-titled entry that does not prove it
//! (the user's own, or another launcher's) stays with its grid art, and the outcome is reported as not removed
//! (a log note and the corrupt notice), never as success. The removed entry's own `Exe` and `AppName` (as
//! `shortcuts.vdf` held them) name the grid art that goes with it. The removal goldens replay against
//! `tests/fixtures/golden/steam/deltas.json` for the entries the TS removed that carry no GameLib launch URL, and also holds the one add golden whose name encodes.

pub mod art;
pub mod entry;
pub mod ids;

use std::path::{Path, PathBuf};

use serde::Deserialize;
use serde_json::{json, Map, Value};

use crate::ctx::{
    EntrySummary, ShortcutsCtx, ShortcutsMutation, ShortcutsSummary, SteamShortcutsFile,
};
use crate::game::{ShortcutGame, ShortcutSettings};
use crate::icons::get_icon;

use self::art::{prepare_images, remove_images, ArtIds};
use self::entry::{fields, last_play_time, launch_options, program, NewEntry};
use self::ids::generate_shortcut_id;

/// The arguments of `shortcuts_steam_add`, `shortcuts_steam_remove` and `shortcuts_steam_is_added`: the game
/// and the settings (only `defaultSteamPath` is read).
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SteamArgs {
    pub game: ShortcutGame,
    pub settings: ShortcutSettings,
}

/// The wiki's answer as the Steam id the TS read: `pcgamingwiki.steamID ?? gamesdb.steamID`. A `null` or
/// absent id falls through to the next source, an empty one does not, and an empty result is no id.
pub fn steam_id_of(wiki: &Value) -> Option<String> {
    let id_of = |source: &str| match wiki.get(source).and_then(|s| s.get("steamID")) {
        None | Some(Value::Null) => None,
        Some(Value::String(text)) => Some(text.clone()),
        Some(Value::Number(number)) => Some(number.to_string()),
        Some(_) => Some(String::new()),
    };
    id_of("pcgamingwiki")
        .or_else(|| id_of("gamesdb"))
        .filter(|id| !id.is_empty())
}

// ------------------------------------------------------------------ text

fn params(pairs: &[(&str, &str)]) -> Map<String, Value> {
    pairs
        .iter()
        .map(|(key, value)| ((*key).to_string(), json!(value)))
        .collect()
}

/// `{{name}}` filled from `params`, HTML-escaped when `escape`: the catalog's own rule for a context that has
/// no catalog loaded (the English default text).
fn fill(template: &str, params: &Map<String, Value>, escape: bool) -> String {
    let mut out = template.to_string();
    for (name, value) in params {
        let text = value.as_str().unwrap_or_default();
        let text = if escape {
            text.replace('&', "&amp;")
                .replace('<', "&lt;")
                .replace('>', "&gt;")
                .replace('"', "&quot;")
                .replace('\'', "&#39;")
                .replace('/', "&#x2F;")
        } else {
            text.to_string()
        };
        out = out.replace(&format!("{{{{{name}}}}}"), &text);
    }
    out
}

/// A catalog text with the TS call's English default. `escape` is i18next's `escapeValue` (the TS passed
/// `false` only for the error dialog).
fn text(
    ctx: &ShortcutsCtx,
    key: &str,
    default: &str,
    pairs: &[(&str, &str)],
    escape: bool,
) -> String {
    let params = params(pairs);
    match (&ctx.catalog, escape) {
        (Some(catalog), true) => catalog.t(key, default, &params),
        (Some(catalog), false) => catalog.t_unescaped(key, default, &params),
        (None, _) => fill(default, &params, escape),
    }
}

/// The error dialog (`showErrorInFrontend`).
fn show_error(ctx: &ShortcutsCtx, game_title: &str, error: &str) {
    let Some(ui) = &ctx.ui else {
        return;
    };
    let message = text(
        ctx,
        "box.error.add.steam.body",
        "Adding {{game}} to Steam failed with:{{newLine}} {{error}}",
        &[("game", game_title), ("newLine", "\n"), ("error", error)],
        false,
    );
    let title = text(
        ctx,
        "box.error.add.steam.title",
        "Error Adding Game to Steam",
        &[],
        true,
    );
    ui.show_dialog(&title, &message, "ERROR");
}

/// The result notification (`notifyFrontend`): `message` under the added or removed title.
fn notify_frontend(ctx: &ShortcutsCtx, message: &str, adding: bool) {
    let Some(ui) = &ctx.ui else {
        return;
    };
    let title = if adding {
        text(
            ctx,
            "notify.finished.add.steam.title",
            "Added to Steam",
            &[],
            true,
        )
    } else {
        text(
            ctx,
            "notify.finished.remove.steam.title",
            "Removed from Steam",
            &[],
            true,
        )
    };
    ui.notify(&title, message);
}

// ------------------------------------------------------------ the folders

/// `<defaultSteamPath without its single quotes>/userdata`; `None` for an unset or empty path.
fn userdata_dir(settings: &ShortcutSettings) -> Option<PathBuf> {
    let path = settings
        .default_steam_path
        .as_deref()
        .unwrap_or_default()
        .replace('\'', "");
    (!path.is_empty()).then(|| Path::new(&path).join("userdata"))
}

/// The user folders under `userdata` (`checkSteamUserDataDir`), or the message the TS showed.
fn check_userdata_dir(userdata: Option<&Path>) -> Result<Vec<String>, String> {
    let Some(dir) = userdata.filter(|dir| dir.exists()) else {
        let shown = userdata.map_or_else(|| "userdata".to_string(), |d| d.display().to_string());
        return Err(format!(
            "{shown} does not exist. Can't add/remove game to/from Steam!"
        ));
    };
    let mut folders: Vec<String> = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| name != "0" && name != "ac")
        .collect();
    folders.sort();
    if folders.is_empty() {
        return Err(format!(
            "{} does not contain a valid user directory!",
            dir.display()
        ));
    }
    Ok(folders)
}

/// A read that failed is an unparsed summary carrying the error, as the TS `readSummary` made it.
fn read_summary(files: &dyn SteamShortcutsFile, path: &Path) -> ShortcutsSummary {
    files.read(path).unwrap_or_else(|error| ShortcutsSummary {
        exists: true,
        read_error: Some(error),
        ..ShortcutsSummary::default()
    })
}

/// The messages that say why a `shortcuts.vdf` is not usable (`shortcutsValidityFromSummary`), in the TS's
/// order; empty when it is usable.
fn validity_errors(summary: &ShortcutsSummary) -> Vec<String> {
    if !summary.parsed {
        return vec![summary
            .read_error
            .clone()
            .unwrap_or_else(|| "Could not parse shortcuts.vdf!".to_string())];
    }
    if !summary.has_shortcuts_root {
        return vec!["Could not find entry \"shortcuts\"!".to_string()];
    }
    if !summary.root_is_list {
        return vec!["Entry \"shortcuts\" is not an array!".to_string()];
    }
    let mut errors = Vec::new();
    for entry in &summary.entries {
        for (present, key) in [
            (entry.has_app_name, "AppName"),
            (entry.has_exe, "Exe"),
            (entry.has_launch_options, "LaunchOptions"),
        ] {
            if !present {
                errors.push(format!(
                    "One of the game entries is missing the {key} parameter!"
                ));
            }
        }
    }
    errors
}

fn has_title(summary: &ShortcutsSummary, title: &str) -> bool {
    summary
        .entries
        .iter()
        .any(|entry| entry.app_name.as_deref() == Some(title))
}

/// The start of the launch URL GameLib writes into a shortcut's `LaunchOptions`.
const LAUNCH_URL_PREFIX: &str = "gamelib://launch?appName=";

/// Whether `launch_options` carry GameLib's launch URL for `app_name`: the proof that GameLib wrote the
/// entry for this game. It accepts the URL [`entry::launch_options`] writes now, with the app name
/// percent-encoded, and the raw form the TS, and this port before quick 261128-4j2, wrote into entries that
/// are still in users' files. Anything else is refused: a
/// different app name, a pre-rebrand `heroic://` URL, a value that percent-decodes to invalid UTF-8, an
/// empty app name. The runner is not compared.
fn proves_app_name(launch_options: &str, app_name: &str) -> bool {
    if app_name.is_empty() {
        return false;
    }
    launch_options
        .match_indices(LAUNCH_URL_PREFIX)
        .any(|(at, prefix)| {
            let after = &launch_options[at + prefix.len()..];
            // The raw form: the app name, then `&runner=`, whatever bytes the name holds.
            if after
                .strip_prefix(app_name)
                .is_some_and(|rest| rest.starts_with("&runner="))
            {
                return true;
            }
            // The encoded form: the value up to the first `&`, quote or whitespace, decoded.
            let end = after
                .find(|c: char| c == '&' || c == '"' || c.is_ascii_whitespace())
                .unwrap_or(after.len());
            percent_encoding::percent_decode_str(&after[..end])
                .decode_utf8()
                .is_ok_and(|decoded| decoded == app_name)
        })
}

/// The first entry titled `title` whose `LaunchOptions` prove `app_name`: the entry a removal targets.
fn proven_entry<'a>(
    summary: &'a ShortcutsSummary,
    title: &str,
    app_name: &str,
) -> Option<&'a EntrySummary> {
    summary.entries.iter().find(|entry| {
        entry.app_name.as_deref() == Some(title)
            && entry
                .launch_options
                .as_deref()
                .is_some_and(|options| proves_app_name(options, app_name))
    })
}

fn config_paths(userdata: &Path, folder: &str) -> (PathBuf, PathBuf) {
    let config_dir = userdata.join(folder).join("config");
    let shortcuts_file = config_dir.join("shortcuts.vdf");
    (config_dir, shortcuts_file)
}

// ------------------------------------------------------------------- add

/// The game's Steam id from the wiki; a lookup that failed or found none is `None`.
async fn lookup_steam_id(ctx: &ShortcutsCtx, game: &ShortcutGame) -> Option<String> {
    let wiki = ctx.wiki.as_ref()?;
    wiki.steam_id(&game.title, &game.app_name, &game.runner)
        .await
        .filter(|id| !id.is_empty())
}

/// Adds a game to Steam as a non-Steam shortcut (`addNonSteamGame`): `true` when it is in at least one user's
/// `shortcuts.vdf` afterwards. Raises the outcome's notification or error dialog.
pub async fn steam_add(
    ctx: &ShortcutsCtx,
    game: &ShortcutGame,
    settings: &ShortcutSettings,
) -> bool {
    let Some(files) = ctx.steam_files.clone() else {
        ctx.note("shortcuts steam: no shortcuts.vdf seam installed");
        return false;
    };
    let steam_id = lookup_steam_id(ctx, game).await;
    let userdata = userdata_dir(settings);
    let folders = match check_userdata_dir(userdata.as_deref()) {
        Ok(folders) => folders,
        Err(error) => {
            ctx.note("shortcuts steam: no usable Steam userdata folder");
            show_error(ctx, &game.title, &error);
            return false;
        }
    };
    let userdata = userdata.unwrap_or_default();

    let mut errors: Vec<String> = Vec::new();
    let mut added = false;
    for folder in &folders {
        let (config_dir, shortcuts_file) = config_paths(&userdata, folder);
        if !config_dir.exists() && std::fs::create_dir(&config_dir).is_err() && !config_dir.is_dir()
        {
            errors.push(format!(
                "Can't add \"{}\" to Steam user \"{folder}\". \"{}\" could not be created!",
                game.title,
                config_dir.display()
            ));
            continue;
        }

        // A missing file is created by the add (`createIfMissing`).
        let summary = read_summary(files.as_ref(), &shortcuts_file);
        if summary.exists {
            let problems = validity_errors(&summary);
            if !problems.is_empty() {
                errors.push(format!(
                    "Can't add \"{}\" to Steam user \"{folder}\". \"{}\" is corrupted!",
                    game.title,
                    shortcuts_file.display()
                ));
                errors.extend(problems);
                continue;
            }
            if has_title(&summary, &game.title) {
                added = true;
                continue;
            }
        }

        let program = program(ctx);
        let appid = generate_shortcut_id(&program.exe, &game.title);
        let icon = get_icon(ctx, &crate::add::icon_input(game))
            .await
            .map(|path| path.to_string_lossy().into_owned());
        if icon.is_none() {
            ctx.note("shortcuts steam: no icon for the shortcut");
        }
        let ids = ArtIds::of(&program.exe, &game.title);
        prepare_images(ctx, &config_dir, &ids, game, steam_id.as_deref()).await;

        let new_entry = NewEntry {
            app_name: game.title.clone(),
            exe: program.exe,
            start_dir: program.start_dir,
            appid,
            icon,
            launch_options: launch_options(ctx, game),
            last_play_time: last_play_time(ctx, &game.app_name),
        };
        let mutation = ShortcutsMutation::Add {
            entry: fields(&new_entry),
            create_if_missing: true,
        };
        match files.apply(&shortcuts_file, &mutation) {
            Ok(result) if !result.written && !result.already_present => {
                errors.push(
                    result
                        .read_error
                        .unwrap_or_else(|| "shortcuts.vdf was not written".to_string()),
                );
                continue;
            }
            Ok(_) => {}
            Err(error) => {
                errors.push(error);
                continue;
            }
        }
        added = true;
    }

    if !added {
        ctx.note("shortcuts steam: the game was not added to any Steam user");
        show_error(ctx, &game.title, &errors.join("\n"));
        return false;
    }
    if errors.is_empty() {
        let message = text(
            ctx,
            "notify.finished.add.steam.success",
            "{{game}} was successfully added to Steam. A restart of Steam is required for changes to take effect.",
            &[("game", &game.title)],
            true,
        );
        notify_frontend(ctx, &message, true);
    } else {
        ctx.note("shortcuts steam: the game could not be added to all Steam users");
        let message = text(
            ctx,
            "notify.finished.add.steam.corrupt",
            "{{game}} could not be added to all found Steam users. See logs for more info. A restart of Steam is required for changes to take effect.",
            &[("game", &game.title)],
            true,
        );
        notify_frontend(ctx, &message, true);
    }
    true
}

// ---------------------------------------------------------------- remove

/// Removes a game from Steam (`removeNonSteamGame`): in every user's `shortcuts.vdf`, the first entry titled
/// like the game whose `LaunchOptions` prove GameLib wrote it for this game ([`proves_app_name`]), and that
/// entry's grid art. A same-titled entry that does not prove it is left in place with its art and the outcome
/// is the "could not be removed" notice, never the success one. A missing userdata folder is silent (the user
/// may have moved Steam; the game is then taken as gone). Raises the outcome's notification.
pub fn steam_remove(ctx: &ShortcutsCtx, game: &ShortcutGame, settings: &ShortcutSettings) {
    let Some(files) = ctx.steam_files.clone() else {
        ctx.note("shortcuts steam: no shortcuts.vdf seam installed");
        return;
    };
    let userdata = userdata_dir(settings);
    let folders = match check_userdata_dir(userdata.as_deref()) {
        Ok(folders) => folders,
        Err(_) => {
            ctx.note("shortcuts steam: no usable Steam userdata folder, nothing to remove");
            return;
        }
    };
    let userdata = userdata.unwrap_or_default();

    let mut errors: Vec<String> = Vec::new();
    let mut removed = false;
    let mut refused = 0usize;
    for folder in &folders {
        let (config_dir, shortcuts_file) = config_paths(&userdata, folder);
        if !config_dir.exists() || !shortcuts_file.exists() {
            continue;
        }
        let summary = read_summary(files.as_ref(), &shortcuts_file);
        let problems = validity_errors(&summary);
        if !problems.is_empty() {
            errors.push(format!(
                "Can't remove \"{}\" from Steam user \"{folder}\". \"{}\" is corrupted!",
                game.title,
                shortcuts_file.display()
            ));
            errors.extend(problems);
            continue;
        }
        if !has_title(&summary, &game.title) {
            continue;
        }
        let Some(target) = proven_entry(&summary, &game.title, &game.app_name) else {
            refused += 1;
            ctx.note(
                "shortcuts steam: a shortcut titled like the game was left in place, it does not carry GameLib's launch URL for this game",
            );
            continue;
        };
        let mutation = ShortcutsMutation::Remove {
            app_name: game.title.clone(),
            launch_options: target.launch_options.clone().unwrap_or_default(),
        };
        match files.apply(&shortcuts_file, &mutation) {
            Ok(result) if !result.written => {
                if let Some(error) = result.read_error {
                    errors.push(error);
                }
            }
            Ok(result) => {
                removed = true;
                remove_images(
                    ctx,
                    &config_dir,
                    result.removed_exe.as_deref().unwrap_or_default(),
                    result.removed_app_name.as_deref().unwrap_or_default(),
                );
            }
            Err(error) => errors.push(error),
        }
    }

    if errors.is_empty() && refused == 0 {
        // The game was on no Steam shortcut list: nothing to say.
        if !removed {
            return;
        }
        let message = text(
            ctx,
            "notify.finished.remove.steam.success",
            "{{game}} was successfully removed from Steam. A restart of Steam is required for changes to take effect.",
            &[("game", &game.title)],
            true,
        );
        notify_frontend(ctx, &message, false);
    } else {
        ctx.note("shortcuts steam: the game could not be removed from all Steam users");
        let message = text(
            ctx,
            "notify.finished.remove.steam.corrupt",
            "{{game}} could not be removed from all found Steam users. See logs for more info. A restart of Steam is required for changes to take effect.",
            &[("game", &game.title)],
            true,
        );
        notify_frontend(ctx, &message, false);
    }
}

// -------------------------------------------------------------- is added

/// Whether the game is in any user's `shortcuts.vdf` (`isAddedToSteam`). A missing folder, a missing or
/// unusable file all answer `false`.
pub fn steam_is_added(
    ctx: &ShortcutsCtx,
    game: &ShortcutGame,
    settings: &ShortcutSettings,
) -> bool {
    let Some(files) = ctx.steam_files.clone().filter(|_| !game.title.is_empty()) else {
        return false;
    };
    let userdata = userdata_dir(settings);
    let Ok(folders) = check_userdata_dir(userdata.as_deref()) else {
        return false;
    };
    let userdata = userdata.unwrap_or_default();
    let mut added = false;
    for folder in &folders {
        let (config_dir, shortcuts_file) = config_paths(&userdata, folder);
        if !config_dir.exists() || !shortcuts_file.exists() {
            continue;
        }
        let summary = read_summary(files.as_ref(), &shortcuts_file);
        if validity_errors(&summary).is_empty() && has_title(&summary, &game.title) {
            added = true;
        }
    }
    added
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn the_steam_id_is_pcgamingwiki_then_gamesdb_and_an_empty_one_is_none() {
        let id = |v: Value| steam_id_of(&v);
        assert_eq!(id(json!(null)), None);
        assert_eq!(id(json!({})), None);
        assert_eq!(
            id(json!({"pcgamingwiki": {"steamID": "292030"}, "gamesdb": {"steamID": "730"}})),
            Some("292030".to_string())
        );
        assert_eq!(
            id(json!({"gamesdb": {"steamID": "730"}})),
            Some("730".to_string())
        );
        // `??` falls through a null, not an empty string.
        assert_eq!(
            id(json!({"pcgamingwiki": {"steamID": null}, "gamesdb": {"steamID": "730"}})),
            Some("730".to_string())
        );
        assert_eq!(
            id(json!({"pcgamingwiki": {"steamID": ""}, "gamesdb": {"steamID": "730"}})),
            None
        );
        assert_eq!(
            id(json!({"pcgamingwiki": {"steamID": 292030}})),
            Some("292030".to_string())
        );
    }

    #[test]
    fn the_default_text_fills_and_escapes_like_i18next() {
        let p = params(&[("game", "A & \"B\"")]);
        assert_eq!(fill("{{game}}!", &p, true), "A &amp; &quot;B&quot;!");
        assert_eq!(fill("{{game}}!", &p, false), "A & \"B\"!");
    }

    #[test]
    fn the_validity_messages_keep_the_ts_order() {
        let ok_entry = crate::ctx::EntrySummary {
            has_app_name: true,
            has_exe: true,
            has_launch_options: true,
            ..Default::default()
        };
        let mut summary = ShortcutsSummary {
            exists: true,
            parsed: true,
            has_shortcuts_root: true,
            root_is_list: true,
            entries: vec![ok_entry.clone()],
            ..Default::default()
        };
        assert!(validity_errors(&summary).is_empty());
        summary.entries.push(crate::ctx::EntrySummary {
            has_exe: true,
            ..Default::default()
        });
        assert_eq!(
            validity_errors(&summary),
            [
                "One of the game entries is missing the AppName parameter!",
                "One of the game entries is missing the LaunchOptions parameter!"
            ]
        );
        summary.root_is_list = false;
        assert_eq!(
            validity_errors(&summary),
            ["Entry \"shortcuts\" is not an array!"]
        );
        summary.has_shortcuts_root = false;
        assert_eq!(
            validity_errors(&summary),
            ["Could not find entry \"shortcuts\"!"]
        );
        summary.parsed = false;
        assert_eq!(
            validity_errors(&summary),
            ["Could not parse shortcuts.vdf!"]
        );
        summary.read_error = Some("parse: x".to_string());
        assert_eq!(validity_errors(&summary), ["parse: x"]);
    }

    #[test]
    fn an_unset_steam_path_is_no_userdata_folder_and_quotes_are_dropped() {
        let settings = |path: Option<&str>| ShortcutSettings {
            add_desktop_shortcuts: false,
            add_start_menu_shortcuts: false,
            add_steam_shortcuts: true,
            default_steam_path: path.map(str::to_string),
        };
        assert_eq!(userdata_dir(&settings(None)), None);
        assert_eq!(userdata_dir(&settings(Some(""))), None);
        assert_eq!(userdata_dir(&settings(Some("''"))), None);
        assert_eq!(
            userdata_dir(&settings(Some("/s/Steam'"))),
            Some(Path::new("/s/Steam").join("userdata"))
        );
        assert_eq!(
            check_userdata_dir(None),
            Err("userdata does not exist. Can't add/remove game to/from Steam!".to_string())
        );
    }

    fn proof_ctx(platform: crate::ctx::Platform) -> ShortcutsCtx {
        use gamelib_core::clock::SystemClock;
        use gamelib_core::shutdown::Shutdown;
        use gamelib_store::host::StoreHost;
        use std::sync::Arc;
        ShortcutsCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            platform,
            Shutdown::new(),
        )
    }

    fn proof_game(app_name: &str, runner: &str) -> ShortcutGame {
        serde_json::from_value(json!({
            "appName": app_name,
            "runner": runner,
            "title": "Game",
            "isDlc": false,
            "canAddSteamShortcut": true,
        }))
        .expect("a game")
    }

    #[test]
    fn the_proof_accepts_what_the_add_path_writes() {
        use crate::ctx::Platform;
        let hostile = "a b&c\"d%25e";
        for app in ["game-one", hostile] {
            let game = proof_game(app, "legendary");
            let linux = proof_ctx(Platform::Linux);
            let windows = proof_ctx(Platform::Windows);
            let flatpak = proof_ctx(Platform::Linux).with_launch_env(
                Some("com.example.GameLib".to_string()),
                None,
                None,
            );
            for ctx in [&linux, &windows, &flatpak] {
                let options = launch_options(ctx, &game);
                assert!(proves_app_name(&options, app), "{options}");
            }
        }
        let encoded = format!(
            "--no-gui \"{}\"",
            crate::launch_url::launch_url(hostile, "gog", true)
        );
        assert!(proves_app_name(&encoded, hostile), "{encoded}");
    }

    /// The (app name, runner) pair of the hostile add golden, read from its recorded `input`.
    fn hostile_golden_pair() -> (String, String) {
        let golden: Value = serde_json::from_str(include_str!(
            "../../tests/fixtures/golden/steam/add-launch-options-hostile-app-name.json"
        ))
        .expect("the hostile golden is JSON");
        let field = |key: &str| {
            golden["input"][key]
                .as_str()
                .unwrap_or_else(|| panic!("input.{key} is a string"))
                .to_string()
        };
        (field("appName"), field("runner"))
    }

    #[test]
    fn the_launch_options_hold_one_quoted_url_that_decodes_to_the_inputs() {
        use crate::ctx::Platform;
        use crate::launch_url::launch_url;
        let (hostile_app, hostile_runner) = hostile_golden_pair();
        let hostile_pairs = [
            (hostile_app, hostile_runner),
            ("a b&c\"d%25e".to_string(), "legendary".to_string()),
        ];
        let control_pairs = [
            ("oracle-app".to_string(), "legendary".to_string()),
            ("jorg".to_string(), "gog".to_string()),
        ];
        let flatpak_id = "com.example.GameLib";
        let mut failures = Vec::new();
        for (index, (app, runner)) in hostile_pairs.iter().chain(&control_pairs).enumerate() {
            let hostile = index < hostile_pairs.len();
            let game = proof_game(app, runner);
            let contexts = [
                (
                    "linux",
                    proof_ctx(Platform::Linux),
                    "--no-gui --no-sandbox ".to_string(),
                ),
                (
                    "windows",
                    proof_ctx(Platform::Windows),
                    "--no-gui ".to_string(),
                ),
                (
                    "flatpak",
                    proof_ctx(Platform::Linux).with_launch_env(
                        Some(flatpak_id.to_string()),
                        None,
                        None,
                    ),
                    format!("run {flatpak_id} --no-gui --no-sandbox "),
                ),
            ];
            for (name, ctx, prefix) in contexts {
                let case = format!("{app:?}/{runner:?} on {name}");
                let options = launch_options(&ctx, &game);
                let quotes = options.matches('"').count();
                if quotes != 2 {
                    failures.push(format!("{case}: {quotes} double quotes in {options}"));
                }
                let encoded = format!("{prefix}\"{}\"", launch_url(app, runner, true));
                if options != encoded {
                    failures.push(format!("{case}: {options} is not {encoded}"));
                }
                if let Some(quoted) = options.split('"').nth(1) {
                    let pairs: Vec<(String, String)> = match url::Url::parse(quoted) {
                        Ok(parsed) => parsed
                            .query_pairs()
                            .map(|(k, v)| (k.into_owned(), v.into_owned()))
                            .collect(),
                        Err(error) => {
                            failures.push(format!("{case}: the URL does not parse: {error}"));
                            Vec::new()
                        }
                    };
                    let wanted = vec![
                        ("appName".to_string(), app.clone()),
                        ("runner".to_string(), runner.clone()),
                    ];
                    if !quoted.starts_with("gamelib://launch?") || pairs != wanted {
                        failures.push(format!("{case}: {quoted} decodes to {pairs:?}"));
                    }
                }
                if !proves_app_name(&options, app) {
                    failures.push(format!("{case}: the proof refuses {options}"));
                }
                let old = format!("{prefix}\"{}\"", launch_url(app, runner, false));
                if hostile {
                    // A shortcut written before the fix stays removable.
                    if !proves_app_name(&old, app) {
                        failures.push(format!("{case}: the proof refuses the old line {old}"));
                    }
                } else if options != old {
                    // A name the encoder leaves alone writes the bytes it always wrote.
                    failures.push(format!("{case}: {options} differs from the old {old}"));
                }
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    #[test]
    fn the_proof_refuses_what_is_not_this_games_launch_url() {
        assert!(!proves_app_name("", "X"));
        assert!(!proves_app_name("-fullscreen", "X"));
        assert!(!proves_app_name(
            "--no-gui \"heroic://launch?appName=X&runner=legendary\"",
            "X"
        ));
        let url =
            |app: &str| format!("--no-gui \"gamelib://launch?appName={app}&runner=legendary\"");
        assert!(proves_app_name(&url("X"), "X"));
        assert!(!proves_app_name(&url("X2"), "X"));
        assert!(!proves_app_name(&url("X"), "X2"));
        assert!(!proves_app_name(&url("X"), ""));
        assert!(!proves_app_name(&url(""), ""));
        // A value that decodes to invalid UTF-8 is a refusal, never a lossy match.
        let bad = "--no-gui \"gamelib://launch?appName=%FF&runner=gog\"";
        assert!(!proves_app_name(bad, "\u{FFFD}"));
        // The raw form still matches the same bytes taken literally.
        assert!(proves_app_name(bad, "%FF"));
    }

    #[test]
    fn the_target_is_the_proven_entry_not_the_first_titled_one() {
        let entry = |key: &str, title: &str, options: &str| EntrySummary {
            index_key: key.to_string(),
            app_name: Some(title.to_string()),
            launch_options: Some(options.to_string()),
            ..Default::default()
        };
        let ours = "--no-gui \"gamelib://launch?appName=A&runner=gog\"";
        let mut summary = ShortcutsSummary {
            exists: true,
            parsed: true,
            has_shortcuts_root: true,
            root_is_list: true,
            entries: vec![
                entry("0", "T", "-x"),
                entry("1", "T", ours),
                entry("2", "Other", ours),
            ],
            ..Default::default()
        };
        assert_eq!(
            proven_entry(&summary, "T", "A").map(|e| e.index_key.as_str()),
            Some("1")
        );
        summary.entries.remove(1);
        assert!(proven_entry(&summary, "T", "A").is_none());
    }

    #[test]
    fn the_removal_names_launch_options_on_the_wire() {
        let mutation = ShortcutsMutation::Remove {
            app_name: "Same".to_string(),
            launch_options: "gamelib-args".to_string(),
        };
        assert_eq!(
            serde_json::to_value(&mutation).expect("json"),
            json!({"op": "remove", "appName": "Same", "launchOptions": "gamelib-args"})
        );
    }

    #[test]
    fn the_user_folders_skip_0_ac_and_plain_files_and_come_in_name_order() {
        let dir = tempfile::tempdir().expect("a temp dir");
        for name in ["1002", "0", "ac", "1001"] {
            std::fs::create_dir(dir.path().join(name)).expect("a folder");
        }
        std::fs::write(dir.path().join("stray.txt"), "x").expect("a file");
        assert_eq!(
            check_userdata_dir(Some(dir.path())),
            Ok(vec!["1001".to_string(), "1002".to_string()])
        );
        let empty = tempfile::tempdir().expect("a temp dir");
        std::fs::create_dir(empty.path().join("ac")).expect("a folder");
        assert!(check_userdata_dir(Some(empty.path()))
            .expect_err("no user folder")
            .ends_with("does not contain a valid user directory!"));
    }
}
