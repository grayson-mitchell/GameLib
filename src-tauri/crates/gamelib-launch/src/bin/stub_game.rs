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
//! - `exit [--code <n>]`: exits at once with that code (0 when none). The golden replay's scripted game.
//! - `term`: ends itself with SIGTERM (unix; elsewhere it exits 1). The golden replay's signalled game.
//! - `shell --user-data <dir> --args <json>`: the stand-in shell. Builds a `LaunchCtx` over a `StoreHost` rooted
//!   at `<dir>` the way `gamelib-launch-cli` does (no keyring, no real profile), runs `launch_runner_call`
//!   with the JSON array `<json>`, prints the reply and exits.
//! - `shell --user-data <dir> --funnel <params json> --game <stub args json> [--after-script <path>]`: the
//!   stand-in shell running one funnel launch (88.3-09). `run_launch` runs over in-binary manager hooks that
//!   answer `launch_facts` (a native sideload game whose install folder is `<dir>/install`, with the script at
//!   `<path>` as its after-script) and `launch` (a game-class `call_runner` of the stub game with `<stub args
//!   json>`, a JSON array of the stub's own arguments). A test ends this process with SIGKILL while the game
//!   runs, and a later context over the same `<dir>` re-adopts the game from its launch record.

use std::io::Write;
use std::path::PathBuf;
use std::process::{exit, Command, Stdio};
use std::sync::Arc;
use std::time::{Duration, Instant};

use gamelib_core::clock::SystemClock;
use gamelib_core::process::BoxFuture;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform as InfoPlatform};
use gamelib_info::http::ReqwestHttp;
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_launch::ctx::LaunchCtx;
use gamelib_launch::funnel::steps::testing::RecordingSteps;
use gamelib_launch::funnel::{run::run_launch, FunnelHost, LaunchParams};
use gamelib_launch::hooks::{
    HookError, LaunchFacts, LaunchHookArgs, LaunchHookReply, ManagerHooks,
};
use gamelib_launch::runner::call_runner::{
    call_runner, RunnerCallArgs, RunnerHost, RunnerProps, SpawnClassArg,
};
use gamelib_launch::runner::stream::NullSink;
use gamelib_launch::runner::{RunnerErrors, RunnerName};
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
        Some("exit") => exit(number(&args[1..], "--code").unwrap_or(0) as i32),
        Some("term") => term(),
        Some("shell") => shell(&args[1..]),
        _ => {
            eprintln!("usage: gamelib-launch-stub-game <game|idle|exit|term|shell> [flags]");
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

/// Ends this process with SIGTERM, which nothing here handles, so the status the parent reads is the signal.
#[cfg(unix)]
fn term() -> ! {
    let _ = Command::new("kill")
        .arg("-TERM")
        .arg(std::process::id().to_string())
        .status();
    // The signal lands while this sleeps.
    loop {
        std::thread::sleep(Duration::from_secs(1));
    }
}

#[cfg(not(unix))]
fn term() -> ! {
    exit(1)
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

fn launch_ctx(user_data: &std::path::Path) -> LaunchCtx {
    let info = Arc::new(InfoCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        info_platform(),
        InfoPaths {
            app_folder: user_data.to_path_buf(),
            user_data: user_data.to_path_buf(),
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
                app_folder: user_data.to_path_buf(),
                tools_path: user_data.join("tools"),
                user_home: user_data.join("home"),
                temp: user_data.join("temp"),
                user_data: user_data.to_path_buf(),
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
    LaunchCtx::new(engine, knownfix, wine, info)
}

fn shell(args: &[String]) -> ! {
    let user_data = PathBuf::from(value(args, "--user-data").expect("--user-data <dir>"));
    if args.iter().any(|a| a == "--funnel") {
        funnel_shell(&user_data, args);
    }
    let op_args: Vec<serde_json::Value> =
        match serde_json::from_str(value(args, "--args").expect("--args <json>")) {
            Ok(serde_json::Value::Array(items)) => items,
            _ => {
                eprintln!("--args must be a JSON array");
                exit(2);
            }
        };
    let ctx = launch_ctx(&user_data);
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

struct QuietErrors;

impl RunnerErrors for QuietErrors {
    fn handle(&self, _error: &str, _app_name: &str, _runner: RunnerName) {}
}

/// The managers of the funnel shell: facts for one native sideload game, and a `launch` that runs the stub game
/// as the game class, with the funnel's own log hand-off as its log target (what `game.launch` does).
struct FunnelHooks {
    /// A context without these hooks (they would otherwise hold a reference to themselves).
    ctx: LaunchCtx,
    game_args: Vec<String>,
    install_path: PathBuf,
    after_script: Option<String>,
}

impl ManagerHooks for FunnelHooks {
    fn game_title(
        &self,
        _runner: RunnerName,
        app_name: &str,
    ) -> BoxFuture<Result<String, HookError>> {
        let title = app_name.to_string();
        Box::pin(async move { Ok(title) })
    }

    fn force_uninstall(
        &self,
        _runner: RunnerName,
        _app_name: &str,
    ) -> BoxFuture<Result<(), HookError>> {
        Box::pin(async { Ok(()) })
    }

    fn launch_facts(
        &self,
        _runner: RunnerName,
        app_name: &str,
    ) -> BoxFuture<Result<LaunchFacts, HookError>> {
        let mut settings = serde_json::json!({ "verboseLogs": true });
        if let Some(script) = &self.after_script {
            settings["afterLaunchScriptPath"] = serde_json::json!(script);
        }
        let facts: LaunchFacts = serde_json::from_value(serde_json::json!({
            "gameInfo": {
                "title": app_name,
                "install": { "install_path": self.install_path, "executable": "stub" },
            },
            "settings": settings,
            "isNative": true,
            "verboseLogs": true,
        }))
        .expect("the facts read");
        Box::pin(async move { Ok(facts) })
    }

    fn launch(
        &self,
        _runner: RunnerName,
        app_name: &str,
        args: LaunchHookArgs,
    ) -> BoxFuture<Result<LaunchHookReply, HookError>> {
        // The key every launch site tracks its run under is the app name (`abortId` / `trackKey`).
        let call = RunnerCallArgs {
            stream_id: String::new(),
            command_parts: self.game_args.clone(),
            runner: RunnerProps {
                name: RunnerName::Sideload,
                bin: std::env::current_exe()
                    .expect("current_exe")
                    .to_string_lossy()
                    .into_owned(),
                dir: None,
                log_prefix: "Sideload".to_string(),
            },
            env: Default::default(),
            wrappers: Vec::new(),
            log_message_prefix: None,
            log_targets: vec![args.log.to_runner_hand_off()],
            log_sanitizer: None,
            abort_id: Some(app_name.to_string()),
            track_key: Some(app_name.to_string()),
            cwd: None,
            skip_error_handler: false,
            observe: true,
            spawn_class: SpawnClassArg::Game,
        };
        let ctx = self.ctx.clone();
        Box::pin(async move {
            let host = RunnerHost::default();
            let result = call_runner(&ctx, call, &host, Arc::new(NullSink)).await;
            Ok(LaunchHookReply {
                launched: result.error.is_none() && result.abort.is_none(),
                rotated: false,
            })
        })
    }
}

/// `shell --funnel`: one funnel launch of the stub game, run to its end (or until this process is killed).
fn funnel_shell(user_data: &std::path::Path, args: &[String]) -> ! {
    let params: LaunchParams =
        match serde_json::from_str(value(args, "--funnel").expect("--funnel <json>")) {
            Ok(params) => params,
            Err(e) => {
                eprintln!("--funnel must be launch params: {e}");
                exit(2);
            }
        };
    let game_args: Vec<String> =
        match serde_json::from_str(value(args, "--game").expect("--game <json>")) {
            Ok(game_args) => game_args,
            Err(e) => {
                eprintln!("--game must be a JSON array of strings: {e}");
                exit(2);
            }
        };
    let install_path = user_data.join("install");
    std::fs::create_dir_all(&install_path).expect("the install folder");
    let base = launch_ctx(user_data).with_errors(Arc::new(QuietErrors));
    let hooks = Arc::new(FunnelHooks {
        ctx: base.clone(),
        game_args,
        install_path,
        after_script: value(args, "--after-script").map(str::to_string),
    });
    let ctx = base
        .with_hooks(hooks)
        .with_steps(Arc::new(RecordingSteps::new()));
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .expect("runtime");
    let status = runtime.block_on(run_launch(&ctx, params, &FunnelHost::default()));
    println!("{status:?}");
    exit(0)
}
