//! Whether a shortcut for a game exists on disk right now (`shortcutsExists`). Ported from
//! `shortcutsExistOnDisk` in `sidecar/shortcutsFlowRegistration.ts` and `shortcutPathPresent` in
//! `shortcuts.ts`. Read-only: nothing here writes, deletes or creates.
//!
//! A path is present when it exists or is a symlink (261026-ctm): a dangling Desktop link fails
//! `exists` but is still a leftover the user must be able to Remove. A game with no title is never
//! looked up (260905-mv5): its title feeds a file path, and a made-up title would produce a plausible
//! path the app never wrote to.
//!
//! Pinned to the TS by the `golden/exists` replay.

use std::path::{Path, PathBuf};

use crate::ctx::{Platform, ShortcutPaths, ShortcutsCtx};
use crate::paths::shortcut_files;
use crate::registry;

/// True when `path` exists or is a symlink, dangling or not. An empty path is never present.
pub fn shortcut_path_present(path: &Path) -> bool {
    if path.exists() {
        return true;
    }
    std::fs::symlink_metadata(path).is_ok_and(|meta| meta.file_type().is_symlink())
}

/// Whether either shortcut file of `title` is present, with the presence test injected. `None` and
/// an empty title answer `false` without looking at the disk.
pub fn shortcuts_exist_at(
    platform: Platform,
    paths: &ShortcutPaths,
    title: Option<&str>,
    windows_desktop: Option<&Path>,
    present: &dyn Fn(&Path) -> bool,
) -> bool {
    let Some(title) = title.filter(|t| !t.is_empty()) else {
        return false;
    };
    let (desktop, menu) = shortcut_files(platform, paths, title, windows_desktop);
    desktop.as_deref().is_some_and(present) || menu.as_deref().is_some_and(present)
}

/// The Windows Desktop folder, read from the registry (D-12); `None` off Windows. On Windows no answer (no
/// runner, a failed query, an absent value) means there is no Desktop path, never a guessed one.
pub(crate) async fn windows_desktop_for(ctx: &ShortcutsCtx) -> Option<PathBuf> {
    match (ctx.platform, ctx.proc.as_deref()) {
        (Platform::Windows, Some(proc)) => {
            registry::windows_desktop_dir(proc, &ctx.expand_env).await
        }
        _ => None,
    }
}

/// The `shortcuts_exist` op body: reads the Windows Desktop from the registry on Windows (D-12) and
/// answers whether either shortcut file is present.
pub async fn shortcuts_exist(ctx: &ShortcutsCtx, title: Option<&str>) -> bool {
    if title.is_none_or(str::is_empty) {
        ctx.note("shortcuts_exist: no title, shortcut lookup skipped");
        return false;
    }
    let windows_desktop = windows_desktop_for(ctx).await;
    shortcuts_exist_at(
        ctx.platform,
        &ctx.paths,
        title,
        windows_desktop.as_deref(),
        &shortcut_path_present,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_empty_path_is_not_present() {
        assert!(!shortcut_path_present(Path::new("")));
    }

    #[test]
    fn a_missing_title_is_never_looked_up() {
        let paths = ShortcutPaths {
            user_home: PathBuf::from("/home/u"),
            ..ShortcutPaths::default()
        };
        let always = |_: &Path| true;
        assert!(!shortcuts_exist_at(
            Platform::Linux,
            &paths,
            None,
            None,
            &always
        ));
        assert!(!shortcuts_exist_at(
            Platform::Linux,
            &paths,
            Some(""),
            None,
            &always
        ));
        assert!(shortcuts_exist_at(
            Platform::Linux,
            &paths,
            Some("G"),
            None,
            &always
        ));
    }

    use crate::testing::ScriptedRunner;
    use gamelib_core::clock::SystemClock;
    use gamelib_core::process::SpecOutput;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use std::sync::Arc;

    /// A Windows context whose Start Menu root is inside a fake home.
    fn windows_ctx(home: &FakeHome, proc: Option<Arc<ScriptedRunner>>) -> ShortcutsCtx {
        let app_data = home.root().join("AppData").join("Roaming");
        let mut ctx = ShortcutsCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Windows,
            Shutdown::new(),
        )
        .with_paths(ShortcutPaths {
            user_home: home.root().to_path_buf(),
            app_data: Some(app_data),
            ..ShortcutPaths::default()
        });
        if let Some(proc) = proc {
            ctx = ctx.with_proc(proc);
        }
        ctx
    }

    fn reg_answer(value: &str) -> SpecOutput {
        SpecOutput {
            code: Some(0),
            stdout: format!(
                "\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders\r\n    Desktop    REG_SZ    {value}\r\n\r\n"
            ),
            ..SpecOutput::default()
        }
    }

    fn seed_start_menu_link(ctx: &ShortcutsCtx, title: &str) {
        let (_, menu) = shortcut_files(Platform::Windows, &ctx.paths, title, None);
        let menu = menu.expect("a Windows Start Menu path");
        std::fs::create_dir_all(menu.parent().expect("a parent")).expect("menu dir");
        std::fs::write(menu, "").expect("menu link");
    }

    #[tokio::test]
    async fn windows_reads_the_desktop_through_one_hidden_bounded_reg_query() {
        let home = FakeHome::new("gamelib-shortcuts-exists-");
        let runner = Arc::new(ScriptedRunner::answering(reg_answer(
            "Z:\\GameLibOracle\\Desktop",
        )));
        let ctx = windows_ctx(&home, Some(Arc::clone(&runner)));
        seed_start_menu_link(&ctx, "Plain Game");
        assert!(shortcuts_exist(&ctx, Some("Plain Game")).await);
        let spawns = runner.spawns();
        assert_eq!(spawns.len(), 1);
        assert_eq!(spawns[0].program, "reg.exe");
        assert!(spawns[0].hide_window, "reg.exe must not flash a console");
        assert_eq!(spawns[0].timeout, Some(crate::registry::REG_QUERY_TIMEOUT));
        assert_eq!(spawns[0].label, "shortcuts-reg");
    }

    #[tokio::test]
    async fn windows_without_a_runner_or_with_a_failed_query_has_no_desktop_path() {
        let home = FakeHome::new("gamelib-shortcuts-exists-");
        // No runner: the Start Menu link still counts, and nothing is spawned.
        let ctx = windows_ctx(&home, None);
        assert!(!shortcuts_exist(&ctx, Some("Plain Game")).await);
        seed_start_menu_link(&ctx, "Plain Game");
        assert!(shortcuts_exist(&ctx, Some("Plain Game")).await);
        // A failed query: no Desktop path, so a Desktop link cannot be found, only the menu one.
        let failed = Arc::new(ScriptedRunner::answering(SpecOutput {
            code: Some(1),
            ..SpecOutput::default()
        }));
        let ctx = windows_ctx(&home, Some(Arc::clone(&failed)));
        assert!(shortcuts_exist(&ctx, Some("Plain Game")).await);
        assert_eq!(failed.spawns().len(), 1);
    }

    #[tokio::test]
    async fn linux_and_macos_never_spawn_a_registry_query() {
        let home = FakeHome::new("gamelib-shortcuts-exists-");
        for platform in [Platform::Linux, Platform::Mac] {
            let runner = Arc::new(ScriptedRunner::answering(SpecOutput::default()));
            let mut ctx = windows_ctx(&home, Some(Arc::clone(&runner)));
            ctx.platform = platform;
            assert!(!shortcuts_exist(&ctx, Some("Plain Game")).await);
            assert!(runner.spawns().is_empty());
        }
    }
}
