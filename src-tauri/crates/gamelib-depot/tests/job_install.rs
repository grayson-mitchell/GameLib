//! End-to-end install jobs over the synthetic fixtures, served by the local fake CDN.
//! `run_job` blocks, so the CDN lives on its own runtime owned by the test.

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
use gamelib_depot::outcome::{ErrorKind, Outcome, Status};
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
    /// Every chunk request target served for this case.
    chunk_targets: Vec<String>,
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
    fn job(&self, job_id: &str, from_manifest: Value) -> DepotJob {
        let depots: Vec<Value> = self.case_json["depots"]
            .as_array()
            .unwrap()
            .iter()
            .map(|d| {
                json!({
                    "depotId": d["depotId"], "manifestId": d["manifestId"],
                    "requestCode": "123", "key": d["keyHex"],
                    "ownerAppId": self.app_id, "fromManifest": from_manifest,
                })
            })
            .collect();
        serde_json::from_value(json!({
            "jobId": job_id, "mode": "install", "appId": self.app_id,
            "installRoot": self.root().to_string_lossy(),
            "depots": depots,
            "hosts": [{
                "host": self.cdn.host(), "vhost": null, "kind": "SteamCache",
                "httpsSupport": null, "useTokenAuth": false, "weightedLoad": null
            }],
            "selectPaths": null,
            "finalize": {
                "steamappsDir": self.steamapps().to_string_lossy(),
                "installdir": self.installdir,
                "name": "Fixture", "buildid": "1001",
                "lastOwner": "76561197960265728", "allowFullOwnership": true
            },
            "limits": null
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
}

fn setup(case: &FixtureCase) -> Env {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let cdn = rt.block_on(FakeCdn::start());
    let files = render(case);
    let case_json: Value = serde_json::from_slice(&files["case.json"]).unwrap();
    let depot_ids: Vec<String> = case_json["depots"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| d["depotId"].as_str().unwrap().to_string())
        .collect();
    let mut chunk_targets = Vec::new();
    for (rel, bytes) in &files {
        if let Some(sha) = rel
            .strip_prefix("chunks/")
            .and_then(|r| r.strip_suffix(".bin"))
        {
            for d in &depot_ids {
                let t = format!("/depot/{d}/chunk/{sha}");
                cdn.script(&t, vec![Reply::Status(200, bytes.clone())]);
                chunk_targets.push(t);
            }
        } else if rel.starts_with("manifests/") {
            let stem = rel
                .strip_prefix("manifests/")
                .unwrap()
                .strip_suffix(".bin")
                .unwrap();
            let (d, g) = stem.split_once('_').unwrap();
            cdn.script(
                &format!("/depot/{d}/manifest/{g}/5/123"),
                vec![Reply::Status(200, bytes.clone())],
            );
        }
    }
    Env {
        _rt: rt,
        cdn,
        dir: tempfile::tempdir().unwrap(),
        host: Arc::new(FakeHost::new()),
        installdir: case.name.to_string(),
        app_id: case.app_id.to_string(),
        case_json,
        chunk_targets,
    }
}

fn case_named(name: &str) -> FixtureCase {
    all_cases().into_iter().find(|c| c.name == name).unwrap()
}

fn tree(root: &Path) -> Vec<(String, u64, std::time::SystemTime)> {
    fn walk(base: &Path, dir: &Path, out: &mut Vec<(String, u64, std::time::SystemTime)>) {
        for e in std::fs::read_dir(dir).unwrap() {
            let p = e.unwrap().path();
            let m = std::fs::symlink_metadata(&p).unwrap();
            let rel = p.strip_prefix(base).unwrap().to_string_lossy().to_string();
            out.push((rel, m.len(), m.modified().unwrap()));
            if m.is_dir() {
                walk(base, &p, out);
            }
        }
    }
    let mut v = Vec::new();
    walk(root, root, &mut v);
    v.sort();
    v
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

fn progress_events(env: &Env) -> Vec<u64> {
    env.events()
        .iter()
        .filter_map(|e| match e.body {
            JobEventBody::Progress { elapsed_ms, .. } => Some(elapsed_ms),
            _ => None,
        })
        .collect()
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
            gid: 7_100_000_000_000_000_000 + u64::from(app_id),
            wrapper: Wrapper::Zip,
            encrypt_names: false,
            files,
        }],
    }
}

#[test]
fn install_zip_deflate_matches_fixture() {
    let case = case_named("zip-deflate");
    let env = setup(&case);
    let out = env.run(env.job("ji-zip", Value::Null));

    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    assert!(out.failures.is_empty());
    assert!(out.all_files_verified && out.all_modes_applied);
    assert_eq!(out.attempted_depots.len(), 1);
    for f in &case.depots[0].files {
        let p = env.root().join(&f.path);
        if f.flags & fixture_builder::DIRECTORY_FLAG != 0 {
            assert!(p.is_dir(), "{}", f.path);
        } else {
            assert_eq!(std::fs::read(&p).unwrap(), f.content, "{}", f.path);
        }
    }
    let acf = env.acf();
    assert!(acf.contains("\"StateFlags\"\t\t\"4\""), "{acf}");
    assert_eq!(out.acf.as_ref().unwrap().state_flags, "4");
    assert!(out.stats.chunks_fetched > 0 && out.stats.containers.pk > 0);

    // First frame is `planned`; seq counts up from the first.
    let evs = env.events();
    assert!(matches!(evs[0].body, JobEventBody::Planned { .. }));
    let seqs: Vec<u64> = evs.iter().map(|e| e.seq).collect();
    assert_eq!(seqs, (0..seqs.len() as u64).collect::<Vec<_>>());
}

#[test]
fn events_throttle_and_heartbeat() {
    // Throttle: 600 chunks must not become 600 progress frames.
    let data: Vec<u8> = (0..30_000).map(|i| (i * 7 % 253) as u8).collect();
    let many = custom_case(
        "many-chunks",
        910_000,
        vec![FixtureFile::new("big.bin", data.clone(), 50, Codec::Vz)],
    );
    let env = setup(&many);
    let out = env.run(env.job("ji-throttle", Value::Null));
    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    assert_eq!(std::fs::read(env.root().join("big.bin")).unwrap(), data);
    let n = progress_events(&env).len();
    assert!(n >= 1, "the end-of-run frame is always sent");
    assert!(n < 300, "{n} progress frames for 600 chunks");

    // Heartbeat: a chunk that never answers still yields a frame every second.
    let hang = custom_case(
        "hanging",
        910_010,
        vec![FixtureFile::new("h.bin", vec![9u8; 600], 300, Codec::Vz)],
    );
    let env = setup(&hang);
    for t in &env.chunk_targets {
        env.cdn.script(t, vec![Reply::Hang]);
    }
    let job = env.job("ji-heartbeat", Value::Null);
    let out = std::thread::scope(|s| {
        let h = s.spawn(|| env.run(job));
        std::thread::sleep(Duration::from_millis(2_600));
        assert!(registry::cancel("ji-heartbeat"));
        h.join().unwrap()
    });
    assert_eq!(out.status, Status::Cancelled);
    let beats = progress_events(&env);
    assert!(beats.len() >= 2, "heartbeats: {beats:?}");
    assert!(
        // The last frame is the forced end-of-run one, so it is exempt from the spacing.
        beats[..beats.len() - 1]
            .windows(2)
            .all(|w| w[1] >= w[0] + 900),
        "heartbeats are about 1 s apart: {beats:?}"
    );
}

/// A + B in one depot; B's chunks never answer. Waits until A is complete and B was requested,
/// then cancels.
fn run_cancel_scenario(name: &'static str, app_id: u32) -> (Env, Outcome) {
    let a: Vec<u8> = (0..3_000).map(|i| (i * 11 % 241) as u8).collect();
    let b: Vec<u8> = (0..3_000).map(|i| (i * 13 % 239) as u8).collect();
    let case = custom_case(
        name,
        app_id,
        vec![
            FixtureFile::new("a.bin", a.clone(), 1000, Codec::Vz),
            FixtureFile::new("b.bin", b.clone(), 1000, Codec::Vz),
        ],
    );
    let env = setup(&case);
    let files = render(&case);
    // Re-script only B's chunks to hang.
    for piece in b.chunks(1000) {
        use sha1::{Digest, Sha1};
        let sha: String = Sha1::digest(piece)
            .iter()
            .map(|x| format!("{x:02x}"))
            .collect();
        assert!(files.contains_key(&format!("chunks/{sha}.bin")));
        env.cdn.script(
            &format!("/depot/{}/chunk/{sha}", app_id + 1),
            vec![Reply::Hang],
        );
    }
    let job = env.job(&format!("ji-{name}"), Value::Null);
    let out = std::thread::scope(|s| {
        let h = s.spawn(|| env.run(job));
        wait_for("a.bin to land", || {
            std::fs::read(env.root().join("a.bin")).is_ok_and(|v| v == a)
        });
        wait_for("b.bin to be opened", || env.root().join("b.bin").exists());
        std::thread::sleep(Duration::from_millis(100));
        assert!(registry::cancel(&format!("ji-{name}")));
        h.join().unwrap()
    });
    (env, out)
}

#[test]
fn cancel_still_finalizes_1026() {
    let (env, out) = run_cancel_scenario("cancel-fin", 910_020);
    assert_eq!(out.status, Status::Cancelled);
    assert!(!out.all_files_verified);
    let acf = env.acf();
    assert!(acf.contains("\"StateFlags\"\t\t\"1026\""), "{acf}");
    assert_eq!(out.acf.as_ref().unwrap().state_flags, "1026");
}

#[test]
fn no_writes_after_return() {
    let (env, _out) = run_cancel_scenario("cancel-quiet", 910_030);
    let before = tree(&env.steamapps());
    std::thread::sleep(Duration::from_millis(200));
    assert_eq!(before, tree(&env.steamapps()));
}

#[test]
fn failed_file_still_finalizes_1026() {
    // Corrupt A's only chunk body on the wire: decode fails, B still lands, the ACF is 1026.
    let a: Vec<u8> = (0..900).map(|i| (i * 3 % 199) as u8).collect();
    let b: Vec<u8> = (0..900).map(|i| (i * 5 % 197) as u8).collect();
    let case = custom_case(
        "fail-fin",
        910_040,
        vec![
            FixtureFile::new("a.bin", a.clone(), 1000, Codec::Vz),
            FixtureFile::new("b.bin", b.clone(), 1000, Codec::Vz),
        ],
    );
    let env = setup(&case);
    {
        use sha1::{Digest, Sha1};
        let sha: String = Sha1::digest(&a)
            .iter()
            .map(|x| format!("{x:02x}"))
            .collect();
        env.cdn.script(
            &format!("/depot/910041/chunk/{sha}"),
            vec![Reply::Status(200, vec![0u8; 64])],
        );
    }
    let out = env.run(env.job("ji-fail", Value::Null));
    assert_eq!(out.status, Status::Error);
    assert_eq!(out.failures[0].file.as_deref(), Some("a.bin"));
    assert_eq!(out.failures[0].kind, ErrorKind::DecodeFailed);
    assert_eq!(std::fs::read(env.root().join("b.bin")).unwrap(), b);
    assert!(env.acf().contains("\"StateFlags\"\t\t\"1026\""));
}

#[test]
fn from_manifest_rejected_without_network() {
    let case = case_named("zip-deflate");
    let env = setup(&case);
    let out = env.run(env.job("ji-delta", json!("5")));
    assert_eq!(out.status, Status::Error);
    assert_eq!(out.failures[0].kind, ErrorKind::DeltaUnsupported);
    assert!(
        env.cdn.hits().is_empty(),
        "no network access before refusal"
    );
    assert!(env.events().is_empty());
    assert!(!env.steamapps().join("appmanifest_900001.acf").exists());
}

#[test]
fn manifests_load_before_any_chunk_and_collisions_warn() {
    let case = case_named("multi-depot-collision");
    let env = setup(&case);
    let out = env.run(env.job("ji-multi", Value::Null));
    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);

    let hits = env.cdn.hits();
    let last_manifest = hits
        .iter()
        .rposition(|h| h.target.contains("/manifest/"))
        .unwrap();
    let first_chunk = hits
        .iter()
        .position(|h| h.target.contains("/chunk/"))
        .unwrap();
    assert!(last_manifest < first_chunk, "manifests before chunks");

    assert!(out.stats.path_collisions >= 1);
    assert!(env.events().iter().any(|e| matches!(
        &e.body,
        JobEventBody::Warning { message, .. } if message.starts_with("cross-depot path collision detected: ")
    )));
}

#[test]
fn dispatch_runs_the_job_op() {
    let case = case_named("zip-deflate");
    let env = setup(&case);
    let job = env.job("ji-dispatch", Value::Null);
    let args = serde_json::to_value(&job).unwrap();
    let v = gamelib_depot::dispatch(
        "depot_job_run",
        &args,
        &env.ctx(),
        env.host.clone() as Arc<dyn JobHost>,
    )
    .unwrap();
    assert_eq!(v["status"], "completed");
    assert_eq!(v["jobId"], "ji-dispatch");
    assert!(gamelib_depot::dispatch(
        "depot_job_run",
        &json!({"nope": 1}),
        &env.ctx(),
        env.host.clone() as Arc<dyn JobHost>
    )
    .is_err());
}

/// Blocked depots ask Node for their request code (`requestCode: null`); the rest keep "123".
fn blocked_env(case: &FixtureCase, blocked: &[&str]) -> Env {
    let mut env = setup(case);
    env.host = Arc::new(
        FakeHost::new()
            .with_codes(vec![Ok(Some("123".into()))])
            .with_blocked(blocked),
    );
    env
}

fn job_asking_node_for(env: &Env, job_id: &str, blocked: &[&str]) -> DepotJob {
    let mut job = env.job(job_id, Value::Null);
    for d in &mut job.depots {
        if blocked.contains(&d.depot_id.as_str()) {
            d.request_code = None;
        }
    }
    job
}

#[test]
fn blocked_manifest_skips_that_depot_and_installs_the_rest() {
    let case = case_named("multi-depot-collision");
    let blocked = ["900032"];
    let env = blocked_env(&case, &blocked);
    let out = env.run(job_asking_node_for(&env, "ji-blocked-one", &blocked));
    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    assert_eq!(out.skipped_depots, vec!["900032".to_string()]);
    assert_eq!(out.attempted_depots.len(), 1);
    assert_eq!(out.attempted_depots[0].depot_id, "900031");
    // The surviving depot's file is the one on disk, so nothing collided.
    assert_eq!(
        std::fs::read(env.root().join("data/a.txt")).unwrap(),
        case.depots[0].files[1].content
    );
    assert_eq!(out.stats.path_collisions, 0);
    assert_eq!(out.acf.as_ref().unwrap().state_flags, "4");
    assert!(env.acf().contains("900031"));
    assert!(!env.acf().contains("900032"));
}

#[test]
fn blocked_every_depot_fails_with_eresult_40_and_downloads_nothing() {
    let case = case_named("multi-depot-collision");
    let blocked = ["900031", "900032"];
    let env = blocked_env(&case, &blocked);
    let out = env.run(job_asking_node_for(&env, "ji-blocked-all", &blocked));
    assert_eq!(out.status, Status::Error);
    assert_eq!(out.failures.len(), 1);
    assert_eq!(out.failures[0].kind, ErrorKind::ManifestUnavailable);
    assert_eq!(out.failures[0].eresult, Some(40));
    assert_eq!(out.skipped_depots, vec!["900031", "900032"]);
    assert!(out.attempted_depots.is_empty() && out.acf.is_none());
    assert!(
        !env.cdn.hits().iter().any(|h| h.target.contains("/chunk/")),
        "no chunk fetched"
    );
    assert!(!env.steamapps().join("appmanifest_900030.acf").exists());
}

#[test]
fn non_blocked_node_error_still_fails_the_job() {
    // Only EResult 40 is a skip; a failed Node call degrades to "no code" and the job fails.
    let case = case_named("multi-depot-collision");
    let mut env = setup(&case);
    env.host = Arc::new(FakeHost::new().with_codes(vec![Err("depot:bad-reply".into())]));
    let out = env.run(job_asking_node_for(&env, "ji-node-err", &["900032"]));
    assert_eq!(out.status, Status::Error);
    assert_eq!(out.failures[0].kind, ErrorKind::ManifestUnavailable);
    assert_eq!(out.failures[0].eresult, None);
    assert!(out.skipped_depots.is_empty());
}
