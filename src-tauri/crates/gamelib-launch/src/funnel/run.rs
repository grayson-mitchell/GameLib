//! `run_launch` (88.3-04, D-01): `launchEventCallback` and `runLaunchEventCallback` of `launcher.ts`, ported.
//!
//! One Play of one game. The funnel enters the single-flight table first (a second Play of the same game joins
//! the first and gets its result, WR-03), then, as the leader, runs in a task of its own so that a caller who
//! goes away neither stops the launch nor strands the Plays that joined it. The task holds a
//! `Shutdown` registrant for as long as the launch is in flight and ends with `launch:shutdown` when the app
//! begins to exit.
//!
//! **Every branch of the TS funnel** is here, in the TS order (88.3-04 ported the tracer's path, 88.3-05 the
//! rest): a missing install folder (the question, `done`, `abort`); the cloud-saves download and upload; the
//! hide-window rule; the display-sleep blocker, started once per context and stopped on every end that began
//! after its start (87-73 RF2); the per-game log and its two forced warnings; every answer of the engine step
//! (a refused, a thrown and a `use` whose overlay replaces the settings for everything after, and whose key is
//! released after the after-script, a failed release logged and never replacing the result); the Wine check,
//! only when the game is not native and no engine controls the launch, with its two `wineVersion` writes;
//! the before and after scripts; the launch hook with the presence calls; the play time, the macOS runs-for-me
//! record, the GOG playtime post and the recent-game write; and the exit of a launch made without a window.
//! Nothing calls `run_launch` until 88.3-06 adds the op.
//!
//! Every line the funnel writes to `gamelib.log` is the TS's fixed text, with the app name and title the TS line
//! already carried. A hook, step or script failure is a category word (T-88.3-09, T-88.2-14), never an error
//! text: the TS handler behind a hook writes its own error line, and a rejection the TS let escape the launch
//! (a rejected before or after script, a failed Wine check or GOG playtime post, a failed engine step) answers
//! `Err("launch:<what>:<word>")`, leaving exactly what the TS left undone undone (D-20: recorded, not fixed).

use std::path::Path;
use std::sync::Arc;

use gamelib_engine::ctx::Platform;
use gamelib_engine::launch::step::{Purpose, SelectArgs, SelectKind, SelectReply};
use gamelib_info::recent::AddArgs;
use gamelib_knownfix::types::Runner;
use gamelib_log::{Level, Prefix};
use serde_json::{json, Value};

use super::flights::Enter;
use super::log::LaunchLog;
use super::playtime::{iso_string, record_play_session, record_session_playtime, PlayTimes};
use super::session::{QuitHook, SessionFacts, SessionGuard};
use super::steps::{CtxFunnelSteps, FunnelSteps};
use super::{FunnelHost, LaunchParams, LaunchStatus};
use crate::ctx::LaunchCtx;
use crate::game::end::GROUP_POLL;
use crate::game::record;
use crate::game::registry::EntryId;
use crate::hooks::{
    HookError, LaunchHookArgs, ManagerHooks, SyncDirection, SyncSavesArgs, WineSettingsWrite,
};
use crate::prepare::check_wine::CheckWineArgs;
use crate::prepare::launch::RunnerArg;
use crate::runner::script::{ScriptRunArgs, ScriptStage};
use crate::runner::RunnerName;

/// What a launch ends with when it is not a status: a fixed text, never an error message.
type Failure = String;

/// `launchEventCallback`: one Play. `Err` is a fixed `launch:<reason>` text: `no-hooks` and `facts:<word>` (the
/// managers could not be asked), `unported:<branch>` (see the module comment), `shutdown`, `panic`, and, for a
/// Play that joined a launch which failed, the leader's own text.
pub async fn run_launch(
    ctx: &LaunchCtx,
    params: LaunchParams,
    host: &FunnelHost,
) -> Result<LaunchStatus, Failure> {
    let runner = params.runner;
    // Decided before the first await (WR-03): `enter` is synchronous and holds its lock for no longer.
    match ctx.flights.enter(runner.as_str(), &params.app_name) {
        Enter::Join(join) => {
            ctx.log_sink.general(
                Prefix::Backend,
                Level::Info,
                &format!(
                    "Launch of {} ({}) already in progress; joining it (WR-03)",
                    params.app_name,
                    runner.as_str()
                ),
            );
            match join.wait(&ctx.engine.shutdown).await {
                Ok(value) => from_flight(&value),
                Err(word) => Err(format!("launch:{word}")),
            }
        }
        Enter::Lead(guard) => {
            let task_ctx = ctx.clone();
            let host = host.clone();
            // The launch is its own task: a caller that drops its future leaves it running, and the guard it
            // owns gives the key back (and tells the joiners) however the task ends, a panic included.
            let task = tokio::spawn(async move {
                let _registrant = task_ctx.engine.shutdown.register("launch-funnel");
                let token = task_ctx.engine.shutdown.token();
                let result = tokio::select! {
                    biased;
                    _ = token.cancelled() => Err("launch:shutdown".to_string()),
                    done = lead(&task_ctx, params, &host) => done,
                };
                guard.settle(to_flight(&result));
                result
            });
            match task.await {
                Ok(result) => result,
                Err(_) => Err("launch:panic".to_string()),
            }
        }
    }
}

/// What the leader publishes for its joiners: its status, or its failure text.
fn to_flight(result: &Result<LaunchStatus, Failure>) -> Value {
    match result {
        Ok(status) => status.to_value(),
        Err(text) => json!({ "error": text }),
    }
}

fn from_flight(value: &Value) -> Result<LaunchStatus, Failure> {
    if let Some(Value::String(text)) = value.get("error") {
        return Err(text.clone());
    }
    serde_json::from_value::<LaunchStatus>(value.get("status").cloned().unwrap_or(Value::Null))
        .map_err(|_| "launch:bad-flight-result".to_string())
}

/// `gameStatusUpdate` to the renderer (`sendGameStatusUpdate`'s frontend half; the backend-bus emit is the
/// `events-bus-emit` delta, which nothing listens to).
fn send_status(ctx: &LaunchCtx, app_name: &str, runner: RunnerName, status: &str) {
    ctx.engine.emitter.emit(
        "gameStatusUpdate",
        vec![json!({ "appName": app_name, "runner": runner.as_str(), "status": status })],
    );
}

/// JavaScript truthiness of a JSON value, for the settings the TS tested with `if (x)`.
fn truthy(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|f| f != 0.0 && !f.is_nan()),
        Some(Value::String(s)) => !s.is_empty(),
        Some(_) => true,
    }
}

fn steps_of(ctx: &LaunchCtx) -> &dyn FunnelSteps {
    static PRODUCTION: CtxFunnelSteps = CtxFunnelSteps;
    ctx.steps.as_deref().unwrap_or(&PRODUCTION)
}

/// Gives the display-sleep blocker back, once (`releaseDisplaySleepBlock`): every end of a launch that began after
/// the blocker started goes through here.
fn release_display_sleep(ctx: &LaunchCtx) {
    let Some(id) = ctx.power.take() else {
        return;
    };
    ctx.log_sink.general(
        Prefix::Backend,
        Level::Info,
        "Stopping Display Power Saver Blocker",
    );
    if let Some(shell) = &ctx.shell {
        shell.wake_lock_stop(id);
    }
}

/// `releaseEngine`: a release that fails (the app is quitting) must not replace the launch's own result or error.
fn release_engine(ctx: &LaunchCtx, steps: &dyn FunnelSteps, key: Option<&str>) {
    let Some(key) = key else {
        return;
    };
    if let Err(word) = steps.end_engine(ctx, key) {
        ctx.log_sink.general(
            Prefix::Backend,
            Level::Warning,
            &format!("Engine: {key} could not release its launch: {word}"),
        );
    }
}

/// `gameInfo.install.install_path`, when it is a non-empty string (the TS tested it for truthiness).
fn install_path_of(game_info: &Value) -> Option<&str> {
    game_info
        .pointer("/install/install_path")
        .and_then(Value::as_str)
        .filter(|path| !path.is_empty())
}

/// The engine step's answer narrowed as `parseLaunchEngineStep` does: a non-skip answer without an engine key, and
/// a `use` without an overlay, are answers the crate never produces and fail the launch rather than guess.
enum EngineStep {
    Skip,
    Legacy(String),
    Refused(String),
    Use { key: String, launch_settings: Value },
}

fn narrow_engine_step(reply: &SelectReply) -> Result<EngineStep, &'static str> {
    if reply.kind == SelectKind::Skip {
        return Ok(EngineStep::Skip);
    }
    let key = reply.key.clone().ok_or("no-engine-key")?;
    match reply.kind {
        SelectKind::Skip => Ok(EngineStep::Skip),
        SelectKind::Legacy => Ok(EngineStep::Legacy(key)),
        SelectKind::Refused => Ok(EngineStep::Refused(key)),
        SelectKind::Use => match &reply.launch_settings {
            Some(settings) if settings.is_object() => Ok(EngineStep::Use {
                key,
                launch_settings: settings.clone(),
            }),
            _ => Err("unexpected-answer"),
        },
    }
}

/// The arguments of a game's launch script of `stage`, or `None` for a game with no script of that stage. Pure:
/// it writes nothing, so the launch record can carry the after-script's arguments before the game runs.
fn launch_script_args(
    stage: ScriptStage,
    runner: RunnerName,
    app_name: &str,
    title: &str,
    game_info: &Value,
    settings: &Value,
) -> Option<ScriptRunArgs> {
    let key = match stage {
        ScriptStage::Before => "beforeLaunchScriptPath",
        ScriptStage::After => "afterLaunchScriptPath",
    };
    let script_path = settings
        .get(key)
        .and_then(Value::as_str)
        .filter(|path| !path.is_empty())?;
    let verbose = truthy(settings.get("verboseLogs"));
    let text = |pointer: &str| -> Option<String> {
        game_info
            .pointer(pointer)
            .and_then(Value::as_str)
            .map(str::to_string)
    };
    Some(ScriptRunArgs {
        script_path: script_path.to_string(),
        stage,
        app_name: text("/app_name").unwrap_or_else(|| app_name.to_string()),
        executable: text("/install/executable"),
        prefix: settings
            .get("winePrefix")
            .and_then(Value::as_str)
            .map(str::to_string),
        runner: text("/runner").unwrap_or_else(|| runner.as_str().to_string()),
        title: text("/title").unwrap_or_else(|| title.to_string()),
        install_path: text("/install/install_path"),
        // The TS passed `JSON.stringify` of both, verbatim; the script's environment holds this text.
        settings_json: settings.to_string(),
        info_json: game_info.to_string(),
        verbose,
        // Filled from the game's log writer by the caller, at the moment the TS read it.
        log_target: None,
    })
}

/// `runBeforeLaunchScript` / `runAfterLaunchScript`: a game with no script of this stage is a no-op; otherwise the
/// `Running script ...` line goes to the game's log and the script runs through the step. `Err` is a script that
/// could not be started (the TS rejected the launch with it).
#[allow(clippy::too_many_arguments)]
async fn run_launch_script(
    ctx: &LaunchCtx,
    steps: &dyn FunnelSteps,
    host: &FunnelHost,
    log: &mut LaunchLog,
    stage: ScriptStage,
    runner: RunnerName,
    app_name: &str,
    title: &str,
    game_info: &Value,
    settings: &Value,
) -> Result<(), ()> {
    let Some(mut args) = launch_script_args(stage, runner, app_name, title, game_info, settings)
    else {
        return Ok(());
    };
    log.write_raw(
        &format!(
            "Running script {} {title} ({})\n",
            stage.as_str(),
            args.script_path
        ),
        false,
    );
    // After the line above: writing it may have claimed the rotation the hand-off carries.
    args.log_target = args.verbose.then(|| log.hand_off().to_runner_hand_off());
    steps
        .run_script(ctx, args, &host.runner)
        .await
        .map(|_| ())
        .map_err(|_| ())
}

/// A hook the TS wrote with `?.` (a store may not define it) or whose rejection the TS let escape the launch:
/// `unavailable` is a store that defines none, any other word a TS call that threw.
fn escaped(result: Result<(), HookError>, what: &str) -> Result<(), Failure> {
    match result {
        Err(HookError(word)) if word != "unavailable" => Err(format!("launch:{what}:{word}")),
        _ => Ok(()),
    }
}

/// The part of `runLaunchEventCallback` after the single flight.
#[allow(clippy::too_many_lines)]
async fn lead(
    ctx: &LaunchCtx,
    params: LaunchParams,
    host: &FunnelHost,
) -> Result<LaunchStatus, Failure> {
    let runner = params.runner;
    let app_name = params.app_name.clone();
    let steps = steps_of(ctx);

    let hooks: &dyn ManagerHooks = ctx
        .hooks
        .as_deref()
        .ok_or_else(|| "launch:no-hooks".to_string())?;
    let facts = hooks
        .launch_facts(runner, &app_name)
        .await
        .map_err(|e| format!("launch:facts:{}", e.0))?;
    let game_info = facts.game_info.clone();

    // The install folder is gone: ask whether to forget the game, and abort (the answer only matters to the
    // question's own hook).
    if install_path_of(&game_info).is_some_and(|path| !Path::new(path).exists()) {
        let _ = steps.ask_force_uninstall(ctx, runner, &app_name).await;
        send_status(ctx, &app_name, runner, "done");
        return Ok(LaunchStatus::Abort);
    }

    let title = game_info
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or(&app_name)
        .to_string();
    // The settings as stored; the engine overlay replaces them below, but these three are read once, up front.
    let mut settings = facts.settings.clone();
    let auto_sync_saves = truthy(settings.get("autoSyncSaves"));
    let saves_path = settings.get("savesPath").cloned().unwrap_or(Value::Null);
    let gog_saves = settings
        .get("gogSaves")
        .cloned()
        .unwrap_or_else(|| json!([]));
    let launch_arguments = params.launch_arguments.clone().or_else(|| {
        settings
            .get("lastUsedLaunchOption")
            .filter(|option| truthy(Some(option)))
            .cloned()
    });

    // `startPlayingDate`, taken before any pre-launch work: the session includes it (D-20 candidate).
    let start_ms = ctx.engine.clock.now_ms();
    let play_times = PlayTimes::open(ctx);
    play_times.first_played_if_new(ctx, &app_name, start_ms);

    ctx.log_sink.general(
        Prefix::Backend,
        Level::Info,
        &format!("Launching {title} ({app_name})"),
    );

    if auto_sync_saves && ctx.engine.is_online() {
        send_status(ctx, &app_name, runner, "syncing-saves");
        ctx.log_sink.general(
            Prefix::Backend,
            Level::Info,
            &format!("Downloading saves for {title}"),
        );
        let synced = hooks
            .sync_saves(
                runner,
                &app_name,
                SyncSavesArgs {
                    direction: SyncDirection::SkipUpload,
                    saves_path: saves_path.clone(),
                    gog_saves: gog_saves.clone(),
                },
            )
            .await;
        saves_line(ctx, synced, &format!("Saves for {title} downloaded"));
    }

    send_status(ctx, &app_name, runner, "launching");

    // "Hide GameLib for every launch" (quick 261108-kpc). macOS restores from the Dock, so it needs no tray
    // icon; elsewhere the tray is the way back.
    let is_mac = ctx.engine.platform == Platform::Mac;
    if facts.global.minimize_on_launch && (is_mac || !facts.global.no_tray_icon) {
        if let Some(shell) = &ctx.shell {
            shell.hide_main_window();
        }
    }

    // Prevent the display from sleeping, once per context.
    if !ctx.power.is_held() {
        ctx.log_sink.general(
            Prefix::Backend,
            Level::Info,
            "Preventing display from sleep",
        );
        if let Some(shell) = &ctx.shell {
            ctx.power
                .set(shell.wake_lock_start("prevent-display-sleep"));
        }
    }

    let mut log = LaunchLog::open(
        Arc::clone(&ctx.log_sink),
        &app_name,
        runner,
        facts.global.disable_logs,
        facts.verbose_logs,
    );
    if !truthy(settings.get("verboseLogs")) {
        log.write_line(
            Level::Warning,
            Prefix::General,
            "IMPORTANT: Logs are disabled",
            true,
        );
        log.write_line(
            Level::Warning,
            Prefix::General,
            "Turn on Verbose logs in the game's settings (Advanced tab) before reporting an issue.",
            true,
        );
    }

    // The engine step (87-52, D-01): in process now. The request carries the settings as stored.
    let select = SelectArgs {
        runner: runner.as_str().to_string(),
        app_name: app_name.clone(),
        title: title.clone(),
        install_path: install_path_of(&game_info).map(str::to_string),
        platform: game_info
            .pointer("/install/platform")
            .and_then(Value::as_str)
            .map(str::to_string),
        is_native: facts.is_native,
        settings: settings.clone(),
        offline: !ctx.engine.is_online(),
        purpose: Purpose::Launch,
    };
    let step = match steps.select_engine(ctx, &select).await {
        Ok(reply) => narrow_engine_step(&reply).map(|step| (step, reply)),
        Err(word) => Err(word),
    };
    let (step, reply) = match step {
        Ok(answer) => answer,
        Err(word) => {
            // A launch whose engine step failed ends here: its status and its blocker end with it (87-73, RF2).
            release_display_sleep(ctx);
            send_status(ctx, &app_name, runner, "done");
            log.close();
            return Err(format!("launch:engine-step:{word}"));
        }
    };
    let engine_key = match &step {
        EngineStep::Skip => None,
        EngineStep::Legacy(key) | EngineStep::Refused(key) | EngineStep::Use { key, .. } => {
            Some(key.as_str())
        }
    };
    if let Some(key) = engine_key {
        for line in &reply.log_lines {
            ctx.log_sink.general(
                Prefix::Backend,
                Level::Info,
                &format!("Engine: {key} {line}"),
            );
            log.write_line(Level::Info, Prefix::General, line, false);
        }
    }
    if matches!(step, EngineStep::Refused(_)) {
        release_display_sleep(ctx);
        send_status(ctx, &app_name, runner, "done");
        log.close();
        return Ok(LaunchStatus::Abort);
    }
    // Only a `use` is released after the launch; the key outlives the match.
    let release_key: Option<String> = match &step {
        EngineStep::Use { key, .. } => Some(key.clone()),
        _ => None,
    };
    let engine_controlled = release_key.is_some();
    if let EngineStep::Use {
        launch_settings, ..
    } = step
    {
        // Everything that follows sees the overlay, never the stored settings.
        settings = launch_settings;
    }

    // Check that Wine is valid when the game is not native. An engine-controlled launch skips this: the engine
    // step already validated its Wine, and the check's self-heal would persist a derived or fallback engine into
    // `wineVersion` (D-08). A check that fails to answer escapes the launch with nothing released, as in the TS.
    if !facts.is_native && !engine_controlled {
        let runner_arg = Runner::parse(runner.as_str()).map(RunnerArg);
        let args = CheckWineArgs {
            app_name: app_name.clone(),
            runner: runner_arg.ok_or_else(|| "launch:wine-check:runner".to_string())?,
            wine_version: settings.get("wineVersion").cloned().unwrap_or(Value::Null),
            verbose_logs: truthy(settings.get("verboseLogs")),
            disable_logs: facts.global.disable_logs,
        };
        let check = steps
            .check_wine(ctx, args, &host.wine)
            .await
            .map_err(|word| format!("launch:wine-check:{word}"))?;
        for entry in &check.log {
            log.write_entry(entry.level, &entry.parts);
        }
        let wine = check
            .wine_version
            .as_ref()
            .and_then(|wine| serde_json::to_value(wine).ok());
        let global = check
            .global_wine_version
            .as_ref()
            .and_then(|wine| serde_json::to_value(wine).ok());
        if global.is_some() || wine.is_some() {
            // The global write came first in the TS: the default wine was set when it was downloaded.
            let write = WineSettingsWrite {
                global,
                game: wine.clone().filter(|_| check.persist_game_wine),
            };
            hooks
                .wine_settings_write(&app_name, write)
                .await
                .map_err(|e| format!("launch:wine-settings-write:{}", e.0))?;
        }
        if let (Some(wine), Some(object)) = (wine, settings.as_object_mut()) {
            // The in-place change of `gameSettings.wineVersion` (a recorded quirk), for everything after.
            object.insert("wineVersion".to_string(), wine);
        }
        if !check.ok {
            let name = settings
                .pointer("/wineVersion/name")
                .map_or_else(|| "undefined".to_string(), super::log::stringify_log_value);
            ctx.log_sink.general(
                Prefix::Backend,
                Level::Error,
                &format!("Was not possible to launch using {name}"),
            );
            release_display_sleep(ctx);
            send_status(ctx, &app_name, runner, "done");
            log.close();
            return Ok(LaunchStatus::Error);
        }

        // A Steam bottle game's own store never reads the game config the self-heal wrote to, so its re-persist is
        // a hook (`persistBottleWineVersion?.()`); a store that defines none answers `unavailable`.
        let persisted = hooks
            .persist_bottle_wine_version(
                runner,
                &app_name,
                settings.get("wineVersion").cloned().unwrap_or(Value::Null),
            )
            .await;
        escaped(persisted, "persist-bottle-wine")?;
    }

    // The before script, the second `launching`, the launch and the presence call. Anything that fails here
    // releases the engine selection ("must not outlive a launch that never got going") and escapes.
    if run_launch_script(
        ctx,
        steps,
        host,
        &mut log,
        ScriptStage::Before,
        runner,
        &app_name,
        &title,
        &game_info,
        &settings,
    )
    .await
    .is_err()
    {
        release_engine(ctx, steps, release_key.as_deref());
        return Err("launch:script:before-failed".to_string());
    }

    send_status(ctx, &app_name, runner, "launching");

    // Quick 261029-mkz: taken right at launch, NOT the start date (which precedes the pre-launch work): the play
    // signal is the time the game ran.
    let launched_at_ms = ctx.engine.clock.now_ms();
    let hand_off = LaunchHookArgs {
        launch_arguments,
        args: params.args.clone(),
        skip_version_check: params.skip_version_check,
        log: log.hand_off(),
    };
    // The session the game's spawn finds its record's facts in (88.3-07, D-08): it carries the after-script this
    // launch owes, and what the quit-kill does when it ends the game (D-31). Dropped when this launch ends.
    let session = begin_session(
        ctx,
        runner,
        &app_name,
        start_ms,
        launched_at_ms,
        launch_script_args(
            ScriptStage::After,
            runner,
            &app_name,
            &title,
            &game_info,
            &settings,
        ),
    );
    // The launch is called first and the presence call second, as the TS did; the game's promise is awaited later.
    let launch_call = hooks.launch(runner, &app_name, hand_off);
    let presence_call = hooks.set_presence(runner, &app_name);
    let (launch_answer, presence) = tokio::join!(launch_call, presence_call);
    if let Err(HookError(word)) = presence {
        if word != "unavailable" {
            // The TS rejected the launch (leaving the game running un-awaited); the game here has already ended,
            // so only the line is kept (judgement call, see the SUMMARY).
            ctx.log_sink.general(
                Prefix::Backend,
                Level::Warning,
                &format!("Setting presence failed ({word})"),
            );
        }
    }
    // Pitfall 1: the sidecar went away while the game ran. The game is Rust's (registered, tailed, waited on), so
    // it is not a failed launch: the funnel waits for it, then finishes without the hooks that need the sidecar.
    let mut sidecar_lost = false;
    let launched = match launch_answer {
        Ok(reply) => {
            log.take_back(reply.rotated);
            reply.launched
        }
        Err(failure) => {
            // The rotation may or may not have been claimed on the other side: treat it as spent, so a log the
            // manager rotated is never rotated twice.
            log.take_back(true);
            ctx.log_sink.general(
                Prefix::Backend,
                Level::Error,
                &format!("The launch hook failed ({})", failure.0),
            );
            let game = session
                .entry()
                .filter(|id| ctx.registry.entry(*id).is_some());
            match (failure.0, game) {
                ("sidecar", Some(game)) => {
                    ctx.log_sink.general(
                        Prefix::Backend,
                        Level::Warning,
                        &format!("Lost the sidecar while {title} ({app_name}) runs; waiting for the game to end"),
                    );
                    wait_for_game_end(ctx, game).await;
                    sidecar_lost = true;
                    true
                }
                _ => false,
            }
        }
    };

    // D-31: the quit's kill ended this game. Its play time was recorded at the kill and its record says so; the
    // after script is owed to the next start, and nothing unbounded (a script, a network call) runs inside the
    // exit budget. The rest of the tail is what is bounded and local.
    if session.quit_killed() {
        ctx.log_sink.general(
            Prefix::Backend,
            Level::Info,
            &format!("{title} ({app_name}) was ended by the quit; its after script is owed to the next start"),
        );
        log.close();
        release_engine(ctx, steps, release_key.as_deref());
        release_display_sleep(ctx);
        recent_add(ctx, steps, runner, &app_name, &title);
        send_status(ctx, &app_name, runner, "done");
        return Ok(if launched {
            LaunchStatus::Done
        } else {
            LaunchStatus::Error
        });
    }

    // The `finally` of the launch promise: the after script, then the log's end, then the engine release.
    let after = run_launch_script(
        ctx,
        steps,
        host,
        &mut log,
        ScriptStage::After,
        runner,
        &app_name,
        &title,
        &game_info,
        &settings,
    )
    .await;
    // The game and its after script are over: the record has nothing left to prove (88.3-07).
    session.finish();
    if after.is_ok() {
        log.close();
    }
    release_engine(ctx, steps, release_key.as_deref());
    if after.is_err() {
        return Err("launch:script:after-failed".to_string());
    }

    // `await command` resolved when the game process exited, so its duration is a play signal. Steam is skipped:
    // its launch promise tracks a steam:// hand-off, not the game.
    if runner != RunnerName::Steam && launched {
        let elapsed = ctx.engine.clock.now_ms().saturating_sub(launched_at_ms);
        record_play_session(
            ctx,
            &app_name,
            runner,
            i64::try_from(elapsed).unwrap_or(i64::MAX),
            ctx.engine.platform,
        );
    }

    if !sidecar_lost {
        escaped(hooks.clear_presence(runner).await, "clear-presence")?;
    }
    // Stop the display sleep blocker.
    release_display_sleep(ctx);

    // Update playtime and last played date.
    let finished_ms = ctx.engine.clock.now_ms();
    play_times.record_session_end(ctx, &app_name, start_ms, finished_ms);

    if runner == RunnerName::Gog && !sidecar_lost {
        if facts.global.disable_playtime_sync {
            ctx.log_sink.general(
                Prefix::Backend,
                Level::Warning,
                "Posting playtime session to server skipped - playtime sync disabled",
            );
        } else {
            // A rejected post rejects the whole launch in the TS: the rest of the tail is skipped (D-20).
            hooks
                .update_gog_playtime(&app_name, &iso_string(start_ms), &iso_string(finished_ms))
                .await
                .map_err(|e| format!("launch:gog-playtime:{}", e.0))?;
        }
    }

    recent_add(ctx, steps, runner, &app_name, &title);

    if auto_sync_saves && ctx.engine.is_online() && !sidecar_lost {
        send_status(ctx, &app_name, runner, "done");
        send_status(ctx, &app_name, runner, "syncing-saves");
        ctx.log_sink.general(
            Prefix::Backend,
            Level::Info,
            &format!("Uploading saves for {title}"),
        );
        let synced = hooks
            .sync_saves(
                runner,
                &app_name,
                SyncSavesArgs {
                    direction: SyncDirection::SkipDownload,
                    saves_path,
                    gog_saves,
                },
            )
            .await;
        saves_line(ctx, synced, &format!("Saves uploaded for {title}"));
    }

    send_status(ctx, &app_name, runner, "done");

    // Exit if we've been launched without UI.
    if facts.cli_no_gui {
        if let Some(shell) = &ctx.shell {
            shell.exit_app();
        }
    }

    Ok(if launched {
        LaunchStatus::Done
    } else {
        LaunchStatus::Error
    })
}

/// `recentGames.add`: the game goes first in the recent list; a failure is a fixed warning.
fn recent_add(
    ctx: &LaunchCtx,
    steps: &dyn FunnelSteps,
    runner: RunnerName,
    app_name: &str,
    title: &str,
) {
    if let Err(reason) = steps.recent_add(
        ctx,
        AddArgs {
            app_name: app_name.to_string(),
            title: title.to_string(),
            runner: runner.as_str().to_string(),
        },
    ) {
        ctx.log_sink.general(
            Prefix::Backend,
            Level::Warning,
            &format!("Recording recent game failed: {reason}"),
        );
    }
}

/// Begins the launch's session (88.3-07): the facts its record carries, and the quit hook that records the play
/// time at the kill and rewrites the record as `quitKilled` (D-31).
pub(crate) fn begin_session(
    ctx: &LaunchCtx,
    runner: RunnerName,
    app_name: &str,
    launch_started_at_ms: u64,
    start_playing_at_ms: u64,
    after_script: Option<ScriptRunArgs>,
) -> SessionGuard {
    let on_quit: QuitHook = {
        let ctx = ctx.clone();
        let app_name = app_name.to_string();
        Arc::new(move |id| {
            let killed_at = ctx.engine.clock.now_ms();
            // The session's own start time, as the tail would have used it (`startPlayingDate`).
            record_session_playtime(
                &ctx,
                runner,
                &app_name,
                launch_started_at_ms,
                start_playing_at_ms,
                killed_at,
            );
            record::mark_quit_killed(&ctx, id, killed_at);
        })
    };
    ctx.sessions.begin(SessionFacts {
        runner,
        app_name: app_name.to_string(),
        launch_started_at_ms,
        start_playing_at_ms,
        after_script,
        record_path: record::record_path(&ctx.engine.paths.app_folder, runner, app_name),
        on_quit: Some(on_quit),
    })
}

/// Waits until the game's run has left the registry (its leader and group are over): the exit watch a lost
/// sidecar hands the game to. The launch task is dropped by the shutdown token, which ends this wait too.
async fn wait_for_game_end(ctx: &LaunchCtx, game: EntryId) {
    while ctx.registry.entry(game).is_some() {
        tokio::time::sleep(GROUP_POLL).await;
    }
}

/// The line after a saves sync: the success text, nothing for a TS call that threw (its handler wrote the error
/// line), and a fixed line for a hook that could not be reached at all.
fn saves_line(ctx: &LaunchCtx, synced: Result<(), HookError>, done: &str) {
    match synced {
        Ok(()) => ctx.log_sink.general(Prefix::Backend, Level::Info, done),
        Err(HookError("failed")) => {}
        Err(HookError(word)) => ctx.log_sink.general(
            Prefix::Backend,
            Level::Error,
            &format!("Saves sync did not run ({word})"),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truthiness_follows_javascript() {
        assert!(!truthy(None));
        assert!(!truthy(Some(&json!(null))));
        assert!(!truthy(Some(&json!(""))));
        assert!(!truthy(Some(&json!(0))));
        assert!(truthy(Some(&json!("x"))));
        assert!(truthy(Some(&json!([]))));
        assert!(truthy(Some(&json!({}))));
    }

    #[test]
    fn the_engine_answer_is_narrowed_like_the_ts_parse() {
        let reply = |kind: SelectKind, key: Option<&str>, settings: Option<Value>| SelectReply {
            kind,
            key: key.map(str::to_string),
            selection: None,
            prefix: None,
            log_lines: Vec::new(),
            launch_settings: settings,
        };
        assert!(matches!(
            narrow_engine_step(&reply(SelectKind::Skip, None, None)),
            Ok(EngineStep::Skip)
        ));
        assert_eq!(
            narrow_engine_step(&reply(SelectKind::Legacy, None, None)).err(),
            Some("no-engine-key")
        );
        assert_eq!(
            narrow_engine_step(&reply(SelectKind::Use, Some("k"), None)).err(),
            Some("unexpected-answer")
        );
        assert!(matches!(
            narrow_engine_step(&reply(SelectKind::Use, Some("k"), Some(json!({})))),
            Ok(EngineStep::Use { .. })
        ));
    }
}
