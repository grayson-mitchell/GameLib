//! The shell's side of the wine services (Phase 87, SVC-02): the one [`WineCtx`], and the `wine`
//! native channels, over the Tauri-free `gamelib-wine` crate.
//!
//! D-20: one `Arc<WineCtx>` is built in `run_setup` right after [`engine_dispatch::install`], from
//! the engine context and the runtimes directory `<tools>/runtimes` (`appPaths.ts` `runtimePath`).
//! Nothing here spawns a process or waits without a bound: every op runs inside the crate's `guarded`
//! wrapper (a shutdown registrant raced against the token). Until [`install`] has run, an op answers
//! `<channel>: not-ready`.
//!
//! D-06: the runtime download is Rust's alone (87-18): the renderer's `downloadRuntime` channel is
//! native here and the launcher reaches `wine_runtime_download` through the `rustInvoke` arms, so a runtime
//! download never has a TS and a Rust writer at once.
//!
//! T-87-17, T-87-65: the runtime name is the renderer's (or the sidecar's). It is decoded against the
//! three names and a rejection is a fixed literal that never echoes the input.

use super::*;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use gamelib_wine::ctx::WineCtx;
use gamelib_wine::manager::install::InstallSettings;
use gamelib_wine::runtimes::RuntimeName;
use gamelib_wine::tools::dxmt::{spawn_dxmt_boot_update, DxmtReleasesInfo, DXMT_BOOT_BOUND};
use gamelib_wine::tools::macho::{MachoScan, WinemacMetalCheck};
use gamelib_wine::tools::ToolsHost;
use gamelib_wine::CancellationToken;
use serde_json::Map;

/// The one context, set once by [`install`].
static WINE_CTX: OnceLock<Arc<WineCtx>> = OnceLock::new();

/// The app's bundled `public` directory, where `bin/<arch>/<platform>/vulkan-helper` lives (set once by
/// [`install`]; `None` when the app root could not be resolved, which the crate reads as "no helper").
static PUBLIC_DIR: OnceLock<Option<std::path::PathBuf>> = OnceLock::new();

/// The installed context, or `None` before [`install`] (and in a unit test that built its own).
pub(crate) fn wine_ctx() -> Option<&'static Arc<WineCtx>> {
    WINE_CTX.get()
}

/// Builds the wine context from the engine context and stores it, with the bundled `public` directory
/// the tools' Vulkan helper is read from. A no-op for the context when the engine context was not
/// installed (no home directory), so every wine op answers not-ready. A second call is ignored (the
/// first context stays).
pub(crate) fn install(public_dir: Option<std::path::PathBuf>) {
    let _ = PUBLIC_DIR.set(public_dir);
    let Some(engine) = engine_dispatch::engine_ctx() else {
        return;
    };
    let runtime_path = engine.paths.tools_path.join("runtimes");
    let _ = WINE_CTX.set(Arc::new(
        WineCtx::new(Arc::clone(engine), runtime_path).with_macho_scan(Arc::new(ShellMachoScan)),
    ));
}

/// The DXMT export gate's scan (87-30, `gamelib_wine::tools::macho::MachoScan`): the same
/// `scan_winemac_metal_exports` of `gamelib-scan` that [`scan_dispatch`] answers for the sidecar, called
/// directly, so `gamelib-wine` takes no domain-crate dependency. An answer that is not a check is an
/// error, which the gate reads as a failed check (never a pass).
pub(crate) struct ShellMachoScan;

impl MachoScan for ShellMachoScan {
    fn winemac_metal_exports(
        &self,
        wine_bundle: &std::path::Path,
    ) -> Result<WinemacMetalCheck, String> {
        let bundle = wine_bundle
            .to_str()
            .ok_or_else(|| "bundle path is not text".to_string())?;
        let answer = gamelib_scan::dispatch(
            "scan_winemac_metal_exports",
            &[serde_json::json!({ "wineBundlePath": bundle })],
        )?;
        WinemacMetalCheck::from_value(&answer).ok_or_else(|| "unreadable scan answer".to_string())
    }
}

/// What a rejected argument looks like: the JSON path and the zod-vocabulary code. Fixed literals
/// only, never the renderer's value (T-87-17).
type Rejection = (&'static str, &'static str);

/// Decodes the one `name` argument of `isRuntimeInstalled` and `downloadRuntime`: exactly one string, one of
/// `eac_runtime`, `battleye_runtime`, `umu`.
fn parse_runtime_name(args: &[Value]) -> Result<RuntimeName, Rejection> {
    let [arg] = args else {
        return Err(("(args)", "invalid_type"));
    };
    let Value::String(name) = arg else {
        return Err(("0", "invalid_type"));
    };
    RuntimeName::parse(name).ok_or(("0", "invalid_value"))
}

/// Runs `op` over `args` on the blocking pool. The crate's own async `dispatch` is driven with
/// `block_on` there (never `dispatch_sync`, which refuses a thread inside a runtime), so a file read
/// stays off the async workers and the op still holds its shutdown registrant.
async fn run_wine_op(
    wine: Arc<WineCtx>,
    op: &'static str,
    args: Vec<Value>,
    failed: &'static str,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        tauri::async_runtime::block_on(gamelib_wine::dispatch(op, &args, &wine))
    })
    .await
    .map_err(|_| failed.to_string())?
}

/// The shared body of the two runtime channels: validates `args` before the context is looked at (a
/// bad call is rejected the same way before and after the install), then runs `op` over the one decoded
/// name. An error is a fixed literal (the crate's `<op>:<category>` or the invalid-args marker),
/// never the renderer's string.
fn runtime_channel(
    channel: &'static str,
    op: &'static str,
    failed: &'static str,
    args: Vec<Value>,
) -> NativeFuture {
    Box::pin(async move {
        let name = parse_runtime_name(&args)
            .map_err(|(path, code)| invalid_args(channel, &[path], &[code]))?;
        let wine = wine_ctx().ok_or_else(|| format!("{channel}: not ready"))?;
        run_wine_op(
            Arc::clone(wine),
            op,
            vec![Value::String(name.as_str().to_string())],
            failed,
        )
        .await
    })
}

/// The native `isRuntimeInstalled` handler (slice `wine`, D-14): whether the EAC, BattlEye or umu
/// runtime is installed and current, answered by `wine_runtime_is_installed`.
pub(crate) fn is_runtime_installed(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    runtime_channel(
        "isRuntimeInstalled",
        "wine_runtime_is_installed",
        "isRuntimeInstalled: the check did not finish",
        args,
    )
}

/// The native `downloadRuntime` handler (slice `wine`, D-14): downloads and extracts the EAC, BattlEye
/// or umu runtime, answered by `wine_runtime_download` (`true` when the runtime is installed after it).
/// It has no deadline of its own: the crate op holds a shutdown registrant and is cancelled by the
/// token, so a download outlasting the sidecar's 60 s invoke bound is not cut short.
pub(crate) fn download_runtime(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    runtime_channel(
        "downloadRuntime",
        "wine_runtime_download",
        "downloadRuntime: the download did not finish",
        args,
    )
}

/// Decodes the one optional `fetch` argument of `refreshWineVersionInfo`: nothing, `null` (what an
/// `undefined` becomes over JSON) or one boolean. Anything else is a fixed-literal rejection, never
/// the renderer's value (T-87-67).
fn parse_refresh_fetch(args: &[Value]) -> Result<bool, Rejection> {
    match args {
        [] | [Value::Null] => Ok(false),
        [Value::Bool(fetch)] => Ok(*fetch),
        [_] => Err(("0", "invalid_type")),
        _ => Err(("(args)", "too_big")),
    }
}

/// The native `refreshWineVersionInfo` handler (slice `wine`, D-14): refreshes the wine-downloader
/// info store from the seven release feeds, answered by `wine_manager_refresh` on the blocking pool.
/// It answers `undefined` on success and on every failure, as the TS handler did (a failed refresh is
/// logged and the renderer keeps the list it had), so only a rejected argument ever rejects.
pub(crate) fn refresh_wine_version_info(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(async move {
        let fetch = parse_refresh_fetch(&args)
            .map_err(|(path, code)| invalid_args("refreshWineVersionInfo", &[path], &[code]))?;
        let wine = wine_ctx().ok_or_else(|| "refreshWineVersionInfo: not ready".to_string())?;
        let answer = run_wine_op(
            Arc::clone(wine),
            "wine_manager_refresh",
            vec![Value::Bool(fetch)],
            "refreshWineVersionInfo: the refresh did not finish",
        )
        .await;
        // The TS handler swallowed an error and returned undefined on both paths. The log line is a
        // fixed literal (the crate has logged the cause itself).
        if answer.is_err() {
            shell_log("refreshWineVersionInfo: the refresh did not finish");
        }
        Ok(Value::Null)
    })
}

/// What a `WineVersionInfo` field must be.
enum Field {
    /// A string of one to `max` UTF-16 units (the TS `nonEmptyString(max)`).
    NonEmpty(usize),
    /// A string of at most `max` UTF-16 units.
    Text(usize),
    Number,
    Bool,
    /// One of the nine release types.
    Type,
}

/// The release types a feed produces (`VersionInfo.type`).
const RELEASE_TYPES: &[&str] = &[
    "Wine-GE",
    "GE-Proton",
    "Proton",
    "Wine-Lutris",
    "Wine-Kron4ek",
    "Wine-Crossover",
    "Wine-Staging-macOS",
    "Game-Porting-Toolkit",
    "Proton-CachyOS",
];

/// The eleven keys of a `WineVersionInfo`, each with its shape and whether it may be left out. A feed
/// may leave out `download`, `downsize` and `checksum` (a Wine-Staging-macOS release has no checksum
/// and a release with no matching asset has no download or downsize; JSON drops an undefined key).
/// `isInstalled`, `hasUpdate` and `installDir` are state of an installed entry: the stored entry of a
/// release that was never installed has none of them (the refresh merge appends feed releases without
/// them, and the stores released builds wrote hold them that way, D-07), and the renderer passes the
/// stored entry unchanged. Absent they read as false, false and the empty string; present, they are
/// still type-checked. The same bounds the TS zod carried (which also required the three, a defect
/// copied for parity and fixed here as the 87-59 item 4 finding F2).
const RELEASE_FIELDS: &[(&str, Field, bool)] = &[
    ("version", Field::NonEmpty(1024), false),
    ("type", Field::Type, false),
    ("date", Field::Text(256), false),
    ("download", Field::Text(8192), true),
    ("downsize", Field::Number, true),
    ("disksize", Field::Number, false),
    ("checksum", Field::Text(1024), true),
    ("release_notes_link", Field::Text(8192), false),
    ("isInstalled", Field::Bool, true),
    ("hasUpdate", Field::Bool, true),
    ("installDir", Field::Text(4096), true),
];

/// Decodes the one `WineVersionInfo` argument of `installWineVersion` and `removeWineVersion`: a
/// strict object of the eleven keys, of which `isInstalled`, `hasUpdate` and `installDir` may be
/// absent (a never-installed entry; see [`RELEASE_FIELDS`]); an unknown key is rejected (T-87-67), and
/// so is a present key of the wrong shape. The object is handed on as it came; the crate decodes what
/// it reads again and never takes the install directory from it. Every rejection is a fixed path and
/// code, never the renderer's value or key.
fn parse_wine_version(args: &[Value]) -> Result<&Map<String, Value>, Rejection> {
    let [arg] = args else {
        return Err(("(args)", "invalid_type"));
    };
    let Value::Object(release) = arg else {
        return Err(("0", "invalid_type"));
    };
    if release
        .keys()
        .any(|key| !RELEASE_FIELDS.iter().any(|(name, _, _)| name == key))
    {
        return Err(("0", "unrecognized_keys"));
    }
    for (name, field, optional) in RELEASE_FIELDS {
        let path = release_field_path(name);
        let Some(value) = release.get(*name) else {
            if *optional {
                continue;
            }
            return Err((path, "invalid_type"));
        };
        match (field, value) {
            (Field::NonEmpty(max) | Field::Text(max), Value::String(text)) => {
                let units = text.encode_utf16().count();
                if units > *max {
                    return Err((path, "too_big"));
                }
                if units == 0 && matches!(field, Field::NonEmpty(_)) {
                    return Err((path, "too_small"));
                }
            }
            (Field::Number, Value::Number(_)) | (Field::Bool, Value::Bool(_)) => {}
            (Field::Type, Value::String(kind)) => {
                if !RELEASE_TYPES.contains(&kind.as_str()) {
                    return Err((path, "invalid_value"));
                }
            }
            _ => return Err((path, "invalid_type")),
        }
    }
    Ok(release)
}

/// The rejection path of one release field. A table, so the path is a `&'static str`.
fn release_field_path(name: &str) -> &'static str {
    match name {
        "version" => "0.version",
        "type" => "0.type",
        "date" => "0.date",
        "download" => "0.download",
        "downsize" => "0.downsize",
        "disksize" => "0.disksize",
        "checksum" => "0.checksum",
        "release_notes_link" => "0.release_notes_link",
        "isInstalled" => "0.isInstalled",
        "hasUpdate" => "0.hasUpdate",
        _ => "0.installDir",
    }
}

/// One running install's cancel, under the id the renderer aborts it by.
struct InstallEntry {
    /// Tells a later install of the same id from this one when its guard goes away.
    generation: u64,
    cancel: CancellationToken,
}

#[derive(Default)]
struct InstallCancels {
    next: u64,
    running: HashMap<String, InstallEntry>,
}

/// The installs in flight, by id. The renderer's cancel for a wine-manager install is
/// `abort(version)` (the same id the TS registered its abort controller under), and that channel is
/// the sidecar's, so the shell's `sidecar_send` offers the id here first ([`cancel_install_for_abort`]).
static INSTALLS: OnceLock<Mutex<InstallCancels>> = OnceLock::new();

fn installs() -> std::sync::MutexGuard<'static, InstallCancels> {
    INSTALLS
        .get_or_init(|| Mutex::new(InstallCancels::default()))
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

/// Registers an install under `id` and hands back its token. A second install under the same id
/// replaces the first's entry (the TS abort registry did the same), and the first's guard then
/// leaves the second's entry alone.
fn register_install(id: &str) -> (CancellationToken, InstallGuard) {
    let cancel = CancellationToken::new();
    let mut installs = installs();
    installs.next += 1;
    let generation = installs.next;
    installs.running.insert(
        id.to_string(),
        InstallEntry {
            generation,
            cancel: cancel.clone(),
        },
    );
    (
        cancel,
        InstallGuard {
            id: id.to_string(),
            generation,
        },
    )
}

/// Unregisters its install when the install ends, however it ends.
struct InstallGuard {
    id: String,
    generation: u64,
}

impl Drop for InstallGuard {
    fn drop(&mut self) {
        let mut installs = installs();
        if installs
            .running
            .get(&self.id)
            .is_some_and(|entry| entry.generation == self.generation)
        {
            installs.running.remove(&self.id);
        }
    }
}

/// Cancels the install registered under `id`; `false` when none is (a finished install, or an id that
/// belongs to something else).
pub(crate) fn cancel_install(id: &str) -> bool {
    match installs().running.get(id) {
        Some(entry) => {
            entry.cancel.cancel();
            true
        }
        None => false,
    }
}

/// The renderer's `abort(id)` (a sidecar send channel): cancels the wine-manager install of that id.
/// `true` means Rust owned it and the sidecar need not be asked; anything but one string, or an id
/// with no install, is `false` and the send goes on to the sidecar as before.
pub(crate) fn cancel_install_for_abort(args: &[Value]) -> bool {
    match args {
        [Value::String(id)] => cancel_install(id),
        _ => false,
    }
}

/// The two install settings out of a parsed `config.json` (`defaultSettings.downloadProtonToSteam`
/// and `.defaultSteamPath`); the crate reads no settings file. An unreadable or wrong-typed config is
/// the TS default (off). A stored Steam path wins; without one, `steam_default` (the discovered
/// Steam root, what the sidecar's config defaults to) stands in, and is asked only when the setting
/// is on, since it probes the disk.
fn install_settings_from(
    config: Option<&Value>,
    steam_default: impl FnOnce() -> String,
) -> InstallSettings {
    let settings = config
        .and_then(|config| config.get("defaultSettings"))
        .and_then(Value::as_object);
    let download_proton_to_steam = settings
        .and_then(|settings| settings.get("downloadProtonToSteam"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if !download_proton_to_steam {
        return InstallSettings::default();
    }
    let stored = settings
        .and_then(|settings| settings.get("defaultSteamPath"))
        .and_then(Value::as_str)
        .filter(|path| !path.is_empty());
    InstallSettings {
        download_proton_to_steam,
        default_steam_path: stored.map(str::to_string).unwrap_or_else(steam_default),
    }
}

/// The install settings as the global config on disk holds them now (read per install, so a setting
/// changed a moment ago is the one used). Blocking; call it on the blocking pool.
fn read_install_settings(wine: &WineCtx) -> InstallSettings {
    let config = std::fs::read(wine.engine.paths.app_folder.join("config.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok());
    install_settings_from(config.as_ref(), || {
        gamelib_steamfiles::discover::discover_default().path
    })
}

/// Runs one install to its end on the calling thread, which must not be inside an async runtime (the
/// blocking pool, or the sidecar dispatcher's worker): registers the cancel the renderer's
/// `abort(version)` reaches, reads the install settings, and drives the crate's install. The crate owns
/// the whole handler (notification, progress, the download, the store, the result notification, the
/// closing idle), so a cancelled install ends as the TS aborted result. `Err` is the crate refusing a
/// version or archive name that is not one plain path component, before it does anything.
fn install_blocking(
    wine: &Arc<WineCtx>,
    release: &Value,
) -> Result<gamelib_wine::manager::install::Outcome, &'static str> {
    let version = release["version"].as_str().unwrap_or_default();
    let (cancel, _guard) = register_install(version);
    let settings = read_install_settings(wine);
    tauri::async_runtime::block_on(gamelib_wine::manager::install::install(
        wine, release, &settings, &cancel,
    ))
}

/// The body of `installWineVersion`: decode first (a bad call is rejected the same way before and
/// after the install), then [`install_blocking`] on the blocking pool. It answers `undefined` like the
/// TS handler.
async fn install_channel(wine: Option<Arc<WineCtx>>, args: Vec<Value>) -> Result<Value, String> {
    let release = parse_wine_version(&args)
        .map_err(|(path, code)| invalid_args("installWineVersion", &[path], &[code]))?
        .clone();
    let wine = wine.ok_or_else(|| "installWineVersion: not ready".to_string())?;
    let release = Value::Object(release);
    let ended = tauri::async_runtime::spawn_blocking(move || install_blocking(&wine, &release))
        .await
        .map_err(|_| "installWineVersion: the install did not finish".to_string())?;
    // The crate refuses a version or archive name that is not one plain path component before it
    // does anything; that is the renderer's argument being wrong.
    ended.map_err(|_| invalid_args("installWineVersion", &["0"], &["invalid_value"]))?;
    Ok(Value::Null)
}

/// The arguments `wine_manager_remove` is given: the version, and nothing else. The crate removes the
/// directory the store holds for that version, never one the renderer names (T-34.5-16, T-87-19).
fn remove_op_args(release: &Map<String, Value>) -> Vec<Value> {
    vec![release.get("version").cloned().unwrap_or(Value::Null)]
}

/// The body of `removeWineVersion`: decode first, then `wine_manager_remove` by version. The crate
/// notifies (`notify.uninstalled`) when it removed something; the answer is `undefined` like the TS.
async fn remove_channel(wine: Option<Arc<WineCtx>>, args: Vec<Value>) -> Result<Value, String> {
    let op_args = remove_op_args(
        parse_wine_version(&args)
            .map_err(|(path, code)| invalid_args("removeWineVersion", &[path], &[code]))?,
    );
    let wine = wine.ok_or_else(|| "removeWineVersion: not ready".to_string())?;
    run_wine_op(
        wine,
        "wine_manager_remove",
        op_args,
        "removeWineVersion: the removal did not finish",
    )
    .await?;
    Ok(Value::Null)
}

/// The native `installWineVersion` handler (slice `wine`, D-14).
pub(crate) fn install_wine_version(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(install_channel(wine_ctx().cloned(), args))
}

/// The native `removeWineVersion` handler (slice `wine`, D-14).
pub(crate) fn remove_wine_version(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(remove_channel(wine_ctx().cloned(), args))
}

/// The four `WineInstallation.type` values.
const WINE_KINDS: &[&str] = &["wine", "proton", "crossover", "toolkit"];

/// Decodes the one `WineInstallation` argument of `wine.isValidVersion`: a strict object of the six keys
/// the renderer's settings hold (`bin`, `name`, `type`, and the optional `lib`, `lib32`, `wineserver`,
/// each absent or null or text), with the bounds the TS zod carried. An unknown key is rejected
/// (T-87-22). Every rejection is a fixed path and code, never the renderer's value or key.
fn parse_wine_installation(args: &[Value]) -> Result<&Map<String, Value>, Rejection> {
    let [arg] = args else {
        return Err(("(args)", "invalid_type"));
    };
    let Value::Object(wine) = arg else {
        return Err(("0", "invalid_type"));
    };
    const KEYS: &[&str] = &["bin", "name", "type", "lib", "lib32", "wineserver"];
    if wine.keys().any(|key| !KEYS.contains(&key.as_str())) {
        return Err(("0", "unrecognized_keys"));
    }
    let text = |key: &str,
                path: &'static str,
                max: usize,
                required: bool,
                non_empty: bool|
     -> Result<(), Rejection> {
        match wine.get(key) {
            None | Some(Value::Null) if !required => Ok(()),
            Some(Value::String(value)) => {
                let units = value.encode_utf16().count();
                if units > max {
                    Err((path, "too_big"))
                } else if non_empty && units == 0 {
                    Err((path, "too_small"))
                } else {
                    Ok(())
                }
            }
            _ => Err((path, "invalid_type")),
        }
    };
    text("bin", "0.bin", 4096, true, true)?;
    text("name", "0.name", 1024, true, false)?;
    match wine.get("type") {
        Some(Value::String(kind)) if WINE_KINDS.contains(&kind.as_str()) => {}
        Some(Value::String(_)) => return Err(("0.type", "invalid_value")),
        _ => return Err(("0.type", "invalid_type")),
    }
    text("lib", "0.lib", 4096, false, false)?;
    text("lib32", "0.lib32", 4096, false, false)?;
    text("wineserver", "0.wineserver", 4096, false, false)?;
    Ok(wine)
}

/// The Darwin kernel release (`os.release()` on macOS, `24.1.0`), which `validWine` compares to 14 for a
/// toolkit. `None` off macOS (the crate ignores it there) or when `uname` fails.
#[cfg(target_os = "macos")]
fn darwin_release() -> Option<String> {
    // SAFETY: `uname` fills the zeroed struct it is given; `release` is a NUL-terminated C string.
    let mut info: libc::utsname = unsafe { std::mem::zeroed() };
    if unsafe { libc::uname(&mut info) } != 0 {
        return None;
    }
    let release = unsafe { std::ffi::CStr::from_ptr(info.release.as_ptr()) };
    Some(release.to_string_lossy().into_owned())
}

#[cfg(not(target_os = "macos"))]
fn darwin_release() -> Option<String> {
    None
}

/// The `wine_valid` op's arguments: the installation, and the host facts the shell reads (the Darwin
/// release, which only a macOS toolkit looks at).
fn wine_valid_args(wine: &Map<String, Value>) -> Vec<Value> {
    let host = match darwin_release() {
        Some(release) => serde_json::json!({ "darwinRelease": release }),
        None => serde_json::json!({}),
    };
    vec![Value::Object(wine.clone()), host]
}

/// The body of `wine.isValidVersion`: decode first (a bad call is rejected the same way before and after
/// the install), then `wine_valid` on the blocking pool. `wine` is the installed context, passed in so a
/// test drives this over a real one.
async fn wine_valid_channel(wine: Option<Arc<WineCtx>>, args: Vec<Value>) -> Result<Value, String> {
    let op_args = parse_wine_installation(&args)
        .map(wine_valid_args)
        .map_err(|(path, code)| invalid_args("wine.isValidVersion", &[path], &[code]))?;
    let wine = wine.ok_or_else(|| "wine.isValidVersion: not ready".to_string())?;
    run_wine_op(
        wine,
        "wine_valid",
        op_args,
        "wine.isValidVersion: the check did not finish",
    )
    .await
}

/// The native `wine.isValidVersion` handler (slice `wine`, D-14): whether the wine the renderer holds can
/// run, answered by the crate's `wine_valid` (existence checks only, nothing is spawned, T-87-22).
pub(crate) fn wine_is_valid_version(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(wine_valid_channel(wine_ctx().cloned(), args))
}

/// `/usr/share/steam`, the one absolute path the Linux wine set reads (`getSteamLibraries` always listed
/// it). The crate keeps it only when it exists.
const SYSTEM_STEAM: &str = "/usr/share/steam";

/// The text entries of a settings array (`customWinePaths`); anything else in it, or a setting that is no
/// array, is left out.
fn text_entries(value: Option<&Value>) -> Vec<Value> {
    value
        .and_then(Value::as_array)
        .map(|list| list.iter().filter(|e| e.is_string()).cloned().collect())
        .unwrap_or_default()
}

/// `getSteamLibraries`'s read of `libraryfolders.vdf` under the Steam root the settings name (the
/// quote-stripped `defaultSteamPath`, the discovered root when the settings hold none), as the crate's
/// `SteamLibraries`. Blocking: it reads the file.
fn steam_libraries(settings: &Map<String, Value>) -> Value {
    let root = settings
        .get("defaultSteamPath")
        .and_then(Value::as_str)
        .filter(|path| !path.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| gamelib_steamfiles::discover::discover_default().path);
    let root = root.replace('\'', "");
    let found = gamelib_steamfiles::library::read_library_folders(
        &std::path::Path::new(&root)
            .join("steamapps")
            .join("libraryfolders.vdf"),
    );
    serde_json::json!({ "exists": found.exists, "parsed": found.parsed, "paths": found.paths })
}

/// The one `DiscoveryHost` object `wine_discover_alternatives` takes: everything the TS discovery read from
/// the process, the settings and the Steam files, which the crate may not (T-87-71). Every root comes from
/// the shell (its home, `<appFolder>/config.json`, `/usr/share/steam`), the `PATH` from `path`, the two
/// settings and the Steam root from the global config the shell reads itself, and the Steam libraries from
/// the `libraryfolders.vdf` read (Linux only: the macOS set takes none). Nothing the renderer or the
/// sidecar sent is in it. Blocking: it reads config.json and the vdf.
fn discovery_host(wine: &WineCtx, path: Option<String>, scan_custom: Option<bool>) -> Value {
    let settings = gamelib_engine::config::global_settings(&wine.engine);
    let paths = &wine.engine.paths;
    let mut host = Map::new();
    host.insert(
        "roots".to_string(),
        serde_json::json!({
            "home": paths.user_home.to_string_lossy(),
            "configPath": paths.app_folder.join("config.json").to_string_lossy(),
            "systemSteam": SYSTEM_STEAM,
        }),
    );
    if let Some(path) = path {
        host.insert("path".to_string(), Value::String(path));
    }
    host.insert(
        "settings".to_string(),
        serde_json::json!({
            "customWinePaths": text_entries(settings.get("customWinePaths")),
            "showValveProton": settings
                .get("showValveProton")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        }),
    );
    if wine.engine.platform == gamelib_engine::ctx::Platform::Linux {
        host.insert("steamLibraries".to_string(), steam_libraries(&settings));
    }
    if let Some(scan) = scan_custom {
        host.insert("scanCustom".to_string(), Value::Bool(scan));
    }
    Value::Object(host)
}

/// Runs `wine_discover_alternatives` over [`discovery_host`] on the blocking pool (the crate's async
/// `dispatch` is driven with `block_on` there, as [`run_wine_op`] does).
async fn discover_alternatives_blocking(
    wine: Arc<WineCtx>,
    path: Option<String>,
    scan_custom: Option<bool>,
    failed: &'static str,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let host = discovery_host(&wine, path, scan_custom);
        tauri::async_runtime::block_on(gamelib_wine::dispatch(
            "wine_discover_alternatives",
            &[host],
            &wine,
        ))
    })
    .await
    .map_err(|_| failed.to_string())?
}

/// `getAlternativeWine` takes no argument: the renderer names no path (T-87-71).
fn parse_no_args(args: &[Value]) -> Result<(), Rejection> {
    if args.is_empty() {
        Ok(())
    } else {
        Err(("(args)", "too_big"))
    }
}

/// The body of `getAlternativeWine`: decode first (a bad call is rejected the same way before and after the
/// install), then the crate's discovery over the shell's own host. `path` is the process `PATH`, passed in
/// so a test drives this over a real context without reading the developer's.
async fn get_alternative_wine_channel(
    wine: Option<Arc<WineCtx>>,
    args: Vec<Value>,
    path: Option<String>,
) -> Result<Value, String> {
    parse_no_args(&args)
        .map_err(|(arg, code)| invalid_args("getAlternativeWine", &[arg], &[code]))?;
    let wine = wine.ok_or_else(|| "getAlternativeWine: not ready".to_string())?;
    discover_alternatives_blocking(
        wine,
        path,
        None,
        "getAlternativeWine: the discovery did not finish",
    )
    .await
}

/// The native `getAlternativeWine` handler (slice `wine`, D-14): the wines installed on this machine,
/// answered by the crate's `wine_discover_alternatives`. With no release list stored the crate refreshes
/// it first and pushes `wineVersionsUpdated`, as the TS did, so this has no wall-clock bound of its own.
pub(crate) fn get_alternative_wine(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(get_alternative_wine_channel(
        wine_ctx().cloned(),
        args,
        std::env::var("PATH").ok(),
    ))
}

/// The five store runners a queue key may name (the renderer's `Runner` union).
const QUEUE_RUNNERS: &[&str] = &["legendary", "gog", "sideload", "nile", "steam"];

/// The longest `appName` a queue channel takes (the TS `nonEmptyString()` bound).
const QUEUE_APP_NAME_MAX: usize = 4096;

/// Decodes `[runner, appName]`, the two arguments of `winetricksQueueState` and
/// `winetricksCancelRemaining`: one of the five runners and a non-empty string of at most 4096
/// characters. Every rejection is a fixed path and code, never the renderer's value (T-87-80).
fn parse_queue_key(args: &[Value]) -> Result<Value, Rejection> {
    let [runner, app_name] = args else {
        return Err((
            "(args)",
            if args.len() > 2 {
                "too_big"
            } else {
                "too_small"
            },
        ));
    };
    let Value::String(runner) = runner else {
        return Err(("0", "invalid_type"));
    };
    if !QUEUE_RUNNERS.contains(&runner.as_str()) {
        return Err(("0", "invalid_value"));
    }
    let Value::String(app_name) = app_name else {
        return Err(("1", "invalid_type"));
    };
    if app_name.is_empty() {
        return Err(("1", "too_small"));
    }
    if app_name.chars().count() > QUEUE_APP_NAME_MAX {
        return Err(("1", "too_big"));
    }
    Ok(serde_json::json!({ "runner": runner, "appName": app_name }))
}

/// The body of a queue channel: decode first (a bad call is rejected the same way before and after the
/// install), then the crate's queue op on the blocking pool. The answer is the queue's snapshot with one
/// new revision (`WinetricksQueueState`); the op reads memory only and holds no registrant of its own.
async fn queue_channel(
    wine: Option<Arc<WineCtx>>,
    channel: &'static str,
    op: &'static str,
    args: Vec<Value>,
) -> Result<Value, String> {
    let key =
        parse_queue_key(&args).map_err(|(path, code)| invalid_args(channel, &[path], &[code]))?;
    let wine = wine.ok_or_else(|| format!("{channel}: not ready"))?;
    run_wine_op(wine, op, vec![key], "the queue did not answer").await
}

/// The native `winetricksQueueState` handler (slice `wine`, D-14): the state of a game's Winetricks apply
/// queue, answered by `wine_winetricks_queue_state` (one new snapshot revision). The Rust queue is the
/// only one; the renderer reads the same queue that `winetricksApply` feeds (D-06).
pub(crate) fn winetricks_queue_state(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(queue_channel(
        wine_ctx().cloned(),
        "winetricksQueueState",
        "wine_winetricks_queue_state",
        args,
    ))
}

/// The native `winetricksCancelRemaining` handler (slice `wine`, D-14): the verbs not yet started are
/// cancelled, the one running finishes. Answers the new state, as `wine_winetricks_cancel_remaining` does.
pub(crate) fn winetricks_cancel_remaining(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(queue_channel(
        wine_ctx().cloned(),
        "winetricksCancelRemaining",
        "wine_winetricks_cancel_remaining",
        args,
    ))
}

/// Runs `op` over `args` for a `rustInvoke` arm. These arms run on the dispatcher's worker thread, never
/// inside a runtime, so the crate's own `dispatch_sync` drives the op there. Before [`install`] the
/// answer is `<op>:not-ready`.
fn rpc_wine_op(
    wine: Option<&Arc<WineCtx>>,
    op: &'static str,
    args: &[Value],
) -> Result<Value, String> {
    let wine = wine.ok_or_else(|| format!("{op}:not-ready"))?;
    gamelib_wine::dispatch_sync(op, args, wine)
}

/// The `wine_runtime_is_installed` `rustInvoke` arm (the launcher's `isRuntimeInstalled` shim, 87-18):
/// the generated decode (one string, one of the three names) first, then the crate, which refuses
/// anything but exactly one plain-component string again (T-87-65). Rejections are fixed
/// `<op>:bad-args` literals.
pub(crate) fn rpc_wine_runtime_is_installed(args: &[Value]) -> Result<Value, String> {
    WineRuntimeIsInstalledArgs::from_args(args)?;
    rpc_wine_op(wine_ctx(), "wine_runtime_is_installed", args)
}

/// The `wine_runtime_download` `rustInvoke` arm (the launcher's `downloadRuntime` shim, 87-18), decoded
/// the same way. The sidecar leaves this channel unbounded (`UNBOUNDED_RUST_CHANNELS`); the crate's
/// shutdown registrant and the token bound it instead.
pub(crate) fn rpc_wine_runtime_download(args: &[Value]) -> Result<Value, String> {
    WineRuntimeDownloadArgs::from_args(args)?;
    rpc_wine_op(wine_ctx(), "wine_runtime_download", args)
}

/// The `wine_manager_refresh` `rustInvoke` arm (the `updateWineVersionInfos` shim, 87-20): the generated
/// decode (one boolean) first, then the crate, which swallows a failed feed as the TS did. The
/// sidecar leaves this channel unbounded (`UNBOUNDED_RUST_CHANNELS`).
pub(crate) fn rpc_wine_manager_refresh(args: &[Value]) -> Result<Value, String> {
    WineManagerRefreshArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("wine_manager_refresh:bad-args".to_string());
    }
    rpc_wine_op(wine_ctx(), "wine_manager_refresh", args)
}

/// The `wine_manager_list` `rustInvoke` arm (the `listWineReleases` shim): the stored release list.
/// The crate refuses any argument.
pub(crate) fn rpc_wine_manager_list(args: &[Value]) -> Result<Value, String> {
    WineManagerListArgs::from_args(args)?;
    if !args.is_empty() {
        return Err("wine_manager_list:bad-args".to_string());
    }
    rpc_wine_op(wine_ctx(), "wine_manager_list", args)
}

/// Whether this run's DXMT boot task has been started. The first `releasesInfoReady` of a run is the boot
/// fetch (the TS listener ran on it at boot, off the first feed read); every later one is a refresh.
static DXMT_BOOT_STARTED: AtomicBool = AtomicBool::new(false);

/// DXMT's half of `releasesInfoReady` (87-31, D-06, D-17), after the wine release lists are updated. The
/// first call of a run starts the bounded boot task (`spawn_dxmt_boot_update`: a `Shutdown` registrant,
/// [`DXMT_BOOT_BOUND`], offline stops it before any request) and returns at once; every later call is the
/// listener itself, awaited (`wine_dxmt_releases_info`). `started` is the once-flag, so a test drives its
/// own. DXMT has exactly one owner here: the TS listener is no longer registered at boot.
fn dxmt_on_releases_info(
    wine: &Arc<WineCtx>,
    started: &AtomicBool,
    args: &[Value],
) -> Result<Value, String> {
    if started.swap(true, Ordering::SeqCst) {
        return gamelib_wine::dispatch_sync("wine_dxmt_releases_info", args, wine);
    }
    // The wire decode of the five feed stamps ignores the `dxmt` one; DXMT reads its tag from the same JSON.
    let info: DxmtReleasesInfo = args
        .first()
        .and_then(|arg| serde_json::from_value(arg.clone()).ok())
        .unwrap_or_default();
    if spawn_dxmt_boot_update(Arc::clone(wine), info, DXMT_BOOT_BOUND).is_err() {
        // The wine runtime could not be built: nothing else in this run could use DXMT either, and the
        // release lists are already updated, so the call still answers `null`.
        if let Some(log) = &wine.engine.log {
            log.warn("DXMT boot update: no runtime");
        }
    }
    Ok(Value::Null)
}

/// The `wine_releases_info_ready` `rustInvoke` arm (the `releasesInfoReady` listener's shim): one object,
/// of which the crate reads the five feed stamps and then DXMT its own ([`dxmt_on_releases_info`]).
/// Unbounded in the sidecar, like the refresh it may start.
pub(crate) fn rpc_wine_releases_info_ready(args: &[Value]) -> Result<Value, String> {
    WineReleasesInfoReadyArgs::from_args(args)?;
    if !matches!(args, [Value::Object(_)]) {
        return Err("wine_releases_info_ready:bad-args".to_string());
    }
    let answered = rpc_wine_op(wine_ctx(), "wine_releases_info_ready", args)?;
    if let Some(wine) = wine_ctx() {
        dxmt_on_releases_info(wine, &DXMT_BOOT_STARTED, args)?;
    }
    Ok(answered)
}

/// The `wine_manager_install` `rustInvoke` arm (the `installWineVersion` shim, the default-wine
/// download): the release is decoded as strictly as the renderer's is ([`parse_wine_version`], the
/// eleven keys and nothing else), then installed to its end on this thread and answered as
/// `'success' | 'abort' | 'error'`. It registers its cancel under the version like the renderer's
/// install, so `abort(version)` reaches it. Unbounded in the sidecar.
pub(crate) fn rpc_wine_manager_install(args: &[Value]) -> Result<Value, String> {
    const BAD: &str = "wine_manager_install:bad-args";
    WineManagerInstallArgs::from_args(args)?;
    // `parse_wine_version` is the strict decode and also refuses a second argument.
    let release = parse_wine_version(args).map_err(|_| BAD.to_string())?;
    let wine = wine_ctx().ok_or_else(|| "wine_manager_install:not-ready".to_string())?;
    let outcome =
        install_blocking(wine, &Value::Object(release.clone())).map_err(|_| BAD.to_string())?;
    Ok(Value::String(outcome.as_str().to_string()))
}

/// What the `wine_valid` arm asks the crate about a persisted wine, from a value the sidecar sent: `None`
/// when it is no usable installation (not an object, no string `bin`, no `type` of the four), which the
/// TS `validWine` answered `false` and so does this, never a rejection (the Windows factory default is
/// `{}`, and a stored wine may carry a legacy key). Otherwise the six declared keys only: `name` as text
/// (empty when absent, the crate does not read it), and each of `lib`, `lib32` and `wineserver` when it is
/// text. Nothing else the sidecar sent reaches the crate (T-87-70).
fn persisted_wine(value: &Value) -> Option<Map<String, Value>> {
    let Value::Object(wine) = value else {
        return None;
    };
    let bin = wine.get("bin").filter(|bin| bin.is_string())?;
    let kind = wine
        .get("type")
        .and_then(Value::as_str)
        .filter(|kind| WINE_KINDS.contains(kind))?;
    let mut kept = Map::new();
    kept.insert("bin".to_string(), bin.clone());
    kept.insert(
        "name".to_string(),
        match wine.get("name") {
            Some(name) if name.is_string() => name.clone(),
            _ => Value::String(String::new()),
        },
    );
    kept.insert("type".to_string(), Value::String(kind.to_string()));
    for key in ["lib", "lib32", "wineserver"] {
        if let Some(text) = wine.get(key).filter(|text| text.is_string()) {
            kept.insert(key.to_string(), text.clone());
        }
    }
    Some(kept)
}

/// The `wine_valid` `rustInvoke` arm (the `validWine` shim, 87-24): exactly one argument, which is
/// [`persisted_wine`]'d (a value that is no installation, or `null`, is `false`), then the crate with the
/// Darwin release the shell reads. Existence checks only; nothing is spawned (T-87-70).
pub(crate) fn rpc_wine_valid(args: &[Value]) -> Result<Value, String> {
    WineValidArgs::from_args(args)?;
    let [wine] = args else {
        return Err("wine_valid:bad-args".to_string());
    };
    let Some(wine) = persisted_wine(wine) else {
        // Not asked of the crate, so "no wine" is `false` before and after the install alike.
        return Ok(Value::Bool(false));
    };
    rpc_wine_op(wine_ctx(), "wine_valid", &wine_valid_args(&wine))
}

/// The host facts the crate may not read for `wine_run_command`: this process's environment (the merge
/// base of a wine command's environment and the `PATH` the umu lookup scans) and the Darwin release. The
/// sidecar is this shell's child, so its environment is this one's. A variable that is not UTF-8 is left
/// out, as the crate's snapshot holds text.
pub(crate) fn wine_run_host() -> Value {
    let env: Map<String, Value> = std::env::vars_os()
        .filter_map(|(key, value)| {
            Some((
                key.into_string().ok()?,
                Value::String(value.into_string().ok()?),
            ))
        })
        .collect();
    let mut host = Map::new();
    host.insert("env".to_string(), Value::Object(env));
    if let Some(release) = darwin_release() {
        host.insert("darwinRelease".to_string(), Value::String(release));
    }
    Value::Object(host)
}

/// The host facts the crate may not read for a tool (the DXVK family): the wine host facts of
/// [`wine_run_host`], the bundled `public` directory holding the Vulkan helper, and the online monitor's
/// last answer, which the sidecar reports through `engine_set_online`. Built here, never taken from the
/// sidecar, so a path or an online claim it sent cannot reach a tool (T-87-34). Before the engine context
/// exists the app counts as online, which is the crate's own default.
fn tools_host_value() -> Value {
    let mut host = Map::new();
    if let Some(dir) = PUBLIC_DIR.get().and_then(|dir| dir.as_deref()) {
        if let Some(dir) = dir.to_str() {
            host.insert("publicDir".to_string(), Value::String(dir.to_string()));
        }
    }
    let online = engine_dispatch::engine_ctx().map_or(true, |engine| engine.is_online());
    host.insert("online".to_string(), Value::Bool(online));
    host.insert("wine".to_string(), wine_run_host());
    Value::Object(host)
}

/// [`tools_host_value`] as the crate's [`ToolsHost`], for the shell's own callers (the engine's DXVK seam,
/// `engine_dispatch::ShellDxvk`), so the renderer's toggles, the launcher's DXVK step and the engine all
/// run a tool under one set of facts.
pub(crate) fn tools_host() -> ToolsHost {
    serde_json::from_value(tools_host_value()).unwrap_or_default()
}

/// The `wine_dxvk_install_remove` `rustInvoke` arm (the three DXVK toggles and the `dxvkInstallRemove`
/// shim, 87-34): exactly one `{ settings, tool, action, source? }` object, to which the shell adds
/// [`tools_host_value`]. The crate decodes the request strictly (an unknown key, tool or action is
/// `wine_dxvk_install_remove:bad-args`) and answers a boolean, or a category word on failure. Runs on the
/// dispatcher's worker thread until the install ends or the app shuts down; unbounded in the sidecar.
pub(crate) fn rpc_wine_dxvk_install_remove(args: &[Value]) -> Result<Value, String> {
    const BAD: &str = "wine_dxvk_install_remove:bad-args";
    WineDxvkInstallRemoveArgs::from_args(args)?;
    let [request @ Value::Object(_)] = args else {
        return Err(BAD.to_string());
    };
    rpc_wine_op(
        wine_ctx(),
        "wine_dxvk_install_remove",
        &[request.clone(), tools_host_value()],
    )
}

/// The most verbs one `wine_winetricks_install` call takes (the renderer's apply payload bound).
const INSTALL_VERBS_MAX: usize = 1024;

/// The `wine_winetricks_apply` `rustInvoke` arm (the `winetricksApply` resolver, 87-35): `[request, verbs]`,
/// the game's [`gamelib_wine::winetricks::TargetArg`] the resolver gathered and the renderer's verbs payload
/// exactly as it sent it. The shell adds the wine host facts (its own environment and Darwin release), so
/// none travels from the sidecar. The crate runs its apply guard (the verbs against the game's catalog)
/// before any verb reaches an argv, answers at once with the state or the refusal, and installs the verbs
/// detached under its own shutdown registrant. Unbounded in the sidecar (a first apply reads the catalog,
/// which downloads the winetricks script).
pub(crate) fn rpc_wine_winetricks_apply(args: &[Value]) -> Result<Value, String> {
    WineWinetricksApplyArgs::from_args(args)?;
    let [request @ Value::Object(_), verbs] = args else {
        return Err("wine_winetricks_apply:bad-args".to_string());
    };
    rpc_wine_op(
        wine_ctx(),
        "wine_winetricks_apply",
        &[request.clone(), verbs.clone(), wine_run_host()],
    )
}

/// The one request a catalog read takes: exactly one object (the game's target), to which the shell adds the
/// wine host facts. Shared by the `available` and the two `installed` arms.
fn winetricks_read_op(op: &'static str, args: &[Value]) -> Result<Value, String> {
    let [request @ Value::Object(_)] = args else {
        return Err(format!("{op}:bad-args"));
    };
    rpc_wine_op(wine_ctx(), op, &[request.clone(), wine_run_host()])
}

/// The `wine_winetricks_available` `rustInvoke` arm (the `winetricksAvailable` resolver, 87-35): the
/// components winetricks can install for the game, with the crate's catalog cache. Unbounded in the sidecar
/// (the first read downloads the script and lists it).
pub(crate) fn rpc_wine_winetricks_available(args: &[Value]) -> Result<Value, String> {
    WineWinetricksAvailableArgs::from_args(args)?;
    winetricks_read_op("wine_winetricks_available", args)
}

/// The `wine_winetricks_installed` `rustInvoke` arm (the `winetricksInstalled` resolver, 87-35): the lines of
/// the game's `winetricks.log`. A read: it never creates a bottle.
pub(crate) fn rpc_wine_winetricks_installed(args: &[Value]) -> Result<Value, String> {
    WineWinetricksInstalledArgs::from_args(args)?;
    winetricks_read_op("wine_winetricks_installed", args)
}

/// The `wine_winetricks_list_installed` `rustInvoke` arm (the `winetricksListInstalled` shim, 87-35): the
/// same read for the launcher's log line, which holds the settings it launches with.
pub(crate) fn rpc_wine_winetricks_list_installed(args: &[Value]) -> Result<Value, String> {
    WineWinetricksListInstalledArgs::from_args(args)?;
    winetricks_read_op("wine_winetricks_installed", args)
}

/// The `wine_winetricks_install` `rustInvoke` arm (the `winetricksInstallVerbs` shim, 87-35): `[request, verbs]`,
/// the game's target and a list of verbs, installed one after another as the launcher's known-fix loop did
/// (never a batch, never parallel, a failed verb does not stop the rest). Answers one outcome word per verb:
/// `installed`, `failed` or `refused` (another component was installing). A verb that is not the shape of a
/// real one never reaches an argv and counts as `failed`. The shell adds the wine host facts. Unbounded in the
/// sidecar (each verb is a winetricks run).
pub(crate) fn rpc_wine_winetricks_install(args: &[Value]) -> Result<Value, String> {
    const OP: &str = "wine_winetricks_install";
    WineWinetricksInstallArgs::from_args(args)?;
    let [Value::Object(request), Value::Array(verbs)] = args else {
        return Err(format!("{OP}:bad-args"));
    };
    if verbs.len() > INSTALL_VERBS_MAX {
        return Err(format!("{OP}:bad-args"));
    }
    let mut outcomes = Vec::with_capacity(verbs.len());
    for verb in verbs {
        let Value::String(verb) = verb else {
            return Err(format!("{OP}:bad-args"));
        };
        // The crate refuses a verb that is no verb as a bad argument, which would be indistinguishable from
        // a bad request: decide it here, so nothing ran for it and the request's own faults still surface.
        if !gamelib_wine::winetricks::is_verb_shape(verb) {
            outcomes.push(Value::String("failed".to_string()));
            continue;
        }
        let mut one = request.clone();
        one.insert("verb".to_string(), Value::String(verb.clone()));
        outcomes.push(rpc_wine_op(
            wine_ctx(),
            OP,
            &[Value::Object(one), wine_run_host()],
        )?);
    }
    Ok(Value::Array(outcomes))
}

/// The `wine_run_command` `rustInvoke` arm: one `WineCommandArgs` object, to which the shell adds
/// [`wine_run_host`]. The crate decodes the command strictly (an unknown key is `wine_run_command:bad-args`)
/// and runs it on this thread, which is the dispatcher's worker, until it ends or the app shuts down. No TS
/// caller yet (the sync-callback `runWineCommand` stays a scheduled twin until Phase 88), so the arm is
/// proven by the unit tests and the crate's goldens.
pub(crate) fn rpc_wine_run_command(args: &[Value]) -> Result<Value, String> {
    WineRunCommandArgs::from_args(args)?;
    let [command @ Value::Object(_)] = args else {
        return Err("wine_run_command:bad-args".to_string());
    };
    rpc_wine_op(
        wine_ctx(),
        "wine_run_command",
        &[command.clone(), wine_run_host()],
    )
}

/// The `wine_run_command_for_game` `rustInvoke` arm (the `runWineCommandForGame` resolver and the launcher's
/// known-fix `runInPrefix` step, 87-36): one object, the game facts the resolver gathered and the command, to
/// which the shell adds [`wine_run_host`]. The crate decodes it strictly (an unknown key is
/// `wine_run_command_for_game:bad-args`), judges the command's shape first (`bad-command-parts`, nothing
/// spawned), then the Steam, native and install-path guards, and spawns through its labelled Helper spawn. A
/// refused command answers the empty result and logs one line. Unbounded in the sidecar (a wine command runs
/// until the program ends or the app shuts down).
pub(crate) fn rpc_wine_run_command_for_game(args: &[Value]) -> Result<Value, String> {
    WineRunCommandForGameArgs::from_args(args)?;
    let [request @ Value::Object(_)] = args else {
        return Err("wine_run_command_for_game:bad-args".to_string());
    };
    rpc_wine_op(
        wine_ctx(),
        "wine_run_command_for_game",
        &[request.clone(), wine_run_host()],
    )
}

/// The `wine_tool_call` `rustInvoke` arm (the `callTool` resolver, 87-36): one object, the tool (`winecfg` or
/// `runExe`), the exe a `runExe` runs and the same game facts `wine_run_command_for_game` takes, to which the shell
/// adds [`wine_run_host`]. The crate decodes it strictly (`wine_tool_call:bad-args`) and runs the tool's wine
/// command through the same guards; it answers null (a refused tool is one log line). Unbounded in the sidecar.
pub(crate) fn rpc_wine_tool_call(args: &[Value]) -> Result<Value, String> {
    WineToolCallArgs::from_args(args)?;
    let [request @ Value::Object(_)] = args else {
        return Err("wine_tool_call:bad-args".to_string());
    };
    rpc_wine_op(
        wine_ctx(),
        "wine_tool_call",
        &[request.clone(), wine_run_host()],
    )
}

/// The `wine_discover_alternatives` `rustInvoke` arm (the `discoverAlternativeWine` shim, 87-26): exactly one
/// boolean, `scanCustom`, and nothing else from the sidecar. The shell builds the crate's whole
/// `DiscoveryHost` itself ([`discovery_host`]: its roots, `PATH`, settings and the Steam libraries), so no
/// path the sidecar holds reaches discovery (T-87-71). Runs on the dispatcher's worker thread until the
/// list is ready (a refresh of an empty release list first); unbounded in the sidecar.
pub(crate) fn rpc_wine_discover_alternatives(args: &[Value]) -> Result<Value, String> {
    const BAD: &str = "wine_discover_alternatives:bad-args";
    let decoded = WineDiscoverAlternativesArgs::from_args(args)?;
    if args.len() != 1 {
        return Err(BAD.to_string());
    }
    let wine = wine_ctx().ok_or_else(|| "wine_discover_alternatives:not-ready".to_string())?;
    let host = discovery_host(wine, std::env::var("PATH").ok(), Some(decoded.scan_custom));
    gamelib_wine::dispatch_sync("wine_discover_alternatives", &[host], wine)
}

/// The `wine_discover_crossover` `rustInvoke` arm (the `discoverCrossover` intra-phase shim, 87-26): no
/// argument. One `mdfind` through the crate's labelled Helper spawn, with its own 10 s limit.
pub(crate) fn rpc_wine_discover_crossover(args: &[Value]) -> Result<Value, String> {
    WineDiscoverCrossoverArgs::from_args(args)?;
    if !args.is_empty() {
        return Err("wine_discover_crossover:bad-args".to_string());
    }
    rpc_wine_op(wine_ctx(), "wine_discover_crossover", args)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // CrossOver and the Mach-O bundle layout are macOS-only; the fixtures are POSIX paths.
    #[cfg(unix)]
    #[test]
    fn the_shell_scan_answers_through_gamelib_scan_and_fails_a_bundle_with_no_winemac() {
        let home = gamelib_testutil::FakeHome::new("wine-macho-");
        let bundle = home.root().join("Wine-Staging-macOS-9");
        std::fs::create_dir_all(&bundle).unwrap();

        // No winemac.so: the scanner's own failed check, with all four symbols missing.
        let WinemacMetalCheck::Fail {
            winemac_path,
            reason,
            missing,
        } = ShellMachoScan.winemac_metal_exports(&bundle).unwrap()
        else {
            panic!("a bundle with no winemac.so must not pass");
        };
        assert!(
            winemac_path.ends_with("x86_64-unix/winemac.so"),
            "{winemac_path}"
        );
        assert_eq!(reason, "winemac.so not found");
        assert_eq!(missing.len(), 4);

        // A file that is not a Mach-O is a failed check too.
        let so = gamelib_wine::tools::macho::winemac_path_for(&bundle);
        std::fs::create_dir_all(so.parent().unwrap()).unwrap();
        std::fs::write(&so, b"not a mach-o").unwrap();
        let check = ShellMachoScan.winemac_metal_exports(&bundle).unwrap();
        assert!(matches!(check, WinemacMetalCheck::Fail { .. }), "{check:?}");
    }

    #[test]
    fn the_runtime_name_is_one_of_the_three_and_nothing_else() {
        for name in ["eac_runtime", "battleye_runtime", "umu"] {
            assert_eq!(
                parse_runtime_name(&[json!(name)]).map(RuntimeName::as_str),
                Ok(name)
            );
        }
        for (args, want) in [
            (vec![], ("(args)", "invalid_type")),
            (vec![json!("umu"), json!("umu")], ("(args)", "invalid_type")),
            (vec![json!(1)], ("0", "invalid_type")),
            (vec![json!(null)], ("0", "invalid_type")),
            (vec![json!({ "name": "umu" })], ("0", "invalid_type")),
            (vec![json!("x")], ("0", "invalid_value")),
            (vec![json!("")], ("0", "invalid_value")),
            (vec![json!("UMU")], ("0", "invalid_value")),
            (vec![json!("../umu")], ("0", "invalid_value")),
        ] {
            assert_eq!(parse_runtime_name(&args).map(|_| ()), Err(want), "{args:?}");
        }
    }

    #[test]
    fn the_handler_validates_first_and_answers_not_ready_before_install() {
        assert!(wine_ctx().is_none());
        let router_ctx = Arc::new(crate::native_router::NativeCtx::for_tests(
            Arc::new(NoHost),
            None,
        ));
        let not_ready = tauri::async_runtime::block_on(is_runtime_installed(
            Arc::clone(&router_ctx),
            vec![json!("umu")],
        ));
        assert_eq!(not_ready, Err("isRuntimeInstalled: not ready".to_string()));
        let not_ready = tauri::async_runtime::block_on(download_runtime(
            Arc::clone(&router_ctx),
            vec![json!("umu")],
        ));
        assert_eq!(not_ready, Err("downloadRuntime: not ready".to_string()));
        let secret = "SECRET-RUNTIME-".repeat(80);
        for bad in [
            tauri::async_runtime::block_on(is_runtime_installed(
                Arc::clone(&router_ctx),
                vec![json!(secret)],
            )),
            tauri::async_runtime::block_on(is_runtime_installed(Arc::clone(&router_ctx), vec![])),
            tauri::async_runtime::block_on(download_runtime(
                Arc::clone(&router_ctx),
                vec![json!(secret)],
            )),
            tauri::async_runtime::block_on(download_runtime(
                Arc::clone(&router_ctx),
                vec![json!("umu"), json!("umu")],
            )),
            tauri::async_runtime::block_on(download_runtime(router_ctx, vec![])),
        ] {
            let error = bad.unwrap_err();
            assert!(
                error.starts_with(crate::ipc_contract::IPC_INVALID_ARGS_MARKER),
                "{error}"
            );
            assert!(!error.contains("SECRET"), "{error}");
        }
    }

    #[test]
    fn the_rpc_arms_validate_first_and_answer_not_ready_before_install() {
        assert!(wine_ctx().is_none());
        assert_eq!(
            rpc_wine_runtime_download(&[json!("umu")]),
            Err("wine_runtime_download:not-ready".to_string())
        );
        assert_eq!(
            rpc_wine_runtime_is_installed(&[json!("eac_runtime")]),
            Err("wine_runtime_is_installed:not-ready".to_string())
        );
        for bad in [
            vec![],
            vec![json!(1)],
            vec![json!("x")],
            vec![json!("../umu")],
            vec![json!({ "name": "umu" })],
        ] {
            assert_eq!(
                rpc_wine_runtime_download(&bad),
                Err("wine_runtime_download:bad-args".to_string()),
                "{bad:?}"
            );
            assert_eq!(
                rpc_wine_runtime_is_installed(&bad),
                Err("wine_runtime_is_installed:bad-args".to_string()),
                "{bad:?}"
            );
        }
    }

    /// A wine context over throwaway paths, for the arms that need one and touch nothing.
    fn bare_wine() -> Arc<WineCtx> {
        let missing = std::path::PathBuf::from("gamelib-wine-dxmt-test-missing").join("runtimes");
        let engine = engine_dispatch::build_ctx(
            Arc::new(gamelib_store::host::StoreHost::new()),
            std::path::Path::new("gamelib-wine-dxmt-test-missing"),
            std::path::PathBuf::from("home"),
            std::path::PathBuf::from("tmp"),
            Arc::new(gamelib_engine::sinks::NullEmitter),
            Arc::new(engine_dispatch::ShellEngineUi::silent(Arc::new(
                gamelib_engine::sinks::NullEmitter,
            ))),
            gamelib_core::shutdown::Shutdown::new(),
        );
        Arc::new(WineCtx::new(Arc::new(engine), missing))
    }

    #[test]
    fn the_first_releases_info_of_a_run_starts_the_dxmt_boot_task_once_and_later_ones_are_the_listener(
    ) {
        let wine = bare_wine();
        let started = AtomicBool::new(false);
        let info = [json!({ "dxmt": { "tag": "v0.80" } })];
        // First: the boot task is started (the once-flag flips), and the call answers at once.
        assert_eq!(
            dxmt_on_releases_info(&wine, &started, &info),
            Ok(Value::Null)
        );
        assert!(started.load(Ordering::SeqCst));
        // Later: the listener runs through the crate op and answers `null`; a payload the op cannot read
        // is refused by it, which shows the call went to the op and not to a second boot task.
        assert_eq!(
            dxmt_on_releases_info(&wine, &started, &info),
            Ok(Value::Null)
        );
        assert_eq!(
            dxmt_on_releases_info(&wine, &started, &[json!("x")]),
            Err("wine_dxmt_releases_info:bad-args".to_string())
        );
    }

    #[test]
    fn the_releases_info_arm_decodes_before_it_reaches_the_context_and_is_not_ready_before_install()
    {
        for bad in [vec![], vec![json!("x")], vec![json!({}), json!({})]] {
            assert_eq!(
                rpc_wine_releases_info_ready(&bad),
                Err("wine_releases_info_ready:bad-args".to_string()),
                "{bad:?}"
            );
        }
        // No test installs the process-wide wine context, so a well-formed call is not ready, and no DXMT
        // boot task has been started by it.
        assert!(wine_ctx().is_none());
        assert_eq!(
            rpc_wine_releases_info_ready(&[json!({})]),
            Err("wine_releases_info_ready:not-ready".to_string())
        );
        assert!(!DXMT_BOOT_STARTED.load(Ordering::SeqCst));
    }

    #[test]
    fn an_rpc_arm_runs_the_crate_op_on_the_calling_thread_and_refuses_a_second_argument() {
        let missing = std::path::PathBuf::from("gamelib-wine-rpc-test-missing").join("runtimes");
        let engine = engine_dispatch::build_ctx(
            Arc::new(gamelib_store::host::StoreHost::new()),
            std::path::Path::new("gamelib-wine-rpc-test-missing"),
            std::path::PathBuf::from("home"),
            std::path::PathBuf::from("tmp"),
            Arc::new(gamelib_engine::sinks::NullEmitter),
            Arc::new(engine_dispatch::ShellEngineUi::silent(Arc::new(
                gamelib_engine::sinks::NullEmitter,
            ))),
            gamelib_core::shutdown::Shutdown::new(),
        );
        let wine = Arc::new(WineCtx::new(Arc::new(engine), missing));
        assert_eq!(
            rpc_wine_op(Some(&wine), "wine_runtime_is_installed", &[json!("umu")]),
            Ok(json!(false))
        );
        assert_eq!(
            rpc_wine_op(
                Some(&wine),
                "wine_runtime_is_installed",
                &[json!("umu"), json!("umu")]
            ),
            Err("wine_runtime_is_installed:bad-args".to_string())
        );
    }

    /// A host that does nothing: the runtime handlers never reach the native host.
    struct NoHost;
    impl crate::native_router::NativeHost for NoHost {
        fn open_url(&self, _url: String) {}
        fn reveal_path(&self, _path: String) {}
    }

    #[test]
    fn an_op_runs_through_the_crate_on_the_blocking_pool() {
        // A runtimes directory that does not exist: the crate answers false without a request.
        let missing =
            std::path::PathBuf::from("gamelib-wine-dispatch-test-missing").join("runtimes");
        let engine = engine_dispatch::build_ctx(
            Arc::new(gamelib_store::host::StoreHost::new()),
            std::path::Path::new("gamelib-wine-dispatch-test-missing"),
            std::path::PathBuf::from("home"),
            std::path::PathBuf::from("tmp"),
            Arc::new(gamelib_engine::sinks::NullEmitter),
            Arc::new(engine_dispatch::ShellEngineUi::silent(Arc::new(
                gamelib_engine::sinks::NullEmitter,
            ))),
            gamelib_core::shutdown::Shutdown::new(),
        );
        let wine = Arc::new(WineCtx::new(Arc::new(engine), missing));
        let answer = tauri::async_runtime::block_on(run_wine_op(
            wine,
            "wine_runtime_is_installed",
            vec![json!("umu")],
            "x",
        ));
        assert_eq!(answer, Ok(json!(false)));
    }

    #[test]
    fn the_refresh_fetch_is_nothing_null_or_one_boolean() {
        assert_eq!(parse_refresh_fetch(&[]), Ok(false));
        assert_eq!(parse_refresh_fetch(&[json!(null)]), Ok(false));
        assert_eq!(parse_refresh_fetch(&[json!(true)]), Ok(true));
        assert_eq!(parse_refresh_fetch(&[json!(false)]), Ok(false));
        for (args, want) in [
            (vec![json!(1)], ("0", "invalid_type")),
            (vec![json!("true")], ("0", "invalid_type")),
            (vec![json!({})], ("0", "invalid_type")),
            (vec![json!({ "fetch": true })], ("0", "invalid_type")),
            (vec![json!([true])], ("0", "invalid_type")),
            (vec![json!(true), json!(true)], ("(args)", "too_big")),
            (vec![json!(null), json!(null)], ("(args)", "too_big")),
        ] {
            assert_eq!(parse_refresh_fetch(&args), Err(want), "{args:?}");
        }
    }

    #[test]
    fn the_refresh_handler_validates_first_and_answers_not_ready_before_install() {
        assert!(wine_ctx().is_none());
        let router_ctx = Arc::new(crate::native_router::NativeCtx::for_tests(
            Arc::new(NoHost),
            None,
        ));
        let secret = "SECRET-FETCH-".repeat(80);
        for bad in [vec![json!(secret)], vec![json!(true), json!(true)]] {
            let error = tauri::async_runtime::block_on(refresh_wine_version_info(
                Arc::clone(&router_ctx),
                bad,
            ))
            .unwrap_err();
            assert!(
                error.starts_with(crate::ipc_contract::IPC_INVALID_ARGS_MARKER),
                "{error}"
            );
            assert!(!error.contains("SECRET"), "{error}");
        }
        for ok in [vec![], vec![json!(null)], vec![json!(true)]] {
            assert_eq!(
                tauri::async_runtime::block_on(refresh_wine_version_info(
                    Arc::clone(&router_ctx),
                    ok
                )),
                Err("refreshWineVersionInfo: not ready".to_string())
            );
        }
    }

    /// A `WineVersionInfo` as the renderer sends it from the stored list.
    fn release(version: &str) -> Value {
        json!({
            "version": version,
            "type": "Wine-Lutris",
            "date": "2024-06-01",
            "download": "https://downloads.invalid/x.tar.xz",
            "downsize": 100,
            "disksize": 1234,
            "checksum": "https://downloads.invalid/x.sha512sum",
            "release_notes_link": "https://downloads.invalid/notes",
            "isInstalled": false,
            "hasUpdate": false,
            "installDir": "/renderer/says/here"
        })
    }

    #[test]
    fn a_wine_version_info_is_its_eleven_keys_and_nothing_else() {
        let full = release("Wine-Lutris-9");
        assert!(parse_wine_version(std::slice::from_ref(&full)).is_ok());
        // download, downsize and checksum are the keys a feed may not give.
        let mut sparse = full.clone();
        for key in ["download", "downsize", "checksum"] {
            sparse.as_object_mut().unwrap().remove(key);
        }
        assert!(parse_wine_version(&[sparse]).is_ok());
        for ty in [
            "Wine-GE",
            "GE-Proton",
            "Proton",
            "Wine-Lutris",
            "Wine-Kron4ek",
            "Wine-Crossover",
            "Wine-Staging-macOS",
            "Game-Porting-Toolkit",
            "Proton-CachyOS",
        ] {
            let mut r = full.clone();
            r["type"] = json!(ty);
            assert!(parse_wine_version(&[r]).is_ok(), "{ty}");
        }
        let with = |key: &str, value: Value| {
            let mut r = full.clone();
            r[key] = value;
            r
        };
        let without = |key: &str| {
            let mut r = full.clone();
            r.as_object_mut().unwrap().remove(key);
            r
        };
        for (args, want) in [
            (vec![], ("(args)", "invalid_type")),
            (vec![full.clone(), full.clone()], ("(args)", "invalid_type")),
            (vec![json!("v")], ("0", "invalid_type")),
            (vec![json!(null)], ("0", "invalid_type")),
            (vec![json!([])], ("0", "invalid_type")),
            (vec![with("extra", json!(1))], ("0", "unrecognized_keys")),
            (vec![without("version")], ("0.version", "invalid_type")),
            (vec![with("version", json!(""))], ("0.version", "too_small")),
            (
                vec![with("version", json!(1))],
                ("0.version", "invalid_type"),
            ),
            (
                vec![with("version", json!("v".repeat(1025)))],
                ("0.version", "too_big"),
            ),
            (
                vec![with("type", json!("Wine-Mystery"))],
                ("0.type", "invalid_value"),
            ),
            (vec![without("type")], ("0.type", "invalid_type")),
            (vec![without("date")], ("0.date", "invalid_type")),
            (vec![without("disksize")], ("0.disksize", "invalid_type")),
            (
                vec![with("disksize", json!("1"))],
                ("0.disksize", "invalid_type"),
            ),
            (
                vec![without("release_notes_link")],
                ("0.release_notes_link", "invalid_type"),
            ),
            (
                vec![with("isInstalled", json!("yes"))],
                ("0.isInstalled", "invalid_type"),
            ),
            (
                vec![with("hasUpdate", json!("no"))],
                ("0.hasUpdate", "invalid_type"),
            ),
            (
                vec![with("installDir", json!(1))],
                ("0.installDir", "invalid_type"),
            ),
            (
                vec![with("installDir", json!("d".repeat(4097)))],
                ("0.installDir", "too_big"),
            ),
            (
                vec![with("download", json!(null))],
                ("0.download", "invalid_type"),
            ),
            (
                vec![with("downsize", json!("1"))],
                ("0.downsize", "invalid_type"),
            ),
            (
                vec![with("checksum", json!("c".repeat(1025)))],
                ("0.checksum", "too_big"),
            ),
        ] {
            assert_eq!(parse_wine_version(&args).map(|_| ()), Err(want), "{args:?}");
        }
    }

    /// A release as the refresh merge stores it for a never-installed build, and as the released
    /// builds stored it (D-07): no `isInstalled`, `hasUpdate` or `installDir`. The renderer sends
    /// the stored entry unchanged.
    fn feed_shaped(version: &str) -> Value {
        let mut entry = release(version);
        for key in ["isInstalled", "hasUpdate", "installDir"] {
            entry.as_object_mut().unwrap().remove(key);
        }
        entry
    }

    #[test]
    fn a_never_installed_entry_decodes_and_every_other_rejection_is_unchanged() {
        // F2: the three state keys are absent on a never-installed entry.
        assert!(parse_wine_version(&[feed_shaped("Wine-Lutris-9")]).is_ok());
        for key in ["isInstalled", "hasUpdate", "installDir"] {
            let mut one_missing = release("Wine-Lutris-9");
            one_missing.as_object_mut().unwrap().remove(key);
            assert!(parse_wine_version(&[one_missing]).is_ok(), "{key}");
        }
        // A present key of the wrong type, an unknown key and an unknown release type are
        // still rejected with the same path and code (T-87-67, T-87-106).
        let with = |key: &str, value: Value| {
            let mut r = feed_shaped("Wine-Lutris-9");
            r[key] = value;
            r
        };
        for (args, want) in [
            (
                vec![with("isInstalled", json!("yes"))],
                ("0.isInstalled", "invalid_type"),
            ),
            (
                vec![with("hasUpdate", json!(0))],
                ("0.hasUpdate", "invalid_type"),
            ),
            (
                vec![with("installDir", json!(null))],
                ("0.installDir", "invalid_type"),
            ),
            (
                vec![with("installDir", json!("d".repeat(4097)))],
                ("0.installDir", "too_big"),
            ),
            (vec![with("x", json!(1))], ("0", "unrecognized_keys")),
            (
                vec![with("type", json!("Other"))],
                ("0.type", "invalid_value"),
            ),
        ] {
            assert_eq!(parse_wine_version(&args).map(|_| ()), Err(want), "{args:?}");
        }
    }

    /// The archive the golden_wine_manager install cases replay (`eac_runtime/empty` inside one
    /// top directory, stripped on extraction) and the checksum file its digest sits in.
    const GOLDEN_ARCHIVE: &[u8] = include_bytes!(
        "../crates/gamelib-wine/tests/fixtures/recorded/wine_manager/install-checksum-match/body-3.bin"
    );
    const GOLDEN_CHECKSUMS: &str = include_str!(
        "../crates/gamelib-wine/tests/fixtures/recorded/wine_manager/install-checksum-match/body-1.txt"
    );

    /// Serves the golden feed: the checksum file for a GET, the archive for a download.
    struct ServesGolden;
    impl gamelib_engine::fetch::Fetch for ServesGolden {
        fn get(
            &self,
            _req: gamelib_engine::fetch::FetchRequest,
        ) -> gamelib_engine::fetch::FetchFuture<
            '_,
            Result<gamelib_engine::fetch::FetchResponse, gamelib_engine::fetch::FetchError>,
        > {
            Box::pin(async {
                Ok(gamelib_engine::fetch::FetchResponse {
                    status: 200,
                    headers: Vec::new(),
                    body: GOLDEN_CHECKSUMS.as_bytes().to_vec(),
                })
            })
        }

        fn download<'a>(
            &'a self,
            _req: gamelib_engine::fetch::FetchRequest,
            dest: &'a std::path::Path,
            _progress: &'a (dyn Fn(gamelib_engine::fetch::Progress) + Send + Sync),
            _cancel: CancellationToken,
        ) -> gamelib_engine::fetch::FetchFuture<
            'a,
            Result<gamelib_engine::fetch::DownloadOutcome, gamelib_engine::fetch::FetchError>,
        > {
            Box::pin(async move {
                std::fs::write(dest, GOLDEN_ARCHIVE)
                    .map_err(|_| gamelib_engine::fetch::FetchError::Network)?;
                Ok(gamelib_engine::fetch::DownloadOutcome {
                    bytes: GOLDEN_ARCHIVE.len() as u64,
                    sha256: String::new(),
                })
            })
        }
    }

    #[test]
    fn a_rejected_release_is_a_fixed_literal_before_the_context_is_looked_at() {
        let mut bad = release("Wine-Lutris-9");
        bad["SECRET-KEY-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"] = json!("SECRET-VALUE");
        for answer in [
            tauri::async_runtime::block_on(install_channel(None, vec![bad.clone()])),
            tauri::async_runtime::block_on(remove_channel(None, vec![bad])),
        ] {
            let error = answer.unwrap_err();
            assert!(
                error.starts_with(crate::ipc_contract::IPC_INVALID_ARGS_MARKER),
                "{error}"
            );
            assert!(!error.contains("SECRET"), "{error}");
        }
        // A valid release with no context answers not ready, never a panic.
        assert_eq!(
            tauri::async_runtime::block_on(install_channel(None, vec![release("v")])),
            Err("installWineVersion: not ready".to_string())
        );
        assert_eq!(
            tauri::async_runtime::block_on(remove_channel(None, vec![release("v")])),
            Err("removeWineVersion: not ready".to_string())
        );
    }

    #[test]
    fn remove_passes_the_crate_the_version_and_never_the_renderers_directory() {
        let r = release("Wine-Lutris-9");
        let args = [r];
        let parsed = parse_wine_version(&args).unwrap();
        let op_args = remove_op_args(parsed);
        assert_eq!(op_args, vec![json!("Wine-Lutris-9")]);
        assert!(!op_args.iter().any(|a| a.to_string().contains("renderer")));
    }

    /// The wine context over a fake HOME, with a fetch that waits for its cancel and a recording
    /// emitter.
    fn wine_over(home: &gamelib_testutil::FakeHome, emitter: Arc<Recorded>) -> Arc<WineCtx> {
        wine_over_fetch(home, emitter, Arc::new(WaitsForCancel))
    }

    /// [`wine_over`] with the fetch the test chooses.
    fn wine_over_fetch(
        home: &gamelib_testutil::FakeHome,
        emitter: Arc<Recorded>,
        fetch: Arc<dyn gamelib_engine::fetch::Fetch>,
    ) -> Arc<WineCtx> {
        wine_over_host(
            home,
            emitter,
            fetch,
            Arc::new(gamelib_store::host::StoreHost::new()),
        )
    }

    /// [`wine_over_fetch`] over the store host the test chooses (the one the renderer push is
    /// installed on, as `store_boot::host()` is in the shell).
    fn wine_over_host(
        home: &gamelib_testutil::FakeHome,
        emitter: Arc<Recorded>,
        fetch: Arc<dyn gamelib_engine::fetch::Fetch>,
        host: Arc<gamelib_store::host::StoreHost>,
    ) -> Arc<WineCtx> {
        let root = home.root().to_path_buf();
        let engine = gamelib_engine::ctx::EngineCtx::new(
            host,
            Arc::new(gamelib_core::clock::SystemClock),
            gamelib_engine::ctx::Platform::Linux,
            gamelib_engine::ctx::EnginePaths {
                app_folder: root.join("userdata"),
                user_data: root.join("userdata"),
                tools_path: root.join("tools"),
                user_home: root.clone(),
                temp: root.join("temp"),
            },
            gamelib_core::shutdown::Shutdown::new(),
        )
        .with_fetch(fetch)
        .with_emitter(emitter)
        .with_ui(Arc::new(engine_dispatch::ShellEngineUi::silent(Arc::new(
            gamelib_engine::sinks::NullEmitter,
        ))));
        Arc::new(WineCtx::new(
            Arc::new(engine),
            root.join("tools").join("runtimes"),
        ))
    }

    #[derive(Default)]
    struct Recorded(std::sync::Mutex<Vec<(String, Vec<Value>)>>);
    impl gamelib_core::emitter::FrontendEmitter for Recorded {
        fn emit(&self, channel: &str, args: Vec<Value>) {
            self.0.lock().unwrap().push((channel.to_string(), args));
        }
    }

    /// A download that never finishes by itself: it waits for its cancel and then reports `aborted`.
    struct WaitsForCancel;
    impl gamelib_engine::fetch::Fetch for WaitsForCancel {
        fn get(
            &self,
            _req: gamelib_engine::fetch::FetchRequest,
        ) -> gamelib_engine::fetch::FetchFuture<
            '_,
            Result<gamelib_engine::fetch::FetchResponse, gamelib_engine::fetch::FetchError>,
        > {
            Box::pin(async { Err(gamelib_engine::fetch::FetchError::Network) })
        }

        fn download<'a>(
            &'a self,
            _req: gamelib_engine::fetch::FetchRequest,
            _dest: &'a std::path::Path,
            _progress: &'a (dyn Fn(gamelib_engine::fetch::Progress) + Send + Sync),
            cancel: CancellationToken,
        ) -> gamelib_engine::fetch::FetchFuture<
            'a,
            Result<gamelib_engine::fetch::DownloadOutcome, gamelib_engine::fetch::FetchError>,
        > {
            Box::pin(async move {
                cancel.cancelled().await;
                Err(gamelib_engine::fetch::FetchError::Aborted)
            })
        }
    }

    /// The stored list, read through the crate's own list seam.
    fn stored_list(wine: &WineCtx) -> Vec<Value> {
        match gamelib_wine::manager::releases::list(wine).unwrap() {
            Value::Array(entries) => entries,
            other => panic!("not a list: {other}"),
        }
    }

    /// Seeds the wine-manager store with `entries`, as a refresh merge leaves it.
    fn seed_stored(wine: &WineCtx, entries: &[Value]) {
        let store = gamelib_wine::manager::store::open(wine).unwrap();
        gamelib_wine::manager::store::write(
            &store,
            entries
                .iter()
                .cloned()
                .map(gamelib_store::json::Json::from)
                .collect(),
        )
        .unwrap();
    }

    fn golden_entry() -> Value {
        let mut entry = feed_shaped("GE-Proton9-27");
        entry["type"] = json!("GE-Proton");
        entry["download"] = json!("https://downloads.oracle.invalid/GE-Proton9-27.tar.xz");
        entry["checksum"] = json!("https://downloads.oracle.invalid/GE-Proton9-27.sha512sum");
        entry
    }

    #[test]
    fn a_never_installed_entry_installs_end_to_end_through_the_arm() {
        let home = gamelib_testutil::FakeHome::new("wine-dispatch-install-");
        let emitter = Arc::new(Recorded::default());
        let wine = wine_over_fetch(&home, Arc::clone(&emitter), Arc::new(ServesGolden));
        let entry = golden_entry();
        seed_stored(&wine, std::slice::from_ref(&entry));

        let answer =
            tauri::async_runtime::block_on(install_channel(Some(Arc::clone(&wine)), vec![entry]));
        assert_eq!(answer, Ok(Value::Null));

        let installed = home
            .root()
            .join("tools")
            .join("proton")
            .join("GE-Proton9-27");
        assert!(
            installed.join("empty").is_file(),
            "the archive was extracted"
        );
        let leftovers: Vec<_> = std::fs::read_dir(installed.parent().unwrap())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(
            leftovers,
            ["GE-Proton9-27"],
            "no archive or partial directory"
        );
        let stored = stored_list(&wine);
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0]["isInstalled"], json!(true));
        assert_eq!(stored[0]["hasUpdate"], json!(false));
        assert_eq!(
            stored[0]["installDir"],
            json!(installed.display().to_string())
        );
        let pushes = emitter.0.lock().unwrap();
        assert!(pushes
            .iter()
            .any(|(channel, _)| channel == "wineVersionsUpdated"));
    }

    #[test]
    fn a_renderer_supplied_install_dir_is_never_where_the_install_goes() {
        let home = gamelib_testutil::FakeHome::new("wine-dispatch-install-dir-");
        let wine = wine_over_fetch(&home, Arc::new(Recorded::default()), Arc::new(ServesGolden));
        let stored_entry = golden_entry();
        seed_stored(&wine, std::slice::from_ref(&stored_entry));
        let elsewhere = home.root().join("elsewhere").join("GE-Proton9-27");
        std::fs::create_dir_all(elsewhere.parent().unwrap()).unwrap();
        let mut sent = stored_entry;
        sent["installDir"] = json!(elsewhere.display().to_string());
        sent["isInstalled"] = json!(false);
        sent["hasUpdate"] = json!(false);

        let answer =
            tauri::async_runtime::block_on(install_channel(Some(Arc::clone(&wine)), vec![sent]));
        assert_eq!(answer, Ok(Value::Null));

        assert!(!elsewhere.exists(), "the supplied directory was used");
        let computed = home
            .root()
            .join("tools")
            .join("proton")
            .join("GE-Proton9-27");
        assert!(computed.join("empty").is_file());
        assert_eq!(
            stored_list(&wine)[0]["installDir"],
            json!(computed.display().to_string())
        );
    }

    /// F4 (87-59 item 4): after a Rust install and after a Rust remove, the renderer hears a
    /// `storeChanged` frame for `wineDownloaderInfoStore` / `wine-releases` carrying the new list,
    /// and hears it before the `wineVersionsUpdated` push that makes the list re-read it. Every
    /// frame lands in one recorder in arrival order, as the preload sees them.
    #[test]
    fn a_wine_manager_install_and_remove_push_the_new_list_before_the_list_re_reads_it() {
        let home = gamelib_testutil::FakeHome::new("wine-dispatch-f4-");
        let frames = Arc::new(Recorded::default());
        let host = Arc::new(gamelib_store::host::StoreHost::new());
        crate::store_native::install_renderer_push(
            &host,
            Arc::clone(&frames) as Arc<dyn gamelib_core::emitter::FrontendEmitter>,
        );
        // The shell's own context builder, so the emitter is the one the app gives the crate; only
        // the network is the replayed golden feed.
        let root = home.root().to_path_buf();
        let engine = engine_dispatch::build_ctx(
            Arc::clone(&host),
            &root.join("userdata"),
            root.clone(),
            root.join("temp"),
            Arc::clone(&frames) as Arc<dyn gamelib_core::emitter::FrontendEmitter>,
            Arc::new(engine_dispatch::ShellEngineUi::silent(Arc::new(
                gamelib_engine::sinks::NullEmitter,
            ))),
            gamelib_core::shutdown::Shutdown::new(),
        )
        .with_fetch(Arc::new(ServesGolden));
        let wine = Arc::new(WineCtx::new(
            Arc::new(engine),
            root.join("tools").join("runtimes"),
        ));
        seed_stored(&wine, std::slice::from_ref(&golden_entry()));
        delivered(&host);
        frames.0.lock().unwrap().clear();

        let sent = golden_entry();
        let answer =
            tauri::async_runtime::block_on(install_channel(Some(Arc::clone(&wine)), vec![sent]));
        assert_eq!(answer, Ok(Value::Null));
        delivered(&host);
        let after_install = frames_of(&frames);
        eprintln!("install frames: {after_install:#?}");
        assert_list_frame_precedes_re_read(&after_install, true);
        // A tab switch or a fresh hydrate does not wait for a push: it reads the store through
        // the shell's own fetch, which must hold the list the crate wrote (one host entry for the
        // file, whichever of the crate or the renderer's fetch opened it first).
        let reads = crate::store_native::StoreReads {
            config: Some(crate::store_native::ReadConfig {
                user_data: root.join("userdata"),
            }),
        };
        let fetched = crate::store_native::fetch_blocking(
            &host,
            &reads,
            &crate::store_native::resolve_renderer_store("wineDownloaderInfoStore").unwrap(),
        )
        .unwrap();
        assert_eq!(
            fetched["values"]["wine-releases"][0]["isInstalled"],
            json!(true),
            "{fetched}"
        );
        assert_eq!(fetched["rev"], json!(2), "{fetched}");

        frames.0.lock().unwrap().clear();
        let installed = stored_list(&wine).remove(0);
        let answer = tauri::async_runtime::block_on(remove_channel(
            Some(Arc::clone(&wine)),
            vec![installed],
        ));
        assert_eq!(answer, Ok(Value::Null));
        delivered(&host);
        let after_remove = frames_of(&frames);
        eprintln!("remove frames: {after_remove:#?}");
        assert_list_frame_precedes_re_read(&after_remove, false);
    }

    /// Waits until the host's event queue has run everything queued so far, so every push the
    /// changes made has reached the recorder.
    fn delivered(host: &gamelib_store::host::StoreHost) {
        let (tx, rx) = std::sync::mpsc::channel();
        host.post(Box::new(move || {
            let _ = tx.send(());
        }));
        rx.recv_timeout(std::time::Duration::from_secs(10))
            .expect("the host's event queue drained");
    }

    /// The channels and the one-line shape of what the recorder saw, in arrival order.
    fn frames_of(frames: &Recorded) -> Vec<(String, Value)> {
        frames
            .0
            .lock()
            .unwrap()
            .iter()
            .filter(|(channel, _)| channel == "storeChanged" || channel == "wineVersionsUpdated")
            .map(|(channel, args)| {
                (
                    channel.clone(),
                    args.first().cloned().unwrap_or(Value::Null),
                )
            })
            .collect()
    }

    /// There is a `wine-releases` frame for the wine manager's renderer store, its list holds the
    /// installed (or removed) state, and no `wineVersionsUpdated` came before the last such frame.
    fn assert_list_frame_precedes_re_read(frames: &[(String, Value)], installed: bool) {
        let list_frames: Vec<usize> = frames
            .iter()
            .enumerate()
            .filter(|(_, (channel, frame))| {
                channel == "storeChanged"
                    && frame["store"] == "wineDownloaderInfoStore"
                    && frame["key"] == "wine-releases"
            })
            .map(|(i, _)| i)
            .collect();
        assert!(
            !list_frames.is_empty(),
            "no wine-releases frame: {frames:#?}"
        );
        let last = *list_frames.last().unwrap();
        assert_eq!(
            frames[last].1["value"][0]["isInstalled"],
            json!(installed),
            "{frames:#?}"
        );
        let first_re_read = frames
            .iter()
            .position(|(channel, _)| channel == "wineVersionsUpdated")
            .expect("the crate announces the change");
        assert!(
            list_frames[0] < first_re_read,
            "the list re-reads before the snapshot holds the new value: {frames:#?}"
        );
    }

    #[test]
    fn an_unknown_key_removes_nothing_and_a_missing_version_removes_nothing() {
        let home = gamelib_testutil::FakeHome::new("wine-dispatch-remove-");
        let wine = wine_over(&home, Arc::new(Recorded::default()));
        let kept = home.root().join("tools").join("wine").join("Wine-Lutris-9");
        std::fs::create_dir_all(&kept).unwrap();
        let mut bad = release("Wine-Lutris-9");
        bad["installDir"] = json!(kept.display().to_string());
        bad["extra"] = json!(true);
        let rejected =
            tauri::async_runtime::block_on(remove_channel(Some(Arc::clone(&wine)), vec![bad]));
        assert!(rejected
            .unwrap_err()
            .starts_with(crate::ipc_contract::IPC_INVALID_ARGS_MARKER));
        assert!(kept.is_dir());
        // A version the store never listed: the renderer's installDir is not trusted, nothing goes.
        let mut forged = release("Wine-Lutris-9");
        forged["installDir"] = json!(kept.display().to_string());
        let answered = tauri::async_runtime::block_on(remove_channel(Some(wine), vec![forged]));
        assert_eq!(answered, Ok(Value::Null));
        assert!(
            kept.is_dir(),
            "the renderer's installDir must never be removed"
        );
    }

    #[test]
    fn a_cancel_id_maps_to_one_token_and_ends_with_its_install() {
        let (token, guard) = register_install("Wine-Lutris-9");
        assert!(!token.is_cancelled());
        assert!(!cancel_install("another"));
        assert!(cancel_install("Wine-Lutris-9"));
        assert!(token.is_cancelled());
        drop(guard);
        assert!(
            !cancel_install("Wine-Lutris-9"),
            "a finished install has no cancel"
        );
        // A second install under the same id replaces the first; the first's guard going away
        // does not take the second's cancel with it.
        let (_first, first_guard) = register_install("same");
        let (second, second_guard) = register_install("same");
        drop(first_guard);
        assert!(cancel_install("same"));
        assert!(second.is_cancelled());
        drop(second_guard);
        assert!(!cancel_install("same"));
    }

    #[test]
    fn the_renderers_abort_cancels_a_running_install_with_the_aborted_result() {
        let home = gamelib_testutil::FakeHome::new("wine-dispatch-cancel-");
        let emitter = Arc::new(Recorded::default());
        let wine = wine_over(&home, Arc::clone(&emitter));
        let version = "Wine-Lutris-9-cancel";
        let mut r = release(version);
        r.as_object_mut().unwrap().remove("checksum");
        let canceller = std::thread::spawn(move || {
            // The install registers its token as it starts; the renderer's `abort(version)` is
            // the call that cancels it. Bounded, so a missing registration fails the test below
            // instead of hanging it.
            for _ in 0..1000 {
                if cancel_install_for_abort(&[json!(version)]) {
                    return true;
                }
                std::thread::sleep(std::time::Duration::from_millis(5));
            }
            false
        });
        let answer = tauri::async_runtime::block_on(install_channel(Some(wine), vec![r]));
        assert!(canceller.join().unwrap(), "the install registered a cancel");
        assert_eq!(answer, Ok(Value::Null));
        let pushes = emitter.0.lock().unwrap();
        let progress: Vec<&Value> = pushes
            .iter()
            .filter(|(channel, _)| channel == "progressOfWineManager")
            .map(|(_, args)| &args[1])
            .collect();
        assert_eq!(progress.last().unwrap()["status"], "idle", "{progress:?}");
        assert!(
            !home
                .root()
                .join("tools")
                .join("wine")
                .join(version)
                .exists(),
            "an aborted install leaves no directory"
        );
        assert!(
            !cancel_install(version),
            "the finished install is unregistered"
        );
    }

    #[test]
    fn the_abort_hook_ignores_anything_but_one_string() {
        for args in [vec![], vec![json!(1)], vec![json!(null)], vec![json!({})]] {
            assert!(!cancel_install_for_abort(&args), "{args:?}");
        }
        assert!(!cancel_install_for_abort(&[json!("nobody")]));
    }

    #[test]
    fn the_install_settings_come_from_the_global_config_with_the_steam_default() {
        let config = json!({
            "version": "v0",
            "defaultSettings": {
                "downloadProtonToSteam": true,
                "defaultSteamPath": "/home/me/.steam/steam"
            }
        });
        assert_eq!(
            install_settings_from(Some(&config), || panic!("a stored path needs no default")),
            InstallSettings {
                download_proton_to_steam: true,
                default_steam_path: "/home/me/.steam/steam".to_string()
            }
        );
        // No stored path: the discovered default stands in, only when it is going to be used.
        let on = json!({ "defaultSettings": { "downloadProtonToSteam": true } });
        assert_eq!(
            install_settings_from(Some(&on), || "/discovered".to_string()),
            InstallSettings {
                download_proton_to_steam: true,
                default_steam_path: "/discovered".to_string()
            }
        );
        let off = json!({ "defaultSettings": { "downloadProtonToSteam": false } });
        assert_eq!(
            install_settings_from(Some(&off), || panic!("off needs no default")),
            InstallSettings::default()
        );
        // An unreadable or wrong-typed config is the TS default: off.
        for junk in [
            None,
            Some(json!(null)),
            Some(json!([])),
            Some(json!({ "defaultSettings": 3 })),
            Some(json!({ "defaultSettings": { "downloadProtonToSteam": "yes" } })),
        ] {
            assert_eq!(
                install_settings_from(junk.as_ref(), || panic!("never needed")),
                InstallSettings::default(),
                "{junk:?}"
            );
        }
    }

    #[test]
    fn the_manager_rpc_arms_validate_first_and_answer_not_ready_before_install() {
        assert!(wine_ctx().is_none());
        assert_eq!(
            rpc_wine_manager_refresh(&[json!(true)]),
            Err("wine_manager_refresh:not-ready".to_string())
        );
        assert_eq!(
            rpc_wine_manager_list(&[]),
            Err("wine_manager_list:not-ready".to_string())
        );
        assert_eq!(
            rpc_wine_releases_info_ready(&[json!({})]),
            Err("wine_releases_info_ready:not-ready".to_string())
        );
        assert_eq!(
            rpc_wine_manager_install(&[release("Wine-Lutris-9")]),
            Err("wine_manager_install:not-ready".to_string())
        );
        // Bad arguments are the fixed `<op>:bad-args` before the context is looked at.
        for (answer, op) in [
            (rpc_wine_manager_refresh(&[]), "wine_manager_refresh"),
            (
                rpc_wine_manager_refresh(&[json!("yes")]),
                "wine_manager_refresh",
            ),
            (rpc_wine_manager_install(&[]), "wine_manager_install"),
            (
                rpc_wine_manager_install(&[json!("x")]),
                "wine_manager_install",
            ),
            (
                rpc_wine_manager_install(&[json!({ "version": "v" })]),
                "wine_manager_install",
            ),
            (
                rpc_wine_releases_info_ready(&[]),
                "wine_releases_info_ready",
            ),
            (
                rpc_wine_releases_info_ready(&[json!(null)]),
                "wine_releases_info_ready",
            ),
        ] {
            assert_eq!(answer, Err(format!("{op}:bad-args")), "{op}");
        }
        let mut extra = release("Wine-Lutris-9");
        extra["SECRET-KEY"] = json!(1);
        assert_eq!(
            rpc_wine_manager_install(&[extra]),
            Err("wine_manager_install:bad-args".to_string())
        );
    }

    fn wine_json(kind: &str, bin: &str) -> Value {
        json!({ "bin": bin, "name": "Wine - Test", "type": kind })
    }

    #[test]
    fn a_wine_installation_is_its_six_keys_and_nothing_else() {
        let mut full = wine_json("wine", "/usr/bin/wine");
        full["lib"] = json!("/l");
        full["lib32"] = json!(null);
        full["wineserver"] = json!("/ws");
        for ok in [wine_json("proton", "/p"), wine_json("toolkit", "/g"), full] {
            assert!(
                parse_wine_installation(std::slice::from_ref(&ok)).is_ok(),
                "{ok}"
            );
        }
        let mut extra = wine_json("wine", "/b");
        extra["legacyKey"] = json!(1);
        let mut bad_lib = wine_json("wine", "/b");
        bad_lib["lib"] = json!(7);
        let mut long_ws = wine_json("wine", "/b");
        long_ws["wineserver"] = json!("w".repeat(4097));
        let mut no_name = wine_json("wine", "/b");
        no_name.as_object_mut().unwrap().remove("name");
        for (args, want) in [
            (vec![], ("(args)", "invalid_type")),
            (vec![json!(null)], ("0", "invalid_type")),
            (vec![json!("wine")], ("0", "invalid_type")),
            (vec![json!([])], ("0", "invalid_type")),
            (
                vec![wine_json("wine", "/b"), json!({})],
                ("(args)", "invalid_type"),
            ),
            (vec![extra], ("0", "unrecognized_keys")),
            (vec![wine_json("dosbox", "/b")], ("0.type", "invalid_value")),
            (
                vec![json!({ "bin": "/b", "name": "n" })],
                ("0.type", "invalid_type"),
            ),
            (vec![wine_json("wine", "")], ("0.bin", "too_small")),
            (
                vec![json!({ "name": "n", "type": "wine" })],
                ("0.bin", "invalid_type"),
            ),
            (vec![no_name], ("0.name", "invalid_type")),
            (
                vec![wine_json("wine", &"b".repeat(4097))],
                ("0.bin", "too_big"),
            ),
            (vec![bad_lib], ("0.lib", "invalid_type")),
            (vec![long_ws], ("0.wineserver", "too_big")),
        ] {
            assert_eq!(
                parse_wine_installation(&args).map(|_| ()),
                Err(want),
                "{args:?}"
            );
        }
    }

    #[test]
    fn the_valid_version_handler_validates_first_and_answers_not_ready_before_install() {
        assert!(wine_ctx().is_none());
        let router_ctx = Arc::new(crate::native_router::NativeCtx::for_tests(
            Arc::new(NoHost),
            None,
        ));
        let mut secret = wine_json("wine", "/b");
        secret["SECRET-KEY-".repeat(40).as_str()] = json!(1);
        for bad in [vec![secret], vec![], vec![json!("SECRET-WINE")]] {
            let error =
                tauri::async_runtime::block_on(wine_is_valid_version(Arc::clone(&router_ctx), bad))
                    .unwrap_err();
            assert!(
                error.starts_with(crate::ipc_contract::IPC_INVALID_ARGS_MARKER),
                "{error}"
            );
            assert!(!error.contains("SECRET"), "{error}");
        }
        assert_eq!(
            tauri::async_runtime::block_on(wine_is_valid_version(
                router_ctx,
                vec![wine_json("wine", "/b")]
            )),
            Err("wine.isValidVersion: not ready".to_string())
        );
    }

    #[test]
    fn the_valid_version_handler_answers_the_crates_wine_valid_over_a_real_context() {
        let home = gamelib_testutil::FakeHome::new("wine-dispatch-valid-");
        let wine = wine_over(&home, Arc::new(Recorded::default()));
        let bin = home.root().join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        let wine_bin = bin.join("wine");
        let wineserver = bin.join("wineserver");
        std::fs::write(&wine_bin, b"").unwrap();
        std::fs::write(&wineserver, b"").unwrap();
        let ask = |args: Value| {
            tauri::async_runtime::block_on(wine_valid_channel(Some(Arc::clone(&wine)), vec![args]))
        };
        let installed = |kind: &str, server: Option<&std::path::Path>| {
            let mut value = wine_json(kind, &wine_bin.display().to_string());
            if let Some(server) = server {
                value["wineserver"] = json!(server.display().to_string());
            }
            value
        };
        // A wine needs its wineserver; a proton needs only its binary; a missing binary is invalid.
        assert_eq!(ask(installed("wine", Some(&wineserver))), Ok(json!(true)));
        assert_eq!(ask(installed("wine", None)), Ok(json!(false)));
        assert_eq!(ask(installed("proton", None)), Ok(json!(true)));
        assert_eq!(
            ask(wine_json(
                "proton",
                &bin.join("missing").display().to_string()
            )),
            Ok(json!(false))
        );
    }

    #[test]
    fn the_host_facts_carry_only_the_darwin_release_and_the_crate_decodes_them() {
        let wine = serde_json::Map::new();
        let args = wine_valid_args(&wine);
        assert_eq!(args.len(), 2);
        let host = args[1].as_object().unwrap();
        assert!(host.keys().all(|key| key == "darwinRelease"), "{host:?}");
        if cfg!(target_os = "macos") {
            let release = host["darwinRelease"].as_str().unwrap();
            assert!(release.split('.').next().unwrap().parse::<u64>().is_ok());
        }
    }

    #[test]
    fn a_persisted_wine_keeps_its_six_keys_and_a_non_wine_is_nothing() {
        let kept = persisted_wine(&json!({
            "bin": "/b", "name": "n", "type": "proton", "lib": "/l", "lib32": 7,
            "wineserver": null, "legacyKey": { "x": 1 }
        }))
        .unwrap();
        let mut keys: Vec<&str> = kept.keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(keys, ["bin", "lib", "name", "type"]);
        // The name is not read by the crate, so an absent one is empty rather than a refusal.
        let nameless = persisted_wine(&json!({ "bin": "", "type": "wine" })).unwrap();
        assert_eq!(nameless["name"], json!(""));
        for not_a_wine in [
            json!(null),
            json!("wine"),
            json!({}),
            json!({ "name": "n", "type": "wine" }),
            json!({ "bin": 1, "type": "wine" }),
            json!({ "bin": "/b", "type": "dosbox" }),
            json!({ "bin": "/b" }),
        ] {
            assert_eq!(persisted_wine(&not_a_wine), None, "{not_a_wine}");
        }
    }

    #[test]
    fn the_valid_arm_answers_false_for_no_wine_and_not_ready_for_a_wine_before_install() {
        assert!(wine_ctx().is_none());
        // No wine is false before the context exists, as it was in the TS (no crate is asked).
        for none in [
            json!(null),
            json!({}),
            json!({ "bin": "/b", "type": "dosbox" }),
        ] {
            assert_eq!(rpc_wine_valid(&[none]), Ok(json!(false)));
        }
        assert_eq!(
            rpc_wine_valid(&[json!({ "bin": "/b", "name": "n", "type": "wine", "legacy": 1 })]),
            Err("wine_valid:not-ready".to_string())
        );
        for bad in [vec![], vec![json!(null), json!(null)]] {
            assert_eq!(rpc_wine_valid(&bad), Err("wine_valid:bad-args".to_string()));
        }
    }

    #[test]
    fn the_run_command_arm_takes_one_object_and_adds_the_host_facts() {
        assert!(wine_ctx().is_none());
        for bad in [
            vec![],
            vec![json!("winecfg")],
            vec![json!(null)],
            vec![json!({}), json!({})],
        ] {
            assert_eq!(
                rpc_wine_run_command(&bad),
                Err("wine_run_command:bad-args".to_string()),
                "{bad:?}"
            );
        }
        assert_eq!(
            rpc_wine_run_command(&[json!({ "commandParts": ["winecfg"] })]),
            Err("wine_run_command:not-ready".to_string())
        );
        let host = wine_run_host();
        let host = host.as_object().unwrap();
        assert!(host
            .keys()
            .all(|key| key == "env" || key == "darwinRelease"));
        let env = host["env"].as_object().unwrap();
        assert!(env.values().all(Value::is_string));
        assert_eq!(
            env.get("PATH").and_then(Value::as_str),
            std::env::var("PATH").ok().as_deref()
        );
    }

    #[test]
    fn the_dxvk_arm_takes_one_object_and_the_host_facts_are_the_shells_own() {
        assert!(wine_ctx().is_none());
        for bad in [
            vec![],
            vec![json!("dxvk")],
            vec![json!(null)],
            vec![json!({}), json!({})],
            // A second element is where a sidecar could try to send its own host facts.
            vec![
                json!({ "settings": {}, "tool": "dxvk", "action": "backup" }),
                json!({ "publicDir": "/SECRET-PATH", "online": true }),
            ],
        ] {
            assert_eq!(
                rpc_wine_dxvk_install_remove(&bad),
                Err("wine_dxvk_install_remove:bad-args".to_string()),
                "{bad:?}"
            );
        }
        assert_eq!(
            rpc_wine_dxvk_install_remove(&[
                json!({ "settings": {}, "tool": "dxvk", "action": "backup" })
            ]),
            Err("wine_dxvk_install_remove:not-ready".to_string())
        );
        // The facts: the wine host facts, an online answer (true before the engine context exists),
        // and a public directory only when the shell was given one.
        let host = tools_host_value();
        let host = host.as_object().unwrap();
        assert!(host
            .keys()
            .all(|key| key == "publicDir" || key == "online" || key == "wine"));
        assert_eq!(host["online"], json!(true));
        assert!(host["wine"]["env"].is_object());
        assert!(tools_host().online);
    }

    #[test]
    fn get_alternative_wine_takes_no_argument_and_answers_not_ready_before_install() {
        assert!(wine_ctx().is_none());
        let router_ctx = Arc::new(crate::native_router::NativeCtx::for_tests(
            Arc::new(NoHost),
            None,
        ));
        for bad in [
            vec![json!("/SECRET-PATH")],
            vec![json!(null)],
            vec![json!({ "path": "/SECRET-PATH" })],
            vec![json!(1), json!(2)],
        ] {
            let error =
                tauri::async_runtime::block_on(get_alternative_wine(Arc::clone(&router_ctx), bad))
                    .unwrap_err();
            assert!(
                error.starts_with(crate::ipc_contract::IPC_INVALID_ARGS_MARKER),
                "{error}"
            );
            assert!(!error.contains("SECRET"), "{error}");
        }
        assert_eq!(
            tauri::async_runtime::block_on(get_alternative_wine(router_ctx, vec![])),
            Err("getAlternativeWine: not ready".to_string())
        );
    }

    #[test]
    fn the_discovery_host_is_the_shells_own_roots_path_and_settings() {
        let home = gamelib_testutil::FakeHome::new("wine-dispatch-host-");
        let wine = wine_over(&home, Arc::new(Recorded::default()));
        let steam = home.root().join("steam");
        std::fs::create_dir_all(steam.join("steamapps")).unwrap();
        let library = home.root().join("library");
        std::fs::create_dir_all(&library).unwrap();
        std::fs::write(
            steam.join("steamapps").join("libraryfolders.vdf"),
            format!(
                "\"libraryfolders\" {{ \"0\" {{ \"path\" \"{}\" }} }}",
                library.display()
            ),
        )
        .unwrap();
        let mut settings = Map::new();
        settings.insert(
            "defaultSteamPath".to_string(),
            json!(format!("{}'", steam.display())),
        );
        let libraries = steam_libraries(&settings);
        assert_eq!(libraries["exists"], json!(true));
        assert_eq!(libraries["parsed"], json!(true));
        assert_eq!(libraries["paths"], json!([library.display().to_string()]));

        // Nothing the renderer sent is in the host, and what the crate is given decodes strictly.
        let host = discovery_host(&wine, Some("/usr/bin".to_string()), None);
        let decoded: gamelib_wine::discovery::DiscoveryHost =
            serde_json::from_value(host.clone()).expect("the crate decodes the shell's host");
        assert_eq!(decoded.roots.home, home.root());
        assert_eq!(
            decoded.roots.config_path,
            home.root().join("userdata").join("config.json")
        );
        assert_eq!(
            decoded.roots.system_steam.as_deref(),
            Some(std::path::Path::new(SYSTEM_STEAM))
        );
        assert_eq!(decoded.path.as_deref(), Some("/usr/bin"));
        assert_eq!(decoded.scan_custom, None);
        assert!(decoded.steam_libraries.is_some());
        let scanned = discovery_host(&wine, None, Some(false));
        assert_eq!(scanned["scanCustom"], json!(false));
        assert!(scanned.get("path").is_none());
    }

    #[test]
    fn the_settings_entries_are_text_only() {
        assert_eq!(
            text_entries(Some(&json!(["/a", 1, null, "/b", {}]))),
            vec![json!("/a"), json!("/b")]
        );
        assert!(text_entries(Some(&json!("/a"))).is_empty());
        assert!(text_entries(None).is_empty());
    }

    #[test]
    fn get_alternative_wine_lists_the_tools_wines_over_a_real_context() {
        let home = gamelib_testutil::FakeHome::new("wine-dispatch-discover-");
        let wine = wine_over(&home, Arc::new(Recorded::default()));
        let bin = home
            .root()
            .join("tools")
            .join("wine")
            .join("Wine-Test")
            .join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join("wine"), b"").unwrap();
        // An empty PATH, so the developer's own wine is not found.
        let answer = tauri::async_runtime::block_on(get_alternative_wine_channel(
            Some(wine),
            vec![],
            Some(String::new()),
        ))
        .expect("discovery answers");
        let names: Vec<&str> = answer
            .as_array()
            .expect("a list")
            .iter()
            .filter_map(|wine| wine["name"].as_str())
            .collect();
        assert!(names.contains(&"Wine-Test"), "{answer}");
        assert!(!answer.to_string().contains("SECRET"));
    }

    #[test]
    fn the_discovery_arms_take_a_boolean_or_nothing_and_answer_not_ready_before_install() {
        assert!(wine_ctx().is_none());
        assert_eq!(
            rpc_wine_discover_alternatives(&[json!(true)]),
            Err("wine_discover_alternatives:not-ready".to_string())
        );
        assert_eq!(
            rpc_wine_discover_crossover(&[]),
            Err("wine_discover_crossover:not-ready".to_string())
        );
        for bad in [
            vec![],
            vec![json!("/SECRET-PATH")],
            vec![json!(null)],
            vec![json!({ "path": "/SECRET-PATH" })],
            vec![json!(true), json!(false)],
        ] {
            let error = rpc_wine_discover_alternatives(&bad).unwrap_err();
            assert_eq!(error, "wine_discover_alternatives:bad-args", "{bad:?}");
        }
        for bad in [vec![json!(true)], vec![json!("/SECRET-PATH")]] {
            assert_eq!(
                rpc_wine_discover_crossover(&bad),
                Err("wine_discover_crossover:bad-args".to_string()),
                "{bad:?}"
            );
        }
    }

    #[test]
    fn a_queue_key_is_a_runner_and_a_non_empty_app_name_and_a_rejection_never_echoes_the_value() {
        assert_eq!(
            parse_queue_key(&[json!("gog"), json!("1207658924")]),
            Ok(json!({ "runner": "gog", "appName": "1207658924" }))
        );
        for runner in ["legendary", "gog", "sideload", "nile", "steam"] {
            assert!(
                parse_queue_key(&[json!(runner), json!("a")]).is_ok(),
                "{runner}"
            );
        }
        let longest = "x".repeat(QUEUE_APP_NAME_MAX);
        assert!(parse_queue_key(&[json!("gog"), json!(longest)]).is_ok());
        let too_long = "x".repeat(QUEUE_APP_NAME_MAX + 1);
        for (bad, why) in [
            (vec![], ("(args)", "too_small")),
            (vec![json!("gog")], ("(args)", "too_small")),
            (
                vec![json!("gog"), json!("a"), json!("b")],
                ("(args)", "too_big"),
            ),
            (vec![json!(1), json!("a")], ("0", "invalid_type")),
            (vec![json!("epic"), json!("a")], ("0", "invalid_value")),
            (vec![json!("GOG"), json!("a")], ("0", "invalid_value")),
            (vec![json!("gog"), json!(1)], ("1", "invalid_type")),
            (vec![json!("gog"), json!("")], ("1", "too_small")),
            (vec![json!("gog"), json!(too_long)], ("1", "too_big")),
            (
                vec![json!({ "runner": "gog", "appName": "a" }), json!("a")],
                ("0", "invalid_type"),
            ),
        ] {
            assert_eq!(parse_queue_key(&bad), Err(why), "{bad:?}");
        }
    }

    #[test]
    fn the_queue_channels_answer_the_one_queue_over_a_real_context_and_refuse_before_install() {
        let home = gamelib_testutil::FakeHome::new("wine-dispatch-queue-");
        let wine = wine_over(&home, Arc::new(Recorded::default()));
        for (channel, op) in [
            ("winetricksQueueState", "wine_winetricks_queue_state"),
            (
                "winetricksCancelRemaining",
                "wine_winetricks_cancel_remaining",
            ),
        ] {
            let state = tauri::async_runtime::block_on(queue_channel(
                Some(Arc::clone(&wine)),
                channel,
                op,
                vec![json!("gog"), json!("app-1")],
            ))
            .unwrap_or_else(|error| panic!("{channel}: {error}"));
            assert_eq!(state["runner"], "gog", "{channel}: {state}");
            assert_eq!(state["appName"], "app-1", "{channel}: {state}");
            // A game that never applied has no run: the renderer reads an idle queue.
            assert_eq!(state["busy"], false, "{channel}: {state}");
            // Decode comes before the context is looked at, so a bad call is rejected the same way either side
            // of the install, and a good one before it is `not ready`.
            let bad = tauri::async_runtime::block_on(queue_channel(
                None,
                channel,
                op,
                vec![json!("epic"), json!("/SECRET-PATH")],
            ))
            .unwrap_err();
            assert!(bad.contains(IPC_INVALID_ARGS_MARKER), "{channel}: {bad}");
            assert!(!bad.contains("SECRET"), "{channel}: {bad}");
            assert_eq!(
                tauri::async_runtime::block_on(queue_channel(
                    None,
                    channel,
                    op,
                    vec![json!("gog"), json!("app-1")],
                )),
                Err(format!("{channel}: not ready"))
            );
        }
    }

    #[test]
    fn the_winetricks_apply_arm_takes_a_target_and_the_verbs_as_sent_and_answers_not_ready_before_install(
    ) {
        assert!(wine_ctx().is_none());
        let target = json!({ "runner": "gog", "appName": "1", "unavailable": "no-engine" });
        // Whatever the renderer sent as the verbs reaches the crate's guard, so it is not judged here.
        for verbs in [json!(["xact"]), json!("xact"), json!(null), json!([1, 2])] {
            assert_eq!(
                rpc_wine_winetricks_apply(&[target.clone(), verbs.clone()]),
                Err("wine_winetricks_apply:not-ready".to_string()),
                "{verbs}"
            );
        }
        for bad in [
            vec![],
            vec![target.clone()],
            vec![json!("gog"), json!(["xact"])],
            vec![json!(null), json!(["xact"])],
            vec![target.clone(), json!(["xact"]), json!({ "env": {} })],
        ] {
            assert_eq!(
                rpc_wine_winetricks_apply(&bad),
                Err("wine_winetricks_apply:bad-args".to_string()),
                "{bad:?}"
            );
        }
    }

    #[test]
    fn the_run_command_for_game_arm_takes_one_object_and_answers_not_ready_before_install() {
        assert!(wine_ctx().is_none());
        // The command's shape is the crate's guard to judge, so a malformed `commandParts` still reaches it.
        for command_parts in [json!(["winecfg"]), json!("winecfg"), json!([]), json!(null)] {
            let request = json!({
                "runner": "gog",
                "appName": "1",
                "unavailable": "no-engine",
                "commandParts": command_parts
            });
            assert_eq!(
                rpc_wine_run_command_for_game(&[request]),
                Err("wine_run_command_for_game:not-ready".to_string()),
                "{command_parts}"
            );
        }
        for bad in [
            vec![],
            vec![json!("winecfg")],
            vec![json!(null)],
            vec![json!({}), json!({})],
        ] {
            assert_eq!(
                rpc_wine_run_command_for_game(&bad),
                Err("wine_run_command_for_game:bad-args".to_string()),
                "{bad:?}"
            );
        }
    }

    #[test]
    fn the_tool_call_arm_takes_one_object_and_answers_not_ready_before_install() {
        assert!(wine_ctx().is_none());
        for tool in ["winecfg", "runExe", "anything"] {
            let request = json!({
                "tool": tool,
                "runner": "gog",
                "appName": "1",
                "unavailable": "no-engine"
            });
            assert_eq!(
                rpc_wine_tool_call(&[request]),
                Err("wine_tool_call:not-ready".to_string()),
                "{tool}"
            );
        }
        for bad in [
            vec![],
            vec![json!("winecfg")],
            vec![json!(null)],
            vec![json!({}), json!({})],
        ] {
            assert_eq!(
                rpc_wine_tool_call(&bad),
                Err("wine_tool_call:bad-args".to_string()),
                "{bad:?}"
            );
        }
    }

    #[test]
    fn the_catalog_arms_take_one_target_object_and_answer_not_ready_before_install() {
        assert!(wine_ctx().is_none());
        let target =
            json!({ "runner": "steam", "appName": "480", "unavailable": "not-own-bottle" });
        type Arm = fn(&[Value]) -> Result<Value, String>;
        let arms: [(&str, Arm); 3] = [
            ("wine_winetricks_available", rpc_wine_winetricks_available),
            ("wine_winetricks_installed", rpc_wine_winetricks_installed),
            (
                "wine_winetricks_installed",
                rpc_wine_winetricks_list_installed,
            ),
        ];
        for (op, arm) in arms {
            assert_eq!(
                arm(std::slice::from_ref(&target)),
                Err(format!("{op}:not-ready")),
                "{op}"
            );
            for bad in [
                vec![],
                vec![json!("steam"), json!("480")],
                vec![json!(null)],
                vec![target.clone(), target.clone()],
            ] {
                let error = arm(&bad).unwrap_err();
                assert!(error.ends_with(":bad-args"), "{op}: {bad:?}: {error}");
            }
        }
    }

    #[test]
    fn the_install_arm_answers_one_outcome_per_verb_and_a_verb_that_is_no_verb_never_reaches_the_crate(
    ) {
        assert!(wine_ctx().is_none());
        let target = json!({ "runner": "gog", "appName": "1", "unavailable": "no-engine" });
        // No verb has the shape of a real one, so no op is asked and no context is needed.
        assert_eq!(
            rpc_wine_winetricks_install(&[
                target.clone(),
                json!(["-q", "Not A Verb", "a; rm -rf /", "../x", ""])
            ]),
            Ok(json!(["failed", "failed", "failed", "failed", "failed"]))
        );
        assert_eq!(
            rpc_wine_winetricks_install(&[target.clone(), json!([])]),
            Ok(json!([]))
        );
        // A real verb goes to the crate, which is not there before the install.
        assert_eq!(
            rpc_wine_winetricks_install(&[target.clone(), json!(["vcrun2019"])]),
            Err("wine_winetricks_install:not-ready".to_string())
        );
        let too_many: Vec<Value> = (0..=INSTALL_VERBS_MAX).map(|_| json!("-x")).collect();
        for bad in [
            vec![],
            vec![target.clone()],
            vec![target.clone(), json!("vcrun2019")],
            vec![target.clone(), json!([1])],
            vec![target.clone(), json!(["a"]), json!(["b"])],
            vec![json!("gog"), json!(["vcrun2019"])],
            vec![target.clone(), Value::Array(too_many)],
        ] {
            assert_eq!(
                rpc_wine_winetricks_install(&bad),
                Err("wine_winetricks_install:bad-args".to_string()),
                "{bad:?}"
            );
        }
    }

    #[test]
    fn the_wine_slice_is_the_one_the_manifest_names() {
        assert_eq!(crate::native_router::WINE_SLICE, "wine");
    }
}
