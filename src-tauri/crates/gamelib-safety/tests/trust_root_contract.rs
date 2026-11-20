//! The trust-root contract: every row of `fixtures/trust-root-contract.json` answers to the real
//! crate here. Its TS twin is `src/backend/testUtils/__tests__/fakeSafetyRustContract.test.ts`
//! (added by 82-19), which runs the same rows against the TS fake transport. The fixture is the
//! one contract both answer to, so a fake/crate divergence (the CR-01 over-refusal hid behind one)
//! turns a test red instead of hiding.
//!
//! Each row runs in its own fresh `FakeHome`, with every path built segment by segment.

use gamelib_safety::remove::{check_removal, remove_tree};
use gamelib_safety::safe_path::CaseMode;
use gamelib_safety::tri::Tri;
use gamelib_safety::wire::{Outcome, Reason, Request, Target, TargetKind};
use gamelib_testutil::FakeHome;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};

/// D-05: an emptied or truncated fixture must fail, not pass on zero rows.
const CONTRACT_FLOOR: usize = 11;

const FIXTURE: &str = include_str!("fixtures/trust-root-contract.json");

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Contract {
    rows: Vec<Row>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Row {
    name: String,
    kind: TargetKind,
    #[serde(default)]
    dirs: Vec<Vec<String>>,
    #[serde(default)]
    files: Vec<Vec<String>>,
    target: Vec<String>,
    trust_root: TrustRoot,
    #[serde(default)]
    protected_roots: Vec<Vec<String>>,
    expect: Expect,
}

/// A segment array is joined onto the test root; a string is used verbatim.
#[derive(Deserialize)]
#[serde(untagged)]
enum TrustRoot {
    Segments(Vec<String>),
    Verbatim(String),
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Expect {
    verdict: Tri,
    reason: Reason,
    /// Asserted only when the verdict is yes.
    absent: bool,
}

fn contract() -> Contract {
    serde_json::from_str(FIXTURE).expect("trust-root-contract.json parses into the crate's types")
}

/// Joins segment by segment (never `join("a/b")`: Windows CI rule).
fn seg(base: &Path, parts: &[String]) -> PathBuf {
    parts.iter().fold(base.to_path_buf(), |p, s| p.join(s))
}

fn text(p: &Path) -> String {
    p.to_str().expect("utf-8 path").to_string()
}

fn exists(p: &Path) -> bool {
    fs::symlink_metadata(p).is_ok()
}

#[test]
fn the_contract_has_at_least_the_floor_of_rows() {
    let n = contract().rows.len();
    assert!(
        n >= CONTRACT_FLOOR,
        "trust-root-contract.json has {n} rows, floor is {CONTRACT_FLOOR}"
    );
}

/// Runs one row, pushing one "row name: what differed" line per mismatch.
fn run_row(row: &Row, bad: &mut Vec<String>) {
    let home = FakeHome::new("gamelib-safety-contract-");
    let root = home.root();
    for d in &row.dirs {
        fs::create_dir_all(seg(root, d)).expect("mkdir");
    }
    for f in &row.files {
        let p = seg(root, f);
        if let Some(parent) = p.parent() {
            fs::create_dir_all(parent).expect("mkdir");
        }
        fs::write(&p, b"x").expect("write");
    }
    let target = seg(root, &row.target);
    let trust_root = match &row.trust_root {
        TrustRoot::Segments(s) => text(&seg(root, s)),
        TrustRoot::Verbatim(v) => v.clone(),
    };
    let req = Request {
        targets: vec![Target {
            id: "t".to_string(),
            path: text(&target),
            kind: row.kind,
            trust_root: Some(trust_root.clone()),
            executable: None,
        }],
        known_installs: Some(vec![]),
        self_key: None,
        protected_roots: row
            .protected_roots
            .iter()
            .map(|s| text(&seg(root, s)))
            .collect(),
    };
    let existed = exists(&target);
    let name = &row.name;

    let reply = check_removal(&req, CaseMode::Auto);
    let item = &reply.items[0];
    if item.verdict != row.expect.verdict {
        bad.push(format!(
            "{name}: verdict {:?}, want {:?} (reason {:?})",
            item.verdict, row.expect.verdict, item.reason
        ));
    }
    if item.reason != row.expect.reason {
        bad.push(format!(
            "{name}: reason {:?}, want {:?}",
            item.reason, row.expect.reason
        ));
    }
    if row.expect.verdict == Tri::Yes && item.absent != row.expect.absent {
        bad.push(format!(
            "{name}: absent {}, want {}",
            item.absent, row.expect.absent
        ));
    }
    if exists(&target) != existed {
        bad.push(format!("{name}: check_removal changed the target"));
    }

    let rm = remove_tree(&req, CaseMode::Auto);
    if row.expect.verdict == Tri::Yes {
        if rm.outcome != Outcome::Removed {
            bad.push(format!(
                "{name}: remove_tree outcome {:?}, want Removed",
                rm.outcome
            ));
        }
        if exists(&target) {
            bad.push(format!("{name}: target still exists after remove_tree"));
        }
        if row.expect.absent {
            if let TrustRoot::Segments(s) = &row.trust_root {
                let root_existed = row.dirs.iter().any(|d| d.starts_with(s));
                if !root_existed && exists(&seg(root, s)) {
                    bad.push(format!("{name}: remove_tree created the trust root"));
                }
            }
        }
    } else {
        if rm.outcome != Outcome::Refused {
            bad.push(format!(
                "{name}: remove_tree outcome {:?}, want Refused",
                rm.outcome
            ));
        }
        if existed && !exists(&target) {
            bad.push(format!("{name}: a refused target was deleted"));
        }
    }
}

#[test]
fn every_contract_row_answers_as_written() {
    let c = contract();
    let mut bad: Vec<String> = Vec::new();
    for row in &c.rows {
        run_row(row, &mut bad);
    }
    assert!(bad.is_empty(), "contract mismatches:\n{}", bad.join("\n"));
}
