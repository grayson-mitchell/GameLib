//! Port of `library/uninstallPolling.ts` (step machine and loop).
//!
//! `uninstall_step` is pure: one tick's observation in, effects and a stop flag out. The loop
//! (`start_uninstall`) gathers the observation from the ACF readers, applies the effects through
//! `outbox::apply_effects` and cancels on stop.
//!
//! Completion order (D-05, D-11): the state events (`forcedWindowsViaBottleCleared`,
//! `bridgeUninstalled`, `uninstalled`) go out first; after the ack `Continuation::Uninstalled`
//! emits `gameStatusUpdate` done and then the notification: the `notify.uninstalled` toast, or
//! the `gamelib:steam.uninstall.copySurvives` notice when a copy survives.
//!
//! The title the notification carries comes from the ack reply (`titleOf`), falling back to the
//! poll's last known title (R2).
//!
//! Deviations from the TS, both forced by the sidecar owning the state: the "library entry
//! missing" case cannot be seen here (the handler never fabricates an entry), and
//! `bridge_authoritative` is supplied by the start site and not re-read per tick.

use crate::acf_state::{read_acf_state, AcfSource, AcfState, PollRoots};
use crate::constants::{MAX_TICKS, STEAM_REQUEST_NO_ACTIVITY_TICKS, TICK_INTERVAL_MS};
use crate::effects::{status_update, Continuation, Effect, LogLevel};
use crate::events::{StateEvent, Survivor};
use crate::outbox::{apply_effects, Outbox};
use crate::registry::{PollKind, Registry};
use serde_json::{json, Map, Value};
use std::sync::Arc;
use std::time::Duration;
use tokio::time::{interval_at, Instant, MissedTickBehavior};

/// Steam EAppState bit 0x800: actively uninstalling.
const STATE_UNINSTALLING: u32 = 2048;

/// Probe order for a surviving copy (the TS `['native', 'bottle', 'bridge']`).
const PROBE_ORDER: [AcfSource; 3] = [AcfSource::Native, AcfSource::Bottle, AcfSource::Bridge];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UninstallPoll {
    pub ticks: u32,
    pub seen_uninstalling: bool,
    pub source: AcfSource,
    pub title: String,
}

impl UninstallPoll {
    pub fn new(source: AcfSource, title: &str) -> Self {
        UninstallPoll {
            ticks: 0,
            seen_uninstalling: false,
            source,
            title: title.to_string(),
        }
    }
}

/// What one tick saw.
#[derive(Debug, Clone, PartialEq)]
pub struct UninstallObservation {
    /// The ACF state on the poll's own root.
    pub state: AcfState,
    /// The other roots (native, bottle, bridge order, minus `source`) with their ACF state.
    pub others: Vec<(AcfSource, AcfState)>,
    /// `isBridgeAuthoritativeForInstallState`: only a bridge copy counts as a survivor.
    pub bridge_authoritative: bool,
    /// State-event sequence for this tick (every event of one step shares it; the outbox key is
    /// (appId, kind), so equal seqs never collide).
    pub seq: u64,
}

pub fn source_name(source: AcfSource) -> &'static str {
    match source {
        AcfSource::Native => "native",
        AcfSource::Bottle => "bottle",
        AcfSource::Bridge => "bridge",
    }
}

fn log(level: LogLevel, message: String) -> Effect {
    Effect::Log { level, message }
}

fn transition(event: StateEvent, then: Continuation) -> Effect {
    Effect::Transition { event, then }
}

/// One uninstall tick (`setInterval` callback plus `pollUninstallOnce`). Returns the effects and
/// whether the poll stops. `next_notice_seq` is called only on the no-activity give-up, so the
/// install-shared notice seq is consumed exactly when a notice is sent.
pub fn uninstall_step(
    poll: &mut UninstallPoll,
    app_id: &str,
    obs: &UninstallObservation,
    next_notice_seq: &mut dyn FnMut() -> u64,
) -> (Vec<Effect>, bool) {
    poll.ticks += 1;

    // Absolute safety cap: stop, rely on the D-01 focus backstop (T-80-41).
    if poll.ticks >= MAX_TICKS {
        return (
            vec![log(
                LogLevel::Warn,
                format!(
                    "uninstall polling for appId {app_id} hit safety cap ({MAX_TICKS} ticks); relying on D-01 focus backstop"
                ),
            )],
            true,
        );
    }

    let (mut effects, stop) = poll_once(poll, app_id, obs);
    if stop {
        return (effects, true);
    }

    // No-activity window (quick 261105-vfq): Steam dropped the request or the user left its
    // confirm dialog. The badge stays installed (D-02).
    if !poll.seen_uninstalling && poll.ticks >= STEAM_REQUEST_NO_ACTIVITY_TICKS {
        effects.push(log(
            LogLevel::Warn,
            format!(
                "Steam did not start the uninstall for appId {app_id}: no activity within {STEAM_REQUEST_NO_ACTIVITY_TICKS} ticks of the request; keeping it installed"
            ),
        ));
        effects.push(status_update(app_id, "done", None));
        let mut m = Map::new();
        m.insert("appId".into(), json!(app_id));
        m.insert("title".into(), json!(poll.title));
        m.insert("kind".into(), json!("uninstall-not-started"));
        m.insert("seq".into(), json!(next_notice_seq()));
        effects.push(Effect::Frontend {
            channel: "steamRequestNotice".into(),
            args: vec![Value::Object(m)],
        });
        return (effects, true);
    }
    (effects, false)
}

/// `pollUninstallOnce`.
fn poll_once(
    poll: &mut UninstallPoll,
    app_id: &str,
    obs: &UninstallObservation,
) -> (Vec<Effect>, bool) {
    let source = poll.source;
    match &obs.state {
        // WR-01 (75 review): the read failed, this tick learned nothing. Never a confirmed
        // absence: no badge flip, no forced-Windows clear; retry.
        AcfState::Unknown => (vec![], false),
        AcfState::Absent => {
            let mut effects = vec![];
            // D-17: clear the forced verdict on a CONFIRMED-absent bottle or bridge tick only,
            // before the survivor probe (a deferral below still leaves it cleared, as the TS).
            if matches!(source, AcfSource::Bottle | AcfSource::Bridge) {
                effects.push(transition(
                    StateEvent::ForcedWindowsViaBottleCleared {
                        app_id: app_id.into(),
                        seq: obs.seq,
                    },
                    Continuation::None,
                ));
            }
            // Operator decision (debug/steam-bottle-uninstall-reverts): check EVERY other root
            // before declaring the title uninstalled. A bridge-authoritative title only counts a
            // bridge copy.
            let mut survivor: Option<(AcfSource, String, String, Option<String>)> = None;
            for candidate in PROBE_ORDER
                .iter()
                .copied()
                .filter(|c| *c != source && (!obs.bridge_authoritative || *c == AcfSource::Bridge))
            {
                let state = obs
                    .others
                    .iter()
                    .find(|(s, _)| *s == candidate)
                    .map(|(_, st)| st)
                    .unwrap_or(&AcfState::Absent);
                match state {
                    // WR-01: a root whose read failed may still hold a copy; defer.
                    AcfState::Unknown => {
                        effects.push(log(
                            LogLevel::Warn,
                            format!(
                                "uninstall-poll could not read the {} root for appId {app_id}; deferring completion to the next tick",
                                source_name(candidate)
                            ),
                        ));
                        return (effects, false);
                    }
                    AcfState::Installed {
                        install_path,
                        size_on_disk,
                        buildid,
                        ..
                    } if !install_path.is_empty() => {
                        survivor = Some((
                            candidate,
                            install_path.clone(),
                            size_on_disk.clone(),
                            buildid.clone(),
                        ));
                        break;
                    }
                    _ => {}
                }
            }

            let removed = source_name(source).to_string();
            if let Some((surv_source, install_path, size_on_disk, buildid)) = survivor {
                let surv_name = source_name(surv_source).to_string();
                effects.push(transition(
                    StateEvent::Uninstalled {
                        app_id: app_id.into(),
                        seq: obs.seq,
                        source: removed.clone(),
                        survivor: Some(Survivor {
                            source: surv_name.clone(),
                            install_path,
                            size_on_disk,
                            buildid,
                        }),
                    },
                    Continuation::Uninstalled {
                        app_id: app_id.into(),
                        removed_source: removed.clone(),
                        survivor_source: Some(surv_name.clone()),
                    },
                ));
                effects.push(log(
                    LogLevel::Info,
                    format!(
                        "uninstall polling complete for appId {app_id}: removed the {removed} copy; a {surv_name} copy survives, badge stays installed"
                    ),
                ));
                return (effects, true);
            }

            // D-11: a completed bridge uninstall also clears the bridge install state.
            if source == AcfSource::Bridge {
                effects.push(transition(
                    StateEvent::BridgeUninstalled {
                        app_id: app_id.into(),
                        seq: obs.seq,
                    },
                    Continuation::None,
                ));
            }
            effects.push(transition(
                StateEvent::Uninstalled {
                    app_id: app_id.into(),
                    seq: obs.seq,
                    source: removed.clone(),
                    survivor: None,
                },
                Continuation::Uninstalled {
                    app_id: app_id.into(),
                    removed_source: removed,
                    survivor_source: None,
                },
            ));
            effects.push(log(
                LogLevel::Info,
                format!(
                    "uninstall polling complete for appId {app_id}: badge flipped to not-installed"
                ),
            ));
            (effects, true)
        }
        AcfState::Downloading { .. } => {
            poll.seen_uninstalling = true;
            (vec![status_update(app_id, "uninstalling", None)], false)
        }
        AcfState::Installed { state_flags, .. } => {
            if state_flags & STATE_UNINSTALLING != 0 {
                poll.seen_uninstalling = true;
                (vec![status_update(app_id, "uninstalling", None)], false)
            } else {
                (vec![], false)
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct StartUninstallArgs {
    pub app_id: String,
    /// Notification title fallback (the TS start site fills it from libraryState).
    pub title: String,
    pub roots: PollRoots,
    pub source: AcfSource,
    /// Defaults to 3000 ms.
    pub interval_ms: Option<u64>,
    pub bridge_authoritative: bool,
}

/// A survivor probe. A root that cannot be resolved at all (the bottle or bridge was never
/// provisioned) cannot hold a copy: absent, not unknown (the TS guards each probe and logs).
fn read_candidate(roots: &PollRoots, app_id: &str, source: AcfSource) -> AcfState {
    let unprovisioned = match source {
        AcfSource::Native => false,
        AcfSource::Bottle => roots.bottle_steamapps_root.is_none(),
        AcfSource::Bridge => roots.bridge_steamapps_root.is_none(),
    };
    if unprovisioned {
        return AcfState::Absent;
    }
    read_acf_state(roots, app_id, source)
}

fn valid_app_id(app_id: &str) -> bool {
    (1..=10).contains(&app_id.len()) && app_id.bytes().all(|b| b.is_ascii_digit())
}

/// Starts the uninstall poll. Idempotent: `Ok(false)` when one is already running for the appId
/// (the TS start rule keeps the existing poll and its counters). `Err` only for a bad appId
/// (T-80-40).
pub fn start_uninstall(
    registry: &Registry,
    outbox: Arc<Outbox>,
    args: StartUninstallArgs,
) -> Result<bool, String> {
    if !valid_app_id(&args.app_id) {
        return Err("bad appId".into());
    }
    // Check and register under one lock: two concurrent starts must not both spawn a task
    // (80-REVIEW A/WR-06).
    let Some((token, guard)) = registry.try_register(PollKind::Uninstall, &args.app_id) else {
        return Ok(false);
    };
    let reg = registry.clone();
    let period = Duration::from_millis(args.interval_ms.unwrap_or(TICK_INTERVAL_MS).max(1));
    registry.spawn(async move {
        let _guard = guard;
        let host = reg.host().clone();
        let mut poll = UninstallPoll::new(args.source, &args.title);
        let mut title = args.title.clone();
        // setInterval semantics: the first tick is one period out.
        let mut ticker = interval_at(Instant::now() + period, period);
        ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
        loop {
            tokio::select! {
                _ = token.cancelled() => break,
                _ = ticker.tick() => {}
            }
            let obs = UninstallObservation {
                state: read_acf_state(&args.roots, &args.app_id, args.source),
                others: PROBE_ORDER
                    .iter()
                    .copied()
                    .filter(|c| *c != args.source)
                    .map(|c| (c, read_candidate(&args.roots, &args.app_id, c)))
                    .collect(),
                bridge_authoritative: args.bridge_authoritative,
                seq: reg.next_event_seq(),
            };
            let (effects, stop) =
                uninstall_step(&mut poll, &args.app_id, &obs, &mut || reg.next_notice_seq());
            apply_effects(host.as_ref(), &outbox, effects, &mut title).await;
            if stop {
                break;
            }
        }
    });
    Ok(true)
}

/// Stops the poll. A no-op (false) when none is running.
pub fn stop_uninstall(registry: &Registry, app_id: &str) -> bool {
    registry.cancel(PollKind::Uninstall, app_id)
}
