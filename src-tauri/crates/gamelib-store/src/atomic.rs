//! The store's atomic file write (skeleton for the RED run).

use std::io;
use std::path::Path;

/// Whether the temp file is `sync_all`-ed before it replaces the file (D-21).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Durability {
    Synced,
    Unsynced,
}

pub fn write_atomic(_path: &Path, _bytes: &[u8], _durability: Durability) -> io::Result<()> {
    Ok(())
}

pub fn write_atomic_with(
    _path: &Path,
    _bytes: &[u8],
    _durability: Durability,
    _rename: &dyn Fn(&Path, &Path) -> io::Result<()>,
) -> io::Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    use std::fs;

    /// Names of `*.tmp` files left in `dir`.
    fn temps(dir: &Path) -> Vec<String> {
        fs::read_dir(dir)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.ends_with(".tmp"))
            .collect()
    }

    #[test]
    fn writes_the_bytes_replaces_them_and_leaves_no_temp() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("x.json");
        write_atomic(&p, b"abc", Durability::Synced).unwrap();
        assert_eq!(fs::read(&p).unwrap(), b"abc");
        write_atomic(&p, b"defg", Durability::Unsynced).unwrap();
        assert_eq!(fs::read(&p).unwrap(), b"defg");
        assert!(temps(d.path()).is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn the_file_is_0600_and_a_new_parent_directory_0700() {
        use std::os::unix::fs::PermissionsExt;
        let d = tempfile::tempdir().unwrap();
        let sub = d.path().join("store").join("deeper");
        let p = sub.join("x.json");
        write_atomic(&p, b"abc", Durability::Synced).unwrap();
        let mode = |p: &Path| fs::metadata(p).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(&p), 0o600);
        assert_eq!(mode(&sub), 0o700);
        assert_eq!(mode(&d.path().join("store")), 0o700);
        // An existing file is rewritten 0600 too: stores are private to the user (D-13).
        fs::set_permissions(&p, fs::Permissions::from_mode(0o644)).unwrap();
        write_atomic(&p, b"new", Durability::Synced).unwrap();
        assert_eq!(mode(&p), 0o600);
    }

    #[test]
    fn a_path_without_a_file_name_is_invalid_input() {
        let e = write_atomic(Path::new("/"), b"x", Durability::Synced).unwrap_err();
        assert_eq!(e.kind(), io::ErrorKind::InvalidInput);
    }

    #[test]
    fn when_the_rename_fails_the_bytes_are_written_directly_and_no_temp_remains() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("x.json");
        let failing = |_: &Path, _: &Path| Err(io::Error::other("forced rename failure"));
        write_atomic_with(&p, b"{\"k\":1}", Durability::Synced, &failing).unwrap();
        assert_eq!(fs::read(&p).unwrap(), b"{\"k\":1}");
        assert!(temps(d.path()).is_empty());
    }

    #[test]
    fn a_permission_denied_rename_is_retried_three_times_then_falls_back() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("x.json");
        let calls = Cell::new(0);
        let denied = |_: &Path, _: &Path| {
            calls.set(calls.get() + 1);
            Err(io::Error::from(io::ErrorKind::PermissionDenied))
        };
        write_atomic_with(&p, b"after retries", Durability::Unsynced, &denied).unwrap();
        assert_eq!(calls.get(), 4, "one attempt and three retries");
        assert_eq!(fs::read(&p).unwrap(), b"after retries");
        assert!(temps(d.path()).is_empty());
    }

    #[test]
    fn a_rename_that_succeeds_on_a_retry_needs_no_fallback() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("x.json");
        let calls = Cell::new(0);
        let flaky = |from: &Path, to: &Path| {
            calls.set(calls.get() + 1);
            if calls.get() < 3 {
                Err(io::Error::from(io::ErrorKind::PermissionDenied))
            } else {
                fs::rename(from, to)
            }
        };
        write_atomic_with(&p, b"third time", Durability::Synced, &flaky).unwrap();
        assert_eq!(calls.get(), 3);
        assert_eq!(fs::read(&p).unwrap(), b"third time");
        assert!(temps(d.path()).is_empty());
    }

    #[test]
    fn a_target_that_cannot_be_written_errs_and_leaves_no_temp() {
        let d = tempfile::tempdir().unwrap();
        // A non-empty directory where the file must go: the rename and the direct write both fail.
        let p = d.path().join("target");
        fs::create_dir(&p).unwrap();
        fs::write(p.join("inner"), b"1").unwrap();
        assert!(write_atomic(&p, b"abc", Durability::Synced).is_err());
        assert!(temps(d.path()).is_empty());
    }

    #[test]
    fn an_existing_temp_name_is_never_clobbered() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("x.json");
        fs::write(d.path().join("x.json.tmp"), b"other").unwrap();
        write_atomic(&p, b"abc", Durability::Synced).unwrap();
        assert_eq!(fs::read(d.path().join("x.json.tmp")).unwrap(), b"other");
    }

    #[test]
    fn concurrent_writers_never_tear_or_fail() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("x.json");
        let payloads: Vec<Vec<u8>> = (0..8u8).map(|i| vec![b'a' + i; 128 * 1024]).collect();
        std::thread::scope(|s| {
            for body in &payloads {
                let p = &p;
                s.spawn(move || {
                    for _ in 0..10 {
                        write_atomic(p, body, Durability::Unsynced).unwrap();
                    }
                });
            }
        });
        let got = fs::read(&p).unwrap();
        assert!(payloads.contains(&got), "final file is torn");
        assert!(temps(d.path()).is_empty());
    }

    /// A symlinked target is written through: the link survives and the real file gets the bytes,
    /// including a relative and a dangling link.
    #[cfg(unix)]
    #[test]
    fn a_symlinked_target_is_replaced_not_the_link() {
        let d = tempfile::tempdir().unwrap();
        let real_dir = d.path().join("real");
        fs::create_dir(&real_dir).unwrap();
        let real = real_dir.join("x.json");
        fs::write(&real, b"old").unwrap();
        let link = d.path().join("x.json");
        std::os::unix::fs::symlink("real/x.json", &link).unwrap();
        write_atomic(&link, b"new", Durability::Synced).unwrap();
        assert!(fs::symlink_metadata(&link)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(fs::read(&real).unwrap(), b"new");
        assert!(temps(d.path()).is_empty() && temps(&real_dir).is_empty());

        let dangling = d.path().join("y.json");
        std::os::unix::fs::symlink(real_dir.join("y.json"), &dangling).unwrap();
        write_atomic(&dangling, b"abc", Durability::Unsynced).unwrap();
        assert!(fs::symlink_metadata(&dangling)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(fs::read(real_dir.join("y.json")).unwrap(), b"abc");
    }
}

/// On Windows a rename over a file another process holds open without `FILE_SHARE_DELETE` is
/// refused. The write must retry, then land the bytes through the direct-write fallback.
#[cfg(all(test, windows))]
mod windows {
    use super::*;
    use std::fs::{self, OpenOptions};
    use std::os::windows::fs::OpenOptionsExt;

    const FILE_SHARE_READ: u32 = 1;
    const FILE_SHARE_WRITE: u32 = 2;

    #[test]
    fn a_destination_held_without_share_delete_is_retried_then_written_directly() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("x.json");
        fs::write(&p, b"old").unwrap();
        // Open without FILE_SHARE_DELETE: replacing the file by rename is refused.
        let _held = OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
            .open(&p)
            .unwrap();
        write_atomic(&p, b"new bytes", Durability::Synced).unwrap();
        assert_eq!(fs::read(&p).unwrap(), b"new bytes");
        let temps: Vec<_> = fs::read_dir(d.path())
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().ends_with(".tmp"))
            .collect();
        assert!(temps.is_empty());
    }
}
