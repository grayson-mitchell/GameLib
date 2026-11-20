//! Stand-in for GameLib's shell, used only by `tests/orphans.rs` (feature `harness`). It spawns
//! its process tree through gamelib-proc exactly as the shell will, reports the pids as one JSON
//! line, then waits for `quit` on stdin and drains the global `ChildSet`.
//!
//! Modes: `parent` (the stand-in shell) and `idle` (a child that does nothing, forever).

use gamelib_proc::{global, spawn_helper};
use std::io::{BufRead, Write};
use std::process::{Command, Stdio};
use std::time::Duration;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("idle") => idle(),
        Some("parent") => parent(),
        _ => {
            eprintln!("usage: gamelib-proc-standin <parent|idle>");
            std::process::exit(2);
        }
    }
}

fn idle() -> ! {
    loop {
        std::thread::sleep(Duration::from_secs(1));
    }
}

fn self_command(mode: &str) -> Command {
    let exe = std::env::current_exe().expect("current_exe");
    let mut cmd = Command::new(exe);
    cmd.arg(mode)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    cmd
}

fn parent() {
    let helper = spawn_helper(self_command("idle"), "standin-idle").expect("spawn helper");
    let manifest = format!(r#"{{"helpers":[{helper}],"grandchildren":[],"games":[]}}"#);
    let mut out = std::io::stdout();
    writeln!(out, "{manifest}").expect("write manifest");
    out.flush().expect("flush manifest");

    // `quit` and stdin EOF (the test died) both drain the set, so no stray outlives a failed run.
    for line in std::io::stdin().lock().lines() {
        match line {
            Ok(l) if l.trim() == "quit" => break,
            Ok(_) => {}
            Err(_) => break,
        }
    }
    global().terminate_all(Duration::from_millis(1500));
    std::process::exit(0);
}
