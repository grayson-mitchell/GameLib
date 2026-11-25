//! Headless front end over `gamelib_knownfix`. It never reads the real profile: every directory the
//! crate sees is derived from `--user-data`, and the crate has no `keyring` dependency.
//!
//! `ops`
//!     print the op names, one per line
//! `op <name> <json-args> --user-data <dir> [--home <dir>] [--public <dir>] [--relay-url <url>] [--app-version <v>]`
//!     run one op through `dispatch_sync` over a context rooted in `<dir>` (fixes under
//!     `<dir>/fixes`, overlays under `<dir>/overlays`, tools under `<dir>/tools`, scratch files under
//!     `<dir>/temp`, the home directory `<dir>/home`) and print the JSON result. `<json-args>` is a JSON
//!     array of the op's arguments. An op error prints on stderr and exits 2. `--home <dir>` is the
//!     operator's home directory the ops see (default `<dir>/home`: the real profile is never read).
//!     `--public <dir>` is the bundled `fixes` directory's parent (default: none). The context has no
//!     UI and no log, and spawns through `gamelib-proc` (a registry op's `reg add` runs through a wine
//!     command core built over the same directories).
//! anything else: usage on stderr (exit 64); bad input (arguments that are not a JSON array) exits 2.

use std::path::PathBuf;
use std::process::exit;
use std::sync::Arc;

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_store::host::StoreHost;
use gamelib_wine::ctx::WineCtx;
use gamelib_wine::wine_cmd::env::EnvSnapshot;
use gamelib_wine::wine_cmd::WineHost;

const USAGE: &str = "usage: gamelib-knownfix-cli ops\n       gamelib-knownfix-cli op <name> <json-args> --user-data <dir> [--home <dir>] [--public <dir>] [--relay-url <url>] [--app-version <v>]";

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
    // Fails closed: without `--relay-url` a headless run answers `no-relay` and never posts to the
    // deployed relay (WR-05).
    let relay_url = opt_flag(rest, "--relay-url")
        .unwrap_or(gamelib_knownfix::report::RELAY_URL_PENDING_SENTINEL);
    let app_version = opt_flag(rest, "--app-version").unwrap_or(env!("CARGO_PKG_VERSION"));
    let engine = EngineCtx::new(
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
    );
    let engine = Arc::new(engine);
    // The wine command core the registry ops spawn through: tools under `<dir>/tools`, the CLI's own
    // process environment as the host's (a test clears it), no Darwin release.
    let wine = WineCtx::new(
        Arc::clone(&engine),
        engine.paths.tools_path.join("runtimes"),
    );
    let host = WineHost {
        env: EnvSnapshot::from_pairs(std::env::vars_os().map(|(k, v)| {
            (
                k.to_string_lossy().into_owned(),
                v.to_string_lossy().into_owned(),
            )
        })),
        ..WineHost::default()
    };
    let ctx =
        KnownFixCtx::new(engine, bundled, relay_url, app_version).with_wine(Arc::new(wine), host);
    match gamelib_knownfix::dispatch_sync(name, &op_args, &ctx) {
        Ok(value) => println!("{value}"),
        Err(e) => bad(&e),
    }
}

fn main() {
    // Lossy, not `env::args()`, which panics on a non-Unicode argument (WR-04).
    let argv: Vec<String> = std::env::args_os()
        .skip(1)
        .map(|a| a.to_string_lossy().into_owned())
        .collect();
    match argv.first().map(String::as_str) {
        Some("ops") if argv.len() == 1 => {
            for op in gamelib_knownfix::OPS {
                println!("{op}");
            }
        }
        Some("op") => run_op(&argv[1..]),
        _ => usage(),
    }
}
