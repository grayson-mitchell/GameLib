//! Replays the 94-07 Add to Steam goldens (`golden/steam`, 86 cases) through `gamelib_shortcuts::steam`
//! (94-20, D-09 item 4, D-17, D-23): the CRC ids, `addNonSteamGame`, `isAddedToSteam` and
//! `removeNonSteamGame`, each on a fresh `FakeHome` holding a fake Steam `userdata` tree. A golden is the
//! TS's answer, never a value typed here.
//!
//! What is compared, per case: what the call returned, the wiki lookups, every `shortcuts.vdf` read and
//! apply the crate asked for (the channel and its exact JSON arguments), every URL requested, the
//! notification and the dialog (title and text), and the whole Steam and icon folder trees after the call
//! (every path, its size, and its text when it is small plain text).
//!
//! The doubles stand where the TS oracle's did: `GoldenFiles` answers a read from the case's real
//! `shortcuts.vdf` bytes (a reader of the binary format that gives the crate's summary) and an apply from the
//! case's scripted outcome without editing the file (the real edit is `gamelib-steamfiles`' own business and
//! is exercised by the shell's tests); `Replay` answers a download with `downloaded:<url>` when the golden
//! tree holds the file that download wrote, and with an error when it does not (which is how a golden
//! recorded on Windows records a file name Windows cannot create); the wiki answers the case's scripted
//! value.
//!
//! Three recorded differences are asserted exactly rather than skipped (`ESCAPED_TITLE`, `NOT_A_DATE`,
//! `DATA_URL`):
//!
//! - `add-title-unicode-quotes`: the TS oracle replaced `i18next.t` with a renderer that does not
//!   HTML-escape `{{game}}`; the real i18next does, and `Catalog::t` does, so the notification text carries
//!   `&#39;` and `&quot;` for the title's quotes. The dialog (`escapeValue: false`) is unescaped, as recorded.
//! - `add-lastplayed-not-a-date`: the TS sent `LastPlayTime: null` (a `NaN` date) and the real write would
//!   have failed; the port sends now.
//! - `add-art-data-url-square`: the TS oracle's `createFromDataURL` was a double that wrote `jpeg:90`; the
//!   port really decodes the data URL, and the recorded one is a truncated PNG header, so nothing is written
//!   for it.
//!
//! The steam removal deltas (quick 261125-uzz) are recorded in `deltas.json`, an object keyed by case id like
//! `golden/remove/deltas.json`. The TS removed the first entry titled like the game, whoever wrote it; the
//! port removes an entry only when its `LaunchOptions` carry GameLib's launch URL for the game's app name. The
//! nine goldens whose upstream `shortcuts.vdf` entry carries no such URL therefore replay twice: refused as
//! seeded (no apply call, the grid art stays, the corrupt notice instead of the TS's), and again with every
//! entry titled like the game reporting the `LaunchOptions` the port itself writes, where the TS's recorded
//! success and apply-failure answers stay pinned for GameLib's own entry (each recorded apply gaining only the
//! `launchOptions` the removal now names). No golden file is edited.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use gamelib_core::clock::Clock;
use gamelib_core::process::BoxFuture;
use gamelib_core::shutdown::Shutdown;
use gamelib_shortcuts::ctx::{
    ApplyResult, EntrySummary, Platform, PortableExe, ShortcutPaths, ShortcutsCtx,
    ShortcutsMutation, ShortcutsSummary, SteamShortcutsFile, WikiLookup,
};
use gamelib_shortcuts::game::{ShortcutGame, ShortcutSettings};
use gamelib_shortcuts::http::{HttpError, Replay, Response};
use gamelib_shortcuts::steam::ids::{generate_app_id, generate_short_app_id, generate_shortcut_id};
use gamelib_shortcuts::steam::{steam_add, steam_id_of, steam_is_added, steam_remove};
use gamelib_shortcuts::testing::RecordingUi;
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use serde_json::{json, Value};

/// 2024-02-03T04:05:06Z, the wall clock every golden ran under.
const FROZEN_NOW_MS: u64 = 1_706_933_106_000;
const FROZEN_NOW_SECONDS: i64 = 1_706_933_106;

const APPIMAGE: &str = "/opt/GameLibOracle/GameLib.AppImage";
const PORTABLE_FILE: &str = "C:\\Oracle\\Portable\\GameLib-portable.exe";
const PORTABLE_DIR: &str = "C:\\Oracle\\Portable";
const FLATPAK_ID: &str = "com.heroicgameslauncher.hgl";

struct FrozenClock;

impl Clock for FrozenClock {
    fn now_ms(&self) -> u64 {
        FROZEN_NOW_MS
    }
}

fn shell_exe(platform: &str) -> &'static str {
    match platform {
        "darwin" => "/Applications/GameLibOracle.app/Contents/MacOS/GameLib",
        "win32" => "C:\\Program Files\\GameLibOracle\\GameLib.exe",
        _ => "/opt/GameLibOracle/GameLib",
    }
}

fn golden_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("golden")
        .join("steam")
}

/// The binary `shortcuts.vdf` files the TS cases seeded: a verbatim copy of the upstream test data that
/// `gamelib-steamfiles` keeps in its own fixtures.
fn vdf_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("gamelib-steamfiles")
        .join("tests")
        .join("fixtures")
        .join("shortcuts")
        .join("upstream")
}

/// A path as a golden writes it: `/` separators, whatever the host.
fn portable(text: &str) -> String {
    text.replace('\\', "/")
}

fn cases() -> BTreeMap<String, Value> {
    let manifest: Value = serde_json::from_str(
        &fs::read_to_string(golden_dir().join("MANIFEST.json")).expect("a manifest"),
    )
    .expect("MANIFEST.json is JSON");
    let count = manifest["count"].as_u64().expect("manifest count") as usize;
    let floor = manifest["floor"].as_u64().expect("manifest floor") as usize;
    let mut cases = BTreeMap::new();
    for entry in fs::read_dir(golden_dir()).expect("the steam goldens exist") {
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
            serde_json::from_str(&text).unwrap_or_else(|e| panic!("steam/{name}: not JSON: {e}"));
        cases.insert(name.trim_end_matches(".json").to_string(), value);
    }
    assert_eq!(
        cases.len(),
        count,
        "steam: the directory holds {} goldens, the manifest says {count}",
        cases.len()
    );
    assert!(cases.len() >= floor, "steam: under the floor {floor}");
    cases
}

/// The recorded steam removal deltas (`deltas.json`): case id to the reason it differs.
fn deltas() -> BTreeMap<String, String> {
    let text = fs::read_to_string(golden_dir().join("deltas.json")).expect("deltas.json");
    serde_json::from_str(&text).expect("deltas.json is an object of strings")
}

fn family<'a>(cases: &'a BTreeMap<String, Value>, prefix: &str) -> Vec<(&'a String, &'a Value)> {
    cases
        .iter()
        .filter(|(id, _)| id.starts_with(prefix))
        .collect()
}

// -------------------------------------------------------- the binary vdf

#[derive(Debug)]
enum Node {
    Str(String),
    Int,
    Map(Vec<(String, Node)>),
}

/// The binary tree: maps, strings and int32s; anything else is a typed parse error, spelled as
/// `gamelib-steamfiles` spells it (the golden's messages carry it).
fn parse_bin(bytes: &[u8]) -> Result<Vec<(String, Node)>, String> {
    fn cstr(bytes: &[u8], pos: &mut usize) -> Result<String, String> {
        let end = bytes[*pos..]
            .iter()
            .position(|b| *b == 0)
            .ok_or_else(|| format!("BinError {{ kind: Truncated, offset: {} }}", *pos))?;
        let text = String::from_utf8_lossy(&bytes[*pos..*pos + end]).into_owned();
        *pos += end + 1;
        Ok(text)
    }
    fn map(bytes: &[u8], pos: &mut usize) -> Result<Vec<(String, Node)>, String> {
        let mut out = Vec::new();
        loop {
            let at = *pos;
            let Some(kind) = bytes.get(*pos).copied() else {
                return Err(format!("BinError {{ kind: Truncated, offset: {at} }}"));
            };
            *pos += 1;
            if kind == 0x08 {
                return Ok(out);
            }
            let key = cstr(bytes, pos)?;
            match kind {
                0x00 => out.push((key, Node::Map(map(bytes, pos)?))),
                0x01 => out.push((key, Node::Str(cstr(bytes, pos)?))),
                0x02 => {
                    let Some(chunk) = bytes.get(*pos..*pos + 4) else {
                        return Err(format!("BinError {{ kind: Truncated, offset: {} }}", *pos));
                    };
                    // The value is not part of any summary; only that it is four bytes long.
                    let _ = chunk;
                    out.push((key, Node::Int));
                    *pos += 4;
                }
                other => {
                    return Err(format!(
                        "BinError {{ kind: UnknownType({other}), offset: {at} }}"
                    ))
                }
            }
        }
    }
    let mut pos = 0;
    map(bytes, &mut pos)
}

fn find_ci<'a>(map: &'a [(String, Node)], key: &str) -> Option<&'a Node> {
    map.iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(key))
        .map(|(_, v)| v)
}

fn str_of(node: Option<&Node>) -> Option<String> {
    match node {
        Some(Node::Str(text)) => Some(text.clone()),
        _ => None,
    }
}

/// What `gamelib-steamfiles` `read_shortcuts` reports for `path`.
fn read_shortcuts(path: &Path) -> ShortcutsSummary {
    let Ok(bytes) = fs::read(path) else {
        return ShortcutsSummary::default();
    };
    let doc = match parse_bin(&bytes) {
        Ok(doc) => doc,
        Err(error) => {
            return ShortcutsSummary {
                exists: true,
                read_error: Some(format!("parse: {error}")),
                ..ShortcutsSummary::default()
            }
        }
    };
    let mut out = ShortcutsSummary {
        exists: true,
        parsed: true,
        ..ShortcutsSummary::default()
    };
    let Some(Node::Map(root)) = find_ci(&doc, "shortcuts") else {
        return out;
    };
    out.has_shortcuts_root = true;
    out.root_is_list = root.iter().all(|(k, v)| {
        !k.is_empty() && k.bytes().all(|b| b.is_ascii_digit()) && matches!(v, Node::Map(_))
    });
    for (index_key, value) in root {
        let Node::Map(entry) = value else {
            continue;
        };
        out.entries.push(EntrySummary {
            index_key: index_key.clone(),
            app_name: str_of(find_ci(entry, "appname")),
            exe: str_of(find_ci(entry, "exe")),
            launch_options: str_of(find_ci(entry, "launchoptions")),
            has_app_name: find_ci(entry, "appname").is_some(),
            has_exe: find_ci(entry, "exe").is_some(),
            has_launch_options: find_ci(entry, "launchoptions").is_some(),
        });
    }
    out
}

// ------------------------------------------------------------- the doubles

/// The `shortcuts.vdf` seam as the TS oracle's `requestRustInvoke` was: it records every call and answers.
struct GoldenFiles {
    script: String,
    calls: Mutex<Vec<Value>>,
    /// The title and the `LaunchOptions` every entry with that title reports, when a case replays with its
    /// entry proven (the file on disk is never changed).
    proven: Mutex<Option<(String, String)>>,
}

impl GoldenFiles {
    fn record(&self, call: Value) {
        self.calls.lock().expect("calls").push(call);
    }

    /// The summary of `path`, with the proven `LaunchOptions` applied to every entry titled like the game.
    fn summary(&self, path: &Path) -> ShortcutsSummary {
        let mut summary = read_shortcuts(path);
        if let Some((title, options)) = self.proven.lock().expect("proven").as_ref() {
            for entry in &mut summary.entries {
                if entry.app_name.as_deref() == Some(title.as_str()) {
                    entry.launch_options = Some(options.clone());
                }
            }
        }
        summary
    }
}

impl SteamShortcutsFile for GoldenFiles {
    fn read(&self, path: &Path) -> Result<ShortcutsSummary, String> {
        self.record(json!({
            "channel": "steamfiles_shortcuts_read",
            "args": { "path": path.to_string_lossy() }
        }));
        Ok(self.summary(path))
    }

    fn apply(&self, path: &Path, mutation: &ShortcutsMutation) -> Result<ApplyResult, String> {
        self.record(json!({
            "channel": "steamfiles_shortcuts_apply",
            "args": {
                "path": path.to_string_lossy(),
                "mutation": serde_json::to_value(mutation).expect("a mutation serialises")
            }
        }));
        let mut result = ApplyResult {
            written: true,
            matched: true,
            index_key: Some("0".to_string()),
            ..ApplyResult::default()
        };
        match self.script.as_str() {
            "throws" => return Err("Error: scripted rustInvoke failure".to_string()),
            "already-present" => {
                result.written = false;
                result.already_present = true;
            }
            "not-written-read-error" => {
                result = ApplyResult {
                    read_error: Some("parse: scripted".to_string()),
                    ..ApplyResult::default()
                };
            }
            "not-written-silent" => result = ApplyResult::default(),
            _ => {
                if let ShortcutsMutation::Remove {
                    app_name,
                    launch_options,
                } = mutation
                {
                    // As `gamelib-steamfiles` matches: the AppName and the LaunchOptions, both exactly.
                    let found = self.summary(path).entries.into_iter().find(|entry| {
                        entry.app_name.as_deref() == Some(app_name.as_str())
                            && entry.launch_options.as_deref() == Some(launch_options.as_str())
                    });
                    result.matched = found.is_some();
                    result.index_key = found.as_ref().map(|entry| entry.index_key.clone());
                    result.removed_exe = found.as_ref().and_then(|entry| entry.exe.clone());
                    result.removed_app_name = found.and_then(|entry| entry.app_name);
                }
            }
        }
        Ok(result)
    }
}

/// The wiki lookup: the case's scripted answer, with every call recorded.
struct GoldenWiki {
    answer: Option<Value>,
    calls: Mutex<Vec<Value>>,
}

impl WikiLookup for GoldenWiki {
    fn steam_id(&self, title: &str, app_name: &str, runner: &str) -> BoxFuture<Option<String>> {
        self.calls.lock().expect("calls").push(json!({
            "title": title, "appName": app_name, "runner": runner
        }));
        let id = self.answer.as_ref().and_then(steam_id_of);
        Box::pin(async move { id })
    }
}

// ------------------------------------------------------------- the tree

/// One file of a tree: its portable relative path, its size, and its text when small plain text (the
/// TS oracle's `steamTree`).
type TreeFile = (String, u64, Option<String>);

fn tree_of(root: &Path) -> Vec<TreeFile> {
    fn walk(dir: &Path, root: &Path, out: &mut Vec<TreeFile>) {
        let Ok(read) = fs::read_dir(dir) else {
            return;
        };
        for entry in read.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk(&path, root, out);
                continue;
            }
            let bytes = fs::read(&path).expect("a file");
            let text = String::from_utf8(bytes.clone()).ok().filter(|text| {
                bytes.len() <= 160 && !text.chars().any(|c| ('\u{0}'..='\u{8}').contains(&c))
            });
            let relative = path.strip_prefix(root).expect("under the root");
            out.push((
                portable(&relative.to_string_lossy()),
                bytes.len() as u64,
                text,
            ));
        }
    }
    let mut out = Vec::new();
    walk(root, root, &mut out);
    out.sort();
    out
}

fn golden_tree(value: &Value) -> Vec<TreeFile> {
    let mut out: Vec<TreeFile> = value
        .as_array()
        .expect("a tree")
        .iter()
        .map(|file| {
            (
                file["path"].as_str().expect("path").to_string(),
                file["size"].as_u64().expect("size"),
                file.get("utf8").and_then(Value::as_str).map(str::to_string),
            )
        })
        .collect();
    out.sort();
    out
}

// ------------------------------------------------------------ the profile

struct Profile {
    home: FakeHome,
}

impl Profile {
    fn root(&self) -> &Path {
        self.home.root()
    }

    fn steam(&self) -> PathBuf {
        self.root().join("Steam")
    }

    fn icons(&self) -> PathBuf {
        self.root().join(".config").join("GameLib").join("icons")
    }

    fn user_data(&self) -> PathBuf {
        self.root().join("userdata-dir")
    }

    fn cwd(&self) -> PathBuf {
        self.root().join("cwd")
    }

    /// The golden's placeholders, replaced by this profile's own paths.
    fn fill(&self, text: &str) -> String {
        text.replace("<ICONS>", &self.icons().to_string_lossy())
            .replace("<CWD>", &self.cwd().to_string_lossy())
            .replace("<HOME>", &self.root().to_string_lossy())
    }
}

/// A golden value with its placeholders filled and every string in `/` form, to compare with what the crate
/// did after the same treatment.
fn normalise(profile: &Profile, value: &Value) -> Value {
    match value {
        Value::String(text) => Value::String(portable(&profile.fill(text))),
        Value::Array(items) => Value::Array(items.iter().map(|v| normalise(profile, v)).collect()),
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(k, v)| (k.clone(), normalise(profile, v)))
                .collect(),
        ),
        other => other.clone(),
    }
}

fn platform_of(name: &str) -> Platform {
    match name {
        "darwin" => Platform::Mac,
        "win32" => Platform::Windows,
        _ => Platform::Linux,
    }
}

/// The `Exe` the new entry gets, as the TS oracle computed it to seed art that already exists.
fn exe_for_ids(golden: &Value) -> String {
    let env = &golden["environment"];
    let platform = golden["platform"].as_str().expect("platform");
    let flag = |key: &str| env[key].as_bool().unwrap_or(false);
    if flag("flatpak") {
        "\"flatpak\"".to_string()
    } else if platform != "win32" && flag("appImage") {
        format!("\"{APPIMAGE}\"")
    } else if platform == "win32" && flag("portable") {
        format!("\"{PORTABLE_FILE}\"")
    } else {
        format!("\"{}\"", shell_exe(platform))
    }
}

/// Writes the case's `shortcuts.vdf` from its source.
fn seed_vdf(path: &Path, source: &Value) {
    let valid = fs::read(vdf_dir().join("shortcuts_valid.vdf")).expect("the valid vdf");
    let bytes = if let Some(file) = source.get("file").and_then(Value::as_str) {
        fs::read(vdf_dir().join(file)).expect("a vdf fixture")
    } else if source.get("garbage").is_some() {
        b"this is not a shortcuts file".to_vec()
    } else if source.get("truncatedValid").is_some() {
        valid[..60].to_vec()
    } else {
        return;
    };
    fs::write(path, bytes).expect("a vdf");
}

fn seed_profile(profile: &Profile, golden: &Value) {
    let input = &golden["input"];
    let op = input["op"].as_str().expect("op");
    let title = input["title"].as_str().expect("title");
    let userdata = profile.steam().join("userdata");
    fs::create_dir_all(profile.cwd()).expect("a cwd");
    // The icon folder's parent is the app folder, which exists; the folder itself is made on first use.
    fs::create_dir_all(profile.icons().parent().expect("the app folder")).expect("the app folder");
    let users = input["users"].as_object().expect("users");
    if input["userdataExists"].as_bool().unwrap_or(true) {
        fs::create_dir_all(&userdata).expect("userdata");
        if input["strayFile"].as_bool().unwrap_or(false) {
            fs::write(userdata.join("stray.txt"), "x").expect("a stray file");
        }
        for (user, spec) in users {
            let config_dir = userdata.join(user).join("config");
            let has_config = spec.get("config").and_then(Value::as_bool) != Some(false);
            fs::create_dir_all(if has_config {
                config_dir.clone()
            } else {
                userdata.join(user)
            })
            .expect("a user folder");
            if has_config {
                if let Some(vdf) = spec.get("vdf") {
                    seed_vdf(&config_dir.join("shortcuts.vdf"), vdf);
                }
            }
            for name in spec["grid"].as_array().into_iter().flatten() {
                let name = name.as_str().expect("a grid name");
                if name.contains("SHORT") {
                    continue;
                }
                fs::create_dir_all(config_dir.join("grid")).expect("a grid folder");
                fs::write(config_dir.join("grid").join(name), "seed").expect("seed");
            }
        }
        // The art that already exists for the new entry: `SHORT` is the id it will get.
        if op == "add" {
            let short = generate_short_app_id(&exe_for_ids(golden), title);
            for (user, spec) in users {
                for name in spec["grid"].as_array().into_iter().flatten() {
                    let name = name.as_str().expect("a grid name");
                    if !name.contains("SHORT") {
                        continue;
                    }
                    let grid = userdata.join(user).join("config").join("grid");
                    fs::create_dir_all(&grid).expect("a grid folder");
                    fs::write(grid.join(name.replace("SHORT", &short)), "seed").expect("seed");
                }
            }
        }
        // The art a removal should delete: the ids come from the entry the file holds.
        if op == "remove" {
            let suffixes = input["seedRemovedGrid"].as_array().expect("seeds");
            for (user, spec) in users {
                if spec.get("vdf").is_none() {
                    continue;
                }
                let config_dir = userdata.join(user).join("config");
                let summary = read_shortcuts(&config_dir.join("shortcuts.vdf"));
                let Some(entry) = summary
                    .entries
                    .iter()
                    .find(|entry| entry.app_name.as_deref() == Some(title))
                else {
                    continue;
                };
                let (Some(exe), Some(name)) = (&entry.exe, &entry.app_name) else {
                    continue;
                };
                let short = generate_short_app_id(exe, name);
                let big = generate_app_id(exe, name);
                let grid = config_dir.join("grid");
                for suffix in suffixes {
                    let suffix = suffix.as_str().expect("a suffix");
                    fs::create_dir_all(&grid).expect("a grid folder");
                    let file = if suffix == "big" {
                        format!("{big}.jpg")
                    } else {
                        format!("{short}{suffix}")
                    };
                    fs::write(grid.join(file), "seed").expect("seed");
                }
                if !suffixes.is_empty() {
                    fs::write(grid.join("unrelated.jpg"), "seed").expect("seed");
                }
            }
        }
    }
    if input["iconExists"].as_bool().unwrap_or(false) {
        fs::create_dir_all(profile.icons()).expect("the icon folder");
        let app_name = input["appName"].as_str().expect("appName");
        fs::write(profile.icons().join(format!("{app_name}.jpg")), "icon").expect("an icon");
    }
    // `${appName}.lastPlayed` in the `timestamp` store, electron-store's dotted keys as nested objects.
    let last_played = &input["lastPlayed"];
    if last_played["present"].as_bool().unwrap_or(false) {
        let store = profile.user_data().join("store");
        fs::create_dir_all(&store).expect("the store folder");
        let app_name = input["appName"].as_str().expect("appName");
        let document = json!({ app_name: { "lastPlayed": last_played["value"] } });
        fs::write(store.join("timestamp.json"), document.to_string()).expect("the timestamp store");
    }
}

/// The URLs a case's downloads succeed for: those whose every recorded destination is in the golden tree
/// (a file the TS wrote), with the body the oracle wrote.
fn replay_for(golden: &Value) -> Replay {
    let steam_tree = golden_tree(&golden["tree"]["steam"]);
    let icon_tree = golden_tree(&golden["tree"]["icons"]);
    let present = |dest: &str| {
        if let Some(path) = dest.strip_prefix("<ICONS>/") {
            return icon_tree.iter().any(|(p, _, _)| p == path);
        }
        let path = dest.strip_prefix("<HOME>/Steam/").unwrap_or(dest);
        steam_tree.iter().any(|(p, _, _)| p == path)
    };
    let mut ok: BTreeMap<String, bool> = BTreeMap::new();
    for download in golden["downloads"].as_array().expect("downloads") {
        let url = download["url"].as_str().expect("url").to_string();
        let here = present(download["dest"].as_str().expect("dest"));
        let all = ok.entry(url).or_insert(true);
        *all = *all && here;
    }
    let mut replay = Replay::new();
    for (url, success) in ok {
        let answer = if success {
            Ok(Response {
                status: 200,
                body: format!("downloaded:{url}").into_bytes(),
            })
        } else {
            Err(HttpError::Network("scripted failure".to_string()))
        };
        replay = replay.answer(&url, answer);
    }
    replay
}

struct Run {
    profile: Profile,
    ctx: ShortcutsCtx,
    files: Arc<GoldenFiles>,
    wiki: Arc<GoldenWiki>,
    http: Arc<Replay>,
    ui: Arc<RecordingUi>,
    game: ShortcutGame,
    settings: ShortcutSettings,
}

fn build(golden: &Value) -> Run {
    build_with(golden, false)
}

/// `build`, and when `proven` every entry titled like the game reports the `LaunchOptions` the crate's own
/// writer gives that game (never a value typed here).
fn build_with(golden: &Value, proven: bool) -> Run {
    let profile = Profile {
        home: FakeHome::new("gamelib-shortcuts-steam-"),
    };
    seed_profile(&profile, golden);
    let input = &golden["input"];
    let platform_name = golden["platform"].as_str().expect("platform");
    let environment = &golden["environment"];
    let flag = |key: &str| environment[key].as_bool().unwrap_or(false);

    let files = Arc::new(GoldenFiles {
        script: input["apply"].as_str().expect("apply").to_string(),
        calls: Mutex::new(Vec::new()),
        proven: Mutex::new(None),
    });
    let wiki = Arc::new(GoldenWiki {
        answer: input["wiki"].get("value").cloned(),
        calls: Mutex::new(Vec::new()),
    });
    let http = Arc::new(replay_for(golden));
    let ui = Arc::new(RecordingUi::default());
    let paths = ShortcutPaths {
        user_home: profile.root().to_path_buf(),
        app_data: None,
        desktop_dir: None,
        icon_folder: profile.icons(),
        shell_exe: PathBuf::from(shell_exe(platform_name)),
        cwd: profile.cwd(),
    };
    let ctx = ShortcutsCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(FrozenClock),
        platform_of(platform_name),
        Shutdown::new(),
    )
    .with_paths(paths)
    .with_http(http.clone())
    .with_ui(ui.clone())
    .with_steam_files(files.clone())
    .with_wiki(wiki.clone())
    .with_user_data(profile.user_data())
    .with_launch_env(
        flag("flatpak").then(|| FLATPAK_ID.to_string()),
        flag("appImage").then(|| APPIMAGE.to_string()),
        flag("portable").then(|| PortableExe {
            file: PathBuf::from(PORTABLE_FILE),
            dir: PathBuf::from(PORTABLE_DIR),
        }),
    );

    let art = &input["art"];
    let mut game = json!({
        "appName": input["appName"],
        "runner": input["runner"],
        "title": input["title"],
        "isDlc": false,
        "canAddSteamShortcut": input["runner"] != "steam",
        "artSquare": art["square"],
        "artCover": art["cover"],
    });
    if let Some(logo) = art.get("logo") {
        game["artLogo"] = logo.clone();
    }
    let steam_path = format!(
        "{}{}",
        profile.steam().display(),
        if input["quotedSteamPath"].as_bool().unwrap_or(false) {
            "'"
        } else {
            ""
        }
    );
    let settings = json!({
        "addDesktopShortcuts": false,
        "addStartMenuShortcuts": false,
        "addSteamShortcuts": true,
        "defaultSteamPath": steam_path,
    });
    let game: ShortcutGame = serde_json::from_value(game).expect("a game");
    if proven {
        *files.proven.lock().expect("proven") = Some((
            game.title.clone(),
            gamelib_shortcuts::steam::entry::launch_options(&ctx, &game),
        ));
    }
    Run {
        profile,
        ctx,
        files,
        wiki,
        http,
        ui,
        game,
        settings: serde_json::from_value(settings).expect("settings"),
    }
}

/// i18next's HTML escape of an interpolated value.
fn html_escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
        .replace('/', "&#x2F;")
}

/// Cases whose recorded notification differs from the port's by the HTML escape of the title.
const ESCAPED_TITLE: &[&str] = &["add-title-unicode-quotes"];
const NOT_A_DATE: &[&str] = &["add-lastplayed-not-a-date"];
const DATA_URL: &[&str] = &["add-art-data-url-square"];

/// How a case replays: as recorded, or (a removal with a recorded delta) refused as seeded or proven.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Arm {
    Recorded,
    Refused,
    Proven,
}

/// The `i18n` default text a golden recorded for `key`.
fn recorded_text(golden: &Value, key: &str) -> String {
    golden["i18n"]
        .as_array()
        .expect("i18n")
        .iter()
        .find(|call| call["key"] == key)
        .unwrap_or_else(|| panic!("no recorded {key}"))["defaultValue"]
        .as_str()
        .expect("a default text")
        .to_string()
}

/// Replays one add, is-added or remove case and compares everything the golden recorded.
async fn replay_case(id: &str, golden: &Value) {
    replay_arm(id, golden, Arm::Recorded).await;
}

async fn replay_arm(id: &str, golden: &Value, arm: Arm) {
    let run = build_with(golden, arm == Arm::Proven);
    let steam_before = tree_of(&run.profile.steam());
    let op = golden["input"]["op"].as_str().expect("op");
    let returned = match op {
        "add" => Value::Bool(steam_add(&run.ctx, &run.game, &run.settings).await),
        "isAdded" => Value::Bool(steam_is_added(&run.ctx, &run.game, &run.settings)),
        _ => {
            steam_remove(&run.ctx, &run.game, &run.settings);
            Value::Null
        }
    };
    let profile = &run.profile;
    assert_eq!(returned, golden["returned"], "{id}: the return value");

    // The wiki lookups.
    assert_eq!(
        Value::Array(run.wiki.calls.lock().expect("calls").clone()),
        golden["wiki"],
        "{id}: the wiki lookups"
    );

    // Every `shortcuts.vdf` read and apply.
    let mut expected_calls = normalise(profile, &golden["steamfiles"]);
    if NOT_A_DATE.contains(&id) {
        let mut changed = 0;
        for call in expected_calls.as_array_mut().expect("calls") {
            let entry = call
                .get_mut("args")
                .and_then(|args| args.get_mut("mutation"))
                .and_then(|mutation| mutation.get_mut("entry"))
                .and_then(Value::as_array_mut);
            for field in entry.into_iter().flatten() {
                if field["key"] == "LastPlayTime" {
                    assert_eq!(field["value"], Value::Null, "{id}: the recorded null");
                    field["value"] = json!(FROZEN_NOW_SECONDS);
                    changed += 1;
                }
            }
        }
        assert_eq!(changed, 1, "{id}: one LastPlayTime was recorded");
    }
    let is_apply = |call: &Value| call["channel"] == "steamfiles_shortcuts_apply";
    match arm {
        Arm::Recorded => {}
        Arm::Refused => {
            let calls = expected_calls.as_array_mut().expect("calls");
            let before = calls.len();
            calls.retain(|call| !is_apply(call));
            assert!(calls.len() < before, "{id}: a recorded apply to drop");
        }
        Arm::Proven => {
            let options = gamelib_shortcuts::steam::entry::launch_options(&run.ctx, &run.game);
            for call in expected_calls.as_array_mut().expect("calls") {
                if is_apply(call) {
                    call["args"]["mutation"]["launchOptions"] = json!(options);
                }
            }
        }
    }
    let calls = Value::Array(run.files.calls.lock().expect("calls").clone());
    assert_eq!(
        normalise(profile, &calls),
        expected_calls,
        "{id}: the shortcuts.vdf calls"
    );

    // Every URL asked, in order.
    let asked: Vec<String> = run.http.asked();
    let want: Vec<String> = golden["downloads"]
        .as_array()
        .expect("downloads")
        .iter()
        .map(|d| d["url"].as_str().expect("url").to_string())
        .collect();
    assert_eq!(asked, want, "{id}: the URLs requested");

    // The notification and the dialog.
    let title = golden["input"]["title"].as_str().expect("title");
    let notified = run.ui.notices();
    let want_notices: Vec<(String, String)> = if arm == Arm::Refused {
        // The corrupt notice, as `remove-apply-throws` recorded its text, for this title.
        assert_eq!(html_escape(title), title, "{id}: the title is not escaped");
        let throws = template("remove-apply-throws");
        vec![(
            recorded_text(&throws, "notify.finished.remove.steam.title"),
            recorded_text(&throws, "notify.finished.remove.steam.corrupt")
                .replace("{{game}}", title),
        )]
    } else {
        golden["notifications"]
            .as_array()
            .expect("notifications")
            .iter()
            .map(|n| {
                let body = n["body"].as_str().expect("body");
                let body = if ESCAPED_TITLE.contains(&id) {
                    assert_ne!(html_escape(title), title, "{id}: a title that escapes");
                    body.replacen(title, &html_escape(title), 1)
                } else {
                    assert_eq!(html_escape(title), title, "{id}: the title is not escaped");
                    body.to_string()
                };
                (n["title"].as_str().expect("title").to_string(), body)
            })
            .collect()
    };
    assert_eq!(notified, want_notices, "{id}: the notifications");
    let dialogs = run.ui.dialogs();
    let want_dialogs: Vec<(String, String, String)> = golden["dialogs"]
        .as_array()
        .expect("dialogs")
        .iter()
        .map(|d| {
            // ["showDialog", title, message, type, null, null]: the message is what the dialog shows.
            let frame = d.as_array().expect("a frame");
            let text = |i: usize| frame[i].as_str().expect("frame text").to_string();
            (text(1), portable(&profile.fill(&text(2))), text(3))
        })
        .collect();
    let dialogs: Vec<(String, String, String)> = dialogs
        .into_iter()
        .map(|(t, m, k)| (t, portable(&m), k))
        .collect();
    assert_eq!(dialogs, want_dialogs, "{id}: the dialogs");

    // The trees.
    let mut want_steam = golden_tree(&golden["tree"]["steam"]);
    if DATA_URL.contains(&id) {
        let before = want_steam.len();
        want_steam.retain(|(_, _, text)| text.as_deref() != Some("jpeg:90"));
        assert_eq!(want_steam.len(), before - 1, "{id}: the faked jpeg file");
    }
    if arm == Arm::Refused {
        // Nothing was removed: the tree is what it was, the TS's after-tree is part of it, and what the TS
        // removed is only grid art, which the port keeps.
        let after = tree_of(&profile.steam());
        assert_eq!(
            after, steam_before,
            "{id}: a refused removal changes nothing"
        );
        for file in &want_steam {
            assert!(steam_before.contains(file), "{id}: recorded {}", file.0);
        }
        for (path, _, _) in steam_before
            .iter()
            .filter(|file| !want_steam.contains(file))
        {
            let parts: Vec<&str> = path.split('/').collect();
            assert!(
                parts.len() > 4
                    && parts[0] == "userdata"
                    && parts[2] == "config"
                    && parts[3] == "grid",
                "{id}: the TS removed {path}, which is not grid art"
            );
        }
    } else {
        assert_eq!(
            tree_of(&profile.steam()),
            want_steam,
            "{id}: the Steam folder after the call"
        );
    }
    assert_eq!(
        tree_of(&profile.icons()),
        golden_tree(&golden["tree"]["icons"]),
        "{id}: the icon folder after the call"
    );
}

#[test]
fn the_ids_replay_every_recorded_vector() {
    let cases = cases();
    let ids = family(&cases, "ids-");
    assert!(!ids.is_empty(), "no ids goldens");
    for (id, golden) in &ids {
        let exe = golden["input"]["exe"].as_str().expect("exe");
        let name = golden["input"]["appName"].as_str().expect("appName");
        assert_eq!(
            generate_shortcut_id(exe, name),
            golden["shortcutId"].as_i64().expect("shortcutId"),
            "{id}: shortcutId"
        );
        assert_eq!(
            generate_app_id(exe, name),
            golden["appId"].as_str().expect("appId"),
            "{id}: appId"
        );
        assert_eq!(
            generate_short_app_id(exe, name),
            golden["shortAppId"].as_str().expect("shortAppId"),
            "{id}: shortAppId"
        );
    }
    println!("steam ids: {} replayed", ids.len());
}

#[tokio::test]
async fn every_add_to_steam_golden_replays() {
    let cases = cases();
    let adds = family(&cases, "add-");
    let manifest_adds = cases.keys().filter(|id| id.starts_with("add-")).count();
    assert_eq!(adds.len(), manifest_adds);
    assert!(adds.len() >= 50, "the add goldens: {}", adds.len());
    for (id, golden) in &adds {
        replay_case(id, golden).await;
    }
    println!("steam add: {} replayed", adds.len());
}

#[tokio::test]
async fn every_is_added_golden_replays() {
    let cases = cases();
    let checks = family(&cases, "isadded-");
    assert!(!checks.is_empty(), "no isAdded goldens");
    for (id, golden) in &checks {
        replay_case(id, golden).await;
    }
    println!("steam isAdded: {} replayed", checks.len());
}

#[tokio::test]
async fn every_remove_from_steam_golden_replays() {
    let cases = cases();
    let removals = family(&cases, "remove-");
    assert!(!removals.is_empty(), "no remove goldens");
    let deltas = deltas();
    let mut against = 0;
    for (id, golden) in &removals {
        // The delta set, checked without the code under test: the TS applied a removal, and no seeded
        // user's file holds an entry titled like the game that carries a GameLib launch URL.
        let applied = golden["steamfiles"]
            .as_array()
            .expect("calls")
            .iter()
            .any(|call| call["channel"] == "steamfiles_shortcuts_apply");
        let has_delta = deltas.contains_key(id.as_str());
        assert_eq!(
            has_delta,
            applied && !seeds_a_gamelib_entry(golden),
            "{id}: deltas.json and the seeded entries disagree"
        );
        if has_delta {
            replay_arm(id, golden, Arm::Refused).await;
            replay_arm(id, golden, Arm::Proven).await;
            against += 1;
        } else {
            replay_case(id, golden).await;
        }
    }
    assert_eq!(against, deltas.len(), "every recorded delta replayed");
    println!(
        "steam remove: {} replayed, {against} against a recorded delta (refused, then proven)",
        removals.len()
    );
}

/// Whether a user folder other than `0` and `ac` seeds an entry titled like the game whose `LaunchOptions`
/// carry a GameLib launch URL.
fn seeds_a_gamelib_entry(golden: &Value) -> bool {
    let run = build(golden);
    let title = golden["input"]["title"].as_str().expect("title");
    golden["input"]["users"]
        .as_object()
        .expect("users")
        .keys()
        .filter(|user| *user != "0" && *user != "ac")
        .any(|user| {
            let file = run.profile.steam().join("userdata").join(user);
            read_shortcuts(&file.join("config").join("shortcuts.vdf"))
                .entries
                .iter()
                .any(|entry| {
                    entry.app_name.as_deref() == Some(title)
                        && entry
                            .launch_options
                            .as_deref()
                            .is_some_and(|options| options.contains("gamelib://launch"))
                })
        })
}

#[test]
fn the_families_cover_the_whole_manifest() {
    let cases = cases();
    let counted: usize = ["ids-", "add-", "isadded-", "remove-"]
        .iter()
        .map(|prefix| family(&cases, prefix).len())
        .sum();
    assert_eq!(counted, cases.len(), "a golden belongs to no family");
    for id in ESCAPED_TITLE.iter().chain(NOT_A_DATE).chain(DATA_URL) {
        assert!(
            cases.contains_key(*id),
            "the delta names a case that is gone: {id}"
        );
    }
    for id in deltas().keys() {
        assert!(
            id.starts_with("remove-") && cases.contains_key(id),
            "deltas.json names no removal case: {id}"
        );
    }
}

// ------------------------------------------- what the goldens cannot record
fn template(id: &str) -> Value {
    cases().remove(id).expect("a golden case")
}
#[tokio::test]
async fn a_lookup_that_found_nothing_still_writes_the_shortcut_with_the_games_own_art() {
    // WR-42 at the crate seam: the lookup answers None (a failure or no id) and the art is the game's.
    let run = build(&template("add-wiki-rejects"));
    assert!(steam_add(&run.ctx, &run.game, &run.settings).await);
    assert_eq!(run.files.calls.lock().expect("calls").len(), 2);
    assert!(run
        .http
        .asked()
        .iter()
        .all(|url| !url.contains("steamstatic")));
}
#[tokio::test]
async fn a_known_steam_id_takes_all_four_pieces_of_art_from_the_cdn() {
    let run = build(&template("add-steamid-pcgw"));
    assert!(steam_add(&run.ctx, &run.game, &run.settings).await);
    let cdn: Vec<String> = run
        .http
        .asked()
        .into_iter()
        .filter(|url| url.contains("steamstatic"))
        .collect();
    let base = "https://cdn.cloudflare.steamstatic.com/steam/apps/292030";
    assert_eq!(
        cdn,
        [
            format!("{base}/library_600x900_2x.jpg"),
            format!("{base}/header.jpg"),
            format!("{base}/library_hero.jpg"),
            format!("{base}/logo.png"),
        ]
    );
}
#[tokio::test]
async fn a_real_png_data_url_cover_is_written_as_a_jpeg() {
    let mut run = build(&template("add-art-data-url-square"));
    run.game.art_square = Some(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQYlWNgAAIAAAUAAdafFs0AAAAASUVORK5CYII="
            .to_string(),
    );
    assert!(steam_add(&run.ctx, &run.game, &run.settings).await);
    let grid = run.profile.steam().join("userdata/1001/config/grid");
    let cover = fs::read(grid.join("3764062133p.jpg")).expect("the cover was written");
    assert_eq!(&cover[..3], [0xff, 0xd8, 0xff], "a JPEG");
}
/// A file Steam's grid names that is a link out of the grid is unlinked, never followed: the file it
/// pointed at is untouched (T-94-37).
#[tokio::test]
async fn removal_unlinks_a_grid_link_and_never_touches_what_it_points_at() {
    let run = build_with(&template("remove-basic"), true);
    let config = run.profile.steam().join("userdata/1001/config");
    let summary = read_shortcuts(&config.join("shortcuts.vdf"));
    let entry = &summary.entries[0];
    let short = generate_short_app_id(
        entry.exe.as_deref().expect("an exe"),
        entry.app_name.as_deref().expect("a name"),
    );
    let outside = run.profile.root().join("precious.txt");
    fs::write(&outside, "keep me").expect("a file outside the grid");
    let grid = config.join("grid");
    fs::create_dir_all(&grid).expect("a grid folder");
    let link = grid.join(format!("{short}p.jpg"));
    // The recorded template already holds a file under this name (CI: File exists); the test needs the
    // name to be a link out of the grid, so whatever is there goes first.
    let _ = fs::remove_file(&link);
    #[cfg(unix)]
    let made = std::os::unix::fs::symlink(&outside, &link);
    #[cfg(windows)]
    let made = std::os::windows::fs::symlink_file(&outside, &link);
    if !gamelib_testutil::require_link(made, "a grid link", std::env::var_os("CI").is_some()) {
        return;
    }
    steam_remove(&run.ctx, &run.game, &run.settings);
    assert_eq!(
        fs::read_to_string(&outside).expect("still there"),
        "keep me"
    );
    assert!(
        fs::symlink_metadata(&link).is_err(),
        "the link itself is gone"
    );
}
/// A grid file whose name is not one of the five the removed entry gives is left alone.
#[tokio::test]
async fn removal_deletes_only_the_five_names_the_ids_give() {
    let golden = template("remove-basic");
    let run = build_with(&golden, true);
    let grid = run.profile.steam().join("userdata/1001/config/grid");
    // `seedRemovedGrid` seeded the five names and `unrelated.jpg`; three more files of the user's.
    for name in ["123456789p.jpg", "notes.txt"] {
        fs::write(grid.join(name), "mine").expect("a file");
    }
    steam_remove(&run.ctx, &run.game, &run.settings);
    let left: Vec<String> = tree_of(&grid)
        .into_iter()
        .map(|(path, _, _)| path)
        .collect();
    assert_eq!(left, ["123456789p.jpg", "notes.txt", "unrelated.jpg"]);
}
/// An entry titled like the game that carries no GameLib launch URL is not GameLib's: it stays, with its
/// art, and the outcome is not reported as a success.
#[tokio::test]
async fn a_same_titled_shortcut_gamelib_did_not_write_keeps_its_art_and_is_not_reported_removed() {
    let golden = template("remove-basic");
    let run = build(&golden);
    let grid = run.profile.steam().join("userdata/1001/config/grid");
    let before = tree_of(&grid);
    assert!(
        before.iter().any(|(path, _, _)| path == "unrelated.jpg") && before.len() > 1,
        "the five grid files and unrelated.jpg are seeded"
    );
    steam_remove(&run.ctx, &run.game, &run.settings);
    assert!(
        !run.files
            .calls
            .lock()
            .expect("calls")
            .iter()
            .any(|call| call["channel"] == "steamfiles_shortcuts_apply"),
        "no removal was asked for"
    );
    assert_eq!(tree_of(&grid), before, "the grid art stays");
    let notices = run.ui.notices();
    assert_eq!(notices.len(), 1);
    assert_ne!(
        notices[0].1,
        golden["notifications"][0]["body"].as_str().expect("body"),
        "not the recorded success"
    );
}
#[tokio::test]
async fn the_steam_ops_validate_their_arguments_and_need_the_shell_seam() {
    let run = build(&template("add-linux-basic"));
    let args = |game: Value| {
        vec![json!({
            "game": game,
            "settings": {
                "addDesktopShortcuts": false, "addStartMenuShortcuts": false,
                "addSteamShortcuts": true, "defaultSteamPath": null
            }
        })]
    };
    let game = |title: &str, runner: &str| {
        json!({
            "appName": "a", "runner": runner, "title": title, "isDlc": false,
            "canAddSteamShortcut": true
        })
    };
    for op in [
        "shortcuts_steam_add",
        "shortcuts_steam_remove",
        "shortcuts_steam_is_added",
    ] {
        let bad = Err(format!("{op}:bad-args"));
        assert_eq!(
            gamelib_shortcuts::dispatch(op, &args(game("T", "nope")), &run.ctx).await,
            bad,
            "{op}: an unknown runner"
        );
        assert_eq!(
            gamelib_shortcuts::dispatch(op, &[], &run.ctx).await,
            bad,
            "{op}: no argument"
        );
        let mut extra = args(game("T", "gog"));
        extra[0]["game"]["extra"] = json!("secret-text");
        assert_eq!(
            gamelib_shortcuts::dispatch(op, &extra, &run.ctx).await,
            bad,
            "{op}: an unknown field never reaches the answer"
        );
        let mut headless = build(&template("add-linux-basic")).ctx;
        headless.steam_files = None;
        assert_eq!(
            gamelib_shortcuts::dispatch(op, &args(game("T", "gog")), &headless).await,
            Err(format!("{op}:not-ready")),
            "{op}: no shortcuts.vdf seam"
        );
    }
    // A game with no title is asked about, not refused; it is never in Steam. A removal needs a title.
    assert_eq!(
        gamelib_shortcuts::dispatch("shortcuts_steam_is_added", &args(game("", "gog")), &run.ctx)
            .await,
        Ok(json!(false))
    );
    assert_eq!(
        gamelib_shortcuts::dispatch("shortcuts_steam_remove", &args(game("", "gog")), &run.ctx)
            .await,
        Err("shortcuts_steam_remove:bad-args".to_string())
    );
    // With no Steam path set there is no userdata folder: the add shows the TS message.
    let answered =
        gamelib_shortcuts::dispatch("shortcuts_steam_add", &args(game("T", "gog")), &run.ctx).await;
    assert_eq!(answered, Ok(json!(false)));
    let dialogs = run.ui.dialogs();
    assert_eq!(dialogs.len(), 1);
    assert_eq!(dialogs[0].0, "Error Adding Game to Steam");
    assert_eq!(
        dialogs[0].1,
        "Adding T to Steam failed with:\n userdata does not exist. Can't add/remove game to/from Steam!"
    );
    assert_eq!(dialogs[0].2, "ERROR");
}
/// A wiki lookup that answers only when the test lets it, so a test can see the add return first.
struct GatedWiki {
    gate: Arc<tokio::sync::Notify>,
    calls: Mutex<usize>,
}
impl WikiLookup for GatedWiki {
    fn steam_id(&self, _title: &str, _app_name: &str, _runner: &str) -> BoxFuture<Option<String>> {
        *self.calls.lock().expect("calls") += 1;
        let gate = self.gate.clone();
        Box::pin(async move {
            gate.notified().await;
            None
        })
    }
}
impl Run {
    fn game_with(&self, can_add: bool, dlc: bool) -> ShortcutGame {
        let mut game = self.game.clone();
        game.can_add_steam_shortcut = can_add;
        game.is_dlc = dlc;
        game
    }

    fn settings_with(&self, steam: bool) -> ShortcutSettings {
        let mut settings = self.settings.clone();
        settings.add_steam_shortcuts = steam;
        settings
    }

    /// `shortcuts_add` arguments for this run's game: no file to write, so the op returns at once.
    fn add_args(&self, steam: bool, can_add: bool, dlc: bool) -> gamelib_shortcuts::add::AddArgs {
        let mut game = json!({
            "appName": self.game.app_name,
            "runner": self.game.runner,
            "title": self.game.title,
            "isDlc": dlc,
            "canAddSteamShortcut": can_add,
        });
        game["artSquare"] = json!(self.game.art_square);
        serde_json::from_value(json!({
            "game": game,
            "settings": {
                "addDesktopShortcuts": false,
                "addStartMenuShortcuts": false,
                "addSteamShortcuts": steam,
                "defaultSteamPath": self.settings.default_steam_path,
            },
            "fromMenu": false,
            "notify": false,
        }))
        .expect("add args")
    }
}
async fn until<F: Fn() -> bool>(what: &str, done: F) {
    for _ in 0..500 {
        if done() {
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    panic!("timed out waiting for {what}");
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn shortcuts_add_starts_the_steam_step_and_returns_before_it_finishes() {
    let mut run = build(&template("add-linux-basic"));
    let gate = Arc::new(tokio::sync::Notify::new());
    let wiki = Arc::new(GatedWiki {
        gate: gate.clone(),
        calls: Mutex::new(0),
    });
    run.ctx.wiki = Some(wiki.clone());
    let outcome =
        gamelib_shortcuts::add::shortcuts_add(&run.ctx, run.add_args(true, true, false)).await;
    // The add itself is done (it has no file to write here) while the Steam step waits for the wiki.
    assert!(outcome.failed.is_empty());
    until("the Steam step to ask the wiki", || {
        *wiki.calls.lock().expect("calls") == 1
    })
    .await;
    assert!(
        run.ui.notices().is_empty(),
        "nothing is shown before it ends"
    );
    assert!(run.files.calls.lock().expect("calls").is_empty());
    gate.notify_one();
    until("the Added to Steam notice", || !run.ui.notices().is_empty()).await;
    let notices = run.ui.notices();
    assert_eq!(notices.len(), 1);
    assert_eq!(notices[0].0, "Added to Steam");
    assert!(notices[0]
        .1
        .starts_with("Oracle Game was successfully added to Steam."));
    // The task has ended and released its shutdown name.
    assert!(run
        .ctx
        .shutdown
        .drain(std::time::Duration::from_secs(2))
        .is_empty());
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn shortcuts_add_does_not_start_the_steam_step_unless_it_is_wanted() {
    for (steam, can_add, dlc, seam) in [
        (false, true, false, true),
        (true, false, false, true),
        (true, true, true, true),
        (true, true, false, false),
    ] {
        let mut run = build(&template("add-linux-basic"));
        if !seam {
            run.ctx.steam_files = None;
        }
        let started = gamelib_shortcuts::add::start_steam_add(
            &run.ctx,
            &run.game_with(can_add, dlc),
            &run.settings_with(steam),
        );
        assert!(
            started.is_none(),
            "steam={steam} can_add={can_add} dlc={dlc} seam={seam}"
        );
        gamelib_shortcuts::add::shortcuts_add(&run.ctx, run.add_args(steam, can_add, dlc)).await;
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        assert!(run.wiki.calls.lock().expect("calls").is_empty());
        assert!(run.files.calls.lock().expect("calls").is_empty());
        assert!(run.ui.notices().is_empty() && run.ui.dialogs().is_empty());
    }
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_shutdown_while_the_steam_step_waits_ends_it_and_it_shows_nothing() {
    let mut run = build(&template("add-linux-basic"));
    let wiki = Arc::new(GatedWiki {
        gate: Arc::new(tokio::sync::Notify::new()),
        calls: Mutex::new(0),
    });
    run.ctx.wiki = Some(wiki.clone());
    let handle = gamelib_shortcuts::add::start_steam_add(&run.ctx, &run.game, &run.settings)
        .expect("the step starts");
    until("the Steam step to ask the wiki", || {
        *wiki.calls.lock().expect("calls") == 1
    })
    .await;
    // The drain cancels the token, then waits for the registrant: the task gives up and releases it.
    assert!(run
        .ctx
        .shutdown
        .drain(std::time::Duration::from_secs(2))
        .is_empty());
    assert!(!handle.await.expect("the task did not panic"));
    assert!(run.ui.notices().is_empty() && run.ui.dialogs().is_empty());
    assert!(run.files.calls.lock().expect("calls").is_empty());
}
/// The step holds its `shortcuts-steam` name for exactly as long as it is in flight. A current-thread runtime
/// keeps the task from reacting to the drain's cancel until the test yields, so the name is still held when
/// the drain (no wait) looks.
#[tokio::test]
async fn the_steam_step_holds_its_shutdown_name_while_it_is_in_flight() {
    let mut run = build(&template("add-linux-basic"));
    let wiki = Arc::new(GatedWiki {
        gate: Arc::new(tokio::sync::Notify::new()),
        calls: Mutex::new(0),
    });
    run.ctx.wiki = Some(wiki.clone());
    let handle = gamelib_shortcuts::add::start_steam_add(&run.ctx, &run.game, &run.settings)
        .expect("the step starts");
    until("the Steam step to ask the wiki", || {
        *wiki.calls.lock().expect("calls") == 1
    })
    .await;
    assert_eq!(
        run.ctx.shutdown.drain(std::time::Duration::ZERO),
        ["shortcuts-steam"]
    );
    assert!(!handle.await.expect("the task did not panic"));
    assert!(run
        .ctx
        .shutdown
        .drain(std::time::Duration::from_secs(1))
        .is_empty());
}
