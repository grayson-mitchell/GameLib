//! Fixtures for the manager's unit tests: a context over a fake HOME with the recording sinks, and a
//! download that waits for its cancel. The goldens (`tests/golden_wine_manager.rs`) carry the
//! behaviour the TS recorded; these cover what no golden can (a cancel, a refusal, a link).

use std::path::Path;
use std::sync::Arc;

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::fetch::{
    DownloadOutcome, Fetch, FetchError, FetchFuture, FetchRequest, FetchResponse, Progress,
};
use gamelib_engine::testing::{RecordingEmitter, RecordingLog, RecordingUi};
use gamelib_store::host::StoreHost;
use gamelib_store::json::Json;
use gamelib_testutil::FakeHome;
use serde_json::Value;
use tokio_util::sync::CancellationToken;

use crate::ctx::WineCtx;
use crate::manager::store;

/// A download that never finishes by itself: it waits for its cancel and then reports `aborted`.
pub(crate) struct WaitsForCancel;

impl Fetch for WaitsForCancel {
    fn get(&self, _req: FetchRequest) -> FetchFuture<'_, Result<FetchResponse, FetchError>> {
        Box::pin(async { Err(FetchError::Network) })
    }

    fn download<'a>(
        &'a self,
        _req: FetchRequest,
        _dest: &'a Path,
        _progress: &'a (dyn Fn(Progress) + Send + Sync),
        cancel: CancellationToken,
    ) -> FetchFuture<'a, Result<DownloadOutcome, FetchError>> {
        Box::pin(async move {
            cancel.cancelled().await;
            Err(FetchError::Aborted)
        })
    }
}

pub(crate) struct Kit {
    pub home: FakeHome,
    pub ctx: WineCtx,
    pub ui: Arc<RecordingUi>,
    pub emitter: Arc<RecordingEmitter>,
    pub log: Arc<RecordingLog>,
}

/// A Linux context over a fake HOME: `<home>/userdata` for the stores, `<home>/tools` for the installs.
pub(crate) fn kit(fetch: Arc<dyn Fetch>) -> Kit {
    let home = FakeHome::new("wine-manager-unit-");
    let root = home.root().to_path_buf();
    let ui = Arc::new(RecordingUi::new());
    let emitter = Arc::new(RecordingEmitter::new());
    let log = Arc::new(RecordingLog::new());
    let engine = EngineCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        Platform::Linux,
        EnginePaths {
            app_folder: root.join("app"),
            user_data: root.join("userdata"),
            tools_path: root.join("tools"),
            user_home: root.clone(),
            temp: root.join("temp"),
        },
        Shutdown::new(),
    )
    .with_fetch(fetch)
    .with_ui(ui.clone())
    .with_emitter(emitter.clone())
    .with_log(log.clone());
    let ctx = WineCtx::new(Arc::new(engine), root.join("tools").join("runtimes"));
    Kit {
        home,
        ctx,
        ui,
        emitter,
        log,
    }
}

/// Seeds the store with `entries`.
pub(crate) fn seed(kit: &Kit, entries: &[Value]) {
    let handle = store::open(&kit.ctx).unwrap();
    store::write(&handle, entries.iter().cloned().map(Json::from).collect()).unwrap();
}

/// The stored list as JSON.
pub(crate) fn stored(kit: &Kit) -> Value {
    crate::manager::releases::list(&kit.ctx).unwrap()
}
