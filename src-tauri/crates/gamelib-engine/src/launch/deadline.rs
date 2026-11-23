//! The per-key launch deadline (`launchDeadline.ts`, Phase 59 D-10/D-11; the launch's firing side from
//! `launchEngine.ts`'s `onEngineLaunchDeadline`; ported in 87-51, D-01, D-17).
//!
//! Armed by the launch path before the engine starts; cancelled the moment the game process is seen
//! ([`crate::launch::watch`]) or the launch ends. A running game is never subject to it. What a fired
//! deadline means depends on the launch:
//!
//! - **a non-Steam launch** ([`DeadlineKind::Notice`]): a notice, never a kill (61-21 D-18, D-16, CR-02,
//!   CR-03). A missing `ps` match is not evidence the game is not running (bare-basename and
//!   launcher-stub shapes are unmatchable) and a bottle can be shared with another running game, so
//!   nothing is stopped and the registry entry, overlay context and ledger entry stay until the launch
//!   ends. The notice is a system notification plus an in-app toast; it never raises the main window or
//!   opens a modal (61-27 WR-02), because the game is very likely running and fullscreen.
//! - **a Steam bridge launch** ([`DeadlineKind::Bridge`]): the TS owner of the bridge decides (it stops the
//!   bottle and shows its own dialog), so the deadline sends it the `engineDeadlineFired {key, reason}`
//!   frame through `EngineUi::send_to_sidecar`. Rust sends it; the renderer has no way to.
//!
//! The shutdown contract: a deadline is one tokio task holding an `engine-deadline` registrant for as long
//! as it is armed, ending with the shutdown token (no notice fires while the app quits), cancelled by
//! [`cancel`] and bounded by its own timer. The timer is `tokio::time`, so a test runs it on a paused
//! clock; `ctx.clock` only reads the elapsed time the log line reports.

use std::time::Duration;

use serde_json::{json, Map, Value};

use crate::bottles::registry::EngineSelection;
use crate::ctx::EngineCtx;
use crate::key::is_engine_key;
use crate::state::publish::publish_launch_deadline_notice;

/// 59 D-11 (Pitfall 5, A7): must cover a first-run prefix update after an engine switch (5-7 s, spike
/// 059), the shared-redist step and a cold Wine-Staging start. Running games are never subject to it
/// because it is cancelled at the first process match.
pub const LAUNCH_DEADLINE_MS: u64 = 180_000;

/// The frame a fired bridge deadline sends the sidecar.
pub const BRIDGE_DEADLINE_CHANNEL: &str = "engineDeadlineFired";
/// The `reason` of that frame: the deadline passed with no game process seen.
pub const BRIDGE_DEADLINE_REASON: &str = "no-game-process";

/// The tag the notice carries in the log (`[engine-notice] key=... tag=...`).
const NOTICE_TAG: &str = "launch-deadline-unconfirmed";

/// Why a deadline was cancelled (`DeadlineCancelReason`): a closed set, because the reason is written to
/// the log and arrives from the sidecar by an op.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CancelReason {
    FirstMatch,
    LauncherExited,
    LaunchError,
    Superseded,
    MonitorUnavailable,
}

impl CancelReason {
    pub fn as_str(self) -> &'static str {
        match self {
            CancelReason::FirstMatch => "first-match",
            CancelReason::LauncherExited => "launcher-exited",
            CancelReason::LaunchError => "launch-error",
            CancelReason::Superseded => "superseded",
            CancelReason::MonitorUnavailable => "monitor-unavailable",
        }
    }

    /// The reason a caller named, or `None` outside the closed set.
    pub fn parse(word: &str) -> Option<CancelReason> {
        [
            CancelReason::FirstMatch,
            CancelReason::LauncherExited,
            CancelReason::LaunchError,
            CancelReason::Superseded,
            CancelReason::MonitorUnavailable,
        ]
        .into_iter()
        .find(|reason| reason.as_str() == word)
    }
}

/// The game a notice deadline speaks for, and the selection the launch held when it was armed (the registry
/// entry can be gone by the time the deadline fires, 59 UAT G5, so the label falls back to this one).
#[derive(Debug, Clone)]
pub struct NoticeTarget {
    pub runner: String,
    pub app_name: String,
    pub title: String,
    pub armed_selection: Option<EngineSelection>,
}

/// What a fired deadline does.
#[derive(Debug, Clone)]
pub enum DeadlineKind {
    /// A non-Steam launch: the no-kill notice.
    Notice(Box<NoticeTarget>),
    /// A Steam bridge launch: the `engineDeadlineFired` frame for the sidecar.
    Bridge,
}

/// Why a deadline could not be armed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArmError {
    /// Not an engine key (the TS threw a `TypeError`).
    InvalidKey,
    /// The context was never shared ([`EngineCtx::share`]), so a task could not reach it when it fires.
    NotShared,
    /// Called outside a tokio runtime.
    NoRuntime,
}

impl ArmError {
    /// The word an op reports.
    pub fn as_str(self) -> &'static str {
        match self {
            ArmError::InvalidKey => "bad-args",
            ArmError::NotShared => "not-shared",
            ArmError::NoRuntime => "no-runtime",
        }
    }
}

fn log_info(ctx: &EngineCtx, line: &str) {
    if let Some(log) = ctx.log.as_deref() {
        log.info(line);
    }
}

fn log_warn(ctx: &EngineCtx, line: &str) {
    if let Some(log) = ctx.log.as_deref() {
        log.warn(line);
    }
}

/// Arms the deadline of `key` for [`LAUNCH_DEADLINE_MS`]: a deadline `key` already holds is cancelled
/// (`superseded`) first.
pub fn arm(ctx: &EngineCtx, key: &str, kind: DeadlineKind) -> Result<(), ArmError> {
    arm_for(ctx, key, kind, Duration::from_millis(LAUNCH_DEADLINE_MS))
}

/// [`arm`] with the time the deadline waits (the TS `timeoutMs`).
pub fn arm_for(
    ctx: &EngineCtx,
    key: &str,
    kind: DeadlineKind,
    delay: Duration,
) -> Result<(), ArmError> {
    if !is_engine_key(key) {
        return Err(ArmError::InvalidKey);
    }
    let me = ctx.weak().ok_or(ArmError::NotShared)?;
    let runtime = tokio::runtime::Handle::try_current().map_err(|_| ArmError::NoRuntime)?;

    cancel(ctx, key, CancelReason::Superseded);
    let (generation, cancelled) = ctx.launch_state.begin_deadline(key);
    let registrant = ctx.shutdown.register("engine-deadline");
    let quit = ctx.shutdown.token();
    let started = ctx.clock.now_ms();
    let key = key.to_string();

    runtime.spawn(async move {
        let _registrant = registrant;
        tokio::select! {
            biased;
            // The app is quitting: nothing fires, and the entry goes with the task.
            () = quit.cancelled() => {
                if let Some(ctx) = me.upgrade() {
                    ctx.launch_state.claim_deadline(&key, generation);
                }
            }
            () = cancelled.cancelled() => {}
            () = tokio::time::sleep(delay) => {
                let Some(ctx) = me.upgrade() else {
                    return;
                };
                // A cancel that raced the timer already removed the entry: then nothing fires.
                if ctx.launch_state.claim_deadline(&key, generation) {
                    fire(&ctx, &key, &kind, started);
                }
            }
        }
    });
    Ok(())
}

/// Cancels the deadline of `key` (`cancelLaunchDeadline`); `true` when one was armed. The task ends and the
/// entry is gone before this returns.
pub fn cancel(ctx: &EngineCtx, key: &str, reason: CancelReason) -> bool {
    let Some(token) = ctx.launch_state.take_deadline(key) else {
        return false;
    };
    token.cancel();
    log_info(
        ctx,
        &format!(
            "Engine: launch deadline for key {key} cancelled ({})",
            reason.as_str()
        ),
    );
    true
}

/// 59-REVIEW CR-01: nothing but a live process monitor can cancel the deadline at first match, and on the
/// built-in engine the wine launcher lives as long as the game, so an unwatched deadline kills a running
/// game. When no monitor started, an armed deadline is stood down at once (`bindDeadlineToMonitor`).
pub fn stand_down_without_monitor(ctx: &EngineCtx, key: &str) -> bool {
    if !cancel(ctx, key, CancelReason::MonitorUnavailable) {
        return false;
    }
    log_info(
        ctx,
        &format!(
            "Engine: {key} no process monitor started; launch deadline stood down (monitor-unavailable)"
        ),
    );
    true
}

fn fire(ctx: &EngineCtx, key: &str, kind: &DeadlineKind, started_ms: u64) {
    let elapsed = ctx.clock.now_ms().saturating_sub(started_ms);
    log_warn(
        ctx,
        &format!(
            "Engine: launch deadline fired for key {key} after {elapsed} ms (no game process seen)"
        ),
    );
    match kind {
        DeadlineKind::Notice(target) => fire_notice(ctx, key, target),
        DeadlineKind::Bridge => {
            if let Some(ui) = ctx.ui.as_deref() {
                ui.send_to_sidecar(
                    BRIDGE_DEADLINE_CHANNEL,
                    vec![json!({"key": key, "reason": BRIDGE_DEADLINE_REASON})],
                );
            }
        }
    }
}

/// `onEngineLaunchDeadline`: the no-kill notice. Nothing is stopped.
fn fire_notice(ctx: &EngineCtx, key: &str, target: &NoticeTarget) {
    // G5: the registry entry can be gone by now, so fall back to the selection seen at arm time.
    let selection = ctx
        .registry
        .get_engine_selection(key)
        .or_else(|| target.armed_selection.clone());
    let label = selection.map_or_else(|| "engine unknown".to_string(), |sel| sel.log_label());
    log_warn(
        ctx,
        &format!(
            "Engine: {key} launch deadline fired ({label}) with no game process seen; not stopping anything"
        ),
    );
    ctx.launch_state.stop_watcher(key);

    let seconds = LAUNCH_DEADLINE_MS / 1000;
    let none = Map::<String, Value>::new();
    let title = ctx.i18n.t(
        "gamelib:steam.engine.notDetected.title",
        "Couldn't confirm the game started",
        &none,
    );
    let mut params = Map::new();
    params.insert("title".to_string(), Value::String(target.title.clone()));
    params.insert("seconds".to_string(), json!(seconds));
    let body = ctx.i18n.t(
        "gamelib:steam.engine.notDetected.body",
        "GameLib couldn't confirm that {{title}} started within {{seconds}} seconds. It has not been stopped. If it is stuck, stop it from its game page and check the launch log (Settings > Logs).",
        &params,
    );
    crate::launch::dialogs::show_engine_notice(
        ctx,
        &crate::launch::dialogs::Notice {
            key,
            title: &title,
            body: &body,
            tag: NOTICE_TAG,
        },
    );
    let pushed = publish_launch_deadline_notice(
        ctx,
        &target.runner,
        &target.app_name,
        &target.title,
        json!(seconds),
    );
    log_info(
        ctx,
        &format!("Engine: {key} launch deadline notice surface=in-app pushed={pushed} raise=false"),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ctx::{EnginePaths, Platform};
    use crate::testing::{FixedClock, RecordingEmitter, RecordingLog, RecordingUi, UiEvent};
    use gamelib_core::shutdown::Shutdown;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use std::sync::Arc;

    struct Fixture {
        ctx: Arc<EngineCtx>,
        ui: Arc<RecordingUi>,
        log: Arc<RecordingLog>,
        _home: FakeHome,
    }

    fn fixture() -> Fixture {
        let home = FakeHome::new("engine-deadline-");
        let root = home.root().to_path_buf();
        let ui = Arc::new(RecordingUi::new());
        let log = Arc::new(RecordingLog::new());
        let ctx = EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(FixedClock::new(1)),
            Platform::Mac,
            EnginePaths {
                app_folder: root.clone(),
                user_data: root.join("userData"),
                tools_path: root.join("tools"),
                user_home: root.clone(),
                temp: root.join("tmp"),
            },
            Shutdown::new(),
        )
        .with_ui(ui.clone())
        .with_log(log.clone())
        .with_emitter(Arc::new(RecordingEmitter::new()));
        Fixture {
            ctx: ctx.share(),
            ui,
            log,
            _home: home,
        }
    }

    fn target() -> DeadlineKind {
        DeadlineKind::Notice(Box::new(NoticeTarget {
            runner: "legendary".to_string(),
            app_name: "Quail".to_string(),
            title: "Quail".to_string(),
            armed_selection: None,
        }))
    }

    async fn settle() {
        for _ in 0..6 {
            tokio::task::yield_now().await;
        }
    }

    async fn pass(ms: u64) {
        tokio::time::advance(Duration::from_millis(ms)).await;
        settle().await;
    }

    #[tokio::test(start_paused = true)]
    async fn a_deadline_that_reaches_its_time_notifies_once_and_never_raises_the_window() {
        let f = fixture();
        arm_for(
            &f.ctx,
            "legendary:Quail",
            target(),
            Duration::from_millis(500),
        )
        .unwrap();
        settle().await;
        assert!(f.ctx.launch_state.deadline_armed("legendary:Quail"));
        pass(499).await;
        assert!(f.ui.events().is_empty());
        pass(2).await;
        let events = f.ui.events();
        assert_eq!(events.len(), 1, "{events:?}");
        assert!(
            matches!(&events[0], UiEvent::Notify { title, .. } if title == "Couldn't confirm the game started")
        );
        assert!(!events.contains(&UiEvent::RaiseMainWindow));
        assert!(!f.ctx.launch_state.deadline_armed("legendary:Quail"));
        // The registrant is released with the task.
        assert!(f.ctx.shutdown.drain(Duration::ZERO).is_empty());
        let lines = f.log.lines();
        assert!(lines.iter().any(|(_, line)| line
            .contains("launch deadline fired (engine unknown) with no game process seen")));
    }

    #[tokio::test(start_paused = true)]
    async fn a_bridge_deadline_sends_the_sidecar_its_frame_instead_of_a_notice() {
        let f = fixture();
        arm_for(
            &f.ctx,
            "620",
            DeadlineKind::Bridge,
            Duration::from_millis(500),
        )
        .unwrap();
        settle().await;
        pass(501).await;
        assert_eq!(
            f.ui.events(),
            vec![UiEvent::SendToSidecar {
                channel: "engineDeadlineFired".to_string(),
                args: vec![json!({"key": "620", "reason": "no-game-process"})],
            }]
        );
        assert!(!f.ctx.launch_state.deadline_armed("620"));
    }

    #[tokio::test(start_paused = true)]
    async fn a_quit_ends_an_armed_deadline_with_no_notice_and_releases_its_registrant() {
        let f = fixture();
        arm_for(
            &f.ctx,
            "legendary:Quail",
            target(),
            Duration::from_millis(500),
        )
        .unwrap();
        arm_for(
            &f.ctx,
            "620",
            DeadlineKind::Bridge,
            Duration::from_millis(500),
        )
        .unwrap();
        settle().await;
        // Held while armed: the drain names both and cancels the token, as the exit does.
        assert_eq!(
            f.ctx.shutdown.drain(Duration::ZERO),
            ["engine-deadline", "engine-deadline"]
        );
        settle().await;
        assert!(f.ctx.shutdown.drain(Duration::ZERO).is_empty());
        assert_eq!(f.ctx.launch_state.active_deadlines(), 0);
        // The time passes after the quit: nothing fires, not even the frame.
        pass(5_000).await;
        assert!(f.ui.events().is_empty());
        assert!(!f.log.lines().iter().any(|(_, l)| l.contains("fired")));
    }

    #[tokio::test(start_paused = true)]
    async fn a_cancel_ends_the_task_and_names_its_reason_and_a_second_arm_supersedes_the_first() {
        let f = fixture();
        arm_for(&f.ctx, "gog:1", target(), Duration::from_millis(500)).unwrap();
        settle().await;
        assert!(cancel(&f.ctx, "gog:1", CancelReason::FirstMatch));
        assert!(!cancel(&f.ctx, "gog:1", CancelReason::FirstMatch));
        settle().await;
        pass(1_000).await;
        assert!(f.ui.events().is_empty());
        assert!(f.ctx.shutdown.drain(Duration::ZERO).is_empty());

        let f = fixture();
        arm_for(&f.ctx, "gog:1", target(), Duration::from_millis(500)).unwrap();
        settle().await;
        pass(300).await;
        arm_for(&f.ctx, "gog:1", target(), Duration::from_millis(500)).unwrap();
        settle().await;
        pass(300).await;
        // The first would have fired by now; only the second is armed.
        assert!(f.ui.events().is_empty());
        assert_eq!(f.ctx.launch_state.active_deadlines(), 1);
        pass(300).await;
        assert_eq!(f.ui.events().len(), 1);
        let lines: Vec<String> = f.log.lines().into_iter().map(|(_, l)| l).collect();
        assert!(lines
            .contains(&"Engine: launch deadline for key gog:1 cancelled (superseded)".to_string()));
    }

    #[tokio::test(start_paused = true)]
    async fn a_deadline_is_refused_for_a_bad_key_and_for_a_context_that_was_never_shared() {
        let f = fixture();
        assert_eq!(
            arm(&f.ctx, "not a key", DeadlineKind::Bridge),
            Err(ArmError::InvalidKey)
        );
        assert_eq!(f.ctx.launch_state.active_deadlines(), 0);
        let home = FakeHome::new("engine-deadline-unshared-");
        let root = home.root().to_path_buf();
        let unshared = EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(FixedClock::new(1)),
            Platform::Mac,
            EnginePaths {
                app_folder: root.clone(),
                user_data: root.clone(),
                tools_path: root.clone(),
                user_home: root.clone(),
                temp: root,
            },
            Shutdown::new(),
        );
        assert_eq!(
            arm(&unshared, "620", DeadlineKind::Bridge),
            Err(ArmError::NotShared)
        );
    }

    #[test]
    fn the_cancel_reasons_are_a_closed_set() {
        for reason in [
            CancelReason::FirstMatch,
            CancelReason::LauncherExited,
            CancelReason::LaunchError,
            CancelReason::Superseded,
            CancelReason::MonitorUnavailable,
        ] {
            assert_eq!(CancelReason::parse(reason.as_str()), Some(reason));
        }
        assert_eq!(CancelReason::parse("anything else"), None);
        assert_eq!(CancelReason::parse(""), None);
    }
}
