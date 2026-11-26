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
//! - `shell --user-data <dir> --args <json>`: the stand-in shell. Builds a `LaunchCtx` over a `StoreHost` rooted
//!   at `<dir>` the way `gamelib-launch-cli` does (no keyring, no real profile), runs `launch_runner_call`
//!   with the JSON array `<json>`, prints the reply and exits.

use std::io::Write;
use std::path::PathBuf;
use std::process::{exit, Command, Stdio};
use std::sync::Arc;
use std::time::{Duration, Instant};

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform as InfoPlatform};
use gamelib_info::http::ReqwestHttp;
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_launch::ctx::LaunchCtx;
use gamelib_proc::SpecProcRunner;
use gamelib_store::host::StoreHost;
use gamelib_wine::ctx::WineCtx;

/// How long the game waits before it creates its child (see the module doc).
const CHILD_DELAY: Duration = Duration::from_millis(100);

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("idle") => idle(&args[1..]),
        Some("game") => game(&args[1..]),
        Some("shell") => shell(&args[1..]),
        _ => {
            eprintln!("usage: gamelib-launch-stub-game <game|idle|shell> [flags]");
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

fn platform() -> Platform {
    if cfg!(target_os = "macos") {
        Platform::Mac
    } else if cfg!(windows) {
        Platform::Windows
    } else {
        Platform::Linux
    }
}

fn info_platform() -> InfoPlatform {
    if cfg!(target_os = "macos") {
        InfoPlatform::Mac
    } else if cfg!(windows) {
        InfoPlatform::Windows
    } else {
        InfoPlatform::Linux
    }
}

fn shell(args: &[String]) -> ! {
    let user_data = PathBuf::from(value(args, "--user-data").expect("--user-data <dir>"));
    let op_args: Vec<serde_json::Value> =
        match serde_json::from_str(value(args, "--args").expect("--args <json>")) {
            Ok(serde_json::Value::Array(items)) => items,
            _ => {
                eprintln!("--args must be a JSON array");
                exit(2);
            }
        };
    let info = Arc::new(InfoCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        info_platform(),
        InfoPaths {
            app_folder: user_data.clone(),
            user_data: user_data.clone(),
            temp: user_data.join("temp"),
            public_dir: None,
        },
        "0.0.0".to_string(),
        Shutdown::new(),
        Arc::new(ReqwestHttp::new()),
    ));
    let engine = Arc::new(
        EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            platform(),
            EnginePaths {
                app_folder: user_data.clone(),
                tools_path: user_data.join("tools"),
                user_home: user_data.join("home"),
                temp: user_data.join("temp"),
                user_data: user_data.clone(),
            },
            Shutdown::new(),
        )
        .with_proc(Arc::new(SpecProcRunner)),
    );
    let knownfix = Arc::new(KnownFixCtx::new(
        engine.clone(),
        None,
        gamelib_knownfix::report::RELAY_URL_PENDING_SENTINEL,
        "0.0.0",
    ));
    let wine = Arc::new(WineCtx::new(engine.clone(), user_data.join("tools")));
    let ctx = LaunchCtx::new(engine, knownfix, wine, info);
    match gamelib_launch::dispatch_sync("launch_runner_call", &op_args, &ctx) {
        Ok(reply) => {
            println!("{reply}");
            exit(0)
        }
        Err(e) => {
            eprintln!("{e}");
            exit(2)
        }
    }
}
