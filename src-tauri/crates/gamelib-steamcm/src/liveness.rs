//! Liveness and recovery policy for the CM session (D-01, D-02, spike 085).
//!
//! Pure policy only: delays, the sleep detector and the failure classification. The actor in
//! `session.rs` owns every timer and task. There is deliberately no periodic probe while a lease
//! is held (D-01: 085 Run C was 358/358 clean; failures are triggered from outside, by a failed
//! op, a LoggedOff or a sleep).

use std::time::{Duration, SystemTime};

use tokio::time::Instant;

use crate::error::CmError;
use crate::session::OpFailure;

/// A probe is a PICS access-token job for app 480.
pub const PROBE_TIMEOUT: Duration = Duration::from_secs(10);
/// One logon attempt during a rebuild.
pub const RECONNECT_ATTEMPT_BOUND: Duration = Duration::from_secs(30);
pub const RECONNECT_MAX_ATTEMPTS: u32 = 4;
/// Period of the sleep-detector tick.
pub const GAP_TICK: Duration = Duration::from_secs(5);
/// Wall time beyond monotonic time above which the machine is taken to have slept.
pub const GAP_THRESHOLD_SECS: f64 = 5.0;
/// Attempt, probe, reconnect and retry of one command all fit inside this.
pub const COMMAND_DEADLINE: Duration = Duration::from_secs(120);

/// Base delays: 5, 10, 20, 40, then 60 s ever after.
const BASE_SECS: [u64; 5] = [5, 10, 20, 40, 60];

/// The delay schedule of a rebuild, one entry before each attempt, with +-20% jitter that is
/// deterministic given its seed (no rand crate: the seed is the sub-second nanos of the wall clock).
#[derive(Debug, Clone)]
pub struct Backoff {
    seed: u32,
    attempt: u32,
}

impl Backoff {
    pub fn new() -> Self {
        let nanos = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.subsec_nanos())
            .unwrap_or(0);
        Self::with_seed(nanos)
    }

    pub fn with_seed(seed: u32) -> Self {
        Self { seed, attempt: 0 }
    }

    /// The un-jittered delay before attempt `n` (0-based).
    pub fn base(n: u32) -> Duration {
        Duration::from_secs(BASE_SECS[(n as usize).min(BASE_SECS.len() - 1)])
    }

    fn jittered(&self, n: u32) -> Duration {
        // A small LCG step over (seed, n) gives a factor in [0.8, 1.2].
        let x = self
            .seed
            .wrapping_add(n.wrapping_mul(0x9E37_79B9))
            .wrapping_mul(1_664_525)
            .wrapping_add(1_013_904_223);
        let unit = f64::from(x >> 8) / f64::from(1u32 << 24);
        Self::base(n).mul_f64(0.8 + 0.4 * unit)
    }
}

impl Default for Backoff {
    fn default() -> Self {
        Self::new()
    }
}

impl Iterator for Backoff {
    type Item = Duration;

    fn next(&mut self) -> Option<Duration> {
        if self.attempt >= RECONNECT_MAX_ATTEMPTS {
            return None;
        }
        let d = self.jittered(self.attempt);
        self.attempt += 1;
        Some(d)
    }
}

/// Detects a system sleep: the wall clock advanced much further than the monotonic one.
#[derive(Debug, Default)]
pub struct GapDetector {
    last: Option<(SystemTime, Instant)>,
}

impl GapDetector {
    /// The gap in seconds when wall time ran more than `GAP_THRESHOLD_SECS` ahead of monotonic
    /// time since the previous tick. The first tick only sets the baseline.
    pub fn tick(&mut self, wall: SystemTime, mono: Instant) -> Option<f64> {
        let prev = self.last.replace((wall, mono));
        let (pw, pm) = prev?;
        let wall_secs = match wall.duration_since(pw) {
            Ok(d) => d.as_secs_f64(),
            Err(e) => -e.duration().as_secs_f64(),
        };
        let gap = wall_secs - mono.saturating_duration_since(pm).as_secs_f64();
        (gap > GAP_THRESHOLD_SECS).then_some(gap)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FailureAction {
    /// Probe; on a dead link rebuild, then run the op once more.
    RetryAfterRebuild,
    /// Fail the op now.
    Terminal(OpFailure),
    /// Do not re-run the op. When `indicates_dead` the session is still probed and rebuilt, and a
    /// non-idempotent op then reports `Ambiguous`.
    FailNoRetry,
}

/// A failure that says the link itself may be gone, as opposed to Steam answering "no".
pub fn indicates_dead(err: &CmError) -> bool {
    matches!(err, CmError::Timeout | CmError::Closed | CmError::Io(_))
}

pub fn classify(err: &CmError, idempotent: bool) -> FailureAction {
    match err {
        CmError::Replaced => FailureAction::Terminal(OpFailure::Replaced),
        e if indicates_dead(e) && idempotent => FailureAction::RetryAfterRebuild,
        _ => FailureAction::FailNoRetry,
    }
}

/// A short, secret-free name of the failure for diagnostics.
pub fn kind_name(err: &CmError) -> &'static str {
    match err {
        CmError::Timeout => "timeout",
        CmError::Closed => "closed",
        CmError::Io(_) => "io",
        CmError::Discovery => "discovery",
        CmError::EResult(_) => "eresult",
        CmError::Replaced => "replaced",
        CmError::Protocol(_) => "protocol",
        CmError::Unsupported => "unsupported",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_follows_the_schedule_within_jitter_and_stops() {
        for seed in [0, 1, 123_456_789, u32::MAX, 999_999_999] {
            let v: Vec<Duration> = Backoff::with_seed(seed).collect();
            assert_eq!(v.len(), RECONNECT_MAX_ATTEMPTS as usize);
            for (i, d) in v.iter().enumerate() {
                let base = Backoff::base(i as u32).as_secs_f64();
                let s = d.as_secs_f64();
                assert!(
                    s >= base * 0.8 - 1e-9 && s <= base * 1.2 + 1e-9,
                    "{seed} {i} {s}"
                );
            }
        }
        assert_eq!(Backoff::base(0), Duration::from_secs(5));
        assert_eq!(Backoff::base(3), Duration::from_secs(40));
        assert_eq!(Backoff::base(4), Duration::from_secs(60));
        assert_eq!(Backoff::base(9), Duration::from_secs(60));
        assert!(Backoff::new().count() == RECONNECT_MAX_ATTEMPTS as usize);
    }

    #[test]
    fn backoff_is_deterministic_per_seed() {
        let a: Vec<_> = Backoff::with_seed(42).collect();
        let b: Vec<_> = Backoff::with_seed(42).collect();
        assert_eq!(a, b);
    }

    #[test]
    fn gap_detector_ignores_regular_ticks_and_reports_sleep() {
        let mut g = GapDetector::default();
        let w0 = SystemTime::UNIX_EPOCH + Duration::from_secs(1_000_000);
        let m0 = Instant::now();
        assert_eq!(g.tick(w0, m0), None);
        for i in 1..=5u64 {
            let d = Duration::from_secs(5 * i);
            assert_eq!(g.tick(w0 + d, m0 + d), None);
        }
        let base = Duration::from_secs(25);
        // 365 s of sleep: the wall clock jumped, the monotonic one did not.
        let gap = g
            .tick(
                w0 + base + Duration::from_secs(5 + 365),
                m0 + base + Duration::from_secs(5),
            )
            .unwrap();
        assert!((gap - 365.0).abs() < 0.01, "{gap}");
        // The next regular tick is quiet again.
        assert_eq!(
            g.tick(
                w0 + base + Duration::from_secs(10 + 365),
                m0 + base + Duration::from_secs(10)
            ),
            None
        );
    }

    #[test]
    fn gap_detector_survives_the_wall_clock_going_backwards() {
        let mut g = GapDetector::default();
        let w0 = SystemTime::UNIX_EPOCH + Duration::from_secs(1_000_000);
        let m0 = Instant::now();
        g.tick(w0, m0);
        assert_eq!(
            g.tick(w0 - Duration::from_secs(100), m0 + Duration::from_secs(5)),
            None
        );
    }

    #[test]
    fn classification_table() {
        for e in [CmError::Timeout, CmError::Closed, CmError::Io("x".into())] {
            assert_eq!(classify(&e, true), FailureAction::RetryAfterRebuild);
            assert_eq!(classify(&e, false), FailureAction::FailNoRetry);
            assert!(indicates_dead(&e));
        }
        for idem in [true, false] {
            assert_eq!(
                classify(&CmError::Replaced, idem),
                FailureAction::Terminal(OpFailure::Replaced)
            );
            assert_eq!(
                classify(&CmError::EResult(5), idem),
                FailureAction::FailNoRetry
            );
            assert_eq!(
                classify(&CmError::Discovery, idem),
                FailureAction::FailNoRetry
            );
        }
        assert!(!indicates_dead(&CmError::EResult(5)));
    }
}
