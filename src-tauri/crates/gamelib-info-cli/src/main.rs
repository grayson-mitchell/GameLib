//! Headless front end over `gamelib_info`. It never touches the Keychain: the crate and this binary
//! have no `keyring` dependency, and the secret source (`op`, from a later task) reads
//! `GAMELIB_INFO_ITAD_KEY` and `GAMELIB_INFO_SGDB_KEY` from this process's own environment only.
//!
//! `ops`
//!     print the op names, one per line
//! `cache-get --user-data <dir> --store <name> --key <key> --now-ms <ms>`
//!     read one entry of `<dir>/store_cache/<name>.json` through `CacheView` at the given clock and
//!     print the JSON value, or the word `fallback` when TS `CacheStore.get` would return its
//!     fallback. `<name>` is one of the five cache stores (wikigameinfo, umu, crossover_index,
//!     itad_prices, itad_steam_gids). An expired entry is deleted from the file, as TS does.
//! anything else: usage on stderr (exit 64); bad input (an unknown store, an unreadable file, a bad
//! number) exits 2.

use std::path::PathBuf;
use std::process::exit;
use std::sync::Arc;

use gamelib_core::clock::Clock;
use gamelib_info::cache_view::{
    CacheParams, CacheView, CROSSOVER_INDEX, ITAD_PRICES, ITAD_STEAM_GIDS, UMU, WIKIGAMEINFO,
};
use gamelib_store::host::StoreHost;
use gamelib_store::json::to_compact_bytes;

const USAGE: &str = "usage: gamelib-info-cli ops\n       gamelib-info-cli cache-get --user-data <dir> --store <name> --key <key> --now-ms <ms>";

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

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    match argv.first().map(String::as_str) {
        Some("ops") if argv.len() == 1 => {
            for op in gamelib_info::OPS {
                println!("{op}");
            }
        }
        Some("cache-get") => cache_get(&argv[1..]),
        _ => usage(),
    }
}
