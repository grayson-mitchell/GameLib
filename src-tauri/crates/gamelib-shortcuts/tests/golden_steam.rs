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
        if !name.ends_with(".json") || name == "MANIFEST.json" {
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
}

impl GoldenFiles {
    fn record(&self, call: Value) {
        self.calls.lock().expect("calls").push(call);
    }
}

impl SteamShortcutsFile for GoldenFiles {
    fn read(&self, path: &Path) -> Result<ShortcutsSummary, String> {
        self.record(json!({
            "channel": "steamfiles_shortcuts_read",
            "args": { "path": path.to_string_lossy() }
        }));
        Ok(read_shortcuts(path))
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
                if let ShortcutsMutation::Remove { app_name } = mutation {
                    let found = read_shortcuts(path)
                        .entries
                        .into_iter()
                        .find(|entry| entry.app_name.as_deref() == Some(app_name.as_str()));
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
    Run {
        profile,
        ctx,
        files,
        wiki,
        http,
        ui,
        game: serde_json::from_value(game).expect("a game"),
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

/// Replays one add, is-added or remove case and compares everything the golden recorded.
async fn replay_case(id: &str, golden: &Value) {
    let run = build(golden);
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
    let want_notices: Vec<(String, String)> = golden["notifications"]
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
        .collect();
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
    assert_eq!(
        tree_of(&profile.steam()),
        want_steam,
        "{id}: the Steam folder after the call"
    );
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
    for (id, golden) in &removals {
        replay_case(id, golden).await;
    }
    println!("steam remove: {} replayed", removals.len());
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
}
