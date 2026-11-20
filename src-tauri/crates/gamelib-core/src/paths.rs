//! Profile path maths, shared by every crate that must find the app's data before the sidecar is up.
//!
//! Mirrors `process/appPaths.ts` (`resolveAppDataDir`, `derivePaths`) and the `CacheStore` /
//! `FileStore` location rule (`<userData>/store_cache/<name>.json`). Pure: the environment and the
//! home directory are injected, nothing here reads either.

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

/// Node `path.join` for one flavour, for the plain segments the profile uses (no `..`). Built
/// segment by segment with the flavour's own separator, so a Windows path is right on any host.
pub fn join(platform: Platform, base: &str, parts: &[&str]) -> String {
    let sep = platform.sep();
    let mut out = base.trim_end_matches(sep).to_string();
    for p in parts {
        out.push(sep);
        out.push_str(p);
    }
    out
}

const APP_NAME_SEGMENT: &str = "GameLib";

/// The locations derived from the app-data directory.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppPaths {
    pub user_data: String,
    pub config_path: String,
    pub store_cache_dir: String,
}

/// `env_lookup` answers `APPDATA` and `XDG_CONFIG_HOME` (an empty value counts as unset, as the
/// TS `||` does).
pub fn resolve(
    platform: Platform,
    home: &str,
    env_lookup: &dyn Fn(&str) -> Option<String>,
) -> AppPaths {
    let non_empty = |k: &str| env_lookup(k).filter(|v| !v.is_empty());
    let app_data = match platform {
        Platform::Darwin => join(platform, home, &["Library", "Application Support"]),
        Platform::Win32 => {
            non_empty("APPDATA").unwrap_or_else(|| join(platform, home, &["AppData", "Roaming"]))
        }
        Platform::Linux => {
            non_empty("XDG_CONFIG_HOME").unwrap_or_else(|| join(platform, home, &[".config"]))
        }
    };
    let user_data = join(platform, &app_data, &[APP_NAME_SEGMENT]);
    let config_path = join(platform, &user_data, &["config.json"]);
    let store_cache_dir = join(platform, &user_data, &["store_cache"]);
    AppPaths {
        user_data,
        config_path,
        store_cache_dir,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn none(_: &str) -> Option<String> {
        None
    }

    #[test]
    fn darwin_uses_library_application_support() {
        let p = resolve(Platform::Darwin, "/Users/u", &none);
        assert_eq!(p.user_data, "/Users/u/Library/Application Support/GameLib");
        assert_eq!(
            p.config_path,
            "/Users/u/Library/Application Support/GameLib/config.json"
        );
        assert_eq!(
            p.store_cache_dir,
            "/Users/u/Library/Application Support/GameLib/store_cache"
        );
    }

    #[test]
    fn windows_prefers_appdata_and_falls_back_to_roaming() {
        let env = |k: &str| (k == "APPDATA").then(|| "D:\\Roam\\".to_string());
        let p = resolve(Platform::Win32, "C:\\Users\\u", &env);
        assert_eq!(p.user_data, "D:\\Roam\\GameLib");
        assert_eq!(p.store_cache_dir, "D:\\Roam\\GameLib\\store_cache");
        let p = resolve(Platform::Win32, "C:\\Users\\u", &none);
        assert_eq!(p.user_data, "C:\\Users\\u\\AppData\\Roaming\\GameLib");
        assert_eq!(
            p.config_path,
            "C:\\Users\\u\\AppData\\Roaming\\GameLib\\config.json"
        );
    }

    #[test]
    fn linux_prefers_xdg_config_home_and_falls_back_to_dot_config() {
        let env = |k: &str| (k == "XDG_CONFIG_HOME").then(|| "/x/cfg".to_string());
        assert_eq!(
            resolve(Platform::Linux, "/home/u", &env).user_data,
            "/x/cfg/GameLib"
        );
        let p = resolve(Platform::Linux, "/home/u", &none);
        assert_eq!(p.user_data, "/home/u/.config/GameLib");
        assert_eq!(p.store_cache_dir, "/home/u/.config/GameLib/store_cache");
    }

    #[test]
    fn an_empty_env_value_counts_as_unset() {
        let empty = |_: &str| Some(String::new());
        assert_eq!(
            resolve(Platform::Linux, "/home/u", &empty).user_data,
            "/home/u/.config/GameLib"
        );
        assert_eq!(
            resolve(Platform::Win32, "C:\\Users\\u", &empty).user_data,
            "C:\\Users\\u\\AppData\\Roaming\\GameLib"
        );
    }

    #[test]
    fn joins_are_built_segment_by_segment_with_the_flavours_separator() {
        assert_eq!(join(Platform::Win32, "C:\\a\\", &["b", "c"]), "C:\\a\\b\\c");
        assert_eq!(join(Platform::Linux, "/a/", &["b", "c"]), "/a/b/c");
        // A Windows path built on any host never gains a forward slash.
        assert!(!join(Platform::Win32, "C:\\a", &["b"]).contains('/'));
    }

    #[test]
    fn from_node_maps_the_node_spellings_and_defaults_to_linux() {
        assert_eq!(Platform::from_node("darwin"), Platform::Darwin);
        assert_eq!(Platform::from_node("win32"), Platform::Win32);
        assert_eq!(Platform::from_node("freebsd"), Platform::Linux);
    }
}
