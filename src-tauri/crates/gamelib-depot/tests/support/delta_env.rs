//! Shared fixture for the delta resume / fallback tests: an old build materialised on disk, a fake
//! CDN serving old and new manifests plus the NEW build's chunks, and a job-JSON builder.
//! (The same helpers live inline in `delta.rs`; this module serves the later delta test files.)

use crate::fake_cdn::{FakeCdn, Reply};
use crate::fake_host::FakeHost;
use crate::fixture_builder::{
    render, synth, Codec, FixtureCase, FixtureDepot, FixtureFile, Wrapper, DIRECTORY_FLAG,
    SYMLINK_FLAG,
};
use gamelib_depot::delta::DELTA_TMP_SUFFIX;
use gamelib_depot::job::DepotJob;
use gamelib_depot::outcome::Outcome;
use gamelib_depot::{run_job, JobContext, JobHost};
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

pub const APP: u32 = 940_000;
pub const OLD_ACF: &str =
    "\"AppState\"\n{\n\t\"appid\"\t\t\"940000\"\n\t\"StateFlags\"\t\t\"4\"\n}\n";

pub fn sha_hex(bytes: &[u8]) -> String {
    Sha1::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// A 1000-byte deterministic piece: one chunk of one file.
pub fn piece(label: &str) -> Vec<u8> {
    synth(label, 1000)
}

pub fn cat(parts: &[&[u8]]) -> Vec<u8> {
    parts.concat()
}

pub fn file(path: &str, content: Vec<u8>) -> FixtureFile {
    FixtureFile::new(path, content, 1000, Codec::Vz)
}

/// Old and new builds of one app share `name` (so the derived depot keys match) and differ by gid.
pub fn case(name: &'static str, gid_tag: u64, depots: Vec<(u32, Vec<FixtureFile>)>) -> FixtureCase {
    FixtureCase {
        name,
        app_id: APP,
        mode: "install",
        install_root: name,
        finalize: None,
        depots: depots
            .into_iter()
            .map(|(depot_id, files)| FixtureDepot {
                depot_id,
                gid: 8_000_000_000_000_000_000 + gid_tag * 100 + u64::from(depot_id % 100),
                wrapper: Wrapper::Zip,
                encrypt_names: false,
                files,
            })
            .collect(),
    }
}

pub struct Env {
    pub _rt: tokio::runtime::Runtime,
    pub cdn: FakeCdn,
    pub dir: tempfile::TempDir,
    pub host: Arc<FakeHost>,
    pub name: &'static str,
    /// (depotId, new gid, keyHex)
    pub new_depots: Vec<(String, String, String)>,
    /// depotId -> old gid
    pub old_gids: Vec<(String, String)>,
    /// (depotId, old gid, keyHex)
    pub old_depots: Vec<(String, String, String)>,
}

impl Env {
    pub fn steamapps(&self) -> PathBuf {
        self.dir.path().join("steamapps")
    }
    pub fn root(&self) -> PathBuf {
        self.steamapps().join("common").join(self.name)
    }
    pub fn acf_path(&self) -> PathBuf {
        self.steamapps().join(format!("appmanifest_{APP}.acf"))
    }
    pub fn acf_bytes(&self) -> Vec<u8> {
        std::fs::read(self.acf_path()).unwrap()
    }
    pub fn old_gid(&self, depot_id: &str) -> Option<String> {
        self.old_gids
            .iter()
            .find(|(d, _)| d == depot_id)
            .map(|(_, g)| g.clone())
    }

    /// Job JSON with `fromManifest` set to the old gid for every depot that had one.
    pub fn job_json(&self, job_id: &str) -> Value {
        let depots: Vec<Value> = self
            .new_depots
            .iter()
            .map(|(d, g, k)| {
                json!({
                    "depotId": d, "manifestId": g, "requestCode": "123", "key": k,
                    "ownerAppId": APP.to_string(), "fromManifest": self.old_gid(d),
                })
            })
            .collect();
        json!({
            "jobId": job_id, "mode": "install", "appId": APP.to_string(),
            "installRoot": self.root().to_string_lossy(),
            "depots": depots,
            "hosts": [{
                "host": self.cdn.host(), "vhost": null, "kind": "SteamCache",
                "httpsSupport": null, "useTokenAuth": false, "weightedLoad": null
            }],
            "selectPaths": null,
            "finalize": {
                "steamappsDir": self.steamapps().to_string_lossy(),
                "installdir": self.name,
                "name": "Fixture", "buildid": "1002",
                "lastOwner": "76561197960265728", "allowFullOwnership": true
            },
            "limits": null
        })
    }
    /// Scripts `case` (another build of the same app) on the fake CDN like `setup` does for the
    /// new build; returns (depotId, gid) per depot.
    pub fn serve_build(&self, case: &FixtureCase) -> Vec<(String, String)> {
        let files = render(case);
        let json: Value = serde_json::from_slice(&files["case.json"]).unwrap();
        let gids: Vec<(String, String)> = json["depots"]
            .as_array()
            .unwrap()
            .iter()
            .map(|d| {
                (
                    d["depotId"].as_str().unwrap().to_string(),
                    d["manifestId"].as_str().unwrap().to_string(),
                )
            })
            .collect();
        for (rel, bytes) in &files {
            if let Some(sha) = rel
                .strip_prefix("chunks/")
                .and_then(|r| r.strip_suffix(".bin"))
            {
                for (d, _) in &gids {
                    self.cdn.script(
                        &format!("/depot/{d}/chunk/{sha}"),
                        vec![Reply::Status(200, bytes.clone())],
                    );
                }
            } else if let Some(stem) = rel
                .strip_prefix("manifests/")
                .and_then(|r| r.strip_suffix(".bin"))
            {
                let (d, g) = stem.split_once('_').unwrap();
                self.cdn.script(
                    &format!("/depot/{d}/manifest/{g}/5/123"),
                    vec![Reply::Status(200, bytes.clone())],
                );
            }
        }
        gids
    }
    /// `job_json` with each depot's `manifestId` replaced from `gids`.
    pub fn job_for(&self, job_id: &str, gids: &[(String, String)]) -> DepotJob {
        let mut j = self.job_json(job_id);
        for d in j["depots"].as_array_mut().unwrap() {
            let id = d["depotId"].as_str().unwrap().to_string();
            let g = &gids.iter().find(|(x, _)| *x == id).unwrap().1;
            d["manifestId"] = json!(g);
        }
        serde_json::from_value(j).unwrap()
    }
    pub fn job(&self, job_id: &str) -> DepotJob {
        serde_json::from_value(self.job_json(job_id)).unwrap()
    }
    pub fn run(&self, job: DepotJob) -> Outcome {
        run_job(
            job,
            &JobContext {
                cache_dir: self.dir.path().join("cache"),
            },
            self.host.clone() as Arc<dyn JobHost>,
        )
    }
    /// Sha hexes of every chunk target the CDN was asked for, per depot.
    pub fn chunk_hits(&self) -> Vec<(String, String)> {
        self.cdn
            .hits()
            .iter()
            .filter_map(|h| {
                let t = h.target.strip_prefix("/depot/")?;
                let (d, rest) = t.split_once("/chunk/")?;
                Some((d.to_string(), rest.to_string()))
            })
            .collect()
    }
    pub fn chunk_hit_shas(&self) -> BTreeSet<String> {
        self.chunk_hits().into_iter().map(|(_, s)| s).collect()
    }
    pub fn root_file(&self, rel: &str) -> Vec<u8> {
        std::fs::read(self.root().join(rel)).unwrap()
    }
}

pub fn write_tree(root: &Path, case: &FixtureCase) {
    for depot in &case.depots {
        for f in &depot.files {
            let p = root.join(&f.path);
            if f.flags & DIRECTORY_FLAG != 0 {
                std::fs::create_dir_all(&p).unwrap();
                continue;
            }
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            if f.flags & SYMLINK_FLAG != 0 {
                #[cfg(unix)]
                std::os::unix::fs::symlink(f.linktarget.as_ref().unwrap(), &p).unwrap();
                continue;
            }
            std::fs::write(&p, &f.content).unwrap();
        }
    }
}

/// Materialises `old` on disk and scripts the fake CDN with both manifests and the new chunks.
pub fn setup(old: &FixtureCase, new: &FixtureCase) -> Env {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let cdn = rt.block_on(FakeCdn::start());
    let new_files = render(new);
    let old_files = render(old);
    let new_json: Value = serde_json::from_slice(&new_files["case.json"]).unwrap();
    let new_depots: Vec<(String, String, String)> = new_json["depots"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| {
            (
                d["depotId"].as_str().unwrap().to_string(),
                d["manifestId"].as_str().unwrap().to_string(),
                d["keyHex"].as_str().unwrap().to_string(),
            )
        })
        .collect();
    for (rel, bytes) in &new_files {
        if let Some(sha) = rel
            .strip_prefix("chunks/")
            .and_then(|r| r.strip_suffix(".bin"))
        {
            for (d, _, _) in &new_depots {
                cdn.script(
                    &format!("/depot/{d}/chunk/{sha}"),
                    vec![Reply::Status(200, bytes.clone())],
                );
            }
        }
    }
    for files in [&old_files, &new_files] {
        for (rel, bytes) in files {
            if let Some(stem) = rel
                .strip_prefix("manifests/")
                .and_then(|r| r.strip_suffix(".bin"))
            {
                let (d, g) = stem.split_once('_').unwrap();
                cdn.script(
                    &format!("/depot/{d}/manifest/{g}/5/123"),
                    vec![Reply::Status(200, bytes.clone())],
                );
            }
        }
    }
    let old_json: Value = serde_json::from_slice(&old_files["case.json"]).unwrap();
    let old_depots: Vec<(String, String, String)> = old_json["depots"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| {
            (
                d["depotId"].as_str().unwrap().to_string(),
                d["manifestId"].as_str().unwrap().to_string(),
                d["keyHex"].as_str().unwrap().to_string(),
            )
        })
        .collect();
    let old_gids = old
        .depots
        .iter()
        .map(|d| (d.depot_id.to_string(), d.gid.to_string()))
        .collect();
    let env = Env {
        _rt: rt,
        cdn,
        dir: tempfile::tempdir().unwrap(),
        // The old manifest is requested with a null code: Node supplies it.
        host: Arc::new(FakeHost::new().with_codes(vec![Ok(Some("123".to_string()))])),
        name: new.name,
        new_depots,
        old_gids,
        old_depots,
    };
    std::fs::create_dir_all(env.root()).unwrap();
    write_tree(&env.root(), old);
    std::fs::write(env.acf_path(), OLD_ACF).unwrap();
    env
}

pub fn assert_tree_matches(env: &Env, case: &FixtureCase) {
    for depot in &case.depots {
        for f in &depot.files {
            let p = env.root().join(&f.path);
            if f.flags & DIRECTORY_FLAG != 0 {
                assert!(p.is_dir(), "{}", f.path);
            } else if f.flags & SYMLINK_FLAG != 0 {
                #[cfg(unix)]
                assert_eq!(
                    std::fs::read_link(&p).unwrap().to_string_lossy(),
                    f.linktarget.clone().unwrap(),
                    "{}",
                    f.path
                );
            } else {
                assert_eq!(std::fs::read(&p).unwrap(), f.content, "{}", f.path);
            }
        }
    }
}

pub fn tmp_files(dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    pub fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
        let Ok(rd) = std::fs::read_dir(dir) else {
            return;
        };
        for e in rd.flatten() {
            let p = e.path();
            if p.to_string_lossy().ends_with(DELTA_TMP_SUFFIX) {
                out.push(p.clone());
            }
            if std::fs::symlink_metadata(&p).is_ok_and(|m| m.is_dir()) {
                walk(&p, out);
            }
        }
    }
    walk(dir, &mut out);
    out
}

pub fn wait_for(what: &str, mut cond: impl FnMut() -> bool) {
    for _ in 0..400 {
        if cond() {
            return;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    panic!("timed out waiting for {what}");
}

pub fn sorted(v: &[String]) -> Vec<String> {
    let mut v = v.to_vec();
    v.sort();
    v
}

impl Env {
    pub fn journal_path(&self) -> PathBuf {
        self.steamapps()
            .join("gamelib-delta")
            .join(format!("{APP}.json"))
    }
    pub fn temp_ledger_path(&self) -> PathBuf {
        self.steamapps()
            .join("gamelib-delta")
            .join(format!("{APP}.temps.json"))
    }
    /// Writes the kept-temp ledger in its documented schema (`temps` are manifest-form names).
    pub fn write_temp_ledger(&self, new: &[(&str, String)], temps: &[&str]) {
        let gids: serde_json::Map<String, Value> =
            new.iter().map(|(d, g)| (d.to_string(), json!(g))).collect();
        let j = json!({ "appId": APP.to_string(), "newGids": gids, "temps": temps });
        std::fs::create_dir_all(self.temp_ledger_path().parent().unwrap()).unwrap();
        std::fs::write(self.temp_ledger_path(), serde_json::to_vec(&j).unwrap()).unwrap();
    }
    pub fn acf_string(&self) -> String {
        String::from_utf8(self.acf_bytes()).unwrap()
    }
    pub fn new_gid(&self, depot_id: &str) -> String {
        self.new_depots
            .iter()
            .find(|(d, _, _)| d == depot_id)
            .map(|(_, g, _)| g.clone())
            .unwrap()
    }
    /// The CDN answers 404 for the old manifest of `depot_id` from now on.
    pub fn hide_old_manifest(&self, depot_id: &str) {
        let gid = self.old_gid(depot_id).unwrap();
        self.cdn.script(
            &format!("/depot/{depot_id}/manifest/{gid}/5/123"),
            vec![Reply::Status(404, Vec::new())],
        );
    }
    /// The CDN answers `status` for the old manifest of `depot_id` on every attempt. The fake
    /// CDN repeats the last scripted reply, which outlasts fetch.rs's 8-attempt budget.
    pub fn fail_old_manifest(&self, depot_id: &str, status: u16) {
        let gid = self.old_gid(depot_id).unwrap();
        self.cdn.script(
            &format!("/depot/{depot_id}/manifest/{gid}/5/123"),
            vec![Reply::Status(status, Vec::new())],
        );
    }
    /// Node cannot obtain a request code for `depot_id` (`transient:<reason>`), and the job's
    /// old-manifest ref carries no code, so the crate must ask Node for it.
    pub fn refuse_old_request_code(&self, depot_id: &str, reason: &str) {
        self.host.set_transient(depot_id, reason);
    }
    /// Writes the commit journal in its documented schema.
    pub fn write_journal(&self, new: &[(&str, String)], old: &[(&str, String)]) {
        let map = |v: &[(&str, String)]| -> Value {
            Value::Object(v.iter().map(|(d, g)| (d.to_string(), json!(g))).collect())
        };
        let j = json!({
            "appId": APP.to_string(), "newGids": map(new), "oldGids": map(old),
            "retired": [], "startedAt": 1
        });
        std::fs::create_dir_all(self.journal_path().parent().unwrap()).unwrap();
        std::fs::write(self.journal_path(), serde_json::to_vec(&j).unwrap()).unwrap();
    }
    /// Plants `<path>.gamelib-delta-tmp` holding `bytes`.
    pub fn plant_temp(&self, rel: &str, bytes: &[u8]) -> PathBuf {
        let mut t = self.root().join(rel).into_os_string();
        t.push(DELTA_TMP_SUFFIX);
        let t = PathBuf::from(t);
        std::fs::write(&t, bytes).unwrap();
        t
    }
}

/// The shared round-trip fixture: a unchanged; b reorders its chunks and adds one; c reuses a
/// chunk of old b; d is new.
pub fn round_trip_cases(name: &'static str) -> (FixtureCase, FixtureCase) {
    let (b0, b1, b2, b3) = (piece("b0"), piece("b1"), piece("b2"), piece("b3"));
    let old = case(
        name,
        1,
        vec![(
            940_001,
            vec![
                file("a.bin", cat(&[&piece("a0"), &piece("a1")])),
                file("b.bin", cat(&[&b0, &b1, &b2])),
                file("c.bin", cat(&[&piece("c0"), &piece("c1")])),
            ],
        )],
    );
    let new = case(
        name,
        2,
        vec![(
            940_001,
            vec![
                file("a.bin", cat(&[&piece("a0"), &piece("a1")])),
                file("b.bin", cat(&[&b2, &b0, &b3])),
                file("c.bin", cat(&[&b1, &piece("c1n")])),
                file("d.bin", [piece("d0"), synth("d1", 500)].concat()),
            ],
        )],
    );
    (old, new)
}
