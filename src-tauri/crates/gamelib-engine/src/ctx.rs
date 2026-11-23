//! What every op is handed. The crate reads no environment variable and no profile path of its own:
//! the shell (or the CLI) builds one `EngineCtx` and every op takes `&EngineCtx`.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use gamelib_core::clock::Clock;
use gamelib_core::emitter::FrontendEmitter;
use gamelib_core::process::{BoxFuture, SpecRunner};
use gamelib_core::shutdown::Shutdown;
use gamelib_i18n::Catalog;
use gamelib_proc::spec::SpecProcRunner;
use gamelib_store::host::StoreHost;
use serde::{Deserialize, Serialize};

use crate::bottles::ledger::Ledger;
use crate::bottles::per_game::PerGameFlights;
use crate::bottles::registry::Registry;
use crate::bottles::switch::InFlightSwitches;
use crate::dxvk::{DxvkInstaller, NoDxvk};
use crate::fetch::{Fetch, ReqwestFetch};
use crate::sinks::{EngineLog, EngineUi, NullEmitter};

/// The version a context reports (the `User-Agent` of its requests) until the shell sets the app's.
pub const DEFAULT_APP_VERSION: &str = "0.0.0";

/// The platform the app runs on, as the shell reports it (the crate never asks the OS).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    Mac,
    Linux,
    Windows,
}

/// Directories the shell resolves. Store files live under `user_data` (`store_cache/<name>.json`);
/// `app_folder` holds the settings documents; `tools_path` is `<appFolder>/tools`, where engines,
/// runtimes and helper tools are installed; `user_home` is the operator's home directory as the
/// shell reads it (never the process environment of this crate).
#[derive(Debug, Clone)]
pub struct EnginePaths {
    pub app_folder: PathBuf,
    pub user_data: PathBuf,
    pub tools_path: PathBuf,
    pub user_home: PathBuf,
    pub temp: PathBuf,
}

/// A Wine installation as the shell's discovery reports it (the TS `WineInstallation`): the default
/// Wine a fresh profile's global settings name. `kind` is `wine`, `proton`, `crossover` or `toolkit`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WineInstallationView {
    pub bin: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lib: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lib32: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wineserver: Option<String>,
}

/// The default Wine (D-25 (b), D-04): the shell fills it from `gamelib-wine`'s
/// `default_wine_from_path`, so this crate never depends on that one. `None` is "no Wine on PATH
/// that the shell found", which is also what a headless context reports.
pub type DefaultWineHook = Arc<dyn Fn() -> Option<WineInstallationView> + Send + Sync>;

/// The CrossOver `bin` directory (D-25, same direction as the default Wine): the shell fills it from
/// `gamelib-wine`'s CrossOver discovery. `None` is "CrossOver is not installed".
pub type CrossoverBinDirHook = Arc<dyn Fn() -> BoxFuture<Option<String>> + Send + Sync>;

/// Everything an op needs from outside the crate. Fields are public so the shell can fill the ones
/// a later slice adds; [`EngineCtx::new`] gives each a neutral default, and the `with_*` methods
/// replace one (the shell's real sinks, a test's scripted fakes).
pub struct EngineCtx {
    /// The one owner of every store file (Phase 85). A store is opened through it, never by file
    /// I/O of this crate's own.
    pub host: Arc<StoreHost>,
    pub clock: Arc<dyn Clock>,
    pub platform: Platform,
    pub paths: EnginePaths,
    /// In-flight ops hold a registrant of this and race its token.
    pub shutdown: Shutdown,
    /// The one spawn seam (D-17): every child an op starts goes through it, so it is registered and
    /// reaped with GameLib. `SpecProcRunner` in the app, a scripted runner in the tests.
    pub proc: Arc<dyn SpecRunner>,
    /// The one network seam (D-08): JSON GETs and streamed downloads. `ReqwestFetch` in the app, a
    /// `Replay` of a recorded TS run in the golden tests.
    pub fetch: Arc<dyn Fetch>,
    /// The renderer push (`gameStatusUpdate`, the progress channels), the same payload the sidecar
    /// relay sends. A null emitter until the shell's is installed.
    pub emitter: Arc<dyn FrontendEmitter>,
    /// The window-facing sinks (notify, dialog, raise, send to the sidecar). `None` headless: a CLI
    /// run never opens a window or notifies anyone.
    pub ui: Option<Arc<dyn EngineUi>>,
    /// The engine's log. `None` headless.
    pub log: Option<Arc<dyn EngineLog>>,
    /// The translation catalog the notice texts resolve through. Empty until the shell loads one, so
    /// every lookup answers its inline default.
    pub i18n: Arc<Catalog>,
    /// DXVK, DXVK-NVAPI and vkd3d installs (D-25 (a)): `gamelib-wine` implements it and the shell
    /// injects it, so this crate never depends on that one. [`NoDxvk`] until then.
    pub dxvk: Arc<dyn DxvkInstaller>,
    /// The app's version, the `User-Agent` of every request (`fetch::user_agent`).
    pub app_version: String,
    /// The default Wine for the global settings (D-25 (b)). Reports none until the shell's is set.
    pub default_wine: DefaultWineHook,
    /// The CrossOver bin directory (D-25). Reports none until the shell's is set.
    pub crossover_bin_dir: CrossoverBinDirHook,
    /// Whether the app is online (the TS `onlineMonitor.isOnline()`): the shell sets it through op
    /// `engine_set_online` as its monitor changes. It starts `false`, the monitor's own first reading
    /// (`check-online`, not yet probed, behaves as not online). The DXMT fetch reads it; offline, a
    /// tool is not looked up.
    pub online: Arc<AtomicBool>,
    /// The running games of every bottle (D-16). In memory only: empty at construction.
    pub ledger: Ledger,
    /// The engine each running title launched with (D-07). In memory only: empty at construction.
    pub registry: Registry,
    /// The per-game bottle creations in flight, by bottle name (the single flight of `ensureGameBottle`).
    /// In memory only: empty at construction.
    pub flights: PerGameFlights,
    /// The bottle switches running or waiting, by bottle name (the TS `inFlightSwitches`, WR-02): one
    /// switch per bottle at a time. In memory only: empty at construction.
    pub in_flight: InFlightSwitches,
}

impl EngineCtx {
    pub fn new(
        host: Arc<StoreHost>,
        clock: Arc<dyn Clock>,
        platform: Platform,
        paths: EnginePaths,
        shutdown: Shutdown,
    ) -> EngineCtx {
        EngineCtx {
            // Built lazily: nothing here spawns, connects or waits.
            fetch: Arc::new(ReqwestFetch::with_clock(clock.clone())),
            proc: Arc::new(SpecProcRunner),
            emitter: Arc::new(NullEmitter),
            ui: None,
            log: None,
            i18n: Arc::new(Catalog::default()),
            dxvk: Arc::new(NoDxvk),
            app_version: DEFAULT_APP_VERSION.to_string(),
            default_wine: Arc::new(|| None),
            crossover_bin_dir: Arc::new(|| Box::pin(async { None })),
            online: Arc::new(AtomicBool::new(false)),
            ledger: Ledger::new(),
            registry: Registry::new(),
            flights: PerGameFlights::new(),
            in_flight: InFlightSwitches::new(),
            host,
            clock,
            platform,
            paths,
            shutdown,
        }
    }

    pub fn with_proc(mut self, proc: Arc<dyn SpecRunner>) -> EngineCtx {
        self.proc = proc;
        self
    }

    pub fn with_fetch(mut self, fetch: Arc<dyn Fetch>) -> EngineCtx {
        self.fetch = fetch;
        self
    }

    pub fn with_emitter(mut self, emitter: Arc<dyn FrontendEmitter>) -> EngineCtx {
        self.emitter = emitter;
        self
    }

    pub fn with_ui(mut self, ui: Arc<dyn EngineUi>) -> EngineCtx {
        self.ui = Some(ui);
        self
    }

    pub fn with_log(mut self, log: Arc<dyn EngineLog>) -> EngineCtx {
        self.log = Some(log);
        self
    }

    pub fn with_i18n(mut self, i18n: Arc<Catalog>) -> EngineCtx {
        self.i18n = i18n;
        self
    }

    pub fn with_dxvk(mut self, dxvk: Arc<dyn DxvkInstaller>) -> EngineCtx {
        self.dxvk = dxvk;
        self
    }

    pub fn with_app_version(mut self, app_version: impl Into<String>) -> EngineCtx {
        self.app_version = app_version.into();
        self
    }

    pub fn with_default_wine(mut self, default_wine: DefaultWineHook) -> EngineCtx {
        self.default_wine = default_wine;
        self
    }

    pub fn with_crossover_bin_dir(mut self, crossover_bin_dir: CrossoverBinDirHook) -> EngineCtx {
        self.crossover_bin_dir = crossover_bin_dir;
        self
    }

    /// Sets the online answer this context starts with.
    pub fn with_online(self, online: bool) -> EngineCtx {
        self.set_online(online);
        self
    }

    /// The online monitor's answer, as the shell last reported it.
    pub fn is_online(&self) -> bool {
        self.online.load(Ordering::Acquire)
    }

    /// Records the online monitor's answer (op `engine_set_online`).
    pub fn set_online(&self, online: bool) {
        self.online.store(online, Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dxvk::{DxvkAction, DxvkRequest, DxvkTool};
    use crate::fetch::FetchRequest;
    use crate::testing::{FixedClock, RecordingEmitter, RecordingLog, RecordingUi, ScriptedDxvk};
    use gamelib_core::process::{ProcSpec, SpecOutput};
    use gamelib_testutil::FakeHome;

    fn paths(home: &FakeHome) -> EnginePaths {
        let root = home.root().to_path_buf();
        EnginePaths {
            app_folder: root.clone(),
            user_data: root.clone(),
            tools_path: root.join("tools"),
            user_home: root.join("home"),
            temp: root.join("temp"),
        }
    }

    fn ctx(home: &FakeHome) -> EngineCtx {
        EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(FixedClock::new(1)),
            Platform::Linux,
            paths(home),
            Shutdown::new(),
        )
    }

    fn request() -> DxvkRequest {
        DxvkRequest {
            settings: serde_json::json!({}),
            tool: DxvkTool::Dxvk,
            action: DxvkAction::Backup,
            source: None,
        }
    }

    #[tokio::test]
    async fn new_fills_neutral_defaults() {
        let home = FakeHome::new("engine-ctx-");
        let ctx = ctx(&home);
        assert!(ctx.ui.is_none() && ctx.log.is_none());
        assert_eq!(ctx.app_version, DEFAULT_APP_VERSION);
        assert!((ctx.default_wine)().is_none());
        assert!((ctx.crossover_bin_dir)().await.is_none());
        // The monitor's first reading is "not yet probed", which behaves as not online.
        assert!(!ctx.is_online());
        ctx.set_online(true);
        assert!(ctx.is_online());
        // NoDxvk installs nothing; the null emitter swallows a push; the empty catalog answers the
        // inline default.
        assert!(!ctx.dxvk.install_remove(request()).await);
        ctx.emitter.emit("gameStatusUpdate", Vec::new());
        assert_eq!(
            ctx.i18n
                .t("none.such", "inline default", &serde_json::Map::new()),
            "inline default"
        );
    }

    #[tokio::test]
    async fn the_with_methods_swap_in_the_scripted_seams() {
        let home = FakeHome::new("engine-ctx-");
        let emitter = Arc::new(RecordingEmitter::new());
        let ui = Arc::new(RecordingUi::new());
        let log = Arc::new(RecordingLog::new());
        let dxvk = Arc::new(ScriptedDxvk::new(&[true]));
        let runner = Arc::new(
            crate::testing::ScriptedSpecRunner::new(Vec::new()).on_program(
                "wine",
                SpecOutput {
                    code: Some(0),
                    ..SpecOutput::default()
                },
            ),
        );
        let ctx = ctx(&home)
            .with_emitter(emitter.clone())
            .with_ui(ui.clone())
            .with_log(log.clone())
            .with_dxvk(dxvk.clone())
            .with_proc(runner.clone())
            .with_app_version("0.11.0");

        ctx.emitter.emit("c", vec![serde_json::json!(1)]);
        ctx.ui.as_ref().unwrap().raise_main_window();
        ctx.log.as_ref().unwrap().info("line");
        assert!(ctx.dxvk.install_remove(request()).await);
        let run = ctx.proc.run(ProcSpec::new("t", "wine"), None).await;

        assert_eq!(emitter.pushed().len(), 1);
        assert_eq!(ui.events().len(), 1);
        assert_eq!(log.lines().len(), 1);
        assert_eq!(dxvk.requests().len(), 1);
        assert_eq!(run.code, Some(0));
        assert_eq!(ctx.app_version, "0.11.0");
    }

    #[tokio::test]
    async fn the_wine_and_crossover_hooks_are_replaced_by_the_shells() {
        let home = FakeHome::new("engine-ctx-");
        let ctx = ctx(&home)
            .with_default_wine(Arc::new(|| {
                Some(WineInstallationView {
                    bin: "/usr/bin/wine".to_string(),
                    name: "wine".to_string(),
                    kind: "wine".to_string(),
                    lib: None,
                    lib32: None,
                    wineserver: Some("/usr/bin/wineserver".to_string()),
                })
            }))
            .with_crossover_bin_dir(Arc::new(|| Box::pin(async { Some("/cx/bin".to_string()) })));
        let wine = (ctx.default_wine)().unwrap();
        assert_eq!(
            serde_json::to_value(&wine).unwrap(),
            serde_json::json!({
                "bin": "/usr/bin/wine",
                "name": "wine",
                "type": "wine",
                "wineserver": "/usr/bin/wineserver"
            })
        );
        assert_eq!((ctx.crossover_bin_dir)().await.as_deref(), Some("/cx/bin"));
    }

    #[tokio::test]
    async fn the_default_fetch_is_built_lazily_and_a_replay_can_replace_it() {
        let home = FakeHome::new("engine-ctx-");
        // Building a context made no client and no request: a bad scheme only fails when used.
        let ctx = ctx(&home);
        let error = ctx
            .fetch
            .get(FetchRequest::get("not a url"))
            .await
            .unwrap_err();
        assert_eq!(error, crate::fetch::FetchError::Network);
    }
}
