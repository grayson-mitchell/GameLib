//! Realpath containment (D-10). Mirrors drmScanExe.ts `containedReal`: contained iff the
//! canonical path is strictly inside the canonical root, and the first relative component
//! does not start with `..` (the TS `rel.startsWith('..')` quirk).

use serde::Serialize;
use std::path::{Component, Path};

#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ContainReason {
    RootUnresolvable,
    RealpathFailed,
    Escapes,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ContainedReal {
    pub real: Option<String>,
    pub reason: Option<ContainReason>,
}

fn refuse(reason: ContainReason) -> ContainedReal {
    ContainedReal {
        real: None,
        reason: Some(reason),
    }
}

/// Drop the Windows verbatim prefix `std::fs::canonicalize` adds, matching Node `realpath`:
/// `\\?\UNC\server\share\x` -> `\\server\share\x` (63 WR-03: stripping only `\\?\` left the
/// relative `UNC\server\...`), `\\?\C:\x` -> `C:\x`. Pure so it is tested on every platform.
#[cfg_attr(not(windows), allow(dead_code))]
fn strip_verbatim_prefix(s: &str) -> String {
    if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{rest}");
    }
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        return stripped.to_string();
    }
    s.to_string()
}

fn display_path(p: &Path) -> Option<String> {
    let s = p.to_str()?;
    #[cfg(windows)]
    let s = strip_verbatim_prefix(s);
    #[cfg(not(windows))]
    let s = s.to_string();
    Some(s)
}

pub fn contained_real(path: &Path, root_dir: &Path) -> ContainedReal {
    let root_real = match std::fs::canonicalize(root_dir) {
        Ok(r) => r,
        Err(_) => return refuse(ContainReason::RootUnresolvable),
    };
    let real = match std::fs::canonicalize(path) {
        Ok(r) => r,
        Err(_) => return refuse(ContainReason::RealpathFailed),
    };
    let rel = match real.strip_prefix(&root_real) {
        Ok(r) => r,
        Err(_) => return refuse(ContainReason::Escapes),
    };
    let first = match rel.components().next() {
        Some(c) => c,
        None => return refuse(ContainReason::Escapes),
    };
    if let Component::Normal(name) = first {
        if name.to_string_lossy().starts_with("..") {
            return refuse(ContainReason::Escapes);
        }
    }
    match display_path(&real) {
        Some(s) => ContainedReal {
            real: Some(s),
            reason: None,
        },
        None => refuse(ContainReason::RealpathFailed),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verbatim_prefix_strips_to_node_realpath_form() {
        assert_eq!(
            strip_verbatim_prefix(r"\\?\UNC\server\share\game\a.exe"),
            r"\\server\share\game\a.exe"
        );
        assert_eq!(
            strip_verbatim_prefix(r"\\?\C:\Games\a.exe"),
            r"C:\Games\a.exe"
        );
        assert_eq!(strip_verbatim_prefix("/games/a.exe"), "/games/a.exe");
    }

    /// 63 WR-03: on Windows a UNC canonical path displays as an absolute `\\server\share`
    /// path, never the relative `UNC\server\...`.
    #[cfg(windows)]
    #[test]
    fn display_path_keeps_unc_absolute() {
        let p = Path::new(r"\\?\UNC\server\share\a.exe");
        let shown = display_path(p).unwrap();
        assert_eq!(shown, r"\\server\share\a.exe");
        assert!(Path::new(&shown).is_absolute());
    }

    #[test]
    fn file_inside_root_returns_real() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("a.exe");
        std::fs::write(&f, b"x").unwrap();
        let r = contained_real(&f, dir.path());
        assert!(r.real.is_some());
        assert_eq!(r.reason, None);
    }

    #[test]
    fn root_equal_to_path_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let r = contained_real(dir.path(), dir.path());
        assert_eq!(r.reason, Some(ContainReason::Escapes));
        assert_eq!(r.real, None);
    }

    #[cfg(unix)]
    #[test]
    fn symlink_escape_is_refused() {
        let outside = tempfile::tempdir().unwrap();
        let target = outside.path().join("secret.exe");
        std::fs::write(&target, b"x").unwrap();
        let root = tempfile::tempdir().unwrap();
        let link = root.path().join("link.exe");
        std::os::unix::fs::symlink(&target, &link).unwrap();
        let r = contained_real(&link, root.path());
        assert_eq!(r.reason, Some(ContainReason::Escapes));
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_root_ancestor_resolves_inside() {
        let base = tempfile::tempdir().unwrap();
        let real_root = base.path().join("real");
        std::fs::create_dir(&real_root).unwrap();
        std::fs::write(real_root.join("g.exe"), b"x").unwrap();
        let alias = base.path().join("alias");
        std::os::unix::fs::symlink(&real_root, &alias).unwrap();
        let r = contained_real(&alias.join("g.exe"), &alias);
        assert!(r.real.is_some());
    }

    #[test]
    fn missing_file_is_realpath_failed() {
        let dir = tempfile::tempdir().unwrap();
        let r = contained_real(&dir.path().join("nope.exe"), dir.path());
        assert_eq!(r.reason, Some(ContainReason::RealpathFailed));
    }

    #[test]
    fn missing_root_is_root_unresolvable() {
        let dir = tempfile::tempdir().unwrap();
        let r = contained_real(dir.path(), &dir.path().join("gone"));
        assert_eq!(r.reason, Some(ContainReason::RootUnresolvable));
    }

    #[test]
    fn dotdot_prefixed_child_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("..foo");
        std::fs::write(&f, b"x").unwrap();
        let r = contained_real(&f, dir.path());
        assert_eq!(r.reason, Some(ContainReason::Escapes));
    }
}
