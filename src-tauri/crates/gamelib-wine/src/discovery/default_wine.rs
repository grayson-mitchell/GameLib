//! `getDefaultWineBinary`: the first `wine` on `PATH` (D-25 (b)).

use std::path::Path;

use crate::wine_cmd::{WineInstallation, WineKind};

/// Not implemented yet (RED stub): answers `Default Wine - Not Found` for every `PATH`.
pub fn default_wine_from_path(
    _path_var: Option<&str>,
    _is_executable: &dyn Fn(&Path) -> bool,
    _exists: &dyn Fn(&Path) -> bool,
) -> WineInstallation {
    WineInstallation {
        bin: String::new(),
        name: "Default Wine - Not Found".to_string(),
        kind: WineKind::Wine,
        lib: None,
        lib32: None,
        wineserver: None,
    }
}

/// Not implemented yet (RED stub).
pub fn is_executable_file(_path: &Path) -> bool {
    false
}
