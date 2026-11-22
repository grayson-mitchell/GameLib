//! Headless front end over `gamelib_info`. It never touches the Keychain: the crate and this binary
//! have no `keyring` dependency, and `op` reads the keys from `GAMELIB_INFO_ITAD_KEY` and
//! `GAMELIB_INFO_SGDB_KEY` in this process's own environment only.
//!
//! `ops`
//!     print the op names, one per line
//! `cache-get --user-data <dir> --store <name> --key <key> --now-ms <ms>`
//!     read one entry of `<dir>/store_cache/<name>.json` through `CacheView` at the given clock and
//!     print the JSON value, or the word `fallback` when TS `CacheStore.get` would return its
//!     fallback. `<name>` is one of the five cache stores (wikigameinfo, umu, crossover_index,
//!     itad_prices, itad_steam_gids). An expired entry is deleted from the file, as TS does.
//! `op <name> <json-args> --user-data <dir> [--replay <case-dir>] [--now-ms <ms>]`
//!     run one op through `dispatch_sync` over a context rooted in `<dir>` (store files under
//!     `<dir>/store_cache`, scratch files under `<dir>/temp`) and print the JSON result. `<json-args>`
//!     is a JSON array of the op's arguments. With `--replay` the HTTP comes from a recorded case
//!     (`exchanges.json` and its body files) instead of the network, every request is pinned to its
//!     recorded twin, and the run fails (exit 2) if one differs or a recorded exchange goes unused.
//!     An op error prints on stderr and exits 2.
//! anything else: usage on stderr (exit 64); bad input (an unknown store, an unreadable file, a bad
//! number) exits 2.

use std::path::PathBuf;
use std::process::exit;
use std::sync::Arc;

use gamelib_core::clock::{Clock, SystemClock};
use gamelib_core::shutdown::Shutdown;
use gamelib_info::cache_view::{
    CacheParams, CacheView, CROSSOVER_INDEX, ITAD_PRICES, ITAD_STEAM_GIDS, UMU, WIKIGAMEINFO,
};
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform};
use gamelib_info::http::{Http, Replay, ReqwestHttp};
use gamelib_info::secrets::EnvSecretSource;
use gamelib_store::host::StoreHost;
use gamelib_store::json::to_compact_bytes;

const USAGE: &str = "usage: gamelib-info-cli ops\n       gamelib-info-cli cache-get --user-data <dir> --store <name> --key <key> --now-ms <ms>\n       gamelib-info-cli op <name> <json-args> --user-data <dir> [--replay <case-dir>] [--now-ms <ms>]";

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

fn store_params(name: &str) -> Option<CacheParams> {
    [
        WIKIGAMEINFO,
        UMU,
        CROSSOVER_INDEX,
        ITAD_PRICES,
        ITAD_STEAM_GIDS,
    ]
    .into_iter()
    .find(|p| p.store == name)
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

fn cache_get(args: &[String]) {
    let user_data = PathBuf::from(flag(args, "--user-data"));
    let store = flag(args, "--store");
    let key = flag(args, "--key");
    let now_ms: u64 = flag(args, "--now-ms")
        .parse()
        .unwrap_or_else(|_| bad("--now-ms must be a whole number of milliseconds"));
    let Some(params) = store_params(store) else {
        bad(&format!("unknown cache store: {store}"))
    };
    let host = StoreHost::new();
    let view = CacheView::open(&host, &user_data, params, Arc::new(FixedClock(now_ms)))
        .unwrap_or_else(|e| bad(&format!("cannot open {store}: {e}")));
    match view.get_opt(key) {
        Some(value) => println!("{}", String::from_utf8_lossy(&to_compact_bytes(&value))),
        None => println!("fallback"),
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
    let replay = opt_flag(rest, "--replay").map(|dir| {
        Arc::new(
            Replay::from_case(std::path::Path::new(dir))
                .unwrap_or_else(|e| bad(&format!("cannot load the replay case: {e}"))),
        )
    });
    let http: Arc<dyn Http> = match &replay {
        Some(r) => r.clone(),
        None => Arc::new(ReqwestHttp::new()),
    };
    let mut ctx = InfoCtx::new(
        Arc::new(StoreHost::new()),
        clock,
        platform(),
        InfoPaths {
            app_folder: user_data.clone(),
            temp: user_data.join("temp"),
            user_data,
            public_dir: None,
        },
        env!("CARGO_PKG_VERSION").to_string(),
        Shutdown::new(),
        http,
    );
    ctx.secrets = Some(Arc::new(EnvSecretSource::new(
        "GAMELIB_INFO_ITAD_KEY",
        "GAMELIB_INFO_SGDB_KEY",
    )));
    let outcome = gamelib_info::dispatch_sync(name, &op_args, &ctx);
    if let Some(r) = &replay {
        if let Err(problems) = r.finish() {
            eprintln!("replay: {problems}");
            exit(2)
        }
    }
    match outcome {
        Ok(value) => println!("{value}"),
        Err(e) => bad(&e),
    }
}

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    match argv.first().map(String::as_str) {
        Some("ops") if argv.len() == 1 => {
            for op in gamelib_info::OPS {
                println!("{op}");
            }
        }
        Some("cache-get") => cache_get(&argv[1..]),
        Some("op") => run_op(&argv[1..]),
        _ => usage(),
    }
}
