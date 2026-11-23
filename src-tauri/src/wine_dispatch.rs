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
use std::sync::Mutex;

use gamelib_wine::ctx::WineCtx;
use gamelib_wine::manager::install::InstallSettings;
use gamelib_wine::runtimes::RuntimeName;
use gamelib_wine::CancellationToken;
use serde_json::Map;

/// The one context, set once by [`install`].
static WINE_CTX: OnceLock<Arc<WineCtx>> = OnceLock::new();

/// The installed context, or `None` before [`install`] (and in a unit test that built its own).
pub(crate) fn wine_ctx() -> Option<&'static Arc<WineCtx>> {
    WINE_CTX.get()
}

/// Builds the wine context from the engine context and stores it. A no-op when the engine context
/// was not installed (no home directory), so every wine op answers not-ready. A second call is
/// ignored (the first context stays).
pub(crate) fn install() {
    let Some(engine) = engine_dispatch::engine_ctx() else {
        return;
    };
    let runtime_path = engine.paths.tools_path.join("runtimes");
    let _ = WINE_CTX.set(Arc::new(WineCtx::new(Arc::clone(engine), runtime_path)));
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

/// The eleven keys of a `WineVersionInfo`, each with its shape and whether a feed may leave it out
/// (a Wine-Staging-macOS release has no checksum and a release with no matching asset has no
/// download or downsize; JSON drops an undefined key). The same bounds the TS zod carried.
const RELEASE_FIELDS: &[(&str, Field, bool)] = &[
    ("version", Field::NonEmpty(1024), false),
    ("type", Field::Type, false),
    ("date", Field::Text(256), false),
    ("download", Field::Text(8192), true),
    ("downsize", Field::Number, true),
    ("disksize", Field::Number, false),
    ("checksum", Field::Text(1024), true),
    ("release_notes_link", Field::Text(8192), false),
    ("isInstalled", Field::Bool, false),
    ("hasUpdate", Field::Bool, false),
    ("installDir", Field::Text(4096), false),
];

/// Decodes the one `WineVersionInfo` argument of `installWineVersion` and `removeWineVersion`: a
/// strict object of exactly the eleven keys (an unknown key is rejected, T-87-67). The object is
/// handed on as it came; the crate decodes what it reads again. Every rejection is a fixed path and
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

/// The `wine_releases_info_ready` `rustInvoke` arm (the `releasesInfoReady` listener's shim): one object,
/// of which the crate reads the five feed stamps. Unbounded in the sidecar, like the refresh it may start.
pub(crate) fn rpc_wine_releases_info_ready(args: &[Value]) -> Result<Value, String> {
    WineReleasesInfoReadyArgs::from_args(args)?;
    if !matches!(args, [Value::Object(_)]) {
        return Err("wine_releases_info_ready:bad-args".to_string());
    }
    rpc_wine_op(wine_ctx(), "wine_releases_info_ready", args)
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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
                vec![without("isInstalled")],
                ("0.isInstalled", "invalid_type"),
            ),
            (
                vec![with("hasUpdate", json!("no"))],
                ("0.hasUpdate", "invalid_type"),
            ),
            (
                vec![without("installDir")],
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
        let root = home.root().to_path_buf();
        let engine = gamelib_engine::ctx::EngineCtx::new(
            Arc::new(gamelib_store::host::StoreHost::new()),
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
        .with_fetch(Arc::new(WaitsForCancel))
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

    #[test]
    fn the_wine_slice_is_the_one_the_manifest_names() {
        assert_eq!(crate::native_router::WINE_SLICE, "wine");
    }
}
