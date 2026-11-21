//! One app-wide exit budget and the stage orchestrator that spends it (Phase 83, D-12, D-16).
//!
//! No tokio runtime here: the exit path runs on the main thread after the event loop ends, so
//! everything is `std` threads, a `Mutex` + `Condvar` and a `tokio_util` cancellation token (the
//! token is a plain atomic-backed type; it needs no runtime to cancel).

use std::sync::{Arc, Condvar, Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;

/// The single deadline GameLib's exit path lives inside (D-12), and the slice of it kept for
/// killing child processes (D-16).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ExitBudget {
    pub total: Duration,
    pub child_grace: Duration,
}

impl ExitBudget {
    pub const DEFAULT: ExitBudget = ExitBudget {
        total: Duration::from_secs(5),
        child_grace: Duration::from_millis(1_500),
    };

    /// What the drains get: the total minus the child grace, never negative.
    pub fn drain_budget(&self) -> Duration {
        self.total.saturating_sub(self.child_grace)
    }
}

/// A named holder of exit-time work. Dropping it releases the name.
pub struct Registrant {
    inner: Arc<Inner>,
    name: &'static str,
}

struct Inner {
    token: CancellationToken,
    registry: (Mutex<Vec<&'static str>>, Condvar),
}

impl Inner {
    /// Poison-tolerant: a panic in some holder must never stop the exit path (T-83-04).
    fn lock(&self) -> MutexGuard<'_, Vec<&'static str>> {
        self.registry.0.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// The app-wide shutdown signal plus the registry of work that must finish before exit.
#[derive(Clone)]
pub struct Shutdown {
    inner: Arc<Inner>,
}

impl Default for Shutdown {
    fn default() -> Self {
        Shutdown::new()
    }
}

impl Shutdown {
    pub fn new() -> Shutdown {
        Shutdown {
            inner: Arc::new(Inner {
                token: CancellationToken::new(),
                registry: (Mutex::new(Vec::new()), Condvar::new()),
            }),
        }
    }

    pub fn token(&self) -> CancellationToken {
        self.inner.token.clone()
    }

    pub fn register(&self, name: &'static str) -> Registrant {
        self.inner.lock().push(name);
        Registrant {
            inner: self.inner.clone(),
            name,
        }
    }

    /// Cancel the token, then wait up to `budget` for every registrant to drop. Returns the names
    /// still held at the deadline, sorted.
    pub fn drain(&self, budget: Duration) -> Vec<&'static str> {
        self.inner.token.cancel();
        let start = Instant::now();
        let mut held = self.inner.lock();
        loop {
            if held.is_empty() {
                return Vec::new();
            }
            // The wait ends when now >= deadline (exclusive end): `left` is zero from then on.
            let left = budget.saturating_sub(start.elapsed());
            if left.is_zero() {
                break;
            }
            held = self
                .inner
                .registry
                .1
                .wait_timeout(held, left)
                .unwrap_or_else(|e| e.into_inner())
                .0;
        }
        let mut names = held.clone();
        names.sort_unstable();
        names
    }
}

impl Drop for Registrant {
    fn drop(&mut self) {
        let mut held = self.inner.lock();
        if let Some(i) = held.iter().position(|n| *n == self.name) {
            held.swap_remove(i);
        }
        drop(held);
        self.inner.registry.1.notify_all();
    }
}

/// The process-wide instance every later Rust task registers with.
pub fn global() -> &'static Shutdown {
    static GLOBAL: OnceLock<Shutdown> = OnceLock::new();
    GLOBAL.get_or_init(Shutdown::new)
}

/// What `run_exit` measured, for the caller to log (counts and names only, D-12).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExitReport {
    pub elapsed: Duration,
    pub still_running: Vec<&'static str>,
}

/// What the finish stage is told: the drains that overran, the time spent so far and the time left
/// in the one exit budget (D-21). The finish stage logs its lines from this and then flushes the
/// log writer for at most `remaining`, so the writer is the last thing to run and never waits on a
/// budget of its own.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FinishContext {
    pub still_running: Vec<&'static str>,
    pub elapsed: Duration,
    pub remaining: Duration,
}

/// One exit-time drain: its registrant name and the work it runs with the drain budget.
pub type Drain = (&'static str, Box<dyn FnOnce(Duration) + Send>);

/// Spend one exit budget in stages: every drain concurrently (each holding a `Registrant`), then
/// the child kills with the time left (at most `child_grace`), then `finish`, handed a
/// `FinishContext` (what overran, time spent, time left of the one budget).
///
/// Drains run on detached `std` threads, never a scoped join: a join would wait for an
/// overrunning drain and break the deadline (T-83-03). An abandoned drain is named in
/// `still_running`; the caller logs the report (counts and names only, D-12).
pub fn run_exit(
    shutdown: &Shutdown,
    budget: ExitBudget,
    drains: Vec<Drain>,
    children: impl FnOnce(Duration),
    finish: impl FnOnce(&FinishContext),
) -> ExitReport {
    let start = Instant::now();
    let drain_budget = budget.drain_budget();
    for (name, work) in drains {
        let registrant = shutdown.register(name);
        // A failed spawn drops the closure and with it the registrant, so the name is released.
        let _ = std::thread::Builder::new()
            .name(format!("exit-drain-{name}"))
            .spawn(move || {
                work(drain_budget);
                drop(registrant);
            });
    }
    let still_running = shutdown.drain(drain_budget);
    let remaining = budget
        .total
        .saturating_sub(start.elapsed())
        .min(budget.child_grace);
    children(remaining);
    let elapsed = start.elapsed();
    finish(&FinishContext {
        still_running: still_running.clone(),
        elapsed,
        remaining: budget.total.saturating_sub(elapsed),
    });
    ExitReport {
        elapsed: start.elapsed(),
        still_running,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::mpsc;
    use std::thread;
    use std::time::Instant;

    fn ms(n: u64) -> Duration {
        Duration::from_millis(n)
    }

    #[test]
    fn drain_with_no_registrant_returns_empty_at_once_and_cancels() {
        let s = Shutdown::new();
        let t0 = Instant::now();
        assert!(s.drain(Duration::from_secs(2)).is_empty());
        assert!(t0.elapsed() < ms(50));
        assert!(s.token().is_cancelled());
    }

    #[test]
    fn drain_returns_early_when_the_last_registrant_drops_on_another_thread() {
        let s = Shutdown::new();
        let r = s.register("steamcm");
        let t = thread::spawn(move || {
            thread::sleep(ms(100));
            drop(r);
        });
        let t0 = Instant::now();
        let left = s.drain(Duration::from_secs(2));
        t.join().unwrap();
        assert!(left.is_empty(), "{left:?}");
        assert!(t0.elapsed() < Duration::from_secs(1));
    }

    #[test]
    fn a_registrant_held_past_the_deadline_is_named() {
        let s = Shutdown::new();
        let _r = s.register("steamcm");
        let t0 = Instant::now();
        let left = s.drain(ms(200));
        let took = t0.elapsed();
        assert_eq!(left, vec!["steamcm"]);
        assert!(took >= ms(200), "{took:?}");
        assert!(took < ms(450), "{took:?}");
    }

    #[test]
    fn a_registrant_released_after_the_deadline_is_still_reported() {
        // Deadline semantics: the wait ends when now >= deadline (exclusive end).
        let s = Shutdown::new();
        let r = s.register("late");
        let t = thread::spawn(move || {
            thread::sleep(ms(400));
            drop(r);
        });
        let left = s.drain(ms(100));
        t.join().unwrap();
        assert_eq!(left, vec!["late"]);
    }

    #[test]
    fn duplicate_names_are_kept_and_names_come_back_sorted() {
        let s = Shutdown::new();
        let _a = s.register("x");
        let _b = s.register("x");
        assert_eq!(s.drain(ms(20)), vec!["x", "x"]);
        let s = Shutdown::new();
        let _c = s.register("zeta");
        let _d = s.register("alpha");
        assert_eq!(s.drain(ms(20)), vec!["alpha", "zeta"]);
    }

    #[test]
    fn the_default_budget_is_five_seconds_with_one_and_a_half_for_children() {
        assert_eq!(ExitBudget::DEFAULT.total, Duration::from_secs(5));
        assert_eq!(ExitBudget::DEFAULT.child_grace, ms(1_500));
        assert_eq!(ExitBudget::DEFAULT.drain_budget(), ms(3_500));
    }

    #[test]
    fn a_child_grace_over_the_total_leaves_no_drain_budget() {
        let b = ExitBudget {
            total: ms(100),
            child_grace: ms(500),
        };
        assert_eq!(b.drain_budget(), Duration::ZERO);
    }

    #[test]
    fn global_is_one_app_wide_instance() {
        let a = global();
        let b = global();
        assert!(std::ptr::eq(a, b));
    }

    #[test]
    fn run_exit_runs_children_once_then_finish_once_when_drains_are_quick() {
        let s = Shutdown::new();
        let order = Arc::new(Mutex::new(Vec::<&'static str>::new()));
        let drained = Arc::new(AtomicUsize::new(0));
        let mut drains: Vec<Drain> = Vec::new();
        for name in ["a", "b", "c"] {
            let d = drained.clone();
            drains.push((
                name,
                Box::new(move |_| {
                    d.fetch_add(1, Ordering::SeqCst);
                }),
            ));
        }
        let granted = Arc::new(Mutex::new(Vec::<Duration>::new()));
        let (o1, o2, g) = (order.clone(), order.clone(), granted.clone());
        let report = run_exit(
            &s,
            ExitBudget::DEFAULT,
            drains,
            move |left| {
                o1.lock().unwrap().push("children");
                g.lock().unwrap().push(left);
            },
            move |_| o2.lock().unwrap().push("finish"),
        );
        assert_eq!(drained.load(Ordering::SeqCst), 3);
        assert!(report.still_running.is_empty());
        assert_eq!(*order.lock().unwrap(), vec!["children", "finish"]);
        let granted = granted.lock().unwrap();
        assert_eq!(granted.len(), 1);
        assert!(granted[0] <= ExitBudget::DEFAULT.child_grace);
    }

    #[test]
    fn run_exit_abandons_a_drain_that_never_returns_by_the_total_deadline() {
        let s = Shutdown::new();
        let budget = ExitBudget {
            total: ms(600),
            child_grace: ms(200),
        };
        let (release, hold) = mpsc::channel::<()>();
        let drains: Vec<Drain> = vec![(
            "stuck",
            Box::new(move |_| {
                let _ = hold.recv();
            }),
        )];
        let granted = Arc::new(Mutex::new(Vec::<Duration>::new()));
        let finished = Arc::new(AtomicUsize::new(0));
        let (g, f) = (granted.clone(), finished.clone());
        let t0 = Instant::now();
        let report = run_exit(
            &s,
            budget,
            drains,
            move |left| g.lock().unwrap().push(left),
            move |_| {
                f.fetch_add(1, Ordering::SeqCst);
            },
        );
        let took = t0.elapsed();
        assert!(took < budget.total + ms(300), "{took:?}");
        assert_eq!(report.still_running, vec!["stuck"]);
        assert_eq!(finished.load(Ordering::SeqCst), 1);
        let granted = granted.lock().unwrap();
        assert_eq!(granted.len(), 1);
        assert!(granted[0] <= budget.child_grace, "{:?}", granted[0]);
        let _ = release.send(());
    }

    #[test]
    fn finish_is_told_nothing_overran_and_how_much_of_the_budget_is_left_when_drains_are_quick() {
        let s = Shutdown::new();
        let seen = Arc::new(Mutex::new(Vec::<FinishContext>::new()));
        let sink = seen.clone();
        let report = run_exit(
            &s,
            ExitBudget::DEFAULT,
            vec![("quick", Box::new(|_| {}))],
            |_| {},
            move |ctx| sink.lock().unwrap().push(ctx.clone()),
        );
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 1);
        let ctx = &seen[0];
        assert!(ctx.still_running.is_empty());
        assert!(ctx.elapsed < ExitBudget::DEFAULT.total);
        assert_eq!(
            ctx.remaining,
            ExitBudget::DEFAULT.total.saturating_sub(ctx.elapsed)
        );
        // The report is measured after finish, so it is never shorter than what finish was told.
        assert!(report.elapsed >= ctx.elapsed);
    }

    #[test]
    fn finish_is_told_the_overrunning_drain_and_almost_no_time_left() {
        let s = Shutdown::new();
        let budget = ExitBudget {
            total: ms(400),
            child_grace: ms(100),
        };
        let (release, hold) = mpsc::channel::<()>();
        let drains: Vec<Drain> = vec![(
            "stuck",
            Box::new(move |_| {
                let _ = hold.recv();
            }),
        )];
        let runs = Arc::new(AtomicUsize::new(0));
        let seen = Arc::new(Mutex::new(Vec::<FinishContext>::new()));
        let (r, sink) = (runs.clone(), seen.clone());
        run_exit(
            &s,
            budget,
            drains,
            |_| {},
            move |ctx| {
                r.fetch_add(1, Ordering::SeqCst);
                sink.lock().unwrap().push(ctx.clone());
            },
        );
        assert_eq!(runs.load(Ordering::SeqCst), 1);
        let seen = seen.lock().unwrap();
        assert_eq!(seen[0].still_running, vec!["stuck"]);
        assert!(seen[0].remaining <= ms(100), "{:?}", seen[0].remaining);
        assert_eq!(
            seen[0].remaining,
            budget.total.saturating_sub(seen[0].elapsed)
        );
        let _ = release.send(());
    }

    #[test]
    fn a_poisoned_registry_does_not_panic_drain_or_registrant_drop() {
        let s = Shutdown::new();
        let s2 = s.clone();
        let _ = thread::spawn(move || {
            let _g = s2.inner.registry.0.lock().unwrap();
            panic!("poison the registry");
        })
        .join();
        let r = s.register("after-poison");
        drop(r);
        assert!(s.drain(ms(20)).is_empty());
    }
}
