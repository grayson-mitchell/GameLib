//! Run-wide forward-progress clock. Port of `depot/stallTracker.ts`.
//!
//! Times are explicit millisecond offsets so tests never sleep; production callers use the
//! `*_now` helpers, which read a monotonic clock.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

// TS origin: depot/stallTracker.ts STALL_TIMEOUT_MS
/// Zero bytes written anywhere in the run for this long means the run is dead (3 minutes).
pub const STALL_TIMEOUT_MS: u64 = 3 * 60 * 1000;

#[derive(Debug)]
pub struct StallTracker {
    base: Instant,
    stall_timeout_ms: u64,
    last_progress_ms: AtomicU64,
}

impl Default for StallTracker {
    fn default() -> Self {
        Self::new(STALL_TIMEOUT_MS, 0)
    }
}

impl StallTracker {
    /// `now_ms` is the starting progress mark, in the same timeline as the `*_at` methods.
    pub fn new(stall_timeout_ms: u64, now_ms: u64) -> Self {
        Self {
            base: Instant::now(),
            stall_timeout_ms,
            last_progress_ms: AtomicU64::new(now_ms),
        }
    }

    /// Milliseconds on this tracker's own monotonic timeline.
    pub fn now_ms(&self) -> u64 {
        self.base.elapsed().as_millis() as u64
    }

    pub fn record_progress_at(&self, now_ms: u64) {
        self.last_progress_ms.store(now_ms, Ordering::Relaxed);
    }

    pub fn record_progress(&self) {
        self.record_progress_at(self.now_ms());
    }

    pub fn ms_since_progress_at(&self, now_ms: u64) -> u64 {
        now_ms.saturating_sub(self.last_progress_ms.load(Ordering::Relaxed))
    }

    pub fn ms_since_progress(&self) -> u64 {
        self.ms_since_progress_at(self.now_ms())
    }

    /// True once strictly more than the timeout has elapsed since the last progress.
    pub fn has_stalled_at(&self, now_ms: u64) -> bool {
        self.ms_since_progress_at(now_ms) > self.stall_timeout_ms
    }

    pub fn has_stalled(&self) -> bool {
        self.has_stalled_at(self.now_ms())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timeout_is_180_seconds() {
        assert_eq!(STALL_TIMEOUT_MS, 180_000);
    }

    #[test]
    fn trips_only_strictly_after_the_bound() {
        let t = StallTracker::new(STALL_TIMEOUT_MS, 1_000);
        assert!(!t.has_stalled_at(1_000 + STALL_TIMEOUT_MS));
        assert!(t.has_stalled_at(1_000 + STALL_TIMEOUT_MS + 1));
    }

    #[test]
    fn progress_resets_the_clock_and_reports_ms_since() {
        let t = StallTracker::new(STALL_TIMEOUT_MS, 0);
        assert_eq!(t.ms_since_progress_at(5_000), 5_000);
        t.record_progress_at(170_000);
        assert_eq!(t.ms_since_progress_at(200_000), 30_000);
        assert!(!t.has_stalled_at(200_000));
        assert!(t.has_stalled_at(170_000 + STALL_TIMEOUT_MS + 1));
    }
}
