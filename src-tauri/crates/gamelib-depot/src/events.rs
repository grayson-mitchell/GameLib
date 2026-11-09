//! Job event emission (D-06). `ProgressEmitter` is the only code that calls `JobHost::emit`.
//!
//! - `seq` numbers frames in emission order (assigned under the same lock that emits, so the
//!   numbering and the delivery order cannot disagree);
//! - progress is throttled like the TS `emitProgress`: at most one frame per
//!   `PROGRESS_THROTTLE_MS` unless the percent moved by `PROGRESS_THROTTLE_PERCENT`; there is
//!   never one frame per chunk;
//! - a heartbeat re-sends the latest snapshot every `PROGRESS_HEARTBEAT_MS` with a fresh
//!   `elapsedMs`, so a stalled run still proves the pipe is alive;
//! - identical warnings coalesce into one frame carrying a count, at most once per second, and a
//!   job emits at most `MAX_WARNING_EVENTS` warning frames (event-flood bound, T-73-32);
//! - after `close` nothing more is emitted, so no frame can follow the job's `Outcome`.
//!
//! Times use `tokio::time::Instant` so tests drive them with a paused clock.

use crate::job::{JobEvent, JobEventBody, PlannedDepot};
use crate::JobHost;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::time::Instant;

// TS origin: depot/download.ts PROGRESS_THROTTLE_MS
pub const PROGRESS_THROTTLE_MS: u64 = 500;
// TS origin: depot/download.ts PROGRESS_THROTTLE_PERCENT
pub const PROGRESS_THROTTLE_PERCENT: f64 = 1.0;
// TS origin: depot/download.ts PROGRESS_HEARTBEAT_MS
pub const PROGRESS_HEARTBEAT_MS: u64 = 1_000;
/// Identical warnings are sent at most this often; repeats in between add to the count.
pub const WARNING_COALESCE_MS: u64 = 1_000;
/// Hard cap on warning frames per job; one "suppressed" frame follows the last allowed one.
pub const MAX_WARNING_EVENTS: u32 = 50;

/// Everything a `progress` frame carries except `elapsedMs`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Snapshot {
    pub done_bytes: u64,
    pub net_bytes: u64,
    pub total_bytes: u64,
    pub files_done: u64,
    pub files_total: u64,
    pub host: Option<String>,
}

struct WarnState {
    pending: u32,
    last_sent: Option<Instant>,
}

struct State {
    seq: u64,
    latest: Option<Snapshot>,
    last_emit: Instant,
    last_emit_bytes: u64,
    warnings: HashMap<String, WarnState>,
    warn_events: u32,
    closed: bool,
}

struct Inner {
    host: Arc<dyn JobHost>,
    job_id: String,
    start: Instant,
    state: Mutex<State>,
}

#[derive(Clone)]
pub struct ProgressEmitter {
    inner: Arc<Inner>,
}

impl Inner {
    fn lock(&self) -> std::sync::MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn send(&self, st: &mut State, body: JobEventBody) {
        let seq = st.seq;
        st.seq += 1;
        self.host.emit(JobEvent {
            job_id: self.job_id.clone(),
            seq,
            body,
        });
    }

    fn elapsed_ms(&self) -> u64 {
        self.start.elapsed().as_millis() as u64
    }

    fn send_progress(&self, st: &mut State, snap: &Snapshot) {
        st.last_emit = Instant::now();
        st.last_emit_bytes = snap.done_bytes;
        let body = JobEventBody::Progress {
            done_bytes: snap.done_bytes,
            net_bytes: snap.net_bytes,
            total_bytes: snap.total_bytes,
            files_done: snap.files_done,
            files_total: snap.files_total,
            host: snap.host.clone(),
            elapsed_ms: self.elapsed_ms(),
        };
        self.send(st, body);
    }

    /// Sends coalesced warnings that are due (or all of them when `all`).
    fn flush_warnings(&self, st: &mut State, all: bool) {
        let now = Instant::now();
        let due: Vec<String> = st
            .warnings
            .iter()
            .filter(|(_, w)| {
                w.pending > 0
                    && (all
                        || w.last_sent.is_none_or(|t| {
                            now.duration_since(t) >= Duration::from_millis(WARNING_COALESCE_MS)
                        }))
            })
            .map(|(m, _)| m.clone())
            .collect();
        for message in due {
            self.send_warning(st, message, 0);
        }
    }

    /// Sends `message` with `pending + extra` as its count, honouring the frame cap.
    fn send_warning(&self, st: &mut State, message: String, extra: u32) {
        let count = {
            let w = st.warnings.entry(message.clone()).or_insert(WarnState {
                pending: 0,
                last_sent: None,
            });
            let c = w.pending + extra;
            w.pending = 0;
            w.last_sent = Some(Instant::now());
            c
        };
        if st.warn_events >= MAX_WARNING_EVENTS {
            return;
        }
        st.warn_events += 1;
        self.send(st, JobEventBody::Warning { message, count });
        if st.warn_events == MAX_WARNING_EVENTS {
            st.warn_events += 1;
            self.send(
                st,
                JobEventBody::Warning {
                    message: "further warnings suppressed".to_string(),
                    count: 1,
                },
            );
        }
    }
}

impl ProgressEmitter {
    pub fn new(host: Arc<dyn JobHost>, job_id: &str) -> Self {
        let now = Instant::now();
        Self {
            inner: Arc::new(Inner {
                host,
                job_id: job_id.to_string(),
                start: now,
                state: Mutex::new(State {
                    seq: 0,
                    latest: None,
                    last_emit: now,
                    last_emit_bytes: 0,
                    warnings: HashMap::new(),
                    warn_events: 0,
                    closed: false,
                }),
            }),
        }
    }

    /// The first frame of a job. Also seeds the heartbeat snapshot.
    pub fn planned(&self, total_bytes: u64, total_files: u64, depots: Vec<PlannedDepot>) {
        let mut st = self.inner.lock();
        if st.closed {
            return;
        }
        st.latest = Some(Snapshot {
            total_bytes,
            files_total: total_files,
            ..Snapshot::default()
        });
        st.last_emit = Instant::now();
        self.inner.send(
            &mut st,
            JobEventBody::Planned {
                total_bytes,
                total_files,
                depots,
            },
        );
    }

    /// Records `snap` as the latest state and emits it when the throttle allows.
    pub fn progress(&self, snap: Snapshot) {
        let mut st = self.inner.lock();
        if st.closed {
            return;
        }
        let percent = if snap.total_bytes > 0 {
            snap.done_bytes.saturating_sub(st.last_emit_bytes) as f64 / snap.total_bytes as f64
                * 100.0
        } else {
            0.0
        };
        let waited = Instant::now().duration_since(st.last_emit);
        let due = percent >= PROGRESS_THROTTLE_PERCENT
            || waited >= Duration::from_millis(PROGRESS_THROTTLE_MS);
        if due {
            self.inner.send_progress(&mut st, &snap);
        }
        st.latest = Some(snap);
    }

    /// Emits `snap` regardless of the throttle (the end-of-run frame).
    pub fn force(&self, snap: Snapshot) {
        let mut st = self.inner.lock();
        if st.closed {
            return;
        }
        self.inner.send_progress(&mut st, &snap);
        st.latest = Some(snap);
    }

    /// Re-sends the latest snapshot with a fresh `elapsedMs` and flushes due warnings.
    pub fn heartbeat(&self) {
        let mut st = self.inner.lock();
        if st.closed {
            return;
        }
        if let Some(snap) = st.latest.clone() {
            self.inner.send_progress(&mut st, &snap);
        }
        self.inner.flush_warnings(&mut st, false);
    }

    /// One heartbeat per `PROGRESS_HEARTBEAT_MS`, starting one period from now. Abort the handle
    /// (and `close`) when the job ends.
    pub fn spawn_heartbeat(&self) -> tokio::task::JoinHandle<()> {
        let me = self.clone();
        tokio::spawn(async move {
            let period = Duration::from_millis(PROGRESS_HEARTBEAT_MS);
            let mut tick = tokio::time::interval_at(Instant::now() + period, period);
            tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            loop {
                tick.tick().await;
                me.heartbeat();
            }
        })
    }

    /// Warning text must carry host and path only, never a token query.
    pub fn warn(&self, message: impl Into<String>) {
        let message = message.into();
        let mut st = self.inner.lock();
        if st.closed {
            return;
        }
        let now = Instant::now();
        let w = st.warnings.entry(message.clone()).or_insert(WarnState {
            pending: 0,
            last_sent: None,
        });
        let due = w
            .last_sent
            .is_none_or(|t| now.duration_since(t) >= Duration::from_millis(WARNING_COALESCE_MS));
        if due {
            self.inner.send_warning(&mut st, message, 1);
        } else {
            w.pending += 1;
        }
    }

    /// Flushes every pending warning, then silences the emitter for good.
    pub fn close(&self) {
        let mut st = self.inner.lock();
        if st.closed {
            return;
        }
        self.inner.flush_warnings(&mut st, true);
        st.closed = true;
    }
}

/// Host double for tests elsewhere in the crate (keeps every `emit` definition in this file).
#[cfg(test)]
pub(crate) mod test_support {
    use super::*;
    use crate::TokenRequest;

    pub struct NullHost;
    impl JobHost for NullHost {
        fn emit(&self, _ev: JobEvent) {}
        fn cdn_token(&self, _r: TokenRequest) -> Result<Option<String>, String> {
            Ok(None)
        }
        fn manifest_request_code(
            &self,
            _a: &str,
            _d: &str,
            _m: &str,
        ) -> Result<Option<String>, String> {
            Ok(None)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::TokenRequest;

    #[derive(Default)]
    struct Rec(Mutex<Vec<JobEvent>>);
    impl JobHost for Rec {
        fn emit(&self, ev: JobEvent) {
            self.0.lock().unwrap().push(ev);
        }
        fn cdn_token(&self, _r: TokenRequest) -> Result<Option<String>, String> {
            Ok(None)
        }
        fn manifest_request_code(
            &self,
            _a: &str,
            _d: &str,
            _m: &str,
        ) -> Result<Option<String>, String> {
            Ok(None)
        }
    }

    fn snap(done: u64, total: u64) -> Snapshot {
        Snapshot {
            done_bytes: done,
            total_bytes: total,
            files_total: 1,
            ..Snapshot::default()
        }
    }

    fn kinds(rec: &Rec) -> Vec<&'static str> {
        rec.0
            .lock()
            .unwrap()
            .iter()
            .map(|e| match e.body {
                JobEventBody::Planned { .. } => "planned",
                JobEventBody::Progress { .. } => "progress",
                JobEventBody::Warning { .. } => "warning",
                JobEventBody::HostSummary { .. } => "host",
            })
            .collect()
    }

    fn fixture() -> (Arc<Rec>, ProgressEmitter) {
        let rec = Arc::new(Rec::default());
        let em = ProgressEmitter::new(rec.clone(), "j");
        em.planned(1_000_000, 1, vec![]);
        (rec, em)
    }

    #[tokio::test(start_paused = true)]
    async fn progress_is_throttled_by_time_and_percent() {
        let (rec, em) = fixture();
        // 0.1% steps inside 500 ms: nothing is emitted.
        for i in 1..=5 {
            em.progress(snap(i * 1_000, 1_000_000));
        }
        assert_eq!(kinds(&rec), vec!["planned"]);
        // A 1% move emits at once.
        em.progress(snap(15_000, 1_000_000));
        assert_eq!(kinds(&rec), vec!["planned", "progress"]);
        // Small steps again, then 500 ms passes.
        em.progress(snap(16_000, 1_000_000));
        assert_eq!(kinds(&rec).len(), 2);
        tokio::time::advance(Duration::from_millis(PROGRESS_THROTTLE_MS)).await;
        em.progress(snap(17_000, 1_000_000));
        assert_eq!(kinds(&rec).len(), 3);
    }

    #[tokio::test(start_paused = true)]
    async fn heartbeat_fires_without_progress() {
        let (rec, em) = fixture();
        let h = em.spawn_heartbeat();
        tokio::time::sleep(Duration::from_millis(2_500)).await;
        h.abort();
        let evs = rec.0.lock().unwrap();
        let beats: Vec<u64> = evs
            .iter()
            .filter_map(|e| match e.body {
                JobEventBody::Progress { elapsed_ms, .. } => Some(elapsed_ms),
                _ => None,
            })
            .collect();
        assert_eq!(beats.len(), 2);
        assert!(beats[1] > beats[0], "elapsedMs must advance");
    }

    #[tokio::test(start_paused = true)]
    async fn seq_is_monotonic_and_close_silences() {
        let (rec, em) = fixture();
        em.force(snap(1, 10));
        em.warn("w");
        em.close();
        em.force(snap(2, 10));
        em.warn("late");
        let evs = rec.0.lock().unwrap();
        let seqs: Vec<u64> = evs.iter().map(|e| e.seq).collect();
        assert_eq!(seqs, vec![0, 1, 2]);
    }

    #[tokio::test(start_paused = true)]
    async fn identical_warnings_coalesce_with_a_count() {
        let (rec, em) = fixture();
        for _ in 0..10 {
            em.warn("same");
        }
        assert_eq!(kinds(&rec), vec!["planned", "warning"]);
        tokio::time::advance(Duration::from_millis(WARNING_COALESCE_MS)).await;
        em.warn("same");
        let evs = rec.0.lock().unwrap();
        let counts: Vec<u32> = evs
            .iter()
            .filter_map(|e| match &e.body {
                JobEventBody::Warning { count, .. } => Some(*count),
                _ => None,
            })
            .collect();
        assert_eq!(counts, vec![1, 10]);
    }

    #[tokio::test(start_paused = true)]
    async fn warning_frames_are_capped() {
        let (rec, em) = fixture();
        for i in 0..(MAX_WARNING_EVENTS + 20) {
            em.warn(format!("distinct {i}"));
        }
        let n = kinds(&rec).iter().filter(|k| **k == "warning").count();
        assert_eq!(n as u32, MAX_WARNING_EVENTS + 1);
    }
}
