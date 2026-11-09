//! Tauri-free Steam depot pipeline. `dispatch` is the single entry point shared by the in-process
//! shell arm and `gamelib-depot-cli`.
//!
//! Contract (same as `gamelib-scan`): results, not errors. `Err` means bad args, an unknown op or
//! a panic only; a failed download is an `Outcome` with `status: error`. No bytes cross the pipe.
//! Never log keys or tokens (`DepotRef` has a redacting `Debug`).

pub mod acf;
pub mod container;
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
use std::path::PathBuf;
use std::sync::Arc;

pub use job::JobEvent;

/// Ops reachable from the shell. Keep sorted (the parity test reads this literal form).
/// `depot_job_run` and `depot_manifest_summary` are added by later plans.
pub const OPS: &[&str] = &["depot_job_cancel"];

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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CancelArgs {
    job_id: String,
}

fn parse_args<T: for<'de> Deserialize<'de>>(op: &str, args: &Value) -> Result<T, String> {
    serde_json::from_value(args.clone()).map_err(|_| format!("{op}:bad-args"))
}

fn run_op(
    op: &str,
    args: &Value,
    _ctx: &JobContext,
    _host: &Arc<dyn JobHost>,
) -> Result<Value, String> {
    match op {
        "depot_job_cancel" => {
            let a: CancelArgs = parse_args(op, args)?;
            Ok(json!({ "cancelled": registry::cancel(&a.job_id) }))
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
