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

/// `removeQuoteIfNecessary`: a value that starts and ends with a double quote loses every leading and
/// every trailing quote.
fn remove_quote_if_necessary(value: &str) -> String {
    if value.starts_with('"') && value.ends_with('"') {
        value
            .trim_start_matches('"')
            .trim_end_matches('"')
            .to_string()
    } else {
        value.to_string()
    }
}

/// `setupEnvVars`: the platform-independent part of the environment (GPU offload, the HUD, the install
/// path, the user's own variables and an empty `LD_PRELOAD` when none is set anywhere).
pub fn setup_env_vars(
    settings: &GameSettingsView,
    install_path: Option<&str>,
    platform: Platform,
    env: &EnvSnapshot,
) -> BTreeMap<String, String> {
    let mut ret = BTreeMap::new();
    let mut put = |key: &str, value: &str| {
        ret.insert(key.to_string(), value.to_string());
    };
    if settings.nvidia_prime {
        put("DRI_PRIME", "1");
        put("__NV_PRIME_RENDER_OFFLOAD", "1");
        put("__GLX_VENDOR_LIBRARY_NAME", "nvidia");
    }
    if platform == Platform::Mac && settings.show_fps {
        put("MTL_HUD_ENABLED", "1");
    }
    if let (Platform::Linux, Some(path)) = (platform, install_path.filter(|p| !p.is_empty())) {
        // Used by the Steam runtime to mount the game directory into the container.
        put("STEAM_COMPAT_INSTALL_PATH", path);
    }
    for entry in &settings.environment_options {
        put(&entry.key, &remove_quote_if_necessary(&entry.value));
    }
    // An empty LD_PRELOAD when none is defined (fixes the std::log_error for Fall Guys).
    let user_preload = ret.get("LD_PRELOAD").is_some_and(|v| !v.is_empty());
    if env.truthy("LD_PRELOAD").is_none() && !user_preload {
        ret.insert("LD_PRELOAD".to_string(), String::new());
    }
    ret
}

/// JS `Number.prototype.toString` for the one number a setting carries (`maxSharpness`): an integral
/// value has no fraction.
fn js_number_text(number: &serde_json::Number) -> String {
    match number.as_f64() {
        Some(f) if f.fract() == 0.0 && f.abs() < 1e21 => format!("{f:.0}"),
        Some(f) => f.to_string(),
        None => number.to_string(),
    }
}

/// `/(GE|Wine|Proton)-(Proton[7-8]|[4-7].*-GE|GE-4.[0-9]*)/` searched anywhere in `name`: a
/// deprecated Wine-GE or Proton-GE release (8.x and older).
fn is_deprecated_ge_name(name: &str) -> bool {
    let is_line_end = |c: char| matches!(c, '\n' | '\r' | '\u{2028}' | '\u{2029}');
    name.char_indices().any(|(start, _)| {
        let tail = &name[start..];
        ["GE-", "Wine-", "Proton-"].iter().any(|head| {
            let Some(rest) = tail.strip_prefix(head) else {
                return false;
            };
            // Proton[7-8]
            if let Some(after) = rest.strip_prefix("Proton") {
                if after.starts_with(['7', '8']) {
                    return true;
                }
            }
            // [4-7].*-GE: `.` does not cross a line terminator.
            if let Some(after) = rest.strip_prefix(['4', '5', '6', '7']) {
                let line = after.split(is_line_end).next().unwrap_or("");
                if line.contains("-GE") {
                    return true;
                }
            }
            // GE-4.[0-9]*: `GE-4` then any one character.
            if let Some(after) = rest.strip_prefix("GE-4") {
                if after.chars().next().is_some_and(|c| !is_line_end(c)) {
                    return true;
                }
            }
            false
        })
    })
}

fn path_text(path: PathBuf) -> String {
    path.to_string_lossy().into_owned()
}

/// `setupWineEnvVars`, with the notes it logged. The TS logged through the backend logger; the notes
/// let the caller log the same events as fixed text.
pub fn build_wine_env_vars(
    settings: &GameSettingsView,
    game_id: Option<&str>,
    platform: Platform,
    env: &EnvSnapshot,
    paths: &WineEnvPaths,
    exists: &dyn Fn(&Path) -> bool,
) -> WineEnv {
    let wine = &settings.wine_version;
    let is_mac = platform == Platform::Mac;
    let is_linux = platform == Platform::Linux;
    let is_proton = wine.kind == WineKind::Proton;
    let mut ret: BTreeMap<String, String> = BTreeMap::new();
    let mut notes = Vec::new();
    let put = |ret: &mut BTreeMap<String, String>, key: &str, value: &str| {
        ret.insert(key.to_string(), value.to_string());
    };
    let flatpak_home = paths.flatpak_home.to_string_lossy();
    let has_user_env = |key: &str| settings.environment_options.iter().any(|e| e.key == key);

    // WINEPREFIX / STEAM_COMPAT_DATA_PATH / CX_BOTTLE
    let steam_install_path = path_text(js_join(&[&flatpak_home, ".steam", "steam"]));
    match wine.kind {
        WineKind::Wine => {
            put(&mut ret, "WINEPREFIX", &settings.wine_prefix);
            // Disable Winemenubuilder so it does not mess with file associations; a user's own
            // WINEDLLOVERRIDES (any case) gets it appended.
            let disable = "winemenubuilder.exe=d";
            match settings
                .environment_options
                .iter()
                .find(|e| e.key.to_lowercase() == "winedlloverrides")
            {
                Some(user) => put(&mut ret, &user.key, &format!("{};{disable}", user.value)),
                None => put(&mut ret, "WINEDLLOVERRIDES", disable),
            }
        }
        WineKind::Proton => {
            put(
                &mut ret,
                "STEAM_COMPAT_CLIENT_INSTALL_PATH",
                &steam_install_path,
            );
            put(&mut ret, "WINEPREFIX", &settings.wine_prefix);
            put(&mut ret, "STEAM_COMPAT_DATA_PATH", &settings.wine_prefix);
            put(&mut ret, "PROTONPATH", &js_dirname(&wine.bin));
        }
        WineKind::Crossover => put(&mut ret, "CX_BOTTLE", &settings.wine_crossover_bottle),
        WineKind::Toolkit => put(&mut ret, "WINEPREFIX", &settings.wine_prefix),
    }

    if settings.show_fps {
        if is_mac {
            put(&mut ret, "MTL_HUD_ENABLED", "1");
        } else {
            put(&mut ret, "DXVK_HUD", "fps");
        }
    }
    if settings.enable_dxvk_fps_limit {
        put(&mut ret, "DXVK_FRAME_RATE", &settings.dxvk_fps_cap);
    }
    if settings.enable_fsr {
        put(&mut ret, "WINE_FULLSCREEN_FSR", "1");
        let strength = settings
            .max_sharpness
            .as_ref()
            .map(js_number_text)
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| "2".to_string());
        put(&mut ret, "WINE_FULLSCREEN_FSR_STRENGTH", &strength);
    } else {
        put(&mut ret, "WINE_FULLSCREEN_FSR", "0");
    }
    if settings.enable_esync && !is_proton {
        put(&mut ret, "WINEESYNC", "1");
    }
    if !settings.enable_esync && is_proton {
        put(&mut ret, "PROTON_NO_ESYNC", "1");
    }
    if is_mac && (settings.enable_msync || wine.name.ends_with("-DXMT")) {
        put(&mut ret, "WINEMSYNC", "1");
        // Solves a problem with d3dmetal.
        if wine.kind == WineKind::Toolkit {
            put(&mut ret, "WINEESYNC", "1");
        }
    }
    if is_linux && settings.enable_fsync && !is_proton {
        put(&mut ret, "WINEFSYNC", "1");
    }
    if is_linux && !settings.enable_fsync && is_proton {
        put(&mut ret, "PROTON_NO_FSYNC", "1");
    }
    if is_linux && settings.enable_wine_wayland {
        if is_proton {
            put(&mut ret, "PROTON_ENABLE_WAYLAND", "1");
            if settings.enable_hdr {
                put(&mut ret, "PROTON_ENABLE_HDR", "1");
            }
        } else {
            put(&mut ret, "DISPLAY", "");
            if settings.enable_hdr {
                put(&mut ret, "DXVK_HDR", "1");
            }
        }
    }
    if is_linux && settings.enable_wow64 {
        if is_proton {
            put(&mut ret, "PROTON_USE_WOW64", "1");
        } else {
            put(&mut ret, "WINEARCH", "wow64");
        }
    }
    if is_proton {
        if settings.auto_install_dxvk_nvapi {
            put(&mut ret, "PROTON_ENABLE_NVAPI", "1");
            put(&mut ret, "DXVK_NVAPI_ALLOW_OTHER_DRIVERS", "1");
        } else {
            // Proton 9 enabled NVAPI by default.
            put(&mut ret, "PROTON_DISABLE_NVAPI", "1");
        }
    }
    if is_linux && settings.auto_install_dxvk_nvapi && wine.kind == WineKind::Wine {
        put(&mut ret, "DXVK_ENABLE_NVAPI", "1");
        put(&mut ret, "DXVK_NVAPI_ALLOW_OTHER_DRIVERS", "1");
    }
    let runtime = paths.runtime_path.to_string_lossy();
    if is_linux && settings.eac_runtime {
        put(
            &mut ret,
            "PROTON_EAC_RUNTIME",
            &path_text(js_join(&[&runtime, "eac_runtime"])),
        );
    }
    if is_linux && settings.battleye_runtime {
        put(
            &mut ret,
            "PROTON_BATTLEYE_RUNTIME",
            &path_text(js_join(&[&runtime, "battleye_runtime"])),
        );
    }
    if is_proton {
        // Without these GE-Proton guesses the AppID from the prefix path, which does not work here.
        let app_id = env.truthy("STEAM_COMPAT_APP_ID").unwrap_or("0").to_string();
        put(&mut ret, "STEAM_COMPAT_APP_ID", &app_id);
        let steam_app_id = env.truthy("SteamAppId").unwrap_or(&app_id).to_string();
        put(&mut ret, "SteamAppId", &steam_app_id);
        // Names the log file given when PROTON_LOG=1.
        let game_id = game_id.unwrap_or("0");
        let steam_game_id = env
            .truthy("SteamGameId")
            .map(str::to_string)
            .unwrap_or_else(|| format!("heroic-{game_id}"));
        put(&mut ret, "SteamGameId", &steam_game_id);
        put(&mut ret, "PROTON_LOG_DIR", &flatpak_home);
        // Back the default wine and dxvk debug logging unless the user set their own.
        if settings.verbose_logs {
            if !has_user_env("WINEDEBUG") {
                put(&mut ret, "WINEDEBUG", "+fixme");
            }
            if !has_user_env("DXVK_LOG_LEVEL") {
                put(&mut ret, "DXVK_LOG_LEVEL", "info");
            }
            if !has_user_env("VKD3D_DEBUG") {
                put(&mut ret, "VKD3D_DEBUG", "fixme");
            }
        }
    }
    if !settings.prefer_system_libs && wine.kind == WineKind::Wine {
        // https://github.com/ValveSoftware/Proton/blob/4221d9ef07cc38209ff93dbbbca9473581a38255/proton#L1091-L1093
        if env.truthy("ORIG_LD_LIBRARY_PATH").is_none() {
            put(
                &mut ret,
                "ORIG_LD_LIBRARY_PATH",
                env.get("LD_LIBRARY_PATH").unwrap_or(""),
            );
        }
        let lib = wine.lib.as_deref().filter(|l| !l.is_empty());
        let lib32 = wine.lib32.as_deref().filter(|l| !l.is_empty());
        if let (Some(lib), Some(lib32)) = (lib, lib32) {
            // The wine libs go at the beginning.
            let library_path = [Some(lib), Some(lib32), env.truthy("LD_LIBRARY_PATH")]
                .into_iter()
                .flatten()
                .collect::<Vec<_>>()
                .join(":");
            put(&mut ret, "LD_LIBRARY_PATH", &library_path);

            // Proton does not make sure these folders exist first; we do.
            let both_exist = |sub: &str| {
                let (a, b) = (js_join(&[lib, sub]), js_join(&[lib32, sub]));
                if exists(&a) && exists(&b) {
                    Some(format!("{}:{}", a.to_string_lossy(), b.to_string_lossy()))
                } else {
                    None
                }
            };
            if let Some(value) = both_exist("gstreamer-1.0") {
                put(&mut ret, "GST_PLUGIN_SYSTEM_PATH_1_0", &value);
            }
            if let Some(value) = both_exist("wine") {
                put(&mut ret, "WINEDLLPATH", &value);
            }
        } else if !(is_mac && lib.is_none() && lib32.is_none()) {
            // A wine with no lib paths configured (the built-in engine) is not "missing" them, and on
            // macOS this block only sets LD_LIBRARY_PATH, which dyld ignores.
            notes.push(EnvNote::WineLibFoldersMissing);
        }
    }
    if settings.advertise_avx_for_rosetta && is_mac && wine.kind == WineKind::Toolkit {
        put(&mut ret, "ROSETTA_ADVERTISE_AVX", "1");
    }
    // Workaround for the Steam Input virtual gamepad on deprecated WineGE/ProtonGE releases (<= 8.x),
    // following the SDL behaviour change in 2.30.
    if is_linux && is_deprecated_ge_name(&wine.name) {
        put(&mut ret, "SteamVirtualGamepadInfo", "");
        notes.push(EnvNote::DeprecatedGeWorkaround);
    }
    WineEnv { vars: ret, notes }
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
