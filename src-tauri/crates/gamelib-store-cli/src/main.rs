//! Headless front end over `gamelib_store`. It reads no environment and touches no profile.
//!
//! `roundtrip <file> --flavour store|settings|compact`
//!     parse the file and write it back in the named flavour; print `identical` (exit 0) or
//!     `differs at byte N` (exit 1). A file that is not valid JSON exits 2 with the parse error on
//!     stderr.
//! anything else: usage on stderr (exit 64)

use std::process::exit;

use gamelib_store::json::{parse, to_compact_bytes, to_settings_bytes, to_store_bytes};

const USAGE: &str = "usage: gamelib-store-cli roundtrip <file> --flavour store|settings|compact";

fn usage() -> ! {
    eprintln!("{USAGE}");
    exit(64)
}

fn first_difference(a: &[u8], b: &[u8]) -> Option<usize> {
    let common = a.len().min(b.len());
    match a.iter().zip(b.iter()).position(|(x, y)| x != y) {
        Some(i) => Some(i),
        None if a.len() != b.len() => Some(common),
        None => None,
    }
}

fn roundtrip(file: &str, flavour: &str) {
    let write: fn(&gamelib_store::json::Json) -> Vec<u8> = match flavour {
        "store" => to_store_bytes,
        "settings" => to_settings_bytes,
        "compact" => to_compact_bytes,
        _ => usage(),
    };
    let bytes = match std::fs::read(file) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("cannot read {file}: {e}");
            exit(2)
        }
    };
    let value = match parse(&bytes) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("parse error: {e}");
            exit(2)
        }
    };
    match first_difference(&bytes, &write(&value)) {
        None => println!("identical"),
        Some(n) => {
            println!("differs at byte {n}");
            exit(1)
        }
    }
}

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    match argv.as_slice() {
        [cmd, file, flag, flavour] if cmd == "roundtrip" && flag == "--flavour" => {
            roundtrip(file, flavour)
        }
        _ => usage(),
    }
}
