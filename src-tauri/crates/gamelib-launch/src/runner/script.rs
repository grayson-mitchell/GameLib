//! `runScriptForGame` (88.2-13, D-02, D-21, D-22): a game's pre or post launch script, run as a Helper.
//!
//! A launch script is user-authored code the settings name by path. It runs as the program itself with an
//! empty argv (never through a shell), in the game's install folder, with the `HEROIC_GAME_*` block the TS
//! built (`HEROIC_GAME_SETTINGS` and `HEROIC_GAME_INFO` are the JSON text the sidecar stringified, handed over
//! verbatim) and then the host environment over it, so an inherited variable replaces a launcher one. The run
//! has no time limit (the script is the before or after hook of a game session) and resolves when the script
//! exits, not when every background process it started lets go of the pipes ([`EXIT_DRAIN_GRACE`] after the
//! exit, the TS `resolveOn: 'exit'`). A non-zero exit is not a failure: the TS resolved `true` for it, and so
//! does this.
//!
//! With verbose logs on, every chunk of either stream goes raw to the game's log writer (the handed-off
//! target), and a failure to run is written there first as an error line. With them off the script's output is
//! read and dropped and nothing is written to any log.
//!
//! **Two-profile rule (D-22): the named real-profile arm.** The script's `HOME` (and every other inherited
//! variable) is whatever the shell passes as `host.env`: the operator's real profile in the app, because a
//! user's launch script expects the user's own `HOME`, and a `FakeHome` in every test. Nothing here fakes or
//! scrubs it.
//!
//! The script's own path and the settings and info JSON reach a child's environment and the game's log only,
//! never `gamelib.log`: this run writes no general log line at all.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use gamelib_core::process::{PostExit, ProcSpec};
use gamelib_log::{Entry, Level, Prefix};
use serde::{Deserialize, Serialize};

use super::call_runner::{RunnerHost, RUNNER_READ_CHUNK};
use super::lock;
use super::stream::{LogHandOff, LogTargets};
use crate::ctx::LaunchCtx;
use crate::game::end::EXIT_DRAIN_GRACE;

/// Which end of the game session the script belongs to (`HEROIC_GAME_SCRIPT_STAGE`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ScriptStage {
    Before,
    After,
}

impl ScriptStage {
    pub fn as_str(self) -> &'static str {
        match self {
            ScriptStage::Before => "before",
            ScriptStage::After => "after",
        }
    }
}

/// The text a script run answers when GameLib is closing and the script was stopped with it.
const STOPPED: &str = "the launch script was stopped because GameLib is closing";

/// One script run (`launch_script_run`'s first argument). Strict: an unknown key is a bad argument.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScriptRunArgs {
    /// `gameSettings[`${stage}LaunchScriptPath`]`: the program to run.
    pub script_path: String,
    pub stage: ScriptStage,
    pub app_name: String,
    /// `gameInfo.install.executable` (a variable the TS left out when the game had none).
    #[serde(default)]
    pub executable: Option<String>,
    /// `gameSettings.winePrefix`.
    #[serde(default)]
    pub prefix: Option<String>,
    pub runner: String,
    pub title: String,
    /// `gameInfo.install.install_path`: the script's working directory.
    #[serde(default)]
    pub install_path: Option<String>,
    /// `JSON.stringify(gameSettings)`, as the sidecar wrote it.
    pub settings_json: String,
    /// `JSON.stringify(gameInfo)`, as the sidecar wrote it.
    pub info_json: String,
    /// `gameSettings.verboseLogs`.
    #[serde(default)]
    pub verbose: bool,
    /// The game's log writer, as a typed target. Only read when `verbose` is on.
    #[serde(default)]
    pub log_target: Option<LogHandOff>,
}

/// The script's environment: the `HEROIC_GAME_*` block, then the host's environment over it.
fn script_env(args: &ScriptRunArgs, host: &RunnerHost) -> Vec<(String, String)> {
    let mut env: BTreeMap<String, String> = BTreeMap::new();
    env.insert("HEROIC_GAME_APP_NAME".into(), args.app_name.clone());
    if let Some(executable) = &args.executable {
        env.insert("HEROIC_GAME_EXEC".into(), executable.clone());
    }
    if let Some(prefix) = &args.prefix {
        env.insert("HEROIC_GAME_PREFIX".into(), prefix.clone());
    }
    env.insert("HEROIC_GAME_RUNNER".into(), args.runner.clone());
    env.insert(
        "HEROIC_GAME_SCRIPT_STAGE".into(),
        args.stage.as_str().into(),
    );
    env.insert("HEROIC_GAME_TITLE".into(), args.title.clone());
    env.insert("HEROIC_GAME_SETTINGS".into(), args.settings_json.clone());
    env.insert("HEROIC_GAME_INFO".into(), args.info_json.clone());
    for (key, value) in &host.env {
        env.insert(key.clone(), value.clone());
    }
    env.into_iter().collect()
}

/// `runScriptForGame`: runs the script and answers `Ok(true)` when it ran to an exit (whatever its code), or
/// `Err(text)` when it could not be started. Never answers `Ok(false)`.
pub async fn run_script_for_game(
    ctx: &LaunchCtx,
    args: ScriptRunArgs,
    host: &RunnerHost,
) -> Result<bool, String> {
    let targets = Arc::new(Mutex::new(if args.verbose {
        LogTargets::resolve(args.log_target.clone().into_iter().collect())
    } else {
        LogTargets::default()
    }));

    // Held for the whole run: the exit path waits for a running script (or cancels it).
    let _registrant = ctx.engine.shutdown.register("launch-script");
    let abort = ctx.engine.shutdown.token().child_token();

    let mut spec = ProcSpec::new("launch-script", args.script_path.clone());
    spec.argv = Vec::new();
    spec.env = script_env(&args, host);
    spec.replace_env = true;
    spec.cwd = args.install_path.as_ref().map(PathBuf::from);
    // A launch script runs as long as the user wrote it to.
    spec.timeout = None;
    // The output goes to the game's log (verbose) or nowhere; the run keeps none of it.
    spec.max_buffer = 0;
    spec.cancel = Some(abort.clone());
    spec.hide_window = false;
    spec.read_chunk = RUNNER_READ_CHUNK;
    spec.post_exit = PostExit::Grace(EXIT_DRAIN_GRACE);

    let chunk_targets = Arc::clone(&targets);
    let chunk_log = Arc::clone(&ctx.log_sink);
    let sink: gamelib_core::process::ChunkSink = Box::new(move |_pipe, text| {
        let batches = lock(&chunk_targets).batches(|_| vec![Entry::Raw(text.to_string())]);
        if !batches.is_empty() {
            chunk_log.submit(batches);
        }
    });

    let out = ctx.engine.proc.run_streamed(spec, sink).await;

    // The spawn seam answers no code, no signal and no flag when the program could not be started.
    if out.code.is_none() && out.signal.is_none() && !out.cancelled && !out.timed_out {
        let message = out.stderr;
        let (ts, tz) = ctx.log_sink.stamp();
        let batches = lock(&targets).batches(|_| {
            vec![Entry::Line {
                ts,
                tz,
                level: Level::Error,
                prefix: Prefix::General,
                msg: format!("Error: {message}"),
            }]
        });
        if !batches.is_empty() {
            ctx.log_sink.submit(batches);
        }
        return Err(message);
    }
    if out.cancelled {
        return Err(STOPPED.to_string());
    }
    Ok(true)
}
