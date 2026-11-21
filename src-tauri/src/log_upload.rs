//! `uploadLogFile`, served natively (Phase 84, D-07 and D-09): a user-initiated upload of one log
//! file to the paste service, run in Rust with reqwest instead of the sidecar's `fetch`.
//!
//! The behaviour is the TS `uploadLogFile` of `src/backend/logger/uploader.ts` kept as it was: the
//! same endpoint, the same `HeroicGamesLauncher/<app version>` User-Agent, the same
//! `content=<first 10 MiB of the file>&expiry_days=2` form body, the stored token is the literal
//! `1` ([`PASTE_TOKEN`], dpaste.com has no delete token), the same two log lines and the same
//! `logFileUploaded` push. The record is written through `StoreHost` (D-09).
//!
//! Nothing here uploads on its own. Only the `uploadLogFile` invoke reads a log for a POST, and
//! only to [`PASTE_ENDPOINT`]: there is no automatic, background or crash-time upload.
//!
//! V13: a paste URL is stored or returned only if it parses as `https` with the host exactly
//! `dpaste.com`; the shared client does not follow redirects (84-06's delete POST reuses it); a
//! request times out after [`REQUEST_TIMEOUT`]; the response text logged is capped.

use crate::log_dispatch::parse_log_file_args;
use crate::native_router::{invalid_args, NativeCtx, NativeFuture};
use gamelib_core::clock::{Clock, SystemClock};
use gamelib_core::paths::{join, log_file};
use gamelib_log::{Level, Prefix};
use serde_json::{json, Value};
use std::future::Future;
use std::io::Read;
use std::path::Path;
use std::pin::Pin;
use std::sync::{Arc, OnceLock};
use std::time::Duration;

/// The paste service endpoint. The only place a log leaves the machine.
pub(crate) const PASTE_ENDPOINT: &str = "https://dpaste.com/api/v2/";
/// Days a paste lives (the `expiry_days` form field).
pub(crate) const EXPIRY_DAYS: u64 = 2;
/// The most bytes read from a log: the first 10 MiB, as before.
pub(crate) const UPLOAD_MAX_BYTES: usize = 10 * 1024 * 1024;
/// A request, connection included, is abandoned after this long.
pub(crate) const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
/// The most characters of a response body that reach the log.
pub(crate) const LOGGED_TEXT_MAX: usize = 1024;
/// The most bytes read from a response body; a paste URL is a few dozen.
const RESPONSE_READ_MAX: usize = 64 * 1024;
/// The longest upload name, in UTF-16 code units (the zod `max(1024)` it replaces).
const NAME_MAX_UTF16: usize = 1024;
/// The token stored with every upload. dpaste.com does not support deletion and returns none, so
/// the stored token is the literal `1` (it stays so that the stored shape is unchanged).
pub(crate) const PASTE_TOKEN: &str = "1";

/// One HTTP response, reduced to what the handlers read.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct PasteResponse {
    pub(crate) status: u16,
    pub(crate) reason: String,
    pub(crate) text: String,
}

type PasteFuture = Pin<Box<dyn Future<Output = Result<PasteResponse, String>> + Send>>;

/// The HTTP seam of the paste service: one form POST. A trait so the handler is tested against a
/// localhost stand-in with no network, and shared by the upload and the delete (84-06).
pub(crate) trait PasteClient: Send + Sync + 'static {
    fn post_form(&self, url: String, body: String, user_agent: String) -> PasteFuture;
}

/// The real client: reqwest, built on first use so the TLS provider (installed in `run_setup`) is
/// in place. Redirects are disabled and a request times out after [`REQUEST_TIMEOUT`].
pub(crate) struct ReqwestPaste {
    client: OnceLock<Result<reqwest::Client, String>>,
}

impl ReqwestPaste {
    pub(crate) fn new() -> ReqwestPaste {
        ReqwestPaste {
            client: OnceLock::new(),
        }
    }

    fn client(&self) -> Result<reqwest::Client, String> {
        self.client
            .get_or_init(|| {
                reqwest::Client::builder()
                    .redirect(reqwest::redirect::Policy::none())
                    .timeout(REQUEST_TIMEOUT)
                    .build()
                    .map_err(|e| e.to_string())
            })
            .clone()
    }
}

/// Reads a response body, at most [`RESPONSE_READ_MAX`] bytes, as lossy UTF-8.
async fn read_capped(mut response: reqwest::Response) -> String {
    let mut bytes: Vec<u8> = Vec::new();
    while bytes.len() < RESPONSE_READ_MAX {
        match response.chunk().await {
            Ok(Some(chunk)) => bytes.extend_from_slice(&chunk),
            _ => break,
        }
    }
    bytes.truncate(RESPONSE_READ_MAX);
    String::from_utf8_lossy(&bytes).into_owned()
}

impl PasteClient for ReqwestPaste {
    fn post_form(&self, url: String, body: String, user_agent: String) -> PasteFuture {
        let client = self.client();
        Box::pin(async move {
            let response = client?
                .post(url)
                .header(reqwest::header::USER_AGENT, user_agent)
                .header(
                    reqwest::header::CONTENT_TYPE,
                    "application/x-www-form-urlencoded",
                )
                .body(body)
                .send()
                .await
                .map_err(|e| e.to_string())?;
            let status = response.status();
            Ok(PasteResponse {
                status: status.as_u16(),
                reason: status.canonical_reason().unwrap_or("").to_string(),
                text: read_capped(response).await,
            })
        })
    }
}

/// A client that never reaches the network: the manifest-vector test runs handlers whose valid
/// vectors would otherwise try to upload.
#[cfg(test)]
pub(crate) struct OfflinePaste;

#[cfg(test)]
impl PasteClient for OfflinePaste {
    fn post_form(&self, _url: String, _body: String, _user_agent: String) -> PasteFuture {
        Box::pin(std::future::ready(Err("no network in tests".to_string())))
    }
}

/// The paste URL if (and only if) it is `https` on the host exactly `dpaste.com`, with no
/// credentials and no explicit port; the trimmed text otherwise `None`. A hostile or spoofed
/// response must never decide which URL is stored, returned or later requested (V13).
pub(crate) fn validate_paste_url(text: &str) -> Option<String> {
    let trimmed = text.trim();
    let parsed = url::Url::parse(trimmed).ok()?;
    let plain = parsed.scheme() == "https"
        && parsed.host_str() == Some("dpaste.com")
        && parsed.username().is_empty()
        && parsed.password().is_none()
        && parsed.port().is_none();
    plain.then(|| trimmed.to_string())
}

/// The first `max` characters of `text`.
fn capped(text: &str, max: usize) -> String {
    text.chars().take(max).collect()
}

/// A value to put in a log line: CR and LF escaped, so a response body or a renderer-supplied name
/// cannot forge a second log line.
fn one_line(text: &str) -> String {
    text.replace('\r', "\\r").replace('\n', "\\n")
}

/// Where lines go. The handler logs through [`default_log`]; tests pass a recorder.
type LogSink<'a> = &'a (dyn Fn(Level, String) + Send + Sync);

/// The real sink: the native writer, as `[LogUploader]` lines.
fn default_log(level: Level, msg: String) {
    gamelib_log::log(Prefix::LogUploader, level, &msg);
}

/// The decoded args of `uploadLogFile`: `[name, getLogFileArgs]`. `None` on any other shape.
fn parse_upload_args(args: &[Value]) -> Option<(String, gamelib_core::paths::LogTarget)> {
    let [name, file] = args else {
        return None;
    };
    let name = name.as_str()?;
    if name.encode_utf16().count() > NAME_MAX_UTF16 {
        return None;
    }
    let target = parse_log_file_args(file).ok()?;
    Some((name.to_string(), target))
}

/// Read at most [`UPLOAD_MAX_BYTES`] of a file, as lossy UTF-8. A missing file is an error.
fn read_for_upload(path: &str) -> Result<String, String> {
    let file = std::fs::File::open(path)
        .map_err(|_| "uploadLogFile: the log file could not be read".to_string())?;
    let mut bytes = Vec::new();
    file.take(UPLOAD_MAX_BYTES as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| "uploadLogFile: the log file could not be read".to_string())?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// `content=<text>&expiry_days=2`, form-urlencoded.
fn form_body(content: &str) -> String {
    url::form_urlencoded::Serializer::new(String::new())
        .append_pair("content", content)
        .append_pair("expiry_days", &EXPIRY_DAYS.to_string())
        .finish()
}

/// `uploadLogFile` (invoke): upload the log a descriptor names. Bad args return the INVALID_ARGS
/// marker; a log that cannot be read rejects the invoke (the dialog's failure state); a network
/// failure or a bad response resolves `false`; success resolves `[url, {name, token, uploadedAt}]`.
pub(crate) fn upload_log_file(ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(async move { upload_with(&ctx, &args, &default_log).await })
}

async fn upload_with(ctx: &NativeCtx, args: &[Value], log: LogSink<'_>) -> Result<Value, String> {
    let Some((name, target)) = parse_upload_args(args) else {
        return Err(invalid_args(
            "uploadLogFile",
            &["(args)"],
            &["invalid_type"],
        ));
    };
    let Some(paths) = ctx.log_paths.as_ref() else {
        return Err("uploadLogFile: the log directory is unavailable".to_string());
    };
    let path = log_file(paths.platform, &paths.log_dir, &paths.user_data, &target)
        .map_err(|_| invalid_args("uploadLogFile", &["(args)"], &["invalid_type"]))?;
    let content = tauri::async_runtime::spawn_blocking(move || read_for_upload(&path))
        .await
        .map_err(|_| "uploadLogFile: the read did not finish".to_string())??;

    let user_agent = format!("HeroicGamesLauncher/{}", ctx.app_version);
    let response = match ctx
        .paste
        .post_form(PASTE_ENDPOINT.to_string(), form_body(&content), user_agent)
        .await
    {
        Ok(response) => response,
        Err(e) => {
            log(
                Level::Error,
                format!("Failed to send data to dpaste.com: {}", one_line(&e)),
            );
            return Ok(Value::Bool(false));
        }
    };
    let ok = (200..300).contains(&response.status);
    let url = validate_paste_url(&response.text);
    let (true, Some(url)) = (ok, url) else {
        log(
            Level::Error,
            format!(
                "Failed to upload log file, response error code {} {}, text: {}",
                response.status,
                one_line(&response.reason),
                one_line(&capped(response.text.trim(), LOGGED_TEXT_MAX))
            ),
        );
        return Ok(Value::Bool(false));
    };

    let data = json!({
        "name": name,
        "token": PASTE_TOKEN,
        "uploadedAt": SystemClock.now_ms(),
    });
    let store_dir = join(paths.platform, &paths.user_data, &["store"]);
    let store_host = Arc::clone(&ctx.store_host);
    let (record_url, record) = (url.clone(), data.clone());
    let saved = tauri::async_runtime::spawn_blocking(move || {
        store_host
            .open_cache(Path::new(&store_dir), "uploadedLogs")
            .and_then(|store| store.set(&record_url, record))
    })
    .await;
    if !matches!(saved, Ok(Ok(()))) {
        log(
            Level::Error,
            "Failed to record the uploaded log file".to_string(),
        );
        return Err("uploadLogFile: the upload could not be recorded".to_string());
    }
    ctx.emitter
        .emit("logFileUploaded", vec![json!(url), data.clone()]);
    log(
        Level::Info,
        format!("Uploaded log file {} to {url}", one_line(&name)),
    );
    Ok(json!([url, data]))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::native_router::{LogPaths, NativeHost};
    use gamelib_core::emitter::FrontendEmitter;
    use gamelib_core::paths::Platform;
    use gamelib_core::store::StoreHost;
    use gamelib_testutil::FakeHome;
    use std::io::Write as _;
    use std::net::{TcpListener, TcpStream};
    use std::sync::mpsc::{channel, Receiver};
    use std::sync::Mutex;

    struct NoHost;
    impl NativeHost for NoHost {
        fn open_url(&self, _url: String) {}
        fn reveal_path(&self, _path: String) {}
    }

    /// Records every push.
    struct Recording(Mutex<Vec<(String, Vec<Value>)>>);
    impl FrontendEmitter for Recording {
        fn emit(&self, channel: &str, args: Vec<Value>) {
            self.0.lock().unwrap().push((channel.to_string(), args));
        }
    }

    /// The reqwest client aimed at a localhost stand-in: the handler's own endpoint is replaced and
    /// nothing else, so redirects, the timeout and the headers are the real client's.
    struct LocalPaste {
        inner: ReqwestPaste,
        base: String,
    }
    impl PasteClient for LocalPaste {
        fn post_form(&self, url: String, body: String, user_agent: String) -> PasteFuture {
            assert_eq!(
                url, PASTE_ENDPOINT,
                "the handler must post to the fixed endpoint"
            );
            self.inner.post_form(self.base.clone(), body, user_agent)
        }
    }

    /// One request a stand-in received.
    struct Seen {
        head: String,
        body: String,
    }

    /// Serve `replies` (raw HTTP responses), one per connection, and report each request.
    fn serve(replies: Vec<String>) -> (String, Receiver<Seen>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let base = format!("http://{}/api/v2/", listener.local_addr().expect("addr"));
        let (tx, rx) = channel();
        std::thread::spawn(move || {
            for reply in replies {
                let Ok((mut stream, _)) = listener.accept() else {
                    return;
                };
                let seen = read_request(&mut stream);
                let _ = tx.send(seen);
                let _ = stream.write_all(reply.as_bytes());
                let _ = stream.flush();
            }
        });
        (base, rx)
    }

    fn read_request(stream: &mut TcpStream) -> Seen {
        let mut raw: Vec<u8> = Vec::new();
        let mut buf = [0u8; 8192];
        let head_end = loop {
            let n = stream.read(&mut buf).unwrap_or(0);
            if n == 0 {
                break raw.len();
            }
            raw.extend_from_slice(&buf[..n]);
            if let Some(i) = raw.windows(4).position(|w| w == b"\r\n\r\n") {
                break i + 4;
            }
        };
        let head = String::from_utf8_lossy(&raw[..head_end]).into_owned();
        let length = head
            .lines()
            .find_map(|l| {
                l.to_ascii_lowercase()
                    .strip_prefix("content-length:")
                    .map(str::to_string)
            })
            .and_then(|v| v.trim().parse::<usize>().ok())
            .unwrap_or(0);
        while raw.len() < head_end + length {
            let n = stream.read(&mut buf).unwrap_or(0);
            if n == 0 {
                break;
            }
            raw.extend_from_slice(&buf[..n]);
        }
        let body = String::from_utf8_lossy(&raw[head_end.min(raw.len())..]).into_owned();
        Seen { head, body }
    }

    fn ok(text: &str) -> String {
        format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{text}",
            text.len()
        )
    }

    fn status(line: &str, text: &str) -> String {
        format!(
            "HTTP/1.1 {line}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{text}",
            text.len()
        )
    }

    struct Rig {
        /// Held so the throwaway profile lives as long as the rig.
        _home: FakeHome,
        emitter: Arc<Recording>,
        ctx: Arc<NativeCtx>,
        lines: Mutex<Vec<(Level, String)>>,
    }

    fn rig(paste: Arc<dyn PasteClient>) -> Rig {
        let home = FakeHome::new("gamelib-log-upload-");
        let root = home.root().to_string_lossy().into_owned();
        let paths = LogPaths {
            platform: Platform::current(),
            log_dir: join(Platform::current(), &root, &["logs"]),
            user_data: join(Platform::current(), &root, &["userData"]),
        };
        let emitter = Arc::new(Recording(Mutex::new(Vec::new())));
        let ctx = Arc::new(NativeCtx {
            host: Arc::new(NoHost),
            log_paths: Some(paths),
            store_host: Arc::new(StoreHost::new()),
            emitter: emitter.clone(),
            paste,
            app_version: "9.9.9".to_string(),
        });
        Rig {
            _home: home,
            emitter,
            ctx,
            lines: Mutex::new(Vec::new()),
        }
    }

    impl Rig {
        fn local(base: String) -> Rig {
            rig(Arc::new(LocalPaste {
                inner: ReqwestPaste::new(),
                base,
            }))
        }

        fn log_path(&self, parts: &[&str]) -> String {
            let dir = self.ctx.log_paths.as_ref().unwrap().log_dir.clone();
            join(Platform::current(), &dir, parts)
        }

        fn seed(&self, parts: &[&str], bytes: &[u8]) {
            let path = self.log_path(parts);
            std::fs::create_dir_all(Path::new(&path).parent().unwrap()).unwrap();
            std::fs::write(path, bytes).unwrap();
        }

        fn upload(&self, args: Vec<Value>) -> Result<Value, String> {
            let sink = |level: Level, msg: String| self.lines.lock().unwrap().push((level, msg));
            tauri::async_runtime::block_on(upload_with(&self.ctx, &args, &sink))
        }

        fn stored(&self) -> Vec<(String, Value)> {
            let paths = self.ctx.log_paths.as_ref().unwrap();
            let dir = join(paths.platform, &paths.user_data, &["store"]);
            // A fresh host reads what is on disk, not what the handler's host holds in memory.
            StoreHost::new()
                .open_cache(Path::new(&dir), "uploadedLogs")
                .map(|s| s.snapshot())
                .unwrap_or_default()
        }

        fn logged(&self) -> Vec<(Level, String)> {
            self.lines.lock().unwrap().clone()
        }
    }

    fn form(body: &str) -> Vec<(String, String)> {
        url::form_urlencoded::parse(body.as_bytes())
            .into_owned()
            .collect()
    }

    #[test]
    fn log_upload_paste_urls_are_https_on_exactly_dpaste_com() {
        for good in ["https://dpaste.com/AbC123", "  https://dpaste.com/AbC123\n"] {
            assert_eq!(
                validate_paste_url(good).as_deref(),
                Some(good.trim()),
                "{good:?}"
            );
        }
        for bad in [
            "",
            "javascript:alert(1)",
            "http://dpaste.com/AbC123",
            "https://evil.example/x",
            "https://dpaste.com.evil.example/x",
            "https://evildpaste.com/x",
            "https://www.dpaste.com/x",
            "https://dpaste.com@evil.example/x",
            "https://user:pw@dpaste.com/x",
            "https://dpaste.com:8443/x",
            "file:///etc/passwd",
            "not a url",
        ] {
            assert_eq!(validate_paste_url(bad), None, "{bad:?}");
        }
    }

    #[test]
    fn log_upload_posts_the_form_and_records_the_paste() {
        let (base, seen) = serve(vec![ok("https://dpaste.com/AbC123\n")]);
        let rig = Rig::local(base);
        rig.seed(&["gamelib.log"], b"line 1\nline 2 & more=here\n");
        let result = rig.upload(vec![json!("Heroic log"), json!({})]).unwrap();

        let url = "https://dpaste.com/AbC123";
        let uploaded_at = result[1]["uploadedAt"].as_u64().expect("uploadedAt is ms");
        assert!(uploaded_at > 1_700_000_000_000);
        assert_eq!(
            result,
            json!([url, {"name": "Heroic log", "token": "1", "uploadedAt": uploaded_at}])
        );

        let request = seen.recv_timeout(Duration::from_secs(5)).unwrap();
        let head = request.head.to_ascii_lowercase();
        assert!(head.starts_with("post /api/v2/ "), "{head}");
        assert!(
            head.contains("user-agent: heroicgameslauncher/9.9.9"),
            "{head}"
        );
        assert!(
            head.contains("content-type: application/x-www-form-urlencoded"),
            "{head}"
        );
        assert_eq!(
            form(&request.body),
            vec![
                (
                    "content".to_string(),
                    "line 1\nline 2 & more=here\n".to_string()
                ),
                ("expiry_days".to_string(), "2".to_string()),
            ]
        );

        // Recorded on disk through the StoreHost, pushed to the renderer, logged.
        assert_eq!(
            rig.stored(),
            vec![(
                url.to_string(),
                json!({"name": "Heroic log", "token": PASTE_TOKEN, "uploadedAt": uploaded_at})
            )]
        );
        assert_eq!(
            rig.emitter.0.lock().unwrap().clone(),
            vec![(
                "logFileUploaded".to_string(),
                vec![json!(url), result[1].clone()]
            )]
        );
        assert_eq!(
            rig.logged(),
            vec![(
                Level::Info,
                "Uploaded log file Heroic log to https://dpaste.com/AbC123".to_string()
            )]
        );
    }

    #[test]
    fn log_upload_reads_only_the_first_ten_mib_of_a_log() {
        let (base, seen) = serve(vec![ok("https://dpaste.com/Big")]);
        let rig = Rig::local(base);
        let mut bytes = vec![b'a'; UPLOAD_MAX_BYTES];
        bytes.extend_from_slice(b"TAIL-NOT-SENT");
        rig.seed(&["runners", "legendary.log"], &bytes);
        rig.upload(vec![json!("big"), json!({"runner": "legendary"})])
            .unwrap();
        let request = seen.recv_timeout(Duration::from_secs(30)).unwrap();
        let content = &form(&request.body)[0].1;
        assert_eq!(content.len(), UPLOAD_MAX_BYTES);
        assert!(!content.contains("TAIL"));
    }

    /// The cases where nothing may be stored, pushed or returned as a URL.
    fn assert_refused(rig: &Rig, result: Result<Value, String>) {
        assert_eq!(result, Ok(Value::Bool(false)));
        assert!(rig.stored().is_empty(), "nothing may be stored");
        assert!(
            rig.emitter.0.lock().unwrap().is_empty(),
            "nothing may be pushed"
        );
    }

    #[test]
    fn log_upload_a_server_error_returns_false_and_logs_the_status() {
        let (base, _seen) = serve(vec![status(
            "500 Internal Server Error",
            "oops\nsecond line",
        )]);
        let rig = Rig::local(base);
        rig.seed(&["gamelib.log"], b"x");
        assert_refused(&rig, rig.upload(vec![json!("n"), json!({})]));
        assert_eq!(
            rig.logged(),
            vec![(
                Level::Error,
                "Failed to upload log file, response error code 500 Internal Server Error, text: oops\\nsecond line"
                    .to_string()
            )]
        );
    }

    #[test]
    fn log_upload_a_response_that_is_not_a_dpaste_https_url_is_refused() {
        for body in [
            "javascript:alert(1)",
            "https://evil.example/x",
            "http://dpaste.com/x",
            "",
        ] {
            let (base, _seen) = serve(vec![ok(body)]);
            let rig = Rig::local(base);
            rig.seed(&["gamelib.log"], b"x");
            assert_refused(&rig, rig.upload(vec![json!("n"), json!({})]));
            assert_eq!(rig.logged().len(), 1, "{body:?}");
            assert_eq!(rig.logged()[0].0, Level::Error);
        }
    }

    #[test]
    fn log_upload_a_redirect_is_not_followed_and_stores_nothing() {
        let redirect = "HTTP/1.1 302 Found\r\nLocation: https://dpaste.com/Moved\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        // A second reply is queued: if the client followed the redirect the stand-in would be asked
        // a second time and the assertion on the request count would fail.
        let (base, seen) = serve(vec![
            redirect.to_string(),
            ok("https://dpaste.com/Followed"),
        ]);
        let rig = Rig::local(base);
        rig.seed(&["gamelib.log"], b"x");
        assert_refused(&rig, rig.upload(vec![json!("n"), json!({})]));
        assert!(seen.recv_timeout(Duration::from_secs(5)).is_ok());
        assert!(
            seen.recv_timeout(Duration::from_millis(500)).is_err(),
            "a redirect was followed"
        );
        assert!(rig.logged()[0].1.contains("response error code 302 Found"));
    }

    #[test]
    fn log_upload_a_refused_connection_returns_false_with_a_send_error_line() {
        // A port nothing listens on.
        let closed = {
            let l = TcpListener::bind("127.0.0.1:0").unwrap();
            format!("http://{}/api/v2/", l.local_addr().unwrap())
        };
        let rig = Rig::local(closed);
        rig.seed(&["gamelib.log"], b"x");
        assert_refused(&rig, rig.upload(vec![json!("n"), json!({})]));
        let lines = rig.logged();
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].0, Level::Error);
        assert!(
            lines[0].1.starts_with("Failed to send data to dpaste.com:"),
            "{}",
            lines[0].1
        );
    }

    #[test]
    fn log_upload_a_missing_log_file_rejects_the_invoke() {
        let (base, seen) = serve(vec![ok("https://dpaste.com/Never")]);
        let rig = Rig::local(base);
        let err = rig.upload(vec![json!("n"), json!({})]).unwrap_err();
        assert!(
            !err.starts_with(crate::ipc_contract::IPC_INVALID_ARGS_MARKER),
            "{err}"
        );
        assert!(
            seen.recv_timeout(Duration::from_millis(200)).is_err(),
            "nothing was posted"
        );
        assert!(rig.stored().is_empty());
    }

    #[test]
    fn log_upload_bad_args_return_the_invalid_args_marker_and_post_nothing() {
        let (base, seen) = serve(vec![ok("https://dpaste.com/Never")]);
        let rig = Rig::local(base);
        rig.seed(&["x_steam", "launch.log"], b"secret");
        let sentinel = "SENTINEL-upload-9f3a";
        let cases: Vec<Vec<Value>> = vec![
            vec![],
            vec![json!("x")],
            vec![json!(1), json!({})],
            vec![json!("x"), json!({"appName": "abc"})],
            vec![json!("x"), json!({}), json!("extra")],
            vec![json!("x".repeat(1025)), json!({})],
            vec![
                json!("x"),
                json!({"appName": format!("../{sentinel}"), "runner": "steam"}),
            ],
            vec![json!("x"), json!({"extra": sentinel})],
        ];
        for args in cases {
            let err = rig.upload(args.clone()).unwrap_err();
            assert!(
                err.starts_with(crate::ipc_contract::IPC_INVALID_ARGS_MARKER),
                "{args:?}: {err}"
            );
            assert!(!err.contains(sentinel), "{err}");
        }
        // 1024 UTF-16 units is the longest accepted name: an astral character counts twice.
        let astral = "\u{1f600}".repeat(512);
        assert!(parse_upload_args(&[json!(astral), json!({})]).is_some());
        assert!(parse_upload_args(&[json!(format!("{astral}x")), json!({})]).is_none());
        assert!(
            seen.recv_timeout(Duration::from_millis(200)).is_err(),
            "nothing was posted"
        );
    }

    #[test]
    fn log_upload_the_token_and_the_endpoint_are_the_documented_literals() {
        assert_eq!(PASTE_TOKEN, "1");
        assert_eq!(PASTE_ENDPOINT, "https://dpaste.com/api/v2/");
        assert_eq!(REQUEST_TIMEOUT, Duration::from_secs(60));
        assert_eq!(LOGGED_TEXT_MAX, 1024);
        assert_eq!(form_body("a b&c"), "content=a+b%26c&expiry_days=2");
    }

    #[test]
    fn log_upload_logged_response_text_is_capped_at_1024_characters() {
        let long = "z".repeat(5000);
        let (base, _seen) = serve(vec![status("400 Bad Request", &long)]);
        let rig = Rig::local(base);
        rig.seed(&["gamelib.log"], b"x");
        assert_refused(&rig, rig.upload(vec![json!("n"), json!({})]));
        let line = &rig.logged()[0].1;
        assert!(line.ends_with(&"z".repeat(1024)), "{line}");
        assert!(!line.ends_with(&"z".repeat(1025)));
    }
}
