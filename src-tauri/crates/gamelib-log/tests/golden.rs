//! Rust == TS golden (Phase 84, criterion 1). Every oracle case in `cases.json` with frames in
//! `entries.json`, and the hand-written `shell-line` case, is replayed through the real `Logger` on a
//! FakeHome log dir; the resulting tree must equal `expected/<id>/` byte for byte. File mode is not
//! part of the golden (D-18): a separate unix test in `writer.rs` pins 0600.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use gamelib_core::clock::Clock;
use gamelib_core::paths::{join, log_file, GameLogType, LogRunner, LogTarget, Platform};
use gamelib_log::frame::parse_frame;
use gamelib_log::sanitize::{renderer_body, RendererMessage};
use gamelib_log::writer::{LogConfig, Logger, TzOffset};
use gamelib_log::{Level, Prefix};
use gamelib_testutil::FakeHome;
use serde::de::{self, Deserializer, MapAccess, SeqAccess, Visitor};
use serde::Deserialize;
use serde_json::Value;

const CASES: &str = include_str!("fixtures/golden/cases.json");
const ENTRIES: &str = include_str!("fixtures/golden/entries.json");

/// 2026-11-20 13:05:09 at UTC+13: the wall clock every golden line starts with.
const FIXED_TS: u64 = 1_795_133_109_000;
const FIXED_TZ: i32 = 780;

struct FixedClock;
impl Clock for FixedClock {
    fn now_ms(&self) -> u64 {
        FIXED_TS
    }
}

struct FixedTz;
impl TzOffset for FixedTz {
    fn offset_minutes(&self, _epoch_ms: u64) -> i32 {
        FIXED_TZ
    }
}

fn str_field<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key)
        .and_then(Value::as_str)
        .unwrap_or_else(|| panic!("missing string field {key} in {v}"))
}

fn target_of(v: &Value) -> LogTarget {
    match str_field(v, "kind") {
        "general" => LogTarget::General,
        "runner" => LogTarget::Runner(runner_of(str_field(v, "runner"))),
        "game" => LogTarget::Game {
            app_name: str_field(v, "appName").to_string(),
            runner: runner_of(str_field(v, "runner")),
            kind: GameLogType::from_str(str_field(v, "type")).expect("game log type"),
        },
        "gogRedist" => LogTarget::GogRedist,
        other => panic!("unknown target kind {other}"),
    }
}

fn runner_of(s: &str) -> LogRunner {
    LogRunner::from_str(s).unwrap_or_else(|| panic!("unknown runner {s}"))
}

/// Text found in the tree, with the temp root replaced by `${LOGDIR}` and the backslashes in the
/// path that follows it normalised (the TS oracle's own tokenising rule).
fn tokenise(text: &str, root: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(i) = rest.find(root) {
        out.push_str(&rest[..i]);
        out.push_str("${LOGDIR}");
        let tail = &rest[i + root.len()..];
        let end = tail
            .find(|c: char| c.is_whitespace() || c == '\'' || c == '"')
            .unwrap_or(tail.len());
        out.push_str(&tail[..end].replace('\\', "/"));
        rest = &tail[end..];
    }
    out.push_str(rest);
    out
}

fn walk(base: &Path, dir: &Path, out: &mut BTreeMap<String, String>, root: Option<&str>) {
    let Ok(read) = fs::read_dir(dir) else {
        return;
    };
    for entry in read {
        let path = entry.expect("dir entry").path();
        if path.is_dir() {
            walk(base, &path, out, root);
        } else {
            let rel = path
                .strip_prefix(base)
                .expect("under base")
                .components()
                .map(|c| c.as_os_str().to_string_lossy().into_owned())
                .collect::<Vec<_>>()
                .join("/");
            let bytes = fs::read(&path).expect("read file");
            let text = String::from_utf8(bytes).expect("utf-8 log file");
            let text = match root {
                Some(r) => tokenise(&text, r),
                None => text,
            };
            out.insert(rel, text);
        }
    }
}

fn expected_dir(id: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("golden")
        .join("expected")
        .join(id)
}

fn seed(cfg_dir: &str, user_data: &str, case: &Value) {
    let Some(target) = case.get("target") else {
        return;
    };
    let path =
        log_file(Platform::current(), cfg_dir, user_data, &target_of(target)).expect("seed path");
    let path = Path::new(&path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("seed dir");
    }
    if let Some(existing) = case.get("existing").and_then(Value::as_str) {
        fs::write(path, existing).expect("seed existing");
    }
    if let Some(old) = case.get("existingOld").and_then(Value::as_str) {
        let mut old_path = path.as_os_str().to_owned();
        old_path.push(".old");
        fs::write(old_path, old).expect("seed existing .old");
    }
}

/// Replays one case and returns the tree it produced.
fn replay(case: &Value, frames: &[Value]) -> (BTreeMap<String, String>, String) {
    let home = FakeHome::new("gamelib-log-golden-");
    let root = home.root().to_string_lossy().into_owned();
    let user_data = join(Platform::current(), &root, &["userData"]);
    seed(&root, &user_data, case);
    let logger = Logger::start(LogConfig {
        platform: Platform::current(),
        log_dir: root.clone(),
        user_data,
        clock: Arc::new(FixedClock),
        tz: Arc::new(FixedTz),
    });
    if str_field(case, "id") == "shell-line" {
        logger.log(Prefix::Shell, Level::Info, str_field(case, "message"));
    }
    // One frame per writer instance, each through the same parser the shell uses for a sidecar frame.
    for frame in frames {
        let value = serde_json::json!({"kind": "log", "batch": [frame]});
        let len = value.to_string().len();
        let batches = parse_frame(len, value).expect("frame parses");
        logger.submit(batches);
    }
    assert!(logger.flush(Duration::from_secs(10)), "flush timed out");
    let mut tree = BTreeMap::new();
    walk(home.root(), home.root(), &mut tree, Some(&root));
    (tree, root)
}

#[test]
fn rust_writer_matches_the_ts_golden() {
    let cases: Vec<Value> = serde_json::from_str(CASES).expect("cases.json");
    let entries: Vec<Value> = serde_json::from_str(ENTRIES).expect("entries.json");
    let mut replayed = 0;
    for case in &cases {
        let id = str_field(case, "id");
        let frames: Vec<Value> = match entries.iter().find(|e| e["id"].as_str() == Some(id)) {
            Some(e) => match e.get("frames").and_then(Value::as_array) {
                Some(f) => f.clone(),
                None => continue, // renderer case: replayed by the sanitiser test
            },
            None if id == "shell-line" => Vec::new(),
            None => panic!("case {id} has no entries"),
        };
        let (tree, _root) = replay(case, &frames);
        let mut expected = BTreeMap::new();
        let dir = expected_dir(id);
        walk(&dir, &dir, &mut expected, None);
        assert_eq!(tree, expected, "golden mismatch in case {id}");
        replayed += 1;
    }
    println!("golden cases replayed: {replayed}");
    let non_renderer = cases.iter().filter(|c| c["kind"] != "renderer").count();
    assert_eq!(
        replayed, non_renderer,
        "every non-renderer case is replayed"
    );
}

// ---------------------------------------------------------------------------------------------------
// Renderer cases. The sanitiser reads the sender's key order, which `serde_json::Value` (a sorted
// map without the ordered-map feature) would lose, so these cases are parsed with their own visitor.
// `{"$gen": {"repeat": "a", "count": 65537}}` expands to a string, as in the TS oracle.
// ---------------------------------------------------------------------------------------------------

#[derive(Deserialize)]
struct GenSpec {
    repeat: String,
    count: usize,
}

struct GenStr(String);

impl<'de> Deserialize<'de> for GenStr {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<GenStr, D::Error> {
        struct V;
        impl<'de> Visitor<'de> for V {
            type Value = GenStr;
            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("a string or a $gen object")
            }
            fn visit_str<E: de::Error>(self, v: &str) -> Result<GenStr, E> {
                Ok(GenStr(v.to_string()))
            }
            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<GenStr, A::Error> {
                let key: String = map.next_key()?.ok_or_else(|| de::Error::custom("empty"))?;
                if key != "$gen" {
                    return Err(de::Error::custom("only $gen objects"));
                }
                let spec: GenSpec = map.next_value()?;
                Ok(GenStr(spec.repeat.repeat(spec.count)))
            }
        }
        d.deserialize_any(V)
    }
}

struct GoldenMessage(RendererMessage);

impl<'de> Deserialize<'de> for GoldenMessage {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<GoldenMessage, D::Error> {
        struct V;
        impl<'de> Visitor<'de> for V {
            type Value = GoldenMessage;
            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("a renderer log message")
            }
            fn visit_str<E: de::Error>(self, v: &str) -> Result<GoldenMessage, E> {
                Ok(GoldenMessage(RendererMessage::Text(v.to_string())))
            }
            fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<GoldenMessage, A::Error> {
                let mut items = Vec::new();
                while let Some(GenStr(s)) = seq.next_element()? {
                    items.push(s);
                }
                Ok(GoldenMessage(RendererMessage::List(items)))
            }
            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<GoldenMessage, A::Error> {
                let mut entries: Vec<(String, String)> = Vec::new();
                while let Some(key) = map.next_key::<String>()? {
                    if key == "$gen" {
                        let spec: GenSpec = map.next_value()?;
                        return Ok(GoldenMessage(RendererMessage::Text(
                            spec.repeat.repeat(spec.count),
                        )));
                    }
                    entries.push((key, map.next_value::<String>()?));
                }
                Ok(GoldenMessage(RendererMessage::Object(entries)))
            }
        }
        d.deserialize_any(V)
    }
}

#[derive(Deserialize)]
struct RawCase {
    id: String,
    kind: String,
    channel: Option<String>,
    value: Option<GoldenMessage>,
}

#[test]
fn rust_sanitiser_matches_the_ts_golden_for_every_renderer_case() {
    let cases: Vec<RawCase> = serde_json::from_str(CASES).expect("cases.json");
    let mut replayed = 0;
    for case in cases.iter().filter(|c| c.kind == "renderer") {
        let message = &case.value.as_ref().expect("renderer value").0;
        let level = match case.channel.as_deref() {
            Some("logError") => Level::Error,
            Some("logInfo") => Level::Info,
            other => panic!("unknown renderer channel {other:?} in {}", case.id),
        };
        let home = FakeHome::new("gamelib-log-golden-");
        let root = home.root().to_string_lossy().into_owned();
        let logger = Logger::start(LogConfig {
            platform: Platform::current(),
            log_dir: root.clone(),
            user_data: join(Platform::current(), &root, &["userData"]),
            clock: Arc::new(FixedClock),
            tz: Arc::new(FixedTz),
        });
        logger.submit_line(
            FIXED_TS,
            FIXED_TZ,
            level,
            Prefix::Frontend,
            &renderer_body(message),
        );
        assert!(logger.flush(Duration::from_secs(10)), "flush timed out");
        let mut tree = BTreeMap::new();
        walk(home.root(), home.root(), &mut tree, Some(&root));
        let mut expected = BTreeMap::new();
        let dir = expected_dir(&case.id);
        walk(&dir, &dir, &mut expected, None);
        assert_eq!(
            tree, expected,
            "golden mismatch in renderer case {}",
            case.id
        );
        replayed += 1;
    }
    println!("renderer cases replayed: {replayed}");
    let total = serde_json::from_str::<Vec<Value>>(CASES)
        .expect("cases.json")
        .iter()
        .filter(|c| c["kind"] == "renderer")
        .count();
    assert!(total > 0);
    assert_eq!(replayed, total, "every renderer case is replayed");
}
