//! Per-title engine display state (Phase 59 D-04, D-06, D-13, D-15; Phase 61), ported from
//! `engineState.ts` and the non-Steam half of `gameEngineState.ts`.
//!
//! Answers "which engine, which notice" for the game page. The page pre-flight runs only when the
//! renderer asks (never at boot), at most once per bottle at a time (concurrent callers share one probe),
//! and an unhealthy answer is re-probed after [`ENGINE_PREFLIGHT_UNHEALTHY_TTL_MS`]. A launch replaces
//! the cached pre-flight with its own (`record_launch_decision`). Every cache, the in-flight probes and
//! the notice sequence live in the context's [`EngineStateOwner`], in memory only (D-05).
//!
//! The facts the TS gathered from its own services (the Browser platform and `isNative` gate, a Steam
//! game's bridge and bottle facts) arrive as values in [`GameFacts`], so the D-23 resolver in the TS
//! `getEngineState` makes one typed call. A non-Steam game's facts are derived here from the stored
//! settings ([`non_steam_facts`]), as `getGameEngineState` did.

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex, MutexGuard};

use serde::Serialize;
use serde_json::{Map, Value};
use tokio::sync::OnceCell;

use crate::bottles::registry::EngineSelection;
use crate::config::{
    engine_id_of, global_settings, read_engine_for_game, read_stored_game_config, EffectiveEngine,
    EngineSource,
};
use crate::crossover::tested_versions::{should_show_untested_notice, NoticeStore};
use crate::ctx::{EngineCtx, Platform};
use crate::decision::launch::LaunchDecision;
use crate::decision::preflight::{preflight_crossover, CrossoverPreflight, PreflightArgs};
use crate::game_engine::per_game_bottle_name;
use crate::game_prefix::{resolve_game_prefix, GamePrefix};
use crate::ids::AUTOMATIC;
use crate::jsutil::js_to_string;
use crate::key::{engine_key_for, uses_bottle_runtime};
use crate::state::notices::NO_CROSSOVER_KEY;
use crate::state::publish::emit_engine_state;

/// D-13: show the trial notice at this many days remaining or fewer.
pub const TRIAL_NOTICE_DAYS: u64 = 7;

/// IN-04: a cached non-healthy pre-flight is re-probed after this long.
pub const ENGINE_PREFLIGHT_UNHEALTHY_TTL_MS: u64 = 60_000;

/// The "launch fell back to the built-in engine" notice; `seq` is shared by every notice.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LaunchNotice {
    pub reason: String,
    pub seq: u64,
}

/// An in-app overlay-setup failure notice (Phase 60 G4).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct OverlayNotice {
    pub step: String,
    pub seq: u64,
}

/// "The game closed soon after starting" for an overlay launch (quick 261105-ast).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ExitNotice {
    pub seq: u64,
}

/// "Couldn't confirm the game started" (plan 61-27).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DeadlineNotice {
    pub title: String,
    pub seconds: Value,
    pub seq: u64,
}

/// The `EngineState` payload the game page reads, field for field as the TS built it. Labels and ids
/// only, never a path (T-59-36, T-61-27).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineState {
    pub runner: String,
    pub app_name: String,
    pub engine: Option<&'static str>,
    pub reason: Option<&'static str>,
    pub engine_label: Option<String>,
    pub trial_days_remaining: Option<u64>,
    pub show_trial_notice: bool,
    pub crossover_installed: bool,
    pub show_no_crossover_note: bool,
    pub untested_crossover_build: Option<String>,
    pub override_eligible: bool,
    pub wine_tools_eligible: bool,
    pub overlay_eligible: bool,
    pub override_warning: Option<&'static str>,
    pub launch_notice: Option<LaunchNotice>,
    pub overlay_notice: Option<OverlayNotice>,
    pub exit_notice: Option<ExitNotice>,
    pub deadline_notice: Option<DeadlineNotice>,
    pub effective_engine_id: String,
    pub engine_source: &'static str,
    pub prefix_kind: Option<String>,
    pub per_game_bottle_name: Option<String>,
    pub legacy_label: Option<Value>,
}

impl EngineState {
    pub fn to_value(&self) -> Value {
        serde_json::to_value(self).unwrap_or(Value::Null)
    }
}

/// What the TS `EngineStateDeps` carried as functions, as values: the facts about one game.
#[derive(Debug, Clone)]
pub struct GameFacts {
    /// The bottle whose CrossOver pre-flight decides this game's badge; `None` is no engine state
    /// unless `state_without_bottle`.
    pub bottle: Option<String>,
    /// A game with no bottle that still shows state (a plain prefix, Legacy); no pre-flight runs.
    pub state_without_bottle: bool,
    /// Whether an engine override has any effect for this game in this bottle.
    pub override_eligible: bool,
    /// Whether the overlay toggle applies to this game.
    pub overlay_eligible: bool,
    /// Quick 261110-vi4: whether the Wine tools may act on this game's own bottle.
    pub wine_tools_eligible: bool,
    /// The effective engine (the stored override, a derived one, or a Legacy Wine).
    pub effective: EffectiveEngine,
    pub prefix_kind: Option<String>,
    pub per_game_bottle_name: Option<String>,
}

type ProbeFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// What a state needs of its surroundings. Production is [`LiveProbes`]; the goldens script these (the
/// decision layer's own goldens are 87-13's, so the probe's inputs are values here).
pub trait StateProbes: Send + Sync {
    /// The CrossOver bin directory, or `None` when CrossOver is not installed.
    fn resolve_bin_dir<'a>(&'a self, ctx: &'a EngineCtx) -> ProbeFuture<'a, Option<String>>;
    /// Whether the bottle is provisioned (its `cxbottle.conf` exists).
    fn is_bottle_ready(&self, ctx: &EngineCtx, bottle: &str) -> bool;
    /// The CrossOver pre-flight of the bottle, which never stops a wineserver (a page read). `Err` is
    /// a probe that could not run; every waiting caller shares it.
    fn preflight<'a>(
        &'a self,
        ctx: &'a EngineCtx,
        bottle: &'a str,
    ) -> ProbeFuture<'a, Result<CrossoverPreflight, String>>;
}

/// The real probes: the locator, the bottle's `cxbottle.conf` and `preflight_crossover` with
/// `killOnTimeout: false`.
pub struct LiveProbes;

impl StateProbes for LiveProbes {
    fn resolve_bin_dir<'a>(&'a self, ctx: &'a EngineCtx) -> ProbeFuture<'a, Option<String>> {
        Box::pin(async move { ctx.crossover_locator.resolve_bin_dir(ctx, &[]).await })
    }

    fn is_bottle_ready(&self, ctx: &EngineCtx, bottle: &str) -> bool {
        crate::bottles::paths::is_clean_bottle_name(bottle)
            && crate::engines::is_bottle_provisioned(ctx, bottle)
    }

    fn preflight<'a>(
        &'a self,
        ctx: &'a EngineCtx,
        bottle: &'a str,
    ) -> ProbeFuture<'a, Result<CrossoverPreflight, String>> {
        Box::pin(async move {
            Ok(preflight_crossover(
                ctx,
                &PreflightArgs {
                    bottle_name: bottle.to_string(),
                    kill_on_timeout: Some(false),
                    ..PreflightArgs::default()
                },
            )
            .await)
        })
    }
}

type Flight = Arc<OnceCell<Result<CrossoverPreflight, String>>>;

#[derive(Default)]
struct Inner {
    /// The label the engine last launched a title with (`labelFor`), by engine key.
    labels: HashMap<String, String>,
    /// The cached pre-flight of a bottle and when it was cached.
    preflight_cache: HashMap<String, (CrossoverPreflight, u64)>,
    /// IN-03: the last `crossoverInstalled` a state computed, by engine key.
    last_crossover_installed: HashMap<String, bool>,
    /// The one counter every notice draws its `seq` from.
    seq: u64,
    /// Phase 60 G4: the last state published per title, the base of the overlay notices.
    last_published: HashMap<String, EngineState>,
    /// The pre-flights running, by bottle: the single flight.
    inflight: HashMap<String, Flight>,
}

/// The engine-state owner of one context (D-05). In memory only; building it does no I/O and starts
/// nothing.
#[derive(Default)]
pub struct EngineStateOwner {
    inner: Mutex<Inner>,
}

impl EngineStateOwner {
    pub fn new() -> EngineStateOwner {
        EngineStateOwner::default()
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// The last state published for the title with a fresh `seq` drawn from the shared counter,
    /// changed by `change`; `None` when nothing was published for it yet.
    pub(crate) fn republish(
        &self,
        key: &str,
        change: impl FnOnce(&mut EngineState, u64),
    ) -> Option<EngineState> {
        let mut inner = self.lock();
        let mut state = inner.last_published.get(key)?.clone();
        inner.seq += 1;
        let seq = inner.seq;
        change(&mut state, seq);
        Some(state)
    }
}

fn is_unsupported_override(id: &str) -> bool {
    id.starts_with("pinned:") || id.starts_with("wine-manager:")
}

fn override_of(effective: &EffectiveEngine) -> String {
    match effective {
        EffectiveEngine::Override { id, .. } => id.clone(),
        EffectiveEngine::Legacy { .. } => AUTOMATIC.to_string(),
    }
}

fn is_inconclusive(preflight: &CrossoverPreflight) -> bool {
    matches!(
        preflight,
        CrossoverPreflight::Broken {
            inconclusive: true,
            ..
        }
    )
}

/// The `{runner, appName}` of an untyped identity: an object holding two strings.
fn as_identity(identity: &Value) -> Option<(String, String)> {
    let object = identity.as_object()?;
    Some((
        object.get("runner")?.as_str()?.to_string(),
        object.get("appName")?.as_str()?.to_string(),
    ))
}

/// The pre-flight cached for `bottle`, dropping an unhealthy one older than the TTL.
fn cached_preflight(ctx: &EngineCtx, bottle: &str) -> Option<CrossoverPreflight> {
    let now = ctx.clock.now_ms();
    let mut inner = ctx.engine_state.lock();
    let (result, at) = inner.preflight_cache.get(bottle)?;
    if !matches!(result, CrossoverPreflight::Healthy { .. })
        && now.saturating_sub(*at) > ENGINE_PREFLIGHT_UNHEALTHY_TTL_MS
    {
        inner.preflight_cache.remove(bottle);
        return None;
    }
    Some(result.clone())
}

fn label_for(ctx: &EngineCtx, key: &str) -> Option<String> {
    ctx.engine_state.lock().labels.get(key).cloned()
}

#[allow(clippy::too_many_arguments)]
fn compute(
    runner: &str,
    app_name: &str,
    effective: &EffectiveEngine,
    facts: &GameFacts,
    override_id: &str,
    crossover_installed: bool,
    preflight: Option<&CrossoverPreflight>,
    engine_label: Option<String>,
    store: &dyn NoticeStore,
    launch_notice: Option<LaunchNotice>,
) -> EngineState {
    let mut engine: Option<&'static str> = None;
    let mut reason: Option<&'static str> = None;
    let mut override_warning: Option<&'static str> = None;
    let legacy = matches!(effective, EffectiveEngine::Legacy { .. });
    if legacy || is_unsupported_override(override_id) {
        // D-15: a pinned, Wine Manager or Legacy engine is shown as unsupported and never waits on a probe.
        engine = Some("unsupported");
        reason = Some("override");
    } else if override_id == "crossover" {
        // G9: CrossOver is the supported engine however it was chosen.
        engine = Some("crossover");
        reason = Some("override");
        // WR-06: a forced CrossOver that will nag (expired) or may fail (broken).
        match preflight {
            Some(CrossoverPreflight::Expired { .. }) => override_warning = Some("cx-expired"),
            Some(CrossoverPreflight::Broken {
                inconclusive: false,
                ..
            }) => override_warning = Some("cx-broken"),
            _ => {}
        }
    } else if let Some(preflight) = preflight {
        match preflight {
            CrossoverPreflight::Healthy { .. } => {
                engine = Some("crossover");
                reason = Some("cx-healthy");
            }
            other => {
                engine = Some("builtin");
                reason = Some(match other {
                    CrossoverPreflight::Missing { .. } => "cx-missing",
                    CrossoverPreflight::Expired { .. } => "cx-expired",
                    _ => "cx-broken",
                });
            }
        }
    }
    let trial_days_remaining = match preflight {
        Some(CrossoverPreflight::Healthy {
            trial_days_remaining,
            ..
        }) => *trial_days_remaining,
        _ => None,
    };
    let build = preflight.and_then(CrossoverPreflight::build);
    let note_dismissed = store.get(NO_CROSSOVER_KEY) == Some(Value::Bool(true));
    let legacy_label = match effective {
        EffectiveEngine::Legacy { label } => Some(label.clone().unwrap_or(Value::Null)),
        EffectiveEngine::Override { .. } => None,
    };
    EngineState {
        runner: runner.to_string(),
        app_name: app_name.to_string(),
        engine,
        reason,
        engine_label: match effective {
            EffectiveEngine::Legacy { label } => Some(format!(
                "Legacy: {}",
                label.as_ref().map_or("undefined".to_string(), js_to_string)
            )),
            EffectiveEngine::Override { .. } => engine_label,
        },
        trial_days_remaining,
        show_trial_notice: trial_days_remaining.is_some_and(|days| days <= TRIAL_NOTICE_DAYS),
        crossover_installed,
        show_no_crossover_note: !crossover_installed && !note_dismissed,
        untested_crossover_build: build
            .filter(|b| should_show_untested_notice(Some(b), store))
            .map(str::to_string),
        override_eligible: facts.override_eligible,
        wine_tools_eligible: facts.wine_tools_eligible,
        overlay_eligible: facts.overlay_eligible,
        override_warning,
        launch_notice,
        overlay_notice: None,
        exit_notice: None,
        deadline_notice: None,
        effective_engine_id: engine_id_of(effective),
        engine_source: match effective {
            EffectiveEngine::Override {
                source: EngineSource::Stored,
                ..
            } => "stored",
            _ => "derived",
        },
        prefix_kind: facts.prefix_kind.clone(),
        per_game_bottle_name: facts.per_game_bottle_name.clone(),
        legacy_label,
    }
}

/// `getEngineState` of the owner: the state the game page shows, or `None` when the game has none (not
/// macOS, an identity the engine layer refuses, no bottle and no state without one). `Err` is only a
/// probe that could not run, shared by every concurrent caller; nothing is cached for it.
pub async fn get_engine_state(
    ctx: &EngineCtx,
    identity: &Value,
    facts: &GameFacts,
    probes: &dyn StateProbes,
) -> Result<Option<EngineState>, String> {
    let Some((runner, app_name)) = as_identity(identity) else {
        return Ok(None);
    };
    let Some(key) = engine_key_for(&runner, &app_name) else {
        return Ok(None);
    };
    if ctx.platform != Platform::Mac {
        return Ok(None);
    }
    let bottle = facts.bottle.as_deref();
    if bottle.is_none() && !facts.state_without_bottle {
        return Ok(None);
    }
    let effective = &facts.effective;
    let override_id = override_of(effective);

    let mut preflight = bottle.and_then(|b| cached_preflight(ctx, b));
    let crossover_installed;
    if let Some(cached) = &preflight {
        crossover_installed = !matches!(cached, CrossoverPreflight::Missing { .. });
    } else {
        let bin_dir = probes.resolve_bin_dir(ctx).await;
        let installed = bin_dir.is_some();
        let mut now_installed = installed;
        if matches!(effective, EffectiveEngine::Legacy { .. })
            || is_unsupported_override(&override_id)
        {
            // G12a / D-15: a pinned, Wine Manager or Legacy engine never waits on the pre-flight.
        } else if let Some(bottle) = bottle {
            if !installed {
                preflight = Some(CrossoverPreflight::Missing {
                    detail: "CrossOver is not installed".to_string(),
                });
            } else if probes.is_bottle_ready(ctx, bottle) {
                let probed = probe_once(ctx, bottle, probes).await?;
                now_installed = !matches!(probed, CrossoverPreflight::Missing { .. });
                // WR-02: an inconclusive probe is no evidence either way: no badge.
                preflight = (!is_inconclusive(&probed)).then_some(probed);
            }
        }
        // No bottle to probe: report only whether CrossOver is installed.
        crossover_installed = now_installed;
    }
    ctx.engine_state
        .lock()
        .last_crossover_installed
        .insert(key.clone(), crossover_installed);
    let label = label_for(ctx, &key);
    Ok(Some(ctx.notices.with_view(ctx, |store| {
        compute(
            &runner,
            &app_name,
            effective,
            facts,
            &override_id,
            crossover_installed,
            preflight.as_ref(),
            label,
            store,
            None,
        )
    })))
}

/// The single flight of a bottle's page pre-flight: concurrent callers share one probe and one answer,
/// the answer is cached unless it is an inconclusive read, and the slot is released whatever it was.
async fn probe_once(
    ctx: &EngineCtx,
    bottle: &str,
    probes: &dyn StateProbes,
) -> Result<CrossoverPreflight, String> {
    let flight: Flight = ctx
        .engine_state
        .lock()
        .inflight
        .entry(bottle.to_string())
        .or_default()
        .clone();
    let own = flight.clone();
    flight
        .get_or_init(|| async {
            let result = probes.preflight(ctx, bottle).await;
            let mut inner = ctx.engine_state.lock();
            if let Ok(done) = &result {
                if !is_inconclusive(done) {
                    inner
                        .preflight_cache
                        .insert(bottle.to_string(), (done.clone(), ctx.clock.now_ms()));
                }
            }
            if inner
                .inflight
                .get(bottle)
                .is_some_and(|slot| Arc::ptr_eq(slot, &own))
            {
                inner.inflight.remove(bottle);
            }
            result
        })
        .await
        .clone()
}

/// The facts of a non-Steam game, derived from its stored settings (`getGameEngineState`): the effective
/// engine, the prefix the game runs in (a bottle, a plain prefix, Legacy or an invalid one), the
/// per-game bottle name. Reads files, never writes one (59-UAT G11).
pub fn non_steam_facts(ctx: &EngineCtx, runner: &str, app_name: &str) -> GameFacts {
    let effective = read_engine_for_game(ctx, runner, app_name);
    let stored = read_stored_game_config(ctx, app_name).unwrap_or_default();
    let global = global_settings(ctx);
    let mut settings = Map::new();
    for key in ["wineVersion", "wineCrossoverBottle", "winePrefix"] {
        if let Some(value) = stored.get(key).or_else(|| global.get(key)) {
            settings.insert(key.to_string(), value.clone());
        }
    }
    let prefix = resolve_game_prefix(runner, app_name, &Value::Object(settings), &effective);
    GameFacts {
        bottle: match &prefix {
            GamePrefix::Bottle { bottle_name, .. } => Some(bottle_name.clone()),
            _ => None,
        },
        state_without_bottle: true,
        override_eligible: !matches!(prefix, GamePrefix::Invalid),
        overlay_eligible: false,
        wine_tools_eligible: false,
        effective,
        prefix_kind: match prefix {
            GamePrefix::Invalid => None,
            GamePrefix::Legacy => Some("legacy".to_string()),
            GamePrefix::Plain { .. } => Some("plain".to_string()),
            GamePrefix::Bottle { .. } => Some("bottle".to_string()),
        },
        per_game_bottle_name: per_game_bottle_name(runner, app_name),
    }
}

/// `getGameEngineState` for a non-Steam game: `None` for a host that is not macOS, an invalid
/// identity, or a bottle-runtime (Steam) game, which has its own adapter and passes its facts in.
pub async fn get_game_engine_state(
    ctx: &EngineCtx,
    identity: &Value,
    probes: &dyn StateProbes,
) -> Result<Option<EngineState>, String> {
    if ctx.platform != Platform::Mac {
        return Ok(None);
    }
    let Some((runner, app_name)) = as_identity(identity) else {
        return Ok(None);
    };
    if engine_key_for(&runner, &app_name).is_none() || uses_bottle_runtime(&runner) {
        return Ok(None);
    }
    let facts = non_steam_facts(ctx, &runner, &app_name);
    get_engine_state(ctx, identity, &facts, probes).await
}

/// `recordLaunchDecision`: remembers what a launch used, caches its pre-flight, and pushes the state the
/// launch produced (`engineStateChanged`). An unavailable decision records and publishes nothing. An
/// automatic launch that fell back to the built-in engine for a reason the user should hear about
/// carries a launch notice; the counter is shared with the overlay, exit and deadline notices.
pub fn record_launch_decision(
    ctx: &EngineCtx,
    runner: &str,
    app_name: &str,
    decision: &LaunchDecision,
    bottle_name: &str,
    facts: &GameFacts,
) {
    let LaunchDecision::Use(used) = decision else {
        return;
    };
    let Some(key) = engine_key_for(runner, app_name) else {
        return;
    };
    let now = ctx.clock.now_ms();
    let selection = &used.selection;
    let (selection_reason, label) = match selection {
        EngineSelection::Crossover { reason, .. } => (reason.as_str(), "CrossOver".to_string()),
        EngineSelection::Pinned { reason, engine, .. }
        | EngineSelection::WineManager { reason, engine, .. } => {
            (reason.as_str(), engine.label.clone())
        }
    };
    let preflight = {
        let mut inner = ctx.engine_state.lock();
        inner.labels.insert(key.clone(), label.clone());
        if let Some(launched) = &used.preflight {
            if !is_inconclusive(launched) {
                inner
                    .preflight_cache
                    .insert(bottle_name.to_string(), (launched.clone(), now));
            }
        }
        drop(inner);
        // WR-01: an inconclusive probe proves nothing, so it never drives the badge.
        let usable = used.preflight.as_ref().filter(|p| !is_inconclusive(p));
        usable
            .cloned()
            .or_else(|| cached_preflight(ctx, bottle_name))
    };
    let mut inner = ctx.engine_state.lock();
    let installed = match &preflight {
        Some(p) => !matches!(p, CrossoverPreflight::Missing { .. }),
        None => inner
            .last_crossover_installed
            .get(&key)
            .copied()
            .unwrap_or(true),
    };
    inner
        .last_crossover_installed
        .insert(key.clone(), installed);
    let non_crossover = !matches!(selection, EngineSelection::Crossover { .. });
    let launch_notice = if non_crossover
        && used.override_id == AUTOMATIC
        && selection_reason != "override"
        && selection_reason != "cx-inconclusive"
    {
        inner.seq += 1;
        Some(LaunchNotice {
            reason: selection_reason.to_string(),
            seq: inner.seq,
        })
    } else {
        None
    };
    drop(inner);
    // The decision's override is authoritative for this launch.
    let effective = EffectiveEngine::Override {
        id: used.override_id.clone(),
        source: match &facts.effective {
            EffectiveEngine::Override { source, .. } => *source,
            EffectiveEngine::Legacy { .. } => EngineSource::Derived,
        },
    };
    let state = ctx.notices.with_view(ctx, |store| {
        compute(
            runner,
            app_name,
            &effective,
            facts,
            &used.override_id,
            installed,
            preflight.as_ref(),
            Some(label),
            store,
            launch_notice,
        )
    });
    ctx.engine_state
        .lock()
        .last_published
        .insert(key, state.clone());
    emit_engine_state(ctx, &state);
}

/// A [`CrossoverPreflight`] out of the JSON the decision layer answers (`CrossoverPreflight::to_value`),
/// for a caller that holds the decision as a value. `None` for anything else.
pub fn crossover_preflight_from_value(value: &Value) -> Option<CrossoverPreflight> {
    let object = value.as_object()?;
    let text = |key: &str| object.get(key).and_then(Value::as_str).map(str::to_string);
    let build = || text("build");
    Some(match object.get("kind")?.as_str()? {
        "healthy" => CrossoverPreflight::Healthy {
            bin_dir: text("binDir")?,
            build: build(),
            trial_days_remaining: object.get("trialDaysRemaining").and_then(Value::as_u64),
        },
        "expired" => CrossoverPreflight::Expired {
            bin_dir: text("binDir")?,
            build: build(),
            days_ago: object.get("daysAgo").and_then(Value::as_u64)?,
        },
        "broken" => CrossoverPreflight::Broken {
            bin_dir: text("binDir")?,
            build: build(),
            detail: text("detail")?,
            inconclusive: object.get("inconclusive").and_then(Value::as_bool) == Some(true),
        },
        "missing" => CrossoverPreflight::Missing {
            detail: text("detail")?,
        },
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_preflight_round_trips_through_its_value() {
        for preflight in [
            CrossoverPreflight::Healthy {
                bin_dir: "/b".to_string(),
                build: Some("26.3.0.39832".to_string()),
                trial_days_remaining: Some(7),
            },
            CrossoverPreflight::Healthy {
                bin_dir: "/b".to_string(),
                build: None,
                trial_days_remaining: None,
            },
            CrossoverPreflight::Expired {
                bin_dir: "/b".to_string(),
                build: None,
                days_ago: 3,
            },
            CrossoverPreflight::Broken {
                bin_dir: "/b".to_string(),
                build: None,
                detail: "wine exited 1".to_string(),
                inconclusive: true,
            },
            CrossoverPreflight::Missing {
                detail: "CrossOver is not installed".to_string(),
            },
        ] {
            assert_eq!(
                crossover_preflight_from_value(&preflight.to_value()),
                Some(preflight)
            );
        }
        assert_eq!(crossover_preflight_from_value(&json!({"kind": "x"})), None);
        assert_eq!(crossover_preflight_from_value(&json!(5)), None);
    }

    #[test]
    fn the_trial_notice_starts_at_seven_days() {
        assert_eq!(TRIAL_NOTICE_DAYS, 7);
        assert_eq!(ENGINE_PREFLIGHT_UNHEALTHY_TTL_MS, 60_000);
    }
}
