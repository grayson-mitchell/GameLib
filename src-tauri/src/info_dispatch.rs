//! The shell's side of the leaf information services (Phase 86, SVC-01): the one [`InfoCtx`], the
//! `info_*` rustInvoke handlers and the `info` native channels, over the Tauri-free `gamelib-info`
//! crate.
//!
//! D-20: one `Arc<InfoCtx>` is built in `run_setup` right after the store host opens, from the
//! shell's own paths, `SystemClock`, the platform, the app version, `ReqwestHttp` and the
//! process-wide `gamelib_core::shutdown::global()`. Its secret source is the Keychain-backed one from
//! `info_secrets` (86-14, D-19). Nothing here spawns a process or waits without a bound: every op
//! runs inside the crate's `guarded` wrapper (a shutdown registrant raced against the token).
//!
//! D-08: a change Rust makes to the recent-games list reaches the renderer (`recentGamesChanged`
//! through the shell's `FrontendEmitter`) and the tray (`update_tray_recent_games` on the main
//! thread) from [`TrayRecentSink`], not from the sidecar relay.
//!
//! T-28-04 / T-86-15: nothing here formats an argument into a log line or an error.

use super::*;

use std::path::Path;

use gamelib_core::clock::SystemClock;
use gamelib_core::emitter::FrontendEmitter;
use gamelib_info::ctx::{InfoCtx, InfoLog, InfoPaths, Platform};
use gamelib_info::http::ReqwestHttp;
use gamelib_info::recent::RecentSink;
use gamelib_store::json::Json;

/// The frontend-message channel the renderer listens on for the recent-games list.
const RECENT_GAMES_CHANGED: &str = "recentGamesChanged";

/// The one context, set once by [`install`].
static INFO_CTX: OnceLock<Arc<InfoCtx>> = OnceLock::new();

/// The installed context, or `None` before [`install`] (and in a unit test that built its own).
pub(crate) fn info_ctx() -> Option<&'static Arc<InfoCtx>> {
    INFO_CTX.get()
}

/// The platform the crate is told about (it never asks the OS itself).
fn platform() -> Platform {
    if cfg!(target_os = "macos") {
        Platform::Mac
    } else if cfg!(target_os = "windows") {
        Platform::Windows
    } else {
        Platform::Linux
    }
}

/// Recent-games changes, pushed the way the sidecar's relay pushed them: the renderer gets the
/// list through the emitter, and the tray menu is rebuilt from it on the main thread.
///
/// The tray update and the menu limit are injected so a unit test needs no AppHandle and never
/// reads the operator's tray settings.
pub(crate) struct TrayRecentSink {
    emitter: Arc<dyn FrontendEmitter>,
    update_tray: Arc<dyn Fn(Vec<TrayRecentGame>) + Send + Sync>,
    limit: Arc<dyn Fn() -> usize + Send + Sync>,
}

impl TrayRecentSink {
    pub(crate) fn new(
        emitter: Arc<dyn FrontendEmitter>,
        update_tray: Arc<dyn Fn(Vec<TrayRecentGame>) + Send + Sync>,
        limit: Arc<dyn Fn() -> usize + Send + Sync>,
    ) -> Self {
        Self {
            emitter,
            update_tray,
            limit,
        }
    }

    /// The production sink: the shell's emitter, and `update_tray_recent_games` hopped to the main
    /// thread (menu construction wants it on macOS; failure to schedule is logged, never fatal).
    pub(crate) fn for_app(app: &AppHandle) -> Self {
        let tray_app = app.clone();
        Self::new(
            Arc::new(steampoll_dispatch::TauriFrontendEmitter(app.clone())),
            Arc::new(move |games| {
                let menu_app = tray_app.clone();
                if let Err(e) =
                    tray_app.run_on_main_thread(move || update_tray_recent_games(&menu_app, games))
                {
                    shell_eprintln!(
                        "[shell] WARN: tray recent-games rebuild could not be scheduled ({e}) -- tray menu left as-is"
                    );
                }
            }),
            Arc::new(|| tray_settings().max_recent_games),
        )
    }
}

impl RecentSink for TrayRecentSink {
    fn changed(&self, list: &Json) {
        let value = list.to_value();
        let games = tray_recent_games_from_value(&value, (self.limit)());
        self.emitter.emit(RECENT_GAMES_CHANGED, vec![value]);
        (self.update_tray)(games);
    }
}

/// The crate's diagnostic lines (86-18), into `gamelib.log`. A line is fixed text plus a page number, a
/// status code or a transport category, never a URL, a key or a token (see [`InfoLog`]), so it is a
/// category in the sense of the shell's log gate.
struct ShellInfoLog;

impl InfoLog for ShellInfoLog {
    fn line(&self, text: &str) {
        shell_log(text);
    }
}

/// The IsThereAnyDeal key compiled into this build (D-25): `option_env!("ITAD_API_KEY")`, with
/// `cargo:rerun-if-env-changed=ITAD_API_KEY` in build.rs so a changed key rebuilds the shell. A
/// release build gets it from the workflow's secret; a dev or PR build has none.
fn baked_itad_key() -> Option<String> {
    option_env!("ITAD_API_KEY")
        .filter(|key| !key.trim().is_empty())
        .map(str::to_owned)
}

/// The key `GAMELIB_ITAD_API_KEY` carries, read once at boot (the crate reads no environment).
fn env_itad_key() -> Option<String> {
    std::env::var("GAMELIB_ITAD_API_KEY")
        .ok()
        .filter(|key| !key.trim().is_empty())
}

/// The built-in key's source as a word, for the one boot log line: the env key wins over the baked
/// one, as in `resolveBuiltInItadKey`. A key never reaches the line (T-86-27). The user's own key
/// lives in the keyring and is not read at boot, so it is not part of this.
fn itad_key_source_word(env: &Option<String>, baked: &Option<String>) -> &'static str {
    if env.is_some() {
        "env"
    } else if baked.is_some() {
        "baked"
    } else {
        "none"
    }
}

/// Builds the one context and stores it. Called from `run_setup` after the store host opened and
/// before the sidecar is spawned. A second call is ignored (the first context stays).
pub(crate) fn install(app: &AppHandle, user_data: &Path) {
    let mut ctx = InfoCtx::new(
        Arc::clone(store_boot::host()),
        Arc::new(SystemClock),
        platform(),
        InfoPaths {
            // `user_data` is both the user-data directory and the app folder (store_boot).
            app_folder: user_data.to_path_buf(),
            user_data: user_data.to_path_buf(),
            temp: std::env::temp_dir(),
            public_dir: app.path().resource_dir().ok(),
        },
        native_handlers::app_version().to_string(),
        gamelib_core::shutdown::global().clone(),
        Arc::new(ReqwestHttp::new()),
    );
    ctx.recent_sink = Some(Arc::new(TrayRecentSink::for_app(app)));
    ctx.secrets = Some(info_secrets::secret_source());
    ctx.log = Some(Arc::new(ShellInfoLog));
    let (baked, env) = (baked_itad_key(), env_itad_key());
    shell_log(&format!(
        "itad key source: {}",
        itad_key_source_word(&env, &baked)
    ));
    ctx.itad_baked_key = baked;
    ctx.itad_env_key = env;
    if INFO_CTX.set(Arc::new(ctx)).is_ok() {
        start_sgdb_migration();
    }
}

/// The one-line report of the boot migration: the outcome word and nothing else (T-86-31).
fn sgdb_migration_line(word: &str) -> String {
    format!("steamgrid key migration: {word}")
}

/// Starts the one-time move of an old plaintext SteamGridDB key into the Keychain as bounded boot
/// work (D-26): in the background on the crate's runtime, holding the `info-sgdb-migrate` shutdown
/// registrant, abandoned after [`gamelib_info::SGDB_MIGRATION_BOUND`], and logging one line with the
/// outcome word only. It replaces the sidecar's `migrateSteamGridDbApiKey`, which is deleted in the
/// same commit so the two never race. A profile with no plaintext key reads no Keychain at all.
fn start_sgdb_migration() {
    let Some(ctx) = info_ctx() else {
        return;
    };
    let started = gamelib_info::spawn_sgdb_migration(
        Arc::clone(ctx),
        gamelib_info::SGDB_MIGRATION_BOUND,
        |word| shell_log(&sgdb_migration_line(word)),
    );
    if started.is_err() {
        // The crate's error names only a runtime that could not be built; the line carries a word.
        shell_log(&sgdb_migration_line("not-started"));
    }
}

/// The installed context for op `op`, or the fixed "not ready" answer.
fn installed(op: &str) -> Result<&'static InfoCtx, String> {
    info_ctx()
        .map(|ctx| ctx.as_ref())
        .ok_or_else(|| format!("{op}:not-ready"))
}

/// `info_recent_add`: validated by the generated args struct, then the crate (which validates again
/// with its own `deny_unknown_fields` struct and bounds `appName`).
fn recent_add_with(ctx: &InfoCtx, args: &[Value]) -> Result<Value, String> {
    InfoRecentAddArgs::from_args(args)?;
    gamelib_info::dispatch_sync("info_recent_add", args, ctx)
}

fn recent_remove_with(ctx: &InfoCtx, args: &[Value]) -> Result<Value, String> {
    InfoRecentRemoveArgs::from_args(args)?;
    gamelib_info::dispatch_sync("info_recent_remove", args, ctx)
}

/// Handlers run on the `rustInvoke` worker thread (never a tokio thread), so the crate's sync
/// facade, which blocks on its own runtime, is legal to call.
pub(crate) fn rpc_info_recent_add(args: &[Value]) -> Result<Value, String> {
    recent_add_with(installed("info_recent_add")?, args)
}

pub(crate) fn rpc_info_recent_remove(args: &[Value]) -> Result<Value, String> {
    recent_remove_with(installed("info_recent_remove")?, args)
}

/// The `info_overrides_*` ops: validated by the generated args struct, then the crate (which
/// validates again with its own `deny_unknown_fields` structs and bounds `appName`). The set and
/// attach ops are reachable only from the TS shims 86-11 adds (D-29 row 7).
fn overrides_get_with(ctx: &InfoCtx, args: &[Value]) -> Result<Value, String> {
    InfoOverridesGetArgs::from_args(args)?;
    gamelib_info::dispatch_sync("info_overrides_get", args, ctx)
}

fn overrides_get_all_with(ctx: &InfoCtx, args: &[Value]) -> Result<Value, String> {
    InfoOverridesGetAllArgs::from_args(args)?;
    gamelib_info::dispatch_sync("info_overrides_get_all", args, ctx)
}

fn overrides_set_with(ctx: &InfoCtx, args: &[Value]) -> Result<Value, String> {
    InfoOverridesSetArgs::from_args(args)?;
    gamelib_info::dispatch_sync("info_overrides_set", args, ctx)
}

fn overrides_attach_with(ctx: &InfoCtx, args: &[Value]) -> Result<Value, String> {
    InfoOverridesAttachArgs::from_args(args)?;
    gamelib_info::dispatch_sync("info_overrides_attach", args, ctx)
}

pub(crate) fn rpc_info_overrides_get(args: &[Value]) -> Result<Value, String> {
    overrides_get_with(installed("info_overrides_get")?, args)
}

pub(crate) fn rpc_info_overrides_get_all(args: &[Value]) -> Result<Value, String> {
    overrides_get_all_with(installed("info_overrides_get_all")?, args)
}

pub(crate) fn rpc_info_overrides_set(args: &[Value]) -> Result<Value, String> {
    overrides_set_with(installed("info_overrides_set")?, args)
}

pub(crate) fn rpc_info_overrides_attach(args: &[Value]) -> Result<Value, String> {
    overrides_attach_with(installed("info_overrides_attach")?, args)
}

/// The `info_anticheat_*` ops: validated by the generated args struct, then the crate (which
/// validates again with its own `deny_unknown_fields` structs). They are reachable only from the TS
/// shims 86-13 adds (D-29 row 7): `info` serves the renderer's lookup natively, while the launcher's
/// lookup and the `releasesInfoReady` listener's status-then-download go through rustInvoke.
fn anticheat_info_with(ctx: &InfoCtx, args: &[Value]) -> Result<Value, String> {
    InfoAnticheatInfoArgs::from_args(args)?;
    gamelib_info::dispatch_sync("info_anticheat_info", args, ctx)
}

fn anticheat_status_with(ctx: &InfoCtx, args: &[Value]) -> Result<Value, String> {
    InfoAnticheatStatusArgs::from_args(args)?;
    gamelib_info::dispatch_sync("info_anticheat_status", args, ctx)
}

fn anticheat_download_with(ctx: &InfoCtx, args: &[Value]) -> Result<Value, String> {
    InfoAnticheatDownloadArgs::from_args(args)?;
    gamelib_info::dispatch_sync("info_anticheat_download", args, ctx)
}

pub(crate) fn rpc_info_anticheat_info(args: &[Value]) -> Result<Value, String> {
    anticheat_info_with(installed("info_anticheat_info")?, args)
}

pub(crate) fn rpc_info_anticheat_status(args: &[Value]) -> Result<Value, String> {
    anticheat_status_with(installed("info_anticheat_status")?, args)
}

pub(crate) fn rpc_info_anticheat_download(args: &[Value]) -> Result<Value, String> {
    anticheat_download_with(installed("info_anticheat_download")?, args)
}

/// `info_gog_discounts`: validated by the generated args struct, then the crate (which validates again
/// with its own `deny_unknown_fields` structs and bounds the locale). The one caller is the TS resolver
/// `getGogDiscounts` (86-18, D-24), which collects the GOG token. Nothing here formats an argument:
/// the token is in `args` and stays there.
fn gog_discounts_with(ctx: &InfoCtx, args: &[Value]) -> Result<Value, String> {
    InfoGogDiscountsArgs::from_args(args)?;
    gamelib_info::dispatch_sync("info_gog_discounts", args, ctx)
}

pub(crate) fn rpc_info_gog_discounts(args: &[Value]) -> Result<Value, String> {
    gog_discounts_with(installed("info_gog_discounts")?, args)
}

/// `info_crossover_rating_map`: validated by the generated args struct, then the crate (which validates
/// again: its own `deny_unknown_fields` structs, the 20000-game bound and the runner names). The one
/// caller is the TS resolver `getCrossoverIndex` (86-19, D-24), which gathers the library's games.
fn crossover_rating_map_with(ctx: &InfoCtx, args: &[Value]) -> Result<Value, String> {
    InfoCrossoverRatingMapArgs::from_args(args)?;
    gamelib_info::dispatch_sync("info_crossover_rating_map", args, ctx)
}

pub(crate) fn rpc_info_crossover_rating_map(args: &[Value]) -> Result<Value, String> {
    crossover_rating_map_with(installed("info_crossover_rating_map")?, args)
}

/// What a rejected `removeRecent` argument looks like: the JSON path and the zod-vocabulary code.
/// Fixed literals only, never the renderer's value (T-86-15).
type Rejection = (&'static str, &'static str);

/// Decodes the one `appName` argument of `removeRecent`: exactly one string of 1 to
/// [`gamelib_info::recent::APP_NAME_MAX_UTF16`] UTF-16 code units.
fn parse_remove_recent(args: &[Value]) -> Result<&str, Rejection> {
    let [arg] = args else {
        return Err(("(args)", "invalid_type"));
    };
    let Value::String(name) = arg else {
        return Err(("0", "invalid_type"));
    };
    if name.is_empty() {
        return Err(("0", "too_small"));
    }
    if name.encode_utf16().count() > gamelib_info::recent::APP_NAME_MAX_UTF16 {
        return Err(("0", "too_big"));
    }
    Ok(name)
}

/// The invalid-args error for a rejected `removeRecent` argument.
fn remove_recent_rejected((path, code): Rejection) -> String {
    invalid_args("removeRecent", &[path], &[code])
}

/// Runs `op` over `args` on the blocking pool. The crate's own async `dispatch` is driven with
/// `block_on` there (never `dispatch_sync`, which refuses a thread inside a runtime), so a file read
/// or write stays off the async workers and the op still holds its shutdown registrant.
async fn run_info_op(
    info: Arc<InfoCtx>,
    op: &'static str,
    args: Vec<Value>,
    failed: &'static str,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        tauri::async_runtime::block_on(gamelib_info::dispatch(op, &args, &info))
    })
    .await
    .map_err(|_| failed.to_string())?
}

/// Runs `info_recent_remove` for an already validated `app_name`.
async fn run_remove_recent(info: Arc<InfoCtx>, app_name: String) -> Result<Value, String> {
    run_info_op(
        info,
        "info_recent_remove",
        vec![serde_json::json!({ "appName": app_name })],
        "removeRecent: the removal did not finish",
    )
    .await
}

/// The native `removeRecent` handler (slice `info`, D-17). The arguments are validated first, so a
/// bad call is rejected the same way before and after the context is installed. An error is a fixed
/// literal (the crate's `<op>:<category>` or the invalid-args marker), never the renderer's string.
pub(crate) fn remove_recent(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(async move {
        let app_name = parse_remove_recent(&args)
            .map_err(remove_recent_rejected)?
            .to_string();
        let info = info_ctx().ok_or_else(|| "removeRecent: not ready".to_string())?;
        run_remove_recent(Arc::clone(info), app_name).await
    })
}

/// The longest `appName` `getGameMetadataOverride` accepts, in UTF-16 code units.
const OVERRIDE_APP_NAME_MAX_UTF16: usize = 256;

/// Decodes the one `appName` argument of `getGameMetadataOverride`: exactly one string of 1 to
/// [`OVERRIDE_APP_NAME_MAX_UTF16`] UTF-16 code units.
fn parse_get_game_metadata_override(args: &[Value]) -> Result<&str, Rejection> {
    let [arg] = args else {
        return Err(("(args)", "invalid_type"));
    };
    let Value::String(name) = arg else {
        return Err(("0", "invalid_type"));
    };
    if name.is_empty() {
        return Err(("0", "too_small"));
    }
    if name.encode_utf16().count() > OVERRIDE_APP_NAME_MAX_UTF16 {
        return Err(("0", "too_big"));
    }
    Ok(name)
}

/// `getAllGameOverrides` takes no argument.
fn parse_get_all_game_overrides(args: &[Value]) -> Result<(), Rejection> {
    if args.is_empty() {
        Ok(())
    } else {
        Err(("(args)", "too_big"))
    }
}

/// The native `getGameMetadataOverride` handler (slice `info`, D-17): the stored override of one
/// game, or `null`. Validated before the context is looked at, like `removeRecent`.
pub(crate) fn get_game_metadata_override(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(async move {
        let app_name = parse_get_game_metadata_override(&args)
            .map_err(|(path, code)| invalid_args("getGameMetadataOverride", &[path], &[code]))?
            .to_string();
        let info = info_ctx().ok_or_else(|| "getGameMetadataOverride: not ready".to_string())?;
        run_info_op(
            Arc::clone(info),
            "info_overrides_get",
            vec![serde_json::json!({ "appName": app_name })],
            "getGameMetadataOverride: the read did not finish",
        )
        .await
    })
}

/// The native `getAllGameOverrides` handler (slice `info`, D-17): every stored override, keyed by
/// game.
pub(crate) fn get_all_game_overrides(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(async move {
        parse_get_all_game_overrides(&args)
            .map_err(|(path, code)| invalid_args("getAllGameOverrides", &[path], &[code]))?;
        let info = info_ctx().ok_or_else(|| "getAllGameOverrides: not ready".to_string())?;
        run_info_op(
            Arc::clone(info),
            "info_overrides_get_all",
            Vec::new(),
            "getAllGameOverrides: the read did not finish",
        )
        .await
    })
}

/// Decodes the one `appNamespace` argument of `getAnticheatInfo`: exactly one string of 0 to
/// [`gamelib_info::anticheat::NAMESPACE_MAX_UTF16`] UTF-16 code units (an empty namespace is a valid
/// lookup: the crate answers the first entry with an Epic namespace, as the TS did).
fn parse_get_anticheat_info(args: &[Value]) -> Result<&str, Rejection> {
    let [arg] = args else {
        return Err(("(args)", "invalid_type"));
    };
    let Value::String(namespace) = arg else {
        return Err(("0", "invalid_type"));
    };
    if namespace.encode_utf16().count() > gamelib_info::anticheat::NAMESPACE_MAX_UTF16 {
        return Err(("0", "too_big"));
    }
    Ok(namespace)
}

/// The native `getAnticheatInfo` handler (slice `info`, D-17): the entry of the AreWeAntiCheatYet
/// data file for an Epic namespace, or `null`. Validated before the context is looked at, like
/// `removeRecent`.
pub(crate) fn get_anticheat_info(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(async move {
        let namespace = parse_get_anticheat_info(&args)
            .map_err(|(path, code)| invalid_args("getAnticheatInfo", &[path], &[code]))?
            .to_string();
        let info = info_ctx().ok_or_else(|| "getAnticheatInfo: not ready".to_string())?;
        run_info_op(
            Arc::clone(info),
            "info_anticheat_info",
            vec![serde_json::json!({ "appNamespace": namespace })],
            "getAnticheatInfo: the lookup did not finish",
        )
        .await
    })
}

/// Decodes the one `query` argument of `steamgriddb.searchGame`: exactly one string of 0 to
/// [`gamelib_info::steamgrid::TEXT_MAX_UTF16`] UTF-16 code units (the zod bound it replaces).
fn parse_steamgrid_search(args: &[Value]) -> Result<&str, Rejection> {
    let [arg] = args else {
        return Err(("(args)", "invalid_type"));
    };
    let Value::String(query) = arg else {
        return Err(("0", "invalid_type"));
    };
    if query.encode_utf16().count() > gamelib_info::steamgrid::TEXT_MAX_UTF16 {
        return Err(("0", "too_big"));
    }
    Ok(query)
}

/// The native `steamgriddb.searchGame` handler (slice `info`, D-17): `[{id, name}]` for a title, `[]`
/// when no key is stored. Validated before the context is looked at, like `removeRecent`. A crate
/// error is a fixed `<op>:<category>` or the text the TS rethrow carried (`Request failed with
/// status code 401`); the key and the request URL are never in it (T-86-31).
pub(crate) fn steamgrid_search(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(async move {
        let query = parse_steamgrid_search(&args)
            .map_err(|(path, code)| invalid_args("steamgriddb.searchGame", &[path], &[code]))?
            .to_string();
        let info = info_ctx().ok_or_else(|| "steamgriddb.searchGame: not ready".to_string())?;
        run_info_op(
            Arc::clone(info),
            "info_steamgrid_search",
            vec![serde_json::json!({ "query": query })],
            "steamgriddb.searchGame: the search did not finish",
        )
        .await
    })
}

/// `steamgriddb.hasApiKey` takes no argument.
fn parse_steamgrid_has_key(args: &[Value]) -> Result<(), Rejection> {
    if args.is_empty() {
        Ok(())
    } else {
        Err(("(args)", "too_big"))
    }
}

/// The native `steamgriddb.hasApiKey` handler (slice `info`, D-17): whether a key is stored.
pub(crate) fn steamgrid_has_key(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(async move {
        parse_steamgrid_has_key(&args)
            .map_err(|(path, code)| invalid_args("steamgriddb.hasApiKey", &[path], &[code]))?;
        let info = info_ctx().ok_or_else(|| "steamgriddb.hasApiKey: not ready".to_string())?;
        run_info_op(
            Arc::clone(info),
            "info_steamgrid_has_key",
            vec![serde_json::json!({})],
            "steamgriddb.hasApiKey: the check did not finish",
        )
        .await
    })
}

/// Decodes the one `key` argument of `steamgriddb.setApiKey`: exactly one string of 0 to
/// [`gamelib_info::steamgrid::TEXT_MAX_UTF16`] UTF-16 code units (an empty one clears the key).
fn parse_steamgrid_set_key(args: &[Value]) -> Result<&str, Rejection> {
    // The same shape and bound as the search term; the value is never echoed into a rejection.
    parse_steamgrid_search(args)
}

/// The native `steamgriddb.setApiKey` handler (slice `info`, D-17): stores the trimmed key in the
/// `steamgrid-api-key` slot, or clears it for an empty value. The key is never in a log line, an
/// error or a rejection (T-86-31, T-86-33).
pub(crate) fn steamgrid_set_key(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(async move {
        let key = parse_steamgrid_set_key(&args)
            .map_err(|(path, code)| invalid_args("steamgriddb.setApiKey", &[path], &[code]))?
            .to_string();
        let info = info_ctx().ok_or_else(|| "steamgriddb.setApiKey: not ready".to_string())?;
        run_info_op(
            Arc::clone(info),
            "info_steamgrid_set_key",
            vec![serde_json::json!({ "key": key })],
            "steamgriddb.setApiKey: the write did not finish",
        )
        .await
    })
}

/// Checks one `styles` or `dimensions` list: when present, an array of at most
/// [`gamelib_info::steamgrid::LIST_MAX_ITEMS`] strings of at most
/// [`gamelib_info::steamgrid::LIST_ITEM_MAX_UTF16`] UTF-16 code units.
fn check_steamgrid_list(value: Option<&Value>, path: &'static str) -> Result<(), Rejection> {
    let Some(value) = value else {
        return Ok(());
    };
    let Value::Array(items) = value else {
        return Err((path, "invalid_type"));
    };
    if items.len() > gamelib_info::steamgrid::LIST_MAX_ITEMS {
        return Err((path, "too_big"));
    }
    for item in items {
        let Value::String(text) = item else {
            return Err((path, "invalid_type"));
        };
        if text.encode_utf16().count() > gamelib_info::steamgrid::LIST_ITEM_MAX_UTF16 {
            return Err((path, "too_big"));
        }
    }
    Ok(())
}

/// Decodes the one object argument of `steamgriddb.getGrids` and `steamgriddb.getHeroes`: a strict
/// `{ gameId, styles?, dimensions? }` with `gameId` a positive integer. The object is handed on as
/// it came; the crate decodes it again strictly. Every rejection is a fixed path and code, never
/// the renderer's value.
fn parse_steamgrid_artwork(args: &[Value]) -> Result<&Value, Rejection> {
    let [arg] = args else {
        return Err(("(args)", "invalid_type"));
    };
    let Value::Object(object) = arg else {
        return Err(("0", "invalid_type"));
    };
    if object
        .keys()
        .any(|key| !matches!(key.as_str(), "gameId" | "styles" | "dimensions"))
    {
        return Err(("0", "unrecognized_keys"));
    }
    match object.get("gameId") {
        Some(Value::Number(n)) => {
            if n.as_u64() == Some(0) || n.as_i64().is_some_and(|v| v < 0) {
                return Err(("0.gameId", "too_small"));
            }
            if n.as_u64().is_none() && n.as_i64().is_none() {
                return Err(("0.gameId", "invalid_type"));
            }
        }
        _ => return Err(("0.gameId", "invalid_type")),
    }
    check_steamgrid_list(object.get("styles"), "0.styles")?;
    check_steamgrid_list(object.get("dimensions"), "0.dimensions")?;
    Ok(arg)
}

/// One artwork channel: validates first, then runs `op` on the blocking pool.
fn steamgrid_artwork(
    channel: &'static str,
    op: &'static str,
    failed: &'static str,
    args: Vec<Value>,
) -> NativeFuture {
    Box::pin(async move {
        let request = parse_steamgrid_artwork(&args)
            .map_err(|(path, code)| invalid_args(channel, &[path], &[code]))?
            .clone();
        let info = info_ctx().ok_or_else(|| format!("{channel}: not ready"))?;
        run_info_op(Arc::clone(info), op, vec![request], failed).await
    })
}

/// The native `steamgriddb.getGrids` handler (slice `info`, D-17): `[{id, url, thumb}]`, `[]` when no
/// key is stored.
pub(crate) fn steamgrid_grids(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    steamgrid_artwork(
        "steamgriddb.getGrids",
        "info_steamgrid_grids",
        "steamgriddb.getGrids: the request did not finish",
        args,
    )
}

/// The native `steamgriddb.getHeroes` handler (slice `info`, D-17): `[{id, url, thumb}]`, `[]` when
/// no key is stored.
pub(crate) fn steamgrid_heroes(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    steamgrid_artwork(
        "steamgriddb.getHeroes",
        "info_steamgrid_heroes",
        "steamgriddb.getHeroes: the request did not finish",
        args,
    )
}

/// The fixed code word of a `[storeSearch:<code>]` error, or `None` for any other text. The rest of
/// the message (an endpoint label and a status) is never read here.
fn itad_error_code(message: &str) -> Option<&'static str> {
    [
        ("[storeSearch:rateLimited]", "rateLimited"),
        ("[storeSearch:notConfigured]", "notConfigured"),
        ("[storeSearch:provider]", "provider"),
    ]
    .into_iter()
    .find_map(|(marker, word)| message.starts_with(marker).then_some(word))
}

/// Runs one ITAD op on the blocking pool and logs what the TS handler logged, as categories only
/// (T-86-35): a failed op as `itad <channel> failed (<code>)` with the marker string (an endpoint and a
/// status, never a key or a URL) on stderr alone, and the first time ITAD refuses the user's key as one
/// line. `channel` is the renderer-facing name.
async fn run_itad_op(
    info: &Arc<InfoCtx>,
    channel: &'static str,
    op: &'static str,
    args: Vec<Value>,
    failed: &'static str,
) -> Result<Value, String> {
    let was_rejected = info.itad_key.is_rejected();
    let result = run_info_op(Arc::clone(info), op, args, failed).await;
    if !was_rejected && info.itad_key.is_rejected() {
        shell_log("itad user key rejected; using the built-in key");
    }
    if let Err(message) = &result {
        if let Some(code) = itad_error_code(message) {
            shell_log_detail(&format!("itad {channel} failed ({code})"), message);
        }
    }
    result
}

/// The optional `country` argument at `index` (1): absent or null, else a string of 0 to
/// [`gamelib_info::itad::COUNTRY_MAX_UTF16`] UTF-16 code units (the zod `nullish` bound).
fn parse_itad_country(country: Option<&Value>) -> Result<Option<&str>, Rejection> {
    match country {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(country)) => {
            if country.encode_utf16().count() > gamelib_info::itad::COUNTRY_MAX_UTF16 {
                return Err(("1", "too_big"));
            }
            Ok(Some(country.as_str()))
        }
        Some(_) => Err(("1", "invalid_type")),
    }
}

/// Splits the positional arguments of a one-then-optional-country call: one or two, never none and
/// never three.
fn first_and_country(args: &[Value]) -> Result<(&Value, Option<&Value>), Rejection> {
    match args {
        [] => Err(("(args)", "too_small")),
        [first] => Ok((first, None)),
        [first, country] => Ok((first, Some(country))),
        _ => Err(("(args)", "too_big")),
    }
}

/// Decodes the arguments of `searchStores`: a search term of 0 to
/// [`gamelib_info::itad::QUERY_MAX_UTF16`] UTF-16 code units and an optional country, the zod bounds
/// they replace. Fixed literals only, never the renderer's value.
fn parse_search_stores(args: &[Value]) -> Result<(&str, Option<&str>), Rejection> {
    let (query, country) = first_and_country(args)?;
    let Value::String(query) = query else {
        return Err(("0", "invalid_type"));
    };
    if query.encode_utf16().count() > gamelib_info::itad::QUERY_MAX_UTF16 {
        return Err(("0", "too_big"));
    }
    Ok((query, parse_itad_country(country)?))
}

/// The native `searchStores` handler (slice `info`, D-17): rows for a title, one per game from its
/// cheapest deal, with the TS caching, rate-limit and stale-serve behaviour. Validated before the
/// context is looked at. A failure is the fixed `[storeSearch:<code>] <endpoint> <status>` string the
/// renderer turns into its provider-failed state; the key is never in it (T-86-35).
pub(crate) fn search_stores(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(async move {
        let (query, country) = parse_search_stores(&args)
            .map_err(|(path, code)| invalid_args("searchStores", &[path], &[code]))?;
        let op_args = vec![serde_json::json!({ "query": query, "country": country })];
        let info = info_ctx().ok_or_else(|| "searchStores: not ready".to_string())?;
        run_itad_op(
            info,
            "searchStores",
            "info_itad_search",
            op_args,
            "searchStores: the search did not finish",
        )
        .await
    })
}

/// Whether `text` is a game id the zod schema accepted: 1 to 64 characters of `[0-9a-fA-F-]`. The
/// shape blocks dots and path separators before the cache layer (T-47-25).
fn is_deals_game_id(text: &str) -> bool {
    (1..=gamelib_info::itad::GAME_ID_MAX_UTF16).contains(&text.len())
        && text.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-')
}

/// Decodes the arguments of `getStoreSearchDeals`: an ITAD game id and an optional country.
fn parse_get_store_search_deals(args: &[Value]) -> Result<(&str, Option<&str>), Rejection> {
    let (game_id, country) = first_and_country(args)?;
    let Value::String(game_id) = game_id else {
        return Err(("0", "invalid_type"));
    };
    if !is_deals_game_id(game_id) {
        return Err(("0", "invalid_string"));
    }
    Ok((game_id, parse_itad_country(country)?))
}

/// The native `getStoreSearchDeals` handler (slice `info`, D-17): the deals for one ITAD game id,
/// cheapest first, from the cache when fresh. Validated before the context is looked at.
pub(crate) fn get_store_search_deals(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(async move {
        let (game_id, country) = parse_get_store_search_deals(&args)
            .map_err(|(path, code)| invalid_args("getStoreSearchDeals", &[path], &[code]))?;
        let op_args = vec![serde_json::json!({ "gameId": game_id, "country": country })];
        let info = info_ctx().ok_or_else(|| "getStoreSearchDeals: not ready".to_string())?;
        run_itad_op(
            info,
            "getStoreSearchDeals",
            "info_itad_deals",
            op_args,
            "getStoreSearchDeals: the lookup did not finish",
        )
        .await
    })
}

/// Decodes the one argument of `getItadSteamGids`: a list of at most
/// [`gamelib_info::itad::GIDS_MAX`] Steam app ids, each 1 to 10 ASCII digits (T-47-26). The list is
/// handed on as it came; the crate decodes it again strictly.
fn parse_get_itad_steam_gids(args: &[Value]) -> Result<&Value, Rejection> {
    let [arg] = args else {
        return Err(("(args)", "invalid_type"));
    };
    let Value::Array(ids) = arg else {
        return Err(("0", "invalid_type"));
    };
    if ids.len() > gamelib_info::itad::GIDS_MAX {
        return Err(("0", "too_big"));
    }
    for id in ids {
        let Value::String(id) = id else {
            return Err(("0", "invalid_type"));
        };
        if !(1..=gamelib_info::itad::APP_ID_MAX_DIGITS).contains(&id.len())
            || !id.bytes().all(|b| b.is_ascii_digit())
        {
            return Err(("0", "invalid_string"));
        }
    }
    Ok(arg)
}

/// The native `getItadSteamGids` handler (slice `info`, D-17): the Steam app id to ITAD game id map
/// over the keyless lookup route, cached 30 days. It never rejects for a network failure.
pub(crate) fn get_itad_steam_gids(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(async move {
        let app_ids = parse_get_itad_steam_gids(&args)
            .map_err(|(path, code)| invalid_args("getItadSteamGids", &[path], &[code]))?
            .clone();
        let info = info_ctx().ok_or_else(|| "getItadSteamGids: not ready".to_string())?;
        run_itad_op(
            info,
            "getItadSteamGids",
            "info_itad_gids",
            vec![serde_json::json!({ "appIds": app_ids })],
            "getItadSteamGids: the lookup did not finish",
        )
        .await
    })
}

/// `itad.getKeyStatus` takes no argument.
fn parse_itad_key_status(args: &[Value]) -> Result<(), Rejection> {
    if args.is_empty() {
        Ok(())
    } else {
        Err(("(args)", "too_big"))
    }
}

/// The native `itad.getKeyStatus` handler (slice `info`, D-17): `{ hasKey, rejected }`, two booleans
/// and never the key (T-47-41). `hasKey` is the user key slot only.
pub(crate) fn itad_get_key_status(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(async move {
        parse_itad_key_status(&args)
            .map_err(|(path, code)| invalid_args("itad.getKeyStatus", &[path], &[code]))?;
        let info = info_ctx().ok_or_else(|| "itad.getKeyStatus: not ready".to_string())?;
        run_info_op(
            Arc::clone(info),
            "info_itad_key_status",
            vec![serde_json::json!({})],
            "itad.getKeyStatus: the check did not finish",
        )
        .await
    })
}

/// Decodes the one `key` argument of `itad.setApiKey`: exactly one string of 0 to
/// [`gamelib_info::itad::KEY_MAX_UTF16`] UTF-16 code units (an empty one clears the key). The value is
/// never echoed into a rejection.
fn parse_itad_set_key(args: &[Value]) -> Result<&str, Rejection> {
    // The same shape and bound as the search term.
    parse_steamgrid_search(args)
}

/// The native `itad.setApiKey` handler (slice `info`, D-17): stores the trimmed user key in the `itad-api-key`
/// slot, or clears it for an empty value, and forgets any earlier rejection. The key is never in a log
/// line, an error or a rejection (T-47-42).
pub(crate) fn itad_set_api_key(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(async move {
        let key = parse_itad_set_key(&args)
            .map_err(|(path, code)| invalid_args("itad.setApiKey", &[path], &[code]))?
            .to_string();
        let info = info_ctx().ok_or_else(|| "itad.setApiKey: not ready".to_string())?;
        run_info_op(
            Arc::clone(info),
            "info_itad_set_key",
            vec![serde_json::json!({ "key": key })],
            "itad.setApiKey: the write did not finish",
        )
        .await
    })
}

#[cfg(test)]
use gamelib_store::host::StoreHost;
#[cfg(test)]
use gamelib_testutil::FakeHome;

/// The 86-04 recent goldens' before-states.
#[cfg(test)]
const STATE: &str = "crates/gamelib-info/tests/fixtures/state/recent";

/// An `InfoCtx` on a FakeHome whose `userData` holds `before` (a golden state folder).
#[cfg(test)]
pub(crate) fn test_ctx(home: &FakeHome, before: Option<&str>) -> InfoCtx {
    let user_data = home.root().join("userData");
    std::fs::create_dir_all(user_data.join("store")).unwrap();
    if let Some(case) = before {
        let from = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join(STATE)
            .join(case)
            .join("store/config.json");
        std::fs::copy(from, user_data.join("store/config.json")).unwrap();
    }
    InfoCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        Platform::Linux,
        InfoPaths {
            app_folder: user_data.clone(),
            user_data,
            temp: home.root().join("temp"),
            public_dir: None,
        },
        "0.0.0-test".to_string(),
        gamelib_core::shutdown::Shutdown::new(),
        Arc::new(ReqwestHttp::new()),
    )
}

/// The 86-04 overrides goldens' before-states.
#[cfg(test)]
const OVERRIDES_STATE: &str = "crates/gamelib-info/tests/fixtures/state/overrides";

/// An `InfoCtx` on a FakeHome whose `userData` is a copy of an overrides golden's before-state.
#[cfg(test)]
pub(crate) fn overrides_ctx(home: &FakeHome, before: &str) -> InfoCtx {
    fn copy_tree(from: &Path, to: &Path) {
        std::fs::create_dir_all(to).unwrap();
        for entry in std::fs::read_dir(from).unwrap() {
            let entry = entry.unwrap();
            let target = to.join(entry.file_name());
            if entry.file_type().unwrap().is_dir() {
                copy_tree(&entry.path(), &target);
            } else {
                std::fs::copy(entry.path(), target).unwrap();
            }
        }
    }
    let ctx = test_ctx(home, None);
    copy_tree(
        &Path::new(env!("CARGO_MANIFEST_DIR"))
            .join(OVERRIDES_STATE)
            .join(before),
        &ctx.paths.user_data,
    );
    ctx
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::Mutex;

    const GOLDEN: &str = "crates/gamelib-info/tests/fixtures/golden/recent/expected";

    /// Records every `(channel, args)` push.
    #[derive(Default)]
    struct RecordingEmitter(Mutex<Vec<(String, Vec<Value>)>>);

    impl FrontendEmitter for RecordingEmitter {
        fn emit(&self, channel: &str, args: Vec<Value>) {
            self.0.lock().unwrap().push((channel.to_string(), args));
        }
    }

    /// A sink with no AppHandle: records the emitter pushes and the tray lists it was handed.
    fn recording_sink() -> (
        Arc<TrayRecentSink>,
        Arc<RecordingEmitter>,
        Arc<Mutex<Vec<Vec<TrayRecentGame>>>>,
    ) {
        let emitter = Arc::new(RecordingEmitter::default());
        let tray = Arc::new(Mutex::new(Vec::new()));
        let tray_sink = Arc::clone(&tray);
        let sink = Arc::new(TrayRecentSink::new(
            emitter.clone(),
            Arc::new(move |games| tray_sink.lock().unwrap().push(games)),
            Arc::new(|| 5),
        ));
        (sink, emitter, tray)
    }

    fn golden_bytes(case: &str) -> Vec<u8> {
        std::fs::read(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join(GOLDEN)
                .join(case)
                .join("after/store/config.json"),
        )
        .unwrap()
    }

    #[test]
    fn rpc_add_writes_the_ts_golden_bytes_and_tells_the_sink() {
        let home = FakeHome::new("info-dispatch-");
        let mut ctx = test_ctx(&home, Some("add-to-populated-list"));
        let (sink, emitter, tray) = recording_sink();
        ctx.recent_sink = Some(sink);

        let args = [json!({ "appName": "app1", "title": "Game 1", "runner": "steam" })];
        assert_eq!(recent_add_with(&ctx, &args), Ok(Value::Null));

        let written = std::fs::read(home.root().join("userData/store/config.json")).unwrap();
        assert_eq!(
            written,
            golden_bytes("add-to-populated-list"),
            "the file differs from the TS golden"
        );
        // The renderer push carries the new list, newest first.
        let pushes = emitter.0.lock().unwrap();
        assert_eq!(pushes.len(), 1);
        assert_eq!(pushes[0].0, "recentGamesChanged");
        assert_eq!(pushes[0].1[0][0]["appName"], "app1");
        assert_eq!(pushes[0].1[0][0]["runner"], "steam");
        // The tray got the same list.
        let tray = tray.lock().unwrap();
        assert_eq!(tray.len(), 1);
        assert_eq!(tray[0][0].app_name, "app1");
        assert_eq!(tray[0][0].runner.as_deref(), Some("steam"));
    }

    #[test]
    fn the_tray_list_is_cut_to_the_menu_limit() {
        let emitter = Arc::new(RecordingEmitter::default());
        let tray = Arc::new(Mutex::new(Vec::new()));
        let tray_sink = Arc::clone(&tray);
        let sink = TrayRecentSink::new(
            emitter.clone(),
            Arc::new(move |games| tray_sink.lock().unwrap().push(games)),
            Arc::new(|| 2),
        );
        let list = Json::from(json!([
            { "appName": "a", "title": "A" },
            { "appName": "b", "title": "B" },
            { "appName": "c", "title": "C" }
        ]));
        sink.changed(&list);
        // The renderer still gets the whole list; only the menu is cut.
        assert_eq!(
            emitter.0.lock().unwrap()[0].1[0].as_array().unwrap().len(),
            3
        );
        assert_eq!(tray.lock().unwrap()[0].len(), 2);
    }

    #[test]
    fn rpc_rejects_bad_args_before_the_crate_with_a_fixed_literal() {
        let home = FakeHome::new("info-dispatch-");
        let ctx = test_ctx(&home, None);
        for args in [
            vec![],
            vec![json!({ "appName": "a" })],
            vec![json!({ "appName": 1, "title": "t", "runner": "gog" })],
            vec![json!("a")],
        ] {
            assert_eq!(
                recent_add_with(&ctx, &args),
                Err("info_recent_add:bad-args".to_string()),
                "{args:?}"
            );
        }
        // The generated struct accepts an unknown field's absence only: unknown fields reach the
        // crate's `deny_unknown_fields` struct, which rejects them the same way.
        let extra = [json!({ "appName": "a", "title": "t", "runner": "gog", "x": 1 })];
        assert_eq!(
            recent_add_with(&ctx, &extra),
            Err("info_recent_add:bad-args".to_string())
        );
        assert_eq!(
            recent_remove_with(&ctx, &[json!({ "appName": 1 })]),
            Err("info_recent_remove:bad-args".to_string())
        );
        assert!(!home.root().join("userData/store/config.json").exists());
    }

    #[test]
    fn the_handlers_answer_not_ready_before_install() {
        // No test installs the global context, so this is the pre-install answer.
        assert!(info_ctx().is_none());
        assert_eq!(
            rpc_info_recent_add(&[json!({ "appName": "a", "title": "t", "runner": "gog" })]),
            Err("info_recent_add:not-ready".to_string())
        );
        assert_eq!(
            rpc_info_recent_remove(&[json!({ "appName": "a" })]),
            Err("info_recent_remove:not-ready".to_string())
        );
    }
    #[test]
    fn remove_recent_accepts_exactly_one_bounded_non_empty_string() {
        assert_eq!(parse_remove_recent(&[json!("abc")]), Ok("abc"));
        assert_eq!(
            parse_remove_recent(&[json!("x".repeat(1024))]).map(str::len),
            Ok(1024)
        );
        for (args, want) in [
            (vec![], ("(args)", "invalid_type")),
            (vec![json!(1)], ("0", "invalid_type")),
            (vec![json!(null)], ("0", "invalid_type")),
            (vec![json!(["a"])], ("0", "invalid_type")),
            (vec![json!("a"), json!("b")], ("(args)", "invalid_type")),
            (vec![json!("")], ("0", "too_small")),
            (vec![json!("x".repeat(1025))], ("0", "too_big")),
            // Two UTF-16 units per astral character: 513 of them are 1026 units.
            (vec![json!("\u{1F3AE}".repeat(513))], ("0", "too_big")),
        ] {
            assert_eq!(parse_remove_recent(&args), Err(want), "{args:?}");
        }
    }

    #[test]
    fn a_rejected_remove_recent_never_echoes_the_argument() {
        let secret = "SECRET-APP-NAME-".repeat(80);
        let rejection = parse_remove_recent(&[json!(secret.clone())]).unwrap_err();
        let error = remove_recent_rejected(rejection);
        assert!(
            error.starts_with(crate::ipc_contract::IPC_INVALID_ARGS_MARKER),
            "{error}"
        );
        assert!(!error.contains("SECRET"), "{error}");
        assert!(error.len() < 300, "{error}");
    }

    #[test]
    fn remove_recent_removes_writes_the_golden_bytes_emits_and_updates_the_tray() {
        let home = FakeHome::new("info-dispatch-");
        let mut ctx = test_ctx(&home, Some("remove-present-game"));
        let (sink, emitter, tray) = recording_sink();
        ctx.recent_sink = Some(sink);

        let result =
            tauri::async_runtime::block_on(run_remove_recent(Arc::new(ctx), "app3".to_string()));
        assert_eq!(result, Ok(Value::Null));

        let written = std::fs::read(home.root().join("userData/store/config.json")).unwrap();
        assert_eq!(written, golden_bytes("remove-present-game"));
        let pushes = emitter.0.lock().unwrap();
        assert_eq!(pushes.len(), 1);
        assert_eq!(pushes[0].0, "recentGamesChanged");
        let names: Vec<&str> = pushes[0].1[0]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| e["appName"].as_str().unwrap())
            .collect();
        assert!(!names.contains(&"app3"), "{names:?}");
        assert_eq!(tray.lock().unwrap().len(), 1);
    }

    #[test]
    fn a_launch_add_and_a_native_remove_on_two_threads_both_land() {
        // [ghost, app2] + add app1 + remove app2 = [app1], whichever runs first.
        for round in 0..30 {
            let home = FakeHome::new("info-dispatch-");
            let ctx = Arc::new(test_ctx(&home, Some("add-over-empty-appname-entry")));
            let adder = {
                let ctx = Arc::clone(&ctx);
                std::thread::spawn(move || {
                    recent_add_with(
                        &ctx,
                        &[json!({ "appName": "app1", "title": "Game 1", "runner": "gog" })],
                    )
                })
            };
            let removed = tauri::async_runtime::block_on(run_remove_recent(
                Arc::clone(&ctx),
                "app2".to_string(),
            ));
            assert_eq!(removed, Ok(Value::Null), "round {round}");
            assert_eq!(adder.join().unwrap(), Ok(Value::Null), "round {round}");
            let list = gamelib_info::recent::list(&ctx).unwrap().to_value();
            let names: Vec<&str> = list
                .as_array()
                .unwrap()
                .iter()
                .map(|e| e["appName"].as_str().unwrap())
                .collect();
            assert_eq!(names, ["app1"], "round {round}: an effect was lost");
        }
    }

    #[test]
    fn remove_recent_answers_not_ready_before_install_after_validating() {
        // No test installs the global context.
        assert!(info_ctx().is_none());
        let router_ctx = Arc::new(crate::native_router::NativeCtx::for_tests(
            Arc::new(NoHost),
            None,
        ));
        let ok = tauri::async_runtime::block_on(remove_recent(
            Arc::clone(&router_ctx),
            vec![json!("abc")],
        ));
        assert_eq!(ok, Err("removeRecent: not ready".to_string()));
        let bad = tauri::async_runtime::block_on(remove_recent(router_ctx, vec![json!("")]));
        assert!(bad
            .unwrap_err()
            .starts_with(crate::ipc_contract::IPC_INVALID_ARGS_MARKER));
    }

    #[test]
    fn get_game_metadata_override_accepts_exactly_one_bounded_non_empty_string() {
        assert_eq!(parse_get_game_metadata_override(&[json!("abc")]), Ok("abc"));
        assert_eq!(
            parse_get_game_metadata_override(&[json!("x".repeat(256))]).map(str::len),
            Ok(256)
        );
        for (args, want) in [
            (vec![], ("(args)", "invalid_type")),
            (vec![json!(1)], ("0", "invalid_type")),
            (vec![json!(null)], ("0", "invalid_type")),
            (vec![json!({})], ("0", "invalid_type")),
            (vec![json!("a"), json!("b")], ("(args)", "invalid_type")),
            (vec![json!("")], ("0", "too_small")),
            (vec![json!("x".repeat(257))], ("0", "too_big")),
            // Two UTF-16 units per astral character: 129 of them are 258 units.
            (vec![json!("\u{1F3AE}".repeat(129))], ("0", "too_big")),
        ] {
            assert_eq!(
                parse_get_game_metadata_override(&args),
                Err(want),
                "{args:?}"
            );
        }
    }

    #[test]
    fn get_all_game_overrides_takes_no_argument() {
        assert_eq!(parse_get_all_game_overrides(&[]), Ok(()));
        for args in [vec![json!(1)], vec![json!(null)], vec![json!({}), json!(1)]] {
            assert_eq!(
                parse_get_all_game_overrides(&args),
                Err(("(args)", "too_big")),
                "{args:?}"
            );
        }
    }

    #[test]
    fn the_override_reads_answer_the_ts_golden_results_through_the_blocking_pool() {
        let home = FakeHome::new("info-dispatch-");
        let info = Arc::new(overrides_ctx(&home, "get-present"));
        let one = tauri::async_runtime::block_on(run_info_op(
            Arc::clone(&info),
            "info_overrides_get",
            vec![json!({ "appName": "app2" })],
            "x",
        ));
        assert_eq!(
            one,
            Ok(json!({
                "title": "Other",
                "art_cover": "/img/app2-1.png",
                "art_square": "/img/app2-2.png"
            }))
        );
        let absent = tauri::async_runtime::block_on(run_info_op(
            Arc::clone(&info),
            "info_overrides_get",
            vec![json!({ "appName": "ghost" })],
            "x",
        ));
        assert_eq!(absent, Ok(Value::Null));
        let all = tauri::async_runtime::block_on(run_info_op(
            info,
            "info_overrides_get_all",
            Vec::new(),
            "x",
        ))
        .unwrap();
        assert_eq!(all["app1"], json!({ "title": "My Title" }));
        assert_eq!(all.as_object().unwrap().len(), 2);
    }

    #[test]
    fn the_override_handlers_validate_first_and_answer_not_ready_before_install() {
        assert!(info_ctx().is_none());
        let router_ctx = Arc::new(crate::native_router::NativeCtx::for_tests(
            Arc::new(NoHost),
            None,
        ));
        let not_ready = tauri::async_runtime::block_on(get_game_metadata_override(
            Arc::clone(&router_ctx),
            vec![json!("abc")],
        ));
        assert_eq!(
            not_ready,
            Err("getGameMetadataOverride: not ready".to_string())
        );
        let not_ready =
            tauri::async_runtime::block_on(get_all_game_overrides(Arc::clone(&router_ctx), vec![]));
        assert_eq!(not_ready, Err("getAllGameOverrides: not ready".to_string()));
        // A bad call is rejected with the marker and a fixed literal, before the context.
        let secret = "SECRET-APP-NAME-".repeat(40);
        for bad in [
            tauri::async_runtime::block_on(get_game_metadata_override(
                Arc::clone(&router_ctx),
                vec![json!(secret)],
            )),
            tauri::async_runtime::block_on(get_game_metadata_override(
                Arc::clone(&router_ctx),
                vec![json!("")],
            )),
            tauri::async_runtime::block_on(get_all_game_overrides(router_ctx, vec![json!(1)])),
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
    fn get_anticheat_info_accepts_exactly_one_bounded_string_and_the_empty_one() {
        assert_eq!(parse_get_anticheat_info(&[json!("abc")]), Ok("abc"));
        assert_eq!(parse_get_anticheat_info(&[json!("")]), Ok(""));
        assert_eq!(
            parse_get_anticheat_info(&[json!("x".repeat(1024))]).map(str::len),
            Ok(1024)
        );
        for (args, want) in [
            (vec![], ("(args)", "invalid_type")),
            (vec![json!(1)], ("0", "invalid_type")),
            (vec![json!(null)], ("0", "invalid_type")),
            (vec![json!({})], ("0", "invalid_type")),
            (vec![json!("a"), json!("b")], ("(args)", "invalid_type")),
            (vec![json!("x".repeat(1025))], ("0", "too_big")),
            // Two UTF-16 units per astral character: 513 of them are 1026 units.
            (vec![json!("\u{1F3AE}".repeat(513))], ("0", "too_big")),
        ] {
            assert_eq!(parse_get_anticheat_info(&args), Err(want), "{args:?}");
        }
    }

    #[test]
    fn the_anticheat_lookup_answers_the_ts_golden_through_the_blocking_pool() {
        let home = FakeHome::new("info-dispatch-");
        let info = Arc::new(test_ctx(&home, None));
        let state = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("crates/gamelib-info/tests/fixtures/state/anticheat/lookup-namespace-present-mixed-case");
        std::fs::copy(
            state.join("areweanticheatyet.json"),
            info.paths.app_folder.join("areweanticheatyet.json"),
        )
        .unwrap();
        let found = tauri::async_runtime::block_on(run_info_op(
            Arc::clone(&info),
            "info_anticheat_info",
            vec![json!({ "appNamespace": "abcdef" })],
            "x",
        ))
        .unwrap();
        assert_eq!(found["storeIds"]["epic"]["namespace"], json!("AbCdEf0123"));
        let absent = tauri::async_runtime::block_on(run_info_op(
            info,
            "info_anticheat_info",
            vec![json!({ "appNamespace": "nomatch" })],
            "x",
        ));
        assert_eq!(absent, Ok(Value::Null));
    }

    #[test]
    fn the_anticheat_handler_validates_first_and_answers_not_ready_before_install() {
        assert!(info_ctx().is_none());
        let router_ctx = Arc::new(crate::native_router::NativeCtx::for_tests(
            Arc::new(NoHost),
            None,
        ));
        let not_ready = tauri::async_runtime::block_on(get_anticheat_info(
            Arc::clone(&router_ctx),
            vec![json!("abc")],
        ));
        assert_eq!(not_ready, Err("getAnticheatInfo: not ready".to_string()));
        let secret = "SECRET-NAMESPACE-".repeat(80);
        for bad in [
            tauri::async_runtime::block_on(get_anticheat_info(
                Arc::clone(&router_ctx),
                vec![json!(secret)],
            )),
            tauri::async_runtime::block_on(get_anticheat_info(router_ctx, vec![])),
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
    fn the_migration_log_line_carries_the_outcome_word_only() {
        assert_eq!(
            sgdb_migration_line("migrated"),
            "steamgrid key migration: migrated"
        );
        // Every word the crate can report, none of which can hold a key.
        for outcome in [
            gamelib_info::secrets::MigrationOutcome::Migrated,
            gamelib_info::secrets::MigrationOutcome::NothingToDo,
            gamelib_info::secrets::MigrationOutcome::Ciphertext,
            gamelib_info::secrets::MigrationOutcome::ReadBackFailed,
            gamelib_info::secrets::MigrationOutcome::Failed,
        ] {
            let line = sgdb_migration_line(outcome.label());
            assert!(line.starts_with("steamgrid key migration: "), "{line}");
            assert!(!line.contains("sgdb:v1"), "{line}");
        }
    }

    #[test]
    fn steamgrid_search_accepts_exactly_one_bounded_string_and_the_empty_one() {
        assert_eq!(parse_steamgrid_search(&[json!("Celeste")]), Ok("Celeste"));
        assert_eq!(parse_steamgrid_search(&[json!("")]), Ok(""));
        assert_eq!(
            parse_steamgrid_search(&[json!("x".repeat(256))]).map(str::len),
            Ok(256)
        );
        for (args, want) in [
            (vec![], ("(args)", "invalid_type")),
            (vec![json!(1)], ("0", "invalid_type")),
            (vec![json!(null)], ("0", "invalid_type")),
            (vec![json!({})], ("0", "invalid_type")),
            (vec![json!("a"), json!("b")], ("(args)", "invalid_type")),
            (vec![json!("x".repeat(257))], ("0", "too_big")),
            // Two UTF-16 units per astral character: 129 of them are 258 units.
            (vec![json!("\u{1F3AE}".repeat(129))], ("0", "too_big")),
        ] {
            assert_eq!(parse_steamgrid_search(&args), Err(want), "{args:?}");
        }
    }

    #[test]
    fn the_steamgrid_search_handler_validates_first_and_answers_not_ready_before_install() {
        assert!(info_ctx().is_none());
        let router_ctx = Arc::new(crate::native_router::NativeCtx::for_tests(
            Arc::new(NoHost),
            None,
        ));
        let not_ready = tauri::async_runtime::block_on(steamgrid_search(
            Arc::clone(&router_ctx),
            vec![json!("Celeste")],
        ));
        assert_eq!(
            not_ready,
            Err("steamgriddb.searchGame: not ready".to_string())
        );
        let secret = "SECRET-QUERY-".repeat(40);
        for bad in [
            tauri::async_runtime::block_on(steamgrid_search(
                Arc::clone(&router_ctx),
                vec![json!(secret)],
            )),
            tauri::async_runtime::block_on(steamgrid_search(router_ctx, vec![])),
        ] {
            let error = bad.unwrap_err();
            assert!(
                error.starts_with(crate::ipc_contract::IPC_INVALID_ARGS_MARKER),
                "{error}"
            );
            assert!(!error.contains("SECRET"), "{error}");
        }
    }

    /// Hands out one key for every slot and records nothing else.
    struct OneKey(&'static str);

    impl gamelib_info::secrets::SecretSource for OneKey {
        fn get(&self, _slot: gamelib_info::secrets::Slot) -> Result<Option<String>, String> {
            Ok(Some(self.0.to_string()))
        }
        fn set(&self, _slot: gamelib_info::secrets::Slot, _value: &str) -> Result<(), String> {
            Ok(())
        }
        fn delete(&self, _slot: gamelib_info::secrets::Slot) -> Result<(), String> {
            Ok(())
        }
    }

    /// Answers every request with one body and remembers the request.
    struct Canned(Mutex<Vec<gamelib_info::http::Request>>);

    impl gamelib_info::http::Http for Canned {
        fn send(&self, request: gamelib_info::http::Request) -> gamelib_info::http::HttpFuture<'_> {
            self.0.lock().unwrap().push(request);
            Box::pin(async {
                Ok(gamelib_info::http::Response {
                    status: 200,
                    headers: Vec::new(),
                    body: br#"{"success":true,"data":[{"id":7,"name":"Celeste","verified":true}]}"#
                        .to_vec(),
                })
            })
        }
    }

    #[test]
    fn the_steamgrid_search_runs_through_the_blocking_pool_with_the_stored_key() {
        let home = FakeHome::new("info-dispatch-");
        let canned = Arc::new(Canned(Mutex::new(Vec::new())));
        let mut ctx = test_ctx(&home, None);
        ctx.http = canned.clone();
        ctx.secrets = Some(Arc::new(OneKey("test-key")));
        let found = tauri::async_runtime::block_on(run_info_op(
            Arc::new(ctx),
            "info_steamgrid_search",
            vec![json!({ "query": "Dead Cells" })],
            "x",
        ));
        assert_eq!(found, Ok(json!([{ "id": 7, "name": "Celeste" }])));
        let seen = canned.0.lock().unwrap();
        assert_eq!(seen.len(), 1);
        assert_eq!(
            seen[0].url,
            "https://www.steamgriddb.com/api/v2/search/autocomplete/Dead%20Cells"
        );
        assert!(seen[0]
            .headers
            .iter()
            .any(|(k, v)| k == "Authorization" && v == "Bearer test-key"));
    }

    #[test]
    fn the_steamgrid_key_channels_accept_exactly_their_shapes() {
        assert_eq!(parse_steamgrid_has_key(&[]), Ok(()));
        assert_eq!(
            parse_steamgrid_has_key(&[json!(1)]),
            Err(("(args)", "too_big"))
        );
        assert_eq!(parse_steamgrid_set_key(&[json!("k")]), Ok("k"));
        assert_eq!(parse_steamgrid_set_key(&[json!("")]), Ok(""));
        assert_eq!(
            parse_steamgrid_set_key(&[json!("k".repeat(256))]).map(str::len),
            Ok(256)
        );
        for (args, want) in [
            (vec![], ("(args)", "invalid_type")),
            (vec![json!(1)], ("0", "invalid_type")),
            (vec![json!(null)], ("0", "invalid_type")),
            (vec![json!("a"), json!("b")], ("(args)", "invalid_type")),
            (vec![json!("k".repeat(257))], ("0", "too_big")),
        ] {
            assert_eq!(parse_steamgrid_set_key(&args), Err(want), "{args:?}");
        }
    }

    #[test]
    fn the_steamgrid_artwork_argument_is_strict() {
        let ok = |v: Value| parse_steamgrid_artwork(&[v]).is_ok();
        assert!(ok(json!({ "gameId": 1 })));
        assert!(ok(
            json!({ "gameId": 1, "styles": ["a"], "dimensions": [] })
        ));
        let limit = vec!["x".repeat(64); 64];
        assert!(ok(json!({ "gameId": 7, "styles": limit })));
        for (arg, want) in [
            (json!({}), ("0.gameId", "invalid_type")),
            (json!({ "gameId": 0 }), ("0.gameId", "too_small")),
            (json!({ "gameId": -1 }), ("0.gameId", "too_small")),
            (json!({ "gameId": 1.5 }), ("0.gameId", "invalid_type")),
            (json!({ "gameId": "1" }), ("0.gameId", "invalid_type")),
            (json!({ "gameId": null }), ("0.gameId", "invalid_type")),
            (
                json!({ "gameId": 1, "extra": 1 }),
                ("0", "unrecognized_keys"),
            ),
            (
                json!({ "gameId": 1, "styles": null }),
                ("0.styles", "invalid_type"),
            ),
            (
                json!({ "gameId": 1, "styles": "a" }),
                ("0.styles", "invalid_type"),
            ),
            (
                json!({ "gameId": 1, "styles": [1] }),
                ("0.styles", "invalid_type"),
            ),
            (
                json!({ "gameId": 1, "styles": vec!["a"; 65] }),
                ("0.styles", "too_big"),
            ),
            (
                json!({ "gameId": 1, "dimensions": ["x".repeat(65)] }),
                ("0.dimensions", "too_big"),
            ),
            // 33 astral characters are 66 UTF-16 units.
            (
                json!({ "gameId": 1, "dimensions": ["\u{1F3AE}".repeat(33)] }),
                ("0.dimensions", "too_big"),
            ),
            (json!("x"), ("0", "invalid_type")),
            (json!(null), ("0", "invalid_type")),
        ] {
            assert_eq!(parse_steamgrid_artwork(&[arg.clone()]), Err(want), "{arg}");
        }
        assert_eq!(
            parse_steamgrid_artwork(&[]),
            Err(("(args)", "invalid_type"))
        );
        assert_eq!(
            parse_steamgrid_artwork(&[json!({ "gameId": 1 }), json!({})]),
            Err(("(args)", "invalid_type"))
        );
    }

    #[test]
    fn the_steamgrid_handlers_validate_first_and_answer_not_ready_before_install() {
        assert!(info_ctx().is_none());
        let router_ctx = Arc::new(crate::native_router::NativeCtx::for_tests(
            Arc::new(NoHost),
            None,
        ));
        let run =
            |handler: fn(Arc<crate::native_router::NativeCtx>, Vec<Value>) -> NativeFuture,
             args: Vec<Value>| {
                tauri::async_runtime::block_on(handler(Arc::clone(&router_ctx), args))
            };
        assert_eq!(
            run(steamgrid_has_key, vec![]),
            Err("steamgriddb.hasApiKey: not ready".to_string())
        );
        assert_eq!(
            run(steamgrid_set_key, vec![json!("k")]),
            Err("steamgriddb.setApiKey: not ready".to_string())
        );
        assert_eq!(
            run(steamgrid_grids, vec![json!({ "gameId": 1 })]),
            Err("steamgriddb.getGrids: not ready".to_string())
        );
        assert_eq!(
            run(steamgrid_heroes, vec![json!({ "gameId": 1 })]),
            Err("steamgriddb.getHeroes: not ready".to_string())
        );
        // A bad call is rejected the same way before install, and never echoes the value.
        let secret = "SECRET-KEY-".repeat(40);
        for bad in [
            run(steamgrid_set_key, vec![json!(secret)]),
            run(steamgrid_set_key, vec![json!(5)]),
            run(steamgrid_has_key, vec![json!("x")]),
            run(
                steamgrid_grids,
                vec![json!({ "gameId": 0, "styles": [secret] })],
            ),
            run(steamgrid_heroes, vec![json!({ "gameId": 1, "SECRET": 1 })]),
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
    fn the_steamgrid_key_ops_run_through_the_blocking_pool() {
        let home = FakeHome::new("info-dispatch-");
        let canned = Arc::new(Canned(Mutex::new(Vec::new())));
        let mut ctx = test_ctx(&home, None);
        ctx.http = canned.clone();
        ctx.secrets = Some(Arc::new(OneKey("test-key")));
        let ctx = Arc::new(ctx);
        let has = tauri::async_runtime::block_on(run_info_op(
            Arc::clone(&ctx),
            "info_steamgrid_has_key",
            vec![json!({})],
            "x",
        ));
        assert_eq!(has, Ok(json!(true)));
        let grids = tauri::async_runtime::block_on(run_info_op(
            ctx,
            "info_steamgrid_grids",
            vec![json!({ "gameId": 7, "styles": ["alternate"], "dimensions": ["460x215"] })],
            "x",
        ));
        assert_eq!(grids, Ok(json!([{ "id": 7 }])));
        let seen = canned.0.lock().unwrap();
        assert_eq!(
            seen[0].url,
            "https://www.steamgriddb.com/api/v2/grids/game/7?dimensions=460x215&styles=alternate"
        );
    }

    #[test]
    fn search_stores_accepts_a_bounded_term_and_an_optional_bounded_country() {
        assert_eq!(
            parse_search_stores(&[json!("portal")]),
            Ok(("portal", None))
        );
        assert_eq!(parse_search_stores(&[json!("")]), Ok(("", None)));
        assert_eq!(
            parse_search_stores(&[json!("portal"), json!("US")]),
            Ok(("portal", Some("US")))
        );
        assert_eq!(
            parse_search_stores(&[json!("portal"), json!(null)]),
            Ok(("portal", None))
        );
        assert_eq!(
            parse_search_stores(&[json!("x".repeat(256)), json!("C".repeat(16))])
                .map(|(q, c)| (q.len(), c.map(str::len))),
            Ok((256, Some(16)))
        );
        for (args, want) in [
            (vec![], ("(args)", "too_small")),
            (
                vec![json!("a"), json!("US"), json!("x")],
                ("(args)", "too_big"),
            ),
            (vec![json!(1)], ("0", "invalid_type")),
            (vec![json!(null)], ("0", "invalid_type")),
            (vec![json!({})], ("0", "invalid_type")),
            (vec![json!("a"), json!(1)], ("1", "invalid_type")),
            (vec![json!("a"), json!({})], ("1", "invalid_type")),
            (vec![json!("x".repeat(257))], ("0", "too_big")),
            (vec![json!("a"), json!("C".repeat(17))], ("1", "too_big")),
            // Two UTF-16 units per astral character: 129 of them are 258 units.
            (vec![json!("\u{1F3AE}".repeat(129))], ("0", "too_big")),
        ] {
            assert_eq!(parse_search_stores(&args), Err(want), "{args:?}");
        }
    }

    #[test]
    fn get_store_search_deals_accepts_a_hex_and_dash_id_and_an_optional_country() {
        let id = "018d937f-1749-73f8-bf5a-8e0aa3cdd9ff";
        assert_eq!(parse_get_store_search_deals(&[json!(id)]), Ok((id, None)));
        assert_eq!(
            parse_get_store_search_deals(&[json!(id), json!("DE")]),
            Ok((id, Some("DE")))
        );
        assert_eq!(
            parse_get_store_search_deals(&[json!(id), json!(null)]),
            Ok((id, None))
        );
        assert_eq!(
            parse_get_store_search_deals(&[json!("a".repeat(64))]).map(|(i, _)| i.len()),
            Ok(64)
        );
        for (args, want) in [
            (vec![], ("(args)", "too_small")),
            (
                vec![json!(id), json!("US"), json!("x")],
                ("(args)", "too_big"),
            ),
            (vec![json!(1)], ("0", "invalid_type")),
            (vec![json!(null)], ("0", "invalid_type")),
            (vec![json!("")], ("0", "invalid_string")),
            (vec![json!("../x")], ("0", "invalid_string")),
            (vec![json!("a.b")], ("0", "invalid_string")),
            (vec![json!("abg")], ("0", "invalid_string")),
            (vec![json!("a".repeat(65))], ("0", "invalid_string")),
            (vec![json!("\u{FF21}")], ("0", "invalid_string")),
            (vec![json!(id), json!(1)], ("1", "invalid_type")),
            (vec![json!(id), json!("C".repeat(17))], ("1", "too_big")),
        ] {
            assert_eq!(parse_get_store_search_deals(&args), Err(want), "{args:?}");
        }
    }

    #[test]
    fn get_itad_steam_gids_accepts_up_to_5000_digit_strings_of_1_to_10_digits() {
        let ok = json!(["220", "1", "1234567890"]);
        assert_eq!(parse_get_itad_steam_gids(&[ok.clone()]), Ok(&ok));
        let empty = json!([]);
        assert_eq!(parse_get_itad_steam_gids(&[empty.clone()]), Ok(&empty));
        let full = Value::Array(vec![json!("1"); 5000]);
        assert_eq!(parse_get_itad_steam_gids(&[full.clone()]), Ok(&full));
        for (args, want) in [
            (vec![], ("(args)", "invalid_type")),
            (vec![json!([]), json!([])], ("(args)", "invalid_type")),
            (vec![json!("220")], ("0", "invalid_type")),
            (vec![json!(null)], ("0", "invalid_type")),
            (vec![json!({})], ("0", "invalid_type")),
            (vec![json!([220])], ("0", "invalid_type")),
            (vec![json!([null])], ("0", "invalid_type")),
            (vec![json!(["abc"])], ("0", "invalid_string")),
            (vec![json!([""])], ("0", "invalid_string")),
            (vec![json!(["12345678901"])], ("0", "invalid_string")),
            (vec![json!(["1.5"])], ("0", "invalid_string")),
            (vec![json!([" 1"])], ("0", "invalid_string")),
            (vec![json!(["1\n"])], ("0", "invalid_string")),
            (vec![json!(["\u{0663}"])], ("0", "invalid_string")),
            (vec![Value::Array(vec![json!("1"); 5001])], ("0", "too_big")),
        ] {
            assert_eq!(parse_get_itad_steam_gids(&args), Err(want), "{args:?}");
        }
    }

    #[test]
    fn the_deals_and_gids_handlers_validate_first_and_answer_not_ready_before_install() {
        assert!(info_ctx().is_none());
        let router_ctx = Arc::new(crate::native_router::NativeCtx::for_tests(
            Arc::new(NoHost),
            None,
        ));
        let id = "018d937f-1749-73f8-bf5a-8e0aa3cdd9ff";
        assert_eq!(
            tauri::async_runtime::block_on(get_store_search_deals(
                Arc::clone(&router_ctx),
                vec![json!(id)]
            )),
            Err("getStoreSearchDeals: not ready".to_string())
        );
        assert_eq!(
            tauri::async_runtime::block_on(get_itad_steam_gids(
                Arc::clone(&router_ctx),
                vec![json!(["220"])]
            )),
            Err("getItadSteamGids: not ready".to_string())
        );
        for bad in [
            tauri::async_runtime::block_on(get_store_search_deals(
                Arc::clone(&router_ctx),
                vec![json!("SECRET/../ID")],
            )),
            tauri::async_runtime::block_on(get_itad_steam_gids(
                Arc::clone(&router_ctx),
                vec![json!(["SECRET"])],
            )),
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
    fn the_itad_key_channels_accept_exactly_their_shapes() {
        assert_eq!(parse_itad_key_status(&[]), Ok(()));
        for args in [vec![json!(null)], vec![json!({})], vec![json!("x")]] {
            assert_eq!(
                parse_itad_key_status(&args),
                Err(("(args)", "too_big")),
                "{args:?}"
            );
        }
        assert_eq!(parse_itad_set_key(&[json!("k")]), Ok("k"));
        assert_eq!(parse_itad_set_key(&[json!("")]), Ok(""));
        assert_eq!(
            parse_itad_set_key(&[json!("x".repeat(256))]).map(str::len),
            Ok(256)
        );
        for (args, want) in [
            (vec![], ("(args)", "invalid_type")),
            (vec![json!(1)], ("0", "invalid_type")),
            (vec![json!(null)], ("0", "invalid_type")),
            (vec![json!(["k"])], ("0", "invalid_type")),
            (vec![json!("a"), json!("b")], ("(args)", "invalid_type")),
            (vec![json!("x".repeat(257))], ("0", "too_big")),
        ] {
            assert_eq!(parse_itad_set_key(&args), Err(want), "{args:?}");
        }
    }

    #[test]
    fn the_itad_key_handlers_validate_first_and_never_echo_the_key() {
        assert!(info_ctx().is_none());
        let router_ctx = Arc::new(crate::native_router::NativeCtx::for_tests(
            Arc::new(NoHost),
            None,
        ));
        assert_eq!(
            tauri::async_runtime::block_on(itad_get_key_status(Arc::clone(&router_ctx), vec![])),
            Err("itad.getKeyStatus: not ready".to_string())
        );
        assert_eq!(
            tauri::async_runtime::block_on(itad_set_api_key(
                Arc::clone(&router_ctx),
                vec![json!("a-key")]
            )),
            Err("itad.setApiKey: not ready".to_string())
        );
        let secret = "SECRET-KEY-".repeat(40);
        for bad in [
            tauri::async_runtime::block_on(itad_set_api_key(
                Arc::clone(&router_ctx),
                vec![json!(secret)],
            )),
            tauri::async_runtime::block_on(itad_set_api_key(Arc::clone(&router_ctx), vec![])),
            tauri::async_runtime::block_on(itad_get_key_status(
                Arc::clone(&router_ctx),
                vec![json!("SECRET")],
            )),
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
    fn the_key_status_json_has_exactly_two_boolean_keys_and_not_the_key() {
        let home = FakeHome::new("info-dispatch-");
        let mut ctx = test_ctx(&home, None);
        ctx.secrets = Some(Arc::new(OneKey("stored-user-key")));
        ctx.itad_env_key = Some("env-built-in-key".to_string());
        let info = Arc::new(ctx);
        let status = tauri::async_runtime::block_on(run_info_op(
            Arc::clone(&info),
            "info_itad_key_status",
            vec![json!({})],
            "x",
        ))
        .unwrap();
        assert_eq!(status, json!({ "hasKey": true, "rejected": false }));
        let object = status.as_object().unwrap();
        assert_eq!(object.len(), 2);
        assert!(object.values().all(Value::is_boolean));
        let text = status.to_string();
        assert!(!text.contains("stored-user-key") && !text.contains("env-built-in-key"));
        // A write clears a stored key and the answer follows.
        let cleared = tauri::async_runtime::block_on(run_info_op(
            Arc::clone(&info),
            "info_itad_set_key",
            vec![json!({ "key": "  " })],
            "x",
        ));
        assert_eq!(cleared, Ok(Value::Null));
    }

    #[test]
    fn the_itad_error_code_reads_only_the_marker() {
        assert_eq!(
            itad_error_code("[storeSearch:provider] search 502"),
            Some("provider")
        );
        assert_eq!(
            itad_error_code("[storeSearch:rateLimited] deals 429"),
            Some("rateLimited")
        );
        assert_eq!(
            itad_error_code("[storeSearch:notConfigured] search none"),
            Some("notConfigured")
        );
        assert_eq!(itad_error_code("info_itad_search:bad-args"), None);
        assert_eq!(itad_error_code("searchStores: not ready"), None);
        assert_eq!(itad_error_code(""), None);
    }

    #[test]
    fn the_search_stores_handler_validates_first_and_answers_not_ready_before_install() {
        assert!(info_ctx().is_none());
        let router_ctx = Arc::new(crate::native_router::NativeCtx::for_tests(
            Arc::new(NoHost),
            None,
        ));
        let not_ready = tauri::async_runtime::block_on(search_stores(
            Arc::clone(&router_ctx),
            vec![json!("portal")],
        ));
        assert_eq!(not_ready, Err("searchStores: not ready".to_string()));
        let secret = "SECRET-QUERY-".repeat(40);
        for bad in [
            tauri::async_runtime::block_on(search_stores(
                Arc::clone(&router_ctx),
                vec![json!(secret)],
            )),
            tauri::async_runtime::block_on(search_stores(router_ctx, vec![])),
        ] {
            let error = bad.unwrap_err();
            assert!(
                error.starts_with(crate::ipc_contract::IPC_INVALID_ARGS_MARKER),
                "{error}"
            );
            assert!(!error.contains("SECRET"), "{error}");
        }
    }

    /// Answers the ITAD search and price requests with one game and one deal, remembering every
    /// request.
    struct ItadCanned(Mutex<Vec<gamelib_info::http::Request>>);

    impl gamelib_info::http::Http for ItadCanned {
        fn send(&self, request: gamelib_info::http::Request) -> gamelib_info::http::HttpFuture<'_> {
            let body = if request.url.contains("/games/search/v1") {
                r#"[{"id":"018d937f-1749-73f8-bf5a-8e0aa3cdd9ff","title":"Portal"}]"#
            } else {
                r#"[{"id":"018d937f-1749-73f8-bf5a-8e0aa3cdd9ff","deals":[{"shop":{"id":61,"name":"Steam"},"price":{"amount":9.99,"amountInt":999,"currency":"USD"},"regular":{"amount":9.99,"amountInt":999,"currency":"USD"},"url":"https://itad.link/portal"}]}]"#
            };
            self.0.lock().unwrap().push(request);
            Box::pin(async move {
                Ok(gamelib_info::http::Response {
                    status: 200,
                    headers: Vec::new(),
                    body: body.as_bytes().to_vec(),
                })
            })
        }
    }

    #[test]
    fn a_store_search_runs_through_the_blocking_pool_with_the_built_in_key_in_the_query() {
        let home = FakeHome::new("info-dispatch-");
        let canned = Arc::new(ItadCanned(Mutex::new(Vec::new())));
        let mut ctx = test_ctx(&home, None);
        ctx.http = canned.clone();
        ctx.itad_env_key = Some("test-env-key".to_string());
        let info = Arc::new(ctx);
        let found = tauri::async_runtime::block_on(run_itad_op(
            &info,
            "searchStores",
            "info_itad_search",
            vec![json!({ "query": "portal", "country": null })],
            "x",
        ));
        let answer = found.unwrap();
        assert_eq!(answer["pricedCountry"], "US");
        assert_eq!(answer["results"][0]["title"], "Portal");
        assert_eq!(answer["results"][0]["cheapestPrice"], "9.99");
        let seen = canned.0.lock().unwrap();
        assert_eq!(seen.len(), 2);
        assert_eq!(
            seen[0].url,
            "https://api.isthereanydeal.com/games/search/v1?title=portal&results=20&key=test-env-key"
        );
        assert_eq!(
            seen[1].url,
            "https://api.isthereanydeal.com/games/prices/v3?country=US&key=test-env-key"
        );
    }

    #[test]
    fn a_failed_store_search_is_the_fixed_marker_string_without_the_key() {
        let home = FakeHome::new("info-dispatch-");
        let mut ctx = test_ctx(&home, None);
        // No key of any kind: the typed error, and the real transport is never reached.
        ctx.itad_env_key = None;
        let info = Arc::new(ctx);
        let error = tauri::async_runtime::block_on(run_itad_op(
            &info,
            "searchStores",
            "info_itad_search",
            vec![json!({ "query": "portal" })],
            "x",
        ))
        .unwrap_err();
        assert_eq!(error, "[storeSearch:notConfigured] search none");
    }

    #[test]
    fn rpc_set_writes_the_ts_golden_bytes_and_returns_true() {
        let golden = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("crates/gamelib-info/tests/fixtures/golden/overrides/expected/set-title-added")
            .join("after/store/game-overrides.json");
        let home = FakeHome::new("info-dispatch-");
        let ctx = overrides_ctx(&home, "set-title-added");
        let args = [json!({ "appName": "app3", "overrideData": { "title": "Renamed Game" } })];
        assert_eq!(overrides_set_with(&ctx, &args), Ok(json!(true)));
        let written =
            std::fs::read(home.root().join("userData/store/game-overrides.json")).unwrap();
        assert_eq!(written, std::fs::read(golden).unwrap());
        // The read ops see the write through the one host.
        assert_eq!(
            overrides_get_with(&ctx, &[json!({ "appName": "app3" })]),
            Ok(json!({ "title": "Renamed Game" }))
        );
        assert_eq!(
            overrides_get_all_with(&ctx, &[])
                .unwrap()
                .as_object()
                .unwrap()
                .len(),
            3
        );
    }

    #[test]
    fn rpc_attach_adds_the_override_or_returns_the_game_unchanged() {
        let home = FakeHome::new("info-dispatch-");
        let ctx = overrides_ctx(&home, "get-present");
        let with = overrides_attach_with(
            &ctx,
            &[json!({ "gameInfo": { "app_name": "app2", "title": "Game 2" } })],
        )
        .unwrap();
        assert_eq!(with["overrides"]["title"], "Other");
        assert_eq!(with["title"], "Game 2");
        let game = json!({ "app_name": "app7", "title": "Game 7" });
        assert_eq!(
            overrides_attach_with(&ctx, &[json!({ "gameInfo": game })]),
            Ok(game)
        );
    }

    #[test]
    fn the_override_rpc_ops_reject_bad_args_before_the_crate_and_answer_not_ready() {
        let home = FakeHome::new("info-dispatch-");
        let ctx = test_ctx(&home, None);
        assert_eq!(
            overrides_set_with(&ctx, &[json!({ "appName": "a" })]),
            Err("info_overrides_set:bad-args".to_string())
        );
        // Unknown fields reach the crate's `deny_unknown_fields` struct, which rejects them alike.
        assert_eq!(
            overrides_set_with(
                &ctx,
                &[json!({ "appName": "a", "overrideData": {}, "x": 1 })]
            ),
            Err("info_overrides_set:bad-args".to_string())
        );
        assert_eq!(
            overrides_get_with(&ctx, &[json!({ "appName": 1 })]),
            Err("info_overrides_get:bad-args".to_string())
        );
        assert_eq!(
            overrides_attach_with(&ctx, &[]),
            Err("info_overrides_attach:bad-args".to_string())
        );
        assert!(!home
            .root()
            .join("userData/store/game-overrides.json")
            .exists());
        // No test installs the global context, so these are the pre-install answers.
        assert!(info_ctx().is_none());
        assert_eq!(
            rpc_info_overrides_set(&[json!({ "appName": "a", "overrideData": {} })]),
            Err("info_overrides_set:not-ready".to_string())
        );
        assert_eq!(
            rpc_info_overrides_get_all(&[]),
            Err("info_overrides_get_all:not-ready".to_string())
        );
    }

    #[test]
    fn the_anticheat_rpc_ops_reject_bad_args_before_the_crate_and_answer_not_ready() {
        let home = FakeHome::new("info-dispatch-");
        let ctx = test_ctx(&home, None);
        for (result, op) in [
            (anticheat_info_with(&ctx, &[]), "info_anticheat_info"),
            (
                anticheat_info_with(&ctx, &[json!({ "appNamespace": 1 })]),
                "info_anticheat_info",
            ),
            (
                anticheat_status_with(&ctx, &[json!({ "latestFileHash": 1 })]),
                "info_anticheat_status",
            ),
            // Unknown fields reach the crate's `deny_unknown_fields` struct, which rejects them alike.
            (
                anticheat_status_with(&ctx, &[json!({ "x": 1 })]),
                "info_anticheat_status",
            ),
            (
                anticheat_download_with(&ctx, &[json!({ "x": 1 })]),
                "info_anticheat_download",
            ),
            (
                anticheat_download_with(&ctx, &[]),
                "info_anticheat_download",
            ),
        ] {
            assert_eq!(result, Err(format!("{op}:bad-args")), "{op}");
        }
        // Windows-free golden answers through the arms: no file, so a download is needed.
        assert_eq!(
            anticheat_status_with(&ctx, &[json!({})]),
            Ok(json!({ "needed": true }))
        );
        assert_eq!(
            anticheat_info_with(&ctx, &[json!({ "appNamespace": "abc" })]),
            Ok(Value::Null)
        );
        // No test installs the global context, so these are the pre-install answers.
        assert!(info_ctx().is_none());
        assert_eq!(
            rpc_info_anticheat_info(&[json!({})]),
            Err("info_anticheat_info:not-ready".to_string())
        );
        assert_eq!(
            rpc_info_anticheat_status(&[json!({})]),
            Err("info_anticheat_status:not-ready".to_string())
        );
        assert_eq!(
            rpc_info_anticheat_download(&[json!({})]),
            Err("info_anticheat_download:not-ready".to_string())
        );
    }

    #[test]
    fn the_gog_discounts_rpc_op_validates_first_runs_the_crate_and_never_logs_the_token() {
        let home = FakeHome::new("info-dispatch-");
        let mut ctx = test_ctx(&home, None);
        let canned = Arc::new(CannedCatalog(Mutex::new(Vec::new())));
        ctx.http = canned.clone();
        let lines = Arc::new(KeptLines(Mutex::new(Vec::new())));
        ctx.log = Some(lines.clone());
        let locale = json!({ "countryCode": "US", "locale": "en-US", "currencyCode": "USD" });
        for bad in [
            vec![],
            vec![json!({})],
            vec![json!({ "locale": locale, "hideOwned": 1, "wishlistOnly": false, "token": null })],
            vec![
                json!({ "locale": locale, "hideOwned": false, "wishlistOnly": false, "token": 5 }),
            ],
        ] {
            assert_eq!(
                gog_discounts_with(&ctx, &bad),
                Err("info_gog_discounts:bad-args".to_string()),
                "{bad:?}"
            );
        }
        assert!(canned.0.lock().unwrap().is_empty());
        // A good call: one request, the token in the header and nowhere else.
        let answer = gog_discounts_with(
            &ctx,
            &[json!({
                "locale": locale, "hideOwned": true, "wishlistOnly": false, "token": "TOKEN-VALUE"
            })],
        );
        assert_eq!(answer, Ok(json!([{ "id": "1", "title": "Game" }])));
        let seen = canned.0.lock().unwrap();
        assert_eq!(seen.len(), 1);
        assert!(!seen[0].url.contains("TOKEN-VALUE"));
        assert!(seen[0]
            .headers
            .iter()
            .any(|(k, v)| k == "Authorization" && v == "Bearer TOKEN-VALUE"));
        assert!(lines
            .0
            .lock()
            .unwrap()
            .iter()
            .all(|l| !l.contains("TOKEN-VALUE")));
        // No test installs the global context, so this is the pre-install answer.
        assert!(info_ctx().is_none());
        assert_eq!(
            rpc_info_gog_discounts(&[json!({})]),
            Err("info_gog_discounts:not-ready".to_string())
        );
    }

    #[test]
    fn the_crossover_rating_map_rpc_op_validates_first_and_answers_the_crates_map() {
        let home = FakeHome::new("info-dispatch-");
        let mut ctx = test_ctx(&home, None);
        let canned = Arc::new(CannedCatalog(Mutex::new(Vec::new())));
        ctx.http = canned.clone();
        let game = json!({ "appName": "1245620", "title": "Elden Ring", "runner": "steam" });
        for bad in [
            vec![],
            vec![json!({})],
            vec![json!({ "games": "none" })],
            vec![json!({ "games": [{ "appName": "1", "title": "t" }] })],
            vec![json!({ "games": [], "extra": true })],
            vec![json!({ "games": [{ "appName": "1", "title": "t", "runner": "steam", "x": 1 }] })],
            // A name that is not a runner rejects the whole call, as the TS table lookup threw.
            vec![json!({ "games": [{ "appName": "1", "title": "t", "runner": "humble" }] })],
            vec![json!({ "games": [] }), json!({ "games": [] })],
        ] {
            assert_eq!(
                crossover_rating_map_with(&ctx, &bad),
                Err("info_crossover_rating_map:bad-args".to_string()),
                "{bad:?}"
            );
        }
        // Off macOS the map is empty and the index is never asked for.
        assert_eq!(
            crossover_rating_map_with(&ctx, &[json!({ "games": [game.clone()] })]),
            Ok(json!({}))
        );
        assert!(canned.0.lock().unwrap().is_empty());
        // On macOS the index is fetched once for the pass; this server's answer is not a gzip, so the
        // index is unavailable and the eligible game is "looked up, not found".
        ctx.platform = Platform::Mac;
        assert_eq!(
            crossover_rating_map_with(&ctx, &[json!({ "games": [game.clone(), game] })]),
            Ok(json!({ "1245620": null }))
        );
        let seen = canned.0.lock().unwrap();
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0].url, gamelib_info::crossover::INDEX_URL);
        // No test installs the global context, so this is the pre-install answer.
        assert!(info_ctx().is_none());
        assert_eq!(
            rpc_info_crossover_rating_map(&[json!({ "games": [] })]),
            Err("info_crossover_rating_map:not-ready".to_string())
        );
    }

    /// One catalog page with one product; remembers the request.
    struct CannedCatalog(Mutex<Vec<gamelib_info::http::Request>>);

    impl gamelib_info::http::Http for CannedCatalog {
        fn send(&self, request: gamelib_info::http::Request) -> gamelib_info::http::HttpFuture<'_> {
            self.0.lock().unwrap().push(request);
            Box::pin(async {
                Ok(gamelib_info::http::Response {
                    status: 200,
                    headers: Vec::new(),
                    body: br#"{"pages":1,"productCount":1,"products":[{"id":"1","title":"Game"}]}"#
                        .to_vec(),
                })
            })
        }
    }

    struct KeptLines(Mutex<Vec<String>>);

    impl InfoLog for KeptLines {
        fn line(&self, text: &str) {
            self.0.lock().unwrap().push(text.to_string());
        }
    }

    #[test]
    fn the_itad_key_source_word_follows_the_env_then_baked_precedence() {
        let some = |k: &str| Some(k.to_string());
        assert_eq!(itad_key_source_word(&some("e"), &some("b")), "env");
        assert_eq!(itad_key_source_word(&some("e"), &None), "env");
        assert_eq!(itad_key_source_word(&None, &some("b")), "baked");
        assert_eq!(itad_key_source_word(&None, &None), "none");
    }

    #[test]
    fn build_rs_reruns_when_the_baked_key_changes() {
        // The needle lives in build.rs, not in this file, so this cannot match itself.
        let build_rs = include_str!("../build.rs");
        assert_eq!(
            build_rs
                .matches("cargo:rerun-if-env-changed=ITAD_API_KEY")
                .count(),
            1
        );
        assert!(build_rs.contains("tauri_build::build()"));
    }

    /// A host that does nothing: `remove_recent` never reaches the native host.
    struct NoHost;
    impl crate::native_router::NativeHost for NoHost {
        fn open_url(&self, _url: String) {}
        fn reveal_path(&self, _path: String) {}
    }
}
