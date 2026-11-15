//! Probe and verdict cases of library.macArch.test.ts (lipo/file, verdict table, locate,
//! guards). Apply-side cases are listed in the 80-10 SUMMARY as stays-TS.

use gamelib_steampoll::acf_state::AcfSource;
use gamelib_steampoll::host::RunOutput;
use gamelib_steampoll::mac_arch::*;
use gamelib_steampoll::profile::Platform;
use gamelib_steampoll::testing::ScriptedRunner;
use std::fs;
use std::path::Path;

fn ok(s: &str) -> RunOutput {
    RunOutput {
        code: Some(0),
        stdout: s.into(),
        stderr: String::new(),
    }
}
fn fail() -> RunOutput {
    RunOutput {
        code: Some(1),
        ..Default::default()
    }
}
fn timeout() -> RunOutput {
    RunOutput::default()
}
fn v(a: &[&str]) -> Vec<String> {
    a.iter().map(|s| s.to_string()).collect()
}

fn bundle(root: &Path, name: &str, files: &[&str], plist: Option<&str>) -> std::path::PathBuf {
    let app = root.join(name);
    fs::create_dir_all(app.join("Contents/MacOS")).unwrap();
    for f in files {
        fs::write(app.join("Contents/MacOS").join(f), "x").unwrap();
    }
    if let Some(p) = plist {
        fs::write(app.join("Contents/Info.plist"), p).unwrap();
    }
    app
}

fn plist(exe: &str) -> String {
    format!("<plist><dict><key>CFBundleExecutable</key>\n<string>{exe}</string></dict></plist>")
}

#[tokio::test]
async fn lipo_argv_form_returns_split_archs() {
    let r = ScriptedRunner::default();
    r.on("lipo -archs /g/bin", vec![ok("x86_64 arm64\n")]);
    assert_eq!(
        macho_archs(&r, Path::new("/g/bin")).await,
        v(&["x86_64", "arm64"])
    );
    assert_eq!(r.calls(), vec!["lipo -archs /g/bin"]);
}

#[tokio::test]
async fn file_fallback_when_lipo_fails() {
    let r = ScriptedRunner::default();
    r.on("lipo -archs /g/bin", vec![fail()]);
    r.on("file /g/bin", vec![ok("/g/bin: Mach-O executable i386")]);
    let archs = macho_archs(&r, Path::new("/g/bin")).await;
    assert_eq!(archs, v(&["i386"]));
    assert_eq!(verdict_from_archs(&archs), Some(MacArch::Bits32));
}

#[tokio::test]
async fn lipo_timeout_is_a_failure_then_file() {
    let r = ScriptedRunner::default();
    r.on("lipo -archs /g/bin", vec![timeout()]);
    r.on("file /g/bin", vec![ok("Mach-O 64-bit x86_64 executable")]);
    assert_eq!(macho_archs(&r, Path::new("/g/bin")).await, v(&["x86_64"]));
}

#[tokio::test]
async fn both_fail_is_inconclusive_never_32() {
    let r = ScriptedRunner::default();
    r.on("lipo -archs /g/bin", vec![fail()]);
    r.on("file /g/bin", vec![timeout()]);
    let archs = macho_archs(&r, Path::new("/g/bin")).await;
    assert!(archs.is_empty());
    assert_eq!(verdict_from_archs(&archs), None);
}

#[test]
fn verdict_table() {
    assert_eq!(verdict_from_archs(&v(&["i386"])), Some(MacArch::Bits32));
    assert_eq!(verdict_from_archs(&v(&["x86_64"])), Some(MacArch::Bits64));
    assert_eq!(
        verdict_from_archs(&v(&["x86_64", "arm64"])),
        Some(MacArch::Bits64)
    );
    assert_eq!(
        verdict_from_archs(&v(&["i386", "x86_64"])),
        Some(MacArch::Bits64)
    );
    assert_eq!(verdict_from_archs(&[]), None);
    assert_eq!(serde_json::to_string(&MacArch::Bits32).unwrap(), "\"32\"");
    assert_eq!(serde_json::to_string(&MacArch::Bits64).unwrap(), "\"64\"");
}

#[test]
fn locate_prefers_launch_executable_when_it_exists() {
    let d = tempfile::tempdir().unwrap();
    fs::write(d.path().join("game"), "x").unwrap();
    bundle(d.path(), "G.app", &["g"], None);
    assert_eq!(
        locate_macho_binary_with(d.path(), Some("game")),
        Some(d.path().join("game"))
    );
}

#[test]
fn locate_scans_top_level_app_bundle() {
    let d = tempfile::tempdir().unwrap();
    bundle(d.path(), "G.app", &["g"], None);
    assert_eq!(
        locate_macho_binary(d.path()),
        Some(d.path().join("G.app/Contents/MacOS/g"))
    );
}

#[test]
fn locate_prefers_cfbundleexecutable_over_first_entry() {
    let d = tempfile::tempdir().unwrap();
    bundle(
        d.path(),
        "G.app",
        &["DredmorSchema.xsd", "dredmor"],
        Some(&plist("dredmor")),
    );
    assert_eq!(
        locate_macho_binary(d.path()),
        Some(d.path().join("G.app/Contents/MacOS/dredmor"))
    );
}

#[test]
fn locate_install_path_is_itself_an_app() {
    let d = tempfile::tempdir().unwrap();
    let app = bundle(d.path(), "G.app", &["g"], None);
    assert_eq!(
        locate_macho_binary(&app),
        Some(app.join("Contents/MacOS/g"))
    );
}

#[test]
fn locate_none_without_bundle_or_macos_dir_or_dir() {
    let d = tempfile::tempdir().unwrap();
    assert_eq!(locate_macho_binary(d.path()), None);
    fs::create_dir_all(d.path().join("G.app")).unwrap();
    assert_eq!(locate_macho_binary(d.path()), None);
    assert_eq!(locate_macho_binary(&d.path().join("missing")), None);
}

#[test]
fn hostile_cfbundleexecutable_falls_back_inside_macos() {
    let d = tempfile::tempdir().unwrap();
    fs::write(d.path().join("evil"), "x").unwrap();
    bundle(d.path(), "G.app", &["real"], Some(&plist("../../../evil")));
    assert_eq!(
        locate_macho_binary(d.path()),
        Some(d.path().join("G.app/Contents/MacOS/real"))
    );
}

#[test]
fn launch_executable_escaping_install_path_is_rejected() {
    let d = tempfile::tempdir().unwrap();
    let inst = d.path().join("inst");
    fs::create_dir_all(&inst).unwrap();
    fs::write(d.path().join("outside"), "x").unwrap();
    assert_eq!(locate_macho_binary_with(&inst, Some("../outside")), None);
    let abs = d.path().join("outside");
    assert_eq!(
        locate_macho_binary_with(&inst, Some(abs.to_str().unwrap())),
        None
    );
}

#[test]
fn candidates_are_capped_and_declared_first() {
    let d = tempfile::tempdir().unwrap();
    let files: Vec<String> = (0..12).map(|i| format!("a{i:02}")).collect();
    let refs: Vec<&str> = files.iter().map(String::as_str).collect();
    bundle(d.path(), "G.app", &refs, Some(&plist("a11")));
    let c = locate_macho_candidates(d.path(), None);
    assert_eq!(c.len(), 8);
    assert_eq!(c[0], d.path().join("G.app/Contents/MacOS/a11"));
}

async fn verdict(
    platform: Platform,
    source: AcfSource,
    p: &Path,
    r: &ScriptedRunner,
) -> Option<MacArch> {
    mac_arch_verdict(r, platform, source, p).await
}

#[tokio::test]
async fn guards_skip_without_spawning() {
    let d = tempfile::tempdir().unwrap();
    bundle(d.path(), "G.app", &["g"], None);
    let r = ScriptedRunner::default();
    assert_eq!(
        verdict(Platform::Darwin, AcfSource::Bottle, d.path(), &r).await,
        None
    );
    assert_eq!(
        verdict(Platform::Darwin, AcfSource::Bridge, d.path(), &r).await,
        None
    );
    assert_eq!(
        verdict(Platform::Linux, AcfSource::Native, d.path(), &r).await,
        None
    );
    assert!(r.calls().is_empty());
}

#[tokio::test]
async fn no_binary_is_none_and_no_spawn() {
    let d = tempfile::tempdir().unwrap();
    let r = ScriptedRunner::default();
    assert_eq!(
        verdict(Platform::Darwin, AcfSource::Native, d.path(), &r).await,
        None
    );
    assert!(r.calls().is_empty());
}

#[tokio::test]
async fn native_mac_verdicts() {
    let d = tempfile::tempdir().unwrap();
    let app = bundle(d.path(), "G.app", &["g"], None);
    let bin = app.join("Contents/MacOS/g");
    let key = format!("lipo -archs {}", bin.display());
    let r = ScriptedRunner::default();
    r.on(&key, vec![ok("i386")]);
    assert_eq!(
        verdict(Platform::Darwin, AcfSource::Native, d.path(), &r).await,
        Some(MacArch::Bits32)
    );
    r.on(&key, vec![ok("x86_64")]);
    assert_eq!(
        verdict(Platform::Darwin, AcfSource::Native, d.path(), &r).await,
        Some(MacArch::Bits64)
    );
    r.on(&key, vec![fail()]);
    r.on(&format!("file {}", bin.display()), vec![fail()]);
    assert_eq!(
        verdict(Platform::Darwin, AcfSource::Native, d.path(), &r).await,
        None
    );
}
