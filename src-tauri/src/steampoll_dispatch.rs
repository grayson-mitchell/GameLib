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
        Box::pin(async move {
            if !SIDECAR_READY.load(Ordering::SeqCst) {
                return AckReply::not_acked();
            }
            let Some(state) = app.try_state::<Arc<SidecarState>>() else {
                return AckReply::not_acked();
            };
            let state: Arc<SidecarState> = state.inner().clone();
            let Ok(arg) = serde_json::to_value(&ev) else {
                return AckReply::not_acked();
            };
            // `invoke` blocks on a std channel: never on a runtime worker (T-80-59).
            let joined = gamelib_steampoll::runtime::handle()
                .spawn_blocking(move || state.invoke("steamPollStateEvent".to_string(), vec![arg]))
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
    let (app_root, asset_dir) = if cfg!(debug_assertions) {
        (PathBuf::from(resolve_dev_app_root()), "public")
    } else {
        (PathBuf::from(resolve_packaged_app_root(app)), "build")
    };
    let locales_dir = app_root.join(asset_dir).join("locales");
    profile.locales_dir = Some(locales_dir.clone());
    let helper =
        bridge_helper_path_for(&app_root, asset_dir, node_arch(), cfg!(target_os = "macos"));
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
