//! Port of the rearmPersistedSteamRestartHolds half of library/resume.ts (R5, D-09).
//!
//! At boot every persisted "Restart Steam to finish" record is re-armed when its recorded Steam
//! process is still the live one, and dropped otherwise. Runs in the shell before the sidecar:
//! state events produced meanwhile queue in the outbox until READY.
//!
//! Logging rule (T-28-04): appId and decision kind only.

use crate::acf_state::{read_acf_state, AcfSource, AcfState, PollRoots};
use crate::constants::{MAX_TICKS, TICK_INTERVAL_MS};
use crate::effects::Effect;
use crate::events::StateEvent;
use crate::hold::{
    decide_rearm, list_steam_client_pids, read_steam_process_start_tokens, HoldStore, RearmDecision,
};
use crate::install_loop::{InstallPolls, PollOptions, RestoredSteamHold, StartInstallArgs};
use crate::outbox::apply_effects;
use crate::profile::SidecarProfile;
use crate::registry::PollKind;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct RearmOutcome {
    /// Records released or deleted: the game is (or will be) reported installed.
    pub dropped: u32,
    /// Records that started a native-handoff poll.
    pub armed: u32,
}

fn log_line(message: &str) {
    eprintln!("gamelib-steampoll: {message}");
}

/// `rearmPersistedSteamRestartHolds`. Never panics out; with zero records spawns nothing.
pub async fn rearm_persisted_holds(polls: &InstallPolls, profile: &SidecarProfile) -> RearmOutcome {
    let store = HoldStore::new(&profile.restart_hold_store_path);
    let records = store.list();
    let mut out = RearmOutcome::default();
    if records.is_empty() {
        return out;
    }
    polls.set_reconcile_ran_during_rearm(false);
    // Synchronously, before any await: fail closed until verified.
    for (app_id, _) in &records {
        polls.set_pending_rearm(app_id, true);
    }
    let steam_root = profile
        .default_steam_path()
        .unwrap_or_else(|| gamelib_steamfiles::discover::discover_default().path);
    rearm_inner(polls, &store, &records, &steam_root, &mut out).await;
    // finally-equivalent
    for (app_id, _) in &records {
        polls.set_pending_rearm(app_id, false);
    }
    if out.dropped > 0 && polls.reconcile_ran_during_rearm() {
        polls.set_reconcile_ran_during_rearm(false);
        let reg = polls.registry();
        let mut title = String::new();
        apply_effects(
            reg.host().as_ref(),
            &NoHold,
            polls.outbox(),
            vec![Effect::Transition {
                event: StateEvent::RearmSettled {
                    seq: reg.next_event_seq(),
                    needs_reconcile: true,
                },
                then: crate::effects::Continuation::None,
            }],
            &mut title,
        )
        .await;
    }
    out
}

/// The rearmSettled transition touches no hold record.
struct NoHold;
impl crate::host::HoldSink for NoHold {
    fn record(&self, _: &str, _: serde_json::Value, _: u64) {}
    fn clear(&self, _: &str) {}
}

async fn rearm_inner(
    polls: &InstallPolls,
    store: &HoldStore,
    records: &[(String, crate::hold::RestartHoldRecord)],
    steam_root: &str,
    out: &mut RearmOutcome,
) {
    let reg = polls.registry();
    let runner = reg.runner();
    let platform = polls_platform(polls);
    let live = list_steam_client_pids(runner.as_ref(), platform).await;
    let mut tokens: Option<HashMap<u32, String>> = Some(HashMap::new());
    if let Some(live) = &live {
        let mut union: HashSet<u32> = HashSet::new();
        for (_, r) in records {
            for p in &r.pids {
                if live.contains(&p.pid) {
                    union.insert(p.pid);
                }
            }
        }
        if !union.is_empty() {
            let mut v: Vec<u32> = union.into_iter().collect();
            v.sort_unstable();
            tokens = read_steam_process_start_tokens(runner.as_ref(), platform, &v).await;
        }
    }
    let now = reg.clock().now_ms();
    for (app_id, record) in records {
        if polls.native_in_flight(app_id) || reg.is_active(PollKind::Install, app_id) {
            store.clear(app_id);
            out.dropped += 1;
            continue;
        }
        let decision = decide_rearm(
            record,
            live.as_deref(),
            tokens.as_ref(),
            now,
            MAX_TICKS as u64 * TICK_INTERVAL_MS,
        );
        match decision {
            RearmDecision::Unknown => {
                log_line(&format!(
                    "Steam restart hold for appId {app_id} could not be verified at boot; not re-arming (fail-open), keeping the record"
                ));
                // Counts as released: the game is reported installed (fail-open).
                out.dropped += 1;
            }
            RearmDecision::Drop { reason } => {
                store.clear(app_id);
                out.dropped += 1;
                log_line(&format!(
                    "dropped persisted Steam restart hold for appId {app_id} ({reason:?})"
                ));
            }
            RearmDecision::Arm { pids } => {
                let roots = PollRoots {
                    steam_root: steam_root.to_string(),
                    bottle_steamapps_root: None,
                    bridge_steamapps_root: None,
                };
                let state = read_acf_state(&roots, app_id, AcfSource::Native);
                match state {
                    AcfState::Unknown => {
                        log_line(&format!(
                            "kept persisted Steam restart hold for appId {app_id} (manifest state unknown)"
                        ));
                    }
                    AcfState::Installed { .. } => {
                        let start_ticks = ((now as f64 - record.recorded_at)
                            / TICK_INTERVAL_MS as f64)
                            .floor()
                            .max(0.0) as u32;
                        let started = polls.start_install(StartInstallArgs {
                            app_id: app_id.clone(),
                            title: String::new(),
                            roots,
                            options: PollOptions {
                                is_native_handoff: Some(true),
                                source: Some(AcfSource::Native),
                                mac_native_route: Some(record.mac_native_route),
                                skipped_depots: Some(record.skipped_depots.clone()),
                                restored_steam_hold: Some(RestoredSteamHold { pids, start_ticks }),
                                ..PollOptions::default()
                            },
                        });
                        match started {
                            Ok(()) => {
                                out.armed += 1;
                                log_line(&format!(
                                    "re-armed steam-waiting-for-restart for appId {app_id} after a GameLib restart"
                                ));
                            }
                            Err(_) => log_line(&format!(
                                "could not re-arm Steam restart hold for {app_id}: bad appId"
                            )),
                        }
                    }
                    AcfState::Absent | AcfState::Downloading { .. } => {
                        store.clear(app_id);
                        out.dropped += 1;
                        log_line(&format!(
                            "dropped persisted Steam restart hold for appId {app_id} (manifest not installed)"
                        ));
                    }
                }
            }
        }
    }
}

fn polls_platform(polls: &InstallPolls) -> crate::profile::Platform {
    polls.platform()
}
