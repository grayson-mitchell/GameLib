//! The install job: per-file chunk pipeline with positional writes, and the orchestration that
//! assembles manifests, collisions, reconcile, workers, post-processing and `finalize`.
//! Ports `downloadSingleFile` / `downloadFileChunks` (depot/download.ts), `downloadDepotFiles` /
//! `healReconciledFileModes` (depot/downloadFiles.ts) and `downloadSteamDepots` (depot/outcome.ts).
//!
//! Resource model (D-04): network in flight is bounded by the Fetcher's `InflightLimiter`
//! (TARGET_INFLIGHT_CHUNKS), file workers by `FILE_CONCURRENCY`, per-file chunk fan-out by
//! `CHUNK_CONCURRENCY`. Decode + write runs on `spawn_blocking` behind its own semaphore so CPU
//! work never holds a network slot.
//!
//! Cancel (D-07): the token is checked before every file, before every chunk attempt (and inside
//! the fetcher's backoff). A file that fails or is cancelled still drains its in-flight chunk
//! tasks before returning, so no blocking write can land after `run_install` returns.
//!
//! Every exit path after the download phase starts goes through the single `finalize` call at the
//! bottom of `run_install` (D-11).

use crate::acf::{self, AcfWritten, AttemptedDepot, RunOutcome, RunResult};
use crate::container::{decode_chunk, ContainerKind};
use crate::events::{ProgressEmitter, Snapshot};
use crate::fetch::{FetchError, Fetcher, ERESULT_BLOCKED};
use crate::inflight::{InflightLimiter, TARGET_INFLIGHT_CHUNKS};
use crate::job::{DepotJob, DepotRef, JobMode, PlannedDepot};
use crate::manifest::{normalize_depot_path, ManifestStore};
use crate::model::{ChunkRef, DepotManifest, ManifestFile};
use crate::outcome::{
    select_primary_failure, Containers, ErrorKind, Failure, FailureScope, Outcome, SelectedFile,
    Stats, Status, FAILURE_LOG_CAP,
};
use crate::post::{
    apply_file_modes, apply_macho_fallback, check_symlink_target, detect_path_collisions,
    probe_case_insensitive, resolve_contained_path, CollisionDepot, FlagsCensus, ModeReport,
    CUSTOM_EXECUTABLE_FLAG, DIRECTORY_FLAG, EXECUTABLE_FLAG, SYMLINK_FLAG,
};
use crate::reconcile::{reconcile_partial_state, sha1_file, verify_structural_integrity};
use crate::stall::StallTracker;
use crate::{JobContext, JobHost};
use futures_util::future::BoxFuture;
use futures_util::stream::{self, StreamExt};
use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tokio::sync::Semaphore;
use tokio_util::sync::CancellationToken;

// TS origin: depot/download.ts CHUNK_CONCURRENCY
/// Chunks of one file fetched at once.
pub const CHUNK_CONCURRENCY: usize = 4;

// TS origin: depot/download.ts FILE_CONCURRENCY
/// Files downloaded at once.
pub const FILE_CONCURRENCY: usize = 32;

/// The outcome carries at most this many failures (the primary one first); a run with thousands
/// of bad files must not produce a megabyte result frame.
pub const OUTCOME_FAILURE_CAP: usize = 100;

/// Default decode parallelism: `max(1, min(cpus - 1, 4))` so the UI keeps a core.
pub fn default_decode_threads() -> usize {
    let cpus = std::thread::available_parallelism().map_or(1, |n| n.get());
    cpus.saturating_sub(1).clamp(1, 4)
}

// ---------------------------------------------------------------------------
// Chunk source
// ---------------------------------------------------------------------------

/// Where still-encrypted chunk bytes come from. `Fetcher` in production, in-memory in tests.
pub trait ChunkSource: Send + Sync {
    fn fetch<'a>(
        &'a self,
        depot_id: &'a str,
        sha_hex: &'a str,
        seed: usize,
        slot: usize,
        cancel: &'a CancellationToken,
    ) -> BoxFuture<'a, Result<(Vec<u8>, String), FetchError>>;
}

impl ChunkSource for Fetcher {
    fn fetch<'a>(
        &'a self,
        depot_id: &'a str,
        sha_hex: &'a str,
        seed: usize,
        slot: usize,
        cancel: &'a CancellationToken,
    ) -> BoxFuture<'a, Result<(Vec<u8>, String), FetchError>> {
        Box::pin(self.fetch_chunk(depot_id, sha_hex, seed, slot, cancel))
    }
}

// ---------------------------------------------------------------------------
// Run context
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct Counters {
    pub done_bytes: AtomicU64,
    pub net_bytes: AtomicU64,
    pub chunks: AtomicU64,
    pub files_done: AtomicU64,
    pub vz: AtomicU64,
    pub vsza: AtomicU64,
    pub pk: AtomicU64,
    /// Attempts at the executable chmod (the TS `chmodAttempts`).
    pub chmod_attempts: AtomicU64,
    /// Files given +x by the Mach-O fallback.
    pub macho_exec: AtomicU64,
    pub mode_warnings: AtomicU64,
    pub last_host: Mutex<Option<String>>,
}

pub struct RunCtx {
    pub source: Arc<dyn ChunkSource>,
    pub decode_sem: Arc<Semaphore>,
    pub stall: Arc<StallTracker>,
    pub cancel: CancellationToken,
    pub emitter: ProgressEmitter,
    pub counters: Arc<Counters>,
    pub total_bytes: u64,
    pub files_total: u64,
    pub file_concurrency: usize,
}

impl RunCtx {
    pub fn snapshot(&self) -> Snapshot {
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
}

/// One file to materialise. Cheap to clone (the manifest is shared).
#[derive(Clone)]
pub struct FileJob {
    pub depot_id: Arc<str>,
    pub key: [u8; 32],
    pub manifest: Arc<DepotManifest>,
    pub file_idx: usize,
    /// Rotates the starting host (`fileSeed` in TS).
    pub seed: usize,
}

impl FileJob {
    pub fn file(&self) -> &ManifestFile {
        &self.manifest.files[self.file_idx]
    }
}

/// Why a file did not complete.
#[derive(Debug)]
pub enum FileErr {
    Cancelled,
    Failed(Box<Failure>),
}

fn failure(file: &str, kind: ErrorKind, message: impl Into<String>) -> Failure {
    Failure {
        file: Some(file.to_string()),
        kind,
        message: message.into(),
        code: None,
        eresult: None,
        http_status: None,
        scope: None,
        ms_since_progress: None,
    }
}

fn failed(file: &str, kind: ErrorKind, message: impl Into<String>) -> FileErr {
    FileErr::Failed(Box::new(failure(file, kind, message)))
}

/// ENOSPC / ERROR_DISK_FULL / ERROR_HANDLE_DISK_FULL become `disk_full`, everything else `io`.
pub fn io_kind(e: &io::Error) -> ErrorKind {
    match e.raw_os_error() {
        #[cfg(unix)]
        Some(28) => ErrorKind::DiskFull,
        #[cfg(windows)]
        Some(112) | Some(39) => ErrorKind::DiskFull,
        _ => ErrorKind::Io,
    }
}

fn io_failed(file: &str, what: &str, e: &io::Error) -> FileErr {
    let kind = io_kind(e);
    let message = if kind == ErrorKind::DiskFull {
        format!("{what}: ENOSPC no space left on device")
    } else {
        format!("{what}: {e}")
    };
    failed(file, kind, message)
}

fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write as _;
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        let _ = write!(s, "{b:02x}");
    }
    s
}

fn key_from_hex(hex: &str) -> Option<[u8; 32]> {
    if hex.len() != 64 || !hex.is_ascii() {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, o) in out.iter_mut().enumerate() {
        *o = u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).ok()?;
    }
    Some(out)
}

#[cfg(unix)]
fn write_all_at(f: &fs::File, buf: &[u8], offset: u64) -> io::Result<()> {
    use std::os::unix::fs::FileExt;
    f.write_all_at(buf, offset)
}

#[cfg(windows)]
fn write_all_at(f: &fs::File, buf: &[u8], offset: u64) -> io::Result<()> {
    use std::os::windows::fs::FileExt;
    let mut done = 0usize;
    while done < buf.len() {
        let n = f.seek_write(&buf[done..], offset + done as u64)?;
        if n == 0 {
            return Err(io::ErrorKind::WriteZero.into());
        }
        done += n;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Mode application (shared by fresh files and the reconciled-file heal)
// ---------------------------------------------------------------------------

/// Port of `applyEDepotFileModes` + the Mach-O fallback, with the TS `chmodAttempts` counter.
/// `macho` is false for the zero-byte path, which TS never ran the fallback on.
fn apply_modes_sync(
    counters: &Counters,
    dest: &Path,
    file: &ManifestFile,
    macho: bool,
) -> Result<(), String> {
    let flags = file.flags;
    let mut report = ModeReport::default();
    if flags != 0 {
        if flags & (EXECUTABLE_FLAG | CUSTOM_EXECUTABLE_FLAG) != 0 {
            counters.chmod_attempts.fetch_add(1, Ordering::Relaxed);
        }
        apply_file_modes(dest, flags, &mut report).map_err(|e| e.to_string())?;
        if let Some(msg) = report.failures.first() {
            return Err(msg.clone());
        }
    }
    if macho && apply_macho_fallback(dest, flags, &mut report) {
        counters.macho_exec.fetch_add(1, Ordering::Relaxed);
    }
    counters
        .mode_warnings
        .fetch_add(report.warnings.len() as u64, Ordering::Relaxed);
    Ok(())
}

/// Re-applies modes to reconciled (skipped-download) files. Directory and symlink entries are
/// skipped: `chmod 0o444` on a directory would strip its traversable bit.
pub async fn heal_reconciled_modes(
    ctx: &RunCtx,
    root: &Path,
    skipped: Vec<FileJob>,
) -> Vec<Failure> {
    let root = root.to_path_buf();
    let counters = ctx.counters.clone();
    let cancel = ctx.cancel.clone();
    tokio::task::spawn_blocking(move || {
        let mut out = Vec::new();
        for job in &skipped {
            if cancel.is_cancelled() {
                break;
            }
            let file = job.file();
            if file.flags & (DIRECTORY_FLAG | SYMLINK_FLAG) != 0 {
                continue;
            }
            let Ok(dest) = resolve_contained_path(&root, &file.filename) else {
                continue;
            };
            if let Err(msg) = apply_modes_sync(&counters, &dest, file, true) {
                out.push(failure(
                    &file.filename,
                    ErrorKind::Io,
                    format!("failed to re-apply file mode flags on reconciled file: {msg}"),
                ));
            }
        }
        out
    })
    .await
    .unwrap_or_default()
}

// ---------------------------------------------------------------------------
// One file
// ---------------------------------------------------------------------------

enum BlockErr {
    Cancelled,
    Decode(crate::container::DecodeError),
    Io(io::Error),
}

/// Removes a stale empty directory sitting where a file belongs. A non-empty one is refused.
fn clear_stale_dir(dest: &Path, filename: &str) -> Result<(), String> {
    let Ok(meta) = fs::symlink_metadata(dest) else {
        return Ok(());
    };
    if !meta.is_dir() {
        return Ok(());
    }
    fs::remove_dir(dest).map_err(|e| {
        format!(
            "\"{filename}\" is a file in the depot manifest, but a NON-EMPTY directory exists at \
             that path. Refusing to delete it ({e}) -- remove it by hand and retry the install."
        )
    })
}

fn place_symlink(dest: &Path, target: &str) -> io::Result<()> {
    match fs::remove_file(dest) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(e) => return Err(e),
    }
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(target, dest)
    }
    #[cfg(windows)]
    {
        std::os::windows::fs::symlink_file(target, dest)
    }
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> T + Send + 'static,
    file: &str,
) -> Result<T, FileErr> {
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|_| failed(file, ErrorKind::Io, "blocking task failed"))
}

fn finish_file(ctx: &RunCtx) {
    ctx.counters.files_done.fetch_add(1, Ordering::Relaxed);
    ctx.emitter.progress(ctx.snapshot());
}

/// Fetch, decode and positionally write one chunk. Never holds a network slot while decoding.
async fn chunk_task(
    ctx: &RunCtx,
    fc: &CancellationToken,
    job: &FileJob,
    chunk: &ChunkRef,
    ci: usize,
    out: &Arc<fs::File>,
) -> Result<(), FileErr> {
    let file = job.file();
    if fc.is_cancelled() {
        return Err(FileErr::Cancelled);
    }
    let sha_hex = hex(&chunk.sha);
    let slot = job.seed % ctx.file_concurrency.max(1);
    let fetched = ctx
        .source
        .fetch(&job.depot_id, &sha_hex, job.seed.wrapping_add(ci), slot, fc)
        .await;
    let (raw, host) = match fetched {
        Ok(v) => v,
        Err(FetchError::Cancelled) => return Err(FileErr::Cancelled),
        Err(FetchError::Failed(mut f)) => {
            f.file = Some(file.filename.clone());
            return Err(FileErr::Failed(Box::new(f)));
        }
    };
    ctx.counters
        .net_bytes
        .fetch_add(raw.len() as u64, Ordering::Relaxed);
    *ctx.counters
        .last_host
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = Some(host);

    let permit = tokio::select! {
        _ = fc.cancelled() => return Err(FileErr::Cancelled),
        p = ctx.decode_sem.clone().acquire_owned() => match p {
            Ok(p) => p,
            Err(_) => return Err(failed(&file.filename, ErrorKind::Io, "decode semaphore closed")),
        },
    };
    let (key, sha, cb, offset) = (
        job.key,
        chunk.sha,
        u64::from(chunk.cb_original),
        chunk.offset,
    );
    let (out, fc2) = (Arc::clone(out), fc.clone());
    let joined = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        if fc2.is_cancelled() {
            return Err(BlockErr::Cancelled);
        }
        let (data, kind) = decode_chunk(&raw, &key, cb, &sha).map_err(BlockErr::Decode)?;
        if fc2.is_cancelled() {
            return Err(BlockErr::Cancelled);
        }
        write_all_at(&out, &data, offset).map_err(BlockErr::Io)?;
        Ok((kind, data.len() as u64))
    })
    .await;
    let (kind, len) = match joined {
        Ok(Ok(v)) => v,
        Ok(Err(BlockErr::Cancelled)) => return Err(FileErr::Cancelled),
        Ok(Err(BlockErr::Decode(e))) => {
            let mut f = failure(&file.filename, ErrorKind::DecodeFailed, e.to_string());
            f.code = Some(e.code.to_string());
            return Err(FileErr::Failed(Box::new(f)));
        }
        Ok(Err(BlockErr::Io(e))) => {
            return Err(io_failed(&file.filename, "chunk write failed", &e))
        }
        Err(_) => return Err(failed(&file.filename, ErrorKind::Io, "decode task failed")),
    };
    let c = &ctx.counters;
    c.done_bytes.fetch_add(len, Ordering::Relaxed);
    c.chunks.fetch_add(1, Ordering::Relaxed);
    match kind {
        ContainerKind::Vz => &c.vz,
        ContainerKind::Vsza => &c.vsza,
        ContainerKind::Pk => &c.pk,
    }
    .fetch_add(1, Ordering::Relaxed);
    ctx.stall.record_progress();
    ctx.emitter.progress(ctx.snapshot());
    Ok(())
}

/// Materialise one manifest entry under `root`. Port of `downloadSingleFile`.
pub async fn write_file(ctx: &RunCtx, root: &Path, job: &FileJob) -> Result<(), FileErr> {
    let file = job.file();
    let name = file.filename.as_str();
    let dest = resolve_contained_path(root, name)
        .map_err(|e| failed(name, ErrorKind::PathTraversal, e.message))?;
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| io_failed(name, "create parent directory", &e))?;
    }

    if file.flags & DIRECTORY_FLAG != 0 {
        tokio::fs::create_dir_all(&dest)
            .await
            .map_err(|e| io_failed(name, "create directory", &e))?;
        finish_file(ctx);
        return Ok(());
    }

    if file.flags & SYMLINK_FLAG != 0 {
        let Some(target) = file.linktarget.as_deref().filter(|t| !t.is_empty()) else {
            return Err(failed(
                name,
                ErrorKind::SymlinkFailed,
                format!("symlink manifest entry for {name} has no linktarget"),
            ));
        };
        check_symlink_target(root, &dest, target)
            .map_err(|e| failed(name, ErrorKind::PathTraversal, e.message))?;
        let (d, t) = (dest.clone(), target.to_string());
        blocking(move || place_symlink(&d, &t), name)
            .await?
            .map_err(|e| {
                failed(
                    name,
                    ErrorKind::SymlinkFailed,
                    format!("symlink failed: {e}"),
                )
            })?;
        finish_file(ctx);
        return Ok(());
    }

    let (d, n) = (dest.clone(), name.to_string());
    blocking(move || clear_stale_dir(&d, &n), name)
        .await?
        .map_err(|m| failed(name, ErrorKind::Io, m))?;

    if file.chunks.is_empty() || file.size == 0 {
        if file.size != 0 {
            return Err(failed(
                name,
                ErrorKind::ManifestDecode,
                format!(
                    "manifest reported {name} size={} but zero chunks",
                    file.size
                ),
            ));
        }
        let (d, job2, counters) = (dest.clone(), job.clone(), ctx.counters.clone());
        blocking(
            move || -> Result<(), (ErrorKind, String)> {
                fs::File::create(&d).map_err(|e| (io_kind(&e), e.to_string()))?;
                apply_modes_sync(&counters, &d, job2.file(), false).map_err(|m| {
                    (
                        ErrorKind::Io,
                        format!("failed to apply file mode flags: {m}"),
                    )
                })
            },
            name,
        )
        .await?
        .map_err(|(k, m)| failed(name, k, m))?;
        finish_file(ctx);
        return Ok(());
    }

    let size = file.size;
    let d = dest.clone();
    let opened = blocking(
        move || -> io::Result<fs::File> {
            let f = fs::OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .open(&d)?;
            f.set_len(size)?;
            Ok(f)
        },
        name,
    )
    .await?
    .map_err(|e| io_failed(name, "open file", &e))?;
    let out = Arc::new(opened);

    // Siblings of a failed chunk are cancelled through `fc`, but their blocking tasks cannot be
    // aborted, so the stream is always drained: nothing writes after this function returns.
    let fc = ctx.cancel.child_token();
    let mut first_err: Option<FileErr> = None;
    {
        let mut pool = stream::iter(file.chunks.iter().enumerate())
            .map(|(ci, chunk)| chunk_task(ctx, &fc, job, chunk, ci, &out))
            .buffer_unordered(CHUNK_CONCURRENCY);
        while let Some(r) = pool.next().await {
            if let Err(e) = r {
                if first_err.is_none() {
                    first_err = Some(e);
                }
                fc.cancel();
            }
        }
    }
    drop(out);
    if let Some(e) = first_err {
        return Err(e);
    }
    if ctx.cancel.is_cancelled() {
        return Err(FileErr::Cancelled);
    }

    let d = dest.clone();
    let got = blocking(move || sha1_file(&d), name)
        .await?
        .map_err(|e| io_failed(name, "whole-file SHA1 read failed", &e))?;
    ctx.stall.record_progress();
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

    let (d, job2, counters) = (dest, job.clone(), ctx.counters.clone());
    blocking(
        move || apply_modes_sync(&counters, &d, job2.file(), true),
        name,
    )
    .await?
    .map_err(|m| {
        failed(
            name,
            ErrorKind::Io,
            format!("failed to apply file mode flags for {name}: {m}"),
        )
    })?;
    finish_file(ctx);
    Ok(())
}

// ---------------------------------------------------------------------------
// All files
// ---------------------------------------------------------------------------

enum FileOutcome {
    Done,
    Skipped,
    Failed(Box<Failure>),
}

/// Drives `FILE_CONCURRENCY` workers over `jobs`. Port of `downloadDepotFiles`' worker loop,
/// run-scoped stall give-up and completeness computation. `all` is every plan entry (including
/// reconciled ones) for the census and the structural re-verification; `initial_failures` carries
/// the mode-heal failures.
pub async fn run_files(
    ctx: &RunCtx,
    root: &Path,
    jobs: Vec<FileJob>,
    all: &[FileJob],
    case_insensitive: bool,
    initial_failures: Vec<Failure>,
) -> RunResult {
    let stalled_ms: Mutex<Option<u64>> = Mutex::new(None);
    let outcomes: Vec<FileOutcome> = stream::iter(jobs)
        .map(|job| {
            let stalled_ms = &stalled_ms;
            async move {
                if ctx.cancel.is_cancelled() {
                    return FileOutcome::Skipped;
                }
                if ctx.stall.has_stalled() {
                    stalled_ms
                        .lock()
                        .unwrap_or_else(|e| e.into_inner())
                        .get_or_insert_with(|| ctx.stall.ms_since_progress());
                    return FileOutcome::Skipped;
                }
                match write_file(ctx, root, &job).await {
                    Ok(()) => {
                        ctx.stall.record_progress();
                        FileOutcome::Done
                    }
                    Err(FileErr::Cancelled) => FileOutcome::Skipped,
                    Err(FileErr::Failed(f)) => FileOutcome::Failed(f),
                }
            }
        })
        .buffer_unordered(ctx.file_concurrency.max(1))
        .collect()
        .await;

    let mut failures = initial_failures;
    let mut unattempted = 0usize;
    for o in outcomes {
        match o {
            FileOutcome::Done => {}
            FileOutcome::Skipped => unattempted += 1,
            FileOutcome::Failed(f) => {
                if failures.len() < FAILURE_LOG_CAP {
                    ctx.emitter.warn(format!(
                        "file \"{}\" failed: {:?}: {}",
                        f.file.as_deref().unwrap_or(""),
                        f.kind,
                        f.message
                    ));
                } else if failures.len() == FAILURE_LOG_CAP {
                    ctx.emitter.warn(format!(
                        "further per-file failures suppressed after {FAILURE_LOG_CAP}"
                    ));
                }
                failures.push(*f);
            }
        }
    }
    let stalled = *stalled_ms.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(ms) = stalled {
        let mut f = failure(
            "(run)",
            ErrorKind::Stall,
            format!(
                "download stalled: no forward progress for {ms}ms across the whole run \
                 -- giving up with {unattempted} file(s) unattempted"
            ),
        );
        f.scope = Some(FailureScope::Run);
        f.ms_since_progress = Some(ms);
        failures.push(f);
    }

    ctx.emitter.force(ctx.snapshot());

    let cancelled = ctx.cancel.is_cancelled();
    let all_attempted = unattempted == 0;

    let mut census = FlagsCensus::new();
    for j in all {
        census.add(j.file());
    }
    let exec_claimed = census.executable_flagged > 0;
    let modes_applied_this_run = ctx.counters.chmod_attempts.load(Ordering::Relaxed) > 0;
    let all_modes_applied = failures.is_empty() && (!exec_claimed || modes_applied_this_run);

    let mut structurally_verified = true;
    if all_attempted && failures.is_empty() && !cancelled {
        let (root, all) = (root.to_path_buf(), all.to_vec());
        let verdict = tokio::task::spawn_blocking(move || {
            let files: Vec<&ManifestFile> = all.iter().map(|j| j.file()).collect();
            verify_structural_integrity(&root, &files, case_insensitive)
        })
        .await;
        match verdict {
            Ok(Ok(r)) => {
                structurally_verified = r.ok;
                if !r.ok {
                    ctx.emitter.warn(format!(
                        "post-download structural re-verification found {} of {} planned entries damaged or missing",
                        r.mismatch_count, r.checked
                    ));
                }
            }
            _ => structurally_verified = false,
        }
    }

    RunResult {
        outcome: if cancelled {
            RunOutcome::Cancelled
        } else {
            RunOutcome::Completed
        },
        all_files_verified: all_attempted && failures.is_empty() && structurally_verified,
        all_modes_applied,
        failures,
    }
}

// ---------------------------------------------------------------------------
// The install job
// ---------------------------------------------------------------------------

fn outcome_shell(job_id: &str, status: Status, started: Instant) -> Outcome {
    Outcome {
        job_id: job_id.to_string(),
        status,
        failures: Vec::new(),
        all_files_verified: false,
        all_modes_applied: false,
        attempted_depots: Vec::new(),
        skipped_depots: Vec::new(),
        acf: None,
        missing: None,
        files: None,
        stats: Stats {
            elapsed_ms: started.elapsed().as_millis() as u64,
            ..Stats::default()
        },
    }
}

/// An error Outcome for a failure that happened before any depot was attempted.
pub fn error_outcome(job_id: &str, f: Failure) -> Outcome {
    let mut o = outcome_shell(job_id, Status::Error, Instant::now());
    o.failures.push(f);
    o
}

fn plain_failure(kind: ErrorKind, message: impl Into<String>) -> Failure {
    Failure {
        file: None,
        kind,
        message: message.into(),
        code: None,
        eresult: None,
        http_status: None,
        scope: None,
        ms_since_progress: None,
    }
}

/// Runs an install job to an `Outcome`. Always returns; every failure is data.
pub async fn run_install(
    job: &DepotJob,
    jctx: &JobContext,
    host: Arc<dyn JobHost>,
    cancel: CancellationToken,
) -> Outcome {
    let started = Instant::now();
    let emitter = ProgressEmitter::new(host.clone(), &job.job_id);
    let out = run_install_inner(job, jctx, host, cancel, &emitter, started).await;
    emitter.close();
    out
}

async fn run_install_inner(
    job: &DepotJob,
    jctx: &JobContext,
    host: Arc<dyn JobHost>,
    cancel: CancellationToken,
    emitter: &ProgressEmitter,
    started: Instant,
) -> Outcome {
    // D-05: the delta shape is accepted on the wire and refused here, before any network use.
    if job.depots.iter().any(|d| d.from_manifest.is_some()) {
        let mut o = outcome_shell(&job.job_id, Status::Error, started);
        o.failures.push(plain_failure(
            ErrorKind::DeltaUnsupported,
            "fromManifest delta installs are not supported",
        ));
        return o;
    }
    let mode = job.mode;
    // select_files is a partial staging fetch: it never finalizes (no ACF).
    let finalize = if mode == JobMode::SelectFiles {
        None
    } else {
        job.finalize.as_ref()
    };
    let selected: Option<HashSet<String>> = match (mode, &job.select_paths) {
        (JobMode::SelectFiles, Some(p)) => {
            Some(p.iter().map(|s| normalize_depot_path(s)).collect())
        }
        (JobMode::SelectFiles, None) => {
            return error_outcome(
                &job.job_id,
                plain_failure(ErrorKind::Io, "select_files requires selectPaths"),
            )
        }
        _ => None,
    };

    let root = PathBuf::from(&job.install_root);
    if let Err(e) = tokio::fs::create_dir_all(&root).await {
        return error_outcome(
            &job.job_id,
            plain_failure(io_kind(&e), format!("cannot create install root: {e}")),
        );
    }

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
        Err(m) => return error_outcome(&job.job_id, plain_failure(ErrorKind::Io, m)),
    };
    let fetcher = Arc::new(Fetcher::new(
        host,
        &job.job_id,
        &job.app_id,
        job.hosts.clone(),
        limiter,
        stall.clone(),
    ));

    // Every manifest is loaded before any chunk is fetched.
    let store = ManifestStore::new(jctx.cache_dir.clone(), fetcher.clone());
    let loaded: Vec<Result<Arc<DepotManifest>, FetchError>> = stream::iter(job.depots.iter())
        .map(|d| store.load(d, &cancel))
        .buffered(4)
        .collect()
        .await;
    // An EResult-40 (Blocked) refusal drops that depot and the job continues, like
    // `skipBlockedDepot` in plan.ts; any other failure still ends the job.
    let mut kept: Vec<&DepotRef> = Vec::with_capacity(loaded.len());
    let mut manifests = Vec::with_capacity(loaded.len());
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
            Err(FetchError::Failed(f)) => return error_outcome(&job.job_id, f),
        }
    }
    // `throwIfAllDepotsSkipped` (message kept byte-identical for the UI copy): a plan reduced to zero depots must fail (eresult 40 so the TS
    // map picks the depotBlocked copy), never report an empty success.
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
        let mut o = error_outcome(&job.job_id, f);
        o.skipped_depots = skipped_depots;
        return o;
    }

    // Cross-depot collisions (later appinfo rank wins); the caller applies `dropped`.
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

    let mut all: Vec<FileJob> = Vec::new();
    let mut picked: Vec<SelectedFile> = Vec::new();
    let mut found: HashSet<String> = HashSet::new();
    let mut attempted: Vec<AttemptedDepot> = Vec::new();
    for (di, (d, m)) in kept.iter().copied().zip(&manifests).enumerate() {
        let Some(key) = key_from_hex(&d.key) else {
            return error_outcome(
                &job.job_id,
                plain_failure(ErrorKind::ManifestDecode, "depot key is malformed"),
            );
        };
        let depot_id: Arc<str> = Arc::from(d.depot_id.as_str());
        let mut size = 0u64;
        for fi in 0..m.files.len() {
            if dropped.contains(&(di, fi)) {
                continue;
            }
            if let Some(sel) = &selected {
                let f = &m.files[fi];
                let norm = normalize_depot_path(&f.filename);
                if f.flags & (DIRECTORY_FLAG | SYMLINK_FLAG) != 0 || !sel.contains(&norm) {
                    continue;
                }
                found.insert(norm);
                picked.push(SelectedFile {
                    filename: f.filename.clone(),
                    size: f.size,
                    sha1: hex(&f.sha_content),
                });
            }
            size += m.files[fi].size;
            let seed = all.len();
            all.push(FileJob {
                depot_id: depot_id.clone(),
                key,
                manifest: m.clone(),
                file_idx: fi,
                seed,
            });
        }
        if selected.is_some() && size == 0 && !all.iter().any(|j| *j.depot_id == *d.depot_id) {
            continue;
        }
        attempted.push(PlannedDepot {
            depot_id: d.depot_id.clone(),
            gid: m.gid.clone(),
            size,
        });
    }
    let total_bytes: u64 = attempted.iter().map(|d| d.size).sum();

    if let Some(sel) = &selected {
        let unknown = sel.iter().filter(|p| !found.contains(*p)).count();
        if unknown > 0 {
            emitter.warn(format!(
                "{unknown} selected path(s) are not in any manifest and were skipped"
            ));
        }
    }
    emitter.planned(total_bytes, all.len() as u64, attempted.clone());
    if path_collisions > 0 {
        emitter.warn(format!(
            "cross-depot path collision detected: {path_collisions}"
        ));
    }

    // ---- From here a download is attempted: every exit goes through `finalize`. ----
    let counters = Arc::new(Counters::default());
    let ctx = RunCtx {
        source: fetcher.clone(),
        decode_sem: Arc::new(Semaphore::new(decode_threads)),
        stall,
        cancel: cancel.clone(),
        emitter: emitter.clone(),
        counters: counters.clone(),
        total_bytes,
        files_total: all.len() as u64,
        file_concurrency,
    };
    let heartbeat = emitter.spawn_heartbeat();

    // A reconcile error falls back to a full re-download, like the TS.
    let refs: Vec<&ManifestFile> = all.iter().map(|j| j.file()).collect();
    let (queued, skipped, reconciled): (Vec<FileJob>, Vec<FileJob>, bool) =
        match reconcile_partial_state(&root, &refs, &cancel, decode_threads).await {
            Ok(r) => {
                counters
                    .done_bytes
                    .store(r.bytes_verified, Ordering::Relaxed);
                counters
                    .files_done
                    .store(r.skipped.len() as u64, Ordering::Relaxed);
                let complete = r.complete;
                (
                    r.queued.iter().map(|&i| all[i].clone()).collect(),
                    r.skipped.iter().map(|&i| all[i].clone()).collect(),
                    complete,
                )
            }
            Err(_) => (all.clone(), Vec::new(), false),
        };
    drop(refs);

    let skipped_count = skipped.len() as u64;
    let heal_failures = heal_reconciled_modes(&ctx, &root, skipped).await;
    let mut missing: Option<Vec<String>> = None;
    let result = if mode == JobMode::VerifyOnly {
        // No chunk is fetched: the reconcile walk is the whole job. Anything left in `queued` is
        // missing or mismatched and keeps the ACF at the honest 1026.
        missing = Some(
            queued
                .iter()
                .map(|j| normalize_depot_path(&j.file().filename))
                .collect(),
        );
        let verified = reconciled && queued.is_empty();
        RunResult {
            outcome: if queued.is_empty() && !cancel.is_cancelled() {
                RunOutcome::Completed
            } else {
                RunOutcome::Cancelled
            },
            all_files_verified: verified,
            all_modes_applied: verified && heal_failures.is_empty(),
            failures: heal_failures,
        }
    } else {
        run_files(&ctx, &root, queued, &all, case_insensitive, heal_failures).await
    };
    heartbeat.abort();
    let _ = heartbeat.await;

    let mut acf_out = None;
    let mut failures = result.failures.clone();
    if let Some(spec) = finalize {
        // Keyed on the user's cancel token, never `result.outcome`: VerifyOnly reports Cancelled
        // for missing files without a cancel and must keep downgrading to 1026.
        let files_written = counters
            .files_done
            .load(Ordering::Relaxed)
            .saturating_sub(skipped_count);
        let preserve = acf::preserve_installed_manifest(
            cancel.is_cancelled(),
            counters.net_bytes.load(Ordering::Relaxed),
            files_written,
            acf::read_existing_state_flags(Path::new(&spec.steamapps_dir), &job.app_id),
        );
        if preserve {
            emitter.warn(
                "cancelled with nothing fetched over an installed appmanifest; ACF left untouched",
            );
        } else {
            match acf::finalize(spec, &job.app_id, &attempted, &result).await {
                Ok(AcfWritten {
                    state_flags,
                    size_on_disk,
                    ..
                }) => {
                    acf_out = Some(crate::outcome::AcfResult {
                        state_flags,
                        size_on_disk: size_on_disk.to_string(),
                    });
                }
                Err(f) => failures.push(f),
            }
        }
    }

    let mode_notes = counters.mode_warnings.load(Ordering::Relaxed);
    if mode_notes > 0 {
        emitter.warn(format!(
            "file mode notes: {mode_notes} (hidden-flag no-ops, Mach-O fallbacks)"
        ));
    }

    let status = if cancel.is_cancelled() {
        Status::Cancelled
    } else if failures.is_empty() {
        Status::Completed
    } else {
        Status::Error
    };
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

    let c = &counters;
    let mut o = outcome_shell(&job.job_id, status, started);
    o.failures = failures;
    o.all_files_verified = result.all_files_verified;
    o.all_modes_applied = result.all_modes_applied;
    o.attempted_depots = attempted;
    o.skipped_depots = skipped_depots;
    o.acf = acf_out;
    o.missing = missing;
    if selected.is_some() {
        o.files = Some(picked);
    }
    o.stats = Stats {
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
    o
}

/// Test-only chunk encoders, shared with the integration tests' fixture builder.
#[cfg(test)]
#[allow(dead_code)]
#[path = "../tests/support/encode.rs"]
mod test_encode;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::ChunkRef;
    use sha1::{Digest, Sha1};
    use std::collections::HashMap;
    use std::time::Duration;

    use super::test_encode as encode;

    const KEY: [u8; 32] = [7u8; 32];

    /// Serves chunks from memory; `delay_ms` per sha lets a test land chunks out of order.
    struct MemSource {
        bodies: HashMap<String, Vec<u8>>,
        delay_ms: HashMap<String, u64>,
    }
    impl ChunkSource for MemSource {
        fn fetch<'a>(
            &'a self,
            _depot: &'a str,
            sha_hex: &'a str,
            _seed: usize,
            _slot: usize,
            cancel: &'a CancellationToken,
        ) -> BoxFuture<'a, Result<(Vec<u8>, String), FetchError>> {
            Box::pin(async move {
                let ms = self.delay_ms.get(sha_hex).copied().unwrap_or(0);
                tokio::select! {
                    _ = cancel.cancelled() => return Err(FetchError::Cancelled),
                    _ = tokio::time::sleep(Duration::from_millis(ms)) => {}
                }
                match self.bodies.get(sha_hex) {
                    Some(b) => Ok((b.clone(), "mem".to_string())),
                    None => Err(FetchError::Failed(failure(
                        "",
                        ErrorKind::CdnHttp,
                        "no such chunk",
                    ))),
                }
            })
        }
    }

    /// Splits `content` into `chunk` byte pieces and builds the manifest entry + sources.
    fn build(
        name: &str,
        content: &[u8],
        chunk: usize,
        wrong_sha: bool,
        delays: &[u64],
    ) -> (Arc<DepotManifest>, MemSource) {
        let mut bodies = HashMap::new();
        let mut delay_ms = HashMap::new();
        let mut chunks = Vec::new();
        for (i, piece) in content.chunks(chunk).enumerate() {
            let sha: [u8; 20] = Sha1::digest(piece).into();
            let enc = encode::steam_encrypt(&encode::vz_wrap(piece), &KEY, &[1u8; 16]);
            bodies.insert(hex(&sha), enc);
            delay_ms.insert(hex(&sha), delays.get(i).copied().unwrap_or(0));
            chunks.push(ChunkRef {
                sha,
                offset: (i * chunk) as u64,
                cb_original: piece.len() as u32,
                cb_compressed: 0,
                crc: 0,
            });
        }
        let mut sha_content: [u8; 20] = Sha1::digest(content).into();
        if wrong_sha {
            sha_content[0] ^= 0xff;
        }
        let m = DepotManifest {
            depot_id: "1".into(),
            gid: "2".into(),
            creation_time: 0,
            total_uncompressed: content.len() as u64,
            files: vec![ManifestFile {
                filename: name.into(),
                size: content.len() as u64,
                flags: 0,
                sha_content,
                chunks,
                linktarget: None,
            }],
        };
        (Arc::new(m), MemSource { bodies, delay_ms })
    }

    fn ctx(source: MemSource) -> RunCtx {
        RunCtx {
            source: Arc::new(source),
            decode_sem: Arc::new(Semaphore::new(2)),
            stall: Arc::new(StallTracker::default()),
            cancel: CancellationToken::new(),
            emitter: ProgressEmitter::new(Arc::new(crate::events::test_support::NullHost), "t"),
            counters: Arc::new(Counters::default()),
            total_bytes: 0,
            files_total: 1,
            file_concurrency: 4,
        }
    }

    fn job_for(m: Arc<DepotManifest>) -> FileJob {
        FileJob {
            depot_id: Arc::from("1"),
            key: KEY,
            manifest: m,
            file_idx: 0,
            seed: 0,
        }
    }

    fn content(len: usize) -> Vec<u8> {
        (0..len).map(|i| (i * 31 % 251) as u8).collect()
    }

    #[tokio::test]
    async fn out_of_order_chunks_assemble() {
        let data = content(5000);
        // The first chunk is the slowest, so chunks land 4,3,2,1,0.
        let (m, src) = build("out/a.bin", &data, 1000, false, &[120, 90, 60, 30, 0]);
        let c = ctx(src);
        let dir = tempfile::tempdir().unwrap();
        write_file(&c, dir.path(), &job_for(m)).await.unwrap();
        assert_eq!(fs::read(dir.path().join("out/a.bin")).unwrap(), data);
        assert_eq!(c.counters.chunks.load(Ordering::Relaxed), 5);
        assert_eq!(c.counters.done_bytes.load(Ordering::Relaxed), 5000);
    }

    #[tokio::test]
    async fn whole_file_sha1_mismatch_is_file_failure() {
        let data = content(2500);
        let (m, src) = build("bad.bin", &data, 1000, true, &[]);
        let c = ctx(src);
        let dir = tempfile::tempdir().unwrap();
        match write_file(&c, dir.path(), &job_for(m)).await {
            Err(FileErr::Failed(f)) => {
                assert_eq!(f.kind, ErrorKind::Sha1Mismatch);
                assert_eq!(f.file.as_deref(), Some("bad.bin"));
            }
            other => panic!("expected sha1 failure, got {other:?}"),
        }
    }

    #[test]
    fn enospc_maps_to_disk_full() {
        #[cfg(unix)]
        {
            assert_eq!(
                io_kind(&io::Error::from_raw_os_error(28)),
                ErrorKind::DiskFull
            );
            let f = match io_failed("f", "chunk write failed", &io::Error::from_raw_os_error(28)) {
                FileErr::Failed(f) => f,
                FileErr::Cancelled => panic!(),
            };
            assert!(f.message.contains("ENOSPC"));
        }
        #[cfg(windows)]
        {
            assert_eq!(
                io_kind(&io::Error::from_raw_os_error(112)),
                ErrorKind::DiskFull
            );
            assert_eq!(
                io_kind(&io::Error::from_raw_os_error(39)),
                ErrorKind::DiskFull
            );
        }
        assert_eq!(
            io_kind(&io::Error::from(io::ErrorKind::PermissionDenied)),
            ErrorKind::Io
        );
    }

    #[tokio::test]
    async fn stale_dir_cleared() {
        let data = content(1500);
        let (m, src) = build("pkg/file.bin", &data, 1000, false, &[]);
        let c = ctx(src);
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("pkg/file.bin")).unwrap();
        write_file(&c, dir.path(), &job_for(m.clone()))
            .await
            .unwrap();
        assert_eq!(fs::read(dir.path().join("pkg/file.bin")).unwrap(), data);

        // A non-empty directory is refused, not deleted.
        let d2 = tempfile::tempdir().unwrap();
        fs::create_dir_all(d2.path().join("pkg/file.bin/inner")).unwrap();
        match write_file(&c, d2.path(), &job_for(m)).await {
            Err(FileErr::Failed(f)) => assert_eq!(f.kind, ErrorKind::Io),
            other => panic!("expected refusal, got {other:?}"),
        }
        assert!(d2.path().join("pkg/file.bin/inner").is_dir());
    }

    #[tokio::test]
    async fn traversal_is_a_file_failure_before_any_write() {
        let data = content(100);
        let (m, src) = build("../escape.bin", &data, 1000, false, &[]);
        let c = ctx(src);
        let dir = tempfile::tempdir().unwrap();
        match write_file(&c, dir.path(), &job_for(m)).await {
            Err(FileErr::Failed(f)) => assert_eq!(f.kind, ErrorKind::PathTraversal),
            other => panic!("expected traversal, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn cancel_mid_file_stops_further_fetches() {
        let data = content(20_000);
        // Every chunk takes 200 ms, so cancelling at 50 ms stops the file after the first wave.
        let (m, src) = build("big.bin", &data, 1000, false, &[200; 20]);
        let c = ctx(src);
        let dir = tempfile::tempdir().unwrap();
        let token = c.cancel.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(50)).await;
            token.cancel();
        });
        let r = write_file(&c, dir.path(), &job_for(m)).await;
        assert!(matches!(r, Err(FileErr::Cancelled)));
        assert!(c.counters.chunks.load(Ordering::Relaxed) < 20);
    }
}
