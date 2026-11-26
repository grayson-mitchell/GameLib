//! The Rust replay of the redaction goldens 88.2-03 recorded from the TypeScript (`golden/redaction`):
//! `getRunnerCallWithoutCredentials` over each `redact` vector, and the gog and nile `authLogSanitizer`
//! over each `sanitize-*` vector (D-02, T-88.2-41, T-88.2-42).
//!
//! A `redact` vector is run with the pinned base environment as GameLib's own (the three variables the TS
//! oracle pinned; no vector names a home variable) and compared with the recorded line byte for byte. A
//! `sanitize-*` vector is run through the sanitizer it is named for. A count floor lives here next to the
//! replay, so editing `vectors.json` alone cannot lower the bar.
//!
//! The manifest (`MANIFEST.json`, count and floor of the file as recorded) is checked against the list and
//! against the floor here, so a vector dropped from the file fails the replay by name of the count.

use std::collections::BTreeMap;
use std::fmt;
use std::path::{Path, PathBuf};

use gamelib_launch::runner::redact::get_runner_call_without_credentials;
use gamelib_launch::runner::sanitize::LogSanitizer;
use serde::de::{MapAccess, Visitor};
use serde::{Deserialize, Deserializer};
use serde_json::Value;

/// The vectors this replay compares: all of `golden/redaction` (54 redaction, 34 sanitizer). A later edit
/// may raise this, never lower it.
const REDACTION_FLOOR: usize = 88;

fn redaction_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/golden/redaction")
}

fn check_floor(what: &str, count: usize, floor: usize) -> Result<(), String> {
    if count < floor {
        return Err(format!(
            "{what}: scanned {count}, below the floor of {floor}"
        ));
    }
    Ok(())
}

/// An object read in the order the file lists it, a JSON `null` kept as `None` (the TS `undefined`).
/// A sorted map would list the environment in another order than the TS did.
#[derive(Debug, Default)]
struct OrderedEnv(Vec<(String, Option<String>)>);

impl<'de> Deserialize<'de> for OrderedEnv {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<OrderedEnv, D::Error> {
        struct Pairs;
        impl<'de> Visitor<'de> for Pairs {
            type Value = OrderedEnv;

            fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str("an object of strings and nulls")
            }

            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<OrderedEnv, A::Error> {
                let mut out = Vec::new();
                while let Some(pair) = map.next_entry::<String, Option<String>>()? {
                    out.push(pair);
                }
                Ok(OrderedEnv(out))
            }
        }
        deserializer.deserialize_map(Pairs)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Input {
    /// A `redact` vector's argv, or an object standing for a legendary command (see `converts`).
    command: Option<Value>,
    /// What the legendary command object converts to, as argv.
    #[serde(default)]
    converts: Vec<String>,
    runner_path: Option<String>,
    #[serde(default)]
    env: OrderedEnv,
    /// A `sanitize-*` vector's chunk.
    line: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Vector {
    name: String,
    kind: String,
    input: Input,
    output: String,
}

fn load_vectors() -> Vec<Vector> {
    let path = redaction_dir().join("vectors.json");
    let bytes = std::fs::read(&path).unwrap_or_else(|e| panic!("{path:?}: {e}"));
    serde_json::from_slice(&bytes).unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

/// GameLib's own environment as the TS oracle pinned it: the three fixed variables.
fn own_env() -> BTreeMap<String, String> {
    [
        ("PATH", "/usr/bin:/bin"),
        ("LANG", "C.UTF-8"),
        ("USER", "gamelib-oracle"),
    ]
    .into_iter()
    .map(|(k, v)| (k.to_string(), v.to_string()))
    .collect()
}

/// What the TS answered for `vector`, as Rust answers it. `Err` names a kind the replay does not know,
/// so a new kind in the file fails by name instead of passing unchecked.
fn answer(vector: &Vector) -> Result<String, String> {
    let input = &vector.input;
    match vector.kind.as_str() {
        "redact" => {
            let command: Vec<String> = match &input.command {
                Some(Value::Array(items)) => items
                    .iter()
                    .map(|v| v.as_str().unwrap_or_default().to_string())
                    .collect(),
                // The legendary command object: the adapter converts it to argv before the call.
                Some(_) => input.converts.clone(),
                None => return Err(format!("{}: a redact vector with no command", vector.name)),
            };
            // An undefined value prints as nothing: no own value is `undefined`, so it is always listed.
            let env: Vec<(String, String)> = input
                .env
                .0
                .iter()
                .map(|(k, v)| (k.clone(), v.clone().unwrap_or_default()))
                .collect();
            let runner_path = input
                .runner_path
                .as_deref()
                .ok_or_else(|| format!("{}: a redact vector with no runnerPath", vector.name))?;
            Ok(get_runner_call_without_credentials(
                &command,
                &env,
                &own_env(),
                runner_path,
            ))
        }
        "sanitize-gog" | "sanitize-nile" => {
            let sanitizer = if vector.kind == "sanitize-gog" {
                LogSanitizer::GogAuth
            } else {
                LogSanitizer::NileAuth
            };
            let line = input
                .line
                .as_deref()
                .ok_or_else(|| format!("{}: a sanitize vector with no line", vector.name))?;
            Ok(sanitizer.apply(line))
        }
        other => Err(format!("{}: unknown vector kind {other}", vector.name)),
    }
}

#[derive(Debug, Deserialize)]
struct Manifest {
    count: usize,
    floor: usize,
}

#[test]
fn the_manifest_matches_the_list_and_the_floor() {
    let path = redaction_dir().join("MANIFEST.json");
    let bytes = std::fs::read(&path).unwrap_or_else(|e| panic!("{path:?}: {e}"));
    let manifest: Manifest =
        serde_json::from_slice(&bytes).unwrap_or_else(|e| panic!("{path:?}: {e}"));
    let vectors = load_vectors();
    assert_eq!(manifest.count, vectors.len(), "MANIFEST count");
    assert_eq!(manifest.floor, REDACTION_FLOOR, "MANIFEST floor");
    let names: std::collections::BTreeSet<&str> = vectors.iter().map(|v| v.name.as_str()).collect();
    assert_eq!(names.len(), vectors.len(), "vector names are unique");
    // Every flag of the eight has a plain and a PowerShell vector that answers `<redacted>`.
    for flag in gamelib_launch::runner::redact::SENSITIVE_FLAGS {
        let plain = vectors.iter().any(|v| {
            matches!(&v.input.command, Some(Value::Array(a)) if a.iter().any(|p| p == flag))
                && v.input.runner_path.as_deref() != Some("powershell")
                && v.output.contains("<redacted>")
        });
        let powershell = vectors.iter().any(|v| {
            v.input.runner_path.as_deref() == Some("powershell")
                && v.input
                    .command
                    .as_ref()
                    .is_some_and(|c| c.to_string().contains(flag))
                && v.output.contains("<redacted>")
        });
        assert!(plain, "no plain vector redacts {flag}");
        assert!(powershell, "no PowerShell vector redacts {flag}");
    }
}

#[test]
fn golden_redaction_replays_every_vector() {
    let vectors = load_vectors();
    let mut compared = 0usize;
    let mut failures = Vec::new();
    for vector in vectors.iter() {
        match answer(vector) {
            Ok(got) if got == vector.output => compared += 1,
            Ok(got) => failures.push(format!(
                "{}: got {got:?}, the TS answered {:?}",
                vector.name, vector.output
            )),
            Err(why) => failures.push(why),
        }
    }
    assert!(
        failures.is_empty(),
        "{} vectors differ from the TS golden:\n{}",
        failures.len(),
        failures.join("\n")
    );
    check_floor("golden/redaction", compared, REDACTION_FLOOR).unwrap();
    println!("compared {compared} floor {REDACTION_FLOOR}");
}

#[test]
fn an_empty_or_shrunken_vector_list_fails_the_floor() {
    assert!(check_floor("x", 0, REDACTION_FLOOR).is_err());
    assert!(check_floor("x", REDACTION_FLOOR - 1, REDACTION_FLOOR).is_err());
    assert!(check_floor("x", REDACTION_FLOOR, REDACTION_FLOOR).is_ok());
}
