//! The bundled known-fix seeds against the readers (88-08, D-15): the data checks the TS ran in
//! `knownFixesCegSeeds.test.ts` and `knownFixesMacArchSeeds.test.ts`, as Rust tests over the same files.
//!
//! The bundled layer is the repo's own `public/fixes` (read-only repo data, no profile); the local and
//! remote layers are empty directories of a gamelib_testutil FakeHome (D-22), so the answer can only
//! come from a bundled file. A floor on the number of bundled files read means an empty or missing
//! directory fails instead of passing by iterating nothing.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::testing::RecordingLog;
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_knownfix::reader;
use gamelib_knownfix::types::{FixLayer, KnownFixesInfo, Runner};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use serde_json::{json, Value};

/// `public/fixes` held ten files at planning time; a later edit may raise this, never lower it.
const BUNDLED_FILES_FLOOR: usize = 10;

/// The ids the TS CEG seed test names: routing-only files carrying `macArch: "32"` and `drm: "ceg"`.
const CEG_SEEDS: [&str; 3] = ["200510", "203140", "205930"];

/// The ids both TS seed tests name as `macArch`-only: routing-only, no `drm`.
const MAC_ARCH_SEEDS: [&str; 3] = ["57300", "63000", "402060"];

/// Mining Mechs: a real fix (`envVariables`), so the GameLib row is shown.
const REAL_FIX_SEED: &str = "1603180";

fn bundled_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../public/fixes")
}

struct Rig {
    _home: FakeHome,
    log: Arc<RecordingLog>,
    ctx: KnownFixCtx,
}

impl Rig {
    fn new() -> Rig {
        let home = FakeHome::new("knownfix-seeds-");
        let root = home.root().to_path_buf();
        let log = Arc::new(RecordingLog::new());
        let engine = EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Mac,
            EnginePaths {
                app_folder: root.join("app"),
                user_data: root.join("app"),
                tools_path: root.join("app").join("tools"),
                user_home: root.clone(),
                temp: root.join("tmp"),
            },
            Shutdown::new(),
        )
        .with_log(log.clone());
        // Empty local and remote layers: both directories exist and hold nothing.
        let ctx = KnownFixCtx::new(
            Arc::new(engine),
            Some(bundled_dir()),
            "https://relay.test",
            "0",
        );
        std::fs::create_dir_all(&ctx.paths.local).unwrap();
        std::fs::create_dir_all(&ctx.paths.fixes).unwrap();
        Rig {
            _home: home,
            log,
            ctx,
        }
    }

    /// The bundled tier-1 fix of a Steam title, with no warning logged.
    fn steam_fix(&self, id: &str) -> KnownFixesInfo {
        let before = self.log.lines().len();
        let fix = reader::read_known_fixes(&self.ctx, id, Runner::Steam)
            .unwrap_or_else(|| panic!("{id}-steam.json did not parse"));
        assert_eq!(
            self.log.lines().len(),
            before,
            "{id} warned: {:?}",
            self.log.lines()
        );
        fix
    }
}

fn text_of<'a>(value: &'a Option<Value>, what: &str) -> &'a str {
    value
        .as_ref()
        .and_then(Value::as_str)
        .unwrap_or_else(|| panic!("{what} is not a string"))
}

#[test]
fn every_ceg_seed_parses_with_drm_ceg_and_is_routing_only() {
    let rig = Rig::new();
    for id in CEG_SEEDS {
        let fix = rig.steam_fix(id);
        assert_eq!(fix.mac_arch, Some(json!("32")), "{id}");
        assert_eq!(fix.drm, Some(json!("ceg")), "{id}");
        assert!(!text_of(&fix.title, "title").is_empty(), "{id}");
        let notes = fix
            .notes
            .as_ref()
            .and_then(Value::as_object)
            .expect("notes");
        assert!(text_of(&notes.get("drm").cloned(), "notes.drm").contains("045"));
        assert!(text_of(&notes.get("macArch").cloned(), "notes.macArch").contains("045"));
        assert!(reader::is_routing_only_tier1_fix(&fix), "{id}");
        // A routing-only file hides the GameLib row on purpose.
        assert_eq!(
            reader::read_gamelib_fix_status(&rig.ctx, id, Runner::Steam),
            None,
            "{id}"
        );
    }
}

#[test]
fn every_mac_arch_seed_parses_with_mac_arch_32_and_is_routing_only() {
    let rig = Rig::new();
    for id in MAC_ARCH_SEEDS {
        let fix = rig.steam_fix(id);
        assert_eq!(fix.mac_arch, Some(json!("32")), "{id}");
        assert_eq!(fix.drm, None, "{id} is macArch-only");
        assert!(!text_of(&fix.title, "title").is_empty(), "{id}");
        assert!(reader::is_routing_only_tier1_fix(&fix), "{id}");
    }
}

#[test]
fn mining_mechs_is_a_real_fix_and_shows_the_gamelib_row() {
    let rig = Rig::new();
    let fix = rig.steam_fix(REAL_FIX_SEED);
    assert!(fix.env_variables.is_some());
    assert!(!reader::is_routing_only_tier1_fix(&fix));
    let status = reader::read_gamelib_fix_status(&rig.ctx, REAL_FIX_SEED, Runner::Steam)
        .expect("a real bundled fix counts");
    assert_eq!(status.origin, FixLayer::Bundled);
}

/// `<id>-<store>.json` or `<id>-<store>.profile.json` as an id, a runner and whether it is tier 2.
fn parse_file_name(name: &str) -> Option<(String, Runner, bool)> {
    let (stem, tier2) = match name.strip_suffix(".profile.json") {
        Some(stem) => (stem, true),
        None => (name.strip_suffix(".json")?, false),
    };
    let (id, store) = stem.rsplit_once('-')?;
    let runner = match store {
        "epic" => Runner::Legendary,
        "gog" => Runner::Gog,
        "amazon" => Runner::Nile,
        "steam" => Runner::Steam,
        _ => return None,
    };
    Some((id.to_string(), runner, tier2))
}

#[test]
fn no_bundled_file_is_silently_dropped_by_the_allow_list() {
    let rig = Rig::new();
    let mut read = BTreeSet::new();
    for entry in std::fs::read_dir(bundled_dir()).expect("public/fixes exists") {
        let name = entry.unwrap().file_name().to_string_lossy().into_owned();
        let (id, runner, tier2) = parse_file_name(&name)
            .unwrap_or_else(|| panic!("{name} is not <id>-<store>[.profile].json"));
        let before = rig.log.lines().len();
        if tier2 {
            let profile = reader::read_known_fix_profile(&rig.ctx, &id, runner)
                .unwrap_or_else(|| panic!("{name} did not parse as a profile"));
            assert!(profile.title.is_some(), "{name} has no title");
        } else {
            let fix = reader::read_known_fixes(&rig.ctx, &id, runner)
                .unwrap_or_else(|| panic!("{name} did not parse as a tier-1 fix"));
            assert!(!fix.keys().is_empty(), "{name} kept no key");
        }
        assert_eq!(
            rig.log.lines().len(),
            before,
            "{name} dropped a key or warned: {:?}",
            rig.log.lines()
        );
        read.insert(name);
    }
    assert!(
        read.len() >= BUNDLED_FILES_FLOOR,
        "bundled files read: {}, below the floor of {BUNDLED_FILES_FLOOR}",
        read.len()
    );
}
