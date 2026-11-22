//! The shell's store boot (Phase 85, FND-06): which stores Rust owns, opening them once at start
//! within a bound, telling the sidecar what is read-only, and the exit drain.
//!
//! `GAMELIB_STORE=rust|ts` is read once at boot (D-01): unset is `rust`; anything else that is not
//! `ts` is `ts` with one warning naming it. `src/common/types/ipc/storeOwnership.json` holds the
//! per-family flags and per-store overrides, both read by Rust here and by the TS side; every flag
//! is `false` until the plan that moves that family flips it. Rust opens at boot only the rows it
//! owns: `native` always, `excluded` (`store/migrations`, D-07) never, the rest only when the mode
//! is `rust` and the store's own flag, or failing that its family's, is set.
//!
//! Boot opening is bounded (Rust shutdown contract: bound boot work): it stops at
//! [`BOOT_SWEEP_MAX_FILES`] files or [`BOOT_SWEEP_MAX_MS`] milliseconds or when the shutdown token
//! is cancelled, and the files it did not reach are opened lazily on first use and counted in the
//! one summary line. It runs only inside `run_setup`, after `acquire_single_instance` has made this
//! process the primary, so a second GameLib instance never opens or migrates a store file.
//!
//! The summary line, the `GAMELIB_STORE_BOOT` value and the read-only entries carry store keys, reason words
//! and counts, never a value: these files hold tokens and `gamelib.log` is the file users upload.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

use gamelib_store::engine::{OpenOutcome, ReadOnlyReason};
use gamelib_store::host::StoreHost;
use gamelib_store::table::{row_for_path, table, Family, TableRow};
use serde::Deserialize;

/// How many files boot opens before it stops and leaves the rest to open on first use. From
/// 85-SPIKES.md "Constants" (S3): 106 files measured on the operator's profile; 20 x 106 = 2,120,
/// rounded up to the next power of ten.
pub(crate) const BOOT_SWEEP_MAX_FILES: usize = 10_000;

/// How long boot spends opening files before it stops. From 85-SPIKES.md "Constants" (S3): median
/// sweep 6.77 ms, so 10x is 68 ms and the 2000 ms floor applies; a full 10,000-file sweep
/// extrapolates to about 0.65 s warm, inside the cap.
pub(crate) const BOOT_SWEEP_MAX_MS: u64 = 2_000;

/// The longest `GAMELIB_STORE` value echoed into the warning.
const MODE_ECHO_MAX: usize = 32;

/// `GAMELIB_STORE`: who owns the stores the family flags have moved.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum StoreMode {
    Rust,
    Ts,
}

/// `GAMELIB_STORE`'s value to a mode. Unset or `rust` is Rust, `ts` is TS; any other value is TS
/// (the safe side: the stack that has always run) and one warning names it, sanitised and cut.
pub(crate) fn store_mode_from_env(v: Option<&str>) -> StoreMode {
    match v {
        None | Some("rust") => StoreMode::Rust,
        Some("ts") => StoreMode::Ts,
        Some(other) => {
            crate::shell_log(&unrecognised_mode_warning(other));
            StoreMode::Ts
        }
    }
}

fn unrecognised_mode_warning(value: &str) -> String {
    let echoed: String = crate::relay_commands::echo_channel(value)
        .chars()
        .take(MODE_ECHO_MAX)
        .collect();
    format!("WARN: GAMELIB_STORE={echoed} not recognised; using ts")
}

/// `storeOwnership.json`: `families` flags and per-store overrides, keyed by the store table key.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Ownership {
    #[serde(default)]
    families: HashMap<String, bool>,
    #[serde(default)]
    stores: HashMap<String, bool>,
}

const OWNERSHIP_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../src/common/types/ipc/storeOwnership.json"
));

impl Ownership {
    pub(crate) fn parse(json: &str) -> Result<Ownership, serde_json::Error> {
        serde_json::from_str(json)
    }

    /// The file compiled into the shell. A file that does not parse is a build defect.
    pub(crate) fn embedded() -> &'static Ownership {
        static OWNERSHIP: OnceLock<Ownership> = OnceLock::new();
        OWNERSHIP.get_or_init(|| {
            Ownership::parse(OWNERSHIP_JSON)
                .unwrap_or_else(|e| panic!("storeOwnership.json does not parse: {e}"))
        })
    }

    /// A store's own flag wins when it has one (so a store can be moved ahead of, or held behind,
    /// its family); otherwise its family's.
    fn flag(&self, row: &TableRow) -> bool {
        if let Some(on) = self.stores.get(&row.key) {
            return *on;
        }
        let family = match row.family {
            Family::Cache => "cache",
            Family::UserState => "user-state",
            Family::Account => "account",
            Family::Settings => "settings",
            Family::Native | Family::Excluded => return false,
        };
        self.families.get(family).copied().unwrap_or(false)
    }
}

/// Whether Rust opens this row at boot: `native` always, `excluded` never (D-07), the rest only in
/// `rust` mode and when the ownership file has moved them.
pub(crate) fn is_rust_owned(row: &TableRow, mode: StoreMode, ownership: &Ownership) -> bool {
    match row.family {
        Family::Native => true,
        Family::Excluded => false,
        _ => mode == StoreMode::Rust && ownership.flag(row),
    }
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

/// Opens every Rust-owned store file under `user_data` once, stopping at `max_files` files,
/// `max_ms` milliseconds or when `cancelled` says so; what it did not reach is counted as deferred.
/// `user_data` is both the user-data directory and the app folder (`config.json`, `GamesConfig`).
/// Writes the one summary line.
pub(crate) fn open_all_with(
    host: &StoreHost,
    mode: StoreMode,
    ownership: &Ownership,
    user_data: &Path,
    max_files: usize,
    max_ms: u64,
    cancelled: &dyn Fn() -> bool,
) -> BootReport {
    let start = Instant::now();
    let budget = Duration::from_millis(max_ms);
    let files = candidates(user_data, &|row| is_rust_owned(row, mode, ownership));
    let total = files.len();
    let mut report = BootReport::default();
    for (i, (row, path)) in files.into_iter().enumerate() {
        if report.opened >= max_files || start.elapsed() >= budget || cancelled() {
            report.deferred = total - i;
            break;
        }
        report.opened += 1;
        match host.open_row(row, path) {
            Ok(store) => match store.open_outcome() {
                OpenOutcome::Adopted => report.adopted += 1,
                OpenOutcome::Migrated { .. } => report.migrated += 1,
                OpenOutcome::ReadOnly { reason, .. } => {
                    note_read_only(&mut report, &row.key, *reason)
                }
                OpenOutcome::StartEmpty { .. } => {
                    if !report.start_empty.contains(&row.key) {
                        report.start_empty.push(row.key.clone());
                    }
                }
                OpenOutcome::Missing | OpenOutcome::Ok | OpenOutcome::CacheDiscarded => {}
            },
            // The host refuses only a row it never opens; a store that cannot be used is read-only.
            Err(_) => note_read_only(&mut report, &row.key, ReadOnlyReason::Failed),
        }
    }
    report.elapsed_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX);
    crate::shell_log(&summary_line(&report));
    report
}

/// [`open_all_with`] bounded by the app-wide shutdown token.
pub(crate) fn open_all(
    host: &StoreHost,
    mode: StoreMode,
    ownership: &Ownership,
    user_data: &Path,
    max_files: usize,
    max_ms: u64,
) -> BootReport {
    let token = gamelib_core::shutdown::global().token();
    open_all_with(host, mode, ownership, user_data, max_files, max_ms, &|| {
        token.is_cancelled()
    })
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

/// The `GAMELIB_STORE_BOOT` value: `{"readOnly":[{"store":"<key>","reason":"newer"|"failed"}],
/// "startEmpty":["<key>"]}`, or `None` when no store is read-only or empty.
pub(crate) fn boot_env_value(report: &BootReport) -> Option<String> {
    if report.read_only.is_empty() && report.start_empty.is_empty() {
        return None;
    }
    // Written by hand so the documented key order holds; each key goes through serde_json's string
    // escaping.
    let quoted = |s: &str| serde_json::to_string(s).unwrap_or_else(|_| "\"\"".to_string());
    let read_only: Vec<String> = report
        .read_only
        .iter()
        .map(|(key, reason)| {
            format!(
                "{{\"store\":{},\"reason\":\"{}\"}}",
                quoted(key),
                reason_word(*reason)
            )
        })
        .collect();
    let start_empty: Vec<String> = report.start_empty.iter().map(|k| quoted(k)).collect();
    Some(format!(
        "{{\"readOnly\":[{}],\"startEmpty\":[{}]}}",
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

    fn ownership(families: &[&str], stores: &[(&str, bool)]) -> Ownership {
        Ownership {
            families: families.iter().map(|f| ((*f).to_string(), true)).collect(),
            stores: stores.iter().map(|(k, v)| ((*k).to_string(), *v)).collect(),
        }
    }

    const ALL: [&str; 4] = ["cache", "user-state", "account", "settings"];

    fn row(key: &str) -> &'static TableRow {
        row_for_key(key).unwrap_or_else(|| panic!("no row {key}"))
    }

    #[test]
    fn the_mode_reads_unset_and_rust_as_rust_ts_as_ts_and_anything_else_as_ts() {
        assert_eq!(store_mode_from_env(None), StoreMode::Rust);
        assert_eq!(store_mode_from_env(Some("rust")), StoreMode::Rust);
        assert_eq!(store_mode_from_env(Some("ts")), StoreMode::Ts);
        assert_eq!(store_mode_from_env(Some("RUST")), StoreMode::Ts);
        assert_eq!(store_mode_from_env(Some("")), StoreMode::Ts);
    }

    #[test]
    fn the_warning_names_a_cut_and_sanitised_value() {
        let warning = unrecognised_mode_warning(
            "tauri\nFAKE LOG LINE and a very long tail past thirty-two chars",
        );
        assert!(!warning.contains('\n'), "{warning}");
        assert!(
            warning.starts_with("WARN: GAMELIB_STORE=tauri?FAKE LOG LINE"),
            "{warning}"
        );
        assert!(warning.ends_with(" not recognised; using ts"), "{warning}");
        let echoed = warning
            .trim_start_matches("WARN: GAMELIB_STORE=")
            .trim_end_matches(" not recognised; using ts");
        assert_eq!(echoed.chars().count(), 32);
        assert_eq!(
            crate::shell_log_level(&warning),
            gamelib_log::Level::Warning
        );
    }

    #[test]
    fn the_embedded_ownership_file_parses_and_flips_every_family() {
        let own = Ownership::embedded();
        assert_eq!(own.families.len(), 4);
        let mut on: Vec<&str> = own
            .families
            .iter()
            .filter(|(_, on)| **on)
            .map(|(name, _)| name.as_str())
            .collect();
        on.sort_unstable();
        assert_eq!(
            on,
            vec!["account", "cache", "settings", "user-state"],
            "the cache (85-12), user-state (85-13), account (85-14) and settings (85-15) families are flipped"
        );
        assert!(
            own.stores.is_empty(),
            "no per-store override: the 85-10 tracer's is gone, the family covers it"
        );
        for row in table() {
            let rust = is_rust_owned(row, StoreMode::Rust, own);
            let expected = matches!(
                row.family,
                Family::Native
                    | Family::Cache
                    | Family::UserState
                    | Family::Account
                    | Family::Settings
            );
            assert_eq!(rust, expected, "{}", row.key);
        }
    }

    #[test]
    fn native_is_always_owned_and_excluded_never() {
        let none = Ownership::default();
        let all = ownership(
            &ALL,
            &[("store/migrations", true), ("store/uploadedLogs", false)],
        );
        for mode in [StoreMode::Rust, StoreMode::Ts] {
            for own in [&none, &all] {
                assert!(is_rust_owned(row("store/uploadedLogs"), mode, own));
                assert!(!is_rust_owned(row("store/migrations"), mode, own));
            }
        }
    }

    #[test]
    fn a_cache_row_is_owned_only_in_rust_mode_with_its_family_or_its_own_flag_set() {
        let cache = row("store_cache/steam_metadata");
        let off = Ownership::default();
        let family = ownership(&["cache"], &[]);
        assert!(!is_rust_owned(cache, StoreMode::Rust, &off));
        assert!(is_rust_owned(cache, StoreMode::Rust, &family));
        assert!(!is_rust_owned(cache, StoreMode::Ts, &family));
        // A store's own flag moves it ahead of its family, or holds it behind.
        let ahead = ownership(&[], &[("store_cache/steam_metadata", true)]);
        assert!(is_rust_owned(cache, StoreMode::Rust, &ahead));
        let behind = ownership(&["cache"], &[("store_cache/steam_metadata", false)]);
        assert!(!is_rust_owned(cache, StoreMode::Rust, &behind));
        assert!(is_rust_owned(
            row("store_cache/steam_sync"),
            StoreMode::Rust,
            &behind
        ));
        // A family flag does not reach another family.
        assert!(!is_rust_owned(
            row("steam_store/config"),
            StoreMode::Rust,
            &family
        ));
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
    fn plant(home: &FakeHome, n: usize, own: &Ownership) -> usize {
        let mut planted = 0;
        for row in table() {
            if planted == n {
                break;
            }
            let (Some(name), true) = (&row.name, is_rust_owned(row, StoreMode::Rust, own)) else {
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

    fn open(
        home: &FakeHome,
        own: &Ownership,
        max_files: usize,
        max_ms: u64,
    ) -> (StoreHost, BootReport) {
        let host = StoreHost::new();
        let report = open_all_with(
            &host,
            StoreMode::Rust,
            own,
            home.root(),
            max_files,
            max_ms,
            &|| false,
        );
        (host, report)
    }

    #[test]
    fn open_all_stops_at_the_file_cap_and_counts_the_rest_as_deferred() {
        let home = FakeHome::new("gamelib-store-boot-");
        let own = ownership(&ALL, &[]);
        assert_eq!(plant(&home, 30, &own), 30);
        let (_host, report) = open(&home, &own, 10, 60_000);
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
        let (_host, report) = open(&home, &own, 10_000, 60_000);
        assert_eq!((report.opened, report.deferred), (30, 0));
    }

    #[test]
    fn open_all_stops_at_the_time_cap_and_when_shutdown_is_cancelled() {
        let home = FakeHome::new("gamelib-store-boot-");
        let own = ownership(&ALL, &[]);
        plant(&home, 12, &own);
        let (_host, report) = open(&home, &own, 10_000, 0);
        assert_eq!((report.opened, report.deferred), (0, 12));
        let host = StoreHost::new();
        let report = open_all_with(
            &host,
            StoreMode::Rust,
            &own,
            home.root(),
            10_000,
            60_000,
            &|| true,
        );
        assert_eq!((report.opened, report.deferred), (0, 12));
    }

    #[test]
    fn open_all_in_ts_mode_opens_only_the_native_store() {
        let home = FakeHome::new("gamelib-store-boot-");
        let own = ownership(&ALL, &[]);
        plant(&home, 8, &own);
        let dir = home.root().join("store");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("uploadedLogs.json"), "{}").unwrap();
        let host = StoreHost::new();
        let report = open_all_with(
            &host,
            StoreMode::Ts,
            &own,
            home.root(),
            10_000,
            60_000,
            &|| false,
        );
        assert_eq!(report.opened, 1);
        assert_eq!(report.deferred, 0);
    }

    #[test]
    fn open_all_reports_a_newer_store_read_only_and_a_corrupt_cache_start_empty() {
        let home = FakeHome::new("gamelib-store-boot-");
        let own = ownership(&ALL, &[]);
        let newer = "{\n\t\"a\": 1,\n\t\"__internal__\": {\n\t\t\"gamelib\": {\n\t\t\t\"schemaVersion\": 9\n\t\t}\n\t}\n}";
        let store = home.root().join("store");
        let cache = home.root().join("store_cache");
        fs::create_dir_all(&store).unwrap();
        fs::create_dir_all(&cache).unwrap();
        fs::write(store.join("config.json"), newer).unwrap();
        fs::write(cache.join("steam_metadata.json"), "{ not json").unwrap();
        let (host, report) = open(&home, &own, 10_000, 60_000);
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
    fn open_all_walks_games_config_when_the_settings_family_is_owned_and_skips_side_files() {
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
        let on = ownership(&["settings"], &[]);
        let (_host, report) = open(&home, &on, 10_000, 60_000);
        assert_eq!(report.opened, 3, "config.json and the two game files");
        let off = ownership(&["cache"], &[]);
        let (_host, report) = open(&home, &off, 10_000, 60_000);
        assert_eq!(report.opened, 0);
    }

    #[test]
    fn store_boot_never_opens_migrations_json() {
        let home = FakeHome::new("gamelib-store-boot-");
        let dir = home.root().join("store");
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("migrations.json");
        fs::write(&file, "{\"ran\":[\"a\"]}").unwrap();
        let before = fs::metadata(&file).unwrap().modified().unwrap();
        // Every family and an explicit per-store flag on: the excluded row still never opens.
        let own = ownership(&ALL, &[("store/migrations", true)]);
        let (host, report) = open(&home, &own, 10_000, 60_000);
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
    fn open_all_opens_every_cache_row_under_the_cache_family_and_leaves_every_other_family() {
        let own = ownership(&["cache"], &[]);
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
        // A user-state file sits in the same directory: the cache family does not reach it.
        let lib = home.root().join("store_cache").join("gog_library.json");
        fs::write(&lib, "{ not json").unwrap();
        let (host, report) = open(&home, &own, 10_000, 60_000);
        assert_eq!(report.opened, cache_rows.len());
        assert_eq!(report.deferred, 0);
        assert!(report.read_only.is_empty(), "{:?}", report.read_only);
        assert!(report.start_empty.is_empty(), "{:?}", report.start_empty);
        assert_eq!(fs::read_to_string(&lib).unwrap(), "{ not json");
        assert!(host.read_only_entries().is_empty());
        eprintln!(
            "cache family: {} cache rows opened, {} from the corpus",
            cache_rows.len(),
            from_corpus
        );
    }

    #[test]
    fn open_all_copies_a_corrupt_cache_aside_lists_it_start_empty_and_keeps_the_original() {
        let own = ownership(&["cache"], &[]);
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
        let (_host, report) = open(&home, &own, 10_000, 60_000);
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
        let (_again, second) = open(&home, &own, 10_000, 60_000);
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

    /// D-12 at boot: the shipped ownership file (user-state flipped) makes `open_all` migrate an
    /// older-version library before `spawn_sidecar_state` (which runs after it in `run_setup`), so
    /// the sidecar's mirror only ever loads current-version data. The pre-migration backup holds
    /// the stored bytes and the migrated bytes equal what the real TS chains produced.
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
        let (host, report) = open(&home, Ownership::embedded(), 10_000, 60_000);
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
            let (_host, report) = open(&home, Ownership::embedded(), 10_000, 60_000);
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

    /// `GAMELIB_STORE=ts` keeps the shipped ownership file but opens nothing it does not own: no
    /// user-state row is opened, migrated or backed up, and the older bytes stay as the TS engine
    /// will find them.
    #[test]
    fn store_boot_ts_mode_opens_no_user_state() {
        let own = Ownership::embedded();
        assert!(own.families.get("user-state").copied().unwrap_or(false));
        let home = FakeHome::new("gamelib-store-boot-");
        let mut planted: Vec<(PathBuf, Vec<u8>)> = Vec::new();
        // An older-version file for each row that has one, a baseline file for the other
        // user-state rows.
        let older = older_user_state_files();
        for row in table()
            .iter()
            .filter(|r| r.family == Family::UserState && r.name.is_some())
        {
            let path = match older.iter().find(|o| o.row.key == row.key) {
                Some(o) => plant_older(&home, o),
                None => {
                    let dir = home.root().join(&row.dir);
                    fs::create_dir_all(&dir).unwrap();
                    let path = dir.join(format!("{}.json", row.name.as_deref().unwrap()));
                    fs::write(&path, "{\"a\":1}").unwrap();
                    path
                }
            };
            planted.push((path.clone(), fs::read(&path).unwrap()));
        }
        assert!(planted.len() >= 26, "{} user-state files", planted.len());
        let before = home_tree(home.root());
        let host = StoreHost::new();
        let report = open_all_with(
            &host,
            StoreMode::Ts,
            own,
            home.root(),
            10_000,
            60_000,
            &|| false,
        );
        assert_eq!(
            (
                report.opened,
                report.migrated,
                report.adopted,
                report.deferred
            ),
            (0, 0, 0, 0)
        );
        for (path, bytes) in &planted {
            assert_eq!(&fs::read(path).unwrap(), bytes, "{}", path.display());
        }
        assert_eq!(
            home_tree(home.root()),
            before,
            "no backup or side file appeared"
        );
        assert!(host.read_only_entries().is_empty());
        // The same profile in rust mode does open (and migrate) them: the mode alone is the gate.
        let (_host, rust) = open(&home, own, 10_000, 60_000);
        assert!(rust.opened >= 26, "{} opened under rust", rust.opened);
        assert!(rust.migrated >= 7, "{} migrated under rust", rust.migrated);
    }

    /// Every file under `root`, relative, with its length: a cheap whole-tree comparison.
    fn home_tree(root: &Path) -> Vec<(String, u64)> {
        fn walk(dir: &Path, root: &Path, into: &mut Vec<(String, u64)>) {
            for entry in fs::read_dir(dir).unwrap().flatten() {
                let path = entry.path();
                if path.is_dir() {
                    walk(&path, root, into);
                } else {
                    into.push((
                        path.strip_prefix(root)
                            .unwrap()
                            .to_string_lossy()
                            .into_owned(),
                        entry.metadata().unwrap().len(),
                    ));
                }
            }
        }
        let mut found = Vec::new();
        walk(root, root, &mut found);
        found.sort();
        found
    }
}
