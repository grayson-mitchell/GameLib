//! The bottle state primitives against the TS goldens (87-11 recorded them, 87-38 ports the state
//! half, 87-39 the create, kill and removal half; D-07, D-08, D-19): `golden/bottles` holds one case
//! per behaviour of the engine marker (record, reconcile, the three read-only views) and, in the
//! second task of the slice, the `cxbottle.conf` writer, the provisioned check, the running-games
//! ledger, the engine registry and the prefix resolver.
//!
//! Every case replays over a fake HOME laid out as the oracle's profile (`<APPFOLDER>`, `<TOOLS>`,
//! `<HOME>`): the case's pinned-engine variant is copied from `state/engines`, each named fixture
//! bottle from `state/bottles` (the `<TOOLS>` and `<HOME>` placeholders expanded), and the case's
//! seed written. The answer, the marker bytes of every bottle, the log lines and the before and
//! after trees (path, kind, mode, sha256 over the placeholder-normalised content) are compared to the
//! golden. A count floor lives here beside the replay, so editing the JSON alone cannot lower the
//! bar, and an empty case list fails. POSIX only, as the TS oracle's replays are.
//!
//! The cases of the ops listed in [`LATER_OPS`] replay in the next task and in 87-39; a case whose op
//! is in neither list fails the suite.
#![cfg(unix)]

use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::bottles::marker::{
    self, read_marker_summary, reconcile_with, record_crossover_with, record_pinned_with,
    restore_needs_absent_pin, Gate,
};
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::engines::{read_bottle_engine_marker_kind, DxvkBuild, NonCrossoverEngine};
use gamelib_engine::offline::MarkerKind;
use gamelib_engine::testing::RecordingLog;
use gamelib_store::host::StoreHost;
use gamelib_store::version_gate::GateState;
use gamelib_testutil::FakeHome;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

/// `golden/bottles` holds 146 cases; a later edit may raise this, never lower it.
const CASE_FLOOR: usize = 140;

/// The ops this build replays (the marker half of the state slice).
const STATE_OPS: [&str; 4] = ["views", "reconcile", "record-pinned", "record-crossover"];

/// The ops a later task or plan ports: the conf, provisioned, ledger, registry and prefix cases
/// (the next task of this slice) and CrossOver and fallback bottle creation, the per-game flight, the
/// wineserver kill and guarded removal (87-39). Listed so a new op in the case list cannot go
/// unnoticed.
const LATER_OPS: [&str; 10] = [
    "provisioned",
    "conf-write",
    "ledger",
    "registry",
    "resolve-prefix",
    "create-crossover",
    "create-fallback",
    "ensure",
    "kill",
    "remove-created",
];

/// The two replayed ops of the pinned engine the fixture markers name.
const SYNTHETIC_PIN_LABEL: &str = "Wine-Staging 11.20 + DXVK-macOS 1.10.3 (built-in)";
const CURRENT_PIN_ID: &str = "wine-staging-11.20";
const CURRENT_PIN_WINE_VERSION: &str = "11.20";
const CURRENT_PIN_DXVK_VERSION: &str = "v1.10.3-20230507-repack";
const CX_BIN_DIR: &str = "/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin";
const BOTTLES_REL: &str = "Library/Application Support/CrossOver/Bottles";

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn golden_dir() -> PathBuf {
    fixtures().join("golden/bottles")
}

fn read_json(path: &Path) -> Value {
    serde_json::from_slice(&std::fs::read(path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

fn cases() -> Vec<Value> {
    read_json(&golden_dir().join("cases.json"))
        .as_array()
        .unwrap()
        .clone()
}

/// A list is usable only at or above its floor: an empty or shrunken list is an error, so a replay
/// cannot pass by iterating nothing.
fn check_floor(what: &str, count: usize, floor: usize) -> Result<(), String> {
    if count < floor {
        return Err(format!(
            "{what}: scanned {count}, below the floor of {floor}"
        ));
    }
    Ok(())
}

/// The count equals the cases, it is at or above the floor, and `expected/` holds one folder per case.
fn check_manifest(
    cases: &[Value],
    manifest: &Value,
    floor: usize,
    folders: &[String],
) -> Result<(), String> {
    check_floor("bottle cases", cases.len(), floor)?;
    let count = manifest["count"].as_u64().unwrap_or(0) as usize;
    if count != cases.len() {
        return Err(format!("MANIFEST count {count} != {} cases", cases.len()));
    }
    if manifest["floor"].as_u64().unwrap_or(0) < 20 {
        return Err("MANIFEST floor is below 20".to_string());
    }
    let mut ids: Vec<String> = cases
        .iter()
        .map(|c| c["id"].as_str().unwrap_or_default().to_string())
        .collect();
    ids.sort();
    let mut have = folders.to_vec();
    have.sort();
    if ids != have {
        return Err(format!("expected/ folders {have:?} != case ids {ids:?}"));
    }
    Ok(())
}

fn expected_folders() -> Vec<String> {
    std::fs::read_dir(golden_dir().join("expected"))
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect()
}

#[test]
fn the_manifest_holds_the_floor_and_one_expected_folder_per_case() {
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    check_manifest(&cases(), &manifest, CASE_FLOOR, &expected_folders()).unwrap();
}

#[test]
fn an_empty_case_list_fails_the_manifest_guard() {
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    assert!(check_manifest(&[], &manifest, CASE_FLOOR, &[]).is_err());
}

#[test]
fn a_shrunken_case_list_fails_the_floor() {
    assert!(check_floor("bottle cases", CASE_FLOOR - 1, CASE_FLOOR).is_err());
    assert!(check_floor("bottle cases", CASE_FLOOR, CASE_FLOOR).is_ok());
}

#[test]
fn every_case_op_is_replayed_here_or_scheduled_later() {
    for case in cases() {
        let op = case["op"].as_str().unwrap();
        assert!(
            STATE_OPS.contains(&op) || LATER_OPS.contains(&op),
            "case {} has op {op}, which neither list names",
            case["id"]
        );
    }
}

// ---------------------------------------------------------------------------------------------
// The fake profile (the oracle's layout rooted in a fake HOME)
// ---------------------------------------------------------------------------------------------

struct Profile {
    home: FakeHome,
    app_folder: PathBuf,
    user_data: PathBuf,
    tools: PathBuf,
}

impl Profile {
    fn new() -> Profile {
        let home = FakeHome::new("engine-bottles-");
        let root = home.root().to_path_buf();
        let app_folder = root.join(".config").join("GameLib");
        Profile {
            user_data: root
                .join("Library")
                .join("Application Support")
                .join("GameLib"),
            tools: app_folder.join("tools"),
            app_folder,
            home,
        }
    }

    fn root(&self) -> &Path {
        self.home.root()
    }

    fn bottles_root(&self) -> PathBuf {
        self.root().join(BOTTLES_REL)
    }

    /// A placeholder path (`<TOOLS>/wine/x`) as a real one.
    fn expand(&self, text: &str) -> String {
        let mut out = text.to_string();
        for (token, root) in [
            ("<TOOLS>", &self.tools),
            ("<APPFOLDER>", &self.app_folder),
            ("<USERDATA>", &self.user_data),
            ("<HOME>", &self.root().to_path_buf()),
        ] {
            out = out.replace(token, &root.to_string_lossy());
        }
        out
    }

    /// The placeholder table; a root with a different real path (macOS `/var` is `/private/var`) is
    /// listed under both names. Longest roots first, so `<TOOLS>` wins over `<HOME>`.
    fn placeholders(&self) -> Vec<(&'static str, String)> {
        let as_text = |p: &Path| p.to_string_lossy().into_owned();
        let mut table = vec![
            ("<TOOLS>", as_text(&self.tools)),
            ("<APPFOLDER>", as_text(&self.app_folder)),
            ("<USERDATA>", as_text(&self.user_data)),
            ("<HOME>", as_text(self.root())),
        ];
        if let Ok(real) = std::fs::canonicalize(self.root()) {
            if real != self.root() {
                let app = real.join(".config").join("GameLib");
                table.push(("<TOOLS>", as_text(&app.join("tools"))));
                table.push(("<APPFOLDER>", as_text(&app)));
                table.push((
                    "<USERDATA>",
                    as_text(
                        &real
                            .join("Library")
                            .join("Application Support")
                            .join("GameLib"),
                    ),
                ));
                table.push(("<HOME>", as_text(&real)));
            }
        }
        table.sort_by_key(|(_, root)| std::cmp::Reverse(root.len()));
        table
    }

    /// Every profile root in `text` replaced by its placeholder (`normalisePaths`).
    fn normalise_text(&self, text: &str) -> String {
        let mut out = text.to_string();
        for (token, root) in self.placeholders() {
            out = out.replace(root.as_str(), token);
        }
        out
    }

    /// [`Profile::normalise_text`] over every string of `value` (object keys are left alone).
    fn normalise(&self, value: Value) -> Value {
        match value {
            Value::String(s) => Value::String(self.normalise_text(&s)),
            Value::Array(items) => {
                Value::Array(items.into_iter().map(|v| self.normalise(v)).collect())
            }
            Value::Object(map) => Value::Object(
                map.into_iter()
                    .map(|(k, v)| (k, self.normalise(v)))
                    .collect(),
            ),
            other => other,
        }
    }

    /// `expandDeep`: every placeholder in every string of `value` as a real path.
    fn expand_value(&self, value: &Value) -> Value {
        match value {
            Value::String(s) => Value::String(self.expand(s)),
            Value::Array(items) => {
                Value::Array(items.iter().map(|v| self.expand_value(v)).collect())
            }
            Value::Object(map) => Value::Object(
                map.iter()
                    .map(|(k, v)| (k.clone(), self.expand_value(v)))
                    .collect(),
            ),
            other => other.clone(),
        }
    }

    /// Writes a case's starting state: a directory, a symlink, or a file.
    fn seed(&self, entries: &Value) {
        for entry in entries.as_array().into_iter().flatten() {
            let target = PathBuf::from(self.expand(entry["path"].as_str().unwrap()));
            assert!(
                target.starts_with(self.root()),
                "seed {target:?} is outside the profile"
            );
            if entry["dir"].as_bool() == Some(true) {
                std::fs::create_dir_all(&target).unwrap();
            } else if let Some(link) = entry["symlink"].as_str() {
                std::fs::create_dir_all(target.parent().unwrap()).unwrap();
                std::os::unix::fs::symlink(self.expand(link), &target).unwrap();
            } else if let Some(text) = entry["text"].as_str() {
                std::fs::create_dir_all(target.parent().unwrap()).unwrap();
                std::fs::write(&target, self.expand(text)).unwrap();
            } else {
                panic!("unsupported seed entry: {entry}");
            }
        }
    }

    /// The pinned-engine directory variant a case builds under `<TOOLS>`: a copy of the committed
    /// `state/engines/<variant>` tree, modes kept. `none` and an absent variant are no directory.
    fn build_engines(&self, variant: &str) {
        copy_tree(
            &fixtures().join("state/engines").join(variant),
            &self.tools,
            None,
        );
    }

    /// A fixture bottle: the committed `state/bottles/<name>` tree under the Bottles root, with the
    /// `<TOOLS>` and `<HOME>` placeholders of its text expanded and its modes kept.
    fn build_bottle(&self, name: &str) {
        copy_tree(
            &fixtures().join("state/bottles").join(name),
            &self.bottles_root().join(name),
            Some(self),
        );
    }

    fn ctx(&self, log: Arc<RecordingLog>) -> EngineCtx {
        let paths = EnginePaths {
            app_folder: self.app_folder.clone(),
            user_data: self.user_data.clone(),
            tools_path: self.tools.clone(),
            user_home: self.root().to_path_buf(),
            temp: self.root().join("tmp"),
        };
        EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Mac,
            paths,
            Shutdown::new(),
        )
        .with_log(log)
    }

    /// `snapshotNormalised`: every entry under the profile, sorted by path, with each file's sha256
    /// taken over its content with the profile roots as placeholders and a symlink's target likewise.
    fn snapshot(&self) -> Value {
        let mut entries = Vec::new();
        self.walk(Path::new(""), &mut entries);
        entries.sort_by(|a, b| a["path"].as_str().cmp(&b["path"].as_str()));
        Value::Array(entries)
    }

    fn walk(&self, rel: &Path, out: &mut Vec<Value>) {
        let dir = self.root().join(rel);
        for entry in std::fs::read_dir(&dir).unwrap().flatten() {
            let rel_path = rel.join(entry.file_name());
            let full = self.root().join(&rel_path);
            let meta = std::fs::symlink_metadata(&full).unwrap();
            let path = rel_path.to_string_lossy().into_owned();
            let mode = format!("{:04o}", meta.permissions().mode() & 0o7755);
            if meta.file_type().is_symlink() {
                let target = std::fs::read_link(&full).unwrap();
                out.push(json!({
                    "path": path, "kind": "symlink", "mode": mode,
                    "symlink": self.normalise_text(&target.to_string_lossy()),
                }));
            } else if meta.is_dir() {
                out.push(json!({"path": path, "kind": "dir", "mode": mode}));
                self.walk(&rel_path, out);
            } else {
                let text = String::from_utf8_lossy(&std::fs::read(&full).unwrap()).into_owned();
                out.push(json!({
                    "path": path, "kind": "file", "mode": mode,
                    "sha256": sha256_hex(self.normalise_text(&text).as_bytes()),
                }));
            }
        }
    }

    /// The engine marker bytes of every bottle under the Bottles root, by bottle name.
    fn marker_bytes(&self) -> Value {
        let mut out = serde_json::Map::new();
        let mut names: Vec<String> = std::fs::read_dir(self.bottles_root())
            .into_iter()
            .flatten()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        for name in names {
            let file = self.bottles_root().join(&name).join(".gamelib-engine.json");
            if let Ok(bytes) = std::fs::read(&file) {
                out.insert(
                    name,
                    Value::String(self.normalise_text(&String::from_utf8_lossy(&bytes))),
                );
            }
        }
        Value::Object(out)
    }

    fn marker_sha(&self, bottle: &str) -> Value {
        let file = self
            .bottles_root()
            .join(bottle)
            .join(".gamelib-engine.json");
        match std::fs::read(&file) {
            Ok(bytes) => Value::String(sha256_hex(
                self.normalise_text(&String::from_utf8_lossy(&bytes))
                    .as_bytes(),
            )),
            Err(_) => Value::Null,
        }
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Copies `source` into `target`, keeping each file's mode. With a `profile`, text files get their
/// `<TOOLS>` and `<HOME>` placeholders expanded (a marker holds an absolute wineserver path).
fn copy_tree(source: &Path, target: &Path, profile: Option<&Profile>) {
    std::fs::create_dir_all(target).unwrap();
    for entry in std::fs::read_dir(source).unwrap() {
        let entry = entry.unwrap();
        let to = target.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_tree(&entry.path(), &to, profile);
            continue;
        }
        let mode = std::fs::metadata(entry.path())
            .unwrap()
            .permissions()
            .mode();
        match (profile, std::fs::read_to_string(entry.path())) {
            (Some(profile), Ok(text)) => std::fs::write(&to, profile.expand(&text)).unwrap(),
            _ => {
                std::fs::copy(entry.path(), &to).unwrap();
            }
        }
        std::fs::set_permissions(&to, std::fs::Permissions::from_mode(mode & 0o7777)).unwrap();
    }
}

/// `materialise`: `{repeat: {char, count}}` is a long string stored as a generator.
fn materialise(value: &Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(items.iter().map(materialise).collect()),
        Value::Object(map) => {
            if map.len() == 1 {
                if let Some(spec) = map.get("repeat") {
                    let ch = spec["char"].as_str().unwrap();
                    let count = spec["count"].as_u64().unwrap() as usize;
                    return Value::String(ch.repeat(count));
                }
            }
            Value::Object(
                map.iter()
                    .map(|(k, v)| (k.clone(), materialise(v)))
                    .collect(),
            )
        }
        other => other.clone(),
    }
}

// ---------------------------------------------------------------------------------------------
// The replay
// ---------------------------------------------------------------------------------------------

/// The gate a case runs under: the in-process one, or the TS fake of the Rust channel when the case
/// scripts it (`reject`: Rust cannot be asked; `answer`: the state it always gives).
type BoxedGate = Box<dyn Fn(&Path) -> Option<GateState>>;

fn gate_of(case: &Value) -> BoxedGate {
    let gate = &case["gate"];
    if gate["reject"].as_bool() == Some(true) {
        return Box::new(|_| None);
    }
    match gate["answer"].as_str() {
        Some("newer") => Box::new(|_| Some(GateState::Newer)),
        Some("ok") => Box::new(|_| Some(GateState::Ok)),
        Some("absent") => Box::new(|_| Some(GateState::Absent)),
        Some("unreadable") => Box::new(|_| Some(GateState::Unreadable)),
        _ => Box::new(marker::process_gate),
    }
}

/// The non-CrossOver engine a `record-pinned` case hands over (`engine('with-dxvk' | 'no-dxvk')`).
fn engine_of(profile: &Profile, variant: Option<&str>) -> NonCrossoverEngine {
    let engines = "<TOOLS>/steam-engines";
    NonCrossoverEngine {
        wine_bin: profile.expand(&format!(
            "{engines}/{CURRENT_PIN_ID}/Contents/Resources/wine/bin/wine"
        )),
        wineserver_bin: profile.expand(&format!(
            "{engines}/{CURRENT_PIN_ID}/Contents/Resources/wine/bin/wineserver"
        )),
        label: SYNTHETIC_PIN_LABEL.to_string(),
        version: CURRENT_PIN_WINE_VERSION.to_string(),
        dxvk: (variant != Some("no-dxvk")).then(|| DxvkBuild {
            dir: profile.expand(&format!("{engines}/dxvk-macOS-{CURRENT_PIN_DXVK_VERSION}")),
            version: CURRENT_PIN_DXVK_VERSION.to_string(),
        }),
    }
}

fn names_of(args: &Value) -> Vec<String> {
    args["names"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|n| n.as_str().unwrap_or_default().to_string())
        .collect()
}

fn times_of(args: &Value) -> usize {
    args["times"].as_u64().unwrap_or(1) as usize
}

fn kind_text(kind: Option<MarkerKind>) -> Value {
    match kind {
        Some(MarkerKind::Crossover) => json!("crossover"),
        Some(MarkerKind::NonCrossover) => json!("non-crossover"),
        None => Value::Null,
    }
}

struct Replayed {
    before: Value,
    outcome: Value,
    markers: Value,
    logs: Vec<String>,
    after: Value,
}

fn run_case(case: &Value) -> Replayed {
    let profile = Profile::new();
    if let Some(variant) = case["engines"].as_str() {
        if variant != "none" {
            profile.build_engines(variant);
        }
    }
    for name in case["bottles"].as_array().into_iter().flatten() {
        profile.build_bottle(name.as_str().unwrap());
    }
    profile.seed(&case["seed"]);
    let log = Arc::new(RecordingLog::new());
    let ctx = profile.ctx(log.clone());
    let before = profile.snapshot();
    let args = profile.expand_value(&materialise(&case["args"]));
    let gate = gate_of(case);
    let gate: Gate<'_> = &*gate;
    let op = case["op"].as_str().unwrap();
    let bottle = args["bottle"].as_str().unwrap_or_default();

    let outcome = match op {
        "views" => Value::Array(
            names_of(&args)
                .into_iter()
                .map(|name| {
                    json!({
                        "name": name,
                        "kind": kind_text(read_bottle_engine_marker_kind(&ctx, &name)),
                        "summary": read_marker_summary(&ctx, &name)
                            .map_or(Value::Null, |s| s.to_value()),
                        "restoreNeedsAbsentPin": restore_needs_absent_pin(&ctx, &name),
                    })
                })
                .collect(),
        ),
        "reconcile" => Value::Array(
            (0..times_of(&args))
                .map(|_| {
                    reconcile_with(&ctx, gate, bottle).map_or(Value::Null, |r| json!(r.as_str()))
                })
                .collect(),
        ),
        "record-pinned" => Value::Array(
            (0..times_of(&args))
                .map(|_| {
                    let engine = engine_of(&profile, args["engine"].as_str());
                    let pin_id = args["pinId"].as_str().unwrap_or(CURRENT_PIN_ID);
                    json!({
                        "returned": record_pinned_with(&ctx, gate, bottle, pin_id, &engine),
                        "markerSha256": profile.marker_sha(bottle),
                    })
                })
                .collect(),
        ),
        "record-crossover" => Value::Array(
            (0..times_of(&args))
                .map(|_| {
                    let bin_dir = args["binDir"].as_str().unwrap_or(CX_BIN_DIR);
                    json!({
                        "returned": record_crossover_with(&ctx, gate, bottle, bin_dir),
                        "markerSha256": profile.marker_sha(bottle),
                    })
                })
                .collect(),
        ),
        other => panic!("op {other} is not ported by this build"),
    };

    let logs = log
        .lines()
        .into_iter()
        .map(|(level, line)| {
            let level = if level == "warn" { "WARNING" } else { "INFO" };
            format!("{level}: {}", profile.normalise_text(&line))
        })
        .collect();
    Replayed {
        before,
        outcome: profile.normalise(outcome),
        markers: profile.marker_bytes(),
        logs,
        after: profile.snapshot(),
    }
}

/// The golden's log lines as `<LEVEL>: <message>`, with the two documented deltas applied
/// (`deltas.json`): the TS asked Rust over a channel and logged when it could not (an in-process
/// gate cannot fail), and the conf writer names its bottle's directory name, not its path.
fn expected_logs(golden: &Value) -> Vec<String> {
    let bottles_prefix = "<HOME>/Library/Application Support/CrossOver/Bottles/";
    golden["logs"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|l| {
            !l["message"]
                .as_str()
                .unwrap()
                .starts_with("bottle version gate: Rust could not be asked")
        })
        .map(|l| {
            format!(
                "{}: {}",
                l["level"].as_str().unwrap(),
                l["message"].as_str().unwrap().replace(bottles_prefix, "")
            )
        })
        .collect()
}

fn replay(ops: &[&str], floor: usize) {
    let selected: Vec<Value> = cases()
        .into_iter()
        .filter(|c| ops.contains(&c["op"].as_str().unwrap()))
        .collect();
    check_floor("replayed bottle cases", selected.len(), floor).unwrap();
    let mut failures = Vec::new();
    for case in &selected {
        let id = case["id"].as_str().unwrap();
        let dir = golden_dir().join("expected").join(id);
        let golden = read_json(&dir.join("result.json"));
        let actual = run_case(case);
        let mut problems = Vec::new();
        let mut check = |what: &str, ok: bool, expected: String, got: String| {
            if !ok {
                problems.push(format!(
                    "{what}:\n    expected {expected}\n    actual   {got}"
                ));
            }
        };
        let text = |v: &Value| serde_json::to_string(v).unwrap();
        check(
            "outcome",
            actual.outcome == golden["outcome"],
            text(&golden["outcome"]),
            text(&actual.outcome),
        );
        check(
            "marker bytes",
            actual.markers == golden["markers"],
            text(&golden["markers"]),
            text(&actual.markers),
        );
        let want_logs = expected_logs(&golden);
        check(
            "logs",
            actual.logs == want_logs,
            format!("{want_logs:?}"),
            format!("{:?}", actual.logs),
        );
        check(
            "tree before",
            actual.before == golden["before"],
            "the golden's before tree".into(),
            first_difference(&golden["before"], &actual.before),
        );
        let want_after = read_json(&dir.join("tree.json"));
        check(
            "tree after",
            actual.after == want_after,
            "the golden's after tree".into(),
            first_difference(&want_after, &actual.after),
        );
        if !problems.is_empty() {
            failures.push(format!("{id}:\n  {}", problems.join("\n  ")));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

/// Where two trees first differ, as text.
fn first_difference(want: &Value, got: &Value) -> String {
    let (want, got) = (want.as_array().unwrap(), got.as_array().unwrap());
    for i in 0..want.len().max(got.len()) {
        if want.get(i) != got.get(i) {
            return format!(
                "entry {i}: golden {:?}, replay {:?}",
                want.get(i),
                got.get(i)
            );
        }
    }
    "no difference".to_string()
}

const TRACER_OPS: [&str; 1] = ["record-pinned"];

#[test]
fn the_tracer_goldens_replay() {
    replay(&TRACER_OPS, 18);
}

#[test]
fn every_marker_golden_replays() {
    replay(&STATE_OPS, 79);
}

#[test]
fn the_documented_deltas_are_exactly_those_this_replay_treats_differently() {
    let deltas = read_json(&golden_dir().join("deltas.json"));
    let mut keys: Vec<&str> = deltas
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    keys.sort_unstable();
    assert_eq!(
        keys,
        [
            "gate-is-in-process-and-cannot-fail",
            "unreadable-marker-is-rewritten-as-the-ts-did",
        ]
    );
    for (key, why) in deltas.as_object().unwrap() {
        assert!(why.as_str().unwrap().len() > 150, "{key}");
    }
}

#[test]
fn the_replayed_ops_each_have_a_case() {
    let all = cases();
    for op in STATE_OPS {
        assert!(
            all.iter().any(|c| c["op"] == op),
            "no golden case for op {op}"
        );
    }
}
