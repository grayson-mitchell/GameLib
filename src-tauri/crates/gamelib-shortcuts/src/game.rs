//! What the add and remove ops are told about a game and the settings that shape the add. The TS
//! resolver (94-22) flattens the `Game` and the global settings into these two structs; the crate never
//! reaches a library or a config of its own.
//!
//! Both deny unknown fields and are camelCase, so a drifting caller fails as `<op>:bad-args` and no
//! renderer or sidecar string is echoed (T-94-33). The title is not trusted as a path: every path join goes
//! through [`crate::sanitize::sanitize_filename`] in [`crate::paths::shortcut_files`].

use serde::Deserialize;

/// The game a shortcut is for. `title` is what names the files; `app_name` and `runner` are what a
/// shortcut launches.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ShortcutGame {
    pub app_name: String,
    pub runner: String,
    pub title: String,
    /// `gameInfo.install.is_dlc`: a DLC has no shortcut, so an op for one touches nothing.
    pub is_dlc: bool,
    /// `gameInfo.art_square`: the icon source on macOS and Linux. Absent, `null` and `""` are the same.
    #[serde(default)]
    pub art_square: Option<String>,
    /// `gameInfo.art_cover`: the Steam grid header when no Steam id is known (Add to Steam only).
    #[serde(default)]
    pub art_cover: Option<String>,
    /// `gameInfo.art_logo` when the game has one: the Steam grid logo when no Steam id is known
    /// (Add to Steam only).
    #[serde(default)]
    pub art_logo: Option<String>,
    /// `gameInfo.install.install_path` when the install has one.
    #[serde(default)]
    pub install_path: Option<String>,
    /// `gameInfo.install.executable`, relative to the install path or absolute.
    #[serde(default)]
    pub executable: Option<String>,
    /// `storeCapabilities[runner].canAddSteamShortcut`: a Steam game is already in Steam.
    pub can_add_steam_shortcut: bool,
    /// The GOG library manager's `getExecutable(appName)`, which replaces `executable` for a GOG game
    /// on Windows.
    #[serde(default)]
    pub gog_executable: Option<String>,
    /// The GOG product API's `images.icon`, exactly as the API returned it. The caller resolves it
    /// LAZILY: only when the install holds neither `goggame-<id>.ico` nor `support/icon.png`, and an
    /// API failure is `null`, never a failed add (the 94-16 caller contract; the TS never asked the API
    /// for an installed game). The crate checks the local files first as well.
    #[serde(default)]
    pub gog_product_icon: Option<String>,
}

/// The slice of the global settings an add reads.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ShortcutSettings {
    pub add_desktop_shortcuts: bool,
    pub add_start_menu_shortcuts: bool,
    /// Whether the add also adds the game to Steam (the Add-to-Steam step of `shortcuts_add`).
    pub add_steam_shortcuts: bool,
    /// `defaultSteamPath`, read by the Add-to-Steam step only.
    #[serde(default)]
    pub default_steam_path: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn game() -> serde_json::Value {
        json!({
            "appName": "a", "runner": "legendary", "title": "T", "isDlc": false,
            "canAddSteamShortcut": true
        })
    }

    #[test]
    fn a_game_needs_only_its_identity_and_two_flags() {
        let game: ShortcutGame = serde_json::from_value(game()).expect("a minimal game");
        assert_eq!(game.title, "T");
        assert!(!game.is_dlc && game.can_add_steam_shortcut);
        assert!(game.art_square.is_none() && game.gog_product_icon.is_none());
        assert!(game.art_cover.is_none() && game.art_logo.is_none());
    }

    #[test]
    fn null_optional_fields_are_absent() {
        let mut value = game();
        value["artSquare"] = json!(null);
        value["gogProductIcon"] = json!(null);
        let game: ShortcutGame = serde_json::from_value(value).expect("nulls");
        assert!(game.art_square.is_none() && game.gog_product_icon.is_none());
    }

    #[test]
    fn an_unknown_or_missing_field_is_refused() {
        let mut value = game();
        value["extra"] = json!(1);
        assert!(serde_json::from_value::<ShortcutGame>(value).is_err());
        let mut value = game();
        value.as_object_mut().expect("object").remove("isDlc");
        assert!(serde_json::from_value::<ShortcutGame>(value).is_err());
        let settings = json!({ "addDesktopShortcuts": true, "addStartMenuShortcuts": false });
        assert!(serde_json::from_value::<ShortcutSettings>(settings).is_err());
        let settings = json!({
            "addDesktopShortcuts": true, "addStartMenuShortcuts": false,
            "addSteamShortcuts": false, "defaultSteamPath": null
        });
        assert!(serde_json::from_value::<ShortcutSettings>(settings).is_ok());
    }
}
