//! The offline gate of the launch decision (G25, ported from `offlineRefusal.ts`).
//!
//! The predicate itself, [`offline_launch_certainly_blocked`], lives in [`crate::offline`] (87-38 ported
//! it with the engine switch's read of the marker); it is re-exported here so the decision module names
//! its whole surface in one place. This module adds what the decision's replay and the launch step read:
//! the verdict as the launch outcome word the TS oracle records. The gate only ever refuses; it never
//! selects an engine and never routes to bottled Steam (D-20).

pub use crate::offline::{
    offline_launch_certainly_blocked, verdict_value, MarkerKind, OfflineArm, OfflineRefusalInput,
};

/// What a launch does with the gate's verdict, as the TS oracle writes it: `proceeds`, or
/// `refused-offline:<arm>` when the launch is certain to be blocked while offline.
pub fn launch_outcome(verdict: Option<OfflineArm>) -> String {
    match verdict {
        None => "proceeds".to_string(),
        Some(arm) => format!("refused-offline:{}", arm.as_str()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_outcome_words_are_the_oracles() {
        assert_eq!(launch_outcome(None), "proceeds");
        assert_eq!(
            launch_outcome(Some(OfflineArm::CrossoverMissing)),
            "refused-offline:crossover-missing"
        );
        assert_eq!(
            launch_outcome(Some(OfflineArm::RestoreNeedsPin)),
            "refused-offline:restore-needs-pin"
        );
    }
}
