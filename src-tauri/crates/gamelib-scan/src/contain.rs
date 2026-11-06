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

fn display_path(p: &Path) -> Option<String> {
    let s = p.to_str()?;
    #[cfg(windows)]
    {
        if let Some(stripped) = s.strip_prefix(r"\\?\") {
            return Some(stripped.to_string());
        }
    }
    Some(s.to_string())
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
