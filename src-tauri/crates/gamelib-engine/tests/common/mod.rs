//! What the golden tests of this crate share: the oracle's fake profile (`<APPFOLDER>`, `<TOOLS>`,
//! `<HOME>` rooted in a fake HOME), the normalised tree snapshot (path, kind, mode, sha256 over the
//! placeholder-normalised content) and the count-floor guard. POSIX only, as the TS oracle's replays
//! are. Each test crate uses a different part of it.
#![allow(dead_code)]
#![cfg(unix)]

use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use gamelib_core::clock::SystemClock;
use gamelib_core::process::SpecRunner;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::testing::RecordingLog;
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub const BOTTLES_REL: &str = "Library/Application Support/CrossOver/Bottles";

pub fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

pub fn read_json(path: &Path) -> Value {
    serde_json::from_slice(&std::fs::read(path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

/// A list is usable only at or above its floor: an empty or shrunken list is an error, so a replay
/// cannot pass by iterating nothing.
pub fn check_floor(what: &str, count: usize, floor: usize) -> Result<(), String> {
    if count < floor {
        return Err(format!(
            "{what}: scanned {count}, below the floor of {floor}"
        ));
    }
    Ok(())
}

pub struct Profile {
    pub home: FakeHome,
    pub app_folder: PathBuf,
    pub user_data: PathBuf,
    pub tools: PathBuf,
}

impl Profile {
    pub fn new() -> Profile {
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

    pub fn root(&self) -> &Path {
        self.home.root()
    }

    pub fn bottles_root(&self) -> PathBuf {
        self.root().join(BOTTLES_REL)
    }

    /// A placeholder path (`<TOOLS>/wine/x`) as a real one.
    pub fn expand(&self, text: &str) -> String {
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
    pub fn placeholders(&self) -> Vec<(&'static str, String)> {
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
    pub fn normalise_text(&self, text: &str) -> String {
        let mut out = text.to_string();
        for (token, root) in self.placeholders() {
            out = out.replace(root.as_str(), token);
        }
        out
    }

    /// [`Profile::normalise_text`] over every string of `value` (object keys are left alone).
    pub fn normalise(&self, value: Value) -> Value {
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
    pub fn expand_value(&self, value: &Value) -> Value {
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
    pub fn seed(&self, entries: &Value) {
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
            } else if let Some(encoded) = entry["base64"].as_str() {
                std::fs::create_dir_all(target.parent().unwrap()).unwrap();
                std::fs::write(&target, base64_decode(encoded)).unwrap();
            } else {
                panic!("unsupported seed entry: {entry}");
            }
            if let Some(mode) = entry["mode"].as_str() {
                let mode = u32::from_str_radix(mode, 8).expect("a seed mode is octal");
                std::fs::set_permissions(&target, std::fs::Permissions::from_mode(mode)).unwrap();
            }
        }
    }

    /// The pinned-engine directory variant a case builds under `<TOOLS>`: a copy of the committed
    /// `state/engines/<variant>` tree, modes kept. `none` and an absent variant are no directory.
    pub fn build_engines(&self, variant: &str) {
        copy_tree(
            &fixtures().join("state/engines").join(variant),
            &self.tools,
            None,
        );
    }

    /// A fixture bottle: the committed `state/bottles/<name>` tree under the Bottles root, with the
    /// `<TOOLS>` and `<HOME>` placeholders of its text expanded and its modes kept.
    pub fn build_bottle(&self, name: &str) {
        self.build_bottle_as(name, name);
    }

    /// The fixture bottle `fixture` laid down under the name `name` (what a scripted `cxbottle` leaves).
    pub fn build_bottle_as(&self, fixture: &str, name: &str) {
        copy_tree(
            &fixtures().join("state/bottles").join(fixture),
            &self.bottles_root().join(name),
            Some(self),
        );
    }

    pub fn ctx(&self, log: Arc<RecordingLog>) -> EngineCtx {
        self.ctx_with(log, None)
    }

    pub fn ctx_with(&self, log: Arc<RecordingLog>, proc: Option<Arc<dyn SpecRunner>>) -> EngineCtx {
        let paths = EnginePaths {
            app_folder: self.app_folder.clone(),
            user_data: self.user_data.clone(),
            tools_path: self.tools.clone(),
            user_home: self.root().to_path_buf(),
            temp: self.root().join("tmp"),
        };
        let ctx = EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Mac,
            paths,
            Shutdown::new(),
        );
        let ctx = match proc {
            Some(proc) => ctx.with_proc(proc),
            None => ctx,
        };
        ctx.with_log(log)
    }

    /// `snapshotNormalised`: every entry under the profile, sorted by path, with each file's sha256
    /// taken over its content with the profile roots as placeholders and a symlink's target likewise.
    pub fn snapshot(&self) -> Value {
        let mut entries = Vec::new();
        self.walk(Path::new(""), &mut entries);
        entries.sort_by(|a, b| a["path"].as_str().cmp(&b["path"].as_str()));
        Value::Array(entries)
    }

    pub fn walk(&self, rel: &Path, out: &mut Vec<Value>) {
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
    pub fn marker_bytes(&self) -> Value {
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

    pub fn marker_sha(&self, bottle: &str) -> Value {
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

pub fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Copies `source` into `target`, keeping each file's mode. With a `profile`, text files get their
/// `<TOOLS>` and `<HOME>` placeholders expanded (a marker holds an absolute wineserver path).
pub fn copy_tree(source: &Path, target: &Path, profile: Option<&Profile>) {
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
pub fn materialise(value: &Value) -> Value {
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

/// Where two trees first differ, as text.
pub fn first_difference(want: &Value, got: &Value) -> String {
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

/// Standard-alphabet base64 (padding optional), for a seeded binary file.
pub fn base64_decode(text: &str) -> Vec<u8> {
    let mut out = Vec::new();
    let (mut bits, mut count) = (0u32, 0u32);
    for byte in text.bytes().filter(|b| *b != b'=') {
        let value = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            other => panic!("not base64: {other}"),
        };
        bits = (bits << 6) | u32::from(value);
        count += 6;
        if count >= 8 {
            count -= 8;
            out.push((bits >> count) as u8);
            bits &= (1 << count) - 1;
        }
    }
    out
}
