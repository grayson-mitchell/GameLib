//! `validWine` (`launcher.ts`): whether the wine a game is set to use can run, by the existence of
//! the binaries its type needs. Nothing is executed and nothing is logged.
//!
//! D-19 notes (87-08 findings, ported as the TS behaves, pinned by `valid_wine.json`):
//! - the binary is tested as stored, quotes included, so a wine whose `bin` is `'/path'` is invalid;
//! - only a `wine` type needs its `wineserver`; a proton or crossover `wineserver` is never checked,
//!   and a wine whose `wineserver` is absent or empty is invalid;
//! - the macOS version check compares the Darwin kernel major to 14, so every macOS from 10.10 passes.

use super::{WineInstallation, WineKind};
use gamelib_engine::ctx::Platform;
use std::path::Path;

/// Whether `wine` exists on disk as its type requires. `None` (no wine selected) is `false`.
/// `exists` is `Path::exists` in production; a test injects its own. `darwin_release` is the kernel
/// release the shell reads (only a toolkit on macOS looks at it).
pub fn valid_wine(
    wine: Option<&WineInstallation>,
    platform: Platform,
    darwin_release: Option<&str>,
    exists: &dyn Fn(&Path) -> bool,
) -> bool {
    let Some(wine) = wine else {
        return false;
    };
    let present = |binary: &str| exists(Path::new(binary));
    let have_all = match wine.kind {
        WineKind::Wine => present(&wine.bin) && wine.wineserver.as_deref().is_some_and(present),
        _ => present(&wine.bin),
    };

    if platform == Platform::Mac
        && wine.kind == WineKind::Toolkit
        && !is_mac_sonoma_or_higher(platform, darwin_release)
    {
        return false;
    }

    have_all
}

/// `isMacSonomaOrHigher`: on macOS, the major of the Darwin release is at least 14. Any other OS,
/// an unknown release or one whose major is not a number is `false`.
pub fn is_mac_sonoma_or_higher(platform: Platform, darwin_release: Option<&str>) -> bool {
    if platform != Platform::Mac {
        return false;
    }
    darwin_release
        .and_then(|release| release.split('.').next())
        .and_then(|major| major.trim().parse::<u64>().ok())
        .is_some_and(|major| major >= 14)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wine(kind: WineKind, wineserver: Option<&str>) -> WineInstallation {
        WineInstallation {
            bin: "/w/bin/wine".into(),
            name: "W".into(),
            kind,
            lib: None,
            lib32: None,
            wineserver: wineserver.map(str::to_string),
        }
    }

    fn all(_: &Path) -> bool {
        true
    }

    #[test]
    fn a_missing_wine_is_invalid() {
        assert!(!valid_wine(None, Platform::Linux, None, &all));
    }

    #[test]
    fn only_a_wine_type_needs_its_wineserver() {
        let only_bin = |p: &Path| p == Path::new("/w/bin/wine");
        assert!(!valid_wine(
            Some(&wine(WineKind::Wine, Some("/w/bin/wineserver"))),
            Platform::Linux,
            None,
            &only_bin
        ));
        assert!(!valid_wine(
            Some(&wine(WineKind::Wine, None)),
            Platform::Linux,
            None,
            &only_bin
        ));
        assert!(valid_wine(
            Some(&wine(WineKind::Proton, None)),
            Platform::Linux,
            None,
            &only_bin
        ));
    }

    #[test]
    fn the_toolkit_needs_darwin_14_on_macos_only() {
        let toolkit = wine(WineKind::Toolkit, None);
        for (platform, release, expected) in [
            (Platform::Mac, Some("14.0.0"), true),
            (Platform::Mac, Some("24.1.0"), true),
            (Platform::Mac, Some("13.6.0"), false),
            (Platform::Mac, Some("x"), false),
            (Platform::Mac, None, false),
            (Platform::Linux, Some("13.6.0"), true),
            (Platform::Linux, None, true),
        ] {
            assert_eq!(
                valid_wine(Some(&toolkit), platform, release, &all),
                expected,
                "{platform:?} {release:?}"
            );
        }
    }
}
