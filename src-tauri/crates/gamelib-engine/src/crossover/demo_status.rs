//! The CrossOver trial-state probe (phase 59, D-09), `demoStatus.ts`.
//!
//! Two-profile rule (D-18), the declared **real-profile** arm: CrossOver reads its licence from the
//! real user profile (`~/Library/Preferences/com.codeweavers.CrossOver.license`, spike 060 step 2), so
//! a production probe inherits the process environment under `CX_BOTTLE` (`replace_env: false`). The
//! only other arm is a caller-supplied base environment, used verbatim (`replace_env: true`), which
//! the tests pass a fake profile's variables through. Only stdout is parsed and only a day count is
//! logged: GameLib reads no profile content (T-87-45).

use std::time::Duration;

use gamelib_core::process::ProcSpec;
use serde_json::{json, Value};

use crate::bottles::paths::is_clean_bottle_name;
use crate::ctx::EngineCtx;
use crate::jsutil::{is_js_whitespace, js_trim, path_join, utf16_len};

/// Spike 060 measured 4.2 s cold, 0.9 s warm: about 3.5x headroom.
pub const DEMO_STATUS_CAP_MS: u64 = 15_000;
/// What a probe may read of the child's output, per stream.
const OUTPUT_CAP: usize = 64 * 1024;
/// APFS file-name limit, in UTF-16 units as the TS counted; a bottle is a directory.
const BOTTLE_NAME_MAX: usize = 255;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DemoStatus {
    Licensed,
    Trial { days_remaining: u64 },
    Expired { days_ago: u64 },
    Unrecognised,
}

impl DemoStatus {
    pub fn to_value(self) -> Value {
        match self {
            DemoStatus::Licensed => json!({ "kind": "licensed" }),
            DemoStatus::Trial { days_remaining } => {
                json!({ "kind": "trial", "daysRemaining": days_remaining })
            }
            DemoStatus::Expired { days_ago } => json!({ "kind": "expired", "daysAgo": days_ago }),
            DemoStatus::Unrecognised => json!({ "kind": "unrecognised" }),
        }
    }

    fn kind(self) -> &'static str {
        match self {
            DemoStatus::Licensed => "licensed",
            DemoStatus::Trial { .. } => "trial",
            DemoStatus::Expired { .. } => "expired",
            DemoStatus::Unrecognised => "unrecognised",
        }
    }
}

/// Why a probe failed. The TS also named `spawn-error` for a rejected spawn; a `SpecRunner` cannot tell
/// a spawn that failed from a child that was killed (both are `code: None`), so both read here as
/// [`ProbeFailure::NonzeroExit`] with `code=null` and the runner's stderr in the detail.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProbeFailure {
    InvalidBottle,
    Timeout,
    NonzeroExit,
}

impl ProbeFailure {
    pub fn as_str(self) -> &'static str {
        match self {
            ProbeFailure::InvalidBottle => "invalid-bottle",
            ProbeFailure::Timeout => "timeout",
            ProbeFailure::NonzeroExit => "nonzero-exit",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DemoStatusProbe {
    Ok {
        status: DemoStatus,
        elapsed_ms: u64,
    },
    Failed {
        reason: ProbeFailure,
        detail: String,
        elapsed_ms: u64,
    },
}

impl DemoStatusProbe {
    /// The TS `DemoStatusProbe` object.
    pub fn to_value(&self) -> Value {
        match self {
            DemoStatusProbe::Ok { status, elapsed_ms } => {
                json!({ "kind": "ok", "status": status.to_value(), "elapsedMs": elapsed_ms })
            }
            DemoStatusProbe::Failed {
                reason,
                detail,
                elapsed_ms,
            } => json!({
                "kind": "failed",
                "reason": reason.as_str(),
                "detail": detail,
                "elapsedMs": elapsed_ms,
            }),
        }
    }
}

/// `^\d+` (ASCII digits only, as JS `\d`) followed by `rest`, whole; the number, or `None`. A count too
/// large for `u64` is read as not recognised (the TS would carry a float no caller can use).
fn count_before(text: &str, rest: &str) -> Option<u64> {
    let digits = text.strip_suffix(rest)?;
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    digits.parse().ok()
}

/// The last non-blank line of the probe's stdout decides: `Standard version`, `Demo version (N days
/// remaining)` or `Demo version (expired N days ago)`; anything else is unrecognised.
pub fn parse_demo_status(stdout: &str) -> DemoStatus {
    let last = stdout
        .split('\n')
        .map(|line| js_trim(line.strip_suffix('\r').unwrap_or(line)))
        .rfind(|line| !line.is_empty());
    let Some(last) = last else {
        return DemoStatus::Unrecognised;
    };
    if last == "Standard version" {
        return DemoStatus::Licensed;
    }
    if let Some(body) = last.strip_prefix("Demo version (") {
        if let Some(days) = body
            .strip_suffix(')')
            .and_then(|b| count_before(b, " days remaining"))
        {
            return DemoStatus::Trial {
                days_remaining: days,
            };
        }
        if let Some(days) = body
            .strip_suffix(')')
            .and_then(|b| b.strip_prefix("expired "))
            .and_then(|b| count_before(b, " days ago"))
        {
            return DemoStatus::Expired { days_ago: days };
        }
    }
    DemoStatus::Unrecognised
}

/// First `n` UTF-16 units of `s` (`String.slice(0, n)`).
fn utf16_prefix(s: &str, n: usize) -> String {
    if utf16_len(s) <= n {
        return s.to_string();
    }
    let units: Vec<u16> = s.encode_utf16().take(n).collect();
    String::from_utf16_lossy(&units)
}

/// On macOS CrossOver's Perl `bin/wine` reports wrapper fatal errors on stdout via the cxmessage
/// stand-in (G29), so the nonzero-exit detail keeps stdout too. Collapsing whitespace keeps the text on
/// one log line (no forged lines).
fn one_line(s: &str, cap: usize) -> String {
    let mut collapsed = String::new();
    let mut in_space = false;
    for c in s.chars() {
        if is_js_whitespace(c) {
            in_space = true;
        } else {
            if in_space {
                collapsed.push(' ');
                in_space = false;
            }
            collapsed.push(c);
        }
    }
    // A leading run of whitespace collapses to one space in the TS and `trim` removes it again; a
    // trailing run is dropped here by never being flushed.
    let trimmed = js_trim(&collapsed);
    utf16_prefix(trimmed, cap)
}

/// Runs `<bin_dir>/wine --demo-status` with `CX_BOTTLE` set and reads the answer. `base_env` is `None`
/// in production (the real-profile arm: the process environment is inherited); `Some` replaces the
/// environment with exactly those variables plus `CX_BOTTLE` (the tests' fake profile). A name the
/// engine layer refuses, or over 255 UTF-16 units, is never spawned. `timeout_ms` replaces the 15 s cap.
pub async fn probe_demo_status(
    ctx: &EngineCtx,
    bin_dir: &str,
    bottle_name: &str,
    timeout_ms: Option<u64>,
    base_env: Option<&[(String, String)]>,
) -> DemoStatusProbe {
    let started = ctx.clock.now_ms();
    let elapsed = || ctx.clock.now_ms().saturating_sub(started);
    let log = |outcome: &str, extra: &str, elapsed_ms: u64| {
        if let Some(log) = &ctx.log {
            let extra = if extra.is_empty() {
                String::new()
            } else {
                format!(" {}", utf16_prefix(extra, 700))
            };
            log.info(&format!(
                "Engine: demo-status probe bottle={} outcome={outcome}{extra} elapsedMs={elapsed_ms}",
                utf16_prefix(bottle_name, 64)
            ));
        }
    };
    let fail = |reason: ProbeFailure, detail: String| {
        let elapsed_ms = elapsed();
        log(reason.as_str(), &detail, elapsed_ms);
        DemoStatusProbe::Failed {
            reason,
            detail,
            elapsed_ms,
        }
    };

    // CX_BOTTLE travels in the child's env, not argv, so spaces and punctuation are safe;
    // `is_clean_bottle_name` is the engine layer's one name chokepoint.
    if !is_clean_bottle_name(bottle_name) || utf16_len(bottle_name) > BOTTLE_NAME_MAX {
        return fail(ProbeFailure::InvalidBottle, "bottle name rejected".into());
    }

    let timeout_ms = timeout_ms.unwrap_or(DEMO_STATUS_CAP_MS);
    let mut spec = ProcSpec::new("engine-demo-status", path_join(&[bin_dir, "wine"]));
    spec.argv = vec!["--demo-status".to_string()];
    // `{...baseEnv, CX_BOTTLE}`: the bottle wins over a base variable of the same name.
    spec.env = base_env
        .unwrap_or(&[])
        .iter()
        .filter(|(k, _)| k != "CX_BOTTLE")
        .cloned()
        .chain(std::iter::once((
            "CX_BOTTLE".to_string(),
            bottle_name.to_string(),
        )))
        .collect();
    // The real-profile arm: without a base env the child inherits the process environment.
    spec.replace_env = base_env.is_some();
    spec.stdin = Some(String::new());
    spec.timeout = Some(Duration::from_millis(timeout_ms));
    spec.max_buffer = OUTPUT_CAP;
    let run = ctx.proc.run(spec, None).await;

    if run.timed_out {
        return fail(
            ProbeFailure::Timeout,
            format!("no result within {timeout_ms} ms"),
        );
    }
    if run.code != Some(0) {
        let code = run
            .code
            .map_or_else(|| "null".to_string(), |c| c.to_string());
        return fail(
            ProbeFailure::NonzeroExit,
            format!(
                "code={code} stderr={} stdout={}",
                one_line(&run.stderr, 200),
                one_line(&run.stdout, 400)
            ),
        );
    }
    let status = parse_demo_status(&run.stdout);
    let elapsed_ms = elapsed();
    log("ok", &format!("status={}", status.kind()), elapsed_ms);
    DemoStatusProbe::Ok { status, elapsed_ms }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_three_forms_and_what_surrounds_them() {
        assert_eq!(parse_demo_status("Standard version"), DemoStatus::Licensed);
        assert_eq!(
            parse_demo_status("Demo version (12 days remaining)"),
            DemoStatus::Trial { days_remaining: 12 }
        );
        assert_eq!(
            parse_demo_status("noise\r\n  Demo version (expired 3 days ago)  \r\n\r\n"),
            DemoStatus::Expired { days_ago: 3 }
        );
        for other in [
            "",
            "\n\n",
            "Demo version (x days remaining)",
            "Demo version (-1 days remaining)",
            "Demo version ( 1 days remaining)",
            "Demo version (1 days remaining) extra",
            "Demo version (expired days ago)",
            "Demo version (99999999999999999999999 days remaining)",
        ] {
            assert_eq!(
                parse_demo_status(other),
                DemoStatus::Unrecognised,
                "{other:?}"
            );
        }
    }

    #[test]
    fn one_line_collapses_whitespace_and_caps_in_utf16_units() {
        assert_eq!(one_line("  a\n\tb   c \n", 50), "a b c");
        assert_eq!(one_line("abcdef", 3), "abc");
        assert_eq!(utf16_prefix("a\u{1F600}b", 2), "a\u{FFFD}");
    }
}
