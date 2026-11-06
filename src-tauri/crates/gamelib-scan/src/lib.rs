//! Tauri-free scanner library. `dispatch` is the single entry point shared by the in-process
//! sidecar bridge and `gamelib-scan-cli`. Not-a-PE / truncated / unreadable input is a RESULT;
//! `Err` means bad arguments, an unknown op or a panic only.

pub mod contain;
pub mod reader;

use serde::Deserialize;
use serde_json::Value;
use std::path::Path;

/// Ops reachable from the sidecar. Keep sorted.
pub const OPS: &[&str] = &["scan_contained_real"];
/// Ops reachable from the CLI only.
pub const CLI_ONLY_OPS: &[&str] = &[];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ContainedRealArgs {
    path: String,
    root_dir: String,
}

fn parse_args<T: for<'de> Deserialize<'de>>(op: &str, args: &[Value]) -> Result<T, String> {
    let bad = || format!("{op}:bad-args");
    if args.len() != 1 {
        return Err(bad());
    }
    serde_json::from_value(args[0].clone()).map_err(|_| bad())
}

fn run_op(op: &str, args: &[Value]) -> Result<Value, String> {
    match op {
        "scan_contained_real" => {
            let a: ContainedRealArgs = parse_args(op, args)?;
            let r = contain::contained_real(Path::new(&a.path), Path::new(&a.root_dir));
            serde_json::to_value(r).map_err(|_| format!("{op}:serialize"))
        }
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
    fn empty_args_is_bad_args() {
        assert_eq!(
            dispatch("scan_contained_real", &[]),
            Err("scan_contained_real:bad-args".to_string())
        );
    }

    #[test]
    fn extra_field_is_bad_args() {
        let a = json!({"path": "a", "rootDir": "b", "extra": 1});
        assert_eq!(
            dispatch("scan_contained_real", &[a]),
            Err("scan_contained_real:bad-args".to_string())
        );
    }

    #[test]
    fn unknown_op() {
        assert_eq!(dispatch("nope", &[]), Err("unknown-op:nope".to_string()));
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
    fn every_op_dispatches_bad_args_on_empty_args() {
        for op in OPS.iter().chain(CLI_ONLY_OPS.iter()) {
            let e = dispatch(op, &[]).unwrap_err();
            assert!(e.ends_with(":bad-args"), "{op}: {e}");
        }
    }

    #[test]
    fn panic_is_caught() {
        assert_eq!(
            dispatch("__panic_probe", &[]),
            Err("__panic_probe:panic".to_string())
        );
    }

    #[test]
    fn contained_real_end_to_end() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("a.exe");
        std::fs::write(&f, b"x").unwrap();
        let v = dispatch(
            "scan_contained_real",
            &[json!({"path": f.to_str().unwrap(), "rootDir": dir.path().to_str().unwrap()})],
        )
        .unwrap();
        assert!(v["real"].is_string());
    }
}
