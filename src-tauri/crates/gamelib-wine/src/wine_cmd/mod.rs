//! The wine command core (Phase 87, D-22): the pieces DXVK, Winetricks, bottle creation and the
//! three resolver channels need in Rust, ported from `launcher.ts` and `commandRunner.ts` and
//! replayed against the goldens `87-08` recorded from the TS.
//!
//! - [`valid`]: `validWine`, the existence rule of each wine type.
//! - [`env`]: `setupEnvVars` and `setupWineEnvVars`, pure functions over the settings, the platform
//!   and an [`EnvSnapshot`] of the process environment (this crate reads no environment of its own).
//! - [`command`]: `runWineCommand`, the prefix check, the environment merge and the spawn.
//! - [`prefix`]: `verifyWinePrefix`, creating a prefix with `wineboot --init` (or umu's
//!   `createprefix`).
//!
//! Crate-only for now: ops `wine_valid` and `wine_run_command` exist with no channel, shim or caller
//! (D-06); 87-24 serves them to the renderer and switches the TS callers. A launched game's wine is
//! not spawned here (Phase 88).

pub mod valid;

use serde::Deserialize;
use std::collections::BTreeMap;

/// The wine flavour of an installation (`WineInstallation.type`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WineKind {
    Wine,
    Proton,
    Crossover,
    Toolkit,
}

/// One wine installation as the settings store it (`WineInstallation` in `common/types.ts`).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WineInstallation {
    pub bin: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: WineKind,
    #[serde(default)]
    pub lib: Option<String>,
    #[serde(default)]
    pub lib32: Option<String>,
    #[serde(default)]
    pub wineserver: Option<String>,
}

/// The facts of the running process the shell reads and hands the crate, which reads no environment
/// variable and asks no OS question of its own. Every field is optional on the wire.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WineHost {
    /// The process environment (`process.env`): the base of a wine command's environment, the six
    /// keys the builders read and the `PATH` the umu lookup scans.
    #[serde(default)]
    pub env: EnvSnapshot,
    /// The Darwin kernel release (`os.release()` on macOS, e.g. `24.1.0`); `validWine` compares its
    /// major to 14 for a toolkit. `None` is "not recent enough", as on any other OS.
    #[serde(default)]
    pub darwin_release: Option<String>,
}

/// A snapshot of the process environment.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(transparent)]
pub struct EnvSnapshot(BTreeMap<String, String>);

impl EnvSnapshot {
    pub fn new(vars: BTreeMap<String, String>) -> EnvSnapshot {
        EnvSnapshot(vars)
    }

    pub fn from_pairs<K: Into<String>, V: Into<String>>(
        pairs: impl IntoIterator<Item = (K, V)>,
    ) -> EnvSnapshot {
        EnvSnapshot(
            pairs
                .into_iter()
                .map(|(k, v)| (k.into(), v.into()))
                .collect(),
        )
    }

    pub fn vars(&self) -> &BTreeMap<String, String> {
        &self.0
    }

    /// The value of `key`, `None` when unset.
    pub fn get(&self, key: &str) -> Option<&str> {
        self.0.get(key).map(String::as_str)
    }

    /// The value of `key` when it is set and not empty: a JS truthiness test of `process.env.KEY`.
    pub fn truthy(&self, key: &str) -> Option<&str> {
        self.get(key).filter(|v| !v.is_empty())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_wine_installation_rejects_unknown_fields_and_types() {
        let ok = serde_json::json!({"bin": "/b", "name": "n", "type": "wine", "wineserver": "/s"});
        assert!(serde_json::from_value::<WineInstallation>(ok).is_ok());
        let extra = serde_json::json!({"bin": "/b", "name": "n", "type": "wine", "x": 1});
        assert!(serde_json::from_value::<WineInstallation>(extra).is_err());
        let kind = serde_json::json!({"bin": "/b", "name": "n", "type": "lutris"});
        assert!(serde_json::from_value::<WineInstallation>(kind).is_err());
    }

    #[test]
    fn env_truthy_is_javascript_truthiness() {
        let env = EnvSnapshot::from_pairs([("A", ""), ("B", "x")]);
        assert_eq!(env.get("A"), Some(""));
        assert_eq!(env.truthy("A"), None);
        assert_eq!(env.truthy("B"), Some("x"));
        assert_eq!(env.truthy("C"), None);
    }
}
