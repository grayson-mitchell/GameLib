//! Wall clock seam.

use std::time::{SystemTime, UNIX_EPOCH};

/// Wall clock for `recordedAt`, `lastTickMs`, `lastSteamProbeMs`. Ticks use `tokio::time`.
pub trait Clock: Send + Sync + 'static {
    fn now_ms(&self) -> u64;
}

pub struct SystemClock;

impl Clock for SystemClock {
    fn now_ms(&self) -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    }
}
