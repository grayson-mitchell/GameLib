//! What every op is handed. The crate reads no environment variable and no profile path of its own:
//! the shell builds one `HumbleCtx` and every op takes `&HumbleCtx`. Later plans add fields.

use std::path::PathBuf;
use std::sync::Arc;

use gamelib_core::clock::Clock;
use gamelib_core::emitter::FrontendEmitter;
use gamelib_core::shutdown::Shutdown;
use gamelib_i18n::Catalog;
use gamelib_store::host::StoreHost;
use serde_json::Value;

use crate::http::Http;
use crate::js_date::LocalZone;
use crate::secrets::{HumbleSecretSource, HumbleSecrets, UnavailableSecretSource};

/// The platform the app runs on, as the shell reports it (the crate never asks the OS).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    Mac,
    Linux,
    Windows,
}

/// The host's local time zone, as the shell reads it: the UTC offset in force at an instant. The crate
/// reads no tz database, so [`LocalZone::Host`] resolves a local time against this lookup per ECMA-262
/// `UTC(t)`. It is asked about instants near each local time (a day either side), so a daylight-saving
/// host is exact on both sides of a change, and a date read in winter gets the winter offset whatever
/// the season of the sync.
pub trait HostZone: Send + Sync + 'static {
    /// Seconds east of UTC that apply at `utc_ms` (milliseconds since the epoch).
    fn offset_east_secs_at(&self, utc_ms: i64) -> i32;
}

/// The zone a context gets until the shell's is wired in: UTC, whatever the host. Also what a golden
/// replay uses, since the recorded cases carry their zone themselves.
#[derive(Debug, Default, Clone, Copy)]
pub struct UtcZone;

impl HostZone for UtcZone {
    fn offset_east_secs_at(&self, _utc_ms: i64) -> i32 {
        0
    }
}

/// The emitter a context gets until the shell's is wired in: the push goes nowhere.
#[derive(Debug, Default, Clone, Copy)]
pub struct NullEmitter;

impl FrontendEmitter for NullEmitter {
    fn emit(&self, _channel: &str, _args: Vec<Value>) {}
}

/// The crate's diagnostic lines. A line is FIXED text: an op name, a short tag or a count. It never
/// carries a URL, a cookie, a header, a key value, an order id or a profile path (T-94-24, and the
/// same rule as `gamelib-info`'s log), so the shell can write every line to `gamelib.log`.
pub trait HumbleLog: Send + Sync + 'static {
    fn info(&self, line: &str);
    fn warn(&self, line: &str);
    fn error(&self, line: &str);
}

/// What an op says to the user and to the sidecar, as a seam the shell implements. The crate has no
/// window or notification API of its own; [`HumbleCtx::ui`] is `None` for a headless run, which then
/// notifies nobody and writes to no sidecar.
pub trait HumbleUi: Send + Sync + 'static {
    /// A system notification: no window raise, no modal.
    fn notify(&self, title: &str, body: &str);

    /// A `kind: "send"` frame for the sidecar over its IPC channel (a Rust op telling a TypeScript
    /// owner that state moved). Dropped when there is no sidecar.
    fn send_to_sidecar(&self, channel: &str, args: Vec<Value>);
}

/// Everything an op needs from outside the crate. Fields are public so the shell can fill the ones a
/// later plan adds; [`HumbleCtx::new`] gives each a neutral default.
pub struct HumbleCtx {
    /// The one owner of every store file (Phase 85). A store is opened through it, never by file I/O
    /// of this crate's own.
    pub host: Arc<StoreHost>,
    /// The folder the store files sit under: `<user_data>/store_cache/...` and
    /// `<user_data>/humble_store/config.json`.
    pub user_data: PathBuf,
    pub clock: Arc<dyn Clock>,
    pub platform: Platform,
    /// In-flight ops hold a registrant of this and race its token (D-20).
    pub shutdown: Shutdown,
    /// What reaches the renderer: a frontend message pushed from Rust. [`NullEmitter`] until the
    /// shell's is wired in.
    pub emitter: Arc<dyn FrontendEmitter>,
    /// The diagnostic log; `None` is silent (a headless run).
    pub log: Option<Arc<dyn HumbleLog>>,
    /// Notifications and sidecar frames; `None` is silent (a headless run).
    pub ui: Option<Arc<dyn HumbleUi>>,
    /// The i18n catalog notice text is rendered through; `None` renders each notice's default text.
    pub catalog: Option<Arc<Catalog>>,
    /// Every HTTP request this crate makes (Humble and the Steam store search). The shell passes
    /// `ReqwestHttp`; a test passes a `Replay` pinned to the TypeScript's recorded requests.
    pub http: Arc<dyn Http>,
    /// The host's time zone lookup: what the classifier reads a zone-less or date-only expiry in, at
    /// the offset in force on that expiry's own date (see [`HumbleCtx::local_zone`]).
    pub zone: Arc<dyn HostZone>,
    /// The session cookie and CSRF token owner (D-18): the cache, dedupe and failure memo over the
    /// shell's Keychain (or dev vault) source. [`UnavailableSecretSource`] until the shell's is wired in.
    pub secrets: Arc<HumbleSecrets>,
}

impl HumbleCtx {
    pub fn new(
        host: Arc<StoreHost>,
        user_data: PathBuf,
        clock: Arc<dyn Clock>,
        platform: Platform,
        shutdown: Shutdown,
        http: Arc<dyn Http>,
    ) -> HumbleCtx {
        HumbleCtx {
            host,
            user_data,
            clock,
            platform,
            shutdown,
            emitter: Arc::new(NullEmitter),
            log: None,
            ui: None,
            catalog: None,
            http,
            zone: Arc::new(UtcZone),
            secrets: Arc::new(HumbleSecrets::new(Arc::new(UnavailableSecretSource))),
        }
    }

    /// The source the secrets are read from and written to: the Keychain in the shell, a scripted fake in
    /// a test. Replaces the owner, so its cache starts cold.
    pub fn with_secrets(mut self, source: Arc<dyn HumbleSecretSource>) -> HumbleCtx {
        self.secrets = Arc::new(HumbleSecrets::new(source));
        self
    }

    /// The host's zone.
    pub fn with_zone(mut self, zone: Arc<dyn HostZone>) -> HumbleCtx {
        self.zone = zone;
        self
    }

    /// The host zone as a [`LocalZone`]. Hand this to `parse_js_date`, `classify_order`,
    /// `extract_expiration` and `classify_tpk`; each zone-less or date-only value is then resolved at
    /// its own date's offset.
    pub fn local_zone(&self) -> LocalZone<'_> {
        LocalZone::host(&*self.zone)
    }

    /// The emitter the shell pushes through.
    pub fn with_emitter(mut self, emitter: Arc<dyn FrontendEmitter>) -> HumbleCtx {
        self.emitter = emitter;
        self
    }

    /// The diagnostic log.
    pub fn with_log(mut self, log: Arc<dyn HumbleLog>) -> HumbleCtx {
        self.log = Some(log);
        self
    }

    /// The window-facing surface.
    pub fn with_ui(mut self, ui: Arc<dyn HumbleUi>) -> HumbleCtx {
        self.ui = Some(ui);
        self
    }

    /// The catalog notice text is rendered through.
    pub fn with_catalog(mut self, catalog: Arc<Catalog>) -> HumbleCtx {
        self.catalog = Some(catalog);
        self
    }

    /// Writes an info line when a log is set. `line` must be fixed text (see [`HumbleLog`]).
    pub fn info(&self, line: &str) {
        if let Some(log) = &self.log {
            log.info(line);
        }
    }

    /// Writes a warning line when a log is set. `line` must be fixed text (see [`HumbleLog`]).
    pub fn warn(&self, line: &str) {
        if let Some(log) = &self.log {
            log.warn(line);
        }
    }

    /// Writes an error line when a log is set. `line` must be fixed text (see [`HumbleLog`]).
    pub fn error(&self, line: &str) {
        if let Some(log) = &self.log {
            log.error(line);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::NoHttp;
    use crate::js_date::{parse_js_date, to_iso_string};
    use gamelib_core::clock::SystemClock;
    use std::sync::Mutex;

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

    /// Records every UI call as text.
    #[derive(Default)]
    struct RecordingUi(Mutex<Vec<String>>);

    impl HumbleUi for RecordingUi {
        fn notify(&self, title: &str, body: &str) {
            self.0
                .lock()
                .unwrap()
                .push(format!("notify {title}|{body}"));
        }
        fn send_to_sidecar(&self, channel: &str, args: Vec<Value>) {
            self.0
                .lock()
                .unwrap()
                .push(format!("sidecar {channel} {}", Value::Array(args)));
        }
    }

    fn base(user_data: PathBuf) -> HumbleCtx {
        HumbleCtx::new(
            Arc::new(StoreHost::new()),
            user_data,
            Arc::new(SystemClock),
            Platform::Linux,
            Shutdown::new(),
            Arc::new(NoHttp),
        )
    }

    #[test]
    fn a_context_with_a_null_emitter_a_recording_log_and_no_catalog_builds_without_touching_disk() {
        let user_data = std::env::temp_dir().join("gamelib-humble-ctx-never-created");
        assert!(!user_data.exists());
        let log = Arc::new(RecordingLog::default());
        let ctx = base(user_data.clone()).with_log(log.clone());
        assert!(ctx.catalog.is_none() && ctx.ui.is_none());
        // The default emitter swallows a push.
        ctx.emitter.emit("humbleKeysUpdated", vec![Value::Null]);
        ctx.info("sync started");
        ctx.warn("sync denied");
        ctx.error("store unreadable");
        assert_eq!(
            *log.0.lock().unwrap(),
            [
                "info sync started",
                "warn sync denied",
                "error store unreadable"
            ]
        );
        assert!(!user_data.exists(), "building a context created a path");
    }

    #[test]
    fn a_context_without_a_log_or_ui_is_silent() {
        let ctx = base(PathBuf::new());
        ctx.info("a");
        ctx.warn("b");
        ctx.error("c");
        assert!(ctx.log.is_none() && ctx.ui.is_none());
    }

    #[test]
    fn the_ui_seam_carries_a_notification_and_a_sidecar_frame() {
        let ui = Arc::new(RecordingUi::default());
        let ctx = base(PathBuf::new()).with_ui(ui.clone());
        let ui_ref = ctx.ui.as_ref().expect("the ui was set");
        ui_ref.notify("Humble", "A key expires soon");
        ui_ref.send_to_sidecar("humbleSettled", vec![Value::from(1)]);
        assert_eq!(
            *ui.0.lock().unwrap(),
            [
                "notify Humble|A key expires soon",
                "sidecar humbleSettled [1]"
            ]
        );
    }

    #[test]
    fn a_catalog_can_be_attached_and_renders_a_default_for_an_unknown_key() {
        let catalog = Arc::new(Catalog::load(
            &std::env::temp_dir().join("gamelib-humble-no-locales"),
            "en",
        ));
        let ctx = base(PathBuf::new()).with_catalog(catalog);
        let params = serde_json::json!({ "name": "Ada" })
            .as_object()
            .cloned()
            .unwrap_or_default();
        let text = ctx.catalog.as_ref().expect("the catalog was set").t(
            "no.such.key",
            "Hello {{name}}",
            &params,
        );
        assert_eq!(text, "Hello Ada");
    }

    /// A zone with daylight saving: +13:00 from September, +12:00 from April (the southern shape).
    struct SouthernZone;

    impl HostZone for SouthernZone {
        fn offset_east_secs_at(&self, utc_ms: i64) -> i32 {
            // 2026-04-05T00:00Z .. 2026-09-27T00:00Z is "winter".
            if (1_775_347_200_000..1_790_467_200_000).contains(&utc_ms) {
                12 * 3600
            } else {
                13 * 3600
            }
        }
    }

    #[test]
    fn the_default_zone_is_utc_and_a_shell_zone_answers_the_offset_at_the_instant_asked() {
        let utc = base(PathBuf::new());
        assert_eq!(utc.local_zone().offset_east_secs_at(1_795_521_600_000), 0);

        let ctx = base(PathBuf::new()).with_zone(Arc::new(SouthernZone));
        // 2026-07-01 is winter, 2026-12-01 is summer: one zone object, two offsets.
        assert_eq!(
            ctx.local_zone().offset_east_secs_at(1_782_864_000_000),
            12 * 3600
        );
        assert_eq!(
            ctx.local_zone().offset_east_secs_at(1_795_521_600_000),
            13 * 3600
        );
        // A zone-less time is resolved at its own date's offset (winter, +12h).
        assert_eq!(
            parse_js_date("2026-07-01 00:30", ctx.local_zone())
                .and_then(to_iso_string)
                .as_deref(),
            Some("2026-06-30T12:30:00.000Z")
        );
    }
}
