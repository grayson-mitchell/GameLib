//! Replays every expiry-digest golden recorded from the TypeScript (94-09, D-05/D-06) through the Rust
//! digest, plus the legacy backfill state case.
//!
//! A golden is `{input, runs, stateBefore, stateAfter}`. Each run is one `detectAndNotifyExpirationTransitions`
//! call over the carried store: its keys, the `suppressNotifications` option, the settings gate, the
//! `i18next.t` calls the TypeScript made, and the notifications it showed. The expected value is the
//! TypeScript's, never typed here. For each case the test
//!
//! - seeds `stateBefore` into a FakeHome and builds a context over a clock pinned to the instant the
//!   TypeScript's fake clock read, with a recording `HumbleUi` and the bundled `public/locales` catalog;
//! - replays each run and compares the notifications shown (title and body, escaped exactly as i18next
//!   escapes them), the i18n calls (key, default, params) and the number of notifications;
//! - compares the exact bytes of the store file after the case.
//!
//! Two legacy backfill goldens are replayed. `legacy-machine-name-entry-is-backfilled-to-the-composite-key`
//! is part of the alerts manifest, so the loop covers it (the test asserts it is present). The sync
//! flow's `golden/state/legacy-notified-expiration-is-backfilled-to-a-composite-key` is the extra case:
//! its `result` is a self-contained `{before, after}` of the notified-expiration file around the second
//! sync's digest call, which this test seeds, runs and compares byte for byte. The replayed case count is
//! therefore the alerts manifest's plus one.
//!
//! The floor guards the replay itself: a manifest count the directory does not match, a count under the
//! floor, or a replay that never showed a single and a plural digest, never withheld one, and never
//! deduplicated a repeat, fails the test instead of letting a truncated set pass.

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use gamelib_core::clock::Clock;
use gamelib_core::shutdown::Shutdown;
use gamelib_humble::ctx::{HumbleCtx, HumbleUi, Platform};
use gamelib_humble::expiration_alerts::{
    detect_and_notify_expiration_transitions, AlertKey, AlertOptions,
};
use gamelib_humble::http::NoHttp;
use gamelib_i18n::Catalog;
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use serde::Deserialize;
use serde_json::Value;

/// The instant the TypeScript harness pinned its fake clock to: 2026-11-24T12:00:00Z. The `__timestamp`
/// stamps in the goldens are this instant; a wrong value fails the store bytes.
const BASE_MS: u64 = 1_795_521_600_000;

const LEGACY_CASE: &str = "legacy-machine-name-entry-is-backfilled-to-the-composite-key";

#[derive(Deserialize)]
struct Manifest {
    count: usize,
    floor: usize,
}

#[derive(Deserialize)]
struct Input {
    #[serde(rename = "steamDeckGameMode")]
    steam_deck_game_mode: bool,
}

#[derive(Deserialize)]
struct Case {
    input: Input,
    runs: Vec<Run>,
    #[serde(rename = "stateBefore")]
    state_before: BTreeMap<String, Bytes>,
    #[serde(rename = "stateAfter")]
    state_after: BTreeMap<String, Bytes>,
}

#[derive(Deserialize)]
struct Run {
    keys: Vec<RecordedKey>,
    #[serde(rename = "suppressNotifications")]
    suppress_notifications: bool,
    #[serde(rename = "notifyHumbleExpirations")]
    notify_humble_expirations: bool,
    #[serde(rename = "i18nCalls")]
    i18n_calls: Vec<Value>,
    notifications: Vec<Notification>,
}

#[derive(Deserialize)]
struct RecordedKey {
    gamekey: String,
    #[serde(rename = "machineName")]
    machine_name: String,
    title: String,
    expiration: Option<String>,
}

#[derive(Deserialize, Debug, PartialEq, Eq)]
struct Notification {
    title: String,
    body: String,
}

#[derive(Deserialize)]
struct Bytes {
    utf8: String,
}

fn fixtures() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn locales() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../public/locales")
}

struct PinnedClock(u64);

impl Clock for PinnedClock {
    fn now_ms(&self) -> u64 {
        self.0
    }
}

#[derive(Default)]
struct RecordingUi(Mutex<Vec<Notification>>);

impl HumbleUi for RecordingUi {
    fn notify(&self, title: &str, body: &str) {
        self.0.lock().unwrap().push(Notification {
            title: title.to_string(),
            body: body.to_string(),
        });
    }
    fn send_to_sidecar(&self, _channel: &str, _args: Vec<Value>) {}
}

fn write_state(home: &FakeHome, files: &BTreeMap<String, Bytes>) {
    for (rel, bytes) in files {
        let mut path = home.root().to_path_buf();
        for part in rel.split('/') {
            path.push(part);
        }
        fs::create_dir_all(path.parent().expect("a state file has a parent")).unwrap();
        fs::write(&path, bytes.utf8.as_bytes()).unwrap();
    }
}

fn read_state(home: &FakeHome, rel: &str) -> Option<String> {
    let mut path = home.root().to_path_buf();
    for part in rel.split('/') {
        path.push(part);
    }
    fs::read_to_string(path).ok()
}

/// What a replay of every case saw, for the floor.
#[derive(Default)]
struct Coverage {
    cases: usize,
    runs: usize,
    single_digests: usize,
    plural_digests: usize,
    withheld_runs: usize,
    silent_repeats: usize,
}

fn replay_case(
    id: &str,
    case: &Case,
    catalog: &Arc<Catalog>,
    coverage: &mut Coverage,
) -> Vec<String> {
    replay(
        id,
        BASE_MS,
        case.input.steam_deck_game_mode,
        &case.runs,
        &case.state_before,
        &case.state_after,
        catalog,
        coverage,
    )
}

#[allow(clippy::too_many_arguments)]
fn replay(
    id: &str,
    now_ms: u64,
    steam_deck_game_mode: bool,
    runs: &[Run],
    state_before: &BTreeMap<String, Bytes>,
    state_after: &BTreeMap<String, Bytes>,
    catalog: &Arc<Catalog>,
    coverage: &mut Coverage,
) -> Vec<String> {
    let home = FakeHome::new("humble-alerts-");
    write_state(&home, state_before);
    let ui = Arc::new(RecordingUi::default());
    let ctx = HumbleCtx::new(
        Arc::new(StoreHost::new()),
        home.root().to_path_buf(),
        Arc::new(PinnedClock(now_ms)),
        Platform::Linux,
        Shutdown::new(),
        Arc::new(NoHttp),
    )
    .with_ui(ui.clone())
    .with_catalog(catalog.clone());

    let mut problems: Vec<String> = Vec::new();
    for (n, run) in runs.iter().enumerate() {
        let keys: Vec<AlertKey> = run
            .keys
            .iter()
            .map(|k| AlertKey {
                gamekey: k.gamekey.clone(),
                machine_name: k.machine_name.clone(),
                title: k.title.clone(),
                expiration: k.expiration.clone(),
            })
            .collect();
        let opts = AlertOptions {
            suppress_notifications: run.suppress_notifications,
            notify_humble_expirations: run.notify_humble_expirations,
            steam_deck_game_mode,
        };
        ui.0.lock().unwrap().clear();
        let outcome = detect_and_notify_expiration_transitions(&ctx, &keys, &opts);
        let shown: Vec<Notification> = ui.0.lock().unwrap().drain(..).collect();

        if shown != run.notifications {
            problems.push(format!(
                "{id}: run {n} showed {shown:?}, golden {:?}",
                run.notifications
            ));
        }
        let calls: Vec<Value> = outcome
            .notification
            .as_ref()
            .map(|digest| digest.calls.iter().map(|c| c.to_value()).collect())
            .unwrap_or_default();
        if calls != run.i18n_calls {
            problems.push(format!(
                "{id}: run {n} made the i18n calls {calls:?}, golden {:?}",
                run.i18n_calls
            ));
        }
        if outcome.write_failures != 0 || outcome.store_unavailable {
            problems.push(format!(
                "{id}: run {n} could not use the store: {outcome:?}"
            ));
        }

        coverage.runs += 1;
        if let Some(first) = run.notifications.first() {
            if first.title == "Humble key expiring" {
                coverage.single_digests += 1;
            } else {
                coverage.plural_digests += 1;
            }
        }
        if outcome.withheld.is_some() {
            coverage.withheld_runs += 1;
        }
        let has_expiry = run.keys.iter().any(|k| k.expiration.is_some());
        if n > 0 && has_expiry && outcome.newly_expiring == 0 && run.notifications.is_empty() {
            coverage.silent_repeats += 1;
        }
    }

    // The bytes of every store file after the case, and no file the golden does not have.
    for (rel, want) in state_after {
        match read_state(&home, rel) {
            Some(got) if got == want.utf8 => {}
            Some(got) => problems.push(format!("{id}: {rel} is {got:?}, golden {:?}", want.utf8)),
            None => problems.push(format!("{id}: {rel} was not written")),
        }
    }
    if state_after.is_empty() {
        let rel = "store_cache/humble_notified_expiration.json";
        if let Some(found) = read_state(&home, rel) {
            problems.push(format!("{id}: wrote {rel} {found:?}, the golden has none"));
        }
    }
    coverage.cases += 1;
    problems
}

/// The sync flow's legacy case: `result.before` and `result.after` are the notified-expiration file
/// around the second sync's digest call. The key is the one that sync published (`humbleKeysUpdated`), the
/// call is not a baseline (`expiryDigest[0].suppressNotifications` is false), and the clock reads one
/// second after the first sync's, as the golden's `syncedAt` and `__timestamp` stamps do.
fn replay_state_legacy_case(catalog: &Arc<Catalog>, coverage: &mut Coverage) -> Vec<String> {
    const ID: &str = "state/legacy-notified-expiration-is-backfilled-to-a-composite-key";
    let file = fixtures()
        .join("golden/state/legacy-notified-expiration-is-backfilled-to-a-composite-key.json");
    let golden: Value = serde_json::from_str(&fs::read_to_string(file).unwrap()).unwrap();
    let result = &golden["result"];
    let path = result["path"].as_str().expect("the golden names its file");
    let digest = &result["expiryDigest"][0];
    assert_eq!(digest["keyCount"], 1);
    assert_eq!(digest["suppressNotifications"], false);

    let calls = golden["calls"].as_array().expect("the golden has calls");
    let last = calls.last().expect("the golden has a last call");
    let published = last["events"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["channel"] == "humbleKeysUpdated")
        .expect("the second sync published its keys");
    let keys: Vec<RecordedKey> = serde_json::from_value(published["payload"].clone()).unwrap();
    let synced_at = last["events"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["channel"] == "humbleSyncStateChanged")
        .and_then(|e| e["payload"]["syncedAt"].as_u64())
        .expect("the second sync stamped syncedAt");
    assert_eq!(synced_at, BASE_MS + 1000);

    let run = Run {
        keys,
        suppress_notifications: false,
        notify_humble_expirations: true,
        i18n_calls: Vec::new(),
        notifications: Vec::new(),
    };
    let bytes = |v: &Value| Bytes {
        utf8: v["utf8"].as_str().expect("a file text").to_string(),
    };
    let before = BTreeMap::from([(path.to_string(), bytes(&result["before"]))]);
    let after = BTreeMap::from([(path.to_string(), bytes(&result["after"]))]);
    replay(
        ID,
        synced_at,
        false,
        &[run],
        &before,
        &after,
        catalog,
        coverage,
    )
}

#[test]
fn every_recorded_digest_run_is_reproduced() {
    let golden = fixtures().join("golden/alerts");
    let manifest: Manifest =
        serde_json::from_str(&fs::read_to_string(golden.join("MANIFEST.json")).unwrap()).unwrap();
    let mut files: Vec<PathBuf> = fs::read_dir(&golden)
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

    let catalog = Arc::new(Catalog::load(&locales(), "en"));
    let mut coverage = Coverage::default();
    let mut problems: Vec<String> = Vec::new();
    let mut seen_legacy = false;
    for file in &files {
        let id = file.file_stem().unwrap().to_string_lossy().into_owned();
        let case: Case = serde_json::from_str(&fs::read_to_string(file).unwrap())
            .unwrap_or_else(|e| panic!("{id}: {e}"));
        if id == LEGACY_CASE {
            seen_legacy = true;
            assert!(
                case.state_before
                    .values()
                    .any(|b| b.utf8.contains("\"fake_game_1_steam\"")),
                "the legacy case's stateBefore holds the bare machine-name entry"
            );
        }
        problems.extend(replay_case(&id, &case, &catalog, &mut coverage));
    }
    problems.extend(replay_state_legacy_case(&catalog, &mut coverage));
    assert!(problems.is_empty(), "{}", problems.join("\n"));

    // The case count is the alerts manifest's plus the sync flow's legacy backfill case, and the
    // alerts manifest's own legacy case is among them.
    assert!(seen_legacy, "the legacy backfill golden is missing");
    assert_eq!(coverage.cases, manifest.count + 1);
    // The replay exercised what it claims to.
    assert!(
        coverage.single_digests >= 2,
        "no single digest was replayed"
    );
    assert!(
        coverage.plural_digests >= 2,
        "no plural digest was replayed"
    );
    assert!(coverage.withheld_runs >= 3, "no gate was replayed");
    assert!(coverage.silent_repeats >= 2, "no dedupe was replayed");
}
