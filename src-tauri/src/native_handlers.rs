//! Handlers the Rust native router serves (Phase 83, D-01). One pure function per channel; the
//! router in `native_router.rs` is glue only.
//!
//! D-07: the Rust positional args type is the schema authority for a native channel. Its shape is
//! described, and its accept/reject vectors are pinned, in
//! `src/common/types/ipc/nativeChannels.json`.

use crate::native_router::{invalid_args, NativeHost};
use crate::relay_commands::open_external_scheme_check;
use serde_json::Value;
use std::sync::Arc;
use std::thread;

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

/// `openExternalUrl` (send): hand a validated URL to the host's opener on a short-lived thread and
/// return at once. On Windows `open_url` blocks while the OS shows a dialog (D-UAT-19), so calling
/// it on the slice worker would stall every later send behind it (Pitfall 3).
pub(crate) fn open_external_url(host: &Arc<dyn NativeHost>, url: String) -> Result<(), String> {
    let host = Arc::clone(host);
    thread::Builder::new()
        .name("native-open-url".to_string())
        .spawn(move || host.open_url(url))
        .map(|_| ())
        .map_err(|_| "could not start the opener thread".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// The cases the sidecar's `assertOpenableExternalUrl` test also reads.
    const POLICY_CASES: &str = include_str!("../../src/common/__fixtures__/openPolicyCases.json");

    fn parse(url: &str) -> Result<String, &'static str> {
        parse_open_external_url(&[json!(url)])
    }

    /// `https://example.com/` plus `a`s up to `units` UTF-16 code units.
    fn url_of_units(units: usize) -> String {
        let base = "https://example.com/";
        format!("{base}{}", "a".repeat(units - base.len()))
    }

    #[test]
    fn every_open_policy_url_case_gets_the_sidecars_verdict() {
        let cases: Value = serde_json::from_str(POLICY_CASES).expect("cases parse");
        let cases = cases["urlCases"].as_array().expect("urlCases array");
        assert!(
            cases.len() >= 10,
            "the shared cases were read: {}",
            cases.len()
        );
        for case in cases {
            let input = case["input"].as_str().expect("input is a string");
            match case["expect"].as_str().expect("expect is a string") {
                "allow" => assert!(parse(input).is_ok(), "{input} must be allowed"),
                "reject" => assert!(parse(input).is_err(), "{input} must be rejected"),
                other => panic!("unknown expectation {other}"),
            }
        }
    }

    #[test]
    fn an_https_url_of_exactly_8192_utf16_units_passes_and_8193_fails() {
        assert_eq!(parse(&url_of_units(8192)).map(|u| u.len()), Ok(8192));
        assert_eq!(parse(&url_of_units(8193)), Err("too-long"));
    }

    #[test]
    fn the_cap_counts_utf16_units_not_bytes_or_chars() {
        // 5000 two-byte, one-unit characters: 10_020 bytes but 5_020 units, so it passes.
        let two_byte = format!("https://example.com/{}", "\u{e9}".repeat(5000));
        assert!(two_byte.len() > OPEN_EXTERNAL_URL_MAX_UTF16);
        assert!(parse(&two_byte).is_ok());
        // An astral character is one `char` but two units: 4086 of them plus the 20-unit base is
        // exactly 8192 units and passes; one more is 8194 and fails.
        let astral = |n: usize| format!("https://example.com/{}", "\u{1f600}".repeat(n));
        assert!(parse(&astral(4086)).is_ok());
        assert_eq!(parse(&astral(4087)), Err("too-long"));
    }

    #[test]
    fn a_surrogate_pair_spanning_units_8192_and_8193_is_rejected() {
        // 8191 ASCII units, then one astral character: its two units are 8192 and 8193.
        let url = format!("{}\u{1f600}", url_of_units(8191));
        assert_eq!(url.encode_utf16().count(), 8193);
        assert_eq!(parse(&url), Err("too-long"));
    }

    #[test]
    fn shapes_that_url_can_parse_rejects_are_unparseable() {
        // Recorded against `URL.canParse` (Node 24): `https://` false, `http://exa mple.com` false,
        // `https:` false. A divergence in the url crate shows up here.
        assert_eq!(parse("https://"), Err("unparseable"));
        assert_eq!(parse("http://exa mple.com"), Err("unparseable"));
        assert_eq!(parse("https:"), Err("unparseable"));
    }

    #[test]
    fn shapes_that_url_can_parse_accepts_are_accepted() {
        // `URL.canParse` true for each: opaque-path and single-slash forms.
        assert_eq!(parse("mailto:").as_deref(), Ok("mailto:"));
        assert_eq!(parse("tel:+15551234").as_deref(), Ok("tel:+15551234"));
        assert_eq!(parse("https:/x").as_deref(), Ok("https:/x"));
    }

    #[test]
    fn empty_and_non_string_and_wrong_arity_args_are_bad_args_or_unparseable() {
        assert_eq!(parse_open_external_url(&[]), Err("bad-args"));
        assert_eq!(parse_open_external_url(&[Value::Null]), Err("bad-args"));
        assert_eq!(parse_open_external_url(&[json!(7)]), Err("bad-args"));
        assert_eq!(
            parse_open_external_url(&[json!("https://a"), json!("extra")]),
            Err("bad-args")
        );
        assert!(parse("").is_err());
    }

    #[test]
    fn the_error_is_a_fixed_category_and_never_the_url() {
        let secret = "https://SENTINEL-token-9f3a@exa mple.com/?k=SENTINEL-token-9f3a";
        let err = parse(secret).unwrap_err();
        assert!(!err.contains("SENTINEL"), "url leaked into {err}");
        assert!(["bad-args", "too-long", "unparseable", "scheme"].contains(&err));
    }
}
