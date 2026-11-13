//! Same-directory atomic file write shared by the ACF and `shortcuts.vdf` writers (75 D-11).

use std::fs::{File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static TMP_SEQ: AtomicU64 = AtomicU64::new(0);

/// Follow a symlinked final component (up to 40 hops, dangling targets included) so the write
/// lands on the real file instead of replacing the link (75 WR-04). A non-link path is returned
/// unchanged.
pub fn resolve_final_symlinks(path: &Path) -> PathBuf {
    let mut cur = path.to_path_buf();
    for _ in 0..40 {
        let Ok(meta) = std::fs::symlink_metadata(&cur) else {
            break;
        };
        if !meta.file_type().is_symlink() {
            break;
        }
        let Ok(link) = std::fs::read_link(&cur) else {
            break;
        };
        cur = if link.is_absolute() {
            link
        } else {
            match cur.parent() {
                Some(p) => p.join(link),
                None => link,
            }
        };
    }
    cur
}

/// Write `bytes` to a uniquely named temp file next to the (symlink-resolved) target,
/// `sync_all`, then rename over it. The temp name carries the pid and a process-wide counter and
/// is opened `create_new`, so concurrent writers never share a temp file (75 WR-03). A symlinked
/// `final_path` is written through, and an existing target's permissions are copied to the temp
/// file before the rename (Unix; 75 WR-04). On any error the temp file this call created is
/// removed and the error returned.
pub fn atomic_write(final_path: &Path, bytes: &[u8]) -> io::Result<()> {
    let invalid = || {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "path has no parent or file name",
        )
    };
    let target = resolve_final_symlinks(final_path);
    let parent = target.parent().ok_or_else(invalid)?;
    let name = target.file_name().ok_or_else(invalid)?;
    let existing_perms = std::fs::metadata(&target)
        .ok()
        .filter(|m| m.is_file())
        .map(|m| m.permissions());
    let mut tmp_name = name.to_os_string();
    tmp_name.push(format!(
        ".{}.{}.tmp",
        std::process::id(),
        TMP_SEQ.fetch_add(1, Ordering::Relaxed)
    ));
    let tmp = parent.join(tmp_name);
    let mut f: File = OpenOptions::new().write(true).create_new(true).open(&tmp)?;
    let result = (|| {
        f.write_all(bytes)?;
        #[cfg(unix)]
        if let Some(p) = existing_perms {
            f.set_permissions(p)?;
        }
        #[cfg(not(unix))]
        let _ = existing_perms;
        f.sync_all()?;
        drop(f);
        std::fs::rename(&tmp, &target)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Names of `*.tmp` files left in `dir`.
    fn temps(dir: &Path) -> Vec<String> {
        std::fs::read_dir(dir)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.ends_with(".tmp"))
            .collect()
    }

    #[test]
    fn writes_and_leaves_no_temp() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("x.vdf");
        atomic_write(&p, b"abc").unwrap();
        assert_eq!(std::fs::read(&p).unwrap(), b"abc");
        assert!(temps(d.path()).is_empty());
        atomic_write(&p, b"defg").unwrap();
        assert_eq!(std::fs::read(&p).unwrap(), b"defg");
    }

    #[test]
    fn missing_directory_errs_without_temp() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("nodir").join("x.vdf");
        assert!(atomic_write(&p, b"abc").is_err());
        assert!(!d.path().join("nodir").exists());
    }

    #[test]
    fn rename_failure_removes_temp() {
        let d = tempfile::tempdir().unwrap();
        // Final path is a non-empty directory: rename of a file over it fails.
        let p = d.path().join("target");
        std::fs::create_dir(&p).unwrap();
        std::fs::write(p.join("inner"), b"1").unwrap();
        assert!(atomic_write(&p, b"abc").is_err());
        assert!(temps(d.path()).is_empty());
    }

    #[test]
    fn rejects_pathless() {
        let e = atomic_write(Path::new("/"), b"x").unwrap_err();
        assert_eq!(e.kind(), io::ErrorKind::InvalidInput);
    }

    /// 75 WR-03: concurrent writers to one path each get their own temp file, so every write
    /// succeeds and the final file is exactly one writer's bytes (never torn, never ENOENT).
    #[test]
    fn concurrent_writers_never_tear_or_fail() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("shortcuts.vdf");
        let payloads: Vec<Vec<u8>> = (0..8u8).map(|i| vec![b'a' + i; 256 * 1024]).collect();
        std::thread::scope(|s| {
            for body in &payloads {
                let p = &p;
                s.spawn(move || {
                    for _ in 0..20 {
                        atomic_write(p, body).unwrap();
                    }
                });
            }
        });
        let got = std::fs::read(&p).unwrap();
        assert!(payloads.contains(&got), "final file is torn");
        assert!(temps(d.path()).is_empty());
    }

    #[test]
    fn existing_temp_name_is_never_clobbered() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("x.vdf");
        std::fs::write(d.path().join("x.vdf.tmp"), b"other").unwrap();
        atomic_write(&p, b"abc").unwrap();
        assert_eq!(std::fs::read(d.path().join("x.vdf.tmp")).unwrap(), b"other");
    }

    /// 75 WR-04: a symlinked target is written through (the link survives and the real file
    /// gets the bytes), including a relative and a dangling link.
    #[cfg(unix)]
    #[test]
    fn symlinked_target_is_written_through() {
        let d = tempfile::tempdir().unwrap();
        let real_dir = d.path().join("real");
        std::fs::create_dir(&real_dir).unwrap();
        let real = real_dir.join("shortcuts.vdf");
        std::fs::write(&real, b"old").unwrap();
        let link = d.path().join("shortcuts.vdf");
        std::os::unix::fs::symlink("real/shortcuts.vdf", &link).unwrap();
        atomic_write(&link, b"new").unwrap();
        assert!(std::fs::symlink_metadata(&link)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(std::fs::read(&real).unwrap(), b"new");
        assert!(temps(d.path()).is_empty() && temps(&real_dir).is_empty());

        let dangling = d.path().join("x.acf");
        std::os::unix::fs::symlink(real_dir.join("x.acf"), &dangling).unwrap();
        atomic_write(&dangling, b"abc").unwrap();
        assert!(std::fs::symlink_metadata(&dangling)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(std::fs::read(real_dir.join("x.acf")).unwrap(), b"abc");
    }

    /// 75 WR-04: the existing file's mode is kept instead of `0666 & umask`.
    #[cfg(unix)]
    #[test]
    fn existing_mode_is_preserved() {
        use std::os::unix::fs::PermissionsExt;
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("x.vdf");
        std::fs::write(&p, b"old").unwrap();
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o600)).unwrap();
        atomic_write(&p, b"new").unwrap();
        let mode = std::fs::metadata(&p).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
    }
}
