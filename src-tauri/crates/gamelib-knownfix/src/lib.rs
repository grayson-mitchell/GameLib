//! The known-fix services (Phase 88, SVC-03): the profile layers, the overlay catalogue and the fix
//! resolution the launch path applies, ported from the TypeScript sidecar (D-03). Each plan adds its
//! modules and ops here.
//!
//! Tauri-free, no environment reads (the relay URL and the app version arrive as values in
//! [`ctx::KnownFixCtx`]), no `keyring`, and a child process only ever through `gamelib-proc`. Every
//! log line goes through `EngineCtx.log` as fixed text, which the engine's redactor then holds to: a
//! line never carries a URL, query, header, token, account name or profile path. Every op goes through
//! [`dispatch`], which answers `unknown op: <op>` for a name not in [`OPS`].
//!
//! This crate may depend on `gamelib-engine` and `gamelib-wine`; neither of them ever depends on it
//! (87 D-04, the one-way rule).

pub mod catalogue;
pub mod ctx;
pub mod jsvalue;
pub mod launch;
pub mod overlay;
pub mod reader;
pub mod registry;
pub mod remote;
pub mod types;

/// The cancel token a long op takes, re-exported so the shell, which owns the renderer's cancel, needs
/// no `tokio-util` of its own.
pub use tokio_util::sync::CancellationToken;

use ctx::KnownFixCtx;
use serde_json::Value;
use std::future::Future;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::pin::Pin;
use std::sync::OnceLock;
use std::task::{Context, Poll};
use tokio::runtime::{Builder, Handle, Runtime};

/// Ops reachable from the shell and the CLI. Keep sorted; each plan adds its own.
pub const OPS: &[&str] = &[
    "knownfix_apply_profile_registry",
    "knownfix_apply_registry",
    "knownfix_fetch_remote",
    "knownfix_launch_overrides",
    "knownfix_overlay_catalogue",
    "knownfix_profile_overlay_env",
    "knownfix_read",
    "knownfix_resolve_overlay_env",
    "knownfix_status",
];

/// Runs `op` over `args`. `Err` is only an unknown op, bad arguments, a shutdown, a wrong thread or a
/// panic (`<op>:panic`).
pub async fn dispatch(op: &str, args: &[Value], ctx: &KnownFixCtx) -> Result<Value, String> {
    let Some(name) = OPS.iter().copied().find(|o| *o == op) else {
        return Err(format!("unknown op: {op}"));
    };
    guarded(name, ctx, route(name, args, ctx)).await
}

/// Each plan adds its arms here, in step with `OPS`.
async fn route(op: &str, args: &[Value], ctx: &KnownFixCtx) -> Result<Value, String> {
    match op {
        // The overlay catalogue the signed app pins (D-03): the shared JSON, parsed once.
        "knownfix_overlay_catalogue" => {
            if !args.is_empty() {
                return Err(format!("{op}:bad-args"));
            }
            let catalogue = catalogue::catalogue().map_err(|e| format!("{op}:{e}"))?;
            serde_json::to_value(catalogue).map_err(|_| format!("{op}:bad-result"))
        }
        // The tier-1 fix for one game (88-08, D-03): local > bundled > remote, allow-listed. `null` when
        // no layer holds a usable file. Arguments `[appName, runner]`.
        "knownfix_read" => {
            let (app_name, runner) = decode_app_runner(op, args)?;
            let found = reader::read_known_fixes(ctx, &app_name, runner);
            serde_json::to_value(found).map_err(|_| format!("{op}:bad-result"))
        }
        // What the game page's GameLib row shows (88-08, D-03): local and bundled layers only, tier 1 then
        // tier 2. `null` when neither holds a fix. Arguments `[appName, runner]`.
        "knownfix_status" => {
            let (app_name, runner) = decode_app_runner(op, args)?;
            let status = reader::read_gamelib_fix_status(ctx, &app_name, runner);
            serde_json::to_value(status).map_err(|_| format!("{op}:bad-result"))
        }
        // What the launch path applies from a game's known fix (88-09, D-03): `launchArgs` as they are and
        // the checked `exeOverride`. The one object argument is `{ appName, runner, installPath }`, with
        // `installPath` null when the install folder is unknown.
        "knownfix_launch_overrides" => {
            let args: LaunchOverridesArgs = decode(op, args)?;
            let runner =
                types::Runner::parse(&args.runner).ok_or_else(|| format!("{op}:bad-args"))?;
            let overrides = launch::read_launch_overrides(
                ctx,
                &args.app_name,
                runner,
                args.install_path.as_deref(),
            );
            serde_json::to_value(overrides).map_err(|_| format!("{op}:bad-result"))
        }
        // The launcher's registry hook (88-09, D-03): the game's tier-2 profile applied to its own prefix,
        // every `reg add` a helper through the wine command core. Answers `null`; a failed `reg add` is a
        // warning in the log, never an error here. Argument `{ appName, runner, gameSettings }`.
        "knownfix_apply_profile_registry" => {
            let args: ApplyProfileRegistryArgs = decode(op, args)?;
            let runner =
                types::Runner::parse(&args.runner).ok_or_else(|| format!("{op}:bad-args"))?;
            if !args.game_settings.is_object()
                || args.app_name.is_empty()
                || args.app_name.encode_utf16().count() > 256
            {
                return Err(format!("{op}:bad-args"));
            }
            registry::apply_known_fix_profile_registry(
                ctx,
                &args.app_name,
                runner,
                &args.game_settings,
            )
            .await
            .map_err(|e| format!("{op}:{e}"))?;
            Ok(Value::Null)
        }
        // The Steam bridge's registry step (88-09, D-03): the Steam tier-2 profile is read here, so the
        // fix data has one owner, and applied into the bottle with `run`, the prefix check skipped. Answers
        // `null`. Argument `{ appId, label, gameSettings, bottleDir }`, `bottleDir` null when unknown.
        "knownfix_apply_registry" => {
            let args: ApplyRegistryArgs = decode(op, args)?;
            if !args.game_settings.is_object()
                || args.app_id.is_empty()
                || args.app_id.encode_utf16().count() > 256
                || args.label.is_empty()
                || args.label.encode_utf16().count() > 256
            {
                return Err(format!("{op}:bad-args"));
            }
            registry::apply_bridge_registry_fixes(
                ctx,
                &args.app_id,
                &args.label,
                &args.game_settings,
                args.bottle_dir.as_deref().map(std::path::Path::new),
            )
            .await
            .map_err(|e| format!("{op}:{e}"))?;
            Ok(Value::Null)
        }
        // The overlay env of a non-Steam launch (88-10, D-03): the game's tier-2 `overlays` resolved against
        // the base values the launcher holds, the overlay installed on demand (up to the 120 s download, so
        // the caller's channel must not time it out). Answers the env map `{ KEY: value }`. Argument
        // `{ appName, runner, gameSettings, tier1Env, processEnvBase }`.
        "knownfix_profile_overlay_env" => {
            let args: ProfileOverlayEnvArgs = decode(op, args)?;
            let runner =
                types::Runner::parse(&args.runner).ok_or_else(|| format!("{op}:bad-args"))?;
            if !args.game_settings.is_object()
                || !bounded_name(&args.app_name)
                || args.tier1_env.len() > MAX_ENV_ENTRIES
                || args.process_env_base.len() > MAX_ENV_ENTRIES
            {
                return Err(format!("{op}:bad-args"));
            }
            let env = overlay::env::profile_overlay_env(
                ctx,
                &args.app_name,
                runner,
                &args.game_settings,
                &args.tier1_env,
                &args.process_env_base,
            )
            .await;
            serde_json::to_value(env).map_err(|_| format!("{op}:bad-result"))
        }
        // The Steam bridge's overlay env (88-10, D-03): the Steam tier-2 profile's `overlays` are read here,
        // so the overlay data has one owner, and resolved against the caller's base values. Answers the env
        // map. Argument `{ appId, label, wineType, baseValues }`; `baseValues` holds the target env vars
        // and `GST_PLUGIN_PATH_1_0`, whatever has a value.
        "knownfix_resolve_overlay_env" => {
            let args: ResolveOverlayEnvArgs = decode(op, args)?;
            if !bounded_name(&args.app_id)
                || !bounded_name(&args.label)
                || args.base_values.len() > MAX_ENV_ENTRIES
            {
                return Err(format!("{op}:bad-args"));
            }
            let overlays = reader::read_known_fix_profile(ctx, &args.app_id, types::Runner::Steam)
                .and_then(|p| p.overlays)
                .map(|v| jsvalue::JsValue::from_value(&v));
            let env = overlay::env::resolve_overlay_env(
                ctx,
                overlays.as_ref(),
                &args.label,
                args.wine_type.as_deref(),
                &args.base_values,
                &overlay::env::CtxInstaller(ctx),
            )
            .await;
            serde_json::to_value(env).map_err(|_| format!("{op}:bad-result"))
        }
        // The install-time download of a game's remote known fixes (88-11, D-03): GameLib's feed, then
        // Heroic's on a 404, written filtered into `<appFolder>/fixes`. Answers `null` whatever happened (an
        // indeterminate answer is a log line). Argument `{ appName, runner }`.
        "knownfix_fetch_remote" => {
            let args: FetchRemoteArgs = decode(op, args)?;
            let runner =
                types::Runner::parse(&args.runner).ok_or_else(|| format!("{op}:bad-args"))?;
            if !bounded_name(&args.app_name) {
                return Err(format!("{op}:bad-args"));
            }
            remote::fetch_remote_known_fixes(ctx, &args.app_name, runner).await;
            Ok(Value::Null)
        }
        _ => Err(format!("unknown op: {op}")),
    }
}

/// The most variables an env argument may carry.
const MAX_ENV_ENTRIES: usize = 256;

/// An app name, app id or label: 1 to 256 UTF-16 units (the bound the other ops hold their names to).
fn bounded_name(name: &str) -> bool {
    !name.is_empty() && name.encode_utf16().count() <= 256
}

/// The object argument of `knownfix_fetch_remote`.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FetchRemoteArgs {
    app_name: String,
    runner: String,
}

/// The object argument of `knownfix_profile_overlay_env`.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProfileOverlayEnvArgs {
    app_name: String,
    runner: String,
    game_settings: Value,
    tier1_env: std::collections::BTreeMap<String, String>,
    process_env_base: std::collections::BTreeMap<String, String>,
}

/// The object argument of `knownfix_resolve_overlay_env`.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ResolveOverlayEnvArgs {
    app_id: String,
    label: String,
    #[serde(default)]
    wine_type: Option<String>,
    base_values: std::collections::BTreeMap<String, String>,
}

/// The object argument of `knownfix_apply_profile_registry`.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ApplyProfileRegistryArgs {
    app_name: String,
    runner: String,
    game_settings: Value,
}

/// The object argument of `knownfix_apply_registry`.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ApplyRegistryArgs {
    app_id: String,
    label: String,
    game_settings: Value,
    #[serde(default)]
    bottle_dir: Option<String>,
}

/// The object argument of `knownfix_launch_overrides`.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LaunchOverridesArgs {
    app_name: String,
    runner: String,
    #[serde(default)]
    install_path: Option<String>,
}

/// The `[appName, runner]` arguments of the reader ops: a string and one of the five runner names. The
/// error is a fixed `<op>:bad-args`; the renderer's value never reaches it.
fn decode_app_runner(op: &str, args: &[Value]) -> Result<(String, types::Runner), String> {
    let [Value::String(app_name), Value::String(runner)] = args else {
        return Err(format!("{op}:bad-args"));
    };
    let runner = types::Runner::parse(runner).ok_or_else(|| format!("{op}:bad-args"))?;
    Ok((app_name.clone(), runner))
}

/// The one object argument of an op, decoded strictly (the arg structs deny unknown fields). The
/// error is a fixed `<op>:bad-args`: a renderer or sidecar string never reaches it.
fn decode<T: serde::de::DeserializeOwned>(op: &str, args: &[Value]) -> Result<T, String> {
    // An object only: serde would also decode a struct from a JSON array of its fields in order.
    let [arg @ Value::Object(_)] = args else {
        return Err(format!("{op}:bad-args"));
    };
    serde_json::from_value(arg.clone()).map_err(|_| format!("{op}:bad-args"))
}

/// The op wrapper: `work` runs holding a `Shutdown` registrant for exactly its lifetime and is
/// raced against the shutdown token, answering `<op>:shutdown` when cancelled and `<op>:panic` when
/// it panics. Once shutdown has begun, `work` is not started at all.
pub async fn guarded<F>(op: &str, ctx: &KnownFixCtx, work: F) -> Result<Value, String>
where
    F: Future<Output = Result<Value, String>>,
{
    let _registrant = ctx.engine.shutdown.register("knownfix");
    let token = ctx.engine.shutdown.token();
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
/// `gamelib-wine`'s: the shell's `rustInvoke` workers may call in concurrently.
fn runtime() -> Result<&'static Runtime, String> {
    static RUNTIME: OnceLock<Result<Runtime, String>> = OnceLock::new();
    RUNTIME
        .get_or_init(|| {
            Builder::new_multi_thread()
                .worker_threads(2)
                .thread_name("knownfix")
                .enable_all()
                .build()
                .map_err(|e| e.to_string())
        })
        .as_ref()
        .map_err(Clone::clone)
}

/// [`dispatch`] for a plain thread: blocks on the crate's own runtime. Called from inside a tokio
/// runtime it answers `<op>:wrong-thread` instead of panicking in `block_on`.
pub fn dispatch_sync(op: &str, args: &[Value], ctx: &KnownFixCtx) -> Result<Value, String> {
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
    use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use serde_json::json;
    use std::sync::Arc;

    // The same literals `knownFixOverlayCatalogue.test.ts` pins on the TS side.
    const ARCHIVE_URL: &str = "https://github.com/grayson-mitchell/GameLib/releases/download/overlay-gst-libav-1.24.13-x86_64/gst-libav-1.24.13-macos-x86_64.tar.gz";
    const NOTICES_URL: &str =
        "https://github.com/grayson-mitchell/GameLib/releases/tag/overlay-gst-libav-1.24.13-x86_64";

    fn ctx(home: &FakeHome) -> KnownFixCtx {
        let root = home.root().to_path_buf();
        let engine = EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Linux,
            EnginePaths {
                app_folder: root.clone(),
                user_data: root.clone(),
                tools_path: root.join("tools"),
                user_home: root.join("home"),
                temp: root.join("temp"),
            },
            Shutdown::new(),
        );
        KnownFixCtx::new(Arc::new(engine), None, "https://relay.test", "1.2.3")
    }

    /// A future that panics when polled: the shape of an op that hits a bug.
    fn panicking() -> impl Future<Output = Result<Value, String>> {
        std::future::poll_fn(|_| -> Poll<Result<Value, String>> { panic!("test-only op panic") })
    }

    #[test]
    fn the_op_table_is_sorted_and_unique() {
        let mut sorted = OPS.to_vec();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted, OPS);
        assert!(OPS.contains(&"knownfix_apply_profile_registry"));
        assert!(OPS.contains(&"knownfix_apply_registry"));
        assert!(OPS.contains(&"knownfix_fetch_remote"));
        assert!(OPS.contains(&"knownfix_launch_overrides"));
        assert!(OPS.contains(&"knownfix_overlay_catalogue"));
        assert!(OPS.contains(&"knownfix_profile_overlay_env"));
        assert!(OPS.contains(&"knownfix_read"));
        assert!(OPS.contains(&"knownfix_resolve_overlay_env"));
        assert!(OPS.contains(&"knownfix_status"));
    }

    #[tokio::test]
    async fn the_read_op_decodes_app_name_and_runner_and_answers_null_or_the_fix() {
        let home = FakeHome::new("knownfix-lib-");
        let ctx = ctx(&home);
        let op = "knownfix_read";
        // A rejected argument is a fixed literal that never echoes the input.
        let secret = "SECRET-APP-".repeat(40);
        for bad in [
            vec![],
            vec![json!("a")],
            vec![json!("a"), json!("epic")],
            vec![json!("a"), json!(secret)],
            vec![json!(1), json!("gog")],
            vec![json!("a"), json!("gog"), json!("gog")],
            vec![json!({"appName": "a", "runner": "gog"})],
        ] {
            let err = dispatch(op, &bad, &ctx).await.unwrap_err();
            assert_eq!(err, format!("{op}:bad-args"), "{bad:?}");
        }
        assert_eq!(
            dispatch(op, &[json!("nope"), json!("gog")], &ctx).await,
            Ok(Value::Null)
        );
        let dir = ctx.paths.local.clone();
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("1234-gog.json"),
            r#"{"title":"Seeded","winetricks":["vcrun2019"],"registry":[]}"#,
        )
        .unwrap();
        assert_eq!(
            dispatch(op, &[json!("1234"), json!("gog")], &ctx)
                .await
                .unwrap(),
            json!({"title": "Seeded", "winetricks": ["vcrun2019"]})
        );
    }

    #[tokio::test]
    async fn the_launch_overrides_op_decodes_one_strict_object_and_never_echoes_input() {
        let home = FakeHome::new("knownfix-lib-");
        let ctx = ctx(&home);
        let op = "knownfix_launch_overrides";
        let secret = "SECRET-APP-".repeat(40);
        for bad in [
            vec![],
            vec![json!(["a", "gog", null])],
            vec![json!({"appName": "a", "runner": "epic", "installPath": null})],
            vec![json!({"appName": "a", "runner": secret, "installPath": null})],
            vec![json!({"appName": 1, "runner": "gog"})],
            vec![json!({"appName": "a", "runner": "gog", "extra": 1})],
            vec![json!({"appName": "a", "runner": "gog"}), json!(1)],
        ] {
            let err = dispatch(op, &bad, &ctx).await.unwrap_err();
            assert_eq!(err, format!("{op}:bad-args"), "{bad:?}");
        }
        // No fix: empty overrides, with the install path null or absent.
        for args in [
            json!({"appName": "nope", "runner": "gog", "installPath": null}),
            json!({"appName": "nope", "runner": "gog"}),
        ] {
            assert_eq!(
                dispatch(op, &[args], &ctx).await.unwrap(),
                json!({"launchArgs": [], "exeOverride": null})
            );
        }
    }

    #[tokio::test]
    async fn the_registry_ops_decode_one_strict_object_and_say_not_ready_without_a_wine_core() {
        let home = FakeHome::new("knownfix-lib-");
        let ctx = ctx(&home);
        let secret = "SECRET-APP-".repeat(40);
        let profile_op = "knownfix_apply_profile_registry";
        for bad in [
            vec![],
            vec![json!({"appName": "a", "runner": "gog"})],
            vec![json!({"appName": "a", "runner": "epic", "gameSettings": {}})],
            vec![json!({"appName": "a", "runner": "gog", "gameSettings": []})],
            vec![json!({"appName": "", "runner": "gog", "gameSettings": {}})],
            vec![json!({"appName": secret, "runner": "gog", "gameSettings": {}})],
            vec![json!({"appName": "a", "runner": "gog", "gameSettings": {}, "x": 1})],
        ] {
            let err = dispatch(profile_op, &bad, &ctx).await.unwrap_err();
            assert_eq!(err, format!("{profile_op}:bad-args"), "{bad:?}");
        }
        let good = json!({"appName": "a", "runner": "gog", "gameSettings": {}});
        assert_eq!(
            dispatch(profile_op, &[good], &ctx).await.unwrap_err(),
            format!("{profile_op}:not-ready")
        );
        let bridge_op = "knownfix_apply_registry";
        for bad in [
            vec![],
            vec![json!({"appId": "1", "label": "Steam 1", "gameSettings": []})],
            vec![json!({"appId": "", "label": "Steam 1", "gameSettings": {}})],
            vec![json!({"appId": "1", "label": "", "gameSettings": {}})],
            vec![json!({"appId": "1", "label": secret, "gameSettings": {}})],
            vec![json!({"appId": "1", "label": "L", "gameSettings": {}, "bottleDir": 5})],
            vec![json!({"appId": "1", "label": "L", "gameSettings": {}, "extra": 1})],
        ] {
            let err = dispatch(bridge_op, &bad, &ctx).await.unwrap_err();
            assert_eq!(err, format!("{bridge_op}:bad-args"), "{bad:?}");
        }
        let good = json!({"appId": "1", "label": "Steam 1", "gameSettings": {}, "bottleDir": null});
        assert_eq!(
            dispatch(bridge_op, &[good], &ctx).await.unwrap_err(),
            format!("{bridge_op}:not-ready")
        );
    }

    #[tokio::test]
    async fn the_registry_ops_answer_null_with_a_wine_core_and_no_profile() {
        let home = FakeHome::new("knownfix-lib-");
        let base = ctx(&home);
        let wine = Arc::new(gamelib_wine::ctx::WineCtx::new(
            Arc::clone(&base.engine),
            home.root().join("runtime"),
        ));
        let ctx = base.with_wine(wine, gamelib_wine::wine_cmd::WineHost::default());
        let profile = json!({"appName": "nope", "runner": "gog", "gameSettings": {}});
        assert_eq!(
            dispatch("knownfix_apply_profile_registry", &[profile], &ctx).await,
            Ok(Value::Null)
        );
        let bridge =
            json!({"appId": "9", "label": "Steam 9", "gameSettings": {}, "bottleDir": null});
        assert_eq!(
            dispatch("knownfix_apply_registry", &[bridge], &ctx).await,
            Ok(Value::Null)
        );
    }

    #[tokio::test]
    async fn the_overlay_env_ops_decode_one_strict_object_and_never_echo_input() {
        let home = FakeHome::new("knownfix-lib-");
        let ctx = ctx(&home);
        let secret = "SECRET-VALUE-".repeat(30);
        let profile_ok = json!({"appName": "1", "runner": "gog", "gameSettings": {},
            "tier1Env": {}, "processEnvBase": {}});
        let resolve_ok =
            json!({"appId": "9", "label": "Steam 9", "wineType": null, "baseValues": {}});
        // A game with no profile has no overlay env: an empty map, and no download.
        assert_eq!(
            dispatch(
                "knownfix_profile_overlay_env",
                std::slice::from_ref(&profile_ok),
                &ctx
            )
            .await,
            Ok(json!({}))
        );
        assert_eq!(
            dispatch(
                "knownfix_resolve_overlay_env",
                std::slice::from_ref(&resolve_ok),
                &ctx
            )
            .await,
            Ok(json!({}))
        );
        for (op, bad) in [
            ("knownfix_profile_overlay_env", vec![]),
            ("knownfix_profile_overlay_env", vec![json!([["1", "gog"]])]),
            (
                "knownfix_profile_overlay_env",
                vec![profile_ok.clone(), profile_ok.clone()],
            ),
            (
                "knownfix_profile_overlay_env",
                vec![json!({"appName": "1", "runner": "gog", "gameSettings": {},
                "tier1Env": {}, "processEnvBase": {}, "extra": secret})],
            ),
            (
                "knownfix_profile_overlay_env",
                vec![json!({"appName": "1", "runner": secret, "gameSettings": {},
                "tier1Env": {}, "processEnvBase": {}})],
            ),
            (
                "knownfix_profile_overlay_env",
                vec![json!({"appName": "1", "runner": "gog", "gameSettings": [],
                "tier1Env": {}, "processEnvBase": {}})],
            ),
            (
                "knownfix_profile_overlay_env",
                vec![json!({"appName": "1", "runner": "gog", "gameSettings": {},
                "tier1Env": {"A": 1}, "processEnvBase": {}})],
            ),
            (
                "knownfix_profile_overlay_env",
                vec![json!({"appName": "", "runner": "gog", "gameSettings": {},
                "tier1Env": {}, "processEnvBase": {}})],
            ),
            (
                "knownfix_resolve_overlay_env",
                vec![json!({"appId": "9", "label": "L"})],
            ),
            (
                "knownfix_resolve_overlay_env",
                vec![json!({"appId": "9", "label": "L", "baseValues": {}, "x": secret})],
            ),
            (
                "knownfix_resolve_overlay_env",
                vec![json!({"appId": "9", "label": "x".repeat(257), "baseValues": {}})],
            ),
            (
                "knownfix_resolve_overlay_env",
                vec![json!({"appId": "9", "label": "L", "baseValues": {"A": secret.len()}})],
            ),
        ] {
            let err = dispatch(op, &bad, &ctx).await.unwrap_err();
            assert_eq!(err, format!("{op}:bad-args"), "{bad:?}");
            assert!(!err.contains("SECRET"), "{err}");
        }
    }

    #[tokio::test]
    async fn the_status_op_decodes_like_the_read_op_and_answers_the_origin_or_null() {
        let home = FakeHome::new("knownfix-lib-");
        let ctx = ctx(&home);
        let op = "knownfix_status";
        for bad in [
            vec![],
            vec![json!("a")],
            vec![json!("a"), json!("epic")],
            vec![json!(1), json!("gog")],
        ] {
            assert_eq!(
                dispatch(op, &bad, &ctx).await.unwrap_err(),
                format!("{op}:bad-args"),
                "{bad:?}"
            );
        }
        assert_eq!(
            dispatch(op, &[json!("1234"), json!("gog")], &ctx).await,
            Ok(Value::Null)
        );
        // The remote layer never counts.
        std::fs::create_dir_all(&ctx.paths.fixes).unwrap();
        std::fs::write(ctx.paths.fixes.join("1234-gog.json"), r#"{"title":"r"}"#).unwrap();
        assert_eq!(
            dispatch(op, &[json!("1234"), json!("gog")], &ctx).await,
            Ok(Value::Null)
        );
        std::fs::create_dir_all(&ctx.paths.local).unwrap();
        std::fs::write(
            ctx.paths.local.join("1234-gog.json"),
            r#"{"title":"l","launchNotice":" hi "}"#,
        )
        .unwrap();
        assert_eq!(
            dispatch(op, &[json!("1234"), json!("gog")], &ctx)
                .await
                .unwrap(),
            json!({"origin": "local", "launchNotice": "hi"})
        );
    }

    #[tokio::test]
    async fn an_unknown_op_is_named() {
        let home = FakeHome::new("knownfix-lib-");
        let err = dispatch("nope", &[], &ctx(&home)).await.unwrap_err();
        assert_eq!(err, "unknown op: nope");
    }

    #[tokio::test]
    async fn the_catalogue_op_takes_no_argument() {
        let home = FakeHome::new("knownfix-lib-");
        let ctx = ctx(&home);
        let op = "knownfix_overlay_catalogue";
        for bad in [vec![json!(1)], vec![json!({})], vec![json!(null), json!(1)]] {
            assert_eq!(
                dispatch(op, &bad, &ctx).await.unwrap_err(),
                format!("{op}:bad-args"),
                "{bad:?}"
            );
        }
        let answer = dispatch(op, &[], &ctx).await.unwrap();
        assert_eq!(answer["entries"][0]["id"], "gst-libav-1.24.13");
        assert_eq!(
            answer["targetEnv"]["gstreamer-plugin-path"],
            "GST_PLUGIN_PATH"
        );
        // Nothing was created for a read of compiled-in data.
        assert!(!home.root().join("overlays").exists());
    }

    #[test]
    fn decode_takes_exactly_one_strict_argument() {
        #[derive(serde::Deserialize, Debug)]
        #[serde(deny_unknown_fields)]
        struct Args {
            #[allow(dead_code)]
            id: String,
        }
        assert!(decode::<Args>("knownfix_x", &[json!({"id": "a"})]).is_ok());
        assert_eq!(
            decode::<Args>("knownfix_x", &[json!(1), json!(2)]).unwrap_err(),
            "knownfix_x:bad-args"
        );
        assert_eq!(
            decode::<Args>("knownfix_x", &[json!({"id": "a", "extra": 1})]).unwrap_err(),
            "knownfix_x:bad-args"
        );
    }

    #[test]
    fn the_catalogue_urls_are_the_literals_the_ts_test_pins() {
        let entry = catalogue::lookup("gst-libav-1.24.13").expect("the pinned overlay");
        assert_eq!(catalogue::archive_url(entry), ARCHIVE_URL);
        assert_eq!(catalogue::notices_url().unwrap(), NOTICES_URL);
        assert_eq!(entry.files.len(), 10);
        assert_eq!(entry.archive_size, 8_279_592);
        assert!(catalogue::lookup("gst-libav-1.24.13 ").is_none());
        assert!(catalogue::lookup("__proto__").is_none());
    }

    #[test]
    fn the_paths_derive_from_the_app_folder_as_app_paths_ts_builds_them() {
        let home = FakeHome::new("knownfix-lib-");
        let ctx = ctx(&home);
        let root = home.root();
        assert_eq!(ctx.paths.fixes, root.join("fixes"));
        assert_eq!(ctx.paths.local, root.join("fixes").join("local"));
        assert_eq!(ctx.paths.overlays, root.join("overlays"));
        assert_eq!(ctx.paths.bundled, None);
        assert_eq!(ctx.relay_url, "https://relay.test");
        assert_eq!(ctx.app_version, "1.2.3");
    }

    #[tokio::test]
    async fn dispatch_sync_inside_a_runtime_is_wrong_thread() {
        let home = FakeHome::new("knownfix-lib-");
        let err = dispatch_sync("knownfix_probe", &[], &ctx(&home)).unwrap_err();
        assert_eq!(err, "knownfix_probe:wrong-thread");
    }

    #[test]
    fn dispatch_sync_on_a_plain_thread_answers_the_op_and_unknown_op() {
        let home = FakeHome::new("knownfix-lib-");
        let ctx = ctx(&home);
        let err = dispatch_sync("nope", &[], &ctx).unwrap_err();
        assert_eq!(err, "unknown op: nope");
        let answer = dispatch_sync("knownfix_overlay_catalogue", &[], &ctx).unwrap();
        assert_eq!(answer["entries"][0]["id"], "gst-libav-1.24.13");
    }

    #[tokio::test]
    async fn a_panicking_op_answers_panic() {
        let home = FakeHome::new("knownfix-lib-");
        let err = guarded("knownfix_probe", &ctx(&home), panicking())
            .await
            .unwrap_err();
        assert_eq!(err, "knownfix_probe:panic");
    }

    #[tokio::test]
    async fn a_cancelled_shutdown_answers_shutdown_and_releases_its_registrant() {
        let home = FakeHome::new("knownfix-lib-");
        let ctx = ctx(&home);
        ctx.engine.shutdown.token().cancel();
        let work = async { Ok(Value::Null) };
        let err = guarded("knownfix_probe", &ctx, work).await.unwrap_err();
        assert_eq!(err, "knownfix_probe:shutdown");
        assert!(ctx
            .engine
            .shutdown
            .drain(std::time::Duration::from_millis(50))
            .is_empty());
    }
}
