//! The shell's engine log (Phase 87, 87-61, SVC-02): the `EngineLog` the shell's [`EngineCtx`] never
//! had, so every line the `gamelib-engine` and `gamelib-wine` crates write through `ctx.log` reaches
//! `gamelib.log` as a `[Shell]` line at the level the crate chose.
//!
//! Before 87-61 `build_ctx` called no `with_log` and the context's `log` was `None`, which dropped the
//! `[engine-notice]` lines, the pinned engine's download lines, the launch-deadline lines, the offline
//! gate's warning, the DXMT skip line and every engine-override warning (87-59 found three required
//! literals IMPOSSIBLE because of it).
//!
//! The user's decision (2026-11-24, final): the engine lines go into the uploadable `gamelib.log`
//! REDACTED. `uploadLogFile` posts that file to a public paste service (84-17), and a crate line may
//! carry text the crate did not author (an error string, a bottle name, a path). So every line passes
//! through [`EngineLineRedactor::redact`] before the write. The redactor is defence in depth over the
//! crate rule in `gamelib-engine`'s `sinks.rs` (a line is fixed text and never carries a URL, a query,
//! a header, a token or a profile path), which still holds at every call site.
//!
//! The one route into the file is [`ShellEngineLog::write`], whose only call of `shell_log_at` passes
//! the redactor's output; `shellLogCategoryOnly.test.ts` requires exactly that of every `shell_log_at(`
//! call in `src-tauri/src`, so this log cannot become a bypass of the 84-17 category-only rule.

use std::path::Path;

use gamelib_engine::sinks::EngineLog;
use gamelib_log::Level;

/// The longest line written, in UTF-16 units (the unit `gamelib-log` counts in). Longer is cut with
/// `gamelib-log`'s visible truncation marker.
#[allow(dead_code)] // read by the cut rule (Task 2)
pub(crate) const ENGINE_LINE_MAX: usize = 512;

/// Where a redacted line goes. `None` in production (`crate::shell_log_at`); a test substitutes one that
/// writes to its own logger.
#[cfg(test)]
type Sink = Box<dyn Fn(Level, &str) + Send + Sync>;

/// The shell's [`EngineLog`]: redacts, then writes one `[Shell]` line per crate line.
pub(crate) struct ShellEngineLog {
    redactor: EngineLineRedactor,
    #[cfg(test)]
    sink: Option<Sink>,
}

impl ShellEngineLog {
    /// A log redacting for `user_home`'s owner.
    pub(crate) fn for_home(user_home: &Path) -> ShellEngineLog {
        ShellEngineLog {
            redactor: EngineLineRedactor::for_home(user_home),
            #[cfg(test)]
            sink: None,
        }
    }

    /// Replaces the destination (a test's own logger instead of the global one).
    #[cfg(test)]
    pub(crate) fn with_sink(mut self, sink: Sink) -> ShellEngineLog {
        self.sink = Some(sink);
        self
    }

    fn write(&self, level: Level, line: &str) {
        let redacted = self.redactor.redact(line);
        #[cfg(test)]
        if let Some(sink) = &self.sink {
            sink(level, &redacted);
            return;
        }
        crate::shell_log_at(level, &redacted);
    }
}

impl EngineLog for ShellEngineLog {
    fn info(&self, line: &str) {
        self.write(Level::Info, line);
    }

    fn warn(&self, line: &str) {
        self.write(Level::Warning, line);
    }

    fn error(&self, line: &str) {
        self.write(Level::Error, line);
    }
}

/// Renders the operator's identifying text out of a line.
#[derive(Debug, Clone)]
pub(crate) struct EngineLineRedactor {
    /// Every spelling of the home directory, longest first.
    home_forms: Vec<String>,
    /// The account names to remove wherever they remain as a word.
    #[allow(dead_code)] // read by the account rule (Task 2)
    accounts: Vec<String>,
}

impl EngineLineRedactor {
    /// `home` is the home directory as the process sees it; `account` the account name.
    pub(crate) fn new(home: Option<String>, account: Option<String>) -> EngineLineRedactor {
        let mut home_forms = home.map(|home| home_spellings(&home)).unwrap_or_default();
        home_forms.sort_by_key(|form| std::cmp::Reverse(form.len()));
        home_forms.dedup();
        EngineLineRedactor {
            home_forms,
            accounts: account.into_iter().collect(),
        }
    }

    /// The redactor for `user_home`: the home forms, the account name from its last component, and
    /// `USER` (or `USERNAME`) from the environment when it differs.
    pub(crate) fn for_home(user_home: &Path) -> EngineLineRedactor {
        let env_user = std::env::var("USER")
            .ok()
            .or_else(|| std::env::var("USERNAME").ok());
        EngineLineRedactor::for_home_with_user(user_home, env_user)
    }

    /// [`for_home`](Self::for_home) with the environment's user passed in, so a test does not read the
    /// process environment.
    pub(crate) fn for_home_with_user(
        user_home: &Path,
        env_user: Option<String>,
    ) -> EngineLineRedactor {
        let last = user_home
            .file_name()
            .map(|name| name.to_string_lossy().into_owned());
        let mut redactor =
            EngineLineRedactor::new(Some(user_home.to_string_lossy().into_owned()), last);
        if let Some(user) = env_user {
            if !redactor.accounts.contains(&user) {
                redactor.accounts.push(user);
            }
        }
        redactor
    }

    /// The line with the identifying text removed.
    pub(crate) fn redact(&self, line: &str) -> String {
        let mut out = line.to_string();
        for form in &self.home_forms {
            out = replace_path_prefix(&out, form, "~");
        }
        out
    }
}

/// Every way the home directory is written: as given, with either separator, as a `file://` URL and
/// as the wine `Z:` drive. Trailing separators are dropped; an empty or root home yields none.
fn home_spellings(home: &str) -> Vec<String> {
    let trimmed = home.trim_end_matches(['/', '\\']);
    if trimmed.is_empty() {
        return Vec::new();
    }
    let slashed = trimmed.replace('\\', "/");
    let backslashed = trimmed.replace('/', "\\");
    let mut forms = vec![trimmed.to_string(), slashed.clone(), backslashed.clone()];
    let url_path = if slashed.starts_with('/') {
        slashed.clone()
    } else {
        format!("/{slashed}")
    };
    forms.push(format!("file://{url_path}"));
    forms.push(format!("file://{}", url_path.replace(' ', "%20")));
    if slashed.starts_with('/') {
        forms.push(format!("Z:{backslashed}"));
        forms.push(format!("z:{backslashed}"));
        forms.push(format!("Z:{slashed}"));
        forms.push(format!("z:{slashed}"));
    }
    forms.retain(|form| !form.is_empty());
    forms
}

/// Whether `c` continues a path component or a word (so `/Users/ab` is not the start of
/// `/Users/abc`).
fn continues_word(c: char) -> bool {
    c.is_alphanumeric() || c == '_' || c == '-'
}

/// Replaces each occurrence of `form` that ends at a component boundary with `with`.
fn replace_path_prefix(line: &str, form: &str, with: &str) -> String {
    if form.is_empty() {
        return line.to_string();
    }
    let mut out = String::with_capacity(line.len());
    let mut rest = line;
    while let Some(at) = rest.find(form) {
        let after = &rest[at + form.len()..];
        let boundary = after.chars().next().is_none_or(|c| !continues_word(c));
        out.push_str(&rest[..at]);
        if boundary {
            out.push_str(with);
        } else {
            out.push_str(form);
        }
        rest = after;
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::time::Duration;

    struct TestClock;
    impl gamelib_core::clock::Clock for TestClock {
        fn now_ms(&self) -> u64 {
            1_795_133_109_000
        }
    }

    struct TestTz;
    impl gamelib_log::writer::TzOffset for TestTz {
        fn offset_minutes(&self, _epoch_ms: u64) -> i32 {
            0
        }
    }

    fn started_logger(
        home: &gamelib_testutil::FakeHome,
    ) -> (Arc<gamelib_log::writer::Logger>, String) {
        let root = home.root().to_string_lossy().into_owned();
        let platform = gamelib_core::paths::Platform::current();
        let logger = gamelib_log::writer::Logger::start(gamelib_log::writer::LogConfig {
            platform,
            user_data: gamelib_core::paths::join(platform, &root, &["userData"]),
            log_dir: root.clone(),
            clock: Arc::new(TestClock),
            tz: Arc::new(TestTz),
        });
        (Arc::new(logger), root)
    }

    fn read_log(root: &str) -> String {
        let platform = gamelib_core::paths::Platform::current();
        std::fs::read_to_string(gamelib_core::paths::join(platform, root, &["gamelib.log"]))
            .unwrap_or_default()
    }

    fn built(home: &gamelib_testutil::FakeHome) -> gamelib_engine::ctx::EngineCtx {
        let emitter: Arc<dyn gamelib_core::emitter::FrontendEmitter> =
            Arc::new(gamelib_engine::sinks::NullEmitter);
        crate::engine_dispatch::build_ctx(
            Arc::new(gamelib_store::host::StoreHost::new()),
            &home.root().join("userData"),
            home.root().to_path_buf(),
            home.root().join("tmp"),
            Arc::clone(&emitter),
            Arc::new(crate::engine_dispatch::ShellEngineUi::silent(emitter)),
            gamelib_core::shutdown::Shutdown::new(),
        )
    }

    #[test]
    fn a_crate_line_written_during_an_op_reaches_gamelib_log_as_a_shell_warning() {
        // The tracer (87-61): the unsafe-bottle warn of `engine_bottle_kill_wineserver` goes through
        // `ctx.log` without spawning anything, and used to be dropped.
        let home = gamelib_testutil::FakeHome::new("engine-log-tracer-");
        let (logger, root) = started_logger(&home);
        let sink_logger = Arc::clone(&logger);
        let log = ShellEngineLog::for_home(home.root()).with_sink(Box::new(move |level, line| {
            crate::shell_log_at_to(Some(&sink_logger), level, line)
        }));
        let ctx = built(&home).with_log(Arc::new(log));

        let killed = gamelib_engine::dispatch_sync(
            "engine_bottle_kill_wineserver",
            &[serde_json::json!({
                "bottleName": "../escape",
                "wineserverBin": "/cx/bin/wineserver",
            })],
            &ctx,
        )
        .expect("the op answers");
        assert_eq!(
            killed,
            serde_json::json!(false),
            "an unsafe name spawns nothing"
        );

        assert!(logger.flush(Duration::from_secs(10)), "flush timed out");
        let written = read_log(&root);
        let lines: Vec<&str> = written
            .lines()
            .filter(|line| line.contains("refusing unsafe bottle"))
            .collect();
        assert_eq!(lines.len(), 1, "not exactly one line: {written:?}");
        assert!(
            lines[0].contains("[WARNING]"),
            "not a warning: {}",
            lines[0]
        );
        assert!(
            lines[0].contains("[Shell]"),
            "not a shell line: {}",
            lines[0]
        );
        assert!(
            lines[0].contains("killBottleWineServerWith: refusing unsafe bottle"),
            "the crate's text is missing: {}",
            lines[0]
        );
    }

    #[test]
    fn a_crate_line_with_no_logger_installed_writes_nothing_and_does_not_panic() {
        // Every other shell test runs with `gamelib_log::global()` unset.
        assert!(gamelib_log::global().is_none());
        let home = gamelib_testutil::FakeHome::new("engine-log-no-logger-");
        let ctx = built(&home);
        assert!(ctx.log.is_some());
        let killed = gamelib_engine::dispatch_sync(
            "engine_bottle_kill_wineserver",
            &[serde_json::json!({
                "bottleName": "../escape",
                "wineserverBin": "/cx/bin/wineserver",
            })],
            &ctx,
        )
        .expect("the op answers");
        assert_eq!(killed, serde_json::json!(false));
        assert!(!home.root().join("gamelib.log").exists());
    }

    #[test]
    fn each_level_of_the_crate_log_maps_to_its_gamelib_level() {
        let seen: Arc<std::sync::Mutex<Vec<(Level, String)>>> = Arc::default();
        let sink_seen = Arc::clone(&seen);
        let log = ShellEngineLog::for_home(Path::new("/Users/nobody")).with_sink(Box::new(
            move |level, line| sink_seen.lock().unwrap().push((level, line.to_string())),
        ));
        log.info("a");
        log.warn("b");
        log.error("c");
        assert_eq!(
            seen.lock().unwrap().as_slice(),
            [
                (Level::Info, "a".to_string()),
                (Level::Warning, "b".to_string()),
                (Level::Error, "c".to_string()),
            ]
        );
    }

    #[test]
    fn the_home_directory_is_rendered_as_a_tilde_in_every_spelling() {
        let redactor =
            EngineLineRedactor::new(Some("/Users/gwen".to_string()), Some("gwen".to_string()));
        assert_eq!(
            redactor
                .redact("a /Users/gwen/Library/x and file:///Users/gwen/y and Z:\\Users\\gwen\\z"),
            "a ~/Library/x and ~/y and ~\\z",
        );
    }

    #[test]
    fn a_sibling_directory_sharing_the_home_prefix_is_not_the_home() {
        let redactor = EngineLineRedactor::new(Some("/Users/gwen".to_string()), None);
        assert_eq!(redactor.redact("/Users/gwendolen/x"), "/Users/gwendolen/x");
    }
}
