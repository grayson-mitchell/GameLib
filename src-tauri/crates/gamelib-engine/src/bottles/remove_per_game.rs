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
//! - **Order (D-17, D-19):** the running check (the ledger or a live selection: `in-use`), then the guard's
//!   check before any spawn, so a refusal touches nothing; then the bottle's wineserver is stopped
//!   (bounded, [`KILL_TIMEOUT_MS`]) and, for a CrossOver bottle with CrossOver present, `cxbottle --bottle
//!   <name> --delete --force` runs as a capped helper spawn (`ctx.proc`, the one `gamelib-proc` seam)
//!   under a shutdown registrant, as the Steam bridge's per-game removal does; then the guarded
//!   `remove_tree` takes whatever is left. A bottle that is a link is only unlinked: nothing is spawned
//!   for it, because a wineserver stop or a `cxbottle` run would follow the link into its referent.
//! - **The list is the guard's input** (`knownInstalls`): an absent list reads as "could not be read"
//!   and refuses, it is never read as "no installs".

use std::path::Path;
use std::time::Duration;

use gamelib_core::process::ProcSpec;
use gamelib_safety::remove::{check_removal, remove_tree};
use gamelib_safety::safe_path::CaseMode;
use gamelib_safety::wire::{Known, Outcome, Reason, Request, Target, TargetKind};
use serde_json::{json, Map, Value};

use crate::bottles::lifecycle::{
    direct_child_dir, dirname, kill_bottle_wineserver, CX_CREATE_CAP_MS, KILL_TIMEOUT_MS,
};
use crate::bottles::marker::{self, EngineKind};
use crate::bottles::paths::{basename, is_inside};
use crate::ctx::{EngineCtx, Platform};
use crate::engines::read_bottle_engine_marker_kind;
use crate::game_engine::per_game_bottle_name;
use crate::jsutil::path_join;
use crate::key::{engine_key_for, uses_bottle_runtime};
use crate::offline::MarkerKind;

/// The cap on `cxbottle --delete --force`: half of the create cap (the delete has no template to
/// unpack), and never above it.
pub const CXBOTTLE_DELETE_CAP: Duration = Duration::from_millis(CX_CREATE_CAP_MS / 2);

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

fn warn(ctx: &EngineCtx, line: &str) {
    if let Some(log) = ctx.log.as_deref() {
        log.warn(line);
    }
}

/// The wineserver the bottle's engine marker names and may be trusted to run, with the extra
/// environment it needs; `bin_dir` is CrossOver's `bin` directory when CrossOver is found. `None` for a
/// bottle with no marker, a CrossOver bottle with no CrossOver present, and a marker naming a wineserver
/// outside the engine's own root (a hand-edited marker is never obeyed, T-59-60).
fn wineserver_for(
    ctx: &EngineCtx,
    name: &str,
    dir: &str,
    bin_dir: Option<&str>,
) -> Option<(String, Vec<(String, String)>)> {
    match read_bottle_engine_marker_kind(ctx, name)? {
        MarkerKind::Crossover => {
            let bin_dir = bin_dir?;
            Some((
                path_join(&[bin_dir, "wineserver"]),
                vec![("CX_ROOT".to_string(), dirname(bin_dir))],
            ))
        }
        MarkerKind::NonCrossover => {
            if let Some(pinned) = marker::read_marker_summary(ctx, name)?.pin_wineserver_bin {
                return Some((pinned, Vec::new()));
            }
            let marker = marker::read(ctx, dir)?;
            let tools = ctx.paths.tools_path.to_string_lossy();
            (marker.kind == EngineKind::WineManager
                && is_inside(&tools, &marker.wineserver_bin)
                && basename(&marker.wineserver_bin) == "wineserver")
                .then(|| (marker.wineserver_bin, Vec::new()))
        }
    }
}

/// `cxbottle --bottle <name> --delete --force` as a capped helper spawn. Best effort: a run that
/// failed or hit its cap is logged and the guarded delete follows.
async fn cxbottle_delete(ctx: &EngineCtx, name: &str, bin_dir: &str) {
    let mut spec = ProcSpec::new("engine-cxbottle-delete", path_join(&[bin_dir, "cxbottle"]));
    spec.argv = ["--bottle", name, "--delete", "--force"]
        .map(str::to_string)
        .to_vec();
    spec.timeout = Some(CXBOTTLE_DELETE_CAP);
    let out = ctx.proc.run(spec, None).await;
    if out.code != Some(0) {
        warn(
            ctx,
            &format!(
                "removePerGameBottle: cxbottle --delete did not finish cleanly for \"{name}\" (guarded delete follows)"
            ),
        );
    }
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
        warn(
            ctx,
            &format!("removePerGameBottle: refusing unsafe bottle \"{name}\""),
        );
        return RemovePerGameOutcome::Refused {
            reason: "unsafe-name",
            other_key: None,
        };
    };

    // A game running in the bottle, or one starting on a chosen engine, keeps its bottle.
    let key = engine_key_for(&req.runner, &req.app_name);
    let selected = key
        .as_deref()
        .is_some_and(|k| ctx.registry.get_engine_selection(k).is_some());
    if selected || !ctx.ledger.games_running_in(&name).is_empty() {
        warn(
            ctx,
            &format!("removePerGameBottle: \"{name}\" is in use, not removing it"),
        );
        return RemovePerGameOutcome::Refused {
            reason: "in-use",
            other_key: None,
        };
    }

    // The guard is asked before anything is spawned, so a refusal touches nothing (D-11).
    let request = guard_request(ctx, req, &name, dir.clone());
    let check = check_removal(&request, CaseMode::Auto);
    if !check.overall.allows() {
        let blocking = check.items.iter().find(|i| !i.verdict.allows());
        let reason = blocking.map_or("bad-reply", |i| reason_word(i.reason));
        warn(
            ctx,
            &format!("removePerGameBottle: the removal guard declined \"{name}\" ({reason})"),
        );
        return RemovePerGameOutcome::Refused {
            reason,
            other_key: blocking.and_then(|i| i.other_key.clone()),
        };
    }
    let item = check.items.first();
    if item.is_some_and(|i| i.absent) {
        return RemovePerGameOutcome::Removed;
    }

    // A link is only unlinked (D-15): a wineserver stop or a cxbottle run follows it into its referent.
    if !item.is_some_and(|i| i.is_link) {
        // In-flight work holds a registrant for exactly as long as it runs (D-17).
        let _held = ctx.shutdown.register("engine-bottle-remove");
        let bin_dir = (ctx.crossover_bin_dir)().await.filter(|d| !d.is_empty());
        if let Some((wineserver, extra_env)) = wineserver_for(ctx, &name, &dir, bin_dir.as_deref())
        {
            kill_bottle_wineserver(
                ctx,
                &name,
                &wineserver,
                &extra_env,
                Duration::from_millis(KILL_TIMEOUT_MS),
            )
            .await;
        }
        if read_bottle_engine_marker_kind(ctx, &name) == Some(MarkerKind::Crossover) {
            match bin_dir.as_deref() {
                Some(bin_dir) => cxbottle_delete(ctx, &name, bin_dir).await,
                None => warn(
                    ctx,
                    &format!(
                        "removePerGameBottle: no CrossOver install found, skipping cxbottle --delete for \"{name}\" (guarded delete follows)"
                    ),
                ),
            }
        }
    }

    if std::fs::symlink_metadata(Path::new(&dir)).is_err() {
        return RemovePerGameOutcome::Removed;
    }
    let reply = remove_tree(&request, CaseMode::Auto);
    match reply.outcome {
        Outcome::Removed => RemovePerGameOutcome::Removed,
        Outcome::Refused => {
            let blocking = reply.items.iter().find(|i| !i.verdict.allows());
            warn(
                ctx,
                &format!("removePerGameBottle: the removal guard now declines \"{name}\""),
            );
            RemovePerGameOutcome::Refused {
                reason: blocking.map_or("bad-reply", |i| reason_word(i.reason)),
                other_key: blocking.and_then(|i| i.other_key.clone()),
            }
        }
        Outcome::Failed => {
            warn(
                ctx,
                &format!("removePerGameBottle: could not remove \"{name}\""),
            );
            RemovePerGameOutcome::Failed {
                reason: "delete-failed",
            }
        }
    }
}
