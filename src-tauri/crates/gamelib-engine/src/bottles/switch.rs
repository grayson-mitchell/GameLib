//! Switching a bottle between engines (Phase 87, SVC-02, D-07, ported from `engineSwitch.ts`'s
//! `prepareBottleForEngine`, replayed against the 87-16 goldens in `golden/switch`).
//!
//! Two engines must never share a live wineserver for one prefix, and DXVK must match the engine that
//! is about to run: installed for a non-CrossOver engine, removed before CrossOver runs. The engine
//! that last prepared a bottle is recorded in its marker ([`super::marker`]); a marker a newer build
//! wrote is never overwritten.
//!
//! **What this ports:** the refusals (an invalid or absent bottle, a game starting or running in it,
//! a marker from a newer build, another game running in the bottle, a legacy shared bottle), the
//! same-engine no-op and the failed-DXVK retry, killing the previous engine's wineserver, installing
//! the next engine's DXVK through `ctx.dxvk` and writing the marker (87-40, `crossover -> pinned` is
//! the golden tracer), and the restore of CrossOver's graphics stack when the target is CrossOver and
//! DXVK is present ([`restore`], 87-41: its source is resolved before anything is stopped, a
//! CrossOver that cannot run restores through the built-in engine, and CrossOver's own wineserver is
//! stopped once afterwards, G30).
//!
//! **One switch per bottle at a time (87-41, WR-02, T-87-39):** [`InFlightSwitches`] is the TS
//! `inFlightSwitches` map. Every call takes its bottle's lock for its whole run, so a call that
//! arrives while another is running waits (and logs that it does), then reads the marker the first
//! one wrote and never repeats a step. Calls on different bottles do not wait for each other.
//!
//! Every TS callback is a value here (research Pattern 2): the monitor phase, the title's own bottle,
//! the stored CrossOver settings and the global settings the fallback settings are built from arrive in
//! [`PrepareArgs`]; the engine-owned seams are the context's (`ctx.proc` spawns the wineserver stop,
//! `ctx.dxvk` installs DXVK, `ctx.crossover_bin_dir` finds CrossOver, `ctx.ledger` lists the running
//! games). No TS caller is switched here (D-06): 87-42 switches every caller.

use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;

use gamelib_store::version_gate::GateState;
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::sync::{Mutex as AsyncMutex, OwnedMutexGuard};

use gamelib_core::process::BoxFuture;

use super::lifecycle::{dirname, kill_bottle_wineserver, KILL_TIMEOUT_MS};
use super::marker::{
    self, gate_allows_write, identity_of, marker_path, process_gate, DxvkField, EngineKind, Marker,
};
use super::paths::{bottle_dir, is_clean_bottle_name, is_inside, lexical_resolve};
use super::registry::EngineSelection;
use crate::ctx::EngineCtx;
use crate::dxvk::{DxvkAction, DxvkRequest, DxvkSource, DxvkTool};
use crate::engines::{
    is_pinned_engine_installed, pin_engine, pinned_engine_paths, pinned_engine_root, DxvkBuild,
    NonCrossoverEngine,
};
use crate::ids::pin_by_id;
use crate::jsutil::path_join;
use crate::pins::{pins, EnginePin};
use crate::tool_settings::build_fallback_game_settings;

/// The DXVK-macOS version file a switch to a non-CrossOver engine leaves in the bottle.
const DXVK_VERSION_FILE: &str = "current_dxvk-macOS";

/// `ensurePinEngine`: makes a pinned engine available (downloading it when absent); `None` when that
/// fails. The restore asks it only when its source is not on disk.
pub type EnsurePin = Arc<dyn Fn(EnginePin) -> BoxFuture<Option<NonCrossoverEngine>> + Send + Sync>;

/// A version gate the switch can hold across an await: [`marker::Gate`] plus `Send + Sync`.
pub type SyncGate<'a> = &'a (dyn Fn(&Path) -> Option<GateState> + Send + Sync + 'a);

/// A game's monitor phase (`getMonitorPhase`): a title is starting or running in the bottle.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MonitorPhase {
    Starting,
    Running,
}

impl MonitorPhase {
    pub fn as_str(self) -> &'static str {
        match self {
            MonitorPhase::Starting => "starting",
            MonitorPhase::Running => "running",
        }
    }
}

/// `ownBottleName` (59-REVIEW WR-06): Steam supplies the title's own per-game bottle name; the other
/// stores have no such notion and their idle shared bottle may switch (D-16).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OwnBottle {
    /// No `ownBottleName` callback: the shared-bottle refusal does not apply.
    NoNotion,
    /// The title's own bottle; any other bottle is a shared one and is refused.
    Named(String),
    /// The callback answered `null`: the title has no own bottle, so every bottle is shared.
    Unnamed,
}

/// What [`prepare_bottle_for_engine`] needs (`PrepareArgs` and the `EngineSwitchDeps` callbacks, as
/// values).
#[derive(Clone)]
pub struct PrepareArgs {
    /// The engine key of the title asking.
    pub key: String,
    pub bottle_name: String,
    /// The engine the bottle must be on.
    pub next: EngineSelection,
    /// `getMonitorPhase(key)`: a title is starting or running in this bottle.
    pub monitor_phase: Option<MonitorPhase>,
    pub own_bottle_name: OwnBottle,
    /// `crossoverSettings(key)`: the stored settings the CrossOver restore runs with (its `winePrefix`
    /// is replaced by the bottle's, 59-UAT G7).
    pub crossover_settings: Value,
    /// False when CrossOver cannot run (expired or missing): the restore then uses the built-in engine.
    pub crossover_healthy: bool,
    /// The global game settings the fallback settings are built over (`globalGameSettings()`).
    pub fallback_settings: Value,
    /// `ensurePinEngine`. `None`: a pin that is installed is used and one that is not is unavailable
    /// (this crate downloads no engine yet, 87-40), so a restore whose source is missing refuses.
    pub ensure_pin: Option<EnsurePin>,
    /// Called once when a real engine change is about to start, before any stop or DXVK step.
    pub on_switching: Option<Arc<dyn Fn() + Send + Sync>>,
    /// Record `selection` in the context's registry once the bottle is on that engine. The TS switch
    /// never touched the registry (its callers set it), so this is off unless a caller asks.
    pub register_selection: bool,
}

impl PrepareArgs {
    /// The usual call: no running game, no own-bottle notion, a healthy CrossOver, empty settings.
    pub fn new(key: &str, bottle_name: &str, next: EngineSelection) -> PrepareArgs {
        PrepareArgs {
            key: key.to_string(),
            bottle_name: bottle_name.to_string(),
            next,
            monitor_phase: None,
            own_bottle_name: OwnBottle::NoNotion,
            crossover_settings: json!({}),
            crossover_healthy: true,
            fallback_settings: json!({}),
            ensure_pin: None,
            on_switching: None,
            register_selection: false,
        }
    }
}

/// Why a switch was refused (`PrepareResult.reason`, kebab-case on the wire).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PrepareReason {
    GameRunning,
    DxvkFailed,
    InvalidBottle,
    SharedBottle,
    BottleBusy,
    /// The bottle's marker was written by a newer GameLib build.
    MarkerNewer,
    /// The engine pin table could not be read, so a marker-less bottle cannot be told apart.
    PinsUnavailable,
}

impl PrepareReason {
    pub fn as_str(self) -> &'static str {
        match self {
            PrepareReason::GameRunning => "game-running",
            PrepareReason::DxvkFailed => "dxvk-failed",
            PrepareReason::InvalidBottle => "invalid-bottle",
            PrepareReason::SharedBottle => "shared-bottle",
            PrepareReason::BottleBusy => "bottle-busy",
            PrepareReason::MarkerNewer => "marker-newer",
            PrepareReason::PinsUnavailable => "pins-unavailable",
        }
    }
}

/// Whether the bottle is on the requested engine.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PrepareOutcome {
    /// The bottle is on the engine (changed or already there).
    Prepared,
    Refused {
        reason: PrepareReason,
        detail: String,
    },
}

/// What a switch decided: `outcome`, whether the engine really changed (`changed` in the TS) and the
/// selection the bottle is now on (the requested one when `Prepared`, `None` when refused).
#[derive(Debug, Clone, PartialEq)]
pub struct PrepareResult {
    pub outcome: PrepareOutcome,
    pub switched: bool,
    pub selection: Option<EngineSelection>,
}

impl PrepareResult {
    fn prepared(switched: bool, next: &EngineSelection) -> PrepareResult {
        PrepareResult {
            outcome: PrepareOutcome::Prepared,
            switched,
            selection: Some(next.clone()),
        }
    }

    fn refused(reason: PrepareReason, detail: String) -> PrepareResult {
        PrepareResult {
            outcome: PrepareOutcome::Refused { reason, detail },
            switched: false,
            selection: None,
        }
    }

    pub fn is_ok(&self) -> bool {
        self.outcome == PrepareOutcome::Prepared
    }

    /// The TS `PrepareResult` (`{ok: true, changed}` or `{ok: false, reason, detail}`), plus the
    /// selection when the bottle is prepared.
    pub fn to_value(&self) -> Value {
        match &self.outcome {
            PrepareOutcome::Prepared => {
                let mut out = json!({"ok": true, "changed": self.switched});
                if let Some(selection) = &self.selection {
                    out["selection"] = serde_json::to_value(selection).unwrap_or(Value::Null);
                }
                out
            }
            PrepareOutcome::Refused { reason, detail } => {
                json!({"ok": false, "reason": reason.as_str(), "detail": detail})
            }
        }
    }
}

fn info(ctx: &EngineCtx, line: &str) {
    if let Some(log) = ctx.log.as_deref() {
        log.info(line);
    }
}

fn warn(ctx: &EngineCtx, line: &str) {
    if let Some(log) = ctx.log.as_deref() {
        log.warn(line);
    }
}

/// `markerForBase`: the marker the selection's engine writes, without a DXVK record.
fn marker_for_base(next: &EngineSelection) -> Marker {
    match next {
        EngineSelection::Crossover { bin_dir, .. } => Marker {
            kind: EngineKind::Crossover,
            id: "crossover".to_string(),
            wineserver_bin: path_join(&[bin_dir, "wineserver"]),
            dxvk: None,
        },
        EngineSelection::Pinned { pin_id, engine, .. } => Marker {
            kind: EngineKind::Pinned,
            id: pin_id.clone(),
            wineserver_bin: engine.wineserver_bin.clone(),
            dxvk: None,
        },
        EngineSelection::WineManager {
            manager_version,
            engine,
            ..
        } => Marker {
            kind: EngineKind::WineManager,
            id: manager_version.clone(),
            wineserver_bin: engine.wineserver_bin.clone(),
            dxvk: None,
        },
    }
}

fn marker_with(next: &EngineSelection, dxvk: DxvkField) -> Marker {
    Marker {
        dxvk: Some(dxvk),
        ..marker_for_base(next)
    }
}

/// `pinnedWineserverFallback` (76 review WR-02): a pinned marker with no recorded wineserver resolves
/// it from the marker's pin, else the current pin, once installed.
fn pinned_wineserver_fallback(ctx: &EngineCtx, prev: &Marker) -> String {
    if prev.kind != EngineKind::Pinned {
        return String::new();
    }
    let Some(pin) = pin_by_id(&prev.id).or_else(|| pins().ok().map(|t| &t.current)) else {
        return String::new();
    };
    if !is_pinned_engine_installed(ctx, pin) {
        return String::new();
    }
    pinned_engine_paths(ctx, pin).wineserver_bin
}

/// `killPrevious`: stops the previous engine's wineserver for the bottle. CrossOver's is found through
/// `ctx.crossover_bin_dir`; any other must sit inside an engine root (the pinned engines, the Wine
/// Manager tools, or CrossOver's own `bin`), so a hand-edited marker cannot make the switch run an
/// arbitrary program.
async fn kill_previous(ctx: &EngineCtx, bottle_name: &str, prev: &Marker) {
    let bin_dir = (ctx.crossover_bin_dir)().await;
    let timeout = Duration::from_millis(KILL_TIMEOUT_MS);
    if prev.kind == EngineKind::Crossover {
        let Some(bin_dir) = bin_dir else {
            warn(
                ctx,
                &format!(
                    "engine switch: no CrossOver found to stop its wineserver for \"{bottle_name}\""
                ),
            );
            return;
        };
        kill_bottle_wineserver(
            ctx,
            bottle_name,
            &path_join(&[&bin_dir, "wineserver"]),
            &[("CX_ROOT".to_string(), dirname(&bin_dir))],
            timeout,
        )
        .await;
        return;
    }
    let bin = if prev.wineserver_bin.is_empty() {
        pinned_wineserver_fallback(ctx, prev)
    } else {
        prev.wineserver_bin.clone()
    };
    if !bin.is_empty() && !Path::new(&bin).exists() {
        info(
            ctx,
            &format!(
                "engine switch: no wineserver at {} for \"{bottle_name}\", nothing to stop",
                super::paths::basename(&bin)
            ),
        );
        return;
    }
    let tools = ctx.paths.tools_path.to_string_lossy();
    let allowed = is_inside(&pinned_engine_root(ctx), &bin)
        || is_inside(&path_join(&[&tools, "wine"]), &bin)
        || bin_dir.is_some_and(|dir| {
            lexical_resolve(&bin) == lexical_resolve(&path_join(&[&dir, "wineserver"]))
        });
    if !allowed {
        warn(
            ctx,
            &format!(
                "engine switch: ignoring marker wineserver outside the engine roots for \"{bottle_name}\""
            ),
        );
        return;
    }
    kill_bottle_wineserver(
        ctx,
        bottle_name,
        &bin,
        &[("USER".to_string(), "crossover".to_string())],
        timeout,
    )
    .await;
}

/// The TS `inFlightSwitches`: one async lock per bottle name, so concurrent switches of one bottle run
/// one after another in the order they arrived (a tokio mutex is fair) and switches of different
/// bottles run together. In memory only; the map holds an entry only while a call is running or
/// waiting for its bottle.
#[derive(Default)]
pub struct InFlightSwitches {
    locks: StdMutex<HashMap<String, Arc<AsyncMutex<()>>>>,
}

impl InFlightSwitches {
    pub fn new() -> InFlightSwitches {
        InFlightSwitches::default()
    }

    fn locks(&self) -> std::sync::MutexGuard<'_, HashMap<String, Arc<AsyncMutex<()>>>> {
        self.locks
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    /// How many bottles have a switch running or waiting.
    pub fn len(&self) -> usize {
        self.locks().len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Takes the bottle's turn. `on_wait` runs once, before waiting, when another switch holds it.
    async fn enter(&self, bottle_name: &str, on_wait: impl FnOnce()) -> SwitchTurn<'_> {
        let lock = self
            .locks()
            .entry(bottle_name.to_string())
            .or_default()
            .clone();
        let guard = match lock.clone().try_lock_owned() {
            Ok(guard) => guard,
            Err(_) => {
                on_wait();
                lock.clone().lock_owned().await
            }
        };
        let turn = SwitchTurn {
            owner: self,
            name: bottle_name.to_string(),
            lock,
            guard: Some(guard),
        };
        // The TS entry is registered before its body's first await (the version gate's question), so
        // a switch started in the same tick sees it and queues. The gate is answered in process here
        // and nothing else in the body waits that early, so this is that one turn.
        tokio::task::yield_now().await;
        turn
    }

    /// Drops the bottle's entry once nobody else holds or waits on it.
    fn release(&self, bottle_name: &str, lock: &Arc<AsyncMutex<()>>) {
        let mut locks = self.locks();
        // The map's own handle and the finished call's are the only two left.
        if Arc::strong_count(lock) == 2
            && locks.get(bottle_name).is_some_and(|l| Arc::ptr_eq(l, lock))
        {
            locks.remove(bottle_name);
        }
    }
}

/// A switch's hold on its bottle: released, and the entry tidied, however the call ends (an answer, a
/// panic or the future being dropped), so a switch that dies never blocks the chain (WR-02).
struct SwitchTurn<'a> {
    owner: &'a InFlightSwitches,
    name: String,
    lock: Arc<AsyncMutex<()>>,
    guard: Option<OwnedMutexGuard<()>>,
}

impl Drop for SwitchTurn<'_> {
    fn drop(&mut self) {
        self.guard.take();
        self.owner.release(&self.name, &self.lock);
    }
}

/// `prepareBottleForEngine` over the in-process version gate.
pub async fn prepare_bottle_for_engine(ctx: &EngineCtx, args: &PrepareArgs) -> PrepareResult {
    prepare_bottle_for_engine_with(ctx, &process_gate, args).await
}

/// `prepareBottleForEngine`: makes the bottle's engine `args.next`. The gate answers whether the
/// marker may be rewritten (a goldens injects the states the TS channel fake produced).
pub async fn prepare_bottle_for_engine_with(
    ctx: &EngineCtx,
    gate: SyncGate<'_>,
    args: &PrepareArgs,
) -> PrepareResult {
    // WR-02: one switch per bottle at a time. The legacy shared bottle is already refused before any
    // stop (WR-06); this covers the remaining launch-versus-install interleave on a per-game bottle.
    // The waiting call re-reads the marker in the body, so it never repeats a step.
    let turn = ctx
        .in_flight
        .enter(&args.bottle_name, || {
            info(
                ctx,
                &format!(
                    "engine switch for \"{}\" waits for an in-flight switch (WR-02)",
                    args.bottle_name
                ),
            );
        })
        .await;
    let result = prepare_body(ctx, gate, args).await;
    if result.is_ok() && args.register_selection {
        if let Some(selection) = &result.selection {
            ctx.registry
                .set_engine_selection(ctx.log.as_deref(), &args.key, selection.clone());
        }
    }
    drop(turn);
    result
}

async fn prepare_body(ctx: &EngineCtx, gate: SyncGate<'_>, args: &PrepareArgs) -> PrepareResult {
    let log = ctx.log.as_deref();
    let bottle_name = args.bottle_name.as_str();
    let next = &args.next;
    let dir = bottle_dir(&ctx.paths.user_home, bottle_name);
    if !is_clean_bottle_name(bottle_name) || !Path::new(&dir).exists() {
        return PrepareResult::refused(
            PrepareReason::InvalidBottle,
            format!("bottle \"{bottle_name}\" is not a valid existing bottle"),
        );
    }
    // Never kill a wineserver under a running game (Pitfall 2).
    if let Some(phase) = args.monitor_phase {
        return PrepareResult::refused(
            PrepareReason::GameRunning,
            format!("a game is {} in bottle \"{bottle_name}\"", phase.as_str()),
        );
    }
    // D-16: another game (any store) running in this bottle. Checked before any kill or rewrite.
    let busy_refusal = || -> Option<PrepareResult> {
        if ctx
            .ledger
            .other_games_running(bottle_name, &args.key)
            .is_empty()
        {
            return None;
        }
        Some(PrepareResult::refused(
            PrepareReason::BottleBusy,
            format!("another game is running in bottle \"{bottle_name}\""),
        ))
    };
    let dxvk_marker_path = path_join(&[&dir, DXVK_VERSION_FILE]);
    let next_marker = marker_for_base(next);
    let next_dxvk = next.engine().and_then(|e| e.dxvk.as_ref());

    // Ask the gate before anything below can write the marker (D-17). A gate nobody can ask is
    // treated as a newer marker.
    let may_write = gate_allows_write(gate(Path::new(&marker_path(&dir))));
    let current = marker::read(ctx, &dir);
    // Quick 261109-w52: a marker from a newer build is never inferred over or overwritten. Same-engine
    // launches proceed; every real change is refused.
    if !may_write {
        if let Some(m) = &current {
            if identity_of(m) == identity_of(&next_marker)
                && !(m.dxvk == Some(DxvkField::Failed) && next_dxvk.is_some())
            {
                return PrepareResult::prepared(false, next);
            }
        }
        warn(
            ctx,
            &format!(
                "engine marker for \"{bottle_name}\" is from a newer GameLib build; refusing engine change"
            ),
        );
        return PrepareResult::refused(
            PrepareReason::MarkerNewer,
            format!("bottle \"{bottle_name}\" engine marker was written by a newer GameLib build"),
        );
    }
    let known = marker::trusted(log, &dir, bottle_name, current);
    let prev = match known.clone().or_else(|| marker::infer(ctx, &dir)) {
        Some(prev) => prev,
        None => {
            return PrepareResult::refused(
                PrepareReason::PinsUnavailable,
                format!("the engine of bottle \"{bottle_name}\" cannot be inferred"),
            )
        }
    };
    if identity_of(&prev) == identity_of(&next_marker) {
        if prev.dxvk == Some(DxvkField::Failed) && next_dxvk.is_some() {
            // The last switch into this engine left DXVK uninstalled: retry, no wineserver kill.
            return match busy_refusal() {
                Some(refusal) => refusal,
                None => install_next_dxvk(ctx, gate, args, &dir).await,
            };
        }
        if known.is_none() {
            marker::write_marker_with(log, gate, &dir, &next_marker);
        }
        return PrepareResult::prepared(false, next);
    }

    // D-16: a real engine change kills the bottle's wineserver and rewrites DXVK, so it never happens
    // under another running game of any store. Same-engine launches returned above.
    if let Some(refusal) = busy_refusal() {
        return refusal;
    }

    // 59-REVIEW WR-06: a Steam title in the legacy shared bottle holds several titles; switching its
    // engine would kill and rewrite it under the others.
    let shared = match &args.own_bottle_name {
        OwnBottle::NoNotion => false,
        OwnBottle::Named(own) => own != bottle_name,
        OwnBottle::Unnamed => true,
    };
    if shared {
        return PrepareResult::refused(
            PrepareReason::SharedBottle,
            format!(
                "engine switch refused on shared bottle \"{bottle_name}\" for {}",
                args.key
            ),
        );
    }

    // 59-REVIEW WR-05: resolve (and download) the restore source before anything is stopped, so a
    // missing source leaves the bottle and its marker exactly as they were.
    let restore_needed = matches!(next, EngineSelection::Crossover { .. })
        && (Path::new(&dxvk_marker_path).exists() || prev.dxvk.is_some());
    let mut restore_source: Option<NonCrossoverEngine> = None;
    if restore_needed {
        restore_source = resolve_restore_source(ctx, args, &prev, !args.crossover_healthy).await;
        if restore_source
            .as_ref()
            .and_then(|s| s.dxvk.as_ref())
            .is_none()
        {
            return PrepareResult::refused(
                PrepareReason::DxvkFailed,
                format!("no DXVK source to restore \"{bottle_name}\""),
            );
        }
    }

    if let Some(on_switching) = &args.on_switching {
        on_switching();
    }
    info(
        ctx,
        &format!(
            "engine switch for \"{bottle_name}\": {} -> {}",
            identity_of(&prev),
            identity_of(&next_marker)
        ),
    );
    kill_previous(ctx, bottle_name, &prev).await;

    if next.engine().is_some() {
        return install_next_dxvk(ctx, gate, args, &dir).await;
    }

    if let (true, Some(source)) = (restore_needed, restore_source) {
        if let Some(refusal) = restore(ctx, gate, args, &dir, &prev, &source).await {
            return refusal;
        }
    }

    marker::write_marker_with(log, gate, &dir, &next_marker);
    PrepareResult::prepared(true, next)
}

/// `ensurePinEngine` as the caller supplied it, else the pin when it is installed.
async fn ensure_pin_engine(
    ctx: &EngineCtx,
    args: &PrepareArgs,
    pin: &EnginePin,
) -> Option<NonCrossoverEngine> {
    match &args.ensure_pin {
        Some(ensure) => ensure(pin.clone()).await,
        None => is_pinned_engine_installed(ctx, pin).then(|| pin_engine(ctx, pin)),
    }
}

/// `resolveRestoreSource`: where the DXVK DLL list for a restore comes from: the marker's recorded
/// dir, else the pin the bottle was prepared with, else the current pin (downloaded when it is not on
/// disk). `need_wine`: the restore runs through the built-in engine (CrossOver unhealthy), so a source
/// with DXVK but no Wine binary (a half-installed pin, IN-06) takes its Wine from the pin download.
async fn resolve_restore_source(
    ctx: &EngineCtx,
    args: &PrepareArgs,
    prev: &Marker,
    need_wine: bool,
) -> Option<NonCrossoverEngine> {
    let table = pins().ok()?;
    let pin = if prev.kind == EngineKind::Pinned {
        pin_by_id(&prev.id)
    } else {
        None
    }
    .unwrap_or(&table.current);
    let installed = is_pinned_engine_installed(ctx, pin).then(|| pinned_engine_paths(ctx, pin));
    if let Some(DxvkField::Installed { dir, version }) = &prev.dxvk {
        if Path::new(dir).join("x64").exists() {
            let dxvk = Some(DxvkBuild {
                dir: dir.clone(),
                version: version.clone(),
            });
            if installed.is_some() || !need_wine {
                return Some(NonCrossoverEngine {
                    wine_bin: installed
                        .as_ref()
                        .map(|p| p.wine_bin.clone())
                        .unwrap_or_default(),
                    wineserver_bin: installed
                        .as_ref()
                        .map(|p| p.wineserver_bin.clone())
                        .unwrap_or_default(),
                    label: pin.label.clone(),
                    version: pin.wine.version.clone(),
                    dxvk,
                });
            }
            let fetched = ensure_pin_engine(ctx, args, pin).await?;
            return Some(NonCrossoverEngine { dxvk, ..fetched });
        }
    }
    if let Some(paths) = installed {
        return Some(NonCrossoverEngine {
            wine_bin: paths.wine_bin,
            wineserver_bin: paths.wineserver_bin,
            label: pin.label.clone(),
            version: pin.wine.version.clone(),
            dxvk: Some(DxvkBuild {
                dir: paths.dxvk_dir,
                version: pin.dxvk.version.clone(),
            }),
        });
    }
    ensure_pin_engine(ctx, args, pin).await
}

/// The restore of CrossOver's graphics stack (the tail of `prepareBottleForEngineBody`): puts back the
/// DLLs DXVK replaced, then stops the wineserver that did it. `None` when the bottle is clean (the
/// caller writes the CrossOver marker), else the refusal.
///
/// 59-UAT G7: the stock CrossOver settings carry the global winePrefix, not this bottle's. 59-UAT G10:
/// every CrossOver wine step on an expired bottle blocks on CodeWeavers' Expired Bottle dialog and the
/// built-in engine never shows it, so an unhealthy CrossOver restores through the built-in engine and
/// stops that wineserver afterwards. G30: the restore returns while its CrossOver wineserver lingers
/// and the next launch may run on a different runner (overlay clone, 60-RESEARCH Pitfall 2), so a
/// healthy restore stops it once, on both outcomes.
pub async fn restore(
    ctx: &EngineCtx,
    gate: SyncGate<'_>,
    args: &PrepareArgs,
    dir: &str,
    prev: &Marker,
    source: &NonCrossoverEngine,
) -> Option<PrepareResult> {
    let bottle_name = args.bottle_name.as_str();
    let source_dxvk = source.dxvk.as_ref()?;
    let timeout = Duration::from_millis(KILL_TIMEOUT_MS);
    let mut settings = if args.crossover_healthy {
        // 59-01 measurement: healthy CrossOver removed Staging-installed DXVK cleanly.
        args.crossover_settings.clone()
    } else {
        if source.wine_bin.is_empty() || source.wineserver_bin.is_empty() {
            return Some(PrepareResult::refused(
                PrepareReason::DxvkFailed,
                format!(
                    "no built-in engine to restore \"{bottle_name}\" while CrossOver is unavailable"
                ),
            ));
        }
        build_fallback_game_settings(ctx, bottle_name, source, &args.fallback_settings)
    };
    match settings.as_object_mut() {
        Some(map) => {
            map.insert("winePrefix".to_string(), json!(dir));
        }
        None => settings = json!({"winePrefix": dir}),
    }
    let ok = ctx
        .dxvk
        .install_remove(DxvkRequest {
            settings,
            tool: DxvkTool::Dxvk,
            action: DxvkAction::Restore,
            source: Some(DxvkSource {
                dir: source_dxvk.dir.clone(),
                version: source_dxvk.version.clone(),
            }),
        })
        .await;
    if args.crossover_healthy {
        match (ctx.crossover_bin_dir)().await {
            Some(bin_dir) => {
                kill_bottle_wineserver(
                    ctx,
                    bottle_name,
                    &path_join(&[&bin_dir, "wineserver"]),
                    &[("CX_ROOT".to_string(), dirname(&bin_dir))],
                    timeout,
                )
                .await;
                info(
                    ctx,
                    &format!(
                        "engine switch: stopped the restore's CrossOver wineserver for \"{bottle_name}\""
                    ),
                );
            }
            None => warn(
                ctx,
                &format!(
                    "engine switch: no CrossOver found to stop the restore's wineserver for \"{bottle_name}\""
                ),
            ),
        }
    } else {
        kill_bottle_wineserver(
            ctx,
            bottle_name,
            &source.wineserver_bin,
            &[("USER".to_string(), "crossover".to_string())],
            timeout,
        )
        .await;
    }
    if !ok || Path::new(&path_join(&[dir, DXVK_VERSION_FILE])).exists() {
        // CR-03: the restore may have deleted DLLs or overrides before failing; record that so the
        // next launch on either engine repairs the bottle instead of reporting changed:false.
        if prev.kind != EngineKind::Crossover {
            let failed = Marker {
                dxvk: Some(DxvkField::Failed),
                ..prev.clone()
            };
            marker::write_marker_with(ctx.log.as_deref(), gate, dir, &failed);
        }
        return Some(PrepareResult::refused(
            PrepareReason::DxvkFailed,
            format!("DXVK removal failed for \"{bottle_name}\""),
        ));
    }
    None
}

/// `reconcileBottleEngineMarker` (76 gap, CR-01): persists the bottle's engine before any CrossOver
/// probe touches `cxbottle.conf`; answers what it wrote, `None` when it wrote nothing.
pub fn reconcile_marker(ctx: &EngineCtx, bottle_name: &str) -> Option<marker::Reconciled> {
    marker::reconcile(ctx, bottle_name)
}

/// `recordCrossoverBottleEngine` (D-07a): the marker a CrossOver-created bridge bottle gets at creation.
pub fn record_crossover(ctx: &EngineCtx, bottle_name: &str, bin_dir: &str) -> bool {
    marker::record_crossover(ctx, bottle_name, bin_dir)
}

/// `installNextDxvk`: installs the next engine's DXVK. Once the previous wineserver is gone the bottle
/// belongs to `next`, so the marker is written on both outcomes (59-REVIEW WR-09).
async fn install_next_dxvk(
    ctx: &EngineCtx,
    gate: SyncGate<'_>,
    args: &PrepareArgs,
    dir: &str,
) -> PrepareResult {
    let log = ctx.log.as_deref();
    let bottle_name = args.bottle_name.as_str();
    let next = &args.next;
    let Some(engine) = next.engine() else {
        return PrepareResult::prepared(true, next);
    };
    let Some(build) = &engine.dxvk else {
        marker::write_marker_with(log, gate, dir, &marker_for_base(next));
        return PrepareResult::prepared(true, next);
    };
    let settings = build_fallback_game_settings(ctx, bottle_name, engine, &args.fallback_settings);
    let installed = ctx
        .dxvk
        .install_remove(DxvkRequest {
            settings,
            tool: DxvkTool::Dxvk,
            action: DxvkAction::Backup,
            source: Some(DxvkSource {
                dir: build.dir.clone(),
                version: build.version.clone(),
            }),
        })
        .await;
    if !installed || !Path::new(&path_join(&[dir, DXVK_VERSION_FILE])).exists() {
        marker::write_marker_with(log, gate, dir, &marker_with(next, DxvkField::Failed));
        return PrepareResult::refused(
            PrepareReason::DxvkFailed,
            format!("DXVK install failed for \"{bottle_name}\""),
        );
    }
    marker::write_marker_with(
        log,
        gate,
        dir,
        &marker_with(
            next,
            DxvkField::Installed {
                dir: build.dir.clone(),
                version: build.version.clone(),
            },
        ),
    );
    PrepareResult::prepared(true, next)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ctx::{EnginePaths, Platform};
    use crate::engines::{DxvkBuild, NonCrossoverEngine};
    use crate::testing::{RecordingLog, ScriptedDxvk, ScriptedSpecRunner};
    use gamelib_core::clock::SystemClock;
    use gamelib_core::process::SpecOutput;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;

    const KEY: &str = "gog:1";
    const BOTTLE: &str = "GameLib-gog-1";

    fn ctx(home: &FakeHome, runner: Arc<ScriptedSpecRunner>, dxvk: Arc<ScriptedDxvk>) -> EngineCtx {
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
        .with_proc(runner)
        .with_dxvk(dxvk)
        .with_log(Arc::new(RecordingLog::new()))
        .with_crossover_bin_dir(Arc::new(|| Box::pin(async { Some("/cx/bin".to_string()) })))
    }

    /// A bottle holding a CrossOver marker, and the engines' binaries on disk.
    fn crossover_bottle(home: &FakeHome, dxvk_file: bool) -> String {
        let dir = bottle_dir(&home.root().join("home"), BOTTLE);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            Path::new(&dir).join(".gamelib-engine.json"),
            r#"{"kind":"crossover","id":"crossover","wineserverBin":"/cx/bin/wineserver","version":1}"#,
        )
        .unwrap();
        if dxvk_file {
            std::fs::write(Path::new(&dir).join(DXVK_VERSION_FILE), "v1\n").unwrap();
        }
        dir
    }

    fn pinned(home: &FakeHome) -> EngineSelection {
        let tools = home.root().join("tools/steam-engines");
        let bin = tools.join("p/Contents/Resources/wine/bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join("wine"), "").unwrap();
        std::fs::write(bin.join("wineserver"), "").unwrap();
        EngineSelection::Pinned {
            pin_id: "p".to_string(),
            reason: "cx-missing".to_string(),
            engine: NonCrossoverEngine {
                wine_bin: bin.join("wine").to_string_lossy().into_owned(),
                wineserver_bin: bin.join("wineserver").to_string_lossy().into_owned(),
                label: "Pinned".to_string(),
                version: "1".to_string(),
                dxvk: Some(DxvkBuild {
                    dir: tools.join("dxvk").to_string_lossy().into_owned(),
                    version: "v1".to_string(),
                }),
            },
        }
    }

    fn runner() -> Arc<ScriptedSpecRunner> {
        Arc::new(ScriptedSpecRunner::new(Vec::new()).on_program(
            "/cx/bin/wineserver",
            SpecOutput {
                code: Some(0),
                ..SpecOutput::default()
            },
        ))
    }

    #[tokio::test]
    async fn a_prepared_switch_registers_its_selection_only_when_asked() {
        let home = FakeHome::new("engine-switch-");
        let dir = crossover_bottle(&home, false);
        let dxvk = Arc::new(ScriptedDxvk::new(&[true]));
        let ctx = ctx(&home, runner(), dxvk.clone());
        let next = pinned(&home);
        // The scripted installer writes nothing, so the bottle never gets `current_dxvk-macOS`: the
        // switch is a DXVK failure, which still leaves the bottle on the next engine (WR-09).
        let args = PrepareArgs::new(KEY, BOTTLE, next.clone());
        let result = prepare_bottle_for_engine(&ctx, &args).await;
        assert_eq!(
            result.outcome,
            PrepareOutcome::Refused {
                reason: PrepareReason::DxvkFailed,
                detail: format!("DXVK install failed for \"{BOTTLE}\""),
            }
        );
        assert_eq!(result.selection, None);
        assert_eq!(ctx.registry.get_engine_selection(KEY), None);
        let marker = std::fs::read_to_string(Path::new(&dir).join(".gamelib-engine.json")).unwrap();
        assert!(marker.contains(r#""kind":"pinned""#) && marker.contains(r#""dxvk":"failed""#));

        // A bottle already on the engine is prepared without a change and, when asked, registered.
        let mut again = PrepareArgs::new(KEY, BOTTLE, next.clone());
        again.register_selection = true;
        let result = prepare_bottle_for_engine(&ctx, &again).await;
        assert!(
            !result.is_ok(),
            "the failed DXVK is retried and fails again"
        );
        assert_eq!(ctx.registry.get_engine_selection(KEY), None);
        std::fs::write(Path::new(&dir).join(DXVK_VERSION_FILE), "v1\n").unwrap();
        let ok = prepare_bottle_for_engine(&ctx, &again).await;
        assert!(ok.is_ok() && ok.switched, "{ok:?}");
        assert_eq!(ctx.registry.get_engine_selection(KEY), Some(next.clone()));
        assert_eq!(ok.to_value()["changed"], json!(true));
        assert_eq!(ok.to_value()["selection"]["kind"], json!("pinned"));
    }

    #[tokio::test]
    async fn a_shared_bottle_a_running_game_and_another_title_in_the_bottle_each_refuse_the_switch()
    {
        let home = FakeHome::new("engine-switch-");
        crossover_bottle(&home, false);
        let runner = runner();
        let ctx = ctx(&home, runner.clone(), Arc::new(ScriptedDxvk::new(&[true])));
        let next = pinned(&home);

        let mut shared = PrepareArgs::new(KEY, BOTTLE, next.clone());
        shared.own_bottle_name = OwnBottle::Named("GameLib-other".to_string());
        let mut running = PrepareArgs::new(KEY, BOTTLE, next.clone());
        running.monitor_phase = Some(MonitorPhase::Running);
        for (args, reason) in [
            (shared, PrepareReason::SharedBottle),
            (running, PrepareReason::GameRunning),
        ] {
            let result = prepare_bottle_for_engine(&ctx, &args).await;
            assert!(
                matches!(&result.outcome, PrepareOutcome::Refused { reason: r, .. } if *r == reason),
                "{reason:?}: {result:?}"
            );
        }
        ctx.ledger.mark_game_running(None, BOTTLE, "gog:2");
        let busy = prepare_bottle_for_engine(&ctx, &PrepareArgs::new(KEY, BOTTLE, next)).await;
        assert!(matches!(
            busy.outcome,
            PrepareOutcome::Refused {
                reason: PrepareReason::BottleBusy,
                ..
            }
        ));
        // None of them stopped a wineserver.
        assert!(runner.spawns().is_empty());
    }

    #[tokio::test]
    async fn a_bottle_that_is_not_there_or_not_clean_is_invalid() {
        let home = FakeHome::new("engine-switch-");
        let ctx = ctx(&home, runner(), Arc::new(ScriptedDxvk::new(&[true])));
        let next = pinned(&home);
        for name in ["no-such-bottle", "../x", ""] {
            let result =
                prepare_bottle_for_engine(&ctx, &PrepareArgs::new(KEY, name, next.clone())).await;
            assert!(
                matches!(
                    result.outcome,
                    PrepareOutcome::Refused {
                        reason: PrepareReason::InvalidBottle,
                        ..
                    }
                ),
                "{name:?}"
            );
        }
    }

    #[tokio::test]
    async fn a_second_turn_on_one_bottle_waits_and_a_turn_on_another_does_not() {
        let in_flight = InFlightSwitches::new();
        let first = in_flight.enter("a", || panic!("nothing holds a")).await;
        // Another bottle's turn is not held up by the first.
        let other = in_flight.enter("b", || panic!("nothing holds b")).await;
        assert_eq!(in_flight.len(), 2);
        let waited = std::sync::atomic::AtomicBool::new(false);
        let mut second = Box::pin(in_flight.enter("a", || {
            waited.store(true, std::sync::atomic::Ordering::SeqCst);
        }));
        assert!(
            futures_util::poll!(second.as_mut()).is_pending(),
            "the second turn on a waits for the first"
        );
        assert!(waited.load(std::sync::atomic::Ordering::SeqCst));
        drop(first);
        let second = second.await;
        drop(other);
        assert_eq!(in_flight.len(), 1, "b is tidied, a is still held");
        drop(second);
        assert!(in_flight.is_empty(), "no entry outlives its last turn");
    }

    #[tokio::test]
    async fn a_switch_that_panics_does_not_block_the_chain() {
        let in_flight = Arc::new(InFlightSwitches::new());
        let held = in_flight.clone();
        let crashed = tokio::spawn(async move {
            let _turn = held.enter("a", || ()).await;
            panic!("the installer blew up");
        })
        .await;
        assert!(crashed.is_err());
        // The next caller takes its turn at once and the map is empty again afterwards.
        let turn = in_flight
            .enter("a", || panic!("a dead switch still holds the bottle"))
            .await;
        drop(turn);
        assert!(in_flight.is_empty());
    }

    #[tokio::test]
    async fn a_dropped_waiter_leaves_the_bottle_to_the_next_caller() {
        let in_flight = InFlightSwitches::new();
        let first = in_flight.enter("a", || ()).await;
        let mut waiter = Box::pin(in_flight.enter("a", || ()));
        assert!(futures_util::poll!(waiter.as_mut()).is_pending());
        drop(waiter);
        drop(first);
        let again = in_flight
            .enter("a", || panic!("a dropped waiter still holds the bottle"))
            .await;
        drop(again);
        assert!(in_flight.is_empty());
    }

    #[test]
    fn reasons_are_spelled_as_the_ts_spelled_them() {
        assert_eq!(PrepareReason::GameRunning.as_str(), "game-running");
        assert_eq!(PrepareReason::DxvkFailed.as_str(), "dxvk-failed");
        assert_eq!(PrepareReason::InvalidBottle.as_str(), "invalid-bottle");
        assert_eq!(PrepareReason::SharedBottle.as_str(), "shared-bottle");
        assert_eq!(PrepareReason::BottleBusy.as_str(), "bottle-busy");
        assert_eq!(PrepareReason::MarkerNewer.as_str(), "marker-newer");
        assert_eq!(MonitorPhase::Starting.as_str(), "starting");
    }
}
