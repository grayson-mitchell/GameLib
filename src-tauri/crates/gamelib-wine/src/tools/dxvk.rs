//! DXVK, dxvk-nvapi, vkd3d and the macOS DXVK: install (`backup`) and remove (`restore`) in a bottle
//! or prefix. A port of `createDxvk` (`DXVK.installRemove`, `DXVK.getLatest`), `restoreDxvkStrict`,
//! `getDxvkUrl` and `getVkd3dUrl` of `src/backend/tools/index.ts`, replayed against the 87-09
//! goldens (`tests/golden_dxvk.rs`) and the TS incident tests (`tests/dxvk_incidents.rs`).
//!
//! The order of every step, the evidence lines the live gates cite (`installing <tool> on...`,
//! `<tool> already installed!`) and the wine commands asked of the wine core (`reg add`, `reg delete`,
//! `reg import`, `reg query`, `wineboot -u`, each with the TS `wait` and `resolveOnExit`) are the
//! TS's. Where this differs, `golden/dxvk/deltas.json` says how and why (D-19): the copies and the
//! version marker are written before the call returns, the DLL names are read in sorted order, and
//! a missing `latest_<tool>` is an error value instead of a thrown ENOENT.
//!
//! Every file this module removes is one the install put (or would have put) in the prefix, named
//! by one entry of the tool's own directory, or a version file of the prefix: single files, no
//! tree removal. The tool's own directories are removed only through `gamelib-safety`
//! (`install_tool`).

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use gamelib_engine::ctx::Platform;
use gamelib_engine::dxvk::{DxvkAction, DxvkRequest, DxvkSource, DxvkTool};
use gamelib_engine::tool_settings::{
    resolve_tool_settings_for_id, CtxToolSettingsDeps, ToolGameId, ToolSettingsResult,
};
use serde_json::Value;

use super::install_tool::{first_line, install_or_update_tool, installed_version, tool_dir, Tool};
use super::vulkan::{Vulkan, VulkanVersion};
use super::{plain_name, DxvkError, ToolsHost, WineCall, WineRunner};
use crate::ctx::WineCtx;
use crate::manager::{log_error, log_info, log_warn};

/// The registry key DLL overrides live under.
const DLL_OVERRIDES_KEY: &str = "HKEY_CURRENT_USER\\Software\\Wine\\DllOverrides";
/// The batched override removal of the strict restore (G30, 261103-wtm), written under `drive_c`.
#[allow(dead_code)] // the remove half (Task 2)
const RESTORE_REG_FILE: &str = "gamelib-dxvk-restore.reg";

const DXVK_LATEST_URL: &str = "https://api.github.com/repos/doitsujin/dxvk/releases/latest";
const DXVK_V1_URL: &str = "https://api.github.com/repos/doitsujin/dxvk/releases/tags/v1.10.3";
const VKD3D_LATEST_URL: &str =
    "https://api.github.com/repos/Heroic-Games-Launcher/vkd3d-proton/releases/latest";
const VKD3D_V2_6_URL: &str =
    "https://api.github.com/repos/Heroic-Games-Launcher/vkd3d-proton/releases/tags/v2.6";
const NVAPI_URL: &str = "https://api.github.com/repos/jp7677/dxvk-nvapi/releases/latest";
// TODO (TS): go back to `latest` once WINEDLLPATH_PREPEND is implemented for dxvk-macOS and DXMT.
const DXVK_MACOS_URL: &str =
    "https://api.github.com/repos/Gcenx/DXVK-macOS/releases/tags/v1.10.3-20230507-repack";

fn exists(path: &str) -> bool {
    Path::new(path).exists()
}

/// `settings[a][b]` as text, `""` when it is not text.
fn setting<'a>(settings: &'a Value, path: &[&str]) -> &'a str {
    let mut at = settings;
    for key in path {
        match at.get(key) {
            Some(next) => at = next,
            None => return "",
        }
    }
    at.as_str().unwrap_or("")
}

/// The names in `dir`, sorted. The TS `readdirSync` order was the file system's; sorted is the same
/// on a file system that lists by name and deterministic on one that does not.
fn read_names(dir: &Path) -> Result<Vec<String>, DxvkError> {
    let mut names = Vec::new();
    for entry in std::fs::read_dir(dir).map_err(|_| DxvkError::Unreadable)? {
        let entry = entry.map_err(|_| DxvkError::Unreadable)?;
        names.push(entry.file_name().to_string_lossy().into_owned());
    }
    names.sort();
    Ok(names)
}

/// `[...new Set(names)]`: first occurrence kept.
fn unique(names: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut seen = HashSet::new();
    names
        .into_iter()
        .filter(|name| seen.insert(name.clone()))
        .collect()
}

/// `name` without its first `.dll` (the TS `replace('.dll', '')`).
fn override_name(dll: &str) -> String {
    dll.replacen(".dll", "", 1)
}

/// An exit code as the TS printed it: `undefined` when there was none.
#[allow(dead_code)] // the remove half (Task 2)
fn code_text(code: Option<i32>) -> String {
    code.map_or_else(|| "undefined".to_string(), |c| c.to_string())
}

/// Who the install is for and where it goes, read once from the request.
struct Target<'a> {
    settings: &'a Value,
    /// The prefix as the settings spell it (the evidence line prints it so).
    prefix: &'a str,
    /// The prefix with `~` replaced by the home directory.
    wine_prefix: String,
    /// `dxvk`, `dxvk-nvapi`, `vkd3d` or `dxvk-macOS` (the macOS DXVK on a Mac).
    tool: &'static str,
    is64: bool,
    dlls32: Vec<String>,
    dlls64: Vec<String>,
}

impl Target<'_> {
    fn system32(&self, dll: &str) -> String {
        format!("{}/drive_c/windows/system32/{dll}", self.wine_prefix)
    }

    fn syswow64(&self, dll: &str) -> String {
        format!("{}/drive_c/windows/syswow64/{dll}", self.wine_prefix)
    }

    /// The DLLs the tool put in the prefix: the 64-bit set in `system32` and the 32-bit set in
    /// `syswow64`, or the 32-bit set alone in `system32` on a 32-bit prefix.
    #[allow(dead_code)] // the remove half (Task 2)
    fn installed_dlls(&self) -> Vec<String> {
        if self.is64 {
            self.dlls64
                .iter()
                .map(|dll| self.system32(dll))
                .chain(self.dlls32.iter().map(|dll| self.syswow64(dll)))
                .collect()
        } else {
            self.dlls32.iter().map(|dll| self.system32(dll)).collect()
        }
    }

    /// The override names (one per DLL name, the `.dll` dropped), once each.
    fn override_names(&self) -> Vec<String> {
        let dlls: Vec<&String> = if self.is64 {
            self.dlls64.iter().chain(self.dlls32.iter()).collect()
        } else {
            self.dlls32.iter().collect()
        };
        unique(dlls.into_iter().map(|dll| override_name(dll)))
    }

    fn current_version_file(&self) -> String {
        format!("{}/current_{}", self.wine_prefix, self.tool)
    }
}

/// One wine command of the tool, with the TS flags: the toggle's wait on the process and the
/// strict restore's settle on exit.
fn wine_call(target: &Target<'_>, parts: &[&str], strict: bool) -> WineCall {
    WineCall {
        settings: target.settings.clone(),
        command_parts: parts.iter().map(|p| (*p).to_string()).collect(),
        wait: !strict,
        resolve_on_exit: strict,
    }
}

/// The DXVK release a Linux host gets (`getDxvkUrl`): the latest where a GPU supports Vulkan 1.3, the
/// 1.10.3 line where one supports 1.1 or 1.2, and the latest again when none does.
async fn dxvk_url(ctx: &WineCtx, vulkan: &mut Vulkan<'_>) -> String {
    if ctx.engine.platform != Platform::Linux {
        return String::new();
    }
    if vulkan.any_gpu_supports([1, 3, 0]).await {
        warn_if_instance_outdated(ctx, vulkan).await;
        return DXVK_LATEST_URL.to_string();
    }
    if vulkan.any_gpu_supports([1, 1, 0]).await {
        log_info(
            ctx,
            "The GPU(s) in this system only support Vulkan 1.1/1.2, falling back to DXVK 1.10.3 for Wine, or use DXVK-Sarek with proton-cachyos",
        );
        return DXVK_V1_URL.to_string();
    }
    log_warn(
        ctx,
        "No GPU with Vulkan 1.1 support found, DXVK will not work",
    );
    DXVK_LATEST_URL.to_string()
}

/// The VKD3D release a Linux host gets (`getVkd3dUrl`), by the same rule.
async fn vkd3d_url(ctx: &WineCtx, vulkan: &mut Vulkan<'_>) -> String {
    if ctx.engine.platform != Platform::Linux {
        return String::new();
    }
    if vulkan.any_gpu_supports([1, 3, 0]).await {
        warn_if_instance_outdated(ctx, vulkan).await;
        return VKD3D_LATEST_URL.to_string();
    }
    if vulkan.any_gpu_supports([1, 1, 0]).await {
        log_info(
            ctx,
            "The GPU(s) in this system only support Vulkan 1.1/1.2, falling back to VKD3D 2.6 for Wine, or use DXVK-Sarek with proton-cachyos",
        );
        return VKD3D_V2_6_URL.to_string();
    }
    log_warn(
        ctx,
        "No GPU with Vulkan 1.1 support found, VKD3D will not work",
    );
    VKD3D_LATEST_URL.to_string()
}

async fn warn_if_instance_outdated(ctx: &WineCtx, vulkan: &mut Vulkan<'_>) {
    let outdated = vulkan
        .instance_version()
        .await
        .is_some_and(|version: VulkanVersion| version < [1, 3, 0]);
    if outdated {
        log_warn(
            ctx,
            "Vulkan 1.3 is supported by GPUs in this system, but instance version is outdated",
        );
    }
}

/// `DXVK.getLatest`: brings the four tools up to their feeds' versions. Windows has nothing to do;
/// offline nothing is looked up. The tools are done one after the other, in the TS list order (the
/// TS started them together), and a tool whose feed failed does not stop the ones after it: the
/// first such failure is returned once all were tried, as the TS rejection was.
pub async fn get_latest(ctx: &WineCtx, host: &ToolsHost) -> Result<(), DxvkError> {
    let mut vulkan = Vulkan::new(ctx, host);
    get_latest_with(ctx, host, &mut vulkan).await
}

/// [`get_latest`] over the caller's Vulkan probes, so an install call asks the helper once.
pub(crate) async fn get_latest_with(
    ctx: &WineCtx,
    host: &ToolsHost,
    vulkan: &mut Vulkan<'_>,
) -> Result<(), DxvkError> {
    if ctx.engine.platform == Platform::Windows {
        return Ok(());
    }
    if !host.online {
        log_warn(ctx, "App offline, skipping possible DXVK update.");
        return Ok(());
    }
    let vkd3d = vkd3d_url(ctx, vulkan).await;
    let dxvk = dxvk_url(ctx, vulkan).await;
    let tools = [
        Tool {
            name: "vkd3d",
            url: vkd3d,
            os: "linux",
            strip: None,
        },
        Tool {
            name: "dxvk",
            url: dxvk,
            os: "linux",
            strip: None,
        },
        Tool {
            name: "dxvk-nvapi",
            url: NVAPI_URL.to_string(),
            os: "linux",
            strip: Some(0),
        },
        Tool {
            name: "dxvk-macOS",
            url: DXVK_MACOS_URL.to_string(),
            os: "darwin",
            strip: None,
        },
    ];
    let mut first_error = None;
    for tool in &tools {
        if let Err(error) = install_or_update_tool(ctx, tool).await {
            first_error.get_or_insert(error);
        }
    }
    first_error.map_or(Ok(()), Err)
}

/// `DXVK.installRemove`: `backup` puts the tool's DLLs in the prefix and registers them, `restore`
/// takes them out again. `Ok(true)` is a toggle that may proceed (including the cases that are
/// deliberately skipped), `Ok(false)` a source-pinned step that failed; `Err` is what the TS
/// rejected with.
pub async fn install_remove(
    ctx: &WineCtx,
    host: &ToolsHost,
    wine: &dyn WineRunner,
    request: DxvkRequest,
) -> Result<bool, DxvkError> {
    let DxvkRequest {
        settings,
        tool: requested,
        action,
        source,
    } = request;
    let mac = ctx.engine.platform == Platform::Mac;

    if setting(&settings, &["wineVersion", "bin"]).contains("toolkit") {
        // Apple's implementation breaks if DXVK goes into the toolkit prefix.
        log_warn(ctx, "Skipping DXVK install on Game Porting Toolkit prefix!");
        return Ok(true);
    }
    if mac && setting(&settings, &["wineVersion", "name"]).ends_with("-DXMT") {
        log_warn(ctx, "Skipping DXVK install on Wine Staging with DXMT!");
        return Ok(true);
    }
    if mac && requested != DxvkTool::Dxvk {
        return Ok(true);
    }

    let prefix = settings
        .get("winePrefix")
        .and_then(Value::as_str)
        .ok_or(DxvkError::BadSettings)?;
    let home = ctx.engine.paths.user_home.to_string_lossy();
    let wine_prefix = prefix.replacen('~', &home, 1);
    // A source-pinned install targets a prefix GameLib just created, which has no
    // `.update-timestamp` yet; `system.reg` is the prefix-exists check there.
    let marker = if source.is_some() {
        "system.reg"
    } else {
        ".update-timestamp"
    };
    if !exists(&format!("{wine_prefix}/{marker}")) {
        log_warn(
            ctx,
            "DXVK cannot be installed on a Proton or a invalid prefix!",
        );
        // True anyway: otherwise the toggle is stuck and the prefix may just not be created yet.
        return Ok(true);
    }

    let tool = if mac { DxvkTool::DxvkMacOs } else { requested };
    let name = tool.as_str();
    let is64 = exists(&format!("{wine_prefix}/drive_c/windows/syswow64"));
    if !is64 {
        log_warn(ctx, "32-bit prefix detected!");
    }

    let mut vulkan = Vulkan::new(ctx, host);
    if source.is_none() && !tool_dir(ctx, name).join(format!("latest_{name}")).exists() {
        log_warn(ctx, "dxvk not found!");
        get_latest_with(ctx, host, &mut vulkan).await?;
    }

    let global_version = match &source {
        Some(source) => source.version.clone(),
        None => {
            let file = tool_dir(ctx, name).join(format!("latest_{name}"));
            first_line(&std::fs::read(file).map_err(|_| DxvkError::MissingLatest)?)
        }
    };
    let (path32, path64) = tool_paths(ctx, name, &global_version, source.as_ref())?;
    let dlls32 = read_names(&path32)?;
    let dlls64 = read_names(&path64)?;

    let target = Target {
        settings: &settings,
        prefix,
        wine_prefix,
        tool: name,
        is64,
        dlls32,
        dlls64,
    };
    let current_file = target.current_version_file();
    let current_version = if exists(&current_file) {
        first_line(&std::fs::read(&current_file).unwrap_or_default())
    } else {
        String::new()
    };

    if action == DxvkAction::Restore {
        // The source-pinned path (the Steam engine switch) reports failure strictly and keeps the
        // version file until every step succeeded (59-REVIEW WR-01); the toggle path does not.
        return Ok(if source.is_some() {
            restore_strict(ctx, wine, &target).await
        } else {
            restore(ctx, wine, &target).await
        });
    }

    install(
        ctx,
        wine,
        &mut vulkan,
        &target,
        Install {
            source: source.as_ref(),
            action,
            global_version: &global_version,
            current_version: &current_version,
            path32: &path32,
            path64: &path64,
        },
    )
    .await
}

/// The tool's `x32` and `x64` directories (`x86` and `x64` for vkd3d), in the tools directory or in
/// a pinned source. The version comes from a file, so it is one plain name.
fn tool_paths(
    ctx: &WineCtx,
    name: &str,
    version: &str,
    source: Option<&DxvkSource>,
) -> Result<(PathBuf, PathBuf), DxvkError> {
    match source {
        Some(source) => Ok((
            Path::new(&source.dir).join("x32"),
            Path::new(&source.dir).join("x64"),
        )),
        None => {
            if !plain_name(version) {
                return Err(DxvkError::Unreadable);
            }
            let base = tool_dir(ctx, name).join(version);
            let x32 = if name == "vkd3d" { "x86" } else { "x32" };
            Ok((base.join(x32), base.join("x64")))
        }
    }
}

/// What the install half needs besides the target.
struct Install<'a> {
    source: Option<&'a DxvkSource>,
    action: DxvkAction,
    global_version: &'a str,
    current_version: &'a str,
    path32: &'a Path,
    path64: &'a Path,
}

async fn install(
    ctx: &WineCtx,
    wine: &dyn WineRunner,
    vulkan: &mut Vulkan<'_>,
    target: &Target<'_>,
    job: Install<'_>,
) -> Result<bool, DxvkError> {
    let name = target.tool;
    log_info(ctx, &format!("installing {name} on... {}", target.prefix));

    // A source-pinned install always recopies, so a retry after a partial restore really puts the
    // DLLs back (CR-03); only the source-less toggle short-circuits.
    if job.source.is_none() && job.current_version == job.global_version {
        log_info(ctx, &format!("{name} already installed!"));
        return Ok(true);
    }

    if job.source.is_some() {
        // Done before the call returns, so the caller can rely on it (the fallback bottle creation).
        let dest32 = if target.is64 { "syswow64" } else { "system32" };
        let copy_all = || -> std::io::Result<()> {
            for dll in &target.dlls32 {
                std::fs::copy(
                    job.path32.join(dll),
                    format!("{}/drive_c/windows/{dest32}/{dll}", target.wine_prefix),
                )?;
            }
            if target.is64 {
                for dll in &target.dlls64 {
                    std::fs::copy(job.path64.join(dll), target.system32(dll))?;
                }
            }
            Ok(())
        };
        if let Err(error) = copy_all() {
            log_error(ctx, &format!("Error when copying {name} DLLs {error}"));
            return Ok(false);
        }
    } else if target.is64 {
        copy_each(ctx, &target.dlls32, job.path32, |dll| target.syswow64(dll));
        copy_each(ctx, &target.dlls64, job.path64, |dll| target.system32(dll));
    } else {
        copy_each(ctx, &target.dlls32, job.path32, |dll| target.system32(dll));
    }

    // Register the DLLs, one at a time, so the call resolves only once the overrides are written.
    for dll in target.override_names() {
        let call = wine_call(
            target,
            &[
                "reg",
                "add",
                DLL_OVERRIDES_KEY,
                "/v",
                &dll,
                "/d",
                "native,builtin",
                "/f",
            ],
            false,
        );
        wine.run(ctx, call).await;
    }

    // Locate and copy nvngx.dll, to support DLSS on Nvidia GPUs.
    if name == "dxvk-nvapi" && job.action == DxvkAction::Backup {
        install_nvngx(ctx, wine, vulkan, target).await;
    }

    let version_file = target.current_version_file();
    if job.source.is_some() {
        if let Err(error) = std::fs::write(&version_file, job.global_version) {
            log_error(ctx, &format!("Error when writing {name} version {error}"));
            return Ok(false);
        }
        return Ok(true);
    }
    if let Err(error) = std::fs::write(&version_file, job.global_version) {
        log_error(ctx, &format!("Error when writing {name} version {error}"));
    }
    Ok(true)
}

/// Copies each DLL of `from` to `to(dll)`, logging a failure and going on (the TS callbacks did).
fn copy_each(ctx: &WineCtx, dlls: &[String], from: &Path, to: impl Fn(&str) -> String) {
    for dll in dlls {
        if let Err(error) = std::fs::copy(from.join(dll), to(dll)) {
            log_error(ctx, &format!("Error when copying {dll} {error}"));
        }
    }
}

async fn install_nvngx(
    ctx: &WineCtx,
    wine: &dyn WineRunner,
    vulkan: &mut Vulkan<'_>,
    target: &Target<'_>,
) {
    let nvngx = vulkan.nvngx_path().await;
    if nvngx.is_empty() {
        log_warn(ctx, "Could not find nvngx.dll for DLSS!");
        return;
    }
    let from = PathBuf::from(format!("{nvngx}/nvidia/wine"));
    for dll in ["nvngx.dll", "_nvngx.dll"] {
        if let Err(error) = std::fs::copy(from.join(dll), target.system32(dll)) {
            log_error(ctx, &format!("Error when copying {dll} {error}"));
        }
    }
    let call = wine_call(
        target,
        &[
            "reg",
            "add",
            "HKEY_LOCAL_MACHINE\\SOFTWARE\\NVIDIA Corporation\\Global\\NGXCore",
            "/v",
            "FullPath",
            "/d",
            "C:\\windows\\system32",
            "/f",
        ],
        false,
    );
    wine.run(ctx, call).await;
}

/// The remove half (`restore`, plain and strict) lands with Task 2; until then a remove answers
/// `false`, which is not a result any golden carries.
async fn restore(_ctx: &WineCtx, _wine: &dyn WineRunner, _target: &Target<'_>) -> bool {
    false
}

async fn restore_strict(_ctx: &WineCtx, _wine: &dyn WineRunner, _target: &Target<'_>) -> bool {
    false
}

/// `installRemove` for a game that is named, not given settings: the settings the tool acts on are
/// resolved through `gamelib_engine::tool_settings` (the same resolver the other Wine tools use, so
/// a bottle-backed game is acted on in its own bottle), without creating a bottle (a read). When
/// there are none (no engine, a bottle that is not provisioned, a shared bottle) nothing is
/// installed and the answer is `Ok(false)`.
pub async fn install_remove_for_game(
    ctx: &WineCtx,
    host: &ToolsHost,
    wine: &dyn WineRunner,
    game: &ToolGameId<'_>,
    stored: &Value,
    tool: DxvkTool,
    action: DxvkAction,
) -> Result<bool, DxvkError> {
    let deps = CtxToolSettingsDeps::new(&ctx.engine);
    let settings =
        match resolve_tool_settings_for_id(&ctx.engine, &deps, game, stored, false).await {
            ToolSettingsResult::Stored { settings }
            | ToolSettingsResult::Engine { settings, .. } => settings,
            ToolSettingsResult::Unavailable { .. } => return Ok(false),
        };
    install_remove(
        ctx,
        host,
        wine,
        DxvkRequest {
            settings,
            tool,
            action,
            source: None,
        },
    )
    .await
}

/// The version `<tools>/<tool>` records as the latest, for a caller that only wants to know.
pub fn latest_version(ctx: &WineCtx, tool: DxvkTool) -> String {
    installed_version(ctx, tool.as_str())
}
