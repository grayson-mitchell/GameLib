//! The per-game bottle every game on the bottle runtime gets (Phase 87, SVC-02, ported from
//! `perGameBottle.ts`'s `ensureOnce` and `createPerGameBottleFlights`, replayed against the 87-11
//! `ensure` goldens): created once, with CrossOver when the caller's decision and CrossOver allow it,
//! otherwise with the built-in engine.
//!
//! - **Name:** [`per_game_bottle_name`] is [`crate::game_engine`]'s one function, re-exported so the
//!   bottle modules name a single place; the shared twin vectors pin it against the TS one.
//! - **Decision (D-06):** the creation engine arrives as a value ([`CreationDecision`]), as does every
//!   other TS callback ([`PerGameDeps`]): where CrossOver lives, how the pinned engine is made available
//!   and the global settings the DXVK step builds over. The decision engine itself is a later plan's.
//! - **Single flight:** concurrent callers for one bottle name share one creation ([`PerGameFlights`],
//!   the TS `inFlight` map); once it settles a new call starts a new flight. A caller that arrives
//!   while a flight is running waits for the leader's answer; a leader that is dropped mid-flight
//!   (the app shutting down) leaves the followers to start their own.
//! - **Fallback:** a CrossOver creation that fails (anything but a cancel) is retried with the current
//!   pin's built-in engine; a cancelled one is final.

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use gamelib_core::process::BoxFuture;
use serde_json::{json, Value};
use tokio::sync::watch;
use tokio_util::sync::CancellationToken;

use super::conf::random_bottle_id;
use super::fallback_bottle::create_fallback_bottle_with;
use super::lifecycle::{
    create_crossover_bottle, CreateOptions, CX_CREATE_CAP_MS, PROVISION_ABORTED,
};
use super::paths::is_clean_bottle_name;
use crate::ctx::EngineCtx;
use crate::engines::{is_bottle_provisioned, NonCrossoverEngine};
use crate::fallback::ensure::{
    ensure_pinned_engine, EnsureArgs as FallbackEnsureArgs, PinnedEngineResult,
};
use crate::pins::{pins, EnginePin};

pub use crate::game_engine::per_game_bottle_name;

/// `ENGINE_DOWNLOAD_FAILED`: the pinned engine could not be made available.
pub const ENGINE_DOWNLOAD_FAILED: &str = "engine-download-failed";

/// What the decision says to create the bottle with (`decideCreationEngine`'s answer).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CreationDecision {
    /// CrossOver, capped at `create_timeout`.
    Crossover { create_timeout: Duration },
    /// The built-in engine of this pin.
    Pinned { pin: Box<EnginePin> },
}

/// How the pinned engine was made available (`PinnedEngineResult`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PinOutcome {
    Ready(NonCrossoverEngine),
    /// The download was cancelled.
    Aborted,
    /// It could not be made available: the error text.
    Failed(String),
}

/// Which game the bottle is for, and the cancel token of the creation.
#[derive(Debug, Clone)]
pub struct EnsureArgs {
    /// The engine key of the title (the decision's input).
    pub key: String,
    pub bottle_name: String,
    pub app_name: String,
    pub runner: String,
    /// Cancelling it stops the creation and cleans what it made. `None`: only an app shutdown does.
    pub cancel: Option<CancellationToken>,
}

/// The TS callbacks of `PerGameBottleDeps`, as the context supplies them or a caller passes them.
pub trait PerGameDeps: Send + Sync {
    /// `decide`: which engine creates this title's bottle.
    fn decide(&self, key: &str) -> BoxFuture<CreationDecision>;
    /// `resolveBinDir`: CrossOver's `bin` directory, `None` when it cannot be found.
    fn resolve_bin_dir(&self) -> BoxFuture<Option<String>>;
    /// `ensurePin`: makes the pin's engine available (downloading it when absent). The future may
    /// borrow the deps, so a context-backed implementation can run the download through its context.
    fn ensure_pin<'a>(
        &'a self,
        pin: EnginePin,
        args: &'a EnsureArgs,
    ) -> Pin<Box<dyn Future<Output = PinOutcome> + Send + 'a>>;
    /// `currentPin`: the pin a fallback creation uses. `None` when the table cannot be read.
    fn current_pin(&self) -> Option<EnginePin>;
    /// `globalGameSettings`: the settings the DXVK step's fallback settings are built over.
    fn global_game_settings(&self) -> Value;
    /// The BottleID a fallback creation writes into `cxbottle.conf`: random, unless a test fixes it.
    fn new_bottle_id(&self) -> String {
        random_bottle_id()
    }
}

/// What the ensure answered (`EnsureGameBottleResult`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EnsureOutcome {
    Done {
        created_here: bool,
        engine: EnsureEngine,
    },
    Failed {
        error_code: Option<&'static str>,
        error: String,
    },
}

/// The engine that made the bottle (`engine`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnsureEngine {
    Crossover,
    Pinned,
    /// The bottle was already provisioned: nothing was created.
    Existing,
}

impl EnsureEngine {
    pub fn as_str(self) -> &'static str {
        match self {
            EnsureEngine::Crossover => "crossover",
            EnsureEngine::Pinned => "pinned",
            EnsureEngine::Existing => "existing",
        }
    }
}

impl EnsureOutcome {
    fn failed(error_code: Option<&'static str>, error: impl Into<String>) -> EnsureOutcome {
        EnsureOutcome::Failed {
            error_code,
            error: error.into(),
        }
    }

    /// The sidecar's shape: `{status: 'done', createdHere, engine}` or `{status: 'error', errorCode?, error}`.
    pub fn to_value(&self) -> Value {
        match self {
            EnsureOutcome::Done {
                created_here,
                engine,
            } => json!({"status": "done", "createdHere": created_here, "engine": engine.as_str()}),
            EnsureOutcome::Failed { error_code, error } => {
                let mut out = json!({"status": "error"});
                if let Some(code) = error_code {
                    out["errorCode"] = json!(code);
                }
                out["error"] = json!(error);
                out
            }
        }
    }
}

type Flight = watch::Receiver<Option<EnsureOutcome>>;

/// The in-flight creations by bottle name (`createPerGameBottleFlights`'s map). In memory only: empty
/// at construction.
#[derive(Debug, Default)]
pub struct PerGameFlights {
    flights: Mutex<HashMap<String, Flight>>,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

impl PerGameFlights {
    pub fn new() -> PerGameFlights {
        PerGameFlights::default()
    }

    /// The number of creations in flight.
    pub fn in_flight(&self) -> usize {
        lock(&self.flights).len()
    }
}

/// Removes the leader's entry when its flight ends, however it ends (done, or the future dropped).
struct LeaderGuard<'a> {
    flights: &'a PerGameFlights,
    name: &'a str,
}

impl Drop for LeaderGuard<'_> {
    fn drop(&mut self) {
        lock(&self.flights.flights).remove(self.name);
    }
}

fn warn(ctx: &EngineCtx, line: &str) {
    if let Some(log) = ctx.log.as_deref() {
        log.warn(line);
    }
}

/// `ensureGameBottle`: creates the game's bottle once (idempotent; concurrent callers share one
/// creation). An unsafe name answers an error before any flight starts.
pub async fn ensure_per_game_bottle(
    ctx: &EngineCtx,
    deps: &dyn PerGameDeps,
    args: &EnsureArgs,
) -> EnsureOutcome {
    let name = args.bottle_name.as_str();
    if !is_clean_bottle_name(name) {
        return EnsureOutcome::failed(None, format!("Invalid bottle name: \"{name}\""));
    }
    loop {
        let leader = {
            let mut flights = lock(&ctx.flights.flights);
            match flights.get(name) {
                Some(running) => Err(running.clone()),
                None => {
                    let (sender, receiver) = watch::channel(None);
                    flights.insert(name.to_string(), receiver);
                    Ok(sender)
                }
            }
        };
        match leader {
            Err(mut running) => {
                let settled = running.wait_for(Option::is_some).await.map(|r| r.clone());
                if let Ok(Some(outcome)) = settled {
                    return outcome;
                }
                // The leader was dropped before it answered: start a flight of our own.
            }
            Ok(sender) => {
                let _guard = LeaderGuard {
                    flights: &ctx.flights,
                    name,
                };
                let outcome = ensure_once(ctx, deps, args).await;
                let _ = sender.send(Some(outcome.clone()));
                return outcome;
            }
        }
    }
}

async fn ensure_once(ctx: &EngineCtx, deps: &dyn PerGameDeps, args: &EnsureArgs) -> EnsureOutcome {
    let name = args.bottle_name.as_str();
    if is_bottle_provisioned(ctx, name) {
        return EnsureOutcome::Done {
            created_here: false,
            engine: EnsureEngine::Existing,
        };
    }
    let create_timeout = match deps.decide(&args.key).await {
        CreationDecision::Pinned { pin } => return create_with_pinned(ctx, deps, args, *pin).await,
        CreationDecision::Crossover { create_timeout } => create_timeout,
    };
    let Some(bin_dir) = deps.resolve_bin_dir().await else {
        return match deps.current_pin() {
            Some(pin) => create_with_pinned(ctx, deps, args, pin).await,
            None => EnsureOutcome::failed(None, "the engine pin table cannot be read"),
        };
    };
    let opts = CreateOptions {
        create_timeout,
        cancel: args.cancel.clone(),
    };
    let made = create_crossover_bottle(ctx, name, &bin_dir, &opts).await;
    if made.done {
        return EnsureOutcome::Done {
            created_here: made.created_here.unwrap_or(false),
            engine: EnsureEngine::Crossover,
        };
    }
    if made.error_code == Some(PROVISION_ABORTED) {
        return EnsureOutcome::failed(
            Some(PROVISION_ABORTED),
            made.error.unwrap_or_else(|| "cancelled".to_string()),
        );
    }
    // 59 WR-02/WR-03: a CrossOver create failure routes to the built-in engine.
    warn(
        ctx,
        &format!(
            "ensureGameBottle: CrossOver create failed for \"{name}\" ({}); using the built-in engine",
            made.error_code.unwrap_or("unknown")
        ),
    );
    match deps.current_pin() {
        Some(pin) => create_with_pinned(ctx, deps, args, pin).await,
        None => EnsureOutcome::failed(None, "the engine pin table cannot be read"),
    }
}

async fn create_with_pinned(
    ctx: &EngineCtx,
    deps: &dyn PerGameDeps,
    args: &EnsureArgs,
    pin: EnginePin,
) -> EnsureOutcome {
    let engine = match deps.ensure_pin(pin, args).await {
        PinOutcome::Ready(engine) => engine,
        PinOutcome::Aborted => {
            return EnsureOutcome::failed(Some(PROVISION_ABORTED), "bottle creation cancelled")
        }
        PinOutcome::Failed(error) => {
            return EnsureOutcome::failed(Some(ENGINE_DOWNLOAD_FAILED), error)
        }
    };
    let made = create_fallback_bottle_with(
        ctx,
        &args.bottle_name,
        &engine,
        &deps.global_game_settings(),
        args.cancel.as_ref(),
        &|| deps.new_bottle_id(),
    )
    .await;
    if !made.done {
        return EnsureOutcome::failed(
            made.error_code,
            made.error
                .unwrap_or_else(|| "bottle creation failed".to_string()),
        );
    }
    EnsureOutcome::Done {
        created_here: made.created_here.unwrap_or(false),
        engine: EnsureEngine::Pinned,
    }
}

/// The deps a context supplies on its own: CrossOver where `ctx.crossover_bin_dir` finds it, the pin as
/// the table's current one, and the pinned engine made available through the fallback engine's own
/// download (`ensure_pinned_engine`: single flight, progress, hash check, shutdown). The decision is
/// the caller's.
pub struct CtxPerGameDeps<'a> {
    ctx: &'a EngineCtx,
    decision: CreationDecision,
    global_settings: Value,
}

impl<'a> CtxPerGameDeps<'a> {
    pub fn new(
        ctx: &'a EngineCtx,
        decision: CreationDecision,
        global_settings: Value,
    ) -> CtxPerGameDeps<'a> {
        CtxPerGameDeps {
            ctx,
            decision,
            global_settings,
        }
    }
}

impl PerGameDeps for CtxPerGameDeps<'_> {
    fn decide(&self, _key: &str) -> BoxFuture<CreationDecision> {
        let decision = self.decision.clone();
        Box::pin(async move { decision })
    }

    fn resolve_bin_dir(&self) -> BoxFuture<Option<String>> {
        (self.ctx.crossover_bin_dir)()
    }

    fn ensure_pin<'a>(
        &'a self,
        pin: EnginePin,
        args: &'a EnsureArgs,
    ) -> Pin<Box<dyn Future<Output = PinOutcome> + Send + 'a>> {
        Box::pin(async move {
            let request = FallbackEnsureArgs {
                pin_id: pin.id.clone(),
                app_name: args.app_name.clone(),
                runner: args.runner.clone(),
                cancel_id: None,
            };
            match ensure_pinned_engine(self.ctx, &request).await {
                Ok(PinnedEngineResult::Ready(engine)) => PinOutcome::Ready(engine),
                Ok(PinnedEngineResult::Failed { aborted: true, .. }) => PinOutcome::Aborted,
                Ok(PinnedEngineResult::Failed { error, .. }) => PinOutcome::Failed(error),
                Err(error) => PinOutcome::Failed(error),
            }
        })
    }

    fn current_pin(&self) -> Option<EnginePin> {
        pins().ok().map(|table| table.current.clone())
    }

    fn global_game_settings(&self) -> Value {
        self.global_settings.clone()
    }
}

/// The cap a `Crossover` decision carries when the caller gives none (`CX_CREATE_CAP_MS`).
pub fn default_create_timeout() -> Duration {
    Duration::from_millis(CX_CREATE_CAP_MS)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ctx::{EnginePaths, Platform};
    use crate::ids::pin_by_id;
    use futures_util::FutureExt;
    use gamelib_core::clock::SystemClock;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    fn ctx(home: &FakeHome) -> EngineCtx {
        let root = home.root().to_path_buf();
        EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Mac,
            EnginePaths {
                app_folder: root.clone(),
                user_data: root.clone(),
                tools_path: root.join("tools"),
                user_home: root.join("home"),
                temp: root.join("temp"),
            },
            Shutdown::new(),
        )
    }

    fn args(bottle: &str) -> EnsureArgs {
        EnsureArgs {
            key: "gog:1".to_string(),
            bottle_name: bottle.to_string(),
            app_name: "1".to_string(),
            runner: "gog".to_string(),
            cancel: None,
        }
    }

    /// A decision that never answers the first time it is asked, and a pin that cannot be made
    /// available: enough to hold a flight open and then settle it.
    struct Hold {
        asked: AtomicUsize,
    }

    impl PerGameDeps for Hold {
        fn decide(&self, _key: &str) -> BoxFuture<CreationDecision> {
            let first = self.asked.fetch_add(1, Ordering::SeqCst) == 0;
            let pin = pin_by_id(&pins().unwrap().current.id).unwrap().clone();
            if first {
                Box::pin(std::future::pending())
            } else {
                Box::pin(async move { CreationDecision::Pinned { pin: Box::new(pin) } })
            }
        }

        fn resolve_bin_dir(&self) -> BoxFuture<Option<String>> {
            Box::pin(async { None })
        }

        fn ensure_pin<'a>(
            &'a self,
            _pin: EnginePin,
            _args: &'a EnsureArgs,
        ) -> Pin<Box<dyn Future<Output = PinOutcome> + Send + 'a>> {
            Box::pin(async { PinOutcome::Failed("offline".to_string()) })
        }

        fn current_pin(&self) -> Option<EnginePin> {
            pins().ok().map(|t| t.current.clone())
        }

        fn global_game_settings(&self) -> Value {
            json!({})
        }
    }

    #[tokio::test]
    async fn an_unsafe_name_answers_an_error_before_a_flight_starts() {
        let home = FakeHome::new("engine-pergame-");
        let ctx = ctx(&home);
        let deps = Hold {
            asked: AtomicUsize::new(0),
        };
        let out = ensure_per_game_bottle(&ctx, &deps, &args("a/b")).await;
        assert_eq!(
            out,
            EnsureOutcome::failed(None, "Invalid bottle name: \"a/b\"")
        );
        assert_eq!(deps.asked.load(Ordering::SeqCst), 0);
        assert_eq!(ctx.flights.in_flight(), 0);
    }

    #[tokio::test]
    async fn a_follower_waits_for_the_leader_and_a_dropped_leader_leaves_it_a_flight_of_its_own() {
        let home = FakeHome::new("engine-pergame-");
        let ctx = ctx(&home);
        let deps = Hold {
            asked: AtomicUsize::new(0),
        };
        let a = args("GameLib-gog-1");
        // The leader holds the flight open (its decision never answers); a second caller waits on it.
        let mut leader = Box::pin(ensure_per_game_bottle(&ctx, &deps, &a));
        assert!(leader.as_mut().now_or_never().is_none());
        assert_eq!(ctx.flights.in_flight(), 1);
        let mut follower = Box::pin(ensure_per_game_bottle(&ctx, &deps, &a));
        assert!(follower.as_mut().now_or_never().is_none());
        assert_eq!(
            deps.asked.load(Ordering::SeqCst),
            1,
            "one creation, not two"
        );
        // The leader goes away (the app is shutting down): the follower starts its own flight, which
        // settles, and nothing is left in the map.
        drop(leader);
        assert_eq!(ctx.flights.in_flight(), 0);
        let out = follower.await;
        assert_eq!(
            out,
            EnsureOutcome::failed(Some(ENGINE_DOWNLOAD_FAILED), "offline")
        );
        assert_eq!(deps.asked.load(Ordering::SeqCst), 2);
        assert_eq!(ctx.flights.in_flight(), 0);
    }

    #[tokio::test]
    async fn the_contexts_deps_make_a_pin_available_through_the_fallback_download() {
        let home = FakeHome::new("engine-pergame-");
        let ctx = ctx(&home);
        let pin = pins().unwrap().current.clone();
        let deps = CtxPerGameDeps::new(
            &ctx,
            CreationDecision::Pinned { pin: Box::new(pin) },
            json!({}),
        );
        // The context starts offline (the monitor's first reading), so the download is refused before any
        // request: the answer is the engine's own `offline` failure, not a silent fetch.
        let out = ensure_per_game_bottle(&ctx, &deps, &args("GameLib-gog-1")).await;
        let EnsureOutcome::Failed { error_code, error } = &out else {
            panic!("expected a failure, got {out:?}");
        };
        assert_eq!(*error_code, Some(ENGINE_DOWNLOAD_FAILED));
        assert!(error.starts_with("offline"), "{error}");
        // The wire shape the sidecar's `EnsureGameBottleResult` has.
        assert_eq!(
            out.to_value(),
            json!({"status": "error", "errorCode": "engine-download-failed", "error": error})
        );
        assert_eq!(
            EnsureOutcome::Done {
                created_here: true,
                engine: EnsureEngine::Crossover
            }
            .to_value(),
            json!({"status": "done", "createdHere": true, "engine": "crossover"})
        );
        assert_eq!(default_create_timeout(), Duration::from_millis(120_000));
    }
}
