//! The shell's side of the engine services (Phase 87, SVC-02): the one [`EngineCtx`] every later
//! engine and wine port is handed, over the Tauri-free `gamelib-engine` crate.
//!
//! D-20: one `Arc<EngineCtx>` is built in `run_setup` right after the store host opens, from the
//! shell's own paths, `SystemClock`, the platform, the app version, the process-wide
//! `gamelib_core::shutdown::global()`, `SpecProcRunner` (every child starts through `gamelib-proc`),
//! `ReqwestFetch` and the shell's `FrontendEmitter`. `NoDxvk` stays the DXVK installer until 87-29
//! injects the real one. The context's `ui` is the [`ShellEngineUi`] (87-18, D-02, D-10): the one shell
//! path for a notification, an in-app dialog, a main-window raise and a frame for the sidecar, so every
//! Rust slice that needs one (the wine manager first, 87-20) reaches it through `ctx.ui`. Building the
//! context spawns nothing, connects to nothing and waits for nothing: the HTTP client is built on
//! first use. Until [`install`] has run, an op answers `<op>:not-ready` (see `wine_dispatch`).
//!
//! 87-28 (D-14, D-25 (b)): the `engine` native slice serves `getPerGameBottleName`, `listEngineOptions`
//! and `getDefaultEngine` over the crate's `engine_*` ops, and the context's `default_wine` and
//! `crossover_bin_dir` hooks are filled here from `gamelib-wine`'s discovery (the shell depends on both
//! crates; `gamelib-engine` names no `gamelib-wine`). Each decode is strict and runs before the context
//! is looked at, and a rejection is a fixed literal that never echoes the caller's value (T-87-26).

use super::*;

use std::path::{Path, PathBuf};

use gamelib_core::clock::SystemClock;
use gamelib_core::emitter::FrontendEmitter;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{
    CrossoverBinDirHook, DefaultWineHook, EngineCtx, EnginePaths, Platform, WineInstallationView,
};
use gamelib_engine::fetch::ReqwestFetch;
use gamelib_engine::sinks::EngineUi;
use gamelib_proc::spec::SpecProcRunner;
use gamelib_store::host::StoreHost;
use gamelib_wine::discovery::default_wine::{default_wine_from_path, is_executable_file};

/// The one context, set once by [`install`].
static ENGINE_CTX: OnceLock<Arc<EngineCtx>> = OnceLock::new();

/// The installed context, or `None` before [`install`] (and in a unit test that built its own).
pub(crate) fn engine_ctx() -> Option<&'static Arc<EngineCtx>> {
    ENGINE_CTX.get()
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

/// The operator's home directory as the shell reads it, the same way `native_log_paths` does: the
/// crate reads no environment of its own. `None` when neither variable is set, in which case no
/// engine context is installed and every op answers not-ready.
fn user_home() -> Option<PathBuf> {
    std::env::var("HOME")
        .ok()
        .or_else(|| std::env::var("USERPROFILE").ok())
        .filter(|home| !home.is_empty())
        .map(PathBuf::from)
}

/// One way the shell reaches the operator or the sidecar, as a plain function so a test can record
/// what the [`ShellEngineUi`] did without an `AppHandle`.
type NotifySink = Box<dyn Fn(&str, &str) + Send + Sync>;
type RaiseSink = Box<dyn Fn() + Send + Sync>;
type SidecarSink = Box<dyn Fn(&str, Vec<Value>) + Send + Sync>;

/// The shell's [`EngineUi`] (D-02, D-10): what an engine op says to the operator.
///
/// - `notify` is the OS notification through `notification_show::show_notification`, the one delivery
///   path `Notification.show()` and the steampoll host share, with the title and body unchanged.
/// - `show_dialog` is the TS `showDialog` frame (`dialog.ts` `showDialogBoxModalAuto`: title, message,
///   type, no buttons, the ack id) pushed through the shell's [`FrontendEmitter`], so the renderer's
///   dialog handler is unchanged. It reports `true` once the frame is pushed; a push that reaches no
///   window is the emitter's silent drop, exactly as the sidecar's `sendFrontendMessage` reports it.
///   Raising a hidden window for the dialog is the caller's (`raise_main_window`), not this method's.
/// - `raise_main_window` is `app_lifecycle::rpc_main_window_raise`, the function the
///   `RUST_MAIN_WINDOW_RAISE` arm calls.
/// - `send_to_sidecar` is a `kind: "send"` frame written to the sidecar's stdin; with no sidecar (not
///   yet spawned, or gone) it is dropped, as `sidecar_send` treats a dead pipe.
///
/// Nothing here logs a title, a body or an argument (a title can carry a game name and a body a path).
pub(crate) struct ShellEngineUi {
    emitter: Arc<dyn FrontendEmitter>,
    notify: NotifySink,
    raise: RaiseSink,
    sidecar: SidecarSink,
}

impl ShellEngineUi {
    /// The production sinks over the app handle and the sidecar's state.
    pub(crate) fn for_app(app: &AppHandle, emitter: Arc<dyn FrontendEmitter>) -> ShellEngineUi {
        let notify_app = app.clone();
        let raise_app = app.clone();
        ShellEngineUi {
            emitter,
            notify: Box::new(move |title, body| {
                if notification_show::show_notification(&notify_app, Some(title), Some(body))
                    .is_err()
                {
                    shell_log("engine notification could not be shown");
                }
            }),
            raise: Box::new(move || {
                let _ = app_lifecycle::rpc_main_window_raise(&raise_app);
            }),
            sidecar: Box::new(send_frame_to_sidecar),
        }
    }

    /// A UI whose sinks are the given functions, for a test.
    #[cfg(test)]
    pub(crate) fn with_sinks(
        emitter: Arc<dyn FrontendEmitter>,
        notify: NotifySink,
        raise: RaiseSink,
        sidecar: SidecarSink,
    ) -> ShellEngineUi {
        ShellEngineUi {
            emitter,
            notify,
            raise,
            sidecar,
        }
    }

    /// A UI that pushes dialogs through `emitter` and does nothing else, for a test that only needs a
    /// context with a `ui`.
    #[cfg(test)]
    pub(crate) fn silent(emitter: Arc<dyn FrontendEmitter>) -> ShellEngineUi {
        ShellEngineUi::with_sinks(
            emitter,
            Box::new(|_, _| {}),
            Box::new(|| {}),
            Box::new(|_, _| {}),
        )
    }
}

impl EngineUi for ShellEngineUi {
    fn notify(&self, title: &str, body: &str) {
        (self.notify)(title, body);
    }

    fn show_dialog(&self, title: &str, body: &str, kind: &str, ack_id: &str) -> bool {
        // The TS frame's arguments, in order: title, message, type, buttons (`undefined` there, which
        // JSON carries as null), ackId.
        self.emitter.emit(
            "showDialog",
            vec![
                Value::String(title.to_string()),
                Value::String(body.to_string()),
                Value::String(kind.to_string()),
                Value::Null,
                Value::String(ack_id.to_string()),
            ],
        );
        true
    }

    fn raise_main_window(&self) {
        (self.raise)();
    }

    fn send_to_sidecar(&self, channel: &str, args: Vec<Value>) {
        (self.sidecar)(channel, args);
    }
}

/// Writes one `kind: "send"` frame to the sidecar, if there is one. A dead pipe is the sidecar being
/// gone, which its EOF handling owns, so the failure is not reported here.
fn send_frame_to_sidecar(channel: &str, args: Vec<Value>) {
    let Some(state) = store_dispatch::sidecar_state() else {
        return;
    };
    let frame = SidecarRpcRequest {
        id: state.next_id(),
        kind: "send",
        channel: channel.to_string(),
        args,
    };
    let _ = state.write_frame(&frame);
}

/// Builds the context from its parts. Split from [`install`] so a unit test can build one without an
/// `AppHandle`. Nothing here spawns, connects or waits.
pub(crate) fn build_ctx(
    host: Arc<StoreHost>,
    user_data: &Path,
    user_home: PathBuf,
    temp: PathBuf,
    emitter: Arc<dyn FrontendEmitter>,
    ui: Arc<dyn EngineUi>,
    shutdown: Shutdown,
) -> EngineCtx {
    let clock = Arc::new(SystemClock);
    EngineCtx::new(
        host,
        clock.clone(),
        platform(),
        EnginePaths {
            // `user_data` is both the user-data directory and the app folder (store_boot), and the
            // tools live under it exactly as `appPaths.ts` resolves them: `<appFolder>/tools`.
            app_folder: user_data.to_path_buf(),
            user_data: user_data.to_path_buf(),
            tools_path: user_data.join("tools"),
            user_home,
            temp,
        },
        shutdown,
    )
    .with_proc(Arc::new(SpecProcRunner))
    .with_fetch(Arc::new(ReqwestFetch::with_clock(clock)))
    .with_emitter(emitter)
    .with_ui(ui)
    .with_app_version(native_handlers::app_version())
    .with_default_wine(default_wine_hook(Arc::new(|| std::env::var("PATH").ok())))
    .with_crossover_bin_dir(crossover_bin_dir_hook())
}

/// The process `PATH` as the hook reads it each call (`None`: unset). A function so a test scripts it.
type PathSource = Arc<dyn Fn() -> Option<String> + Send + Sync>;

/// The shell's `EngineCtx.default_wine` (D-25 (b)): the first executable `wine` on `PATH`, answered by
/// `gamelib-wine`'s `default_wine_from_path`. It always answers an installation (`Default Wine - Not
/// Found` with an empty `bin` when there is none), as the TS `getDefaultWineBinary` did. Reading `PATH`
/// and probing files is blocking, which the hook's callers (a config read on the blocking pool) allow.
pub(crate) fn default_wine_hook(path: PathSource) -> DefaultWineHook {
    Arc::new(move || {
        let found = default_wine_from_path(
            path().as_deref(),
            &is_executable_file,
            &|candidate: &Path| candidate.exists(),
        );
        // `WineKind` serialises as the lower-case word the view carries; the field names are the same.
        serde_json::to_value(found)
            .ok()
            .and_then(|value| serde_json::from_value::<WineInstallationView>(value).ok())
    })
}

/// The tail of a CrossOver wine binary (`<app>/Contents/SharedSupport/CrossOver/bin/wine`).
const CROSSOVER_WINE_SUFFIX: &str = "/SharedSupport/CrossOver/bin/wine";
/// A CrossOver bundle's `bin` directory under the app (`crossoverLocation.ts`'s probe candidates).
const CROSSOVER_BIN_SUBPATH: &str = "Contents/SharedSupport/CrossOver/bin";

/// A `bin` directory that holds `cxbottle` (the TS `hasCxbottle`).
fn has_cxbottle(dir: &Path) -> bool {
    dir.join("cxbottle").exists()
}

/// `crossoverLocation.ts`'s resolver over what it needs from outside: the two default install locations
/// first (`system_applications`, `/Applications` in production, and `<home>/Applications`), then the bins Spotlight reported (`discovered`, only
/// asked when neither default holds `cxbottle`). `None` is "CrossOver is not installed". Blocking.
pub(crate) fn locate_crossover_bin_dir(
    system_applications: &Path,
    user_home: &Path,
    discovered: impl FnOnce() -> Vec<String>,
) -> Option<String> {
    let defaults = [
        system_applications
            .join("CrossOver.app")
            .join(CROSSOVER_BIN_SUBPATH),
        user_home
            .join("Applications/CrossOver.app")
            .join(CROSSOVER_BIN_SUBPATH),
    ];
    if let Some(found) = defaults.iter().find(|dir| has_cxbottle(dir)) {
        return Some(found.to_string_lossy().into_owned());
    }
    discovered().into_iter().find_map(|bin| {
        let dir = bin
            .strip_suffix("/wine")
            .filter(|_| bin.ends_with(CROSSOVER_WINE_SUFFIX))?;
        has_cxbottle(Path::new(dir)).then(|| dir.to_string())
    })
}

/// The shell's `EngineCtx.crossover_bin_dir` (D-25): the CrossOver `bin` directory, from the two default
/// locations or the crate's `discover_crossover` (one `mdfind` with its own 10 s limit, macOS only).
/// The wine context is looked up at call time, not at build time: it is built from this context.
pub(crate) fn crossover_bin_dir_hook() -> CrossoverBinDirHook {
    Arc::new(|| {
        Box::pin(async {
            let engine = engine_ctx()?;
            if engine.platform != Platform::Mac {
                return None;
            }
            let home = engine.paths.user_home.clone();
            // The sync probe first: it needs no process.
            if let Some(found) =
                locate_crossover_bin_dir(Path::new("/Applications"), &home, Vec::new)
            {
                return Some(found);
            }
            let wine = wine_dispatch::wine_ctx()?;
            let bins: Vec<String> = gamelib_wine::discovery::discover_crossover(wine)
                .await
                .into_iter()
                .map(|installation| installation.bin)
                .collect();
            locate_crossover_bin_dir(Path::new("/Applications"), &home, move || bins)
        })
    })
}

/// Builds the one context and stores it. Called from `run_setup` after the store host opened and
/// before the sidecar is spawned. A second call is ignored (the first context stays).
pub(crate) fn install(app: &AppHandle, user_data: &Path) {
    let Some(user_home) = user_home() else {
        shell_log("engine context not installed: no home directory");
        return;
    };
    let emitter: Arc<dyn FrontendEmitter> =
        Arc::new(steampoll_dispatch::TauriFrontendEmitter(app.clone()));
    let ui = Arc::new(ShellEngineUi::for_app(app, Arc::clone(&emitter)));
    let ctx = build_ctx(
        Arc::clone(store_boot::host()),
        user_data,
        user_home,
        std::env::temp_dir(),
        emitter,
        ui,
        gamelib_core::shutdown::global().clone(),
    );
    let _ = ENGINE_CTX.set(Arc::new(ctx));
}

/// What a rejected argument looks like: the JSON path and the zod-vocabulary code. Fixed literals only,
/// never the renderer's value (T-87-26).
type Rejection = (&'static str, &'static str);

/// `nonEmptyString(max)` as zod counts it: 1 to `max` UTF-16 code units.
fn bounded_string(
    value: Option<&Value>,
    max: usize,
    path: &'static str,
) -> Result<String, Rejection> {
    let Some(Value::String(text)) = value else {
        return Err((path, "invalid_type"));
    };
    match text.encode_utf16().count() {
        0 => Err((path, "too_small")),
        n if n > max => Err((path, "too_big")),
        _ => Ok(text.clone()),
    }
}

/// The one object argument every engine channel starts from: exactly one argument, a plain object.
fn one_object(args: &[Value]) -> Result<&serde_json::Map<String, Value>, Rejection> {
    match args {
        [] => Err(("(args)", "too_small")),
        [Value::Object(map)] => Ok(map),
        [_] => Err(("0", "invalid_type")),
        _ => Err(("(args)", "too_big")),
    }
}

/// The game identity of `engine.ts`: `{runner, appName}`, strict, the runner 1 to 64 units and the
/// app name 1 to 4096. Returns the object the crate ops take, rebuilt from the two decoded strings.
fn parse_game_identity(map: &serde_json::Map<String, Value>) -> Result<Value, Rejection> {
    if map.keys().any(|key| key != "runner" && key != "appName") {
        return Err(("0", "unrecognized_keys"));
    }
    let runner = bounded_string(map.get("runner"), 64, "0.runner")?;
    let app_name = bounded_string(map.get("appName"), 4096, "0.appName")?;
    Ok(serde_json::json!({ "runner": runner, "appName": app_name }))
}

/// The one decoded game of `getPerGameBottleName`: `[{runner, appName}]`.
fn parse_game_args(args: &[Value]) -> Result<Vec<Value>, Rejection> {
    Ok(vec![parse_game_identity(one_object(args)?)?])
}

/// Runs `op` over `args` on the blocking pool. The crate's async `dispatch` is driven with `block_on`
/// there (never `dispatch_sync`, which refuses a thread inside a runtime), so a file read stays off the
/// async workers and the op still holds its shutdown registrant.
async fn run_engine_op(
    engine: Arc<EngineCtx>,
    op: &'static str,
    args: Vec<Value>,
    failed: &'static str,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        tauri::async_runtime::block_on(gamelib_engine::dispatch(op, &args, &engine))
    })
    .await
    .map_err(|_| failed.to_string())?
}

/// The body of `getPerGameBottleName`: decode first, then the crate's `engine_per_game_bottle_name`.
/// The name is always computed from the game identity, never taken from the caller (T-87-27). `engine` is
/// the installed context, passed in so a test drives this over a real one.
async fn get_per_game_bottle_name_channel(
    engine: Option<Arc<EngineCtx>>,
    args: Vec<Value>,
) -> Result<Value, String> {
    let op_args = parse_game_args(&args)
        .map_err(|(path, code)| invalid_args("getPerGameBottleName", &[path], &[code]))?;
    let engine = engine.ok_or_else(|| "getPerGameBottleName: not ready".to_string())?;
    run_engine_op(
        engine,
        "engine_per_game_bottle_name",
        op_args,
        "getPerGameBottleName: the lookup did not finish",
    )
    .await
}

/// The native `getPerGameBottleName` handler (slice `engine`, D-14): the per-game bottle name the install
/// dialogs show, `null` for a game with none, answered by the crate's `engine_per_game_bottle_name`.
pub(crate) fn get_per_game_bottle_name(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(get_per_game_bottle_name_channel(
        engine_ctx().cloned(),
        args,
    ))
}

/// `listEngineOptions`'s one argument: a game identity, or the strict `{appName: 'default'}` (the global
/// settings picker). Anything else is the union's one rejection.
fn parse_list_args(args: &[Value]) -> Result<Vec<Value>, Rejection> {
    let map = one_object(args)?;
    if let Ok(game) = parse_game_identity(map) {
        return Ok(vec![game]);
    }
    let is_default =
        map.len() == 1 && map.get("appName").and_then(Value::as_str) == Some("default");
    if is_default {
        return Ok(vec![serde_json::json!({ "appName": "default" })]);
    }
    Err(("0", "invalid_union"))
}

/// The body of `listEngineOptions`: decode first, then the crate's `engine_list_options`.
async fn list_engine_options_channel(
    engine: Option<Arc<EngineCtx>>,
    args: Vec<Value>,
) -> Result<Value, String> {
    let op_args = parse_list_args(&args)
        .map_err(|(path, code)| invalid_args("listEngineOptions", &[path], &[code]))?;
    let engine = engine.ok_or_else(|| "listEngineOptions: not ready".to_string())?;
    run_engine_op(
        engine,
        "engine_list_options",
        op_args,
        "listEngineOptions: the list did not finish",
    )
    .await
}

/// The native `listEngineOptions` handler (slice `engine`, D-14): the engine picker's rows for a game or
/// for the global default, answered by the crate's `engine_list_options`.
pub(crate) fn list_engine_options(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(list_engine_options_channel(engine_ctx().cloned(), args))
}

/// The body of `getDefaultEngine`: it takes no argument, then the crate's `engine_default_engine`. The
/// default Wine it derives from is the context's `default_wine` hook (the Rust PATH rule, D-25 (b)).
async fn get_default_engine_channel(
    engine: Option<Arc<EngineCtx>>,
    args: Vec<Value>,
) -> Result<Value, String> {
    if !args.is_empty() {
        return Err(invalid_args("getDefaultEngine", &["(args)"], &["too_big"]));
    }
    let engine = engine.ok_or_else(|| "getDefaultEngine: not ready".to_string())?;
    run_engine_op(
        engine,
        "engine_default_engine",
        Vec::new(),
        "getDefaultEngine: the lookup did not finish",
    )
    .await
}

/// The native `getDefaultEngine` handler (slice `engine`, D-14): the global default engine, derived or
/// stored, answered by the crate's `engine_default_engine`.
pub(crate) fn get_default_engine(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(get_default_engine_channel(engine_ctx().cloned(), args))
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_engine::dxvk::{DxvkAction, DxvkRequest, DxvkTool};

    /// Keeps the channels pushed through it.
    #[derive(Default)]
    struct Pushes(Mutex<Vec<String>>);

    impl FrontendEmitter for Pushes {
        fn emit(&self, channel: &str, _args: Vec<Value>) {
            self.0
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .push(channel.to_string());
        }
    }

    fn built(emitter: Arc<dyn FrontendEmitter>) -> EngineCtx {
        build_ctx(
            Arc::new(StoreHost::new()),
            Path::new("/fake/userData"),
            PathBuf::from("/fake/home"),
            PathBuf::from("/fake/tmp"),
            Arc::clone(&emitter),
            Arc::new(ShellEngineUi::silent(emitter)),
            Shutdown::new(),
        )
    }

    /// What a recording UI saw, in order: a tag and the argument it carried.
    type Seen = Arc<Mutex<Vec<String>>>;

    fn recording_ui(emitter: Arc<dyn FrontendEmitter>, seen: &Seen) -> ShellEngineUi {
        let (notified, raised, sent) = (Arc::clone(seen), Arc::clone(seen), Arc::clone(seen));
        ShellEngineUi::with_sinks(
            emitter,
            Box::new(move |title, body| {
                notified
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .push(format!("notify {title}|{body}"));
            }),
            Box::new(move || {
                raised
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .push("raise".to_string());
            }),
            Box::new(move |channel, args| {
                sent.lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .push(format!("send {channel} {}", Value::Array(args)));
            }),
        )
    }

    /// Keeps the full payload of what is pushed through it.
    #[derive(Default)]
    struct Frames(Mutex<Vec<(String, Vec<Value>)>>);

    impl FrontendEmitter for Frames {
        fn emit(&self, channel: &str, args: Vec<Value>) {
            self.0
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .push((channel.to_string(), args));
        }
    }

    #[test]
    fn the_context_is_built_from_the_shell_paths_and_version() {
        let ctx = built(Arc::new(Pushes::default()));
        assert_eq!(ctx.paths.app_folder, Path::new("/fake/userData"));
        assert_eq!(ctx.paths.user_data, Path::new("/fake/userData"));
        assert_eq!(
            ctx.paths.tools_path,
            Path::new("/fake/userData").join("tools")
        );
        assert_eq!(ctx.paths.user_home, Path::new("/fake/home"));
        assert_eq!(ctx.paths.temp, Path::new("/fake/tmp"));
        assert_eq!(ctx.app_version, env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn dxvk_stays_unwired_until_its_plan_and_the_ui_is_installed() {
        let ctx = built(Arc::new(Pushes::default()));
        // 87-18 wires the window-facing sinks, 87-29 the DXVK installer.
        assert!(ctx.ui.is_some());
        let request = DxvkRequest {
            settings: serde_json::json!({}),
            tool: DxvkTool::Dxvk,
            action: DxvkAction::Backup,
            source: None,
        };
        assert!(!tauri::async_runtime::block_on(
            ctx.dxvk.install_remove(request)
        ));
    }

    #[test]
    fn the_installed_ui_notifies_with_the_title_and_body_unchanged() {
        let seen: Seen = Arc::default();
        let ui = recording_ui(Arc::new(Pushes::default()), &seen);
        ui.notify("Wine is ready", "C:\\Users\\a|b");
        assert_eq!(
            seen.lock().unwrap().as_slice(),
            ["notify Wine is ready|C:\\Users\\a|b"]
        );
    }

    #[test]
    fn the_installed_ui_shows_a_dialog_as_the_ts_show_dialog_frame_with_the_ack_id() {
        let frames = Arc::new(Frames::default());
        let seen: Seen = Arc::default();
        let ui = recording_ui(Arc::clone(&frames) as Arc<dyn FrontendEmitter>, &seen);
        assert!(ui.show_dialog("Title", "Body", "MESSAGE", "engine:1"));
        let pushed = frames.0.lock().unwrap();
        assert_eq!(pushed.len(), 1);
        assert_eq!(pushed[0].0, "showDialog");
        assert_eq!(
            pushed[0].1,
            vec![
                serde_json::json!("Title"),
                serde_json::json!("Body"),
                serde_json::json!("MESSAGE"),
                Value::Null,
                serde_json::json!("engine:1"),
            ]
        );
        // The dialog is a frame for the renderer: nothing was notified, raised or sent to the sidecar.
        assert!(seen.lock().unwrap().is_empty());
    }

    #[test]
    fn the_installed_ui_raises_the_window_and_sends_a_frame_with_its_channel_and_args() {
        let seen: Seen = Arc::default();
        let ui = recording_ui(Arc::new(Pushes::default()), &seen);
        ui.raise_main_window();
        ui.send_to_sidecar("bottleChanged", vec![serde_json::json!({ "name": "x" })]);
        assert_eq!(
            seen.lock().unwrap().as_slice(),
            ["raise", "send bottleChanged [{\"name\":\"x\"}]"]
        );
    }

    #[test]
    fn a_context_built_over_a_fake_home_carries_the_recording_ui() {
        let home = gamelib_testutil::FakeHome::new("engine-ui-");
        let frames = Arc::new(Frames::default());
        let seen: Seen = Arc::default();
        let emitter: Arc<dyn FrontendEmitter> = Arc::clone(&frames) as Arc<dyn FrontendEmitter>;
        let ctx = build_ctx(
            Arc::new(StoreHost::new()),
            home.root(),
            home.root().join("home"),
            home.root().join("tmp"),
            Arc::clone(&emitter),
            Arc::new(recording_ui(emitter, &seen)),
            Shutdown::new(),
        );
        let ui = ctx.ui.as_ref().expect("the context has a ui");
        ui.notify("t", "b");
        ui.raise_main_window();
        ui.send_to_sidecar("c", vec![]);
        assert!(ui.show_dialog("t", "b", "ERROR", "engine:2"));
        assert_eq!(
            seen.lock().unwrap().as_slice(),
            ["notify t|b", "raise", "send c []"]
        );
        assert_eq!(frames.0.lock().unwrap().len(), 1);
    }

    #[test]
    fn the_shell_emitter_is_the_one_the_context_pushes_through() {
        let pushes = Arc::new(Pushes::default());
        let ctx = built(Arc::clone(&pushes) as Arc<dyn FrontendEmitter>);
        ctx.emitter
            .emit("gameStatusUpdate", vec![serde_json::json!(1)]);
        let seen = pushes.0.lock().unwrap_or_else(|e| e.into_inner());
        assert_eq!(seen.as_slice(), ["gameStatusUpdate"]);
    }

    #[test]
    fn no_context_is_installed_until_run_setup_installs_one() {
        assert!(engine_ctx().is_none());
    }

    fn engine_over_fake_home(home: &gamelib_testutil::FakeHome) -> Arc<EngineCtx> {
        let emitter: Arc<dyn FrontendEmitter> = Arc::new(Pushes::default());
        Arc::new(build_ctx(
            Arc::new(StoreHost::new()),
            home.root(),
            home.root().join("home"),
            home.root().join("tmp"),
            Arc::clone(&emitter),
            Arc::new(ShellEngineUi::silent(emitter)),
            Shutdown::new(),
        ))
    }

    fn block<T>(future: impl std::future::Future<Output = T>) -> T {
        tauri::async_runtime::block_on(future)
    }

    /// The fixed-literal tail of an invalid-args rejection: its paths and codes.
    fn rejection(err: &str) -> (Vec<String>, Vec<String>) {
        let payload: Value =
            serde_json::from_str(err.strip_prefix(IPC_INVALID_ARGS_MARKER).unwrap().trim())
                .expect("the marker carries JSON");
        let list = |key: &str| -> Vec<String> {
            payload[key]
                .as_array()
                .unwrap()
                .iter()
                .map(|v| v.as_str().unwrap().to_string())
                .collect()
        };
        (list("paths"), list("codes"))
    }

    #[test]
    fn get_per_game_bottle_name_decodes_one_strict_game_identity() {
        let game = serde_json::json!({"runner": "gog", "appName": "1234"});
        assert_eq!(parse_game_args(&[game.clone()]), Ok(vec![game]));
        let long_runner = "r".repeat(65);
        let cases: Vec<(Vec<Value>, Rejection)> = vec![
            (vec![], ("(args)", "too_small")),
            (vec![serde_json::json!(1)], ("0", "invalid_type")),
            (vec![Value::Null], ("0", "invalid_type")),
            (
                vec![serde_json::json!({"runner": "gog"})],
                ("0.appName", "invalid_type"),
            ),
            (
                vec![serde_json::json!({"runner": "", "appName": "a"})],
                ("0.runner", "too_small"),
            ),
            (
                vec![serde_json::json!({"runner": long_runner, "appName": "a"})],
                ("0.runner", "too_big"),
            ),
            (
                vec![serde_json::json!({"runner": "gog", "appName": "a", "extra": 1})],
                ("0", "unrecognized_keys"),
            ),
            (
                vec![
                    serde_json::json!({"runner": "gog", "appName": "a"}),
                    serde_json::json!({}),
                ],
                ("(args)", "too_big"),
            ),
        ];
        for (args, expected) in cases {
            assert_eq!(parse_game_args(&args), Err(expected), "{args:?}");
        }
    }

    #[test]
    fn get_per_game_bottle_name_rejects_before_looking_at_the_context_and_answers_not_ready() {
        // A bad call is the same rejection with or without a context.
        let err = block(get_per_game_bottle_name_channel(None, vec![])).unwrap_err();
        assert!(err.starts_with(IPC_INVALID_ARGS_MARKER), "{err}");
        assert_eq!(
            rejection(&err),
            (vec!["(args)".to_string()], vec!["too_small".to_string()])
        );
        // A hostile value is never echoed.
        let hostile = serde_json::json!({"runner": "gog", "appName": "x", "secret-key": "hunter2"});
        let err = block(get_per_game_bottle_name_channel(None, vec![hostile])).unwrap_err();
        assert!(
            !err.contains("hunter2") && !err.contains("secret-key"),
            "{err}"
        );
        // A good call before the install is not-ready, not a rejection.
        let game = serde_json::json!({"runner": "gog", "appName": "1234"});
        let err = block(get_per_game_bottle_name_channel(None, vec![game])).unwrap_err();
        assert_eq!(err, "getPerGameBottleName: not ready");
    }

    #[test]
    fn get_per_game_bottle_name_is_computed_by_the_crate_over_a_real_context() {
        let home = gamelib_testutil::FakeHome::new("engine-bottle-");
        let engine = engine_over_fake_home(&home);
        let named = block(get_per_game_bottle_name_channel(
            Some(Arc::clone(&engine)),
            vec![serde_json::json!({"runner": "gog", "appName": "1234"})],
        ))
        .unwrap();
        assert_eq!(named, serde_json::json!("GameLib-gog-1234"));
        // A Steam game has no per-game bottle name: the answer is null, as the TS gave.
        let steam = block(get_per_game_bottle_name_channel(
            Some(engine),
            vec![serde_json::json!({"runner": "steam", "appName": "620"})],
        ))
        .unwrap();
        assert!(steam.is_null());
    }

    /// A scripted `PATH`: one directory under the fake home holding the given executables.
    #[cfg(unix)]
    fn scripted_path(home: &gamelib_testutil::FakeHome, executables: &[&str]) -> String {
        use std::os::unix::fs::PermissionsExt;
        let dir = home.root().join("scripted-bin");
        std::fs::create_dir_all(&dir).unwrap();
        for name in executables {
            let file = dir.join(name);
            std::fs::write(&file, "#!/bin/sh\n").unwrap();
            std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        dir.to_string_lossy().into_owned()
    }

    /// The context a channel test runs over: the shell's build, with the default Wine read from the given
    /// scripted `PATH` and no CrossOver (the developer's real PATH and Spotlight are never consulted).
    #[cfg(unix)]
    fn engine_with_path(home: &gamelib_testutil::FakeHome, path: Option<String>) -> Arc<EngineCtx> {
        let emitter: Arc<dyn FrontendEmitter> = Arc::new(Pushes::default());
        let ctx = build_ctx(
            Arc::new(StoreHost::new()),
            home.root(),
            home.root().join("home"),
            home.root().join("tmp"),
            Arc::clone(&emitter),
            Arc::new(ShellEngineUi::silent(emitter)),
            Shutdown::new(),
        )
        .with_default_wine(default_wine_hook(Arc::new(move || path.clone())))
        .with_crossover_bin_dir(Arc::new(|| Box::pin(async { None })));
        Arc::new(ctx)
    }

    #[test]
    fn list_engine_options_decodes_a_game_or_the_default_picker() {
        let game = serde_json::json!({"runner": "legendary", "appName": "abc"});
        assert_eq!(parse_list_args(&[game.clone()]), Ok(vec![game]));
        let picker = serde_json::json!({"appName": "default"});
        assert_eq!(parse_list_args(&[picker.clone()]), Ok(vec![picker]));
        let cases: Vec<(Vec<Value>, Rejection)> = vec![
            (vec![], ("(args)", "too_small")),
            (vec![Value::Null], ("0", "invalid_type")),
            (vec![serde_json::json!("default")], ("0", "invalid_type")),
            (vec![serde_json::json!({})], ("0", "invalid_union")),
            (
                vec![serde_json::json!({"appName": "other"})],
                ("0", "invalid_union"),
            ),
            (
                vec![serde_json::json!({"appName": "default", "extra": 1})],
                ("0", "invalid_union"),
            ),
            (
                vec![serde_json::json!({"runner": "gog", "appName": "a", "extra": 1})],
                ("0", "invalid_union"),
            ),
            (
                vec![serde_json::json!({"appName": "default"}), Value::Null],
                ("(args)", "too_big"),
            ),
        ];
        for (args, expected) in cases {
            assert_eq!(parse_list_args(&args), Err(expected), "{args:?}");
        }
    }

    #[test]
    fn list_engine_options_and_get_default_engine_reject_before_the_context_and_answer_not_ready() {
        let err = block(list_engine_options_channel(None, vec![Value::Null])).unwrap_err();
        assert!(err.starts_with(IPC_INVALID_ARGS_MARKER), "{err}");
        let err = block(get_default_engine_channel(
            None,
            vec![serde_json::json!("x")],
        ))
        .unwrap_err();
        assert_eq!(
            rejection(&err),
            (vec!["(args)".to_string()], vec!["too_big".to_string()])
        );
        let picker = serde_json::json!({"appName": "default"});
        assert_eq!(
            block(list_engine_options_channel(None, vec![picker])).unwrap_err(),
            "listEngineOptions: not ready"
        );
        assert_eq!(
            block(get_default_engine_channel(None, vec![])).unwrap_err(),
            "getDefaultEngine: not ready"
        );
    }

    #[cfg(unix)]
    #[test]
    fn the_default_wine_hook_reads_the_scripted_path() {
        let home = gamelib_testutil::FakeHome::new("engine-path-");
        let path = scripted_path(&home, &["wine", "wineserver"]);
        let hook = default_wine_hook(Arc::new(move || Some(path.clone())));
        let wine = hook().expect("the hook always answers");
        assert_eq!(wine.name, "wine");
        assert_eq!(wine.kind, "wine");
        assert!(wine.bin.ends_with("scripted-bin/wine"), "{}", wine.bin);
        assert!(
            wine.wineserver
                .as_deref()
                .is_some_and(|s| s.ends_with("scripted-bin/wineserver")),
            "{wine:?}"
        );
        // No wine on PATH, or no PATH at all: the TS "not found" installation, with an empty bin.
        for none in [None, Some(String::new())] {
            let hook = default_wine_hook(Arc::new(move || none.clone()));
            let wine = hook().expect("the hook always answers");
            assert_eq!(wine.name, "Default Wine - Not Found");
            assert_eq!(wine.bin, "");
        }
    }

    #[cfg(unix)]
    #[test]
    fn get_default_engine_answers_the_ts_payload_for_a_populated_and_an_empty_profile() {
        // Populated: a wine on the scripted PATH is the default Wine a fresh profile names, a Legacy engine.
        let home = gamelib_testutil::FakeHome::new("engine-default-");
        let engine = engine_with_path(&home, Some(scripted_path(&home, &["wine"])));
        let populated = block(get_default_engine_channel(Some(engine), vec![])).unwrap();
        assert_eq!(populated["effectiveEngineId"], "legacy:wine", "{populated}");
        assert_eq!(populated["engineSource"], "derived");
        assert_eq!(populated["legacyLabel"], "wine");
        // Empty: nothing on PATH. The answer has the TS shape whatever the rule derives.
        let home = gamelib_testutil::FakeHome::new("engine-default-");
        let engine = engine_with_path(&home, None);
        let empty = block(get_default_engine_channel(Some(engine), vec![])).unwrap();
        let mut keys: Vec<&str> = empty
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        keys.sort_unstable();
        assert_eq!(keys, ["effectiveEngineId", "engineSource", "legacyLabel"]);
        assert!(empty["effectiveEngineId"].is_string(), "{empty}");
    }

    #[cfg(unix)]
    #[test]
    fn list_engine_options_answers_the_rows_for_the_picker_and_for_a_game() {
        let home = gamelib_testutil::FakeHome::new("engine-options-");
        let engine = engine_with_path(&home, Some(scripted_path(&home, &["wine"])));
        let picker = serde_json::json!({"appName": "default"});
        let rows = block(list_engine_options_channel(
            Some(Arc::clone(&engine)),
            vec![picker],
        ))
        .unwrap();
        let ids: Vec<&str> = rows
            .as_array()
            .expect("an array of rows")
            .iter()
            .map(|row| row["id"].as_str().unwrap())
            .collect();
        assert_eq!(ids[0], "automatic", "{rows}");
        assert!(ids.contains(&"crossover"), "{ids:?}");
        assert!(ids.iter().any(|id| id.starts_with("pinned:")), "{ids:?}");
        let crossover = rows
            .as_array()
            .unwrap()
            .iter()
            .find(|r| r["id"] == "crossover")
            .unwrap();
        assert_eq!(
            crossover["installed"], false,
            "the scripted hook finds no CrossOver"
        );
        // A game identity answers the same shape (an empty profile has no stored engine for it).
        let game = serde_json::json!({"runner": "gog", "appName": "1234"});
        let rows = block(list_engine_options_channel(Some(engine), vec![game])).unwrap();
        assert!(rows.is_array(), "{rows}");
    }

    #[test]
    fn locating_crossover_prefers_the_default_locations_and_only_then_asks_spotlight() {
        let root = gamelib_testutil::FakeHome::new("engine-cx-");
        let system = root.root().join("Applications");
        let home = root.root().join("home");
        let bin_in = |apps: &Path, app: &str| apps.join(app).join(CROSSOVER_BIN_SUBPATH);
        let make = |dir: &Path| {
            std::fs::create_dir_all(dir).unwrap();
            std::fs::write(dir.join("cxbottle"), "").unwrap();
        };
        let asked = std::cell::Cell::new(false);
        let spotlight = |bins: Vec<String>| {
            let asked = &asked;
            move || {
                asked.set(true);
                bins
            }
        };
        // Nothing installed and Spotlight knows nothing: CrossOver is not installed.
        assert_eq!(
            locate_crossover_bin_dir(&system, &home, spotlight(vec![])),
            None
        );
        // Spotlight knows a bundle elsewhere, but only a bin that holds cxbottle counts.
        let elsewhere = root.root().join("Elsewhere");
        let wine = bin_in(&elsewhere, "CrossOver.app").join("wine");
        let bins = vec![
            "/not/a/crossover/wine".to_string(),
            wine.to_string_lossy().into_owned(),
        ];
        assert_eq!(
            locate_crossover_bin_dir(&system, &home, spotlight(bins.clone())),
            None,
            "a bundle without cxbottle is not usable"
        );
        make(&bin_in(&elsewhere, "CrossOver.app"));
        assert_eq!(
            locate_crossover_bin_dir(&system, &home, spotlight(bins.clone())),
            Some(
                bin_in(&elsewhere, "CrossOver.app")
                    .to_string_lossy()
                    .into_owned()
            )
        );
        // The user's Applications folder, then the system one, win without asking Spotlight.
        asked.set(false);
        make(&bin_in(&home.join("Applications"), "CrossOver.app"));
        let found = locate_crossover_bin_dir(&system, &home, spotlight(bins.clone()));
        assert_eq!(
            found,
            Some(
                bin_in(&home.join("Applications"), "CrossOver.app")
                    .to_string_lossy()
                    .into_owned()
            )
        );
        assert!(!asked.get(), "the sync probe answered, so no mdfind");
        make(&bin_in(&system, "CrossOver.app"));
        assert_eq!(
            locate_crossover_bin_dir(&system, &home, spotlight(bins)),
            Some(
                bin_in(&system, "CrossOver.app")
                    .to_string_lossy()
                    .into_owned()
            )
        );
    }
}
