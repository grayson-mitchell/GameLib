//! What every known-fix op is handed: the engine context the engine ops share, plus the directories
//! only this crate needs and the two values the shell resolves for it. The crate reads no environment
//! variable and no profile path of its own.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use gamelib_engine::ctx::EngineCtx;
use gamelib_wine::ctx::WineCtx;
use gamelib_wine::wine_cmd::WineHost;
use tokio::sync::OnceCell;

/// The deployed known-fix relay (`GAMELIB_FIX_RELAY_URL` of `src/backend/knownFixReport.ts`). The shell
/// hands this to [`KnownFixCtx`] unless `GAMELIB_FIX_RELAY_URL` is set, so the crate itself reads no
/// environment.
pub const DEFAULT_RELAY_URL: &str = "https://gamelib-fix-relay.gamelib.workers.dev/v1/reports";

/// The directories of the known-fix layers, as `process/appPaths.ts` builds them from the app folder
/// (`fixesPath`, `localFixesPath`, `knownFixOverlaysPath`) plus the bundled layer the shell passes in.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnownFixPaths {
    /// `<appFolder>/fixes`: the remote layer's cache.
    pub fixes: PathBuf,
    /// `<appFolder>/fixes/local`: the operator's own profiles.
    pub local: PathBuf,
    /// The curated, in-repo layer (`<public>/fixes` in dev, `build/fixes` packaged), when the shell has one.
    pub bundled: Option<PathBuf>,
    /// `<appFolder>/overlays`: where an installed overlay lives.
    pub overlays: PathBuf,
}

impl KnownFixPaths {
    /// Derives the profile-owned directories from `app_folder`; `bundled` is the shell's resolved path.
    pub fn from_app_folder(app_folder: &Path, bundled: Option<PathBuf>) -> KnownFixPaths {
        let fixes = app_folder.join("fixes");
        KnownFixPaths {
            local: fixes.join("local"),
            fixes,
            bundled,
            overlays: app_folder.join("overlays"),
        }
    }
}

/// How long an overlay download may take, connect and body together (`OVERLAY_DOWNLOAD_TIMEOUT_MS`).
pub const OVERLAY_DOWNLOAD_TIMEOUT: Duration = Duration::from_millis(120_000);

/// What one in-flight overlay install answers: the verified install directory, or `None` (fail-open).
pub(crate) type InstallCell = Arc<OnceCell<Option<PathBuf>>>;

/// The overlay installs in flight, by install directory (88-10, `createKnownFixOverlayInstalls`): concurrent
/// callers for one overlay join one download. One table per context, so a second context (a second
/// boot) has its own, as the TS's per-boot table did. Cloning gives another handle on the same table.
#[derive(Clone)]
pub struct OverlayInstalls {
    in_flight: Arc<Mutex<HashMap<PathBuf, InstallCell>>>,
    timeout: Duration,
}

impl Default for OverlayInstalls {
    fn default() -> OverlayInstalls {
        OverlayInstalls {
            in_flight: Arc::default(),
            timeout: OVERLAY_DOWNLOAD_TIMEOUT,
        }
    }
}

impl OverlayInstalls {
    /// An empty table with the 120 s download bound.
    pub fn new() -> OverlayInstalls {
        OverlayInstalls::default()
    }

    /// The same, with another download bound (the TS `timeoutMs` dependency, which a test sets).
    pub fn with_timeout(mut self, timeout: Duration) -> OverlayInstalls {
        self.timeout = timeout;
        self
    }

    /// The download bound.
    pub fn timeout(&self) -> Duration {
        self.timeout
    }

    /// How many installs are in flight right now.
    pub fn in_flight(&self) -> usize {
        self.table().len()
    }

    fn table(&self) -> std::sync::MutexGuard<'_, HashMap<PathBuf, InstallCell>> {
        self.in_flight.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// The cell the install of `target` runs in: a caller that finds one already there joins it.
    pub(crate) fn cell_for(&self, target: &Path) -> InstallCell {
        self.table()
            .entry(target.to_path_buf())
            .or_default()
            .clone()
    }

    /// Forgets `cell` once its install has answered (the TS `.finally(() => inFlight.delete(target))`),
    /// unless a later install of the same target already replaced it.
    pub(crate) fn forget(&self, target: &Path, cell: &InstallCell) {
        let mut table = self.table();
        if table.get(target).is_some_and(|c| Arc::ptr_eq(c, cell)) {
            table.remove(target);
        }
    }
}

/// The known-fix reports being sent right now, by the TS abort id `known-fix-report:<appId>:<key>:<op>`
/// (88-11, `aborts.has` / `aborts.create` in `runKnownFixReport`): a second report for the same
/// `(appId, key, op)` while one is in flight answers `in-flight` instead of posting twice. The entry goes
/// when the report's work ends, however it ends, so a cancelled or dropped report cannot leave one
/// behind. One table per context; cloning gives another handle on the same table.
#[derive(Clone, Default)]
pub struct ReportsInFlight {
    ids: Arc<Mutex<HashSet<String>>>,
}

impl ReportsInFlight {
    fn table(&self) -> std::sync::MutexGuard<'_, HashSet<String>> {
        self.ids.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn id_of(sent_key: &str) -> String {
        format!("known-fix-report:{sent_key}")
    }

    /// Whether the report with this sent-record key (`<appId>:<key>:<op>`) is in flight.
    pub fn holds(&self, sent_key: &str) -> bool {
        self.table().contains(&ReportsInFlight::id_of(sent_key))
    }

    /// How many reports are in flight.
    pub fn len(&self) -> usize {
        self.table().len()
    }

    /// Whether no report is in flight.
    pub fn is_empty(&self) -> bool {
        self.table().is_empty()
    }

    /// Marks `sent_key` in flight; `None` when it already is. The entry is released when the claim drops.
    pub(crate) fn claim(&self, sent_key: &str) -> Option<ReportClaim> {
        let id = ReportsInFlight::id_of(sent_key);
        self.table().insert(id.clone()).then(|| ReportClaim {
            table: self.clone(),
            id,
        })
    }
}

/// One report's place in [`ReportsInFlight`]; dropping it frees the place.
pub(crate) struct ReportClaim {
    table: ReportsInFlight,
    id: String,
}

impl Drop for ReportClaim {
    fn drop(&mut self) {
        self.table.table().remove(&self.id);
    }
}

/// The shell (or the CLI) builds one `KnownFixCtx` and every op takes `&KnownFixCtx`. Cloning gives
/// another handle on the same engine context.
#[derive(Clone)]
pub struct KnownFixCtx {
    /// The directories, clock, platform, shutdown, sinks and log the engine crate already owns.
    pub engine: Arc<EngineCtx>,
    pub paths: KnownFixPaths,
    /// The known-fix relay's base URL. A value handed in: this crate never reads the environment.
    pub relay_url: String,
    /// The app's version, as the shell reports it.
    pub app_version: String,
    /// The wine command core the registry fixes run their `reg add` through (88-09, D-21). `None` until
    /// the shell (or the CLI) installs one, which makes the two registry ops answer `<op>:not-ready`.
    pub wine: Option<Arc<WineCtx>>,
    /// The process facts the wine command core reads and this crate may not (the process environment, the
    /// Darwin release), as the shell took them. Empty until [`KnownFixCtx::with_wine`].
    pub wine_host: WineHost,
    /// The overlay installs in flight (88-10, D-21): one download per overlay however many launches ask.
    pub overlay_installs: OverlayInstalls,
    /// The opt-in reports in flight (88-11): one post per `(appId, key, op)` at a time.
    pub report_in_flight: ReportsInFlight,
}

impl KnownFixCtx {
    /// A warning line through the engine's log (a headless context has none). Fixed text only: the
    /// engine's redactor holds a line to that rule, and so does every caller.
    pub(crate) fn log_warn(&self, line: &str) {
        if let Some(log) = self.engine.log.as_ref() {
            log.warn(line);
        }
    }

    /// An info line through the engine's log.
    pub(crate) fn log_info(&self, line: &str) {
        if let Some(log) = self.engine.log.as_ref() {
            log.info(line);
        }
    }

    pub fn new(
        engine: Arc<EngineCtx>,
        bundled_fixes: Option<PathBuf>,
        relay_url: impl Into<String>,
        app_version: impl Into<String>,
    ) -> KnownFixCtx {
        let paths = KnownFixPaths::from_app_folder(&engine.paths.app_folder, bundled_fixes);
        KnownFixCtx {
            engine,
            paths,
            relay_url: relay_url.into(),
            app_version: app_version.into(),
            wine: None,
            wine_host: WineHost::default(),
            overlay_installs: OverlayInstalls::new(),
            report_in_flight: ReportsInFlight::default(),
        }
    }

    /// Installs the wine command core and the host facts it runs with (the process environment and the
    /// Darwin release, which the crate never reads for itself).
    pub fn with_wine(mut self, wine: Arc<WineCtx>, host: WineHost) -> KnownFixCtx {
        self.wine = Some(wine);
        self.wine_host = host;
        self
    }
}
