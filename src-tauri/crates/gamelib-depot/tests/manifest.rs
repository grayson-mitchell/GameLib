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
    cdn_less.prune("10", "1");
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
