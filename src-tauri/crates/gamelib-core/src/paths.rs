//! Profile path maths, shared by every crate that must find the app's data before the sidecar is up.
//!
//! Mirrors `process/appPaths.ts` (`resolveAppDataDir`, `derivePaths`) and the `CacheStore` /
//! `store_backend.ts` location rule (`<userData>/store_cache/<name>.json`). Pure: the environment
//! and the home directory are injected, nothing here reads either.

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

/// The runners a log file can belong to. `Comet` has a runner log (`runners/comet.log`) but no
/// game logs: `log_file` refuses it as a game runner.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogRunner {
    Legendary,
    Gog,
    Nile,
    Sideload,
    Steam,
    Comet,
}

impl LogRunner {
    pub fn as_str(self) -> &'static str {
        match self {
            LogRunner::Legendary => "legendary",
            LogRunner::Gog => "gog",
            LogRunner::Nile => "nile",
            LogRunner::Sideload => "sideload",
            LogRunner::Steam => "steam",
            LogRunner::Comet => "comet",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Option<LogRunner> {
        Some(match s {
            "legendary" => LogRunner::Legendary,
            "gog" => LogRunner::Gog,
            "nile" => LogRunner::Nile,
            "sideload" => LogRunner::Sideload,
            "steam" => LogRunner::Steam,
            "comet" => LogRunner::Comet,
            _ => return None,
        })
    }
}

/// Which game log: `launch` by default in the TS `getLogFilePath`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GameLogType {
    Launch,
    Install,
    Import,
    Repair,
    Update,
    Setup,
}

impl GameLogType {
    pub fn as_str(self) -> &'static str {
        match self {
            GameLogType::Launch => "launch",
            GameLogType::Install => "install",
            GameLogType::Import => "import",
            GameLogType::Repair => "repair",
            GameLogType::Update => "update",
            GameLogType::Setup => "setup",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Option<GameLogType> {
        Some(match s {
            "launch" => GameLogType::Launch,
            "install" => GameLogType::Install,
            "import" => GameLogType::Import,
            "repair" => GameLogType::Repair,
            "update" => GameLogType::Update,
            "setup" => GameLogType::Setup,
            _ => return None,
        })
    }
}

/// A typed log destination. Only these cross the trust boundary, never a path (D-20).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LogTarget {
    General,
    Runner(LogRunner),
    Game {
        app_name: String,
        runner: LogRunner,
        kind: GameLogType,
    },
    GogRedist,
}

/// Why a `LogTarget` could not become a path.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogPathError {
    EmptySegment,
    Separator,
    DotDot,
    Nul,
    TooLong,
    CometGame,
}

/// The longest appName the log path accepts, in bytes (one file name component).
const APP_NAME_MAX_BYTES: usize = 255;

fn validate_app_name(app_name: &str) -> Result<(), LogPathError> {
    if app_name.is_empty() {
        return Err(LogPathError::EmptySegment);
    }
    if app_name.len() > APP_NAME_MAX_BYTES {
        return Err(LogPathError::TooLong);
    }
    if app_name.contains('\0') {
        return Err(LogPathError::Nul);
    }
    if app_name.contains('/') || app_name.contains('\\') {
        return Err(LogPathError::Separator);
    }
    if app_name.contains("..") {
        return Err(LogPathError::DotDot);
    }
    Ok(())
}

/// The base directory for all logs (`getBaseLogPath`). An empty env value counts as unset, which
/// is a deliberate change from the TS `??`.
pub fn log_dir(
    platform: Platform,
    home: &str,
    env_lookup: &dyn Fn(&str) -> Option<String>,
) -> String {
    let non_empty = |k: &str| env_lookup(k).filter(|v| !v.is_empty());
    match platform {
        Platform::Darwin => join(platform, home, &["Library", "Logs", APP_NAME_SEGMENT]),
        Platform::Win32 => {
            let base = non_empty("LOCALAPPDATA")
                .unwrap_or_else(|| join(platform, home, &["AppData", "Local"]));
            join(platform, &base, &[APP_NAME_SEGMENT, "logs"])
        }
        Platform::Linux => {
            let base = non_empty("XDG_STATE_HOME")
                .unwrap_or_else(|| join(platform, home, &[".local", "state"]));
            join(platform, &base, &[APP_NAME_SEGMENT, "logs"])
        }
    }
}

/// The file a target writes to. `user_data` is `resolve(..).user_data` (what TS calls appFolder);
/// only `GogRedist` lives there. Every path is built segment by segment.
pub fn log_file(
    platform: Platform,
    log_dir: &str,
    user_data: &str,
    target: &LogTarget,
) -> Result<String, LogPathError> {
    match target {
        LogTarget::General => Ok(join(platform, log_dir, &["gamelib.log"])),
        LogTarget::Runner(r) => {
            let file = format!("{}.log", r.as_str());
            Ok(join(platform, log_dir, &["runners", &file]))
        }
        LogTarget::Game {
            app_name,
            runner,
            kind,
        } => {
            validate_app_name(app_name)?;
            if *runner == LogRunner::Comet {
                return Err(LogPathError::CometGame);
            }
            let dir = format!("{}_{}", app_name, runner.as_str());
            let file = format!("{}.log", kind.as_str());
            Ok(join(platform, log_dir, &["games", &dir, &file]))
        }
        LogTarget::GogRedist => Ok(join(
            platform,
            user_data,
            &["GamesConfig", "gog-redist.log"],
        )),
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

    #[test]
    fn log_dir_per_platform() {
        assert_eq!(
            log_dir(Platform::Darwin, "/Users/u", &none),
            "/Users/u/Library/Logs/GameLib"
        );
        assert_eq!(
            log_dir(Platform::Win32, "C:\\Users\\u", &none),
            "C:\\Users\\u\\AppData\\Local\\GameLib\\logs"
        );
        assert_eq!(
            log_dir(Platform::Linux, "/home/u", &none),
            "/home/u/.local/state/GameLib/logs"
        );
        let win = |k: &str| (k == "LOCALAPPDATA").then(|| "D:\\Local".to_string());
        assert_eq!(
            log_dir(Platform::Win32, "C:\\Users\\u", &win),
            "D:\\Local\\GameLib\\logs"
        );
        let xdg = |k: &str| (k == "XDG_STATE_HOME").then(|| "/x/state".to_string());
        assert_eq!(
            log_dir(Platform::Linux, "/home/u", &xdg),
            "/x/state/GameLib/logs"
        );
    }

    #[test]
    fn log_dir_treats_empty_localappdata_and_xdg_state_home_as_unset() {
        let empty = |_: &str| Some(String::new());
        assert_eq!(
            log_dir(Platform::Win32, "C:\\Users\\u", &empty),
            "C:\\Users\\u\\AppData\\Local\\GameLib\\logs"
        );
        assert_eq!(
            log_dir(Platform::Linux, "/home/u", &empty),
            "/home/u/.local/state/GameLib/logs"
        );
    }

    fn game(app: &str, runner: LogRunner) -> LogTarget {
        LogTarget::Game {
            app_name: app.to_string(),
            runner,
            kind: GameLogType::Launch,
        }
    }

    #[test]
    fn log_file_builds_each_target_with_the_flavours_separator() {
        let lp = Platform::Linux;
        assert_eq!(
            log_file(lp, "/l", "/ud", &LogTarget::General).as_deref(),
            Ok("/l/gamelib.log")
        );
        assert_eq!(
            log_file(lp, "/l", "/ud", &LogTarget::Runner(LogRunner::Comet)).as_deref(),
            Ok("/l/runners/comet.log")
        );
        assert_eq!(
            log_file(lp, "/l", "/ud", &game("480", LogRunner::Steam)).as_deref(),
            Ok("/l/games/480_steam/launch.log")
        );
        assert_eq!(
            log_file(lp, "/l", "/ud", &LogTarget::GogRedist).as_deref(),
            Ok("/ud/GamesConfig/gog-redist.log")
        );
        let w = Platform::Win32;
        assert_eq!(
            log_file(w, "C:\\l", "C:\\ud", &game("a b", LogRunner::Gog)).as_deref(),
            Ok("C:\\l\\games\\a b_gog\\launch.log")
        );
        assert_eq!(
            log_file(w, "C:\\l", "C:\\ud", &LogTarget::GogRedist).as_deref(),
            Ok("C:\\ud\\GamesConfig\\gog-redist.log")
        );
    }

    #[test]
    fn log_file_rejects_each_bad_app_name_and_comet_games() {
        let p = Platform::Linux;
        let err = |t: &LogTarget| log_file(p, "/l", "/ud", t).unwrap_err();
        assert_eq!(err(&game("", LogRunner::Steam)), LogPathError::EmptySegment);
        assert_eq!(err(&game("a/b", LogRunner::Steam)), LogPathError::Separator);
        assert_eq!(
            err(&game("a\\b", LogRunner::Steam)),
            LogPathError::Separator
        );
        assert_eq!(err(&game("a\0b", LogRunner::Steam)), LogPathError::Nul);
        assert_eq!(err(&game("..", LogRunner::Steam)), LogPathError::DotDot);
        assert_eq!(err(&game("a..b", LogRunner::Steam)), LogPathError::DotDot);
        assert_eq!(
            err(&game(&"x".repeat(256), LogRunner::Steam)),
            LogPathError::TooLong
        );
        assert!(log_file(p, "/l", "/ud", &game(&"x".repeat(255), LogRunner::Steam)).is_ok());
        assert_eq!(err(&game("480", LogRunner::Comet)), LogPathError::CometGame);
    }

    #[test]
    fn log_enums_round_trip_their_strings() {
        for r in ["legendary", "gog", "nile", "sideload", "steam", "comet"] {
            assert_eq!(LogRunner::from_str(r).map(LogRunner::as_str), Some(r));
        }
        for t in ["launch", "install", "import", "repair", "update", "setup"] {
            assert_eq!(GameLogType::from_str(t).map(GameLogType::as_str), Some(t));
        }
        assert_eq!(LogRunner::from_str("epic"), None);
        assert_eq!(GameLogType::from_str("crash"), None);
    }
}
