//! The Rust launch funnel (88.3-04, D-01, D-26): `launchEventCallback` and `runLaunchEventCallback` of
//! `launcher.ts`, ported. [`run::run_launch`] is the one launch entry; every later funnel plan (88.3-05
//! branches, 88.3-06 transport, 88.3-07 record) extends this module.
//!
//! The funnel reaches three things that are not its own, each only through a seam:
//!
//! - the TS library managers, through [`crate::hooks::ManagerHooks`] (`launch_facts`, `launch`, and 88.2's
//!   `game_title` and `force_uninstall`), until 91 and 92 move them into Rust;
//! - the window and the display-sleep blocker, through [`shell::FunnelShell`];
//! - the steps that run in this process (engine selection, the Wine check, the launch scripts, the
//!   recent-games write), through [`steps::FunnelSteps`], whose production implementation calls the functions
//!   behind the `engine_*`, `launch_*` and `info_*` ops directly.
//!
//! [`flights`] is the single-flight table, [`log`] the per-game launch log the funnel now owns, and
//! [`playtime`] the play-time and runs-for-me records, and [`run`] the funnel itself.

pub mod flights;
pub mod log;
pub mod playtime;
pub mod run;
pub mod shell;
pub mod steps;

use gamelib_wine::wine_cmd::WineHost;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::runner::call_runner::RunnerHost;
use crate::runner::RunnerName;

/// `LaunchParams` of `common/types.ts`: what the renderer's Play sends. Strict: an unknown key is a bad argument.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LaunchParams {
    pub app_name: String,
    pub runner: RunnerName,
    /// The launch option the player chose (`LaunchOption`), as the TS passes it through to `game.launch`.
    #[serde(default)]
    pub launch_arguments: Option<Value>,
    #[serde(default)]
    pub skip_version_check: Option<bool>,
    #[serde(default)]
    pub args: Option<Vec<String>>,
}

/// What a launch answers (`StatusPromise`): `{ "status": "done" | "error" | "abort" }`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LaunchStatus {
    Done,
    Error,
    Abort,
}

impl LaunchStatus {
    /// The wire form, `{ "status": ... }`.
    pub fn to_value(self) -> Value {
        serde_json::json!({ "status": self })
    }
}

/// The process facts the shell reads and the funnel hands on (the funnel reads no environment of its own): the
/// runner environment a launch script inherits and the wine host the Wine check runs over.
#[derive(Debug, Clone, Default)]
pub struct FunnelHost {
    pub runner: RunnerHost,
    pub wine: WineHost,
}

/// The seam the recorders of a test share: one list of events in the TS recorder's vocabulary
/// (`golden/funnel`'s `events.json`), so the order across every recorder is part of what a replay compares.
#[cfg(feature = "testing")]
pub mod testing {
    use std::sync::Arc;

    /// Where a recorder writes the event it saw. The test decides what the call does (typically: wait for the
    /// store's pending change events, then push to its list), so a recorder never needs to know the others.
    pub type Tape = Arc<dyn Fn(serde_json::Value) + Send + Sync>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launch_params_reject_an_unknown_key_and_read_the_play_message() {
        let params: LaunchParams = serde_json::from_value(serde_json::json!({
            "appName": "alpha",
            "runner": "legendary",
            "args": ["-windowed"],
        }))
        .unwrap();
        assert_eq!(params.runner, RunnerName::Legendary);
        assert_eq!(params.args, Some(vec!["-windowed".to_string()]));
        assert!(params.launch_arguments.is_none());
        assert!(serde_json::from_value::<LaunchParams>(serde_json::json!({
            "appName": "alpha",
            "runner": "legendary",
            "extra": 1,
        }))
        .is_err());
    }

    #[test]
    fn a_status_is_the_status_object() {
        assert_eq!(
            LaunchStatus::Abort.to_value(),
            serde_json::json!({ "status": "abort" })
        );
    }
}
