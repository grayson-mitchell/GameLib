//! `check_removal` (read-only) and `remove_tree` (guard, then delete). The delete call re-runs
//! every check for every target and never trusts an earlier verdict (D-14): the pre-flight is
//! for UX and ordering, the delete call is the safety boundary. The library logs nothing.

use crate::safe_path::{
    self, canonical_location, fold_key, is_fs_root, is_strictly_inside, CaseMode, Location,
};
use crate::tri::Tri;
use crate::wire::{Item, Known, Outcome, Reason, RemoveReply, Reply, Request, Target, TargetKind};
use std::path::PathBuf;

/// A target that did not get a `Yes`.
struct Refusal {
    verdict: Tri,
    reason: Reason,
    other_key: Option<String>,
}

fn no(reason: Reason) -> Refusal {
    Refusal {
        verdict: Tri::No,
        reason,
        other_key: None,
    }
}

fn unknown(reason: Reason) -> Refusal {
    Refusal {
        verdict: Tri::Unknown,
        reason,
        other_key: None,
    }
}

/// Every location a caller-supplied path (a protected root or a known install) occupies: its
/// canonical location and, when it is itself a link, also its referent, so a target equal to
/// either is recognised. Not absolute, or not resolvable, is `Unknown`.
fn location_keys(raw: &str) -> Result<Vec<PathBuf>, Refusal> {
    let p = safe_path::parse_absolute(raw).map_err(|_| unknown(Reason::NotAbsolute))?;
    let loc = canonical_location(&p).map_err(unknown)?;
    let mut keys = vec![loc.path];
    if loc.is_link {
        if let Ok(referent) = dunce::canonicalize(&p) {
            keys.push(referent);
        }
    }
    Ok(keys)
}

fn check_protected(req: &Request, loc: &Location, insensitive: bool) -> Result<(), Refusal> {
    if is_fs_root(&loc.path) {
        return Err(no(Reason::IsProtectedRoot));
    }
    let lk = fold_key(&loc.path, insensitive);
    for raw in req.protected_roots.iter().filter(|s| !s.is_empty()) {
        for key in location_keys(raw)? {
            // The location is the protected root or an ancestor of it.
            if fold_key(&key, insensitive).starts_with(&lk) {
                return Err(no(Reason::IsProtectedRoot));
            }
        }
    }
    Ok(())
}

fn check_trust_root(
    t: &Target,
    req: &Request,
    loc: &Location,
    sensitive_fold: bool,
) -> Result<(), Refusal> {
    match t.trust_root.as_deref().filter(|s| !s.is_empty()) {
        Some(raw) => {
            let p = safe_path::parse_absolute(raw).map_err(|_| unknown(Reason::NotAbsolute))?;
            let root = dunce::canonicalize(&p).map_err(|_| unknown(Reason::CanonicalizeFailed))?;
            let rk = fold_key(&root, sensitive_fold);
            let lk = fold_key(&loc.path, sensitive_fold);
            if lk == rk {
                return Err(no(Reason::IsTrustRoot));
            }
            if !is_strictly_inside(&lk, &rk) {
                return Err(no(Reason::OutsideTrustRoot));
            }
            Ok(())
        }
        None => {
            // No single root exists (a sideload folder can be anywhere): the protected-root and
            // known-install checks then carry the weight, so a caller must have supplied roots.
            let may_skip = matches!(
                t.kind,
                TargetKind::GameInstall | TargetKind::Prefix | TargetKind::SideloadFolder
            ) && req.protected_roots.iter().any(|s| !s.is_empty());
            if may_skip {
                Ok(())
            } else {
                Err(unknown(Reason::NoTrustRoot))
            }
        }
    }
}

fn check_known(req: &Request, loc: &Location, insensitive: bool) -> Result<(), Refusal> {
    let Some(list) = &req.known_installs else {
        return Err(unknown(Reason::KnownInstallsUnreadable));
    };
    let lk = fold_key(&loc.path, insensitive);
    for k in list {
        if req.self_key.as_deref() == Some(k.key.as_str()) || k.path.is_empty() {
            continue;
        }
        for key in location_keys(&k.path)? {
            let kk = fold_key(&key, insensitive);
            // The target is another install, or contains one: deleting it would take that
            // game's files too. Equal counts (D-16: no delete-around-it).
            if kk.starts_with(&lk) {
                return Err(other(Reason::NestedKnownInstall, k));
            }
            if is_strictly_inside(&lk, &kk) {
                return Err(other(Reason::InsideKnownInstall, k));
            }
        }
    }
    Ok(())
}

fn other(reason: Reason, k: &Known) -> Refusal {
    Refusal {
        verdict: Tri::No,
        reason,
        other_key: Some(k.key.clone()),
    }
}

fn check_one(t: &Target, req: &Request, case: CaseMode) -> Result<Location, Refusal> {
    let raw = safe_path::lexical_check(&t.path).map_err(no)?;
    let loc = canonical_location(&raw).map_err(unknown)?;
    // Strict direction when the volume cannot be probed: protected-root and known-install
    // comparisons fold case (more equalities, more refusals); containment does not.
    let fold_eq = safe_path::resolve_insensitive(case, &loc.probe_dir, true);
    let fold_contain = safe_path::resolve_insensitive(case, &loc.probe_dir, false);
    check_protected(req, &loc, fold_eq)?;
    check_trust_root(t, req, &loc, fold_contain)?;
    check_known(req, &loc, fold_eq)?;
    Ok(loc)
}

fn evaluate(req: &Request, case: CaseMode) -> Vec<(Item, Option<Location>)> {
    req.targets
        .iter()
        .map(|t| match check_one(t, req, case) {
            Ok(loc) => (
                Item {
                    id: t.id.clone(),
                    verdict: Tri::Yes,
                    reason: Reason::Ok,
                    other_key: None,
                    is_link: loc.is_link,
                    absent: loc.absent,
                },
                Some(loc),
            ),
            Err(r) => (
                Item {
                    id: t.id.clone(),
                    verdict: r.verdict,
                    reason: r.reason,
                    other_key: r.other_key,
                    is_link: false,
                    absent: false,
                },
                None,
            ),
        })
        .collect()
}

fn overall(items: &[Item]) -> Tri {
    items.iter().fold(Tri::Yes, |acc, i| acc.and(i.verdict))
}

/// Read-only. Items are in request order; `overall` is the Kleene AND of the items, so zero
/// targets is `yes` with no items.
pub fn check_removal(req: &Request, case: CaseMode) -> Reply {
    let items: Vec<Item> = evaluate(req, case).into_iter().map(|(i, _)| i).collect();
    Reply {
        overall: overall(&items),
        items,
    }
}

fn delete_location(loc: &Location) -> std::io::Result<()> {
    let md = std::fs::symlink_metadata(&loc.path)?;
    if md.is_dir() {
        std::fs::remove_dir_all(&loc.path)
    } else {
        std::fs::remove_file(&loc.path)
    }
}

/// Re-checks every target itself and deletes nothing unless the overall verdict is `Yes`. The
/// first I/O error stops the loop: earlier targets may already be gone, later ones are not
/// attempted.
pub fn remove_tree(req: &Request, case: CaseMode) -> RemoveReply {
    let checked = evaluate(req, case);
    let mut items: Vec<Item> = checked.iter().map(|(i, _)| i.clone()).collect();
    let all = overall(&items);
    if !all.allows() {
        return RemoveReply {
            overall: all,
            items,
            outcome: Outcome::Refused,
        };
    }
    for (idx, (item, loc)) in checked.iter().enumerate() {
        let Some(loc) = loc else { continue };
        if item.absent {
            continue;
        }
        match delete_location(loc) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => {
                if let Some(it) = items.get_mut(idx) {
                    it.verdict = Tri::No;
                    it.reason = Reason::DeleteFailed;
                }
                return RemoveReply {
                    overall: overall(&items),
                    items,
                    outcome: Outcome::Failed,
                };
            }
        }
    }
    RemoveReply {
        overall: all,
        items,
        outcome: Outcome::Removed,
    }
}
