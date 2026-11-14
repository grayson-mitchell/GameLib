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

pub(crate) fn rpc_steamcm_mac_owned_apps(args: &[Value]) -> Result<Value, String> {
    let a = SteamcmMacOwnedAppsArgs::from_args(args)?;
    // T-79-104: the sidecar names an executable; only the bundled helper's name may be spawned.
    let p = std::path::Path::new(&a.helper_path);
    let climbs = p
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir));
    if !p.is_absolute()
        || climbs
        || p.file_name().and_then(|n| n.to_str()) != Some("steam-bridge-helper")
    {
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
    SteamcmRefreshArgs::from_args(args)?;
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
    app: AppHandle,
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
        let app = self.app.clone();
        // Worker thread: `open_url` can block behind an OS dialog (see sidecar.rs, D-UAT-19).
        std::thread::spawn(move || {
            if let Err(e) = app.opener().open_url(url, None::<&str>) {
                shell_eprintln!("[shell] steamcm wrap open failed: {e}");
            }
        });
        true
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
    gamelib_steamcm::error::set_diag_sink(shell_diag);
    gamelib_steamcm::facade::set_wrap_host(std::sync::Arc::new(ShellWrapHost { app: app.clone() }));
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

    #[test]
    fn mac_owned_apps_refuses_anything_but_the_bundled_helper_path() {
        for path in [
            "steam-bridge-helper",
            "/bin/sh",
            "/tmp/steam-bridge-helper/../sh",
            "/tmp/../steam-bridge-helper",
            "/tmp/not-steam-bridge-helper",
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
}
