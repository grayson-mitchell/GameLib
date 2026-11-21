//! Skeleton for the RED commit; replaced by the implementation.

use std::io;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

pub const MAX_BACKUPS_PER_STORE: usize = 3;

pub fn stamp(_now: SystemTime) -> String {
    String::new()
}

pub fn write_pre_migration_backup(
    path: &Path,
    _from: u32,
    _bytes: &[u8],
    _now: SystemTime,
) -> io::Result<PathBuf> {
    Ok(path.to_path_buf())
}

pub fn write_corrupt_copy(path: &Path, _bytes: &[u8], _now: SystemTime) -> io::Result<PathBuf> {
    Ok(path.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_testutil::FakeHome;
    use std::fs;
    use std::time::{Duration, UNIX_EPOCH};

    /// 2026-11-21T09:00:00.000Z
    fn t0() -> SystemTime {
        UNIX_EPOCH + Duration::from_secs(1_795_251_600)
    }

    fn at(hours: u64) -> SystemTime {
        t0() + Duration::from_secs(hours * 3600)
    }

    fn names(dir: &Path) -> Vec<String> {
        let mut v: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        v.sort();
        v
    }

    fn store() -> (FakeHome, PathBuf) {
        let home = FakeHome::new("gamelib-store-backup-");
        let dir = home.root().join("store");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("prefs.json");
        (home, path)
    }

    #[test]
    fn the_stamp_is_utc_with_milliseconds() {
        assert_eq!(stamp(t0()), "20261121T090000000Z");
        assert_eq!(
            stamp(t0() + Duration::from_millis(123)),
            "20261121T090000123Z"
        );
        assert_eq!(stamp(UNIX_EPOCH), "19700101T000000000Z");
        // A leap day and a year boundary.
        assert_eq!(
            stamp(UNIX_EPOCH + Duration::from_secs(951_782_400)),
            "20000229T000000000Z"
        );
        assert_eq!(
            stamp(UNIX_EPOCH + Duration::from_secs(1_767_225_599)),
            "20251231T235959000Z"
        );
    }

    #[test]
    fn a_backup_is_named_for_its_version_and_holds_the_old_bytes() {
        let (_home, path) = store();
        let written = write_pre_migration_backup(&path, 0, b"{\"a\":1}", t0()).unwrap();
        assert_eq!(
            written.file_name().unwrap().to_string_lossy(),
            "prefs.v0.20261121T090000000Z.bak.json"
        );
        assert_eq!(written.parent(), path.parent());
        assert_eq!(fs::read(&written).unwrap(), b"{\"a\":1}");
    }

    #[cfg(unix)]
    #[test]
    fn backups_and_corrupt_copies_are_private() {
        use std::os::unix::fs::PermissionsExt;
        let (_home, path) = store();
        let b = write_pre_migration_backup(&path, 1, b"{}", t0()).unwrap();
        let c = write_corrupt_copy(&path, b"{nope", t0()).unwrap();
        for p in [b, c] {
            assert_eq!(
                fs::metadata(&p).unwrap().permissions().mode() & 0o777,
                0o600,
                "{}",
                p.display()
            );
        }
    }

    #[test]
    fn bytes_equal_to_the_newest_backup_are_not_written_again() {
        let (_home, path) = store();
        let first = write_pre_migration_backup(&path, 1, b"same", t0()).unwrap();
        let again = write_pre_migration_backup(&path, 1, b"same", at(1)).unwrap();
        assert_eq!(first, again, "the existing newest backup is returned");
        assert_eq!(names(path.parent().unwrap()).len(), 1);
    }

    #[test]
    fn four_successive_backups_keep_exactly_three() {
        let (_home, path) = store();
        for (i, body) in [&b"one"[..], b"two", b"three", b"four"].iter().enumerate() {
            write_pre_migration_backup(&path, i as u32, body, at(i as u64)).unwrap();
        }
        assert_eq!(
            names(path.parent().unwrap()),
            [
                "prefs.v1.20261121T100000000Z.bak.json",
                "prefs.v2.20261121T110000000Z.bak.json",
                "prefs.v3.20261121T120000000Z.bak.json"
            ]
        );
        assert_eq!(MAX_BACKUPS_PER_STORE, 3);
    }

    #[test]
    fn pruning_never_touches_another_stores_files_or_the_store_itself() {
        let (_home, path) = store();
        let dir = path.parent().unwrap().to_path_buf();
        fs::write(&path, "live").unwrap();
        fs::write(dir.join("other.v1.20200101T000000000Z.bak.json"), "x").unwrap();
        fs::write(dir.join("prefs.v1.notastamp.bak.json"), "x").unwrap();
        for i in 0..5u64 {
            write_pre_migration_backup(&path, 1, format!("b{i}").as_bytes(), at(i)).unwrap();
        }
        let left = names(&dir);
        assert!(left.contains(&"prefs.json".to_string()));
        assert!(left.contains(&"other.v1.20200101T000000000Z.bak.json".to_string()));
        assert!(left.contains(&"prefs.v1.notastamp.bak.json".to_string()));
        assert_eq!(
            left.iter()
                .filter(|n| n.starts_with("prefs.v1.2026"))
                .count(),
            3
        );
    }

    #[test]
    fn a_corrupt_copy_is_named_for_the_store_and_capped_at_three() {
        let (_home, path) = store();
        let first = write_corrupt_copy(&path, b"{one", t0()).unwrap();
        assert_eq!(
            first.file_name().unwrap().to_string_lossy(),
            "prefs.corrupt.20261121T090000000Z.json"
        );
        assert_eq!(fs::read(&first).unwrap(), b"{one");
        for (i, body) in [&b"{two"[..], b"{three", b"{four"].iter().enumerate() {
            write_corrupt_copy(&path, body, at(i as u64 + 1)).unwrap();
        }
        let copies: Vec<String> = names(path.parent().unwrap())
            .into_iter()
            .filter(|n| n.contains(".corrupt."))
            .collect();
        assert_eq!(copies.len(), 3);
        assert!(
            !copies.iter().any(|n| n.contains("090000000Z")),
            "the oldest copy is pruned"
        );
    }

    #[test]
    fn a_permanently_corrupt_file_does_not_grow_the_disk_on_every_boot() {
        let (_home, path) = store();
        let a = write_corrupt_copy(&path, b"{broken", t0()).unwrap();
        for i in 1..20u64 {
            let b = write_corrupt_copy(&path, b"{broken", at(i)).unwrap();
            assert_eq!(a, b);
        }
        assert_eq!(names(path.parent().unwrap()).len(), 1);
    }

    #[test]
    fn corrupt_copies_and_pre_migration_backups_do_not_prune_each_other() {
        let (_home, path) = store();
        for i in 0..3u64 {
            write_pre_migration_backup(&path, 1, format!("b{i}").as_bytes(), at(i)).unwrap();
            write_corrupt_copy(&path, format!("{{c{i}").as_bytes(), at(i)).unwrap();
        }
        assert_eq!(names(path.parent().unwrap()).len(), 6);
    }

    #[cfg(unix)]
    #[test]
    fn a_directory_that_cannot_be_written_is_an_error_not_a_panic() {
        use std::os::unix::fs::PermissionsExt;
        let (_home, path) = store();
        let dir = path.parent().unwrap().to_path_buf();
        fs::set_permissions(&dir, fs::Permissions::from_mode(0o500)).unwrap();
        // Root ignores directory modes, so the failure cannot be provoked there.
        let probe = dir.join("probe");
        let writable_anyway = fs::write(&probe, "x").is_ok();
        let result = write_corrupt_copy(&path, b"{x", t0());
        fs::set_permissions(&dir, fs::Permissions::from_mode(0o700)).unwrap();
        if !writable_anyway {
            assert!(result.is_err());
        }
    }
}
