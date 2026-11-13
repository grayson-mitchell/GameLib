//! Handlers for the ten `steamfiles_*` rustInvoke channels (Phase 75 plan 12). Each validates
//! through its generated Args struct then passes straight to the Tauri-free `gamelib-steamfiles` crate.

use super::*;

pub(crate) fn rpc_steamfiles_find_acf(args: &[Value]) -> Result<Value, String> {
    SteamfilesFindAcfArgs::from_args(args)?;
    gamelib_steamfiles::dispatch("steamfiles_find_acf", args)
}

pub(crate) fn rpc_steamfiles_parse_valve_manifest(args: &[Value]) -> Result<Value, String> {
    SteamfilesParseValveManifestArgs::from_args(args)?;
    gamelib_steamfiles::dispatch("steamfiles_parse_valve_manifest", args)
}

pub(crate) fn rpc_steamfiles_read_acf(args: &[Value]) -> Result<Value, String> {
    SteamfilesReadAcfArgs::from_args(args)?;
    gamelib_steamfiles::dispatch("steamfiles_read_acf", args)
}

pub(crate) fn rpc_steamfiles_read_installscript(args: &[Value]) -> Result<Value, String> {
    SteamfilesReadInstallscriptArgs::from_args(args)?;
    gamelib_steamfiles::dispatch("steamfiles_read_installscript", args)
}

pub(crate) fn rpc_steamfiles_read_library_folders(args: &[Value]) -> Result<Value, String> {
    SteamfilesReadLibraryFoldersArgs::from_args(args)?;
    gamelib_steamfiles::dispatch("steamfiles_read_library_folders", args)
}

pub(crate) fn rpc_steamfiles_read_localconfig_beta_key(args: &[Value]) -> Result<Value, String> {
    SteamfilesReadLocalconfigBetaKeyArgs::from_args(args)?;
    gamelib_steamfiles::dispatch("steamfiles_read_localconfig_beta_key", args)
}

pub(crate) fn rpc_steamfiles_read_running_app_id(args: &[Value]) -> Result<Value, String> {
    SteamfilesReadRunningAppIdArgs::from_args(args)?;
    gamelib_steamfiles::dispatch("steamfiles_read_running_app_id", args)
}

pub(crate) fn rpc_steamfiles_scan_acfs(args: &[Value]) -> Result<Value, String> {
    SteamfilesScanAcfsArgs::from_args(args)?;
    gamelib_steamfiles::dispatch("steamfiles_scan_acfs", args)
}

pub(crate) fn rpc_steamfiles_shortcuts_apply(args: &[Value]) -> Result<Value, String> {
    SteamfilesShortcutsApplyArgs::from_args(args)?;
    gamelib_steamfiles::dispatch("steamfiles_shortcuts_apply", args)
}

pub(crate) fn rpc_steamfiles_shortcuts_read(args: &[Value]) -> Result<Value, String> {
    SteamfilesShortcutsReadArgs::from_args(args)?;
    gamelib_steamfiles::dispatch("steamfiles_shortcuts_read", args)
}
