//! The DXVK installer seam (D-25 (a)). The engine step needs a DXVK, DXVK-NVAPI or vkd3d install
//! into a bottle (the fallback engine's bottle prepare, the engine switch), but the code that does
//! it runs wine (`reg import`) and so lives in `gamelib-wine`, which depends on this crate and never
//! the other way. So this crate owns the trait, the shell injects the real implementation into
//! [`crate::ctx::EngineCtx::dxvk`], and `gamelib-wine` implements it (`WineDxvkInstaller`).
//!
//! The request is the TS `createDxvk(...).installRemove(settings, tool, action, source)` of
//! `src/backend/tools/index.ts`, with the same names.

use gamelib_core::process::BoxFuture;

/// The tools `installRemove` takes, spelled as the TS spells them ([`DxvkTool::as_str`]).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DxvkTool {
    Dxvk,
    DxvkNvapi,
    Vkd3d,
    /// The macOS DXVK build (`dxvk-macOS`), the one a bottle on the pinned engine gets.
    DxvkMacOs,
}

impl DxvkTool {
    /// The TS name: `dxvk`, `dxvk-nvapi`, `vkd3d`, `dxvk-macOS`.
    pub fn as_str(self) -> &'static str {
        match self {
            DxvkTool::Dxvk => "dxvk",
            DxvkTool::DxvkNvapi => "dxvk-nvapi",
            DxvkTool::Vkd3d => "vkd3d",
            DxvkTool::DxvkMacOs => "dxvk-macOS",
        }
    }
}

/// `backup` puts the tool's DLLs into the prefix (backing up the originals), `restore` puts the
/// originals back.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DxvkAction {
    Backup,
    Restore,
}

impl DxvkAction {
    /// The TS name: `backup` or `restore`.
    pub fn as_str(self) -> &'static str {
        match self {
            DxvkAction::Backup => "backup",
            DxvkAction::Restore => "restore",
        }
    }
}

/// A GameLib-pinned DXVK for the fallback engine (Phase 59): when given, the tools-directory
/// `latest_<tool>` lookup is skipped and the copy is synchronous. `dir` is where the build was
/// unpacked.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DxvkSource {
    pub dir: String,
    pub version: String,
}

/// One `installRemove` call.
#[derive(Debug, Clone, PartialEq)]
pub struct DxvkRequest {
    /// The merged game settings the TS passes (the wine version and prefix are read from it).
    pub settings: serde_json::Value,
    pub tool: DxvkTool,
    pub action: DxvkAction,
    pub source: Option<DxvkSource>,
}

/// Installs or removes a DXVK-family tool in the prefix the settings name. `true` when it did.
pub trait DxvkInstaller: Send + Sync + 'static {
    fn install_remove(&self, req: DxvkRequest) -> BoxFuture<bool>;
}

/// The installer a headless context gets until the wine crate's is wired in: it installs nothing.
#[derive(Debug, Default, Clone, Copy)]
pub struct NoDxvk;

impl DxvkInstaller for NoDxvk {
    fn install_remove(&self, _req: DxvkRequest) -> BoxFuture<bool> {
        Box::pin(async { false })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::Arc;

    #[tokio::test]
    async fn no_dxvk_installs_nothing_through_a_shared_trait_object() {
        let dxvk: Arc<dyn DxvkInstaller> = Arc::new(NoDxvk);
        let done = dxvk
            .install_remove(DxvkRequest {
                settings: json!({}),
                tool: DxvkTool::DxvkMacOs,
                action: DxvkAction::Backup,
                source: None,
            })
            .await;
        assert!(!done);
    }

    #[test]
    fn the_names_are_the_ts_names() {
        let tools = [
            DxvkTool::Dxvk,
            DxvkTool::DxvkNvapi,
            DxvkTool::Vkd3d,
            DxvkTool::DxvkMacOs,
        ];
        let names: Vec<&str> = tools.iter().map(|t| t.as_str()).collect();
        assert_eq!(names, ["dxvk", "dxvk-nvapi", "vkd3d", "dxvk-macOS"]);
        assert_eq!(DxvkAction::Backup.as_str(), "backup");
        assert_eq!(DxvkAction::Restore.as_str(), "restore");
    }
}
