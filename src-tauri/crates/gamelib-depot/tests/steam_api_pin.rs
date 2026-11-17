//! Resolution of the pinned libsteam_api.dylib (quick 261117-ubb): snapshot, CDN fetch and every
//! integrity failure, driven through a fake `PinIo`, plus a local-server test of `LiveIo::fetch`'s
//! bounds and one `#[ignore]`d check against Valve's real CDN.

#[allow(dead_code)]
#[path = "support/encode.rs"]
mod encode;

use gamelib_depot::steam_api_pin::{
    cached_path, layout_for_home, resolve_with, LiveIo, PinIo, PinLayout, Resolution, Source,
    SteamApiPin, CDN_HOSTS, PIN,
};
use sha2::{Digest, Sha256};
use std::cell::RefCell;
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::Path;
use std::time::{Duration, Instant};

const MEMBER_PATH: &str = "Frameworks/Steam Helper.app/Contents/MacOS/libsteam_api.dylib";

fn sha_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn leak(s: String) -> &'static str {
    Box::leak(s.into_boxed_str())
}

/// A synthetic pin over `member`, plus the VZ package a CDN would serve for it.
fn synthetic(member: &[u8]) -> (SteamApiPin, Vec<u8>) {
    let zip = encode::zip_named(&[
        (
            "Frameworks\\Steam Helper.app\\Contents\\Info.plist",
            b"plist",
        ),
        (
            "Frameworks/Steam Helper.app/Contents/MacOS/Steam Helper",
            b"helper",
        ),
        (MEMBER_PATH, member),
        ("trailer.txt", b"tail"),
    ]);
    let package = encode::vz_wrap(&zip);
    let pin = SteamApiPin {
        package: leak(format!("webhelpers_test.zip.vz.abc_{}", package.len())),
        package_sha256: leak(sha_hex(&package)),
        package_size: package.len() as u64,
        member: MEMBER_PATH,
        dylib_sha256: leak(sha_hex(member)),
        dylib_size: member.len() as u64,
        ..PIN
    };
    (pin, package)
}

/// Serves bytes per URL, honouring `max_bytes` like the live client, and records what was asked.
struct FakeIo {
    bodies: HashMap<String, Result<Vec<u8>, String>>,
    signature: Result<(), String>,
    fetched: RefCell<Vec<String>>,
    signed: RefCell<Vec<String>>,
}

impl FakeIo {
    fn new() -> Self {
        Self {
            bodies: HashMap::new(),
            signature: Ok(()),
            fetched: RefCell::new(Vec::new()),
            signed: RefCell::new(Vec::new()),
        }
    }

    fn serving(mut self, host: &str, pin: &SteamApiPin, body: Result<Vec<u8>, String>) -> Self {
        self.bodies
            .insert(format!("https://{host}/{}", pin.package), body);
        self
    }
}

impl PinIo for FakeIo {
    fn fetch(&self, url: &str, max_bytes: u64, _deadline: Instant) -> Result<Vec<u8>, String> {
        self.fetched.borrow_mut().push(url.to_string());
        match self.bodies.get(url) {
            None => Err("http-404".to_string()),
            Some(Err(e)) => Err(e.clone()),
            Some(Ok(b)) if b.len() as u64 > max_bytes => Err("too-large".to_string()),
            Some(Ok(b)) => Ok(b.clone()),
        }
    }

    fn verify_signature(&self, path: &Path, _team_id: &str) -> Result<(), String> {
        self.signed
            .borrow_mut()
            .push(path.file_name().unwrap().to_string_lossy().into_owned());
        self.signature.clone()
    }
}

fn layout(dir: &Path) -> PinLayout {
    layout_for_home(dir.to_str()).expect("layout")
}

fn write_client_copy(layout: &PinLayout, bytes: &[u8]) {
    fs::create_dir_all(layout.client_copy.parent().unwrap()).unwrap();
    fs::write(&layout.client_copy, bytes).unwrap();
}

/// No temp file survives in the cache directory; returns the names present.
fn assert_no_partial(layout: &PinLayout, pin: &SteamApiPin) -> Vec<String> {
    let dir = cached_path(layout, pin).parent().unwrap().to_path_buf();
    let names: Vec<String> = match fs::read_dir(&dir) {
        Ok(rd) => rd
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect(),
        Err(_) => Vec::new(),
    };
    assert!(
        names.iter().all(|n| !n.contains(".partial")),
        "partial file survived: {names:?}"
    );
    names
}

fn detail(r: &Resolution) -> String {
    r.detail.clone().unwrap_or_default()
}

#[test]
fn matching_client_copy_is_snapshotted_with_no_fetch() {
    let member = b"pinned dylib bytes \x00\x01\x02".repeat(50);
    let (pin, _package) = synthetic(&member);
    let dir = tempfile::tempdir().unwrap();
    let layout = layout(dir.path());
    write_client_copy(&layout, &member);

    let io = FakeIo::new();
    let r = resolve_with(&layout, &pin, &io);

    assert_eq!(r.source, Source::Snapshot);
    let path = cached_path(&layout, &pin);
    assert_eq!(r.path.as_deref(), path.to_str());
    assert_eq!(fs::read(&path).unwrap(), member);
    assert!(io.fetched.borrow().is_empty(), "snapshot must not fetch");
    assert_eq!(io.signed.borrow().len(), 1, "snapshot is signature-checked");
    assert_no_partial(&layout, &pin);
}

#[test]
fn mismatched_client_copy_falls_through_to_the_fetch() {
    let member = b"the pinned build".repeat(40);
    let (pin, package) = synthetic(&member);
    let dir = tempfile::tempdir().unwrap();
    let layout = layout(dir.path());
    write_client_copy(&layout, b"a newer client build, different bytes");

    let io = FakeIo::new().serving(CDN_HOSTS[0], &pin, Ok(package));
    let r = resolve_with(&layout, &pin, &io);

    assert_eq!(r.source, Source::Fetched, "{}", detail(&r));
    assert_eq!(fs::read(cached_path(&layout, &pin)).unwrap(), member);
    assert!(detail(&r).contains("client=mismatch"));
    assert_no_partial(&layout, &pin);
}

#[test]
fn first_host_failing_and_second_succeeding_is_fetched() {
    let member = b"member bytes".repeat(100);
    let (pin, package) = synthetic(&member);
    let dir = tempfile::tempdir().unwrap();
    let layout = layout(dir.path());

    let io = FakeIo::new()
        .serving(CDN_HOSTS[0], &pin, Err("connect".to_string()))
        .serving(CDN_HOSTS[1], &pin, Ok(package));
    let r = resolve_with(&layout, &pin, &io);

    assert_eq!(r.source, Source::Fetched, "{}", detail(&r));
    assert!(detail(&r).contains(&format!("cdn={}:connect", CDN_HOSTS[0])));
    assert_eq!(io.fetched.borrow().len(), 2);
}

#[test]
fn a_second_resolve_after_fetched_is_cached() {
    let member = b"cache me".repeat(64);
    let (pin, package) = synthetic(&member);
    let dir = tempfile::tempdir().unwrap();
    let layout = layout(dir.path());
    let io = FakeIo::new().serving(CDN_HOSTS[0], &pin, Ok(package));

    assert_eq!(resolve_with(&layout, &pin, &io).source, Source::Fetched);
    let fetches = io.fetched.borrow().len();
    let again = resolve_with(&layout, &pin, &io);
    assert_eq!(again.source, Source::Cached);
    assert_eq!(io.fetched.borrow().len(), fetches, "cached must not fetch");
}

#[test]
fn a_wrong_package_hash_is_unpinned_naming_the_step() {
    let member = b"member".repeat(100);
    let (pin, mut package) = synthetic(&member);
    let dir = tempfile::tempdir().unwrap();
    let layout = layout(dir.path());
    package[20] ^= 0xff; // same length, different bytes
    let io = FakeIo::new()
        .serving(CDN_HOSTS[0], &pin, Ok(package.clone()))
        .serving(CDN_HOSTS[1], &pin, Ok(package));

    let r = resolve_with(&layout, &pin, &io);

    assert_eq!(r.source, Source::Unpinned);
    assert_eq!(r.path, None);
    assert_eq!(
        detail(&r),
        format!(
            "cache=miss;client=absent;cdn={}:sha2vz-mismatch;cdn={}:sha2vz-mismatch",
            CDN_HOSTS[0], CDN_HOSTS[1]
        )
    );
    assert!(!cached_path(&layout, &pin).exists());
    assert_no_partial(&layout, &pin);
}

#[test]
fn a_decoded_member_with_the_wrong_hash_is_unpinned() {
    let member = b"honest member".repeat(100);
    let (pin, _) = synthetic(&member);
    // A package that is internally valid and hashes to the pin's package_sha256, but whose member
    // differs from the pinned dylib: the pin is built over the tampered package.
    let tampered_zip = encode::zip_named(&[(MEMBER_PATH, b"a different dylib".as_slice())]);
    let tampered = encode::vz_wrap(&tampered_zip);
    let pin = SteamApiPin {
        package_sha256: leak(sha_hex(&tampered)),
        package_size: tampered.len() as u64,
        package: leak(format!("webhelpers_test.zip.vz.abc_{}", tampered.len())),
        ..pin
    };
    let dir = tempfile::tempdir().unwrap();
    let layout = layout(dir.path());
    let io = FakeIo::new()
        .serving(CDN_HOSTS[0], &pin, Ok(tampered.clone()))
        .serving(CDN_HOSTS[1], &pin, Ok(tampered));

    let r = resolve_with(&layout, &pin, &io);

    assert_eq!(r.source, Source::Unpinned);
    assert!(
        detail(&r).contains(&format!("cdn={}:", CDN_HOSTS[0]))
            && (detail(&r).contains("dylib-sha256-mismatch") || detail(&r).contains("member-")),
        "{}",
        detail(&r)
    );
    assert!(!cached_path(&layout, &pin).exists());
    assert_no_partial(&layout, &pin);
}

#[test]
fn a_rejected_signature_is_unpinned_and_leaves_no_file() {
    let member = b"member bytes".repeat(100);
    let (pin, package) = synthetic(&member);
    let dir = tempfile::tempdir().unwrap();
    let layout = layout(dir.path());
    let mut io = FakeIo::new()
        .serving(CDN_HOSTS[0], &pin, Ok(package.clone()))
        .serving(CDN_HOSTS[1], &pin, Ok(package));
    io.signature = Err("team-id-mismatch".to_string());

    let r = resolve_with(&layout, &pin, &io);

    assert_eq!(r.source, Source::Unpinned);
    assert!(
        detail(&r).contains(&format!("cdn={}:signature-team-id-mismatch", CDN_HOSTS[0])),
        "{}",
        detail(&r)
    );
    assert!(!cached_path(&layout, &pin).exists());
    assert_no_partial(&layout, &pin);
}

#[test]
fn an_oversized_body_is_rejected() {
    let member = b"member bytes".repeat(100);
    let (pin, package) = synthetic(&member);
    let dir = tempfile::tempdir().unwrap();
    let layout = layout(dir.path());
    let mut huge = package;
    huge.extend_from_slice(&[0u8; 64]);
    let io = FakeIo::new()
        .serving(CDN_HOSTS[0], &pin, Ok(huge.clone()))
        .serving(CDN_HOSTS[1], &pin, Ok(huge));

    let r = resolve_with(&layout, &pin, &io);

    assert_eq!(r.source, Source::Unpinned);
    assert!(detail(&r).contains(&format!("cdn={}:too-large", CDN_HOSTS[0])));
}

#[cfg(unix)]
#[test]
fn cache_dir_is_0700_and_file_is_0444() {
    use std::os::unix::fs::PermissionsExt;
    let member = b"perm check".repeat(100);
    let (pin, package) = synthetic(&member);
    let dir = tempfile::tempdir().unwrap();
    let layout = layout(dir.path());
    let io = FakeIo::new().serving(CDN_HOSTS[0], &pin, Ok(package));

    let r = resolve_with(&layout, &pin, &io);
    assert_eq!(r.source, Source::Fetched, "{}", detail(&r));

    let file = cached_path(&layout, &pin);
    let mode = |p: &Path| fs::metadata(p).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode(&file), 0o444);
    assert_eq!(mode(file.parent().unwrap()), 0o700);
    assert_eq!(mode(&layout.cache_root), 0o700);
}

// ---- LiveIo::fetch against a local HTTP server: the size bounds and no-redirect rule ----------

/// Serves one canned response per connection on 127.0.0.1, then returns the base URL.
fn serve_once(response: Vec<u8>) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    std::thread::spawn(move || {
        if let Ok((mut stream, _)) = listener.accept() {
            let mut buf = [0u8; 1024];
            let _ = stream.read(&mut buf);
            let _ = stream.write_all(&response);
            let _ = stream.flush();
        }
    });
    format!("http://127.0.0.1:{port}/pkg")
}

fn http(status: &str, headers: &[&str], body: &[u8]) -> Vec<u8> {
    let mut r = format!("HTTP/1.1 {status}\r\nConnection: close\r\n");
    for h in headers {
        r.push_str(h);
        r.push_str("\r\n");
    }
    r.push_str("\r\n");
    let mut v = r.into_bytes();
    v.extend_from_slice(body);
    v
}

fn deadline() -> Instant {
    Instant::now() + Duration::from_secs(20)
}

#[test]
fn live_fetch_returns_an_exact_length_body() {
    let body = vec![7u8; 4096];
    let url = serve_once(http("200 OK", &["Content-Length: 4096"], &body));
    assert_eq!(LiveIo.fetch(&url, 4096, deadline()).unwrap(), body);
}

#[test]
fn live_fetch_rejects_a_content_length_that_differs() {
    let url = serve_once(http("200 OK", &["Content-Length: 5000"], &[1u8; 5000]));
    assert_eq!(
        LiveIo.fetch(&url, 4096, deadline()).unwrap_err(),
        "length-mismatch"
    );
}

#[test]
fn live_fetch_stops_a_chunked_body_that_exceeds_max_bytes() {
    // No Content-Length: the bound must hold on the bytes read, not on a header.
    let url = serve_once(http("200 OK", &[], &[9u8; 100_000]));
    assert_eq!(
        LiveIo.fetch(&url, 4096, deadline()).unwrap_err(),
        "too-large"
    );
}

#[test]
fn live_fetch_does_not_follow_a_redirect_or_accept_non_200() {
    let url = serve_once(http(
        "302 Found",
        &["Location: https://example.invalid/x", "Content-Length: 0"],
        b"",
    ));
    assert_eq!(
        LiveIo.fetch(&url, 4096, deadline()).unwrap_err(),
        "http-302"
    );
    let url = serve_once(http("404 Not Found", &["Content-Length: 0"], b""));
    assert_eq!(
        LiveIo.fetch(&url, 4096, deadline()).unwrap_err(),
        "http-404"
    );
}

#[test]
fn live_fetch_past_its_deadline_fails_without_connecting() {
    let url = serve_once(http("200 OK", &["Content-Length: 1"], b"x"));
    let past = Instant::now() - Duration::from_secs(1);
    assert_eq!(LiveIo.fetch(&url, 1, past).unwrap_err(), "deadline");
}

#[test]
#[ignore = "networked: fetches the real pin from Valve's client-update CDN"]
fn live_cdn_fetches_the_real_pin_and_then_serves_it_from_cache() {
    let dir = tempfile::tempdir().unwrap();
    let layout = layout(dir.path());
    // The tempdir layout has no Steam client copy, so this exercises the CDN path.
    let first = resolve_with(&layout, &PIN, &LiveIo);
    assert_eq!(first.source, Source::Fetched, "{}", detail(&first));
    let path = cached_path(&layout, &PIN);
    let bytes = fs::read(&path).unwrap();
    assert_eq!(sha_hex(&bytes), PIN.dylib_sha256);
    assert_eq!(bytes.len() as u64, PIN.dylib_size);
    // On macOS `resolve_with` already ran codesign -v and the Valve team-ID check before caching.

    let second = resolve_with(&layout, &PIN, &LiveIo);
    assert_eq!(second.source, Source::Cached);
    eprintln!(
        "live pin resolved: first={:?} second={:?}",
        first.detail, second.detail
    );
}
