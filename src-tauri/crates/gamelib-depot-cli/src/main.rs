//! Thin front end over `gamelib_depot::dispatch`. No download logic, no environment reads.
//!
//! `--list`                                      print the op names as a JSON array
//! `--cache-dir <path> --ndjson`                 one `{"op","args"}` request per stdin line -> one `{ok,...}` line each
//! `--cache-dir <path> <op> <json-object>`       run one op; result on stdout (exit 0), error on stderr (exit 2)
//! anything else                                 usage on stderr (exit 64)
//!
//! `--cache-dir <path> run`                      read `{"job":{..},"tokens":{"<host>":"<token>"}}` on stdin; stream
//!                                               JobEvent NDJSON, then one final `{"ok":true,"result":<Outcome>}` line
//! `--cache-dir <path> verify`                   same input as `run`, with the mode forced to `verify_only`
//! `--cache-dir <path> summarize`                read `{"request":{..},"tokens":{..}}`; one `{"ok":true,"result":..}` line
//! Bad stdin JSON or a dispatch error prints `{"ok":false,"error":..}` and exits 2. Tokens and the
//! job are never echoed.

use gamelib_depot::{JobContext, JobEvent, JobHost, TokenRequest};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, Read, Write};
use std::path::PathBuf;
use std::process::exit;
use std::sync::Arc;

const USAGE: &str =
    "usage: gamelib-depot-cli --list | --cache-dir <path> (--ndjson | run | verify | summarize | <op> <json-object>)";

/// Headless host: events go to stdout as NDJSON; CDN tokens come from the static map given on
/// stdin (host -> token). There is no CM access here, so no manifest request codes.
struct CliHost {
    tokens: HashMap<String, String>,
}

impl JobHost for CliHost {
    fn emit(&self, ev: JobEvent) {
        if let Ok(line) = serde_json::to_string(&ev) {
            let mut out = std::io::stdout().lock();
            let _ = writeln!(out, "{line}");
            let _ = out.flush();
        }
    }
    fn cdn_token(&self, req: TokenRequest) -> Result<Option<String>, String> {
        Ok(self.tokens.get(&req.host).cloned())
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

/// Which streaming mode was asked for.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Stream {
    Run,
    Verify,
    Summarize,
}

fn print_line(v: &Value) {
    let mut out = std::io::stdout().lock();
    let _ = writeln!(out, "{v}");
    let _ = out.flush();
}

fn fail_line(error: &str) -> ! {
    print_line(&json!({"ok": false, "error": error}));
    exit(2)
}

/// Parses the stdin envelope into (payload, tokens). `key` is `job` or `request`.
fn read_envelope(key: &str) -> (Value, HashMap<String, String>) {
    let mut text = String::new();
    if std::io::stdin().read_to_string(&mut text).is_err() {
        fail_line("bad-input");
    }
    let Ok(mut env) = serde_json::from_str::<Value>(&text) else {
        fail_line("bad-input")
    };
    let Some(payload) = env.get_mut(key).map(Value::take) else {
        fail_line("bad-input")
    };
    let tokens = match env.get("tokens") {
        None | Some(Value::Null) => HashMap::new(),
        Some(v) => match serde_json::from_value::<HashMap<String, String>>(v.clone()) {
            Ok(t) => t,
            Err(_) => fail_line("bad-input"),
        },
    };
    (payload, tokens)
}

fn run_stream(mode: Stream, ctx: &JobContext) {
    let key = if mode == Stream::Summarize {
        "request"
    } else {
        "job"
    };
    let (mut payload, tokens) = read_envelope(key);
    let host: Arc<dyn JobHost> = Arc::new(CliHost { tokens });
    let op = match mode {
        Stream::Summarize => "depot_manifest_summary",
        Stream::Run | Stream::Verify => "depot_job_run",
    };
    if mode == Stream::Verify {
        match payload.as_object_mut() {
            Some(o) => {
                o.insert("mode".into(), json!("verify_only"));
            }
            None => fail_line("bad-input"),
        }
    }
    match gamelib_depot::dispatch(op, &payload, ctx, host) {
        Ok(result) => print_line(&json!({"ok": true, "result": result})),
        Err(error) => fail_line(&error),
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
    let host: Arc<dyn JobHost> = Arc::new(CliHost {
        tokens: HashMap::new(),
    });
    match rest {
        [m] if m == "run" => run_stream(Stream::Run, &ctx),
        [m] if m == "verify" => run_stream(Stream::Verify, &ctx),
        [m] if m == "summarize" => run_stream(Stream::Summarize, &ctx),
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
