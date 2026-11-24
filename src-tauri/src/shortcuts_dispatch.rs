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
//! D-21: the only child process an op may start is `reg.exe` (the Windows Desktop folder), through
//! `SpecProcRunner` as a helper, hidden and bounded. The crate reads no environment variable; this file
//! supplies the home, the app data folder, the Linux Desktop folder and the Windows expansion
//! environment.
//!
//! T-28-04: nothing here formats an argument, a title or a path into a log line or an error.

use super::*;

use std::path::{Path, PathBuf};

use gamelib_core::clock::SystemClock;
use gamelib_proc::spec::SpecProcRunner;
use gamelib_shortcuts::ctx::{Platform, ShortcutPaths, ShortcutsCtx, ShortcutsLog};
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

/// Lines go to the shell log. They carry fixed words only (see [`ShortcutsLog`]).
struct ShellShortcutsLog;

impl ShortcutsLog for ShellShortcutsLog {
    fn line(&self, text: &str) {
        shell_log(text);
    }
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
    ShortcutsCtx::new(host, Arc::new(SystemClock), platform, shutdown)
        .with_paths(paths)
        .with_proc(Arc::new(SpecProcRunner))
        .with_expand_env(expand_env)
        .with_log(Arc::new(ShellShortcutsLog))
}

/// Builds the one context and stores it. Called from `run_setup` after the store host opened and
/// before the sidecar is spawned. A second call is ignored (the first context stays).
pub(crate) fn install(user_data: &Path) {
    let Some(user_home) = user_home() else {
        shell_log("shortcuts context not installed: no home directory");
        return;
    };
    let platform = platform();
    let paths = ShortcutPaths {
        app_data: windows_app_data(platform, &user_home, std::env::var("APPDATA").ok()),
        desktop_dir: None,
        // `user_data` is both the user-data directory and the app folder (store_boot), so the icon
        // folder is `<appFolder>/icons` exactly as `appPaths.ts` derives `heroicIconFolder`.
        icon_folder: user_data.join("icons"),
        shell_exe: std::env::current_exe().unwrap_or_default(),
        cwd: std::env::current_dir().unwrap_or_default(),
        user_home,
    };
    let ctx = build_ctx(
        Arc::clone(store_boot::host()),
        platform,
        paths,
        expansion_env(platform),
        gamelib_core::shutdown::global().clone(),
    );
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

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_testutil::FakeHome;
    use serde_json::json;

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

    #[test]
    fn an_op_before_install_answers_not_ready() {
        // The test binary never installs the process-wide context.
        assert_eq!(
            rpc_shortcuts_exist(&args(Some("Game"))),
            Err("shortcuts_exist:not-ready".to_string())
        );
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
    fn the_expansion_environment_is_only_read_on_windows() {
        assert!(expansion_env(Platform::Linux).is_empty());
        assert!(expansion_env(Platform::Mac).is_empty());
    }
}
