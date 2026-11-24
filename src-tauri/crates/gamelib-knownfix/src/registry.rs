//! Tier-2 `registry` and `dllOverrides` known fixes (`knownFixesRegistry.ts`, quick 261026-j6x and
//! 261029-gow), ported for D-03. RED stub: the shapes and signatures, no behaviour yet.

use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio_util::sync::CancellationToken;

use crate::ctx::KnownFixCtx;
use crate::jsvalue::JsValue;
use crate::types::{KnownFixProfile, Runner};

/// How long one `reg add` gets before it is cancelled (`REGISTRY_FIX_TIMEOUT_MS`).
pub const REGISTRY_FIX_TIMEOUT: Duration = Duration::from_millis(15_000);

/// The registry value types a fix may write.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RegistryType {
    #[serde(rename = "REG_DWORD")]
    Dword,
    #[serde(rename = "REG_SZ")]
    Sz,
}

/// One validated registry fix.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ValidRegistryFix {
    pub key: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: RegistryType,
    pub data: String,
    pub views: Vec<u8>,
}

/// How one `reg add` run ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RegistryRunOutcome {
    Code(Option<i32>),
    Killed(Option<u32>),
    Cancelled,
    Failed(String),
}

pub type RunFuture<'a> = Pin<Box<dyn Future<Output = RegistryRunOutcome> + Send + 'a>>;

/// The seam one `reg add` runs through.
pub trait RegistryRun: Send + Sync {
    fn run(&self, command_parts: Vec<String>, cancel: CancellationToken) -> RunFuture<'_>;
}

/// What the wine command is asked with (everything except the command parts and the settings).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RunOptions {
    pub proton_verb: &'static str,
    pub skip_prefix_check: bool,
}

/// The launcher's: `runinprefix`, the prefix check on (the game's real prefix, just verified).
pub const LAUNCHER_RUN_OPTIONS: RunOptions = RunOptions {
    proton_verb: "runinprefix",
    skip_prefix_check: false,
};

/// The Steam bridge's: `run`, the prefix check skipped.
pub const BRIDGE_RUN_OPTIONS: RunOptions = RunOptions {
    proton_verb: "run",
    skip_prefix_check: true,
};

pub fn validate_registry_fixes(
    _ctx: &KnownFixCtx,
    _raw: Option<&JsValue>,
    _label: &str,
) -> Vec<ValidRegistryFix> {
    Vec::new()
}

pub fn dll_overrides_to_registry_fixes(
    _ctx: &KnownFixCtx,
    _raw: Option<&JsValue>,
    _label: &str,
) -> Vec<JsValue> {
    Vec::new()
}

pub fn profile_registry_fixes_js(
    _ctx: &KnownFixCtx,
    _registry: Option<&JsValue>,
    _dll_overrides: Option<&JsValue>,
    _label: &str,
) -> Option<JsValue> {
    None
}

pub fn profile_registry_fixes(
    ctx: &KnownFixCtx,
    profile: &KnownFixProfile,
    label: &str,
) -> Option<JsValue> {
    let registry = profile.registry.as_ref().map(JsValue::from_value);
    let dll = profile.dll_overrides.as_ref().map(JsValue::from_value);
    profile_registry_fixes_js(ctx, registry.as_ref(), dll.as_ref(), label)
}

pub fn command_parts(_fix: &ValidRegistryFix, _view: u8) -> Vec<String> {
    Vec::new()
}

pub fn value_is_set(_reg_text: &str, _fix: &ValidRegistryFix, _view: u8) -> bool {
    false
}

pub fn prefix_dir(_user_home: &Path, _game_settings: &Value) -> Option<PathBuf> {
    None
}

pub async fn apply_registry_fixes(
    _ctx: &KnownFixCtx,
    _raw: Option<&JsValue>,
    _label: &str,
    _run: &dyn RegistryRun,
    _prefix_dir: Option<&Path>,
) {
}

pub async fn apply_known_fix_profile_registry_with(
    _ctx: &KnownFixCtx,
    _app_name: &str,
    _runner: Runner,
    _game_settings: &Value,
    _run: &dyn RegistryRun,
) {
}
