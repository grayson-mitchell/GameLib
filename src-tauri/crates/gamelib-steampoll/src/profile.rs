//! Sidecar profile paths the shell needs before the sidecar exists (plan 07, D-06/D-09).
//!
//! Pure path maths that mirrors `process/appPaths.ts` (`resolveAppDataDir`, `derivePaths`) and the
//! `CacheStore` / `FileStore` location rule (`<userData>/store_cache/<name>.json`). Proven against
//! TS-generated fixtures (`tests/fixtures/profile/app-paths.json`).
//!
//! `language()` and `default_steam_path()` read `config.json` on every call (no caching): boot
//! resume runs before the sidecar, and the user can change either setting while the app runs.

use serde_json::Value;
use std::path::PathBuf;

/// The three OS flavours the TS `resolveAppDataDir` switches on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    Darwin,
    Win32,
    Linux,
}

impl Platform {
    pub fn current() -> Platform {
        if cfg!(target_os = "macos") {
            Platform::Darwin
        } else if cfg!(windows) {
            Platform::Win32
        } else {
            Platform::Linux
        }
    }

    /// Parses the Node `process.platform` spelling the fixtures use; anything else is Linux.
    pub fn from_node(name: &str) -> Platform {
        match name {
            "darwin" => Platform::Darwin,
            "win32" => Platform::Win32,
            _ => Platform::Linux,
        }
    }

    fn sep(self) -> char {
        if self == Platform::Win32 {
            '\\'
        } else {
            '/'
        }
    }
}

/// Node `path.join` for one flavour, for the plain segments the profile uses (no `..`).
fn join(platform: Platform, base: &str, parts: &[&str]) -> String {
    let sep = platform.sep();
    let mut out = base.trim_end_matches(sep).to_string();
    for p in parts {
        out.push(sep);
        out.push_str(p);
    }
    out
}

const APP_NAME_SEGMENT: &str = "GameLib";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SidecarProfile {
    pub user_data: String,
    pub config_path: String,
    pub restart_hold_store_path: String,
    /// Set later by the shell (the bundled locales directory); empty until then.
    pub locales_dir: Option<PathBuf>,
}

impl SidecarProfile {
    /// `env_lookup` answers `APPDATA` and `XDG_CONFIG_HOME` (an empty value counts as unset, as
    /// the TS `||` does).
    pub fn resolve(
        platform: Platform,
        home: &str,
        env_lookup: &dyn Fn(&str) -> Option<String>,
    ) -> SidecarProfile {
        let non_empty = |k: &str| env_lookup(k).filter(|v| !v.is_empty());
        let app_data = match platform {
            Platform::Darwin => join(platform, home, &["Library", "Application Support"]),
            Platform::Win32 => non_empty("APPDATA")
                .unwrap_or_else(|| join(platform, home, &["AppData", "Roaming"])),
            Platform::Linux => {
                non_empty("XDG_CONFIG_HOME").unwrap_or_else(|| join(platform, home, &[".config"]))
            }
        };
        let user_data = join(platform, &app_data, &[APP_NAME_SEGMENT]);
        let config_path = join(platform, &user_data, &["config.json"]);
        let restart_hold_store_path = join(
            platform,
            &user_data,
            &["store_cache", "steam_restart_hold.json"],
        );
        SidecarProfile {
            user_data,
            config_path,
            restart_hold_store_path,
            locales_dir: None,
        }
    }

    /// The real process environment and home directory. `None` when no home can be found.
    pub fn current() -> Option<SidecarProfile> {
        let home = std::env::var("HOME")
            .ok()
            .or_else(|| std::env::var("USERPROFILE").ok())
            .filter(|h| !h.is_empty())?;
        Some(SidecarProfile::resolve(Platform::current(), &home, &|k| {
            std::env::var(k).ok()
        }))
    }

    /// `defaultSettings.<key>` as a string, read fresh. Missing file, bad JSON, wrong type and the
    /// empty string all answer `None` (callers fall back to the TS defaults).
    fn setting(&self, key: &str) -> Option<String> {
        let text = std::fs::read_to_string(&self.config_path).ok()?;
        let v: Value = serde_json::from_str(&text).ok()?;
        v.get("defaultSettings")?
            .get(key)?
            .as_str()
            .filter(|s| !s.is_empty())
            .map(str::to_string)
    }

    /// The user's UI language (`en` when `None`).
    pub fn language(&self) -> Option<String> {
        self.setting("language")
    }

    /// The configured Steam library root (the discover default when `None`).
    pub fn default_steam_path(&self) -> Option<String> {
        self.setting("defaultSteamPath")
    }
}
