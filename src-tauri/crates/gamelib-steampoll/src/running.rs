//! Port of library/runningPoll.ts (running-app poll and its probes). D-13.
//!
//! `read_running_app_id` is the per-platform probe: Windows reads HKCU natively (no reg.exe),
//! macOS reads `registry.vdf`, Linux reads `~/.steam/registry.vdf` and falls back to the reaper
//! scan when that reads 0. Mac Steam writes no RunningAppID, so the on-demand op uses
//! [`read_running_app_id_or_process_scan`], which adds a Darwin process scan by executable path
//! (quick 261118-uma). `RunningPoll` is the 5 s poll: one task on the registry, `Delay` ticks
//! so a slow probe never overlaps the next tick, launch-watch claims, the 20 s drain.
//!
//! Status goes out as `gameStatusUpdate` frontend messages only; the running poll has no sidecar
//! state (D-13).

use crate::constants::{RUNNING_DRAIN_MS, RUNNING_POLL_INTERVAL_MS};
use crate::host::{BoxFuture, ProcessRunner};
use crate::profile::Platform;
use crate::registry::{PollKind, Registry};
use crate::running_scan::{scan_running_app_id, ExeLister};
use serde_json::json;
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;
use tokio::time::{interval_at, Instant, MissedTickBehavior};
use tokio_util::sync::CancellationToken;

/// The registry key every running poll registers under (single instance).
const POLL_KEY: &str = "running";
const REAPER_MARKER: &str = "reaper SteamLaunch --AppId ";

fn read_registry_vdf(path: &Path) -> u32 {
    gamelib_steamfiles::readers::read_running_app_id(path).running_app_id
}

/// `ps -eo args` reaper scan (T-06-05): 0 when no reaper, a timeout, or a non-zero exit.
async fn linux_fallback(runner: &dyn ProcessRunner) -> u32 {
    let out = runner
        .run(
            "ps",
            vec!["-eo".to_string(), "args".to_string()],
            Duration::from_millis(1000),
        )
        .await;
    if out.code != Some(0) {
        return 0;
    }
    let Some(at) = out.stdout.find(REAPER_MARKER) else {
        return 0;
    };
    let digits: String = out.stdout[at + REAPER_MARKER.len()..]
        .chars()
        .take_while(char::is_ascii_digit)
        .collect();
    digits.parse().unwrap_or(0)
}

/// The currently running Steam game AppID, 0 when none or on any error.
///
/// `strict` is `readRunningAppIdOrThrow`: a registry.vdf read that cannot even be attempted
/// (no profile home) is an error instead of "no game running", so a safety guard can refuse.
/// Windows is never strict (the TS reg.exe path never threw).
///
/// `_steam_root` is accepted for the shell's call shape; no probe here needs it. On macOS this is
/// registry-only and reads 0 for a real running game (Mac Steam writes no RunningAppID); the
/// on-demand op calls [`read_running_app_id_or_process_scan`] instead.
pub async fn read_running_app_id(
    platform: Platform,
    profile_home: &Path,
    _steam_root: Option<&str>,
    runner: &dyn ProcessRunner,
    strict: bool,
) -> Result<u32, String> {
    if platform == Platform::Win32 {
        return Ok(gamelib_steamfiles::readers::read_windows_running_app_id());
    }
    if strict && profile_home.as_os_str().is_empty() {
        return Err("running app id: profile home is unknown".to_string());
    }
    if platform == Platform::Darwin {
        let reg = profile_home
            .join("Library")
            .join("Application Support")
            .join("Steam")
            .join("registry.vdf");
        return Ok(read_registry_vdf(&reg));
    }
    let from_registry = read_registry_vdf(&profile_home.join(".steam").join("registry.vdf"));
    if from_registry != 0 {
        return Ok(from_registry);
    }
    Ok(linux_fallback(runner).await)
}

/// [`read_running_app_id`], then on macOS only, when that reads 0, a process-table scan by
/// executable path under every Steam library (quick 261118-uma). Windows and Linux answers are
/// returned unchanged and `lister` is never called off Darwin. A strict error from the registry
/// step (no profile home) surfaces before any scan.
pub async fn read_running_app_id_or_process_scan(
    platform: Platform,
    profile_home: &Path,
    steam_root: Option<&str>,
    runner: &dyn ProcessRunner,
    strict: bool,
    lister: &ExeLister,
) -> Result<u32, String> {
    let id = read_running_app_id(platform, profile_home, steam_root, runner, strict).await?;
    if id != 0 || platform != Platform::Darwin {
        return Ok(id);
    }
    scan_running_app_id(profile_home, steam_root, strict, lister)
}

/// A probe the poll calls each tick; never fails (0 means nothing running).
pub type Probe = Arc<dyn Fn() -> BoxFuture<u32> + Send + Sync>;

/// A claim handle from [`RunningPoll::hold`]. A later hold for the same app replaces the claim, so
/// an older handle becomes a no-op.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ClaimId {
    app_id: u32,
    id: u64,
}

struct Claim {
    id: u64,
    /// Set once released with a terminal frame sent: the drain deadline (clock ms).
    until: Option<u64>,
    released: bool,
}

#[derive(Default)]
struct State {
    last_known: u32,
    claims: HashMap<u32, Claim>,
    next_claim: u64,
    started: bool,
    /// Bumped by every `start` and `stop`. A task clears `started` on exit only while its own
    /// generation is current, so a cancelled task that exits after a restart cannot clear the
    /// new task's flag (80-REVIEW A/WR-07).
    gen: u64,
    /// The current task's cancel token, set in the same critical section as `started`, so a
    /// `stop()` always reaches the task a `start()` spawned (80-REVIEW iteration 2, A/WR-02).
    token: Option<CancellationToken>,
}

struct Inner {
    registry: Registry,
    probe: Probe,
    state: Mutex<State>,
    in_flight: AtomicBool,
}

/// The running-game poller, a boot-built instance. Cheap to clone.
#[derive(Clone)]
pub struct RunningPoll {
    inner: Arc<Inner>,
}

struct InFlight<'a>(&'a AtomicBool);

impl Drop for InFlight<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

fn lock(m: &Mutex<State>) -> MutexGuard<'_, State> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn status_frame(app_id: u32, status: &str) -> serde_json::Value {
    json!({"appName": app_id.to_string(), "runner": "steam", "status": status})
}

impl RunningPoll {
    pub fn new(registry: Registry, probe: Probe) -> Self {
        RunningPoll {
            inner: Arc::new(Inner {
                registry,
                probe,
                state: Mutex::new(State::default()),
                in_flight: AtomicBool::new(false),
            }),
        }
    }

    /// The production probe: [`read_running_app_id`] for `platform`, non-strict.
    ///
    /// The Darwin probe deliberately stays registry-only (quick 261118-uma): Mac Playing status
    /// belongs to the launch watch (261111-9mj), a scan would also report games GameLib launched
    /// without Steam, and it would scan the process table every 5 s tick. Only the on-demand op
    /// uses the process scan.
    pub fn for_platform(
        registry: Registry,
        platform: Platform,
        profile_home: std::path::PathBuf,
        steam_root: Option<String>,
    ) -> Self {
        let runner = registry.runner().clone();
        let probe: Probe = Arc::new(move || {
            let (runner, home, root) = (runner.clone(), profile_home.clone(), steam_root.clone());
            Box::pin(async move {
                read_running_app_id(platform, &home, root.as_deref(), &*runner, false)
                    .await
                    .unwrap_or(0)
            })
        });
        Self::new(registry, probe)
    }

    fn emit(&self, app_id: u32, status: &str) {
        self.inner
            .registry
            .host()
            .emit_frontend("gameStatusUpdate", vec![status_frame(app_id, status)]);
    }

    /// The appId the poller last saw running (0 when none, or never started).
    pub fn last_app_id(&self) -> u32 {
        lock(&self.inner.state).last_known
    }

    /// Start the 5 s poll. Idempotent.
    pub fn start(&self) {
        let (gen, token, guard) = {
            let mut st = lock(&self.inner.state);
            if st.started {
                return;
            }
            st.started = true;
            st.gen += 1;
            // Register under the state lock: a `stop()` between the flag and the registration
            // would cancel nothing and leave the task this call spawns uncancellable
            // (80-REVIEW iteration 2, A/WR-02). Lock order is state -> registry map; nothing
            // takes them the other way (`PollGuard::drop` takes the map alone).
            let (token, guard) = self.inner.registry.register(PollKind::Running, POLL_KEY);
            if let Some(old) = st.token.replace(token.clone()) {
                old.cancel();
            }
            (st.gen, token, guard)
        };
        let poll = self.clone();
        self.inner.registry.spawn(async move {
            let _guard = guard;
            let period = Duration::from_millis(RUNNING_POLL_INTERVAL_MS);
            let mut ticks = interval_at(Instant::now() + period, period);
            // D-10: a slow probe delays the next tick instead of bursting to catch up.
            ticks.set_missed_tick_behavior(MissedTickBehavior::Delay);
            loop {
                tokio::select! {
                    _ = token.cancelled() => break,
                    _ = ticks.tick() => poll.poll_once().await,
                }
            }
            let mut st = lock(&poll.inner.state);
            if st.gen == gen {
                st.started = false;
            }
        });
    }

    /// Stop the poll and forget the last id and every claim.
    pub fn stop(&self) {
        let mut st = lock(&self.inner.state);
        if let Some(token) = st.token.take() {
            token.cancel();
        }
        st.started = false;
        st.gen += 1;
        st.last_known = 0;
        st.claims.clear();
    }

    /// The launch watch claims `app_id`'s status, so the poller stays silent for it.
    pub fn hold(&self, app_id: u32) -> ClaimId {
        let mut st = lock(&self.inner.state);
        st.next_claim += 1;
        let id = st.next_claim;
        st.claims.insert(
            app_id,
            Claim {
                id,
                until: None,
                released: false,
            },
        );
        ClaimId { app_id, id }
    }

    /// Release a claim, once.
    /// - `terminal_sent`: the watch sent done, or was cancelled. The claim drains: silent until
    ///   a different RunningAppID is read, and `playing` if the app still reads
    ///   `RUNNING_DRAIN_MS` later.
    /// - not sent: the watch handed back. The claim is dropped, and `playing` goes out now if the
    ///   poller already reads the app.
    pub fn release(&self, claim: ClaimId, terminal_sent: bool) {
        let republish = {
            let mut st = lock(&self.inner.state);
            let now = self.inner.registry.clock().now_ms();
            let last_known = st.last_known;
            match st.claims.get_mut(&claim.app_id) {
                Some(c) if c.id == claim.id && !c.released => {
                    c.released = true;
                    if terminal_sent {
                        c.until = Some(now + RUNNING_DRAIN_MS);
                        false
                    } else {
                        st.claims.remove(&claim.app_id);
                        last_known == claim.app_id
                    }
                }
                _ => false,
            }
        };
        if republish {
            self.emit(claim.app_id, "playing");
        }
    }

    /// One probe and its transitions. A tick while the previous one is still probing is skipped.
    pub async fn poll_once(&self) {
        if self.inner.in_flight.swap(true, Ordering::AcqRel) {
            return;
        }
        // Reset on drop too: stop() can cancel the task mid-probe.
        let _busy = InFlight(&self.inner.in_flight);
        let current = (self.inner.probe)().await;
        let emits = self.transition(current);
        for (app_id, status) in emits {
            self.emit(app_id, status);
        }
    }

    fn transition(&self, current: u32) -> Vec<(u32, &'static str)> {
        let now = self.inner.registry.clock().now_ms();
        let mut st = lock(&self.inner.state);
        let previous = st.last_known;
        let previous_claimed = previous != 0 && st.claims.contains_key(&previous);
        let mut republish = false;
        let drained: Vec<u32> = st
            .claims
            .iter()
            .filter_map(|(id, c)| {
                let until = c.until?;
                (*id != current || now >= until).then_some(*id)
            })
            .collect();
        for id in drained {
            st.claims.remove(&id);
            if id == current {
                republish = true;
            }
        }
        if current == previous {
            return if republish && current != 0 {
                vec![(current, "playing")]
            } else {
                vec![]
            };
        }
        let mut emits = vec![];
        if previous != 0 && !previous_claimed {
            emits.push((previous, "done"));
        }
        if current != 0 && !st.claims.contains_key(&current) {
            emits.push((current, "playing"));
        }
        st.last_known = current;
        emits
    }
}
