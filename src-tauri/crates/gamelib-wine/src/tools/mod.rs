//! The Wine tools (Phase 87, D-08, D-17): DXVK, dxvk-nvapi and vkd3d install and remove, the
//! GitHub release download they share, and the tools' in-memory state. A port of
//! `src/backend/tools/index.ts` (`installOrUpdateTool`, `createDxvk`, `restoreDxvkStrict`,
//! `getDxvkUrl`, `getVkd3dUrl`) and `toolsState.ts`, replayed against the goldens 87-09 recorded
//! from the TS (`tests/golden_dxvk.rs`) and the TS incident tests (`tests/dxvk_incidents.rs`).
//!
//! Crate-only (D-06): op `wine_dxvk_install_remove` exists and nothing calls it. The TS tools path
//! stays the only live DXVK path until 87-34 flips every DXVK writer in one plan (a TS and a Rust
//! writer of `<tools>/<tool>` and `current_<tool>` at once is what D-06 forbids); the engine-trait
//! implementation (`gamelib_engine::dxvk::DxvkInstaller`) lands in 87-29.
//!
//! - [`install_tool`]: `installOrUpdateTool`, a GitHub release looked up, downloaded through the
//!   `Fetch` seam, extracted through `extract_tar` and its version file written; the replaced
//!   version and the archive are removed through `gamelib-safety`, inside `<tools>/<tool>` only.
//! - [`dxvk`]: `installRemove`, the strict restore and the Linux release lookups.
//! - [`state`]: the single-flight slot and the caches.
//!
//! Nothing here reads the environment: the directories, the platform, the architecture and the
//! sinks arrive in [`WineCtx`]; the facts only the shell knows (the public directory holding the
//! Vulkan helper, whether the app is online, the wine host facts) arrive in [`ToolsHost`].

pub mod dxvk;
pub mod install_tool;
pub mod state;
mod vulkan;

use std::fmt;
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;

use gamelib_engine::dxvk::{DxvkAction, DxvkRequest, DxvkSource, DxvkTool};
use serde::Deserialize;
use serde_json::Value;

use crate::ctx::WineCtx;
use crate::wine_cmd::command::{run_wine_command, WineCommandArgs};
use crate::wine_cmd::env::GameSettingsView;
use crate::wine_cmd::WineHost;

/// A boxed future borrowing its arguments (the wine runner seam).
pub type WineFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// The facts about the running app that the crate may not read itself.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ToolsHost {
    /// The app's `public` directory, where `bin/<arch>/<platform>/vulkan-helper` lives. `None` is
    /// "no helper": every Vulkan probe answers unknown.
    #[serde(default)]
    pub public_dir: Option<PathBuf>,
    /// The online monitor's answer (`onlineMonitor.isOnline()`). Offline, a missing tool is not
    /// looked up.
    #[serde(default = "online_by_default")]
    pub online: bool,
    /// The wine host facts a wine command runs with (the process environment, the Darwin release).
    #[serde(default)]
    pub wine: WineHost,
}

fn online_by_default() -> bool {
    true
}

impl Default for ToolsHost {
    fn default() -> ToolsHost {
        ToolsHost {
            public_dir: None,
            online: true,
            wine: WineHost::default(),
        }
    }
}

/// One wine command a tool asks for (`commandRunner.runWineCommand` with `protonVerb: 'run'`).
#[derive(Debug, Clone, PartialEq)]
pub struct WineCall {
    /// The game settings the command runs under (the merged settings the install was asked with).
    pub settings: Value,
    pub command_parts: Vec<String>,
    /// `wait` of the TS call.
    pub wait: bool,
    /// `resolveOnExit` of the TS call.
    pub resolve_on_exit: bool,
}

/// Runs the wine commands of a tool. The answer is the exit code, or `None` when the command did
/// not run or ended without one (the TS read `result?.code`, which was `undefined` then).
///
/// The seam exists because the goldens record the commands at this boundary (what the tools ask of
/// the wine core, as `runWineCommand` calls), not as the wine spawns the wine core makes under it
/// (87-08 pinned those separately).
pub trait WineRunner: Send + Sync {
    fn run<'a>(&'a self, ctx: &'a WineCtx, call: WineCall) -> WineFuture<'a, Option<i32>>;
}

/// The production runner: [`run_wine_command`] over the host facts the shell gave.
pub struct HostWineRunner<'a> {
    pub host: &'a WineHost,
}

impl WineRunner for HostWineRunner<'_> {
    fn run<'a>(&'a self, ctx: &'a WineCtx, call: WineCall) -> WineFuture<'a, Option<i32>> {
        Box::pin(async move {
            // Settings the wine core cannot read (an unknown wine type, no wine at all) run nothing,
            // which is the answer an unusable wine gets.
            let settings: GameSettingsView = serde_json::from_value(call.settings).ok()?;
            let args = WineCommandArgs {
                game_settings: Some(settings),
                command_parts: call.command_parts,
                wait: call.wait,
                proton_verb: Some("run".to_string()),
                resolve_on_exit: call.resolve_on_exit,
                ..WineCommandArgs::default()
            };
            let result = run_wine_command(ctx, args, self.host).await;
            if result.ran {
                result.code
            } else {
                None
            }
        })
    }
}

/// Why an install or remove ended in an error (a TS rejection). A category and nothing else: no
/// path, URL or response text (T-87-09, T-87-21).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DxvkError {
    /// `latest_<tool>` is not there after the lookup (offline, or the download failed): the TS
    /// read it and threw ENOENT.
    MissingLatest,
    /// A directory or file the install reads (the tool's `x32`/`x64`, a version file) could not be
    /// read.
    Unreadable,
    /// A release feed did not answer, or answered something that is not a release.
    Feed,
    /// A request or settings value that does not name a prefix and a wine.
    BadSettings,
}

impl fmt::Display for DxvkError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            DxvkError::MissingLatest => "missing-latest",
            DxvkError::Unreadable => "unreadable",
            DxvkError::Feed => "feed",
            DxvkError::BadSettings => "bad-settings",
        })
    }
}

impl std::error::Error for DxvkError {}

/// A [`DxvkRequest`] out of its wire form: `{settings, tool, action, source?}`. `None` for any other
/// shape or an unknown name (the op answers a fixed `bad-args`).
pub fn decode_request(value: &Value) -> Option<DxvkRequest> {
    let map = value.as_object()?;
    if map
        .keys()
        .any(|k| !matches!(k.as_str(), "settings" | "tool" | "action" | "source"))
    {
        return None;
    }
    let settings = map.get("settings")?;
    if !settings.is_object() {
        return None;
    }
    let tool = match map.get("tool")?.as_str()? {
        "dxvk" => DxvkTool::Dxvk,
        "dxvk-nvapi" => DxvkTool::DxvkNvapi,
        "vkd3d" => DxvkTool::Vkd3d,
        "dxvk-macOS" => DxvkTool::DxvkMacOs,
        _ => return None,
    };
    let action = match map.get("action")?.as_str()? {
        "backup" => DxvkAction::Backup,
        "restore" => DxvkAction::Restore,
        _ => return None,
    };
    let source = match map.get("source") {
        None | Some(Value::Null) => None,
        Some(Value::Object(source)) => {
            if source.keys().any(|k| k != "dir" && k != "version") {
                return None;
            }
            Some(DxvkSource {
                dir: source.get("dir")?.as_str()?.to_string(),
                version: source.get("version")?.as_str()?.to_string(),
            })
        }
        Some(_) => return None,
    };
    Some(DxvkRequest {
        settings: settings.clone(),
        tool,
        action,
        source,
    })
}

/// A directory entry name that is one plain path component: it came from an archive or a version
/// file, so a separator, a drive colon, a NUL or a dot segment is refused before a path is built.
pub(crate) fn plain_name(text: &str) -> bool {
    crate::manager::plain_component(text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_request_decodes_strictly() {
        let ok = decode_request(&json!({
            "settings": {"winePrefix": "/p"},
            "tool": "dxvk-nvapi",
            "action": "restore",
            "source": {"dir": "/pinned", "version": "v1"}
        }))
        .unwrap();
        assert_eq!(ok.tool, DxvkTool::DxvkNvapi);
        assert_eq!(ok.action, DxvkAction::Restore);
        assert_eq!(ok.source.unwrap().version, "v1");

        let bare = decode_request(&json!({"settings": {}, "tool": "vkd3d", "action": "backup"}));
        assert!(bare.unwrap().source.is_none());

        for bad in [
            json!(null),
            json!({"settings": {}, "tool": "dxmt", "action": "backup"}),
            json!({"settings": {}, "tool": "dxvk", "action": "remove"}),
            json!({"settings": [], "tool": "dxvk", "action": "backup"}),
            json!({"settings": {}, "tool": "dxvk", "action": "backup", "extra": 1}),
            json!({"settings": {}, "tool": "dxvk", "action": "backup", "source": {"dir": "/x"}}),
            json!({"settings": {}, "tool": "dxvk", "action": "backup", "source": "/x"}),
        ] {
            assert!(decode_request(&bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn the_host_defaults_to_online_with_no_helper() {
        let host: ToolsHost = serde_json::from_value(json!({})).unwrap();
        assert!(host.online && host.public_dir.is_none());
        let off: ToolsHost =
            serde_json::from_value(json!({"online": false, "publicDir": "/p"})).unwrap();
        assert!(!off.online);
        assert!(serde_json::from_value::<ToolsHost>(json!({"nope": 1})).is_err());
    }

    #[test]
    fn only_a_plain_name_is_a_path_component() {
        assert!(plain_name("dxvk-2.9"));
        for bad in ["", "..", "a/b", "../x", "C:x"] {
            assert!(!plain_name(bad), "{bad:?}");
        }
    }
}
