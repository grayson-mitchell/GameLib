//! Pre-migration backups and corrupt-file copies (Phase 68 `backup.ts`, D-18).
//!
//! Both are written next to the store file, mode 0600 through `write_atomic` with `Synced`
//! durability (they can hold token material, T-85-16), and both families are bounded the same way:
//! a write is skipped when its bytes equal the newest file of that family, and at most
//! `MAX_BACKUPS_PER_STORE` are kept (oldest pruned by stamp), so a file that stays corrupt, or a
//! migration retried every boot, can never fill the disk (T-85-17).
//!
//! - `<name>.v<from>.<UTC stamp>.bak.json`: the bytes a file had before a migration rewrote it.
//! - `<name>.corrupt.<UTC stamp>.json`: the bytes of a file the engine could not read as a store.
//!
//! The stamp is `YYYYMMDDTHHMMSSmmmZ`. It is formatted here from an injected `SystemTime` with a
//! small civil-date routine instead of a date crate: the crate keeps its dependencies to what the
//! store itself needs, and the format is fixed and tiny.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::atomic::{write_atomic, Durability};

/// How many backups (and, separately, corrupt copies) a store keeps.
pub const MAX_BACKUPS_PER_STORE: usize = 3;

/// Which family of side files a write belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Family {
    Backup,
    Corrupt,
}

/// `YYYYMMDDTHHMMSSmmmZ` in UTC. A time before 1970 prints as the epoch.
pub fn stamp(now: SystemTime) -> String {
    let since = now.duration_since(UNIX_EPOCH).unwrap_or(Duration::ZERO);
    let secs = since.as_secs();
    let millis = since.subsec_millis();
    let days = i64::try_from(secs / 86_400).unwrap_or(0);
    let rem = secs % 86_400;
    let (y, m, d) = civil_from_days(days);
    format!(
        "{y:04}{m:02}{d:02}T{:02}{:02}{:02}{millis:03}Z",
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

/// Howard Hinnant's `civil_from_days`: days since 1970-01-01 to (year, month, day).
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// `\d{8}T\d{9}Z`.
fn is_stamp(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 19
        && b[..8].iter().all(u8::is_ascii_digit)
        && b[8] == b'T'
        && b[9..18].iter().all(u8::is_ascii_digit)
        && b[18] == b'Z'
}

/// The store's name: its file name without `.json`. Refuses a path with no usable name.
fn store_name(path: &Path) -> io::Result<String> {
    let file = path.file_name().and_then(|n| n.to_str()).ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidInput, "store path has no file name")
    })?;
    let name = file.strip_suffix(".json").unwrap_or(file);
    if name.is_empty() || name == "." || name == ".." {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "store path has no usable name",
        ));
    }
    Ok(name.to_string())
}

/// The stamp in a side file's name, if `file` belongs to `family` of the store called `name`.
fn stamp_in(file: &str, name: &str, family: Family) -> Option<String> {
    match family {
        Family::Backup => {
            let rest = file.strip_prefix(name)?.strip_prefix(".v")?;
            let digits = rest.bytes().take_while(u8::is_ascii_digit).count();
            let rest = rest.get(digits..)?.strip_prefix('.')?;
            let stamp = rest.strip_suffix(".bak.json")?;
            (digits > 0 && is_stamp(stamp)).then(|| stamp.to_string())
        }
        Family::Corrupt => {
            let rest = file.strip_prefix(name)?.strip_prefix(".corrupt.")?;
            let stamp = rest.strip_suffix(".json")?;
            is_stamp(stamp).then(|| stamp.to_string())
        }
    }
}

/// Whether `file` is a side file this module wrote (`<name>.v<N>.<stamp>.bak.json` or
/// `<name>.corrupt.<stamp>.json`) rather than a store: anything that walks a directory for stores
/// (the per-game settings in `GamesConfig/`) must skip these.
pub fn is_side_file(file: &str) -> bool {
    if let Some(rest) = file.strip_suffix(".bak.json") {
        if let Some((head, stamp)) = rest.rsplit_once('.') {
            if let Some((name, v)) = head.rsplit_once('.') {
                return !name.is_empty()
                    && is_stamp(stamp)
                    && v.strip_prefix('v')
                        .is_some_and(|d| !d.is_empty() && d.bytes().all(|b| b.is_ascii_digit()));
            }
        }
        return false;
    }
    if let Some(rest) = file.strip_suffix(".json") {
        if let Some((head, stamp)) = rest.rsplit_once('.') {
            return is_stamp(stamp)
                && head
                    .rsplit_once('.')
                    .is_some_and(|(name, tag)| !name.is_empty() && tag == "corrupt");
        }
    }
    false
}

/// The family's files in `dir`, oldest first (by stamp, then name).
fn list(dir: &Path, name: &str, family: Family) -> Vec<PathBuf> {
    let Ok(read) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut found: Vec<(String, String)> = read
        .flatten()
        .filter_map(|e| {
            let file = e.file_name().to_string_lossy().into_owned();
            stamp_in(&file, name, family).map(|s| (s, file))
        })
        .collect();
    found.sort();
    found.into_iter().map(|(_, f)| dir.join(f)).collect()
}

fn write_side_file(
    store: &Path,
    family: Family,
    target_name: impl FnOnce(&str, &str) -> String,
    bytes: &[u8],
    now: SystemTime,
) -> io::Result<PathBuf> {
    let name = store_name(store)?;
    let dir = match store.parent() {
        Some(p) if !p.as_os_str().is_empty() => p.to_path_buf(),
        _ => PathBuf::from("."),
    };
    if let Some(newest) = list(&dir, &name, family).last() {
        if fs::read(newest).is_ok_and(|b| b == bytes) {
            return Ok(newest.clone());
        }
    }
    let target = dir.join(target_name(&name, &stamp(now)));
    write_atomic(&target, bytes, Durability::Synced)?;

    // Prune the oldest beyond the cap, never the file just written (a clock that ran backwards
    // would otherwise delete the copy the caller is about to rely on).
    let others: Vec<PathBuf> = list(&dir, &name, family)
        .into_iter()
        .filter(|p| *p != target)
        .collect();
    let excess = (others.len() + 1).saturating_sub(MAX_BACKUPS_PER_STORE);
    for old in others.into_iter().take(excess) {
        // A file that cannot be pruned stays; the next write tries again.
        let _ = fs::remove_file(old);
    }
    Ok(target)
}

/// Writes `<name>.v<from>.<stamp>.bak.json` holding `bytes`, the file as it was before a migration.
/// Returns the path that now holds those bytes: the new file, or the newest existing backup when it
/// already equals them.
pub fn write_pre_migration_backup(
    path: &Path,
    from: u32,
    bytes: &[u8],
    now: SystemTime,
) -> io::Result<PathBuf> {
    write_side_file(
        path,
        Family::Backup,
        |name, stamp| format!("{name}.v{from}.{stamp}.bak.json"),
        bytes,
        now,
    )
}

/// Writes `<name>.corrupt.<stamp>.json` holding `bytes`, a file the engine could not read as a
/// store. Returns the path that now holds those bytes (see `write_pre_migration_backup`).
pub fn write_corrupt_copy(path: &Path, bytes: &[u8], now: SystemTime) -> io::Result<PathBuf> {
    write_side_file(
        path,
        Family::Corrupt,
        |name, stamp| format!("{name}.corrupt.{stamp}.json"),
        bytes,
        now,
    )
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
    fn side_files_are_told_apart_from_stores() {
        for side in [
            "prefs.v0.20261121T090000000Z.bak.json",
            "480.v12.20261121T090000000Z.bak.json",
            "prefs.corrupt.20261121T090000000Z.json",
            "my.game.v1.20261121T090000000Z.bak.json",
        ] {
            assert!(is_side_file(side), "{side}");
        }
        for store in [
            "prefs.json",
            "480.json",
            "prefs.v1.notastamp.bak.json",
            "prefs.vx.20261121T090000000Z.bak.json",
            "prefs.v1.20261121T090000000Z.json",
            ".v1.20261121T090000000Z.bak.json",
            "corrupt.20261121T090000000Z.json",
        ] {
            assert!(!is_side_file(store), "{store}");
        }
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
