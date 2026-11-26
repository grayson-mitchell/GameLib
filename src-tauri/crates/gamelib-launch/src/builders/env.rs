//! The env builders (`setupEnvVars`, `setupWineEnvVars`, `isMacSonomaOrHigher`) over the 87 wine core,
//! called in place (87 D-22) with the platform from the engine context and the process facts the caller
//! read. Each note the wine builder reports is logged as fixed text through the engine log, never a
//! path (T-88.1-12).

use std::collections::BTreeMap;
use std::path::Path;

use gamelib_wine::wine_cmd::env::{
    build_wine_env_vars, setup_env_vars_from as wine_setup_env_vars_from, EnvNote,
    GameSettingsView, SetupEnvView, WineEnvPaths,
};
use gamelib_wine::wine_cmd::valid::is_mac_sonoma_or_higher as wine_is_mac_sonoma_or_higher;
use gamelib_wine::wine_cmd::WineHost;

pub use gamelib_wine::wine_cmd::env::remove_quote_if_necessary;

use gamelib_wine::wine_cmd::prefix::verify_wine_prefix as wine_verify_wine_prefix;
use serde_json::{json, Value};

use crate::ctx::LaunchCtx;

/// `setupEnvVars`: GPU offload, the HUD, the install path, the user's own variables and an empty
/// `LD_PRELOAD` when none is set anywhere. It reads only the three settings of [`SetupEnvView`], so a game
/// with no wine (a Windows one) answers the same as one with a wine.
pub fn setup_env_vars(
    ctx: &LaunchCtx,
    settings: &SetupEnvView,
    install_path: Option<&str>,
    host: &WineHost,
) -> BTreeMap<String, String> {
    wine_setup_env_vars_from(settings, install_path, ctx.engine.platform, &host.env)
}

/// The text each note logs (the TS wording where it carried no path or wine name).
fn note_line(note: EnvNote) -> (&'static str, &'static str) {
    match note {
        EnvNote::WineLibFoldersMissing => (
            "error",
            "Couldn't find all library folders of the selected Wine! Falling back to system libraries!",
        ),
        EnvNote::DeprecatedGeWorkaround => (
            "warn",
            "Deprecated Wine-GE/Proton-GE release (<= 8.x) detected. Applying workaround for Steam Input virtual gamepad detection.",
        ),
    }
}

/// `setupWineEnvVars`: the wine environment of a game, with the notes it produced logged as fixed text.
/// `flatpakHome` is the operator's home directory the engine context holds; `runtimePath` is the wine
/// context's.
pub fn setup_wine_env_vars(
    ctx: &LaunchCtx,
    settings: &GameSettingsView,
    game_id: Option<&str>,
    host: &WineHost,
) -> BTreeMap<String, String> {
    let paths = WineEnvPaths {
        flatpak_home: ctx.engine.paths.user_home.clone(),
        runtime_path: ctx.wine.runtime_path.clone(),
    };
    let built = build_wine_env_vars(
        settings,
        game_id,
        ctx.engine.platform,
        &host.env,
        &paths,
        &|path: &Path| path.exists(),
    );
    if let Some(log) = ctx.engine.log.as_ref() {
        for note in built.notes {
            match note_line(note) {
                ("error", line) => log.error(line),
                (_, line) => log.warn(line),
            }
        }
    }
    built.vars
}

/// `isMacSonomaOrHigher`: on macOS the Darwin release's major is at least 14. It logs its two info lines
/// on macOS only, and answers `false` on any other platform without logging.
pub fn is_mac_sonoma_or_higher(ctx: &LaunchCtx, darwin_release: Option<&str>) -> bool {
    use gamelib_engine::ctx::Platform;
    if ctx.engine.platform != Platform::Mac {
        return false;
    }
    if let Some(log) = ctx.engine.log.as_ref() {
        log.info("Checking if macOS is Sonoma or higher");
    }
    let answer = wine_is_mac_sonoma_or_higher(ctx.engine.platform, darwin_release);
    if let Some(log) = ctx.engine.log.as_ref() {
        log.info(if answer {
            "macOS is Sonoma or higher"
        } else {
            "macOS is not Sonoma or higher"
        });
    }
    answer
}

/// `verifyWinePrefix`: creates the game's wine prefix when it is missing, through the wine command core
/// (a `wineboot --init`, or umu's `createprefix`, run as a Helper; 87 D-22 and D-21). The answer is the TS
/// reply shape, `{ res: { stdout, stderr } }` (plus `code` when a command ran). An invalid wine and a
/// CrossOver bottle answer an empty result without running anything. `Err` is the fixed
/// `launch_verify_wine_prefix:failed`: the prefix directory could not be made, and the reason (which names a
/// path in the log, never here) is not echoed (T-88.1-13).
pub async fn verify_wine_prefix(
    ctx: &LaunchCtx,
    settings: &GameSettingsView,
    host: &WineHost,
) -> Result<Value, String> {
    match wine_verify_wine_prefix(&ctx.wine, settings, host).await {
        Ok(result) => Ok(json!({ "res": result.to_json() })),
        Err(_) => Err("launch_verify_wine_prefix:failed".to_string()),
    }
}
