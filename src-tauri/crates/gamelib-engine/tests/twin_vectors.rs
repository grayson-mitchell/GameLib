//! The Rust side of the shared twin vectors (Phase 87, 87-28, D-24 extended).
//!
//! `fixtures/vectors/engine_twin.json` pins four sync pure helpers that the TypeScript keeps until their
//! callers move (`engineKeyFor`, `isWritableEngineOverride`, `importEngineSettings`,
//! `getPerGameBottleNameFor`, in `src/backend/enginewine/twin.ts`). The 87-12 oracle recorded the vectors
//! from the TS; `src/backend/enginewine/__tests__/twinVectors.test.ts` replays them against the twin and
//! this file replays the same file against `key::engine_key_for_json`,
//! `config::is_writable_engine_override`, `config::import_engine_settings` and
//! `game_engine::per_game_bottle_name_for`, so neither side can drift without one replay failing.
//!
//! A long input is stored as a generator (`{"repeat": {"char", "count"}}`); it is expanded before the call,
//! exactly as the TS replay does. The floors live here next to the replay, so editing the JSON alone cannot
//! lower the bar, and an empty or shrunken file fails.

use gamelib_engine::config::{import_engine_settings, is_writable_engine_override};
use gamelib_engine::game_engine::per_game_bottle_name_for;
use gamelib_engine::key::engine_key_for_json;
use serde_json::Value;

const VECTORS: &str = include_str!("fixtures/vectors/engine_twin.json");

/// The file holds 386 vectors when recorded (87-12): 158, 34, 51 and 143. Never lower a floor to turn a
/// red run green.
const TOTAL_FLOOR: usize = 386;
const GROUP_FLOOR: usize = 34;
const GROUPS: [&str; 4] = [
    "engineKeyFor",
    "isWritableEngineOverride",
    "importEngineSettings",
    "getPerGameBottleNameFor",
];

/// A `{"repeat": {"char", "count"}}` generator becomes its string; everything else is copied as it is.
fn materialise(value: &Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(items.iter().map(materialise).collect()),
        Value::Object(map) => {
            if map.len() == 1 {
                if let Some(rep) = map.get("repeat") {
                    let ch = rep["char"].as_str().expect("repeat char");
                    let count = rep["count"].as_u64().expect("repeat count") as usize;
                    return Value::String(ch.repeat(count));
                }
            }
            Value::Object(
                map.iter()
                    .map(|(k, v)| (k.clone(), materialise(v)))
                    .collect(),
            )
        }
        other => other.clone(),
    }
}

fn load() -> serde_json::Map<String, Value> {
    match serde_json::from_str::<Value>(VECTORS).expect("engine_twin.json parses") {
        Value::Object(map) => map,
        other => panic!("engine_twin.json is not an object: {other}"),
    }
}

/// What the Rust function answers for one (expanded) input, as the JSON the TS answered. A missing
/// property is `null`, as a missing property is `undefined` in the TS call.
fn replay(group: &str, input: &Value) -> Value {
    let field = |name: &str| input.get(name).cloned().unwrap_or(Value::Null);
    match group {
        "engineKeyFor" => engine_key_for_json(&field("runner"), &field("appName"))
            .map_or(Value::Null, Value::String),
        "isWritableEngineOverride" => Value::Bool(is_writable_engine_override(&field("value"))),
        "importEngineSettings" => import_engine_settings(
            &field("runner"),
            &field("appName"),
            &field("engineOverride"),
        )
        .unwrap_or(Value::Null),
        "getPerGameBottleNameFor" => {
            per_game_bottle_name_for(input).map_or(Value::Null, Value::String)
        }
        other => panic!("unknown vector group {other}"),
    }
}

/// A list is usable only at or above its floor: an empty or shrunken list is an error.
fn check_floor(what: &str, count: usize, floor: usize) -> Result<(), String> {
    if count < floor {
        return Err(format!(
            "{what}: scanned {count}, below the floor of {floor}"
        ));
    }
    Ok(())
}

#[test]
fn the_vector_file_holds_the_four_groups_over_their_floors_and_answers_both_ways() {
    let groups = load();
    let mut names: Vec<&str> = groups.keys().map(String::as_str).collect();
    names.sort_unstable();
    let mut expected = GROUPS.to_vec();
    expected.sort_unstable();
    assert_eq!(names, expected);
    let total: usize = groups
        .values()
        .map(|v| v.as_array().map_or(0, Vec::len))
        .sum();
    check_floor("engine twin vectors", total, TOTAL_FLOOR).unwrap();
    for (name, list) in &groups {
        let list = list.as_array().expect("a group is an array");
        check_floor(name, list.len(), GROUP_FLOOR).unwrap();
        let mut ids: Vec<&str> = list.iter().map(|v| v["id"].as_str().unwrap()).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), list.len(), "{name}: duplicate ids");
        // A group that only ever answers null (or only false) would pass a function that refuses all.
        let falsy = |v: &Value| v["expected"].is_null() || v["expected"] == Value::Bool(false);
        assert!(list.iter().any(falsy), "{name}: no refusal vector");
        assert!(
            list.iter().any(|v| !falsy(v)),
            "{name}: no acceptance vector"
        );
    }
}

#[test]
fn every_recorded_vector_replays_against_the_rust_functions() {
    let groups = load();
    let mut replayed = 0;
    for group in GROUPS {
        let list = groups[group].as_array().expect("a group is an array");
        let mismatches: Vec<String> = list
            .iter()
            .filter_map(|vector| {
                let input = materialise(&vector["input"]);
                let got = replay(group, &input);
                (got != vector["expected"]).then(|| {
                    format!(
                        "{group}/{}: expected {}, got {got}",
                        vector["id"].as_str().unwrap(),
                        vector["expected"]
                    )
                })
            })
            .collect();
        assert!(mismatches.is_empty(), "{mismatches:#?}");
        replayed += list.len();
    }
    check_floor("replayed twin vectors", replayed, TOTAL_FLOOR).unwrap();
}

#[test]
fn a_shrunken_list_and_a_wrong_answer_are_caught() {
    assert!(check_floor("empty", 0, TOTAL_FLOOR).is_err());
    assert!(check_floor("shrunken", TOTAL_FLOOR - 1, TOTAL_FLOOR).is_err());
    // The replay is not vacuous: a tampered expected answer is a mismatch.
    let input = serde_json::json!({"runner": "gog", "appName": "620"});
    assert_eq!(replay("getPerGameBottleNameFor", &input), "GameLib-gog-620");
    assert_ne!(replay("getPerGameBottleNameFor", &input), "GameLib-gog-621");
}
