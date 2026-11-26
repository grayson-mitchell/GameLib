//! `runWineCommand`'s launch variant (88.2-12, D-02, D-05, D-21, D-22): one wine command run for a game or an
//! installer, closing the three behaviours 87's `run_wine_command` left to this phase
//! (`gamelib-wine/tests/fixtures/golden/wine_command/deltas.json`).
//!
//! The decisions come from `gamelib_wine::wine_cmd::command::prepare_wine_command`, the same function
//! `run_wine_command` runs (the prefix check, `validWine`, the environment merge, umu, the proton verb, the
//! wrappers and the argv; D-22, extend and never re-port). What is different here is how the child runs.
//!
//! - **Game class** (`spawnClass: game`, the sideload wine launch): the child is the user's process and
//!   outlives GameLib (D-05). It spawns through the context's game spawner into a private capture file, Rust
//!   tails the file into the log writers, the observer and the 50-chunk window (88.2-10), the run is
//!   registered in the tracked registry as `{ runner: "wine", key }` while it lasts (88.2-11), and it ends on
//!   the leader and its group (`close`) or, with `resolveOnExit`, on the leader plus the drain grace.
//! - **Helper class** (every other wine command): a streamed run through the context's spawn seam as a
//!   `SpawnClass::Helper`, registered as a helper entry under the same key, ending on `close` (every holder
//!   of a pipe has closed it) or, with `resolveOnExit`, on the exit plus the drain grace.
//!
//! Both write the `Wine Command: <bin> <parts>\n\nGame Log:\n` header to each of the caller's log writers
//! before any output, then every chunk (raw, never sanitised or trimmed) to the writers and the observer, and
//! answer the last 50 chunks of each stream joined with `''` (the TS `runWineCommand` rule). A spawn that
//! fails is logged as `Wine command failed to run:` and answered as an empty result, and the waited
//! `wineserver --wait` is a Helper capped at 30 minutes. The caller's `commandParts` and `wrappers` lists are
//! only read: the argv is built on a copy.
//!
//! The differences from the TS that remain are `golden/wine_launch/deltas.json`'s, and:
//!
//! - a game's two streams share one capture file, so a game run answers everything it printed as stdout (the
//!   `game-merged-streams` delta of `golden/runner`, which `golden/wine_launch/deltas.json` carries too);
//! - the helper path's spawn seam does not report a spawn, so its header is written with the first chunk or,
//!   for a command that printed nothing, when it ends (and not at all for a command that never started);
//! - `onSpawn` is a TS callback with a child handle and has no wire form: the game path reports the pid to the
//!   output sink (`runnerSpawned`), the helper path has none to report.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use gamelib_core::process::{ChunkSink, Pipe, PostExit, ProcSpec, SpecOutput};
use gamelib_log::{Entry, Level, Prefix};
use gamelib_wine::wine_cmd::command::{
    prepare_wine_command, PreparedWine, WineCommandArgs, WineCommandOptions, WineCommandResult,
    MAX_BUFFER,
};
use gamelib_wine::wine_cmd::env::GameSettingsView;
use gamelib_wine::wine_cmd::WineHost;
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::sync::watch;
use tokio_util::sync::CancellationToken;

use super::call_runner::{SpawnClassArg, RUNNER_READ_CHUNK};
use super::stream::{ChunkWindow, LaunchLogSink, LogHandOff, LogTargets, OutputSink};
use super::{lock, RunnerEvent};
use crate::ctx::LaunchCtx;
use crate::game::capture;
use crate::game::end::{self, Ended, GameEnd, EXIT_DRAIN_GRACE};
use crate::game::registry::{GameGuard, RunIds};
use crate::game::spawn::GameSpawn;

/// The runner name a wine command is tracked under (`track: { runner: 'wine', key }`).
pub const WINE_RUNNER: &str = "wine";

/// How long `wineserver --wait` gets before the command's own result is returned without it (the TS
/// `WINESERVER_WAIT_TIMEOUT_MS`).
const WINESERVER_WAIT: Duration = Duration::from_secs(30 * 60);

/// The arguments of one launch-variant wine command (`launch_wine_command`'s first argument): the fields of
/// `WineCommandArgs` and the `options` the 87 struct ignored, which are read here. Strict: an unknown key is
/// a bad argument.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LaunchWineCommandArgs {
    /// Names the output frames (`runnerOutput`) of a call that observes the stream.
    #[serde(default)]
    pub stream_id: String,
    #[serde(default)]
    pub game_settings: Option<GameSettingsView>,
    pub command_parts: Vec<String>,
    #[serde(default)]
    pub wait: bool,
    #[serde(default)]
    pub proton_verb: Option<String>,
    #[serde(default)]
    pub install_folder_name: Option<String>,
    #[serde(default)]
    pub game_install_path: Option<String>,
    /// `options.env`, `options.wrappers` and `options.trackKey`.
    #[serde(default)]
    pub options: Option<WineCommandOptions>,
    #[serde(default)]
    pub start_folder: Option<String>,
    #[serde(default, rename = "skipPrefixCheckIKnowWhatImDoing")]
    pub skip_prefix_check: bool,
    #[serde(default)]
    pub ignore_logging: bool,
    #[serde(default)]
    pub resolve_on_exit: bool,
    /// `options.logWriters`: the caller's log writers, as typed targets.
    #[serde(default)]
    pub log_targets: Vec<LogHandOff>,
    /// `options.logMessagePrefix`. The TS `runWineCommand` never reads it; accepted so a call options object is
    /// not a bad argument.
    #[serde(default)]
    pub log_message_prefix: Option<String>,
    /// The caller watches the stream (`options.onOutput`): `runnerOutput` frames carry each chunk.
    #[serde(default)]
    pub observe: bool,
    /// `game` for the sideload wine launch; everything else is a helper.
    #[serde(default)]
    pub spawn_class: SpawnClassArg,
}

impl LaunchWineCommandArgs {
    /// The part 87's `run_wine_command` takes.
    fn to_base(&self) -> WineCommandArgs {
        WineCommandArgs {
            game_settings: self.game_settings.clone(),
            command_parts: self.command_parts.clone(),
            wait: self.wait,
            proton_verb: self.proton_verb.clone(),
            install_folder_name: self.install_folder_name.clone(),
            game_install_path: self.game_install_path.clone(),
            options: self.options.clone(),
            start_folder: self.start_folder.clone(),
            skip_prefix_check: self.skip_prefix_check,
            ignore_logging: self.ignore_logging,
            resolve_on_exit: self.resolve_on_exit,
        }
    }
}

/// `WineCommandResult` as the launch variant answers it: the last 50 chunks of each stream joined with `''`,
/// the exit code (`null` for a spawn that failed or a child a signal ended), and no code at all when nothing
/// ran (an invalid wine).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WineLaunchResult {
    pub stdout: String,
    pub stderr: String,
    pub code: Option<i32>,
    /// A child was started (or tried): the answer carries a `code` key, `null` when it has none.
    pub ran: bool,
}

impl WineLaunchResult {
    pub fn to_json(&self) -> Value {
        let mut out = json!({ "stdout": self.stdout, "stderr": self.stderr });
        if self.ran {
            out["code"] = json!(self.code);
        }
        out
    }
}

impl From<WineCommandResult> for WineLaunchResult {
    fn from(refusal: WineCommandResult) -> WineLaunchResult {
        WineLaunchResult {
            stdout: refusal.stdout,
            stderr: refusal.stderr,
            code: refusal.code,
            ran: refusal.ran,
        }
    }
}

/// When a game-class run is over: `resolveOnExit` ends it on the leader plus the drain grace, else on the
/// leader and its whole group.
pub fn game_end_of(resolve_on_exit: bool) -> GameEnd {
    if resolve_on_exit {
        GameEnd::Exit
    } else {
        GameEnd::Close
    }
}

/// When a helper-class run is over: `resolveOnExit` ends it the drain grace after the exit, else it waits for
/// every holder of a pipe to close it (the TS `resolveOn: 'close'`).
pub fn post_exit_of(resolve_on_exit: bool) -> PostExit {
    if resolve_on_exit {
        PostExit::Grace(EXIT_DRAIN_GRACE)
    } else {
        PostExit::UntilClosed
    }
}

/// What one run writes to and keeps: the caller's log writers, the header still owed to them, the observer
/// and the two chunk windows.
struct Shared {
    log: Arc<dyn LaunchLogSink>,
    targets: Mutex<LogTargets>,
    /// The header line, until it has been written to the writers.
    header: Mutex<Option<String>>,
    output: Arc<dyn OutputSink>,
    stdout: Mutex<ChunkWindow>,
    stderr: Mutex<ChunkWindow>,
}

impl Shared {
    /// Writes `text` as one raw entry to each of the caller's writers (nothing when there are none).
    fn write(&self, text: &str) {
        let batches = lock(&self.targets).batches(|_| vec![Entry::Raw(text.to_string())]);
        if !batches.is_empty() {
            self.log.submit(batches);
        }
    }

    /// Writes the header, once, if it is still owed.
    fn write_header(&self) {
        if let Some(header) = lock(&self.header).take() {
            self.write(&header);
        }
    }

    /// The TS `onChunk`: the writers, then the observer, then the window. Raw, never sanitised or trimmed.
    fn chunk(&self, pipe: Pipe, text: &str) {
        self.write_header();
        self.write(text);
        self.output.chunk(pipe, text);
        let window = match pipe {
            Pipe::Stdout => &self.stdout,
            Pipe::Stderr => &self.stderr,
        };
        lock(window).push_raw(text);
    }

    fn sink(self: &Arc<Self>) -> ChunkSink {
        let shared = Arc::clone(self);
        Box::new(move |pipe, text| shared.chunk(pipe, text))
    }

    fn answer(&self, code: Option<i32>) -> WineLaunchResult {
        WineLaunchResult {
            stdout: lock(&self.stdout).join(""),
            stderr: lock(&self.stderr).join(""),
            code,
            ran: true,
        }
    }
}

/// How a child ended, as the wait for `wineserver --wait` needs it.
enum Ran {
    /// The child could not be started; the reason is the OS's.
    SpawnFailed(String),
    /// GameLib is going away: the reply is dropped and nothing else runs.
    Shutdown,
    /// The child ended. `stopped` is a cancel, a registry kill or an abort: nothing waits after those.
    Ended { code: Option<i32>, stopped: bool },
}

/// `runWineCommand` for a launch: prepares the command (87's function), runs it as the call's class and
/// answers what the TS answered. Never fails: a refusal, a spawn failure and a cancel are all results.
pub async fn launch_wine_command(
    ctx: &LaunchCtx,
    args: LaunchWineCommandArgs,
    host: &WineHost,
    sink: Arc<dyn OutputSink>,
) -> WineLaunchResult {
    let class = args.spawn_class;
    let resolve_on_exit = args.resolve_on_exit;
    let stream_id = args.stream_id.clone();
    let base = args.to_base();
    let explicit_track = base
        .options
        .as_ref()
        .and_then(|options| options.track_key.clone());
    let install_folder = base.install_folder_name.clone();

    let prepared = match prepare_wine_command(&ctx.wine, base, host).await {
        Ok(prepared) => prepared,
        Err(refusal) => return refusal.into(),
    };
    let key = explicit_track
        .or(install_folder)
        .unwrap_or_else(|| prepared.wine_prefix.clone());

    ctx.log_sink.general(
        Prefix::Backend,
        Level::Debug,
        &format!("Running Wine command: {}", prepared.debug_parts),
    );

    let shared = Arc::new(Shared {
        log: Arc::clone(&ctx.log_sink),
        targets: Mutex::new(LogTargets::resolve(args.log_targets)),
        header: Mutex::new(Some(format!(
            "Wine Command: {} {}\n\nGame Log:\n",
            prepared.header_bin, prepared.header_parts
        ))),
        output: sink,
        stdout: Mutex::new(ChunkWindow::new()),
        stderr: Mutex::new(ChunkWindow::new()),
    });
    ctx.runner.note(RunnerEvent::Track {
        runner: WINE_RUNNER.to_string(),
        key: key.clone(),
    });
    let ids = RunIds {
        runner: WINE_RUNNER.to_string(),
        key: key.clone(),
        abort_id: format!("wine-{}", ctx.runner.next_serial()),
        stream_id,
    };

    let ran = match class {
        SpawnClassArg::Game => run_game(ctx, &prepared, &key, ids, resolve_on_exit, &shared).await,
        SpawnClassArg::Helper => {
            // Held until this function returns: the exit path waits for a running wine command.
            let _registrant = ctx.engine.shutdown.register("wine-command");
            run_helper(ctx, &prepared, ids, resolve_on_exit, host, &shared).await
        }
    };
    match ran {
        Ran::Shutdown => WineLaunchResult::default(),
        Ran::SpawnFailed(reason) => {
            // The legacy handler only logged a spawn error and never settled; an empty result instead.
            ctx.log_sink.general(
                Prefix::Backend,
                Level::Error,
                &format!("Wine command failed to run: {reason}"),
            );
            wait_for_wineserver(ctx, &prepared, host).await;
            shared.answer(None)
        }
        Ran::Ended { code, stopped } => {
            if !stopped {
                wait_for_wineserver(ctx, &prepared, host).await;
            }
            shared.answer(code)
        }
    }
}

/// `wineserver --wait` after a waited command: a Helper capped at 30 minutes, with the TS warning when it
/// runs out. Nothing when the command did not ask to wait or its wine has no `wineserver`.
async fn wait_for_wineserver(ctx: &LaunchCtx, prepared: &PreparedWine, host: &WineHost) {
    let (true, Some(wineserver)) = (prepared.wait, &prepared.wineserver) else {
        return;
    };
    // Held for the wait only: a game has long since outlived the registrant of its own run.
    let _registrant = ctx.engine.shutdown.register("wine-command");
    let mut wait = ProcSpec::new("wine-command", wineserver.clone());
    wait.argv = vec!["--wait".to_string()];
    wait.env = prepared.env.clone();
    wait.replace_env = true;
    wait.cwd = prepared.cwd.clone();
    wait.timeout = Some(WINESERVER_WAIT);
    wait.max_buffer = MAX_BUFFER;
    let waited = gamelib_wine::wine_cmd::command::spawn(&ctx.wine, host, wait).await;
    if waited.timed_out {
        ctx.log_sink.general(
            Prefix::Backend,
            Level::Warning,
            &format!(
                "wineserver --wait for prefix {} did not finish within 30 minutes; returning the command result without waiting further",
                prepared.wine_prefix
            ),
        );
    }
}

// ---------------------------------------------------------------------------------------------
// The helper arm
// ---------------------------------------------------------------------------------------------

/// A streamed run through the context's spawn seam, registered as a helper entry for the tracked kill.
async fn run_helper(
    ctx: &LaunchCtx,
    prepared: &PreparedWine,
    ids: RunIds,
    resolve_on_exit: bool,
    host: &WineHost,
    shared: &Arc<Shared>,
) -> Ran {
    // The run ends on the app's shutdown, on a tracked kill (the entry's token) and on the caller's cancel.
    let abort = ctx.engine.shutdown.token().child_token();
    let entry = ctx.registry.register_helper(ids, abort.clone());
    let _registered = GameGuard::helper(Arc::clone(&ctx.registry), entry);

    let mut spec = ProcSpec::new("wine-command", prepared.program.clone());
    spec.argv = prepared.argv.clone();
    spec.env = prepared.env.clone();
    spec.replace_env = true;
    spec.cwd = prepared.cwd.clone();
    // A wine command runs as long as the game or installer it hosts: no time limit, ended by the abort token.
    spec.timeout = None;
    // The result is built from the chunk windows, so the runner's own capture is not kept.
    spec.max_buffer = 0;
    spec.cancel = Some(abort.clone());
    spec.hide_window = false;
    spec.read_chunk = RUNNER_READ_CHUNK;
    spec.post_exit = post_exit_of(resolve_on_exit);

    let mut run = ctx.engine.proc.run_streamed(spec, shared.sink());
    let caller_cancel = async {
        match &host.cancel {
            Some(cancel) => cancel.cancelled().await,
            None => std::future::pending::<()>().await,
        }
    };
    let out: SpecOutput = tokio::select! {
        out = &mut run => out,
        () = caller_cancel => {
            abort.cancel();
            run.await
        }
    };

    // The spawn seam answers no code, no signal and no flag when the program could not be started.
    if out.code.is_none() && out.signal.is_none() && !out.cancelled && !out.timed_out {
        return Ran::SpawnFailed(out.stderr);
    }
    // A command that printed nothing still owes its header: it ran.
    shared.write_header();
    Ran::Ended {
        code: out.code,
        stopped: out.cancelled || abort.is_cancelled(),
    }
}

// ---------------------------------------------------------------------------------------------
// The game arm
// ---------------------------------------------------------------------------------------------

/// The game class: spawn into a private capture file, tail it, register, and wait for the end.
async fn run_game(
    ctx: &LaunchCtx,
    prepared: &PreparedWine,
    key: &str,
    ids: RunIds,
    resolve_on_exit: bool,
    shared: &Arc<Shared>,
) -> Ran {
    let path = capture::capture_path_labelled(ctx, WINE_RUNNER, key);
    if let Err(e) = capture::create_capture(&path) {
        return Ran::SpawnFailed(format!(
            "could not create the game's output file: {}",
            e.kind()
        ));
    }
    let cwd = prepared
        .cwd
        .as_ref()
        .map(|c| c.to_string_lossy().into_owned());
    let spawn = GameSpawn {
        program: &prepared.program,
        argv: &prepared.argv,
        env: &prepared.env,
        cwd: cwd.as_deref(),
        capture: &path,
    };
    let handle = match ctx.game_spawner.spawn(&spawn) {
        Ok(handle) => handle,
        Err(e) => return Ran::SpawnFailed(format!("spawn {}: {e}", prepared.program)),
    };
    // The TS wrote the header from `onSpawn`, right after the caller's own `onSpawn`.
    shared.output.spawned(handle.pid);
    shared.write_header();

    let abort = CancellationToken::new();
    let id = ctx
        .registry
        .register_game(ids, ctx.engine.clock.now_ms(), abort.clone(), handle);
    let _registered = GameGuard::new(Arc::clone(&ctx.registry), id);
    let Some(entry) = ctx.registry.entry(id) else {
        return Ran::SpawnFailed("the game's run was not registered".to_string());
    };

    let (done, finished) = watch::channel(false);
    // Both of a game's streams share the capture file: every chunk read from it is stdout.
    let mut chunk = shared.sink();
    let tail = capture::tail(&path, 0, move |text| chunk(Pipe::Stdout, text), finished);
    let token = ctx.engine.shutdown.token();
    let wait = async {
        let ended = end::wait_end(&entry, game_end_of(resolve_on_exit), &token).await;
        // The final drain of the capture file runs after this.
        let _ = done.send(true);
        ended
    };
    let (_, ended) = tokio::join!(tail, wait);
    match ended {
        // GameLib is going away; the game is left running.
        Ended::Shutdown => Ran::Shutdown,
        Ended::Finished(status) => Ran::Ended {
            code: status.and_then(|s| s.code()),
            stopped: entry.was_killed() || abort.is_cancelled(),
        },
    }
}

/// The capture file a game-class wine command writes, for a test to find.
pub fn capture_file_of(ctx: &LaunchCtx, key: &str) -> PathBuf {
    capture::capture_path_labelled(ctx, WINE_RUNNER, key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_on_exit_picks_the_exit_end_and_close_waits_for_every_pipe_holder() {
        assert_eq!(game_end_of(true), GameEnd::Exit);
        assert_eq!(game_end_of(false), GameEnd::Close);
        assert_eq!(post_exit_of(true), PostExit::Grace(EXIT_DRAIN_GRACE));
        assert_eq!(post_exit_of(false), PostExit::UntilClosed);
    }

    #[test]
    fn the_args_read_the_options_the_87_struct_ignored_and_refuse_an_unknown_key() {
        let args: LaunchWineCommandArgs = serde_json::from_value(json!({
            "commandParts": ["game.exe"],
            "options": { "wrappers": ["gamemoderun"], "trackKey": "app", "env": { "A": "1" } },
            "resolveOnExit": true,
            "spawnClass": "game",
            "observe": true,
            "streamId": "s-1",
            "logTargets": [],
            "logMessagePrefix": "Backend"
        }))
        .expect("reads");
        assert_eq!(args.spawn_class, SpawnClassArg::Game);
        assert!(args.resolve_on_exit && args.observe);
        let base = args.to_base();
        assert_eq!(
            base.options.expect("options").track_key.as_deref(),
            Some("app")
        );
        let bad = serde_json::from_value::<LaunchWineCommandArgs>(
            json!({ "commandParts": [], "shell": "sh -c" }),
        );
        assert!(bad.is_err());
    }

    #[test]
    fn the_result_carries_a_code_key_only_when_something_ran() {
        let refused = WineLaunchResult {
            stderr: "Invalid wine".into(),
            ..WineLaunchResult::default()
        };
        assert_eq!(
            refused.to_json(),
            json!({ "stdout": "", "stderr": "Invalid wine" })
        );
        let failed = WineLaunchResult {
            ran: true,
            ..WineLaunchResult::default()
        };
        assert_eq!(
            failed.to_json(),
            json!({ "stdout": "", "stderr": "", "code": null })
        );
    }
}
