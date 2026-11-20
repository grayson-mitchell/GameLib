//! Stand-in for GameLib's shell, used only by `tests/orphans.rs` (feature `harness`). It spawns
//! its process tree through gamelib-proc exactly as the shell will, reports the pids as one JSON
//! line, then waits for `quit` on stdin and drains the global `ChildSet`.
//!
//! Modes:
//! - `parent --game-log <path> --game-pids <path>`: the stand-in shell. Spawns two `idle`
//!   helpers, one `tree` helper (a helper with a grandchild) and one `game` (Game class).
//! - `idle`: does nothing, forever.
//! - `tree`: waits for `go` on stdin, spawns one `idle` child, prints its pid, then idles.
//! - `game --game-pids <path>`: spawns one `game-child` through a plain std `Command` (so it
//!   shares the game's session), records its pid in the file, then writes a line to stdout every
//!   50 ms forever. Its stdout is a file or null, which is the Pitfall 5 point: the writes must
//!   keep succeeding after the parent is gone.
//! - `game-child`: idle.
//! - `lines`: prints its own pid as one line on stdout, then idles (the streaming-runner test).

use gamelib_proc::{global, spawn_game, spawn_helper, spawn_helper_with_pipes};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("idle") | Some("game-child") => idle(),
        Some("tree") => tree(),
        Some("lines") => lines(),
        Some("game") => game(&args[1..]),
        Some("parent") => parent(&args[1..]),
        _ => {
            eprintln!("usage: gamelib-proc-standin <parent|idle|tree|game|game-child> [flags]");
            std::process::exit(2);
        }
    }
}

fn idle() -> ! {
    loop {
        std::thread::sleep(Duration::from_secs(1));
    }
}

/// `<self> <mode> <extra...>` with every stdio stream null; callers override what they need.
fn self_command(mode: &str, extra: &[&str]) -> Command {
    let exe = std::env::current_exe().expect("current_exe");
    let mut cmd = Command::new(exe);
    cmd.arg(mode)
        .args(extra)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    cmd
}

fn flag(args: &[String], name: &str) -> PathBuf {
    let i = args
        .iter()
        .position(|a| a == name)
        .unwrap_or_else(|| panic!("missing {name}"));
    PathBuf::from(
        args.get(i + 1)
            .unwrap_or_else(|| panic!("{name} needs a value")),
    )
}

fn lines() -> ! {
    let mut out = std::io::stdout();
    writeln!(out, "{}", std::process::id()).expect("write own pid");
    out.flush().expect("flush own pid");
    idle()
}

// The child is deliberately never waited for: it idles until something kills it.
#[allow(clippy::zombie_processes)]
fn tree() -> ! {
    // The parent tells us to go only after it has assigned this process to its Job, so the
    // grandchild can never be created before the assignment (the known Windows limit).
    let mut line = String::new();
    let _ = std::io::stdin().lock().read_line(&mut line);
    let grandchild = self_command("idle", &[]).spawn().expect("spawn grandchild");
    let mut out = std::io::stdout();
    writeln!(out, "{}", grandchild.id()).expect("write grandchild pid");
    out.flush().expect("flush grandchild pid");
    idle()
}

// The child is deliberately never waited for: it idles until something kills it.
#[allow(clippy::zombie_processes)]
fn game(args: &[String]) -> ! {
    let pids_path = flag(args, "--game-pids");
    let child = self_command("game-child", &[])
        .spawn()
        .expect("spawn game child");
    std::fs::write(&pids_path, format!("{}\n", child.id())).expect("write game child pid");
    let mut out = std::io::stdout();
    loop {
        // Ignore write errors: a game that died on a closed pipe is exactly what the harness is
        // here to rule out, and it must not be this process panicking instead.
        let _ = writeln!(out, "game tick");
        let _ = out.flush();
        std::thread::sleep(Duration::from_millis(50));
    }
}

/// Polls `path` until it holds a pid, bounded.
fn read_pid_file(path: &PathBuf) -> u32 {
    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        if let Ok(text) = std::fs::read_to_string(path) {
            if let Ok(pid) = text.trim().parse::<u32>() {
                return pid;
            }
        }
        assert!(Instant::now() < deadline, "game never reported its child");
        std::thread::sleep(Duration::from_millis(50));
    }
}

fn parent(args: &[String]) {
    let game_log = flag(args, "--game-log");
    let game_pids = flag(args, "--game-pids");

    let h1 = spawn_helper(self_command("idle", &[]), "standin-idle-1").expect("spawn helper 1");
    let h2 = spawn_helper(self_command("idle", &[]), "standin-idle-2").expect("spawn helper 2");

    let mut tree_cmd = self_command("tree", &[]);
    tree_cmd.stdin(Stdio::piped()).stdout(Stdio::piped());
    let (tree_pid, pipes) = spawn_helper_with_pipes(tree_cmd, "standin-tree").expect("spawn tree");
    let mut tree_in = pipes.stdin.expect("tree stdin");
    writeln!(tree_in, "go").expect("tell tree to go");
    tree_in.flush().expect("flush go");
    let mut line = String::new();
    BufReader::new(pipes.stdout.expect("tree stdout"))
        .read_line(&mut line)
        .expect("read grandchild pid");
    let grandchild: u32 = line.trim().parse().expect("grandchild pid");

    let game_pids_arg = game_pids.to_string_lossy().into_owned();
    let game_cmd = self_command("game", &["--game-pids", &game_pids_arg]);
    let game = spawn_game(game_cmd, Some(&game_log)).expect("spawn game");
    let game_child = read_pid_file(&game_pids);

    let manifest = format!(
        r#"{{"helpers":[{h1},{h2},{tree_pid}],"grandchildren":[{grandchild}],"games":[{},{game_child}]}}"#,
        game.id()
    );
    let mut out = std::io::stdout();
    writeln!(out, "{manifest}").expect("write manifest");
    out.flush().expect("flush manifest");

    // `quit` and stdin EOF (the test died) both drain the set, so no stray helper outlives a
    // failed run. The game is deliberately not touched: it is not in the set.
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
