//! The one shared path-safety implementation (Phase 82 D-06, D-15, D-17). Pure functions over
//! paths and metadata: no env, no home directory, no logging; every root is a parameter.
//!
//! Three ideas carry it:
//! - a raw string is judged LEXICALLY first, identically on every OS (`.\x`, `C:\x` and
//!   `\\server\share\x` are relative on Unix and refused there);
//! - a path is then compared by its CANONICAL on-disk location, never by the string given;
//!   a symlink or junction is never followed (the link is the location);
//! - on a case-insensitive volume components compare NFC-normalised and case-folded, and a
//!   comparison that cannot be done is `Unknown`, which a destructive caller treats as a refusal.

use crate::tri::Probe;
use crate::wire::Reason;
use std::ffi::OsString;
use std::path::{Component, Path, PathBuf};
use unicode_normalization::UnicodeNormalization;

/// How components are compared. `Auto` probes the volume of the path being checked.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CaseMode {
    Sensitive,
    Insensitive,
    Auto,
}

/// A raw string that is absolute on this OS, with trailing separators dropped. A trailing
/// separator would make `symlink_metadata("link/")` follow the link on Unix, so it must not
/// survive into any lookup. A path that is only separators (`/`) is kept as given.
pub fn parse_absolute(raw: &str) -> Result<PathBuf, Reason> {
    if raw.contains('\0') {
        return Err(Reason::NulByte);
    }
    if raw.is_empty() {
        return Err(Reason::NotAbsolute);
    }
    let trimmed = raw.trim_end_matches(['/', '\\']);
    let cand = if trimmed.is_empty() { raw } else { trimmed };
    if !Path::new(cand).is_absolute() {
        return Err(Reason::NotAbsolute);
    }
    Ok(PathBuf::from(cand))
}

/// `parse_absolute` plus: no `.` or `..` segment when split on both `/` and `\`.
pub fn lexical_check(raw: &str) -> Result<PathBuf, Reason> {
    let p = parse_absolute(raw)?;
    if raw.split(['/', '\\']).any(|s| s == "." || s == "..") {
        return Err(Reason::DotSegment);
    }
    Ok(p)
}

/// Drop the Windows verbatim prefix: `\\?\UNC\server\share\x` -> `\\server\share\x`,
/// `\\?\C:\x` -> `C:\x`. Pure so it is tested on every platform. (Vectors ported from
/// gamelib-scan's contain.rs; this crate does not depend on it.)
pub fn strip_verbatim_prefix(s: &str) -> String {
    if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{rest}");
    }
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        return stripped.to_string();
    }
    s.to_string()
}

#[cfg(windows)]
fn has_reparse_bit(md: &std::fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    md.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}
#[cfg(not(windows))]
fn has_reparse_bit(_md: &std::fs::Metadata) -> bool {
    false
}

/// A symlink, or on Windows any reparse point (a junction is not reported by `is_symlink`).
pub fn is_link_metadata(md: &std::fs::Metadata) -> bool {
    md.file_type().is_symlink() || has_reparse_bit(md)
}

/// Where a target really is.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Location {
    /// Canonical location. For a link this is the canonical PARENT plus the link's own name:
    /// the referent is never canonicalised or inspected.
    pub path: PathBuf,
    /// Nothing exists at `path` (the nearest existing ancestor is canonical, the rest lexical).
    pub absent: bool,
    pub is_link: bool,
    /// An existing canonical directory on the same volume, for the case-sensitivity probe.
    pub probe_dir: PathBuf,
}

/// Canonical location of `p`. Any failure other than "nothing there" is
/// `Reason::CanonicalizeFailed`, which the caller reports as `Unknown`.
pub fn canonical_location(p: &Path) -> Result<Location, Reason> {
    let fail = |_| Reason::CanonicalizeFailed;
    match std::fs::symlink_metadata(p) {
        Ok(md) if is_link_metadata(&md) => {
            let parent = p.parent().ok_or(Reason::CanonicalizeFailed)?;
            let name = p.file_name().ok_or(Reason::CanonicalizeFailed)?;
            let cp = dunce::canonicalize(parent).map_err(fail)?;
            Ok(Location {
                path: cp.join(name),
                absent: false,
                is_link: true,
                probe_dir: cp,
            })
        }
        Ok(_) => {
            let c = dunce::canonicalize(p).map_err(fail)?;
            Ok(Location {
                probe_dir: c.clone(),
                path: c,
                absent: false,
                is_link: false,
            })
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => absent_location(p),
        Err(_) => Err(Reason::CanonicalizeFailed),
    }
}

/// `p` does not exist: canonicalise the nearest existing ancestor and append the missing names,
/// so containment still works. An ancestor that is not a directory (a path component that is a
/// regular file) cannot be resolved and is a failure, not "absent".
fn absent_location(p: &Path) -> Result<Location, Reason> {
    let mut tail: Vec<OsString> = Vec::new();
    let mut cur = p;
    loop {
        let name = cur.file_name().ok_or(Reason::CanonicalizeFailed)?;
        tail.push(name.to_os_string());
        cur = cur.parent().ok_or(Reason::CanonicalizeFailed)?;
        match std::fs::symlink_metadata(cur) {
            Ok(_) => {
                let base = dunce::canonicalize(cur).map_err(|_| Reason::CanonicalizeFailed)?;
                let is_dir = std::fs::metadata(&base).is_ok_and(|m| m.is_dir());
                if !is_dir {
                    return Err(Reason::CanonicalizeFailed);
                }
                let mut path = base.clone();
                for n in tail.iter().rev() {
                    path.push(n);
                }
                return Ok(Location {
                    path,
                    absent: true,
                    is_link: false,
                    probe_dir: base,
                });
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(_) => return Err(Reason::CanonicalizeFailed),
        }
    }
}

/// Component vector used for every comparison (never a string prefix). With `insensitive`
/// each component is NFC-normalised then lowercased.
pub fn fold_key(p: &Path, insensitive: bool) -> Vec<String> {
    let s = strip_verbatim_prefix(&p.to_string_lossy());
    Path::new(&s)
        .components()
        .map(|c| {
            let t = c.as_os_str().to_string_lossy().into_owned();
            if insensitive {
                t.nfc().collect::<String>().to_lowercase()
            } else {
                t
            }
        })
        .collect()
}

/// `child` lies strictly inside `parent` (component-wise; equal is not inside).
pub fn is_strictly_inside(child: &[String], parent: &[String]) -> bool {
    child.len() > parent.len() && child.starts_with(parent)
}

/// A filesystem root, drive root or UNC share root: nothing but a prefix and a root directory.
pub fn is_fs_root(p: &Path) -> bool {
    let s = strip_verbatim_prefix(&p.to_string_lossy());
    !Path::new(&s)
        .components()
        .any(|c| matches!(c, Component::Normal(_)))
}

fn flip_ascii_case(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c.is_ascii_uppercase() {
                c.to_ascii_lowercase()
            } else {
                c.to_ascii_uppercase()
            }
        })
        .collect()
}

/// Is the volume holding `dir` case-insensitive? Read-only: stats the directory under a
/// case-flipped spelling and compares device and inode. Windows is always insensitive.
#[cfg(windows)]
pub fn probe_case_insensitive(_dir: &Path) -> Probe<bool> {
    Probe::Present(true)
}

#[cfg(unix)]
pub fn probe_case_insensitive(dir: &Path) -> Probe<bool> {
    use std::os::unix::fs::MetadataExt;
    let comps: Vec<Component> = dir.components().collect();
    let Some(idx) = comps.iter().rposition(|c| match c {
        Component::Normal(n) => n
            .to_str()
            .is_some_and(|s| s.chars().any(|ch| ch.is_ascii_alphabetic())),
        _ => false,
    }) else {
        return Probe::Unreadable("no-letters".into());
    };
    let mut alt = PathBuf::new();
    for (i, c) in comps.iter().enumerate() {
        match (i == idx, c) {
            (true, Component::Normal(n)) => alt.push(flip_ascii_case(&n.to_string_lossy())),
            _ => alt.push(c.as_os_str()),
        }
    }
    let orig = match std::fs::symlink_metadata(dir) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Probe::Absent,
        Err(e) => return Probe::Unreadable(format!("{:?}", e.kind())),
    };
    match std::fs::symlink_metadata(&alt) {
        Ok(other) => Probe::Present(orig.dev() == other.dev() && orig.ino() == other.ino()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Probe::Present(false),
        Err(e) => Probe::Unreadable(format!("{:?}", e.kind())),
    }
}

#[cfg(not(any(unix, windows)))]
pub fn probe_case_insensitive(_dir: &Path) -> Probe<bool> {
    Probe::Unreadable("unsupported-platform".into())
}

/// Resolve a `CaseMode` for one comparison. When the volume probe cannot answer, the STRICT
/// direction for that comparison is used: containment and trust-root checks pass `false`
/// (harder to be "inside"), known-install and protected-root checks pass `true` (more
/// equalities, so more refusals).
pub fn resolve_insensitive(mode: CaseMode, probe_dir: &Path, strict_insensitive: bool) -> bool {
    match mode {
        CaseMode::Sensitive => false,
        CaseMode::Insensitive => true,
        CaseMode::Auto => match probe_case_insensitive(probe_dir) {
            Probe::Present(b) => b,
            _ => strict_insensitive,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verbatim_prefix_strips_to_plain_form() {
        assert_eq!(
            strip_verbatim_prefix(r"\\?\UNC\server\share\game\a.exe"),
            r"\\server\share\game\a.exe"
        );
        assert_eq!(
            strip_verbatim_prefix(r"\\?\C:\Games\a.exe"),
            r"C:\Games\a.exe"
        );
        assert_eq!(strip_verbatim_prefix("/games/a.exe"), "/games/a.exe");
        assert_eq!(
            strip_verbatim_prefix(r"\\server\share\x"),
            r"\\server\share\x"
        );
    }

    #[test]
    fn lexical_refuses_empty_nul_relative_and_dot_segments() {
        assert_eq!(lexical_check(""), Err(Reason::NotAbsolute));
        assert_eq!(lexical_check("a\0b"), Err(Reason::NulByte));
        assert_eq!(lexical_check("games/x"), Err(Reason::NotAbsolute));
        assert_eq!(lexical_check(r".\x"), Err(Reason::NotAbsolute));
        assert_eq!(lexical_check(r"..\x"), Err(Reason::NotAbsolute));
        assert_eq!(lexical_check(r"\\"), Err(Reason::NotAbsolute));
    }

    #[cfg(unix)]
    #[test]
    fn lexical_unix_absolute_and_dot_segments() {
        assert!(lexical_check("/games/x").is_ok());
        assert_eq!(lexical_check("/games/./x"), Err(Reason::DotSegment));
        assert_eq!(lexical_check("/games/../x"), Err(Reason::DotSegment));
        assert_eq!(lexical_check(r"/games\..\x"), Err(Reason::DotSegment));
        assert_eq!(lexical_check(r"C:\x"), Err(Reason::NotAbsolute));
        assert_eq!(lexical_check(r"\\server\share\x"), Err(Reason::NotAbsolute));
        assert_eq!(
            lexical_check(r"\\?\UNC\server\share\x"),
            Err(Reason::NotAbsolute)
        );
    }

    #[cfg(unix)]
    #[test]
    fn trailing_separators_are_dropped_but_a_bare_root_survives() {
        assert_eq!(
            parse_absolute("/games/x///").unwrap(),
            PathBuf::from("/games/x")
        );
        assert_eq!(parse_absolute("/").unwrap(), PathBuf::from("/"));
    }

    #[test]
    fn fold_key_compares_components_not_string_prefixes() {
        let a = fold_key(Path::new("/games/Studio"), false);
        let b = fold_key(Path::new("/games/StudioTwo"), false);
        assert!(!is_strictly_inside(&b, &a));
        let c = fold_key(Path::new("/games/Studio/GameB"), false);
        assert!(is_strictly_inside(&c, &a));
        assert!(!is_strictly_inside(&a, &a));
    }

    #[test]
    fn fold_key_insensitive_folds_case_and_nfc() {
        let nfc = fold_key(Path::new("/g/Caf\u{e9}"), true);
        let nfd = fold_key(Path::new("/g/cafe\u{301}"), true);
        assert_eq!(nfc, nfd);
        let sens_nfc = fold_key(Path::new("/g/Caf\u{e9}"), false);
        let sens_nfd = fold_key(Path::new("/g/Cafe\u{301}"), false);
        assert_ne!(sens_nfc, sens_nfd);
    }

    #[test]
    fn fold_key_strips_verbatim_prefix() {
        assert_eq!(
            fold_key(Path::new(r"\\?\UNC\server\share\x"), false),
            fold_key(Path::new(r"\\server\share\x"), false)
        );
    }

    #[cfg(unix)]
    #[test]
    fn fs_root_detection() {
        assert!(is_fs_root(Path::new("/")));
        assert!(!is_fs_root(Path::new("/games")));
    }

    #[test]
    fn existing_directory_has_a_canonical_location() {
        let dir = tempfile::tempdir().unwrap();
        let loc = canonical_location(dir.path()).unwrap();
        assert!(!loc.absent && !loc.is_link);
        assert_eq!(loc.path, dunce::canonicalize(dir.path()).unwrap());
    }

    #[test]
    fn absent_target_keeps_the_canonical_ancestor() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("missing").join("deeper");
        let loc = canonical_location(&p).unwrap();
        assert!(loc.absent);
        assert_eq!(
            loc.path,
            dunce::canonicalize(dir.path())
                .unwrap()
                .join("missing")
                .join("deeper")
        );
    }

    #[test]
    fn a_regular_file_in_the_path_is_a_failure_not_absence() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("file");
        std::fs::write(&f, b"x").unwrap();
        assert_eq!(
            canonical_location(&f.join("child")),
            Err(Reason::CanonicalizeFailed)
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_link_location_is_parent_plus_name_and_the_referent_is_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let victim = dir.path().join("victim");
        std::fs::create_dir(&victim).unwrap();
        let link = dir.path().join("link");
        std::os::unix::fs::symlink(&victim, &link).unwrap();
        let loc = canonical_location(&link).unwrap();
        assert!(loc.is_link && !loc.absent);
        assert_eq!(
            loc.path,
            dunce::canonicalize(dir.path()).unwrap().join("link")
        );
    }

    #[test]
    fn resolve_insensitive_uses_the_strict_direction_when_unreadable() {
        let gone = Path::new("/definitely/not/here/xyz");
        assert!(!resolve_insensitive(CaseMode::Sensitive, gone, true));
        assert!(resolve_insensitive(CaseMode::Insensitive, gone, false));
        #[cfg(unix)]
        {
            assert!(resolve_insensitive(CaseMode::Auto, gone, true));
            assert!(!resolve_insensitive(CaseMode::Auto, gone, false));
        }
    }

    #[test]
    fn probe_answers_on_a_real_directory() {
        let dir = tempfile::tempdir().unwrap();
        let canon = dunce::canonicalize(dir.path()).unwrap();
        let p = probe_case_insensitive(&canon);
        assert!(matches!(p, Probe::Present(_)), "{p:?}");
    }
}
