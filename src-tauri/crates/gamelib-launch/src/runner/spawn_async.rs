//! `spawnAsync` (88.2-14, D-30, D-21): one command run as a Helper, answering the last 50 chunks of each stream.
//!
//! The port of `createSpawnAsync` in `spawnAsync.ts`. The contract the TS adapter keeps:
//!
//! - the child runs in `cwd`, with exactly `env` when one is passed (and the inherited environment otherwise);
//! - an optional `timeoutMs` (finite and above zero, else none) ends the run with SIGKILL on the child's group and
//!   answers `timedOut: true, code: null`;
//! - a cancellation, by [`launch_runner_kill`](crate::dispatch) on the stream id (or the app shutdown), answers
//!   `aborted: true, code: null` as a resolved result, never an error;
//! - stdout and stderr each answer the last 50 chunks joined with `''` (untrimmed);
//! - a program that could not be started is an `Err` the adapter rejects with.
//!
//! The text of that `Err` is the OS's (`golden/spawn_async/deltas.json`, `spawn-error-text`). Nothing is
//! logged here: the TS wrote no log line either, and a command line may hold a secret.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use gamelib_core::process::{ChunkSink, Pipe, ProcSpec};
use serde::{Deserialize, Serialize};

use super::call_runner::RUNNER_READ_CHUNK;
use super::lock;
use super::stream::{ChunkWindow, OutputSink};
use crate::ctx::LaunchCtx;
use crate::game::registry::{GameGuard, RunIds};

/// The label of the run in the spawn seam's child registry.
pub const SPAWN_ASYNC_LABEL: &str = "spawn-async";

/// The runner name a spawnAsync run is registered under in the tracked registry (a tracked kill or the
/// quit's kill-all ends it like any helper).
pub const SPAWN_ASYNC_RUNNER: &str = "spawn-async";

/// One spawnAsync call (`launch_spawn_async`'s argument). Strict: an unknown key is a bad argument.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpawnAsyncArgs {
    /// The id `launch_runner_kill` cancels this run by, and that its output frames carry. Empty: the run
    /// cannot be cancelled by id.
    #[serde(default)]
    pub stream_id: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub cwd: Option<String>,
    /// The whole environment of the child. Absent: the child inherits the process environment.
    #[serde(default)]
    pub env: Option<BTreeMap<String, String>>,
    /// Milliseconds, as `child_process` takes them: absent, `null`, zero, negative and non-finite mean none.
    #[serde(default)]
    pub timeout_ms: Option<f64>,
    #[serde(default)]
    pub windows_hide: bool,
    /// Whether the caller watches the stream (`onOutput`): the op then hands the run a sink that frames chunks.
    #[serde(default)]
    pub observe: bool,
}

/// What a spawnAsync run answers (the TS `{ code, stdout, stderr, timedOut, aborted }`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnAsyncResult {
    /// The exit code. `null` after a timeout, an abort, or a child ended by a signal.
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub timed_out: bool,
    pub aborted: bool,
}

/// The time limit a call asks for: a finite value above zero (a fraction of a millisecond is kept), else none.
/// A value too large to be a duration is no limit either.
pub fn timeout_of(timeout_ms: Option<f64>) -> Option<Duration> {
    let ms = timeout_ms.filter(|ms| ms.is_finite() && *ms > 0.0)?;
    Duration::try_from_secs_f64(ms / 1000.0).ok()
}

/// `createSpawnAsync`'s run: answers the result, or `Err(text)` when the program could not be started.
pub async fn spawn_async(
    ctx: &LaunchCtx,
    args: SpawnAsyncArgs,
    sink: Arc<dyn OutputSink>,
) -> Result<SpawnAsyncResult, String> {
    // Held for the whole run: the exit path waits for a running command (or cancels it).
    let _registrant = ctx.engine.shutdown.register("spawn-async");
    // Ended by a kill on the stream id (the entry's token) and by the app shutdown.
    let abort = ctx.engine.shutdown.token().child_token();
    let serial = ctx.runner.next_serial();
    let entry = ctx.registry.register_helper(
        RunIds {
            runner: SPAWN_ASYNC_RUNNER.to_string(),
            key: format!("{SPAWN_ASYNC_LABEL}-{serial}"),
            abort_id: format!("{SPAWN_ASYNC_LABEL}-{serial}"),
            stream_id: args.stream_id.clone(),
        },
        abort.clone(),
    );
    let _registered = GameGuard::helper(Arc::clone(&ctx.registry), entry);

    let mut spec = ProcSpec::new(SPAWN_ASYNC_LABEL, args.command.clone());
    spec.argv = args.args.clone();
    spec.replace_env = args.env.is_some();
    spec.env = args
        .env
        .iter()
        .flatten()
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();
    spec.cwd = args.cwd.as_ref().map(PathBuf::from);
    spec.timeout = timeout_of(args.timeout_ms);
    // The result is built from the chunk windows, so the runner's own capture is not kept.
    spec.max_buffer = 0;
    spec.cancel = Some(abort);
    spec.hide_window = args.windows_hide;
    spec.read_chunk = RUNNER_READ_CHUNK;

    let stdout = Arc::new(Mutex::new(ChunkWindow::new()));
    let stderr = Arc::new(Mutex::new(ChunkWindow::new()));
    let (window_out, window_err) = (Arc::clone(&stdout), Arc::clone(&stderr));
    let chunks: ChunkSink = Box::new(move |pipe, text| {
        // The observer first, then the window, as the TS did; the chunk is kept as it came, not trimmed.
        sink.chunk(pipe, text);
        let window = match pipe {
            Pipe::Stdout => &window_out,
            Pipe::Stderr => &window_err,
        };
        lock(window).push_raw(text);
    });

    let out = ctx.engine.proc.run_streamed(spec, chunks).await;

    // The spawn seam answers no code, no signal and no flag when the program could not be started.
    if out.code.is_none() && out.signal.is_none() && !out.cancelled && !out.timed_out {
        return Err(out.stderr);
    }
    let stdout = lock(&stdout).join("");
    let stderr = lock(&stderr).join("");
    Ok(SpawnAsyncResult {
        code: if out.cancelled || out.timed_out {
            None
        } else {
            out.code
        },
        stdout,
        stderr,
        timed_out: out.timed_out,
        aborted: out.cancelled,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_timeout_is_finite_and_above_zero_or_none() {
        assert_eq!(timeout_of(None), None);
        assert_eq!(timeout_of(Some(0.0)), None);
        assert_eq!(timeout_of(Some(-5.0)), None);
        assert_eq!(timeout_of(Some(f64::NAN)), None);
        assert_eq!(timeout_of(Some(f64::INFINITY)), None);
        assert_eq!(timeout_of(Some(1e300)), None);
        assert_eq!(timeout_of(Some(500.0)), Some(Duration::from_millis(500)));
        assert_eq!(timeout_of(Some(0.5)), Some(Duration::from_micros(500)));
    }

    #[test]
    fn the_arguments_are_strict_and_camel_case() {
        let ok: SpawnAsyncArgs = serde_json::from_value(serde_json::json!({
            "streamId": "s", "command": "tar", "args": ["-x"], "timeoutMs": 5, "windowsHide": true, "observe": true
        }))
        .unwrap();
        assert!(ok.windows_hide && ok.observe && ok.cwd.is_none() && ok.env.is_none());
        assert!(serde_json::from_value::<SpawnAsyncArgs>(serde_json::json!({
            "command": "x", "shell": true
        }))
        .is_err());
        // `timeoutMs: null` (what JSON makes of NaN and Infinity) is no limit.
        let null: SpawnAsyncArgs = serde_json::from_value(serde_json::json!({
            "command": "x", "timeoutMs": null
        }))
        .unwrap();
        assert_eq!(timeout_of(null.timeout_ms), None);
    }

    #[test]
    fn the_result_answers_a_null_code_and_camel_case_flags() {
        let value = serde_json::to_value(SpawnAsyncResult {
            code: None,
            stdout: String::new(),
            stderr: String::new(),
            timed_out: true,
            aborted: false,
        })
        .unwrap();
        assert_eq!(
            value,
            serde_json::json!({ "code": null, "stdout": "", "stderr": "", "timedOut": true, "aborted": false })
        );
    }
}
