//! The Mac Steam owed-goonline record and its payment (plan 79-12, D-09/D-10).
//!
//! D-09 retest verdict (79-WRAP-RETEST.md): `verdict: PASS`. An unwrapped authenticated Refresh
//! left Mac Steam's Friends signed in, so the go-offline wrap itself is NOT ported (it is deleted
//! at the delete gate). Only the owed-record restore is ported here, because a record written by
//! an older build (or by the TS side during the fallback window) must still be paid.
//!
//! The on-disk record is the owed-marker file in `<appFolder>`, read and written in exactly the
//! shape `src/backend/storeVersioning/macSteamOfflineOwedFile.ts` defines: a top-level integer
//! `version` (the chain is empty, so the engine stamp is 1) plus `{since, by, pid}`. Presence of
//! the file is the debt; its fields are diagnostic and are read defensively, so a newer unknown
//! version is still owed (its fields just degrade to the safe default), like the TS reader.
//!
//! The crate never opens URLs or spawns `open`: every steam:// URL goes through [`WrapHost`].

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::time::Instant;

use crate::session::{RestoreOutcome, RestoreTrigger};

pub const STEAM_GO_OFFLINE_URL: &str = "steam://open/gooffline";
pub const STEAM_GO_ONLINE_URL: &str = "steam://open/goonline";
pub const MAC_STEAM_OFFLINE_OWED_FILE: &str = "mac-steam-offline-owed.json";
/// The engine stamp of the owed chain (baseline v1; the migration chain has no steps).
pub const OWED_RECORD_VERSION: u32 = 1;
pub const RESTORE_CONFIRM: Duration = Duration::from_secs(10);
pub const LOG_POLL: Duration = Duration::from_millis(250);
/// A user-initiated LogOff this soon after the fire is taken as a late gooffline landing.
pub const LATE_LOGOFF_WINDOW_MS: i64 = 60_000;
const STATE_READ_BYTES: u64 = 65_536;

/// Mac Steam's connection log, relative to the user's home.
const CONNECTION_LOG_REL: &str = "Library/Application Support/Steam/logs/connection_log.txt";

/// Stands in for the home directory when none is known. It cannot exist, so the log probe fails
/// as a missing file rather than reading a path relative to the current directory.
const NO_HOME: &str = "/nonexistent-home";

/// `connection_log.txt` under `home`. B/IN-04: a missing or relative home gives a path that cannot
/// exist, never a CWD-relative one.
pub fn connection_log_path_in(home: Option<PathBuf>) -> PathBuf {
    let home = home
        .filter(|h| h.is_absolute())
        .unwrap_or_else(|| PathBuf::from(NO_HOME));
    home.join(CONNECTION_LOG_REL)
}

/// The current user's `connection_log.txt`. `std::env::home_dir` reads `$HOME` and falls back to
/// the password database when it is unset or empty.
pub fn default_connection_log_path() -> PathBuf {
    connection_log_path_in(std::env::home_dir())
}

/// What the shell provides. Implemented outside the crate so it stays Tauri-free.
pub trait WrapHost: Send + Sync + 'static {
    /// Opens one of the two const steam:// URLs (detached, never raising Steam). True if issued.
    fn open_steam_url(&self, url: &'static str) -> bool;
    fn steam_running(&self) -> bool;
    fn connection_log_path(&self) -> PathBuf;
    /// True for a live process this user owns (EPERM is not ours).
    fn pid_alive(&self, pid: u32) -> bool;
    fn self_pid(&self) -> u32 {
        std::process::id()
    }
    /// Wall-clock ms of the last system boot; a record older than it has no live owner.
    fn system_boot_unix_ms(&self) -> Option<i64> {
        None
    }
    /// Seconds east of UTC for the local zone at `unix_secs`; connection_log stamps local time.
    fn local_utc_offset_secs(&self, _unix_secs: i64) -> i64 {
        0
    }
}

/// The owed record. Unknown keys are ignored on read; the writer emits only these four.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct OwedRecord {
    #[serde(default)]
    pub version: u32,
    /// RFC 3339 UTC, as JS `toISOString` writes it.
    #[serde(default)]
    pub since: Option<String>,
    #[serde(default)]
    pub by: Option<String>,
    #[serde(default)]
    pub pid: Option<u32>,
}

impl OwedRecord {
    pub fn new(by: &str, pid: u32, since_unix_ms: i64) -> Self {
        OwedRecord {
            version: OWED_RECORD_VERSION,
            since: Some(iso_from_unix_ms(since_unix_ms)),
            by: Some(by.to_string()),
            pid: Some(pid),
        }
    }

    pub fn since_unix_ms(&self) -> Option<i64> {
        parse_iso(self.since.as_deref()?)
    }
}

fn owed_path(app_folder: &Path) -> PathBuf {
    app_folder.join(MAC_STEAM_OFFLINE_OWED_FILE)
}

pub fn is_owed(app_folder: &Path) -> bool {
    owed_path(app_folder).exists()
}

/// `None` when there is no file. A present but unreadable or non-object file reads as the empty
/// record, because presence is the debt (TS `readOnlineDebt` returns `{}`).
pub fn read_owed(app_folder: &Path) -> Option<OwedRecord> {
    let bytes = match std::fs::read(owed_path(app_folder)) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return None,
        Err(_) => return Some(OwedRecord::default()),
    };
    let Ok(v) = serde_json::from_slice::<serde_json::Value>(&bytes) else {
        return Some(OwedRecord::default());
    };
    let Some(o) = v.as_object() else {
        return Some(OwedRecord::default());
    };
    Some(OwedRecord {
        version: o
            .get("version")
            .and_then(|x| x.as_u64())
            .and_then(|x| u32::try_from(x).ok())
            .unwrap_or(0),
        since: o.get("since").and_then(|x| x.as_str()).map(str::to_string),
        by: o.get("by").and_then(|x| x.as_str()).map(str::to_string),
        pid: o
            .get("pid")
            .and_then(|x| x.as_u64())
            .and_then(|x| u32::try_from(x).ok()),
    })
}

pub fn write_owed(app_folder: &Path, rec: &OwedRecord) -> std::io::Result<()> {
    std::fs::create_dir_all(app_folder)?;
    let bytes = serde_json::to_vec(rec).map_err(std::io::Error::other)?;
    gamelib_steamfiles::atomic::atomic_write(&owed_path(app_folder), &bytes)
}

pub fn clear_owed(app_folder: &Path) {
    let _ = std::fs::remove_file(owed_path(app_folder));
}

// ---- time helpers (no chrono: the crate does not carry it) ----

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

fn iso_from_unix_ms(ms: i64) -> String {
    let secs = ms.div_euclid(1000);
    let (y, mo, d) = civil_from_days(secs.div_euclid(86_400));
    let sod = secs.rem_euclid(86_400);
    format!(
        "{y:04}-{mo:02}-{d:02}T{:02}:{:02}:{:02}.{:03}Z",
        sod / 3600,
        sod % 3600 / 60,
        sod % 60,
        ms.rem_euclid(1000)
    )
}

/// Parses `YYYY-MM-DDTHH:MM:SS[.fff]Z` to unix ms.
fn parse_iso(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if b.len() < 20 || b[4] != b'-' || b[7] != b'-' || b[10] != b'T' || !s.ends_with('Z') {
        return None;
    }
    let n = |r: std::ops::Range<usize>| s.get(r)?.parse::<i64>().ok();
    let (y, mo, d, h, mi, se) = (
        n(0..4)?,
        n(5..7)?,
        n(8..10)?,
        n(11..13)?,
        n(14..16)?,
        n(17..19)?,
    );
    let frac = match s.get(19..s.len() - 1)? {
        "" => 0,
        f if f.starts_with('.') && f.len() > 1 => {
            let digits: String = f[1..].chars().take(3).collect();
            format!("{digits:0<3}").parse::<i64>().ok()?
        }
        _ => return None,
    };
    Some((days_from_civil(y, mo, d) * 86_400 + h * 3600 + mi * 60 + se) * 1000 + frac)
}

/// Parses a connection_log `[YYYY-MM-DD HH:MM:SS] [State, n, m] ...` line to (local-wall secs,
/// state word), as seconds since the epoch read as if the wall clock were UTC.
fn parse_state_line(line: &str) -> Option<(i64, &str)> {
    let l = line.trim_end_matches('\r');
    let b = l.as_bytes();
    if b.len() < 24 || b[0] != b'[' || b[5] != b'-' || b[8] != b'-' || b[11] != b' ' {
        return None;
    }
    let n = |r: std::ops::Range<usize>| l.get(r)?.parse::<i64>().ok();
    let (y, mo, d, h, mi, se) = (
        n(1..5)?,
        n(6..8)?,
        n(9..11)?,
        n(12..14)?,
        n(15..17)?,
        n(18..20)?,
    );
    let rest = l.get(20..)?.strip_prefix("] [")?;
    let end = rest.find(']')?;
    let inner = &rest[..end];
    let mut parts = inner.split(", ");
    let word = parts.next()?;
    if word.is_empty() || !word.chars().all(|c| c.is_ascii_alphabetic() || c == ' ') {
        return None;
    }
    parts.next()?.parse::<i64>().ok()?;
    parts.next()?.parse::<i64>().ok()?;
    Some((
        days_from_civil(y, mo, d) * 86_400 + h * 3600 + mi * 60 + se,
        word,
    ))
}

fn read_tail(path: &Path) -> Option<String> {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = std::fs::File::open(path).ok()?;
    let size = f.metadata().ok()?.len();
    let len = size.min(STATE_READ_BYTES);
    if len == 0 {
        return None;
    }
    f.seek(SeekFrom::Start(size - len)).ok()?;
    let mut buf = vec![0u8; len as usize];
    f.read_exact(&mut buf).ok()?;
    Some(String::from_utf8_lossy(&buf).into_owned())
}

/// local-wall "as UTC" seconds -> real unix seconds, using the host's zone offset.
fn wall_to_unix(host: &dyn WrapHost, wall: i64) -> i64 {
    let guess = wall - host.local_utc_offset_secs(wall);
    wall - host.local_utc_offset_secs(guess)
}

/// State word of the last bracketed line stamped at or after `since_ms` (floored to the second).
fn state_since(host: &dyn WrapHost, path: &Path, since_ms: i64) -> Option<String> {
    let floor = since_ms.div_euclid(1000);
    let tail = read_tail(path)?;
    for line in tail.lines().rev() {
        if let Some((wall, word)) = parse_state_line(line) {
            if wall_to_unix(host, wall) >= floor {
                return Some(word.to_string());
            }
        }
    }
    None
}

/// A timestamped user-initiated LogOff line within [from_ms floored, to_ms].
fn logoff_seen_within(host: &dyn WrapHost, path: &Path, from_ms: i64, to_ms: i64) -> bool {
    let floor = from_ms.div_euclid(1000);
    let Some(tail) = read_tail(path) else {
        return false;
    };
    tail.lines().any(|line| {
        if !line.contains("user initiated logoff") {
            return false;
        }
        let Some((wall, _)) = parse_state_line(line) else {
            return false;
        };
        let ts = wall_to_unix(host, wall);
        ts >= floor && ts * 1000 <= to_ms
    })
}

/// Watches a log file for lines appended AFTER construction. The start offset is taken at
/// construction so a stale matching line can never satisfy it.
struct LogWatch {
    path: PathBuf,
    offset: u64,
    carry: String,
}

impl LogWatch {
    fn new(path: PathBuf) -> Self {
        let offset = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        LogWatch {
            path,
            offset,
            carry: String::new(),
        }
    }

    fn read_new(&mut self) -> Vec<String> {
        use std::io::{Read, Seek, SeekFrom};
        let Ok(mut f) = std::fs::File::open(&self.path) else {
            return Vec::new();
        };
        let Ok(size) = f.metadata().map(|m| m.len()) else {
            return Vec::new();
        };
        if size < self.offset {
            self.offset = 0;
            self.carry.clear();
        }
        if size == self.offset {
            return Vec::new();
        }
        let mut buf = vec![0u8; (size - self.offset) as usize];
        if f.seek(SeekFrom::Start(self.offset)).is_err() || f.read_exact(&mut buf).is_err() {
            return Vec::new();
        }
        self.offset = size;
        let text = format!("{}{}", self.carry, String::from_utf8_lossy(&buf));
        let mut parts: Vec<&str> = text.split('\n').collect();
        let tail = parts.pop().unwrap_or("").to_string();
        let lines = parts
            .into_iter()
            .map(|l| l.trim_end_matches('\r').to_string())
            .collect();
        self.carry = tail;
        lines
    }

    /// True as soon as a new line contains `needle`; false at `timeout`.
    async fn wait_for(&mut self, needle: &str, timeout: Duration) -> bool {
        let start = Instant::now();
        loop {
            if self.read_new().iter().any(|l| l.contains(needle)) {
                return true;
            }
            if start.elapsed() >= timeout {
                return false;
            }
            tokio::time::sleep(LOG_POLL).await;
        }
    }
}

fn owned_by_other_live_process(host: &dyn WrapHost, rec: &OwedRecord) -> bool {
    let Some(pid) = rec.pid else { return false };
    if pid == host.self_pid() {
        return false;
    }
    if let (Some(since), Some(boot)) = (rec.since_unix_ms(), host.system_boot_unix_ms()) {
        if since < boot {
            return false;
        }
    }
    host.pid_alive(pid)
}

/// Pays the goonline an older build (or the TS side) owed when its process died first. With no
/// record it does no work and opens no URL. Never errors. Non-macOS: `NotOwed`, disk untouched.
pub async fn restore_if_owed(
    host: &dyn WrapHost,
    app_folder: &Path,
    trigger: RestoreTrigger,
) -> RestoreOutcome {
    if !cfg!(target_os = "macos") {
        return RestoreOutcome::NotOwed;
    }
    restore_inner(host, app_folder, trigger).await
}

async fn restore_inner(
    host: &dyn WrapHost,
    app_folder: &Path,
    trigger: RestoreTrigger,
) -> RestoreOutcome {
    let Some(rec) = read_owed(app_folder) else {
        return RestoreOutcome::NotOwed;
    };
    if owned_by_other_live_process(host, &rec) {
        return RestoreOutcome::KeptOwnerAlive;
    }
    let log = host.connection_log_path();
    // A `toggled-unconfirmed` marker is owed only if the gooffline landed late.
    if rec.by.as_deref() == Some("toggled-unconfirmed") {
        if let Some(since) = rec.since_unix_ms() {
            if !logoff_seen_within(host, &log, since, since + LATE_LOGOFF_WINDOW_MS) {
                clear_owed(app_folder);
                return RestoreOutcome::NotOwed;
            }
        }
    }
    if !host.steam_running() {
        return RestoreOutcome::KeptNotRunning;
    }
    // Watch BEFORE the fire so the start offset precedes any confirming line.
    let mut watch = (trigger == RestoreTrigger::Boot).then(|| LogWatch::new(log.clone()));
    if !host.open_steam_url(STEAM_GO_ONLINE_URL) {
        return RestoreOutcome::KeptProbeFailed;
    }
    let Some(watch) = watch.as_mut() else {
        clear_owed(app_folder);
        return RestoreOutcome::Restored;
    };
    let confirmed = watch.wait_for("processing complete", RESTORE_CONFIRM).await
        || rec
            .since_unix_ms()
            .and_then(|s| state_since(host, &log, s))
            .as_deref()
            == Some("Logged On");
    if confirmed {
        clear_owed(app_folder);
        RestoreOutcome::Restored
    } else {
        RestoreOutcome::RestoreUnconfirmed
    }
}

/// Convenience for the shell: a host handle that pays owed records for one app folder.
pub struct OwedPayer {
    pub host: Arc<dyn WrapHost>,
    pub app_folder: PathBuf,
}

impl OwedPayer {
    pub async fn pay(&self, trigger: RestoreTrigger) -> RestoreOutcome {
        restore_if_owed(self.host.as_ref(), &self.app_folder, trigger).await
    }
}

#[cfg(test)]
mod tests {
    /// B/IN-04: no home, or a relative one, never yields a CWD-relative log path.
    #[test]
    fn connection_log_path_is_absolute_without_a_usable_home() {
        for home in [None, Some(PathBuf::new()), Some(PathBuf::from("rel/home"))] {
            let p = super::connection_log_path_in(home.clone());
            assert!(p.is_absolute(), "{home:?} -> {p:?}");
            assert!(p.starts_with(super::NO_HOME), "{home:?} -> {p:?}");
        }
        assert_eq!(
            super::connection_log_path_in(Some(PathBuf::from("/Users/u"))),
            PathBuf::from("/Users/u/Library/Application Support/Steam/logs/connection_log.txt")
        );
        assert!(super::default_connection_log_path().is_absolute());
    }

    use super::*;
    use std::io::Write;

    fn now_unix_ms() -> i64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0)
    }

    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Mutex;

    struct FakeHost {
        opened: Mutex<Vec<&'static str>>,
        running: AtomicBool,
        alive: AtomicBool,
        /// When set, `open_steam_url` reports the open as not issued.
        refuse_open: AtomicBool,
        log: PathBuf,
    }

    impl FakeHost {
        fn new(log: PathBuf, running: bool) -> Self {
            FakeHost {
                opened: Mutex::new(Vec::new()),
                running: AtomicBool::new(running),
                alive: AtomicBool::new(false),
                refuse_open: AtomicBool::new(false),
                log,
            }
        }
        fn opened(&self) -> Vec<&'static str> {
            self.opened.lock().unwrap().clone()
        }
    }

    impl WrapHost for FakeHost {
        fn open_steam_url(&self, url: &'static str) -> bool {
            self.opened.lock().unwrap().push(url);
            !self.refuse_open.load(Ordering::SeqCst)
        }
        fn steam_running(&self) -> bool {
            self.running.load(Ordering::SeqCst)
        }
        fn connection_log_path(&self) -> PathBuf {
            self.log.clone()
        }
        fn pid_alive(&self, _pid: u32) -> bool {
            self.alive.load(Ordering::SeqCst)
        }
        fn self_pid(&self) -> u32 {
            100
        }
    }

    fn setup(running: bool) -> (tempfile::TempDir, Arc<FakeHost>) {
        let d = tempfile::tempdir().unwrap();
        let host = Arc::new(FakeHost::new(d.path().join("connection_log.txt"), running));
        (d, host)
    }

    fn rec(by: &str, pid: u32) -> OwedRecord {
        OwedRecord::new(by, pid, now_unix_ms())
    }

    #[test]
    fn ts_written_fixture_parses() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(
            owed_path(d.path()),
            r#"{"version":1,"since":"2026-11-01T10:00:00.000Z","by":"toggled","pid":4242}"#,
        )
        .unwrap();
        let r = read_owed(d.path()).unwrap();
        assert_eq!(r.version, 1);
        assert_eq!(r.by.as_deref(), Some("toggled"));
        assert_eq!(r.pid, Some(4242));
        assert_eq!(r.since_unix_ms(), Some(1_793_527_200_000));
    }

    #[test]
    fn legacy_unversioned_file_parses() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(
            owed_path(d.path()),
            r#"{"since":"2026-11-01T10:00:00.000Z","by":"guided","pid":7}"#,
        )
        .unwrap();
        let r = read_owed(d.path()).unwrap();
        assert_eq!(r.version, 0);
        assert_eq!(r.by.as_deref(), Some("guided"));
    }

    #[test]
    fn write_owed_uses_ts_keys_and_version() {
        let d = tempfile::tempdir().unwrap();
        write_owed(d.path(), &OwedRecord::new("toggled", 55, 1_793_527_200_123)).unwrap();
        let v: serde_json::Value =
            serde_json::from_slice(&std::fs::read(owed_path(d.path())).unwrap()).unwrap();
        assert_eq!(v["version"], 1);
        assert_eq!(v["since"], "2026-11-01T10:00:00.123Z");
        assert_eq!(v["by"], "toggled");
        assert_eq!(v["pid"], 55);
        assert_eq!(v.as_object().unwrap().len(), 4);
        assert_eq!(
            read_owed(d.path()).unwrap().since_unix_ms(),
            Some(1_793_527_200_123)
        );
    }

    #[test]
    fn newer_version_and_garbage_are_still_owed() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(
            owed_path(d.path()),
            r#"{"version":99,"by":"x","pid":9,"extra":1}"#,
        )
        .unwrap();
        let r = read_owed(d.path()).unwrap();
        assert_eq!(r.version, 99);
        assert!(is_owed(d.path()));
        std::fs::write(owed_path(d.path()), "not json").unwrap();
        assert_eq!(read_owed(d.path()), Some(OwedRecord::default()));
        std::fs::write(owed_path(d.path()), "[1]").unwrap();
        assert_eq!(read_owed(d.path()), Some(OwedRecord::default()));
    }

    #[tokio::test(start_paused = true)]
    async fn no_record_is_not_owed_and_opens_nothing() {
        let (d, host) = setup(true);
        let out = restore_inner(host.as_ref(), d.path(), RestoreTrigger::Boot).await;
        assert_eq!(out, RestoreOutcome::NotOwed);
        assert!(host.opened().is_empty());
    }

    #[tokio::test(start_paused = true)]
    async fn boot_restore_confirms_from_log_and_clears() {
        let (d, host) = setup(true);
        write_owed(d.path(), &rec("toggled", 100)).unwrap();
        std::fs::write(&host.log, "[2026-11-01 10:00:00] [Logged Off, 1, 2]\n").unwrap();
        let h = host.clone();
        let appender = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(1200)).await;
            let mut f = std::fs::OpenOptions::new()
                .append(true)
                .open(&h.log)
                .unwrap();
            writeln!(f, "[2026-11-01 10:00:02] processing complete").unwrap();
        });
        let out = restore_inner(host.as_ref(), d.path(), RestoreTrigger::Boot).await;
        appender.await.unwrap();
        assert_eq!(out, RestoreOutcome::Restored);
        assert_eq!(host.opened(), vec![STEAM_GO_ONLINE_URL]);
        assert!(!is_owed(d.path()));
    }

    #[tokio::test(start_paused = true)]
    async fn stale_matching_line_does_not_confirm() {
        let (d, host) = setup(true);
        write_owed(d.path(), &rec("toggled", 100)).unwrap();
        std::fs::write(&host.log, "[2020-01-01 00:00:00] processing complete\n").unwrap();
        let out = restore_inner(host.as_ref(), d.path(), RestoreTrigger::Boot).await;
        assert_eq!(out, RestoreOutcome::RestoreUnconfirmed);
        assert!(is_owed(d.path()), "unconfirmed keeps the record");
    }

    #[tokio::test(start_paused = true)]
    async fn shutdown_restore_fires_and_clears_without_waiting() {
        let (d, host) = setup(true);
        write_owed(d.path(), &rec("toggled", 100)).unwrap();
        let out = restore_inner(host.as_ref(), d.path(), RestoreTrigger::Shutdown).await;
        assert_eq!(out, RestoreOutcome::Restored);
        assert_eq!(host.opened(), vec![STEAM_GO_ONLINE_URL]);
        assert!(!is_owed(d.path()));
    }

    /// B/WR-02: the Shutdown trigger has no log watch, so the host's `true` is the only
    /// confirmation. An open the host did not issue must keep the record for the next boot.
    #[tokio::test(start_paused = true)]
    async fn shutdown_restore_keeps_the_record_when_the_open_is_not_issued() {
        let (d, host) = setup(true);
        host.refuse_open.store(true, Ordering::SeqCst);
        write_owed(d.path(), &rec("toggled", 100)).unwrap();
        let out = restore_inner(host.as_ref(), d.path(), RestoreTrigger::Shutdown).await;
        assert_eq!(out, RestoreOutcome::KeptProbeFailed);
        assert!(is_owed(d.path()));
    }

    #[tokio::test(start_paused = true)]
    async fn steam_not_running_keeps_the_record() {
        let (d, host) = setup(false);
        write_owed(d.path(), &rec("toggled", 100)).unwrap();
        let out = restore_inner(host.as_ref(), d.path(), RestoreTrigger::Boot).await;
        assert_eq!(out, RestoreOutcome::KeptNotRunning);
        assert!(is_owed(d.path()));
        assert!(host.opened().is_empty());
    }

    #[tokio::test(start_paused = true)]
    async fn live_foreign_owner_keeps_the_record() {
        let (d, host) = setup(true);
        host.alive.store(true, Ordering::SeqCst);
        write_owed(d.path(), &rec("toggled", 555)).unwrap();
        let out = restore_inner(host.as_ref(), d.path(), RestoreTrigger::Boot).await;
        assert_eq!(out, RestoreOutcome::KeptOwnerAlive);
        assert!(is_owed(d.path()));
        assert!(host.opened().is_empty());
    }

    #[tokio::test(start_paused = true)]
    async fn own_pid_is_not_a_foreign_owner() {
        let (d, host) = setup(true);
        host.alive.store(true, Ordering::SeqCst);
        write_owed(d.path(), &rec("guided", 100)).unwrap();
        let out = restore_inner(host.as_ref(), d.path(), RestoreTrigger::Shutdown).await;
        assert_eq!(out, RestoreOutcome::Restored);
    }

    #[tokio::test(start_paused = true)]
    async fn unconfirmed_marker_without_late_logoff_is_cleared() {
        let (d, host) = setup(true);
        write_owed(d.path(), &rec("toggled-unconfirmed", 100)).unwrap();
        let out = restore_inner(host.as_ref(), d.path(), RestoreTrigger::Boot).await;
        assert_eq!(out, RestoreOutcome::NotOwed);
        assert!(!is_owed(d.path()));
        assert!(host.opened().is_empty());
    }

    #[test]
    fn state_line_and_iso_helpers() {
        let (w, s) = parse_state_line("[2026-11-01 10:00:00] [Logged On, 1, -2] x").unwrap();
        assert_eq!(s, "Logged On");
        assert_eq!(w, 1_793_527_200);
        assert!(parse_state_line("garbage").is_none());
        assert_eq!(parse_iso("2026-11-01T10:00:00Z"), Some(1_793_527_200_000));
        assert_eq!(iso_from_unix_ms(0), "1970-01-01T00:00:00.000Z");
    }

    #[cfg(not(target_os = "macos"))]
    #[tokio::test]
    async fn non_macos_is_not_owed_and_untouched() {
        let (d, host) = setup(true);
        write_owed(d.path(), &rec("toggled", 100)).unwrap();
        let out = restore_if_owed(host.as_ref(), d.path(), RestoreTrigger::Boot).await;
        assert_eq!(out, RestoreOutcome::NotOwed);
        assert!(is_owed(d.path()));
    }
}
