//! Which Steam client pids exist, and their start tokens (the `steamClientProcess.ts` probes).
//! Used by the adoption watch and by the D-12 boot migration of the old restart-hold store.
//!
//! Probes spawn fixed programs with argv arrays and integer pids only (T-80-22).

use crate::host::ProcessRunner;
use crate::profile::Platform;
use std::collections::HashMap;
use std::time::Duration;

/// Hard bound on a single probe child (tasklist measured about 200 ms cold).
const PROBE_TIMEOUT: Duration = Duration::from_millis(5000);
/// Cold PowerShell start is much slower than tasklist; still one bounded child.
const START_TOKEN_TIMEOUT: Duration = Duration::from_millis(15_000);

fn positive_pid(text: &str) -> Option<u32> {
    if text.is_empty() || !text.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    text.parse::<u32>().ok().filter(|p| *p > 0)
}

/// `tasklist /FO CSV /NH` into steam.exe pids: only rows whose first column is exactly
/// `steam.exe` (case-insensitive) count.
pub fn parse_tasklist_steam_pids(stdout: &str) -> Vec<u32> {
    const PREFIX: &str = "\"steam.exe\",\"";
    stdout
        .lines()
        .filter_map(|line| {
            let t = line.trim();
            let head = t.get(..PREFIX.len())?;
            if !head.eq_ignore_ascii_case(PREFIX) {
                return None;
            }
            let rest = &t[PREFIX.len()..];
            let digits = rest.split('"').next().filter(|_| rest.contains('"'))?;
            positive_pid(digits)
        })
        .collect()
}

/// `pgrep` stdout (one pid per line).
pub fn parse_pgrep_pids(stdout: &str) -> Vec<u32> {
    stdout
        .lines()
        .filter_map(|l| positive_pid(l.trim()))
        .collect()
}

/// `<pid> <token>` lines into pid -> opaque token; internal whitespace is collapsed so equal
/// instants compare equal.
pub fn parse_pid_token_lines(stdout: &str) -> HashMap<u32, String> {
    let mut out = HashMap::new();
    for line in stdout.lines() {
        let t = line.trim();
        let digits_end = t.bytes().take_while(u8::is_ascii_digit).count();
        if digits_end == 0 {
            continue;
        }
        let (pid_text, rest) = t.split_at(digits_end);
        if !rest.starts_with(char::is_whitespace) {
            continue;
        }
        let token = rest.split_whitespace().collect::<Vec<_>>().join(" ");
        let Some(pid) = positive_pid(pid_text) else {
            continue;
        };
        if token.is_empty() {
            continue;
        }
        out.insert(pid, token);
    }
    out
}

fn system_root() -> String {
    std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string())
}

fn win_join(base: &str, parts: &[&str]) -> String {
    let mut out = base.trim_end_matches('\\').to_string();
    for p in parts {
        out.push('\\');
        out.push_str(p);
    }
    out
}

/// Lists the pids of the running native Steam client. `None` means unknown (the probe could not
/// run or its answer is unusable); callers fail open, never read it as "Steam is not running".
pub async fn list_steam_client_pids(
    runner: &dyn ProcessRunner,
    platform: Platform,
) -> Option<Vec<u32>> {
    match platform {
        Platform::Win32 => {
            let tasklist = win_join(&system_root(), &["System32", "tasklist.exe"]);
            let out = runner
                .run(
                    &tasklist,
                    vec![
                        "/FI".into(),
                        "IMAGENAME eq steam.exe".into(),
                        "/FO".into(),
                        "CSV".into(),
                        "/NH".into(),
                    ],
                    PROBE_TIMEOUT,
                )
                .await;
            // tasklist exits 0 whether or not anything matched.
            if out.code != Some(0) {
                return None;
            }
            Some(parse_tasklist_steam_pids(&out.stdout))
        }
        Platform::Darwin | Platform::Linux => {
            let (file, name) = if platform == Platform::Darwin {
                ("/usr/bin/pgrep", "steam_osx")
            } else {
                ("pgrep", "steam")
            };
            let out = runner
                .run(file, vec!["-x".into(), name.into()], PROBE_TIMEOUT)
                .await;
            // pgrep: 0 = matched, 1 = nothing matched, anything else = error.
            match out.code {
                Some(1) => Some(vec![]),
                Some(0) => Some(parse_pgrep_pids(&out.stdout)),
                _ => None,
            }
        }
    }
}

/// Start-time tokens for the given pids. An empty map means none of them exist; `None` means the
/// probe failed. Only pids that were asked for appear in the result.
pub async fn read_steam_process_start_tokens(
    runner: &dyn ProcessRunner,
    platform: Platform,
    pids: &[u32],
) -> Option<HashMap<u32, String>> {
    // Only positive integers are ever interpolated (injection guard).
    let wanted: Vec<u32> = pids.iter().copied().filter(|p| *p > 0).collect();
    if wanted.is_empty() {
        return Some(HashMap::new());
    }
    let csv = wanted
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let out = match platform {
        Platform::Darwin | Platform::Linux => {
            let file = if platform == Platform::Darwin {
                "/bin/ps"
            } else {
                "ps"
            };
            let out = runner
                .run(
                    file,
                    vec!["-o".into(), "pid=,lstart=".into(), "-p".into(), csv],
                    START_TOKEN_TIMEOUT,
                )
                .await;
            if out.code == Some(1) {
                return Some(HashMap::new());
            }
            out
        }
        Platform::Win32 => {
            let powershell = win_join(
                &system_root(),
                &["System32", "WindowsPowerShell", "v1.0", "powershell.exe"],
            );
            let script = format!(
                "Get-Process -Id {csv} -ErrorAction SilentlyContinue | ForEach-Object {{ \"$($_.Id) $($_.StartTime.ToUniversalTime().Ticks)\" }}; exit 0"
            );
            runner
                .run(
                    &powershell,
                    vec![
                        "-NoProfile".into(),
                        "-NonInteractive".into(),
                        "-Command".into(),
                        script,
                    ],
                    START_TOKEN_TIMEOUT,
                )
                .await
        }
    };
    if out.code != Some(0) {
        return None;
    }
    let parsed = parse_pid_token_lines(&out.stdout);
    Some(
        wanted
            .into_iter()
            .filter_map(|pid| parsed.get(&pid).map(|t| (pid, t.clone())))
            .collect(),
    )
}
