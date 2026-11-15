//! Port of `library/updatePollOnce.ts` (Phase 74 D-11) and the InstallApp helper request it drives
//! (`steamInstallApp.ts`, InstallApp half). The UninstallApp half (`requestSteamUninstallApp`)
//! stays TS: `gameUninstall.ts` calls it and it is not poll code.
//!
//! D-11, preserved exactly: StateFlags bit 4 never completes an update on its own; a build
//! different from the hand-off's starting build (or a reached target) completes it; no activity
//! ends it quietly.
//!
//! `update_step` is pure. The install loop gathers the observation, calls it, applies the effects
//! and, when `request_install_app` is set, runs [`request_steam_install_app`] and hands the outcome
//! to the next tick's observation (`install_app_outcome`). The outcome is applied at the start of
//! that next step against the tick that made the request, which gives the same result as TS
//! awaiting the helper inside one tick.

use crate::acf_state::{is_acf_update_pending, AcfSource, AcfUpdateFields};
use crate::constants::{
    STATE_FLAG_FULLY_INSTALLED, STEAM_INSTALLAPP_RETRY_EVERY_TICKS,
    STEAM_INSTALLAPP_RETRY_MAX_ATTEMPTS, STEAM_REQUEST_NO_ACTIVITY_TICKS,
    STEAM_UPDATE_ABANDONED_TICKS,
};
use crate::effects::{status_update, Continuation, Effect, LogLevel};
use crate::events::StateEvent;
use crate::host::{PollHost, ProcessRunner};
use crate::monitor::DownloadReading;
use crate::progress::{live_progress, LiveProgressInput};
use serde_json::{json, Map, Value};
use std::path::Path;
use std::time::Duration;

/// `HELPER_TIMEOUT_MS` in steamInstallApp.ts.
pub const HELPER_TIMEOUT_MS: u64 = 30_000;
/// The TS runner caps helper stdout at 64 KiB; a longer one counts as truncated (helper-failed).
const HELPER_MAX_STDOUT_BYTES: usize = 64 * 1024;
const STATE_FLAGS_RUNNING: u32 = 0x100 | 0x400;
const STATE_FLAG_UPDATE_REQUIRED: u32 = 0x2;

// ---------------------------------------------------------------------------------------------
// InstallApp helper request
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SteamInstallAppOutcome {
    Ok { folder_index: i64 },
    Unavailable { reason: String },
    Error { code: i64 },
}

fn unavailable(reason: &str) -> SteamInstallAppOutcome {
    SteamInstallAppOutcome::Unavailable {
        reason: reason.to_string(),
    }
}

fn is_valid_app_id(app_id: &str) -> bool {
    (1..=10).contains(&app_id.len()) && app_id.bytes().all(|b| b.is_ascii_digit())
}

/// Ask running Steam to InstallApp `app_id` through the bundled bridge helper. Never errors; every
/// failure maps to a typed `Unavailable`. The helper path comes only from the shell host (T-80-37).
pub async fn request_steam_install_app<H, R>(
    host: &H,
    runner: &R,
    app_id: &str,
    library_path: Option<&str>,
) -> SteamInstallAppOutcome
where
    H: PollHost + ?Sized,
    R: ProcessRunner + ?Sized,
{
    if !is_valid_app_id(app_id) {
        return unavailable("bad-appid");
    }
    let Some(helper) = host.bridge_helper_path().filter(|p| Path::new(p).exists()) else {
        return unavailable("helper-missing");
    };
    let mut argv = vec!["--steam-installapp".to_string(), app_id.to_string()];
    if let Some(path) = library_path {
        // One argv element (T-80-38); no shell is involved.
        argv.push("--library".to_string());
        argv.push(path.to_string());
    }
    let out = runner
        .run(
            &helper.to_string_lossy(),
            argv,
            Duration::from_millis(HELPER_TIMEOUT_MS),
        )
        .await;
    // Spawn failure and timeout surface as `code: None`; truncation as an oversize stdout.
    if out.code.is_none() || out.stdout.len() > HELPER_MAX_STDOUT_BYTES {
        return unavailable("helper-failed");
    }
    let last = out.stdout.lines().rfind(|l| !l.trim().is_empty());
    let parsed: Option<Value> = last.and_then(|l| serde_json::from_str(l).ok());
    let Some(Value::Object(obj)) = parsed else {
        return unavailable("helper-failed");
    };
    match obj.get("result").and_then(Value::as_str) {
        Some("ok") => SteamInstallAppOutcome::Ok {
            folder_index: obj
                .get("folderIndex")
                .and_then(Value::as_f64)
                .map_or(0, |n| n as i64),
        },
        Some("unavailable") if obj.get("reason").is_some_and(Value::is_string) => {
            SteamInstallAppOutcome::Unavailable {
                reason: obj["reason"].as_str().unwrap_or_default().to_string(),
            }
        }
        Some("error") if obj.get("eAppUpdateError").is_some_and(Value::is_number) => {
            SteamInstallAppOutcome::Error {
                code: obj["eAppUpdateError"].as_f64().map_or(0, |n| n as i64),
            }
        }
        _ => unavailable("helper-failed"),
    }
}

// ---------------------------------------------------------------------------------------------
// update_step
// ---------------------------------------------------------------------------------------------

/// Armed when the hand-off's InstallApp was unavailable (Steam closed).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InstallAppRetry {
    pub library_path: Option<String>,
    pub attempts: u32,
    pub in_flight: bool,
    /// Tick that made the in-flight request.
    pub request_tick: u32,
}

/// `ActiveInstallPoll.awaitingUpdate` plus the two poll scalars the update tick owns
/// (`delegatedSinceTick`, `lastBytesDownloaded`), so this module never reads the install loop.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AwaitingUpdate {
    pub from_build: String,
    pub target_build: Option<String>,
    pub saw_pending: bool,
    pub saw_activity: bool,
    pub settled_at_start_ticks: u32,
    pub install_app_retry: Option<InstallAppRetry>,
    pub delegated_since_tick: u32,
    pub last_bytes_downloaded: Option<u64>,
}

impl AwaitingUpdate {
    pub fn new(from_build: &str, target_build: Option<&str>, delegated_since_tick: u32) -> Self {
        Self {
            from_build: from_build.to_string(),
            target_build: target_build.map(str::to_string),
            saw_pending: false,
            saw_activity: false,
            settled_at_start_ticks: 0,
            install_app_retry: None,
            delegated_since_tick,
            last_bytes_downloaded: None,
        }
    }

    /// Arm the InstallApp retry (hand-off InstallApp was unavailable).
    pub fn with_retry(mut self, library_path: Option<&str>) -> Self {
        self.install_app_retry = Some(InstallAppRetry {
            library_path: library_path.map(str::to_string),
            attempts: 0,
            in_flight: false,
            request_tick: 0,
        });
        self
    }
}

#[derive(Debug, Clone)]
pub struct UpdateObservation {
    /// This tick's ACF update fields; `None` when the manifest could not be read.
    pub fields: Option<AcfUpdateFields>,
    /// The macOS download monitor reading for this app, if any.
    pub monitor: Option<DownloadReading>,
    /// Outcome of the InstallApp request the previous step asked for.
    pub install_app_outcome: Option<SteamInstallAppOutcome>,
    /// Sequence number for the `updateDone` event this step may emit.
    pub seq: u64,
    /// `isMac` (the live monitor is only consulted for native polls on macOS).
    pub is_mac: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct UpdateStep {
    pub effects: Vec<Effect>,
    /// The poll is over; the loop stops it.
    pub stop: bool,
    /// Run `request_steam_install_app` with this library path (outer `Some`) and feed the outcome
    /// into the next observation.
    pub request_install_app: Option<Option<String>>,
}

fn log(level: LogLevel, message: String) -> Effect {
    Effect::Log { level, message }
}

fn update_done(app_id: &str, seq: u64, completed: bool, then: Continuation) -> Effect {
    Effect::Transition {
        event: StateEvent::UpdateDone {
            app_id: app_id.to_string(),
            seq,
            completed,
        },
        then,
    }
}

fn complete(app_id: &str, seq: u64, build: &str, verb: &str) -> UpdateStep {
    UpdateStep {
        effects: vec![
            log(
                LogLevel::Info,
                format!("Steam: update of appId {app_id} {verb} (build {build})"),
            ),
            // After the ack: gameStatusUpdate updating + managedBySteam, then done (74 UAT 12).
            update_done(
                app_id,
                seq,
                true,
                Continuation::UpdateDone {
                    app_id: app_id.to_string(),
                    completed: true,
                },
            ),
        ],
        stop: true,
        request_install_app: None,
    }
}

/// Not finished: the badge stays because the cached update state is re-read, not cleared.
fn end_quietly(app_id: &str, seq: u64, message: String) -> UpdateStep {
    UpdateStep {
        effects: vec![
            log(LogLevel::Info, message),
            update_done(app_id, seq, false, Continuation::None),
            status_update(app_id, "done", None),
        ],
        stop: true,
        request_install_app: None,
    }
}

/// `filesize.partial({ base: 2 })` as the TS `getFileSize` (IEC units, two decimals).
pub fn format_file_size(bytes: f64) -> String {
    const UNITS: [&str; 6] = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
    if bytes < 1024.0 {
        return format!("{} B", trim_num(bytes));
    }
    let mut exp = 0usize;
    let mut val = bytes;
    while val >= 1024.0 && exp < UNITS.len() - 1 {
        val /= 1024.0;
        exp += 1;
    }
    if (val * 100.0).round() / 100.0 >= 1024.0 && exp < UNITS.len() - 1 {
        val /= 1024.0;
        exp += 1;
    }
    format!("{} {}", trim_num((val * 100.0).round() / 100.0), UNITS[exp])
}

fn trim_num(n: f64) -> String {
    if n.fract() == 0.0 {
        format!("{}", n as i64)
    } else {
        format!("{n}")
    }
}

/// Apply the previous step's InstallApp outcome (the body of TS `retryInstallApp` after the await).
fn apply_install_app_outcome(
    awaiting: &mut AwaitingUpdate,
    app_id: &str,
    outcome: &SteamInstallAppOutcome,
    effects: &mut Vec<Effect>,
) {
    let Some(retry) = awaiting.install_app_retry.as_mut() else {
        return;
    };
    retry.in_flight = false;
    match outcome {
        SteamInstallAppOutcome::Ok { .. } => {
            effects.push(log(
                LogLevel::Info,
                format!(
                    "SteamGame: Steam is updating appId {app_id} via InstallApp (retry after Steam start)"
                ),
            ));
            let request_tick = retry.request_tick;
            awaiting.install_app_retry = None;
            awaiting.delegated_since_tick = request_tick;
        }
        SteamInstallAppOutcome::Error { code } => {
            effects.push(log(
                LogLevel::Warn,
                format!(
                    "SteamGame: Steam refused InstallApp update retry for appId {app_id} (EAppUpdateError {code})"
                ),
            ));
            awaiting.install_app_retry = None;
        }
        SteamInstallAppOutcome::Unavailable { reason } => {
            retry.attempts += 1;
            if retry.attempts >= STEAM_INSTALLAPP_RETRY_MAX_ATTEMPTS {
                effects.push(log(
                    LogLevel::Info,
                    format!(
                        "SteamGame: InstallApp retry for appId {app_id} gave up after {} attempts ({reason})",
                        retry.attempts
                    ),
                ));
                awaiting.install_app_retry = None;
            }
        }
    }
}

fn js_round(x: f64) -> f64 {
    (x + 0.5).floor()
}

/// One update-poll tick (`pollUpdateOnce`). `ticks` is the poll's tick counter for this tick.
pub fn update_step(
    awaiting: &mut AwaitingUpdate,
    ticks: u32,
    source: AcfSource,
    app_id: &str,
    obs: &UpdateObservation,
) -> UpdateStep {
    let mut effects: Vec<Effect> = Vec::new();

    if let Some(outcome) = &obs.install_app_outcome {
        apply_install_app_outcome(awaiting, app_id, outcome, &mut effects);
    }

    if let Some(fields) = &obs.fields {
        let pending = is_acf_update_pending(fields);
        if pending {
            awaiting.saw_pending = true;
        }
        let at_stale_start = awaiting
            .target_build
            .as_deref()
            .is_some_and(|t| fields.buildid == awaiting.from_build && fields.buildid != t);
        let growing = awaiting
            .last_bytes_downloaded
            .is_some_and(|last| fields.bytes_downloaded > last);
        let fully_installed = fields.state_flags & STATE_FLAG_FULLY_INSTALLED != 0;
        if fields.state_flags & STATE_FLAGS_RUNNING != 0
            || (fields.state_flags & STATE_FLAG_UPDATE_REQUIRED != 0 && growing)
        {
            awaiting.saw_activity = true;
        }

        if !pending
            && !at_stale_start
            && fully_installed
            && (awaiting.saw_pending
                || awaiting.saw_activity
                // a stale target always differs from fromBuild, so this also covers the target
                || fields.buildid != awaiting.from_build)
        {
            let mut step = complete(app_id, obs.seq, &fields.buildid, "finished");
            effects.append(&mut step.effects);
            step.effects = effects;
            return step;
        }

        // WR-01: activity was seen, then the ACF settled back at the starting build with a known
        // newer target. Consecutive ticks only.
        if awaiting.saw_activity
            && at_stale_start
            && !pending
            && fully_installed
            && fields.state_flags & STATE_FLAGS_RUNNING == 0
        {
            awaiting.settled_at_start_ticks += 1;
            if awaiting.settled_at_start_ticks >= STEAM_UPDATE_ABANDONED_TICKS {
                let mut step = end_quietly(
                    app_id,
                    obs.seq,
                    format!(
                        "Steam: update of appId {app_id} settled back at build {} for {STEAM_UPDATE_ABANDONED_TICKS} ticks; ending the update poll quietly",
                        awaiting.from_build
                    ),
                );
                effects.append(&mut step.effects);
                step.effects = effects;
                return step;
            }
        } else {
            awaiting.settled_at_start_ticks = 0;
        }

        let live = if obs.is_mac && source == AcfSource::Native {
            obs.monitor.as_ref().and_then(|m| {
                live_progress(&LiveProgressInput {
                    download_done: m.bytes_done,
                    download_total: m.bytes_total,
                    cum_at_start: 0.0,
                    cum_now: 0.0,
                    acf_bytes_downloaded: fields.bytes_downloaded as f64,
                    acf_bytes_to_download: fields.bytes_to_download as f64,
                })
            })
        } else {
            None
        };
        let done = live.map_or(fields.bytes_downloaded as f64, |l| l.bytes_done);
        let total = live.map_or(fields.bytes_to_download as f64, |l| l.total);
        awaiting.last_bytes_downloaded = Some(fields.bytes_downloaded);

        effects.push(status_update(
            app_id,
            "updating",
            Some(("managedBySteam", json!(true))),
        ));
        if total > 0.0 {
            let raw = (done / total) * 100.0;
            if raw.is_finite() {
                let percent = js_round(raw).clamp(0.0, 99.0) as i64;
                let mut progress = Map::new();
                progress.insert("percent".into(), json!(percent));
                progress.insert("bytes".into(), json!(format_file_size(done)));
                progress.insert("eta".into(), json!(""));
                let mut payload = Map::new();
                payload.insert("appName".into(), json!(app_id));
                payload.insert("runner".into(), json!("steam"));
                payload.insert("status".into(), json!("updating"));
                payload.insert("progress".into(), Value::Object(progress));
                effects.push(Effect::Frontend {
                    channel: "progressUpdate".into(),
                    args: vec![Value::Object(payload)],
                });
            }
        }
    }

    // UAT 19 (74-30): retry InstallApp on this tick while armed; bounded, never overlapping.
    let mut request_install_app = None;
    let since_handoff = ticks.saturating_sub(awaiting.delegated_since_tick);
    if !awaiting.saw_activity
        && since_handoff > 0
        && since_handoff % STEAM_INSTALLAPP_RETRY_EVERY_TICKS == 0
    {
        if let Some(retry) = awaiting.install_app_retry.as_mut() {
            if !retry.in_flight {
                retry.in_flight = true;
                retry.request_tick = ticks;
                request_install_app = Some(retry.library_path.clone());
            }
        }
    }

    if !awaiting.saw_activity && since_handoff >= STEAM_REQUEST_NO_ACTIVITY_TICKS {
        if let Some(f) = &obs.fields {
            if !is_acf_update_pending(f)
                && f.state_flags & STATE_FLAG_FULLY_INSTALLED != 0
                && awaiting
                    .target_build
                    .as_deref()
                    .map_or(true, |t| f.buildid == t)
            {
                let mut step = complete(app_id, obs.seq, &f.buildid, "finished");
                effects.append(&mut step.effects);
                step.effects = effects;
                return step;
            }
        }
        let mut step = end_quietly(
            app_id,
            obs.seq,
            format!(
                "Steam: no update activity for appId {app_id} within {STEAM_REQUEST_NO_ACTIVITY_TICKS} ticks; ending the update poll quietly"
            ),
        );
        effects.append(&mut step.effects);
        step.effects = effects;
        return step;
    }

    UpdateStep {
        effects,
        stop: false,
        request_install_app,
    }
}
