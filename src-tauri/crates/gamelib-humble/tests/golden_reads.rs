//! Replays every recorded TypeScript read of the two Humble timestamp maps (94-08, D-05/D-06)
//! through the Rust ops. A library golden records the answer of `humbleGetGiftedAt` or
//! `humbleGetOwnershipOverrides` as a call, and the exact bytes of the store files after the case as
//! `stateAfter`. The files are seeded into a FakeHome and the Rust answer must equal the recorded
//! result; the expected value is the TypeScript's, never typed here.
//!
//! A read is replayable from the end state only when no call after it can move the files, so a case
//! whose read is followed by a mutating call fails the test instead of comparing the wrong state.
//! The floor guards the replay itself: an empty or truncated vector set must not pass.

use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_humble::ctx::{HumbleCtx, Platform};
use gamelib_humble::dispatch;
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
struct Manifest {
    count: usize,
    floor: usize,
}

#[derive(Deserialize)]
struct Call {
    name: String,
    args: Vec<Value>,
    result: Option<Value>,
}

#[derive(Deserialize)]
struct Case {
    calls: Vec<Call>,
    #[serde(rename = "stateAfter")]
    state_after: std::collections::BTreeMap<String, Bytes>,
}

#[derive(Deserialize)]
struct Bytes {
    utf8: String,
}

/// The calls that never write a Humble store, so the end state is the state they read.
const READ_ONLY_CALLS: &[&str] = &[
    "humbleGetKeys",
    "humbleGetSyncState",
    "humbleGetGiftedAt",
    "humbleGetOwnershipOverrides",
    "humbleGetClaimAnnotations",
    "humbleGetRevealedKeyValue",
];

const FLOOR_CASES: usize = 8;

fn library_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/golden/library")
}

fn op_of(call: &str) -> Option<&'static str> {
    match call {
        "humbleGetGiftedAt" => Some("humble_get_gifted_at"),
        "humbleGetOwnershipOverrides" => Some("humble_get_ownership_overrides"),
        _ => None,
    }
}

fn ctx_over(home: &FakeHome) -> HumbleCtx {
    HumbleCtx::new(
        Arc::new(StoreHost::new()),
        home.root().to_path_buf(),
        Arc::new(SystemClock),
        Platform::Linux,
        Shutdown::new(),
    )
}

/// Writes the case's end-state files under a fresh FakeHome, as the TypeScript left them.
fn seed(case: &Case) -> FakeHome {
    let home = FakeHome::new("humble-reads-");
    for (rel, bytes) in &case.state_after {
        let mut path = home.root().to_path_buf();
        for part in rel.split('/') {
            path.push(part);
        }
        fs::create_dir_all(path.parent().expect("a state file has a parent")).unwrap();
        fs::write(&path, bytes.utf8.as_bytes()).unwrap();
    }
    home
}

#[tokio::test]
async fn every_recorded_read_of_the_two_maps_is_reproduced() {
    let dir = library_dir();
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

    let (mut cases, mut gifted, mut overrides, mut non_empty) = (0, 0, 0, 0);
    let mut failures: Vec<String> = Vec::new();
    for file in &files {
        let id = file.file_stem().unwrap().to_string_lossy().into_owned();
        let case: Case = serde_json::from_str(&fs::read_to_string(file).unwrap())
            .unwrap_or_else(|e| panic!("{id}: {e}"));
        let reads: Vec<usize> = case
            .calls
            .iter()
            .enumerate()
            .filter(|(_, c)| op_of(&c.name).is_some())
            .map(|(i, _)| i)
            .collect();
        if reads.is_empty() {
            continue;
        }
        cases += 1;
        // Only the last read has the end state; every read here must be followed by nothing that
        // writes, so each one sees the same files.
        for &i in &reads {
            for later in &case.calls[i + 1..] {
                assert!(
                    READ_ONLY_CALLS.contains(&later.name.as_str()),
                    "{id}: a read is followed by {}, so the end state is not what it read",
                    later.name
                );
            }
        }
        let home = seed(&case);
        let ctx = ctx_over(&home);
        for &i in &reads {
            let call = &case.calls[i];
            let op = op_of(&call.name).unwrap();
            if op == "humble_get_gifted_at" {
                gifted += 1;
            } else {
                overrides += 1;
            }
            let want = call.result.clone().expect("a read call records its result");
            let got = dispatch(op, &call.args, &ctx).await;
            if got != Ok(want.clone()) {
                failures.push(format!("{id}: {op}: want {want}, got {got:?}"));
            } else if want.as_object().is_some_and(|o| !o.is_empty()) {
                non_empty += 1;
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
    assert!(cases >= FLOOR_CASES, "only {cases} cases replayed a read");
    assert!(gifted >= 4, "only {gifted} gifted-at reads");
    assert!(overrides >= 4, "only {overrides} override reads");
    // A replay that only ever saw empty maps would pass against an op that returns `{}`.
    assert!(non_empty >= 2, "only {non_empty} non-empty answers");
}

#[tokio::test]
async fn an_absent_file_is_the_empty_map_and_a_stray_argument_is_refused() {
    let home = FakeHome::new("humble-reads-empty-");
    let ctx = ctx_over(&home);
    for op in ["humble_get_gifted_at", "humble_get_ownership_overrides"] {
        assert_eq!(dispatch(op, &[], &ctx).await, Ok(json!({})));
        assert_eq!(
            dispatch(op, &[json!("secret-text")], &ctx).await,
            Err(format!("{op}:bad-args"))
        );
    }
}

#[tokio::test]
async fn an_entry_without_the_field_and_the_bookkeeping_keys_contribute_nothing() {
    let home = FakeHome::new("humble-reads-shape-");
    let dir = home.root().join("store_cache");
    fs::create_dir_all(&dir).unwrap();
    // `a` has the field; `b` has no field (undefined in JS, dropped by JSON); `c` is not an object;
    // the version envelope and the timestamp bookkeeping are never entries.
    fs::write(
        dir.join("humble_gifted_at.json"),
        "{\n\t\"a\": {\"giftedAt\": 5},\n\t\"b\": {\"other\": 1},\n\t\"c\": 7,\n\t\"__internal__\": {\"gamelib\": {\"schemaVersion\": 1}},\n\t\"__timestamp\": {\"a\": \"x\"}\n}",
    )
    .unwrap();
    let ctx = ctx_over(&home);
    assert_eq!(
        dispatch("humble_get_gifted_at", &[], &ctx).await,
        Ok(json!({ "a": 5 }))
    );
}
