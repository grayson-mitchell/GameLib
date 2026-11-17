//! Handlers for the 24 `steampoll_*` rustInvoke channels (Phase 80 plan 18). Each validates through
//! its generated Args struct then calls the Tauri-free `gamelib-steampoll` dispatch on the calling
//! worker thread (the two async ops block on the crate's own runtime and answer `wrong-thread` if
//! called from inside one). Nothing here formats an argument, path or title into a log line (T-28-04).

use super::*;
use gamelib_i18n::Catalog;
use gamelib_steampoll::events::{AckReply, StateEvent};
use gamelib_steampoll::host::{BoxFuture, Notification, NotifyText, PollHost};
use gamelib_steampoll::profile::SidecarProfile;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;

pub(crate) fn rpc_steampoll_acf_enumerate_copies(args: &[Value]) -> Result<Value, String> {
    SteampollAcfEnumerateCopiesArgs::from_args(args)?;
    gamelib_steampoll::dispatch("steampoll_acf_enumerate_copies", args)
}

pub(crate) fn rpc_steampoll_acf_find_other_manifests(args: &[Value]) -> Result<Value, String> {
    SteampollAcfFindOtherManifestsArgs::from_args(args)?;
    gamelib_steampoll::dispatch("steampoll_acf_find_other_manifests", args)
}

pub(crate) fn rpc_steampoll_acf_read_state(args: &[Value]) -> Result<Value, String> {
    SteampollAcfReadStateArgs::from_args(args)?;
    gamelib_steampoll::dispatch("steampoll_acf_read_state", args)
}

pub(crate) fn rpc_steampoll_acf_read_update(args: &[Value]) -> Result<Value, String> {
    SteampollAcfReadUpdateArgs::from_args(args)?;
    gamelib_steampoll::dispatch("steampoll_acf_read_update", args)
}

pub(crate) fn rpc_steampoll_acf_read_update_from_dir(args: &[Value]) -> Result<Value, String> {
    SteampollAcfReadUpdateFromDirArgs::from_args(args)?;
    gamelib_steampoll::dispatch("steampoll_acf_read_update_from_dir", args)
}

pub(crate) fn rpc_steampoll_acf_remove_copy(args: &[Value]) -> Result<Value, String> {
    SteampollAcfRemoveCopyArgs::from_args(args)?;
    gamelib_steampoll::dispatch("steampoll_acf_remove_copy", args)
}

pub(crate) fn rpc_steampoll_acf_scan_downloading(args: &[Value]) -> Result<Value, String> {
    SteampollAcfScanDownloadingArgs::from_args(args)?;
    gamelib_steampoll::dispatch("steampoll_acf_scan_downloading", args)
}

pub(crate) fn rpc_steampoll_adoption_watch(args: &[Value]) -> Result<Value, String> {
    SteampollAdoptionWatchArgs::from_args(args)?;
    gamelib_steampoll::dispatch("steampoll_adoption_watch", args)
}

pub(crate) fn rpc_steampoll_breadcrumb_installed_on_disk(args: &[Value]) -> Result<Value, String> {
    SteampollBreadcrumbInstalledOnDiskArgs::from_args(args)?;
    gamelib_steampoll::dispatch("steampoll_breadcrumb_installed_on_disk", args)
}

pub(crate) fn rpc_steampoll_bridge_finalized(args: &[Value]) -> Result<Value, String> {
    SteampollBridgeFinalizedArgs::from_args(args)?;
    gamelib_steampoll::dispatch("steampoll_bridge_finalized", args)
}

pub(crate) fn rpc_steampoll_install_cancel_delegated(args: &[Value]) -> Result<Value, String> {
    SteampollInstallCancelDelegatedArgs::from_args(args)?;
    gamelib_steampoll::dispatch("steampoll_install_cancel_delegated", args)
}

pub(crate) fn rpc_steampoll_install_start(args: &[Value]) -> Result<Value, String> {
    SteampollInstallStartArgs::from_args(args)?;
    gamelib_steampoll::dispatch("steampoll_install_start", args)
}

pub(crate) fn rpc_steampoll_install_stop(args: &[Value]) -> Result<Value, String> {
    SteampollInstallStopArgs::from_args(args)?;
    gamelib_steampoll::dispatch("steampoll_install_stop", args)
}

pub(crate) fn rpc_steampoll_mac_arch_verdict(args: &[Value]) -> Result<Value, String> {
    SteampollMacArchVerdictArgs::from_args(args)?;
    gamelib_steampoll::dispatch("steampoll_mac_arch_verdict", args)
}

pub(crate) fn rpc_steampoll_native_in_flight(args: &[Value]) -> Result<Value, String> {
    SteampollNativeInFlightArgs::from_args(args)?;
    gamelib_steampoll::dispatch("steampoll_native_in_flight", args)
}

pub(crate) fn rpc_steampoll_next_notice_seq(args: &[Value]) -> Result<Value, String> {
    SteampollNextNoticeSeqArgs::from_args(args)?;
    gamelib_steampoll::dispatch("steampoll_next_notice_seq", args)
}

pub(crate) fn rpc_steampoll_read_running_app_id(args: &[Value]) -> Result<Value, String> {
    SteampollReadRunningAppIdArgs::from_args(args)?;
    gamelib_steampoll::dispatch("steampoll_read_running_app_id", args)
}

pub(crate) fn rpc_steampoll_running_hold(args: &[Value]) -> Result<Value, String> {
    SteampollRunningHoldArgs::from_args(args)?;
    gamelib_steampoll::dispatch("steampoll_running_hold", args)
}

pub(crate) fn rpc_steampoll_running_last_app_id(args: &[Value]) -> Result<Value, String> {
    SteampollRunningLastAppIdArgs::from_args(args)?;
    gamelib_steampoll::dispatch("steampoll_running_last_app_id", args)
}

pub(crate) fn rpc_steampoll_running_release(args: &[Value]) -> Result<Value, String> {
    SteampollRunningReleaseArgs::from_args(args)?;
    gamelib_steampoll::dispatch("steampoll_running_release", args)
}

pub(crate) fn rpc_steampoll_running_start(args: &[Value]) -> Result<Value, String> {
    SteampollRunningStartArgs::from_args(args)?;
    gamelib_steampoll::dispatch("steampoll_running_start", args)
}

pub(crate) fn rpc_steampoll_running_stop(args: &[Value]) -> Result<Value, String> {
    SteampollRunningStopArgs::from_args(args)?;
    gamelib_steampoll::dispatch("steampoll_running_stop", args)
}

pub(crate) fn rpc_steampoll_status(args: &[Value]) -> Result<Value, String> {
    SteampollStatusArgs::from_args(args)?;
    gamelib_steampoll::dispatch("steampoll_status", args)
}

pub(crate) fn rpc_steampoll_uninstall_start(args: &[Value]) -> Result<Value, String> {
    SteampollUninstallStartArgs::from_args(args)?;
    gamelib_steampoll::dispatch("steampoll_uninstall_start", args)
}

pub(crate) fn rpc_steampoll_uninstall_stop(args: &[Value]) -> Result<Value, String> {
    SteampollUninstallStopArgs::from_args(args)?;
    gamelib_steampoll::dispatch("steampoll_uninstall_stop", args)
}

/// Set by the sidecar reader on the READY line. Before it, a state event is not written (D-08 / R1:
/// the sidecar is not reading yet; the outbox keeps the event and replays it).
static SIDECAR_READY: AtomicBool = AtomicBool::new(false);

pub(crate) fn mark_sidecar_ready() {
    SIDECAR_READY.store(true, Ordering::SeqCst);
}

/// Boot work: rearm persisted restart holds and start the running poll. Spawns on the steampoll
/// runtime and returns at once (T-80-65).
pub(crate) fn steampoll_boot() {
    let Some(facade) = gamelib_steampoll::dispatch::facade::current() else {
        shell_eprintln!("[shell] steampoll boot skipped: no facade");
        return;
    };
    // D-09: boot resume of persisted restart holds, before the sidecar could ask.
    let polls = facade.polls.clone();
    let profile = facade.profile.clone();
    gamelib_steampoll::runtime::handle().spawn(async move {
        let _ = gamelib_steampoll::rearm::rearm_persisted_holds(&polls, &profile).await;
    });
    // The running poll starts at boot (first probe after 5 s).
    facade.running.start();
}

/// The sidecar the poll host writes state events to. Set by `spawn_sidecar_state` BEFORE the
/// reader thread starts, so a READY line read before `app.manage(state)` still finds it
/// (80-REVIEW B/CR-01: the boot replay used to see `try_state` = `None` and fail for good).
static STEAMPOLL_SIDECAR: OnceLock<Arc<SidecarState>> = OnceLock::new();

pub(crate) fn set_steampoll_sidecar_state(state: &Arc<SidecarState>) {
    let _ = STEAMPOLL_SIDECAR.set(state.clone());
}

/// Sender half that keeps the outbox retry loop alive. `Some` while the loop runs;
/// `steampoll_exit_shutdown` takes and drops it, which ends the loop.
static RETRY_STOP: Mutex<Option<Sender<()>>> = Mutex::new(None);

/// READY replay, then the in-session retry of unacked state events (80-REVIEW B/CR-01). READY
/// fires once per process, so before this a state event whose ack failed after READY sat in the
/// outbox until exit. Every `period` the loop calls `Outbox::retry_pending`, which does nothing
/// while the sidecar is not ready or nothing is queued, and never overlaps a running flush.
/// Returns when `stop`'s sender is dropped (or sends).
fn run_outbox_retry_loop(
    outbox: Arc<gamelib_steampoll::outbox::Outbox>,
    host: Arc<dyn PollHost>,
    period: Duration,
    stop: std::sync::mpsc::Receiver<()>,
) {
    let rt = gamelib_steampoll::runtime::handle();
    rt.block_on(outbox.mark_ready(host.as_ref()));
    while let Err(std::sync::mpsc::RecvTimeoutError::Timeout) = stop.recv_timeout(period) {
        rt.block_on(outbox.retry_pending(host.as_ref()));
    }
}

/// READY sentinel: the sidecar now reads, so the outbox replays queued state events in seq order
/// (R1), then retries whatever is still unacked every `RETRY_FLUSH_INTERVAL_MS`.
pub(crate) fn on_sidecar_ready_steampoll() {
    mark_sidecar_ready();
    let Some(facade) = gamelib_steampoll::dispatch::facade::current() else {
        return;
    };
    let period = Duration::from_millis(gamelib_steampoll::outbox::RETRY_FLUSH_INTERVAL_MS);
    // A plain detached thread parked in `recv_timeout`: it never blocks the reader thread on the
    // replay, and nothing waits for it at exit (process exit does not join it).
    start_outbox_retry(
        &RETRY_STOP,
        facade.outbox.clone(),
        facade.registry.host().clone(),
        period,
        |work| {
            thread::Builder::new()
                .name("steampoll-outbox-retry".into())
                .spawn(work)
                .map(|_| ())
        },
    );
}

/// The READY replay alone, on the steampoll runtime (the reader thread must not block on it).
fn replay_on_runtime(outbox: Arc<gamelib_steampoll::outbox::Outbox>, host: Arc<dyn PollHost>) {
    gamelib_steampoll::runtime::handle().spawn(async move {
        outbox.mark_ready(host.as_ref()).await;
    });
}

/// Starts the retry loop (whose first step is the READY replay) on a thread from `spawn`, once
/// per `slot`. If a loop already holds `slot`, only the replay runs, on the runtime. If `spawn`
/// fails, the slot is cleared so a later READY can try again, and the replay still runs on the
/// runtime: without it the outbox would stay not-ready and hold every state event for the
/// session (80-REVIEW B/WR-02, iteration 2).
fn start_outbox_retry(
    slot: &Mutex<Option<Sender<()>>>,
    outbox: Arc<gamelib_steampoll::outbox::Outbox>,
    host: Arc<dyn PollHost>,
    period: Duration,
    spawn: impl FnOnce(Box<dyn FnOnce() + Send>) -> std::io::Result<()>,
) {
    let rx = {
        let mut slot = slot.lock().unwrap_or_else(|e| e.into_inner());
        if slot.is_some() {
            None
        } else {
            let (tx, rx) = mpsc_channel::<()>();
            *slot = Some(tx);
            Some(rx)
        }
    };
    let Some(rx) = rx else {
        // A retry loop already runs (READY is once per process; this is only a guard): replay
        // once more on the runtime and let the existing loop keep retrying.
        replay_on_runtime(outbox, host);
        return;
    };
    let (o, h) = (outbox.clone(), host.clone());
    if spawn(Box::new(move || run_outbox_retry_loop(o, h, period, rx))).is_err() {
        shell_eprintln!("[shell] steampoll outbox retry thread failed to start; replaying once");
        slot.lock().unwrap_or_else(|e| e.into_inner()).take();
        replay_on_runtime(outbox, host);
    }
}

/// Sidecar EOF: later events queue instead of writing to a dead pipe. Polls keep running until exit (R1).
pub(crate) fn on_sidecar_eof_steampoll() {
    SIDECAR_READY.store(false, Ordering::SeqCst);
    if let Some(outbox) = gamelib_steampoll::dispatch::facade::outbox() {
        outbox.mark_not_ready();
    }
}

/// `RunEvent::Exit`: cancel every poll and kill every monitor child, bounded (D-07).
pub(crate) fn steampoll_exit_shutdown() {
    // End the outbox retry loop first, so it starts no new replay while the polls and the
    // sidecar go down. A replay already running is not waited for.
    RETRY_STOP.lock().unwrap_or_else(|e| e.into_inner()).take();
    let Some(facade) = gamelib_steampoll::dispatch::facade::current() else {
        return;
    };
    let registry = facade.registry.clone();
    let still = gamelib_steampoll::runtime::handle()
        .block_on(registry.cancel_all_and_wait(EXIT_FINALIZE_WAIT));
    facade.polls.stop_all_monitors();
    if still > 0 {
        shell_eprintln!("[shell] steampoll polls still running at exit deadline: {still}");
    }
}

/// The Node `process.arch` spelling `appPaths.ts` puts in `public/bin/<arch>/...`.
fn node_arch() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "arm64"
    } else if cfg!(target_arch = "x86_64") {
        "x64"
    } else {
        std::env::consts::ARCH
    }
}

/// `appPaths.ts` `darwinBin('steam-bridge-helper')`: `<app root>/<asset dir>/bin/<arch>/darwin/...`.
/// `None` off macOS.
fn bridge_helper_path_for(
    app_root: &Path,
    asset_dir: &str,
    arch: &str,
    macos: bool,
) -> Option<PathBuf> {
    macos.then(|| {
        app_root
            .join(asset_dir)
            .join("bin")
            .join(arch)
            .join("darwin")
            .join("steam-bridge-helper")
    })
}

/// The app root and asset dir the sidecar's `appPaths.ts` uses (`public` in dev, `build` packaged).
fn app_root_and_asset_dir(app: &AppHandle) -> (PathBuf, &'static str) {
    if cfg!(debug_assertions) {
        (PathBuf::from(resolve_dev_app_root()), "public")
    } else {
        (PathBuf::from(resolve_packaged_app_root(app)), "build")
    }
}

/// The bundled `steam-bridge-helper` this shell ships. `None` off macOS.
pub(crate) fn bundled_bridge_helper_path(app: &AppHandle) -> Option<PathBuf> {
    let (app_root, asset_dir) = app_root_and_asset_dir(app);
    bridge_helper_path_for(&app_root, asset_dir, node_arch(), cfg!(target_os = "macos"))
}

/// Renders a notification text through the catalog (`Literal` passes through).
fn render_notify_text(catalog: &Catalog, text: &NotifyText) -> String {
    match text {
        NotifyText::Literal(s) => s.clone(),
        NotifyText::Key {
            key,
            default,
            params,
        } => catalog.t(key, default, params),
    }
}

/// How long the shell waits for a `steamPollStateEvent` ack: clearly under the crate's
/// `ACK_TIMEOUT_MS`, so the invoke settles (answered or timed out, pending entry removed) before
/// the crate's own timer drops the future. Equal bounds raced, and the crate's timer always won,
/// discarding an ack that arrived just in time (80-REVIEW B/WR-02).
pub(crate) const STATE_EVENT_INVOKE_BOUND: Duration =
    Duration::from_millis(gamelib_steampoll::constants::ACK_TIMEOUT_MS - 500);

/// Below this much time left before the deadline the state-event frame is not written: the
/// sidecar would apply it, the ack could not come back in time, and the crate would replay a
/// duplicate (80-REVIEW B/IN-04). The event simply stays queued.
pub(crate) const STATE_EVENT_MIN_WRITE_LEFT: Duration = Duration::from_millis(250);

/// Reply of the sidecar's `steamPollStateEvent` handler, parsed leniently (T-80-61).
fn ack_from_invoke(result: Result<Value, String>) -> AckReply {
    match result {
        Ok(v) => AckReply::from_value(v),
        Err(_) => AckReply::not_acked(),
    }
}

/// The production poll host. Logs only channel names and appIds (T-80-62).
pub(crate) struct ShellPollHost {
    app: AppHandle,
    profile: SidecarProfile,
    locales_dir: PathBuf,
    helper: Option<PathBuf>,
}

impl PollHost for ShellPollHost {
    fn emit_frontend(&self, channel: &str, args: Vec<Value>) {
        // Same payload the sidecar relay emits, so the frontend is unchanged (D-04).
        let _ = self.app.emit(
            FRONTEND_MESSAGE_EVENT,
            FrontendMessagePayload {
                channel: channel.to_string(),
                args,
            },
        );
    }

    fn notify(&self, n: Notification) {
        let app = self.app.clone();
        let language = self.profile.language().unwrap_or_else(|| "en".to_string());
        let locales = self.locales_dir.clone();
        // A slow OS call must never block a poll.
        std::thread::spawn(move || {
            let catalog = Catalog::load(&locales, &language);
            let title = render_notify_text(&catalog, &n.title);
            let body = render_notify_text(&catalog, &n.body);
            if let Err(e) = show_notification(&app, Some(&title), Some(&body)) {
                shell_eprintln!("[shell] steampoll notify failed: {e}");
            }
        });
    }

    fn state_event(&self, ev: StateEvent) -> BoxFuture<AckReply> {
        let app = self.app.clone();
        // Captured here, before the crate starts its `ACK_TIMEOUT_MS` timer around this future,
        // so the invoke always settles first (B/WR-02).
        let deadline = std::time::Instant::now() + STATE_EVENT_INVOKE_BOUND;
        Box::pin(async move {
            if !SIDECAR_READY.load(Ordering::SeqCst) {
                return AckReply::not_acked();
            }
            // The OnceLock is set before the reader starts; `try_state` is only a fallback.
            let state: Arc<SidecarState> = match STEAMPOLL_SIDECAR.get() {
                Some(state) => state.clone(),
                None => match app.try_state::<Arc<SidecarState>>() {
                    Some(state) => state.inner().clone(),
                    None => return AckReply::not_acked(),
                },
            };
            let Ok(arg) = serde_json::to_value(&ev) else {
                return AckReply::not_acked();
            };
            // `invoke` blocks on a std channel: never on a runtime worker (T-80-59). A blocking
            // task cannot be cancelled, so a closure that only gets to write after the deadline
            // (queued behind the 8-thread pool, or waiting on the shared stdin lock) must not
            // write the frame: the crate has already given up on this event and re-queued it,
            // and a newer event may have been applied since. `invoke_until` re-checks the
            // deadline under the stdin lock and sizes the ack wait from it (B/WR-01).
            let joined = gamelib_steampoll::runtime::handle()
                .spawn_blocking(move || {
                    state.invoke_until(
                        "steamPollStateEvent".to_string(),
                        vec![arg],
                        deadline,
                        STATE_EVENT_MIN_WRITE_LEFT,
                    )
                })
                .await;
            match joined {
                Ok(result) => ack_from_invoke(result),
                Err(_) => AckReply::not_acked(),
            }
        })
    }

    fn bridge_helper_path(&self) -> Option<PathBuf> {
        self.helper.clone()
    }

    fn shell_pid(&self) -> u32 {
        std::process::id()
    }
}

/// Builds the real host and installs the poll facade. Call before the sidecar is spawned.
pub(crate) fn install_steampoll_host(app: &AppHandle) {
    let Some(mut profile) = SidecarProfile::current() else {
        shell_eprintln!("[shell] steampoll host not installed: no home directory");
        return;
    };
    let (app_root, asset_dir) = app_root_and_asset_dir(app);
    let locales_dir = app_root.join(asset_dir).join("locales");
    profile.locales_dir = Some(locales_dir.clone());
    let helper = bundled_bridge_helper_path(app);
    let host = Arc::new(ShellPollHost {
        app: app.clone(),
        profile: profile.clone(),
        locales_dir,
        helper,
    });
    let hold = Arc::new(gamelib_steampoll::hold::HoldStore::new(
        profile.restart_hold_store_path.clone(),
    ));
    gamelib_steampoll::dispatch::facade::install(
        host,
        Arc::new(gamelib_steampoll::runtime::TokioRunner),
        Arc::new(gamelib_steampoll::runtime::SystemClock),
        hold,
        profile,
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn boot_and_hooks_are_inert_without_a_facade() {
        let start = std::time::Instant::now();
        steampoll_boot();
        on_sidecar_ready_steampoll();
        on_sidecar_eof_steampoll();
        steampoll_exit_shutdown();
        assert!(start.elapsed() < EXIT_FINALIZE_WAIT);
        SIDECAR_READY.store(false, Ordering::SeqCst);
    }

    #[test]
    fn frontend_payload_matches_the_relay_shape() {
        let p = FrontendMessagePayload {
            channel: "gameStatusUpdate".into(),
            args: vec![json!({"appName": "1"})],
        };
        assert_eq!(
            serde_json::to_value(&p).unwrap(),
            json!({"channel": "gameStatusUpdate", "args": [{"appName": "1"}]})
        );
    }

    #[test]
    fn helper_path_follows_app_paths_ts() {
        let root = Path::new("/app");
        assert_eq!(
            bridge_helper_path_for(root, "public", "arm64", true),
            Some(PathBuf::from(
                "/app/public/bin/arm64/darwin/steam-bridge-helper"
            ))
        );
        assert_eq!(bridge_helper_path_for(root, "build", "x64", false), None);
    }

    #[test]
    fn notify_text_literal_passes_through_and_key_falls_back_to_default() {
        let dir = std::env::temp_dir().join("gamelib-steampoll-no-locales");
        let c = Catalog::load(&dir, "en");
        assert_eq!(
            render_notify_text(&c, &NotifyText::Literal("hi".into())),
            "hi"
        );
        let k = NotifyText::Key {
            key: "no.such.key".into(),
            default: "Hello {{name}}".into(),
            params: serde_json::Map::new(),
        };
        assert!(render_notify_text(&c, &k).starts_with("Hello"));
    }

    /// Answers `applied` only once `fail_first` sends have been refused (B/CR-01).
    struct FlakyAckHost {
        sends: std::sync::atomic::AtomicUsize,
        fail_first: usize,
    }

    impl PollHost for FlakyAckHost {
        fn emit_frontend(&self, _channel: &str, _args: Vec<Value>) {}
        fn notify(&self, _n: Notification) {}
        fn state_event(&self, _ev: StateEvent) -> BoxFuture<AckReply> {
            let n = self.sends.fetch_add(1, Ordering::SeqCst);
            let applied = n >= self.fail_first;
            Box::pin(async move {
                AckReply {
                    applied,
                    ..AckReply::not_acked()
                }
            })
        }
        fn bridge_helper_path(&self) -> Option<PathBuf> {
            None
        }
        fn shell_pid(&self) -> u32 {
            0
        }
    }

    fn installed(seq: u64) -> StateEvent {
        StateEvent::Installed {
            app_id: "440".into(),
            seq,
            source: "native".into(),
            install_path: "/x".into(),
            size_on_disk: "1".into(),
            buildid: None,
        }
    }

    #[test]
    fn retry_loop_redelivers_an_event_whose_ack_failed_after_ready() {
        let outbox = Arc::new(gamelib_steampoll::outbox::Outbox::new());
        outbox.enqueue(installed(1));
        // The READY replay and the first retry are refused; the second retry is applied.
        let host = Arc::new(FlakyAckHost {
            sends: std::sync::atomic::AtomicUsize::new(0),
            fail_first: 2,
        });
        let (tx, rx) = mpsc_channel::<()>();
        let (o, h) = (outbox.clone(), host.clone() as Arc<dyn PollHost>);
        let loop_thread = thread::spawn(move || {
            run_outbox_retry_loop(o, h, Duration::from_millis(10), rx);
        });
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while outbox.queued_len() > 0 && std::time::Instant::now() < deadline {
            thread::sleep(Duration::from_millis(5));
        }
        assert_eq!(outbox.queued_len(), 0, "the retry loop never redelivered");
        assert!(host.sends.load(Ordering::SeqCst) >= 3);
        // Idle ticks send nothing.
        let sent = host.sends.load(Ordering::SeqCst);
        thread::sleep(Duration::from_millis(50));
        assert_eq!(host.sends.load(Ordering::SeqCst), sent);
        // Dropping the sender (what exit does) ends the loop promptly.
        let stopped_at = std::time::Instant::now();
        drop(tx);
        loop_thread.join().unwrap();
        assert!(stopped_at.elapsed() < Duration::from_secs(1));
    }

    fn wait_for(mut done: impl FnMut() -> bool) -> bool {
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while !done() {
            if std::time::Instant::now() >= deadline {
                return false;
            }
            thread::sleep(Duration::from_millis(5));
        }
        true
    }

    #[test]
    fn a_failed_retry_thread_spawn_still_replays_and_frees_the_slot() {
        let slot: Mutex<Option<Sender<()>>> = Mutex::new(None);
        let outbox = Arc::new(gamelib_steampoll::outbox::Outbox::new());
        outbox.enqueue(installed(1));
        let host = Arc::new(FlakyAckHost {
            sends: std::sync::atomic::AtomicUsize::new(0),
            fail_first: 0,
        });
        start_outbox_retry(
            &slot,
            outbox.clone(),
            host.clone(),
            Duration::from_millis(10),
            |_work| Err(std::io::Error::other("no threads")),
        );
        // The READY replay ran anyway: the outbox is ready and the queued event was delivered.
        assert!(wait_for(|| outbox.queued_len() == 0), "replay never ran");
        assert!(outbox.is_ready());
        // The slot is free, so a later READY starts the loop.
        assert!(slot.lock().unwrap().is_none());
        let (started_tx, started_rx) = mpsc_channel::<()>();
        start_outbox_retry(
            &slot,
            outbox.clone(),
            host.clone(),
            Duration::from_millis(10),
            move |work| {
                thread::spawn(move || {
                    let _ = started_tx.send(());
                    work();
                });
                Ok(())
            },
        );
        started_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        // Dropping the sender ends that loop, as exit does.
        slot.lock().unwrap().take();
    }

    #[test]
    fn retry_loop_sends_nothing_while_the_sidecar_is_not_ready() {
        let outbox = Arc::new(gamelib_steampoll::outbox::Outbox::new());
        outbox.enqueue(installed(1));
        let host = Arc::new(FlakyAckHost {
            sends: std::sync::atomic::AtomicUsize::new(0),
            fail_first: usize::MAX,
        });
        let (tx, rx) = mpsc_channel::<()>();
        let (o, h) = (outbox.clone(), host.clone() as Arc<dyn PollHost>);
        let loop_thread = thread::spawn(move || {
            run_outbox_retry_loop(o, h, Duration::from_millis(10), rx);
        });
        thread::sleep(Duration::from_millis(30));
        // Sidecar EOF: the loop keeps ticking but `retry_pending` must not send.
        outbox.mark_not_ready();
        thread::sleep(Duration::from_millis(30));
        let sent = host.sends.load(Ordering::SeqCst);
        thread::sleep(Duration::from_millis(60));
        assert_eq!(host.sends.load(Ordering::SeqCst), sent);
        assert_eq!(outbox.queued_len(), 1);
        drop(tx);
        loop_thread.join().unwrap();
    }

    #[test]
    fn state_event_invoke_settles_before_the_crate_ack_timer() {
        let ack = Duration::from_millis(gamelib_steampoll::constants::ACK_TIMEOUT_MS);
        assert!(STATE_EVENT_INVOKE_BOUND < ack);
        assert!(ack - STATE_EVENT_INVOKE_BOUND >= Duration::from_millis(500));
    }

    #[test]
    fn a_closure_started_after_the_deadline_does_not_write() {
        use crate::shell_state::time_left_to_write;
        let t0 = std::time::Instant::now();
        let deadline = t0 + Duration::from_millis(1000);
        let floor = STATE_EVENT_MIN_WRITE_LEFT;
        // Started in time: waits only for what is left, never past the deadline.
        assert_eq!(
            time_left_to_write(deadline, t0 + Duration::from_millis(400), floor),
            Some(Duration::from_millis(600))
        );
        // Queued behind a full blocking pool (or the stdin lock) until the deadline or later:
        // no write.
        assert_eq!(time_left_to_write(deadline, deadline, floor), None);
        assert_eq!(
            time_left_to_write(deadline, deadline + Duration::from_secs(1), floor),
            None
        );
        // 1 ms (or anything up to the floor) left is treated as none (B/IN-04).
        assert_eq!(
            time_left_to_write(deadline, deadline - Duration::from_millis(1), floor),
            None
        );
        assert_eq!(time_left_to_write(deadline, deadline - floor, floor), None);
        assert!(STATE_EVENT_MIN_WRITE_LEFT < STATE_EVENT_INVOKE_BOUND);
    }

    /// `SidecarState` needs a real child, so the ordering inside `invoke_until` is pinned on its
    /// source: deadline re-checked after the stdin lock, frame written under that guard, and the
    /// ack wait sized from the deadline after the write (80-REVIEW B/WR-01).
    #[test]
    fn invoke_until_rechecks_the_deadline_under_the_stdin_lock() {
        let src = include_str!("shell_state.rs");
        let start = src.find("pub(crate) fn invoke_until(").unwrap();
        let body = &src[start..start + src[start..].find("\n    fn await_reply(").unwrap()];
        let lock = body.find("self.stdin.lock()").unwrap();
        let recheck = body[lock..].find("time_left_to_write(").unwrap() + lock;
        let write = body.find("write_line(&mut stdin").unwrap();
        let left = body
            .find("let left = deadline.saturating_duration_since")
            .unwrap();
        let wait = body
            .find("self.await_reply(&id, &channel, &rx, Some(left))")
            .unwrap();
        assert!(lock < recheck && recheck < write && write < left && left < wait);
    }

    #[test]
    fn adoption_watch_args_accept_the_zod_shaped_object() {
        let a = SteampollAdoptionWatchArgs::from_args(&[json!({
            "appId": "1234",
            "manifestPath": "/steam/steamapps/appmanifest_1234.acf",
            "baselineContent": "x",
            "recordedAtMs": 1_700_000_000_000.0,
            "steamPid": 0
        })])
        .unwrap();
        assert_eq!(a.app_id, "1234");
        assert_eq!(a.install_app_fallback, None);
        let with = SteampollAdoptionWatchArgs::from_args(&[json!({
            "appId": "1234",
            "manifestPath": "/steam/steamapps/appmanifest_1234.acf",
            "baselineContent": "x",
            "recordedAtMs": 1.0,
            "steamPid": 4242,
            "installAppFallback": true
        })])
        .unwrap();
        assert_eq!(with.install_app_fallback, Some(true));
        assert_eq!(
            SteampollAdoptionWatchArgs::from_args(&[]).unwrap_err(),
            "steampoll_adoption_watch:bad-args"
        );
    }

    #[test]
    fn adoption_watch_rejects_an_unknown_key_with_its_own_bad_args() {
        // The generated struct tolerates extra keys (genIpcContract emits no deny_unknown_fields),
        // so the crate's strict parse is what refuses them; it runs before any facade lookup.
        let args = [json!({
            "appId": "1234",
            "manifestPath": "/steam/steamapps/appmanifest_1234.acf",
            "baselineContent": "x",
            "recordedAtMs": 1.0,
            "steamPid": 0,
            "extra": true
        })];
        assert_eq!(
            rpc_steampoll_adoption_watch(&args).unwrap_err(),
            "steampoll_adoption_watch:bad-args"
        );
    }

    #[test]
    fn read_running_app_id_accepts_an_absent_object_like_the_zod_schema() {
        // `[]` and `[null]` (`[undefined]` over JSON) are valid sends (80-REVIEW B/WR-03).
        assert_eq!(
            SteampollReadRunningAppIdArgs::from_args(&[])
                .unwrap()
                .strict,
            None
        );
        assert_eq!(
            SteampollReadRunningAppIdArgs::from_args(&[Value::Null])
                .unwrap()
                .strict,
            None
        );
        assert_eq!(
            SteampollReadRunningAppIdArgs::from_args(&[json!({"strict": true})])
                .unwrap()
                .strict,
            Some(true)
        );
        assert_eq!(
            SteampollReadRunningAppIdArgs::from_args(&[json!("x")]).unwrap_err(),
            "steampoll_read_running_app_id:bad-args"
        );
    }

    #[test]
    fn malformed_or_failed_acks_are_not_acked() {
        assert_eq!(
            ack_from_invoke(Err("timeout".into())),
            AckReply::not_acked()
        );
        assert_eq!(ack_from_invoke(Ok(json!("garbage"))), AckReply::not_acked());
        assert!(ack_from_invoke(Ok(json!({"applied": true}))).applied);
    }
}
