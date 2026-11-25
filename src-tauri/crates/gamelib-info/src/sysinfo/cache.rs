//! `createSystemInfoCache` (`utils/systeminfo/index.ts`, debug/gog-spawn-reduction fix 3): the value cache
//! and the in-flight read of one context. Concurrent `cache=true` callers share one fetch; a later
//! `cache=true` caller gets the value with no probe; `cache=false` always fetches (and refreshes the
//! value). There is no time limit on the value, as in the TS.

use std::future::Future;
use std::sync::{Arc, Mutex};

use tokio::sync::watch;

use super::{ProbeError, SystemInformation};

type Outcome = Result<Arc<SystemInformation>, ProbeError>;

struct InFlight {
    id: u64,
    result: watch::Receiver<Option<Outcome>>,
}

#[derive(Default)]
struct State {
    cached: Option<Arc<SystemInformation>>,
    in_flight: Option<InFlight>,
    next_id: u64,
}

/// One cache per [`crate::ctx::InfoCtx`]; two caches share nothing.
#[derive(Default)]
pub struct SystemInfoCache {
    state: Mutex<State>,
}

/// Clears the read's in-flight slot when the leader finishes or is dropped (the TS `finally`), but only
/// when the slot still holds this read.
struct ClearOnDrop<'a> {
    cache: &'a SystemInfoCache,
    id: u64,
}

impl Drop for ClearOnDrop<'_> {
    fn drop(&mut self) {
        let mut state = self.cache.lock();
        if state.in_flight.as_ref().is_some_and(|f| f.id == self.id) {
            state.in_flight = None;
        }
    }
}

impl SystemInfoCache {
    pub fn new() -> SystemInfoCache {
        SystemInfoCache::default()
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, State> {
        // A panic while the lock is held cannot leave the state half written (each step is one
        // assignment), so a poisoned lock is still usable.
        self.state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    /// What a call does under the lock: answer from the value, wait for the read in flight, or lead a read.
    fn decide(&self, cache: bool) -> Decision {
        let mut state = self.lock();
        if cache {
            if let Some(value) = &state.cached {
                return Decision::Cached(Arc::clone(value));
            }
            if let Some(flight) = &state.in_flight {
                return Decision::Wait(flight.result.clone());
            }
        }
        state.next_id += 1;
        let id = state.next_id;
        let (sender, receiver) = watch::channel(None);
        if cache {
            state.in_flight = Some(InFlight {
                id,
                result: receiver,
            });
        }
        Decision::Lead(sender, id)
    }

    /// `getSystemInfo(deps, cache)`: `fetch` runs only when this call has to read.
    pub async fn get(
        &self,
        cache: bool,
        fetch: impl Future<Output = Result<SystemInformation, ProbeError>>,
    ) -> Outcome {
        let (sender, id) = match self.decide(cache) {
            Decision::Cached(value) => return Ok(value),
            Decision::Wait(mut receiver) => {
                return match receiver.wait_for(Option::is_some).await {
                    Ok(done) => done.clone().unwrap_or(Err(ProbeError::Cancelled)),
                    Err(_) => Err(ProbeError::Cancelled),
                };
            }
            Decision::Lead(sender, id) => (sender, id),
        };
        let _clear = ClearOnDrop { cache: self, id };
        let outcome: Outcome = fetch.await.map(Arc::new);
        if let Ok(value) = &outcome {
            self.lock().cached = Some(Arc::clone(value));
        }
        // The waiters read it; a receiver that is gone is not an error.
        let _ = sender.send(Some(outcome.clone()));
        outcome
    }
}

enum Decision {
    Cached(Arc<SystemInformation>),
    Wait(watch::Receiver<Option<Outcome>>),
    Lead(watch::Sender<Option<Outcome>>, u64),
}
