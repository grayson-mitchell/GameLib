//! What every launch op is handed: the engine context, the known-fix context, the wine context and the
//! information context the launch builders and the prepare step read. The crate reads no environment
//! variable and no profile path of its own.

use std::sync::Arc;

use gamelib_engine::ctx::EngineCtx;
use gamelib_info::ctx::InfoCtx;
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_wine::ctx::WineCtx;

use crate::prepare::deps::WineManagerFacts;
use crate::prepare::dialogs::LaunchDialogs;
use crate::runner::stream::{GamelibLogSink, LaunchLogSink};
use crate::runner::{RunnerErrors, RunnerTables};

/// The shell (or the CLI) builds one `LaunchCtx` and every op takes `&LaunchCtx`. Cloning gives another
/// handle on the same contexts (all four are shared behind an `Arc`).
#[derive(Clone)]
pub struct LaunchCtx {
    /// The directories, clock, platform, shutdown, sinks and log the engine crate already owns.
    pub engine: Arc<EngineCtx>,
    /// The known-fix layers and overlay catalogue the launch builders apply.
    pub knownfix: Arc<KnownFixCtx>,
    /// The wine command core: the env builders' runtime path, and the spawn and prefix pieces the
    /// prepare steps of 88.1-11 to 88.1-14 run through.
    pub wine: Arc<WineCtx>,
    /// The information context: the anti-cheat lookup and the system-information read the prepare step logs.
    /// In the shell this is the one `info_dispatch` context, so the native system-information channel and
    /// the launch log share one single-flight cache (88.1-11).
    pub info: Arc<InfoCtx>,
    /// The modal the prepare steps ask (`checkWineBeforeLaunch`'s "use another wine?"). The shell sets one over its
    /// native message box; the CLI and a headless run leave it `None`, and every ask is then a dismissal.
    pub dialogs: Option<Arc<dyn LaunchDialogs>>,
    /// The facts only the shell has for the wine manager (the discovery roots, the install settings and the cancel
    /// registry the renderer's abort reaches). `None` (the CLI, a test): discovery over the context's own
    /// directories, install settings off and an install nothing cancels.
    pub manager: Option<Arc<dyn WineManagerFacts>>,
    /// Where the runner's log entries go (88.2-07): the caller's log writers' entries and the general line.
    /// `GamelibLogSink` (the `gamelib-log` writer) unless a test sets a recorder.
    pub log_sink: Arc<dyn LaunchLogSink>,
    /// What the runner keeps across calls: the in-flight table, the abort table and the PowerShell probe.
    pub runner: Arc<RunnerTables>,
    /// The runner's `errorHandler` (88.2-09 supplies the real one). `None`: a run's output is not read for errors.
    pub errors: Option<Arc<dyn RunnerErrors>>,
}

impl LaunchCtx {
    pub fn new(
        engine: Arc<EngineCtx>,
        knownfix: Arc<KnownFixCtx>,
        wine: Arc<WineCtx>,
        info: Arc<InfoCtx>,
    ) -> LaunchCtx {
        let log_sink: Arc<dyn LaunchLogSink> = Arc::new(GamelibLogSink::new(engine.clock.clone()));
        LaunchCtx {
            engine,
            knownfix,
            wine,
            info,
            dialogs: None,
            manager: None,
            log_sink,
            runner: Arc::new(RunnerTables::new()),
            errors: None,
        }
    }

    /// The same context with another log sink (a test's recorder).
    pub fn with_log_sink(mut self, log_sink: Arc<dyn LaunchLogSink>) -> LaunchCtx {
        self.log_sink = log_sink;
        self
    }

    /// The same context with the runner's error handler.
    pub fn with_errors(mut self, errors: Arc<dyn RunnerErrors>) -> LaunchCtx {
        self.errors = Some(errors);
        self
    }

    /// The same context with other runner tables (a test's recording ones).
    pub fn with_runner_tables(mut self, runner: Arc<RunnerTables>) -> LaunchCtx {
        self.runner = runner;
        self
    }

    /// The same context with a dialog source (the shell's native message box).
    pub fn with_dialogs(mut self, dialogs: Arc<dyn LaunchDialogs>) -> LaunchCtx {
        self.dialogs = Some(dialogs);
        self
    }

    /// The same context with the shell's wine-manager facts.
    pub fn with_manager(mut self, manager: Arc<dyn WineManagerFacts>) -> LaunchCtx {
        self.manager = Some(manager);
        self
    }
}
