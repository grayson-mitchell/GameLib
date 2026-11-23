//! The incident tests of the engine switch, ported from the TS `legacyBottleUntouched.test.ts` and the
//! sibling-safe removal case of the bottles oracle (87-41; D-08): behaviours a past incident made
//! the engine promise, replayed over a fake HOME with no child process (the wineserver stop and the
//! DXVK installer are scripted seams).
//!
//! - **`legacyBottleUntouched` (61-14, D-02, D-04, D-05, D-06):** a bottle made before the engine marker
//!   existed (the legacy shared GameLib bottle, one the user picked) is left byte-identical by a launch
//!   that selects the engine it already runs on; the only file a switch may add is the engine marker.
//!   A refused switch leaves it byte-identical, marker included, and a plain prefix outside the
//!   Bottles root is not a bottle the switch can touch at all.
//! - **Sibling-safe removal (59-25, D-19):** removing or switching one game's bottle leaves a sibling
//!   game's bottle, its `.gamelib-engine.json` and its files byte-identical.
//!
//! The TS file also ran `selectEngineForLaunch` and `resolveGamePrefix`; those are the launch plans'
//! (87-42, 87-43) and carry their own incident tests. Its assertions on the TS source text are
//! dropped (D-08).
#![cfg(unix)]

mod common;

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use gamelib_core::clock::SystemClock;
use gamelib_core::process::SpecOutput;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::bottles::lifecycle::{remove_created_bottle_dir, RemoveCreated};
use gamelib_engine::bottles::paths::bottle_dir;
use gamelib_engine::bottles::registry::EngineSelection;
use gamelib_engine::bottles::switch::{
    prepare_bottle_for_engine, MonitorPhase, OwnBottle, PrepareArgs, PrepareOutcome, PrepareReason,
};
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::engines::{DxvkBuild, NonCrossoverEngine};
use gamelib_engine::testing::{RecordingLog, ScriptedDxvk, ScriptedSpecRunner};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;

use common::sha256_hex;

const KEY: &str = "gog:1234";
const MARKER_FILE: &str = ".gamelib-engine.json";
const CX_BIN: &str = "/cx/bin";

struct Rig {
    home: FakeHome,
    ctx: EngineCtx,
    runner: Arc<ScriptedSpecRunner>,
    dxvk: Arc<ScriptedDxvk>,
}

fn rig() -> Rig {
    let home = FakeHome::new("switch-incidents-");
    let root = home.root().to_path_buf();
    let runner = Arc::new(ScriptedSpecRunner::new(Vec::new()).on_program(
        &format!("{CX_BIN}/wineserver"),
        SpecOutput {
            code: Some(0),
            ..SpecOutput::default()
        },
    ));
    let dxvk = Arc::new(ScriptedDxvk::new(&[true]));
    let ctx = EngineCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        Platform::Mac,
        EnginePaths {
            app_folder: root.clone(),
            user_data: root.clone(),
            tools_path: root.join("tools"),
            user_home: root.join("home"),
            temp: root.join("temp"),
        },
        Shutdown::new(),
    )
    .with_proc(runner.clone())
    .with_dxvk(dxvk.clone())
    .with_log(Arc::new(RecordingLog::new()))
    .with_crossover_bin_dir(Arc::new(|| Box::pin(async { Some(CX_BIN.to_string()) })));
    Rig {
        home,
        ctx,
        runner,
        dxvk,
    }
}

impl Rig {
    fn bottle(&self, name: &str) -> PathBuf {
        PathBuf::from(bottle_dir(&self.home.root().join("home"), name))
    }

    /// A bottle as 61-14's `populate` made it: a prefix with a game's save data, a file another game
    /// wrote and a `cxbottle.conf` (with CrossOver's Timestamp or without).
    fn populate(&self, name: &str, with_timestamp: bool) -> PathBuf {
        let dir = self.bottle(name);
        let tag = name;
        for sub in [
            "drive_c/users/crossover".to_string(),
            format!("drive_c/Games/game-{tag}"),
        ] {
            std::fs::create_dir_all(dir.join(sub)).unwrap();
        }
        std::fs::write(dir.join("user.reg"), format!("WINE REGISTRY {tag} user")).unwrap();
        std::fs::write(
            dir.join("system.reg"),
            format!("WINE REGISTRY {tag} system"),
        )
        .unwrap();
        std::fs::write(
            dir.join(format!("drive_c/Games/game-{tag}/save.dat")),
            [0u8, 1, 2, 3, 250, tag.len() as u8],
        )
        .unwrap();
        std::fs::write(
            dir.join("drive_c/Games/shared.cfg"),
            "written by another game",
        )
        .unwrap();
        std::fs::write(dir.join("drive_c/Games/other-game.sav"), "other").unwrap();
        std::fs::write(
            dir.join("cxbottle.conf"),
            if with_timestamp {
                "[Bottle]\nTimestamp=1\n"
            } else {
                "[Bottle]\n"
            },
        )
        .unwrap();
        dir
    }

    fn crossover() -> EngineSelection {
        EngineSelection::Crossover {
            reason: "cx-healthy".to_string(),
            crossover_build: Some("26.0.0.1".to_string()),
            bin_dir: CX_BIN.to_string(),
        }
    }

    fn pinned(&self) -> EngineSelection {
        let tools = self.home.root().join("tools/steam-engines");
        let bin = tools.join("p1/Contents/Resources/wine/bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join("wine"), "").unwrap();
        std::fs::write(bin.join("wineserver"), "").unwrap();
        EngineSelection::Pinned {
            pin_id: "p1".to_string(),
            reason: "override".to_string(),
            engine: NonCrossoverEngine {
                wine_bin: bin.join("wine").to_string_lossy().into_owned(),
                wineserver_bin: bin.join("wineserver").to_string_lossy().into_owned(),
                label: "Pin One".to_string(),
                version: "10.0".to_string(),
                dxvk: Some(DxvkBuild {
                    dir: tools.join("dxvk").to_string_lossy().into_owned(),
                    version: "v1".to_string(),
                }),
            },
        }
    }

    /// Nothing was stopped and no DXVK was installed or removed.
    fn assert_nothing_ran(&self) {
        assert!(
            self.runner.spawns().is_empty(),
            "{:?}",
            self.runner.spawns()
        );
        assert!(self.dxvk.requests().is_empty());
    }
}

/// `snapshot`: every entry under `root` as its relative path and what it holds (a directory, a
/// symlink and its target, or a file and its sha256), with the engine marker left out when asked.
fn snapshot(root: &Path, skip_marker: bool) -> BTreeMap<String, String> {
    fn walk(root: &Path, dir: &Path, skip_marker: bool, out: &mut BTreeMap<String, String>) {
        for entry in std::fs::read_dir(dir).unwrap() {
            let entry = entry.unwrap();
            let path = entry.path();
            let rel = path
                .strip_prefix(root)
                .unwrap()
                .to_string_lossy()
                .into_owned();
            if skip_marker && entry.file_name() == MARKER_FILE {
                continue;
            }
            let kind = std::fs::symlink_metadata(&path).unwrap().file_type();
            if kind.is_symlink() {
                let target = std::fs::read_link(&path).unwrap();
                out.insert(rel, format!("symlink:{}", target.display()));
            } else if kind.is_dir() {
                out.insert(rel, "dir".to_string());
                walk(root, &path, skip_marker, out);
            } else {
                out.insert(
                    rel,
                    format!("file:{}", sha256_hex(&std::fs::read(&path).unwrap())),
                );
            }
        }
    }
    let mut out = BTreeMap::new();
    walk(root, root, skip_marker, &mut out);
    out
}

fn refusal_reason(outcome: &PrepareOutcome) -> Option<PrepareReason> {
    match outcome {
        PrepareOutcome::Refused { reason, .. } => Some(*reason),
        PrepareOutcome::Prepared => None,
    }
}

/// 61-14 D-02, D-05: the legacy shared GameLib bottle and a bottle the user picked, launched on the
/// engine they already run (CrossOver), keep every file byte-identical; the marker is the one thing
/// that may appear. `legacyBottleUntouched`.
#[tokio::test]
async fn legacy_bottle_untouched_by_a_launch_on_the_engine_it_already_runs() {
    for name in ["GameLib-61-14-shared", "MyBottle-61-14"] {
        let rig = rig();
        let dir = rig.populate(name, true);
        let before = snapshot(&dir, false);
        assert!(!before.contains_key(MARKER_FILE));

        let result =
            prepare_bottle_for_engine(&rig.ctx, &PrepareArgs::new(KEY, name, Rig::crossover()))
                .await;

        assert!(result.is_ok(), "{name}: {result:?}");
        assert!(
            !result.switched,
            "{name}: the bottle was already on CrossOver"
        );
        let after = snapshot(&dir, true);
        assert_eq!(after, before, "{name}");
        assert_eq!(
            after.keys().collect::<Vec<_>>(),
            before.keys().collect::<Vec<_>>(),
            "nothing added or removed outside the marker ({name})"
        );
        assert!(
            !after.values().any(|v| v.starts_with("symlink:")),
            "no symlink introduced ({name})"
        );
        // The marker is the only addition, and it names CrossOver.
        let marker = std::fs::read_to_string(dir.join(MARKER_FILE)).unwrap();
        assert!(
            marker.starts_with(r#"{"kind":"crossover","id":"crossover""#),
            "{marker}"
        );
        rig.assert_nothing_ran();
        // Launching again changes nothing at all, the marker included.
        let with_marker = snapshot(&dir, false);
        let again =
            prepare_bottle_for_engine(&rig.ctx, &PrepareArgs::new(KEY, name, Rig::crossover()))
                .await;
        assert!(again.is_ok() && !again.switched);
        assert_eq!(snapshot(&dir, false), with_marker, "{name}");
    }
}

/// D-02 beyond the happy path: a switch that is refused (a shared bottle, a game running, another game
/// in the bottle, a marker from a newer build) leaves a pre-61 bottle byte-identical, with no marker
/// written, no wineserver stopped and no DXVK touched.
#[tokio::test]
async fn legacy_bottle_untouched_by_every_refused_switch() {
    let name = "GameLib-61-14-shared";
    type Setup = fn(&Rig, &mut PrepareArgs);
    let cases: [(&str, PrepareReason, Setup); 3] = [
        ("a shared bottle", PrepareReason::SharedBottle, |_, args| {
            args.own_bottle_name = OwnBottle::Named("GameLib-gog-1234".to_string());
        }),
        ("a running game", PrepareReason::GameRunning, |_, args| {
            args.monitor_phase = Some(MonitorPhase::Running);
        }),
        ("another game", PrepareReason::BottleBusy, |rig, _| {
            rig.ctx
                .ledger
                .mark_game_running(None, "GameLib-61-14-shared", "gog:9999");
        }),
    ];
    for (label, reason, setup) in cases {
        let rig = rig();
        let dir = rig.populate(name, true);
        let before = snapshot(&dir, false);
        let mut args = PrepareArgs::new(KEY, name, rig.pinned());
        setup(&rig, &mut args);

        let result = prepare_bottle_for_engine(&rig.ctx, &args).await;

        assert_eq!(refusal_reason(&result.outcome), Some(reason), "{label}");
        assert!(!result.switched, "{label}");
        assert_eq!(snapshot(&dir, false), before, "{label}: marker included");
        rig.assert_nothing_ran();
    }

    // A marker a newer build wrote is kept as it is, and the switch is refused.
    let rig = rig();
    let dir = rig.populate(name, true);
    let newer =
        r#"{"kind":"crossover","id":"crossover","wineserverBin":"/cx/bin/wineserver","version":9}"#;
    std::fs::write(dir.join(MARKER_FILE), newer).unwrap();
    let before = snapshot(&dir, false);
    let result =
        prepare_bottle_for_engine(&rig.ctx, &PrepareArgs::new(KEY, name, rig.pinned())).await;
    assert_eq!(
        refusal_reason(&result.outcome),
        Some(PrepareReason::MarkerNewer)
    );
    assert_eq!(snapshot(&dir, false), before);
    assert_eq!(
        std::fs::read_to_string(dir.join(MARKER_FILE)).unwrap(),
        newer
    );
    rig.assert_nothing_ran();
}

/// 61-14 D-04, D-06: a plain prefix (a Wine prefix the user keeps outside the Bottles root) is never a
/// bottle the switch can reach: asking for it by name, or by a path that climbs to it, is an invalid
/// bottle and the prefix is byte-identical.
#[tokio::test]
async fn a_plain_prefix_outside_the_bottles_root_is_never_touched_by_a_switch() {
    let rig = rig();
    let prefix = rig.home.root().join("home/Prefixes/plain-pinned");
    std::fs::create_dir_all(prefix.join("drive_c/Games/game-plain")).unwrap();
    std::fs::write(prefix.join("user.reg"), "WINE REGISTRY plain user").unwrap();
    std::fs::write(prefix.join("cxbottle.conf"), "[Bottle]\n").unwrap();
    let before = snapshot(&prefix, false);

    for name in [
        "plain-pinned",
        "../../Prefixes/plain-pinned",
        "../Prefixes/plain-pinned",
        prefix.to_str().unwrap(),
    ] {
        let result =
            prepare_bottle_for_engine(&rig.ctx, &PrepareArgs::new(KEY, name, Rig::crossover()))
                .await;
        assert_eq!(
            refusal_reason(&result.outcome),
            Some(PrepareReason::InvalidBottle),
            "{name}"
        );
    }
    assert_eq!(snapshot(&prefix, false), before);
    assert!(!prefix.join(MARKER_FILE).exists());
    // No per-game bottle appeared either.
    assert!(!rig.bottle("GameLib-gog-1234").exists());
    rig.assert_nothing_ran();
}

/// 59-25, D-19: removing one game's bottle, and switching it, leave a sibling game's bottle, its
/// engine marker and its files byte-identical (SC2).
#[tokio::test]
async fn removing_or_switching_one_bottle_leaves_a_sibling_bottle_untouched() {
    let rig = rig();
    let mine = rig.populate("GameLib-gog-1", true);
    let sibling = rig.populate("GameLib-gog-2", true);
    std::fs::write(
        sibling.join(MARKER_FILE),
        r#"{"kind":"crossover","id":"crossover","wineserverBin":"/cx/bin/wineserver","version":1}"#,
    )
    .unwrap();
    // A directory next to the Bottles root and a bottle whose name starts with this one's: neither
    // is this game's.
    let bottles_root = mine.parent().unwrap().to_path_buf();
    let neighbour = bottles_root.parent().unwrap().join("Bottles-keep");
    std::fs::create_dir_all(&neighbour).unwrap();
    std::fs::write(neighbour.join("keep.txt"), "keep").unwrap();
    let longer = rig.populate("GameLib-gog-1-too", true);
    let kept = [
        ("sibling", sibling.clone(), snapshot(&sibling, false)),
        ("longer name", longer.clone(), snapshot(&longer, false)),
        ("neighbour", neighbour.clone(), snapshot(&neighbour, false)),
    ];

    // A switch of this bottle (the previous engine is stopped, DXVK goes in).
    let next = rig.pinned();
    let result =
        prepare_bottle_for_engine(&rig.ctx, &PrepareArgs::new("gog:1", "GameLib-gog-1", next))
            .await;
    assert!(
        result.switched || refusal_reason(&result.outcome).is_some(),
        "{result:?}"
    );
    for (label, dir, before) in &kept {
        assert_eq!(&snapshot(dir, false), before, "{label} after the switch");
    }

    // Its removal.
    assert_eq!(
        remove_created_bottle_dir(&rig.ctx, "GameLib-gog-1"),
        RemoveCreated::Removed
    );
    assert!(!mine.exists());
    for (label, dir, before) in &kept {
        assert_eq!(&snapshot(dir, false), before, "{label} after the removal");
    }

    // Names that would reach a sibling delete nothing.
    for name in ["../Bottles-keep", "GameLib-gog-2/", "..", "."] {
        assert_eq!(
            remove_created_bottle_dir(&rig.ctx, name),
            RemoveCreated::Refused,
            "{name}"
        );
    }
    for (label, dir, before) in &kept {
        assert_eq!(&snapshot(dir, false), before, "{label} after the refusals");
    }
}
