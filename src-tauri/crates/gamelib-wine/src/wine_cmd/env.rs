//! `setupEnvVars` and `setupWineEnvVars` (`launcher.ts`): the environment a wine command runs with,
//! as pure functions over the settings, the platform and a snapshot of the process environment.
//! Each takes what the TS read from `process.env`, `isMac`, `isLinux` and `existsSync` as arguments,
//! so a vector injects its inputs and production passes the real ones.

use super::{js_dirname, js_join, WineInstallation, WineKind};
use gamelib_engine::ctx::Platform;
use serde::Deserialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// A snapshot of the process environment.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(transparent)]
pub struct EnvSnapshot(BTreeMap<String, String>);

impl EnvSnapshot {
    pub fn new(vars: BTreeMap<String, String>) -> EnvSnapshot {
        EnvSnapshot(vars)
    }

    pub fn from_pairs<K: Into<String>, V: Into<String>>(
        pairs: impl IntoIterator<Item = (K, V)>,
    ) -> EnvSnapshot {
        EnvSnapshot(
            pairs
                .into_iter()
                .map(|(k, v)| (k.into(), v.into()))
                .collect(),
        )
    }

    pub fn vars(&self) -> &BTreeMap<String, String> {
        &self.0
    }

    /// The value of `key`, `None` when unset.
    pub fn get(&self, key: &str) -> Option<&str> {
        self.0.get(key).map(String::as_str)
    }

    /// The value of `key` when it is set and not empty: a JS truthiness test of `process.env.KEY`.
    pub fn truthy(&self, key: &str) -> Option<&str> {
        self.get(key).filter(|v| !v.is_empty())
    }
}

/// One `{ key, value }` of `GameSettings.enviromentOptions` (the TS spelling).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct EnvEntry {
    pub key: String,
    pub value: String,
}

/// The `GameSettings` fields the two builders and `runWineCommand` read; every other field of the
/// settings object is ignored (the full merge stays TS until Phase 98).
#[derive(Debug, Clone, Deserialize)]
pub struct GameSettingsView {
    #[serde(rename = "nvidiaPrime", default)]
    pub nvidia_prime: bool,
    #[serde(rename = "showFps", default)]
    pub show_fps: bool,
    #[serde(rename = "enviromentOptions", default)]
    pub environment_options: Vec<EnvEntry>,
    #[serde(rename = "winePrefix", default)]
    pub wine_prefix: String,
    #[serde(rename = "wineCrossoverBottle", default)]
    pub wine_crossover_bottle: String,
    #[serde(rename = "enableDXVKFpsLimit", default)]
    pub enable_dxvk_fps_limit: bool,
    #[serde(rename = "DXVKFpsCap", default)]
    pub dxvk_fps_cap: String,
    #[serde(rename = "enableFSR", default)]
    pub enable_fsr: bool,
    #[serde(rename = "maxSharpness", default)]
    pub max_sharpness: Option<serde_json::Number>,
    #[serde(rename = "enableEsync", default)]
    pub enable_esync: bool,
    #[serde(rename = "enableMsync", default)]
    pub enable_msync: bool,
    #[serde(rename = "enableFsync", default)]
    pub enable_fsync: bool,
    #[serde(rename = "enableWineWayland", default)]
    pub enable_wine_wayland: bool,
    #[serde(rename = "enableHDR", default)]
    pub enable_hdr: bool,
    #[serde(rename = "enableWoW64", default)]
    pub enable_wow64: bool,
    #[serde(rename = "autoInstallDxvkNvapi", default)]
    pub auto_install_dxvk_nvapi: bool,
    #[serde(rename = "eacRuntime", default)]
    pub eac_runtime: bool,
    #[serde(rename = "battlEyeRuntime", default)]
    pub battleye_runtime: bool,
    #[serde(rename = "verboseLogs", default)]
    pub verbose_logs: bool,
    #[serde(rename = "preferSystemLibs", default)]
    pub prefer_system_libs: bool,
    #[serde(rename = "advertiseAvxForRosetta", default)]
    pub advertise_avx_for_rosetta: bool,
    #[serde(rename = "disableUMU", default)]
    pub disable_umu: bool,
    #[serde(rename = "wineVersion")]
    pub wine_version: WineInstallation,
}

/// The two directories `setupWineEnvVars` derives paths from (`AppPaths.flatpakHome` and
/// `AppPaths.runtimePath`).
#[derive(Debug, Clone)]
pub struct WineEnvPaths {
    pub flatpak_home: PathBuf,
    pub runtime_path: PathBuf,
}

/// A line the TS builder logged. Fixed text only: the engine log never carries a profile path.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnvNote {
    /// A wine with library folders configured but not both (a log error in the TS).
    WineLibFoldersMissing,
    /// The deprecated Wine-GE/Proton-GE workaround was applied (a log warning in the TS).
    DeprecatedGeWorkaround,
}

/// What [`build_wine_env_vars`] produced: the variables and the notes the TS logged on the way.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WineEnv {
    pub vars: BTreeMap<String, String>,
    pub notes: Vec<EnvNote>,
}

/// `setupEnvVars`.
pub fn setup_env_vars(
    _settings: &GameSettingsView,
    _install_path: Option<&str>,
    _platform: Platform,
    _env: &EnvSnapshot,
) -> BTreeMap<String, String> {
    BTreeMap::new()
}

/// `setupWineEnvVars`, with the notes it logged.
pub fn build_wine_env_vars(
    _settings: &GameSettingsView,
    _game_id: Option<&str>,
    _platform: Platform,
    _env: &EnvSnapshot,
    _paths: &WineEnvPaths,
    _exists: &dyn Fn(&Path) -> bool,
) -> WineEnv {
    let _ = (js_dirname, js_join, WineKind::Wine);
    WineEnv::default()
}

/// `setupWineEnvVars`.
pub fn setup_wine_env_vars(
    settings: &GameSettingsView,
    game_id: Option<&str>,
    platform: Platform,
    env: &EnvSnapshot,
    paths: &WineEnvPaths,
    exists: &dyn Fn(&Path) -> bool,
) -> BTreeMap<String, String> {
    build_wine_env_vars(settings, game_id, platform, env, paths, exists).vars
}
