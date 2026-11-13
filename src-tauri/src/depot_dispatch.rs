//! Handlers for the three `depot_*` rustInvoke channels (Phase 73 D-03/D-06/D-08). Each validates
//! through its generated Args struct, then passes to the Tauri-free `gamelib-depot` crate with a
//! `ShellJobHost` that streams progress to Node as `send` frames and asks Node for CDN tokens and
//! manifest request codes over `SidecarState::invoke`.
//!
//! Nothing here formats a job, event, token or argument into a log line (T-28-04 / T-73-46).

use super::*;
use gamelib_depot::{JobContext, JobEvent, JobHost, TokenRequest};
use std::sync::mpsc::{sync_channel, SyncSender, TrySendError};

/// Bound on the per-job event queue. A full queue drops progress, never blocks the job.
const EVENT_QUEUE_BOUND: usize = 64;
/// Longest the app waits for depot jobs to finalize at exit (D-08).
pub(crate) const EXIT_FINALIZE_WAIT: Duration = Duration::from_secs(5);

/// Rejects an install root that is not absolute, has a `.` or `..` segment, or has no `steamapps`
/// component above its leaf (T-73-45). Segments are split on both separators by hand because
/// `Path::components` silently drops interior `.` segments.
pub(crate) fn guard_install_root(root: &str) -> Result<(), String> {
    let bad = || "depot_job_run:bad-install-root".to_string();
    if !std::path::Path::new(root).is_absolute() {
        return Err(bad());
    }
    let segs: Vec<&str> = root.split(['/', '\\']).filter(|s| !s.is_empty()).collect();
    if segs.iter().any(|s| *s == "." || *s == "..") {
        return Err(bad());
    }
    let Some((_leaf, ancestors)) = segs.split_last() else {
        return Err(bad());
    };
    if ancestors
        .iter()
        .any(|s| s.eq_ignore_ascii_case("steamapps"))
    {
        Ok(())
    } else {
        Err(bad())
    }
}

/// Resolves (and creates, 0700) the manifest cache dir. The shell owns this path; a job never
/// supplies it.
fn manifest_cache_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "depot:no-data-dir".to_string())?
        .join("depot-manifests");
    let mut builder = std::fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder
        .create(&dir)
        .map_err(|_| "depot:cache-dir".to_string())?;
    Ok(dir)
}

fn state_for(app: &AppHandle) -> Result<Arc<SidecarState>, String> {
    app.try_state::<Arc<SidecarState>>()
        .map(|s| s.inner().clone())
        .ok_or_else(|| "depot:no-sidecar".to_string())
}

/// The `JobHost` the shell hands the depot crate. One per dispatch call.
pub(crate) struct ShellJobHost {
    state: Arc<SidecarState>,
    job_id: String,
    tx: Mutex<Option<SyncSender<JobEvent>>>,
    writer: Mutex<Option<thread::JoinHandle<()>>>,
}

fn is_droppable(ev: &JobEvent) -> bool {
    matches!(
        ev.body,
        gamelib_depot::job::JobEventBody::Progress { .. }
            | gamelib_depot::job::JobEventBody::HostSummary { .. }
    )
}

impl ShellJobHost {
    pub(crate) fn new(state: Arc<SidecarState>, job_id: String) -> Arc<Self> {
        let (tx, rx) = sync_channel::<JobEvent>(EVENT_QUEUE_BOUND);
        let writer_state = state.clone();
        let writer = thread::Builder::new()
            .name("depot-events".into())
            .spawn(move || {
                // Ends when every sender is dropped (finish() or the host going away).
                for ev in rx {
                    let Ok(value) = serde_json::to_value(&ev) else {
                        continue;
                    };
                    let req = SidecarRpcRequest {
                        id: writer_state.next_id(),
                        kind: "send",
                        channel: "depotJobEvent".into(),
                        args: vec![value],
                    };
                    // A dead pipe just means the sidecar is gone; EOF handling cancels the job.
                    let _ = writer_state.write_frame(&req);
                }
            })
            .ok();
        Arc::new(Self {
            state,
            job_id,
            tx: Mutex::new(Some(tx)),
            writer: Mutex::new(writer),
        })
    }

    /// Drops the sender and waits for queued events to reach the pipe, so the response frame that
    /// follows cannot overtake them.
    pub(crate) fn finish(&self) {
        if let Ok(mut tx) = self.tx.lock() {
            tx.take();
        }
        let handle = self.writer.lock().ok().and_then(|mut w| w.take());
        if let Some(h) = handle {
            let _ = h.join();
        }
    }
}

impl JobHost for ShellJobHost {
    fn emit(&self, ev: JobEvent) {
        let tx = match self.tx.lock() {
            Ok(g) => g.clone(),
            Err(_) => return,
        };
        let Some(tx) = tx else { return };
        let droppable = is_droppable(&ev);
        match tx.try_send(ev) {
            Ok(()) | Err(TrySendError::Disconnected(_)) => {}
            Err(TrySendError::Full(ev)) => {
                if !droppable {
                    // planned / warning matter more than one progress tick: one short retry.
                    thread::sleep(Duration::from_millis(2));
                    let _ = tx.try_send(ev);
                }
            }
        }
    }

    fn cdn_token(&self, req: TokenRequest) -> Result<Option<String>, String> {
        let reply = self.state.invoke(
            "depotCdnToken".to_string(),
            vec![serde_json::json!({
                "jobId": req.job_id,
                "appId": req.app_id,
                "depotId": req.depot_id,
                "host": req.host,
                "force": req.force,
            })],
        )?;
        reply_to_option(reply)
    }

    fn manifest_request_code(
        &self,
        app_id: &str,
        depot_id: &str,
        manifest_id: &str,
    ) -> Result<Option<String>, String> {
        let reply = self.state.invoke(
            "depotManifestRequestCode".to_string(),
            vec![serde_json::json!({
                "jobId": self.job_id,
                "appId": app_id,
                "depotId": depot_id,
                "manifestId": manifest_id,
            })],
        )?;
        reply_to_code(reply)
    }
}

/// A request-code reply: like [`reply_to_option`], plus `{eresult: 40}` (Steam refused the
/// manifest, Blocked), which the crate turns into a skipped depot, and `{unavailable: reason}`
/// (Node could not ask Steam), which becomes a transient `transient:<reason>` error.
fn reply_to_code(v: Value) -> Result<Option<String>, String> {
    if v.get("eresult").and_then(Value::as_i64) == Some(40) {
        return Err(gamelib_depot::fetch::BLOCKED_REPLY.to_string());
    }
    if let Some(reason) = v.get("unavailable").and_then(Value::as_str) {
        let clipped: String = reason.chars().filter(char::is_ascii).take(32).collect();
        return Err(format!(
            "{}{clipped}",
            gamelib_depot::fetch::TRANSIENT_REPLY_PREFIX
        ));
    }
    reply_to_option(v)
}

/// JSON null is "none"; a string (including `""`, meaning no token needed) passes through.
fn reply_to_option(v: Value) -> Result<Option<String>, String> {
    match v {
        Value::Null => Ok(None),
        Value::String(s) => Ok(Some(s)),
        _ => Err("depot:bad-reply".to_string()),
    }
}

pub(crate) fn rpc_depot_job_cancel(args: &[Value]) -> Result<Value, String> {
    let a = DepotJobCancelArgs::from_args(args)?;
    // Cancel needs no host or cache dir; the crate only reads the registry.
    let ctx = JobContext {
        cache_dir: std::env::temp_dir(),
    };
    let host: Arc<dyn JobHost> = Arc::new(NoEventsHost);
    gamelib_depot::dispatch(
        "depot_job_cancel",
        &serde_json::json!({ "jobId": a.job_id }),
        &ctx,
        host,
    )
}

pub(crate) fn rpc_depot_job_run(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    let a = DepotJobRunArgs::from_args(args)?;
    let job_id = a
        .request
        .get("jobId")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    if let Some(root) = a.request.get("installRoot").and_then(Value::as_str) {
        guard_install_root(root)?;
    } else {
        return Err("depot_job_run:bad-args".to_string());
    }
    let ctx = JobContext {
        cache_dir: manifest_cache_dir(app)?,
    };
    let host = ShellJobHost::new(state_for(app)?, job_id);
    let dyn_host: Arc<dyn JobHost> = host.clone();
    let result = gamelib_depot::dispatch("depot_job_run", &a.request, &ctx, dyn_host);
    host.finish();
    result
}

pub(crate) fn rpc_depot_manifest_summary(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    let a = DepotManifestSummaryArgs::from_args(args)?;
    let app_id = a
        .request
        .get("appId")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let ctx = JobContext {
        cache_dir: manifest_cache_dir(app)?,
    };
    // Same id the crate's summary fetcher uses for its token requests.
    let host = ShellJobHost::new(state_for(app)?, format!("summary-{app_id}"));
    let dyn_host: Arc<dyn JobHost> = host.clone();
    let result = gamelib_depot::dispatch("depot_manifest_summary", &a.request, &ctx, dyn_host);
    host.finish();
    result
}

pub(crate) fn rpc_depot_finalize(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    let a = DepotFinalizeArgs::from_args(args)?;
    let app_id = a
        .request
        .get("appId")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let ctx = JobContext {
        cache_dir: manifest_cache_dir(app)?,
    };
    let host = ShellJobHost::new(state_for(app)?, format!("finalize-{app_id}"));
    let dyn_host: Arc<dyn JobHost> = host.clone();
    let result = gamelib_depot::dispatch("depot_finalize", &a.request, &ctx, dyn_host);
    host.finish();
    result
}

/// Sidecar stdout ended: no response can arrive and no event consumer exists, so every depot job
/// is cancelled (D-08). Logs the count only.
pub(crate) fn on_sidecar_eof_cancel_jobs() {
    let n = gamelib_depot::registry::cancel_all();
    shell_diag(&format!("depot jobs cancelled on sidecar EOF: {n}"));
}

/// Placeholder host for the cancel op, which never emits or asks for anything.
struct NoEventsHost;
impl JobHost for NoEventsHost {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_code_reply_maps_unavailable_to_a_transient_error() {
        assert_eq!(
            reply_to_code(serde_json::json!({ "unavailable": "not_signed_in" })),
            Err("transient:not_signed_in".to_string())
        );
        let long = "x".repeat(100);
        let Err(e) = reply_to_code(serde_json::json!({ "unavailable": long })) else {
            panic!("expected Err")
        };
        assert_eq!(e.len(), "transient:".len() + 32);
    }

    #[test]
    fn request_code_reply_maps_blocked_to_the_skip_marker() {
        assert_eq!(
            reply_to_code(serde_json::json!({ "eresult": 40 })),
            Err(gamelib_depot::fetch::BLOCKED_REPLY.to_string())
        );
        assert_eq!(reply_to_code(Value::Null), Ok(None));
        assert_eq!(
            reply_to_code(serde_json::json!("123")),
            Ok(Some("123".to_string()))
        );
        // Any other EResult is not a skip.
        assert_eq!(
            reply_to_code(serde_json::json!({ "eresult": 15 })),
            Err("depot:bad-reply".to_string())
        );
    }

    #[test]
    fn install_root_guard_rejects_relative_dotdot_and_non_steamapps() {
        for bad in [
            "",
            "relative/steamapps/common/Game",
            "steamapps/common/Game",
            "/lib/steamapps/common/../../../etc",
            "/lib/./steamapps/common/Game",
            "/lib/common/Game",
            "/lib/steamapps",
            "/steamapps",
            "/",
        ] {
            assert_eq!(
                guard_install_root(bad),
                Err("depot_job_run:bad-install-root".to_string()),
                "should reject {bad:?}"
            );
        }
    }

    #[test]
    fn install_root_guard_accepts_library_bridge_and_redist_roots() {
        for ok in [
            "/Users/me/Library/Application Support/Steam/steamapps/common/Game",
            "/Volumes/Games/SteamLibrary/SteamApps/common/Game",
            "/Users/me/bottle/drive_c/Program Files (x86)/Steam/steamapps/common/Game",
            "/Users/me/Library/Application Support/gamelib/sharedRedist/steamapps/common/Redist",
        ] {
            // A rootless `/x` is not absolute on Windows; drive-qualify it there.
            let ok = if cfg!(windows) {
                format!("C:{ok}")
            } else {
                ok.to_string()
            };
            assert_eq!(guard_install_root(&ok), Ok(()), "should accept {ok:?}");
        }
        #[cfg(windows)]
        assert_eq!(
            guard_install_root(r"D:\SteamLibrary\steamapps\common\Game"),
            Ok(())
        );
    }

    #[test]
    fn reply_mapping() {
        assert_eq!(reply_to_option(Value::Null), Ok(None));
        assert_eq!(
            reply_to_option(Value::String(String::new())),
            Ok(Some(String::new()))
        );
        assert!(reply_to_option(serde_json::json!(1)).is_err());
    }

    #[test]
    fn depot_eof_cancels_all_jobs() {
        let a = gamelib_depot::registry::register("eof-test-a");
        let b = gamelib_depot::registry::register("eof-test-b");
        on_sidecar_eof_cancel_jobs();
        assert!(a.token.is_cancelled());
        assert!(b.token.is_cancelled());
    }
}
