//! The Winetricks apply queue (Phase 87, D-17; 82 row `winetricks-queue`, owner `gamelib-wine`): a port
//! of `src/backend/tools/winetricksQueue.ts`, replayed against the 17 `queue-*` goldens 87-10
//! recorded from the TS (`tests/golden_winetricks.rs`).
//!
//! One run at a time per boot, started by `apply` with a renderer's verbs and driven detached: the
//! verbs install one after another (never a batch, never parallel, never a stop at one verb's
//! failure), each state change is pushed as `winetricksQueueChanged`, and the run ends in a `done`
//! push and a `done` game status. `cancel_remaining` marks the verbs that have not started as
//! cancelled and lets the one running finish. The state is in memory only: a restart starts empty.
//!
//! The Rust-only part is shutdown (T-87-78, D-17): a run holds a `wine-winetricks`
//! [`Registrant`](gamelib_core::shutdown::Registrant) for exactly its life and races the shutdown
//! token, so a quit drops the verb in flight (its Helper child is gamelib-proc's to reap), cancels the
//! rest and ends the run inside the exit budget.
//!
//! Differences from the TS, each pinned by the golden's comparison:
//!
//! - the caller resolves the game's tool settings once, at `apply` ([`OwnedTarget`]), and every verb
//!   of the run uses them; the TS resolved them per verb, from a store the crate may not reach;
//! - the `done`/`winetricks` game status goes out as the `gameStatusUpdate` push (the TS also fed an
//!   in-process event bus, which stays the TS shell glue's until 87-35);
//! - a panic in the run, or a quit, still ends the run (the TS had `finally`; here a drop guard).
//!
//! Crate-only (D-06): ops `wine_winetricks_apply`, `wine_winetricks_queue_state` and
//! `wine_winetricks_cancel_remaining` have no channel and no caller; 87-35 flips them with the apply
//! resolver.

use std::sync::{Arc, Mutex, MutexGuard, Weak};

use gamelib_core::emitter::FrontendEmitter;
use gamelib_core::shutdown::Registrant;
use serde::{Serialize, Serializer};
use serde_json::{json, Value};

use super::classify::{append_log_line, LogLine, MAX_BUFFERED_LINES};
use super::env::{EnvironmentReport, WinetricksEnvironment};
use super::guard::assert_apply_payload;
use super::install::{catalog_for, install, InstallOutcome};
use super::{Launcher, Session, Target, ToolSettings};
use crate::ctx::WineCtx;
use crate::tools::state::{installing_of, InstallingSlot};
use crate::wine_cmd::WineHost;

/// The channel a queue snapshot goes out on.
pub const QUEUE_CHANNEL: &str = "winetricksQueueChanged";

/// The channel the run's `winetricks` and `done` game statuses go out on (`sendGameStatusUpdate`).
pub const GAME_STATUS_CHANNEL: &str = "gameStatusUpdate";

/// Why an `apply` while another run or install is going is refused: the TS text.
const BUSY_DETAIL: &str = "A winetricks install is already running.";

/// One verb's lifecycle state inside a run (`WinetricksVerbOutcome`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum VerbOutcome {
    Pending,
    Installing,
    Installed,
    Failed,
    Cancelled,
}

/// A run's state (`WinetricksQueueRun.status`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RunStatus {
    Running,
    Done,
}

/// `outcomes` as a JSON object in verb order (a `Record<string, WinetricksVerbOutcome>`).
fn serialize_outcomes<S: Serializer>(
    outcomes: &[(String, VerbOutcome)],
    serializer: S,
) -> Result<S::Ok, S::Error> {
    serializer.collect_map(outcomes.iter().map(|(verb, outcome)| (verb, outcome)))
}

/// One run (`WinetricksQueueRun`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueRun {
    pub run_id: u64,
    pub runner: String,
    pub app_name: String,
    pub verbs: Vec<String>,
    #[serde(serialize_with = "serialize_outcomes")]
    pub outcomes: Vec<(String, VerbOutcome)>,
    pub current_verb: String,
    pub status: RunStatus,
    pub cancel_requested: bool,
    pub log: Vec<LogLine>,
}

/// The state of one game as the renderer receives it (`WinetricksQueueState`). `revision` is the
/// boot-wide snapshot sequence: strictly increasing with every snapshot taken, so a renderer holding
/// two states of one game can tell which is newer whichever channel each arrived on.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueState {
    pub runner: String,
    pub app_name: String,
    pub run: Option<QueueRun>,
    pub busy: bool,
    pub environment: EnvironmentReport,
    pub revision: u64,
}

/// What an `apply` answered (`WinetricksApplyResult`).
#[derive(Debug, Clone)]
pub enum ApplyResult {
    Accepted(Box<QueueState>),
    /// A run or an install is going.
    Busy,
    /// The payload failed the apply guard; the text is the guard's.
    Invalid(String),
}

impl ApplyResult {
    pub fn accepted(&self) -> bool {
        matches!(self, ApplyResult::Accepted(_))
    }

    /// The TS object.
    pub fn to_json(&self) -> Value {
        match self {
            ApplyResult::Accepted(state) => json!({ "accepted": true, "state": state }),
            ApplyResult::Busy => {
                json!({ "accepted": false, "reason": "busy", "detail": BUSY_DETAIL })
            }
            ApplyResult::Invalid(detail) => {
                json!({ "accepted": false, "reason": "invalid", "detail": detail })
            }
        }
    }
}

/// A [`Target`] that owns its text, for a run that outlives the op that started it.
#[derive(Debug, Clone)]
pub struct OwnedTarget {
    pub runner: String,
    pub app_name: String,
    pub settings: ToolSettings,
}

impl OwnedTarget {
    pub fn from_target(target: &Target<'_>) -> OwnedTarget {
        OwnedTarget {
            runner: target.runner.to_string(),
            app_name: target.app_name.to_string(),
            settings: target.settings.clone(),
        }
    }

    pub fn as_target(&self) -> Target<'_> {
        Target {
            runner: &self.runner,
            app_name: &self.app_name,
            settings: self.settings.clone(),
        }
    }
}

/// The production launcher over an owned copy of the host facts (a detached run cannot borrow the op's).
pub struct SharedHostLauncher(pub Arc<WineHost>);

impl Launcher for SharedHostLauncher {
    fn valid_wine(&self, ctx: &WineCtx, wine: &crate::wine_cmd::WineInstallation) -> bool {
        super::HostLauncher { host: &self.0 }.valid_wine(ctx, wine)
    }

    fn setup_env_vars(
        &self,
        ctx: &WineCtx,
        settings: &crate::wine_cmd::env::GameSettingsView,
    ) -> std::collections::BTreeMap<String, String> {
        super::HostLauncher { host: &self.0 }.setup_env_vars(ctx, settings)
    }

    fn setup_wine_env_vars(
        &self,
        ctx: &WineCtx,
        settings: &crate::wine_cmd::env::GameSettingsView,
        app_name: &str,
    ) -> std::collections::BTreeMap<String, String> {
        super::HostLauncher { host: &self.0 }.setup_wine_env_vars(ctx, settings, app_name)
    }
}

#[derive(Default)]
struct Inner {
    current_run: Option<QueueRun>,
    next_run_id: u64,
    /// Set synchronously by `apply`'s first statements, before the catalog read awaits: two applies
    /// issued in the same tick would otherwise both pass the busy check before either started a run.
    apply_in_flight: bool,
    snapshot_revision: u64,
}

/// The one queue of a boot.
pub struct WinetricksQueue {
    inner: Mutex<Inner>,
    emitter: Arc<dyn FrontendEmitter>,
    installing: InstallingSlot,
    environment: Arc<WinetricksEnvironment>,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    // A panic while a guard was held leaves the data as it was; the state is plain values.
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

impl WinetricksQueue {
    /// Builds the queue and subscribes it, once, to the environment reports (D-16): a report change
    /// is pushed for that game even when there is no run. No I/O and no timer. The subscription holds
    /// the queue weakly, so the queue and the reports it reads do not keep each other alive. The
    /// emitter is the engine context's at this moment (the shell installs its own before it builds
    /// the wine context).
    pub fn new(
        emitter: Arc<dyn FrontendEmitter>,
        installing: InstallingSlot,
        environment: Arc<WinetricksEnvironment>,
    ) -> Arc<WinetricksQueue> {
        let queue = Arc::new(WinetricksQueue {
            inner: Mutex::new(Inner {
                next_run_id: 1,
                ..Inner::default()
            }),
            emitter,
            installing,
            environment: Arc::clone(&environment),
        });
        let weak: Weak<WinetricksQueue> = Arc::downgrade(&queue);
        environment.on_changed(Arc::new(move |runner, app_name| {
            if let Some(queue) = weak.upgrade() {
                let mut inner = queue.lock();
                queue.push(&mut inner, runner, app_name);
            }
        }));
        queue
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        lock(&self.inner)
    }

    fn is_busy(&self, inner: &Inner) -> bool {
        inner.apply_in_flight
            || inner
                .current_run
                .as_ref()
                .is_some_and(|run| run.status == RunStatus::Running)
            || !installing_of(&self.installing).is_empty()
    }

    /// `getState`: a copy (nothing the caller holds can change the queue's), one new revision.
    fn snapshot(&self, inner: &mut Inner, runner: &str, app_name: &str) -> QueueState {
        let run = inner
            .current_run
            .as_ref()
            .filter(|run| run.runner == runner && run.app_name == app_name)
            .cloned();
        let busy = self.is_busy(inner);
        let environment = self.environment.report(runner, app_name);
        inner.snapshot_revision += 1;
        QueueState {
            runner: runner.to_string(),
            app_name: app_name.to_string(),
            run,
            busy,
            environment,
            revision: inner.snapshot_revision,
        }
    }

    /// Pushes a snapshot. Held under the lock so the order of the pushes is the order of the
    /// revisions (the emitter only queues the message).
    fn push(&self, inner: &mut Inner, runner: &str, app_name: &str) {
        let state = self.snapshot(inner, runner, app_name);
        if let Ok(value) = serde_json::to_value(&state) {
            self.emitter.emit(QUEUE_CHANNEL, vec![value]);
        }
    }

    fn send_game_status(&self, runner: &str, app_name: &str, status: &str) {
        self.emitter.emit(
            GAME_STATUS_CHANNEL,
            vec![json!({ "appName": app_name, "runner": runner, "status": status })],
        );
    }

    /// The state of a game (`getState`).
    pub fn state(&self, runner: &str, app_name: &str) -> QueueState {
        let mut inner = self.lock();
        self.snapshot(&mut inner, runner, app_name)
    }

    /// `cancelRemaining`: the verbs that have not started become `cancelled` and the running one
    /// finishes. Nothing is changed (or pushed) unless this game's run is running.
    pub fn cancel_remaining(&self, runner: &str, app_name: &str) -> QueueState {
        let mut inner = self.lock();
        let running = inner.current_run.as_mut().filter(|run| {
            run.runner == runner && run.app_name == app_name && run.status == RunStatus::Running
        });
        if let Some(run) = running {
            run.cancel_requested = true;
            for (_, outcome) in run.outcomes.iter_mut() {
                if *outcome == VerbOutcome::Pending {
                    *outcome = VerbOutcome::Cancelled;
                }
            }
            self.push(&mut inner, runner, app_name);
        }
        self.snapshot(&mut inner, runner, app_name)
    }

    /// Starts verb `index` of run `run_id`, or marks it cancelled when a cancel was requested.
    /// Pushes either way. The verb to install, if any.
    fn begin_verb(&self, inner: &mut Inner, run_id: u64, index: usize) -> Option<String> {
        let run = inner
            .current_run
            .as_mut()
            .filter(|run| run.run_id == run_id)?;
        let verb = run.verbs.get(index)?.clone();
        let cancelled = run.cancel_requested;
        if cancelled {
            run.outcomes[index].1 = VerbOutcome::Cancelled;
        } else {
            run.outcomes[index].1 = VerbOutcome::Installing;
            run.current_verb = verb.clone();
        }
        let (runner, app_name) = (run.runner.clone(), run.app_name.clone());
        self.push(inner, &runner, &app_name);
        (!cancelled).then_some(verb)
    }

    fn start_verb(&self, run_id: u64, index: usize) -> Option<String> {
        let mut inner = self.lock();
        self.begin_verb(&mut inner, run_id, index)
    }

    fn finish_verb(&self, run_id: u64, index: usize, installed: bool) {
        let mut inner = self.lock();
        let Some(run) = inner
            .current_run
            .as_mut()
            .filter(|run| run.run_id == run_id)
        else {
            return;
        };
        run.outcomes[index].1 = if installed {
            VerbOutcome::Installed
        } else {
            VerbOutcome::Failed
        };
        run.current_verb.clear();
        let (runner, app_name) = (run.runner.clone(), run.app_name.clone());
        self.push(&mut inner, &runner, &app_name);
    }

    /// The run's own log: the classified lines of the verbs it ran (progress lines replace each
    /// other, capped), so a remounted tab rebuilds its log from the state. No push per line: the
    /// renderer already receives them live as `progressOfWinetricks`.
    fn append_line(&self, run_id: u64, line: LogLine) {
        let mut inner = self.lock();
        if let Some(run) = inner
            .current_run
            .as_mut()
            .filter(|run| run.run_id == run_id)
        {
            append_log_line(&mut run.log, line, MAX_BUFFERED_LINES);
        }
    }

    /// The end of a run, however it ended (the TS `finally`). A verb still `installing` when the run
    /// ends was cut off: `cancelled` on a quit, `failed` on a crash; one still `pending` never ran.
    fn finish_run(&self, run_id: u64, interrupted: bool) {
        let mut inner = self.lock();
        let Some(run) = inner
            .current_run
            .as_mut()
            .filter(|run| run.run_id == run_id)
        else {
            return;
        };
        for (_, outcome) in run.outcomes.iter_mut() {
            *outcome = match *outcome {
                VerbOutcome::Installing if interrupted => VerbOutcome::Cancelled,
                VerbOutcome::Installing => VerbOutcome::Failed,
                VerbOutcome::Pending => VerbOutcome::Cancelled,
                done => done,
            };
        }
        run.status = RunStatus::Done;
        run.current_verb.clear();
        let (runner, app_name) = (run.runner.clone(), run.app_name.clone());
        self.push(&mut inner, &runner, &app_name);
        drop(inner);
        self.send_game_status(&runner, &app_name, "done");
    }
}

/// Clears `apply_in_flight` when `apply` ends, whichever way (the TS `finally`).
struct InFlight<'a>(&'a WinetricksQueue);

impl Drop for InFlight<'_> {
    fn drop(&mut self) {
        self.0.lock().apply_in_flight = false;
    }
}

/// Ends the run when the task holding it ends: normally, on a quit, or on a panic.
struct FinishRun {
    queue: Arc<WinetricksQueue>,
    run_id: u64,
    interrupted: bool,
}

impl Drop for FinishRun {
    fn drop(&mut self) {
        self.queue.finish_run(self.run_id, self.interrupted);
    }
}

/// `apply`: validates the renderer's verbs against the game's catalog, and on acceptance starts the run
/// (the first verb already `installing` in the answer, as the TS reply was) and returns at once; the
/// rest installs detached. The guard runs before any verb reaches an argv (T-87-31).
pub async fn apply(
    ctx: &WineCtx,
    host: Arc<WineHost>,
    launcher: Arc<dyn Launcher>,
    target: OwnedTarget,
    verbs: &Value,
) -> ApplyResult {
    let queue = &ctx.winetricks_queue;
    {
        let mut inner = queue.lock();
        if queue.is_busy(&inner) {
            return ApplyResult::Busy;
        }
        inner.apply_in_flight = true;
    }
    let _in_flight = InFlight(queue);

    let catalog = {
        let session = Session {
            ctx,
            host: &host,
            launcher: &*launcher,
        };
        catalog_for(&session, &target.as_target()).await
    };
    let verb_list = match assert_apply_payload(verbs, &catalog) {
        Ok(list) => list,
        Err(rejected) => return ApplyResult::Invalid(rejected.0),
    };

    // Held from here, before the run is visible, so a quit can never miss it.
    let registrant = ctx.engine.shutdown.register("wine-winetricks");
    let (run_id, first, state) = {
        let mut inner = queue.lock();
        let run_id = inner.next_run_id;
        inner.next_run_id += 1;
        inner.current_run = Some(QueueRun {
            run_id,
            runner: target.runner.clone(),
            app_name: target.app_name.clone(),
            outcomes: verb_list
                .iter()
                .map(|verb| (verb.clone(), VerbOutcome::Pending))
                .collect(),
            verbs: verb_list.clone(),
            current_verb: String::new(),
            status: RunStatus::Running,
            cancel_requested: false,
            log: Vec::new(),
        });
        queue.send_game_status(&target.runner, &target.app_name, "winetricks");
        queue.push(&mut inner, &target.runner, &target.app_name);
        // The first verb is started here, so the answer is never older than a push already sent.
        let first = queue.begin_verb(&mut inner, run_id, 0);
        let state = queue.snapshot(&mut inner, &target.runner, &target.app_name);
        (run_id, first, state)
    };

    tokio::spawn(run_task(RunTask {
        ctx: ctx.clone(),
        host,
        launcher,
        target,
        run_id,
        count: verb_list.len(),
        first,
        registrant,
    }));
    ApplyResult::Accepted(Box::new(state))
}

/// Everything the detached run owns.
struct RunTask {
    ctx: WineCtx,
    host: Arc<WineHost>,
    launcher: Arc<dyn Launcher>,
    target: OwnedTarget,
    run_id: u64,
    count: usize,
    first: Option<String>,
    registrant: Registrant,
}

async fn run_task(task: RunTask) {
    let RunTask {
        ctx,
        host,
        launcher,
        target,
        run_id,
        count,
        first,
        registrant,
    } = task;
    let _registrant = registrant;
    let mut finish = FinishRun {
        queue: Arc::clone(&ctx.winetricks_queue),
        run_id,
        interrupted: false,
    };
    let token = ctx.engine.shutdown.token();
    let driven = drive(&ctx, &host, &*launcher, &target, run_id, count, first);
    tokio::select! {
        biased;
        _ = token.cancelled() => finish.interrupted = true,
        _ = driven => {}
    }
}

/// The sequential loop (D-11/D-12): every verb in order, a failed verb never stops the rest.
async fn drive(
    ctx: &WineCtx,
    host: &WineHost,
    launcher: &dyn Launcher,
    target: &OwnedTarget,
    run_id: u64,
    count: usize,
    mut first: Option<String>,
) {
    let queue = &ctx.winetricks_queue;
    let tool_target = target.as_target();
    for index in 0..count {
        let verb = if index == 0 {
            first.take()
        } else {
            queue.start_verb(run_id, index)
        };
        let Some(verb) = verb else { continue };
        let session = Session {
            ctx,
            host,
            launcher,
        };
        let sink_queue = Arc::clone(queue);
        let mut sink = move |line: &LogLine| sink_queue.append_line(run_id, line.clone());
        let outcome = install(&session, &tool_target, &verb, Some(&mut sink)).await;
        queue.finish_verb(run_id, index, outcome == InstallOutcome::Installed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_engine::testing::RecordingEmitter;

    fn queue(emitter: Arc<RecordingEmitter>) -> (Arc<WinetricksQueue>, InstallingSlot) {
        let slot = InstallingSlot::default();
        let queue = WinetricksQueue::new(
            emitter,
            Arc::clone(&slot),
            Arc::new(WinetricksEnvironment::new()),
        );
        (queue, slot)
    }

    #[test]
    fn a_state_with_no_run_has_the_ts_shape_and_a_rising_revision() {
        let (queue, _) = queue(Arc::new(RecordingEmitter::new()));
        let first = serde_json::to_value(queue.state("gog", "1")).unwrap();
        assert_eq!(
            first,
            json!({
                "runner": "gog", "appName": "1", "run": null, "busy": false,
                "environment": { "unsupportedWineVersion": null, "missingDependencies": [] },
                "revision": 1
            })
        );
        assert_eq!(queue.state("gog", "1").revision, 2);
    }

    #[test]
    fn busy_follows_the_component_slot() {
        let (queue, slot) = queue(Arc::new(RecordingEmitter::new()));
        *lock(&slot) = "dotnet48".to_string();
        assert!(queue.state("gog", "1").busy);
        lock(&slot).clear();
        assert!(!queue.state("gog", "1").busy);
    }

    #[test]
    fn cancelling_with_no_run_changes_and_pushes_nothing() {
        let emitter = Arc::new(RecordingEmitter::new());
        let (queue, _) = queue(Arc::clone(&emitter));
        let state = queue.cancel_remaining("gog", "1");
        assert!(state.run.is_none());
        assert!(emitter.pushed().is_empty());
    }

    #[test]
    fn an_environment_change_is_pushed_for_that_game_even_with_no_run() {
        let emitter = Arc::new(RecordingEmitter::new());
        let (queue, _) = queue(Arc::clone(&emitter));
        queue
            .environment
            .record_missing_dependencies("gog", "1", &["curl".to_string()]);
        let pushed = emitter.pushed();
        assert_eq!(pushed.len(), 1);
        assert_eq!(pushed[0].0, QUEUE_CHANNEL);
        assert_eq!(
            pushed[0].1[0]["environment"]["missingDependencies"],
            json!(["curl"])
        );
        assert_eq!(pushed[0].1[0]["run"], Value::Null);
    }

    #[test]
    fn the_apply_answers_have_the_ts_objects() {
        assert_eq!(
            ApplyResult::Busy.to_json(),
            json!({ "accepted": false, "reason": "busy", "detail": "A winetricks install is already running." })
        );
        assert_eq!(
            ApplyResult::Invalid("x".into()).to_json(),
            json!({ "accepted": false, "reason": "invalid", "detail": "x" })
        );
    }
}
