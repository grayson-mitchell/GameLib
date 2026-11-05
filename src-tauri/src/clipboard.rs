use super::*;

// ---- Clipboard arg/value helpers (Phase 34.3 Plan 03, D-01/D-02/REQ-34.3-08) ----
//
// The `clipboard_write_text`/`clipboard_read_text` dispatch arms below call
// `app.clipboard()`, which needs a live `AppHandle` and therefore cannot be driven from a
// plain `#[test]` (a `#[cfg(test)]` unit test structurally cannot construct a Tauri
// runtime). These two functions extract each arm's non-plugin logic into a pure,
// `AppHandle`-free surface so it can be proven by `#[cfg(test)] mod tests` below. The arms'
// actual plugin calls are proven empirically instead, by REQ-34.3-11's live-gate item 3 —
// not by these tests.

/// This channel's entire ASVS V5 input validation: `args[0]` must be present and a JSON
/// string. An empty string is a VALID clipboard write and must not be conflated with a
/// missing/wrong-typed argument — `unwrap_or("")` would silently accept both.
pub(crate) fn clipboard_text_arg(args: &[Value]) -> Result<&str, String> {
    args.first()
        .and_then(|v| v.as_str())
        .ok_or_else(|| "clipboard_write_text:bad-args".to_string())
}

/// Shapes the plugin's `Result<String, String>` into the arm's `Result<Value, String>`.
/// An empty clipboard read is `Ok(Value::String(String::new()))`, deliberately NOT
/// `Ok(Value::Null)` — the sidecar's `clipboardReadText` handler coerces a non-string result
/// to `''`, which would mask a `Value::Null` regression here as an indistinguishable empty
/// read instead of a visibly wrong shape.
pub(crate) fn clipboard_read_value(read: Result<String, String>) -> Result<Value, String> {
    match read {
        Ok(text) => Ok(Value::String(text)),
        Err(e) => Err(e),
    }
}

