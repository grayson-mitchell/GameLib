//! The store's atomic file write: a copy of `gamelib-steamfiles`'s writer, hardened for private,
//! frequently rewritten state files (D-13).
//!
//! The bytes go to a uniquely named `create_new` temp file next to the (symlink-resolved) target at
//! mode 0600, are `sync_all`-ed when the caller asks for durability (D-21), and are renamed over the
//! target. A rename that fails is retried a few times when the failure looks transient (Windows holds
//! a file open without `FILE_SHARE_DELETE` while a virus scanner or indexer reads it), and a rename
//! that still fails falls back to writing the target in place, the fallback the retired TS file store
//! had (WR-05). No temp file survives any outcome.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

static TMP_SEQ: AtomicU64 = AtomicU64::new(0);

/// Sleeps before each retry of a refused rename: three retries after the first attempt.
const RENAME_RETRY_DELAYS_MS: [u64; 3] = [25, 50, 100];

/// Whether the temp file is `sync_all`-ed before it replaces the file (D-21).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Durability {
    /// User-state, settings and account stores: a crash right after the write must not lose it.
    Synced,
    /// Caches, rewritten in bursts and rebuilt on demand.
    Unsynced,
}

/// Follow a symlinked final component (up to 40 hops, dangling targets included) so the write lands
/// on the real file instead of replacing the link. A non-link path is returned unchanged.
pub fn resolve_final_symlinks(path: &Path) -> PathBuf {
    let mut cur = path.to_path_buf();
    for _ in 0..40 {
        let Ok(meta) = fs::symlink_metadata(&cur) else {
            break;
        };
        if !meta.file_type().is_symlink() {
            break;
        }
        let Ok(link) = fs::read_link(&cur) else {
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

/// Creates `dir` and any missing ancestors, each new directory 0700 on Unix.
fn create_dir_private(dir: &Path) -> io::Result<()> {
    if dir.exists() {
        return Ok(());
    }
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(dir)
}

/// Write options for a store file: mode 0600 when the file is created (Unix).
fn private_options() -> OpenOptions {
    let mut options = OpenOptions::new();
    options.write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options
}

fn finish(mut f: File, bytes: &[u8], durability: Durability) -> io::Result<()> {
    f.write_all(bytes)?;
    if durability == Durability::Synced {
        f.sync_all()?;
    }
    Ok(())
}

/// A rename worth trying again: a permission refusal anywhere, or on Windows a sharing violation
/// (os error 32) or access denied (os error 5).
fn is_retryable(e: &io::Error) -> bool {
    if e.kind() == io::ErrorKind::PermissionDenied {
        return true;
    }
    #[cfg(windows)]
    if matches!(e.raw_os_error(), Some(32) | Some(5)) {
        return true;
    }
    false
}

/// Writes `bytes` to `path`, atomically where the platform allows it.
pub fn write_atomic(path: &Path, bytes: &[u8], durability: Durability) -> io::Result<()> {
    write_atomic_with(path, bytes, durability, &|from, to| fs::rename(from, to))
}

/// `write_atomic` with the rename as a parameter, so a test can force the failure without touching
/// permissions or holding a file open.
pub fn write_atomic_with(
    path: &Path,
    bytes: &[u8],
    durability: Durability,
    rename: &dyn Fn(&Path, &Path) -> io::Result<()>,
) -> io::Result<()> {
    let invalid = || {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "path has no parent or file name",
        )
    };
    let target = resolve_final_symlinks(path);
    let parent = target.parent().ok_or_else(invalid)?;
    let name = target.file_name().ok_or_else(invalid)?;
    create_dir_private(parent)?;

    let mut tmp_name = name.to_os_string();
    tmp_name.push(format!(
        ".{}.{}.tmp",
        std::process::id(),
        TMP_SEQ.fetch_add(1, Ordering::Relaxed)
    ));
    let tmp = parent.join(tmp_name);
    let file = private_options().create_new(true).open(&tmp)?;
    if let Err(e) = finish(file, bytes, durability) {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }

    let mut attempt = rename(&tmp, &target);
    for delay in RENAME_RETRY_DELAYS_MS {
        match &attempt {
            Err(e) if is_retryable(e) => {
                std::thread::sleep(Duration::from_millis(delay));
                attempt = rename(&tmp, &target);
            }
            _ => break,
        }
    }
    if attempt.is_ok() {
        return Ok(());
    }

    // The rename never went through: write the target in place, then drop the temp either way.
    let direct = private_options()
        .create(true)
        .truncate(true)
        .open(&target)
        .and_then(|f| finish(f, bytes, durability));
    let _ = fs::remove_file(&tmp);
    direct
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
