//! `runWineCommand` (`commandRunner.ts`): the prefix check, the environment merge and the spawn of
//! one wine command.
//!
//! The child is spawned through `ctx.proc` (the `SpecRunner` seam, `SpawnClass::Helper` in the app) as
//! an argv array, never a shell, with the merged environment replacing the inherited one, its output
//! capped at [`MAX_BUFFER`] per stream, and a shutdown registrant held for the whole run. A launched
//! game's wine is not spawned here (Phase 88): the launch path owns its log writer, its tracked
//! registry and its exit handling. The differences from the TS are in `golden/wine_command/deltas.json`.

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
fn find_on_path(name: &str, host: &WineHost) -> Option<PathBuf> {
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
/// when its future is dropped.
async fn spawn(ctx: &WineCtx, host: &WineHost, mut spec: ProcSpec) -> SpecOutput {
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
    let platform = ctx.engine.platform;
    let wine = &settings.wine_version;

    if !valid_wine(Some(wine), platform, host.darwin_release.as_deref(), &|p| {
        p.exists()
    }) {
        return not_run("Invalid wine");
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
    let mut wrappers = options.wrappers;
    let mut bin = runner_bin.clone();
    if !wrappers.is_empty() {
        bin = wrappers.remove(0);
        let mut front = wrappers;
        front.push(runner_bin);
        command_parts.splice(0..0, front);
    }

    let env_pairs: Vec<(String, String)> = env.into_iter().collect();
    let cwd = args
        .start_folder
        .filter(|f| !f.is_empty())
        .map(PathBuf::from);
    let mut spec = ProcSpec::new("wine-command", bin);
    spec.argv = command_parts;
    spec.env = env_pairs.clone();
    spec.replace_env = true;
    spec.cwd = cwd.clone();
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

    if args.wait && !output.cancelled {
        if let Some(wineserver) = wine.wineserver.as_deref().filter(|w| !w.is_empty()) {
            let mut wait = ProcSpec::new("wine-command", wineserver);
            wait.argv = vec!["--wait".to_string()];
            wait.env = env_pairs;
            wait.replace_env = true;
            wait.cwd = cwd;
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

/// Runs one wine command: creates the prefix when it is missing (unless skipped, or crossover), then
/// validates the wine, builds the environment and runs it (`runWineCommand`).
pub async fn run_wine_command(
    ctx: &WineCtx,
    args: WineCommandArgs,
    host: &WineHost,
) -> WineCommandResult {
    // No settings and no default to fall back on is the same refusal as an unusable wine.
    let Some(settings) = args
        .game_settings
        .clone()
        .or_else(|| host.default_settings.clone())
    else {
        return not_run("Invalid wine");
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
                return not_run("Unable to create the wine prefix");
            }
            if let Err(reason) = verify_wine_prefix(ctx, &settings, host).await {
                return not_run(&reason);
            }
        }
    }
    run_unchecked(ctx, &settings, args, host).await
}
