//! D-07 at the store layer (94-19): the Rust writer cannot rewrite a user's Humble state differently from
//! the TypeScript.
//!
//! Every expected byte here is a recorded TypeScript byte (94-08 `golden/state`, 94-09 `golden/user`),
//! never typed in this file:
//!
//! - `all-eleven-files-populated-by-real-flows` seeds all eleven files. For each, the typed read is
//!   written straight back (a no-op that leaves the bytes), then rewritten a minute later (the bytes must
//!   move, which proves the write really persisted through the host) and rewritten at the original clock
//!   (the bytes must equal the TypeScript's again, key order, number text and `__timestamp` and all).
//! - `noop-sync-within-a-second` and `noop-sync-a-minute-later` replay the sync's own store writes (the
//!   sync timestamp, and the library entries a minute later) over the `before` bytes and compare every
//!   file with the `after` bytes and the golden's `changed` set.
//! - `legacy-notified-expiration-is-backfilled-to-a-composite-key` runs the digest's backfill over the
//!   legacy bytes.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

use gamelib_core::clock::Clock;
use gamelib_core::shutdown::Shutdown;
use gamelib_humble::ctx::{HumbleCtx, Platform};
use gamelib_humble::expiration_alerts::{
    detect_and_notify_expiration_transitions, AlertKey, AlertOptions,
};
use gamelib_humble::http::NoHttp;
use gamelib_humble::stores::{
    append_audit, load_app_ids, load_audit, load_config, load_library, load_local_redeemed,
    load_notified_expirations, load_stamps, load_sync_state, patch_sync_state, put_app_id,
    put_audit, put_library_entry, put_local_redeemed, put_notified_expiration, put_stamp,
    set_config_flag, set_username, AuditRecord, ConfigFlag, HumbleStore, StampStore, StoreRead,
    SyncPatch, WriteError,
};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use serde::Deserialize;
use serde_json::Value;

/// 2026-11-24T12:00:00Z, the instant the TypeScript harness pinned its clock to.
const BASE_MS: u64 = 1_795_521_600_000;

struct PinnedClock(u64);

impl Clock for PinnedClock {
    fn now_ms(&self) -> u64 {
        self.0
    }
}

fn golden(rel: &str) -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/golden")
        .join(rel);
    let text = fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
}

fn rel_of(store: HumbleStore) -> String {
    format!("{}/{}.json", store.dir(), store.name())
}

fn path_of(home: &FakeHome, rel: &str) -> PathBuf {
    let mut path = home.root().to_path_buf();
    for part in rel.split('/') {
        path.push(part);
    }
    path
}

fn seed(home: &FakeHome, rel: &str, bytes: &[u8]) {
    let path = path_of(home, rel);
    fs::create_dir_all(path.parent().expect("a state file has a parent")).unwrap();
    fs::write(path, bytes).unwrap();
}

fn read_bytes(home: &FakeHome, rel: &str) -> Option<Vec<u8>> {
    fs::read(path_of(home, rel)).ok()
}

fn read_text(home: &FakeHome, rel: &str) -> String {
    String::from_utf8(read_bytes(home, rel).unwrap_or_else(|| panic!("{rel} was not written")))
        .unwrap()
}

fn ctx_at(home: &FakeHome, now_ms: u64) -> HumbleCtx {
    HumbleCtx::new(
        Arc::new(StoreHost::new()),
        home.root().to_path_buf(),
        Arc::new(PinnedClock(now_ms)),
        Platform::Linux,
        Shutdown::new(),
        Arc::new(NoHttp),
    )
}

/// `{ "<rel>": {"utf8": "..."} }` as rel to text.
fn utf8_files(map: &Value) -> BTreeMap<String, String> {
    map.as_object()
        .expect("a map of files")
        .iter()
        .map(|(rel, v)| {
            (
                rel.clone(),
                v["utf8"].as_str().expect("a file text").to_string(),
            )
        })
        .collect()
}

fn seed_all(home: &FakeHome, files: &BTreeMap<String, String>) {
    for (rel, text) in files {
        seed(home, rel, text.as_bytes());
    }
}

fn ok<T>(read: StoreRead<T>, what: &str) -> T {
    match read {
        StoreRead::Ok(value) => value,
        other => panic!("{what} did not read: {:?}", other.ok().is_some()),
    }
}

fn whole(n: f64) -> u64 {
    assert!(
        n.fract() == 0.0 && n >= 0.0,
        "{n} is a whole millisecond count"
    );
    n as u64
}

/// The typed read of `which`, written straight back through the typed write at `now_ms`.
fn rewrite(ctx: &HumbleCtx, which: HumbleStore, now_ms: u64) {
    match which {
        HumbleStore::Config => {
            let config = ok(load_config(ctx), "config");
            set_config_flag(ctx, ConfigFlag::IsLoggedIn, config.is_logged_in).unwrap();
            if let Some(expired) = config.expired {
                set_config_flag(ctx, ConfigFlag::Expired, expired).unwrap();
            }
            if let Some(degraded) = config.encryption_degraded {
                set_config_flag(ctx, ConfigFlag::EncryptionDegraded, degraded).unwrap();
            }
            if let Some(name) = &config.username {
                set_username(ctx, name).unwrap();
            }
        }
        HumbleStore::Library => {
            for (key, entry) in ok(load_library(ctx), "library") {
                put_library_entry(ctx, &key, &entry, now_ms).unwrap();
            }
        }
        HumbleStore::Sync => {
            let state = ok(load_sync_state(ctx), "sync");
            let mut patch = SyncPatch::new()
                .synced_at(state.synced_at.map(whole))
                .sync_error(&state.sync_error);
            if let Some(until) = state.cooldown_until {
                patch = patch.cooldown_until(whole(until));
            }
            if let Some(version) = state.classifier_version {
                patch = patch.classifier_version(whole(version) as u32);
            }
            patch_sync_state(ctx, &patch, now_ms).unwrap();
        }
        HumbleStore::Revealed
        | HumbleStore::OwnershipOverride
        | HumbleStore::GiftedAt
        | HumbleStore::SettleDeclined => {
            let which = match which {
                HumbleStore::Revealed => StampStore::Revealed,
                HumbleStore::OwnershipOverride => StampStore::OwnershipOverride,
                HumbleStore::GiftedAt => StampStore::GiftedAt,
                _ => StampStore::SettleDeclined,
            };
            for (key, at) in ok(load_stamps(ctx, which), "stamps") {
                put_stamp(ctx, which, &key, whole(at), now_ms).unwrap();
            }
        }
        HumbleStore::LocalRedeemed => {
            for (key, record) in ok(load_local_redeemed(ctx), "local redeemed") {
                put_local_redeemed(ctx, &key, whole(record.redeemed_at), record.source, now_ms)
                    .unwrap();
            }
        }
        HumbleStore::NotifiedExpiration => {
            for (key, expiration) in ok(load_notified_expirations(ctx), "notified") {
                put_notified_expiration(ctx, &key, &expiration, now_ms).unwrap();
            }
        }
        HumbleStore::Audit => {
            for (key, records) in ok(load_audit(ctx), "audit") {
                put_audit(ctx, &key, &records, now_ms).unwrap();
            }
        }
        HumbleStore::SteamAppId => {
            for (key, entry) in ok(load_app_ids(ctx), "app ids") {
                put_app_id(ctx, &key, &entry, now_ms).unwrap();
            }
        }
    }
}

#[test]
fn every_humble_file_written_back_through_the_host_is_byte_identical() {
    let case = golden("state/all-eleven-files-populated-by-real-flows.json");
    let files = utf8_files(&case["stateAfter"]);
    assert_eq!(files.len(), 11, "the golden holds all eleven files");

    let mut identical = 0;
    let mut forced = 0;
    for which in HumbleStore::ALL {
        let rel = rel_of(which);
        let before = files
            .get(&rel)
            .unwrap_or_else(|| panic!("{rel} is not in the golden"));
        let home = FakeHome::new("humble-roundtrip-");
        seed(&home, &rel, before.as_bytes());
        let ctx = ctx_at(&home, BASE_MS);

        // The typed read, written straight back at the recorded clock: nothing changes.
        rewrite(&ctx, which, BASE_MS);
        assert_eq!(&read_text(&home, &rel), before, "{rel}: a no-op write-back");
        identical += 1;

        // A change that really persists, then the original again: the host's serializer reproduces the
        // TypeScript's bytes for the whole document.
        if which == HumbleStore::Config {
            let was = ok(load_config(&ctx), "config").is_logged_in;
            set_config_flag(&ctx, ConfigFlag::IsLoggedIn, !was).unwrap();
            assert_ne!(&read_text(&home, &rel), before, "{rel}: the flip persisted");
            set_config_flag(&ctx, ConfigFlag::IsLoggedIn, was).unwrap();
        } else {
            rewrite(&ctx, which, BASE_MS + 60_000);
            assert_ne!(
                &read_text(&home, &rel),
                before,
                "{rel}: a minute later moves the timestamps"
            );
            rewrite(&ctx, which, BASE_MS);
        }
        forced += 1;
        assert_eq!(
            &read_text(&home, &rel),
            before,
            "{rel}: written, changed and restored through the host"
        );
    }
    assert_eq!(identical, 11);
    assert_eq!(forced, 11);
}

#[test]
fn the_host_keeps_a_field_it_does_not_know() {
    // A record some other writer gave an extra field: the typed write patches its own field and leaves
    // the rest, in place.
    let home = FakeHome::new("humble-unknown-");
    seed(
        &home,
        "store_cache/humble_revealed.json",
        b"{\n\t\"portal_steam\": {\n\t\t\"revealedAt\": 5,\n\t\t\"note\": \"kept\"\n\t}\n}",
    );
    let ctx = ctx_at(&home, BASE_MS);
    put_stamp(&ctx, StampStore::Revealed, "portal_steam", 9, BASE_MS).unwrap();
    let text = read_text(&home, "store_cache/humble_revealed.json");
    assert!(
        text.contains("\"revealedAt\": 9,\n\t\t\"note\": \"kept\""),
        "{text}"
    );
}

#[test]
fn an_audit_line_is_appended_and_a_foreign_value_is_refused() {
    let home = FakeHome::new("humble-audit-");
    seed(
        &home,
        "store_cache/humble_audit.json",
        b"{\n\t\"a:b\": \"not an array\"\n}",
    );
    let ctx = ctx_at(&home, BASE_MS);
    let record = AuditRecord {
        event: "reveal".into(),
        at: BASE_MS,
        outcome: Some("ok".into()),
        title: "Fake Game One".into(),
        platform: "steam".into(),
    };
    match append_audit(&ctx, "a:b", &record, BASE_MS) {
        Err(WriteError::Io(e)) => assert_eq!(e.kind(), std::io::ErrorKind::InvalidData),
        other => panic!("a non-array audit entry must be refused, got {other:?}"),
    }
    assert!(read_text(&home, "store_cache/humble_audit.json").contains("not an array"));

    append_audit(&ctx, "fresh:key", &record, BASE_MS).unwrap();
    let audit = ok(load_audit(&ctx), "audit");
    let fresh = audit.iter().find(|(k, _)| k == "fresh:key").unwrap();
    assert_eq!(fresh.1.len(), 1);
    assert_eq!(fresh.1[0].str_field("event"), Some("reveal"));
}

/// The synced-at, error and classifier version of the last `humbleSyncStateChanged` a case pushed.
fn last_sync_state(case: &Value) -> Value {
    case["calls"]
        .as_array()
        .unwrap()
        .iter()
        .rev()
        .flat_map(|call| call["events"].as_array().unwrap().iter().rev())
        .find(|event| event["channel"] == "humbleSyncStateChanged")
        .map(|event| event["payload"].clone())
        .expect("the case pushed a sync state")
}

/// One `{before, after}` pair per file of a no-op sync golden.
fn before_after(case: &Value) -> (BTreeMap<String, String>, BTreeMap<String, String>) {
    let files = case["result"]["files"].as_object().expect("files");
    let pick = |side: &str| {
        files
            .iter()
            .map(|(rel, v)| {
                (
                    rel.clone(),
                    v[side]["utf8"].as_str().expect("file text").to_string(),
                )
            })
            .collect::<BTreeMap<_, _>>()
    };
    (pick("before"), pick("after"))
}

/// The sync's own writes: the sync state, and the library entries when the clock moved a minute.
fn replay_sync_writes(ctx: &HumbleCtx, state: &Value, with_library: bool) {
    let synced_at = state["syncedAt"].as_u64().expect("syncedAt");
    let mut patch = SyncPatch::new()
        .synced_at(Some(synced_at))
        .sync_error(state["syncError"].as_str().expect("syncError"));
    if let Some(version) = state["classifierVersion"].as_u64() {
        patch = patch.classifier_version(version as u32);
    }
    if with_library {
        for (key, entry) in ok(load_library(ctx), "library") {
            put_library_entry(ctx, &key, &entry, synced_at).unwrap();
        }
    }
    patch_sync_state(ctx, &patch, synced_at).unwrap();
}

fn compare_to_after(
    case_name: &str,
    home: &FakeHome,
    after: &BTreeMap<String, String>,
    changed: &BTreeSet<String>,
    before: &BTreeMap<String, String>,
) {
    let mut moved = BTreeSet::new();
    for (rel, want) in after {
        let got = read_text(home, rel);
        assert_eq!(&got, want, "{case_name}: {rel}");
        if got != before[rel] {
            moved.insert(rel.clone());
        }
    }
    assert_eq!(&moved, changed, "{case_name}: the files that changed");
}

#[test]
fn a_sync_inside_a_second_changes_only_the_sync_timestamp() {
    let case = golden("state/noop-sync-within-a-second-changes-only-humble-sync.json");
    let (before, after) = before_after(&case);
    assert_eq!(before.len(), 11);
    let changed: BTreeSet<String> = case["result"]["changed"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap().to_string())
        .collect();
    assert_eq!(changed.len(), 1, "the golden changes one file");

    let home = FakeHome::new("humble-sync-ts-");
    seed_all(&home, &before);
    let state = last_sync_state(&case);
    let ctx = ctx_at(&home, state["syncedAt"].as_u64().unwrap());
    replay_sync_writes(&ctx, &state, false);
    compare_to_after(
        "noop-sync-within-a-second",
        &home,
        &after,
        &changed,
        &before,
    );
}

#[test]
fn a_sync_a_minute_later_rewrites_the_library_and_sync_timestamps_only() {
    let case = golden("state/noop-sync-a-minute-later-rewrites-the-timestamps.json");
    let (before, after) = before_after(&case);
    assert_eq!(before.len(), 11);
    let changed: BTreeSet<String> = case["result"]["changed"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap().to_string())
        .collect();
    assert_eq!(changed.len(), 2, "the golden changes two files");

    let home = FakeHome::new("humble-sync-min-");
    seed_all(&home, &before);
    let state = last_sync_state(&case);
    let ctx = ctx_at(&home, state["syncedAt"].as_u64().unwrap());
    replay_sync_writes(&ctx, &state, true);
    compare_to_after("noop-sync-a-minute-later", &home, &after, &changed, &before);
}

#[derive(Deserialize)]
struct RecordedKey {
    gamekey: String,
    #[serde(rename = "machineName")]
    machine_name: String,
    title: String,
    expiration: Option<String>,
}

#[test]
fn the_legacy_notified_record_is_backfilled_to_the_recorded_bytes() {
    let case = golden("state/legacy-notified-expiration-is-backfilled-to-a-composite-key.json");
    let result = &case["result"];
    let rel = result["path"].as_str().expect("the golden names its file");
    let before = result["before"]["utf8"].as_str().expect("before");
    let after = result["after"]["utf8"].as_str().expect("after");
    assert_ne!(before, after);

    let last = case["calls"].as_array().unwrap().last().unwrap();
    let keys: Vec<RecordedKey> = serde_json::from_value(
        last["events"]
            .as_array()
            .unwrap()
            .iter()
            .find(|e| e["channel"] == "humbleKeysUpdated")
            .expect("the second sync published its keys")["payload"]
            .clone(),
    )
    .unwrap();
    let synced_at = last_sync_state(&case)["syncedAt"].as_u64().unwrap();

    let home = FakeHome::new("humble-legacy-");
    seed(&home, rel, before.as_bytes());
    let ctx = ctx_at(&home, synced_at);
    let keys: Vec<AlertKey> = keys
        .into_iter()
        .map(|k| AlertKey {
            gamekey: k.gamekey,
            machine_name: k.machine_name,
            title: k.title,
            expiration: k.expiration,
        })
        .collect();
    let opts = AlertOptions {
        suppress_notifications: false,
        notify_humble_expirations: true,
        steam_deck_game_mode: false,
    };
    let outcome = detect_and_notify_expiration_transitions(&ctx, &keys, &opts);
    assert_eq!(outcome.write_failures, 0);
    assert!(!outcome.store_unavailable);
    assert_eq!(read_text(&home, rel), after, "the after-backfill bytes");
}

/// The floor: the state golden directory is what its manifest says, and this file replays the ones that
/// have a byte comparison (the unrecorded ones are the digest's own, replayed by `golden_alerts`).
#[test]
fn the_state_golden_set_is_the_manifest_set() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/golden/state");
    let manifest: Value =
        serde_json::from_str(&fs::read_to_string(dir.join("MANIFEST.json")).unwrap()).unwrap();
    let count = fs::read_dir(&dir)
        .unwrap()
        .filter_map(Result::ok)
        .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
        .filter(|e| e.file_name() != "MANIFEST.json")
        .count();
    assert_eq!(count as u64, manifest["count"].as_u64().unwrap());
    assert!(count as u64 >= manifest["floor"].as_u64().unwrap());
    for name in [
        "all-eleven-files-populated-by-real-flows",
        "noop-sync-within-a-second-changes-only-humble-sync",
        "noop-sync-a-minute-later-rewrites-the-timestamps",
        "legacy-notified-expiration-is-backfilled-to-a-composite-key",
        "corrupt-state-file-is-a-rust-only-case",
    ] {
        assert!(dir.join(format!("{name}.json")).is_file(), "{name}");
    }
}
