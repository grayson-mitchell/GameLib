//! Thin front end over `gamelib_steampoll::dispatch`.
//!
//! `--list`   print the op names, one per line
//! anything else  usage on stderr (exit 64); plan 17 adds `--ndjson` and `replay`

use std::process::exit;

const USAGE: &str = "usage: gamelib-steampoll-cli --list";

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    match argv.as_slice() {
        [flag] if flag == "--list" => {
            for op in gamelib_steampoll::dispatch::OPS {
                println!("{op}");
            }
        }
        _ => {
            eprintln!("{USAGE}");
            exit(64)
        }
    }
}
