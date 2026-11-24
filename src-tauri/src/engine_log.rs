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
            .accounts
            .sort_by_key(|name| std::cmp::Reverse(name.len()));
        redactor
    }

    /// The line with the identifying text removed. Six rules, in this order, each for one class:
    ///
    /// 1. the home directory (plain, `file://` and wine `Z:` forms), longest first, to `~`: a profile path;
    /// 2. the account name wherever it remains as a whole ASCII word, to `<user>` (names under two
    ///    characters are skipped): the operator's name outside a path;
    /// 3. the value of a secret-shaped or account-shaped `key=value` / `key: value` pair, to
    ///    `<redacted>`, the key kept: a token, a password, a cookie, an authorization header, a login;
    /// 4. a full argument line (`args=`, `argv=`, `cmd=`, `command=`, `commandParts=`, `Wine Command:`),
    ///    to `args=<redacted N>` with N the element count of a list and `?` otherwise: a spawn's argv,
    ///    which carries paths, tokens and the game's own flags;
    /// 5. an `http`/`https` URL's userinfo and query, to `?<redacted>`: the part of a URL that carries
    ///    credentials and identifiers (the same loss as `gamelib-engine`'s fetch redaction);
    /// 6. the cut to [`ENGINE_LINE_MAX`] UTF-16 units with `gamelib-log`'s truncation marker: one entry
    ///    stays bounded whatever a crate writes.
    ///
    /// CR and LF are not handled here: the writer escapes them itself (IN-07).
    pub(crate) fn redact(&self, line: &str) -> String {
        let mut out = line.to_string();
        for form in &self.home_forms {
            out = replace_path_prefix(&out, form, "~");
        }
        for account in &self.accounts {
            out = replace_word(&out, account, "<user>");
        }
        out = redact_pairs(&out);
        out = redact_argument_lines(&out);
        out = redact_url_queries(&out);
        gamelib_log::sanitize::truncate_utf16(&out, ENGINE_LINE_MAX)
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
        let boundary = !after.chars().next().is_some_and(continues_word);
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

/// Whether `b` is part of an ASCII word (`[A-Za-z0-9_]`).
fn is_word_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

/// Replaces each whole-word, ASCII-case-insensitive occurrence of `name` with `with`. `name` shorter
/// than two characters is skipped (a one-letter account would rewrite the line's fixed text).
fn replace_word(line: &str, name: &str, with: &str) -> String {
    if name.chars().count() < 2 {
        return line.to_string();
    }
    // ASCII lowering keeps every byte offset, so the matches index `line` too.
    let haystack = line.to_ascii_lowercase();
    let needle = name.to_ascii_lowercase();
    let bytes = line.as_bytes();
    let mut out = String::with_capacity(line.len());
    let mut copied = 0;
    let mut from = 0;
    while let Some(found) = haystack[from..].find(&needle) {
        let start = from + found;
        let end = start + needle.len();
        let before_ok = start == 0 || !is_word_byte(bytes[start - 1]);
        let after_ok = end >= bytes.len() || !is_word_byte(bytes[end]);
        if before_ok && after_ok {
            out.push_str(&line[copied..start]);
            out.push_str(with);
            copied = end;
        }
        from = end;
    }
    out.push_str(&line[copied..]);
    out
}

/// The keys whose value is replaced when the key ends with one of these (`access_token`, `x-api_key`).
const SECRET_SUFFIXES: [&str; 8] = [
    "token",
    "password",
    "passwd",
    "secret",
    "apikey",
    "api_key",
    "authorization",
    "cookie",
];

/// The keys whose value is replaced when the key is exactly one of these.
const EXACT_KEYS: [&str; 4] = ["session", "account", "accountname", "login"];

/// A key whose value is replaced.
fn is_sensitive_key(key: &str) -> bool {
    let key = key.trim_start_matches(['-', '.']).to_ascii_lowercase();
    key == "username"
        || EXACT_KEYS.contains(&key.as_str())
        || SECRET_SUFFIXES.iter().any(|suffix| key.ends_with(suffix))
}

/// The identifier ending just before `sep` (an optional closing quote between them is allowed).
fn key_before(line: &str, sep: usize) -> Option<&str> {
    let bytes = line.as_bytes();
    let mut end = sep;
    if end > 0 && matches!(bytes[end - 1], b'"' | b'\'') {
        end -= 1;
    }
    let mut start = end;
    while start > 0 {
        let b = bytes[start - 1];
        if b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.') {
            start -= 1;
        } else {
            break;
        }
    }
    (start < end).then(|| &line[start..end])
}

/// Where an unquoted value ends: whitespace, a quote, a list or call closer, a comma, `;` or `&`.
fn is_value_end(b: u8) -> bool {
    b.is_ascii_whitespace() || matches!(b, b'"' | b'\'' | b',' | b';' | b']' | b')' | b'}' | b'&')
}

/// Rule 3: the value of each secret-shaped or account-shaped `key=value` / `key: value` pair. A quoted
/// value runs to its closing quote; `authorization` (and `cookie` after a colon, the header form) runs
/// to the end of the line, since its value holds spaces (`Bearer abc`, `a=1; b=2`).
fn redact_pairs(line: &str) -> String {
    const MASK: &str = "<redacted>";
    let bytes = line.as_bytes();
    let mut out = String::with_capacity(line.len());
    let mut copied = 0;
    let mut i = 0;
    while i < bytes.len() {
        let sep = bytes[i];
        if sep != b'=' && sep != b':' {
            i += 1;
            continue;
        }
        let Some(key) = key_before(line, i).filter(|key| is_sensitive_key(key)) else {
            i += 1;
            continue;
        };
        let lowered = key.trim_start_matches(['-', '.']).to_ascii_lowercase();
        let mut start = i + 1;
        while start < bytes.len() && matches!(bytes[start], b' ' | b'\t') {
            start += 1;
        }
        if start >= bytes.len() {
            break;
        }
        let to_end_of_line =
            lowered.ends_with("authorization") || (sep == b':' && lowered == "cookie");
        let (value_start, value_end) = if matches!(bytes[start], b'"' | b'\'') {
            let quote = bytes[start];
            let mut end = start + 1;
            while end < bytes.len() && bytes[end] != quote {
                end += if bytes[end] == b'\\' { 2 } else { 1 };
            }
            (start + 1, end.min(bytes.len()))
        } else if to_end_of_line {
            (start, bytes.len())
        } else {
            let mut end = start;
            while end < bytes.len() && !is_value_end(bytes[end]) {
                end += 1;
            }
            (start, end)
        };
        let value = &line[value_start..value_end];
        if value.is_empty() || value == MASK {
            i = value_end.max(i + 1);
            continue;
        }
        out.push_str(&line[copied..value_start]);
        out.push_str(MASK);
        copied = value_end;
        i = value_end;
    }
    out.push_str(&line[copied..]);
    out
}

/// The introducers of a full argument line, lowercase.
const ARGUMENT_INTRODUCERS: [&str; 6] = [
    "commandparts=",
    "args=",
    "argv=",
    "cmd=",
    "command=",
    "wine command:",
];

/// The element count of the bracketed list starting at `open` (a `[`) and the index just past its
/// closing `]`, or `None` when it never closes. Quotes (with backslash escapes) and nested brackets are
/// respected, so a comma inside a string or an inner list is not an element boundary.
fn list_extent(line: &str, open: usize) -> Option<(usize, usize)> {
    let bytes = line.as_bytes();
    let mut depth = 0usize;
    let mut quote: Option<u8> = None;
    let mut elements = 0usize;
    let mut has_content = false;
    let mut i = open;
    while i < bytes.len() {
        let b = bytes[i];
        if let Some(q) = quote {
            if b == b'\\' {
                i += 1;
            } else if b == q {
                quote = None;
            }
        } else {
            match b {
                b'"' | b'\'' => {
                    quote = Some(b);
                    has_content = true;
                }
                b'[' | b'{' => {
                    if depth >= 1 {
                        has_content = true;
                    }
                    depth += 1;
                }
                b']' | b'}' => {
                    depth = depth.saturating_sub(1);
                    if depth == 0 {
                        if has_content {
                            elements += 1;
                        }
                        return Some((elements, i + 1));
                    }
                }
                b',' if depth == 1 => elements += 1,
                b if !b.is_ascii_whitespace() => has_content = true,
                _ => {}
            }
        }
        i += 1;
    }
    None
}

/// Rule 4: a full argument line to `args=<redacted N>`.
fn redact_argument_lines(line: &str) -> String {
    let lowered = line.to_ascii_lowercase();
    let bytes = line.as_bytes();
    let mut out = String::with_capacity(line.len());
    let mut copied = 0;
    let mut i = 0;
    while i < bytes.len() {
        let at_word_start = i == 0 || !is_word_byte(bytes[i - 1]);
        let introducer = at_word_start
            .then(|| {
                ARGUMENT_INTRODUCERS
                    .iter()
                    .find(|intro| lowered.as_bytes()[i..].starts_with(intro.as_bytes()))
            })
            .flatten();
        let Some(intro) = introducer else {
            i += 1;
            continue;
        };
        let mut start = i + intro.len();
        while start < bytes.len() && matches!(bytes[start], b' ' | b'\t') {
            start += 1;
        }
        if lowered.as_bytes()[start..].starts_with(b"<redacted") {
            i = start;
            continue;
        }
        let (count, end) = if bytes.get(start) == Some(&b'[') {
            list_extent(line, start)
                .map(|(count, end)| (count.to_string(), end))
                .unwrap_or_else(|| ("?".to_string(), bytes.len()))
        } else {
            ("?".to_string(), bytes.len())
        };
        out.push_str(&line[copied..i]);
        out.push_str(&format!("args=<redacted {count}>"));
        copied = end;
        i = end;
    }
    out.push_str(&line[copied..]);
    out
}

/// Whether a URL ends at `b`.
fn is_url_end(b: u8) -> bool {
    b.is_ascii_whitespace() || matches!(b, b'"' | b'\'' | b'<' | b'>' | b')' | b']' | b'}')
}

/// Rule 5: each `http`/`https` URL loses its userinfo and its query (the query becomes `?<redacted>`).
fn redact_url_queries(line: &str) -> String {
    let lowered = line.to_ascii_lowercase();
    let bytes = line.as_bytes();
    let mut out = String::with_capacity(line.len());
    let mut copied = 0;
    let mut i = 0;
    while i < bytes.len() {
        let at_word_start = i == 0 || !is_word_byte(bytes[i - 1]);
        let scheme = at_word_start
            .then(|| {
                ["https://", "http://"]
                    .into_iter()
                    .find(|s| lowered.as_bytes()[i..].starts_with(s.as_bytes()))
            })
            .flatten();
        let Some(scheme) = scheme else {
            i += 1;
            continue;
        };
        let authority_start = i + scheme.len();
        let mut end = authority_start;
        while end < bytes.len() && !is_url_end(bytes[end]) {
            end += 1;
        }
        // A query this rule already masked (`?<redacted>`) is kept whole, so a second pass is a no-op.
        if line[authority_start..end].ends_with('?') && line[end..].starts_with("<redacted>") {
            end += "<redacted>".len();
        }
        let url = &line[authority_start..end];
        let authority_len = url.find(['/', '?', '#']).unwrap_or(url.len());
        let userinfo_end = url[..authority_len]
            .rfind('@')
            .map(|at| at + 1)
            .unwrap_or(0);
        let (path_and_query_start, has_query) = (authority_len, url[authority_len..].contains('?'));
        let rest = &url[path_and_query_start..];
        let rest = match rest.find('?') {
            Some(q) => &rest[..q],
            None => rest,
        };
        out.push_str(&line[copied..authority_start]);
        out.push_str(&url[userinfo_end..authority_len]);
        out.push_str(rest);
        if has_query {
            out.push_str("?<redacted>");
        }
        copied = end;
        i = end.max(i + 1);
    }
    out.push_str(&line[copied..]);
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

    /// An absolute `wineserver` path on every platform. The op refuses a relative one as `bad-args`
    /// before it looks at the bottle name, and `/cx/bin/wineserver` is not absolute on Windows (no
    /// drive), so the unsafe-name tests below never reached the line they assert there. The unsafe
    /// name is refused before anything is spawned, so the path is never run.
    fn absolute_wineserver_bin() -> &'static str {
        if cfg!(windows) {
            r"C:\cx\bin\wineserver"
        } else {
            "/cx/bin/wineserver"
        }
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
                "wineserverBin": absolute_wineserver_bin(),
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
                "wineserverBin": absolute_wineserver_bin(),
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

    #[test]
    fn a_line_with_home_account_and_args_comes_out_redacted() {
        // The user's required test (2026-11-24): one line holding the fake HOME path, an account-shaped
        // value and a full args line.
        let home = gamelib_testutil::FakeHome::new("engine-redact-required-");
        let home_text = home.root().to_string_lossy().into_owned();
        let redactor =
            EngineLineRedactor::new(Some(home_text.clone()), Some("quillfeather".to_string()));
        let line = format!(
            "bottle {home_text}/Library/Application Support/CrossOver/Bottles/x account=quillfeather args=[\"/bin/wine\",\"--bottle\",\"x\",\"C:\\\\game.exe\",\"--token=abc\"] done"
        );
        let out = redactor.redact(&line);
        assert!(
            out.contains("~/Library/Application Support/CrossOver/Bottles/x"),
            "the home was not rendered as ~: {out}"
        );
        assert!(!out.contains(&home_text), "the home path survived: {out}");
        assert!(!out.contains("quillfeather"), "the account survived: {out}");
        for argument in ["/bin/wine", "--bottle", "game.exe", "--token", "abc"] {
            assert!(
                !out.contains(argument),
                "the argument {argument} survived: {out}"
            );
        }
        assert!(out.contains("args=<redacted 5>"), "no count: {out}");
        assert!(
            out.starts_with("bottle ~/") && out.ends_with(" done"),
            "the fixed text was rewritten: {out}"
        );
    }

    #[test]
    fn the_account_name_as_a_bare_word_never_survives() {
        let redactor =
            EngineLineRedactor::new(Some("/Users/gwen".to_string()), Some("gwen".to_string()));
        let out =
            redactor.redact("saved Z:\\Users\\gwen\\Documents and C:\\Users\\GWEN\\x for gwen.");
        assert!(!out.to_ascii_lowercase().contains("gwen"), "{out}");
        assert!(out.contains("<user>") || out.contains('~'), "{out}");
    }

    #[test]
    fn the_account_letters_inside_a_longer_word_are_untouched() {
        // The ASCII word boundary: `eng` is inside `Engine`, `engine` and `lengths`, and stands alone once.
        let redactor = EngineLineRedactor::new(None, Some("eng".to_string()));
        assert_eq!(
            redactor.redact("Engine: engine lengths eng"),
            "Engine: engine lengths <user>"
        );
    }

    #[test]
    fn the_home_directory_name_and_the_environment_user_are_both_account_names() {
        let redactor = EngineLineRedactor::for_home_with_user(
            std::path::Path::new("/Users/gwendolyn"),
            Some("gwen".to_string()),
        );
        let out = redactor.redact("by gwendolyn and gwen in /Users/gwendolyn/x");
        assert_eq!(out, "by <user> and <user> in ~/x");
    }

    #[test]
    fn a_secret_shaped_value_is_replaced_and_its_key_kept() {
        let redactor = EngineLineRedactor::new(None, None);
        for key in [
            "token",
            "access_token",
            "refresh_token",
            "password",
            "secret",
            "cookie",
            "session",
            "apikey",
            "api_key",
        ] {
            for spelled in [key.to_string(), key.to_ascii_uppercase()] {
                let out = redactor.redact(&format!("before {spelled}=hunter2 after"));
                assert_eq!(out, format!("before {spelled}=<redacted> after"), "{key}");
            }
        }
        assert_eq!(
            redactor.redact("sent authorization: Bearer abc.def and more"),
            "sent authorization: <redacted>"
        );
    }

    #[test]
    fn an_account_shaped_pair_is_replaced_and_its_key_kept() {
        let redactor = EngineLineRedactor::new(None, None);
        for key in ["account", "accountname", "login", "username"] {
            let out = redactor.redact(&format!("a {key}=somebody b"));
            assert_eq!(out, format!("a {key}=<redacted> b"), "{key}");
        }
        assert_eq!(
            redactor.redact("a username: somebody b"),
            "a username: <redacted> b"
        );
    }

    #[test]
    fn a_full_argument_line_is_replaced_by_its_count() {
        let redactor = EngineLineRedactor::new(None, None);
        assert_eq!(
            redactor.redact("run args=[] done"),
            "run args=<redacted 0> done"
        );
        assert_eq!(
            redactor.redact("run argv=[\"a,b\",[1,2],\"c\\\"d\"] done"),
            "run args=<redacted 3> done"
        );
        assert_eq!(
            redactor.redact("run commandParts=[\"wine\",\"x.exe\"] done"),
            "run args=<redacted 2> done"
        );
        assert_eq!(
            redactor.redact("spawn cmd=/bin/wine x.exe --flag"),
            "spawn args=<redacted ?>"
        );
        assert_eq!(
            redactor.redact("Wine Command: /bin/wine x.exe"),
            "args=<redacted ?>"
        );
    }

    #[test]
    fn a_url_keeps_its_host_and_path_and_no_query() {
        let redactor = EngineLineRedactor::new(None, None);
        assert_eq!(
            redactor.redact("fetch https://host.example/a/b?x=1&y=2 now"),
            "fetch https://host.example/a/b?<redacted> now"
        );
        assert_eq!(
            redactor.redact("fetch http://host.example/a (retry)"),
            "fetch http://host.example/a (retry)"
        );
    }

    #[test]
    fn a_line_longer_than_the_cap_is_cut_with_the_visible_marker() {
        let redactor = EngineLineRedactor::new(None, None);
        let line = "x".repeat(ENGINE_LINE_MAX + 40);
        let out = redactor.redact(&line);
        assert_eq!(
            out,
            format!(
                "{}\u{2026}[truncated 40 bytes]",
                "x".repeat(ENGINE_LINE_MAX)
            )
        );
    }

    #[test]
    fn a_line_within_the_cap_is_not_cut() {
        let redactor = EngineLineRedactor::new(None, None);
        let line = "y".repeat(ENGINE_LINE_MAX);
        assert_eq!(redactor.redact(&line), line);
    }

    #[test]
    fn the_crates_fixed_text_comes_out_unchanged() {
        let redactor =
            EngineLineRedactor::new(Some("/Users/gwen".to_string()), Some("gwen".to_string()));
        for line in [
            "[engine-notice] key=gog:1 tag=engine-bottle-busy dispatched=notify raise=false",
            "Engine: legendary:Quail engine=pinned name=\"Wine-Staging\" version=11.20 reason=cx-missing",
            "killBottleWineServerWith: refusing unsafe bottle \"../escape\"",
            "engine temp sweep: done (removed 2)",
        ] {
            assert_eq!(redactor.redact(line), line);
        }
    }

    #[test]
    fn a_one_character_account_name_is_skipped() {
        let redactor = EngineLineRedactor::new(None, Some("a".to_string()));
        assert_eq!(redactor.redact("a cat sat"), "a cat sat");
    }

    #[test]
    fn a_url_loses_its_userinfo_as_well_as_its_query() {
        let redactor = EngineLineRedactor::new(None, None);
        assert_eq!(
            redactor.redact("fetch https://me:hunter2@host.example/p?k=v#frag done"),
            "fetch https://host.example/p?<redacted> done"
        );
    }

    #[test]
    fn a_line_with_multibyte_text_around_every_rule_does_not_panic() {
        let redactor = EngineLineRedactor::new(
            Some("/Users/gw\u{e9}n".to_string()),
            Some("gw\u{e9}n".to_string()),
        );
        let out = redactor.redact(
            "\u{1F600} /Users/gw\u{e9}n/\u{e9} token=\u{e9}\u{e9} args=[\"\u{e9}\"] https://h\u{e9}/p?\u{e9} \u{2028}",
        );
        assert!(!out.contains("gw\u{e9}n"), "{out}");
        assert!(out.contains("args=<redacted 1>"), "{out}");
        assert!(out.contains("token=<redacted>"), "{out}");
    }

    #[test]
    fn redacting_a_redacted_line_changes_nothing() {
        let redactor = EngineLineRedactor::new(
            Some("/Users/gwen".to_string()),
            Some("quillfeather".to_string()),
        );
        let once = redactor.redact(
            "/Users/gwen/x account=quillfeather args=[\"a\",\"b\"] https://h/p?q=1 token=z",
        );
        assert_eq!(redactor.redact(&once), once);
    }

    type Captured = Arc<std::sync::Mutex<Vec<(Level, String)>>>;

    fn capturing(home: &Path) -> (ShellEngineLog, Captured) {
        let seen: Captured = Arc::default();
        let sink_seen = Arc::clone(&seen);
        let log = ShellEngineLog::for_home(home).with_sink(Box::new(move |level, line| {
            sink_seen.lock().unwrap().push((level, line.to_string()))
        }));
        (log, seen)
    }

    fn only_line(seen: &Captured) -> String {
        let lines = seen.lock().unwrap();
        assert_eq!(lines.len(), 1, "not exactly one line: {lines:?}");
        lines[0].1.clone()
    }

    /// A real builder of `gamelib-engine`'s dialogs, run through a context whose log is the shell's.
    fn notice_lines(home: &gamelib_testutil::FakeHome, refusal: bool) -> String {
        use gamelib_engine::launch::dialogs::{show_engine_dialog, show_engine_notice, Notice};
        let (log, seen) = capturing(home.root());
        let ctx = built(home).with_log(Arc::new(log));
        let notice = Notice {
            key: "gog:1",
            title: "Quail",
            body: "It did not start.",
            tag: "launch-deadline-unconfirmed",
        };
        if refusal {
            show_engine_dialog(&ctx, &notice);
        } else {
            show_engine_notice(&ctx, &notice);
        }
        only_line(&seen)
    }

    #[test]
    fn the_refusal_dialog_line_keeps_its_display_pending_literal() {
        let home = gamelib_testutil::FakeHome::new("engine-literal-refusal-");
        let line = notice_lines(&home, true);
        assert!(
            line.contains("[engine-notice] key=gog:1 tag=launch-deadline-unconfirmed dispatched=in-app-dialog+notify")
                && line.ends_with("display=pending"),
            "{line}"
        );
    }

    #[test]
    fn the_deadline_notice_line_keeps_its_raise_false_literal() {
        let home = gamelib_testutil::FakeHome::new("engine-literal-notice-");
        let line = notice_lines(&home, false);
        assert!(
            line.contains("[engine-notice] key=gog:1 tag=launch-deadline-unconfirmed")
                && line.ends_with("dispatched=notify raise=false"),
            "{line}"
        );
    }

    /// The other gate literals are written by private functions of the crates (the format strings are
    /// copied from `fallback/ensure.rs`, `launch/deadline.rs`, `launch/step.rs` and `tools/dxmt.rs`),
    /// so each is written here through the shell's log exactly as the crate would.
    fn written_through_the_shell_log(level: Level, text: &str) -> String {
        let home = gamelib_testutil::FakeHome::new("engine-literal-crate-");
        let (log, seen) = capturing(home.root());
        match level {
            Level::Warning => log.warn(text),
            Level::Error => log.error(text),
            _ => log.info(text),
        }
        only_line(&seen)
    }

    #[test]
    fn the_engine_download_lines_keep_their_literals() {
        for (text, literal) in [
            (
                "Engine: downloading Wine-Staging 11.20",
                "Engine: downloading Wine-Staging 11.20",
            ),
            (
                "Engine: verifying Wine-Staging",
                "Engine: verifying Wine-Staging",
            ),
            (
                "Engine: extracting Wine-Staging",
                "Engine: extracting Wine-Staging",
            ),
        ] {
            let line = written_through_the_shell_log(Level::Info, text);
            assert!(line.contains(literal), "{line}");
        }
    }

    #[test]
    fn the_launch_deadline_lines_keep_their_literals() {
        let fired = written_through_the_shell_log(
            Level::Warning,
            "Engine: gog:1 launch deadline fired (engine=crossover build=26.0.0 reason=cx-healthy) with no game process seen; not stopping anything",
        );
        assert!(fired.contains("launch deadline fired ("), "{fired}");
        let notice = written_through_the_shell_log(
            Level::Info,
            "Engine: gog:1 launch deadline notice surface=in-app pushed=true raise=false",
        );
        assert!(notice.ends_with("raise=false"), "{notice}");
    }

    #[test]
    fn the_offline_gate_warning_keeps_its_literal() {
        let line = written_through_the_shell_log(
            Level::Warning,
            "Engine: legendary:Quail launch blocked before pre-flight while offline (crossover-missing)",
        );
        assert!(
            line.contains("launch blocked before pre-flight while offline (crossover-missing)"),
            "{line}"
        );
    }

    #[test]
    fn the_dxmt_skip_line_keeps_its_literal_and_loses_its_profile_path() {
        let home = gamelib_testutil::FakeHome::new("engine-literal-dxmt-");
        let home_text = home.root().to_string_lossy().into_owned();
        let (log, seen) = capturing(home.root());
        log.warn(&format!(
            "Not creating DXMT copy of Wine-Staging-macOS-10: {home_text}/tools/wine/Wine-Staging-macOS-10/winemac.so winemac.so lacks the macdrv metal-view exports; missing _macdrv_functions. Existing -DXMT copies are left untouched."
        ));
        let line = only_line(&seen);
        assert!(
            line.contains("Not creating DXMT copy of Wine-Staging-macOS-10: ~/tools/wine/"),
            "{line}"
        );
        assert!(!line.contains(&home_text), "{line}");
    }
}
