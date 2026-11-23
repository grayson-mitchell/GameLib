//! Winetricks (Phase 87, D-08, D-10, D-17): the pure parsers and the apply guard, the environment
//! reports, the catalog reads and the install lifecycle with streamed progress. A port of
//! `src/backend/tools/index.ts` (`createWinetricks`), `winetricksListParse.ts`,
//! `winetricksOutputClassifier.ts`, `winetricksApplyGuard.ts`, `winetricksEnvironment.ts` and
//! `common/winetricks/*`, replayed against the goldens 87-10 recorded from the TS
//! (`tests/golden_winetricks.rs`) and its pure vectors (`tests/winetricks_pure.rs`).
//!
//! Crate-only (D-06): ops `wine_winetricks_install`, `wine_winetricks_available` and
//! `wine_winetricks_installed` exist with no channel and no caller. The sequential apply queue lands in
//! 87-33 and every Winetricks caller flips in 87-35; until then the TS path stays the only live one
//! (a TS and a Rust writer of the same prefix at once is what D-06 forbids).
//!
//! - [`classify`]: the output classifier, the wine-version derivation, the chunk splitter and the
//!   bounded line buffer.
//! - [`list_parse`]: `winetricks list-all` into components.
//! - [`guard`]: the verb shape, the visibility rule and the renderer-payload guard.
//! - [`metadata`]: the `w_metadata` and `w_download_manual` readers of the script.
//! - [`env`]: the environment reports (unsupported wine, missing host tools).
//! - [`install`]: the script download, the run with its streamed lines, the catalog reads and the
//!   install.
//!
//! What the TS read from places this crate may not reach arrives as an argument: the game's resolved
//! tool settings ([`Target`], the library lookup and the bottle resolution stay with the caller until
//! 87-35), the launcher's three functions ([`Launcher`], which [`HostLauncher`] backs with
//! `wine_cmd`), and the process environment and the Darwin release (`WineHost`).

pub mod classify;
pub mod env;
pub mod guard;
pub mod install;
pub mod list_parse;
pub mod metadata;

use std::collections::BTreeMap;
use std::path::Path;

use gamelib_engine::ctx::Platform;

use crate::ctx::WineCtx;
use crate::manager::{log_error, log_warn};
use crate::wine_cmd::env::{
    build_wine_env_vars, setup_env_vars, EnvNote, GameSettingsView, WineEnvPaths,
};
use crate::wine_cmd::valid::valid_wine;
use crate::wine_cmd::{WineHost, WineInstallation};

/// The host dependencies winetricks needs (`checkDependencies`), in the TS probe order.
pub const DEPENDENCIES: [&str; 5] = ["7z", "cabextract", "zenity", "unzip", "curl"];

/// Where the script comes from. Master, as the TS fetched it (T-87-32, accepted).
pub const SCRIPT_URL: &str =
    "https://raw.githubusercontent.com/Winetricks/winetricks/master/src/winetricks";

/// How long a script on disk is trusted before it is fetched again (7 days).
pub const SCRIPT_MAX_AGE_MS: u64 = 7 * 24 * 60 * 60 * 1000;

/// The settings a winetricks op acts on, as the caller resolved them (`resolveGameToolSettings`):
/// the game's real bottle and engine, or the reason there is none.
#[derive(Debug, Clone)]
pub enum ToolSettings {
    Resolved(Box<GameSettingsView>),
    /// No usable wine environment; the text is the resolver's reason word (`not-own-bottle`).
    Unavailable(String),
}

/// One game a winetricks op is for.
#[derive(Debug, Clone)]
pub struct Target<'a> {
    pub runner: &'a str,
    pub app_name: &'a str,
    pub settings: ToolSettings,
}

/// The launcher's three functions a winetricks run uses (`deps.launcher`), as a seam: production backs
/// them with [`HostLauncher`], a golden with the oracle's stubs.
pub trait Launcher: Send + Sync {
    /// `validWine`: whether the wine of the settings can run.
    fn valid_wine(&self, ctx: &WineCtx, wine: &WineInstallation) -> bool;
    /// `setupEnvVars`.
    fn setup_env_vars(
        &self,
        ctx: &WineCtx,
        settings: &GameSettingsView,
    ) -> BTreeMap<String, String>;
    /// `setupWineEnvVars`.
    fn setup_wine_env_vars(
        &self,
        ctx: &WineCtx,
        settings: &GameSettingsView,
        app_name: &str,
    ) -> BTreeMap<String, String>;
}

/// The launcher over this crate's `wine_cmd` ports and the host facts the shell gave.
pub struct HostLauncher<'a> {
    pub host: &'a WineHost,
}

impl Launcher for HostLauncher<'_> {
    fn valid_wine(&self, ctx: &WineCtx, wine: &WineInstallation) -> bool {
        valid_wine(
            Some(wine),
            ctx.engine.platform,
            self.host.darwin_release.as_deref(),
            &|p: &Path| p.exists(),
        )
    }

    fn setup_env_vars(
        &self,
        ctx: &WineCtx,
        settings: &GameSettingsView,
    ) -> BTreeMap<String, String> {
        setup_env_vars(settings, None, ctx.engine.platform, &self.host.env)
    }

    fn setup_wine_env_vars(
        &self,
        ctx: &WineCtx,
        settings: &GameSettingsView,
        app_name: &str,
    ) -> BTreeMap<String, String> {
        let paths = WineEnvPaths {
            flatpak_home: ctx.engine.paths.user_home.clone(),
            runtime_path: ctx.runtime_path.clone(),
        };
        let built = build_wine_env_vars(
            settings,
            Some(app_name),
            ctx.engine.platform,
            &self.host.env,
            &paths,
            &|p: &Path| p.exists(),
        );
        for note in &built.notes {
            match note {
                EnvNote::WineLibFoldersMissing => log_error(
                    ctx,
                    "wine library folders are missing, falling back to system libraries",
                ),
                EnvNote::DeprecatedGeWorkaround => log_warn(
                    ctx,
                    "deprecated Wine-GE/Proton-GE release detected, applying the Steam Input gamepad workaround",
                ),
            }
        }
        built.vars
    }
}

/// What every winetricks function is run with: the context, the host facts and the launcher.
#[derive(Clone, Copy)]
pub struct Session<'a> {
    pub ctx: &'a WineCtx,
    pub host: &'a WineHost,
    pub launcher: &'a dyn Launcher,
}

/// The argument object of a winetricks op: the game, the tool settings the caller resolved (or why
/// there are none) and, for an install, the verb. Strict: an unknown key is a bad argument.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TargetArg {
    pub runner: String,
    pub app_name: String,
    /// The settings the game's tools act on (`resolveGameToolSettings`).
    #[serde(default)]
    pub settings: Option<GameSettingsView>,
    /// Instead of `settings`: no usable wine environment, and the resolver's reason word.
    #[serde(default)]
    pub unavailable: Option<String>,
    /// The verb an install runs.
    #[serde(default)]
    pub verb: Option<String>,
}

impl TargetArg {
    /// The target, or `None` unless exactly one of `settings` and `unavailable` is given.
    pub fn target(&self) -> Option<Target<'_>> {
        let settings = match (&self.settings, &self.unavailable) {
            (Some(settings), None) => ToolSettings::Resolved(Box::new(settings.clone())),
            (None, Some(reason)) => ToolSettings::Unavailable(reason.clone()),
            _ => return None,
        };
        Some(Target {
            runner: &self.runner,
            app_name: &self.app_name,
            settings,
        })
    }
}

/// The shape of a winetricks verb: `^[a-z0-9_][a-z0-9_=]*$`. A census over all 567 verbs of the
/// pinned script found the complete charset to be exactly `[a-z0-9_=]`; the first character is never
/// `=`, so the `=====` header delimiter cannot pass it. Never widen this to "any non-space": it is
/// also what stands between a caller's text and winetricks' argv.
pub fn is_verb_shape(verb: &str) -> bool {
    let mut chars = verb.chars();
    let first_ok = chars
        .next()
        .is_some_and(|c| matches!(c, 'a'..='z' | '0'..='9' | '_'));
    first_ok && chars.all(|c| matches!(c, 'a'..='z' | '0'..='9' | '_' | '='))
}

/// `catalogCacheKey`.
pub fn catalog_cache_key(runner: &str, app_name: &str) -> String {
    format!("{runner}:{app_name}")
}

/// Whether the platform runs winetricks at all (the TS skipped the script download on Windows).
pub(crate) fn is_windows(ctx: &WineCtx) -> bool {
    ctx.engine.platform == Platform::Windows
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_verb_has_the_shape_of_a_real_one() {
        for ok in [
            "vcrun2019",
            "fontsmooth=rgb",
            "vd=1024x768",
            "_x",
            "a",
            "0day",
        ] {
            assert!(is_verb_shape(ok), "{ok}");
        }
        for bad in [
            "",
            "=x",
            "UPPER",
            "with space",
            "dash-ed",
            "dot.ted",
            "a:b",
            "x;rm",
            "a\n",
        ] {
            assert!(!is_verb_shape(bad), "{bad:?}");
        }
    }

    #[test]
    fn an_argument_names_exactly_one_of_settings_and_a_reason() {
        let settings =
            json!({"winePrefix": "/p", "wineVersion": {"bin": "/b", "name": "n", "type": "wine"}});
        let both: TargetArg = serde_json::from_value(json!({
            "runner": "gog", "appName": "1", "settings": settings, "unavailable": "x"
        }))
        .unwrap();
        assert!(both.target().is_none());
        let neither: TargetArg =
            serde_json::from_value(json!({"runner": "gog", "appName": "1"})).unwrap();
        assert!(neither.target().is_none());
        let reason: TargetArg = serde_json::from_value(
            json!({"runner": "steam", "appName": "480", "unavailable": "not-own-bottle"}),
        )
        .unwrap();
        assert!(matches!(
            reason.target().unwrap().settings,
            ToolSettings::Unavailable(ref r) if r == "not-own-bottle"
        ));
        assert!(serde_json::from_value::<TargetArg>(
            json!({"runner": "gog", "appName": "1", "nope": 1})
        )
        .is_err());
    }
}
