//! Ports of manifest.test.ts and depot.finalize.test.ts vectors for the ACF text, atomic write,
//! measured size and the full-ownership gate. TS titles are quoted in comments.

use gamelib_depot::acf::*;
use gamelib_depot::job::{FinalizeSpec, PlannedDepot};
use gamelib_depot::outcome::{ErrorKind, Failure};
use std::fs;

fn base() -> AppManifestParams {
    AppManifestParams {
        app_id: "264160".into(),
        installdir: "WazHack".into(),
        name: "WazHack".into(),
        size_on_disk: "123456789".into(),
        buildid: None,
        last_owner: None,
        state_flags: None,
        bytes: None,
        installed_depots: vec![InstalledDepot {
            depot_id: "264161".into(),
            manifest: "1234567890123456789".into(),
            size: 1000,
        }],
    }
}

fn text(p: &AppManifestParams) -> String {
    build_app_manifest_text(p, 1700000000).unwrap()
}

fn count(hay: &str, needle: &str) -> usize {
    hay.matches(needle).count()
}

// Golden: exact TS string (tabs, key order, InstalledDepots block).
#[test]
fn golden_text_matches_ts_shape() {
    let expect = "\"AppState\"\n{\n\t\"appid\"\t\t\"264160\"\n\t\"Universe\"\t\t\"1\"\n\t\"StateFlags\"\t\t\"1026\"\n\t\"installdir\"\t\t\"WazHack\"\n\t\"name\"\t\t\"WazHack\"\n\t\"LastUpdated\"\t\t\"1700000000\"\n\t\"SizeOnDisk\"\t\t\"123456789\"\n\t\"buildid\"\t\t\"0\"\n\t\"LastOwner\"\t\t\"0\"\n\t\"BytesToDownload\"\t\t\"0\"\n\t\"BytesDownloaded\"\t\t\"0\"\n\t\"AutoUpdateBehavior\"\t\t\"0\"\n\t\"InstalledDepots\"\n\t{\n\t\t\"264161\"\n\t\t{\n\t\t\t\"manifest\"\t\t\"1234567890123456789\"\n\t\t\t\"size\"\t\t\"1000\"\n\t\t}\n\t}\n\t\"UserConfig\"\n\t{\n\t}\n\t\"MountedDepots\"\n\t{\n\t}\n}\n";
    assert_eq!(text(&base()), expect);
}

// "emits StateFlags exactly \"1026\""
#[test]
fn state_flags_default_1026() {
    assert!(text(&base()).contains("\"StateFlags\"\t\t\"1026\""));
}

// "preserves a 19-digit InstalledDepots GID with exact string equality (no rounding)"
#[test]
fn gid_19_digits_exact() {
    assert!(text(&base()).contains("\"manifest\"\t\t\"1234567890123456789\""));
}

// "writes one InstalledDepots child block per depot for multi-depot input"
#[test]
fn one_block_per_depot() {
    let mut p = base();
    p.installed_depots.push(InstalledDepot {
        depot_id: "264162".into(),
        manifest: "99".into(),
        size: 5,
    });
    let t = text(&p);
    assert_eq!(count(&t, "\"manifest\""), 2);
    assert!(t.contains("\"264162\""));
}

// "includes the minimum fields required for Steam adoption"
#[test]
fn minimum_fields_present() {
    let t = text(&base());
    for k in [
        "appid",
        "Universe",
        "StateFlags",
        "installdir",
        "name",
        "LastUpdated",
        "SizeOnDisk",
        "buildid",
        "LastOwner",
        "BytesToDownload",
        "BytesDownloaded",
        "InstalledDepots",
    ] {
        assert!(t.contains(&format!("\"{k}\"")), "{k}");
    }
}

// "rejects a non-numeric appId before interpolation (T-21-05)"
#[test]
fn rejects_non_numeric_app_id() {
    let mut p = base();
    p.app_id = "26a".into();
    assert!(build_app_manifest_text(&p, 1).is_err());
}

// "rejects a non-numeric depotId before interpolation (T-21-05)"
#[test]
fn rejects_non_numeric_depot_id() {
    let mut p = base();
    p.installed_depots[0].depot_id = "1\"x".into();
    assert!(build_app_manifest_text(&p, 1).is_err());
}

// "rejects a non-numeric manifest GID ... cannot inject a sibling VDF key"
#[test]
fn rejects_non_numeric_gid() {
    let mut p = base();
    p.installed_depots[0].manifest = "1\"\n\"StateFlags\"\"4".into();
    assert!(build_app_manifest_text(&p, 1).is_err());
}

// "WR-01: a crafted name embedding a StateFlags injection payload cannot add a second key"
#[test]
fn name_injection_neutralised() {
    let mut p = base();
    p.name = "Foo\" \"StateFlags\" \"4".into();
    let t = text(&p);
    // The payload stays inside the escaped name value: one real key, plus the escaped copy.
    assert_eq!(count(&t, "\t\"StateFlags\"\t\t"), 1);
    assert!(t.contains("Foo\\\" \\\"StateFlags\\\" \\\"4"));
    assert!(t.contains("\"StateFlags\"\t\t\"1026\""));
}

// "WR-01: embedded quote/backslash/newline in name and installdir are neutralized"
#[test]
fn control_chars_neutralised() {
    let mut p = base();
    p.name = "Weird\\Name\"With\nControl\rChars\tHere".into();
    p.installdir = "Weird\\Dir\"With\nControl\rChars\tHere".into();
    let t = text(&p);
    assert!(t.contains("\\\\Name"));
    assert!(t.contains("\\\\Dir"));
    assert!(t.contains("\\\"With"));
    assert!(t.contains("Weird\\\\Name\\\"With Control Chars Here"));
    assert!(t.contains("Weird\\\\Dir\\\"With Control Chars Here"));
}

// "WR-01: a well-formed name/installdir round-trips unchanged"
#[test]
fn well_formed_round_trips() {
    let mut p = base();
    p.name = "Half-Life 2".into();
    p.installdir = "Half-Life 2".into();
    let t = text(&p);
    assert!(t.contains("\"name\"\t\t\"Half-Life 2\""));
    assert!(t.contains("\"installdir\"\t\t\"Half-Life 2\""));
}

// "a real public-branch buildid is interpolated verbatim (D-02)"
#[test]
fn buildid_verbatim() {
    let mut p = base();
    p.buildid = Some("123456".into());
    assert!(text(&p).contains("\"buildid\"\t\t\"123456\""));
}

// "rejects a non-numeric buildid before interpolation (T-23-05)"
#[test]
fn buildid_rejects_non_numeric() {
    let mut p = base();
    p.buildid = Some("1\" \"x".into());
    assert!(build_app_manifest_text(&p, 1).is_err());
}

// "\"0\" is exempt from the numeric guard"
#[test]
fn buildid_zero_allowed() {
    let mut p = base();
    p.buildid = Some("0".into());
    assert!(build_app_manifest_text(&p, 1).is_ok());
}

// "writes atomically: replaces stale temp/final artifacts, leaves only the correct final file"
#[test]
fn atomic_write_no_tmp_left() {
    let dir = tempfile::tempdir().unwrap();
    let fin = dir.path().join("appmanifest_264160.acf");
    let tmp = dir.path().join("appmanifest_264160.acf.tmp");
    fs::write(&tmp, "STALE-TMP-GARBAGE").unwrap();
    fs::write(&fin, "STALE-FINAL-GARBAGE").unwrap();
    let got = write_app_manifest(dir.path(), &base(), 1).unwrap();
    assert_eq!(got, fin);
    assert!(!tmp.exists());
    let t = fs::read_to_string(&fin).unwrap();
    assert!(!t.contains("STALE"));
    assert!(t.contains("\"StateFlags\"\t\t\"1026\""));
    assert!(t.contains("\"appid\"\t\t\"264160\""));
}

#[test]
fn write_error_leaves_no_tmp() {
    let dir = tempfile::tempdir().unwrap();
    // A directory at the final path makes the rename fail.
    fs::create_dir(dir.path().join("appmanifest_264160.acf")).unwrap();
    assert!(write_app_manifest(dir.path(), &base(), 1).is_err());
    assert!(!dir.path().join("appmanifest_264160.acf.tmp").exists());
}

#[test]
fn missing_root_measures_zero() {
    let dir = tempfile::tempdir().unwrap();
    assert_eq!(measure_installed_bytes(&dir.path().join("nope")), 0);
}

#[test]
fn measure_sums_real_bytes_recursively() {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir_all(dir.path().join("a/b")).unwrap();
    fs::write(dir.path().join("x"), [0u8; 10]).unwrap();
    fs::write(dir.path().join("a/b/y"), [0u8; 7]).unwrap();
    assert_eq!(measure_installed_bytes(dir.path()), 17);
}

#[cfg(unix)]
#[test]
fn measure_does_not_follow_symlinks() {
    let dir = tempfile::tempdir().unwrap();
    let other = tempfile::tempdir().unwrap();
    fs::write(other.path().join("big"), [0u8; 100]).unwrap();
    std::os::unix::fs::symlink(other.path(), dir.path().join("link")).unwrap();
    fs::write(dir.path().join("f"), [0u8; 3]).unwrap();
    assert_eq!(measure_installed_bytes(dir.path()), 3);
}

#[test]
fn gate_every_input() {
    use RunOutcome::*;
    assert!(can_write_full_ownership(
        Completed,
        0,
        Some("123"),
        true,
        true
    ));
    assert!(!can_write_full_ownership(
        Cancelled,
        0,
        Some("123"),
        true,
        true
    ));
    assert!(!can_write_full_ownership(
        Completed,
        1,
        Some("123"),
        true,
        true
    ));
    assert!(!can_write_full_ownership(Completed, 0, None, true, true));
    assert!(!can_write_full_ownership(
        Completed,
        0,
        Some(""),
        true,
        true
    ));
    assert!(!can_write_full_ownership(
        Completed,
        0,
        Some("0"),
        true,
        true
    ));
    assert!(!can_write_full_ownership(
        Completed,
        0,
        Some("123"),
        false,
        true
    ));
    assert!(!can_write_full_ownership(
        Completed,
        0,
        Some("123"),
        true,
        false
    ));
}

// "shouldFinalizeAfterThrow" fails closed
#[test]
fn throw_gate_fails_closed() {
    assert!(should_finalize_after_throw(Some(true)));
    assert!(!should_finalize_after_throw(Some(false)));
    assert!(!should_finalize_after_throw(None));
}

fn spec(dir: &std::path::Path, allow: bool, buildid: Option<&str>) -> FinalizeSpec {
    FinalizeSpec {
        steamapps_dir: dir.to_string_lossy().into_owned(),
        installdir: "Game".into(),
        name: "Game".into(),
        buildid: buildid.map(String::from),
        last_owner: Some("76561198000000000".into()),
        allow_full_ownership: allow,
    }
}

fn depots() -> Vec<PlannedDepot> {
    vec![PlannedDepot {
        depot_id: "481".into(),
        gid: "1234567890123456789".into(),
        size: 50,
    }]
}

fn good() -> RunResult {
    RunResult {
        outcome: RunOutcome::Completed,
        failures: vec![],
        all_files_verified: true,
        all_modes_applied: true,
    }
}

fn setup() -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir_all(dir.path().join("common/Game")).unwrap();
    fs::write(dir.path().join("common/Game/a.bin"), [0u8; 42]).unwrap();
    dir
}

// "Test D: no regression - a genuine complete run still earns StateFlags=4"
#[tokio::test]
async fn complete_run_earns_4() {
    let dir = setup();
    let w = finalize(
        &spec(dir.path(), true, Some("777")),
        "480",
        &depots(),
        &good(),
    )
    .await
    .unwrap();
    assert_eq!(w.state_flags, "4");
    assert_eq!(w.size_on_disk, 42);
    let t = fs::read_to_string(&w.path).unwrap();
    assert!(t.contains("\"StateFlags\"\t\t\"4\""));
    assert!(t.contains("\"buildid\"\t\t\"777\""));
    assert!(t.contains("\"BytesDownloaded\"\t\t\"42\""));
    assert!(t.contains("\"SizeOnDisk\"\t\t\"42\""));
    assert!(t.contains("\"LastOwner\"\t\t\"76561198000000000\""));
}

#[tokio::test]
async fn policy_false_forces_1026() {
    let dir = setup();
    let w = finalize(
        &spec(dir.path(), false, Some("777")),
        "480",
        &depots(),
        &good(),
    )
    .await
    .unwrap();
    assert_eq!(w.state_flags, "1026");
    let t = fs::read_to_string(&w.path).unwrap();
    assert!(t.contains("\"StateFlags\"\t\t\"1026\""));
    assert!(t.contains("\"buildid\"\t\t\"0\""));
    assert!(t.contains("\"BytesToDownload\"\t\t\"0\""));
    // SizeOnDisk is still the measured value.
    assert!(t.contains("\"SizeOnDisk\"\t\t\"42\""));
}

// "Test C: signal.aborted finalizes 1026 even when the inputs would otherwise satisfy the gate"
#[tokio::test]
async fn cancelled_writes_1026() {
    let dir = setup();
    let mut r = good();
    r.outcome = RunOutcome::Cancelled;
    let w = finalize(&spec(dir.path(), true, Some("777")), "480", &depots(), &r)
        .await
        .unwrap();
    assert_eq!(w.state_flags, "1026");
}

// "Test E": a mode never applied finalizes 1026 even with zero failures
#[tokio::test]
async fn modes_not_applied_writes_1026() {
    let dir = setup();
    let mut r = good();
    r.all_modes_applied = false;
    let w = finalize(&spec(dir.path(), true, Some("777")), "480", &depots(), &r)
        .await
        .unwrap();
    assert_eq!(w.state_flags, "1026");
}

// "D-04: a sha1 mismatch on a kept depot still falls back to 1026"
#[tokio::test]
async fn failure_writes_1026() {
    let dir = setup();
    let mut r = good();
    r.failures.push(Failure {
        file: Some("a".into()),
        kind: ErrorKind::Sha1Mismatch,
        message: "m".into(),
        code: None,
        eresult: None,
        http_status: None,
        scope: None,
        ms_since_progress: None,
    });
    let w = finalize(&spec(dir.path(), true, Some("777")), "480", &depots(), &r)
        .await
        .unwrap();
    assert_eq!(w.state_flags, "1026");
}

#[tokio::test]
async fn absent_or_zero_buildid_writes_1026() {
    let dir = setup();
    for b in [None, Some("0")] {
        let w = finalize(&spec(dir.path(), true, b), "480", &depots(), &good())
            .await
            .unwrap();
        assert_eq!(w.state_flags, "1026");
    }
}

// "keeps manifest.ts's '0' default when nothing is persisted"
#[tokio::test]
async fn missing_last_owner_defaults_zero() {
    let dir = setup();
    let mut s = spec(dir.path(), false, None);
    s.last_owner = None;
    let w = finalize(&s, "480", &depots(), &good()).await.unwrap();
    assert!(fs::read_to_string(w.path)
        .unwrap()
        .contains("\"LastOwner\"\t\t\"0\""));
}

#[tokio::test]
async fn non_numeric_last_owner_defaults_zero() {
    let dir = setup();
    let mut s = spec(dir.path(), false, None);
    s.last_owner = Some("1\"x".into());
    let w = finalize(&s, "480", &depots(), &good()).await.unwrap();
    assert!(fs::read_to_string(w.path)
        .unwrap()
        .contains("\"LastOwner\"\t\t\"0\""));
}

#[tokio::test]
async fn missing_install_root_still_finalizes_with_zero_size() {
    let dir = tempfile::tempdir().unwrap();
    let w = finalize(&spec(dir.path(), true, Some("777")), "480", &[], &good())
        .await
        .unwrap();
    assert_eq!(w.size_on_disk, 0);
}

#[tokio::test]
async fn traversing_installdir_is_rejected() {
    let dir = setup();
    let mut s = spec(dir.path(), false, None);
    s.installdir = "../../evil".into();
    let e = finalize(&s, "480", &depots(), &good()).await.unwrap_err();
    assert_eq!(e.kind, ErrorKind::Io);
    assert!(!dir.path().join("appmanifest_480.acf").exists());
}

#[tokio::test]
async fn non_numeric_app_id_rejected() {
    let dir = setup();
    assert!(
        finalize(&spec(dir.path(), false, None), "4x", &depots(), &good())
            .await
            .is_err()
    );
}
