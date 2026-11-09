//! Regenerates and guards the committed synthetic CDN fixtures (D-14).
//!
//! `cargo test -p gamelib-depot --test fixtures_gen -- --ignored regenerate_fixtures` rewrites
//! `tests/fixtures/cases/`; the non-ignored tests fail on any drift.

#[allow(dead_code)]
#[path = "support/encode.rs"]
mod encode;
#[allow(dead_code)]
#[path = "support/fixture_builder.rs"]
mod fixture_builder;

use fixture_builder::{all_cases, render, write_case};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

const SIZE_CAP: u64 = 2 * 1024 * 1024;

fn cases_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/cases")
}

fn walk(dir: &Path, base: &Path, out: &mut BTreeMap<String, Vec<u8>>) {
    for e in std::fs::read_dir(dir).unwrap() {
        let p = e.unwrap().path();
        if p.is_dir() {
            walk(&p, base, out);
        } else {
            let rel = p
                .strip_prefix(base)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            out.insert(rel, std::fs::read(&p).unwrap());
        }
    }
}

#[test]
#[ignore]
fn regenerate_fixtures() {
    let dir = cases_dir();
    if dir.exists() {
        std::fs::remove_dir_all(&dir).unwrap();
    }
    std::fs::create_dir_all(&dir).unwrap();
    for case in all_cases() {
        write_case(&dir, &case);
    }
}

#[test]
fn fixtures_are_deterministic() {
    let mut expected = BTreeMap::new();
    for case in all_cases() {
        for (rel, bytes) in render(&case) {
            expected.insert(format!("{}/{rel}", case.name), bytes);
        }
    }
    // Rendering twice in-process must agree, and must equal the committed tree byte for byte.
    for case in all_cases() {
        for (rel, bytes) in render(&case) {
            assert_eq!(
                expected[&format!("{}/{rel}", case.name)],
                bytes,
                "{} {rel}",
                case.name
            );
        }
    }
    let mut committed = BTreeMap::new();
    walk(&cases_dir(), &cases_dir(), &mut committed);
    let a: Vec<_> = expected.keys().collect();
    let b: Vec<_> = committed.keys().collect();
    assert_eq!(
        a, b,
        "committed file set differs from generated; run regenerate_fixtures"
    );
    for (k, v) in &expected {
        assert!(committed[k] == *v, "fixture {k} drifted from the generator");
    }
}

#[test]
fn fixtures_parse_and_stay_small() {
    let dir = cases_dir();
    let mut names: Vec<String> = std::fs::read_dir(&dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    assert_eq!(
        names,
        [
            "encrypted-names",
            "lzma",
            "modes-macho",
            "multi-depot-collision",
            "shared-redist",
            "zip-deflate",
            "zstd"
        ]
    );
    let mut total = 0u64;
    for case in all_cases() {
        let files = render(&case);
        for (rel, bytes) in &files {
            total += bytes.len() as u64;
            if !rel.starts_with("manifests/") {
                continue;
            }
            let depot = case
                .depots
                .iter()
                .find(|d| rel == &format!("manifests/{}_{}.bin", d.depot_id, d.gid))
                .expect("manifest belongs to a depot");
            let key = {
                let want = depot.depot_id.to_string();
                let json = String::from_utf8(files["case.json"].clone()).unwrap();
                let v: serde_json::Value = serde_json::from_str(&json).unwrap();
                let hexk = v["depots"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|d| d["depotId"] == want.as_str())
                    .unwrap()["keyHex"]
                    .as_str()
                    .unwrap()
                    .to_string();
                let mut k = [0u8; 32];
                for (i, o) in k.iter_mut().enumerate() {
                    *o = u8::from_str_radix(&hexk[i * 2..i * 2 + 2], 16).unwrap();
                }
                k
            };
            let m = gamelib_depot::manifest::parse_manifest(bytes, Some(&key))
                .unwrap_or_else(|e| panic!("{} {rel}: {e}", case.name));
            assert_eq!(m.files.len(), depot.files.len());
            for (parsed, src) in m.files.iter().zip(&depot.files) {
                assert_eq!(parsed.filename, src.path);
                assert_eq!(parsed.size, src.content.len() as u64);
            }
        }
    }
    assert!(total < SIZE_CAP, "fixtures total {total} bytes");
}
