//! Tauri-free destructive-path safety library (Phase 82, D-06/D-07). `dispatch` is the single
//! entry point shared by the in-process sidecar bridge. A refusal, an unknown verdict or an
//! unreadable path is a RESULT in the reply; `Err` means bad arguments, an unknown op or a
//! panic only.
//!
//! Re-homing (Phase 83): no `tauri` dependency, no env or home-directory reads (every root is a
//! parameter), `dispatch` is a thin wrapper over the plain functions in `remove`, and the serde
//! types live in `wire`, so the modules can move into `gamelib-core` unchanged.
//!
//! The library logs nothing (T-28-04): replies carry closed-set reasons and the caller's own
//! ids and keys, never a path or a user name.

pub mod remove;
pub mod safe_path;
pub mod tri;
pub mod wire;

use safe_path::CaseMode;
use serde::Deserialize;
use serde_json::Value;

/// Ops reachable from the sidecar. Keep sorted.
pub const OPS: &[&str] = &["safety_check_removal", "safety_remove_tree"];
/// Ops reachable from a CLI only. There is no CLI crate: nothing in `meta/` needs one.
pub const CLI_ONLY_OPS: &[&str] = &[];

fn parse_args<T: for<'de> Deserialize<'de>>(op: &str, args: &[Value]) -> Result<T, String> {
    let bad = || format!("{op}:bad-args");
    if args.len() != 1 {
        return Err(bad());
    }
    serde_json::from_value(args[0].clone()).map_err(|_| bad())
}

fn to_value<T: serde::Serialize>(op: &str, v: T) -> Result<Value, String> {
    serde_json::to_value(v).map_err(|_| format!("{op}:serialize"))
}

fn run_op(op: &str, args: &[Value]) -> Result<Value, String> {
    match op {
        "safety_check_removal" => {
            let req: wire::Request = parse_args(op, args)?;
            to_value(op, remove::check_removal(&req, CaseMode::Auto))
        }
        "safety_remove_tree" => {
            let req: wire::Request = parse_args(op, args)?;
            to_value(op, remove::remove_tree(&req, CaseMode::Auto))
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
    use gamelib_testutil::FakeHome;
    use serde_json::json;
    use std::fs;

    #[test]
    fn empty_args_is_bad_args() {
        for op in OPS {
            assert_eq!(dispatch(op, &[]), Err(format!("{op}:bad-args")));
        }
    }

    #[test]
    fn unknown_field_is_bad_args() {
        let req = json!({"targets": [], "knownInstalls": [], "extra": 1});
        assert_eq!(
            dispatch("safety_check_removal", &[req]),
            Err("safety_check_removal:bad-args".to_string())
        );
        let target =
            json!({"targets": [{"id": "a", "path": "/x", "kind": "game-install", "bogus": 1}]});
        assert_eq!(
            dispatch("safety_check_removal", &[target]),
            Err("safety_check_removal:bad-args".to_string())
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
        assert!(CLI_ONLY_OPS.is_empty());
        assert!(!OPS.contains(&"__panic_probe"));
    }

    #[test]
    fn panic_is_caught() {
        assert_eq!(
            dispatch("__panic_probe", &[]),
            Err("__panic_probe:panic".to_string())
        );
    }

    /// The tracer row (D-09): target `common/Studio` holds another game's install
    /// `common/Studio/GameB`. The verdict travels through dispatch's serde wire, refuses with
    /// the other game's key, and removing is refused with everything still on disk.
    #[test]
    fn nested_installdir_refuses_through_dispatch_and_deletes_nothing() {
        let home = FakeHome::new("gamelib-safety-tracer-");
        let common = home.root().join("common");
        let studio = common.join("Studio");
        let game_b = studio.join("GameB");
        fs::create_dir_all(&game_b).unwrap();
        fs::write(game_b.join("b.exe"), b"b").unwrap();
        fs::write(studio.join("a.exe"), b"a").unwrap();
        let req = json!({
            "targets": [{
                "id": "studio",
                "path": studio.to_str().unwrap(),
                "kind": "game-install",
                "trustRoot": common.to_str().unwrap()
            }],
            "knownInstalls": [{"key": "steam:gameb", "path": game_b.to_str().unwrap()}],
            "selfKey": "steam:studio",
            "protectedRoots": []
        });
        let check = dispatch("safety_check_removal", std::slice::from_ref(&req)).unwrap();
        assert_eq!(check["overall"], "no");
        assert_eq!(check["items"][0]["reason"], "nested-known-install");
        assert_eq!(check["items"][0]["otherKey"], "steam:gameb");
        assert_eq!(check["items"][0]["id"], "studio");

        let removed = dispatch("safety_remove_tree", &[req]).unwrap();
        assert_eq!(removed["outcome"], "refused");
        assert_eq!(removed["overall"], "no");
        assert!(game_b.join("b.exe").exists());
        assert!(studio.join("a.exe").exists());
    }
}
