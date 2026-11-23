//! The store-agnostic engine key (Phase 61 D-12, ported from `gameKey.ts` and `engineEligibility.ts`).
//!
//! A Steam title keeps its bare numeric appId (the store whose capability `appNameIsSteamAppId` is
//! true); every other store uses `<runner>:<appName>`. The two forms are disjoint (only the second
//! contains `:`), so a GOG numeric appName can never collide with a Steam appId.

use serde_json::Value;

use crate::jsutil::{js_trim, utf16_len};

/// The runners that have an entry in `storeCapabilities` (`legendary`, `gog`, `sideload`, `nile`,
/// `steam`). `humble` is a key store, not a runner, and is refused.
pub const KNOWN_RUNNERS: [&str; 5] = ["legendary", "gog", "sideload", "nile", "steam"];

/// `isKnownRunner`: a name `storeCapabilities` has an entry for (an exact, case-sensitive match).
pub fn is_known_runner(runner: &str) -> bool {
    KNOWN_RUNNERS.contains(&runner)
}

/// The capability `usesBottleRuntime`: true for Steam only.
pub fn uses_bottle_runtime(runner: &str) -> bool {
    runner == "steam"
}

/// The capability `appNameIsSteamAppId`: true for Steam only.
pub fn app_name_is_steam_app_id(runner: &str) -> bool {
    runner == "steam"
}

/// `^[0-9]{1,10}$`.
fn is_steam_app_id(text: &str) -> bool {
    !text.is_empty() && text.len() <= 10 && text.bytes().all(|b| b.is_ascii_digit())
}

/// `isCleanAppName` for a string: 1 to 255 UTF-16 units, no padding, no separator, NUL or `..`.
pub fn is_clean_app_name(app_name: &str) -> bool {
    let len = utf16_len(app_name);
    if !(1..=255).contains(&len) {
        return false;
    }
    if app_name != js_trim(app_name) {
        return false;
    }
    if app_name.contains(['/', '\\', '\0']) {
        return false;
    }
    !app_name.contains("..")
}

/// `engineKeyFor`: the key of a game, or `None` for an unknown runner, an unclean app name, or a
/// Steam app name that is not 1 to 10 ASCII digits (leading zeros kept, as written).
pub fn engine_key_for(runner: &str, app_name: &str) -> Option<String> {
    if !is_known_runner(runner) || !is_clean_app_name(app_name) {
        return None;
    }
    if app_name_is_steam_app_id(runner) {
        return is_steam_app_id(app_name).then(|| app_name.to_string());
    }
    Some(format!("{runner}:{app_name}"))
}

/// [`engine_key_for`] over untyped JSON, as a renderer or a golden hands it: a non-string runner or
/// app name has no key.
pub fn engine_key_for_json(runner: &Value, app_name: &Value) -> Option<String> {
    engine_key_for(runner.as_str()?, app_name.as_str()?)
}

/// `isEngineKey`: a bare Steam appId, or `<known non-Steam runner>:<clean app name>`.
pub fn is_engine_key(key: &str) -> bool {
    if is_steam_app_id(key) {
        return true;
    }
    let Some(idx) = key.find(':') else {
        return false;
    };
    if idx == 0 {
        return false;
    }
    let (runner, app_name) = (&key[..idx], &key[idx + 1..]);
    is_known_runner(runner) && !app_name_is_steam_app_id(runner) && is_clean_app_name(app_name)
}

/// `appNameOf`: a bare Steam appId is its own name; a prefixed key yields the part after the first
/// `:`.
pub fn app_name_of(key: &str) -> &str {
    match key.find(':') {
        Some(idx) => &key[idx + 1..],
        None => key,
    }
}

/// What the eligibility test needs of a game (the slice of `Game` the TS reads).
#[derive(Debug, Clone)]
pub struct GameIdentity<'a> {
    pub runner: &'a str,
    pub app_name: &'a str,
    /// `game.isNative()`.
    pub native: bool,
    /// `getGameInfo().install?.platform`.
    pub install_platform: Option<&'a str>,
}

/// `engineKeyIfEligible`: the game's engine key when the engine layer applies; `None` for a native
/// game, a Browser install, a non-macOS host, a bottle-runtime store (Steam) or an unusable key.
pub fn engine_key_if_eligible(game: &GameIdentity<'_>, on_mac: bool) -> Option<String> {
    if !on_mac || game.native {
        return None;
    }
    if game.install_platform == Some("Browser") {
        return None;
    }
    if uses_bottle_runtime(game.runner) {
        return None;
    }
    engine_key_for(game.runner, game.app_name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_steam_key_is_its_bare_app_id_and_others_are_prefixed() {
        assert_eq!(engine_key_for("steam", "620").as_deref(), Some("620"));
        assert_eq!(engine_key_for("steam", "000620").as_deref(), Some("000620"));
        assert_eq!(engine_key_for("steam", "12345678901"), None);
        assert_eq!(engine_key_for("steam", "6\u{ff12}0"), None);
        assert_eq!(
            engine_key_for("gog", "1207658924").as_deref(),
            Some("gog:1207658924")
        );
    }

    #[test]
    fn unclean_names_and_unknown_runners_have_no_key() {
        for name in ["", " pad", "pad ", "a/b", "a\\b", "a\0b", "..", "a..b"] {
            assert_eq!(engine_key_for("gog", name), None, "{name:?}");
        }
        assert_eq!(engine_key_for("gog", &"a".repeat(256)), None);
        assert!(engine_key_for("gog", &"a".repeat(255)).is_some());
        for runner in ["", "GOG", "humble", "__proto__", "toString"] {
            assert_eq!(engine_key_for(runner, "1"), None, "{runner}");
        }
    }

    #[test]
    fn is_engine_key_and_app_name_of_agree_with_the_grammar() {
        assert!(is_engine_key("620"));
        assert!(is_engine_key("gog:1"));
        assert!(!is_engine_key("steam:620"));
        assert!(!is_engine_key(":x"));
        assert!(!is_engine_key("nope:x"));
        assert_eq!(app_name_of("620"), "620");
        assert_eq!(app_name_of("gog:a:b"), "a:b");
    }

    #[test]
    fn eligibility_excludes_native_browser_steam_and_non_mac() {
        let game = |runner, native, platform| GameIdentity {
            runner,
            app_name: "1234",
            native,
            install_platform: platform,
        };
        assert_eq!(
            engine_key_if_eligible(&game("gog", false, Some("windows")), true).as_deref(),
            Some("gog:1234")
        );
        assert_eq!(engine_key_if_eligible(&game("gog", true, None), true), None);
        assert_eq!(
            engine_key_if_eligible(&game("gog", false, Some("Browser")), true),
            None
        );
        assert_eq!(
            engine_key_if_eligible(&game("steam", false, None), true),
            None
        );
        assert_eq!(
            engine_key_if_eligible(&game("gog", false, None), false),
            None
        );
    }
}
