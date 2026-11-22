//! The shell's side of the leaf information services (Phase 86, SVC-01): the one [`InfoCtx`], the
//! `info_*` rustInvoke handlers and the `info` native channels, over the Tauri-free `gamelib-info`
//! crate.
//!
//! D-20: one `Arc<InfoCtx>` is built in `run_setup` right after the store host opens, from the
//! shell's own paths, `SystemClock`, the platform, the app version, `ReqwestHttp` and the
//! process-wide `gamelib_core::shutdown::global()`. Its secrets stay `None` until 86-14. Nothing
//! here spawns a process or waits without a bound: every op runs inside the crate's `guarded`
//! wrapper (a shutdown registrant raced against the token).
//!
//! D-08: a change Rust makes to the recent-games list reaches the renderer (`recentGamesChanged`
//! through the shell's `FrontendEmitter`) and the tray (`update_tray_recent_games` on the main
//! thread) from [`TrayRecentSink`], not from the sidecar relay.
//!
//! T-28-04 / T-86-15: nothing here formats an argument into a log line or an error.

use super::*;

use std::path::Path;

use gamelib_core::clock::SystemClock;
use gamelib_core::emitter::FrontendEmitter;
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform};
use gamelib_info::http::ReqwestHttp;
use gamelib_info::recent::RecentSink;
use gamelib_store::json::Json;

/// The frontend-message channel the renderer listens on for the recent-games list.
const RECENT_GAMES_CHANGED: &str = "recentGamesChanged";

/// The one context, set once by [`install`].
static INFO_CTX: OnceLock<Arc<InfoCtx>> = OnceLock::new();

/// The installed context, or `None` before [`install`] (and in a unit test that built its own).
pub(crate) fn info_ctx() -> Option<&'static Arc<InfoCtx>> {
    INFO_CTX.get()
}

/// The platform the crate is told about (it never asks the OS itself).
fn platform() -> Platform {
    if cfg!(target_os = "macos") {
        Platform::Mac
    } else if cfg!(target_os = "windows") {
        Platform::Windows
    } else {
        Platform::Linux
    }
}

/// Recent-games changes, pushed the way the sidecar's relay pushed them: the renderer gets the
/// list through the emitter, and the tray menu is rebuilt from it on the main thread.
///
/// The tray update and the menu limit are injected so a unit test needs no AppHandle and never
/// reads the operator's tray settings.
pub(crate) struct TrayRecentSink {
    emitter: Arc<dyn FrontendEmitter>,
    update_tray: Arc<dyn Fn(Vec<TrayRecentGame>) + Send + Sync>,
    limit: Arc<dyn Fn() -> usize + Send + Sync>,
}

impl TrayRecentSink {
    pub(crate) fn new(
        emitter: Arc<dyn FrontendEmitter>,
        update_tray: Arc<dyn Fn(Vec<TrayRecentGame>) + Send + Sync>,
        limit: Arc<dyn Fn() -> usize + Send + Sync>,
    ) -> Self {
        Self {
            emitter,
            update_tray,
            limit,
        }
    }

    /// The production sink: the shell's emitter, and `update_tray_recent_games` hopped to the main
    /// thread (menu construction wants it on macOS; failure to schedule is logged, never fatal).
    pub(crate) fn for_app(app: &AppHandle) -> Self {
        let tray_app = app.clone();
        Self::new(
            Arc::new(steampoll_dispatch::TauriFrontendEmitter(app.clone())),
            Arc::new(move |games| {
                let menu_app = tray_app.clone();
                if let Err(e) =
                    tray_app.run_on_main_thread(move || update_tray_recent_games(&menu_app, games))
                {
                    shell_eprintln!(
                        "[shell] WARN: tray recent-games rebuild could not be scheduled ({e}) -- tray menu left as-is"
                    );
                }
            }),
            Arc::new(|| tray_settings().max_recent_games),
        )
    }
}

impl RecentSink for TrayRecentSink {
    fn changed(&self, list: &Json) {
        let value = list.to_value();
        let games = tray_recent_games_from_value(&value, (self.limit)());
        self.emitter.emit(RECENT_GAMES_CHANGED, vec![value]);
        (self.update_tray)(games);
    }
}

/// Builds the one context and stores it. Called from `run_setup` after the store host opened and
/// before the sidecar is spawned. A second call is ignored (the first context stays).
pub(crate) fn install(app: &AppHandle, user_data: &Path) {
    let mut ctx = InfoCtx::new(
        Arc::clone(store_boot::host()),
        Arc::new(SystemClock),
        platform(),
        InfoPaths {
            // `user_data` is both the user-data directory and the app folder (store_boot).
            app_folder: user_data.to_path_buf(),
            user_data: user_data.to_path_buf(),
            temp: std::env::temp_dir(),
            public_dir: app.path().resource_dir().ok(),
        },
        native_handlers::app_version().to_string(),
        gamelib_core::shutdown::global().clone(),
        Arc::new(ReqwestHttp::new()),
    );
    ctx.recent_sink = Some(Arc::new(TrayRecentSink::for_app(app)));
    let _ = INFO_CTX.set(Arc::new(ctx));
}

/// The installed context for op `op`, or the fixed "not ready" answer.
fn installed(op: &str) -> Result<&'static InfoCtx, String> {
    info_ctx()
        .map(|ctx| ctx.as_ref())
        .ok_or_else(|| format!("{op}:not-ready"))
}

/// `info_recent_add`: validated by the generated args struct, then the crate (which validates again
/// with its own `deny_unknown_fields` struct and bounds `appName`).
fn recent_add_with(ctx: &InfoCtx, args: &[Value]) -> Result<Value, String> {
    InfoRecentAddArgs::from_args(args)?;
    gamelib_info::dispatch_sync("info_recent_add", args, ctx)
}

fn recent_remove_with(ctx: &InfoCtx, args: &[Value]) -> Result<Value, String> {
    InfoRecentRemoveArgs::from_args(args)?;
    gamelib_info::dispatch_sync("info_recent_remove", args, ctx)
}

/// Handlers run on the `rustInvoke` worker thread (never a tokio thread), so the crate's sync
/// facade, which blocks on its own runtime, is legal to call.
pub(crate) fn rpc_info_recent_add(args: &[Value]) -> Result<Value, String> {
    recent_add_with(installed("info_recent_add")?, args)
}

pub(crate) fn rpc_info_recent_remove(args: &[Value]) -> Result<Value, String> {
    recent_remove_with(installed("info_recent_remove")?, args)
}

#[cfg(test)]
use gamelib_store::host::StoreHost;
#[cfg(test)]
use gamelib_testutil::FakeHome;

/// The 86-04 recent goldens' before-states.
#[cfg(test)]
const STATE: &str = "crates/gamelib-info/tests/fixtures/state/recent";

/// An `InfoCtx` on a FakeHome whose `userData` holds `before` (a golden state folder).
#[cfg(test)]
pub(crate) fn test_ctx(home: &FakeHome, before: Option<&str>) -> InfoCtx {
    let user_data = home.root().join("userData");
    std::fs::create_dir_all(user_data.join("store")).unwrap();
    if let Some(case) = before {
        let from = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join(STATE)
            .join(case)
            .join("store/config.json");
        std::fs::copy(from, user_data.join("store/config.json")).unwrap();
    }
    InfoCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        Platform::Linux,
        InfoPaths {
            app_folder: user_data.clone(),
            user_data,
            temp: home.root().join("temp"),
            public_dir: None,
        },
        "0.0.0-test".to_string(),
        gamelib_core::shutdown::Shutdown::new(),
        Arc::new(ReqwestHttp::new()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::Mutex;

    const GOLDEN: &str = "crates/gamelib-info/tests/fixtures/golden/recent/expected";

    /// Records every `(channel, args)` push.
    #[derive(Default)]
    struct RecordingEmitter(Mutex<Vec<(String, Vec<Value>)>>);

    impl FrontendEmitter for RecordingEmitter {
        fn emit(&self, channel: &str, args: Vec<Value>) {
            self.0.lock().unwrap().push((channel.to_string(), args));
        }
    }

    /// A sink with no AppHandle: records the emitter pushes and the tray lists it was handed.
    fn recording_sink() -> (
        Arc<TrayRecentSink>,
        Arc<RecordingEmitter>,
        Arc<Mutex<Vec<Vec<TrayRecentGame>>>>,
    ) {
        let emitter = Arc::new(RecordingEmitter::default());
        let tray = Arc::new(Mutex::new(Vec::new()));
        let tray_sink = Arc::clone(&tray);
        let sink = Arc::new(TrayRecentSink::new(
            emitter.clone(),
            Arc::new(move |games| tray_sink.lock().unwrap().push(games)),
            Arc::new(|| 5),
        ));
        (sink, emitter, tray)
    }

    fn golden_bytes(case: &str) -> Vec<u8> {
        std::fs::read(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join(GOLDEN)
                .join(case)
                .join("after/store/config.json"),
        )
        .unwrap()
    }

    #[test]
    fn rpc_add_writes_the_ts_golden_bytes_and_tells_the_sink() {
        let home = FakeHome::new("info-dispatch-");
        let mut ctx = test_ctx(&home, Some("add-to-populated-list"));
        let (sink, emitter, tray) = recording_sink();
        ctx.recent_sink = Some(sink);

        let args = [json!({ "appName": "app1", "title": "Game 1", "runner": "steam" })];
        assert_eq!(recent_add_with(&ctx, &args), Ok(Value::Null));

        let written = std::fs::read(home.root().join("userData/store/config.json")).unwrap();
        assert_eq!(
            written,
            golden_bytes("add-to-populated-list"),
            "the file differs from the TS golden"
        );
        // The renderer push carries the new list, newest first.
        let pushes = emitter.0.lock().unwrap();
        assert_eq!(pushes.len(), 1);
        assert_eq!(pushes[0].0, "recentGamesChanged");
        assert_eq!(pushes[0].1[0][0]["appName"], "app1");
        assert_eq!(pushes[0].1[0][0]["runner"], "steam");
        // The tray got the same list.
        let tray = tray.lock().unwrap();
        assert_eq!(tray.len(), 1);
        assert_eq!(tray[0][0].app_name, "app1");
        assert_eq!(tray[0][0].runner.as_deref(), Some("steam"));
    }

    #[test]
    fn the_tray_list_is_cut_to_the_menu_limit() {
        let emitter = Arc::new(RecordingEmitter::default());
        let tray = Arc::new(Mutex::new(Vec::new()));
        let tray_sink = Arc::clone(&tray);
        let sink = TrayRecentSink::new(
            emitter.clone(),
            Arc::new(move |games| tray_sink.lock().unwrap().push(games)),
            Arc::new(|| 2),
        );
        let list = Json::from(json!([
            { "appName": "a", "title": "A" },
            { "appName": "b", "title": "B" },
            { "appName": "c", "title": "C" }
        ]));
        sink.changed(&list);
        // The renderer still gets the whole list; only the menu is cut.
        assert_eq!(
            emitter.0.lock().unwrap()[0].1[0].as_array().unwrap().len(),
            3
        );
        assert_eq!(tray.lock().unwrap()[0].len(), 2);
    }

    #[test]
    fn rpc_rejects_bad_args_before_the_crate_with_a_fixed_literal() {
        let home = FakeHome::new("info-dispatch-");
        let ctx = test_ctx(&home, None);
        for args in [
            vec![],
            vec![json!({ "appName": "a" })],
            vec![json!({ "appName": 1, "title": "t", "runner": "gog" })],
            vec![json!("a")],
        ] {
            assert_eq!(
                recent_add_with(&ctx, &args),
                Err("info_recent_add:bad-args".to_string()),
                "{args:?}"
            );
        }
        // The generated struct accepts an unknown field's absence only: unknown fields reach the
        // crate's `deny_unknown_fields` struct, which rejects them the same way.
        let extra = [json!({ "appName": "a", "title": "t", "runner": "gog", "x": 1 })];
        assert_eq!(
            recent_add_with(&ctx, &extra),
            Err("info_recent_add:bad-args".to_string())
        );
        assert_eq!(
            recent_remove_with(&ctx, &[json!({ "appName": 1 })]),
            Err("info_recent_remove:bad-args".to_string())
        );
        assert!(!home.root().join("userData/store/config.json").exists());
    }

    #[test]
    fn the_handlers_answer_not_ready_before_install() {
        // No test installs the global context, so this is the pre-install answer.
        assert!(info_ctx().is_none());
        assert_eq!(
            rpc_info_recent_add(&[json!({ "appName": "a", "title": "t", "runner": "gog" })]),
            Err("info_recent_add:not-ready".to_string())
        );
        assert_eq!(
            rpc_info_recent_remove(&[json!({ "appName": "a" })]),
            Err("info_recent_remove:not-ready".to_string())
        );
    }
}
