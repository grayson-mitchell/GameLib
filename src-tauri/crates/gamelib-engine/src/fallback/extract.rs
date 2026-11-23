//! Contained extraction (T-87-48): `tar` through the spawn seam as a Helper, into a staging directory,
//! then a walk that refuses any symlink resolving outside it. Only after the walk passes does the
//! caller rename the directory into place.

use std::fs;
use std::path::{Component, Path, PathBuf};

use gamelib_core::process::{ProcSpec, SpecRunner};

/// The spawn's name in the registry of helpers.
pub const TAR_LABEL: &str = "engine-tar";

/// Why an extraction was refused.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExtractError {
    /// `tar` did not exit 0.
    TarFailed,
    /// A symlink resolves outside the extraction root (the text names it, as the TS did).
    Escape(String),
    /// The tree could not be walked.
    Unreadable(String),
    /// The caller's `between` hook asked to stop after `tar` ran (a cancel).
    Stopped,
}

/// `tar -xf <archive> -C <dest> --strip-components=1`. `true` when it exited 0.
///
/// The run carries no cancel token of its own, as the TS gave none: a caller's cancel waits for `tar`
/// to finish (a few seconds) and is answered `aborted during extract` after it, while a quit ends the
/// run through the app-wide shutdown token every `SpecRunner` run watches (D-17).
pub async fn run_tar(proc: &dyn SpecRunner, archive: &Path, dest: &Path) -> bool {
    let mut spec = ProcSpec::new(TAR_LABEL, "tar");
    spec.argv = vec![
        "-xf".to_string(),
        archive.to_string_lossy().into_owned(),
        "-C".to_string(),
        dest.to_string_lossy().into_owned(),
        "--strip-components=1".to_string(),
    ];
    let out = proc.run(spec, None).await;
    out.code == Some(0) && !out.cancelled
}

/// `tar`, then `between` (true: stop, the run was cancelled), then the containment walk.
pub async fn extract_contained(
    proc: &dyn SpecRunner,
    archive: &Path,
    dest: &Path,
    between: impl FnOnce() -> bool,
) -> Result<(), ExtractError> {
    let done = run_tar(proc, archive, dest).await;
    if between() {
        return Err(ExtractError::Stopped);
    }
    if !done {
        return Err(ExtractError::TarFailed);
    }
    assert_contained(dest)
}

/// `path.resolve` without touching the disk: `.` and `..` folded, an absolute `link` replacing `base`.
fn resolve(base: &Path, link: &Path) -> PathBuf {
    let joined = base.join(link);
    let mut out = PathBuf::new();
    for part in joined.components() {
        match part {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// `isContained`: `target` is `root` or below it, compared whole component by whole component.
fn is_contained(root: &Path, target: &Path) -> bool {
    resolve(Path::new("/"), target).starts_with(resolve(Path::new("/"), root))
}

/// Every symlink under `root` must resolve (as written, and really) inside `root`. A link that
/// dangles inside the root is accepted.
pub fn assert_contained(root: &Path) -> Result<(), ExtractError> {
    let real_root = fs::canonicalize(root).map_err(|e| ExtractError::Unreadable(e.to_string()))?;
    walk(root, root, &real_root)
}

fn walk(root: &Path, dir: &Path, real_root: &Path) -> Result<(), ExtractError> {
    let mut names: Vec<_> = fs::read_dir(dir)
        .map_err(|e| ExtractError::Unreadable(e.to_string()))?
        .map(|entry| entry.map(|e| e.file_name()))
        .collect::<Result<_, _>>()
        .map_err(|e| ExtractError::Unreadable(e.to_string()))?;
    names.sort();
    for name in names {
        let full = dir.join(name);
        let meta =
            fs::symlink_metadata(&full).map_err(|e| ExtractError::Unreadable(e.to_string()))?;
        if meta.file_type().is_symlink() {
            let target =
                fs::read_link(&full).map_err(|e| ExtractError::Unreadable(e.to_string()))?;
            let logical = resolve(full.parent().unwrap_or(dir), &target);
            let escapes = || {
                ExtractError::Escape(format!(
                    "symlink escapes extraction root: {}",
                    full.display()
                ))
            };
            if !is_contained(root, &logical) && !is_contained(real_root, &logical) {
                return Err(escapes());
            }
            if let Ok(real) = fs::canonicalize(&full) {
                if !is_contained(real_root, &real) {
                    return Err(escapes());
                }
            }
        } else if meta.is_dir() {
            walk(root, &full, real_root)?;
        }
    }
    Ok(())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use gamelib_testutil::FakeHome;
    use std::os::unix::fs::symlink;

    fn tree(home: &FakeHome) -> PathBuf {
        let out = home.root().join("out");
        fs::create_dir_all(out.join("bin")).unwrap();
        fs::write(out.join("bin/wine"), "x").unwrap();
        out
    }

    #[test]
    fn a_link_that_stays_inside_the_root_or_dangles_there_is_accepted() {
        let home = FakeHome::new("fallback-extract-");
        let out = tree(&home);
        symlink("wine", out.join("bin/wine64")).unwrap();
        symlink("../bin/wine", out.join("bin/again")).unwrap();
        symlink("missing", out.join("bin/dangling")).unwrap();
        assert_eq!(assert_contained(&out), Ok(()));
    }

    #[test]
    fn a_link_that_leaves_the_root_is_refused_by_its_own_path() {
        let home = FakeHome::new("fallback-extract-");
        let out = tree(&home);
        fs::create_dir_all(home.root().join("outside")).unwrap();
        symlink("../outside", out.join("evil")).unwrap();
        let Err(ExtractError::Escape(text)) = assert_contained(&out) else {
            panic!("an escaping link must be refused");
        };
        assert_eq!(
            text,
            format!(
                "symlink escapes extraction root: {}",
                out.join("evil").display()
            )
        );
    }

    #[test]
    fn an_absolute_link_and_a_link_through_a_sibling_prefix_are_refused() {
        let home = FakeHome::new("fallback-extract-");
        let out = tree(&home);
        // `out-evil` starts with the text of `out` but is not below it.
        fs::create_dir_all(home.root().join("out-evil")).unwrap();
        symlink(home.root().join("out-evil"), out.join("abs")).unwrap();
        assert!(matches!(
            assert_contained(&out),
            Err(ExtractError::Escape(_))
        ));
        fs::remove_file(out.join("abs")).unwrap();
        symlink("../out-evil", out.join("rel")).unwrap();
        assert!(matches!(
            assert_contained(&out),
            Err(ExtractError::Escape(_))
        ));
    }

    #[test]
    fn a_link_to_a_directory_that_resolves_outside_by_a_chain_is_refused() {
        let home = FakeHome::new("fallback-extract-");
        let out = tree(&home);
        fs::create_dir_all(home.root().join("elsewhere")).unwrap();
        // Written as an inside path, but `inner` is itself a link out: the real path escapes.
        symlink("../elsewhere", out.join("inner")).unwrap();
        symlink("inner", out.join("bin/chain")).unwrap();
        assert!(matches!(
            assert_contained(&out),
            Err(ExtractError::Escape(_))
        ));
    }
}
