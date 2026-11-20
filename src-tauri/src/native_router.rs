//! The Rust native router (Phase 83, D-01..D-04, D-06, D-07): renderer channels the shell answers
//! itself instead of relaying to the sidecar.
//!
//! Ownership is exclusive. `sidecar_invoke` consults the router right after the allow-list
//! verdict; a hit is answered here on any outcome and the sidecar is never asked (D-04: no flag,
//! no error-driven fallback). The channel sets are generated from
//! `src/common/types/ipc/nativeChannels.json` into `ipc_contract.rs` (`NATIVE_INVOKE_CHANNELS`,
//! `NATIVE_SEND_CHANNELS`), and the tests below prove this router's keys equal those sets.
//!
//! Sends (Phase 83, D-02) go through one ordered queue per slice: `sidecar_send` runs on the main
//! thread, so [`NativeRouter::route_send`] only validates and enqueues, and one std worker thread
//! per slice (`native-send-<slice>`) runs the handlers in FIFO order. FIFO holds within a slice;
//! nothing is ordered across the native/sidecar boundary.
//!
//! Rejections reuse the markers the renderer already classifies: an off-list name gets
//! `IPC_INVALID_CHANNEL_MARKER` from `relay_channel_verdict`, bad args get
//! `IPC_INVALID_ARGS_MARKER` from [`invalid_args`] (D-03 as refined by research F3), so
//! `bootErrorSurface` never paints a native rejection as a fatal boot error.

use crate::ipc_contract::{IPC_INVALID_ARGS, IPC_INVALID_ARGS_MARKER};
use crate::native_handlers;
use crate::relay_commands::echo_channel;
use gamelib_core::shutdown::Shutdown;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::mpsc::{channel as mpsc_channel, Sender};
use std::sync::Arc;
use std::thread;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

/// Whether a native channel is request/response or fire-and-forget.
#[allow(dead_code)] // the send kind is wired by a later slice of this phase
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum NativeKind {
    Invoke,
    Send,
}

/// A native invoke handler: positional args in, the invoke's value or its error string out.
pub(crate) type InvokeHandler = fn(&[Value]) -> Result<Value, String>;

/// A native send validator: positional args in, the validated URL or a fixed category literal
/// out. It is pure and bounded, so it runs on the caller's (main) thread.
pub(crate) type SendValidator = fn(&[Value]) -> Result<String, &'static str>;

/// What a native handler needs from the app. A trait so the router and its queue are tested with
/// a recording fake and no `AppHandle`.
pub(crate) trait NativeHost: Send + Sync + 'static {
    /// Hand `url` to the OS opener. It may block (on Windows `open_url` waits while the OS shows
    /// a dialog), so `native_handlers::open_external_url` calls it on its own short-lived thread
    /// and never on a slice worker (Pitfall 3, D-UAT-19).
    fn open_url(&self, url: String);
}

/// The real host: the opener plugin through the app handle.
pub(crate) struct AppNativeHost(pub(crate) AppHandle);

impl NativeHost for AppNativeHost {
    fn open_url(&self, url: String) {
        if self.0.opener().open_url(&url, None::<&str>).is_err() {
            // Fixed line: the URL is renderer-controlled (T-83-19).
            shell_eprintln!("[shell] native openExternalUrl: the OS opener failed");
        }
    }
}

/// One queued native send: the channel it came in on and its validated URL.
pub(crate) struct NativeSendJob {
    pub(crate) channel: &'static str,
    pub(crate) url: String,
}

/// The FIFO hand-off to one slice's worker thread.
pub(crate) struct SliceQueue(Sender<NativeSendJob>);

impl SliceQueue {
    /// Queue `job`. Never waits on the handler; fails only if the worker thread is gone.
    pub(crate) fn enqueue(&self, job: NativeSendJob) -> Result<(), String> {
        self.0
            .send(job)
            .map_err(|rejected| format!("native send worker is gone: {}", rejected.0.channel))
    }
}

/// Spawn the worker thread of `slice` under `shutdown` (the process-wide one in the app, a local
/// one in tests, so a test never cancels the global token).
///
/// One named std thread (`native-send-<slice>`), never a pool and never the main thread, so jobs
/// run in enqueue order (D-02). While a job runs the worker holds a shutdown `Registrant` named
/// after the slice; once the token is cancelled, queued jobs are dropped (D-14). The thread ends
/// when every sender is dropped; a parked std thread does not hold the process open.
pub(crate) fn spawn_slice_worker<H>(
    slice: &'static str,
    shutdown: Shutdown,
    handler: H,
) -> SliceQueue
where
    H: Fn(NativeSendJob) -> Result<(), String> + Send + 'static,
{
    let (tx, rx) = mpsc_channel::<NativeSendJob>();
    let token = shutdown.token();
    let spawned = thread::Builder::new()
        .name(format!("native-send-{slice}"))
        .spawn(move || {
            for job in rx {
                if token.is_cancelled() {
                    continue;
                }
                let _held = shutdown.register(slice);
                let channel = job.channel;
                // A panicking handler must not kill the slice's only worker: every later send on
                // it would be silently lost. The slice name is all the log line carries.
                match catch_unwind(AssertUnwindSafe(|| handler(job))) {
                    Ok(Ok(())) => {}
                    Ok(Err(e)) => shell_eprintln!(
                        "[shell] native send failed: {} (slice {slice}): {e}",
                        echo_channel(channel)
                    ),
                    Err(_) => {
                        shell_eprintln!("[shell] native send handler panicked (slice {slice})")
                    }
                }
            }
        });
    if spawned.is_err() {
        // `rx` went down with the failed spawn, so every enqueue reports the worker as gone.
        shell_eprintln!("[shell] native send worker for slice {slice} could not start");
    }
    SliceQueue(tx)
}

/// One native send channel: the slice whose queue runs it and its validator.
struct SendRoute {
    slice: &'static str,
    validate: SendValidator,
}

/// Native channel ownership, keyed by channel name.
pub(crate) struct NativeRouter {
    invoke: HashMap<&'static str, InvokeHandler>,
    send: HashMap<&'static str, SendRoute>,
    queues: HashMap<&'static str, SliceQueue>,
}

/// The slice that owns `openExternalUrl` in `nativeChannels.json`.
const APP_SHELL_SLICE: &str = "app-shell";

/// Run one queued send on its slice worker: the channel picks the handler.
fn run_send_job(host: &Arc<dyn NativeHost>, job: NativeSendJob) -> Result<(), String> {
    match job.channel {
        "openExternalUrl" => native_handlers::open_external_url(host, job.url),
        other => Err(format!(
            "no native send handler for {}",
            echo_channel(other)
        )),
    }
}

impl NativeRouter {
    pub(crate) fn new(host: Arc<dyn NativeHost>) -> Self {
        Self::with_shutdown(host, gamelib_core::shutdown::global().clone())
    }

    pub(crate) fn with_shutdown(host: Arc<dyn NativeHost>, shutdown: Shutdown) -> Self {
        let mut invoke: HashMap<&'static str, InvokeHandler> = HashMap::new();
        invoke.insert("getHeroicVersion", native_handlers::get_heroic_version);
        let mut send: HashMap<&'static str, SendRoute> = HashMap::new();
        send.insert(
            "openExternalUrl",
            SendRoute {
                slice: APP_SHELL_SLICE,
                validate: native_handlers::parse_open_external_url,
            },
        );
        let mut queues: HashMap<&'static str, SliceQueue> = HashMap::new();
        queues.insert(
            APP_SHELL_SLICE,
            spawn_slice_worker(APP_SHELL_SLICE, shutdown, move |job| {
                run_send_job(&host, job)
            }),
        );
        Self {
            invoke,
            send,
            queues,
        }
    }

    /// Serve a native-owned send, or `None` when the sidecar owns `channel` (D-04: there is no
    /// fallback to the sidecar on any outcome).
    ///
    /// Runs on the caller's thread, which is the main thread: it only validates (pure, bounded)
    /// and enqueues. Invalid args are dropped and logged by channel name only (T-34.6-16-02), and
    /// answer `Ok(())` exactly as the sidecar dropped a bad send before (D-03 as refined by
    /// research F3). `Err` is only a worker that is gone.
    pub(crate) fn route_send(&self, channel: &str, args: &[Value]) -> Option<Result<(), String>> {
        let (name, route) = self.send.get_key_value(channel)?;
        let url = match (route.validate)(args) {
            Ok(url) => url,
            Err(_category) => {
                shell_eprintln!("[shell] native send rejected: {}", echo_channel(channel));
                return Some(Ok(()));
            }
        };
        let Some(queue) = self.queues.get(route.slice) else {
            return Some(Err(format!(
                "no native send queue for {}",
                echo_channel(channel)
            )));
        };
        Some(queue.enqueue(NativeSendJob { channel: name, url }))
    }

    /// The validator of a native send channel, for the manifest-vector test.
    #[allow(dead_code)] // consumed by the manifest-vector tests
    pub(crate) fn send_validator(&self, channel: &str) -> Option<SendValidator> {
        self.send.get(channel).map(|route| route.validate)
    }

    /// The handler for a native-owned invoke channel; `None` means the sidecar owns it.
    pub(crate) fn invoke_handler(&self, channel: &str) -> Option<InvokeHandler> {
        self.invoke.get(channel).copied()
    }

    /// Sorted invoke channel names, for the ownership test.
    #[allow(dead_code)] // consumed by the ownership tests
    pub(crate) fn invoke_channels(&self) -> Vec<&'static str> {
        let mut names: Vec<&'static str> = self.invoke.keys().copied().collect();
        names.sort_unstable();
        names
    }

    /// Sorted send channel names, for the ownership test.
    #[allow(dead_code)] // consumed by the ownership tests
    pub(crate) fn send_channels(&self) -> Vec<&'static str> {
        let mut names: Vec<&'static str> = self.send.keys().copied().collect();
        names.sort_unstable();
        names
    }
}

const PATH_SEGMENT_MAX: usize = 64;

/// Equal to the TS `sanitisePath` (`src/backend/sidecar/ipcValidation.ts`): `(args)` is kept
/// verbatim, every `.`-separated segment is cut to 64 characters and anything outside
/// `[A-Za-z0-9_-]` becomes `?`, so a path can neither flood nor forge a log line.
fn sanitise_path(path: &str) -> String {
    if path == "(args)" {
        return path.to_string();
    }
    path.split('.')
        .map(|seg| {
            seg.chars()
                .take(PATH_SEGMENT_MAX)
                .map(|c| {
                    if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                        c
                    } else {
                        '?'
                    }
                })
                .collect::<String>()
        })
        .collect::<Vec<_>>()
        .join(".")
}

/// The wire error for a native invoke whose args failed validation: the same
/// `IPC_INVALID_ARGS_MARKER` plus JSON tail the sidecar's `formatIpcInvalidArgsError` emits, with
/// the channel cut by `echo_channel`, sanitised paths and zod-vocabulary codes. It never carries
/// an argument value (D-10, T-83-08).
pub(crate) fn invalid_args(channel: &str, paths: &[&str], codes: &[&str]) -> String {
    let paths: Vec<String> = paths.iter().map(|p| sanitise_path(p)).collect();
    let codes: Vec<String> = codes.iter().map(|c| sanitise_path(c)).collect();
    let payload = json!({
        "code": IPC_INVALID_ARGS,
        "channel": echo_channel(channel),
        "paths": paths,
        "codes": codes,
    });
    format!("{IPC_INVALID_ARGS_MARKER} {payload}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ipc_contract::{NATIVE_INVOKE_CHANNELS, NATIVE_SEND_CHANNELS};
    use crate::relay_commands::relay_channel_verdict;
    use std::sync::mpsc::Receiver;
    use std::time::Duration;

    const MANIFEST: &str = include_str!("../../src/common/types/ipc/nativeChannels.json");

    /// A recording host: every `open_url` reports the URL and the name of the thread it ran on.
    struct RecordingHost {
        tx: Sender<(String, Option<String>)>,
    }

    impl NativeHost for RecordingHost {
        fn open_url(&self, url: String) {
            let _ = self
                .tx
                .send((url, thread::current().name().map(str::to_string)));
        }
    }

    /// A router over a recording host and its own `Shutdown` (never the global one).
    fn recording_router() -> (NativeRouter, Receiver<(String, Option<String>)>) {
        let (tx, rx) = mpsc_channel();
        let router = NativeRouter::with_shutdown(Arc::new(RecordingHost { tx }), Shutdown::new());
        (router, rx)
    }

    fn router() -> NativeRouter {
        recording_router().0
    }

    fn manifest() -> Value {
        serde_json::from_str(MANIFEST).expect("manifest parses")
    }

    fn vectors(spec: &Value, key: &str) -> Vec<Vec<Value>> {
        spec[key]
            .as_array()
            .unwrap_or_else(|| panic!("{key} is an array"))
            .iter()
            .map(|v| v.as_array().expect("vector is an array").clone())
            .collect()
    }

    fn tail(err: &str) -> Value {
        let rest = err
            .strip_prefix(IPC_INVALID_ARGS_MARKER)
            .unwrap_or_else(|| panic!("no INVALID_ARGS marker in {err}"));
        serde_json::from_str(rest.trim()).expect("tail is JSON")
    }

    #[test]
    fn native_router_invoke_keys_equal_generated_native_invoke_set() {
        let router = router();
        assert_eq!(router.invoke_channels(), NATIVE_INVOKE_CHANNELS.to_vec());
    }

    #[test]
    fn native_router_send_keys_equal_generated_native_send_set() {
        let router = router();
        assert_eq!(router.send_channels(), NATIVE_SEND_CHANNELS.to_vec());
    }

    #[test]
    fn every_native_channel_is_on_the_renderer_allow_list() {
        for name in NATIVE_INVOKE_CHANNELS.iter().chain(NATIVE_SEND_CHANNELS) {
            assert!(
                relay_channel_verdict(name).is_ok(),
                "{name} not allow-listed"
            );
        }
    }

    #[test]
    fn the_router_does_not_claim_sidecar_channels() {
        let router = router();
        assert!(router.invoke_handler("pathExists").is_none());
        assert!(router.send_validator("pathExists").is_none());
        assert!(router.route_send("pathExists", &[]).is_none());
        assert!(router.invoke_handler("").is_none());
        assert!(router.invoke_handler("getHeroicVersion").is_some());
    }

    #[test]
    fn native_manifest_vectors_valid_accept_invalid_reject() {
        let router = router();
        let m = manifest();
        let channels = m["channels"].as_object().expect("channels object");
        for (name, spec) in channels {
            if spec["kind"] == "send" {
                let validate = router
                    .send_validator(name)
                    .unwrap_or_else(|| panic!("{name} has no native send validator"));
                for args in vectors(spec, "valid") {
                    assert!(validate(&args).is_ok(), "{name} rejected valid {args:?}");
                }
                for args in vectors(spec, "invalid") {
                    assert!(validate(&args).is_err(), "{name} accepted invalid {args:?}");
                }
                continue;
            }
            let handler = router
                .invoke_handler(name)
                .unwrap_or_else(|| panic!("{name} has no native handler"));
            for args in vectors(spec, "valid") {
                assert!(handler(&args).is_ok(), "{name} rejected valid {args:?}");
            }
            for args in vectors(spec, "invalid") {
                let err = handler(&args)
                    .err()
                    .unwrap_or_else(|| panic!("{name} accepted invalid {args:?}"));
                let payload = tail(&err);
                let mut keys: Vec<&str> = payload
                    .as_object()
                    .unwrap()
                    .keys()
                    .map(String::as_str)
                    .collect();
                keys.sort_unstable();
                assert_eq!(keys, ["channel", "code", "codes", "paths"], "{name}");
                assert_eq!(payload["code"], IPC_INVALID_ARGS);
                assert_eq!(payload["channel"], name.as_str());
            }
        }
    }

    #[test]
    fn native_manifest_every_channel_has_an_invalid_vector() {
        let m = manifest();
        let channels = m["channels"].as_object().expect("channels object");
        let router = router();
        if channels.is_empty() {
            assert!(
                router.invoke_channels().is_empty(),
                "the manifest names no channel but the router has a handler"
            );
        }
        for (name, spec) in channels {
            assert!(
                !vectors(spec, "invalid").is_empty(),
                "{name} has no invalid vector: a native channel needs a negative test"
            );
        }
    }

    #[test]
    fn native_manifest_send_slice_matches_the_router_slice() {
        let m = manifest();
        let channels = m["channels"].as_object().expect("channels object");
        let router = router();
        for (name, spec) in channels {
            if spec["kind"] == "send" {
                let route = router
                    .send
                    .get(name.as_str())
                    .unwrap_or_else(|| panic!("{name} has no send route"));
                assert_eq!(spec["slice"], route.slice, "{name}");
                assert!(router.queues.contains_key(route.slice), "{name}");
            }
        }
    }

    #[test]
    fn a_valid_open_external_url_reaches_the_host_on_the_opener_thread() {
        let (router, opened) = recording_router();
        let outcome = router.route_send("openExternalUrl", &[json!("https://example.com/a")]);
        assert_eq!(outcome, Some(Ok(())));
        let (url, thread_name) = opened.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(url, "https://example.com/a");
        assert_eq!(thread_name.as_deref(), Some("native-open-url"));
        assert_ne!(
            thread_name.as_deref(),
            thread::current().name(),
            "the opener must not run on the caller's thread"
        );
    }

    #[test]
    fn a_file_url_is_dropped_with_ok_and_never_reaches_the_host() {
        let (router, opened) = recording_router();
        for args in [
            vec![json!("file:///etc/passwd")],
            vec![],
            vec![Value::Null],
            vec![json!("https://a"), json!("extra")],
        ] {
            assert_eq!(router.route_send("openExternalUrl", &args), Some(Ok(())));
        }
        // A valid send queued behind them is the first thing the host sees.
        assert_eq!(
            router.route_send("openExternalUrl", &[json!("https://example.com")]),
            Some(Ok(()))
        );
        let (url, _) = opened.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(url, "https://example.com");
        assert!(opened.recv_timeout(Duration::from_millis(100)).is_err());
    }

    #[test]
    fn native_rejection_never_echoes_an_argument() {
        let sentinel = "SENTINEL-secret-token-9f3a";
        let args = vec![Value::String(sentinel.to_string())];
        let err = native_handlers::get_heroic_version(&args).unwrap_err();
        assert!(!err.contains(sentinel), "argument value leaked: {err}");
        assert!(err.starts_with(IPC_INVALID_ARGS_MARKER));
    }

    #[test]
    fn get_heroic_version_extra_element_is_too_big_at_the_root() {
        let err = native_handlers::get_heroic_version(&[Value::Null]).unwrap_err();
        let payload = tail(&err);
        assert_eq!(payload["paths"], json!(["(args)"]));
        assert_eq!(payload["codes"], json!(["too_big"]));
    }

    #[test]
    fn get_heroic_version_answers_cargo_pkg_version() {
        let v = native_handlers::get_heroic_version(&[]).unwrap();
        assert_eq!(v, Value::String(env!("CARGO_PKG_VERSION").to_string()));
        assert_eq!(native_handlers::app_version(), env!("CARGO_PKG_VERSION"));
    }

    fn job(channel: &'static str, url: &str) -> NativeSendJob {
        NativeSendJob {
            channel,
            url: url.to_string(),
        }
    }

    fn collect(rx: &Receiver<String>, n: usize) -> Vec<String> {
        (0..n)
            .map(|_| rx.recv_timeout(Duration::from_secs(5)).unwrap())
            .collect()
    }

    #[test]
    fn slice_queue_runs_fifty_jobs_in_enqueue_order() {
        let (done_tx, done_rx) = mpsc_channel::<String>();
        let queue = spawn_slice_worker("fifo-test", Shutdown::new(), move |job| {
            let _ = done_tx.send(job.url);
            Ok(())
        });
        let want: Vec<String> = (0..50)
            .map(|i| format!("https://example.com/{i}"))
            .collect();
        for url in &want {
            queue.enqueue(job("openExternalUrl", url)).unwrap();
        }
        assert_eq!(collect(&done_rx, 50), want);
    }

    #[test]
    fn slice_queue_enqueue_does_not_wait_for_a_blocked_handler() {
        // The defect class: a send handled on the main thread froze the UI. Enqueueing must return
        // while the worker is stuck inside a job.
        let (release_tx, release_rx) = mpsc_channel::<()>();
        let (done_tx, done_rx) = mpsc_channel::<String>();
        let queue = spawn_slice_worker("block-test", Shutdown::new(), move |job| {
            let _ = release_rx.recv();
            let _ = done_tx.send(job.url);
            Ok(())
        });
        let started = std::time::Instant::now();
        for url in ["a", "b", "c"] {
            queue.enqueue(job("openExternalUrl", url)).unwrap();
        }
        assert!(
            started.elapsed() < Duration::from_millis(500),
            "enqueue must not block on the handler"
        );
        for _ in 0..3 {
            release_tx.send(()).unwrap();
        }
        assert_eq!(collect(&done_rx, 3), ["a", "b", "c"]);
    }

    #[test]
    fn slice_queue_keeps_going_after_a_failed_job() {
        let (done_tx, done_rx) = mpsc_channel::<String>();
        let queue = spawn_slice_worker("fail-test", Shutdown::new(), move |job| {
            let _ = done_tx.send(job.url.clone());
            if job.url == "broken" {
                Err("handler failed".into())
            } else {
                Ok(())
            }
        });
        queue.enqueue(job("openExternalUrl", "broken")).unwrap();
        queue.enqueue(job("openExternalUrl", "after")).unwrap();
        assert_eq!(collect(&done_rx, 2), ["broken", "after"]);
    }

    #[test]
    fn slice_queue_keeps_going_after_a_panicking_job() {
        let (done_tx, done_rx) = mpsc_channel::<String>();
        let queue = spawn_slice_worker("panic-test", Shutdown::new(), move |job| {
            if job.url == "boom" {
                panic!("handler panicked");
            }
            let _ = done_tx.send(job.url);
            Ok(())
        });
        queue.enqueue(job("openExternalUrl", "boom")).unwrap();
        queue.enqueue(job("openExternalUrl", "after")).unwrap();
        assert_eq!(collect(&done_rx, 1), ["after"]);
    }

    #[test]
    fn a_native_queue_and_the_sidecar_send_queue_each_keep_their_own_order() {
        // No order across the two queues is asserted (D-02): each only preserves its own.
        let (native_tx, native_rx) = mpsc_channel::<String>();
        let native = spawn_slice_worker("interleave-test", Shutdown::new(), move |job| {
            let _ = native_tx.send(job.url);
            Ok(())
        });
        let (sidecar_tx, sidecar_rx) = mpsc_channel::<String>();
        let sidecar = crate::relay_commands::spawn_send_writer(move |req| {
            let _ = sidecar_tx.send(req.channel.clone());
            Ok(())
        });
        for i in 0..20 {
            native
                .enqueue(job("openExternalUrl", &format!("n{i}")))
                .unwrap();
            sidecar
                .send(crate::SidecarRpcRequest {
                    id: i.to_string(),
                    kind: "send",
                    channel: format!("s{i}"),
                    args: Vec::new(),
                })
                .unwrap();
        }
        let want = |p: &str| (0..20).map(|i| format!("{p}{i}")).collect::<Vec<_>>();
        assert_eq!(collect(&native_rx, 20), want("n"));
        assert_eq!(collect(&sidecar_rx, 20), want("s"));
    }

    /// A host whose `open_url` blocks until released, for the first URL only.
    struct BlockingHost {
        tx: Sender<String>,
        release: std::sync::Mutex<Option<Receiver<()>>>,
    }

    impl NativeHost for BlockingHost {
        fn open_url(&self, url: String) {
            let _ = self.tx.send(url);
            let held = self.release.lock().unwrap().take();
            if let Some(rx) = held {
                let _ = rx.recv();
            }
        }
    }

    #[test]
    fn a_blocked_open_url_does_not_stall_the_next_open_external_url() {
        // Pitfall 3 / D-UAT-19: on Windows `open_url` blocks while the OS shows a dialog. The
        // handler hands the URL to its own short-lived thread, so the slice worker moves on.
        let (tx, opened) = mpsc_channel::<String>();
        let (release_tx, release_rx) = mpsc_channel::<()>();
        let host = BlockingHost {
            tx,
            release: std::sync::Mutex::new(Some(release_rx)),
        };
        let router = NativeRouter::with_shutdown(Arc::new(host), Shutdown::new());
        for url in ["https://blocked.example/", "https://next.example/"] {
            assert_eq!(
                router.route_send("openExternalUrl", &[json!(url)]),
                Some(Ok(()))
            );
        }
        let first = opened.recv_timeout(Duration::from_secs(1)).unwrap();
        let second = opened.recv_timeout(Duration::from_secs(1));
        let _ = release_tx.send(());
        assert_eq!(first, "https://blocked.example/");
        assert_eq!(
            second.as_deref(),
            Ok("https://next.example/"),
            "the second URL must reach the host while the first open_url is still blocked"
        );
    }

    #[test]
    fn the_worker_holds_a_registrant_only_while_a_job_runs_and_drops_jobs_after_cancel() {
        let shutdown = Shutdown::new();
        let (started_tx, started_rx) = mpsc_channel::<()>();
        let (release_tx, release_rx) = mpsc_channel::<()>();
        let (ran_tx, ran_rx) = mpsc_channel::<String>();
        let queue = spawn_slice_worker("shutdown-test", shutdown.clone(), move |job| {
            let _ = ran_tx.send(job.url.clone());
            if job.url == "first" {
                let _ = started_tx.send(());
                let _ = release_rx.recv();
            }
            Ok(())
        });
        queue.enqueue(job("openExternalUrl", "first")).unwrap();
        started_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        // The job is running, so the slice is registered: the drain cancels the token and times out
        // naming it.
        assert_eq!(shutdown.drain(Duration::from_millis(50)), ["shutdown-test"]);
        queue.enqueue(job("openExternalUrl", "second")).unwrap();
        release_tx.send(()).unwrap();
        assert_eq!(collect(&ran_rx, 1), ["first"]);
        assert!(
            ran_rx.recv_timeout(Duration::from_millis(200)).is_err(),
            "a job queued after the token was cancelled must be dropped"
        );
        assert!(shutdown.drain(Duration::from_secs(2)).is_empty());
    }

    #[test]
    fn sanitise_path_matches_the_ts_rules() {
        assert_eq!(sanitise_path("(args)"), "(args)");
        assert_eq!(sanitise_path("a.b-c_d"), "a.b-c_d");
        assert_eq!(sanitise_path("a b\n"), "a?b?");
        assert_eq!(sanitise_path(&"x".repeat(100)).len(), 64);
        assert_eq!(sanitise_path("0.name"), "0.name");
    }

    #[test]
    fn invalid_args_cuts_a_hostile_channel_name() {
        let err = invalid_args(&"c\u{1b}".repeat(100), &["a.b"], &["too_big"]);
        let payload = tail(&err);
        let channel = payload["channel"].as_str().unwrap();
        assert!(channel.chars().count() <= 64);
        assert!(channel.chars().all(|c| c.is_ascii_graphic() || c == ' '));
    }
}
