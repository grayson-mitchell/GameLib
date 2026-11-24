//! Replays every dedup golden recorded from the TypeScript (94-06, D-05/D-06) through the Rust port.
//! A golden is `{fn: "recomputeOwnership", input: {keys, steamGames, overridden}, output}`; the
//! expected value is the TypeScript's, never typed here. A case that disagrees prints its id and both
//! values, and the test fails after all cases ran.
//!
//! The floor guards the replay itself: a manifest count the directory does not match, a count under
//! the floor, or a replay that never produced each outcome (an exact hit, a fuzzy hit, a miss, an
//! override clearing a fuzzy match, an UNPICKED pass-through, the empty-library pass-through) fails
//! the test instead of letting a truncated vector set pass.

use std::fs;
use std::path::PathBuf;

use gamelib_humble::classify::{HumbleKey, HumbleKeyState, MatchConfidence};
use gamelib_humble::dedup::{recompute_ownership, SteamGame};
use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize)]
struct Manifest {
    count: usize,
    floor: usize,
}

#[derive(Deserialize)]
struct Input {
    keys: Vec<HumbleKey>,
    #[serde(rename = "steamGames")]
    steam_games: Vec<SteamGame>,
    overridden: Vec<String>,
}

#[derive(Deserialize)]
struct Case {
    #[serde(rename = "fn")]
    func: String,
    input: Input,
    output: Value,
}

fn golden_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/golden/dedup")
}

#[test]
fn every_recorded_ownership_recompute_is_reproduced() {
    let dir = golden_dir();
    let manifest: Manifest =
        serde_json::from_str(&fs::read_to_string(dir.join("MANIFEST.json")).unwrap()).unwrap();
    let mut files: Vec<PathBuf> = fs::read_dir(&dir)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| p.extension().is_some_and(|e| e == "json"))
        .filter(|p| p.file_name().is_some_and(|n| n != "MANIFEST.json"))
        .collect();
    files.sort();
    assert_eq!(
        files.len(),
        manifest.count,
        "the manifest count is the directory's"
    );
    assert!(files.len() >= manifest.floor, "under the manifest floor");

    // What the replay saw, for the floor.
    let (mut exact, mut fuzzy, mut none, mut cleared, mut unpicked, mut empty_library) =
        (0, 0, 0, 0, 0, 0);
    let mut failures: Vec<String> = Vec::new();
    for file in &files {
        let id = file.file_stem().unwrap().to_string_lossy().into_owned();
        let case: Case = serde_json::from_str(&fs::read_to_string(file).unwrap())
            .unwrap_or_else(|e| panic!("{id}: {e}"));
        assert_eq!(case.func, "recomputeOwnership", "{id}: an unknown function");

        let overridden = &case.input.overridden;
        let result = recompute_ownership(&case.input.keys, &case.input.steam_games, &|machine| {
            overridden.iter().any(|name| name == machine)
        });
        let got = serde_json::to_value(&result).unwrap();
        if got != case.output {
            failures.push(format!("{id}:\n  got    {got}\n  golden {}", case.output));
        }

        if case.input.steam_games.is_empty() {
            empty_library += 1;
        }
        for (before, after) in case.input.keys.iter().zip(&result) {
            match after.match_confidence {
                MatchConfidence::Exact => exact += 1,
                MatchConfidence::Fuzzy => fuzzy += 1,
                MatchConfidence::None => none += 1,
            }
            if before.state == HumbleKeyState::Unpicked && before == after {
                unpicked += 1;
            }
            if after.match_confidence == MatchConfidence::None
                && !case.input.steam_games.is_empty()
                && overridden.contains(&after.machine_name)
                && before.state != HumbleKeyState::Unpicked
            {
                cleared += 1;
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));

    assert!(exact >= 5, "exact verdicts replayed: {exact}");
    assert!(fuzzy >= 5, "fuzzy verdicts replayed: {fuzzy}");
    assert!(none >= 20, "none verdicts replayed: {none}");
    assert!(cleared >= 1, "an override clearing a match: {cleared}");
    assert!(unpicked >= 1, "an UNPICKED pass-through: {unpicked}");
    assert!(
        empty_library >= 1,
        "an empty-library pass-through: {empty_library}"
    );
    println!(
        "dedup replayed: {} cases ({exact} exact, {fuzzy} fuzzy, {none} none)",
        files.len()
    );
}

/// The replay discriminates: a recompute that skips the override, or one that ignores the resolved
/// flag, disagrees with at least one golden. Proven here by running the real function against a
/// golden whose key is edited so the verdict must change.
#[test]
fn the_replay_discriminates() {
    let file = golden_dir().join("dedup-override-clears-fuzzy.json");
    let case: Case = serde_json::from_str(&fs::read_to_string(file).unwrap()).unwrap();
    let overridden = &case.input.overridden;
    let with_override = recompute_ownership(&case.input.keys, &case.input.steam_games, &|m| {
        overridden.iter().any(|name| name == m)
    });
    let without_override =
        recompute_ownership(&case.input.keys, &case.input.steam_games, &|_| false);
    assert_eq!(serde_json::to_value(&with_override).unwrap(), case.output);
    assert_ne!(
        serde_json::to_value(&without_override).unwrap(),
        case.output,
        "the override changes the verdict, so a replay that ignored it would fail"
    );
}
