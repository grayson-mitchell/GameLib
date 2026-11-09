//! Tier 1 parity (D-14): the Rust pipeline over every synthetic fixture case must produce the
//! tree, modes, ACF text and outcome flags the TS oracle recorded in `expected.json`.
//! Failure output lists paths and field names only, never file bytes.

#[allow(dead_code)]
#[path = "support/fake_cdn.rs"]
mod fake_cdn;
#[allow(dead_code)]
#[path = "support/fake_host.rs"]
mod fake_host;

use fake_cdn::{FakeCdn, Reply};
use fake_host::FakeHost;
use gamelib_depot::job::DepotJob;
use gamelib_depot::post::probe_case_insensitive;
use gamelib_depot::{run_job, JobContext, JobHost};
use serde_json::{json, Map, Value};
use sha1::{Digest, Sha1};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

const EXPECTED: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/tests/fixtures/expected.json"
));

fn cases_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/cases")
}

/// Windows records the ReadOnly attribute, not modes: both sides collapse to read-only or not.
#[cfg(windows)]
fn mode_of(m: u64) -> u64 {
    if m & 0o200 == 0 {
        0o444
    } else {
        0o644
    }
}

fn collect_tree(root: &Path, acf_rel: Option<&str>) -> Vec<Value> {
    fn walk(base: &Path, dir: &Path, acf_rel: Option<&str>, out: &mut Vec<Value>) {
        let mut names: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        for name in names {
            let full = dir.join(&name);
            let rel = full
                .strip_prefix(base)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            let md = fs::symlink_metadata(&full).unwrap();
            if md.file_type().is_symlink() {
                out.push(json!({
                    "path": rel, "kind": "symlink",
                    "target": fs::read_link(&full).unwrap().to_string_lossy(),
                }));
            } else if md.is_dir() {
                out.push(json!({"path": rel, "kind": "dir"}));
                walk(base, &full, acf_rel, out);
            } else {
                let mut e = Map::new();
                e.insert("path".into(), json!(rel));
                e.insert("kind".into(), json!("file"));
                if acf_rel != Some(rel.as_str()) {
                    e.insert("size".into(), json!(md.len()));
                    let sha: String = Sha1::digest(fs::read(&full).unwrap())
                        .iter()
                        .map(|b| format!("{b:02x}"))
                        .collect();
                    e.insert("sha1".into(), json!(sha));
                }
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    e.insert(
                        "mode".into(),
                        json!(u64::from(md.permissions().mode() & 0o7777)),
                    );
                }
                #[cfg(windows)]
                {
                    let ro = md.permissions().readonly();
                    e.insert("mode".into(), json!(if ro { 0o444 } else { 0o644 }));
                }
                out.push(Value::Object(e));
            }
        }
    }
    let mut out = Vec::new();
    walk(root, root, acf_rel, &mut out);
    out
}

#[cfg(windows)]
fn normalise_expected_modes(tree: &mut [Value]) {
    for e in tree {
        if let Some(m) = e.get("mode").and_then(Value::as_u64) {
            e["mode"] = json!(mode_of(m));
        }
    }
}
#[cfg(not(windows))]
fn normalise_expected_modes(_tree: &mut [Value]) {}

fn normalise_acf(text: &str) -> String {
    let key = "\"LastUpdated\"";
    let Some(at) = text.find(key) else {
        return text.to_string();
    };
    let after = at + key.len();
    let rest = &text[after..];
    let q1 = rest.find('"').unwrap();
    let q2 = rest[q1 + 1..].find('"').unwrap();
    format!(
        "{}\"<normalised>\"{}",
        &text[..after + q1],
        &rest[q1 + 1 + q2 + 1..]
    )
}

fn run_case(name: &str, expected_case: &Value) -> (Value, Value) {
    let dir = cases_dir().join(name);
    let case_json: Value =
        serde_json::from_slice(&fs::read(dir.join("case.json")).unwrap()).unwrap();
    let app_id = case_json["appId"].as_str().unwrap().to_string();
    let depot_ids: Vec<String> = case_json["depots"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| d["depotId"].as_str().unwrap().to_string())
        .collect();

    let rt = tokio::runtime::Runtime::new().unwrap();
    let cdn = rt.block_on(FakeCdn::start());
    for e in fs::read_dir(dir.join("chunks")).unwrap() {
        let p = e.unwrap().path();
        let sha = p.file_stem().unwrap().to_string_lossy().into_owned();
        let bytes = fs::read(&p).unwrap();
        for d in &depot_ids {
            cdn.script(
                &format!("/depot/{d}/chunk/{sha}"),
                vec![Reply::Status(200, bytes.clone())],
            );
        }
    }
    for e in fs::read_dir(dir.join("manifests")).unwrap() {
        let p = e.unwrap().path();
        let stem = p.file_stem().unwrap().to_string_lossy().into_owned();
        let (d, g) = stem.split_once('_').unwrap();
        cdn.script(
            &format!("/depot/{d}/manifest/{g}/5/123"),
            vec![Reply::Status(200, fs::read(&p).unwrap())],
        );
    }

    let tmp = tempfile::tempdir().unwrap();
    let steamapps = tmp.path().join("steamapps");
    let fin = &case_json["finalize"];
    let installdir = fin["installdir"]
        .as_str()
        .unwrap_or_else(|| case_json["installRoot"].as_str().unwrap())
        .to_string();
    let root = steamapps.join("common").join(&installdir);
    fs::create_dir_all(&root).unwrap();

    let depots: Vec<Value> = case_json["depots"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| {
            json!({
                "depotId": d["depotId"], "manifestId": d["manifestId"],
                "requestCode": "123", "key": d["keyHex"],
                "ownerAppId": app_id, "fromManifest": null,
            })
        })
        .collect();
    let finalize = if fin.is_null() {
        Value::Null
    } else {
        json!({
            "steamappsDir": steamapps.to_string_lossy(),
            "installdir": installdir,
            "name": fin["name"], "buildid": fin["buildid"],
            "lastOwner": fin["lastOwner"],
            "allowFullOwnership": fin["allowFullOwnership"],
        })
    };
    let job: DepotJob = serde_json::from_value(json!({
        "jobId": format!("golden-{name}"), "mode": "install", "appId": app_id,
        "installRoot": root.to_string_lossy(),
        "depots": depots,
        "hosts": [{
            "host": cdn.host(), "vhost": null, "kind": "SteamCache",
            "httpsSupport": null, "useTokenAuth": false, "weightedLoad": null
        }],
        "selectPaths": null, "finalize": finalize, "limits": null
    }))
    .unwrap();

    // Choose the collision variant by the volume the job really runs on.
    let case_insensitive = probe_case_insensitive(&root).unwrap();
    let want = if let Some(v) = expected_case.get("variants") {
        let key = if case_insensitive {
            "caseInsensitive"
        } else {
            "caseSensitive"
        };
        v[key].clone()
    } else {
        expected_case["result"].clone()
    };
    assert!(
        want.is_object(),
        "{name}: no expected variant for this volume"
    );

    let cache = tempfile::tempdir().unwrap();
    let ctx = JobContext {
        cache_dir: cache.path().to_path_buf(),
    };
    let host = Arc::new(FakeHost::new());
    let out = run_job(job, &ctx, host as Arc<dyn JobHost>);
    drop(rt);

    let acf_rel = (!fin.is_null()).then(|| format!("steamapps/appmanifest_{app_id}.acf"));
    let tree = collect_tree(tmp.path(), acf_rel.as_deref());
    let mut acf = Value::Null;
    let mut state_flags = None;
    if let Some(rel) = &acf_rel {
        let text = fs::read_to_string(tmp.path().join(rel)).unwrap();
        state_flags = text
            .split("\"StateFlags\"")
            .nth(1)
            .and_then(|r| r.split('"').nth(1))
            .map(str::to_string);
        acf = json!(normalise_acf(&text));
    }
    let mut failures: Vec<String> = out
        .failures
        .iter()
        .map(|f| f.file.clone().unwrap_or_default())
        .collect();
    failures.sort();
    let mut got = json!({
        "tree": tree, "acf": acf,
        "outcome": serde_json::to_value(out.status).unwrap(),
        "allFilesVerified": out.all_files_verified,
        "allModesApplied": out.all_modes_applied,
        "failures": failures,
    });
    if let Some(sf) = state_flags {
        got["stateFlags"] = json!(sf);
    }
    (want, got)
}

/// Paths and field names only; never file bytes.
fn diff(name: &str, want: &Value, got: &Value) -> Vec<String> {
    let mut out = Vec::new();
    for k in [
        "acf",
        "outcome",
        "allFilesVerified",
        "allModesApplied",
        "failures",
        "stateFlags",
    ] {
        if want.get(k) != got.get(k) {
            out.push(format!(
                "{name}: field `{k}` differs: want {} got {}",
                want.get(k).unwrap_or(&Value::Null),
                got.get(k).unwrap_or(&Value::Null)
            ));
        }
    }
    let by_path = |v: &Value| -> Vec<(String, Value)> {
        v["tree"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| (e["path"].as_str().unwrap().to_string(), e.clone()))
            .collect()
    };
    let (w, g) = (by_path(want), by_path(got));
    for (p, e) in &w {
        match g.iter().find(|(gp, _)| gp == p) {
            None => out.push(format!("{name}: tree path missing in Rust: {p}")),
            Some((_, ge)) if ge != e => {
                let fields: Vec<&str> = ["kind", "size", "sha1", "mode", "target"]
                    .into_iter()
                    .filter(|f| e.get(*f) != ge.get(*f))
                    .collect();
                out.push(format!("{name}: tree entry {p} differs in {fields:?}"));
            }
            _ => {}
        }
    }
    for (p, _) in &g {
        if !w.iter().any(|(wp, _)| wp == p) {
            out.push(format!("{name}: tree path only in Rust: {p}"));
        }
    }
    if out.is_empty() && want["tree"] != got["tree"] {
        out.push(format!(
            "{name}: tree entries equal but ordered differently"
        ));
    }
    out
}

#[test]
fn rust_matches_ts_oracle_on_every_case() {
    let expected: Value = serde_json::from_str(EXPECTED).unwrap();
    let cases = expected["cases"].as_object().unwrap();
    let mut on_disk: Vec<String> = fs::read_dir(cases_dir())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    on_disk.sort();
    let mut keys: Vec<String> = cases.keys().cloned().collect();
    keys.sort();
    assert_eq!(on_disk, keys, "fixture cases and expected.json disagree");

    let mut compared = 0;
    let mut problems = Vec::new();
    for (name, case) in cases {
        let (mut want, got) = run_case(name, case);
        normalise_expected_modes(want["tree"].as_array_mut().unwrap());
        assert!(
            case.get("rustOverride").is_none(),
            "{name}: rustOverride needs a user-reviewed divergenceNote"
        );
        problems.extend(diff(name, &want, &got));
        compared += 1;
    }
    assert!(compared >= 7, "only {compared} cases compared");
    assert!(
        problems.is_empty(),
        "parity failures:\n{}",
        problems.join("\n")
    );
}
