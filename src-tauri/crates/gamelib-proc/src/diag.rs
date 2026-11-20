//! Diagnostics sink. The shell installs its own logger once at startup (plan 83-08); until then
//! (and in tests) lines go to stderr. Never route secrets through it: callers pass fixed text,
//! labels and OS error numbers only.

use std::sync::OnceLock;

static SINK: OnceLock<fn(&str)> = OnceLock::new();

fn default_sink(msg: &str) {
    eprintln!("[proc] {msg}");
}

/// Route crate diagnostics. First call wins.
pub fn set_diag_sink(f: fn(&str)) {
    let _ = SINK.set(f);
}

pub(crate) fn diag(msg: &str) {
    (SINK.get().copied().unwrap_or(default_sink))(msg);
}
