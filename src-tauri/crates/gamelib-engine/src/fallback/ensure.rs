//! `ensurePinnedEngine` and its reporting (`fallbackEngine.ts`, `pinnedEngineProgress.ts`): make a pin's
//! Wine and DXVK available, downloading what is missing, once.
//!
//! - **Single flight:** callers for one pin id share one download ([`Flights`], the TS `inFlight`
//!   map). The work runs as its own task, so a caller that leaves (a cancel, a dropped op) never stops
//!   it for the others; it is cancelled only when *every* caller who joined has aborted, or at quit.
//!   A caller that aborts while others remain is answered `aborted by caller` at once.
//! - **Order of a download (per artifact):** the download into `<root>/.tmp-<kind>-<random>/dl`, the
//!   size check, the sha256 check, `tar` into `out`, the containment walk, the pin marker, then the
//!   rename into place. A refusal at any step removes the temp directory (through the guard) and
//!   leaves nothing installed. DXVK goes first, then Wine; a Wine failure leaves DXVK installed.
//! - **Offline:** with nothing to download and the app offline the answer is `offline`; an installed
//!   pin is answered `ok` with no event at all.
//! - **Retention:** after a successful install of the current or previous pin the unpinned engines
//!   are pruned ([`super::prune`]).
//! - **D-17:** the flight holds a `shutdown.register("engine-fallback")` registrant and its cancel
//!   token is a child of the app's shutdown token, so a quit cancels the download and the temp
//!   directory is gone before the registrant is released.

use std::fs;
use std::future::pending;
use std::panic::AssertUnwindSafe;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use futures_util::FutureExt;
use serde_json::{json, Value};
use tokio::sync::watch;
use tokio_util::sync::CancellationToken;

use super::extract::{self, ExtractError};
use super::progress::{Artifact, FallbackProgress, Phase, Reporter};
use super::prune::{prune_at, remove_guarded, Removal};
use super::{verify, Env};
use crate::ctx::EngineCtx;
use crate::engines::{
    is_dxvk_installed_at, is_pinned_engine_installed_at, is_wine_installed_at, pin_engine,
    pinned_engine_paths_at, NonCrossoverEngine, PinnedEnginePaths,
};
use crate::fetch::{FetchError, FetchRequest, Progress};
use crate::pins::{pins, EnginePin, EnginePins, PinnedArtifact};

pub use crate::engines::is_pinned_engine_installed;

/// Why a pin could not be made available (`EnsureResult`'s `reason`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnsureReason {
    Offline,
    DownloadFailed,
    HashMismatch,
    ExtractFailed,
    Aborted,
}

impl EnsureReason {
    pub fn as_str(self) -> &'static str {
        match self {
            EnsureReason::Offline => "offline",
            EnsureReason::DownloadFailed => "download-failed",
            EnsureReason::HashMismatch => "hash-mismatch",
            EnsureReason::ExtractFailed => "extract-failed",
            EnsureReason::Aborted => "aborted",
        }
    }
}

/// The engine's own answer (`EnsureResult`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EnsureResult {
    Ok(PinnedEnginePaths),
    Failed {
        reason: EnsureReason,
        detail: String,
    },
}

impl EnsureResult {
    fn failed(reason: EnsureReason, detail: impl Into<String>) -> EnsureResult {
        EnsureResult::Failed {
            reason,
            detail: detail.into(),
        }
    }
}

/// What the reporting wrapper answers (`PinnedEngineResult`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PinnedEngineResult {
    Ready(NonCrossoverEngine),
    Failed {
        /// A cancel or a quit (59-REVIEW WR-01): not a download failure.
        aborted: bool,
        reason: EnsureReason,
        /// `aborted`, or `<reason> <detail>`.
        error: String,
    },
}

impl PinnedEngineResult {
    /// The sidecar's shape: `{ok: true, engine}` or `{ok: false, aborted, reason, error}`.
    pub fn to_value(&self) -> Value {
        match self {
            PinnedEngineResult::Ready(engine) => json!({
                "ok": true,
                "engine": serde_json::to_value(engine).unwrap_or(Value::Null),
            }),
            PinnedEngineResult::Failed {
                aborted,
                reason,
                error,
            } => json!({
                "ok": false,
                "aborted": aborted,
                "reason": reason.as_str(),
                "error": error,
            }),
        }
    }
}

/// What `engine_fallback_ensure` is asked.
#[derive(Debug, Clone)]
pub struct EnsureArgs {
    pub pin_id: String,
    pub app_name: String,
    pub runner: String,
    /// Names the run for `engine_cancel` (an `AbortSignal` cannot cross `rustInvoke`).
    pub cancel_id: Option<String>,
}

/// A hook that sees the engine's raw progress (the tests read it; the shell does not need it).
pub type Tap = Arc<dyn Fn(&FallbackProgress) + Send + Sync>;

/// One caller of [`ensure_pinned_engine_in`].
#[derive(Clone, Default)]
pub struct Caller {
    pub app_name: String,
    pub runner: String,
    /// The caller's own signal. Cancelling it aborts this caller; the shared download stops only when
    /// every caller has.
    pub cancel: Option<CancellationToken>,
    pub tap: Option<Tap>,
}

type Listener = Arc<dyn Fn(&FallbackProgress) + Send + Sync>;

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

struct Slot {
    token: Option<CancellationToken>,
    listener: Option<Listener>,
    /// This caller has aborted or gone away.
    left: bool,
}

impl Slot {
    fn aborted(&self) -> bool {
        self.left || self.token.as_ref().is_some_and(|t| t.is_cancelled())
    }
}

/// One download in flight: the callers who joined, the token that stops it and the answer.
struct Flight {
    cancel: CancellationToken,
    slots: Mutex<Vec<Slot>>,
    result: watch::Sender<Option<EnsureResult>>,
}

impl Flight {
    /// Every caller who joined has aborted. The TS counted aborts against joins, so a caller who never
    /// had a signal keeps the flight alive.
    fn all_aborted(&self) -> bool {
        let slots = lock(&self.slots);
        !slots.is_empty() && slots.iter().all(Slot::aborted)
    }

    /// The flight must stop: the quit fired, or every caller aborted. Trips the flight's own token the
    /// moment it finds the second, so a stage that polls this sees the same answer the TS's
    /// synchronous `controller.abort()` gave.
    fn check_stop(&self) -> bool {
        if !self.cancel.is_cancelled() && self.all_aborted() {
            self.cancel.cancel();
        }
        self.cancel.is_cancelled()
    }

    fn emit(&self, p: &FallbackProgress) {
        let listeners: Vec<Listener> = lock(&self.slots)
            .iter()
            .filter(|s| !s.left)
            .filter_map(|s| s.listener.clone())
            .collect();
        for listener in listeners {
            listener(p);
        }
    }

    /// The caller in `slot` aborted. `true` when the caller is answered at once (others still wait on
    /// the download); `false` when it was the last and so waits for the flight to settle.
    fn note_abort(&self, slot: usize) -> bool {
        {
            let mut slots = lock(&self.slots);
            if let Some(s) = slots.get_mut(slot) {
                s.left = true;
                s.listener = None;
            }
        }
        if self.all_aborted() {
            self.cancel.cancel();
            false
        } else {
            true
        }
    }
}

/// The downloads in flight by pin id and the artifact installs holding a `.tmp-*` directory. In
/// memory only: empty at construction.
#[derive(Clone, Default)]
pub struct Flights {
    inner: Arc<FlightsInner>,
}

#[derive(Default)]
struct FlightsInner {
    map: Mutex<std::collections::HashMap<String, Arc<Flight>>>,
    installs: AtomicUsize,
}

impl Flights {
    pub fn new() -> Flights {
        Flights::default()
    }

    /// The number of downloads in flight.
    pub fn in_flight(&self) -> usize {
        lock(&self.inner.map).len()
    }

    /// The artifact installs currently holding a `.tmp-*` directory (prune must not touch them).
    pub fn active_installs(&self) -> usize {
        self.inner.installs.load(Ordering::SeqCst)
    }

    /// Joins the flight for `pin_id`, creating it when there is none. `true` in the last place when
    /// this caller started it.
    fn join(
        &self,
        pin_id: &str,
        shutdown: &gamelib_core::shutdown::Shutdown,
        token: Option<CancellationToken>,
        listener: Listener,
    ) -> (Arc<Flight>, usize, bool) {
        let mut map = lock(&self.inner.map);
        let (flight, leader) = match map.get(pin_id) {
            Some(flight) => (flight.clone(), false),
            None => {
                let flight = Arc::new(Flight {
                    cancel: shutdown.token().child_token(),
                    slots: Mutex::new(Vec::new()),
                    result: watch::channel(None).0,
                });
                map.insert(pin_id.to_string(), flight.clone());
                (flight, true)
            }
        };
        let mut slots = lock(&flight.slots);
        slots.push(Slot {
            token,
            listener: Some(listener),
            left: false,
        });
        let index = slots.len() - 1;
        drop(slots);
        drop(map);
        (flight, index, leader)
    }

    fn remove(&self, pin_id: &str, flight: &Arc<Flight>) {
        let mut map = lock(&self.inner.map);
        if map.get(pin_id).is_some_and(|f| Arc::ptr_eq(f, flight)) {
            map.remove(pin_id);
        }
    }

    pub(crate) fn install_guard(&self) -> InstallGuard {
        self.inner.installs.fetch_add(1, Ordering::SeqCst);
        InstallGuard(self.inner.clone())
    }
}

pub(crate) struct InstallGuard(Arc<FlightsInner>);

impl Drop for InstallGuard {
    fn drop(&mut self) {
        self.0.installs.fetch_sub(1, Ordering::SeqCst);
    }
}

/// A caller that is dropped before its answer counts as having aborted.
struct LeaveOnDrop {
    flight: Arc<Flight>,
    slot: usize,
    armed: bool,
}

impl Drop for LeaveOnDrop {
    fn drop(&mut self) {
        if self.armed {
            self.flight.note_abort(self.slot);
        }
    }
}

/// `engine_fallback_ensure`: the pin the shared table ships under `args.pin_id`, made available with
/// the status events of every store. `Err` is an unknown pin or a bad cancel id.
pub async fn ensure_pinned_engine(
    ctx: &EngineCtx,
    args: &EnsureArgs,
) -> Result<PinnedEngineResult, String> {
    let table = pins().map_err(|e| e.to_string())?;
    let pin = crate::ids::pin_by_id(&args.pin_id).ok_or("unknown-pin")?;
    let registered = match args.cancel_id.as_deref() {
        None => None,
        Some(id) => Some(ctx.cancels.register(id).ok_or("bad-cancel-id")?),
    };
    let caller = Caller {
        app_name: args.app_name.clone(),
        runner: args.runner.clone(),
        cancel: registered.as_ref().map(|(token, _)| token.clone()),
        tap: None,
    };
    let result = ensure_pinned_engine_in(ctx, table, pin, caller).await;
    drop(registered);
    Ok(result)
}

/// [`ensure_pinned_engine`] over a pin table the caller names (the goldens' synthetic pins).
/// `table` decides which pins a successful install prunes around.
pub async fn ensure_pinned_engine_in(
    ctx: &EngineCtx,
    table: &EnginePins,
    pin: &EnginePin,
    caller: Caller,
) -> PinnedEngineResult {
    ensure_pinned_engine_detailed(ctx, table, pin, caller)
        .await
        .1
}

/// [`ensure_pinned_engine_in`] with the engine's raw answer as well (the reporting wrapper drops the
/// detail of an abort; the goldens compare it).
pub async fn ensure_pinned_engine_detailed(
    ctx: &EngineCtx,
    table: &EnginePins,
    pin: &EnginePin,
    caller: Caller,
) -> (EnsureResult, PinnedEngineResult) {
    let reporter = Reporter::new(ctx.emitter.clone(), &caller.app_name, &caller.runner, pin);
    let listener: Listener = {
        let reporter = reporter.clone();
        let tap = caller.tap.clone();
        Arc::new(move |p| {
            if let Some(tap) = &tap {
                tap(p);
            }
            reporter.on_progress(p);
        })
    };
    let raw = ensure_raw(Env::from_ctx(ctx), table, pin, caller.cancel, listener).await;
    let reported = match &raw {
        EnsureResult::Ok(_) => {
            reporter.ready();
            PinnedEngineResult::Ready(pin_engine(ctx, pin))
        }
        EnsureResult::Failed {
            reason: EnsureReason::Aborted,
            ..
        } => {
            reporter.aborted(ctx.log.as_deref());
            PinnedEngineResult::Failed {
                aborted: true,
                reason: EnsureReason::Aborted,
                error: "aborted".to_string(),
            }
        }
        EnsureResult::Failed { reason, detail } => {
            reporter.failed(ctx.log.as_deref(), reason.as_str());
            PinnedEngineResult::Failed {
                aborted: false,
                reason: *reason,
                error: format!("{} {detail}", reason.as_str()),
            }
        }
    };
    (raw, reported)
}

/// `ensurePinnedEngine`: the engine's raw answer, with `listener` seeing its progress.
pub async fn ensure_raw(
    env: Env,
    table: &EnginePins,
    pin: &EnginePin,
    cancel: Option<CancellationToken>,
    listener: Listener,
) -> EnsureResult {
    let (flight, slot, leader) = env
        .flights
        .join(&pin.id, &env.shutdown, cancel.clone(), listener);
    if leader {
        tokio::spawn(run_flight(
            env.clone(),
            table.clone(),
            pin.clone(),
            flight.clone(),
        ));
    }
    let mut leave = LeaveOnDrop {
        flight: flight.clone(),
        slot,
        armed: true,
    };
    let mut rx = flight.result.subscribe();
    let mut noted = false;
    let result = loop {
        if !noted && cancel.as_ref().is_some_and(|c| c.is_cancelled()) {
            noted = true;
            if flight.note_abort(slot) {
                break EnsureResult::failed(EnsureReason::Aborted, "aborted by caller");
            }
        }
        tokio::select! {
            settled = rx.wait_for(|v| v.is_some()) => {
                break match settled {
                    Ok(value) => value
                        .clone()
                        .unwrap_or_else(|| EnsureResult::failed(EnsureReason::DownloadFailed, "no result")),
                    Err(_) => EnsureResult::failed(EnsureReason::DownloadFailed, "the download ended unexpectedly"),
                };
            }
            _ = async {
                match &cancel {
                    Some(token) if !noted => token.cancelled().await,
                    _ => pending::<()>().await,
                }
            } => {}
        }
    };
    leave.armed = false;
    result
}

/// The task of one flight. It holds the exit registrant until the temp directory is gone.
async fn run_flight(env: Env, table: EnginePins, pin: EnginePin, flight: Arc<Flight>) {
    let _registrant = env.shutdown.register("engine-fallback");
    let outcome = AssertUnwindSafe(do_ensure(&env, &table, &pin, &flight))
        .catch_unwind()
        .await;
    let result = outcome
        .unwrap_or_else(|_| EnsureResult::failed(EnsureReason::DownloadFailed, "internal-error"));
    env.flights.remove(&pin.id, &flight);
    flight.result.send_replace(Some(result));
}

/// A stage's refusal.
struct Stage {
    reason: EnsureReason,
    detail: String,
}

impl Stage {
    fn new(reason: EnsureReason, detail: impl Into<String>) -> Stage {
        Stage {
            reason,
            detail: detail.into(),
        }
    }

    fn io(error: std::io::Error) -> Stage {
        Stage::new(EnsureReason::DownloadFailed, error.kind().to_string())
    }
}

async fn do_ensure(
    env: &Env,
    table: &EnginePins,
    pin: &EnginePin,
    flight: &Arc<Flight>,
) -> EnsureResult {
    let root = env.root_text();
    let paths = pinned_engine_paths_at(&root, pin);
    if is_pinned_engine_installed_at(&root, pin) {
        return EnsureResult::Ok(paths);
    }
    if !env.online.load(Ordering::Acquire) {
        return EnsureResult::failed(EnsureReason::Offline, "no network connection");
    }
    if !is_dxvk_installed_at(&root, pin) {
        if let Err(stage) = install_artifact(
            env,
            flight,
            Artifact::Dxvk,
            &pin.dxvk,
            Path::new(&paths.dxvk_dir),
        )
        .await
        {
            return EnsureResult::failed(stage.reason, stage.detail);
        }
    }
    if !is_wine_installed_at(&root, pin) {
        if let Err(stage) = install_artifact(
            env,
            flight,
            Artifact::Wine,
            &pin.wine,
            Path::new(&paths.wine_dir),
        )
        .await
        {
            return EnsureResult::failed(stage.reason, stage.detail);
        }
    }
    if pin.id == table.current.id || table.previous.as_ref().is_some_and(|p| p.id == pin.id) {
        prune_at(env, table);
    }
    EnsureResult::Ok(paths)
}

/// `mkdtemp(<root>/.tmp-<kind>-)`: a fresh directory, mode 0700 on unix.
fn make_temp(root: &Path, kind: &str) -> std::io::Result<PathBuf> {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    const ALPHABET: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    for attempt in 0u64..64 {
        let mut hasher = RandomState::new().build_hasher();
        hasher.write_u64(attempt);
        let mut n = hasher.finish();
        let suffix: String = (0..6)
            .map(|_| {
                let c = ALPHABET[(n % ALPHABET.len() as u64) as usize] as char;
                n /= ALPHABET.len() as u64;
                c
            })
            .collect();
        let path = root.join(format!(".tmp-{kind}-{suffix}"));
        match fs::create_dir(&path) {
            Ok(()) => {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    fs::set_permissions(&path, fs::Permissions::from_mode(0o700))?;
                }
                return Ok(path);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
    Err(std::io::Error::from(std::io::ErrorKind::AlreadyExists))
}

async fn install_artifact(
    env: &Env,
    flight: &Arc<Flight>,
    kind: Artifact,
    artifact: &PinnedArtifact,
    final_dir: &Path,
) -> Result<(), Stage> {
    fs::create_dir_all(&env.root).map_err(Stage::io)?;
    let _guard = env.flights.install_guard();
    let tmp = make_temp(&env.root, kind.as_str()).map_err(Stage::io)?;
    let result = install_in(env, flight, kind, artifact, final_dir, &tmp).await;
    // Always: a refusal, a cancel and a success all leave no `.tmp-*` behind (the success moved `out`).
    remove_guarded(env, &tmp);
    result
}

async fn install_in(
    env: &Env,
    flight: &Arc<Flight>,
    kind: Artifact,
    artifact: &PinnedArtifact,
    final_dir: &Path,
    tmp: &Path,
) -> Result<(), Stage> {
    let name = kind.as_str();
    let aborted = |detail: &str| Stage::new(EnsureReason::Aborted, detail);
    let emit = |phase: Phase, percentage: Option<f64>| {
        flight.emit(&FallbackProgress {
            phase,
            artifact: kind,
            percentage,
        });
    };
    if flight.check_stop() {
        return Err(aborted("aborted"));
    }
    let dl = tmp.join("dl");
    let out = tmp.join("out");
    fs::create_dir(&dl).map_err(Stage::io)?;
    fs::create_dir(&out).map_err(Stage::io)?;
    let archive = dl.join(&artifact.archive_name);

    env.info(&format!("Engine: downloading {name} {}", artifact.version));
    emit(Phase::Downloading, Some(0.0));
    let progress = {
        let flight = flight.clone();
        move |p: Progress| {
            flight.emit(&FallbackProgress {
                phase: Phase::Downloading,
                artifact: kind,
                percentage: Some(p.percentage),
            });
            flight.check_stop();
        }
    };
    let request = FetchRequest::get(&artifact.url).gamelib_agent(&env.app_version);
    if let Err(error) = env
        .fetch
        .download(request, &archive, &progress, flight.cancel.clone())
        .await
    {
        let reason = if error == FetchError::Aborted || flight.check_stop() {
            EnsureReason::Aborted
        } else {
            EnsureReason::DownloadFailed
        };
        return Err(Stage::new(reason, error.to_string()));
    }
    if flight.check_stop() {
        return Err(aborted("aborted"));
    }

    if !verify::size_matches(&archive, artifact.size) {
        return Err(Stage::new(
            EnsureReason::HashMismatch,
            format!("{name}: unexpected archive size"),
        ));
    }
    env.info(&format!("Engine: verifying {name}"));
    emit(Phase::Verifying, None);
    let hashed = {
        let archive = archive.clone();
        let cancel = flight.cancel.clone();
        tokio::task::spawn_blocking(move || verify::sha256_file(&archive, &cancel)).await
    };
    let digest = match hashed {
        Ok(Ok(digest)) => digest,
        _ => return Err(Stage::new(EnsureReason::DownloadFailed, "unreadable")),
    };
    if flight.check_stop() || digest.is_none() {
        return Err(aborted("aborted during verify"));
    }
    if digest.as_deref() != Some(artifact.sha256.as_str()) {
        let _ = fs::remove_file(&archive);
        return Err(Stage::new(
            EnsureReason::HashMismatch,
            format!("{name}: sha256 mismatch"),
        ));
    }

    env.info(&format!("Engine: extracting {name}"));
    emit(Phase::Extracting, None);
    let extracted =
        extract::extract_contained(env.proc.as_ref(), &archive, &out, || flight.check_stop()).await;
    match extracted {
        Ok(()) => {}
        Err(ExtractError::Stopped) => return Err(aborted("aborted during extract")),
        Err(ExtractError::TarFailed) => {
            env.error("Engine: tar exited with an error");
            return Err(Stage::new(
                EnsureReason::ExtractFailed,
                format!("{name}: tar failed"),
            ));
        }
        Err(ExtractError::Escape(text) | ExtractError::Unreadable(text)) => {
            return Err(Stage::new(EnsureReason::ExtractFailed, text));
        }
    }
    crate::bottles::pin_marker::write(&out, &artifact.sha256, &artifact.version)
        .map_err(Stage::io)?;
    if flight.check_stop() {
        return Err(aborted("aborted before install"));
    }
    if fs::symlink_metadata(final_dir).is_ok() && remove_guarded(env, final_dir) != Removal::Removed
    {
        return Err(Stage::new(
            EnsureReason::DownloadFailed,
            "the existing engine directory could not be replaced",
        ));
    }
    fs::rename(&out, final_dir).map_err(Stage::io)
}
