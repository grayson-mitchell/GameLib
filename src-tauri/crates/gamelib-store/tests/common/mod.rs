//! Shared by the golden replays (`ops_golden`, `engine_golden`): the case and outcome readers, the
//! op replay that stands in for `GameLibStore` over one file, and the file-tree comparison.
//!
//! Cases are read through the crate's own `json::parse`, never `serde_json::Value`: without
//! `preserve_order` that type sorts object keys, and the key order of an op's value is part of the
//! bytes a case expects.

#![allow(dead_code)]

use std::collections::{BTreeSet, HashMap};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use gamelib_store::atomic::{write_atomic, Durability};
use gamelib_store::envelope::stamp_for_write;
use gamelib_store::json::{parse, to_compact_bytes, to_store_bytes, Json, Num, Obj};
use gamelib_store::ops::{self, Op, OpReject};

pub fn golden_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/golden")
}

fn load(name: &str) -> Json {
    let path = golden_dir().join(name);
    let bytes = fs::read(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    parse(&bytes).unwrap_or_else(|e| panic!("{name}: {e}"))
}

/// Every case in `cases.json`, in file order.
pub fn load_cases() -> Vec<Json> {
    load("cases.json")
        .as_array()
        .expect("cases.json is an array")
        .to_vec()
}

/// `outcomes.json` keyed by case id.
pub fn load_outcomes() -> HashMap<String, Json> {
    load("outcomes.json")
        .as_array()
        .expect("outcomes.json is an array")
        .iter()
        .map(|o| (text(o, "id").to_string(), o.clone()))
        .collect()
}

pub fn text<'a>(v: &'a Json, key: &str) -> &'a str {
    v.get(key)
        .and_then(Json::as_str)
        .unwrap_or_else(|| panic!("no string `{key}` in {}", compact(v)))
}

pub fn opt_text<'a>(v: &'a Json, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Json::as_str)
}

pub fn compact(v: &Json) -> String {
    String::from_utf8(to_compact_bytes(v)).expect("utf-8")
}

pub fn as_u64(v: &Json) -> u64 {
    match v {
        Json::Num(Num::U(n)) => *n,
        Json::Num(Num::I(n)) => u64::try_from(*n).expect("non-negative"),
        other => panic!("not an integer: {}", compact(other)),
    }
}

/// What a case's `declaration` says about the store file.
pub struct Decl {
    pub dir: String,
    pub name: String,
    pub kind: String,
    pub dot_paths: bool,
    pub failed_view_empty: bool,
}

pub fn decl_of(case: &Json) -> Decl {
    let d = case.get("declaration").expect("case has a declaration");
    Decl {
        dir: text(d, "dir").to_string(),
        name: text(d, "name").to_string(),
        kind: text(d, "kind").to_string(),
        dot_paths: d
            .get("accessPropertiesByDotNotation")
            .and_then(Json::as_bool)
            != Some(false),
        failed_view_empty: opt_text(d, "failedView") == Some("empty"),
    }
}

impl Decl {
    pub fn path(&self, user_data: &Path) -> PathBuf {
        user_data
            .join(&self.dir)
            .join(format!("{}.json", self.name))
    }

    /// The chain key the TS engine used: `<directory>/<file name>`.
    pub fn chain_key(&self) -> String {
        format!("{}/{}", self.dir, self.name)
    }
}

/// `2026-11-21T09:00:00.000Z` (and the same without milliseconds) as a `SystemTime`.
pub fn parse_iso(text: &str) -> SystemTime {
    let b = text.as_bytes();
    let num =
        |a: usize, z: usize| -> i64 { text[a..z].parse().unwrap_or_else(|_| panic!("{text}")) };
    assert!(b.len() >= 19 && b[10] == b'T', "bad timestamp {text}");
    let (y, mo, d) = (num(0, 4), num(5, 7), num(8, 10));
    let (h, mi, s) = (num(11, 13), num(14, 16), num(17, 19));
    let ms = if b.len() >= 23 && b[19] == b'.' {
        num(20, 23)
    } else {
        0
    };
    // Howard Hinnant's days_from_civil.
    let y = if mo <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (mo + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    let secs = days * 86_400 + h * 3600 + mi * 60 + s;
    UNIX_EPOCH + Duration::from_millis(u64::try_from(secs * 1000 + ms).expect("after 1970"))
}

/// The golden's fake clock: every backup of the first boot is stamped `20261121T090000000Z`.
pub fn golden_now() -> SystemTime {
    parse_iso("2026-11-21T09:00:00.000Z")
}

/// One store file under replay, standing in for the `GameLibStore` wrapper conf sat under: ops are
/// applied to the document, a refused or read-only write leaves the file alone, and every accepted
/// write stamps the envelope and rewrites the file (conf rewrote it whatever the key held).
pub struct Replay {
    pub path: PathBuf,
    pub doc: Json,
    pub version: u32,
    pub read_only: bool,
    pub dot_paths: bool,
    pub reads: Vec<String>,
    pub threw: Vec<usize>,
}

impl Replay {
    pub fn run(&mut self, ops_list: &[Json]) {
        for (i, op) in ops_list.iter().enumerate() {
            match text(op, "op") {
                "get" => {
                    let key = text(op, "key");
                    let got = ops::get(&self.doc, key, self.dot_paths);
                    self.reads
                        .push(read_line(i, "get", key, got.is_some(), got));
                }
                "has" => {
                    let key = text(op, "key");
                    let has = ops::has(&self.doc, key, self.dot_paths);
                    self.reads.push(read_line(i, "has", key, has, None));
                }
                "dump" => self
                    .reads
                    .push(read_line(i, "dump", "", true, Some(&self.doc))),
                name => self.mutate(i, op_of(name, op)),
            }
        }
    }

    fn mutate(&mut self, i: usize, op: Op) {
        if self.read_only {
            return;
        }
        match ops::apply(&mut self.doc, &op, self.dot_paths) {
            Ok(_) => {
                self.doc = stamp_for_write(&self.doc, self.version);
                write_atomic(&self.path, &to_store_bytes(&self.doc), Durability::Unsynced)
                    .unwrap_or_else(|e| panic!("write {}: {e}", self.path.display()));
            }
            Err(OpReject::ReservedKey) => self.threw.push(i),
            Err(OpReject::KeyPath) => {}
            Err(OpReject::NotReplace) => unreachable!("ops::apply never refuses a whole-store op"),
        }
    }
}

fn op_of(name: &str, op: &Json) -> Op {
    match name {
        "set" => Op::Set {
            key: text(op, "key").to_string(),
            value: op.get("value").expect("set has a value").clone(),
        },
        "delete" => Op::Delete {
            key: text(op, "key").to_string(),
        },
        "clear" => Op::Clear,
        "assign" => match op.get("value") {
            Some(Json::Obj(o)) => Op::Replace(o.clone()),
            other => panic!("assign value is not an object: {other:?}"),
        },
        other => panic!("unknown op {other}"),
    }
}

fn read_line(i: usize, op: &str, key: &str, flag: bool, value: Option<&Json>) -> String {
    let v = value.map(compact).unwrap_or_default();
    format!("{i}|{op}|{key}|{flag}|{v}")
}

/// The reads the TS oracle recorded, in the same line shape `Replay` produces.
pub fn expected_reads(outcome: &Json) -> Vec<String> {
    let mut out = Vec::new();
    for r in outcome.get("reads").and_then(Json::as_array).unwrap_or(&[]) {
        let i = usize::try_from(as_u64(r.get("i").expect("read has i"))).expect("index");
        let op = text(r, "op");
        out.push(match op {
            "get" => {
                let found = r.get("found").and_then(Json::as_bool).expect("found");
                read_line(i, op, text(r, "key"), found, r.get("value"))
            }
            "has" => {
                let has = r.get("has").and_then(Json::as_bool).expect("has");
                read_line(i, op, text(r, "key"), has, None)
            }
            "dump" => read_line(i, op, "", true, r.get("value")),
            other => panic!("unknown read op {other}"),
        });
    }
    out
}

pub fn expected_threw(outcome: &Json) -> Vec<usize> {
    outcome
        .get("threw")
        .and_then(Json::as_array)
        .unwrap_or(&[])
        .iter()
        .map(|t| usize::try_from(as_u64(t.get("i").expect("threw has i"))).expect("index"))
        .collect()
}

/// Every file under `root`, as `/`-separated paths relative to it.
pub fn tree(root: &Path) -> BTreeSet<String> {
    fn walk(dir: &Path, prefix: &str, out: &mut BTreeSet<String>) {
        let Ok(rd) = fs::read_dir(dir) else { return };
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            let rel = if prefix.is_empty() {
                name
            } else {
                format!("{prefix}/{name}")
            };
            if e.path().is_dir() {
                walk(&e.path(), &rel, out);
            } else {
                out.insert(rel);
            }
        }
    }
    let mut out = BTreeSet::new();
    walk(root, "", &mut out);
    out
}

/// The file set `outcomes.json` records for a case.
pub fn expected_files(outcome: &Json) -> BTreeSet<String> {
    outcome
        .get("files")
        .and_then(Json::as_array)
        .unwrap_or(&[])
        .iter()
        .map(|f| f.as_str().expect("file path").to_string())
        .collect()
}

/// The tree under `user_data` is exactly the recorded file set, and (unless `bytes` is false) every
/// file equals `expected/<id>/<path>` byte for byte. No temp file may survive.
pub fn assert_files(id: &str, user_data: &Path, outcome: &Json, bytes: bool) {
    let want = expected_files(outcome);
    let got = tree(user_data);
    assert_eq!(got, want, "{id}: file set differs");
    if !bytes {
        return;
    }
    let root = golden_dir().join("expected").join(id);
    for rel in &want {
        let expected = fs::read(root.join(rel)).unwrap_or_else(|e| panic!("{id}/{rel}: {e}"));
        let actual = fs::read(user_data.join(rel)).unwrap_or_else(|e| panic!("{id}/{rel}: {e}"));
        assert_eq!(
            String::from_utf8_lossy(&actual),
            String::from_utf8_lossy(&expected),
            "{id}: {rel} differs"
        );
        assert_eq!(actual, expected, "{id}: {rel} differs in bytes");
    }
}

/// A fresh `Obj` helper for tests that build documents by hand.
pub fn empty_obj() -> Json {
    Json::Obj(Obj::new())
}
