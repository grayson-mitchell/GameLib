//! The engine services (Phase 87, SVC-02): the pinned fallback engine, engine selection and the
//! tool resolvers, ported from the TypeScript sidecar. Each plan adds its modules and ops here.
//!
//! Tauri-free, no environment reads, no `keyring`, and a child process only ever through
//! `gamelib-proc`. Paths, the clock and the platform all arrive in [`ctx::EngineCtx`], so the crate
//! runs headlessly on a fake HOME (`gamelib-engine-cli`) and in the shell alike. Every op goes
//! through [`dispatch`], which answers `unknown op: <op>` for a name not in [`OPS`].
//!
//! This crate never depends on `gamelib-wine` (D-04): the dependency runs the other way.

pub mod bottles;
pub mod config;
pub mod crossover;
pub mod ctx;
pub mod decision;
pub mod dxvk;
pub mod engines;
pub mod fallback;
pub mod fetch;
pub mod game_engine;
pub mod game_prefix;
pub mod ids;
pub mod jsutil;
pub mod key;
pub mod launch;
pub mod offline;
pub mod pins;
pub mod sinks;
pub mod state;
#[cfg(feature = "testing")]
pub mod testing;
pub mod tool_settings;

use ctx::EngineCtx;
use serde_json::Value;
use std::future::Future;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::Path;
use std::pin::Pin;
use std::sync::OnceLock;
use std::task::{Context, Poll};
use std::time::Duration;
use tokio::runtime::{Builder, Handle, Runtime};

/// Ops reachable from the shell and the CLI. Keep sorted; each plan adds its own.
pub const OPS: &[&str] = &[
    "engine_bottle_cancel_create",
    "engine_bottle_create_crossover",
    "engine_bottle_create_fallback",
    "engine_bottle_ensure_per_game",
    "engine_bottle_is_provisioned",
    "engine_bottle_kill_wineserver",
    "engine_bottle_prepare",
    "engine_bottle_reconcile_marker",
    "engine_bottle_record_crossover",
    "engine_bottle_record_pinned",
    "engine_bottle_remove_created",
    "engine_cancel",
    "engine_cx_demo_status",
    "engine_cx_resolve_bin_dir",
    "engine_deadline_arm",
    "engine_deadline_cancel",
    "engine_decide_creation",
    "engine_decide_launch",
    "engine_default_engine",
    "engine_dialog_displayed",
    "engine_fallback_ensure",
    "engine_fallback_is_installed",
    "engine_is_crossover_missing",
    "engine_launch_arm_deadline",
    "engine_launch_end",
    "engine_launch_select",
    "engine_launch_settings_get",
    "engine_ledger_mark_running",
    "engine_ledger_mark_stopped",
    "engine_list_options",
    "engine_list_override_options",
    "engine_notice_dismiss",
    "engine_per_game_bottle_name",
    "engine_pins",
    "engine_preflight_crossover",
    "engine_resolve_tool_settings",
    "engine_run_tool",
    "engine_selection_clear",
    "engine_set_online",
    "engine_state_get",
    "engine_state_publish_overlay_exit_notice",
    "engine_state_publish_overlay_notice",
    "engine_state_record_decision",
];

/// Runs `op` over `args`. `Err` is only an unknown op, bad arguments, a missing collaborator, a
/// shutdown, a wrong thread or a panic (`<op>:panic`).
pub async fn dispatch(op: &str, args: &[Value], ctx: &EngineCtx) -> Result<Value, String> {
    let Some(name) = OPS.iter().copied().find(|o| *o == op) else {
        return Err(format!("unknown op: {op}"));
    };
    guarded(name, ctx, route(name, args, ctx)).await
}

/// Each plan adds its arms here, in step with `OPS`.
async fn route(op: &str, args: &[Value], ctx: &EngineCtx) -> Result<Value, String> {
    match op {
        // Whether the named bottle's `cxbottle.conf` exists. An unsafe name is answered `false` (the op
        // is a surface the renderer's names can reach; the library function never sanitised).
        "engine_bottle_is_provisioned" => {
            let request: BottleNameRequest = decode(op, args)?;
            let provisioned = bottles::paths::is_clean_bottle_name(&request.bottle_name)
                && engines::is_bottle_provisioned(ctx, &request.bottle_name);
            Ok(Value::Bool(provisioned))
        }
        // Makes a bottle's engine the requested one: stops the previous engine's wineserver, installs the
        // next engine's DXVK and writes the marker (D-07). The answer is the sidecar's `PrepareResult`
        // plus the selection the bottle is now on. A marker from a newer build, a running game, a
        // shared bottle and another game in the bottle are refusals, not errors.
        "engine_bottle_prepare" => {
            let request: PrepareRequest = decode(op, args)?;
            let prepare = request
                .into_args(ctx)
                .ok_or_else(|| format!("{op}:bad-args"))?;
            let result = bottles::switch::prepare_bottle_for_engine(ctx, &prepare).await;
            Ok(result.to_value())
        }
        // The bottle's engine, persisted before a CrossOver probe touches its conf (76 CR-01): written
        // only for a provisioned bottle whose marker is missing or contradicted by DXVK-macOS. The
        // answer is `"crossover"`, `"pinned"` or `null` (nothing written, a newer marker included).
        "engine_bottle_reconcile_marker" => {
            let request: BottleNameRequest = decode(op, args)?;
            Ok(bottles::switch::reconcile_marker(ctx, &request.bottle_name)
                .map_or(Value::Null, |engine| {
                    Value::String(engine.as_str().to_string())
                }))
        }
        // The marker a CrossOver-created bottle gets at creation (D-07a), through the in-process version
        // gate; `false` when nothing was written (a newer marker, an absent bottle, an unsafe name).
        "engine_bottle_record_crossover" => {
            let request: RecordCrossoverRequest = decode(op, args)?;
            if !Path::new(&request.bin_dir).is_absolute() {
                return Err(format!("{op}:bad-args"));
            }
            let recorded =
                bottles::switch::record_crossover(ctx, &request.bottle_name, &request.bin_dir);
            Ok(Value::Bool(recorded))
        }
        // The marker a pinned-engine bottle gets at creation: written through the in-process version
        // gate, `false` when nothing was written (a newer marker, an absent bottle, an unsafe name).
        "engine_bottle_record_pinned" => {
            let request: RecordPinnedRequest = decode(op, args)?;
            let engine = request.engine.into_engine();
            let recorded =
                bottles::marker::record_pinned(ctx, &request.bottle_name, &request.pin_id, &engine);
            Ok(Value::Bool(recorded))
        }
        // `cxbottle --create` for a per-game bottle, capped; on a failure what this call made is cleaned.
        // The answer is the sidecar's `CreateBottleResult`. Only an app shutdown cancels it early.
        "engine_bottle_create_crossover" => {
            let request: CreateCrossoverRequest = decode(op, args)?;
            if !Path::new(&request.bin_dir).is_absolute() {
                return Err(format!("{op}:bad-args"));
            }
            let mut opts = bottles::lifecycle::CreateOptions::default();
            if let Some(ms) = request.create_timeout_ms {
                opts.create_timeout = Duration::from_millis(ms.min(MAX_SPAWN_CAP_MS));
            }
            let result = bottles::lifecycle::create_crossover_bottle(
                ctx,
                &request.bottle_name,
                &request.bin_dir,
                &opts,
            )
            .await;
            Ok(result.to_value())
        }
        // `wineboot -i` and `wineserver -w` with the built-in engine, its DXVK, then the conf, for a bottle
        // that does not exist yet (or is half made); on a failure what this call made is cleaned. The
        // answer is the sidecar's `FallbackBottleResult`. Only an app shutdown cancels it early.
        "engine_bottle_create_fallback" => {
            let request: CreateFallbackRequest = decode(op, args)?;
            let engine = request.engine.into_engine();
            if !request.fallback_settings.is_object() || !engine_is_trusted(ctx, &engine) {
                return Err(format!("{op}:bad-args"));
            }
            // The caller's `cancelId` names this creation, so a cancel op (the TS `AbortSignal`) can end it.
            let cancel = match request.cancel_id.as_deref() {
                None => None,
                Some(id) if is_cancel_id(id) => Some(register_create_cancel(id)),
                Some(_) => return Err(format!("{op}:bad-args")),
            };
            let result = bottles::fallback_bottle::create_fallback_bottle(
                ctx,
                &request.bottle_name,
                &engine,
                &request.fallback_settings,
                cancel.as_ref().map(|(token, _)| token),
            )
            .await;
            drop(cancel);
            Ok(result.to_value())
        }
        // Cancels the fallback creation that registered `cancelId`; `true` when one was in flight.
        "engine_bottle_cancel_create" => {
            let request: CancelCreateRequest = decode(op, args)?;
            if !is_cancel_id(&request.cancel_id) {
                return Err(format!("{op}:bad-args"));
            }
            Ok(Value::Bool(cancel_create(&request.cancel_id)))
        }
        // Creates a game's bottle once (concurrent callers share one creation): with CrossOver when the
        // caller's decision says so and CrossOver is found, else with the built-in engine, which must be
        // installed already (the download is a later plan's). The answer is the sidecar's
        // `EnsureGameBottleResult`.
        "engine_bottle_ensure_per_game" => {
            let request: EnsureRequest = decode(op, args)?;
            let (ensure, decision, settings) = request
                .into_args()
                .ok_or_else(|| format!("{op}:bad-args"))?;
            let deps = bottles::per_game::CtxPerGameDeps::new(ctx, decision, settings);
            let outcome = bottles::per_game::ensure_per_game_bottle(ctx, &deps, &ensure).await;
            Ok(outcome.to_value())
        }
        // `wineserver -k` against a per-game bottle; `true` when it ran to an exit. An unsafe name spawns
        // nothing. The child inherits the real environment (the declared real-profile arm).
        "engine_bottle_kill_wineserver" => {
            let request: KillWineserverRequest = decode(op, args)?;
            if !Path::new(&request.wineserver_bin).is_absolute() {
                return Err(format!("{op}:bad-args"));
            }
            let extra_env = bottles::lifecycle::env_pairs(&request.extra_env)
                .ok_or_else(|| format!("{op}:bad-args"))?;
            let timeout_ms = request
                .timeout_ms
                .unwrap_or(bottles::lifecycle::KILL_TIMEOUT_MS)
                .min(MAX_SPAWN_CAP_MS);
            let killed = bottles::lifecycle::kill_bottle_wineserver(
                ctx,
                &request.bottle_name,
                &request.wineserver_bin,
                &extra_env,
                Duration::from_millis(timeout_ms),
            )
            .await;
            Ok(Value::Bool(killed))
        }
        // The guarded removal of a bottle this process created (D-19): `true` when the bottle is gone
        // (an absent one counts), `false` when the name or the guard refused or the delete failed.
        "engine_bottle_remove_created" => {
            let request: BottleNameRequest = decode(op, args)?;
            let removed = bottles::lifecycle::remove_created_bottle_dir(ctx, &request.bottle_name)
                == bottles::lifecycle::RemoveCreated::Removed;
            Ok(Value::Bool(removed))
        }
        // The running-games ledger the switch reads (D-16): `true` when the game was recorded (an unsafe
        // bottle name or a key that is not an engine key is refused), as `markGameRunning` answered.
        "engine_ledger_mark_running" => {
            let request: LedgerRequest = decode(op, args)?;
            Ok(Value::Bool(ctx.ledger.mark_game_running(
                ctx.log.as_deref(),
                &request.bottle_name,
                &request.key,
            )))
        }
        "engine_ledger_mark_stopped" => {
            let request: LedgerRequest = decode(op, args)?;
            ctx.ledger
                .mark_game_stopped(&request.bottle_name, &request.key);
            Ok(Value::Null)
        }
        // Drops the registry's selection for a title (the launch stopped, the deadline fired, the launch
        // failed). `true` when one was removed. The reply is the sidecar view's own update, so the change
        // hook stays quiet.
        "engine_selection_clear" => {
            let request: SelectionClearRequest = decode(op, args)?;
            Ok(Value::Bool(
                ctx.registry.clear_engine_selection_quiet(&request.key),
            ))
        }
        // D-09: the global default engine, derived or stored, Legacy included.
        "engine_default_engine" => {
            if !args.is_empty() {
                return Err(format!("{op}:bad-args"));
            }
            Ok(game_engine::default_engine(ctx).to_value())
        }
        // The picker's rows. One untyped argument: any shape other than a game or `{appName:
        // 'default'}` answers the plain list, as `listGameEngineOptions` did.
        "engine_list_options" => {
            let [arg] = args else {
                return Err(format!("{op}:bad-args"));
            };
            let options = game_engine::list_game_engine_options(ctx, arg).await;
            serde_json::to_value(options).map_err(|_| format!("{op}:encode"))
        }
        // One untyped argument: garbage answers null, as `getPerGameBottleNameFor` did.
        "engine_per_game_bottle_name" => {
            let [arg] = args else {
                return Err(format!("{op}:bad-args"));
            };
            Ok(game_engine::per_game_bottle_name_for(arg).map_or(Value::Null, Value::String))
        }
        "engine_pins" => {
            if !args.is_empty() {
                return Err(format!("{op}:bad-args"));
            }
            let table = pins::pins().map_err(|e| format!("{op}:{e}"))?;
            serde_json::to_value(table).map_err(|_| format!("{op}:encode"))
        }
        // The settings a Wine tool acts on for a game, outside any launch (D-13).
        "engine_resolve_tool_settings" => {
            let request: ToolSettingsRequest = decode(op, args)?;
            let deps = tool_settings::CtxToolSettingsDeps::new(ctx);
            let id = tool_settings::ToolGameId {
                runner: &request.runner,
                app_name: &request.app_name,
                platform: request.platform.as_deref(),
            };
            let result = tool_settings::resolve_tool_settings_for_id(
                ctx,
                &deps,
                &id,
                &request.stored,
                request.ensure_bottle,
            )
            .await;
            Ok(result.to_value())
        }
        // Where CrossOver's `bin` directory is (D-04): the hinted wine binaries, the memo, the two default
        // install locations, then the shell's Spotlight search. `null` is "not installed".
        "engine_cx_resolve_bin_dir" => {
            let request: ResolveBinDirRequest = decode(op, args)?;
            let found = ctx
                .crossover_locator
                .resolve_bin_dir(ctx, &request.hint_wine_bins)
                .await;
            Ok(found.map_or(Value::Null, Value::String))
        }
        // The trial state of the CrossOver in `binDir` for a bottle (the declared real-profile arm, D-18):
        // the sidecar's `DemoStatusProbe`. A name the engine layer refuses is a `failed` answer, never a spawn.
        "engine_cx_demo_status" => {
            let request: DemoStatusRequest = decode(op, args)?;
            if !Path::new(&request.bin_dir).is_absolute() {
                return Err(format!("{op}:bad-args"));
            }
            let probe = crossover::demo_status::probe_demo_status(
                ctx,
                &request.bin_dir,
                &request.bottle_name,
                request.timeout_ms.map(|ms| ms.min(MAX_SPAWN_CAP_MS)),
                None,
            )
            .await;
            Ok(probe.to_value())
        }
        // The engine a launch runs on (D-20): the stored override, else CrossOver when its pre-flight is
        // healthy, else the pinned fallback, never bottled Steam. The override and the process monitor's
        // phase are the caller's; the pin table is always the shared one and the bottle's marker is read
        // here, so a caller cannot name an engine the shared table does not ship. The answer is the
        // sidecar's `LaunchDecision`.
        "engine_decide_launch" => {
            let request: DecideLaunchRequest = decode(op, args)?;
            let marker_view = bottles::marker::read_marker_summary(ctx, &request.bottle_name);
            let decision = decision::launch::decide_launch_engine(
                ctx,
                &decision::launch::DecideArgs {
                    key: request.key,
                    bottle_name: request.bottle_name,
                    override_value: request.override_value,
                    monitor_phase: request.monitor_phase,
                    hint_wine_bins: request.hint_wine_bins,
                    pins: None,
                    marker_view,
                    tuning: decision::preflight::ProbeTuning::default(),
                },
            )
            .await
            .map_err(|e| format!("{op}:{e}"))?;
            Ok(decision.to_value())
        }
        // The engine a bottle is created with: a presence check only (59-REVIEW WR-02/WR-03).
        "engine_decide_creation" => {
            let request: DecideCreationRequest = decode(op, args)?;
            let decision = decision::creation::decide_creation_engine(ctx, &request.key, None)
                .await
                .map_err(|e| format!("{op}:{e}"))?;
            Ok(serde_json::json!({
                "decision": decision.to_value(),
                "createCapMs": decision::creation::CX_CREATE_CAP_MS,
            }))
        }
        // The engines the per-game picker offers.
        "engine_list_override_options" => {
            let options = decision::override_options::list_engine_override_options(ctx, None).await;
            Ok(decision::override_options::options_value(&options))
        }
        // The CrossOver pre-flight (G29 two-probe rule): the sidecar's `CrossoverPreflight`.
        "engine_preflight_crossover" => {
            let request: PreflightRequest = decode(op, args)?;
            let preflight = decision::preflight::preflight_crossover(
                ctx,
                &decision::preflight::PreflightArgs {
                    bottle_name: request.bottle_name,
                    key: request.key,
                    kill_on_timeout: request.kill_on_timeout,
                    monitor_phase: request.monitor_phase,
                    hint_wine_bins: request.hint_wine_bins,
                    tuning: decision::preflight::ProbeTuning::default(),
                },
            )
            .await;
            Ok(preflight.to_value())
        }
        // The pinned built-in engine, made available (downloaded, verified, extracted) with the
        // `gameStatusUpdate` sequence every store shares (D-10). Callers for one pin share one download;
        // `cancelId` names the run for `engine_cancel`. The answer is the sidecar's `PinnedEngineResult`:
        // a failure or a cancel is an answer, an unknown pin or a bad cancel id is an error.
        "engine_fallback_ensure" => {
            let request: FallbackEnsureRequest = decode(op, args)?;
            if request.app_name.is_empty() || request.runner.is_empty() {
                return Err(format!("{op}:bad-args"));
            }
            let result = fallback::ensure::ensure_pinned_engine(
                ctx,
                &fallback::ensure::EnsureArgs {
                    pin_id: request.pin_id,
                    app_name: request.app_name,
                    runner: request.runner,
                    cancel_id: request.cancel_id,
                },
            )
            .await
            .map_err(|e| format!("{op}:{e}"))?;
            Ok(result.to_value())
        }
        // Whether both halves of a shipped pin are on disk and carry the pin's own sha256.
        "engine_fallback_is_installed" => {
            let request: FallbackPinRequest = decode(op, args)?;
            let pin = ids::pin_by_id(&request.pin_id).ok_or_else(|| format!("{op}:bad-args"))?;
            Ok(Value::Bool(fallback::ensure::is_pinned_engine_installed(
                ctx, pin,
            )))
        }
        // `dismissEngineNotice` (D-14): `{kind: 'no-crossover'}` or `{kind: 'untested-crossover', build}`. The
        // answer is `{ok}`; any other shape, a build that is not four dotted numbers and a write the store
        // refused (a corrupt notices file is kept, FND-06) are `{ok: false}` and write nothing more.
        "engine_notice_dismiss" => {
            let [dismissal] = args else {
                return Err(format!("{op}:bad-args"));
            };
            Ok(serde_json::json!({ "ok": state::notices::dismiss(ctx, dismissal) }))
        }
        // The per-title engine state the game page reads, or `null` (D-10). A non-Steam game's facts are
        // derived from its stored settings; a caller that gathered the facts itself (a Steam bridge game's
        // bottle and eligibility) passes them as values in `facts`.
        "engine_state_get" => {
            let request: StateGetRequest = decode(op, args)?;
            let state = match request.facts {
                None => {
                    state::engine_state::get_game_engine_state(
                        ctx,
                        &request.identity,
                        &state::engine_state::LiveProbes,
                    )
                    .await?
                }
                Some(facts) => {
                    let Some((runner, app_name)) = identity_of(&request.identity) else {
                        return Ok(Value::Null);
                    };
                    let facts = facts
                        .into_facts(ctx, &runner, &app_name)
                        .ok_or_else(|| format!("{op}:bad-args"))?;
                    state::engine_state::get_engine_state(
                        ctx,
                        &request.identity,
                        &facts,
                        &state::engine_state::LiveProbes,
                    )
                    .await?
                }
            };
            Ok(state.map_or(Value::Null, |s| s.to_value()))
        }
        // `recordLaunchDecision`: what a launch used, cached and pushed as `engineStateChanged`. Without a
        // `selection` the decision is an unavailable one and nothing is recorded. The answer is whether a
        // decision was recorded.
        "engine_state_record_decision" => {
            let request: RecordDecisionRequest = decode(op, args)?;
            let Some(selection) = request.selection else {
                return Ok(Value::Bool(false));
            };
            // The override is the closed grammar, and the bottle a plain bottle name.
            if !bottles::paths::is_clean_bottle_name(&request.bottle_name)
                || ids::parse_engine_override_str(&request.override_id) != request.override_id
            {
                return Err(format!("{op}:bad-args"));
            }
            let preflight = match request.preflight {
                None | Some(Value::Null) => None,
                Some(value) => Some(
                    state::engine_state::crossover_preflight_from_value(&value)
                        .ok_or_else(|| format!("{op}:bad-args"))?,
                ),
            };
            let facts = request
                .facts
                .into_facts(ctx, &request.runner, &request.app_name)
                .ok_or_else(|| format!("{op}:bad-args"))?;
            let decision =
                decision::launch::LaunchDecision::Use(Box::new(decision::launch::LaunchUse {
                    selection,
                    preflight,
                    pin: None,
                    needs_download: false,
                    override_id: request.override_id,
                    log_lines: Vec::new(),
                }));
            state::engine_state::record_launch_decision(
                ctx,
                &request.runner,
                &request.app_name,
                &decision,
                &request.bottle_name,
                &facts,
            );
            Ok(Value::Bool(true))
        }
        // The in-app overlay-unavailable notice for the step that failed; whether it published.
        "engine_state_publish_overlay_notice" => {
            let request: OverlayNoticeRequest = decode(op, args)?;
            Ok(Value::Bool(state::publish::publish_overlay_notice(
                ctx,
                &request.runner,
                &request.app_name,
                &request.step,
            )))
        }
        // The "game closed soon after starting" notice for an overlay launch; whether it published.
        "engine_state_publish_overlay_exit_notice" => {
            let request: GameIdentityRequest = decode(op, args)?;
            Ok(Value::Bool(state::publish::publish_overlay_exit_notice(
                ctx,
                &request.runner,
                &request.app_name,
            )))
        }
        // The renderer says an engine dialog is on screen (`dialogDisplayed`): settles the dialog this
        // context showed under that id. `true` when it was waiting; a repeated or unknown id is `false`.
        "engine_dialog_displayed" => {
            let request: DialogDisplayedRequest = decode(op, args)?;
            if !launch::dialogs::is_ack_id(&request.ack_id) {
                return Err(format!("{op}:bad-args"));
            }
            Ok(Value::Bool(
                ctx.display_acks.acknowledge(ctx, &request.ack_id),
            ))
        }
        // The launch-time engine step of a non-Steam launch on macOS (D-01): eligibility, the effective
        // engine, the prefix, the game's own bottle, the offline refusal, the decision, the first-need
        // pinned-engine download, the registration and the bottle switch. The answer is
        // `{kind, key, selection, prefix, logLines, launchSettings}` (`kind: 'skip'` alone when the engine
        // layer does not apply). The collaborators are the real ones (`CtxStepDeps`).
        "engine_launch_select" => {
            let request: LaunchSelectRequest = decode(op, args)?;
            let select = request
                .into_args()
                .ok_or_else(|| format!("{op}:bad-args"))?;
            let reply =
                launch::step::select_engine_for_launch(ctx, &launch::step::CtxStepDeps, &select)
                    .await;
            Ok(reply.to_value())
        }
        // Arms the launch deadline of a bottle-backed non-Steam launch and its process watch, after the
        // prerequisite installers (`armEngineLaunchDeadline`). Nothing is armed for a key the engine layer
        // has no entry for, a plain-prefix launch or a launch with no registered selection. A deadline that
        // fires shows the no-kill notice and never raises the window (D-01).
        "engine_launch_arm_deadline" => {
            let request: LaunchArmDeadlineRequest = decode(op, args)?;
            let (game, key) = request
                .into_game()
                .ok_or_else(|| format!("{op}:bad-args"))?;
            let outcome = launch::step::arm_engine_launch_deadline(
                ctx,
                &game,
                key.as_deref(),
                &launch::step::ArmOptions::default(),
            )
            .map_err(|e| format!("{op}:{}", e.as_str()))?;
            Ok(match outcome {
                launch::step::ArmOutcome::NotArmed => serde_json::json!({ "armed": false }),
                launch::step::ArmOutcome::Armed { watching, .. } => {
                    serde_json::json!({ "armed": true, "watching": watching })
                }
            })
        }
        // `endEngineLaunch`: the launcher exited. Releases the process watch, the overlay context, the
        // deadline, the ledger entry and the registry selection of the key.
        "engine_launch_end" => {
            let request: SelectionClearRequest = decode(op, args)?;
            if !key::is_engine_key(&request.key) {
                return Err(format!("{op}:bad-args"));
            }
            launch::step::end_engine_launch(ctx, &request.key);
            Ok(Value::Null)
        }
        // Arms the launch deadline of a Steam bridge launch: no process watch (the bridge's own monitor
        // cancels it through `engine_deadline_cancel`), and when it fires the sidecar is sent
        // `engineDeadlineFired {key, reason}` instead of a notice.
        "engine_deadline_arm" => {
            let request: SelectionClearRequest = decode(op, args)?;
            launch::deadline::arm(ctx, &request.key, launch::deadline::DeadlineKind::Bridge)
                .map_err(|e| format!("{op}:{}", e.as_str()))?;
            Ok(Value::Null)
        }
        // Cancels the deadline of a key (`cancelLaunchDeadline`); `true` when one was armed.
        "engine_deadline_cancel" => {
            let request: DeadlineCancelRequest = decode(op, args)?;
            let reason = launch::deadline::CancelReason::parse(&request.reason)
                .filter(|_| key::is_engine_key(&request.key))
                .ok_or_else(|| format!("{op}:bad-args"))?;
            Ok(Value::Bool(launch::deadline::cancel(
                ctx,
                &request.key,
                reason,
            )))
        }
        // `getLaunchSettings`: the stored settings with the running launch's engine overlaid (`null` key:
        // the input comes back unchanged). The input is never changed.
        "engine_launch_settings_get" => {
            let request: LaunchSettingsGetRequest = decode(op, args)?;
            if !request.stored.is_object()
                || request
                    .key
                    .as_deref()
                    .is_some_and(|key| !key::is_engine_key(key))
            {
                return Err(format!("{op}:bad-args"));
            }
            Ok(ctx.launch_settings.get_launch_settings(
                ctx,
                request.key.as_deref(),
                &request.stored,
            ))
        }
        // G25: true when CrossOver is not installed; never probes.
        "engine_is_crossover_missing" => {
            let request: ResolveBinDirRequest = decode(op, args)?;
            Ok(Value::Bool(
                decision::preflight::is_crossover_missing(ctx, &request.hint_wine_bins).await,
            ))
        }
        // One of the five allowlisted tools with the isolated profile (D-18). A program outside the list is
        // an answer (`stderr: "tool not allowed: ..."`), as `runTool` gave, and spawns nothing. `cancelId`
        // names the run for `engine_cancel`.
        "engine_run_tool" => {
            let mut request: crossover::run_tool::RunToolArgs = decode(op, args)?;
            request.timeout_ms = request.timeout_ms.min(MAX_SPAWN_CAP_MS);
            if request
                .cancel_id
                .as_deref()
                .is_some_and(|id| !ctx::Cancels::is_valid_id(id))
            {
                return Err(format!("{op}:bad-args"));
            }
            Ok(crossover::run_tool::run_tool(ctx, request).await.to_value())
        }
        // Cancels the `engine_run_tool` that registered `cancelId`; `true` when one was in flight.
        "engine_cancel" => {
            let request: CancelCreateRequest = decode(op, args)?;
            if !ctx::Cancels::is_valid_id(&request.cancel_id) {
                return Err(format!("{op}:bad-args"));
            }
            Ok(Value::Bool(ctx.cancels.cancel(&request.cancel_id)))
        }
        // The shell's online monitor says it changed (D-17): the DXMT fetch and the boot update read it.
        "engine_set_online" => {
            let request: SetOnlineRequest = decode(op, args)?;
            ctx.set_online(request.online);
            Ok(Value::Null)
        }
        _ => Err(format!("unknown op: {op}")),
    }
}

/// The argument of `engine_fallback_ensure`.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct FallbackEnsureRequest {
    pin_id: String,
    app_name: String,
    runner: String,
    #[serde(default)]
    cancel_id: Option<String>,
}

/// The argument of `engine_fallback_is_installed`.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct FallbackPinRequest {
    pin_id: String,
}

/// The argument of `engine_ledger_mark_running` and `engine_ledger_mark_stopped`.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct LedgerRequest {
    bottle_name: String,
    key: String,
}

/// The argument of `engine_selection_clear`.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct SelectionClearRequest {
    key: String,
}

/// The argument of `engine_bottle_cancel_create`.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct CancelCreateRequest {
    cancel_id: String,
}

/// A cancel id the sidecar makes: 1 to 64 of `[A-Za-z0-9_-]`.
fn is_cancel_id(id: &str) -> bool {
    (1..=64).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

type CreateCancels =
    std::sync::Mutex<std::collections::HashMap<String, (u64, tokio_util::sync::CancellationToken)>>;

/// The fallback creations in flight by cancel id. The entry ends with its creation.
fn create_cancels() -> &'static CreateCancels {
    static CANCELS: OnceLock<CreateCancels> = OnceLock::new();
    CANCELS.get_or_init(Default::default)
}

/// Ends a creation's registration when it finishes, but only if the entry is still its own.
struct CreateCancelGuard {
    id: String,
    generation: u64,
}

impl Drop for CreateCancelGuard {
    fn drop(&mut self) {
        let mut map = create_cancels().lock().unwrap_or_else(|e| e.into_inner());
        if map
            .get(&self.id)
            .is_some_and(|(g, _)| *g == self.generation)
        {
            map.remove(&self.id);
        }
    }
}

fn register_create_cancel(id: &str) -> (tokio_util::sync::CancellationToken, CreateCancelGuard) {
    static GENERATION: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let generation = GENERATION.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let token = tokio_util::sync::CancellationToken::new();
    create_cancels()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(id.to_string(), (generation, token.clone()));
    (
        token,
        CreateCancelGuard {
            id: id.to_string(),
            generation,
        },
    )
}

fn cancel_create(id: &str) -> bool {
    let token = create_cancels()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(id)
        .map(|(_, token)| token.clone());
    token.map(|t| t.cancel()).is_some()
}

/// The argument of `engine_bottle_is_provisioned`.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BottleNameRequest {
    bottle_name: String,
}

/// The longest cap an op argument may ask of one spawn: the TS callers' longest was 120 s.
const MAX_SPAWN_CAP_MS: u64 = 300_000;

/// The argument of `engine_bottle_create_crossover`.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct CreateCrossoverRequest {
    bottle_name: String,
    bin_dir: String,
    #[serde(default)]
    create_timeout_ms: Option<u64>,
}

/// The argument of `engine_bottle_kill_wineserver`.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct KillWineserverRequest {
    bottle_name: String,
    wineserver_bin: String,
    #[serde(default)]
    extra_env: serde_json::Map<String, Value>,
    #[serde(default)]
    timeout_ms: Option<u64>,
}

/// The argument of `engine_bottle_record_crossover`: the bottle and the CrossOver `bin` directory.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RecordCrossoverRequest {
    bottle_name: String,
    bin_dir: String,
}

/// The argument of `engine_bottle_record_pinned`: the bottle, the pin's id and the engine the bottle
/// was created with.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RecordPinnedRequest {
    bottle_name: String,
    pin_id: String,
    engine: RecordedEngine,
}

/// A non-CrossOver engine as the sidecar names it (`NonCrossoverEngine`), strictly.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RecordedEngine {
    wine_bin: String,
    wineserver_bin: String,
    label: String,
    version: String,
    dxvk: Option<engines::DxvkBuild>,
}

/// The argument of `engine_bottle_create_fallback`: the bottle and the built-in engine that creates it.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct CreateFallbackRequest {
    bottle_name: String,
    engine: RecordedEngine,
    #[serde(default = "empty_object")]
    fallback_settings: Value,
    #[serde(default)]
    cancel_id: Option<String>,
}

/// The argument of `engine_bottle_ensure_per_game`: the game, the engine the caller's decision chose
/// and the global settings the DXVK step builds over.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct EnsureRequest {
    key: String,
    bottle_name: String,
    app_name: String,
    runner: String,
    decision: DecisionRequest,
    #[serde(default = "empty_object")]
    fallback_settings: Value,
}

#[derive(serde::Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
enum DecisionRequest {
    #[serde(rename_all = "camelCase")]
    Crossover {
        #[serde(default)]
        create_timeout_ms: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    Pinned { pin_id: String },
}

impl EnsureRequest {
    /// The library arguments, the decision and the settings, or `None` for a key the runner and app name
    /// do not make, a pin the table does not hold, or settings that are not an object.
    fn into_args(
        self,
    ) -> Option<(
        bottles::per_game::EnsureArgs,
        bottles::per_game::CreationDecision,
        Value,
    )> {
        if !self.fallback_settings.is_object()
            || key::engine_key_for(&self.runner, &self.app_name).as_deref() != Some(&self.key)
        {
            return None;
        }
        let decision = match self.decision {
            DecisionRequest::Crossover { create_timeout_ms } => {
                bottles::per_game::CreationDecision::Crossover {
                    create_timeout: create_timeout_ms
                        .map_or_else(bottles::per_game::default_create_timeout, |ms| {
                            Duration::from_millis(ms.min(MAX_SPAWN_CAP_MS))
                        }),
                }
            }
            DecisionRequest::Pinned { pin_id } => bottles::per_game::CreationDecision::Pinned {
                pin: Box::new(ids::pin_by_id(&pin_id)?.clone()),
            },
        };
        let args = bottles::per_game::EnsureArgs {
            key: self.key,
            bottle_name: self.bottle_name,
            app_name: self.app_name,
            runner: self.runner,
            cancel: None,
        };
        Some((args, decision, self.fallback_settings))
    }
}

/// An engine the sidecar names is run (its Wine, its wineserver, its DXVK installer), so each program
/// must sit inside a root GameLib installs engines under: the pinned engines or the Wine Manager tools,
/// and its DXVK inside the pinned engines (T-87-82, T-87-36).
fn engine_is_trusted(ctx: &EngineCtx, engine: &engines::NonCrossoverEngine) -> bool {
    let pinned = engines::pinned_engine_root(ctx);
    let wine_tools = jsutil::path_join(&[&ctx.paths.tools_path.to_string_lossy(), "wine"]);
    let inside = |path: &str| {
        bottles::paths::is_inside(&pinned, path) || bottles::paths::is_inside(&wine_tools, path)
    };
    inside(&engine.wine_bin)
        && inside(&engine.wineserver_bin)
        && match &engine.dxvk {
            Some(build) => bottles::paths::is_inside(&pinned, &build.dir),
            None => true,
        }
}

impl RecordedEngine {
    fn into_engine(self) -> engines::NonCrossoverEngine {
        engines::NonCrossoverEngine {
            wine_bin: self.wine_bin,
            wineserver_bin: self.wineserver_bin,
            label: self.label,
            version: self.version,
            dxvk: self.dxvk,
        }
    }
}

/// The argument of `engine_bottle_prepare`: the bottle, the engine it must be on and the facts the TS
/// switch read through callbacks (the monitor phase, the title's own bottle, the settings).
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct PrepareRequest {
    key: String,
    bottle_name: String,
    next: bottles::registry::EngineSelection,
    #[serde(default)]
    monitor_phase: Option<bottles::switch::MonitorPhase>,
    /// Present when the store has an own-bottle notion (Steam); its `name` is `null` for a title with
    /// no own bottle.
    #[serde(default)]
    own_bottle: Option<OwnBottleRequest>,
    #[serde(default = "empty_object")]
    crossover_settings: Value,
    #[serde(default = "yes")]
    crossover_healthy: bool,
    #[serde(default = "empty_object")]
    fallback_settings: Value,
    #[serde(default)]
    register_selection: bool,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct OwnBottleRequest {
    name: Option<String>,
}

fn empty_object() -> Value {
    Value::Object(serde_json::Map::new())
}

fn yes() -> bool {
    true
}

impl PrepareRequest {
    /// The library arguments, or `None` for a key that is not an engine key, a program path that is not
    /// absolute, a DXVK directory outside the pinned-engine root, or settings that are not objects: the
    /// op is a surface a sidecar string can reach (T-87-82).
    fn into_args(self, ctx: &EngineCtx) -> Option<bottles::switch::PrepareArgs> {
        use bottles::registry::EngineSelection;
        if !key::is_engine_key(&self.key)
            || !self.crossover_settings.is_object()
            || !self.fallback_settings.is_object()
        {
            return None;
        }
        match &self.next {
            EngineSelection::Crossover { bin_dir, .. } => {
                if !Path::new(bin_dir).is_absolute() {
                    return None;
                }
            }
            EngineSelection::Pinned { engine, .. }
            | EngineSelection::WineManager { engine, .. } => {
                if !engine_is_trusted(ctx, engine) {
                    return None;
                }
            }
        }
        let own_bottle_name = match self.own_bottle {
            None => bottles::switch::OwnBottle::NoNotion,
            Some(OwnBottleRequest { name: Some(name) }) => bottles::switch::OwnBottle::Named(name),
            Some(OwnBottleRequest { name: None }) => bottles::switch::OwnBottle::Unnamed,
        };
        Some(bottles::switch::PrepareArgs {
            key: self.key,
            bottle_name: self.bottle_name,
            next: self.next,
            monitor_phase: self.monitor_phase,
            own_bottle_name,
            crossover_settings: self.crossover_settings,
            crossover_healthy: self.crossover_healthy,
            fallback_settings: self.fallback_settings,
            ensure_pin: None,
            on_switching: None,
            register_selection: self.register_selection,
            // The op's reply carries the selection, so the change hook stays quiet (87-42).
            register_quietly: true,
        })
    }
}

/// The identity of a game: the runner and the runner-local app name.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct GameIdentityRequest {
    runner: String,
    app_name: String,
}

/// The argument of `engine_launch_arm_deadline`: the game the deadline speaks for. The key is derived
/// from the runner and app name, as every engine key is.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct LaunchArmDeadlineRequest {
    runner: String,
    app_name: String,
    title: String,
    #[serde(default)]
    install_path: Option<String>,
}

impl LaunchArmDeadlineRequest {
    /// The game and its key (`None` for a game the engine layer has no key for: nothing is armed).
    fn into_game(self) -> Option<(launch::step::DeadlineGame, Option<String>)> {
        let within = |text: &str, max: usize| (1..=max).contains(&jsutil::utf16_len(text));
        let install_path = self.install_path.unwrap_or_default();
        (within(&self.runner, 64)
            && within(&self.app_name, 4096)
            && jsutil::utf16_len(&self.title) <= 4096
            && jsutil::utf16_len(&install_path) <= 4096)
            .then(|| {
                let key = key::engine_key_for(&self.runner, &self.app_name);
                (
                    launch::step::DeadlineGame {
                        runner: self.runner,
                        app_name: self.app_name,
                        title: self.title,
                        install_path,
                    },
                    key,
                )
            })
    }
}

/// The argument of `engine_deadline_cancel`.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct DeadlineCancelRequest {
    key: String,
    reason: String,
}

/// The argument of `engine_launch_settings_get`.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct LaunchSettingsGetRequest {
    #[serde(default)]
    key: Option<String>,
    #[serde(default)]
    stored: Value,
}

/// The argument of `engine_dialog_displayed`: the acknowledgement id the dialog was shown under.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct DialogDisplayedRequest {
    ack_id: String,
}

/// The argument of `engine_launch_select`: the slice of the game and the launch options the step reads.
/// The strings are the launcher's own, bounded here; the stored settings are read for three keys only.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct LaunchSelectRequest {
    runner: String,
    app_name: String,
    title: String,
    #[serde(default)]
    install_path: Option<String>,
    #[serde(default)]
    platform: Option<String>,
    #[serde(default)]
    is_native: bool,
    #[serde(default)]
    settings: Value,
    #[serde(default)]
    offline: bool,
    #[serde(default)]
    purpose: Option<String>,
}

impl LaunchSelectRequest {
    fn into_args(self) -> Option<launch::step::SelectArgs> {
        let within = |text: &str, max: usize| (1..=max).contains(&jsutil::utf16_len(text));
        let settings = match self.settings {
            Value::Null => serde_json::json!({}),
            object @ Value::Object(_) => object,
            _ => return None,
        };
        let purpose = match self.purpose.as_deref() {
            None | Some("launch") => launch::step::Purpose::Launch,
            Some("setup") => launch::step::Purpose::Setup,
            Some(_) => return None,
        };
        (within(&self.runner, 64)
            && within(&self.app_name, 4096)
            && jsutil::utf16_len(&self.title) <= 4096)
            .then_some(launch::step::SelectArgs {
                runner: self.runner,
                app_name: self.app_name,
                title: self.title,
                install_path: self.install_path,
                platform: self.platform,
                is_native: self.is_native,
                settings,
                offline: self.offline,
                purpose,
            })
    }
}

/// The argument of `engine_state_publish_overlay_notice`.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct OverlayNoticeRequest {
    runner: String,
    app_name: String,
    step: String,
}

/// The facts about one game a caller gathered itself (the TS-only half of the engine state).
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct FactsRequest {
    #[serde(default)]
    bottle: Option<String>,
    #[serde(default)]
    state_without_bottle: bool,
    override_eligible: bool,
    overlay_eligible: bool,
    wine_tools_eligible: bool,
    #[serde(default)]
    prefix_kind: Option<String>,
    #[serde(default)]
    per_game_bottle_name: Option<String>,
}

impl FactsRequest {
    /// The facts as the state layer takes them. The effective engine is read from the game's stored
    /// settings, as every other engine read is. `None` for a `prefixKind` outside the closed set.
    fn into_facts(
        self,
        ctx: &EngineCtx,
        runner: &str,
        app_name: &str,
    ) -> Option<state::engine_state::GameFacts> {
        if let Some(kind) = &self.prefix_kind {
            if !["bottle", "plain", "legacy"].contains(&kind.as_str()) {
                return None;
            }
        }
        Some(state::engine_state::GameFacts {
            bottle: self.bottle,
            state_without_bottle: self.state_without_bottle,
            override_eligible: self.override_eligible,
            overlay_eligible: self.overlay_eligible,
            wine_tools_eligible: self.wine_tools_eligible,
            effective: config::read_engine_for_game(ctx, runner, app_name),
            prefix_kind: self.prefix_kind,
            per_game_bottle_name: self.per_game_bottle_name,
        })
    }
}

/// The argument of `engine_state_get`: the identity, and the facts when the caller has them.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct StateGetRequest {
    identity: Value,
    #[serde(default)]
    facts: Option<FactsRequest>,
}

/// The argument of `engine_state_record_decision`.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RecordDecisionRequest {
    runner: String,
    app_name: String,
    bottle_name: String,
    #[serde(rename = "override")]
    override_id: String,
    #[serde(default)]
    selection: Option<bottles::registry::EngineSelection>,
    #[serde(default)]
    preflight: Option<Value>,
    facts: FactsRequest,
}

/// The `{runner, appName}` of an untyped identity.
fn identity_of(identity: &Value) -> Option<(String, String)> {
    let object = identity.as_object()?;
    Some((
        object.get("runner")?.as_str()?.to_string(),
        object.get("appName")?.as_str()?.to_string(),
    ))
}

/// The argument of `engine_cx_resolve_bin_dir`.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ResolveBinDirRequest {
    #[serde(default)]
    hint_wine_bins: Vec<String>,
}

/// The argument of `engine_cx_demo_status`.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct DemoStatusRequest {
    bin_dir: String,
    bottle_name: String,
    #[serde(default)]
    timeout_ms: Option<u64>,
}

/// The argument of `engine_decide_launch`. The stored override is any JSON (the closed grammar parses it);
/// `monitorPhase` is the process monitor's answer for the title.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct DecideLaunchRequest {
    key: String,
    bottle_name: String,
    #[serde(rename = "override", default)]
    override_value: Value,
    #[serde(default)]
    monitor_phase: Option<decision::preflight::MonitorPhase>,
    #[serde(default)]
    hint_wine_bins: Vec<String>,
}

/// The argument of `engine_decide_creation`.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct DecideCreationRequest {
    key: String,
}

/// The argument of `engine_preflight_crossover`.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct PreflightRequest {
    bottle_name: String,
    #[serde(default)]
    key: Option<String>,
    #[serde(default)]
    kill_on_timeout: Option<bool>,
    #[serde(default)]
    monitor_phase: Option<decision::preflight::MonitorPhase>,
    #[serde(default)]
    hint_wine_bins: Vec<String>,
}

/// The argument of `engine_set_online`: the monitor's answer.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct SetOnlineRequest {
    online: bool,
}

/// The argument of `engine_resolve_tool_settings`: the game and its stored settings.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ToolSettingsRequest {
    runner: String,
    app_name: String,
    #[serde(default)]
    platform: Option<String>,
    stored: Value,
    ensure_bottle: bool,
}

/// The one object argument of an op, decoded strictly (the arg structs deny unknown fields). The
/// error is a fixed `<op>:bad-args`: a renderer or sidecar string never reaches it.
fn decode<T: serde::de::DeserializeOwned>(op: &str, args: &[Value]) -> Result<T, String> {
    let [arg] = args else {
        return Err(format!("{op}:bad-args"));
    };
    serde_json::from_value(arg.clone()).map_err(|_| format!("{op}:bad-args"))
}

/// The op wrapper: `work` runs holding a `Shutdown` registrant for exactly its lifetime and is
/// raced against the shutdown token, answering `<op>:shutdown` when cancelled and `<op>:panic` when
/// it panics. Once shutdown has begun, `work` is not started at all.
pub async fn guarded<F>(op: &str, ctx: &EngineCtx, work: F) -> Result<Value, String>
where
    F: Future<Output = Result<Value, String>>,
{
    let _registrant = ctx.shutdown.register("engine");
    let token = ctx.shutdown.token();
    let work = std::pin::pin!(work);
    let mut work = CatchUnwind(work);
    tokio::select! {
        biased;
        _ = token.cancelled() => Err(format!("{op}:shutdown")),
        done = &mut work => match done {
            Ok(result) => result,
            Err(()) => Err(format!("{op}:panic")),
        },
    }
}

/// `futures::FutureExt::catch_unwind` for one future, without the crate: a panic in `poll` is an
/// `Err(())` and the future is never polled again.
struct CatchUnwind<'a, F>(Pin<&'a mut F>);

impl<F: Future> Future for CatchUnwind<'_, F> {
    type Output = Result<F::Output, ()>;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let this = self.get_mut();
        match catch_unwind(AssertUnwindSafe(|| this.0.as_mut().poll(cx))) {
            Ok(Poll::Ready(value)) => Poll::Ready(Ok(value)),
            Ok(Poll::Pending) => Poll::Pending,
            Err(_) => Poll::Ready(Err(())),
        }
    }
}

/// The crate-owned runtime the synchronous entry point blocks on. Two workers, like
/// `gamelib-steamcm`'s: the shell's `rustInvoke` workers may call in concurrently.
pub(crate) fn runtime() -> Result<&'static Runtime, String> {
    static RUNTIME: OnceLock<Result<Runtime, String>> = OnceLock::new();
    RUNTIME
        .get_or_init(|| {
            Builder::new_multi_thread()
                .worker_threads(2)
                .thread_name("engine")
                .enable_all()
                .build()
                .map_err(|e| e.to_string())
        })
        .as_ref()
        .map_err(Clone::clone)
}

/// [`dispatch`] for a plain thread: blocks on the crate's own runtime. Called from inside a tokio
/// runtime it answers `<op>:wrong-thread` instead of panicking in `block_on`.
pub fn dispatch_sync(op: &str, args: &[Value], ctx: &EngineCtx) -> Result<Value, String> {
    if Handle::try_current().is_ok() {
        return Err(format!("{op}:wrong-thread"));
    }
    runtime()
        .map_err(|e| format!("{op}:no-runtime ({e})"))?
        .block_on(dispatch(op, args, ctx))
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_core::clock::SystemClock;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use serde_json::json;
    use std::sync::Arc;

    fn ctx(home: &FakeHome) -> EngineCtx {
        let root = home.root().to_path_buf();
        EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            ctx::Platform::Linux,
            ctx::EnginePaths {
                app_folder: root.clone(),
                user_data: root.clone(),
                tools_path: root.join("tools"),
                user_home: root.join("home"),
                temp: root.join("temp"),
            },
            Shutdown::new(),
        )
    }

    /// A future that panics when polled: the shape of an op that hits a bug.
    fn panicking() -> impl Future<Output = Result<Value, String>> {
        std::future::poll_fn(|_| -> Poll<Result<Value, String>> { panic!("test-only op panic") })
    }

    #[test]
    fn ops_are_sorted_and_unique() {
        let mut sorted = OPS.to_vec();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted, OPS);
        assert!(OPS.contains(&"engine_pins"));
        for op in [
            "engine_bottle_cancel_create",
            "engine_bottle_create_crossover",
            "engine_bottle_create_fallback",
            "engine_bottle_ensure_per_game",
            "engine_bottle_is_provisioned",
            "engine_bottle_kill_wineserver",
            "engine_bottle_prepare",
            "engine_bottle_reconcile_marker",
            "engine_bottle_record_crossover",
            "engine_bottle_record_pinned",
            "engine_bottle_remove_created",
            "engine_cancel",
            "engine_cx_demo_status",
            "engine_cx_resolve_bin_dir",
            "engine_deadline_arm",
            "engine_deadline_cancel",
            "engine_decide_creation",
            "engine_decide_launch",
            "engine_default_engine",
            "engine_dialog_displayed",
            "engine_fallback_ensure",
            "engine_fallback_is_installed",
            "engine_is_crossover_missing",
            "engine_launch_arm_deadline",
            "engine_launch_end",
            "engine_launch_select",
            "engine_launch_settings_get",
            "engine_ledger_mark_running",
            "engine_ledger_mark_stopped",
            "engine_list_options",
            "engine_list_override_options",
            "engine_per_game_bottle_name",
            "engine_preflight_crossover",
            "engine_resolve_tool_settings",
            "engine_run_tool",
            "engine_selection_clear",
            "engine_set_online",
        ] {
            assert!(OPS.contains(&op), "{op}");
        }
    }

    #[tokio::test]
    async fn the_launch_select_op_takes_a_strict_object_and_skips_where_the_engine_layer_does_not_apply(
    ) {
        let home = FakeHome::new("engine-lib-");
        let ctx = ctx(&home);
        let game = |extra: Value| {
            let mut base = json!({"runner": "gog", "appName": "1207658924", "title": "Quail"});
            for (key, value) in extra.as_object().unwrap() {
                base[key] = value.clone();
            }
            base
        };
        for bad in [
            json!({}),
            game(json!({"extra": 1})),
            game(json!({"runner": ""})),
            game(json!({"appName": ""})),
            game(json!({"purpose": "other"})),
            game(json!({"settings": []})),
        ] {
            assert_eq!(
                dispatch("engine_launch_select", &[bad], &ctx).await,
                Err("engine_launch_select:bad-args".to_string())
            );
        }
        // The context is a Linux one here, so the engine layer does not apply to any game.
        assert_eq!(
            dispatch("engine_launch_select", &[game(json!({}))], &ctx).await,
            Ok(json!({"kind": "skip"}))
        );
        assert_eq!(
            dispatch(
                "engine_launch_select",
                &[game(
                    json!({"isNative": true, "purpose": "setup", "settings": null})
                )],
                &ctx
            )
            .await,
            Ok(json!({"kind": "skip"}))
        );
    }

    #[tokio::test]
    async fn the_deadline_ops_arm_a_bridge_deadline_cancel_it_by_a_closed_reason_and_need_a_shared_context(
    ) {
        let home = FakeHome::new("engine-lib-");
        let unshared = ctx(&home);
        assert_eq!(
            dispatch("engine_deadline_arm", &[json!({"key": "620"})], &unshared).await,
            Err("engine_deadline_arm:not-shared".to_string())
        );
        let shared = ctx(&home).share();
        let ctx = &*shared;
        for bad in [
            json!({}),
            json!({"key": "not a key"}),
            json!({"key": "620", "x": 1}),
        ] {
            assert!(
                dispatch("engine_deadline_arm", &[bad], ctx).await.is_err(),
                "arm"
            );
        }
        assert_eq!(
            dispatch("engine_deadline_arm", &[json!({"key": "620"})], ctx).await,
            Ok(Value::Null)
        );
        assert!(ctx.launch_state.deadline_armed("620"));
        for bad in [
            json!({"key": "620"}),
            json!({"key": "620", "reason": "because"}),
            json!({"key": "not a key", "reason": "first-match"}),
            json!({"key": "620", "reason": "first-match", "x": 1}),
        ] {
            assert_eq!(
                dispatch("engine_deadline_cancel", &[bad], ctx).await,
                Err("engine_deadline_cancel:bad-args".to_string())
            );
        }
        let cancel = json!({"key": "620", "reason": "first-match"});
        assert_eq!(
            dispatch("engine_deadline_cancel", std::slice::from_ref(&cancel), ctx).await,
            Ok(Value::Bool(true))
        );
        assert_eq!(
            dispatch("engine_deadline_cancel", &[cancel], ctx).await,
            Ok(Value::Bool(false))
        );
        assert!(!ctx.launch_state.deadline_armed("620"));
    }

    #[tokio::test]
    async fn the_launch_deadline_op_arms_only_a_bottle_backed_launch_and_the_end_op_releases_it() {
        let home = FakeHome::new("engine-lib-");
        let shared = ctx(&home).share();
        let ctx = &*shared;
        let game = |install: &str| {
            json!({
                "runner": "gog", "appName": "1207658924", "title": "Quail", "installPath": install,
            })
        };
        for bad in [
            json!({}),
            json!({"runner": "gog", "appName": "1", "title": "t", "x": 1}),
            json!({"runner": "", "appName": "1", "title": "t"}),
            json!({"runner": "gog", "appName": "", "title": "t"}),
        ] {
            assert_eq!(
                dispatch("engine_launch_arm_deadline", &[bad], ctx).await,
                Err("engine_launch_arm_deadline:bad-args".to_string())
            );
        }
        let key = "gog:1207658924";
        // No overlay context and no selection: nothing is armed, and a game with no key is the same.
        assert_eq!(
            dispatch("engine_launch_arm_deadline", &[game("/g/Quail")], ctx).await,
            Ok(json!({"armed": false}))
        );
        assert_eq!(
            dispatch(
                "engine_launch_arm_deadline",
                &[json!({"runner": "humble", "appName": "a", "title": "t"})],
                ctx
            )
            .await,
            Ok(json!({"armed": false}))
        );
        ctx.launch_settings.set_launch_overlay_context(
            key,
            launch::settings::OverlayContext::bottle("GameLib-gog-1207658924", None),
        );
        // A bottle context alone is not enough: the selection must be registered.
        assert_eq!(
            dispatch("engine_launch_arm_deadline", &[game("/g/Quail")], ctx).await,
            Ok(json!({"armed": false}))
        );
        ctx.registry.set_engine_selection_quiet(
            None,
            key,
            bottles::registry::EngineSelection::Crossover {
                reason: "cx-healthy".to_string(),
                crossover_build: None,
                bin_dir: "/cx/bin".to_string(),
            },
        );
        // A path with no usable form has no process to watch: the deadline is stood down at once.
        assert_eq!(
            dispatch("engine_launch_arm_deadline", &[game("relative")], ctx).await,
            Ok(json!({"armed": true, "watching": false}))
        );
        assert!(!ctx.launch_state.deadline_armed(key));
        assert_eq!(
            dispatch("engine_launch_arm_deadline", &[game("/g/Quail")], ctx).await,
            Ok(json!({"armed": true, "watching": true}))
        );
        assert!(ctx.launch_state.deadline_armed(key));
        assert_eq!(ctx.launch_state.active_watchers(), 1);
        ctx.launch_state
            .remember_ledger_bottle(key, "GameLib-gog-1207658924");
        ctx.ledger
            .mark_game_running(None, "GameLib-gog-1207658924", key);

        assert_eq!(
            dispatch("engine_launch_end", &[json!({"key": "not a key"})], ctx).await,
            Err("engine_launch_end:bad-args".to_string())
        );
        assert_eq!(
            dispatch("engine_launch_end", &[json!({"key": key})], ctx).await,
            Ok(Value::Null)
        );
        assert!(!ctx.launch_state.deadline_armed(key));
        assert_eq!(ctx.launch_state.active_watchers(), 0);
        assert!(ctx
            .launch_settings
            .get_launch_overlay_context(key)
            .is_none());
        assert!(ctx.registry.get_engine_selection(key).is_none());
        assert!(ctx
            .ledger
            .games_running_in("GameLib-gog-1207658924")
            .is_empty());
    }

    #[tokio::test]
    async fn the_launch_settings_op_returns_the_stored_settings_and_refuses_a_non_object() {
        let home = FakeHome::new("engine-lib-");
        let ctx = ctx(&home);
        let stored = json!({"wineVersion": {"type": "wine", "bin": "/w/wine", "name": "Wine"}});
        for bad in [
            json!({}),
            json!({"stored": []}),
            json!({"key": "not a key", "stored": {}}),
            json!({"stored": {}, "x": 1}),
        ] {
            assert_eq!(
                dispatch("engine_launch_settings_get", &[bad], &ctx).await,
                Err("engine_launch_settings_get:bad-args".to_string())
            );
        }
        // No launch is running for the key, so the settings come back as they went in.
        for key in [json!(null), json!("gog:1")] {
            assert_eq!(
                dispatch(
                    "engine_launch_settings_get",
                    &[json!({"key": key, "stored": stored})],
                    &ctx
                )
                .await,
                Ok(stored.clone())
            );
        }
    }

    #[tokio::test]
    async fn the_dialog_displayed_op_settles_a_waiting_dialog_once_and_refuses_a_foreign_id() {
        let home = FakeHome::new("engine-lib-");
        let ctx = ctx(&home);
        let id = ctx.display_acks.new_id();
        ctx.display_acks
            .track(&ctx, &id, "gog:1", "engine-bottle-busy", 60_000);
        for bad in [
            json!({}),
            json!({"ackId": "ack-1"}),
            json!({"ackId": id, "x": 1}),
        ] {
            assert_eq!(
                dispatch("engine_dialog_displayed", &[bad], &ctx).await,
                Err("engine_dialog_displayed:bad-args".to_string())
            );
        }
        assert_eq!(
            dispatch("engine_dialog_displayed", &[json!({"ackId": id})], &ctx).await,
            Ok(json!(true))
        );
        assert_eq!(
            dispatch("engine_dialog_displayed", &[json!({"ackId": id})], &ctx).await,
            Ok(json!(false)),
            "a repeated acknowledgement is ignored"
        );
        assert_eq!(ctx.display_acks.pending_count(), 0);
    }

    #[tokio::test]
    async fn the_fallback_ops_take_strict_arguments_and_know_only_the_shipped_pins() {
        let home = FakeHome::new("engine-lib-");
        let ctx = ctx(&home);
        let current = pins::pins().unwrap().current.id.clone();
        for (op, bad) in [
            ("engine_fallback_ensure", json!({"pinId": current})),
            (
                "engine_fallback_ensure",
                json!({"pinId": current, "appName": "", "runner": "nile"}),
            ),
            (
                "engine_fallback_ensure",
                json!({"pinId": current, "appName": "a", "runner": "nile", "x": 1}),
            ),
            ("engine_fallback_is_installed", json!({"pinId": "nope"})),
            ("engine_fallback_is_installed", json!({})),
        ] {
            assert_eq!(
                dispatch(op, &[bad], &ctx).await,
                Err(format!("{op}:bad-args"))
            );
        }
        assert_eq!(
            dispatch(
                "engine_fallback_ensure",
                &[json!({"pinId": "nope", "appName": "a", "runner": "nile"})],
                &ctx
            )
            .await,
            Err("engine_fallback_ensure:unknown-pin".to_string())
        );
        assert_eq!(
            dispatch(
                "engine_fallback_ensure",
                &[json!({"pinId": current, "appName": "a", "runner": "nile", "cancelId": "bad id"})],
                &ctx
            )
            .await,
            Err("engine_fallback_ensure:bad-cancel-id".to_string())
        );
        // Nothing is installed on a fresh profile; the answer is a plain bool.
        assert_eq!(
            dispatch(
                "engine_fallback_is_installed",
                &[json!({"pinId": current})],
                &ctx
            )
            .await,
            Ok(json!(false))
        );
    }

    #[tokio::test]
    async fn the_crossover_ops_take_strict_arguments_and_probe_through_the_spawn_seam() {
        let home = FakeHome::new("engine-lib-");
        let runner = std::sync::Arc::new(testing::ScriptedSpecRunner::new(Vec::new()).on_program(
            "/cx/bin/wine",
            gamelib_core::process::SpecOutput {
                code: Some(0),
                stdout: "Demo version (4 days remaining)\n".to_string(),
                ..Default::default()
            },
        ));
        let ctx = ctx(&home).with_proc(runner.clone());
        for (op, bad) in [
            (
                "engine_cx_demo_status",
                json!({"binDir": "bin", "bottleName": "b"}),
            ),
            (
                "engine_cx_demo_status",
                json!({"binDir": "/cx/bin", "bottleName": "b", "x": 1}),
            ),
            (
                "engine_cx_resolve_bin_dir",
                json!({"hintWineBins": "not-a-list"}),
            ),
        ] {
            assert_eq!(
                dispatch(op, &[bad], &ctx).await,
                Err(format!("{op}:bad-args"))
            );
        }
        let answer = dispatch(
            "engine_cx_demo_status",
            &[json!({"binDir": "/cx/bin", "bottleName": "GameLib-gog-1"})],
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(answer["kind"], "ok");
        assert_eq!(
            answer["status"],
            json!({"kind": "trial", "daysRemaining": 4})
        );
        // The production call inherits the real profile: nothing replaces the environment.
        let spawn = &runner.spawns()[0];
        assert!(!spawn.replace_env);
        assert_eq!(
            spawn.env_set.get("CX_BOTTLE").map(String::as_str),
            Some("GameLib-gog-1")
        );
    }

    #[tokio::test]
    async fn the_decision_ops_take_strict_arguments_and_fall_back_when_crossover_is_missing() {
        let home = FakeHome::new("engine-lib-");
        let mut ctx = ctx(&home);
        // The machine's own /Applications must not answer.
        ctx.crossover_locator = crossover::locate::CrossoverLocator::with_system_applications(
            home.root()
                .join("no-applications")
                .to_string_lossy()
                .into_owned(),
        );
        for (op, bad) in [
            ("engine_decide_launch", json!({"key": "gog:1"})),
            (
                "engine_decide_launch",
                json!({"key": "gog:1", "bottleName": "b", "pins": {}}),
            ),
            (
                "engine_decide_launch",
                json!({"key": "gog:1", "bottleName": "b", "monitorPhase": "paused"}),
            ),
            ("engine_decide_creation", json!({"key": "gog:1", "x": 1})),
            ("engine_preflight_crossover", json!({"key": "gog:1"})),
            ("engine_is_crossover_missing", json!({"hintWineBins": 3})),
        ] {
            assert_eq!(
                dispatch(op, &[bad], &ctx).await,
                Err(format!("{op}:bad-args")),
                "{op}"
            );
        }

        // No CrossOver: the launch falls to the current pin with the reason, and says it needs a download.
        let launch = dispatch(
            "engine_decide_launch",
            &[json!({"key": "gog:1", "bottleName": "GameLib-gog-1", "override": "automatic"})],
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(launch["kind"], "use");
        assert_eq!(launch["selection"]["kind"], "pinned");
        assert_eq!(launch["selection"]["reason"], "cx-missing");
        assert_eq!(launch["preflight"]["kind"], "missing");
        assert_eq!(launch["needsDownload"], true);
        // An override the closed grammar does not know is automatic, never an engine named by the caller.
        let odd = dispatch(
            "engine_decide_launch",
            &[json!({"key": "gog:1", "bottleName": "GameLib-gog-1", "override": "/usr/bin/wine"})],
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(odd["override"], "automatic");
        // A CrossOver override with CrossOver missing is refused, not rerouted.
        let refused = dispatch(
            "engine_decide_launch",
            &[json!({"key": "gog:1", "bottleName": "GameLib-gog-1", "override": "crossover"})],
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(refused["kind"], "unavailable");

        let creation = dispatch("engine_decide_creation", &[json!({"key": "gog:1"})], &ctx)
            .await
            .unwrap();
        assert_eq!(creation["decision"]["kind"], "pinned");
        assert_eq!(creation["decision"]["reason"], "cx-missing");
        assert_eq!(creation["createCapMs"], 120_000);
        let preflight = dispatch(
            "engine_preflight_crossover",
            &[json!({"bottleName": "GameLib-gog-1"})],
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(
            preflight,
            json!({"kind": "missing", "detail": "CrossOver is not installed"})
        );
        assert_eq!(
            dispatch("engine_is_crossover_missing", &[json!({})], &ctx).await,
            Ok(json!(true))
        );
        let options = dispatch("engine_list_override_options", &[], &ctx)
            .await
            .unwrap();
        assert_eq!(options[0]["id"], "automatic");
        assert_eq!(options[1]["id"], "crossover");
        assert_eq!(options[1]["available"], false);
    }

    #[tokio::test]
    async fn the_ledger_ops_record_and_drop_a_running_game_and_refuse_what_the_ledger_refuses() {
        let home = FakeHome::new("engine-lib-");
        let ctx = ctx(&home);
        let args = json!({"bottleName": "GameLib-gog-1", "key": "gog:1"});
        let ran = dispatch(
            "engine_ledger_mark_running",
            std::slice::from_ref(&args),
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(ran, json!(true));
        assert_eq!(ctx.ledger.games_running_in("GameLib-gog-1"), ["gog:1"]);
        let stopped = dispatch("engine_ledger_mark_stopped", &[args], &ctx)
            .await
            .unwrap();
        assert_eq!(stopped, Value::Null);
        assert_eq!(ctx.ledger.size(), 0);
        // An unsafe bottle and a key that is not an engine key are `false`, never recorded.
        for bad in [
            json!({"bottleName": "a/b", "key": "gog:1"}),
            json!({"bottleName": "GameLib-x", "key": "steam:620"}),
        ] {
            let answer = dispatch("engine_ledger_mark_running", &[bad], &ctx)
                .await
                .unwrap();
            assert_eq!(answer, json!(false));
        }
        assert_eq!(ctx.ledger.size(), 0);
        for bad in [
            vec![],
            vec![json!({"bottleName": "x"})],
            vec![json!({"bottleName": "x", "key": "620", "extra": 1})],
        ] {
            for op in ["engine_ledger_mark_running", "engine_ledger_mark_stopped"] {
                let err = dispatch(op, &bad, &ctx).await.unwrap_err();
                assert_eq!(err, format!("{op}:bad-args"), "{bad:?}");
            }
        }
    }

    #[tokio::test]
    async fn the_selection_clear_op_drops_a_selection_quietly() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let home = FakeHome::new("engine-lib-");
        let ctx = ctx(&home);
        let heard = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&heard);
        ctx.registry.set_change_hook(Some(Arc::new(move |_, _| {
            counter.fetch_add(1, Ordering::SeqCst);
        })));
        let selection: bottles::registry::EngineSelection = serde_json::from_value(
            json!({"kind": "crossover", "reason": "cx-healthy", "crossoverBuild": null, "binDir": "/b"}),
        )
        .unwrap();
        assert!(ctx
            .registry
            .set_engine_selection_quiet(None, "620", selection));
        let cleared = dispatch("engine_selection_clear", &[json!({"key": "620"})], &ctx)
            .await
            .unwrap();
        assert_eq!(cleared, json!(true));
        let again = dispatch("engine_selection_clear", &[json!({"key": "620"})], &ctx)
            .await
            .unwrap();
        assert_eq!(again, json!(false));
        assert_eq!(heard.load(Ordering::SeqCst), 0, "the reply is the update");
        for bad in [
            vec![],
            vec![json!({"key": "620", "x": 1})],
            vec![json!("620")],
        ] {
            let err = dispatch("engine_selection_clear", &bad, &ctx)
                .await
                .unwrap_err();
            assert_eq!(err, "engine_selection_clear:bad-args", "{bad:?}");
        }
    }

    #[tokio::test]
    async fn the_cancel_op_ends_the_creation_that_registered_its_id() {
        let home = FakeHome::new("engine-lib-");
        let ctx = ctx(&home);
        let (token, guard) = register_create_cancel("cancel-test-1");
        let none = dispatch(
            "engine_bottle_cancel_create",
            &[json!({"cancelId": "another-id"})],
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(none, json!(false));
        assert!(!token.is_cancelled());
        let hit = dispatch(
            "engine_bottle_cancel_create",
            &[json!({"cancelId": "cancel-test-1"})],
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(hit, json!(true));
        assert!(token.is_cancelled());
        drop(guard);
        let gone = dispatch(
            "engine_bottle_cancel_create",
            &[json!({"cancelId": "cancel-test-1"})],
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(gone, json!(false), "a finished creation has no cancel");
        for bad in ["", "a b", "../x", &"x".repeat(65)] {
            let err = dispatch(
                "engine_bottle_cancel_create",
                &[json!({"cancelId": bad})],
                &ctx,
            )
            .await
            .unwrap_err();
            assert_eq!(err, "engine_bottle_cancel_create:bad-args", "{bad}");
        }
    }

    #[tokio::test]
    async fn the_set_online_op_records_the_monitors_answer_and_takes_one_strict_object() {
        let home = FakeHome::new("engine-lib-");
        let ctx = ctx(&home);
        // The first reading of the monitor is "not yet probed": not online.
        assert!(!ctx.is_online());
        let set = dispatch("engine_set_online", &[json!({"online": true})], &ctx)
            .await
            .unwrap();
        assert_eq!(set, Value::Null);
        assert!(ctx.is_online());
        dispatch("engine_set_online", &[json!({"online": false})], &ctx)
            .await
            .unwrap();
        assert!(!ctx.is_online());

        for bad in [
            vec![],
            vec![json!(true)],
            vec![json!({})],
            vec![json!({"online": "yes"})],
            vec![json!({"online": true, "extra": 1})],
            vec![json!({"online": true}), json!(1)],
        ] {
            ctx.set_online(true);
            let err = dispatch("engine_set_online", &bad, &ctx).await.unwrap_err();
            assert_eq!(err, "engine_set_online:bad-args", "{bad:?}");
            assert!(ctx.is_online(), "a rejected call changes nothing: {bad:?}");
        }
    }

    /// A bottle under the ctx's user home, with a system.reg and (optionally) a conf.
    fn lay_bottle(home: &FakeHome, name: &str, with_conf: bool, dxvk: bool) -> std::path::PathBuf {
        let dir =
            std::path::PathBuf::from(bottles::paths::bottle_dir(&home.root().join("home"), name));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("system.reg"), "r").unwrap();
        if with_conf {
            std::fs::write(dir.join("cxbottle.conf"), "[Bottle]\n").unwrap();
        }
        if dxvk {
            std::fs::write(dir.join("current_dxvk-macOS"), "v1\n").unwrap();
        }
        dir
    }

    #[tokio::test]
    async fn the_provisioned_op_reads_the_conf_and_refuses_an_unsafe_name() {
        let home = FakeHome::new("engine-lib-");
        let ctx = ctx(&home);
        lay_bottle(&home, "GameLib-gog-1", true, false);
        lay_bottle(&home, "GameLib-gog-2", false, false);
        let ask = |name: &str| {
            let ctx = &ctx;
            let args = [json!({"bottleName": name})];
            async move { dispatch("engine_bottle_is_provisioned", &args, ctx).await }
        };
        assert_eq!(ask("GameLib-gog-1").await.unwrap(), json!(true));
        assert_eq!(ask("GameLib-gog-2").await.unwrap(), json!(false));
        assert_eq!(ask("no-such-bottle").await.unwrap(), json!(false));
        // A traversal name never reaches a path.
        assert_eq!(ask("../x").await.unwrap(), json!(false));
        for bad in [
            vec![],
            vec![json!("GameLib-gog-1")],
            vec![json!({})],
            vec![json!({"bottleName": 1})],
            vec![json!({"bottleName": "x", "extra": 1})],
        ] {
            let err = dispatch("engine_bottle_is_provisioned", &bad, &ctx)
                .await
                .unwrap_err();
            assert_eq!(err, "engine_bottle_is_provisioned:bad-args", "{bad:?}");
        }
    }

    #[tokio::test]
    async fn the_record_pinned_op_writes_the_marker_once_and_never_over_a_newer_one() {
        let home = FakeHome::new("engine-lib-");
        let ctx = ctx(&home);
        let dir = lay_bottle(&home, "GameLib-gog-1", true, true);
        let engine = json!({
            "wineBin": "/t/wine", "wineserverBin": "/t/wineserver", "label": "Pinned",
            "version": "11.20", "dxvk": {"dir": "/t/steam-engines/dxvk-macOS-v1", "version": "v1"}
        });
        let args = [
            json!({"bottleName": "GameLib-gog-1", "pinId": "wine-staging-11.20", "engine": engine}),
        ];
        assert_eq!(
            dispatch("engine_bottle_record_pinned", &args, &ctx)
                .await
                .unwrap(),
            json!(true)
        );
        let marker = dir.join(".gamelib-engine.json");
        assert_eq!(
            std::fs::read_to_string(&marker).unwrap(),
            r#"{"kind":"pinned","id":"wine-staging-11.20","wineserverBin":"/t/wineserver","dxvk":{"dir":"/t/steam-engines/dxvk-macOS-v1","version":"v1"},"version":1}"#
        );
        // A marker a newer build wrote is kept and the op says nothing was recorded.
        let newer = r#"{"kind":"pinned","id":"x","wineserverBin":"/w","version":2}"#;
        std::fs::write(&marker, newer).unwrap();
        assert_eq!(
            dispatch("engine_bottle_record_pinned", &args, &ctx)
                .await
                .unwrap(),
            json!(false)
        );
        assert_eq!(std::fs::read_to_string(&marker).unwrap(), newer);
        // An absent bottle, an unsafe name and a bad pin id record nothing.
        for (name, pin) in [("no-such", "p"), ("../x", "p"), ("GameLib-gog-1", "bad/id")] {
            let args = [json!({"bottleName": name, "pinId": pin, "engine": engine})];
            assert_eq!(
                dispatch("engine_bottle_record_pinned", &args, &ctx)
                    .await
                    .unwrap(),
                json!(false),
                "{name} {pin}"
            );
        }
        // The engine is strict: an unknown member is a bad argument.
        let mut loose = engine.clone();
        loose["extra"] = json!(1);
        let args = [json!({"bottleName": "GameLib-gog-1", "pinId": "p", "engine": loose})];
        assert_eq!(
            dispatch("engine_bottle_record_pinned", &args, &ctx)
                .await
                .unwrap_err(),
            "engine_bottle_record_pinned:bad-args"
        );
    }

    #[tokio::test]
    async fn the_record_crossover_op_writes_the_marker_and_the_reconcile_op_reports_what_it_wrote()
    {
        let home = FakeHome::new("engine-lib-");
        let ctx = ctx(&home);
        let dir = lay_bottle(&home, "GameLib-gog-1", true, false);
        let record = |name: &str, bin_dir: &str| [json!({"bottleName": name, "binDir": bin_dir})];
        assert_eq!(
            dispatch(
                "engine_bottle_record_crossover",
                &record("GameLib-gog-1", "/cx/bin"),
                &ctx
            )
            .await
            .unwrap(),
            json!(true)
        );
        let marker = dir.join(".gamelib-engine.json");
        assert_eq!(
            std::fs::read_to_string(&marker).unwrap(),
            r#"{"kind":"crossover","id":"crossover","wineserverBin":"/cx/bin/wineserver","version":1}"#
        );
        // An absent bottle and an unsafe name record nothing; a relative bin directory is refused.
        for name in ["no-such", "../x"] {
            assert_eq!(
                dispatch(
                    "engine_bottle_record_crossover",
                    &record(name, "/cx/bin"),
                    &ctx
                )
                .await
                .unwrap(),
                json!(false),
                "{name}"
            );
        }
        assert_eq!(
            dispatch(
                "engine_bottle_record_crossover",
                &record("GameLib-gog-1", "cx/bin"),
                &ctx
            )
            .await
            .unwrap_err(),
            "engine_bottle_record_crossover:bad-args"
        );

        // A trusted marker is left alone; a contradicted one is rewritten from what the bottle holds.
        let reconcile = [json!({"bottleName": "GameLib-gog-1"})];
        assert_eq!(
            dispatch("engine_bottle_reconcile_marker", &reconcile, &ctx)
                .await
                .unwrap(),
            Value::Null
        );
        std::fs::write(dir.join("current_dxvk-macOS"), "v1\n").unwrap();
        assert_eq!(
            dispatch("engine_bottle_reconcile_marker", &reconcile, &ctx)
                .await
                .unwrap(),
            json!("pinned")
        );
        assert!(std::fs::read_to_string(&marker)
            .unwrap()
            .contains(r#""kind":"pinned""#));
        // An unsafe or absent bottle answers null; the argument is strict.
        for name in ["no-such", "../x"] {
            assert_eq!(
                dispatch(
                    "engine_bottle_reconcile_marker",
                    &[json!({"bottleName": name})],
                    &ctx
                )
                .await
                .unwrap(),
                Value::Null,
                "{name}"
            );
        }
        assert_eq!(
            dispatch(
                "engine_bottle_reconcile_marker",
                &[json!({"bottleName": "GameLib-gog-1", "extra": 1})],
                &ctx
            )
            .await
            .unwrap_err(),
            "engine_bottle_reconcile_marker:bad-args"
        );
    }

    #[tokio::test]
    async fn the_prepare_op_switches_a_bottle_and_takes_strict_arguments() {
        use crate::testing::{ScriptedDxvk, ScriptedSpecRunner};
        use gamelib_core::process::SpecOutput;

        let home = FakeHome::new("engine-lib-");
        let runner = std::sync::Arc::new(ScriptedSpecRunner::new(Vec::new()).on_program(
            "/cx/bin/wineserver",
            SpecOutput {
                code: Some(0),
                ..SpecOutput::default()
            },
        ));
        let ctx = ctx(&home)
            .with_proc(runner.clone())
            .with_dxvk(std::sync::Arc::new(ScriptedDxvk::new(&[true])))
            .with_crossover_bin_dir(std::sync::Arc::new(|| {
                Box::pin(async { Some("/cx/bin".to_string()) })
            }));
        let dir = lay_bottle(&home, "GameLib-gog-1", true, false);
        std::fs::write(
            dir.join(".gamelib-engine.json"),
            r#"{"kind":"crossover","id":"crossover","wineserverBin":"/cx/bin/wineserver","version":1}"#,
        )
        .unwrap();
        let tools = home.root().join("tools/steam-engines");
        let wine_bin = home.root().join("tools/wine/m/bin/wine");
        let wineserver_bin = home.root().join("tools/wine/m/bin/wineserver");
        let engine = |dxvk_dir: &str| {
            json!({
                "kind": "wine-manager", "managerVersion": "Wine-Staging-10.5", "reason": "override",
                "wineBin": wine_bin, "wineserverBin": wineserver_bin, "label": "Wine Manager",
                "version": "10.5", "dxvk": {"dir": dxvk_dir, "version": "v1"}
            })
        };
        let good = json!({
            "key": "gog:1", "bottleName": "GameLib-gog-1",
            "next": engine(&tools.join("dxvk").to_string_lossy())
        });
        // The scripted installer writes no `current_dxvk-macOS`, so the switch ends as a DXVK failure:
        // the previous wineserver was stopped and the answer carries the TS reason and detail.
        let answer = dispatch("engine_bottle_prepare", &[good], &ctx)
            .await
            .unwrap();
        assert_eq!(answer["ok"], json!(false));
        assert_eq!(answer["reason"], json!("dxvk-failed"));
        assert_eq!(runner.spawns().len(), 1);
        assert_eq!(runner.spawns()[0].argv, ["-k"]);

        // A key that is not an engine key, a relative program, a DXVK directory outside the pinned
        // engines, settings that are not objects and an unknown member are all bad arguments, and
        // nothing is spawned for them.
        let base = |patch: Value| {
            let mut request = json!({
                "key": "gog:1", "bottleName": "GameLib-gog-1",
                "next": engine(&tools.join("dxvk").to_string_lossy())
            });
            for (k, v) in patch.as_object().unwrap() {
                request[k] = v.clone();
            }
            request
        };
        let spawned = runner.spawns().len();
        for bad in [
            base(json!({"key": "not a key"})),
            base(json!({"next": {
                "kind": "wine-manager", "managerVersion": "m", "reason": "override",
                "wineBin": "/usr/bin/wine", "wineserverBin": "/usr/bin/wineserver", "label": "x",
                "version": "1", "dxvk": null}})),
            base(json!({"next": engine("/elsewhere/dxvk")})),
            base(json!({"fallbackSettings": []})),
            base(json!({"monitorPhase": "paused"})),
            base(json!({"extra": 1})),
            base(
                json!({"next": {"kind": "crossover", "reason": "r", "crossoverBuild": null, "binDir": "cx/bin"}}),
            ),
        ] {
            let err = dispatch("engine_bottle_prepare", std::slice::from_ref(&bad), &ctx)
                .await
                .unwrap_err();
            assert_eq!(err, "engine_bottle_prepare:bad-args", "{bad}");
        }
        assert!(dispatch("engine_bottle_prepare", &[], &ctx).await.is_err());
        assert_eq!(runner.spawns().len(), spawned);
    }

    #[tokio::test]
    async fn the_ensure_op_reuses_a_provisioned_bottle_and_takes_strict_arguments() {
        let home = FakeHome::new("engine-lib-");
        let ctx = ctx(&home);
        lay_bottle(&home, "GameLib-gog-1", true, false);
        let request = |patch: Value| {
            let mut request = json!({
                "key": "gog:1", "bottleName": "GameLib-gog-1", "appName": "1", "runner": "gog",
                "decision": {"kind": "crossover", "createTimeoutMs": 1000}
            });
            for (k, v) in patch.as_object().unwrap() {
                request[k] = v.clone();
            }
            request
        };
        // A provisioned bottle is reused: no process starts, nothing changes.
        let reused = dispatch("engine_bottle_ensure_per_game", &[request(json!({}))], &ctx)
            .await
            .unwrap();
        assert_eq!(
            reused,
            json!({"status": "done", "createdHere": false, "engine": "existing"})
        );
        // An unsafe name is an error answer (as the TS answered), not a bad argument, and nothing is made.
        let answer = dispatch(
            "engine_bottle_ensure_per_game",
            &[request(json!({"bottleName": "a/b"}))],
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(answer["status"], json!("error"));
        // The pin must be one the table holds, and the key must be the runner's and app name's.
        for bad in [
            request(json!({"decision": {"kind": "pinned", "pinId": "no-such-pin"}})),
            request(json!({"key": "gog:2"})),
            request(json!({"runner": "nope"})),
            request(json!({"fallbackSettings": 1})),
            request(json!({"decision": {"kind": "other"}})),
            request(json!({"extra": 1})),
        ] {
            let err = dispatch(
                "engine_bottle_ensure_per_game",
                std::slice::from_ref(&bad),
                &ctx,
            )
            .await
            .unwrap_err();
            assert_eq!(err, "engine_bottle_ensure_per_game:bad-args", "{bad}");
        }
    }

    #[tokio::test]
    async fn the_create_fallback_op_refuses_an_engine_outside_the_engine_roots() {
        use crate::testing::ScriptedSpecRunner;

        let home = FakeHome::new("engine-lib-");
        let runner = std::sync::Arc::new(ScriptedSpecRunner::new(Vec::new()));
        let ctx = ctx(&home).with_proc(runner.clone());
        let engine = |wine: &str, dxvk: Value| {
            json!({
                "bottleName": "GameLib-gog-1",
                "engine": {"wineBin": wine, "wineserverBin": wine, "label": "x", "version": "1", "dxvk": dxvk}
            })
        };
        for bad in [
            engine("/usr/bin/wine", Value::Null),
            engine("wine", Value::Null),
            engine(
                &home.root().join("tools/wine/m/bin/wine").to_string_lossy(),
                json!({"dir": "/elsewhere", "version": "v1"}),
            ),
        ] {
            let err = dispatch(
                "engine_bottle_create_fallback",
                std::slice::from_ref(&bad),
                &ctx,
            )
            .await
            .unwrap_err();
            assert_eq!(err, "engine_bottle_create_fallback:bad-args", "{bad}");
        }
        assert!(runner.spawns().is_empty());
        // A trusted engine is run: the scripted wineboot answers nothing, so the creation fails after
        // it spawned, and the answer is the sidecar's error shape.
        let wine = home.root().join("tools/wine/m/bin/wine");
        let answer = dispatch(
            "engine_bottle_create_fallback",
            &[engine(&wine.to_string_lossy(), Value::Null)],
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(answer["status"], json!("error"));
        assert!(!runner.spawns().is_empty());
        assert_eq!(runner.spawns()[0].argv, ["wineboot", "-i"]);
    }

    #[tokio::test]
    async fn the_per_game_bottle_name_op_names_a_game_and_nulls_garbage() {
        let home = FakeHome::new("engine-lib-");
        let ctx = ctx(&home);
        let args = [json!({"runner": "gog", "appName": "1234"})];
        let named = dispatch("engine_per_game_bottle_name", &args, &ctx)
            .await
            .unwrap();
        assert_eq!(named, "GameLib-gog-1234");
        let steam = [json!({"runner": "steam", "appName": "620"})];
        let none = dispatch("engine_per_game_bottle_name", &steam, &ctx)
            .await
            .unwrap();
        assert!(none.is_null());
        let err = dispatch("engine_per_game_bottle_name", &[], &ctx)
            .await
            .unwrap_err();
        assert_eq!(err, "engine_per_game_bottle_name:bad-args");
    }

    #[tokio::test]
    async fn the_options_op_lists_automatic_crossover_and_the_pin_for_an_empty_profile() {
        let home = FakeHome::new("engine-lib-");
        let ctx = ctx(&home);
        let rows = dispatch("engine_list_options", &[json!(null)], &ctx)
            .await
            .unwrap();
        let ids: Vec<&str> = rows
            .as_array()
            .unwrap()
            .iter()
            .map(|r| r["id"].as_str().unwrap())
            .collect();
        assert_eq!(ids, ["automatic", "crossover", "pinned:wine-staging-11.20"]);
        assert_eq!(rows[1]["installed"], false);
        let err = dispatch("engine_list_options", &[], &ctx)
            .await
            .unwrap_err();
        assert_eq!(err, "engine_list_options:bad-args");
    }

    #[tokio::test]
    async fn the_default_engine_op_derives_automatic_without_a_config_and_takes_no_argument() {
        let home = FakeHome::new("engine-lib-");
        let ctx = ctx(&home);
        let payload = dispatch("engine_default_engine", &[], &ctx).await.unwrap();
        assert_eq!(
            payload,
            json!({"effectiveEngineId": "automatic", "engineSource": "derived", "legacyLabel": null})
        );
        let err = dispatch("engine_default_engine", &[json!(1)], &ctx)
            .await
            .unwrap_err();
        assert_eq!(err, "engine_default_engine:bad-args");
    }

    #[tokio::test]
    async fn the_default_wine_hook_feeds_the_default_engine_as_a_legacy_wine() {
        let home = FakeHome::new("engine-lib-");
        let ctx = ctx(&home).with_default_wine(Arc::new(|| {
            Some(ctx::WineInstallationView {
                bin: "/usr/bin/wine".to_string(),
                name: "Default Wine".to_string(),
                kind: "wine".to_string(),
                lib: None,
                lib32: None,
                wineserver: None,
            })
        }));
        let payload = dispatch("engine_default_engine", &[], &ctx).await.unwrap();
        assert_eq!(payload["effectiveEngineId"], "legacy:Default Wine");
        assert_eq!(payload["legacyLabel"], "Default Wine");
    }

    #[tokio::test]
    async fn the_tool_settings_op_keeps_stored_settings_off_macos_and_is_strict_about_its_argument()
    {
        let home = FakeHome::new("engine-lib-");
        let ctx = ctx(&home);
        let args = [json!({
            "runner": "gog", "appName": "1234", "stored": {"winePrefix": "/p"}, "ensureBottle": false
        })];
        let result = dispatch("engine_resolve_tool_settings", &args, &ctx)
            .await
            .unwrap();
        assert_eq!(
            result,
            json!({"kind": "stored", "settings": {"winePrefix": "/p"}})
        );
        let extra = [json!({
            "runner": "gog", "appName": "1", "stored": {}, "ensureBottle": false, "extra": 1
        })];
        let err = dispatch("engine_resolve_tool_settings", &extra, &ctx)
            .await
            .unwrap_err();
        assert_eq!(err, "engine_resolve_tool_settings:bad-args");
    }

    #[tokio::test]
    async fn an_unknown_op_is_named_in_the_error() {
        let home = FakeHome::new("engine-lib-");
        let err = dispatch("nope", &[], &ctx(&home)).await.unwrap_err();
        assert_eq!(err, "unknown op: nope");
    }

    #[tokio::test]
    async fn engine_pins_answers_the_shared_table() {
        let home = FakeHome::new("engine-lib-");
        let value = dispatch("engine_pins", &[], &ctx(&home)).await.unwrap();
        assert_eq!(value["current"]["id"], "wine-staging-11.20");
        assert!(value["previous"].is_null());
    }

    #[tokio::test]
    async fn a_two_argument_call_is_bad_args() {
        let home = FakeHome::new("engine-lib-");
        let args = [json!(1), json!(2)];
        let err = dispatch("engine_pins", &args, &ctx(&home))
            .await
            .unwrap_err();
        assert_eq!(err, "engine_pins:bad-args");
    }

    #[test]
    fn decode_takes_exactly_one_strict_argument() {
        #[derive(serde::Deserialize, Debug)]
        #[serde(deny_unknown_fields)]
        struct Args {
            #[allow(dead_code)]
            id: String,
        }
        assert!(decode::<Args>("engine_x", &[json!({"id": "a"})]).is_ok());
        assert_eq!(
            decode::<Args>("engine_x", &[]).unwrap_err(),
            "engine_x:bad-args"
        );
        assert_eq!(
            decode::<Args>("engine_x", &[json!({"id": "a", "extra": 1})]).unwrap_err(),
            "engine_x:bad-args"
        );
    }

    #[tokio::test]
    async fn dispatch_sync_inside_a_runtime_is_wrong_thread() {
        let home = FakeHome::new("engine-lib-");
        let err = dispatch_sync("engine_pins", &[], &ctx(&home)).unwrap_err();
        assert_eq!(err, "engine_pins:wrong-thread");
    }

    #[test]
    fn dispatch_sync_on_a_plain_thread_runs_the_op() {
        let home = FakeHome::new("engine-lib-");
        let value = dispatch_sync("engine_pins", &[], &ctx(&home)).unwrap();
        assert_eq!(value["current"]["id"], "wine-staging-11.20");
    }

    #[tokio::test]
    async fn a_panicking_op_answers_panic() {
        let home = FakeHome::new("engine-lib-");
        let err = guarded("engine_pins", &ctx(&home), panicking())
            .await
            .unwrap_err();
        assert_eq!(err, "engine_pins:panic");
    }

    #[tokio::test]
    async fn a_cancelled_shutdown_answers_shutdown_and_releases_its_registrant() {
        let home = FakeHome::new("engine-lib-");
        let ctx = ctx(&home);
        ctx.shutdown.token().cancel();
        let err = dispatch("engine_pins", &[], &ctx).await.unwrap_err();
        assert_eq!(err, "engine_pins:shutdown");
        assert!(ctx
            .shutdown
            .drain(std::time::Duration::from_millis(50))
            .is_empty());
    }

    #[tokio::test]
    async fn the_remove_op_deletes_only_the_named_bottle_and_refuses_an_unsafe_name() {
        let home = FakeHome::new("engine-lib-");
        let ctx = ctx(&home);
        let mine = lay_bottle(&home, "GameLib-gog-1", true, false);
        let sibling = lay_bottle(&home, "GameLib-gog-2", true, false);
        let ask = |name: &str| {
            let ctx = &ctx;
            let args = [json!({"bottleName": name})];
            async move { dispatch("engine_bottle_remove_created", &args, ctx).await }
        };
        assert_eq!(ask("../GameLib-gog-2").await.unwrap(), json!(false));
        assert!(sibling.join("system.reg").exists());
        assert_eq!(ask("GameLib-gog-1").await.unwrap(), json!(true));
        assert!(!mine.exists());
        assert!(sibling.join("system.reg").exists());
        let err = dispatch("engine_bottle_remove_created", &[json!({})], &ctx)
            .await
            .unwrap_err();
        assert_eq!(err, "engine_bottle_remove_created:bad-args");
    }

    #[tokio::test]
    async fn the_kill_and_create_ops_take_strict_arguments() {
        let home = FakeHome::new("engine-lib-");
        let ctx = ctx(&home);
        for (op, bad) in [
            // A relative program is not a path GameLib launched.
            (
                "engine_bottle_kill_wineserver",
                json!({"bottleName": "a", "wineserverBin": "wineserver"}),
            ),
            (
                "engine_bottle_kill_wineserver",
                json!({"bottleName": "a", "wineserverBin": "/w", "extraEnv": {"A=B": "x"}}),
            ),
            (
                "engine_bottle_kill_wineserver",
                json!({"bottleName": "a", "wineserverBin": "/w", "extra": 1}),
            ),
            (
                "engine_bottle_create_crossover",
                json!({"bottleName": "a", "binDir": "bin"}),
            ),
            (
                "engine_bottle_create_crossover",
                json!({"bottleName": "a", "binDir": "/bin", "createTimeoutMs": "5"}),
            ),
        ] {
            let err = dispatch(op, std::slice::from_ref(&bad), &ctx)
                .await
                .unwrap_err();
            assert_eq!(err, format!("{op}:bad-args"), "{bad}");
        }
    }

    #[tokio::test]
    async fn the_create_and_kill_ops_spawn_through_the_context_runner() {
        use gamelib_core::process::SpecOutput;
        let home = FakeHome::new("engine-lib-");
        let runner = Arc::new(
            testing::ScriptedSpecRunner::new(Vec::new())
                .on_program(
                    "/cx/bin/cxbottle",
                    SpecOutput {
                        code: Some(0),
                        ..SpecOutput::default()
                    },
                )
                .on_program(
                    "/cx/bin/wineserver",
                    SpecOutput {
                        code: Some(0),
                        ..SpecOutput::default()
                    },
                ),
        );
        let ctx = ctx(&home).with_proc(runner.clone());
        // cxbottle "creates" the bottle: the scripted run leaves nothing, so the create reports the
        // missing conf, and an unsafe name never reaches a spawn.
        let created = dispatch(
            "engine_bottle_create_crossover",
            &[json!({"bottleName": "GameLib-gog-1", "binDir": "/cx/bin", "createTimeoutMs": 5000})],
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(created["status"], "error");
        assert_eq!(created["errorCode"], "crossover-create-failed");
        let rejected = dispatch(
            "engine_bottle_create_crossover",
            &[json!({"bottleName": "a/b", "binDir": "/cx/bin"})],
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(rejected["error"], "Invalid bottle name: \"a/b\"");
        let spawns = runner.spawns();
        assert_eq!(spawns[0].label, "engine-cxbottle");
        assert_eq!(
            spawns[0].timeout,
            Some(std::time::Duration::from_millis(5000))
        );
        assert_eq!(spawns[1].label, "engine-wineserver-kill");
        assert_eq!(spawns[1].env_set["CX_ROOT"], "/cx");
        assert_eq!(spawns.len(), 2);

        let killed = dispatch(
            "engine_bottle_kill_wineserver",
            &[json!({"bottleName": "GameLib-gog-1", "wineserverBin": "/cx/bin/wineserver"})],
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(killed, json!(true));
        assert_eq!(runner.spawns().len(), 3);
    }
}
