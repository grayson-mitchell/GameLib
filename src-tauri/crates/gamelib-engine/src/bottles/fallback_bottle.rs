//! Creating a bottle with a non-CrossOver engine (Phase 87, SVC-02, D-17, ported from
//! `bottlePrimitives.ts`'s `createFallbackBottle`, replayed against the 87-11 goldens in
//! `golden/bottles`): the bridge bottle of the built-in (pinned) engine, in CrossOver's own Bottles
//! directory, so the Windows profile is `C:\users\crossover` from the start.
//!
//! - **Spawns (D-17):** `<wine> wineboot -i` (capped at [`WINEBOOT_CAP_MS`]) and `<wineserver> -w`
//!   (capped at [`WINESERVER_WAIT_CAP_MS`]) go through `ctx.proc` (the one `SpecRunner` seam), each
//!   with the caller's cancel token. The wineserver stops that end every path (and the cleanup of a
//!   failure) are the lifecycle's [`kill_bottle_wineserver`], capped by [`KILL_TIMEOUT_MS`] and with no
//!   token, so a cancelled creation still stops the server it started.
//! - **Order (D-03):** DXVK is installed through `ctx.dxvk`, and `cxbottle.conf` is written LAST, so
//!   the bottle only counts as provisioned once everything above succeeded.
//! - **Cleanup:** on a failure or a cancel the wineserver is stopped and the bottle directory this
//!   call created is removed through [`remove_created_bottle_dir`]'s guard; a directory that existed at
//!   entry is never removed.
//!
//! The wineboot and wait spawns inherit the real environment (HOME and the rest) because the engine
//! runs against the user's own bottle with an explicit `WINEPREFIX`; the variables set are the ones the
//! TS set (the declared real-profile arm of the two-profile rule), and no home or config variable is
//! assigned here.

use std::panic::AssertUnwindSafe;
use std::path::Path;
use std::time::Duration;

use futures_util::FutureExt;
use gamelib_core::process::ProcSpec;
use serde_json::Value;
use tokio_util::sync::CancellationToken;

use super::conf::{random_bottle_id, write_cxbottle_conf};
use super::lifecycle::{
    kill_bottle_wineserver, remove_created_bottle_dir, CreateBottleResult, KILL_TIMEOUT_MS,
    PROVISION_ABORTED,
};
use super::paths::{bottle_dir, is_clean_bottle_name};
use crate::ctx::EngineCtx;
use crate::dxvk::{DxvkAction, DxvkRequest, DxvkSource, DxvkTool};
use crate::engines::NonCrossoverEngine;
use crate::jsutil::path_join;
use crate::tool_settings::build_fallback_game_settings;

/// The cap on `wineboot -i` (180 s).
pub const WINEBOOT_CAP_MS: u64 = 180_000;
/// The cap on `wineserver -w` (60 s).
pub const WINESERVER_WAIT_CAP_MS: u64 = 60_000;

const DXVK_VERSION_FILE: &str = "current_dxvk-macOS";

fn info(ctx: &EngineCtx, line: &str) {
    if let Some(log) = ctx.log.as_deref() {
        log.info(line);
    }
}

fn error(ctx: &EngineCtx, line: &str) {
    if let Some(log) = ctx.log.as_deref() {
        log.error(line);
    }
}

/// The environment of the wineboot and wait spawns: the TS set exactly these five. Only Gecko stays
/// off (`mshtml=`); `mscoree` stays enabled so wineboot registers the engine's bundled Wine Mono
/// (offline), without which DXSETUP's Managed DirectX step fails with exit 247 (59-32 H1).
fn creation_env(dir: &str) -> Vec<(String, String)> {
    [
        ("WINEPREFIX", dir),
        ("USER", "crossover"),
        ("WINEDLLOVERRIDES", "mshtml="),
        ("WINEDEBUG", "-all"),
        ("MVK_CONFIG_LOG_LEVEL", "0"),
    ]
    .map(|(k, v)| (k.to_string(), v.to_string()))
    .to_vec()
}

fn is_aborted(cancel: Option<&CancellationToken>) -> bool {
    cancel.is_some_and(CancellationToken::is_cancelled)
}

/// How a creation step ended, short of success.
enum Stop {
    /// A step failed: the text is the error and the log line (`fail`).
    Failed(String),
    /// The cancel token fired (`aborted`).
    Aborted,
}

/// What a panic payload said, as a TS `String(error)` would.
fn panic_text(payload: &(dyn std::any::Any + Send)) -> String {
    payload
        .downcast_ref::<&str>()
        .map(|s| (*s).to_string())
        .or_else(|| payload.downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "installer panicked".to_string())
}

/// `createFallbackBottle` over a random BottleID (the app's).
pub async fn create_fallback_bottle(
    ctx: &EngineCtx,
    bottle_name: &str,
    engine: &NonCrossoverEngine,
    base_settings: &Value,
    cancel: Option<&CancellationToken>,
) -> CreateBottleResult {
    create_fallback_bottle_with(
        ctx,
        bottle_name,
        engine,
        base_settings,
        cancel,
        &random_bottle_id,
    )
    .await
}

/// `createFallbackBottle`: creates the bottle `bottle_name` with `engine`, installing the engine's DXVK
/// and writing `cxbottle.conf` last. `base_settings` are the global game settings the DXVK step's
/// fallback settings are built over; `new_id` supplies the BottleID (a golden injects a fixed one).
/// Never panics on a failing step: every failure is an `error` result (the name was not clean: nothing
/// is spawned, as the TS's kill refused an unsafe name, and the creation is refused outright).
pub async fn create_fallback_bottle_with(
    ctx: &EngineCtx,
    bottle_name: &str,
    engine: &NonCrossoverEngine,
    base_settings: &Value,
    cancel: Option<&CancellationToken>,
    new_id: &(dyn Fn() -> String + Send + Sync),
) -> CreateBottleResult {
    if !is_clean_bottle_name(bottle_name) {
        error(
            ctx,
            &format!("provisionBridgeBottle: rejected unsafe bottle name \"{bottle_name}\""),
        );
        return CreateBottleResult::failed(None, format!("Invalid bottle name: \"{bottle_name}\""));
    }
    let dir = bottle_dir(&ctx.paths.user_home, bottle_name);
    let created_here = !Path::new(&dir).exists();
    let stop = match run_steps(
        ctx,
        bottle_name,
        engine,
        base_settings,
        cancel,
        &dir,
        new_id,
    )
    .await
    {
        Ok(()) => {
            // The last step of every path: a fresh bottle must not leave a wedged wineserver behind.
            stop_wineserver(ctx, bottle_name, engine).await;
            info(
                ctx,
                &format!(
                    "provisionBridgeBottle: bridge bottle \"{bottle_name}\" created by {}",
                    engine.label
                ),
            );
            return CreateBottleResult {
                done: true,
                error: None,
                error_code: None,
                created_here: Some(created_here),
            };
        }
        Err(stop) => stop,
    };
    match stop {
        Stop::Failed(message) => {
            error(ctx, &format!("provisionBridgeBottle: {message}"));
            cleanup(ctx, bottle_name, engine, created_here).await;
            CreateBottleResult::failed(None, message)
        }
        Stop::Aborted => {
            info(
                ctx,
                &format!("provisionBridgeBottle: bottle creation cancelled for \"{bottle_name}\""),
            );
            cleanup(ctx, bottle_name, engine, created_here).await;
            CreateBottleResult::failed(
                Some(PROVISION_ABORTED),
                "bottle creation cancelled".to_string(),
            )
        }
    }
}

/// The steps up to and including the conf write; the first problem is the `Err`.
async fn run_steps(
    ctx: &EngineCtx,
    bottle_name: &str,
    engine: &NonCrossoverEngine,
    base_settings: &Value,
    cancel: Option<&CancellationToken>,
    dir: &str,
    new_id: &(dyn Fn() -> String + Send + Sync),
) -> Result<(), Stop> {
    let threw = |what: String| Stop::Failed(format!("fallback bottle creation threw: {what}"));
    let aborted = |cancelled_by_run: bool| cancelled_by_run || is_aborted(cancel);

    if let Some(parent) = Path::new(dir).parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            return Err(if is_aborted(cancel) {
                Stop::Aborted
            } else {
                threw(format!("Error: {e}"))
            });
        }
    }
    let mut boot = ProcSpec::new("engine-wineboot", engine.wine_bin.clone());
    boot.argv = vec!["wineboot".to_string(), "-i".to_string()];
    boot.env = creation_env(dir);
    boot.timeout = Some(Duration::from_millis(WINEBOOT_CAP_MS));
    boot.cancel = cancel.cloned();
    let out = ctx.proc.run(boot, None).await;
    if aborted(out.cancelled) {
        return Err(Stop::Aborted);
    }
    if out.code.is_none() && !out.timed_out {
        // The program could not be started (or a signal ended it): the TS threw here.
        return Err(threw(out.stderr));
    }
    if out.code != Some(0) {
        return Err(Stop::Failed(format!(
            "wineboot -i failed for bottle \"{bottle_name}\" (code={}): {}",
            out.code.map_or("null".to_string(), |c| c.to_string()),
            out.stderr
        )));
    }

    // system.reg is flushed only once the wineserver exits.
    let mut wait = ProcSpec::new("engine-wineserver-wait", engine.wineserver_bin.clone());
    wait.argv = vec!["-w".to_string()];
    wait.env = creation_env(dir);
    wait.timeout = Some(Duration::from_millis(WINESERVER_WAIT_CAP_MS));
    wait.cancel = cancel.cloned();
    let out = ctx.proc.run(wait, None).await;
    if aborted(out.cancelled) {
        return Err(Stop::Aborted);
    }
    if out.code.is_none() {
        if out.timed_out {
            return Err(Stop::Failed(format!(
                "wineserver -w timed out for bottle \"{bottle_name}\""
            )));
        }
        return Err(threw(out.stderr));
    }

    if let Some(build) = &engine.dxvk {
        let settings = build_fallback_game_settings(ctx, bottle_name, engine, base_settings);
        let request = DxvkRequest {
            settings,
            tool: DxvkTool::Dxvk,
            action: DxvkAction::Backup,
            source: Some(DxvkSource {
                dir: build.dir.clone(),
                version: build.version.clone(),
            }),
        };
        // A TS installer could throw; a Rust one answers a bool, so only a panic reaches here, and it
        // is reported as the TS reported a throw (cleanup runs, the creation fails).
        let installed = match AssertUnwindSafe(async { ctx.dxvk.install_remove(request).await })
            .catch_unwind()
            .await
        {
            Ok(installed) => installed,
            Err(payload) => return Err(threw(panic_text(payload.as_ref()))),
        };
        if is_aborted(cancel) {
            return Err(Stop::Aborted);
        }
        if !installed || !Path::new(&path_join(&[dir, DXVK_VERSION_FILE])).exists() {
            return Err(Stop::Failed(format!(
                "DXVK install failed for bottle \"{bottle_name}\""
            )));
        }
    }

    // D-03: last, so the bottle only counts as ready once everything above succeeded.
    if !write_cxbottle_conf(ctx.log.as_deref(), Path::new(dir), new_id) {
        return Err(Stop::Failed(format!(
            "cxbottle.conf not written for bottle \"{bottle_name}\""
        )));
    }
    Ok(())
}

/// `killBottleWineServerWith(deps, bottle, engine.wineserverBin, { USER: 'crossover' }, 15_000)`.
async fn stop_wineserver(ctx: &EngineCtx, bottle_name: &str, engine: &NonCrossoverEngine) {
    kill_bottle_wineserver(
        ctx,
        bottle_name,
        &engine.wineserver_bin,
        &[("USER".to_string(), "crossover".to_string())],
        Duration::from_millis(KILL_TIMEOUT_MS),
    )
    .await;
}

/// Stops the wineserver and removes the bottle directory when this call created it.
async fn cleanup(
    ctx: &EngineCtx,
    bottle_name: &str,
    engine: &NonCrossoverEngine,
    created_here: bool,
) {
    stop_wineserver(ctx, bottle_name, engine).await;
    if created_here {
        remove_created_bottle_dir(ctx, bottle_name);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_creation_env_is_the_five_variables_the_ts_set() {
        let env = creation_env("/b");
        let names: Vec<&str> = env.iter().map(|(k, _)| k.as_str()).collect();
        assert_eq!(
            names,
            [
                "WINEPREFIX",
                "USER",
                "WINEDLLOVERRIDES",
                "WINEDEBUG",
                "MVK_CONFIG_LOG_LEVEL"
            ]
        );
        assert!(env.contains(&("USER".to_string(), "crossover".to_string())));
        assert!(env.contains(&("WINEDLLOVERRIDES".to_string(), "mshtml=".to_string())));
    }

    #[test]
    fn the_caps_are_the_ts_caps() {
        assert_eq!(WINEBOOT_CAP_MS, 180_000);
        assert_eq!(WINESERVER_WAIT_CAP_MS, 60_000);
    }
}

#[cfg(test)]
mod create_tests {
    use super::*;
    use crate::ctx::{EnginePaths, Platform};
    use crate::testing::ScriptedSpecRunner;
    use gamelib_core::clock::SystemClock;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use std::sync::Arc;

    fn engine() -> NonCrossoverEngine {
        NonCrossoverEngine {
            wine_bin: "/t/wine".to_string(),
            wineserver_bin: "/t/wineserver".to_string(),
            label: "Pinned".to_string(),
            version: "1".to_string(),
            dxvk: None,
        }
    }

    #[tokio::test]
    async fn an_unsafe_name_is_refused_and_nothing_is_spawned() {
        let home = FakeHome::new("engine-fallback-");
        let root = home.root().to_path_buf();
        let runner = Arc::new(ScriptedSpecRunner::new(Vec::new()));
        let ctx = EngineCtx::new(
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
        .with_proc(runner.clone());
        for name in ["../x", "a/b", ""] {
            let out =
                create_fallback_bottle(&ctx, name, &engine(), &serde_json::json!({}), None).await;
            assert!(!out.done, "{name:?}");
            assert_eq!(
                out.error.as_deref(),
                Some(format!("Invalid bottle name: \"{name}\"").as_str())
            );
        }
        assert!(runner.spawns().is_empty());
        // Nothing was made under the profile either.
        assert!(!root.join("home").exists());
    }
}
