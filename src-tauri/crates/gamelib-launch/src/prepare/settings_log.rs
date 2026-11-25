//! `filterGameSettingsForLog` (`launcher.ts`): the game settings the launch log prints, with the keys that
//! are irrelevant for support, or unused on this platform and for this kind of game, removed.
//!
//! The settings arrive as a JSON object and leave as one; only top-level keys (and the two gamescope
//! groups) are removed, never a value changed. `serde_json` is built without `preserve_order` in this
//! workspace, so the printed object lists its keys alphabetically where the TS listed them in the order the
//! settings were merged: the values are the same and so is every key that is present.

use gamelib_engine::ctx::Platform;
use serde_json::{Map, Value};

/// JavaScript truthiness of a decoded JSON value (`if (settings.gamescope)`, `!enableLimiter`).
pub(crate) fn js_truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(flag) => *flag,
        Value::Number(number) => number.as_f64().is_some_and(|n| n != 0.0 && !n.is_nan()),
        Value::String(text) => !text.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

fn remove_keys(settings: &mut Map<String, Value>, keys: &[&str]) {
    for key in keys {
        settings.remove(*key);
    }
}

/// The type of the settings' `wineVersion` (`wineVersion.type`), when there is one.
fn wine_type(settings: &Map<String, Value>) -> Option<&str> {
    settings.get("wineVersion")?.get("type")?.as_str()
}

/// `filterGameSettingsForLog(originalSettings, notNative)` for `platform`. `steam_deck` is `isSteamDeck`
/// (game mode or desktop mode), read only by the Linux non-native branch. A settings value that is not an
/// object is returned as it is: there is nothing to filter.
pub fn filter_game_settings_for_log(
    original: &Value,
    platform: Platform,
    not_native: bool,
    steam_deck: bool,
) -> Value {
    let Value::Object(settings) = original else {
        return original.clone();
    };
    let mut settings = settings.clone();

    // This is irrelevant for support; and if verboseLogs is visible it is true, so no need to print it.
    remove_keys(&mut settings, &["enableQuickSavesMenu", "verboseLogs"]);

    // Remove the gamescope settings that are off.
    if settings.get("gamescope").is_some_and(js_truthy) {
        if let Some(Value::Object(gamescope)) = settings.get_mut("gamescope") {
            let on = |gamescope: &Map<String, Value>, key: &str| {
                gamescope.get(key).is_some_and(js_truthy)
            };
            if !on(gamescope, "enableLimiter") {
                remove_keys(gamescope, &["fpsLimiter", "fpsLimiterNoFocus"]);
            }
            if !on(gamescope, "enableUpscaling") {
                remove_keys(
                    gamescope,
                    &[
                        "upscaleMethod",
                        "upscaleHeight",
                        "upscaleWidth",
                        "gameHeight",
                        "gameWidth",
                        "windowType",
                    ],
                );
            }
        }
    }

    match platform {
        // Settings that are not used on Linux.
        Platform::Linux => {
            remove_keys(
                &mut settings,
                &[
                    "enableMsync",
                    "wineCrossoverBottle",
                    "advertiseAvxForRosetta",
                ],
            );
            if not_native {
                if wine_type(&settings) == Some("proton") {
                    remove_keys(&mut settings, &["autoInstallDxvk", "autoInstallVkd3d"]);
                }
                if steam_deck {
                    remove_keys(&mut settings, &["autoInstallDxvkNvapi"]);
                }
            } else {
                // Settings that are not used on native Linux games.
                remove_keys(
                    &mut settings,
                    &[
                        "wineVersion",
                        "winePrefix",
                        "autoInstallDxvk",
                        "autoInstallDxvkNvapi",
                        "autoInstallVkd3d",
                        "enableFsync",
                        "enableEsync",
                        "enableFSR",
                        "enableWineWayland",
                        "enableHDR",
                        "enableWoW64",
                        "showFps",
                        "enableDXVKFpsLimit",
                        "eacRuntime",
                        "battlEyeRuntime",
                        "useGameMode",
                    ],
                );
            }
        }
        // Settings that are not used on Mac.
        Platform::Mac => {
            remove_keys(
                &mut settings,
                &[
                    "useGameMode",
                    "gamescope",
                    "nvidiaPrime",
                    "battlEyeRuntime",
                    "eacRuntime",
                    "enableFSR",
                    "enableWineWayland",
                    "enableHDR",
                    "enableWoW64",
                    "showMangohud",
                    "disableUMU",
                    "enableFsync",
                ],
            );
            if not_native {
                // Read before anything else of the wine version group is removed (it never is here).
                let kind = wine_type(&settings).map(str::to_string);
                let dxmt = settings
                    .get("wineVersion")
                    .and_then(|wine| wine.get("name"))
                    .and_then(Value::as_str)
                    .is_some_and(|name| name.contains("DXMT"));
                remove_keys(
                    &mut settings,
                    &[
                        "preferSystemLibs",
                        "autoInstallVkd3d",
                        "autoInstallDxvkNvapi",
                    ],
                );
                match kind.as_deref() {
                    Some("wine") => {
                        remove_keys(
                            &mut settings,
                            &["wineCrossoverBottle", "advertiseAvxForRosetta"],
                        );
                        if dxmt {
                            remove_keys(&mut settings, &["autoInstallDxvk"]);
                        }
                    }
                    Some("toolkit") => {
                        remove_keys(&mut settings, &["autoInstallDxvk", "wineCrossoverBottle"]);
                    }
                    Some("crossover") => {
                        remove_keys(&mut settings, &["autoInstallDxvk", "winePrefix"]);
                    }
                    _ => {}
                }
            } else {
                // Settings that are not used on native Mac games.
                remove_keys(
                    &mut settings,
                    &[
                        "enableDXVKFpsLimit",
                        "wineVersion",
                        "winePrefix",
                        "wineCrossoverBottle",
                        "advertiseAvxForRosetta",
                        "autoInstallDxvk",
                        "autoInstallDxvkNvapi",
                        "autoInstallVkd3d",
                    ],
                );
            }
        }
        // Settings that are not used on Windows.
        Platform::Windows => remove_keys(
            &mut settings,
            &[
                "enableMsync",
                "enableFSR",
                "enableEsync",
                "enableFsync",
                "enableWineWayland",
                "enableHDR",
                "enableWoW64",
                "enableDXVKFpsLimit",
                "DXVKFpsCap",
                "autoInstallDxvk",
                "autoInstallDxvkNvapi",
                "autoInstallVkd3d",
                "gamescope",
                "useGameMode",
                "showMangohud",
                "showFps",
                "preferSystemLibs",
                "wineCrossoverBottle",
                "winePrefix",
                "wineVersion",
                "battlEyeRuntime",
                "eacRuntime",
                "nvidiaPrime",
                "disableUMU",
                "advertiseAvxForRosetta",
            ],
        ),
    }

    Value::Object(settings)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn keys(value: &Value) -> Vec<String> {
        value.as_object().unwrap().keys().cloned().collect()
    }

    #[test]
    fn the_support_noise_is_always_removed() {
        let out = filter_game_settings_for_log(
            &json!({"enableQuickSavesMenu": true, "verboseLogs": true, "language": "en"}),
            Platform::Windows,
            true,
            false,
        );
        assert_eq!(out, json!({"language": "en"}));
    }

    #[test]
    fn gamescope_groups_that_are_off_lose_their_values() {
        let settings = json!({"gamescope": {
            "enableLimiter": false, "fpsLimiter": "60", "fpsLimiterNoFocus": "30",
            "enableUpscaling": true, "upscaleMethod": "fsr", "gameWidth": "1280", "windowType": "fullscreen"
        }});
        let out = filter_game_settings_for_log(&settings, Platform::Linux, true, false);
        assert_eq!(
            out["gamescope"],
            json!({"enableLimiter": false, "enableUpscaling": true, "upscaleMethod": "fsr",
                   "gameWidth": "1280", "windowType": "fullscreen"})
        );
        let neither = filter_game_settings_for_log(
            &json!({"gamescope": {"fpsLimiter": "60", "upscaleMethod": "fsr", "additionalOptions": "x"}}),
            Platform::Linux,
            true,
            false,
        );
        assert_eq!(neither["gamescope"], json!({"additionalOptions": "x"}));
    }

    #[test]
    fn linux_native_drops_the_wine_group_and_a_proton_game_drops_two_installs() {
        let settings = json!({
            "wineVersion": {"type": "proton"}, "winePrefix": "/p", "autoInstallDxvk": true,
            "autoInstallVkd3d": true, "autoInstallDxvkNvapi": true, "useGameMode": true,
            "enableMsync": true, "wineCrossoverBottle": "b", "showMangohud": true
        });
        let native = filter_game_settings_for_log(&settings, Platform::Linux, false, false);
        assert_eq!(keys(&native), ["showMangohud"]);
        let proton = filter_game_settings_for_log(&settings, Platform::Linux, true, false);
        assert_eq!(
            keys(&proton),
            [
                "autoInstallDxvkNvapi",
                "showMangohud",
                "useGameMode",
                "winePrefix",
                "wineVersion"
            ]
        );
        let deck = filter_game_settings_for_log(&settings, Platform::Linux, true, true);
        assert!(deck.get("autoInstallDxvkNvapi").is_none());
    }

    #[test]
    fn mac_keeps_what_its_wine_type_uses() {
        let base = |wine: Value| {
            json!({"wineVersion": wine, "winePrefix": "/p", "wineCrossoverBottle": "b",
                   "autoInstallDxvk": true, "preferSystemLibs": true, "useGameMode": true})
        };
        let crossover = filter_game_settings_for_log(
            &base(json!({"type": "crossover", "name": "CrossOver"})),
            Platform::Mac,
            true,
            false,
        );
        assert_eq!(keys(&crossover), ["wineCrossoverBottle", "wineVersion"]);
        let wine = filter_game_settings_for_log(
            &base(json!({"type": "wine", "name": "Wine DXMT 1"})),
            Platform::Mac,
            true,
            false,
        );
        assert_eq!(keys(&wine), ["winePrefix", "wineVersion"]);
        let plain_wine = filter_game_settings_for_log(
            &base(json!({"type": "wine", "name": "Wine"})),
            Platform::Mac,
            true,
            false,
        );
        assert_eq!(
            keys(&plain_wine),
            ["autoInstallDxvk", "winePrefix", "wineVersion"]
        );
        let toolkit = filter_game_settings_for_log(
            &base(json!({"type": "toolkit", "name": "GPTK"})),
            Platform::Mac,
            true,
            false,
        );
        assert_eq!(keys(&toolkit), ["winePrefix", "wineVersion"]);
        let native = filter_game_settings_for_log(
            &base(json!({"type": "wine", "name": "Wine"})),
            Platform::Mac,
            false,
            false,
        );
        // The native branch has no `preferSystemLibs` in its list.
        assert_eq!(keys(&native), ["preferSystemLibs"]);
    }

    #[test]
    fn windows_drops_every_wine_and_gpu_offload_key() {
        let out = filter_game_settings_for_log(
            &json!({"winePrefix": "/p", "gamescope": {}, "nvidiaPrime": true, "language": "en", "DXVKFpsCap": "0"}),
            Platform::Windows,
            true,
            false,
        );
        assert_eq!(out, json!({"language": "en"}));
    }

    #[test]
    fn a_value_that_is_not_an_object_is_left_alone() {
        assert_eq!(
            filter_game_settings_for_log(&json!(3), Platform::Linux, true, false),
            json!(3)
        );
    }

    #[test]
    fn truthiness_follows_javascript() {
        for falsy in [json!(null), json!(false), json!(0), json!("")] {
            assert!(!js_truthy(&falsy), "{falsy}");
        }
        for truthy in [json!(true), json!(1), json!("x"), json!([]), json!({})] {
            assert!(js_truthy(&truthy), "{truthy}");
        }
    }
}
