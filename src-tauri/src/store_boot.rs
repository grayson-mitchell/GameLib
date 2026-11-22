//! The shell's store boot (Phase 85, FND-06): which stores Rust owns, opening them once at start
//! within a bound, telling the sidecar what is read-only, and the exit drain.
//!
//! Rust owns every row of the store table it can open (D-03, 85-21): the phase's rollback flag and
//! its per-family ownership file are deleted, and the TS store classes are only mirrors. The one row
//! it never opens is `excluded` (`store/migrations`, D-07): the file stays on disk and nothing
//! reads or writes it.
//!
//! Boot opening is bounded (Rust shutdown contract: bound boot work): it stops at
//! [`BOOT_SWEEP_MAX_FILES`] files or [`BOOT_SWEEP_MAX_MS`] milliseconds or when the shutdown token
//! is cancelled, and the files it did not reach are opened lazily on first use and counted in the
//! one summary line. It runs only inside `run_setup`, after `acquire_single_instance` has made this
//! process the primary, so a second GameLib instance never opens or migrates a store file.
//!
//! The summary line, the `GAMELIB_STORE_BOOT` value and the read-only entries carry store keys, reason words
//! and counts, never a value: these files hold tokens and `gamelib.log` is the file users upload.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

use gamelib_store::engine::{OpenOutcome, ReadOnlyReason};
use gamelib_store::host::StoreHost;
use gamelib_store::table::{row_for_path, table, Family, TableRow};

/// How many files boot opens before it stops and leaves the rest to open on first use. From
/// 85-SPIKES.md "Constants" (S3): 106 files measured on the operator's profile; 20 x 106 = 2,120,
/// rounded up to the next power of ten.
pub(crate) const BOOT_SWEEP_MAX_FILES: usize = 10_000;

/// How long boot spends opening files before it stops. From 85-SPIKES.md "Constants" (S3): median
/// sweep 6.77 ms, so 10x is 68 ms and the 2000 ms floor applies; a full 10,000-file sweep
/// extrapolates to about 0.65 s warm, inside the cap.
pub(crate) const BOOT_SWEEP_MAX_MS: u64 = 2_000;

/// Whether Rust opens this row: every row but `excluded` (`store/migrations`, D-07). `native` rows
/// (the logger's `uploadedLogs`) open here too.
pub(crate) fn is_rust_owned(row: &TableRow) -> bool {
    row.family != Family::Excluded
}

/// What boot did, in counts and keys.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(crate) struct BootReport {
    /// Files opened, the ones counted below included.
    pub(crate) opened: usize,
    /// Opened files that needed no write (an unstamped or baseline file, D-12).
    pub(crate) adopted: usize,
    /// Opened files migrated behind a backup.
    pub(crate) migrated: usize,
    /// Stores that refuse writes, as `(store key, reason)`.
    pub(crate) read_only: Vec<(String, ReadOnlyReason)>,
    /// Caches that could not be read and continue empty.
    pub(crate) start_empty: Vec<String>,
    /// Files boot did not reach; they open on first use.
    pub(crate) deferred: usize,
    pub(crate) elapsed_ms: u64,
}

/// Every file of a Rust-owned row that exists, in table order (`GamesConfig` by file name).
fn candidates(
    user_data: &Path,
    owned: &dyn Fn(&TableRow) -> bool,
) -> Vec<(&'static TableRow, PathBuf)> {
    let mut found = Vec::new();
    for row in table() {
        if !owned(row) {
            continue;
        }
        match (row.key.as_str(), row.name.as_deref()) {
            ("settings/global", _) => found.push((row, user_data.join("config.json"))),
            ("settings/game", _) => {
                let Ok(read) = fs::read_dir(user_data.join("GamesConfig")) else {
                    continue;
                };
                let mut files: Vec<PathBuf> = read
                    .flatten()
                    .map(|e| e.path())
                    // A backup, a corrupt copy or a temp file has no row: `row_for_path` skips it.
                    .filter(|p| row_for_path(user_data, user_data, p).is_some())
                    // A name no `GamesConfig/<app>` frame can carry is never Rust's (T-85-37).
                    .filter(|p| {
                        p.file_stem()
                            .and_then(|s| s.to_str())
                            .is_some_and(crate::store_dispatch::plain_name)
                    })
                    .collect();
                files.sort();
                found.extend(files.into_iter().map(|p| (row, p)));
            }
            (key, Some(name)) if !key.starts_with("settings/") => {
                found.push((row, user_data.join(&row.dir).join(format!("{name}.json"))));
            }
            _ => {}
        }
    }
    found.retain(|(_, path)| path.is_file());
    found
}

/// The document key of a settings-family file: `settings/global` for `config.json`,
/// `GamesConfig/<app>` for a game document (its file stem), `None` for any other row.
fn settings_doc_key(row: &TableRow, path: &Path) -> Option<String> {
    match row.key.as_str() {
        "settings/global" => Some(row.key.clone()),
        "settings/game" => path
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|stem| format!("GamesConfig/{stem}")),
        _ => None,
    }
}

/// Opens every Rust-owned store file under `user_data` once, stopping at `max_files` files,
/// `max_ms` milliseconds or when `cancelled` says so; what it did not reach is counted as deferred.
/// `user_data` is both the user-data directory and the app folder (`config.json`, `GamesConfig`).
/// Writes the one summary line.
pub(crate) fn open_all_with(
    host: &StoreHost,
    user_data: &Path,
    max_files: usize,
    max_ms: u64,
    cancelled: &dyn Fn() -> bool,
) -> BootReport {
    let start = Instant::now();
    let budget = Duration::from_millis(max_ms);
    let files = candidates(user_data, &is_rust_owned);
    let total = files.len();
    let mut report = BootReport::default();
    for (i, (row, path)) in files.into_iter().enumerate() {
        if report.opened >= max_files || start.elapsed() >= budget || cancelled() {
            report.deferred = total - i;
            break;
        }
        report.opened += 1;
        // A settings document opens under its own key (`settings/global`, `GamesConfig/<app>`), so
        // the frame worker finds the same store and a read-only report names the document the
        // sidecar's mirror cell is keyed by (85-15).
        let doc_key = settings_doc_key(row, &path);
        let key = doc_key.as_deref().unwrap_or(&row.key);
        let opened = match &doc_key {
            Some(doc) => host.open_doc(doc, path),
            None => host.open_row(row, path),
        };
        match opened {
            Ok(store) => match store.open_outcome() {
                OpenOutcome::Adopted => report.adopted += 1,
                OpenOutcome::Migrated { .. } => report.migrated += 1,
                OpenOutcome::ReadOnly { reason, .. } => note_read_only(&mut report, key, *reason),
                OpenOutcome::StartEmpty { .. } => {
                    if !report.start_empty.iter().any(|k| k == key) {
                        report.start_empty.push(key.to_string());
                    }
                }
                OpenOutcome::Missing | OpenOutcome::Ok | OpenOutcome::CacheDiscarded => {}
            },
            // The host refuses only a row it never opens; a store that cannot be used is read-only.
            Err(_) => note_read_only(&mut report, key, ReadOnlyReason::Failed),
        }
    }
    report.elapsed_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX);
    crate::shell_log(&summary_line(&report));
    report
}

/// [`open_all_with`] bounded by the app-wide shutdown token.
pub(crate) fn open_all(
    host: &StoreHost,
    user_data: &Path,
    max_files: usize,
    max_ms: u64,
) -> BootReport {
    let token = gamelib_core::shutdown::global().token();
    open_all_with(host, user_data, max_files, max_ms, &|| token.is_cancelled())
}

fn note_read_only(report: &mut BootReport, key: &str, reason: ReadOnlyReason) {
    if !report
        .read_only
        .iter()
        .any(|(k, r)| k == key && *r == reason)
    {
        report.read_only.push((key.to_string(), reason));
    }
}

/// `store boot: <n> opened, <a> adopted, <m> migrated, <r> read-only, <e> start-empty, <d> deferred
/// in <ms> ms`: counts only.
pub(crate) fn summary_line(r: &BootReport) -> String {
    format!(
        "store boot: {} opened, {} adopted, {} migrated, {} read-only, {} start-empty, {} deferred in {} ms",
        r.opened,
        r.adopted,
        r.migrated,
        r.read_only.len(),
        r.start_empty.len(),
        r.deferred,
        r.elapsed_ms
    )
}

fn reason_word(reason: ReadOnlyReason) -> &'static str {
    match reason {
        ReadOnlyReason::Newer => "newer",
        ReadOnlyReason::Failed => "failed",
    }
}

/// The most bytes of store entries `GAMELIB_STORE_BOOT` carries (B-WR-03). One environment variable
/// is capped at 32,767 characters on Windows and one string at 131,072 bytes on Linux, and past
/// either `Command::spawn` fails, so a downgrade that opens thousands of `GamesConfig/<app>`
/// documents read-only would otherwise leave GameLib unable to start. The variable is only the
/// mirror's synchronous boot hint: the host's own `changed`/`refused` events and the read-only
/// notice carry the rest, and a write to an omitted store is refused by the shell and dropped by
/// the mirror.
pub(crate) const BOOT_ENV_MAX_BYTES: usize = 16 * 1024;

/// The `GAMELIB_STORE_BOOT` value: `{"readOnly":[{"store":"<key>","reason":"newer"|"failed"}],
/// "startEmpty":["<key>"]}`, or `None` when no store is read-only or empty. Entries beyond
/// [`BOOT_ENV_MAX_BYTES`] are left out and `"truncated":true` is appended after `startEmpty`.
///
/// What is kept is chosen by importance, not report order (D-WR-02). The report follows table order,
/// where hundreds of per-game `GamesConfig/<app>` documents sort ahead of `steam_store/config`,
/// `store/*` and the caches, so a cut in report order would lose exactly the stores the mirror most
/// needs to know about. The budget goes first to every non-`GamesConfig` read-only store, then to
/// every start-empty cache, and last to the `GamesConfig/*` documents, so a cut only loses per-game
/// ones. Within a tier the report order holds.
pub(crate) fn boot_env_value(report: &BootReport) -> Option<String> {
    if report.read_only.is_empty() && report.start_empty.is_empty() {
        return None;
    }
    // Written by hand so the documented key order holds; each key goes through serde_json's string
    // escaping.
    let quoted = |s: &str| serde_json::to_string(s).unwrap_or_else(|_| "\"\"".to_string());
    let read_only_entry = |key: &str, reason: ReadOnlyReason| {
        format!(
            "{{\"store\":{},\"reason\":\"{}\"}}",
            quoted(key),
            reason_word(reason)
        )
    };
    let is_per_game = |key: &str| key.starts_with("GamesConfig/");
    let mut used = 0usize;
    let mut truncated = false;
    // An entry that does not fit is skipped and marks the cut; a shorter one after it may still fit.
    let mut take = |entry: String| -> Option<String> {
        // One byte for the separating comma.
        if used + entry.len() + 1 > BOOT_ENV_MAX_BYTES {
            truncated = true;
            return None;
        }
        used += entry.len() + 1;
        Some(entry)
    };
    let mut read_only: Vec<String> = Vec::new();
    for (key, reason) in report.read_only.iter().filter(|(k, _)| !is_per_game(k)) {
        read_only.extend(take(read_only_entry(key, *reason)));
    }
    let start_empty: Vec<String> = report
        .start_empty
        .iter()
        .filter_map(|k| take(quoted(k)))
        .collect();
    for (key, reason) in report.read_only.iter().filter(|(k, _)| is_per_game(k)) {
        read_only.extend(take(read_only_entry(key, *reason)));
    }
    let marker = if truncated { ",\"truncated\":true" } else { "" };
    Some(format!(
        "{{\"readOnly\":[{}],\"startEmpty\":[{}]{marker}}}",
        read_only.join(","),
        start_empty.join(",")
    ))
}

static HOST: OnceLock<Arc<StoreHost>> = OnceLock::new();

/// The one store host of the process. `run_setup` is the first to ask for it, so it is created
/// there, once, before the sidecar is spawned.
pub(crate) fn host() -> &'static Arc<StoreHost> {
    HOST.get_or_init(|| Arc::new(StoreHost::new()))
}

/// The `store` exit drain: waits up to `bound` for the sidecar's queued store frames to be applied
/// and for in-flight applies to finish, and returns `true` when work is still pending, so the
/// caller holds the drain open and the exit deadline line names it. The frame queue is drained
/// first (it feeds the host), then the host gets what is left of the bound. The drain holds no
/// registrant of its own: the frame worker holds one while frames are queued (`store_dispatch`),
/// and a permanent one would report on every exit.
pub(crate) fn drain(bound: Duration) -> bool {
    let start = Instant::now();
    let queue_idle = crate::store_dispatch::wait_idle(bound);
    let host_idle = host().wait_idle(bound.saturating_sub(start.elapsed()));
    !(queue_idle && host_idle)
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_store::table::row_for_key;
    use gamelib_testutil::FakeHome;
    use std::fs;

    fn row(key: &str) -> &'static TableRow {
        row_for_key(key).unwrap_or_else(|| panic!("no row {key}"))
    }

    #[test]
    fn every_row_but_the_excluded_one_is_rust_owned() {
        for row in table() {
            assert_eq!(
                is_rust_owned(row),
                row.family != Family::Excluded,
                "{}",
                row.key
            );
        }
        assert!(is_rust_owned(row("store/uploadedLogs")));
        assert!(is_rust_owned(row("store_cache/steam_metadata")));
        assert!(is_rust_owned(row("steam_store/config")));
        assert!(is_rust_owned(row("settings/global")));
        assert!(!is_rust_owned(row("store/migrations")));
        assert_eq!(
            table()
                .iter()
                .filter(|r| r.family == Family::Excluded)
                .count(),
            1,
            "store/migrations is the one row neither side opens (D-07)"
        );
    }

    #[test]
    fn the_env_value_has_the_documented_shape_and_is_none_when_nothing_is_wrong() {
        assert_eq!(boot_env_value(&BootReport::default()), None);
        let busy = BootReport {
            opened: 9,
            adopted: 4,
            ..BootReport::default()
        };
        assert_eq!(
            boot_env_value(&busy),
            None,
            "counts alone are not worth an env var"
        );
        let report = BootReport {
            read_only: vec![
                ("store/config".to_string(), ReadOnlyReason::Newer),
                ("steam_store/config".to_string(), ReadOnlyReason::Failed),
            ],
            start_empty: vec!["store_cache/steam_metadata".to_string()],
            ..BootReport::default()
        };
        let value = boot_env_value(&report).unwrap();
        assert_eq!(
            value,
            "{\"readOnly\":[{\"store\":\"store/config\",\"reason\":\"newer\"},{\"store\":\"steam_store/config\",\"reason\":\"failed\"}],\"startEmpty\":[\"store_cache/steam_metadata\"]}"
        );
        let parsed: serde_json::Value = serde_json::from_str(&value).unwrap();
        assert_eq!(parsed["readOnly"][1]["reason"], "failed");
        assert_eq!(parsed["startEmpty"][0], "store_cache/steam_metadata");
    }

    #[test]
    fn a_huge_downgrade_report_is_capped_and_marked_truncated() {
        let report = BootReport {
            read_only: (0..10_000)
                .map(|i| (format!("GamesConfig/{i}"), ReadOnlyReason::Newer))
                .collect(),
            start_empty: vec!["store_cache/steam_metadata".to_string()],
            ..BootReport::default()
        };
        let value = boot_env_value(&report).unwrap();
        assert!(value.len() <= BOOT_ENV_MAX_BYTES + 64, "{}", value.len());
        let parsed: serde_json::Value = serde_json::from_str(&value).unwrap();
        assert_eq!(parsed["truncated"], true);
        let kept = parsed["readOnly"].as_array().unwrap().len();
        assert!(kept > 100 && kept < 10_000, "{kept}");
        assert_eq!(parsed["readOnly"][0]["store"], "GamesConfig/0");
        // A report that fits carries no marker.
        let small = BootReport {
            read_only: vec![("store/config".to_string(), ReadOnlyReason::Newer)],
            ..BootReport::default()
        };
        assert!(!boot_env_value(&small).unwrap().contains("truncated"));
    }

    #[test]
    fn a_truncated_report_keeps_the_core_stores_and_the_caches_and_cuts_per_game_documents() {
        // Table order: per-game documents sort ahead of `steam_store/config` and `store/*`.
        let mut read_only: Vec<(String, ReadOnlyReason)> = (0..10_000)
            .map(|i| (format!("GamesConfig/{i}"), ReadOnlyReason::Newer))
            .collect();
        read_only.push(("steam_store/config".to_string(), ReadOnlyReason::Newer));
        read_only.push(("store/config".to_string(), ReadOnlyReason::Newer));
        read_only.push(("store/timestamp".to_string(), ReadOnlyReason::Failed));
        let report = BootReport {
            read_only,
            start_empty: vec!["store_cache/steam_metadata".to_string()],
            ..BootReport::default()
        };
        let value = boot_env_value(&report).unwrap();
        assert!(value.len() <= BOOT_ENV_MAX_BYTES + 64, "{}", value.len());
        let parsed: serde_json::Value = serde_json::from_str(&value).unwrap();
        assert_eq!(parsed["truncated"], true);
        let kept: Vec<&str> = parsed["readOnly"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| e["store"].as_str().unwrap())
            .collect();
        for core in ["steam_store/config", "store/config", "store/timestamp"] {
            assert!(kept.contains(&core), "{core} was cut");
        }
        assert_eq!(parsed["startEmpty"][0], "store_cache/steam_metadata");
        let per_game = kept
            .iter()
            .filter(|k| k.starts_with("GamesConfig/"))
            .count();
        assert!(per_game > 100 && per_game < 10_000, "{per_game}");
    }

    #[test]
    fn the_summary_line_is_counts_only() {
        let report = BootReport {
            opened: 10,
            adopted: 7,
            migrated: 1,
            read_only: vec![("store/config".to_string(), ReadOnlyReason::Newer)],
            start_empty: vec![],
            deferred: 20,
            elapsed_ms: 12,
        };
        assert_eq!(
            summary_line(&report),
            "store boot: 10 opened, 7 adopted, 1 migrated, 1 read-only, 0 start-empty, 20 deferred in 12 ms"
        );
    }

    /// Writes `{"a":1}` (a baseline file, adopted without a write) for the first `n` Rust-owned
    /// stores with a plain `<dir>/<name>.json` path.
    fn plant(home: &FakeHome, n: usize) -> usize {
        let mut planted = 0;
        for row in table() {
            if planted == n {
                break;
            }
            let (Some(name), true) = (&row.name, is_rust_owned(row)) else {
                continue;
            };
            if row.key.starts_with("settings/") {
                continue;
            }
            let dir = home.root().join(&row.dir);
            fs::create_dir_all(&dir).unwrap();
            fs::write(dir.join(format!("{name}.json")), "{\"a\":1}").unwrap();
            planted += 1;
        }
        planted
    }

    fn open(home: &FakeHome, max_files: usize, max_ms: u64) -> (StoreHost, BootReport) {
        let host = StoreHost::new();
        let report = open_all_with(&host, home.root(), max_files, max_ms, &|| false);
        (host, report)
    }

    #[test]
    fn open_all_stops_at_the_file_cap_and_counts_the_rest_as_deferred() {
        let home = FakeHome::new("gamelib-store-boot-");
        assert_eq!(plant(&home, 30), 30);
        let (_host, report) = open(&home, 10, 60_000);
        assert_eq!(report.opened, 10);
        assert_eq!(report.deferred, 20);
        // Some of the 30 have a migration chain, so they are migrated or discarded, not adopted.
        assert!(report.adopted + report.migrated <= report.opened);
        assert!(report.read_only.is_empty() && report.start_empty.is_empty());
        assert!(
            summary_line(&report).starts_with("store boot: 10 opened, "),
            "{}",
            summary_line(&report)
        );
        assert!(summary_line(&report).contains(", 20 deferred in "));
        // No cap reached: everything opens.
        let (_host, report) = open(&home, 10_000, 60_000);
        assert_eq!((report.opened, report.deferred), (30, 0));
    }

    #[test]
    fn open_all_stops_at_the_time_cap_and_when_shutdown_is_cancelled() {
        let home = FakeHome::new("gamelib-store-boot-");
        plant(&home, 12);
        let (_host, report) = open(&home, 10_000, 0);
        assert_eq!((report.opened, report.deferred), (0, 12));
        let host = StoreHost::new();
        let report = open_all_with(&host, home.root(), 10_000, 60_000, &|| true);
        assert_eq!((report.opened, report.deferred), (0, 12));
    }

    #[test]
    fn open_all_reports_a_newer_store_read_only_and_a_corrupt_cache_start_empty() {
        let home = FakeHome::new("gamelib-store-boot-");
        let newer = "{\n\t\"a\": 1,\n\t\"__internal__\": {\n\t\t\"gamelib\": {\n\t\t\t\"schemaVersion\": 9\n\t\t}\n\t}\n}";
        let store = home.root().join("store");
        let cache = home.root().join("store_cache");
        fs::create_dir_all(&store).unwrap();
        fs::create_dir_all(&cache).unwrap();
        fs::write(store.join("config.json"), newer).unwrap();
        fs::write(cache.join("steam_metadata.json"), "{ not json").unwrap();
        let (host, report) = open(&home, 10_000, 60_000);
        assert_eq!(
            report.read_only,
            vec![("store/config".to_string(), ReadOnlyReason::Newer)]
        );
        assert_eq!(
            report.start_empty,
            vec!["store_cache/steam_metadata".to_string()]
        );
        // The newer file is never rewritten, the corrupt one is kept and copied aside.
        assert_eq!(
            fs::read_to_string(store.join("config.json")).unwrap(),
            newer
        );
        assert_eq!(
            fs::read_to_string(cache.join("steam_metadata.json")).unwrap(),
            "{ not json"
        );
        assert_eq!(host.read_only_entries().len(), 1);
        let env = boot_env_value(&report).unwrap();
        assert!(
            env.contains("\"store/config\"") && env.contains("\"newer\""),
            "{env}"
        );
        assert!(
            !env.contains("not json") && !env.contains('1'),
            "no value may travel: {env}"
        );
    }

    #[test]
    fn open_all_walks_games_config_and_skips_side_files() {
        let home = FakeHome::new("gamelib-store-boot-");
        let games = home.root().join("GamesConfig");
        fs::create_dir_all(&games).unwrap();
        for name in [
            "480.json",
            "my.game.json",
            "480.v1.20261121T090000000Z.bak.json",
            "480.corrupt.20261121T090000000Z.json",
            "notes.txt",
        ] {
            fs::write(games.join(name), "{\"version\":\"v2\"}").unwrap();
        }
        fs::write(home.root().join("config.json"), "{\"version\":\"v2\"}").unwrap();
        let (_host, report) = open(&home, 10_000, 60_000);
        assert_eq!(report.opened, 3, "config.json and the two game files");
    }

    #[test]
    fn store_boot_never_opens_migrations_json() {
        let home = FakeHome::new("gamelib-store-boot-");
        let dir = home.root().join("store");
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("migrations.json");
        fs::write(&file, "{\"ran\":[\"a\"]}").unwrap();
        let before = fs::metadata(&file).unwrap().modified().unwrap();
        // Every other row is Rust's (85-21): the excluded row still never opens (D-07).
        let (host, report) = open(&home, 10_000, 60_000);
        assert_eq!((report.opened, report.deferred), (0, 0));
        assert_eq!(fs::read_to_string(&file).unwrap(), "{\"ran\":[\"a\"]}");
        assert_eq!(fs::metadata(&file).unwrap().modified().unwrap(), before);
        assert!(host.open_cache(&dir, "migrations").is_err());
        let names: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(
            names,
            ["migrations.json"],
            "no side file may appear beside it"
        );
    }

    #[test]
    fn the_drain_is_idle_when_nothing_is_writing() {
        assert!(
            !drain(Duration::from_millis(5)),
            "idle host: nothing to hold open"
        );
    }

    const CORPUS_DIR: &str = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/crates/gamelib-store/tests/fixtures/corpus"
    );

    /// The cache-family corpus files that read as stores (the `roundtrip` ones), by table key: the
    /// first corpus file of each cache row.
    fn corpus_cache_files() -> Vec<(&'static TableRow, PathBuf)> {
        let text = fs::read_to_string(format!("{CORPUS_DIR}/MANIFEST.json")).unwrap();
        let manifest: serde_json::Value = serde_json::from_str(&text).unwrap();
        let mut found: Vec<(&'static TableRow, PathBuf)> = Vec::new();
        for entry in manifest["files"].as_array().unwrap() {
            let (Some(key), Some(path)) = (entry["tableKey"].as_str(), entry["path"].as_str())
            else {
                continue;
            };
            let Some(row) = row_for_key(key) else {
                continue;
            };
            if row.family != Family::Cache
                || entry["expect"] != "roundtrip"
                || entry["sha256"].is_null()
                || found.iter().any(|(r, _)| r.key == row.key)
            {
                continue;
            }
            found.push((row, PathBuf::from(format!("{CORPUS_DIR}/{path}"))));
        }
        found
    }

    #[test]
    fn open_all_opens_every_cache_row() {
        let home = FakeHome::new("gamelib-store-boot-");
        let corpus = corpus_cache_files();
        let cache_rows: Vec<&TableRow> = table()
            .iter()
            .filter(|r| r.family == Family::Cache && r.name.is_some())
            .collect();
        assert!(cache_rows.len() >= 20, "{} cache rows", cache_rows.len());
        // The real corpus file where there is one, a baseline file for the rest.
        let mut from_corpus = 0;
        for row in &cache_rows {
            let dir = home.root().join(&row.dir);
            fs::create_dir_all(&dir).unwrap();
            let target = dir.join(format!("{}.json", row.name.as_deref().unwrap()));
            match corpus.iter().find(|(r, _)| r.key == row.key) {
                Some((_, from)) => {
                    fs::copy(from, &target).unwrap();
                    from_corpus += 1;
                }
                None => fs::write(&target, "{\"a\":1}").unwrap(),
            }
        }
        assert!(
            from_corpus >= 10,
            "{from_corpus} cache rows held a corpus file"
        );
        let (host, report) = open(&home, 10_000, 60_000);
        assert_eq!(report.opened, cache_rows.len());
        assert_eq!(report.deferred, 0);
        assert!(report.read_only.is_empty(), "{:?}", report.read_only);
        assert!(report.start_empty.is_empty(), "{:?}", report.start_empty);
        assert!(host.read_only_entries().is_empty());
        eprintln!(
            "cache family: {} cache rows opened, {} from the corpus",
            cache_rows.len(),
            from_corpus
        );
    }

    #[test]
    fn open_all_copies_a_corrupt_cache_aside_lists_it_start_empty_and_keeps_the_original() {
        let home = FakeHome::new("gamelib-store-boot-");
        let corrupt = fs::read(format!(
            "{CORPUS_DIR}/edge/store_cache/edge_corrupt_cache.json"
        ))
        .unwrap();
        assert!(serde_json::from_slice::<serde_json::Value>(&corrupt).is_err());
        let dir = home.root().join("store_cache");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("wikigameinfo.json"), &corrupt).unwrap();
        fs::write(dir.join("umu.json"), "{\"a\":1}").unwrap();
        let (_host, report) = open(&home, 10_000, 60_000);
        assert_eq!(report.opened, 2);
        assert_eq!(
            report.start_empty,
            vec!["store_cache/wikigameinfo".to_string()]
        );
        assert!(report.read_only.is_empty());
        // The byte copy exists, and the original is not touched by opening.
        let copies: Vec<PathBuf> = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.starts_with("wikigameinfo.corrupt.") && n.ends_with(".json"))
            })
            .collect();
        assert_eq!(copies.len(), 1, "{copies:?}");
        assert_eq!(fs::read(&copies[0]).unwrap(), corrupt);
        assert_eq!(fs::read(dir.join("wikigameinfo.json")).unwrap(), corrupt);
        // GAMELIB_STORE_BOOT names the key in startEmpty and nothing else.
        let env: serde_json::Value =
            serde_json::from_str(&boot_env_value(&report).unwrap()).unwrap();
        assert_eq!(
            env["startEmpty"],
            serde_json::json!(["store_cache/wikigameinfo"])
        );
        assert_eq!(env["readOnly"], serde_json::json!([]));
        // Boot again over the same files (a second launch with the file still unreadable): the
        // cache still starts empty, and the copies stay bounded by the engine's own rotation.
        let (_again, second) = open(&home, 10_000, 60_000);
        assert_eq!(
            second.start_empty,
            vec!["store_cache/wikigameinfo".to_string()]
        );
        let after = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().contains(".corrupt."))
            .count();
        assert!((1..=2).contains(&after), "{after} copies after two boots");
    }

    /// An older-version corpus file of a user-state row (`expect: migrate`), the file the Rust
    /// engine migrates at boot: its row, the stored bytes, and the bytes the real TS chains produced.
    struct OlderUserState {
        row: &'static TableRow,
        file: String,
        stored: Vec<u8>,
        expected: Vec<u8>,
    }

    fn older_user_state_files() -> Vec<OlderUserState> {
        let text = fs::read_to_string(format!("{CORPUS_DIR}/MANIFEST.json")).unwrap();
        let manifest: serde_json::Value = serde_json::from_str(&text).unwrap();
        let expected_dir = format!(
            "{}/crates/gamelib-store/tests/fixtures/corpus-expected",
            env!("CARGO_MANIFEST_DIR")
        );
        let mut found = Vec::new();
        for entry in manifest["files"].as_array().unwrap() {
            let (Some(key), Some(path)) = (entry["tableKey"].as_str(), entry["path"].as_str())
            else {
                continue;
            };
            let Some(row) = row_for_key(key) else {
                continue;
            };
            if row.family != Family::UserState || entry["expect"] != "migrate" {
                continue;
            }
            found.push(OlderUserState {
                row,
                file: path.rsplit('/').next().unwrap().to_string(),
                stored: fs::read(format!("{CORPUS_DIR}/{path}")).unwrap(),
                expected: fs::read(format!("{expected_dir}/{path}")).unwrap(),
            });
        }
        found
    }

    /// Plants the older file at its row's own path under `home` and returns that path.
    fn plant_older(home: &FakeHome, older: &OlderUserState) -> PathBuf {
        let dir = home.root().join(&older.row.dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{}.json", older.row.name.as_deref().unwrap()));
        fs::write(&path, &older.stored).unwrap();
        path
    }

    /// The backups the engine wrote beside `path` for its store: `<name>.v<N>.<stamp>.bak.json`.
    fn backups_beside(path: &Path) -> Vec<PathBuf> {
        let name = path.file_stem().unwrap().to_string_lossy().into_owned();
        let mut found: Vec<PathBuf> = fs::read_dir(path.parent().unwrap())
            .unwrap()
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                p.file_name().and_then(|n| n.to_str()).is_some_and(|n| {
                    n.starts_with(&format!("{name}.v")) && n.ends_with(".bak.json")
                })
            })
            .collect();
        found.sort();
        found
    }

    /// D-12 at boot: `open_all` migrates an older-version library before `spawn_sidecar_state`
    /// (which runs after it in `run_setup`), so the sidecar's mirror only ever loads current-version
    /// data. The pre-migration backup holds the stored bytes and the migrated bytes equal what the
    /// real TS chains produced.
    #[test]
    fn store_boot_migrates_older_library_before_spawn() {
        let older = older_user_state_files()
            .into_iter()
            .find(|o| {
                o.row.key == "store_cache/steam_library" && o.file.starts_with("steam_library.v1.")
            })
            .expect("a v1 steam_library corpus file");
        assert_ne!(older.stored, older.expected, "the corpus file is older");
        let home = FakeHome::new("gamelib-store-boot-");
        let path = plant_older(&home, &older);
        let (host, report) = open(&home, 10_000, 60_000);
        assert_eq!(
            (
                report.opened,
                report.migrated,
                report.adopted,
                report.deferred
            ),
            (1, 1, 0, 0)
        );
        assert!(report.read_only.is_empty() && report.start_empty.is_empty());
        assert!(
            summary_line(&report).contains(", 1 migrated, "),
            "{}",
            summary_line(&report)
        );
        assert_eq!(
            fs::read(&path).unwrap(),
            older.expected,
            "the file holds the migrated bytes at boot, before anything else reads it"
        );
        let backups = backups_beside(&path);
        assert_eq!(backups.len(), 1, "{backups:?}");
        assert!(backups[0]
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("steam_library.v1."));
        assert_eq!(fs::read(&backups[0]).unwrap(), older.stored);
        // The host holds the migrated store open; GAMELIB_STORE_BOOT has nothing to report.
        assert!(host.read_only_entries().is_empty());
        assert_eq!(boot_env_value(&report), None);
    }

    /// Every older-version user-state corpus file (7 rows, v0/v1/v2 captures) migrates at boot with
    /// a backup of its stored bytes and the bytes the TS chains produced.
    #[test]
    fn store_boot_migrates_every_older_user_state_corpus_file() {
        let all = older_user_state_files();
        assert!(
            all.len() >= 14,
            "{} older user-state corpus files",
            all.len()
        );
        let rows: std::collections::BTreeSet<&str> =
            all.iter().map(|o| o.row.key.as_str()).collect();
        for key in [
            "store_cache/steam_library",
            "store_cache/gog_library",
            "store_cache/legendary_library",
            "store_cache/nile_library",
            "gog_store/installed",
            "sideload_apps/library",
            "store/download-manager",
        ] {
            assert!(rows.contains(key), "no older corpus file for {key}");
        }
        for older in &all {
            let home = FakeHome::new("gamelib-store-boot-");
            let path = plant_older(&home, older);
            let (_host, report) = open(&home, 10_000, 60_000);
            assert_eq!(
                (report.opened, report.migrated),
                (1, 1),
                "{} {}",
                older.row.key,
                older.file
            );
            assert_eq!(fs::read(&path).unwrap(), older.expected, "{}", older.file);
            let backups = backups_beside(&path);
            assert_eq!(backups.len(), 1, "{}: {backups:?}", older.file);
            assert_eq!(
                fs::read(&backups[0]).unwrap(),
                older.stored,
                "{}",
                older.file
            );
        }
    }

    // ---- 85-15: the settings family at boot -------------------------------------------------

    /// An older-version settings document of the corpus (`expect: migrate`, the TS oracle said
    /// `migrated`): its row, the stored bytes, and the bytes the real TS chains produced at the
    /// corpus placement (`config.json`, `GamesConfig/app.json`).
    struct OlderSettings {
        global: bool,
        path: String,
        stored: Vec<u8>,
        expected: Vec<u8>,
    }

    fn older_settings_documents() -> Vec<OlderSettings> {
        let text = fs::read_to_string(format!("{CORPUS_DIR}/MANIFEST.json")).unwrap();
        let manifest: serde_json::Value = serde_json::from_str(&text).unwrap();
        let expected_dir = format!(
            "{}/crates/gamelib-store/tests/fixtures/corpus-expected",
            env!("CARGO_MANIFEST_DIR")
        );
        let outcomes: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(format!("{expected_dir}/outcomes.json")).unwrap(),
        )
        .unwrap();
        let migrated: Vec<&str> = outcomes
            .as_array()
            .unwrap()
            .iter()
            .filter(|o| o["result"] == "migrated")
            .filter_map(|o| o["path"].as_str())
            .collect();
        let mut found = Vec::new();
        for entry in manifest["files"].as_array().unwrap() {
            let (Some(key), Some(path)) = (entry["tableKey"].as_str(), entry["path"].as_str())
            else {
                continue;
            };
            if !key.starts_with("settings/") || !migrated.contains(&path) {
                continue;
            }
            found.push(OlderSettings {
                global: key == "settings/global",
                path: path.to_string(),
                stored: fs::read(format!("{CORPUS_DIR}/{path}")).unwrap(),
                expected: fs::read(format!("{expected_dir}/{path}")).unwrap(),
            });
        }
        found
    }

    /// Research A4 / D-12 at boot: `open_all` migrates every older config.json and GamesConfig
    /// document before `spawn_sidecar_state`, each behind one backup holding the stored bytes, and
    /// the migrated bytes equal the TS oracle's, so GameConfig's synchronous reads never see an
    /// unmigrated document.
    #[test]
    fn store_boot_migrates_every_older_settings_document_before_spawn() {
        let older = older_settings_documents();
        let (globals, games) = (
            older.iter().filter(|o| o.global).count(),
            older.iter().filter(|o| !o.global).count(),
        );
        assert!(globals >= 3, "only {globals} older config.json files");
        assert!(games >= 40, "only {games} older GamesConfig documents");
        for doc in &older {
            let home = FakeHome::new("gamelib-store-boot-settings-");
            let path = if doc.global {
                home.root().join("config.json")
            } else {
                home.root().join("GamesConfig").join("app.json")
            };
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, &doc.stored).unwrap();

            let (host, report) = open(&home, BOOT_SWEEP_MAX_FILES, BOOT_SWEEP_MAX_MS);
            assert_eq!(
                (report.opened, report.migrated, report.deferred),
                (1, 1, 0),
                "{}",
                doc.path
            );
            assert!(
                report.read_only.is_empty(),
                "{}: {:?}",
                doc.path,
                report.read_only
            );
            assert_eq!(
                String::from_utf8_lossy(&fs::read(&path).unwrap()),
                String::from_utf8_lossy(&doc.expected),
                "{}: migrated bytes differ from the TS oracle",
                doc.path
            );
            let backups = backups_beside(&path);
            assert_eq!(backups.len(), 1, "{}: {backups:?}", doc.path);
            assert_eq!(fs::read(&backups[0]).unwrap(), doc.stored, "{}", doc.path);
            // The frame worker reaches the same store under the document key: a reopen is the
            // migrated store, not a second migration.
            let key = if doc.global {
                "settings/global".to_string()
            } else {
                "GamesConfig/app".to_string()
            };
            let store = host.open_doc(&key, path.clone()).unwrap();
            assert_eq!(store.key(), key);
            assert!(matches!(store.open_outcome(), OpenOutcome::Migrated { .. }));
        }
    }

    #[test]
    fn store_boot_reports_a_settings_document_by_its_document_key() {
        let home = FakeHome::new("gamelib-store-boot-settings-");
        let games = home.root().join("GamesConfig");
        fs::create_dir_all(&games).unwrap();
        fs::write(games.join("480.json"), "{\"480\":{},\"version\":\"v9\"}").unwrap();
        fs::write(games.join("620.json"), "{not json").unwrap();
        // A stem no frame could carry is not Rust's: never opened, never reported.
        fs::write(games.join("a..b.json"), "{\"version\":\"v2\"}").unwrap();
        fs::write(home.root().join("config.json"), "{\"version\":\"v2\"}").unwrap();

        let (host, report) = open(&home, BOOT_SWEEP_MAX_FILES, 60_000);
        assert_eq!(report.opened, 3, "config.json, 480 and 620");
        assert_eq!(
            report.read_only,
            vec![
                ("GamesConfig/480".to_string(), ReadOnlyReason::Newer),
                ("GamesConfig/620".to_string(), ReadOnlyReason::Failed),
            ]
        );
        let env = boot_env_value(&report).unwrap();
        assert!(
            env.contains("{\"store\":\"GamesConfig/480\",\"reason\":\"newer\"}"),
            "{env}"
        );
        assert!(!env.contains("a..b"), "{env}");
        // The corrupt one is kept byte-identical beside its copy (D-18).
        assert_eq!(
            fs::read_to_string(games.join("620.json")).unwrap(),
            "{not json"
        );
        let keys: Vec<String> = host.read_only_entries().into_iter().map(|e| e.0).collect();
        assert_eq!(keys, ["GamesConfig/480", "GamesConfig/620"]);
    }

    #[test]
    fn store_boot_settings_documents_respect_the_boot_bound() {
        let home = FakeHome::new("gamelib-store-boot-settings-");
        let games = home.root().join("GamesConfig");
        fs::create_dir_all(&games).unwrap();
        for app in 0..6 {
            fs::write(
                games.join(format!("{app}.json")),
                format!("{{\"{app}\":{{}},\"version\":\"v2\"}}"),
            )
            .unwrap();
        }
        let (_host, report) = open(&home, 2, 60_000);
        assert_eq!((report.opened, report.deferred), (2, 4));
        let (_host, report) = open(&home, 10_000, 0);
        assert_eq!((report.opened, report.deferred), (0, 6));
    }
}
