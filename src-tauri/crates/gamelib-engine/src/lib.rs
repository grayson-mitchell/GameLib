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
pub mod ctx;
pub mod dxvk;
pub mod engines;
pub mod fetch;
pub mod game_engine;
pub mod game_prefix;
pub mod ids;
pub mod jsutil;
pub mod key;
pub mod offline;
pub mod pins;
pub mod sinks;
#[cfg(feature = "testing")]
pub mod testing;
pub mod tool_settings;

use ctx::EngineCtx;
use serde_json::Value;
use std::future::Future;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::pin::Pin;
use std::sync::OnceLock;
use std::task::{Context, Poll};
use tokio::runtime::{Builder, Handle, Runtime};

/// Ops reachable from the shell and the CLI. Keep sorted; each plan adds its own.
pub const OPS: &[&str] = &[
    "engine_bottle_is_provisioned",
    "engine_bottle_record_pinned",
    "engine_default_engine",
    "engine_list_options",
    "engine_per_game_bottle_name",
    "engine_pins",
    "engine_resolve_tool_settings",
    "engine_set_online",
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
        // The marker a pinned-engine bottle gets at creation: written through the in-process version
        // gate, `false` when nothing was written (a newer marker, an absent bottle, an unsafe name).
        "engine_bottle_record_pinned" => {
            let request: RecordPinnedRequest = decode(op, args)?;
            let engine = engines::NonCrossoverEngine {
                wine_bin: request.engine.wine_bin,
                wineserver_bin: request.engine.wineserver_bin,
                label: request.engine.label,
                version: request.engine.version,
                dxvk: request.engine.dxvk,
            };
            let recorded =
                bottles::marker::record_pinned(ctx, &request.bottle_name, &request.pin_id, &engine);
            Ok(Value::Bool(recorded))
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
        // The shell's online monitor says it changed (D-17): the DXMT fetch and the boot update read it.
        "engine_set_online" => {
            let request: SetOnlineRequest = decode(op, args)?;
            ctx.set_online(request.online);
            Ok(Value::Null)
        }
        _ => Err(format!("unknown op: {op}")),
    }
}

/// The argument of `engine_bottle_is_provisioned`.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BottleNameRequest {
    bottle_name: String,
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
fn runtime() -> Result<&'static Runtime, String> {
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
            "engine_bottle_is_provisioned",
            "engine_bottle_record_pinned",
            "engine_default_engine",
            "engine_list_options",
            "engine_per_game_bottle_name",
            "engine_resolve_tool_settings",
            "engine_set_online",
        ] {
            assert!(OPS.contains(&op), "{op}");
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
}
