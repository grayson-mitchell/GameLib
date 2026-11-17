//! Phase 81 D-07 / D-10 / D-14: the singleton adoption-watch task.
//!
//! A depot install GameLib wrote is not "adopted" until the running Steam client has seen it.
//! While at least one pending-adoption record exists, one slow task watches for the evidence and
//! tells the sidecar through the `adoptionState` state event; the TS handler clears the record.
//!
//! Evidence per platform (spikes 083, 087, 088):
//!
//! | evidence | macOS | Windows | Linux |
//! |---|---|---|---|
//! | Steam rewrote the ACF (content differs from the GameLib baseline, StateFlags bit 4, real buildid) | yes | yes | yes |
//! | Steam's own install state for the app has bit 4 (the `--steam-appstate` helper, D-08) | yes | never | never |
//! | the recorded `steam_osx` pid is no longer live, unless the helper says the state is not 4 | yes | never | never |
//!
//! A pid change is not evidence off macOS: spikes 087 and 088 (r4) showed that a sign-out restarts
//! Steam without adopting anything. A later plan adds the Windows/Linux readers (81-05) as further
//! evidence kinds.
//!
//! macOS helper reading (81-04, spike 083). Steam open at its sign-in screen adopts the install the
//! moment the operator signs in, with the same pid, so the pid rule alone never sees it. Each
//! macOS tick therefore also asks the helper whether Steam is signed in and what install state it
//! holds. The helper is gated so a signed-in Steam is not probed every tick (see `HelperCache`),
//! and it is advisory: when it cannot answer (missing, unsupported arch, timeout, junk) the watch
//! behaves exactly as before, `signedIn` is unknown and the entry is kept (D-10).
//!
//! D-09: no InstallApp call happens at sign-in. With the experimental InstallApp setting on,
//! InstallApp fires at most once per record, only when the watch saw Steam signed out, then signed
//! in, and the state is still not 4 [`ADOPTION_INSTALLAPP_FALLBACK_DELAY_MS`] later (spike 083:
//! "fire InstallApp once only if the state is not 4 a few seconds after BLoggedOn turns 1").
//!
//! The ACF comparison is content-only. The TS `isSteamAdoptedAcf` also compares file timestamps,
//! but TS `statSync()` millisecond timestamps and Rust `SystemTime` milliseconds are not bit-equal,
//! so a timestamp comparison here would read GameLib's own StateFlags 4 ACF as adopted.
//!
//! D-10: a missing or unreadable manifest, or a probe that cannot answer, never reads as adopted
//! and never drops the watch entry.
//!
//! TS owns the pending-adoption store; Rust keeps only an in-memory watch list fed by ops (single
//! writer, R3).
//!
//! Logging rule (T-28-04): appId and evidence kind only, never a path, SteamID, title or payload.

use crate::app_state::{read_app_state, AppStateOutcome};
use crate::constants::{
    ADOPTION_ACF_MAX_BYTES, ADOPTION_HELPER_SIGNED_IN_MIN_INTERVAL_MS,
    ADOPTION_INSTALLAPP_FALLBACK_DELAY_MS, ADOPTION_TICK_MS,
};
use crate::effects::{Continuation, Effect};
use crate::events::StateEvent;
use crate::host::HoldSink;
use crate::outbox::{apply_effects, Outbox};
use crate::profile::Platform;
use crate::registry::{PollKind, Registry};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;
use tokio::time::{interval_at, Instant, MissedTickBehavior};
use tokio_util::sync::CancellationToken;

/// The registry key the one adoption task registers under.
pub const ADOPTION_POLL_KEY: &str = "adoption";

/// One pending adoption to watch, as the sidecar's pending-adoption record describes it.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdoptionWatchArgs {
    pub app_id: String,
    /// Absolute path of `steamapps/appmanifest_<appId>.acf`.
    pub manifest_path: String,
    /// The ACF exactly as GameLib wrote it, to tell a Steam rewrite from our own file.
    pub baseline_content: String,
    pub recorded_at_ms: f64,
    /// The `steam_osx` pid that was running when GameLib finished the install; 0 = unknown.
    pub steam_pid: u32,
    /// Fire InstallApp once when Steam signed in after being seen signed out and the app is still
    /// not adopted (D-09). Only the macOS watch reads it.
    #[serde(default)]
    pub install_app_fallback: bool,
}

/// What one evaluation found. `evidence` is `"acf"`, `"helper"` or `"pid"` here; 81-05 adds
/// `"log"` and `"libraryfolders"`.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdoptionReading {
    pub adopted: bool,
    pub signed_in: Option<bool>,
    pub steam_running: Option<bool>,
    pub helper_state: Option<u32>,
    pub evidence: Option<String>,
}

fn is_numeric_app_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 10 && id.bytes().all(|b| b.is_ascii_digit())
}

/// Checks watch args before anything reads the path (T-81-01): the watch only ever reads a
/// `steamapps/appmanifest_<appId>.acf` for the app it was started for.
pub fn validate_watch_args(a: &AdoptionWatchArgs) -> Result<(), &'static str> {
    if !is_numeric_app_id(&a.app_id) {
        return Err("appId must be 1 to 10 digits");
    }
    let path = Path::new(&a.manifest_path);
    if !path.is_absolute() {
        return Err("manifestPath must be absolute");
    }
    let expected = format!("appmanifest_{}.acf", a.app_id);
    if path.file_name().and_then(|n| n.to_str()) != Some(expected.as_str()) {
        return Err("manifestPath must name appmanifest_<appId>.acf");
    }
    let in_steamapps = path
        .parent()
        .and_then(Path::file_name)
        .and_then(|n| n.to_str())
        .is_some_and(|n| n.eq_ignore_ascii_case("steamapps"));
    if !in_steamapps {
        return Err("manifestPath must sit in a steamapps directory");
    }
    if a.baseline_content.len() as u64 > ADOPTION_ACF_MAX_BYTES {
        return Err("baselineContent is too large");
    }
    if !a.recorded_at_ms.is_finite() {
        return Err("recordedAtMs must be finite");
    }
    Ok(())
}

/// True when `current_content` is an ACF Steam itself rewrote: it differs from the baseline
/// GameLib wrote AND carries StateFlags bit 4 AND a real buildid. A placeholder (StateFlags 2 or
/// 18, buildid 0) is not adopted yet. Content only: see the module doc for why no timestamp is
/// compared.
pub fn acf_rewritten_by_steam(baseline_content: &str, current_content: &str) -> bool {
    if baseline_content == current_content {
        return false;
    }
    let read = gamelib_steamfiles::acf::read_acf_bytes(current_content.as_bytes());
    let Some(record) = read.record else {
        return false;
    };
    let fully_installed = record.state_flags.is_some_and(|f| f & 4 != 0);
    let real_buildid = record
        .buildid
        .as_deref()
        .is_some_and(|b| !b.is_empty() && b != "0");
    fully_installed && real_buildid
}

/// The current manifest text, `None` when it is missing, unreadable or over the size cap.
fn read_manifest(path: &Path) -> Option<String> {
    let meta = std::fs::metadata(path).ok()?;
    if meta.len() > ADOPTION_ACF_MAX_BYTES {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    Some(String::from_utf8_lossy(&bytes).into_owned())
}

/// The adoption transition touches no hold record (81-15 removes the hold parameter).
struct NoHoldSink;

impl HoldSink for NoHoldSink {
    fn record(&self, _: &str, _: Value, _: u64) {}
    fn clear(&self, _: &str) {}
}

type Emitted = (bool, Option<bool>);

/// What the macOS watch remembers about its helper readings for one entry. Replacing the entry
/// resets it.
#[derive(Debug, Clone, Default)]
struct HelperCache {
    /// When the helper last ran (clock ms).
    last_helper_ms: Option<u64>,
    /// The last helper answer's `loggedOn`; `None` when the helper could not answer.
    signed_in: Option<bool>,
    /// The last helper answer's install state for the app; `None` when unknown.
    helper_state: Option<u32>,
    /// A reading said Steam was signed out (the D-09 precondition).
    saw_signed_out: bool,
    /// When a reading first said signed in after `saw_signed_out`; the D-09 window opens here.
    signed_in_at_ms: Option<u64>,
    /// InstallApp was already requested for this record (D-09: at most once).
    install_app_fired: bool,
}

impl HelperCache {
    /// Whether this tick asks the helper again (D-08). Unknown or signed-out Steam is probed every
    /// tick, because sign-in is exactly what is being waited for; a signed-in Steam is re-probed
    /// when the Steam pid list changed, while a D-09 window is open, or once per
    /// [`ADOPTION_HELPER_SIGNED_IN_MIN_INTERVAL_MS`].
    fn wants_helper(&self, args: &AdoptionWatchArgs, pids_changed: bool, now_ms: u64) -> bool {
        let Some(last) = self.last_helper_ms else {
            return true;
        };
        let fallback_window_open =
            args.install_app_fallback && self.signed_in_at_ms.is_some() && !self.install_app_fired;
        self.signed_in != Some(true)
            || pids_changed
            || fallback_window_open
            || now_ms.saturating_sub(last) >= ADOPTION_HELPER_SIGNED_IN_MIN_INTERVAL_MS
    }

    /// Folds one helper answer into the cache.
    fn apply(&mut self, outcome: &AppStateOutcome, now_ms: u64) {
        self.last_helper_ms = Some(now_ms);
        match outcome {
            AppStateOutcome::Ok {
                logged_on, state, ..
            } => {
                self.signed_in = Some(*logged_on);
                self.helper_state = *state;
                if !logged_on {
                    self.saw_signed_out = true;
                    self.signed_in_at_ms = None;
                } else if self.saw_signed_out && self.signed_in_at_ms.is_none() {
                    self.signed_in_at_ms = Some(now_ms);
                }
            }
            // D-10: no answer is unknown, not signed out and not adopted.
            AppStateOutcome::SteamNotRunning | AppStateOutcome::Unavailable { .. } => {
                self.signed_in = None;
                self.helper_state = None;
            }
        }
    }
}

struct Entry {
    args: AdoptionWatchArgs,
    /// The last (adopted, signedIn) pair emitted for this entry; replacing the entry resets it.
    last: Option<Emitted>,
    /// macOS helper readings; unused elsewhere.
    helper: HelperCache,
    /// Bumped per insert, so a tick holding a snapshot of a replaced entry cannot write to or
    /// remove its replacement.
    version: u64,
}

#[derive(Default)]
struct State {
    entries: BTreeMap<String, Entry>,
    next_version: u64,
    started: bool,
    /// Bumped by every start and stop; a task clears `started` on exit only while its own
    /// generation is current (as `RunningPoll`, 80-REVIEW A/WR-07).
    gen: u64,
    /// The current task's cancel token, set in the same critical section as `started`.
    token: Option<CancellationToken>,
    /// The sorted live Steam pids the last macOS tick saw; a difference re-probes the helper.
    last_pids: Option<Vec<u32>>,
}

struct Inner {
    registry: Registry,
    outbox: Arc<Outbox>,
    platform: Platform,
    /// Unused until 81-05 (the Windows/Linux readers).
    #[allow(dead_code)]
    steam_root: Option<PathBuf>,
    state: Mutex<State>,
}

/// The adoption watcher, a boot-built instance. Cheap to clone.
#[derive(Clone)]
pub struct AdoptionWatch {
    inner: Arc<Inner>,
}

fn lock(m: &Mutex<State>) -> MutexGuard<'_, State> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn log_line(message: &str) {
    eprintln!("gamelib-steampoll: {message}");
}

impl AdoptionWatch {
    pub fn new(
        registry: Registry,
        outbox: Arc<Outbox>,
        platform: Platform,
        steam_root: Option<PathBuf>,
    ) -> Self {
        AdoptionWatch {
            inner: Arc::new(Inner {
                registry,
                outbox,
                platform,
                steam_root,
                state: Mutex::new(State::default()),
            }),
        }
    }

    /// Adds (or replaces) a watch entry and starts the task when it is not running. Replacing an
    /// entry resets its last-emitted state.
    pub fn watch(&self, args: AdoptionWatchArgs) -> Result<(), String> {
        validate_watch_args(&args).map_err(str::to_string)?;
        let started = {
            let mut st = lock(&self.inner.state);
            st.next_version += 1;
            let version = st.next_version;
            st.entries.insert(
                args.app_id.clone(),
                Entry {
                    args,
                    last: None,
                    helper: HelperCache::default(),
                    version,
                },
            );
            if st.started {
                None
            } else {
                st.started = true;
                st.gen += 1;
                // Register under the state lock so a concurrent stop cannot miss the task this
                // call spawns. Lock order is state -> registry map (as `RunningPoll::start`).
                let (token, guard) = self
                    .inner
                    .registry
                    .register(PollKind::Adoption, ADOPTION_POLL_KEY);
                if let Some(old) = st.token.replace(token.clone()) {
                    old.cancel();
                }
                Some((st.gen, token, guard))
            }
        };
        if let Some((gen, token, guard)) = started {
            let watch = self.clone();
            self.inner.registry.spawn(async move {
                let _guard = guard;
                let period = Duration::from_millis(ADOPTION_TICK_MS);
                let mut ticks = interval_at(Instant::now() + period, period);
                // A slow probe delays the next tick instead of bursting to catch up.
                ticks.set_missed_tick_behavior(MissedTickBehavior::Delay);
                loop {
                    tokio::select! {
                        _ = token.cancelled() => break,
                        _ = ticks.tick() => {
                            if !watch.tick().await {
                                break;
                            }
                        }
                    }
                }
                let mut st = lock(&watch.inner.state);
                if st.gen == gen {
                    st.started = false;
                }
            });
        }
        Ok(())
    }

    /// Removes a watch entry; false when `app_id` was not watched. The task exits when the last
    /// entry goes.
    pub fn unwatch(&self, app_id: &str) -> bool {
        let mut st = lock(&self.inner.state);
        let removed = st.entries.remove(app_id).is_some();
        if removed && st.entries.is_empty() {
            if let Some(token) = st.token.take() {
                token.cancel();
            }
            st.started = false;
            st.gen += 1;
        }
        removed
    }

    /// The watched appIds, sorted.
    pub fn watched_app_ids(&self) -> Vec<String> {
        lock(&self.inner.state).entries.keys().cloned().collect()
    }

    /// Evaluates `args` once without registering an entry or starting the task. On macOS the
    /// helper is always asked once (Play consults it before restarting Steam, RESEARCH Open
    /// Question 4); `helper_state` and `signed_in` carry its answer. Never fires InstallApp.
    pub async fn read(&self, args: &AdoptionWatchArgs) -> AdoptionReading {
        let pids = crate::hold::list_steam_client_pids(
            &**self.inner.registry.runner(),
            self.inner.platform,
        )
        .await;
        let mut cache = HelperCache::default();
        self.evaluate(args, pids.as_deref(), &mut cache, false)
            .await
    }

    /// The evidence rules, in order: Steam's ACF rewrite on every platform; on macOS, the helper
    /// reporting install-state bit 4, then the recorded `steam_osx` pid no longer being live
    /// (unless the helper definitely says the state is not 4, D-07). `cache` holds the helper
    /// readings; a fresh cache makes the helper run now.
    async fn evaluate(
        &self,
        args: &AdoptionWatchArgs,
        pids: Option<&[u32]>,
        cache: &mut HelperCache,
        pids_changed: bool,
    ) -> AdoptionReading {
        let mut reading = AdoptionReading {
            steam_running: pids.map(|p| !p.is_empty()),
            ..AdoptionReading::default()
        };
        let rewritten = read_manifest(Path::new(&args.manifest_path))
            .is_some_and(|current| acf_rewritten_by_steam(&args.baseline_content, &current));
        if rewritten {
            reading.adopted = true;
            reading.evidence = Some("acf".to_string());
            return reading;
        }
        // The helper and the pid rule are macOS only: on Windows and Linux a sign-out restarts
        // Steam without adopting anything (spikes 087 and 088, r4).
        if self.inner.platform != Platform::Darwin {
            return reading;
        }
        let now = self.inner.registry.clock().now_ms();
        if cache.wants_helper(args, pids_changed, now) {
            let outcome = read_app_state(
                &**self.inner.registry.host(),
                &**self.inner.registry.runner(),
                &args.app_id,
            )
            .await;
            cache.apply(&outcome, now);
        }
        reading.signed_in = cache.signed_in;
        reading.helper_state = cache.helper_state;
        if cache.helper_state.is_some_and(|state| state & 4 != 0) {
            reading.adopted = true;
            reading.evidence = Some("helper".to_string());
            return reading;
        }
        if args.steam_pid > 0 {
            if let Some(live) = pids {
                // D-07: the helper confirms or refutes a pid change. A definite state without
                // bit 4 means Steam restarted but has not adopted yet; no answer keeps the rule.
                let refuted = cache.helper_state.is_some();
                if !live.contains(&args.steam_pid) && !refuted {
                    reading.adopted = true;
                    reading.evidence = Some("pid".to_string());
                }
            }
        }
        reading
    }

    /// D-09, the only place InstallApp is requested: the watch saw Steam signed out, then signed
    /// in, and the app is still not adopted [`ADOPTION_INSTALLAPP_FALLBACK_DELAY_MS`] later. Once
    /// per record.
    async fn maybe_fire_install_app(
        &self,
        args: &AdoptionWatchArgs,
        version: u64,
        cache: &mut HelperCache,
    ) {
        if !args.install_app_fallback || cache.install_app_fired {
            return;
        }
        let Some(signed_in_at) = cache.signed_in_at_ms else {
            return;
        };
        let now = self.inner.registry.clock().now_ms();
        if now.saturating_sub(signed_in_at) < ADOPTION_INSTALLAPP_FALLBACK_DELAY_MS {
            return;
        }
        // Mark first and persist, so nothing can fire it a second time.
        cache.install_app_fired = true;
        self.store_cache(&args.app_id, version, cache);
        let library_root = Path::new(&args.manifest_path)
            .parent()
            .and_then(Path::parent)
            .map(|p| p.to_string_lossy().into_owned());
        let outcome = crate::update::request_steam_install_app(
            &**self.inner.registry.host(),
            &**self.inner.registry.runner(),
            &args.app_id,
            library_root.as_deref(),
        )
        .await;
        let kind = match outcome {
            crate::update::SteamInstallAppOutcome::Ok { .. } => "ok",
            crate::update::SteamInstallAppOutcome::Unavailable { .. } => "unavailable",
            crate::update::SteamInstallAppOutcome::Error { .. } => "error",
        };
        log_line(&format!(
            "adoption appId {} signed in but not adopted, requested InstallApp ({kind})",
            args.app_id
        ));
    }

    /// Writes `cache` back to the entry unless the entry was replaced or removed meanwhile.
    fn store_cache(&self, app_id: &str, version: u64, cache: &HelperCache) {
        if let Some(entry) = lock(&self.inner.state).entries.get_mut(app_id) {
            if entry.version == version {
                entry.helper = cache.clone();
            }
        }
    }

    /// One tick. Returns false when the task should exit (no entries remain).
    async fn tick(&self) -> bool {
        let snapshot: Vec<(AdoptionWatchArgs, Option<Emitted>, u64, HelperCache)> =
            lock(&self.inner.state)
                .entries
                .values()
                .map(|e| (e.args.clone(), e.last, e.version, e.helper.clone()))
                .collect();
        if !snapshot.is_empty() {
            let pids = if self.inner.platform == Platform::Darwin {
                crate::hold::list_steam_client_pids(
                    &**self.inner.registry.runner(),
                    self.inner.platform,
                )
                .await
            } else {
                None
            };
            let sorted_pids = pids.as_deref().map(|p| {
                let mut v = p.to_vec();
                v.sort_unstable();
                v
            });
            // An inconclusive probe (`None`) changes nothing: only a definite list can differ.
            let pids_changed = sorted_pids
                .as_ref()
                .is_some_and(|now| lock(&self.inner.state).last_pids.as_ref() != Some(now));
            for (args, last, version, mut cache) in snapshot {
                let reading = self
                    .evaluate(&args, pids.as_deref(), &mut cache, pids_changed)
                    .await;
                self.store_cache(&args.app_id, version, &cache);
                let pair: Emitted = (reading.adopted, reading.signed_in);
                if last != Some(pair) {
                    self.emit(&args.app_id, pair).await;
                    if let Some(entry) = lock(&self.inner.state).entries.get_mut(&args.app_id) {
                        if entry.version == version {
                            entry.last = Some(pair);
                        }
                    }
                }
                if reading.adopted {
                    log_line(&format!(
                        "adoption appId {} adopted ({})",
                        args.app_id,
                        reading.evidence.as_deref().unwrap_or("unknown")
                    ));
                    let mut st = lock(&self.inner.state);
                    if st
                        .entries
                        .get(&args.app_id)
                        .is_some_and(|e| e.version == version)
                    {
                        st.entries.remove(&args.app_id);
                    }
                } else if self.inner.platform == Platform::Darwin {
                    self.maybe_fire_install_app(&args, version, &mut cache)
                        .await;
                }
            }
            if let Some(now) = sorted_pids {
                lock(&self.inner.state).last_pids = Some(now);
            }
        }
        // Decide "empty" and clear `started` under one lock, so a watch() that lands right after
        // sees a stopped task and starts a new one instead of being orphaned.
        let mut st = lock(&self.inner.state);
        if st.entries.is_empty() {
            st.started = false;
            st.token = None;
            false
        } else {
            true
        }
    }

    async fn emit(&self, app_id: &str, (adopted, signed_in): Emitted) {
        let registry = &self.inner.registry;
        let mut title = String::new();
        apply_effects(
            &**registry.host(),
            &NoHoldSink,
            &self.inner.outbox,
            vec![Effect::Transition {
                event: StateEvent::AdoptionState {
                    app_id: app_id.to_string(),
                    seq: registry.next_event_seq(),
                    adopted,
                    signed_in,
                },
                then: Continuation::None,
            }],
            &mut title,
        )
        .await;
    }
}
