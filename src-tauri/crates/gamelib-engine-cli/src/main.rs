//! Headless front end over `gamelib_engine`. It never reads the real profile: every directory the
//! crate sees is derived from `--user-data`, and the crate has no `keyring` dependency.
//!
//! `ops`
//!     print the op names, one per line
//! `op <name> <json-args> --user-data <dir> [--now-ms <ms>]`
//!     run one op through `dispatch_sync` over a context rooted in `<dir>` (tools under `<dir>/tools`,
//!     scratch files under `<dir>/temp`, the home directory `<dir>/home`) and print the JSON result.
//!     `<json-args>` is a JSON array of the op's arguments. An op error prints on stderr and exits 2.
//! anything else: usage on stderr (exit 64); bad input (a bad number, arguments that are not a JSON
//! array) exits 2.

use std::path::PathBuf;
use std::process::exit;
use std::sync::Arc;

use gamelib_core::clock::{Clock, SystemClock};
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_store::host::StoreHost;

const USAGE: &str = "usage: gamelib-engine-cli ops\n       gamelib-engine-cli op <name> <json-args> --user-data <dir> [--now-ms <ms>]";

fn usage() -> ! {
    eprintln!("{USAGE}");
    exit(64)
}

fn bad(message: &str) -> ! {
    eprintln!("{message}");
    exit(2)
}

/// A clock that always says the same millisecond: the CLI is a replay tool, not a wall-clock one.
struct FixedClock(u64);

impl Clock for FixedClock {
    fn now_ms(&self) -> u64 {
        self.0
    }
}

/// The value of `--flag <value>` in `args`, or a usage exit.
fn flag<'a>(args: &'a [String], name: &str) -> &'a str {
    match args.iter().position(|a| a == name) {
        Some(i) => match args.get(i + 1) {
            Some(v) => v,
            None => usage(),
        },
        None => usage(),
    }
}

/// The value of `--flag <value>` when the flag is present.
fn opt_flag<'a>(args: &'a [String], name: &str) -> Option<&'a str> {
    args.iter().position(|a| a == name).map(|i| {
        args.get(i + 1)
            .map(String::as_str)
            .unwrap_or_else(|| usage())
    })
}

fn platform() -> Platform {
    if cfg!(target_os = "macos") {
        Platform::Mac
    } else if cfg!(windows) {
        Platform::Windows
    } else {
        Platform::Linux
    }
}

fn run_op(args: &[String]) {
    let [name, json_args, rest @ ..] = args else {
        usage()
    };
    let user_data = PathBuf::from(flag(rest, "--user-data"));
    let op_args: Vec<serde_json::Value> = match serde_json::from_str(json_args) {
        Ok(serde_json::Value::Array(items)) => items,
        _ => bad("<json-args> must be a JSON array"),
    };
    let clock: Arc<dyn Clock> = match opt_flag(rest, "--now-ms") {
        Some(ms) => {
            Arc::new(FixedClock(ms.parse().unwrap_or_else(|_| {
                bad("--now-ms must be a whole number of milliseconds")
            })))
        }
        None => Arc::new(SystemClock),
    };
    let ctx = EngineCtx::new(
        Arc::new(StoreHost::new()),
        clock,
        platform(),
        EnginePaths {
            app_folder: user_data.clone(),
            tools_path: user_data.join("tools"),
            user_home: user_data.join("home"),
            temp: user_data.join("temp"),
            user_data,
        },
        Shutdown::new(),
    );
    match gamelib_engine::dispatch_sync(name, &op_args, &ctx) {
        Ok(value) => println!("{value}"),
        Err(e) => bad(&e),
    }
}

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    match argv.first().map(String::as_str) {
        Some("ops") if argv.len() == 1 => {
            for op in gamelib_engine::OPS {
                println!("{op}");
            }
        }
        Some("op") => run_op(&argv[1..]),
        _ => usage(),
    }
}
