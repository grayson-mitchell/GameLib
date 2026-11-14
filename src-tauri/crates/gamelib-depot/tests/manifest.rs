//! Manifest parse and cache behaviour. Manifests are built in-test with prost and the plan-02
//! encoders.

#[allow(dead_code)]
#[path = "support/encode.rs"]
mod encode;
#[allow(dead_code)]
#[path = "support/fake_cdn.rs"]
mod fake_cdn;
#[allow(dead_code)]
#[path = "support/fake_host.rs"]
mod fake_host;

use fake_cdn::{FakeCdn, Reply};
use fake_host::FakeHost;
use gamelib_depot::fetch::Fetcher;
use gamelib_depot::inflight::InflightLimiter;
use gamelib_depot::job::{DepotRef, HostRef};
use gamelib_depot::manifest::*;
use gamelib_depot::outcome::ErrorKind;
use gamelib_depot::stall::StallTracker;
use prost::Message;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

const KEY: [u8; 32] = [7u8; 32];
const IV: [u8; 16] = [3u8; 16];

fn b64(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut s = String::new();
    for c in data.chunks(3) {
        let n = (u32::from(c[0]) << 16)
            | (u32::from(*c.get(1).unwrap_or(&0)) << 8)
            | u32::from(*c.get(2).unwrap_or(&0));
        for i in 0..4 {
            if i <= c.len() {
                s.push(T[((n >> (18 - 6 * i)) & 63) as usize] as char);
            } else {
                s.push('=');
            }
        }
    }
    s
}

fn section(magic: u32, body: &[u8]) -> Vec<u8> {
    let mut v = magic.to_le_bytes().to_vec();
    v.extend_from_slice(&(body.len() as u32).to_le_bytes());
    v.extend_from_slice(body);
    v
}

fn file(name: Vec<u8>, size: u64, chunk_seed: u8) -> FileMapping {
    FileMapping {
        filename: Some(name),
        size: Some(size),
        flags: Some(32),
        sha_filename: None,
        sha_content: Some(vec![chunk_seed; 20]),
        chunks: vec![ChunkData {
            sha: Some(vec![chunk_seed; 20]),
            crc: Some(0xDEAD_BEEF),
            offset: Some(u64::from(u32::MAX) + 5),
            cb_original: Some(size as u32),
            cb_compressed: Some(9),
        }],
        linktarget: None,
    }
}

fn build(files: Vec<FileMapping>, encrypted: bool, gid: u64) -> Vec<u8> {
    let payload = ContentManifestPayload { mappings: files };
    let meta = ContentManifestMetadata {
        depot_id: Some(10),
        gid_manifest: Some(gid),
        creation_time: Some(1234),
        filenames_encrypted: Some(encrypted),
        cb_disk_original: Some(777),
        ..Default::default()
    };
    let mut raw = section(0x71F6_17D0, &payload.encode_to_vec());
    raw.extend(section(0x1F48_12BE, &meta.encode_to_vec()));
    raw.extend(section(
        0x1B81_B817,
        &ContentManifestSignature {
            signature: Some(vec![1, 2, 3]),
        }
        .encode_to_vec(),
    ));
    raw.extend_from_slice(&0x32C4_15ABu32.to_le_bytes());
    encode::vsza_wrap(&raw)
}

fn enc_name(name: &str) -> Vec<u8> {
    let mut p = name.as_bytes().to_vec();
    p.extend_from_slice(&[0, 0, 0]);
    b64(&encode::steam_encrypt(&p, &KEY, &IV)).into_bytes()
}

#[test]
fn parse_plain_manifest_roundtrips_fields() {
    let raw = build(
        vec![
            file(b"a/b.bin".to_vec(), 100, 1),
            file(b"c.txt".to_vec(), 5, 2),
        ],
        false,
        18_446_744_073_709_551_000,
    );
    let m = parse_manifest(&raw, None).unwrap();
    assert_eq!(m.depot_id, "10");
    assert_eq!(m.gid, "18446744073709551000");
    assert_eq!(m.creation_time, 1234);
    assert_eq!(m.total_uncompressed, 777);
    assert_eq!(m.files.len(), 2);
    let f = &m.files[0];
    assert_eq!(f.filename, "a/b.bin");
    assert_eq!((f.size, f.flags, f.sha_content), (100, 32, [1u8; 20]));
    let c = &f.chunks[0];
    assert_eq!(c.offset, u64::from(u32::MAX) + 5);
    assert_eq!(
        (c.crc, c.cb_original, c.cb_compressed),
        (0xDEAD_BEEF, 100, 9)
    );
    assert_eq!(c.sha, [1u8; 20]);
}

#[test]
fn encrypted_names_decrypted_and_nul_truncated() {
    let raw = build(vec![file(enc_name("Game/data.pak"), 1, 3)], true, 5);
    let m = parse_manifest(&raw, Some(&KEY)).unwrap();
    assert_eq!(m.files[0].filename, "Game/data.pak");
    assert!(parse_manifest(&raw, None).is_err());
}

#[test]
fn encrypted_linktarget_decrypted_like_the_filename() {
    // 37-09 / depotLinktarget.test.ts T-37-09-02 and -05, ported in 73-19.
    let mut link = file(enc_name("Frameworks/Current"), 0, 4);
    link.flags = Some(512);
    link.linktarget = Some(enc_name("A"));
    let plain = file(enc_name("Game/data.pak"), 1, 3);
    let raw = build(vec![link, plain], true, 5);
    let m = parse_manifest(&raw, Some(&KEY)).unwrap();
    assert_eq!(m.files[0].linktarget.as_deref(), Some("A"));
    // Absent or empty linktargets pass through and never reach the decrypt.
    assert_eq!(m.files[1].linktarget, None);
    let mut empty = file(enc_name("x"), 1, 3);
    empty.linktarget = Some(Vec::new());
    let m = parse_manifest(&build(vec![empty], true, 5), Some(&KEY)).unwrap();
    assert_eq!(m.files[0].linktarget, None);
}

#[test]
fn plain_manifest_linktarget_is_kept_verbatim() {
    let mut link = file(b"Frameworks/Current".to_vec(), 0, 4);
    link.linktarget = Some(b"A".to_vec());
    let m = parse_manifest(&build(vec![link], false, 5), None).unwrap();
    assert_eq!(m.files[0].linktarget.as_deref(), Some("A"));
}

#[test]
fn invalid_utf8_name_is_lossy_not_fatal() {
    let raw = build(vec![file(vec![b'a', 0xFF, 0xFE, b'z'], 1, 3)], false, 5);
    let m = parse_manifest(&raw, None).unwrap();
    assert_eq!(m.files[0].filename, "a\u{FFFD}\u{FFFD}z");
}

#[test]
fn truncated_section_is_error_not_panic() {
    let payload = ContentManifestPayload {
        mappings: vec![file(b"x".to_vec(), 1, 1)],
    };
    let mut raw = section(0x71F6_17D0, &payload.encode_to_vec());
    raw.truncate(raw.len() - 3);
    assert!(parse_manifest(&encode::vsza_wrap(&raw), None).is_err());
    // Header cut mid-length.
    assert!(parse_manifest(&encode::vsza_wrap(&[0xD0, 0x17, 0xF6, 0x71, 1]), None).is_err());
}

#[test]
fn unknown_magic_is_error() {
    let raw = section(0xAABB_CCDD, &[1, 2]);
    assert!(parse_manifest(&encode::vsza_wrap(&raw), None).is_err());
}

fn host_ref(h: &str) -> HostRef {
    HostRef {
        host: h.to_string(),
        vhost: None,
        kind: Some("SteamCache".to_string()),
        https_support: None,
        use_token_auth: false,
        weighted_load: None,
    }
}

fn depot(gid: &str) -> DepotRef {
    DepotRef {
        depot_id: "10".into(),
        manifest_id: gid.into(),
        request_code: Some("C".into()),
        key: "07".repeat(32),
        owner_app_id: "570".into(),
        from_manifest: None,
    }
}

fn store(cdn: &FakeCdn, dir: &std::path::Path) -> ManifestStore {
    let f = Fetcher::new(
        Arc::new(FakeHost::new()),
        "job",
        "570",
        vec![host_ref(&cdn.host())],
        InflightLimiter::new(4).unwrap(),
        Arc::new(StallTracker::default()),
    )
    .with_backoff(1, 3);
    ManifestStore::new(dir.to_path_buf(), Arc::new(f))
}

#[tokio::test]
async fn cache_hit_makes_zero_cdn_requests() {
    let cdn = FakeCdn::start().await;
    let served = build(vec![file(enc_name("k.bin"), 4, 9)], true, 99);
    cdn.script(
        "/depot/10/manifest/99/5/C",
        vec![Reply::Status(200, served.clone())],
    );
    let dir = tempfile::tempdir().unwrap();
    let s = store(&cdn, dir.path());
    let cancel = CancellationToken::new();
    let m = s.load(&depot("99"), &cancel).await.unwrap();
    assert_eq!(m.files[0].filename, "k.bin");
    assert_eq!(cdn.hits().len(), 1);
    let cached = std::fs::read(dir.path().join("10/99.manifest")).unwrap();
    assert_eq!(
        cached, served,
        "cache is the raw CDN bytes, no key material"
    );
    s.load(&depot("99"), &cancel).await.unwrap();
    assert_eq!(cdn.hits().len(), 1);
}

#[tokio::test]
async fn corrupt_cache_refetched() {
    let cdn = FakeCdn::start().await;
    cdn.script(
        "/depot/10/manifest/99/5/C",
        vec![Reply::Status(
            200,
            build(vec![file(b"a".to_vec(), 1, 1)], false, 99),
        )],
    );
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("10")).unwrap();
    std::fs::write(dir.path().join("10/99.manifest"), b"garbage").unwrap();
    let s = store(&cdn, dir.path());
    let m = s
        .load(&depot("99"), &CancellationToken::new())
        .await
        .unwrap();
    assert_eq!(m.files.len(), 1);
    assert_eq!(cdn.hits().len(), 1);
    assert_ne!(
        std::fs::read(dir.path().join("10/99.manifest")).unwrap(),
        b"garbage"
    );
}

#[test]
fn prune_keeps_two_gids() {
    let dir = tempfile::tempdir().unwrap();
    let d = dir.path().join("10");
    std::fs::create_dir_all(&d).unwrap();
    let base = std::time::SystemTime::now() - std::time::Duration::from_secs(1000);
    for (i, gid) in ["1", "2", "3", "4"].iter().enumerate() {
        let p = d.join(format!("{gid}.manifest"));
        std::fs::write(&p, b"x").unwrap();
        let f = std::fs::File::options().write(true).open(&p).unwrap();
        f.set_modified(base + std::time::Duration::from_secs(i as u64 * 10))
            .unwrap();
    }
    let cdn_less = ManifestStore::new(
        dir.path().to_path_buf(),
        Arc::new(Fetcher::new(
            Arc::new(FakeHost::new()),
            "j",
            "1",
            vec![],
            InflightLimiter::new(1).unwrap(),
            Arc::new(StallTracker::default()),
        )),
    );
    // Keep "1" (oldest) explicitly: expect {1, 4}.
    cdn_less.prune("10", "1", &[]);
    let mut left: Vec<String> = std::fs::read_dir(&d)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    left.sort();
    assert_eq!(left, vec!["1.manifest", "4.manifest"]);
}

#[tokio::test]
async fn cache_path_rejects_non_numeric_ids() {
    let cdn = FakeCdn::start().await;
    let dir = tempfile::tempdir().unwrap();
    let s = store(&cdn, dir.path());
    let mut d = depot("99");
    d.manifest_id = "../../evil".into();
    let e = s.load(&d, &CancellationToken::new()).await.unwrap_err();
    match e {
        gamelib_depot::fetch::FetchError::Failed(f) => {
            assert_eq!(f.kind, ErrorKind::ManifestUnavailable)
        }
        _ => panic!("expected Failed"),
    }
    assert!(cdn.hits().is_empty());
    assert!(std::fs::read_dir(dir.path()).unwrap().next().is_none());
}

fn summarize_req(depots: Vec<DepotRef>, cdn: &FakeCdn) -> gamelib_depot::job::SummarizeRequest {
    gamelib_depot::job::SummarizeRequest {
        app_id: "570".into(),
        depots,
        hosts: vec![host_ref(&cdn.host())],
        patterns: vec![],
    }
}

fn blocked_store(cdn: &FakeCdn, dir: &std::path::Path, blocked: &[&str]) -> ManifestStore {
    let f = Fetcher::new(
        Arc::new(FakeHost::new().with_blocked(blocked)),
        "job",
        "570",
        vec![host_ref(&cdn.host())],
        InflightLimiter::new(4).unwrap(),
        Arc::new(StallTracker::default()),
    )
    .with_backoff(1, 3);
    ManifestStore::new(dir.to_path_buf(), Arc::new(f))
}

#[tokio::test]
async fn summarize_skips_a_blocked_depot_and_reports_it() {
    let cdn = FakeCdn::start().await;
    cdn.script(
        "/depot/10/manifest/99/5/C",
        vec![Reply::Status(
            200,
            build(vec![file(enc_name("k.bin"), 4, 9)], true, 99),
        )],
    );
    let mut blocked = depot("98");
    blocked.depot_id = "11".into();
    blocked.request_code = None;
    let dir = tempfile::tempdir().unwrap();
    let s = blocked_store(&cdn, dir.path(), &["11"]);
    let res = summarize(summarize_req(vec![depot("99"), blocked], &cdn), &s)
        .await
        .unwrap();
    assert_eq!(res.depots.len(), 1);
    assert_eq!(res.depots[0].depot_id, "10");
    assert_eq!(res.skipped_depots, vec!["11".to_string()]);
}

#[tokio::test]
async fn summarize_with_every_depot_blocked_fails_with_eresult_40() {
    let cdn = FakeCdn::start().await;
    let mut a = depot("98");
    a.request_code = None;
    let dir = tempfile::tempdir().unwrap();
    let s = blocked_store(&cdn, dir.path(), &["10"]);
    let err = summarize(summarize_req(vec![a], &cdn), &s)
        .await
        .unwrap_err();
    assert_eq!(err.kind, ErrorKind::ManifestUnavailable);
    assert_eq!(err.eresult, Some(40));
}

#[tokio::test]
async fn summarize_reports_installscript_flagged_files_in_manifest_form() {
    let cdn = FakeCdn::start().await;
    let script = "_CommonRedist\\DirectX\\Jun2010\\installscript.vdf";
    let mut flagged = file(enc_name(script), 4, 7);
    flagged.flags = Some(256 | 32);
    cdn.script(
        "/depot/10/manifest/99/5/C",
        vec![Reply::Status(
            200,
            build(vec![file(enc_name("k.bin"), 4, 9), flagged], true, 99),
        )],
    );
    let dir = tempfile::tempdir().unwrap();
    let s = store(&cdn, dir.path());
    let res = summarize(summarize_req(vec![depot("99")], &cdn), &s)
        .await
        .unwrap();
    assert_eq!(res.depots[0].file_count, 2);
    assert_eq!(res.depots[0].installscripts, vec![script.to_string()]);
}

#[test]
fn prune_keeps_protected_gid() {
    let dir = tempfile::tempdir().unwrap();
    let d = dir.path().join("10");
    std::fs::create_dir_all(&d).unwrap();
    let base = std::time::SystemTime::now() - std::time::Duration::from_secs(1000);
    for i in 1..=5u64 {
        let p = d.join(format!("{i}.manifest"));
        std::fs::write(&p, b"x").unwrap();
        let f = std::fs::File::options().write(true).open(&p).unwrap();
        f.set_modified(base + std::time::Duration::from_secs(i * 10))
            .unwrap();
    }
    let store = ManifestStore::new(
        dir.path().to_path_buf(),
        Arc::new(Fetcher::new(
            Arc::new(FakeHost::new()),
            "j",
            "1",
            vec![],
            InflightLimiter::new(1).unwrap(),
            Arc::new(StallTracker::default()),
        )),
    );
    // "../x" and "" are non-numeric and must be ignored, never joined into a path.
    store.prune("10", "5", &["1", "../x", ""]);
    let mut left: Vec<String> = std::fs::read_dir(&d)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    left.sort();
    assert_eq!(left, vec!["1.manifest", "4.manifest", "5.manifest"]);
}

// ---- prune_after_install (quick 261114-lsl) ----

fn install_job(
    app_id: &str,
    steamapps: &std::path::Path,
    gid: &str,
) -> gamelib_depot::job::DepotJob {
    serde_json::from_value(serde_json::json!({
        "jobId": "j",
        "mode": "install",
        "appId": app_id,
        "installRoot": steamapps.join("common").join("g").to_string_lossy(),
        "depots": [{
            "depotId": "10",
            "manifestId": gid,
            "requestCode": null,
            "key": "ab".repeat(32),
            "ownerAppId": app_id,
            "fromManifest": null
        }],
        "hosts": [],
        "selectPaths": null,
        "finalize": {
            "steamappsDir": steamapps.to_string_lossy(),
            "installdir": "g",
            "name": "G",
            "buildid": null,
            "lastOwner": null,
            "allowFullOwnership": false
        },
        "limits": null
    }))
    .unwrap()
}

fn write_acf(steamapps: &std::path::Path, app_id: &str, gid: &str) {
    std::fs::create_dir_all(steamapps).unwrap();
    std::fs::write(
        steamapps.join(format!("appmanifest_{app_id}.acf")),
        format!(
            "\"AppState\"\n{{\n\t\"appid\"\t\t\"{app_id}\"\n\t\"StateFlags\"\t\t\"4\"\n\t\"InstalledDepots\"\n\t{{\n\t\t\"10\"\n\t\t{{\n\t\t\t\"manifest\"\t\t\"{gid}\"\n\t\t\t\"size\"\t\t\"1\"\n\t\t}}\n\t}}\n}}\n"
        ),
    )
    .unwrap();
}

fn seed_manifest(cache: &std::path::Path, gid: &str, age_secs: u64) {
    let d = cache.join("10");
    std::fs::create_dir_all(&d).unwrap();
    let p = d.join(format!("{gid}.manifest"));
    std::fs::write(&p, b"x").unwrap();
    let f = std::fs::File::options().write(true).open(&p).unwrap();
    f.set_modified(std::time::SystemTime::now() - std::time::Duration::from_secs(age_secs))
        .unwrap();
}

fn cached(cache: &std::path::Path) -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir(cache.join("10"))
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .filter(|n| n.ends_with(".manifest"))
        .map(|n| n.trim_end_matches(".manifest").to_string())
        .collect();
    v.sort();
    v
}

#[test]
fn prune_after_install_several_updates() {
    let t = tempfile::tempdir().unwrap();
    let cache = t.path().join("cache");
    let a = t.path().join("A");
    for (i, gid) in ["101", "102", "103", "104"].iter().enumerate() {
        seed_manifest(&cache, gid, 1000 - i as u64 * 10);
        write_acf(&a, "570", gid);
        prune_after_install(&cache, &install_job("570", &a, gid)).unwrap();
        assert!(cached(&cache).len() <= 2);
    }
    assert_eq!(cached(&cache), vec!["103", "104"]);
}

#[test]
fn prune_after_install_protects_other_apps_gids() {
    let t = tempfile::tempdir().unwrap();
    let cache = t.path().join("cache");
    let a = t.path().join("A");
    let b = t.path().join("B");
    seed_manifest(&cache, "50", 5000);
    write_acf(&b, "900", "50");
    prune_after_install(&cache, &install_job("900", &b, "50")).unwrap();
    for (i, gid) in ["60", "61", "62"].iter().enumerate() {
        seed_manifest(&cache, gid, 1000 - i as u64 * 10);
        write_acf(&a, "570", gid);
        prune_after_install(&cache, &install_job("570", &a, gid)).unwrap();
        assert!(cached(&cache).contains(&"50".to_string()));
    }
}

#[test]
fn prune_after_install_skips_on_unreadable_acf() {
    let t = tempfile::tempdir().unwrap();
    let cache = t.path().join("cache");
    let a = t.path().join("A");
    for (i, gid) in ["1", "2", "3", "4"].iter().enumerate() {
        seed_manifest(&cache, gid, 1000 - i as u64 * 10);
    }
    std::fs::create_dir_all(&a).unwrap();
    std::fs::write(a.join("appmanifest_1.acf"), "not vdf").unwrap();
    assert!(prune_after_install(&cache, &install_job("570", &a, "4")).is_err());
    assert_eq!(cached(&cache), vec!["1", "2", "3", "4"]);
}

#[test]
fn prune_after_install_drops_missing_dirs() {
    let t = tempfile::tempdir().unwrap();
    let cache = t.path().join("cache");
    let a = t.path().join("A");
    let gone = t.path().join("gone");
    std::fs::create_dir_all(&cache).unwrap();
    std::fs::write(
        cache.join("steamapps-dirs.json"),
        serde_json::to_string(&vec![gone.to_string_lossy()]).unwrap(),
    )
    .unwrap();
    seed_manifest(&cache, "1", 100);
    write_acf(&a, "570", "1");
    prune_after_install(&cache, &install_job("570", &a, "1")).unwrap();
    let reg = std::fs::read_to_string(cache.join("steamapps-dirs.json")).unwrap();
    let v: Vec<String> = serde_json::from_str(&reg).unwrap();
    assert_eq!(v, vec![a.to_string_lossy().into_owned()]);
}

#[test]
fn prune_after_install_noop_without_finalize_or_non_install() {
    let t = tempfile::tempdir().unwrap();
    let cache = t.path().join("cache");
    let a = t.path().join("A");
    for (i, gid) in ["1", "2", "3", "4"].iter().enumerate() {
        seed_manifest(&cache, gid, 1000 - i as u64 * 10);
    }
    let mut j = install_job("570", &a, "4");
    j.finalize = None;
    assert_eq!(prune_after_install(&cache, &j).unwrap(), 0);
    let mut j = install_job("570", &a, "4");
    j.mode = gamelib_depot::job::JobMode::VerifyOnly;
    assert_eq!(prune_after_install(&cache, &j).unwrap(), 0);
    assert_eq!(cached(&cache), vec!["1", "2", "3", "4"]);
}
