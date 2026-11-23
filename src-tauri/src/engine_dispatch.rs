//! The shell's side of the engine services (Phase 87, SVC-02): the one [`EngineCtx`] every later
//! engine and wine port is handed, over the Tauri-free `gamelib-engine` crate.
//!
//! D-20: one `Arc<EngineCtx>` is built in `run_setup` right after the store host opens, from the
//! shell's own paths, `SystemClock`, the platform, the app version, the process-wide
//! `gamelib_core::shutdown::global()`, `SpecProcRunner` (every child starts through `gamelib-proc`),
//! `ReqwestFetch` and the shell's `FrontendEmitter`. `NoDxvk` stays the DXVK installer until 87-29
//! injects the real one, and `ui` stays `None` until 87-18 wires the window-facing sinks. Building the
//! context spawns nothing, connects to nothing and waits for nothing: the HTTP client is built on
//! first use. Until [`install`] has run, an op answers `<op>:not-ready` (see `wine_dispatch`).

use super::*;

use std::path::{Path, PathBuf};

use gamelib_core::clock::SystemClock;
use gamelib_core::emitter::FrontendEmitter;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::fetch::ReqwestFetch;
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

/// Builds the context from its parts. Split from [`install`] so a unit test can build one without an
/// `AppHandle`. Nothing here spawns, connects or waits.
pub(crate) fn build_ctx(
    host: Arc<StoreHost>,
    user_data: &Path,
    user_home: PathBuf,
    temp: PathBuf,
    emitter: Arc<dyn FrontendEmitter>,
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
    .with_app_version(native_handlers::app_version())
}

/// Builds the one context and stores it. Called from `run_setup` after the store host opened and
/// before the sidecar is spawned. A second call is ignored (the first context stays).
pub(crate) fn install(app: &AppHandle, user_data: &Path) {
    let Some(user_home) = user_home() else {
        shell_log("engine context not installed: no home directory");
        return;
    };
    let ctx = build_ctx(
        Arc::clone(store_boot::host()),
        user_data,
        user_home,
        std::env::temp_dir(),
        Arc::new(steampoll_dispatch::TauriFrontendEmitter(app.clone())),
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
            emitter,
            Shutdown::new(),
        )
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
    fn dxvk_and_ui_stay_unwired_until_their_plans() {
        let ctx = built(Arc::new(Pushes::default()));
        // 87-18 wires the window-facing sinks, 87-29 the DXVK installer.
        assert!(ctx.ui.is_none());
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
