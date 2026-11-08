//! Handlers for the six `scan_*` rustInvoke channels (Phase 71 D-04/D-07). Each validates through
//! its generated Args struct then passes straight to the Tauri-free `gamelib-scan` crate.

use super::*;

// Phase 63 (D-03): executable scanners. Each arm is a one-line pass-through to the
// Tauri-free gamelib-scan crate, the same dispatch the headless gamelib-scan-cli uses.
// dispatch_rust_channel arms, not generate_handler! commands: the caller is the sidecar
// over `requestRustInvoke`, and the renderer gets no scanner capability.
pub(crate) fn rpc_scan_steam_api_imports(args: &[Value]) -> Result<Value, String> {
    ScanSteamApiImportsArgs::from_args(args)?;
    gamelib_scan::dispatch("scan_steam_api_imports", args)
}

pub(crate) fn rpc_scan_steam_drm(args: &[Value]) -> Result<Value, String> {
    ScanSteamDrmArgs::from_args(args)?;
    gamelib_scan::dispatch("scan_steam_drm", args)
}

pub(crate) fn rpc_scan_steamstub_section(args: &[Value]) -> Result<Value, String> {
    ScanSteamstubSectionArgs::from_args(args)?;
    gamelib_scan::dispatch("scan_steamstub_section", args)
}

pub(crate) fn rpc_scan_pe_imported_dlls(args: &[Value]) -> Result<Value, String> {
    ScanPeImportedDllsArgs::from_args(args)?;
    gamelib_scan::dispatch("scan_pe_imported_dlls", args)
}

pub(crate) fn rpc_scan_contained_real(args: &[Value]) -> Result<Value, String> {
    ScanContainedRealArgs::from_args(args)?;
    gamelib_scan::dispatch("scan_contained_real", args)
}

pub(crate) fn rpc_scan_winemac_metal_exports(args: &[Value]) -> Result<Value, String> {
    ScanWinemacMetalExportsArgs::from_args(args)?;
    gamelib_scan::dispatch("scan_winemac_metal_exports", args)
}
