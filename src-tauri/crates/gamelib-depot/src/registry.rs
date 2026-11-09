//! Process-wide cancel registry. A running job registers its id and gets a `JobGuard` holding a
//! `CancellationToken`; dropping the guard unregisters and signals done. Shutdown calls
//! `cancel_all_and_wait`.

use std::collections::HashMap;
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;

pub struct JobDone {
    done: Mutex<bool>,
    cv: Condvar,
}

impl JobDone {
    fn new() -> Self {
        JobDone {
            done: Mutex::new(false),
            cv: Condvar::new(),
        }
    }
    fn signal(&self) {
        *self.done.lock().unwrap_or_else(|e| e.into_inner()) = true;
        self.cv.notify_all();
    }
    /// True if done by `deadline`.
    fn wait_until(&self, deadline: Instant) -> bool {
        let mut g = self.done.lock().unwrap_or_else(|e| e.into_inner());
        while !*g {
            let now = Instant::now();
            if now >= deadline {
                return false;
            }
            g = self
                .cv
                .wait_timeout(g, deadline - now)
                .unwrap_or_else(|e| e.into_inner())
                .0;
        }
        true
    }
}

type Entry = (CancellationToken, Arc<JobDone>);

fn map() -> &'static Mutex<HashMap<String, Entry>> {
    static MAP: OnceLock<Mutex<HashMap<String, Entry>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

pub struct JobGuard {
    job_id: String,
    pub token: CancellationToken,
    done: Arc<JobDone>,
}

impl Drop for JobGuard {
    fn drop(&mut self) {
        let mut m = map().lock().unwrap_or_else(|e| e.into_inner());
        if m.get(&self.job_id)
            .is_some_and(|(_, d)| Arc::ptr_eq(d, &self.done))
        {
            m.remove(&self.job_id);
        }
        drop(m);
        self.done.signal();
    }
}

pub fn register(job_id: &str) -> JobGuard {
    let token = CancellationToken::new();
    let done = Arc::new(JobDone::new());
    map()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(job_id.to_string(), (token.clone(), done.clone()));
    JobGuard {
        job_id: job_id.to_string(),
        token,
        done,
    }
}

/// Cancel one job. False if it is not registered.
pub fn cancel(job_id: &str) -> bool {
    match map().lock().unwrap_or_else(|e| e.into_inner()).get(job_id) {
        Some((t, _)) => {
            t.cancel();
            true
        }
        None => false,
    }
}

/// Cancels every registered job and returns how many there were.
pub fn cancel_all() -> usize {
    let m = map().lock().unwrap_or_else(|e| e.into_inner());
    for (t, _) in m.values() {
        t.cancel();
    }
    m.len()
}

/// Cancel every job, then wait up to `timeout` for their guards to drop. Returns how many were
/// still running at the deadline.
pub fn cancel_all_and_wait(timeout: Duration) -> usize {
    let pending: Vec<Arc<JobDone>> = {
        let m = map().lock().unwrap_or_else(|e| e.into_inner());
        m.values()
            .map(|(t, d)| {
                t.cancel();
                d.clone()
            })
            .collect()
    };
    let deadline = Instant::now() + timeout;
    pending.iter().filter(|d| !d.wait_until(deadline)).count()
}

#[cfg(test)]
mod tests {
    use super::*;

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn cancel_all_cancels_every_registered_token() {
        let _l = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let a = register("reg-test-a");
        let b = register("reg-test-b");
        assert!(!a.token.is_cancelled());
        cancel_all();
        assert!(a.token.is_cancelled() && b.token.is_cancelled());
        assert!(cancel("reg-test-a"));
        assert!(!cancel("reg-test-missing"));
    }

    #[test]
    fn cancel_all_and_wait_returns_after_guards_drop() {
        let _l = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let g = register("reg-wait-a");
        let t = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(50));
            drop(g);
        });
        assert_eq!(cancel_all_and_wait(Duration::from_secs(5)), 0);
        t.join().unwrap();
        let g2 = register("reg-wait-b");
        assert_eq!(cancel_all_and_wait(Duration::from_millis(30)), 1);
        drop(g2);
    }
}
