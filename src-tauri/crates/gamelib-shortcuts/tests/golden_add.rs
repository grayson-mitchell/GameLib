//! Replays the recorded `addShortcuts` goldens end to end through `shortcuts_add` (94-18, D-17): the
//! macOS and Linux text goldens (94-05, `golden/text`, 132 cases) and the Windows add goldens
//! (`golden/windows`, the `lnk-` family, 40 cases), each on a fresh `FakeHome` with a recording
//! `SpecRunner` and UI. A golden is the TS's answer, never a value typed here.
//!
//! What is compared: for the text goldens the whole tree the TS left (every path, its bytes, a symlink's
//! target and, on Unix, its mode; the `.icns` is opaque and checked structurally in `tests/icns.rs`); for the
//! Windows goldens every PowerShell spawn (program, argv, stdin script, environment, timeout) and the
//! outcome (resolved, or rejected with the TS's message).
//!
//! The Windows paths are strings with backslashes, so on a Unix host a Windows shortcut is a file whose NAME
//! holds the backslashes, directly under the fake home: the replay maps the golden's synthetic registry
//! Desktop (`Z:\GameLibOracle\Desktop`) and `<APPDATA>` onto the profile and compares the rest unchanged.
//!
//! The second half is the named Rust twin of every test in `addShortcutsOutcome.test.ts`. A guard parses
//! that file and fails if a test appears there without a twin here, or a twin names a function this file does
//! not define. Two twins differ from the TS on purpose (D-22): replacing a Desktop item GameLib cannot prove
//! it wrote is refused, so the TS's "replaced" outcome is the Rust "refused" one, and a proven item is
//! replaced as before.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use gamelib_core::clock::SystemClock;
use gamelib_core::process::{BoxFuture, LineSink, ProcSpec, SpecOutput, SpecRunner};
use gamelib_core::shutdown::Shutdown;
use gamelib_shortcuts::add::{add_with_desktop, steam_registration_wanted, AddArgs, AddOutcome};
use gamelib_shortcuts::ctx::{Platform, ShortcutPaths, ShortcutsCtx};
use gamelib_shortcuts::game::{ShortcutGame, ShortcutSettings};
use gamelib_shortcuts::launch_url::launch_url;
use gamelib_shortcuts::notice;
use gamelib_shortcuts::paths::shortcut_files;
use gamelib_shortcuts::testing::RecordingUi;
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use serde_json::{json, Value};

fn golden_dir(slice: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("golden")
        .join(slice)
}

fn on_ci() -> bool {
    std::env::var_os("CI").is_some()
}

/// A path as a golden writes it: `/` separators, whatever the host.
fn portable(path: &str) -> String {
    path.replace('\\', "/")
}

/// Every case of a slice by id, held to its manifest: the directory matches the count and clears the floor.
fn slice_cases(slice: &str) -> BTreeMap<String, Value> {
    let manifest: Value = serde_json::from_str(
        &fs::read_to_string(golden_dir(slice).join("MANIFEST.json")).expect("a manifest"),
    )
    .expect("MANIFEST.json is JSON");
    let count = manifest["count"].as_u64().expect("manifest count") as usize;
    let floor = manifest["floor"].as_u64().expect("manifest floor") as usize;
    let mut cases = BTreeMap::new();
    for entry in fs::read_dir(golden_dir(slice)).expect("the slice directory exists") {
        let path = entry.expect("a directory entry").path();
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default();
        if !name.ends_with(".json") || name == "MANIFEST.json" || name == "deltas.json" {
            continue;
        }
        let text = fs::read_to_string(&path).expect("a golden is readable");
        let value: Value =
            serde_json::from_str(&text).unwrap_or_else(|e| panic!("{slice}/{name}: not JSON: {e}"));
        cases.insert(name.trim_end_matches(".json").to_string(), value);
    }
    assert_eq!(
        cases.len(),
        count,
        "{slice}: the directory holds {} goldens, the manifest says {count}",
        cases.len()
    );
    assert!(cases.len() >= floor, "{slice}: under the floor {floor}");
    cases
}

/// The oracle's profile layout, over a fresh `FakeHome`.
struct Profile {
    home: FakeHome,
    paths: ShortcutPaths,
}

impl Profile {
    fn new() -> Profile {
        let home = FakeHome::new("gamelib-shortcuts-add-");
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

    /// The golden's placeholders, replaced by this profile's own paths.
    fn fill(&self, text: &str) -> String {
        let app_data = self.paths.app_data.clone().unwrap_or_default();
        text.replace("<SHELL_EXE>", &self.paths.shell_exe.to_string_lossy())
            .replace("<ICONS>", &self.paths.icon_folder.to_string_lossy())
            .replace("<DESKTOP>", &self.root().join("Desktop").to_string_lossy())
            .replace("<APPDATA>", &app_data.to_string_lossy())
            .replace("<CWD>", &self.paths.cwd.to_string_lossy())
            .replace("<HOME>", &self.root().to_string_lossy())
    }

    /// The context for `platform` over this profile, with a recording UI.
    fn ctx(&self, platform: Platform) -> (ShortcutsCtx, Arc<RecordingUi>) {
        let ui = Arc::new(RecordingUi::default());
        let ctx = ShortcutsCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            platform,
            Shutdown::new(),
        )
        .with_paths(self.paths.clone())
        .with_ui(ui.clone());
        (ctx, ui)
    }
}

/// True when this host can make a directory symlink; on CI a host that cannot is a panic.
fn host_can_link() -> bool {
    static CAN: OnceLock<bool> = OnceLock::new();
    *CAN.get_or_init(|| {
        let home = FakeHome::new("gamelib-shortcuts-addlink-");
        let target = home.root().join("target");
        fs::create_dir_all(&target).expect("a target");
        let link = home.root().join("link");
        #[cfg(unix)]
        let made = std::os::unix::fs::symlink(&target, &link);
        #[cfg(windows)]
        let made = std::os::windows::fs::symlink_dir(&target, &link);
        gamelib_testutil::require_link(made, "a Desktop symlink", on_ci())
    })
}

fn add_args(
    game: Value,
    desktop: bool,
    start_menu: bool,
    from_menu: bool,
    notify: bool,
) -> AddArgs {
    serde_json::from_value(json!({
        "game": game,
        "settings": {
            "addDesktopShortcuts": desktop,
            "addStartMenuShortcuts": start_menu,
            "addSteamShortcuts": false
        },
        "fromMenu": from_menu,
        "notify": notify
    }))
    .expect("add args")
}

fn game_json(title: &str, app_name: &str, runner: &str) -> Value {
    json!({
        "appName": app_name, "runner": runner, "title": title, "isDlc": false,
        "canAddSteamShortcut": runner != "steam"
    })
}

/// The args of a golden case: its title, app name, runner, settings and `fromMenu`.
fn golden_args(input: &Value, extra: Value, notify: bool) -> AddArgs {
    let mut game = game_json(
        input["title"].as_str().expect("title"),
        input["appName"].as_str().expect("appName"),
        input["runner"].as_str().expect("runner"),
    );
    for (key, value) in extra.as_object().cloned().unwrap_or_default() {
        game[key] = value;
    }
    let flag = |key: &str| input["settings"][key].as_bool().unwrap_or(false);
    add_args(
        game,
        flag("addDesktopShortcuts"),
        flag("addStartMenuShortcuts"),
        input["fromMenu"].as_bool().unwrap_or(false),
        notify,
    )
}

// ---------------------------------------------------------------------------------------- the trees

/// One item of a tree: its bytes and mode, or its link target.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Item {
    File { bytes: Vec<u8>, mode: u32 },
    Link { target: String },
}

/// Every file and symlink under `root/dir` (never following a link), keyed by the path relative to `root`.
fn snapshot(root: &Path, dir: &str) -> BTreeMap<String, Item> {
    fn walk(root: &Path, at: &Path, out: &mut BTreeMap<String, Item>) {
        let Ok(entries) = fs::read_dir(at) else {
            return;
        };
        for entry in entries {
            let path = entry.expect("a directory entry").path();
            let meta = fs::symlink_metadata(&path).expect("metadata");
            let key = portable(
                &path
                    .strip_prefix(root)
                    .expect("inside the root")
                    .to_string_lossy(),
            );
            if meta.file_type().is_symlink() {
                let target = fs::read_link(&path).expect("a link target");
                out.insert(
                    key,
                    Item::Link {
                        target: portable(&target.to_string_lossy()),
                    },
                );
            } else if meta.is_dir() {
                walk(root, &path, out);
            } else {
                #[cfg(unix)]
                let mode = {
                    use std::os::unix::fs::PermissionsExt;
                    meta.permissions().mode() & 0o777
                };
                #[cfg(not(unix))]
                let mode = 0;
                out.insert(
                    key,
                    Item::File {
                        bytes: fs::read(&path).expect("file bytes"),
                        mode,
                    },
                );
            }
        }
    }
    let mut out = BTreeMap::new();
    walk(root, &root.join(dir), &mut out);
    out
}

/// The mode a file created with `requested` gets here: the umask applies, as it does to Node's
/// `writeFile(..., { mode })`. Unix only.
#[cfg(unix)]
fn umasked(probe_dir: &Path, requested: u32) -> u32 {
    use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
    let probe = probe_dir.join(".mode-probe");
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(requested)
        .open(&probe)
        .expect("a probe file");
    let mode = fs::metadata(&probe).expect("probe").permissions().mode() & 0o777;
    fs::remove_file(&probe).expect("remove the probe");
    mode
}

/// Differences between the golden's entries under `base` and what is on disk.
fn diff_tree(profile: &Profile, base: &str, golden: &[Value]) -> Vec<String> {
    let actual = snapshot(profile.root(), base);
    let mut diffs = Vec::new();
    let mut wanted = BTreeSet::new();
    for entry in golden {
        let key = format!("{base}/{}", portable(entry["path"].as_str().expect("path")));
        wanted.insert(key.clone());
        let Some(item) = actual.get(&key) else {
            diffs.push(format!("{key}: missing"));
            continue;
        };
        match (item, entry["kind"].as_str().expect("kind")) {
            (Item::Link { target }, "symlink") => {
                let want =
                    portable(&profile.fill(entry["symlinkTarget"].as_str().expect("target")));
                if *target != want {
                    diffs.push(format!("{key}: link to {target}, golden {want}"));
                }
            }
            (Item::File { bytes, mode }, "file") => {
                if let Some(text) = entry["utf8"].as_str() {
                    let want = profile.fill(text).into_bytes();
                    if *bytes != want {
                        diffs.push(format!(
                            "{key}: bytes differ\n  got    {:?}\n  golden {:?}",
                            String::from_utf8_lossy(bytes),
                            String::from_utf8_lossy(&want)
                        ));
                    }
                } else if entry["opaque"].as_bool().unwrap_or(false) {
                    // Not byte-compared (the encoder differs): an icns with the one raw `ic11` element.
                    match icns::IconFamily::read(bytes.as_slice()) {
                        Ok(family) if family.elements.len() == 1 => {}
                        Ok(family) => diffs.push(format!(
                            "{key}: icns holds {} elements, not one",
                            family.elements.len()
                        )),
                        Err(error) => diffs.push(format!("{key}: not an icns: {error}")),
                    }
                } else {
                    diffs.push(format!("{key}: golden has neither bytes nor opaque"));
                }
                #[cfg(unix)]
                if let Some(requested) = entry["mode"]
                    .as_str()
                    .map(|m| u32::from_str_radix(m, 8).expect("an octal mode"))
                {
                    // `chmod` is exact (macOS run.sh); a mode given at creation loses the umask.
                    let want = if key.ends_with(".desktop") {
                        umasked(profile.root(), requested)
                    } else {
                        requested
                    };
                    if *mode != want {
                        diffs.push(format!("{key}: mode {mode:o}, golden {want:o}"));
                    }
                }
                #[cfg(not(unix))]
                let _ = mode;
            }
            (_, kind) => diffs.push(format!("{key}: is {item:?}, golden {kind}")),
        }
    }
    for key in actual.keys() {
        if !wanted.contains(key) {
            diffs.push(format!("{key}: written but not in the golden"));
        }
    }
    diffs
}

/// The icon file a with-icon case pre-created in the oracle, as a decodable file here.
fn seed_icon(profile: &Profile, app_name: &str) {
    let icon = profile.paths.icon_folder.join(format!("{app_name}.jpg"));
    fs::create_dir_all(icon.parent().expect("an icon parent")).expect("icon folder");
    // A small PNG, named `.jpg` like the icon lookup's download: the decoder goes by content.
    let image = image::RgbaImage::from_pixel(64, 64, image::Rgba([200, 40, 40, 255]));
    image
        .save_with_format(&icon, image::ImageFormat::Png)
        .expect("write the icon");
}

/// The recorded macOS `run.sh` deltas (`golden/text/deltas.json`): case id to the reason the Rust bytes differ
/// from the TypeScript's. The coverage checks on the delta set live in `golden_text.rs`.
fn text_deltas() -> BTreeMap<String, String> {
    let text = fs::read_to_string(golden_dir("text").join("deltas.json"))
        .expect("golden/text/deltas.json is readable");
    serde_json::from_str(&text).expect("deltas.json is an object from case id to reason")
}

/// The case the Rust is expected to reproduce: the golden itself, unless `id` has a recorded delta, which is
/// one substitution in the TS's own `run.sh` bytes (the single-quoted launch URL with every `'` written
/// `%27`). Panics when the delta does not apply. Copied from `golden_text.rs` like `golden_dir` and `Profile`.
fn with_text_delta(id: &str, case: &Value) -> Value {
    let Some(reason) = text_deltas().remove(id) else {
        return case.clone();
    };
    assert!(!reason.trim().is_empty(), "{id}: the delta has no reason");
    assert_eq!(
        case["platform"].as_str(),
        Some("darwin"),
        "{id}: a run.sh delta on a non-darwin case"
    );
    let input = &case["input"];
    let ts_url = launch_url(
        input["appName"].as_str().expect("appName"),
        input["runner"].as_str().expect("runner"),
        true,
    );
    assert!(
        ts_url.contains('\''),
        "{id}: the delta is unused, the TS URL holds no apostrophe"
    );
    let anchor = format!("'{ts_url}'");
    let mut out = case.clone();
    let entries = out["tree"]["Applications"]
        .as_array_mut()
        .expect("Applications entries");
    let entry = entries
        .iter_mut()
        .find(|e| e["path"].as_str().is_some_and(|p| p.ends_with("run.sh")))
        .expect("a recorded run.sh");
    let utf8 = entry["utf8"].as_str().expect("run.sh utf8").to_string();
    assert_eq!(
        utf8.matches(&anchor).count(),
        1,
        "{id}: the TS's quoted URL is not in run.sh exactly once"
    );
    let fixed = format!("'{}'", ts_url.replace('\'', "%27"));
    entry["utf8"] = Value::String(utf8.replacen(&anchor, &fixed, 1));
    out
}

/// One text case through the op. `Ok(true)` when the host could not make the Desktop link and the case was
/// skipped.
async fn replay_text(id: &str, case: &Value) -> Result<bool, String> {
    let case = &with_text_delta(id, case);
    let profile = Profile::new();
    let platform = match case["platform"].as_str().expect("platform") {
        "darwin" => Platform::Mac,
        "linux" => Platform::Linux,
        other => panic!("{id}: unexpected platform {other}"),
    };
    let wants_link = case["tree"]
        .as_object()
        .expect("a tree")
        .values()
        .flat_map(|entries| entries.as_array().expect("entries"))
        .any(|entry| entry["kind"].as_str() == Some("symlink"));
    if wants_link && !host_can_link() {
        return Ok(true);
    }
    let input = &case["input"];
    let app_name = input["appName"].as_str().expect("appName");
    if platform == Platform::Linux {
        // The oracle's profile has both folders; the TS does not create them.
        fs::create_dir_all(profile.paths.linux_desktop()).expect("the Desktop folder");
        fs::create_dir_all(profile.root().join(".local/share/applications")).expect("applications");
    }
    if input["withIcon"].as_bool().unwrap_or(false) {
        seed_icon(&profile, app_name);
    }
    let (ctx, ui) = profile.ctx(platform);
    let outcome = add_with_desktop(&ctx, golden_args(input, json!({}), false), None).await;
    let mut problems = Vec::new();
    if case["outcome"].as_str() != Some("resolved") || !outcome.failed.is_empty() {
        problems.push(format!(
            "outcome {:?}, golden {}",
            outcome.message(),
            case["outcome"]
        ));
    }
    if !ui.notices().is_empty() {
        problems.push("notify false raised a notification".to_string());
    }
    for (base, entries) in case["tree"].as_object().expect("a tree") {
        problems.extend(diff_tree(
            &profile,
            base,
            entries.as_array().expect("tree entries"),
        ));
    }
    // `written` is each item the golden says the TS left: a Linux `.desktop` file, a macOS bundle (counted by
    // its `run.sh`) and a macOS Desktop link.
    let golden_entries: Vec<&Value> = case["tree"]
        .as_object()
        .expect("a tree")
        .values()
        .flat_map(|entries| entries.as_array().expect("entries").iter())
        .collect();
    let expected_written = golden_entries
        .iter()
        .filter(|entry| {
            let path = entry["path"].as_str().expect("path");
            match platform {
                Platform::Linux => path.ends_with(".desktop"),
                _ => {
                    path.ends_with("/Contents/MacOS/run.sh")
                        || entry["kind"].as_str() == Some("symlink")
                }
            }
        })
        .count();
    if outcome.written.len() != expected_written {
        problems.push(format!(
            "written {} items, the golden has {expected_written}",
            outcome.written.len()
        ));
    }
    if problems.is_empty() {
        Ok(false)
    } else {
        Err(format!("{id}:\n  {}", problems.join("\n  ")))
    }
}

#[tokio::test]
async fn every_text_golden_replays_through_the_op() {
    let cases = slice_cases("text");
    let (mut replayed, mut skipped, mut failures) = (0usize, 0usize, Vec::new());
    for (id, case) in &cases {
        match replay_text(id, case).await {
            Ok(true) => skipped += 1,
            Ok(false) => replayed += 1,
            Err(problem) => failures.push(problem),
        }
    }
    println!(
        "add text goldens: {replayed} replayed through shortcuts_add, {skipped} skipped (no symlink here)"
    );
    assert!(
        failures.is_empty(),
        "{} of {} text goldens differ:\n{}",
        failures.len(),
        cases.len(),
        failures.join("\n")
    );
    assert_eq!(replayed + skipped, cases.len());
    if !cfg!(windows) || on_ci() {
        assert_eq!(skipped, 0, "a link-capable host skips nothing");
    }
}

// ------------------------------------------------------------------------------ the Windows goldens

/// What the golden's synthetic `%SystemRoot%` is: the target of every `.lnk` is `<it>\explorer.exe`.
const ORACLE_WINDOWS: &str = "Z:\\GameLibOracle\\Windows";

/// The environment the shell hands the writer: what the oracle's process had besides the `GAMELIB_LNK_*`
/// names. The golden's `envDiff` is recorded against it.
fn base_env() -> Vec<(String, String)> {
    vec![
        ("PATH".to_string(), "C:\\Oracle\\bin".to_string()),
        ("TEMP".to_string(), "C:\\Oracle\\tmp".to_string()),
    ]
}

/// A `SpecRunner` that records every spawn, answers `answer`, and, like a PowerShell that succeeded, writes
/// the `.lnk` named by `GAMELIB_LNK_PATH` when it exited 0 and the case says the file is there.
struct LnkRunner {
    answer: SpecOutput,
    create_lnk: bool,
    spawns: Mutex<Vec<ProcSpec>>,
}

impl LnkRunner {
    fn new(answer: SpecOutput, create_lnk: bool) -> LnkRunner {
        LnkRunner {
            answer,
            create_lnk,
            spawns: Mutex::new(Vec::new()),
        }
    }

    fn spawns(&self) -> Vec<ProcSpec> {
        let guard = self.spawns.lock().expect("the spawn log");
        guard.iter().map(clone_spec).collect()
    }
}

fn clone_spec(spec: &ProcSpec) -> ProcSpec {
    let mut copy = ProcSpec::new(spec.label, &spec.program);
    copy.argv = spec.argv.clone();
    copy.env = spec.env.clone();
    copy.replace_env = spec.replace_env;
    copy.cwd = spec.cwd.clone();
    copy.stdin = spec.stdin.clone();
    copy.timeout = spec.timeout;
    copy.hide_window = spec.hide_window;
    copy
}

impl SpecRunner for LnkRunner {
    fn run(&self, spec: ProcSpec, _on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
        if self.create_lnk && self.answer.code == Some(0) {
            let path = spec
                .env
                .iter()
                .find(|(k, _)| k == "GAMELIB_LNK_PATH")
                .map(|(_, v)| PathBuf::from(v))
                .expect("the spawn carries GAMELIB_LNK_PATH");
            fs::create_dir_all(path.parent().expect("a parent")).expect("lnk parent");
            fs::write(&path, b"L").expect("the scripted .lnk");
        }
        self.spawns.lock().expect("the spawn log").push(spec);
        let answer = self.answer.clone();
        Box::pin(async move { answer })
    }
}

/// The scripted `powershell.exe` answer a golden recorded: `{code, stdout?, stderr?, timedOut?, throws?}`.
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

/// The golden's path form: the profile as `<HOME>`, the Windows separator.
fn windows_form(path: &str, home: &Path) -> String {
    let home = home.to_string_lossy();
    let rest = path.strip_prefix(home.as_ref()).unwrap_or(path);
    let prefix = if rest.len() == path.len() {
        ""
    } else {
        "<HOME>"
    };
    format!("{prefix}{rest}").replace('/', "\\")
}

/// The seeded install the oracle's `install` variants name.
struct Install {
    install_path: PathBuf,
    executable: String,
    gog_executable: Option<String>,
}

fn seed_install(profile: &Profile, kind: Option<&str>) -> Option<Install> {
    let kind = kind?;
    let install_path = profile.root().join("Games").join("Oracle Install");
    fs::create_dir_all(&install_path).expect("the install folder");
    match kind {
        "store-exe" => {
            fs::write(install_path.join("Oracle.exe"), "x").expect("the store exe");
            Some(Install {
                install_path,
                executable: "Oracle.exe".to_string(),
                gog_executable: None,
            })
        }
        "gog" => {
            let exe = install_path.join("GogGame.exe");
            fs::write(&exe, "x").expect("the gog exe");
            Some(Install {
                install_path,
                executable: String::new(),
                gog_executable: Some(exe.to_string_lossy().into_owned()),
            })
        }
        other => panic!("unknown install variant {other}"),
    }
}

/// One Windows add golden through the op. Checks every PowerShell spawn and the outcome.
async fn replay_windows(id: &str, case: &Value) -> Result<usize, String> {
    let profile = Profile::new();
    let input = &case["input"];
    let app_data = profile
        .paths
        .app_data
        .clone()
        .expect("an app data folder")
        .to_string_lossy()
        .into_owned();
    // The registry Desktop: the golden's synthetic folder maps onto a folder of the profile.
    let golden_desktop = input["registryDesktop"].as_str();
    let desktop_dir = golden_desktop.map(|_| profile.root().join("Desktop"));
    let mut paths = profile.paths.clone();
    paths.shell_exe = PathBuf::new();
    let install = seed_install(&profile, input["install"].as_str());
    let answer = scripted_output(&input["powershell"]);
    let runner = Arc::new(LnkRunner::new(
        answer,
        input["lnkPresentAfterExit0"].as_bool() == Some(true),
    ));
    let (ctx, ui) = profile.ctx(Platform::Windows);
    let ctx = ctx
        .with_paths(paths)
        .with_proc(runner.clone())
        .with_base_env(base_env())
        .with_system_root(Some(PathBuf::from(ORACLE_WINDOWS)));
    let mut extra = json!({});
    if let Some(install) = &install {
        extra["installPath"] = json!(install.install_path.to_string_lossy());
        extra["executable"] = json!(install.executable);
        if let Some(gog) = &install.gog_executable {
            extra["gogExecutable"] = json!(gog);
        }
    }
    let outcome = add_with_desktop(
        &ctx,
        golden_args(input, extra, true),
        desktop_dir.as_deref(),
    )
    .await;

    // The golden's path and message forms, mapped onto this profile.
    let map = |text: &str| -> String {
        let mut mapped = text.replace("<APPDATA>", &app_data);
        if let (Some(from), Some(to)) = (golden_desktop, &desktop_dir) {
            mapped = mapped.replace(from, &to.to_string_lossy());
        }
        mapped
    };
    let mut problems = Vec::new();
    let goldens: Vec<&Value> = case["spawns"]
        .as_array()
        .expect("spawns")
        .iter()
        .filter(|s| s["program"].as_str() == Some("powershell.exe"))
        .collect();
    let seen = runner.spawns();
    if seen.len() != goldens.len() {
        return Err(format!(
            "{id}: {} PowerShell spawns, the golden has {}",
            seen.len(),
            goldens.len()
        ));
    }
    let mut expected_written = 0usize;
    for (spec, golden) in seen.iter().zip(&goldens) {
        let mut want: BTreeMap<String, String> = base_env().into_iter().collect();
        let set = golden["envDiff"]["set"].as_object().expect("envDiff.set");
        for (name, value) in set {
            want.insert(name.clone(), value.as_str().expect("env value").to_string());
        }
        want.insert(
            "GAMELIB_LNK_PATH".to_string(),
            map(set["GAMELIB_LNK_PATH"].as_str().expect("a lnk path")),
        );
        let mut got: BTreeMap<String, String> = spec.env.iter().cloned().collect();
        if got.len() != spec.env.len() {
            problems.push("a duplicate environment variable".to_string());
        }
        // The icon is a path of this profile: compare it in the golden's form.
        if let Some(icon) = got.get_mut("GAMELIB_LNK_ICON") {
            *icon = windows_form(icon, profile.root());
        }
        if got != want {
            problems.push(format!("env {got:?}\n     want {want:?}"));
        }
        if spec.label != "shortcuts-lnk"
            || spec.program != "powershell.exe"
            || spec.argv
                != golden["argv"]
                    .as_array()
                    .expect("argv")
                    .iter()
                    .map(|a| a.as_str().expect("an arg").to_string())
                    .collect::<Vec<_>>()
            || spec.stdin.as_deref() != golden["stdin"].as_str()
            || !spec.replace_env
            || !spec.hide_window
            || spec.cwd.is_some()
            || spec.timeout
                != golden["options"]["timeoutMs"]
                    .as_u64()
                    .map(Duration::from_millis)
        {
            problems.push("the spawn's program, argv, stdin or options differ".to_string());
        }
        if input["powershell"]["code"].as_i64() == Some(0)
            && input["lnkPresentAfterExit0"].as_bool() == Some(true)
        {
            expected_written += 1;
        }
    }
    let rejected = case["outcome"]["result"].as_str() == Some("rejected");
    match (outcome.message(), rejected) {
        (None, false) => {}
        (Some(message), true) => {
            let want = map(case["outcome"]["message"].as_str().expect("a message"));
            if message != want {
                problems.push(format!("message {message:?}\n     want {want:?}"));
            }
        }
        (got, _) => problems.push(format!("outcome {got:?}, golden {}", case["outcome"])),
    }
    if outcome.written.len() != expected_written {
        problems.push(format!(
            "written {:?}, expected {expected_written} files",
            outcome.written
        ));
    }
    if !outcome.refused.is_empty() {
        problems.push("a Windows add refused something".to_string());
    }
    if !ui.notices().is_empty() {
        let body = ui.notices()[0].1.clone();
        // A game with no title is never looked up (260905-mv5): the disk re-check answers false for it, so
        // even a written `.lnk` is reported as the error notice, exactly as the handler did.
        let untitled = input["title"].as_str().is_some_and(str::is_empty);
        let want = if rejected || outcome.written.is_empty() || untitled {
            notice::ADD_FAILED.default
        } else {
            notice::ADDED.default
        };
        // `notify: true` on a case that wrote nothing and failed nothing (both settings off) still reports
        // from the disk: nothing there is the error notice.
        if body != want {
            problems.push(format!("notice {body:?}, expected {want:?}"));
        }
    }
    if problems.is_empty() {
        Ok(seen.len())
    } else {
        Err(format!("{id}:\n  {}", problems.join("\n  ")))
    }
}

#[tokio::test]
async fn every_windows_add_golden_replays_through_the_op() {
    let cases = slice_cases("windows");
    let mut replayed = 0usize;
    let (mut spawns, mut failures) = (0usize, Vec::new());
    for (id, case) in cases
        .iter()
        .filter(|(_, case)| case["family"].as_str() == Some("lnk"))
    {
        match replay_windows(id, case).await {
            Ok(count) => {
                replayed += 1;
                spawns += count;
            }
            Err(problem) => failures.push(problem),
        }
    }
    println!("add windows goldens: {replayed} replayed through shortcuts_add ({spawns} PowerShell spawns)");
    assert!(
        failures.is_empty(),
        "{} Windows add goldens differ:\n{}",
        failures.len(),
        failures.join("\n")
    );
    assert!(replayed >= 30, "only {replayed} lnk goldens");
    assert!(spawns >= 60, "only {spawns} PowerShell spawns");
}

// ------------------------------------------------------------------------- the named twins of the TS tests

/// The Windows rig: a recording PowerShell that exits `code` (creating the `.lnk` when it exits 0), over a
/// fresh profile whose registry Desktop is `<home>/Desktop`.
struct WinRig {
    profile: Profile,
    runner: Arc<LnkRunner>,
    ctx: ShortcutsCtx,
    desktop_dir: PathBuf,
}

fn win_rig(code: i32, shell_exe: Option<PathBuf>) -> WinRig {
    let profile = Profile::new();
    let runner = Arc::new(LnkRunner::new(
        SpecOutput {
            code: Some(code),
            ..SpecOutput::default()
        },
        true,
    ));
    let mut paths = profile.paths.clone();
    paths.shell_exe = shell_exe.unwrap_or_default();
    let (ctx, _) = profile.ctx(Platform::Windows);
    let ctx = ctx
        .with_paths(paths)
        .with_proc(runner.clone())
        .with_base_env(base_env())
        .with_system_root(Some(PathBuf::from(ORACLE_WINDOWS)));
    let desktop_dir = profile.root().join("Desktop");
    WinRig {
        profile,
        runner,
        ctx,
        desktop_dir,
    }
}

impl WinRig {
    /// `(desktop .lnk, start menu .lnk)` for `title`.
    fn files(&self, title: &str) -> (PathBuf, PathBuf) {
        let (desktop, menu) = shortcut_files(
            Platform::Windows,
            &self.ctx.paths,
            title,
            Some(&self.desktop_dir),
        );
        (desktop.expect("a Desktop path"), menu.expect("a menu path"))
    }

    fn env_of(&self, name: &str) -> Vec<String> {
        self.runner
            .spawns()
            .iter()
            .map(|spec| {
                spec.env
                    .iter()
                    .find(|(k, _)| k == name)
                    .map(|(_, v)| v.clone())
                    .unwrap_or_default()
            })
            .collect()
    }
}

const OUTCOME_TITLE: &str = "Outcome Test Game";
const STEAM_TITLE: &str = "Steam Shortcut Test";

fn outcome_game() -> Value {
    game_json(OUTCOME_TITLE, "outcome-test-app", "legendary")
}

fn steam_game() -> Value {
    game_json(STEAM_TITLE, "230070", "steam")
}

fn as_strings(paths: &[PathBuf]) -> BTreeSet<String> {
    paths
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

fn same_path(a: &str, b: &Path) -> bool {
    a.replace('\\', "/") == b.to_string_lossy().replace('\\', "/")
}

fn linux_rig() -> (Profile, ShortcutsCtx, Arc<RecordingUi>) {
    let profile = Profile::new();
    let (ctx, ui) = profile.ctx(Platform::Linux);
    (profile, ctx, ui)
}

/// A macOS context whose shell executable is the TS tests' fake one.
fn mac_rig() -> (Profile, ShortcutsCtx, Arc<RecordingUi>) {
    let mut profile = Profile::new();
    profile.paths.shell_exe = PathBuf::from("/fake/GameLib.app/Contents/MacOS/GameLib");
    let (ctx, ui) = profile.ctx(Platform::Mac);
    (profile, ctx, ui)
}

fn mac_files(profile: &Profile, title: &str) -> (PathBuf, PathBuf) {
    let (desktop, menu) = shortcut_files(Platform::Mac, &profile.paths, title, None);
    (desktop.expect("desktop"), menu.expect("menu"))
}

fn run_sh(app: &Path) -> PathBuf {
    app.join("Contents").join("MacOS").join("run.sh")
}

fn is_link(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink())
}

fn link_to(target: &Path, link: &Path) -> bool {
    #[cfg(unix)]
    let made = std::os::unix::fs::symlink(target, link);
    #[cfg(windows)]
    let made = std::os::windows::fs::symlink_dir(target, link);
    gamelib_testutil::require_link(made, "a Desktop symlink", on_ci())
}

const MAC_URL: &str = "gamelib://launch?appName=outcome-test-app&runner=legendary";

#[tokio::test]
async fn linux_rejects_when_the_desktop_entry_cannot_be_written() {
    let (profile, ctx, _) = linux_rig();
    let (desktop, menu) = shortcut_files(Platform::Linux, &profile.paths, OUTCOME_TITLE, None);
    let (desktop, menu) = (desktop.expect("desktop"), menu.expect("menu"));
    // The Desktop folder is absent (the TS does not create it); the applications folder is there.
    fs::create_dir_all(menu.parent().expect("a parent")).expect("menu dir");

    let out = add_with_desktop(
        &ctx,
        add_args(outcome_game(), true, true, true, false),
        None,
    )
    .await;

    assert_eq!(out.failed.len(), 1, "{:?}", out.failed);
    assert!(out.failed[0].contains(&desktop.to_string_lossy().into_owned()));
    assert!(out
        .message()
        .is_some_and(|m| m.starts_with("Could not write shortcuts: ")));
    // Every requested file is attempted: the menu copy is written despite the Desktop failure.
    assert_eq!(out.written, vec![menu.to_string_lossy().into_owned()]);
    assert!(menu.exists() && out.exists_after);
}

#[tokio::test]
async fn linux_writes_both_entries_when_both_folders_exist() {
    let (profile, ctx, _) = linux_rig();
    let (desktop, menu) = shortcut_files(Platform::Linux, &profile.paths, OUTCOME_TITLE, None);
    let (desktop, menu) = (desktop.expect("desktop"), menu.expect("menu"));
    fs::create_dir_all(desktop.parent().expect("a parent")).expect("desktop dir");
    fs::create_dir_all(menu.parent().expect("a parent")).expect("menu dir");

    let out = add_with_desktop(
        &ctx,
        add_args(outcome_game(), true, true, true, false),
        None,
    )
    .await;

    assert_eq!(out.message(), None);
    assert!(desktop.exists() && menu.exists());
    assert_eq!(out.written.len(), 2);
    assert!(out.exists_after && out.refused.is_empty());
}

#[test]
fn win32_shortcut_files_have_no_desktop_path_without_a_registry_folder_and_use_it_when_given() {
    let paths = ShortcutPaths {
        user_home: PathBuf::from("C:\\Users\\u"),
        app_data: Some(PathBuf::from("C:\\Users\\u\\AppData\\Roaming")),
        ..ShortcutPaths::default()
    };
    let (none, menu) = shortcut_files(Platform::Windows, &paths, OUTCOME_TITLE, None);
    assert_eq!(none, None);
    let want_menu = PathBuf::from(format!(
        "C:\\Users\\u\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\{OUTCOME_TITLE}.lnk"
    ));
    assert_eq!(menu, Some(want_menu.clone()));
    let registry = Path::new("D:\\GameLibTest\\Desktop");
    let (desktop, same_menu) =
        shortcut_files(Platform::Windows, &paths, OUTCOME_TITLE, Some(registry));
    assert_eq!(
        desktop,
        Some(PathBuf::from(format!(
            "D:\\GameLibTest\\Desktop\\{OUTCOME_TITLE}.lnk"
        )))
    );
    assert_eq!(same_menu, Some(want_menu));
}

#[tokio::test]
async fn win32_rejects_when_powershell_fails_to_write_the_lnk() {
    let rig = win_rig(1, None);
    let args = add_args(outcome_game(), true, true, true, false);

    let out = add_with_desktop(&rig.ctx, args, Some(&rig.desktop_dir)).await;

    assert!(out.message().is_some());
    assert_eq!(out.failed.len(), 2, "both files failed: {:?}", out.failed);
    assert!(out.written.is_empty());
    assert!(!rig.runner.spawns().is_empty());
}

#[tokio::test]
async fn win32_registry_lookup_fails_writes_only_the_start_menu_lnk_and_rejects_naming_the_desktop()
{
    let rig = win_rig(0, None);
    let (_, menu) = rig.files(OUTCOME_TITLE);

    let out = add_with_desktop(
        &rig.ctx,
        add_args(outcome_game(), true, true, true, false),
        None,
    )
    .await;

    let message = out.message().expect("a rejection");
    assert!(
        message.contains("Desktop") && message.contains("registry"),
        "{message}"
    );
    assert_eq!(rig.runner.spawns().len(), 1);
    assert!(same_path(&rig.env_of("GAMELIB_LNK_PATH")[0], &menu));
    assert!(menu.exists());
    assert_eq!(out.written, vec![menu.to_string_lossy().into_owned()]);
}

#[tokio::test]
async fn win32_registry_lookup_fails_but_no_desktop_shortcut_was_requested_resolves_with_the_start_menu_lnk_only(
) {
    let rig = win_rig(0, None);
    let (_, menu) = rig.files(OUTCOME_TITLE);

    let out = add_with_desktop(
        &rig.ctx,
        add_args(outcome_game(), false, true, false, false),
        None,
    )
    .await;

    assert_eq!(out.message(), None);
    assert_eq!(rig.runner.spawns().len(), 1);
    assert!(same_path(&rig.env_of("GAMELIB_LNK_PATH")[0], &menu));
}

#[tokio::test]
async fn win32_writes_the_desktop_and_start_menu_lnk_through_powershell_with_paths_in_env_never_a_shell(
) {
    let rig = win_rig(0, None);
    let (desktop, menu) = rig.files(OUTCOME_TITLE);

    let out = add_with_desktop(
        &rig.ctx,
        add_args(outcome_game(), true, true, true, false),
        Some(&rig.desktop_dir),
    )
    .await;

    assert_eq!(out.message(), None);
    let spawns = rig.runner.spawns();
    assert_eq!(spawns.len(), 2);
    for spec in &spawns {
        assert_eq!(spec.program, "powershell.exe");
        assert_eq!(
            spec.argv,
            [
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                "-"
            ]
        );
        // The script is a constant on stdin; nothing is formatted into a shell command line.
        assert!(spec.stdin.is_some() && spec.replace_env);
    }
    let written: BTreeSet<String> = rig.env_of("GAMELIB_LNK_PATH").into_iter().collect();
    assert_eq!(written, as_strings(&[desktop, menu]));
}

#[tokio::test]
async fn linux_both_desktop_files_exec_the_steam_gamelib_url() {
    let (profile, ctx, _) = linux_rig();
    let (desktop, menu) = shortcut_files(Platform::Linux, &profile.paths, STEAM_TITLE, None);
    let (desktop, menu) = (desktop.expect("desktop"), menu.expect("menu"));
    fs::create_dir_all(desktop.parent().expect("a parent")).expect("desktop dir");
    fs::create_dir_all(menu.parent().expect("a parent")).expect("menu dir");

    add_with_desktop(&ctx, add_args(steam_game(), true, true, true, false), None).await;

    for file in [desktop, menu] {
        let text = fs::read_to_string(&file).expect("the entry");
        assert!(
            text.contains("Exec=xdg-open gamelib://launch?appName=230070&runner=steam"),
            "{text}"
        );
    }
}

#[tokio::test]
async fn win32_both_lnk_writes_pass_the_steam_url_as_one_quoted_explorer_argument() {
    let rig = win_rig(0, None);
    let (desktop, menu) = rig.files(STEAM_TITLE);

    add_with_desktop(
        &rig.ctx,
        add_args(steam_game(), true, true, true, false),
        Some(&rig.desktop_dir),
    )
    .await;

    assert_eq!(rig.runner.spawns().len(), 2);
    let paths: BTreeSet<String> = rig.env_of("GAMELIB_LNK_PATH").into_iter().collect();
    assert_eq!(paths, as_strings(&[desktop, menu]));
    for args in rig.env_of("GAMELIB_LNK_ARGS") {
        assert_eq!(args, "\"gamelib://launch?appName=230070&runner=steam\"");
    }
    for target in rig.env_of("GAMELIB_LNK_TARGET") {
        assert!(target.ends_with("explorer.exe"), "{target}");
    }
}

#[tokio::test]
async fn win32_a_hostile_app_name_cannot_add_a_second_quote_or_leak_raw_into_the_url() {
    let rig = win_rig(0, None);
    let hostile = "x\" /root,C:\\ &x";
    let game = game_json("Hostile Name Test", hostile, "legendary");

    add_with_desktop(
        &rig.ctx,
        add_args(game, true, true, true, false),
        Some(&rig.desktop_dir),
    )
    .await;

    assert_eq!(rig.runner.spawns().len(), 2);
    for args in rig.env_of("GAMELIB_LNK_ARGS") {
        assert_eq!(args.matches('"').count(), 2, "{args}");
        // encodeURIComponent('x" /root,C:\\ &x')
        assert_eq!(
            args,
            "\"gamelib://launch?appName=x%22%20%2Froot%2CC%3A%5C%20%26x&runner=legendary\""
        );
    }
}

#[tokio::test]
async fn win32_a_steam_record_with_an_install_dir_carries_the_games_own_exe_as_the_icon() {
    let rig = win_rig(0, None);
    let install = rig.profile.root().join(STEAM_TITLE);
    fs::create_dir_all(&install).expect("the install dir");
    let exe = install.join(format!("{STEAM_TITLE}.exe"));
    fs::write(&exe, [0u8; 16]).expect("the game exe");
    fs::write(install.join("UnityCrashHandler64.exe"), [0u8; 64]).expect("a helper");
    let mut game = steam_game();
    game["installPath"] = json!(install.to_string_lossy());

    add_with_desktop(
        &rig.ctx,
        add_args(game, true, true, true, false),
        Some(&rig.desktop_dir),
    )
    .await;

    let icons = rig.env_of("GAMELIB_LNK_ICON");
    assert_eq!(icons.len(), 2);
    for icon in icons {
        assert!(same_path(&icon, &exe), "{icon}");
    }
    for index in rig.env_of("GAMELIB_LNK_ICON_INDEX") {
        assert_eq!(index, "0");
    }
}

#[tokio::test]
async fn win32_with_no_install_path_and_no_shell_exe_still_resolves_with_an_empty_icon() {
    let rig = win_rig(0, None);

    let out = add_with_desktop(
        &rig.ctx,
        add_args(steam_game(), true, true, true, false),
        Some(&rig.desktop_dir),
    )
    .await;

    assert_eq!(out.message(), None);
    let icons = rig.env_of("GAMELIB_LNK_ICON");
    assert_eq!(icons.len(), 2);
    assert!(icons.iter().all(String::is_empty));
}

#[tokio::test]
async fn win32_with_no_install_path_and_a_shell_exe_the_icon_is_the_shell_exe() {
    let home = FakeHome::new("gamelib-shortcuts-add-shell-");
    let shell = home.root().join("gamelib-shell.exe");
    fs::write(&shell, [0u8; 8]).expect("the shell exe");
    let rig = win_rig(0, Some(shell.clone()));

    add_with_desktop(
        &rig.ctx,
        add_args(steam_game(), true, true, true, false),
        Some(&rig.desktop_dir),
    )
    .await;

    let icons = rig.env_of("GAMELIB_LNK_ICON");
    assert_eq!(icons.len(), 2);
    for icon in icons {
        assert!(same_path(&icon, &shell), "{icon}");
    }
}

#[tokio::test]
async fn darwin_writes_run_sh_with_the_quoted_steam_url_and_an_iconless_plist() {
    let (profile, ctx, _) = mac_rig();
    let (_, app) = mac_files(&profile, STEAM_TITLE);

    add_with_desktop(&ctx, add_args(steam_game(), true, true, true, false), None).await;

    let script = fs::read_to_string(run_sh(&app)).expect("run.sh");
    assert!(script.contains("--no-gui 'gamelib://launch?appName=230070&runner=steam'"));
    assert!(script.contains("\"/fake/GameLib.app/Contents/MacOS/GameLib\""));
    let plist = fs::read_to_string(app.join("Contents").join("Info.plist")).expect("plist");
    assert!(!plist.contains("CFBundleIconFile"));
}

fn settings_of(add_steam: bool) -> ShortcutSettings {
    serde_json::from_value(json!({
        "addDesktopShortcuts": true, "addStartMenuShortcuts": true, "addSteamShortcuts": add_steam
    }))
    .expect("settings")
}

fn game_of(value: Value) -> ShortcutGame {
    serde_json::from_value(value).expect("a game")
}

#[test]
fn a_steam_game_is_not_registered_as_a_non_steam_game() {
    assert!(!steam_registration_wanted(
        &game_of(steam_game()),
        &settings_of(true)
    ));
}

#[test]
fn a_legendary_game_is_still_registered_as_a_non_steam_game() {
    assert!(steam_registration_wanted(
        &game_of(outcome_game()),
        &settings_of(true)
    ));
    assert!(!steam_registration_wanted(
        &game_of(outcome_game()),
        &settings_of(false)
    ));
}

#[test]
fn darwin_shortcut_files_are_distinct_desktop_and_applications_app_paths() {
    let (profile, _, _) = mac_rig();
    let (desktop, menu) = mac_files(&profile, "X");
    assert_eq!(desktop, profile.root().join("Desktop").join("X.app"));
    assert_eq!(menu, profile.root().join("Applications").join("X.app"));
    assert_ne!(desktop, menu);
}

#[tokio::test]
async fn darwin_menu_add_with_the_desktop_toggle_off_writes_applications_only() {
    let (profile, ctx, _) = mac_rig();
    let (desktop, menu) = mac_files(&profile, OUTCOME_TITLE);

    let out = add_with_desktop(
        &ctx,
        add_args(outcome_game(), false, false, true, false),
        None,
    )
    .await;

    assert!(run_sh(&menu).exists());
    assert!(fs::symlink_metadata(&desktop).is_err());
    assert_eq!(out.written, vec![menu.to_string_lossy().into_owned()]);
    assert_eq!(out.message(), None);
}

#[tokio::test]
async fn darwin_menu_add_with_the_desktop_toggle_on_writes_one_bundle_and_a_desktop_symlink_to_it()
{
    if !host_can_link() {
        return;
    }
    let (profile, ctx, _) = mac_rig();
    let (desktop, menu) = mac_files(&profile, OUTCOME_TITLE);

    let out = add_with_desktop(
        &ctx,
        add_args(outcome_game(), true, false, true, false),
        None,
    )
    .await;

    assert_eq!(out.message(), None);
    assert!(is_link(&desktop));
    assert_eq!(fs::read_link(&desktop).expect("link target"), menu);
    // The bundle is written once, in Applications; the Desktop link reads through to it.
    let url = format!("'{MAC_URL}'");
    assert!(fs::read_to_string(run_sh(&menu))
        .expect("run.sh")
        .contains(&url));
    assert!(fs::read_to_string(run_sh(&desktop))
        .expect("through the link")
        .contains(&url));
}

#[tokio::test]
async fn darwin_install_add_with_only_the_desktop_toggle_on_writes_the_applications_bundle_and_links_it(
) {
    if !host_can_link() {
        return;
    }
    let (profile, ctx, _) = mac_rig();
    let (desktop, menu) = mac_files(&profile, OUTCOME_TITLE);

    let out = add_with_desktop(
        &ctx,
        add_args(outcome_game(), true, false, false, false),
        None,
    )
    .await;

    assert_eq!(out.message(), None);
    assert!(run_sh(&menu).exists());
    assert!(is_link(&desktop));
    assert_eq!(fs::read_link(&desktop).expect("link target"), menu);
}

/// Copies a directory tree (regular files and directories only).
fn copy_tree(from: &Path, to: &Path) {
    fs::create_dir_all(to).expect("a target dir");
    for entry in fs::read_dir(from).expect("a source dir") {
        let entry = entry.expect("an entry");
        let target = to.join(entry.file_name());
        if entry.file_type().expect("a file type").is_dir() {
            copy_tree(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), &target).expect("a copied file");
        }
    }
}

#[tokio::test]
async fn darwin_a_legacy_real_desktop_bundle_gamelib_wrote_is_replaced_by_the_link() {
    if !host_can_link() {
        return;
    }
    let (profile, ctx, _) = mac_rig();
    let (desktop, menu) = mac_files(&profile, OUTCOME_TITLE);
    // The 261026-clh era: a real bundle on the Desktop, written by GameLib.
    add_with_desktop(
        &ctx,
        add_args(outcome_game(), false, true, false, false),
        None,
    )
    .await;
    copy_tree(&menu, &desktop);
    assert!(!is_link(&desktop));

    let out = add_with_desktop(
        &ctx,
        add_args(outcome_game(), true, false, true, false),
        None,
    )
    .await;

    assert_eq!(out.message(), None);
    assert!(out.refused.is_empty());
    assert!(is_link(&desktop));
    assert_eq!(fs::read_link(&desktop).expect("link target"), menu);
}

#[tokio::test]
async fn darwin_a_real_desktop_bundle_gamelib_cannot_prove_it_wrote_is_refused_not_replaced() {
    // The TS replaced this (an empty run.sh): D-22 refuses, the bundle in Applications is still written.
    let (profile, ctx, _) = mac_rig();
    let (desktop, menu) = mac_files(&profile, OUTCOME_TITLE);
    fs::create_dir_all(desktop.join("Contents").join("MacOS")).expect("their bundle");
    fs::write(run_sh(&desktop), "").expect("their run.sh");

    let out = add_with_desktop(
        &ctx,
        add_args(outcome_game(), true, true, true, false),
        None,
    )
    .await;

    assert_eq!(out.refused, vec![desktop.to_string_lossy().into_owned()]);
    assert!(out
        .message()
        .is_some_and(|m| m.contains(&desktop.to_string_lossy().into_owned())));
    assert!(
        !is_link(&desktop) && run_sh(&desktop).exists(),
        "their bundle is untouched"
    );
    assert!(
        run_sh(&menu).exists(),
        "the Applications bundle is still written"
    );
}

#[tokio::test]
async fn darwin_a_dangling_desktop_link_to_the_bundle_is_replaced_by_a_link_to_the_bundle() {
    if !host_can_link() {
        return;
    }
    let (profile, ctx, _) = mac_rig();
    let (desktop, menu) = mac_files(&profile, OUTCOME_TITLE);
    fs::create_dir_all(desktop.parent().expect("a parent")).expect("Desktop");
    // A stale link from an earlier add: it names the bundle's own path, which is gone.
    assert!(link_to(&menu, &desktop));

    let out = add_with_desktop(
        &ctx,
        add_args(outcome_game(), true, true, true, false),
        None,
    )
    .await;

    assert_eq!(out.message(), None);
    assert!(is_link(&desktop));
    assert_eq!(fs::read_link(&desktop).expect("link target"), menu);
}

#[tokio::test]
async fn darwin_a_dangling_desktop_link_elsewhere_is_refused_not_replaced() {
    if !host_can_link() {
        return;
    }
    // The TS replaced this (`gone-261026-ctm.app`): D-22 refuses a link GameLib cannot prove it made.
    let (profile, ctx, _) = mac_rig();
    let (desktop, _) = mac_files(&profile, OUTCOME_TITLE);
    fs::create_dir_all(desktop.parent().expect("a parent")).expect("Desktop");
    let elsewhere = profile
        .root()
        .join("Applications")
        .join("gone-261026-ctm.app");
    assert!(link_to(&elsewhere, &desktop));

    let out = add_with_desktop(
        &ctx,
        add_args(outcome_game(), true, true, true, false),
        None,
    )
    .await;

    assert_eq!(out.refused, vec![desktop.to_string_lossy().into_owned()]);
    assert_eq!(fs::read_link(&desktop).expect("link target"), elsewhere);
}

#[tokio::test]
async fn darwin_install_add_with_both_toggles_off_writes_nothing_and_resolves() {
    let (profile, ctx, _) = mac_rig();
    let (desktop, menu) = mac_files(&profile, OUTCOME_TITLE);

    let out = add_with_desktop(
        &ctx,
        add_args(outcome_game(), false, false, false, false),
        None,
    )
    .await;

    assert_eq!(out, AddOutcome::default());
    assert!(fs::symlink_metadata(&desktop).is_err() && fs::symlink_metadata(&menu).is_err());
}

#[tokio::test]
async fn darwin_a_failed_desktop_link_rejects_naming_the_path_and_the_applications_bundle_is_still_written(
) {
    let (profile, ctx, _) = mac_rig();
    let (desktop, menu) = mac_files(&profile, OUTCOME_TITLE);
    // ~/Desktop as a regular file makes the Desktop item impossible.
    let desktop_dir = desktop.parent().expect("a parent").to_path_buf();
    fs::write(&desktop_dir, "").expect("a file where the folder should be");

    let out = add_with_desktop(
        &ctx,
        add_args(outcome_game(), true, false, true, false),
        None,
    )
    .await;

    let named = desktop.to_string_lossy().into_owned();
    assert!(out.message().is_some_and(|m| m.contains(&named)));
    assert!(run_sh(&menu).exists());
    assert_eq!(out.written, vec![menu.to_string_lossy().into_owned()]);
}

#[tokio::test]
async fn darwin_a_failed_applications_write_rejects_naming_both_paths_and_creates_no_link() {
    let (profile, ctx, _) = mac_rig();
    let (desktop, menu) = mac_files(&profile, OUTCOME_TITLE);
    let apps_dir = menu.parent().expect("a parent").to_path_buf();
    fs::write(&apps_dir, "").expect("a file where the folder should be");

    let out = add_with_desktop(
        &ctx,
        add_args(outcome_game(), true, false, true, false),
        None,
    )
    .await;

    let message = out.message().expect("a rejection");
    assert!(
        message.contains(&menu.to_string_lossy().into_owned()),
        "{message}"
    );
    assert!(
        message.contains(&desktop.to_string_lossy().into_owned()),
        "{message}"
    );
    assert!(fs::symlink_metadata(&desktop).is_err(), "no link was made");
    assert!(out.written.is_empty());
}

// ------------------------------------------------------------------- beyond the twins: the op's contract

#[tokio::test]
async fn a_dlc_writes_nothing_and_answers_from_the_disk() {
    let (profile, ctx, ui) = linux_rig();
    fs::create_dir_all(profile.paths.linux_desktop()).expect("Desktop");
    fs::create_dir_all(profile.root().join(".local/share/applications")).expect("applications");
    let mut game = outcome_game();
    game["isDlc"] = json!(true);

    let out = add_with_desktop(&ctx, add_args(game, true, true, true, true), None).await;

    assert_eq!(out, AddOutcome::default());
    assert!(snapshot(profile.root(), "Desktop").is_empty());
    // Nothing on disk is not a success: the renderer is told so.
    assert_eq!(ui.notices()[0].1, notice::ADD_FAILED.default);
}

#[tokio::test]
async fn the_renderer_path_raises_the_notice_the_handler_raised_and_the_store_path_raises_none() {
    // Linux and Windows say Desktop and Start Menu; macOS names the Desktop iff the setting is on.
    let (profile, ctx, ui) = linux_rig();
    fs::create_dir_all(profile.paths.linux_desktop()).expect("Desktop");
    fs::create_dir_all(profile.root().join(".local/share/applications")).expect("applications");
    add_with_desktop(
        &ctx,
        add_args(outcome_game(), true, true, false, true),
        None,
    )
    .await;
    assert_eq!(
        ui.notices(),
        vec![("Shortcuts".to_string(), notice::ADDED.default.to_string())]
    );
    add_with_desktop(
        &ctx,
        add_args(outcome_game(), true, true, false, false),
        None,
    )
    .await;
    assert_eq!(ui.notices().len(), 1, "notify false raises nothing");

    if host_can_link() {
        let (_, ctx, ui) = mac_rig();
        add_with_desktop(
            &ctx,
            add_args(outcome_game(), true, false, true, true),
            None,
        )
        .await;
        add_with_desktop(
            &ctx,
            add_args(
                game_json("Other", "other-app", "legendary"),
                false,
                true,
                true,
                true,
            ),
            None,
        )
        .await;
        let bodies: Vec<String> = ui.notices().into_iter().map(|(_, body)| body).collect();
        assert_eq!(
            bodies,
            vec![
                notice::ADDED_MAC_DESKTOP.default.to_string(),
                notice::ADDED_MAC.default.to_string()
            ]
        );
    }

    // A failed write is the error notice, not a success.
    let (profile, ctx, ui) = linux_rig();
    fs::create_dir_all(profile.root().join(".local/share/applications")).expect("applications");
    add_with_desktop(&ctx, add_args(outcome_game(), true, true, true, true), None).await;
    assert_eq!(ui.notices()[0].1, notice::ADD_FAILED.default);
}

#[tokio::test]
async fn a_macos_bundle_is_not_written_when_the_executable_it_would_launch_is_unknown() {
    let (mut profile, _, _) = mac_rig();
    profile.paths.shell_exe = PathBuf::new();
    let (ctx, _) = profile.ctx(Platform::Mac);
    let (_, menu) = mac_files(&profile, OUTCOME_TITLE);

    let out = add_with_desktop(
        &ctx,
        add_args(outcome_game(), false, true, true, false),
        None,
    )
    .await;

    assert!(fs::symlink_metadata(&menu).is_err());
    assert!(out.written.is_empty() && out.message().is_some());
}

#[tokio::test]
async fn the_dispatch_validates_the_game_before_writing_anything() {
    let (profile, ctx, _) = linux_rig();
    let call = |game: Value| {
        let args = json!({
            "game": game,
            "settings": { "addDesktopShortcuts": true, "addStartMenuShortcuts": true, "addSteamShortcuts": false },
            "notify": false
        });
        let ctx = &ctx;
        async move { gamelib_shortcuts::dispatch("shortcuts_add", &[args], ctx).await }
    };
    let want = Err("shortcuts_add:bad-args".to_string());
    assert_eq!(call(game_json("T", "a", "secret-runner")).await, want);
    assert_eq!(call(game_json("", "a", "legendary")).await, want);
    assert_eq!(call(game_json("T", "", "legendary")).await, want);
    let mut extra = outcome_game();
    extra["secret-text"] = json!(1);
    assert_eq!(call(extra).await, want);
    assert!(snapshot(profile.root(), "Desktop").is_empty());
    // A valid game goes through (and writes into the folders the shell has).
    fs::create_dir_all(profile.paths.linux_desktop()).expect("Desktop");
    fs::create_dir_all(profile.root().join(".local/share/applications")).expect("applications");
    let done = call(outcome_game()).await.expect("an outcome");
    assert_eq!(done["failed"], json!([]));
    assert_eq!(done["existsAfter"], json!(true));
    assert_eq!(done["written"].as_array().map(Vec::len), Some(2));
}

/// Phase 94 plan 22: the store managers' path (`notify: false`) rejects on a partial failure with the TS's own
/// message, as `addShortcuts` did; the renderer's path (`notify: true`) resolves the outcome and has the notice raised.
#[tokio::test]
async fn the_dispatch_rejects_a_failed_write_for_a_store_manager_and_resolves_it_for_the_renderer()
{
    let (_profile, ctx, ui) = linux_rig();
    // The Desktop and applications folders are absent, so each requested file fails to write.
    let call = |notify: bool| {
        let args = json!({
            "game": outcome_game(),
            "settings": { "addDesktopShortcuts": true, "addStartMenuShortcuts": true, "addSteamShortcuts": false },
            "notify": notify
        });
        let ctx = &ctx;
        async move { gamelib_shortcuts::dispatch("shortcuts_add", &[args], ctx).await }
    };

    let rejected = call(false)
        .await
        .expect_err("a store manager's failed add rejects");
    assert!(
        rejected.starts_with("Could not write shortcuts: "),
        "{rejected}"
    );
    assert!(
        ui.notices().is_empty(),
        "notify false shows nothing: {:?}",
        ui.notices()
    );

    let resolved = call(true)
        .await
        .expect("the renderer's failed add resolves");
    assert_ne!(resolved["failed"], json!([]));
    assert_eq!(resolved["existsAfter"], json!(false));
    assert_eq!(
        ui.notices().len(),
        1,
        "notify true raises exactly one notice"
    );
}

// ----------------------------------------------------------------------- the twin guard

/// Every `it('...')` title in the TS outcome test, mapped to the Rust twin here. A title with no row, or a
/// row naming a function this file does not define, fails `every_ts_outcome_test_has_a_named_twin`.
const TWINS: &[(&str, &str)] = &[
    ("rejects when the desktop entry cannot be written", "linux_rejects_when_the_desktop_entry_cannot_be_written"),
    ("resolves and writes both entries when both folders exist", "linux_writes_both_entries_when_both_folders_exist"),
    ("shortcutFiles has no Desktop path without a registry folder, and uses it when given (261111-aq4)", "win32_shortcut_files_have_no_desktop_path_without_a_registry_folder_and_use_it_when_given"),
    ("rejects when PowerShell fails to write the .lnk", "win32_rejects_when_powershell_fails_to_write_the_lnk"),
    ("registry lookup fails: writes only the Start Menu .lnk and rejects naming the Desktop, never via getPath (261111-aq4)", "win32_registry_lookup_fails_writes_only_the_start_menu_lnk_and_rejects_naming_the_desktop"),
    ("registry lookup fails but no Desktop shortcut was requested: resolves, Start Menu .lnk only (261111-aq4)", "win32_registry_lookup_fails_but_no_desktop_shortcut_was_requested_resolves_with_the_start_menu_lnk_only"),
    ("writes the desktop and Start Menu .lnk through PowerShell, paths in env, never a shell", "win32_writes_the_desktop_and_start_menu_lnk_through_powershell_with_paths_in_env_never_a_shell"),
    ("linux: both .desktop files Exec the steam gamelib:// URL", "linux_both_desktop_files_exec_the_steam_gamelib_url"),
    ("win32: both .lnk writes pass the steam gamelib:// URL as one quoted explorer.exe argument", "win32_both_lnk_writes_pass_the_steam_url_as_one_quoted_explorer_argument"),
    ("win32: a hostile app_name cannot add a second quote or leak raw into the URL (T-66.4-76)", "win32_a_hostile_app_name_cannot_add_a_second_quote_or_leak_raw_into_the_url"),
    ("a Steam record with an install dir carries the game's own exe as the icon", "win32_a_steam_record_with_an_install_dir_carries_the_games_own_exe_as_the_icon"),
    ("with no install path and GAMELIB_SHELL_EXE unset, still resolves with an empty icon", "win32_with_no_install_path_and_no_shell_exe_still_resolves_with_an_empty_icon"),
    ("with no install path and GAMELIB_SHELL_EXE set, the icon is the shell exe", "win32_with_no_install_path_and_a_shell_exe_the_icon_is_the_shell_exe"),
    ("writes run.sh with the quoted steam URL and an iconless plist", "darwin_writes_run_sh_with_the_quoted_steam_url_and_an_iconless_plist"),
    ("does not register a Steam game as a non-Steam game", "a_steam_game_is_not_registered_as_a_non_steam_game"),
    ("still registers a legendary game", "a_legendary_game_is_still_registered_as_a_non_steam_game"),
    ("shortcutFiles returns distinct Desktop and Applications .app paths", "darwin_shortcut_files_are_distinct_desktop_and_applications_app_paths"),
    ("menu add with the Desktop toggle off writes Applications only", "darwin_menu_add_with_the_desktop_toggle_off_writes_applications_only"),
    ("261026-ctm menu add with the Desktop toggle on writes one bundle and a Desktop symlink to it", "darwin_menu_add_with_the_desktop_toggle_on_writes_one_bundle_and_a_desktop_symlink_to_it"),
    ("261026-ctm install add with only the Desktop toggle on writes the Applications bundle and links it", "darwin_install_add_with_only_the_desktop_toggle_on_writes_the_applications_bundle_and_links_it"),
    ("261026-ctm a legacy real Desktop bundle is replaced by the link", "darwin_a_legacy_real_desktop_bundle_gamelib_wrote_is_replaced_by_the_link"),
    ("261026-ctm a dangling Desktop link is replaced by a link to the bundle", "darwin_a_dangling_desktop_link_to_the_bundle_is_replaced_by_a_link_to_the_bundle"),
    ("install add with both toggles off writes nothing and resolves", "darwin_install_add_with_both_toggles_off_writes_nothing_and_resolves"),
    ("a failed Desktop link rejects naming the path, and the Applications bundle is still written", "darwin_a_failed_desktop_link_rejects_naming_the_path_and_the_applications_bundle_is_still_written"),
    ("261026-ctm a failed Applications write rejects naming both paths and creates no link", "darwin_a_failed_applications_write_rejects_naming_both_paths_and_creates_no_link"),
];

/// The `it('title'` titles of a Jest file, in order.
fn ts_titles(source: &str) -> Vec<String> {
    let mut titles = Vec::new();
    let mut rest = source;
    while let Some(at) = rest.find("it(") {
        let before_ok = rest[..at]
            .chars()
            .next_back()
            .is_none_or(|c| !c.is_alphanumeric() && c != '_');
        let after = rest[at + 3..].trim_start();
        let mut chars = after.chars();
        match chars.next() {
            Some(quote @ ('\'' | '"' | '`')) if before_ok => {
                let body: String = after[1..].chars().take_while(|c| *c != quote).collect();
                titles.push(body);
            }
            _ => {}
        }
        rest = &rest[at + 3..];
    }
    titles
}

/// What the TS file held when this plan was written, for when the file is gone (94-22 deletes it).
const TS_TEST_COUNT: usize = 25;

#[test]
fn every_ts_outcome_test_has_a_named_twin() {
    let ts = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("..")
        .join("src")
        .join("backend")
        .join("shortcuts")
        .join("__tests__")
        .join("addShortcutsOutcome.test.ts");
    let own = include_str!("golden_add.rs");
    for (title, twin) in TWINS {
        assert!(
            own.contains(&format!("fn {twin}(")),
            "the twin of {title:?} is not defined: {twin}"
        );
    }
    let unique: BTreeSet<&str> = TWINS.iter().map(|(_, twin)| *twin).collect();
    assert_eq!(unique.len(), TWINS.len(), "two titles share a twin");
    assert_eq!(TWINS.len(), TS_TEST_COUNT);
    match fs::read_to_string(&ts) {
        Ok(source) => {
            let titles = ts_titles(&source);
            assert_eq!(
                titles.len(),
                TS_TEST_COUNT,
                "the TS file now holds {} tests, not {TS_TEST_COUNT}",
                titles.len()
            );
            for title in &titles {
                assert!(
                    TWINS.iter().any(|(known, _)| known == title),
                    "no Rust twin for the TS test {title:?}"
                );
            }
        }
        // 94-22 deletes the TS test with the handlers: the table alone is then the record.
        Err(_) => println!("addShortcutsOutcome.test.ts is gone; the twin table stands alone"),
    }
}
