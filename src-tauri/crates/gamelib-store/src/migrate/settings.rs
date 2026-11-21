//! The `settings/global` and `settings/game` migration chains (Phase 68, D-10, D-11; Phase 70 gap G3), ported
//! unchanged (D-12).
//!
//! v0 -> v1 folds the two ad hoc read-side fix-ups into one persisted step: `darkTrayIcon` becomes
//! `trayIconVariant` and the retired `libraryTopSection` seeds `focusRow`. Both read the ORIGINAL
//! object: the presence guard and the legacy seed must see what is on disk, never a default-merged
//! copy. The version stamp is written by the engine, not here.
//!
//! v1 -> v2 strips `defaultSettings` to `appSettingsSchema.partial()` (the generated descriptor):
//! undeclared or retired keys, rejected nulls and invalid values go, an invalid array element on its
//! own, and an older-build `gamescope` is repaired rather than dropped. An invalid user value is dropped
//! from the live file by design; the engine's pre-migration backup keeps the original.

use crate::json::{Json, Obj};
use crate::migrate::strip::{strip, StripOptions};
use crate::migrate::Step;
use crate::schema::{schemas, Node};

/// The four members of `LibraryView`, which a `focusRow` of kind `view` must name.
const FOCUS_ROW_VIEWS: [&str; 4] = ["all", "installed", "recentlyPlayed", "favourites"];
const FOCUS_ROW_KINDS: [&str; 4] = ["view", "collection", "store", "runnability"];
const TRAY_ICON_VARIANTS: [&str; 3] = ["auto", "light", "dark"];

/// `isValidFocusRowSelection`: an object whose `kind` is one of the four kinds and whose `value` is a
/// non-empty string, and for `kind: 'view'` one of the four real views.
fn is_valid_focus_row(value: &Json) -> bool {
    let Json::Obj(o) = value else { return false };
    let Some(kind) = o.get("kind").and_then(Json::as_str) else {
        return false;
    };
    let Some(pick) = o.get("value").and_then(Json::as_str) else {
        return false;
    };
    FOCUS_ROW_KINDS.contains(&kind)
        && !pick.is_empty()
        && (kind != "view" || FOCUS_ROW_VIEWS.contains(&pick))
}

/// `migrateTrayIconVariant`: a valid `trayIconVariant` wins, then the legacy boolean `darkTrayIcon`
/// (strictly `true` is `dark`, strictly `false` is `light`), else `auto`.
fn migrate_tray_icon_variant(stored: &Obj) -> Json {
    if let Some(v) = stored.get("trayIconVariant").and_then(Json::as_str) {
        if TRAY_ICON_VARIANTS.contains(&v) {
            return Json::Str(v.to_string());
        }
    }
    Json::Str(
        match stored.get("darkTrayIcon") {
            Some(Json::Bool(true)) => "dark",
            Some(Json::Bool(false)) => "light",
            _ => "auto",
        }
        .to_string(),
    )
}

fn view_selection(value: &str) -> Json {
    let mut o = Obj::new();
    o.insert_js("kind", Json::Str("view".to_string()));
    o.insert_js("value", Json::Str(value.to_string()));
    Json::Obj(o)
}

/// `migrateFocusRowSelection`: a PRESENT `focusRow` key wins whatever its value (valid is kept, anything
/// else becomes `null`) and never consults `libraryTopSection`; otherwise the legacy section seeds it.
fn migrate_focus_row(stored: &Obj) -> Json {
    if let Some(present) = stored.get("focusRow") {
        return if is_valid_focus_row(present) {
            present.clone()
        } else {
            Json::Null
        };
    }
    match stored.get("libraryTopSection").and_then(Json::as_str) {
        Some("recently_played" | "recently_played_installed") => view_selection("recentlyPlayed"),
        Some("favourites") => view_selection("favourites"),
        _ => Json::Null,
    }
}

/// `gamescope` fields added after the first gamescope build, each with the value the runtime already
/// assumes when the field is absent.
fn repair_legacy_shapes(settings: &Obj) -> Obj {
    let Some(Json::Obj(gamescope)) = settings.get("gamescope") else {
        return settings.clone();
    };
    let additive = [
        ("additionalOptions", Json::Str(String::new())),
        ("enableForceGrabCursor", Json::Bool(false)),
    ];
    let missing: Vec<(&str, Json)> = additive
        .into_iter()
        .filter(|(key, _)| matches!(gamescope.get(key), None | Some(Json::Null)))
        .collect();
    if missing.is_empty() {
        return settings.clone();
    }
    let mut repaired = gamescope.clone();
    for (key, value) in missing {
        repaired.insert_js(key, value);
    }
    let mut out = settings.clone();
    out.insert_js("gamescope", Json::Obj(repaired));
    out
}

/// Repairs, then strips `settings` against `node` (a `.partial()` settings schema). Settings are user
/// state, so the strip is leaf- and element-granular: one bad value is removed and its valid siblings
/// stay. TS also wrote the removed and changed key names to stderr; this crate has no log channel, and
/// the backup keeps the original.
pub fn strip_settings(settings: &Obj, node: &Node) -> Json {
    strip(
        node,
        &Json::Obj(repair_legacy_shapes(settings)),
        StripOptions {
            drop_invalid_optional: true,
            drop_invalid_elements: true,
        },
    )
}

/// Replaces `top[key]` with `next`, keeping its position.
fn set_member(top: &mut Json, key: &str, next: Json) {
    if let Json::Obj(o) = top {
        o.insert_js(key, next);
    }
}

/// `settingsGlobalChain`: the steps `settings/global` runs, v0 -> v1 then v1 -> v2.
pub fn global_chain() -> Vec<Step> {
    vec![
        Step::new("settings-global-v0-v1", 1, |file| {
            let Some(Json::Obj(original)) = file.as_object().and_then(|o| o.get("defaultSettings"))
            else {
                return Ok(());
            };
            let tray_icon_variant = migrate_tray_icon_variant(original);
            let focus_row = migrate_focus_row(original);
            let mut next = original.clone();
            next.insert_js("trayIconVariant", tray_icon_variant);
            next.insert_js("focusRow", focus_row);
            // The superseded fields do not stay beside the new.
            next.remove("darkTrayIcon");
            next.remove("libraryTopSection");
            set_member(file, "defaultSettings", Json::Obj(next));
            Ok(())
        }),
        Step::new("settings-global-v1-v2", 2, |file| {
            let Some(Json::Obj(original)) = file.as_object().and_then(|o| o.get("defaultSettings"))
            else {
                return Ok(());
            };
            let stripped = strip_settings(original, &schemas().settings_global);
            set_member(file, "defaultSettings", stripped);
            Ok(())
        }),
    ]
}

/// `settingsGameChain` (`GamesConfig/<app>.json`): v0 -> v1 is an identity step; v1 -> v2 strips every
/// per-game settings object against `gameSettingsSchema.partial()`. The `version` and `explicit` members
/// are the document's own, not a game's settings, and are left alone.
pub fn game_chain() -> Vec<Step> {
    vec![
        Step::identity("settings-game-v0-v1", 1),
        Step::new("settings-game-v1-v2", 2, |file| {
            let Json::Obj(top) = file else { return Ok(()) };
            let stripped: Vec<(String, Json)> = top
                .iter()
                .filter(|(key, _)| key.as_str() != "version" && key.as_str() != "explicit")
                .filter_map(|(key, value)| match value {
                    Json::Obj(settings) => Some((
                        key.clone(),
                        strip_settings(settings, &schemas().settings_game),
                    )),
                    _ => None,
                })
                .collect();
            for (key, value) in stripped {
                top.insert_js(key, value);
            }
            Ok(())
        }),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::{parse, to_compact_bytes};

    fn run(chain: &[Step], doc: &str) -> String {
        let mut v = parse(doc.as_bytes()).unwrap();
        for step in chain {
            (step.run)(&mut v).unwrap();
        }
        String::from_utf8(to_compact_bytes(&v)).unwrap()
    }

    fn v0_v1(doc: &str) -> String {
        run(&global_chain()[..1], doc)
    }

    #[test]
    fn a_legacy_dark_tray_icon_and_library_top_section_become_the_new_settings() {
        assert_eq!(
            v0_v1(
                r#"{"defaultSettings":{"darkTrayIcon":true,"libraryTopSection":"recently_played","language":"en"}}"#
            ),
            r#"{"defaultSettings":{"language":"en","trayIconVariant":"dark","focusRow":{"kind":"view","value":"recentlyPlayed"}}}"#
        );
        assert_eq!(
            v0_v1(r#"{"defaultSettings":{"darkTrayIcon":false}}"#),
            r#"{"defaultSettings":{"trayIconVariant":"light","focusRow":null}}"#
        );
    }

    #[test]
    fn a_present_focus_row_disarms_the_legacy_seed_and_a_valid_variant_wins() {
        // Present and invalid becomes null; libraryTopSection is never consulted.
        assert_eq!(
            v0_v1(
                r#"{"defaultSettings":{"focusRow":{"kind":"view","value":"nope"},"libraryTopSection":"favourites","trayIconVariant":"light","darkTrayIcon":true}}"#
            ),
            r#"{"defaultSettings":{"focusRow":null,"trayIconVariant":"light"}}"#
        );
        // A valid selection is kept as it is, extra keys and all.
        assert_eq!(
            v0_v1(r#"{"defaultSettings":{"focusRow":{"kind":"store","value":"gog","x":1}}}"#),
            r#"{"defaultSettings":{"focusRow":{"kind":"store","value":"gog","x":1},"trayIconVariant":"auto"}}"#
        );
        assert_eq!(
            v0_v1(r#"{"defaultSettings":{"libraryTopSection":"disabled"}}"#),
            r#"{"defaultSettings":{"trayIconVariant":"auto","focusRow":null}}"#
        );
    }

    #[test]
    fn a_file_without_a_settings_object_is_left_alone() {
        for doc in [
            r#"{"a":1}"#,
            r#"{"defaultSettings":[1]}"#,
            r#"{"defaultSettings":null}"#,
        ] {
            assert_eq!(run(&global_chain(), doc), doc);
        }
    }

    #[test]
    fn the_game_chain_strips_each_games_settings_but_not_version_or_explicit() {
        let out = run(
            &game_chain(),
            r#"{"G1":{"showFps":"yes","useSteamRuntime":true,"targetExe":"a.exe"},"explicit":{"k":1},"version":"v1","G2":3}"#,
        );
        assert_eq!(
            out,
            r#"{"G1":{"targetExe":"a.exe"},"explicit":{"k":1},"version":"v1","G2":3}"#
        );
    }

    #[test]
    fn the_strip_removes_retired_keys_and_invalid_values_and_repairs_gamescope() {
        let out = run(
            &global_chain()[1..],
            r#"{"defaultSettings":{"useSteamRuntime":true,"language":"en","exitToTray":"yes","enableFSR":null,
            "dismissedSignInNotices":["gog","bogus","steam"],
            "gamescope":{"enableUpscaling":true,"enableLimiter":false,"windowType":"w","gameWidth":"1","gameHeight":"2",
              "upscaleWidth":"3","upscaleHeight":"4","upscaleMethod":"fsr","fpsLimiter":"60","fpsLimiterNoFocus":"30"}}}"#,
        );
        assert_eq!(
            out,
            r#"{"defaultSettings":{"language":"en","dismissedSignInNotices":["gog","steam"],"gamescope":{"enableUpscaling":true,"enableLimiter":false,"windowType":"w","gameWidth":"1","gameHeight":"2","upscaleWidth":"3","upscaleHeight":"4","upscaleMethod":"fsr","fpsLimiter":"60","fpsLimiterNoFocus":"30","additionalOptions":"","enableForceGrabCursor":false}}}"#
        );
    }
}
