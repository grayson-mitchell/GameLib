use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use gamelib_testutil::FakeHome;

fn cli() -> Command {
    let mut c = Command::new(env!("CARGO_BIN_EXE_gamelib-store-cli"));
    c.env_clear();
    c
}

/// A store-flavour golden file, copied into a temp dir so the run never touches the fixture tree.
fn golden_copy(dir: &Path) -> std::path::PathBuf {
    let src = Path::new(env!("CARGO_MANIFEST_DIR")).join(
        "../gamelib-store/tests/fixtures/golden/expected/engine-newer-readonly-user-state/store/prefs.json",
    );
    let dst = dir.join("prefs.json");
    std::fs::copy(&src, &dst).unwrap();
    dst
}

#[test]
fn a_golden_file_round_trips_identical() {
    let d = tempfile::tempdir().unwrap();
    let f = golden_copy(d.path());
    let out = cli()
        .args(["roundtrip", f.to_str().unwrap(), "--flavour", "store"])
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(0));
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), "identical");
}

#[test]
fn a_different_flavour_reports_the_first_differing_byte() {
    let d = tempfile::tempdir().unwrap();
    let f = golden_copy(d.path());
    let out = cli()
        .args(["roundtrip", f.to_str().unwrap(), "--flavour", "compact"])
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&out.stdout).starts_with("differs at byte "));
}

#[test]
fn a_file_that_is_not_json_exits_2_with_stdout_empty() {
    let d = tempfile::tempdir().unwrap();
    let f = d.path().join("bad.json");
    std::fs::write(&f, b"{\"a\":").unwrap();
    let out = cli()
        .args(["roundtrip", f.to_str().unwrap(), "--flavour", "store"])
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(2));
    assert!(out.stdout.is_empty());
    assert!(String::from_utf8_lossy(&out.stderr).contains("parse error"));
}

#[test]
fn usage_errors_exit_64() {
    assert_eq!(cli().output().unwrap().status.code(), Some(64));
    let out = cli()
        .args(["roundtrip", "x.json", "--flavour", "nope"])
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(64));
}

fn corpus(rel: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../gamelib-store/tests/fixtures/corpus")
        .join(rel)
}

/// Three real corpus files laid out as a profile: an old global settings document, an old library
/// cache and a current-version store.
fn stage_profile(home: &FakeHome) -> PathBuf {
    let profile = home.root().join("profile");
    for (from, to) in [
        ("v0.8/config.json", "config.json"),
        (
            "backups/store_cache/steam_library.v1.20261114T043721665Z.bak.json",
            "store_cache/steam_library.json",
        ),
        ("operator/store/config.json", "store/config.json"),
    ] {
        let dst = profile.join(to);
        fs::create_dir_all(dst.parent().unwrap()).unwrap();
        fs::copy(corpus(from), dst).unwrap();
    }
    profile
}

/// The CLI under a fake HOME (never a real profile): environment cleared, the eight variables set.
fn on_fake_home(home: &FakeHome, args: &[&str]) -> Output {
    let mut c = cli();
    home.apply(&mut c);
    c.args(args).output().unwrap()
}

fn tree_bytes(root: &Path) -> BTreeMap<String, Vec<u8>> {
    fn walk(dir: &Path, prefix: &str, out: &mut BTreeMap<String, Vec<u8>>) {
        for e in fs::read_dir(dir).unwrap().flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            let rel = if prefix.is_empty() {
                name
            } else {
                format!("{prefix}/{name}")
            };
            if e.path().is_dir() {
                walk(&e.path(), &rel, out);
            } else {
                out.insert(rel, fs::read(e.path()).unwrap());
            }
        }
    }
    let mut out = BTreeMap::new();
    walk(root, "", &mut out);
    out
}

fn lines(out: &Output) -> Vec<String> {
    let mut v: Vec<String> = String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(str::to_string)
        .collect();
    v.sort();
    v
}

#[test]
fn open_dry_run_prints_each_outcome_and_leaves_the_profile_untouched() {
    let home = FakeHome::new("gamelib-store-cli-open-");
    let profile = stage_profile(&home);
    let scratch = home.root().join("scratch");
    fs::create_dir_all(&scratch).unwrap();
    let before = tree_bytes(&profile);
    let out = on_fake_home(
        &home,
        &[
            "open",
            profile.to_str().unwrap(),
            "--dry-run",
            "--scratch",
            scratch.to_str().unwrap(),
        ],
    );
    assert_eq!(
        out.status.code(),
        Some(0),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert_eq!(
        lines(&out),
        [
            "settings/global migrated v0 v2",
            "store/config ok",
            "store_cache/steam_library migrated v1 v3",
        ]
    );
    // The source profile is byte-for-byte what it was, with no backup written beside it, and the
    // scratch copy is gone.
    assert_eq!(tree_bytes(&profile), before);
    assert_eq!(
        fs::read_dir(&scratch).unwrap().count(),
        0,
        "scratch removed"
    );
}

#[test]
fn open_without_dry_run_migrates_the_profile_in_place() {
    let home = FakeHome::new("gamelib-store-cli-open-");
    let profile = stage_profile(&home);
    let original = fs::read(profile.join("config.json")).unwrap();
    let out = on_fake_home(&home, &["open", profile.to_str().unwrap()]);
    assert_eq!(out.status.code(), Some(0));
    let migrated = fs::read_to_string(profile.join("config.json")).unwrap();
    assert!(migrated.contains("\"version\": \"v2\""), "{migrated}");
    let backups: Vec<_> = tree_bytes(&profile)
        .into_iter()
        .filter(|(n, _)| n.starts_with("config.v0.") && n.ends_with(".bak.json"))
        .collect();
    assert_eq!(backups.len(), 1);
    assert_eq!(
        backups[0].1, original,
        "the backup holds the original bytes"
    );
    // A second run finds everything current.
    let again = on_fake_home(&home, &["open", profile.to_str().unwrap()]);
    assert_eq!(
        lines(&again),
        [
            "settings/global ok",
            "store/config ok",
            "store_cache/steam_library ok",
        ]
    );
}

#[test]
fn open_reads_config_and_games_from_the_app_folder() {
    let home = FakeHome::new("gamelib-store-cli-open-");
    let profile = home.root().join("profile");
    let app = home.root().join("app");
    fs::create_dir_all(app.join("GamesConfig")).unwrap();
    fs::create_dir_all(&profile).unwrap();
    fs::copy(corpus("v0.8/config.json"), app.join("config.json")).unwrap();
    fs::copy(
        corpus("backups/GamesConfig/112100.v0.20261118T075222416Z.bak.json"),
        app.join("GamesConfig/112100.json"),
    )
    .unwrap();
    // A backup beside the game documents is not a game.
    fs::write(
        app.join("GamesConfig/112100.v0.20261118T075222416Z.bak.json"),
        b"{}",
    )
    .unwrap();
    let out = on_fake_home(
        &home,
        &[
            "open",
            profile.to_str().unwrap(),
            "--app-folder",
            app.to_str().unwrap(),
            "--dry-run",
            "--scratch",
            home.root().to_str().unwrap(),
        ],
    );
    assert_eq!(
        out.status.code(),
        Some(0),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert_eq!(
        lines(&out),
        [
            "settings/game/112100 migrated v0 v2",
            "settings/global migrated v0 v2",
        ]
    );
}

#[test]
fn open_with_a_missing_directory_or_bad_flags_fails_cleanly() {
    let home = FakeHome::new("gamelib-store-cli-open-");
    let missing = home.root().join("nope");
    let out = on_fake_home(&home, &["open", missing.to_str().unwrap()]);
    assert_eq!(out.status.code(), Some(2));
    assert!(out.stdout.is_empty());
    assert_eq!(on_fake_home(&home, &["open"]).status.code(), Some(64));
    let bad = on_fake_home(&home, &["open", home.root().to_str().unwrap(), "--nope"]);
    assert_eq!(bad.status.code(), Some(64));
}

/// D-14 / FND-07: the CLI works on the profile it is handed and nothing else. It runs with the
/// environment cleared and only a FakeHome's eight variables set (never the operator's HOME), over
/// a profile under that FakeHome holding the two token-bearing account configs (synthetic
/// ciphertext-shaped values). Sentinels stand where a HOME or Keychain reader would look: a
/// Keychain database path, a GameLib userData under the FakeHome's appData, and a dotfile. The run
/// must exit 0 and leave every byte and mtime outside the profile as it was. That no store code can
/// reach the keyring at all is the other half: neither store crate depends on a keyring crate
/// (`cargo tree -p gamelib-store -p gamelib-store-cli`, checked by the plan's verify).
#[test]
fn cli_never_reads_home_or_keychain() {
    let home = FakeHome::new("gamelib-store-cli-home-");
    let root = home.root().to_path_buf();
    let sentinels = [
        root.join("Library")
            .join("Keychains")
            .join("login.keychain-db"),
        root.join("Library")
            .join("Application Support")
            .join("GameLib")
            .join("steam_store")
            .join("config.json"),
        root.join("AppData")
            .join("Roaming")
            .join("GameLib")
            .join("humble_store")
            .join("config.json"),
        root.join(".config").join("GameLib").join("config.json"),
        root.join("real-home-sentinel"),
    ];
    for s in &sentinels {
        fs::create_dir_all(s.parent().unwrap()).unwrap();
        fs::write(s, b"sentinel: never read or written by gamelib-store-cli").unwrap();
    }

    let profile = root.join("profile");
    let config = "{\n\t\"refreshToken\": \"steam:v1:REDACTED\",\n\t\"isLoggedIn\": false,\n\t\"__internal__\": {\n\t\t\"gamelib\": {\n\t\t\t\"schemaVersion\": 1\n\t\t}\n\t}\n}";
    for dir in ["steam_store", "humble_store"] {
        fs::create_dir_all(profile.join(dir)).unwrap();
        fs::write(profile.join(dir).join("config.json"), config).unwrap();
    }

    let outside = |root: &Path| {
        let mut t = tree_bytes(root);
        t.retain(|name, _| !name.starts_with("profile/"));
        t
    };
    let mtimes = || {
        sentinels
            .iter()
            .map(|s| fs::metadata(s).unwrap().modified().unwrap())
            .collect::<Vec<_>>()
    };
    let before = outside(&root);
    let before_mtimes = mtimes();

    let out = on_fake_home(&home, &["open", profile.to_str().unwrap()]);
    assert_eq!(
        out.status.code(),
        Some(0),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let stdout = lines(&out);
    assert!(
        stdout.iter().any(|l| l.starts_with("steam_store/config "))
            && stdout.iter().any(|l| l.starts_with("humble_store/config ")),
        "the CLI opened the profile's account configs: {stdout:?}"
    );
    assert_eq!(
        outside(&root),
        before,
        "nothing outside the profile changed"
    );
    assert_eq!(mtimes(), before_mtimes, "no sentinel was rewritten");
    // The profile's own account configs are still the same documents.
    for dir in ["steam_store", "humble_store"] {
        assert_eq!(
            fs::read_to_string(profile.join(dir).join("config.json")).unwrap(),
            config
        );
    }
}
