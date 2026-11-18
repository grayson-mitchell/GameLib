//! State-event schema: what Rust tells the sidecar when a poll changes sidecar-owned state.
//!
//! Every event carries the FULL resulting state, never a delta, so replay after a restart is
//! idempotent. `seq` is monotonic per process; the outbox replays in ascending `seq`.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// A surviving install copy on another root (uninstall poll).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Survivor {
    /// `native` | `bottle` | `bridge`
    pub source: String,
    pub install_path: String,
    pub size_on_disk: String,
    pub buildid: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum StateEvent {
    /// Install poll saw the manifest fully installed.
    #[serde(rename = "installed", rename_all = "camelCase")]
    Installed {
        app_id: String,
        seq: u64,
        source: String,
        install_path: String,
        size_on_disk: String,
        buildid: Option<String>,
    },
    /// Bottle install finalized at the handoff flags: mark it incomplete and resumable (R5).
    #[serde(rename = "installIncomplete", rename_all = "camelCase")]
    InstallIncomplete { app_id: String, seq: u64 },
    /// Update poll finished. `completed` => the handler also pushes the existing entry.
    #[serde(rename = "updateDone", rename_all = "camelCase")]
    UpdateDone {
        app_id: String,
        seq: u64,
        completed: bool,
    },
    /// Uninstall poll confirmed the manifest absent. `survivor` is a copy still on another root
    /// (badge stays installed, install_path re-resolved); `None` => fully uninstalled.
    #[serde(rename = "uninstalled", rename_all = "camelCase")]
    Uninstalled {
        app_id: String,
        seq: u64,
        /// The root whose copy was removed.
        source: String,
        survivor: Option<Survivor>,
    },
    /// D-11: a bridge uninstall completed.
    #[serde(rename = "bridgeUninstalled", rename_all = "camelCase")]
    BridgeUninstalled { app_id: String, seq: u64 },
    /// D-17: clear the forced-Windows verdict on a confirmed-absent bottle or bridge tick.
    #[serde(rename = "forcedWindowsViaBottleCleared", rename_all = "camelCase")]
    ForcedWindowsViaBottleCleared { app_id: String, seq: u64 },
    /// R6: the Mac arch probe's verdict (`"32"` | `"64"`), applied by the TS handler.
    #[serde(rename = "macArchVerdict", rename_all = "camelCase")]
    MacArchVerdict {
        app_id: String,
        seq: u64,
        verdict: String,
    },
    /// D-07: Steam adopted (or has not adopted) a GameLib-written install; `signedIn` is the
    /// latest signed-in reading, None when unknown.
    #[serde(rename = "adoptionState", rename_all = "camelCase")]
    AdoptionState {
        app_id: String,
        seq: u64,
        adopted: bool,
        signed_in: Option<bool>,
    },
}

/// Outbox latest-wins key: (appId, kind). Every event carries an appId.
pub type StateEventKey = (String, &'static str);

impl StateEvent {
    pub fn kind(&self) -> &'static str {
        match self {
            StateEvent::Installed { .. } => "installed",
            StateEvent::InstallIncomplete { .. } => "installIncomplete",
            StateEvent::UpdateDone { .. } => "updateDone",
            StateEvent::Uninstalled { .. } => "uninstalled",
            StateEvent::BridgeUninstalled { .. } => "bridgeUninstalled",
            StateEvent::ForcedWindowsViaBottleCleared { .. } => "forcedWindowsViaBottleCleared",
            StateEvent::MacArchVerdict { .. } => "macArchVerdict",
            StateEvent::AdoptionState { .. } => "adoptionState",
        }
    }

    pub fn app_id(&self) -> &str {
        match self {
            StateEvent::Installed { app_id, .. }
            | StateEvent::InstallIncomplete { app_id, .. }
            | StateEvent::UpdateDone { app_id, .. }
            | StateEvent::Uninstalled { app_id, .. }
            | StateEvent::BridgeUninstalled { app_id, .. }
            | StateEvent::ForcedWindowsViaBottleCleared { app_id, .. }
            | StateEvent::MacArchVerdict { app_id, .. }
            | StateEvent::AdoptionState { app_id, .. } => app_id,
        }
    }

    pub fn seq(&self) -> u64 {
        match self {
            StateEvent::Installed { seq, .. }
            | StateEvent::InstallIncomplete { seq, .. }
            | StateEvent::UpdateDone { seq, .. }
            | StateEvent::Uninstalled { seq, .. }
            | StateEvent::BridgeUninstalled { seq, .. }
            | StateEvent::ForcedWindowsViaBottleCleared { seq, .. }
            | StateEvent::MacArchVerdict { seq, .. }
            | StateEvent::AdoptionState { seq, .. } => *seq,
        }
    }

    pub fn key(&self) -> StateEventKey {
        (self.app_id().to_string(), self.kind())
    }
}

/// The sidecar's reply to a state event. Every field is optional with a default (T-80-01): an
/// unknown or malformed reply is `AckReply::not_acked()`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AckReply {
    pub applied: bool,
    /// Current game title, refreshed on every ack (R2).
    pub title: Option<String>,
    pub mac_arch_check: Option<bool>,
    pub bridge_authoritative: Option<bool>,
}

impl AckReply {
    pub fn not_acked() -> Self {
        Self::default()
    }

    /// Lenient parse: anything that is not an object of the right shape is `not_acked`.
    pub fn from_value(v: Value) -> Self {
        serde_json::from_value(v).unwrap_or_else(|_| Self::not_acked())
    }
}
