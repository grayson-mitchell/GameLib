//! Child-process seam: the trait the machines run against, the real implementations live elsewhere.

use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::time::Duration;

use tokio_util::sync::CancellationToken;

pub type BoxFuture<T> = Pin<Box<dyn Future<Output = T> + Send>>;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RunOutput {
    /// `None` on spawn error or timeout.
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

/// A long-lived child: its stdout lines, and a token whose cancellation kills it.
pub struct StreamingChild {
    pub lines: tokio::sync::mpsc::Receiver<String>,
    pub kill: tokio_util::sync::CancellationToken,
}

pub trait ProcessRunner: Send + Sync + 'static {
    fn run(&self, program: &str, argv: Vec<String>, timeout: Duration) -> BoxFuture<RunOutput>;
    /// Must be called from inside a tokio runtime.
    fn spawn_streaming(&self, program: &str, argv: Vec<String>) -> std::io::Result<StreamingChild>;
}

/// Default per-stream capture cap of a [`ProcSpec`]: 1 MiB (one engine or wine helper's stdout and
/// stderr rarely need more than a tail, and MoltenVK once wrote 3.37 GB, spike 059).
pub const DEFAULT_MAX_BUFFER: usize = 1024 * 1024;

/// Default size of one pipe read of a [`ProcSpec`] run: 8 KiB. A raw-chunk run hands the reader's
/// slices to its sink, so this is also the largest chunk the sink sees.
pub const DEFAULT_READ_CHUNK: usize = 8 * 1024;

/// Everything one engine or wine helper spawn needs that [`ProcessRunner::run`] cannot say: an
/// environment (added to, or replacing, the inherited one), a working directory, stdin text, an
/// output cap, a cancellation token and a stable label for the child registry (D-17).
#[derive(Debug, Clone)]
pub struct ProcSpec {
    pub program: String,
    pub argv: Vec<String>,
    /// Set on the child. Added to the inherited environment unless `replace_env` is set.
    pub env: Vec<(String, String)>,
    /// `true`: the child gets exactly `env` and nothing inherited.
    pub replace_env: bool,
    pub cwd: Option<PathBuf>,
    /// Written to the child's stdin and then closed. `None`: stdin is null.
    pub stdin: Option<String>,
    /// `None`: no time limit (the run still ends on `cancel` and on app shutdown).
    pub timeout: Option<Duration>,
    /// Per-stream cap in bytes on the captured stdout and on the captured stderr. Output past it
    /// is read and dropped, never held, and `SpecOutput::truncated` is set.
    pub max_buffer: usize,
    /// Cancelling it kills the child tree; the run returns `SpecOutput { cancelled: true, .. }`.
    pub cancel: Option<CancellationToken>,
    /// The child's name in the registry of spawned helpers (shown when one needs the hard kill).
    pub label: &'static str,
    /// Windows only: start the child without a console window, the `windowsHide: true` of the TS
    /// spawns (a GUI process that runs PowerShell or `reg.exe` would otherwise flash a console for
    /// each one; Phase 94, Pitfall 12). Ignored on unix. `false` for every spec that does not ask.
    pub hide_window: bool,
    /// The most bytes one pipe read takes, so the largest raw chunk a [`SpecRunner::run_streamed`]
    /// sink sees. [`DEFAULT_READ_CHUNK`] unless a spec asks for more: the command runner reads in
    /// 64 KiB slices, as Node's pipes hand them over (88.2-07, Pitfall 6).
    pub read_chunk: usize,
}

impl ProcSpec {
    /// A spec that runs `program` with no arguments, the inherited environment, null stdin, no time
    /// limit and [`DEFAULT_MAX_BUFFER`]; set the fields the spawn needs on the result.
    pub fn new(label: &'static str, program: impl Into<String>) -> ProcSpec {
        ProcSpec {
            program: program.into(),
            argv: Vec::new(),
            env: Vec::new(),
            replace_env: false,
            cwd: None,
            stdin: None,
            timeout: None,
            max_buffer: DEFAULT_MAX_BUFFER,
            cancel: None,
            label,
            hide_window: false,
            read_chunk: DEFAULT_READ_CHUNK,
        }
    }
}

/// The per-line stdout callback of a [`SpecRunner`] run.
pub type LineSink = Box<dyn FnMut(&str) + Send>;

/// Which of a child's two output pipes a chunk of [`SpecRunner::run_streamed`] came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Pipe {
    Stdout,
    Stderr,
}

/// The raw-chunk callback of a [`SpecRunner::run_streamed`] run: text as it arrives from either pipe,
/// not split into lines (a tool that redraws a progress meter with a bare `\r`, as curl does, never
/// writes a newline, so a line callback would see it only at exit).
pub type ChunkSink = Box<dyn FnMut(Pipe, &str) + Send>;

/// What a [`SpecRunner`] run produced.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SpecOutput {
    /// `None` when the program could not be spawned (the reason is in `stderr`), when the run was
    /// timed out or cancelled, or when a signal ended the child.
    pub code: Option<i32>,
    /// At most `max_buffer` bytes, lossily decoded.
    pub stdout: String,
    /// At most `max_buffer` bytes, lossily decoded.
    pub stderr: String,
    pub timed_out: bool,
    /// The spec's `cancel` token, or the app-wide shutdown token, ended the run.
    pub cancelled: bool,
    /// Either stream produced more than `max_buffer` bytes.
    pub truncated: bool,
    /// The signal number that ended the child (unix), when one did and the run was not cancelled or
    /// timed out by GameLib. `code` is `None` then too.
    pub signal: Option<i32>,
}

/// The one spawn seam of the engine and wine domain crates (D-17). Implemented only by
/// `gamelib_proc::spec::SpecProcRunner`, which spawns through gamelib-proc, so every child it
/// starts is registered and reaped with GameLib.
pub trait SpecRunner: Send + Sync + 'static {
    /// Runs `spec` to completion, timeout, cancellation or app shutdown. `on_line` sees each stdout
    /// line (without its line ending) as it arrives, whether or not the capture cap has been hit.
    /// Must be polled inside a tokio runtime.
    fn run(&self, spec: ProcSpec, on_line: Option<LineSink>) -> BoxFuture<SpecOutput>;

    /// Like [`SpecRunner::run`], but `on_chunk` sees the raw text of BOTH pipes as it arrives (no line
    /// splitting, a multi-byte character never cut in half). The capture caps and the returned
    /// [`SpecOutput`] are the same as `run`'s.
    ///
    /// The default runs the spec to the end and then hands over what was captured, stdout first: a fake
    /// that only scripts a final output keeps working, but only [`SpecRunner`] implementations that
    /// override this stream while the child runs (the app's does).
    fn run_streamed(&self, spec: ProcSpec, mut on_chunk: ChunkSink) -> BoxFuture<SpecOutput> {
        let run = self.run(spec, None);
        Box::pin(async move {
            let output = run.await;
            if !output.stdout.is_empty() {
                on_chunk(Pipe::Stdout, &output.stdout);
            }
            if !output.stderr.is_empty() {
                on_chunk(Pipe::Stderr, &output.stderr);
            }
            output
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_new_spec_does_not_hide_its_window() {
        assert!(!ProcSpec::new("process-test", "program").hide_window);
    }
}
