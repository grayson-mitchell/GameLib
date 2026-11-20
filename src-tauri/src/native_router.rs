//! The Rust native router (Phase 83, D-01..D-04, D-06, D-07): renderer channels the shell answers
//! itself instead of relaying to the sidecar.
//!
//! Ownership is exclusive. `sidecar_invoke` consults the router right after the allow-list
//! verdict; a hit is answered here on any outcome and the sidecar is never asked (D-04: no flag,
//! no error-driven fallback). The channel sets are generated from
//! `src/common/types/ipc/nativeChannels.json` into `ipc_contract.rs` (`NATIVE_INVOKE_CHANNELS`,
//! `NATIVE_SEND_CHANNELS`), and the tests below prove this router's keys equal those sets.
//!
//! Rejections reuse the markers the renderer already classifies: an off-list name gets
//! `IPC_INVALID_CHANNEL_MARKER` from `relay_channel_verdict`, bad args get
//! `IPC_INVALID_ARGS_MARKER` from [`invalid_args`] (D-03 as refined by research F3), so
//! `bootErrorSurface` never paints a native rejection as a fatal boot error.

use crate::ipc_contract::{IPC_INVALID_ARGS, IPC_INVALID_ARGS_MARKER};
use crate::native_handlers;
use crate::relay_commands::echo_channel;
use serde_json::{json, Value};
use std::collections::HashMap;

/// Whether a native channel is request/response or fire-and-forget.
#[allow(dead_code)] // the send kind is wired by a later slice of this phase
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum NativeKind {
    Invoke,
    Send,
}

/// A native invoke handler: positional args in, the invoke's value or its error string out.
pub(crate) type InvokeHandler = fn(&[Value]) -> Result<Value, String>;

/// Native channel ownership, keyed by channel name.
pub(crate) struct NativeRouter {
    invoke: HashMap<&'static str, InvokeHandler>,
}

impl NativeRouter {
    pub(crate) fn new() -> Self {
        let mut invoke: HashMap<&'static str, InvokeHandler> = HashMap::new();
        invoke.insert("getHeroicVersion", native_handlers::get_heroic_version);
        Self { invoke }
    }

    /// The handler for a native-owned invoke channel; `None` means the sidecar owns it.
    pub(crate) fn invoke_handler(&self, channel: &str) -> Option<InvokeHandler> {
        self.invoke.get(channel).copied()
    }

    /// Sorted invoke channel names, for the ownership test.
    #[allow(dead_code)] // consumed by the ownership tests
    pub(crate) fn invoke_channels(&self) -> Vec<&'static str> {
        let mut names: Vec<&'static str> = self.invoke.keys().copied().collect();
        names.sort_unstable();
        names
    }

    /// Sorted send channel names, for the ownership test. No send channel is native yet.
    #[allow(dead_code)] // consumed by the ownership tests
    pub(crate) fn send_channels(&self) -> Vec<&'static str> {
        Vec::new()
    }
}

const PATH_SEGMENT_MAX: usize = 64;

/// Equal to the TS `sanitisePath` (`src/backend/sidecar/ipcValidation.ts`): `(args)` is kept
/// verbatim, every `.`-separated segment is cut to 64 characters and anything outside
/// `[A-Za-z0-9_-]` becomes `?`, so a path can neither flood nor forge a log line.
fn sanitise_path(path: &str) -> String {
    if path == "(args)" {
        return path.to_string();
    }
    path.split('.')
        .map(|seg| {
            seg.chars()
                .take(PATH_SEGMENT_MAX)
                .map(|c| {
                    if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                        c
                    } else {
                        '?'
                    }
                })
                .collect::<String>()
        })
        .collect::<Vec<_>>()
        .join(".")
}

/// The wire error for a native invoke whose args failed validation: the same
/// `IPC_INVALID_ARGS_MARKER` plus JSON tail the sidecar's `formatIpcInvalidArgsError` emits, with
/// the channel cut by `echo_channel`, sanitised paths and zod-vocabulary codes. It never carries
/// an argument value (D-10, T-83-08).
pub(crate) fn invalid_args(channel: &str, paths: &[&str], codes: &[&str]) -> String {
    let paths: Vec<String> = paths.iter().map(|p| sanitise_path(p)).collect();
    let codes: Vec<String> = codes.iter().map(|c| sanitise_path(c)).collect();
    let payload = json!({
        "code": IPC_INVALID_ARGS,
        "channel": echo_channel(channel),
        "paths": paths,
        "codes": codes,
    });
    format!("{IPC_INVALID_ARGS_MARKER} {payload}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ipc_contract::{NATIVE_INVOKE_CHANNELS, NATIVE_SEND_CHANNELS};
    use crate::relay_commands::relay_channel_verdict;

    const MANIFEST: &str = include_str!("../../src/common/types/ipc/nativeChannels.json");

    fn manifest() -> Value {
        serde_json::from_str(MANIFEST).expect("manifest parses")
    }

    fn vectors(spec: &Value, key: &str) -> Vec<Vec<Value>> {
        spec[key]
            .as_array()
            .unwrap_or_else(|| panic!("{key} is an array"))
            .iter()
            .map(|v| v.as_array().expect("vector is an array").clone())
            .collect()
    }

    fn tail(err: &str) -> Value {
        let rest = err
            .strip_prefix(IPC_INVALID_ARGS_MARKER)
            .unwrap_or_else(|| panic!("no INVALID_ARGS marker in {err}"));
        serde_json::from_str(rest.trim()).expect("tail is JSON")
    }

    #[test]
    fn native_router_invoke_keys_equal_generated_native_invoke_set() {
        let router = NativeRouter::new();
        assert_eq!(router.invoke_channels(), NATIVE_INVOKE_CHANNELS.to_vec());
    }

    #[test]
    fn native_router_send_keys_equal_generated_native_send_set() {
        let router = NativeRouter::new();
        assert_eq!(router.send_channels(), NATIVE_SEND_CHANNELS.to_vec());
    }

    #[test]
    fn every_native_channel_is_on_the_renderer_allow_list() {
        for name in NATIVE_INVOKE_CHANNELS.iter().chain(NATIVE_SEND_CHANNELS) {
            assert!(
                relay_channel_verdict(name).is_ok(),
                "{name} not allow-listed"
            );
        }
    }

    #[test]
    fn the_router_does_not_claim_sidecar_channels() {
        let router = NativeRouter::new();
        assert!(router.invoke_handler("pathExists").is_none());
        assert!(router.invoke_handler("").is_none());
        assert!(router.invoke_handler("getHeroicVersion").is_some());
    }

    #[test]
    fn native_manifest_vectors_valid_accept_invalid_reject() {
        let router = NativeRouter::new();
        let m = manifest();
        let channels = m["channels"].as_object().expect("channels object");
        for (name, spec) in channels {
            if spec["kind"] != "invoke" {
                continue;
            }
            let handler = router
                .invoke_handler(name)
                .unwrap_or_else(|| panic!("{name} has no native handler"));
            for args in vectors(spec, "valid") {
                assert!(handler(&args).is_ok(), "{name} rejected valid {args:?}");
            }
            for args in vectors(spec, "invalid") {
                let err = handler(&args)
                    .err()
                    .unwrap_or_else(|| panic!("{name} accepted invalid {args:?}"));
                let payload = tail(&err);
                let mut keys: Vec<&str> = payload
                    .as_object()
                    .unwrap()
                    .keys()
                    .map(String::as_str)
                    .collect();
                keys.sort_unstable();
                assert_eq!(keys, ["channel", "code", "codes", "paths"], "{name}");
                assert_eq!(payload["code"], IPC_INVALID_ARGS);
                assert_eq!(payload["channel"], name.as_str());
            }
        }
    }

    #[test]
    fn native_manifest_every_channel_has_an_invalid_vector() {
        let m = manifest();
        let channels = m["channels"].as_object().expect("channels object");
        let router = NativeRouter::new();
        if channels.is_empty() {
            assert!(
                router.invoke_channels().is_empty(),
                "the manifest names no channel but the router has a handler"
            );
        }
        for (name, spec) in channels {
            assert!(
                !vectors(spec, "invalid").is_empty(),
                "{name} has no invalid vector: a native channel needs a negative test"
            );
        }
    }

    #[test]
    fn native_rejection_never_echoes_an_argument() {
        let sentinel = "SENTINEL-secret-token-9f3a";
        let args = vec![Value::String(sentinel.to_string())];
        let err = native_handlers::get_heroic_version(&args).unwrap_err();
        assert!(!err.contains(sentinel), "argument value leaked: {err}");
        assert!(err.starts_with(IPC_INVALID_ARGS_MARKER));
    }

    #[test]
    fn get_heroic_version_extra_element_is_too_big_at_the_root() {
        let err = native_handlers::get_heroic_version(&[Value::Null]).unwrap_err();
        let payload = tail(&err);
        assert_eq!(payload["paths"], json!(["(args)"]));
        assert_eq!(payload["codes"], json!(["too_big"]));
    }

    #[test]
    fn get_heroic_version_answers_cargo_pkg_version() {
        let v = native_handlers::get_heroic_version(&[]).unwrap();
        assert_eq!(v, Value::String(env!("CARGO_PKG_VERSION").to_string()));
        assert_eq!(native_handlers::app_version(), env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn sanitise_path_matches_the_ts_rules() {
        assert_eq!(sanitise_path("(args)"), "(args)");
        assert_eq!(sanitise_path("a.b-c_d"), "a.b-c_d");
        assert_eq!(sanitise_path("a b\n"), "a?b?");
        assert_eq!(sanitise_path(&"x".repeat(100)).len(), 64);
        assert_eq!(sanitise_path("0.name"), "0.name");
    }

    #[test]
    fn invalid_args_cuts_a_hostile_channel_name() {
        let err = invalid_args(&"c\u{1b}".repeat(100), &["a.b"], &["too_big"]);
        let payload = tail(&err);
        let channel = payload["channel"].as_str().unwrap();
        assert!(channel.chars().count() <= 64);
        assert!(channel.chars().all(|c| c.is_ascii_graphic() || c == ' '));
    }
}
