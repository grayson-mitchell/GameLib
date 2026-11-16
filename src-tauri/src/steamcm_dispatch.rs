//! Handlers for the `steamcm_*` rustInvoke channels (Phase 79 plan 16). Each validates through
//! its generated Args struct, then passes straight to the Tauri-free `gamelib-steamcm` crate.
//! T-28-04: nothing here formats a token, password, guard code, key, request code or argument
//! into a log line. Handlers run on the `rustInvoke` worker thread (never a tokio thread), so the
//! crate's sync facade (which blocks on its own runtime) is legal to call.

use super::*;
use gamelib_steamcm::wrap::WrapHost;
use std::time::Duration;

/// Bound for the EOF and exit shutdowns (cancel flows, close anon, pay owed goonline, log off).
const STEAMCM_SHUTDOWN_BOUND: Duration = Duration::from_secs(5);

pub(crate) fn rpc_steamcm_anon_close(args: &[Value]) -> Result<Value, String> {
    SteamcmAnonCloseArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_anon_close", args)
}

pub(crate) fn rpc_steamcm_anon_product_info(args: &[Value]) -> Result<Value, String> {
    SteamcmAnonProductInfoArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_anon_product_info", args)
}

pub(crate) fn rpc_steamcm_configure(args: &[Value]) -> Result<Value, String> {
    SteamcmConfigureArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_configure", args)
}

pub(crate) fn rpc_steamcm_content_servers(args: &[Value]) -> Result<Value, String> {
    SteamcmContentServersArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_content_servers", args)
}

pub(crate) fn rpc_steamcm_depot_key(args: &[Value]) -> Result<Value, String> {
    SteamcmDepotKeyArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_depot_key", args)
}

/// The shell's own bundled `steam-bridge-helper`, set once by `install_steamcm_host`.
static BUNDLED_HELPER: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();

/// T-79-104: the sidecar names an executable to spawn, so only the shell's bundled helper may pass.
/// The path must be absolute, must not climb, must be named `steam-bridge-helper`, and must
/// resolve to the same file as `bundled`. With no bundled helper known, nothing passes.
fn helper_path_ok(helper_path: &str, bundled: Option<&std::path::Path>) -> bool {
    let p = std::path::Path::new(helper_path);
    let climbs = p
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir));
    if !p.is_absolute()
        || climbs
        || p.file_name().and_then(|n| n.to_str()) != Some("steam-bridge-helper")
    {
        return false;
    }
    let Some(bundled) = bundled else {
        return false;
    };
    match (std::fs::canonicalize(p), std::fs::canonicalize(bundled)) {
        (Ok(got), Ok(want)) => got == want,
        _ => false,
    }
}

fn bundled_helper_ok(helper_path: &str) -> bool {
    helper_path_ok(helper_path, BUNDLED_HELPER.get().map(|p| p.as_path()))
}

pub(crate) fn rpc_steamcm_mac_owned_apps(args: &[Value]) -> Result<Value, String> {
    let a = SteamcmMacOwnedAppsArgs::from_args(args)?;
    if !bundled_helper_ok(&a.helper_path) {
        return Err("steamcm_mac_owned_apps:bad-args".to_string());
    }
    gamelib_steamcm::dispatch("steamcm_mac_owned_apps", args)
}

pub(crate) fn rpc_steamcm_licenses(args: &[Value]) -> Result<Value, String> {
    SteamcmLicensesArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_licenses", args)
}

pub(crate) fn rpc_steamcm_manifest_request_code(args: &[Value]) -> Result<Value, String> {
    SteamcmManifestRequestCodeArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_manifest_request_code", args)
}

pub(crate) fn rpc_steamcm_owned_apps(args: &[Value]) -> Result<Value, String> {
    SteamcmOwnedAppsArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_owned_apps", args)
}

pub(crate) fn rpc_steamcm_personas(args: &[Value]) -> Result<Value, String> {
    SteamcmPersonasArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_personas", args)
}

pub(crate) fn rpc_steamcm_product_info(args: &[Value]) -> Result<Value, String> {
    SteamcmProductInfoArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_product_info", args)
}

pub(crate) fn rpc_steamcm_redeem_key(args: &[Value]) -> Result<Value, String> {
    SteamcmRedeemKeyArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_redeem_key", args)
}

pub(crate) fn rpc_steamcm_refresh(args: &[Value]) -> Result<Value, String> {
    let a = SteamcmRefreshArgs::from_args(args)?;
    // T-79-104 (B/WR-01): the macSteam source spawns `helperPath`, so it takes the same guard.
    // A refusal is a transport error, which `tryMacSteamRefresh` treats as a CM-path fallback.
    if a.source.kind == SteamcmRefreshArgsSourceKind::MacSteam
        && !a
            .source
            .helper_path
            .as_deref()
            .is_some_and(bundled_helper_ok)
    {
        return Err("steamcm_refresh:bad-args".to_string());
    }
    gamelib_steamcm::dispatch("steamcm_refresh", args)
}

pub(crate) fn rpc_steamcm_session_acquire(args: &[Value]) -> Result<Value, String> {
    SteamcmSessionAcquireArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_session_acquire", args)
}

pub(crate) fn rpc_steamcm_session_acquire_open(args: &[Value]) -> Result<Value, String> {
    SteamcmSessionAcquireOpenArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_session_acquire_open", args)
}

pub(crate) fn rpc_steamcm_session_ensure_connected(args: &[Value]) -> Result<Value, String> {
    SteamcmSessionEnsureConnectedArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_session_ensure_connected", args)
}

pub(crate) fn rpc_steamcm_session_logout(args: &[Value]) -> Result<Value, String> {
    SteamcmSessionLogoutArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_session_logout", args)
}

pub(crate) fn rpc_steamcm_session_release(args: &[Value]) -> Result<Value, String> {
    SteamcmSessionReleaseArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_session_release", args)
}

pub(crate) fn rpc_steamcm_session_shutdown(args: &[Value]) -> Result<Value, String> {
    SteamcmSessionShutdownArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_session_shutdown", args)
}

pub(crate) fn rpc_steamcm_session_status(args: &[Value]) -> Result<Value, String> {
    SteamcmSessionStatusArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_session_status", args)
}

pub(crate) fn rpc_steamcm_signin_cancel(args: &[Value]) -> Result<Value, String> {
    SteamcmSigninCancelArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_signin_cancel", args)
}

pub(crate) fn rpc_steamcm_signin_credentials_start(args: &[Value]) -> Result<Value, String> {
    SteamcmSigninCredentialsStartArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_signin_credentials_start", args)
}

pub(crate) fn rpc_steamcm_signin_guard_submit(args: &[Value]) -> Result<Value, String> {
    SteamcmSigninGuardSubmitArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_signin_guard_submit", args)
}

pub(crate) fn rpc_steamcm_signin_qr_start(args: &[Value]) -> Result<Value, String> {
    SteamcmSigninQrStartArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_signin_qr_start", args)
}

pub(crate) fn rpc_steamcm_signin_status(args: &[Value]) -> Result<Value, String> {
    SteamcmSigninStatusArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_signin_status", args)
}

pub(crate) fn rpc_steamcm_store_appdetails(args: &[Value]) -> Result<Value, String> {
    SteamcmStoreAppdetailsArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_store_appdetails", args)
}

pub(crate) fn rpc_steamcm_store_enrich(args: &[Value]) -> Result<Value, String> {
    SteamcmStoreEnrichArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_store_enrich", args)
}

pub(crate) fn rpc_steamcm_wrap_restore_if_owed(args: &[Value]) -> Result<Value, String> {
    SteamcmWrapRestoreIfOwedArgs::from_args(args)?;
    gamelib_steamcm::dispatch("steamcm_wrap_restore_if_owed", args)
}

/// The production wrap host: opens only the two const steam:// URLs, probes Steam and process
/// liveness natively, and reports the real local UTC offset (the late-logoff and "Logged On"
/// fallback checks compare local-time connection_log stamps).
pub(crate) struct ShellWrapHost {
    /// Issues the open (production: `tauri-plugin-opener`, which returns once `open` is spawned).
    opener: Arc<dyn Fn(&'static str) -> Result<(), String> + Send + Sync>,
    /// How long `open_steam_url` waits for `opener` before reporting the open as not issued.
    open_bound: Duration,
}

/// B/WR-02: bound for one steam:// open. The Shutdown restore clears the owed record as soon as
/// `open_steam_url` returns true, so true must mean the open was issued, not merely queued.
const STEAM_URL_OPEN_BOUND: Duration = Duration::from_secs(2);

impl ShellWrapHost {
    fn new(app: &AppHandle) -> Self {
        let app = app.clone();
        Self {
            opener: Arc::new(move |url| {
                app.opener()
                    .open_url(url, None::<&str>)
                    .map_err(|e| e.to_string())
            }),
            open_bound: STEAM_URL_OPEN_BOUND,
        }
    }
}

impl WrapHost for ShellWrapHost {
    fn open_steam_url(&self, url: &'static str) -> bool {
        use gamelib_steamcm::wrap::{STEAM_GO_OFFLINE_URL, STEAM_GO_ONLINE_URL};
        if url != STEAM_GO_OFFLINE_URL && url != STEAM_GO_ONLINE_URL {
            return false;
        }
        if open_external_scheme_check(url).is_err() {
            return false;
        }
        // Worker thread: `open_url` can block behind an OS dialog (see sidecar.rs, D-UAT-19), so
        // the wait is bounded. A late or failed open reports false, which keeps the owed record
        // (`KeptProbeFailed`) for the next boot's confirmed restore instead of clearing it.
        let opener = self.opener.clone();
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let issued = match opener(url) {
                Ok(()) => true,
                Err(e) => {
                    shell_eprintln!("[shell] steamcm wrap open failed: {e}");
                    false
                }
            };
            let _ = tx.send(issued);
        });
        rx.recv_timeout(self.open_bound).unwrap_or(false)
    }

    fn steam_running(&self) -> bool {
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("pgrep")
                .args(["-x", "steam_osx"])
                .stdin(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .output()
                .is_ok_and(|o| o.status.success())
        }
        #[cfg(not(target_os = "macos"))]
        {
            false
        }
    }

    fn connection_log_path(&self) -> std::path::PathBuf {
        let home = std::env::var_os("HOME")
            .map(std::path::PathBuf::from)
            .unwrap_or_default();
        home.join("Library/Application Support/Steam/logs/connection_log.txt")
    }

    fn pid_alive(&self, pid: u32) -> bool {
        #[cfg(unix)]
        {
            let Ok(pid) = i32::try_from(pid) else {
                return false;
            };
            if pid <= 0 {
                return false;
            }
            // SAFETY: signal 0 only checks existence/permission; it delivers nothing.
            unsafe { libc::kill(pid, 0) == 0 }
        }
        #[cfg(not(unix))]
        {
            let _ = pid;
            false
        }
    }

    fn system_boot_unix_ms(&self) -> Option<i64> {
        #[cfg(target_os = "macos")]
        {
            let mut tv = libc::timeval {
                tv_sec: 0,
                tv_usec: 0,
            };
            let mut len = std::mem::size_of::<libc::timeval>();
            // SAFETY: `tv`/`len` describe a valid timeval buffer for kern.boottime.
            let rc = unsafe {
                libc::sysctlbyname(
                    c"kern.boottime".as_ptr(),
                    (&raw mut tv).cast(),
                    &raw mut len,
                    std::ptr::null_mut(),
                    0,
                )
            };
            (rc == 0).then(|| tv.tv_sec * 1000 + i64::from(tv.tv_usec) / 1000)
        }
        #[cfg(not(target_os = "macos"))]
        {
            None
        }
    }

    fn local_utc_offset_secs(&self, unix_secs: i64) -> i64 {
        #[cfg(unix)]
        {
            let t: libc::time_t = unix_secs as libc::time_t;
            // SAFETY: localtime_r writes only into the zeroed `tm` we own.
            let mut tm: libc::tm = unsafe { std::mem::zeroed() };
            let p = unsafe { libc::localtime_r(&t, &mut tm) };
            if p.is_null() {
                0
            } else {
                tm.tm_gmtoff
            }
        }
        #[cfg(not(unix))]
        {
            let _ = unix_secs;
            0
        }
    }
}

/// Installs the production wrap host and routes crate diagnostics to the shell log. Must run
/// before any acquire; on macOS `steamcm_configure` fails without a host.
pub(crate) fn install_steamcm_host(app: &AppHandle) {
    if let Some(helper) = bundled_bridge_helper_path(app) {
        let _ = BUNDLED_HELPER.set(helper);
    }
    gamelib_steamcm::error::set_diag_sink(shell_diag);
    gamelib_steamcm::facade::set_wrap_host(Arc::new(ShellWrapHost::new(app)));
}

fn steamcm_shutdown(context: &str) {
    let outcome = gamelib_steamcm::facade::shutdown_all(STEAMCM_SHUTDOWN_BOUND);
    // Outcome name only, never any session detail (T-28-04).
    shell_eprintln!("[shell] steamcm shutdown ({context}): {outcome:?}");
}

/// Sidecar stdout EOF: no consumer remains for any lease, so drop them all and pay any owed goonline.
pub(crate) fn on_sidecar_eof_drop_steamcm() {
    steamcm_shutdown("sidecar eof");
}

/// `RunEvent::Exit`: pays any owed goonline and logs off before the sidecar dies (Pitfall 1, D-03).
pub(crate) fn steamcm_exit_shutdown() {
    steamcm_shutdown("exit");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn eof_and_exit_hooks_return_within_bound_when_unconfigured() {
        let start = Instant::now();
        on_sidecar_eof_drop_steamcm();
        steamcm_exit_shutdown();
        assert!(start.elapsed() < STEAMCM_SHUTDOWN_BOUND * 2);
    }

    /// B/IN-01: a `{:?}` on a secret-bearing args struct must never print the secret (T-28-04).
    #[test]
    fn secret_bearing_args_debug_redacts_the_secret() {
        use serde_json::json;
        const SECRET: &str = "S3CRET-must-not-print";
        let dumps = [
            format!(
                "{:?}",
                SteamcmSessionAcquireArgs::from_args(&[json!({
                    "refreshToken": SECRET, "reason": "login", "logonId": 1
                })])
                .unwrap()
            ),
            format!(
                "{:?}",
                SteamcmRedeemKeyArgs::from_args(&[json!({"leaseId": 1, "key": SECRET})]).unwrap()
            ),
            format!(
                "{:?}",
                SteamcmSigninCredentialsStartArgs::from_args(&[json!({
                    "accountName": SECRET, "password": SECRET
                })])
                .unwrap()
            ),
            format!(
                "{:?}",
                SteamcmSigninGuardSubmitArgs::from_args(&[json!({"flowId": "f1", "code": SECRET})])
                    .unwrap()
            ),
            format!(
                "{:?}",
                KeyringSetArgs::from_args(&[json!(SECRET), json!("slot-a")]).unwrap()
            ),
        ];
        for d in &dumps {
            assert!(!d.contains(SECRET), "secret printed: {d}");
            assert!(d.contains("<redacted>"), "{d}");
        }
        // Non-secret fields still print, so the Debug stays useful.
        assert!(dumps[0].contains("login"), "{}", dumps[0]);
        assert!(dumps[3].contains("f1"), "{}", dumps[3]);
        assert!(dumps[4].contains("slot-a"), "{}", dumps[4]);
    }

    #[test]
    fn mac_owned_apps_refuses_anything_but_the_bundled_helper_path() {
        for path in [
            "steam-bridge-helper",
            "/bin/sh",
            "/tmp/steam-bridge-helper/../sh",
            "/tmp/../steam-bridge-helper",
            "/tmp/not-steam-bridge-helper",
            "/tmp/x/steam-bridge-helper",
            "",
        ] {
            let r = rpc_steamcm_mac_owned_apps(&[
                serde_json::json!({"helperPath": path, "steamId": "76561198000000001"}),
            ]);
            assert_eq!(
                r,
                Err("steamcm_mac_owned_apps:bad-args".to_string()),
                "{path}"
            );
        }
    }

    /// B/WR-01: the macSteam refresh source spawns `helperPath` too, so it must hit the same guard.
    #[test]
    fn refresh_refuses_a_mac_steam_source_naming_anything_but_the_bundled_helper() {
        for helper in [
            Some("/bin/sh"),
            Some("/tmp/x/steam-bridge-helper"),
            Some(""),
            None,
        ] {
            let mut source = serde_json::json!({"kind": "macSteam", "steamId": "1"});
            if let Some(h) = helper {
                source["helperPath"] = serde_json::json!(h);
            }
            let r = rpc_steamcm_refresh(&[serde_json::json!({
                "source": source,
                "metadata": {},
                "previousGames": [],
                "installState": {},
                "bridgeAllowlist": [],
                "knownFixMac32": [],
                "isMac": true,
            })]);
            assert_eq!(r, Err("steamcm_refresh:bad-args".to_string()), "{helper:?}");
        }
    }

    /// B/WR-01: a file planted elsewhere under the helper's name is not the bundled helper.
    #[test]
    fn helper_path_must_resolve_to_the_bundled_helper_not_just_share_its_name() {
        let root = std::env::temp_dir().join(format!("gamelib-wr01-{}", std::process::id()));
        let bundled_dir = root.join("app/public/bin/arm64/darwin");
        let planted_dir = root.join("planted");
        std::fs::create_dir_all(&bundled_dir).unwrap();
        std::fs::create_dir_all(&planted_dir).unwrap();
        let bundled = bundled_dir.join("steam-bridge-helper");
        let planted = planted_dir.join("steam-bridge-helper");
        std::fs::write(&bundled, b"").unwrap();
        std::fs::write(&planted, b"").unwrap();

        let ok = |p: &std::path::Path, b: Option<&std::path::Path>| {
            helper_path_ok(p.to_str().unwrap(), b)
        };
        assert!(ok(&bundled, Some(&bundled)));
        assert!(!ok(&planted, Some(&bundled)), "planted copy passed");
        assert!(
            !ok(&bundled, None),
            "no bundled helper known, yet a path passed"
        );
        assert!(
            !ok(
                &bundled_dir.join("steam-bridge-helper-missing"),
                Some(&bundled)
            ),
            "wrong name passed"
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    fn host_with(
        open_bound: Duration,
        opener: impl Fn(&'static str) -> Result<(), String> + Send + Sync + 'static,
    ) -> ShellWrapHost {
        ShellWrapHost {
            opener: Arc::new(opener),
            open_bound,
        }
    }

    /// B/WR-02: true must mean the open was issued; the Shutdown restore clears `owed` on it.
    #[test]
    fn open_steam_url_reports_true_only_after_the_open_was_issued() {
        use gamelib_steamcm::wrap::STEAM_GO_ONLINE_URL;
        use std::sync::atomic::{AtomicBool, Ordering};
        let issued = Arc::new(AtomicBool::new(false));
        let flag = issued.clone();
        let host = host_with(Duration::from_secs(2), move |_| {
            std::thread::sleep(Duration::from_millis(100));
            flag.store(true, Ordering::SeqCst);
            Ok(())
        });
        assert!(host.open_steam_url(STEAM_GO_ONLINE_URL));
        assert!(
            issued.load(Ordering::SeqCst),
            "reported true before the opener ran"
        );
    }

    #[test]
    fn open_steam_url_reports_false_when_the_open_fails() {
        use gamelib_steamcm::wrap::STEAM_GO_ONLINE_URL;
        let host = host_with(Duration::from_secs(2), |_| Err("no handler".into()));
        assert!(!host.open_steam_url(STEAM_GO_ONLINE_URL));
    }

    #[test]
    fn open_steam_url_reports_false_when_the_open_outlasts_the_bound() {
        use gamelib_steamcm::wrap::STEAM_GO_ONLINE_URL;
        let host = host_with(Duration::from_millis(100), |_| {
            std::thread::sleep(Duration::from_secs(1));
            Ok(())
        });
        let start = Instant::now();
        assert!(!host.open_steam_url(STEAM_GO_ONLINE_URL));
        assert!(start.elapsed() < Duration::from_millis(900));
    }

    #[test]
    fn open_steam_url_refuses_any_other_url_without_calling_the_opener() {
        let host = host_with(Duration::from_secs(2), |_| panic!("opener called"));
        assert!(!host.open_steam_url("steam://rungameid/440"));
    }
}
