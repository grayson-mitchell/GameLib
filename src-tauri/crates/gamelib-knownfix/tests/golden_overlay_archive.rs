//! The overlay archive writer and strict reader against the TS goldens (88-06 recorded them, 88-10 replays
//! them; D-03, D-15, T-88-23). `golden/overlay_archive` holds 25 cases, each a list of steps over
//! `build_overlay_tar_gz` and `read_overlay_tar_gz`:
//!
//! - `build`, `buildPair`, `buildHeader`, `roundTrip`: the writer's bytes, its pinned gzip header fields and
//!   its tar header, and a write-then-read round trip;
//! - `read`: the strict reader's verdict over archive bytes given as base64.
//!
//! `expected/<case>/result.json` is compared whole. Two documented differences (`deltas.json`): the text
//! inside the parentheses of a gunzip failure is the decoder's own, and the compressed bytes of a written
//! archive depend on the deflate implementation, so the replay compares their size and sha256 only when
//! the compressed bytes are the golden's, and otherwise requires the gunzipped tar to equal the golden's
//! tar byte for byte and the archive to be one the reader accepts. At least one case must reproduce the
//! recorded gzip bytes (the other cases take their compressed fields from the golden, so the gzip bytes
//! are compared only where they match; they are not pinned independently). A count floor lives in this file, so
//! editing the JSON alone cannot lower the bar, and an empty case list fails.

use std::io::Read;
use std::path::{Path, PathBuf};

use flate2::read::GzDecoder;
use gamelib_knownfix::overlay::archive::{
    build_overlay_tar_gz, read_overlay_tar_gz, OverlayArchiveFile,
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

/// `golden/overlay_archive` holds 25 cases. A later edit may raise this, never lower it.
const OVERLAY_ARCHIVE_FLOOR: usize = 25;

fn golden_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/golden/overlay_archive")
}

fn read_json(path: &Path) -> Value {
    let text = std::fs::read_to_string(path).unwrap_or_else(|e| panic!("{path:?}: {e}"));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

fn check_floor(what: &str, count: usize, floor: usize) -> Result<(), String> {
    if count < floor {
        return Err(format!(
            "{what}: scanned {count}, below the floor of {floor}"
        ));
    }
    Ok(())
}

fn sha256(data: &[u8]) -> String {
    Sha256::digest(data)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Standard base64 (padded), enough for the fixture archives; no dependency for it.
fn base64_decode(text: &str) -> Vec<u8> {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = Vec::new();
    let (mut acc, mut bits) = (0u32, 0u32);
    for c in text.bytes().filter(|&c| c != b'=') {
        let v = ALPHABET
            .iter()
            .position(|&a| a == c)
            .unwrap_or_else(|| panic!("not base64: {c}")) as u32;
        acc = (acc << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    out
}

fn base64_encode(data: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for chunk in data.chunks(3) {
        let n = (chunk[0] as u32) << 16
            | (*chunk.get(1).unwrap_or(&0) as u32) << 8
            | *chunk.get(2).unwrap_or(&0) as u32;
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(ALPHABET[((n >> (18 - 6 * i)) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

fn gunzip_all(gz: &[u8]) -> Vec<u8> {
    let mut tar = Vec::new();
    GzDecoder::new(gz).read_to_end(&mut tar).expect("gunzip");
    tar
}

fn files_of(value: &Value) -> Vec<OverlayArchiveFile> {
    value
        .as_array()
        .expect("files")
        .iter()
        .map(|f| OverlayArchiveFile {
            path: f["path"].as_str().unwrap().to_string(),
            data: match f["base64"].as_str() {
                Some(b64) => base64_decode(b64),
                None => f["text"].as_str().unwrap_or("").as_bytes().to_vec(),
            },
        })
        .collect()
}

fn expected_of(value: &Value) -> Vec<(String, u64)> {
    value
        .as_object()
        .expect("expected")
        .iter()
        .map(|(path, size)| (path.clone(), size.as_u64().unwrap()))
        .collect()
}

fn listing(files: &[(String, Vec<u8>)]) -> Value {
    Value::Array(
        files
            .iter()
            .map(|(path, data)| json!({"path": path, "size": data.len(), "sha256": sha256(data)}))
            .collect(),
    )
}

/// A NUL terminated header field, one char per byte (the golden holds latin1 text).
fn c_string(h: &[u8], start: usize, len: usize) -> String {
    let slice = &h[start..start + len];
    let end = slice.iter().position(|&b| b == 0).unwrap_or(len);
    slice[..end].iter().map(|&b| b as char).collect()
}

fn latin1(bytes: &[u8]) -> String {
    bytes.iter().map(|&b| b as char).collect()
}

/// What each compressed byte comparison saw, so the run can say how many were byte for byte.
#[derive(Default)]
struct Compressed {
    identical: usize,
    differing: usize,
}

/// One step's answer, in the golden's shape.
fn run_step(step: &Value, compressed: &mut Compressed, golden: &Value) -> Value {
    let op = step["op"].as_str().unwrap();
    match op {
        "build" => {
            let label = step.get("label").cloned().unwrap_or(Value::Null);
            match build_overlay_tar_gz(&files_of(&step["files"])) {
                Err(error) => json!({"op": op, "label": label, "error": error}),
                Ok(out) => {
                    let tar = gunzip_all(&out);
                    let same = golden["sha256"].as_str() == Some(&sha256(&out));
                    if same {
                        compressed.identical += 1;
                    } else {
                        compressed.differing += 1;
                    }
                    // The compressed numbers are the golden's when the deflate output is the same, and
                    // the replay's own (then ignored) otherwise.
                    let (size, sha, b64) = if same {
                        (
                            out.len(),
                            sha256(&out),
                            (out.len() < 64 * 1024).then(|| base64_encode(&out)),
                        )
                    } else {
                        (
                            golden["size"].as_u64().unwrap() as usize,
                            golden["sha256"].as_str().unwrap().to_string(),
                            golden["base64"].as_str().map(str::to_string),
                        )
                    };
                    json!({
                        "op": op, "label": label, "error": null,
                        "size": size, "sha256": sha,
                        "tarSize": tar.len(), "tarSha256": sha256(&tar),
                        "base64": b64,
                    })
                }
            }
        }
        "buildPair" => {
            let files = files_of(&step["files"]);
            let mut reversed = files.clone();
            reversed.reverse();
            let one = build_overlay_tar_gz(&files).unwrap();
            let two = build_overlay_tar_gz(&reversed).unwrap();
            let same = golden["sha256"].as_str() == Some(&sha256(&one));
            if same {
                compressed.identical += 1;
            } else {
                compressed.differing += 1;
            }
            let (size, sha) = if same {
                (one.len(), sha256(&one))
            } else {
                (
                    golden["size"].as_u64().unwrap() as usize,
                    golden["sha256"].as_str().unwrap().to_string(),
                )
            };
            json!({"op": op, "identical": one == two, "size": size, "sha256": sha})
        }
        "buildHeader" => {
            let arc = build_overlay_tar_gz(&files_of(&step["files"])).unwrap();
            let tar = gunzip_all(&arc);
            let h = &tar[..512];
            json!({
                "op": op,
                "gzipMtime": u32::from_le_bytes(arc[4..8].try_into().unwrap()),
                "gzipOsByte": arc[9],
                "tarLengthModulo10240": tar.len() % 10240,
                "tarSize": tar.len(),
                "tarSha256": sha256(&tar),
                "firstEntry": {
                    "name": c_string(h, 0, 100),
                    "mode": c_string(h, 100, 8),
                    "uid": c_string(h, 108, 8),
                    "gid": c_string(h, 116, 8),
                    "size": c_string(h, 124, 12),
                    "mtime": c_string(h, 136, 12),
                    "checksum": latin1(&h[148..156]),
                    "typeflag": latin1(&h[156..157]),
                    "linkname": c_string(h, 157, 100),
                    "magic": latin1(&h[257..263]),
                    "version": latin1(&h[263..265]),
                    "unameAndGnameAreZero": h[265..329].iter().all(|&b| b == 0),
                    "prefixIsZero": h[345..500].iter().all(|&b| b == 0),
                },
            })
        }
        "roundTrip" => {
            let files = files_of(&step["files"]);
            let out = read_overlay_tar_gz(
                &build_overlay_tar_gz(&files).unwrap(),
                &expected_of(&step["expected"]),
                step["cap"].as_u64().unwrap(),
            )
            .unwrap();
            let exact = files.iter().all(|f| {
                out.iter()
                    .find(|(path, _)| *path == f.path)
                    .is_some_and(|(_, data)| *data == f.data)
            });
            json!({"op": op, "files": listing(&out), "byteExact": exact})
        }
        "read" => {
            let label = step["label"].clone();
            match read_overlay_tar_gz(
                &base64_decode(step["archiveBase64"].as_str().unwrap()),
                &expected_of(&step["expected"]),
                step["cap"].as_u64().unwrap(),
            ) {
                Ok(out) => json!({"op": op, "label": label, "ok": true, "files": listing(&out)}),
                Err(message) => {
                    json!({"op": op, "label": label, "ok": false, "message": normalise_message(&message)})
                }
            }
        }
        other => panic!("unknown step op {other}"),
    }
}

/// The text inside the parentheses of a gunzip failure is the decoder's own (`deltas.json`): the golden
/// holds a token, and the replay requires a non-empty message and the closing parenthesis.
fn normalise_message(message: &str) -> String {
    const HEAD: &str = "overlay archive: gunzip failed or exceeded";
    if !message.starts_with(HEAD) {
        return message.to_string();
    }
    let open = message
        .find(" bytes (")
        .unwrap_or_else(|| panic!("a gunzip failure without its parenthesis: {message:?}"));
    let inner = &message[open + " bytes (".len()..];
    let inner = inner
        .strip_suffix(')')
        .unwrap_or_else(|| panic!("no closing parenthesis: {message:?}"));
    assert!(!inner.is_empty(), "an empty decoder message: {message:?}");
    format!("{} bytes (<ZLIB-MESSAGE>)", &message[..open])
}

fn load_cases() -> Vec<Value> {
    match read_json(&golden_dir().join("cases.json")) {
        Value::Array(cases) => cases,
        other => panic!("cases.json is not an array: {other}"),
    }
}

#[test]
fn every_overlay_archive_golden_replays() {
    let cases = load_cases();
    let mut compared = 0usize;
    let mut compressed = Compressed::default();
    let mut failures = Vec::new();
    for case in &cases {
        let id = case["id"].as_str().unwrap();
        let want = read_json(&golden_dir().join("expected").join(id).join("result.json"));
        let want_steps = want["steps"].as_array().unwrap();
        let steps = case["steps"].as_array().unwrap();
        assert_eq!(steps.len(), want_steps.len(), "{id}: step count");
        let got: Vec<Value> = steps
            .iter()
            .zip(want_steps)
            .map(|(step, golden)| run_step(step, &mut compressed, golden))
            .collect();
        let got = json!({ "steps": got });
        if got != want {
            failures.push(format!("{id}:\n  want {want}\n  got  {got}"));
        }
        compared += 1;
    }
    assert!(
        failures.is_empty(),
        "{} differences over {compared} cases:\n{}",
        failures.len(),
        failures.join("\n")
    );
    check_floor(
        "golden/overlay_archive cases compared",
        compared,
        OVERLAY_ARCHIVE_FLOOR,
    )
    .unwrap();
    // The "same" branch compares the replay with itself, so it proves nothing unless at least one case
    // reproduced the recorded gzip bytes. Without this a writer that never matches Node's zlib (a changed
    // level, strategy or header) passes by copying every compressed field out of the golden (WR-08). The
    // compressed bytes are not otherwise compared against anything independent of the golden.
    assert!(
        compressed.identical >= 1,
        "no case reproduced the recorded gzip bytes; the compressed comparison is vacuous"
    );
    println!(
        "compared {compared} overlay archive cases; compressed bytes identical to the golden in {}, \
         differing (tar compared instead) in {}",
        compressed.identical, compressed.differing
    );
}

#[test]
fn a_written_archive_is_accepted_by_the_strict_reader_whatever_its_deflate_bytes() {
    // The compressed bytes depend on the deflate implementation (`deltas.json`), so this is what holds
    // everywhere: whatever the writer produced is a gzip stream of the golden's tar and the reader takes it.
    for case in load_cases() {
        for step in case["steps"].as_array().unwrap() {
            if step["op"] != "build" {
                continue;
            }
            let files = files_of(&step["files"]);
            let Ok(out) = build_overlay_tar_gz(&files) else {
                continue;
            };
            let expected: Vec<(String, u64)> = files
                .iter()
                .map(|f| (f.path.clone(), f.data.len() as u64))
                .collect();
            let back = read_overlay_tar_gz(&out, &expected, 16 * 1024 * 1024)
                .unwrap_or_else(|e| panic!("{}: {e}", case["id"]));
            assert_eq!(back.len(), files.len());
            for f in &files {
                assert!(back.iter().any(|(p, d)| *p == f.path && *d == f.data));
            }
        }
    }
}

#[test]
fn the_floor_matches_the_manifest_and_an_empty_list_fails() {
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    let cases = load_cases();
    assert_eq!(manifest["count"].as_u64(), Some(cases.len() as u64));
    assert_eq!(
        manifest["floor"].as_u64(),
        Some(OVERLAY_ARCHIVE_FLOOR as u64)
    );
    assert!(OVERLAY_ARCHIVE_FLOOR <= cases.len());
    assert!(
        cases.len() >= 19,
        "{} cases, below the plan's 19",
        cases.len()
    );
    let ids: std::collections::BTreeSet<&str> =
        cases.iter().map(|c| c["id"].as_str().unwrap()).collect();
    assert_eq!(ids.len(), cases.len(), "case ids repeat");
    let folders = std::fs::read_dir(golden_dir().join("expected"))
        .unwrap()
        .count();
    assert_eq!(folders, cases.len(), "one expected folder per case");
    let err = check_floor("golden/overlay_archive cases", 0, OVERLAY_ARCHIVE_FLOOR).unwrap_err();
    assert!(err.contains("below the floor"), "{err}");
}

#[test]
fn every_rejection_the_goldens_record_is_a_message_of_the_reader() {
    // The strict reader's closed set of refusals: nothing else is ever said, and none carries a path of
    // the machine (the only names in a message are the archive entry's own).
    let known = [
        "overlay archive: gunzip failed or exceeded",
        "overlay archive: bad header checksum",
        "overlay archive: not a POSIX ustar entry",
        "overlay archive: unsupported entry type",
        "overlay archive: ustar prefix field is not allowed",
        "overlay archive: bad size field",
        "overlay archive: unexpected path:",
        "overlay archive: duplicate path:",
        "overlay archive: entry larger than expected:",
        "overlay archive: truncated data for",
        "overlay archive: missing expected path:",
        "overlay archive: absolute path:",
        "overlay archive: backslash in path:",
        "overlay archive: non-ASCII path:",
        "overlay archive: path too long:",
        "overlay archive: empty path segment:",
        "overlay archive: \".\" path segment:",
        "overlay archive: \"..\" path segment:",
        "overlay archive: empty path:",
    ];
    let mut seen = 0usize;
    for case in load_cases() {
        let id = case["id"].as_str().unwrap();
        let want = read_json(&golden_dir().join("expected").join(id).join("result.json"));
        for step in want["steps"].as_array().unwrap() {
            if step["ok"] == json!(false) {
                let message = step["message"].as_str().unwrap();
                assert!(
                    known.iter().any(|k| message.starts_with(k)),
                    "{id}: {message}"
                );
                seen += 1;
            }
        }
    }
    assert!(seen >= 15, "only {seen} recorded rejections");
}
