//! `buildGameScopeCommand` and `probeGamescopeHelp` (`gamescopeCommand.ts`). Gamescope has no version
//! option and changed its CLI in 3.12, so, like Lutris, the `--help` text decides.

use std::time::Duration;

use gamelib_core::process::{ProcSpec, SpecRunner};
use serde::Deserialize;

use super::wrappers::{split, ShlexError};

/// How long `gamescope --help` may run before the probe gives up (D-21).
pub const HELP_TIMEOUT: Duration = Duration::from_millis(5_000);

/// The label the probe's child carries in the registry of spawned helpers.
pub const HELP_LABEL: &str = "gamescope-help";

/// The `GameSettings.gamescope` fields the command reads. A missing field is the empty string, a falsy
/// value in the TS; unknown fields are ignored (the full settings object is passed through).
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GamescopeSettings {
    #[serde(default)]
    pub enable_upscaling: bool,
    #[serde(default)]
    pub enable_limiter: bool,
    #[serde(default)]
    pub enable_force_grab_cursor: bool,
    #[serde(default)]
    pub window_type: String,
    #[serde(default)]
    pub game_width: String,
    #[serde(default)]
    pub game_height: String,
    #[serde(default)]
    pub upscale_width: String,
    #[serde(default)]
    pub upscale_height: String,
    #[serde(default)]
    pub upscale_method: String,
    #[serde(default)]
    pub fps_limiter: String,
    #[serde(default)]
    pub fps_limiter_no_focus: String,
    #[serde(default)]
    pub additional_options: Option<String>,
}

/// The gamescope argv: `bin`, the flags the settings ask for in the TS order, `split(additionalOptions)`
/// and a final `--`. The old (< 3.12) CLI is used unless `help_stderr` lists `-F, --filter`. An
/// unterminated quote in the additional options is an error, as the TS throws shlex's own (D-20).
pub fn build_gamescope_command(
    bin: &str,
    settings: &GamescopeSettings,
    help_stderr: &str,
    show_mangohud: bool,
) -> Result<Vec<String>, ShlexError> {
    let old_version = !help_stderr.contains("-F, --filter");
    let mut cmd: Vec<String> = vec![bin.to_string()];
    let mut push = |parts: &[&str]| cmd.extend(parts.iter().map(|p| p.to_string()));

    if settings.enable_upscaling {
        // game res
        if !settings.game_width.is_empty() {
            push(&["-w", &settings.game_width]);
        }
        if !settings.game_height.is_empty() {
            push(&["-h", &settings.game_height]);
        }
        // gamescope res
        if !settings.upscale_width.is_empty() {
            push(&["-W", &settings.upscale_width]);
        }
        if !settings.upscale_height.is_empty() {
            push(&["-H", &settings.upscale_height]);
        }
        // upscale method
        match (settings.upscale_method.as_str(), old_version) {
            ("fsr", true) => push(&["-U"]),
            ("fsr", false) => push(&["-F", "fsr"]),
            ("nis", true) => push(&["-Y"]),
            ("nis", false) => push(&["-F", "nis"]),
            ("integer", true) => push(&["-i"]),
            ("integer", false) => push(&["-S", "integer"]),
            // Stretch is not in the old CLI.
            ("stretch", false) => push(&["-S", "stretch"]),
            _ => {}
        }
        // window type
        match settings.window_type.as_str() {
            "fullscreen" => push(&["-f"]),
            "borderless" => push(&["-b"]),
            _ => {}
        }
    }

    if settings.enable_limiter {
        if !settings.fps_limiter.is_empty() {
            push(&["-r", &settings.fps_limiter]);
        }
        if !settings.fps_limiter_no_focus.is_empty() {
            push(&["-o", &settings.fps_limiter_no_focus]);
        }
    }

    if settings.enable_force_grab_cursor {
        push(&["--force-grab-cursor"]);
    }
    if show_mangohud {
        push(&["--mangoapp"]);
    }

    let additional = split(settings.additional_options.as_deref().unwrap_or(""))?;
    cmd.extend(additional);
    // Note: needs to be the last option.
    cmd.push("--".to_string());
    Ok(cmd)
}

/// The `gamescope --help` text that decides the CLI generation. The child is a helper (the context's
/// `SpecRunner` spawns through `gamelib-proc`) with a 5 s timeout. A timeout, a cancel or a spawn error
/// degrades to `""` (the old-CLI flag set) rather than failing the launch.
pub async fn probe_gamescope_help(proc: &dyn SpecRunner, bin: &str) -> String {
    let mut spec = ProcSpec::new(HELP_LABEL, bin);
    spec.argv = vec!["--help".to_string()];
    spec.timeout = Some(HELP_TIMEOUT);
    let out = proc.run(spec, None).await;
    // `code: None` is a spawn failure (the reason is in stderr) or a child a signal ended: the TS
    // `catch` answered '' for the first and had no stderr worth reading for the second.
    if out.timed_out || out.cancelled || out.code.is_none() {
        return String::new();
    }
    out.stderr
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_core::process::SpecOutput;
    use gamelib_engine::testing::ScriptedSpecRunner;

    fn settings(json: serde_json::Value) -> GamescopeSettings {
        serde_json::from_value(json).unwrap()
    }

    fn build(json: serde_json::Value, help: &str, mango: bool) -> Vec<String> {
        build_gamescope_command("/usr/bin/gamescope", &settings(json), help, mango).unwrap()
    }

    const NEW: &str = "usage ... -F, --filter ...";

    #[test]
    fn nothing_enabled_is_the_bin_and_the_separator() {
        assert_eq!(
            build(serde_json::json!({}), NEW, false),
            ["/usr/bin/gamescope", "--"]
        );
    }

    #[test]
    fn the_help_text_picks_the_cli_generation_for_each_method() {
        let go = |method: &str, help: &str| {
            build(
                serde_json::json!({"enableUpscaling": true, "upscaleMethod": method}),
                help,
                false,
            )[1..]
                .to_vec()
        };
        assert_eq!(go("fsr", NEW), ["-F", "fsr", "--"]);
        assert_eq!(go("fsr", ""), ["-U", "--"]);
        assert_eq!(go("nis", ""), ["-Y", "--"]);
        assert_eq!(go("integer", ""), ["-i", "--"]);
        assert_eq!(go("integer", NEW), ["-S", "integer", "--"]);
        assert_eq!(go("stretch", ""), ["--"]);
        assert_eq!(go("stretch", NEW), ["-S", "stretch", "--"]);
    }

    #[test]
    fn flags_follow_the_ts_order_and_additional_options_come_last() {
        let got = build(
            serde_json::json!({
                "enableUpscaling": true, "gameWidth": "1280", "gameHeight": "720",
                "upscaleWidth": "1920", "upscaleHeight": "1080", "windowType": "borderless",
                "enableLimiter": true, "fpsLimiter": "60", "fpsLimiterNoFocus": "15",
                "enableForceGrabCursor": true, "additionalOptions": "--foo \"bar baz\""
            }),
            NEW,
            true,
        );
        assert_eq!(
            got,
            [
                "/usr/bin/gamescope",
                "-w",
                "1280",
                "-h",
                "720",
                "-W",
                "1920",
                "-H",
                "1080",
                "-b",
                "-r",
                "60",
                "-o",
                "15",
                "--force-grab-cursor",
                "--mangoapp",
                "--foo",
                "bar baz",
                "--"
            ]
        );
    }

    #[test]
    fn an_unterminated_quote_in_the_additional_options_is_an_error() {
        let err = build_gamescope_command(
            "g",
            &settings(serde_json::json!({"additionalOptions": "--foo \"bar"})),
            "",
            false,
        )
        .unwrap_err();
        assert_eq!(err, ShlexError::QuotedEof);
    }

    fn probe(output: SpecOutput) -> (String, Vec<gamelib_engine::testing::RecordedSpawn>) {
        let runner =
            ScriptedSpecRunner::new(Vec::new()).on("/usr/bin/gamescope", &["--help"], output);
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let help = rt.block_on(probe_gamescope_help(&runner, "/usr/bin/gamescope"));
        (help, runner.spawns())
    }

    #[test]
    fn the_probe_asks_for_help_with_a_five_second_bound_under_its_label() {
        let (help, spawns) = probe(SpecOutput {
            code: Some(0),
            stderr: NEW.into(),
            ..SpecOutput::default()
        });
        assert_eq!(help, NEW);
        let [spawn] = &spawns[..] else {
            panic!("one spawn expected")
        };
        assert_eq!(spawn.argv, ["--help"]);
        assert_eq!(spawn.timeout, Some(Duration::from_secs(5)));
        assert_eq!(spawn.label, "gamescope-help");
        assert!(spawn.stdin.is_none());
    }

    #[test]
    fn a_timeout_a_cancel_and_a_spawn_error_answer_empty() {
        for output in [
            SpecOutput {
                timed_out: true,
                stderr: NEW.into(),
                ..SpecOutput::default()
            },
            SpecOutput {
                cancelled: true,
                code: Some(0),
                stderr: NEW.into(),
                ..SpecOutput::default()
            },
            SpecOutput {
                code: None,
                stderr: "spawn ENOENT".into(),
                ..SpecOutput::default()
            },
        ] {
            assert_eq!(probe(output).0, "");
        }
    }
}
