//! Phase 81 D-12, RESEARCH Pattern 3: the one-time migration of the restart-hold store written by
//! older builds (`steam_restart_hold.json`).
//!
//! Single writer per store (R3): Rust reads and validates this file and finally deletes it; the TS
//! boot migration (81-13) writes the pending-adoption records and watches them. Rust never
//! touches the TS pending-adoption store.
//!
//! T-80-19: the file is untrusted, user-writable disk content, so every record goes through
//! [`parse_record`]. The path always comes from the caller (the facade profile in the op table),
//! never from op args (T-81-35).
//!
//! Logging rule (T-28-04): op name and counts only, never a path or a record body.

use crate::hold::{
    decide_rearm, list_steam_client_pids, read_steam_process_start_tokens, DropReason, HoldStore,
    RearmDecision,
};
use crate::host::ProcessRunner;
use crate::profile::Platform;
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;

/// A persisted hold that is still worth adopting: the older build's Steam has not exited since,
/// or that could not be checked.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DrainedHold {
    pub app_id: String,
    /// The smallest recorded Steam pid that is live, or the smallest recorded pid when unknown.
    pub steam_pid: u32,
    /// Epoch ms the older build recorded the hold at.
    pub recorded_at_ms: f64,
}

/// Reads the store once and answers every record that is still unadopted. Writes nothing.
///
/// `decide_rearm` runs with the maximum age disabled: a hold that merely aged out is still an
/// unadopted install, so it migrates. A record whose recorded Steam has exited (pid gone or
/// reused) is dropped, because that Steam adopted the install at its own restart. A missing,
/// unreadable or non-object store answers an empty list and is left in place.
pub async fn drain_hold_records(
    runner: &dyn ProcessRunner,
    platform: Platform,
    store_path: &Path,
    now_ms: u64,
) -> Vec<DrainedHold> {
    // Only numeric appIds (1 to 10 digits) migrate: the id later reaches a watch op and a path.
    let records: Vec<_> = HoldStore::new(store_path)
        .list()
        .into_iter()
        .filter(|(id, _)| (1..=10).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_digit()))
        .collect();
    if records.is_empty() {
        return vec![];
    }
    let live = list_steam_client_pids(runner, platform).await;
    let recorded_pids: Vec<u32> = {
        let mut all: Vec<u32> = records
            .iter()
            .flat_map(|(_, r)| r.pids.iter().map(|p| p.pid))
            .collect();
        all.sort_unstable();
        all.dedup();
        all
    };
    // One start-token probe for the union of recorded pids. Skipped when the live list is
    // unknown: the decision is `Unknown` regardless.
    let tokens: Option<HashMap<u32, String>> = if live.is_some() {
        read_steam_process_start_tokens(runner, platform, &recorded_pids).await
    } else {
        None
    };

    let mut drained = Vec::new();
    for (app_id, record) in &records {
        let decision = decide_rearm(record, live.as_deref(), tokens.as_ref(), now_ms, u64::MAX);
        let steam_pid = match decision {
            RearmDecision::Arm { pids } => pids.into_iter().min(),
            RearmDecision::Unknown => record.pids.iter().map(|p| p.pid).min(),
            RearmDecision::Drop {
                reason: DropReason::Expired,
            } => record.pids.iter().map(|p| p.pid).min(),
            RearmDecision::Drop {
                reason: DropReason::SteamExited | DropReason::PidReused,
            } => None,
        };
        if let Some(steam_pid) = steam_pid {
            drained.push(DrainedHold {
                app_id: app_id.clone(),
                steam_pid,
                recorded_at_ms: record.recorded_at,
            });
        }
    }
    drained
}
