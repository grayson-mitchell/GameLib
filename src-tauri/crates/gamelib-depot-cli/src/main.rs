//! Thin front end over `gamelib_depot::dispatch`. No download logic, no environment reads.
//!
//! `--list`                                      print the op names as a JSON array
//! `--cache-dir <path> --ndjson`                 one `{"op","args"}` request per stdin line -> one `{ok,...}` line each
//! `--cache-dir <path> <op> <json-object>`       run one op; result on stdout (exit 0), error on stderr (exit 2)
//! anything else                                 usage on stderr (exit 64)
//!
//! Plan 15 adds the `run` / `summarize` / `verify` event-streaming modes.

use gamelib_depot::{JobContext, JobEvent, JobHost, TokenRequest};
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::path::PathBuf;
use std::process::exit;
use std::sync::Arc;

const USAGE: &str =
    "usage: gamelib-depot-cli --list | --cache-dir <path> (--ndjson | <op> <json-object>)";

/// Headless host: events go to stdout as NDJSON, no CDN token source (anonymous only).
struct CliHost;

impl JobHost for CliHost {
    fn emit(&self, ev: JobEvent) {
        if let Ok(line) = serde_json::to_string(&ev) {
            let mut out = std::io::stdout().lock();
            let _ = writeln!(out, "{line}");
            let _ = out.flush();
        }
    }
    fn cdn_token(&self, _req: TokenRequest) -> Result<Option<String>, String> {
        Ok(None)
    }
    fn manifest_request_code(
        &self,
        _app_id: &str,
        _depot_id: &str,
        _manifest_id: &str,
    ) -> Result<Option<String>, String> {
        Ok(None)
    }
}

fn ndjson_reply(line: &str, ctx: &JobContext, host: &Arc<dyn JobHost>) -> Value {
    let req: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => return json!({"ok": false, "error": "bad-request"}),
    };
    let op = req.get("op").and_then(Value::as_str);
    let args = req.get("args");
    match (op, args) {
        (Some(op), Some(args)) => match gamelib_depot::dispatch(op, args, ctx, host.clone()) {
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
    let argv: Vec<String> = std::env::args().skip(1).collect();
    if let [flag] = argv.as_slice() {
        if flag == "--list" {
            let mut ops: Vec<&str> = gamelib_depot::OPS.to_vec();
            ops.sort_unstable();
            println!("{}", serde_json::to_string(&ops).unwrap_or_default());
            return;
        }
    }
    let (cache_dir, rest) = match argv.as_slice() {
        [flag, dir, rest @ ..] if flag == "--cache-dir" => (PathBuf::from(dir), rest),
        _ => usage(),
    };
    let ctx = JobContext { cache_dir };
    let host: Arc<dyn JobHost> = Arc::new(CliHost);
    match rest {
        [flag] if flag == "--ndjson" => {
            let stdin = std::io::stdin();
            let stdout = std::io::stdout();
            let mut out = stdout.lock();
            for line in stdin.lock().lines() {
                let Ok(line) = line else { break };
                if line.trim().is_empty() {
                    continue;
                }
                let reply = ndjson_reply(&line, &ctx, &host);
                let _ = writeln!(out, "{reply}");
                let _ = out.flush();
            }
        }
        [op, json_arg] if !op.starts_with("--") => {
            let Ok(value) = serde_json::from_str::<Value>(json_arg) else {
                usage()
            };
            match gamelib_depot::dispatch(op, &value, &ctx, host) {
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
