//! `check_removal` (read-only) and `remove_tree` (guard, then delete). The delete call re-runs
//! every check for every target and never trusts an earlier verdict (D-14): the pre-flight is
//! for UX and ordering, the delete call is the safety boundary. The library logs nothing.

use crate::safe_path::{
    self, canonical_location, fold_key, is_fs_root, is_strictly_inside, CaseMode, Location,
};
use crate::tri::Tri;
use crate::wire::{Item, Known, Outcome, Reason, RemoveReply, Reply, Request, Target, TargetKind};
use std::path::{Path, PathBuf};

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
/// either is recognised.
///
/// WR-02: a reference cannot name a location when it is not absolute (empty, relative, `~/x`, a
/// rooted path with no drive), so it is skipped with no keys. One that is absolute but cannot be
/// resolved is placed by its normalised lexical form (`lexical_reference_location`), so it still
/// refuses a target at or inside it and no longer turns an unrelated removal into `unknown`.
/// `unknown` remains only for the target's own resolution (in `check_one`) and for a reference
/// that can be neither resolved nor placed lexically (one with a dot segment).
fn location_keys(raw: &str) -> Result<Vec<PathBuf>, Refusal> {
    let Ok(p) = safe_path::parse_absolute(raw) else {
        return Ok(Vec::new());
    };
    match canonical_location(&p) {
        Ok(loc) => {
            let mut keys = vec![loc.path];
            if loc.is_link {
                if let Ok(referent) = dunce::canonicalize(&p) {
                    keys.push(referent);
                }
            }
            Ok(keys)
        }
        Err(_) => {
            // A `..` cannot be placed without resolving it: fail closed.
            safe_path::lexical_check(raw).map_err(|_| unknown(Reason::CanonicalizeFailed))?;
            // Also the Windows unplugged-drive path: `absent_location` walks up to the drive
            // root, whose `file_name()` is `None`, so `canonical_location` fails and the
            // reference lands here. Only the cfg(windows) adversarial row proves this, on the CI
            // Windows leg.
            Ok(vec![safe_path::lexical_reference_location(&p)])
        }
    }
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

/// The target must lie strictly inside its trust root. The root is resolved by
/// `safe_path::resolve_trust_root`: an existing root is canonicalised with links followed, an
/// absent root is placed at its nearest existing ancestor (absent is not a canonicalisation
/// failure; GOG's `gog-support` folder and Steam's `steamapps/common` usually do not exist yet),
/// and a root that exists but cannot be resolved is `Unknown`. An absent trust root can only ever
/// admit absent targets, because an existing target's canonical path cannot pass through a name
/// that does not exist, and `remove_tree` skips absent targets. So this never authorises deleting
/// anything that exists.
/// An empty `trustRoot` is refused as unknown (`no-trust-root`) and never read as "no trust root".
fn check_trust_root(
    t: &Target,
    req: &Request,
    loc: &Location,
    sensitive_fold: bool,
) -> Result<(), Refusal> {
    match t.trust_root.as_deref() {
        // WR-04: an empty string is a caller bug the guard must surface, never "no trust root".
        Some("") => Err(unknown(Reason::NoTrustRoot)),
        Some(raw) => {
            let p = safe_path::parse_absolute(raw).map_err(|_| unknown(Reason::NotAbsolute))?;
            let root = safe_path::resolve_trust_root(&p).map_err(unknown)?;
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
            // known-install checks then carry the weight, so a caller must have supplied at least
            // one absolute root (WR-02: relative roots are skipped, so alone they anchor nothing).
            let may_skip = matches!(
                t.kind,
                TargetKind::GameInstall | TargetKind::Prefix | TargetKind::SideloadFolder
            ) && req
                .protected_roots
                .iter()
                .any(|s| safe_path::parse_absolute(s).is_ok());
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

/// A Wine prefix (or Proton `pfx`) holds `drive_c` or `pfx` at its top level. Moves today's TS
/// heuristic (uninstaller.ts: a non-empty folder must contain drive_c or pfx) into the one
/// implementation. An empty directory passes: there is nothing in it to lose.
fn check_prefix(loc: &Location) -> Result<(), Refusal> {
    let md =
        std::fs::symlink_metadata(&loc.path).map_err(|_| unknown(Reason::CanonicalizeFailed))?;
    if !md.is_dir() {
        return Err(no(Reason::NotAPrefix));
    }
    let entries = std::fs::read_dir(&loc.path).map_err(|_| unknown(Reason::CanonicalizeFailed))?;
    let mut any = false;
    for entry in entries {
        let entry = entry.map_err(|_| unknown(Reason::CanonicalizeFailed))?;
        any = true;
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if name == "drive_c" || name == "pfx" {
            return Ok(());
        }
    }
    if any {
        Err(no(Reason::NotAPrefix))
    } else {
        Ok(())
    }
}

/// Extensions that make a top-level file look like something runnable (case-insensitive).
const EXECUTABLE_EXTENSIONS: &[&str] = &[
    ".exe",
    ".bat",
    ".cmd",
    ".com",
    ".msi",
    ".lnk",
    ".sh",
    ".command",
    ".appimage",
    ".x86",
    ".x86_64",
];

#[cfg(unix)]
fn has_exec_bit(md: &std::fs::Metadata) -> bool {
    use std::os::unix::fs::PermissionsExt;
    md.permissions().mode() & 0o111 != 0
}
#[cfg(not(unix))]
fn has_exec_bit(_md: &std::fs::Metadata) -> bool {
    false
}

/// The first path segment of the game's own executable under the folder (so a `.app` bundle
/// counts as the game's own). Absolute executables are made relative to the folder; one outside
/// the folder names nothing.
fn own_entry(folder: &Path, raw_target: &Path, executable: Option<&str>) -> Option<String> {
    let exe = executable.filter(|e| !e.is_empty())?;
    let p = Path::new(exe);
    let rel: String = if p.is_absolute() {
        let r = p
            .strip_prefix(folder)
            .or_else(|_| p.strip_prefix(raw_target))
            .ok()?;
        r.to_string_lossy().into_owned()
    } else {
        exe.to_string()
    };
    rel.split(['/', '\\'])
        .find(|s| !s.is_empty() && *s != ".")
        .map(|s| s.to_lowercase())
}

/// Does one directory entry look like something runnable? A directory counts when it is a
/// `.app` bundle; anything else counts with a runnable extension, or as a regular file with the
/// execute bit. `name` is lowercased, `emd` is the non-following metadata.
fn entry_looks_runnable(name: &str, emd: &std::fs::Metadata) -> bool {
    if emd.is_dir() {
        name.ends_with(".app")
    } else {
        EXECUTABLE_EXTENSIONS.iter().any(|ext| name.ends_with(ext))
            || (emd.is_file() && has_exec_bit(emd))
    }
}

/// Does the top level of `dir` hold a runnable-looking entry? Entry metadata does not follow
/// links. Any read error is `Unknown`.
fn top_level_looks_runnable(dir: &Path) -> Result<bool, Refusal> {
    let entries = std::fs::read_dir(dir).map_err(|_| unknown(Reason::CanonicalizeFailed))?;
    for entry in entries {
        let entry = entry.map_err(|_| unknown(Reason::CanonicalizeFailed))?;
        let name = entry.file_name().to_string_lossy().to_lowercase();
        let emd = entry
            .metadata()
            .map_err(|_| unknown(Reason::CanonicalizeFailed))?;
        if entry_looks_runnable(&name, &emd) {
            return Ok(true);
        }
    }
    Ok(false)
}

/// D-22: a sideload folder may be shared (a `Games` folder, a Downloads folder holding several
/// installers). It is removable only when its top level holds no executable-looking entry or app
/// bundle other than the game's own. Over-refusing is the intended direction: on Unix any regular
/// file with an execute bit counts, so a native game folder with helper scripts or libraries
/// refuses rather than risk a sibling.
///
/// WR-06: a sibling that is a real directory (not the game's own entry; a link is not descended)
/// also refuses when its own top level holds such an entry, because that is another game in its
/// own folder. One level down only, never recursive: a `Data/` or `Engine/` folder with no
/// executable at its own top level passes.
fn check_sideload(
    loc: &Location,
    raw_target: &Path,
    executable: Option<&str>,
) -> Result<(), Refusal> {
    let md =
        std::fs::symlink_metadata(&loc.path).map_err(|_| unknown(Reason::CanonicalizeFailed))?;
    if !md.is_dir() {
        return Ok(());
    }
    let own = own_entry(&loc.path, raw_target, executable);
    let entries = std::fs::read_dir(&loc.path).map_err(|_| unknown(Reason::CanonicalizeFailed))?;
    for entry in entries {
        let entry = entry.map_err(|_| unknown(Reason::CanonicalizeFailed))?;
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if own.as_deref() == Some(name.as_str()) {
            continue;
        }
        let emd = entry
            .metadata()
            .map_err(|_| unknown(Reason::CanonicalizeFailed))?;
        if entry_looks_runnable(&name, &emd) {
            return Err(no(Reason::FolderLooksShared));
        }
        if emd.is_dir() && top_level_looks_runnable(&entry.path())? {
            return Err(no(Reason::FolderLooksShared));
        }
    }
    Ok(())
}

fn check_kind(t: &Target, raw: &Path, loc: &Location) -> Result<(), Refusal> {
    // A link is removed as a link and an absent target has nothing in it: the content rules
    // only apply to a real, existing directory or file.
    if loc.is_link || loc.absent {
        return Ok(());
    }
    match t.kind {
        TargetKind::Prefix => check_prefix(loc),
        TargetKind::SideloadFolder => check_sideload(loc, raw, t.executable.as_deref()),
        _ => Ok(()),
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
    check_kind(t, &raw, &loc)?;
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

/// Unlink a symlink or junction. The referent is never opened, listed or removed.
#[cfg(unix)]
fn remove_link(p: &Path, _md: &std::fs::Metadata) -> std::io::Result<()> {
    std::fs::remove_file(p)
}
/// A directory symlink or junction is removed with `remove_dir`, a file symlink with
/// `remove_file`; neither touches the referent.
#[cfg(windows)]
fn remove_link(p: &Path, md: &std::fs::Metadata) -> std::io::Result<()> {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_DIRECTORY: u32 = 0x10;
    if md.file_attributes() & FILE_ATTRIBUTE_DIRECTORY != 0 {
        std::fs::remove_dir(p)
    } else {
        std::fs::remove_file(p)
    }
}
#[cfg(not(any(unix, windows)))]
fn remove_link(p: &Path, _md: &std::fs::Metadata) -> std::io::Result<()> {
    std::fs::remove_file(p)
}

/// Link-ness is re-read here, not carried from the check: a link is unlinked (D-15), a real
/// directory goes through `remove_dir_all` (which never follows links inside the tree and
/// unlinks a symlink swapped into place mid-delete), anything else is a single file.
fn delete_location(loc: &Location) -> std::io::Result<()> {
    let md = std::fs::symlink_metadata(&loc.path)?;
    if safe_path::is_link_metadata(&md) {
        remove_link(&loc.path, &md)
    } else if md.is_dir() {
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
