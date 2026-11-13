//! Tauri-free Steam local-file-format library. `dispatch` is the single entry point shared by
//! the in-process sidecar bridge and `gamelib-steamfiles-cli`. Unreadable / malformed input is a
//! RESULT; `Err` means bad arguments, an unknown op, a panic or a serialize failure only.
//! Paths in, typed results out; no bytes cross the pipe (63 D-08).

pub mod acf;
pub mod atomic;
pub mod discover;
pub mod kv_bin;
pub mod kv_text;
pub mod library;
pub mod readers;
pub mod shortcuts;

use serde::Deserialize;
use serde_json::Value;

/// Ops reachable from the sidecar. Keep sorted. Registered in plan 11.
pub const OPS: &[&str] = &[];
/// Ops reachable from the CLI only.
pub const CLI_ONLY_OPS: &[&str] = &[];

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

    const TWELVE: [&str; 12] = [
        "steamfiles_discover_root",
        "steamfiles_find_acf",
        "steamfiles_parse_valve_manifest",
        "steamfiles_read_acf",
        "steamfiles_read_installscript",
        "steamfiles_read_library_folders",
        "steamfiles_read_localconfig_beta_key",
        "steamfiles_read_running_app_id",
        "steamfiles_scan_acfs",
        "steamfiles_shortcuts_apply",
        "steamfiles_shortcuts_read",
        "steamfiles_shortcuts_roundtrip",
    ];

    fn fixture(rel: &str) -> String {
        format!("{}/tests/fixtures/{rel}", env!("CARGO_MANIFEST_DIR"))
    }

    #[test]
    fn registry_is_the_twelve_ops() {
        assert_eq!(OPS, TWELVE.as_slice());
        assert_eq!(
            CLI_ONLY_OPS,
            ["steamfiles_discover_root", "steamfiles_shortcuts_roundtrip"].as_slice()
        );
    }

    #[test]
    fn every_op_dispatches_bad_args_on_empty_args() {
        for op in OPS {
            assert_eq!(dispatch(op, &[]), Err(format!("{op}:bad-args")), "{op}");
        }
    }

    #[test]
    fn every_op_rejects_unknown_fields() {
        for op in OPS {
            let r = dispatch(op, &[json!({"path": "x", "bogus": 1})]);
            assert_eq!(r, Err(format!("{op}:bad-args")), "{op}");
        }
    }

    #[test]
    fn path_ops_on_missing_file_are_results() {
        for op in [
            "steamfiles_read_acf",
            "steamfiles_read_library_folders",
            "steamfiles_read_running_app_id",
            "steamfiles_read_installscript",
            "steamfiles_parse_valve_manifest",
            "steamfiles_shortcuts_read",
            "steamfiles_shortcuts_roundtrip",
        ] {
            let r = dispatch(op, &[json!({"path": "/nonexistent/gamelib/zzz"})]).unwrap();
            assert_eq!(r["exists"], json!(false), "{op}: {r}");
        }
    }

    #[test]
    fn roundtrip_is_identical_on_valid_and_never_writes() {
        let p = fixture("shortcuts/tags.vdf");
        let before = std::fs::read(&p).unwrap();
        let r = dispatch("steamfiles_shortcuts_roundtrip", &[json!({ "path": p })]).unwrap();
        assert_eq!(r["identical"], json!(true));
        assert_eq!(r["len"], json!(before.len()));
        assert_eq!(std::fs::read(&p).unwrap(), before);
        let t = fixture("shortcuts/truncated.vdf");
        let r = dispatch("steamfiles_shortcuts_roundtrip", &[json!({ "path": t })]).unwrap();
        assert_eq!(r["parsed"], json!(false));
    }

    #[test]
    fn shortcuts_apply_add_creates_file() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("shortcuts.vdf");
        let r = dispatch(
            "steamfiles_shortcuts_apply",
            &[json!({
                "path": p.to_string_lossy(),
                "mutation": {"op": "add", "createIfMissing": true,
                    "entry": [{"kind": "string", "key": "AppName", "value": "G"}]}
            })],
        )
        .unwrap();
        assert_eq!(r["written"], json!(true));
    }

    #[test]
    fn other_ops_work_through_dispatch() {
        let r = dispatch("steamfiles_discover_root", &[json!({})]).unwrap();
        assert!(r["path"].is_string());
        let r = dispatch(
            "steamfiles_read_acf",
            &[json!({ "path": fixture("acf/installed.acf") })],
        )
        .unwrap();
        assert_eq!(r["exists"], json!(true));
        let r = dispatch(
            "steamfiles_scan_acfs",
            &[json!({ "steamappsDirs": [fixture("scan/lib1/steamapps")] })],
        )
        .unwrap();
        assert!(r.is_object());
        let r = dispatch(
            "steamfiles_find_acf",
            &[json!({ "steamappsDirs": [fixture("scan/lib1/steamapps")], "appId": "10" })],
        )
        .unwrap();
        assert!(r.is_object());
        let r = dispatch(
            "steamfiles_read_localconfig_beta_key",
            &[json!({ "path": fixture("localconfig/none.vdf"), "appId": "10" })],
        )
        .unwrap();
        assert!(r.is_object());
    }
}
