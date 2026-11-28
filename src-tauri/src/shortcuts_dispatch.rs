//! The shell's side of the desktop and Steam shortcut services (Phase 94, SVC-05): the one
//! [`ShortcutsCtx`] and the `shortcuts_*` rustInvoke handlers, over the Tauri-free `gamelib-shortcuts`
//! crate.
//!
//! D-20: one `Arc<ShortcutsCtx>` is built in `run_setup` right after the store host opens, from the
//! shell's own home, app data, icon folder, executable and working directory, `SystemClock`, the
//! platform, `SpecProcRunner` and the process-wide `gamelib_core::shutdown::global()`. Building it
//! spawns nothing and waits on nothing; an op before [`install`] answers `<op>:not-ready`. Every op
//! runs inside the crate's `guarded` wrapper (a shutdown registrant raced against the token).
//!
//! D-17: what an add or remove says to the operator goes through [`ShellShortcutsUi`] (the OS notification
//! and the renderer's dialog frame) with the notice text rendered from the bundled `locales` in the user's
//! language, both installed in the context.
//!
//! D-21: the only child processes an op may start are `reg.exe` (the Windows Desktop folder, now only the
//! fallback: the Desktop is read natively through `RegGetValueW`, UTF-16, installed in the context as
//! `Win32ShellFolders`) and `powershell.exe` (the Windows `.lnk` writer), through `SpecProcRunner` as a
//! helper, hidden and bounded. The crate reads no environment variable; this file
//! supplies the home, the app data folder, the Linux Desktop folder and the Windows expansion
//! environment.
//!
//! T-28-04: nothing here formats an argument, a title or a path into a log line or an error.

use super::*;

use std::path::{Path, PathBuf};

use gamelib_core::clock::SystemClock;
use gamelib_core::emitter::FrontendEmitter;
use gamelib_core::process::BoxFuture;
use gamelib_i18n::Catalog;
use gamelib_proc::spec::SpecProcRunner;
use gamelib_shortcuts::ctx::{
    ApplyResult, Platform, PortableExe, ShortcutPaths, ShortcutsCtx, ShortcutsLog,
    ShortcutsMutation, ShortcutsSummary, ShortcutsUi, SteamShortcutsFile, WikiLookup,
};
use gamelib_shortcuts::http::ReqwestHttp;
#[cfg(windows)]
use gamelib_shortcuts::registry::Win32ShellFolders;
use gamelib_shortcuts::registry::{RegValue, RegValueType, ShellFolderSource, WindowsShellFolder};
use gamelib_store::host::StoreHost;

/// The one context, set once by [`install`].
static SHORTCUTS_CTX: OnceLock<Arc<ShortcutsCtx>> = OnceLock::new();

/// The installed context, or `None` before [`install`] (and in a unit test that built its own).
pub(crate) fn shortcuts_ctx() -> Option<&'static Arc<ShortcutsCtx>> {
    SHORTCUTS_CTX.get()
}

/// The platform the crate is told about (it never asks the OS itself).
fn platform() -> Platform {
    if cfg!(target_os = "macos") {
        Platform::Mac
    } else if cfg!(target_os = "windows") {
        Platform::Windows
    } else {
        Platform::Linux
    }
}

/// The user's home as the TS `AppPaths.userHome` resolves it: `SNAP_REAL_HOME` inside a snap (the
/// snap's own `HOME` is a sandbox directory), else `HOME`, else `USERPROFILE`. `None` when none is
/// set, in which case no context is installed and every op answers not-ready.
fn user_home() -> Option<PathBuf> {
    let non_empty = |name: &str| std::env::var(name).ok().filter(|v| !v.is_empty());
    let snap_home = non_empty("SNAP").and_then(|_| non_empty("SNAP_REAL_HOME"));
    snap_home
        .or_else(|| non_empty("HOME"))
        .or_else(|| non_empty("USERPROFILE"))
        .map(PathBuf::from)
}

/// The Windows `%APPDATA%` (the Start Menu root) as the TS `resolveAppDataDir` reads it: the variable,
/// else `<home>\AppData\Roaming`. `None` off Windows.
fn windows_app_data(
    platform: Platform,
    home: &Path,
    appdata_env: Option<String>,
) -> Option<PathBuf> {
    if platform != Platform::Windows {
        return None;
    }
    Some(match appdata_env.filter(|v| !v.is_empty()) {
        Some(dir) => PathBuf::from(dir),
        None => home.join("AppData").join("Roaming"),
    })
}

/// The Linux Desktop folder as the TS `resolveKnownFolder` finds it, minus its final `<home>/Desktop`
/// fallback (the crate applies that): the exported `XDG_DESKTOP_DIR`, else `user-dirs.dirs` under
/// `XDG_CONFIG_HOME` (or `<home>/.config`). The file is read only when the variable is unset, as the TS
/// `||` short-circuits. `None` off Linux (macOS joins `<home>/Desktop` itself; Windows reads the registry).
fn linux_desktop_dir_with(
    platform: Platform,
    home: &Path,
    exported: Option<String>,
    config_home: Option<String>,
    read_file: impl Fn(&Path) -> Option<String>,
) -> Option<PathBuf> {
    if platform != Platform::Linux {
        return None;
    }
    if exported.as_deref().is_some_and(|dir| !dir.is_empty()) {
        return gamelib_shortcuts::paths::linux_desktop_dir(exported.as_deref(), None, home);
    }
    let config_home = match config_home.filter(|dir| !dir.is_empty()) {
        Some(dir) => PathBuf::from(dir),
        None => home.join(".config"),
    };
    let content = read_file(&config_home.join("user-dirs.dirs"));
    gamelib_shortcuts::paths::linux_desktop_dir(None, content.as_deref(), home)
}

/// The process environment a registry `%VAR%` expands against, snapshotted once (Windows only; the
/// other platforms never read a registry value).
fn expansion_env(platform: Platform) -> Vec<(String, String)> {
    if platform != Platform::Windows {
        return Vec::new();
    }
    std::env::vars_os()
        .map(|(k, v)| {
            (
                k.to_string_lossy().into_owned(),
                v.to_string_lossy().into_owned(),
            )
        })
        .collect()
}

/// `%SystemRoot%` out of the Windows environment snapshot, the way the TS read it (`SystemRoot`, an empty
/// value counting as unset: the writer then uses `C:\Windows`). Windows names are case-insensitive, so
/// the snapshot is searched that way.
fn system_root_of(env: &[(String, String)]) -> Option<PathBuf> {
    env.iter()
        .find(|(name, value)| name.eq_ignore_ascii_case("SystemRoot") && !value.is_empty())
        .map(|(_, value)| PathBuf::from(value))
}

/// Lines go to the shell log. They carry fixed words only (see [`ShortcutsLog`]).
struct ShellShortcutsLog;

impl ShortcutsLog for ShellShortcutsLog {
    fn line(&self, text: &str) {
        shell_log(text);
    }
}

/// One way the shell reaches the operator, as a plain function so a test can record what the
/// [`ShellShortcutsUi`] did without an `AppHandle`.
type NotifySink = Box<dyn Fn(&str, &str) + Send + Sync>;
type DialogSink = Box<dyn Fn(&str, &str, &str) + Send + Sync>;

/// The `showDialog` frame the renderer's dialog handler takes (`dialog.ts` `showDialogBoxModalAuto`: title,
/// message, type, no buttons). It carries no ack id: nothing waits on this dialog being shown.
fn dialog_frame(title: &str, body: &str, kind: &str) -> Vec<Value> {
    vec![
        Value::String(title.to_string()),
        Value::String(body.to_string()),
        Value::String(kind.to_string()),
        Value::Null,
    ]
}

/// The shell's [`ShortcutsUi`] (D-17): what a shortcut op says to the operator.
///
/// - `notify` is the OS notification through `notification_show::show_notification`, the one delivery
///   path `Notification.show()`, the engine and Humble share, with the title and body unchanged.
/// - `show_dialog` is the [`dialog_frame`] pushed through the shell's [`FrontendEmitter`], so the
///   renderer's dialog handler is unchanged.
///
/// Nothing here logs a title or a body (a title can carry a game name).
pub(crate) struct ShellShortcutsUi {
    notify: NotifySink,
    dialog: DialogSink,
}

impl ShellShortcutsUi {
    /// The production sinks over the app handle and the shell's emitter.
    pub(crate) fn for_app(app: &AppHandle, emitter: Arc<dyn FrontendEmitter>) -> ShellShortcutsUi {
        let notify_app = app.clone();
        ShellShortcutsUi {
            notify: Box::new(move |title, body| {
                if notification_show::show_notification(&notify_app, Some(title), Some(body))
                    .is_err()
                {
                    shell_log("shortcuts notification could not be shown");
                }
            }),
            dialog: Box::new(move |title, body, kind| {
                emitter.emit("showDialog", dialog_frame(title, body, kind));
            }),
        }
    }

    /// A UI whose sinks are the given functions, for a test.
    #[cfg(test)]
    pub(crate) fn with_sinks(notify: NotifySink, dialog: DialogSink) -> ShellShortcutsUi {
        ShellShortcutsUi { notify, dialog }
    }
}

impl ShortcutsUi for ShellShortcutsUi {
    fn notify(&self, title: &str, body: &str) {
        (self.notify)(title, body);
    }

    fn show_dialog(&self, title: &str, body: &str, kind: &str) {
        (self.dialog)(title, body, kind);
    }
}

/// The catalog notice text is rendered through, loaded from `locales_dir` in `language` (a shipped code or
/// BCP-47 tag; `en` when `None`). It never fails: a missing or malformed file leaves the catalog empty and
/// every notice renders its English default. Read once at install, so a language changed while GameLib
/// runs reaches shortcut notices on the next start.
fn load_catalog(locales_dir: &Path, language: Option<&str>) -> Arc<Catalog> {
    Arc::new(Catalog::load(locales_dir, language.unwrap_or("en")))
}

/// Steam's `shortcuts.vdf` for the crate (D-09 item 4): the `gamelib-steamfiles` read and apply the
/// `steamfiles_shortcuts_read` and `steamfiles_shortcuts_apply` channels run, called in-process, so a write
/// is the one atomic temp-and-rename edit and this crate never writes the file itself (T-94-36). The crate's
/// types carry the same JSON the channels do.
pub(crate) struct ShellSteamShortcutsFile;

impl ShellSteamShortcutsFile {
    fn call(op: &str, args: Value) -> Result<Value, String> {
        gamelib_steamfiles::dispatch(op, &[args])
    }
}

/// A path as the UTF-8 text the steamfiles channels take; a path that is not UTF-8 is not Steam's.
fn utf8_path(path: &Path) -> Result<&str, String> {
    path.to_str()
        .ok_or_else(|| "shortcuts.vdf path is not UTF-8".to_string())
}

impl SteamShortcutsFile for ShellSteamShortcutsFile {
    fn read(&self, path: &Path) -> Result<ShortcutsSummary, String> {
        let answer = Self::call(
            "steamfiles_shortcuts_read",
            serde_json::json!({ "path": utf8_path(path)? }),
        )?;
        serde_json::from_value(answer)
            .map_err(|_| "steamfiles_shortcuts_read:bad-answer".to_string())
    }

    fn apply(&self, path: &Path, mutation: &ShortcutsMutation) -> Result<ApplyResult, String> {
        let mutation = serde_json::to_value(mutation)
            .map_err(|_| "steamfiles_shortcuts_apply:bad-args".to_string())?;
        let answer = Self::call(
            "steamfiles_shortcuts_apply",
            serde_json::json!({ "path": utf8_path(path)?, "mutation": mutation }),
        )?;
        serde_json::from_value(answer)
            .map_err(|_| "steamfiles_shortcuts_apply:bad-answer".to_string())
    }
}

/// The wiki Steam-id lookup for the crate: `info_wiki_get` over the installed `gamelib-info` context, the same
/// op the native `getWikiGameInfo` channel runs (on the blocking pool, through `run_info_op`). The crate
/// never depends on `gamelib-info`. A context not installed yet, a failed lookup or a wiki with no id is
/// `None` (WR-42: the shortcut is still written, with no Steam id). The context is read when the lookup runs,
/// not when this is installed, so the two services may start in either order.
pub(crate) struct ShellWikiLookup;

impl WikiLookup for ShellWikiLookup {
    fn steam_id(&self, title: &str, app_name: &str, runner: &str) -> BoxFuture<Option<String>> {
        let args = serde_json::json!({ "title": title, "appName": app_name, "runner": runner });
        Box::pin(async move {
            let info = info_ctx()?;
            let answer = info_dispatch::run_info_op(
                Arc::clone(info),
                "info_wiki_get",
                vec![args],
                "shortcuts wiki lookup did not finish",
            )
            .await
            .ok()?;
            gamelib_shortcuts::steam::steam_id_of(&answer)
        })
    }
}

/// How GameLib was started, as a Steam shortcut needs it: the Flatpak id (`FLATPAK_ID`), the AppImage path
/// (`APPIMAGE`) and the portable Windows build's executable and folder (`PORTABLE_EXECUTABLE_FILE` and
/// `PORTABLE_EXECUTABLE_DIR`, both or neither). An empty value counts as unset, as the TS `Boolean(env.X)` did.
type LaunchEnv = (Option<String>, Option<String>, Option<PortableExe>);

fn launch_env_from(get: impl Fn(&str) -> Option<String>) -> LaunchEnv {
    let non_empty = |name: &str| get(name).filter(|value| !value.is_empty());
    let portable = match (
        non_empty("PORTABLE_EXECUTABLE_FILE"),
        non_empty("PORTABLE_EXECUTABLE_DIR"),
    ) {
        (Some(file), Some(dir)) => Some(PortableExe {
            file: PathBuf::from(file),
            dir: PathBuf::from(dir),
        }),
        _ => None,
    };
    (non_empty("FLATPAK_ID"), non_empty("APPIMAGE"), portable)
}

/// Builds the context from its parts. Split from [`install`] so a unit test can build one on a fake
/// home. Nothing here spawns, connects or waits.
pub(crate) fn build_ctx(
    host: Arc<StoreHost>,
    platform: Platform,
    paths: ShortcutPaths,
    expand_env: Vec<(String, String)>,
    shutdown: gamelib_core::shutdown::Shutdown,
) -> ShortcutsCtx {
    // The Windows `.lnk` writer hands PowerShell exactly this snapshot (plus its own variables).
    let system_root = system_root_of(&expand_env);
    let ctx = ShortcutsCtx::new(host, Arc::new(SystemClock), platform, shutdown)
        .with_paths(paths)
        .with_proc(Arc::new(SpecProcRunner))
        .with_base_env(expand_env.clone())
        .with_system_root(system_root)
        .with_http(Arc::new(ReqwestHttp::new()))
        .with_expand_env(expand_env)
        .with_log(Arc::new(ShellShortcutsLog));
    // The Windows shell folders are read natively (RegGetValueW); `reg.exe` stays the fallback.
    #[cfg(windows)]
    let ctx = ctx.with_shell_folders(Arc::new(Win32ShellFolders));
    ctx
}

/// Builds the one context and stores it. Called from `run_setup` after the store host opened and
/// before the sidecar is spawned. A second call is ignored (the first context stays).
pub(crate) fn install(app: &AppHandle, user_data: &Path) {
    let Some(user_home) = user_home() else {
        shell_log("shortcuts context not installed: no home directory");
        return;
    };
    let platform = platform();
    let paths = ShortcutPaths {
        app_data: windows_app_data(platform, &user_home, std::env::var("APPDATA").ok()),
        desktop_dir: linux_desktop_dir_with(
            platform,
            &user_home,
            std::env::var("XDG_DESKTOP_DIR").ok(),
            std::env::var("XDG_CONFIG_HOME").ok(),
            |path| std::fs::read_to_string(path).ok(),
        ),
        // `user_data` is both the user-data directory and the app folder (store_boot), so the icon
        // folder is `<appFolder>/icons` exactly as `appPaths.ts` derives `heroicIconFolder`.
        icon_folder: user_data.join("icons"),
        shell_exe: std::env::current_exe().unwrap_or_default(),
        cwd: std::env::current_dir().unwrap_or_default(),
        user_home,
    };
    let (flatpak_id, appimage, portable_exe) = launch_env_from(|name| std::env::var(name).ok());
    let ctx = build_ctx(
        Arc::clone(store_boot::host()),
        platform,
        paths,
        expansion_env(platform),
        gamelib_core::shutdown::global().clone(),
    )
    .with_steam_files(Arc::new(ShellSteamShortcutsFile))
    .with_wiki(Arc::new(ShellWikiLookup))
    .with_launch_env(flatpak_id, appimage, portable_exe)
    .with_user_data(user_data.to_path_buf());
    let emitter: Arc<dyn FrontendEmitter> =
        Arc::new(steampoll_dispatch::TauriFrontendEmitter(app.clone()));
    // The same locales folder and language the steampoll host and the Humble notices render from.
    let (app_root, asset_dir) = steampoll_dispatch::app_root_and_asset_dir(app);
    let language = gamelib_steampoll::profile::SidecarProfile::current()
        .and_then(|profile| profile.language());
    let ctx = ctx
        .with_ui(Arc::new(ShellShortcutsUi::for_app(app, emitter)))
        .with_catalog(load_catalog(
            &app_root.join(asset_dir).join("locales"),
            language.as_deref(),
        ));
    let _ = SHORTCUTS_CTX.set(Arc::new(ctx));
}

/// The installed context for op `op`, or the fixed "not ready" answer.
fn installed(op: &str) -> Result<&'static ShortcutsCtx, String> {
    shortcuts_ctx()
        .map(|ctx| ctx.as_ref())
        .ok_or_else(|| format!("{op}:not-ready"))
}

/// `shortcuts_exist`: validated by the generated args struct, then the crate (which validates again
/// with its own `deny_unknown_fields` struct).
fn exist_with(ctx: &ShortcutsCtx, args: &[Value]) -> Result<Value, String> {
    ShortcutsExistArgs::from_args(args)?;
    gamelib_shortcuts::dispatch_sync("shortcuts_exist", args, ctx)
}

/// Handlers run on the `rustInvoke` worker thread (never a tokio thread), so the crate's sync facade,
/// which blocks on its own runtime, is legal to call.
pub(crate) fn rpc_shortcuts_exist(args: &[Value]) -> Result<Value, String> {
    exist_with(installed("shortcuts_exist")?, args)
}

/// `shortcuts_add`: validated by the generated args struct, then the crate (which validates again with its own
/// `deny_unknown_fields` structs and the runner and name checks). `notify: true` is the renderer's `addShortcut`
/// (Rust raises the result notice); `notify: false` is a store manager's `addShortcuts` (nothing is shown and a
/// partial failure rejects).
pub(crate) fn rpc_shortcuts_add(args: &[Value]) -> Result<Value, String> {
    let ctx = installed("shortcuts_add")?;
    ShortcutsAddArgs::from_args(args)?;
    gamelib_shortcuts::dispatch_sync("shortcuts_add", args, ctx)
}

/// `shortcuts_remove`: as [`rpc_shortcuts_add`].
pub(crate) fn rpc_shortcuts_remove(args: &[Value]) -> Result<Value, String> {
    let ctx = installed("shortcuts_remove")?;
    ShortcutsRemoveArgs::from_args(args)?;
    gamelib_shortcuts::dispatch_sync("shortcuts_remove", args, ctx)
}

/// `shortcuts_steam_add`: as [`rpc_shortcuts_add`]; the crate answers `not-ready` when the shell's
/// `shortcuts.vdf` seam is missing.
pub(crate) fn rpc_shortcuts_steam_add(args: &[Value]) -> Result<Value, String> {
    let ctx = installed("shortcuts_steam_add")?;
    ShortcutsSteamAddArgs::from_args(args)?;
    gamelib_shortcuts::dispatch_sync("shortcuts_steam_add", args, ctx)
}

/// `shortcuts_steam_remove`: as [`rpc_shortcuts_steam_add`].
pub(crate) fn rpc_shortcuts_steam_remove(args: &[Value]) -> Result<Value, String> {
    let ctx = installed("shortcuts_steam_remove")?;
    ShortcutsSteamRemoveArgs::from_args(args)?;
    gamelib_shortcuts::dispatch_sync("shortcuts_steam_remove", args, ctx)
}

/// `shortcuts_steam_is_added`: as [`rpc_shortcuts_steam_add`].
pub(crate) fn rpc_shortcuts_steam_is_added(args: &[Value]) -> Result<Value, String> {
    let ctx = installed("shortcuts_steam_is_added")?;
    ShortcutsSteamIsAddedArgs::from_args(args)?;
    gamelib_shortcuts::dispatch_sync("shortcuts_steam_is_added", args, ctx)
}

/// `windows_shell_folder_read` (quick 261128-7wv): the raw, unexpanded `User Shell Folders` value of the
/// folder named in `args` with its registry type, `{ "type": "REG_SZ" | "REG_EXPAND_SZ", "data": ... }`, or
/// `null` when `source` is absent or cannot read it. The sidecar expands `%VAR%` only for a
/// `REG_EXPAND_SZ` value (quick 261128-810). Bad args answer a fixed literal that never echoes the input.
fn shell_folder_read_with(
    source: Option<&dyn ShellFolderSource>,
    args: &[Value],
) -> Result<Value, String> {
    let folder = match WindowsShellFolderReadArgs::from_args(args)?.name {
        WindowsShellFolderReadArgsName::Desktop => WindowsShellFolder::Desktop,
        WindowsShellFolderReadArgsName::Personal => WindowsShellFolder::Personal,
    };
    Ok(source.and_then(|s| s.read(folder)).map_or(
        Value::Null,
        |value| serde_json::json!({ "type": value.value_type.as_str(), "data": value.data }),
    ))
}

/// `windows_shell_folder_read`: the native read on Windows (`RegGetValueW`), `null` elsewhere. The answer
/// is the raw value, unexpanded, with its type, so the sidecar applies the same rule as the Rust read. It
/// needs no installed context, so it answers before [`install`] too. It logs nothing: the value holds the
/// user's name and never reaches a log (T-28-04).
pub(crate) fn rpc_windows_shell_folder_read(args: &[Value]) -> Result<Value, String> {
    #[cfg(windows)]
    let source: Option<&dyn ShellFolderSource> = Some(&Win32ShellFolders);
    #[cfg(not(windows))]
    let source: Option<&dyn ShellFolderSource> = None;
    shell_folder_read_with(source, args)
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_testutil::FakeHome;
    use serde_json::json;
    use std::sync::Mutex;

    /// A context on a fake home with the host's own platform.
    fn test_ctx(home: &FakeHome, platform: Platform) -> ShortcutsCtx {
        let root = home.root().to_path_buf();
        let paths = ShortcutPaths {
            user_home: root.clone(),
            app_data: windows_app_data(platform, &root, None),
            desktop_dir: None,
            icon_folder: root.join("icons"),
            shell_exe: root.join("shell-exe"),
            cwd: root.clone(),
        };
        build_ctx(
            Arc::new(StoreHost::new()),
            platform,
            paths,
            Vec::new(),
            gamelib_core::shutdown::Shutdown::new(),
        )
    }

    fn args(title: Option<&str>) -> Vec<Value> {
        match title {
            Some(title) => vec![json!({ "appName": "App", "runner": "legendary", "title": title })],
            None => vec![json!({ "appName": "App", "runner": "legendary" })],
        }
    }

    /// A source answering a fixed raw value and recording which folder it was asked for.
    struct FakeFolders {
        answer: Option<RegValue>,
        asked: Mutex<Vec<WindowsShellFolder>>,
    }

    impl ShellFolderSource for FakeFolders {
        fn read(&self, folder: WindowsShellFolder) -> Option<RegValue> {
            if let Ok(mut asked) = self.asked.lock() {
                asked.push(folder);
            }
            self.answer.clone()
        }
    }

    #[test]
    fn the_shell_folder_channel_answers_the_raw_value_or_null() {
        let fake = FakeFolders {
            answer: Some(RegValue {
                value_type: RegValueType::ExpandSz,
                data: "%USERPROFILE%\\ドキュメント".to_string(),
            }),
            asked: Mutex::new(Vec::new()),
        };
        assert_eq!(
            shell_folder_read_with(Some(&fake), &[json!({ "name": "Personal" })]),
            Ok(json!({ "type": "REG_EXPAND_SZ", "data": "%USERPROFILE%\\ドキュメント" }))
        );
        assert_eq!(
            fake.asked.lock().map(|a| a.clone()).unwrap_or_default(),
            vec![WindowsShellFolder::Personal]
        );
        let literal = FakeFolders {
            answer: Some(RegValue {
                value_type: RegValueType::Sz,
                data: "D:\\50%\\Games\\10%".to_string(),
            }),
            asked: Mutex::new(Vec::new()),
        };
        assert_eq!(
            shell_folder_read_with(Some(&literal), &[json!({ "name": "Desktop" })]),
            Ok(json!({ "type": "REG_SZ", "data": "D:\\50%\\Games\\10%" }))
        );
        let none = FakeFolders {
            answer: None,
            asked: Mutex::new(Vec::new()),
        };
        assert_eq!(
            shell_folder_read_with(Some(&none), &[json!({ "name": "Desktop" })]),
            Ok(Value::Null)
        );
        assert_eq!(
            shell_folder_read_with(None, &[json!({ "name": "Desktop" })]),
            Ok(Value::Null)
        );
    }

    #[test]
    fn the_shell_folder_channel_rejects_bad_args_without_echoing_them() {
        let want = Err("windows_shell_folder_read:bad-args".to_string());
        for bad in [vec![json!({ "name": "Startup" })], vec![json!({})], vec![]] {
            assert_eq!(shell_folder_read_with(None, &bad), want, "{bad:?}");
        }
    }

    #[test]
    fn the_native_shell_folder_reader_is_installed_on_windows_only() {
        let home = FakeHome::new("gamelib-shortcuts-dispatch-");
        let ctx = test_ctx(&home, platform());
        #[cfg(windows)]
        assert!(ctx.shell_folders.is_some());
        #[cfg(not(windows))]
        assert!(ctx.shell_folders.is_none());
    }

    #[test]
    fn an_op_before_install_answers_not_ready() {
        // The test binary never installs the process-wide context.
        assert_eq!(
            rpc_shortcuts_exist(&args(Some("Game"))),
            Err("shortcuts_exist:not-ready".to_string())
        );
    }

    /// The five write ops' args as the TS resolvers send them (Phase 94 plan 22).
    fn game_json() -> Value {
        json!({
            "appName": "App", "runner": "legendary", "title": "Plain Game", "isDlc": false,
            "canAddSteamShortcut": true
        })
    }

    fn settings_json() -> Value {
        json!({
            "addDesktopShortcuts": false, "addStartMenuShortcuts": true, "addSteamShortcuts": false
        })
    }

    #[test]
    fn the_write_ops_answer_not_ready_before_install_whatever_their_args() {
        // The test binary never installs the process-wide context.
        let good = [json!({ "game": game_json(), "settings": settings_json(), "notify": false })];
        let steam = [json!({ "game": game_json(), "settings": settings_json() })];
        let remove = [json!({ "game": game_json(), "notify": false })];
        assert_eq!(
            rpc_shortcuts_add(&good),
            Err("shortcuts_add:not-ready".to_string())
        );
        assert_eq!(
            rpc_shortcuts_remove(&remove),
            Err("shortcuts_remove:not-ready".to_string())
        );
        assert_eq!(
            rpc_shortcuts_steam_add(&steam),
            Err("shortcuts_steam_add:not-ready".to_string())
        );
        assert_eq!(
            rpc_shortcuts_steam_remove(&steam),
            Err("shortcuts_steam_remove:not-ready".to_string())
        );
        assert_eq!(
            rpc_shortcuts_steam_is_added(&steam),
            Err("shortcuts_steam_is_added:not-ready".to_string())
        );
    }

    #[test]
    fn the_generated_args_decode_what_the_resolvers_send_and_refuse_drift() {
        let add = |value: Value| ShortcutsAddArgs::from_args(&[value]);
        assert!(
            add(json!({ "game": game_json(), "settings": settings_json(), "notify": true }))
                .is_ok()
        );
        assert_eq!(
            add(json!({ "game": game_json(), "settings": settings_json() })).err(),
            Some("shortcuts_add:bad-args".to_string()),
            "notify is required: it says who shows the result"
        );
        let mut game = game_json();
        game["runner"] = json!("epic");
        assert!(add(json!({ "game": game, "settings": settings_json(), "notify": true })).is_err());
        assert!(
            ShortcutsRemoveArgs::from_args(&[json!({ "game": game_json(), "notify": false })])
                .is_ok()
        );
        assert!(ShortcutsRemoveArgs::from_args(&[]).is_err());
        let steam = json!({ "game": game_json(), "settings": settings_json() });
        assert!(ShortcutsSteamAddArgs::from_args(std::slice::from_ref(&steam)).is_ok());
        assert!(ShortcutsSteamRemoveArgs::from_args(std::slice::from_ref(&steam)).is_ok());
        assert!(ShortcutsSteamIsAddedArgs::from_args(std::slice::from_ref(&steam)).is_ok());
    }

    #[test]
    fn add_then_exist_then_remove_round_trips_on_a_fake_home() {
        let home = FakeHome::new("gamelib-shortcuts-dispatch-");
        let ctx = test_ctx(&home, Platform::Mac);
        let bundle = home.root().join("Applications").join("Plain Game.app");
        let add = json!({ "game": game_json(), "settings": settings_json(), "notify": false });
        let added = gamelib_shortcuts::dispatch_sync("shortcuts_add", &[add], &ctx).expect("added");
        assert_eq!(added["failed"], json!([]));
        assert_eq!(added["existsAfter"], json!(true));
        assert!(bundle
            .join("Contents")
            .join("MacOS")
            .join("run.sh")
            .is_file());
        assert_eq!(exist_with(&ctx, &args(Some("Plain Game"))), Ok(json!(true)));
        let remove = json!({ "game": game_json(), "notify": false });
        let removed =
            gamelib_shortcuts::dispatch_sync("shortcuts_remove", &[remove], &ctx).expect("removed");
        assert_eq!(removed["existsAfter"], json!(false));
        assert!(!bundle.exists());
    }

    #[test]
    fn exist_answers_false_then_true_once_the_shortcut_is_there() {
        let home = FakeHome::new("gamelib-shortcuts-dispatch-");
        let ctx = test_ctx(&home, Platform::Mac);
        assert_eq!(
            exist_with(&ctx, &args(Some("Plain Game"))),
            Ok(json!(false))
        );
        let bundle = home.root().join("Applications").join("Plain Game.app");
        std::fs::create_dir_all(bundle.join("Contents")).unwrap();
        assert_eq!(exist_with(&ctx, &args(Some("Plain Game"))), Ok(json!(true)));
    }

    #[test]
    fn a_game_with_no_title_is_never_looked_up() {
        let home = FakeHome::new("gamelib-shortcuts-dispatch-");
        let ctx = test_ctx(&home, Platform::Mac);
        let bundle = home.root().join("Applications").join(".app");
        std::fs::create_dir_all(bundle.join("Contents")).unwrap();
        assert_eq!(exist_with(&ctx, &args(None)), Ok(json!(false)));
        assert_eq!(exist_with(&ctx, &args(Some(""))), Ok(json!(false)));
    }

    #[test]
    fn a_dangling_desktop_link_counts_as_present() {
        let home = FakeHome::new("gamelib-shortcuts-dispatch-");
        let ctx = test_ctx(&home, Platform::Mac);
        let desktop = home.root().join("Desktop");
        std::fs::create_dir_all(&desktop).unwrap();
        let link = desktop.join("Plain Game.app");
        let target = home.root().join("Applications").join("gone.app");
        #[cfg(unix)]
        let made = std::os::unix::fs::symlink(&target, &link);
        #[cfg(windows)]
        let made = std::os::windows::fs::symlink_file(&target, &link);
        if !gamelib_testutil::require_link(
            made,
            "a dangling desktop link",
            std::env::var_os("CI").is_some(),
        ) {
            return;
        }
        assert_eq!(exist_with(&ctx, &args(Some("Plain Game"))), Ok(json!(true)));
    }

    #[test]
    fn bad_args_answer_a_fixed_literal_that_never_echoes_the_input() {
        let home = FakeHome::new("gamelib-shortcuts-dispatch-");
        let ctx = test_ctx(&home, Platform::Mac);
        let want = Err("shortcuts_exist:bad-args".to_string());
        assert_eq!(exist_with(&ctx, &[]), want);
        assert_eq!(
            exist_with(
                &ctx,
                &[json!({ "appName": "App", "runner": "secret-runner", "title": "T" })]
            ),
            want
        );
        assert_eq!(
            exist_with(
                &ctx,
                &[json!({ "appName": "App", "runner": "gog", "extra": "secret-text" })]
            ),
            want
        );
        assert_eq!(
            exist_with(
                &ctx,
                &[json!({ "appName": "App", "runner": "gog", "title": 7 })]
            ),
            want
        );
    }

    #[test]
    fn the_windows_app_data_is_the_variable_else_the_roaming_folder() {
        let home = Path::new("C:\\Users\\u");
        assert_eq!(
            windows_app_data(Platform::Windows, home, Some("D:\\Roam".to_string())),
            Some(PathBuf::from("D:\\Roam"))
        );
        assert_eq!(
            windows_app_data(Platform::Windows, home, Some(String::new())),
            Some(home.join("AppData").join("Roaming"))
        );
        assert_eq!(windows_app_data(Platform::Linux, home, None), None);
    }

    #[test]
    fn the_system_root_is_the_non_empty_variable_in_any_case() {
        let env = |pairs: &[(&str, &str)]| -> Vec<(String, String)> {
            pairs
                .iter()
                .map(|(k, v)| ((*k).to_string(), (*v).to_string()))
                .collect()
        };
        assert_eq!(
            system_root_of(&env(&[("PATH", "p"), ("SYSTEMROOT", r"D:\Win")])),
            Some(PathBuf::from(r"D:\Win"))
        );
        assert_eq!(system_root_of(&env(&[("SystemRoot", "")])), None);
        assert_eq!(system_root_of(&env(&[("PATH", "p")])), None);
    }

    #[test]
    fn the_context_carries_the_powershell_environment_and_the_system_root() {
        let home = FakeHome::new("gamelib-shortcuts-dispatch-");
        let paths = ShortcutPaths {
            user_home: home.root().to_path_buf(),
            ..ShortcutPaths::default()
        };
        let snapshot = vec![
            ("PATH".to_string(), "p".to_string()),
            ("SystemRoot".to_string(), r"D:\Win".to_string()),
        ];
        let ctx = build_ctx(
            Arc::new(StoreHost::new()),
            Platform::Windows,
            paths,
            snapshot.clone(),
            gamelib_core::shutdown::Shutdown::new(),
        );
        assert_eq!(ctx.base_env, snapshot);
        assert_eq!(ctx.system_root, Some(PathBuf::from(r"D:\Win")));
        // Off Windows the snapshot is empty, so there is nothing to carry.
        let ctx = test_ctx(&home, Platform::Linux);
        assert!(ctx.base_env.is_empty());
        assert_eq!(ctx.system_root, None);
    }

    #[test]
    fn the_expansion_environment_is_only_read_on_windows() {
        assert!(expansion_env(Platform::Linux).is_empty());
        assert!(expansion_env(Platform::Mac).is_empty());
    }

    #[test]
    fn the_linux_desktop_is_the_exported_variable_then_user_dirs_and_nothing_elsewhere() {
        let home = Path::new("/home/u");
        let never = |_: &Path| -> Option<String> { panic!("the file must not be read") };
        assert_eq!(
            linux_desktop_dir_with(
                Platform::Linux,
                home,
                Some("/exported".to_string()),
                None,
                never
            ),
            Some(PathBuf::from("/exported"))
        );
        let read = |path: &Path| {
            assert_eq!(path, Path::new("/cfg/user-dirs.dirs"));
            Some("XDG_DESKTOP_DIR=\"$HOME/Schreibtisch\"".to_string())
        };
        assert_eq!(
            linux_desktop_dir_with(
                Platform::Linux,
                home,
                Some(String::new()),
                Some("/cfg".to_string()),
                read
            ),
            Some(PathBuf::from("/home/u/Schreibtisch"))
        );
        // No file: the crate's own `<home>/Desktop` fallback applies, so the shell says nothing.
        assert_eq!(
            linux_desktop_dir_with(Platform::Linux, home, None, None, |_| None),
            None
        );
        // The default config folder is `<home>/.config`.
        let default_cfg = |path: &Path| {
            assert_eq!(path, home.join(".config").join("user-dirs.dirs"));
            None
        };
        assert_eq!(
            linux_desktop_dir_with(
                Platform::Linux,
                home,
                None,
                Some(String::new()),
                default_cfg
            ),
            None
        );
        for platform in [Platform::Mac, Platform::Windows] {
            assert_eq!(
                linux_desktop_dir_with(platform, home, Some("/x".to_string()), None, never),
                None
            );
        }
    }

    use gamelib_shortcuts::ctx::EntryField;

    fn steam_entry(title: &str) -> Vec<EntryField> {
        let string = |key: &str, value: &str| EntryField::String {
            key: key.to_string(),
            value: value.to_string(),
        };
        vec![
            string("AppName", title),
            string("Exe", "\"/bin/true\""),
            string("LaunchOptions", "--no-gui"),
            EntryField::Int32 {
                key: "appid".to_string(),
                value: -5,
            },
        ]
    }

    #[test]
    fn the_shell_shortcuts_file_reads_adds_and_removes_through_steamfiles() {
        let home = FakeHome::new("gamelib-shortcuts-dispatch-");
        let file = home.root().join("config").join("shortcuts.vdf");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        let seam = ShellSteamShortcutsFile;
        // No file yet: the read says so, and the add creates it.
        assert!(!seam.read(&file).unwrap().exists);
        let add = ShortcutsMutation::Add {
            entry: steam_entry("Game One"),
            create_if_missing: true,
        };
        let written = seam.apply(&file, &add).unwrap();
        assert!(written.written && !written.already_present);
        let summary = seam.read(&file).unwrap();
        assert!(summary.exists && summary.parsed && summary.root_is_list);
        assert_eq!(summary.entries.len(), 1);
        assert_eq!(summary.entries[0].app_name.as_deref(), Some("Game One"));
        assert!(summary.entries[0].has_exe && summary.entries[0].has_launch_options);
        // The same title again is not written twice.
        let again = seam.apply(&file, &add).unwrap();
        assert!(!again.written && again.already_present);
        assert_eq!(seam.read(&file).unwrap().entries.len(), 1);
        // A removal naming other LaunchOptions matches nothing: the entry stays.
        let other = ShortcutsMutation::Remove {
            app_name: "Game One".to_string(),
            launch_options: "--other".to_string(),
        };
        let refused = seam.apply(&file, &other).unwrap();
        assert!(!refused.written && !refused.matched);
        assert_eq!(seam.read(&file).unwrap().entries.len(), 1);
        // A removal names the entry it took out, for the grid art.
        let removal = ShortcutsMutation::Remove {
            app_name: "Game One".to_string(),
            launch_options: "--no-gui".to_string(),
        };
        let removed = seam.apply(&file, &removal).unwrap();
        assert!(removed.written && removed.matched);
        assert_eq!(removed.removed_exe.as_deref(), Some("\"/bin/true\""));
        assert_eq!(removed.removed_app_name.as_deref(), Some("Game One"));
        assert!(seam.read(&file).unwrap().entries.is_empty());
    }

    #[test]
    fn the_shell_shortcuts_file_reports_a_corrupt_file_and_never_rewrites_it() {
        let home = FakeHome::new("gamelib-shortcuts-dispatch-");
        let file = home.root().join("shortcuts.vdf");
        std::fs::write(&file, b"this is not a shortcuts file").unwrap();
        let seam = ShellSteamShortcutsFile;
        let summary = seam.read(&file).unwrap();
        assert!(summary.exists && !summary.parsed);
        assert!(summary.read_error.as_deref().unwrap().starts_with("parse:"));
        let add = ShortcutsMutation::Add {
            entry: steam_entry("Game"),
            create_if_missing: true,
        };
        let result = seam.apply(&file, &add).unwrap();
        assert!(!result.written);
        assert_eq!(
            std::fs::read(&file).unwrap(),
            b"this is not a shortcuts file"
        );
    }

    /// The whole Add to Steam, "is it in Steam" and Remove from Steam over the real `gamelib-steamfiles`
    /// edit, on a fake Steam tree: the shortcut is in the file the next read sees, the crate's ops agree with
    /// it, and a removal takes it out.
    #[test]
    fn add_to_steam_writes_and_remove_takes_out_a_real_shortcuts_file() {
        let home = FakeHome::new("gamelib-shortcuts-dispatch-");
        let steam = home.root().join("Steam");
        let config = steam.join("userdata").join("1001").join("config");
        std::fs::create_dir_all(&config).unwrap();
        std::fs::create_dir_all(home.root().join("icons")).unwrap();
        let (ui, calls) = recording_ui();
        let ctx = test_ctx(&home, Platform::Linux)
            .with_steam_files(Arc::new(ShellSteamShortcutsFile))
            .with_wiki(Arc::new(ShellWikiLookup))
            .with_ui(Arc::new(ui));
        let args = vec![json!({
            "game": {
                "appName": "game-one", "runner": "legendary", "title": "Game One", "isDlc": false,
                "canAddSteamShortcut": true
            },
            "settings": {
                "addDesktopShortcuts": false, "addStartMenuShortcuts": false,
                "addSteamShortcuts": true, "defaultSteamPath": steam.to_string_lossy()
            }
        })];
        let ask = |op: &str| gamelib_shortcuts::dispatch_sync(op, &args, &ctx);
        assert_eq!(ask("shortcuts_steam_is_added"), Ok(json!(false)));
        // No info service is installed in this test binary: the lookup finds no Steam id, the add goes on.
        assert!(info_ctx().is_none());
        assert_eq!(ask("shortcuts_steam_add"), Ok(json!(true)));
        let summary = ShellSteamShortcutsFile
            .read(&config.join("shortcuts.vdf"))
            .unwrap();
        assert_eq!(summary.entries.len(), 1);
        assert_eq!(summary.entries[0].app_name.as_deref(), Some("Game One"));
        assert!(summary.entries[0]
            .launch_options
            .as_deref()
            .unwrap()
            .contains("gamelib://launch?appName=game-one&runner=legendary"));
        assert_eq!(ask("shortcuts_steam_is_added"), Ok(json!(true)));
        // The transparent logo is the one grid file that needs no download.
        let logos: Vec<_> = std::fs::read_dir(config.join("grid"))
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(logos.len(), 1);
        assert!(logos[0].ends_with("_logo.jpg"));
        assert_eq!(ask("shortcuts_steam_remove"), Ok(Value::Null));
        assert_eq!(ask("shortcuts_steam_is_added"), Ok(json!(false)));
        assert!(ShellSteamShortcutsFile
            .read(&config.join("shortcuts.vdf"))
            .unwrap()
            .entries
            .is_empty());
        assert_eq!(
            std::fs::read_dir(config.join("grid")).unwrap().count(),
            0,
            "the art named by the removed entry's ids is gone"
        );
        let said = calls.lock().unwrap().clone();
        assert_eq!(said.len(), 2, "{said:?}");
        assert!(said[0].starts_with("notify Added to Steam|Game One was successfully added"));
        assert!(said[1].starts_with("notify Removed from Steam|Game One was successfully removed"));
    }

    #[test]
    fn a_wiki_lookup_before_the_info_service_is_installed_finds_no_id() {
        assert!(info_ctx().is_none());
        let answer =
            tauri::async_runtime::block_on(ShellWikiLookup.steam_id("Game", "game", "legendary"));
        assert_eq!(answer, None);
    }

    #[test]
    fn the_launch_environment_counts_an_empty_value_as_unset_and_needs_both_portable_paths() {
        let env = |pairs: &'static [(&'static str, &'static str)]| {
            launch_env_from(move |name| {
                pairs
                    .iter()
                    .find(|(k, _)| *k == name)
                    .map(|(_, v)| (*v).to_string())
            })
        };
        assert_eq!(env(&[]), (None, None, None));
        assert_eq!(
            env(&[("FLATPAK_ID", "org.example.App"), ("APPIMAGE", "")]),
            (Some("org.example.App".to_string()), None, None)
        );
        assert_eq!(
            env(&[("APPIMAGE", "/opt/GameLib.AppImage")]).1.as_deref(),
            Some("/opt/GameLib.AppImage")
        );
        assert_eq!(env(&[("PORTABLE_EXECUTABLE_FILE", "C:\\p\\g.exe")]).2, None);
        let both = env(&[
            ("PORTABLE_EXECUTABLE_FILE", "C:\\p\\g.exe"),
            ("PORTABLE_EXECUTABLE_DIR", "C:\\p"),
        ]);
        assert_eq!(
            both.2,
            Some(PortableExe {
                file: PathBuf::from("C:\\p\\g.exe"),
                dir: PathBuf::from("C:\\p"),
            })
        );
    }

    /// Every notification and dialog a [`ShellShortcutsUi`] was asked for, one line each.
    type UiCalls = Arc<Mutex<Vec<String>>>;

    fn recording_ui() -> (ShellShortcutsUi, UiCalls) {
        let calls: UiCalls = Arc::new(Mutex::new(Vec::new()));
        let (notified, dialogged) = (Arc::clone(&calls), Arc::clone(&calls));
        let ui = ShellShortcutsUi::with_sinks(
            Box::new(move |title, body| {
                notified
                    .lock()
                    .unwrap()
                    .push(format!("notify {title}|{body}"));
            }),
            Box::new(move |title, body, kind| {
                dialogged
                    .lock()
                    .unwrap()
                    .push(format!("dialog {title}|{body}|{kind}"));
            }),
        );
        (ui, calls)
    }

    #[test]
    fn the_shell_ui_passes_a_notification_and_a_dialog_to_its_sinks_unchanged() {
        let (ui, calls) = recording_ui();
        ui.notify(
            "Shortcuts",
            "Shortcuts were created on Desktop and Start Menu",
        );
        ui.show_dialog("Steam", "Added", "MESSAGE");
        assert_eq!(
            *calls.lock().unwrap(),
            [
                "notify Shortcuts|Shortcuts were created on Desktop and Start Menu",
                "dialog Steam|Added|MESSAGE"
            ]
        );
    }

    #[test]
    fn a_dialog_is_the_show_dialog_frame_with_no_buttons_and_no_ack_id() {
        assert_eq!(
            dialog_frame("T", "B", "ERROR"),
            vec![json!("T"), json!("B"), json!("ERROR"), Value::Null]
        );
    }

    #[test]
    fn the_context_carries_the_ui_and_the_catalog_and_renders_a_notice_through_them() {
        let home = FakeHome::new("gamelib-shortcuts-dispatch-");
        let locales = home.root().join("locales").join("en");
        std::fs::create_dir_all(&locales).unwrap();
        std::fs::write(
            locales.join("translation.json"),
            "{\"box\": {\"shortcuts\": {\"title\": \"Verknuepfungen\"}}}",
        )
        .unwrap();
        let (ui, calls) = recording_ui();
        let ctx = test_ctx(&home, Platform::Linux)
            .with_ui(Arc::new(ui))
            .with_catalog(load_catalog(&home.root().join("locales"), None));
        let catalog = ctx.catalog.as_ref().expect("the catalog was loaded");
        let none = serde_json::Map::new();
        // A key in the bundle is rendered; one that is not falls back to its default.
        assert_eq!(
            catalog.t("box.shortcuts.title", "Shortcuts", &none),
            "Verknuepfungen"
        );
        assert_eq!(
            catalog.t("box.shortcuts.error", "Fallback", &none),
            "Fallback"
        );
        ctx.ui.as_ref().expect("the ui was set").notify("t", "b");
        assert_eq!(*calls.lock().unwrap(), ["notify t|b"]);
        // A missing folder is an empty catalog, never a failure.
        let empty = load_catalog(&home.root().join("no-such-locales"), Some("de"));
        assert_eq!(
            empty.t("box.shortcuts.title", "Shortcuts", &none),
            "Shortcuts"
        );
    }
}
