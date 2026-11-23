//! The Linux wine set (`getLinuxWineSet`).

use super::DiscoveryHost;
use crate::ctx::WineCtx;
use crate::wine_cmd::WineInstallation;

/// Not implemented yet (RED stub): lists nothing.
pub async fn linux_wine_set(
    _ctx: &WineCtx,
    _host: &DiscoveryHost,
    _scan_custom: bool,
) -> Vec<WineInstallation> {
    Vec::new()
}
