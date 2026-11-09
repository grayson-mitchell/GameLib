//! sha1-gated partial-state reconciliation (D-10) and the post-download structural check.
//! Ports `depot/reconcile.ts`.
//!
//! Load-bearing invariant: existence guarantees nothing, sha1 guarantees content. A present
//! regular file is skipped only after streaming SHA1 equals `sha_content`. Directory and symlink
//! entries are verified by shape; zero-size files by existence + size 0. Every path goes through
//! `resolve_contained_path`; a traversal is an error, never a silent skip.
//!
//! Results are indices into the caller's `files` slice (filenames repeat across depots).

use std::collections::HashMap;
use std::fs;
use std::io::{self, Read};
use std::path::Path;
use std::sync::Arc;

use sha1::{Digest, Sha1};
use tokio::sync::Semaphore;
use tokio_util::sync::CancellationToken;

use crate::model::ManifestFile;
use crate::post::{path_collision_key, resolve_contained_path, PathTraversal};

const DIRECTORY_FLAG: u32 = 64;
const SYMLINK_FLAG: u32 = 512;
/// Matches `FAILURE_LOG_CAP`-style bounding for the structural mismatch report.
pub const MISMATCH_REPORT_CAP: usize = 10;
const HASH_BUF: usize = 1024 * 1024;

#[derive(Debug)]
pub enum ReconcileError {
    Traversal(PathTraversal),
    Io(io::Error),
}

impl std::fmt::Display for ReconcileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ReconcileError::Traversal(e) => e.fmt(f),
            ReconcileError::Io(e) => e.fmt(f),
        }
    }
}

impl std::error::Error for ReconcileError {}

impl From<PathTraversal> for ReconcileError {
    fn from(e: PathTraversal) -> Self {
        ReconcileError::Traversal(e)
    }
}

impl From<io::Error> for ReconcileError {
    fn from(e: io::Error) -> Self {
        ReconcileError::Io(e)
    }
}

#[derive(Debug, Default)]
pub struct ReconcileResult {
    /// Verified already-correct entries (excluded from the download).
    pub skipped: Vec<usize>,
    /// Missing, wrong-sized or content-mismatched entries (to fetch).
    pub queued: Vec<usize>,
    /// Filenames of `queued` entries (verify_only reports these).
    pub missing: Vec<String>,
    /// Queued entries whose path holds a directory where a regular file belongs (clear first).
    pub stale_dirs: Vec<usize>,
    /// Summed `size` of skipped entries.
    pub bytes_verified: u64,
    /// False when cancellation stopped the walk early (undecided entries are in neither list).
    pub complete: bool,
}

impl ReconcileResult {
    pub fn all_files_verified(&self) -> bool {
        self.complete && self.queued.is_empty()
    }
}

fn is_zero_size(f: &ManifestFile) -> bool {
    f.chunks.is_empty() || f.size == 0
}

fn directory_verified(dest: &Path) -> bool {
    fs::symlink_metadata(dest).is_ok_and(|m| m.is_dir())
}

fn symlink_verified(dest: &Path, linktarget: Option<&str>) -> bool {
    let Some(t) = linktarget.filter(|t| !t.is_empty()) else {
        return false;
    };
    let Ok(m) = fs::symlink_metadata(dest) else {
        return false;
    };
    if !m.file_type().is_symlink() {
        return false;
    }
    fs::read_link(dest).is_ok_and(|l| l.as_os_str() == t)
}

fn zero_size_verified(dest: &Path) -> bool {
    fs::metadata(dest).is_ok_and(|m| m.is_file() && m.len() == 0)
}

#[derive(Debug, PartialEq, Eq)]
enum Shape {
    Ok,
    Missing,
    NotAFile,
    WrongSize(u64),
}

fn regular_file_shape(dest: &Path, f: &ManifestFile) -> Shape {
    let Ok(m) = fs::metadata(dest) else {
        return Shape::Missing;
    };
    if !m.is_file() {
        return Shape::NotAFile;
    }
    if m.len() != f.size {
        return Shape::WrongSize(m.len());
    }
    Shape::Ok
}

/// Streaming SHA1 with a 1 MiB buffer; never reads the whole file into memory.
pub fn sha1_file(path: &Path) -> io::Result<[u8; 20]> {
    let mut file = fs::File::open(path)?;
    let mut h = Sha1::new();
    let mut buf = vec![0u8; HASH_BUF];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(h.finalize().into())
}

enum Decision {
    Skip,
    Queue { stale_dir: bool },
    NeedsHash(std::path::PathBuf),
}

fn decide(dest: &Path, f: &ManifestFile) -> Decision {
    if f.flags & DIRECTORY_FLAG != 0 {
        return if directory_verified(dest) {
            Decision::Skip
        } else {
            Decision::Queue { stale_dir: false }
        };
    }
    if f.flags & SYMLINK_FLAG != 0 {
        return if symlink_verified(dest, f.linktarget.as_deref()) {
            Decision::Skip
        } else {
            Decision::Queue { stale_dir: false }
        };
    }
    if is_zero_size(f) {
        return if zero_size_verified(dest) {
            Decision::Skip
        } else {
            Decision::Queue { stale_dir: false }
        };
    }
    match regular_file_shape(dest, f) {
        Shape::Ok => Decision::NeedsHash(dest.to_path_buf()),
        Shape::NotAFile => Decision::Queue {
            stale_dir: fs::symlink_metadata(dest).is_ok_and(|m| m.is_dir()),
        },
        _ => Decision::Queue { stale_dir: false },
    }
}

/// Walk `files`, deciding which can be skipped. Hashing runs on `spawn_blocking` behind a
/// semaphore of `hash_threads` permits. Cancellation is checked between files.
pub async fn reconcile_partial_state(
    root: &Path,
    files: &[&ManifestFile],
    cancel: &CancellationToken,
    hash_threads: usize,
) -> Result<ReconcileResult, ReconcileError> {
    let sem = Arc::new(Semaphore::new(hash_threads.max(1)));
    // Per-index verdict: None = undecided.
    let mut verdict: Vec<Option<Decision>> = Vec::with_capacity(files.len());
    let mut tasks: Vec<(usize, tokio::task::JoinHandle<io::Result<bool>>)> = Vec::new();
    let mut complete = true;

    for (i, f) in files.iter().enumerate() {
        if cancel.is_cancelled() {
            complete = false;
            verdict.push(None);
            continue;
        }
        let dest = resolve_contained_path(root, &f.filename)?;
        match decide(&dest, f) {
            Decision::NeedsHash(p) => {
                let expect = f.sha_content;
                let permit = tokio::select! {
                    p = sem.clone().acquire_owned() => p.ok(),
                    _ = cancel.cancelled() => None,
                };
                let Some(permit) = permit else {
                    complete = false;
                    verdict.push(None);
                    continue;
                };
                tasks.push((
                    i,
                    tokio::task::spawn_blocking(move || {
                        let _permit = permit;
                        Ok(sha1_file(&p)? == expect)
                    }),
                ));
                verdict.push(None);
            }
            d => verdict.push(Some(d)),
        }
    }

    let mut hashed: HashMap<usize, bool> = HashMap::new();
    for (i, h) in tasks {
        match h.await {
            Ok(Ok(ok)) => {
                hashed.insert(i, ok);
            }
            // A file that vanished or became unreadable between stat and hash is just queued.
            Ok(Err(_)) => {
                hashed.insert(i, false);
            }
            Err(e) => return Err(ReconcileError::Io(io::Error::other(e.to_string()))),
        }
    }

    let mut out = ReconcileResult::default();
    for (i, v) in verdict.into_iter().enumerate() {
        let f = files[i];
        let (skip, queue, stale) = match v {
            Some(Decision::Skip) => (true, false, false),
            Some(Decision::Queue { stale_dir }) => (false, true, stale_dir),
            Some(Decision::NeedsHash(_)) => unreachable!("hash decisions are resolved above"),
            None => match hashed.get(&i) {
                Some(true) => (true, false, false),
                Some(false) => (false, true, false),
                None => (false, false, false),
            },
        };
        if skip {
            out.skipped.push(i);
            out.bytes_verified += f.size;
        } else if queue {
            out.queued.push(i);
            out.missing.push(f.filename.clone());
            if stale {
                out.stale_dirs.push(i);
            }
        }
    }
    out.complete = complete;
    Ok(out)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StructuralReason {
    Missing,
    NotAFile,
    WrongSize,
    NotADirectory,
    BadSymlink,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StructuralMismatch {
    pub filename: String,
    pub reason: StructuralReason,
    pub expected_size: Option<u64>,
    pub found_size: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct StructuralVerifyResult {
    pub ok: bool,
    pub checked: u64,
    /// Total, never truncated.
    pub mismatch_count: u64,
    /// Bounded to `MISMATCH_REPORT_CAP`.
    pub mismatches: Vec<StructuralMismatch>,
}

fn matches_any_claim(dest: &Path, claims: &[&ManifestFile]) -> bool {
    let Ok(m) = fs::metadata(dest) else {
        return false;
    };
    let same: Vec<_> = claims.iter().filter(|c| c.size == m.len()).collect();
    if same.is_empty() {
        return false;
    }
    let Ok(got) = sha1_file(dest) else {
        return false;
    };
    same.iter().any(|c| c.sha_content == got)
}

/// Post-download damage detector (type + size, no sha1 except to disambiguate a collided path).
/// Not a substitute for the reconcile sha1 gate. A traversal filename is an `Err`.
pub fn verify_structural_integrity(
    root: &Path,
    files: &[&ManifestFile],
    case_insensitive: bool,
) -> Result<StructuralVerifyResult, PathTraversal> {
    let mut mismatches = Vec::new();
    let mut checked = 0u64;
    let mut count = 0u64;
    let mut record = |filename: &str, reason, expected: Option<u64>, found: Option<u64>| {
        count += 1;
        if mismatches.len() < MISMATCH_REPORT_CAP {
            mismatches.push(StructuralMismatch {
                filename: filename.to_string(),
                reason,
                expected_size: expected,
                found_size: found,
            });
        }
    };

    let mut claims: HashMap<String, Vec<&ManifestFile>> = HashMap::new();
    for f in files {
        if f.flags & (DIRECTORY_FLAG | SYMLINK_FLAG) != 0 || is_zero_size(f) {
            continue;
        }
        claims
            .entry(path_collision_key(&f.filename, case_insensitive))
            .or_default()
            .push(f);
    }

    for f in files {
        checked += 1;
        let dest = resolve_contained_path(root, &f.filename)?;
        if f.flags & DIRECTORY_FLAG != 0 {
            if !directory_verified(&dest) {
                record(&f.filename, StructuralReason::NotADirectory, None, None);
            }
            continue;
        }
        if f.flags & SYMLINK_FLAG != 0 {
            if !symlink_verified(&dest, f.linktarget.as_deref()) {
                record(&f.filename, StructuralReason::BadSymlink, None, None);
            }
            continue;
        }
        if is_zero_size(f) {
            if !zero_size_verified(&dest) {
                record(&f.filename, StructuralReason::WrongSize, Some(0), None);
            }
            continue;
        }
        let (reason, found) = match regular_file_shape(&dest, f) {
            Shape::Ok => continue,
            Shape::Missing => (StructuralReason::Missing, None),
            Shape::NotAFile => (StructuralReason::NotAFile, None),
            Shape::WrongSize(n) => {
                let rivals = claims.get(&path_collision_key(&f.filename, case_insensitive));
                if rivals.is_some_and(|r| r.len() > 1 && matches_any_claim(&dest, r)) {
                    continue;
                }
                (StructuralReason::WrongSize, Some(n))
            }
        };
        record(&f.filename, reason, Some(f.size), found);
    }

    Ok(StructuralVerifyResult {
        ok: count == 0,
        checked,
        mismatch_count: count,
        mismatches,
    })
}
