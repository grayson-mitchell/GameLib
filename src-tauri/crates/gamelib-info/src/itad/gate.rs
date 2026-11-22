//! The ITAD rate-limit gate (`createItadGate` in `itadCache.ts`): a 429 blocks every later request
//! until a timestamp passes, and concurrent identical requests share one flight.
//!
//! No timers (the exit contract): the block expires by comparing against the clock, and the only
//! other state is the in-flight table, which a finishing flight empties.

use std::collections::HashMap;
use std::future::Future;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use serde_json::Value;
use tokio::sync::OnceCell;

/// One shared flight: the first caller runs the work, every other caller waits for its answer.
type Flight = OnceCell<Result<Value, String>>;

#[derive(Default)]
pub struct ItadGate {
    /// Epoch milliseconds the gate stays closed until; 0 is open.
    until: AtomicU64,
    inflight: Mutex<HashMap<String, Arc<Flight>>>,
}

fn locked<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// Removes its flight from the table when the leader ends, finishes or is dropped mid-await (a
/// shutdown), so a later caller starts a fresh flight instead of waiting on a dead one.
struct Leave<'a> {
    gate: &'a ItadGate,
    key: &'a str,
    flight: &'a Arc<Flight>,
}

impl Drop for Leave<'_> {
    fn drop(&mut self) {
        let mut table = locked(&self.gate.inflight);
        // Only remove our own entry: a newer flight under the same key must stay.
        if table
            .get(self.key)
            .is_some_and(|current| Arc::ptr_eq(current, self.flight))
        {
            table.remove(self.key);
        }
    }
}

impl ItadGate {
    pub fn new() -> ItadGate {
        ItadGate::default()
    }

    /// `now < until`.
    pub fn is_blocked(&self, now: u64) -> bool {
        now < self.until.load(Ordering::SeqCst)
    }

    /// The instant the gate reopens; 0 when it never closed.
    pub fn blocked_until(&self) -> u64 {
        self.until.load(Ordering::SeqCst)
    }

    /// Closes the gate for `duration_ms` from `now`; an existing, later block stays.
    pub fn block(&self, duration_ms: u64, now: u64) {
        self.until
            .fetch_max(now.saturating_add(duration_ms), Ordering::SeqCst);
    }

    /// Runs `run` once for every caller that arrives while an identical (`key`) flight is open: the
    /// first caller's future does the work and every caller gets a copy of its answer, `Err` too.
    /// The flight leaves the table when it ends, so a caller after it starts a new one.
    pub async fn single_flight<F>(&self, key: &str, run: F) -> Result<Value, String>
    where
        F: Future<Output = Result<Value, String>>,
    {
        let flight = {
            let mut table = locked(&self.inflight);
            Arc::clone(table.entry(key.to_string()).or_default())
        };
        let _leave = Leave {
            gate: self,
            key,
            flight: &flight,
        };
        flight.get_or_init(|| run).await.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;
    use std::time::Duration;

    #[test]
    fn the_gate_is_open_until_blocked_and_the_later_block_wins() {
        let gate = ItadGate::new();
        assert!(!gate.is_blocked(0));
        assert_eq!(gate.blocked_until(), 0);
        gate.block(60_000, 1_000);
        assert_eq!(gate.blocked_until(), 61_000);
        assert!(gate.is_blocked(60_999));
        assert!(!gate.is_blocked(61_000));
        // An earlier block never shortens a later one.
        gate.block(1_000, 2_000);
        assert_eq!(gate.blocked_until(), 61_000);
        gate.block(120_000, 1_000);
        assert_eq!(gate.blocked_until(), 121_000);
    }

    #[tokio::test]
    async fn concurrent_identical_flights_share_one_run() {
        let gate = ItadGate::new();
        let runs = AtomicUsize::new(0);
        let work = || async {
            runs.fetch_add(1, Ordering::SeqCst);
            tokio::time::sleep(Duration::from_millis(40)).await;
            Ok(serde_json::json!({ "n": 1 }))
        };
        let (a, b, c) = tokio::join!(
            gate.single_flight("k", work()),
            gate.single_flight("k", work()),
            gate.single_flight("k", work()),
        );
        assert_eq!(runs.load(Ordering::SeqCst), 1);
        assert_eq!(a, Ok(serde_json::json!({ "n": 1 })));
        assert_eq!(a, b);
        assert_eq!(b, c);
        assert!(locked(&gate.inflight).is_empty());
    }

    #[tokio::test]
    async fn a_failure_is_shared_and_a_later_call_starts_afresh() {
        let gate = ItadGate::new();
        let runs = AtomicUsize::new(0);
        let failing = || async {
            runs.fetch_add(1, Ordering::SeqCst);
            tokio::time::sleep(Duration::from_millis(20)).await;
            Err::<Value, String>("boom".to_string())
        };
        let (a, b) = tokio::join!(
            gate.single_flight("k", failing()),
            gate.single_flight("k", failing()),
        );
        assert_eq!(a, Err("boom".to_string()));
        assert_eq!(b, Err("boom".to_string()));
        assert_eq!(runs.load(Ordering::SeqCst), 1);
        // The flight ended, so the next call runs again.
        let again = gate.single_flight("k", failing()).await;
        assert_eq!(again, Err("boom".to_string()));
        assert_eq!(runs.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn different_keys_do_not_share_a_flight() {
        let gate = ItadGate::new();
        let runs = AtomicUsize::new(0);
        let work = || async {
            runs.fetch_add(1, Ordering::SeqCst);
            tokio::time::sleep(Duration::from_millis(10)).await;
            Ok(Value::Null)
        };
        let _ = tokio::join!(
            gate.single_flight("a", work()),
            gate.single_flight("b", work())
        );
        assert_eq!(runs.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn a_dropped_leader_leaves_no_dead_flight() {
        let gate = ItadGate::new();
        {
            let stuck = gate.single_flight("k", std::future::pending());
            let timed = tokio::time::timeout(Duration::from_millis(10), stuck).await;
            assert!(timed.is_err());
        }
        assert!(locked(&gate.inflight).is_empty());
        let fresh = gate
            .single_flight("k", async { Ok(Value::Bool(true)) })
            .await;
        assert_eq!(fresh, Ok(Value::Bool(true)));
    }
}
