//! The launch-time engine step of every non-Steam launch on macOS (Phase 61 D-04..D-07, D-13, D-16;
//! ported from `launchEngine.ts`'s `selectEngineForLaunch`, Phase 87 D-01).
//!
//! One call per launch runs Phase 59's sequence: eligibility, the effective engine, the prefix, the
//! game's own bottle on first need, the offline refusal, the decision with the G29 two-probe rule,
//! the first-need pinned-engine download with progress, the registration, the registry and overlay
//! context, the bottle switch (with the DXVK step) and the decision record. A forced CrossOver override
//! on a broken CrossOver refuses. The chosen engine reaches the store launch only through the
//! `launch_settings` the reply carries; nothing here writes the game's config (59 D-07, D-08).
//!
//! Deliberately NOT here (D-20): bridge failure marking and any reroute to bottled Steam. The closed
//! [`EngineSelection`] has no such variant, so the step cannot name one.
//!
//! The collaborators the TS passed as `Partial<LaunchEngineDeps>` are [`StepDeps`]: production is
//! [`CtxStepDeps`] (the real bottle creation, pin download, bottle switch and decision), and the
//! goldens script them. The offline gate is composed inline here from the pieces 87-46 verified
//! (`offline_launch_certainly_blocked` over the marker and pin reads).
//!
//! The engine log lines the TS wrote with `logInfo` and `logWarning` go to `ctx.log`, which is `None`
//! in the app today (the shell has no `EngineLog`), so they reach no log there; the lines meant for
//! the game's own launch log travel in the reply's `log_lines`.

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;

use serde_json::{json, Map, Value};

use crate::bottles::lifecycle::{dirname, kill_bottle_wineserver, KILL_TIMEOUT_MS};
use crate::bottles::marker::{read_marker_summary, restore_needs_absent_pin};
use crate::bottles::per_game::{
    ensure_per_game_bottle, CreationDecision as BottleCreation, CtxPerGameDeps, EnsureArgs,
    EnsureOutcome,
};
use crate::bottles::prefix::prefix_to_value;
use crate::bottles::registry::EngineSelection;
use crate::bottles::switch::{
    prepare_bottle_for_engine, PrepareArgs, PrepareOutcome, PrepareReason, PrepareResult,
};
use crate::config::{global_settings, read_engine_for_game, EffectiveEngine};
use crate::ctx::{EngineCtx, Platform};
use crate::decision::creation::{decide_creation_engine, CreationDecision};
use crate::decision::launch::{decide_launch_engine, DecideArgs, LaunchDecision};
use crate::decision::offline::{offline_launch_certainly_blocked, OfflineArm, OfflineRefusalInput};
use crate::decision::preflight::{is_crossover_missing, CrossoverPreflight, ProbeTuning};
use crate::engines::{
    is_bottle_provisioned, is_pinned_engine_installed, read_bottle_engine_marker_kind,
};
use crate::fallback::ensure::{
    ensure_pinned_engine, EnsureArgs as PinEnsureArgs, PinnedEngineResult,
};
use crate::fallback::progress::STATUS_CHANNEL;
use crate::game_prefix::{resolve_game_prefix, GamePrefix};
use crate::ids::{pin_by_id, AUTOMATIC, CROSSOVER};
use crate::jsutil::path_join;
use crate::key::{engine_key_if_eligible, GameIdentity};
use crate::launch::deadline::{self, ArmError, DeadlineKind, NoticeTarget};
use crate::launch::dialogs::{notify_engine_fallback, show_engine_dialog, Notice};
use crate::launch::settings::{build_crossover_game_settings, OverlayContext};
use crate::pins::{pins, EnginePin};
use crate::state::engine_state::{record_launch_decision, GameFacts};

const BOTTLE_CREATE_FAILED: (&str, &str) = (
    "gamelib:engine.bottleCreateFailed",
    "GameLib couldn't set up this game's bottle ({{reason}}), so it did not start. Check the launch log (Settings > Logs).",
);
const DOWNLOAD_FAILED: (&str, &str) = (
    "gamelib:steam.engine.downloadFailed",
    "GameLib couldn't download its built-in engine ({{reason}}). Check your connection and try again.",
);
const OVERRIDE_UNAVAILABLE: (&str, &str) = (
    "gamelib:steam.engine.overrideUnavailable",
    "The engine chosen for this game in Wine settings is not available ({{detail}}). Choose Automatic or install it.",
);
const SELECTION_REJECTED: (&str, &str) = (
    "gamelib:steam.engine.selectionRejected",
    "GameLib couldn't set up {{engine}} for this game, so it did not start. Check the launch log (Settings > Logs).",
);
const RESTORE_FAILED: (&str, &str) = (
    "gamelib:steam.engine.restoreFailed",
    "GameLib couldn't finish switching {{title}} back to CrossOver, so it did not start. Check your connection and try again; GameLib retries the switch on the next launch.",
);
const BOTTLE_BUSY: (&str, &str) = (
    "gamelib:engine.bottleBusy",
    "Another game is running in this game's bottle, so GameLib can't switch its engine now. Quit the other game, then try again.",
);

/// A future that may borrow the deps and the context it runs over.
pub type Fut<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// Why the step runs: a launch, or the setup of a game whose installer is about to run (no fallback toast).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Purpose {
    Launch,
    Setup,
}

/// What the launcher hands the step (the slice of `Game` and the launch options the TS read).
#[derive(Debug, Clone)]
pub struct SelectArgs {
    pub runner: String,
    pub app_name: String,
    pub title: String,
    /// The install directory. Selection does not read it; the launch deadline's process watch does.
    pub install_path: Option<String>,
    /// `getGameInfo().install?.platform`; `Browser` is never engine-controlled.
    pub platform: Option<String>,
    pub is_native: bool,
    /// The game's stored settings (`game.getSettings()`): the prefix is resolved from them and the
    /// per-launch overlay is built over them.
    pub settings: Value,
    pub offline: bool,
    pub purpose: Purpose,
}

/// The kinds of answer (`LaunchEngineStep.kind`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SelectKind {
    /// The engine layer does not apply (native, browser, non-macOS, a bottle-runtime store).
    Skip,
    /// A Wine outside the option list: the launch is exactly as before.
    Legacy,
    Use,
    /// Nothing may start: the dialog (if any) has been shown.
    Refused,
}

impl SelectKind {
    pub fn as_str(self) -> &'static str {
        match self {
            SelectKind::Skip => "skip",
            SelectKind::Legacy => "legacy",
            SelectKind::Use => "use",
            SelectKind::Refused => "refused",
        }
    }
}

/// What the step answers: the step the TS launcher branches on, the lines for the game's launch log and
/// the settings the launch runs with.
#[derive(Debug, Clone, PartialEq)]
pub struct SelectReply {
    pub kind: SelectKind,
    pub key: Option<String>,
    pub selection: Option<EngineSelection>,
    pub prefix: Option<GamePrefix>,
    /// `engine=... reason=...` lines for the TS caller's log writer (D-13).
    pub log_lines: Vec<String>,
    /// The settings the launch runs with: the stored ones under the chosen engine's overlay.
    pub launch_settings: Option<Value>,
}

impl SelectReply {
    fn bare(kind: SelectKind, key: Option<String>, log_lines: Vec<String>) -> SelectReply {
        SelectReply {
            kind,
            key,
            selection: None,
            prefix: None,
            log_lines,
            launch_settings: None,
        }
    }

    /// `{kind, key?, selection?, prefix?, logLines, launchSettings?}`; a skip is `{kind: 'skip'}`.
    pub fn to_value(&self) -> Value {
        let mut out = json!({ "kind": self.kind.as_str() });
        if self.kind == SelectKind::Skip {
            return out;
        }
        out["key"] = json!(self.key);
        if let Some(selection) = &self.selection {
            out["selection"] = serde_json::to_value(selection).unwrap_or(Value::Null);
        }
        if let Some(prefix) = &self.prefix {
            out["prefix"] = prefix_to_value(prefix);
        }
        out["logLines"] = json!(self.log_lines);
        if let Some(settings) = &self.launch_settings {
            out["launchSettings"] = settings.clone();
        }
        out
    }
}

/// The game a step collaborator acts for (the status events name it).
#[derive(Debug, Clone, Copy)]
pub struct GameRef<'a> {
    pub runner: &'a str,
    pub app_name: &'a str,
}

/// The collaborators of the step (`LaunchEngineDeps`). Production is [`CtxStepDeps`]; the goldens script
/// the ones whose real work is another plan's golden (the bottle creation, the pin download and the
/// engine switch) or that the TS scripted (the effective engine and the bottle's existence).
pub trait StepDeps: Send + Sync {
    /// `readEffective`.
    fn read_effective(&self, ctx: &EngineCtx, game: &GameRef<'_>) -> EffectiveEngine;
    /// `isProvisioned`.
    fn is_provisioned(&self, ctx: &EngineCtx, bottle_name: &str) -> bool;
    /// `ensureGameBottle`: the game's own bottle, created once.
    fn ensure_game_bottle<'a>(
        &'a self,
        ctx: &'a EngineCtx,
        args: &'a EnsureArgs,
    ) -> Fut<'a, EnsureOutcome>;
    /// `ensurePinned`: the pin's engine made available, with its status events.
    fn ensure_pinned<'a>(
        &'a self,
        ctx: &'a EngineCtx,
        pin: &'a EnginePin,
        game: &'a GameRef<'a>,
    ) -> Fut<'a, PinnedEngineResult>;
    /// `prepare`: the bottle switch to the chosen engine.
    fn prepare<'a>(
        &'a self,
        ctx: &'a EngineCtx,
        args: PrepareArgs,
        game: &'a GameRef<'a>,
    ) -> Fut<'a, PrepareResult>;
    /// The launch decision (`decideLaunchEngine`).
    fn decide<'a>(
        &'a self,
        ctx: &'a EngineCtx,
        args: DecideArgs,
    ) -> Fut<'a, Result<LaunchDecision, &'static str>>;
    /// What the pre-flight's probes read (the base environment, the settle wait); the production call
    /// leaves them at their defaults.
    fn probe_tuning(&self) -> ProbeTuning;
}

/// The collaborators of the app: every one is the real function.
#[derive(Debug, Default, Clone, Copy)]
pub struct CtxStepDeps;

impl StepDeps for CtxStepDeps {
    fn read_effective(&self, ctx: &EngineCtx, game: &GameRef<'_>) -> EffectiveEngine {
        read_engine_for_game(ctx, game.runner, game.app_name)
    }

    fn is_provisioned(&self, ctx: &EngineCtx, bottle_name: &str) -> bool {
        is_bottle_provisioned(ctx, bottle_name)
    }

    fn ensure_game_bottle<'a>(
        &'a self,
        ctx: &'a EngineCtx,
        args: &'a EnsureArgs,
    ) -> Fut<'a, EnsureOutcome> {
        Box::pin(async move {
            let decision = match decide_creation_engine(ctx, &args.key, None).await {
                Ok(CreationDecision::Crossover {
                    create_timeout_ms, ..
                }) => BottleCreation::Crossover {
                    create_timeout: Duration::from_millis(create_timeout_ms),
                },
                Ok(CreationDecision::Pinned { pin, .. }) => BottleCreation::Pinned { pin },
                Err(error) => {
                    return EnsureOutcome::Failed {
                        error_code: None,
                        error: error.to_string(),
                    }
                }
            };
            let settings = Value::Object(global_settings(ctx));
            let deps = CtxPerGameDeps::new(ctx, decision, settings);
            ensure_per_game_bottle(ctx, &deps, args).await
        })
    }

    fn ensure_pinned<'a>(
        &'a self,
        ctx: &'a EngineCtx,
        pin: &'a EnginePin,
        game: &'a GameRef<'a>,
    ) -> Fut<'a, PinnedEngineResult> {
        Box::pin(async move {
            let request = PinEnsureArgs {
                pin_id: pin.id.clone(),
                app_name: game.app_name.to_string(),
                runner: game.runner.to_string(),
                cancel_id: None,
            };
            match ensure_pinned_engine(ctx, &request).await {
                Ok(result) => result,
                // An unknown pin or a bad cancel id: the pin came from the shared table, so this is
                // a table that cannot be read. Said as a failed download, never as an abort.
                Err(error) => PinnedEngineResult::Failed {
                    aborted: false,
                    reason: crate::fallback::ensure::EnsureReason::DownloadFailed,
                    error,
                },
            }
        })
    }

    /// `prepareBottle`'s second half (the TS caller side of the switch): a restore to CrossOver whose DXVK
    /// source is the pinned engine answers `dxvk-failed` ("no DXVK source to restore") before it stops,
    /// installs or writes anything, so the pin is made available here and the switch is asked once more.
    fn prepare<'a>(
        &'a self,
        ctx: &'a EngineCtx,
        args: PrepareArgs,
        game: &'a GameRef<'a>,
    ) -> Fut<'a, PrepareResult> {
        Box::pin(async move {
            let mut result = prepare_bottle_for_engine(ctx, &args).await;
            let no_source = matches!(
                &result.outcome,
                PrepareOutcome::Refused { reason: PrepareReason::DxvkFailed, detail }
                    if detail.starts_with("no DXVK source to restore")
            );
            if no_source && matches!(args.next, EngineSelection::Crossover { .. }) {
                let from_marker = read_marker_summary(ctx, &args.bottle_name)
                    .and_then(|marker| marker.pin_id)
                    .and_then(|id| pin_by_id(&id));
                let pin = from_marker.or_else(|| pins().ok().map(|table| &table.current));
                if let Some(pin) = pin {
                    // The download's own failure is the second switch's refusal; nothing to branch on here.
                    let _ = self.ensure_pinned(ctx, pin, game).await;
                    result = prepare_bottle_for_engine(ctx, &args).await;
                }
            }
            result
        })
    }

    fn decide<'a>(
        &'a self,
        ctx: &'a EngineCtx,
        args: DecideArgs,
    ) -> Fut<'a, Result<LaunchDecision, &'static str>> {
        Box::pin(async move { decide_launch_engine(ctx, &args).await })
    }

    fn probe_tuning(&self) -> ProbeTuning {
        ProbeTuning::default()
    }
}

/// The CrossOver bin dir a pre-flight found, `""` when it found none (`'binDir' in preflight`).
fn preflight_bin_dir(preflight: Option<&CrossoverPreflight>) -> String {
    match preflight {
        Some(
            CrossoverPreflight::Healthy { bin_dir, .. }
            | CrossoverPreflight::Expired { bin_dir, .. }
            | CrossoverPreflight::Broken { bin_dir, .. },
        ) => bin_dir.clone(),
        _ => String::new(),
    }
}

/// What the offline gate read for one launch (87-63): both offline signals, whether the game is on a bottle,
/// the effective engine and, when the gate applied, its inputs and its verdict.
struct GateFacts<'a> {
    request_offline: bool,
    context_online: bool,
    on_bottle: bool,
    override_id: &'a str,
    applied: Option<(&'a OfflineRefusalInput, Option<OfflineArm>)>,
}

/// The gate's reading as one engine-log line: words and booleans only (the override id is a closed grammar
/// word), so no path or account name can reach `gamelib.log` through it.
fn offline_gate_line(facts: &GateFacts<'_>) -> String {
    let head = format!(
        "offline gate: request-offline={} context-online={} on-bottle={} override={}",
        facts.request_offline, facts.context_online, facts.on_bottle, facts.override_id
    );
    match facts.applied {
        None => format!("{head} verdict=not-applicable"),
        Some((input, verdict)) => {
            let marker = input.marker_kind.map_or("none", |kind| kind.as_str());
            let verdict = match verdict {
                None => "proceeds".to_string(),
                Some(arm) => format!("blocked:{}", arm.as_str()),
            };
            format!(
                "{head} crossover-missing={} current-pin-installed={} marker={marker} restore-needs-pin={} verdict={verdict}",
                input.crossover_missing, input.current_pin_installed, input.restore_needs_absent_pin
            )
        }
    }
}

/// One run of the step: the context, the collaborators, the game and the lines for its launch log.
struct Step<'a> {
    ctx: &'a EngineCtx,
    key: String,
    title: &'a str,
    log_lines: Vec<String>,
}

impl Step<'_> {
    /// `writeLog`: the engine log gets `Engine: <key> <line>`, the game's launch log the bare line.
    fn write_log(&mut self, line: &str) {
        if let Some(log) = self.ctx.log.as_deref() {
            log.info(&format!("Engine: {} {line}", self.key));
        }
        self.log_lines.push(line.to_string());
    }

    fn warn(&self, line: &str) {
        if let Some(log) = self.ctx.log.as_deref() {
            log.warn(&format!("Engine: {} {line}", self.key));
        }
    }

    /// An engine-log line that is not for the game's launch log (a reading of the step's own inputs).
    fn note(&self, line: &str) {
        if let Some(log) = self.ctx.log.as_deref() {
            log.info(&format!("Engine: {} {line}", self.key));
        }
    }

    /// The refusal dialog: `i18n_key` (with its inline default) interpolated with `params`, shown with a
    /// window raise on every attempt.
    fn dialog(&self, i18n_key: &str, default: &str, params: &[(&str, &str)], tag: &str) {
        let params: Map<String, Value> = params
            .iter()
            .map(|(name, value)| ((*name).to_string(), Value::String((*value).to_string())))
            .collect();
        let body = self.ctx.i18n.t(i18n_key, default, &params);
        show_engine_dialog(
            self.ctx,
            &Notice {
                key: &self.key,
                title: self.title,
                body: &body,
                tag,
            },
        );
    }

    /// `dropEngineSelection` and the overlay clear: nothing a refused launch registered stays.
    fn refuse(&mut self) -> SelectReply {
        self.ctx.registry.clear_engine_selection_quiet(&self.key);
        self.ctx
            .launch_settings
            .clear_launch_overlay_context(&self.key);
        SelectReply::bare(
            SelectKind::Refused,
            Some(self.key.clone()),
            std::mem::take(&mut self.log_lines),
        )
    }
}

/// G22/G25: the offline gate's inputs and verdict for one game, gathered in one place so the launch step and
/// the engine state the game page reads (`offlineLaunchRefused`, 87-76) cannot drift apart. Offline is taken
/// as true: the caller decides whether the launch is offline. `None` when the gate does not apply (the game
/// is not on its bottle, or its engine is neither Automatic nor CrossOver); otherwise the inputs and the
/// verdict, `None` meaning the launch is not certainly blocked.
pub(crate) async fn offline_gate_verdict(
    ctx: &EngineCtx,
    on_bottle: bool,
    bottle_name: &str,
    effective_id: &str,
) -> Option<(OfflineRefusalInput, Option<OfflineArm>)> {
    if !on_bottle || (effective_id != AUTOMATIC && effective_id != CROSSOVER) {
        return None;
    }
    let current_pin_installed = pins()
        .map(|table| is_pinned_engine_installed(ctx, &table.current))
        .unwrap_or(false);
    let input = OfflineRefusalInput {
        offline: true,
        override_id: effective_id.to_string(),
        crossover_missing: is_crossover_missing(ctx, &[]).await,
        marker_kind: read_bottle_engine_marker_kind(ctx, bottle_name),
        current_pin_installed,
        restore_needs_absent_pin: restore_needs_absent_pin(ctx, bottle_name),
    };
    let verdict = offline_launch_certainly_blocked(&input);
    Some((input, verdict))
}

/// RF1 (87-72 `## Root cause`, confirmed by the 2026-11-25 isolating run): whether the bottle's wineserver
/// may be a server the pre-flight's own `--demo-status` probe started. That is so on a CrossOver launch whose
/// probe came back healthy and whose bottle was not switched. A switch stops the previous engine's server
/// itself (`bottles::switch`, `kill_previous`), so after one the launch already starts cold. The probe boots
/// the bottle without the launch's sync environment (`WINEESYNC` and `WINEMSYNC`), and legendary's or nile's
/// wine child then never starts against that warm server.
fn prepare_left_server_warm(
    selection: &EngineSelection,
    prepared: &PrepareResult,
    probe_healthy: bool,
) -> bool {
    probe_healthy
        && !prepared.switched
        && matches!(prepared.outcome, PrepareOutcome::Prepared)
        && matches!(selection, EngineSelection::Crossover { .. })
}

/// Select and prepare the engine for one launch (`selectEngineForLaunch`). `Skip` means the engine layer
/// does not apply and the launch runs exactly as before.
pub async fn select_engine_for_launch(
    ctx: &EngineCtx,
    deps: &dyn StepDeps,
    args: &SelectArgs,
) -> SelectReply {
    let identity = GameIdentity {
        runner: &args.runner,
        app_name: &args.app_name,
        native: args.is_native,
        install_platform: args.platform.as_deref(),
    };
    let Some(key) = engine_key_if_eligible(&identity, ctx.platform == Platform::Mac) else {
        return SelectReply::bare(SelectKind::Skip, None, Vec::new());
    };
    let game = GameRef {
        runner: &args.runner,
        app_name: &args.app_name,
    };
    let mut step = Step {
        ctx,
        key,
        title: &args.title,
        log_lines: Vec::new(),
    };

    let effective = deps.read_effective(ctx, &game);
    let effective_id = match &effective {
        EffectiveEngine::Legacy { label } => {
            // D-07: the engine step is skipped entirely; the launch is exactly as today.
            let name = match label {
                Some(Value::String(text)) => text.clone(),
                Some(other) => crate::jsutil::js_to_string(other),
                None => "undefined".to_string(),
            };
            step.write_log(&format!("engine=legacy name=\"{name}\" reason=override"));
            return SelectReply::bare(
                SelectKind::Legacy,
                Some(step.key.clone()),
                std::mem::take(&mut step.log_lines),
            );
        }
        EffectiveEngine::Override { id, .. } => id.clone(),
    };

    let prefix = resolve_game_prefix(&args.runner, &args.app_name, &args.settings, &effective);
    let bottle_name = match &prefix {
        GamePrefix::Legacy => {
            return SelectReply::bare(
                SelectKind::Legacy,
                Some(step.key.clone()),
                std::mem::take(&mut step.log_lines),
            )
        }
        GamePrefix::Invalid => {
            step.warn("has no valid prefix; not launching");
            step.dialog(
                BOTTLE_CREATE_FAILED.0,
                BOTTLE_CREATE_FAILED.1,
                &[("reason", "invalid game identity")],
                "engine-invalid-prefix",
            );
            return step.refuse();
        }
        GamePrefix::Bottle { bottle_name, .. } => bottle_name.clone(),
        GamePrefix::Plain { .. } => String::new(),
    };
    let on_bottle = matches!(prefix, GamePrefix::Bottle { .. });

    // D-02: the game's own bottle is created on first need; a legacy shared bottle is never created.
    let legacy_shared = matches!(
        prefix,
        GamePrefix::Bottle {
            origin: crate::game_prefix::BottleOrigin::LegacyCrossover,
            ..
        }
    );
    if on_bottle && !legacy_shared && !deps.is_provisioned(ctx, &bottle_name) {
        let made = deps
            .ensure_game_bottle(
                ctx,
                &EnsureArgs {
                    key: step.key.clone(),
                    bottle_name: bottle_name.clone(),
                    app_name: args.app_name.clone(),
                    runner: args.runner.clone(),
                    cancel: None,
                },
            )
            .await;
        if let EnsureOutcome::Failed { error, .. } = made {
            step.warn(&format!(
                "bottle \"{bottle_name}\" could not be created: {error}"
            ));
            step.dialog(
                BOTTLE_CREATE_FAILED.0,
                BOTTLE_CREATE_FAILED.1,
                &[("reason", &error)],
                "engine-bottle-create-failed",
            );
            return step.refuse();
        }
    }

    // G22/G25: refuse now when no branch of an offline launch can start. The request's `offline` is the TS
    // monitor's answer and `ctx.is_online()` the flag the download reads; both come from the one monitor, and
    // the line below shows them side by side (87-63, F1: a launch the gate let through used to leave no trace).
    let context_online = ctx.is_online();
    let gate = if args.offline {
        offline_gate_verdict(ctx, on_bottle, &bottle_name, &effective_id).await
    } else {
        None
    };
    if let Some((input, verdict)) = gate {
        step.note(&offline_gate_line(&GateFacts {
            request_offline: args.offline,
            context_online,
            on_bottle,
            override_id: &effective_id,
            applied: Some((&input, verdict)),
        }));
        if let Some(arm) = verdict {
            step.warn(&format!(
                "launch blocked before pre-flight while offline ({})",
                arm.as_str()
            ));
            step.dialog(
                DOWNLOAD_FAILED.0,
                DOWNLOAD_FAILED.1,
                &[("reason", "offline")],
                "engine-download-failed",
            );
            return step.refuse();
        }
    } else if args.offline || !context_online {
        step.note(&offline_gate_line(&GateFacts {
            request_offline: args.offline,
            context_online,
            on_bottle,
            override_id: &effective_id,
            applied: None,
        }));
    }

    let decide_args = DecideArgs {
        key: step.key.clone(),
        bottle_name: bottle_name.clone(),
        override_value: Value::String(effective_id.clone()),
        monitor_phase: None,
        hint_wine_bins: Vec::new(),
        pins: None,
        marker_view: read_marker_summary(ctx, &bottle_name),
        tuning: deps.probe_tuning(),
    };
    let decision = match deps.decide(ctx, decide_args).await {
        Ok(LaunchDecision::Use(used)) => *used,
        Ok(LaunchDecision::Unavailable {
            override_id,
            detail,
        }) => {
            step.warn(&format!(
                "engine override {override_id} is unavailable: {detail}"
            ));
            step.dialog(
                OVERRIDE_UNAVAILABLE.0,
                OVERRIDE_UNAVAILABLE.1,
                &[("detail", &detail)],
                "override-unavailable",
            );
            return step.refuse();
        }
        Err(error) => {
            step.warn(&format!(
                "the engine pin table cannot be read ({error}); not launching"
            ));
            step.dialog(
                OVERRIDE_UNAVAILABLE.0,
                OVERRIDE_UNAVAILABLE.1,
                &[("detail", "the engine table cannot be read")],
                "override-unavailable",
            );
            return step.refuse();
        }
    };

    if decision.needs_download {
        if let Some(pin) = &decision.pin {
            match deps.ensure_pinned(ctx, pin, &game).await {
                PinnedEngineResult::Ready(_) => {}
                PinnedEngineResult::Failed { aborted: true, .. } => return step.refuse(),
                PinnedEngineResult::Failed { error, .. } => {
                    step.dialog(
                        DOWNLOAD_FAILED.0,
                        DOWNLOAD_FAILED.1,
                        &[("reason", &error)],
                        "engine-download-failed",
                    );
                    return step.refuse();
                }
            }
        }
    }

    let selection = decision.selection.clone();
    if !ctx
        .registry
        .set_engine_selection_quiet(ctx.log.as_deref(), &step.key, selection.clone())
    {
        step.warn(&format!(
            "engine selection was rejected ({}); not launching",
            selection.log_label()
        ));
        let engine = match selection.engine() {
            Some(engine) => engine.label.as_str(),
            None => "CrossOver",
        };
        step.dialog(
            SELECTION_REJECTED.0,
            SELECTION_REJECTED.1,
            &[("engine", engine)],
            "engine-selection-rejected",
        );
        return step.refuse();
    }

    let (cx_bin_dir, cx_build) = match &selection {
        EngineSelection::Crossover {
            bin_dir,
            crossover_build,
            ..
        } => (bin_dir.clone(), crossover_build.clone()),
        _ => (String::new(), None),
    };
    ctx.launch_settings.set_launch_overlay_context(
        &step.key,
        if on_bottle {
            OverlayContext::bottle(
                &bottle_name,
                (!cx_bin_dir.is_empty()).then(|| cx_bin_dir.clone()),
            )
        } else {
            OverlayContext::plain()
        },
    );

    if on_bottle {
        let bin_dir = if cx_bin_dir.is_empty() {
            preflight_bin_dir(decision.preflight.as_ref())
        } else {
            cx_bin_dir.clone()
        };
        let mut prepare = PrepareArgs::new(&step.key, &bottle_name, selection.clone());
        // 59-UAT G10: an override to CrossOver on an expired bottle must not run the DXVK restore
        // through CrossOver.
        prepare.crossover_healthy =
            matches!(decision.preflight, Some(CrossoverPreflight::Healthy { .. }));
        // The settings the CrossOver restore runs with; only a switch to CrossOver reads them.
        prepare.crossover_settings = build_crossover_game_settings(
            &args.settings,
            &bottle_name,
            &bin_dir,
            cx_build.as_deref(),
        );
        prepare.fallback_settings = Value::Object(global_settings(ctx));
        // IN-05 (59-22): a real engine switch is "setting up", not a stale "Downloading (100%)".
        let emitter = Arc::clone(&ctx.emitter);
        let status = json!({
            "appName": args.app_name,
            "runner": args.runner,
            "status": "engine-download",
            "context": "setting-up",
        });
        prepare.on_switching = Some(Arc::new(move || {
            emitter.emit(STATUS_CHANNEL, vec![status.clone()]);
        }));
        let prepared = deps.prepare(ctx, prepare, &game).await;
        if let PrepareOutcome::Refused { reason, detail } = &prepared.outcome {
            let crossover = matches!(selection, EngineSelection::Crossover { .. });
            match reason {
                PrepareReason::DxvkFailed if crossover => {
                    // CR-03: never start on CrossOver over DXVK-macOS DLLs; retried on the next launch.
                    step.warn(&format!(
                        "could not switch back to CrossOver ({detail}); not launching"
                    ));
                    step.dialog(
                        RESTORE_FAILED.0,
                        RESTORE_FAILED.1,
                        &[("title", &args.title)],
                        "engine-restore-failed",
                    );
                    return step.refuse();
                }
                PrepareReason::DxvkFailed => {
                    // The built-in engine is best-effort: missing DXVK degrades Direct3D, it does not block.
                    step.warn(&format!("DXVK setup failed ({detail}); continuing"));
                }
                PrepareReason::BottleBusy
                | PrepareReason::GameRunning
                | PrepareReason::SharedBottle => {
                    // D-16: refuse, kill nothing, and say why.
                    step.warn(&format!(
                        "cannot switch engine ({}: {detail}); not launching",
                        reason.as_str()
                    ));
                    step.dialog(BOTTLE_BUSY.0, BOTTLE_BUSY.1, &[], "engine-bottle-busy");
                    return step.refuse();
                }
                _ => {
                    step.warn(&format!(
                        "cannot switch engine ({}: {detail}); not launching",
                        reason.as_str()
                    ));
                    return step.refuse();
                }
            }
        }
        // RF1: a CrossOver bottle the pre-flight probe warmed must not reach the launch warm.
        if prepare_left_server_warm(
            &selection,
            &prepared,
            matches!(decision.preflight, Some(CrossoverPreflight::Healthy { .. })),
        ) && ctx.ledger.games_running_in(&bottle_name).is_empty()
            && !bin_dir.is_empty()
        {
            kill_bottle_wineserver(
                ctx,
                &bottle_name,
                &path_join(&[&bin_dir, "wineserver"]),
                &[("CX_ROOT".to_string(), dirname(&bin_dir))],
                Duration::from_millis(KILL_TIMEOUT_MS),
            )
            .await;
        }
        if ctx
            .ledger
            .mark_game_running(ctx.log.as_deref(), &bottle_name, &step.key)
        {
            ctx.launch_state
                .remember_ledger_bottle(&step.key, &bottle_name);
        }
    }

    let facts = GameFacts {
        bottle: (!bottle_name.is_empty()).then(|| bottle_name.clone()),
        state_without_bottle: true,
        override_eligible: true,
        overlay_eligible: false,
        wine_tools_eligible: false,
        effective: effective.clone(),
        prefix_kind: Some(if on_bottle { "bottle" } else { "plain" }.to_string()),
        per_game_bottle_name: crate::game_engine::per_game_bottle_name(
            &args.runner,
            &args.app_name,
        ),
    };
    record_launch_decision(
        ctx,
        &args.runner,
        &args.app_name,
        &LaunchDecision::Use(Box::new(decision.clone())),
        &bottle_name,
        &facts,
    );
    // D-13: engine and version on every launch, written from the decision so they cannot drift.
    for line in &decision.log_lines {
        step.write_log(line);
    }

    // The fallback toast: an Automatic launch that fell back for a reason the user should hear about.
    // A setup run, a forced engine and an inconclusive probe say nothing (59 D-05, D-06).
    let fallback_reason = match &selection {
        EngineSelection::Pinned { reason, .. } | EngineSelection::WineManager { reason, .. } => {
            Some(reason.as_str())
        }
        EngineSelection::Crossover { .. } => None,
    };
    if let Some(reason) = fallback_reason {
        if args.purpose != Purpose::Setup
            && decision.override_id == AUTOMATIC
            && reason != "override"
            && reason != "cx-inconclusive"
        {
            notify_engine_fallback(ctx, &args.title, reason);
        }
    }

    let launch_settings =
        ctx.launch_settings
            .get_launch_settings(ctx, Some(&step.key), &args.settings);
    SelectReply {
        kind: SelectKind::Use,
        key: Some(step.key.clone()),
        selection: Some(selection),
        prefix: Some(prefix),
        log_lines: std::mem::take(&mut step.log_lines),
        launch_settings: Some(launch_settings),
    }
}

/// The game a deadline speaks for (`game.getGameInfo()`): the runner and app name the notice's engine-state
/// push names, the title the user reads, and where the game is installed (what the process watch matches).
#[derive(Debug, Clone)]
pub struct DeadlineGame {
    pub runner: String,
    pub app_name: String,
    pub title: String,
    pub install_path: String,
}

/// What the TS passed as `Partial<DeadlineDeps>` and the watch's own options, for a test to shorten or
/// replace; [`ArmOptions::default`] is production.
#[derive(Debug, Clone)]
pub struct ArmOptions {
    /// The listing interval (the TS `pollMs`); `None` is 1.5 s.
    pub poll_ms: Option<u64>,
    /// The watch's own cap (the TS `maxDurationMs`); `None` is the deadline plus five seconds.
    pub max_duration_ms: Option<u64>,
    /// Whether to start the process watch. `false` is a watch that found no signal (the TS `watch`
    /// returning `null`): the deadline is stood down.
    pub start_watcher: bool,
}

impl Default for ArmOptions {
    fn default() -> ArmOptions {
        ArmOptions {
            poll_ms: None,
            max_duration_ms: None,
            start_watcher: true,
        }
    }
}

/// What [`arm_engine_launch_deadline`] did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArmOutcome {
    /// Nothing was armed: no key, no bottle-backed overlay context, or no registered selection.
    NotArmed,
    /// A deadline was armed; the watch was asked for `install_path` and `bottle_dir`. `watching` is false
    /// when no process monitor started, in which case the deadline was stood down at once.
    Armed {
        install_path: String,
        bottle_dir: String,
        watching: bool,
    },
}

/// `armEngineLaunchDeadline` (61-16 D-18): arms the launch deadline for a bottle-backed launch, after the
/// prerequisite installers. Plain-prefix launches are not armed. The deadline is bound to the first-match
/// process watch; with no derivable signal, or a watch that gives up (WR-01), it is stood down. When it
/// does fire it only shows a no-kill notice (CR-02, CR-03).
pub fn arm_engine_launch_deadline(
    ctx: &EngineCtx,
    game: &DeadlineGame,
    key: Option<&str>,
    options: &ArmOptions,
) -> Result<ArmOutcome, ArmError> {
    let Some(key) = key else {
        return Ok(ArmOutcome::NotArmed);
    };
    let Some(OverlayContext {
        prefix: crate::launch::settings::OverlayPrefix::Bottle { bottle_name },
        ..
    }) = ctx.launch_settings.get_launch_overlay_context(key)
    else {
        return Ok(ArmOutcome::NotArmed);
    };
    let Some(armed_selection) = ctx.registry.get_engine_selection(key) else {
        return Ok(ArmOutcome::NotArmed);
    };

    deadline::arm(
        ctx,
        key,
        DeadlineKind::Notice(Box::new(NoticeTarget {
            runner: game.runner.clone(),
            app_name: game.app_name.clone(),
            title: game.title.clone(),
            armed_selection: Some(armed_selection),
        })),
    )?;
    ctx.launch_state.stop_watcher(key);

    let bottle_dir = crate::engines::bottle_dir(ctx, &bottle_name);
    let mut watch_args =
        crate::launch::watch::WatchArgs::new(&game.install_path, Some(&bottle_dir));
    if let Some(ms) = options.poll_ms {
        watch_args.poll = Duration::from_millis(ms);
    }
    if let Some(ms) = options.max_duration_ms {
        watch_args.max_duration = Duration::from_millis(ms);
    }
    let watching = options.start_watcher && {
        let me = ctx.weak().ok_or(ArmError::NotShared)?;
        let watched_key = key.to_string();
        crate::launch::watch::start(ctx, key, &watch_args, move |end| {
            // The watch has left the state by now. The first match ends the deadline; a watch that gave
            // up (WR-01) is a lost signal source and must not leave a stale deadline armed.
            let Some(ctx) = me.upgrade() else {
                return;
            };
            let reason = match end {
                crate::launch::watch::WatchEnd::FirstMatch { .. } => {
                    deadline::CancelReason::FirstMatch
                }
                crate::launch::watch::WatchEnd::GaveUp(_) => {
                    deadline::CancelReason::MonitorUnavailable
                }
            };
            deadline::cancel(&ctx, &watched_key, reason);
        })
    };
    if !watching {
        deadline::stand_down_without_monitor(ctx, key);
    }
    Ok(ArmOutcome::Armed {
        install_path: game.install_path.clone(),
        bottle_dir,
        watching,
    })
}

/// `endEngineLaunch`: releases everything a launch held (the process watch, the overlay context, the
/// deadline, the ledger entry and the registry selection) when the launcher exits. The registry is
/// cleared quietly, as every op the sidecar starts does: its reply is the sidecar view's own update.
pub fn end_engine_launch(ctx: &EngineCtx, key: &str) {
    ctx.launch_state.stop_watcher(key);
    ctx.launch_settings.clear_launch_overlay_context(key);
    deadline::cancel(ctx, key, deadline::CancelReason::LauncherExited);
    let bottle = ctx.launch_state.take_ledger_bottle(key);
    ctx.registry.clear_engine_selection_quiet(key);
    if let Some(bottle) = bottle {
        ctx.ledger.mark_game_stopped(&bottle, key);
    }
}
