//! The CrossOver pre-flight (`preflightCrossover`, `isCrossoverMissing`; phase 59 D-09, G25, G29).
//!
//! A `--demo-status` timeout, nonzero exit or spawn failure must be corroborated before CrossOver
//! counts as broken (G29: one nonzero exit 3 s after an overlay-clone session demoted a healthy
//! CrossOver). D-09 as amended 2026-11-03: broken only when seen on two consecutive attempts; the
//! budget is two probes in total across failure kinds. D-07: the corroboration lives inside one
//! pre-flight call and nothing is stored between launches.
//!
//! One difference from the TS, recorded in `crossover::demo_status`: a `SpecRunner` cannot tell a spawn
//! that failed from a child that was killed, so the TS `spawn-error` arm reads here as `nonzero-exit`
//! with `code=null`. Both were already treated alike by the retry rule.

use std::path::Path;
use std::time::Duration;

use serde::Deserialize;
use serde_json::{json, Value};

use crate::bottles::lifecycle::kill_bottle_wineserver;
use crate::crossover::demo_status::{
    probe_demo_status, utf16_prefix, DemoStatus, DemoStatusProbe, ProbeFailure,
};
use crate::crossover::tested_versions::read_crossover_build;
use crate::ctx::EngineCtx;
use crate::jsutil::path_join;

/// The budget is two probes in total across failure kinds.
const PROBE_ATTEMPTS: u32 = 2;
/// Settle wait before a retry after a nonzero exit (G29).
const RETRY_SETTLE_MS: u64 = 2000;
/// The wineserver stop after a failed probe is capped like every other (15 s).
const WINESERVER_KILL_CAP: Duration = Duration::from_secs(15);

/// The process monitor's phase for a title (`monitorPhase`): a title that is starting or running.
/// The monitor is still the TS's, so the caller fills it (a value field, never a callback).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MonitorPhase {
    Starting,
    Running,
}

/// What a pre-flight can read of the probe's surroundings that production leaves at its default. A
/// test replaces them: the base environment (a fake profile instead of the real-profile arm of D-18),
/// the probe's time limit and the settle wait.
#[derive(Debug, Clone, Default)]
pub struct ProbeTuning {
    /// `None`: the production call, the real profile inherited. `Some`: used verbatim.
    pub base_env: Option<Vec<(String, String)>>,
    pub timeout_ms: Option<u64>,
    /// `None`: 2000 ms.
    pub retry_settle_ms: Option<u64>,
}

/// What `preflight_crossover` needs of the call.
#[derive(Debug, Clone, Default)]
pub struct PreflightArgs {
    pub bottle_name: String,
    /// The title's engine key, when a launch is the caller. A key makes a running game or a busy
    /// bottle a reason not to stop the wineserver (59-REVIEW WR-07).
    pub key: Option<String>,
    /// `false` for a page read (never stops a wineserver); `None` and `true` allow it.
    pub kill_on_timeout: Option<bool>,
    pub monitor_phase: Option<MonitorPhase>,
    pub hint_wine_bins: Vec<String>,
    pub tuning: ProbeTuning,
}

/// `CrossoverPreflight`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CrossoverPreflight {
    Healthy {
        bin_dir: String,
        build: Option<String>,
        trial_days_remaining: Option<u64>,
    },
    Expired {
        bin_dir: String,
        build: Option<String>,
        days_ago: u64,
    },
    Broken {
        bin_dir: String,
        build: Option<String>,
        detail: String,
        /// A page read timed out without a retry; says nothing certain about CrossOver.
        inconclusive: bool,
    },
    Missing {
        detail: String,
    },
}

impl CrossoverPreflight {
    pub fn kind(&self) -> &'static str {
        match self {
            CrossoverPreflight::Healthy { .. } => "healthy",
            CrossoverPreflight::Expired { .. } => "expired",
            CrossoverPreflight::Broken { .. } => "broken",
            CrossoverPreflight::Missing { .. } => "missing",
        }
    }

    /// The build the pre-flight read; a missing CrossOver has none (the TS `'build' in preflight`).
    pub fn build(&self) -> Option<&str> {
        match self {
            CrossoverPreflight::Healthy { build, .. }
            | CrossoverPreflight::Expired { build, .. }
            | CrossoverPreflight::Broken { build, .. } => build.as_deref(),
            CrossoverPreflight::Missing { .. } => None,
        }
    }

    /// The TS object. `inconclusive` appears only when it is true, as the TS set it.
    pub fn to_value(&self) -> Value {
        match self {
            CrossoverPreflight::Healthy {
                bin_dir,
                build,
                trial_days_remaining,
            } => json!({
                "kind": "healthy",
                "binDir": bin_dir,
                "build": build,
                "trialDaysRemaining": trial_days_remaining,
            }),
            CrossoverPreflight::Expired {
                bin_dir,
                build,
                days_ago,
            } => json!({
                "kind": "expired",
                "binDir": bin_dir,
                "build": build,
                "daysAgo": days_ago,
            }),
            CrossoverPreflight::Broken {
                bin_dir,
                build,
                detail,
                inconclusive,
            } => {
                let mut value = json!({
                    "kind": "broken",
                    "binDir": bin_dir,
                    "build": build,
                    "detail": detail,
                });
                if *inconclusive {
                    value["inconclusive"] = Value::Bool(true);
                }
                value
            }
            CrossoverPreflight::Missing { detail } => {
                json!({ "kind": "missing", "detail": detail })
            }
        }
    }
}

/// `accessSync(path, X_OK)`: some execute bit is set. A real `access(2)` would also weigh the caller's
/// identity; the engine layer only asks "is this file meant to be run".
pub(crate) fn is_executable(path: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::metadata(path)
            .map(|m| m.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        path.exists()
    }
}

/// G25: true when CrossOver is not installed. Mirrors the two `missing` branches at the top of
/// [`preflight_crossover`] without the probe, so it is safe to call before the D-09 pre-flight.
pub async fn is_crossover_missing(ctx: &EngineCtx, hint_wine_bins: &[String]) -> bool {
    match ctx
        .crossover_locator
        .resolve_bin_dir(ctx, hint_wine_bins)
        .await
    {
        None => true,
        Some(bin_dir) => !Path::new(&path_join(&[&bin_dir, "wine"])).exists(),
    }
}

fn warn(ctx: &EngineCtx, line: &str) {
    if let Some(log) = &ctx.log {
        log.warn(line);
    }
}

/// Stops the CrossOver wineserver of a bottle after a failed probe (66.1-22e). The kill never fails: a
/// spawn that did not run or a run cut by its cap is logged by the kill itself.
async fn stop_wineserver(ctx: &EngineCtx, bottle_name: &str, bin_dir: &str) {
    let cx_root = Path::new(bin_dir)
        .parent()
        .map_or_else(|| ".".to_string(), |p| p.to_string_lossy().into_owned());
    kill_bottle_wineserver(
        ctx,
        bottle_name,
        &path_join(&[bin_dir, "wineserver"]),
        &[("CX_ROOT".to_string(), cx_root)],
        WINESERVER_KILL_CAP,
    )
    .await;
}

/// `preflightCrossover`: locate CrossOver and decide whether it is healthy, expired, broken or missing.
pub async fn preflight_crossover(ctx: &EngineCtx, args: &PreflightArgs) -> CrossoverPreflight {
    let Some(bin_dir) = ctx
        .crossover_locator
        .resolve_bin_dir(ctx, &args.hint_wine_bins)
        .await
    else {
        return CrossoverPreflight::Missing {
            detail: "CrossOver is not installed".to_string(),
        };
    };
    let wine_bin = path_join(&[&bin_dir, "wine"]);
    if !Path::new(&wine_bin).exists() {
        return CrossoverPreflight::Missing {
            detail: "CrossOver bin/wine is missing".to_string(),
        };
    }
    if !is_executable(Path::new(&wine_bin)) {
        return CrossoverPreflight::Broken {
            bin_dir,
            build: None,
            detail: "CrossOver bin/wine is not executable".to_string(),
            inconclusive: false,
        };
    }
    let bottle = args.bottle_name.as_str();
    let run_probe = || {
        probe_demo_status(
            ctx,
            &bin_dir,
            bottle,
            args.tuning.timeout_ms,
            args.tuning.base_env.as_deref(),
        )
    };
    let (build, first_probe) = tokio::join!(read_crossover_build(ctx, &bin_dir), run_probe());
    let mut probe = first_probe;

    // 59-REVIEW WR-07: never stop a wineserver for a display read, or while a game of this title is
    // running or starting.
    let no_kill_reason: Option<&str> = if args.kill_on_timeout == Some(false) {
        Some("page read")
    } else if args.key.as_deref().is_some_and(|key| {
        args.monitor_phase.is_some() || !ctx.ledger.other_games_running(bottle, key).is_empty()
    }) {
        Some("game running")
    } else {
        None
    };
    let settle_ms = args.tuning.retry_settle_ms.unwrap_or(RETRY_SETTLE_MS);

    // A single timeout, nonzero exit or spawn error is inconclusive: stop the wineserver (when
    // allowed), settle, and probe again (G29).
    let mut attempt = 1;
    while let DemoStatusProbe::Failed { reason, detail, .. } = &probe {
        if !matches!(reason, ProbeFailure::Timeout | ProbeFailure::NonzeroExit) {
            break;
        }
        let is_timeout = *reason == ProbeFailure::Timeout;
        if let (true, Some(why)) = (is_timeout, no_kill_reason) {
            return CrossoverPreflight::Broken {
                bin_dir,
                build,
                inconclusive: true,
                detail: format!("--demo-status timeout (not retried: {why}): {detail}"),
            };
        }
        let last = attempt >= PROBE_ATTEMPTS;
        if is_timeout || (!last && no_kill_reason.is_none()) {
            stop_wineserver(ctx, bottle, &bin_dir).await;
        }
        if last {
            return CrossoverPreflight::Broken {
                bin_dir,
                build,
                inconclusive: false,
                detail: format!(
                    "--demo-status {} on {PROBE_ATTEMPTS} consecutive attempts: {detail}",
                    reason.as_str()
                ),
            };
        }
        warn(
            ctx,
            &format!(
                "Engine: --demo-status {} for bottle {} (attempt {attempt}/{PROBE_ATTEMPTS}); inconclusive, retrying once",
                reason.as_str(),
                utf16_prefix(bottle, 64)
            ),
        );
        if settle_ms > 0 {
            tokio::time::sleep(Duration::from_millis(settle_ms)).await;
        }
        probe = run_probe().await;
        attempt += 1;
    }

    match probe {
        DemoStatusProbe::Failed {
            reason: ProbeFailure::InvalidBottle,
            detail,
            ..
        } => CrossoverPreflight::Broken {
            bin_dir,
            build,
            inconclusive: true,
            detail: format!("--demo-status invalid-bottle (no evidence; not retried): {detail}"),
        },
        DemoStatusProbe::Failed { reason, detail, .. } => CrossoverPreflight::Broken {
            bin_dir,
            build,
            inconclusive: false,
            detail: format!("--demo-status {}: {detail}", reason.as_str()),
        },
        DemoStatusProbe::Ok { status, .. } => match status {
            DemoStatus::Licensed => CrossoverPreflight::Healthy {
                bin_dir,
                build,
                trial_days_remaining: None,
            },
            DemoStatus::Trial { days_remaining } => CrossoverPreflight::Healthy {
                bin_dir,
                build,
                trial_days_remaining: Some(days_remaining),
            },
            DemoStatus::Expired { days_ago } => CrossoverPreflight::Expired {
                bin_dir,
                build,
                days_ago,
            },
            DemoStatus::Unrecognised => CrossoverPreflight::Broken {
                bin_dir,
                build,
                inconclusive: false,
                detail: "--demo-status output was not recognised".to_string(),
            },
        },
    }
}
