//! Open-path / reveal policy for the `ShellOpenPath` and `ShellShowItemInFolder` channels
//! (Phase 72, D-06/D-08/D-15). The Rust side is authoritative: a compromised or buggy sidecar
//! must not be able to make the OS open a file, an executable or a `.app` bundle.
//!
//! The checks are pure and AppHandle-free so they can be proven by `#[cfg(test)]` without
//! constructing an `AppHandle` (same rationale as `sidecar.rs`). Errors are fixed literals and
//! logs name only a category, never the input (T-28-04).

use super::*;

/// Directory extensions the OS treats as launchable/installable bundles. `app` is the required
/// one; the rest are an assumption (72-RESEARCH A3) covering other bundle types Finder runs.
pub(crate) const OPEN_PATH_BUNDLE_EXTENSIONS: &[&str] = &[
    "app", "prefpane", "saver", "workflow", "action", "plugin", "bundle", "framework",
    "component", "kext", "mdimporter", "qlgenerator", "xpc", "appex", "wdgt", "pkg", "mpkg",
];

/// True when the path's extension (ASCII case-insensitive) names a launchable bundle.
pub(crate) fn is_launchable_bundle(p: &std::path::Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| {
            let e = e.to_ascii_lowercase();
            OPEN_PATH_BUNDLE_EXTENSIONS.contains(&e.as_str())
        })
        .unwrap_or(false)
}

fn shape_check(raw: &str) -> Result<&std::path::Path, String> {
    if raw.is_empty() || raw.contains('\0') {
        shell_eprintln!("[shell] path_policy: rejected empty or NUL path");
        return Err("path_policy: invalid path".to_string());
    }
    if raw.contains("://") || raw.starts_with("\\\\") || raw.starts_with("//") {
        shell_eprintln!("[shell] path_policy: rejected URL or UNC path");
        return Err("path_policy: URL or UNC path not allowed".to_string());
    }
    let p = std::path::Path::new(raw);
    if !p.is_absolute() {
        shell_eprintln!("[shell] path_policy: rejected relative path");
        return Err("path_policy: path must be absolute".to_string());
    }
    Ok(p)
}

/// Gate for opening: an absolute, existing directory that is not a launchable bundle.
/// Returns the ORIGINAL path (Windows canonicalize yields `\\?\` verbatim paths).
pub(crate) fn open_path_policy_check(raw: &str) -> Result<std::path::PathBuf, String> {
    let p = shape_check(raw)?;
    let canonical = std::fs::canonicalize(p).map_err(|_| {
        shell_eprintln!("[shell] open_path: path not found");
        "open_path: not found".to_string()
    })?;
    if !canonical.is_dir() {
        shell_eprintln!("[shell] open_path: rejected non-directory");
        return Err("open_path: not a directory".to_string());
    }
    if is_launchable_bundle(&canonical) {
        shell_eprintln!("[shell] open_path: rejected launchable bundle");
        return Err("open_path: launchable bundle not allowed".to_string());
    }
    Ok(p.to_path_buf())
}

/// Gate for revealing: an absolute, existing path (revealing never executes the target).
pub(crate) fn reveal_path_policy_check(raw: &str) -> Result<std::path::PathBuf, String> {
    let p = shape_check(raw)?;
    if std::fs::symlink_metadata(p).is_err() {
        shell_eprintln!("[shell] reveal_path: path not found");
        return Err("reveal_path: not found".to_string());
    }
    Ok(p.to_path_buf())
}

/// `ShellShowItemInFolder` body: policy check first (Rust is authoritative, D-06), then reveal
/// via the opener plugin and, on macOS, the Finder reselect follow-up.
pub(crate) fn shell_show_item_in_folder(app: &AppHandle, args: &[Value]) -> Result<Value, String> {
    let a = ShellShowItemInFolderArgs::from_args(args)?;
    reveal_path_policy_check(a.path.as_str())?;
    let path = a.path.as_str();
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    macos_finder_reselect_workaround(path);
    Ok(Value::Null)
}

/// `ShellOpenPath` body: only an existing non-bundle directory reaches the OS opener.
pub(crate) fn shell_open_path(app: &AppHandle, args: &[Value]) -> Result<Value, String> {
    let a = ShellOpenPathArgs::from_args(args)?;
    let path = open_path_policy_check(a.path.as_str())?;
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(Value::Null)
}

#[cfg(test)]
mod shell_open_tests {
    use super::*;
    use std::fs;

    const FIXTURE: &str = include_str!("../../src/common/__fixtures__/openPolicyCases.json");

    fn fixture() -> serde_json::Value {
        serde_json::from_str(FIXTURE).expect("fixture parses")
    }

    #[test]
    fn shell_open_url_cases_follow_scheme_check() {
        let f = fixture();
        let cases = f["urlCases"].as_array().unwrap();
        assert!(!cases.is_empty());
        for c in cases {
            let input = c["input"].as_str().unwrap();
            let ok = crate::relay_commands::open_external_scheme_check(input).is_ok();
            assert_eq!(ok, c["expect"] == "allow", "url case {input}");
        }
    }

    #[test]
    fn shell_open_folder_shape_cases_reject_in_both_checks() {
        let f = fixture();
        for c in f["folderShapeCases"].as_array().unwrap() {
            let input = c["input"].as_str().unwrap();
            let o = open_path_policy_check(input);
            let r = reveal_path_policy_check(input);
            assert!(o.is_err(), "open should reject {input:?}");
            assert!(r.is_err(), "reveal should reject {input:?}");
            for e in [o.unwrap_err(), r.unwrap_err()] {
                if !input.is_empty() {
                    assert!(!e.contains(input), "error echoes input");
                }
            }
        }
    }

    #[test]
    fn shell_open_filesystem_cases() {
        let root = std::env::temp_dir().join(format!("gamelib-shell-open-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let dir = root.join("plain");
        let file = root.join("file.txt");
        let app = root.join("Game.app");
        let app_upper = root.join("GAME.APP");
        fs::create_dir_all(&dir).unwrap();
        fs::write(&file, b"x").unwrap();
        fs::create_dir_all(&app).unwrap();
        fs::create_dir_all(&app_upper).unwrap();
        let missing = root.join("missing");
        let s = |p: &std::path::Path| p.to_str().unwrap().to_string();

        assert!(open_path_policy_check(&s(&dir)).is_ok());
        assert!(open_path_policy_check(&s(&file)).is_err());
        assert!(reveal_path_policy_check(&s(&file)).is_ok());
        assert!(open_path_policy_check(&s(&app)).is_err());
        assert!(reveal_path_policy_check(&s(&app)).is_ok());
        assert!(open_path_policy_check(&s(&app_upper)).is_err());
        assert!(open_path_policy_check(&s(&missing)).is_err());
        assert!(reveal_path_policy_check(&s(&missing)).is_err());
        #[cfg(unix)]
        {
            let link = root.join("link");
            std::os::unix::fs::symlink(&app, &link).unwrap();
            assert!(open_path_policy_check(&s(&link)).is_err());
        }
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn shell_open_bundle_detection_is_case_insensitive() {
        assert!(is_launchable_bundle(std::path::Path::new("/x/A.App")));
        assert!(!is_launchable_bundle(std::path::Path::new("/x/folder")));
    }

    #[test]
    fn shell_open_errors_are_fixed_literals() {
        let e = open_path_policy_check("/definitely/not/here/secret-name").unwrap_err();
        assert!(!e.contains("secret-name"));
        let e = reveal_path_policy_check("relative/secret-name").unwrap_err();
        assert!(!e.contains("secret-name"));
    }
}
