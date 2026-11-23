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

use super::*;

use std::path::{Path, PathBuf};

use gamelib_core::clock::SystemClock;
use gamelib_core::emitter::FrontendEmitter;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::fetch::ReqwestFetch;
use gamelib_engine::sinks::EngineUi;
use gamelib_proc::spec::SpecProcRunner;
use gamelib_store::host::StoreHost;

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
}
