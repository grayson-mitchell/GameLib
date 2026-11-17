//! The pinned, Valve-signed `libsteam_api.dylib` the macOS bridge helper loads (quick 261117-ubb).
//!
//! Valve replaces the Steam client's own copy on every client update, and the Nov 10 update broke
//! every bridge launch that way. The helper therefore loads a copy GameLib pins: the Oct 21 client
//! build, SteamUser v023 / MatchmakingServers v003 (spikes 087/088/089).
//!
//! [`resolve`] finds that file, in order: the GameLib cache, a snapshot of the Steam client's own
//! copy when it already hashes to the pin, then Valve's client-update CDN. It never returns the
//! client copy for loading: when nothing pinned is found the result is `unpinned` and the helper
//! falls back to the Steam-tree path it derives from `$HOME` itself.
//!
//! Nothing here touches the network or the filesystem at import time, and every path is derived
//! from an explicit `home` by [`layout_for_home`], never handed in by the caller.

use serde::Serialize;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use crate::container::{unzip_entry_named, unzip_manifest};
use crate::download::hex;

/// The pinned package and the file inside it. Bumped ONLY together with a `pnpm gen-vtables`
/// regeneration of `native/steam-bridge/generated/bridge_dispatch.h` and the sha in
/// `native/steam-bridge/helper/gamelib_steam_api_pin.h`: the pin selects which SteamUser /
/// MatchmakingServers versions the helper's dispatch table can resolve. The coherence test in this
/// module fails when the three disagree.
#[derive(Debug, Clone, Copy)]
pub struct SteamApiPin {
    /// Package file name on the CDN (client build in `client_build`, built 2026-10-21).
    pub package: &'static str,
    /// sha256 of the package file as served, the manifest's `sha2vz` (NOT its `sha2`).
    pub package_sha256: &'static str,
    pub package_size: u64,
    /// Zip member holding the dylib (stored, method 0).
    pub member: &'static str,
    pub dylib_sha256: &'static str,
    pub dylib_size: u64,
    /// The accessor the pinned dylib exports, spelled as in `nm -gU`.
    pub steam_user: &'static str,
    pub valve_team_id: &'static str,
    pub client_build: &'static str,
}

pub const PIN: SteamApiPin = SteamApiPin {
    package: "webhelpers_osx.zip.vz.6d8f8e88928b53e6d7210fc2d7dab15760bd49d9_2348800",
    package_sha256: "8b9993c58577eec72895d85d6e113dbb226b1b5ecaff019c74f2bdb93c988ddb",
    package_size: 2_348_800,
    member: "Frameworks/Steam Helper.app/Contents/MacOS/libsteam_api.dylib",
    dylib_sha256: "4162eb404dd42f572e7514f906f9ad5e16b7ab9c3ad29f3a532dacbc30e16bac",
    dylib_size: 395_104,
    steam_user: "SteamUser_v023",
    valve_team_id: "MXGJJ98X76",
    client_build: "1792618285",
};

/// Valve client-update hosts, tried in order. URL form: `https://<host>/<package>`.
pub const CDN_HOSTS: [&str; 2] = [
    "client-update.steamstatic.com",
    "client-update.akamai.steamstatic.com",
];

/// File name of the cached dylib (and of the member's basename).
const DYLIB_NAME: &str = "libsteam_api.dylib";

/// Where the pin lives on disk, derived purely from the user's home directory.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PinLayout {
    /// `<home>/Library/Application Support/GameLib/steam-api`. `GameLib` is the sidecar's own
    /// `APP_NAME_SEGMENT`, so the cache sits in GameLib's appFolder.
    pub cache_root: PathBuf,
    /// The Steam client's own copy, which Valve replaces on every client update.
    pub client_copy: PathBuf,
}

/// Pure path derivation from an explicit `home` (no env reads, the `single_instance_dir` pattern).
/// `None` or an empty home gives `None`.
pub fn layout_for_home(home: Option<&str>) -> Option<PinLayout> {
    let home = home.filter(|h| !h.is_empty())?;
    let support = Path::new(home).join("Library").join("Application Support");
    Some(PinLayout {
        cache_root: support.join("GameLib").join("steam-api"),
        client_copy: support
            .join("Steam")
            .join("Steam.AppBundle")
            .join("Steam")
            .join("Contents")
            .join("MacOS")
            .join("Frameworks")
            .join("Steam Helper.app")
            .join("Contents")
            .join("MacOS")
            .join(DYLIB_NAME),
    })
}

/// `<cache_root>/<dylib sha256>/libsteam_api.dylib`.
pub fn cached_path(layout: &PinLayout, pin: &SteamApiPin) -> PathBuf {
    layout.cache_root.join(pin.dylib_sha256).join(DYLIB_NAME)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    Cached,
    Snapshot,
    Fetched,
    Unpinned,
    Unsupported,
}

/// The wire reply of `steam_api_pin_resolve`. `path` is set only for cached/snapshot/fetched.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resolution {
    pub source: Source,
    pub path: Option<String>,
    pub pin_sha256: String,
    pub steam_user: String,
    /// Semicolon-joined step log, e.g. `cache=miss`.
    pub detail: Option<String>,
}

impl Resolution {
    fn found(source: Source, path: &Path, pin: &SteamApiPin, detail: &[String]) -> Self {
        Self {
            source,
            path: Some(path.to_string_lossy().into_owned()),
            pin_sha256: pin.dylib_sha256.to_string(),
            steam_user: pin.steam_user.to_string(),
            detail: join_detail(detail),
        }
    }

    pub fn unpinned(pin: &SteamApiPin, detail: &[String]) -> Self {
        Self {
            source: Source::Unpinned,
            path: None,
            pin_sha256: pin.dylib_sha256.to_string(),
            steam_user: pin.steam_user.to_string(),
            detail: join_detail(detail),
        }
    }

    /// Non-macOS: the channel answers without touching the network or the filesystem.
    pub fn unsupported(pin: &SteamApiPin) -> Self {
        Self {
            source: Source::Unsupported,
            path: None,
            pin_sha256: pin.dylib_sha256.to_string(),
            steam_user: pin.steam_user.to_string(),
            detail: None,
        }
    }
}

fn join_detail(detail: &[String]) -> Option<String> {
    if detail.is_empty() {
        None
    } else {
        Some(detail.join(";"))
    }
}

/// Streams `path` through sha256 and returns the lowercase hex digest.
fn sha256_file(path: &Path) -> std::io::Result<String> {
    use sha2::{Digest, Sha256};
    let mut f = fs::File::open(path)?;
    let mut h = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(hex(&h.finalize()))
}

#[derive(Debug, PartialEq, Eq)]
enum CacheState {
    Hit,
    Miss,
    Mismatch,
}

/// Step 1. The file must be a regular file (never a symlink: `symlink_metadata`), and its bytes
/// must hash to the pin. A mismatching entry is removed so the next step can rewrite it.
fn check_cached(path: &Path, pin: &SteamApiPin) -> CacheState {
    let meta = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return CacheState::Miss,
        Err(_) => return CacheState::Mismatch,
    };
    if !meta.file_type().is_file() {
        // A symlink or a directory: never trusted. remove_file unlinks a symlink itself, and
        // fails harmlessly on a directory.
        let _ = fs::remove_file(path);
        return CacheState::Mismatch;
    }
    match sha256_file(path) {
        Ok(got) if got == pin.dylib_sha256 => CacheState::Hit,
        _ => {
            let _ = fs::remove_file(path);
            CacheState::Mismatch
        }
    }
}

/// Serializes resolution process-wide, so concurrent worker threads never race a cache write.
static RESOLVE_LOCK: Mutex<()> = Mutex::new(());

/// The whole resolve (every CDN attempt included) gives up here, under the sidecar's 60 s
/// `RUST_INVOKE_TIMEOUT_MS`. Connect is bounded at 10 s and one request at 45 s by [`LiveIo`].
const RESOLVE_DEADLINE: Duration = Duration::from_secs(50);

/// The two things resolution needs from the outside world, so tests can drive every step without
/// a network or a codesign binary.
pub trait PinIo {
    /// GETs `url` (HTTPS, no redirects) and returns the body, never reading more than `max_bytes`.
    /// The error is a short code, never a URL or a body.
    fn fetch(&self, url: &str, max_bytes: u64, deadline: Instant) -> Result<Vec<u8>, String>;
    /// Checks the file at `path` is validly signed by Apple team `team_id`.
    fn verify_signature(&self, path: &Path, team_id: &str) -> Result<(), String>;
}

/// The real network and `codesign`.
pub struct LiveIo;

/// One client per process. No redirects: the CDN names the exact file, so a redirect is a failure.
fn pin_client() -> Option<&'static reqwest::Client> {
    static CLIENT: OnceLock<Option<reqwest::Client>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            crate::fetch::install_crypto_provider();
            reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .connect_timeout(Duration::from_secs(10))
                .timeout(Duration::from_secs(45))
                .user_agent("GameLib")
                .build()
                .ok()
        })
        .as_ref()
}

fn request_code(e: &reqwest::Error) -> &'static str {
    if e.is_timeout() {
        "timeout"
    } else if e.is_connect() {
        "connect"
    } else {
        "request"
    }
}

impl PinIo for LiveIo {
    fn fetch(&self, url: &str, max_bytes: u64, deadline: Instant) -> Result<Vec<u8>, String> {
        let client = pin_client().ok_or_else(|| "client".to_string())?;
        let remaining = deadline
            .checked_duration_since(Instant::now())
            .filter(|d| !d.is_zero())
            .ok_or_else(|| "deadline".to_string())?;
        crate::runtime().block_on(async {
            tokio::time::timeout(remaining, async {
                let mut resp = client
                    .get(url)
                    .send()
                    .await
                    .map_err(|e| request_code(&e).to_string())?;
                let status = resp.status().as_u16();
                if status != 200 {
                    return Err(format!("http-{status}"));
                }
                // The package is one exact, content-addressed file.
                if resp.content_length().is_some_and(|len| len != max_bytes) {
                    return Err("length-mismatch".to_string());
                }
                let mut body = Vec::with_capacity(usize::try_from(max_bytes).unwrap_or(0));
                while let Some(chunk) = resp
                    .chunk()
                    .await
                    .map_err(|e| request_code(&e).to_string())?
                {
                    if (body.len() as u64).saturating_add(chunk.len() as u64) > max_bytes {
                        return Err("too-large".to_string());
                    }
                    body.extend_from_slice(&chunk);
                }
                Ok(body)
            })
            .await
            .unwrap_or_else(|_| Err("deadline".to_string()))
        })
    }

    #[cfg(target_os = "macos")]
    fn verify_signature(&self, path: &Path, team_id: &str) -> Result<(), String> {
        use std::process::Command;
        let valid = Command::new("/usr/bin/codesign")
            .arg("-v")
            .arg(path)
            .output()
            .map_err(|_| "codesign-spawn".to_string())?;
        if !valid.status.success() {
            return Err("codesign-invalid".to_string());
        }
        let details = Command::new("/usr/bin/codesign")
            .args(["-dv", "--verbose=2"])
            .arg(path)
            .output()
            .map_err(|_| "codesign-spawn".to_string())?;
        // codesign prints its details on stderr.
        let want = format!("TeamIdentifier={team_id}");
        if String::from_utf8_lossy(&details.stderr)
            .lines()
            .any(|l| l.trim() == want)
        {
            Ok(())
        } else {
            Err("team-id-mismatch".to_string())
        }
    }

    /// Resolution only runs on macOS; there is no Valve-signed Mach-O to check elsewhere.
    #[cfg(not(target_os = "macos"))]
    fn verify_signature(&self, _path: &Path, _team_id: &str) -> Result<(), String> {
        Ok(())
    }
}

fn sha256_bytes(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    hex(&Sha256::digest(bytes))
}

/// Writes `bytes` (already proven to hash to the pin) into the cache: directories 0700, a temp
/// file created exclusively in the final directory (0600), signature-checked, then made 0444 and
/// renamed into place, so a reader never sees a partial file. The temp file never survives.
fn commit(
    layout: &PinLayout,
    pin: &SteamApiPin,
    bytes: &[u8],
    io: &dyn PinIo,
) -> Result<PathBuf, String> {
    let final_path = cached_path(layout, pin);
    let dir = final_path
        .parent()
        .ok_or_else(|| "cache-dir".to_string())?
        .to_path_buf();
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(&dir).map_err(|_| "cache-dir".to_string())?;

    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let temp = dir.join(format!(
        ".{DYLIB_NAME}.partial-{}-{nanos}",
        std::process::id()
    ));
    let result = (|| -> Result<(), String> {
        let mut opts = fs::OpenOptions::new();
        opts.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            opts.mode(0o600);
        }
        let mut f = opts.open(&temp).map_err(|_| "cache-write".to_string())?;
        f.write_all(bytes).map_err(|_| "cache-write".to_string())?;
        f.sync_all().map_err(|_| "cache-write".to_string())?;
        drop(f);
        io.verify_signature(&temp, pin.valve_team_id)
            .map_err(|e| format!("signature-{e}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&temp, fs::Permissions::from_mode(0o444))
                .map_err(|_| "cache-write".to_string())?;
        }
        fs::rename(&temp, &final_path).map_err(|_| "cache-write".to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result.map(|()| final_path)
}

/// Step 2. The Steam client's own copy, when it already is the pinned build. Read once into memory
/// and hashed there, so the bytes committed are the bytes hashed.
fn snapshot(
    layout: &PinLayout,
    pin: &SteamApiPin,
    io: &dyn PinIo,
    detail: &mut Vec<String>,
) -> Option<PathBuf> {
    let path = &layout.client_copy;
    let meta = match fs::symlink_metadata(path) {
        Ok(m) if m.file_type().is_file() => m,
        Ok(_) => {
            detail.push("client=not-a-file".to_string());
            return None;
        }
        Err(_) => {
            detail.push("client=absent".to_string());
            return None;
        }
    };
    if meta.len() != pin.dylib_size {
        detail.push("client=mismatch".to_string());
        return None;
    }
    let Ok(bytes) = fs::read(path) else {
        detail.push("client=unreadable".to_string());
        return None;
    };
    if sha256_bytes(&bytes) != pin.dylib_sha256 {
        detail.push("client=mismatch".to_string());
        return None;
    }
    match commit(layout, pin, &bytes, io) {
        Ok(p) => Some(p),
        Err(e) => {
            detail.push(format!("client=commit-{e}"));
            None
        }
    }
}

/// Step 3. Valve's client-update CDN: package sha256 (`sha2vz`), VZ decode, member extraction,
/// dylib sha256, then the signature check inside [`commit`]. Every failure names its step.
fn fetch_from_cdn(
    layout: &PinLayout,
    pin: &SteamApiPin,
    io: &dyn PinIo,
    deadline: Instant,
    detail: &mut Vec<String>,
) -> Option<PathBuf> {
    for host in CDN_HOSTS {
        if Instant::now() >= deadline {
            detail.push("cdn=deadline".to_string());
            return None;
        }
        let url = format!("https://{host}/{}", pin.package);
        let body = match io.fetch(&url, pin.package_size, deadline) {
            Ok(b) => b,
            Err(e) => {
                detail.push(format!("cdn={host}:{e}"));
                continue;
            }
        };
        if sha256_bytes(&body) != pin.package_sha256 {
            detail.push(format!("cdn={host}:sha2vz-mismatch"));
            continue;
        }
        let zip = match unzip_manifest(&body) {
            Ok(z) => z,
            Err(e) => {
                detail.push(format!("cdn={host}:decode-{}", e.code));
                continue;
            }
        };
        let member = match unzip_entry_named(&zip, pin.member, pin.dylib_size) {
            Ok(m) => m,
            Err(e) => {
                detail.push(format!("cdn={host}:member-{}", e.code));
                continue;
            }
        };
        if sha256_bytes(&member) != pin.dylib_sha256 {
            detail.push(format!("cdn={host}:dylib-sha256-mismatch"));
            continue;
        }
        return match commit(layout, pin, &member, io) {
            Ok(p) => {
                detail.push(format!("cdn={host}:ok"));
                Some(p)
            }
            Err(e) => {
                // The same bytes would fail the same way on the other host.
                detail.push(format!("cdn={host}:{e}"));
                None
            }
        };
    }
    None
}

/// Resolves the pinned dylib: cached, else a snapshot of the matching client copy, else the CDN,
/// else `unpinned`. Never returns the client copy. Holds the process-wide lock throughout.
pub fn resolve_with(layout: &PinLayout, pin: &SteamApiPin, io: &dyn PinIo) -> Resolution {
    let _guard = RESOLVE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let deadline = Instant::now() + RESOLVE_DEADLINE;
    let mut detail: Vec<String> = Vec::new();

    let cached = cached_path(layout, pin);
    match check_cached(&cached, pin) {
        CacheState::Hit => return Resolution::found(Source::Cached, &cached, pin, &detail),
        CacheState::Miss => detail.push("cache=miss".to_string()),
        CacheState::Mismatch => detail.push("cache=mismatch".to_string()),
    }
    if let Some(path) = snapshot(layout, pin, io, &mut detail) {
        return Resolution::found(Source::Snapshot, &path, pin, &detail);
    }
    if let Some(path) = fetch_from_cdn(layout, pin, io, deadline, &mut detail) {
        return Resolution::found(Source::Fetched, &path, pin, &detail);
    }
    Resolution::unpinned(pin, &detail)
}

/// [`resolve_with`] over the real network and `codesign`.
pub fn resolve(layout: &PinLayout, pin: &SteamApiPin) -> Resolution {
    resolve_with(layout, pin, &LiveIo)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    fn leak(s: String) -> &'static str {
        Box::leak(s.into_boxed_str())
    }

    /// A synthetic pin over `bytes`; every other field is the real pin's.
    fn pin_over(bytes: &[u8]) -> SteamApiPin {
        SteamApiPin {
            dylib_sha256: leak(hex(&Sha256::digest(bytes))),
            dylib_size: bytes.len() as u64,
            ..PIN
        }
    }

    /// An Io that must never be reached: a unit test that touches it has leaked into the network.
    struct NoIo;
    impl PinIo for NoIo {
        fn fetch(&self, _: &str, _: u64, _: Instant) -> Result<Vec<u8>, String> {
            Err("no-network-in-unit-tests".to_string())
        }
        fn verify_signature(&self, _: &Path, _: &str) -> Result<(), String> {
            Ok(())
        }
    }

    fn layout_in(dir: &Path) -> PinLayout {
        layout_for_home(dir.to_str()).expect("layout")
    }

    fn write_cached(layout: &PinLayout, pin: &SteamApiPin, bytes: &[u8]) -> PathBuf {
        let path = cached_path(layout, pin);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, bytes).unwrap();
        path
    }

    #[test]
    fn layout_for_home_derives_both_paths() {
        let l = layout_for_home(Some("/Users/x")).unwrap();
        assert_eq!(
            l.cache_root,
            PathBuf::from("/Users/x/Library/Application Support/GameLib/steam-api")
        );
        assert_eq!(
            l.client_copy,
            PathBuf::from(
                "/Users/x/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS/Frameworks/Steam Helper.app/Contents/MacOS/libsteam_api.dylib"
            )
        );
    }

    #[test]
    fn layout_for_home_none_or_empty_is_none() {
        assert_eq!(layout_for_home(None), None);
        assert_eq!(layout_for_home(Some("")), None);
    }

    #[test]
    fn cached_file_with_matching_sha_resolves_cached() {
        let dir = tempfile::tempdir().unwrap();
        let layout = layout_in(dir.path());
        let pin = pin_over(b"pinned dylib bytes");
        let path = write_cached(&layout, &pin, b"pinned dylib bytes");
        let r = resolve_with(&layout, &pin, &NoIo);
        assert_eq!(r.source, Source::Cached);
        assert_eq!(r.path.as_deref(), path.to_str());
        assert_eq!(r.pin_sha256, pin.dylib_sha256);
    }

    #[test]
    fn mismatched_cache_is_removed_and_unpinned() {
        let dir = tempfile::tempdir().unwrap();
        let layout = layout_in(dir.path());
        let pin = pin_over(b"pinned dylib bytes");
        let path = write_cached(&layout, &pin, b"tampered");
        let r = resolve_with(&layout, &pin, &NoIo);
        assert_eq!(r.source, Source::Unpinned);
        assert_eq!(r.path, None);
        assert!(r.detail.as_deref().unwrap().starts_with("cache=mismatch;"));
        assert!(!path.exists(), "a mismatching cache file must be removed");
    }

    #[cfg(unix)]
    #[test]
    fn symlink_at_the_cache_path_is_not_accepted() {
        let dir = tempfile::tempdir().unwrap();
        let layout = layout_in(dir.path());
        let pin = pin_over(b"pinned dylib bytes");
        let real = dir.path().join("real.dylib");
        fs::write(&real, b"pinned dylib bytes").unwrap();
        let path = cached_path(&layout, &pin);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::os::unix::fs::symlink(&real, &path).unwrap();
        let r = resolve_with(&layout, &pin, &NoIo);
        assert_eq!(r.source, Source::Unpinned);
        assert!(r.detail.as_deref().unwrap().starts_with("cache=mismatch;"));
        assert!(real.exists(), "only the link is removed, never its target");
    }

    #[test]
    fn no_cache_file_is_unpinned_miss() {
        let dir = tempfile::tempdir().unwrap();
        let layout = layout_in(dir.path());
        let r = resolve_with(&layout, &pin_over(b"x"), &NoIo);
        assert_eq!(r.source, Source::Unpinned);
        assert_eq!(r.path, None);
        assert!(r.detail.as_deref().unwrap().starts_with("cache=miss;"));
    }

    #[test]
    fn resolution_serializes_camel_case_with_lowercase_source() {
        let v = serde_json::to_value(Resolution::unsupported(&PIN)).unwrap();
        assert_eq!(v["source"], "unsupported");
        assert!(v["path"].is_null());
        assert_eq!(v["pinSha256"], PIN.dylib_sha256);
        assert_eq!(v["steamUser"], "SteamUser_v023");
    }

    fn is_hex64(s: &str) -> bool {
        s.len() == 64 && s.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
    }

    #[test]
    fn pin_record_is_well_formed() {
        assert!(is_hex64(PIN.package_sha256));
        assert!(is_hex64(PIN.dylib_sha256));
        assert!(PIN.package.ends_with(&format!("_{}", PIN.package_size)));
        assert!(PIN.member.ends_with("/libsteam_api.dylib"));
    }

    #[test]
    fn pin_matches_the_helper_header() {
        let header = include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../native/steam-bridge/helper/gamelib_steam_api_pin.h"
        ));
        let want = format!(
            "#define GAMELIB_STEAM_API_PIN_SHA256 \"{}\"",
            PIN.dylib_sha256
        );
        assert!(
            header.contains(&want),
            "helper header pin disagrees with PIN.dylib_sha256"
        );
        let want_user = format!(
            "#define GAMELIB_STEAM_API_PIN_STEAMUSER \"{}\"",
            PIN.steam_user
        );
        assert!(
            header.contains(&want_user),
            "helper header SteamUser accessor disagrees with PIN.steam_user"
        );
    }

    #[test]
    fn pin_matches_the_generated_dispatch_surface() {
        let dispatch = include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../native/steam-bridge/generated/bridge_dispatch.h"
        ));
        let line = dispatch
            .lines()
            .find(|l| l.contains("Interfaces covered:"))
            .expect("bridge_dispatch.h has an Interfaces covered line");
        // `SteamUser_v023` is spelled `SteamUser023` in the generated list.
        let spelled = PIN.steam_user.replacen("_v", "", 1);
        let listed: Vec<&str> = line
            .split("Interfaces covered:")
            .nth(1)
            .unwrap()
            .split(',')
            .map(|s| s.trim().trim_end_matches('.'))
            .collect();
        assert!(
            listed.contains(&spelled.as_str()),
            "bridge_dispatch.h does not cover {spelled}; the pin and the dispatch surface drifted"
        );
    }
}
