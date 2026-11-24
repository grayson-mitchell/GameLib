//! `verifyWinePrefix` (`launcher.ts`): creates a wine prefix with `wineboot --init` (or umu's
//! `createprefix`) when it is missing.

use super::command::{run_unchecked, umu_supported, WineCommandArgs, WineCommandResult};
use super::env::GameSettingsView;
use super::valid::valid_wine;
use super::{js_join, WineHost, WineKind};
use crate::ctx::WineCtx;
use crate::manager::log_error;
use std::path::Path;

/// Where a Wine tool of a game runs (87-64, F3): the prefix its `WINEPREFIX` names.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ToolPrefix {
    /// Not a CrossOver bottle, or a CrossOver wine whose settings name no bottle (the shape the
    /// goldens' `GameLibBottle` case has: `winePrefix` is the bottle's directory and
    /// `wineCrossoverBottle` is empty): the prefix the settings store (`winePrefix`). No name is turned
    /// into a path here, so there is nothing to refuse.
    Stored,
    /// A CrossOver bottle: the bottle's own directory under the Bottles root. A bottle's settings keep
    /// the game's stored `winePrefix` (the shared default of a game that began on a plain prefix); a
    /// tool must never run there, because the bottle, not that directory, is what the game runs in.
    Bottle(String),
    /// A CrossOver target whose bottle name is not one safe segment under the Bottles root (T-87-112):
    /// there is no prefix, so the tool does not run and nothing is created.
    UnsafeBottle,
}

/// The prefix a Wine tool acts on for `settings`. The directory of a bottle comes only from the engine
/// crate's `direct_child_dir` (a clean name, directly under the Bottles root), never from a path in the
/// settings.
pub fn tool_prefix(ctx: &WineCtx, settings: &GameSettingsView) -> ToolPrefix {
    if settings.wine_version.kind != WineKind::Crossover
        || settings.wine_crossover_bottle.is_empty()
    {
        return ToolPrefix::Stored;
    }
    match gamelib_engine::bottles::lifecycle::direct_child_dir(
        &ctx.engine,
        &settings.wine_crossover_bottle,
    ) {
        Some(dir) => ToolPrefix::Bottle(dir),
        None => ToolPrefix::UnsafeBottle,
    }
}

/// Creates the prefix of `settings` when it is missing. An invalid wine and a crossover bottle (which
/// has no prefix of its own) answer an empty result without running anything. `Err` is the prefix
/// directory that could not be made, as fixed text.
pub async fn verify_wine_prefix(
    ctx: &WineCtx,
    settings: &GameSettingsView,
    host: &WineHost,
) -> Result<WineCommandResult, String> {
    let wine = &settings.wine_version;
    if !valid_wine(
        Some(wine),
        ctx.engine.platform,
        host.darwin_release.as_deref(),
        &|p| p.exists(),
    ) || wine.kind == WineKind::Crossover
    {
        return Ok(WineCommandResult::default());
    }

    let prefix = Path::new(&settings.wine_prefix);
    let umu = umu_supported(ctx, settings, host);
    if !prefix.exists() && !umu && std::fs::create_dir_all(prefix).is_err() {
        log_error(ctx, "unable to create the wine prefix directory");
        return Err("Unable to create the wine prefix".to_string());
    }

    // Without the registry, things like the DXVK installers fail, so wineboot is waited on then.
    let system_reg = if wine.kind == WineKind::Proton {
        js_join(&[&settings.wine_prefix, "pfx", "system.reg"])
    } else {
        js_join(&[&settings.wine_prefix, "system.reg"])
    };
    let args = WineCommandArgs {
        command_parts: if umu {
            vec!["createprefix".to_string()]
        } else {
            vec!["wineboot".to_string(), "--init".to_string()]
        },
        wait: !system_reg.exists(),
        proton_verb: Some("run".to_string()),
        skip_prefix_check: true,
        ..WineCommandArgs::default()
    };
    Ok(run_unchecked(ctx, settings, args, host).await)
}
