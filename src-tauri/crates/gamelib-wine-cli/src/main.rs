//! Headless front end over `gamelib_wine`. It never reads the real profile: every directory the
//! crate sees is derived from `--user-data`, and the crate has no `keyring` dependency.
//!
//! `ops`
//!     print the op names, one per line
//! `op <name> <json-args> --user-data <dir> [--home <dir>] [--replay <case-dir>] [--now-ms <ms>]`
//!     run one op through `dispatch_sync` over a context rooted in `<dir>` (tools under `<dir>/tools`,
//!     the runtimes (EAC, BattlEye, umu) under `<dir>/tools/runtimes`, scratch files under
//!     `<dir>/temp`, the home directory `<dir>/home`) and print the JSON result. `<json-args>` is a JSON array of the op's
//!     arguments. An op error prints on stderr and exits 2. `--home <dir>` is the operator's home
//!     directory the ops see (default `<dir>/home`: the real profile is never read). `--replay
//!     <case-dir>` serves every request from a recorded case (`exchanges.json` and its body files)
//!     instead of the network, and fails the run (exit 2) on a request the case does not hold or an
//!     exchange left unrequested. The context has no UI, no log, no DXVK installer, and spawns
//!     through `gamelib-proc`.
//! anything else: usage on stderr (exit 64); bad input (a bad number, arguments that are not a JSON
//! array) exits 2.

use std::path::PathBuf;
use std::process::exit;
use std::sync::Arc;

use gamelib_core::clock::{Clock, SystemClock};
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::fetch::{Fetch, Replay};
use gamelib_engine::testing::FixedClock;
use gamelib_store::host::StoreHost;
use gamelib_wine::ctx::WineCtx;

const USAGE: &str = "usage: gamelib-wine-cli ops\n       gamelib-wine-cli op <name> <json-args> --user-data <dir> [--home <dir>] [--replay <case-dir>] [--now-ms <ms>]";

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
    let clock: Arc<dyn Clock> = match opt_flag(rest, "--now-ms") {
        Some(ms) => {
            Arc::new(FixedClock::new(ms.parse().unwrap_or_else(|_| {
                bad("--now-ms must be a whole number of milliseconds")
            })))
        }
        None => Arc::new(SystemClock),
    };
    let tools_path = user_data.join("tools");
    let home = match opt_flag(rest, "--home") {
        Some(dir) => PathBuf::from(dir),
        None => user_data.join("home"),
    };
    // `--replay`: every request is served from a recorded case, and `finish` below fails the run on
    // drift. Otherwise the real network seam (built lazily: nothing connects unless an op fetches).
    let replay =
        opt_flag(rest, "--replay").map(|dir| match Replay::from_case(&PathBuf::from(dir)) {
            Ok(replay) => Arc::new(replay.with_clock(clock.clone())),
            Err(e) => bad(&e),
        });
    let mut engine = EngineCtx::new(
        Arc::new(StoreHost::new()),
        clock,
        platform(),
        EnginePaths {
            app_folder: user_data.clone(),
            tools_path: tools_path.clone(),
            user_home: home,
            temp: user_data.join("temp"),
            user_data,
        },
        Shutdown::new(),
    );
    if let Some(replay) = &replay {
        let fetch: Arc<dyn Fetch> = replay.clone();
        engine = engine.with_fetch(fetch);
    }
    let ctx = WineCtx::new(Arc::new(engine), tools_path.join("runtimes"));
    let result = gamelib_wine::dispatch_sync(name, &op_args, &ctx);
    match result {
        Ok(value) => {
            if let Some(Err(drift)) = replay.as_ref().map(|r| r.finish()) {
                bad(&drift);
            }
            println!("{value}");
        }
        Err(e) => {
            // An op that failed on a request the case does not hold says only a category; the
            // replay's report names the request.
            if let Some(Err(drift)) = replay.as_ref().map(|r| r.finish()) {
                eprintln!("{drift}");
            }
            bad(&e)
        }
    }
}

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    match argv.first().map(String::as_str) {
        Some("ops") if argv.len() == 1 => {
            for op in gamelib_wine::OPS {
                println!("{op}");
            }
        }
        Some("op") => run_op(&argv[1..]),
        _ => usage(),
    }
}
