//! What every wine op is handed: the engine context the engine ops share, plus the handles and the
//! one directory only this crate needs. The crate reads no environment variable and no profile path
//! of its own.

use std::path::PathBuf;
use std::sync::Arc;

use gamelib_core::process::SpecRunner;
use gamelib_engine::ctx::EngineCtx;
use gamelib_engine::fetch::Fetch;

use crate::tools::macho::{MachoScan, UnavailableScan};
use crate::tools::state::ToolsState;
use crate::winetricks::queue::WinetricksQueue;

/// The CPU architecture the app runs on, as the shell reports it. The wine manager picks a release
/// asset by it (GE-Proton ships an `aarch64` and an `x86_64` build), and a golden pins it so a
/// recording made on one machine replays the same on another.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Arch {
    X64,
    Arm64,
    /// Neither: no GE-Proton asset matches it, as `process.arch` of `ia32` matched none.
    Other,
}

impl Arch {
    /// The architecture this binary was built for (a compile-time fact, not an environment read).
    pub fn host() -> Arch {
        if cfg!(target_arch = "aarch64") {
            Arch::Arm64
        } else if cfg!(target_arch = "x86_64") {
            Arch::X64
        } else {
            Arch::Other
        }
    }
}

/// The shell (or the CLI) builds one `WineCtx` and every op takes `&WineCtx`. Cloning gives another
/// handle on the same state (every shared field is an `Arc` or an `Arc` inside), which a detached
/// task (the Winetricks queue's run) holds while the op that started it has already answered.
#[derive(Clone)]
pub struct WineCtx {
    /// The directories, clock, platform, shutdown, sinks and DXVK installer the engine crate already
    /// owns.
    pub engine: Arc<EngineCtx>,
    /// Where the Wine runtime (the engine's prefix tooling) is installed, as the shell resolves it.
    pub runtime_path: PathBuf,
    /// The network seam (D-08), the engine context's unless replaced: a wine port reaches `Replay`
    /// the same way an engine port does.
    pub fetch: Arc<dyn Fetch>,
    /// The spawn seam (D-17), the engine context's unless replaced: wine, wineserver, winetricks and
    /// tar all start through it.
    pub proc: Arc<dyn SpecRunner>,
    /// The CPU architecture, [`Arch::host`] unless replaced.
    pub arch: Arch,
    /// The tools' in-memory state (the single-flight install slot, the catalog caches): one per
    /// context, so every op of a boot shares it.
    pub tools: ToolsState,
    /// The Winetricks apply queue of the boot (82 row `winetricks-queue`): the run, its outcomes and
    /// the snapshot revision, in memory only (87-33).
    pub winetricks_queue: Arc<WinetricksQueue>,
    /// The winemac export scan the DXMT gate asks (`MachoScan`): the shell implements it over
    /// `gamelib-scan`, so this crate takes no domain-crate dependency. Until the shell's is
    /// installed it never answers, which keeps the gate closed.
    pub macho: Arc<dyn MachoScan>,
}

impl WineCtx {
    pub fn new(engine: Arc<EngineCtx>, runtime_path: PathBuf) -> WineCtx {
        let tools = ToolsState::new();
        WineCtx {
            fetch: engine.fetch.clone(),
            proc: engine.proc.clone(),
            arch: Arch::host(),
            // The queue subscribes to the environment reports here, once, as the TS boot did: no I/O
            // and no timer.
            winetricks_queue: WinetricksQueue::new(
                Arc::clone(&engine.emitter),
                tools.installing_slot(),
                Arc::clone(&tools.winetricks_env),
            ),
            tools,
            macho: Arc::new(UnavailableScan),
            engine,
            runtime_path,
        }
    }

    /// Replaces the architecture the release picker reads (a golden pins x64).
    pub fn with_arch(mut self, arch: Arch) -> WineCtx {
        self.arch = arch;
        self
    }

    /// Replaces the network seam for this crate's ops only (a wine test replays its own case).
    pub fn with_fetch(mut self, fetch: Arc<dyn Fetch>) -> WineCtx {
        self.fetch = fetch;
        self
    }

    /// Replaces the spawn seam for this crate's ops only.
    pub fn with_proc(mut self, proc: Arc<dyn SpecRunner>) -> WineCtx {
        self.proc = proc;
        self
    }

    /// Replaces the winemac export scan (the shell's `gamelib-scan` one, or a test's scripted one).
    pub fn with_macho_scan(mut self, scan: Arc<dyn MachoScan>) -> WineCtx {
        self.macho = scan;
        self
    }
}

#[cfg(all(test, feature = "testing"))]
mod tests {
    use super::*;
    use gamelib_core::clock::SystemClock;
    use gamelib_core::process::{ProcSpec, SpecOutput};
    use gamelib_core::shutdown::Shutdown;
    use gamelib_engine::ctx::{EnginePaths, Platform};
    use gamelib_engine::fetch::{FetchError, FetchRequest, Replay};
    use gamelib_engine::testing::ScriptedSpecRunner;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use std::path::Path;

    fn engine(home: &FakeHome, proc: Arc<ScriptedSpecRunner>) -> EngineCtx {
        let root = home.root().to_path_buf();
        EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Linux,
            EnginePaths {
                app_folder: root.clone(),
                user_data: root.clone(),
                tools_path: root.join("tools"),
                user_home: root.join("home"),
                temp: root.join("temp"),
            },
            Shutdown::new(),
        )
        .with_proc(proc)
    }

    #[tokio::test]
    async fn the_wine_handles_are_the_engines_until_replaced() {
        let home = FakeHome::new("wine-ctx-");
        let proc = Arc::new(ScriptedSpecRunner::new(Vec::new()).on_program(
            "wine",
            SpecOutput {
                code: Some(0),
                ..SpecOutput::default()
            },
        ));
        let ctx = WineCtx::new(
            Arc::new(engine(&home, proc.clone())),
            home.root().join("runtime"),
        );

        // The spawn went through the engine's scripted runner: one handle, two names.
        let out = ctx.proc.run(ProcSpec::new("t", "wine"), None).await;
        assert_eq!(out.code, Some(0));
        assert_eq!(proc.spawns().len(), 1);
        assert!(Arc::ptr_eq(&ctx.proc, &ctx.engine.proc));
        assert!(Arc::ptr_eq(&ctx.fetch, &ctx.engine.fetch));
    }

    #[tokio::test]
    async fn a_wine_test_can_replay_its_own_case_through_the_wine_context() {
        let home = FakeHome::new("wine-ctx-");
        let case = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("recorded")
            .join("runtimes")
            .join("list-runtimes");
        let replay = Arc::new(Replay::from_case(&case).unwrap());
        let ctx = WineCtx::new(
            Arc::new(engine(&home, Arc::new(ScriptedSpecRunner::new(Vec::new())))),
            home.root().join("runtime"),
        )
        .with_fetch(replay.clone());

        // An unrecorded request is refused by the replay, and the sticky failure names it.
        let error = ctx
            .fetch
            .get(FetchRequest::get("https://example.test/never-recorded"))
            .await
            .unwrap_err();
        assert_eq!(error, FetchError::Network);
        let report = replay.finish().unwrap_err();
        assert!(report.contains("unmatched request: GET https://example.test/never-recorded"));
    }
}
