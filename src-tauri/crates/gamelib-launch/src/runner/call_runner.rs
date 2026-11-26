//! `callRunner`'s helper path (88.2-07, D-02, D-21): one store CLI command (legendary, gogdl, nile, comet,
//! a sideload script) run as a `SpawnClass::Helper` through the context's spawn seam, with no timeout, the
//! merged environment replacing the inherited one, the credential-free command line logged, every chunk
//! handed to the caller's log writers and to an observer, and a result built from the last 50 chunks.
//!
//! A port of `callRunner` in `commandRunner.ts`; the differences are in `golden/runner/deltas.json`.
//!
//! - **Dedup (SC2).** Two identical joinable calls in flight share one spawn and one result. A call that
//!   observes the stream neither joins nor registers (49-REVIEW WR-01).
//! - **Abort.** A run registers an abort token under its abort id; [`run_abort`] cancels it and the run
//!   ends as `{ abort: true }`. A tracked kill ([`kill_tracked`]) and the app shutdown end a run the same
//!   way.
//! - **Logs.** The `Running command` line goes to the general log and to each of the caller's writers,
//!   with `Game Output:` when an app name is found; every chunk then goes to each writer. The command
//!   line is only ever [`get_runner_call_without_credentials`]'s output.

use std::collections::BTreeMap;
use std::fmt;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use gamelib_core::process::{ChunkSink, Pipe, ProcSpec};
use gamelib_engine::ctx::Platform;
use gamelib_log::{Entry, Level, Prefix};
use serde::de::{self, MapAccess, SeqAccess, Visitor};
use serde::{Deserialize, Deserializer, Serialize};
use tokio::sync::watch;
use tokio_util::sync::CancellationToken;

use super::redact::get_runner_call_without_credentials;
use super::sanitize::LogSanitizer;
use super::stream::{ChunkWindow, LaunchLogSink, LogHandOff, LogTargets, OutputSink};
use super::{lock, Flight, Registered, RunnerEvent, RunnerName};
use crate::ctx::LaunchCtx;

/// The label every runner child is registered under (shown when one needs the hard kill).
pub const RUNNER_LABEL: &str = "runner-call";

/// One pipe read of a runner child takes up to this much, as Node's pipes hand over (Pitfall 6).
pub const RUNNER_READ_CHUNK: usize = 64 * 1024;

/// The runner being run: its name, executable, directory and the prefix its general log lines carry.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunnerProps {
    pub name: RunnerName,
    pub bin: String,
    #[serde(default)]
    pub dir: Option<String>,
    /// The TS log prefix value (`Legendary`, `Gog`, `Nile`, `Sideload`, `Steam`).
    pub log_prefix: String,
}

/// Which spawn class a call asks for. The helper path is this plan's; the game path is 88.2-10's.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SpawnClassArg {
    #[default]
    Helper,
    Game,
}

/// Environment variables in the caller's own order (the order the logged command line lists them in).
/// Accepts a JSON object or a list of `[key, value]` pairs; only a list read from the wire as text keeps
/// an object's order, so the sidecar sends pairs.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct EnvList(pub Vec<(String, String)>);

impl<'de> Deserialize<'de> for EnvList {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<EnvList, D::Error> {
        struct EnvVisitor;
        impl<'de> Visitor<'de> for EnvVisitor {
            type Value = EnvList;

            fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str("an object of strings or a list of [key, value] pairs")
            }

            fn visit_unit<E: de::Error>(self) -> Result<EnvList, E> {
                Ok(EnvList::default())
            }

            fn visit_none<E: de::Error>(self) -> Result<EnvList, E> {
                Ok(EnvList::default())
            }

            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<EnvList, A::Error> {
                let mut out = Vec::new();
                while let Some((key, value)) = map.next_entry::<String, String>()? {
                    out.push((key, value));
                }
                Ok(EnvList(out))
            }

            fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<EnvList, A::Error> {
                let mut out = Vec::new();
                while let Some((key, value)) = seq.next_element::<(String, String)>()? {
                    out.push((key, value));
                }
                Ok(EnvList(out))
            }
        }
        deserializer.deserialize_any(EnvVisitor)
    }
}

/// The arguments of one runner call (`launch_runner_call`'s first argument).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunnerCallArgs {
    /// Names the output frames (`runnerOutput`) of a call that observes the stream.
    #[serde(default)]
    pub stream_id: String,
    pub command_parts: Vec<String>,
    pub runner: RunnerProps,
    /// What the caller adds to the process environment (the logged line lists only what differs).
    #[serde(default)]
    pub env: EnvList,
    /// Accepted for the game path (88.2-10); the helper path ignores it, as the TS `callRunner` does.
    #[serde(default)]
    pub wrappers: Vec<String>,
    /// The first word of the `Running command:` line; `Running command` when absent.
    #[serde(default)]
    pub log_message_prefix: Option<String>,
    /// The caller's log writers, the runner's own last (the order the TS writes in).
    #[serde(default)]
    pub log_targets: Vec<LogHandOff>,
    /// The named sanitizer the text written to the log writers goes through (the TS `logSanitizer`);
    /// the observer and the result window always get the raw chunk.
    #[serde(default)]
    pub log_sanitizer: Option<LogSanitizer>,
    #[serde(default)]
    pub abort_id: Option<String>,
    #[serde(default)]
    pub track_key: Option<String>,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub skip_error_handler: bool,
    /// The caller watches the stream: it neither joins nor registers as joinable.
    #[serde(default)]
    pub observe: bool,
    #[serde(default)]
    pub spawn_class: SpawnClassArg,
}

/// What the shell knows of its own process and appends to a call: the environment the child inherits
/// (the caller's variables win over it) and the `PATH` the PowerShell probe searches. The crate reads no
/// environment of its own.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RunnerHost {
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    #[serde(default)]
    pub path: String,
}

/// `ExecResult`: what a run answers. A failure carries `error`, an abort carries `abort: true`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecResult {
    pub stdout: String,
    pub stderr: String,
    pub full_command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub abort: Option<bool>,
}

// ---------------------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------------------

/// Index of the app name within a runner's command parts, per store (`None`: no app name).
fn app_name_index(parts: &[String], runner: RunnerName) -> Option<usize> {
    let find = |words: &[&str]| parts.iter().position(|p| words.contains(&p.as_str()));
    match runner {
        RunnerName::Gog => {
            if let Some(i) = find(&["launch"]) {
                // For GOGdl, between `launch` and the app name there is another element.
                return Some(i + 2);
            }
            find(&["download", "repair", "update"]).map(|i| i + 1)
        }
        // For legendary, the app name comes right after the command.
        RunnerName::Legendary => find(&["launch", "install", "repair", "update"]).map(|i| i + 1),
        // For nile, the app name is the last command part.
        RunnerName::Nile => {
            find(&["launch", "install", "update", "verify"]).map(|_| parts.len().saturating_sub(1))
        }
        RunnerName::Sideload | RunnerName::Steam => None,
    }
}

/// `appNameFromCommandParts`: the app name, or the empty string.
pub fn app_name_from_command_parts(parts: &[String], runner: RunnerName) -> String {
    app_name_index(parts, runner)
        .and_then(|i| parts.get(i))
        .cloned()
        .unwrap_or_default()
}

/// Node's `path.join(dir, bin)` for the plain paths a runner uses: the separator of the platform, empty
/// and `.` segments dropped, `..` resolved against what precedes it.
pub fn join_path(windows: bool, dir: &str, bin: &str) -> String {
    let sep = if windows { '\\' } else { '/' };
    let combined = format!("{dir}{sep}{bin}");
    let absolute = if windows {
        combined.starts_with(['\\', '/'])
    } else {
        combined.starts_with('/')
    };
    let mut kept: Vec<&str> = Vec::new();
    let segments = if windows {
        combined.split(['\\', '/']).collect::<Vec<_>>()
    } else {
        combined.split('/').collect::<Vec<_>>()
    };
    for segment in segments {
        match segment {
            "" | "." => {}
            ".." => {
                if matches!(kept.last(), Some(last) if *last != "..") {
                    kept.pop();
                } else if !absolute {
                    kept.push("..");
                }
            }
            other => kept.push(other),
        }
    }
    let joined = kept.join(&sep.to_string());
    match (absolute, joined.is_empty()) {
        (true, _) => format!("{sep}{joined}"),
        (false, true) => ".".to_string(),
        (false, false) => joined,
    }
}

/// Whether `powershell` is on `path` (searched with the platform's separator). Only asked on Windows.
fn powershell_on_path(path: &str) -> bool {
    path.split(';').filter(|dir| !dir.is_empty()).any(|dir| {
        [
            "powershell.exe",
            "powershell.cmd",
            "powershell.bat",
            "powershell",
        ]
        .iter()
        .any(|name| {
            std::path::Path::new(dir.trim_matches('"'))
                .join(name)
                .is_file()
        })
    })
}

/// The PowerShell form of a command: `-NoProfile Start-Process "<runner>" -Wait -NoNewWindow
/// -ArgumentList <parts>`, each part's backslashes doubled and wrapped as `"`part`"`.
fn powershell_command(full_runner_path: &str, parts: &[String]) -> Vec<String> {
    let arguments = parts
        .iter()
        .map(|part| part.replace('\\', "\\\\"))
        .map(|part| format!("\"`\"{part}`\"\""))
        .collect::<Vec<_>>()
        .join(",");
    let mut command = vec![
        "-NoProfile".to_string(),
        "Start-Process".to_string(),
        format!("\"`\"{full_runner_path}`\"\""),
        "-Wait".to_string(),
        "-NoNewWindow".to_string(),
    ];
    if !arguments.is_empty() {
        command.push("-ArgumentList".to_string());
        command.push(arguments);
    }
    command
}

/// The name Node reports for a signal number (Linux numbering, which macOS shares for the ones that
/// end a child in practice); a number with no common name is `SIG<n>`.
pub fn signal_name(number: i32) -> String {
    match number {
        1 => "SIGHUP",
        2 => "SIGINT",
        3 => "SIGQUIT",
        4 => "SIGILL",
        6 => "SIGABRT",
        8 => "SIGFPE",
        9 => "SIGKILL",
        11 => "SIGSEGV",
        13 => "SIGPIPE",
        14 => "SIGALRM",
        15 => "SIGTERM",
        other => return format!("SIG{other}"),
    }
    .to_string()
}

// ---------------------------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------------------------

/// What one run, once started, needs to the end.
struct Run {
    ctx: LaunchCtx,
    program: String,
    argv: Vec<String>,
    cwd: Option<String>,
    env: Vec<(String, String)>,
    safe_command: String,
    app_name: String,
    runner: RunnerName,
    log_prefix: Prefix,
    skip_error_handler: bool,
    abort: CancellationToken,
    targets: Arc<Mutex<LogTargets>>,
    log_sanitizer: Option<LogSanitizer>,
    output: Arc<dyn OutputSink>,
    stdout: Arc<Mutex<ChunkWindow>>,
    stderr: Arc<Mutex<ChunkWindow>>,
}

/// The chunk callback of a run: each chunk to the caller's writers (through `sanitizer` when the call
/// names one), then the observer, then the window. The sanitizer sees the writers' text only; the
/// observer and the window get the chunk as the pipe delivered it (the TS order in `onChunk`).
fn chunk_callback(
    targets: Arc<Mutex<LogTargets>>,
    sanitizer: Option<LogSanitizer>,
    log: Arc<dyn LaunchLogSink>,
    output: Arc<dyn OutputSink>,
    stdout: Arc<Mutex<ChunkWindow>>,
    stderr: Arc<Mutex<ChunkWindow>>,
) -> ChunkSink {
    Box::new(move |pipe, text| {
        {
            let mut targets = lock(&targets);
            if !targets.is_empty() {
                let to_log = match sanitizer {
                    Some(sanitizer) => sanitizer.apply(text),
                    None => text.to_string(),
                };
                let batches = targets.batches(|_| vec![Entry::Raw(to_log.clone())]);
                log.submit(batches);
            }
        }
        output.chunk(pipe, text);
        let window = match pipe {
            Pipe::Stdout => &stdout,
            Pipe::Stderr => &stderr,
        };
        lock(window).push_trimmed(text);
    })
}

impl Run {
    fn error_handler(&self, error: &str) {
        if self.skip_error_handler {
            return;
        }
        if let Some(handler) = &self.ctx.errors {
            handler.handle(error, &self.app_name, self.runner);
        }
    }

    /// The chunk callback of this run (see [`chunk_callback`]).
    fn chunk_sink(&self) -> ChunkSink {
        chunk_callback(
            Arc::clone(&self.targets),
            self.log_sanitizer,
            Arc::clone(&self.ctx.log_sink),
            Arc::clone(&self.output),
            Arc::clone(&self.stdout),
            Arc::clone(&self.stderr),
        )
    }

    /// `classifyFailure`.
    fn classify_failure(&self, message: &str, intended: bool) -> ExecResult {
        if intended || self.abort.is_cancelled() {
            self.ctx.log_sink.general(
                self.log_prefix,
                Level::Info,
                &format!("Abort command \"{}\"", self.safe_command),
            );
            return ExecResult {
                stdout: String::new(),
                stderr: String::new(),
                full_command: self.safe_command.clone(),
                error: None,
                abort: Some(true),
            };
        }
        self.error_handler(message);
        self.ctx.log_sink.general(
            self.log_prefix,
            Level::Error,
            &format!("Error running command \"{}\": {message}", self.safe_command),
        );
        ExecResult {
            stdout: String::new(),
            stderr: message.to_string(),
            full_command: self.safe_command.clone(),
            error: Some(message.to_string()),
            abort: None,
        }
    }

    async fn execute(&self) -> ExecResult {
        let mut spec = ProcSpec::new(RUNNER_LABEL, self.program.clone());
        spec.argv = self.argv.clone();
        spec.env = self.env.clone();
        spec.replace_env = true;
        spec.cwd = self.cwd.as_ref().map(PathBuf::from);
        // No timeout: a store CLI download or install runs as long as the transfer takes; the user
        // cancels through the abort id.
        spec.timeout = None;
        // The result is built from the chunk windows, so the runner's own capture is not kept.
        spec.max_buffer = 0;
        spec.cancel = Some(self.abort.clone());
        spec.hide_window = false;
        spec.read_chunk = RUNNER_READ_CHUNK;

        let out = self
            .ctx
            .engine
            .proc
            .run_streamed(spec, self.chunk_sink())
            .await;

        // The spawn seam answers no code, no signal and no flag when the program could not be started.
        if out.code.is_none() && out.signal.is_none() && !out.cancelled && !out.timed_out {
            return self.classify_failure(&out.stderr, false);
        }

        let joined = format!(
            "{}{}",
            lock(&self.stdout).join(""),
            lock(&self.stderr).join("")
        );
        self.error_handler(&joined);

        // Ended by the abort id, a tracked kill or the app shutdown: a cancellation, never an error.
        if out.cancelled {
            return self.classify_failure("aborted", true);
        }
        if let Some(signal) = out.signal {
            return self.classify_failure(
                &format!("Process terminated with signal {}", signal_name(signal)),
                false,
            );
        }
        // A non-zero exit without a signal (a store CLI that caught SIGTERM and failed) is an error,
        // or an abort when the user cancelled.
        if let Some(code) = out.code {
            if code != 0 {
                return self.classify_failure(&format!("Process exited with code {code}"), false);
            }
        }
        ExecResult {
            stdout: lock(&self.stdout).join(""),
            stderr: lock(&self.stderr).join("\n"),
            full_command: self.safe_command.clone(),
            error: None,
            abort: None,
        }
    }
}

/// Gives a run's table entries back when it settles, including when it panics.
struct TableGuard {
    ctx: LaunchCtx,
    key: Option<String>,
    serial: u64,
    abort_id: String,
    track: (String, String),
    token: CancellationToken,
}

impl Drop for TableGuard {
    fn drop(&mut self) {
        let tables = &self.ctx.runner;
        if let Some(key) = &self.key {
            let mut flights = lock(&tables.flights);
            if flights.get(key).is_some_and(|f| f.serial == self.serial) {
                flights.remove(key);
            }
        }
        {
            let mut tracked = lock(&tables.tracked);
            if tracked
                .get(&self.track)
                .is_some_and(|r| r.serial == self.serial)
            {
                tracked.remove(&self.track);
            }
        }
        {
            let mut aborts = lock(&tables.aborts);
            if aborts
                .get(&self.abort_id)
                .is_some_and(|r| r.serial == self.serial)
            {
                aborts.remove(&self.abort_id);
            }
        }
        tables.note(RunnerEvent::AbortRemove {
            id: self.abort_id.clone(),
            aborted: self.token.is_cancelled(),
        });
    }
}

fn failed_to_run(full_command: &str, message: &str) -> ExecResult {
    ExecResult {
        stdout: String::new(),
        stderr: message.to_string(),
        full_command: full_command.to_string(),
        error: Some(message.to_string()),
        abort: None,
    }
}

/// `callRunner` (helper class): runs one runner command and answers its result. Never fails: a spawn
/// failure, a signal and a non-zero exit are the result's `error`, a cancellation its `abort`.
pub async fn call_runner(
    ctx: &LaunchCtx,
    args: RunnerCallArgs,
    host: &RunnerHost,
    sink: Arc<dyn OutputSink>,
) -> ExecResult {
    let runner = args.runner.name;
    let windows = ctx.engine.platform == Platform::Windows;
    let app_name = app_name_from_command_parts(&args.command_parts, runner);
    let log_prefix = Prefix::from_value(&args.runner.log_prefix).unwrap_or(Prefix::General);

    // Necessary to get rid of possible empty entries.
    let mut parts: Vec<String> = args
        .command_parts
        .iter()
        .filter(|p| !p.is_empty())
        .cloned()
        .collect();

    let mut bin = args.runner.bin.clone();
    let mut full_runner_path = match args.runner.dir.as_deref().filter(|d| !d.is_empty()) {
        Some(dir) => join_path(windows, dir, &bin),
        None => bin.clone(),
    };

    // macOS and Linux: spawning an executable in the current working directory requires a `./`.
    let dir_set = args.runner.dir.as_deref().is_some_and(|d| !d.is_empty());
    if !windows && !bin.starts_with('/') && dir_set {
        bin = format!("./{bin}");
    }

    // On Windows, `Start-Process -Wait` waits for the process and its children, provided PowerShell is
    // available.
    let use_powershell = *ctx
        .runner
        .powershell
        .get_or_init(|| windows && powershell_on_path(&host.path));
    if use_powershell {
        parts = powershell_command(&full_runner_path, &parts);
        bin = "powershell".to_string();
        full_runner_path = "powershell".to_string();
    }

    if args.spawn_class == SpawnClassArg::Game {
        return failed_to_run(
            &full_runner_path,
            "the game spawn class is not available on the runner path yet",
        );
    }

    let safe_command =
        get_runner_call_without_credentials(&parts, &args.env.0, &host.env, &full_runner_path);

    let prefix = format!(
        "{}:",
        args.log_message_prefix
            .as_deref()
            .unwrap_or("Running command")
    );
    ctx.log_sink
        .general(log_prefix, Level::Info, &format!("{prefix} {safe_command}"));

    // The command line (and `Game Output:`) to each of the caller's writers, one writer after the other.
    let targets = Arc::new(Mutex::new(LogTargets::resolve(args.log_targets.clone())));
    {
        let mut targets = lock(&targets);
        if !targets.is_empty() {
            let (ts, tz) = ctx.log_sink.stamp();
            let header = [prefix.as_str(), safe_command.as_str(), "\n\n"]
                .iter()
                .filter(|part| !part.is_empty())
                .copied()
                .collect::<Vec<_>>()
                .join(" ");
            let line = |msg: String| Entry::Line {
                ts,
                tz,
                level: Level::Info,
                prefix: Prefix::General,
                msg,
            };
            let batches = targets.batches(|_| {
                let mut entries = vec![line(header.clone())];
                if !app_name.is_empty() {
                    entries.push(line("Game Output:".to_string()));
                }
                entries
            });
            ctx.log_sink.submit(batches);
        }
    }

    // Identical commands in flight share one run (the key is the runner and the parts, comma-joined).
    let joinable = !args.observe;
    let key = format!("{} {}", runner.as_str(), parts.join(","));
    let serial = ctx.runner.next_serial();
    let abort_id = args
        .abort_id
        .clone()
        .filter(|id| !id.is_empty())
        .or_else(|| (!app_name.is_empty()).then(|| app_name.clone()))
        .unwrap_or_else(|| format!("runner-{serial}"));
    let track_key = args.track_key.clone().unwrap_or_else(|| abort_id.clone());
    let abort = CancellationToken::new();
    let (sender, receiver) = watch::channel::<Option<ExecResult>>(None);

    // Join a run in flight, or become the run: decided under one lock, with no await inside it.
    let joined = {
        let mut flights = lock(&ctx.runner.flights);
        let existing = joinable
            .then(|| flights.get(&key).map(|flight| flight.result.clone()))
            .flatten();
        if existing.is_none() {
            if joinable {
                flights.insert(
                    key.clone(),
                    Flight {
                        serial,
                        result: receiver,
                    },
                );
            }
            lock(&ctx.runner.aborts).insert(
                abort_id.clone(),
                Registered {
                    serial,
                    token: abort.clone(),
                },
            );
            lock(&ctx.runner.tracked).insert(
                (runner.as_str().to_string(), track_key.clone()),
                Registered {
                    serial,
                    token: abort.clone(),
                },
            );
        }
        existing
    };
    if let Some(mut shared) = joined {
        let lost = "the shared runner call ended without a result";
        return match shared.wait_for(Option::is_some).await {
            Ok(done) => done
                .clone()
                .unwrap_or_else(|| failed_to_run(&safe_command, lost)),
            Err(_) => failed_to_run(&safe_command, lost),
        };
    }
    ctx.runner.note(RunnerEvent::AbortCreate(abort_id.clone()));
    ctx.runner.note(RunnerEvent::Track {
        runner: runner.as_str().to_string(),
        key: track_key.clone(),
    });

    let mut env: BTreeMap<String, String> = host.env.clone();
    for (key, value) in &args.env.0 {
        env.insert(key.clone(), value.clone());
    }

    let run = Run {
        ctx: ctx.clone(),
        program: bin,
        argv: parts,
        cwd: args
            .cwd
            .clone()
            .filter(|c| !c.is_empty())
            .or_else(|| args.runner.dir.clone()),
        env: env.into_iter().collect(),
        safe_command: safe_command.clone(),
        app_name,
        runner,
        log_prefix,
        skip_error_handler: args.skip_error_handler,
        abort: abort.clone(),
        targets,
        log_sanitizer: args.log_sanitizer,
        output: sink,
        stdout: Arc::new(Mutex::new(ChunkWindow::new())),
        stderr: Arc::new(Mutex::new(ChunkWindow::new())),
    };
    let guard = TableGuard {
        ctx: ctx.clone(),
        key: joinable.then(|| key.clone()),
        serial,
        abort_id,
        track: (runner.as_str().to_string(), track_key),
        token: abort,
    };

    // The run is its own task, so a caller that drops its future neither stops the child nor strands
    // the calls that joined it.
    let task = tokio::spawn(async move {
        let result = run.execute().await;
        // The entry leaves the table before anyone is told, so a call made after the result is a new run.
        drop(guard);
        let _ = sender.send(Some(result.clone()));
        result
    });
    match task.await {
        Ok(result) => result,
        Err(_) => failed_to_run(&safe_command, "the runner call ended unexpectedly"),
    }
}

/// Ends the run registered under `abort_id` (the TS `abortController.abort()`): the run answers
/// `{ abort: true }`. `false` when nothing is registered under that id.
pub fn run_abort(ctx: &LaunchCtx, abort_id: &str) -> bool {
    match lock(&ctx.runner.aborts).get(abort_id) {
        Some(registered) => {
            registered.token.cancel();
            true
        }
        None => false,
    }
}

/// Ends the run registered under `(runner, key)` on purpose (the TS `killTracked`): a stopped game, a
/// cancel, a quit. The run answers `{ abort: true }`. Answers how many it ended (0 or 1).
pub fn kill_tracked(ctx: &LaunchCtx, runner: RunnerName, key: &str) -> usize {
    match lock(&ctx.runner.tracked).get(&(runner.as_str().to_string(), key.to_string())) {
        Some(registered) => {
            registered.token.cancel();
            1
        }
        None => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parts(words: &[&str]) -> Vec<String> {
        words.iter().map(|w| (*w).to_string()).collect()
    }

    #[test]
    fn the_app_name_is_found_per_runner() {
        use RunnerName::*;
        assert_eq!(
            app_name_from_command_parts(&parts(&["launch", "id", "app"]), Gog),
            "app"
        );
        assert_eq!(
            app_name_from_command_parts(&parts(&["download", "app"]), Gog),
            "app"
        );
        assert_eq!(
            app_name_from_command_parts(&parts(&["install", "app", "--x"]), Legendary),
            "app"
        );
        assert_eq!(
            app_name_from_command_parts(&parts(&["launch", "a", "b", "last"]), Nile),
            "last"
        );
        assert_eq!(
            app_name_from_command_parts(&parts(&["launch", "app"]), Sideload),
            ""
        );
        // The word is last: its index is past the end.
        assert_eq!(
            app_name_from_command_parts(&parts(&["launch"]), Legendary),
            ""
        );
    }

    #[test]
    fn join_path_follows_node_path_join() {
        assert_eq!(join_path(false, "/a/b", "bin"), "/a/b/bin");
        assert_eq!(join_path(false, "/a/b/", "/bin"), "/a/b/bin");
        assert_eq!(join_path(false, "/a/b", "../c"), "/a/c");
        assert_eq!(join_path(false, "a", "./b"), "a/b");
        assert_eq!(
            join_path(true, "C:\\tools\\x", "gogdl.exe"),
            "C:\\tools\\x\\gogdl.exe"
        );
        assert_eq!(
            join_path(true, "C:/tools", "gogdl.exe"),
            "C:\\tools\\gogdl.exe"
        );
    }

    #[test]
    fn the_powershell_form_doubles_backslashes_and_wraps_each_part() {
        let got = powershell_command("C:\\r\\x.exe", &parts(&["a b", "C:\\dir"]));
        assert_eq!(got[0], "-NoProfile");
        assert_eq!(got[2], "\"`\"C:\\r\\x.exe`\"\"");
        assert_eq!(got[5], "-ArgumentList");
        assert_eq!(got[6], "\"`\"a b`\"\",\"`\"C:\\\\dir`\"\"");
        assert_eq!(powershell_command("r", &[]).len(), 5);
    }

    #[test]
    fn env_accepts_an_object_or_pairs_and_keeps_the_pair_order() {
        let args: RunnerCallArgs = serde_json::from_str(
            r#"{"commandParts":["x"],"runner":{"name":"gog","bin":"b","logPrefix":"Gog"},
                "env":[["B","1"],["A","2"]]}"#,
        )
        .expect("pairs");
        assert_eq!(
            args.env.0,
            vec![
                ("B".to_string(), "1".to_string()),
                ("A".to_string(), "2".to_string())
            ]
        );
        let from_object: RunnerCallArgs = serde_json::from_str(
            r#"{"commandParts":["x"],"runner":{"name":"gog","bin":"b","logPrefix":"Gog"},
                "env":{"B":"1","A":"2"}}"#,
        )
        .expect("object");
        assert_eq!(
            from_object.env.0.first().map(|(k, _)| k.as_str()),
            Some("B")
        );
    }

    #[test]
    fn an_unknown_argument_is_refused() {
        let bad: Result<RunnerCallArgs, _> = serde_json::from_str(
            r#"{"commandParts":[],"runner":{"name":"gog","bin":"b","logPrefix":"Gog"},"extra":1}"#,
        );
        assert!(bad.is_err());
    }

    #[test]
    fn signals_have_node_names() {
        assert_eq!(signal_name(15), "SIGTERM");
        assert_eq!(signal_name(9), "SIGKILL");
        assert_eq!(signal_name(31), "SIG31");
    }

    /// Records what a log sink and an output sink are given.
    #[derive(Default)]
    struct Recorded {
        written: Mutex<Vec<String>>,
        streamed: Mutex<Vec<String>>,
    }

    impl LaunchLogSink for Recorded {
        fn stamp(&self) -> (u64, i32) {
            (0, 0)
        }
        fn submit(&self, batches: Vec<gamelib_log::TargetBatch>) {
            for batch in batches {
                for entry in batch.entries {
                    if let Entry::Raw(text) = entry {
                        lock(&self.written).push(text);
                    }
                }
            }
        }
        fn general(&self, _prefix: Prefix, _level: Level, _msg: &str) {}
    }

    impl OutputSink for Recorded {
        fn chunk(&self, _pipe: Pipe, text: &str) {
            lock(&self.streamed).push(text.to_string());
        }
    }

    fn one_runner_writer() -> Arc<Mutex<LogTargets>> {
        Arc::new(Mutex::new(LogTargets::resolve(vec![LogHandOff {
            target: gamelib_log::frame::FrameTarget {
                kind: "runner".to_string(),
                app_name: None,
                runner: Some("gog".to_string()),
                log_type: None,
            },
            disabled: false,
            rotate: false,
        }])))
    }

    /// The TS `onChunk` order: the log writers get the sanitized text, `onOutput` and the window the raw one.
    #[test]
    fn a_gog_token_reaches_the_log_sanitized_while_the_stream_and_the_window_get_it_raw() {
        let recorded = Arc::new(Recorded::default());
        let stdout = Arc::new(Mutex::new(ChunkWindow::new()));
        let stderr = Arc::new(Mutex::new(ChunkWindow::new()));
        let mut sink = chunk_callback(
            one_runner_writer(),
            Some(LogSanitizer::GogAuth),
            recorded.clone(),
            recorded.clone(),
            stdout.clone(),
            stderr,
        );
        let chunk = r#"{"access_token":"at-synth","user_id":"u-synth","expires_in":3600}"#;
        sink(Pipe::Stdout, chunk);

        let written = lock(&recorded.written).clone();
        assert_eq!(written.len(), 1);
        assert!(
            !written[0].contains("at-synth") && !written[0].contains("u-synth"),
            "the log got {:?}",
            written[0]
        );
        assert!(written[0].contains("\"access_token\":\"<redacted>\""));
        assert_eq!(*lock(&recorded.streamed), vec![chunk.to_string()]);
        assert_eq!(lock(&stdout).join(""), chunk);
    }

    #[test]
    fn a_call_that_names_no_sanitizer_writes_the_chunk_as_it_came() {
        let recorded = Arc::new(Recorded::default());
        let mut sink = chunk_callback(
            one_runner_writer(),
            None,
            recorded.clone(),
            recorded.clone(),
            Arc::new(Mutex::new(ChunkWindow::new())),
            Arc::new(Mutex::new(ChunkWindow::new())),
        );
        sink(Pipe::Stderr, "token=SECRET");
        assert_eq!(*lock(&recorded.written), vec!["token=SECRET".to_string()]);
    }

    #[test]
    fn a_sanitizer_is_read_from_the_wire_and_an_unknown_one_is_refused() {
        let args: RunnerCallArgs = serde_json::from_str(
            r#"{"commandParts":["x"],"runner":{"name":"gog","bin":"b","logPrefix":"Gog"},
                "logSanitizer":"nileAuth"}"#,
        )
        .expect("named");
        assert_eq!(args.log_sanitizer, Some(LogSanitizer::NileAuth));
        let bad: Result<RunnerCallArgs, _> = serde_json::from_str(
            r#"{"commandParts":["x"],"runner":{"name":"gog","bin":"b","logPrefix":"Gog"},
                "logSanitizer":"maskSecret"}"#,
        );
        assert!(bad.is_err());
    }

    #[test]
    fn an_exec_result_leaves_out_absent_keys() {
        let ok = ExecResult {
            stdout: "o".into(),
            stderr: "e".into(),
            full_command: "c".into(),
            error: None,
            abort: None,
        };
        assert_eq!(
            serde_json::to_value(ok).unwrap(),
            serde_json::json!({"stdout":"o","stderr":"e","fullCommand":"c"})
        );
    }
}
