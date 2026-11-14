//! Tauri-free Steam CM client library. `dispatch` is the single entry point shared by the
//! in-process sidecar bridge and `gamelib-steamcm-cli`.
//!
//! Results, not errors: a CM failure is a typed result `{ok:false, kind, eresult?}`, never `Err`.
//! `Err` means bad arguments, an unknown op, a panic or a serialize failure only.
//!
//! Secret hygiene (T-28-04): never log args, results, tokens, passwords or request codes, and
//! never derive `Debug` on a secret-bearing struct.

pub mod anon;
pub mod backend;
pub mod error;
pub mod facade;
#[cfg(test)]
pub(crate) mod fake;
pub mod liveness;
pub mod macowned;
pub mod ops;
pub mod refresh;
pub mod runtime;
pub mod session;
pub mod vent;
pub mod webauth;
pub mod wrap;

use serde::Deserialize;
use serde_json::Value;

/// Ops reachable from the sidecar and the CLI. Keep sorted. CLI-only ops are listed here too
/// (the library dispatches them) and again in `CLI_ONLY_OPS`.
pub const OPS: &[&str] = &[];
/// Ops reachable from the CLI only (the sidecar bridge does not expose them).
pub const CLI_ONLY_OPS: &[&str] = &[];

/// Install the process-wide rustls crypto provider (ring, CF-07). Idempotent: an already-installed
/// provider is not an error.
pub fn install_crypto_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}

#[allow(dead_code)]
fn parse_args<T: for<'de> Deserialize<'de>>(op: &str, args: &[Value]) -> Result<T, String> {
    let bad = || format!("{op}:bad-args");
    if args.len() != 1 {
        return Err(bad());
    }
    serde_json::from_value(args[0].clone()).map_err(|_| bad())
}

#[allow(dead_code)]
fn to_value<T: serde::Serialize>(op: &str, v: T) -> Result<Value, String> {
    serde_json::to_value(v).map_err(|_| format!("{op}:serialize"))
}

fn run_op(op: &str, _args: &[Value]) -> Result<Value, String> {
    match op {
        #[cfg(test)]
        "__panic_probe" => panic!("probe"),
        _ => Err(format!("unknown-op:{op}")),
    }
}

pub fn dispatch(op: &str, args: &[Value]) -> Result<Value, String> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| run_op(op, args)))
        .unwrap_or_else(|_| Err(format!("{op}:panic")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn unknown_op() {
        assert_eq!(
            dispatch("nope", &[json!({})]),
            Err("unknown-op:nope".to_string())
        );
    }

    #[test]
    fn panic_is_caught() {
        assert_eq!(
            dispatch("__panic_probe", &[]),
            Err("__panic_probe:panic".to_string())
        );
    }

    #[test]
    fn ops_list_is_sorted_and_unique() {
        let mut v: Vec<&str> = OPS.to_vec();
        v.sort_unstable();
        v.dedup();
        assert_eq!(v, OPS.to_vec());
        assert!(!OPS.contains(&"__panic_probe"));
    }

    #[test]
    fn cli_only_ops_are_registered() {
        for op in CLI_ONLY_OPS {
            assert!(OPS.contains(op), "{op}");
        }
    }

    #[test]
    fn parse_args_requires_exactly_one() {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct A {
            #[allow(dead_code)]
            x: u8,
        }
        assert_eq!(
            parse_args::<A>("o", &[]).err(),
            Some("o:bad-args".to_string())
        );
        assert!(parse_args::<A>("o", &[json!({"x": 1})]).is_ok());
        assert!(parse_args::<A>("o", &[json!({"x": 1, "y": 2})]).is_err());
    }

    #[test]
    fn crypto_provider_install_is_idempotent() {
        install_crypto_provider();
        install_crypto_provider();
    }
}
