//! The dialog and toast surfaces of the engine step (Phase 61; ported from `engineDialogs.ts`, Phase 87
//! D-02). Texts for the fallback reasons are the `gamelib:steam.engine.toast.*` strings unchanged (D-12),
//! resolved through the context's catalog.
//!
//! Like Steam, the in-app dialog is shown on every refused attempt: the user pressed Play and nothing
//! else will tell them why it did nothing, so [`show_engine_dialog`] notifies, raises the main window and
//! shows the dialog every time, each with a new acknowledgement id. [`show_engine_notice`] is for notices
//! about a game that may be running (61-27, WR-02): it never takes focus, so it never raises the window
//! and never opens a modal.
//!
//! The acknowledgement id of a dialog starts with `engine:`: the renderer echoes it back (`dialogDisplayed`)
//! once the dialog is on screen, and op `engine_dialog_displayed` settles it here. A dialog whose
//! acknowledgement never arrives is logged as unconfirmed after 15 s, by a task that holds a shutdown
//! registrant and ends with it.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use serde_json::{Map, Value};
use tokio_util::sync::CancellationToken;

use crate::ctx::EngineCtx;
use crate::sinks::EngineLog;

/// What every engine dialog's acknowledgement id starts with.
pub const ACK_PREFIX: &str = "engine:";

/// How long a dialog waits for its acknowledgement before it is logged as unconfirmed.
pub const DIALOG_ACK_TIMEOUT_MS: u64 = 15_000;

/// An id this module could have made: `engine:` and 1 to 20 digits. The renderer echoes an id back, so
/// anything else is refused before it is looked up.
pub fn is_ack_id(id: &str) -> bool {
    id.strip_prefix(ACK_PREFIX)
        .is_some_and(|n| (1..=20).contains(&n.len()) && n.bytes().all(|b| b.is_ascii_digit()))
}

/// The dialog type of a notice (`showDialogBoxModalAuto`'s `MESSAGE`).
const MESSAGE: &str = "MESSAGE";

struct Pending {
    key: String,
    tag: String,
    started_ms: u64,
    /// Ends the timeout task early, when the acknowledgement arrives first.
    settled: CancellationToken,
}

/// The dialogs waiting for the renderer's "it is on screen" acknowledgement. In memory only: empty at
/// construction; a timer exists only between a dialog and its acknowledgement or its timeout.
#[derive(Default)]
pub struct DisplayAcks {
    next: AtomicU64,
    pending: Arc<Mutex<HashMap<String, Pending>>>,
}

impl std::fmt::Debug for DisplayAcks {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DisplayAcks").finish_non_exhaustive()
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

/// The line the TS wrote when a dialog settled.
fn settled_line(key: &str, tag: &str, outcome: &str) -> String {
    format!("[engine-notice] key={key} tag={tag} display={outcome}")
}

impl DisplayAcks {
    pub fn new() -> DisplayAcks {
        DisplayAcks::default()
    }

    /// A new acknowledgement id (`engine:<n>`), unique within the context.
    pub fn new_id(&self) -> String {
        format!(
            "{ACK_PREFIX}{}",
            self.next.fetch_add(1, Ordering::Relaxed) + 1
        )
    }

    /// The dialogs waiting for their acknowledgement.
    pub fn pending_count(&self) -> usize {
        lock(&self.pending).len()
    }

    /// Starts waiting for `ack_id`. The timeout task is bounded (`timeout_ms`), holds a registrant of the
    /// context's shutdown and ends with the token, so it never keeps the app alive. Outside a runtime
    /// (no op does that) nothing is tracked.
    pub fn track(&self, ctx: &EngineCtx, ack_id: &str, key: &str, tag: &str, timeout_ms: u64) {
        let Ok(runtime) = tokio::runtime::Handle::try_current() else {
            return;
        };
        let settled = CancellationToken::new();
        lock(&self.pending).insert(
            ack_id.to_string(),
            Pending {
                key: key.to_string(),
                tag: tag.to_string(),
                started_ms: ctx.clock.now_ms(),
                settled: settled.clone(),
            },
        );
        let registrant = ctx.shutdown.register("engine-dialog-ack");
        let quit = ctx.shutdown.token();
        let pending = Arc::clone(&self.pending);
        let log = ctx.log.clone();
        let ack_id = ack_id.to_string();
        runtime.spawn(async move {
            let _registrant = registrant;
            tokio::select! {
                () = tokio::time::sleep(Duration::from_millis(timeout_ms)) => {
                    let entry = lock(&pending).remove(&ack_id);
                    if let (Some(entry), Some(log)) = (entry, log.as_deref()) {
                        log.info(&format!(
                            "{} timeout={timeout_ms}",
                            settled_line(&entry.key, &entry.tag, "unconfirmed")
                        ));
                    }
                }
                () = settled.cancelled() => {}
                () = quit.cancelled() => {
                    lock(&pending).remove(&ack_id);
                }
            }
        });
    }

    /// The renderer says the dialog is on screen (op `engine_dialog_displayed`). `true` when the id was
    /// being tracked; a repeated or unknown acknowledgement is ignored.
    pub fn acknowledge(&self, ctx: &EngineCtx, ack_id: &str) -> bool {
        let Some(entry) = lock(&self.pending).remove(ack_id) else {
            return false;
        };
        entry.settled.cancel();
        if let Some(log) = ctx.log.as_deref() {
            let elapsed = ctx.clock.now_ms().saturating_sub(entry.started_ms);
            log.info(&format!(
                "{} elapsedMs={elapsed}",
                settled_line(&entry.key, &entry.tag, "confirmed")
            ));
        }
        true
    }
}

/// What a dialog or a notice is about: the engine key (for the log), the title and body the user reads and
/// the short tag the log carries (`override-unavailable`).
#[derive(Debug, Clone, Copy)]
pub struct Notice<'a> {
    pub key: &'a str,
    pub title: &'a str,
    pub body: &'a str,
    pub tag: &'a str,
}

fn info(ctx: &EngineCtx, line: &str) {
    if let Some(log) = ctx.log.as_deref() {
        EngineLog::info(log, line);
    }
}

/// A refused launch: a system notification, a window raise and an in-app dialog, every time.
pub fn show_engine_dialog(ctx: &EngineCtx, notice: &Notice<'_>) {
    let Some(ui) = ctx.ui.as_deref() else {
        return;
    };
    let Notice {
        key,
        title,
        body,
        tag,
    } = *notice;
    ui.notify(title, body);
    ui.raise_main_window();
    let ack_id = ctx.display_acks.new_id();
    ctx.display_acks
        .track(ctx, &ack_id, key, tag, DIALOG_ACK_TIMEOUT_MS);
    let sent = ui.show_dialog(title, body, MESSAGE, &ack_id);
    info(
        ctx,
        &format!(
            "[engine-notice] key={key} tag={tag} dispatched=in-app-dialog+notify dialog-frame-sent={sent} display=pending"
        ),
    );
}

/// A notify-only notice: a system notification, no window raise, no modal (61-27, WR-02).
pub fn show_engine_notice(ctx: &EngineCtx, notice: &Notice<'_>) {
    let Some(ui) = ctx.ui.as_deref() else {
        return;
    };
    let Notice {
        key,
        title,
        body,
        tag,
    } = *notice;
    ui.notify(title, body);
    info(
        ctx,
        &format!("[engine-notice] key={key} tag={tag} dispatched=notify raise=false"),
    );
}

/// The "using built-in engine" toast for an Automatic fallback (59 D-06). `reason` is the selection's
/// (`cx-expired`, `cx-broken`; anything else reads as CrossOver missing).
pub fn notify_engine_fallback(ctx: &EngineCtx, title: &str, reason: &str) {
    let Some(ui) = ctx.ui.as_deref() else {
        return;
    };
    let none = Map::<String, Value>::new();
    let body = match reason {
        "cx-expired" => ctx.i18n.t(
            "gamelib:steam.engine.toast.cxExpired",
            "CrossOver trial expired \u{2014} using built-in engine",
            &none,
        ),
        "cx-broken" => ctx.i18n.t(
            "gamelib:steam.engine.toast.cxBroken",
            "CrossOver isn't working \u{2014} using built-in engine",
            &none,
        ),
        _ => ctx.i18n.t(
            "gamelib:steam.engine.toast.cxMissing",
            "CrossOver not found \u{2014} using built-in engine",
            &none,
        ),
    };
    ui.notify(title, &body);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ctx::{EnginePaths, Platform};
    use crate::testing::{FixedClock, RecordingLog, RecordingUi, UiEvent};
    use gamelib_core::shutdown::Shutdown;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;

    struct Fixture {
        ctx: EngineCtx,
        ui: Arc<RecordingUi>,
        log: Arc<RecordingLog>,
        clock: Arc<FixedClock>,
        _home: FakeHome,
    }

    fn fixture() -> Fixture {
        let home = FakeHome::new("engine-dialogs-");
        let root = home.root().to_path_buf();
        let ui = Arc::new(RecordingUi::new());
        let log = Arc::new(RecordingLog::new());
        let clock = Arc::new(FixedClock::new(1_000));
        let ctx = EngineCtx::new(
            Arc::new(StoreHost::new()),
            clock.clone(),
            Platform::Mac,
            EnginePaths {
                app_folder: root.clone(),
                user_data: root.clone(),
                tools_path: root.join("tools"),
                user_home: root.join("home"),
                temp: root.join("temp"),
            },
            Shutdown::new(),
        )
        .with_ui(ui.clone())
        .with_log(log.clone());
        Fixture {
            ctx,
            ui,
            log,
            clock,
            _home: home,
        }
    }

    fn notice<'a>() -> Notice<'a> {
        Notice {
            key: "gog:1",
            title: "Quail",
            body: "It did not start.",
            tag: "override-unavailable",
        }
    }

    #[tokio::test]
    async fn a_refused_attempt_notifies_raises_and_shows_a_dialog_every_time() {
        let f = fixture();
        show_engine_dialog(&f.ctx, &notice());
        show_engine_dialog(&f.ctx, &notice());
        let events = f.ui.events();
        let raises = events
            .iter()
            .filter(|e| **e == UiEvent::RaiseMainWindow)
            .count();
        assert_eq!(raises, 2);
        let acks: Vec<String> = events
            .iter()
            .filter_map(|e| match e {
                UiEvent::ShowDialog {
                    ack_id, kind, body, ..
                } => {
                    assert_eq!(
                        (kind.as_str(), body.as_str()),
                        ("MESSAGE", "It did not start.")
                    );
                    Some(ack_id.clone())
                }
                _ => None,
            })
            .collect();
        assert_eq!(acks, ["engine:1", "engine:2"], "a new id on every attempt");
        assert_eq!(f.ctx.display_acks.pending_count(), 2);
        let lines = f.log.lines();
        assert_eq!(lines.len(), 2);
        assert_eq!(
            lines[0].1,
            "[engine-notice] key=gog:1 tag=override-unavailable dispatched=in-app-dialog+notify dialog-frame-sent=true display=pending"
        );
    }

    #[tokio::test]
    async fn a_notice_notifies_and_never_raises_or_opens_a_dialog() {
        let f = fixture();
        show_engine_notice(&f.ctx, &notice());
        assert_eq!(
            f.ui.events(),
            [UiEvent::Notify {
                title: "Quail".to_string(),
                body: "It did not start.".to_string()
            }]
        );
        assert_eq!(f.ctx.display_acks.pending_count(), 0);
        assert_eq!(
            f.log.lines(),
            [(
                "info",
                "[engine-notice] key=gog:1 tag=override-unavailable dispatched=notify raise=false"
                    .to_string()
            )]
        );
    }

    #[test]
    fn only_ids_this_module_makes_are_ack_ids() {
        for good in ["engine:1", "engine:42", "engine:18446744073709551615"] {
            assert!(is_ack_id(good), "{good}");
        }
        for bad in [
            "",
            "engine:",
            "engine:x",
            "engine:1 ",
            "ack-1",
            "engine:-1",
            "other:1",
        ] {
            assert!(!is_ack_id(bad), "{bad:?}");
        }
        assert!(!is_ack_id(&format!("engine:{}", "9".repeat(21))));
    }

    #[tokio::test]
    async fn a_headless_context_shows_and_logs_nothing() {
        let f = fixture();
        let mut ctx = f.ctx;
        ctx.ui = None;
        show_engine_dialog(&ctx, &notice());
        show_engine_notice(&ctx, &notice());
        notify_engine_fallback(&ctx, "Quail", "cx-missing");
        assert!(f.log.lines().is_empty());
        assert_eq!(ctx.display_acks.pending_count(), 0);
    }

    #[tokio::test]
    async fn the_toast_says_the_reason_in_the_catalogs_words_and_falls_back_to_the_inline_text() {
        let f = fixture();
        for (reason, want) in [
            (
                "cx-expired",
                "CrossOver trial expired \u{2014} using built-in engine",
            ),
            (
                "cx-broken",
                "CrossOver isn't working \u{2014} using built-in engine",
            ),
            (
                "cx-missing",
                "CrossOver not found \u{2014} using built-in engine",
            ),
            (
                "anything-else",
                "CrossOver not found \u{2014} using built-in engine",
            ),
        ] {
            notify_engine_fallback(&f.ctx, "Quail", reason);
            assert_eq!(
                f.ui.events().last(),
                Some(&UiEvent::Notify {
                    title: "Quail".to_string(),
                    body: want.to_string()
                }),
                "{reason}"
            );
        }
        assert!(f.log.lines().is_empty(), "a toast writes no line");
        assert!(!f
            .ui
            .events()
            .iter()
            .any(|e| matches!(e, UiEvent::RaiseMainWindow)));
    }

    #[tokio::test]
    async fn an_acknowledgement_settles_the_dialog_once_and_logs_the_elapsed_time() {
        let f = fixture();
        show_engine_dialog(&f.ctx, &notice());
        f.clock.advance(250);
        assert!(f.ctx.display_acks.acknowledge(&f.ctx, "engine:1"));
        assert!(
            !f.ctx.display_acks.acknowledge(&f.ctx, "engine:1"),
            "a repeated acknowledgement is ignored"
        );
        assert!(!f.ctx.display_acks.acknowledge(&f.ctx, "engine:99"));
        assert!(!f.ctx.display_acks.acknowledge(&f.ctx, "not-an-engine-id"));
        assert_eq!(f.ctx.display_acks.pending_count(), 0);
        let last = f.log.lines().pop().unwrap().1;
        assert_eq!(
            last,
            "[engine-notice] key=gog:1 tag=override-unavailable display=confirmed elapsedMs=250"
        );
    }

    #[tokio::test]
    async fn a_dialog_nobody_acknowledges_is_logged_unconfirmed_after_its_timeout() {
        let f = fixture();
        f.ctx
            .display_acks
            .track(&f.ctx, "engine:7", "gog:1", "engine-download-failed", 20);
        assert_eq!(f.ctx.display_acks.pending_count(), 1);
        tokio::time::sleep(Duration::from_millis(150)).await;
        assert_eq!(f.ctx.display_acks.pending_count(), 0);
        assert_eq!(
            f.log.lines(),
            [(
                "info",
                "[engine-notice] key=gog:1 tag=engine-download-failed display=unconfirmed timeout=20"
                    .to_string()
            )]
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn quitting_ends_a_waiting_dialog_without_a_line_and_releases_the_registrant() {
        let f = fixture();
        f.ctx
            .display_acks
            .track(&f.ctx, "engine:1", "gog:1", "tag", DIALOG_ACK_TIMEOUT_MS);
        let drained = f.ctx.shutdown.drain(Duration::from_secs(2));
        assert!(drained.is_empty(), "the ack task left in time: {drained:?}");
        assert_eq!(f.ctx.display_acks.pending_count(), 0);
        assert!(f.log.lines().is_empty());
    }
}
