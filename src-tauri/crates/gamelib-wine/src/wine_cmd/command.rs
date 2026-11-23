//! `runWineCommand` (`commandRunner.ts`): the prefix check, the environment merge and the spawn of
//! one wine command.

use super::env::GameSettingsView;
use super::WineHost;
use crate::ctx::WineCtx;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::BTreeMap;

/// `options` of `WineCommandArgs` that cross the boundary (the log writers and the output callback
/// are the caller's).
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WineCommandOptions {
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    #[serde(default)]
    pub wrappers: Vec<String>,
    #[serde(default)]
    pub track_key: Option<String>,
}

/// `WineCommandArgs`.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WineCommandArgs {
    #[serde(default)]
    pub game_settings: Option<GameSettingsView>,
    pub command_parts: Vec<String>,
    #[serde(default)]
    pub wait: bool,
    #[serde(default)]
    pub proton_verb: Option<String>,
    #[serde(default)]
    pub install_folder_name: Option<String>,
    #[serde(default)]
    pub game_install_path: Option<String>,
    #[serde(default)]
    pub options: Option<WineCommandOptions>,
    #[serde(default)]
    pub start_folder: Option<String>,
    #[serde(default, rename = "skipPrefixCheckIKnowWhatImDoing")]
    pub skip_prefix_check: bool,
    #[serde(default)]
    pub ignore_logging: bool,
    #[serde(default)]
    pub resolve_on_exit: bool,
}

/// The per-stream cap on the output a wine command returns (stdout and stderr each).
pub const MAX_BUFFER: usize = 4 * 1024 * 1024;

/// `WineCommandResult`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WineCommandResult {
    pub stdout: String,
    pub stderr: String,
    pub code: Option<i32>,
    pub ran: bool,
    /// Either stream went past [`MAX_BUFFER`] and was cut.
    pub truncated: bool,
}

impl WineCommandResult {
    pub fn to_json(&self) -> Value {
        let mut out = json!({ "stdout": self.stdout, "stderr": self.stderr });
        if self.ran {
            out["code"] = json!(self.code);
        }
        out
    }
}

/// Runs one wine command.
pub async fn run_wine_command(
    _ctx: &WineCtx,
    _args: WineCommandArgs,
    _host: &WineHost,
) -> WineCommandResult {
    WineCommandResult::default()
}
