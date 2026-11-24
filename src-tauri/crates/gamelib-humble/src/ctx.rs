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

/// The platform the app runs on, as the shell reports it (the crate never asks the OS).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    Mac,
    Linux,
    Windows,
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
}

impl HumbleCtx {
    pub fn new(
        host: Arc<StoreHost>,
        user_data: PathBuf,
        clock: Arc<dyn Clock>,
        platform: Platform,
        shutdown: Shutdown,
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
        }
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
}
