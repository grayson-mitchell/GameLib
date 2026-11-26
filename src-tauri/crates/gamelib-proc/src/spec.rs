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
use gamelib_core::process::{
    BoxFuture, ChunkSink, LineSink, Pipe, ProcSpec, SpecOutput, SpecRunner,
};
use std::pin::pin;
use std::process::Stdio;
use std::sync::Mutex;
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio_util::sync::CancellationToken;

/// The Windows `CREATE_NO_WINDOW` process creation flag: the child gets no console window.
#[cfg_attr(not(windows), allow(dead_code))]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// The Windows creation flags of a spec's child: `base` (what the runner already sets, none today)
/// plus `CREATE_NO_WINDOW` when the spec asks to hide its window (Pitfall 12, the TS `windowsHide`).
/// Pure, so every OS tests the arithmetic; only the Windows spawn arm applies it.
#[cfg_attr(not(windows), allow(dead_code))]
fn creation_flags(base: u32, hide_window: bool) -> u32 {
    if hide_window {
        base | CREATE_NO_WINDOW
    } else {
        base
    }
}

/// How long the readers get, after the child has exited, to drain what is still in the pipes. A
/// descendant that inherited the pipe (a wineserver, a daemonised helper) keeps it open long after
/// the child is gone, and the run must not wait for it.
const POST_EXIT_DRAIN: Duration = Duration::from_secs(2);
/// How long a killed child gets to be reaped before the run returns anyway.
const REAP_LIMIT: Duration = Duration::from_secs(2);
/// A stdout line longer than this is handed to `on_line` in pieces, so a child that never writes a
/// newline cannot grow the line buffer without bound.
const MAX_LINE: usize = 64 * 1024;

/// Stateless: every `run` builds its own command and registers its own child.
#[derive(Debug, Default, Clone, Copy)]
pub struct SpecProcRunner;

impl SpecRunner for SpecProcRunner {
    fn run(&self, spec: ProcSpec, on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
        Box::pin(run_spec(
            spec,
            on_line.map_or(Feed::None, Feed::Lines),
            gamelib_core::shutdown::global().token(),
        ))
    }

    fn run_streamed(&self, spec: ProcSpec, on_chunk: ChunkSink) -> BoxFuture<SpecOutput> {
        Box::pin(run_spec(
            spec,
            Feed::Chunks(on_chunk),
            gamelib_core::shutdown::global().token(),
        ))
    }
}

/// What a run hands its output to.
enum Feed {
    None,
    /// Stdout, split into lines.
    Lines(LineSink),
    /// Both pipes, as raw text.
    Chunks(ChunkSink),
}

/// What one pipe's reader hands its bytes to.
enum Tap<'a> {
    None,
    Lines(&'a mut (dyn FnMut(&str) + Send)),
    Chunks(&'a Mutex<ChunkSink>, Pipe),
}

/// Decodes a byte stream to text a chunk at a time: a multi-byte character cut by a read boundary
/// is held back and completed by the next read, never turned into a replacement character.
#[derive(Default)]
struct Utf8Carry {
    held: Vec<u8>,
}

impl Utf8Carry {
    /// The text of `held + bytes` up to the last complete character; the cut tail stays held. Bytes
    /// that can never be valid are replaced (as `from_utf8_lossy` does), only a possibly-incomplete
    /// ending is kept back.
    fn push(&mut self, bytes: &[u8]) -> String {
        self.held.extend_from_slice(bytes);
        let keep = match std::str::from_utf8(&self.held) {
            Ok(_) => 0,
            Err(e) if e.error_len().is_none() => self.held.len() - e.valid_up_to(),
            Err(_) => 0,
        };
        let cut = self.held.len() - keep;
        let text = String::from_utf8_lossy(&self.held[..cut]).into_owned();
        self.held.drain(..cut);
        text
    }

    /// What is still held when the stream ends (an incomplete character becomes a replacement).
    fn finish(&mut self) -> String {
        let text = String::from_utf8_lossy(&self.held).into_owned();
        self.held.clear();
        text
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

/// Reads `reader` to EOF into `cap` (bounded), and hands what it reads to `tap`: as lines for
/// [`Tap::Lines`], as raw text for [`Tap::Chunks`]. Past the cap the bytes are still read, so the
/// child never blocks on a full pipe, but they are dropped from the capture (the tap still sees them).
async fn pump<R: AsyncRead + Unpin>(
    mut reader: R,
    cap: &mut Capture,
    max: usize,
    read_chunk: usize,
    mut tap: Tap<'_>,
) {
    let mut chunk = vec![0u8; read_chunk.max(1)];
    let mut pending: Vec<u8> = Vec::new();
    let mut carry = Utf8Carry::default();
    loop {
        let n = match reader.read(&mut chunk).await {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        cap.push(&chunk[..n], max);
        match &mut tap {
            Tap::None => {}
            Tap::Lines(cb) => {
                let mut rest = &chunk[..n];
                while let Some(i) = rest.iter().position(|b| *b == b'\n') {
                    pending.extend_from_slice(&rest[..i]);
                    emit(&mut pending, &mut **cb);
                    rest = &rest[i + 1..];
                }
                pending.extend_from_slice(rest);
                if pending.len() > MAX_LINE {
                    emit(&mut pending, &mut **cb);
                }
            }
            Tap::Chunks(sink, pipe) => {
                let text = carry.push(&chunk[..n]);
                if !text.is_empty() {
                    let mut sink = sink.lock().unwrap_or_else(|e| e.into_inner());
                    (*sink)(*pipe, &text);
                }
            }
        }
    }
    match tap {
        Tap::None => {}
        Tap::Lines(cb) => {
            if !pending.is_empty() {
                emit(&mut pending, cb);
            }
        }
        Tap::Chunks(sink, pipe) => {
            let text = carry.finish();
            if !text.is_empty() {
                let mut sink = sink.lock().unwrap_or_else(|e| e.into_inner());
                (*sink)(pipe, &text);
            }
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
    read_chunk: usize,
    out_cap: &mut Capture,
    err_cap: &mut Capture,
    out_tap: Tap<'_>,
    err_tap: Tap<'_>,
) -> (Option<i32>, Option<i32>) {
    let stdin = child.stdin.take();
    let (Some(stdout), Some(stderr)) = (child.stdout.take(), child.stderr.take()) else {
        return child
            .wait()
            .await
            .ok()
            .map_or((None, None), |s| (s.code(), signal_of(&s)));
    };
    let mut in_f = pin!(feed(stdin, input));
    let mut out_f = pin!(pump(stdout, out_cap, max, read_chunk, out_tap));
    let mut err_f = pin!(pump(stderr, err_cap, max, read_chunk, err_tap));
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
    status
        .ok()
        .map_or((None, None), |s| (s.code(), signal_of(&s)))
}

/// The signal number that ended a child, when one did (unix; always `None` on Windows).
#[cfg(unix)]
fn signal_of(status: &std::process::ExitStatus) -> Option<i32> {
    std::os::unix::process::ExitStatusExt::signal(status)
}

#[cfg(not(unix))]
fn signal_of(_status: &std::process::ExitStatus) -> Option<i32> {
    None
}

async fn never() {
    std::future::pending::<()>().await
}

enum End {
    Exited(Option<i32>, Option<i32>),
    TimedOut,
    Cancelled,
}

/// The whole run, with the app-wide shutdown token passed in so it can be tested with a local one.
async fn run_spec(spec: ProcSpec, feed: Feed, shutdown: CancellationToken) -> SpecOutput {
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
    // A spec that does not ask for a hidden window keeps exactly the flags it had (none).
    #[cfg(windows)]
    if spec.hide_window {
        cmd.creation_flags(creation_flags(0, true));
    }
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
        let mut lines_sink: LineSink;
        let chunk_sink: Mutex<ChunkSink>;
        let (out_tap, err_tap) = match feed {
            Feed::None => (Tap::None, Tap::None),
            Feed::Lines(cb) => {
                lines_sink = cb;
                (Tap::Lines(&mut *lines_sink), Tap::None)
            }
            Feed::Chunks(sink) => {
                chunk_sink = Mutex::new(sink);
                (
                    Tap::Chunks(&chunk_sink, Pipe::Stdout),
                    Tap::Chunks(&chunk_sink, Pipe::Stderr),
                )
            }
        };
        let driven = drive(
            &mut child,
            spec.stdin.clone(),
            spec.max_buffer,
            spec.read_chunk,
            &mut out_cap,
            &mut err_cap,
            out_tap,
            err_tap,
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
            (code, signal) = driven => End::Exited(code, signal),
            _ = timeout => End::TimedOut,
            _ = cancel => End::Cancelled,
            _ = shutdown.cancelled() => End::Cancelled,
        }
    };

    if !matches!(end, End::Exited(..)) {
        stop(&mut child).await;
    }
    let (code, signal, timed_out, cancelled) = match end {
        End::Exited(code, signal) => (code, signal, false, false),
        End::TimedOut => (None, None, true, false),
        End::Cancelled => (None, None, false, true),
    };
    SpecOutput {
        code,
        stdout: out_cap.text(),
        stderr: err_cap.text(),
        timed_out,
        cancelled,
        truncated: out_cap.truncated || err_cap.truncated,
        signal,
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

#[cfg(test)]
mod creation_flag_tests {
    use super::*;

    #[test]
    fn hiding_the_window_adds_create_no_window_to_the_base_flags() {
        assert_eq!(creation_flags(0, true), 0x0800_0000);
        assert_eq!(creation_flags(0x0000_0200, true), 0x0800_0200);
    }

    #[test]
    fn not_hiding_the_window_leaves_the_base_flags_exactly() {
        assert_eq!(creation_flags(0, false), 0);
        assert_eq!(creation_flags(0x0000_0200, false), 0x0000_0200);
    }

    #[test]
    fn hiding_twice_is_idempotent() {
        assert_eq!(
            creation_flags(CREATE_NO_WINDOW, true),
            creation_flags(0, true)
        );
    }
}

#[cfg(all(test, windows))]
mod windows_tests {
    use super::*;

    #[tokio::test]
    async fn a_hidden_window_spec_runs_through_the_runner_and_exits_zero() {
        let mut spec = ProcSpec::new("spec-test-hidden", "cmd.exe");
        spec.argv = vec!["/c".into(), "exit".into(), "0".into()];
        spec.hide_window = true;
        let out = run_spec(spec, Feed::None, CancellationToken::new()).await;
        assert_eq!(out.code, Some(0), "{out:?}");
        assert!(!out.cancelled && !out.timed_out);
    }
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
        let out = run_spec(sleeper("spec-test-late"), Feed::None, token).await;
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
        let out = run_spec(sleeper("spec-test-shutdown"), Feed::None, token).await;
        assert!(out.cancelled, "{out:?}");
        assert!(!out.timed_out);
        assert_eq!(out.code, None);
        assert!(
            !global().labels().contains(&"spec-test-shutdown"),
            "a stopped run must leave nothing registered"
        );
    }
}
