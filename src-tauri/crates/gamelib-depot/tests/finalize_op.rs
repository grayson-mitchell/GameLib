//! D-03 / plan 75-19: the no-download `depot_finalize` op, exercised through `dispatch`.

use gamelib_depot::{dispatch, JobContext, JobEvent, JobHost, TokenRequest};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

struct NullHost;
impl JobHost for NullHost {
    fn emit(&self, _ev: JobEvent) {}
    fn cdn_token(&self, _req: TokenRequest) -> Result<Option<String>, String> {
        Ok(None)
    }
    fn manifest_request_code(
        &self,
        _a: &str,
        _d: &str,
        _m: &str,
    ) -> Result<Option<String>, String> {
        Ok(None)
    }
}

fn call(args: Value) -> Result<Value, String> {
    let ctx = JobContext {
        cache_dir: PathBuf::from("/tmp"),
    };
    dispatch("depot_finalize", &args, &ctx, Arc::new(NullHost))
}

fn args(dir: &Path, installdir: &str, app_id: &str, allow: bool, outcome: Value) -> Value {
    json!({
        "appId": app_id,
        "finalize": {
            "steamappsDir": dir.to_string_lossy(),
            "installdir": installdir,
            "name": "Game",
            "buildid": "12345",
            "lastOwner": "76561198999999999",
            "allowFullOwnership": allow,
        },
        "depots": [],
        "outcome": outcome,
    })
}

fn seed_install(dir: &Path, bytes: usize) {
    let g = dir.join("common").join("Game");
    fs::create_dir_all(&g).unwrap();
    fs::write(g.join("a.bin"), vec![7u8; bytes]).unwrap();
}

#[test]
fn cancelled_over_installed_manifest_preserves_it_byte_identical() {
    let t = tempfile::tempdir().unwrap();
    let acf = t.path().join("appmanifest_480.acf");
    fs::write(&acf, "\"AppState\"\n{\n\t\"StateFlags\"\t\t\"4\"\n}\n").unwrap();
    let before = fs::read(&acf).unwrap();
    let r = call(args(t.path(), "Game", "480", false, json!("cancelled"))).unwrap();
    assert_eq!(r, json!({ "preserved": true, "stateFlags": 4 }));
    assert_eq!(fs::read(&acf).unwrap(), before);
}

#[test]
fn cancelled_without_manifest_writes_1026_with_measured_size() {
    let t = tempfile::tempdir().unwrap();
    seed_install(t.path(), 1000);
    let r = call(args(t.path(), "Game", "480", false, json!("cancelled"))).unwrap();
    assert_eq!(r["acf"]["stateFlags"], "1026");
    assert_eq!(r["acf"]["sizeOnDisk"], "1000");
    assert!(t.path().join("appmanifest_480.acf").exists());
}

#[test]
fn null_outcome_no_depots_writes_1026_measured() {
    let t = tempfile::tempdir().unwrap();
    seed_install(t.path(), 321);
    let r = call(args(t.path(), "Game", "480", false, Value::Null)).unwrap();
    assert_eq!(r["acf"]["stateFlags"], "1026");
    assert_eq!(r["acf"]["sizeOnDisk"], "321");
}

#[test]
fn allow_full_ownership_still_fails_closed() {
    let t = tempfile::tempdir().unwrap();
    seed_install(t.path(), 10);
    let r = call(args(t.path(), "Game", "480", true, Value::Null)).unwrap();
    assert_eq!(r["acf"]["stateFlags"], "1026");
    let text = fs::read_to_string(t.path().join("appmanifest_480.acf")).unwrap();
    assert!(text.contains("\"StateFlags\"\t\t\"1026\""));
}

#[test]
fn last_owner_is_written_as_string_verbatim() {
    let t = tempfile::tempdir().unwrap();
    seed_install(t.path(), 10);
    call(args(t.path(), "Game", "480", false, Value::Null)).unwrap();
    let text = fs::read_to_string(t.path().join("appmanifest_480.acf")).unwrap();
    assert!(text.contains("\"LastOwner\"\t\t\"76561198999999999\""));
}

#[test]
fn non_numeric_app_id_is_an_error_result() {
    let t = tempfile::tempdir().unwrap();
    let r = call(args(t.path(), "Game", "48x", false, Value::Null)).unwrap();
    let msg = r["error"]["message"].as_str().unwrap();
    assert!(msg.contains("rejected non-numeric appId"), "{msg}");
}

/// 75 WR-08: the id is validated before the cancel-preserve read joins it into a path, so a
/// traversal id cannot read an installed manifest outside steamapps and answer `preserved`.
#[test]
fn cancelled_traversal_app_id_is_rejected_before_any_read() {
    let t = tempfile::tempdir().unwrap();
    let steamapps = t.path().join("steamapps");
    fs::create_dir_all(steamapps.join("appmanifest_1")).unwrap();
    let outside = t.path().join("outside");
    fs::create_dir_all(&outside).unwrap();
    fs::write(
        outside.join("appmanifest_480.acf"),
        "\"AppState\"\n{\n\t\"StateFlags\"\t\t\"4\"\n}\n",
    )
    .unwrap();
    let id = "1/../../outside/appmanifest_480";
    let r = call(args(&steamapps, "Game", id, false, json!("cancelled"))).unwrap();
    assert!(r.get("preserved").is_none(), "{r}");
    let msg = r["error"]["message"].as_str().unwrap();
    assert!(msg.contains("rejected non-numeric appId"), "{msg}");
}

#[test]
fn installdir_escape_is_an_error_result() {
    let t = tempfile::tempdir().unwrap();
    let r = call(args(t.path(), "../escape", "480", false, Value::Null)).unwrap();
    assert!(r.get("error").is_some(), "{r}");
    assert!(!t.path().join("appmanifest_480.acf").exists());
}

#[test]
fn unknown_arg_field_is_bad_args() {
    let t = tempfile::tempdir().unwrap();
    let mut a = args(t.path(), "Game", "480", false, Value::Null);
    a["extra"] = json!(1);
    assert_eq!(call(a), Err("depot_finalize:bad-args".to_string()));
}
