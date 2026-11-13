//! Thin front end over `gamelib_steamfiles::dispatch`. No scanning logic, no environment reads.
//!
//! `--list`            print the op names as a JSON array
//! `--ndjson`          one `{"op","args"}` request per stdin line -> one `{ok,...}` line each
//! `<op> <json-object>` run one op; result on stdout (exit 0), error on stderr (exit 2)
//! anything else       usage on stderr (exit 64)

use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::process::exit;

const USAGE: &str = "usage: gamelib-steamfiles-cli --list | --ndjson | <op> <json-object>";

fn ndjson_reply(line: &str) -> Value {
    let req: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => return json!({"ok": false, "error": "bad-request"}),
    };
    let op = req.get("op").and_then(Value::as_str);
    let args = req.get("args");
    match (op, args) {
        (Some(op), Some(args)) => {
            match gamelib_steamfiles::dispatch(op, std::slice::from_ref(args)) {
                Ok(result) => json!({"ok": true, "result": result}),
                Err(error) => json!({"ok": false, "error": error}),
            }
        }
        _ => json!({"ok": false, "error": "bad-request"}),
    }
}

fn usage() -> ! {
    eprintln!("{USAGE}");
    exit(64)
}

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    match argv.as_slice() {
        [flag] if flag == "--list" => {
            // CLI_ONLY_OPS are also in OPS (the library dispatches them); dedupe the union.
            let mut ops: Vec<&str> = gamelib_steamfiles::OPS
                .iter()
                .chain(gamelib_steamfiles::CLI_ONLY_OPS.iter())
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
        }
        [op, json_arg] if !op.starts_with("--") => {
            let Ok(value) = serde_json::from_str::<Value>(json_arg) else {
                usage()
            };
            match gamelib_steamfiles::dispatch(op, &[value]) {
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
