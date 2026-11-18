//! Port of updateDetection.acf.test.ts and the acfUpdateState-subject cases of
//! acfInstalledDepots.test.ts / acfInstalldir.test.ts. Mapping table in 80-04-SUMMARY.md.

use std::fs;
use std::path::Path;

use gamelib_steampoll::acf_state::{
    is_acf_update_pending, read_acf_update_fields_from_dir, read_acf_update_state, AcfSource,
    AcfUpdateFields, PollRoots,
};
use tempfile::TempDir;

const PENDING: &str = r#""AppState"
{
	"appid"		"333300"
	"StateFlags"		"6"
	"installdir"		"ADOM"
	"buildid"		"3512046"
	"BytesToDownload"		"1872128"
	"BytesDownloaded"		"0"
	"TargetBuildID"		"5820078"
	"ScheduledAutoUpdate"		"1794158347"
	"UserConfig"
	{
		"language"		"english"
	}
}
"#;

const CURRENT: &str = r#""AppState"
{
	"appid"		"333300"
	"StateFlags"		"4"
	"installdir"		"ADOM"
	"buildid"		"3512046"
	"BytesToDownload"		"2047616"
	"BytesDownloaded"		"2047616"
	"TargetBuildID"		"3512046"
	"ScheduledAutoUpdate"		"0"
	"UserConfig"
	{
		"language"		"english"
		"BetaKey"		"release-101"
	}
}
"#;

fn base() -> AcfUpdateFields {
    AcfUpdateFields {
        steamapps_dir: "/x".into(),
        buildid: "100".into(),
        target_build_id: Some("100".into()),
        state_flags: 4,
        bytes_to_download: 100,
        bytes_downloaded: 100,
        bytes_to_stage: 0,
        scheduled_auto_update: 0,
        beta_key: None,
    }
}

#[test]
fn pending_flags_bit_2_and_differing_target_build() {
    assert!(is_acf_update_pending(&AcfUpdateFields {
        state_flags: 6,
        ..base()
    }));
    assert!(is_acf_update_pending(&AcfUpdateFields {
        target_build_id: Some("200".into()),
        ..base()
    }));
}

#[test]
fn pending_ignores_target_zero_absent_and_stale_counters() {
    assert!(!is_acf_update_pending(&AcfUpdateFields {
        target_build_id: Some("0".into()),
        ..base()
    }));
    assert!(!is_acf_update_pending(&AcfUpdateFields {
        target_build_id: None,
        ..base()
    }));
    assert!(!is_acf_update_pending(&base()));
}

#[test]
fn pending_counts_scheduled_update_only_with_bytes_outstanding() {
    assert!(is_acf_update_pending(&AcfUpdateFields {
        scheduled_auto_update: 5,
        bytes_to_download: 200,
        bytes_downloaded: 0,
        ..base()
    }));
    assert!(!is_acf_update_pending(&AcfUpdateFields {
        scheduled_auto_update: 5,
        ..base()
    }));
}

fn native_roots(dir: &Path) -> PollRoots {
    fs::create_dir_all(dir.join("steamapps")).unwrap();
    fs::write(
        dir.join("steamapps/libraryfolders.vdf"),
        format!(
            "\"libraryfolders\"\n{{\n\"0\"\n{{\n\"path\" \"{}\"\n}}\n}}\n",
            dir.display()
        ),
    )
    .unwrap();
    PollRoots {
        steam_root: dir.to_string_lossy().into_owned(),
        bottle_steamapps_root: None,
        bridge_steamapps_root: None,
    }
}

#[test]
fn reads_pending_and_current_fixtures_from_native_roots() {
    let tmp = TempDir::new().unwrap();
    let roots = native_roots(tmp.path());
    let acf = tmp.path().join("steamapps/appmanifest_333300.acf");
    fs::write(&acf, PENDING).unwrap();
    let pending = read_acf_update_state(&roots, "333300", AcfSource::Native).unwrap();
    assert_eq!(pending.buildid, "3512046");
    assert_eq!(pending.target_build_id.as_deref(), Some("5820078"));
    assert_eq!(pending.state_flags, 6);
    assert!(is_acf_update_pending(&pending));

    fs::write(&acf, CURRENT).unwrap();
    let current = read_acf_update_state(&roots, "333300", AcfSource::Native).unwrap();
    assert_eq!(current.beta_key.as_deref(), Some("release-101"));
    assert!(!is_acf_update_pending(&current));
}

#[test]
fn null_for_corrupt_or_missing_manifest() {
    let tmp = TempDir::new().unwrap();
    let roots = native_roots(tmp.path());
    assert!(read_acf_update_state(&roots, "1", AcfSource::Native).is_none());
    fs::write(tmp.path().join("steamapps/appmanifest_1.acf"), "\u{0}{{{").unwrap();
    assert!(read_acf_update_state(&roots, "1", AcfSource::Native).is_none());
}

#[test]
fn bottle_and_bridge_sources_read_only_their_root() {
    let tmp = TempDir::new().unwrap();
    let mut roots = native_roots(tmp.path());
    fs::write(tmp.path().join("steamapps/appmanifest_333300.acf"), CURRENT).unwrap();
    let bottle = tmp.path().join("bottle");
    fs::create_dir_all(&bottle).unwrap();
    roots.bottle_steamapps_root = Some(bottle.to_string_lossy().into_owned());
    assert!(read_acf_update_state(&roots, "333300", AcfSource::Bottle).is_none());
    assert!(read_acf_update_state(&roots, "333300", AcfSource::Bridge).is_none());
    fs::write(bottle.join("appmanifest_333300.acf"), PENDING).unwrap();
    let f = read_acf_update_state(&roots, "333300", AcfSource::Bottle).unwrap();
    assert_eq!(f.steamapps_dir, bottle.to_string_lossy());
}

fn write_one(tmp: &TempDir, body: &str) -> String {
    fs::write(tmp.path().join("appmanifest_77.acf"), body).unwrap();
    tmp.path().to_string_lossy().into_owned()
}

#[test]
fn keeps_build_ids_as_exact_strings_and_counters_numeric() {
    let tmp = TempDir::new().unwrap();
    let dir = write_one(
        &tmp,
        "\"AppState\"\n{\n\"buildid\" \"9223372036854775807\"\n\"StateFlags\" \"4\"\n\"TargetBuildID\" \"9223372036854775806\"\n\"BytesToDownload\" \"2048\"\n\"BytesDownloaded\" \"1024\"\n\"ScheduledAutoUpdate\" \"5\"\n\"UserConfig\"\n{\n\"BetaKey\" \"beta_a\"\n}\n}\n",
    );
    let f = read_acf_update_fields_from_dir(&dir, "77").unwrap();
    assert_eq!(
        f,
        AcfUpdateFields {
            steamapps_dir: dir,
            buildid: "9223372036854775807".into(),
            target_build_id: Some("9223372036854775806".into()),
            state_flags: 4,
            bytes_to_download: 2048,
            bytes_downloaded: 1024,
            bytes_to_stage: 0,
            scheduled_auto_update: 5,
            beta_key: Some("beta_a".into()),
        }
    );
}

#[test]
fn feeds_pending_rules_target_and_scheduled() {
    let tmp = TempDir::new().unwrap();
    let dir = write_one(&tmp, "\"AppState\"\n{\n\"buildid\" \"100\"\n\"StateFlags\" \"4\"\n\"TargetBuildID\" \"200\"\n}\n");
    assert!(is_acf_update_pending(
        &read_acf_update_fields_from_dir(&dir, "77").unwrap()
    ));
    write_one(&tmp, "\"AppState\"\n{\n\"buildid\" \"100\"\n\"StateFlags\" \"4\"\n\"ScheduledAutoUpdate\" \"1\"\n\"BytesToDownload\" \"10\"\n\"BytesDownloaded\" \"0\"\n}\n");
    assert!(is_acf_update_pending(
        &read_acf_update_fields_from_dir(&dir, "77").unwrap()
    ));
    write_one(
        &tmp,
        "\"AppState\"\n{\n\"buildid\" \"100\"\n\"StateFlags\" \"4\"\n}\n",
    );
    let idle = read_acf_update_fields_from_dir(&dir, "77").unwrap();
    assert!(!is_acf_update_pending(&idle));
    assert_eq!(idle.beta_key, None);
}

#[test]
fn null_without_buildid_unparsed_absent_or_bad_id() {
    let tmp = TempDir::new().unwrap();
    let dir = write_one(&tmp, "\"AppState\"\n{\n\"StateFlags\" \"4\"\n}\n");
    assert!(read_acf_update_fields_from_dir(&dir, "77").is_none());
    // Unparsed: no AppState root.
    write_one(&tmp, "\"Other\"\n{\n\"buildid\" \"1\"\n}\n");
    assert!(read_acf_update_fields_from_dir(&dir, "77").is_none());
    // Absent.
    assert!(read_acf_update_fields_from_dir(&dir, "78").is_none());
    // Bad ids never reach a path join (T-80-08).
    write_one(&tmp, "\"AppState\"\n{\n\"buildid\" \"1\"\n}\n");
    assert!(read_acf_update_fields_from_dir(&dir, "../x").is_none());
    assert!(read_acf_update_fields_from_dir(&dir, "1/../77").is_none());
}
