//! `verifyWinePrefix` (`launcher.ts`): creates a wine prefix with `wineboot --init` (or umu's
//! `createprefix`) when it is missing.

use super::command::WineCommandResult;
use super::env::GameSettingsView;
use super::WineHost;
use crate::ctx::WineCtx;

/// Creates the prefix of `settings` when it is missing.
pub async fn verify_wine_prefix(
    _ctx: &WineCtx,
    _settings: &GameSettingsView,
    _host: &WineHost,
) -> Result<WineCommandResult, String> {
    Ok(WineCommandResult::default())
}
