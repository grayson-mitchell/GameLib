//! Anti-cheat compatibility info (Phase 86, SVC-01), ported from `src/backend/anticheat/utils.ts`.
//!
//! The data is the community AreWeAntiCheatYet list (the Heroic MacAnticheatData list on macOS),
//! kept as the plain file `<appFolder>/areweanticheatyet.json`. D-18 names it as the one exception
//! to "persisted state goes through the StoreHost": it is a downloaded copy of somebody else's
//! document, not GameLib state, so it is read and written with `std::fs` on that one path.
//!
//! [`info`] is the renderer's lookup. Parity quirks of the TS original are copied, not fixed (D-03):
//! - only the FILE side is lower-cased, so an upper-case argument finds nothing;
//! - an entry with no truthy `storeIds.epic.namespace` never matches, even on its Steam id;
//! - a file that is not a JSON array, or a malformed entry in front of the match (not an object, or
//!   without `storeIds`, or a truthy non-string namespace), throws inside the TS `find` and so
//!   answers `null` for the whole lookup;
//! - the TS `find` answered `undefined` for no match; Rust answers `null`, which the renderer
//!   receives identically over IPC (D-03, todo 2026-11-22-anticheat-lookup-returned-undefined).
//!
//! The data refresh is two ops so TS can keep its online wait between them (D-07, D-28): [`status`]
//! answers whether a download is needed from the local file's MD5, then TS runs
//! `runOnceWhenOnline(download)`. Rust has no online logic of its own in this phase. [`download`]
//! fetches the platform's feed as raw text and writes it to a temp name in the app folder and then
//! renames it over the data file, so an interrupted write never leaves a half file (TS wrote the
//! file in place; this is the one deliberate improvement).

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use md5::{Digest, Md5};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::ctx::{InfoCtx, Platform};
use crate::http::Request;

/// The data file, inside the app folder.
pub const DATA_FILE: &str = "areweanticheatyet.json";

/// The longest argument an op accepts, in UTF-16 code units (the renderer-facing zod bound).
pub const NAMESPACE_MAX_UTF16: usize = 1024;

/// The macOS feed (Heroic's MacAnticheatData list).
pub const MAC_URL: &str =
    "https://raw.githubusercontent.com/Heroic-Games-Launcher/MacAnticheatData/main/games.json";

/// The Linux feed (AreWeAntiCheatYet).
pub const LINUX_URL: &str =
    "https://raw.githubusercontent.com/Starz0r/AreWeAntiCheatYet/HEAD/games.json";

/// The shared `axiosClient`'s timeout.
const TIMEOUT: Duration = Duration::from_secs(10);

/// `{appNamespace?}`: the Epic namespace of the game on the page. Absent means no namespace (the
/// TS `undefined`). Unknown fields are rejected.
#[derive(Debug, Clone, Default, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct InfoArgs {
    #[serde(default)]
    pub app_namespace: Option<String>,
}

/// `{latestFileHash?}`: the MD5 hex the release feed advertises for the current data file. Absent
/// (or empty, which the TS treated as absent) means "unknown, so changed". Unknown fields are
/// rejected.
#[derive(Debug, Clone, Default, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct StatusArgs {
    #[serde(default)]
    pub latest_file_hash: Option<String>,
}

/// `{}`: the download takes nothing. Unknown fields are rejected.
#[derive(Debug, Clone, Default, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct DownloadArgs {}

/// Where the data file lives.
pub fn data_path(ctx: &InfoCtx) -> PathBuf {
    ctx.paths.app_folder.join(DATA_FILE)
}

/// The entry of the data file whose Epic namespace contains `args.app_namespace`, or `null`.
///
/// `null` as well for: no namespace given, Windows, a missing or unreadable file, a file that does
/// not parse, and the malformed shapes the TS threw on (see the module docs). The file is read
/// whole on every call, as TS did.
pub fn info(ctx: &InfoCtx, args: InfoArgs) -> Result<Value, String> {
    let Some(namespace) = args.app_namespace else {
        return Ok(Value::Null);
    };
    if namespace.encode_utf16().count() > NAMESPACE_MAX_UTF16 {
        return Err("info_anticheat_info:bad-args".to_string());
    }
    if ctx.platform == Platform::Windows {
        return Ok(Value::Null);
    }
    // Node's `readFile(.., 'utf-8')` replaces invalid sequences rather than failing; so does this.
    let Ok(bytes) = std::fs::read(data_path(ctx)) else {
        return Ok(Value::Null);
    };
    let Ok(data) = serde_json::from_str::<Value>(&String::from_utf8_lossy(&bytes)) else {
        return Ok(Value::Null);
    };
    Ok(find(&data, &namespace).unwrap_or(Value::Null))
}

/// The TS `jsonData.find(...)`: `Some(entry)` for the first match, `None` for no match and also for
/// a callback that would have thrown.
fn find(data: &Value, wanted: &str) -> Option<Value> {
    // `.find` is not a function on anything but an array.
    let entries = data.as_array()?;
    for entry in entries {
        // `Err` is a TypeError inside the callback: the whole lookup ends in the TS `catch`.
        match matches(entry, wanted) {
            Ok(true) => return Some(entry.clone()),
            Ok(false) => {}
            Err(()) => return None,
        }
    }
    None
}

/// The TS callback: `const namespace = info.storeIds.epic?.namespace; namespace ?
/// namespace.toLowerCase().includes(wanted) : false`.
fn matches(entry: &Value, wanted: &str) -> Result<bool, ()> {
    // `info.storeIds`: an array, a primitive or null entry has no `storeIds`, and reading `.epic` of
    // `undefined` or `null` throws.
    let store_ids = entry.as_object().ok_or(())?.get("storeIds").ok_or(())?;
    if store_ids.is_null() {
        return Err(());
    }
    // `.epic` of a primitive or an array is `undefined`; `?.` then stops without reading further.
    let Some(epic) = store_ids.as_object().and_then(|o| o.get("epic")) else {
        return Ok(false);
    };
    // `.namespace` of a primitive is `undefined`; of `null` the `?.` already stopped.
    let Some(namespace) = epic.as_object().and_then(|o| o.get("namespace")) else {
        return Ok(false);
    };
    match namespace {
        // Falsy: undefined, null, "", 0, false.
        Value::Null | Value::Bool(false) => Ok(false),
        Value::String(s) if s.is_empty() => Ok(false),
        Value::Number(n) if n.as_f64() == Some(0.0) => Ok(false),
        Value::String(s) => Ok(s.to_lowercase().contains(wanted)),
        // A truthy non-string has no `toLowerCase`: TypeError.
        _ => Err(()),
    }
}

/// Lower-case hex of the MD5 digest of `bytes` (Node's `createHash('md5').digest('hex')`). A change
/// check against the feed's published hash, not a security control.
fn md5_hex(bytes: &[u8]) -> String {
    Md5::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// `{ needed }`: whether TS should now wait for the network and call [`download`]. The TS decision,
/// exactly: Windows never downloads; a missing file is downloaded; a present file is skipped only
/// when a latest hash was given and the file's MD5 equals it. A present file that cannot be read is
/// an error (the TS `createMD5` rejected, the caller logged it, and nothing was downloaded).
pub fn status(ctx: &InfoCtx, args: StatusArgs) -> Result<Value, String> {
    if ctx.platform == Platform::Windows {
        return Ok(json!({ "needed": false }));
    }
    let path = data_path(ctx);
    if !path.exists() {
        return Ok(json!({ "needed": true }));
    }
    let bytes = std::fs::read(&path).map_err(|_| "info_anticheat_status:unreadable".to_string())?;
    let unchanged = args
        .latest_file_hash
        .as_deref()
        .is_some_and(|latest| !latest.is_empty() && latest == md5_hex(&bytes));
    Ok(json!({ "needed": !unchanged }))
}

/// `{ written }`: fetches the feed for the platform and writes it, byte for byte, as the data file.
///
/// A failed request (transport error or a non-2xx status) or a failed write leaves any existing file
/// as it was and answers `{ written: false, warning }`, where `warning` is a fixed category the
/// caller logs as the TS did (`Failed download of AreWeAntiCheatYet data: ...`); the crate has no
/// logger and the warning never names the URL. Windows downloads nothing.
///
/// The request is the one the TS `axiosClient` made (D-10): a GET with the shared User-Agent, a 10 s
/// timeout, redirects followed. The body is read as text as axios did, so invalid UTF-8 is replaced
/// the way Node's `Buffer.toString` replaces it.
pub async fn download(ctx: &InfoCtx, _args: DownloadArgs) -> Result<Value, String> {
    if ctx.platform == Platform::Windows {
        return Ok(json!({ "written": false }));
    }
    let url = if ctx.platform == Platform::Mac {
        MAC_URL
    } else {
        LINUX_URL
    };
    let request = Request::get(url, TIMEOUT)
        .header("Accept", "application/json, text/plain, */*")
        .header(
            "User-Agent",
            &format!(
                "GameLib/{} (+https://github.com/grayson-mitchell/GameLib)",
                ctx.app_version
            ),
        );
    let response = match ctx.http.send(request).await {
        Ok(response) => response,
        Err(error) => return Ok(not_written(&error.to_string())),
    };
    if !(200..300).contains(&response.status) {
        return Ok(not_written(&format!("status {}", response.status)));
    }
    let text = String::from_utf8_lossy(&response.body);
    match write_replacing(&data_path(ctx), text.as_bytes()) {
        Ok(()) => Ok(json!({ "written": true })),
        Err(kind) => Ok(not_written(&format!("write failed: {kind}"))),
    }
}

fn not_written(warning: &str) -> Value {
    json!({ "written": false, "warning": warning })
}

/// Writes `bytes` to a temp name beside `path` and renames it over `path`; the temp file is removed
/// when either step fails. The error is an `io::ErrorKind` (a path never reaches a message).
fn write_replacing(path: &std::path::Path, bytes: &[u8]) -> Result<(), std::io::ErrorKind> {
    // A counter as well as the process id: two downloads at once must not share a temp file.
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let temp = path.with_extension(format!(
        "json.{}-{}.tmp",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    let result = std::fs::write(&temp, bytes).and_then(|()| std::fs::rename(&temp, path));
    if let Err(error) = result {
        let _ = std::fs::remove_file(&temp);
        return Err(error.kind());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::{Http, HttpError, HttpFuture, Response};
    use gamelib_core::clock::SystemClock;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use std::sync::{Arc, Mutex};

    /// Answers every request with one canned result and remembers the requests.
    struct Stub {
        answer: Result<Response, HttpError>,
        seen: Mutex<Vec<Request>>,
    }

    impl Stub {
        fn ok(body: &[u8]) -> Arc<Stub> {
            Stub::answering(Ok(Response {
                status: 200,
                headers: Vec::new(),
                body: body.to_vec(),
            }))
        }

        fn answering(answer: Result<Response, HttpError>) -> Arc<Stub> {
            Arc::new(Stub {
                answer,
                seen: Mutex::new(Vec::new()),
            })
        }
    }

    impl Http for Stub {
        fn send(&self, request: Request) -> HttpFuture<'_> {
            self.seen.lock().unwrap().push(request);
            let answer = self.answer.clone();
            Box::pin(async move { answer })
        }
    }

    /// A never-answering `Http`, for the shutdown case.
    struct Hang;

    impl Http for Hang {
        fn send(&self, _request: Request) -> HttpFuture<'_> {
            Box::pin(std::future::pending())
        }
    }

    fn ctx(
        home: &FakeHome,
        platform: Platform,
        http: Arc<dyn Http>,
        shutdown: Shutdown,
    ) -> InfoCtx {
        let dir = home.root().join("userData");
        std::fs::create_dir_all(&dir).unwrap();
        InfoCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            platform,
            crate::ctx::InfoPaths {
                app_folder: dir.clone(),
                user_data: dir,
                temp: home.root().join("temp"),
                public_dir: None,
            },
            "9.8.7".to_string(),
            shutdown,
            http,
        )
    }

    fn needed(ctx: &InfoCtx, hash: Option<&str>) -> bool {
        let args = StatusArgs {
            latest_file_hash: hash.map(str::to_string),
        };
        status(ctx, args).unwrap()["needed"].as_bool().unwrap()
    }

    #[test]
    fn md5_hex_is_lower_case_hex_of_the_digest() {
        assert_eq!(md5_hex(b""), "d41d8cd98f00b204e9800998ecf8427e");
        assert_eq!(md5_hex(b"abc"), "900150983cd24fb0d6963f7d28e17f72");
    }

    #[test]
    fn status_decides_as_the_ts_did() {
        let home = FakeHome::new("anticheat-status-");
        let linux = ctx(&home, Platform::Linux, Stub::ok(b""), Shutdown::new());
        // No file: a download is needed whatever the hash.
        assert!(needed(&linux, None));
        assert!(needed(&linux, Some("900150983cd24fb0d6963f7d28e17f72")));
        std::fs::write(data_path(&linux), b"abc").unwrap();
        // Same hash: skipped. Different hash, no hash, empty hash: needed.
        assert!(!needed(&linux, Some("900150983cd24fb0d6963f7d28e17f72")));
        assert!(needed(&linux, Some("00000000000000000000000000000000")));
        assert!(needed(&linux, None));
        assert!(needed(&linux, Some("")));
        // The comparison is exact: an upper-case copy of the digest is a different string.
        assert!(needed(&linux, Some("900150983CD24FB0D6963F7D28E17F72")));
        // Windows never downloads, file or not.
        let windows = ctx(&home, Platform::Windows, Stub::ok(b""), Shutdown::new());
        assert!(!needed(&windows, None));
    }

    #[test]
    fn status_of_an_unreadable_data_file_is_an_error_and_never_a_download() {
        let home = FakeHome::new("anticheat-status-");
        let linux = ctx(&home, Platform::Linux, Stub::ok(b""), Shutdown::new());
        // A directory where the file should be: it exists, so TS hashed it, and the read rejected.
        std::fs::create_dir_all(data_path(&linux)).unwrap();
        let err = status(&linux, StatusArgs::default()).unwrap_err();
        assert_eq!(err, "info_anticheat_status:unreadable");
    }

    #[test]
    fn download_requests_the_platform_feed_with_the_shared_user_agent_and_writes_the_body_exactly()
    {
        for (platform, url) in [(Platform::Mac, MAC_URL), (Platform::Linux, LINUX_URL)] {
            let home = FakeHome::new("anticheat-download-");
            // Not JSON-normalised on the way through: whitespace, key order and a trailing newline.
            let body = "[ {\"b\":1,  \"a\":\"\u{e9}\"} ]\n".as_bytes();
            let http = Stub::ok(body);
            let ctx = ctx(&home, platform, http.clone(), Shutdown::new());
            let out = block_on(download(&ctx, DownloadArgs {})).unwrap();
            assert_eq!(out, json!({ "written": true }));
            assert_eq!(std::fs::read(data_path(&ctx)).unwrap(), body);
            let seen = http.seen.lock().unwrap();
            assert_eq!(seen.len(), 1);
            assert_eq!(seen[0].url, url);
            assert_eq!(seen[0].timeout, Duration::from_secs(10));
            assert!(seen[0].headers.contains(&(
                "User-Agent".to_string(),
                "GameLib/9.8.7 (+https://github.com/grayson-mitchell/GameLib)".to_string()
            )));
            // Nothing but the data file is left in the app folder.
            let left: Vec<_> = std::fs::read_dir(ctx.paths.app_folder.clone())
                .unwrap()
                .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
                .collect();
            assert_eq!(left, vec![DATA_FILE.to_string()]);
        }
    }

    #[test]
    fn a_failed_download_keeps_the_existing_file_and_says_why_without_the_url() {
        for answer in [
            Err(HttpError::Timeout),
            Err(HttpError::Network("connection refused".to_string())),
            Err(HttpError::TooLarge),
            Ok(Response {
                status: 503,
                headers: Vec::new(),
                body: b"service unavailable".to_vec(),
            }),
            Ok(Response {
                status: 404,
                headers: Vec::new(),
                body: b"not found".to_vec(),
            }),
        ] {
            let home = FakeHome::new("anticheat-download-");
            let ctx = ctx(
                &home,
                Platform::Linux,
                Stub::answering(answer),
                Shutdown::new(),
            );
            std::fs::write(data_path(&ctx), b"old").unwrap();
            let out = block_on(download(&ctx, DownloadArgs {})).unwrap();
            assert_eq!(out["written"], json!(false), "{out}");
            let warning = out["warning"].as_str().unwrap();
            assert!(!warning.contains("githubusercontent"), "{warning}");
            assert_eq!(std::fs::read(data_path(&ctx)).unwrap(), b"old");
        }
    }

    #[test]
    fn a_download_that_cannot_write_reports_it_and_leaves_no_temp_file() {
        let home = FakeHome::new("anticheat-download-");
        let ctx = ctx(&home, Platform::Linux, Stub::ok(b"[]"), Shutdown::new());
        // A directory at the data path: the rename over it fails.
        std::fs::create_dir_all(data_path(&ctx)).unwrap();
        let out = block_on(download(&ctx, DownloadArgs {})).unwrap();
        assert_eq!(out["written"], json!(false));
        assert!(out["warning"].as_str().unwrap().starts_with("write failed"));
        let left: Vec<_> = std::fs::read_dir(&ctx.paths.app_folder)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(left, vec![DATA_FILE.to_string()]);
    }

    #[test]
    fn windows_downloads_nothing() {
        let home = FakeHome::new("anticheat-download-");
        let http = Stub::ok(b"[]");
        let ctx = ctx(&home, Platform::Windows, http.clone(), Shutdown::new());
        let out = block_on(download(&ctx, DownloadArgs {})).unwrap();
        assert_eq!(out, json!({ "written": false }));
        assert!(http.seen.lock().unwrap().is_empty());
        assert!(!data_path(&ctx).exists());
    }

    #[test]
    fn a_download_cancelled_by_shutdown_answers_shutdown_and_writes_nothing() {
        let home = FakeHome::new("anticheat-download-");
        let shutdown = Shutdown::new();
        let ctx = ctx(&home, Platform::Linux, Arc::new(Hang), shutdown.clone());
        let token = shutdown.token();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let out = runtime.block_on(async {
            tokio::spawn({
                let token = token.clone();
                async move {
                    tokio::time::sleep(Duration::from_millis(50)).await;
                    token.cancel();
                }
            });
            crate::dispatch("info_anticheat_download", &[json!({})], &ctx).await
        });
        assert_eq!(out, Err("info_anticheat_download:shutdown".to_string()));
        assert!(!data_path(&ctx).exists());
        assert!(shutdown.drain(Duration::from_millis(500)).is_empty());
    }

    #[test]
    fn the_status_and_download_args_reject_unknown_fields_and_wrong_shapes() {
        let home = FakeHome::new("anticheat-args-");
        let ctx = ctx(&home, Platform::Linux, Stub::ok(b""), Shutdown::new());
        for (op, args) in [
            (
                "info_anticheat_status",
                vec![json!({ "latestFileHash": 1 })],
            ),
            ("info_anticheat_status", vec![json!({ "extra": "x" })]),
            ("info_anticheat_status", vec![]),
            ("info_anticheat_download", vec![json!({ "extra": 1 })]),
            ("info_anticheat_download", vec![]),
            ("info_anticheat_download", vec![json!("x")]),
        ] {
            assert_eq!(
                crate::dispatch_sync(op, &args, &ctx).unwrap_err(),
                format!("{op}:bad-args"),
                "{op} {args:?}"
            );
        }
        assert_eq!(
            crate::dispatch_sync("info_anticheat_status", &[json!({})], &ctx).unwrap(),
            json!({ "needed": true })
        );
    }

    /// Drives one future on a throwaway runtime (the unit tests are plain `#[test]`s).
    fn block_on<F: std::future::Future>(future: F) -> F::Output {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(future)
    }
}
