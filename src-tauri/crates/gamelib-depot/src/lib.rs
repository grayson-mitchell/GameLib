//! Tauri-free Steam depot pipeline. `dispatch` is the single entry point shared by the in-process
//! shell arm and `gamelib-depot-cli`.
//!
//! Contract (same as `gamelib-scan`): results, not errors. `Err` means bad args, an unknown op or
//! a panic only; a failed download is an `Outcome` with `status: error`. No bytes cross the pipe.
//! Never log keys or tokens (`DepotRef` has a redacting `Debug`).

pub mod acf;
pub mod container;
pub mod delta;
pub mod download;
pub mod events;
pub mod fetch;
pub mod host_health;
pub mod inflight;
pub mod job;
pub mod manifest;
pub mod model;
pub mod outcome;
pub mod post;
pub mod reconcile;
pub mod registry;
pub mod stall;

use serde::Deserialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};

use job::DepotJob;
pub use job::JobEvent;
use outcome::Outcome;

/// Process-wide runtime for depot jobs: two async workers keep the UI process responsive; blocking
/// work (decode, hashing, writes) runs on the bounded blocking pool.
fn runtime() -> &'static tokio::runtime::Runtime {
    static RT: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
    RT.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .max_blocking_threads(8)
            .thread_name("gamelib-depot")
            .enable_all()
            .build()
            .expect("depot runtime")
    })
}

/// Runs a job to its `Outcome`, blocking the caller. The cancel registration lives exactly as long
/// as the job, so `registry::cancel_all_and_wait` returns only after the job has really stopped.
/// Must not be called from inside a tokio runtime.
pub fn run_job(job: DepotJob, ctx: &JobContext, host: Arc<dyn JobHost>) -> Outcome {
    if job.validate().is_err() {
        return download::error_outcome(
            &job.job_id,
            outcome::Failure {
                file: None,
                kind: outcome::ErrorKind::Io,
                message: "invalid job request".to_string(),
                code: None,
                eresult: None,
                http_status: None,
                scope: None,
                ms_since_progress: None,
            },
        );
    }
    let guard = registry::register(&job.job_id);
    let token = guard.token.clone();
    let out = runtime().block_on(download::run_install(&job, ctx, host, token));
    drop(guard);
    out
}

/// Ops reachable from the shell. Keep sorted (the parity test reads this literal form).
pub const OPS: &[&str] = &[
    "depot_finalize",
    "depot_job_cancel",
    "depot_job_run",
    "depot_manifest_summary",
];

/// Supplied by the shell arm or the CLI `--cache-dir` flag; not on the wire from TS.
#[derive(Debug, Clone)]
pub struct JobContext {
    pub cache_dir: PathBuf,
}

#[derive(Debug, Clone)]
pub struct TokenRequest {
    pub job_id: String,
    pub app_id: String,
    pub depot_id: String,
    pub host: String,
    pub force: bool,
}

/// What a running job needs from its embedder.
pub trait JobHost: Send + Sync + 'static {
    /// Never blocks.
    fn emit(&self, ev: JobEvent);
    /// Blocking; async callers use `spawn_blocking`.
    fn cdn_token(&self, req: TokenRequest) -> Result<Option<String>, String>;
    /// Blocking; async callers use `spawn_blocking`.
    fn manifest_request_code(
        &self,
        app_id: &str,
        depot_id: &str,
        manifest_id: &str,
    ) -> Result<Option<String>, String>;
}

async fn run_summary(
    req: job::SummarizeRequest,
    ctx: &JobContext,
    host: Arc<dyn JobHost>,
) -> Result<job::SummarizeResult, outcome::Failure> {
    let fail = |m: String| outcome::Failure {
        file: None,
        kind: outcome::ErrorKind::Io,
        message: m,
        code: None,
        eresult: None,
        http_status: None,
        scope: None,
        ms_since_progress: None,
    };
    let limiter = inflight::InflightLimiter::new(inflight::TARGET_INFLIGHT_CHUNKS).map_err(fail)?;
    let fetcher = Arc::new(fetch::Fetcher::new(
        host,
        &format!("summary-{}", req.app_id),
        &req.app_id,
        req.hosts.clone(),
        limiter,
        Arc::new(stall::StallTracker::default()),
    ));
    let store = manifest::ManifestStore::new(ctx.cache_dir.clone(), fetcher);
    manifest::summarize(req, &store).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CancelArgs {
    job_id: String,
}

/// D-03 (plan 75-19): a no-download finalize (zero-depot install, failed resume verify).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FinalizeOpArgs {
    app_id: String,
    finalize: job::FinalizeSpec,
    depots: Vec<job::PlannedDepot>,
    /// "completed" | "cancelled" | null
    outcome: Option<String>,
}

fn run_finalize_op(a: FinalizeOpArgs) -> Value {
    let cancelled = a.outcome.as_deref() == Some("cancelled");
    if cancelled {
        let existing =
            acf::read_existing_state_flags(Path::new(&a.finalize.steamapps_dir), &a.app_id);
        if acf::preserve_installed_manifest(true, 0, 0, existing) {
            return json!({ "preserved": true, "stateFlags": existing });
        }
    }
    // A no-download finalize never proves verification, so the StateFlags 4 gate fails closed.
    let result = acf::RunResult {
        outcome: if cancelled {
            acf::RunOutcome::Cancelled
        } else {
            acf::RunOutcome::Completed
        },
        failures: Vec::new(),
        all_files_verified: false,
        all_modes_applied: false,
    };
    match runtime().block_on(acf::finalize(&a.finalize, &a.app_id, &a.depots, &result)) {
        Ok(w) => json!({
            "acf": {
                "path": w.path.to_string_lossy(),
                "stateFlags": w.state_flags,
                "sizeOnDisk": w.size_on_disk.to_string(),
            }
        }),
        Err(f) => json!({ "error": f }),
    }
}

fn parse_args<T: for<'de> Deserialize<'de>>(op: &str, args: &Value) -> Result<T, String> {
    serde_json::from_value(args.clone()).map_err(|_| format!("{op}:bad-args"))
}

fn run_op(
    op: &str,
    args: &Value,
    ctx: &JobContext,
    host: &Arc<dyn JobHost>,
) -> Result<Value, String> {
    match op {
        "depot_job_run" => {
            let job: DepotJob = parse_args(op, args)?;
            job.validate()?;
            serde_json::to_value(run_job(job, ctx, Arc::clone(host)))
                .map_err(|_| format!("{op}:encode"))
        }
        "depot_finalize" => Ok(run_finalize_op(parse_args(op, args)?)),
        "depot_job_cancel" => {
            let a: CancelArgs = parse_args(op, args)?;
            Ok(json!({ "cancelled": registry::cancel(&a.job_id) }))
        }
        "depot_manifest_summary" => {
            let req: job::SummarizeRequest = parse_args(op, args)?;
            // Same shape rules as a job: numeric ids and a 64-hex key, nothing else reaches disk.
            let probe = DepotJob {
                job_id: "summary".into(),
                mode: job::JobMode::Install,
                app_id: req.app_id.clone(),
                install_root: std::env::temp_dir().to_string_lossy().into_owned(),
                depots: req.depots.clone(),
                hosts: Vec::new(),
                select_paths: None,
                finalize: None,
                limits: None,
                retired_depots: Vec::new(),
            };
            probe.validate().map_err(|_| format!("{op}:bad-args"))?;
            let r = runtime().block_on(run_summary(req, ctx, Arc::clone(host)));
            Ok(match r {
                Ok(v) => serde_json::to_value(v).map_err(|_| format!("{op}:encode"))?,
                Err(f) => json!({ "error": f }),
            })
        }
        #[cfg(test)]
        "__panic_probe" => panic!("probe"),
        _ => Err(format!("unknown-op:{op}")),
    }
}

pub fn dispatch(
    op: &str,
    args: &Value,
    ctx: &JobContext,
    host: Arc<dyn JobHost>,
) -> Result<Value, String> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        run_op(op, args, ctx, &host)
    }))
    .unwrap_or_else(|_| Err(format!("{op}:panic")))
}

#[cfg(test)]
mod tests {
    use super::*;

    struct NullHost;
    impl JobHost for NullHost {
        fn emit(&self, _ev: JobEvent) {}
        fn cdn_token(&self, _req: TokenRequest) -> Result<Option<String>, String> {
            Ok(None)
        }
        fn manifest_request_code(
            &self,
            _a: &str,
            _d: &str,
            _m: &str,
        ) -> Result<Option<String>, String> {
            Ok(None)
        }
    }

    fn call(op: &str, args: Value) -> Result<Value, String> {
        let ctx = JobContext {
            cache_dir: PathBuf::from("/tmp"),
        };
        dispatch(op, &args, &ctx, Arc::new(NullHost))
    }

    #[test]
    fn unknown_op_is_error() {
        assert_eq!(call("nope", json!({})), Err("unknown-op:nope".to_string()));
    }

    #[test]
    fn panic_becomes_err() {
        assert_eq!(
            call("__panic_probe", json!({})),
            Err("__panic_probe:panic".to_string())
        );
    }

    #[test]
    fn cancel_op_reports_registered() {
        let g = registry::register("lib-cancel-1");
        assert_eq!(
            call("depot_job_cancel", json!({"jobId": "lib-cancel-1"})),
            Ok(json!({"cancelled": true}))
        );
        assert!(g.token.is_cancelled());
        assert_eq!(
            call("depot_job_cancel", json!({"jobId": "nope-zz"})),
            Ok(json!({"cancelled": false}))
        );
        assert_eq!(
            call("depot_job_cancel", json!({"jobId": "a", "x": 1})),
            Err("depot_job_cancel:bad-args".to_string())
        );
    }

    #[test]
    fn ops_are_sorted() {
        let mut s = OPS.to_vec();
        s.sort_unstable();
        assert_eq!(s, OPS);
    }
}
