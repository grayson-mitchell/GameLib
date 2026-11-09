//! Per-file post-processing that needs the parsed manifest (D-10): EDepotFileFlag modes and
//! Windows attributes, the Mach-O +x fallback, path containment, cross-depot path collisions
//! with the case-insensitivity probe, and the flags census.
//!
//! Ports `depot/fileAttributes.ts`, `depot/machO.ts`, `resolveContainedPath` and the symlink
//! guard in `depot/download.ts`, `depot/pathCollisions.ts` and `depot/flagsCensus.ts`.
//!
//! The Mach-O probe is ported directly from `machO.ts` rather than reused from `gamelib-scan`:
//! the scan crate classifies for DRM scanning with different bounds, and the two crates stay
//! decoupled (73-04 decision).

use std::collections::{BTreeSet, HashMap, HashSet};
use std::fs;
use std::io::{self, Read, Seek, SeekFrom};
use std::path::{Component, Path, PathBuf};

use crate::model::ManifestFile;

// EDepotFileFlag values, copied from `depot/planModel.ts` L15-16 and L70-76.
pub const DIRECTORY_FLAG: u32 = 64;
pub const SYMLINK_FLAG: u32 = 512;
pub const EXECUTABLE_FLAG: u32 = 32;
pub const CUSTOM_EXECUTABLE_FLAG: u32 = 128;
pub const READONLY_FLAG: u32 = 8;
pub const HIDDEN_FLAG: u32 = 16;

// ---------------------------------------------------------------------------
// Containment
// ---------------------------------------------------------------------------

/// A manifest filename or symlink target resolved outside the install root (T-21-01).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PathTraversal {
    pub message: String,
}

impl std::fmt::Display for PathTraversal {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for PathTraversal {}

/// Lexical equivalent of Node `path.resolve(base, rel)` for an already-absolute-or-relative
/// `base`: an absolute `rel` replaces the base; `.` is dropped; `..` pops (and is kept when
/// there is nothing left to pop, so a relative root can still be compared).
fn lexical_resolve(base: &Path, rel: &Path) -> Vec<String> {
    let mut parts: Vec<String> = Vec::new();
    let push_all = |p: &Path, parts: &mut Vec<String>| {
        for c in p.components() {
            match c {
                Component::Prefix(_) | Component::RootDir => {
                    parts.clear();
                    parts.push(c.as_os_str().to_string_lossy().into_owned());
                }
                Component::CurDir => {}
                Component::ParentDir => {
                    let can_pop = parts.last().is_some_and(|l| l != ".." && !is_root_part(l));
                    if can_pop {
                        parts.pop();
                    } else if !parts.last().is_some_and(|l| is_root_part(l)) {
                        parts.push("..".to_string());
                    }
                }
                Component::Normal(s) => parts.push(s.to_string_lossy().into_owned()),
            }
        }
    };
    push_all(base, &mut parts);
    if rel.has_root() || matches!(rel.components().next(), Some(Component::Prefix(_))) {
        parts.clear();
    }
    push_all(rel, &mut parts);
    parts
}

fn is_root_part(s: &str) -> bool {
    s == "/" || s == "\\" || s.ends_with(':') || s.starts_with("\\\\")
}

fn parts_to_path(parts: &[String]) -> PathBuf {
    let mut out = PathBuf::new();
    for p in parts {
        out.push(p);
    }
    out
}

/// Port of `relative()`-based containment: contained iff `dest` is `root` or beneath it and the
/// first relative component does not start with `..` (the TS `rel.startsWith('..')` quirk).
fn is_contained(root_parts: &[String], dest_parts: &[String]) -> bool {
    if dest_parts.len() < root_parts.len() || dest_parts[..root_parts.len()] != *root_parts {
        return false;
    }
    match dest_parts.get(root_parts.len()) {
        Some(first) => !first.starts_with(".."),
        None => true,
    }
}

/// Resolve `filename` against `root` and verify containment before any fs call (T-73-14).
/// Backslashes are normalised to `/` first, exactly like `resolveContainedPath`.
pub fn resolve_contained_path(root: &Path, filename: &str) -> Result<PathBuf, PathTraversal> {
    let normalised = filename.replace('\\', "/");
    let root_parts = lexical_resolve(root, Path::new(""));
    let dest_parts = lexical_resolve(root, Path::new(&normalised));
    if !is_contained(&root_parts, &dest_parts) {
        return Err(PathTraversal {
            message: format!(
                "downloadDepotFiles: rejected path-traversal filename \"{filename}\" (escapes {})",
                root.display()
            ),
        });
    }
    Ok(parts_to_path(&dest_parts))
}

/// Reject a symlink whose target, resolved relative to the link's own directory, leaves `root`
/// (T-73-15). `link_path` is the already-contained destination of the link itself.
pub fn check_symlink_target(
    root: &Path,
    link_path: &Path,
    target: &str,
) -> Result<(), PathTraversal> {
    let normalised = target.replace('\\', "/");
    let dir = link_path.parent().unwrap_or(link_path);
    let root_parts = lexical_resolve(root, Path::new(""));
    let resolved = lexical_resolve(dir, Path::new(&normalised));
    if !is_contained(&root_parts, &resolved) {
        return Err(PathTraversal {
            message: format!(
                "downloadDepotFiles: rejected symlink \"{}\" whose target \"{target}\" escapes {}",
                link_path.display(),
                root.display()
            ),
        });
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// File modes
// ---------------------------------------------------------------------------

/// Accumulates the outcome of mode application; feeds `Outcome.allModesApplied`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModeReport {
    pub all_modes_applied: bool,
    pub warnings: Vec<String>,
    /// Reported (never silently skipped) attribute failures, the TS `{ ok: false }` class.
    pub failures: Vec<String>,
}

impl Default for ModeReport {
    fn default() -> Self {
        Self {
            all_modes_applied: true,
            warnings: Vec::new(),
            failures: Vec::new(),
        }
    }
}

impl ModeReport {
    fn fail(&mut self, message: String) {
        self.all_modes_applied = false;
        self.failures.push(message);
    }
}

/// Port of `applyEDepotFileModes` + `applyDepotFileFlags`. The exec chmod failing is an `Err`
/// (the TS awaits `chmod` unguarded and throws); a ReadOnly/Hidden failure is recorded in
/// `report` and the call returns `Ok`, matching the TS `{ ok: false }` shape.
pub fn apply_file_modes(path: &Path, flags: u32, report: &mut ModeReport) -> io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if flags & (EXECUTABLE_FLAG | CUSTOM_EXECUTABLE_FLAG) != 0 {
            fs::set_permissions(path, fs::Permissions::from_mode(0o755))?;
        }
        if flags & (READONLY_FLAG | HIDDEN_FLAG) == 0 {
            return Ok(());
        }
        if flags & HIDDEN_FLAG != 0 {
            // Documented no-op: POSIX hidden is a dot-prefix naming convention; renaming would
            // desync reconciliation against the manifest filename.
            report.warnings.push(format!(
                "fileAttributes: Hidden(16) flag set for \"{}\" - POSIX has no filesystem-attribute equivalent (dot-prefix naming only); no-op.",
                path.display()
            ));
        }
        if flags & READONLY_FLAG != 0 {
            let executable = flags & (EXECUTABLE_FLAG | CUSTOM_EXECUTABLE_FLAG) != 0;
            let mode = if executable { 0o555 } else { 0o444 };
            if let Err(e) = fs::set_permissions(path, fs::Permissions::from_mode(mode)) {
                report.fail(e.to_string());
            }
        }
        Ok(())
    }
    #[cfg(windows)]
    {
        if flags & (READONLY_FLAG | HIDDEN_FLAG) == 0 {
            return Ok(());
        }
        if let Err(e) = windows_attrs::apply(path, flags) {
            report.fail(e.to_string());
        }
        Ok(())
    }
}

#[cfg(windows)]
mod windows_attrs {
    use super::{HIDDEN_FLAG, READONLY_FLAG};
    use std::io;
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;
    use windows_sys::Win32::Storage::FileSystem::{
        GetFileAttributesW, SetFileAttributesW, FILE_ATTRIBUTE_HIDDEN, FILE_ATTRIBUTE_READONLY,
        INVALID_FILE_ATTRIBUTES,
    };

    /// Replaces the TS `attrib +R +H` spawn (T-73-17). `attrib` ORs onto the existing
    /// attributes, so read them first rather than overwrite.
    pub fn apply(path: &Path, flags: u32) -> io::Result<()> {
        let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        // SAFETY: `wide` is a NUL-terminated UTF-16 buffer that outlives both calls.
        let current = unsafe { GetFileAttributesW(wide.as_ptr()) };
        if current == INVALID_FILE_ATTRIBUTES {
            return Err(io::Error::last_os_error());
        }
        let mut attrs = current;
        if flags & READONLY_FLAG != 0 {
            attrs |= FILE_ATTRIBUTE_READONLY;
        }
        if flags & HIDDEN_FLAG != 0 {
            attrs |= FILE_ATTRIBUTE_HIDDEN;
        }
        // SAFETY: as above.
        if unsafe { SetFileAttributesW(wide.as_ptr(), attrs) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Mach-O executable fallback
// ---------------------------------------------------------------------------

const MH_MAGIC: u32 = 0xfeed_face;
const MH_MAGIC_64: u32 = 0xfeed_facf;
const FAT_MAGIC: u32 = 0xcafe_babe;
const MH_EXECUTE: u32 = 0x2;
const MH_DYLIB: u32 = 0x6;
const MACHO_PROBE_BYTES: usize = 4096;
const MACHO_HEADER_BYTES: usize = 32;
const MACHO_MAX_FAT_ARCH: u32 = 32;
const MACHO_MAX_SLICE_OFFSET: u64 = 64 * 1024 * 1024;

fn be32(b: &[u8], o: usize) -> u32 {
    u32::from_be_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]])
}
fn le32(b: &[u8], o: usize) -> u32 {
    u32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]])
}

/// `Some(big_endian)` when a thin Mach-O magic sits at `offset`; LE tried first.
fn detect_endianness(buf: &[u8], offset: usize) -> Option<bool> {
    if buf.len() < offset + 4 {
        return None;
    }
    let le = le32(buf, offset);
    if le == MH_MAGIC || le == MH_MAGIC_64 {
        return Some(false);
    }
    let be = be32(buf, offset);
    if be == MH_MAGIC || be == MH_MAGIC_64 {
        return Some(true);
    }
    None
}

fn is_thin_exec(buf: &[u8], offset: usize) -> bool {
    let Some(big) = detect_endianness(buf, offset) else {
        return false;
    };
    let at = offset + 12;
    if buf.len() < at + 4 {
        return false;
    }
    let filetype = if big { be32(buf, at) } else { le32(buf, at) };
    filetype == MH_EXECUTE || filetype == MH_DYLIB
}

enum Verdict {
    Executable,
    Declined,
    Slice(u64),
}

fn classify_probe(buf: &[u8]) -> Verdict {
    if detect_endianness(buf, 0).is_some() {
        return if is_thin_exec(buf, 0) {
            Verdict::Executable
        } else {
            Verdict::Declined
        };
    }
    if buf.len() >= 8 && be32(buf, 0) == FAT_MAGIC {
        let nfat = be32(buf, 4);
        if (1..=MACHO_MAX_FAT_ARCH).contains(&nfat) && buf.len() >= 8 + 20 {
            let slice_offset = be32(buf, 8 + 8) as usize;
            let table_end = 8 + nfat as usize * 20;
            if slice_offset >= table_end {
                if buf.len() >= slice_offset + 16 {
                    return if is_thin_exec(buf, slice_offset) {
                        Verdict::Executable
                    } else {
                        Verdict::Declined
                    };
                }
                return Verdict::Slice(slice_offset as u64);
            }
        }
    }
    Verdict::Declined
}

/// Is `path` a Mach-O EXECUTE or DYLIB image? Reads at most 4096 bytes, plus one bounded 32-byte
/// read for a fat binary's first slice. Content-gated, never path-gated. The caller owns the
/// "not already executable / not Windows" gate: see [`apply_macho_fallback`].
pub fn macho_wants_exec(path: &Path) -> io::Result<bool> {
    let mut file = fs::File::open(path)?;
    let mut buf = vec![0u8; MACHO_PROBE_BYTES];
    let mut n = 0;
    while n < buf.len() {
        let read = file.read(&mut buf[n..])?;
        if read == 0 {
            break;
        }
        n += read;
    }
    if n < 8 {
        return Ok(false);
    }
    match classify_probe(&buf[..n]) {
        Verdict::Executable => Ok(true),
        Verdict::Declined => Ok(false),
        Verdict::Slice(offset) => {
            if offset > MACHO_MAX_SLICE_OFFSET {
                return Ok(false);
            }
            let size = file.metadata()?.len();
            if offset + MACHO_HEADER_BYTES as u64 > size {
                return Ok(false);
            }
            file.seek(SeekFrom::Start(offset))?;
            let mut slice = [0u8; MACHO_HEADER_BYTES];
            let mut got = 0;
            while got < slice.len() {
                let read = file.read(&mut slice[got..])?;
                if read == 0 {
                    break;
                }
                got += read;
            }
            Ok(got >= 16 && is_thin_exec(&slice[..got], 0))
        }
    }
}

/// Port of `applyMachOExecutableFallback`: best-effort `chmod 0o755` for a landed file whose
/// manifest carried no executable flag but whose bytes are a Mach-O EXECUTE/DYLIB. Never run
/// on Windows; every failure is swallowed into a warning. Returns whether it chmod-ed.
pub fn apply_macho_fallback(path: &Path, flags: u32, report: &mut ModeReport) -> bool {
    if cfg!(windows) || flags & (EXECUTABLE_FLAG | CUSTOM_EXECUTABLE_FLAG) != 0 {
        return false;
    }
    match macho_wants_exec(path) {
        Ok(true) => {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Err(e) = fs::set_permissions(path, fs::Permissions::from_mode(0o755)) {
                    report.warnings.push(format!(
                        "downloadDepotFiles: Mach-O executable fallback failed for {}, continuing without it: {e}",
                        path.display()
                    ));
                    return false;
                }
            }
            report.warnings.push(format!(
                "downloadDepotFiles: applied secondary Mach-O executable fallback (chmod 0o755) to \"{}\" - its manifest carried no Executable/CustomExecutable flag, but its own bytes are a Mach-O EXECUTE/DYLIB image",
                path.display()
            ));
            true
        }
        Ok(false) => false,
        Err(e) => {
            report.warnings.push(format!(
                "downloadDepotFiles: Mach-O executable fallback failed for {}, continuing without it: {e}",
                path.display()
            ));
            false
        }
    }
}

// ---------------------------------------------------------------------------
// Case-insensitivity probe and path collisions
// ---------------------------------------------------------------------------

/// Same key the write path derives: `\` -> `/`, lower-cased only on a case-insensitive volume.
pub fn path_collision_key(filename: &str, case_insensitive: bool) -> String {
    let n = filename.replace('\\', "/");
    if case_insensitive {
        n.to_lowercase()
    } else {
        n
    }
}

fn swap_case(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c.to_lowercase().eq(std::iter::once(c)) {
                c.to_uppercase().collect::<String>()
            } else {
                c.to_lowercase().collect::<String>()
            }
        })
        .collect()
}

/// `(dev, ino)`-equivalent identity of a directory entry, or an io error.
pub type StatIdentity = (u64, u64);

fn stat_identity(p: &Path) -> io::Result<StatIdentity> {
    let md = fs::metadata(p)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        Ok((md.dev(), md.ino()))
    }
    #[cfg(not(unix))]
    {
        // No inode on Windows via std stable: creation+write time plus length is not an identity,
        // so fall back to canonical-path equality in `probe_case_insensitive_with`.
        let _ = md;
        Err(io::Error::from(io::ErrorKind::Unsupported))
    }
}

/// Testable core of [`probe_case_insensitive`]: `stat` and `fallback` are injected.
///
/// Read-only like the TS: two stats on the directory's own name and its case-swapped spelling,
/// never a file creation (the directory may be a user's real library). Equal identity means the
/// swapped spelling reached the same entry. Anything inconclusive (no letters in the name, the
/// directory missing, permission denied) falls back to the platform default.
pub fn probe_case_insensitive_with<F>(dir: &Path, stat: F, fallback: bool) -> bool
where
    F: Fn(&Path) -> io::Result<StatIdentity>,
{
    let Some(name) = dir.file_name().map(|n| n.to_string_lossy().into_owned()) else {
        return fallback;
    };
    let swapped = swap_case(&name);
    if swapped == name {
        return fallback;
    }
    let Ok(orig) = stat(dir) else {
        return fallback;
    };
    let alt_path = dir.parent().unwrap_or_else(|| Path::new("")).join(&swapped);
    match stat(&alt_path) {
        Ok(alt) => alt == orig,
        Err(e) if e.kind() == io::ErrorKind::NotFound => false,
        Err(_) => fallback,
    }
}

/// Is the volume holding `dir` case-insensitive? Platform default when inconclusive: Linux
/// case-sensitive, macOS/Windows case-insensitive.
pub fn probe_case_insensitive(dir: &Path) -> io::Result<bool> {
    let fallback = !cfg!(target_os = "linux");
    #[cfg(unix)]
    {
        Ok(probe_case_insensitive_with(dir, stat_identity, fallback))
    }
    #[cfg(not(unix))]
    {
        // No dev+ino here: a case-swapped spelling that resolves to the same canonical path is
        // the same entry.
        let name = dir
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let swapped = swap_case(&name);
        if swapped == name {
            return Ok(fallback);
        }
        let alt = dir.parent().unwrap_or_else(|| Path::new("")).join(&swapped);
        match (fs::canonicalize(dir), fs::canonicalize(&alt)) {
            (Ok(a), Ok(b)) => Ok(a == b),
            (Ok(_), Err(e)) if e.kind() == io::ErrorKind::NotFound => Ok(false),
            _ => Ok(fallback),
        }
    }
}

/// One selected depot's files, with the appinfo ordering facts the later-depot-wins rule needs.
#[derive(Debug, Clone)]
pub struct CollisionDepot<'a> {
    pub depot_id: &'a str,
    pub owner_app_id: Option<&'a str>,
    pub appinfo_rank: Option<u32>,
    pub files: &'a [ManifestFile],
}

/// What [`detect_path_collisions`] decided. Nothing is mutated; the caller drops `dropped`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CollisionPlan {
    /// Paths where a losing entry was dropped (one entry per path).
    pub resolved: Vec<String>,
    /// Paths claimed more than once that were refused (left unchanged).
    pub unresolved: Vec<String>,
    /// `(depot index, file index)` of every entry to drop.
    pub dropped: Vec<(usize, usize)>,
    /// Bytes of dropped real-file entries (directory markers contribute 0).
    pub dropped_bytes: u64,
    pub warnings: Vec<String>,
}

fn is_empty_dir_entry(f: &ManifestFile) -> bool {
    f.flags != 0 && f.flags & DIRECTORY_FLAG != 0 && f.size == 0 && f.chunks.is_empty()
}

fn has_content(f: &ManifestFile) -> bool {
    !f.chunks.is_empty() || f.size > 0
}

struct Claim {
    depot_idx: usize,
    file_idx: usize,
}

/// Port of `resolveDepotPathCollisions`, with the same winner/report semantics.
pub fn detect_path_collisions(
    depots: &[CollisionDepot<'_>],
    case_insensitive: bool,
) -> CollisionPlan {
    let mut order: Vec<String> = Vec::new();
    let mut by_path: HashMap<String, Vec<Claim>> = HashMap::new();
    for (di, depot) in depots.iter().enumerate() {
        for (fi, file) in depot.files.iter().enumerate() {
            let key = path_collision_key(&file.filename, case_insensitive);
            by_path
                .entry(key.clone())
                .or_insert_with(|| {
                    order.push(key.clone());
                    Vec::new()
                })
                .push(Claim {
                    depot_idx: di,
                    file_idx: fi,
                });
        }
    }

    let file_of = |c: &Claim| &depots[c.depot_idx].files[c.file_idx];
    let mut plan = CollisionPlan::default();
    let mut dropped: HashSet<(usize, usize)> = HashSet::new();

    for key in &order {
        let claims = &by_path[key];
        let Some(first) = claims.first() else {
            continue;
        };
        if claims.len() < 2 {
            continue;
        }
        let path = path_collision_key(&file_of(first).filename, false);
        let mut spellings: Vec<(String, Vec<&str>)> = Vec::new();
        for c in claims {
            let sp = path_collision_key(&file_of(c).filename, false);
            let id = depots[c.depot_idx].depot_id;
            match spellings.iter_mut().find(|(s, _)| *s == sp) {
                Some((_, ids)) => ids.push(id),
                None => spellings.push((sp, vec![id])),
            }
        }
        let case_note = if spellings.len() > 1 {
            let joined = spellings
                .iter()
                .map(|(sp, ids)| format!("\"{sp}\" (depot {})", ids.join(",")))
                .collect::<Vec<_>>()
                .join(" vs ");
            format!(" [case-only collision on a case-insensitive volume: {joined}]")
        } else {
            String::new()
        };

        let empty_dirs: Vec<&Claim> = claims
            .iter()
            .filter(|c| is_empty_dir_entry(file_of(c)))
            .collect();
        let content: Vec<&Claim> = claims.iter().filter(|c| has_content(file_of(c))).collect();

        // Bare directory markers only: one mkdir satisfies all of them. Silent.
        if empty_dirs.len() == claims.len() {
            continue;
        }

        // The Fallout 2 shape: bare directory markers against exactly one real file; file wins.
        if !empty_dirs.is_empty() && content.len() == 1 {
            let only = content[0];
            for d in &empty_dirs {
                dropped.insert((d.depot_idx, d.file_idx));
            }
            plan.resolved.push(path.clone());
            plan.warnings.push(format!(
                "buildDepotPlan: cross-depot path collision on \"{path}\" - depot(s) {} declare it a Directory while depot {} declares a file of {} bytes ({} chunks). Keeping the FILE and dropping the directory marker(s).{case_note}",
                empty_dirs.iter().map(|d| depots[d.depot_idx].depot_id).collect::<Vec<_>>().join(","),
                depots[only.depot_idx].depot_id,
                file_of(only).size,
                file_of(only).chunks.len(),
            ));
            continue;
        }

        // Two or more REAL files: the depot later in the app's appinfo order wins, but only when
        // every claimant has a distinct recovered rank in the SAME owner app.
        if empty_dirs.is_empty() && content.len() == claims.len() {
            let owner = depots[claims[0].depot_idx].owner_app_id;
            let order_known = owner.is_some()
                && claims.iter().all(|c| {
                    let d = &depots[c.depot_idx];
                    d.owner_app_id == owner && d.appinfo_rank.is_some()
                })
                && claims
                    .iter()
                    .map(|c| depots[c.depot_idx].appinfo_rank)
                    .collect::<HashSet<_>>()
                    .len()
                    == claims.len();
            if order_known {
                let rank = |c: &Claim| depots[c.depot_idx].appinfo_rank.map_or(-1i64, i64::from);
                let mut winner = &claims[0];
                for c in &claims[1..] {
                    if rank(c) > rank(winner) {
                        winner = c;
                    }
                }
                let losers: Vec<&Claim> = claims
                    .iter()
                    .filter(|c| !std::ptr::eq(*c, winner))
                    .collect();
                for l in &losers {
                    dropped.insert((l.depot_idx, l.file_idx));
                }
                plan.resolved.push(path.clone());
                plan.warnings.push(format!(
                    "buildDepotPlan: RESOLVED cross-depot file collision on \"{path}\" - winner depot {} (size={}, appinfo rank {}), dropped depot(s) {} by rule \"later in the app's appinfo depot order wins\".{case_note}",
                    depots[winner.depot_idx].depot_id,
                    file_of(winner).size,
                    rank(winner),
                    losers
                        .iter()
                        .map(|l| format!(
                            "{} (size={}, rank {})",
                            depots[l.depot_idx].depot_id,
                            file_of(l).size,
                            rank(l)
                        ))
                        .collect::<Vec<_>>()
                        .join(", "),
                ));
                continue;
            }
        }

        plan.unresolved.push(path.clone());
        plan.warnings.push(format!(
            "buildDepotPlan: UNRESOLVED cross-depot path collision on \"{path}\" claimed by depot(s) {} [{}] - left in the plan unchanged, no winner guessed.{case_note}",
            claims.iter().map(|c| depots[c.depot_idx].depot_id).collect::<Vec<_>>().join(","),
            claims
                .iter()
                .map(|c| format!(
                    "size={} chunks={} flags={}",
                    file_of(c).size,
                    file_of(c).chunks.len(),
                    file_of(c).flags
                ))
                .collect::<Vec<_>>()
                .join(" | "),
        ));
    }

    let mut list: Vec<(usize, usize)> = dropped.into_iter().collect();
    list.sort_unstable();
    plan.dropped_bytes = list.iter().map(|&(d, f)| depots[d].files[f].size).sum();
    plan.dropped = list;
    plan
}

// ---------------------------------------------------------------------------
// Flags census
// ---------------------------------------------------------------------------

/// Stable greppable log prefix, `FLAGS_CENSUS_LOG_PREFIX` in `flagsCensus.ts`.
pub const FLAGS_CENSUS_LOG_PREFIX: &str = "steam-flags-census";
/// `MAX_DISTINCT_FLAG_VALUES` (T-23-17): bounds log size on huge manifests.
const MAX_DISTINCT_FLAG_VALUES: usize = 1 << 5;

/// Aggregate-only EDepotFileFlag census (no filename ever leaves it, T-23-16).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct FlagsCensus {
    pub total_files: u64,
    pub flag_bearing: u64,
    pub executable_flagged: u64,
    pub readonly_flagged: u64,
    pub hidden_flagged: u64,
    pub directory_entries: u64,
    pub symlink_entries: u64,
    pub zero_size_entries: u64,
    distinct: BTreeSet<u32>,
}

impl FlagsCensus {
    pub fn new() -> Self {
        Self::default()
    }

    /// Count one manifest entry, mirroring `summarizeDepotFlags`' per-file loop.
    pub fn add(&mut self, file: &ManifestFile) {
        self.total_files += 1;
        if file.chunks.is_empty() || file.size == 0 {
            self.zero_size_entries += 1;
        }
        // Mirrors the production `if (file.flags)` truthiness guard: flags 0 is not flag-bearing.
        let flags = file.flags;
        if flags == 0 {
            return;
        }
        self.flag_bearing += 1;
        if self.distinct.len() < MAX_DISTINCT_FLAG_VALUES {
            self.distinct.insert(flags);
        }
        if flags & (EXECUTABLE_FLAG | CUSTOM_EXECUTABLE_FLAG) != 0 {
            self.executable_flagged += 1;
        }
        if flags & READONLY_FLAG != 0 {
            self.readonly_flagged += 1;
        }
        if flags & HIDDEN_FLAG != 0 {
            self.hidden_flagged += 1;
        }
        if flags & DIRECTORY_FLAG != 0 {
            self.directory_entries += 1;
        }
        if flags & SYMLINK_FLAG != 0 {
            self.symlink_entries += 1;
        }
    }

    /// Distinct flag values seen, ascending, capped at 32.
    pub fn distinct_flag_values(&self) -> Vec<u32> {
        self.distinct.iter().copied().collect()
    }

    /// `formatDepotFlagsCensus`: a single `key=value` line, `extra` counters folded in before
    /// `distinctFlagValues`. Callers prepend [`FLAGS_CENSUS_LOG_PREFIX`].
    pub fn summary_line(&self, extra: &[(&str, String)]) -> String {
        let mut fields: Vec<(String, String)> = vec![
            ("totalFiles".into(), self.total_files.to_string()),
            ("flagBearing".into(), self.flag_bearing.to_string()),
            (
                "executableFlagged".into(),
                self.executable_flagged.to_string(),
            ),
            ("readonlyFlagged".into(), self.readonly_flagged.to_string()),
            ("hiddenFlagged".into(), self.hidden_flagged.to_string()),
            (
                "directoryEntries".into(),
                self.directory_entries.to_string(),
            ),
            ("symlinkEntries".into(), self.symlink_entries.to_string()),
            ("zeroSizeEntries".into(), self.zero_size_entries.to_string()),
        ];
        for (k, v) in extra {
            fields.push(((*k).to_string(), v.clone()));
        }
        let distinct = self
            .distinct
            .iter()
            .map(u32::to_string)
            .collect::<Vec<_>>()
            .join(",");
        fields.push(("distinctFlagValues".into(), format!("[{distinct}]")));
        fields
            .iter()
            .map(|(k, v)| format!("{k}={v}"))
            .collect::<Vec<_>>()
            .join(" ")
    }
}
