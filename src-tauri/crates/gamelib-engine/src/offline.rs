//! G25: a pure predicate deciding whether an offline launch is certain to be blocked, from
//! already-computed inputs (ported from `offlineRefusal.ts`). No I/O, so it cannot slow Play.
//!
//! Arms:
//! - `crossover-missing`: with CrossOver missing and override automatic, the unhealthy branch selects
//!   the current pin and needs a download when it is absent. That cannot succeed offline, whatever
//!   the marker kind or DXVK copy say (UAT 34 run 1).
//! - `restore-needs-pin`: the 59-38 diagnosis. With CrossOver present (health unknown), a
//!   non-crossover marker whose restore needs the absent pin is blocked. Under override `crossover`
//!   this holds even when the current pin is installed (WR-02); under `automatic` with the current
//!   pin installed it does not refuse (UAT 34 run 2).
//!
//! This only ever refuses. It never selects an engine or routes to bottled Steam.

use serde::Serialize;
use serde_json::Value;

use crate::ids::{AUTOMATIC, CROSSOVER};

/// The marker kind of the bottle, as the read-only view reports it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MarkerKind {
    Crossover,
    NonCrossover,
}

impl MarkerKind {
    pub fn parse(text: &str) -> Option<MarkerKind> {
        match text {
            "crossover" => Some(MarkerKind::Crossover),
            "non-crossover" => Some(MarkerKind::NonCrossover),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            MarkerKind::Crossover => "crossover",
            MarkerKind::NonCrossover => "non-crossover",
        }
    }
}

#[derive(Debug, Clone)]
pub struct OfflineRefusalInput {
    pub offline: bool,
    pub override_id: String,
    pub crossover_missing: bool,
    pub marker_kind: Option<MarkerKind>,
    pub current_pin_installed: bool,
    pub restore_needs_absent_pin: bool,
}

impl OfflineRefusalInput {
    /// The input out of its TS shape (`override`, `crossoverMissing`, `markerKind`, ...).
    pub fn from_value(value: &Value) -> OfflineRefusalInput {
        let flag = |key: &str| value.get(key).and_then(Value::as_bool).unwrap_or(false);
        OfflineRefusalInput {
            offline: flag("offline"),
            override_id: value
                .get("override")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            crossover_missing: flag("crossoverMissing"),
            marker_kind: value
                .get("markerKind")
                .and_then(Value::as_str)
                .and_then(MarkerKind::parse),
            current_pin_installed: flag("currentPinInstalled"),
            restore_needs_absent_pin: flag("restoreNeedsAbsentPin"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum OfflineArm {
    #[serde(rename = "crossover-missing")]
    CrossoverMissing,
    #[serde(rename = "restore-needs-pin")]
    RestoreNeedsPin,
}

impl OfflineArm {
    /// The arm's word as the TS has it (`crossover-missing`, `restore-needs-pin`).
    pub fn as_str(self) -> &'static str {
        match self {
            OfflineArm::CrossoverMissing => "crossover-missing",
            OfflineArm::RestoreNeedsPin => "restore-needs-pin",
        }
    }
}

/// `{blocked: false}` or `{blocked: true, arm}` in the TS; `None` is not blocked.
pub fn offline_launch_certainly_blocked(input: &OfflineRefusalInput) -> Option<OfflineArm> {
    if !input.offline {
        return None;
    }
    if input.override_id != AUTOMATIC && input.override_id != CROSSOVER {
        return None;
    }
    let automatic = input.override_id == AUTOMATIC;
    if input.crossover_missing {
        return (automatic && !input.current_pin_installed).then_some(OfflineArm::CrossoverMissing);
    }
    if input.marker_kind == Some(MarkerKind::NonCrossover) && input.restore_needs_absent_pin {
        if automatic && input.current_pin_installed {
            return None;
        }
        return Some(OfflineArm::RestoreNeedsPin);
    }
    None
}

/// The verdict as the TS object.
pub fn verdict_value(verdict: Option<OfflineArm>) -> Value {
    match verdict {
        None => serde_json::json!({"blocked": false}),
        Some(arm) => serde_json::json!({"blocked": true, "arm": arm}),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(offline: bool, override_id: &str) -> OfflineRefusalInput {
        OfflineRefusalInput {
            offline,
            override_id: override_id.to_string(),
            crossover_missing: false,
            marker_kind: None,
            current_pin_installed: false,
            restore_needs_absent_pin: false,
        }
    }

    #[test]
    fn online_and_explicit_engines_never_block() {
        let mut i = input(false, "automatic");
        i.crossover_missing = true;
        assert_eq!(offline_launch_certainly_blocked(&i), None);
        let mut i = input(true, "pinned:wine-staging-11.20");
        i.crossover_missing = true;
        assert_eq!(offline_launch_certainly_blocked(&i), None);
    }

    #[test]
    fn the_two_arms() {
        let mut i = input(true, "automatic");
        i.crossover_missing = true;
        assert_eq!(
            offline_launch_certainly_blocked(&i),
            Some(OfflineArm::CrossoverMissing)
        );
        i.current_pin_installed = true;
        assert_eq!(offline_launch_certainly_blocked(&i), None);

        let mut i = input(true, "crossover");
        i.marker_kind = Some(MarkerKind::NonCrossover);
        i.restore_needs_absent_pin = true;
        i.current_pin_installed = true;
        assert_eq!(
            offline_launch_certainly_blocked(&i),
            Some(OfflineArm::RestoreNeedsPin)
        );
        i.override_id = "automatic".to_string();
        assert_eq!(offline_launch_certainly_blocked(&i), None);
    }
}
