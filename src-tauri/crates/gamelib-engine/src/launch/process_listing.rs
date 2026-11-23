//! The store-agnostic `ps` / `pgrep` process listing and line parser (`processListing.ts`, moved from
//! `steam/bottleProcessMonitor.ts`), so the non-Steam first-match watcher can reuse it.

use std::time::Duration;

use gamelib_core::process::ProcSpec;

use crate::ctx::EngineCtx;
use crate::jsutil::{is_js_whitespace, js_trim};

/// A listing of every process on a busy Mac is a few hundred KiB; this is a generous ceiling, not a
/// target.
const LISTING_CAP: usize = 8 * 1024 * 1024;
/// `ps` answers in milliseconds; a hung one must not hold the watcher.
const LISTING_TIMEOUT: Duration = Duration::from_secs(10);

/// Parses one `ps -axo pid=,command=` line into its pid and command, or `None` when it does not match
/// `^\s*(\d+)\s(.*)$`. Windows command lines contain spaces, so everything after the pid is taken as
/// is, never split further on whitespace; a leading quote is dropped.
pub fn parse_ps_line(line: &str) -> Option<(String, String)> {
    let rest = line.trim_start_matches(is_js_whitespace);
    let digits = rest.bytes().take_while(u8::is_ascii_digit).count();
    if digits == 0 {
        return None;
    }
    let (pid, after) = rest.split_at(digits);
    let mut chars = after.chars();
    if !chars.next().is_some_and(is_js_whitespace) {
        return None;
    }
    let raw = chars.as_str();
    // `.` does not match a line terminator, and the pattern is anchored at the end.
    if raw.contains(['\n', '\r', '\u{2028}', '\u{2029}']) {
        return None;
    }
    let command = js_trim(raw);
    let command = command.strip_prefix('"').unwrap_or(command);
    Some((pid.to_string(), command.to_string()))
}

async fn list_with(
    ctx: &EngineCtx,
    label: &'static str,
    program: &str,
    argv: &[&str],
) -> Result<String, String> {
    let mut spec = ProcSpec::new(label, program);
    spec.argv = argv.iter().map(|a| (*a).to_string()).collect();
    spec.timeout = Some(LISTING_TIMEOUT);
    spec.max_buffer = LISTING_CAP;
    let run = ctx.proc.run(spec, None).await;
    // A program that could not run, timed out or was cancelled has no listing; a nonzero exit still
    // printed what it saw, as `spawnAsync` resolved it.
    if run.code.is_none() || run.timed_out || run.cancelled {
        let why = js_trim(&run.stderr);
        return Err(if why.is_empty() {
            format!("{program} did not run")
        } else {
            why.to_string()
        });
    }
    Ok(run.stdout)
}

/// Phase 59 UAT (G4): `ps` is setuid root, and a sandboxed process cannot exec a setuid binary
/// (`spawn EPERM`). `pgrep -lf .` is not setuid and prints the same `pid command` lines, so it stands
/// in when `ps` cannot run. The `ps` error is the one returned if both fail.
pub async fn list_processes(ctx: &EngineCtx) -> Result<String, String> {
    match list_with(ctx, "engine-ps-listing", "ps", &["-axo", "pid=,command="]).await {
        Ok(listing) => Ok(listing),
        Err(ps_error) => list_with(ctx, "engine-pgrep-listing", "pgrep", &["-lf", "."])
            .await
            .map_err(|_| ps_error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_line_without_a_pid_and_a_separator_is_not_a_process() {
        for line in [
            "",
            "  123",
            "  PID COMMAND",
            "abc /bin/x",
            "12abc x",
            "12 a\nb",
        ] {
            assert_eq!(parse_ps_line(line), None, "{line:?}");
        }
        assert_eq!(
            parse_ps_line("  9  two-spaces"),
            Some(("9".to_string(), "two-spaces".to_string()))
        );
    }
}
