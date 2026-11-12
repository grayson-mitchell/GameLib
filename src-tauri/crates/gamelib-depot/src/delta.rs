//! Chunk-level delta update (Phase 74, productionised from spike 076). Stub: filled in by the
//! implementation commit.

use crate::events::ProgressEmitter;
use crate::job::{DepotJob, JobMode};
use crate::model::{DepotManifest, ManifestFile};
use crate::outcome::{ErrorKind, Failure, Outcome};
use crate::{JobContext, JobHost};
use std::sync::Arc;
use std::time::Instant;
use tokio_util::sync::CancellationToken;

/// Suffix of the temp each changed file is built into, beside its target.
pub const DELTA_TMP_SUFFIX: &str = ".gamelib-delta-tmp";

pub struct WorkSet<'a> {
    pub changed: Vec<&'a ManifestFile>,
    pub flag_only: Vec<&'a ManifestFile>,
    pub unchanged: usize,
}

pub fn compute_work_set<'a>(
    _old: Option<&'a DepotManifest>,
    _new: &'a DepotManifest,
) -> WorkSet<'a> {
    WorkSet {
        changed: Vec::new(),
        flag_only: Vec::new(),
        unchanged: 0,
    }
}

pub fn removed_paths(_old: &[&DepotManifest], _new: &[&DepotManifest]) -> Vec<String> {
    Vec::new()
}

fn plain(kind: ErrorKind, message: &str) -> Failure {
    Failure {
        file: None,
        kind,
        message: message.to_string(),
        code: None,
        eresult: None,
        http_status: None,
        scope: None,
        ms_since_progress: None,
    }
}

/// True when the job asks for a delta (any `fromManifest` on an install job).
pub fn is_delta_job(job: &DepotJob) -> bool {
    job.mode == JobMode::Install && job.depots.iter().any(|d| d.from_manifest.is_some())
}

/// The unsupported shapes, checked before any network use.
pub fn shape_failure(job: &DepotJob) -> Option<Failure> {
    let any_from = job.depots.iter().any(|d| d.from_manifest.is_some());
    if any_from && job.mode != JobMode::Install {
        return Some(plain(
            ErrorKind::DeltaUnsupported,
            "fromManifest is only supported on install jobs",
        ));
    }
    let bad_id = job
        .depots
        .iter()
        .filter_map(|d| d.from_manifest.as_deref())
        .any(|g| g.is_empty() || !g.bytes().all(|b| b.is_ascii_digit()));
    if bad_id {
        return Some(plain(
            ErrorKind::DeltaUnsupported,
            "fromManifest must be a numeric manifest id",
        ));
    }
    if !job.retired_depots.is_empty() && !any_from {
        return Some(plain(
            ErrorKind::DeltaUnsupported,
            "retiredDepots requires a delta job",
        ));
    }
    if any_from && job.finalize.is_none() {
        return Some(plain(
            ErrorKind::DeltaUnsupported,
            "a delta job requires finalize",
        ));
    }
    None
}

pub async fn run_delta(
    job: &DepotJob,
    _jctx: &JobContext,
    _host: Arc<dyn JobHost>,
    _cancel: CancellationToken,
    _emitter: &ProgressEmitter,
    started: Instant,
) -> Outcome {
    let mut o =
        crate::download::error_outcome(&job.job_id, plain(ErrorKind::Io, "delta not implemented"));
    o.stats.elapsed_ms = started.elapsed().as_millis() as u64;
    o
}
