//! Run-wide network in-flight budget. Port of `depot/inflightLimiter.ts`.
//!
//! Brackets ONLY the network fetch. CPU-bound decode must not hold a slot (the TS NOTE on
//! `run`, humankind-depot-full-stall 2026-08-17: wrapping decode silently capped network
//! concurrency at the decode pool size); decode gets its own semaphore in plan 09.
//! `tokio::sync::Semaphore` queues waiters FIFO, and an owned permit frees its slot on drop,
//! including when the holding task is cancelled.

use std::future::Future;
use std::sync::Arc;
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

// TS origin: depot/depot.ts TARGET_INFLIGHT_CHUNKS
/// Default run-wide chunk fetch budget.
pub const TARGET_INFLIGHT_CHUNKS: u32 = 32;

#[derive(Debug, Clone)]
pub struct InflightLimiter {
    sem: Arc<Semaphore>,
}

/// A held slot; released on drop.
#[derive(Debug)]
pub struct InflightPermit {
    _permit: OwnedSemaphorePermit,
}

impl InflightLimiter {
    /// Rejects `max == 0`, which would deadlock every caller.
    pub fn new(max: u32) -> Result<Self, String> {
        if max == 0 {
            return Err(format!(
                "InflightLimiter: max must be > 0 (got {max}) -- a non-positive budget would deadlock every caller."
            ));
        }
        Ok(Self {
            sem: Arc::new(Semaphore::new(max as usize)),
        })
    }

    pub async fn acquire(&self) -> InflightPermit {
        // The semaphore is never closed, so acquire cannot fail.
        let permit = Arc::clone(&self.sem)
            .acquire_owned()
            .await
            .expect("inflight semaphore is never closed");
        InflightPermit { _permit: permit }
    }

    /// Runs `fut` holding a slot; the slot frees however `fut` ends.
    pub async fn run<F: Future>(&self, fut: F) -> F::Output {
        let _slot = self.acquire().await;
        fut.await
    }

    pub fn available(&self) -> usize {
        self.sem.available_permits()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Duration;
    use tokio::sync::Mutex;

    #[tokio::test]
    async fn runs_at_most_max_tasks_concurrently() {
        let lim = InflightLimiter::new(3).unwrap();
        let active = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));
        let mut hs = Vec::new();
        for _ in 0..10 {
            let (lim, active, peak) = (lim.clone(), active.clone(), peak.clone());
            hs.push(tokio::spawn(async move {
                lim.run(async {
                    let n = active.fetch_add(1, Ordering::SeqCst) + 1;
                    peak.fetch_max(n, Ordering::SeqCst);
                    tokio::time::sleep(Duration::from_millis(10)).await;
                    active.fetch_sub(1, Ordering::SeqCst);
                })
                .await
            }));
        }
        for h in hs {
            h.await.unwrap();
        }
        assert_eq!(peak.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn queued_tasks_start_in_fifo_order() {
        let lim = InflightLimiter::new(1).unwrap();
        let order = Arc::new(Mutex::new(Vec::new()));
        let gate = lim.acquire().await;
        let mut hs = Vec::new();
        for i in 0..5 {
            let (lim, order) = (lim.clone(), order.clone());
            hs.push(tokio::spawn(async move {
                lim.run(async { order.lock().await.push(i) }).await
            }));
            // Let each waiter enqueue before the next is spawned.
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        drop(gate);
        for h in hs {
            h.await.unwrap();
        }
        assert_eq!(*order.lock().await, vec![0, 1, 2, 3, 4]);
    }

    #[tokio::test]
    async fn a_panicking_task_still_releases_its_slot() {
        let lim = InflightLimiter::new(1).unwrap();
        let l2 = lim.clone();
        let r = tokio::spawn(async move { l2.run(async { panic!("boom") }).await }).await;
        assert!(r.is_err());
        assert_eq!(lim.available(), 1);
        assert_eq!(lim.run(async { 7 }).await, 7);
    }

    #[tokio::test]
    async fn a_queued_task_still_starts_after_an_earlier_task_fails() {
        let lim = InflightLimiter::new(1).unwrap();
        let l2 = lim.clone();
        let first = tokio::spawn(async move {
            l2.run(async {
                tokio::time::sleep(Duration::from_millis(20)).await;
                Err::<(), &str>("fail")
            })
            .await
        });
        tokio::time::sleep(Duration::from_millis(5)).await;
        let second = lim.run(async { "ran" }).await;
        assert_eq!(first.await.unwrap(), Err("fail"));
        assert_eq!(second, "ran");
    }

    #[tokio::test]
    async fn a_resolved_task_returns_its_value_unchanged() {
        let lim = InflightLimiter::new(2).unwrap();
        assert_eq!(lim.run(async { 42 }).await, 42);
    }

    #[test]
    fn rejects_a_non_positive_max_at_construction() {
        assert!(InflightLimiter::new(0).is_err());
    }

    #[test]
    fn a_valid_positive_max_does_not_error() {
        assert!(InflightLimiter::new(1).is_ok());
        assert!(InflightLimiter::new(TARGET_INFLIGHT_CHUNKS).is_ok());
    }

    #[tokio::test]
    async fn slot_is_released_when_the_holding_task_is_cancelled() {
        let lim = InflightLimiter::new(1).unwrap();
        let l2 = lim.clone();
        let h = tokio::spawn(async move {
            l2.run(std::future::pending::<()>()).await;
        });
        tokio::time::sleep(Duration::from_millis(10)).await;
        assert_eq!(lim.available(), 0);
        h.abort();
        let _ = h.await;
        assert_eq!(lim.available(), 1);
    }
}
