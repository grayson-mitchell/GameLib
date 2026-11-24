//! The overlay env the launcher and the Steam bridge merge into a game's environment (quick 261027-n77,
//! Phase 88 D-03), ported from `src/backend/knownFixOverlays.ts`.
//!
//! RED stage (88-10 task 3): the shapes only. The bodies are inert, so the replay in
//! `tests/golden_overlay_install.rs` fails on its assertions and not on a build error.

use std::borrow::Cow;
use std::collections::BTreeMap;
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;

use serde_json::Value;

use crate::catalogue::OverlayCatalogueEntry;
use crate::ctx::KnownFixCtx;
use crate::jsvalue::JsValue;
use crate::types::Runner;

/// At most this many `overlays` entries are looked at.
pub const MAX_OVERLAY_ENTRIES: usize = 8;

/// One `enviromentOptions` entry of a game's settings (the misspelling is the app's).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnvOption {
    pub key: String,
    pub value: String,
}

/// One applied variable, as the log line lists it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnvLine {
    pub key: String,
    pub value: String,
    pub source: String,
}

/// The values a variable has before an overlay is appended to it.
pub trait BaseValues {
    fn base_value(&self, key: &str) -> Option<String>;
}

impl BaseValues for BTreeMap<String, String> {
    fn base_value(&self, key: &str) -> Option<String> {
        self.get(key).cloned()
    }
}

impl<F: Fn(&str) -> Option<String>> BaseValues for F {
    fn base_value(&self, key: &str) -> Option<String> {
        self(key)
    }
}

/// What installs an overlay: [`CtxInstaller`] in the app, a scripted answer in a test.
pub trait OverlayInstaller: Send + Sync {
    fn ensure<'a>(
        &'a self,
        entry: &'a OverlayCatalogueEntry,
        label: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<Option<PathBuf>, String>> + Send + 'a>>;
}

/// The production installer: `ensure_overlay_installed` over a context.
pub struct CtxInstaller<'c>(pub &'c KnownFixCtx);

impl OverlayInstaller for CtxInstaller<'_> {
    fn ensure<'a>(
        &'a self,
        _entry: &'a OverlayCatalogueEntry,
        _label: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<Option<PathBuf>, String>> + Send + 'a>> {
        Box::pin(async { Ok(None) })
    }
}

pub fn validate_overlay_entries(
    _ctx: &KnownFixCtx,
    _raw: Option<&JsValue>,
    _label: &str,
) -> Vec<&'static OverlayCatalogueEntry> {
    Vec::new()
}

pub fn append_path_list(_existing: Option<&str>, _dir: &str) -> String {
    String::new()
}

pub fn env_options_of(_settings: &Value) -> Vec<EnvOption> {
    Vec::new()
}

pub fn last_env_option<'a>(_options: &'a [EnvOption], _key: &str) -> Option<&'a str> {
    None
}

pub fn format_known_fix_env_line(_entries: &[EnvLine]) -> Option<String> {
    None
}

pub fn log_known_fix_env(_ctx: &KnownFixCtx, _label: &str, _entries: &[EnvLine]) -> Option<String> {
    None
}

pub fn with_known_fix_env<'a>(settings: &'a Value, _env: &[(String, String)]) -> Cow<'a, Value> {
    Cow::Borrowed(settings)
}

pub async fn resolve_overlay_env(
    _ctx: &KnownFixCtx,
    _raw: Option<&JsValue>,
    _label: &str,
    _wine_type: Option<&str>,
    _base_values: &dyn BaseValues,
    _installer: &dyn OverlayInstaller,
) -> BTreeMap<String, String> {
    BTreeMap::new()
}

pub async fn profile_overlay_env_with(
    _ctx: &KnownFixCtx,
    _app_name: &str,
    _runner: Runner,
    _game_settings: &Value,
    _tier1_env: &BTreeMap<String, String>,
    _process_env_base: &BTreeMap<String, String>,
    _installer: &dyn OverlayInstaller,
) -> BTreeMap<String, String> {
    BTreeMap::new()
}

pub async fn profile_overlay_env(
    ctx: &KnownFixCtx,
    app_name: &str,
    runner: Runner,
    game_settings: &Value,
    tier1_env: &BTreeMap<String, String>,
    process_env_base: &BTreeMap<String, String>,
) -> BTreeMap<String, String> {
    profile_overlay_env_with(
        ctx,
        app_name,
        runner,
        game_settings,
        tier1_env,
        process_env_base,
        &CtxInstaller(ctx),
    )
    .await
}
