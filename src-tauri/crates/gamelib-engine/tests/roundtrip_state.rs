//! The D-07 round trip (87-38): every fixture bottle's engine marker from `state/bottles` (the set
//! 87-11 committed: crossover, pinned current and retired, wine-manager, absent `dxvk` and
//! `dxvk: "failed"`, a `version: 2` marker, an unreadable one, a contradicted crossover marker, hand
//! edits) is read and written back through the one writer, and the bytes are compared.
//!
//! The contract, per fixture:
//!
//! - a marker the reader accepts and the writer may rewrite comes back byte for byte (the same key
//!   order, compact, no trailing newline, `version` last);
//! - a marker written before the `version` key existed comes back with exactly `"version":1` added;
//! - a hand-edited `dxvk` outside the pinned-engine root is dropped by the reader (T-59-60), so the
//!   rewrite has exactly that field fewer;
//! - a marker the reader refuses (bad id, wrong kind, unreadable bytes) has nothing to write back and
//!   stays byte-identical;
//! - a marker a newer build wrote (`version: 2`) is refused by the gate and stays byte-identical
//!   (FND-06).
//!
//! The written file is mode 0644 and no `.tmp-<pid>` file is left behind.
#![cfg(unix)]

use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::bottles::marker::{
    self, gate_allows_write, process_gate, read, write_marker, MARKER_FILE,
};
use gamelib_engine::bottles::paths::bottle_dir;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_store::host::StoreHost;
use gamelib_store::version_gate::GateState;
use gamelib_testutil::FakeHome;

/// Fixtures whose marker the reader accepts and the writer rewrites to the identical bytes.
const IDENTICAL: [&str; 9] = [
    "fx-crossover-marker",
    "fx-crossover-contradicted",
    "fx-dxvk-failed",
    "fx-pinned-current",
    "fx-pinned-no-dxvk-field",
    "fx-pinned-retired",
    "fx-pinned-wineserver-misnamed",
    "fx-pinned-wineserver-outside",
    "fx-wine-manager",
];
/// A marker with no `version` key: rewritten with `"version":1` and nothing else changed.
const GAINS_VERSION: [&str; 1] = ["fx-marker-legacy-noversion"];
/// A hand-edited `dxvk` outside the pinned-engine root: the reader drops it.
const LOSES_DXVK: [&str; 1] = ["fx-pinned-dxvk-outside-root"];
/// The reader refuses these, so nothing is written back.
const REFUSED_BY_READER: [&str; 3] = [
    "fx-marker-bad-id",
    "fx-marker-wrong-kind",
    "fx-marker-unreadable",
];
/// A marker from a newer build: read, then refused by the gate on write.
const NEWER: [&str; 1] = ["fx-marker-newer"];

fn state_bottles() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/state/bottles")
}

/// The fixtures that carry a marker file, by name.
fn fixtures_with_markers() -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(state_bottles())
        .unwrap()
        .flatten()
        .filter(|e| e.path().join(MARKER_FILE).is_file())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

struct Profile {
    home: FakeHome,
}

impl Profile {
    fn new() -> Profile {
        Profile {
            home: FakeHome::new("engine-roundtrip-"),
        }
    }

    fn tools(&self) -> PathBuf {
        self.home.root().join(".config/GameLib/tools")
    }

    fn expand(&self, text: &str) -> String {
        text.replace("<TOOLS>", &self.tools().to_string_lossy())
            .replace("<HOME>", &self.home.root().to_string_lossy())
    }

    fn ctx(&self) -> EngineCtx {
        let root = self.home.root().to_path_buf();
        EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Mac,
            EnginePaths {
                app_folder: root.join(".config/GameLib"),
                user_data: root.join("Library/Application Support/GameLib"),
                tools_path: self.tools(),
                user_home: root.clone(),
                temp: root.join("tmp"),
            },
            Shutdown::new(),
        )
    }

    /// The fixture bottle laid out under the Bottles root; returns its directory.
    fn lay(&self, name: &str) -> String {
        let dir = bottle_dir(self.home.root(), name);
        copy_tree(&state_bottles().join(name), Path::new(&dir), self);
        dir
    }
}

fn copy_tree(source: &Path, target: &Path, profile: &Profile) {
    std::fs::create_dir_all(target).unwrap();
    for entry in std::fs::read_dir(source).unwrap().flatten() {
        let to = target.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_tree(&entry.path(), &to, profile);
        } else if let Ok(text) = std::fs::read_to_string(entry.path()) {
            std::fs::write(&to, profile.expand(&text)).unwrap();
        } else {
            std::fs::copy(entry.path(), &to).unwrap();
        }
    }
}

/// Reads the fixture's marker, writes it back where the gate allows, and answers the bytes before
/// and after, and whether the writer reported success.
fn round_trip(name: &str) -> (String, String, bool) {
    let profile = Profile::new();
    let ctx = profile.ctx();
    let dir = profile.lay(name);
    let path = Path::new(&dir).join(MARKER_FILE);
    let before = std::fs::read_to_string(&path).unwrap();
    let wrote = match read(&ctx, &dir) {
        Some(marker) => write_marker(None, &dir, &marker),
        None => false,
    };
    let after = std::fs::read_to_string(&path).unwrap();
    // The writer leaves a 0644 marker and no tmp file behind.
    if wrote {
        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        // 0644 less whatever the umask takes away; the owner can always read and write it.
        assert_eq!(mode & !0o644, 0, "{name}: mode {mode:o}");
        assert_eq!(mode & 0o600, 0o600, "{name}: mode {mode:o}");
    }
    let leftovers: Vec<String> = std::fs::read_dir(&dir)
        .unwrap()
        .flatten()
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| n.contains(".tmp-"))
        .collect();
    assert!(leftovers.is_empty(), "{name}: {leftovers:?}");
    (before, after, wrote)
}

#[test]
fn every_fixture_marker_is_covered_by_one_expectation() {
    let named: Vec<&str> = IDENTICAL
        .iter()
        .chain(&GAINS_VERSION)
        .chain(&LOSES_DXVK)
        .chain(&REFUSED_BY_READER)
        .chain(&NEWER)
        .copied()
        .collect();
    let mut have = fixtures_with_markers();
    // A floor: an emptied fixture directory must not pass by iterating nothing.
    assert!(have.len() >= 15, "{} fixtures with a marker", have.len());
    let mut want: Vec<String> = named.iter().map(|n| n.to_string()).collect();
    have.sort();
    want.sort();
    assert_eq!(have, want, "a fixture marker no expectation names");
}

#[test]
fn a_current_marker_re_serialises_to_its_original_bytes() {
    for name in IDENTICAL {
        let (before, after, wrote) = round_trip(name);
        assert!(wrote, "{name}: the writer refused a current marker");
        assert_eq!(after, before, "{name}");
    }
}

#[test]
fn a_marker_without_a_version_gains_version_one_and_nothing_else() {
    for name in GAINS_VERSION {
        let (before, after, wrote) = round_trip(name);
        assert!(wrote, "{name}");
        let body = before.strip_suffix('}').expect("a closed object");
        assert_eq!(after, format!("{body},\"version\":1}}"), "{name}");
    }
}

#[test]
fn a_hand_edited_dxvk_outside_the_engine_root_is_dropped_on_rewrite() {
    for name in LOSES_DXVK {
        let (before, after, wrote) = round_trip(name);
        assert!(wrote, "{name}");
        let dropped = before.replace(
            ",\"dxvk\":{\"dir\":\"/opt/elsewhere/dxvk\",\"version\":\"v1.10.3-20230507-repack\"}",
            "",
        );
        assert_ne!(
            dropped, before,
            "{name}: the fixture no longer has the edit"
        );
        assert_eq!(after, dropped, "{name}");
    }
}

#[test]
fn a_marker_the_reader_refuses_is_never_written_back_or_reset() {
    for name in REFUSED_BY_READER {
        let (before, after, wrote) = round_trip(name);
        assert!(!wrote, "{name}");
        assert_eq!(after, before, "{name}: bytes changed");
    }
}

#[test]
fn a_marker_from_a_newer_build_is_never_overwritten() {
    for name in NEWER {
        let profile = Profile::new();
        let ctx = profile.ctx();
        let dir = profile.lay(name);
        let path = Path::new(&dir).join(MARKER_FILE);
        let before = std::fs::read(&path).unwrap();
        let marker = read(&ctx, &dir).expect("the reader accepts a version 2 marker");
        assert_eq!(process_gate(&path), Some(GateState::Newer), "{name}");
        assert!(!write_marker(None, &dir, &marker), "{name}");
        assert_eq!(
            std::fs::read(&path).unwrap(),
            before,
            "{name}: bytes changed"
        );
        // Nor does either entry point that reaches the writer touch it.
        marker::reconcile(&ctx, name);
        assert_eq!(
            std::fs::read(&path).unwrap(),
            before,
            "{name}: reconcile wrote"
        );
    }
}

#[test]
fn the_gate_allows_a_write_over_absent_current_and_unreadable_but_not_over_newer_or_unasked() {
    assert!(gate_allows_write(Some(GateState::Absent)));
    assert!(gate_allows_write(Some(GateState::Ok)));
    assert!(gate_allows_write(Some(GateState::Unreadable)));
    assert!(!gate_allows_write(Some(GateState::Newer)));
    assert!(!gate_allows_write(None));
}
