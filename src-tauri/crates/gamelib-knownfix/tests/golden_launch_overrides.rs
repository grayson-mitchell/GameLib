//! The known-fix launch overrides against the TS goldens (88-05 recorded them, 88-09 replays them; D-15,
//! D-22). `golden/launch_overrides` holds 19 cases, each a list of steps run on a fresh fake HOME over the
//! oracle's install tree (`<HOME>/games/install/bin/game.exe` and the outside files) plus the case's own
//! entries (files, directories, symlinks):
//!
//! - `resolve`: `resolve_exe_override` over an install path and an `exeOverride`;
//! - `overrides`: `read_launch_overrides` over layer files the step seeds.
//!
//! `expected/<case>/result.json` is compared whole and `events.json` line by line (step, level, text).
//! Two documented differences (`deltas.json`): a "could not be verified" warning carries the OS error's
//! own text instead of Node's, and the info line names the relative override from the fix file instead
//! of the resolved absolute path. A count floor lives in this file, so editing the JSON alone cannot
//! lower the bar, and an empty case list fails. The symlink cases are unix only; a leg that skips them
//! names them and the floor counts only the cases that ran.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::testing::RecordingLog;
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_knownfix::launch::{read_launch_overrides, resolve_exe_override};
use gamelib_knownfix::types::Runner;
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use serde_json::{json, Value};

/// `golden/launch_overrides` holds 19 cases, 15 of which run on every OS and 4 on unix only (the ones
/// that need a symlink). A later edit may raise these, never lower them.
const LAUNCH_OVERRIDES_FLOOR: usize = if cfg!(unix) { 19 } else { 15 };

/// The cases that seed a symlink, by id: skipped, and named as skipped, where symlinks are not made.
const SYMLINK_CASES: [&str; 4] = [
    "knownFixLaunch--resolveknownfixexeoverride-rejects-a-symlinked-file-escaping-the-install",
    "knownFixLaunch--resolveknownfixexeoverride-rejects-a-path-through-a-symlinked-dir-escaping-the-install",
    "knownFixLaunch--resolveknownfixexeoverride-accepts-a-symlinked-install-root",
    "symlink-inside-the-install-is-accepted",
];

/// The tree every case starts from (the TS test's own `beforeEach` layout).
const BASE_TREE: [(&str, &str); 3] = [
    ("<HOME>/games/install/bin/game.exe", "x"),
    ("<HOME>/games/outside/real.exe", "x"),
    ("<HOME>/games/outside.exe", "x"),
];

fn golden_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/golden/launch_overrides")
}

fn read_json(path: &Path) -> Value {
    let text = std::fs::read_to_string(path).unwrap_or_else(|e| panic!("{path:?}: {e}"));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

fn check_floor(what: &str, count: usize, floor: usize) -> Result<(), String> {
    if count < floor {
        return Err(format!(
            "{what}: scanned {count}, below the floor of {floor}"
        ));
    }
    Ok(())
}

struct Rig {
    home: FakeHome,
    log: Arc<RecordingLog>,
    ctx: KnownFixCtx,
}

impl Rig {
    fn new() -> Rig {
        let home = FakeHome::new("knownfix-launch-golden-");
        let root = home.root().to_path_buf();
        let app_folder = root.join(".config").join("GameLib");
        let log = Arc::new(RecordingLog::new());
        let engine = EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Mac,
            EnginePaths {
                tools_path: app_folder.join("tools"),
                user_data: root
                    .join("Library")
                    .join("Application Support")
                    .join("GameLib"),
                app_folder,
                user_home: root.clone(),
                temp: root.join("tmp"),
            },
            Shutdown::new(),
        )
        .with_log(log.clone());
        let ctx = KnownFixCtx::new(
            Arc::new(engine),
            Some(root.join("public").join("fixes")),
            "https://relay.test",
            "0.0.0",
        );
        Rig { home, log, ctx }
    }

    fn root(&self) -> &Path {
        self.home.root()
    }

    /// A placeholder path as a real one.
    fn expand(&self, text: &str) -> String {
        text.replace(
            "<APPFOLDER>",
            &self
                .root()
                .join(".config")
                .join("GameLib")
                .to_string_lossy(),
        )
        .replace("<HOME>", &self.root().to_string_lossy())
    }

    /// Every profile root in `text` replaced by its placeholder (macOS `/var` is `/private/var`, so the
    /// real name is listed too), Windows separators folded to `/`.
    fn normalise_text(&self, text: &str) -> String {
        let as_text = |p: &Path| p.to_string_lossy().into_owned();
        let app = self.root().join(".config").join("GameLib");
        let mut table = vec![
            ("<APPFOLDER>", as_text(&app)),
            ("<HOME>", as_text(self.root())),
        ];
        if !cfg!(windows) {
            if let Ok(real) = std::fs::canonicalize(self.root()) {
                if real != self.root() {
                    table.insert(
                        0,
                        (
                            "<APPFOLDER>",
                            as_text(&real.join(".config").join("GameLib")),
                        ),
                    );
                    table.push(("<HOME>", as_text(&real)));
                }
            }
        }
        let mut s = text.to_string();
        for (token, root) in table {
            s = s.replace(root.as_str(), token);
        }
        if cfg!(windows) && (s.contains("<APPFOLDER>") || s.contains("<HOME>")) {
            s = s.replace('\\', "/");
        }
        s
    }

    /// Writes one seed entry: a file, a directory or a symlink, each inside the fake HOME.
    fn seed_entry(&self, entry: &Value) {
        let target = PathBuf::from(self.expand(entry["path"].as_str().unwrap()));
        assert!(
            target.starts_with(self.root()),
            "seed {target:?} is outside the profile"
        );
        if entry["dir"].as_bool() == Some(true) {
            std::fs::create_dir_all(&target).unwrap();
            return;
        }
        std::fs::create_dir_all(target.parent().unwrap()).unwrap();
        if let Some(link) = entry["symlink"].as_str() {
            #[cfg(unix)]
            std::os::unix::fs::symlink(self.expand(link), &target).unwrap();
            #[cfg(not(unix))]
            panic!("a symlink case reached a leg that cannot make one: {link}");
        } else {
            std::fs::write(&target, entry["text"].as_str().unwrap()).unwrap();
        }
    }

    fn seed(&self, entries: &Value) {
        for entry in entries.as_array().into_iter().flatten() {
            self.seed_entry(entry);
        }
    }

    fn remove(&self, paths: &Value) {
        for path in paths.as_array().into_iter().flatten() {
            let target = PathBuf::from(self.expand(path.as_str().unwrap()));
            assert!(target.starts_with(self.root()));
            let _ = std::fs::remove_dir_all(&target).or_else(|_| std::fs::remove_file(&target));
        }
    }
}

fn runner_of(name: &str) -> Runner {
    Runner::parse(name).unwrap_or_else(|| panic!("unknown runner {name}"))
}

/// The OS's own text for a path that is not there: what the warning carries where Node printed
/// `Error: ENOENT: no such file or directory, stat '<path>'`.
fn not_found_text(rig: &Rig) -> String {
    std::fs::metadata(rig.root().join("games").join("definitely-missing"))
        .unwrap_err()
        .to_string()
}

/// The two documented differences (`deltas.json`), applied to a golden line so the comparison is against
/// what the Rust side is specified to say:
///
/// - `os-error-text`: `could not be verified (Error: ENOENT: ...)` becomes the platform's not-found text
///   (every error in the goldens is ENOENT; the replay refuses any other);
/// - `info-line-names-the-relative-override`: `exeOverride <resolved absolute path>` becomes the
///   override as the fix file spells it, which is the resolved path relative to the install folder.
fn expected_line(rig: &Rig, golden: &str) -> String {
    const VERIFIED: &str = "could not be verified (";
    if let Some(at) = golden.find(VERIFIED) {
        let head = &golden[..at + VERIFIED.len()];
        let tail = &golden[at + VERIFIED.len()..];
        assert!(
            tail.starts_with("Error: ENOENT:"),
            "only ENOENT is recorded: {golden:?}"
        );
        let end = tail
            .rfind("), using the default executable.")
            .unwrap_or_else(|| panic!("no closing text in {golden:?}"));
        return format!("{head}{}{}", not_found_text(rig), &tail[end..]);
    }
    const INSTALL: &str = "<HOME>/games/install/";
    if golden.starts_with("Known fix for ") {
        if let Some(at) = golden.find(", exeOverride <HOME>/") {
            let head = &golden[..at + ", exeOverride ".len()];
            let path = &golden[at + ", exeOverride ".len()..];
            let relative = path
                .strip_prefix(INSTALL)
                .unwrap_or_else(|| panic!("a resolved path outside the install: {golden:?}"));
            return format!("{head}{relative}");
        }
    }
    golden.to_string()
}

/// Runs one case on a fresh fake HOME; returns `(result, events)` normalised like the golden.
fn run_case(case: &Value) -> (Value, Value) {
    let rig = Rig::new();
    for (path, text) in BASE_TREE {
        rig.seed_entry(&json!({"path": path, "text": text}));
    }
    rig.seed(&case["tree"]);
    let mut steps = Vec::new();
    let mut events = Vec::new();
    for (index, step) in case["steps"].as_array().unwrap().iter().enumerate() {
        rig.remove(&step["remove"]);
        rig.seed(&step["seed"]);
        let before = rig.log.lines().len();
        let install = step["installPath"].as_str().map(|p| rig.expand(p));
        let answer = match step["op"].as_str().unwrap() {
            "resolve" => {
                let resolved = resolve_exe_override(
                    &rig.ctx,
                    install.as_deref().unwrap_or(""),
                    step["exeOverride"].as_str().unwrap(),
                    "L",
                );
                json!({
                    "op": "resolve",
                    "installPath": step["installPath"],
                    "exeOverride": step["exeOverride"],
                    "resolved": resolved.map(|p| p.to_string_lossy().into_owned()),
                })
            }
            "overrides" => {
                let overrides = read_launch_overrides(
                    &rig.ctx,
                    step["appName"].as_str().unwrap(),
                    runner_of(step["runner"].as_str().unwrap()),
                    install.as_deref(),
                );
                json!({
                    "op": "overrides",
                    "appName": step["appName"],
                    "runner": step["runner"],
                    "installPath": step["installPath"],
                    "overrides": overrides,
                })
            }
            other => panic!("unknown step op {other}"),
        };
        steps.push(answer);
        for (level, line) in rig.log.lines().into_iter().skip(before) {
            events.push(json!({
                "step": index,
                "level": if level == "warn" { "warning" } else { level },
                "text": rig.normalise_text(&line),
            }));
        }
    }
    let result = normalise_value(&rig, json!({ "steps": steps }));
    (result, Value::Array(events))
}

fn normalise_value(rig: &Rig, value: Value) -> Value {
    match value {
        Value::String(s) => Value::String(rig.normalise_text(&s)),
        Value::Array(items) => {
            Value::Array(items.into_iter().map(|v| normalise_value(rig, v)).collect())
        }
        Value::Object(map) => Value::Object(
            map.into_iter()
                .map(|(k, v)| (k, normalise_value(rig, v)))
                .collect(),
        ),
        other => other,
    }
}

fn load_cases() -> Vec<Value> {
    match read_json(&golden_dir().join("cases.json")) {
        Value::Array(cases) => cases,
        other => panic!("cases.json is not an array: {other}"),
    }
}

fn has_symlink(case: &Value) -> bool {
    case["tree"]
        .as_array()
        .into_iter()
        .flatten()
        .any(|entry| entry.get("symlink").is_some())
}

#[test]
fn every_launch_override_golden_replays() {
    let cases = load_cases();
    let mut compared = 0usize;
    let mut skipped: Vec<String> = Vec::new();
    let mut failures = Vec::new();
    for case in &cases {
        let id = case["id"].as_str().unwrap();
        if !cfg!(unix) && has_symlink(case) {
            skipped.push(id.to_string());
            continue;
        }
        let dir = golden_dir().join("expected").join(id);
        let (result, events) = run_case(case);
        let want_result = read_json(&dir.join("result.json"));
        let want_events = {
            let rig = Rig::new();
            let golden = read_json(&dir.join("events.json"));
            let mut lines = golden.as_array().unwrap().clone();
            for line in &mut lines {
                let text = line["text"].as_str().unwrap().to_string();
                line["text"] = Value::String(expected_line(&rig, &text));
            }
            Value::Array(lines)
        };
        if result != want_result {
            failures.push(format!(
                "{id}: result\n  want {want_result}\n  got  {result}"
            ));
        }
        if events != want_events {
            failures.push(format!(
                "{id}: events\n  want {want_events}\n  got  {events}"
            ));
        }
        compared += 1;
    }
    assert!(
        failures.is_empty(),
        "{} differences over {compared} cases:\n{}",
        failures.len(),
        failures.join("\n")
    );
    // A leg that cannot make symlinks names the cases it did not run, and only those.
    if cfg!(unix) {
        assert!(skipped.is_empty());
    } else {
        assert_eq!(skipped, SYMLINK_CASES, "the skipped cases, by name");
    }
    check_floor(
        "golden/launch_overrides cases compared",
        compared,
        LAUNCH_OVERRIDES_FLOOR,
    )
    .unwrap();
    println!("compared {compared} launch override cases, skipped {skipped:?}");
}

#[test]
fn the_floor_matches_the_manifest_and_an_empty_list_fails() {
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    let cases = load_cases();
    assert_eq!(manifest["count"].as_u64(), Some(cases.len() as u64));
    assert!(LAUNCH_OVERRIDES_FLOOR <= cases.len());
    assert!(
        cases.len() >= 19,
        "{} cases, below the plan's 19",
        cases.len()
    );
    let ids: std::collections::BTreeSet<&str> =
        cases.iter().map(|c| c["id"].as_str().unwrap()).collect();
    assert_eq!(ids.len(), cases.len(), "case ids repeat");
    // The symlink cases named here are exactly the ones whose tree holds a symlink.
    let mut with_links: Vec<&str> = cases
        .iter()
        .filter(|c| has_symlink(c))
        .map(|c| c["id"].as_str().unwrap())
        .collect();
    let mut named = SYMLINK_CASES.to_vec();
    with_links.sort_unstable();
    named.sort_unstable();
    assert_eq!(with_links, named);
    let folders = std::fs::read_dir(golden_dir().join("expected"))
        .unwrap()
        .count();
    assert_eq!(folders, cases.len(), "one expected folder per case");
    let err = check_floor("golden/launch_overrides cases", 0, LAUNCH_OVERRIDES_FLOOR).unwrap_err();
    assert!(err.contains("below the floor"), "{err}");
}

#[test]
fn only_enoent_is_recorded_and_no_warning_carries_a_profile_path() {
    // The replay maps ENOENT to the platform's text; any other error name in a golden would need its own
    // mapping, so the recorded set is pinned. And a line the Rust side logs names no path of the profile.
    for case in load_cases() {
        let id = case["id"].as_str().unwrap();
        let events = read_json(&golden_dir().join("expected").join(id).join("events.json"));
        for line in events.as_array().unwrap() {
            let text = line["text"].as_str().unwrap();
            if text.contains("could not be verified (") {
                assert!(text.contains("Error: ENOENT:"), "{id}: {text}");
            }
        }
        let (_, events) = run_case(&case);
        for line in events.as_array().unwrap() {
            let text = line["text"].as_str().unwrap();
            // After normalisation a leaked profile path would show as a placeholder.
            assert!(
                !text.contains("<HOME>") && !text.contains("<APPFOLDER>"),
                "{id}: {text}"
            );
        }
    }
}
