//! Read half of acfState.ts and all of acfUpdateState.ts. Ported by plan 04.

use serde::{Deserialize, Serialize};

/// Roots a poll reads. Native libraries are resolved per tick from `steamRoot` exactly as
/// `getSteamLibraries` (src/backend/utils.ts:610-640) does.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PollRoots {
    pub steam_root: String,
    pub bottle_steamapps_root: Option<String>,
    pub bridge_steamapps_root: Option<String>,
}
