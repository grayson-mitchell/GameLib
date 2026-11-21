//! The version engine: what happens to a store file when it is opened (Phase 68 `runFileMigration`,
//! ported, with the D-18 change to corrupt files).
//!
//! Decision order, the same as the TS engine:
//!
//! 1. no file: `Missing`, nothing is created.
//! 2. bytes that are not a JSON object (unparseable, a non-object root, empty, a BOM, a lone
//!    surrogate): the bytes are first copied to `<name>.corrupt.<stamp>.json`, and the original is
//!    never touched. A cache then starts empty (`StartEmpty`); every other kind opens read-only
//!    (`ReadOnly(Failed)`), and so does any kind whose copy could not be written. TS let conf
//!    reset such a file on its first write; losing a settings or account file that way is the
//!    defect D-18 removes.
//! 3. the file's version against the chain's current version: newer is `ReadOnly(Newer)` and the
//!    bytes are never rewritten; equal is `Ok`.
//! 4. a pending chain made only of identity steps is `Adopted` with zero bytes written (D-12).
//! 5. a cache with a pending non-identity chain is deleted (`CacheDiscarded`); it can be rebuilt.
//! 6. anything else: a pre-migration backup, the steps, then an atomic rewrite (`Migrated`). A
//!    failure at any point leaves the original bytes in place and the store read-only.
//!
//! Diagnostics (`detail`) carry versions and error kinds, never data: these stores hold tokens.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use crate::atomic::{write_atomic, Durability};
use crate::backup::{write_corrupt_copy, write_pre_migration_backup};
use crate::envelope::{set_settings_version, settings_version, stamp_for_write, store_version};
use crate::json::{parse, to_store_bytes, Json, Obj};
use crate::migrate::Chains;

/// Which kind of store a file belongs to; decides what is allowed to happen to unreadable or
/// outdated data. A cache can be rebuilt, everything else is the user's.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StoreKind {
    Cache,
    UserState,
    Account,
    Settings,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReadOnlyReason {
    /// The file's version is above this build's: written by a newer GameLib.
    Newer,
    /// The file could not be read, copied aside or migrated.
    Failed,
}

/// Which on-disk codec carries the version: `__internal__.gamelib.schemaVersion` in a conf store,
/// a top-level `version: 'vN'` in a settings document.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Flavour {
    Store,
    Settings,
}

#[derive(Debug, Clone, PartialEq)]
pub enum OpenOutcome {
    /// There is no file. The store starts empty and nothing was created.
    Missing,
    /// The file is at the current version. Untouched.
    Ok,
    /// An unstamped or baseline file whose pending steps are all identity: adopted, zero bytes
    /// written.
    Adopted,
    /// A backup was written and the file rewritten at the current version.
    Migrated {
        from: u32,
        to: u32,
        backup: Option<PathBuf>,
    },
    /// A cache with a pending non-identity chain: its file was deleted.
    CacheDiscarded,
    /// Writes are refused; the file's bytes are untouched.
    ReadOnly {
        reason: ReadOnlyReason,
        detail: String,
    },
    /// A cache that could not be read: it continues empty. `copy` holds its bytes.
    StartEmpty { copy: PathBuf },
}

/// What opening a file produced.
#[derive(Debug, Clone)]
pub struct Opened {
    pub outcome: OpenOutcome,
    /// The document reads are served from: the file as parsed (envelope included, so a write keeps
    /// it), or as migrated, or `{}` where the store starts empty. A cache over a newer file serves
    /// `{}` (`viewOf`); per-store `failedView: 'empty'` is the host's to apply over a `ReadOnly`.
    pub view: Json,
    /// The version a write stamps: the chain's current version.
    pub version: u32,
}

fn empty() -> Json {
    Json::Obj(Obj::new())
}

/// Opens the store file at `path`, deciding its fate as described in the module documentation.
/// `chain` is the chain key (`store/config`, `settings/global`); `now` stamps any side file.
pub fn open_file(
    path: &Path,
    flavour: Flavour,
    kind: StoreKind,
    chain: &str,
    chains: &Chains,
    now: SystemTime,
) -> Opened {
    let current = chains.current_version_of(chain);
    let opened = |outcome: OpenOutcome, view: Json| Opened {
        outcome,
        view,
        version: current,
    };
    let failed = |detail: String, view: Json| {
        opened(
            OpenOutcome::ReadOnly {
                reason: ReadOnlyReason::Failed,
                detail,
            },
            view,
        )
    };

    let bytes = match fs::read(path) {
        Ok(b) => b,
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            return opened(OpenOutcome::Missing, empty())
        }
        Err(e) => return failed(format!("read: {}", e.kind()), empty()),
    };

    let doc = match parse(&bytes) {
        Ok(d @ Json::Obj(_)) => d,
        _ => {
            return match write_corrupt_copy(path, &bytes, now) {
                Ok(copy) if kind == StoreKind::Cache => {
                    opened(OpenOutcome::StartEmpty { copy }, empty())
                }
                Ok(copy) => failed(
                    format!(
                        "not a readable store file; kept as is, copy at {}",
                        copy.file_name()
                            .map(|n| n.to_string_lossy())
                            .unwrap_or_default()
                    ),
                    empty(),
                ),
                Err(e) => failed(
                    format!(
                        "not a readable store file and its copy could not be written: {}",
                        e.kind()
                    ),
                    empty(),
                ),
            };
        }
    };

    let file_version = match flavour {
        Flavour::Store => store_version(&doc),
        Flavour::Settings => settings_version(&doc),
    };

    if file_version > current {
        let view = if kind == StoreKind::Cache {
            empty()
        } else {
            doc
        };
        return opened(
            OpenOutcome::ReadOnly {
                reason: ReadOnlyReason::Newer,
                detail: format!("file v{file_version} is newer than this build (v{current})"),
            },
            view,
        );
    }
    if file_version == current {
        return opened(OpenOutcome::Ok, doc);
    }

    let steps = chains.pending(chain, file_version);
    if steps.iter().all(|s| s.identity) {
        return opened(OpenOutcome::Adopted, doc);
    }
    let step_failed =
        |what: String, view: Json| failed(format!("v{file_version}->v{current}: {what}"), view);

    if kind == StoreKind::Cache {
        return match fs::remove_file(path) {
            Ok(()) => opened(OpenOutcome::CacheDiscarded, empty()),
            Err(e) => step_failed(format!("remove: {}", e.kind()), doc),
        };
    }

    let backup = match write_pre_migration_backup(path, file_version, &bytes, now) {
        Ok(p) => p,
        Err(e) => return step_failed(format!("backup: {}", e.kind()), doc),
    };
    let mut result = doc.clone();
    for step in &steps {
        if let Err(msg) = (step.run)(&mut result) {
            return step_failed(msg, doc);
        }
        if !matches!(result, Json::Obj(_)) {
            return step_failed(
                format!("migration {} did not return an object", step.id),
                doc,
            );
        }
    }
    let rewritten = match flavour {
        Flavour::Store => stamp_for_write(&result, current),
        Flavour::Settings => {
            set_settings_version(&mut result, current);
            result
        }
    };
    // TS wrote every migration with the tab layout, settings documents included.
    if let Err(e) = write_atomic(path, &to_store_bytes(&rewritten), Durability::Synced) {
        return step_failed(format!("write: {}", e.kind()), doc);
    }
    opened(
        OpenOutcome::Migrated {
            from: file_version,
            to: current,
            backup: Some(backup),
        },
        rewritten,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::{parse, to_compact_bytes};
    use crate::migrate::Step;
    use gamelib_testutil::FakeHome;
    use std::fs;
    use std::time::{Duration, UNIX_EPOCH};

    fn t0() -> SystemTime {
        UNIX_EPOCH + Duration::from_secs(1_795_251_600)
    }

    fn profile(initial: Option<&[u8]>) -> (FakeHome, PathBuf) {
        let home = FakeHome::new("gamelib-store-engine-");
        let dir = home.root().join("store");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("prefs.json");
        if let Some(bytes) = initial {
            fs::write(&path, bytes).unwrap();
        }
        (home, path)
    }

    fn open(path: &Path, kind: StoreKind, chains: &Chains) -> Opened {
        open_file(path, Flavour::Store, kind, "store/prefs", chains, t0())
    }

    fn to2() -> Chains {
        Chains::baseline().with_override(
            "store/prefs",
            vec![Step::new("to-2", 2, |d| {
                if let Json::Obj(o) = d {
                    o.insert_js("migrated", Json::Bool(true));
                    o.remove("legacy");
                }
                Ok(())
            })],
        )
    }

    fn files_in(dir: &Path) -> Vec<String> {
        let mut v: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        v.sort();
        v
    }

    fn compact(v: &Json) -> String {
        String::from_utf8(to_compact_bytes(v)).unwrap()
    }

    #[test]
    fn a_missing_file_is_missing_and_nothing_is_created() {
        let (_h, path) = profile(None);
        let o = open(&path, StoreKind::UserState, &Chains::baseline());
        assert_eq!(o.outcome, OpenOutcome::Missing);
        assert_eq!(compact(&o.view), "{}");
        assert!(files_in(path.parent().unwrap()).is_empty());
    }

    #[test]
    fn an_identity_adoption_writes_no_byte_and_leaves_the_mtime_alone() {
        let bytes = b"{\"a\":1,\"b\":{\"c\":2}}";
        let (_h, path) = profile(Some(bytes));
        let before = fs::metadata(&path).unwrap().modified().unwrap();
        std::thread::sleep(Duration::from_millis(40));
        let o = open(&path, StoreKind::UserState, &Chains::baseline());
        assert_eq!(o.outcome, OpenOutcome::Adopted);
        assert_eq!(o.version, 1);
        assert_eq!(fs::read(&path).unwrap(), bytes);
        assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), before);
        assert_eq!(files_in(path.parent().unwrap()), ["prefs.json"]);
    }

    #[test]
    fn a_file_with_an_invalid_schema_version_is_adopted_too() {
        let bytes = b"{\"a\":1,\"__internal__\":{\"gamelib\":{\"schemaVersion\":\"x\"}}}";
        let (_h, path) = profile(Some(bytes));
        let o = open(&path, StoreKind::UserState, &Chains::baseline());
        assert_eq!(o.outcome, OpenOutcome::Adopted);
        assert_eq!(fs::read(&path).unwrap(), bytes);
    }

    #[test]
    fn a_current_version_file_is_untouched() {
        let bytes = b"{\n\t\"a\": 1,\n\t\"__internal__\": {\n\t\t\"gamelib\": {\n\t\t\t\"schemaVersion\": 1\n\t\t}\n\t}\n}";
        let (_h, path) = profile(Some(bytes));
        let o = open(&path, StoreKind::UserState, &Chains::baseline());
        assert_eq!(o.outcome, OpenOutcome::Ok);
        assert_eq!(fs::read(&path).unwrap(), bytes);
    }

    #[test]
    fn a_newer_file_is_read_only_and_its_bytes_never_change() {
        let bytes = b"{\"a\":1,\"__internal__\":{\"gamelib\":{\"schemaVersion\":99}}}";
        for kind in [
            StoreKind::UserState,
            StoreKind::Account,
            StoreKind::Settings,
            StoreKind::Cache,
        ] {
            let (_h, path) = profile(Some(bytes));
            let o = open(&path, kind, &Chains::baseline());
            assert_eq!(
                o.outcome,
                OpenOutcome::ReadOnly {
                    reason: ReadOnlyReason::Newer,
                    detail: "file v99 is newer than this build (v1)".to_string()
                },
                "{kind:?}"
            );
            assert_eq!(fs::read(&path).unwrap(), bytes);
            assert_eq!(files_in(path.parent().unwrap()), ["prefs.json"]);
            // A cache serves an empty view over a newer file; the rest serve what is there.
            assert_eq!(
                o.view.get("a").is_some(),
                kind != StoreKind::Cache,
                "{kind:?}"
            );
        }
    }

    #[test]
    fn a_settings_document_newer_than_the_chain_is_read_only() {
        let bytes = b"{\n  \"version\": \"v99\"\n}";
        let (_h, path) = profile(Some(bytes));
        let o = open_file(
            &path,
            Flavour::Settings,
            StoreKind::Settings,
            "settings/global",
            &Chains::baseline(),
            t0(),
        );
        assert!(matches!(
            o.outcome,
            OpenOutcome::ReadOnly {
                reason: ReadOnlyReason::Newer,
                ..
            }
        ));
        assert_eq!(fs::read(&path).unwrap(), bytes);
    }

    #[test]
    fn a_pending_chain_writes_a_backup_then_rewrites_atomically() {
        let (_h, path) = profile(Some(b"{\"legacy\":1,\"a\":2}"));
        let o = open(&path, StoreKind::UserState, &to2());
        let OpenOutcome::Migrated { from, to, backup } = o.outcome.clone() else {
            panic!("{:?}", o.outcome)
        };
        assert_eq!((from, to), (0, 2));
        let backup = backup.expect("a backup path");
        assert_eq!(
            backup.file_name().unwrap().to_string_lossy(),
            "prefs.v0.20261121T090000000Z.bak.json"
        );
        assert_eq!(fs::read(&backup).unwrap(), b"{\"legacy\":1,\"a\":2}");
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "{\n\t\"a\": 2,\n\t\"migrated\": true,\n\t\"__internal__\": {\n\t\t\"gamelib\": {\n\t\t\t\"schemaVersion\": 2\n\t\t}\n\t}\n}"
        );
        assert_eq!(o.version, 2);
        assert_eq!(
            files_in(path.parent().unwrap()).len(),
            2,
            "no temp file is left"
        );
    }

    #[test]
    fn a_migrated_settings_document_keeps_the_version_key_where_it_was_and_is_tab_indented() {
        let (_h, path) = profile(Some(b"{\n  \"version\": \"v0\",\n  \"a\": 1\n}"));
        let chains =
            Chains::baseline().with_override("settings/x", vec![Step::new("to-2", 2, |_| Ok(()))]);
        let o = open_file(
            &path,
            Flavour::Settings,
            StoreKind::Settings,
            "settings/x",
            &chains,
            t0(),
        );
        assert!(
            matches!(o.outcome, OpenOutcome::Migrated { from: 0, to: 2, .. }),
            "{:?}",
            o.outcome
        );
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "{\n\t\"version\": \"v2\",\n\t\"a\": 1\n}"
        );
    }

    #[test]
    fn a_cache_with_a_pending_non_identity_chain_is_deleted() {
        let (_h, path) = profile(Some(b"{\"a\":1}"));
        let o = open(&path, StoreKind::Cache, &to2());
        assert_eq!(o.outcome, OpenOutcome::CacheDiscarded);
        assert!(!path.exists());
        assert_eq!(compact(&o.view), "{}");
        assert!(
            files_in(path.parent().unwrap()).is_empty(),
            "a discarded cache leaves no backup"
        );
    }

    #[test]
    fn a_cache_with_an_identity_only_chain_is_kept() {
        let (_h, path) = profile(Some(b"{\"a\":1}"));
        let chains =
            Chains::baseline().with_override("store/prefs", vec![Step::identity("adopt-v1", 1)]);
        let o = open(&path, StoreKind::Cache, &chains);
        assert_eq!(o.outcome, OpenOutcome::Adopted);
        assert!(path.exists());
    }

    #[test]
    fn a_failing_step_backs_up_then_opens_read_only_over_the_untouched_file() {
        let (_h, path) = profile(Some(b"{\"a\":1}"));
        let chains = Chains::baseline().with_override(
            "store/prefs",
            vec![Step::new("to-2", 2, |_| Err("boom".to_string()))],
        );
        let o = open(&path, StoreKind::UserState, &chains);
        assert_eq!(
            o.outcome,
            OpenOutcome::ReadOnly {
                reason: ReadOnlyReason::Failed,
                detail: "v0->v2: boom".to_string()
            }
        );
        assert_eq!(fs::read(&path).unwrap(), b"{\"a\":1}");
        assert_eq!(compact(&o.view), "{\"a\":1}");
        assert_eq!(files_in(path.parent().unwrap()).len(), 2);
    }

    #[test]
    fn a_step_that_leaves_a_non_object_is_a_failed_migration() {
        let (_h, path) = profile(Some(b"{\"a\":1}"));
        let chains = Chains::baseline().with_override(
            "store/prefs",
            vec![Step::new("to-2", 2, |d| {
                *d = Json::Null;
                Ok(())
            })],
        );
        let o = open(&path, StoreKind::UserState, &chains);
        assert!(matches!(
            o.outcome,
            OpenOutcome::ReadOnly {
                reason: ReadOnlyReason::Failed,
                ..
            }
        ));
        assert_eq!(fs::read(&path).unwrap(), b"{\"a\":1}");
    }

    const CORRUPT: [(&str, &[u8]); 5] = [
        ("not json", b"{not json"),
        ("array root", b"[1]"),
        ("empty", b""),
        ("bom", b"\xEF\xBB\xBF{\"a\":1}"),
        ("lone surrogate", b"{\"a\":\"\\ud800\"}"),
    ];

    #[test]
    fn a_corrupt_user_file_is_copied_aside_kept_and_opened_read_only() {
        for kind in [
            StoreKind::UserState,
            StoreKind::Account,
            StoreKind::Settings,
        ] {
            for (what, bytes) in CORRUPT {
                let (_h, path) = profile(Some(bytes));
                let o = open(&path, kind, &Chains::baseline());
                assert!(
                    matches!(
                        o.outcome,
                        OpenOutcome::ReadOnly {
                            reason: ReadOnlyReason::Failed,
                            ..
                        }
                    ),
                    "{kind:?} {what}: {:?}",
                    o.outcome
                );
                assert_eq!(
                    fs::read(&path).unwrap(),
                    bytes,
                    "{kind:?} {what}: original kept"
                );
                let copy = path
                    .parent()
                    .unwrap()
                    .join("prefs.corrupt.20261121T090000000Z.json");
                assert_eq!(
                    fs::read(&copy).unwrap(),
                    bytes,
                    "{kind:?} {what}: copy is byte-equal"
                );
                assert_eq!(compact(&o.view), "{}");
            }
        }
    }

    #[test]
    fn a_corrupt_cache_starts_empty_only_after_its_copy_exists() {
        for (what, bytes) in CORRUPT {
            let (_h, path) = profile(Some(bytes));
            let o = open(&path, StoreKind::Cache, &Chains::baseline());
            let OpenOutcome::StartEmpty { copy } = o.outcome else {
                panic!("{what}: {:?}", o.outcome)
            };
            assert_eq!(fs::read(&copy).unwrap(), bytes, "{what}");
            assert_eq!(
                fs::read(&path).unwrap(),
                bytes,
                "{what}: the cache file itself is untouched until a write"
            );
            assert_eq!(compact(&o.view), "{}");
        }
    }

    #[test]
    fn a_second_open_of_a_corrupt_file_does_not_pile_up_copies() {
        let (_h, path) = profile(Some(b"{not json"));
        for _ in 0..4 {
            open(&path, StoreKind::UserState, &Chains::baseline());
        }
        assert_eq!(files_in(path.parent().unwrap()).len(), 2);
    }

    #[cfg(unix)]
    #[test]
    fn when_the_copy_cannot_be_written_every_kind_opens_read_only() {
        use std::os::unix::fs::PermissionsExt;
        for kind in [
            StoreKind::Cache,
            StoreKind::UserState,
            StoreKind::Account,
            StoreKind::Settings,
        ] {
            let (_h, path) = profile(Some(b"{not json"));
            let dir = path.parent().unwrap().to_path_buf();
            fs::set_permissions(&dir, fs::Permissions::from_mode(0o500)).unwrap();
            let probe = dir.join("probe");
            let writable_anyway = fs::write(&probe, "x").is_ok();
            let o = open(&path, kind, &Chains::baseline());
            fs::set_permissions(&dir, fs::Permissions::from_mode(0o700)).unwrap();
            if writable_anyway {
                continue; // running as root: the directory mode proves nothing
            }
            assert!(
                matches!(
                    o.outcome,
                    OpenOutcome::ReadOnly {
                        reason: ReadOnlyReason::Failed,
                        ..
                    }
                ),
                "{kind:?}: {:?}",
                o.outcome
            );
            assert_eq!(fs::read(&path).unwrap(), b"{not json");
        }
    }

    #[test]
    fn the_view_is_what_json_parse_gives() {
        let (_h, path) = profile(Some(b"{\"b\":1,\"2\":2,\"a\":3}"));
        let o = open(&path, StoreKind::UserState, &Chains::baseline());
        assert_eq!(compact(&o.view), "{\"2\":2,\"b\":1,\"a\":3}");
        assert_eq!(o.view, parse(b"{\"2\":2,\"b\":1,\"a\":3}").unwrap());
    }
}
