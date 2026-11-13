//! Chunk-level delta update (Phase 74), productionised from spike 076.
//!
//! A `mode: install` job whose depots carry `fromManifest` (the installed GID) is planned against
//! the old manifest, built beside the old tree, and only then committed:
//!
//! 1. plan: the work set is every regular file the new manifests changed or added; every chunk of
//!    it is looked up (by SHA-1) in the old files on disk and SHA-1 checked from its local bytes;
//!    whatever no old file can supply is the CDN list;
//! 2. build: each work file is assembled as `<target>.gamelib-delta-tmp` from verified local
//!    chunks plus decoded CDN chunks and checked against `sha_content`. The old tree and the
//!    appmanifest are untouched, so a cancel or failure here leaves the old build launchable (D-16);
//! 3. commit: temps are renamed over their targets, files the new manifests dropped are deleted,
//!    directories and symlinks are placed, modes applied, and the ACF finalized.
//!
//! Only manifest-owned paths are ever written or deleted. Every path (read, write, rename,
//! delete) goes through `post::resolve_contained_path`; unowned files and game-modified files the
//! update did not change are never touched.

use crate::acf::{self, RunOutcome, RunResult};
use crate::container::{decode_chunk, ContainerKind};
use crate::download::{
    apply_modes_sync, clear_stale_dir, default_decode_threads, failed, failure, hex, io_failed,
    io_kind, key_from_hex, outcome_shell, place_symlink, plain_failure, write_all_at, Counters,
    FileErr, CHUNK_CONCURRENCY, FILE_CONCURRENCY, OUTCOME_FAILURE_CAP,
};
use crate::events::{ProgressEmitter, Snapshot};
use crate::fetch::{FetchError, Fetcher, ERESULT_BLOCKED};
use crate::inflight::{InflightLimiter, TARGET_INFLIGHT_CHUNKS};
use crate::job::{DepotJob, DepotRef, JobMode, PlannedDepot};
use crate::manifest::{normalize_depot_path, ManifestStore};
use crate::model::{ChunkRef, DepotManifest, ManifestFile};
use crate::outcome::{
    select_primary_failure, AcfResult, Containers, DeltaMode, DeltaReport, ErrorKind, Failure,
    FailureScope, Outcome, Stats, Status,
};
use crate::post::{
    check_symlink_target, detect_path_collisions, probe_case_insensitive, resolve_contained_path,
    CollisionDepot, DIRECTORY_FLAG, SYMLINK_FLAG,
};
use crate::reconcile::sha1_file;
use crate::stall::StallTracker;
use crate::{JobContext, JobHost};
use futures_util::stream::{self, StreamExt};
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::{Mutex as AsyncMutex, Semaphore};
use tokio_util::sync::CancellationToken;

/// Suffix of the temp each changed file is built into, beside its target.
pub const DELTA_TMP_SUFFIX: &str = ".gamelib-delta-tmp";

/// A local chunk longer than this is never read (the length comes from an untrusted manifest).
const MAX_LOCAL_CHUNK: u32 = 64 * 1024 * 1024;
/// Open handles kept while scanning candidates in one pass.
const HANDLE_CACHE: usize = 64;

// ---------------------------------------------------------------------------
// Pure planning
// ---------------------------------------------------------------------------

/// What a depot's update touches: files to rebuild, files whose only change is flags, and a count
/// of the rest.
pub struct WorkSet<'a> {
    pub changed: Vec<&'a ManifestFile>,
    pub flag_only: Vec<&'a ManifestFile>,
    pub unchanged: usize,
}

fn is_regular(f: &ManifestFile) -> bool {
    f.flags & (DIRECTORY_FLAG | SYMLINK_FLAG) == 0
}

/// `old == None` means the depot is new in this build: every regular file is changed. Files match
/// by `normalize_depot_path`; same `sha_content` with different flags is a mode apply only.
pub fn compute_work_set<'a>(old: Option<&'a DepotManifest>, new: &'a DepotManifest) -> WorkSet<'a> {
    let by_path: HashMap<String, &ManifestFile> = old
        .map(|m| {
            m.files
                .iter()
                .filter(|f| is_regular(f))
                .map(|f| (normalize_depot_path(&f.filename), f))
                .collect()
        })
        .unwrap_or_default();
    let mut ws = WorkSet {
        changed: Vec::new(),
        flag_only: Vec::new(),
        unchanged: 0,
    };
    for f in new.files.iter().filter(|f| is_regular(f)) {
        match by_path.get(&normalize_depot_path(&f.filename)) {
            None => ws.changed.push(f),
            Some(o) if o.sha_content != f.sha_content => ws.changed.push(f),
            Some(o) if o.flags != f.flags => ws.flag_only.push(f),
            Some(_) => ws.unchanged += 1,
        }
    }
    ws
}

fn owned_set(new: &[&DepotManifest]) -> HashSet<String> {
    new.iter()
        .flat_map(|m| m.files.iter())
        .map(|f| normalize_depot_path(&f.filename))
        .collect()
}

/// Regular files and symlinks an old manifest owns whose case-folded normalised path no new
/// manifest owns. Manifest-form filenames, de-duplicated by normalised path.
pub fn removed_paths(old: &[&DepotManifest], new: &[&DepotManifest]) -> Vec<String> {
    let owned = owned_set(new);
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for f in old.iter().flat_map(|m| m.files.iter()) {
        if f.flags & DIRECTORY_FLAG != 0 {
            continue;
        }
        let n = normalize_depot_path(&f.filename);
        if !owned.contains(&n) && seen.insert(n) {
            out.push(f.filename.clone());
        }
    }
    out
}

/// Directories an old manifest owned and no new manifest does (including the parents of removed
/// files), deepest first, manifest form. Removal is best effort (`remove_dir` refuses non-empty).
fn removable_dirs(
    old: &[&DepotManifest],
    new: &[&DepotManifest],
    removed: &[String],
) -> Vec<String> {
    let mut keep = owned_set(new);
    for n in keep.clone() {
        let mut p = n.as_str();
        while let Some((parent, _)) = p.rsplit_once('/') {
            keep.insert(parent.to_string());
            p = parent;
        }
    }
    let mut cands: Vec<String> = Vec::new();
    for f in old.iter().flat_map(|m| m.files.iter()) {
        if f.flags & DIRECTORY_FLAG != 0 {
            cands.push(f.filename.clone());
        }
    }
    for r in removed {
        let norm = r.replace('\\', "/");
        let mut p = norm.as_str();
        while let Some((parent, _)) = p.rsplit_once('/') {
            if !parent.is_empty() {
                cands.push(parent.to_string());
            }
            p = parent;
        }
    }
    let mut seen = HashSet::new();
    let mut out: Vec<String> = cands
        .into_iter()
        .filter(|d| {
            let n = normalize_depot_path(d).trim_end_matches('/').to_string();
            !n.is_empty() && !keep.contains(&n) && seen.insert(n)
        })
        .collect();
    out.sort_by_key(|d| std::cmp::Reverse(d.matches(['/', '\\']).count()));
    out
}

// ---------------------------------------------------------------------------
// Job shape
// ---------------------------------------------------------------------------

/// True when the job asks for a delta (any `fromManifest` on an install job).
pub fn is_delta_job(job: &DepotJob) -> bool {
    job.mode == JobMode::Install && job.depots.iter().any(|d| d.from_manifest.is_some())
}

/// The shapes this pipeline cannot serve, refused before any network use.
pub fn shape_failure(job: &DepotJob) -> Option<Failure> {
    let any_from = job.depots.iter().any(|d| d.from_manifest.is_some());
    let unsupported = |m: &str| Some(plain_failure(ErrorKind::DeltaUnsupported, m));
    if any_from && job.mode != JobMode::Install {
        return unsupported("fromManifest is only supported on install jobs");
    }
    let bad_id = job
        .depots
        .iter()
        .filter_map(|d| d.from_manifest.as_deref())
        .any(|g| g.is_empty() || !g.bytes().all(|b| b.is_ascii_digit()));
    if bad_id {
        return unsupported("fromManifest must be a numeric manifest id");
    }
    if !job.retired_depots.is_empty() && !any_from {
        return unsupported("retiredDepots requires a delta job");
    }
    if any_from && job.finalize.is_none() {
        return unsupported("a delta job requires finalize");
    }
    None
}

// ---------------------------------------------------------------------------
// Old tree: chunk index and verified local reads
// ---------------------------------------------------------------------------

#[cfg(unix)]
fn read_exact_at(f: &fs::File, buf: &mut [u8], offset: u64) -> io::Result<()> {
    use std::os::unix::fs::FileExt;
    f.read_exact_at(buf, offset)
}

#[cfg(windows)]
fn read_exact_at(f: &fs::File, buf: &mut [u8], offset: u64) -> io::Result<()> {
    use std::os::windows::fs::FileExt;
    let mut done = 0usize;
    while done < buf.len() {
        let n = f.seek_read(&mut buf[done..], offset + done as u64)?;
        if n == 0 {
            return Err(io::ErrorKind::UnexpectedEof.into());
        }
        done += n;
    }
    Ok(())
}

/// sha -> where the old tree may hold those bytes: (path index, offset, length).
struct OldIndex {
    paths: Vec<PathBuf>,
    map: HashMap<[u8; 20], Vec<(u32, u64, u32)>>,
}

impl OldIndex {
    fn build(root: &Path, olds: &[&DepotManifest]) -> Self {
        let mut idx = OldIndex {
            paths: Vec::new(),
            map: HashMap::new(),
        };
        for f in olds.iter().flat_map(|m| m.files.iter()) {
            if !is_regular(f) || f.chunks.is_empty() {
                continue;
            }
            // An old manifest is as untrusted as a new one: a path that escapes is skipped.
            let Ok(p) = resolve_contained_path(root, &f.filename) else {
                continue;
            };
            let pi = idx.paths.len() as u32;
            idx.paths.push(p);
            for c in &f.chunks {
                idx.map
                    .entry(c.sha)
                    .or_default()
                    .push((pi, c.offset, c.cb_original));
            }
        }
        idx
    }

    /// The bytes of chunk `sha` (`len` long) read from an old file and SHA-1 verified, or `None`.
    /// Symlinks are never read.
    fn read_verified(
        &self,
        sha: &[u8; 20],
        len: u32,
        handles: &mut HashMap<u32, Option<fs::File>>,
    ) -> Option<Vec<u8>> {
        if len == 0 || len > MAX_LOCAL_CHUNK {
            return None;
        }
        for &(pi, off, clen) in self.map.get(sha)? {
            if clen != len {
                continue;
            }
            if handles.len() >= HANDLE_CACHE {
                handles.clear();
            }
            let slot = handles.entry(pi).or_insert_with(|| {
                let p = &self.paths[pi as usize];
                match fs::symlink_metadata(p) {
                    Ok(m) if m.file_type().is_file() => fs::File::open(p).ok(),
                    _ => None,
                }
            });
            let Some(f) = slot else { continue };
            let mut buf = vec![0u8; len as usize];
            if read_exact_at(f, &mut buf, off).is_err() {
                continue;
            }
            if Sha1::digest(&buf).as_slice() == sha {
                return Some(buf);
            }
        }
        None
    }
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

struct Work<'a> {
    di: usize,
    file: &'a ManifestFile,
    dest: PathBuf,
    tmp: PathBuf,
    seed: usize,
}

type CdnKey = (usize, [u8; 20]);

/// A CDN chunk wanted by `remaining` work chunks. Wanted more than once, the decoded bytes are
/// kept until the last user has written them, so it is fetched exactly once.
struct CdnSlot {
    cache: bool,
    data: AsyncMutex<Option<Arc<Vec<u8>>>>,
    remaining: AtomicUsize,
}

struct Build {
    fetcher: Arc<Fetcher>,
    index: Arc<OldIndex>,
    cdn: HashMap<CdnKey, Arc<CdnSlot>>,
    depot_ids: Vec<Arc<str>>,
    keys: Vec<[u8; 32]>,
    decode_sem: Arc<Semaphore>,
    stall: Arc<StallTracker>,
    emitter: ProgressEmitter,
    counters: Arc<Counters>,
    reused: AtomicU64,
    total_bytes: u64,
    files_total: u64,
    file_concurrency: usize,
}

impl Build {
    fn snapshot(&self) -> Snapshot {
        Snapshot {
            done_bytes: self.counters.done_bytes.load(Ordering::Relaxed),
            net_bytes: self.counters.net_bytes.load(Ordering::Relaxed),
            total_bytes: self.total_bytes,
            files_done: self.counters.files_done.load(Ordering::Relaxed),
            files_total: self.files_total,
            host: self
                .counters
                .last_host
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone(),
        }
    }

    /// Fetch and decode one chunk from the CDN. Never holds a network slot while decoding.
    async fn fetch_decode(
        &self,
        name: &str,
        di: usize,
        chunk: &ChunkRef,
        seed: usize,
        fc: &CancellationToken,
    ) -> Result<Vec<u8>, FileErr> {
        if fc.is_cancelled() {
            return Err(FileErr::Cancelled);
        }
        let sha_hex = hex(&chunk.sha);
        let slot = seed % self.file_concurrency.max(1);
        let fetched = self
            .fetcher
            .fetch_chunk(&self.depot_ids[di], &sha_hex, seed, slot, fc)
            .await;
        let (raw, host) = match fetched {
            Ok(v) => v,
            Err(FetchError::Cancelled) => return Err(FileErr::Cancelled),
            Err(FetchError::Failed(mut f)) => {
                f.file = Some(name.to_string());
                return Err(FileErr::Failed(Box::new(f)));
            }
        };
        self.counters
            .net_bytes
            .fetch_add(raw.len() as u64, Ordering::Relaxed);
        *self
            .counters
            .last_host
            .lock()
            .unwrap_or_else(|e| e.into_inner()) = Some(host);
        let permit = tokio::select! {
            _ = fc.cancelled() => return Err(FileErr::Cancelled),
            p = self.decode_sem.clone().acquire_owned() => match p {
                Ok(p) => p,
                Err(_) => return Err(failed(name, ErrorKind::Io, "decode semaphore closed")),
            },
        };
        let (key, sha, cb) = (self.keys[di], chunk.sha, u64::from(chunk.cb_original));
        let joined = tokio::task::spawn_blocking(move || {
            let _permit = permit;
            decode_chunk(&raw, &key, cb, &sha)
        })
        .await;
        let (data, kind) = match joined {
            Ok(Ok(v)) => v,
            Ok(Err(e)) => {
                let mut f = failure(name, ErrorKind::DecodeFailed, e.to_string());
                f.code = Some(e.code.to_string());
                return Err(FileErr::Failed(Box::new(f)));
            }
            Err(_) => return Err(failed(name, ErrorKind::Io, "decode task failed")),
        };
        self.counters.chunks.fetch_add(1, Ordering::Relaxed);
        match kind {
            ContainerKind::Vz => &self.counters.vz,
            ContainerKind::Vsza => &self.counters.vsza,
            ContainerKind::Pk => &self.counters.pk,
        }
        .fetch_add(1, Ordering::Relaxed);
        Ok(data)
    }

    async fn cdn_data(
        &self,
        name: &str,
        di: usize,
        chunk: &ChunkRef,
        seed: usize,
        fc: &CancellationToken,
        slot: &CdnSlot,
    ) -> Result<Arc<Vec<u8>>, FileErr> {
        if !slot.cache {
            return self
                .fetch_decode(name, di, chunk, seed, fc)
                .await
                .map(Arc::new);
        }
        let mut g = slot.data.lock().await;
        let data = match g.as_ref() {
            Some(d) => d.clone(),
            None => {
                let d = Arc::new(self.fetch_decode(name, di, chunk, seed, fc).await?);
                *g = Some(d.clone());
                d
            }
        };
        if slot.remaining.fetch_sub(1, Ordering::AcqRel) == 1 {
            *g = None;
        }
        Ok(data)
    }

    /// One chunk of one work file: a freshly verified local copy, else the CDN.
    async fn chunk_task(
        &self,
        w: &Work<'_>,
        chunk: &ChunkRef,
        ci: usize,
        fc: &CancellationToken,
        out: &Arc<fs::File>,
    ) -> Result<(), FileErr> {
        let name = w.file.filename.as_str();
        if fc.is_cancelled() {
            return Err(FileErr::Cancelled);
        }
        let key: CdnKey = (w.di, chunk.sha);
        let planned_cdn = self.cdn.get(&key);
        let mut len = 0u64;
        if planned_cdn.is_none() {
            // Re-read and re-check at build time: the plan pass is not trusted (TOCTOU).
            let permit = tokio::select! {
                _ = fc.cancelled() => return Err(FileErr::Cancelled),
                p = self.decode_sem.clone().acquire_owned() => match p {
                    Ok(p) => p,
                    Err(_) => return Err(failed(name, ErrorKind::Io, "decode semaphore closed")),
                },
            };
            let (index, out2, sha, cb, off) = (
                self.index.clone(),
                out.clone(),
                chunk.sha,
                chunk.cb_original,
                chunk.offset,
            );
            let joined = tokio::task::spawn_blocking(move || {
                let _permit = permit;
                let mut handles = HashMap::new();
                match index.read_verified(&sha, cb, &mut handles) {
                    Some(data) => write_all_at(&out2, &data, off).map(|()| Some(data.len() as u64)),
                    None => Ok(None),
                }
            })
            .await;
            match joined {
                Ok(Ok(Some(n))) => {
                    len = n;
                    self.reused.fetch_add(n, Ordering::Relaxed);
                }
                Ok(Ok(None)) => {}
                Ok(Err(e)) => return Err(io_failed(name, "chunk write failed", &e)),
                Err(_) => return Err(failed(name, ErrorKind::Io, "local read task failed")),
            }
        }
        if len == 0 {
            let seed = w.seed.wrapping_add(ci);
            let data = match planned_cdn {
                Some(slot) => self.cdn_data(name, w.di, chunk, seed, fc, slot).await?,
                None => Arc::new(self.fetch_decode(name, w.di, chunk, seed, fc).await?),
            };
            let (out2, off) = (out.clone(), chunk.offset);
            len = data.len() as u64;
            tokio::task::spawn_blocking(move || write_all_at(&out2, &data, off))
                .await
                .map_err(|_| failed(name, ErrorKind::Io, "write task failed"))?
                .map_err(|e| io_failed(name, "chunk write failed", &e))?;
        }
        self.counters.done_bytes.fetch_add(len, Ordering::Relaxed);
        self.stall.record_progress();
        self.emitter.progress(self.snapshot());
        Ok(())
    }

    /// Builds one work file as its temp and verifies it against `sha_content`.
    async fn build_file(&self, w: &Work<'_>, fc: &CancellationToken) -> Result<(), FileErr> {
        let name = w.file.filename.as_str();
        if let Some(parent) = w.dest.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| io_failed(name, "create parent directory", &e))?;
        }
        let file = w.file;
        if file.size != 0 && file.chunks.is_empty() {
            return Err(failed(
                name,
                ErrorKind::ManifestDecode,
                format!(
                    "manifest reported {name} size={} but zero chunks",
                    file.size
                ),
            ));
        }
        let (tmp, size) = (w.tmp.clone(), file.size);
        let opened = tokio::task::spawn_blocking(move || -> io::Result<fs::File> {
            match fs::remove_file(&tmp) {
                Ok(()) => {}
                Err(e) if e.kind() == io::ErrorKind::NotFound => {}
                Err(e) => return Err(e),
            }
            let f = fs::OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .open(&tmp)?;
            f.set_len(size)?;
            Ok(f)
        })
        .await
        .map_err(|_| failed(name, ErrorKind::Io, "blocking task failed"))?
        .map_err(|e| io_failed(name, "open temp file", &e))?;
        let out = Arc::new(opened);

        let cc = fc.child_token();
        let mut first_err: Option<FileErr> = None;
        {
            let mut pool = stream::iter(file.chunks.iter().enumerate())
                .map(|(ci, chunk)| self.chunk_task(w, chunk, ci, &cc, &out))
                .buffer_unordered(CHUNK_CONCURRENCY);
            while let Some(r) = pool.next().await {
                if let Err(e) = r {
                    if first_err.is_none() {
                        first_err = Some(e);
                    }
                    cc.cancel();
                }
            }
        }
        if let Some(e) = first_err {
            return Err(e);
        }
        if fc.is_cancelled() {
            return Err(FileErr::Cancelled);
        }
        let tmp = w.tmp.clone();
        let sync = tokio::task::spawn_blocking(move || out.sync_all())
            .await
            .map_err(|_| failed(name, ErrorKind::Io, "blocking task failed"))?;
        sync.map_err(|e| io_failed(name, "sync temp file", &e))?;
        if file.size != 0 {
            let got = tokio::task::spawn_blocking(move || sha1_file(&tmp))
                .await
                .map_err(|_| failed(name, ErrorKind::Io, "blocking task failed"))?
                .map_err(|e| io_failed(name, "whole-file SHA1 read failed", &e))?;
            self.stall.record_progress();
            if got != file.sha_content {
                return Err(failed(
                    name,
                    ErrorKind::Sha1Mismatch,
                    format!(
                        "whole-file SHA1 mismatch for {name}: {} != {}",
                        hex(&got),
                        hex(&file.sha_content)
                    ),
                ));
            }
        }
        self.counters.files_done.fetch_add(1, Ordering::Relaxed);
        self.emitter.progress(self.snapshot());
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------

/// Everything the synchronous commit needs, owned.
struct CommitPlan {
    renames: Vec<(PathBuf, PathBuf, String)>,
    dirs: Vec<PathBuf>,
    symlinks: Vec<(PathBuf, String, String)>,
    removed: Vec<(PathBuf, String)>,
    stale_dirs: Vec<PathBuf>,
    /// (dest, manifest entry without chunks, run the Mach-O fallback)
    modes: Vec<(PathBuf, ManifestFile, bool)>,
}

/// Windows refuses to rename over a read-only file; clear the bit first (the mode apply restores it).
#[cfg(windows)]
fn prepare_replace(dest: &Path) {
    if let Ok(m) = fs::metadata(dest) {
        let mut p = m.permissions();
        if p.readonly() {
            // Windows-only: this clears FILE_ATTRIBUTE_READONLY. The lint's world-writable
            // concern is about Unix mode bits, which this cfg(windows) path never touches.
            #[allow(clippy::permissions_set_readonly_false)]
            p.set_readonly(false);
            let _ = fs::set_permissions(dest, p);
        }
    }
}

#[cfg(not(windows))]
fn prepare_replace(_dest: &Path) {}

fn symlink_matches(dest: &Path, target: &str) -> bool {
    fs::read_link(dest).is_ok_and(|t| t.to_string_lossy() == target)
}

/// The point of no return: runs the whole commit, collecting failures instead of stopping.
fn run_commit(plan: &CommitPlan, counters: &Counters) -> (Vec<Failure>, Vec<String>) {
    let mut failures = Vec::new();
    let mut warnings = Vec::new();
    for (tmp, dest, name) in &plan.renames {
        if let Err(m) = clear_stale_dir(dest, name) {
            failures.push(failure(name, ErrorKind::Io, m));
            continue;
        }
        prepare_replace(dest);
        if let Err(e) = fs::rename(tmp, dest) {
            let kind = io_kind(&e);
            failures.push(failure(
                name,
                kind,
                format!("rename into place failed: {e}"),
            ));
        }
    }
    for d in &plan.dirs {
        if let Err(e) = fs::create_dir_all(d) {
            failures.push(failure(
                &d.to_string_lossy(),
                io_kind(&e),
                format!("create directory failed: {e}"),
            ));
        }
    }
    for (dest, target, name) in &plan.symlinks {
        if symlink_matches(dest, target) {
            continue;
        }
        if let Some(parent) = dest.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Err(e) = place_symlink(dest, target) {
            failures.push(failure(
                name,
                ErrorKind::SymlinkFailed,
                format!("symlink failed: {e}"),
            ));
        }
    }
    // IN-03: after any commit failure the retired files stay; the retry re-plans the removals.
    if failures.is_empty() {
        for (path, name) in &plan.removed {
            match fs::symlink_metadata(path) {
                // The link itself goes, never its target; a directory is not ours to delete here.
                Ok(m) if !m.is_dir() => {
                    if let Err(e) = fs::remove_file(path) {
                        warnings.push(format!("could not remove retired file \"{name}\": {e}"));
                    }
                }
                _ => {}
            }
        }
    } else if !plan.removed.is_empty() {
        warnings.push(format!(
            "skipped removing {} retired file(s) because the commit had failures; the retry removes them",
            plan.removed.len()
        ));
    }
    for d in &plan.stale_dirs {
        let _ = fs::remove_dir(d);
    }
    for (dest, file, macho) in &plan.modes {
        if let Err(m) = apply_modes_sync(counters, dest, file, *macho) {
            failures.push(failure(
                &file.filename,
                ErrorKind::Io,
                format!("failed to apply file mode flags for {}: {m}", file.filename),
            ));
        }
    }
    (failures, warnings)
}

// ---------------------------------------------------------------------------
// Commit journal
// ---------------------------------------------------------------------------

/// Directory (under the job's `steamapps_dir`) holding one journal per app.
const JOURNAL_DIR: &str = "gamelib-delta";

/// Written (temp + fsync + rename) right before the first commit rename and removed once the ACF
/// is finalized. Its presence at job start means a commit may have run partway.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Journal {
    app_id: String,
    new_gids: BTreeMap<String, String>,
    old_gids: BTreeMap<String, String>,
    retired: Vec<String>,
    started_at: u64,
}

fn all_numeric(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit())
}

impl Journal {
    /// The journal a job would write: every depot's new GID, every `fromManifest` as the old GID.
    fn for_job(job: &DepotJob) -> Self {
        Journal {
            app_id: job.app_id.clone(),
            new_gids: job
                .depots
                .iter()
                .map(|d| (d.depot_id.clone(), d.manifest_id.clone()))
                .collect(),
            old_gids: job
                .depots
                .iter()
                .filter_map(|d| Some((d.depot_id.clone(), d.from_manifest.clone()?)))
                .collect(),
            retired: job
                .retired_depots
                .iter()
                .map(|d| d.depot_id.clone())
                .collect(),
            started_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
        }
    }

    /// Same app, same new builds, same installed builds.
    fn matches(&self, job: &DepotJob) -> bool {
        let want = Journal::for_job(job);
        self.app_id == want.app_id
            && self.new_gids == want.new_gids
            && self.old_gids == want.old_gids
    }

    /// Everything numeric: a planted or corrupted journal is never trusted.
    fn well_formed(&self) -> bool {
        all_numeric(&self.app_id)
            && self
                .new_gids
                .iter()
                .chain(&self.old_gids)
                .all(|(k, v)| all_numeric(k) && all_numeric(v))
            && self.retired.iter().all(|r| all_numeric(r))
    }
}

fn journal_path(spec: &crate::job::FinalizeSpec, app_id: &str) -> Option<PathBuf> {
    all_numeric(app_id).then(|| {
        PathBuf::from(&spec.steamapps_dir)
            .join(JOURNAL_DIR)
            .join(format!("{app_id}.json"))
    })
}

enum JournalState {
    Absent,
    /// Present and describing exactly this job: finish the interrupted commit.
    Resume,
    /// Present but for another build, or unreadable: the tree state is unknown.
    Stale,
}

fn read_journal_state(job: &DepotJob, path: &Path) -> JournalState {
    let bytes = match fs::read(path) {
        Ok(b) => b,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return JournalState::Absent,
        Err(_) => return JournalState::Stale,
    };
    match serde_json::from_slice::<Journal>(&bytes) {
        Ok(j) if j.well_formed() && j.matches(job) => JournalState::Resume,
        _ => JournalState::Stale,
    }
}

fn write_journal(job: &DepotJob, path: &Path) -> io::Result<()> {
    use io::Write;
    let dir = path
        .parent()
        .ok_or_else(|| io::Error::other("journal path has no parent"))?;
    let mut b = fs::DirBuilder::new();
    b.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        b.mode(0o700);
    }
    b.create(dir)?;
    let bytes = serde_json::to_vec(&Journal::for_job(job)).map_err(io::Error::other)?;
    let tmp = dir.join(format!(".{}.tmp", job.app_id));
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(&bytes)?;
        f.sync_all()?;
    }
    fs::rename(&tmp, path).inspect_err(|_| {
        let _ = fs::remove_file(&tmp);
    })
}

/// Removes the job's journal (idempotent). Used after a file-level fallback completed.
pub fn clear_journal(job: &DepotJob) {
    if let Some(p) = job
        .finalize
        .as_ref()
        .and_then(|s| journal_path(s, &job.app_id))
    {
        let _ = fs::remove_file(p);
    }
}

/// Where a delta job ended up.
pub enum DeltaRoute {
    Done(Box<Outcome>),
    /// Re-run as an ordinary install with `fromManifest` cleared (D-14 / stale journal).
    Fallback,
}

// ---------------------------------------------------------------------------
// The job
// ---------------------------------------------------------------------------

fn finish(mut o: Outcome, started: Instant) -> Outcome {
    o.stats.elapsed_ms = started.elapsed().as_millis() as u64;
    o
}

/// True when the old manifest is definitively gone or unreadable (D-14 fallback applies).
/// `ManifestUnavailable` means Steam answered with no request code (or Blocked), which retrying
/// cannot change. A Node-side failure to obtain the code (not signed in, CM down, lease refused)
/// arrives as NotSignedIn/Network (fetch.rs `request_code_from_node`) and is transient. Everything else (5xx, 429, network, stall, not signed in, no content
/// servers, io) is transient and must fail the run so the retry sees the old tree intact.
fn is_definitive_old_manifest_failure(f: &Failure) -> bool {
    match f.kind {
        ErrorKind::ManifestDecode | ErrorKind::ManifestUnavailable => true,
        ErrorKind::CdnHttp => matches!(f.http_status, Some(404) | Some(410)),
        _ => false,
    }
}

fn fail_outcome(job_id: &str, f: Failure, started: Instant) -> Outcome {
    let mut o = outcome_shell(job_id, Status::Error, started);
    o.failures.push(f);
    o
}

fn order_failures(mut failures: Vec<Failure>) -> Vec<Failure> {
    if let Some(primary) = select_primary_failure(&failures).cloned() {
        let mut ordered = vec![primary];
        let mut skipped_primary = false;
        for f in &failures {
            if !skipped_primary && f.file == ordered[0].file && f.message == ordered[0].message {
                skipped_primary = true;
                continue;
            }
            ordered.push(f.clone());
        }
        ordered.truncate(OUTCOME_FAILURE_CAP);
        failures = ordered;
    }
    failures
}

/// Writes the "1026" ACF with the previously installed GIDs (the tree is mixed old/new).
async fn finalize_interrupted(
    spec: &crate::job::FinalizeSpec,
    app_id: &str,
    old_attempted: &[PlannedDepot],
    failures: &[Failure],
    outcome: RunOutcome,
) -> (Option<AcfResult>, Option<Failure>) {
    let result = RunResult {
        outcome,
        all_files_verified: false,
        all_modes_applied: false,
        failures: failures.to_vec(),
    };
    match acf::finalize(spec, app_id, old_attempted, &result).await {
        Ok(w) => (
            Some(AcfResult {
                state_flags: w.state_flags,
                size_on_disk: w.size_on_disk.to_string(),
            }),
            None,
        ),
        Err(f) => (None, Some(f)),
    }
}

fn remove_temps(works: &[Work<'_>]) {
    for w in works {
        let _ = fs::remove_file(&w.tmp);
    }
}

/// Runs a delta install. Always returns; every failure is data. The caller has already run
/// `shape_failure`. `Fallback` means the old tree cannot be trusted to diff against and the caller
/// re-runs the job as an ordinary file-level install.
pub async fn run_delta(
    job: &DepotJob,
    jctx: &JobContext,
    host: Arc<dyn JobHost>,
    cancel: CancellationToken,
    emitter: &ProgressEmitter,
    started: Instant,
) -> DeltaRoute {
    let mut fallback = false;
    let o = delta_body(job, jctx, host, cancel, emitter, started, &mut fallback).await;
    if fallback {
        DeltaRoute::Fallback
    } else {
        DeltaRoute::Done(Box::new(o))
    }
}

/// `fallback` is set when the returned outcome is a throwaway and the caller must fall back.
async fn delta_body(
    job: &DepotJob,
    jctx: &JobContext,
    host: Arc<dyn JobHost>,
    cancel: CancellationToken,
    emitter: &ProgressEmitter,
    started: Instant,
    fallback: &mut bool,
) -> Outcome {
    let Some(spec) = job.finalize.as_ref() else {
        return fail_outcome(
            &job.job_id,
            plain_failure(ErrorKind::DeltaUnsupported, "a delta job requires finalize"),
            started,
        );
    };
    let root = PathBuf::from(&job.install_root);
    if let Err(e) = tokio::fs::create_dir_all(&root).await {
        return fail_outcome(
            &job.job_id,
            plain_failure(io_kind(&e), format!("cannot create install root: {e}")),
            started,
        );
    }
    let journal_file = journal_path(spec, &job.app_id);
    let resuming = match journal_file.as_deref().map(|p| read_journal_state(job, p)) {
        Some(JournalState::Resume) => true,
        Some(JournalState::Stale) => {
            emitter.warn("a previous update was interrupted for a different build; checking every file instead".to_string());
            *fallback = true;
            return outcome_shell(&job.job_id, Status::Cancelled, started);
        }
        _ => false,
    };
    emitter.stage("delta_planning");

    let limits = job.limits.as_ref();
    let pick = |v: Option<u32>, default: usize| match v {
        Some(n) if n > 0 => n as usize,
        _ => default,
    };
    let file_concurrency = pick(limits.map(|l| l.file_concurrency), FILE_CONCURRENCY);
    let inflight = pick(
        limits.map(|l| l.inflight_chunks),
        TARGET_INFLIGHT_CHUNKS as usize,
    );
    let decode_threads = pick(limits.map(|l| l.decode_threads), default_decode_threads());
    let stall = Arc::new(StallTracker::default());
    let limiter = match InflightLimiter::new(inflight as u32) {
        Ok(l) => l,
        Err(m) => {
            return fail_outcome(&job.job_id, plain_failure(ErrorKind::Io, m), started);
        }
    };
    let fetcher = Arc::new(Fetcher::new(
        host,
        &job.job_id,
        &job.app_id,
        job.hosts.clone(),
        limiter,
        stall.clone(),
    ));
    let store = ManifestStore::new(jctx.cache_dir.clone(), fetcher.clone());

    // (1) New manifests, then the old ones (cached by `load`). An EResult-40 refusal of a new
    // manifest drops that depot, exactly like an install.
    let loaded: Vec<Result<Arc<DepotManifest>, FetchError>> = stream::iter(job.depots.iter())
        .map(|d| store.load(d, &cancel))
        .buffered(4)
        .collect()
        .await;
    let mut kept: Vec<&DepotRef> = Vec::new();
    let mut manifests: Vec<Arc<DepotManifest>> = Vec::new();
    let mut skipped_depots: Vec<String> = Vec::new();
    for (d, r) in job.depots.iter().zip(loaded) {
        match r {
            Ok(m) => {
                kept.push(d);
                manifests.push(m);
            }
            Err(FetchError::Cancelled) => {
                return outcome_shell(&job.job_id, Status::Cancelled, started)
            }
            Err(FetchError::Failed(f))
                if f.kind == ErrorKind::ManifestUnavailable
                    && f.eresult == Some(ERESULT_BLOCKED) =>
            {
                skipped_depots.push(d.depot_id.clone());
            }
            Err(FetchError::Failed(f)) => return fail_outcome(&job.job_id, f, started),
        }
    }
    if kept.is_empty() && !skipped_depots.is_empty() {
        let mut f = plain_failure(
            ErrorKind::ManifestUnavailable,
            format!(
                "buildDepotPlan: every selected depot for appId {} was blocked by Steam (eresult=40) and had to be skipped: {}",
                job.app_id,
                skipped_depots.join(", ")
            ),
        );
        f.eresult = Some(ERESULT_BLOCKED);
        let mut o = fail_outcome(&job.job_id, f, started);
        o.skipped_depots = skipped_depots;
        return o;
    }
    let old_refs: Vec<Option<DepotRef>> = kept
        .iter()
        .map(|d| {
            d.from_manifest.as_ref().map(|g| DepotRef {
                manifest_id: g.clone(),
                request_code: None,
                from_manifest: None,
                ..(*d).clone()
            })
        })
        .collect();
    let old_loaded: Vec<Option<Result<Arc<DepotManifest>, FetchError>>> =
        stream::iter(old_refs.iter())
            .map(|r| {
                let store = &store;
                let cancel = &cancel;
                async move {
                    match r {
                        Some(r) => Some(store.load(r, cancel).await),
                        None => None,
                    }
                }
            })
            .buffered(4)
            .collect()
            .await;
    let mut olds: Vec<Option<Arc<DepotManifest>>> = Vec::with_capacity(old_loaded.len());
    for r in old_loaded {
        match r {
            None => olds.push(None),
            Some(Ok(m)) => olds.push(Some(m)),
            Some(Err(FetchError::Cancelled)) => {
                return outcome_shell(&job.job_id, Status::Cancelled, started)
            }
            Some(Err(FetchError::Failed(f))) if is_definitive_old_manifest_failure(&f) => {
                // D-14: without the old manifest only a sha1 reconcile of the new one is safe.
                emitter.warn("old manifest unavailable; checking every file instead".to_string());
                *fallback = true;
                return outcome_shell(&job.job_id, Status::Cancelled, started);
            }
            // WR-09: a transient failure must not drop retired depots; fail, keep the old tree.
            Some(Err(FetchError::Failed(f))) => return fail_outcome(&job.job_id, f, started),
        }
    }

    // Retired depots (the new build dropped them): their manifests feed reuse and cleanup. An
    // unavailable one is a warning, never a failed update.
    let mut retired_mans: Vec<(&DepotRef, Option<Arc<DepotManifest>>)> = Vec::new();
    for r in &job.retired_depots {
        let r_old = DepotRef {
            request_code: None,
            from_manifest: None,
            ..r.clone()
        };
        match store.load(&r_old, &cancel).await {
            Ok(m) => retired_mans.push((r, Some(m))),
            Err(FetchError::Cancelled) => {
                return outcome_shell(&job.job_id, Status::Cancelled, started)
            }
            Err(FetchError::Failed(_)) => {
                emitter.warn(format!(
                    "retired depot {} manifest unavailable; its files are kept",
                    r.depot_id
                ));
                retired_mans.push((r, None));
            }
        }
    }

    // (2) Containment of every entry the update will touch, before any write.
    let case_insensitive =
        probe_case_insensitive(&root).unwrap_or(cfg!(any(windows, target_os = "macos")));
    let collision_depots: Vec<CollisionDepot<'_>> = kept
        .iter()
        .zip(&manifests)
        .enumerate()
        .map(|(i, (d, m))| CollisionDepot {
            depot_id: &d.depot_id,
            owner_app_id: Some(&d.owner_app_id),
            appinfo_rank: Some(i as u32),
            files: &m.files,
        })
        .collect();
    let collisions = detect_path_collisions(&collision_depots, case_insensitive);
    let dropped: HashSet<(usize, usize)> = collisions.dropped.iter().copied().collect();
    let path_collisions = (collisions.resolved.len() + collisions.unresolved.len()) as u32;

    let mut keys: Vec<[u8; 32]> = Vec::new();
    for d in &kept {
        match key_from_hex(&d.key) {
            Some(k) => keys.push(k),
            None => {
                return fail_outcome(
                    &job.job_id,
                    plain_failure(ErrorKind::ManifestDecode, "depot key is malformed"),
                    started,
                )
            }
        }
    }
    let mut dirs: Vec<PathBuf> = Vec::new();
    let mut symlinks: Vec<(PathBuf, String, String)> = Vec::new();
    for (di, m) in manifests.iter().enumerate() {
        for (fi, f) in m.files.iter().enumerate() {
            if dropped.contains(&(di, fi)) {
                continue;
            }
            let name = f.filename.as_str();
            let dest = match resolve_contained_path(&root, name) {
                Ok(p) => p,
                Err(e) => {
                    return fail_outcome(
                        &job.job_id,
                        failure(name, ErrorKind::PathTraversal, e.message),
                        started,
                    )
                }
            };
            if f.flags & DIRECTORY_FLAG != 0 {
                dirs.push(dest);
            } else if f.flags & SYMLINK_FLAG != 0 {
                let Some(target) = f.linktarget.as_deref().filter(|t| !t.is_empty()) else {
                    return fail_outcome(
                        &job.job_id,
                        failure(
                            name,
                            ErrorKind::SymlinkFailed,
                            format!("symlink manifest entry for {name} has no linktarget"),
                        ),
                        started,
                    );
                };
                if let Err(e) = check_symlink_target(&root, &dest, target) {
                    return fail_outcome(
                        &job.job_id,
                        failure(name, ErrorKind::PathTraversal, e.message),
                        started,
                    );
                }
                symlinks.push((dest, target.to_string(), name.to_string()));
            }
        }
    }

    // (3) Work set per depot, minus collision losers.
    let mut works: Vec<Work<'_>> = Vec::new();
    let mut flag_only: Vec<(PathBuf, &ManifestFile)> = Vec::new();
    for (di, m) in manifests.iter().enumerate() {
        let dropped_here: HashSet<usize> = dropped
            .iter()
            .filter(|(d, _)| *d == di)
            .map(|(_, fi)| &m.files[*fi] as *const ManifestFile as usize)
            .collect();
        let live =
            |f: &&ManifestFile| !dropped_here.contains(&(*f as *const ManifestFile as usize));
        let ws = compute_work_set(olds[di].as_deref(), m);
        for f in ws.changed.into_iter().filter(live) {
            let dest = match resolve_contained_path(&root, &f.filename) {
                Ok(p) => p,
                Err(e) => {
                    return fail_outcome(
                        &job.job_id,
                        failure(&f.filename, ErrorKind::PathTraversal, e.message),
                        started,
                    )
                }
            };
            let mut tmp_name = dest.clone().into_os_string();
            tmp_name.push(DELTA_TMP_SUFFIX);
            let seed = works.len();
            works.push(Work {
                di,
                file: f,
                dest,
                tmp: PathBuf::from(tmp_name),
                seed,
            });
        }
        for f in ws.flag_only.into_iter().filter(live) {
            if let Ok(dest) = resolve_contained_path(&root, &f.filename) {
                flag_only.push((dest, f));
            }
        }
    }
    // Resuming an interrupted commit: a work file whose target already holds the new bytes was
    // renamed in before the kill. Hashing is gated on the journal (a fresh run would read GBs).
    let mut already: Vec<(PathBuf, &ManifestFile)> = Vec::new();
    if resuming {
        let probe: Vec<(PathBuf, [u8; 20], u64)> = works
            .iter()
            .map(|w| (w.dest.clone(), w.file.sha_content, w.file.size))
            .collect();
        let (c2, st2) = (cancel.clone(), stall.clone());
        let hashed = tokio::task::spawn_blocking(move || {
            let mut flags = Vec::with_capacity(probe.len());
            for (dest, sha, size) in &probe {
                if c2.is_cancelled() {
                    return None;
                }
                let new = *size != 0 && sha1_file(dest).is_ok_and(|got| got == *sha);
                st2.record_progress();
                flags.push(new);
            }
            Some(flags)
        })
        .await;
        let flags = match hashed {
            Ok(Some(f)) => f,
            Ok(None) => return outcome_shell(&job.job_id, Status::Cancelled, started),
            Err(_) => {
                return fail_outcome(
                    &job.job_id,
                    plain_failure(ErrorKind::Io, "delta resume check task failed"),
                    started,
                )
            }
        };
        let mut pending = Vec::with_capacity(works.len());
        for (w, is_new) in works.into_iter().zip(flags) {
            if is_new {
                already.push((w.dest, w.file));
            } else {
                pending.push(w);
            }
        }
        works = pending;
    }
    // Temps left by an aborted or paused earlier run are never reused: rebuilt from scratch.
    {
        let mut temps: Vec<PathBuf> = works.iter().map(|w| w.tmp.clone()).collect();
        for (dest, _) in &already {
            let mut t = dest.clone().into_os_string();
            t.push(DELTA_TMP_SUFFIX);
            temps.push(PathBuf::from(t));
        }
        let _ = tokio::task::spawn_blocking(move || {
            for t in &temps {
                let _ = fs::remove_file(t);
            }
        })
        .await;
    }
    let old_mans: Vec<&DepotManifest> = olds
        .iter()
        .flatten()
        .map(|m| m.as_ref())
        .chain(retired_mans.iter().filter_map(|(_, m)| m.as_deref()))
        .collect();
    let new_mans: Vec<&DepotManifest> = manifests.iter().map(|m| m.as_ref()).collect();
    let removed = removed_paths(&old_mans, &new_mans);
    let stale_dir_names = removable_dirs(&old_mans, &new_mans, &removed);
    let resolve_all = |names: &[String]| -> Vec<(PathBuf, String)> {
        names
            .iter()
            .filter_map(|n| {
                resolve_contained_path(&root, n)
                    .ok()
                    .map(|p| (p, n.clone()))
            })
            .collect()
    };
    let removed_resolved = resolve_all(&removed);
    let stale_dirs: Vec<PathBuf> = resolve_all(&stale_dir_names)
        .into_iter()
        .map(|(p, _)| p)
        .collect();

    // (4) Plan pass: which chunks can the old tree not supply (SHA-1 checked from local bytes).
    let index = Arc::new(OldIndex::build(&root, &old_mans));
    let mut wanted: Vec<(CdnKey, u32)> = Vec::new();
    for w in &works {
        for c in &w.file.chunks {
            wanted.push(((w.di, c.sha), c.cb_original));
        }
    }
    let plan_index = index.clone();
    let (plan_cancel, plan_stall) = (cancel.clone(), stall.clone());
    let planned = tokio::task::spawn_blocking(move || {
        let mut handles = HashMap::new();
        let mut local_ok: HashMap<[u8; 20], bool> = HashMap::new();
        let mut cdn: HashMap<CdnKey, usize> = HashMap::new();
        for (i, ((di, sha), len)) in wanted.iter().enumerate() {
            if i % 64 == 0 {
                if plan_cancel.is_cancelled() {
                    return None;
                }
                plan_stall.record_progress();
            }
            let ok = *local_ok
                .entry(*sha)
                .or_insert_with(|| plan_index.read_verified(sha, *len, &mut handles).is_some());
            if !ok {
                *cdn.entry((*di, *sha)).or_insert(0) += 1;
            }
        }
        Some(cdn)
    })
    .await;
    let cdn_counts = match planned {
        Ok(Some(c)) => c,
        Ok(None) => return outcome_shell(&job.job_id, Status::Cancelled, started),
        Err(_) => {
            return fail_outcome(
                &job.job_id,
                plain_failure(ErrorKind::Io, "delta planning task failed"),
                started,
            )
        }
    };
    let cdn: HashMap<CdnKey, Arc<CdnSlot>> = cdn_counts
        .into_iter()
        .map(|(k, n)| {
            (
                k,
                Arc::new(CdnSlot {
                    cache: n > 1,
                    data: AsyncMutex::new(None),
                    remaining: AtomicUsize::new(n),
                }),
            )
        })
        .collect();

    let work_bytes: u64 = works.iter().map(|w| w.file.size).sum();
    let attempted: Vec<PlannedDepot> = manifests
        .iter()
        .enumerate()
        .zip(&kept)
        .map(|((di, m), d)| PlannedDepot {
            depot_id: d.depot_id.clone(),
            gid: m.gid.clone(),
            size: m
                .files
                .iter()
                .enumerate()
                .filter(|(fi, _)| !dropped.contains(&(di, *fi)))
                .map(|(_, f)| f.size)
                .sum(),
        })
        .collect();
    // What the ACF names if the tree ends up mixed: the builds that were installed before.
    let size_of = |m: &DepotManifest| m.files.iter().map(|f| f.size).sum::<u64>();
    let mut old_attempted: Vec<PlannedDepot> = Vec::new();
    for (d, o) in kept.iter().zip(&olds) {
        if let (Some(gid), Some(m)) = (d.from_manifest.as_ref(), o.as_ref()) {
            old_attempted.push(PlannedDepot {
                depot_id: d.depot_id.clone(),
                gid: gid.clone(),
                size: size_of(m),
            });
        }
    }
    for (r, m) in &retired_mans {
        old_attempted.push(PlannedDepot {
            depot_id: r.depot_id.clone(),
            gid: r.manifest_id.clone(),
            size: m.as_deref().map(size_of).unwrap_or(0),
        });
    }
    emitter.planned(work_bytes, works.len() as u64, attempted.clone());
    if path_collisions > 0 {
        emitter.warn(format!(
            "cross-depot path collision detected: {path_collisions}"
        ));
    }

    // (5) Build every changed file as a temp; the old tree and the ACF stay untouched.
    let counters = Arc::new(Counters::default());
    stall.record_progress();
    let build = Build {
        fetcher: fetcher.clone(),
        index,
        cdn,
        depot_ids: kept
            .iter()
            .map(|d| Arc::from(d.depot_id.as_str()))
            .collect(),
        keys,
        decode_sem: Arc::new(Semaphore::new(decode_threads)),
        stall: stall.clone(),
        emitter: emitter.clone(),
        counters: counters.clone(),
        reused: AtomicU64::new(0),
        total_bytes: work_bytes,
        files_total: works.len() as u64,
        file_concurrency,
    };
    let heartbeat = emitter.spawn_heartbeat();
    let fc = cancel.child_token();
    let mut failures: Vec<Failure> = Vec::new();
    let mut unattempted = 0usize;
    {
        let mut pool = stream::iter(works.iter())
            .map(|w| {
                let (build, fc) = (&build, &fc);
                async move {
                    if fc.is_cancelled() {
                        return Err(FileErr::Cancelled);
                    }
                    if build.stall.has_stalled() {
                        let ms = build.stall.ms_since_progress();
                        let mut f = failure(
                            "(run)",
                            ErrorKind::Stall,
                            format!(
                                "download stalled: no forward progress for {ms}ms across the whole run"
                            ),
                        );
                        f.scope = Some(FailureScope::Run);
                        f.ms_since_progress = Some(ms);
                        return Err(FileErr::Failed(Box::new(f)));
                    }
                    build.build_file(w, fc).await
                }
            })
            .buffer_unordered(file_concurrency.max(1));
        while let Some(r) = pool.next().await {
            match r {
                Ok(()) => {}
                Err(FileErr::Cancelled) => unattempted += 1,
                Err(FileErr::Failed(f)) => {
                    failures.push(*f);
                    fc.cancel();
                }
            }
        }
    }
    heartbeat.abort();
    let _ = heartbeat.await;
    emitter.force(build.snapshot());

    let mut report = DeltaReport {
        mode: if resuming {
            DeltaMode::CommitResume
        } else {
            DeltaMode::Chunk
        },
        changed_files: works
            .iter()
            .map(|w| w.file)
            .chain(already.iter().map(|(_, f)| *f))
            .map(|f| f.filename.clone())
            .collect(),
        removed_files: removed.clone(),
        reused_bytes: build.reused.load(Ordering::Relaxed),
        cdn_bytes: counters.net_bytes.load(Ordering::Relaxed),
        peak_bytes: work_bytes,
        committed: false,
    };
    let stats = |c: &Counters| Stats {
        bytes_fetched: c.net_bytes.load(Ordering::Relaxed),
        chunks_fetched: c.chunks.load(Ordering::Relaxed),
        containers: Containers {
            vz: c.vz.load(Ordering::Relaxed),
            vsza: c.vsza.load(Ordering::Relaxed),
            pk: c.pk.load(Ordering::Relaxed),
        },
        macho_exec_applied: c.macho_exec.load(Ordering::Relaxed) as u32,
        path_collisions,
        elapsed_ms: started.elapsed().as_millis() as u64,
    };

    // The journal goes down before the first rename: a kill from here on is a commit-resume.
    if failures.is_empty() && !cancel.is_cancelled() && unattempted == 0 {
        if let Some(path) = journal_file.clone() {
            let j = job.clone();
            let written = tokio::task::spawn_blocking(move || write_journal(&j, &path)).await;
            match written {
                Ok(Ok(())) => {}
                Ok(Err(e)) => failures.push(failure(
                    "(run)",
                    io_kind(&e),
                    format!("cannot write the update journal: {e}"),
                )),
                Err(_) => failures.push(plain_failure(ErrorKind::Io, "journal task failed")),
            }
        }
    }

    // Any failure or cancel before the commit: remove every temp and touch no game file. A fresh
    // run leaves the ACF alone; a resume already has a mixed tree, so it is marked unfinished.
    if !failures.is_empty() || cancel.is_cancelled() || unattempted > 0 {
        let tmps_owned: Vec<PathBuf> = works.iter().map(|w| w.tmp.clone()).collect();
        let _ = tokio::task::spawn_blocking(move || {
            for t in &tmps_owned {
                let _ = fs::remove_file(t);
            }
        })
        .await;
        remove_temps(&works);
        let status = if !failures.is_empty() {
            Status::Error
        } else {
            Status::Cancelled
        };
        let mut o = outcome_shell(&job.job_id, status, started);
        if resuming {
            let run = if failures.is_empty() {
                RunOutcome::Cancelled
            } else {
                RunOutcome::Completed
            };
            let (acf, f) =
                finalize_interrupted(spec, &job.app_id, &old_attempted, &failures, run).await;
            o.acf = acf;
            failures.extend(f);
        }
        o.failures = order_failures(failures);
        o.attempted_depots = attempted;
        o.skipped_depots = skipped_depots;
        o.stats = stats(&counters);
        o.delta = Some(report);
        return finish(o, started);
    }

    // (6) Commit.
    emitter.stage("delta_committing");
    let mut modes: Vec<(PathBuf, ManifestFile, bool)> = Vec::new();
    let stub = |f: &ManifestFile| ManifestFile {
        chunks: Vec::new(),
        ..f.clone()
    };
    for w in &works {
        modes.push((w.dest.clone(), stub(w.file), true));
    }
    for (dest, f) in &already {
        modes.push((dest.clone(), stub(f), true));
    }
    for (dest, f) in &flag_only {
        modes.push((dest.clone(), stub(f), true));
    }
    let commit = CommitPlan {
        renames: works
            .iter()
            .map(|w| (w.tmp.clone(), w.dest.clone(), w.file.filename.clone()))
            .collect(),
        dirs,
        symlinks,
        removed: removed_resolved,
        stale_dirs,
        modes,
    };
    let commit_counters = counters.clone();
    let committed =
        tokio::task::spawn_blocking(move || run_commit(&commit, &commit_counters)).await;
    let (mut failures, warnings) = match committed {
        Ok(r) => r,
        Err(_) => (
            vec![plain_failure(ErrorKind::Io, "delta commit task failed")],
            Vec::new(),
        ),
    };
    for w in warnings {
        emitter.warn(w);
    }

    let result = RunResult {
        outcome: RunOutcome::Completed,
        all_files_verified: failures.is_empty(),
        all_modes_applied: failures.is_empty(),
        failures: failures.clone(),
    };
    let mut acf_out = None;
    if failures.is_empty() {
        match acf::finalize(spec, &job.app_id, &attempted, &result).await {
            Ok(w) => {
                acf_out = Some(AcfResult {
                    state_flags: w.state_flags,
                    size_on_disk: w.size_on_disk.to_string(),
                });
                report.committed = true;
                if let Some(p) = &journal_file {
                    let _ = fs::remove_file(p);
                }
            }
            Err(f) => failures.push(f),
        }
    } else {
        // Failure after the first rename: 1026 naming the OLD builds, journal kept, so the retry
        // sends the same fromManifest and resumes this commit (D-16).
        let (acf, f) = finalize_interrupted(
            spec,
            &job.app_id,
            &old_attempted,
            &failures,
            RunOutcome::Completed,
        )
        .await;
        acf_out = acf;
        failures.extend(f);
    }
    let mode_notes = counters.mode_warnings.load(Ordering::Relaxed);
    if mode_notes > 0 {
        emitter.warn(format!(
            "file mode notes: {mode_notes} (hidden-flag no-ops, Mach-O fallbacks)"
        ));
    }

    let status = if failures.is_empty() {
        Status::Completed
    } else {
        Status::Error
    };
    let mut o = outcome_shell(&job.job_id, status, started);
    o.all_files_verified = result.all_files_verified && failures.is_empty();
    o.all_modes_applied = result.all_modes_applied && failures.is_empty();
    o.failures = order_failures(failures);
    o.attempted_depots = attempted;
    o.skipped_depots = skipped_depots;
    o.acf = acf_out;
    o.stats = stats(&counters);
    o.delta = Some(report);
    finish(o, started)
}
