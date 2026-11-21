//! The version gate for the bottle-local versioned files (Phase 85, D-17).
//!
//! Two files live inside a Wine bottle rather than the store tree and carry a top-level numeric
//! `version`: `<bottle>/.gamelib-engine.json` (chain `engine/gamelib-engine-marker`) and
//! `<bottle>/gamelib-shared-redists.json` (chain `steam_bridge/shared-redists`). Both chains are
//! empty, so they sit at the baseline v1: there is nothing to migrate and the gate never rewrites a
//! byte. Its only job is the Phase 68 refuse-newer rule: a file stamped by a newer GameLib must not
//! be overwritten by this build.
//!
//! The decision is the TS engine's, state for state:
//!
//! - no file: `Absent`.
//! - bytes that are not a JSON object: `Unreadable`. The TS engine never marked these two files
//!   read-only for that, and the shared-redist consumer backs an unreadable ledger up itself, so
//!   the gate reports it and the caller decides.
//! - the version codec (`engineMarkerCodec` / `sharedRedistLedgerCodec`): a missing key is 0, a
//!   non-negative integer number is itself, anything else is 0 (the pre-engine files carried
//!   `version: 1`, a legacy unstamped file is adopted unwritten).
//! - a version above the chain's current version is `Newer`; at or below it is `Ok`.

use std::fs;
use std::io;
use std::path::Path;

use serde::Serialize;

use crate::json::{parse, Json, Num};
use crate::migrate::Chains;

/// What the gate found. Serialised lowercase: `absent`, `ok`, `unreadable`, `newer`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GateState {
    Absent,
    Ok,
    Unreadable,
    Newer,
}

/// The gate's answer: the state, the version the file carries (0 when absent, unreadable or
/// unstamped) and the version this build writes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct GateOutcome {
    pub state: GateState,
    pub version: u32,
    pub current: u32,
}

/// The codec's `read`: a non-negative integer number is the version, anything else is 0. An integer
/// beyond `u32` is clamped, which is newer than any chain either way.
fn codec_version(doc: &Json) -> u32 {
    let clamp = |u: u64| u32::try_from(u).unwrap_or(u32::MAX);
    match doc.get("version") {
        Some(Json::Num(Num::U(u))) => clamp(*u),
        Some(Json::Num(Num::I(i))) => u64::try_from(*i).map_or(0, clamp),
        Some(Json::Num(Num::F(f))) if f.is_finite() && f.fract() == 0.0 && *f >= 0.0 => {
            // `as` saturates a float above u64::MAX, which `clamp` then maps to u32::MAX.
            clamp(*f as u64)
        }
        _ => 0,
    }
}

/// Reads the versioned file at `path` against `chain` of `chains`. Never writes.
pub fn version_gate_with(path: &Path, chain: &str, chains: &Chains) -> GateOutcome {
    let current = chains.current_version_of(chain);
    let outcome = |state: GateState, version: u32| GateOutcome {
        state,
        version,
        current,
    };
    let bytes = match fs::read(path) {
        Ok(b) => b,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return outcome(GateState::Absent, 0),
        Err(_) => return outcome(GateState::Unreadable, 0),
    };
    let doc = match parse(&bytes) {
        Ok(d @ Json::Obj(_)) => d,
        _ => return outcome(GateState::Unreadable, 0),
    };
    let version = codec_version(&doc);
    if version > current {
        outcome(GateState::Newer, version)
    } else {
        outcome(GateState::Ok, version)
    }
}

/// [`version_gate_with`] over the baseline chains: the two bottle chains both sit at v1.
pub fn version_gate(path: &Path, chain: &str) -> GateOutcome {
    version_gate_with(path, chain, &Chains::baseline())
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_testutil::FakeHome;

    const MARKER: &str = "engine/gamelib-engine-marker";
    const LEDGER: &str = "steam_bridge/shared-redists";

    fn gate(body: Option<&[u8]>, chain: &str) -> GateOutcome {
        let home = FakeHome::new("gamelib-store-gate-");
        let path = home.root().join(".gamelib-engine.json");
        if let Some(b) = body {
            fs::write(&path, b).unwrap();
        }
        version_gate(&path, chain)
    }

    #[test]
    fn an_absent_file_is_absent_and_nothing_is_created() {
        let home = FakeHome::new("gamelib-store-gate-");
        let path = home.root().join("gamelib-shared-redists.json");
        let out = version_gate(&path, LEDGER);
        assert_eq!(out.state, GateState::Absent);
        assert_eq!((out.version, out.current), (0, 1));
        assert!(!path.exists());
    }

    #[test]
    fn a_file_at_or_below_the_current_version_is_ok() {
        for (body, version) in [
            (&br#"{"version":1,"kind":"x"}"#[..], 1),
            (br#"{"version":0}"#, 0),
            // The pre-engine shape carried no version at all: adopted, unwritten.
            (br#"{"kind":"crossover","id":"a"}"#, 0),
        ] {
            let out = gate(Some(body), MARKER);
            assert_eq!(
                out.state,
                GateState::Ok,
                "{}",
                String::from_utf8_lossy(body)
            );
            assert_eq!(out.version, version);
            assert_eq!(out.current, 1);
        }
    }

    #[test]
    fn a_version_above_the_current_one_is_newer() {
        for (body, version) in [
            (&br#"{"version":2}"#[..], 2),
            (br#"{"version":2.0,"x":1}"#, 2),
            (br#"{"version":4294967296}"#, u32::MAX),
            (br#"{"version":1e30}"#, u32::MAX),
        ] {
            let out = gate(Some(body), LEDGER);
            assert_eq!(
                out.state,
                GateState::Newer,
                "{}",
                String::from_utf8_lossy(body)
            );
            assert_eq!(out.version, version);
        }
    }

    #[test]
    fn a_version_the_codec_does_not_accept_reads_as_zero() {
        for body in [
            &br#"{"version":"2"}"#[..],
            br#"{"version":-1}"#,
            br#"{"version":1.5}"#,
            br#"{"version":null}"#,
            br#"{"version":true}"#,
            br#"{"version":[2]}"#,
        ] {
            let out = gate(Some(body), MARKER);
            assert_eq!(
                out.state,
                GateState::Ok,
                "{}",
                String::from_utf8_lossy(body)
            );
            assert_eq!(out.version, 0);
        }
    }

    #[test]
    fn bytes_that_are_not_a_json_object_are_unreadable() {
        for body in [
            &b""[..],
            b"{not json",
            b"[1,2]",
            b"\"text\"",
            b"null",
            b"\xEF\xBB\xBF{\"version\":1}",
        ] {
            let out = gate(Some(body), LEDGER);
            assert_eq!(out.state, GateState::Unreadable, "{body:?}");
            assert_eq!(out.version, 0);
        }
    }

    #[test]
    fn a_directory_where_the_file_should_be_is_unreadable() {
        let home = FakeHome::new("gamelib-store-gate-");
        let path = home.root().join(".gamelib-engine.json");
        fs::create_dir(&path).unwrap();
        assert_eq!(version_gate(&path, MARKER).state, GateState::Unreadable);
    }

    #[test]
    fn the_gate_never_writes() {
        let home = FakeHome::new("gamelib-store-gate-");
        let path = home.root().join(".gamelib-engine.json");
        let newer = br#"{ "version": 9, "kind": "crossover" }"#;
        fs::write(&path, newer).unwrap();
        let _ = version_gate(&path, MARKER);
        assert_eq!(fs::read(&path).unwrap(), newer);
        let names: Vec<_> = fs::read_dir(home.root()).unwrap().flatten().collect();
        assert_eq!(names.len(), 1, "no side file appears beside it");
    }

    #[test]
    fn states_serialise_lowercase() {
        let out = GateOutcome {
            state: GateState::Newer,
            version: 2,
            current: 1,
        };
        assert_eq!(
            serde_json::to_string(&out).unwrap(),
            r#"{"state":"newer","version":2,"current":1}"#
        );
    }
}
