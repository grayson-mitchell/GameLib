//! The closed sets of log levels and prefixes (`constants.ts` plus the Rust-only `Shell`).

/// `LogLevel` in `constants.ts`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Level {
    Debug,
    Info,
    Warning,
    Error,
}

impl Level {
    pub const ALL: [Level; 4] = [Level::Debug, Level::Info, Level::Warning, Level::Error];

    pub fn as_str(self) -> &'static str {
        match self {
            Level::Debug => "DEBUG",
            Level::Info => "INFO",
            Level::Warning => "WARNING",
            Level::Error => "ERROR",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Option<Level> {
        Level::ALL.into_iter().find(|l| l.as_str() == s)
    }
}

/// `LogPrefix` in `constants.ts` plus `Shell` (the shell's own diagnostics, D-01). `as_str` is the TS
/// VALUE (the General prefix is the empty string and the `WineTricks` key's value is `Winetricks`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Prefix {
    General,
    Legendary,
    Gog,
    Nile,
    Steam,
    WineDownloader,
    ToolInstaller,
    GlobalConfig,
    GameConfig,
    ProtocolHandler,
    Frontend,
    Backend,
    Runtime,
    Shortcuts,
    WineTricks,
    Connection,
    DownloadManager,
    ExtraGameInfo,
    Sideload,
    LogUploader,
    Shell,
}

impl Prefix {
    pub const ALL: [Prefix; 21] = [
        Prefix::General,
        Prefix::Legendary,
        Prefix::Gog,
        Prefix::Nile,
        Prefix::Steam,
        Prefix::WineDownloader,
        Prefix::ToolInstaller,
        Prefix::GlobalConfig,
        Prefix::GameConfig,
        Prefix::ProtocolHandler,
        Prefix::Frontend,
        Prefix::Backend,
        Prefix::Runtime,
        Prefix::Shortcuts,
        Prefix::WineTricks,
        Prefix::Connection,
        Prefix::DownloadManager,
        Prefix::ExtraGameInfo,
        Prefix::Sideload,
        Prefix::LogUploader,
        Prefix::Shell,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Prefix::General => "",
            Prefix::Legendary => "Legendary",
            Prefix::Gog => "Gog",
            Prefix::Nile => "Nile",
            Prefix::Steam => "Steam",
            Prefix::WineDownloader => "WineDownloader",
            Prefix::ToolInstaller => "ToolInstaller",
            Prefix::GlobalConfig => "GlobalConfig",
            Prefix::GameConfig => "GameConfig",
            Prefix::ProtocolHandler => "ProtocolHandler",
            Prefix::Frontend => "Frontend",
            Prefix::Backend => "Backend",
            Prefix::Runtime => "Runtime",
            Prefix::Shortcuts => "Shortcuts",
            Prefix::WineTricks => "Winetricks",
            Prefix::Connection => "Connection",
            Prefix::DownloadManager => "DownloadManager",
            Prefix::ExtraGameInfo => "ExtraGameInfo",
            Prefix::Sideload => "Sideload",
            Prefix::LogUploader => "LogUploader",
            Prefix::Shell => "Shell",
        }
    }

    /// Parses a TS prefix VALUE (the empty string is General).
    pub fn from_value(s: &str) -> Option<Prefix> {
        Prefix::ALL.into_iter().find(|p| p.as_str() == s)
    }
}

/// `MaxLogLevelLength`: the longest level name (`WARNING`).
pub const MAX_LEVEL_LEN: usize = 7;
/// `MaxLogPrefixLength`: the longest prefix value (`ProtocolHandler`, `DownloadManager`).
pub const MAX_PREFIX_LEN: usize = 15;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_padding_constants_equal_the_max_over_the_closed_sets() {
        let level = Level::ALL.iter().map(|l| l.as_str().len()).max();
        assert_eq!(level, Some(MAX_LEVEL_LEN));
        let prefix = Prefix::ALL.iter().map(|p| p.as_str().len()).max();
        assert_eq!(prefix, Some(MAX_PREFIX_LEN));
    }

    #[test]
    fn values_round_trip_and_shell_is_in_the_set() {
        for p in Prefix::ALL {
            assert_eq!(Prefix::from_value(p.as_str()), Some(p));
        }
        for l in Level::ALL {
            assert_eq!(Level::from_str(l.as_str()), Some(l));
        }
        assert_eq!(Prefix::from_value("Shell"), Some(Prefix::Shell));
        assert_eq!(Prefix::from_value("WineTricks"), None);
        assert_eq!(Prefix::from_value("Winetricks"), Some(Prefix::WineTricks));
        assert_eq!(Prefix::from_value("Bogus"), None);
        assert_eq!(Level::from_str("TRACE"), None);
    }

    #[test]
    fn the_closed_set_has_no_duplicate_values() {
        let mut seen: Vec<&str> = Prefix::ALL.iter().map(|p| p.as_str()).collect();
        seen.sort_unstable();
        let before = seen.len();
        seen.dedup();
        assert_eq!(seen.len(), before);
    }
}
