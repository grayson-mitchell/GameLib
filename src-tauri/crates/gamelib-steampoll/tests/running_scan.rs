//! Contract for the Mac running-game scan (quick 261118-uma): the exe-path matcher, library
//! resolution, strict semantics and the off-Darwin no-scan guarantee. The lister is injected, so
//! every case runs on all three CI OSes.

use gamelib_steampoll::host::RunOutput;
use gamelib_steampoll::profile::Platform;
use gamelib_steampoll::running::read_running_app_id_or_process_scan;
use gamelib_steampoll::running_scan::{app_id_from_exe_paths, scan_running_app_id};
use gamelib_steampoll::testing::ScriptedRunner;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

fn write_acf(library: &Path, app_id: &str, installdir: &str) {
    let dir = library.join("steamapps");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(
        dir.join(format!("appmanifest_{app_id}.acf")),
        format!(
            "\"AppState\"\n{{\n\t\"appid\"\t\t\"{app_id}\"\n\t\"installdir\"\t\t\"{installdir}\"\n\t\"StateFlags\"\t\t\"4\"\n}}\n"
        ),
    )
    .unwrap();
}

fn game_exe(library: &Path, folder: &str, tail: &str) -> PathBuf {
    library
        .join("steamapps")
        .join("common")
        .join(folder)
        .join(tail)
}

fn reg_vdf(app: &str) -> String {
    format!("\"Registry\"\n{{\n\t\"HKCU\"\n\t{{\n\t\t\"Software\"\n\t\t{{\n\t\t\t\"Valve\"\n\t\t\t{{\n\t\t\t\t\"Steam\"\n\t\t\t\t{{\n\t\t\t\t\t\"RunningAppID\"\t\t\"{app}\"\n\t\t\t\t}}\n\t\t\t}}\n\t\t}}\n\t}}\n}}\n")
}

#[test]
fn avadon_shape_matches_through_the_acf_installdir() {
    let lib = tempfile::tempdir().unwrap();
    write_acf(lib.path(), "112100", "Avadon The Black Fortress");
    let exe = game_exe(
        lib.path(),
        "Avadon The Black Fortress",
        "Avadon.app/Contents/MacOS/Avadon",
    );
    assert_eq!(
        app_id_from_exe_paths(&[exe], &[lib.path().to_path_buf()]),
        112100
    );
}

#[test]
fn bastion_matches_on_the_child_exe_not_the_shell_launcher() {
    let lib = tempfile::tempdir().unwrap();
    write_acf(lib.path(), "107100", "Bastion");
    let launcher = PathBuf::from("/bin/bash");
    let child = game_exe(
        lib.path(),
        "Bastion",
        "Bastion.app/Contents/MacOS/Bastion.bin.osx",
    );
    assert_eq!(
        app_id_from_exe_paths(std::slice::from_ref(&launcher), &[lib.path().to_path_buf()]),
        0
    );
    assert_eq!(
        app_id_from_exe_paths(&[launcher, child], &[lib.path().to_path_buf()]),
        107100
    );
}

#[test]
fn several_running_games_answer_the_lowest_app_id() {
    let lib = tempfile::tempdir().unwrap();
    write_acf(lib.path(), "112100", "Avadon The Black Fortress");
    write_acf(lib.path(), "107100", "Bastion");
    let exes = vec![
        game_exe(
            lib.path(),
            "Avadon The Black Fortress",
            "Avadon.app/Contents/MacOS/Avadon",
        ),
        game_exe(
            lib.path(),
            "Bastion",
            "Bastion.app/Contents/MacOS/Bastion.bin.osx",
        ),
    ];
    assert_eq!(
        app_id_from_exe_paths(&exes, &[lib.path().to_path_buf()]),
        107100
    );
}

#[test]
fn near_misses_and_non_game_processes_read_zero() {
    let lib = tempfile::tempdir().unwrap();
    write_acf(lib.path(), "107100", "Bastion");
    let libs = [lib.path().to_path_buf()];
    let steam_root = lib.path();
    let cases = [
        // Sibling folder with no ACF.
        game_exe(lib.path(), "Bastion2", "Bastion.app/Contents/MacOS/Bastion"),
        // A folder under common/ with no matching ACF.
        game_exe(lib.path(), "Unknown Game", "x.app/Contents/MacOS/x"),
        // An exe sitting directly in steamapps/common/.
        lib.path()
            .join("steamapps")
            .join("common")
            .join("loose-exe"),
        // The game folder itself, nothing inside it.
        lib.path().join("steamapps").join("common").join("Bastion"),
        // Steam's own client.
        steam_root.join("Steam.AppBundle/Steam/Contents/MacOS/steam_osx"),
        PathBuf::from("/Applications/Safari.app/Contents/MacOS/Safari"),
    ];
    for exe in cases {
        assert_eq!(
            app_id_from_exe_paths(std::slice::from_ref(&exe), &libs),
            0,
            "{exe:?}"
        );
    }
}

#[test]
fn installdir_matches_case_insensitively() {
    let lib = tempfile::tempdir().unwrap();
    write_acf(lib.path(), "107100", "bastion");
    let exe = game_exe(
        lib.path(),
        "Bastion",
        "Bastion.app/Contents/MacOS/Bastion.bin.osx",
    );
    assert_eq!(
        app_id_from_exe_paths(&[exe], &[lib.path().to_path_buf()]),
        107100
    );
}

#[cfg(unix)]
#[test]
fn a_symlinked_library_matches_an_exe_under_its_canonical_target() {
    let real = tempfile::tempdir().unwrap();
    let links = tempfile::tempdir().unwrap();
    write_acf(real.path(), "107100", "Bastion");
    let link = links.path().join("lib-link");
    std::os::unix::fs::symlink(real.path(), &link).unwrap();
    let canon = std::fs::canonicalize(real.path()).unwrap();
    let exe = game_exe(
        &canon,
        "Bastion",
        "Bastion.app/Contents/MacOS/Bastion.bin.osx",
    );
    assert_eq!(app_id_from_exe_paths(&[exe], &[link]), 107100);
}

/// A path as VDF text: backslashes are escaped (Windows paths).
fn vdf_path(p: &Path) -> String {
    p.to_string_lossy().replace('\\', "\\\\")
}

fn steam_root_of(home: &Path) -> PathBuf {
    home.join("Library")
        .join("Application Support")
        .join("Steam")
}

#[test]
fn scan_finds_a_game_in_a_library_listed_only_in_libraryfolders_vdf() {
    let home = tempfile::tempdir().unwrap();
    let ext = tempfile::tempdir().unwrap();
    let root = steam_root_of(home.path());
    std::fs::create_dir_all(root.join("steamapps")).unwrap();
    std::fs::write(
        root.join("steamapps").join("libraryfolders.vdf"),
        format!(
            "\"libraryfolders\"\n{{\n\t\"0\"\n\t{{\n\t\t\"path\"\t\t\"{}\"\n\t}}\n\t\"1\"\n\t{{\n\t\t\t\"path\"\t\t\"{}\"\n\t}}\n}}\n",
            vdf_path(&root),
            vdf_path(ext.path())
        ),
    )
    .unwrap();
    write_acf(ext.path(), "4242", "Fixture Game");
    let exe = game_exe(
        ext.path(),
        "Fixture Game",
        "Fixture.app/Contents/MacOS/fixture",
    );
    // steam_root None falls back to <home>/Library/Application Support/Steam.
    let lister = move || Ok(vec![exe.clone()]);
    assert_eq!(
        scan_running_app_id(home.path(), None, false, &lister),
        Ok(4242)
    );
    // An explicit root wins over the home fallback.
    let elsewhere = tempfile::tempdir().unwrap();
    let exe2 = game_exe(
        ext.path(),
        "Fixture Game",
        "Fixture.app/Contents/MacOS/fixture",
    );
    let lister2 = move || Ok(vec![exe2.clone()]);
    assert_eq!(
        scan_running_app_id(home.path(), Some(&root.to_string_lossy()), true, &lister2),
        Ok(4242)
    );
    assert_eq!(
        scan_running_app_id(
            home.path(),
            Some(&elsewhere.path().to_string_lossy()),
            false,
            &lister2
        ),
        Ok(0)
    );
}

#[test]
fn scan_with_no_steam_directory_is_zero_and_never_lists_processes() {
    let home = tempfile::tempdir().unwrap();
    let called = Arc::new(AtomicBool::new(false));
    let flag = called.clone();
    let lister = move || {
        flag.store(true, Ordering::SeqCst);
        Ok(Vec::new())
    };
    assert_eq!(
        scan_running_app_id(home.path(), None, false, &lister),
        Ok(0)
    );
    assert_eq!(scan_running_app_id(home.path(), None, true, &lister), Ok(0));
    assert!(!called.load(Ordering::SeqCst));
}

#[test]
fn a_lister_failure_is_zero_non_strict_and_an_error_strict() {
    let home = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(steam_root_of(home.path()).join("steamapps")).unwrap();
    let lister = || Err("denied".to_string());
    assert_eq!(
        scan_running_app_id(home.path(), None, false, &lister),
        Ok(0)
    );
    let err = scan_running_app_id(home.path(), None, true, &lister).unwrap_err();
    assert!(err.contains("process list failed"), "{err}");
}

/// A Steam library at the Mac root with game 4242, and the matching process list.
fn mac_fixture(home: &Path) -> Vec<PathBuf> {
    let root = steam_root_of(home);
    write_acf(&root, "4242", "Fixture Game");
    vec![game_exe(
        &root,
        "Fixture Game",
        "Fixture.app/Contents/MacOS/fixture",
    )]
}

fn counting_lister(
    paths: Vec<PathBuf>,
    called: &Arc<AtomicBool>,
) -> impl Fn() -> Result<Vec<PathBuf>, String> + Send + Sync + 'static {
    let called = called.clone();
    move || {
        called.store(true, Ordering::SeqCst);
        Ok(paths.clone())
    }
}

#[tokio::test]
async fn darwin_registry_value_wins_and_the_lister_is_never_called() {
    let home = tempfile::tempdir().unwrap();
    let paths = mac_fixture(home.path());
    std::fs::write(
        steam_root_of(home.path()).join("registry.vdf"),
        reg_vdf("7000"),
    )
    .unwrap();
    let called = Arc::new(AtomicBool::new(false));
    let lister = counting_lister(paths, &called);
    let runner = ScriptedRunner::default();
    let v = read_running_app_id_or_process_scan(
        Platform::Darwin,
        home.path(),
        None,
        &runner,
        false,
        &lister,
    )
    .await;
    assert_eq!(v, Ok(7000));
    assert!(!called.load(Ordering::SeqCst));
}

#[tokio::test]
async fn darwin_with_no_registry_value_takes_the_scanned_app_id() {
    let home = tempfile::tempdir().unwrap();
    let paths = mac_fixture(home.path());
    let called = Arc::new(AtomicBool::new(false));
    let lister = counting_lister(paths, &called);
    let runner = ScriptedRunner::default();
    for strict in [false, true] {
        let v = read_running_app_id_or_process_scan(
            Platform::Darwin,
            home.path(),
            None,
            &runner,
            strict,
            &lister,
        )
        .await;
        assert_eq!(v, Ok(4242));
    }
    assert!(called.load(Ordering::SeqCst));
}

#[tokio::test]
async fn strict_darwin_with_no_profile_home_errors_before_any_scan() {
    let called = Arc::new(AtomicBool::new(false));
    let lister = counting_lister(Vec::new(), &called);
    let runner = ScriptedRunner::default();
    let v = read_running_app_id_or_process_scan(
        Platform::Darwin,
        Path::new(""),
        None,
        &runner,
        true,
        &lister,
    )
    .await;
    assert!(v.is_err());
    assert!(!called.load(Ordering::SeqCst));
}

#[tokio::test]
async fn linux_never_calls_the_lister() {
    let home = tempfile::tempdir().unwrap();
    let paths = mac_fixture(home.path());
    let called = Arc::new(AtomicBool::new(false));
    let lister = counting_lister(paths, &called);

    // A registry value is returned as is.
    std::fs::create_dir_all(home.path().join(".steam")).unwrap();
    std::fs::write(
        home.path().join(".steam").join("registry.vdf"),
        reg_vdf("431960"),
    )
    .unwrap();
    let runner = ScriptedRunner::default();
    let v = read_running_app_id_or_process_scan(
        Platform::Linux,
        home.path(),
        None,
        &runner,
        false,
        &lister,
    )
    .await;
    assert_eq!(v, Ok(431960));

    // Registry 0 takes the reaper path, which finds nothing.
    let other = tempfile::tempdir().unwrap();
    let runner = ScriptedRunner::default();
    runner.on(
        "ps -eo args",
        vec![RunOutput {
            code: Some(0),
            stdout: "/sbin/init\nbash\n".to_string(),
            stderr: String::new(),
        }],
    );
    let v = read_running_app_id_or_process_scan(
        Platform::Linux,
        other.path(),
        None,
        &runner,
        false,
        &lister,
    )
    .await;
    assert_eq!(v, Ok(0));
    assert!(!called.load(Ordering::SeqCst));
}

#[tokio::test]
async fn win32_never_calls_the_lister() {
    let home = tempfile::tempdir().unwrap();
    let paths = mac_fixture(home.path());
    let called = Arc::new(AtomicBool::new(false));
    let lister = counting_lister(paths, &called);
    let runner = ScriptedRunner::default();
    let _ = read_running_app_id_or_process_scan(
        Platform::Win32,
        home.path(),
        None,
        &runner,
        false,
        &lister,
    )
    .await;
    assert!(!called.load(Ordering::SeqCst));
}
