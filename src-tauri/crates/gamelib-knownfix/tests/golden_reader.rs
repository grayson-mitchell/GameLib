//! The known-fix reader against the TS goldens (88-05 recorded them, 88-08 replays them; D-15, D-22):
//! `golden/reader` holds 125 cases, each a list of steps run on a fresh fake HOME:
//!
//! - `read`: seed (and remove) layer files, then call the four readers named in `calls`
//!   (`readKnownFixes`, `readKnownFixesWithLayer`, `readKnownFixProfile`, `readGamelibFixStatus`) and
//!   compare each answer;
//! - `filter`: the tier-1 validator over a parsed value;
//! - `exeShape`, `routingOnly`, `tier1Keys`, `layerPaths`: the small pure pieces.
//!
//! `expected/<case>/result.json` is compared whole and `events.json` line by line (step, reader, level,
//! text). The one documented difference is the JSON parser's own message in the malformed-file warning
//! (`deltas.json`): the line is compared up to and including `ignoring.\n` and the message after it must
//! be non-empty. A count floor lives in this file, so editing the JSON alone cannot lower the bar, and an
//! empty case list fails (D-22: every case runs on a gamelib_testutil FakeHome).

use std::path::{Path, PathBuf};
use std::sync::Arc;

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::testing::RecordingLog;
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_knownfix::jsvalue::JsValue;
use gamelib_knownfix::reader;
use gamelib_knownfix::types::{KnownFixesInfo, Runner, TIER1_KNOWN_FIX_KEYS};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use serde_json::{json, Map, Value};

/// `golden/reader` holds 125 cases; a later edit may raise this, never lower it.
const READER_FLOOR: usize = 125;

/// The marker the TS golden records for the parser's own text after `ignoring.\n` (`deltas.json`).
const PARSER_MESSAGE: &str = "<PARSER-MESSAGE>";

fn golden_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/golden/reader")
}

fn read_text(path: &Path) -> String {
    std::fs::read_to_string(path).unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

fn read_json(path: &Path) -> Value {
    serde_json::from_str(&read_text(path)).unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

/// A case list is usable only at or above its floor: an empty or shrunken list is an error, so the
/// replay cannot pass by iterating nothing.
fn check_floor(what: &str, count: usize, floor: usize) -> Result<(), String> {
    if count < floor {
        return Err(format!(
            "{what}: scanned {count}, below the floor of {floor}"
        ));
    }
    Ok(())
}

/// The oracle's profile layout (`buildProfile` in the TS harness) rooted in a fake HOME: the app folder
/// is `<HOME>/.config/GameLib` and the bundled layer `<HOME>/public/fixes`.
struct Rig {
    home: FakeHome,
    log: Arc<RecordingLog>,
    ctx: KnownFixCtx,
}

impl Rig {
    fn new() -> Rig {
        let home = FakeHome::new("knownfix-golden-");
        let root = home.root().to_path_buf();
        let app_folder = root.join(".config").join("GameLib");
        let log = Arc::new(RecordingLog::new());
        let engine = EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Mac,
            EnginePaths {
                tools_path: app_folder.join("tools"),
                user_data: root
                    .join("Library")
                    .join("Application Support")
                    .join("GameLib"),
                app_folder,
                user_home: root.clone(),
                temp: root.join("tmp"),
            },
            Shutdown::new(),
        )
        .with_log(log.clone());
        let ctx = KnownFixCtx::new(
            Arc::new(engine),
            Some(root.join("public").join("fixes")),
            "https://relay.test",
            "0.0.0",
        );
        Rig { home, log, ctx }
    }

    fn root(&self) -> &Path {
        self.home.root()
    }

    /// The placeholder table, most specific root first; a root with a different real path (macOS `/var`
    /// is `/private/var`) is listed under both names.
    fn placeholders(&self) -> Vec<(&'static str, String)> {
        let as_text = |p: &Path| p.to_string_lossy().into_owned();
        let app = self.root().join(".config").join("GameLib");
        let mut table = vec![
            ("<APPFOLDER>", as_text(&app)),
            ("<HOME>", as_text(self.root())),
        ];
        if !cfg!(windows) {
            if let Ok(real) = std::fs::canonicalize(self.root()) {
                if real != self.root() {
                    table.insert(
                        0,
                        (
                            "<APPFOLDER>",
                            as_text(&real.join(".config").join("GameLib")),
                        ),
                    );
                    table.push(("<HOME>", as_text(&real)));
                }
            }
        }
        table
    }

    /// A placeholder path (`<APPFOLDER>/fixes/local/x.json`) as a real one.
    fn expand(&self, text: &str) -> String {
        let mut out = text.to_string();
        for (token, root) in [
            ("<APPFOLDER>", self.root().join(".config").join("GameLib")),
            ("<HOME>", self.root().to_path_buf()),
        ] {
            out = out.replace(token, &root.to_string_lossy());
        }
        out
    }

    /// Every profile root in `text` replaced by its placeholder, Windows separators folded to `/` so one
    /// golden serves every OS.
    fn normalise_text(&self, text: &str) -> String {
        let mut s = text.to_string();
        for (token, root) in self.placeholders() {
            s = s.replace(root.as_str(), token);
        }
        if cfg!(windows) && (s.contains("<APPFOLDER>") || s.contains("<HOME>")) {
            s = s.replace('\\', "/");
        }
        s
    }

    fn normalise(&self, value: Value) -> Value {
        match value {
            Value::String(s) => Value::String(self.normalise_text(&s)),
            Value::Array(items) => {
                Value::Array(items.into_iter().map(|v| self.normalise(v)).collect())
            }
            Value::Object(map) => Value::Object(
                map.into_iter()
                    .map(|(k, v)| (k, self.normalise(v)))
                    .collect(),
            ),
            other => other,
        }
    }

    /// Writes a case's seed files (each inside the fake HOME).
    fn seed(&self, entries: &Value) {
        for entry in entries.as_array().into_iter().flatten() {
            let target = PathBuf::from(self.expand(entry["path"].as_str().unwrap()));
            assert!(
                target.starts_with(self.root()),
                "seed {target:?} is outside the profile"
            );
            std::fs::create_dir_all(target.parent().unwrap()).unwrap();
            std::fs::write(&target, entry["text"].as_str().unwrap()).unwrap();
        }
    }

    fn remove(&self, paths: &Value) {
        for path in paths.as_array().into_iter().flatten() {
            let target = PathBuf::from(self.expand(path.as_str().unwrap()));
            assert!(
                target.starts_with(self.root()),
                "remove {target:?} is outside the profile"
            );
            let _ = std::fs::remove_dir_all(&target).or_else(|_| std::fs::remove_file(&target));
        }
    }
}

/// An object's value under `key` in an order-preserving parsed tree.
fn member<'a>(value: &'a JsValue, key: &str) -> &'a JsValue {
    match value {
        JsValue::Object(entries) => entries
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v)
            .unwrap_or_else(|| panic!("no {key} in {}", value.stringify())),
        other => panic!("{} is not an object", other.stringify()),
    }
}

fn items(value: &JsValue) -> &[JsValue] {
    match value {
        JsValue::Array(items) => items,
        other => panic!("{} is not an array", other.stringify()),
    }
}

fn runner_of(name: &str) -> Runner {
    Runner::parse(name).unwrap_or_else(|| panic!("unknown runner {name}"))
}

/// One logged line, as the golden's `events.json` records it.
fn event(step: usize, call: &str, level: &str, text: &str) -> Value {
    json!({
        "step": step,
        "call": call,
        "level": if level == "warn" { "warning" } else { level },
        "text": text,
    })
}

/// The parser message after `ignoring.\n` is neutralised to its marker, which first has to be
/// non-empty (`deltas.json`, `malformed-json-parser-message`).
fn neutralise_parser_message(line: &str) -> String {
    const MARKER: &str = "ignoring.\n";
    if !line.starts_with("Known fixes could not be applied") {
        return line.to_string();
    }
    match line.find(MARKER) {
        Some(at) => {
            let (head, message) = line.split_at(at + MARKER.len());
            assert!(!message.is_empty(), "the parser message is empty: {line:?}");
            format!("{head}{PARSER_MESSAGE}")
        }
        None => line.to_string(),
    }
}

/// The tier-1 fix an object holds, for the `routingOnly` step: allow-listed keys only.
fn fix_from_object(fix: &Value) -> KnownFixesInfo {
    let mut out = KnownFixesInfo::default();
    for (key, value) in fix.as_object().expect("a fix object") {
        out.set(key, value.clone());
    }
    out
}

/// Runs one step and returns its `result.json` entry. Log lines the step wrote are appended to `events`.
fn run_step(
    rig: &Rig,
    index: usize,
    step: &Value,
    ordered: &JsValue,
    events: &mut Vec<Value>,
) -> Value {
    let op = step["op"].as_str().expect("step op");
    // Runs `work` as `call` and files every line it logged under (index, call).
    let logged = |call: &str, events: &mut Vec<Value>, work: &mut dyn FnMut() -> Value| {
        let before = rig.log.lines().len();
        let answer = work();
        for (level, line) in rig.log.lines().into_iter().skip(before) {
            events.push(event(index, call, level, &neutralise_parser_message(&line)));
        }
        answer
    };
    match op {
        "read" => {
            rig.remove(&step["remove"]);
            rig.seed(&step["seed"]);
            let app_name = rig.expand(step["appName"].as_str().unwrap());
            let runner = runner_of(step["runner"].as_str().unwrap());
            let mut answers = Map::new();
            for call in step["calls"].as_array().unwrap() {
                let call = call.as_str().unwrap();
                let answer = logged(call, events, &mut || match call {
                    "readKnownFixes" => {
                        json!(reader::read_known_fixes(&rig.ctx, &app_name, runner))
                    }
                    "readKnownFixesWithLayer" => {
                        json!(reader::read_known_fixes_with_layer(
                            &rig.ctx, &app_name, runner
                        ))
                    }
                    "readKnownFixProfile" => {
                        json!(reader::read_known_fix_profile(&rig.ctx, &app_name, runner))
                    }
                    "readGamelibFixStatus" => {
                        json!(reader::read_gamelib_fix_status(&rig.ctx, &app_name, runner))
                    }
                    other => panic!("unknown reader {other}"),
                });
                answers.insert(call.to_string(), answer);
            }
            json!({
                "op": "read",
                "appName": step["appName"],
                "runner": step["runner"],
                "answers": answers,
            })
        }
        "filter" => {
            // The parsed value comes from the order-preserving tree: the warnings follow its key order.
            let parsed = member(ordered, "parsed");
            let app_name = step["appName"].as_str().unwrap();
            let layer = step["layer"].as_str().unwrap();
            let filtered = logged("filterTier1KnownFixes", events, &mut || {
                json!(reader::filter_tier1_known_fixes(
                    &rig.ctx, app_name, layer, parsed
                ))
            });
            json!({ "op": "filter", "filtered": filtered })
        }
        "exeShape" => {
            let answers: Vec<bool> = step["values"]
                .as_array()
                .unwrap()
                .iter()
                .map(reader::is_valid_exe_override_shape)
                .collect();
            json!({ "op": "exeShape", "answers": answers })
        }
        "routingOnly" => {
            let fix = fix_from_object(&step["fix"]);
            json!({ "op": "routingOnly", "routingOnly": reader::is_routing_only_tier1_fix(&fix) })
        }
        "tier1Keys" => json!({ "op": "tier1Keys", "keys": TIER1_KNOWN_FIX_KEYS }),
        "layerPaths" => json!({
            "op": "layerPaths",
            "fixesPath": rig.ctx.paths.fixes.to_string_lossy(),
            "localFixesPath": rig.ctx.paths.local.to_string_lossy(),
            "bundledFixesPath": rig.ctx.paths.bundled.as_ref().unwrap().to_string_lossy(),
        }),
        other => panic!("unknown step op {other}"),
    }
}

/// Runs one case on a fresh fake HOME; returns `(result, events)` normalised like the golden.
fn run_case(case: &Value, ordered: &JsValue) -> (Value, Value) {
    let rig = Rig::new();
    let mut events = Vec::new();
    let mut steps = Vec::new();
    for (index, step) in case["steps"].as_array().unwrap().iter().enumerate() {
        let ordered_step = &items(member(ordered, "steps"))[index];
        steps.push(run_step(&rig, index, step, ordered_step, &mut events));
    }
    (
        rig.normalise(json!({ "steps": steps })),
        rig.normalise(Value::Array(events)),
    )
}

fn load_cases() -> (Vec<Value>, Vec<JsValue>) {
    let path = golden_dir().join("cases.json");
    let ordered = JsValue::parse(&read_text(&path)).unwrap_or_else(|e| panic!("{path:?}: {e}"));
    let cases = match ordered.to_value() {
        Value::Array(cases) => cases,
        other => panic!("cases.json is not an array: {other}"),
    };
    (cases, items(&ordered).to_vec())
}

#[test]
fn every_reader_golden_replays() {
    let (cases, ordered) = load_cases();
    check_floor("golden/reader cases", cases.len(), READER_FLOOR).unwrap();
    let mut compared = 0usize;
    let mut failing = std::collections::BTreeSet::new();
    let mut failures = Vec::new();
    for (case, ordered) in cases.iter().zip(&ordered) {
        let id = case["id"].as_str().unwrap();
        let dir = golden_dir().join("expected").join(id);
        let (result, events) = run_case(case, ordered);
        let want_result = read_json(&dir.join("result.json"));
        let want_events = read_json(&dir.join("events.json"));
        if result != want_result {
            failing.insert(id.to_string());
            failures.push(format!(
                "{id}: result\n  want {want_result}\n  got  {result}"
            ));
        }
        if events != want_events {
            failing.insert(id.to_string());
            failures.push(format!(
                "{id}: events\n  want {want_events}\n  got  {events}"
            ));
        }
        compared += 1;
    }
    assert!(
        failures.is_empty(),
        "{} of {compared} cases differ:\n{}",
        failing.len(),
        failures.join("\n")
    );
    check_floor("golden/reader cases compared", compared, READER_FLOOR).unwrap();
}

#[test]
fn the_floor_matches_the_manifest_and_an_empty_list_fails() {
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    let (cases, _) = load_cases();
    assert_eq!(manifest["count"].as_u64(), Some(cases.len() as u64));
    assert!(manifest["floor"].as_u64().unwrap() as usize <= READER_FLOOR);
    assert!(
        cases.len() >= READER_FLOOR,
        "{} cases, below the floor of {READER_FLOOR}",
        cases.len()
    );
    let ids: std::collections::BTreeSet<&str> =
        cases.iter().map(|c| c["id"].as_str().unwrap()).collect();
    assert_eq!(ids.len(), cases.len(), "case ids repeat");
    let folders = std::fs::read_dir(golden_dir().join("expected"))
        .unwrap()
        .count();
    assert_eq!(folders, cases.len(), "one expected folder per case");
    let err = check_floor("golden/reader cases", 0, READER_FLOOR).unwrap_err();
    assert!(err.contains("below the floor"), "{err}");
}

/// A fixed-text assertion over an app: a file the case seeds, answered by each reader.
fn seeded(layer_files: &[(&str, &str)]) -> Rig {
    let rig = Rig::new();
    for (path, body) in layer_files {
        let target = PathBuf::from(rig.expand(path));
        std::fs::create_dir_all(target.parent().unwrap()).unwrap();
        std::fs::write(target, body).unwrap();
    }
    rig
}

#[test]
fn a_status_probe_whose_winning_tier_1_file_is_routing_only_falls_to_the_profile() {
    // The local tier-1 file carries only `macArch`: it does not count as a fix, and it shadows the
    // bundled tier-1 file whole-file (the `break`), so the answer comes from the tier-2 profile or is none.
    let rig = seeded(&[
        ("<APPFOLDER>/fixes/local/1-gog.json", r#"{"macArch":"32"}"#),
        (
            "<HOME>/public/fixes/1-gog.json",
            r#"{"title":"b","launchNotice":"n"}"#,
        ),
    ]);
    assert_eq!(
        reader::read_gamelib_fix_status(&rig.ctx, "1", Runner::Gog),
        None
    );
    let profile = PathBuf::from(rig.expand("<HOME>/public/fixes/1-gog.profile.json"));
    std::fs::write(profile, r#"{"title":"p"}"#).unwrap();
    let status = reader::read_gamelib_fix_status(&rig.ctx, "1", Runner::Gog).unwrap();
    assert_eq!(
        serde_json::to_value(&status).unwrap(),
        json!({"origin": "bundled"})
    );
}

#[test]
fn the_profile_reader_never_opens_the_remote_directory() {
    let rig = seeded(&[(
        "<APPFOLDER>/fixes/2-steam.profile.json",
        r#"{"title":"remote profile","registry":[]}"#,
    )]);
    assert_eq!(
        reader::read_known_fix_profile(&rig.ctx, "2", Runner::Steam),
        None
    );
    assert!(
        rig.log.lines().is_empty(),
        "nothing was read, so nothing is warned: {:?}",
        rig.log.lines()
    );
    // The same name under the local layer is read.
    let local = PathBuf::from(rig.expand("<APPFOLDER>/fixes/local/2-steam.profile.json"));
    std::fs::create_dir_all(local.parent().unwrap()).unwrap();
    std::fs::write(local, r#"{"title":"local profile"}"#).unwrap();
    let got = reader::read_known_fix_profile(&rig.ctx, "2", Runner::Steam).unwrap();
    assert_eq!(
        serde_json::to_value(&got).unwrap(),
        json!({"title": "local profile"})
    );
}

#[test]
fn a_remote_tier_1_file_carrying_tier_2_keys_yields_no_tier_2_data() {
    let rig = seeded(&[(
        "<APPFOLDER>/fixes/3-gog.json",
        r#"{"title":"remote","winetricks":["x"],"registry":[{"key":"k"}],"dllOverrides":[],"overlays":[],"shimFeatures":[]}"#,
    )]);
    let fix = reader::read_known_fixes(&rig.ctx, "3", Runner::Gog).unwrap();
    assert_eq!(
        serde_json::to_value(&fix).unwrap(),
        json!({"title": "remote", "winetricks": ["x"]})
    );
    assert_eq!(
        reader::read_known_fix_profile(&rig.ctx, "3", Runner::Gog),
        None
    );
    assert_eq!(
        reader::read_gamelib_fix_status(&rig.ctx, "3", Runner::Gog),
        None
    );
}

#[test]
fn a_reader_line_carries_no_profile_path() {
    let rig = seeded(&[
        ("<APPFOLDER>/fixes/local/4-gog.json", "{ not json"),
        (
            "<HOME>/public/fixes/4-gog.json",
            r#"{"registry":[],"zzz":1,"macArch":"64"}"#,
        ),
    ]);
    reader::read_known_fixes(&rig.ctx, "4", Runner::Gog);
    reader::read_known_fix_profile(&rig.ctx, "../4", Runner::Gog);
    let home = rig.root().to_string_lossy().into_owned();
    let lines = rig.log.lines();
    assert!(lines.len() >= 5, "{lines:?}");
    for (_, line) in lines {
        assert!(!line.contains(&home), "{line}");
    }
}
