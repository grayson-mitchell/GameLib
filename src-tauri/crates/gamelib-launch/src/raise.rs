//! The Wine window raiser (88.3-13, 82 row `window-raiser`, D-21): bring a Wine or CrossOver game's window to the
//! front on macOS. The game window is a separate unbundled Wine process that macOS focus-stealing protection
//! leaves behind GameLib, so Play looks dead.
//!
//! The port of `createWineWindowRaiser` in `utils/wineWindowRaise.ts`. Mechanism: `osascript` and System Events
//! `set frontmost`, run as a Helper through `ctx.engine.proc` (never a bare spawn). It targets the matched pids
//! first, then falls back to the Windows exe's process name (a matched pid may be a helper that does not own the
//! window). Best-effort: it never fails, is a no-op off macOS and for empty input, and is bounded: at most
//! [`MAX_ATTEMPTS`] attempts [`ATTEMPT_SPACING`] apart, stopping at the first raise, then one [`SETTLE`] re-raise.
//!
//! The AppleScript text is [`RAISE_SCRIPT`], a constant. A pid or a name travels only as an argv element after the
//! count of pids, so a hostile exe name cannot alter the script (T-88.3-29); a pid that is not all ASCII digits is
//! dropped before it is passed.
//!
//! The TS raiser's `stop()` has no twin: it cancelled the pending timer and left the call pending forever (a D-20
//! candidate, `2026-11-28-wine-window-raise-stop-never-settles`). Here the wait between attempts ends on the
//! shutdown token and the call returns, and a run holds a shutdown `Registrant` only while it is in flight. Nothing
//! is logged for a stop. The `osascript` run itself has no time limit, as in the TS (a first run waits on the
//! Automation consent prompt); the shutdown token ends it, so a raise is bounded at about 21 s unless a prompt is held. Every wait is `tokio::time`, so a replay runs on a paused clock.
//!
//! Log lines go to the general log under the `Steam` prefix with the TS text, `raiseWineGameWindow [<context>]: ...`.
//! A failed spawn is one warning line with the fixed text `osascript raise failed`; the OS's own error text is not
//! logged (`golden/window_raise/deltas.json`, `spawn-failure-text`).

use std::time::Duration;

use gamelib_core::process::{ProcSpec, SpecOutput};
use gamelib_engine::ctx::Platform;
use gamelib_log::format::is_js_space;
use gamelib_log::{Level, Prefix};
use serde::Deserialize;
use tokio_util::sync::CancellationToken;

use crate::ctx::LaunchCtx;

/// The most attempts one raise makes.
pub const MAX_ATTEMPTS: u32 = 12;
/// The wait between two attempts.
pub const ATTEMPT_SPACING: Duration = Duration::from_millis(1500);
/// The wait between the first hit and the one re-raise (the window may have been recreated).
pub const SETTLE: Duration = Duration::from_millis(2500);
/// The label of the run in the spawn seam's child registry.
pub const RAISE_LABEL: &str = "window-raise";

/// The AppleScript, byte for byte the TS `RAISE_SCRIPT`. Arguments: the count of pids, the pids, then the names.
pub const RAISE_SCRIPT: &str = "on run argv
  set theArgs to argv
  set pidCount to (item 1 of theArgs) as integer
  set argCount to count of theArgs
  tell application \"System Events\"
    repeat with i from 1 to pidCount
      set pidVal to (item (i + 1) of theArgs) as integer
      set procs to (every process whose unix id is pidVal and visible is true)
      if (count of procs) > 0 then
        set p to item 1 of procs
        set frontmost of p to true
        return (name of p) & \" pid=\" & (unix id of p)
      end if
    end repeat
    repeat with j from (pidCount + 2) to argCount
      set nameVal to (item j of theArgs)
      set procs to (every process whose name is nameVal and visible is true)
      if (count of procs) > 0 then
        set p to item 1 of procs
        set frontmost of p to true
        return (name of p) & \" pid=\" & (unix id of p)
      end if
    end repeat
    return \"none\"
  end tell
end run";

/// One raise (`launch_window_raise`'s argument). Strict: an unknown key is a bad argument.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RaiseArgs {
    /// Names the caller in the log lines (`bridge:<appName>`, ...).
    pub context: String,
    /// The pids to raise, as the text of the process table. A value that is not all ASCII digits is dropped.
    #[serde(default)]
    pub pids: Option<Vec<String>>,
    /// The process names to try when no pid has a window. An empty name is dropped.
    #[serde(default)]
    pub process_names: Option<Vec<String>>,
}

/// `C:\Games\X\X.exe -arg` -> `X.exe`; `None` when there is no `.exe`.
///
/// The TS copies kept as recorded (`golden/window_raise`, the `exe-names` case; a D-20 candidate): it splits on a
/// backslash only (`D:/Games/X.exe` answers the whole path) and cuts at the first `.exe` (`run.exe other.exe`
/// answers `run.exe`).
pub fn windows_exe_name_from_command(command: &str) -> Option<String> {
    let bytes = command.as_bytes();
    let at = (0..bytes.len().saturating_sub(3))
        .find(|&i| bytes[i..i + 4].eq_ignore_ascii_case(b".exe"))?;
    // `.exe` is ASCII, so `at + 4` is a character boundary.
    let up_to_exe = &command[..at + 4];
    let name = match up_to_exe.rfind('\\') {
        Some(sep) => &up_to_exe[sep + 1..],
        None => up_to_exe,
    };
    (!name.is_empty()).then(|| name.to_string())
}

/// The pids that survive the filter: non-empty and all ASCII digits (the TS `/^\d+$/`; JS `\d` is ASCII only).
pub fn clean_pids(pids: Option<&[String]>) -> Vec<String> {
    pids.unwrap_or_default()
        .iter()
        .filter(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()))
        .cloned()
        .collect()
}

/// What one `osascript` attempt came to.
enum Attempt {
    /// The matched process, `<name> pid=<pid>`.
    Hit(String),
    Miss,
    /// The shutdown token ended the run.
    Cancelled,
}

/// Waits `period`, or answers `false` when `token` fires first.
async fn wait(token: &CancellationToken, period: Duration) -> bool {
    tokio::select! {
        biased;
        _ = token.cancelled() => false,
        _ = tokio::time::sleep(period) => true,
    }
}

fn log_warning(ctx: &LaunchCtx, text: &str) {
    ctx.log_sink.general(Prefix::Steam, Level::Warning, text);
}

async fn try_raise(
    ctx: &LaunchCtx,
    argv: &[String],
    prefix: &str,
    token: &CancellationToken,
) -> Attempt {
    let mut spec = ProcSpec::new(RAISE_LABEL, "osascript");
    spec.argv = argv.to_vec();
    // No time limit, as the TS had none: a first run may wait on the Automation consent prompt, and killing it would
    // only raise the prompt again. The shutdown token ends it.
    spec.cancel = Some(token.clone());
    let out: SpecOutput = ctx.engine.proc.run(spec, None).await;
    if out.cancelled {
        return Attempt::Cancelled;
    }
    // The spawn seam answers no code, no signal and no flag when the program could not be started.
    let failed = out.code.is_none() && out.signal.is_none() && !out.timed_out;
    if failed {
        log_warning(ctx, &format!("{prefix} osascript raise failed"));
        return Attempt::Miss;
    }
    let line = out.stdout.trim_matches(is_js_space);
    if line.is_empty() || line == "none" {
        Attempt::Miss
    } else {
        Attempt::Hit(line.to_string())
    }
}

/// `createWineWindowRaiser().raise`: the whole raise, answering when it is over (a hit and its settle re-raise,
/// twelve misses, a no-op or the shutdown). Never an error.
pub async fn raise_wine_window(ctx: &LaunchCtx, args: RaiseArgs) {
    if ctx.engine.platform != Platform::Mac {
        return;
    }
    let pids = clean_pids(args.pids.as_deref());
    let names: Vec<String> = args
        .process_names
        .iter()
        .flatten()
        .filter(|n| !n.is_empty())
        .cloned()
        .collect();
    if pids.is_empty() && names.is_empty() {
        return;
    }

    // Held only while the raise is in flight: the exit path waits for a running attempt (or cancels it).
    let _registrant = ctx.engine.shutdown.register(RAISE_LABEL);
    let token = ctx.engine.shutdown.token();

    let mut argv = vec![
        "-e".to_string(),
        RAISE_SCRIPT.to_string(),
        pids.len().to_string(),
    ];
    argv.extend(pids.iter().cloned());
    argv.extend(names.iter().cloned());
    let prefix = format!("raiseWineGameWindow [{}]:", args.context);

    let mut raised: Option<String> = None;
    for attempt in 0..MAX_ATTEMPTS {
        if token.is_cancelled() {
            return;
        }
        if attempt > 0 && !wait(&token, ATTEMPT_SPACING).await {
            return;
        }
        match try_raise(ctx, &argv, &prefix, &token).await {
            Attempt::Hit(found) => {
                raised = Some(found);
                break;
            }
            Attempt::Miss => {}
            Attempt::Cancelled => return,
        }
    }

    match raised {
        Some(found) => {
            ctx.log_sink.general(
                Prefix::Steam,
                Level::Info,
                &format!("{prefix} raised ({found})"),
            );
            if !wait(&token, SETTLE).await {
                return;
            }
            // The re-raise's own answer is not read; a failure is its warning line.
            let _ = try_raise(ctx, &argv, &prefix, &token).await;
        }
        None => log_warning(
            ctx,
            &format!(
                "{prefix} no matching process after {MAX_ATTEMPTS} attempts (pids={} names={})",
                pids.join(","),
                names.join(",")
            ),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exe_names_are_cut_at_the_first_exe_after_the_last_backslash() {
        let name = |s: &str| windows_exe_name_from_command(s);
        assert_eq!(
            name("C:\\Games\\Avernum 6\\Avernum 6.exe -x").as_deref(),
            Some("Avernum 6.exe")
        );
        assert_eq!(name("game.EXE").as_deref(), Some("game.EXE"));
        assert_eq!(name("/usr/bin/foo"), None);
        assert_eq!(name(""), None);
        assert_eq!(name(".ex"), None);
        assert_eq!(name(".exe").as_deref(), Some(".exe"));
        // A multi-byte character before the extension does not split a character.
        assert_eq!(name("C:\\é\\é.exe").as_deref(), Some("é.exe"));
    }

    #[test]
    fn a_pid_is_kept_only_when_it_is_all_ascii_digits() {
        let pids = ["12", "x", "7; rm", "034", "", "١٢", "5\n"].map(String::from);
        assert_eq!(clean_pids(Some(&pids)), vec!["12", "034"]);
        assert!(clean_pids(None).is_empty());
    }

    #[test]
    fn the_arguments_are_strict_and_camel_case() {
        let ok: RaiseArgs = serde_json::from_value(serde_json::json!({
            "context": "c", "pids": ["1"], "processNames": ["a.exe"]
        }))
        .unwrap();
        assert_eq!(
            ok.process_names.as_deref(),
            Some(&["a.exe".to_string()][..])
        );
        let bare: RaiseArgs =
            serde_json::from_value(serde_json::json!({ "context": "c" })).unwrap();
        assert!(bare.pids.is_none() && bare.process_names.is_none());
        assert!(serde_json::from_value::<RaiseArgs>(serde_json::json!({
            "context": "c", "script": "x"
        }))
        .is_err());
        assert!(serde_json::from_value::<RaiseArgs>(serde_json::json!({ "pids": [] })).is_err());
    }

    #[test]
    fn the_script_is_constant_text_with_no_placeholder_for_an_argument() {
        // Everything an argument could be spliced into would need a marker in the text.
        assert!(!RAISE_SCRIPT.contains("{}") && !RAISE_SCRIPT.contains("%s"));
        assert!(RAISE_SCRIPT.starts_with("on run argv\n") && RAISE_SCRIPT.ends_with("end run"));
    }
}
