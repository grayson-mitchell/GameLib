//! The shell's side of the Humble Bundle services (Phase 94, SVC-04): the one [`HumbleCtx`] and the
//! `humble` native channels, over the Tauri-free `gamelib-humble` crate.
//!
//! D-20: one `Arc<HumbleCtx>` is built in `run_setup` right after the store host opens, from the
//! shell's own user-data folder, `SystemClock`, the platform, the process-wide
//! `gamelib_core::shutdown::global()`, the shell's [`FrontendEmitter`] and a log sink that writes
//! fixed text only. Building it spawns nothing and waits on nothing; an op before [`install`] answers
//! `<op>:not-ready`. Every op runs inside the crate's `guarded` wrapper (a shutdown registrant raced
//! against the token).
//!
//! D-16/D-19: the two read-only channels here (`humbleGetGiftedAt`, `humbleGetOwnershipOverrides`)
//! are native, so the renderer reaches Rust directly and the sidecar registers neither. Rust only
//! reads the two stores through the StoreHost; the TypeScript library still writes them through the
//! sidecar's mirror, so each file has one writer.
//!
//! T-28-04 / T-94-23 / T-94-24: nothing here formats an argument into a log line or an error.

use super::*;

use std::path::Path;

use gamelib_core::clock::SystemClock;
use gamelib_core::emitter::FrontendEmitter;
use gamelib_humble::ctx::{HumbleCtx, HumbleLog, Platform};
use gamelib_store::host::StoreHost;

/// The one context, set once by [`install`].
static HUMBLE_CTX: OnceLock<Arc<HumbleCtx>> = OnceLock::new();

/// The installed context, or `None` before [`install`] (and in a unit test that built its own).
pub(crate) fn humble_ctx() -> Option<&'static Arc<HumbleCtx>> {
    HUMBLE_CTX.get()
}

/// The platform the crate is told about (it never asks the OS itself).
fn platform() -> Platform {
    if cfg!(target_os = "macos") {
        Platform::Mac
    } else if cfg!(target_os = "windows") {
        Platform::Windows
    } else {
        Platform::Linux
    }
}

/// The crate's diagnostic lines, into `gamelib.log`. A line is fixed text (see [`HumbleLog`]), so it
/// is a category in the sense of the shell's log gate; the level is carried by the text's prefix, the
/// way `shell_log_level` reads it.
struct ShellHumbleLog;

/// The text written for one crate line: `humble: <line>`, with the prefix the shell's level reader
/// understands for a warning or an error.
fn log_text(level: &str, line: &str) -> String {
    match level {
        "warn" => format!("WARN: humble: {line}"),
        "error" => format!("FATAL: humble: {line}"),
        _ => format!("humble: {line}"),
    }
}

impl HumbleLog for ShellHumbleLog {
    fn info(&self, line: &str) {
        shell_log(&log_text("info", line));
    }

    fn warn(&self, line: &str) {
        shell_log(&log_text("warn", line));
    }

    fn error(&self, line: &str) {
        shell_log(&log_text("error", line));
    }
}

/// Builds the context from its parts. Split from [`install`] so a unit test can build one over a fake
/// home. Nothing here spawns, connects or waits.
pub(crate) fn build_ctx(
    host: Arc<StoreHost>,
    user_data: &Path,
    platform: Platform,
    emitter: Arc<dyn FrontendEmitter>,
    log: Arc<dyn HumbleLog>,
    shutdown: gamelib_core::shutdown::Shutdown,
) -> HumbleCtx {
    HumbleCtx::new(
        host,
        user_data.to_path_buf(),
        Arc::new(SystemClock),
        platform,
        shutdown,
    )
    .with_emitter(emitter)
    .with_log(log)
}

/// Builds the one context and stores it. Called from `run_setup` after the store host opened and
/// before the sidecar is spawned. A second call is ignored (the first context stays).
pub(crate) fn install(app: &AppHandle, user_data: &Path) {
    let ctx = build_ctx(
        Arc::clone(store_boot::host()),
        user_data,
        platform(),
        Arc::new(steampoll_dispatch::TauriFrontendEmitter(app.clone())),
        Arc::new(ShellHumbleLog),
        gamelib_core::shutdown::global().clone(),
    );
    let _ = HUMBLE_CTX.set(Arc::new(ctx));
}

/// A rejected argument's JSON path and zod-vocabulary code: fixed literals only, never the renderer's
/// value (T-94-23).
type Rejection = (&'static str, &'static str);

/// `humbleGetGiftedAt` and `humbleGetOwnershipOverrides` take no argument.
fn parse_no_args(args: &[Value]) -> Result<(), Rejection> {
    if args.is_empty() {
        Ok(())
    } else {
        Err(("(args)", "too_big"))
    }
}

/// Runs `op` on the blocking pool. The crate's own async `dispatch` is driven with `block_on` there
/// (never `dispatch_sync`, which refuses a thread inside a runtime), so a store read stays off the
/// async workers and the op still holds its shutdown registrant.
async fn run_humble_op(
    humble: Arc<HumbleCtx>,
    op: &'static str,
    args: Vec<Value>,
    failed: &'static str,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        tauri::async_runtime::block_on(gamelib_humble::dispatch(op, &args, &humble))
    })
    .await
    .map_err(|_| failed.to_string())?
}

/// One no-argument read: validated first (so a bad call is rejected the same way before and after
/// the context is installed), then run.
async fn no_arg_read(
    channel: &'static str,
    op: &'static str,
    failed: &'static str,
    args: Vec<Value>,
) -> Result<Value, String> {
    parse_no_args(&args).map_err(|(path, code)| invalid_args(channel, &[path], &[code]))?;
    let humble = humble_ctx().ok_or_else(|| format!("{op}:not-ready"))?;
    run_humble_op(Arc::clone(humble), op, Vec::new(), failed).await
}

/// The native `humbleGetGiftedAt` handler (slice `humble`, D-16): machine name to the time the user
/// confirmed the gift action, read from the Humble store through the StoreHost.
pub(crate) fn get_gifted_at(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(no_arg_read(
        "humbleGetGiftedAt",
        "humble_get_gifted_at",
        "humbleGetGiftedAt: the read did not finish",
        args,
    ))
}

/// The native `humbleGetOwnershipOverrides` handler (slice `humble`, D-16): machine name to the time of
/// the "not the same game" correction.
pub(crate) fn get_ownership_overrides(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(no_arg_read(
        "humbleGetOwnershipOverrides",
        "humble_get_ownership_overrides",
        "humbleGetOwnershipOverrides: the read did not finish",
        args,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_testutil::FakeHome;
    use serde_json::json;
    use std::sync::Mutex;

    /// Records every `(channel, args)` push.
    #[derive(Default)]
    struct RecordingEmitter(Mutex<Vec<(String, Vec<Value>)>>);

    impl FrontendEmitter for RecordingEmitter {
        fn emit(&self, channel: &str, args: Vec<Value>) {
            self.0.lock().unwrap().push((channel.to_string(), args));
        }
    }

    /// Records every line the crate wrote.
    #[derive(Default)]
    struct RecordingLog(Mutex<Vec<String>>);

    impl HumbleLog for RecordingLog {
        fn info(&self, line: &str) {
            self.0.lock().unwrap().push(format!("info {line}"));
        }
        fn warn(&self, line: &str) {
            self.0.lock().unwrap().push(format!("warn {line}"));
        }
        fn error(&self, line: &str) {
            self.0.lock().unwrap().push(format!("error {line}"));
        }
    }

    /// A host that does nothing: the humble handlers never reach the native host.
    struct NoHost;
    impl crate::native_router::NativeHost for NoHost {
        fn open_url(&self, _url: String) {}
        fn reveal_path(&self, _path: String) {}
    }

    fn router_ctx() -> Arc<NativeCtx> {
        Arc::new(NativeCtx::for_tests(Arc::new(NoHost), None))
    }

    /// A context over a fresh fake home, with the gifted-at file seeded.
    fn ctx_over(home: &FakeHome) -> Arc<HumbleCtx> {
        let dir = home.root().join("store_cache");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("humble_gifted_at.json"),
            "{\n\t\"cactus_steam\": {\n\t\t\"giftedAt\": 1795521600000\n\t},\n\t\"__timestamp\": {\n\t\t\"cactus_steam\": \"x\"\n\t}\n}",
        )
        .unwrap();
        Arc::new(build_ctx(
            Arc::new(StoreHost::new()),
            home.root(),
            Platform::Linux,
            Arc::new(RecordingEmitter::default()),
            Arc::new(RecordingLog::default()),
            Shutdown::new(),
        ))
    }

    #[test]
    fn the_handlers_validate_first_and_answer_not_ready_before_install() {
        // No test installs the global context.
        assert!(humble_ctx().is_none());
        let ctx = router_ctx();
        let not_ready = tauri::async_runtime::block_on(get_gifted_at(Arc::clone(&ctx), vec![]));
        assert_eq!(not_ready, Err("humble_get_gifted_at:not-ready".to_string()));
        let not_ready =
            tauri::async_runtime::block_on(get_ownership_overrides(Arc::clone(&ctx), vec![]));
        assert_eq!(
            not_ready,
            Err("humble_get_ownership_overrides:not-ready".to_string())
        );
        // A bad call is rejected with the marker and fixed literals, before the context, and the
        // renderer's value never reaches the error (T-94-23).
        for bad in [
            tauri::async_runtime::block_on(get_gifted_at(Arc::clone(&ctx), vec![json!(1)])),
            tauri::async_runtime::block_on(get_gifted_at(
                Arc::clone(&ctx),
                vec![json!("SECRET-ARG")],
            )),
            tauri::async_runtime::block_on(get_ownership_overrides(
                Arc::clone(&ctx),
                vec![json!(["x"])],
            )),
            tauri::async_runtime::block_on(get_ownership_overrides(ctx, vec![json!(null)])),
        ] {
            let error = bad.unwrap_err();
            assert!(
                error.starts_with(crate::ipc_contract::IPC_INVALID_ARGS_MARKER),
                "{error}"
            );
            assert!(!error.contains("SECRET"), "{error}");
        }
    }

    #[test]
    fn the_gifted_at_op_answers_the_seeded_file_and_the_other_is_empty() {
        let home = FakeHome::new("humble-dispatch-");
        let humble = ctx_over(&home);
        let gifted = tauri::async_runtime::block_on(run_humble_op(
            Arc::clone(&humble),
            "humble_get_gifted_at",
            Vec::new(),
            "failed",
        ));
        assert_eq!(gifted, Ok(json!({ "cactus_steam": 1795521600000_u64 })));
        let overrides = tauri::async_runtime::block_on(run_humble_op(
            humble,
            "humble_get_ownership_overrides",
            Vec::new(),
            "failed",
        ));
        assert_eq!(overrides, Ok(json!({})));
    }

    #[test]
    fn the_context_is_built_without_spawning_and_carries_the_shell_parts() {
        let home = FakeHome::new("humble-dispatch-build-");
        let emitter = Arc::new(RecordingEmitter::default());
        let log = Arc::new(RecordingLog::default());
        let ctx = build_ctx(
            Arc::new(StoreHost::new()),
            home.root(),
            Platform::Mac,
            emitter.clone(),
            log.clone(),
            Shutdown::new(),
        );
        assert_eq!(ctx.platform, Platform::Mac);
        assert_eq!(ctx.user_data, home.root());
        // Building touched neither the emitter, the log nor the disk.
        assert!(emitter.0.lock().unwrap().is_empty());
        assert!(log.0.lock().unwrap().is_empty());
        assert!(std::fs::read_dir(home.root()).unwrap().next().is_none());
    }

    #[test]
    fn a_log_line_carries_its_level_in_the_prefix_the_shell_reads() {
        use gamelib_log::Level;
        assert_eq!(
            shell_log_level(&log_text("info", "sync started")),
            Level::Info
        );
        assert_eq!(
            shell_log_level(&log_text("warn", "sync denied")),
            Level::Warning
        );
        assert_eq!(
            shell_log_level(&log_text("error", "store unreadable")),
            Level::Error
        );
    }
}
