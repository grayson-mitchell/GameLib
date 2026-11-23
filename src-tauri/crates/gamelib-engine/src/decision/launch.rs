//! The launch decision (`decideLaunchEngine`; phase 59 D-07, D-09, D-13, D-14, D-20).
//!
//! Which engine runs a bridge title at launch: a stored per-game override first (a pin or a Wine Manager
//! build is never pre-flighted, CrossOver as an override is), else CrossOver when its pre-flight is
//! healthy, else the current pin with the reason (`cx-missing`, `cx-expired`, `cx-broken`). An
//! inconclusive pre-flight (the G29 two-probe rule, WR-01) keeps the bottle on the engine its marker
//! records. D-20: the selection is [`EngineSelection`], which has no bottled-Steam, GPTK or DXMT variant,
//! and the closed [`LaunchDecision`] cannot carry anything else.

use std::path::Path;

use serde_json::{json, Value};

use crate::bottles::marker::MarkerSummary;
use crate::bottles::registry::EngineSelection;
use crate::crossover::tested_versions::untested_log_line;
use crate::ctx::EngineCtx;
use crate::decision::preflight::{
    preflight_crossover, CrossoverPreflight, MonitorPhase, PreflightArgs, ProbeTuning,
};
use crate::engines::{
    is_pinned_engine_installed, pin_engine, pinned_engine_paths, resolve_wine_manager_staging,
    DxvkBuild, NonCrossoverEngine,
};
use crate::ids::{parse_engine_override, CROSSOVER, PINNED_PREFIX, WINE_MANAGER_PREFIX};
use crate::jsutil::path_join;
use crate::pins::{pins, EnginePin, EnginePins};

/// Why the decision fell back to the current pin (`FallbackReason`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FallbackReason {
    CxMissing,
    CxExpired,
    CxBroken,
}

impl FallbackReason {
    pub fn as_str(self) -> &'static str {
        match self {
            FallbackReason::CxMissing => "cx-missing",
            FallbackReason::CxExpired => "cx-expired",
            FallbackReason::CxBroken => "cx-broken",
        }
    }
}

/// What `decide_launch_engine` is handed. The TS reached each of these through a callback; here the
/// caller fills the two it alone knows (the stored override and the process monitor's phase) and the
/// rest are Rust calls or test seams.
#[derive(Debug, Clone, Default)]
pub struct DecideArgs {
    /// The title's engine key.
    pub key: String,
    /// The title's bottle.
    pub bottle_name: String,
    /// The stored `engineOverride` of the game's config, as stored (any JSON; the closed grammar
    /// parses it and anything else is `automatic`, T-87-46).
    pub override_value: Value,
    pub monitor_phase: Option<MonitorPhase>,
    /// Wine binaries a store hinted, probed for a CrossOver `bin` before the default locations.
    pub hint_wine_bins: Vec<String>,
    /// The pin table. `None` is the shared table, the only source a production caller uses; a test
    /// passes its own.
    pub pins: Option<EnginePins>,
    /// The bottle's read-only engine marker view (WR-01), `None` when absent or unreadable. The op
    /// reads it from disk; a test names it.
    pub marker_view: Option<MarkerSummary>,
    pub tuning: ProbeTuning,
}

/// `LaunchDecision`. Closed on purpose: a launch uses one of the three engines of [`EngineSelection`], or
/// the named override cannot be honoured.
#[derive(Debug, Clone, PartialEq)]
pub enum LaunchDecision {
    Use(Box<LaunchUse>),
    /// The override names an engine that is not usable (an unknown pin, a Wine Manager build that is not
    /// installed, CrossOver missing or broken under a CrossOver override). The launch is refused with
    /// `detail`; it never falls back to another engine silently.
    Unavailable {
        override_id: String,
        detail: String,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub struct LaunchUse {
    pub selection: EngineSelection,
    pub preflight: Option<CrossoverPreflight>,
    pub pin: Option<EnginePin>,
    pub needs_download: bool,
    pub override_id: String,
    pub log_lines: Vec<String>,
}

impl LaunchDecision {
    /// The decision's kind word as the TS had it.
    pub fn kind(&self) -> &'static str {
        match self {
            LaunchDecision::Use(_) => "use",
            LaunchDecision::Unavailable { .. } => "unavailable",
        }
    }

    /// The engine the selection names, by an exhaustive match: adding a fourth engine here would have to
    /// name it (D-20).
    pub fn engine_kind(&self) -> Option<&'static str> {
        match self {
            LaunchDecision::Use(used) => Some(match used.selection {
                EngineSelection::Crossover { .. } => "crossover",
                EngineSelection::Pinned { .. } => "pinned",
                EngineSelection::WineManager { .. } => "wine-manager",
            }),
            LaunchDecision::Unavailable { .. } => None,
        }
    }

    /// The selection's reason (`cx-healthy`, `cx-missing`, `override`, ...).
    pub fn reason(&self) -> Option<&str> {
        match self {
            LaunchDecision::Use(used) => Some(match &used.selection {
                EngineSelection::Crossover { reason, .. }
                | EngineSelection::Pinned { reason, .. }
                | EngineSelection::WineManager { reason, .. } => reason,
            }),
            LaunchDecision::Unavailable { .. } => None,
        }
    }

    pub fn to_value(&self) -> Value {
        match self {
            LaunchDecision::Use(used) => json!({
                "kind": "use",
                "selection": serde_json::to_value(&used.selection).unwrap_or(Value::Null),
                "preflight": used.preflight.as_ref().map(CrossoverPreflight::to_value),
                "pin": used
                    .pin
                    .as_ref()
                    .map(|p| serde_json::to_value(p).unwrap_or(Value::Null)),
                "needsDownload": used.needs_download,
                "override": used.override_id,
                "logLines": used.log_lines,
            }),
            LaunchDecision::Unavailable {
                override_id,
                detail,
            } => json!({
                "kind": "unavailable",
                "override": override_id,
                "detail": detail,
            }),
        }
    }
}

/// `pinnedSelection`: the pin as a launchable selection.
fn pinned_selection(ctx: &EngineCtx, pin: &EnginePin, reason: &str) -> EngineSelection {
    EngineSelection::Pinned {
        pin_id: pin.id.clone(),
        reason: reason.to_string(),
        engine: pin_engine(ctx, pin),
    }
}

/// DXVK for a Wine Manager build: the current pin's when installed, else none (logged).
fn wine_manager_dxvk(
    ctx: &EngineCtx,
    current: &EnginePin,
    log_lines: &mut Vec<String>,
) -> Option<DxvkBuild> {
    if is_pinned_engine_installed(ctx, current) {
        return Some(DxvkBuild {
            dir: pinned_engine_paths(ctx, current).dxvk_dir,
            version: current.dxvk.version.clone(),
        });
    }
    log_lines.push(
        "Engine: built-in DXVK is not installed; running the Wine Manager build without DXVK"
            .to_string(),
    );
    None
}

fn wine_manager_selection(
    version: &str,
    reason: &str,
    mut engine: NonCrossoverEngine,
    dxvk: Option<DxvkBuild>,
) -> EngineSelection {
    engine.dxvk = dxvk;
    EngineSelection::WineManager {
        manager_version: version.to_string(),
        reason: reason.to_string(),
        engine,
    }
}

/// The pin of the table with this id, current first.
fn find_pin<'a>(table: &'a EnginePins, id: &str) -> Option<&'a EnginePin> {
    std::iter::once(&table.current)
        .chain(table.previous.as_ref())
        .find(|p| p.id == id)
}

/// `finish`: the label line first, then the untested-build line for a pre-flight that found CrossOver.
fn finish(
    selection: EngineSelection,
    preflight: Option<CrossoverPreflight>,
    pin: Option<EnginePin>,
    needs_download: bool,
    override_id: &str,
    mut log_lines: Vec<String>,
) -> LaunchDecision {
    log_lines.insert(0, selection.log_label());
    if let Some(pre) = &preflight {
        if !matches!(pre, CrossoverPreflight::Missing { .. }) {
            if let Some(line) = untested_log_line(pre.build()) {
                log_lines.push(line);
            }
        }
    }
    LaunchDecision::Use(Box::new(LaunchUse {
        selection,
        preflight,
        pin,
        needs_download,
        override_id: override_id.to_string(),
        log_lines,
    }))
}

/// `decideLaunchEngine`. `Err` only when the shared pin table does not parse (a build-time mistake the
/// first test run catches); a table the caller passes is never read from the file.
pub async fn decide_launch_engine(
    ctx: &EngineCtx,
    args: &DecideArgs,
) -> Result<LaunchDecision, &'static str> {
    let shared;
    let table: &EnginePins = match &args.pins {
        Some(table) => table,
        None => {
            shared = pins()?;
            shared
        }
    };
    let override_id = parse_engine_override(&args.override_value);
    let mut log_lines: Vec<String> = Vec::new();

    if let Some(id) = override_id.strip_prefix(PINNED_PREFIX) {
        let Some(pin) = find_pin(table, id) else {
            return Ok(LaunchDecision::Unavailable {
                detail: format!("pinned engine {id} is not available"),
                override_id,
            });
        };
        return Ok(finish(
            pinned_selection(ctx, pin, "override"),
            None,
            Some(pin.clone()),
            !is_pinned_engine_installed(ctx, pin),
            &override_id,
            log_lines,
        ));
    }

    if let Some(version) = override_id.strip_prefix(WINE_MANAGER_PREFIX) {
        let Some(engine) = resolve_wine_manager_staging(ctx, version) else {
            return Ok(LaunchDecision::Unavailable {
                detail: format!("Wine Manager build {version} is not installed"),
                override_id,
            });
        };
        let dxvk = wine_manager_dxvk(ctx, &table.current, &mut log_lines);
        return Ok(finish(
            wine_manager_selection(version, "override", engine, dxvk),
            None,
            None,
            false,
            &override_id,
            log_lines,
        ));
    }

    let preflight = preflight_crossover(
        ctx,
        &PreflightArgs {
            bottle_name: args.bottle_name.clone(),
            key: Some(args.key.clone()),
            kill_on_timeout: Some(true),
            monitor_phase: args.monitor_phase,
            hint_wine_bins: args.hint_wine_bins.clone(),
            tuning: args.tuning.clone(),
        },
    )
    .await;

    // An inconclusive pre-flight is no evidence of breakage (59 D-09/G29, WR-01): the bottle stays on
    // the engine its marker records (a known pin, a Wine Manager build or a retired pin) so the engine
    // switch sees the same identity and is a no-op. A recorded engine that cannot be resolved takes
    // CrossOver per 59 D-09 and never the current pin; the switch's busy refusal still guards that move
    // (D-16). No toast, notice or badge (D-05); the label stays `cx-inconclusive` (D-13).
    if let CrossoverPreflight::Broken {
        bin_dir,
        build,
        detail,
        inconclusive: true,
    } = &preflight
    {
        if let Some(marker) = args
            .marker_view
            .as_ref()
            .filter(|m| !m.crossover && override_id != CROSSOVER)
        {
            let known = marker.pin_id.as_deref().and_then(|id| find_pin(table, id));
            if let Some(pin) = known {
                log_lines.push(format!(
                    "Engine: CrossOver pre-flight inconclusive ({detail}); keeping the bottle's built-in engine"
                ));
                return Ok(finish(
                    pinned_selection(ctx, pin, "cx-inconclusive"),
                    Some(preflight.clone()),
                    Some(pin.clone()),
                    !is_pinned_engine_installed(ctx, pin),
                    &override_id,
                    log_lines,
                ));
            }
            let wine_manager = marker
                .wine_manager_version
                .as_deref()
                .filter(|v| !v.is_empty())
                .and_then(|v| resolve_wine_manager_staging(ctx, v).map(|e| (v, e)));
            if let Some((version, engine)) = wine_manager {
                log_lines.push(format!(
                    "Engine: CrossOver pre-flight inconclusive ({detail}); keeping the bottle's Wine Manager build {version}"
                ));
                let dxvk = wine_manager_dxvk(ctx, &table.current, &mut log_lines);
                return Ok(finish(
                    wine_manager_selection(version, "cx-inconclusive", engine, dxvk),
                    Some(preflight.clone()),
                    None,
                    false,
                    &override_id,
                    log_lines,
                ));
            }
            if let (Some(retired_id), Some(retired_server)) = (
                marker.pin_id.as_deref().filter(|id| !id.is_empty()),
                marker
                    .pin_wineserver_bin
                    .as_deref()
                    .filter(|s| !s.is_empty()),
            ) {
                let dir = Path::new(retired_server)
                    .parent()
                    .map_or_else(|| ".".to_string(), |p| p.to_string_lossy().into_owned());
                let retired_wine = path_join(&[&dir, "wine"]);
                if Path::new(retired_server).exists() && Path::new(&retired_wine).exists() {
                    log_lines.push(format!(
                        "Engine: CrossOver pre-flight inconclusive ({detail}); keeping the bottle's retired built-in engine {retired_id}"
                    ));
                    return Ok(finish(
                        EngineSelection::Pinned {
                            pin_id: retired_id.to_string(),
                            reason: "cx-inconclusive".to_string(),
                            engine: NonCrossoverEngine {
                                wine_bin: retired_wine,
                                wineserver_bin: retired_server.to_string(),
                                label: format!("Built-in engine {retired_id} (retired pin)"),
                                version: retired_id.to_string(),
                                dxvk: None,
                            },
                        },
                        Some(preflight.clone()),
                        None,
                        false,
                        &override_id,
                        log_lines,
                    ));
                }
            }
            log_lines.push(
                "Engine: the bottle's recorded engine is not available; launching on CrossOver"
                    .to_string(),
            );
        }
        log_lines.push(format!(
            "Engine: CrossOver pre-flight inconclusive ({detail}); launching on CrossOver"
        ));
        let reason = if override_id == CROSSOVER {
            "override"
        } else {
            "cx-inconclusive"
        };
        return Ok(finish(
            EngineSelection::Crossover {
                reason: reason.to_string(),
                crossover_build: build.clone(),
                bin_dir: bin_dir.clone(),
            },
            Some(preflight.clone()),
            None,
            false,
            &override_id,
            log_lines,
        ));
    }

    if override_id == CROSSOVER {
        return Ok(match &preflight {
            CrossoverPreflight::Missing { detail } | CrossoverPreflight::Broken { detail, .. } => {
                LaunchDecision::Unavailable {
                    detail: format!("CrossOver override is not usable: {detail}"),
                    override_id,
                }
            }
            CrossoverPreflight::Healthy { bin_dir, build, .. }
            | CrossoverPreflight::Expired { bin_dir, build, .. } => finish(
                EngineSelection::Crossover {
                    reason: "override".to_string(),
                    crossover_build: build.clone(),
                    bin_dir: bin_dir.clone(),
                },
                Some(preflight.clone()),
                None,
                false,
                &override_id,
                log_lines,
            ),
        });
    }

    let reason = match &preflight {
        CrossoverPreflight::Healthy { bin_dir, build, .. } => {
            return Ok(finish(
                EngineSelection::Crossover {
                    reason: "cx-healthy".to_string(),
                    crossover_build: build.clone(),
                    bin_dir: bin_dir.clone(),
                },
                Some(preflight.clone()),
                None,
                false,
                &override_id,
                log_lines,
            ));
        }
        CrossoverPreflight::Missing { .. } => FallbackReason::CxMissing,
        CrossoverPreflight::Expired { .. } => FallbackReason::CxExpired,
        CrossoverPreflight::Broken { .. } => FallbackReason::CxBroken,
    };
    let pin = &table.current;
    Ok(finish(
        pinned_selection(ctx, pin, reason.as_str()),
        Some(preflight),
        Some(pin.clone()),
        !is_pinned_engine_installed(ctx, pin),
        &override_id,
        log_lines,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_decision_kinds_name_exactly_the_three_engines() {
        // An exhaustive match: a fourth engine kind would not compile here until it is named (D-20).
        fn names(selection: &EngineSelection) -> &'static str {
            match selection {
                EngineSelection::Crossover { .. } => "crossover",
                EngineSelection::Pinned { .. } => "pinned",
                EngineSelection::WineManager { .. } => "wine-manager",
            }
        }
        let engine = NonCrossoverEngine {
            wine_bin: "w".into(),
            wineserver_bin: "s".into(),
            label: "l".into(),
            version: "v".into(),
            dxvk: None,
        };
        let pinned = EngineSelection::Pinned {
            pin_id: "p".into(),
            reason: "cx-missing".into(),
            engine,
        };
        assert_eq!(names(&pinned), "pinned");
        let decision = LaunchDecision::Use(Box::new(LaunchUse {
            selection: pinned,
            preflight: None,
            pin: None,
            needs_download: false,
            override_id: "automatic".into(),
            log_lines: Vec::new(),
        }));
        assert_eq!(decision.engine_kind(), Some("pinned"));
        assert_eq!(decision.reason(), Some("cx-missing"));
        assert_eq!(decision.kind(), "use");
        let refused = LaunchDecision::Unavailable {
            override_id: "crossover".into(),
            detail: "d".into(),
        };
        assert_eq!(refused.engine_kind(), None);
        assert_eq!(refused.to_value()["kind"], "unavailable");
    }
}
