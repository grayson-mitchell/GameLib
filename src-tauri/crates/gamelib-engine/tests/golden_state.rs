//! Engine state and notices against the TS goldens (87-14 recorded them, 87-49 ports them; D-07, D-08,
//! D-10, D-19): `golden/state` holds one case per behaviour of the per-title badge state, the trial and
//! untested-build notices and their dismissals, the notices store bytes, the launch decision the owner
//! records and publishes (`engineStateChanged`), the overlay, exit and launch-deadline notices, and
//! `getGameEngineState` for a non-Steam game.
//!
//! Every case replays over a fake HOME laid out as the oracle's profile, on a clock pinned to the
//! oracle's start (2026-11-23 12:00 UTC, moved on only by an `advance` step). What the TS scripted as
//! functions is scripted here as values: the CrossOver bin directory, the bottle's readiness and the
//! pre-flight are a [`Scripted`] probe set, the game's facts are the case's. What is compared to the
//! golden, per case: every step's result in order (the state, a boolean, the dismissal's `{ok}`, the
//! probes that step ran, the number of pushes so far), the pushes themselves (`events.json`), the notices
//! store file's bytes afterwards, and the profile tree.
//!
//! The two cases the replay treats differently are named in `golden/state/deltas.json` and replayed by
//! their own tests below, each with the rule it follows:
//! - `store-corrupt-dismiss-overwrites-as-shipped`: FND-06, a corrupt notices file is kept;
//! - `publisher-throws`: a renderer push cannot fail in Rust, so a notice always publishes.
//!
//! A count floor lives here beside the replay, so editing the JSON alone cannot lower the bar, and an
//! empty case list fails. POSIX only, as the TS oracle's replays are.
#![cfg(unix)]

mod common;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use gamelib_core::clock::Clock;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::bottles::registry::EngineSelection;
use gamelib_engine::config::{EffectiveEngine, EngineSource};
use gamelib_engine::crossover::tested_versions::NoticeStore;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::decision::launch::{LaunchDecision, LaunchUse};
use gamelib_engine::decision::preflight::CrossoverPreflight;
use gamelib_engine::engines::{DxvkBuild, NonCrossoverEngine};
use gamelib_engine::pins::pins;
use gamelib_engine::state::engine_state::{
    crossover_preflight_from_value, get_engine_state, get_game_engine_state,
    record_launch_decision, GameFacts, StateProbes,
};
use gamelib_engine::state::notices::{
    dismiss, MAX_DISMISSED, NOTICES_STORE, UNTESTED_DISMISSED_KEY,
};
use gamelib_engine::state::publish::{
    publish_launch_deadline_notice, publish_overlay_exit_notice, publish_overlay_notice,
};
use gamelib_engine::testing::{FixedClock, RecordingEmitter, RecordingLog};
use gamelib_store::host::StoreHost;
use serde_json::{json, Map, Value};

use common::{check_floor, first_difference, materialise, read_json, Profile};

/// The case count the plan committed as a floor; a later edit may raise it, never lower it.
const CASE_FLOOR: usize = 35;

/// 2026-11-23 12:00:00 UTC, the oracle's start.
const START: u64 = 1_795_435_200_000;
const BIN: &str = "<HOME>/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin";
const SEED_STAMP: &str = "Mon Nov 23 2026 11:00:00 GMT+0000 (Coordinated Universal Time)";
const STORE_RELATIVE: &str =
    "Library/Application Support/GameLib/store_cache/steam_engine_notices.json";

/// The cases this replay does not compare to the golden step by step.
const DELTA_CASES: [&str; 2] = [
    "store-corrupt-dismiss-overwrites-as-shipped",
    "publisher-throws",
];

/// The differences that touch more than one case, each asserted where the replay compares a case.
const GENERAL_DELTAS: [&str; 3] = [
    "a-corrupt-notices-file-leaves-one-copy-of-its-bytes",
    "a-notices-file-the-host-wrote-is-0600",
    "a-state-read-carries-the-offline-launch-verdict",
];

/// The key a state read adds (RF5, 87-76); the TS state had no such field.
const READ_TIME_VERDICT: &str = "offlineLaunchRefused";

/// The state reply as the golden recorded it: the read-time verdict (the third general delta) is taken
/// out of the compared reply after it was checked to be a boolean, and asserted by its own tests.
fn without_read_time_verdict(state: Value) -> Value {
    match state {
        Value::Object(mut fields) => {
            let verdict = fields.remove(READ_TIME_VERDICT);
            assert!(
                verdict.as_ref().is_some_and(Value::is_boolean),
                "a state read carries the verdict as a boolean: {verdict:?}"
            );
            Value::Object(fields)
        }
        other => other,
    }
}

fn golden_dir() -> PathBuf {
    common::fixtures().join("golden/state")
}

fn cases() -> Vec<Value> {
    read_json(&golden_dir().join("cases.json"))
        .as_array()
        .unwrap()
        .clone()
}

fn id_of(case: &Value) -> &str {
    case["id"].as_str().unwrap()
}

/// `$BIN` in a scripted value is the CrossOver bin directory under the fake HOME.
fn expand_value(profile: &Profile, value: &Value) -> Value {
    match value {
        Value::String(text) => Value::String(profile.expand(&text.replace("$BIN", BIN))),
        Value::Array(items) => {
            Value::Array(items.iter().map(|v| expand_value(profile, v)).collect())
        }
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(k, v)| (k.clone(), expand_value(profile, v)))
                .collect(),
        ),
        other => other.clone(),
    }
}

/// `JSON.stringify(value, null, '\t')`.
fn tab_json(value: &Value) -> String {
    let mut out = Vec::new();
    let formatter = serde_json::ser::PrettyFormatter::with_indent(b"\t");
    let mut serializer = serde_json::Serializer::with_formatter(&mut out, formatter);
    serde::Serialize::serialize(value, &mut serializer).unwrap();
    String::from_utf8(out).unwrap()
}

/// The notice file as a boot writes it: the values, the version envelope, the nested timestamps.
fn notice_document(values: &Map<String, Value>) -> String {
    let mut text = String::from("{\n");
    let mut parts = Vec::new();
    for (key, value) in values {
        let body = tab_json(value).replace('\n', "\n\t");
        parts.push(format!("\t{}: {body}", json!(key)));
    }
    parts.push(
        "\t\"__internal__\": {\n\t\t\"gamelib\": {\n\t\t\t\"schemaVersion\": 1\n\t\t}\n\t}"
            .to_string(),
    );
    let stamps: Vec<String> = values
        .keys()
        .map(|key| format!("\t\t{}: {}", json!(key), json!(SEED_STAMP)))
        .collect();
    parts.push(format!(
        "\t\"__timestamp\": {{\n{}\n\t}}",
        stamps.join(",\n")
    ));
    text.push_str(&parts.join(",\n"));
    text.push_str("\n}");
    text
}

/// The case's starting notices file: absent, a count of dismissed builds, raw keys, or a corrupt file.
fn store_seed(case: &Value) -> Option<String> {
    let store = case.get("store")?;
    if store.get("corrupt").is_some() {
        return Some("not json {".to_string());
    }
    if let Some(count) = store.get("builds").and_then(Value::as_u64) {
        let builds: Vec<Value> = (1..=count).map(|i| json!(format!("27.0.0.{i}"))).collect();
        let mut values = Map::new();
        values.insert(UNTESTED_DISMISSED_KEY.to_string(), Value::Array(builds));
        return Some(notice_document(&values));
    }
    let raw = store.get("raw")?.as_object()?;
    Some(notice_document(raw))
}

fn effective_for(name: Option<&Value>) -> EffectiveEngine {
    let stored = |id: String| EffectiveEngine::Override {
        id,
        source: EngineSource::Stored,
    };
    match name {
        None => EffectiveEngine::Override {
            id: "automatic".to_string(),
            source: EngineSource::Derived,
        },
        Some(Value::String(name)) => match name.as_str() {
            "automatic" => effective_for(None),
            "crossover" => stored("crossover".to_string()),
            "pinned" => stored(format!("pinned:{}", pins().unwrap().current.id)),
            "wine-manager" => stored("wine-manager:11.0-1".to_string()),
            other => panic!("unknown effective engine {other}"),
        },
        Some(object) => EffectiveEngine::Legacy {
            label: object.get("legacy").cloned(),
        },
    }
}

/// `crossover:cx-healthy`, `pinned:cx-missing`, `wine-manager:override`: a full selection.
fn selection_for(profile: &Profile, shorthand: &str) -> EngineSelection {
    let (kind, reason) = shorthand.split_once(':').unwrap();
    let pin = &pins().unwrap().current;
    let engines = profile.tools.join("steam-engines");
    let reason = reason.to_string();
    match kind {
        "crossover" => EngineSelection::Crossover {
            reason,
            crossover_build: Some("26.3.0.39832".to_string()),
            bin_dir: profile.expand(BIN),
        },
        "pinned" => {
            let bin = engines.join(&pin.id).join("Contents/Resources/wine/bin");
            EngineSelection::Pinned {
                pin_id: pin.id.clone(),
                reason,
                engine: NonCrossoverEngine {
                    wine_bin: bin.join("wine").to_string_lossy().into_owned(),
                    wineserver_bin: bin.join("wineserver").to_string_lossy().into_owned(),
                    label: pin.label.clone(),
                    version: pin.wine.version.clone(),
                    dxvk: Some(DxvkBuild {
                        dir: engines
                            .join(format!("dxvk-macOS-{}", pin.dxvk.version))
                            .to_string_lossy()
                            .into_owned(),
                        version: pin.dxvk.version.clone(),
                    }),
                },
            }
        }
        "wine-manager" => EngineSelection::WineManager {
            manager_version: "11.0-1".to_string(),
            reason,
            engine: NonCrossoverEngine {
                wine_bin: engines.join("wm/bin/wine").to_string_lossy().into_owned(),
                wineserver_bin: engines
                    .join("wm/bin/wineserver")
                    .to_string_lossy()
                    .into_owned(),
                label: "Wine-Staging 11.0-1".to_string(),
                version: "11.0-1".to_string(),
                dxvk: None,
            },
        },
        other => panic!("unknown selection {other}"),
    }
}

/// The scripted surroundings of one state step: the CrossOver bin directory, the bottle's readiness and
/// the pre-flight (a value, `throws`, or `unscripted`, a call to which fails by name).
struct Scripted {
    bin: Option<String>,
    ready: bool,
    spec: Value,
    calls: Mutex<Vec<String>>,
}

impl StateProbes for Scripted {
    fn resolve_bin_dir<'a>(
        &'a self,
        _ctx: &'a EngineCtx,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Option<String>> + Send + 'a>> {
        Box::pin(async move { self.bin.clone() })
    }

    fn is_bottle_ready(&self, _ctx: &EngineCtx, _bottle: &str) -> bool {
        self.ready
    }

    fn preflight<'a>(
        &'a self,
        _ctx: &'a EngineCtx,
        bottle: &'a str,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<CrossoverPreflight, String>> + Send + 'a>,
    > {
        Box::pin(async move {
            self.calls.lock().unwrap().push(bottle.to_string());
            // A later caller of the same flight is polled while this one waits.
            tokio::task::yield_now().await;
            match &self.spec {
                Value::String(word) if word == "throws" => Err("probe failed".to_string()),
                Value::Null => Err("unscripted preflight call".to_string()),
                Value::String(word) if word == "unscripted" => {
                    Err("unscripted preflight call".to_string())
                }
                value => crossover_preflight_from_value(value)
                    .ok_or_else(|| "unscripted preflight call".to_string()),
            }
        })
    }
}

/// Everything one replay of a case leaves behind, in the golden's vocabulary.
struct Outcome {
    steps: Vec<Value>,
    events: Vec<Value>,
    store_file: Option<String>,
    store_mode: Option<u32>,
    tree: Value,
    /// The corrupt-bytes copies the host kept beside the notices file.
    copies: Vec<String>,
    logs: usize,
}

fn build_ctx(
    profile: &Profile,
    clock: Arc<FixedClock>,
    emitter: Arc<RecordingEmitter>,
    log: Arc<RecordingLog>,
) -> EngineCtx {
    let paths = EnginePaths {
        app_folder: profile.app_folder.clone(),
        user_data: profile.user_data.clone(),
        tools_path: profile.tools.clone(),
        user_home: profile.root().to_path_buf(),
        temp: profile.root().join("tmp"),
    };
    let clock: Arc<dyn Clock> = clock;
    EngineCtx::new(
        Arc::new(StoreHost::new()),
        clock,
        Platform::Mac,
        paths,
        Shutdown::new(),
    )
    .with_emitter(emitter)
    .with_log(log)
}

/// The profile tree without the settings document a `game-state` step seeds under `.config` and without
/// the one `.corrupt.<stamp>.json` copy the host keeps of a corrupt notices file (the second delta in
/// `deltas.json`); the copies are returned beside it. The notices file's own mode is replaced by `*`: a
/// file the host rewrote is `0600` whatever mode it was seeded with (the third delta), checked apart.
fn tree_without_settings(profile: &Profile) -> (Value, Vec<String>) {
    let mut copies = Vec::new();
    let mut entries = Vec::new();
    for entry in profile.snapshot().as_array().unwrap() {
        let path = entry["path"].as_str().unwrap();
        if path == ".config" || path.starts_with(".config/") {
            continue;
        }
        if path.contains("/steam_engine_notices.corrupt.") {
            copies.push(path.to_string());
            continue;
        }
        let mut entry = entry.clone();
        if path == STORE_RELATIVE {
            entry["mode"] = json!("*");
        }
        entries.push(entry);
    }
    (Value::Array(entries), copies)
}

/// The mode the notices file has on disk.
fn store_mode(profile: &Profile) -> Option<u32> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(profile.root().join(STORE_RELATIVE))
        .ok()
        .map(|m| m.permissions().mode() & 0o777)
}

async fn replay(case: &Value) -> Outcome {
    let profile = Profile::new();
    let clock = Arc::new(FixedClock::new(START));
    let emitter = Arc::new(RecordingEmitter::new());
    let log = Arc::new(RecordingLog::new());
    let mut ctx = build_ctx(&profile, clock.clone(), emitter.clone(), log.clone());
    if let Some(text) = store_seed(case) {
        profile.seed(&json!([{ "path": format!("<USERDATA>/store_cache/{NOTICES_STORE}.json"), "text": text }]));
    }
    let mut clock_ms = START;
    let mut steps = Vec::new();
    for raw in case["steps"].as_array().unwrap() {
        let step = materialise(raw);
        let get = |key: &str| step.get(key);
        let identity = || -> Value {
            if step.get("identity").is_some() {
                return step["identity"].clone();
            }
            json!({
                "runner": get("runner").and_then(Value::as_str).unwrap_or("legendary"),
                "appName": get("game").and_then(Value::as_str).unwrap_or("game-a"),
            })
        };
        let runner = get("runner")
            .and_then(Value::as_str)
            .unwrap_or("legendary")
            .to_string();
        let game = get("game")
            .and_then(Value::as_str)
            .unwrap_or("game-a")
            .to_string();
        let op = step["op"].as_str().unwrap();
        let mut record = Map::new();
        match op {
            "state" | "game-state" => {
                let probes = Scripted {
                    bin: if get("bin").and_then(Value::as_str) == Some("absent") {
                        None
                    } else {
                        Some(profile.expand(BIN))
                    },
                    ready: get("ready").and_then(Value::as_bool) != Some(false),
                    spec: expand_value(&profile, get("preflight").unwrap_or(&Value::Null)),
                    calls: Mutex::new(Vec::new()),
                };
                ctx.platform = if get("isMac").and_then(Value::as_bool) == Some(false) {
                    Platform::Linux
                } else {
                    Platform::Mac
                };
                let result: Result<Value, String> = if op == "game-state" {
                    // The settings the TS got as a function are a settings document here, read through a
                    // fresh host (the document differs from step to step).
                    let settings =
                        expand_value(&profile, get("globalSettings").unwrap_or(&json!({})));
                    let doc = json!({ "version": "v0", "defaultSettings": settings });
                    std::fs::create_dir_all(&profile.app_folder).unwrap();
                    std::fs::write(
                        profile.app_folder.join("config.json"),
                        serde_json::to_string_pretty(&doc).unwrap(),
                    )
                    .unwrap();
                    ctx.host = Arc::new(StoreHost::new());
                    get_game_engine_state(&ctx, &identity(), &probes)
                        .await
                        .map(|s| s.map_or(Value::Null, |s| without_read_time_verdict(s.to_value())))
                } else {
                    let effective = effective_for(get("effective"));
                    let bottle = match get("bottle") {
                        None => Some("oracle-bottle".to_string()),
                        Some(Value::Null) => None,
                        Some(name) => Some(name.as_str().unwrap().to_string()),
                    };
                    let facts = GameFacts {
                        bottle,
                        state_without_bottle: get("withoutBottle").and_then(Value::as_bool)
                            == Some(true),
                        override_eligible: get("overrideEligible")
                            .and_then(Value::as_bool)
                            .unwrap_or(true),
                        overlay_eligible: get("overlayEligible").and_then(Value::as_bool)
                            == Some(true),
                        wine_tools_eligible: get("wineTools").and_then(Value::as_bool)
                            == Some(true),
                        effective,
                        prefix_kind: None,
                        per_game_bottle_name: None,
                    };
                    let count = get("concurrent").and_then(Value::as_u64).unwrap_or(1) as usize;
                    let id = identity();
                    let runs = (0..count).map(|_| get_engine_state(&ctx, &id, &facts, &probes));
                    let mut states = Vec::new();
                    let mut failed = None;
                    for done in futures_util::future::join_all(runs).await {
                        match done {
                            Ok(state) => {
                                states.push(state.map_or(Value::Null, |s| {
                                    without_read_time_verdict(s.to_value())
                                }))
                            }
                            Err(message) => failed = Some(message),
                        }
                    }
                    match failed {
                        Some(message) => Err(message),
                        None if count == 1 => Ok(states.remove(0)),
                        None => Ok(Value::Array(states)),
                    }
                };
                match result {
                    Ok(state) => {
                        record.insert("state".to_string(), state);
                        record.insert(
                            "preflightCalls".to_string(),
                            json!(*probes.calls.lock().unwrap()),
                        );
                    }
                    Err(message) => {
                        record.insert("threw".to_string(), json!(message));
                    }
                }
            }
            "dismiss" => {
                let ok = dismiss(&ctx, step.get("args").unwrap_or(&Value::Null));
                record.insert("returned".to_string(), json!({ "ok": ok }));
            }
            "launch" => {
                let override_id = get("override")
                    .and_then(Value::as_str)
                    .unwrap_or("automatic")
                    .to_string();
                let decision = if get("kind").and_then(Value::as_str) == Some("unavailable") {
                    LaunchDecision::Unavailable {
                        override_id,
                        detail: "engine not available".to_string(),
                    }
                } else {
                    let preflight = get("preflight").filter(|v| !v.is_null()).map(|v| {
                        crossover_preflight_from_value(&expand_value(&profile, v)).unwrap()
                    });
                    LaunchDecision::Use(Box::new(LaunchUse {
                        selection: selection_for(&profile, step["selection"].as_str().unwrap()),
                        preflight,
                        pin: None,
                        needs_download: false,
                        override_id,
                        log_lines: Vec::new(),
                    }))
                };
                let facts = GameFacts {
                    bottle: Some("oracle-bottle".to_string()),
                    state_without_bottle: false,
                    override_eligible: true,
                    overlay_eligible: false,
                    wine_tools_eligible: false,
                    effective: effective_for(get("effective")),
                    prefix_kind: None,
                    per_game_bottle_name: None,
                };
                let before = emitter.pushed().len();
                record_launch_decision(
                    &ctx,
                    &runner,
                    &game,
                    &decision,
                    get("bottle")
                        .and_then(Value::as_str)
                        .unwrap_or("oracle-bottle"),
                    &facts,
                );
                record.insert(
                    "published".to_string(),
                    json!(emitter.pushed().len() - before),
                );
            }
            "overlay" => {
                let returned =
                    publish_overlay_notice(&ctx, &runner, &game, step["step"].as_str().unwrap());
                record.insert("returned".to_string(), json!(returned));
            }
            "overlay-exit" => {
                let returned = publish_overlay_exit_notice(&ctx, &runner, &game);
                record.insert("returned".to_string(), json!(returned));
            }
            "deadline" => {
                let returned = publish_launch_deadline_notice(
                    &ctx,
                    &runner,
                    &game,
                    step["title"].as_str().unwrap(),
                    step["seconds"].clone(),
                );
                record.insert("returned".to_string(), json!(returned));
            }
            // A renderer push cannot fail in Rust: the step records the word and changes nothing.
            "publisher" => {
                record.insert("mode".to_string(), step["mode"].clone());
            }
            "advance" => {
                let ms = step["ms"].as_u64().unwrap();
                clock.advance(ms);
                clock_ms += ms;
                record.insert("now".to_string(), json!(clock_ms));
            }
            other => panic!("unknown op {other}"),
        }
        record.insert("eventsSoFar".to_string(), json!(emitter.pushed().len()));
        steps.push(Value::Object(record));
    }
    let store_file = std::fs::read_to_string(profile.root().join(STORE_RELATIVE)).ok();
    let (tree, copies) = tree_without_settings(&profile);
    Outcome {
        steps,
        events: emitter
            .pushed()
            .into_iter()
            .map(|(channel, args)| json!({ "channel": channel, "args": args }))
            .collect(),
        store_file,
        store_mode: store_mode(&profile),
        tree,
        copies,
        logs: log.lines().len(),
    }
}

/// The golden's step records without the echo of the step itself.
fn golden_steps(result: &Value) -> Vec<Value> {
    result["steps"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| {
            let mut s = s.as_object().unwrap().clone();
            s.remove("step");
            Value::Object(s)
        })
        .collect()
}

async fn replay_against_golden(case: &Value) {
    let id = id_of(case);
    let golden = golden_dir().join("expected").join(id);
    let want = read_json(&golden.join("result.json"));
    let got = replay(case).await;
    assert_eq!(golden_steps(&want), got.steps, "{id}: the step results");
    assert_eq!(
        read_json(&golden.join("events.json")),
        Value::Array(got.events),
        "{id}: the pushes"
    );
    assert_eq!(
        want["storeFile"],
        got.store_file.map_or(Value::Null, Value::String),
        "{id}: the notices store bytes"
    );
    assert_eq!(
        want["logs"],
        json!([]),
        "{id}: the golden logs nothing here"
    );
    assert_eq!(got.logs, 0, "{id}: no log line");
    // A notices file the host wrote is 0600; one only read keeps the mode it was seeded with; a corrupt
    // one leaves exactly one copy of its bytes beside it.
    let corrupt = case["store"]["corrupt"].is_boolean();
    assert_eq!(
        got.copies.len(),
        usize::from(corrupt),
        "{id}: corrupt copies"
    );
    let wrote = golden_steps(&want)
        .iter()
        .any(|s| s["returned"] == json!({ "ok": true }));
    if wrote {
        assert_eq!(
            got.store_mode,
            Some(0o600),
            "{id}: a written notices file is 0600"
        );
    }
    let mut want_tree = read_json(&golden.join("tree.json"));
    for entry in want_tree.as_array_mut().unwrap() {
        if entry["path"] == json!(STORE_RELATIVE) {
            entry["mode"] = json!("*");
        }
    }
    assert_eq!(
        want_tree,
        got.tree,
        "{id}: the profile tree ({})",
        first_difference(&want_tree, &got.tree)
    );
}

#[tokio::test]
async fn every_state_golden_replays() {
    let all = cases();
    let mut replayed = 0;
    for case in &all {
        if DELTA_CASES.contains(&id_of(case)) {
            continue;
        }
        replay_against_golden(case).await;
        replayed += 1;
    }
    // Every delta case exists, so none was dropped from the recording to make the replay pass.
    for id in DELTA_CASES {
        assert!(all.iter().any(|c| id_of(c) == id), "{id}");
    }
    check_floor(
        "state goldens replayed",
        replayed + DELTA_CASES.len(),
        CASE_FLOOR,
    )
    .unwrap();
    assert_eq!(replayed + DELTA_CASES.len(), all.len());
}

#[test]
fn the_manifest_agrees_with_the_case_list_and_an_empty_list_fails() {
    let all = cases();
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    assert_eq!(manifest["count"].as_u64().unwrap() as usize, all.len());
    assert!(manifest["floor"].as_u64().unwrap() as usize >= CASE_FLOOR);
    check_floor("state cases", all.len(), CASE_FLOOR).unwrap();
    assert!(check_floor("state cases", 0, CASE_FLOOR).is_err());
    // One expected folder per case, no more.
    let mut folders: Vec<String> = std::fs::read_dir(golden_dir().join("expected"))
        .unwrap()
        .flatten()
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    folders.sort();
    let mut ids: Vec<String> = all.iter().map(|c| id_of(c).to_string()).collect();
    ids.sort();
    assert_eq!(folders, ids);
}

#[test]
fn the_documented_deltas_are_exactly_those_this_replay_treats_differently() {
    let deltas = read_json(&golden_dir().join("deltas.json"));
    let mut keys: Vec<&str> = deltas
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    keys.sort_unstable();
    let mut want = DELTA_CASES.to_vec();
    want.extend(GENERAL_DELTAS);
    want.sort_unstable();
    assert_eq!(keys, want);
    for (key, why) in deltas.as_object().unwrap() {
        assert!(why.as_str().unwrap().len() > 150, "{key}");
    }
}

// ---------------------------------------------------------------------------------------------
// The deltas, each with the rule it follows
// ---------------------------------------------------------------------------------------------

/// FND-06: the TS replaced a corrupt notices file on the first dismissal; the port keeps it, byte for
/// byte, and answers `{ok: false}` for the dismissal it could not record.
#[tokio::test]
async fn a_corrupt_notices_file_is_kept_on_a_dismissal() {
    let case = cases()
        .into_iter()
        .find(|c| id_of(c) == "store-corrupt-dismiss-overwrites-as-shipped")
        .unwrap();
    let got = replay(&case).await;
    assert_eq!(got.steps[0]["returned"], json!({ "ok": false }));
    assert_eq!(got.store_file.as_deref(), Some("not json {"));
    assert!(got.events.is_empty());
    // Nothing else was created beside the kept file but the host's one copy of its bytes.
    let paths: Vec<&str> = got
        .tree
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["path"].as_str().unwrap())
        .collect();
    assert_eq!(paths.last().copied(), Some(STORE_RELATIVE));
    assert_eq!(paths.len(), 5, "{paths:?}");
    assert_eq!(got.copies.len(), 1);
    assert_eq!(got.store_mode, Some(0o644), "the kept file keeps its mode");
    // And the same for the no-CrossOver note, and once more after the refusal.
    let profile = Profile::new();
    profile.seed(&json!([{
        "path": format!("<USERDATA>/store_cache/{NOTICES_STORE}.json"),
        "text": "not json {",
    }]));
    let ctx = build_ctx(
        &profile,
        Arc::new(FixedClock::new(START)),
        Arc::new(RecordingEmitter::new()),
        Arc::new(RecordingLog::new()),
    );
    assert!(!dismiss(&ctx, &json!({ "kind": "no-crossover" })));
    assert!(!dismiss(
        &ctx,
        &json!({ "kind": "untested-crossover", "build": "27.0.0.1" })
    ));
    assert_eq!(
        std::fs::read_to_string(profile.root().join(STORE_RELATIVE)).unwrap(),
        "not json {"
    );
    // The refused open is remembered: two dismissals and a read made one copy, not three.
    let copies = std::fs::read_dir(profile.root().join(STORE_RELATIVE).parent().unwrap())
        .unwrap()
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().contains(".corrupt."))
        .count();
    assert_eq!(copies, 1);
    // A corrupt file still reads: every notice is not dismissed.
    ctx.notices.with_view(&ctx, |view| {
        assert_eq!(view.get(UNTESTED_DISMISSED_KEY), None);
    });
}

/// A renderer push is one-way and cannot fail in Rust, so a launch always records and publishes and a
/// notice returns true once a state was published for the title. The sequence the golden pins still
/// holds: one counter shared by the launch, overlay, exit and deadline notices.
#[tokio::test]
async fn a_push_that_cannot_fail_publishes_every_notice_with_the_shared_sequence() {
    let case = cases()
        .into_iter()
        .find(|c| id_of(c) == "publisher-throws")
        .unwrap();
    let got = replay(&case).await;
    let published: Vec<u64> = got
        .steps
        .iter()
        .map(|s| s["eventsSoFar"].as_u64().unwrap())
        .collect();
    // mode, launch, overlay, mode, launch, mode, overlay, exit, deadline: every push arrives.
    assert_eq!(published, [0, 1, 2, 2, 3, 3, 4, 5, 6]);
    assert_eq!(got.steps[1]["published"], json!(1));
    for index in [2, 6, 7, 8] {
        assert_eq!(got.steps[index]["returned"], json!(true), "step {index}");
    }
    // The notice fields of each push: launch, overlay, exit, deadline. A re-push carries the launch
    // notice of the state it re-pushes, as the TS did.
    let fields: Vec<[Value; 4]> = got
        .events
        .iter()
        .map(|e| {
            let state = &e["args"][0];
            [
                state["launchNotice"]["seq"].clone(),
                state["overlayNotice"]["seq"].clone(),
                state["exitNotice"]["seq"].clone(),
                state["deadlineNotice"]["seq"].clone(),
            ]
        })
        .collect();
    let (n, one, two, three, four, five, six) = (
        Value::Null,
        json!(1),
        json!(2),
        json!(3),
        json!(4),
        json!(5),
        json!(6),
    );
    assert_eq!(
        fields,
        [
            [one.clone(), n.clone(), n.clone(), n.clone()],
            [one, two, n.clone(), n.clone()],
            [three.clone(), n.clone(), n.clone(), n.clone()],
            [three.clone(), four, n.clone(), n.clone()],
            [three.clone(), n.clone(), five, n.clone()],
            [three, n.clone(), n, six],
        ]
    );
    assert_eq!(got.logs, 0);
}

// ---------------------------------------------------------------------------------------------
// What the goldens cannot reach
// ---------------------------------------------------------------------------------------------

fn fresh() -> (Profile, EngineCtx, Arc<RecordingEmitter>) {
    let profile = Profile::new();
    let emitter = Arc::new(RecordingEmitter::new());
    let ctx = build_ctx(
        &profile,
        Arc::new(FixedClock::new(START)),
        emitter.clone(),
        Arc::new(RecordingLog::new()),
    );
    (profile, ctx, emitter)
}

#[test]
fn the_notices_store_opens_on_first_use_and_a_read_creates_nothing() {
    let (profile, ctx, _) = fresh();
    assert!(!ctx.notices.is_loaded(), "building a context opens nothing");
    assert!(!dismiss(&ctx, &json!({ "kind": "other" })));
    assert!(ctx.notices.is_loaded());
    assert!(
        !profile.user_data.exists(),
        "a refused dismissal created no directory"
    );
}

#[test]
fn the_cap_and_the_two_key_write_hold_without_the_goldens() {
    let (profile, ctx, _) = fresh();
    assert_eq!(MAX_DISMISSED, 50);
    for i in 0..60 {
        assert!(dismiss(
            &ctx,
            &json!({ "kind": "untested-crossover", "build": format!("27.0.0.{i}") })
        ));
    }
    let text = std::fs::read_to_string(profile.root().join(STORE_RELATIVE)).unwrap();
    let doc: Value = serde_json::from_str(&text).unwrap();
    let list = doc[UNTESTED_DISMISSED_KEY].as_array().unwrap();
    assert_eq!(list.len(), 50);
    assert_eq!(list[0], json!("27.0.0.10"));
    assert_eq!(list[49], json!("27.0.0.59"));
    assert_eq!(
        doc["__timestamp"][UNTESTED_DISMISSED_KEY],
        json!("Mon Nov 23 2026 12:00:00 GMT+0000 (Coordinated Universal Time)")
    );
}

#[test]
fn the_replay_refuses_a_dismissal_that_is_not_an_object() {
    let (_profile, ctx, emitter) = fresh();
    for bad in [
        json!(null),
        json!("no-crossover"),
        json!(5),
        json!([]),
        json!({ "kind": "no-crossover " }),
        json!({ "kind": "untested-crossover", "build": "1.2.3" }),
        json!({ "kind": "untested-crossover", "build": 5 }),
    ] {
        assert!(!dismiss(&ctx, &bad), "{bad}");
    }
    assert!(emitter.pushed().is_empty());
}

#[tokio::test]
async fn the_ops_answer_through_dispatch() {
    let (_profile, ctx, emitter) = fresh();
    let answer = gamelib_engine::dispatch(
        "engine_notice_dismiss",
        &[json!({ "kind": "no-crossover" })],
        &ctx,
    )
    .await
    .unwrap();
    assert_eq!(answer, json!({ "ok": true }));
    // A launch recorded through the op publishes, and an overlay notice then re-pushes it.
    let facts = json!({
        "bottle": "oracle-bottle",
        "overrideEligible": true,
        "overlayEligible": false,
        "wineToolsEligible": false
    });
    let selection = json!({
        "kind": "crossover",
        "reason": "cx-healthy",
        "crossoverBuild": "26.3.0.39832",
        "binDir": "/cx/bin"
    });
    let recorded = gamelib_engine::dispatch(
        "engine_state_record_decision",
        &[json!({
            "runner": "legendary", "appName": "game-a", "bottleName": "oracle-bottle",
            "override": "automatic", "selection": selection,
            "preflight": { "kind": "healthy", "binDir": "/cx/bin", "build": "26.3.0.39832", "trialDaysRemaining": 5 },
            "facts": facts
        })],
        &ctx,
    )
    .await
    .unwrap();
    assert_eq!(recorded, json!(true));
    let pushed = emitter.pushed();
    assert_eq!(pushed.len(), 1);
    assert_eq!(pushed[0].0, "engineStateChanged");
    assert_eq!(pushed[0].1[0]["engine"], json!("crossover"));
    assert_eq!(pushed[0].1[0]["trialDaysRemaining"], json!(5));
    let overlay = gamelib_engine::dispatch(
        "engine_state_publish_overlay_notice",
        &[json!({ "runner": "legendary", "appName": "game-a", "step": "shim" })],
        &ctx,
    )
    .await
    .unwrap();
    assert_eq!(overlay, json!(true));
    let exit = gamelib_engine::dispatch(
        "engine_state_publish_overlay_exit_notice",
        &[json!({ "runner": "legendary", "appName": "other" })],
        &ctx,
    )
    .await
    .unwrap();
    assert_eq!(exit, json!(false));
    // A step outside the closed union, an unknown key and a bad override are refused, not recorded.
    assert_eq!(
        gamelib_engine::dispatch(
            "engine_state_publish_overlay_notice",
            &[json!({ "runner": "legendary", "appName": "game-a", "step": "not-a-step" })],
            &ctx
        )
        .await,
        Ok(json!(false))
    );
    assert!(gamelib_engine::dispatch(
        "engine_state_publish_overlay_notice",
        &[json!({ "runner": "legendary", "appName": "game-a", "step": "shim", "extra": 1 })],
        &ctx
    )
    .await
    .is_err());
    assert!(gamelib_engine::dispatch(
        "engine_state_record_decision",
        &[json!({
            "runner": "legendary", "appName": "game-a", "bottleName": "oracle-bottle",
            "override": "pinned:no-such-pin", "selection": selection, "facts": facts
        })],
        &ctx,
    )
    .await
    .is_err());
    assert_eq!(emitter.pushed().len(), 2);
}
