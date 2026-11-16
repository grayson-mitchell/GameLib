//! Thin front end over `gamelib_steamcm::dispatch`. No CM logic. The only environment read is
//! `$HOME`, for the Steam `connection_log.txt` path of the CLI's own `WrapHost`.
//!
//! Session ops keep state only within one process, so stateful sweeps must use `--ndjson`.
//! Secrets (passwords, tokens, Steam Guard codes) travel on stdin via `--ndjson`, NEVER argv:
//! argv is visible to every local user in `ps` (T-79-03).
//!
//! `--list`            print the op names as a JSON array
//! `--ndjson`          one `{"op","args"}` request per stdin line -> one `{ok,...}` line each
//! `<op> <json-object>` run one op; result on stdout (exit 0), error on stderr (exit 2).
//!                     secret-bearing ops are refused here (exit 64)
//! anything else       usage on stderr (exit 64)

use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::path::PathBuf;
use std::process::{exit, Command, Stdio};
use std::sync::Arc;
use std::time::Duration;

use gamelib_steamcm::wrap::WrapHost;

/// Ops whose args carry a secret. They are refused on argv (visible in `ps`) and only run via
/// `--ndjson`, where the secret travels on stdin (T-79-48).
///
/// A SteamID64 is deliberately not a secret here: `steamcm_owned_apps`, `steamcm_refresh` and
/// `steamcm_mac_owned_apps` may carry one on argv. It is public (it is in every Steam profile URL)
/// and is not a credential; it must still never be logged (A/IN-08, operator decision 2026-11-16).
const SECRET_OPS: &[&str] = &[
    "steamcm_session_acquire",
    "steamcm_signin_credentials_start",
    "steamcm_signin_guard_submit",
    "steamcm_redeem_key",
];

/// How long EOF waits for the session to close and an owed go-online to be paid.
const EOF_SHUTDOWN_BOUND: Duration = Duration::from_secs(10);

/// The CLI's own `WrapHost`: `open -g` and `pgrep`, macOS only where it acts at all.
struct CliWrapHost {
    log: PathBuf,
}

impl CliWrapHost {
    fn new() -> Self {
        Self {
            log: gamelib_steamcm::wrap::default_connection_log_path(),
        }
    }
}

fn quiet(cmd: &mut Command) -> Option<std::process::Output> {
    cmd.stdin(Stdio::null()).stderr(Stdio::null()).output().ok()
}

impl WrapHost for CliWrapHost {
    fn open_steam_url(&self, url: &'static str) -> bool {
        cfg!(target_os = "macos")
            && quiet(Command::new("open").args(["-g", url])).is_some_and(|o| o.status.success())
    }

    fn steam_running(&self) -> bool {
        quiet(Command::new("pgrep").args(["-x", "steam_osx"])).is_some_and(|o| o.status.success())
    }

    fn connection_log_path(&self) -> PathBuf {
        self.log.clone()
    }

    fn pid_alive(&self, pid: u32) -> bool {
        quiet(Command::new("kill").args(["-0", &pid.to_string()]))
            .is_some_and(|o| o.status.success())
    }

    fn system_boot_unix_ms(&self) -> Option<i64> {
        let out = quiet(Command::new("sysctl").args(["-n", "kern.boottime"]))?;
        let text = String::from_utf8_lossy(&out.stdout).into_owned();
        let secs = text.split("sec =").nth(1)?.trim_start().split(',').next()?;
        secs.trim().parse::<i64>().ok().map(|s| s * 1000)
    }

    fn local_utc_offset_secs(&self, _unix_secs: i64) -> i64 {
        let Some(out) = quiet(Command::new("date").arg("+%z")) else {
            return 0;
        };
        let z = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if z.len() != 5 {
            return 0;
        }
        let sign = if z.starts_with('-') { -1 } else { 1 };
        let h: i64 = z[1..3].parse().unwrap_or(0);
        let m: i64 = z[3..5].parse().unwrap_or(0);
        sign * (h * 3600 + m * 60)
    }
}

const USAGE: &str = "usage: gamelib-steamcm-cli --list | --ndjson | <op> <json-object>";

fn ndjson_reply(line: &str) -> Value {
    let req: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => return json!({"ok": false, "error": "bad-request"}),
    };
    let op = req.get("op").and_then(Value::as_str);
    let args = req.get("args");
    match (op, args) {
        (Some(op), Some(args)) => match gamelib_steamcm::dispatch(op, std::slice::from_ref(args)) {
            Ok(result) => json!({"ok": true, "result": result}),
            Err(error) => json!({"ok": false, "error": error}),
        },
        _ => json!({"ok": false, "error": "bad-request"}),
    }
}

fn usage() -> ! {
    eprintln!("{USAGE}");
    exit(64)
}

fn main() {
    gamelib_steamcm::install_crypto_provider();
    gamelib_steamcm::facade::set_wrap_host(Arc::new(CliWrapHost::new()));
    let argv: Vec<String> = std::env::args().skip(1).collect();
    match argv.as_slice() {
        [flag] if flag == "--list" => {
            // CLI_ONLY_OPS are also in OPS (the library dispatches them); dedupe the union.
            let mut ops: Vec<&str> = gamelib_steamcm::OPS
                .iter()
                .chain(gamelib_steamcm::CLI_ONLY_OPS.iter())
                .copied()
                .collect();
            ops.sort_unstable();
            ops.dedup();
            println!("{}", serde_json::to_string(&ops).unwrap_or_default());
        }
        [flag] if flag == "--ndjson" => {
            let stdin = std::io::stdin();
            let stdout = std::io::stdout();
            let mut out = stdout.lock();
            for line in stdin.lock().lines() {
                let Ok(line) = line else { break };
                if line.trim().is_empty() {
                    continue;
                }
                let reply = ndjson_reply(&line);
                let _ = writeln!(out, "{reply}");
                let _ = out.flush();
            }
            // EOF: close the session and pay any owed go-online before the process ends.
            if let Err(e) = gamelib_steamcm::facade::shutdown_all(EOF_SHUTDOWN_BOUND) {
                eprintln!("steamcm shutdown refused: {e}");
            }
        }
        [op, _] if SECRET_OPS.contains(&op.as_str()) => {
            eprintln!("{op} takes secrets: pass it on stdin with --ndjson, never on argv");
            exit(64)
        }
        [op, json_arg] if !op.starts_with("--") => {
            let Ok(value) = serde_json::from_str::<Value>(json_arg) else {
                usage()
            };
            match gamelib_steamcm::dispatch(op, &[value]) {
                Ok(result) => println!("{}", serde_json::to_string(&result).unwrap_or_default()),
                Err(error) => {
                    eprintln!("{error}");
                    exit(2)
                }
            }
        }
        _ => usage(),
    }
}
