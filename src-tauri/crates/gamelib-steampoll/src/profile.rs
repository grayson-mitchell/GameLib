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

pub use gamelib_core::paths::Platform;
use gamelib_core::paths::{join, resolve as resolve_app_paths};

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
        let paths = resolve_app_paths(platform, home, env_lookup);
        let restart_hold_store_path = join(
            platform,
            &paths.store_cache_dir,
            &["steam_restart_hold.json"],
        );
        SidecarProfile {
            user_data: paths.user_data,
            config_path: paths.config_path,
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
