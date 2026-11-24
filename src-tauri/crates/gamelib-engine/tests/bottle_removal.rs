//! Op `engine_bottle_remove_per_game` through `gamelib_engine::dispatch` (87-66, F5, D-19, FND-02):
//! a non-Steam game's own per-game bottle is removed, decided in Rust from the game's identity and
//! its stored `wineCrossoverBottle`, and a sibling bottle is never touched. Every case drives the
//! crate's dispatch and compares a tree hash of the sibling bottles taken before and after, so "never
//! reaches a sibling" is a byte comparison and not an absence of a log line. POSIX only: the bottles
//! live under a macOS-shaped profile and the symlink cases need `std::os::unix`.
#![cfg(unix)]

mod common;

use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::sync::Arc;

use gamelib_engine::testing::{RecordingLog, ScriptedSpecRunner};
use gamelib_engine::{dispatch, OPS};
use serde_json::{json, Value};

use common::{sha256_hex, Profile};

const OP: &str = "engine_bottle_remove_per_game";
/// The game's own per-game bottle (`gog`, `1234`).
const GAME_BOTTLE: &str = "GameLib-gog-1234";
/// Another game's per-game bottle.
const OTHER_BOTTLE: &str = "GameLib-gog-5678";
/// The shared CrossOver bottle.
const SHARED_BOTTLE: &str = "GameLib";

/// Every entry under `root` as `path|kind|mode|sha256-or-link-target`, sorted: two trees are equal
/// exactly when every path, kind, mode, file content and link target is.
fn tree(root: &Path) -> Vec<String> {
    fn walk(base: &Path, dir: &Path, out: &mut Vec<String>) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let rel = path
                .strip_prefix(base)
                .unwrap()
                .to_string_lossy()
                .into_owned();
            let meta = std::fs::symlink_metadata(&path).unwrap();
            let mode = meta.permissions().mode() & 0o7777;
            if meta.file_type().is_symlink() {
                let target = std::fs::read_link(&path).unwrap();
                out.push(format!("{rel}|link|{mode:o}|{}", target.to_string_lossy()));
            } else if meta.is_dir() {
                out.push(format!("{rel}|dir|{mode:o}|"));
                walk(base, &path, out);
            } else {
                let bytes = std::fs::read(&path).unwrap();
                out.push(format!("{rel}|file|{mode:o}|{}", sha256_hex(&bytes)));
            }
        }
    }
    let mut out = Vec::new();
    walk(root, root, &mut out);
    out.sort();
    out
}

fn seed(path: &Path, text: &str) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, text).unwrap();
}

/// A bottle with files of its own and a marker naming the pinned engine, so no CrossOver is needed.
fn make_bottle(profile: &Profile, name: &str, marker: &str) {
    let dir = profile.bottles_root().join(name);
    seed(
        &dir.join("cxbottle.conf"),
        &format!("[Bottle]\nname={name}\n"),
    );
    seed(&dir.join("system.reg"), &format!("reg of {name}"));
    seed(&dir.join("drive_c/users/crossover/save.dat"), name);
    seed(&dir.join(".gamelib-engine.json"), marker);
}

fn pinned_marker(profile: &Profile) -> String {
    format!(
        r#"{{"kind":"pinned","id":"wine-staging-11.20","wineserverBin":"{}/steam-engines/wine-staging-11.20/Contents/Resources/wine/bin/wineserver","version":1}}"#,
        profile.tools.to_string_lossy()
    )
}

fn args(stored_bottle: Option<&str>) -> Value {
    let stored = match stored_bottle {
        Some(name) => json!({"wineCrossoverBottle": name, "wineVersion": {"name": "x"}}),
        None => json!({}),
    };
    json!({
        "runner": "gog",
        "appName": "1234",
        "stored": stored,
        "knownInstalls": [],
        "selfKey": "gog:1234",
        "protectedRoots": [],
    })
}

struct World {
    profile: Profile,
    log: Arc<RecordingLog>,
}

impl World {
    /// The game's bottle, another game's bottle and the shared bottle, all on the pinned engine.
    fn new() -> World {
        let profile = Profile::new();
        let marker = pinned_marker(&profile);
        for name in [GAME_BOTTLE, OTHER_BOTTLE, SHARED_BOTTLE] {
            make_bottle(&profile, name, &marker);
        }
        World {
            profile,
            log: Arc::new(RecordingLog::new()),
        }
    }

    fn ctx(&self) -> gamelib_engine::ctx::EngineCtx {
        let runner = Arc::new(ScriptedSpecRunner::new(Vec::new()));
        self.profile.ctx_with(self.log.clone(), Some(runner))
    }

    fn bottle(&self, name: &str) -> std::path::PathBuf {
        self.profile.bottles_root().join(name)
    }

    /// The trees of every bottle but the game's own.
    fn siblings(&self) -> Vec<(String, Vec<String>)> {
        [OTHER_BOTTLE, SHARED_BOTTLE]
            .iter()
            .map(|n| (n.to_string(), tree(&self.bottle(n))))
            .collect()
    }
}

async fn run(world: &World, arg: Value) -> Result<Value, String> {
    dispatch(OP, &[arg], &world.ctx()).await
}

#[test]
fn the_op_is_registered_once() {
    assert_eq!(OPS.iter().filter(|o| **o == OP).count(), 1);
}

#[tokio::test]
async fn the_games_own_bottle_is_removed_and_a_sibling_is_byte_identical() {
    let world = World::new();
    let siblings = world.siblings();
    let game_before = tree(&world.bottle(GAME_BOTTLE));
    assert!(!game_before.is_empty());

    let reply = run(&world, args(Some(GAME_BOTTLE))).await.unwrap();

    assert_eq!(reply, json!({"outcome": "removed"}));
    assert!(!world.bottle(GAME_BOTTLE).exists());
    assert_eq!(world.siblings(), siblings);
    assert!(world.profile.bottles_root().is_dir());
}

#[tokio::test]
async fn an_absent_bottle_counts_as_removed() {
    let world = World::new();
    std::fs::remove_dir_all(world.bottle(GAME_BOTTLE)).unwrap();
    let siblings = world.siblings();

    let reply = run(&world, args(Some(GAME_BOTTLE))).await.unwrap();

    assert_eq!(reply, json!({"outcome": "removed"}));
    assert_eq!(world.siblings(), siblings);
}

#[tokio::test]
async fn the_shared_bottle_and_another_games_bottle_are_never_targets() {
    for stored in [
        Some(SHARED_BOTTLE),
        Some(OTHER_BOTTLE),
        None,
        Some(""),
        Some(".."),
    ] {
        let world = World::new();
        let game = tree(&world.bottle(GAME_BOTTLE));
        let siblings = world.siblings();

        let reply = run(&world, args(stored)).await.unwrap();

        assert_eq!(reply, json!({"outcome": "not-bottle-backed"}), "{stored:?}");
        assert_eq!(tree(&world.bottle(GAME_BOTTLE)), game, "{stored:?}");
        assert_eq!(world.siblings(), siblings, "{stored:?}");
    }
}

#[tokio::test]
async fn a_non_string_stored_bottle_is_not_a_target() {
    let world = World::new();
    let game = tree(&world.bottle(GAME_BOTTLE));
    let mut arg = args(None);
    arg["stored"] = json!({"wineCrossoverBottle": 7});

    let reply = run(&world, arg).await.unwrap();

    assert_eq!(reply, json!({"outcome": "not-bottle-backed"}));
    assert_eq!(tree(&world.bottle(GAME_BOTTLE)), game);
}

#[tokio::test]
async fn a_steam_title_and_an_unknown_runner_have_no_per_game_bottle() {
    for (runner, app) in [("steam", "620"), ("nope", "1"), ("gog", "a..b")] {
        let world = World::new();
        let before = (tree(&world.bottle(GAME_BOTTLE)), world.siblings());
        let mut arg = args(Some(GAME_BOTTLE));
        arg["runner"] = json!(runner);
        arg["appName"] = json!(app);

        let reply = run(&world, arg).await.unwrap();

        assert_eq!(reply, json!({"outcome": "not-bottle-backed"}), "{runner}");
        assert_eq!(
            (tree(&world.bottle(GAME_BOTTLE)), world.siblings()),
            before,
            "{runner}"
        );
    }
}

#[tokio::test]
async fn an_unknown_request_key_is_bad_args() {
    let world = World::new();
    let mut arg = args(Some(GAME_BOTTLE));
    arg["bottleName"] = json!(GAME_BOTTLE);

    assert_eq!(
        run(&world, arg).await.unwrap_err(),
        "engine_bottle_remove_per_game:bad-args"
    );
    assert!(world.bottle(GAME_BOTTLE).exists());
    let two = dispatch(OP, &[args(None), args(None)], &world.ctx()).await;
    assert_eq!(two.unwrap_err(), "engine_bottle_remove_per_game:bad-args");
}

#[tokio::test]
async fn known_installs_absent_makes_the_guard_unknown_and_nothing_changes() {
    let world = World::new();
    let game = tree(&world.bottle(GAME_BOTTLE));
    let siblings = world.siblings();
    let mut arg = args(Some(GAME_BOTTLE));
    arg.as_object_mut().unwrap().remove("knownInstalls");

    let reply = run(&world, arg).await.unwrap();

    assert_eq!(
        reply,
        json!({"outcome": "refused", "reason": "known-installs-unreadable"})
    );
    assert_eq!(tree(&world.bottle(GAME_BOTTLE)), game);
    assert_eq!(world.siblings(), siblings);
}
