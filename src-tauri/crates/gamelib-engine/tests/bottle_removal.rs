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

use gamelib_core::process::{BoxFuture, LineSink, ProcSpec, SpecOutput, SpecRunner};
use gamelib_engine::bottles::lifecycle::CX_CREATE_CAP_MS;
use gamelib_engine::bottles::registry::EngineSelection;
use gamelib_engine::ctx::{EngineCtx, Platform};
use gamelib_engine::testing::{RecordedSpawn, RecordingLog, ScriptedSpecRunner};
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

// ---- 87-66 task 2: refusals, the running check, the wineserver stop and the CrossOver delete ----

const CX_BIN: &str = "/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin";
const CX_ROOT: &str = "/Applications/CrossOver.app/Contents/SharedSupport/CrossOver";

fn crossover_marker() -> String {
    format!(
        r#"{{"kind":"crossover","id":"crossover","wineserverBin":"{CX_BIN}/wineserver","version":1}}"#
    )
}

fn ok() -> SpecOutput {
    SpecOutput {
        code: Some(0),
        ..SpecOutput::default()
    }
}

/// The scripted runner a CrossOver removal expects: the wineserver kill and `cxbottle --delete`.
fn crossover_runner(name: &str) -> Arc<ScriptedSpecRunner> {
    Arc::new(
        ScriptedSpecRunner::new(Vec::new())
            .on(&format!("{CX_BIN}/wineserver"), &["-k"], ok())
            .on(
                &format!("{CX_BIN}/cxbottle"),
                &["--bottle", name, "--delete", "--force"],
                ok(),
            ),
    )
}

impl World {
    /// A context over `runner`, with CrossOver found at [`CX_BIN`] when `crossover` is set.
    fn ctx_over(&self, runner: Arc<dyn SpecRunner>, crossover: bool) -> EngineCtx {
        let ctx = self.profile.ctx_with(self.log.clone(), Some(runner));
        if !crossover {
            return ctx;
        }
        ctx.with_crossover_bin_dir(Arc::new(|| Box::pin(async { Some(CX_BIN.to_string()) })))
    }

    fn set_marker(&self, name: &str, marker: &str) {
        seed(&self.bottle(name).join(".gamelib-engine.json"), marker);
    }
}

fn idle() -> Arc<ScriptedSpecRunner> {
    Arc::new(ScriptedSpecRunner::new(Vec::new()))
}

async fn run_in(ctx: &EngineCtx, arg: Value) -> Result<Value, String> {
    dispatch(OP, &[arg], ctx).await
}

fn programs(spawns: &[RecordedSpawn]) -> Vec<String> {
    spawns
        .iter()
        .map(|s| format!("{} {}", s.program, s.argv.join(" ")))
        .collect()
}

#[tokio::test]
async fn a_game_running_in_the_bottle_per_the_ledger_is_in_use() {
    let world = World::new();
    world.set_marker(GAME_BOTTLE, &crossover_marker());
    let runner = crossover_runner(GAME_BOTTLE);
    let ctx = world.ctx_over(runner.clone(), true);
    assert!(ctx.ledger.mark_game_running(None, GAME_BOTTLE, "gog:9999"));
    let game = tree(&world.bottle(GAME_BOTTLE));
    let siblings = world.siblings();

    let reply = run_in(&ctx, args(Some(GAME_BOTTLE))).await.unwrap();

    assert_eq!(reply, json!({"outcome": "refused", "reason": "in-use"}));
    assert!(runner.spawns().is_empty());
    assert_eq!(tree(&world.bottle(GAME_BOTTLE)), game);
    assert_eq!(world.siblings(), siblings);
}

#[tokio::test]
async fn a_live_selection_for_the_key_is_in_use() {
    let world = World::new();
    world.set_marker(GAME_BOTTLE, &crossover_marker());
    let runner = crossover_runner(GAME_BOTTLE);
    let ctx = world.ctx_over(runner.clone(), true);
    assert!(ctx.registry.set_engine_selection(
        None,
        "gog:1234",
        EngineSelection::Crossover {
            reason: "test".to_string(),
            crossover_build: None,
            bin_dir: CX_BIN.to_string(),
        },
    ));
    let game = tree(&world.bottle(GAME_BOTTLE));

    let reply = run_in(&ctx, args(Some(GAME_BOTTLE))).await.unwrap();

    assert_eq!(reply, json!({"outcome": "refused", "reason": "in-use"}));
    assert!(runner.spawns().is_empty());
    assert_eq!(tree(&world.bottle(GAME_BOTTLE)), game);
}

#[tokio::test]
async fn a_guard_that_says_no_refuses_before_any_spawn() {
    let world = World::new();
    world.set_marker(GAME_BOTTLE, &crossover_marker());
    let runner = crossover_runner(GAME_BOTTLE);
    let ctx = world.ctx_over(runner.clone(), true);
    let game = tree(&world.bottle(GAME_BOTTLE));
    let siblings = world.siblings();
    // Another library entry's install sits inside this bottle: the guard names the sibling.
    let mut arg = args(Some(GAME_BOTTLE));
    arg["knownInstalls"] = json!([{
        "key": "gog:999",
        "path": world.bottle(GAME_BOTTLE).join("drive_c/Games/Other").to_string_lossy(),
    }]);

    let reply = run_in(&ctx, arg).await.unwrap();

    assert_eq!(reply["outcome"], "refused");
    assert_eq!(reply["otherKey"], "gog:999");
    assert!(
        runner.spawns().is_empty(),
        "{:?}",
        programs(&runner.spawns())
    );
    assert_eq!(tree(&world.bottle(GAME_BOTTLE)), game);
    assert_eq!(world.siblings(), siblings);
}

#[tokio::test]
async fn a_guard_that_cannot_tell_refuses_before_any_spawn() {
    let world = World::new();
    world.set_marker(GAME_BOTTLE, &crossover_marker());
    let runner = crossover_runner(GAME_BOTTLE);
    let ctx = world.ctx_over(runner.clone(), true);
    let game = tree(&world.bottle(GAME_BOTTLE));
    let mut arg = args(Some(GAME_BOTTLE));
    arg.as_object_mut().unwrap().remove("knownInstalls");

    let reply = run_in(&ctx, arg).await.unwrap();

    assert_eq!(
        reply,
        json!({"outcome": "refused", "reason": "known-installs-unreadable"})
    );
    assert!(runner.spawns().is_empty());
    assert_eq!(tree(&world.bottle(GAME_BOTTLE)), game);
}

#[tokio::test]
async fn a_crossover_bottle_is_stopped_then_deleted_by_cxbottle_then_swept_by_the_guard() {
    let world = World::new();
    world.set_marker(GAME_BOTTLE, &crossover_marker());
    let runner = crossover_runner(GAME_BOTTLE);
    let ctx = world.ctx_over(runner.clone(), true);
    let siblings = world.siblings();

    let reply = run_in(&ctx, args(Some(GAME_BOTTLE))).await.unwrap();

    assert_eq!(reply, json!({"outcome": "removed"}));
    let spawns = runner.spawns();
    assert_eq!(
        programs(&spawns),
        [
            format!("{CX_BIN}/wineserver -k"),
            format!("{CX_BIN}/cxbottle --bottle {GAME_BOTTLE} --delete --force"),
        ]
    );
    let bottle = world.bottle(GAME_BOTTLE).to_string_lossy().into_owned();
    assert_eq!(spawns[0].env_set.get("WINEPREFIX"), Some(&bottle));
    assert_eq!(
        spawns[0].env_set.get("CX_ROOT").map(String::as_str),
        Some(CX_ROOT)
    );
    // Both are capped helper spawns; the delete's cap is at most the create cap.
    assert!(spawns[0].timeout.is_some());
    let cap = spawns[1].timeout.expect("the cxbottle delete is capped");
    assert!(cap.as_millis() as u64 <= CX_CREATE_CAP_MS);
    // The scripted cxbottle deleted nothing, so the guarded delete took the directory.
    assert!(!world.bottle(GAME_BOTTLE).exists());
    assert_eq!(world.siblings(), siblings);
    assert!(runner.unscripted().is_empty());
}

/// A runner whose `cxbottle` really deletes the bottle directory, as CrossOver does.
struct DeletingCxbottle {
    inner: Arc<ScriptedSpecRunner>,
    dir: std::path::PathBuf,
}

impl SpecRunner for DeletingCxbottle {
    fn run(&self, spec: ProcSpec, on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
        if spec.program.ends_with("/cxbottle") {
            std::fs::remove_dir_all(&self.dir).unwrap();
        }
        self.inner.run(spec, on_line)
    }
}

#[tokio::test]
async fn a_bottle_cxbottle_already_deleted_is_removed_without_a_second_delete() {
    let world = World::new();
    world.set_marker(GAME_BOTTLE, &crossover_marker());
    let inner = crossover_runner(GAME_BOTTLE);
    let runner = Arc::new(DeletingCxbottle {
        inner: inner.clone(),
        dir: world.bottle(GAME_BOTTLE),
    });
    let ctx = world.ctx_over(runner, true);
    let siblings = world.siblings();

    let reply = run_in(&ctx, args(Some(GAME_BOTTLE))).await.unwrap();

    assert_eq!(reply, json!({"outcome": "removed"}));
    assert_eq!(inner.spawns().len(), 2);
    assert_eq!(world.siblings(), siblings);
}

#[tokio::test]
async fn failing_wineserver_and_cxbottle_runs_still_end_in_a_guarded_delete() {
    let world = World::new();
    world.set_marker(GAME_BOTTLE, &crossover_marker());
    // Nothing is scripted: both spawns answer "could not start".
    let runner = idle();
    let ctx = world.ctx_over(runner.clone(), true);
    let siblings = world.siblings();

    let reply = run_in(&ctx, args(Some(GAME_BOTTLE))).await.unwrap();

    assert_eq!(reply, json!({"outcome": "removed"}));
    assert_eq!(runner.spawns().len(), 2);
    assert!(!world.bottle(GAME_BOTTLE).exists());
    assert_eq!(world.siblings(), siblings);
}

#[tokio::test]
async fn a_crossover_bottle_without_crossover_present_is_deleted_by_the_guard_alone() {
    let world = World::new();
    world.set_marker(GAME_BOTTLE, &crossover_marker());
    let runner = idle();
    let ctx = world.ctx_over(runner.clone(), false);
    let siblings = world.siblings();

    let reply = run_in(&ctx, args(Some(GAME_BOTTLE))).await.unwrap();

    assert_eq!(reply, json!({"outcome": "removed"}));
    assert!(runner.spawns().is_empty());
    assert!(!world.bottle(GAME_BOTTLE).exists());
    assert_eq!(world.siblings(), siblings);
}

#[tokio::test]
async fn a_pinned_bottle_stops_its_own_wineserver_and_never_runs_cxbottle() {
    let world = World::new();
    let wineserver = format!(
        "{}/steam-engines/wine-staging-11.20/Contents/Resources/wine/bin/wineserver",
        world.profile.tools.to_string_lossy()
    );
    let runner = Arc::new(ScriptedSpecRunner::new(Vec::new()).on(&wineserver, &["-k"], ok()));
    // CrossOver is present, and still is not used for a pinned bottle.
    let ctx = world.ctx_over(runner.clone(), true);
    let siblings = world.siblings();

    let reply = run_in(&ctx, args(Some(GAME_BOTTLE))).await.unwrap();

    assert_eq!(reply, json!({"outcome": "removed"}));
    assert_eq!(programs(&runner.spawns()), [format!("{wineserver} -k")]);
    assert!(!world.bottle(GAME_BOTTLE).exists());
    assert_eq!(world.siblings(), siblings);
}

#[tokio::test]
async fn a_pinned_marker_naming_a_wineserver_outside_the_engine_root_is_not_run() {
    let world = World::new();
    world.set_marker(
        GAME_BOTTLE,
        r#"{"kind":"pinned","id":"wine-staging-11.20","wineserverBin":"/usr/bin/evil/wineserver","version":1}"#,
    );
    let runner = idle();
    let ctx = world.ctx_over(runner.clone(), true);

    let reply = run_in(&ctx, args(Some(GAME_BOTTLE))).await.unwrap();

    assert_eq!(reply, json!({"outcome": "removed"}));
    assert!(runner.spawns().is_empty());
}

#[tokio::test]
async fn a_bottle_without_a_marker_spawns_nothing() {
    let world = World::new();
    std::fs::remove_file(world.bottle(GAME_BOTTLE).join(".gamelib-engine.json")).unwrap();
    let runner = idle();
    let ctx = world.ctx_over(runner.clone(), true);
    let siblings = world.siblings();

    let reply = run_in(&ctx, args(Some(GAME_BOTTLE))).await.unwrap();

    assert_eq!(reply, json!({"outcome": "removed"}));
    assert!(runner.spawns().is_empty());
    assert_eq!(world.siblings(), siblings);
}

#[tokio::test]
async fn a_symlink_at_the_bottles_place_is_unlinked_and_the_sibling_is_untouched() {
    let world = World::new();
    // The sibling is a CrossOver bottle, so a stray wineserver stop or cxbottle run would hit it.
    world.set_marker(OTHER_BOTTLE, &crossover_marker());
    std::fs::remove_dir_all(world.bottle(GAME_BOTTLE)).unwrap();
    std::os::unix::fs::symlink(world.bottle(OTHER_BOTTLE), world.bottle(GAME_BOTTLE)).unwrap();
    let runner = crossover_runner(GAME_BOTTLE);
    let ctx = world.ctx_over(runner.clone(), true);
    let siblings = world.siblings();

    let reply = run_in(&ctx, args(Some(GAME_BOTTLE))).await.unwrap();

    assert_eq!(reply, json!({"outcome": "removed"}));
    assert!(
        runner.spawns().is_empty(),
        "{:?}",
        programs(&runner.spawns())
    );
    assert!(std::fs::symlink_metadata(world.bottle(GAME_BOTTLE)).is_err());
    assert_eq!(world.siblings(), siblings);
}

#[tokio::test]
async fn a_link_inside_the_bottle_aimed_at_a_sibling_is_unlinked_not_followed() {
    let world = World::new();
    std::os::unix::fs::symlink(
        world.bottle(OTHER_BOTTLE),
        world.bottle(GAME_BOTTLE).join("drive_c/escape"),
    )
    .unwrap();
    let siblings = world.siblings();

    let reply = run(&world, args(Some(GAME_BOTTLE))).await.unwrap();

    assert_eq!(reply, json!({"outcome": "removed"}));
    assert!(!world.bottle(GAME_BOTTLE).exists());
    assert_eq!(world.siblings(), siblings);
}

#[tokio::test]
async fn bottles_whose_names_merely_resemble_the_games_are_untouched() {
    let world = World::new();
    let marker = pinned_marker(&world.profile);
    let lookalikes = [
        "GameLib-gog-123",
        "GameLib-gog-12345",
        "GameLib-gog-1234-x",
        "GameLib-gog-1234.bak",
        "GameLib-gog-_31234",
        "GameLib-steam-1234",
        "GameLib-nile-1234",
    ];
    for name in lookalikes {
        make_bottle(&world.profile, name, &marker);
    }
    let before: Vec<_> = lookalikes.iter().map(|n| tree(&world.bottle(n))).collect();
    let siblings = world.siblings();

    let reply = run(&world, args(Some(GAME_BOTTLE))).await.unwrap();

    assert_eq!(reply, json!({"outcome": "removed"}));
    let after: Vec<_> = lookalikes.iter().map(|n| tree(&world.bottle(n))).collect();
    assert_eq!(after, before);
    assert_eq!(world.siblings(), siblings);
}

#[tokio::test]
async fn nfc_and_nfd_spellings_of_an_app_name_are_different_bottles() {
    let nfc = "\u{e9}"; // e with acute, one code point
    let nfd = "e\u{301}"; // e then a combining acute
    for (target, other) in [(nfc, nfd), (nfd, nfc)] {
        let world = World::new();
        let marker = pinned_marker(&world.profile);
        let name_of = |app: &str| {
            gamelib_engine::game_engine::per_game_bottle_name("gog", app).expect("a clean name")
        };
        let (target_bottle, other_bottle) = (name_of(target), name_of(other));
        assert_ne!(target_bottle, other_bottle);
        make_bottle(&world.profile, &target_bottle, &marker);
        make_bottle(&world.profile, &other_bottle, &marker);
        let other_before = tree(&world.bottle(&other_bottle));
        let siblings = world.siblings();
        let mut arg = args(Some(&target_bottle));
        arg["appName"] = json!(target);

        let reply = run(&world, arg).await.unwrap();

        assert_eq!(reply, json!({"outcome": "removed"}));
        assert!(!world.bottle(&target_bottle).exists());
        assert_eq!(tree(&world.bottle(&other_bottle)), other_before);
        assert_eq!(world.siblings(), siblings);
    }
}

#[tokio::test]
async fn a_case_variant_of_the_name_never_costs_a_sibling_its_bytes() {
    let world = World::new();
    let marker = pinned_marker(&world.profile);
    // The game's own bottle is absent; only a spelling that differs in case exists.
    std::fs::remove_dir_all(world.bottle(GAME_BOTTLE)).unwrap();
    let variant = "GAMELIB-GOG-1234";
    make_bottle(&world.profile, variant, &marker);
    let case_sensitive = !world.bottle(GAME_BOTTLE).exists();
    let variant_before = tree(&world.bottle(variant));
    let siblings = world.siblings();

    let reply = run(&world, args(Some(GAME_BOTTLE))).await.unwrap();

    assert_eq!(world.siblings(), siblings);
    if case_sensitive {
        // Two different directories: the variant is another bottle and is left alone.
        assert_eq!(reply, json!({"outcome": "removed"}));
        assert_eq!(tree(&world.bottle(variant)), variant_before);
    } else {
        // One directory under two spellings: the guard either removes it as the game's own or
        // refuses; it never answers anything else.
        let outcome = reply["outcome"].as_str().unwrap().to_string();
        assert!(
            ["removed", "refused"].contains(&outcome.as_str()),
            "{reply}"
        );
    }
}

#[tokio::test]
async fn names_that_climb_or_name_the_root_are_not_bottle_backed_and_delete_nothing() {
    for stored in [
        "..",
        ".",
        "../GameLib",
        "GameLib-gog-1234/..",
        "GameLib/../GameLib-gog-1234",
        "/etc",
    ] {
        let world = World::new();
        let runner = crossover_runner(GAME_BOTTLE);
        let ctx = world.ctx_over(runner.clone(), true);
        let before = (tree(&world.bottle(GAME_BOTTLE)), world.siblings());

        let reply = run_in(&ctx, args(Some(stored))).await.unwrap();

        assert_eq!(reply, json!({"outcome": "not-bottle-backed"}), "{stored}");
        assert!(runner.spawns().is_empty(), "{stored}");
        assert_eq!(
            (tree(&world.bottle(GAME_BOTTLE)), world.siblings()),
            before,
            "{stored}"
        );
    }
}

#[tokio::test]
async fn a_host_that_is_not_macos_answers_not_bottle_backed() {
    for platform in [Platform::Linux, Platform::Windows] {
        let world = World::new();
        let runner = crossover_runner(GAME_BOTTLE);
        let mut ctx = world.ctx_over(runner.clone(), true);
        ctx.platform = platform;
        let before = (tree(&world.bottle(GAME_BOTTLE)), world.siblings());

        let reply = run_in(&ctx, args(Some(GAME_BOTTLE))).await.unwrap();

        assert_eq!(reply, json!({"outcome": "not-bottle-backed"}));
        assert!(runner.spawns().is_empty());
        assert_eq!((tree(&world.bottle(GAME_BOTTLE)), world.siblings()), before);
    }
}
