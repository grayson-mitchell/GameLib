//! Chunk-level delta jobs (Phase 74): an old build is materialised on disk, the fake CDN serves
//! the old and new manifests plus the NEW build's chunks, and a job with `fromManifest` set must
//! produce the new tree while fetching only chunks that no old file can supply.

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
use fixture_builder::{
    render, synth, Codec, FixtureCase, FixtureDepot, FixtureFile, Wrapper, DIRECTORY_FLAG,
    EXECUTABLE_FLAG, SYMLINK_FLAG,
};
use gamelib_depot::delta::DELTA_TMP_SUFFIX;
use gamelib_depot::job::{DepotJob, JobEventBody};
use gamelib_depot::outcome::{DeltaMode, ErrorKind, Outcome, Status};
use gamelib_depot::{registry, run_job, JobContext, JobHost};
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

const APP: u32 = 940_000;
const OLD_ACF: &str = "\"AppState\"\n{\n\t\"appid\"\t\t\"940000\"\n\t\"StateFlags\"\t\t\"4\"\n}\n";

fn sha_hex(bytes: &[u8]) -> String {
    Sha1::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// A 1000-byte deterministic piece: one chunk of one file.
fn piece(label: &str) -> Vec<u8> {
    synth(label, 1000)
}

fn cat(parts: &[&[u8]]) -> Vec<u8> {
    parts.concat()
}

fn file(path: &str, content: Vec<u8>) -> FixtureFile {
    FixtureFile::new(path, content, 1000, Codec::Vz)
}

/// Old and new builds of one app share `name` (so the derived depot keys match) and differ by gid.
fn case(name: &'static str, gid_tag: u64, depots: Vec<(u32, Vec<FixtureFile>)>) -> FixtureCase {
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

struct Env {
    _rt: tokio::runtime::Runtime,
    cdn: FakeCdn,
    dir: tempfile::TempDir,
    host: Arc<FakeHost>,
    name: &'static str,
    /// (depotId, new gid, keyHex)
    new_depots: Vec<(String, String, String)>,
    /// depotId -> old gid
    old_gids: Vec<(String, String)>,
}

impl Env {
    fn steamapps(&self) -> PathBuf {
        self.dir.path().join("steamapps")
    }
    fn root(&self) -> PathBuf {
        self.steamapps().join("common").join(self.name)
    }
    fn acf_path(&self) -> PathBuf {
        self.steamapps().join(format!("appmanifest_{APP}.acf"))
    }
    fn acf_bytes(&self) -> Vec<u8> {
        std::fs::read(self.acf_path()).unwrap()
    }
    fn old_gid(&self, depot_id: &str) -> Option<String> {
        self.old_gids
            .iter()
            .find(|(d, _)| d == depot_id)
            .map(|(_, g)| g.clone())
    }

    /// Job JSON with `fromManifest` set to the old gid for every depot that had one.
    fn job_json(&self, job_id: &str) -> Value {
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
    fn job(&self, job_id: &str) -> DepotJob {
        serde_json::from_value(self.job_json(job_id)).unwrap()
    }
    fn run(&self, job: DepotJob) -> Outcome {
        run_job(
            job,
            &JobContext {
                cache_dir: self.dir.path().join("cache"),
            },
            self.host.clone() as Arc<dyn JobHost>,
        )
    }
    /// Sha hexes of every chunk target the CDN was asked for, per depot.
    fn chunk_hits(&self) -> Vec<(String, String)> {
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
    fn chunk_hit_shas(&self) -> BTreeSet<String> {
        self.chunk_hits().into_iter().map(|(_, s)| s).collect()
    }
    fn root_file(&self, rel: &str) -> Vec<u8> {
        std::fs::read(self.root().join(rel)).unwrap()
    }
}

fn write_tree(root: &Path, case: &FixtureCase) {
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
fn setup(old: &FixtureCase, new: &FixtureCase) -> Env {
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
    };
    std::fs::create_dir_all(env.root()).unwrap();
    write_tree(&env.root(), old);
    std::fs::write(env.acf_path(), OLD_ACF).unwrap();
    env
}

fn assert_tree_matches(env: &Env, case: &FixtureCase) {
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

fn tmp_files(dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
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

fn wait_for(what: &str, mut cond: impl FnMut() -> bool) {
    for _ in 0..400 {
        if cond() {
            return;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    panic!("timed out waiting for {what}");
}

fn sorted(v: &[String]) -> Vec<String> {
    let mut v = v.to_vec();
    v.sort();
    v
}

/// The shared round-trip fixture: a unchanged; b reorders its chunks and adds one; c reuses a
/// chunk of old b; d is new.
fn round_trip_cases(name: &'static str) -> (FixtureCase, FixtureCase) {
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

#[test]
fn delta_round_trip() {
    let (old, new) = round_trip_cases("dl-round-trip");
    let env = setup(&old, &new);
    let out = env.run(env.job("dl-rt"));

    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    assert_tree_matches(&env, &new);
    let report = out.delta.as_ref().expect("delta report");
    assert_eq!(report.mode, DeltaMode::Chunk);
    assert!(report.committed);
    assert_eq!(
        sorted(&report.changed_files),
        vec!["b.bin", "c.bin", "d.bin"]
    );
    assert!(report.removed_files.is_empty());
    assert!(report.reused_bytes >= 3000, "{}", report.reused_bytes);
    assert!(report.cdn_bytes > 0);
    assert_eq!(report.peak_bytes, 3000 + 2000 + 1500);

    // Only chunks no old file holds are requested: b3, c1n, d0, d1.
    let expected: BTreeSet<String> = [piece("b3"), piece("c1n"), piece("d0"), synth("d1", 500)]
        .iter()
        .map(|p| sha_hex(p))
        .collect();
    assert_eq!(env.chunk_hit_shas(), expected);

    let acf = String::from_utf8(env.acf_bytes()).unwrap();
    assert!(acf.contains("\"StateFlags\"\t\t\"4\""), "{acf}");
    assert_eq!(out.acf.as_ref().unwrap().state_flags, "4");
    assert!(acf.contains(&env.new_depots[0].1), "{acf}");
    assert!(tmp_files(env.dir.path()).is_empty());

    // The new `stage` frames bracket the work, in order.
    let stages: Vec<String> = env
        .host
        .emits
        .lock()
        .unwrap()
        .iter()
        .filter_map(|e| match &e.body {
            JobEventBody::Stage { stage } => Some(stage.clone()),
            _ => None,
        })
        .collect();
    assert_eq!(stages, vec!["delta_planning", "delta_committing"]);
}

#[test]
fn delta_corrupt_local_chunk_goes_to_cdn() {
    let (old, new) = round_trip_cases("dl-corrupt");
    let env = setup(&old, &new);
    // Flip 4 bytes inside old b's first chunk (b0), which new b still needs.
    let p = env.root().join("b.bin");
    let mut bytes = std::fs::read(&p).unwrap();
    for x in &mut bytes[10..14] {
        *x ^= 0xff;
    }
    std::fs::write(&p, bytes).unwrap();

    let out = env.run(env.job("dl-corrupt"));
    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    assert_tree_matches(&env, &new);
    let b0 = sha_hex(&piece("b0"));
    let served = env.chunk_hits().iter().filter(|(_, s)| *s == b0).count();
    assert_eq!(served, 1, "the corrupt chunk is fetched exactly once");
    // b1 and b2 are still intact locally and never requested.
    let hit = env.chunk_hit_shas();
    assert!(!hit.contains(&sha_hex(&piece("b1"))));
    assert!(!hit.contains(&sha_hex(&piece("b2"))));
}

#[test]
fn delta_keeps_unowned_and_unchanged_modified() {
    let (old, new) = round_trip_cases("dl-keep");
    let env = setup(&old, &new);
    let extras: Vec<(&str, Vec<u8>)> = vec![
        ("steam_api64.dll.gamelib-orig", b"orig dll".to_vec()),
        ("gamelib_bridge.cfg", b"bridge=1".to_vec()),
        ("x.dxvk-cache", b"cache bytes".to_vec()),
        // Owned by both manifests with the same content: the player's edit must survive.
        ("a.bin", b"modified by the player".to_vec()),
    ];
    for (n, b) in &extras {
        std::fs::write(env.root().join(n), b).unwrap();
    }
    let out = env.run(env.job("dl-keep"));
    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    for (n, b) in &extras {
        assert_eq!(&env.root_file(n), b, "{n}");
    }
    assert!(!out
        .delta
        .as_ref()
        .unwrap()
        .changed_files
        .contains(&"a.bin".to_string()));
}

#[test]
fn delta_deletes_removed_owned_file() {
    let old = case(
        "dl-remove",
        1,
        vec![(
            940_001,
            vec![
                file("a.bin", piece("a0")),
                file("old_only.bin", piece("o0")),
            ],
        )],
    );
    let new = case(
        "dl-remove",
        2,
        vec![(
            940_001,
            vec![file("a.bin", piece("a0")), file("e.bin", piece("e0"))],
        )],
    );
    let env = setup(&old, &new);
    std::fs::write(env.root().join("old_only.bin.keep"), b"mine").unwrap();
    let out = env.run(env.job("dl-remove"));
    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    assert!(!env.root().join("old_only.bin").exists());
    assert_eq!(env.root_file("old_only.bin.keep"), b"mine");
    assert_tree_matches(&env, &new);
    assert_eq!(
        out.delta.as_ref().unwrap().removed_files,
        vec!["old_only.bin".to_string()]
    );
}

#[test]
fn delta_case_fold_guard() {
    let old = case(
        "dl-casefold",
        1,
        vec![(
            940_001,
            vec![file("Data/Foo.pak", cat(&[&piece("p0"), &piece("p1")]))],
        )],
    );
    let new = case(
        "dl-casefold",
        2,
        vec![(
            940_001,
            vec![file("data/foo.pak", cat(&[&piece("p1"), &piece("p2")]))],
        )],
    );
    let env = setup(&old, &new);
    let out = env.run(env.job("dl-casefold"));
    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    assert_eq!(
        env.root_file("data/foo.pak"),
        cat(&[&piece("p1"), &piece("p2")])
    );
    assert!(
        out.delta.as_ref().unwrap().removed_files.is_empty(),
        "a case-folded path a new manifest still owns is never removed"
    );
}

#[test]
fn delta_flag_only_change() {
    let content = cat(&[&piece("f0"), &piece("f1")]);
    let old = case(
        "dl-flag",
        1,
        vec![(940_001, vec![file("tool.sh", content.clone())])],
    );
    let new = case(
        "dl-flag",
        2,
        vec![(
            940_001,
            vec![file("tool.sh", content.clone()).flags(EXECUTABLE_FLAG)],
        )],
    );
    let env = setup(&old, &new);
    let out = env.run(env.job("dl-flag"));
    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    assert!(out.delta.as_ref().unwrap().changed_files.is_empty());
    assert!(env.chunk_hits().is_empty(), "a flag change fetches nothing");
    assert_eq!(env.root_file("tool.sh"), content);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(env.root().join("tool.sh"))
            .unwrap()
            .permissions()
            .mode();
        assert_ne!(mode & 0o111, 0, "exec bit applied: {mode:o}");
    }
}

#[cfg(unix)]
#[test]
fn delta_symlink_changed() {
    let mk = |tag: u64, target: &str| {
        case(
            "dl-symlink",
            tag,
            vec![(
                940_001,
                vec![
                    file("t1.txt", piece("t1")),
                    file("t2.txt", piece("t2")),
                    FixtureFile::symlink("link", target),
                ],
            )],
        )
    };
    let (old, new) = (mk(1, "t1.txt"), mk(2, "t2.txt"));
    let env = setup(&old, &new);
    let out = env.run(env.job("dl-symlink"));
    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    assert_eq!(
        std::fs::read_link(env.root().join("link"))
            .unwrap()
            .to_string_lossy(),
        "t2.txt"
    );

    // A target that escapes the root fails before anything is written.
    let escaping = case(
        "dl-symlink-esc",
        2,
        vec![(
            940_001,
            vec![
                file("t1.txt", piece("t1")),
                file("t2.txt", piece("changed")),
                FixtureFile::symlink("link", "../../outside"),
            ],
        )],
    );
    let old = case(
        "dl-symlink-esc",
        1,
        vec![(
            940_001,
            vec![
                file("t1.txt", piece("t1")),
                file("t2.txt", piece("t2")),
                FixtureFile::symlink("link", "t1.txt"),
            ],
        )],
    );
    let env = setup(&old, &escaping);
    let acf_before = env.acf_bytes();
    let out = env.run(env.job("dl-symlink-esc"));
    assert_eq!(out.status, Status::Error);
    assert_eq!(out.failures[0].kind, ErrorKind::PathTraversal);
    assert_eq!(env.root_file("t2.txt"), piece("t2"));
    assert_eq!(
        std::fs::read_link(env.root().join("link"))
            .unwrap()
            .to_string_lossy(),
        "t1.txt"
    );
    assert!(tmp_files(env.dir.path()).is_empty());
    assert_eq!(env.acf_bytes(), acf_before);
}

#[test]
fn delta_multi_depot_and_added_depot() {
    let (x0, x1, x2) = (piece("x0"), piece("x1"), piece("x2"));
    let old = case(
        "dl-multi",
        1,
        vec![
            (940_001, vec![file("one/f1.bin", cat(&[&x0, &x1, &x2]))]),
            (940_002, vec![file("two/g.bin", piece("g0"))]),
        ],
    );
    let new = case(
        "dl-multi",
        2,
        vec![
            (
                940_001,
                vec![file("one/f1.bin", cat(&[&x0, &piece("y1"), &x2]))],
            ),
            (
                940_002,
                // x1 only exists in depot 1's OLD file: cross-depot reuse.
                vec![file("two/g2.bin", cat(&[&x1, &piece("g1")]))],
            ),
            (
                940_003,
                vec![file("three/h.bin", cat(&[&piece("h0"), &piece("h1")]))],
            ),
        ],
    );
    let env = setup(&old, &new);
    let out = env.run(env.job("dl-multi"));
    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    assert_tree_matches(&env, &new);

    let hits = env.chunk_hits();
    assert!(
        !hits.iter().any(|(_, s)| *s == sha_hex(&x1)),
        "x1 comes from depot 1's old file"
    );
    let depot3: BTreeSet<String> = hits
        .iter()
        .filter(|(d, _)| d == "940003")
        .map(|(_, s)| s.clone())
        .collect();
    let want3: BTreeSet<String> = [piece("h0"), piece("h1")]
        .iter()
        .map(|p| sha_hex(p))
        .collect();
    assert_eq!(
        depot3, want3,
        "the added depot is built entirely from the CDN"
    );
    assert_eq!(hits.len(), 4, "y1, g1, h0, h1: {hits:?}");
    // The old g.bin was owned by depot 2's old manifest and is gone from the new one.
    assert!(!env.root().join("two/g.bin").exists());
    assert_eq!(
        out.delta.as_ref().unwrap().removed_files,
        vec!["two/g.bin".to_string()]
    );
}

#[test]
fn delta_traversal_rejected() {
    let old = case(
        "dl-traversal",
        1,
        vec![(940_001, vec![file("a.bin", piece("a0"))])],
    );
    let new = case(
        "dl-traversal",
        2,
        vec![(
            940_001,
            vec![
                file("a.bin", piece("a0changed")),
                file("../escape.bin", piece("e0")),
            ],
        )],
    );
    let env = setup(&old, &new);
    let acf_before = env.acf_bytes();
    let out = env.run(env.job("dl-traversal"));
    assert_eq!(out.status, Status::Error);
    assert_eq!(out.failures[0].kind, ErrorKind::PathTraversal);
    assert!(!env.steamapps().join("common").join("escape.bin").exists());
    assert_eq!(env.root_file("a.bin"), piece("a0"));
    assert!(tmp_files(env.dir.path()).is_empty());
    assert_eq!(env.acf_bytes(), acf_before);
    assert!(out.acf.is_none());
}

#[test]
fn delta_cancel_before_commit_keeps_old() {
    let (old, new) = round_trip_cases("dl-cancel");
    let env = setup(&old, &new);
    // d1 never answers, so the build is parked mid-way.
    let hang = sha_hex(&synth("d1", 500));
    env.cdn
        .script(&format!("/depot/940001/chunk/{hang}"), vec![Reply::Hang]);
    let before: Vec<(&str, Vec<u8>)> = ["a.bin", "b.bin", "c.bin"]
        .iter()
        .map(|n| (*n, env.root_file(n)))
        .collect();
    let acf_before = env.acf_bytes();

    let job = env.job("dl-cancel");
    let out = std::thread::scope(|s| {
        let h = s.spawn(|| env.run(job));
        let target = format!("/depot/940001/chunk/{hang}");
        wait_for("the hanging chunk to be requested", || {
            env.cdn.hit_count(&target) > 0
        });
        std::thread::sleep(Duration::from_millis(100));
        assert!(registry::cancel("dl-cancel"));
        h.join().unwrap()
    });
    assert_eq!(out.status, Status::Cancelled, "{:?}", out.failures);
    for (n, b) in &before {
        assert_eq!(&env.root_file(n), b, "{n}");
    }
    assert!(!env.root().join("d.bin").exists());
    // Verified temps (b, c) may survive a pause for the resume; a partial one (d) never does. The
    // b and c builds race the cancel, so assert no count: whatever remains holds the new bytes.
    for t in tmp_files(env.dir.path()) {
        let name = t
            .file_name()
            .unwrap()
            .to_string_lossy()
            .trim_end_matches(DELTA_TMP_SUFFIX)
            .to_string();
        assert_ne!(name, "d.bin", "a partial temp is never kept");
        let want = &new.depots[0]
            .files
            .iter()
            .find(|f| f.path == name)
            .unwrap()
            .content;
        assert_eq!(&std::fs::read(&t).unwrap(), want, "{name}");
    }
    assert_eq!(env.acf_bytes(), acf_before);
    assert!(out.acf.is_none());
    assert!(!out.delta.as_ref().unwrap().committed);
}

#[test]
fn delta_unsupported_shapes() {
    let (old, new) = round_trip_cases("dl-shapes");
    let env = setup(&old, &new);
    let check = |job_id: &str, edit: &dyn Fn(&mut Value)| {
        let mut v = env.job_json(job_id);
        edit(&mut v);
        let job: DepotJob = serde_json::from_value(v).unwrap();
        let out = env.run(job);
        assert_eq!(out.status, Status::Error, "{job_id}");
        assert_eq!(
            out.failures[0].kind,
            ErrorKind::DeltaUnsupported,
            "{job_id}"
        );
        assert!(env.cdn.hits().is_empty(), "{job_id}: no network use");
        assert!(env.host.emits.lock().unwrap().is_empty(), "{job_id}");
    };
    check("dl-verify", &|v| v["mode"] = json!("verify_only"));
    check("dl-nonnumeric", &|v| {
        v["depots"][0]["fromManifest"] = json!("12a")
    });
    check("dl-orphan-retired", &|v| {
        v["depots"][0]["fromManifest"] = Value::Null;
        v["retiredDepots"] = json!([{
            "depotId": "940009", "manifestId": "55", "requestCode": null,
            "key": v["depots"][0]["key"].clone(), "ownerAppId": APP.to_string(),
            "fromManifest": null
        }]);
    });
    check("dl-nofinalize", &|v| v["finalize"] = Value::Null);
}
