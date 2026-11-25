//! `getWinePath` (`commandRunner.ts`): a path translated by `winepath` inside a game's prefix.
//!
//! `cmd /c winepath -u|-w <path>` runs through the wine command core with the `runinprefix` verb and its own
//! logging off, so the spawn is a Helper of `gamelib-wine` (D-21) and the whole environment is the core's. The
//! answer is the trimmed stdout; an empty answer logs one fixed line and is returned as the empty string, which
//! the caller treats as "no such path". 88.2's runner `getWinePath` calls this same function.

use gamelib_wine::wine_cmd::command::{run_wine_command, WineCommandArgs};
use gamelib_wine::wine_cmd::env::GameSettingsView;
use gamelib_wine::wine_cmd::WineHost;

use crate::ctx::LaunchCtx;

/// Which side `winepath` converts to (`-u` for a unix path, `-w` for a Windows one).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PathVariant {
    /// `winepath -u`: the unix path of a Windows path.
    Unix,
    /// `winepath -w`: the Windows path of a unix path.
    Win,
}

impl PathVariant {
    fn flag(self) -> &'static str {
        match self {
            PathVariant::Unix => "-u",
            PathVariant::Win => "-w",
        }
    }
}

/// The line logged when `winepath` answers nothing. Fixed text: the path asked about and `winepath`'s own
/// standard error (which can name a profile path) are never logged (T-88.1-12).
const NO_WINE_PATH: &str = "Couldn't get wine path";

/// `getWinePath`: `path` as `variant` names it, through `winepath` in the prefix `settings` name. Answers the
/// trimmed output, `""` when `winepath` printed nothing (the wine could not run, or the path is unknown), with
/// the fixed [`NO_WINE_PATH`] error line.
pub async fn get_wine_path(
    ctx: &LaunchCtx,
    settings: &GameSettingsView,
    path: &str,
    variant: PathVariant,
    host: &WineHost,
) -> String {
    let args = WineCommandArgs {
        game_settings: Some(settings.clone()),
        command_parts: ["cmd", "/c", "winepath", variant.flag(), path]
            .iter()
            .map(|part| part.to_string())
            .collect(),
        wait: false,
        proton_verb: Some("runinprefix".to_string()),
        ignore_logging: true,
        ..WineCommandArgs::default()
    };
    let result = run_wine_command(&ctx.wine, args, host).await;
    let answer = result.stdout.trim().to_string();
    if answer.is_empty() {
        if let Some(log) = ctx.engine.log.as_ref() {
            log.error(NO_WINE_PATH);
        }
    }
    answer
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    use gamelib_core::clock::SystemClock;
    use gamelib_core::process::SpecOutput;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
    use gamelib_engine::testing::{RecordingLog, ScriptedSpecRunner};
    use gamelib_knownfix::ctx::KnownFixCtx;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use gamelib_wine::ctx::WineCtx;
    use serde_json::json;

    /// A launch context over a fake HOME whose wine commands are answered by `runner`.
    fn ctx_over(
        home: &FakeHome,
        runner: Arc<ScriptedSpecRunner>,
    ) -> (LaunchCtx, Arc<RecordingLog>) {
        let log = Arc::new(RecordingLog::new());
        let root = home.root().to_path_buf();
        let engine = Arc::new(
            EngineCtx::new(
                Arc::new(StoreHost::new()),
                Arc::new(SystemClock),
                Platform::Linux,
                EnginePaths {
                    tools_path: root.join("tools"),
                    user_data: root.join("data"),
                    app_folder: root.join("app"),
                    user_home: root.clone(),
                    temp: root.join("tmp"),
                },
                Shutdown::new(),
            )
            .with_proc(runner)
            .with_log(log.clone()),
        );
        let knownfix = Arc::new(KnownFixCtx::new(
            engine.clone(),
            None,
            "https://relay.test",
            "t",
        ));
        let wine = Arc::new(WineCtx::new(engine.clone(), root.join("runtimes")));
        let info = Arc::new(gamelib_info::ctx::InfoCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            gamelib_info::ctx::Platform::Linux,
            gamelib_info::ctx::InfoPaths {
                app_folder: root.join("app"),
                user_data: root.join("app"),
                temp: root.join("tmp"),
                public_dir: None,
            },
            "t".to_string(),
            Shutdown::new(),
            Arc::new(gamelib_info::http::ReqwestHttp::new()),
        ));
        (LaunchCtx::new(engine, knownfix, wine, info), log)
    }

    /// A wine that exists and a prefix a wine would call complete, so the command goes straight to the spawn.
    fn lay_out(home: &FakeHome) {
        let wine = home.root().join("wine/bin/wine");
        std::fs::create_dir_all(wine.parent().unwrap()).unwrap();
        for bin in ["wine", "wineserver"] {
            let path = wine.with_file_name(bin);
            std::fs::write(&path, "").unwrap();
            std::fs::set_permissions(&path, std::os::unix::fs::PermissionsExt::from_mode(0o755))
                .unwrap();
        }
        for dir in ["wine/lib64", "wine/lib"] {
            std::fs::create_dir_all(home.root().join(dir)).unwrap();
        }
        let prefix = home.root().join("prefix");
        for dir in ["dosdevices", "drive_c"] {
            std::fs::create_dir_all(prefix.join(dir)).unwrap();
        }
        for file in ["system.reg", "user.reg", "userdef.reg"] {
            std::fs::write(prefix.join(file), "").unwrap();
        }
    }

    fn settings(home: &FakeHome) -> GameSettingsView {
        let root = home.root().to_string_lossy().into_owned();
        serde_json::from_value(json!({
            "winePrefix": format!("{root}/prefix"),
            "wineVersion": {
                "bin": format!("{root}/wine/bin/wine"),
                "name": "Wine",
                "type": "wine",
                "wineserver": format!("{root}/wine/bin/wineserver"),
                "lib": format!("{root}/wine/lib64"),
                "lib32": format!("{root}/wine/lib"),
            },
        }))
        .unwrap()
    }

    #[test]
    fn an_empty_answer_is_the_empty_string_with_one_fixed_error_line() {
        let home = FakeHome::new("wine-path-");
        lay_out(&home);
        // Nothing scripted: the spawn is answered with an empty output and no exit code.
        let runner = Arc::new(ScriptedSpecRunner::new(Vec::new()));
        let (ctx, log) = ctx_over(&home, runner);
        let settings = settings(&home);
        let host = WineHost::default();
        let got = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(get_wine_path(
                &ctx,
                &settings,
                "C:\\Secret\\file.exe",
                PathVariant::Unix,
                &host,
            ));
        assert_eq!(got, "");
        let errors: Vec<String> = log
            .lines()
            .into_iter()
            .filter(|(level, _)| *level == "error")
            .map(|(_, text)| text)
            .collect();
        assert_eq!(errors, vec![NO_WINE_PATH.to_string()]);
        // The path asked about is in no line.
        assert!(log.lines().iter().all(|(_, text)| !text.contains("Secret")));
    }

    #[test]
    fn the_answer_is_trimmed_and_the_flag_follows_the_variant() {
        let home = FakeHome::new("wine-path-");
        lay_out(&home);
        let wine = home.root().join("wine/bin/wine");
        let program = wine.to_string_lossy().into_owned();
        let runner = Arc::new(ScriptedSpecRunner::new(Vec::new()).on(
            &program,
            &["cmd", "/c", "winepath", "-w", "/home/x/file.exe"],
            SpecOutput {
                code: Some(0),
                stdout: "  Z:\\home\\x\\file.exe\n".to_string(),
                ..SpecOutput::default()
            },
        ));
        let (ctx, log) = ctx_over(&home, runner);
        let settings = settings(&home);
        let host = WineHost::default();
        let got = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(get_wine_path(
                &ctx,
                &settings,
                "/home/x/file.exe",
                PathVariant::Win,
                &host,
            ));
        assert_eq!(got, "Z:\\home\\x\\file.exe");
        assert!(log.lines().is_empty());
    }
}
