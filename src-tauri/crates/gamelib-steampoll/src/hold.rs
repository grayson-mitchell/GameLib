//! What is left of the restart hold: `steamRestartHold.ts` (the persisted `steam_restart_hold`
//! store, read once at boot by the migration to pending-adoption records) and the
//! `steamClientProcess.ts` probes the adoption read uses (plan 07). The hold decision itself
//! is gone (Phase 81, D-11); 81-16 deletes this file.
//!
//! The store file is the sidecar's `CacheStore` layout, dual-readable by TS and Rust (D-16):
//! `{ "<appId>": record, "__timestamp": { "<appId>": "<date text>" }, "__internal__": {..} }`. A
//! flat `"__timestamp.<appId>"` key (the in-memory `CacheStore` shape) is read and removed too.
//! Unrelated keys are preserved on every write. Exactly one side writes it per run (R3).
//!
//! Disk content is untrusted (T-80-19): `parse_record` is the TS `parseRecord`, and an invalid
//! record is ignored. Probes spawn fixed programs with argv arrays and integer pids only (T-80-22).

use crate::host::{HoldSink, ProcessRunner};
use crate::profile::Platform;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Hard bound on a single probe child (tasklist measured about 200 ms cold).
const PROBE_TIMEOUT: Duration = Duration::from_millis(5000);
/// Cold PowerShell start is much slower than tasklist; still one bounded child.
const START_TOKEN_TIMEOUT: Duration = Duration::from_millis(15_000);

// ---------------------------------------------------------------------------------------------
// Records and parsing
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PidToken {
    pub pid: u32,
    pub start_token: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RestartHoldRecord {
    pub pids: Vec<PidToken>,
    /// Epoch ms. Any finite number is accepted on read, like TS.
    pub recorded_at: f64,
    pub mac_native_route: bool,
    pub skipped_depots: Vec<String>,
}

impl RestartHoldRecord {
    /// The CacheStore value shape (camelCase keys, integer `recordedAt` when whole).
    pub fn to_value(&self) -> Value {
        let recorded_at = if self.recorded_at.fract() == 0.0 && self.recorded_at.abs() < 9.0e15 {
            json!(self.recorded_at as i64)
        } else {
            json!(self.recorded_at)
        };
        json!({
            "pids": self.pids.iter().map(|p| json!({"pid": p.pid, "startToken": p.start_token})).collect::<Vec<_>>(),
            "recordedAt": recorded_at,
            "macNativeRoute": self.mac_native_route,
            "skippedDepots": self.skipped_depots,
        })
    }
}

/// Safe-parse of untrusted disk content (steamRestartHold.ts `parseRecord`).
pub fn parse_record(value: &Value) -> Option<RestartHoldRecord> {
    let v = value.as_object()?;
    let raw_pids = v.get("pids")?.as_array()?;
    if raw_pids.is_empty() {
        return None;
    }
    let mut pids = Vec::with_capacity(raw_pids.len());
    for entry in raw_pids {
        let e = entry.as_object()?;
        let pid = e.get("pid")?.as_u64()?;
        let token = e.get("startToken")?.as_str()?;
        if pid == 0 || pid > u32::MAX as u64 || token.is_empty() {
            return None;
        }
        pids.push(PidToken {
            pid: pid as u32,
            start_token: token.to_string(),
        });
    }
    let recorded_at = v.get("recordedAt")?.as_f64().filter(|n| n.is_finite())?;
    let skipped = v.get("skippedDepots")?.as_array()?;
    let skipped_depots = skipped
        .iter()
        .map(|d| d.as_str().map(str::to_string))
        .collect::<Option<Vec<_>>>()?;
    Some(RestartHoldRecord {
        pids,
        recorded_at,
        mac_native_route: v.get("macNativeRoute").and_then(Value::as_bool) == Some(true),
        skipped_depots,
    })
}

// ---------------------------------------------------------------------------------------------
// Re-arm decision
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DropReason {
    Expired,
    SteamExited,
    PidReused,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RearmDecision {
    Arm {
        pids: Vec<u32>,
    },
    Drop {
        reason: DropReason,
    },
    /// A probe was inconclusive: neither arm nor delete the record.
    Unknown,
}

/// Pure re-arm decision (`decideSteamRestartHoldRearm`).
pub fn decide_rearm(
    record: &RestartHoldRecord,
    live_pids: Option<&[u32]>,
    start_tokens: Option<&HashMap<u32, String>>,
    now_ms: u64,
    max_age_ms: u64,
) -> RearmDecision {
    let Some(live) = live_pids else {
        return RearmDecision::Unknown;
    };
    if now_ms as f64 - record.recorded_at >= max_age_ms as f64 {
        return RearmDecision::Drop {
            reason: DropReason::Expired,
        };
    }
    let candidates: Vec<&PidToken> = record
        .pids
        .iter()
        .filter(|p| live.contains(&p.pid))
        .collect();
    if candidates.is_empty() {
        return RearmDecision::Drop {
            reason: DropReason::SteamExited,
        };
    }
    let Some(tokens) = start_tokens else {
        return RearmDecision::Unknown;
    };
    let matching: Vec<u32> = candidates
        .iter()
        .filter(|p| tokens.get(&p.pid) == Some(&p.start_token))
        .map(|p| p.pid)
        .collect();
    if matching.is_empty() {
        return RearmDecision::Drop {
            reason: DropReason::PidReused,
        };
    }
    RearmDecision::Arm { pids: matching }
}

// ---------------------------------------------------------------------------------------------
// Persisted store
// ---------------------------------------------------------------------------------------------

/// The `steam_restart_hold` store file. Every operation is a read-modify-write of the whole file
/// (atomic temp + rename, 0600 on unix). Failures are logged by appId and op and never
/// propagated, matching the TS try/catch: persistence is best-effort.
///
/// Concurrency (80-REVIEW A/WR-03): polls for different apps write from separate tokio tasks,
/// and `rearm` builds its own instance for the same file, so each read-modify-write holds the
/// process-wide `STORE_LOCK` from load to rename, and each write uses its own temp name.
#[derive(Debug, Clone)]
pub struct HoldStore {
    path: PathBuf,
}

/// Serialises every hold-store read-modify-write in this process, across all instances. One lock
/// for all paths is enough: writes are rare and short.
static STORE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Makes each temp file name unique within the process.
static TMP_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn store_lock() -> std::sync::MutexGuard<'static, ()> {
    STORE_LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

fn is_bookkeeping_key(key: &str) -> bool {
    key == "__internal__" || key == "__timestamp" || key.starts_with("__timestamp.")
}

/// UTC ISO-8601 text for an epoch-ms value (`Date` parses it; the lifespan is null so TS never
/// ages these entries).
fn iso_timestamp(now_ms: u64) -> String {
    let secs = (now_ms / 1000) as i64;
    let ms = now_ms % 1000;
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    // Howard Hinnant's civil_from_days.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{ms:03}Z",
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

impl HoldStore {
    pub fn new(path: impl Into<PathBuf>) -> HoldStore {
        HoldStore { path: path.into() }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// `Ok(None)` when the file does not exist; `Err` for unreadable or non-object content.
    fn load(&self) -> Result<Option<Map<String, Value>>, ()> {
        match std::fs::read_to_string(&self.path) {
            Ok(text) => match serde_json::from_str::<Value>(&text) {
                Ok(Value::Object(m)) => Ok(Some(m)),
                _ => Err(()),
            },
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(_) => Err(()),
        }
    }

    fn save(&self, data: &Map<String, Value>) -> std::io::Result<()> {
        use std::io::Write;
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let mut tmp = self.path.clone().into_os_string();
        let n = TMP_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        tmp.push(format!(".tmp-{}-{n}", std::process::id()));
        let tmp = PathBuf::from(tmp);
        let text = serde_json::to_string_pretty(&Value::Object(data.clone()))
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        let result = (|| {
            let mut opts = std::fs::OpenOptions::new();
            opts.write(true).create(true).truncate(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                opts.mode(0o600);
            }
            let mut f = opts.open(&tmp)?;
            f.write_all(text.as_bytes())?;
            f.sync_all()?;
            std::fs::rename(&tmp, &self.path)
        })();
        if result.is_err() {
            let _ = std::fs::remove_file(&tmp);
        }
        result
    }

    /// Every valid record, in file order. An unreadable store behaves as empty.
    pub fn list(&self) -> Vec<(String, RestartHoldRecord)> {
        let Ok(Some(map)) = self.load() else {
            return vec![];
        };
        map.iter()
            .filter(|(k, _)| !is_bookkeeping_key(k))
            .filter_map(|(k, v)| parse_record(v).map(|r| (k.clone(), r)))
            .collect()
    }

    /// One record, or `None` when absent or invalid.
    pub fn read(&self, app_id: &str) -> Option<RestartHoldRecord> {
        let Ok(Some(map)) = self.load() else {
            return None;
        };
        map.get(app_id).and_then(parse_record)
    }

    /// Stores a record and its timestamp, keeping every other key.
    pub fn record(&self, app_id: &str, record: &RestartHoldRecord, now_ms: u64) {
        self.record_value(app_id, record.to_value(), now_ms);
    }

    fn record_value(&self, app_id: &str, value: Value, now_ms: u64) {
        if is_bookkeeping_key(app_id) {
            return;
        }
        let _lock = store_lock();
        let mut data = match self.load() {
            Ok(Some(m)) => m,
            Ok(None) => {
                let mut m = Map::new();
                m.insert(
                    "__internal__".into(),
                    json!({"gamelib": {"schemaVersion": 1}}),
                );
                m
            }
            Err(()) => {
                // Never overwrite a file we cannot parse.
                eprintln!(
                    "gamelib-steampoll: hold store unreadable, record skipped (appId {app_id})"
                );
                return;
            }
        };
        data.insert(app_id.to_string(), value);
        data.remove(&format!("__timestamp.{app_id}"));
        let ts = data
            .entry("__timestamp".to_string())
            .or_insert_with(|| Value::Object(Map::new()));
        if let Value::Object(m) = ts {
            m.insert(app_id.to_string(), json!(iso_timestamp(now_ms)));
        }
        if let Err(e) = self.save(&data) {
            eprintln!(
                "gamelib-steampoll: hold store write failed (appId {app_id}, op record): {}",
                e.kind()
            );
        }
    }

    /// Removes a record and its timestamp. Nothing to do when the store has no such key.
    pub fn clear(&self, app_id: &str) {
        if is_bookkeeping_key(app_id) {
            return;
        }
        let _lock = store_lock();
        let mut data = match self.load() {
            Ok(Some(m)) => m,
            Ok(None) => return,
            Err(()) => {
                eprintln!(
                    "gamelib-steampoll: hold store unreadable, clear skipped (appId {app_id})"
                );
                return;
            }
        };
        let mut changed = data.remove(app_id).is_some();
        changed |= data.remove(&format!("__timestamp.{app_id}")).is_some();
        if let Some(Value::Object(ts)) = data.get_mut("__timestamp") {
            changed |= ts.remove(app_id).is_some();
        }
        if !changed {
            return;
        }
        if let Err(e) = self.save(&data) {
            eprintln!(
                "gamelib-steampoll: hold store write failed (appId {app_id}, op clear): {}",
                e.kind()
            );
        }
    }
}

impl HoldSink for HoldStore {
    fn record(&self, app_id: &str, record: Value, now_ms: u64) {
        // The effect carries the record as JSON; an invalid one is dropped, like TS parse-on-read.
        if parse_record(&record).is_none() {
            eprintln!("gamelib-steampoll: hold record rejected (appId {app_id})");
            return;
        }
        self.record_value(app_id, record, now_ms);
    }

    fn clear(&self, app_id: &str) {
        HoldStore::clear(self, app_id);
    }
}

// ---------------------------------------------------------------------------------------------
// Steam process probes (steamClientProcess.ts)
// ---------------------------------------------------------------------------------------------

fn positive_pid(text: &str) -> Option<u32> {
    if text.is_empty() || !text.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    text.parse::<u32>().ok().filter(|p| *p > 0)
}

/// `tasklist /FO CSV /NH` into steam.exe pids: only rows whose first column is exactly
/// `steam.exe` (case-insensitive) count.
pub fn parse_tasklist_steam_pids(stdout: &str) -> Vec<u32> {
    const PREFIX: &str = "\"steam.exe\",\"";
    stdout
        .lines()
        .filter_map(|line| {
            let t = line.trim();
            let head = t.get(..PREFIX.len())?;
            if !head.eq_ignore_ascii_case(PREFIX) {
                return None;
            }
            let rest = &t[PREFIX.len()..];
            let digits = rest.split('"').next().filter(|_| rest.contains('"'))?;
            positive_pid(digits)
        })
        .collect()
}

/// `pgrep` stdout (one pid per line).
pub fn parse_pgrep_pids(stdout: &str) -> Vec<u32> {
    stdout
        .lines()
        .filter_map(|l| positive_pid(l.trim()))
        .collect()
}

/// `<pid> <token>` lines into pid -> opaque token; internal whitespace is collapsed so equal
/// instants compare equal.
pub fn parse_pid_token_lines(stdout: &str) -> HashMap<u32, String> {
    let mut out = HashMap::new();
    for line in stdout.lines() {
        let t = line.trim();
        let digits_end = t.bytes().take_while(u8::is_ascii_digit).count();
        if digits_end == 0 {
            continue;
        }
        let (pid_text, rest) = t.split_at(digits_end);
        if !rest.starts_with(char::is_whitespace) {
            continue;
        }
        let token = rest.split_whitespace().collect::<Vec<_>>().join(" ");
        let Some(pid) = positive_pid(pid_text) else {
            continue;
        };
        if token.is_empty() {
            continue;
        }
        out.insert(pid, token);
    }
    out
}

fn system_root() -> String {
    std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string())
}

fn win_join(base: &str, parts: &[&str]) -> String {
    let mut out = base.trim_end_matches('\\').to_string();
    for p in parts {
        out.push('\\');
        out.push_str(p);
    }
    out
}

/// Lists the pids of the running native Steam client. `None` means unknown (the probe could not
/// run or its answer is unusable); callers fail open, never read it as "Steam is not running".
pub async fn list_steam_client_pids(
    runner: &dyn ProcessRunner,
    platform: Platform,
) -> Option<Vec<u32>> {
    match platform {
        Platform::Win32 => {
            let tasklist = win_join(&system_root(), &["System32", "tasklist.exe"]);
            let out = runner
                .run(
                    &tasklist,
                    vec![
                        "/FI".into(),
                        "IMAGENAME eq steam.exe".into(),
                        "/FO".into(),
                        "CSV".into(),
                        "/NH".into(),
                    ],
                    PROBE_TIMEOUT,
                )
                .await;
            // tasklist exits 0 whether or not anything matched.
            if out.code != Some(0) {
                return None;
            }
            Some(parse_tasklist_steam_pids(&out.stdout))
        }
        Platform::Darwin | Platform::Linux => {
            let (file, name) = if platform == Platform::Darwin {
                ("/usr/bin/pgrep", "steam_osx")
            } else {
                ("pgrep", "steam")
            };
            let out = runner
                .run(file, vec!["-x".into(), name.into()], PROBE_TIMEOUT)
                .await;
            // pgrep: 0 = matched, 1 = nothing matched, anything else = error.
            match out.code {
                Some(1) => Some(vec![]),
                Some(0) => Some(parse_pgrep_pids(&out.stdout)),
                _ => None,
            }
        }
    }
}

/// Start-time tokens for the given pids. An empty map means none of them exist; `None` means the
/// probe failed. Only pids that were asked for appear in the result.
pub async fn read_steam_process_start_tokens(
    runner: &dyn ProcessRunner,
    platform: Platform,
    pids: &[u32],
) -> Option<HashMap<u32, String>> {
    // Only positive integers are ever interpolated (injection guard).
    let wanted: Vec<u32> = pids.iter().copied().filter(|p| *p > 0).collect();
    if wanted.is_empty() {
        return Some(HashMap::new());
    }
    let csv = wanted
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let out = match platform {
        Platform::Darwin | Platform::Linux => {
            let file = if platform == Platform::Darwin {
                "/bin/ps"
            } else {
                "ps"
            };
            let out = runner
                .run(
                    file,
                    vec!["-o".into(), "pid=,lstart=".into(), "-p".into(), csv],
                    START_TOKEN_TIMEOUT,
                )
                .await;
            if out.code == Some(1) {
                return Some(HashMap::new());
            }
            out
        }
        Platform::Win32 => {
            let powershell = win_join(
                &system_root(),
                &["System32", "WindowsPowerShell", "v1.0", "powershell.exe"],
            );
            let script = format!(
                "Get-Process -Id {csv} -ErrorAction SilentlyContinue | ForEach-Object {{ \"$($_.Id) $($_.StartTime.ToUniversalTime().Ticks)\" }}; exit 0"
            );
            runner
                .run(
                    &powershell,
                    vec![
                        "-NoProfile".into(),
                        "-NonInteractive".into(),
                        "-Command".into(),
                        script,
                    ],
                    START_TOKEN_TIMEOUT,
                )
                .await
        }
    };
    if out.code != Some(0) {
        return None;
    }
    let parsed = parse_pid_token_lines(&out.stdout);
    Some(
        wanted
            .into_iter()
            .filter_map(|pid| parsed.get(&pid).map(|t| (pid, t.clone())))
            .collect(),
    )
}
