use super::*;

// ---- Wake lock (Phase 35 Plan 08, D-08, REQ-35-06) ----
//
// Replaces `electronStub.ts`'s `powerSaveBlocker` logged no-op, which returned `-1` and held
// nothing. Its real cost, now paid off: the machine idle-slept mid depot download, and
// `launcher.ts`'s `prevent-display-sleep` let the screen blank while a game was running.
//
// 33-RESEARCH's "no viable maintained Tauri v2 wake-lock plugin" verdict was RE-CHECKED at this
// plan's Task 1 (see 35-08-SUMMARY.md for versions and dates) and HELD, so this is a first-party
// binding rather than a plugin. It adds no new crate: the macOS arm calls IOKit through a
// `#[link]` block and builds its CFStrings with `objc2-core-foundation`, already resolved in
// Cargo.lock as a transitive dependency of `tao`/`objc2-core-graphics` and promoted to a direct
// macOS dependency at its identical pinned version -- the same discipline the `objc2-web-kit`
// and `dispatch2` comments in Cargo.toml already established.
//
// The two assertion KINDS stay distinct on every arm. Collapsing them is the T-35-32 threat:
// one shared assertion would either blank the display during play or hold the display awake
// through an eight-hour download.

/// Electron's own `powerSaveBlocker.start()` vocabulary, kept verbatim so the JS side needs no
/// translation table -- `launcher.ts` and `appShellFlowRegistration.ts` pass these strings
/// through unchanged.
pub(crate) const WAKE_LOCK_KIND_DISPLAY: &str = "prevent-display-sleep";
pub(crate) const WAKE_LOCK_KIND_SYSTEM: &str = "prevent-app-suspension";

/// Which OS power assertion a `wake_lock_start` request asked for.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum WakeLockKind {
    /// Keep the DISPLAY awake (a game is running).
    Display,
    /// Keep the SYSTEM awake (a depot download is in progress). Deliberately does NOT keep the
    /// display awake -- see the T-35-32 note above.
    System,
}

/// Pure kind validation, extracted from the effectful acquire for the same reason
/// `deep_link_decision` is extracted from `on_open_url`: the decision is testable without an
/// OS, and the syscall arm is left with nothing to decide.
///
/// Rejects anything that is not one of the two literals. There is deliberately NO default arm:
/// a silent fallback to one kind IS threat T-35-32, and it would be invisible in every test
/// that exercised only the kind that happened to be hardcoded.
///
/// The error does NOT echo `candidate`. Same discipline as `DeepLinkDecision::Reject`, which
/// carries only a byte count (T-34.5-G6-25 / T-35-26): a rejected value is by definition one
/// this process did not expect, and rejected values do not belong in a log file users attach
/// to bug reports.
pub(crate) fn wake_lock_kind(candidate: &str) -> Result<WakeLockKind, String> {
    match candidate {
        WAKE_LOCK_KIND_DISPLAY => Ok(WakeLockKind::Display),
        WAKE_LOCK_KIND_SYSTEM => Ok(WakeLockKind::System),
        _ => Err("wake_lock_start:unknown-kind".to_string()),
    }
}

/// Live wake locks, keyed by the id `wake_lock_start` handed back to the sidecar.
///
/// `held` is the PURE bookkeeping half (id -> kind) and is what the `#[cfg(test)]` module
/// exercises. The platform-handle maps beside it are `#[cfg]`-selected and hold whatever the
/// OS gave us for that same id, so `wake_lock_stop(id)` releases EXACTLY the assertion its id
/// names -- the T-35-31 mitigation. Both halves live under one `Mutex` so they cannot diverge.
///
/// Windows has no per-assertion handle map on purpose: `SetThreadExecutionState` is a
/// thread-global flag word, not a handle, so its arm recomputes the flags from `held`.
#[derive(Default)]
pub(crate) struct WakeLockRegistry {
    next_id: u32,
    held: HashMap<u32, WakeLockKind>,
    /// macOS: the `IOPMAssertionID` returned by `IOPMAssertionCreateWithName`.
    #[cfg(target_os = "macos")]
    assertions: HashMap<u32, u32>,
    /// Linux: the held `systemd-inhibit` child. The inhibitor lasts exactly as long as this
    /// process does, which is why it is stored rather than spawned-and-forgotten.
    #[cfg(target_os = "linux")]
    inhibitors: HashMap<u32, Child>,
}

impl WakeLockRegistry {
    /// PURE: allocate an unused id and record its kind. Performs no OS call.
    ///
    /// Never returns 0. `launcher.ts`'s re-entry guard is `if (!powerDisplayId)`, which treats
    /// 0 as "no lock held" -- handing out 0 would make it start a second display assertion on
    /// every launch and leak the first.
    pub(crate) fn allocate(&mut self, kind: WakeLockKind) -> u32 {
        loop {
            self.next_id = self.next_id.wrapping_add(1);
            if self.next_id != 0 && !self.held.contains_key(&self.next_id) {
                break;
            }
        }
        let id = self.next_id;
        self.held.insert(id, kind);
        id
    }

    /// PURE: forget `id`. Returns `Err` -- never panics -- for an id that was never held or
    /// has already been released, so a double `stop` is a reported no-op rather than a crash.
    pub(crate) fn forget(&mut self, id: u32) -> Result<WakeLockKind, String> {
        self.held
            .remove(&id)
            .ok_or_else(|| "wake_lock_stop:unknown-id".to_string())
    }

    /// PURE: is at least one assertion of `kind` still live?
    #[cfg_attr(not(target_os = "windows"), allow(dead_code))]
    pub(crate) fn holds(&self, kind: WakeLockKind) -> bool {
        self.held.values().any(|held| *held == kind)
    }
}

static WAKE_LOCKS: OnceLock<Mutex<WakeLockRegistry>> = OnceLock::new();

fn wake_locks() -> &'static Mutex<WakeLockRegistry> {
    WAKE_LOCKS.get_or_init(|| Mutex::new(WakeLockRegistry::default()))
}

/// macOS power assertions via IOKit.
///
/// Constant names and their string VALUES were read out of this machine's own SDK header
/// (`IOKit.framework/Headers/pwr_mgt/IOPMLib.h`) rather than taken from 35-RESEARCH.md, which
/// marked its pairing `[ASSUMED]` and declined to vouch for it. From that header:
///   `#define kIOPMAssertionTypePreventUserIdleDisplaySleep kIOPMAssertPreventUserIdleDisplaySleep`
///   `#define kIOPMAssertPreventUserIdleDisplaySleep        CFSTR("PreventUserIdleDisplaySleep")`
///   `#define kIOPMAssertionTypePreventUserIdleSystemSleep  kIOPMAssertPreventUserIdleSystemSleep`
///   `#define kIOPMAssertPreventUserIdleSystemSleep         CFSTR("PreventUserIdleSystemSleep")`
///   `kIOPMAssertionLevelOn = 255`, `typedef uint32_t IOPMAssertionID`
/// They are `CFSTR` macros, not exported symbols, so the string values are built here rather
/// than linked. These are also the exact names `pmset -g assertions` prints, which is what
/// makes this plan's Task 3 able to tell the two kinds apart by eye.
#[cfg(target_os = "macos")]
#[path = "wake_lock/macos.rs"]
mod macos_wake_lock;

/// Windows power assertions via `SetThreadExecutionState`.
///
/// THREAT T-35-33, and the reason this arm is a whole module rather than two calls:
/// `SetThreadExecutionState` sets a flag word on the CALLING THREAD, and the assertion lives
/// exactly as long as that thread does. `dispatch_rust_channel` runs on a short-lived spawned
/// worker (see `start_reader`), so calling it there would set flags on a thread that exits
/// moments later -- a silent no-op that no unit test can see and that `powercfg /requests`
/// would show as simply absent.
///
/// So the flags are owned by ONE dedicated thread that is created on first use and then lives
/// for the rest of the process. Every start/stop recomputes the whole flag word from the
/// registry and posts it to that thread. The kinds stay distinct: `ES_DISPLAY_REQUIRED` is set
/// only while a Display lock is held, so a download never keeps the screen lit.
#[cfg(target_os = "windows")]
#[path = "wake_lock/windows.rs"]
mod windows_wake_lock;

/// Linux power assertions via logind, held through `systemd-inhibit`.
///
/// The inhibitor lasts exactly as long as the command `systemd-inhibit` wraps, so the child is
/// STORED in the registry rather than spawned and forgotten -- a `systemd-inhibit` that exits
/// immediately takes its lock away with it. `cat` with a piped stdin we never write to is the
/// block: dropping our stdin handle ends `cat`, which ends `systemd-inhibit`, which releases
/// the lock without needing a signal (and logind releases it anyway if we are killed).
///
/// HONEST LIMITATION, not an oversight: logind has no display-specific inhibitor. `idle` is the
/// closest true equivalent, and the display kind uses it alone while the system kind adds
/// `sleep`. The two remain distinct -- a download does not take the display's lock and a game
/// does not block suspend -- but a desktop whose blanking is driven by its screensaver rather
/// than by logind's idle timeout may still blank during play. Task 3 marks Linux NOT ATTEMPTED.
#[cfg(target_os = "linux")]
#[path = "wake_lock/linux.rs"]
mod linux_wake_lock;

/// A human-readable label for the assertion, shown by `pmset -g assertions` (macOS) and
/// `systemd-inhibit --list` (Linux). Carries no user data -- just which of the two things
/// GameLib does is holding the machine awake.
fn wake_lock_reason(kind: WakeLockKind) -> &'static str {
    match kind {
        WakeLockKind::Display => "GameLib: a game is running",
        WakeLockKind::System => "GameLib: a download is in progress",
    }
}

/// Recompute and apply the Windows thread-global flag word from the whole registry.
/// No-op everywhere else, where assertions are per-id handles instead of a shared flag word.
#[cfg(target_os = "windows")]
fn wake_lock_sync_platform(registry: &WakeLockRegistry) -> Result<(), String> {
    let mut flags = windows_wake_lock::ES_CONTINUOUS;
    if registry.holds(WakeLockKind::System) || registry.holds(WakeLockKind::Display) {
        flags |= windows_wake_lock::ES_SYSTEM_REQUIRED;
    }
    if registry.holds(WakeLockKind::Display) {
        flags |= windows_wake_lock::ES_DISPLAY_REQUIRED;
    }
    windows_wake_lock::apply(flags)
}

#[cfg(not(target_os = "windows"))]
fn wake_lock_sync_platform(_registry: &WakeLockRegistry) -> Result<(), String> {
    Ok(())
}

/// Take one OS power assertion of `kind_str` and return the id that releases it.
///
/// On any platform failure the id is NOT handed out and the bookkeeping entry is rolled back,
/// so a failed acquire cannot leave a phantom id that a later `stop` would "release".
pub(crate) fn wake_lock_start(kind_str: &str) -> Result<u32, String> {
    let kind = wake_lock_kind(kind_str)?;
    let mut registry = wake_locks()
        .lock()
        .map_err(|_| "wake_lock_start:registry-poisoned".to_string())?;
    let id = registry.allocate(kind);

    #[cfg(target_os = "macos")]
    {
        match macos_wake_lock::acquire(kind, wake_lock_reason(kind)) {
            Ok(assertion_id) => {
                registry.assertions.insert(id, assertion_id);
            }
            Err(e) => {
                registry.held.remove(&id);
                shell_eprintln!("[shell] WARN: wake lock could not be taken ({e}) -- continuing");
                return Err(e);
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        match linux_wake_lock::acquire(kind, wake_lock_reason(kind)) {
            Ok(child) => {
                registry.inhibitors.insert(id, child);
            }
            Err(e) => {
                registry.held.remove(&id);
                shell_eprintln!("[shell] WARN: wake lock could not be taken ({e}) -- continuing");
                return Err(e);
            }
        }
    }

    if let Err(e) = wake_lock_sync_platform(&registry) {
        registry.held.remove(&id);
        shell_eprintln!("[shell] WARN: wake lock could not be taken ({e}) -- continuing");
        return Err(e);
    }

    Ok(id)
}

/// Release exactly the assertion `id` names. An unknown or already-released id is reported,
/// never panicked on.
pub(crate) fn wake_lock_stop(id: u32) -> Result<(), String> {
    let mut registry = wake_locks()
        .lock()
        .map_err(|_| "wake_lock_stop:registry-poisoned".to_string())?;
    registry.forget(id)?;

    #[cfg(target_os = "macos")]
    if let Some(assertion_id) = registry.assertions.remove(&id) {
        if let Err(e) = macos_wake_lock::release(assertion_id) {
            shell_eprintln!("[shell] WARN: wake lock could not be released ({e}) -- continuing");
        }
    }

    #[cfg(target_os = "linux")]
    if let Some(child) = registry.inhibitors.remove(&id) {
        if let Err(e) = linux_wake_lock::release(child) {
            shell_eprintln!("[shell] WARN: wake lock could not be released ({e}) -- continuing");
        }
    }

    if let Err(e) = wake_lock_sync_platform(&registry) {
        shell_eprintln!("[shell] WARN: wake lock could not be released ({e}) -- continuing");
    }

    Ok(())
}

/// Release every assertion still held, on the way out of the process.
///
/// THREAT T-35-31: an assertion that outlives the process keeps the machine awake with no UI
/// left to release it -- a worse failure than the sleeping-mid-download one this plan fixes.
/// macOS releases IOKit assertions when their owning process dies, but Linux's `systemd-inhibit`
/// children would be orphaned and Windows' flag thread never re-run, so this is not redundant.
/// Recovers a poisoned lock via `into_inner` rather than propagating: refusing to release on
/// the exit path is the one outcome worse than releasing from a poisoned registry.
pub(crate) fn wake_lock_release_all() {
    let Some(lock) = WAKE_LOCKS.get() else {
        return;
    };
    let mut registry = match lock.lock() {
        Ok(registry) => registry,
        Err(poisoned) => poisoned.into_inner(),
    };
    let ids: Vec<u32> = registry.held.keys().copied().collect();
    for id in ids {
        registry.held.remove(&id);

        #[cfg(target_os = "macos")]
        if let Some(assertion_id) = registry.assertions.remove(&id) {
            if let Err(e) = macos_wake_lock::release(assertion_id) {
                shell_eprintln!(
                    "[shell] WARN: wake lock could not be released at exit ({e}) -- continuing"
                );
            }
        }

        #[cfg(target_os = "linux")]
        if let Some(child) = registry.inhibitors.remove(&id) {
            if let Err(e) = linux_wake_lock::release(child) {
                shell_eprintln!(
                    "[shell] WARN: wake lock could not be released at exit ({e}) -- continuing"
                );
            }
        }
    }
    if let Err(e) = wake_lock_sync_platform(&registry) {
        shell_eprintln!(
            "[shell] WARN: wake lock could not be released at exit ({e}) -- continuing"
        );
    }
}

