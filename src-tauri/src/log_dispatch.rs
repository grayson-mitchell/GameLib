//! The renderer's log channels, served natively (Phase 84, FND-05): `logError` and `logInfo`.
//!
//! A renderer log message used to travel renderer -> shell -> sidecar -> shell and was escaped
//! (CR and LF) in the sidecar. It now stops in Rust: the shell validates the one argument on the
//! caller's thread, a worker of the `logger` slice formats it with
//! `gamelib_log::sanitize::renderer_body` (the Rust-at-write sanitiser, criterion 1) and writes it
//! as a `Prefix::Frontend` line through the native writer.
//!
//! D-07 (Phase 83): the serde shape of `RendererMessage` is the schema authority, pinned by the
//! valid and invalid vectors in `src/common/types/ipc/nativeChannels.json`.

use crate::native_router::SendPayload;
use gamelib_log::sanitize::{renderer_body, RendererMessage};
use gamelib_log::{Level, Logger, Prefix};
use serde_json::Value;

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

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_core::clock::Clock;
    use gamelib_core::paths::{join, Platform};
    use gamelib_log::writer::{LogConfig, TzOffset};
    use gamelib_testutil::FakeHome;
    use serde_json::json;
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
}
