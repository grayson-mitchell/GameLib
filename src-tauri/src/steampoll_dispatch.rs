//! Handlers for the 24 `steampoll_*` rustInvoke channels (Phase 80 plan 18). Each validates through
//! its generated Args struct then calls the Tauri-free `gamelib-steampoll` dispatch on the calling
//! worker thread (the two async ops block on the crate's own runtime and answer `wrong-thread` if
//! called from inside one). Nothing here formats an argument, path or title into a log line (T-28-04).

use super::*;

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
