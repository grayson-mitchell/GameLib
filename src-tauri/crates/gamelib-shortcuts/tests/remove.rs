//! Replays the 94-07 removal goldens through `shortcuts_remove` (94-18, D-22, D-29) and pins what the
//! TypeScript never did: a shortcut item is deleted only when GameLib provably wrote it.
//!
//! A golden is the TS's answer (everything under the shortcut paths removed, a user's own items
//! included). The Rust port refuses what it cannot prove, so each case that holds an item GameLib did not
//! write replays against its recorded D-29 delta in `deltas.json`: the item stays where it was and is
//! reported refused, and every other item is removed exactly as the TS removed it.
//!
//! Every case builds a fresh `FakeHome`. The Windows cases run through the same pure removal over a layout
//! of real temp folders (a Windows path is a backslash string, which a Unix host cannot walk); the
//! `.lnk` files the goldens record as marker text are seeded as UTF-16LE, which is how a real `.lnk`
//! carries its arguments (94-16 proved it against a real PowerShell run).
//!
//! A host that cannot make symlinks (a Windows account without the privilege) skips the cases that need
//! one and says so on stderr; on CI that is a panic, not a skip.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_i18n::Catalog;
use gamelib_shortcuts::ctx::{Platform, ShortcutPaths, ShortcutsCtx};
use gamelib_shortcuts::exists::shortcut_path_present;
use gamelib_shortcuts::mac::{link_desktop, write_mac_app};
use gamelib_shortcuts::notice;
use gamelib_shortcuts::remove::{plan, remove_shortcut_files, Planned, Shortcut};
use gamelib_shortcuts::sanitize::sanitize_filename;
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

/// Every case of the remove slice by id, held to its manifest: the directory matches the count and
/// clears the floor.
fn remove_cases() -> BTreeMap<String, Value> {
    let manifest: Value = serde_json::from_str(
        &fs::read_to_string(golden_dir("remove").join("MANIFEST.json")).expect("a manifest"),
    )
    .expect("MANIFEST.json is JSON");
    let count = manifest["count"].as_u64().expect("manifest count") as usize;
    let floor = manifest["floor"].as_u64().expect("manifest floor") as usize;
    let mut cases = BTreeMap::new();
    for entry in fs::read_dir(golden_dir("remove")).expect("the slice directory exists") {
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
            serde_json::from_str(&text).unwrap_or_else(|e| panic!("remove/{name}: not JSON: {e}"));
        cases.insert(name.trim_end_matches(".json").to_string(), value);
    }
    assert_eq!(
        cases.len(),
        count,
        "remove: the directory holds {} goldens, the manifest says {count}",
        cases.len()
    );
    assert!(cases.len() >= floor, "remove: under the floor {floor}");
    cases
}

fn deltas() -> Value {
    serde_json::from_str(
        &fs::read_to_string(golden_dir("remove").join("deltas.json")).expect("deltas.json"),
    )
    .expect("deltas.json is JSON")
}

/// The oracle's profile layout, over a fresh `FakeHome`.
struct Profile {
    home: FakeHome,
    paths: ShortcutPaths,
}

impl Profile {
    fn new() -> Profile {
        let home = FakeHome::new("gamelib-shortcuts-remove-");
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
        text.replace("<SHELL_EXE>", &self.paths.shell_exe.to_string_lossy())
            .replace("<HOME>", &self.root().to_string_lossy())
    }
}

fn platform_of(case: &Value) -> Platform {
    match case["platform"].as_str().expect("a platform") {
        "darwin" => Platform::Mac,
        "linux" => Platform::Linux,
        "win32" => Platform::Windows,
        other => panic!("unknown platform {other}"),
    }
}

/// The bytes a seeded file holds: the golden's text, except a Windows `.lnk`, whose arguments a real
/// shell link stores as UTF-16LE.
fn seeded_bytes(profile: &Profile, path: &str, text: &str) -> Vec<u8> {
    let text = profile.fill(text);
    if path.ends_with(".lnk") {
        text.encode_utf16().flat_map(u16::to_le_bytes).collect()
    } else {
        text.into_bytes()
    }
}

/// Writes a golden `before` tree into the profile: files first, then links (a link to a directory needs
/// its target to exist on Windows). False when this host cannot make a link.
fn seed(profile: &Profile, entries: &[Value]) -> bool {
    let mut links = Vec::new();
    for entry in entries {
        let rel = entry["path"].as_str().expect("path");
        let path = profile.root().join(rel);
        fs::create_dir_all(path.parent().expect("a parent")).expect("parent dir");
        match entry["kind"].as_str().expect("kind") {
            "file" => fs::write(
                &path,
                seeded_bytes(profile, rel, entry["utf8"].as_str().unwrap_or("")),
            )
            .expect("seed file"),
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

/// One item of a tree: its bytes, or its link target.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Item {
    File(Vec<u8>),
    Link(String),
}

/// Every file and symlink under the profile root (never following a link), keyed by the path relative to
/// it.
fn snapshot(root: &Path) -> BTreeMap<String, Item> {
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
                out.insert(key, Item::Link(portable(&target.to_string_lossy())));
            } else if meta.is_dir() {
                walk(root, &path, out);
            } else {
                out.insert(key, Item::File(fs::read(&path).expect("file bytes")));
            }
        }
    }
    let mut out = BTreeMap::new();
    walk(root, root, &mut out);
    out
}

/// What a golden tree says should be on disk, keyed by path.
fn expected_tree(profile: &Profile, entries: &[Value]) -> BTreeMap<String, Item> {
    entries
        .iter()
        .map(|entry| {
            let rel = entry["path"].as_str().expect("path");
            let item = match entry["kind"].as_str().expect("kind") {
                "file" => Item::File(seeded_bytes(
                    profile,
                    rel,
                    entry["utf8"].as_str().unwrap_or(""),
                )),
                _ => Item::Link(portable(
                    &profile.fill(entry["symlinkTarget"].as_str().expect("target")),
                )),
            };
            (portable(rel), item)
        })
        .collect()
}

fn entries(case: &Value, side: &str) -> Vec<Value> {
    case["tree"][side].as_array().cloned().unwrap_or_default()
}

/// Where the case's shortcut files are. Windows paths are backslash strings, so off Windows the layout is
/// built from real temp folders, the way the oracle's profile is laid out.
fn planned_for(platform: Platform, profile: &Profile, input: &Value) -> Planned {
    let title = input["title"].as_str().expect("title");
    if platform != Platform::Windows {
        return plan(platform, &profile.paths, title, None);
    }
    let registry_desktop = input["registryDesktop"].as_bool().unwrap_or(false);
    windows_layout(profile, title, registry_desktop)
}

fn windows_layout(profile: &Profile, title: &str, registry_desktop: bool) -> Planned {
    let name = format!("{}.lnk", sanitize_filename(title));
    let desktop_root = profile.root().join("Desktop");
    let menu_root = profile
        .root()
        .join("AppData/Roaming/Microsoft/Windows/Start Menu/Programs");
    Planned {
        desktop: registry_desktop.then(|| Shortcut {
            path: desktop_root.join(&name),
            trust_root: desktop_root.clone(),
        }),
        menu: Some(Shortcut {
            path: menu_root.join(&name),
            trust_root: menu_root,
        }),
    }
}

/// The planned items the case says GameLib did not write (a hand-placed file, folder or link).
fn foreign_items<'a>(planned: &'a Planned, input: &Value) -> Vec<&'a Shortcut> {
    let mut out = Vec::new();
    if matches!(
        input["desktop"].as_str(),
        Some("file" | "folder" | "link-elsewhere" | "dangling-elsewhere")
    ) {
        out.extend(planned.desktop.as_ref());
    }
    if matches!(input["menu"].as_str(), Some("file" | "folder")) {
        out.extend(planned.menu.as_ref());
    }
    out
}

fn rel(profile: &Profile, item: &Shortcut) -> String {
    portable(
        &item
            .path
            .strip_prefix(profile.root())
            .expect("inside the profile")
            .to_string_lossy(),
    )
}

fn paths_of(items: &[PathBuf]) -> BTreeSet<PathBuf> {
    items.iter().cloned().collect()
}

/// Replays one removal case. `Ok(true)` when the host could not seed it and it was skipped.
fn replay(id: &str, case: &Value, deltas: &Value) -> Result<bool, String> {
    let profile = Profile::new();
    let platform = platform_of(case);
    let before = entries(case, "before");
    if !seed(&profile, &before) {
        return Ok(true);
    }
    let planned = planned_for(platform, &profile, &case["input"]);
    let foreign = foreign_items(&planned, &case["input"]);
    let foreign_present: BTreeSet<PathBuf> = foreign
        .iter()
        .filter(|item| fs::symlink_metadata(&item.path).is_ok())
        .map(|item| item.path.clone())
        .collect();
    let has_delta = deltas.get(id).is_some();
    if has_delta != !foreign_present.is_empty() {
        return Err(format!(
            "{id}: the delta ({has_delta}) and the items GameLib did not write ({}) disagree",
            foreign_present.len()
        ));
    }

    let outcome = remove_shortcut_files(platform, &planned);

    // The TS's `after`, except that an item the proof refuses stays exactly as it was before.
    let mut expected = expected_tree(&profile, &entries(case, "after"));
    let kept: Vec<String> = foreign
        .iter()
        .filter(|item| foreign_present.contains(&item.path))
        .map(|item| rel(&profile, item))
        .collect();
    for (path, item) in expected_tree(&profile, &before) {
        if kept
            .iter()
            .any(|k| path == *k || path.starts_with(&format!("{k}/")))
        {
            expected.insert(path, item);
        }
    }
    let actual = snapshot(profile.root());
    let mut problems = Vec::new();
    if actual != expected {
        problems.push(format!(
            "tree differs\n    got      {:?}\n    expected {:?}",
            actual.keys().collect::<Vec<_>>(),
            expected.keys().collect::<Vec<_>>()
        ));
        for key in actual.keys().chain(expected.keys()) {
            if actual.get(key) != expected.get(key) {
                problems.push(format!(
                    "    {key}: {:?} vs {:?}",
                    actual.get(key),
                    expected.get(key)
                ));
            }
        }
    }
    if paths_of(&outcome.refused) != foreign_present {
        problems.push(format!(
            "refused {:?}, expected exactly the items GameLib did not write {foreign_present:?}",
            outcome.refused
        ));
    }
    // What the TS removed and GameLib wrote is reported removed, once each.
    let removed = paths_of(&outcome.removed);
    if removed.len() != outcome.removed.len() || removed.iter().any(|p| foreign_present.contains(p))
    {
        problems.push(format!("removed {:?}", outcome.removed));
    }
    // The renderer's disk re-check: something is still there exactly when an item was refused.
    let still_there = [&planned.desktop, &planned.menu]
        .into_iter()
        .flatten()
        .any(|item| shortcut_path_present(&item.path));
    if still_there != !foreign_present.is_empty() {
        problems.push(format!("something remains: {still_there}"));
    }
    if problems.is_empty() {
        Ok(false)
    } else {
        Err(format!("{id}:\n  {}", problems.join("\n  ")))
    }
}

#[test]
fn every_removal_golden_replays_with_its_recorded_delta() {
    let cases = remove_cases();
    let deltas = deltas();
    let (mut replayed, mut skipped, mut refusing, mut failures) = (0usize, 0usize, 0usize, vec![]);
    let mut not_yet = 0usize;
    for (id, case) in &cases {
        // The `addclear-` goldens are the add side, replayed below as the same proof seen from removal.
        if id.starts_with("addclear-") {
            continue;
        }
        // Tracer (94-18 task 1): the macOS arm only; the Linux and Windows arms and their proofs join in task 2.
        if platform_of(case) != Platform::Mac {
            not_yet += 1;
            continue;
        }
        match replay(id, case, &deltas) {
            Ok(true) => skipped += 1,
            Ok(false) => {
                replayed += 1;
                refusing += usize::from(deltas.get(id.as_str()).is_some());
            }
            Err(problem) => failures.push(problem),
        }
    }
    println!("remove: {replayed} replayed ({refusing} against a D-29 delta), {skipped} skipped");
    assert!(
        failures.is_empty(),
        "removal mismatches:\n{}",
        failures.join("\n")
    );
    let add_side = cases
        .keys()
        .filter(|id| id.starts_with("addclear-"))
        .count();
    assert_eq!(replayed + skipped + add_side + not_yet, cases.len());
    if !cfg!(windows) || on_ci() {
        assert_eq!(skipped, 0, "a link-capable host skips nothing");
    }
    // Every recorded D-29 delta belongs to a golden of this slice, and each removal case with one refuses.
    for id in deltas.as_object().expect("deltas is an object").keys() {
        assert!(cases.contains_key(id), "delta for an unknown case {id}");
    }
}

#[test]
fn the_add_side_goldens_are_the_same_proof_seen_from_removal() {
    let cases = remove_cases();
    let deltas = deltas();
    let (mut kept, mut cleared) = (0usize, 0usize);
    for (id, case) in cases.iter().filter(|(id, _)| id.starts_with("addclear-")) {
        let profile = Profile::new();
        if !seed(&profile, &entries(case, "before")) {
            continue;
        }
        let planned = planned_for(Platform::Mac, &profile, &case["input"]);
        let before = snapshot(profile.root());
        let outcome = remove_shortcut_files(Platform::Mac, &planned);
        let after = snapshot(profile.root());
        if deltas.get(id.as_str()).is_some() {
            // A foreign Desktop item: left exactly as it was, and reported.
            assert_eq!(before, after, "{id}: an unproven item must not change");
            assert_eq!(outcome.refused.len(), 1, "{id}");
            assert!(outcome.removed.is_empty(), "{id}");
            kept += 1;
        } else {
            // GameLib's own legacy bundle, its stale link, or nothing: gone.
            assert!(after.is_empty(), "{id}: left {:?}", after.keys());
            assert!(outcome.refused.is_empty(), "{id}");
            cleared += 1;
        }
    }
    println!("add-side goldens through removal: {kept} kept, {cleared} cleared");
    if !cfg!(windows) || on_ci() {
        assert_eq!(kept + cleared, 7, "all seven addclear goldens");
    }
}

#[cfg(windows)]
#[test]
fn the_windows_plan_is_the_layout_the_replay_builds() {
    let profile = Profile::new();
    let desktop = profile.root().join("Desktop");
    let planned = plan(
        Platform::Windows,
        &profile.paths,
        "Plain Game",
        Some(&desktop),
    );
    assert_eq!(planned, windows_layout(&profile, "Plain Game", true));
    let no_registry = plan(Platform::Windows, &profile.paths, "Plain Game", None);
    assert_eq!(no_registry, windows_layout(&profile, "Plain Game", false));
}

// ---------------------------------------------------------------------------------------------------
// The op: arguments, outcome, notifications.

fn locales_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("..")
        .join("public")
        .join("locales")
}

fn ctx_for(profile: &Profile, platform: Platform) -> (ShortcutsCtx, Arc<RecordingUi>) {
    let ui = Arc::new(RecordingUi::default());
    let ctx = ShortcutsCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        platform,
        Shutdown::new(),
    )
    .with_paths(profile.paths.clone())
    .with_catalog(Arc::new(Catalog::load(&locales_dir(), "en")))
    .with_ui(ui.clone());
    (ctx, ui)
}

fn remove_args(title: &str, is_dlc: bool, notify: bool) -> Value {
    json!({
        "game": {
            "appName": "plainapp", "runner": "legendary", "title": title, "isDlc": is_dlc,
            "canAddSteamShortcut": true
        },
        "notify": notify
    })
}

async fn run(ctx: &ShortcutsCtx, args: Value) -> Value {
    gamelib_shortcuts::dispatch("shortcuts_remove", &[args], ctx)
        .await
        .expect("the op answers")
}

fn strings(value: &Value) -> BTreeSet<String> {
    value
        .as_array()
        .expect("an array")
        .iter()
        .map(|v| v.as_str().expect("a string").to_string())
        .collect()
}

/// A GameLib bundle and its Desktop link, written by the real writers. `None` when this host cannot make
/// the link (and this is not CI).
fn gamelib_bundle_and_link(profile: &Profile, title: &str, with_link: bool) -> Option<Planned> {
    let planned = plan(Platform::Mac, &profile.paths, title, None);
    write_mac_app(
        &profile.paths,
        title,
        "plainapp",
        "legendary",
        &profile.paths.shell_exe,
        None,
    )
    .expect("the bundle is written");
    if with_link {
        let desktop = planned.desktop.as_ref().expect("desktop");
        let menu = planned.menu.as_ref().expect("menu");
        match link_desktop(&profile.paths, &desktop.path, &menu.path) {
            Ok(()) => {}
            Err(refused) => {
                assert!(!on_ci(), "cannot create a Desktop symlink on CI: {refused}");
                eprintln!("SKIPPED: cannot create a Desktop symlink locally: {refused}");
                return None;
            }
        }
    }
    Some(planned)
}

#[tokio::test]
async fn a_users_own_same_named_app_survives_and_is_refused() {
    let profile = Profile::new();
    let (ctx, ui) = ctx_for(&profile, Platform::Mac);
    let foo = profile.root().join("Applications").join("Foo.app");
    fs::create_dir_all(foo.join("Contents").join("MacOS")).expect("dirs");
    fs::write(
        foo.join("Contents").join("MacOS").join("run.sh"),
        "#!/bin/bash\necho the user's own launcher\n",
    )
    .expect("run.sh");
    fs::write(foo.join("Contents").join("Info.plist"), "<plist/>\n").expect("plist");

    let out = run(&ctx, remove_args("Foo", false, true)).await;

    assert!(foo.join("Contents").join("MacOS").join("run.sh").exists());
    assert_eq!(
        strings(&out["refused"]),
        BTreeSet::from([foo.to_string_lossy().into_owned()])
    );
    assert_eq!(out["removed"], json!([]));
    assert_eq!(out["existsAfter"], json!(true));
    // Still there: the error notice, not the success one.
    assert_eq!(
        ui.notices(),
        vec![(
            "Shortcuts".to_string(),
            notice::REMOVE_FAILED.default.to_string()
        )]
    );
}

#[tokio::test]
async fn a_proven_bundle_and_its_desktop_link_are_removed_and_the_notice_names_the_desktop() {
    let profile = Profile::new();
    let (ctx, ui) = ctx_for(&profile, Platform::Mac);
    let Some(planned) = gamelib_bundle_and_link(&profile, "Plain Game", true) else {
        return;
    };
    let (desktop, menu) = (
        planned.desktop.expect("desktop").path,
        planned.menu.expect("menu").path,
    );

    let out = run(&ctx, remove_args("Plain Game", false, true)).await;

    assert!(fs::symlink_metadata(&desktop).is_err() && !menu.exists());
    assert_eq!(
        strings(&out["removed"]),
        BTreeSet::from([
            desktop.to_string_lossy().into_owned(),
            menu.to_string_lossy().into_owned()
        ])
    );
    assert_eq!(out["refused"], json!([]));
    assert_eq!(out["existsAfter"], json!(false));
    assert_eq!(
        ui.notices(),
        vec![(
            "Shortcuts".to_string(),
            notice::REMOVED_MAC_DESKTOP.default.to_string()
        )]
    );
}

#[tokio::test]
async fn without_a_desktop_item_the_notice_names_only_the_applications_folder() {
    let profile = Profile::new();
    let (ctx, ui) = ctx_for(&profile, Platform::Mac);
    gamelib_bundle_and_link(&profile, "Plain Game", false).expect("no link needed");

    let out = run(&ctx, remove_args("Plain Game", false, true)).await;

    assert_eq!(out["existsAfter"], json!(false));
    assert_eq!(
        ui.notices(),
        vec![(
            "Shortcuts".to_string(),
            notice::REMOVED_MAC.default.to_string()
        )]
    );
}

#[tokio::test]
async fn the_store_manager_path_removes_and_says_nothing() {
    let profile = Profile::new();
    let (ctx, ui) = ctx_for(&profile, Platform::Mac);
    gamelib_bundle_and_link(&profile, "Plain Game", false).expect("no link needed");

    let out = run(&ctx, remove_args("Plain Game", false, false)).await;

    assert_eq!(out["removed"].as_array().map(Vec::len), Some(1));
    assert!(ui.notices().is_empty());
}

#[tokio::test]
async fn a_dlc_and_a_game_without_a_title_touch_nothing() {
    let profile = Profile::new();
    let (ctx, ui) = ctx_for(&profile, Platform::Mac);
    let planned = gamelib_bundle_and_link(&profile, "Plain Game", false).expect("no link needed");
    let menu = planned.menu.expect("menu").path;

    let dlc = run(&ctx, remove_args("Plain Game", true, true)).await;
    assert!(menu.exists(), "a DLC has no shortcut to remove");
    assert_eq!(dlc["removed"], json!([]));
    // The disk re-check still reports what is there.
    assert_eq!(dlc["existsAfter"], json!(true));

    let untitled = run(&ctx, remove_args("", false, true)).await;
    assert!(menu.exists());
    assert_eq!(untitled["existsAfter"], json!(false));
    assert_eq!(ui.notices().len(), 2);
}

#[test]
fn a_failed_delete_is_refused_not_swallowed() {
    // A proven bundle whose trust root is not its folder: the safety library refuses and nothing is deleted.
    let profile = Profile::new();
    let planned = gamelib_bundle_and_link(&profile, "Plain Game", false).expect("no link needed");
    let menu = planned.menu.expect("menu");
    let wrong_root = Planned {
        desktop: None,
        menu: Some(Shortcut {
            path: menu.path.clone(),
            trust_root: profile.root().join("Elsewhere"),
        }),
    };
    let outcome = remove_shortcut_files(Platform::Mac, &wrong_root);
    assert!(menu.path.exists());
    assert_eq!(outcome.refused, vec![menu.path]);
    assert!(outcome.removed.is_empty());
}

#[tokio::test]
async fn bad_arguments_answer_a_fixed_literal() {
    let profile = Profile::new();
    let (ctx, _) = ctx_for(&profile, Platform::Mac);
    let want = Err("shortcuts_remove:bad-args".to_string());
    let call = |args: Vec<Value>| {
        let ctx = &ctx;
        async move { gamelib_shortcuts::dispatch("shortcuts_remove", &args, ctx).await }
    };
    assert_eq!(call(vec![]).await, want);
    // `notify` is required: a caller that forgets it does not silently get a quiet or a loud op.
    let mut no_notify = remove_args("T", false, true);
    no_notify.as_object_mut().expect("object").remove("notify");
    assert_eq!(call(vec![no_notify]).await, want);
    let mut extra = remove_args("T", false, true);
    extra["secret-text"] = json!("x");
    assert_eq!(call(vec![extra]).await, want);
}

#[test]
fn every_notice_resolves_in_the_shipped_english_catalog_to_the_ts_default() {
    let catalog = Catalog::load(&locales_dir(), "en");
    for text in [
        notice::TITLE,
        notice::ADDED,
        notice::ADDED_MAC,
        notice::ADDED_MAC_DESKTOP,
        notice::ADD_FAILED,
        notice::REMOVED,
        notice::REMOVED_MAC,
        notice::REMOVED_MAC_DESKTOP,
        notice::REMOVE_FAILED,
    ] {
        let got = catalog.t(text.key, "MISSING-FROM-CATALOG", &serde_json::Map::new());
        assert_eq!(got, text.default, "{}", text.key);
    }
}
