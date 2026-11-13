//! Typed ACF reader tests (P75-A, D-03): every value a decoded string, failures are results.

use gamelib_steamfiles::acf::{read_acf, read_acf_bytes, AcfReadResult};
use std::path::PathBuf;

fn fx(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/acf")
        .join(name)
}

fn read(name: &str) -> AcfReadResult {
    read_acf(&fx(name))
}

#[test]
fn installed_is_typed() {
    let r = read("installed.acf");
    assert!(r.exists && r.parsed && r.read_error.is_none());
    let rec = r.record.expect("record");
    assert_eq!(rec.appid.as_deref(), Some("10"));
    assert_eq!(rec.name.as_deref(), Some("Synthetic Game"));
    assert_eq!(rec.state_flags, Some(4));
    assert_eq!(rec.state_flags_raw.as_deref(), Some("4"));
    assert_eq!(rec.size_on_disk.as_deref(), Some("123456789"));
    assert_eq!(rec.buildid.as_deref(), Some("1234567"));
    assert_eq!(rec.beta_key.as_deref(), Some("beta_a"));
    assert_eq!(rec.installed_depots.len(), 2);
    assert_eq!(rec.installed_depots[0].depot_id, "11");
    assert_eq!(rec.installed_depots[0].dlc_app_id, None);
    assert_eq!(rec.installed_depots[1].dlc_app_id.as_deref(), Some("13"));
}

#[test]
fn big_ids_stay_exact_strings() {
    let rec = read("big-ids.acf").record.expect("record");
    assert_eq!(rec.last_owner.as_deref(), Some("76561198999999999"));
    assert_eq!(rec.installed_depots[0].manifest, "9007199254740993");
    assert_eq!(rec.installed_depots[1].manifest, "9223372036854775807");
}

#[test]
fn coercion_never_happens() {
    let rec = read("coercion.acf").record.expect("record");
    assert_eq!(rec.name.as_deref(), Some("1979"));
    assert_eq!(rec.buildid.as_deref(), Some("0123"));
    assert_eq!(rec.installdir.as_deref(), Some("1e3"));
}

#[test]
fn escapes_are_decoded() {
    let rec = read("escapes.acf").record.expect("record");
    assert_eq!(rec.name.as_deref(), Some("Say \"Hi\" \\ there"));
    assert_eq!(rec.installdir.as_deref(), Some("Sub\\Dir"));
}

#[test]
fn lowercase_keys_found() {
    let rec = read("lowercase-keys.acf").record.expect("record");
    assert_eq!(rec.state_flags, Some(4));
    assert_eq!(rec.installed_depots.len(), 1);
}

#[test]
fn no_appstate_is_a_result() {
    let r = read("no-appstate.acf");
    assert!(r.exists && !r.parsed);
    assert_eq!(r.read_error, None);
    assert_eq!(r.record, None);
}

#[test]
fn unbalanced_is_a_result() {
    let r = read("unbalanced.acf");
    assert!(r.exists && !r.parsed && r.record.is_none());
    let e = r.read_error.expect("error");
    assert!(e.starts_with("parse: Unbalanced at "), "{e}");
}

#[test]
fn missing_path() {
    let r = read_acf(&fx("does-not-exist.acf"));
    assert!(!r.exists && !r.parsed && r.record.is_none());
}

#[test]
fn oversize_file_is_too_large() {
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("appmanifest_1.acf");
    std::fs::write(&p, vec![b' '; 4 * 1024 * 1024 + 1]).unwrap();
    let r = read_acf(&p);
    assert!(r.exists && !r.parsed);
    assert!(r.read_error.expect("error").contains("TooLarge"));
}

#[test]
fn bytes_entry_point_and_serde_shape() {
    let r = read_acf_bytes(b"\"AppState\"\n{\n\"appid\" \"5\"\n\"StateFlags\" \"x\"\n}\n");
    assert!(r.exists && r.parsed);
    let rec = r.record.clone().unwrap();
    assert_eq!(rec.state_flags, None);
    assert_eq!(rec.state_flags_raw.as_deref(), Some("x"));
    let v = serde_json::to_value(&r).unwrap();
    assert_eq!(v["record"]["stateFlagsRaw"], "x");
    assert!(v["record"]["installedDepots"]
        .as_array()
        .unwrap()
        .is_empty());
}

#[test]
fn every_fixture_is_total() {
    for e in std::fs::read_dir(fx("")).unwrap() {
        let _ = read_acf(&e.unwrap().path());
    }
}
