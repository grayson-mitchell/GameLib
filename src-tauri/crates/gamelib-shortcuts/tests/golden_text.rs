//! Replays the shortcut text goldens recorded from the TypeScript (94-05) through the Rust writers
//! (94-14): the macOS `.app` (`run.sh`, `Info.plist`, the Desktop symlink) and the Linux `.desktop`
//! files, over the hostile names, the runners, the setting variants and the with-icon variants.
//! A golden is the TS's answer, never a value typed here. Every case builds a fresh `FakeHome`.
//!
//! What is compared per case is the whole tree the TypeScript left (the Applications, Desktop and
//! `.local/share/applications` folders): every path, its bytes, its symlink target and, on Unix,
//! its mode. The macOS `.icns` is recorded as present but opaque; its structure is checked in
//! `tests/icns.rs`.
//!
//! The 94-07 `addclear-*` goldens are the TS clearing an unproven Desktop item. The Rust port
//! refuses (FND-02, D-22), so those cases replay against the recorded delta: the item is left and
//! the Desktop link is reported refused.
//!
//! The apostrophe cases (`golden/text/deltas.json`, 8 darwin cases) are the TS writing `'` raw inside the
//! single-quoted launch URL of `run.sh`, which closes the quotes early (quick 261128-9fj). The Rust writes it
//! `%27`, so those cases replay against the TS bytes with that one substitution applied
//! ([`with_text_delta`]), never against a run.sh typed here; no recorded case file is edited. The delta set
//! is held to the cases' own inputs by `the_text_deltas_are_exactly_the_apostrophe_cases`.
//!
//! A host that cannot make symlinks (a Windows account without the privilege) compares everything
//! but the link and says so on stderr; on CI that is a panic, not a skip.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use gamelib_shortcuts::ctx::{Platform, ShortcutPaths};
use gamelib_shortcuts::launch_url::launch_url;
use gamelib_shortcuts::linux::{write_desktop_file, DESKTOP_COPY_MODE};
use gamelib_shortcuts::mac::{link_desktop, write_mac_app, DesktopRefused};
use gamelib_shortcuts::paths::shortcut_files;
use gamelib_testutil::FakeHome;
use serde_json::Value;

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

/// Every `*.json` case in a slice (not the manifest or the deltas), by id.
fn load_cases(slice: &str, prefix: &str) -> BTreeMap<String, Value> {
    let mut cases = BTreeMap::new();
    for entry in fs::read_dir(golden_dir(slice)).expect("the slice directory exists") {
        let path = entry.expect("a directory entry").path();
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default();
        if !name.ends_with(".json")
            || name == "MANIFEST.json"
            || name == "deltas.json"
            || !name.starts_with(prefix)
        {
            continue;
        }
        let text = fs::read_to_string(&path).expect("a golden is readable");
        let value: Value =
            serde_json::from_str(&text).unwrap_or_else(|e| panic!("{slice}/{name}: not JSON: {e}"));
        cases.insert(name.trim_end_matches(".json").to_string(), value);
    }
    cases
}

/// The text slice, held to its manifest: the directory matches the count and clears the floor.
fn text_cases() -> BTreeMap<String, Value> {
    let manifest: Value = serde_json::from_str(
        &fs::read_to_string(golden_dir("text").join("MANIFEST.json")).expect("a manifest"),
    )
    .expect("MANIFEST.json is JSON");
    let count = manifest["count"].as_u64().expect("manifest count") as usize;
    let floor = manifest["floor"].as_u64().expect("manifest floor") as usize;
    let cases = load_cases("text", "");
    assert_eq!(
        cases.len(),
        count,
        "text: the directory holds {} goldens, the manifest says {count}",
        cases.len()
    );
    assert!(cases.len() >= floor, "text: under the floor {floor}");
    cases
}

/// The oracle's profile layout, over a fresh `FakeHome`.
struct Profile {
    home: FakeHome,
    paths: ShortcutPaths,
}

impl Profile {
    fn new() -> Profile {
        let home = FakeHome::new("gamelib-shortcuts-text-");
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
}

/// One item of a tree, as read from disk or as a golden records it.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Item {
    File {
        bytes: Vec<u8>,
        /// The mode bits on disk (Unix only; 0 elsewhere).
        mode: u32,
    },
    Link {
        target: String,
    },
}

/// A path as a golden writes it: `/` separators, whatever the host.
fn portable(path: &str) -> String {
    path.replace('\\', "/")
}

/// Every file and symlink under `root/dir` (never following a link), keyed by the path relative to
/// `root`. A missing directory is an empty tree.
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
    let start = if dir.is_empty() {
        root.to_path_buf()
    } else {
        root.join(dir)
    };
    walk(root, &start, &mut out);
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

/// How a golden's recorded mode is checked on disk.
#[derive(Clone, Copy)]
enum ModeRule {
    /// `chmod`: the recorded mode exactly (macOS `run.sh`).
    Exact,
    /// A mode given at creation: the recorded mode minus the umask (the Linux Desktop copy).
    Umasked,
}

/// What a golden tree entry says should be on disk: `(key, item-or-opaque)` relative to the home.
struct Expected {
    key: String,
    link_target: Option<String>,
    bytes: Option<Vec<u8>>,
    opaque: bool,
    mode: Option<u32>,
}

fn expected_of(profile: &Profile, base: &str, entry: &Value) -> Expected {
    let path = entry["path"].as_str().expect("an entry path");
    let key = if base.is_empty() {
        portable(path)
    } else {
        format!("{base}/{}", portable(path))
    };
    let kind = entry["kind"].as_str().expect("an entry kind");
    Expected {
        key,
        link_target: (kind == "symlink").then(|| {
            portable(&profile.fill(entry["symlinkTarget"].as_str().expect("a link target")))
        }),
        bytes: entry["utf8"]
            .as_str()
            .map(|text| profile.fill(text).into_bytes()),
        opaque: entry["opaque"].as_bool().unwrap_or(false),
        mode: entry["mode"]
            .as_str()
            .map(|m| u32::from_str_radix(m, 8).expect("an octal mode")),
    }
}

/// Differences between the golden's entries under `base` and what is on disk. `skip_links` leaves
/// the symlink entries unchecked (a host that cannot make them).
fn diff_tree(
    profile: &Profile,
    base: &str,
    golden: &[Value],
    rule: ModeRule,
    skip_links: bool,
) -> Vec<String> {
    let actual = snapshot(profile.root(), base);
    let want: Vec<Expected> = golden
        .iter()
        .map(|entry| expected_of(profile, base, entry))
        .filter(|e| !(skip_links && e.link_target.is_some()))
        .collect();
    let mut diffs = Vec::new();
    for e in &want {
        let Some(item) = actual.get(&e.key) else {
            diffs.push(format!("{}: missing", e.key));
            continue;
        };
        match (item, &e.link_target) {
            (Item::Link { target }, Some(want_target)) => {
                if target != want_target {
                    diffs.push(format!("{}: link to {target}, golden {want_target}", e.key));
                }
            }
            (Item::File { bytes, mode }, None) => {
                if let Some(want_bytes) = &e.bytes {
                    if bytes != want_bytes {
                        diffs.push(format!(
                            "{}: bytes differ\n  got    {:?}\n  golden {:?}",
                            e.key,
                            String::from_utf8_lossy(bytes),
                            String::from_utf8_lossy(want_bytes)
                        ));
                    }
                } else if e.opaque {
                    // Opaque: not byte-compared (the encoder differs), but it must be an icns with
                    // the one raw `ic11` element (structure and geometry: tests/icns.rs).
                    match icns::IconFamily::read(bytes.as_slice()) {
                        Ok(family) if family.elements.len() == 1 => {}
                        Ok(family) => diffs.push(format!(
                            "{}: icns holds {} elements, not one",
                            e.key,
                            family.elements.len()
                        )),
                        Err(error) => diffs.push(format!("{}: not an icns: {error}", e.key)),
                    }
                } else {
                    diffs.push(format!("{}: golden has neither bytes nor opaque", e.key));
                }
                #[cfg(unix)]
                if let Some(requested) = e.mode {
                    let want_mode = match rule {
                        ModeRule::Exact => requested,
                        ModeRule::Umasked => umasked(profile.root(), requested),
                    };
                    if *mode != want_mode {
                        diffs.push(format!("{}: mode {mode:o}, golden {want_mode:o}", e.key));
                    }
                }
                #[cfg(not(unix))]
                let _ = (mode, rule, e.mode);
            }
            (Item::Link { .. }, None) => diffs.push(format!("{}: is a link, golden a file", e.key)),
            (Item::File { .. }, Some(_)) => {
                diffs.push(format!("{}: is a file, golden a link", e.key));
            }
        }
    }
    let wanted: Vec<&str> = want.iter().map(|e| e.key.as_str()).collect();
    for key in actual.keys() {
        let is_link = matches!(actual[key], Item::Link { .. });
        if !wanted.contains(&key.as_str()) && !(skip_links && is_link) {
            diffs.push(format!("{key}: written but not in the golden"));
        }
    }
    diffs
}

/// True when a Windows host without the symlink privilege refused the link, and this is not CI.
fn link_unsupported_here(refused: &DesktopRefused) -> bool {
    if !cfg!(windows) {
        return false;
    }
    if on_ci() {
        panic!("cannot create a Desktop symlink on CI: {refused}");
    }
    let DesktopRefused::Io(message) = refused else {
        return false;
    };
    eprintln!("SKIPPED the Desktop symlink comparison: cannot create a link locally: {message}");
    true
}

fn setting(input: &Value, key: &str) -> bool {
    input["settings"][key].as_bool().unwrap_or(false)
}

/// The recorded `run.sh` deltas (`golden/text/deltas.json`, in `recordDelta`'s format): case id to the
/// reason the Rust bytes differ from the TypeScript's.
fn text_deltas() -> BTreeMap<String, String> {
    let text = fs::read_to_string(golden_dir("text").join("deltas.json"))
        .expect("golden/text/deltas.json is readable");
    serde_json::from_str(&text).expect("deltas.json is an object from case id to reason")
}

/// The golden's macOS `run.sh` entry.
fn run_sh_entry(case: &Value) -> &Value {
    case["tree"]["Applications"]
        .as_array()
        .and_then(|entries| {
            entries
                .iter()
                .find(|e| e["path"].as_str().is_some_and(|p| p.ends_with("run.sh")))
        })
        .expect("a recorded run.sh")
}

/// The `run.sh` line of a golden that holds the command.
fn run_sh_command_line(case: &Value) -> String {
    run_sh_entry(case)["utf8"]
        .as_str()
        .expect("run.sh utf8")
        .lines()
        .find(|line| line.contains("--no-gui"))
        .expect("a --no-gui line")
        .to_string()
}

/// The case the Rust is expected to reproduce: the golden itself, unless `id` has a recorded delta. A
/// delta is exactly one substitution in the TS's own bytes: the single-quoted launch URL, with every `'`
/// written `%27`. It panics when the delta does not apply (empty reason, not darwin, no `'` in the TS
/// URL, or the TS URL not found in `run.sh` exactly once).
fn with_text_delta(id: &str, case: &Value) -> Value {
    let Some(reason) = text_deltas().remove(id) else {
        return case.clone();
    };
    assert!(!reason.trim().is_empty(), "{id}: the delta has no reason");
    assert_eq!(
        platform_of(case),
        "darwin",
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

/// One macOS text case: what `addShortcuts` does on darwin, then the tree comparison. Returns
/// whether the Desktop symlink could not be made on this host (and was therefore not compared).
fn replay_darwin(id: &str, case: &Value) -> Result<bool, String> {
    let case = &with_text_delta(id, case);
    let profile = Profile::new();
    let input = &case["input"];
    let title = input["title"].as_str().expect("title");
    let app_name = input["appName"].as_str().expect("appName");
    let runner = input["runner"].as_str().expect("runner");
    let from_menu = input["fromMenu"].as_bool().unwrap_or(false);
    let desktop_wanted = setting(input, "addDesktopShortcuts");
    let menu_wanted = setting(input, "addStartMenuShortcuts");
    let icon = icon_for(&profile, input, app_name);

    let (desktop_file, menu_file) = shortcut_files(Platform::Mac, &profile.paths, title, None);
    let (desktop_file, menu_file) = (desktop_file.expect("desktop"), menu_file.expect("menu"));
    let mut link_skipped = false;
    let mut bundle_written = false;
    if menu_wanted || from_menu || desktop_wanted {
        write_mac_app(
            &profile.paths,
            title,
            app_name,
            runner,
            &profile.paths.shell_exe,
            icon.as_deref(),
        )
        .map_err(|e| format!("{id}: write_mac_app failed: {e}"))?;
        bundle_written = true;
    }
    if desktop_wanted && bundle_written {
        match link_desktop(&profile.paths, &desktop_file, &menu_file) {
            Ok(()) => {}
            Err(refused) if link_unsupported_here(&refused) => link_skipped = true,
            Err(refused) => return Err(format!("{id}: link_desktop failed: {refused}")),
        }
    }

    let mut diffs = Vec::new();
    for (base, entries) in case["tree"].as_object().expect("a tree") {
        let rule = ModeRule::Exact;
        diffs.extend(diff_tree(
            &profile,
            base,
            entries.as_array().expect("tree entries"),
            rule,
            link_skipped,
        ));
    }
    if diffs.is_empty() {
        Ok(link_skipped)
    } else {
        Err(format!("{id}:\n  {}", diffs.join("\n  ")))
    }
}

/// One Linux text case: what `addShortcuts` does on linux, then the tree comparison.
fn replay_linux(id: &str, case: &Value) -> Result<bool, String> {
    let profile = Profile::new();
    let input = &case["input"];
    let title = input["title"].as_str().expect("title");
    let app_name = input["appName"].as_str().expect("appName");
    let runner = input["runner"].as_str().expect("runner");
    let from_menu = input["fromMenu"].as_bool().unwrap_or(false);
    // The oracle's profile has both folders; the TS does not create them.
    fs::create_dir_all(profile.paths.linux_desktop()).expect("the Desktop folder");
    fs::create_dir_all(profile.root().join(".local/share/applications")).expect("applications");
    // The TS builds the icon path by template string, so the separator before the file is `/`.
    let icon = input["withIcon"].as_bool().unwrap_or(false).then(|| {
        PathBuf::from(format!(
            "{}/{app_name}.jpg",
            profile.paths.icon_folder.display()
        ))
    });

    let (desktop_file, menu_file) = shortcut_files(Platform::Linux, &profile.paths, title, None);
    let (desktop_file, menu_file) = (desktop_file.expect("desktop"), menu_file.expect("menu"));
    if setting(input, "addDesktopShortcuts") || from_menu {
        write_desktop_file(
            &desktop_file,
            title,
            app_name,
            runner,
            icon.as_deref(),
            Some(DESKTOP_COPY_MODE),
        )
        .map_err(|e| format!("{id}: the Desktop copy failed: {e}"))?;
    }
    if setting(input, "addStartMenuShortcuts") || from_menu {
        write_desktop_file(&menu_file, title, app_name, runner, icon.as_deref(), None)
            .map_err(|e| format!("{id}: the applications copy failed: {e}"))?;
    }

    let mut diffs = Vec::new();
    for (base, entries) in case["tree"].as_object().expect("a tree") {
        diffs.extend(diff_tree(
            &profile,
            base,
            entries.as_array().expect("tree entries"),
            ModeRule::Umasked,
            false,
        ));
    }
    if diffs.is_empty() {
        Ok(false)
    } else {
        Err(format!(
            "{id}:
  {}",
            diffs.join(
                "
  "
            )
        ))
    }
}

/// The icon file a with-icon case pre-created in the oracle, as a decodable file here. `None` for
/// an iconless case.
fn icon_for(profile: &Profile, input: &Value, app_name: &str) -> Option<PathBuf> {
    if !input["withIcon"].as_bool().unwrap_or(false) {
        return None;
    }
    let icon = profile.paths.icon_folder.join(format!("{app_name}.jpg"));
    fs::create_dir_all(icon.parent().expect("an icon parent")).expect("icon folder");
    // A small PNG, named `.jpg` like the icon lookup's download: the decoder goes by content.
    let image = image::RgbaImage::from_pixel(64, 64, image::Rgba([200, 40, 40, 255]));
    image
        .save_with_format(&icon, image::ImageFormat::Png)
        .expect("write the icon");
    Some(icon)
}

fn platform_of(case: &Value) -> &str {
    case["platform"].as_str().expect("platform")
}

fn with_icon(case: &Value) -> bool {
    case["input"]["withIcon"].as_bool().unwrap_or(false)
}

fn replay_bucket(
    platform: &str,
    icon: bool,
    replay: impl Fn(&str, &Value) -> Result<bool, String>,
) -> usize {
    let cases = text_cases();
    let bucket: Vec<_> = cases
        .iter()
        .filter(|(_, c)| platform_of(c) == platform && with_icon(c) == icon)
        .collect();
    assert!(!bucket.is_empty(), "no {platform} icon={icon} text goldens");
    let mut failures = Vec::new();
    let mut link_skips = 0usize;
    for (id, case) in &bucket {
        match replay(id, case) {
            Ok(skipped) => link_skips += usize::from(skipped),
            Err(message) => failures.push(message),
        }
    }
    println!(
        "text goldens replayed: {platform} icon={icon}: {} cases ({link_skips} without the Desktop symlink on this host)",
        bucket.len()
    );
    assert!(
        failures.is_empty(),
        "{} of {} {platform} cases differ:\n{}",
        failures.len(),
        bucket.len(),
        failures.join("\n")
    );
    bucket.len()
}

#[test]
fn darwin_iconless_text_goldens_replay_byte_for_byte() {
    // The bucket is whatever the manifest-checked directory holds; the partition test below ties
    // the buckets to the manifest, and the count is printed.
    replay_bucket("darwin", false, replay_darwin);
}

#[test]
fn darwin_with_icon_text_goldens_replay_byte_for_byte() {
    replay_bucket("darwin", true, replay_darwin);
}

#[test]
fn linux_iconless_text_goldens_replay_byte_for_byte() {
    replay_bucket("linux", false, replay_linux);
}

#[test]
fn linux_with_icon_text_goldens_replay_byte_for_byte() {
    replay_bucket("linux", true, replay_linux);
}

#[test]
fn the_buckets_partition_the_manifest() {
    let cases = text_cases();
    let count = |platform: &str, icon: bool| {
        cases
            .values()
            .filter(|c| platform_of(c) == platform && with_icon(c) == icon)
            .count()
    };
    let known = count("darwin", false)
        + count("darwin", true)
        + count("linux", false)
        + count("linux", true);
    assert_eq!(known, cases.len(), "a text golden is on neither platform");
}

#[test]
fn the_subshell_hostile_run_sh_is_byte_identical() {
    let cases = text_cases();
    let hostile: Vec<_> = cases
        .iter()
        .filter(|(_, c)| {
            platform_of(c) == "darwin"
                && (c["input"]["appName"]
                    .as_str()
                    .unwrap_or("")
                    .contains("$(touch pwned)")
                    || c["input"]["title"]
                        .as_str()
                        .unwrap_or("")
                        .contains("$(touch pwned)")
                    || c["input"]["runner"]
                        .as_str()
                        .unwrap_or("")
                        .contains("$(touch pwned)"))
        })
        .collect();
    assert!(
        !hostile.is_empty(),
        "no darwin golden carries `$(touch pwned)`"
    );
    for (id, case) in &hostile {
        // The text in the golden is the percent-encoded form: the literal subshell never reaches run.sh.
        let run_sh = case["tree"]["Applications"]
            .as_array()
            .and_then(|entries| {
                entries
                    .iter()
                    .find(|e| e["path"].as_str().is_some_and(|p| p.ends_with("run.sh")))
            })
            .and_then(|e| e["utf8"].as_str())
            .unwrap_or_else(|| panic!("{id}: a recorded run.sh"));
        assert!(
            !run_sh.contains("$(touch"),
            "{id}: the subshell reached run.sh"
        );
        let input = &case["input"];
        let url = launch_url(
            input["appName"].as_str().expect("appName"),
            input["runner"].as_str().expect("runner"),
            true,
        );
        assert!(
            run_sh.contains(&format!("'{url}'")),
            "{id}: the single-quoted URL"
        );
        replay_darwin(id, case).unwrap_or_else(|e| panic!("{e}"));
    }
    println!("hostile subshell cases replayed: {}", hostile.len());
}

/// The delta set is the apostrophe cases and nothing else, computed from the cases' own inputs: a delta
/// that goes unused, or an apostrophe case without one, fails here.
#[test]
fn the_text_deltas_are_exactly_the_apostrophe_cases() {
    let cases = text_cases();
    let deltas = text_deltas();
    let has_apostrophe = |case: &Value| {
        ["appName", "runner"]
            .iter()
            .any(|key| case["input"][key].as_str().unwrap_or("").contains('\''))
    };
    let want: BTreeSet<&String> = cases
        .iter()
        .filter(|(_, c)| platform_of(c) == "darwin" && has_apostrophe(c))
        .map(|(id, _)| id)
        .collect();
    let got: BTreeSet<&String> = deltas.keys().collect();
    assert!(!got.is_empty(), "no run.sh deltas are recorded");
    assert_eq!(
        got, want,
        "deltas.json does not list exactly the apostrophe cases"
    );
    for (id, reason) in &deltas {
        assert!(!reason.trim().is_empty(), "{id}: an empty reason");
        let case = &cases[id];
        let before = run_sh_command_line(case).matches('\'').count();
        let after = run_sh_command_line(&with_text_delta(id, case))
            .matches('\'')
            .count();
        assert!(
            before > 2,
            "{id}: the TS run.sh holds {before} quotes, a delta is unused"
        );
        assert_eq!(
            after, 2,
            "{id}: the delta-applied run.sh must hold only the URL's pair"
        );
    }
}

/// The Windows `.lnk` goldens carry the percent-encoded URL the TS built for each hostile name:
/// the encoder is held to them here as well.
#[test]
fn the_encoded_url_matches_every_windows_lnk_golden() {
    let cases = load_cases("windows", "lnk-");
    assert!(cases.len() >= 20, "only {} lnk goldens", cases.len());
    let mut checked = 0usize;
    for (id, case) in &cases {
        let input = &case["input"];
        let (Some(app_name), Some(runner)) = (input["appName"].as_str(), input["runner"].as_str())
        else {
            continue;
        };
        let spawns = case["spawns"].as_array().expect("spawns");
        let Some(args) = spawns
            .iter()
            .find_map(|s| s["envDiff"]["set"]["GAMELIB_LNK_ARGS"].as_str())
        else {
            continue;
        };
        let url = launch_url(app_name, runner, true);
        assert_eq!(args, format!("\"{url}\""), "{id}");
        checked += 1;
    }
    assert!(checked >= 20, "only {checked} lnk URLs checked");
}

// ------------------------------------------------------------------ the add-side clear delta

/// Writes a golden `before` tree into the profile: files first, then links (a link to a directory
/// needs its target to exist on Windows). False when this host cannot make a link.
fn seed(profile: &Profile, entries: &[Value]) -> bool {
    let mut links = Vec::new();
    for entry in entries {
        let path = profile.root().join(entry["path"].as_str().expect("path"));
        fs::create_dir_all(path.parent().expect("a parent")).expect("parent dir");
        match entry["kind"].as_str().expect("kind") {
            "file" => fs::write(&path, entry["utf8"].as_str().unwrap_or("")).expect("seed file"),
            _ => links.push((
                path,
                PathBuf::from(profile.fill(entry["symlinkTarget"].as_str().expect("target"))),
            )),
        }
    }
    for (link, target) in links {
        #[cfg(unix)]
        let made = std::os::unix::fs::symlink(&target, &link);
        #[cfg(windows)]
        let made = if target.is_dir() {
            std::os::windows::fs::symlink_dir(&target, &link)
        } else {
            std::os::windows::fs::symlink_file(&target, &link)
        };
        if !gamelib_testutil::require_link(made, "a seeded Desktop symlink", on_ci()) {
            return false;
        }
    }
    true
}

/// The golden entries as `(path, entry)`, for a union by path.
fn entries_by_path(tree: &Value, side: &str) -> BTreeMap<String, Value> {
    tree[side]
        .as_array()
        .map(|entries| {
            entries
                .iter()
                .map(|e| (portable(e["path"].as_str().expect("path")), e.clone()))
                .collect()
        })
        .unwrap_or_default()
}

#[test]
fn an_unproven_desktop_item_is_left_and_reported_refused() {
    let cases = load_cases("remove", "addclear-");
    let deltas: Value = serde_json::from_str(
        &fs::read_to_string(golden_dir("remove").join("deltas.json")).expect("deltas.json"),
    )
    .expect("deltas.json is JSON");
    assert!(cases.len() >= 7, "only {} addclear goldens", cases.len());
    let (mut refused_cases, mut proven_cases, mut failures) = (0usize, 0usize, Vec::new());
    for (id, case) in &cases {
        let profile = Profile::new();
        let input = &case["input"];
        let title = input["title"].as_str().expect("title");
        let before = case["tree"]["before"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        if !seed(&profile, &before) {
            continue;
        }
        let (desktop_file, menu_file) = shortcut_files(Platform::Mac, &profile.paths, title, None);
        let (desktop_file, menu_file) = (desktop_file.expect("desktop"), menu_file.expect("menu"));
        write_mac_app(
            &profile.paths,
            title,
            input["appName"].as_str().expect("appName"),
            "legendary",
            &profile.paths.shell_exe,
            None,
        )
        .expect("the bundle is written");
        let outcome = link_desktop(&profile.paths, &desktop_file, &menu_file);

        // The expected tree: the TS's `after`, except that where the delta says the Rust refuses,
        // the Desktop item stays as it was before (the `before` entries plus the written bundle).
        let after = entries_by_path(&case["tree"], "after");
        let refused = deltas.get(id.as_str()).is_some();
        let mut expected = after.clone();
        if refused {
            expected.retain(|path, _| !path.starts_with("Desktop/"));
            expected.extend(entries_by_path(&case["tree"], "before"));
        }
        let golden: Vec<Value> = expected.values().cloned().collect();
        let diffs = diff_tree(&profile, "", &golden, ModeRule::Exact, false);
        match (&outcome, refused) {
            (Err(DesktopRefused::Unproven(_)), true) => refused_cases += 1,
            (Ok(()), false) => proven_cases += 1,
            (Err(refusal), _) if !refused && link_unsupported_here(refusal) => continue,
            (other, _) => failures.push(format!(
                "{id}: link_desktop {other:?}, delta recorded: {refused}"
            )),
        }
        if !diffs.is_empty() {
            failures.push(format!("{id}:\n  {}", diffs.join("\n  ")));
        }
    }
    println!("add-side clear: {refused_cases} refused (delta), {proven_cases} cleared (proven GameLib item)");
    assert!(
        failures.is_empty(),
        "add-clear mismatches:\n{}",
        failures.join("\n")
    );
    if !cfg!(windows) || on_ci() {
        // Every recorded delta is a refusal and every other case is a proven GameLib item (or none).
        let recorded = cases
            .keys()
            .filter(|id| deltas.get(id.as_str()).is_some())
            .count();
        assert_eq!(refused_cases, recorded, "the recorded refusals");
        assert_eq!(proven_cases, cases.len() - recorded, "the proven clears");
    }
}
