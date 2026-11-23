//! `getDefaultWineBinary`: the first `wine` on `PATH` (D-25 (b)). Nothing is spawned: the version
//! string is resolved later by the Linux set, and until then the name is the binary's own.

use std::path::Path;

use crate::wine_cmd::{js_dirname, js_join, WineInstallation, WineKind};

/// The installation `getDefaultWineBinary` answers: the first `wine` in the `PATH` directories that
/// `is_executable` accepts, as `{bin, name: basename, type: wine, wineserver}` (a symlink is reported
/// as the link, not its target, and the `wineserver` is the sibling of the link, `""` when `exists`
/// finds none). No `wine` on `PATH`, or an unset `PATH`, is `{bin: "", name: "Default Wine - Not
/// Found", type: wine}`.
///
/// The crate reads no environment: `path_var` is the process `PATH` the shell read (`None`: unset), and
/// the two probes are [`is_executable_file`] and `Path::exists` in production, a test's own otherwise.
/// Empty `PATH` entries are skipped, as the TS did (they are not the current directory here).
pub fn default_wine_from_path(
    path_var: Option<&str>,
    is_executable: &dyn Fn(&Path) -> bool,
    exists: &dyn Fn(&Path) -> bool,
) -> WineInstallation {
    let found = path_var
        .into_iter()
        .flat_map(|path| std::env::split_paths(path).collect::<Vec<_>>())
        .filter(|dir| !dir.as_os_str().is_empty())
        .map(|dir| js_join(&[&dir.to_string_lossy(), "wine"]))
        .find(|candidate| is_executable(candidate));

    let Some(wine_bin) = found else {
        return WineInstallation {
            bin: String::new(),
            name: "Default Wine - Not Found".to_string(),
            kind: WineKind::Wine,
            lib: None,
            lib32: None,
            wineserver: None,
        };
    };

    let bin = wine_bin.to_string_lossy().into_owned();
    let sibling = js_join(&[&js_dirname(&bin), "wineserver"]);
    WineInstallation {
        name: wine_bin
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        kind: WineKind::Wine,
        lib: None,
        lib32: None,
        wineserver: Some(if exists(&sibling) {
            sibling.to_string_lossy().into_owned()
        } else {
            String::new()
        }),
        bin,
    }
}

/// A regular file (a link is followed) that is executable: any execute bit on Unix. The TS asked the
/// kernel with `access(X_OK)`; reading the mode needs no libc and agrees for every file a `PATH` scan
/// meets (`deltas.json`, "executable-probe-is-the-mode-bits").
pub fn is_executable_file(path: &Path) -> bool {
    let Ok(metadata) = std::fs::metadata(path) else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    use std::path::PathBuf;

    fn always(_: &Path) -> bool {
        true
    }

    // POSIX PATH and path-separator fixtures (the Linux and macOS discovery rules).
    #[cfg(unix)]
    #[test]
    fn the_first_directory_that_holds_an_executable_wine_wins_and_names_its_sibling_wineserver() {
        let present = |p: &Path| p == Path::new("/b/wine") || p == Path::new("/a/wine");
        let sibling = |p: &Path| p == Path::new("/b/wineserver");
        let wine = default_wine_from_path(Some("/x:/a:/b"), &present, &sibling);
        assert_eq!(wine.bin, "/a/wine");
        assert_eq!(wine.name, "wine");
        // The sibling is looked for beside the wine that won, not beside a later one.
        assert_eq!(wine.wineserver.as_deref(), Some(""));
        let wine = default_wine_from_path(Some("/b"), &present, &sibling);
        assert_eq!(wine.wineserver.as_deref(), Some("/b/wineserver"));
    }

    #[test]
    fn an_unset_or_empty_path_and_a_path_without_wine_are_not_found() {
        for path in [None, Some(""), Some("::"), Some("/a:/b")] {
            let wine = default_wine_from_path(path, &|_| false, &always);
            assert_eq!(wine.name, "Default Wine - Not Found", "{path:?}");
            assert_eq!(wine.bin, "");
            assert_eq!(wine.wineserver, None);
        }
    }

    // POSIX PATH and path-separator fixtures (the Linux and macOS discovery rules).
    #[cfg(unix)]
    #[test]
    fn an_empty_path_entry_is_not_the_current_directory() {
        let seen: std::cell::RefCell<Vec<PathBuf>> = Default::default();
        let probe = |p: &Path| {
            seen.borrow_mut().push(p.to_path_buf());
            false
        };
        default_wine_from_path(Some(":/a:"), &probe, &always);
        assert_eq!(*seen.borrow(), [PathBuf::from("/a/wine")]);
    }

    #[cfg(unix)]
    #[test]
    fn a_file_needs_an_execute_bit_and_a_directory_is_not_a_wine() {
        use std::os::unix::fs::PermissionsExt;
        let home = gamelib_testutil::FakeHome::new("wine-default-");
        let wine = home.root().join("wine");
        std::fs::write(&wine, "").unwrap();
        std::fs::set_permissions(&wine, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert!(!is_executable_file(&wine));
        std::fs::set_permissions(&wine, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert!(is_executable_file(&wine));
        assert!(!is_executable_file(home.root()));
        assert!(!is_executable_file(&home.root().join("absent")));
    }
}
