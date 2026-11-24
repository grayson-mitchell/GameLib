//! Removing a non-Steam game's own per-game bottle (Phase 87, SVC-02, finding F5, D-19, FND-02).
//!
//! One op, decided in Rust from the facts the caller can read and cannot be trusted to combine:
//! `{runner, appName, stored, knownInstalls, selfKey, protectedRoots}`. The bottle name is **never an
//! argument**.
//!
//! - **The target rule (the twin of the uninstall dialog's rule in 87-67, both reading the same two
//!   facts):** the target is `per_game_bottle_name(runner, appName)`, and only when the game's stored
//!   `wineCrossoverBottle` equals that name exactly. The shared `GameLib` bottle, another game's
//!   bottle and a game with no stored bottle are never targets; they answer `not-bottle-backed` and
//!   the caller keeps its stored-prefix path. So does a host that is not macOS and a Steam
//!   bottle-runtime title (its bottles are the Steam bridge's, removed by its own route).
//! - **The directory** is the Bottles root's child named by [`direct_child_dir`]; the delete is
//!   `gamelib_safety::remove::remove_tree` over a `Bottle` target with the Bottles root as its trust
//!   root, so a link, a `..`, a sibling and the root itself delete nothing (D-19).
//! - **The list is the guard's input** (`knownInstalls`): an absent list reads as "could not be read"
//!   and refuses, it is never read as "no installs".

use serde_json::{json, Map, Value};

use gamelib_safety::remove::remove_tree;
use gamelib_safety::safe_path::CaseMode;
use gamelib_safety::wire::{Known, Outcome, Reason, Request, Target, TargetKind};

use crate::bottles::lifecycle::direct_child_dir;
use crate::ctx::{EngineCtx, Platform};
use crate::game_engine::per_game_bottle_name;
use crate::key::uses_bottle_runtime;

/// The argument of op `engine_bottle_remove_per_game`. Strict (D-14): an unknown key is a decode error.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct RemovePerGameRequest {
    pub runner: String,
    pub app_name: String,
    /// The game's stored settings; only `wineCrossoverBottle` is read.
    pub stored: Map<String, Value>,
    /// Every library entry that has an install location. Absent: the guard answers unknown.
    #[serde(default)]
    pub known_installs: Option<Vec<Known>>,
    /// The key of the game being removed; its own entry is not a sibling.
    #[serde(default)]
    pub self_key: Option<String>,
    #[serde(default)]
    pub protected_roots: Vec<String>,
}

/// What the op answered.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RemovePerGameOutcome {
    /// The bottle is gone (an absent one counts: there was nothing to remove).
    Removed,
    /// The game has no per-game bottle of its own to remove; nothing was touched.
    NotBottleBacked,
    /// Nothing was deleted: the reason is a closed word.
    Refused {
        reason: &'static str,
        other_key: Option<String>,
    },
    /// The guard allowed it and a step failed.
    Failed { reason: &'static str },
}

impl RemovePerGameOutcome {
    /// `{outcome, reason?, otherKey?}`.
    pub fn to_value(&self) -> Value {
        match self {
            RemovePerGameOutcome::Removed => json!({"outcome": "removed"}),
            RemovePerGameOutcome::NotBottleBacked => json!({"outcome": "not-bottle-backed"}),
            RemovePerGameOutcome::Refused { reason, other_key } => {
                let mut out = json!({"outcome": "refused", "reason": reason});
                if let Some(key) = other_key {
                    out["otherKey"] = json!(key);
                }
                out
            }
            RemovePerGameOutcome::Failed { reason } => {
                json!({"outcome": "failed", "reason": reason})
            }
        }
    }
}

/// The closed word of a guard reason (the same spelling the wire carries).
pub(crate) fn reason_word(reason: Reason) -> &'static str {
    match reason {
        Reason::Ok => "ok",
        Reason::NotAbsolute => "not-absolute",
        Reason::DotSegment => "dot-segment",
        Reason::NulByte => "nul-byte",
        Reason::IsProtectedRoot => "is-protected-root",
        Reason::IsTrustRoot => "is-trust-root",
        Reason::OutsideTrustRoot => "outside-trust-root",
        Reason::NoTrustRoot => "no-trust-root",
        Reason::NestedKnownInstall => "nested-known-install",
        Reason::InsideKnownInstall => "inside-known-install",
        Reason::KnownInstallsUnreadable => "known-installs-unreadable",
        Reason::CanonicalizeFailed => "canonicalize-failed",
        Reason::NotAPrefix => "not-a-prefix",
        Reason::FolderLooksShared => "folder-looks-shared",
        Reason::DeleteFailed => "delete-failed",
    }
}

/// The Bottles directory under the profile's home: the trust root of the removal.
fn bottles_root(ctx: &EngineCtx) -> String {
    crate::jsutil::path_join(&[
        &ctx.paths.user_home.to_string_lossy(),
        crate::bottles::paths::BOTTLES_REL,
    ])
}

/// The guard's request for one bottle directory.
fn guard_request(ctx: &EngineCtx, req: &RemovePerGameRequest, name: &str, dir: String) -> Request {
    let mut protected_roots = req.protected_roots.clone();
    protected_roots.push(ctx.paths.user_home.to_string_lossy().into_owned());
    Request {
        targets: vec![Target {
            id: name.to_string(),
            path: dir,
            kind: TargetKind::Bottle,
            trust_root: Some(bottles_root(ctx)),
            executable: None,
        }],
        known_installs: req.known_installs.clone(),
        self_key: req.self_key.clone(),
        protected_roots,
    }
}

/// The game's own per-game bottle name when the host and the stored settings make it a target:
/// the target rule of the module header. `None` is `not-bottle-backed`.
fn target_name(ctx: &EngineCtx, req: &RemovePerGameRequest) -> Option<String> {
    if ctx.platform != Platform::Mac || uses_bottle_runtime(&req.runner) {
        return None;
    }
    let name = per_game_bottle_name(&req.runner, &req.app_name)?;
    let stored = req.stored.get("wineCrossoverBottle")?.as_str()?;
    (stored == name).then_some(name)
}

/// Removes the game's own per-game bottle, or says why it did not.
pub async fn remove_per_game_bottle(
    ctx: &EngineCtx,
    req: &RemovePerGameRequest,
) -> RemovePerGameOutcome {
    let Some(name) = target_name(ctx, req) else {
        return RemovePerGameOutcome::NotBottleBacked;
    };
    let Some(dir) = direct_child_dir(ctx, &name) else {
        return RemovePerGameOutcome::Refused {
            reason: "unsafe-name",
            other_key: None,
        };
    };
    let request = guard_request(ctx, req, &name, dir);
    let reply = remove_tree(&request, CaseMode::Auto);
    match reply.outcome {
        Outcome::Removed => RemovePerGameOutcome::Removed,
        Outcome::Refused => {
            let item = reply.items.first();
            RemovePerGameOutcome::Refused {
                reason: item.map_or("bad-reply", |i| reason_word(i.reason)),
                other_key: item.and_then(|i| i.other_key.clone()),
            }
        }
        Outcome::Failed => RemovePerGameOutcome::Failed {
            reason: "delete-failed",
        },
    }
}
