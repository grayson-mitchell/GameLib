//! Replays the shortcut name, path and exists goldens recorded from the TypeScript (94-05, 94-07)
//! through the Rust port (94-11): `golden/sanitize` over the npm `sanitize-filename` package,
//! `golden/paths` over `shortcutFiles` and `golden/exists` over the registered `shortcutsExists`
//! channel. A golden is the TS's answer, never a value typed here. A case that disagrees prints its
//! id and both values, and the test fails after every case ran.
//!
//! Every slice has a floor: a manifest count the directory does not match, or a count under the
//! floor, fails the test instead of letting an empty or truncated case set pass.
//!
//! `golden/windows/deltas.json` (quick 261128-810) records one windows delta: a REG_SZ value is read
//! literally, so `reg-sz-keeps-percent-literal` also replays with its data plus `\10%`, and a gate fails
//! when a recorded REG_SZ with a percent sign has no delta or a delta names anything else.
//!
//! Every case builds a fresh `FakeHome`, so nothing reads or writes the operator's real profile.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use gamelib_core::process::SpecOutput;
use gamelib_shortcuts::ctx::{Platform, ShortcutPaths};
use gamelib_shortcuts::exists::{shortcut_path_present, shortcuts_exist_at};
use gamelib_shortcuts::paths::shortcut_files;
use gamelib_shortcuts::registry::{
    read_windows_shell_folder, windows_desktop_dir, WindowsShellFolder,
};
use gamelib_shortcuts::sanitize::{sanitize_filename, sanitize_utf16};
use gamelib_shortcuts::testing::ScriptedRunner;
use gamelib_testutil::{require_link, FakeHome};
use serde_json::Value;

/// The Desktop folder the oracle's registry answered; nothing is ever created under it.
const REGISTRY_DESKTOP: &str = "Z:\\GameLibOracle\\Desktop";

fn golden_dir(slice: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("golden")
        .join(slice)
}

/// The JSON text with every lone surrogate escape (`\ud83c` with no partner) replaced by U+FFFD, so
/// `serde_json` (which refuses them) can read a golden that holds a lone surrogate in a text field.
/// The `units` arrays carry the exact code units, and those are what the replay compares.
fn lenient_json(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let hex4 = |at: usize| -> Option<u32> {
        let digits: String = chars.get(at..at + 4)?.iter().collect();
        u32::from_str_radix(&digits, 16).ok()
    };
    let mut i = 0;
    while i < chars.len() {
        if chars[i] != '\\' {
            out.push(chars[i]);
            i += 1;
            continue;
        }
        if chars.get(i + 1) != Some(&'u') {
            out.push('\\');
            if let Some(next) = chars.get(i + 1) {
                out.push(*next);
            }
            i += 2;
            continue;
        }
        let unit = hex4(i + 2);
        match unit {
            Some(high) if (0xD800..=0xDBFF).contains(&high) => {
                let low = if chars.get(i + 6) == Some(&'\\') && chars.get(i + 7) == Some(&'u') {
                    hex4(i + 8).filter(|l| (0xDC00..=0xDFFF).contains(l))
                } else {
                    None
                };
                if low.is_some() {
                    out.extend(chars[i..i + 12].iter());
                    i += 12;
                } else {
                    out.push('\u{FFFD}');
                    i += 6;
                }
            }
            Some(low) if (0xDC00..=0xDFFF).contains(&low) => {
                out.push('\u{FFFD}');
                i += 6;
            }
            _ => {
                out.push('\\');
                out.push('u');
                i += 2;
            }
        }
    }
    out
}

struct Cases {
    manifest_count: usize,
    manifest_floor: usize,
    cases: BTreeMap<String, Value>,
}

fn load(slice: &str) -> Cases {
    let dir = golden_dir(slice);
    let manifest: Value = serde_json::from_str(
        &fs::read_to_string(dir.join("MANIFEST.json")).expect("a slice has a MANIFEST.json"),
    )
    .expect("MANIFEST.json is JSON");
    let count = |key: &str| {
        manifest[key]
            .as_u64()
            .unwrap_or_else(|| panic!("{slice}: manifest has no {key}")) as usize
    };
    let mut cases = BTreeMap::new();
    for entry in fs::read_dir(&dir).expect("the slice directory exists") {
        let path = entry.expect("a directory entry").path();
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default();
        if !name.ends_with(".json") || name == "MANIFEST.json" || name == "deltas.json" {
            continue;
        }
        let text = fs::read_to_string(&path).expect("a golden is readable");
        let value: Value = serde_json::from_str(&lenient_json(&text))
            .unwrap_or_else(|e| panic!("{slice}/{name}: not JSON: {e}"));
        cases.insert(name.trim_end_matches(".json").to_string(), value);
    }
    Cases {
        manifest_count: count("count"),
        manifest_floor: count("floor"),
        cases,
    }
}

impl Cases {
    /// The anti-vacuity gate: the directory matches its manifest and clears its floor.
    fn assert_floor(&self, slice: &str) {
        assert_eq!(
            self.cases.len(),
            self.manifest_count,
            "{slice}: the directory holds {} goldens, the manifest says {}",
            self.cases.len(),
            self.manifest_count
        );
        assert!(
            self.cases.len() >= self.manifest_floor,
            "{slice}: {} goldens is under the floor {}",
            self.cases.len(),
            self.manifest_floor
        );
    }
}

fn units_of(value: &Value) -> Vec<u16> {
    value
        .as_array()
        .expect("units is an array")
        .iter()
        .map(|n| n.as_u64().expect("a code unit") as u16)
        .collect()
}

/// A title the case carries as UTF-16 code units. The path goldens hold no lone surrogate.
fn title_of(units: &[u16]) -> String {
    String::from_utf16(units).expect("a path golden title is valid text")
}

fn platform_of(name: &str) -> Platform {
    match name {
        "darwin" => Platform::Mac,
        "linux" => Platform::Linux,
        "win32" => Platform::Windows,
        other => panic!("a golden names an unknown platform: {other}"),
    }
}

/// The oracle's profile layout, over a fresh `FakeHome`.
struct Profile {
    home: FakeHome,
    paths: ShortcutPaths,
}

impl Profile {
    fn new() -> Profile {
        let home = FakeHome::new("gamelib-shortcuts-golden-");
        let root = home.root().to_path_buf();
        let paths = ShortcutPaths {
            user_home: root.clone(),
            app_data: Some(root.join("AppData").join("Roaming")),
            desktop_dir: Some(root.join("Desktop")),
            icon_folder: root.join(".config").join("GameLib").join("icons"),
            shell_exe: root.join("shell-exe"),
            cwd: root.clone(),
        };
        Profile { home, paths }
    }

    fn root(&self) -> &Path {
        self.home.root()
    }

    fn desktop(&self) -> PathBuf {
        self.root().join("Desktop")
    }

    /// The golden's placeholders, replaced by this profile's own folders.
    fn fill(&self, text: &str) -> String {
        let app_data = self.paths.app_data.clone().unwrap_or_default();
        text.replace("<DESKTOP>", &self.desktop().to_string_lossy())
            .replace("<APPDATA>", &app_data.to_string_lossy())
            .replace("<HOME>", &self.root().to_string_lossy())
    }
}

#[test]
fn sanitize_replays_every_npm_vector() {
    let slice = load("sanitize");
    slice.assert_floor("sanitize");
    let mut failures = Vec::new();
    for (id, case) in &slice.cases {
        let input = units_of(&case["input"]["units"]);
        let want = units_of(&case["output"]["units"]);
        let got = sanitize_utf16(&input);
        if got != want {
            failures.push(format!(
                "{id}: {} units, golden {} (first difference at {:?})",
                got.len(),
                want.len(),
                got.iter().zip(&want).position(|(a, b)| a != b)
            ));
            continue;
        }
        let bytes = String::from_utf16_lossy(&got).len() as u64;
        if Some(bytes) != case["output"]["utf8Bytes"].as_u64() {
            failures.push(format!(
                "{id}: {bytes} UTF-8 bytes, golden {}",
                case["output"]["utf8Bytes"]
            ));
        }
        // The `&str` form agrees wherever the input is valid text.
        if let Ok(text) = String::from_utf16(&input) {
            let got_text = sanitize_filename(&text);
            if got_text.encode_utf16().collect::<Vec<_>>() != want {
                failures.push(format!(
                    "{id}: sanitize_filename disagrees with sanitize_utf16"
                ));
            }
        }
    }
    assert!(
        failures.is_empty(),
        "sanitize mismatches:\n{}",
        failures.join("\n")
    );
}

/// Host separators are not part of the answer on macOS and Linux (the TS joins with `path.join` and
/// the oracle normalises), so those compare with `/` on both sides. Windows compares exactly.
fn same_path(platform: Platform, got: &Path, want: &str) -> bool {
    let got = got.to_string_lossy();
    if platform == Platform::Windows {
        got == want
    } else {
        got.replace('\\', "/") == want.replace('\\', "/")
    }
}

#[test]
fn paths_replay_every_shortcut_files_golden() {
    let slice = load("paths");
    slice.assert_floor("paths");
    let mut failures = Vec::new();
    for (id, case) in &slice.cases {
        let platform = platform_of(case["platform"].as_str().expect("platform"));
        let title = title_of(&units_of(&case["input"]["units"]));
        let profile = Profile::new();
        let registry = case["windowsRegistry"].as_bool().unwrap_or(false);
        let windows_desktop = registry.then(|| PathBuf::from(REGISTRY_DESKTOP));
        let (desktop, menu) =
            shortcut_files(platform, &profile.paths, &title, windows_desktop.as_deref());
        for (what, got, want) in [
            ("desktop", desktop, &case["desktop"]),
            ("menu", menu, &case["menu"]),
        ] {
            match (got, want.as_str()) {
                (None, None) => {}
                (Some(got), Some(want)) => {
                    let want = profile.fill(want);
                    if !same_path(platform, &got, &want) {
                        failures.push(format!("{id}: {what} {} want {want}", got.display()));
                    }
                }
                (got, want) => failures.push(format!("{id}: {what} {got:?} want {want:?}")),
            }
        }
    }
    assert!(
        failures.is_empty(),
        "paths mismatches:\n{}",
        failures.join("\n")
    );
}

/// Makes `link` a symlink to `target`; false when this host cannot (a skip locally, a panic on CI).
fn make_link(target: &Path, link: &Path) -> bool {
    #[cfg(unix)]
    let made = std::os::unix::fs::symlink(target, link);
    #[cfg(windows)]
    let made = if target.is_dir() {
        std::os::windows::fs::symlink_dir(target, link)
    } else {
        std::os::windows::fs::symlink_file(target, link)
    };
    require_link(made, "a shortcut symlink", std::env::var_os("CI").is_some())
}

/// One exists case's inputs: the platform, whether the registry answered, the title and the two
/// disk states the oracle seeded.
struct ExistsCase<'a> {
    platform: Platform,
    registry: bool,
    title: &'a str,
    desktop: &'a str,
    menu: &'a str,
}

/// What `seedTree` does in the oracle: puts the case's disk state in the fake profile. Returns false
/// when a link the case needs could not be made.
fn seed(
    profile: &Profile,
    case: &ExistsCase,
    desktop_file: Option<&Path>,
    menu_file: &Path,
) -> bool {
    let ExistsCase {
        platform,
        registry,
        title,
        desktop,
        menu,
    } = *case;
    if menu == "present" {
        if platform == Platform::Mac {
            fs::create_dir_all(menu_file.join("Contents").join("MacOS")).expect("menu bundle");
        } else {
            fs::create_dir_all(menu_file.parent().expect("a menu parent")).expect("menu dir");
            fs::write(menu_file, "").expect("menu file");
        }
    }
    // With a registry Desktop (win32) the path is synthetic and the presence test answers for it;
    // without one, the decoy `<home>/Desktop/<title>.lnk` is made for real and must not count.
    let target = match desktop_file {
        Some(file) if !(platform == Platform::Windows && registry) => Some(file.to_path_buf()),
        _ if platform == Platform::Windows && !registry && desktop == "file" => {
            Some(profile.desktop().join(format!("{title}.lnk")))
        }
        _ => None,
    };
    let Some(target) = target.filter(|_| desktop != "none") else {
        return true;
    };
    fs::create_dir_all(target.parent().expect("a desktop parent")).expect("desktop dir");
    match desktop {
        "file" => fs::write(&target, "").expect("desktop file"),
        "legacy-bundle" => fs::create_dir_all(target.join("Contents")).expect("legacy bundle"),
        _ => return make_link(menu_file, &target),
    }
    true
}

#[tokio::test]
async fn exists_replays_every_shortcuts_exist_golden() {
    let slice = load("exists");
    slice.assert_floor("exists");
    let mut failures = Vec::new();
    let mut replayed = 0usize;
    for (id, case) in &slice.cases {
        let platform = platform_of(case["platform"].as_str().expect("platform"));
        let registry = case["windowsRegistry"].as_bool().unwrap_or(false);
        let title = case["input"]["title"].as_str();
        let desktop = case["input"]["desktop"].as_str().expect("desktop state");
        let menu = case["input"]["menu"].as_str().expect("menu state");
        let want = case["exists"].as_bool().expect("exists");
        let profile = Profile::new();
        // On Windows the Desktop folder comes from the registry, answered here by the scripted `reg.exe` the
        // oracle's runner scripted: the synthetic folder when it answered, a non-zero exit when it did not.
        let windows_desktop = if platform == Platform::Windows {
            windows_desktop_dir(&reg_runner(registry), &[]).await
        } else {
            None
        };
        assert_eq!(
            windows_desktop,
            (platform == Platform::Windows && registry).then(|| PathBuf::from(REGISTRY_DESKTOP)),
            "{id}: the registry answer"
        );

        if let Some(title) = title.filter(|t| !t.is_empty()) {
            let (desktop_file, menu_file) =
                shortcut_files(platform, &profile.paths, title, windows_desktop.as_deref());
            let menu_file = menu_file.expect("every platform has a menu path");
            let case = ExistsCase {
                platform,
                registry,
                title,
                desktop,
                menu,
            };
            if !seed(&profile, &case, desktop_file.as_deref(), &menu_file) {
                continue;
            }
        }
        // The oracle answers a Desktop `.lnk` under the synthetic registry folder from a spy, since
        // nothing may be created there; every other path is the real disk.
        let spied = platform == Platform::Windows && registry && desktop == "file";
        let present = |path: &Path| {
            (spied && path.to_string_lossy().starts_with(REGISTRY_DESKTOP))
                || shortcut_path_present(path)
        };
        let got = shortcuts_exist_at(
            platform,
            &profile.paths,
            title,
            windows_desktop.as_deref(),
            &present,
        );
        replayed += 1;
        if got != want {
            failures.push(format!("{id}: {got} want {want}"));
        }
    }
    assert!(
        failures.is_empty(),
        "exists mismatches:\n{}",
        failures.join("\n")
    );
    // A host that cannot make symlinks skips only the symlink cases; never most of the slice.
    assert!(
        replayed * 10 >= slice.cases.len() * 8,
        "only {replayed} of {} exists cases replayed",
        slice.cases.len()
    );
}

/// `reg.exe`'s answer for `Desktop`, in the format the parser reads.
fn reg_output(value: &str) -> String {
    format!(
        "\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders\r\n    Desktop    REG_SZ    {value}\r\n\r\n"
    )
}

/// The runner the exists oracle scripted: `reg.exe` answers the synthetic Desktop when the registry
/// answered, and exits non-zero when it did not.
fn reg_runner(registry: bool) -> ScriptedRunner {
    ScriptedRunner::answering(if registry {
        SpecOutput {
            code: Some(0),
            stdout: reg_output(REGISTRY_DESKTOP),
            ..SpecOutput::default()
        }
    } else {
        SpecOutput {
            code: Some(1),
            ..SpecOutput::default()
        }
    })
}

/// The scripted `reg.exe` a `windows/reg-*` golden recorded: `{code, stdout?, stderr?, timedOut?, throws?}`.
fn scripted_output(scripted: &Value) -> SpecOutput {
    if let Some(throws) = scripted["throws"].as_str() {
        // A spawn that could not start: no exit code, the reason in stderr (the SpecRunner contract).
        return SpecOutput {
            code: None,
            stderr: throws.to_string(),
            ..SpecOutput::default()
        };
    }
    SpecOutput {
        code: scripted["code"].as_i64().map(|c| c as i32),
        stdout: scripted["stdout"].as_str().unwrap_or_default().to_string(),
        stderr: scripted["stderr"].as_str().unwrap_or_default().to_string(),
        timed_out: scripted["timedOut"].as_bool().unwrap_or(false),
        ..SpecOutput::default()
    }
}

/// The recorded windows registry deltas (`golden/windows/deltas.json`): case id to the reason it differs.
fn windows_deltas() -> BTreeMap<String, String> {
    let text =
        fs::read_to_string(golden_dir("windows").join("deltas.json")).expect("windows deltas.json");
    serde_json::from_str(&text).expect("windows deltas.json is an object of strings")
}

/// The data of the first `REG_SZ` line of a recorded `reg.exe` stdout, found without the crate's parser:
/// the text after the four-space-delimited `REG_SZ` column, trailing whitespace trimmed.
fn recorded_reg_sz_data(stdout: &str) -> Option<String> {
    const COLUMN: &str = "    REG_SZ    ";
    stdout.split('\n').find_map(|piece| {
        let line = piece.strip_suffix('\r').unwrap_or(piece);
        line.find(COLUMN)
            .map(|at| line[at + COLUMN.len()..].trim_end().to_string())
    })
}

#[tokio::test]
async fn windows_registry_replays_every_reg_golden() {
    let slice = load("windows");
    slice.assert_floor("windows");
    let deltas = windows_deltas();
    let mut replayed = 0usize;
    let mut failures = Vec::new();
    // The delta set is gated without the code under test: every delta names a reg- case, and a reg- case
    // has a delta exactly when its recorded REG_SZ data holds a percent sign.
    for (id, reason) in &deltas {
        assert!(
            id.starts_with("reg-") && slice.cases.contains_key(id),
            "windows deltas.json names no reg- case: {id}"
        );
        assert!(
            reason.starts_with("quick 261128-810:"),
            "{id}: the delta reason does not start with its quick id"
        );
    }
    for (id, case) in slice.cases.iter().filter(|(id, _)| id.starts_with("reg-")) {
        replayed += 1;
        let folder = match case["input"]["name"].as_str() {
            Some("Desktop") => WindowsShellFolder::Desktop,
            Some("Personal") => WindowsShellFolder::Personal,
            other => panic!("{id}: an unknown value name {other:?}"),
        };
        let env: Vec<(String, String)> = case["input"]["env"]
            .as_object()
            .expect("env is an object")
            .iter()
            .map(|(k, v)| (k.clone(), v.as_str().expect("env value").to_string()))
            .collect();
        let runner = ScriptedRunner::answering(scripted_output(&case["input"]["scripted"]));
        let got = read_windows_shell_folder(&runner, folder, &env).await;
        let want = case["folder"].as_str().map(PathBuf::from);
        if got != want {
            failures.push(format!("{id}: folder {got:?} want {want:?}"));
        }
        // The spawn: one `reg.exe query` with the recorded argv, timeout and hidden window, no env change,
        // no cwd and no stdin.
        let spawns = runner.spawns();
        let recorded = &case["spawns"][0];
        let argv: Vec<String> = recorded["argv"]
            .as_array()
            .expect("argv")
            .iter()
            .map(|a| a.as_str().expect("argv entry").to_string())
            .collect();
        let timeout = recorded["options"]["timeoutMs"]
            .as_u64()
            .map(std::time::Duration::from_millis);
        let spawn_ok = spawns.len() == 1
            && case["spawns"].as_array().map(Vec::len) == Some(1)
            && spawns[0].program == recorded["program"].as_str().unwrap_or_default()
            && spawns[0].argv == argv
            && spawns[0].timeout == timeout
            && spawns[0].hide_window
                == recorded["options"]["windowsHide"]
                    .as_bool()
                    .unwrap_or(false)
            && spawns[0].hide_window
            && spawns[0].replace_env == recorded["options"]["replaceEnv"].as_bool().unwrap_or(true)
            && spawns[0].env.is_empty()
            && spawns[0].cwd.is_none()
            && spawns[0].stdin.is_none()
            && spawns[0].label == "shortcuts-reg";
        if !spawn_ok {
            failures.push(format!("{id}: spawn {:?} want {recorded}", spawns));
        }

        // The windows delta (quick 261128-810): a REG_SZ value is read literally, so a recorded REG_SZ whose
        // data holds a percent sign gets a second arm, its data plus `\10%`.
        let stdout = case["input"]["scripted"]["stdout"]
            .as_str()
            .unwrap_or_default();
        let sz_data = recorded_reg_sz_data(stdout);
        let wants_delta = sz_data.as_deref().is_some_and(|data| data.contains('%'));
        if wants_delta != deltas.contains_key(id) {
            failures.push(format!(
                "{id}: a recorded REG_SZ with a percent sign needs exactly one windows delta (REG_SZ percent {wants_delta}, delta {})",
                deltas.contains_key(id)
            ));
        }
        let (true, Some(data)) = (deltas.contains_key(id), sz_data) else {
            continue;
        };
        let needle = format!("REG_SZ    {data}");
        assert_eq!(
            stdout.matches(&needle).count(),
            1,
            "{id}: the REG_SZ data is not in the stdout exactly once"
        );
        // The arm must discriminate: its first `%...%` pair names a variable the case environment does not
        // set, so the recorded rule (expand REG_SZ) would have answered None.
        let arm_data = format!("{data}\\10%");
        let first = arm_data
            .find('%')
            .expect("the arm data holds a percent sign");
        let rest = &arm_data[first + 1..];
        let close = rest.find('%').expect("the arm data holds a %NAME% pair");
        let name = rest[..close].to_uppercase();
        assert!(
            !env.iter().any(|(k, _)| k.to_uppercase() == name),
            "{id}: the arm's variable {name:?} is set, so the arm proves nothing"
        );
        let arm_stdout = stdout.replacen(&needle, &format!("{needle}\\10%"), 1);
        let want = Some(PathBuf::from(format!(
            "{}\\10%",
            case["folder"].as_str().expect("the recorded folder")
        )));
        let mut scripted = scripted_output(&case["input"]["scripted"]);
        scripted.stdout = arm_stdout;
        let arm_runner = ScriptedRunner::answering(scripted);
        let got = read_windows_shell_folder(&arm_runner, folder, &env).await;
        if got != want {
            failures.push(format!("{id} (delta arm): folder {got:?} want {want:?}"));
        }
    }
    assert!(replayed >= 20, "only {replayed} reg goldens replayed");
    assert!(
        failures.is_empty(),
        "reg mismatches:\n{}",
        failures.join("\n")
    );
}
