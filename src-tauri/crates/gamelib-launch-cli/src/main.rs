//! Headless front end over `gamelib_launch`. It never reads the real profile: every directory the
//! crate sees is derived from `--user-data`, and the crate has no `keyring` dependency.
//!
//! `ops`
//!     print the op names, one per line (none until 88.1 adds the first)
//! `op <name> <json-args> --user-data <dir> [--home <dir>] [--public <dir>] [--relay-url <url>] [--app-version <v>]`
//!     run one op through `dispatch_sync` over a context rooted in `<dir>` (see `gamelib-knownfix-cli`
//!     for the layout) and print the JSON result. `<json-args>` is a JSON array of the op's arguments.
//!     An op error prints on stderr and exits 2. `--home <dir>` is the operator's home directory the
//!     ops see (default `<dir>/home`: the real profile is never read).
//! anything else: usage on stderr (exit 64); bad input (arguments that are not a JSON array) exits 2.

use std::path::PathBuf;
use std::process::exit;
use std::sync::Arc;

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_launch::ctx::LaunchCtx;
use gamelib_store::host::StoreHost;

const USAGE: &str = "usage: gamelib-launch-cli ops\n       gamelib-launch-cli op <name> <json-args> --user-data <dir> [--home <dir>] [--public <dir>] [--relay-url <url>] [--app-version <v>]";

fn usage() -> ! {
    eprintln!("{USAGE}");
    exit(64)
}

fn bad(message: &str) -> ! {
    eprintln!("{message}");
    exit(2)
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
    let home = match opt_flag(rest, "--home") {
        Some(dir) => PathBuf::from(dir),
        None => user_data.join("home"),
    };
    let bundled = opt_flag(rest, "--public").map(|dir| PathBuf::from(dir).join("fixes"));
    let relay_url = opt_flag(rest, "--relay-url").unwrap_or("");
    let app_version = opt_flag(rest, "--app-version").unwrap_or(env!("CARGO_PKG_VERSION"));
    let engine = Arc::new(EngineCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        platform(),
        EnginePaths {
            app_folder: user_data.clone(),
            tools_path: user_data.join("tools"),
            user_home: home,
            temp: user_data.join("temp"),
            user_data,
        },
        Shutdown::new(),
    ));
    let knownfix = Arc::new(KnownFixCtx::new(
        engine.clone(),
        bundled,
        relay_url,
        app_version,
    ));
    let ctx = LaunchCtx::new(engine, knownfix);
    match gamelib_launch::dispatch_sync(name, &op_args, &ctx) {
        Ok(value) => println!("{value}"),
        Err(e) => bad(&e),
    }
}

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    match argv.first().map(String::as_str) {
        Some("ops") if argv.len() == 1 => {
            for op in gamelib_launch::OPS {
                println!("{op}");
            }
        }
        Some("op") => run_op(&argv[1..]),
        _ => usage(),
    }
}
