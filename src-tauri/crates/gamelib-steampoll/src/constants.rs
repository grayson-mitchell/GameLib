//! Tick constants. Names and values equal `library/pollState.ts` (pinned by tests/contracts.rs
//! until plan 29 replaces the pin with literal asserts).

/// StateFlags GameLib writes on handoff: bit 4 (FullyInstalled) deliberately unset.
pub const GAMELIB_HANDOFF_STATE_FLAGS: u32 = 1026;
/// Status context while a bridge install runs its post-download tail.
pub const STEAM_BRIDGE_FINISHING_CONTEXT: &str = "steam-bridge-finishing";
/// Minimum gap between Steam-process re-probes while holding for a Steam restart.
pub const STEAM_HOLD_PROBE_MIN_INTERVAL_MS: u64 = 10_000;
/// Stop if no manifest appeared (about 60 s).
pub const GRACE_TICKS: u32 = 20;
/// Absolute safety cap (about 6 h).
pub const MAX_TICKS: u32 = 7200;
/// No-activity window after a steam:// request (about 2 min).
pub const STEAM_REQUEST_NO_ACTIVITY_TICKS: u32 = 40;
/// Absent ticks after a manifest was seen = cancelled or removed in Steam.
pub const MANIFEST_GONE_TICKS: u32 = 10;
/// InstallApp retry cadence on the update poll tick.
pub const STEAM_INSTALLAPP_RETRY_EVERY_TICKS: u32 = 3;
/// InstallApp retry attempt ceiling.
pub const STEAM_INSTALLAPP_RETRY_MAX_ATTEMPTS: u32 = 13;
/// Settled-at-starting-build ticks before an update counts as abandoned.
pub const STEAM_UPDATE_ABANDONED_TICKS: u32 = 20;
/// Frozen `downloading` ticks before the progress surfaces as `steam-paused`.
pub const STALLED_TICKS_THRESHOLD: u32 = 3;
/// Bytes per MiB (depot.ts convention for `downSpeed`).
pub const BYTES_PER_MIB: u64 = 1024 * 1024;

/// Default poll interval (ms).
pub const TICK_INTERVAL_MS: u64 = 3000;
/// Running-app poll interval (ms).
pub const RUNNING_POLL_INTERVAL_MS: u64 = 5000;
/// Running-app drain window (ms).
pub const RUNNING_DRAIN_MS: u64 = 20_000;
/// ACF StateFlags bit 4: FullyInstalled.
pub const STATE_FLAG_FULLY_INSTALLED: u32 = 0x4;
/// How long a state event waits for the sidecar's ack before it counts as not acked (D-05).
pub const ACK_TIMEOUT_MS: u64 = 5000;

/// Adoption-watch tick (ms, Phase 81 D-07). A slow cadence: adoption evidence changes on the
/// scale of a Steam restart or sign-in, and each tick costs a process probe and a small file read.
pub const ADOPTION_TICK_MS: u64 = 5_000;
/// The largest ACF the adoption watch reads or accepts as a baseline (T-81-02).
pub const ADOPTION_ACF_MAX_BYTES: u64 = 1_048_576;
/// How long one `--steam-appstate` helper call may run before it counts as no answer (T-81-13).
/// The helper arms its own 8 s alarm, so this only catches a helper that cannot even start.
pub const ADOPTION_HELPER_TIMEOUT_MS: u64 = 10_000;
