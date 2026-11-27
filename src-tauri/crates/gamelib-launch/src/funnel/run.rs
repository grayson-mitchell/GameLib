//! `run_launch` (88.3-04, D-01): `launchEventCallback` and `runLaunchEventCallback` of `launcher.ts`, ported.
//!
//! One Play of one game. The funnel enters the single-flight table first (a second Play of the same game joins
//! the first and gets its result, WR-03), then, as the leader, runs in a task of its own so that a caller who
//! goes away neither stops the launch nor strands the Plays that joined it. The task holds a
//! `Shutdown` registrant for as long as the launch is in flight and ends with `launch:shutdown` when the app
//! begins to exit.
//!
//! **This skeleton ports the tracer's path** (`funnel--native-legendary-plain` of `golden/funnel`): a native
//! game, no scripts, saves off, the engine layer skipping, the launch hook answering. The order of what it does
//! is the TS order, including the second `launching` status after the engine step. The branches 88.3-05 adds
//! (a missing install folder, cloud saves, scripts, the Wine check, every engine-step answer but a skip, GOG
//! playtime, the macOS runs-for-me record) are named in [`unported`], and a launch that needs one ends with the
//! fixed `launch:unported:<branch>` before it has done anything, so nothing is half done. Nothing calls
//! `run_launch` until 88.3-06 adds the op.
//!
//! Every line the funnel writes to `gamelib.log` is the TS's fixed text, with the app name and title the TS line
//! already carried. A hook failure is a category word (T-88.3-09), never an error text.

use std::path::Path;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use gamelib_engine::ctx::Platform;
use gamelib_engine::launch::step::{Purpose, SelectArgs, SelectKind};
use gamelib_info::recent::AddArgs;
use gamelib_log::{Level, Prefix};
use gamelib_store::host::Store;
use gamelib_store::json::Json;
use gamelib_store::table::row_for_key;
use serde_json::{json, Value};

use super::flights::Enter;
use super::log::LaunchLog;
use super::steps::{CtxFunnelSteps, FunnelSteps};
use super::{FunnelHost, LaunchParams, LaunchStatus};
use crate::ctx::LaunchCtx;
use crate::hooks::{LaunchFacts, LaunchHookArgs};
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

/// `Date.prototype.toISOString` for a millisecond instant (UTC, four-digit years).
fn iso_string(ms: u64) -> String {
    let days = (ms / 86_400_000) as i64;
    let in_day = ms % 86_400_000;
    // Howard Hinnant's civil_from_days over days since 1970-01-01.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        in_day / 3_600_000,
        in_day / 60_000 % 60,
        in_day / 1000 % 60,
        in_day % 1000
    )
}

/// The branches 88.3-05 ports. A launch that needs one answers its name instead of doing it half.
fn unported(ctx: &LaunchCtx, facts: &LaunchFacts, runner: RunnerName) -> Option<&'static str> {
    let install_path = facts
        .game_info
        .pointer("/install/install_path")
        .and_then(Value::as_str)
        .filter(|path| !path.is_empty());
    if install_path.is_some_and(|path| !Path::new(path).exists()) {
        return Some("folder-missing");
    }
    if runner == RunnerName::Gog {
        return Some("gog");
    }
    if !facts.is_native {
        return Some("wine-check");
    }
    if truthy(facts.settings.get("autoSyncSaves")) {
        return Some("cloud-saves");
    }
    if truthy(facts.settings.get("beforeLaunchScriptPath"))
        || truthy(facts.settings.get("afterLaunchScriptPath"))
    {
        return Some("launch-scripts");
    }
    if ctx.engine.platform == Platform::Mac && runner != RunnerName::Steam {
        return Some("runs-for-me");
    }
    None
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

/// The `store/timestamp` store (`tsStore`), or `None` when it cannot be opened: play time is then not recorded.
fn open_timestamps(ctx: &LaunchCtx) -> Option<Arc<Store>> {
    let row = row_for_key("store/timestamp")?;
    let path = ctx
        .engine
        .paths
        .user_data
        .join("store")
        .join("timestamp.json");
    ctx.engine.host.open_row(row, path).ok()
}

/// `tsStore.set(key, value)`. A store that refuses the write is a fixed warning, not a failed launch.
fn timestamp_set(ctx: &LaunchCtx, store: Option<&Arc<Store>>, key: &str, value: Value) {
    let Some(store) = store else {
        return;
    };
    if store.set(key, Json::from(value)).is_err() {
        ctx.log_sink.general(
            Prefix::Backend,
            Level::Warning,
            "Recording play time failed",
        );
    }
}

/// The part of `runLaunchEventCallback` after the single flight, for the tracer's path.
async fn lead(
    ctx: &LaunchCtx,
    params: LaunchParams,
    _host: &FunnelHost,
) -> Result<LaunchStatus, Failure> {
    let runner = params.runner;
    let app_name = params.app_name.clone();
    let steps = steps_of(ctx);

    let hooks = ctx
        .hooks
        .as_ref()
        .ok_or_else(|| "launch:no-hooks".to_string())?;
    let facts = hooks
        .launch_facts(runner, &app_name)
        .await
        .map_err(|e| format!("launch:facts:{}", e.0))?;
    if let Some(branch) = unported(ctx, &facts, runner) {
        return Err(format!("launch:unported:{branch}"));
    }

    let title = facts
        .game_info
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or(&app_name)
        .to_string();
    let settings = facts.settings.clone();
    let launch_arguments = params.launch_arguments.clone().or_else(|| {
        settings
            .get("lastUsedLaunchOption")
            .filter(|option| truthy(Some(option)))
            .cloned()
    });

    // `startPlayingDate`, taken before any pre-launch work: the session includes it (D-20 candidate).
    let start_ms = ctx.engine.clock.now_ms();
    let timestamps = open_timestamps(ctx);
    if let Some(store) = &timestamps {
        if store.get(&app_name).is_none() {
            timestamp_set(
                ctx,
                Some(store),
                &format!("{app_name}.firstPlayed"),
                json!(iso_string(start_ms)),
            );
        }
    }

    ctx.log_sink.general(
        Prefix::Backend,
        Level::Info,
        &format!("Launching {title} ({app_name})"),
    );

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

    // The engine step (87-52, D-01): in process now. Only a skip is ported here.
    let select = SelectArgs {
        runner: runner.as_str().to_string(),
        app_name: app_name.clone(),
        title: title.clone(),
        install_path: facts
            .game_info
            .pointer("/install/install_path")
            .and_then(Value::as_str)
            .map(str::to_string),
        platform: facts
            .game_info
            .pointer("/install/platform")
            .and_then(Value::as_str)
            .map(str::to_string),
        is_native: facts.is_native,
        settings: settings.clone(),
        offline: !ctx.engine.online.load(Ordering::SeqCst),
        purpose: Purpose::Launch,
    };
    let reply = steps.select_engine(ctx, &select).await;
    if reply.kind != SelectKind::Skip {
        if let Some(key) = &reply.key {
            steps.end_engine(ctx, key);
        }
        release_display_sleep(ctx);
        send_status(ctx, &app_name, runner, "done");
        log.close();
        return Err("launch:unported:engine-step".to_string());
    }

    send_status(ctx, &app_name, runner, "launching");

    let hand_off = LaunchHookArgs {
        launch_arguments,
        args: params.args.clone(),
        skip_version_check: params.skip_version_check,
        log: log.hand_off(),
    };
    let launched = match hooks.launch(runner, &app_name, hand_off).await {
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
            false
        }
    };
    log.close();

    release_display_sleep(ctx);

    // Playtime and last played date, in whole minutes.
    let finished_ms = ctx.engine.clock.now_ms();
    timestamp_set(
        ctx,
        timestamps.as_ref(),
        &format!("{app_name}.lastPlayed"),
        json!(iso_string(finished_ms)),
    );
    let stored_total = timestamps
        .as_ref()
        .and_then(|store| store.get(&format!("{app_name}.totalPlayed")))
        .and_then(|value| value.to_value().as_f64())
        .unwrap_or(0.0);
    let session_minutes = (finished_ms.saturating_sub(start_ms)) as f64 / 1000.0 / 60.0;
    let total = (session_minutes + stored_total).floor();
    timestamp_set(
        ctx,
        timestamps.as_ref(),
        &format!("{app_name}.totalPlayed"),
        json!(total as i64),
    );

    if let Err(reason) = steps.recent_add(
        ctx,
        AddArgs {
            app_name: app_name.clone(),
            title: title.clone(),
            runner: runner.as_str().to_string(),
        },
    ) {
        ctx.log_sink.general(
            Prefix::Backend,
            Level::Warning,
            &format!("Recording recent game failed: {reason}"),
        );
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_iso_string_is_to_iso_string() {
        assert_eq!(iso_string(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso_string(1_767_225_600_000), "2026-01-01T00:00:00.000Z");
        assert_eq!(iso_string(1_767_225_690_123), "2026-01-01T00:01:30.123Z");
        // A leap day and the last millisecond of a year.
        assert_eq!(iso_string(1_709_164_800_000), "2024-02-29T00:00:00.000Z");
        assert_eq!(iso_string(1_798_761_599_999), "2026-12-31T23:59:59.999Z");
    }

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
}
