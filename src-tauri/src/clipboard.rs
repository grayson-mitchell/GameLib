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

// Write text to the OS clipboard (Phase 34.3 Plan 03, D-01/D-02, REQ-34.3-03) via
// `tauri-plugin-clipboard-manager`'s `app.clipboard().write_text()`. Backs
// `platform/index.ts`'s `clipboard.writeText()`. This arm and `clipboard_read_text`
// below are the ONLY two new `dispatch_rust_channel` arms the entire 34.3 slice adds
// -- D-02's zero-renderer-capability-grant stance holds (capabilities/default.json is
// untouched; the plugin has no `js_init_script`, confirmed by 34.3-RESEARCH.md Q2).
pub(crate) fn rpc_clipboard_write_text(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    let a = ClipboardWriteTextArgs::from_args(args)?;
    app.clipboard()
        .write_text(a.text)
        .map_err(|e| e.to_string())?;
    Ok(Value::Null)
}

// Read text from the OS clipboard (Phase 34.3 Plan 03, D-01/D-02, REQ-34.3-03) via
// `tauri-plugin-clipboard-manager`'s `app.clipboard().read_text()`. Backs the
// sidecar's `clipboardReadText` handler (D-04 -- the read path bypasses
// `platformApi`'s sync stub and awaits this rustInvoke directly, since a sync
// function structurally cannot await a Rust round-trip). Safe to call `read_text()`
// here specifically because `dispatch_rust_channel` always runs on a
// `thread::spawn`'d worker thread (see `start_reader`), never the main/reader thread
// -- the plugin's own `desktop.rs` docstring warns `read_text()` must not be called on
// the main thread (Linux deadlock risk). A future refactor that moves dispatch onto
// the reader thread must not silently reintroduce that deadlock.
pub(crate) fn rpc_clipboard_read_text(app: &AppHandle) -> Result<Value, String> {
    clipboard_read_value(app.clipboard().read_text().map_err(|e| e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // ---- clipboard_write_text args (Phase 34.3 Plan 03, REQ-34.3-08; now the generated Args) ----
    //
    // RED direction: an implementation using `unwrap_or("")` instead of a hard parse would
    // flip the four rejection cases below to `Ok`.

    #[test]
    fn clipboard_text_arg_rejects_absent_args() {
        assert_eq!(
            ClipboardWriteTextArgs::from_args(&[]).unwrap_err(),
            "clipboard_write_text:bad-args"
        );
    }

    #[test]
    fn clipboard_text_arg_rejects_null() {
        assert_eq!(
            ClipboardWriteTextArgs::from_args(&[Value::Null]).unwrap_err(),
            "clipboard_write_text:bad-args"
        );
    }

    #[test]
    fn clipboard_text_arg_rejects_number() {
        assert!(ClipboardWriteTextArgs::from_args(&[json!(1)]).is_err());
    }

    #[test]
    fn clipboard_text_arg_rejects_bool() {
        assert!(ClipboardWriteTextArgs::from_args(&[Value::Bool(true)]).is_err());
    }

    #[test]
    fn clipboard_text_arg_accepts_empty_string() {
        // An empty string is a VALID clipboard write, not a missing argument.
        assert_eq!(
            ClipboardWriteTextArgs::from_args(&[json!("")]).unwrap().text,
            ""
        );
    }

    #[test]
    fn clipboard_text_arg_accepts_nonempty_string() {
        assert_eq!(
            ClipboardWriteTextArgs::from_args(&[json!("hi")]).unwrap().text,
            "hi"
        );
    }

    #[test]
    fn clipboard_text_arg_ignores_trailing_args() {
        assert_eq!(
            ClipboardWriteTextArgs::from_args(&[json!("hi"), json!("ignored")])
                .unwrap()
                .text,
            "hi"
        );
    }

    // ---- clipboard_read_value (Phase 34.3 Plan 03, REQ-34.3-08) ----
    //
    // RED direction: an implementation returning `Value::Null` for an empty clipboard would
    // fail the first case below — the sidecar's `clipboardReadText` handler coerces a
    // non-string result to `''`, which would mask that regression as an indistinguishable
    // empty read.

    #[test]
    fn clipboard_read_value_empty_string_is_not_null() {
        assert_eq!(
            clipboard_read_value(Ok(String::new())),
            Ok(Value::String(String::new()))
        );
    }

    #[test]
    fn clipboard_read_value_nonempty_string_round_trips() {
        assert_eq!(
            clipboard_read_value(Ok("hi".to_string())),
            Ok(Value::String("hi".to_string()))
        );
    }

    #[test]
    fn clipboard_read_value_propagates_error() {
        assert_eq!(
            clipboard_read_value(Err("boom".to_string())),
            Err("boom".to_string())
        );
    }
}
