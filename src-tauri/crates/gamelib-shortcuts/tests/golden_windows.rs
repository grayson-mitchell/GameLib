//! Replays the Windows goldens recorded from the TypeScript (94-07) through the Rust port (94-16):
//! `golden/windows` over `writeWindowsShortcut` (`env-`), over the PowerShell spawns of `addShortcuts`
//! (`lnk-`) and over `readWindowsShellFolder` (`reg-`, also replayed by `golden_paths`). A golden is the
//! TS's answer, never a value typed here.
//!
//! The spawn goldens are exact: program, argv, the CRLF stdin bytes, the environment, the timeout, the
//! hidden window, and the outcome. Every spawn goes through a recording `SpecRunner` that creates or omits
//! the `.lnk` per the case; nothing starts PowerShell, and nothing is written outside a fresh `FakeHome`.
//! The one real run (Windows only) writes a `.lnk` into a temp profile and reads its bytes.
//!
//! Every slice has a floor: a manifest count the directory does not match, a family nobody replays, or a
//! count under the floor fails the test instead of letting an empty or truncated case set pass.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use gamelib_core::process::{BoxFuture, LineSink, ProcSpec, SpecOutput, SpecRunner};
use gamelib_shortcuts::launch_url::launch_url;
use gamelib_shortcuts::registry::{read_windows_shell_folder, WindowsShellFolder};
use gamelib_shortcuts::testing::{RecordedSpawn, ScriptedRunner};
use gamelib_shortcuts::windows::lnk::{
    write_windows_shortcut, ShortcutDetails, POWERSHELL_ARGS, WRITE_SHORTCUT_SCRIPT,
};
use gamelib_testutil::FakeHome;
use serde_json::Value;

fn golden_dir(slice: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("golden")
        .join(slice)
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
        if !name.ends_with(".json") || name == "MANIFEST.json" {
            continue;
        }
        let text = fs::read_to_string(&path).expect("a golden is readable");
        let value: Value =
            serde_json::from_str(&text).unwrap_or_else(|e| panic!("{slice}/{name}: not JSON: {e}"));
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

    fn family(&self, family: &str) -> Vec<(&String, &Value)> {
        self.cases
            .iter()
            .filter(|(_, case)| case["family"].as_str() == Some(family))
            .collect()
    }
}

// ----------------------------------------------------------------------------------- the runner

/// A `SpecRunner` that records every spawn, answers `answer`, and, like a PowerShell that succeeded, writes
/// the `.lnk` named by `GAMELIB_LNK_PATH` when it exited 0 and the case says the file is there.
struct LnkRunner {
    answer: SpecOutput,
    create_lnk: bool,
    spawns: Mutex<Vec<RecordedSpawn>>,
}

impl LnkRunner {
    fn new(answer: SpecOutput, create_lnk: bool) -> LnkRunner {
        LnkRunner {
            answer,
            create_lnk,
            spawns: Mutex::new(Vec::new()),
        }
    }

    fn spawns(&self) -> Vec<RecordedSpawn> {
        self.spawns.lock().expect("the spawn log").clone()
    }
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
        self.spawns
            .lock()
            .expect("the spawn log")
            .push(RecordedSpawn {
                label: spec.label,
                program: spec.program,
                argv: spec.argv,
                env: spec.env,
                replace_env: spec.replace_env,
                cwd: spec.cwd,
                stdin: spec.stdin,
                timeout: spec.timeout,
                hide_window: spec.hide_window,
            });
        let answer = self.answer.clone();
        Box::pin(async move { answer })
    }
}

/// The scripted `powershell.exe` / `reg.exe` answer a golden recorded: `{code, stdout?, stderr?, timedOut?,
/// throws?}`.
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

/// The environment the shell hands the writer: what the oracle's process had besides the `GAMELIB_LNK_*`
/// names. The golden's `envDiff` is recorded against it (`inheritsProcessEnv: true`).
fn base_env() -> Vec<(String, String)> {
    vec![
        ("PATH".to_string(), "C:\\Oracle\\bin".to_string()),
        ("TEMP".to_string(), "C:\\Oracle\\tmp".to_string()),
    ]
}

/// A spawn golden's string array.
fn strings(value: &Value) -> Vec<String> {
    value
        .as_array()
        .expect("an array")
        .iter()
        .map(|v| v.as_str().expect("a string").to_string())
        .collect()
}

/// Checks one recorded PowerShell spawn against the golden's: everything but the `.lnk` path (which the
/// replay puts in a temp folder; `real_lnk` stands in for the golden's `GAMELIB_LNK_PATH`).
fn spawn_mismatch(seen: &RecordedSpawn, golden: &Value, real_lnk: &Path) -> Option<String> {
    let mut want_env: BTreeMap<String, String> = base_env().into_iter().collect();
    for (name, value) in golden["envDiff"]["set"].as_object().expect("envDiff.set") {
        want_env.insert(name.clone(), value.as_str().expect("env value").to_string());
    }
    want_env.insert(
        "GAMELIB_LNK_PATH".to_string(),
        real_lnk.to_string_lossy().into_owned(),
    );
    let got_env: BTreeMap<String, String> = seen.env.iter().cloned().collect();
    let timeout = golden["options"]["timeoutMs"]
        .as_u64()
        .map(Duration::from_millis);
    let mut problems = Vec::new();
    if seen.label != "shortcuts-lnk" {
        problems.push(format!("label {}", seen.label));
    }
    if seen.program != golden["program"].as_str().unwrap_or_default() {
        problems.push(format!("program {}", seen.program));
    }
    if seen.argv != strings(&golden["argv"]) {
        problems.push(format!("argv {:?}", seen.argv));
    }
    if seen.stdin.as_deref() != golden["stdin"].as_str() {
        problems.push("stdin differs from the recorded script".to_string());
    }
    if got_env != want_env || seen.env.len() != got_env.len() {
        problems.push(format!("env {got_env:?} want {want_env:?}"));
    }
    if !golden["envDiff"]["unset"]
        .as_array()
        .is_some_and(Vec::is_empty)
    {
        problems.push("the golden unsets a variable".to_string());
    }
    if seen.timeout != timeout {
        problems.push(format!("timeout {:?} want {timeout:?}", seen.timeout));
    }
    if seen.hide_window != golden["options"]["windowsHide"].as_bool().unwrap_or(false) {
        problems.push(format!("hide_window {}", seen.hide_window));
    }
    if seen.replace_env != golden["options"]["replaceEnv"].as_bool().unwrap_or(false) {
        problems.push(format!("replace_env {}", seen.replace_env));
    }
    if golden["options"]["inheritsProcessEnv"].as_bool() != Some(true) {
        problems.push("the golden does not inherit the process env".to_string());
    }
    if seen.cwd.is_some() || !golden["cwd"].is_null() {
        problems.push("a cwd".to_string());
    }
    if problems.is_empty() {
        None
    } else {
        Some(problems.join("; "))
    }
}

fn details_of(value: &Value) -> ShortcutDetails {
    ShortcutDetails {
        target: value["target"].as_str().expect("a target").to_string(),
        args: value["args"].as_str().map(str::to_string),
        icon: value["icon"].as_str().map(str::to_string),
        icon_index: value["iconIndex"].as_i64().map(|i| i as i32),
    }
}

// ------------------------------------------------------------------------------------ the tests

#[tokio::test]
async fn the_writer_replays_every_env_golden() {
    let slice = load("windows");
    slice.assert_floor("windows");
    let cases = slice.family("env");
    assert!(cases.len() >= 10, "only {} env goldens", cases.len());
    let mut failures = Vec::new();
    for (id, case) in &cases {
        let home = FakeHome::new("gamelib-lnk-env-");
        let lnk = home.root().join("Desktop").join("Game.lnk");
        let input = &case["input"];
        let system_root = input["systemRoot"].as_str().map(PathBuf::from);
        let details = details_of(&input["details"]);
        let runner = LnkRunner::new(
            SpecOutput {
                code: Some(0),
                ..SpecOutput::default()
            },
            input["lnkPresentAfterExit0"].as_bool() == Some(true),
        );
        let got =
            write_windows_shortcut(&runner, &base_env(), system_root.as_deref(), &lnk, &details)
                .await;
        let want: Result<(), String> = if case["outcome"]["ok"].as_bool() == Some(true) {
            Ok(())
        } else {
            Err(case["outcome"]["error"]
                .as_str()
                .expect("an error")
                .to_string())
        };
        if got != want {
            failures.push(format!("{id}: outcome {got:?} want {want:?}"));
        }
        let spawns = runner.spawns();
        let golden_spawns = case["spawns"].as_array().expect("spawns");
        if spawns.len() != 1 || golden_spawns.len() != 1 {
            failures.push(format!("{id}: {} spawns", spawns.len()));
            continue;
        }
        if let Some(problem) = spawn_mismatch(&spawns[0], &golden_spawns[0], &lnk) {
            failures.push(format!("{id}: {problem}"));
        }
    }
    println!("env goldens replayed: {}", cases.len());
    assert!(
        failures.is_empty(),
        "env mismatches:\n{}",
        failures.join("\n")
    );
}

/// The part of `addShortcuts` that is this plan's: every PowerShell spawn of a `lnk-` golden. The `.lnk`
/// path, the icon and the system root are the add flow's (94-18) and are taken from the golden; the target
/// URL is built here from the case's `appName` and `runner`, so the encoder, the quoting and the script are
/// held to what the TS spawned.
#[tokio::test]
async fn every_powershell_spawn_of_an_add_golden_replays() {
    let slice = load("windows");
    let cases = slice.family("lnk");
    assert!(cases.len() >= 30, "only {} lnk goldens", cases.len());
    let mut spawn_count = 0usize;
    let mut failures = Vec::new();
    for (id, case) in &cases {
        let input = &case["input"];
        let (Some(app_name), Some(runner_name)) =
            (input["appName"].as_str(), input["runner"].as_str())
        else {
            failures.push(format!("{id}: no appName or runner"));
            continue;
        };
        let message = case["outcome"]["message"].as_str().unwrap_or_default();
        for golden in case["spawns"]
            .as_array()
            .expect("spawns")
            .iter()
            .filter(|s| s["program"].as_str() == Some("powershell.exe"))
        {
            spawn_count += 1;
            let set = &golden["envDiff"]["set"];
            let golden_lnk = set["GAMELIB_LNK_PATH"].as_str().expect("a lnk path");
            let target = set["GAMELIB_LNK_TARGET"].as_str().expect("a target");
            let root = target
                .strip_suffix("\\explorer.exe")
                .expect("an explorer.exe target");
            let details = ShortcutDetails {
                target: launch_url(app_name, runner_name, true),
                args: None,
                icon: set["GAMELIB_LNK_ICON"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .map(str::to_string),
                icon_index: set["GAMELIB_LNK_ICON_INDEX"]
                    .as_str()
                    .and_then(|s| s.parse().ok()),
            };
            let home = FakeHome::new("gamelib-lnk-add-");
            let lnk = home.root().join("out").join("a.lnk");
            let answer = scripted_output(&input["powershell"]);
            let runner = LnkRunner::new(
                answer,
                input["lnkPresentAfterExit0"].as_bool() == Some(true),
            );
            let got =
                write_windows_shortcut(&runner, &base_env(), Some(Path::new(root)), &lnk, &details)
                    .await;
            let spawns = runner.spawns();
            if spawns.len() != 1 {
                failures.push(format!("{id}: {} spawns", spawns.len()));
                continue;
            }
            if let Some(problem) = spawn_mismatch(&spawns[0], golden, &lnk) {
                failures.push(format!("{id}: {problem}"));
            }
            // The outcome: a failure is reported as `<lnk path>: <error>` in the add outcome's message; a
            // success never appears there.
            match got {
                Ok(()) => {
                    if message.contains(&format!("{golden_lnk}: powershell")) {
                        failures.push(format!("{id}: ok, but the message blames {golden_lnk}"));
                    }
                }
                Err(error) => {
                    if !message.contains(&format!("{golden_lnk}: {error}")) {
                        failures.push(format!(
                            "{id}: error {error:?} is not in the recorded message {message:?}"
                        ));
                    }
                }
            }
        }
    }
    println!(
        "add goldens: {} cases, {spawn_count} PowerShell spawns replayed",
        cases.len()
    );
    assert!(
        spawn_count >= 60,
        "only {spawn_count} PowerShell spawns replayed"
    );
    assert!(
        failures.is_empty(),
        "lnk mismatches:\n{}",
        failures.join("\n")
    );
}

/// `reg-` is the Desktop folder query 94-11 ported; `golden_paths` pins its spawn. It is replayed here too
/// so this file accounts for every case in the windows manifest.
#[tokio::test]
async fn the_registry_goldens_resolve_to_the_recorded_folder() {
    let slice = load("windows");
    let cases = slice.family("reg");
    assert!(cases.len() >= 20, "only {} reg goldens", cases.len());
    let mut failures = Vec::new();
    for (id, case) in &cases {
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
    }
    assert!(
        failures.is_empty(),
        "reg mismatches:\n{}",
        failures.join("\n")
    );
}

/// Every golden in the slice belongs to a family a test replays: none is skipped by omission.
#[test]
fn every_windows_golden_belongs_to_a_replayed_family() {
    let slice = load("windows");
    slice.assert_floor("windows");
    let mut counts: BTreeMap<&str, usize> = BTreeMap::new();
    for (id, case) in &slice.cases {
        let family = case["family"].as_str().unwrap_or_default();
        assert!(
            ["lnk", "env", "reg", "icon"].contains(&family),
            "{id}: family {family:?} has no replay"
        );
        assert!(
            id.starts_with(&format!("{family}-")),
            "{id}: id and family disagree"
        );
        *counts.entry(family).or_default() += 1;
    }
    assert_eq!(counts.values().sum::<usize>(), slice.manifest_count);
    println!("windows families: {counts:?}");
}

/// The constants the goldens pin, read off the goldens themselves.
#[test]
fn the_constants_are_the_recorded_spawn() {
    let slice = load("windows");
    let case = &slice.cases["env-url-target"];
    let spawn = &case["spawns"][0];
    assert_eq!(
        POWERSHELL_ARGS.map(str::to_string).to_vec(),
        strings(&spawn["argv"])
    );
    assert_eq!(spawn["stdin"].as_str(), Some(WRITE_SHORTCUT_SCRIPT));
}

// ------------------------------------------------------------------------- the real PowerShell

/// One real run: PowerShell compiles the helper and writes a `.lnk` into a fresh temp profile, and the
/// file holds the UTF-16LE bytes of the launch URL (the creation proof 94-18 relies on). Nothing touches
/// the operator's Desktop or Start Menu: the link goes into the profile, PowerShell gets only the
/// environment built here (`replace_env`), and `-NoProfile` keeps its own profile out of it.
#[cfg(windows)]
#[tokio::test(flavor = "multi_thread")]
async fn a_real_powershell_run_writes_a_lnk_holding_the_launch_url() {
    use gamelib_proc::spec::SpecProcRunner;

    let home = FakeHome::new("gamelib-lnk-real-");
    let tmp = home.root().join("tmp");
    fs::create_dir_all(&tmp).expect("temp folder");
    let desktop = home.root().join("Desktop");
    fs::create_dir_all(&desktop).expect("desktop folder");
    // The non-ASCII leaf proves the UTF-16 path survives the environment and the COM boundary.
    let lnk = desktop.join("\u{5E7B}\u{60F3} \u{1F3AE}.lnk");

    // PowerShell needs the system variables to start and to compile the helper; the profile-relative
    // ones point into the fake profile.
    let mut env: Vec<(String, String)> = Vec::new();
    for name in [
        "SystemRoot",
        "windir",
        "PATH",
        "PATHEXT",
        "ComSpec",
        "PROCESSOR_ARCHITECTURE",
    ] {
        if let Ok(value) = std::env::var(name) {
            env.push((name.to_string(), value));
        }
    }
    for (name, path) in home.env() {
        env.push((name.to_string(), path.to_string_lossy().into_owned()));
    }
    env.push(("TEMP".to_string(), tmp.to_string_lossy().into_owned()));
    env.push(("TMP".to_string(), tmp.to_string_lossy().into_owned()));
    let system_root = std::env::var("SystemRoot").ok().map(PathBuf::from);

    let url = launch_url("2951630", "steam", true);
    let details = ShortcutDetails {
        target: url.clone(),
        ..ShortcutDetails::default()
    };
    let result = write_windows_shortcut(
        &SpecProcRunner,
        &env,
        system_root.as_deref(),
        &lnk,
        &details,
    )
    .await;
    assert_eq!(result, Ok(()), "the real PowerShell run");
    let bytes = fs::read(&lnk).expect("the .lnk was written");
    let needle: Vec<u8> = "gamelib://launch?appName="
        .encode_utf16()
        .flat_map(u16::to_le_bytes)
        .collect();
    assert!(
        bytes.windows(needle.len()).any(|w| w == needle.as_slice()),
        "the .lnk holds no UTF-16LE launch URL ({} bytes)",
        bytes.len()
    );
    let full: Vec<u8> = url.encode_utf16().flat_map(u16::to_le_bytes).collect();
    assert!(
        bytes.windows(full.len()).any(|w| w == full.as_slice()),
        "the .lnk's arguments are not the whole URL"
    );
}
