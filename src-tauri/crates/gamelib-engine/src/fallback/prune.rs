//! Retention of unpinned engines (`pruneUnpinnedEngines`) and the one guarded delete of this module
//! (D-19, FND-02): every directory this module removes goes through
//! `gamelib_safety::remove::remove_tree` with `<tools>/steam-engines` as its trust root. A target
//! outside the root, the root itself, and a root the guard cannot resolve (`unknown`) delete nothing.
//! Where the TS would have deleted and the guard refuses, that is a recorded delta
//! (`golden/fallback/deltas.json`).
//!
//! The stale-temp boot sweep is 87-48's.

use std::fs;
use std::path::Path;

use gamelib_safety::remove::remove_tree;
use gamelib_safety::safe_path::CaseMode;
use gamelib_safety::wire::{Outcome, Request, Target, TargetKind};

use super::Env;
use crate::ctx::EngineCtx;
use crate::engines::pinned_engine_paths_at;
use crate::pins::{EnginePin, EnginePins};

/// What a guarded delete did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Removal {
    /// Gone (an absent target counts: there was nothing to remove).
    Removed,
    /// The guard answered `no` or `unknown`. Nothing was deleted.
    Refused,
    /// The guard allowed it and the delete failed part way.
    Failed,
}

/// Removes `path` (a directory under the engine root) through the guard.
pub fn remove_guarded(env: &Env, path: &Path) -> Removal {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let request = Request {
        targets: vec![Target {
            id: name.clone(),
            path: path.to_string_lossy().into_owned(),
            kind: TargetKind::AppData,
            trust_root: Some(env.root_text()),
            executable: None,
        }],
        // An engine is not an install of any library entry: an empty list, never `None` (which reads
        // as "the list could not be read" and refuses everything).
        known_installs: Some(Vec::new()),
        self_key: None,
        protected_roots: vec![env.user_home.to_string_lossy().into_owned()],
    };
    let reply = remove_tree(&request, CaseMode::Auto);
    match reply.outcome {
        Outcome::Removed => Removal::Removed,
        Outcome::Refused => {
            let reason = reply
                .items
                .first()
                .and_then(|item| serde_json::to_value(item.reason).ok())
                .and_then(|v| v.as_str().map(str::to_string))
                .unwrap_or_default();
            env.warn(&format!("Engine: not removing {name}: refused ({reason})"));
            Removal::Refused
        }
        Outcome::Failed => {
            env.warn(&format!("Engine: could not remove {name}"));
            Removal::Failed
        }
    }
}

/// The directory names a pin keeps: its Wine directory and its DXVK directory.
fn kept_names(root: &str, pin: &EnginePin) -> [String; 2] {
    let paths = pinned_engine_paths_at(root, pin);
    let base = |p: &str| {
        Path::new(p)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default()
    };
    [base(&paths.wine_dir), base(&paths.dxvk_dir)]
}

/// Keep the current and previous pins' directories; remove other engine directories. A file and a
/// symlink are never touched (only a real directory is a candidate), and a `.tmp-*` directory is left
/// while an artifact install holds one.
pub fn prune_at(env: &Env, table: &EnginePins) {
    if !env.root.is_dir() {
        return;
    }
    let root = env.root_text();
    let mut keep: Vec<String> = Vec::new();
    for pin in std::iter::once(&table.current).chain(table.previous.as_ref()) {
        keep.extend(kept_names(&root, pin));
    }
    let entries = match fs::read_dir(&env.root) {
        Ok(entries) => entries,
        Err(_) => {
            env.warn("Engine: prune failed: the engine root could not be listed");
            return;
        }
    };
    let mut names: Vec<_> = entries.flatten().map(|e| e.file_name()).collect();
    names.sort();
    for name in names {
        let text = name.to_string_lossy().into_owned();
        if keep.contains(&text) {
            continue;
        }
        if text.starts_with(".tmp-") && env.flights.active_installs() > 0 {
            continue;
        }
        let full = env.root.join(&name);
        let is_dir = fs::symlink_metadata(&full).is_ok_and(|m| m.is_dir());
        if !is_dir {
            continue;
        }
        remove_guarded(env, &full);
    }
}

/// [`prune_at`] over the context's engine root.
pub fn prune_unpinned_engines(ctx: &EngineCtx, table: &EnginePins) {
    prune_at(&Env::from_ctx(ctx), table);
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::testing::RecordingLog;
    use gamelib_core::clock::SystemClock;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use std::sync::Arc;

    use crate::ctx::{EnginePaths, Platform};
    use crate::pins::pins;

    fn ctx(home: &FakeHome) -> EngineCtx {
        let root = home.root().to_path_buf();
        EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Mac,
            EnginePaths {
                app_folder: root.join("app"),
                user_data: root.join("data"),
                tools_path: root.join("app").join("tools"),
                user_home: root.clone(),
                temp: root.join("tmp"),
            },
            Shutdown::new(),
        )
        .with_log(Arc::new(RecordingLog::new()))
    }

    fn names(env: &Env) -> Vec<String> {
        let mut out: Vec<String> = fs::read_dir(&env.root)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        out.sort();
        out
    }

    fn table() -> EnginePins {
        let current = pins().unwrap().current.clone();
        let mut previous = current.clone();
        previous.id = "wine-staging-11.1".into();
        previous.dxvk.version = "v1.10.2-20230101-repack".into();
        EnginePins {
            current,
            previous: Some(previous),
        }
    }

    #[test]
    fn prune_keeps_both_pins_removes_other_directories_and_never_touches_a_file_or_link() {
        let home = FakeHome::new("fallback-prune-");
        let ctx = ctx(&home);
        let env = Env::from_ctx(&ctx);
        let table = table();
        for dir in [
            table.current.id.clone(),
            format!("dxvk-macOS-{}", table.current.dxvk.version),
            "wine-staging-11.1".to_string(),
            "dxvk-macOS-v1.10.2-20230101-repack".to_string(),
            "wine-staging-9.0".to_string(),
            "dxvk-macOS-old".to_string(),
            ".tmp-wine-interrupted".to_string(),
        ] {
            fs::create_dir_all(env.root.join(dir).join("x")).unwrap();
        }
        fs::write(env.root.join("readme.txt"), "keep").unwrap();
        let outside = home.root().join("outside");
        fs::create_dir_all(&outside).unwrap();
        std::os::unix::fs::symlink(&outside, env.root.join("link")).unwrap();

        prune_at(&env, &table);
        assert_eq!(
            names(&env),
            vec![
                "dxvk-macOS-v1.10.2-20230101-repack".to_string(),
                format!("dxvk-macOS-{}", table.current.dxvk.version),
                "link".to_string(),
                "readme.txt".to_string(),
                "wine-staging-11.1".to_string(),
                table.current.id.clone(),
            ]
        );
        assert!(outside.is_dir(), "a link's target is never opened");
    }

    #[test]
    fn a_temp_directory_survives_while_an_install_holds_one_and_prune_without_a_root_does_nothing()
    {
        let home = FakeHome::new("fallback-prune-");
        let ctx = ctx(&home);
        let env = Env::from_ctx(&ctx);
        // No steam-engines directory: nothing happens and nothing is created.
        prune_at(&env, &table());
        assert!(!env.root.exists());

        fs::create_dir_all(env.root.join(".tmp-dxvk-abc123/dl")).unwrap();
        {
            let _install = env.flights.install_guard();
            prune_at(&env, &table());
            assert_eq!(names(&env), vec![".tmp-dxvk-abc123"]);
        }
        prune_at(&env, &table());
        assert!(names(&env).is_empty());
    }
}
