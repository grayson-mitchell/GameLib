//! `callTool` (`runnerMiscFlowRegistration.ts`, the Wine tool buttons): `winecfg` and `runExe` on a
//! game, each one a `run_wine_command_for_game` with the TS's fixed arguments (D-25 (c)).
//!
//! Only the wine command is here. What the TS handler did after it (the GOG offline-installer check,
//! `pushGameToLibrary` and the final `gameStatusUpdate done`) reads the library and sends the
//! renderer's messages, so it stays in the TS registration glue, after this returns, in the TS order.
//!
//! Crate-only (D-06): op `wine_tool_call` has no caller until 87-36 flips the resolver.

use serde::Deserialize;

use crate::ctx::WineCtx;
use crate::wine_cmd::command::{run_wine_command_for_game, ForGameArgs, ForGameError};
use crate::wine_cmd::env::GameSettingsView;
use crate::wine_cmd::WineHost;
use gamelib_engine::ctx::Platform;
use serde_json::{json, Value};

/// The two tools (`'winecfg' | 'runExe'`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Tool {
    Winecfg,
    RunExe,
}

/// The argument object of `call_tool`: the tool, the exe a `runExe` runs, and the same game facts
/// `run_wine_command_for_game` takes (see [`ForGameArgs`]). Strict: an unknown key is a bad argument.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CallToolArgs {
    pub tool: Tool,
    #[serde(default)]
    pub exe: Option<String>,
    pub runner: String,
    pub app_name: String,
    #[serde(default)]
    pub settings: Option<GameSettingsView>,
    #[serde(default)]
    pub unavailable: Option<String>,
    #[serde(default)]
    pub steam_eligible: bool,
    #[serde(default)]
    pub is_native: bool,
    #[serde(default)]
    pub folder_name: Option<String>,
    #[serde(default)]
    pub install_path: Option<String>,
}

/// `path.parse(exe).dir`: everything before the last separator (`""` for a bare name, the root for a
/// file directly under it). The separators are the platform's: a backslash only counts on Windows.
pub fn exe_dir(exe: &str, platform: Platform) -> String {
    let is_separator = |c: char| c == '/' || (platform == Platform::Windows && c == '\\');
    match exe.rfind(is_separator) {
        None => String::new(),
        Some(0) => exe[..1].to_string(),
        Some(at) => exe[..at].to_string(),
    }
}

impl CallToolArgs {
    /// The wine command the tool is, or `None` for a `runExe` with no exe (the TS ran nothing).
    fn command(&self, platform: Platform) -> Option<ForGameArgs> {
        let (parts, start_folder) = match self.tool {
            Tool::Winecfg => (vec!["winecfg".to_string()], None),
            Tool::RunExe => {
                let exe = self.exe.as_deref().filter(|e| !e.is_empty())?;
                (vec![exe.to_string()], Some(exe_dir(exe, platform)))
            }
        };
        Some(ForGameArgs {
            runner: self.runner.clone(),
            app_name: self.app_name.clone(),
            settings: self.settings.clone(),
            unavailable: self.unavailable.clone(),
            steam_eligible: self.steam_eligible,
            is_native: self.is_native,
            folder_name: self.folder_name.clone(),
            install_path: self.install_path.clone(),
            pending_install: false,
            command_parts: json!(parts),
            wait: false,
            proton_verb: None,
            start_folder,
        })
    }
}

/// Runs the tool's wine command, `wait` false, through the guards of `run_wine_command_for_game`.
/// Answers nothing (`undefined` in the TS): a refused command is only a log line.
pub async fn call_tool(
    ctx: &WineCtx,
    args: CallToolArgs,
    host: &WineHost,
) -> Result<Value, ForGameError> {
    if let Some(command) = args.command(ctx.engine.platform) {
        run_wine_command_for_game(ctx, command, host).await?;
    }
    Ok(Value::Null)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_dir_of_an_exe_is_path_parses() {
        assert_eq!(exe_dir("/g/Game/setup.exe", Platform::Linux), "/g/Game");
        assert_eq!(exe_dir("/setup.exe", Platform::Linux), "/");
        assert_eq!(exe_dir("setup.exe", Platform::Linux), "");
        // A backslash is a separator on Windows only.
        assert_eq!(exe_dir("C:\\g\\setup.exe", Platform::Windows), "C:\\g");
        assert_eq!(exe_dir("C:\\g\\setup.exe", Platform::Linux), "");
    }
}
