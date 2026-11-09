//! verify_only, select_files, shared-redist and the manifest summary op over the synthetic CDN.

#[allow(dead_code)]
#[path = "support/encode.rs"]
mod encode;
#[allow(dead_code)]
#[path = "support/fake_cdn.rs"]
mod fake_cdn;
#[allow(dead_code)]
#[path = "support/fake_host.rs"]
mod fake_host;
#[allow(dead_code)]
#[path = "support/fixture_builder.rs"]
mod fixture_builder;

use fake_cdn::{FakeCdn, Reply};
use fake_host::FakeHost;
use fixture_builder::{all_cases, render, Codec, FixtureCase, FixtureDepot, FixtureFile, Wrapper};
use gamelib_depot::job::{DepotJob, JobEventBody};
use gamelib_depot::outcome::{Outcome, Status};
use gamelib_depot::{registry, run_job, JobContext, JobHost};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

struct Env {
    _rt: tokio::runtime::Runtime,
    cdn: FakeCdn,
    dir: tempfile::TempDir,
    host: Arc<FakeHost>,
    case_json: Value,
    installdir: String,
    app_id: String,
}

impl Env {
    fn steamapps(&self) -> PathBuf {
        self.dir.path().join("steamapps")
    }
    fn root(&self) -> PathBuf {
        self.steamapps().join("common").join(&self.installdir)
    }
    fn ctx(&self) -> JobContext {
        JobContext {
            cache_dir: self.dir.path().join("cache"),
        }
    }
    fn depots(&self) -> Vec<Value> {
        self.case_json["depots"]
            .as_array()
            .unwrap()
            .iter()
            .map(|d| {
                json!({
                    "depotId": d["depotId"], "manifestId": d["manifestId"],
                    "requestCode": "123", "key": d["keyHex"],
                    "ownerAppId": self.app_id, "fromManifest": null,
                })
            })
            .collect()
    }
    fn hosts(&self) -> Value {
        json!([{
            "host": self.cdn.host(), "vhost": null, "kind": "SteamCache",
            "httpsSupport": null, "useTokenAuth": false, "weightedLoad": null
        }])
    }
    fn job(&self, job_id: &str, mode: &str, select: Option<Vec<&str>>, finalize: bool) -> DepotJob {
        let fin = if finalize {
            json!({
                "steamappsDir": self.steamapps().to_string_lossy(),
                "installdir": self.installdir,
                "name": "Fixture", "buildid": "1001",
                "lastOwner": "76561197960265728", "allowFullOwnership": true
            })
        } else {
            Value::Null
        };
        serde_json::from_value(json!({
            "jobId": job_id, "mode": mode, "appId": self.app_id,
            "installRoot": self.root().to_string_lossy(),
            "depots": self.depots(), "hosts": self.hosts(),
            "selectPaths": select, "finalize": fin, "limits": null
        }))
        .unwrap()
    }
    fn events(&self) -> Vec<gamelib_depot::JobEvent> {
        self.host.emits.lock().unwrap().clone()
    }
    fn acf(&self) -> String {
        std::fs::read_to_string(
            self.steamapps()
                .join(format!("appmanifest_{}.acf", self.app_id)),
        )
        .unwrap()
    }
    fn run(&self, job: DepotJob) -> Outcome {
        run_job(job, &self.ctx(), self.host.clone() as Arc<dyn JobHost>)
    }
    fn chunk_hits(&self) -> Vec<String> {
        self.cdn
            .hits()
            .into_iter()
            .map(|h| h.target)
            .filter(|t| t.contains("/chunk/"))
            .collect()
    }
    fn script_chunks(&self, case: &FixtureCase) {
        let depot_ids: Vec<String> = self
            .depots()
            .iter()
            .map(|d| d["depotId"].as_str().unwrap().to_string())
            .collect();
        for (rel, bytes) in &render(case) {
            if let Some(sha) = rel
                .strip_prefix("chunks/")
                .and_then(|r| r.strip_suffix(".bin"))
            {
                for d in &depot_ids {
                    self.cdn.script(
                        &format!("/depot/{d}/chunk/{sha}"),
                        vec![Reply::Status(200, bytes.clone())],
                    );
                }
            }
        }
    }
}

fn setup(case: &FixtureCase) -> Env {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let cdn = rt.block_on(FakeCdn::start());
    let files = render(case);
    let case_json: Value = serde_json::from_slice(&files["case.json"]).unwrap();
    let env = Env {
        _rt: rt,
        cdn,
        dir: tempfile::tempdir().unwrap(),
        host: Arc::new(FakeHost::new()),
        installdir: case.name.to_string(),
        app_id: case.app_id.to_string(),
        case_json,
    };
    env.script_chunks(case);
    for (rel, bytes) in &files {
        if let Some(stem) = rel
            .strip_prefix("manifests/")
            .and_then(|r| r.strip_suffix(".bin"))
        {
            let (d, g) = stem.split_once('_').unwrap();
            env.cdn.script(
                &format!("/depot/{d}/manifest/{g}/5/123"),
                vec![Reply::Status(200, bytes.clone())],
            );
        }
    }
    env
}

fn case_named(name: &str) -> FixtureCase {
    all_cases().into_iter().find(|c| c.name == name).unwrap()
}

fn custom_case(name: &'static str, app_id: u32, files: Vec<FixtureFile>) -> FixtureCase {
    FixtureCase {
        name,
        app_id,
        mode: "install",
        install_root: name,
        finalize: None,
        depots: vec![FixtureDepot {
            depot_id: app_id + 1,
            gid: 7_200_000_000_000_000_000 + u64::from(app_id),
            wrapper: Wrapper::Zip,
            encrypt_names: false,
            files,
        }],
    }
}

fn wait_for(what: &str, mut cond: impl FnMut() -> bool) {
    for _ in 0..400 {
        if cond() {
            return;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    panic!("timed out waiting for {what}");
}

fn files_under(root: &Path) -> Vec<String> {
    fn walk(base: &Path, dir: &Path, out: &mut Vec<String>) {
        for e in std::fs::read_dir(dir).unwrap() {
            let p = e.unwrap().path();
            let m = std::fs::symlink_metadata(&p).unwrap();
            if m.is_dir() {
                walk(base, &p, out);
            } else {
                out.push(
                    p.strip_prefix(base)
                        .unwrap()
                        .to_string_lossy()
                        .replace('\\', "/"),
                );
            }
        }
    }
    let mut v = Vec::new();
    if root.exists() {
        walk(root, root, &mut v);
    }
    v.sort();
    v
}

fn install_zip() -> (FixtureCase, Env) {
    let case = case_named("zip-deflate");
    let env = setup(&case);
    let out = env.run(env.job("jm-install", "install", None, true));
    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    (case, env)
}

#[test]
fn verify_only_fetches_nothing() {
    let (_case, env) = install_zip();
    let before = env.chunk_hits().len();
    assert!(before > 0);
    let out = env.run(env.job("jm-verify", "verify_only", None, true));
    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    assert_eq!(out.missing, Some(vec![]));
    assert!(out.all_files_verified && out.all_modes_applied);
    assert_eq!(env.chunk_hits().len(), before, "verify fetched a chunk");
    assert_eq!(out.stats.chunks_fetched, 0);
    assert!(env.acf().contains("\"StateFlags\"\t\t\"4\""));
    assert_eq!(out.acf.as_ref().unwrap().state_flags, "4");
}

#[test]
fn verify_only_reports_missing_and_writes_1026() {
    let (_case, env) = install_zip();
    std::fs::remove_file(env.root().join("readme.txt")).unwrap();
    let stored = env.root().join("data/stored.bin");
    let len = std::fs::metadata(&stored).unwrap().len() as usize;
    std::fs::write(&stored, vec![0x5au8; len]).unwrap();
    let before = env.chunk_hits().len();

    let out = env.run(env.job("jm-verify-bad", "verify_only", None, true));
    let mut missing = out.missing.clone().unwrap();
    missing.sort();
    assert_eq!(missing, vec!["data/stored.bin", "readme.txt"]);
    assert!(!out.all_files_verified);
    assert_eq!(env.chunk_hits().len(), before, "verify fetched a chunk");
    assert!(
        !env.root().join("readme.txt").exists(),
        "verify must not repair"
    );
    assert!(env.acf().contains("\"StateFlags\"\t\t\"1026\""));
    assert_eq!(out.acf.as_ref().unwrap().state_flags, "1026");
}

#[test]
fn verify_only_without_finalize_reports_missing_and_writes_no_acf() {
    // 73-19: the shared-redist cache check runs verify_only with finalize null.
    let (_case, env) = install_zip();
    let acf_before = env.acf();
    std::fs::remove_file(env.root().join("readme.txt")).unwrap();
    let before = env.chunk_hits().len();
    let out = env.run(env.job("jm-verify-nofin", "verify_only", None, false));
    assert_eq!(out.missing, Some(vec!["readme.txt".to_string()]));
    assert!(out.acf.is_none());
    assert_eq!(env.chunk_hits().len(), before, "verify fetched a chunk");
    assert_eq!(
        env.acf(),
        acf_before,
        "verify without finalize rewrote the ACF"
    );
}

#[test]
fn cancel_resume_fetches_only_missing() {
    let a: Vec<u8> = (0..3_000).map(|i| (i * 11 % 241) as u8).collect();
    let b: Vec<u8> = (0..3_000).map(|i| (i * 13 % 239) as u8).collect();
    let app_id = 920_000u32;
    let case = custom_case(
        "cancel-resume",
        app_id,
        vec![
            FixtureFile::new("a.bin", a.clone(), 1000, Codec::Vz),
            FixtureFile::new("b.bin", b.clone(), 1000, Codec::Vz),
        ],
    );
    let env = setup(&case);
    let sha_of = |piece: &[u8]| -> String {
        use sha1::{Digest, Sha1};
        Sha1::digest(piece)
            .iter()
            .map(|x| format!("{x:02x}"))
            .collect()
    };
    let b_targets: Vec<String> = b
        .chunks(1000)
        .map(|p| format!("/depot/{}/chunk/{}", app_id + 1, sha_of(p)))
        .collect();
    for t in &b_targets {
        env.cdn.script(t, vec![Reply::Hang]);
    }
    let job = env.job("jm-cancel", "install", None, true);
    let first = std::thread::scope(|s| {
        let h = s.spawn(|| env.run(job));
        wait_for("a.bin to land", || {
            std::fs::read(env.root().join("a.bin")).is_ok_and(|v| v == a)
        });
        wait_for("b.bin to be opened", || env.root().join("b.bin").exists());
        std::thread::sleep(Duration::from_millis(100));
        assert!(registry::cancel("jm-cancel"));
        h.join().unwrap()
    });
    assert_eq!(first.status, Status::Cancelled);

    env.script_chunks(&case);
    let baseline = env.chunk_hits().len();
    let out = env.run(env.job("jm-resume", "install", None, true));
    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    assert_eq!(std::fs::read(env.root().join("b.bin")).unwrap(), b);
    let new_hits: Vec<String> = env.chunk_hits().split_off(baseline);
    assert_eq!(new_hits.len(), 3, "{new_hits:?}");
    assert!(
        new_hits.iter().all(|t| b_targets.contains(t)),
        "{new_hits:?}"
    );
    assert!(env.acf().contains("\"StateFlags\"\t\t\"4\""));
}

#[test]
fn redist_job_writes_no_acf() {
    let case = case_named("shared-redist");
    let env = setup(&case);
    let out = env.run(env.job("jm-redist", "install", None, false));
    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    assert!(out.acf.is_none());
    assert!(env.root().join("redist/setup.dat").is_file());
    let all = files_under(env.dir.path());
    assert!(
        all.iter()
            .all(|f| !f.contains("appmanifest_") && !f.ends_with(".acf")),
        "{all:?}"
    );
}

#[test]
fn select_files_writes_only_selected() {
    let case = case_named("zip-deflate");
    let env = setup(&case);
    let out = env.run(env.job(
        "jm-select",
        "select_files",
        Some(vec!["DATA\\Multi.bin", "/readme.txt", "nope/missing.txt"]),
        false,
    ));
    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    assert_eq!(
        files_under(&env.root()),
        vec!["data/multi.bin", "readme.txt"]
    );
    assert!(out.acf.is_none());
    let files = out.files.clone().unwrap();
    assert_eq!(files.len(), 2);
    let multi = case.depots[0]
        .files
        .iter()
        .find(|f| f.path == "data/multi.bin")
        .unwrap();
    let got = files
        .iter()
        .find(|f| f.filename == "data/multi.bin")
        .unwrap();
    assert_eq!(got.size, multi.content.len() as u64);
    {
        use sha1::{Digest, Sha1};
        let want: String = Sha1::digest(&multi.content)
            .iter()
            .map(|x| format!("{x:02x}"))
            .collect();
        assert_eq!(got.sha1, want);
    }
    assert!(env.events().iter().any(|e| matches!(
        &e.body,
        JobEventBody::Warning { message, .. } if message.contains("1 selected path(s)")
    )));
    assert!(!env.steamapps().join("appmanifest_900001.acf").exists());
}

#[test]
fn summarize_matches_steam_api_and_omits_files() {
    let case = custom_case(
        "summary",
        920_100,
        vec![
            FixtureFile::new("Bin\\Steam_API.dll", vec![1u8; 100], 1000, Codec::Vz),
            FixtureFile::new("system\\steam_api64.dll", vec![2u8; 200], 1000, Codec::Vz),
            FixtureFile::new("backup/steam_api.dll.bak", vec![3u8; 50], 1000, Codec::Vz),
            FixtureFile::new("readme.txt", vec![4u8; 25], 1000, Codec::Vz),
            FixtureFile::directory("bin"),
        ],
    );
    let env = setup(&case);
    let args = json!({
        "appId": env.app_id, "depots": env.depots(), "hosts": env.hosts(),
        "patterns": ["steam_api.dll", "STEAM_API64.DLL"]
    });
    let v = gamelib_depot::dispatch(
        "depot_manifest_summary",
        &args,
        &env.ctx(),
        env.host.clone() as Arc<dyn JobHost>,
    )
    .unwrap();
    assert!(v.get("files").is_none() && v.get("error").is_none(), "{v}");
    let d = &v["depots"][0];
    assert_eq!(d["depotId"], (920_101).to_string());
    assert_eq!(d["fileCount"], 4);
    assert_eq!(d["totalBytes"], 375);
    assert_eq!(
        d["matches"],
        json!(["bin/steam_api.dll", "system/steam_api64.dll"])
    );
    assert!(d.get("files").is_none());
    assert!(env.chunk_hits().is_empty(), "summary never fetches chunks");

    let bad = gamelib_depot::dispatch(
        "depot_manifest_summary",
        &json!({"appId": "x"}),
        &env.ctx(),
        env.host.clone() as Arc<dyn JobHost>,
    );
    assert_eq!(bad, Err("depot_manifest_summary:bad-args".to_string()));
}
