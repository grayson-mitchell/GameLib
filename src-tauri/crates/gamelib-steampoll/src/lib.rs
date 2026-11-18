//! Tauri-free port of the Steam install, uninstall, update and running-app poll state machines
//! (Phase 80). The shell implements [`host::PollHost`]; tests use [`testing::RecordingHost`].
//!
//! Contract (same as `gamelib-depot`): results, not errors. `dispatch` returns `Err` only for bad
//! args, an unknown op or a panic (`{op}:panic`).
//!
//! Logging rule (T-28-04 / T-80-02): log appId, kind and counts only, never args, payloads or
//! paths that carry a user name.
//!
//! # Phase 80 design record
//!
//! - R1 (D-08, pattern-mapper item 1): `surface_dead_sidecar` (shell src/sidecar.rs:693-712)
//!   always restarts or exits the whole app, so a mid-session sidecar reconnect never happens.
//!   The outbox (D-08 queue, latest wins) only has to cover the boot window before the sidecar's
//!   first READY (D-09). The "sidecar connect and disconnect" timelines of D-14 become "not yet
//!   READY" and "ack timeout" scenarios.
//! - R2 (item 2): the TS state-event handler, not Rust, builds the `SteamGameInfo` from the
//!   sidecar's `existing` entry, writes `steamLibraryStore`, and emits `pushGameToLibrary` on the
//!   sidecar emitter BEFORE it replies. The shell reader thread (`start_reader`, sidecar.rs)
//!   processes stdout frames in order, so `pushGameToLibrary` reaches the webview before the ack
//!   wakes Rust, which then emits `gameStatusUpdate` and the notification (D-05 order kept).
//!   Notification titles come from the poll's start args (`title`, filled by the TS start site
//!   from libraryState) and every ack reply refreshes them.
//! - R3 (item 3): the restart-hold store file (`steam_restart_hold`, a sidecar CacheStore under
//!   `${userData}/store_cache/`) has exactly one writer per run: Rust when `GAMELIB_STEAM_POLLS`
//!   resolves to rust, TS when it resolves to ts. Every sidecar writer of that store is poll code
//!   that does not run under rust. Both sides read and write the same CacheStore JSON layout
//!   (`__timestamp.<appId>` keys included), so the file survives a flag switch across restarts
//!   (D-16, 79 D-10).
//! - R4 (item 4): runtime = a crate-private `OnceLock<tokio::runtime::Runtime>` (multi-thread,
//!   2 workers, as gamelib-depot), exposed only as a `Handle`. The `Registry` spawns on a `Handle`
//!   it is given, so tests pass `Handle::current()` under `#[tokio::test(start_paused = true)]`
//!   and the shell passes `runtime::handle()`. Rationale: keeps the crate free of the
//!   shell's async runtime, matches the depot precedent, and lets 7200-tick scenarios run in
//!   paused time.
//! - R5 (D-06 resume breadcrumbs): the breadcrumb functions in `resumeBreadcrumbs.ts`
//!   (`markSteamNativeInstallStarted`, `clearSteamResumeBreadcrumb`,
//!   `getSteamResumeBreadcrumbAppIds`, `markSteamInstallIncomplete`) only mutate sidecar
//!   libraryState + steamLibraryStore. Moving that state is deferred (CONTEXT `<deferred>`), so
//!   the poll's `markSteamInstallIncomplete` call becomes the `installIncomplete` state event, and
//!   the only file work, `breadcrumbAppIsFullyInstalledOnDisk`, moves to Rust. The boot path that
//!   actually restarted polls was `rearmPersistedSteamRestartHolds` (resume.ts:285); D-09 moved
//!   it to Rust and Phase 81 D-11 deleted it. The init() breadcrumb surfacing starts no poll and
//!   stays TS.
//! - R6 (D-06 Mac arch): Rust owns the probe (locate the Mach-O binary, `lipo -archs` / `file`,
//!   verdict). Applying the verdict (steamMetadataStore, libraryState, known-fix reports, the i386
//!   recovery prompt that reinstalls through SteamGame) is sidecar state and install routing, so
//!   it arrives as the `macArchVerdict` state event and the TS handler applies it.
//! - R7 (D-02 list correction): `markManagedBySteam` (installPolling.ts:445) only emits
//!   `gameStatusUpdate` and touches no sidecar state, so Rust emits it directly (D-04).
//!   `gameSession.isNativeInstallInFlight` is read per tick (installPolling.ts:399,414); TS pushes
//!   changes to Rust (`steampoll_native_in_flight`) whenever `nativeInstallsInFlight` changes, so
//!   Rust never calls back into TS per tick (D-06).

pub mod acf_copies;
pub mod acf_state;
pub mod adoption;
pub mod adoption_evidence;
pub mod app_state;
pub mod constants;
pub mod dispatch;
pub mod effects;
pub mod events;
pub mod hold_migration;
pub mod host;
pub mod install_loop;
pub mod install_once;
pub mod mac_arch;
pub mod monitor;
pub mod outbox;
pub mod profile;
pub mod progress;
pub mod registry;
pub mod running;
pub mod running_scan;
pub mod runtime;
pub mod steam_process;
#[cfg(any(test, feature = "testing"))]
pub mod testing;
pub mod uninstall;
pub mod update;

pub use dispatch::{dispatch, OPS};
