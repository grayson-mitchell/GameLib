//! The Winetricks tool (`createWinetricks` in `tools/index.ts`): the script download, one winetricks
//! run with its streamed output classified line by line, the host dependency probe, the wine-version
//! probe and the install with its single-flight slot. Replayed against `golden/winetricks`.
//!
//! A run is one [`run_with_args`]: the game's settings resolved by the caller, the wine checked, the
//! script downloaded when missing, the environment built for the platform, the child started through
//! the spawn seam as a Helper (`SpecRunner::run_streamed`, so BOTH pipes arrive as raw chunks: curl
//! redraws its meter on stderr with a bare `\r`), and a state machine that classifies every line,
//! pushes `progressOfWinetricks` once a second while something changed, and ends with one `Done`.
//! The dependency probe and (for `list-all`) the wine-version probe run beside the child, as the TS
//! fire-and-forget calls did, but are joined: the function returns with every report final.
//!
//! A log line is the TS text with two deliberate differences: the program is named by its file name
//! (never its path) and an I/O failure is a category word (never Node's error text, which names paths).
//! Winetricks' own output lines are logged verbatim, as before: they are an external tool's
//! diagnostics, the one place the engine log carries free text. Wine's debug-channel noise is not
//! logged at all (the engine log has no debug level), though it still reaches the renderer.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use gamelib_core::process::{ChunkSink, Pipe, ProcSpec, SpecOutput};
use gamelib_engine::ctx::Platform;
use gamelib_engine::fetch::FetchRequest;
use serde_json::{json, Map, Value};
use tokio::time::{interval_at, Instant, MissedTickBehavior};

use super::classify::{
    append_log_line, classify_line, is_missing_regedit_file, is_unsupported_wine_version,
    parse_unsupported_wine_version, parse_wine_version_output, split_output_chunk, LineKind,
    LogLine, MAX_BUFFERED_LINES,
};
use super::guard::filter_visible_catalog;
use super::list_parse::{parse_list_all, Component};
use super::metadata::ScriptMetadata;
use super::{
    catalog_cache_key, is_windows, Session, Target, ToolSettings, DEPENDENCIES, SCRIPT_MAX_AGE_MS,
    SCRIPT_URL,
};
use crate::ctx::WineCtx;
use crate::manager::{log_error, log_info, log_warn};
use crate::wine_cmd::command::{umu_path, umu_supported};
use crate::wine_cmd::env::GameSettingsView;
use crate::wine_cmd::prefix::{tool_prefix, ToolPrefix};
use crate::wine_cmd::{js_dirname, js_join, WineInstallation, WineKind};

/// How long a `which` probe gets before it counts as missing.
const WHICH_TIMEOUT: Duration = Duration::from_secs(5);
/// How long `wine --version` gets.
const WINE_VERSION_TIMEOUT: Duration = Duration::from_secs(5);
/// The most `wine --version` may print.
const WINE_VERSION_MAX_BUFFER: usize = 16 * 1024;
/// How often a changed progress state is pushed to the renderer.
const PROGRESS_INTERVAL: Duration = Duration::from_secs(1);
/// The most messages one `progressOfWinetricks` carries, so storage and the renderer stay light.
const MAX_MESSAGES: usize = 100;

/// What an install ended as (`WinetricksInstallOutcome`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstallOutcome {
    Installed,
    Failed,
    /// Another component was already installing; nothing ran.
    Refused,
}

impl InstallOutcome {
    pub fn as_str(self) -> &'static str {
        match self {
            InstallOutcome::Installed => "installed",
            InstallOutcome::Failed => "failed",
            InstallOutcome::Refused => "refused",
        }
    }
}

/// `<tools>/winetricks`.
pub fn script_path(ctx: &WineCtx) -> PathBuf {
    ctx.engine.paths.tools_path.join("winetricks")
}

/// A file name for a log line (never the whole path).
fn name_of(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "winetricks".to_string())
}

/// The category word of an I/O failure.
fn io_category(error: &std::io::Error) -> &'static str {
    match error.kind() {
        std::io::ErrorKind::NotFound => "not-found",
        std::io::ErrorKind::PermissionDenied => "permission-denied",
        _ => "io",
    }
}

fn mtime_ms(path: &Path) -> Option<u64> {
    let modified = std::fs::metadata(path).ok()?.modified().ok()?;
    let since = modified.duration_since(std::time::UNIX_EPOCH).ok()?;
    u64::try_from(since.as_millis()).ok()
}

/// `Winetricks.download`: fetches the script to `<tools>/winetricks` and makes it executable. Does
/// nothing on Windows or offline; a script younger than 7 days is not fetched again (the file is still
/// made executable); a failed request leaves what is on disk; any failure is one logged warning, never
/// an error to the caller.
pub async fn download_script(session: &Session<'_>) {
    let ctx = session.ctx;
    if is_windows(ctx) || !ctx.engine.is_online() {
        return;
    }
    let path = script_path(ctx);
    log_info(ctx, "Downloading Winetricks");
    if let Err(category) = fetch_script(ctx, &path).await {
        log_warn(ctx, &format!("Error Downloading Winetricks: {category}"));
    }
}

async fn fetch_script(ctx: &WineCtx, path: &Path) -> Result<(), &'static str> {
    let fresh =
        mtime_ms(path).is_some_and(|mtime| mtime + SCRIPT_MAX_AGE_MS >= ctx.engine.clock.now_ms());
    if fresh {
        // The TS read the cached script back; a file that cannot be read is the same failure.
        std::fs::File::open(path).map_err(|e| io_category(&e))?;
    } else {
        let request = FetchRequest::get(SCRIPT_URL).gamelib_agent(&ctx.engine.app_version);
        // A failed request (network or a non-2xx status) is not an error here: axios handed the
        // TS an error object it never looked at, and the script already on disk stayed.
        if let Ok(response) = ctx.fetch.get(request).await {
            if let Ok(response) = response.error_for_status() {
                write_script(path, &response.body).map_err(|e| io_category(&e))?;
            }
        }
    }
    make_executable(path).map_err(|e| io_category(&e))
}

/// Writes through a sibling file and a rename, so a script is never half written when it is next run.
fn write_script(path: &Path, body: &[u8]) -> std::io::Result<()> {
    let mut part = path.as_os_str().to_os_string();
    part.push(".part");
    let part = PathBuf::from(part);
    std::fs::write(&part, body)?;
    std::fs::rename(&part, path).inspect_err(|_| {
        let _ = std::fs::remove_file(&part);
    })
}

fn make_executable(path: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))
    }
    #[cfg(not(unix))]
    {
        std::fs::metadata(path).map(|_| ())
    }
}

/// `getWineFromProton`: the prefix and the wine winetricks runs with. A CrossOver target runs in its
/// bottle's directory (87-64, F3: [`tool_prefix`]), never in the stored `winePrefix`, and a bottle that
/// is not one safe name has no prefix (`None`: nothing runs). A Proton umu does not run is unpacked to
/// its own `files/bin/wine` (or `dist/` for Proton 7 and below) with the prefix's `pfx` subdirectory;
/// anything else is as the settings say.
pub fn wine_from_proton(
    session: &Session<'_>,
    settings: &GameSettingsView,
) -> Option<(String, WineInstallation)> {
    let wine = settings.wine_version.clone();
    match tool_prefix(session.ctx, settings) {
        ToolPrefix::Bottle(dir) => return Some((dir, wine)),
        ToolPrefix::UnsafeBottle => return None,
        ToolPrefix::Stored => {}
    }
    if wine.kind != WineKind::Proton || umu_supported(session.ctx, settings, session.host) {
        return Some((settings.wine_prefix.clone(), wine));
    }
    let prefix = js_join(&[&settings.wine_prefix, "pfx"])
        .to_string_lossy()
        .into_owned();
    let base = js_dirname(&wine.bin);
    for dist in ["dist", "files"] {
        let bin = js_join(&[&base, dist, "bin", "wine"]);
        if !bin.exists() {
            continue;
        }
        let server = js_join(&[&base, dist, "bin", "wineserver"]);
        return Some((
            prefix,
            WineInstallation {
                kind: WineKind::Wine,
                bin: bin.to_string_lossy().into_owned(),
                wineserver: server
                    .exists()
                    .then(|| server.to_string_lossy().into_owned()),
                ..wine
            },
        ));
    }
    log_error(
        session.ctx,
        &format!(
            "Proton {} has an abnormal structure, unable to supply Wine binary!",
            wine.name
        ),
    );
    Some((settings.wine_prefix.clone(), wine))
}

/// The environment winetricks runs in: the host's, the launcher's two builders, the prefix and the
/// platform's `PATH` (and the Linux umu variables or the macOS wine variables).
fn build_env(
    session: &Session<'_>,
    settings: &GameSettingsView,
    app_name: &str,
    prefix: &str,
    wine: &WineInstallation,
) -> BTreeMap<String, String> {
    let ctx = session.ctx;
    let mut env = session.host.env.vars().clone();
    let host_path = session.host.env.get("PATH");
    let winepath = js_dirname(&wine.bin);
    if ctx.engine.platform == Platform::Mac {
        // FIXME of the TS kept: the builders see the settings as stored, not the unpacked wine.
        env.extend(session.launcher.setup_env_vars(ctx, settings));
        env.extend(
            session
                .launcher
                .setup_wine_env_vars(ctx, settings, app_name),
        );
        env.insert("WINEPREFIX".into(), prefix.to_string());
        env.insert(
            "WINESERVER".into(),
            js_join(&[&winepath, "wineserver"])
                .to_string_lossy()
                .into_owned(),
        );
        env.insert("WINE".into(), wine.bin.clone());
        env.insert("WINE64".into(), wine.bin.clone());
        env.insert(
            "PATH".into(),
            match host_path {
                Some(path) => format!("/opt/local/bin:/opt/homebrew/bin:{path}"),
                None => "/opt/local/bin:/opt/homebrew/bin".to_string(),
            },
        );
    } else {
        // Winetricks must run with an actual `wine` binary, so the builders see the settings with
        // the always-wine installation (`WINEESYNC=1` rather than `PROTON_NO_ESYNC=0`).
        let mut with_wine = settings.clone();
        with_wine.wine_version = wine.clone();
        env.extend(session.launcher.setup_env_vars(ctx, &with_wine));
        env.extend(
            session
                .launcher
                .setup_wine_env_vars(ctx, &with_wine, app_name),
        );
        env.insert("WINEPREFIX".into(), prefix.to_string());
        env.insert(
            "PATH".into(),
            match host_path {
                Some(path) => format!("{winepath}:{path}"),
                None => winepath,
            },
        );
        env.insert("GAMEID".into(), "umu-0".into());
        env.insert("UMU_RUNTIME_UPDATE".into(), "0".into());
    }
    env
}

fn env_pairs(env: &BTreeMap<String, String>) -> Vec<(String, String)> {
    env.iter().map(|(k, v)| (k.clone(), v.clone())).collect()
}

/// `Winetricks.checkDependencies`: probes the host tools winetricks needs. A probe that does not run
/// counts as missing and never escapes. `append` receives one notice per missing tool (and the macOS
/// setup pointer); the sorted missing subset (an empty one clears an earlier record) feeds the
/// environment report once per check.
pub async fn check_dependencies(
    session: &Session<'_>,
    runner: &str,
    app_name: &str,
    envs: &BTreeMap<String, String>,
    append: &mut (dyn FnMut(String) + Send),
) {
    let ctx = session.ctx;
    let mut missing: Vec<String> = Vec::new();
    for dependency in DEPENDENCIES {
        let mut spec = ProcSpec::new("winetricks-which", "which");
        spec.argv = vec![dependency.to_string()];
        spec.env = env_pairs(envs);
        spec.replace_env = true;
        spec.timeout = Some(WHICH_TIMEOUT);
        spec.cancel = Some(ctx.engine.shutdown.token().child_token());
        let output = ctx.proc.run(spec, None).await;
        // Not found is a non-zero exit, a timeout (or a probe that never started) is as good as missing.
        if output.timed_out || output.code != Some(0) {
            missing.push(dependency.to_string());
            let message = format!(
                "{dependency} not installed! Winetricks might fail to install some packages or even open"
            );
            log_warn(ctx, &message);
            append(message);
        }
    }

    if !missing.is_empty() && ctx.engine.platform == Platform::Mac {
        // Intentionally Heroic's wiki page: GameLib has no equivalent page (quick 261115-tk8).
        let message = "Check https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/wiki/Using-Heroic-on-a-Mac-computer#winetricks-setup to install the missing dependencies.".to_string();
        log_warn(ctx, &message);
        append(message);
    }

    missing.sort();
    ctx.tools
        .winetricks_env
        .record_missing_dependencies(runner, app_name, &missing);
}

/// `readWineVersionOutput`: `wine --version`, or why it could not be read.
async fn read_wine_version_output(
    session: &Session<'_>,
    wine_bin: &str,
    envs: &BTreeMap<String, String>,
) -> Result<String, String> {
    let ctx = session.ctx;
    let mut env = envs.clone();
    env.insert("WINEDEBUG".into(), "-all".into());
    let mut spec = ProcSpec::new("winetricks-wine-version", wine_bin);
    spec.argv = vec!["--version".to_string()];
    spec.env = env_pairs(&env);
    spec.replace_env = true;
    spec.timeout = Some(WINE_VERSION_TIMEOUT);
    spec.max_buffer = WINE_VERSION_MAX_BUFFER;
    spec.cancel = Some(ctx.engine.shutdown.token().child_token());
    let output = ctx.proc.run(spec, None).await;
    if output.timed_out {
        return Err("wine --version timed out".to_string());
    }
    match output.code {
        Some(0) => {}
        Some(code) => return Err(format!("wine --version exited with code {code}")),
        None => return Err("wine --version did not run".to_string()),
    }
    if output.truncated {
        return Err("wine --version output exceeded the buffer".to_string());
    }
    Ok(output.stdout)
}

/// `Winetricks.checkWineVersion` (261011-iel, D-16): `winetricks list-all` is the one run where
/// winetricks skips its own unsupported-wine check, so this probes the bottle's own wine and records
/// whether winetricks would call it unsupported. A supported wine CLEARS a stale record; a probe that
/// failed, timed out, overran or could not be parsed never does (absence of evidence is not
/// evidence).
pub async fn check_wine_version(
    session: &Session<'_>,
    runner: &str,
    app_name: &str,
    wine_bin: &str,
    envs: &BTreeMap<String, String>,
) {
    let ctx = session.ctx;
    let stdout = match read_wine_version_output(session, wine_bin, envs).await {
        Ok(stdout) => stdout,
        Err(reason) => {
            log_warn(
                ctx,
                &format!(
                    "Could not read the wine version for the winetricks environment banner: {reason}"
                ),
            );
            return;
        }
    };
    let Some(version) = parse_wine_version_output(&stdout) else {
        let head: String = stdout.chars().take(200).collect();
        log_warn(
            ctx,
            &format!(
                "Could not parse the wine version for the winetricks environment banner: {head}"
            ),
        );
        return;
    };
    let unsupported = is_unsupported_wine_version(&version);
    ctx.tools.winetricks_env.record_unsupported_wine(
        runner,
        app_name,
        unsupported.then_some(version.as_str()),
    );
}

/// One run's request: the winetricks arguments and what the run is for.
pub struct RunRequest<'a> {
    pub args: Vec<String>,
    /// Keep stdout verbatim for the caller (`list-all`) rather than classifying it; also probes the
    /// bottle's wine version.
    pub return_output: bool,
    /// Variables that win over both platforms' (`LANG=C` for `list-all`).
    pub env_overrides: Vec<(String, String)>,
    /// The verb this run installs, or `""` for every other run. Passed explicitly rather than read
    /// from the single-flight slot: a list run started mid-install must not tag its own events with
    /// the installing verb (a false Done ended the install's in-flight state in the UI).
    pub component: String,
    /// Sees each line as it is classified, and the closing exit line of a failed run.
    pub on_line: Option<&'a mut (dyn FnMut(&LogLine) + Send)>,
}

/// What a run came to.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RunOutcome {
    /// The `onDone` of the TS: `Some(failed)` once the run settled or could not start, `None` when
    /// it never did.
    pub failed: Option<bool>,
    /// Stdout, verbatim, when the request kept it; empty otherwise.
    pub output: Vec<String>,
}

/// The state machine of one run: classified lines, the progress flush and the closing event.
struct RunState<'a> {
    ctx: &'a WineCtx,
    runner: String,
    app_name: String,
    component: String,
    return_output: bool,
    on_line: Option<&'a mut (dyn FnMut(&LogLine) + Send)>,
    messages: Vec<String>,
    pending: Vec<LogLine>,
    last_percent: Option<u32>,
    updated: bool,
    stdout_rest: String,
    stderr_rest: String,
    output: Vec<String>,
    chunks_seen: bool,
    done: bool,
    /// A line said a registry import found no file (`regedit: The file '...' was not found`): the run
    /// did not apply its verb, whatever its exit code says (87-64, D-06 gate fix).
    failed_import: bool,
}

impl RunState<'_> {
    fn append_message(&mut self, message: String) {
        // Don't store more than 100 messages, to not fill the storage and make render still fast.
        if self.messages.len() > MAX_MESSAGES {
            self.messages.remove(0);
        }
        self.messages.push(message);
        self.updated = true;
    }

    fn record_line(&mut self, line: LogLine) {
        // Nothing is pushed once Done went out: a probe that finishes late only updates its report.
        if self.done {
            return;
        }
        if line.kind == LineKind::Progress {
            if let Some(percent) = line.percent {
                self.last_percent = Some(percent);
            }
            // The raw meter is never forwarded as a message.
        } else {
            self.append_message(line.text.clone());
        }
        append_log_line(&mut self.pending, line.clone(), MAX_BUFFERED_LINES);
        self.updated = true;
        if let Some(on_line) = self.on_line.as_mut() {
            on_line(&line);
        }
    }

    /// Phase 45 D-14/D-15: every line is classified here, where the raw text exists. Only an `error`
    /// is logged as one; curl's meter becomes a percentage and one replaceable progress line; wine's
    /// debug channels are not logged.
    fn handle_line(&mut self, raw: &str) {
        let Some(line) = classify_line(raw) else {
            return;
        };
        if is_missing_regedit_file(raw) {
            self.failed_import = true;
        }
        match line.kind {
            LineKind::Progress | LineKind::Noise => {}
            LineKind::Info => log_info(self.ctx, &line.text),
            LineKind::Environment => {
                log_warn(self.ctx, &line.text);
                if let Some(version) = parse_unsupported_wine_version(&line.text) {
                    self.ctx.tools.winetricks_env.record_unsupported_wine(
                        &self.runner,
                        &self.app_name,
                        Some(&version),
                    );
                }
            }
            LineKind::Error => log_error(self.ctx, &line.text),
        }
        self.record_line(line);
    }

    fn flush(&mut self) {
        if !self.updated {
            return;
        }
        let mut payload = Map::new();
        payload.insert("messages".into(), json!(self.messages));
        payload.insert("installingComponent".into(), json!(self.component));
        let lines = std::mem::take(&mut self.pending);
        payload.insert("lines".into(), json!(lines));
        if let Some(percent) = self.last_percent {
            payload.insert("percent".into(), json!(percent));
        }
        self.ctx
            .engine
            .emitter
            .emit("progressOfWinetricks", vec![Value::Object(payload)]);
        self.updated = false;
    }

    fn on_chunk(&mut self, pipe: Pipe, text: &str) {
        self.chunks_seen = true;
        match pipe {
            Pipe::Stdout if self.return_output => {
                // The list-all parser reads this verbatim; it is never classified.
                self.output.push(text.to_string());
            }
            Pipe::Stdout => {
                let split = split_output_chunk(&self.stdout_rest, text);
                self.stdout_rest = split.remainder;
                for line in &split.lines {
                    self.handle_line(line);
                }
            }
            Pipe::Stderr => {
                let split = split_output_chunk(&self.stderr_rest, text);
                self.stderr_rest = split.remainder;
                for line in &split.lines {
                    self.handle_line(line);
                }
            }
        }
    }

    /// Done is sent once, when the run settles. The lines buffered since the last tick (usually
    /// winetricks' own abort message) are flushed into the log BEFORE it. `failed` carries the exit
    /// code itself (a signal exit reports no code, also a failure), because `w_die` is only a
    /// `warning:` and the exit code, not the text, decides.
    fn send_done(&mut self, code: Option<i32>) -> bool {
        if self.done {
            return code != Some(0);
        }
        // A final line with no trailing newline is still a line.
        if !self.return_output {
            let rest = std::mem::take(&mut self.stdout_rest);
            self.handle_line(&rest);
        }
        let rest = std::mem::take(&mut self.stderr_rest);
        self.handle_line(&rest);
        self.flush();
        self.done = true;
        // The exit code decides (copied from the TS, D-16), and so does a failed registry import: it exits
        // 0 (D-06 gate fix, `is_missing_regedit_file`).
        let failed = code != Some(0) || self.failed_import;
        let mut payload = Map::new();
        payload.insert("messages".into(), json!(["Done"]));
        payload.insert("installingComponent".into(), json!(self.component));
        payload.insert("failed".into(), json!(failed));
        if failed {
            let text = match code {
                Some(0) => "winetricks reported a registry import that found no file".to_string(),
                Some(code) => format!("winetricks exited with code {code}"),
                None => "winetricks exited with code null".to_string(),
            };
            let line = LogLine::new(LineKind::Error, text);
            log_warn(self.ctx, &line.text);
            if let Some(on_line) = self.on_line.as_mut() {
                on_line(&line);
            }
            payload.insert("lines".into(), json!([line]));
        }
        self.ctx
            .engine
            .emitter
            .emit("progressOfWinetricks", vec![Value::Object(payload)]);
        failed
    }
}

/// A spawn that never started (the seam answers no code and the reason on stderr), as against a child
/// that ran and was ended by a signal.
fn spawn_failed(output: &SpecOutput, chunks_seen: bool) -> bool {
    output.code.is_none()
        && !output.cancelled
        && !output.timed_out
        && !chunks_seen
        && output.stdout.is_empty()
        && output.stderr.starts_with("spawn ")
}

/// `Winetricks.runWithArgs`: one winetricks run for a game (see the module docs).
pub async fn run_with_args<'a>(
    session: &Session<'a>,
    target: &Target<'_>,
    request: RunRequest<'a>,
) -> RunOutcome {
    let ctx = session.ctx;
    let RunRequest {
        mut args,
        return_output,
        env_overrides,
        component,
        on_line,
    } = request;
    let mut outcome = RunOutcome::default();

    let settings = match &target.settings {
        ToolSettings::Resolved(settings) => settings,
        ToolSettings::Unavailable(reason) => {
            // Phase 61: act on the game's real bottle and engine; none is usable.
            log_error(
                ctx,
                &format!(
                    "Winetricks not run for {}: no usable Wine environment ({reason})",
                    target.app_name
                ),
            );
            outcome.failed = Some(true);
            return outcome;
        }
    };

    if !session.launcher.valid_wine(ctx, &settings.wine_version) {
        outcome.failed = Some(true);
        return outcome;
    }

    let mut winetricks = script_path(ctx);
    if !winetricks.exists() {
        download_script(session).await;
    }

    if umu_supported(ctx, settings, session.host) {
        winetricks = umu_path(ctx, session.host);
        if let Some(at) = args.iter().position(|a| a == "-q") {
            args.remove(at);
        }
        args.insert(0, "winetricks".to_string());
    }

    let Some((prefix, wine)) = wine_from_proton(session, settings) else {
        // T-87-112: a CrossOver bottle that is not one safe name under the Bottles root has no prefix.
        log_error(
            ctx,
            &format!(
                "Winetricks not run for {}: no usable Wine environment (invalid-bottle)",
                target.app_name
            ),
        );
        outcome.failed = Some(true);
        return outcome;
    };
    let mut envs = build_env(session, settings, target.app_name, &prefix, &wine);
    // Merged LAST so it wins over both platforms' (see `RunRequest::env_overrides`).
    envs.extend(env_overrides);

    // Held for the whole run: the exit path waits for a running winetricks.
    let _registrant = ctx.engine.shutdown.register("winetricks");

    let state = Mutex::new(RunState {
        ctx,
        runner: target.runner.to_string(),
        app_name: target.app_name.to_string(),
        component,
        return_output,
        on_line,
        messages: Vec::new(),
        pending: Vec::new(),
        last_percent: None,
        updated: false,
        stdout_rest: String::new(),
        stderr_rest: String::new(),
        output: Vec::new(),
        chunks_seen: false,
        done: false,
        failed_import: false,
    });
    let with_state = |f: &mut dyn FnMut(&mut RunState<'_>)| {
        let mut guard = state.lock().unwrap_or_else(|e| e.into_inner());
        f(&mut guard);
    };

    // The messages checkDependencies raises are environment notices; they reach the renderer as
    // `environment` lines (and were already logged by checkDependencies, so not logged again here).
    let dependencies = async {
        let mut append = |message: String| {
            with_state(&mut |st: &mut RunState<'_>| {
                st.record_line(LogLine::new(LineKind::Environment, message.clone()));
            });
        };
        check_dependencies(session, target.runner, target.app_name, &envs, &mut append).await;
    };

    // (1) list-all is the one run where winetricks skips its own unsupported-wine check; (2) install
    // runs DO print winetricks' own warning, already recorded by `handle_line`, so they are not
    // probed here; (3) only `list-all` keeps its output, so this never runs on an install.
    let wine_version = async {
        if return_output {
            check_wine_version(session, target.runner, target.app_name, &wine.bin, &envs).await;
        }
    };

    let program = winetricks.to_string_lossy().into_owned();
    log_info(
        ctx,
        &format!("Running {} {}", name_of(&winetricks), args.join(" ")),
    );

    let child = async {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<(Pipe, String)>();
        let sink: ChunkSink = Box::new(move |pipe, text| {
            let _ = tx.send((pipe, text.to_string()));
        });
        // D-10: no timeout. Winetricks installs run for minutes to hours; the user cancels through
        // the winetricks queue, and the spawn seam tracks the child for quit teardown.
        let mut spec = ProcSpec::new("winetricks", program.as_str());
        spec.argv = args.clone();
        spec.env = env_pairs(&envs);
        spec.replace_env = true;
        spec.timeout = None;
        spec.cancel = Some(ctx.engine.shutdown.token().child_token());
        let mut run = ctx.proc.run_streamed(spec, sink);
        let mut tick = interval_at(Instant::now() + PROGRESS_INTERVAL, PROGRESS_INTERVAL);
        tick.set_missed_tick_behavior(MissedTickBehavior::Delay);
        let result = loop {
            tokio::select! {
                biased;
                Some((pipe, text)) = rx.recv() => {
                    with_state(&mut |st: &mut RunState<'_>| st.on_chunk(pipe, &text));
                }
                _ = tick.tick() => {
                    with_state(&mut |st: &mut RunState<'_>| st.flush());
                }
                result = &mut run => break result,
            }
        };
        // Everything the child wrote before it exited is in the channel by now.
        while let Ok((pipe, text)) = rx.try_recv() {
            with_state(&mut |st: &mut RunState<'_>| st.on_chunk(pipe, &text));
        }
        result
    };

    // The probes are polled first: a `which` answers at once, so their notices reach the run's
    // messages before the child's first line, as they did in the TS (which let the probes settle).
    let (_, _, output) = tokio::join!(dependencies, wine_version, child);

    let chunks_seen = state.lock().unwrap_or_else(|e| e.into_inner()).chunks_seen;
    let mut failed = true;
    if spawn_failed(&output, chunks_seen) {
        // onSpawnError: logged, shown, no Done.
        log_error(ctx, "Winetricks threw an error: could not spawn");
        show_spawn_error(ctx, &output.stderr);
    } else {
        with_state(&mut |st: &mut RunState<'_>| {
            failed = st.send_done(output.code);
        });
    }
    let mut guard = state.lock().unwrap_or_else(|e| e.into_inner());
    outcome.failed = Some(failed);
    outcome.output = std::mem::take(&mut guard.output);
    outcome
}

/// The in-app dialog of a winetricks that could not start.
fn show_spawn_error(ctx: &WineCtx, reason: &str) {
    let Some(ui) = &ctx.engine.ui else {
        return;
    };
    let title = ctx.engine.i18n.t(
        "box.error.winetricks.title",
        "Winetricks error",
        &Map::new(),
    );
    let mut params = Map::new();
    params.insert("newLine".into(), json!("\n"));
    params.insert("error".into(), json!(reason.trim()));
    let message = ctx.engine.i18n.t(
        "box.error.winetricks.message",
        "Winetricks returned the following error during execution:{{newLine}}{{error}}",
        &params,
    );
    ui.show_dialog(&title, &message, "ERROR", "");
}

/// `Winetricks.install`: one verb, single-flight. A second install while one runs is refused and sends
/// nothing (the running install's own closing event clears any optimistic in-flight state the dialog
/// set for this one). The outcome is the run's own `onDone`, defaulting to failed.
pub async fn install<'a>(
    session: &Session<'a>,
    target: &Target<'_>,
    verb: &str,
    on_line: Option<&'a mut (dyn FnMut(&LogLine) + Send + 'a)>,
) -> InstallOutcome {
    let ctx = session.ctx;
    let slot = match ctx.tools.begin_install(verb) {
        Ok(slot) => slot,
        Err(running) => {
            log_warn(
                ctx,
                &format!("Not installing {verb}: {running} is already installing"),
            );
            return InstallOutcome::Refused;
        }
    };
    ctx.engine
        .emitter
        .emit("installing-winetricks-component", vec![json!(verb)]);
    let run = run_with_args(
        session,
        target,
        RunRequest {
            args: vec!["-q".to_string(), verb.to_string()],
            return_output: false,
            env_overrides: Vec::new(),
            component: verb.to_string(),
            on_line,
        },
    )
    .await;
    drop(slot);
    ctx.engine
        .emitter
        .emit("installing-winetricks-component", vec![json!("")]);
    match run.failed {
        Some(false) => InstallOutcome::Installed,
        _ => InstallOutcome::Failed,
    }
}

/// `Winetricks.scriptMetadata` (D-19): parses the already-downloaded `<tools>/winetricks` (a fixed
/// path, never a caller-supplied one) and caches the result keyed by the file's modification time and
/// size, so a script re-downloaded by the 7-day cache is picked up and an unchanged one is read once.
/// `None` (after one warning) when the file cannot be read.
///
/// On the umu path the winetricks that actually runs is umu's own, which may differ in version from
/// this download; the metadata still comes from the downloaded script (acceptable, recorded).
pub fn script_metadata(ctx: &WineCtx) -> Option<Arc<ScriptMetadata>> {
    let path = script_path(ctx);
    let read = || -> std::io::Result<(String, Arc<ScriptMetadata>)> {
        let meta = std::fs::metadata(&path)?;
        let stamp = meta
            .modified()
            .ok()
            .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
            .map_or(0, |d| d.as_nanos());
        let key = format!("{stamp}:{}", meta.len());
        if let Some((cached_key, cached)) = ctx.tools.script_metadata() {
            if cached_key == key {
                return Ok((key, cached));
            }
        }
        let text = String::from_utf8_lossy(&std::fs::read(&path)?).into_owned();
        let value = Arc::new(ScriptMetadata::from_script(&text));
        ctx.tools
            .set_script_metadata(Some((key.clone(), Arc::clone(&value))));
        Ok((key, value))
    };
    match read() {
        Ok((_, value)) => Some(value),
        Err(error) => {
            log_warn(
                ctx,
                &format!(
                    "Could not read the winetricks script for its metadata: {}",
                    io_category(&error)
                ),
            );
            None
        }
    }
}

/// The catalog as list-all gave it, annotated from the script on disk (D-19/D-17): no second wine or
/// winetricks run. When the script cannot be read the components stay unannotated (and, with no
/// `needsGui`, only the category half of D-09 applies) rather than failing the whole list.
fn annotate(components: Vec<Component>, metadata: Option<&ScriptMetadata>) -> Vec<Component> {
    let Some(metadata) = metadata else {
        return components;
    };
    components
        .into_iter()
        .map(|component| {
            let upstream = metadata.by_verb.get(&component.verb);
            Component {
                // The untruncated upstream title; list-all's is cut to one line.
                title: upstream
                    .and_then(|u| u.title.clone())
                    .unwrap_or(component.title),
                publisher: upstream.and_then(|u| u.publisher.clone()),
                year: upstream.and_then(|u| u.year.clone()),
                media: upstream.and_then(|u| u.media.clone()),
                conflicts: upstream.and_then(|u| u.conflicts.clone()),
                homepage: upstream.and_then(|u| u.homepage.clone()),
                needs_gui: Some(metadata.needs_gui.contains(&component.verb)),
                verb: component.verb,
                category: component.category,
                cached: component.cached,
            }
        })
        .collect()
}

/// `Winetricks.listAvailable` (quick-260915-ajd): every verb winetricks can install for the game,
/// visible ones only (D-09), from one `winetricks list-all` run. That run supplies `category` for free
/// and does not drop the apps, benchmarks and settings verbs; the `===== prefix =====` block it emits is
/// category names, not verbs, and the parser discards it (F-6, do not "restore" it as a bug fix).
///
/// `LANG` is the load-bearing variable: `winetricks_list_all` switches on `case ${LANG} in` and
/// localises the `[downloadable]`/`[cached]` flag words for several locales (F-4); `LC_ALL=C` is set
/// too, belt and braces, but inert alone. The override is scoped to ONLY this call: the install path
/// keeps the user's locale. The list the cache holds (the one the apply guard validates against) is
/// the same filtered list; an empty one is never cached.
pub async fn list_available<'a>(session: &Session<'a>, target: &Target<'_>) -> Vec<Component> {
    let ctx = session.ctx;
    let run = run_with_args(
        session,
        target,
        RunRequest {
            args: vec!["list-all".to_string()],
            return_output: true,
            env_overrides: vec![
                ("LANG".to_string(), "C".to_string()),
                ("LC_ALL".to_string(), "C".to_string()),
            ],
            component: String::new(),
            on_line: None,
        },
    )
    .await;
    let components = parse_list_all(&run.output);
    let metadata = script_metadata(ctx);
    let visible = filter_visible_catalog(annotate(components, metadata.as_deref()));
    if !visible.is_empty() {
        let values: Vec<Value> = visible
            .iter()
            .filter_map(|c| serde_json::to_value(c).ok())
            .collect();
        ctx.tools
            .set_catalog(&catalog_cache_key(target.runner, target.app_name), values);
    }
    visible
}

/// `Winetricks.catalogFor` (D-01/T-45-01): the catalog the apply guard validates a renderer's verbs
/// against: the cached list when present, otherwise `list_available` (which fills the cache).
pub async fn catalog_for<'a>(session: &Session<'a>, target: &Target<'_>) -> Vec<Component> {
    let key = catalog_cache_key(target.runner, target.app_name);
    if let Some(cached) = session.ctx.tools.catalog(&key) {
        let components: Vec<Component> = cached
            .into_iter()
            .filter_map(|value| serde_json::from_value(value).ok())
            .collect();
        return components;
    }
    list_available(session, target).await
}

/// `Winetricks.listInstalled`: the lines of the `winetricks.log` of the bottle the game really runs in
/// (Phase 61); a read never creates one. Empty when the settings are unavailable or the log is not
/// there. A Proton umu does not run keeps its log in the prefix's `pfx` subdirectory.
pub fn list_installed(session: &Session<'_>, target: &Target<'_>) -> Vec<String> {
    let ToolSettings::Resolved(settings) = &target.settings else {
        return Vec::new();
    };
    let Some((prefix, _)) = wine_from_proton(session, settings) else {
        return Vec::new();
    };
    let log = js_join(&[&prefix, "winetricks.log"]);
    match std::fs::read(&log) {
        Ok(bytes) => String::from_utf8_lossy(&bytes)
            .split('\n')
            .filter(|line| !line.is_empty())
            .map(str::to_string)
            .collect(),
        Err(_) => Vec::new(),
    }
}
