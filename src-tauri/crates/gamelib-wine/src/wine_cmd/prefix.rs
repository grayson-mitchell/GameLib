//! `verifyWinePrefix` (`launcher.ts`): creates a wine prefix with `wineboot --init` (or umu's
//! `createprefix`) when it is missing.

use super::command::{run_unchecked, umu_supported, WineCommandArgs, WineCommandResult};
use super::env::GameSettingsView;
use super::valid::valid_wine;
use super::{js_join, WineHost, WineKind};
use crate::ctx::WineCtx;
use crate::manager::log_error;
use std::path::Path;

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
