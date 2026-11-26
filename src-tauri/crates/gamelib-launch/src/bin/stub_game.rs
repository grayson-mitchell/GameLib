//! Stand-in for a game and for GameLib's shell, used only by `tests/stub_game.rs` (feature `harness`).
//!
//! Modes:
//! - `game --pids <file> [--child] [--child-exit-ms <ms>] [--lines <n>] [--exit-after-ms <ms>]`: the game.
//!   Waits a moment so the launcher has put it in its Game Job (a child created earlier would escape the
//!   Job on Windows), spawns one `idle` child when asked (a plain std `Command`, so it shares the game's
//!   session and group), then writes its pid line (and the child's) to the file in one atomic step. It prints
//!   `--lines` numbered lines, even ones to stdout and odd ones to stderr, or without `--lines` one line every
//!   50 ms forever (the test that a game keeps writing after its parent is gone). Then it exits at
//!   `--exit-after-ms` from its start, or idles.
//! - `idle [--for-ms <ms>]`: does nothing, for `<ms>` milliseconds or forever.

use std::io::Write;
use std::path::PathBuf;
use std::process::{exit, Command, Stdio};
use std::time::{Duration, Instant};

/// How long the game waits before it creates its child (see the module doc).
const CHILD_DELAY: Duration = Duration::from_millis(100);

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("idle") => idle(&args[1..]),
        Some("game") => game(&args[1..]),
        _ => {
            eprintln!("usage: gamelib-launch-stub-game <game|idle> [flags]");
            exit(2);
        }
    }
}

fn value<'a>(args: &'a [String], name: &str) -> Option<&'a str> {
    let i = args.iter().position(|a| a == name)?;
    Some(
        args.get(i + 1)
            .unwrap_or_else(|| panic!("{name} needs a value"))
            .as_str(),
    )
}

fn number(args: &[String], name: &str) -> Option<u64> {
    value(args, name).map(|v| {
        v.parse()
            .unwrap_or_else(|_| panic!("{name} needs a number"))
    })
}

fn idle(args: &[String]) -> ! {
    match number(args, "--for-ms") {
        Some(ms) => {
            std::thread::sleep(Duration::from_millis(ms));
            exit(0)
        }
        None => loop {
            std::thread::sleep(Duration::from_secs(1));
        },
    }
}

fn game(args: &[String]) -> ! {
    let start = Instant::now();
    let pids = PathBuf::from(value(args, "--pids").expect("--pids <file>"));
    let lines = number(args, "--lines");
    let exit_after = number(args, "--exit-after-ms").map(Duration::from_millis);

    let mut recorded = vec![std::process::id()];
    if args.iter().any(|a| a == "--child") {
        std::thread::sleep(CHILD_DELAY);
        let mut cmd = Command::new(std::env::current_exe().expect("current_exe"));
        cmd.arg("idle");
        if let Some(ms) = number(args, "--child-exit-ms") {
            cmd.arg("--for-ms").arg(ms.to_string());
        }
        // The child is meant to outlive the leader's interest in it: the test ends it from outside.
        #[allow(clippy::zombie_processes)]
        let child = cmd
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn the game's child");
        recorded.push(child.id());
    }
    // One rename, so a reader never sees a file with the child's pid still missing.
    let text: String = recorded.iter().map(|pid| format!("{pid}\n")).collect();
    let partial = pids.with_extension("partial");
    std::fs::write(&partial, text).expect("write the pids");
    std::fs::rename(&partial, &pids).expect("publish the pids");

    let mut emitted = 0u64;
    loop {
        if lines.is_some_and(|n| emitted >= n) {
            break;
        }
        if emitted % 2 == 0 {
            println!("line {emitted}");
            let _ = std::io::stdout().flush();
        } else {
            eprintln!("line {emitted}");
        }
        emitted += 1;
        if lines.is_none() {
            std::thread::sleep(Duration::from_millis(50));
            if exit_after.is_some_and(|after| start.elapsed() >= after) {
                exit(0);
            }
        }
    }
    match exit_after {
        Some(after) => {
            std::thread::sleep(after.saturating_sub(start.elapsed()));
            exit(0)
        }
        None => idle(&[]),
    }
}
