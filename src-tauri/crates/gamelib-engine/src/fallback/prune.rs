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
