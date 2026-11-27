//! What every launch op is handed: the engine context, the known-fix context, the wine context and the
//! information context the launch builders and the prepare step read. The crate reads no environment
//! variable and no profile path of its own.

use std::sync::Arc;

use gamelib_engine::ctx::EngineCtx;
use gamelib_info::ctx::InfoCtx;
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_wine::ctx::WineCtx;

use crate::funnel::flights::LaunchFlights;
use crate::funnel::shell::{FunnelShell, PowerState};
use crate::funnel::steps::FunnelSteps;
use crate::game::registry::TrackedRegistry;
use crate::game::spawn::{GameSpawner, ProcGameSpawner};
use crate::hooks::ManagerHooks;
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
    /// The runner's `errorHandler` seam. `None` is the production handler (88.2-09,
    /// [`crate::runner::error_handler`]), which reads this context's dialogs, hooks and UI when a run's output
    /// says something the user should hear; a test sets a recorder through [`LaunchCtx::with_errors`].
    pub errors: Option<Arc<dyn RunnerErrors>>,
    /// What only the TS library managers can answer (88.2-09, D-26): a game's title and `forceUninstall`. The
    /// shell sets the sidecar-backed one; the CLI and a headless run leave it `None`, and every hook is then
    /// unavailable (a title falls back to the app name, a forced uninstall does not happen).
    pub hooks: Option<Arc<dyn ManagerHooks>>,
    /// The game runs in flight (88.2-10, D-07), each with its `GameHandle`: registered when a game-class call
    /// spawns, unregistered when it ends. A context owns its own, never a module-level one.
    pub registry: Arc<TrackedRegistry>,
    /// How a game-class run starts its game: `gamelib_proc::spawn_game_tracked` unless a test sets a scripted one.
    pub game_spawner: Arc<dyn GameSpawner>,
    /// The launches in flight (88.3-04, D-04): the one single-flight table, keyed `<runner>:<appName>`.
    pub flights: Arc<LaunchFlights>,
    /// The window and the display-sleep blocker (88.3-04). `None` (the CLI, a headless run): no window to hide,
    /// no blocker to hold, no app to exit.
    pub shell: Option<Arc<dyn FunnelShell>>,
    /// The in-process steps of a launch (88.3-04). `None` is [`crate::funnel::steps::CtxFunnelSteps`], the real
    /// functions; a test sets a recorder through [`LaunchCtx::with_steps`].
    pub steps: Option<Arc<dyn FunnelSteps>>,
    /// The display-sleep blocker this context holds (the TS launcher's per-instance `PowerState`).
    pub power: Arc<PowerState>,
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
            hooks: None,
            registry: Arc::new(TrackedRegistry::new()),
            game_spawner: Arc::new(ProcGameSpawner),
            flights: Arc::new(LaunchFlights::new()),
            shell: None,
            steps: None,
            power: Arc::new(PowerState::new()),
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

    /// The same context with the TS managers' hooks.
    pub fn with_hooks(mut self, hooks: Arc<dyn ManagerHooks>) -> LaunchCtx {
        self.hooks = Some(hooks);
        self
    }

    /// The same context with another game spawner (a test's scripted one).
    pub fn with_game_spawner(mut self, spawner: Arc<dyn GameSpawner>) -> LaunchCtx {
        self.game_spawner = spawner;
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

    /// The same context with the shell's window and wake-lock hooks.
    pub fn with_shell(mut self, shell: Arc<dyn FunnelShell>) -> LaunchCtx {
        self.shell = Some(shell);
        self
    }

    /// The same context with other funnel steps (a test's recorder).
    pub fn with_steps(mut self, steps: Arc<dyn FunnelSteps>) -> LaunchCtx {
        self.steps = Some(steps);
        self
    }
}
