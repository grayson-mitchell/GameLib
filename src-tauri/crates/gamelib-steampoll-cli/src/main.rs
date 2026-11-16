//! Thin front end over `gamelib_steampoll::dispatch` and the parity replay runner.
//!
//! `--list`             print the op names, one per line
//! `--ndjson`           one `{"op","args"}` request per stdin line -> one `{ok,result|error}` line
//!                      each; exit 2 when any op failed. No facade is installed here, so ops that
//!                      need the shell's collaborators answer `steampoll:not-configured`.
//! `replay <timeline>`  run the Rust machines over a plan-02 timeline under paused time and print
//!                      the JSON stream (exit 2 on a bad timeline)
//! anything else        usage on stderr (exit 64)
//!
//! The CLI reads no user profile: replay builds a scratch profile in a temp dir.

mod replay;

use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::process::exit;

const USAGE: &str = "usage: gamelib-steampoll-cli --list | --ndjson | replay <timeline.json>";

fn ndjson_reply(line: &str) -> Value {
    let Ok(req) = serde_json::from_str::<Value>(line) else {
        return json!({"ok": false, "error": "bad-request"});
    };
    match (req.get("op").and_then(Value::as_str), req.get("args")) {
        (Some(op), Some(args)) => {
            match gamelib_steampoll::dispatch(op, std::slice::from_ref(args)) {
                Ok(result) => json!({"ok": true, "result": result}),
                Err(error) => json!({"ok": false, "error": error}),
            }
        }
        _ => json!({"ok": false, "error": "bad-request"}),
    }
}

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    match argv.as_slice() {
        [flag] if flag == "--list" => {
            for op in gamelib_steampoll::dispatch::OPS {
                println!("{op}");
            }
        }
        [flag] if flag == "--ndjson" => {
            let stdin = std::io::stdin();
            let stdout = std::io::stdout();
            let mut out = stdout.lock();
            let mut failed = false;
            for line in stdin.lock().lines() {
                let Ok(line) = line else { break };
                if line.trim().is_empty() {
                    continue;
                }
                let reply = ndjson_reply(&line);
                failed |= reply["ok"] != json!(true);
                let _ = writeln!(out, "{reply}");
                let _ = out.flush();
            }
            if failed {
                exit(2)
            }
        }
        [cmd, file] if cmd == "replay" => {
            let text = match std::fs::read_to_string(file) {
                Ok(t) => t,
                Err(e) => {
                    eprintln!("replay: cannot read timeline: {e}");
                    exit(2)
                }
            };
            let timeline: Value = match serde_json::from_str(&text) {
                Ok(v) => v,
                Err(e) => {
                    eprintln!("replay: timeline is not JSON: {e}");
                    exit(2)
                }
            };
            match replay::replay(&timeline) {
                Ok(stream) => println!(
                    "{}",
                    serde_json::to_string_pretty(&stream).unwrap_or_default()
                ),
                Err(e) => {
                    eprintln!("replay: {e}");
                    exit(2)
                }
            }
        }
        _ => {
            eprintln!("{USAGE}");
            exit(64)
        }
    }
}
