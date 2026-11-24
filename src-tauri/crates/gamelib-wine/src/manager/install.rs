//! Wine-version install (`installWineVersion` in `src/backend/wine/manager/utils.ts`,
//! `installVersion` in `downloader/main.ts`, `unzipFile` and `getFolderSize` in
//! `downloader/utilities.ts`, and the `installWineVersion` handler's progress and notifications).
//!
//! One run: the start notification and the first `progressOfWineManager`, the install folder, the
//! sha512 checksum asset (when the release has one), the download through `ctx.fetch` with progress at
//! the fetch seam's one-a-second cadence, the sha512 check, a backup of the old directory when it is an
//! update, extraction through [`extract_tar`], the store entry marked installed, `wineVersionsUpdated`,
//! and the result notification. The run holds a `Shutdown` registrant for exactly its lifetime and
//! races the caller's cancel and the app shutdown, which end it the same way: the aborted result.
//!
//! Where the TS was wrong, this stops or repairs instead (recorded in `golden/wine_manager/deltas.json`,
//! D-19): it touches the existing install only after the archive is whole and checked, so aborting an
//! update leaves the install alone; a failed extraction (a `tar` that exits non-zero, or cannot start)
//! is an error, removes the half-made directory through `gamelib-safety` and puts the backup back; the
//! release `version` and the archive name are plain path components. Everything else is copied, the
//! checksum asset fetched even for an install that is then skipped as already installed included.
//!
//! No error or log line names a URL or a path (T-87-21): a failure is a category word.

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

use gamelib_core::process::ProcSpec;
use gamelib_engine::ctx::Platform;
use gamelib_engine::fetch::{FetchError, Progress};
use gamelib_store::json::{Json, Obj};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha512};
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use super::{
    emit_progress, emit_updated, log_error, log_info, log_warn, notify, number, plain_component,
    remove_guarded, store, text_of,
};
use crate::ctx::WineCtx;
use crate::extract::{extract_tar, ExtractError};
use crate::runtimes::{archive_file_name, request};
use crate::tools::dxmt;

/// How long `du` may take on a large wine directory on a cold disk (the TS's unmeasured 60 s).
const DU_TIMEOUT: Duration = Duration::from_secs(60);

/// The Settings an install reads (`downloadProtonToSteam`, `defaultSteamPath`): where a Proton install
/// goes. The shell supplies them from the global settings; this crate reads no settings file.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct InstallSettings {
    pub download_proton_to_steam: bool,
    pub default_steam_path: String,
}

/// How an install ended (`'success' | 'abort' | 'error'` in the TS).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Success,
    Abort,
    Error,
}

impl Outcome {
    pub fn as_str(self) -> &'static str {
        match self {
            Outcome::Success => "success",
            Outcome::Abort => "abort",
            Outcome::Error => "error",
        }
    }
}

/// Why a step stopped the install. A category only.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Fail {
    /// The cancel or the app shutdown ended it (`AbortError`).
    Aborted,
    Failed(&'static str),
}

/// A release the install worked on: the directory it is in and how big it is.
struct Installed {
    dir: PathBuf,
    disksize: u64,
}

/// JS truthiness of a JSON value (`if (value)`).
fn value_truthy(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|f| f != 0.0 && !f.is_nan()),
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Array(_) | Value::Object(_)) => true,
    }
}

/// The text of a non-empty string field.
fn text_field<'a>(release: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
    release
        .get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
}

/// `formatTime`: `hh:mm:ss`, hours not capped.
fn format_time(seconds: u64) -> String {
    format!(
        "{:02}:{:02}:{:02}",
        seconds / 3600,
        (seconds % 3600) / 60,
        seconds % 60
    )
}

/// `calculateEta` with no time elapsed since the report: `00:00:00` when nothing is left, `null` when
/// the speed makes the time infinite or not a number, else the time left.
fn eta_text(downloaded: f64, speed: f64, size: f64) -> Value {
    let remaining_seconds = (size - downloaded) / speed;
    if remaining_seconds <= 0.0 {
        json!("00:00:00")
    } else if !remaining_seconds.is_finite() {
        Value::Null
    } else {
        json!(format_time(remaining_seconds.floor() as u64))
    }
}

/// A token cancelled when the caller's `cancel` or the app shutdown is, so the download and the
/// checks race one token. The watcher task ends with the guard.
struct Watch {
    token: CancellationToken,
    task: JoinHandle<()>,
}

impl Watch {
    fn new(ctx: &WineCtx, cancel: &CancellationToken) -> Watch {
        let token = CancellationToken::new();
        let (own, caller, shutdown) = (token.clone(), cancel.clone(), ctx.engine.shutdown.token());
        let task = tokio::spawn(async move {
            tokio::select! {
                _ = caller.cancelled() => own.cancel(),
                _ = shutdown.cancelled() => own.cancel(),
                _ = own.cancelled() => {}
            }
        });
        Watch { token, task }
    }
}

impl Drop for Watch {
    fn drop(&mut self) {
        self.task.abort();
    }
}

/// `getInstallDir`: Wine builds go to `<tools>/wine`, the Game Porting Toolkit to
/// `<tools>/game-porting-toolkit`, everything else (Proton) to `<tools>/proton`, or to the Steam
/// `compatibilitytools.d` when the setting is on and the configured Steam path holds `steam.sh`.
fn install_dir_for(ctx: &WineCtx, release_type: &str, settings: &InstallSettings) -> PathBuf {
    let tools = &ctx.engine.paths.tools_path;
    if release_type.contains("Wine") {
        return tools.join("wine");
    }
    if release_type.contains("Toolkit") {
        return tools.join("game-porting-toolkit");
    }
    if settings.download_proton_to_steam && !settings.default_steam_path.is_empty() {
        let steam = Path::new(&settings.default_steam_path);
        if steam.join("steam.sh").exists() {
            let compat = steam.join("compatibilitytools.d");
            if fs::create_dir_all(&compat).is_ok() {
                return compat;
            }
        } else {
            log_warn(
                ctx,
                "The configured Steam path does not appear to be valid, installing into the tools path instead",
            );
        }
    }
    tools.join("proton")
}

/// `unlinkFile`: removes a file if it is there. A failure is not an error of the install.
fn unlink(path: &Path) {
    if path.exists() {
        let _ = fs::remove_file(path);
    }
}

/// `getFolderSize`: `du -sb` (`-sk` on a Mac, in kilobytes), read as a byte count; 0 when it cannot be
/// measured.
async fn folder_size(ctx: &WineCtx, folder: &Path) -> u64 {
    let mac = ctx.engine.platform == Platform::Mac;
    let Some(folder) = folder.to_str() else {
        return 0;
    };
    let mut spec = ProcSpec::new("wine-du", "du");
    spec.argv = vec![
        if mac { "-sk" } else { "-sb" }.to_string(),
        folder.to_string(),
    ];
    spec.stdin = Some(String::new());
    spec.timeout = Some(DU_TIMEOUT);
    spec.cancel = Some(ctx.engine.shutdown.token());
    let out = ctx.proc.run(spec, None).await;
    let digits: String = out
        .stdout
        .trim_start()
        .chars()
        .take_while(char::is_ascii_digit)
        .collect();
    match (out.timed_out || out.code != Some(0), digits.parse::<u64>()) {
        (false, Ok(value)) => {
            if mac {
                value.saturating_mul(1024)
            } else {
                value
            }
        }
        _ => {
            log_warn(ctx, "Could not measure the size of a wine install");
            0
        }
    }
}

/// The sha512 of a file as lowercase hex, read in blocks on the blocking pool.
async fn sha512_hex(path: &Path) -> std::io::Result<String> {
    let path = path.to_path_buf();
    tokio::task::spawn_blocking(move || {
        let mut file = fs::File::open(path)?;
        let mut hasher = Sha512::new();
        let mut block = vec![0u8; 1 << 20];
        loop {
            let read = file.read(&mut block)?;
            if read == 0 {
                break;
            }
            hasher.update(&block[..read]);
        }
        Ok(hasher
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect())
    })
    .await
    .map_err(|_| std::io::Error::other("sha512 task"))?
}

/// `<dir>_backup`, beside `dir`.
fn backup_of(dir: &Path) -> PathBuf {
    let mut name = dir.file_name().unwrap_or_default().to_os_string();
    name.push("_backup");
    dir.with_file_name(name)
}

/// Removes `dir` through `gamelib-safety` with its parent as the trust root.
fn remove_dir(ctx: &WineCtx, dir: &Path) -> bool {
    match dir.parent() {
        Some(root) => remove_guarded(ctx, dir, root).is_ok(),
        None => false,
    }
}

/// Where the store says `version` is installed, read before the install touches anything: the stored
/// entry's `installDir` when the entry is marked installed and names one. `None` for a never-installed
/// entry (the keys are absent), an entry the store lacks or a store that cannot be read; the install
/// then computes the directory itself. The store is this app's own state, unlike the renderer's copy.
fn stored_install_dir(ctx: &WineCtx, version: &str) -> Option<PathBuf> {
    let store = store::open(ctx).ok()?;
    let releases = store::read(&store)?;
    let entry = releases
        .iter()
        .find(|entry| text_of(entry, "version") == Some(version))?;
    if !matches!(entry.get("isInstalled"), Some(Json::Bool(true))) {
        return None;
    }
    text_of(entry, "installDir")
        .filter(|dir| !dir.is_empty())
        .map(PathBuf::from)
}

/// `installVersion`: the download, the checks, the backup, the extraction.
async fn install_version(
    ctx: &WineCtx,
    release: &Map<String, Value>,
    version: &str,
    install_dir: &Path,
    stored_dir: Option<PathBuf>,
    overwrite: bool,
    token: &CancellationToken,
) -> Result<Installed, Fail> {
    let download = text_field(release, "download");
    let file_name = download
        .and_then(archive_file_name)
        .ok_or(Fail::Failed("no-download-link"))?;
    let tar_file = install_dir.join(file_name);
    // An update goes back to where the store says the build is. The renderer's `installDir` is not
    // read at all (V5): the directory is the store's own entry or the one computed for this type, so a
    // supplied path can neither receive an install nor be moved aside as a backup.
    let install_sub_dir = match stored_dir {
        Some(dir) => dir,
        None => install_dir.join(version),
    };

    // The checksum asset is fetched first and even when the install is then skipped (TS parity).
    let source_checksum = match text_field(release, "checksum") {
        Some(url) => {
            let response = ctx
                .fetch
                .get(request(ctx, url))
                .await
                .and_then(|r| r.error_for_status())
                .map_err(|_| Fail::Failed("checksum-fetch"))?;
            Some(String::from_utf8_lossy(&response.body).into_owned())
        }
        None => None,
    };

    if !install_dir.exists() {
        fs::create_dir_all(install_dir).map_err(|_| Fail::Failed("install-dir"))?;
    } else if !install_dir.is_dir() {
        return Err(Fail::Failed("install-dir-not-a-directory"));
    }
    let download = download.ok_or(Fail::Failed("no-download-link"))?;

    if install_sub_dir.exists() && !overwrite {
        log_warn(
            ctx,
            &format!("{version} is already installed. Skip installing!"),
        );
        let disksize = folder_size(ctx, &install_sub_dir).await;
        return Ok(Installed {
            dir: install_sub_dir,
            disksize,
        });
    }
    unlink(&tar_file);

    // Download, with the progress the renderer shows.
    let started = ctx.engine.clock.now_ms();
    let size = release
        .get("downsize")
        .and_then(Value::as_f64)
        .unwrap_or(f64::NAN);
    let engine = ctx.engine.clone();
    let name = version.to_string();
    let progress = move |p: Progress| {
        let elapsed = engine.clock.now_ms().saturating_sub(started) as f64 / 1000.0;
        let speed = if elapsed > 0.0 {
            p.bytes as f64 / elapsed
        } else {
            0.0
        };
        engine.emitter.emit(
            "progressOfWineManager",
            vec![
                json!(name),
                json!({
                    "status": "downloading",
                    "percentage": p.percentage,
                    "avgSpeed": speed,
                    "eta": eta_text(p.bytes as f64, speed, size),
                }),
            ],
        );
    };
    let downloaded = ctx
        .fetch
        .download(request(ctx, download), &tar_file, &progress, token.clone())
        .await;
    match downloaded {
        Ok(_) => {}
        Err(FetchError::Aborted) => {
            unlink(&tar_file);
            return Err(Fail::Aborted);
        }
        Err(_) => {
            unlink(&tar_file);
            return Err(Fail::Failed("download"));
        }
    }

    // The checksum of what was downloaded.
    let digest = sha512_hex(&tar_file).await.map_err(|_| {
        unlink(&tar_file);
        Fail::Failed("read-archive")
    })?;
    match source_checksum.as_deref().filter(|text| !text.is_empty()) {
        Some(text) => {
            if !text.contains(&digest) {
                unlink(&tar_file);
                return Err(Fail::Failed("checksum"));
            }
        }
        None => log_warn(
            ctx,
            &format!("No checksum provided. Download of {version} could be invalid!"),
        ),
    }

    // Backup the old folder, make the new one, extract into it.
    let backup = backup_of(&install_sub_dir);
    if overwrite && fs::rename(&install_sub_dir, &backup).is_err() {
        unlink(&tar_file);
        return Err(Fail::Failed("backup"));
    }
    let restore = |ctx: &WineCtx| {
        if overwrite && fs::rename(&backup, &install_sub_dir).is_err() {
            log_error(ctx, "Could not restore the previous wine install");
        }
    };
    if fs::create_dir(&install_sub_dir).is_err() {
        unlink(&tar_file);
        restore(ctx);
        return Err(Fail::Failed("make-folder"));
    }
    emit_progress(ctx, version, json!({ "status": "unzipping" }));
    let extracted = extract_tar(ctx, &tar_file, &install_sub_dir, 1).await;
    emit_progress(ctx, version, json!({ "status": "idle" }));
    if let Err(error) = extracted {
        // Remove the artefacts and put the old install back.
        if !remove_dir(ctx, &install_sub_dir) {
            log_error(ctx, "Could not remove a failed wine install");
        }
        unlink(&tar_file);
        restore(ctx);
        return Err(match error {
            ExtractError::Cancelled => Fail::Aborted,
            _ => Fail::Failed("extract"),
        });
    }

    // Clean up.
    if overwrite && !remove_dir(ctx, &backup) {
        log_warn(
            ctx,
            "Could not remove the backup of the previous wine install",
        );
    }
    unlink(&tar_file);

    let disksize = folder_size(ctx, &install_sub_dir).await;
    Ok(Installed {
        dir: install_sub_dir,
        disksize,
    })
}

/// The stored entry after an install: the release the renderer sent, its keys in the order the stored
/// entry has them, then the measured size and where it went, marked installed and up to date.
fn updated_entry(stored: &Json, release: &Map<String, Value>, installed: &Installed) -> Json {
    let mut out = Obj::new();
    if let Json::Obj(stored) = stored {
        for (key, _) in stored.iter() {
            if let Some(value) = release.get(key) {
                out.insert_js(key.clone(), Json::from(value.clone()));
            }
        }
    }
    for (key, value) in release {
        if !out.contains_key(key) {
            out.insert_js(key.clone(), Json::from(value.clone()));
        }
    }
    out.insert_js("disksize", number(installed.disksize));
    out.insert_js(
        "installDir",
        Json::Str(installed.dir.to_string_lossy().into_owned()),
    );
    out.insert_js("isInstalled", Json::Bool(true));
    out.insert_js("hasUpdate", Json::Bool(false));
    Json::Obj(out)
}

/// `installWineVersion` (the store half and the install folders around `installVersion`).
async fn install_wine_version(
    ctx: &WineCtx,
    release: &Map<String, Value>,
    version: &str,
    settings: &InstallSettings,
    cancel: &CancellationToken,
) -> Outcome {
    let overwrite = value_truthy(release.get("hasUpdate"));
    let variant = if overwrite { "update" } else { "installation" };

    let tools = &ctx.engine.paths.tools_path;
    let mut folders = vec![tools.join("wine")];
    if ctx.engine.platform == Platform::Mac {
        folders.push(tools.join("game-porting-toolkit"));
    }
    folders.push(tools.join("proton"));
    for folder in folders {
        if !folder.exists() && fs::create_dir_all(&folder).is_err() {
            log_error(ctx, "Could not make the wine install folders");
            return Outcome::Error;
        }
    }

    log_info(ctx, &format!("Start {variant} of wine version {version}"));
    let release_type = text_field(release, "type").unwrap_or("");
    let install_dir = install_dir_for(ctx, release_type, settings);

    let stored_dir = stored_install_dir(ctx, version);
    let watch = Watch::new(ctx, cancel);
    let installed = match install_version(
        ctx,
        release,
        version,
        &install_dir,
        stored_dir,
        overwrite,
        &watch.token,
    )
    .await
    {
        Ok(installed) => installed,
        Err(fail) => {
            if fail == Fail::Aborted || watch.token.is_cancelled() || cancel.is_cancelled() {
                log_warn(ctx, &format!("Installation of {version} was aborted"));
                return Outcome::Abort;
            }
            let Fail::Failed(why) = fail else {
                return Outcome::Error;
            };
            log_error(ctx, &format!("Installation of {version} failed: {why}"));
            return Outcome::Error;
        }
    };
    drop(watch);

    // Update the stored information.
    let store = match store::open(ctx) {
        Ok(store) => store,
        Err(error) => {
            log_error(ctx, &format!("wine install: store {:?}", error.kind()));
            return Outcome::Error;
        }
    };
    let Some(mut releases) = store::read(&store) else {
        log_error(
            ctx,
            &format!(
                "Couldn't find a tools entry in wine-downloader-info. Tool {version} couldn't be installed!"
            ),
        );
        return Outcome::Error;
    };
    let Some(index) = releases
        .iter()
        .position(|entry| text_of(entry, "version") == Some(version))
    else {
        log_error(
            ctx,
            &format!("Can't find {version} in wine-downloader-info!"),
        );
        return Outcome::Error;
    };
    releases[index] = updated_entry(&releases[index], release, &installed);
    if let Err(error) = store::write(&store, releases) {
        log_error(ctx, &format!("wine install: store {:?}", error.kind()));
        return Outcome::Error;
    }
    log_info(
        ctx,
        &format!("Finished {variant} of wine version {version}"),
    );
    emit_updated(ctx);
    Outcome::Success
}

/// The `installWineVersion` handler: the start notification and the first progress, the install, then
/// the notification of its result and the closing `idle`. `release` is the `WineVersionInfo` the
/// renderer sent; `Err` is only a release this cannot work on (not an object, no `version`, a
/// `version` that is not one plain path component).
///
/// `cancel` ends the install as an abort, as the app shutdown does.
pub async fn install(
    ctx: &WineCtx,
    release: &Value,
    settings: &InstallSettings,
    cancel: &CancellationToken,
) -> Result<Outcome, &'static str> {
    let release = release.as_object().ok_or("bad-args")?;
    let version = release
        .get("version")
        .and_then(Value::as_str)
        .filter(|v| plain_component(v))
        .ok_or("bad-args")?;
    let _registrant = ctx.engine.shutdown.register("wine-install");

    notify(
        ctx,
        version,
        "notify.install.startInstall",
        "Installation Started",
    );
    emit_progress(
        ctx,
        version,
        json!({ "status": "downloading", "percentage": 0, "avgSpeed": 0, "eta": "00:00:00" }),
    );

    let outcome = install_wine_version(ctx, release, version, settings, cancel).await;

    let (key, default) = match outcome {
        Outcome::Error => ("notify.install.error", "Installation Failed"),
        Outcome::Abort => ("notify.install.canceled", "Installation Canceled"),
        Outcome::Success => ("notify.install.finished", "Installation Finished"),
    };
    notify(ctx, version, key, default);
    emit_progress(ctx, version, json!({ "status": "idle" }));
    if outcome == Outcome::Success {
        dxmt_hook(ctx, release).await;
    }
    Ok(outcome)
}

/// The `wineVersionInstalled` listener (87-31): the TS emitted the event inside `installVersion` and DXMT
/// listened, so a new Wine-Staging-macOS got its `-DXMT` copy. The manager now calls DXMT itself, after the
/// install is stored, announced and closed (the user is not kept waiting for a download that is not theirs).
/// A Wine-Staging-macOS always installs into `<tools>/wine` (`install_dir_for`), so the folder is known
/// without asking it again. Everything else is left to DXMT's own checks (macOS, the staging type, the
/// export gate). An error is the TS listener's rejection, which nothing handled: it is logged here as its
/// category word and the install's outcome stands.
async fn dxmt_hook(ctx: &WineCtx, release: &Map<String, Value>) {
    let Ok(info) = serde_json::from_value::<dxmt::WineVersionInfo>(Value::Object(release.clone()))
    else {
        return;
    };
    let install_dir = ctx.engine.paths.tools_path.join("wine");
    if let Err(error) = dxmt::on_wine_installed(ctx, &info, &install_dir).await {
        log_warn(ctx, &format!("DXMT install hook: {error}"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_eta_follows_calculate_eta() {
        // Nothing left, or past the end: zero.
        assert_eq!(eta_text(200.0, 40.0, 200.0), json!("00:00:00"));
        assert_eq!(eta_text(300.0, 40.0, 200.0), json!("00:00:00"));
        // 100 bytes at 40 B/s is 2.5 s, floored.
        assert_eq!(eta_text(100.0, 40.0, 200.0), json!("00:00:02"));
        assert_eq!(eta_text(0.0, 1.0, 3661.0), json!("01:01:01"));
        // No speed, or no size: `null` (Infinity, NaN).
        assert_eq!(eta_text(10.0, 0.0, 200.0), Value::Null);
        assert_eq!(eta_text(10.0, 40.0, f64::NAN), Value::Null);
    }

    #[test]
    fn the_time_is_not_capped_at_a_day() {
        assert_eq!(format_time(0), "00:00:00");
        assert_eq!(format_time(100 * 3600 + 61), "100:01:01");
    }

    #[test]
    fn javascript_truthiness_of_a_release_flag() {
        assert!(value_truthy(Some(&json!(true))));
        assert!(!value_truthy(Some(&json!(false))));
        assert!(!value_truthy(None));
        assert!(!value_truthy(Some(&json!(""))));
        assert!(value_truthy(Some(&json!("x"))));
        assert!(!value_truthy(Some(&json!(0))));
    }

    #[test]
    fn the_backup_sits_beside_the_install() {
        assert_eq!(
            backup_of(Path::new("/t/proton/GE-Proton9-27")),
            PathBuf::from("/t/proton/GE-Proton9-27_backup")
        );
    }

    #[cfg(feature = "testing")]
    mod with_a_context {
        use super::*;
        use crate::manager::testkit::{kit, seed, stored, Kit, WaitsForCancel};
        use gamelib_engine::testing::UiEvent;
        use std::sync::Arc;

        fn release(version: &str, update: bool, install_dir: &str) -> Value {
            json!({
                "version": version,
                "type": "GE-Proton",
                "date": "2025-01-01",
                "download": format!("https://downloads.invalid/{version}.tar.xz"),
                "downsize": 200,
                "disksize": 0,
                "checksum": "",
                "release_notes_link": "",
                "isInstalled": update,
                "hasUpdate": update,
                "installDir": install_dir,
            })
        }

        /// Runs `install` and cancels `cancel` after the download had time to start.
        async fn install_then_cancel(kit: &Kit, release: &Value, cancel_shutdown: bool) -> Outcome {
            let cancel = CancellationToken::new();
            let stop = cancel.clone();
            let shutdown = kit.ctx.engine.shutdown.token();
            let settings = InstallSettings::default();
            let (outcome, ()) =
                tokio::join!(install(&kit.ctx, release, &settings, &cancel), async move {
                    tokio::time::sleep(Duration::from_millis(50)).await;
                    if cancel_shutdown {
                        shutdown.cancel();
                    } else {
                        stop.cancel();
                    }
                });
            outcome.unwrap()
        }

        #[tokio::test]
        async fn a_cancel_during_the_download_is_the_aborted_result_and_leaves_no_partial_install()
        {
            let kit = kit(Arc::new(WaitsForCancel));
            let release = release("GE-Proton9-27", false, "");
            seed(&kit, std::slice::from_ref(&release));
            assert_eq!(
                install_then_cancel(&kit, &release, false).await,
                Outcome::Abort
            );
            let proton = kit.home.root().join("tools/proton");
            assert!(proton.exists());
            assert_eq!(
                fs::read_dir(&proton).unwrap().count(),
                0,
                "nothing left in the install folder"
            );
            // The store entry is as it was; the user is told it was canceled and the progress closes.
            assert_eq!(stored(&kit)[0]["isInstalled"], json!(false));
            let bodies: Vec<String> = kit
                .ui
                .events()
                .into_iter()
                .filter_map(|e| match e {
                    UiEvent::Notify { body, .. } => Some(body),
                    _ => None,
                })
                .collect();
            assert_eq!(bodies, ["Installation Started", "Installation Canceled"]);
            let pushed = kit.emitter.pushed();
            assert_eq!(pushed.last().unwrap().1[1], json!({ "status": "idle" }));
            assert!(!pushed
                .iter()
                .any(|(channel, _)| channel == "wineVersionsUpdated"));
        }

        #[tokio::test]
        async fn the_app_shutdown_ends_a_download_the_same_way() {
            let kit = kit(Arc::new(WaitsForCancel));
            let release = release("GE-Proton9-27", false, "");
            seed(&kit, std::slice::from_ref(&release));
            assert_eq!(
                install_then_cancel(&kit, &release, true).await,
                Outcome::Abort
            );
            assert_eq!(
                fs::read_dir(kit.home.root().join("tools/proton"))
                    .unwrap()
                    .count(),
                0
            );
        }

        #[tokio::test]
        async fn aborting_an_update_leaves_the_installed_version_alone() {
            let kit = kit(Arc::new(WaitsForCancel));
            let existing = kit.home.root().join("tools/proton/GE-Proton9-27");
            fs::create_dir_all(&existing).unwrap();
            fs::write(existing.join("old-file"), "old").unwrap();
            let release = release("GE-Proton9-27", true, existing.to_str().unwrap());
            seed(&kit, std::slice::from_ref(&release));
            assert_eq!(
                install_then_cancel(&kit, &release, false).await,
                Outcome::Abort
            );
            assert_eq!(
                fs::read_to_string(existing.join("old-file")).unwrap(),
                "old"
            );
            assert!(!backup_of(&existing).exists());
            assert_eq!(stored(&kit)[0]["isInstalled"], json!(true));
        }

        #[tokio::test]
        async fn a_release_whose_version_is_not_one_path_component_is_refused_before_anything_happens(
        ) {
            let kit = kit(Arc::new(WaitsForCancel));
            for version in ["../escape", "a/b", "", ".."] {
                let bad = release(version, false, "");
                let result = install(
                    &kit.ctx,
                    &bad,
                    &InstallSettings::default(),
                    &CancellationToken::new(),
                )
                .await;
                assert_eq!(result, Err("bad-args"), "{version:?}");
            }
            assert!(kit.ui.events().is_empty() && kit.emitter.pushed().is_empty());
            assert!(!kit.home.root().join("tools").exists());
            let not_an_object = install(
                &kit.ctx,
                &json!("GE-Proton9-27"),
                &InstallSettings::default(),
                &CancellationToken::new(),
            )
            .await;
            assert_eq!(not_an_object, Err("bad-args"));
        }

        #[tokio::test]
        async fn a_release_with_no_download_link_is_an_error_with_the_error_notification() {
            let kit = kit(Arc::new(WaitsForCancel));
            let mut none = release("GE-Proton9-27", false, "");
            none["download"] = json!("");
            seed(&kit, &[none.clone()]);
            let outcome = install(
                &kit.ctx,
                &none,
                &InstallSettings::default(),
                &CancellationToken::new(),
            )
            .await;
            assert_eq!(outcome, Ok(Outcome::Error));
            let notified = kit.ui.events().len();
            assert_eq!(notified, 2);
        }

        #[tokio::test]
        async fn the_error_logs_carry_no_url_and_no_path() {
            let kit = kit(Arc::new(WaitsForCancel));
            let mut none = release("GE-Proton9-27", false, "");
            none["download"] = json!("");
            seed(&kit, &[none.clone()]);
            let _ = install(
                &kit.ctx,
                &none,
                &InstallSettings::default(),
                &CancellationToken::new(),
            )
            .await;
            let root = kit.home.root().to_string_lossy().into_owned();
            for (_, line) in kit.log.lines() {
                assert!(
                    !line.contains("https://") && !line.contains(&root),
                    "{line}"
                );
            }
        }
    }
}
