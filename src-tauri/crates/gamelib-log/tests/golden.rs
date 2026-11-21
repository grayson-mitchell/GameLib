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
use gamelib_log::writer::{LogConfig, Logger, TzOffset};
use gamelib_log::{Level, Prefix};
use gamelib_testutil::FakeHome;
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

fn level_of(s: &str) -> Level {
    Level::from_str(s).unwrap_or_else(|| panic!("unknown level {s}"))
}

fn prefix_of(s: &str) -> Prefix {
    Prefix::from_value(s).unwrap_or_else(|| panic!("unknown prefix {s:?}"))
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
    for frame in frames {
        for entry in frame["entries"].as_array().expect("entries") {
            let line = entry
                .get("line")
                .expect("general-only replay: line entries");
            logger.submit_line(
                line["ts"].as_u64().expect("ts"),
                line["tz"].as_i64().expect("tz") as i32,
                level_of(str_field(line, "level")),
                prefix_of(str_field(line, "prefix")),
                str_field(line, "msg"),
            );
        }
    }
    assert!(logger.flush(Duration::from_secs(10)), "flush timed out");
    let mut tree = BTreeMap::new();
    walk(home.root(), home.root(), &mut tree, Some(&root));
    (tree, root)
}

fn only_general(frames: &[Value]) -> bool {
    frames
        .iter()
        .all(|f| f["target"]["kind"].as_str() == Some("general"))
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
        if !only_general(&frames) {
            continue;
        }
        let (tree, _root) = replay(case, &frames);
        let mut expected = BTreeMap::new();
        let dir = expected_dir(id);
        walk(&dir, &dir, &mut expected, None);
        assert_eq!(tree, expected, "golden mismatch in case {id}");
        replayed += 1;
    }
    println!("golden cases replayed: {replayed}");
    assert!(replayed >= 20, "only {replayed} cases replayed");
}
