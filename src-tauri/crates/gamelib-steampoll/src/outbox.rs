//! State-event outbox (latest wins per StateEventKey) and the single effect applier (plan 09).
//!
//! D-05: on a transition the state event goes out first; the frontend emit and notification
//! follow after the ack, or after `ACK_TIMEOUT_MS`. D-08 / R1: before the sidecar is READY the
//! event is queued and the post-ack effects run at once. Events carry the full resulting
//! state, so replay of one event is idempotent.
//!
//! Ordering across kinds (80-REVIEW A/WR-08): `installed`, `uninstalled` and `installIncomplete`
//! each write an app's whole install state, so a newer one supersedes every older one of the
//! three. (`updateDone` only invalidates the update state and re-pushes the entry, so it stays
//! independent like the other kinds.) When one is applied or queued, older queued ones for that
//! appId are dropped, and one that fails after a newer one was applied is not queued at all.
//! Replay runs in ascending seq across all kinds. What the crate cannot close alone: an event already on
//! the wire when a newer one overtakes it; the sidecar's per-appId seq guard (Part C) covers
//! that.
//!
//! In-session retry: `flush` runs from `mark_ready` and from [`Outbox::retry_pending`], which
//! the host calls on a timer while the sidecar is up (`RETRY_FLUSH_INTERVAL_MS`). The crate
//! owns no timer. Flushes never overlap.
//!
//! Logging rule: appId and kind only.

use crate::constants::ACK_TIMEOUT_MS;
use crate::effects::{Effect, LogLevel};
use crate::events::{AckReply, StateEvent, StateEventKey};
use crate::host::{HoldSink, PollHost};
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

/// At most this many distinct appIds are queued (T-80-26).
pub const MAX_QUEUED_APP_IDS: usize = 256;

/// Suggested period for the host's in-session retry of unacked events
/// ([`Outbox::retry_pending`]). The crate owns no timer; the shell drives it.
pub const RETRY_FLUSH_INTERVAL_MS: u64 = 10_000;

/// At most this many appIds keep an applied install-state seq; the oldest is forgotten first.
const MAX_APPLIED_SEQ_APP_IDS: usize = 4096;

/// The kinds that each carry an app's whole install state (see the module doc).
pub fn is_install_state_kind(kind: &str) -> bool {
    matches!(kind, "installed" | "uninstalled" | "installIncomplete")
}

#[derive(Default)]
pub struct Outbox {
    ready: AtomicBool,
    queue: Mutex<BTreeMap<StateEventKey, StateEvent>>,
    /// Highest install-state seq the sidecar applied, per appId.
    applied_state_seq: Mutex<BTreeMap<String, u64>>,
    /// Set while a flush runs, so `mark_ready` and the host's retry never interleave.
    flushing: AtomicBool,
    logs: Mutex<Vec<String>>,
}

struct FlushGuard<'a>(&'a AtomicBool);

impl Drop for FlushGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

impl Outbox {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn is_ready(&self) -> bool {
        self.ready.load(Ordering::SeqCst)
    }

    /// Log lines emitted so far (appId and kind only). Kept for tests and diagnostics.
    pub fn logs(&self) -> Vec<String> {
        self.logs.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    /// Number of queued events.
    pub fn queued_len(&self) -> usize {
        self.queue.lock().unwrap_or_else(|e| e.into_inner()).len()
    }

    /// The queued events in ascending seq (diagnostics and tests).
    pub fn queued(&self) -> Vec<StateEvent> {
        let mut v: Vec<StateEvent> = self
            .queue
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .values()
            .cloned()
            .collect();
        v.sort_by_key(|e| e.seq());
        v
    }

    fn log(&self, message: String) {
        eprintln!("gamelib-steampoll: {message}");
        self.logs
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push(message);
    }

    /// True when a newer install-state event for `ev`'s appId was already applied.
    fn superseded_by_applied(&self, ev: &StateEvent) -> bool {
        if !is_install_state_kind(ev.kind()) {
            return false;
        }
        let Some(app_id) = ev.app_id() else {
            return false;
        };
        self.applied_state_seq
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(app_id)
            .is_some_and(|applied| *applied > ev.seq())
    }

    /// Record that the sidecar applied `ev`, and drop queued events it supersedes: the same key
    /// with an older seq, and for an install-state kind every older install-state event of the
    /// appId.
    pub fn note_applied(&self, ev: &StateEvent) {
        let seq = ev.seq();
        let key = ev.key();
        let install_state = is_install_state_kind(ev.kind());
        if install_state {
            if let Some(app_id) = ev.app_id() {
                let mut applied = self
                    .applied_state_seq
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());
                let slot = applied.entry(app_id.to_string()).or_insert(0);
                *slot = (*slot).max(seq);
                while applied.len() > MAX_APPLIED_SEQ_APP_IDS {
                    let Some(oldest) = applied
                        .iter()
                        .min_by_key(|(_, s)| **s)
                        .map(|(k, _)| k.clone())
                    else {
                        break;
                    };
                    applied.remove(&oldest);
                }
            }
        }
        let mut q = self.queue.lock().unwrap_or_else(|e| e.into_inner());
        q.retain(|k, queued| {
            if queued.seq() > seq {
                return true;
            }
            if *k == key {
                return false;
            }
            !(install_state && k.0 == key.0 && is_install_state_kind(k.1))
        });
    }

    /// Queue `ev` (latest seq wins per (appId, kind), and per appId across the install-state
    /// kinds); bounded to `MAX_QUEUED_APP_IDS` appIds.
    pub fn enqueue(&self, ev: StateEvent) {
        if self.superseded_by_applied(&ev) {
            self.log(format!(
                "appId {} kind {}: superseded by a newer applied event, not queued",
                ev.app_id().unwrap_or(""),
                ev.kind()
            ));
            return;
        }
        let mut dropped: Vec<String> = vec![];
        {
            let mut q = self.queue.lock().unwrap_or_else(|e| e.into_inner());
            let key = ev.key();
            if let Some(old) = q.get(&key) {
                if old.seq() > ev.seq() {
                    return;
                }
            }
            if is_install_state_kind(ev.kind()) {
                let newer_state_queued = q
                    .iter()
                    .any(|(k, e)| k.0 == key.0 && is_install_state_kind(k.1) && e.seq() > ev.seq());
                if newer_state_queued {
                    return;
                }
                q.retain(|k, _| !(k.0 == key.0 && is_install_state_kind(k.1)));
            }
            q.insert(key, ev);
            loop {
                let apps: BTreeSet<&str> = q.keys().map(|k| k.0.as_str()).collect();
                if apps.len() <= MAX_QUEUED_APP_IDS {
                    break;
                }
                // Drop the appId holding the oldest-seq entry.
                let Some(oldest) = q.values().min_by_key(|e| e.seq()) else {
                    break;
                };
                let victim = oldest.app_id().unwrap_or("").to_string();
                q.retain(|k, _| k.0 != victim);
                dropped.push(victim);
            }
        }
        for app_id in dropped {
            self.log(format!("outbox cap exceeded, dropped appId {app_id}"));
        }
    }

    /// The sidecar is gone: later events queue instead of being written to a dead pipe.
    pub fn mark_not_ready(&self) {
        self.ready.store(false, Ordering::SeqCst);
    }

    /// Mark the sidecar READY and replay the queue (ascending seq).
    pub async fn mark_ready(&self, host: &dyn PollHost) {
        self.ready.store(true, Ordering::SeqCst);
        self.flush(host).await;
    }

    /// In-session retry for the host's timer: replays the queue when the sidecar is READY and
    /// something is queued. Returns the number still queued afterwards. Cheap when idle.
    pub async fn retry_pending(&self, host: &dyn PollHost) -> usize {
        if self.is_ready() && self.queued_len() > 0 {
            self.flush(host).await;
        }
        self.queued_len()
    }

    /// Replay queued events in ascending seq across all kinds. An entry is removed only when its
    /// ack was applied; a timeout or a not-applied ack leaves it queued for a later replay. An
    /// entry superseded while the replay ran (by a live event, or by an earlier entry of this
    /// replay) is skipped. Returns at once if another flush is running.
    pub async fn flush(&self, host: &dyn PollHost) {
        if self.flushing.swap(true, Ordering::SeqCst) {
            return;
        }
        let _guard = FlushGuard(&self.flushing);
        for ev in self.queued() {
            if !self.is_ready() {
                return;
            }
            let key = ev.key();
            let seq = ev.seq();
            let still_queued = self
                .queue
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .get(&key)
                .map(|e| e.seq())
                == Some(seq);
            if !still_queued {
                continue;
            }
            match send_with_timeout(host, ev.clone()).await {
                Some(reply) if reply.applied => self.note_applied(&ev),
                Some(_) => {}
                None => self.log(format!(
                    "replay appId {} kind {}: ack timeout",
                    key.0, key.1
                )),
            }
        }
    }
}

async fn send_with_timeout(host: &dyn PollHost, ev: StateEvent) -> Option<AckReply> {
    tokio::time::timeout(Duration::from_millis(ACK_TIMEOUT_MS), host.state_event(ev))
        .await
        .ok()
}

/// Apply `effects` in list order. Post-ack effects of a `Transition` run in place, before the
/// next effect of the outer list. `title_cache` is the poll's last known title (R2).
/// Returns the ack reply of every `Transition`, in order (the install loop reads `macArchCheck`
/// from the `installed` one).
pub async fn apply_effects(
    host: &dyn PollHost,
    hold: &dyn HoldSink,
    outbox: &Outbox,
    effects: Vec<Effect>,
    title_cache: &mut String,
) -> Vec<AckReply> {
    let mut replies: Vec<AckReply> = vec![];
    let mut work: VecDeque<Effect> = effects.into();
    while let Some(effect) = work.pop_front() {
        match effect {
            Effect::Frontend { channel, args } => host.emit_frontend(&channel, args),
            Effect::Notify(n) => host.notify(n),
            Effect::Transition { event, then } => {
                let mut reply = if outbox.is_ready() {
                    match send_with_timeout(host, event.clone()).await {
                        Some(r) => r,
                        None => {
                            outbox.log(format!(
                                "appId {} kind {}: ack timeout",
                                event.app_id().unwrap_or(""),
                                event.kind()
                            ));
                            AckReply::not_acked()
                        }
                    }
                } else {
                    AckReply::not_acked()
                };
                if reply.applied {
                    outbox.note_applied(&event);
                } else {
                    outbox.enqueue(event);
                }
                match reply.title.as_deref() {
                    Some(t) => *title_cache = t.to_string(),
                    None if !title_cache.is_empty() => reply.title = Some(title_cache.clone()),
                    None => {}
                }
                let resolved = then.resolve(&reply);
                replies.push(reply);
                for e in resolved.into_iter().rev() {
                    work.push_front(e);
                }
            }
            Effect::WriteHoldRecord { app_id, record } => {
                hold.record(&app_id, record, now_ms());
            }
            Effect::ClearHoldRecord { app_id } => hold.clear(&app_id),
            Effect::Log { level, message } => {
                let tag = match level {
                    LogLevel::Info => "info",
                    LogLevel::Warn => "warn",
                };
                outbox.log(format!("[{tag}] {message}"));
            }
        }
    }
    replies
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
