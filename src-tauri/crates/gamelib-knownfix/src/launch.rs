//! The launch-time half of the tier-1 keys `launchArgs` and `exeOverride` (`knownFixLaunch.ts`, quick
//! 261029-mbl), ported for D-03.
//!
//! `exeOverride` is only shape-checked by the reader's validator; this module checks it against the real
//! install folder: it must resolve (realpath) inside the realpath'd install path and be an existing
//! regular file. A symlink inside the install folder cannot escape it, while a symlinked install root is
//! accepted (the same "scan real, return lexical" policy as quick 261029-m0u). Every failure logs a
//! warning and the caller keeps the default executable (T-88-20).
//!
//! Log lines are fixed text. The one place the TS interpolated a path is the "could not be verified"
//! warning, which carried Node's error text with the path in it; here it carries the OS error's own text
//! (`No such file or directory (os error 2)`), which names no path. The info line names the relative
//! override from the fix file, not the resolved absolute path (the EngineLog rule of `gamelib-engine`
//! `sinks.rs`; `golden/launch_overrides/deltas.json`).

use std::path::{Component, Path, PathBuf};

use serde::Serialize;
use serde_json::Value;

use crate::ctx::KnownFixCtx;
use crate::reader::{self, is_valid_exe_override_shape, normalize};
use crate::types::Runner;

/// What the launch path applies from a known fix. `exeOverride` answers `null` (not absent) when there is
/// none, as the TS result carries `undefined` and the renderer-facing JSON of the goldens records `null`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownFixLaunchOverrides {
    pub launch_args: Vec<String>,
    pub exe_override: Option<String>,
}

/// `path.relative(from, to)` for two normalised absolute paths: the way up out of `from` and down into
/// `to`, joined with `/`. Paths on different roots (two Windows drives) have no relative form and answer
/// `to` itself, which is absolute and so counts as an escape, as in Node.
fn relative_text(from: &Path, to: &Path) -> String {
    let from: Vec<Component> = from.components().collect();
    let to_parts: Vec<Component> = to.components().collect();
    let common = from
        .iter()
        .zip(&to_parts)
        .take_while(|(a, b)| same_component(a, b))
        .count();
    let rooted = |parts: &[Component]| {
        matches!(
            parts.first(),
            Some(Component::RootDir | Component::Prefix(_))
        )
    };
    if common == 0 && rooted(&from) && rooted(&to_parts) {
        return to.to_string_lossy().into_owned();
    }
    let mut out: Vec<String> = Vec::new();
    for _ in common..from.len() {
        out.push("..".to_string());
    }
    for part in &to_parts[common..] {
        out.push(part.as_os_str().to_string_lossy().into_owned());
    }
    out.join("/")
}

/// Two path components are the same name; Windows compares them without regard to case, as Node's
/// `path.win32.relative` does.
fn same_component(a: &Component, b: &Component) -> bool {
    if cfg!(windows) {
        a.as_os_str()
            .to_string_lossy()
            .eq_ignore_ascii_case(&b.as_os_str().to_string_lossy())
    } else {
        a == b
    }
}

/// The TS `escapes`: an empty relative path (the install folder itself), one that starts with `..`, or
/// an absolute one (a different root).
fn escapes(relative: &str) -> bool {
    relative.is_empty() || relative.starts_with("..") || Path::new(relative).is_absolute()
}

/// `path.resolve(path)`: absolute against the working directory, with `.` and `..` folded away. Nothing
/// on disk is read.
fn resolve(path: &Path) -> PathBuf {
    if path.is_absolute() {
        normalize(path)
    } else {
        let cwd = std::env::current_dir().unwrap_or_default();
        normalize(&cwd.join(path))
    }
}

/// The install-relative `exeOverride` of a fix as an absolute, existing, regular file inside
/// `install_path`, or `None` (warned) when it is anything else. The returned path is the lexical one
/// (`install_path` joined with the override), not the realpath, so a symlinked install root keeps the
/// path the user knows.
pub fn resolve_exe_override(
    ctx: &KnownFixCtx,
    install_path: &str,
    exe_override: &str,
    label: &str,
) -> Option<PathBuf> {
    let reject = |reason: &str| -> Option<PathBuf> {
        ctx.log_warn(&format!(
            "{label}: known-fix exeOverride '{exe_override}' {reason}, using the default executable."
        ));
        None
    };
    if !is_valid_exe_override_shape(&Value::String(exe_override.to_string())) {
        return reject("is not a relative path inside the install folder");
    }
    if install_path.is_empty() {
        return reject("cannot be checked without an install path");
    }
    let unverified = |error: std::io::Error| reject(&format!("could not be verified ({error})"));
    let normalised = exe_override.replace('\\', "/");
    let real_install = match std::fs::canonicalize(install_path) {
        Ok(real) => real,
        Err(error) => return unverified(error),
    };
    let base = resolve(Path::new(install_path));
    let lexical = normalize(&base.join(&normalised));
    if escapes(&relative_text(&base, &lexical)) {
        return reject("resolves outside the install folder");
    }
    match std::fs::metadata(&lexical) {
        Ok(meta) if meta.is_file() => {}
        Ok(_) => return reject("is not a file"),
        Err(error) => return unverified(error),
    }
    let real_target = match std::fs::canonicalize(&lexical) {
        Ok(real) => real,
        Err(error) => return unverified(error),
    };
    if escapes(&relative_text(&real_install, &real_target)) {
        return reject("resolves outside the install folder");
    }
    Some(lexical)
}

/// The launch arguments and the checked executable override of `app_name`'s known fix, read through the
/// tier-1 reader (local > bundled > remote). Never fails: a game with no fix, or a fix with neither key,
/// answers empty overrides. `install_path` is `None` (or empty) when the install folder is unknown, which
/// drops an `exeOverride` with a warning.
pub fn read_launch_overrides(
    ctx: &KnownFixCtx,
    app_name: &str,
    runner: Runner,
    install_path: Option<&str>,
) -> KnownFixLaunchOverrides {
    let label = format!("Known fix for '{app_name}'");
    let fix = reader::read_known_fixes(ctx, app_name, runner);
    let launch_args: Vec<String> = fix
        .as_ref()
        .and_then(|fix| fix.launch_args.as_ref())
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    // The relative override as the fix file spells it; the validator only lets a non-empty string through.
    let requested = fix
        .as_ref()
        .and_then(|fix| fix.exe_override.as_ref())
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty());
    let mut exe_override: Option<String> = None;
    if let Some(requested) = requested {
        match install_path.filter(|path| !path.is_empty()) {
            Some(install) => {
                exe_override = resolve_exe_override(ctx, install, requested, &label)
                    .map(|path| path.to_string_lossy().into_owned());
            }
            None => ctx.log_warn(&format!(
                "{label}: known-fix exeOverride '{requested}' ignored, the install path is unknown."
            )),
        }
    }
    if !launch_args.is_empty() || exe_override.is_some() {
        let args = Value::from(launch_args.clone());
        let named = match (&exe_override, requested) {
            (Some(_), Some(requested)) => requested,
            _ => "none",
        };
        ctx.log_info(&format!(
            "{label}: known-fix launchArgs {args}, exeOverride {named}"
        ));
    }
    KnownFixLaunchOverrides {
        launch_args,
        exe_override,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_core::clock::SystemClock;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
    use gamelib_engine::testing::RecordingLog;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use std::sync::Arc;

    fn ctx(home: &FakeHome) -> (KnownFixCtx, Arc<RecordingLog>) {
        let root = home.root().to_path_buf();
        let log = Arc::new(RecordingLog::new());
        let engine = EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Linux,
            EnginePaths {
                app_folder: root.clone(),
                user_data: root.clone(),
                tools_path: root.join("tools"),
                user_home: root.join("home"),
                temp: root.join("temp"),
            },
            Shutdown::new(),
        )
        .with_log(log.clone());
        (KnownFixCtx::new(Arc::new(engine), None, "u", "1"), log)
    }

    fn install(home: &FakeHome) -> PathBuf {
        let install = home.root().join("games").join("install");
        std::fs::create_dir_all(install.join("bin")).unwrap();
        std::fs::write(install.join("bin").join("game.exe"), "x").unwrap();
        install
    }

    #[test]
    fn a_valid_override_answers_the_lexical_path_inside_the_install_folder() {
        let home = FakeHome::new("knownfix-launch-");
        let (ctx, log) = ctx(&home);
        let install = install(&home);
        let got = resolve_exe_override(&ctx, install.to_str().unwrap(), "bin/game.exe", "L");
        assert_eq!(got, Some(install.join("bin").join("game.exe")));
        assert!(log.lines().is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn an_override_through_a_symlink_outside_the_install_folder_is_refused() {
        let home = FakeHome::new("knownfix-launch-");
        let (ctx, log) = ctx(&home);
        let install = install(&home);
        let outside = home.root().join("games").join("outside");
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(outside.join("real.exe"), "x").unwrap();
        std::os::unix::fs::symlink(outside.join("real.exe"), install.join("link.exe")).unwrap();
        std::os::unix::fs::symlink(&outside, install.join("linkdir")).unwrap();
        for value in ["link.exe", "linkdir/real.exe"] {
            let got = resolve_exe_override(&ctx, install.to_str().unwrap(), value, "L");
            assert_eq!(got, None, "{value}");
        }
        let lines = log.lines();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].1.ends_with(
            "known-fix exeOverride 'link.exe' resolves outside the install folder, using the default executable."
        ));
    }

    #[test]
    fn a_missing_file_a_directory_and_a_missing_install_keep_the_default_exe() {
        let home = FakeHome::new("knownfix-launch-");
        let (ctx, log) = ctx(&home);
        let install = install(&home);
        let path = install.to_str().unwrap();
        assert_eq!(resolve_exe_override(&ctx, path, "bin/nope.exe", "L"), None);
        assert_eq!(resolve_exe_override(&ctx, path, "bin", "L"), None);
        assert_eq!(resolve_exe_override(&ctx, "", "bin/game.exe", "L"), None);
        let lines: Vec<String> = log.lines().into_iter().map(|(_, text)| text).collect();
        assert!(lines[0].contains("could not be verified ("), "{lines:?}");
        // The OS error text names no path.
        assert!(!lines[0].contains("nope.exe)"), "{lines:?}");
        assert!(
            !lines[0].contains(home.root().to_str().unwrap()),
            "{lines:?}"
        );
        assert!(lines[1].contains("is not a file"));
        assert!(lines[2].contains("cannot be checked without an install path"));
    }

    #[test]
    fn a_traversing_or_absolute_override_fails_the_shape_check_and_the_folder_itself_escapes() {
        let home = FakeHome::new("knownfix-launch-");
        let (ctx, _log) = ctx(&home);
        let install = install(&home);
        let path = install.to_str().unwrap();
        for value in [
            "/etc/passwd",
            "../outside.exe",
            "bin/../../outside.exe",
            "C:\\x",
        ] {
            assert_eq!(
                resolve_exe_override(&ctx, path, value, "L"),
                None,
                "{value}"
            );
        }
        // `.` resolves to the install folder itself: relative is empty, so it escapes.
        assert_eq!(resolve_exe_override(&ctx, path, ".", "L"), None);
    }

    #[test]
    fn the_overrides_read_the_fix_and_name_the_relative_override_in_the_info_line() {
        let home = FakeHome::new("knownfix-launch-");
        let (ctx, log) = ctx(&home);
        let install = install(&home);
        std::fs::create_dir_all(&ctx.paths.local).unwrap();
        std::fs::write(
            ctx.paths.local.join("a-gog.json"),
            r#"{"title":"t","launchArgs":["-x"],"exeOverride":"bin/game.exe"}"#,
        )
        .unwrap();
        let got = read_launch_overrides(&ctx, "a", Runner::Gog, install.to_str());
        assert_eq!(got.launch_args, vec!["-x".to_string()]);
        assert_eq!(
            got.exe_override.as_deref(),
            install.join("bin").join("game.exe").to_str()
        );
        let lines = log.lines();
        assert_eq!(lines.len(), 1);
        assert_eq!(
            lines[0].1,
            "Known fix for 'a': known-fix launchArgs [\"-x\"], exeOverride bin/game.exe"
        );
        assert!(!lines[0].1.contains(home.root().to_str().unwrap()));
        // No install path: the override is dropped with a warning, the arguments stay.
        let got = read_launch_overrides(&ctx, "a", Runner::Gog, None);
        assert_eq!(got.launch_args, vec!["-x".to_string()]);
        assert_eq!(got.exe_override, None);
    }

    #[test]
    fn a_game_with_no_fix_answers_empty_overrides_and_logs_nothing() {
        let home = FakeHome::new("knownfix-launch-");
        let (ctx, log) = ctx(&home);
        let got = read_launch_overrides(&ctx, "nope", Runner::Gog, Some("/x"));
        assert_eq!(got, KnownFixLaunchOverrides::default());
        assert!(log.lines().is_empty());
        assert_eq!(
            serde_json::to_value(&got).unwrap(),
            serde_json::json!({"launchArgs": [], "exeOverride": null})
        );
    }

    #[test]
    fn relative_text_walks_up_and_down_like_node() {
        let rel = |a: &str, b: &str| relative_text(Path::new(a), Path::new(b));
        assert_eq!(rel("/a/b", "/a/b/c/d"), "c/d");
        assert_eq!(rel("/a/b", "/a/b"), "");
        assert_eq!(rel("/a/b", "/a/c"), "../c");
        assert_eq!(rel("/a/b", "/a"), "..");
        assert!(escapes(&rel("/a/b", "/a/c")));
        assert!(!escapes(&rel("/a/b", "/a/b/c")));
    }
}
