//! `runWineCommand` (`commandRunner.ts`): the prefix check, the environment merge and the spawn of
//! one wine command, and `run_wine_command_for_game` (`runWineCommandOnGame`,
//! `runWineCommandForPendingInstall`): the Steam, native and command-shape guards in front of it.
//!
//! The child is spawned through `ctx.proc` (the `SpecRunner` seam, `SpawnClass::Helper` in the app) as
//! an argv array, never a shell, with the merged environment replacing the inherited one, its output
//! capped at [`MAX_BUFFER`] per stream, and a shutdown registrant held for the whole run. A launched
//! game's wine is not spawned here (Phase 88): [`prepare_wine_command`] decides the command (the prefix
//! check, the environment, the argv) and `gamelib-launch`'s `launch_wine_command` runs it with its own log
//! writer, tracked registry and exit handling, which closes the three differences from the TS in
//! `golden/wine_command/deltas.json`.

use super::env::{build_wine_env_vars, setup_env_vars, EnvNote, GameSettingsView, WineEnvPaths};
use super::prefix::verify_wine_prefix;
use super::valid::valid_wine;
use super::{js_join, WineHost, WineKind};
use crate::ctx::WineCtx;
use crate::manager::{log_error, log_warn};
use gamelib_core::process::{ProcSpec, SpecOutput};
use gamelib_engine::ctx::Platform;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// How long `wineserver --wait` gets before the command's own result is returned without it (the
/// TS `WINESERVER_WAIT_TIMEOUT_MS`, 30 minutes).
const WINESERVER_WAIT: Duration = Duration::from_secs(30 * 60);

/// `options` of `WineCommandArgs` that cross the boundary (the log writers and the output callback
/// are the caller's).
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WineCommandOptions {
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    #[serde(default)]
    pub wrappers: Vec<String>,
    #[serde(default)]
    pub track_key: Option<String>,
}

/// `WineCommandArgs`.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WineCommandArgs {
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
}

/// The per-stream cap on the output a wine command returns (stdout and stderr each).
pub const MAX_BUFFER: usize = 4 * 1024 * 1024;

/// `WineCommandResult`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WineCommandResult {
    pub stdout: String,
    pub stderr: String,
    pub code: Option<i32>,
    pub ran: bool,
    /// Either stream went past [`MAX_BUFFER`] and was cut.
    pub truncated: bool,
}

impl WineCommandResult {
    pub fn to_json(&self) -> Value {
        let mut out = json!({ "stdout": self.stdout, "stderr": self.stderr });
        if self.ran {
            out["code"] = json!(self.code);
        }
        out
    }
}

/// The result of a refused or failed command: nothing ran, so no exit code.
fn not_run(stderr: &str) -> WineCommandResult {
    WineCommandResult {
        stderr: stderr.to_string(),
        ..WineCommandResult::default()
    }
}

/// The prefix files a wine of this type needs, joined to the prefix, then the prefix itself.
fn required_prefix_files(settings: &GameSettingsView) -> Vec<PathBuf> {
    let base = [
        "dosdevices",
        "drive_c",
        "system.reg",
        "user.reg",
        "userdef.reg",
    ];
    let mut files: Vec<String> = Vec::new();
    if settings.wine_version.kind == WineKind::Proton {
        files.extend(
            ["pfx.lock", "tracked_files", "version", "config_info"]
                .iter()
                .map(|f| f.to_string()),
        );
        files.extend(base.iter().map(|f| format!("pfx/{f}")));
    } else {
        files.extend(base.iter().map(|f| f.to_string()));
    }
    let prefix = settings.wine_prefix.as_str();
    let mut paths: Vec<PathBuf> = files.iter().map(|f| js_join(&[prefix, f])).collect();
    paths.push(PathBuf::from(prefix));
    paths
}

/// The `PATH` scan of `findExecutableOnPath` for a bare name: the first directory of `PATH` holding a
/// regular file with an execute bit. Only a Linux wine is ever asked (umu is Linux-only).
pub fn find_on_path(name: &str, host: &WineHost) -> Option<PathBuf> {
    let vars = host.env.vars();
    let path = vars.get("PATH").or_else(|| {
        vars.iter()
            .find(|(k, _)| k.eq_ignore_ascii_case("path"))
            .map(|(_, v)| v)
    })?;
    std::env::split_paths(path)
        .filter(|dir| !dir.as_os_str().is_empty())
        .map(|dir| dir.join(name))
        .find(|candidate| is_executable_file(candidate))
}

fn is_executable_file(path: &Path) -> bool {
    let Ok(meta) = std::fs::metadata(path) else {
        return false;
    };
    if !meta.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        meta.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

/// `getUmuPath`: `umu-run` on the `PATH`, else the runtime's own `umu/umu_run.py`.
pub(crate) fn umu_path(ctx: &WineCtx, host: &WineHost) -> PathBuf {
    find_on_path("umu-run", host)
        .unwrap_or_else(|| js_join(&[&ctx.runtime_path.to_string_lossy(), "umu", "umu_run.py"]))
}

/// `isUmuSupported`: Linux, a proton wine, umu not disabled in the settings, and umu present.
pub(crate) fn umu_supported(ctx: &WineCtx, settings: &GameSettingsView, host: &WineHost) -> bool {
    ctx.engine.platform == Platform::Linux
        && settings.wine_version.kind == WineKind::Proton
        && !settings.disable_umu
        && umu_path(ctx, host).exists()
}

/// Spawns `spec` through the seam, ending it on the app's shutdown token, on the caller's cancel and
/// when its future is dropped. Public for the launch variant's `wineserver --wait`.
pub async fn spawn(ctx: &WineCtx, host: &WineHost, mut spec: ProcSpec) -> SpecOutput {
    let run_token = ctx.engine.shutdown.token().child_token();
    spec.cancel = Some(run_token.clone());
    let mut run = ctx.proc.run(spec, None);
    let caller_cancel = async {
        match &host.cancel {
            Some(cancel) => cancel.cancelled().await,
            None => std::future::pending::<()>().await,
        }
    };
    tokio::select! {
        output = &mut run => output,
        () = caller_cancel => {
            // The seam kills the child on its token and answers with what it had read so far.
            run_token.cancel();
            run.await
        }
    }
}

/// One wine command, decided and not yet run: what [`prepare_wine_command`] answers and both the run
/// ([`run_wine_command`]) and the launch variant (`gamelib-launch`, Phase 88) spawn from. Everything the
/// TS `runWineCommand` settles before it calls the runner: the validity test, the merged environment, umu,
/// the proton verb, the wrappers and the argv.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedWine {
    /// What is spawned: the first wrapper, else umu or the wine binary.
    pub program: String,
    /// Its arguments: the wrappers after the first, the runner binary, the proton verb, the caller's parts.
    pub argv: Vec<String>,
    /// The whole environment the child gets (it replaces the inherited one), in key order.
    pub env: Vec<(String, String)>,
    pub cwd: Option<PathBuf>,
    /// The binary of the `Wine Command:` header line a game log starts with (the spawned program).
    pub header_bin: String,
    /// The parts of that line (`argv` joined by a space).
    pub header_parts: String,
    /// The parts of the `Running Wine command:` debug line: the caller's parts after the proton verb and
    /// before the wrappers, joined by a space (the TS logged them at that point).
    pub debug_parts: String,
    /// The wine's `wineserver`, when it has one: `wineserver --wait` follows a waited command.
    pub wineserver: Option<String>,
    pub wait: bool,
    /// The settings' wine prefix: the track key's last fallback and the prefix a wait warning names.
    pub wine_prefix: String,
}

/// Everything `runWineCommand` decides after the prefix check: the validity test, the environment merge,
/// umu, the proton verb, the wrappers and the argv. The caller's lists are only read.
/// `Err` is the TS's early answer (`Invalid wine`, nothing ran).
fn prepare_unchecked(
    ctx: &WineCtx,
    settings: &GameSettingsView,
    args: WineCommandArgs,
    host: &WineHost,
) -> Result<PreparedWine, WineCommandResult> {
    let platform = ctx.engine.platform;
    let wine = &settings.wine_version;

    if !valid_wine(Some(wine), platform, host.darwin_release.as_deref(), &|p| {
        p.exists()
    }) {
        return Err(not_run("Invalid wine"));
    }

    let proton_verb = args.proton_verb.unwrap_or_else(|| "run".to_string());
    let options = args.options.unwrap_or_default();

    // process env, then the options' env, then the two builders, then PROTON_VERB.
    let mut env: BTreeMap<String, String> = host.env.vars().clone();
    env.extend(options.env);
    env.extend(setup_env_vars(
        settings,
        args.game_install_path.as_deref(),
        platform,
        &host.env,
    ));
    let paths = WineEnvPaths {
        flatpak_home: ctx.engine.paths.user_home.clone(),
        runtime_path: ctx.runtime_path.clone(),
    };
    let built = build_wine_env_vars(
        settings,
        args.install_folder_name.as_deref(),
        platform,
        &host.env,
        &paths,
        &|p| p.exists(),
    );
    for note in &built.notes {
        match note {
            EnvNote::WineLibFoldersMissing => log_error(
                ctx,
                "wine library folders are missing, falling back to system libraries",
            ),
            EnvNote::DeprecatedGeWorkaround => log_warn(
                ctx,
                "deprecated Wine-GE/Proton-GE release detected, applying the Steam Input gamepad workaround",
            ),
        }
    }
    env.extend(built.vars);
    env.insert("PROTON_VERB".to_string(), proton_verb.clone());
    if args.ignore_logging {
        env.remove("PROTON_LOG");
    }

    // validWine tests the binary as stored, so a quote here is unreachable for a valid wine; the TS
    // stripped them anyway and so does this.
    let wine_bin = wine.bin.replace('\'', "");
    let umu = umu_supported(ctx, settings, host);
    let runner_bin = if umu {
        umu_path(ctx, host).to_string_lossy().into_owned()
    } else {
        wine_bin
    };

    let mut command_parts = args.command_parts;
    if wine.kind == WineKind::Proton && !umu {
        command_parts.insert(0, proton_verb);
    }
    let debug_parts = command_parts.join(" ");
    let mut wrappers = options.wrappers;
    let mut bin = runner_bin.clone();
    if !wrappers.is_empty() {
        bin = wrappers.remove(0);
        let mut front = wrappers;
        front.push(runner_bin);
        command_parts.splice(0..0, front);
    }

    let cwd = args
        .start_folder
        .filter(|f| !f.is_empty())
        .map(PathBuf::from);
    Ok(PreparedWine {
        header_bin: bin.clone(),
        header_parts: command_parts.join(" "),
        program: bin,
        argv: command_parts,
        env: env.into_iter().collect(),
        cwd,
        debug_parts,
        wineserver: wine.wineserver.clone().filter(|w| !w.is_empty()),
        wait: args.wait,
        wine_prefix: settings.wine_prefix.clone(),
    })
}

/// Spawns a prepared command and then, when it asked to wait and was not cancelled, `wineserver --wait`.
async fn run_prepared(ctx: &WineCtx, prepared: PreparedWine, host: &WineHost) -> WineCommandResult {
    let mut spec = ProcSpec::new("wine-command", prepared.program);
    spec.argv = prepared.argv;
    spec.env = prepared.env.clone();
    spec.replace_env = true;
    spec.cwd = prepared.cwd.clone();
    // A wine command runs as long as the game or installer it hosts: no time limit, ended by the
    // caller's cancel, the app's shutdown or the exit path.
    spec.timeout = None;
    spec.max_buffer = MAX_BUFFER;
    let output = spawn(ctx, host, spec).await;

    let response = WineCommandResult {
        stdout: output.stdout,
        stderr: output.stderr,
        code: output.code,
        ran: true,
        truncated: output.truncated,
    };

    if prepared.wait && !output.cancelled {
        if let Some(wineserver) = prepared.wineserver {
            let mut wait = ProcSpec::new("wine-command", wineserver);
            wait.argv = vec!["--wait".to_string()];
            wait.env = prepared.env;
            wait.replace_env = true;
            wait.cwd = prepared.cwd;
            wait.timeout = Some(WINESERVER_WAIT);
            wait.max_buffer = MAX_BUFFER;
            if spawn(ctx, host, wait).await.timed_out {
                log_warn(
                    ctx,
                    "wineserver --wait did not finish within 30 minutes; returning the command result without waiting further",
                );
            }
        }
    }
    response
}

/// Everything `runWineCommand` does after the prefix check: the validity test, the environment merge,
/// the spawn and the wineserver wait. `verify_wine_prefix` runs this directly (its TS call passed
/// `skipPrefixCheckIKnowWhatImDoing`).
pub(crate) async fn run_unchecked(
    ctx: &WineCtx,
    settings: &GameSettingsView,
    args: WineCommandArgs,
    host: &WineHost,
) -> WineCommandResult {
    // Held until this function returns: the exit path waits for a running wine command.
    let _registrant = ctx.engine.shutdown.register("wine-command");
    match prepare_unchecked(ctx, settings, args, host) {
        Ok(prepared) => run_prepared(ctx, prepared, host).await,
        Err(refusal) => refusal,
    }
}

/// `runWineCommand` up to the spawn: the prefix is created when it is missing (unless skipped, or
/// crossover), then the wine is validated and the environment, argv and cwd are decided. `Err` is the
/// TS's early answer, an empty result naming why nothing ran. Shared by [`run_wine_command`] and the
/// launch variant of Phase 88 (D-22: extend, never re-port), which spawns the command its own way.
pub async fn prepare_wine_command(
    ctx: &WineCtx,
    args: WineCommandArgs,
    host: &WineHost,
) -> Result<PreparedWine, WineCommandResult> {
    // No settings and no default to fall back on is the same refusal as an unusable wine.
    let Some(settings) = args
        .game_settings
        .clone()
        .or_else(|| host.default_settings.clone())
    else {
        return Err(not_run("Invalid wine"));
    };

    if !args.skip_prefix_check && settings.wine_version.kind != WineKind::Crossover {
        let prefix_complete = required_prefix_files(&settings).iter().all(|p| p.exists());
        if !prefix_complete {
            log_warn(
                ctx,
                "Required prefix files are missing, running `verifyWinePrefix` to create prefix",
            );
            if std::fs::create_dir_all(&settings.wine_prefix).is_err() {
                log_error(ctx, "unable to create the wine prefix directory");
                return Err(not_run("Unable to create the wine prefix"));
            }
            if let Err(reason) = verify_wine_prefix(ctx, &settings, host).await {
                return Err(not_run(&reason));
            }
        }
    }
    prepare_unchecked(ctx, &settings, args, host)
}

/// Runs one wine command: creates the prefix when it is missing (unless skipped, or crossover), then
/// validates the wine, builds the environment and runs it (`runWineCommand`).
pub async fn run_wine_command(
    ctx: &WineCtx,
    args: WineCommandArgs,
    host: &WineHost,
) -> WineCommandResult {
    let prepared = match prepare_wine_command(ctx, args, host).await {
        Ok(prepared) => prepared,
        Err(refusal) => return refusal,
    };
    // Held until this function returns: the exit path waits for a running wine command.
    let _registrant = ctx.engine.shutdown.register("wine-command");
    run_prepared(ctx, prepared, host).await
}

/// The most entries a renderer's `commandParts` may carry (87-33). The TS guard (`assertCommandParts`)
/// checked only the shape; the bound is the plan's hardening (T-87-77), far above any real argv.
pub const MAX_COMMAND_PARTS: usize = 256;

/// The most characters one entry of `commandParts` may carry (87-33): a path with room to spare.
pub const MAX_COMMAND_PART_CHARS: usize = 4096;

/// A `commandParts` that failed the shape guard; the text is the guard's (no argument text in it).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandShapeError(pub String);

impl std::fmt::Display for CommandShapeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for CommandShapeError {}

/// JavaScript's `typeof` of a decoded JSON value.
fn js_typeof(value: &Value) -> &'static str {
    match value {
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Null | Value::Object(_) | Value::Array(_) => "object",
    }
}

/// `assertCommandParts` (the renderer's `commandParts` before it can reach a child's argv): a
/// non-empty array of strings, at most [`MAX_COMMAND_PARTS`] entries of at most
/// [`MAX_COMMAND_PART_CHARS`] characters each. Shape and size only, never content: an argument with
/// spaces or an apostrophe (`Sid Meier's Civilization V`) is a valid element.
pub fn assert_command_parts(parts: &Value) -> Result<Vec<String>, CommandShapeError> {
    let shape = |message: String| CommandShapeError(format!("runWineCommandForGame: {message}"));
    let Value::Array(items) = parts else {
        return Err(shape(format!(
            "commandParts must be an array, got {}",
            js_typeof(parts)
        )));
    };
    if items.is_empty() {
        return Err(shape("commandParts must not be empty".to_string()));
    }
    if items.len() > MAX_COMMAND_PARTS {
        return Err(shape(format!(
            "commandParts must not exceed {MAX_COMMAND_PARTS} entries, got {}",
            items.len()
        )));
    }
    let Some(strings) = items
        .iter()
        .map(|item| item.as_str().map(str::to_string))
        .collect::<Option<Vec<String>>>()
    else {
        return Err(shape(
            "commandParts must be an array of strings".to_string(),
        ));
    };
    if strings
        .iter()
        .any(|part| part.chars().count() > MAX_COMMAND_PART_CHARS)
    {
        return Err(shape(format!(
            "each commandParts entry must not exceed {MAX_COMMAND_PART_CHARS} characters"
        )));
    }
    Ok(strings)
}

/// The arguments of `run_wine_command_for_game` (`runWineCommandOnGame` and
/// `runWineCommandForPendingInstall`): the game's facts the caller read from the library and the
/// Steam bridge, the tool settings the caller resolved (or why there are none), and the command.
/// Strict: an unknown key is a bad argument.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ForGameArgs {
    pub runner: String,
    pub app_name: String,
    /// The settings the command runs in (`resolveGameToolSettings`, with the bottle ensured).
    #[serde(default)]
    pub settings: Option<GameSettingsView>,
    /// Instead of `settings`: no usable wine environment, and the resolver's reason word.
    #[serde(default)]
    pub unavailable: Option<String>,
    /// `isSteamWineToolsEligible`: the Steam title has its own ready per-game bottle.
    #[serde(default)]
    pub steam_eligible: bool,
    /// `game.isNative()`.
    #[serde(default)]
    pub is_native: bool,
    /// `getGameInfo().folder_name`.
    #[serde(default)]
    pub folder_name: Option<String>,
    /// `getGameInfo().install.install_path`; absent when the game info carries no install.
    #[serde(default)]
    pub install_path: Option<String>,
    /// A sideload "Run installer" before the game is in the library (CR-04).
    #[serde(default)]
    pub pending_install: bool,
    /// The renderer's command, any JSON: [`assert_command_parts`] judges it.
    pub command_parts: Value,
    #[serde(default)]
    pub wait: bool,
    #[serde(default)]
    pub proton_verb: Option<String>,
    #[serde(default)]
    pub start_folder: Option<String>,
}

/// Why `run_wine_command_for_game` did not run anything and did not just refuse.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ForGameError {
    /// The `commandParts` shape guard (T-87-77); no child was started.
    CommandShape(CommandShapeError),
    /// Both or neither of `settings` and `unavailable`: the caller did not say what the game runs in.
    Ambiguous,
}

/// The settings a for-game command runs in, from the caller's two fields.
fn for_game_settings(args: &ForGameArgs) -> Result<Result<GameSettingsView, String>, ForGameError> {
    match (&args.settings, &args.unavailable) {
        (Some(settings), None) => Ok(Ok(settings.clone())),
        (None, Some(reason)) => Ok(Err(reason.clone())),
        _ => Err(ForGameError::Ambiguous),
    }
}

/// `runWineCommandOnGame` and `runWineCommandForPendingInstall` (D-25 (c)): the guards in the TS
/// order, then `run_wine_command` in the game's own bottle. Every guard refuses with the TS's empty
/// result and one log line, before any child is started:
///
/// - the `commandParts` shape guard first ([`assert_command_parts`], an error, not a refusal);
/// - a Steam title without its own per-game bottle (Pitfall 5, `steam_eligible` false), a native game
///   and a game whose info carries no install path (260907-f2g) never reach wine, whatever the OS;
/// - no usable wine environment (the resolver's reason is logged; the command never is);
/// - a pending install is sideload only, and runs `runinprefix` with the caller's `wait`.
///
/// On Windows the command is the program itself, spawned with its arguments (the TS handler's
/// Windows branch; there is no wine there), still an argv array and never a shell.
pub async fn run_wine_command_for_game(
    ctx: &WineCtx,
    args: ForGameArgs,
    host: &WineHost,
) -> Result<WineCommandResult, ForGameError> {
    let parts = assert_command_parts(&args.command_parts).map_err(ForGameError::CommandShape)?;
    let settings = for_game_settings(&args)?;
    let empty = Ok(WineCommandResult::default());

    if ctx.engine.platform == Platform::Windows {
        let (program, rest) = parts.split_first().expect("a non-empty command");
        let mut spec = ProcSpec::new("wine-command", program.clone());
        spec.argv = rest.to_vec();
        spec.max_buffer = MAX_BUFFER;
        let output = spawn(ctx, host, spec).await;
        return Ok(WineCommandResult {
            stdout: output.stdout,
            stderr: output.stderr,
            code: output.code,
            ran: true,
            truncated: output.truncated,
        });
    }

    if args.pending_install {
        if args.runner != "sideload" {
            log_error(
                ctx,
                &format!(
                    "runWineCommandForPendingInstall refused runner {}: sideload only",
                    args.runner
                ),
            );
            return empty;
        }
        let settings = match settings {
            Ok(settings) => settings,
            Err(reason) => {
                log_error(
                    ctx,
                    &format!(
                        "runWineCommand not run for pending install {}: no usable Wine environment ({reason})",
                        args.app_name
                    ),
                );
                return empty;
            }
        };
        let command = WineCommandArgs {
            game_settings: Some(settings),
            command_parts: parts,
            wait: args.wait,
            proton_verb: Some("runinprefix".to_string()),
            ..WineCommandArgs::default()
        };
        return Ok(run_wine_command(ctx, command, host).await);
    }

    // Pitfall 5 (Phase 17): a Steam title shares bottles in two layouts, so a wine action is never
    // dispatched against it unless it has its own ready per-game bottle. Before the native check, so it
    // applies whatever the platform.
    if args.runner == "steam" && !args.steam_eligible {
        log_error(
            ctx,
            "runWineCommand called on a Steam game with no per-game bottle (Pitfall 5)",
        );
        return empty;
    }
    if args.is_native {
        log_error(ctx, "runWineCommand called on native game!");
        return empty;
    }
    // `SteamGame.getGameInfo()` is `{}` on a double cache miss: no install path is a handled no-op, not
    // a silently wrong argument. Runner and appName are logged, never the path.
    let Some(install_path) = args.install_path.as_deref().filter(|p| !p.is_empty()) else {
        log_error(
            ctx,
            &format!(
                "runWineCommand called on {} game {} whose GameInfo carries no resolved install path",
                args.runner, args.app_name
            ),
        );
        return empty;
    };
    let settings = match settings {
        Ok(settings) => settings,
        Err(reason) => {
            log_error(
                ctx,
                &format!(
                    "runWineCommand not run for {}: no usable Wine environment ({reason})",
                    args.app_name
                ),
            );
            return empty;
        }
    };
    let command = WineCommandArgs {
        game_settings: Some(settings),
        install_folder_name: args.folder_name.clone(),
        game_install_path: Some(install_path.to_string()),
        command_parts: parts,
        wait: args.wait,
        proton_verb: args.proton_verb.clone(),
        start_folder: args.start_folder.clone(),
        ..WineCommandArgs::default()
    };
    Ok(run_wine_command(ctx, command, host).await)
}
