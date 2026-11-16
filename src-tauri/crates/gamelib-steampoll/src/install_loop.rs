//! Port of `library/installPolling.ts` and `installStop.ts`: the per-appId install loop, its
//! start / upgrade / stop / cancel surface and the registries TS used to read synchronously (R7).
//!
//! State ownership (plan 15 decision): the polls, the native-in-flight mirror, the bridge-finalized
//! set and the boot re-arm bookkeeping live in [`InstallPolls`], one per process, next to the
//! `Registry` it was built over. The `Registry` keeps owning the task tokens and guards; the
//! [`ActiveInstall`] of an appId lives in `InstallPolls` and carries a generation so a task of a
//! stopped poll can never touch a newer poll registered under the same appId.
//!
//! One tokio task per appId ticks every 3 s with `MissedTickBehavior::Delay` (D-10): a slow tick
//! delays the next one instead of overlapping it. Ticks are integer counters.
//!
//! Per tick (installPolling.ts:225-431): `ticks++`, the `MAX_TICKS` cap (releasing a holding poll
//! first), then observe, `install_step`, the hold probe and InstallApp request the step asks for,
//! `apply_effects`, and the grace / no-activity / manifest-gone rules. The Mac arch follow-up runs
//! off-tick and only when the `installed` ack says `macArchCheck`.
//!
//! Lock discipline: the poll map is locked only for synchronous work, never across an await.
//!
//! Logging rule (T-28-04): appId, kind and counts only.

use crate::acf_state::{read_acf_state, read_acf_update_state, AcfSource, PollRoots};
use crate::constants::{
    GRACE_TICKS, MANIFEST_GONE_TICKS, MAX_TICKS, STEAM_REQUEST_NO_ACTIVITY_TICKS, TICK_INTERVAL_MS,
};
use crate::effects::{status_update, Effect, LogLevel};
use crate::hold::{release_hold, should_hold, HoldPoll, HoldState};
use crate::host::{HoldSink, PollHost};
use crate::install_once::{
    install_step, run_mac_arch_followup, wants_mac_arch_probe, ActiveInstall, HoldOutcome,
    InstallObservation,
};
use crate::monitor::DownloadMonitor;
use crate::outbox::{apply_effects, Outbox};
use crate::profile::Platform;
use crate::registry::{PollKind, Registry};
use crate::update::{
    request_steam_install_app, AwaitingUpdate, InstallAppRetry, SteamInstallAppOutcome,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;
use tokio::time::{interval_at, Instant, MissedTickBehavior};
use tokio_util::sync::CancellationToken;

fn log_line(message: &str) {
    eprintln!("gamelib-steampoll: {message}");
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// `PollOptions.restoredSteamHold` (boot re-arm only).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RestoredSteamHold {
    pub pids: Vec<u32>,
    pub start_ticks: u32,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct InstallAppRetryOpt {
    pub library_path: Option<String>,
    pub attempts: u32,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AwaitingUpdateOpt {
    pub from_build: String,
    pub target_build: Option<String>,
    pub install_app_retry: Option<InstallAppRetryOpt>,
}

/// `PollOptions` (installRoot.ts), every field.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct PollOptions {
    pub interval_ms: Option<u64>,
    pub source: Option<AcfSource>,
    pub is_native_handoff: Option<bool>,
    pub mac_native_route: Option<bool>,
    pub skipped_depots: Option<Vec<String>>,
    pub delegated_to_steam_client: Option<bool>,
    pub adopted_by_steam_client: Option<bool>,
    pub restored_steam_hold: Option<RestoredSteamHold>,
    pub awaiting_update: Option<AwaitingUpdateOpt>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartInstallArgs {
    pub app_id: String,
    /// Notification title fallback (the TS start site fills it from libraryState).
    pub title: String,
    pub roots: PollRoots,
    #[serde(default)]
    pub options: PollOptions,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallStatus {
    pub app_id: String,
    pub delegated_to_steam_client: bool,
    pub awaiting_update: bool,
    /// `unprobed` | `holding` | `released`
    pub steam_hold: String,
}

/// Everything TS read synchronously from `activePolls` and the hold bookkeeping.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PollStatus {
    pub installs: Vec<InstallStatus>,
    pub uninstalls: Vec<String>,
    /// Apps holding for a Steam restart, plus every app in the boot re-arm pending set.
    pub holding: Vec<String>,
}

struct Slot {
    gen: u64,
    poll: ActiveInstall,
}

#[derive(Default)]
struct Shared {
    polls: Mutex<HashMap<String, Slot>>,
    next_gen: AtomicU64,
    native_in_flight: Mutex<HashSet<String>>,
    bridge_finalized: Mutex<HashSet<String>>,
    pending_rearm: Mutex<HashSet<String>>,
    reconcile_ran_during_rearm: AtomicBool,
}

fn valid_app_id(app_id: &str) -> bool {
    (1..=10).contains(&app_id.len()) && app_id.bytes().all(|b| b.is_ascii_digit())
}

fn hold_name(h: HoldState) -> &'static str {
    match h {
        HoldState::Unprobed => "unprobed",
        HoldState::Holding => "holding",
        HoldState::Released => "released",
    }
}

/// quick 261029-sex: only macOS native polls are downloaded by Steam itself.
fn live_monitor_eligible(platform: Platform, poll: &ActiveInstall) -> bool {
    platform == Platform::Darwin && poll.source == AcfSource::Native && !poll.hold.is_native_handoff
}

fn retry_from(o: &InstallAppRetryOpt) -> InstallAppRetry {
    InstallAppRetry {
        library_path: o.library_path.clone(),
        attempts: o.attempts,
        in_flight: false,
        request_tick: 0,
    }
}

fn awaiting_from(o: &AwaitingUpdateOpt, delegated_since_tick: u32) -> AwaitingUpdate {
    let mut a = AwaitingUpdate::new(
        &o.from_build,
        o.target_build.as_deref(),
        delegated_since_tick,
    );
    a.install_app_retry = o.install_app_retry.as_ref().map(retry_from);
    a
}

fn managed_by_steam(app_id: &str) -> Effect {
    status_update(app_id, "installing", Some(("managedBySteam", json!(true))))
}

fn emit(host: &dyn PollHost, effect: Effect) {
    if let Effect::Frontend { channel, args } = effect {
        host.emit_frontend(&channel, args);
    }
}

#[derive(Clone)]
pub struct InstallPolls {
    registry: Registry,
    outbox: Arc<Outbox>,
    hold: Arc<dyn HoldSink>,
    monitor: Arc<DownloadMonitor>,
    platform: Platform,
    shared: Arc<Shared>,
}

impl InstallPolls {
    pub fn new(
        registry: Registry,
        outbox: Arc<Outbox>,
        hold: Arc<dyn HoldSink>,
        monitor: Arc<DownloadMonitor>,
        platform: Platform,
    ) -> Self {
        InstallPolls {
            registry,
            outbox,
            hold,
            monitor,
            platform,
            shared: Arc::new(Shared::default()),
        }
    }

    fn polls(&self) -> MutexGuard<'_, HashMap<String, Slot>> {
        lock(&self.shared.polls)
    }

    fn spawn_monitor_start(&self, app_id: &str, roots: PollRoots) {
        let monitor = self.monitor.clone();
        let app_id = app_id.to_string();
        self.registry.spawn(async move {
            monitor.start(&app_id, &roots).await;
        });
    }

    /// `startInstallPolling`: a new poll, or the upgrade of the one already running for the
    /// appId. `Err` only for a bad appId (T-80-46).
    pub fn start_install(&self, args: StartInstallArgs) -> Result<(), String> {
        if !valid_app_id(&args.app_id) {
            return Err("bad appId".into());
        }
        let StartInstallArgs {
            app_id,
            title,
            roots,
            options: o,
        } = args;
        let mut polls = self.polls();
        if let Some(slot) = polls.get_mut(&app_id) {
            self.upgrade(&app_id, &mut slot.poll, &o);
            return Ok(());
        }

        let interval_ms = o.interval_ms.unwrap_or(TICK_INTERVAL_MS).max(1);
        let source = o.source.unwrap_or(AcfSource::Native);
        let is_native_handoff = o.is_native_handoff.unwrap_or(false);
        let delegated = o.delegated_to_steam_client.unwrap_or(false);
        let adopted = o.adopted_by_steam_client.unwrap_or(false);
        let skipped = o.skipped_depots.clone().unwrap_or_default();
        log_line(&format!(
            "starting install polling for appId {app_id} (interval {interval_ms}ms, source {}, isNativeHandoff {is_native_handoff}, skippedDepots {}, delegatedToSteamClient {delegated}, adoptedBySteamClient {adopted})",
            crate::uninstall::source_name(source),
            skipped.len()
        ));

        let restored = o.restored_steam_hold.as_ref();
        let mut poll = ActiveInstall::new(&title, roots.clone(), source);
        // quick 261029-pkp: a restored hold resumes the elapsed tick count.
        poll.ticks = restored.map_or(0, |r| r.start_ticks);
        poll.notified_waiting = restored.is_some();
        poll.delegated_to_steam_client = delegated;
        poll.hold = HoldPoll {
            steam_hold: if restored.is_some() {
                HoldState::Holding
            } else if adopted {
                HoldState::Released
            } else {
                HoldState::Unprobed
            },
            steam_pids_at_handoff: restored.map(|r| r.pids.clone()).unwrap_or_default(),
            last_steam_probe_ms: if restored.is_some() {
                self.registry.clock().now_ms()
            } else {
                0
            },
            is_native_handoff,
            mac_native_route: o.mac_native_route.unwrap_or(false),
            skipped_depots: skipped,
            seen_downloading: restored.is_some(),
            absent_ticks_since_seen: 0,
        };
        poll.awaiting_update = o.awaiting_update.as_ref().map(|a| awaiting_from(a, 0));

        let gen = self.shared.next_gen.fetch_add(1, Ordering::Relaxed);
        let eligible = live_monitor_eligible(self.platform, &poll);
        polls.insert(app_id.clone(), Slot { gen, poll });
        let (token, guard) = self.registry.register(PollKind::Install, &app_id);
        drop(polls);

        let this = self.clone();
        let task_app = app_id.clone();
        self.registry.spawn(async move {
            let _guard = guard;
            this.run_loop(&task_app, gen, token, Duration::from_millis(interval_ms))
                .await;
        });

        if delegated {
            emit(self.registry.host().as_ref(), managed_by_steam(&app_id));
        }
        if eligible {
            self.spawn_monitor_start(&app_id, roots);
        }
        Ok(())
    }

    /// The existing-entry branch of `startInstallPolling`: field-by-field upgrade rules.
    fn upgrade(&self, app_id: &str, poll: &mut ActiveInstall, o: &PollOptions) {
        if o.is_native_handoff == Some(true) {
            poll.hold.is_native_handoff = true;
            if o.mac_native_route == Some(true) {
                poll.hold.mac_native_route = true;
            }
            // Never discard a non-empty skippedDepots list already on the entry.
            if poll.hold.skipped_depots.is_empty() {
                if let Some(s) = o.skipped_depots.as_ref().filter(|s| !s.is_empty()) {
                    poll.hold.skipped_depots = s.clone();
                }
            }
            // quick 261027-g9o: only the handoff call may retarget the source.
            if let Some(src) = o.source.filter(|s| *s != poll.source) {
                log_line(&format!(
                    "switching in-flight install poll for appId {app_id} from source {} to {}",
                    crate::uninstall::source_name(poll.source),
                    crate::uninstall::source_name(src)
                ));
                poll.source = src;
                // Byte counts from one root's ACF are not comparable with another's.
                poll.last_bytes_downloaded = None;
                poll.last_tick_ms = None;
                poll.stalled_ticks = 0;
                poll.hold.absent_ticks_since_seen = 0;
                // `ticks` is deliberately kept: MAX_TICKS stays an absolute cap.
            }
            log_line(&format!(
                "upgrading in-flight install poll for appId {app_id} to isNativeHandoff"
            ));
        }
        if o.delegated_to_steam_client == Some(true) && !poll.delegated_to_steam_client {
            poll.delegated_to_steam_client = true;
            poll.delegated_since_tick = poll.ticks;
            if let Some(a) = poll.awaiting_update.as_mut() {
                a.delegated_since_tick = poll.ticks;
            }
            emit(self.registry.host().as_ref(), managed_by_steam(app_id));
            log_line(&format!(
                "upgrading in-flight install poll for appId {app_id} to delegatedToSteamClient"
            ));
        }
        if o.adopted_by_steam_client == Some(true) && poll.hold.steam_hold != HoldState::Released {
            let _ = release_hold(app_id, &mut poll.hold);
            self.hold.clear(app_id);
            log_line(&format!(
                "in-flight install poll for appId {app_id} adopted by the Steam client; restart hold released"
            ));
        }
        if let Some(a) = o.awaiting_update.as_ref() {
            poll.awaiting_update = Some(awaiting_from(a, poll.delegated_since_tick));
            log_line(&format!(
                "in-flight poll for appId {app_id} now watches an update"
            ));
        }
        // quick 261029-sex: an upgrade to handoff or a retarget ends eligibility; a delegated
        // native poll gains it. Start is idempotent per appId.
        if live_monitor_eligible(self.platform, poll) {
            self.spawn_monitor_start(app_id, poll.roots.clone());
        } else {
            self.monitor.stop(app_id);
        }
    }

    /// `stopInstallPolling`: clears a holding poll's persisted record, stops its monitor and the
    /// task. Idempotent; false when no poll was running.
    pub fn stop_install(&self, app_id: &str) -> bool {
        let removed = self.polls().remove(app_id);
        let Some(slot) = removed else {
            return false;
        };
        self.finish_slot(app_id, &slot.poll);
        self.registry.cancel(PollKind::Install, app_id);
        true
    }

    fn finish_slot(&self, app_id: &str, poll: &ActiveInstall) {
        // quick 261029-pkp: a stopped holding poll must not leave a record that re-arms at boot.
        if poll.hold.steam_hold == HoldState::Holding {
            self.hold.clear(app_id);
        }
        self.monitor.stop(app_id);
        log_line(&format!("stopped install polling for appId {app_id}"));
    }

    /// The loop's own stop: only acts when the slot is still this task's generation.
    fn finish(&self, app_id: &str, gen: u64) {
        let removed = {
            let mut polls = self.polls();
            if polls.get(app_id).is_some_and(|s| s.gen == gen) {
                polls.remove(app_id)
            } else {
                None
            }
        };
        if let Some(slot) = removed {
            self.finish_slot(app_id, &slot.poll);
        }
    }

    /// `cancelDelegatedInstall`: false for no poll or a non-delegated one; otherwise stops it and
    /// emits one `gameStatusUpdate` done.
    pub fn cancel_delegated(&self, app_id: &str) -> bool {
        let delegated = self
            .polls()
            .get(app_id)
            .is_some_and(|s| s.poll.delegated_to_steam_client);
        if !delegated {
            return false;
        }
        log_line(&format!(
            "Cancel stops GameLib's wait for the Steam-owned install of appId {app_id}; nothing is cancelled inside Steam"
        ));
        self.stop_install(app_id);
        emit(
            self.registry.host().as_ref(),
            status_update(app_id, "done", None),
        );
        true
    }

    /// A copy of the poll state for `app_id` (diagnostics and tests).
    pub fn snapshot_poll(&self, app_id: &str) -> Option<ActiveInstall> {
        self.polls().get(app_id).map(|s| s.poll.clone())
    }

    /// Installs, uninstall appIds and holding appIds in one snapshot (sorted).
    pub fn status(&self) -> PollStatus {
        let mut installs: Vec<InstallStatus> = self
            .polls()
            .iter()
            .map(|(app_id, s)| InstallStatus {
                app_id: app_id.clone(),
                delegated_to_steam_client: s.poll.delegated_to_steam_client,
                awaiting_update: s.poll.awaiting_update.is_some(),
                steam_hold: hold_name(s.poll.hold.steam_hold).to_string(),
            })
            .collect();
        installs.sort_by(|a, b| a.app_id.cmp(&b.app_id));
        PollStatus {
            installs,
            uninstalls: self.registry.active_app_ids(PollKind::Uninstall),
            holding: self.holding_app_ids(),
        }
    }

    /// `isHoldingForSteamRestart` for every app: holding polls plus the boot re-arm pending set
    /// (fail closed). Reporting a pending app sets the reconcile-ran flag.
    pub fn holding_app_ids(&self) -> Vec<String> {
        let mut ids: HashSet<String> = self
            .polls()
            .iter()
            .filter(|(_, s)| s.poll.hold.steam_hold == HoldState::Holding)
            .map(|(id, _)| id.clone())
            .collect();
        {
            let pending = lock(&self.shared.pending_rearm);
            if !pending.is_empty() {
                self.shared
                    .reconcile_ran_during_rearm
                    .store(true, Ordering::SeqCst);
                ids.extend(pending.iter().cloned());
            }
        }
        let mut out: Vec<String> = ids.into_iter().collect();
        out.sort();
        out
    }

    /// TS-pushed mirror of `gameSession.isNativeInstallInFlight` (R7), read by the next tick.
    pub fn set_native_in_flight(&self, app_id: &str, in_flight: bool) {
        let mut set = lock(&self.shared.native_in_flight);
        if in_flight {
            set.insert(app_id.to_string());
        } else {
            set.remove(app_id);
        }
    }

    /// TS-pushed mirror of `isBridgeInstallFinalized`, read by the next tick.
    pub fn set_bridge_finalized(&self, app_id: &str, finalized: bool) {
        let mut set = lock(&self.shared.bridge_finalized);
        if finalized {
            set.insert(app_id.to_string());
        } else {
            set.remove(app_id);
        }
    }

    /// Whether the TS-pushed mirror says a native install is in flight for `app_id`.
    pub fn native_in_flight(&self, app_id: &str) -> bool {
        lock(&self.shared.native_in_flight).contains(app_id)
    }

    pub fn platform(&self) -> Platform {
        self.platform
    }

    /// Kills every live download-monitor child (the shell's exit hook, D-07).
    pub fn stop_all_monitors(&self) {
        self.monitor.stop_all();
    }

    pub fn registry(&self) -> &Registry {
        &self.registry
    }

    pub fn outbox(&self) -> &Arc<Outbox> {
        &self.outbox
    }

    /// Boot re-arm bookkeeping (plan 16): the pending-verification set.
    pub fn set_pending_rearm(&self, app_id: &str, pending: bool) {
        let mut set = lock(&self.shared.pending_rearm);
        if pending {
            set.insert(app_id.to_string());
        } else {
            set.remove(app_id);
        }
    }

    pub fn reconcile_ran_during_rearm(&self) -> bool {
        self.shared
            .reconcile_ran_during_rearm
            .load(Ordering::SeqCst)
    }

    pub fn set_reconcile_ran_during_rearm(&self, ran: bool) {
        self.shared
            .reconcile_ran_during_rearm
            .store(ran, Ordering::SeqCst);
    }

    // -----------------------------------------------------------------------------------------
    // Loop
    // -----------------------------------------------------------------------------------------

    async fn run_loop(&self, app_id: &str, gen: u64, token: CancellationToken, period: Duration) {
        // setInterval semantics: the first tick is one period out; Delay never overlaps (D-10).
        let mut ticker = interval_at(Instant::now() + period, period);
        ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
        let mut pending_outcome: Option<SteamInstallAppOutcome> = None;
        loop {
            tokio::select! {
                _ = token.cancelled() => break,
                _ = ticker.tick() => {}
            }
            if !self.tick(app_id, gen, &token, &mut pending_outcome).await {
                break;
            }
        }
        // Shutdown cancel leaves a holding poll's record on disk (it re-arms at boot); only the
        // slot goes, and only if it is still this task's.
        let mut polls = self.polls();
        if polls.get(app_id).is_some_and(|s| s.gen == gen) {
            polls.remove(app_id);
            drop(polls);
            self.monitor.stop(app_id);
        }
    }

    async fn apply(
        &self,
        effects: Vec<Effect>,
        title: &mut String,
    ) -> Vec<crate::events::AckReply> {
        apply_effects(
            self.registry.host().as_ref(),
            self.hold.as_ref(),
            &self.outbox,
            effects,
            title,
        )
        .await
    }

    fn set_title(&self, app_id: &str, gen: u64, title: String) {
        if let Some(s) = self.polls().get_mut(app_id).filter(|s| s.gen == gen) {
            s.poll.title = title;
        }
    }

    /// One tick. Returns false when the loop must end.
    async fn tick(
        &self,
        app_id: &str,
        gen: u64,
        token: &CancellationToken,
        pending_outcome: &mut Option<SteamInstallAppOutcome>,
    ) -> bool {
        let reg = &self.registry;

        // Phase A: count the tick, apply the cap, snapshot what the observation needs.
        struct Snap {
            source: AcfSource,
            roots: PollRoots,
            awaiting: bool,
            title: String,
        }
        let (snap, pre, cap_stop) = {
            let mut polls = self.polls();
            let Some(slot) = polls.get_mut(app_id).filter(|s| s.gen == gen) else {
                return false;
            };
            let poll = &mut slot.poll;
            poll.ticks += 1;
            let mut pre: Vec<Effect> = vec![];
            let mut cap_stop: Option<bool> = None;
            if poll.ticks >= MAX_TICKS {
                if poll.hold.steam_hold == HoldState::Holding {
                    // D-UAT-13: release the hold and let this tick fall through to the step, whose
                    // installed flow reports the game installed and stops the poll.
                    pre.push(Effect::Log {
                        level: LogLevel::Warn,
                        message: format!(
                            "install polling for appId {app_id} hit safety cap ({MAX_TICKS} ticks) while waiting for a Steam restart; reporting it installed"
                        ),
                    });
                    pre.push(release_hold(app_id, &mut poll.hold));
                } else {
                    cap_stop = Some(poll.awaiting_update.is_some());
                }
            }
            (
                Snap {
                    source: poll.source,
                    roots: poll.roots.clone(),
                    awaiting: poll.awaiting_update.is_some(),
                    title: poll.title.clone(),
                },
                pre,
                cap_stop,
            )
        };
        let mut title = snap.title.clone();

        if let Some(awaiting) = cap_stop {
            let mut fx = vec![Effect::Log {
                level: LogLevel::Warn,
                message: format!(
                    "install polling for appId {app_id} hit safety cap ({MAX_TICKS} ticks); relying on D-01 focus backstop"
                ),
            }];
            // 74-27 (T-74-92): the update poll always ends with a terminal done.
            if awaiting {
                fx.push(status_update(app_id, "done", None));
            }
            self.finish(app_id, gen);
            self.apply(fx, &mut title).await;
            return false;
        }
        if !pre.is_empty() {
            self.apply(pre, &mut title).await;
        }

        // Phase B: observe (no lock held).
        let acf = read_acf_state(&snap.roots, app_id, snap.source);
        let update_fields = if snap.awaiting {
            read_acf_update_state(&snap.roots, app_id, snap.source)
        } else {
            None
        };
        let mut obs = InstallObservation {
            acf,
            update_fields,
            monitor: self.monitor.read(app_id),
            now_ms: reg.clock().now_ms(),
            platform: self.platform,
            bridge_finalized: lock(&self.shared.bridge_finalized).contains(app_id),
            hold: None,
            install_app_outcome: pending_outcome.take(),
            seq: reg.next_event_seq(),
        };

        // Phase C: step, with the hold handshake.
        let mut step = {
            let mut polls = self.polls();
            let Some(slot) = polls.get_mut(app_id).filter(|s| s.gen == gen) else {
                return false;
            };
            if slot.poll.source != snap.source {
                // Retargeted mid-tick: this observation read the old root. Next tick.
                return true;
            }
            install_step(app_id, &mut slot.poll, &obs)
        };
        if let Some(req) = step.hold_probe.take() {
            let mut hold = {
                let polls = self.polls();
                let Some(slot) = polls.get(app_id).filter(|s| s.gen == gen) else {
                    return false;
                };
                slot.poll.hold.clone()
            };
            // What the probe started from; an upgrade may change it while the lock is dropped.
            let hold_before = hold.steam_hold;
            let probe_token = token.clone();
            let (holding, effects) = should_hold(
                reg.runner().as_ref(),
                reg.clock().as_ref(),
                self.platform,
                app_id,
                &mut hold,
                req.source,
                &move || !probe_token.is_cancelled(),
            )
            .await;
            if token.is_cancelled() {
                return false;
            }
            step = {
                let mut polls = self.polls();
                let Some(slot) = polls.get_mut(app_id).filter(|s| s.gen == gen) else {
                    return false;
                };
                // 80-REVIEW A/WR-04: an upgrade during the probe (adoptedBySteamClient releases
                // the hold and clears its record) moved the hold state under us. Copying the
                // probe's result back would resurrect the hold and re-persist the record, so
                // drop it; the next tick decides from the current state. The first step only
                // asked for the probe and changed nothing, so nothing is lost.
                if slot.poll.hold.steam_hold != hold_before {
                    return true;
                }
                // Only the fields should_hold writes; an upgrade between the two locks keeps the
                // rest.
                slot.poll.hold.steam_hold = hold.steam_hold;
                slot.poll.hold.steam_pids_at_handoff = hold.steam_pids_at_handoff;
                slot.poll.hold.last_steam_probe_ms = hold.last_steam_probe_ms;
                slot.poll.hold.seen_downloading = hold.seen_downloading;
                slot.poll.hold.absent_ticks_since_seen = hold.absent_ticks_since_seen;
                obs.hold = Some(HoldOutcome { holding, effects });
                install_step(app_id, &mut slot.poll, &obs)
            };
        }

        // A poll stopped mid-tick emits nothing further.
        if token.is_cancelled() {
            return false;
        }

        let replies = self.apply(step.effects, &mut title).await;
        self.set_title(app_id, gen, title.clone());

        if let Some(follow_up) = step.mac_arch {
            if replies.iter().any(wants_mac_arch_probe) {
                self.spawn_mac_arch(follow_up, title.clone());
            }
        }
        if let Some(req) = step.update {
            let outcome = request_steam_install_app(
                reg.host().as_ref(),
                reg.runner().as_ref(),
                app_id,
                req.library_path.as_deref(),
            )
            .await;
            *pending_outcome = Some(outcome);
        }
        if step.stop {
            self.finish(app_id, gen);
            return false;
        }
        if token.is_cancelled() {
            return false;
        }

        // Phase D: the loop-level stop rules (installPolling.ts grace window).
        let (delegated, seen, absent, ticks, since, awaiting, title) = {
            let polls = self.polls();
            let Some(slot) = polls.get(app_id).filter(|s| s.gen == gen) else {
                return false;
            };
            let p = &slot.poll;
            (
                p.delegated_to_steam_client,
                p.hold.seen_downloading,
                p.hold.absent_ticks_since_seen,
                p.ticks,
                p.delegated_since_tick,
                p.awaiting_update.is_some(),
                p.title.clone(),
            )
        };
        if awaiting {
            // An update poll ends itself in the update step; MAX_TICKS above stays the ceiling.
            return true;
        }
        let mut title_cache = title.clone();
        if delegated {
            // quick 261024-exo: Steam owns the download.
            if !seen && ticks.saturating_sub(since) >= STEAM_REQUEST_NO_ACTIVITY_TICKS {
                let mut m = Map::new();
                m.insert("appId".into(), json!(app_id));
                m.insert("title".into(), json!(title));
                m.insert("kind".into(), json!("install-not-started"));
                m.insert("seq".into(), json!(reg.next_notice_seq()));
                let fx = vec![
                    Effect::Log {
                        level: LogLevel::Warn,
                        message: format!(
                            "Steam did not start the install for appId {app_id}: no activity within {STEAM_REQUEST_NO_ACTIVITY_TICKS} ticks (~2 min) of the request; reverting to not installed"
                        ),
                    },
                    status_update(app_id, "done", None),
                    Effect::Frontend {
                        channel: "steamRequestNotice".into(),
                        args: vec![Value::Object(m)],
                    },
                ];
                self.apply(fx, &mut title_cache).await;
                self.finish(app_id, gen);
                return false;
            }
            if seen && absent >= MANIFEST_GONE_TICKS {
                let fx = vec![
                    Effect::Log {
                        level: LogLevel::Warn,
                        message: format!(
                            "install polling for appId {app_id} stopped: manifest disappeared after appearing; install cancelled or removed in Steam"
                        ),
                    },
                    status_update(app_id, "done", None),
                ];
                self.apply(fx, &mut title_cache).await;
                self.finish(app_id, gen);
                return false;
            }
            return true;
        }
        // Per-tick read of the TS-pushed mirror (260822-dkf): never captured at poll start.
        let in_flight = lock(&self.shared.native_in_flight).contains(app_id);
        if !seen && ticks >= GRACE_TICKS && !in_flight {
            let fx = vec![
                Effect::Log {
                    level: LogLevel::Warn,
                    message: format!(
                        "install polling for appId {app_id} stopped after grace window ({GRACE_TICKS} ticks): no manifest detected; user may have cancelled"
                    ),
                },
                status_update(app_id, "done", None),
            ];
            self.apply(fx, &mut title_cache).await;
            self.finish(app_id, gen);
            return false;
        }
        if !seen && ticks == GRACE_TICKS && in_flight {
            self.apply(
                vec![Effect::Log {
                    level: LogLevel::Info,
                    message: format!(
                        "install polling for appId {app_id}: grace window suppressed, native depot download still in flight"
                    ),
                }],
                &mut title_cache,
            )
            .await;
        }
        true
    }

    /// The post-install ground-truth probe, off-tick and fire-and-forget (R6, T-80-44).
    fn spawn_mac_arch(&self, follow_up: crate::install_once::MacArchFollowUp, title: String) {
        let this = self.clone();
        self.registry.spawn(async move {
            let seq = this.registry.next_event_seq();
            let Some(effect) = run_mac_arch_followup(
                this.registry.runner().as_ref(),
                this.platform,
                &follow_up,
                seq,
            )
            .await
            else {
                return;
            };
            let mut title = title;
            this.apply(vec![effect], &mut title).await;
        });
    }
}
