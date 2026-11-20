//! Handlers the Rust native router serves (Phase 83, D-01). One pure function per channel; the
//! router in `native_router.rs` is glue only.
//!
//! D-07: the Rust positional args type is the schema authority for a native channel. Its shape is
//! described, and its accept/reject vectors are pinned, in
//! `src/common/types/ipc/nativeChannels.json`.

use crate::native_router::{invalid_args, NativeHost};
use crate::relay_commands::open_external_scheme_check;
use serde_json::Value;

/// The app version the shell was built as. The shell, `package.json` and `tauri.conf.json` agree
/// on it (plan 83-05 adds the parity gate), so this is what the renderer's About screen shows.
pub(crate) fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// Positional args of `getHeroicVersion`: none. A zero-field tuple struct reads only the empty
/// array, so any extra element is rejected by length before the handler body runs.
#[derive(serde::Deserialize)]
struct GetHeroicVersionArgs();

/// `getHeroicVersion` (invoke): answers the app version from the compiled-in crate version.
pub(crate) fn get_heroic_version(args: &[Value]) -> Result<Value, String> {
    serde_json::from_value::<GetHeroicVersionArgs>(Value::Array(args.to_vec()))
        .map_err(|_| invalid_args("getHeroicVersion", &["(args)"], &["too_big"]))?;
    Ok(Value::String(app_version().to_string()))
}

/// The longest `openExternalUrl` argument, in UTF-16 code units. The sidecar's zod `.max(8192)`
/// counted string length, which is UTF-16 code units, so the cap is measured the same way here:
/// a character outside the BMP counts twice.
pub(crate) const OPEN_EXTERNAL_URL_MAX_UTF16: usize = 8192;

/// Positional args of `openExternalUrl`: exactly one string. A one-element tuple reads only a
/// one-element array, so a missing or extra element, and a non-string, are rejected by serde. It
/// is a real tuple and not a one-field tuple struct: serde treats that as a newtype struct and
/// would hand it the whole array.
type OpenExternalUrlArgs = (String,);

/// Validate the args of an `openExternalUrl` send (the Phase 72 trust boundary, now in Rust).
///
/// The URL is renderer-controlled, so it must pass all of: the one-string shape, the 8192
/// UTF-16 cap, `url::Url::parse` (WHATWG `URL.canParse` parity, D-18) and the scheme allow-list in
/// [`open_external_scheme_check`]. The `Err` is a fixed category literal and never the URL: this
/// string can reach a log a user attaches to a public bug report (T-83-19).
pub(crate) fn parse_open_external_url(args: &[Value]) -> Result<String, &'static str> {
    let (url,) = serde_json::from_value::<OpenExternalUrlArgs>(Value::Array(args.to_vec()))
        .map_err(|_| "bad-args")?;
    if url.encode_utf16().count() > OPEN_EXTERNAL_URL_MAX_UTF16 {
        return Err("too-long");
    }
    if url::Url::parse(&url).is_err() {
        return Err("unparseable");
    }
    if open_external_scheme_check(&url).is_err() {
        return Err("scheme");
    }
    Ok(url)
}

/// `openExternalUrl` (send): hand a validated URL to the host's opener. The host returns at once
/// (its opener runs on a short-lived thread), so this never holds the slice queue open.
pub(crate) fn open_external_url(host: &dyn NativeHost, url: String) {
    host.open_url(url);
}
