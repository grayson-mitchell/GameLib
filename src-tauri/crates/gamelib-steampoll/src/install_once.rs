//! Port of `library/installPollOnce.ts`: the per-tick install state machine as a pure step.
//!
//! `install_step` takes one tick's observation and returns effects plus loop requests. It never
//! awaits. The two TS awaits inside a tick become requests the loop satisfies and feeds back by
//! calling the step again for the same tick:
//!
//! - the InstallApp retry of the update tick (`InstallStep::update`).
//!
//! There is no restart hold (Phase 81, D-11): a native handoff runs start -> downloading ->
//! Installed, and the "restart Steam" wait is restart-on-Play's pending-adoption record, written by
//! the sidecar, not this poll.
//!
//! Completion order (D-05, R2): the `installed` state event goes out first; after the ack
//! `Continuation::Installed` emits `gameStatusUpdate` done (or the bridge finishing context), the
//! "Installation Finished" toast, the depot-skipped notice and the restart-Steam notice. The Mac
//! arch probe (R6) is fire-and-forget off-tick: the step returns a [`MacArchFollowUp`] and the loop
//! runs it only when the ack reply says `macArchCheck` ([`wants_mac_arch_probe`]); the verdict
//! becomes a `macArchVerdict` state event ([`run_mac_arch_followup`]) with no post-ack effects.
//!
//! Differences from the TS, forced by the split of state: the sidecar's `existing` library entry is
//! built by the state-event handler (R2), so `is_installed`/store writes are not here; titles come
//! from `ActiveInstall::title` (refreshed from the ack); `isBridgeInstallFinalized` is read when
//! the step runs and not after the ack.

use crate::acf_state::{AcfSource, AcfState, AcfUpdateFields, PollRoots};
use crate::constants::{BYTES_PER_MIB, GAMELIB_HANDOFF_STATE_FLAGS, STALLED_TICKS_THRESHOLD};
use crate::effects::{Continuation, Effect, LogLevel};
use crate::events::{AckReply, StateEvent};
use crate::host::{Notification, NotifyText, ProcessRunner};
use crate::mac_arch::{mac_arch_verdict, MacArch};
use crate::monitor::DownloadReading;
use crate::profile::Platform;
use crate::progress::{
    format_eta, live_progress, rolling_rate_mib_s, LiveProgress, LiveProgressInput,
};
use crate::uninstall::source_name;
use crate::update::{
    format_file_size, update_step, AwaitingUpdate, SteamInstallAppOutcome, UpdateObservation,
};
use serde_json::{json, Map, Value};
use std::path::Path;

/// The poll-side fields of a GameLib depot handoff (D-11: no hold lifecycle, no probe state).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct HandoffPoll {
    pub is_native_handoff: bool,
    pub skipped_depots: Vec<String>,
    pub seen_downloading: bool,
    pub absent_ticks_since_seen: u32,
}

/// Port of `ActiveInstallPoll` minus `timer`. The handoff fields live in [`HandoffPoll`]
/// (`handoff`).
#[derive(Debug, Clone)]
pub struct ActiveInstall {
    pub title: String,
    pub roots: PollRoots,
    /// Tick counter for this tick, maintained by the loop.
    pub ticks: u32,
    pub source: AcfSource,
    /// Fire-once guard (T-21-16-03) for the "restart Steam" notification.
    pub notified_waiting: bool,
    /// Previous tick's effective downloaded bytes and the wall-clock time they were seen at.
    pub last_bytes_downloaded: Option<f64>,
    pub last_tick_ms: Option<u64>,
    pub stalled_ticks: u32,
    /// Separate fire-once guard for the depot-skipped completion notice (23.2-04).
    pub notified_depot_skipped: bool,
    pub delegated_to_steam_client: bool,
    pub delegated_since_tick: u32,
    /// `isNativeHandoff`, `skippedDepots`, `seenDownloading`, `absentTicksSinceSeen`.
    pub handoff: HandoffPoll,
    /// Phase 74 (D-11): this poll watches an update of an installed game.
    pub awaiting_update: Option<AwaitingUpdate>,
}

impl ActiveInstall {
    pub fn new(title: &str, roots: PollRoots, source: AcfSource) -> Self {
        Self {
            title: title.to_string(),
            roots,
            ticks: 0,
            source,
            notified_waiting: false,
            last_bytes_downloaded: None,
            last_tick_ms: None,
            stalled_ticks: 0,
            notified_depot_skipped: false,
            delegated_to_steam_client: false,
            delegated_since_tick: 0,
            handoff: HandoffPoll::default(),
            awaiting_update: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct InstallObservation {
    /// This tick's ACF state on the poll's root.
    pub acf: AcfState,
    /// ACF update fields, read by the loop only while `awaiting_update` is set.
    pub update_fields: Option<AcfUpdateFields>,
    /// The live download reading for this app, if any: the macOS nettop monitor's, or on Windows
    /// the steam.exe write counter's (see [`windows_live_applies`]).
    pub monitor: Option<DownloadReading>,
    pub now_ms: u64,
    pub platform: Platform,
    /// `isBridgeInstallFinalized(appId)`, read when the step runs.
    pub bridge_finalized: bool,
    /// Outcome of the InstallApp request the previous update step asked for.
    pub install_app_outcome: Option<SteamInstallAppOutcome>,
    /// Sequence number for the state event this step may emit.
    pub seq: u64,
}

/// Run `update::request_steam_install_app` with this library path and feed the outcome into the
/// next observation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdateRequest {
    pub library_path: Option<String>,
}

/// The post-install ground-truth probe (MAC32-03): native installs on macOS only.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MacArchFollowUp {
    pub app_id: String,
    pub source: AcfSource,
    pub install_path: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct InstallStep {
    pub effects: Vec<Effect>,
    /// The poll is over; the loop stops it.
    pub stop: bool,
    pub update: Option<UpdateRequest>,
    /// Off-tick, fire-and-forget; run only when the ack reply allows it.
    pub mac_arch: Option<MacArchFollowUp>,
}

impl InstallStep {
    fn effects(effects: Vec<Effect>) -> Self {
        Self {
            effects,
            stop: false,
            update: None,
            mac_arch: None,
        }
    }

    fn stopped(effects: Vec<Effect>) -> Self {
        Self {
            stop: true,
            ..Self::effects(effects)
        }
    }
}

fn log(level: LogLevel, message: String) -> Effect {
    Effect::Log { level, message }
}

/// Whether the Windows live source (steam.exe's write counter, `win_live.rs`) is this poll's
/// progress source: a native poll that follows a download the Steam client performs itself, that
/// is, one delegated to Steam and not a GameLib depot handoff. On macOS the same polls use the
/// nettop monitor; Linux has no live source and reads the ACF alone. Update polls use it too,
/// through `update_tick`.
pub fn windows_live_applies(platform: Platform, poll: &ActiveInstall) -> bool {
    platform == Platform::Win32
        && poll.delegated_to_steam_client
        && poll.source == AcfSource::Native
        && !poll.handoff.is_native_handoff
}

fn js_round(x: f64) -> f64 {
    (x + 0.5).floor()
}

/// `gameStatusUpdate` with the optional `context` and `managedBySteam` keys of this machine.
fn installing_status(app_id: &str, context: Option<&str>, managed_by_steam: bool) -> Effect {
    let mut m = Map::new();
    m.insert("appName".into(), json!(app_id));
    m.insert("runner".into(), json!("steam"));
    m.insert("status".into(), json!("installing"));
    if let Some(c) = context {
        m.insert("context".into(), json!(c));
    }
    if managed_by_steam {
        m.insert("managedBySteam".into(), json!(true));
    }
    Effect::Frontend {
        channel: "gameStatusUpdate".into(),
        args: vec![Value::Object(m)],
    }
}

/// One install-poll tick (`pollInstallOnce`).
pub fn install_step(
    app_id: &str,
    poll: &mut ActiveInstall,
    obs: &InstallObservation,
) -> InstallStep {
    // Phase 74 (D-11): an update of an installed game has its own tick.
    if poll.awaiting_update.is_some() {
        return update_tick(app_id, poll, obs);
    }
    match &obs.acf {
        AcfState::Downloading {
            state_flags,
            bytes_downloaded,
            bytes_to_download,
            bytes_staged,
            bytes_to_stage,
        } => downloading(
            app_id,
            poll,
            obs,
            *state_flags,
            [
                *bytes_downloaded,
                *bytes_to_download,
                *bytes_staged,
                *bytes_to_stage,
            ],
        ),
        AcfState::Installed {
            install_path,
            size_on_disk,
            buildid,
            ..
        } => installed(app_id, poll, obs, install_path, size_on_disk, buildid),
        AcfState::Absent => absent(poll),
        AcfState::Unknown => InstallStep::effects(vec![]),
    }
}

fn update_tick(app_id: &str, poll: &mut ActiveInstall, obs: &InstallObservation) -> InstallStep {
    let ticks = poll.ticks;
    let source = poll.source;
    let windows_live = windows_live_applies(obs.platform, poll);
    let Some(awaiting) = poll.awaiting_update.as_mut() else {
        return InstallStep::effects(vec![]);
    };
    let step = update_step(
        awaiting,
        ticks,
        source,
        app_id,
        &UpdateObservation {
            fields: obs.update_fields.clone(),
            monitor: obs.monitor,
            install_app_outcome: obs.install_app_outcome.clone(),
            seq: obs.seq,
            is_mac: obs.platform == Platform::Darwin,
            windows_live,
        },
    );
    InstallStep {
        effects: step.effects,
        stop: step.stop,
        update: step
            .request_install_app
            .map(|library_path| UpdateRequest { library_path }),
        mac_arch: None,
    }
}

fn downloading(
    app_id: &str,
    poll: &mut ActiveInstall,
    obs: &InstallObservation,
    state_flags: Option<u32>,
    bytes: [u64; 4],
) -> InstallStep {
    let [bytes_downloaded, bytes_to_download, bytes_staged, bytes_to_stage] = bytes;
    let mut fx: Vec<Effect> = Vec::new();
    poll.handoff.seen_downloading = true;
    poll.handoff.absent_ticks_since_seen = 0;

    // D-UAT-04: GameLib writes StateFlags exactly 1026 on handoff. Only a poll that follows
    // GameLib's own depot download may read it as a finished handoff (1026 is also Steam's own
    // ordinary active-download state).
    let is_waiting =
        state_flags == Some(GAMELIB_HANDOFF_STATE_FLAGS) && poll.handoff.is_native_handoff;

    // quick 261030-o77: a bottle-source handoff at 1026 is incomplete and resumable, never
    // "waiting on bottled Steam".
    if is_waiting && poll.source == AcfSource::Bottle {
        fx.push(log(
            LogLevel::Warn,
            format!(
                "Steam: bottle install for appId {app_id} finalized at StateFlags {GAMELIB_HANDOFF_STATE_FLAGS} — GameLib could not verify the full install, so it is marked incomplete and resumable (no bottled-Steam handoff)"
            ),
        ));
        // R5: the state event first, then gameStatusUpdate done after the ack.
        fx.push(Effect::Transition {
            event: StateEvent::InstallIncomplete {
                app_id: app_id.to_string(),
                seq: obs.seq,
            },
            then: Continuation::InstallIncomplete {
                app_id: app_id.to_string(),
            },
        });
        return InstallStep::stopped(fx);
    }

    // quick 261029-sex: on an eligible macOS native poll the monitor supplies the effective bytes.
    // Windows delegated native polls get theirs from steam.exe's write counter (win_live.rs).
    // Linux stays ACF-only.
    let is_mac = obs.platform == Platform::Darwin;
    let live: Option<DownloadReading> =
        if (is_mac && poll.source == AcfSource::Native && !poll.handoff.is_native_handoff)
            || windows_live_applies(obs.platform, poll)
        {
            obs.monitor
        } else {
            None
        };
    let live_p: Option<LiveProgress> = live.and_then(|m| {
        live_progress(&LiveProgressInput {
            download_done: m.bytes_done,
            download_total: m.bytes_total,
            cum_at_start: 0.0,
            cum_now: 0.0,
            acf_bytes_downloaded: bytes_downloaded as f64,
            acf_bytes_to_download: bytes_to_download as f64,
        })
    });
    let dl_bytes = live_p.map_or(bytes_downloaded as f64, |l| l.bytes_done);
    let dl_total = live_p.map_or(bytes_to_download as f64, |l| l.total);

    // T-AOG: STALLED_TICKS_THRESHOLD consecutive frozen ticks of a real in-flight download
    // surface 'steam-paused'; the restart hint always takes precedence.
    let real_download_in_flight = dl_total > 0.0 && dl_bytes < dl_total;
    if real_download_in_flight
        && poll
            .last_bytes_downloaded
            .is_some_and(|last| dl_bytes <= last)
    {
        poll.stalled_ticks += 1;
    } else {
        poll.stalled_ticks = 0;
    }
    let is_paused = !is_waiting && poll.stalled_ticks >= STALLED_TICKS_THRESHOLD;

    let context = if is_waiting {
        Some("steam-waiting-for-restart")
    } else if is_paused {
        Some("steam-paused")
    } else {
        None
    };
    fx.push(installing_status(
        app_id,
        context,
        poll.delegated_to_steam_client,
    ));

    if is_waiting && !poll.notified_waiting {
        poll.notified_waiting = true;
        fx.push(Effect::Notify(restart_to_finish_notification(&poll.title)));
    }

    // T-AOG: speed and ETA from the download bytes, after the stalled comparison has read the
    // previous tick's baseline.
    let mut down_speed: Option<f64> = None;
    if let (Some(prev_bytes), Some(prev_ms)) = (poll.last_bytes_downloaded, poll.last_tick_ms) {
        let delta_bytes = dl_bytes - prev_bytes;
        let delta_ms = obs.now_ms as f64 - prev_ms as f64;
        let rate = rolling_rate_mib_s(delta_bytes, delta_ms, 0.0);
        if delta_bytes >= 0.0 && rate.is_finite() && rate > 0.0 {
            down_speed = Some(rate);
        }
    }
    // The nettop window rate (<= 3 s) beats the 3 s ACF delta.
    if let (Some(_), Some(speed)) = (live_p, live.and_then(|m| m.speed_bytes_per_sec)) {
        let live_rate = speed / BYTES_PER_MIB as f64;
        if live_rate.is_finite() && live_rate > 0.0 {
            down_speed = Some(live_rate);
        }
    }
    poll.last_bytes_downloaded = Some(dl_bytes);
    poll.last_tick_ms = Some(obs.now_ms);

    let mut eta = String::new();
    if let Some(speed) = down_speed {
        if speed > 0.0 && dl_total > dl_bytes {
            let eta_seconds = (dl_total - dl_bytes) / (speed * BYTES_PER_MIB as f64);
            if eta_seconds.is_finite() && eta_seconds > 0.0 {
                eta = format_eta(eta_seconds);
            }
        }
    }

    let use_staged = live_p.is_none() && bytes_to_download == 0;
    let (denominator, numerator) = if live_p.is_some() {
        (dl_total, dl_bytes)
    } else if use_staged {
        (bytes_to_stage as f64, bytes_staged as f64)
    } else {
        (bytes_to_download as f64, bytes_downloaded as f64)
    };
    if denominator > 0.0 {
        let raw_percent = (numerator / denominator) * 100.0;
        if raw_percent.is_finite() {
            // Live path: 100 % comes only from the installed branch (StateFlags 4).
            let upper = if live_p.is_some() { 99.0 } else { 100.0 };
            let percent = js_round(raw_percent).clamp(0.0, upper) as i64;
            let mut progress = Map::new();
            progress.insert("percent".into(), json!(percent));
            progress.insert("bytes".into(), json!(format_file_size(numerator)));
            progress.insert("eta".into(), json!(eta));
            if let Some(s) = down_speed {
                progress.insert("downSpeed".into(), json!(s));
            }
            let mut payload = Map::new();
            payload.insert("appName".into(), json!(app_id));
            payload.insert("runner".into(), json!("steam"));
            payload.insert("status".into(), json!("installing"));
            payload.insert("progress".into(), Value::Object(progress));
            fx.push(Effect::Frontend {
                channel: "progressUpdate".into(),
                args: vec![Value::Object(payload)],
            });
        }
    }
    InstallStep::effects(fx)
}

fn absent(poll: &mut ActiveInstall) -> InstallStep {
    // Grace/cap logic lives in the loop; this only counts the ticks the manifest has been gone.
    if poll.handoff.seen_downloading {
        poll.handoff.absent_ticks_since_seen += 1;
    }
    InstallStep::effects(vec![])
}

fn installed(
    app_id: &str,
    poll: &mut ActiveInstall,
    obs: &InstallObservation,
    install_path: &str,
    size_on_disk: &str,
    buildid: &Option<String>,
) -> InstallStep {
    let mut fx: Vec<Effect> = Vec::new();

    // Quick 261029-exu: a bridge install keeps working after its manifest lands, so
    // installBridgeGame owns the final 'done' and the toast.
    let installer_owns_completion = poll.source == AcfSource::Bridge;

    let skipped_depots = if !poll.handoff.skipped_depots.is_empty() && !poll.notified_depot_skipped
    {
        poll.notified_depot_skipped = true;
        poll.handoff.skipped_depots.clone()
    } else {
        Vec::new()
    };

    // Phase 81 (D-11/D-14): restart-on-Play replaced the "restart Steam" notice for native
    // installs on every OS, so a StateFlags=4 handoff only asks for a restart on the bottle
    // source, where restart-on-Play does not apply (a bottled-Steam restart adopts it).
    let notify_restart_steam = poll.handoff.is_native_handoff
        && poll.source == AcfSource::Bottle
        && !installer_owns_completion
        && !poll.notified_waiting;
    if notify_restart_steam {
        poll.notified_waiting = true;
    }

    fx.push(Effect::Transition {
        event: StateEvent::Installed {
            app_id: app_id.to_string(),
            seq: obs.seq,
            source: source_name(poll.source).to_string(),
            install_path: install_path.to_string(),
            size_on_disk: size_on_disk.to_string(),
            buildid: buildid.clone(),
        },
        then: Continuation::Installed {
            app_id: app_id.to_string(),
            installer_owns_completion,
            bridge_install_finalized: obs.bridge_finalized,
            skipped_depots,
            notify_restart_steam,
        },
    });
    fx.push(log(
        LogLevel::Info,
        format!("Steam: install polling complete for appId {app_id} — badge flipped to installed"),
    ));

    // MAC32-03: native installs on macOS only (a bottle install is a Windows depot).
    let mac_arch =
        (obs.platform == Platform::Darwin && poll.source == AcfSource::Native).then(|| {
            MacArchFollowUp {
                app_id: app_id.to_string(),
                source: poll.source,
                install_path: install_path.to_string(),
            }
        });
    InstallStep {
        mac_arch,
        ..InstallStep::stopped(fx)
    }
}

/// The one-shot "Restart Steam to finish installing {{game}}" toast for a native handoff at the
/// GameLib 1026 wait (`notifyRestartSteamToFinish`).
pub fn restart_to_finish_notification(title: &str) -> Notification {
    let mut params = Map::new();
    params.insert("game".into(), json!(title));
    Notification {
        title: NotifyText::Literal(title.to_string()),
        body: NotifyText::Key {
            key: "steam.waitingForSteam.notify".into(),
            default: "Restart Steam to finish installing {{game}}".into(),
            params,
        },
    }
}

/// The ack reply says the sidecar wants the probe (`macArchCheckNeeded`).
pub fn wants_mac_arch_probe(reply: &AckReply) -> bool {
    reply.mac_arch_check == Some(true)
}

/// `macArchVerdict` state event; nothing follows its ack (the TS handler applies the verdict).
pub fn mac_arch_verdict_effect(app_id: &str, seq: u64, verdict: MacArch) -> Effect {
    Effect::Transition {
        event: StateEvent::MacArchVerdict {
            app_id: app_id.to_string(),
            seq,
            verdict: verdict.as_str().to_string(),
        },
        then: Continuation::None,
    }
}

/// Run the bounded probe (plan 10) and turn a conclusive verdict into its state event. Runs
/// off-tick; an inconclusive probe yields `None`.
pub async fn run_mac_arch_followup(
    runner: &dyn ProcessRunner,
    platform: Platform,
    follow_up: &MacArchFollowUp,
    seq: u64,
) -> Option<Effect> {
    let verdict = mac_arch_verdict(
        runner,
        platform,
        follow_up.source,
        Path::new(&follow_up.install_path),
    )
    .await?;
    Some(mac_arch_verdict_effect(&follow_up.app_id, seq, verdict))
}
