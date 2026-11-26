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
        // Windows-only raise of Steam's own window for the adoption note's "Open Steam": a
        // signed-out Steam holds `steam://open/main` until login, so the shell raises the sign-in
        // window itself. A `false` no-op on other platforms.
        RustInvokeChannel::SteamWindowRaise => rpc_steam_window_raise(args),
        RustInvokeChannel::TraySetIcon => rpc_tray_set_icon(args, app),
        RustInvokeChannel::DialogSave => rpc_dialog_save(args, app),
        RustInvokeChannel::HumbleLoginOpen => rpc_humble_login_open(args, app),
        RustInvokeChannel::HumbleLoginCookies => rpc_humble_login_cookies(args, app),
        RustInvokeChannel::HumbleLoginTakeEvents => rpc_humble_login_take_events(args),
        RustInvokeChannel::HumbleLoginClose => rpc_humble_login_close(args, app),
        RustInvokeChannel::HumbleLoginClearCookies => rpc_humble_login_clear_cookies(args, app),
        RustInvokeChannel::HumbleRevealPost => rpc_humble_reveal_post(args, app),
        RustInvokeChannel::HumbleLoginClearStorage => rpc_humble_login_clear_storage(args, app),
        // Humble server-action session (debug humble-library-cloudflare-403): one hidden window,
        // in-page fetch() POSTs, because Cloudflare blocks Next-Action POSTs from non-browser clients.
        RustInvokeChannel::HumbleActionOpen => rpc_humble_action_open(args, app),
        RustInvokeChannel::HumbleActionPost => rpc_humble_action_post(args),
        RustInvokeChannel::HumbleActionClose => rpc_humble_action_close(args),
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
        RustInvokeChannel::SafetyCheckRemoval => rpc_safety_check_removal(args),
        RustInvokeChannel::SafetyRemoveTree => rpc_safety_remove_tree(args),
        RustInvokeChannel::StoreVersionGate => rpc_store_version_gate(args),
        RustInvokeChannel::StoreBackupFile => rpc_store_backup_file(args),
        RustInvokeChannel::StoreReadOnlyNotice => store_native::rpc_read_only_notice(args, app),
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
        RustInvokeChannel::SteamfilesReadLoginusersOfflineMode => {
            rpc_steamfiles_read_loginusers_offline_mode(args)
        }
        RustInvokeChannel::SteamfilesReadRunningAppId => rpc_steamfiles_read_running_app_id(args),
        RustInvokeChannel::SteamfilesScanAcfs => rpc_steamfiles_scan_acfs(args),
        RustInvokeChannel::SteamfilesShortcutsApply => rpc_steamfiles_shortcuts_apply(args),
        RustInvokeChannel::SteamfilesShortcutsRead => rpc_steamfiles_shortcuts_read(args),
        RustInvokeChannel::SteampollAcfEnumerateCopies => rpc_steampoll_acf_enumerate_copies(args),
        RustInvokeChannel::SteampollAcfFindOtherManifests => {
            rpc_steampoll_acf_find_other_manifests(args)
        }
        RustInvokeChannel::SteampollAcfReadState => rpc_steampoll_acf_read_state(args),
        RustInvokeChannel::SteampollAcfReadUpdate => rpc_steampoll_acf_read_update(args),
        RustInvokeChannel::SteampollAcfReadUpdateFromDir => {
            rpc_steampoll_acf_read_update_from_dir(args)
        }
        RustInvokeChannel::SteampollAcfRemoveCopy => rpc_steampoll_acf_remove_copy(args),
        RustInvokeChannel::SteampollAcfScanDownloading => rpc_steampoll_acf_scan_downloading(args),
        RustInvokeChannel::SteampollAdoptionRead => rpc_steampoll_adoption_read(args),
        RustInvokeChannel::SteampollAdoptionUnwatch => rpc_steampoll_adoption_unwatch(args),
        RustInvokeChannel::SteampollAdoptionWatch => rpc_steampoll_adoption_watch(args),
        RustInvokeChannel::SteampollBreadcrumbInstalledOnDisk => {
            rpc_steampoll_breadcrumb_installed_on_disk(args)
        }
        RustInvokeChannel::SteampollBridgeFinalized => rpc_steampoll_bridge_finalized(args),
        RustInvokeChannel::SteampollHoldDiscard => rpc_steampoll_hold_discard(args),
        RustInvokeChannel::SteampollHoldDrain => rpc_steampoll_hold_drain(args),
        RustInvokeChannel::SteampollInstallCancelDelegated => {
            rpc_steampoll_install_cancel_delegated(args)
        }
        RustInvokeChannel::SteampollInstallStart => rpc_steampoll_install_start(args),
        RustInvokeChannel::SteampollInstallStop => rpc_steampoll_install_stop(args),
        RustInvokeChannel::SteampollMacArchVerdict => rpc_steampoll_mac_arch_verdict(args),
        RustInvokeChannel::SteampollNativeInFlight => rpc_steampoll_native_in_flight(args),
        RustInvokeChannel::SteampollNextNoticeSeq => rpc_steampoll_next_notice_seq(args),
        RustInvokeChannel::SteampollReadRunningAppId => rpc_steampoll_read_running_app_id(args),
        RustInvokeChannel::SteampollRunningHold => rpc_steampoll_running_hold(args),
        RustInvokeChannel::SteampollRunningLastAppId => rpc_steampoll_running_last_app_id(args),
        RustInvokeChannel::SteampollRunningRelease => rpc_steampoll_running_release(args),
        RustInvokeChannel::SteampollRunningStart => rpc_steampoll_running_start(args),
        RustInvokeChannel::SteampollRunningStop => rpc_steampoll_running_stop(args),
        RustInvokeChannel::SteampollStatus => rpc_steampoll_status(args),
        RustInvokeChannel::SteampollUninstallStart => rpc_steampoll_uninstall_start(args),
        RustInvokeChannel::SteampollUninstallStop => rpc_steampoll_uninstall_stop(args),
        RustInvokeChannel::SteamcmAnonClose => rpc_steamcm_anon_close(args),
        RustInvokeChannel::SteamcmAnonProductInfo => rpc_steamcm_anon_product_info(args),
        RustInvokeChannel::SteamcmConfigure => rpc_steamcm_configure(args),
        RustInvokeChannel::SteamcmContentServers => rpc_steamcm_content_servers(args),
        RustInvokeChannel::SteamcmDepotKey => rpc_steamcm_depot_key(args),
        RustInvokeChannel::SteamcmLicenses => rpc_steamcm_licenses(args),
        RustInvokeChannel::SteamcmMacOwnedApps => rpc_steamcm_mac_owned_apps(args),
        RustInvokeChannel::SteamcmManifestRequestCode => rpc_steamcm_manifest_request_code(args),
        RustInvokeChannel::SteamcmOwnedApps => rpc_steamcm_owned_apps(args),
        RustInvokeChannel::SteamcmPersonas => rpc_steamcm_personas(args),
        RustInvokeChannel::SteamcmProductInfo => rpc_steamcm_product_info(args),
        RustInvokeChannel::SteamcmRedeemKey => rpc_steamcm_redeem_key(args),
        RustInvokeChannel::SteamcmRefresh => rpc_steamcm_refresh(args),
        RustInvokeChannel::SteamcmSessionAcquire => rpc_steamcm_session_acquire(args),
        RustInvokeChannel::SteamcmSessionAcquireOpen => rpc_steamcm_session_acquire_open(args),
        RustInvokeChannel::SteamcmSessionEnsureConnected => {
            rpc_steamcm_session_ensure_connected(args)
        }
        RustInvokeChannel::SteamcmSessionLogout => rpc_steamcm_session_logout(args),
        RustInvokeChannel::SteamcmSessionRelease => rpc_steamcm_session_release(args),
        RustInvokeChannel::SteamcmSessionShutdown => rpc_steamcm_session_shutdown(args),
        RustInvokeChannel::SteamcmSessionStatus => rpc_steamcm_session_status(args),
        RustInvokeChannel::SteamcmSigninCancel => rpc_steamcm_signin_cancel(args),
        RustInvokeChannel::SteamcmSigninCredentialsStart => {
            rpc_steamcm_signin_credentials_start(args)
        }
        RustInvokeChannel::SteamcmSigninGuardSubmit => rpc_steamcm_signin_guard_submit(args),
        RustInvokeChannel::SteamcmSigninQrStart => rpc_steamcm_signin_qr_start(args),
        RustInvokeChannel::SteamcmSigninStatus => rpc_steamcm_signin_status(args),
        RustInvokeChannel::SteamcmStoreAppdetails => rpc_steamcm_store_appdetails(args),
        RustInvokeChannel::SteamcmStoreEnrich => rpc_steamcm_store_enrich(args),
        RustInvokeChannel::SteamcmWrapRestoreIfOwed => rpc_steamcm_wrap_restore_if_owed(args),
        RustInvokeChannel::InfoRecentAdd => rpc_info_recent_add(args),
        RustInvokeChannel::InfoRecentRemove => rpc_info_recent_remove(args),
        RustInvokeChannel::InfoOverridesGet => rpc_info_overrides_get(args),
        RustInvokeChannel::InfoOverridesGetAll => rpc_info_overrides_get_all(args),
        RustInvokeChannel::InfoOverridesSet => rpc_info_overrides_set(args),
        RustInvokeChannel::InfoOverridesAttach => rpc_info_overrides_attach(args),
        RustInvokeChannel::InfoAnticheatInfo => rpc_info_anticheat_info(args),
        RustInvokeChannel::InfoAnticheatStatus => rpc_info_anticheat_status(args),
        RustInvokeChannel::InfoAnticheatDownload => rpc_info_anticheat_download(args),
        RustInvokeChannel::InfoGogDiscounts => rpc_info_gog_discounts(args),
        RustInvokeChannel::InfoCrossoverRatingMap => rpc_info_crossover_rating_map(args),
        RustInvokeChannel::InfoUmuGet => rpc_info_umu_get(args),
        RustInvokeChannel::InfoWikiGet => rpc_info_wiki_get(args),
        RustInvokeChannel::InfoWikiCacheClear => rpc_info_wiki_cache_clear(args),
        RustInvokeChannel::SteamApiPinResolve => rpc_steam_api_pin_resolve(args),
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
        RustInvokeChannel::WineReleasesInfoReady => {
            wine_dispatch::rpc_wine_releases_info_ready(args)
        }
        RustInvokeChannel::WineValid => wine_dispatch::rpc_wine_valid(args),
        RustInvokeChannel::WineRunCommand => wine_dispatch::rpc_wine_run_command(args),
        RustInvokeChannel::WineDiscoverAlternatives => {
            wine_dispatch::rpc_wine_discover_alternatives(args)
        }
        RustInvokeChannel::WineDiscoverCrossover => {
            wine_dispatch::rpc_wine_discover_crossover(args)
        }
        RustInvokeChannel::WineDxvkInstallRemove => {
            wine_dispatch::rpc_wine_dxvk_install_remove(args)
        }
        RustInvokeChannel::WineWinetricksApply => wine_dispatch::rpc_wine_winetricks_apply(args),
        RustInvokeChannel::WineWinetricksAvailable => {
            wine_dispatch::rpc_wine_winetricks_available(args)
        }
        RustInvokeChannel::WineWinetricksInstalled => {
            wine_dispatch::rpc_wine_winetricks_installed(args)
        }
        RustInvokeChannel::WineWinetricksInstall => {
            wine_dispatch::rpc_wine_winetricks_install(args)
        }
        RustInvokeChannel::WineRunCommandForGame => {
            wine_dispatch::rpc_wine_run_command_for_game(args)
        }
        RustInvokeChannel::WineToolCall => wine_dispatch::rpc_wine_tool_call(args),
        RustInvokeChannel::EngineSetOnline => engine_dispatch::rpc_engine_set_online(args),
        RustInvokeChannel::EngineBottlePrepare => engine_dispatch::rpc_bottle_prepare(args),
        RustInvokeChannel::EngineBottleCreateFallback => {
            engine_dispatch::rpc_bottle_create_fallback(args)
        }
        RustInvokeChannel::EngineBottleCancelCreate => {
            engine_dispatch::rpc_bottle_cancel_create(args)
        }
        RustInvokeChannel::EngineBottleKillWineserver => {
            engine_dispatch::rpc_bottle_kill_wineserver(args)
        }
        RustInvokeChannel::EngineBottleRemoveCreated => {
            engine_dispatch::rpc_bottle_remove_created(args)
        }
        RustInvokeChannel::EngineBottleRemovePerGame => {
            engine_dispatch::rpc_bottle_remove_per_game(args)
        }
        RustInvokeChannel::EngineBottleReconcileMarker => {
            engine_dispatch::rpc_bottle_reconcile_marker(args)
        }
        RustInvokeChannel::EngineBottleRecordPinned => {
            engine_dispatch::rpc_bottle_record_pinned(args)
        }
        RustInvokeChannel::EngineBottleRecordCrossover => {
            engine_dispatch::rpc_bottle_record_crossover(args)
        }
        RustInvokeChannel::EngineLedgerMarkRunning => {
            engine_dispatch::rpc_ledger_mark_running(args)
        }
        RustInvokeChannel::EngineLedgerMarkStopped => {
            engine_dispatch::rpc_ledger_mark_stopped(args)
        }
        RustInvokeChannel::EngineSelectionClear => engine_dispatch::rpc_selection_clear(args),
        RustInvokeChannel::EngineLaunchSelect => engine_dispatch::rpc_launch_select(args),
        RustInvokeChannel::EngineLaunchEnd => engine_dispatch::rpc_launch_end(args),
        RustInvokeChannel::EngineLaunchSettingsGet => {
            engine_dispatch::rpc_launch_settings_get(args)
        }
        RustInvokeChannel::EngineStateGet => engine_dispatch::rpc_state_get(args),
        RustInvokeChannel::EngineDialogDisplayed => engine_dispatch::rpc_dialog_displayed(args),
        RustInvokeChannel::EngineDecideLaunch => engine_dispatch::rpc_decide_launch(args),
        RustInvokeChannel::EngineDecideCreation => engine_dispatch::rpc_decide_creation(args),
        RustInvokeChannel::EnginePreflightCrossover => {
            engine_dispatch::rpc_preflight_crossover(args)
        }
        RustInvokeChannel::EngineIsCrossoverMissing => {
            engine_dispatch::rpc_is_crossover_missing(args)
        }
        RustInvokeChannel::EngineCxResolveBinDir => engine_dispatch::rpc_cx_resolve_bin_dir(args),
        RustInvokeChannel::EngineStateRecordDecision => {
            engine_dispatch::rpc_state_record_decision(args)
        }
        RustInvokeChannel::EngineStatePublishOverlayNotice => {
            engine_dispatch::rpc_state_publish_overlay_notice(args)
        }
        RustInvokeChannel::EngineStatePublishOverlayExitNotice => {
            engine_dispatch::rpc_state_publish_overlay_exit_notice(args)
        }
        RustInvokeChannel::EngineDeadlineArm => engine_dispatch::rpc_deadline_arm(args),
        RustInvokeChannel::EngineDeadlineCancel => engine_dispatch::rpc_deadline_cancel(args),
        RustInvokeChannel::EngineRunTool => engine_dispatch::rpc_run_tool(args),
        RustInvokeChannel::EngineCancel => engine_dispatch::rpc_cancel(args),
        RustInvokeChannel::EngineResolveToolSettings => {
            engine_dispatch::rpc_resolve_tool_settings(args)
        }
        RustInvokeChannel::EngineNonCrossoverEngine => {
            engine_dispatch::rpc_non_crossover_engine(args)
        }
        RustInvokeChannel::EngineFallbackEnsure => engine_dispatch::rpc_fallback_ensure(args),
        RustInvokeChannel::KnownfixLaunchOverrides => {
            knownfix_dispatch::rpc_knownfix_launch_overrides(args)
        }
        RustInvokeChannel::KnownfixFetchRemote => {
            knownfix_dispatch::rpc_knownfix_fetch_remote(args)
        }
        RustInvokeChannel::KnownfixApplyRegistry => {
            knownfix_dispatch::rpc_knownfix_apply_registry(args)
        }
        RustInvokeChannel::KnownfixResolveOverlayEnv => {
            knownfix_dispatch::rpc_knownfix_resolve_overlay_env(args)
        }
        RustInvokeChannel::KnownfixReportDetected => {
            knownfix_dispatch::rpc_knownfix_report_detected(args)
        }
        RustInvokeChannel::LaunchSetupWrapperEnvVars => {
            launch_dispatch::rpc_launch_setup_wrapper_env_vars(args)
        }
        RustInvokeChannel::LaunchSetupEnvVars => launch_dispatch::rpc_launch_setup_env_vars(args),
        RustInvokeChannel::LaunchSetupWineEnvVars => {
            launch_dispatch::rpc_launch_setup_wine_env_vars(args)
        }
        RustInvokeChannel::LaunchSetupWrappers => launch_dispatch::rpc_launch_setup_wrappers(args),
        RustInvokeChannel::LaunchKnownFixEnv => launch_dispatch::rpc_launch_known_fix_env(args),
        RustInvokeChannel::LaunchVerifyWinePrefix => {
            launch_dispatch::rpc_launch_verify_wine_prefix(args)
        }
        RustInvokeChannel::LaunchEpicServiceOffline => {
            launch_dispatch::rpc_launch_epic_service_offline(args)
        }
        RustInvokeChannel::LaunchPrepare => launch_dispatch::rpc_launch_prepare(args),
        RustInvokeChannel::LaunchPrepareWineBegin => {
            launch_dispatch::rpc_launch_prepare_wine_begin(args)
        }
        RustInvokeChannel::LaunchPrepareWineFinish => {
            launch_dispatch::rpc_launch_prepare_wine_finish(args)
        }
        RustInvokeChannel::LaunchCheckWineBeforeLaunch => {
            launch_dispatch::rpc_launch_check_wine_before_launch(args)
        }
        RustInvokeChannel::LaunchRunnerCall => launch_dispatch::rpc_launch_runner_call(args),
        RustInvokeChannel::LaunchRunnerKill => launch_dispatch::rpc_launch_runner_kill(args),
        RustInvokeChannel::LaunchRunnerAbort => launch_dispatch::rpc_launch_runner_abort(args),
        RustInvokeChannel::ShortcutsExist => shortcuts_dispatch::rpc_shortcuts_exist(args),
        RustInvokeChannel::ShortcutsAdd => shortcuts_dispatch::rpc_shortcuts_add(args),
        RustInvokeChannel::ShortcutsRemove => shortcuts_dispatch::rpc_shortcuts_remove(args),
        RustInvokeChannel::ShortcutsSteamAdd => shortcuts_dispatch::rpc_shortcuts_steam_add(args),
        RustInvokeChannel::ShortcutsSteamRemove => {
            shortcuts_dispatch::rpc_shortcuts_steam_remove(args)
        }
        RustInvokeChannel::ShortcutsSteamIsAdded => {
            shortcuts_dispatch::rpc_shortcuts_steam_is_added(args)
        }
    }
}
