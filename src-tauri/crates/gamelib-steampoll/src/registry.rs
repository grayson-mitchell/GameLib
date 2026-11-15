//! Per-appId task registry (template: gamelib-depot/src/registry.rs). A `PollGuard` unregisters on
//! drop, so `cancel_all_and_wait` returns only after the tasks really stopped.

use crate::host::{Clock, PollHost, ProcessRunner};
use std::collections::HashMap;
use std::future::Future;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::runtime::Handle;
use tokio::sync::watch;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PollKind {
    Install,
    Uninstall,
    Running,
}

type Key = (PollKind, String);

struct Entry {
    token: CancellationToken,
    done: watch::Receiver<bool>,
    id: u64,
}

struct Inner {
    map: Mutex<HashMap<Key, Entry>>,
    next_id: AtomicU64,
    notice_seq: AtomicU64,
    event_seq: AtomicU64,
}

#[derive(Clone)]
pub struct Registry {
    handle: Handle,
    host: Arc<dyn PollHost>,
    runner: Arc<dyn ProcessRunner>,
    clock: Arc<dyn Clock>,
    inner: Arc<Inner>,
}

pub struct PollGuard {
    inner: Arc<Inner>,
    key: Key,
    id: u64,
    done: watch::Sender<bool>,
}

impl Drop for PollGuard {
    fn drop(&mut self) {
        let mut m = self.inner.map.lock().unwrap_or_else(|e| e.into_inner());
        if m.get(&self.key).is_some_and(|e| e.id == self.id) {
            m.remove(&self.key);
        }
        drop(m);
        let _ = self.done.send(true);
    }
}

impl Registry {
    pub fn new(
        handle: Handle,
        host: Arc<dyn PollHost>,
        runner: Arc<dyn ProcessRunner>,
        clock: Arc<dyn Clock>,
    ) -> Self {
        Registry {
            handle,
            host,
            runner,
            clock,
            inner: Arc::new(Inner {
                map: Mutex::new(HashMap::new()),
                next_id: AtomicU64::new(0),
                notice_seq: AtomicU64::new(0),
                event_seq: AtomicU64::new(0),
            }),
        }
    }

    pub fn handle(&self) -> &Handle {
        &self.handle
    }
    pub fn host(&self) -> &Arc<dyn PollHost> {
        &self.host
    }
    pub fn runner(&self) -> &Arc<dyn ProcessRunner> {
        &self.runner
    }
    pub fn clock(&self) -> &Arc<dyn Clock> {
        &self.clock
    }

    pub fn spawn<F>(&self, fut: F) -> JoinHandle<F::Output>
    where
        F: Future + Send + 'static,
        F::Output: Send + 'static,
    {
        self.handle.spawn(fut)
    }

    /// Registers a poll. A second registration for the same key replaces the first entry; the
    /// first guard's drop leaves the newer entry alone.
    pub fn register(&self, kind: PollKind, app_id: &str) -> (CancellationToken, PollGuard) {
        let token = CancellationToken::new();
        let (tx, rx) = watch::channel(false);
        let id = self.inner.next_id.fetch_add(1, Ordering::Relaxed);
        let key = (kind, app_id.to_string());
        self.inner
            .map
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(
                key.clone(),
                Entry {
                    token: token.clone(),
                    done: rx,
                    id,
                },
            );
        (
            token,
            PollGuard {
                inner: self.inner.clone(),
                key,
                id,
                done: tx,
            },
        )
    }

    /// Cancel one poll. False if it is not registered.
    pub fn cancel(&self, kind: PollKind, app_id: &str) -> bool {
        match self
            .inner
            .map
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(&(kind, app_id.to_string()))
        {
            Some(e) => {
                e.token.cancel();
                true
            }
            None => false,
        }
    }

    pub fn is_active(&self, kind: PollKind, app_id: &str) -> bool {
        self.inner
            .map
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .contains_key(&(kind, app_id.to_string()))
    }

    /// Cancel every poll, then wait up to `deadline` for their guards to drop. Returns how many
    /// were still running at the deadline.
    pub async fn cancel_all_and_wait(&self, deadline: Duration) -> usize {
        let pending: Vec<watch::Receiver<bool>> = {
            let m = self.inner.map.lock().unwrap_or_else(|e| e.into_inner());
            m.values()
                .map(|e| {
                    e.token.cancel();
                    e.done.clone()
                })
                .collect()
        };
        let waits = pending.into_iter().map(|mut rx| async move {
            // Err means the sender dropped, which is the guard's drop: also done.
            let _ = rx.wait_for(|v| *v).await;
        });
        let all = futures_join(waits);
        match tokio::time::timeout(deadline, all).await {
            Ok(()) => 0,
            Err(_) => {
                let m = self.inner.map.lock().unwrap_or_else(|e| e.into_inner());
                m.values().filter(|e| !*e.done.borrow()).count()
            }
        }
    }

    /// State-event sequence: monotonic per process, from 1 (the outbox replays in ascending order).
    pub fn next_event_seq(&self) -> u64 {
        self.inner.event_seq.fetch_add(1, Ordering::Relaxed) + 1
    }

    /// Request-notice sequence shared by install and uninstall polls: pre-increment from 0.
    pub fn next_notice_seq(&self) -> u64 {
        self.inner.notice_seq.fetch_add(1, Ordering::Relaxed) + 1
    }
}

async fn futures_join<I, F>(items: I)
where
    I: IntoIterator<Item = F>,
    F: Future<Output = ()>,
{
    for f in items {
        f.await;
    }
}
