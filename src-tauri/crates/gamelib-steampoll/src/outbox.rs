//! State-event outbox (latest wins per StateEventKey) and the single effect applier (plan 09).
//!
//! D-05: on a transition the state event goes out first; the frontend emit and notification
//! follow after the ack, or after `ACK_TIMEOUT_MS`. D-08 / R1: before the sidecar is READY the
//! event is queued and the post-ack effects run at once. Events carry the full resulting
//! state, so replay is idempotent.
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

#[derive(Default)]
pub struct Outbox {
    ready: AtomicBool,
    queue: Mutex<BTreeMap<StateEventKey, StateEvent>>,
    logs: Mutex<Vec<String>>,
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

    fn log(&self, message: String) {
        eprintln!("gamelib-steampoll: {message}");
        self.logs
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push(message);
    }

    /// Queue `ev` (latest seq wins per (appId, kind)); bounded to `MAX_QUEUED_APP_IDS` appIds.
    pub fn enqueue(&self, ev: StateEvent) {
        let mut dropped: Vec<String> = vec![];
        {
            let mut q = self.queue.lock().unwrap_or_else(|e| e.into_inner());
            let key = ev.key();
            if let Some(old) = q.get(&key) {
                if old.seq() > ev.seq() {
                    return;
                }
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

    /// Mark the sidecar READY and replay the queue (ascending seq).
    pub async fn mark_ready(&self, host: &dyn PollHost) {
        self.ready.store(true, Ordering::SeqCst);
        self.flush(host).await;
    }

    /// Replay queued events in ascending seq. An entry is removed only when its ack was
    /// applied; a timeout or a not-applied ack leaves it queued for a later replay.
    pub async fn flush(&self, host: &dyn PollHost) {
        let mut pending: Vec<StateEvent> = self
            .queue
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .values()
            .cloned()
            .collect();
        pending.sort_by_key(|e| e.seq());
        for ev in pending {
            let key = ev.key();
            let seq = ev.seq();
            match send_with_timeout(host, ev).await {
                Some(reply) if reply.applied => {
                    let mut q = self.queue.lock().unwrap_or_else(|e| e.into_inner());
                    // A newer event for the same key may have replaced it meanwhile.
                    if q.get(&key).map(|e| e.seq()) == Some(seq) {
                        q.remove(&key);
                    }
                }
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
                if !reply.applied {
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
