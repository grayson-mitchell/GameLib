//! Stand-in for GameLib's shell, used only by `tests/orphans.rs` (feature `harness`). It spawns
//! its process tree through gamelib-proc exactly as the shell will, reports the pids as one JSON
//! line, then waits for `quit` on stdin and drains the global `ChildSet`.
//!
//! Modes:
//! - `parent --game-log <path> --game-pids <path>`: the stand-in shell. Spawns two `idle`
//!   helpers, one `tree` helper (a helper with a grandchild) and one `game` (Game class).
//! - `idle`: does nothing, forever.
//! - `tree`: waits for `go` on stdin, spawns one `idle` child, prints its pid, then idles.
//! - `game --game-pids <path> [--wait-for <path>]`: waits (bounded) for `--wait-for`'s file to exist,
//!   if given, then spawns one `game-child` through a plain std `Command` (so it
//!   shares the game's session), records its pid in the file, then writes a line to stdout every
//!   50 ms forever. Its stdout is a file or null, which is the Pitfall 5 point: the writes must
//!   keep succeeding after the parent is gone.
//! - `game-child`: idle.
//! - `game-tree --game-pids <path>`: a game whose leader exits at once. Spawns one `game-child` with
//!   a plain std `Command` (so it shares the leader's session and group), records its pid in the
//!   file, then exits while the child idles: a group that outlives its leader.
//! - `spec-tree`: the winetricks shape. Waits for `go` on stdin, spawns one `idle` grandchild with a
//!   plain std `Command` (so it shares the child's group or Job), prints its own pid and the
//!   grandchild's as two lines on stdout, then idles. `parent --spec-tree` runs it through
//!   `SpecProcRunner`, as an engine or wine port runs a helper that starts further processes.
//! - `stubborn`: sets SIGTERM to ignored (unix; elsewhere it just idles), prints `ready` on stdout
//!   once that is in place, then idles. Only SIGKILL ends it.
//! - `stubborn-tree`: `spec-tree` with a `stubborn` grandchild. Waits for `go` on stdin, spawns one
//!   `stubborn` grandchild with a plain std `Command` (so it shares the child's group or Job), waits
//!   for its `ready`, prints its own pid and the grandchild's as two lines on stdout, then idles.
//!   The leader itself ends on SIGTERM; its grandchild does not (WR-01).
//! - `detach`: the installer-bootstrapper shape. Waits for `go` on stdin, spawns one `idle`
//!   grandchild with a plain std `Command` (so it shares the child's group or Job), prints the
//!   grandchild's pid as one line on stdout and EXITS 0 while the grandchild idles. `parent
//!   --spec-detach` runs it through `SpecProcRunner`: a clean exit must leave the grandchild running
//!   (WR-03).
//! - `lines`: prints its own pid as one line on stdout, then idles (the streaming-runner test).
//! - `--gamelib-reaper` (as argv[1]): reaper mode. `main` hands over to the reaper before doing
//!   anything else, exactly as the shell's `fn main` does (plan 83-08), because the reaper is this
//!   same executable re-exec'd.
//!
//! `parent` flags: `--terminate-one` makes the stand-in answer a `kill-one` stdin line by ending the
//! `tree` helper (and so its grandchild) alone through `ChildSet::terminate_one`, then printing `done`.
//! `--game-stamp <path>` spawns the game through `spawn_game_tracked` and writes one
//! line `<pid> <stamp>` to the path (before the manifest is printed), the record a later stamp-checked
//! kill is given. The game is told to wait for that file, so it creates its child only after the
//! tracked spawn has put it in its Game Job (a grandchild created earlier would escape the Job). `--spec-tree` runs one `spec-tree` child through `SpecProcRunner` (on a background
//! runtime thread, so the run stays in flight) and adds its pid to `helpers` and its grandchild's to
//! `grandchildren`. `--stubborn-tree` (unix) adds two `stubborn-tree` helpers, one through
//! `spawn_helper_with_pipes` (an owned entry) and one through `SpecProcRunner` (a tokio-registered
//! entry), each with a SIGTERM-ignoring grandchild, so both are in `helpers` and `grandchildren`.
//! `--no-reaper` skips starting the reaper (the negative control: a SIGKILL of the
//! parent must then leave its helpers alive). `--leak-pipe` (unix) adds a fourth helper holding a
//! duplicate of the reaper pipe's write end as its stdin, so EOF never reaches the reaper.
//! `--node-sidecar <pids-file>` adds a Node process as a helper, standing in for the TS sidecar: it
//! spawns two children with plain `child_process.spawn` (no options beyond `stdio`, exactly like the
//! TS runner's tracked children), so they stay in its process group (unix) or Job (Windows).

use gamelib_core::process::{ProcSpec, SpecRunner};
use gamelib_proc::{
    global, reaper, spawn_game, spawn_game_tracked, spawn_helper, spawn_helper_with_pipes,
    SpecProcRunner,
};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

fn main() {
    // First statement: a re-exec'd reaper must never reach anything else in this binary.
    reaper::dispatch_if_requested();
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("idle") | Some("game-child") => idle(),
        Some("tree") => tree(),
        Some("spec-tree") => spec_tree(),
        Some("stubborn") => stubborn(),
        Some("stubborn-tree") => stubborn_tree(),
        Some("detach") => detach(),
        Some("lines") => lines(),
        Some("game") => game(&args[1..]),
        Some("game-tree") => game_tree(&args[1..]),
        Some("parent") => parent(&args[1..]),
        _ => {
            eprintln!(
                "usage: gamelib-proc-standin <parent|idle|tree|spec-tree|game|game-child> [flags]"
            );
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

/// The Node stand-in sidecar. One line on purpose (a multi-line `-e` argument is a quoting hazard
/// on Windows). It waits for `go` on stdin, so its children can never be created before the parent
/// has assigned it to its Job (the known Windows limit), then spawns two children with nothing but
/// `stdio: 'ignore'`, writes their pids to the file named by argv[1] and idles.
const NODE_SIDECAR_SCRIPT: &str = concat!(
    "const { spawn } = require('child_process');",
    "const fs = require('fs');",
    "const out = process.argv[1];",
    "process.stdin.once('data', () => {",
    "const kids = [0, 1].map(() => spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }));",
    "fs.writeFileSync(out, JSON.stringify(kids.map((k) => k.pid)) + '\\n');",
    "});",
    "setInterval(() => {}, 1000);"
);

/// Spawns the Node stand-in sidecar as a Helper and waits (bounded) for it to report its two
/// children. Returns its pid, its children's pids, and its stdin (held so the pipe stays open).
fn node_sidecar(pids_file: &PathBuf) -> (u32, Vec<u32>, std::process::ChildStdin) {
    let mut cmd = Command::new("node");
    cmd.arg("-e")
        .arg(NODE_SIDECAR_SCRIPT)
        .arg(pids_file)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let (pid, pipes) = spawn_helper_with_pipes(cmd, "standin-node").expect("spawn node sidecar");
    let mut stdin = pipes.stdin.expect("node stdin");
    writeln!(stdin, "go").expect("tell node to go");
    stdin.flush().expect("flush go");
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        if let Ok(text) = std::fs::read_to_string(pids_file) {
            if let Ok(kids) = serde_json::from_str::<Vec<u32>>(text.trim()) {
                if kids.len() == 2 {
                    return (pid, kids, stdin);
                }
            }
        }
        assert!(
            Instant::now() < deadline,
            "node sidecar never reported its children"
        );
        std::thread::sleep(Duration::from_millis(50));
    }
}

fn has_flag(args: &[String], name: &str) -> bool {
    args.iter().any(|a| a == name)
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
fn spec_tree() -> ! {
    // `SpecProcRunner` writes `go` after the child is in its Job, so the grandchild can never be
    // created before the assignment (the known Windows limit).
    let mut line = String::new();
    let _ = std::io::stdin().lock().read_line(&mut line);
    let grandchild = self_command("idle", &[]).spawn().expect("spawn grandchild");
    let mut out = std::io::stdout();
    writeln!(out, "{}", std::process::id()).expect("write own pid");
    writeln!(out, "{}", grandchild.id()).expect("write grandchild pid");
    out.flush().expect("flush pids");
    idle()
}

/// Starts one `idle` grandchild, reports its pid and exits at once: what it started keeps running.
// The child is deliberately never waited for: it idles until something kills it.
#[allow(clippy::zombie_processes)]
fn detach() -> ! {
    // As `spec_tree`: `go` arrives after the child is in its Job.
    let mut line = String::new();
    let _ = std::io::stdin().lock().read_line(&mut line);
    let grandchild = self_command("idle", &[]).spawn().expect("spawn grandchild");
    let mut out = std::io::stdout();
    writeln!(out, "{}", grandchild.id()).expect("write grandchild pid");
    out.flush().expect("flush grandchild pid");
    std::process::exit(0);
}

/// Ignores SIGTERM (unix), announces it with a `ready` line, then idles: only SIGKILL ends it.
fn stubborn() -> ! {
    #[cfg(unix)]
    // SAFETY: `signal` with SIG_IGN installs no handler and dereferences nothing.
    unsafe {
        libc::signal(libc::SIGTERM, libc::SIG_IGN);
    }
    let mut out = std::io::stdout();
    writeln!(out, "ready").expect("write ready");
    out.flush().expect("flush ready");
    idle()
}

// The child is deliberately never waited for: it idles until something kills it.
#[allow(clippy::zombie_processes)]
fn stubborn_tree() -> ! {
    // As `spec_tree`: `go` arrives after the child is in its Job.
    let mut line = String::new();
    let _ = std::io::stdin().lock().read_line(&mut line);
    let mut cmd = self_command("stubborn", &[]);
    cmd.stdout(Stdio::piped());
    let mut grandchild = cmd.spawn().expect("spawn grandchild");
    // Held to the end: the grandchild reports `ready` only after SIGTERM is ignored, so a quit can
    // never reach it before that is true.
    let mut ready = String::new();
    BufReader::new(grandchild.stdout.take().expect("grandchild stdout"))
        .read_line(&mut ready)
        .expect("read grandchild ready");
    let mut out = std::io::stdout();
    writeln!(out, "{}", std::process::id()).expect("write own pid");
    writeln!(out, "{}", grandchild.id()).expect("write grandchild pid");
    out.flush().expect("flush pids");
    idle()
}

/// Runs one `spec-tree`-shaped child (`mode`) through `SpecProcRunner` on a background runtime
/// thread, the way an engine or wine port runs winetricks, and returns (child pid, grandchild pid)
/// once it has reported both. The run stays in flight until the child is killed.
fn run_spec_tree(mode: &'static str, label: &'static str) -> (u32, u32) {
    let (tx, rx) = std::sync::mpsc::channel::<u32>();
    let exe = std::env::current_exe().expect("current_exe");
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("build runtime");
        let mut spec = ProcSpec::new(label, exe.to_string_lossy());
        spec.argv = vec![mode.into()];
        spec.stdin = Some("go\n".into());
        let on_line = Box::new(move |l: &str| {
            if let Ok(pid) = l.trim().parse::<u32>() {
                let _ = tx.send(pid);
            }
        });
        let out = rt.block_on(SpecProcRunner.run(spec, Some(on_line)));
        eprintln!("[standin] {mode} run ended: code {:?}", out.code);
    });
    let wait = Duration::from_secs(15);
    let child = rx.recv_timeout(wait).expect("spec-tree child pid");
    let grandchild = rx.recv_timeout(wait).expect("spec-tree grandchild pid");
    (child, grandchild)
}

// The child is deliberately never waited for: it idles until something kills it.
#[allow(clippy::zombie_processes)]
fn game(args: &[String]) -> ! {
    let pids_path = flag(args, "--game-pids");
    if has_flag(args, "--wait-for") {
        wait_for_file(&flag(args, "--wait-for"));
    }
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

/// A game whose leader exits as soon as it has recorded its child. The child is deliberately never
/// waited for: it idles until something kills it.
#[allow(clippy::zombie_processes)]
fn game_tree(args: &[String]) -> ! {
    let pids_path = flag(args, "--game-pids");
    let child = self_command("game-child", &[])
        .spawn()
        .expect("spawn game child");
    std::fs::write(&pids_path, format!("{}\n", child.id())).expect("write game child pid");
    std::process::exit(0);
}

/// Polls until `path` exists, bounded.
fn wait_for_file(path: &std::path::Path) {
    let deadline = Instant::now() + Duration::from_secs(15);
    while !path.exists() {
        assert!(Instant::now() < deadline, "the gate file never appeared");
        std::thread::sleep(Duration::from_millis(20));
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

    // The reaper starts before anything it must protect is spawned. Unix only: Windows has the
    // per-helper Job instead.
    let reaper_pid: Option<u32> = if cfg!(unix) && !has_flag(args, "--no-reaper") {
        Some(reaper::start().expect("start reaper"))
    } else {
        None
    };

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
    let mut game_args = vec!["--game-pids", game_pids_arg.as_str()];
    let game_stamp_arg = has_flag(args, "--game-stamp")
        .then(|| flag(args, "--game-stamp").to_string_lossy().into_owned());
    if let Some(gate) = &game_stamp_arg {
        game_args.extend(["--wait-for", gate.as_str()]);
    }
    let game_cmd = self_command("game", &game_args);
    // The handle (or child) is held until exit; dropping a `Child` never kills it, but holding it
    // keeps the unreaped-leader shape the shell has.
    let (game_pid, _game_hold): (u32, Box<dyn std::any::Any>) = if has_flag(args, "--game-stamp") {
        let handle = spawn_game_tracked(game_cmd, Some(&game_log)).expect("spawn tracked game");
        let stamp = handle.stamp.expect("a start stamp for the game leader");
        std::fs::write(
            flag(args, "--game-stamp"),
            format!("{} {stamp}\n", handle.pid),
        )
        .expect("write game stamp");
        (handle.pid, Box::new(handle))
    } else {
        let game = spawn_game(game_cmd, Some(&game_log)).expect("spawn game");
        (game.id(), Box::new(game))
    };
    let game_child = read_pid_file(&game_pids);

    // `mut` and `vec!` are only needed by the unix-only leaky helper below.
    #[cfg_attr(not(unix), allow(unused_mut, clippy::useless_vec))]
    let mut helpers = vec![h1, h2, tree_pid];
    let mut grandchildren = vec![grandchild];
    let mut _stubborn_pipes: Option<(
        std::process::ChildStdin,
        BufReader<std::process::ChildStdout>,
    )> = None;
    if has_flag(args, "--spec-tree") {
        let (child, grandchild) = run_spec_tree("spec-tree", "standin-spec-tree");
        helpers.push(child);
        grandchildren.push(grandchild);
    }
    if has_flag(args, "--stubborn-tree") {
        // An owned entry: the set holds the child and its pipes, like the `tree` helper.
        let mut cmd = self_command("stubborn-tree", &[]);
        cmd.stdin(Stdio::piped()).stdout(Stdio::piped());
        let (owned_pid, pipes) =
            spawn_helper_with_pipes(cmd, "standin-stubborn-owned").expect("spawn stubborn tree");
        let mut owned_in = pipes.stdin.expect("stubborn tree stdin");
        writeln!(owned_in, "go").expect("tell stubborn tree to go");
        owned_in.flush().expect("flush go");
        let mut owned_out = BufReader::new(pipes.stdout.expect("stubborn tree stdout"));
        let mut pids = [String::new(), String::new()];
        for slot in pids.iter_mut() {
            owned_out.read_line(slot).expect("read stubborn tree pid");
        }
        assert_eq!(
            pids[0]
                .trim()
                .parse::<u32>()
                .expect("stubborn tree own pid"),
            owned_pid
        );
        helpers.push(owned_pid);
        grandchildren.push(pids[1].trim().parse().expect("stubborn grandchild pid"));
        // Held until exit, like the `tree` helper's pipes.
        _stubborn_pipes = Some((owned_in, owned_out));
        // A tokio-registered entry, the SpecProcRunner shape.
        let (child, grandchild) = run_spec_tree("stubborn-tree", "standin-stubborn-tokio");
        helpers.push(child);
        grandchildren.push(grandchild);
    }
    // Held until exit so the node sidecar's stdin stays open, as the shell's would.
    let _node_stdin = if has_flag(args, "--node-sidecar") {
        let (node, kids, stdin) = node_sidecar(&flag(args, "--node-sidecar"));
        helpers.push(node);
        grandchildren.extend(kids);
        Some(stdin)
    } else {
        None
    };
    #[cfg(unix)]
    if has_flag(args, "--leak-pipe") {
        let fd = reaper::harness_dup_write_end().expect("a running reaper to leak the pipe of");
        let mut leak_cmd = self_command("idle", &[]);
        leak_cmd.stdin(Stdio::from(fd));
        helpers.push(spawn_helper(leak_cmd, "standin-leak").expect("spawn leaky helper"));
    }
    let join = |pids: &[u32]| {
        pids.iter()
            .map(u32::to_string)
            .collect::<Vec<_>>()
            .join(",")
    };
    let (helpers_json, grandchildren_json) = (join(&helpers), join(&grandchildren));
    let reaper_json = reaper_pid.map_or("null".to_string(), |p| p.to_string());
    let manifest = format!(
        r#"{{"helpers":[{helpers_json}],"grandchildren":[{grandchildren_json}],"games":[{game_pid},{game_child}],"reaper":{reaper_json}}}"#
    );
    let mut out = std::io::stdout();
    writeln!(out, "{manifest}").expect("write manifest");
    out.flush().expect("flush manifest");

    // `quit` and stdin EOF (the test died) both drain the set, so no stray helper outlives a
    // failed run. The game is deliberately not touched: it is not in the set.
    let terminate_one = has_flag(args, "--terminate-one");
    for line in std::io::stdin().lock().lines() {
        match line {
            Ok(l) if l.trim() == "quit" => break,
            Ok(l) if terminate_one && l.trim() == "kill-one" => {
                let found = global().terminate_one(tree_pid, Duration::from_millis(1500));
                assert!(found, "the tree helper was registered");
                writeln!(out, "done").expect("write done");
                out.flush().expect("flush done");
            }
            Ok(_) => {}
            Err(_) => break,
        }
    }
    global().terminate_all(Duration::from_millis(1500));
    // Graceful quit: the reaper signals nothing and exits.
    reaper::disarm();
    std::process::exit(0);
}
