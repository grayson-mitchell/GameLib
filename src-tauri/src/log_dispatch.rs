//! The renderer's log channels, served natively (Phase 84, FND-05): `logError`, `logInfo`,
//! `showLogFileInFolder` and `getLogContent`.
//!
//! A renderer log message used to travel renderer -> shell -> sidecar -> shell and was escaped
//! (CR and LF) in the sidecar. It now stops in Rust: the shell validates the one argument on the
//! caller's thread, a worker of the `logger` slice formats it with
//! `gamelib_log::sanitize::renderer_body` (the Rust-at-write sanitiser, criterion 1) and writes it
//! as a `Prefix::Frontend` line through the native writer.
//!
//! `showLogFileInFolder` and `getLogContent` take a typed descriptor, never a path (D-08, V12):
//! [`parse_log_file_args`] decodes it strictly and the file is resolved only through
//! `gamelib_core::paths::log_file`, which refuses a traversal.
//!
//! D-07 (Phase 83): the Rust shapes are the schema authority, pinned by the valid and invalid
//! vectors in `src/common/types/ipc/nativeChannels.json`.

use crate::native_router::{invalid_args, NativeCtx, NativeFuture, SendPayload};
use gamelib_core::paths::{log_file, GameLogType, LogRunner, LogTarget, Platform};
use gamelib_log::sanitize::{renderer_body, RendererMessage};
use gamelib_log::{Level, Logger, Prefix};
use serde_json::Value;
use std::io::ErrorKind;
use std::path::Path;
use std::sync::Arc;

/// Decode the args of a renderer log send: exactly one argument, a string, an array of strings or
/// a strict `{name?, message?, stack?}` object of strings. The `Err` is a fixed category literal
/// and never the message: a renderer string can reach a log a user attaches to a bug report.
pub(crate) fn parse_renderer_log(
    level: Level,
    args: &[Value],
) -> Result<SendPayload, &'static str> {
    let [arg] = args else {
        return Err("bad-arity");
    };
    let message =
        serde_json::from_value::<RendererMessage>(arg.clone()).map_err(|_| "bad-shape")?;
    Ok(SendPayload::RendererLog { level, message })
}

/// The `logError` validator (a `SendValidator` is a plain fn pointer, so it cannot carry a level).
pub(crate) fn parse_log_error(args: &[Value]) -> Result<SendPayload, &'static str> {
    parse_renderer_log(Level::Error, args)
}

/// The `logInfo` validator.
pub(crate) fn parse_log_info(args: &[Value]) -> Result<SendPayload, &'static str> {
    parse_renderer_log(Level::Info, args)
}

/// Write one sanitised renderer line through `logger`.
fn write_renderer_log(logger: &Logger, level: Level, message: &RendererMessage) {
    logger.log(Prefix::Frontend, level, &renderer_body(message));
}

/// Write one renderer log line through the process-wide native writer. Does nothing when the
/// writer was not started (no home directory), exactly as the sidecar's frames are dropped then.
pub(crate) fn log_from_renderer(level: Level, message: &RendererMessage) {
    if let Some(logger) = gamelib_log::global() {
        write_renderer_log(logger, level, message);
    }
}

/// Decode a `GetLogFileArgs` descriptor, strictly (D-07): `{}` is the general log, `{runner}` a
/// runner log (any of the six runners, comet included), `{appName, runner, type?}` a game log
/// (comet has none; `type` defaults to launch). Any other key, value type or combination is an
/// error, and so is a game target [`log_file`] would refuse (a traversal, a separator, a NUL).
pub(crate) fn parse_log_file_args(v: &Value) -> Result<LogTarget, &'static str> {
    let obj = v.as_object().ok_or("bad-shape")?;
    if obj
        .keys()
        .any(|k| !matches!(k.as_str(), "appName" | "runner" | "type"))
    {
        return Err("bad-shape");
    }
    let text = |key: &str| -> Result<Option<&str>, &'static str> {
        match obj.get(key) {
            None => Ok(None),
            Some(Value::String(s)) => Ok(Some(s.as_str())),
            Some(_) => Err("bad-shape"),
        }
    };
    let (app_name, runner, kind) = (text("appName")?, text("runner")?, text("type")?);
    let target = match (app_name, runner, kind) {
        (None, None, None) => LogTarget::General,
        (None, Some(r), None) => LogTarget::Runner(LogRunner::from_str(r).ok_or("bad-runner")?),
        (Some(app_name), Some(r), kind) => LogTarget::Game {
            app_name: app_name.to_string(),
            runner: LogRunner::from_str(r).ok_or("bad-runner")?,
            kind: match kind {
                None => GameLogType::Launch,
                Some(k) => GameLogType::from_str(k).ok_or("bad-type")?,
            },
        },
        _ => return Err("bad-shape"),
    };
    // The same resolver the handlers use, on dummy directories: it rejects exactly the game targets
    // that could not become a path.
    log_file(Platform::Linux, "/l", "/u", &target).map_err(|_| "bad-target")?;
    Ok(target)
}

/// The `showLogFileInFolder` validator: exactly one `GetLogFileArgs` argument.
pub(crate) fn parse_show_log_file(args: &[Value]) -> Result<SendPayload, &'static str> {
    let [arg] = args else {
        return Err("bad-arity");
    };
    parse_log_file_args(arg).map(SendPayload::Reveal)
}

/// The file `target` names, resolved only through `gamelib_core::paths::log_file`. `None` when the
/// shell has no log directory or the target does not resolve.
fn resolve_log_file(ctx: &NativeCtx, target: &LogTarget) -> Option<String> {
    let paths = ctx.log_paths.as_ref()?;
    log_file(paths.platform, &paths.log_dir, &paths.user_data, target).ok()
}

/// The `showLogFileInFolder` job: reveal the resolved file, only if it exists (parity with the TS
/// `existsSync` guard). The reveal itself runs on the host's hand-off thread, never this worker.
pub(crate) fn show_log_file(ctx: &NativeCtx, target: &LogTarget) {
    let Some(path) = resolve_log_file(ctx, target) else {
        return;
    };
    if Path::new(&path).exists() {
        ctx.host.reveal_path(path);
    }
}

/// Read one log file as lossy UTF-8; a missing file is an empty string.
fn read_log_lossy(path: &str) -> Result<String, String> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(String::from_utf8_lossy(&bytes).into_owned()),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(String::new()),
        // Fixed text: the error's own message can carry the path.
        Err(_) => Err("getLogContent: the log file could not be read".to_string()),
    }
}

/// `getLogContent` (invoke): the content of the log a descriptor names. Bad args return the
/// INVALID_ARGS marker; the read runs on the blocking pool, off the async runtime.
pub(crate) fn get_log_content(ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(async move {
        let target = match args.as_slice() {
            [arg] => parse_log_file_args(arg)
                .map_err(|_| invalid_args("getLogContent", &["0"], &["invalid_union"]))?,
            _ => {
                return Err(invalid_args(
                    "getLogContent",
                    &["(args)"],
                    &["invalid_type"],
                ))
            }
        };
        let Some(path) = resolve_log_file(&ctx, &target) else {
            return Ok(Value::String(String::new()));
        };
        tauri::async_runtime::spawn_blocking(move || read_log_lossy(&path))
            .await
            .map_err(|_| "getLogContent: the read did not finish".to_string())?
            .map(Value::String)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::native_router::{LogPaths, NativeHost, NativeRouter};
    use gamelib_core::clock::Clock;
    use gamelib_core::paths::{join, Platform};
    use gamelib_core::shutdown::Shutdown;
    use gamelib_log::writer::{LogConfig, TzOffset};
    use gamelib_testutil::FakeHome;
    use serde_json::json;
    use std::sync::mpsc::{channel, Receiver, Sender};
    use std::sync::Arc;
    use std::time::Duration;

    struct FixedClock;
    impl Clock for FixedClock {
        fn now_ms(&self) -> u64 {
            1_795_133_109_000
        }
    }

    struct FixedTz;
    impl TzOffset for FixedTz {
        fn offset_minutes(&self, _epoch_ms: u64) -> i32 {
            780
        }
    }

    fn logger_on(home: &FakeHome) -> Logger {
        let root = home.root().to_string_lossy().into_owned();
        Logger::start(LogConfig {
            platform: Platform::current(),
            user_data: join(Platform::current(), &root, &["userData"]),
            log_dir: root,
            clock: Arc::new(FixedClock),
            tz: Arc::new(FixedTz),
        })
    }

    fn general_log(home: &FakeHome) -> String {
        let path = join(
            Platform::current(),
            &home.root().to_string_lossy(),
            &["gamelib.log"],
        );
        std::fs::read_to_string(path).unwrap_or_default()
    }

    fn payload(level: Level, args: Vec<Value>) -> RendererMessage {
        match parse_renderer_log(level, &args) {
            Ok(SendPayload::RendererLog { message, .. }) => message,
            other => panic!("expected a renderer log payload, got {other:?}"),
        }
    }

    #[test]
    fn log_error_and_log_info_share_one_validator_and_differ_only_by_level() {
        let args = [json!("boom")];
        assert_eq!(
            parse_log_error(&args),
            Ok(SendPayload::RendererLog {
                level: Level::Error,
                message: RendererMessage::Text("boom".to_string()),
            })
        );
        assert_eq!(
            parse_log_info(&args),
            Ok(SendPayload::RendererLog {
                level: Level::Info,
                message: RendererMessage::Text("boom".to_string()),
            })
        );
    }

    #[test]
    fn log_validator_accepts_the_three_shapes_and_rejects_everything_else() {
        for ok in [
            vec![json!("x")],
            vec![json!(["a", "b"])],
            vec![json!({"name": "E", "message": "m", "stack": "s"})],
            vec![json!({})],
        ] {
            assert!(parse_log_error(&ok).is_ok(), "{ok:?} must be accepted");
        }
        for bad in [
            vec![],
            vec![Value::Null],
            vec![json!(7)],
            vec![json!(["a", 1])],
            vec![json!({"extra": "x"})],
            vec![json!({"message": 1})],
            vec![json!("a"), json!("b")],
        ] {
            assert!(parse_log_error(&bad).is_err(), "{bad:?} must be rejected");
        }
    }

    #[test]
    fn log_validator_error_is_a_fixed_category_and_never_the_message() {
        let secret = "SENTINEL-token-9f3a";
        for args in [
            vec![json!({"extra": secret})],
            vec![json!([secret, 1])],
            vec![json!(secret), json!(secret)],
        ] {
            let err = parse_log_error(&args).unwrap_err();
            assert!(["bad-arity", "bad-shape"].contains(&err), "{err}");
        }
    }

    #[test]
    fn log_renderer_error_line_is_sanitised_and_prefixed_frontend() {
        let home = FakeHome::new("gamelib-log-dispatch-");
        let logger = logger_on(&home);
        // The IN-04 forge string: a CR/LF pair that would start a fake second line.
        let message = payload(Level::Error, vec![json!("real\r\n[ERROR] forged")]);
        write_renderer_log(&logger, Level::Error, &message);
        assert!(logger.flush(Duration::from_secs(10)));
        let text = general_log(&home);
        assert_eq!(text.lines().count(), 1, "a forged second line: {text:?}");
        assert!(text.contains("ERROR"), "{text}");
        assert!(text.contains("[Frontend]"), "{text}");
        assert!(text.contains("real\\r\\n[ERROR] forged"), "{text}");
    }

    #[test]
    fn log_renderer_info_line_is_written_at_info() {
        let home = FakeHome::new("gamelib-log-dispatch-");
        let logger = logger_on(&home);
        write_renderer_log(
            &logger,
            Level::Info,
            &payload(Level::Info, vec![json!(["a", "b"])]),
        );
        assert!(logger.flush(Duration::from_secs(10)));
        let text = general_log(&home);
        assert!(text.contains("INFO"), "{text}");
        assert!(text.contains("[Frontend]"), "{text}");
    }

    // ---- showLogFileInFolder and getLogContent ----

    /// A host that reports every reveal (and never opens anything).
    struct RevealHost {
        tx: Sender<String>,
    }

    impl NativeHost for RevealHost {
        fn open_url(&self, _url: String) {}

        fn reveal_path(&self, path: String) {
            let _ = self.tx.send(path);
        }
    }

    fn log_paths_of(home: &FakeHome) -> LogPaths {
        let root = home.root().to_string_lossy().into_owned();
        LogPaths {
            platform: Platform::current(),
            user_data: join(Platform::current(), &root, &["userData"]),
            log_dir: join(Platform::current(), &root, &["logs"]),
        }
    }

    fn ctx_on(home: &FakeHome) -> (Arc<NativeCtx>, Receiver<String>) {
        let (tx, rx) = channel();
        let ctx = Arc::new(NativeCtx::for_tests(
            Arc::new(RevealHost { tx }),
            Some(log_paths_of(home)),
        ));
        (ctx, rx)
    }

    /// Writes `bytes` to `<log_dir>/<parts...>` and returns that path.
    fn seed(home: &FakeHome, parts: &[&str], bytes: &[u8]) -> String {
        let dir = log_paths_of(home).log_dir;
        let path = join(Platform::current(), &dir, parts);
        std::fs::create_dir_all(Path::new(&path).parent().expect("a parent")).expect("mkdir");
        std::fs::write(&path, bytes).expect("seed a log file");
        path
    }

    fn content_of(ctx: &Arc<NativeCtx>, arg: Value) -> Result<Value, String> {
        tauri::async_runtime::block_on(get_log_content(Arc::clone(ctx), vec![arg]))
    }

    #[test]
    fn log_file_args_accept_the_three_shapes_and_default_the_game_log_to_launch() {
        assert_eq!(parse_log_file_args(&json!({})), Ok(LogTarget::General));
        assert_eq!(
            parse_log_file_args(&json!({"runner": "comet"})),
            Ok(LogTarget::Runner(LogRunner::Comet))
        );
        assert_eq!(
            parse_log_file_args(&json!({"appName": "480", "runner": "steam"})),
            Ok(LogTarget::Game {
                app_name: "480".to_string(),
                runner: LogRunner::Steam,
                kind: GameLogType::Launch,
            })
        );
        assert_eq!(
            parse_log_file_args(&json!({"appName": "480", "runner": "gog", "type": "setup"})),
            Ok(LogTarget::Game {
                app_name: "480".to_string(),
                runner: LogRunner::Gog,
                kind: GameLogType::Setup,
            })
        );
    }

    #[test]
    fn log_file_args_reject_every_other_shape() {
        for bad in [
            json!(null),
            json!("x"),
            json!([]),
            json!({"runner": "epic"}),
            json!({"appName": "a", "runner": "comet"}),
            json!({"appName": "a", "runner": "gog", "type": "crash"}),
            json!({"appName": "abc"}),
            json!({"appName": "", "runner": "gog"}),
            json!({"type": "launch"}),
            json!({"runner": "gog", "type": "launch"}),
            json!({"extra": 1}),
            json!({"runner": null}),
            json!({"appName": 7, "runner": "gog"}),
            json!({"appName": "../x", "runner": "steam"}),
            json!({"appName": "a/b", "runner": "steam"}),
            json!({"appName": "a\\b", "runner": "steam"}),
            json!({"appName": "a\u{0}b", "runner": "steam"}),
        ] {
            assert!(parse_log_file_args(&bad).is_err(), "{bad} must be rejected");
        }
    }

    #[test]
    fn log_rejection_line_names_the_channel_and_never_a_message() {
        let secret = "SENTINEL-token-9f3a";
        let router = NativeRouter::with_shutdown(
            Arc::new(NativeCtx::for_tests(
                Arc::new(RevealHost { tx: channel().0 }),
                None,
            )),
            Shutdown::new(),
        );
        // A rejected send is dropped with Ok (D-03), exactly as the sidecar dropped one.
        assert_eq!(
            router.route_send("logError", &[json!({"message": secret, "extra": secret})]),
            Some(Ok(()))
        );
        let line = crate::native_router::rejection_line("logError");
        assert_eq!(line, "[shell] native send rejected: logError");
        assert!(!line.contains(secret));
    }

    #[test]
    fn log_fifty_renderer_errors_reach_the_log_in_send_order() {
        let home = FakeHome::new("gamelib-log-dispatch-");
        let logger = Arc::new(logger_on(&home));
        let writer = Arc::clone(&logger);
        let queue = crate::native_router::spawn_slice_worker(
            "logger-order-test",
            Shutdown::new(),
            move |job| {
                if let SendPayload::RendererLog { level, message } = job.payload {
                    write_renderer_log(&writer, level, &message);
                }
                Ok(())
            },
        );
        for i in 0..50 {
            let payload = parse_log_error(&[json!(format!("renderer-line-{i:02}"))]).unwrap();
            queue
                .enqueue(crate::native_router::NativeSendJob {
                    channel: "logError",
                    payload,
                })
                .unwrap();
        }
        // The worker drains in order; wait for the last line to land.
        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        loop {
            assert!(logger.flush(Duration::from_secs(10)));
            if general_log(&home).contains("renderer-line-49") {
                break;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "the 50th line never landed"
            );
            std::thread::sleep(Duration::from_millis(20));
        }
        let text = general_log(&home);
        let order: Vec<usize> = (0..50)
            .map(|i| {
                text.find(&format!("renderer-line-{i:02}"))
                    .expect("line present")
            })
            .collect();
        assert!(order.windows(2).all(|w| w[0] < w[1]), "lines out of order");
    }

    #[test]
    fn log_enqueue_behind_a_blocked_logger_handler_returns_at_once() {
        let (release_tx, release_rx) = channel::<()>();
        let queue = crate::native_router::spawn_slice_worker(
            "logger-block-test",
            Shutdown::new(),
            move |_job| {
                let _ = release_rx.recv();
                Ok(())
            },
        );
        let started = std::time::Instant::now();
        for i in 0..3 {
            let payload = parse_log_info(&[json!(format!("line {i}"))]).unwrap();
            queue
                .enqueue(crate::native_router::NativeSendJob {
                    channel: "logInfo",
                    payload,
                })
                .unwrap();
        }
        assert!(started.elapsed() < Duration::from_millis(500));
        for _ in 0..3 {
            let _ = release_tx.send(());
        }
    }

    /// Route a show send and report what the host was asked to reveal, if anything.
    fn revealed_after(router: &NativeRouter, rx: &Receiver<String>, arg: Value) -> Option<String> {
        assert_eq!(
            router.route_send("showLogFileInFolder", &[arg]),
            Some(Ok(()))
        );
        rx.recv_timeout(Duration::from_millis(400)).ok()
    }

    #[test]
    fn log_show_reveals_an_existing_runner_log_by_its_rust_resolved_path() {
        let home = FakeHome::new("gamelib-log-dispatch-");
        let path = seed(&home, &["runners", "legendary.log"], b"x");
        let (ctx, rx) = ctx_on(&home);
        let router = NativeRouter::with_shutdown(ctx, Shutdown::new());
        assert_eq!(
            revealed_after(&router, &rx, json!({"runner": "legendary"})),
            Some(path)
        );
    }

    #[test]
    fn log_show_reveals_a_game_log_and_defaults_to_the_launch_log() {
        let home = FakeHome::new("gamelib-log-dispatch-");
        let path = seed(&home, &["games", "480_steam", "launch.log"], b"x");
        let (ctx, rx) = ctx_on(&home);
        let router = NativeRouter::with_shutdown(ctx, Shutdown::new());
        assert_eq!(
            revealed_after(&router, &rx, json!({"appName": "480", "runner": "steam"})),
            Some(path)
        );
    }

    #[test]
    fn log_show_for_a_missing_file_reveals_nothing() {
        let home = FakeHome::new("gamelib-log-dispatch-");
        let (ctx, rx) = ctx_on(&home);
        let router = NativeRouter::with_shutdown(ctx, Shutdown::new());
        assert_eq!(revealed_after(&router, &rx, json!({"runner": "gog"})), None);
        assert_eq!(revealed_after(&router, &rx, json!({})), None);
    }

    #[test]
    fn log_show_with_a_traversal_name_never_calls_reveal_path() {
        let home = FakeHome::new("gamelib-log-dispatch-");
        // A file the traversal would reach if it were joined into a path.
        seed(&home, &["x_steam", "launch.log"], b"secret");
        let (ctx, rx) = ctx_on(&home);
        let router = NativeRouter::with_shutdown(ctx, Shutdown::new());
        for name in ["../x", "..", "a/../b", "..\\x"] {
            let arg = json!({"appName": name, "runner": "steam"});
            assert_eq!(revealed_after(&router, &rx, arg), None, "{name}");
        }
        // The job-level path refuses it too, should a payload ever be built by hand.
        let hostile = LogTarget::Game {
            app_name: "../x".to_string(),
            runner: LogRunner::Steam,
            kind: GameLogType::Launch,
        };
        let (ctx, rx) = ctx_on(&home);
        show_log_file(&ctx, &hostile);
        assert!(rx.recv_timeout(Duration::from_millis(200)).is_err());
    }

    #[test]
    fn log_get_content_of_a_missing_file_is_the_empty_string() {
        let home = FakeHome::new("gamelib-log-dispatch-");
        let (ctx, _rx) = ctx_on(&home);
        assert_eq!(content_of(&ctx, json!({})), Ok(json!("")));
        assert_eq!(
            content_of(&ctx, json!({"appName": "480", "runner": "steam"})),
            Ok(json!(""))
        );
    }

    #[test]
    fn log_get_content_returns_a_game_log_exactly() {
        let home = FakeHome::new("gamelib-log-dispatch-");
        seed(
            &home,
            &["games", "480_steam", "install.log"],
            b"line one\nline two\n",
        );
        let (ctx, _rx) = ctx_on(&home);
        assert_eq!(
            content_of(
                &ctx,
                json!({"appName": "480", "runner": "steam", "type": "install"})
            ),
            Ok(json!("line one\nline two\n"))
        );
    }

    #[test]
    fn log_get_content_of_invalid_utf8_is_the_lossy_text() {
        let home = FakeHome::new("gamelib-log-dispatch-");
        seed(&home, &["gamelib.log"], b"ok \xff\xfe tail");
        let (ctx, _rx) = ctx_on(&home);
        assert_eq!(
            content_of(&ctx, json!({})),
            Ok(json!("ok \u{FFFD}\u{FFFD} tail"))
        );
    }

    #[test]
    fn log_get_content_bad_args_return_the_invalid_args_marker_without_the_value() {
        let home = FakeHome::new("gamelib-log-dispatch-");
        seed(&home, &["x_steam", "launch.log"], b"secret");
        let (ctx, _rx) = ctx_on(&home);
        let sentinel = "SENTINEL-traversal-9f3a";
        for arg in [
            json!({"appName": format!("../{sentinel}"), "runner": "steam"}),
            json!({"runner": "epic"}),
            json!("x"),
        ] {
            let err = content_of(&ctx, arg).unwrap_err();
            assert!(
                err.starts_with(crate::ipc_contract::IPC_INVALID_ARGS_MARKER),
                "{err}"
            );
            assert!(!err.contains(sentinel), "{err}");
        }
        let none = tauri::async_runtime::block_on(get_log_content(Arc::clone(&ctx), vec![]));
        assert!(none
            .unwrap_err()
            .starts_with(crate::ipc_contract::IPC_INVALID_ARGS_MARKER));
    }
}
