//! Handlers for the two bottle-file rustInvoke channels (Phase 85 plan 18, D-17): `store_version_gate`
//! and `store_backup_file`.
//!
//! Two files live inside a Wine bottle instead of the store tree and carry a top-level numeric
//! `version`: `<bottle>/.gamelib-engine.json` and `<bottle>/gamelib-shared-redists.json`. The
//! sidecar's engine switch and shared-redist installer ask Rust whether such a file may be
//! rewritten (`gamelib_store::version_gate`, refuse-newer) and have an unreadable ledger backed up
//! (`gamelib_store::backup`). Both channels take a path from the sidecar, so each validates it
//! before touching the disk (T-85-46): absolute, no `..` component, a file name that is exactly one
//! of the two marker names, and the chain key that name belongs to. Anything else is
//! `<channel>:bad-args`, and a backup is only ever written beside the file it names.
//!
//! No path, no file content and no version is logged here (T-28-04); a reply carries a closed-set
//! state and numbers only. No process, thread or timer is started, so the Rust shutdown contract
//! has nothing to register.

use std::fs;
use std::io;
use std::path::{Component, Path};
use std::time::SystemTime;

use super::*;

/// The two bottle-local versioned files: file name, then the chain key `Chains` knows it by.
const BOTTLE_FILES: [(&str, &str); 2] = [
    (".gamelib-engine.json", "engine/gamelib-engine-marker"),
    ("gamelib-shared-redists.json", "steam_bridge/shared-redists"),
];

/// Whether `path` is an absolute, `..`-free path to one of [`BOTTLE_FILES`], and, when `chain` is
/// given, the chain that file belongs to.
fn valid_bottle_path(path: &str, chain: Option<&str>) -> bool {
    let p = Path::new(path);
    if !p.is_absolute() || p.components().any(|c| matches!(c, Component::ParentDir)) {
        return false;
    }
    let Some(file) = p.file_name().and_then(|n| n.to_str()) else {
        return false;
    };
    BOTTLE_FILES
        .iter()
        .any(|(name, key)| *name == file && chain.is_none_or(|c| c == *key))
}

pub(crate) fn rpc_store_version_gate(args: &[Value]) -> Result<Value, String> {
    const BAD: &str = "store_version_gate:bad-args";
    let a = StoreVersionGateArgs::from_args(args)?;
    if !valid_bottle_path(&a.path, Some(&a.chain)) {
        return Err(BAD.to_string());
    }
    let outcome = gamelib_store::version_gate::version_gate(Path::new(&a.path), &a.chain);
    serde_json::to_value(outcome).map_err(|_| BAD.to_string())
}

pub(crate) fn rpc_store_backup_file(args: &[Value]) -> Result<Value, String> {
    const BAD: &str = "store_backup_file:bad-args";
    let a = StoreBackupFileArgs::from_args(args)?;
    let from = u32::try_from(a.from_version).map_err(|_| BAD.to_string())?;
    if !valid_bottle_path(&a.path, None) {
        return Err(BAD.to_string());
    }
    let path = Path::new(&a.path);
    let bytes = match fs::read(path) {
        Ok(b) => b,
        // Nothing to back up: the file is gone.
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Value::Null),
        Err(_) => return Err("store_backup_file:read-failed".to_string()),
    };
    let written =
        gamelib_store::backup::write_pre_migration_backup(path, from, &bytes, SystemTime::now())
            .map_err(|_| "store_backup_file:write-failed".to_string())?;
    Ok(written.file_name().map_or(Value::Null, |n| {
        Value::String(n.to_string_lossy().into_owned())
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const MARKER: &str = ".gamelib-engine.json";
    const LEDGER: &str = "gamelib-shared-redists.json";
    const MARKER_CHAIN: &str = "engine/gamelib-engine-marker";
    const LEDGER_CHAIN: &str = "steam_bridge/shared-redists";

    fn gate(path: &Path, chain: &str) -> Result<Value, String> {
        rpc_store_version_gate(&[json!({ "path": path.to_str().unwrap(), "chain": chain })])
    }

    fn backup(path: &Path, from: i64) -> Result<Value, String> {
        rpc_store_backup_file(&[json!({ "path": path.to_str().unwrap(), "fromVersion": from })])
    }

    fn bottle() -> (gamelib_testutil::FakeHome, std::path::PathBuf) {
        let home = gamelib_testutil::FakeHome::new("gamelib-shell-store-gate-");
        let dir = home.root().join("bottle");
        fs::create_dir_all(&dir).unwrap();
        (home, dir)
    }

    #[test]
    fn store_gate_reports_each_state_through_the_arm() {
        let (_home, dir) = bottle();
        let marker = dir.join(MARKER);
        assert_eq!(
            gate(&marker, MARKER_CHAIN).unwrap(),
            json!({ "state": "absent", "version": 0, "current": 1 })
        );
        fs::write(&marker, br#"{"version":1,"kind":"crossover"}"#).unwrap();
        assert_eq!(
            gate(&marker, MARKER_CHAIN).unwrap(),
            json!({ "state": "ok", "version": 1, "current": 1 })
        );
        fs::write(&marker, br#"{"version":7}"#).unwrap();
        assert_eq!(
            gate(&marker, MARKER_CHAIN).unwrap(),
            json!({ "state": "newer", "version": 7, "current": 1 })
        );
        assert_eq!(fs::read(&marker).unwrap(), br#"{"version":7}"#);
        let ledger = dir.join(LEDGER);
        fs::write(&ledger, b"{torn").unwrap();
        assert_eq!(gate(&ledger, LEDGER_CHAIN).unwrap()["state"], "unreadable");
    }

    #[test]
    fn store_gate_rejects_every_path_or_chain_it_does_not_own() {
        let (_home, dir) = bottle();
        let marker = dir.join(MARKER);
        let bad = "store_version_gate:bad-args";
        // The wrong chain for the file name, and a chain that exists but is not a bottle file's.
        assert_eq!(gate(&marker, LEDGER_CHAIN).unwrap_err(), bad);
        assert_eq!(gate(&marker, "store/config").unwrap_err(), bad);
        // Another file name, even one in the same directory.
        assert_eq!(
            gate(&dir.join("config.json"), MARKER_CHAIN).unwrap_err(),
            bad
        );
        assert_eq!(
            gate(&dir.join(format!("{MARKER}.bak")), MARKER_CHAIN).unwrap_err(),
            bad
        );
        // Relative, empty and `..` paths.
        for p in [
            MARKER.to_string(),
            format!("bottle/{MARKER}"),
            String::new(),
            format!("{}/../bottle/{MARKER}", dir.to_str().unwrap()),
            format!("{}/../../{MARKER}", dir.to_str().unwrap()),
        ] {
            let r = rpc_store_version_gate(&[json!({ "path": p, "chain": MARKER_CHAIN })]);
            assert_eq!(r.unwrap_err(), bad, "{p}");
        }
        // Shape errors come from the generated Args.
        assert_eq!(rpc_store_version_gate(&[]).unwrap_err(), bad);
        assert_eq!(
            rpc_store_version_gate(&[json!({ "path": 1, "chain": 2 })]).unwrap_err(),
            bad
        );
    }

    #[test]
    fn store_gate_backup_writes_beside_the_file_and_keeps_three() {
        let (_home, dir) = bottle();
        let ledger = dir.join(LEDGER);
        fs::write(&ledger, b"{torn").unwrap();
        let name = backup(&ledger, 0).unwrap();
        let name = name.as_str().expect("a file name").to_string();
        assert!(
            name.starts_with("gamelib-shared-redists.v0.") && name.ends_with(".bak.json"),
            "{name}"
        );
        assert_eq!(fs::read(dir.join(&name)).unwrap(), b"{torn");
        // The ledger itself is untouched.
        assert_eq!(fs::read(&ledger).unwrap(), b"{torn");
        // The same bytes again are not written twice.
        assert_eq!(backup(&ledger, 0).unwrap(), Value::String(name));
        for i in 0..5 {
            fs::write(&ledger, format!("{{torn{i}")).unwrap();
            backup(&ledger, 0).unwrap();
            std::thread::sleep(std::time::Duration::from_millis(2));
        }
        let count = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().ends_with(".bak.json"))
            .count();
        assert_eq!(count, 3);
    }

    #[cfg(unix)]
    #[test]
    fn store_gate_backup_is_private() {
        use std::os::unix::fs::PermissionsExt;
        let (_home, dir) = bottle();
        let ledger = dir.join(LEDGER);
        fs::write(&ledger, b"{torn").unwrap();
        let name = backup(&ledger, 1).unwrap();
        let made = dir.join(name.as_str().unwrap());
        assert_eq!(
            fs::metadata(made).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }

    #[test]
    fn store_gate_backup_of_an_absent_file_is_null_and_bad_args_are_rejected() {
        let (_home, dir) = bottle();
        assert_eq!(backup(&dir.join(LEDGER), 0).unwrap(), Value::Null);
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 0);
        let bad = "store_backup_file:bad-args";
        assert_eq!(backup(&dir.join("config.json"), 0).unwrap_err(), bad);
        assert_eq!(backup(&dir.join(LEDGER), -1).unwrap_err(), bad);
        assert_eq!(
            backup(&dir.join(LEDGER), i64::from(u32::MAX) + 1).unwrap_err(),
            bad
        );
        let dotdot = format!("{}/../bottle/{LEDGER}", dir.to_str().unwrap());
        assert_eq!(
            rpc_store_backup_file(&[json!({ "path": dotdot, "fromVersion": 0 })]).unwrap_err(),
            bad
        );
        assert_eq!(rpc_store_backup_file(&[]).unwrap_err(), bad);
        assert_eq!(
            rpc_store_backup_file(&[
                json!({ "path": "gamelib-shared-redists.json", "fromVersion": 0 })
            ])
            .unwrap_err(),
            bad
        );
    }
}
