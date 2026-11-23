//! `SpecProcRunner`: core's `SpecRunner` over `SpawnClass::Helper` tokio children (D-17). One
//! seam for every engine and wine spawn: environment, working directory, stdin text, a capture
//! cap, a timeout, a cancel token and per-line stdout streaming, all behind
//! `spawn_helper_tokio`, so the child is in its own process group (unix) or kill-on-close Job
//! (Windows), registered in the `ChildSet`, and reached by the exit path and the reaper.
//!
//! A run ends when the child exits, when `spec.timeout` passes, when `spec.cancel` fires or when
//! the app-wide shutdown token fires. In the last three the leader is killed (`kill_on_drop`, and
//! `kill_process_group` for the descendants on unix) and the output so far is returned with the
//! flag set.

use crate::spawn::spawn_helper_tokio;
use gamelib_core::process::{BoxFuture, LineSink, ProcSpec, SpecOutput, SpecRunner};
use std::pin::pin;
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio_util::sync::CancellationToken;

/// How long the readers get, after the child has exited, to drain what is still in the pipes. A
/// descendant that inherited the pipe (a wineserver, a daemonised helper) keeps it open long after
/// the child is gone, and the run must not wait for it.
const POST_EXIT_DRAIN: Duration = Duration::from_secs(2);
/// How long a killed child gets to be reaped before the run returns anyway.
const REAP_LIMIT: Duration = Duration::from_secs(2);
/// A stdout line longer than this is handed to `on_line` in pieces, so a child that never writes a
/// newline cannot grow the line buffer without bound.
const MAX_LINE: usize = 64 * 1024;
const CHUNK: usize = 8 * 1024;

/// Stateless: every `run` builds its own command and registers its own child.
#[derive(Debug, Default, Clone, Copy)]
pub struct SpecProcRunner;

impl SpecRunner for SpecProcRunner {
    fn run(&self, spec: ProcSpec, on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
        Box::pin(run_spec(
            spec,
            on_line,
            gamelib_core::shutdown::global().token(),
        ))
    }
}

/// One stream's capture: at most `max` bytes held, the rest counted out as truncation.
#[derive(Default)]
struct Capture {
    buf: Vec<u8>,
    truncated: bool,
}

impl Capture {
    fn push(&mut self, chunk: &[u8], max: usize) {
        let take = max.saturating_sub(self.buf.len()).min(chunk.len());
        self.buf.extend_from_slice(&chunk[..take]);
        if take < chunk.len() {
            self.truncated = true;
        }
    }

    fn text(&self) -> String {
        String::from_utf8_lossy(&self.buf).into_owned()
    }
}

/// Hands the pending bytes to `on_line` as one line (a trailing `\r` dropped) and clears them.
fn emit(pending: &mut Vec<u8>, on_line: &mut (dyn FnMut(&str) + Send)) {
    if pending.last() == Some(&b'\r') {
        pending.pop();
    }
    on_line(&String::from_utf8_lossy(pending));
    pending.clear();
}

/// Reads `reader` to EOF into `cap` (bounded), and, when `on_line` is given, splits it into lines.
/// Past the cap the bytes are still read, so the child never blocks on a full pipe, but they are
/// dropped.
async fn pump<R: AsyncRead + Unpin>(
    mut reader: R,
    cap: &mut Capture,
    max: usize,
    mut on_line: Option<&mut (dyn FnMut(&str) + Send)>,
) {
    let mut chunk = vec![0u8; CHUNK];
    let mut pending: Vec<u8> = Vec::new();
    loop {
        let n = match reader.read(&mut chunk).await {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        cap.push(&chunk[..n], max);
        if let Some(cb) = on_line.as_deref_mut() {
            let mut rest = &chunk[..n];
            while let Some(i) = rest.iter().position(|b| *b == b'\n') {
                pending.extend_from_slice(&rest[..i]);
                emit(&mut pending, cb);
                rest = &rest[i + 1..];
            }
            pending.extend_from_slice(rest);
            if pending.len() > MAX_LINE {
                emit(&mut pending, cb);
            }
        }
    }
    if let Some(cb) = on_line {
        if !pending.is_empty() {
            emit(&mut pending, cb);
        }
    }
}

/// Writes the spec's stdin text and closes the pipe. A child that exits without reading it is not
/// an error here (its exit status says what happened).
async fn feed(stdin: Option<tokio::process::ChildStdin>, text: Option<String>) {
    if let (Some(mut pipe), Some(text)) = (stdin, text) {
        let _ = pipe.write_all(text.as_bytes()).await;
        let _ = pipe.shutdown().await;
    }
}

/// Waits for the child and drains its pipes, writing into the caller's captures so that what was
/// read survives this future being dropped by a timeout or a cancel.
#[allow(clippy::too_many_arguments)]
async fn drive(
    child: &mut tokio::process::Child,
    input: Option<String>,
    max: usize,
    out_cap: &mut Capture,
    err_cap: &mut Capture,
    on_line: Option<&mut (dyn FnMut(&str) + Send)>,
) -> Option<i32> {
    let stdin = child.stdin.take();
    let (Some(stdout), Some(stderr)) = (child.stdout.take(), child.stderr.take()) else {
        return child.wait().await.ok().and_then(|s| s.code());
    };
    let mut in_f = pin!(feed(stdin, input));
    let mut out_f = pin!(pump(stdout, out_cap, max, on_line));
    let mut err_f = pin!(pump(stderr, err_cap, max, None));
    let (mut in_done, mut out_done, mut err_done) = (false, false, false);
    let status = loop {
        tokio::select! {
            s = child.wait() => break s,
            _ = &mut in_f, if !in_done => in_done = true,
            _ = &mut out_f, if !out_done => out_done = true,
            _ = &mut err_f, if !err_done => err_done = true,
        }
    };
    // The child is gone; take what is already in the pipes, but not forever.
    let _ = tokio::time::timeout(POST_EXIT_DRAIN, async {
        if !out_done {
            out_f.await;
        }
        if !err_done {
            err_f.await;
        }
    })
    .await;
    status.ok().and_then(|s| s.code())
}

async fn never() {
    std::future::pending::<()>().await
}

enum End {
    Exited(Option<i32>),
    TimedOut,
    Cancelled,
}

/// The whole run, with the app-wide shutdown token passed in so it can be tested with a local one.
pub(crate) async fn run_spec(
    spec: ProcSpec,
    mut on_line: Option<LineSink>,
    shutdown: CancellationToken,
) -> SpecOutput {
    // A run asked for after the exit began is not started: nothing would reap it in time.
    if shutdown.is_cancelled() || spec.cancel.as_ref().is_some_and(|c| c.is_cancelled()) {
        return SpecOutput {
            cancelled: true,
            ..SpecOutput::default()
        };
    }
    // Held for exactly as long as the child is in flight, so exit waits for (and cancels) it.
    let _registrant = gamelib_core::shutdown::global().register(spec.label);

    let mut cmd = tokio::process::Command::new(&spec.program);
    cmd.args(&spec.argv);
    if spec.replace_env {
        cmd.env_clear();
    }
    cmd.envs(spec.env.iter().map(|(k, v)| (k, v)));
    if let Some(dir) = &spec.cwd {
        cmd.current_dir(dir);
    }
    cmd.stdin(if spec.stdin.is_some() {
        Stdio::piped()
    } else {
        Stdio::null()
    })
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
    // The guard lives in this future, so the pid is unregistered when the child is gone.
    let (mut child, _guard) = match spawn_helper_tokio(&mut cmd, spec.label) {
        Ok(spawned) => spawned,
        Err(e) => {
            return SpecOutput {
                stderr: format!("spawn {}: {e}", spec.program),
                ..SpecOutput::default()
            }
        }
    };

    let (mut out_cap, mut err_cap) = (Capture::default(), Capture::default());
    let end = {
        let cb: Option<&mut (dyn FnMut(&str) + Send)> = match on_line.as_mut() {
            Some(b) => Some(&mut **b),
            None => None,
        };
        let driven = drive(
            &mut child,
            spec.stdin.clone(),
            spec.max_buffer,
            &mut out_cap,
            &mut err_cap,
            cb,
        );
        let timeout = async {
            match spec.timeout {
                Some(d) => tokio::time::sleep(d).await,
                None => never().await,
            }
        };
        let cancel = async {
            match &spec.cancel {
                Some(c) => c.cancelled().await,
                None => never().await,
            }
        };
        tokio::select! {
            code = driven => End::Exited(code),
            _ = timeout => End::TimedOut,
            _ = cancel => End::Cancelled,
            _ = shutdown.cancelled() => End::Cancelled,
        }
    };

    if !matches!(end, End::Exited(_)) {
        stop(&mut child).await;
    }
    let (code, timed_out, cancelled) = match end {
        End::Exited(code) => (code, false, false),
        End::TimedOut => (None, true, false),
        End::Cancelled => (None, false, true),
    };
    SpecOutput {
        code,
        stdout: out_cap.text(),
        stderr: err_cap.text(),
        timed_out,
        cancelled,
        truncated: out_cap.truncated || err_cap.truncated,
    }
}

/// Ends a child that is still running, and what it started. On unix the whole process group goes
/// (`kill_process_group`, refusing pgid <= 1), but only while the leader is unreaped, because only
/// then is its pid (the group id) certain not to have been recycled. On Windows the Job the child
/// was assigned to is closed when the registration guard drops, which kills every member. Either
/// way the leader is also killed through tokio, the same mechanism as `kill_on_drop`.
async fn stop(child: &mut tokio::process::Child) {
    #[cfg(unix)]
    if matches!(child.try_wait(), Ok(None)) {
        if let Some(pid) = child.id().and_then(|p| i32::try_from(p).ok()) {
            let _ = crate::kill_tree::kill_process_group(pid);
        }
    }
    let _ = child.start_kill();
    let _ = tokio::time::timeout(REAP_LIMIT, child.wait()).await;
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::children::global;
    use gamelib_core::shutdown::Shutdown;

    fn sleeper(label: &'static str) -> ProcSpec {
        let mut spec = ProcSpec::new(label, "/bin/sleep");
        spec.argv = vec!["30".into()];
        spec
    }

    #[tokio::test]
    async fn a_run_asked_for_after_shutdown_began_is_not_started() {
        let token = Shutdown::new().token();
        token.cancel();
        let out = run_spec(sleeper("spec-test-late"), None, token).await;
        assert!(out.cancelled);
        assert_eq!(out.code, None);
        assert!(!global().labels().contains(&"spec-test-late"));
    }

    #[tokio::test]
    async fn the_shutdown_token_ends_a_running_child() {
        let token = Shutdown::new().token();
        let stopper = token.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(200)).await;
            stopper.cancel();
        });
        let out = run_spec(sleeper("spec-test-shutdown"), None, token).await;
        assert!(out.cancelled, "{out:?}");
        assert!(!out.timed_out);
        assert_eq!(out.code, None);
        assert!(
            !global().labels().contains(&"spec-test-shutdown"),
            "a stopped run must leave nothing registered"
        );
    }
}
