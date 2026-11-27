//! The one single-flight table for launches (88.3-04, D-04): a second Play of the same game, from any entry
//! point, joins the first launch instead of starting another (WR-03). The Rust twin of `launchSingleFlight.ts`.
//!
//! The table is keyed `<runner>:<appName>`, as the TS key is (a colon joins them; D-20 candidate: `('a', 'b:c')`
//! and `('a:b', 'c')` share one flight, which the closed set of runner names makes unreachable today).
//!
//! - **One decision, one lock.** [`LaunchFlights::enter`] decides lead or join under one `Mutex` and never
//!   awaits while it holds it, so two calls cannot both lead. A caller must call it before its first await.
//! - **A leader's entry always leaves.** A [`FlightGuard`] gives the key back when the leader settles, when it
//!   ends without settling (an error path that drops it) and when it panics; and it only gives back an entry that
//!   is still its own (a serial number, the TS `get(key) === p` check), so a slow old leader cannot remove its
//!   successor's entry.
//! - **A joiner never waits forever.** A leader that ends without a result tells its joiners `abandoned`
//!   (Pitfall 8), and a joiner also ends when the shutdown token fires. A joiner that is dropped changes nothing
//!   for the leader.
//! - **Not only the funnel.** `enter` is public and keyed by a plain runner string, so the Steam launch dispatch
//!   can lead `steam:<appId>` through the same table. A leader outside Rust (the TS Steam dispatch until 90.2)
//!   does it through [`LaunchFlights::begin_owned`], [`LaunchFlights::wait`] and [`LaunchFlights::end`] (88.3-11):
//!   the guard lives in a side table under an opaque [`FlightId`] the crate minted, and
//!   [`LaunchFlights::release_owned_by_sidecar`] drops every one of them when the sidecar goes away, so their
//!   joiners answer `abandoned` and nothing waits forever (Pitfall 8).
//!
//! The table holds a value, not a status: what a leader settles is up to its caller.

use std::collections::hash_map::RandomState;
use std::collections::HashMap;
use std::hash::{BuildHasher, Hasher};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use serde_json::Value;
use tokio::sync::watch;

use gamelib_core::shutdown::Shutdown;

/// The word a joiner gets from a leader that ended without a result.
pub const ABANDONED: &str = "abandoned";
/// The word a joiner gets when the app is shutting down while it waits.
pub const SHUTDOWN: &str = "shutdown";

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

/// What a leader published.
#[derive(Debug, Clone)]
enum Outcome {
    Settled(Value),
    Abandoned,
}

struct Entry {
    serial: u64,
    result: watch::Receiver<Option<Outcome>>,
}

#[derive(Default)]
struct Inner {
    entries: Mutex<HashMap<String, Entry>>,
    serial: AtomicU64,
}

impl Inner {
    /// Gives `key` back, but only if the entry is still `serial`'s.
    fn release(&self, key: &str, serial: u64) {
        let mut entries = lock(&self.entries);
        if entries.get(key).is_some_and(|e| e.serial == serial) {
            entries.remove(key);
        }
    }
}

/// The launches in flight of one context. Cloning gives another handle on the same table.
#[derive(Clone, Default)]
pub struct LaunchFlights {
    inner: Arc<Inner>,
    /// The guards of flights a leader outside Rust holds, by flight id. Kept beside `Inner` (not in it): a guard
    /// holds an `Arc<Inner>`, so a guard inside `Inner` would be a reference cycle.
    owned: Arc<Mutex<HashMap<String, FlightGuard>>>,
    /// Feeds the flight ids.
    minted: Arc<AtomicU64>,
}

/// The opaque handle of a flight a leader outside Rust holds: 32 lowercase hex digits the crate minted, never
/// derived from the key. A caller can only end the flights it was handed the id of.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlightId(String);

impl FlightId {
    /// Whether `text` has the shape of a minted id. A wrong shape is refused at the edge; a right shape that was
    /// never minted (or was already ended) releases nothing.
    pub fn parse(text: &str) -> Option<FlightId> {
        let shaped =
            text.len() == 32 && text.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'));
        shaped.then(|| FlightId(text.to_string()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Two hashes under the process's random hasher keys, mixed with a counter, the clock and the pid. Opaque and
    /// unrepeated, which is all an id here needs to be (the peer is the sidecar the shell spawned).
    fn mint(counter: u64) -> FlightId {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos());
        let mut text = String::with_capacity(32);
        for round in 0..2u64 {
            let mut hasher = RandomState::new().build_hasher();
            hasher.write_u64(counter);
            hasher.write_u64(round);
            hasher.write_u128(nanos);
            hasher.write_u32(std::process::id());
            text.push_str(&format!("{:016x}", hasher.finish()));
        }
        FlightId(text)
    }
}

/// What [`LaunchFlights::begin_owned`] decided.
#[derive(Debug, PartialEq, Eq)]
pub enum Begin {
    /// Nothing was in flight for the key: the caller leads, and ends the flight with this id.
    Lead(FlightId),
    /// A launch is in flight: the caller waits for its result.
    Join,
}

/// What [`LaunchFlights::enter`] decided.
pub enum Enter {
    /// Nothing was in flight for the key: the caller runs the launch and settles (or drops) the guard.
    Lead(FlightGuard),
    /// A launch is in flight: the caller waits for its result.
    Join(FlightJoin),
}

impl LaunchFlights {
    pub fn new() -> LaunchFlights {
        LaunchFlights::default()
    }

    /// `<runner>:<appName>`, the key the table uses.
    pub fn key_of(runner: &str, app_name: &str) -> String {
        format!("{runner}:{app_name}")
    }

    /// Decides lead or join under one lock. Plain synchronous: it can be called before a caller's first await.
    pub fn enter(&self, runner: &str, app_name: &str) -> Enter {
        let key = LaunchFlights::key_of(runner, app_name);
        let mut entries = lock(&self.inner.entries);
        if let Some(existing) = entries.get(&key) {
            return Enter::Join(FlightJoin {
                result: existing.result.clone(),
            });
        }
        let serial = self.inner.serial.fetch_add(1, Ordering::SeqCst);
        let (sender, receiver) = watch::channel::<Option<Outcome>>(None);
        entries.insert(
            key.clone(),
            Entry {
                serial,
                result: receiver,
            },
        );
        Enter::Lead(FlightGuard {
            inner: Arc::clone(&self.inner),
            key,
            serial,
            sender: Some(sender),
        })
    }

    /// [`LaunchFlights::enter`] for a leader outside Rust (88.3-11, D-04): decides under the same one lock, and a
    /// leader's guard goes into the side table under a fresh [`FlightId`]. Plain synchronous.
    pub fn begin_owned(&self, runner: &str, app_name: &str) -> Begin {
        match self.enter(runner, app_name) {
            Enter::Join(_) => Begin::Join,
            Enter::Lead(guard) => {
                let id = FlightId::mint(self.minted.fetch_add(1, Ordering::SeqCst));
                lock(&self.owned).insert(id.as_str().to_string(), guard);
                Begin::Lead(id)
            }
        }
    }

    /// The joiner half for a key led by anyone (the funnel or a leader outside Rust): the leader's value,
    /// [`ABANDONED`] when it ended without one or when nothing is in flight (the leader had already ended, so its
    /// value is gone), or [`SHUTDOWN`].
    ///
    /// The lookup runs when this is called, not when the future is first polled: a caller that calls it and awaits
    /// later still joins the flight that was in flight at the call.
    pub fn wait<'a>(
        &self,
        runner: &str,
        app_name: &str,
        shutdown: &'a Shutdown,
    ) -> impl std::future::Future<Output = Result<Value, &'static str>> + 'a {
        let key = LaunchFlights::key_of(runner, app_name);
        let join = lock(&self.inner.entries)
            .get(&key)
            .map(|existing| FlightJoin {
                result: existing.result.clone(),
            });
        async move {
            match join {
                Some(join) => join.wait(shutdown).await,
                None => Err(ABANDONED),
            }
        }
    }

    /// Settles the flight `flight_id` leads and releases its key. `false` for an id this table does not hold (a
    /// forged one, one already ended, one released at sidecar EOF): nothing is settled or released then.
    pub fn end(&self, flight_id: &FlightId, result: Value) -> bool {
        let guard = lock(&self.owned).remove(flight_id.as_str());
        match guard {
            Some(guard) => {
                guard.settle(result);
                true
            }
            None => false,
        }
    }

    /// Drops every flight a leader outside Rust holds, so each key is free again and each joiner answers
    /// [`ABANDONED`]. Called when the sidecar goes away. Answers how many were released.
    pub fn release_owned_by_sidecar(&self) -> usize {
        let released: Vec<FlightGuard> =
            lock(&self.owned).drain().map(|(_, guard)| guard).collect();
        // Dropped outside the lock: a guard's drop takes the table's lock.
        let count = released.len();
        drop(released);
        count
    }

    /// How many launches are in flight.
    pub fn len(&self) -> usize {
        lock(&self.inner.entries).len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// A leader's hold on its key. Settling gives the key back and then tells the joiners; dropping it unsettled
/// (an error path, a panic, a dropped future) gives the key back and tells them `abandoned`.
pub struct FlightGuard {
    inner: Arc<Inner>,
    key: String,
    serial: u64,
    sender: Option<watch::Sender<Option<Outcome>>>,
}

impl FlightGuard {
    /// Publishes the leader's result. The entry leaves the table before anyone is told, so a call made after
    /// the result is a new launch.
    pub fn settle(mut self, value: Value) {
        self.finish(Outcome::Settled(value));
    }

    fn finish(&mut self, outcome: Outcome) {
        self.inner.release(&self.key, self.serial);
        if let Some(sender) = self.sender.take() {
            let _ = sender.send(Some(outcome));
        }
    }
}

impl Drop for FlightGuard {
    fn drop(&mut self) {
        if self.sender.is_some() {
            self.finish(Outcome::Abandoned);
        }
    }
}

/// A joiner's wait for the leader's result.
pub struct FlightJoin {
    result: watch::Receiver<Option<Outcome>>,
}

impl FlightJoin {
    /// The leader's value, [`ABANDONED`] when it ended without one, or [`SHUTDOWN`] when the app is going down.
    pub async fn wait(mut self, shutdown: &Shutdown) -> Result<Value, &'static str> {
        let token = shutdown.token();
        tokio::select! {
            biased;
            _ = token.cancelled() => Err(SHUTDOWN),
            done = self.result.wait_for(Option::is_some) => match done {
                Ok(outcome) => match outcome.as_ref() {
                    Some(Outcome::Settled(value)) => Ok(value.clone()),
                    _ => Err(ABANDONED),
                },
                // The sender went away without publishing: the same as a guard dropped unsettled.
                Err(_) => Err(ABANDONED),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn lead(flights: &LaunchFlights, runner: &str, app: &str) -> FlightGuard {
        match flights.enter(runner, app) {
            Enter::Lead(guard) => guard,
            Enter::Join(_) => panic!("expected to lead {runner}:{app}"),
        }
    }

    fn join(flights: &LaunchFlights, runner: &str, app: &str) -> FlightJoin {
        match flights.enter(runner, app) {
            Enter::Join(join) => join,
            Enter::Lead(_) => panic!("expected to join {runner}:{app}"),
        }
    }

    #[tokio::test]
    async fn a_second_enter_joins_and_receives_the_leaders_value() {
        let flights = LaunchFlights::new();
        let shutdown = Shutdown::new();
        let guard = lead(&flights, "legendary", "alpha");
        let joiner = join(&flights, "legendary", "alpha");
        guard.settle(json!({ "status": "done" }));
        assert_eq!(
            joiner.wait(&shutdown).await,
            Ok(json!({ "status": "done" }))
        );
        assert!(flights.is_empty());
    }

    #[tokio::test]
    async fn a_dropped_unsettled_guard_releases_the_key_and_tells_joiners_abandoned() {
        let flights = LaunchFlights::new();
        let shutdown = Shutdown::new();
        let guard = lead(&flights, "gog", "beta");
        let joiner = join(&flights, "gog", "beta");
        drop(guard);
        assert_eq!(joiner.wait(&shutdown).await, Err(ABANDONED));
        let _fresh = lead(&flights, "gog", "beta");
    }

    #[tokio::test]
    async fn a_late_release_never_removes_a_newer_entry() {
        let flights = LaunchFlights::new();
        let old = lead(&flights, "nile", "gamma");
        // The old leader's entry is taken out from under it (as a test of the serial check): a new leader
        // takes the key, then the old guard is dropped.
        lock(&flights.inner.entries).remove("nile:gamma");
        let newer = lead(&flights, "nile", "gamma");
        drop(old);
        assert_eq!(flights.len(), 1, "the newer leader's entry is still held");
        newer.settle(Value::Null);
        assert!(flights.is_empty());
    }

    #[tokio::test]
    async fn a_sidecar_flight_ends_with_its_id_only() {
        let flights = LaunchFlights::new();
        let shutdown = Shutdown::new();
        let Begin::Lead(id) = flights.begin_owned("steam", "480") else {
            panic!("expected to lead");
        };
        assert!(FlightId::parse(id.as_str()).is_some());
        assert_eq!(flights.begin_owned("steam", "480"), Begin::Join);
        let waiter = flights.wait("steam", "480", &shutdown);
        assert!(flights.end(&id, json!(true)));
        assert_eq!(waiter.await, Ok(json!(true)));
        assert!(!flights.end(&id, json!(false)), "ended once");
        assert!(flights.is_empty());
    }

    #[test]
    fn minted_ids_differ_and_have_the_shape_parse_accepts() {
        let flights = LaunchFlights::new();
        let mut seen = std::collections::HashSet::new();
        for n in 0..64 {
            let Begin::Lead(id) = flights.begin_owned("steam", &n.to_string()) else {
                panic!("a fresh key leads");
            };
            assert!(FlightId::parse(id.as_str()).is_some());
            assert!(seen.insert(id.as_str().to_string()));
        }
        for bad in ["", "abc", &"G".repeat(32), &"A".repeat(32), &"a".repeat(33)] {
            assert!(FlightId::parse(bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn the_key_is_the_runner_and_the_app_name_joined_by_a_colon() {
        assert_eq!(LaunchFlights::key_of("steam", "480"), "steam:480");
    }
}
