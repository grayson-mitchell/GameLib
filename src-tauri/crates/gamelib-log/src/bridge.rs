//! Crate diagnostics into the native writer (Phase 84, D-16, D-17, D-19).
//!
//! Two bridges feed one writer. [`LogLayer`] is a `tracing_subscriber::Layer` for crates that emit
//! `tracing` events (steam-vent, gamelib-steamcm, gamelib-depot); [`LogBridge`] is a `log::Log` for
//! crates that emit through the `log` facade (reqwest, via its own dependencies). Both map the
//! event's target onto the closed [`Prefix`] set by [`target_prefix`] and write through the global
//! logger, so a steam-vent heartbeat failure reads as `[WARNING]: [Steam]: ...` in `gamelib.log`.
//!
//! Level policy (D-16, amended by D-19): WARN and above by default; only the shell reading
//! `GAMELIB_LOG_LEVEL=debug` raises it to DEBUG (this crate reads no env: the caller passes the
//! [`CrateLevel`] in). TRACE never enters.
//!
//! No feedback loop: an event raised on the writer thread is dropped, so the writer can never be
//! the cause of its own next entry. [`install_bridges`] is first-call-wins and never panics.

use std::fmt::Write as _;
use std::sync::Arc;

use tracing::field::{Field, Visit};
use tracing::level_filters::LevelFilter;
use tracing::{Event, Metadata, Subscriber};
use tracing_subscriber::layer::{Context, Layer, SubscriberExt};
use tracing_subscriber::registry::LookupSpan;
use tracing_subscriber::Registry;

use crate::prefix::{Level, Prefix};
use crate::sanitize::escape_line_breaks;
use crate::writer::on_writer_thread;

/// How much of a crate's output enters the log.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CrateLevel {
    /// ERROR and WARN (the default).
    Warn,
    /// Adds INFO and DEBUG. TRACE still never enters.
    Debug,
}

/// `Debug` only for a case-insensitive `debug`; anything else, including no value, is `Warn`.
pub fn crate_level_from_env(value: Option<&str>) -> CrateLevel {
    match value {
        Some(v) if v.eq_ignore_ascii_case("debug") => CrateLevel::Debug,
        _ => CrateLevel::Warn,
    }
}

/// Crates whose events are Steam session or depot events.
const STEAM_TARGETS: [&str; 3] = ["steam_vent", "gamelib_steamcm", "gamelib_depot"];
/// Crates whose events are the shell's own.
const SHELL_TARGETS: [&str; 1] = ["gamelib_shell"];

/// True when `target` is `name` or a module path under it (`name::...`).
fn is_under(target: &str, name: &str) -> bool {
    target == name
        || target
            .strip_prefix(name)
            .is_some_and(|rest| rest.starts_with("::"))
}

/// The D-17 map: `steam_vent`, `gamelib_steamcm` and `gamelib_depot` are Steam, `gamelib_shell` is
/// Shell, everything else (gamelib_proc, gamelib_core, hyper, reqwest, rustls, h2, keyring) is
/// Backend. The match is on a module boundary, so `steam_ventilator` is Backend.
pub fn target_prefix(target: &str) -> Prefix {
    if STEAM_TARGETS.iter().any(|n| is_under(target, n)) {
        Prefix::Steam
    } else if SHELL_TARGETS.iter().any(|n| is_under(target, n)) {
        Prefix::Shell
    } else {
        Prefix::Backend
    }
}

/// Where a bridged line goes: the global logger in production, a recorder in tests.
pub type Sink = Arc<dyn Fn(Prefix, Level, &str) + Send + Sync>;

fn global_sink() -> Sink {
    Arc::new(crate::log)
}

fn tracing_level_enabled(level: CrateLevel, l: &tracing::Level) -> bool {
    match level {
        CrateLevel::Warn => *l <= tracing::Level::WARN,
        CrateLevel::Debug => *l <= tracing::Level::DEBUG,
    }
}

fn map_tracing_level(l: &tracing::Level) -> Level {
    if *l == tracing::Level::ERROR {
        Level::Error
    } else if *l == tracing::Level::WARN {
        Level::Warning
    } else if *l == tracing::Level::INFO {
        Level::Info
    } else {
        Level::Debug
    }
}

/// Renders an event's fields: the `message` field, then ` name=value` for every other field.
#[derive(Default)]
struct FieldRenderer {
    message: String,
    fields: String,
}

impl FieldRenderer {
    fn render(self) -> String {
        if self.message.is_empty() {
            self.fields.trim_start().to_string()
        } else {
            self.message + &self.fields
        }
    }
}

impl Visit for FieldRenderer {
    fn record_str(&mut self, field: &Field, value: &str) {
        if field.name() == "message" {
            self.message = value.to_string();
        } else {
            let _ = write!(self.fields, " {}={}", field.name(), value);
        }
    }

    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        if field.name() == "message" {
            self.message = format!("{value:?}");
        } else {
            let _ = write!(self.fields, " {}={:?}", field.name(), value);
        }
    }
}

/// A `tracing` layer that writes events at or above its level to the log as prefixed lines.
pub struct LogLayer {
    level: CrateLevel,
    sink: Sink,
}

impl LogLayer {
    /// Writes to the global logger.
    pub fn new(level: CrateLevel) -> Self {
        LogLayer {
            level,
            sink: global_sink(),
        }
    }

    /// Writes to `sink` (tests).
    pub fn with_sink(level: CrateLevel, sink: Sink) -> Self {
        LogLayer { level, sink }
    }
}

impl<S> Layer<S> for LogLayer
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    fn enabled(&self, metadata: &Metadata<'_>, _ctx: Context<'_, S>) -> bool {
        tracing_level_enabled(self.level, metadata.level())
    }

    fn max_level_hint(&self) -> Option<LevelFilter> {
        Some(match self.level {
            CrateLevel::Warn => LevelFilter::WARN,
            CrateLevel::Debug => LevelFilter::DEBUG,
        })
    }

    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        if on_writer_thread() {
            return;
        }
        let meta = event.metadata();
        let mut fields = FieldRenderer::default();
        event.record(&mut fields);
        (self.sink)(
            target_prefix(meta.target()),
            map_tracing_level(meta.level()),
            &escape_line_breaks(&fields.render()),
        );
    }
}

/// The `log` facade's counterpart of [`LogLayer`], for crates that emit `log` records.
pub struct LogBridge {
    level: CrateLevel,
    sink: Sink,
}

impl LogBridge {
    /// Writes to the global logger.
    pub fn new(level: CrateLevel) -> Self {
        LogBridge {
            level,
            sink: global_sink(),
        }
    }

    /// Writes to `sink` (tests).
    pub fn with_sink(level: CrateLevel, sink: Sink) -> Self {
        LogBridge { level, sink }
    }
}

fn log_level_enabled(level: CrateLevel, l: log::Level) -> bool {
    match level {
        CrateLevel::Warn => l <= log::Level::Warn,
        CrateLevel::Debug => l <= log::Level::Debug,
    }
}

fn map_log_level(l: log::Level) -> Level {
    match l {
        log::Level::Error => Level::Error,
        log::Level::Warn => Level::Warning,
        log::Level::Info => Level::Info,
        log::Level::Debug | log::Level::Trace => Level::Debug,
    }
}

impl log::Log for LogBridge {
    fn enabled(&self, metadata: &log::Metadata<'_>) -> bool {
        log_level_enabled(self.level, metadata.level())
    }

    fn log(&self, record: &log::Record<'_>) {
        if !self.enabled(record.metadata()) || on_writer_thread() {
            return;
        }
        (self.sink)(
            target_prefix(record.target()),
            map_log_level(record.level()),
            &escape_line_breaks(&record.args().to_string()),
        );
    }

    fn flush(&self) {}
}

/// Installs both bridges process-wide: a `tracing` `Registry` carrying a [`LogLayer`], and a
/// [`LogBridge`] as the `log` logger with `log::max_level` set to match. First call wins: returns
/// `false` (and never panics) when either global was already set, including by a second call.
pub fn install_bridges(level: CrateLevel) -> bool {
    let tracing_set =
        tracing::subscriber::set_global_default(Registry::default().with(LogLayer::new(level)))
            .is_ok();
    let log_set = log::set_boxed_logger(Box::new(LogBridge::new(level))).is_ok();
    if log_set {
        log::set_max_level(match level {
            CrateLevel::Warn => log::LevelFilter::Warn,
            CrateLevel::Debug => log::LevelFilter::Debug,
        });
    }
    tracing_set && log_set
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::writer::{mark_writer_thread, LogConfig, Logger, TzOffset};
    use gamelib_core::clock::Clock;
    use gamelib_core::paths::{join, Platform};
    use gamelib_testutil::FakeHome;
    use std::sync::Mutex;
    use std::time::Duration;

    type Seen = Arc<Mutex<Vec<(Prefix, Level, String)>>>;

    fn recorder() -> (Seen, Sink) {
        let seen: Seen = Arc::new(Mutex::new(Vec::new()));
        let writer = Arc::clone(&seen);
        let sink: Sink = Arc::new(move |p, l, m| {
            writer.lock().unwrap().push((p, l, m.to_string()));
        });
        (seen, sink)
    }

    fn with_layer<R>(level: CrateLevel, sink: Sink, f: impl FnOnce() -> R) -> R {
        let subscriber = Registry::default().with(LogLayer::with_sink(level, sink));
        tracing::subscriber::with_default(subscriber, f)
    }

    fn lines(seen: &Seen) -> Vec<(Prefix, Level, String)> {
        seen.lock().unwrap().clone()
    }

    fn record(target: &str, level: log::Level, msg: &str) -> (String, log::Level, String) {
        (target.to_string(), level, msg.to_string())
    }

    fn feed(bridge: &LogBridge, (target, level, msg): (String, log::Level, String)) {
        use log::Log;
        bridge.log(
            &log::Record::builder()
                .target(&target)
                .level(level)
                .args(format_args!("{msg}"))
                .build(),
        );
    }

    #[test]
    fn a_steam_vent_warning_keeps_its_message_and_renders_fields_after_it() {
        let (seen, sink) = recorder();
        with_layer(CrateLevel::Warn, sink, || {
            tracing::warn!(target: "steam_vent::connection", reason = "eof", "heartbeat failed");
        });
        assert_eq!(
            lines(&seen),
            vec![(
                Prefix::Steam,
                Level::Warning,
                "heartbeat failed reason=eof".to_string()
            )]
        );
    }

    #[test]
    fn non_string_fields_render_as_debug_after_the_message() {
        let (seen, sink) = recorder();
        with_layer(CrateLevel::Warn, sink, || {
            tracing::error!(target: "steam_vent::x", code = 5u32, retry = false, "logon refused");
        });
        assert_eq!(
            lines(&seen),
            vec![(
                Prefix::Steam,
                Level::Error,
                "logon refused code=5 retry=false".to_string()
            )]
        );
    }

    #[test]
    fn target_prefix_maps_the_closed_set_on_module_boundaries() {
        assert_eq!(target_prefix("steam_vent"), Prefix::Steam);
        assert_eq!(target_prefix("steam_vent::connection"), Prefix::Steam);
        assert_eq!(target_prefix("gamelib_steamcm::vent"), Prefix::Steam);
        assert_eq!(target_prefix("gamelib_depot::chunk"), Prefix::Steam);
        assert_eq!(target_prefix("gamelib_shell"), Prefix::Shell);
        assert_eq!(target_prefix("gamelib_shell::sidecar"), Prefix::Shell);
        assert_eq!(target_prefix("hyper_util::client"), Prefix::Backend);
        assert_eq!(target_prefix("reqwest::connect"), Prefix::Backend);
        assert_eq!(target_prefix("gamelib_proc::diag"), Prefix::Backend);
        assert_eq!(target_prefix("gamelib_core"), Prefix::Backend);
        assert_eq!(target_prefix("steam_ventilator"), Prefix::Backend);
        assert_eq!(target_prefix("steam_vent_proto::x"), Prefix::Backend);
        assert_eq!(target_prefix(""), Prefix::Backend);
    }

    #[test]
    fn crate_level_is_debug_only_for_a_case_insensitive_debug() {
        assert_eq!(crate_level_from_env(None), CrateLevel::Warn);
        assert_eq!(crate_level_from_env(Some("")), CrateLevel::Warn);
        assert_eq!(crate_level_from_env(Some("warn")), CrateLevel::Warn);
        assert_eq!(crate_level_from_env(Some("trace")), CrateLevel::Warn);
        assert_eq!(crate_level_from_env(Some("debug")), CrateLevel::Debug);
        assert_eq!(crate_level_from_env(Some("DeBuG")), CrateLevel::Debug);
    }

    #[test]
    fn a_debug_event_is_dropped_at_warn_and_kept_at_debug() {
        let (seen, sink) = recorder();
        with_layer(CrateLevel::Warn, sink, || {
            tracing::debug!(target: "steam_vent::x", "chatty");
            tracing::info!(target: "steam_vent::x", "also chatty");
        });
        assert!(lines(&seen).is_empty());

        let (seen, sink) = recorder();
        with_layer(CrateLevel::Debug, sink, || {
            tracing::debug!(target: "steam_vent::x", "chatty");
            tracing::info!(target: "steam_vent::x", "also chatty");
        });
        assert_eq!(
            lines(&seen),
            vec![
                (Prefix::Steam, Level::Debug, "chatty".to_string()),
                (Prefix::Steam, Level::Info, "also chatty".to_string()),
            ]
        );
    }

    #[test]
    fn trace_never_enters_even_at_debug() {
        let (seen, sink) = recorder();
        with_layer(CrateLevel::Debug, sink, || {
            tracing::trace!(target: "steam_vent::x", "very chatty");
        });
        assert!(lines(&seen).is_empty());
    }

    #[test]
    fn an_event_inside_a_span_at_debug_is_delivered() {
        let (seen, sink) = recorder();
        with_layer(CrateLevel::Debug, sink, || {
            let span = tracing::debug_span!(target: "steam_vent::x", "logon", attempt = 2u32);
            let _entered = span.enter();
            tracing::warn!(target: "steam_vent::x", "inside the span");
        });
        assert_eq!(
            lines(&seen),
            vec![(Prefix::Steam, Level::Warning, "inside the span".to_string())]
        );
    }

    #[test]
    fn a_tracing_event_raised_on_the_writer_thread_is_dropped() {
        let (seen, sink) = recorder();
        let on_writer = Arc::clone(&seen);
        std::thread::spawn(move || {
            mark_writer_thread();
            let subscriber = Registry::default().with(LogLayer::with_sink(CrateLevel::Warn, sink));
            tracing::subscriber::with_default(subscriber, || {
                tracing::error!(target: "steam_vent::x", "raised while writing");
            });
        })
        .join()
        .unwrap();
        assert!(lines(&on_writer).is_empty());
    }

    #[test]
    fn a_reqwest_warning_lands_as_a_backend_warning() {
        let (seen, sink) = recorder();
        let bridge = LogBridge::with_sink(CrateLevel::Warn, sink);
        feed(
            &bridge,
            record("reqwest::connect", log::Level::Warn, "dns error: refused"),
        );
        assert_eq!(
            lines(&seen),
            vec![(
                Prefix::Backend,
                Level::Warning,
                "dns error: refused".to_string()
            )]
        );
    }

    #[test]
    fn a_log_debug_record_is_dropped_at_warn_and_kept_at_debug() {
        let (seen, sink) = recorder();
        let bridge = LogBridge::with_sink(CrateLevel::Warn, sink);
        feed(
            &bridge,
            record(
                "reqwest::connect",
                log::Level::Debug,
                "starting new connection",
            ),
        );
        assert!(lines(&seen).is_empty());

        let (seen, sink) = recorder();
        let bridge = LogBridge::with_sink(CrateLevel::Debug, sink);
        feed(
            &bridge,
            record(
                "reqwest::connect",
                log::Level::Debug,
                "starting new connection",
            ),
        );
        assert_eq!(
            lines(&seen),
            vec![(
                Prefix::Backend,
                Level::Debug,
                "starting new connection".to_string()
            )]
        );
    }

    #[test]
    fn a_log_trace_record_is_always_dropped() {
        for level in [CrateLevel::Warn, CrateLevel::Debug] {
            let (seen, sink) = recorder();
            let bridge = LogBridge::with_sink(level, sink);
            feed(
                &bridge,
                record("reqwest::connect", log::Level::Trace, "wire dump"),
            );
            assert!(lines(&seen).is_empty(), "{level:?}");
        }
    }

    #[test]
    fn log_enabled_agrees_with_the_level() {
        use log::Log;
        let meta = |l| log::Metadata::builder().level(l).target("reqwest").build();
        let warn = LogBridge::with_sink(CrateLevel::Warn, recorder().1);
        assert!(warn.enabled(&meta(log::Level::Error)));
        assert!(warn.enabled(&meta(log::Level::Warn)));
        assert!(!warn.enabled(&meta(log::Level::Info)));
        assert!(!warn.enabled(&meta(log::Level::Debug)));
        let debug = LogBridge::with_sink(CrateLevel::Debug, recorder().1);
        assert!(debug.enabled(&meta(log::Level::Info)));
        assert!(debug.enabled(&meta(log::Level::Debug)));
        assert!(!debug.enabled(&meta(log::Level::Trace)));
    }

    #[test]
    fn a_log_record_on_the_writer_thread_is_dropped() {
        let (seen, sink) = recorder();
        let on_writer = Arc::clone(&seen);
        std::thread::spawn(move || {
            mark_writer_thread();
            let bridge = LogBridge::with_sink(CrateLevel::Warn, sink);
            feed(
                &bridge,
                record(
                    "reqwest::connect",
                    log::Level::Error,
                    "raised while writing",
                ),
            );
        })
        .join()
        .unwrap();
        assert!(lines(&on_writer).is_empty());
    }

    #[test]
    fn a_bridged_message_with_line_breaks_is_written_on_one_line() {
        // WR-02 (writer half): text a crate echoes from a server can carry CR/LF, and a raw one
        // would start a forged second line in the file users upload.
        let (seen, sink) = recorder();
        with_layer(CrateLevel::Warn, sink, || {
            tracing::warn!(target: "steam_vent::x", k = "v\r\nw", "a\nb");
        });
        assert_eq!(
            lines(&seen),
            vec![(
                Prefix::Steam,
                Level::Warning,
                "a\\nb k=v\\r\\nw".to_string()
            )]
        );

        let (seen, sink) = recorder();
        let bridge = LogBridge::with_sink(CrateLevel::Warn, sink);
        feed(&bridge, record("reqwest::x", log::Level::Error, "x\r\ny"));
        assert_eq!(
            lines(&seen),
            vec![(Prefix::Backend, Level::Error, "x\\r\\ny".to_string())]
        );
    }

    #[test]
    fn install_bridges_sets_the_log_ceiling_and_a_second_call_returns_false() {
        // The only test in this crate that touches the process-global subscriber and logger; every
        // other test scopes its subscriber with `with_default` or drives `LogBridge::log` directly.
        assert!(install_bridges(CrateLevel::Warn));
        assert_eq!(log::max_level(), log::LevelFilter::Warn);
        assert!(!install_bridges(CrateLevel::Debug));
        assert_eq!(log::max_level(), log::LevelFilter::Warn);
    }

    struct FixedClock;
    impl Clock for FixedClock {
        fn now_ms(&self) -> u64 {
            // 2026-11-20 13:05:09 at UTC+13.
            1_795_133_109_000
        }
    }

    struct FixedTz;
    impl TzOffset for FixedTz {
        fn offset_minutes(&self, _epoch_ms: u64) -> i32 {
            780
        }
    }

    #[test]
    fn a_bridged_steam_vent_warning_reaches_gamelib_log_as_a_formatted_steam_line() {
        let home = FakeHome::new("gamelib-log-bridge-");
        let root = home.root().to_string_lossy().into_owned();
        let logger = Arc::new(Logger::start(LogConfig {
            platform: Platform::current(),
            user_data: join(Platform::current(), &root, &["userData"]),
            log_dir: root.clone(),
            clock: Arc::new(FixedClock),
            tz: Arc::new(FixedTz),
        }));
        let to_logger = Arc::clone(&logger);
        let sink: Sink = Arc::new(move |p, l, m| to_logger.log(p, l, m));
        with_layer(CrateLevel::Warn, sink, || {
            tracing::warn!(target: "steam_vent::connection", reason = "eof", "heartbeat failed");
        });
        assert!(logger.flush(Duration::from_secs(10)), "flush timed out");
        let written = std::fs::read_to_string(join(Platform::current(), &root, &["gamelib.log"]))
            .expect("gamelib.log was written");
        assert_eq!(
            written,
            "(13:05:09) [WARNING]: [Steam]:           heartbeat failed reason=eof\n"
        );
    }
}
