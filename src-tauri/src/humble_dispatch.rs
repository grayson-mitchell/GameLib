//! The shell's side of the Humble Bundle services (Phase 94, SVC-04): the one [`HumbleCtx`] and the
//! `humble` native channels, over the Tauri-free `gamelib-humble` crate.
//!
//! D-20: one `Arc<HumbleCtx>` is built in `run_setup` right after the store host opens, from the
//! shell's own user-data folder, `SystemClock`, the platform, the process-wide
//! `gamelib_core::shutdown::global()`, the shell's [`FrontendEmitter`] and a log sink that writes
//! fixed text only. Building it spawns nothing and waits on nothing; an op before [`install`] answers
//! `<op>:not-ready`. Every op runs inside the crate's `guarded` wrapper (a shutdown registrant raced
//! against the token).
//!
//! D-16/D-19: the two read-only channels here (`humbleGetGiftedAt`, `humbleGetOwnershipOverrides`)
//! are native, so the renderer reaches Rust directly and the sidecar registers neither. Rust only
//! reads the two stores through the StoreHost; the TypeScript library still writes them through the
//! sidecar's mirror, so each file has one writer.
//!
//! D-20 seams: the context also carries the crate's [`HumbleUi`] ([`ShellHumbleUi`]: the OS notification
//! through `notification_show::show_notification` and a `kind: "send"` frame to the sidecar through
//! `engine_dispatch::send_frame_to_sidecar`, the same delivery paths the engine uses) and the i18n
//! [`Catalog`], loaded once at install from the bundled `locales` folder in the user's language.
//!
//! T-28-04 / T-94-23 / T-94-24: nothing here formats an argument into a log line or an error.

use super::*;

use std::path::Path;

use gamelib_core::clock::SystemClock;
use gamelib_core::emitter::FrontendEmitter;
use gamelib_humble::ctx::{HostZone, HumbleCtx, HumbleLog, HumbleUi, Platform};
use gamelib_humble::http::ReqwestHttp;
use gamelib_i18n::Catalog;
use gamelib_log::TzOffset;
use gamelib_store::host::StoreHost;

/// The one context, set once by [`install`].
static HUMBLE_CTX: OnceLock<Arc<HumbleCtx>> = OnceLock::new();

/// The installed context, or `None` before [`install`] (and in a unit test that built its own).
pub(crate) fn humble_ctx() -> Option<&'static Arc<HumbleCtx>> {
    HUMBLE_CTX.get()
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

/// The crate's diagnostic lines, into `gamelib.log`. A line is fixed text (see [`HumbleLog`]), so it
/// is a category in the sense of the shell's log gate; the level is carried by the text's prefix, the
/// way `shell_log_level` reads it.
struct ShellHumbleLog;

/// The text written for one crate line: `humble: <line>`, with the prefix the shell's level reader
/// understands for a warning or an error.
fn log_text(level: &str, line: &str) -> String {
    match level {
        "warn" => format!("WARN: humble: {line}"),
        "error" => format!("FATAL: humble: {line}"),
        _ => format!("humble: {line}"),
    }
}

impl HumbleLog for ShellHumbleLog {
    fn info(&self, line: &str) {
        shell_log(&log_text("info", line));
    }

    fn warn(&self, line: &str) {
        shell_log(&log_text("warn", line));
    }

    fn error(&self, line: &str) {
        shell_log(&log_text("error", line));
    }
}

/// One way the shell reaches the operator or the sidecar, as a plain function so a test can record
/// what the [`ShellHumbleUi`] did without an `AppHandle`.
type NotifySink = Box<dyn Fn(&str, &str) + Send + Sync>;
type SidecarSink = Box<dyn Fn(&str, Vec<Value>) + Send + Sync>;

/// The shell's [`HumbleUi`] (D-20): what a Humble op says to the operator and to the sidecar.
///
/// - `notify` is the OS notification through `notification_show::show_notification`, the one delivery
///   path `Notification.show()`, the steampoll host and the engine share, with the title and body
///   unchanged.
/// - `send_to_sidecar` is a `kind: "send"` frame written to the sidecar's stdin
///   (`engine_dispatch::send_frame_to_sidecar`); with no sidecar (not yet spawned, or gone) it is
///   dropped, as `sidecar_send` treats a dead pipe.
///
/// Nothing here logs a title, a body or an argument (a title can carry a game name).
pub(crate) struct ShellHumbleUi {
    notify: NotifySink,
    sidecar: SidecarSink,
}

impl ShellHumbleUi {
    /// The production sinks over the app handle and the sidecar's state.
    pub(crate) fn for_app(app: &AppHandle) -> ShellHumbleUi {
        let notify_app = app.clone();
        ShellHumbleUi {
            notify: Box::new(move |title, body| {
                if notification_show::show_notification(&notify_app, Some(title), Some(body))
                    .is_err()
                {
                    shell_log("humble notification could not be shown");
                }
            }),
            sidecar: Box::new(engine_dispatch::send_frame_to_sidecar),
        }
    }

    /// A UI whose sinks are the given functions, for a test.
    #[cfg(test)]
    pub(crate) fn with_sinks(notify: NotifySink, sidecar: SidecarSink) -> ShellHumbleUi {
        ShellHumbleUi { notify, sidecar }
    }
}

impl HumbleUi for ShellHumbleUi {
    fn notify(&self, title: &str, body: &str) {
        (self.notify)(title, body);
    }

    fn send_to_sidecar(&self, channel: &str, args: Vec<Value>) {
        (self.sidecar)(channel, args);
    }
}

/// The latest instant the shell's lookup answers for: 9999-12-01T00:00:00Z, inside `jiff`'s range.
const ZONE_LOOKUP_LAST_MS: i64 = 253_399_622_400_000;

/// The host's time zone, read from the system at the instant asked (D-94-15): the shell answers "what
/// offset applies at this instant" through the same `jiff` system-zone lookup the log writer stamps its
/// lines with. The classifier asks for the offset at a zone-less expiry's own date (quick 261128-22q),
/// so a daylight-saving host reads a winter expiry with its winter offset whatever the season of the
/// sync. Two clamps are accepted limits:
/// - before 1970 reads the 1970 offset; Humble's dates are decades later.
/// - past 9999-12-01 reads that instant's offset. Without this clamp the lookup answers UTC there,
///   which the offset-now rule never did.
struct ShellHostZone;

impl HostZone for ShellHostZone {
    fn offset_east_secs_at(&self, utc_ms: i64) -> i32 {
        // `SystemTz` takes an unsigned instant and answers minutes.
        let clamped = utc_ms.clamp(0, ZONE_LOOKUP_LAST_MS);
        gamelib_log::SystemTz.offset_minutes(u64::try_from(clamped).unwrap_or(0)) * 60
    }
}

/// The catalog notice text is rendered through, loaded from `locales_dir` in `language` (a shipped
/// code or BCP-47 tag; `en` when `None`). It never fails: a missing or malformed file leaves the
/// catalog empty and every notice renders its default text. Read once at install, so a language
/// changed while GameLib runs reaches Humble notices on the next start.
pub(crate) fn load_catalog(locales_dir: &Path, language: Option<&str>) -> Arc<Catalog> {
    Arc::new(Catalog::load(locales_dir, language.unwrap_or("en")))
}

/// Builds the context from its parts. Split from [`install`] so a unit test can build one over a fake
/// home. Nothing here spawns, connects or waits.
pub(crate) fn build_ctx(
    host: Arc<StoreHost>,
    user_data: &Path,
    platform: Platform,
    emitter: Arc<dyn FrontendEmitter>,
    log: Arc<dyn HumbleLog>,
    shutdown: gamelib_core::shutdown::Shutdown,
) -> HumbleCtx {
    HumbleCtx::new(
        host,
        user_data.to_path_buf(),
        Arc::new(SystemClock),
        platform,
        shutdown,
        // Every Humble and Steam-store request: no redirect on a Humble one (Pitfall 5). Building it
        // makes no request and no client; the clients are built on first use, after the rustls
        // provider the shell installs at the top of `main()`.
        Arc::new(ReqwestHttp::new()),
    )
    .with_emitter(emitter)
    .with_log(log)
    .with_zone(Arc::new(ShellHostZone))
}

/// Builds the one context and stores it. Called from `run_setup` after the store host opened and
/// before the sidecar is spawned. A second call is ignored (the first context stays).
pub(crate) fn install(app: &AppHandle, user_data: &Path) {
    let mut ctx = build_ctx(
        Arc::clone(store_boot::host()),
        user_data,
        platform(),
        Arc::new(steampoll_dispatch::TauriFrontendEmitter(app.clone())),
        Arc::new(ShellHumbleLog),
        gamelib_core::shutdown::global().clone(),
    )
    .with_ui(Arc::new(ShellHumbleUi::for_app(app)))
    // D-18: the Keychain (or the dev vault, in a dev run that asks for it) behind the secret owner.
    .with_secrets(humble_secrets::secret_source());
    // The same locales folder and language the steampoll host renders its notifications from.
    let (app_root, asset_dir) = steampoll_dispatch::app_root_and_asset_dir(app);
    let language = gamelib_steampoll::profile::SidecarProfile::current()
        .and_then(|profile| profile.language());
    ctx.catalog = Some(load_catalog(
        &app_root.join(asset_dir).join("locales"),
        language.as_deref(),
    ));
    let _ = HUMBLE_CTX.set(Arc::new(ctx));
}

/// A rejected argument's JSON path and zod-vocabulary code: fixed literals only, never the renderer's
/// value (T-94-23).
type Rejection = (&'static str, &'static str);

/// `humbleGetGiftedAt` and `humbleGetOwnershipOverrides` take no argument.
fn parse_no_args(args: &[Value]) -> Result<(), Rejection> {
    if args.is_empty() {
        Ok(())
    } else {
        Err(("(args)", "too_big"))
    }
}

/// Runs `op` on the blocking pool. The crate's own async `dispatch` is driven with `block_on` there
/// (never `dispatch_sync`, which refuses a thread inside a runtime), so a store read stays off the
/// async workers and the op still holds its shutdown registrant.
async fn run_humble_op(
    humble: Arc<HumbleCtx>,
    op: &'static str,
    args: Vec<Value>,
    failed: &'static str,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        tauri::async_runtime::block_on(gamelib_humble::dispatch(op, &args, &humble))
    })
    .await
    .map_err(|_| failed.to_string())?
}

/// One no-argument read: validated first (so a bad call is rejected the same way before and after
/// the context is installed), then run.
async fn no_arg_read(
    channel: &'static str,
    op: &'static str,
    failed: &'static str,
    args: Vec<Value>,
) -> Result<Value, String> {
    parse_no_args(&args).map_err(|(path, code)| invalid_args(channel, &[path], &[code]))?;
    let humble = humble_ctx().ok_or_else(|| format!("{op}:not-ready"))?;
    run_humble_op(Arc::clone(humble), op, Vec::new(), failed).await
}

/// The native `humbleGetGiftedAt` handler (slice `humble`, D-16): machine name to the time the user
/// confirmed the gift action, read from the Humble store through the StoreHost.
pub(crate) fn get_gifted_at(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(no_arg_read(
        "humbleGetGiftedAt",
        "humble_get_gifted_at",
        "humbleGetGiftedAt: the read did not finish",
        args,
    ))
}

/// The native `humbleGetOwnershipOverrides` handler (slice `humble`, D-16): machine name to the time of
/// the "not the same game" correction.
pub(crate) fn get_ownership_overrides(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(no_arg_read(
        "humbleGetOwnershipOverrides",
        "humble_get_ownership_overrides",
        "humbleGetOwnershipOverrides: the read did not finish",
        args,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_testutil::FakeHome;
    use serde_json::json;
    use std::sync::Mutex;

    /// Records every `(channel, args)` push.
    #[derive(Default)]
    struct RecordingEmitter(Mutex<Vec<(String, Vec<Value>)>>);

    impl FrontendEmitter for RecordingEmitter {
        fn emit(&self, channel: &str, args: Vec<Value>) {
            self.0.lock().unwrap().push((channel.to_string(), args));
        }
    }

    /// Records every line the crate wrote.
    #[derive(Default)]
    struct RecordingLog(Mutex<Vec<String>>);

    impl HumbleLog for RecordingLog {
        fn info(&self, line: &str) {
            self.0.lock().unwrap().push(format!("info {line}"));
        }
        fn warn(&self, line: &str) {
            self.0.lock().unwrap().push(format!("warn {line}"));
        }
        fn error(&self, line: &str) {
            self.0.lock().unwrap().push(format!("error {line}"));
        }
    }

    /// A host that does nothing: the humble handlers never reach the native host.
    struct NoHost;
    impl crate::native_router::NativeHost for NoHost {
        fn open_url(&self, _url: String) {}
        fn reveal_path(&self, _path: String) {}
    }

    fn router_ctx() -> Arc<NativeCtx> {
        Arc::new(NativeCtx::for_tests(Arc::new(NoHost), None))
    }

    /// A context over a fresh fake home, with the gifted-at file seeded.
    fn ctx_over(home: &FakeHome) -> Arc<HumbleCtx> {
        let dir = home.root().join("store_cache");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("humble_gifted_at.json"),
            "{\n\t\"cactus_steam\": {\n\t\t\"giftedAt\": 1795521600000\n\t},\n\t\"__timestamp\": {\n\t\t\"cactus_steam\": \"x\"\n\t}\n}",
        )
        .unwrap();
        Arc::new(build_ctx(
            Arc::new(StoreHost::new()),
            home.root(),
            Platform::Linux,
            Arc::new(RecordingEmitter::default()),
            Arc::new(RecordingLog::default()),
            Shutdown::new(),
        ))
    }

    #[test]
    fn the_handlers_validate_first_and_answer_not_ready_before_install() {
        // No test installs the global context.
        assert!(humble_ctx().is_none());
        let ctx = router_ctx();
        let not_ready = tauri::async_runtime::block_on(get_gifted_at(Arc::clone(&ctx), vec![]));
        assert_eq!(not_ready, Err("humble_get_gifted_at:not-ready".to_string()));
        let not_ready =
            tauri::async_runtime::block_on(get_ownership_overrides(Arc::clone(&ctx), vec![]));
        assert_eq!(
            not_ready,
            Err("humble_get_ownership_overrides:not-ready".to_string())
        );
        // A bad call is rejected with the marker and fixed literals, before the context, and the
        // renderer's value never reaches the error (T-94-23).
        for bad in [
            tauri::async_runtime::block_on(get_gifted_at(Arc::clone(&ctx), vec![json!(1)])),
            tauri::async_runtime::block_on(get_gifted_at(
                Arc::clone(&ctx),
                vec![json!("SECRET-ARG")],
            )),
            tauri::async_runtime::block_on(get_ownership_overrides(
                Arc::clone(&ctx),
                vec![json!(["x"])],
            )),
            tauri::async_runtime::block_on(get_ownership_overrides(ctx, vec![json!(null)])),
        ] {
            let error = bad.unwrap_err();
            assert!(
                error.starts_with(crate::ipc_contract::IPC_INVALID_ARGS_MARKER),
                "{error}"
            );
            assert!(!error.contains("SECRET"), "{error}");
        }
    }

    #[test]
    fn the_gifted_at_op_answers_the_seeded_file_and_the_other_is_empty() {
        let home = FakeHome::new("humble-dispatch-");
        let humble = ctx_over(&home);
        let gifted = tauri::async_runtime::block_on(run_humble_op(
            Arc::clone(&humble),
            "humble_get_gifted_at",
            Vec::new(),
            "failed",
        ));
        assert_eq!(gifted, Ok(json!({ "cactus_steam": 1795521600000_u64 })));
        let overrides = tauri::async_runtime::block_on(run_humble_op(
            humble,
            "humble_get_ownership_overrides",
            Vec::new(),
            "failed",
        ));
        assert_eq!(overrides, Ok(json!({})));
    }

    #[test]
    fn the_context_is_built_without_spawning_and_carries_the_shell_parts() {
        let home = FakeHome::new("humble-dispatch-build-");
        let emitter = Arc::new(RecordingEmitter::default());
        let log = Arc::new(RecordingLog::default());
        let ctx = build_ctx(
            Arc::new(StoreHost::new()),
            home.root(),
            Platform::Mac,
            emitter.clone(),
            log.clone(),
            Shutdown::new(),
        );
        assert_eq!(ctx.platform, Platform::Mac);
        assert_eq!(ctx.user_data, home.root());
        // Building touched neither the emitter, the log nor the disk.
        assert!(emitter.0.lock().unwrap().is_empty());
        assert!(log.0.lock().unwrap().is_empty());
        assert!(std::fs::read_dir(home.root()).unwrap().next().is_none());
    }

    /// D-94-15: the context carries the real HTTP client (no request is made by building it, a request
    /// to a closed loopback port is a transport error with no URL in it) and the host zone, which
    /// answers the offset the system applies at the instant asked.
    #[test]
    fn the_context_carries_the_http_client_and_the_host_zone() {
        let home = FakeHome::new("humble-http-zone-");
        let ctx = build_ctx(
            Arc::new(StoreHost::new()),
            home.root(),
            Platform::Linux,
            Arc::new(RecordingEmitter::default()),
            Arc::new(RecordingLog::default()),
            Shutdown::new(),
        );
        // The offset at an instant is what the log writer's lookup says, whole minutes, within a day.
        for instant in [0_i64, 1_782_864_000_000, 1_795_521_600_000] {
            let minutes = gamelib_log::SystemTz.offset_minutes(instant as u64);
            assert_eq!(ctx.local_zone().offset_east_secs_at(instant), minutes * 60);
            assert!(minutes.abs() <= 14 * 60);
        }
        // Before 1970 reads the 1970 offset; past 9999-12-01 reads the offset at that instant.
        assert_eq!(
            ctx.local_zone().offset_east_secs_at(-1_000_000_000_000),
            gamelib_log::SystemTz.offset_minutes(0) * 60
        );
        assert_eq!(
            ctx.local_zone().offset_east_secs_at(8_640_000_000_000_000),
            ctx.local_zone().offset_east_secs_at(ZONE_LOOKUP_LAST_MS)
        );
        // A request that cannot connect is an `HttpError` that names neither the URL nor its query.
        let port = {
            let probe = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            probe.local_addr().unwrap().port()
        };
        let request = gamelib_humble::http::Request::get(
            format!("http://127.0.0.1:{port}/api/v1/order/GKSECRET?key=SECRET-KEY"),
            std::time::Duration::from_secs(5),
        );
        let error = tauri::async_runtime::block_on(ctx.http.send(request)).unwrap_err();
        let text = error.to_string();
        assert!(
            !text.contains("GKSECRET") && !text.contains("SECRET-KEY"),
            "{text}"
        );
    }

    /// Every `(title, body)` and `(channel, args)` a [`ShellHumbleUi`] was asked for.
    type UiCalls = Arc<Mutex<Vec<String>>>;

    fn recording_ui() -> (ShellHumbleUi, UiCalls) {
        let calls: UiCalls = Arc::new(Mutex::new(Vec::new()));
        let (notified, sent) = (Arc::clone(&calls), Arc::clone(&calls));
        let ui = ShellHumbleUi::with_sinks(
            Box::new(move |title, body| {
                notified
                    .lock()
                    .unwrap()
                    .push(format!("notify {title}|{body}"));
            }),
            Box::new(move |channel, args| {
                sent.lock()
                    .unwrap()
                    .push(format!("sidecar {channel} {}", Value::Array(args)));
            }),
        );
        (ui, calls)
    }

    #[test]
    fn the_shell_ui_passes_a_notification_and_a_sidecar_frame_to_its_sinks_unchanged() {
        let (ui, calls) = recording_ui();
        ui.notify("Humble Bundle", "A key expires soon");
        ui.send_to_sidecar("humbleKeysUpdated", vec![json!([{ "n": 1 }])]);
        assert_eq!(
            *calls.lock().unwrap(),
            [
                "notify Humble Bundle|A key expires soon",
                "sidecar humbleKeysUpdated [[{\"n\":1}]]"
            ]
        );
    }

    #[test]
    fn the_context_carries_the_shell_ui_and_the_catalog() {
        let home = FakeHome::new("humble-dispatch-seams-");
        let (ui, calls) = recording_ui();
        let locales = home.root().join("locales").join("en");
        std::fs::create_dir_all(&locales).unwrap();
        std::fs::write(
            locales.join("gamelib.json"),
            "{\"humble\": {\"expiring\": \"{{title}} is expiring\"}}",
        )
        .unwrap();
        let mut ctx = build_ctx(
            Arc::new(StoreHost::new()),
            home.root(),
            Platform::Linux,
            Arc::new(RecordingEmitter::default()),
            Arc::new(RecordingLog::default()),
            Shutdown::new(),
        )
        .with_ui(Arc::new(ui));
        ctx.catalog = Some(load_catalog(&home.root().join("locales"), None));
        let catalog = ctx.catalog.as_ref().expect("the catalog was loaded");
        let params = json!({ "title": "Portal" }).as_object().cloned().unwrap();
        // A key in the bundle is rendered; one that is not falls back to its default.
        assert_eq!(
            catalog.t("gamelib:humble.expiring", "x", &params),
            "Portal is expiring"
        );
        assert_eq!(
            catalog.t("gamelib:humble.absent", "Hi {{title}}", &params),
            "Hi Portal"
        );
        let ui = ctx.ui.as_ref().expect("the ui was set");
        ui.notify("t", "b");
        assert_eq!(*calls.lock().unwrap(), ["notify t|b"]);
    }

    #[test]
    fn a_catalog_from_a_missing_folder_is_empty_and_never_fails() {
        let home = FakeHome::new("humble-dispatch-nocatalog-");
        let catalog = load_catalog(&home.root().join("no-such-locales"), Some("de"));
        let params = serde_json::Map::new();
        assert_eq!(
            catalog.t("any.key", "Default text", &params),
            "Default text"
        );
        // Loading read a folder that is not there and created nothing.
        assert!(std::fs::read_dir(home.root()).unwrap().next().is_none());
    }

    #[test]
    fn a_log_line_carries_its_level_in_the_prefix_the_shell_reads() {
        use gamelib_log::Level;
        assert_eq!(
            shell_log_level(&log_text("info", "sync started")),
            Level::Info
        );
        assert_eq!(
            shell_log_level(&log_text("warn", "sync denied")),
            Level::Warning
        );
        assert_eq!(
            shell_log_level(&log_text("error", "store unreadable")),
            Level::Error
        );
    }
}
