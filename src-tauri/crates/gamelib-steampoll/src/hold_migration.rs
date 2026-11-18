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
//!
//! This is the only code that reads `steam_restart_hold.json`. Nothing writes the store any more
//! (Phase 81 D-11), so the record types, [`parse_record`], [`decide_rearm`] and the read half of
//! the old store live here with the drain that uses them.
//!
//! The store file is the sidecar's `CacheStore` layout:
//! `{ "<appId>": record, "__timestamp": { "<appId>": "<date text>" }, "__internal__": {..} }`, and
//! a flat `"__timestamp.<appId>"` key (the in-memory `CacheStore` shape) is skipped like the
//! other bookkeeping keys.

use crate::host::ProcessRunner;
use crate::profile::Platform;
use crate::steam_process::{list_steam_client_pids, read_steam_process_start_tokens};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;

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
// Reading the store
// ---------------------------------------------------------------------------------------------

fn is_bookkeeping_key(key: &str) -> bool {
    key == "__internal__" || key == "__timestamp" || key.starts_with("__timestamp.")
}

/// Every valid record in the store file, in file order. A missing, unreadable or non-object file
/// reads as empty, and the file is never written.
pub fn read_hold_store(path: &Path) -> Vec<(String, RestartHoldRecord)> {
    let Ok(text) = std::fs::read_to_string(path) else {
        return vec![];
    };
    let Ok(Value::Object(map)) = serde_json::from_str::<Value>(&text) else {
        return vec![];
    };
    map.iter()
        .filter(|(k, _)| !is_bookkeeping_key(k))
        .filter_map(|(k, v)| parse_record(v).map(|r| (k.clone(), r)))
        .collect()
}

// ---------------------------------------------------------------------------------------------
// Drain and discard
// ---------------------------------------------------------------------------------------------

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
    let records: Vec<_> = read_hold_store(store_path)
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

/// Deletes the store file and nothing else. A missing file is done (`true`); an I/O failure
/// answers `false`, logged by op name only. 81-13 calls this only after every drained record has
/// been written as a pending-adoption record.
pub fn discard_hold_store(store_path: &Path) -> bool {
    match std::fs::remove_file(store_path) {
        Ok(()) => true,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => true,
        Err(e) => {
            eprintln!(
                "gamelib-steampoll: hold store discard failed (op steampoll_hold_discard): {}",
                e.kind()
            );
            false
        }
    }
}
