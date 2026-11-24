//! What every known-fix op is handed: the engine context the engine ops share, plus the directories
//! only this crate needs and the two values the shell resolves for it. The crate reads no environment
//! variable and no profile path of its own.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use gamelib_engine::ctx::EngineCtx;
use gamelib_wine::ctx::WineCtx;
use gamelib_wine::wine_cmd::WineHost;

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
