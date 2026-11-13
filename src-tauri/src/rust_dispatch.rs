//! The `rustInvoke` router (Phase 71, D-04): a flat table of contents, one exhaustive `match` over
//! the generated `RustInvokeChannel` (67-11, D-13) with each arm a one-line call into the domain
//! module that owns the handler. No catch-all arm, so a new channel is a compile error here.

use super::*;

/// Also dispatches `dialog_open` (Phase 30 Plan 03). `app` is threaded through for that arm:
/// the folder picker is reached via the AppHandle, not via `args` — the picked path comes
/// FROM the OS dialog, never INTO it from the renderer/sidecar (T-30-11/T-30-12).
pub(crate) fn dispatch_rust_channel(
    channel: &str,
    args: &[Value],
    app: &AppHandle,
) -> Result<Value, String> {
    // Exhaustive over the generated enum (67-11, D-13): a channel in `RUST_INVOKE_CHANNELS` with no
    // arm below is a compile error, and an unknown wire name never reaches the match.
    let Some(ch) = RustInvokeChannel::from_name(channel) else {
        return Err(format!("rustInvoke:unknown-channel:{channel}"));
    };
    match ch {
        RustInvokeChannel::KeyringGet => rpc_keyring_get(channel, args),
        RustInvokeChannel::KeyringSet => rpc_keyring_set(channel, args),
        RustInvokeChannel::KeyringDelete => rpc_keyring_delete(channel, args),
        RustInvokeChannel::KeyringAvailable => rpc_keyring_available(channel, args),
        RustInvokeChannel::DialogOpen => rpc_dialog_open(args, app),
        RustInvokeChannel::DialogMessage => rpc_dialog_message(args, app),
        RustInvokeChannel::NotificationShow => rpc_notification_show(args, app),
        // Reveal a path in the OS file manager (Phase 33 Plan 04, D-05) via
        // `tauri-plugin-opener`'s `reveal_item_in_dir` (already installed for `open_external`).
        // Backs `platform/index.ts`'s `shell.showItemInFolder()`. The path originates from
        // in-app backend callers, not renderer free-text (T-33-11) -- forwarded to the vetted
        // opener plugin's own scoping, not a raw shell-out.
        //
        // macOS SELECTION FIX (debug session `finder-reveal-no-selection`, 2026-08-23,
        // REQ-34.3-11 item 2 / G1): `reveal_item_in_dir` opens the correct folder 100% of the
        // time, but its selection step is a SEPARATE, systemic macOS/AppKit defect -- see
        // `macos_finder_reselect_workaround` below for the mechanism and evidence. The
        // follow-up call is a no-op on other platforms.
        RustInvokeChannel::ShellShowItemInFolder => {
            shell_open::shell_show_item_in_folder(app, args)
        }
        // Open a path with the default program (Phase 33 Plan 04, D-05) via
        // `tauri-plugin-opener`'s `open_path`. Backs `platform/index.ts`'s `shell.openPath()`.
        // Same path-provenance note as `shell_show_item_in_folder` above (T-33-11).
        RustInvokeChannel::ShellOpenPath => shell_open::shell_open_path(app, args),
        RustInvokeChannel::ClipboardWriteText => rpc_clipboard_write_text(args, app),
        RustInvokeChannel::ClipboardReadText => rpc_clipboard_read_text(app),
        RustInvokeChannel::AppExit => rpc_app_exit(app),
        RustInvokeChannel::AppRelaunch => rpc_app_relaunch(app),
        RustInvokeChannel::AppHide => rpc_app_hide(app),
        RustInvokeChannel::MainWindowRaise => rpc_main_window_raise(app),
        RustInvokeChannel::MainWindowHide => rpc_main_window_hide(app),
        RustInvokeChannel::BridgeInvitePickerOpen => rpc_bridge_invite_picker_open(args, app),
        RustInvokeChannel::TraySetIcon => rpc_tray_set_icon(args, app),
        RustInvokeChannel::DialogSave => rpc_dialog_save(args, app),
        RustInvokeChannel::HumbleLoginOpen => rpc_humble_login_open(args, app),
        RustInvokeChannel::HumbleLoginCookies => rpc_humble_login_cookies(args, app),
        RustInvokeChannel::HumbleLoginTakeEvents => rpc_humble_login_take_events(args),
        RustInvokeChannel::HumbleLoginClose => rpc_humble_login_close(args, app),
        RustInvokeChannel::HumbleLoginClearCookies => rpc_humble_login_clear_cookies(args, app),
        RustInvokeChannel::HumbleRevealPost => rpc_humble_reveal_post(args, app),
        RustInvokeChannel::HumbleLoginClearStorage => rpc_humble_login_clear_storage(args, app),
        RustInvokeChannel::HumbleLoginCookiesForDomain => {
            rpc_humble_login_cookies_for_domain(args, app)
        }
        RustInvokeChannel::WakeLockStart => rpc_wake_lock_start(args),
        RustInvokeChannel::WakeLockStop => rpc_wake_lock_stop(args),
        RustInvokeChannel::ScanSteamApiImports => rpc_scan_steam_api_imports(args),
        RustInvokeChannel::ScanSteamDrm => rpc_scan_steam_drm(args),
        RustInvokeChannel::ScanSteamstubSection => rpc_scan_steamstub_section(args),
        RustInvokeChannel::ScanPeImportedDlls => rpc_scan_pe_imported_dlls(args),
        RustInvokeChannel::ScanContainedReal => rpc_scan_contained_real(args),
        RustInvokeChannel::ScanWinemacMetalExports => rpc_scan_winemac_metal_exports(args),
        RustInvokeChannel::SteamfilesFindAcf => rpc_steamfiles_find_acf(args),
        RustInvokeChannel::SteamfilesParseValveManifest => {
            rpc_steamfiles_parse_valve_manifest(args)
        }
        RustInvokeChannel::SteamfilesReadAcf => rpc_steamfiles_read_acf(args),
        RustInvokeChannel::SteamfilesReadInstallscript => rpc_steamfiles_read_installscript(args),
        RustInvokeChannel::SteamfilesReadLibraryFolders => {
            rpc_steamfiles_read_library_folders(args)
        }
        RustInvokeChannel::SteamfilesReadLocalconfigBetaKey => {
            rpc_steamfiles_read_localconfig_beta_key(args)
        }
        RustInvokeChannel::SteamfilesReadRunningAppId => rpc_steamfiles_read_running_app_id(args),
        RustInvokeChannel::SteamfilesScanAcfs => rpc_steamfiles_scan_acfs(args),
        RustInvokeChannel::SteamfilesShortcutsApply => rpc_steamfiles_shortcuts_apply(args),
        RustInvokeChannel::SteamfilesShortcutsRead => rpc_steamfiles_shortcuts_read(args),
        RustInvokeChannel::DepotFinalize => rpc_depot_finalize(args, app),
        RustInvokeChannel::DepotJobCancel => rpc_depot_job_cancel(args),
        RustInvokeChannel::DepotJobRun => rpc_depot_job_run(args, app),
        RustInvokeChannel::DepotManifestSummary => rpc_depot_manifest_summary(args, app),
        RustInvokeChannel::StoreEmbedOpen => rpc_store_embed_open(args, app),
        RustInvokeChannel::StoreEmbedSetBounds => rpc_store_embed_set_bounds(args, app),
        RustInvokeChannel::StoreEmbedHide => rpc_store_embed_hide(args, app),
        RustInvokeChannel::StoreEmbedShow => rpc_store_embed_show(args, app),
        RustInvokeChannel::StoreEmbedClose => rpc_store_embed_close(args, app),
        RustInvokeChannel::StoreEmbedTakeNavEvents => rpc_store_embed_take_nav_events(args, app),
        RustInvokeChannel::StoreEmbedBack => rpc_store_embed_back(args, app),
        RustInvokeChannel::StoreEmbedForward => rpc_store_embed_forward(args, app),
        RustInvokeChannel::StoreEmbedReload => rpc_store_embed_reload(args, app),
        RustInvokeChannel::StoreEmbedNavigate => rpc_store_embed_navigate(args, app),
    }
}
