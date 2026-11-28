//! The shell's side of the launch services (Phase 88.1, SVC-03): the one [`LaunchCtx`], and the
//! `launch_*` `rustInvoke` arms over the Tauri-free `gamelib-launch` crate.
//!
//! D-20: one `Arc<LaunchCtx>` is built by [`install`] in `run_setup` right after
//! [`knownfix_dispatch::install`], from the engine, known-fix, wine and information contexts already installed
//! (the information context is the one `info_dispatch` owns, so the native system-information channel and the
//! launch log share one single-flight cache, 88.1-11). Nothing
//! here spawns a process or waits: the builder ops are pure computations or a disk read, so each
//! `rustInvoke` arm runs the crate's `dispatch_sync` on the dispatcher's worker thread and the sidecar keeps
//! them inside the 60 s `RUST_INVOKE_TIMEOUT_MS`. Until [`install`] has run, every arm answers
//! `<op>:not-ready`.
//!
//! D-19: each channel is reached from the managers through a shim in `launchrust/builders.ts`; there is no
//! sidecar fallback.
//!
//! T-88.1-13: the arguments are decoded by the generated type (a wrong shape is rejected the same fixed
//! `<op>:bad-args` literal before and after the install) and an arity check, and a rejection never echoes the
//! sidecar's value. The crate then decodes strictly again.
//!
//! T-88.1-14: the host facts the env builders read (the process environment, the Darwin release) are
//! [`wine_dispatch::wine_run_host`], appended here; the sidecar sends neither.
//!
//! 88.3-06 (D-01, D-26): the `launch_run` arm starts one Play in the Rust launch funnel
//! (`gamelib_launch::funnel`); [`SidecarManagerHooks`] carries every funnel hook (`launch_facts`, `launch`,
//! `sync_saves`, `set_presence`, `clear_presence`, `persist_bottle_wine_version`, `update_gog_playtime`,
//! `wine_settings_write`) to the TS managers over the one `launchManagerCall` channel, and [`ShellFunnel`] does the
//! funnel's window, wake lock and CLI exit work through the shell's own functions.
//!
//! 88.1-14 (D-28): the context carries a dialog source, [`ShellDialogs`], the same native message box
//! `dialog_message` shows, so `checkWineBeforeLaunch` asks its question from Rust. A dismissal is `None`, never
//! index 0 (CR-04).

use super::*;

use gamelib_launch::ctx::LaunchCtx;
use gamelib_launch::prepare::deps::WineManagerFacts;
use gamelib_launch::prepare::dialogs::LaunchDialogs;

/// The one context, set once by [`install`].
static LAUNCH_CTX: OnceLock<Arc<LaunchCtx>> = OnceLock::new();

/// The installed context, or `None` before [`install`] (and in a unit test that built its own).
pub(crate) fn launch_ctx() -> Option<&'static Arc<LaunchCtx>> {
    LAUNCH_CTX.get()
}

/// The prepare steps' modal over the shell's native message box: the same box `dialog_message` builds
/// ([`dialogs::rpc_dialog_message`]: two labels are an `OkCancelCustom`, built and shown on the main thread and
/// awaited on a spawned one). The call blocks the worker thread that runs the op until the user answers, as the
/// `dialog_message` arm blocks its own. A dismissal, a failure to show it and any answer that is not a button index
/// are all `None` (CR-04, T-88.1-34): a failed dialog is never read as "Yes".
struct ShellDialogs {
    app: AppHandle,
}

impl LaunchDialogs for ShellDialogs {
    fn ask(&self, title: &str, message: &str, buttons: &[String]) -> Option<usize> {
        let answer = dialogs::rpc_dialog_message(
            &[serde_json::json!({ "title": title, "message": message, "buttons": buttons })],
            &self.app,
        )
        .ok()?;
        // A dismissal is `null`; a click is the button's index, which must be one of the labels shown.
        answer
            .as_u64()
            .map(|index| index as usize)
            .filter(|index| *index < buttons.len())
    }
}

/// The Rust-to-sidecar invoke channel the TS managers answer (88.2-18, D-26). Called as `[op, payload]`: 88.2's
/// two ops, [`HOOK_OP_GAME_TITLE`] and [`HOOK_OP_FORCE_UNINSTALL`], carry `{ runner, appName }`, and 88.3-06's eight
/// funnel ops carry the payload each of them documents below. It is in `LONG_RUNNING_CHANNELS`: the funnel's
/// `launch` hook spans a whole play session on this channel, so no wall-clock bound is right for it.
pub(crate) const LAUNCH_MANAGER_CALL: &str = "launchManagerCall";
const HOOK_OP_GAME_TITLE: &str = "game_title";
const HOOK_OP_FORCE_UNINSTALL: &str = "force_uninstall";
/// `{ runner, appName }`; answers the `LaunchFacts` object.
const HOOK_OP_LAUNCH_FACTS: &str = "launch_facts";
/// `{ runner, appName, launchArguments?, args?, skipVersionCheck?, log }` (an argument the Play did not send is
/// left out; `log` is `{ target, disabled, rotate }`); answers `{ launched, rotated? }` once the game's process
/// is over.
const HOOK_OP_LAUNCH: &str = "launch";
/// `{ runner, appName, direction, savesPath, gogSaves }` (`direction` is `--skip-upload` or `--skip-download`,
/// the other two the game's settings values, `null` when absent); answers `true`, or `false` when the sync threw
/// (the TS handler has written the error line).
const HOOK_OP_SYNC_SAVES: &str = "sync_saves";
/// `{ runner, appName }`; answers `true`, or `false` when the store defines no presence.
const HOOK_OP_SET_PRESENCE: &str = "set_presence";
/// `{ runner }`; answers `true`, or `false` when the store defines no presence.
const HOOK_OP_CLEAR_PRESENCE: &str = "clear_presence";
/// `{ runner, appName, wine }`; answers `true`, or `false` when the store defines no such member.
const HOOK_OP_PERSIST_BOTTLE_WINE_VERSION: &str = "persist_bottle_wine_version";
/// `{ appName, start, end }` (the instants as `toISOString` text); answers `true`.
const HOOK_OP_UPDATE_GOG_PLAYTIME: &str = "update_gog_playtime";
/// `{ appName, global?, game? }` (the `wineVersion` values the Wine check chose, a missing one left out);
/// answers `true`.
const HOOK_OP_WINE_SETTINGS_WRITE: &str = "wine_settings_write";
/// The name of the thread each hook call runs on (never the shared blocking pool: a call may wait as long
/// as the sidecar takes, and must not hold a pool worker the rest of the shell needs).
const HOOK_THREAD_NAME: &str = "launch-manager-hook";
/// The fixed category word of every failure of the transport. It never carries the runner, the app name or the
/// sidecar's error text (T-88.2-47).
const HOOK_SIDECAR: &str = "sidecar";
/// The fixed category word of a reply that is not the shape the op answers.
const HOOK_BAD_REPLY: &str = "bad-reply";

/// How a hook reaches the sidecar: the channel and its arguments in, the sidecar's reply or its error text out.
/// The production one is [`sidecar_invoke`]; a test passes a scripted one.
type HookInvoke = Arc<dyn Fn(&str, Vec<Value>) -> Result<Value, String> + Send + Sync>;

/// `SidecarState::invoke` over the sidecar the shell spawned. The state does not exist yet when [`install`]
/// runs (the sidecar is spawned after the launch context is built), so it is looked up per call; before it
/// exists, and after the sidecar closed, the call is an error and the hook answers `HookError("sidecar")`.
fn sidecar_invoke(channel: &str, args: Vec<Value>) -> Result<Value, String> {
    let state = store_dispatch::sidecar_state().ok_or_else(|| HOOK_SIDECAR.to_string())?;
    state.invoke(channel.to_string(), args)
}

/// The slot a hook's thread answers into and the future reads: a value, the waker of whoever awaits it, and
/// whether the thread ended without answering.
struct HookSlot<T> {
    value: Option<T>,
    waker: Option<std::task::Waker>,
    closed: bool,
}

/// The sending half. Dropping it without sending (a panicking thread) closes the slot, so the future
/// answers an error instead of waiting forever.
struct HookSender<T>(Arc<Mutex<HookSlot<T>>>);

impl<T> HookSender<T> {
    fn send(self, value: T) {
        let mut slot = self.0.lock().unwrap_or_else(|e| e.into_inner());
        slot.value = Some(value);
        if let Some(waker) = slot.waker.take() {
            waker.wake();
        }
    }
}

impl<T> Drop for HookSender<T> {
    fn drop(&mut self) {
        let mut slot = self.0.lock().unwrap_or_else(|e| e.into_inner());
        slot.closed = true;
        if let Some(waker) = slot.waker.take() {
            waker.wake();
        }
    }
}

/// The receiving half: ready with the thread's answer, or with `None` if the thread ended without one.
struct HookReceiver<T>(Arc<Mutex<HookSlot<T>>>);

impl<T> std::future::Future for HookReceiver<T> {
    type Output = Option<T>;

    fn poll(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<T>> {
        let mut slot = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(value) = slot.value.take() {
            return std::task::Poll::Ready(Some(value));
        }
        if slot.closed {
            return std::task::Poll::Ready(None);
        }
        slot.waker = Some(cx.waker().clone());
        std::task::Poll::Pending
    }
}

fn hook_slot<T>() -> (HookSender<T>, HookReceiver<T>) {
    let slot = Arc::new(Mutex::new(HookSlot {
        value: None,
        waker: None,
        closed: false,
    }));
    (HookSender(Arc::clone(&slot)), HookReceiver(slot))
}

/// The shell's [`ManagerHooks`] (88.2-18, D-26): each call asks the TS managers over [`LAUNCH_MANAGER_CALL`]
/// from a thread of its own and answers through a one-shot slot. An error of any kind (no sidecar, a closed
/// sidecar, an error reply, a thread that would not start) is `HookError("sidecar")`, never the text of the
/// error and never the runner or the app name (T-88.2-47); a sidecar that goes away fails every pending call
/// through `drain_pending_invokes` (T-88.2-28), so no call outlives it.
struct SidecarManagerHooks {
    invoke: HookInvoke,
}

impl SidecarManagerHooks {
    fn new(invoke: HookInvoke) -> SidecarManagerHooks {
        SidecarManagerHooks { invoke }
    }

    /// Sends `[op, { runner, appName }]` from a named thread and answers the reply, or the category word.
    fn ask(
        &self,
        op: &'static str,
        runner: gamelib_launch::runner::RunnerName,
        app_name: &str,
    ) -> gamelib_core::process::BoxFuture<Result<Value, gamelib_launch::hooks::HookError>> {
        self.ask_with(
            op,
            serde_json::json!({ "runner": runner.as_str(), "appName": app_name }),
        )
    }

    /// Sends `[op, payload]` from a thread of its own (named [`HOOK_THREAD_NAME`], never the shared blocking
    /// pool: a call may wait as long as the sidecar takes) and answers the reply, or the category word. A
    /// sidecar that is not there, one that closed, an error reply and a thread that would not start or ended
    /// without answering are all `HookError("sidecar")`; nothing of the payload or the error text is kept.
    fn ask_with(
        &self,
        op: &'static str,
        payload: Value,
    ) -> gamelib_core::process::BoxFuture<Result<Value, gamelib_launch::hooks::HookError>> {
        use gamelib_launch::hooks::HookError;
        let invoke = Arc::clone(&self.invoke);
        let args = vec![serde_json::json!(op), payload];
        let (tx, rx) = hook_slot::<Result<Value, String>>();
        let spawned = thread::Builder::new()
            .name(HOOK_THREAD_NAME.into())
            .spawn(move || {
                let reply = invoke(LAUNCH_MANAGER_CALL, args);
                tx.send(reply);
            });
        if spawned.is_err() {
            return Box::pin(async { Err(HookError(HOOK_SIDECAR)) });
        }
        Box::pin(async move {
            match rx.await {
                Some(Ok(reply)) => Ok(reply),
                _ => Err(HookError(HOOK_SIDECAR)),
            }
        })
    }
}

/// A reply that must be exactly `true`: an acknowledgement. Anything else is `bad-reply`.
fn acknowledged(reply: &Value) -> Result<(), gamelib_launch::hooks::HookError> {
    match reply {
        Value::Bool(true) => Ok(()),
        _ => Err(gamelib_launch::hooks::HookError(HOOK_BAD_REPLY)),
    }
}

/// The acknowledgement of a store member that may not exist (`launchHooks[runner].setPresence?.()`): `true` is
/// done, `false` is a store that defines none (`unavailable`, which the funnel treats as "nothing to do").
fn acknowledged_or_undefined(reply: &Value) -> Result<(), gamelib_launch::hooks::HookError> {
    match reply {
        Value::Bool(true) => Ok(()),
        Value::Bool(false) => Err(gamelib_launch::hooks::HookError("unavailable")),
        _ => Err(gamelib_launch::hooks::HookError(HOOK_BAD_REPLY)),
    }
}

/// `launch`'s payload: the arguments the Play sent are present, the ones it did not send are left out (the TS
/// passed `undefined`, which is not `null`), then the log hand-off.
fn launch_payload(
    runner: gamelib_launch::runner::RunnerName,
    app_name: &str,
    args: &gamelib_launch::hooks::LaunchHookArgs,
) -> Value {
    let mut payload = serde_json::Map::new();
    payload.insert("runner".into(), Value::String(runner.as_str().to_string()));
    payload.insert("appName".into(), Value::String(app_name.to_string()));
    if let Some(option) = &args.launch_arguments {
        payload.insert("launchArguments".into(), option.clone());
    }
    if let Some(extra) = &args.args {
        payload.insert("args".into(), serde_json::json!(extra));
    }
    if let Some(skip) = args.skip_version_check {
        payload.insert("skipVersionCheck".into(), Value::Bool(skip));
    }
    payload.insert(
        "log".into(),
        serde_json::to_value(&args.log).unwrap_or(Value::Null),
    );
    Value::Object(payload)
}

impl gamelib_launch::hooks::ManagerHooks for SidecarManagerHooks {
    fn game_title(
        &self,
        runner: gamelib_launch::runner::RunnerName,
        app_name: &str,
    ) -> gamelib_core::process::BoxFuture<Result<String, gamelib_launch::hooks::HookError>> {
        use gamelib_launch::hooks::HookError;
        let reply = self.ask(HOOK_OP_GAME_TITLE, runner, app_name);
        Box::pin(async move {
            match reply.await? {
                Value::String(title) => Ok(title),
                _ => Err(HookError(HOOK_BAD_REPLY)),
            }
        })
    }

    fn force_uninstall(
        &self,
        runner: gamelib_launch::runner::RunnerName,
        app_name: &str,
    ) -> gamelib_core::process::BoxFuture<Result<(), gamelib_launch::hooks::HookError>> {
        let reply = self.ask(HOOK_OP_FORCE_UNINSTALL, runner, app_name);
        Box::pin(async move { reply.await.map(|_| ()) })
    }

    fn launch_facts(
        &self,
        runner: gamelib_launch::runner::RunnerName,
        app_name: &str,
    ) -> gamelib_core::process::BoxFuture<
        Result<gamelib_launch::hooks::LaunchFacts, gamelib_launch::hooks::HookError>,
    > {
        use gamelib_launch::hooks::HookError;
        let reply = self.ask(HOOK_OP_LAUNCH_FACTS, runner, app_name);
        Box::pin(async move {
            serde_json::from_value(reply.await?).map_err(|_| HookError(HOOK_BAD_REPLY))
        })
    }

    fn launch(
        &self,
        runner: gamelib_launch::runner::RunnerName,
        app_name: &str,
        args: gamelib_launch::hooks::LaunchHookArgs,
    ) -> gamelib_core::process::BoxFuture<
        Result<gamelib_launch::hooks::LaunchHookReply, gamelib_launch::hooks::HookError>,
    > {
        use gamelib_launch::hooks::HookError;
        let reply = self.ask_with(HOOK_OP_LAUNCH, launch_payload(runner, app_name, &args));
        Box::pin(async move {
            serde_json::from_value(reply.await?).map_err(|_| HookError(HOOK_BAD_REPLY))
        })
    }

    fn sync_saves(
        &self,
        runner: gamelib_launch::runner::RunnerName,
        app_name: &str,
        args: gamelib_launch::hooks::SyncSavesArgs,
    ) -> gamelib_core::process::BoxFuture<Result<(), gamelib_launch::hooks::HookError>> {
        use gamelib_launch::hooks::HookError;
        let reply = self.ask_with(
            HOOK_OP_SYNC_SAVES,
            serde_json::json!({
                "runner": runner.as_str(),
                "appName": app_name,
                "direction": args.direction.flag(),
                "savesPath": args.saves_path,
                "gogSaves": args.gog_saves,
            }),
        );
        Box::pin(async move {
            match reply.await? {
                Value::Bool(true) => Ok(()),
                // The TS call threw and its handler wrote the error line.
                Value::Bool(false) => Err(HookError("failed")),
                _ => Err(HookError(HOOK_BAD_REPLY)),
            }
        })
    }

    fn set_presence(
        &self,
        runner: gamelib_launch::runner::RunnerName,
        app_name: &str,
    ) -> gamelib_core::process::BoxFuture<Result<(), gamelib_launch::hooks::HookError>> {
        let reply = self.ask(HOOK_OP_SET_PRESENCE, runner, app_name);
        Box::pin(async move { acknowledged_or_undefined(&reply.await?) })
    }

    fn clear_presence(
        &self,
        runner: gamelib_launch::runner::RunnerName,
    ) -> gamelib_core::process::BoxFuture<Result<(), gamelib_launch::hooks::HookError>> {
        let reply = self.ask_with(
            HOOK_OP_CLEAR_PRESENCE,
            serde_json::json!({ "runner": runner.as_str() }),
        );
        Box::pin(async move { acknowledged_or_undefined(&reply.await?) })
    }

    fn persist_bottle_wine_version(
        &self,
        runner: gamelib_launch::runner::RunnerName,
        app_name: &str,
        wine: Value,
    ) -> gamelib_core::process::BoxFuture<Result<(), gamelib_launch::hooks::HookError>> {
        let reply = self.ask_with(
            HOOK_OP_PERSIST_BOTTLE_WINE_VERSION,
            serde_json::json!({ "runner": runner.as_str(), "appName": app_name, "wine": wine }),
        );
        Box::pin(async move { acknowledged_or_undefined(&reply.await?) })
    }

    fn update_gog_playtime(
        &self,
        app_name: &str,
        start_iso: &str,
        end_iso: &str,
    ) -> gamelib_core::process::BoxFuture<Result<(), gamelib_launch::hooks::HookError>> {
        let reply = self.ask_with(
            HOOK_OP_UPDATE_GOG_PLAYTIME,
            serde_json::json!({ "appName": app_name, "start": start_iso, "end": end_iso }),
        );
        Box::pin(async move { acknowledged(&reply.await?) })
    }

    fn wine_settings_write(
        &self,
        app_name: &str,
        write: gamelib_launch::hooks::WineSettingsWrite,
    ) -> gamelib_core::process::BoxFuture<Result<(), gamelib_launch::hooks::HookError>> {
        let mut payload = serde_json::Map::new();
        payload.insert("appName".into(), Value::String(app_name.to_string()));
        if let Some(global) = write.global {
            payload.insert("global".into(), global);
        }
        if let Some(game) = write.game {
            payload.insert("game".into(), game);
        }
        let reply = self.ask_with(HOOK_OP_WINE_SETTINGS_WRITE, Value::Object(payload));
        Box::pin(async move { acknowledged(&reply.await?) })
    }
}

/// The funnel's window and power work over the shell's own functions (88.3-06, D-26): the main window, the
/// display-sleep wake lock and the CLI exit. Every call runs on the funnel's worker thread, the thread the
/// `rustInvoke` arms already run these functions on. A failed hide or wake lock is a fixed line in `gamelib.log` and
/// never fails the launch (the TS ignored neither failure's cause either); the exit takes the graceful path
/// ([`app_lifecycle::rpc_app_exit`]: the sidecar is told to begin its shutdown, then the app exits through the run
/// loop's exit events, so the one exit budget applies and no wait of its own is added).
struct ShellFunnel {
    app: AppHandle,
}

impl gamelib_launch::funnel::shell::FunnelShell for ShellFunnel {
    fn hide_main_window(&self) {
        if app_lifecycle::rpc_main_window_hide(&self.app).is_err() {
            shell_log("launch funnel: the main window could not be hidden");
        }
    }

    fn wake_lock_start(&self, kind: &str) -> Option<u32> {
        match wake_lock::wake_lock_start(kind) {
            Ok(id) => Some(id),
            Err(_) => {
                shell_log("launch funnel: the display wake lock could not be taken");
                None
            }
        }
    }

    fn wake_lock_stop(&self, id: u32) {
        if wake_lock::wake_lock_stop(id).is_err() {
            shell_log("launch funnel: the display wake lock could not be released");
        }
    }

    fn exit_app(&self) {
        let _ = app_lifecycle::rpc_app_exit(&self.app);
    }
}

/// The hooks the shell's launch context carries: over the sidecar, looked up per call.
fn shell_hooks() -> Arc<dyn gamelib_launch::hooks::ManagerHooks> {
    Arc::new(SidecarManagerHooks::new(Arc::new(sidecar_invoke)))
}

/// The context with the shell's manager hooks over the sidecar ([`install`] calls this; a test calls it over
/// its own context to see what the installed one carries).
fn with_shell_hooks(ctx: LaunchCtx) -> LaunchCtx {
    ctx.with_hooks(shell_hooks())
}

/// The wine manager's shell facts for the prepare steps (88.1-14): the discovery host `getAlternativeWine` runs over
/// ([`wine_dispatch::discovery_host`], with the custom paths scanned), the install settings the global config holds now
/// and the cancel registry the renderer's `abort(version)` reaches, so a default-wine download started by a launch
/// can be cancelled like one the renderer started.
struct ShellWineManager {
    wine: Arc<gamelib_wine::ctx::WineCtx>,
}

impl WineManagerFacts for ShellWineManager {
    fn discovery_host(&self, path: Option<String>) -> Value {
        wine_dispatch::discovery_host(&self.wine, path, Some(true))
    }

    fn install_settings(&self) -> gamelib_wine::manager::install::InstallSettings {
        wine_dispatch::read_install_settings(&self.wine)
    }

    fn register_install(&self, id: &str) -> (gamelib_launch::CancellationToken, Box<dyn Send>) {
        let (cancel, guard) = wine_dispatch::register_install(id);
        (cancel, Box::new(guard))
    }
}

/// Builds the launch context from the engine, known-fix, wine and information contexts and stores it, with the
/// dialog source over the app's native message box and the manager hooks over the sidecar (88.2-18). A no-op when any of the four was not installed (no home
/// directory), so every launch channel answers not ready. A second call is ignored (the first context stays).
pub(crate) fn install(app: &AppHandle) {
    let (Some(engine), Some(knownfix), Some(wine), Some(info)) = (
        engine_dispatch::engine_ctx(),
        knownfix_dispatch::knownfix_ctx(),
        wine_dispatch::wine_ctx(),
        info_dispatch::info_ctx(),
    ) else {
        return;
    };
    let ctx = LaunchCtx::new(
        Arc::clone(engine),
        Arc::clone(knownfix),
        Arc::clone(wine),
        Arc::clone(info),
    )
    .with_dialogs(Arc::new(ShellDialogs { app: app.clone() }))
    .with_manager(Arc::new(ShellWineManager {
        wine: Arc::clone(wine),
    }));
    // 88.2-18 (D-26): the manager hooks the runner's error handler asks (the game's title, forceUninstall).
    // `errors` stays `None`, the production handler (88.2-09), which reads the dialogs and hooks set here.
    let ctx = with_shell_hooks(ctx);
    // 88.3-06 (D-26): the funnel's window, wake lock and CLI exit over the shell's own functions.
    let ctx = ctx.with_shell(Arc::new(ShellFunnel { app: app.clone() }));
    let _ = LAUNCH_CTX.set(Arc::new(ctx));
}

/// Runs `op` over `args` for a `rustInvoke` arm. These arms run on the dispatcher's worker thread, never
/// inside a runtime, so the crate's own `dispatch_sync` drives the op there. `ctx` is the installed context,
/// passed in so a test drives this over its own; before [`install`] the answer is `<op>:not-ready`.
fn rpc_launch_op(
    ctx: Option<&Arc<LaunchCtx>>,
    op: &'static str,
    args: &[Value],
) -> Result<Value, String> {
    let ctx = ctx.ok_or_else(|| format!("{op}:not-ready"))?;
    gamelib_launch::dispatch_sync(op, args, ctx)
}

/// The body of the `launch_setup_wrapper_env_vars` arm over a given context: the generated decode (one
/// object, `{appName, appRunner}`, the runner one of the five names) and an arity check first, so a bad
/// call is rejected the same fixed `<op>:bad-args` literal before and after the install and never echoes the
/// sidecar's value, then the crate, which decodes the object strictly again.
fn setup_wrapper_env_vars_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
) -> Result<Value, String> {
    LaunchSetupWrapperEnvVarsArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_setup_wrapper_env_vars:bad-args".to_string());
    }
    rpc_launch_op(ctx, "launch_setup_wrapper_env_vars", args)
}

/// The `launch_setup_wrapper_env_vars` `rustInvoke` arm (the managers' `setupWrapperEnvVars` shim,
/// 88.1-07): `{appName, appRunner}` to the `HEROIC_APP_NAME`, `HEROIC_APP_RUNNER`, `GAMEID` and per-store
/// variables. A pure computation, so the sidecar keeps it inside the 60 s `RUST_INVOKE_TIMEOUT_MS`.
pub(crate) fn rpc_launch_setup_wrapper_env_vars(args: &[Value]) -> Result<Value, String> {
    setup_wrapper_env_vars_over(launch_ctx(), args)
}

/// A decoded optional text: the string, or `null`. A trailing argument the sidecar left out decodes the same
/// as an explicit `null`, so the crate always sees every position.
fn text_or_null(text: Option<String>) -> Value {
    text.map_or(Value::Null, Value::String)
}

/// The settings object of a decoded call: the generated decode takes any JSON value (`x-rust-value`), so the
/// object check is here, before the context is looked at, and answers the same fixed `<op>:bad-args`.
fn settings_object(settings: Value, op: &str) -> Result<Value, String> {
    match settings {
        Value::Object(_) => Ok(settings),
        _ => Err(format!("{op}:bad-args")),
    }
}

/// The body of the `launch_setup_env_vars` arm over a given context and host: the generated decode
/// (`[gameSettings, installPath | null]`), an object check and an arity check first, so a bad call is rejected
/// the same fixed `<op>:bad-args` literal before and after the install and never echoes the sidecar's value,
/// then the crate over `[settings, installPath, host]`. `host` is the shell's own facts (T-88.1-14), taken only
/// once the context is there.
fn setup_env_vars_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
    host: impl FnOnce() -> Value,
) -> Result<Value, String> {
    let decoded = LaunchSetupEnvVarsArgs::from_args(args)?;
    if args.len() > 2 {
        return Err("launch_setup_env_vars:bad-args".to_string());
    }
    let settings = settings_object(decoded.game_settings, "launch_setup_env_vars")?;
    let ctx = ctx.ok_or_else(|| "launch_setup_env_vars:not-ready".to_string())?;
    rpc_launch_op(
        Some(ctx),
        "launch_setup_env_vars",
        &[settings, text_or_null(decoded.install_path), host()],
    )
}

/// The `launch_setup_env_vars` `rustInvoke` arm (the managers' `setupEnvVars` shim, 88.1-07): the game's GPU
/// offload, HUD, install path and own variables as a string map. The shell appends [`wine_dispatch::wine_run_host`].
/// A pure computation, so the sidecar keeps it inside the 60 s `RUST_INVOKE_TIMEOUT_MS`.
pub(crate) fn rpc_launch_setup_env_vars(args: &[Value]) -> Result<Value, String> {
    setup_env_vars_over(launch_ctx(), args, wine_dispatch::wine_run_host)
}

/// The body of the `launch_setup_wine_env_vars` arm over a given context and host: the same decode, object and
/// arity checks as [`setup_env_vars_over`] over `[gameSettings, gameId | null]`, then the crate over
/// `[settings, gameId, host]`.
fn setup_wine_env_vars_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
    host: impl FnOnce() -> Value,
) -> Result<Value, String> {
    let decoded = LaunchSetupWineEnvVarsArgs::from_args(args)?;
    if args.len() > 2 {
        return Err("launch_setup_wine_env_vars:bad-args".to_string());
    }
    let settings = settings_object(decoded.game_settings, "launch_setup_wine_env_vars")?;
    let ctx = ctx.ok_or_else(|| "launch_setup_wine_env_vars:not-ready".to_string())?;
    rpc_launch_op(
        Some(ctx),
        "launch_setup_wine_env_vars",
        &[settings, text_or_null(decoded.game_id), host()],
    )
}

/// The `launch_setup_wine_env_vars` `rustInvoke` arm (the wine env shim, wired with its callers in 88.1-08): the
/// wine environment of a game as a string map, the library folders read from disk. The shell appends
/// [`wine_dispatch::wine_run_host`]; the sidecar keeps it inside the 60 s `RUST_INVOKE_TIMEOUT_MS`.
pub(crate) fn rpc_launch_setup_wine_env_vars(args: &[Value]) -> Result<Value, String> {
    setup_wine_env_vars_over(launch_ctx(), args, wine_dispatch::wine_run_host)
}

/// The words of a decoded optional list: the array of strings, or `null`.
fn words_or_null(words: Option<Vec<String>>) -> Value {
    words.map_or(Value::Null, |words| {
        Value::Array(words.into_iter().map(Value::String).collect())
    })
}

/// The body of the `launch_setup_wrappers` arm over a given context: the generated decode
/// (`[gameSettings, mangoHudCommand | null, gameModeBin | null, gameScopeCommand | null]`), an object check and an
/// arity check first, then the crate over all four positions (an absent trailing one is `null`; an empty list
/// stays an empty list, which the gamescope rule tells from `null`). An unterminated quote in a wrapper option is
/// the crate's `<op>:<message>`, a fixed literal.
fn setup_wrappers_over(ctx: Option<&Arc<LaunchCtx>>, args: &[Value]) -> Result<Value, String> {
    let decoded = LaunchSetupWrappersArgs::from_args(args)?;
    if args.len() > 4 {
        return Err("launch_setup_wrappers:bad-args".to_string());
    }
    let settings = settings_object(decoded.game_settings, "launch_setup_wrappers")?;
    rpc_launch_op(
        ctx,
        "launch_setup_wrappers",
        &[
            settings,
            words_or_null(decoded.mango_hud_command),
            text_or_null(decoded.game_mode_bin),
            words_or_null(decoded.game_scope_command),
        ],
    )
}

/// The `launch_setup_wrappers` `rustInvoke` arm (the managers' `setupWrappers` shim, 88.1-07): the wrapper words
/// in order, gamescope first. A pure computation, so the sidecar keeps it inside the 60 s `RUST_INVOKE_TIMEOUT_MS`.
pub(crate) fn rpc_launch_setup_wrappers(args: &[Value]) -> Result<Value, String> {
    setup_wrappers_over(launch_ctx(), args)
}

/// The body of the `launch_known_fix_env` arm over a given context: the generated decode (`[appName, runner]`, the
/// runner one of the five names) and an arity check first, then the crate, which bounds the app name (1 to 256
/// UTF-16 units) and decodes the runner again.
fn known_fix_env_over(ctx: Option<&Arc<LaunchCtx>>, args: &[Value]) -> Result<Value, String> {
    LaunchKnownFixEnvArgs::from_args(args)?;
    if args.len() != 2 {
        return Err("launch_known_fix_env:bad-args".to_string());
    }
    rpc_launch_op(ctx, "launch_known_fix_env", args)
}

/// The `launch_known_fix_env` `rustInvoke` arm (the managers' `getKnownFixesEnvVariables` shim, 88.1-07): the
/// game's tier-1 `envVariables` as the file holds them, `{}` when there is none. A disk read, so the sidecar keeps
/// it inside the 60 s `RUST_INVOKE_TIMEOUT_MS`.
pub(crate) fn rpc_launch_known_fix_env(args: &[Value]) -> Result<Value, String> {
    known_fix_env_over(launch_ctx(), args)
}

/// The body of the `launch_verify_wine_prefix` arm over a given context and host: the generated decode
/// (`[gameSettings]`), an object check and an arity check first, so a bad call is rejected the same fixed
/// `<op>:bad-args` literal before and after the install and never echoes the sidecar's value, then the crate over
/// `[settings, host]`. `host` is the shell's own facts (T-88.1-14), taken only once the context is there.
fn verify_wine_prefix_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
    host: impl FnOnce() -> Value,
) -> Result<Value, String> {
    let decoded = LaunchVerifyWinePrefixArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_verify_wine_prefix:bad-args".to_string());
    }
    let settings = settings_object(decoded.game_settings, "launch_verify_wine_prefix")?;
    let ctx = ctx.ok_or_else(|| "launch_verify_wine_prefix:not-ready".to_string())?;
    rpc_launch_op(Some(ctx), "launch_verify_wine_prefix", &[settings, host()])
}

/// The `launch_verify_wine_prefix` `rustInvoke` arm (the managers' and the save sync's `verifyWinePrefix` shim,
/// 88.1-08): creates a game's wine prefix when it is missing, as a `wineboot --init` or umu's `createprefix` run
/// through the wine command core (a Helper spawn), and answers `{ res: { stdout, stderr } }`. The shell appends
/// [`wine_dispatch::wine_run_host`]. It waits on the wineboot of a cold prefix, so the sidecar lists the channel as
/// unbounded (`UNBOUNDED_RUST_CHANNELS`); the crate's `guarded` registrant and the shutdown token end it at exit.
pub(crate) fn rpc_launch_verify_wine_prefix(args: &[Value]) -> Result<Value, String> {
    verify_wine_prefix_over(launch_ctx(), args, wine_dispatch::wine_run_host)
}

/// The body of the `launch_epic_service_offline` arm over a given context: the generated decode (`[service?]`, one
/// of the three service names) and an arity check first, so a bad call is rejected the same fixed `<op>:bad-args`
/// literal before and after the install and never echoes the sidecar's value, then the crate over exactly one
/// argument (an absent service is `null`, the default `Epic Games Store`).
fn epic_service_offline_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
) -> Result<Value, String> {
    let decoded = LaunchEpicServiceOfflineArgs::from_args(args)?;
    if args.len() > 1 {
        return Err("launch_epic_service_offline:bad-args".to_string());
    }
    let service = match decoded.service {
        None => Value::Null,
        Some(LaunchEpicServiceOfflineArgsService::EpicGamesStore) => {
            Value::String("Epic Games Store".to_string())
        }
        Some(LaunchEpicServiceOfflineArgsService::Fortnite) => {
            Value::String("Fortnite".to_string())
        }
        Some(LaunchEpicServiceOfflineArgsService::RocketLeague) => {
            Value::String("Rocket League".to_string())
        }
    };
    rpc_launch_op(ctx, "launch_epic_service_offline", &[service])
}

/// The `launch_epic_service_offline` `rustInvoke` arm (88.1-11, D-19): whether the Epic status page says a service
/// is down (`isEpicServiceOffline`). One JSON GET through the engine fetch seam, nothing when the app is not online
/// (which answers `true`); the offline notification and the log lines are Rust's. A single bounded request, so the
/// sidecar keeps it inside the 60 s `RUST_INVOKE_TIMEOUT_MS`.
pub(crate) fn rpc_launch_epic_service_offline(args: &[Value]) -> Result<Value, String> {
    epic_service_offline_over(launch_ctx(), args)
}

/// The process facts the prepare step reads that are not the wine host's: `isSteamDeckGameMode`, `isSteamDeck`,
/// `isFlatpak` and `flatpakRuntimeVersion` of `constants/environment.ts`. `env` reads one variable and `manifest`
/// the Flatpak manifest (`/app/manifest.json`), so a test can drive both; `wine` is [`wine_dispatch::wine_run_host`].
fn prepare_host_over(
    env: &dyn Fn(&str) -> Option<String>,
    manifest: &dyn Fn() -> Option<String>,
    wine: Value,
) -> Value {
    let has = |key: &str, test: &dyn Fn(&str) -> bool| env(key).is_some_and(|value| test(&value));
    let game_mode = has("XDG_CURRENT_DESKTOP", &|v| v == "gamescope");
    let desktop = has("SESSION_MANAGER", &|v| v.contains("unix/steamdeck"))
        && has("HOME", &|v| v == "/home/deck")
        && has("DESKTOP_SESSION", &|v| v.contains("steamos"));
    let flatpak = has("FLATPAK_ID", &|v| !v.is_empty());
    // The runtime version the Flatpak manifest names, `unknown` when it cannot be read, and empty off Flatpak.
    let runtime = if flatpak {
        manifest()
            .and_then(|text| serde_json::from_str::<Value>(&text).ok())
            .and_then(|manifest| manifest["runtime-version"].as_str().map(str::to_string))
            .unwrap_or_else(|| "unknown".to_string())
    } else {
        String::new()
    };
    serde_json::json!({
        "wine": wine,
        "steamDeckGameMode": game_mode,
        "steamDeck": game_mode || desktop,
        "flatpak": flatpak,
        "flatpakRuntimeVersion": runtime,
    })
}

/// [`prepare_host_over`] over this process: its environment and the Flatpak manifest, built by the shell and never
/// taken from the sidecar (T-88.1-26).
fn prepare_host() -> Value {
    prepare_host_over(
        &|key| std::env::var(key).ok(),
        &|| std::fs::read_to_string("/app/manifest.json").ok(),
        wine_dispatch::wine_run_host(),
    )
}

/// The body of the `launch_prepare` arm over a given context and host: the generated decode (one object of the
/// facts only the TS has), an object check on the settings and an arity check first, so a bad call is rejected the
/// same fixed `<op>:bad-args` literal before and after the install and never echoes the sidecar's value, then the
/// crate over `[args, host]` (which decodes strictly again). `host` is the shell's own facts (T-88.1-26), taken only
/// once the context is there.
fn prepare_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
    host: impl FnOnce() -> Value,
) -> Result<Value, String> {
    let decoded = LaunchPrepareArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_prepare:bad-args".to_string());
    }
    settings_object(decoded.settings, "launch_prepare")?;
    let ctx = ctx.ok_or_else(|| "launch_prepare:not-ready".to_string())?;
    rpc_launch_op(Some(ctx), "launch_prepare", &[args[0].clone(), host()])
}

/// The `launch_prepare` `rustInvoke` arm (88.1-11, D-19, D-30): the prepare step of a launch (`prepareLaunch`).
/// It decides offline mode, finds the Linux wrappers, may fetch the umu runtime, and answers the TS reply plus
/// `log`, the per-game log lines the TS `LogWriter` writes (the only writer until 88.3). The shell appends the
/// process facts ([`prepare_host`]). The umu download can outlast the sidecar's 60 s `RUST_INVOKE_TIMEOUT_MS`, so
/// the shim that calls it (88.1-15) lists the channel as unbounded; the crate's `guarded` registrant and the
/// shutdown token end it at exit.
pub(crate) fn rpc_launch_prepare(args: &[Value]) -> Result<Value, String> {
    prepare_over(launch_ctx(), args, prepare_host)
}

/// The body of the `launch_prepare_wine_begin` arm over a given context and host: the generated decode (one object
/// of the facts only the TS has), an object check on the stored settings and an arity check first, so a bad call is
/// rejected the same fixed `<op>:bad-args` literal before and after the install and never echoes the sidecar's
/// value, then the crate over `[args, host]` (which decodes strictly again). `host` is the shell's own facts
/// (T-88.1-14), taken only once the context is there.
fn prepare_wine_begin_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
    host: impl FnOnce() -> Value,
) -> Result<Value, String> {
    let decoded = LaunchPrepareWineBeginArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_prepare_wine_begin:bad-args".to_string());
    }
    settings_object(decoded.stored_settings, "launch_prepare_wine_begin")?;
    let ctx = ctx.ok_or_else(|| "launch_prepare_wine_begin:not-ready".to_string())?;
    rpc_launch_op(
        Some(ctx),
        "launch_prepare_wine_begin",
        &[args[0].clone(), host()],
    )
}

/// The `launch_prepare_wine_begin` `rustInvoke` arm (88.1-12, D-19, D-26, D-30): the first half of
/// `prepareWineLaunch`, up to the store-setup point. It checks the wines, the CrossOver bottle, creates the wine
/// prefix when it is missing and records the game in its `installed_games`, and answers the reply, the launch
/// settings the finish step is handed and the per-game log lines the TS `LogWriter` writes. The TS store-setup hook
/// stays TS and runs between this arm and the finish arm (88.1-13) in the launcher adapter (88.1-15). The shell
/// appends [`wine_dispatch::wine_run_host`]. A `wineboot` can outlast the sidecar's 60 s `RUST_INVOKE_TIMEOUT_MS`,
/// so the shim that calls it (88.1-15) lists the channel as unbounded; the wine core's Helper spawn and the shutdown
/// token end it at exit (T-88.1-30).
pub(crate) fn rpc_launch_prepare_wine_begin(args: &[Value]) -> Result<Value, String> {
    prepare_wine_begin_over(launch_ctx(), args, wine_dispatch::wine_run_host)
}

/// The body of the `launch_prepare_wine_finish` arm over a given context and host: the generated decode (one object
/// of the facts only the TS has), an object check on the two settings and an arity check first, so a bad call is
/// rejected the same fixed `<op>:bad-args` literal before and after the install and never echoes the sidecar's
/// value, then the crate over `[args, host]` (which decodes strictly again). `host` is the shell's own tool facts
/// (T-88.1-14), taken only once the context is there.
fn prepare_wine_finish_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
    host: impl FnOnce() -> Value,
) -> Result<Value, String> {
    let decoded = LaunchPrepareWineFinishArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_prepare_wine_finish:bad-args".to_string());
    }
    settings_object(decoded.settings, "launch_prepare_wine_finish")?;
    settings_object(decoded.stored_settings, "launch_prepare_wine_finish")?;
    let ctx = ctx.ok_or_else(|| "launch_prepare_wine_finish:not-ready".to_string())?;
    rpc_launch_op(
        Some(ctx),
        "launch_prepare_wine_finish",
        &[args[0].clone(), host()],
    )
}

/// The `launch_prepare_wine_finish` `rustInvoke` arm (88.1-13, D-19, D-26, D-30): the second half of
/// `prepareWineLaunch`, from the store-setup point to the returned env. It installs the known fix's winetricks
/// verbs and programs when this launch added the game to its prefix, applies the tier-2 registry, resolves the
/// overlay env, puts the GOG dummy service and the DXVK family in the prefix, downloads the EAC and BattlEye
/// runtimes, builds the wine env and arms the launch deadline, and answers `{ success, envVars, knownFixEnv, log }`.
/// The shell appends [`wine_dispatch::tools_host_value`] (the wine host facts, the bundled `public` directory and the
/// online monitor's answer). A winetricks verb, a DXVK download, a runtime or an overlay can outlast the sidecar's
/// 60 s `RUST_INVOKE_TIMEOUT_MS`, so the shim that calls it (88.1-15) lists the channel as unbounded; the wine
/// core's Helper spawns and the shutdown token end it at exit (T-88.1-30).
pub(crate) fn rpc_launch_prepare_wine_finish(args: &[Value]) -> Result<Value, String> {
    prepare_wine_finish_over(launch_ctx(), args, wine_dispatch::tools_host_value)
}

/// The body of the `launch_check_wine_before_launch` arm over a given context and host: the generated decode (one
/// object of the facts only the TS has), an object check on the game's wine and an arity check first, so a bad call
/// is rejected the same fixed `<op>:bad-args` literal before and after the install and never echoes the sidecar's
/// value, then the crate over `[args, host]` (which decodes strictly again). `host` is the shell's own facts
/// (T-88.1-14), taken only once the context is there.
fn check_wine_before_launch_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
    host: impl FnOnce() -> Value,
) -> Result<Value, String> {
    let decoded = LaunchCheckWineBeforeLaunchArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_check_wine_before_launch:bad-args".to_string());
    }
    settings_object(decoded.wine_version, "launch_check_wine_before_launch")?;
    let ctx = ctx.ok_or_else(|| "launch_check_wine_before_launch:not-ready".to_string())?;
    rpc_launch_op(
        Some(ctx),
        "launch_check_wine_before_launch",
        &[args[0].clone(), host()],
    )
}

/// The `launch_check_wine_before_launch` `rustInvoke` arm (88.1-14, D-28, D-19, D-30): `checkWineBeforeLaunch`, the
/// wine self-heal before a launch. It checks the game's wine, then the default wine (asking the user through
/// [`ShellDialogs`] whether to continue with it), then the wines installed here, and downloads the default wine for the
/// OS when none works. It answers `{ ok, wineVersion?, persistGameWine, globalWineVersion?, log }`: the writes are data
/// for the TS adapter to apply, Rust writes no config (Pitfall 7). The shell appends
/// [`wine_dispatch::wine_run_host`]. A question waits for the user and a download can take minutes, both past the
/// sidecar's 60 s `RUST_INVOKE_TIMEOUT_MS`, so the shim that calls it (88.1-16) lists the channel as unbounded; the
/// crate's `guarded` registrant and the shutdown token end it at exit.
pub(crate) fn rpc_launch_check_wine_before_launch(args: &[Value]) -> Result<Value, String> {
    check_wine_before_launch_over(launch_ctx(), args, wine_dispatch::wine_run_host)
}

/// What the shell knows of its own process that a runner call needs and the sidecar must not send (T-88.1-14): the
/// environment the child inherits as a map (a variable that is not UTF-8 is left out, as the crate's snapshot holds
/// text) and the `PATH` the PowerShell probe searches (empty when it is unset or not UTF-8). The sidecar is this
/// shell's child, so its environment is this one's. `vars` and `path` are what this process reads, so a test can
/// drive both.
fn runner_host_over(
    vars: impl Iterator<Item = (std::ffi::OsString, std::ffi::OsString)>,
    path: Option<std::ffi::OsString>,
) -> Value {
    let env: serde_json::Map<String, Value> = vars
        .filter_map(|(key, value)| {
            Some((
                key.into_string().ok()?,
                Value::String(value.into_string().ok()?),
            ))
        })
        .collect();
    serde_json::json!({
        "env": env,
        "path": path.and_then(|path| path.into_string().ok()).unwrap_or_default(),
    })
}

/// [`runner_host_over`] over this process: its environment and its `PATH` (`var_os` finds `Path` on Windows).
fn runner_host() -> Value {
    runner_host_over(std::env::vars_os(), std::env::var_os("PATH"))
}

/// The body of the `launch_runner_call` arm over a given context and host: the generated decode (one object, the
/// runner one of the five names) and an arity check first, so a bad call is rejected the same fixed `<op>:bad-args`
/// literal before and after the install and never echoes the sidecar's value, then the crate over `[call, host]`,
/// which decodes the object strictly again. `host` is the shell's own facts (T-88.1-14), taken only once the context
/// is there.
fn runner_call_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
    host: impl FnOnce() -> Value,
) -> Result<Value, String> {
    LaunchRunnerCallArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_runner_call:bad-args".to_string());
    }
    let ctx = ctx.ok_or_else(|| "launch_runner_call:not-ready".to_string())?;
    rpc_launch_op(Some(ctx), "launch_runner_call", &[args[0].clone(), host()])
}

/// The `launch_runner_call` `rustInvoke` arm (88.2-15, D-02, D-19): a runner command, helper class, run to its end and
/// answered as the TS `ExecResult`. The call runs here, on the dispatcher's worker thread for this one request (every
/// `rustInvoke` runs on its own spawned thread, so a long run never holds the reader or another call), and a call
/// that observes the stream writes its `runnerOutput` and `runnerSpawned` frames to the sidecar's stdin from that
/// thread before this arm returns, so they reach the sidecar ahead of the reply on the one ordered pipe. The shell
/// appends [`runner_host`]. A runner command runs as long as an install or a game, so the sidecar lists the channel as
/// unbounded (`UNBOUNDED_RUST_CHANNELS`); the abort id, `launch_runner_kill`, the crate's `guarded` registrant and the
/// shutdown token end it.
pub(crate) fn rpc_launch_runner_call(args: &[Value]) -> Result<Value, String> {
    runner_call_over(launch_ctx(), args, runner_host)
}

/// The host facts of a funnel run (T-88.1-14): the runner host (the environment the scripts inherit and the `PATH`)
/// and the wine host (the environment and the Darwin release), both read from this process, never from the sidecar.
fn funnel_host() -> Value {
    serde_json::json!({ "runner": runner_host(), "wine": wine_dispatch::wine_run_host() })
}

/// The body of the `launch_run` arm over a given context and host: the generated decode (one object, the runner
/// one of the five names) and an arity check first, so a bad call is rejected the same fixed `<op>:bad-args` literal
/// before and after the install and never echoes the sidecar's value, then the crate over `[params, host]`, which
/// decodes the object strictly again. `host` is the shell's own facts, taken only once the context is there.
fn launch_run_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
    host: impl FnOnce() -> Value,
) -> Result<Value, String> {
    LaunchRunArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_run:bad-args".to_string());
    }
    let ctx = ctx.ok_or_else(|| "launch_run:not-ready".to_string())?;
    rpc_launch_op(Some(ctx), "launch_run", &[args[0].clone(), host()])
}

/// The `launch_run` `rustInvoke` arm (88.3-06, D-01, D-19): one Play through the Rust launch funnel, answering
/// `{ status }` when the game's process is over. The funnel runs here, on the dispatcher's worker thread for this one
/// request (every `rustInvoke` runs on its own spawned thread), and reaches the TS managers over `launchManagerCall`
/// and the window and the wake lock through [`ShellFunnel`]. A launch spans a whole play session, so the sidecar lists
/// the channel as unbounded (`UNBOUNDED_RUST_CHANNELS`); the funnel's registrant and the app shutdown end it. There is
/// no sidecar fallback: before [`install`] the answer is `launch_run:not-ready`.
pub(crate) fn rpc_launch_run(args: &[Value]) -> Result<Value, String> {
    launch_run_over(launch_ctx(), args, funnel_host)
}

/// The body of the `launch_flight_begin` arm over a given context: the generated decode (`[{ runner, appName }]`) and an arity
/// check first, so a bad call is rejected the same fixed `<op>:bad-args` literal before and after the install and never echoes the
/// sidecar's value, then the crate, which decodes the object strictly again, bounds both names and decides lead or join under the
/// flight table's one lock.
fn flight_begin_over(ctx: Option<&Arc<LaunchCtx>>, args: &[Value]) -> Result<Value, String> {
    LaunchFlightBeginArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_flight_begin:bad-args".to_string());
    }
    rpc_launch_op(ctx, "launch_flight_begin", args)
}

/// The `launch_flight_begin` `rustInvoke` arm (88.3-11, D-04, D-19): a leader outside the Rust funnel (the TS Steam dispatch until
/// 90.2) asks to lead `<runner>:<appName>` in the one single-flight table. It answers `{ lead: <flightId> }` or `{ join: true }`. A
/// lookup under one lock, so the sidecar keeps it inside the 60 s `RUST_INVOKE_TIMEOUT_MS`. There is no sidecar fallback: before
/// [`install`] the answer is `launch_flight_begin:not-ready`.
pub(crate) fn rpc_launch_flight_begin(args: &[Value]) -> Result<Value, String> {
    flight_begin_over(launch_ctx(), args)
}

/// The body of the `launch_flight_wait` arm over a given context: the generated decode and an arity check first (the fixed
/// `<op>:bad-args` literal), then the crate, which waits for the leader of the key on the context's shutdown token (the shell's own).
fn flight_wait_over(ctx: Option<&Arc<LaunchCtx>>, args: &[Value]) -> Result<Value, String> {
    LaunchFlightWaitArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_flight_wait:bad-args".to_string());
    }
    rpc_launch_op(ctx, "launch_flight_wait", args)
}

/// The `launch_flight_wait` `rustInvoke` arm (88.3-11, D-04, D-19): the joiner half. It waits for the leader of the key, a Rust
/// funnel launch or a sidecar leader, and answers the leader's settled value, or the word `abandoned` when the leader ended without
/// one or was released at sidecar EOF. It waits on the dispatcher's worker thread for this one request (never the reply thread)
/// for the whole dispatch of the leader, so the sidecar lists the channel as unbounded (`UNBOUNDED_RUST_CHANNELS`); the crate's
/// `guarded` registrant, the leader's settle, [`release_sidecar_flights`] and the shutdown token end it.
pub(crate) fn rpc_launch_flight_wait(args: &[Value]) -> Result<Value, String> {
    flight_wait_over(launch_ctx(), args)
}

/// The body of the `launch_flight_end` arm over a given context: the generated decode (`[{ flightId, result }]`) and an arity check
/// first (the fixed `<op>:bad-args` literal), then the crate, which refuses a flight id of the wrong shape and releases nothing for
/// one it did not mint.
fn flight_end_over(ctx: Option<&Arc<LaunchCtx>>, args: &[Value]) -> Result<Value, String> {
    LaunchFlightEndArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_flight_end:bad-args".to_string());
    }
    rpc_launch_op(ctx, "launch_flight_end", args)
}

/// The `launch_flight_end` `rustInvoke` arm (88.3-11, D-04, D-19): the leader settles the flight its id names; every joiner receives
/// `result` and the key is free again. Answers whether the id was held (`false` for a forged, stale or released one, which releases
/// nothing). A lookup under one lock, so the sidecar keeps it inside the 60 s `RUST_INVOKE_TIMEOUT_MS`.
pub(crate) fn rpc_launch_flight_end(args: &[Value]) -> Result<Value, String> {
    flight_end_over(launch_ctx(), args)
}

/// [`release_sidecar_flights`] over a given context. Answers how many flights it released; the flight ids and keys are never logged,
/// only the count.
fn release_sidecar_flights_over(ctx: Option<&Arc<LaunchCtx>>) -> usize {
    let released = ctx.map_or(0, |ctx| ctx.flights.release_owned_by_sidecar());
    if released > 0 {
        shell_log(&format!(
            "released {released} launch flight(s) led from the sidecar"
        ));
    }
    released
}

/// Releases every launch flight a leader in the sidecar holds (88.3-11, Pitfall 8, T-88.3-26). The sidecar-EOF path calls it next
/// to `drain_pending_invokes`: a leader that is gone can never end its flight, so each key is given back and each joiner answers
/// `abandoned` instead of waiting for ever. A flight the Rust funnel leads is not touched. A no-op before [`install`].
pub(crate) fn release_sidecar_flights() {
    release_sidecar_flights_over(launch_ctx());
}

/// The boot scan over a given context and host (88.3-12, D-08, D-10): re-adopts the games a crashed GameLib left running and
/// writes the one fixed line that reports the counts (adopted, removed, owed scripts, skipped), never an app name, a path or a
/// pid list. The scan is bounded by `READOPT_BOOT_BOUND` and `READOPT_RECORD_CAP` in the crate.
fn readopt_over(ctx: &LaunchCtx, host: &gamelib_launch::runner::call_runner::RunnerHost) {
    let report = gamelib_launch::game::readopt::start_with_host(ctx, host);
    shell_log(&format!(
        "launch re-adoption: {} adopted, {} removed, {} owed scripts, {} skipped",
        report.adopted, report.removed, report.owed_scripts, report.skipped
    ));
}

/// Starts re-adoption once per boot (88.3-12, D-08, D-10), right after [`install`]: the store host is open and the one
/// context exists. The scan runs on its own named thread (`launch-readopt`), so setup never waits for it; it is synchronous
/// and bounded in the crate, and everything it leaves waiting (an exit watch, an owed script) is a task holding a shutdown
/// registrant. A no-op when the context was not installed (no home directory). An after-script a re-adopted game owes runs over
/// the shell's own environment, as a launch's does.
pub(crate) fn start_readoption() {
    let Some(ctx) = launch_ctx() else {
        return;
    };
    let ctx = Arc::clone(ctx);
    let started = std::thread::Builder::new()
        .name("launch-readopt".to_string())
        .spawn(move || {
            let host = serde_json::from_value(runner_host()).unwrap_or_default();
            readopt_over(&ctx, &host);
        });
    if started.is_err() {
        shell_log("launch re-adoption: the scan thread could not be started");
    }
}

/// The body of the `launch_readopted_announce` arm over a given context: the generated decode (no argument) and an arity check
/// first, so a bad call is rejected the same fixed `<op>:bad-args` literal before and after the install and never echoes the
/// sidecar's value, then the crate's announcement.
fn readopted_announce_over(ctx: Option<&Arc<LaunchCtx>>, args: &[Value]) -> Result<Value, String> {
    LaunchReadoptedAnnounceArgs::from_args(args)?;
    if !args.is_empty() {
        return Err("launch_readopted_announce:bad-args".to_string());
    }
    rpc_launch_op(ctx, "launch_readopted_announce", args)
}

/// The `launch_readopted_announce` `rustInvoke` arm (88.3-12, D-19, Pitfall 9): the sidecar sends it on every `frontendReady`.
/// It re-sends `gameStatusUpdate { status: 'playing' }` for each game the boot scan adopted, marks the context so a game adopted
/// later announces itself, and answers how many it announced. It takes no argument, so it only re-sends the status of entries
/// the registry already proved. A registry read and a few pushes, so the sidecar keeps it inside the 60 s
/// `RUST_INVOKE_TIMEOUT_MS`; before [`install`] the answer is `launch_readopted_announce:not-ready`.
pub(crate) fn rpc_launch_readopted_announce(args: &[Value]) -> Result<Value, String> {
    readopted_announce_over(launch_ctx(), args)
}

/// The body of the `launch_runner_kill` arm over a given context: the generated decode (`[streamId]`) and an arity
/// check first, then the crate, which bounds the id (a name with no path separator or control character) and ends the
/// run of the call that watches that stream. The crate answers how many runs it ended; the sidecar is told whether one
/// answered, so the answer is a boolean (`false` for an id no run holds, a run that has already ended included).
fn runner_kill_over(ctx: Option<&Arc<LaunchCtx>>, args: &[Value]) -> Result<Value, String> {
    LaunchRunnerKillArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_runner_kill:bad-args".to_string());
    }
    let ended = rpc_launch_op(ctx, "launch_runner_kill", args)?;
    Ok(Value::Bool(ended.as_u64().is_some_and(|count| count > 0)))
}

/// The `launch_runner_kill` `rustInvoke` arm (88.2-15, D-02, D-19): ends the run of the call that watches the stream the
/// caller opened (the spawned handle's `kill()` and spawnAsync's abort send it). A lookup and a signal, so the sidecar
/// keeps it inside the 60 s `RUST_INVOKE_TIMEOUT_MS`; the crate does not cut it short at shutdown, because the quit-kill
/// runs while the shutdown token may already be cancelled. A kill never reaches another run: it ends only what answers to
/// the id the caller named.
pub(crate) fn rpc_launch_runner_kill(args: &[Value]) -> Result<Value, String> {
    runner_kill_over(launch_ctx(), args)
}

/// The body of the `launch_runner_abort` arm over a given context: the generated decode (`[abortId]`) and an arity check
/// first, then the crate, which bounds the id and answers whether a run answered to it.
fn runner_abort_over(ctx: Option<&Arc<LaunchCtx>>, args: &[Value]) -> Result<Value, String> {
    LaunchRunnerAbortArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_runner_abort:bad-args".to_string());
    }
    rpc_launch_op(ctx, "launch_runner_abort", args)
}

/// The `launch_runner_abort` `rustInvoke` arm (88.2-15, D-02, D-19): `abortController.abort()` for a run of either class,
/// by the abort id the call was given (the download manager's cancel sends it). The run then answers its call `{ abort:
/// true }`. A lookup and a signal, so the sidecar keeps it inside the 60 s `RUST_INVOKE_TIMEOUT_MS`.
pub(crate) fn rpc_launch_runner_abort(args: &[Value]) -> Result<Value, String> {
    runner_abort_over(launch_ctx(), args)
}

/// The body of the `launch_wine_command` arm over a given context and host: the generated decode (one object; a
/// `gameSettings` that is present must be an object) and an arity check first, so a bad call is rejected the same fixed
/// `<op>:bad-args` literal before and after the install and never echoes the sidecar's value, then the crate over
/// `[call, host]`, which decodes the object strictly again. `host` is the shell's own wine facts (T-88.1-14), taken only
/// once the context is there.
fn wine_command_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
    host: impl FnOnce() -> Value,
) -> Result<Value, String> {
    let decoded = LaunchWineCommandArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_wine_command:bad-args".to_string());
    }
    if let Some(settings) = decoded.game_settings {
        settings_object(settings, "launch_wine_command")?;
    }
    let ctx = ctx.ok_or_else(|| "launch_wine_command:not-ready".to_string())?;
    rpc_launch_op(Some(ctx), "launch_wine_command", &[args[0].clone(), host()])
}

/// The `launch_wine_command` `rustInvoke` arm (88.2-17, D-02, D-19): `runWineCommand`, one wine command for a game or an
/// installer, answered `{ stdout, stderr, code? }`. It runs on the dispatcher's worker thread for this one request (every
/// `rustInvoke` runs on its own spawned thread, so a run that lasts as long as a game holds neither the reader nor another
/// call), and a call that observes the stream writes its `runnerOutput` and `runnerSpawned` frames from that thread before
/// the arm returns, so they precede the reply on the one ordered stdin pipe. The shell appends
/// [`wine_dispatch::wine_run_host`]. A wine command runs as long as the game or installer it hosts, so the sidecar lists the
/// channel as unbounded (`UNBOUNDED_RUST_CHANNELS`); a tracked kill, the crate's `guarded` registrant and the shutdown token
/// end it.
pub(crate) fn rpc_launch_wine_command(args: &[Value]) -> Result<Value, String> {
    wine_command_over(launch_ctx(), args, wine_dispatch::wine_run_host)
}

/// The body of the `launch_wine_path` arm over a given context and host: the generated decode (`{ path, gameSettings,
/// variant? }`, the settings an object) and an arity check first, then the crate over `[call, host]`.
fn wine_path_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
    host: impl FnOnce() -> Value,
) -> Result<Value, String> {
    let decoded = LaunchWinePathArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_wine_path:bad-args".to_string());
    }
    settings_object(decoded.game_settings, "launch_wine_path")?;
    let ctx = ctx.ok_or_else(|| "launch_wine_path:not-ready".to_string())?;
    rpc_launch_op(Some(ctx), "launch_wine_path", &[args[0].clone(), host()])
}

/// The `launch_wine_path` `rustInvoke` arm (88.2-17, D-02, D-19): `getWinePath`, a path translated by `winepath` inside the
/// game's prefix through the wine command core, answered as text (`""` when `winepath` printed nothing). The shell appends
/// [`wine_dispatch::wine_run_host`]. It runs a wine command, which can outlast the sidecar's 60 s `RUST_INVOKE_TIMEOUT_MS`
/// on a cold prefix, so the channel is unbounded.
pub(crate) fn rpc_launch_wine_path(args: &[Value]) -> Result<Value, String> {
    wine_path_over(launch_ctx(), args, wine_dispatch::wine_run_host)
}

/// The body of the `launch_script_run` arm over a given context and host: the generated decode (one object) and an arity
/// check first, then the crate over `[call, host]`, which decodes the object strictly again. `host` is the shell's own
/// facts ([`runner_host`]), taken only once the context is there. A script that could not be started is the crate's `Err`
/// text, which passes through as the dispatch error.
fn script_run_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
    host: impl FnOnce() -> Value,
) -> Result<Value, String> {
    LaunchScriptRunArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_script_run:bad-args".to_string());
    }
    let ctx = ctx.ok_or_else(|| "launch_script_run:not-ready".to_string())?;
    rpc_launch_op(Some(ctx), "launch_script_run", &[args[0].clone(), host()])
}

/// The `launch_script_run` `rustInvoke` arm (88.2-17, D-02, D-19): `runScriptForGame`, a game's before or after launch
/// script, run as a Helper and answered `true` once it has exited (whatever its code). The shell appends [`runner_host`]:
/// the environment the script inherits, laid over the `HEROIC_GAME_*` block. A script runs as long as the user wrote it
/// to, so the sidecar lists the channel as unbounded; the crate's `guarded` registrant and the shutdown token end it.
pub(crate) fn rpc_launch_script_run(args: &[Value]) -> Result<Value, String> {
    script_run_over(launch_ctx(), args, runner_host)
}

/// The body of the `launch_spawn_async` arm over a given context: the generated decode (`[args]` only, one object) and an
/// arity check first, so a bad call is rejected the same fixed `<op>:bad-args` literal before and after the install and
/// never echoes the sidecar's value, then the crate, which decodes the object strictly again and bounds the stream id. The
/// call needs no host: the caller names the whole environment when it wants one. A program that could not be started is the
/// crate's `Err` text, which passes through as the dispatch error.
fn spawn_async_over(ctx: Option<&Arc<LaunchCtx>>, args: &[Value]) -> Result<Value, String> {
    LaunchSpawnAsyncArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_spawn_async:bad-args".to_string());
    }
    rpc_launch_op(ctx, "launch_spawn_async", args)
}

/// The `launch_spawn_async` `rustInvoke` arm (88.2-17, D-02, D-19): `spawnAsync`, one program run to its end and answered
/// `{ code, stdout, stderr, timedOut, aborted }`. It runs on the dispatcher's worker thread for this one request, and a call
/// that observes the stream writes its `runnerOutput` frames from that thread before the arm returns, so they precede the
/// reply on the one ordered stdin pipe. A caller runs installers and archive moves for hours, so the sidecar lists the
/// channel as unbounded (`UNBOUNDED_RUST_CHANNELS`); the `launch_runner_kill` on its stream id, the caller's own timeout and
/// the crate's `guarded` registrant and shutdown token end it.
pub(crate) fn rpc_launch_spawn_async(args: &[Value]) -> Result<Value, String> {
    spawn_async_over(launch_ctx(), args)
}

/// The body of the `launch_tracked_kill` arm over a given context: the generated decode (`[{ runner?, key? }]`) and an arity
/// check first, then the crate, which bounds each name and answers how many registered runs it ended.
fn tracked_kill_over(ctx: Option<&Arc<LaunchCtx>>, args: &[Value]) -> Result<Value, String> {
    LaunchTrackedKillArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_tracked_kill:bad-args".to_string());
    }
    rpc_launch_op(ctx, "launch_tracked_kill", args)
}

/// The `launch_tracked_kill` `rustInvoke` arm (88.2-17, D-07, D-19): `killTracked`, the managers' stop. No field ends every
/// registered run, `runner` alone every run of that runner, both one run; the answer is how many it ended. A lookup and a
/// signal bounded by the child grace, so the sidecar keeps it inside the 60 s `RUST_INVOKE_TIMEOUT_MS`; the crate does not cut
/// it short at shutdown, because the quit-kill runs while the shutdown token may already be cancelled.
pub(crate) fn rpc_launch_tracked_kill(args: &[Value]) -> Result<Value, String> {
    tracked_kill_over(launch_ctx(), args)
}

/// The body of the `launch_tracked_kill_all` arm over a given context: no argument (anything sent is the fixed `<op>:bad-args`
/// literal, before and after the install), then the crate, which ends every registered run and answers how many.
fn tracked_kill_all_over(ctx: Option<&Arc<LaunchCtx>>, args: &[Value]) -> Result<Value, String> {
    LaunchTrackedKillAllArgs::from_args(args)?;
    if !args.is_empty() {
        return Err("launch_tracked_kill_all:bad-args".to_string());
    }
    rpc_launch_op(ctx, "launch_tracked_kill_all", args)
}

/// The `launch_tracked_kill_all` `rustInvoke` arm (88.2-17, D-07, D-19): `killAllTracked`, ending every registered run, games
/// through their own handles and helpers through their tokens, and answering how many it ended. It waits up to the exit
/// budget's child grace for them, on the dispatcher's worker thread for this one request (never the reply thread), so the
/// sidecar keeps it inside the 60 s `RUST_INVOKE_TIMEOUT_MS`. The quit handler (88.2-19) is its one caller; the crate does not
/// cut it short at shutdown.
pub(crate) fn rpc_launch_tracked_kill_all(args: &[Value]) -> Result<Value, String> {
    tracked_kill_all_over(launch_ctx(), args)
}

/// The body of the `launch_games_running` arm over a given context: no argument, then the crate's registry read.
fn games_running_over(ctx: Option<&Arc<LaunchCtx>>, args: &[Value]) -> Result<Value, String> {
    LaunchGamesRunningArgs::from_args(args)?;
    if !args.is_empty() {
        return Err("launch_games_running:bad-args".to_string());
    }
    rpc_launch_op(ctx, "launch_games_running", args)
}

/// The `launch_games_running` `rustInvoke` arm (88.2-17, D-07, D-19): whether a game run is registered, the answer the quit
/// check reads. A registry read, so the sidecar keeps it inside the 60 s `RUST_INVOKE_TIMEOUT_MS`.
pub(crate) fn rpc_launch_games_running(args: &[Value]) -> Result<Value, String> {
    games_running_over(launch_ctx(), args)
}

/// The body of the `launch_ask_force_uninstall` arm over a given context: the generated decode (`[{ runner, appName }]`, the
/// runner one of the five names) and an arity check first, so a bad call is rejected the same fixed `<op>:bad-args` literal before
/// and after the install and never echoes the sidecar's value, then the crate, which decodes the object strictly again, bounds the
/// app name, asks the user and on Yes goes back to the sidecar through the manager hooks.
fn ask_force_uninstall_over(ctx: Option<&Arc<LaunchCtx>>, args: &[Value]) -> Result<Value, String> {
    LaunchAskForceUninstallArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_ask_force_uninstall:bad-args".to_string());
    }
    rpc_launch_op(ctx, "launch_ask_force_uninstall", args)
}

/// The `launch_ask_force_uninstall` `rustInvoke` arm (88.2-20, D-26, D-19): `askForceUninstall`, the deleted-folder prompt. It
/// answers the index of the button the user clicked (`0` No, `1` Yes) or `null` for a dismissal, and removes the game through the
/// manager hook only after a Yes. It waits on the user and then on the sidecar, on the dispatcher's worker thread for this one
/// request (never the reply thread), so the sidecar lists the channel as unbounded (`UNBOUNDED_RUST_CHANNELS`) and the shutdown
/// token and the hook calls' EOF handling end it.
pub(crate) fn rpc_launch_ask_force_uninstall(args: &[Value]) -> Result<Value, String> {
    ask_force_uninstall_over(launch_ctx(), args)
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_core::clock::SystemClock;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
    use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform as InfoPlatform};
    use gamelib_info::http::ReqwestHttp;
    use gamelib_knownfix::ctx::KnownFixCtx;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use gamelib_wine::ctx::WineCtx;
    use serde_json::json;

    /// A launch context over a fake HOME, built the way [`install`] builds the real one.
    fn ctx_over(home: &FakeHome) -> Arc<LaunchCtx> {
        Arc::new(ctx_built(home, None))
    }

    /// [`ctx_over`] as a value, with an engine log when one is given (a hook failure's fixed line lands there).
    fn ctx_built(
        home: &FakeHome,
        log: Option<Arc<dyn gamelib_engine::sinks::EngineLog>>,
    ) -> LaunchCtx {
        ctx_built_with(home, log, None)
    }

    /// [`ctx_built`] with the emitter the renderer's pushes go to, when one is given.
    fn ctx_built_with(
        home: &FakeHome,
        log: Option<Arc<dyn gamelib_engine::sinks::EngineLog>>,
        emitter: Option<Arc<dyn gamelib_core::emitter::FrontendEmitter>>,
    ) -> LaunchCtx {
        let root = home.root().to_path_buf();
        let engine = EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Linux,
            EnginePaths {
                app_folder: root.join("app"),
                user_data: root.join("app"),
                tools_path: root.join("app").join("tools"),
                user_home: root.join("home"),
                temp: root.join("temp"),
            },
            Shutdown::new(),
        );
        let engine = match log {
            Some(log) => engine.with_log(log),
            None => engine,
        };
        let engine = Arc::new(match emitter {
            Some(emitter) => engine.with_emitter(emitter),
            None => engine,
        });
        let knownfix = Arc::new(KnownFixCtx::new(
            Arc::clone(&engine),
            None,
            "https://relay.test",
            "1.2.3",
        ));
        let wine = Arc::new(WineCtx::new(Arc::clone(&engine), root.join("runtimes")));
        let info = Arc::new(InfoCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            InfoPlatform::Linux,
            InfoPaths {
                app_folder: root.join("app"),
                user_data: root.join("app"),
                temp: root.join("temp"),
                public_dir: None,
            },
            "1.2.3".to_string(),
            Shutdown::new(),
            Arc::new(ReqwestHttp::new()),
        ));
        LaunchCtx::new(engine, knownfix, wine, info)
    }

    #[test]
    fn before_install_the_wrapper_env_arm_answers_not_ready() {
        let args = vec![json!({"appName": "1234", "appRunner": "gog"})];
        assert_eq!(
            setup_wrapper_env_vars_over(None, &args),
            Err("launch_setup_wrapper_env_vars:not-ready".to_string())
        );
    }

    #[test]
    fn the_wrapper_env_arm_answers_the_map_over_an_installed_context() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let got = setup_wrapper_env_vars_over(
            Some(&ctx),
            &[json!({"appName": "1234", "appRunner": "gog"})],
        )
        .unwrap();
        assert_eq!(got["HEROIC_APP_NAME"], json!("1234"));
        assert_eq!(got["HEROIC_APP_RUNNER"], json!("gog"));
        assert_eq!(got["GAMEID"], json!("umu-0"));
        assert_eq!(got["STORE"], json!("gog"));
    }

    #[test]
    fn a_wrong_call_is_the_same_fixed_bad_args_before_and_after_the_install() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let secret = "/Users/someone/secret-profile-path";
        let wrong: Vec<Vec<Value>> = vec![
            vec![],
            vec![json!(secret)],
            vec![json!({"appName": secret, "appRunner": "epic"})],
            vec![json!({"appName": "1", "appRunner": "gog"}), json!(secret)],
        ];
        for args in wrong {
            for ctx in [None, Some(&ctx)] {
                let err = setup_wrapper_env_vars_over(ctx, &args).unwrap_err();
                assert_eq!(err, "launch_setup_wrapper_env_vars:bad-args", "{args:?}");
                assert!(!err.contains(secret));
            }
        }
        // An unknown key passes the generated decode and is the crate's to refuse (it needs the context).
        let err = setup_wrapper_env_vars_over(
            Some(&ctx),
            &[json!({"appName": "1", "appRunner": "gog", "extra": secret})],
        )
        .unwrap_err();
        assert_eq!(err, "launch_setup_wrapper_env_vars:bad-args");
        assert!(!err.contains(secret));
    }

    /// The settings fields the env builders need: the game's wine installation (the wine ops require it;
    /// `setupEnvVars` reads none, and Windows settings carry none), `extra` adds the rest.
    fn settings(extra: Value) -> Value {
        let mut base = json!({
            "wineVersion": {"type": "wine", "bin": "/w/wine", "name": "Wine-9", "wineserver": "/w/wineserver"},
            "winePrefix": "/p"
        });
        if let (Some(base), Value::Object(extra)) = (base.as_object_mut(), extra) {
            base.extend(extra);
        }
        base
    }

    /// The shell's host facts, fixed: no variable set, so `LD_PRELOAD` is the empty default.
    fn host() -> Value {
        json!({"env": {}})
    }

    #[test]
    fn the_game_env_arm_builds_the_map_over_the_shells_host_and_is_not_ready_before_the_install() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let args = vec![settings(json!({"nvidiaPrime": true})), json!("/games/g1")];
        assert_eq!(
            setup_env_vars_over(None, &args, host),
            Err("launch_setup_env_vars:not-ready".to_string())
        );
        let got = setup_env_vars_over(Some(&ctx), &args, host).unwrap();
        assert_eq!(got["DRI_PRIME"], json!("1"));
        assert_eq!(got["STEAM_COMPAT_INSTALL_PATH"], json!("/games/g1"));
        assert_eq!(got["LD_PRELOAD"], json!(""));
        // A trailing install path left out is the same as null.
        let bare = setup_env_vars_over(Some(&ctx), &[settings(json!({}))], host).unwrap();
        assert!(bare.get("STEAM_COMPAT_INSTALL_PATH").is_none());
        // The host is the shell's: a process that already preloads something is left alone.
        let preloaded = setup_env_vars_over(
            Some(&ctx),
            &[settings(json!({})), Value::Null],
            || json!({"env": {"LD_PRELOAD": "x.so"}}),
        )
        .unwrap();
        assert!(preloaded.get("LD_PRELOAD").is_none());
    }

    #[test]
    fn the_game_env_arm_answers_settings_with_no_wine() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        // The sidecar's exact argument shape on Windows: the settings alone, no wine in them (CR-01).
        let bare = setup_env_vars_over(Some(&ctx), &[json!({})], host).unwrap();
        assert_eq!(bare, json!({"LD_PRELOAD": ""}));
        let got = setup_env_vars_over(
            Some(&ctx),
            &[
                json!({"nvidiaPrime": true, "wineVersion": {}}),
                json!("C:\\Games\\G"),
            ],
            host,
        )
        .unwrap();
        assert_eq!(got["DRI_PRIME"], json!("1"));
        assert_eq!(got["LD_PRELOAD"], json!(""));
    }

    #[test]
    fn the_wine_env_arm_builds_the_map_and_is_not_ready_before_the_install() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let settings = json!({
            "wineVersion": {"type": "wine", "bin": "/w/wine", "name": "Wine-9", "wineserver": "/w/wineserver"},
            "winePrefix": "/p"
        });
        assert_eq!(
            setup_wine_env_vars_over(None, &[settings.clone(), Value::Null], host),
            Err("launch_setup_wine_env_vars:not-ready".to_string())
        );
        let got = setup_wine_env_vars_over(Some(&ctx), &[settings, json!("g1")], host).unwrap();
        assert!(got.is_object());
        assert_eq!(got["WINEPREFIX"], json!("/p"));
    }

    #[test]
    fn the_verify_prefix_arm_answers_not_ready_before_the_install_and_an_empty_res_for_a_crossover_wine(
    ) {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let crossover = json!({
            "wineVersion": {"type": "crossover", "bin": "/cx/wine", "name": "CrossOver"},
            "winePrefix": home.root().join("never-made").to_string_lossy(),
        });
        assert_eq!(
            verify_wine_prefix_over(None, std::slice::from_ref(&crossover), host),
            Err("launch_verify_wine_prefix:not-ready".to_string())
        );
        // A crossover bottle has no prefix of its own: nothing spawns and nothing is created.
        assert_eq!(
            verify_wine_prefix_over(Some(&ctx), &[crossover], host),
            Ok(json!({"res": {"stdout": "", "stderr": ""}}))
        );
        assert!(!home.root().join("never-made").exists());
    }

    #[test]
    fn the_wrappers_arm_joins_the_words_in_order_and_tells_an_empty_gamescope_from_none() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        assert_eq!(
            setup_wrappers_over(None, &[json!({}), Value::Null, Value::Null, Value::Null]),
            Err("launch_setup_wrappers:not-ready".to_string())
        );
        let settings = json!({"wrapperOptions": [{"exe": "a", "args": "b 'c d'"}]});
        let got = setup_wrappers_over(
            Some(&ctx),
            &[
                settings.clone(),
                json!(["mangohud"]),
                json!("gamemoderun"),
                json!(["gamescope", "--"]),
            ],
        )
        .unwrap();
        assert_eq!(
            got,
            json!(["gamescope", "--", "a", "b", "c d", "gamemoderun"])
        );
        // mangohud joins only behind an empty gamescope list, never when there is none.
        let with_empty = setup_wrappers_over(
            Some(&ctx),
            &[json!({}), json!(["mangohud"]), Value::Null, json!([])],
        )
        .unwrap();
        assert_eq!(with_empty, json!(["mangohud"]));
        let with_none = setup_wrappers_over(Some(&ctx), &[json!({}), json!(["mangohud"])]).unwrap();
        assert_eq!(with_none, json!([]));
        // An unterminated quote is the crate's fixed `<op>:<message>`, never the option's text.
        let err = setup_wrappers_over(
            Some(&ctx),
            &[json!({"wrapperOptions": [{"exe": "a", "args": "'secret"}]})],
        )
        .unwrap_err();
        assert!(err.starts_with("launch_setup_wrappers:"), "{err}");
        assert!(!err.contains("secret"));
    }

    #[test]
    fn the_known_fix_env_arm_answers_an_empty_map_for_a_game_with_no_fix() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let args = vec![json!("1234"), json!("gog")];
        assert_eq!(
            known_fix_env_over(None, &args),
            Err("launch_known_fix_env:not-ready".to_string())
        );
        assert_eq!(known_fix_env_over(Some(&ctx), &args), Ok(json!({})));
    }

    #[test]
    fn the_epic_arm_answers_not_ready_before_the_install_and_offline_for_an_app_that_is_not_online()
    {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        assert_eq!(
            epic_service_offline_over(None, &[]),
            Err("launch_epic_service_offline:not-ready".to_string())
        );
        // The context starts not online, so no request is made and the answer is offline.
        for args in [
            vec![],
            vec![Value::Null],
            vec![json!("Epic Games Store")],
            vec![json!("Fortnite")],
            vec![json!("Rocket League")],
        ] {
            assert_eq!(
                epic_service_offline_over(Some(&ctx), &args),
                Ok(json!(true)),
                "{args:?}"
            );
        }
        // Its one argument is optional, so an empty call is valid; anything else is the fixed literal, never
        // echoing what was sent, before and after the install.
        let secret = "/Users/someone/secret-profile-path";
        for args in [
            vec![json!(secret)],
            vec![json!("fortnite")],
            vec![json!(1)],
            vec![json!({"x": secret})],
            vec![Value::Null, Value::Null],
            vec![json!("Fortnite"), json!("Fortnite")],
        ] {
            for ctx in [None, Some(&ctx)] {
                let err = epic_service_offline_over(ctx, &args).unwrap_err();
                assert_eq!(err, "launch_epic_service_offline:bad-args", "{args:?}");
                assert!(!err.contains(secret));
            }
        }
    }

    fn prepare_args(settings: Value) -> Value {
        json!({
            "settings": settings,
            "runner": "gog",
            "appName": "1234",
            "title": "A Game",
            "canRunOffline": false,
            "isNative": true,
            "storeExpired": false,
            "installPath": "/games/a",
        })
    }

    #[test]
    fn the_prepare_arm_is_not_ready_before_the_install_and_answers_the_reply_with_its_log_after() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let args = vec![prepare_args(json!({}))];
        assert_eq!(
            prepare_over(None, &args, host),
            Err("launch_prepare:not-ready".to_string())
        );
        // A Linux context that is not online: offline mode, no wrappers (none were asked for), a log.
        let got = prepare_over(Some(&ctx), &args, || json!({"wine": {"env": {}}})).unwrap();
        assert_eq!(got["success"], json!(true));
        assert_eq!(got["offlineMode"], json!(true));
        assert_eq!(got["mangoHudCommand"], json!([]));
        assert_eq!(got["log"][0]["level"], json!("warning"));
        assert!(got["log"].as_array().unwrap().len() >= 6);
    }

    #[test]
    fn the_prepare_arm_rejects_a_wrong_call_with_its_fixed_bad_args_before_and_after_the_install() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let secret = "/Users/someone/secret-profile-path";
        let wrong: Vec<Vec<Value>> = vec![
            vec![],
            vec![json!(secret)],
            vec![prepare_args(json!(secret))],
            vec![prepare_args(json!({})), json!({})],
            vec![
                json!({"settings": {}, "runner": "epic", "appName": "1", "title": secret,
                        "canRunOffline": false, "isNative": true, "storeExpired": false}),
            ],
            vec![
                json!({"settings": {}, "runner": "gog", "appName": 1, "title": "t",
                        "canRunOffline": false, "isNative": true, "storeExpired": false}),
            ],
        ];
        for args in &wrong {
            for ctx in [None, Some(&ctx)] {
                let err = prepare_over(ctx, args, host).unwrap_err();
                assert_eq!(err, "launch_prepare:bad-args", "{args:?}");
                assert!(!err.contains(secret));
            }
        }
        // An unknown key passes the generated decode and is the crate's to refuse.
        let mut extra = prepare_args(json!({}));
        extra["extra"] = json!(secret);
        let err = prepare_over(Some(&ctx), &[extra], || json!({})).unwrap_err();
        assert_eq!(err, "launch_prepare:bad-args");
        assert!(!err.contains(secret));
    }

    fn wine_begin_args(settings: Value) -> Value {
        json!({
            "runner": "gog",
            "appName": "1234",
            "title": "A Game",
            "canRunOffline": false,
            "storedSettings": settings,
        })
    }

    #[test]
    fn the_wine_begin_arm_is_not_ready_before_the_install_and_answers_the_reply_after() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let settings = json!({
            "winePrefix": "/nonexistent/prefix",
            "wineVersion": {"bin": "/nonexistent/wine", "name": "W", "type": "wine"},
        });
        let args = vec![wine_begin_args(settings)];
        assert_eq!(
            prepare_wine_begin_over(None, &args, host),
            Err("launch_prepare_wine_begin:not-ready".to_string())
        );
        // No wine exists and the profile holds no default: the step stops and creates nothing.
        let got = prepare_wine_begin_over(Some(&ctx), &args, || json!({})).unwrap();
        assert_eq!(got["success"], json!(false));
        assert_eq!(got["prefixUpdated"], json!(false));
        assert_eq!(got["log"], json!([]));
    }

    #[test]
    fn the_wine_begin_arm_rejects_a_wrong_call_with_its_fixed_bad_args_before_and_after_the_install(
    ) {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let secret = "/Users/someone/secret-profile-path";
        let wrong: Vec<Vec<Value>> = vec![
            vec![wine_begin_args(json!(secret))],
            vec![wine_begin_args(json!({})), json!({})],
            vec![json!({
                "runner": "epic", "appName": "1", "title": secret, "canRunOffline": false,
                "storedSettings": {},
            })],
            vec![json!({
                "runner": "gog", "appName": 1, "title": "t", "canRunOffline": false,
                "storedSettings": {},
            })],
        ];
        for args in &wrong {
            for ctx in [None, Some(&ctx)] {
                let err = prepare_wine_begin_over(ctx, args, host).unwrap_err();
                assert_eq!(err, "launch_prepare_wine_begin:bad-args", "{args:?}");
                assert!(!err.contains(secret));
            }
        }
        // An unknown key passes the generated decode and is the crate's to refuse.
        let mut extra = wine_begin_args(json!({}));
        extra["extra"] = json!(secret);
        let err = prepare_wine_begin_over(Some(&ctx), &[extra], || json!({})).unwrap_err();
        assert_eq!(err, "launch_prepare_wine_begin:bad-args");
        assert!(!err.contains(secret));
    }

    fn wine_finish_args(settings: Value) -> Value {
        json!({
            "runner": "gog",
            "appName": "1234",
            "title": "A Game",
            "settings": settings,
            "storedSettings": settings,
            "prefixUpdated": false,
            "mergesTier1Env": true,
            "isGog": false,
        })
    }

    #[test]
    fn the_wine_finish_arm_is_not_ready_before_the_install_and_answers_the_reply_after() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let settings = json!({
            "winePrefix": "/nonexistent/prefix",
            "wineVersion": {"bin": "/nonexistent/wine", "name": "W", "type": "proton"},
        });
        let args = vec![wine_finish_args(settings)];
        assert_eq!(
            prepare_wine_finish_over(None, &args, host),
            Err("launch_prepare_wine_finish:not-ready".to_string())
        );
        // A proton game with nothing to fix: the env is the wine env, the overlay env is empty and the
        // deadline arms nothing (no engine selection), so the reply is a success with an empty log.
        let got = prepare_wine_finish_over(Some(&ctx), &args, || json!({})).unwrap();
        assert_eq!(got["success"], json!(true));
        assert_eq!(got["knownFixEnv"], json!({}));
        assert_eq!(got["log"], json!([]));
        assert!(got["envVars"].is_object());
    }

    #[test]
    fn the_wine_finish_arm_rejects_a_wrong_call_with_its_fixed_bad_args_before_and_after_the_install(
    ) {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let secret = "/Users/someone/secret-profile-path";
        let wrong: Vec<Vec<Value>> = vec![
            vec![wine_finish_args(json!(secret))],
            vec![wine_finish_args(json!({})), json!({})],
            // Stored settings that are not an object.
            vec![{
                let mut args = wine_finish_args(json!({}));
                args["storedSettings"] = json!(secret);
                args
            }],
            vec![json!({
                "runner": "epic", "appName": "1", "title": secret, "settings": {},
                "storedSettings": {}, "prefixUpdated": false, "mergesTier1Env": true, "isGog": false,
            })],
            vec![json!({
                "runner": "gog", "appName": 1, "title": "t", "settings": {},
                "storedSettings": {}, "prefixUpdated": false, "mergesTier1Env": true, "isGog": false,
            })],
        ];
        for args in &wrong {
            for ctx in [None, Some(&ctx)] {
                let err = prepare_wine_finish_over(ctx, args, host).unwrap_err();
                assert_eq!(err, "launch_prepare_wine_finish:bad-args", "{args:?}");
                assert!(!err.contains(secret));
            }
        }
        // An unknown key passes the generated decode and is the crate's to refuse; so is a settings object that is
        // not game settings.
        let mut extra = wine_finish_args(json!({}));
        extra["extra"] = json!(secret);
        let err = prepare_wine_finish_over(Some(&ctx), &[extra], || json!({})).unwrap_err();
        assert_eq!(err, "launch_prepare_wine_finish:bad-args");
        assert!(!err.contains(secret));
        let err =
            prepare_wine_finish_over(Some(&ctx), &[wine_finish_args(json!({}))], || json!({}))
                .unwrap_err();
        assert_eq!(err, "launch_prepare_wine_finish:bad-args");
    }

    #[test]
    fn the_prepare_host_reads_the_deck_and_flatpak_facts_the_way_the_ts_constants_do() {
        let env_of = |pairs: &'static [(&'static str, &'static str)]| {
            move |key: &str| {
                pairs
                    .iter()
                    .find(|(k, _)| *k == key)
                    .map(|(_, v)| (*v).to_string())
            }
        };
        let none = || None;
        let wine = json!({"env": {}});
        let plain = prepare_host_over(&env_of(&[]), &none, wine.clone());
        assert_eq!(
            plain,
            json!({"wine": {"env": {}}, "steamDeckGameMode": false, "steamDeck": false,
                   "flatpak": false, "flatpakRuntimeVersion": ""})
        );
        let game_mode = prepare_host_over(
            &env_of(&[("XDG_CURRENT_DESKTOP", "gamescope")]),
            &none,
            wine.clone(),
        );
        assert_eq!(game_mode["steamDeckGameMode"], json!(true));
        assert_eq!(game_mode["steamDeck"], json!(true));
        // Desktop mode needs all three of its variables.
        let desktop = prepare_host_over(
            &env_of(&[
                ("SESSION_MANAGER", "local/x,unix/steamdeck:/tmp/ICE"),
                ("HOME", "/home/deck"),
                ("DESKTOP_SESSION", "plasma-steamos-wayland"),
            ]),
            &none,
            wine.clone(),
        );
        assert_eq!(desktop["steamDeckGameMode"], json!(false));
        assert_eq!(desktop["steamDeck"], json!(true));
        let partial = prepare_host_over(
            &env_of(&[
                ("SESSION_MANAGER", "unix/steamdeck"),
                ("HOME", "/home/deck"),
            ]),
            &none,
            wine.clone(),
        );
        assert_eq!(partial["steamDeck"], json!(false));
        // Flatpak: the version the manifest names, `unknown` when it cannot be read, nothing off Flatpak.
        let manifest = || Some(r#"{"runtime-version": "24.08"}"#.to_string());
        let flatpak = prepare_host_over(
            &env_of(&[("FLATPAK_ID", "io.x.App")]),
            &manifest,
            wine.clone(),
        );
        assert_eq!(flatpak["flatpak"], json!(true));
        assert_eq!(flatpak["flatpakRuntimeVersion"], json!("24.08"));
        let unreadable =
            prepare_host_over(&env_of(&[("FLATPAK_ID", "io.x.App")]), &none, wine.clone());
        assert_eq!(unreadable["flatpakRuntimeVersion"], json!("unknown"));
        let off = prepare_host_over(&env_of(&[]), &manifest, wine);
        assert_eq!(off["flatpakRuntimeVersion"], json!(""));
    }

    #[test]
    fn every_new_arm_rejects_a_wrong_call_with_its_fixed_bad_args_before_and_after_the_install() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let secret = "/Users/someone/secret-profile-path";
        type Arm = fn(Option<&Arc<LaunchCtx>>, &[Value]) -> Result<Value, String>;
        let arms: [(&str, Arm); 8] = [
            ("launch_setup_env_vars", |c, a| {
                setup_env_vars_over(c, a, host)
            }),
            ("launch_setup_wine_env_vars", |c, a| {
                setup_wine_env_vars_over(c, a, host)
            }),
            ("launch_setup_wrappers", setup_wrappers_over),
            ("launch_known_fix_env", known_fix_env_over),
            ("launch_verify_wine_prefix", |c, a| {
                verify_wine_prefix_over(c, a, host)
            }),
            ("launch_prepare_wine_begin", |c, a| {
                prepare_wine_begin_over(c, a, host)
            }),
            ("launch_prepare_wine_finish", |c, a| {
                prepare_wine_finish_over(c, a, host)
            }),
            ("launch_check_wine_before_launch", |c, a| {
                check_wine_before_launch_over(c, a, host)
            }),
        ];
        let wrong: Vec<Vec<Value>> = vec![
            vec![],
            vec![json!(secret)],
            vec![json!(secret), json!(secret)],
            vec![
                json!(secret),
                json!(secret),
                json!(secret),
                json!(secret),
                json!(secret),
            ],
            vec![json!({}), json!(1), json!(1), json!(1)],
            vec![json!({}), json!({"x": secret})],
        ];
        for (op, arm) in arms {
            for args in &wrong {
                for ctx in [None, Some(&ctx)] {
                    let err = arm(ctx, args).unwrap_err();
                    assert_eq!(err, format!("{op}:bad-args"), "{op} {args:?}");
                    assert!(!err.contains(secret));
                }
            }
        }
        // A runner outside the five is refused by the generated decode.
        assert_eq!(
            known_fix_env_over(Some(&ctx), &[json!("1"), json!("epic")]),
            Err("launch_known_fix_env:bad-args".to_string())
        );
    }

    fn check_wine_args(wine: Value) -> Value {
        json!({
            "appName": "1234",
            "runner": "gog",
            "wineVersion": wine,
            "verboseLogs": false,
            "disableLogs": false,
        })
    }

    #[test]
    fn the_check_wine_arm_is_not_ready_before_the_install_and_rejects_a_wrong_call_after() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let secret = "/Users/someone/secret-profile-path";
        let wine = json!({"bin": "/nonexistent/wine", "name": "W", "type": "wine"});
        assert_eq!(
            check_wine_before_launch_over(None, &[check_wine_args(wine.clone())], host),
            Err("launch_check_wine_before_launch:not-ready".to_string())
        );
        // A game wine that is not an object is refused before and after the install, without echoing it.
        for ctx in [None, Some(&ctx)] {
            let err = check_wine_before_launch_over(ctx, &[check_wine_args(json!(secret))], host)
                .unwrap_err();
            assert_eq!(err, "launch_check_wine_before_launch:bad-args");
            assert!(!err.contains(secret));
        }
        // An unknown key and a runner outside the five are refused by the generated decode.
        let mut extra = check_wine_args(wine.clone());
        extra["extra"] = json!(secret);
        let mut epic = check_wine_args(wine);
        epic["runner"] = json!("epic");
        for args in [extra, epic] {
            let err = check_wine_before_launch_over(Some(&ctx), &[args], host).unwrap_err();
            assert_eq!(err, "launch_check_wine_before_launch:bad-args");
            assert!(!err.contains(secret));
        }
    }

    #[test]
    fn a_context_with_no_dialog_source_answers_every_question_as_a_dismissal() {
        // The context the CLI builds (and `ctx_over` here) has no dialog source: the question is never shown and the
        // answer is a dismissal, which `checkWineBeforeLaunch` reads as "No" (T-88.1-34).
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        assert!(ctx.dialogs.is_none());
        let buttons = ["YES".to_string(), "NO".to_string()];
        assert_eq!(
            gamelib_launch::prepare::dialogs::ask(&ctx, "title", "message", &buttons),
            None
        );
    }

    /// A runner call as the sidecar sends it: a `/bin/sh` that prints and exits.
    fn runner_call_args(script: &str) -> Value {
        json!({
            "commandParts": ["-c", script],
            "runner": {"name": "sideload", "bin": "/bin/sh", "logPrefix": "Sideload"},
            "env": [["ZED", "1"], ["ALPHA", "2"]]
        })
    }

    #[test]
    fn the_runner_host_is_the_shells_environment_as_a_map_and_its_path() {
        use std::ffi::OsString;
        let vars = vec![
            (OsString::from("A"), OsString::from("1")),
            (OsString::from("PATH"), OsString::from("/bin:/usr/bin")),
        ];
        assert_eq!(
            runner_host_over(vars.into_iter(), Some(OsString::from("/bin:/usr/bin"))),
            json!({"env": {"A": "1", "PATH": "/bin:/usr/bin"}, "path": "/bin:/usr/bin"})
        );
        // No PATH is the empty text, and a variable that is not UTF-8 is left out.
        assert_eq!(
            runner_host_over(std::iter::empty(), None),
            json!({"env": {}, "path": ""})
        );
        #[cfg(unix)]
        {
            use std::os::unix::ffi::OsStringExt;
            let bad = OsString::from_vec(vec![0x66, 0xff]);
            let vars = vec![(OsString::from("BAD"), bad.clone())];
            assert_eq!(
                runner_host_over(vars.into_iter(), Some(bad)),
                json!({"env": {}, "path": ""})
            );
        }
        // This process's own host carries what the process holds.
        let host = runner_host();
        assert!(host["env"].is_object());
        assert!(host["path"].is_string());
    }

    #[test]
    fn the_runner_call_arm_is_not_ready_before_the_install_and_rejects_a_wrong_call_the_same_way_after(
    ) {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let secret = "/Users/someone/secret-profile-path";
        assert_eq!(
            runner_call_over(None, &[runner_call_args("true")], host),
            Err("launch_runner_call:not-ready".to_string())
        );
        let mut stray_runner = runner_call_args("true");
        stray_runner["runner"]["name"] = json!("epic");
        let mut bad_target = runner_call_args("true");
        bad_target["logTargets"] = json!([{"target": {"kind": secret}}]);
        let wrong: Vec<Vec<Value>> = vec![
            vec![],
            vec![json!(secret)],
            vec![json!({"commandParts": secret})],
            vec![runner_call_args("true"), json!(secret)],
            vec![stray_runner],
            vec![bad_target],
        ];
        for args in wrong {
            for ctx in [None, Some(&ctx)] {
                let err = runner_call_over(ctx, &args, host).unwrap_err();
                assert_eq!(err, "launch_runner_call:bad-args", "{args:?}");
                assert!(!err.contains(secret), "{args:?}");
            }
        }
        // An unknown key and a pair that is not two items pass the generated decode and are the crate's to refuse, which
        // needs the context: the same fixed literal, never echoing what was sent.
        let mut extra = runner_call_args("true");
        extra["extra"] = json!(secret);
        let mut short_pair = runner_call_args("true");
        short_pair["env"] = json!([["ONLY-KEY"]]);
        for args in [extra, short_pair] {
            let err = runner_call_over(Some(&ctx), &[args], host).unwrap_err();
            assert_eq!(err, "launch_runner_call:bad-args");
            assert!(!err.contains(secret));
        }
    }

    #[cfg(unix)]
    #[test]
    fn the_runner_call_arm_runs_the_call_over_the_shells_host_and_answers_the_exec_result() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        // The child sees the shell's variables (the host) and the caller's own, which win.
        let got = runner_call_over(
            Some(&ctx),
            &[runner_call_args("printf '%s-%s' \"$HOST_ONLY\" \"$ZED\"")],
            || json!({"env": {"HOST_ONLY": "h", "ZED": "host", "PATH": "/usr/bin:/bin"}, "path": "/usr/bin:/bin"}),
        )
        .unwrap();
        assert_eq!(got["stdout"], json!("h-1"), "{got}");
        assert!(got.get("error").is_none(), "{got}");
        // A non-zero exit is the answer's `error`, not an `Err`.
        let failed = runner_call_over(Some(&ctx), &[runner_call_args("exit 3")], host).unwrap();
        assert!(failed["error"].is_string(), "{failed}");
    }

    #[test]
    fn the_kill_and_abort_arms_are_not_ready_before_the_install_and_reject_a_wrong_call_the_same_way_after(
    ) {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let secret = "/Users/someone/secret-profile-path";
        assert_eq!(
            runner_kill_over(None, &[json!("stream-1")]),
            Err("launch_runner_kill:not-ready".to_string())
        );
        assert_eq!(
            runner_abort_over(None, &[json!("abort-1")]),
            Err("launch_runner_abort:not-ready".to_string())
        );
        // Not a string, no argument, a second argument and an id with a path separator are the fixed literal.
        let wrong: Vec<Vec<Value>> = vec![
            vec![],
            vec![json!(1)],
            vec![json!({"x": secret})],
            vec![json!("a"), json!(secret)],
        ];
        for args in &wrong {
            for ctx in [None, Some(&ctx)] {
                let err = runner_kill_over(ctx, args).unwrap_err();
                assert_eq!(err, "launch_runner_kill:bad-args", "{args:?}");
                assert!(!err.contains(secret));
                let err = runner_abort_over(ctx, args).unwrap_err();
                assert_eq!(err, "launch_runner_abort:bad-args", "{args:?}");
                assert!(!err.contains(secret));
            }
        }
        for bad in [secret, "", "a\\b", "line\nbreak"] {
            let err = runner_kill_over(Some(&ctx), &[json!(bad)]).unwrap_err();
            assert_eq!(err, "launch_runner_kill:bad-args", "{bad:?}");
            assert!(!err.contains(secret));
            let err = runner_abort_over(Some(&ctx), &[json!(bad)]).unwrap_err();
            assert_eq!(err, "launch_runner_abort:bad-args", "{bad:?}");
            assert!(!err.contains(secret));
        }
    }

    #[test]
    fn a_kill_or_abort_for_an_id_no_run_holds_answers_false_and_reaches_nothing() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        assert_eq!(
            runner_kill_over(Some(&ctx), &[json!("unknown-stream")]),
            Ok(json!(false))
        );
        assert_eq!(
            runner_abort_over(Some(&ctx), &[json!("unknown-abort")]),
            Ok(json!(false))
        );
    }

    /// Calls a runner that sleeps on a thread, waits until the arm under test answers `true` for `id` and answers
    /// what the call answered. A run is registered only once its child is spawned, so the arm is retried.
    #[cfg(unix)]
    fn end_a_sleeping_run(
        ctx: &Arc<LaunchCtx>,
        call: Value,
        end: impl Fn(&Arc<LaunchCtx>) -> Result<Value, String>,
    ) -> Value {
        let runner_ctx = Arc::clone(ctx);
        let runner = std::thread::spawn(move || runner_call_over(Some(&runner_ctx), &[call], host));
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
        loop {
            if end(ctx) == Ok(json!(true)) {
                break;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "the run never answered to its id"
            );
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        runner.join().unwrap().unwrap()
    }

    #[cfg(unix)]
    #[test]
    fn a_kill_by_stream_id_ends_that_run_only_and_the_call_answers_ended() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let mut other = runner_call_args("sleep 30");
        other["streamId"] = json!("stream-other");
        other["observe"] = json!(true);
        let other_ctx = Arc::clone(&ctx);
        let other_run =
            std::thread::spawn(move || runner_call_over(Some(&other_ctx), &[other], host));
        let mut mine = runner_call_args("sleep 30");
        mine["streamId"] = json!("stream-mine");
        mine["observe"] = json!(true);
        let answered = end_a_sleeping_run(&ctx, mine, |ctx| {
            runner_kill_over(Some(ctx), &[json!("stream-mine")])
        });
        assert!(
            answered.get("abort") == Some(&json!(true)) || answered["error"].is_string(),
            "{answered}"
        );
        // The other run is still going: it answers to its own id, and then ends.
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
        while runner_kill_over(Some(&ctx), &[json!("stream-other")]) != Ok(json!(true)) {
            assert!(
                std::time::Instant::now() < deadline,
                "the other run was gone"
            );
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        other_run.join().unwrap().unwrap();
        // Both are gone now.
        assert_eq!(
            runner_kill_over(Some(&ctx), &[json!("stream-mine")]),
            Ok(json!(false))
        );
    }

    #[cfg(unix)]
    #[test]
    fn an_abort_by_abort_id_ends_the_run_and_the_call_answers_abort() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let mut call = runner_call_args("sleep 30");
        call["abortId"] = json!("abort-mine");
        let answered = end_a_sleeping_run(&ctx, call, |ctx| {
            runner_abort_over(Some(ctx), &[json!("abort-mine")])
        });
        assert_eq!(answered["abort"], json!(true), "{answered}");
        assert_eq!(
            runner_abort_over(Some(&ctx), &[json!("abort-mine")]),
            Ok(json!(false))
        );
    }
    /// A game's settings whose wine is not installed here: the wine command core answers `Invalid wine` for it without
    /// spawning anything, so the arms run end to end on every OS.
    fn missing_wine_settings(prefix: &std::path::Path) -> Value {
        json!({
            "winePrefix": prefix.to_string_lossy(),
            "wineVersion": {"bin": "/nonexistent/wine-bin", "name": "Nothing", "type": "wine"}
        })
    }

    fn wine_command_args(prefix: &std::path::Path) -> Value {
        json!({
            "gameSettings": missing_wine_settings(prefix),
            "commandParts": ["cmd", "/c", "echo", "x"],
            "skipPrefixCheckIKnowWhatImDoing": true,
            "options": {"env": {"ZED": "1"}, "wrappers": ["wrap"], "trackKey": "key-1"},
            "logTargets": [{"target": {"kind": "general"}}],
            "observe": false
        })
    }

    fn script_run_args(script: &str) -> Value {
        json!({
            "scriptPath": script,
            "stage": "before",
            "appName": "app-1",
            "runner": "gog",
            "title": "Title",
            "settingsJson": "{\"a\":1}",
            "infoJson": "{\"b\":2}"
        })
    }

    #[test]
    fn the_wine_command_path_and_script_arms_are_not_ready_before_the_install_and_reject_a_wrong_call_the_same_way_after(
    ) {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let secret = "/Users/someone/secret-profile-path";
        let prefix = home.root().join("prefix");
        assert_eq!(
            wine_command_over(None, &[wine_command_args(&prefix)], host),
            Err("launch_wine_command:not-ready".to_string())
        );
        assert_eq!(
            wine_path_over(
                None,
                &[json!({"path": "C:\\x", "gameSettings": missing_wine_settings(&prefix)})],
                host
            ),
            Err("launch_wine_path:not-ready".to_string())
        );
        assert_eq!(
            script_run_over(None, &[script_run_args("/bin/true")], host),
            Err("launch_script_run:not-ready".to_string())
        );

        let mut command_settings_text = wine_command_args(&prefix);
        command_settings_text["gameSettings"] = json!(secret);
        let mut command_stray_target = wine_command_args(&prefix);
        command_stray_target["logTargets"] = json!([{"target": {"kind": secret}}]);
        let wrong_command: Vec<Vec<Value>> = vec![
            vec![],
            vec![json!(secret)],
            vec![json!({"commandParts": secret})],
            vec![wine_command_args(&prefix), json!(secret)],
            vec![command_settings_text],
            vec![command_stray_target],
        ];
        for args in &wrong_command {
            for ctx in [None, Some(&ctx)] {
                let err = wine_command_over(ctx, args, host).unwrap_err();
                assert_eq!(err, "launch_wine_command:bad-args", "{args:?}");
                assert!(!err.contains(secret), "{args:?}");
            }
        }
        let wrong_path: Vec<Vec<Value>> = vec![
            vec![],
            vec![json!({"path": secret})],
            vec![json!({"path": "p", "gameSettings": secret})],
            vec![json!({"path": "p", "gameSettings": {}, "variant": secret})],
            vec![json!({"path": "p", "gameSettings": {}}), json!(secret)],
        ];
        for args in &wrong_path {
            for ctx in [None, Some(&ctx)] {
                let err = wine_path_over(ctx, args, host).unwrap_err();
                assert_eq!(err, "launch_wine_path:bad-args", "{args:?}");
                assert!(!err.contains(secret), "{args:?}");
            }
        }
        let mut script_stage = script_run_args("/bin/true");
        script_stage["stage"] = json!(secret);
        let wrong_script: Vec<Vec<Value>> = vec![
            vec![],
            vec![json!(secret)],
            vec![json!({"scriptPath": secret})],
            vec![script_run_args("/bin/true"), json!(secret)],
            vec![script_stage],
        ];
        for args in &wrong_script {
            for ctx in [None, Some(&ctx)] {
                let err = script_run_over(ctx, args, host).unwrap_err();
                assert_eq!(err, "launch_script_run:bad-args", "{args:?}");
                assert!(!err.contains(secret), "{args:?}");
            }
        }
        // An unknown key passes the generated decode and is the crate's to refuse, which needs the context: the same literal.
        let mut extra = wine_command_args(&prefix);
        extra["extra"] = json!(secret);
        let err = wine_command_over(Some(&ctx), &[extra], host).unwrap_err();
        assert_eq!(err, "launch_wine_command:bad-args");
        let mut extra = script_run_args("/bin/true");
        extra["extra"] = json!(secret);
        let err = script_run_over(Some(&ctx), &[extra], host).unwrap_err();
        assert_eq!(err, "launch_script_run:bad-args");
        assert!(!err.contains(secret));
    }

    #[test]
    fn the_wine_command_arm_runs_the_call_over_the_shells_wine_host_and_answers_stdout_and_stderr()
    {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let prefix = home.root().join("prefix");
        let got = wine_command_over(Some(&ctx), &[wine_command_args(&prefix)], host).unwrap();
        // A wine that is not installed is refused without a spawn: an empty stdout, `Invalid wine` and no code.
        assert_eq!(got, json!({"stdout": "", "stderr": "Invalid wine"}));
        // The shell's own host carries its wine facts: the process environment.
        let own = wine_dispatch::wine_run_host();
        assert!(own["env"].is_object());
    }

    #[test]
    fn the_wine_path_arm_answers_an_empty_path_for_a_wine_that_is_not_installed() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let prefix = home.root().join("prefix");
        let got = wine_path_over(
            Some(&ctx),
            &[json!({
                "path": "C:\\Windows",
                "gameSettings": missing_wine_settings(&prefix),
                "variant": "unix"
            })],
            host,
        )
        .unwrap();
        assert_eq!(got, json!(""));
    }

    #[cfg(unix)]
    #[test]
    fn the_script_arm_runs_the_script_over_the_shells_host_and_answers_true_whatever_its_code() {
        use std::os::unix::fs::PermissionsExt;
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let dir = home.root().join("scripts");
        std::fs::create_dir_all(&dir).unwrap();
        let out = dir.join("out.txt");
        let script = dir.join("before.sh");
        std::fs::write(
            &script,
            format!(
                "#!/bin/sh\nprintf '%s|%s|%s' \"$HOST_ONLY\" \"$HEROIC_GAME_SETTINGS\" \"$HEROIC_GAME_INFO\" > '{}'\nexit 7\n",
                out.display()
            ),
        )
        .unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        let got = script_run_over(
            Some(&ctx),
            &[script_run_args(&script.to_string_lossy())],
            || json!({"env": {"HOST_ONLY": "h", "PATH": "/usr/bin:/bin"}, "path": "/usr/bin:/bin"}),
        )
        .unwrap();
        assert_eq!(got, json!(true));
        // The settings and info text arrive exactly as the sidecar stringified them.
        assert_eq!(
            std::fs::read_to_string(&out).unwrap(),
            "h|{\"a\":1}|{\"b\":2}"
        );
    }

    #[test]
    fn a_script_that_cannot_start_is_the_dispatch_error_with_the_crates_text() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let missing = home.root().join("no-such-script");
        let err = script_run_over(
            Some(&ctx),
            &[script_run_args(&missing.to_string_lossy())],
            host,
        )
        .unwrap_err();
        assert!(!err.is_empty());
        assert!(
            !err.ends_with(":bad-args") && !err.ends_with(":not-ready"),
            "{err}"
        );
    }
    /// A spawnAsync call as the sidecar sends it: `/bin/sh -c <script>` with a `PATH` and nothing else in its environment.
    fn spawn_async_args(script: &str) -> Value {
        json!({
            "command": "/bin/sh",
            "args": ["-c", script],
            "env": {"PATH": "/usr/bin:/bin"}
        })
    }

    #[test]
    fn the_spawn_async_kill_and_query_arms_are_not_ready_before_the_install_and_reject_a_wrong_call_the_same_way_after(
    ) {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let secret = "/Users/someone/secret-profile-path";
        assert_eq!(
            spawn_async_over(None, &[spawn_async_args("true")]),
            Err("launch_spawn_async:not-ready".to_string())
        );
        assert_eq!(
            tracked_kill_over(None, &[json!({})]),
            Err("launch_tracked_kill:not-ready".to_string())
        );
        assert_eq!(
            tracked_kill_all_over(None, &[]),
            Err("launch_tracked_kill_all:not-ready".to_string())
        );
        assert_eq!(
            games_running_over(None, &[]),
            Err("launch_games_running:not-ready".to_string())
        );

        let mut stray_timeout = spawn_async_args("true");
        stray_timeout["timeoutMs"] = json!(secret);
        let wrong_spawn: Vec<Vec<Value>> = vec![
            vec![],
            vec![json!(secret)],
            vec![json!({"command": 1})],
            vec![json!({"args": [secret]})],
            vec![spawn_async_args("true"), json!(secret)],
            vec![stray_timeout],
        ];
        for args in &wrong_spawn {
            for ctx in [None, Some(&ctx)] {
                let err = spawn_async_over(ctx, args).unwrap_err();
                assert_eq!(err, "launch_spawn_async:bad-args", "{args:?}");
                assert!(!err.contains(secret), "{args:?}");
            }
        }
        // An unknown key passes the generated decode and is the crate's to refuse, which needs the context: the same literal.
        let mut extra = spawn_async_args("true");
        extra["extra"] = json!(secret);
        let err = spawn_async_over(Some(&ctx), &[extra]).unwrap_err();
        assert_eq!(err, "launch_spawn_async:bad-args");
        assert!(!err.contains(secret));
        // A stream id with a path separator is refused by the crate with the same literal.
        let mut bad_id = spawn_async_args("true");
        bad_id["streamId"] = json!(secret);
        let err = spawn_async_over(Some(&ctx), &[bad_id]).unwrap_err();
        assert_eq!(err, "launch_spawn_async:bad-args");

        let wrong_kill: Vec<Vec<Value>> = vec![
            vec![],
            vec![json!(secret)],
            vec![json!({"runner": 1})],
            vec![json!({}), json!(secret)],
        ];
        for args in &wrong_kill {
            for ctx in [None, Some(&ctx)] {
                let err = tracked_kill_over(ctx, args).unwrap_err();
                assert_eq!(err, "launch_tracked_kill:bad-args", "{args:?}");
                assert!(!err.contains(secret), "{args:?}");
            }
        }
        // An unbounded name and an unknown key are the crate's to refuse.
        for bad in [
            json!({"runner": ""}),
            json!({"key": secret.repeat(40)}),
            json!({"x": 1}),
        ] {
            let err = tracked_kill_over(Some(&ctx), &[bad]).unwrap_err();
            assert_eq!(err, "launch_tracked_kill:bad-args");
            assert!(!err.contains(secret));
        }
        // The two queries take nothing: anything sent is the fixed literal, before and after the install.
        for args in [vec![json!(secret)], vec![json!({}), json!(1)]] {
            for ctx in [None, Some(&ctx)] {
                let err = tracked_kill_all_over(ctx, &args).unwrap_err();
                assert_eq!(err, "launch_tracked_kill_all:bad-args");
                let err = games_running_over(ctx, &args).unwrap_err();
                assert_eq!(err, "launch_games_running:bad-args");
                assert!(!err.contains(secret));
            }
        }
    }

    #[test]
    fn the_registry_arms_answer_nothing_running_over_an_empty_registry() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        assert_eq!(games_running_over(Some(&ctx), &[]), Ok(json!(false)));
        assert_eq!(tracked_kill_all_over(Some(&ctx), &[]), Ok(json!(0)));
        assert_eq!(tracked_kill_over(Some(&ctx), &[json!({})]), Ok(json!(0)));
        assert_eq!(
            tracked_kill_over(Some(&ctx), &[json!({"runner": "gog", "key": "none"})]),
            Ok(json!(0))
        );
    }

    #[cfg(unix)]
    #[test]
    fn the_spawn_async_arm_runs_a_real_program_and_answers_its_result() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let got = spawn_async_over(
            Some(&ctx),
            &[spawn_async_args("printf out; printf err >&2; exit 3")],
        )
        .unwrap();
        assert_eq!(
            got,
            json!({"code": 3, "stdout": "out", "stderr": "err", "timedOut": false, "aborted": false})
        );
        // A timeout the TypeScript held as NaN or Infinity arrives as null and is no timeout at all.
        let mut no_timeout = spawn_async_args("printf done");
        no_timeout["timeoutMs"] = Value::Null;
        let got = spawn_async_over(Some(&ctx), &[no_timeout]).unwrap();
        assert_eq!(got["stdout"], json!("done"), "{got}");
        assert_eq!(got["timedOut"], json!(false), "{got}");
        // A timeout ends the child and answers `timedOut` with a null code.
        let mut slow = spawn_async_args("sleep 30");
        slow["timeoutMs"] = json!(300);
        let got = spawn_async_over(Some(&ctx), &[slow]).unwrap();
        assert_eq!(got["timedOut"], json!(true), "{got}");
        assert_eq!(got["code"], Value::Null, "{got}");
    }

    #[cfg(unix)]
    #[test]
    fn a_program_that_cannot_start_is_the_spawn_async_dispatch_error_with_the_crates_text() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let mut call = spawn_async_args("true");
        call["command"] = json!(home.root().join("no-such-program").to_string_lossy());
        let err = spawn_async_over(Some(&ctx), &[call]).unwrap_err();
        assert!(!err.is_empty());
        assert!(
            !err.ends_with(":bad-args") && !err.ends_with(":not-ready"),
            "{err}"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_spawn_async_kill_by_stream_id_ends_that_call_with_aborted() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let mut call = spawn_async_args("sleep 30");
        call["streamId"] = json!("spawn-stream-1");
        let call_ctx = Arc::clone(&ctx);
        let run = std::thread::spawn(move || spawn_async_over(Some(&call_ctx), &[call]));
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
        while runner_kill_over(Some(&ctx), &[json!("spawn-stream-1")]) != Ok(json!(true)) {
            assert!(
                std::time::Instant::now() < deadline,
                "the call never registered"
            );
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        let got = run.join().unwrap().unwrap();
        assert_eq!(got["aborted"], json!(true), "{got}");
        assert_eq!(got["code"], Value::Null, "{got}");
    }

    /// A runner call that marks that it has started and then sleeps, tracked under `{ sideload, key }`, on a thread. The run
    /// is registered before its child is spawned, so the marker proves the registry holds it.
    #[cfg(unix)]
    fn sleeping_tracked_run(
        ctx: &Arc<LaunchCtx>,
        key: &str,
        marker: &std::path::Path,
    ) -> std::thread::JoinHandle<Result<Value, String>> {
        let mut call = runner_call_args(&format!("touch '{}'; sleep 30", marker.display()));
        call["trackKey"] = json!(key);
        let ctx = Arc::clone(ctx);
        std::thread::spawn(move || runner_call_over(Some(&ctx), &[call], host))
    }

    #[cfg(unix)]
    fn wait_for_markers(markers: &[std::path::PathBuf]) {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
        while !markers.iter().all(|marker| marker.exists()) {
            assert!(
                std::time::Instant::now() < deadline,
                "the runs never started"
            );
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
    }

    #[cfg(unix)]
    #[test]
    fn a_tracked_kill_ends_the_run_its_filter_names_and_a_kill_all_ends_the_rest() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let markers: Vec<std::path::PathBuf> = ["one", "two", "three"]
            .iter()
            .map(|name| home.root().join(format!("started-{name}")))
            .collect();
        let first = sleeping_tracked_run(&ctx, "key-one", &markers[0]);
        let second = sleeping_tracked_run(&ctx, "key-two", &markers[1]);
        let third = sleeping_tracked_run(&ctx, "key-three", &markers[2]);
        wait_for_markers(&markers);
        // The helper runs are not games.
        assert_eq!(games_running_over(Some(&ctx), &[]), Ok(json!(false)));

        // A filter that names nothing registered ends nothing.
        assert_eq!(
            tracked_kill_over(Some(&ctx), &[json!({"runner": "sideload", "key": "other"})]),
            Ok(json!(0))
        );
        // Both fields end one run, and only that run.
        assert_eq!(
            tracked_kill_over(
                Some(&ctx),
                &[json!({"runner": "sideload", "key": "key-one"})]
            ),
            Ok(json!(1))
        );
        let ended = first.join().unwrap().unwrap();
        assert!(
            ended.get("abort") == Some(&json!(true)) || ended["error"].is_string(),
            "{ended}"
        );
        assert!(!second.is_finished() && !third.is_finished());

        // A kill-all ends every run still registered and answers how many.
        assert_eq!(tracked_kill_all_over(Some(&ctx), &[]), Ok(json!(2)));
        for run in [second, third] {
            let ended = run.join().unwrap().unwrap();
            assert!(
                ended.get("abort") == Some(&json!(true)) || ended["error"].is_string(),
                "{ended}"
            );
        }
        assert_eq!(tracked_kill_all_over(Some(&ctx), &[]), Ok(json!(0)));
    }

    // ---- the manager hooks over the sidecar (88.2-18, D-26) ------------------------------------------

    use gamelib_launch::hooks::{HookError, ManagerHooks};
    use gamelib_launch::runner::RunnerName;
    use std::future::Future;

    /// Drives a future to its answer on the calling thread.
    fn block_on<F: Future>(future: F) -> F::Output {
        struct ThreadWaker(thread::Thread);
        impl std::task::Wake for ThreadWaker {
            fn wake(self: Arc<Self>) {
                self.0.unpark();
            }
        }
        let waker = std::task::Waker::from(Arc::new(ThreadWaker(thread::current())));
        let mut cx = std::task::Context::from_waker(&waker);
        let mut future = Box::pin(future);
        loop {
            if let std::task::Poll::Ready(out) = future.as_mut().poll(&mut cx) {
                return out;
            }
            thread::park_timeout(Duration::from_millis(50));
        }
    }

    /// What a scripted invoke saw: the channel, its arguments and the name of the thread it ran on.
    type Seen = Arc<Mutex<Vec<(String, Vec<Value>, Option<String>)>>>;

    /// An invoke that answers `reply` and records every call.
    fn scripted(reply: Result<Value, String>) -> (HookInvoke, Seen) {
        let seen: Seen = Arc::new(Mutex::new(Vec::new()));
        let recorder = Arc::clone(&seen);
        let invoke: HookInvoke = Arc::new(move |channel, args| {
            recorder.lock().unwrap().push((
                channel.to_string(),
                args,
                thread::current().name().map(str::to_string),
            ));
            reply.clone()
        });
        (invoke, seen)
    }

    #[test]
    fn game_title_asks_the_manager_call_channel_and_answers_the_decoded_title() {
        let (invoke, seen) = scripted(Ok(json!("Hades")));
        let hooks = SidecarManagerHooks::new(invoke);
        let title = block_on(hooks.game_title(RunnerName::Gog, "1234"));
        assert_eq!(title, Ok("Hades".to_string()));
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0].0, "launchManagerCall");
        assert_eq!(
            seen[0].1,
            vec![
                json!("game_title"),
                json!({ "runner": "gog", "appName": "1234" })
            ]
        );
    }

    #[test]
    fn force_uninstall_asks_its_op_and_accepts_any_success_reply() {
        for reply in [json!(null), json!(true), json!({ "done": 1 })] {
            let (invoke, seen) = scripted(Ok(reply));
            let hooks = SidecarManagerHooks::new(invoke);
            assert_eq!(
                block_on(hooks.force_uninstall(RunnerName::Legendary, "abc")),
                Ok(())
            );
            let seen = seen.lock().unwrap();
            assert_eq!(
                seen[0].1,
                vec![
                    json!("force_uninstall"),
                    json!({ "runner": "legendary", "appName": "abc" })
                ]
            );
        }
    }

    #[test]
    fn a_title_that_is_not_a_string_is_a_bad_reply() {
        let (invoke, _) = scripted(Ok(json!({ "title": "x" })));
        let hooks = SidecarManagerHooks::new(invoke);
        assert_eq!(
            block_on(hooks.game_title(RunnerName::Nile, "abc")),
            Err(HookError("bad-reply"))
        );
    }

    #[test]
    fn every_hook_call_runs_on_a_dedicated_named_thread() {
        let (invoke, seen) = scripted(Ok(json!("t")));
        let hooks = SidecarManagerHooks::new(invoke);
        let caller = thread::current().name().map(str::to_string);
        let _ = block_on(hooks.game_title(RunnerName::Gog, "1"));
        let _ = block_on(hooks.force_uninstall(RunnerName::Gog, "1"));
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 2);
        for call in seen.iter() {
            assert_eq!(call.2.as_deref(), Some("launch-manager-hook"));
            assert_ne!(call.2, caller);
        }
    }

    #[test]
    fn an_invoke_error_maps_to_a_hook_error_without_the_payload() {
        // The sidecar's own error text names the app and the runner; none of it may come back.
        let (invoke, _) = scripted(Err(
            "boom while asking secret-app-name for legendary at /home/someone".to_string(),
        ));
        let hooks = SidecarManagerHooks::new(invoke);
        let title = block_on(hooks.game_title(RunnerName::Legendary, "secret-app-name"));
        let forced = block_on(hooks.force_uninstall(RunnerName::Legendary, "secret-app-name"));
        assert_eq!(title, Err(HookError("sidecar")));
        assert_eq!(forced, Err(HookError("sidecar")));
        for shown in [format!("{title:?}"), format!("{forced:?}")] {
            for leaked in ["secret-app-name", "legendary", "boom", "/home/someone"] {
                assert!(!shown.contains(leaked), "{shown} leaked {leaked}");
            }
        }
    }

    #[test]
    fn a_thread_that_ends_without_answering_is_a_hook_error() {
        let invoke: HookInvoke = Arc::new(|_, _| panic!("the sidecar handle blew up"));
        let hooks = SidecarManagerHooks::new(invoke);
        assert_eq!(
            block_on(hooks.force_uninstall(RunnerName::Gog, "1")),
            Err(HookError("sidecar"))
        );
    }

    #[test]
    fn before_the_sidecar_exists_every_hook_is_a_hook_error() {
        // The shell's production invoke, in a unit test that never spawned a sidecar.
        let hooks = SidecarManagerHooks::new(Arc::new(sidecar_invoke));
        if store_dispatch::sidecar_state().is_none() {
            assert_eq!(
                block_on(hooks.game_title(RunnerName::Steam, "1")),
                Err(HookError("sidecar"))
            );
        }
    }

    /// The text of the part of `install` the shell composes its context in.
    fn install_source() -> &'static str {
        let source = include_str!("launch_dispatch.rs");
        let start = source.find("pub(crate) fn install(").unwrap();
        let end = start + source[start..].find("/// Runs `op` over `args`").unwrap();
        &source[start..end]
    }

    #[test]
    fn the_installed_context_carries_the_hooks_the_dialogs_and_the_default_error_handler() {
        let home = FakeHome::new("launch-shell-");
        let ctx = with_shell_hooks(ctx_built(&home, None));
        assert!(ctx.hooks.is_some(), "the shell context carries the hooks");
        // The runner's RunnerErrors default (None) is the 88.2-09 error_handler, which reads these hooks.
        assert!(ctx.errors.is_none());
        // `install` builds the real context from an AppHandle no unit test has, so its composition is pinned
        // as source: the dialogs (88.1) and the hooks (88.2-18) are both set before the context is stored.
        let install = install_source();
        assert!(install.contains(".with_dialogs(Arc::new(ShellDialogs"));
        assert!(install.contains("with_shell_hooks(ctx)"));
        assert!(!install.contains("with_errors("));
    }

    // ---- the hooks at sidecar EOF (T-88.2-28), over a real SidecarState ---------------------------------

    /// A real `SidecarState` over a child that reads stdin and never answers, killed when dropped. Unix only:
    /// the child is `sh`.
    #[cfg(unix)]
    struct SilentSidecar(Arc<SidecarState>);

    #[cfg(unix)]
    impl SilentSidecar {
        fn new() -> SilentSidecar {
            let mut child = std::process::Command::new("sh")
                .args(["-c", "cat >/dev/null"])
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
                .unwrap();
            let stdin = child.stdin.take().unwrap();
            SilentSidecar(Arc::new(SidecarState {
                stdin: Mutex::new(stdin),
                pending: Mutex::new(HashMap::new()),
                abandoned: Mutex::new(VecDeque::new()),
                counter: AtomicU64::new(1),
                child: Mutex::new(child),
                shutting_down: AtomicBool::new(false),
                eof_surfaced: AtomicBool::new(false),
                tree_reaped: AtomicBool::new(false),
                reader_done: shell_state::ReaderDone::default(),
            }))
        }

        /// Hooks whose invoke is this state's own `invoke`, the call the production hooks make.
        fn hooks(&self) -> SidecarManagerHooks {
            let state = Arc::clone(&self.0);
            SidecarManagerHooks::new(Arc::new(move |channel, args| {
                state.invoke(channel.to_string(), args)
            }))
        }
    }

    #[cfg(unix)]
    impl Drop for SilentSidecar {
        fn drop(&mut self) {
            let mut child = self.0.child.lock().unwrap_or_else(|e| e.into_inner());
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    /// Polls `condition` until it holds or five seconds pass.
    #[cfg(unix)]
    fn wait_until(condition: impl Fn() -> bool) -> bool {
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while std::time::Instant::now() < deadline {
            if condition() {
                return true;
            }
            thread::sleep(Duration::from_millis(5));
        }
        condition()
    }

    #[cfg(unix)]
    #[test]
    fn a_hook_pending_at_sidecar_eof_answers_an_error_inside_the_drain() {
        let sidecar = SilentSidecar::new();
        let state = Arc::clone(&sidecar.0);
        let hooks = sidecar.hooks();
        let (answered, answer) = std::sync::mpsc::channel();
        let caller = thread::spawn(move || {
            let _ = answered.send(block_on(
                hooks.game_title(RunnerName::Legendary, "pending-app"),
            ));
        });
        assert!(
            wait_until(|| state.pending.lock().unwrap().len() == 1),
            "the hook call never reached the pending table"
        );
        assert!(
            answer.try_recv().is_err(),
            "a hook the sidecar has not answered must still be waiting"
        );
        // The reader thread's EOF handling: every pending invoke is failed at once.
        let drained = drain_pending_invokes(&state.pending, &state.abandoned);
        assert_eq!(drained.len(), 1);
        assert_eq!(drained[0].1, "launchManagerCall");
        let answered = answer
            .recv_timeout(Duration::from_secs(5))
            .expect("the hook must answer inside the drain, not wait for the sidecar");
        assert_eq!(answered, Err(HookError("sidecar")));
        caller.join().unwrap();
    }

    /// A dialog source that answers every question with "Yes" and keeps the titles it was shown.
    #[cfg(unix)]
    struct YesDialogs(Mutex<Vec<String>>);

    #[cfg(unix)]
    impl LaunchDialogs for YesDialogs {
        fn ask(&self, title: &str, _message: &str, buttons: &[String]) -> Option<usize> {
            self.0.lock().unwrap().push(title.to_string());
            assert_eq!(buttons.len(), 2);
            Some(1)
        }
    }

    /// An engine log that keeps `(level, line)`.
    #[cfg(unix)]
    #[derive(Default)]
    struct LinesLog(Mutex<Vec<(&'static str, String)>>);

    #[cfg(unix)]
    impl gamelib_engine::sinks::EngineLog for LinesLog {
        fn info(&self, line: &str) {
            self.0.lock().unwrap().push(("info", line.to_string()));
        }
        fn warn(&self, line: &str) {
            self.0.lock().unwrap().push(("warn", line.to_string()));
        }
        fn error(&self, line: &str) {
            self.0.lock().unwrap().push(("error", line.to_string()));
        }
    }

    #[cfg(unix)]
    #[test]
    fn a_yes_over_hooks_the_sidecar_never_answers_writes_the_fixed_failure_line_and_is_not_success()
    {
        let home = FakeHome::new("launch-shell-");
        let sidecar = SilentSidecar::new();
        let dialogs = Arc::new(YesDialogs(Mutex::new(Vec::new())));
        let log = Arc::new(LinesLog::default());
        let ctx = ctx_built(&home, Some(log.clone()))
            .with_dialogs(dialogs.clone())
            .with_hooks(Arc::new(sidecar.hooks()));

        // The sidecar goes away: its EOF handling fails every pending invoke, over and over until the ask is done.
        let stop = Arc::new(AtomicBool::new(false));
        let state = Arc::clone(&sidecar.0);
        let flag = Arc::clone(&stop);
        let eof = thread::spawn(move || {
            while !flag.load(Ordering::SeqCst) {
                drain_pending_invokes(&state.pending, &state.abandoned);
                thread::sleep(Duration::from_millis(2));
            }
        });

        let (done, answer) = std::sync::mpsc::channel();
        let asker = thread::spawn(move || {
            let reply = gamelib_launch::dispatch_sync(
                "launch_ask_force_uninstall",
                &[json!({ "runner": "legendary", "appName": "some-app" })],
                &ctx,
            );
            let _ = done.send(reply);
        });
        let reply = answer.recv_timeout(Duration::from_secs(10));
        stop.store(true, Ordering::SeqCst);
        eof.join().unwrap();
        let reply = reply.expect("the ask must finish once the sidecar is gone");
        asker.join().unwrap();

        // The click was Yes, so the reply is the index; the uninstall behind it did not happen, and says so.
        assert_eq!(reply, Ok(json!(1)));
        // The title hook failed too, so the dialog took the app name.
        assert_eq!(*dialogs.0.lock().unwrap(), vec!["some-app".to_string()]);
        let lines = log.0.lock().unwrap().clone();
        assert!(
            lines.contains(&(
                "error",
                "forceUninstall hook failed (legendary)".to_string()
            )),
            "{lines:?}"
        );
        for (_, line) in &lines {
            assert!(!line.contains("some-app"), "{line}");
        }
    }

    #[test]
    fn the_ask_force_uninstall_arm_is_not_ready_before_the_install_and_rejects_a_wrong_call_the_same_way_after(
    ) {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let secret = "/Users/someone/secret-profile-path";
        assert_eq!(
            ask_force_uninstall_over(None, &[json!({"runner": "legendary", "appName": "a"})]),
            Err("launch_ask_force_uninstall:not-ready".to_string())
        );
        let wrong: Vec<Vec<Value>> = vec![
            vec![],
            vec![json!(secret)],
            vec![json!({"runner": "legendary"})],
            vec![json!({"appName": secret})],
            vec![json!({"runner": "epic", "appName": secret})],
            vec![json!({"runner": 1, "appName": secret})],
            vec![json!({"runner": "gog", "appName": secret}), json!(secret)],
        ];
        for args in &wrong {
            for ctx in [None, Some(&ctx)] {
                let err = ask_force_uninstall_over(ctx, args).unwrap_err();
                assert_eq!(err, "launch_ask_force_uninstall:bad-args", "{args:?}");
                assert!(!err.contains(secret), "{args:?}");
            }
        }
        // An unknown key passes the generated decode and is the crate's to refuse, which needs the context: the same literal.
        let err = ask_force_uninstall_over(
            Some(&ctx),
            &[json!({"runner": "gog", "appName": secret, "extra": 1})],
        )
        .unwrap_err();
        assert_eq!(err, "launch_ask_force_uninstall:bad-args");
        assert!(!err.contains(secret));
        // An app name the crate refuses (empty, or longer than its bound) is the same literal, after the install.
        for name in [String::new(), "a".repeat(257)] {
            let err =
                ask_force_uninstall_over(Some(&ctx), &[json!({"runner": "gog", "appName": name})])
                    .unwrap_err();
            assert_eq!(err, "launch_ask_force_uninstall:bad-args");
        }
    }

    // ---- the funnel over the shell (88.3-06, D-01, D-19, D-26) ---------------------------------------------

    /// What a per-op scripted invoke saw: the op of each `launchManagerCall` frame, in order, with its payload.
    type SeenOps = Arc<Mutex<Vec<(String, Value)>>>;

    /// An invoke that answers each funnel op from `answer` (the op and its payload in, the reply out) and keeps
    /// every frame it saw, checking the channel is the one the TS managers answer.
    fn scripted_ops(
        answer: impl Fn(&str, &Value) -> Result<Value, String> + Send + Sync + 'static,
    ) -> (HookInvoke, SeenOps) {
        let seen: SeenOps = Arc::new(Mutex::new(Vec::new()));
        let recorder = Arc::clone(&seen);
        let invoke: HookInvoke = Arc::new(move |channel, args| {
            assert_eq!(channel, "launchManagerCall");
            let op = args[0].as_str().expect("an op").to_string();
            let payload = args[1].clone();
            let reply = answer(&op, &payload);
            recorder.lock().unwrap().push((op, payload));
            reply
        });
        (invoke, seen)
    }

    fn launch_run_params(app_name: &str) -> Value {
        json!({ "appName": app_name, "runner": "sideload" })
    }

    fn no_host() -> Value {
        json!({})
    }

    #[test]
    fn launch_run_reaches_the_funnel_and_the_launch_hook() {
        let home = FakeHome::new("launch-shell-");
        // A native game whose install folder exists, so the funnel goes on to the launch.
        let install = home.root().join("games").join("alpha");
        std::fs::create_dir_all(&install).unwrap();
        let install_path = install.to_string_lossy().into_owned();
        let (invoke, seen) = scripted_ops(move |op, _| match op {
            "launch_facts" => Ok(json!({
                "gameInfo": {
                    "title": "Alpha",
                    "install": { "install_path": install_path, "platform": "linux" }
                },
                "settings": {},
                "isNative": true,
            })),
            "launch" => Ok(json!({ "launched": true, "rotated": false })),
            _ => Ok(json!(true)),
        });
        let ctx =
            Arc::new(ctx_built(&home, None).with_hooks(Arc::new(SidecarManagerHooks::new(invoke))));

        let answer = launch_run_over(Some(&ctx), &[launch_run_params("alpha")], no_host);
        assert_eq!(answer, Ok(json!({ "status": "done" })));

        let seen = seen.lock().unwrap();
        let ops: Vec<&str> = seen.iter().map(|(op, _)| op.as_str()).collect();
        assert_eq!(ops.first(), Some(&"launch_facts"), "{ops:?}");
        let launch_at = ops
            .iter()
            .position(|op| *op == "launch")
            .expect("the launch hook was called");
        assert!(launch_at > 0, "{ops:?}");
        // The facts were asked for this game, and the launch hook is told the game and the log's state.
        assert_eq!(
            seen[0].1,
            json!({ "runner": "sideload", "appName": "alpha" })
        );
        let payload = &seen[launch_at].1;
        assert_eq!(payload["runner"], json!("sideload"));
        assert_eq!(payload["appName"], json!("alpha"));
        assert_eq!(payload["log"]["target"]["appName"], json!("alpha"));
        // The Play sent no launch option, args or version-check flag, so none is in the frame (absent, not null).
        for absent in ["launchArguments", "args", "skipVersionCheck"] {
            assert!(
                payload.get(absent).is_none(),
                "{absent} must be left out: {payload}"
            );
        }
    }

    #[test]
    fn launch_run_is_not_ready_before_the_install_and_rejects_a_wrong_call_the_same_way_after() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        assert_eq!(
            launch_run_over(None, &[launch_run_params("alpha")], no_host),
            Err("launch_run:not-ready".to_string())
        );
        let secret = "SECRET-APP-NAME";
        let wrong: Vec<Vec<Value>> = vec![
            vec![],
            vec![json!("not an object")],
            vec![json!({ "runner": "legendary" })],
            vec![json!({ "appName": secret })],
            vec![json!({ "appName": secret, "runner": "epic" })],
            vec![json!({ "appName": secret, "runner": "gog", "args": "-windowed" })],
            vec![json!({ "appName": secret, "runner": "gog", "skipVersionCheck": "yes" })],
            vec![json!({ "appName": secret, "runner": "gog" }), json!(secret)],
        ];
        for args in &wrong {
            for ctx in [None, Some(&ctx)] {
                let err = launch_run_over(ctx, args, no_host).unwrap_err();
                assert_eq!(err, "launch_run:bad-args", "{args:?}");
                assert!(!err.contains(secret), "{args:?}");
            }
        }
        // An unknown key passes the generated decode and is the crate's to refuse, which needs the context.
        let err = launch_run_over(
            Some(&ctx),
            &[json!({ "appName": secret, "runner": "gog", "extra": 1 })],
            no_host,
        )
        .unwrap_err();
        assert_eq!(err, "launch_run:bad-args");
        assert!(!err.contains(secret));
        // An app name the crate refuses (empty, or longer than its bound), and a host it does not know.
        for name in [String::new(), "a".repeat(257)] {
            let err = launch_run_over(
                Some(&ctx),
                &[json!({ "appName": name, "runner": "gog" })],
                no_host,
            )
            .unwrap_err();
            assert_eq!(err, "launch_run:bad-args");
        }
        let err = launch_run_over(
            Some(&ctx),
            &[launch_run_params("alpha")],
            || json!({ "other": 1 }),
        )
        .unwrap_err();
        assert_eq!(err, "launch_run:bad-args");
    }

    #[test]
    fn the_funnel_host_carries_the_runner_host_and_the_wine_host_and_the_crate_accepts_it() {
        let host = funnel_host();
        assert!(host["runner"]["env"].is_object());
        assert!(host["runner"]["path"].is_string());
        assert!(host["wine"]["env"].is_object());
        // The crate's strict decode takes exactly this shape, so a real call is not refused for its host.
        let decoded: gamelib_launch::funnel::FunnelHost = serde_json::from_value(host).unwrap();
        assert!(!decoded.runner.env.is_empty());
    }

    /// One funnel hook op: what it sends, what a good reply decodes to and what a wrong one is called.
    macro_rules! funnel_hook_op_test {
        ($name:ident, $op:expr, $payload:expr, $good:expr, $wrong:expr, $call:expr) => {
            #[test]
            fn $name() {
                let call: fn(&SidecarManagerHooks) -> Result<(), HookError> = $call;
                // A good reply: the frame is `[op, payload]` on `launchManagerCall`, from a thread of its own.
                let (invoke, seen) = scripted(Ok($good));
                assert_eq!(call(&SidecarManagerHooks::new(invoke)), Ok(()));
                {
                    let seen = seen.lock().unwrap();
                    assert_eq!(seen.len(), 1);
                    assert_eq!(seen[0].0, "launchManagerCall");
                    assert_eq!(seen[0].1, vec![json!($op), $payload]);
                    assert_eq!(seen[0].2.as_deref(), Some("launch-manager-hook"));
                }
                // The sidecar's error is the fixed word `sidecar`, never its text, the runner or the app name.
                let (invoke, _) = scripted(Err("boom SECRET-APP-NAME legendary".to_string()));
                let err = call(&SidecarManagerHooks::new(invoke)).unwrap_err();
                assert_eq!(err, HookError("sidecar"));
                // A reply of the wrong shape is the fixed word `bad-reply`.
                let (invoke, _) = scripted(Ok($wrong));
                assert_eq!(
                    call(&SidecarManagerHooks::new(invoke)),
                    Err(HookError("bad-reply"))
                );
            }
        };
    }

    funnel_hook_op_test!(
        launch_facts_sends_runner_and_app_and_decodes_the_facts_strictly,
        "launch_facts",
        json!({ "runner": "gog", "appName": "app" }),
        json!({ "gameInfo": {}, "settings": {}, "isNative": true, "global": { "minimizeOnLaunch": true } }),
        json!({ "gameInfo": {}, "settings": {}, "unknownKey": 1 }),
        |hooks| block_on(hooks.launch_facts(RunnerName::Gog, "app")).map(|_| ())
    );

    fn launch_hook_args(with_options: bool) -> gamelib_launch::hooks::LaunchHookArgs {
        gamelib_launch::hooks::LaunchHookArgs {
            launch_arguments: with_options.then(|| json!({ "type": "basic", "name": "Windowed" })),
            args: with_options.then(|| vec!["-windowed".to_string()]),
            skip_version_check: with_options.then_some(true),
            log: gamelib_launch::funnel::log::LogHandOffWire {
                target: gamelib_launch::funnel::log::LogTargetWire {
                    kind: "game",
                    app_name: "app".to_string(),
                    runner: "gog",
                    log_type: "launch",
                },
                disabled: false,
                rotate: true,
            },
        }
    }

    funnel_hook_op_test!(
        launch_sends_the_play_arguments_and_the_log_state_and_decodes_the_reply_strictly,
        "launch",
        json!({
            "runner": "gog",
            "appName": "app",
            "launchArguments": { "type": "basic", "name": "Windowed" },
            "args": ["-windowed"],
            "skipVersionCheck": true,
            "log": {
                "target": { "kind": "game", "appName": "app", "runner": "gog", "type": "launch" },
                "disabled": false,
                "rotate": true
            }
        }),
        json!({ "launched": true, "rotated": true }),
        json!({ "launched": "yes" }),
        |hooks| block_on(hooks.launch(RunnerName::Gog, "app", launch_hook_args(true))).map(|_| ())
    );

    #[test]
    fn launch_leaves_out_what_the_play_did_not_send_and_answers_a_launched_game() {
        let payload = launch_payload(RunnerName::Gog, "app", &launch_hook_args(false));
        assert_eq!(
            payload,
            json!({
                "runner": "gog",
                "appName": "app",
                "log": {
                    "target": { "kind": "game", "appName": "app", "runner": "gog", "type": "launch" },
                    "disabled": false,
                    "rotate": true
                }
            })
        );
        // `rotated` may be left out of the reply (it means "not claimed").
        let (invoke, _) = scripted(Ok(json!({ "launched": false })));
        let reply = block_on(SidecarManagerHooks::new(invoke).launch(
            RunnerName::Gog,
            "app",
            launch_hook_args(false),
        ));
        assert_eq!(
            reply,
            Ok(gamelib_launch::hooks::LaunchHookReply {
                launched: false,
                rotated: false
            })
        );
    }

    funnel_hook_op_test!(
        sync_saves_sends_the_direction_flag_and_the_saves_settings_and_decodes_an_acknowledgement,
        "sync_saves",
        json!({
            "runner": "gog",
            "appName": "app",
            "direction": "--skip-upload",
            "savesPath": "/saves",
            "gogSaves": []
        }),
        json!(true),
        json!("done"),
        |hooks| block_on(hooks.sync_saves(
            RunnerName::Gog,
            "app",
            gamelib_launch::hooks::SyncSavesArgs {
                direction: gamelib_launch::hooks::SyncDirection::SkipUpload,
                saves_path: json!("/saves"),
                gog_saves: json!([]),
            },
        ))
    );

    #[test]
    fn a_sync_that_threw_is_the_word_failed_and_the_upload_flag_is_skip_download() {
        let (invoke, seen) = scripted(Ok(json!(false)));
        let reply = block_on(SidecarManagerHooks::new(invoke).sync_saves(
            RunnerName::Legendary,
            "app",
            gamelib_launch::hooks::SyncSavesArgs {
                direction: gamelib_launch::hooks::SyncDirection::SkipDownload,
                saves_path: Value::Null,
                gog_saves: Value::Null,
            },
        ));
        assert_eq!(reply, Err(HookError("failed")));
        assert_eq!(
            seen.lock().unwrap()[0].1[1]["direction"],
            json!("--skip-download")
        );
    }

    funnel_hook_op_test!(
        set_presence_sends_runner_and_app_and_decodes_an_acknowledgement,
        "set_presence",
        json!({ "runner": "gog", "appName": "app" }),
        json!(true),
        json!({ "ok": true }),
        |hooks| block_on(hooks.set_presence(RunnerName::Gog, "app"))
    );

    funnel_hook_op_test!(
        clear_presence_sends_the_runner_only_and_decodes_an_acknowledgement,
        "clear_presence",
        json!({ "runner": "gog" }),
        json!(true),
        json!(null),
        |hooks| block_on(hooks.clear_presence(RunnerName::Gog))
    );

    funnel_hook_op_test!(
        persist_bottle_wine_version_sends_the_wine_and_decodes_an_acknowledgement,
        "persist_bottle_wine_version",
        json!({ "runner": "steam", "appName": "1", "wine": { "name": "w", "bin": "/w", "type": "wine" } }),
        json!(true),
        json!("ok"),
        |hooks| block_on(hooks.persist_bottle_wine_version(
            RunnerName::Steam,
            "1",
            json!({ "name": "w", "bin": "/w", "type": "wine" }),
        ))
    );

    #[test]
    fn a_store_that_defines_no_presence_or_bottle_hook_is_unavailable_not_a_failure() {
        let (invoke, _) = scripted(Ok(json!(false)));
        let hooks = SidecarManagerHooks::new(invoke);
        assert_eq!(
            block_on(hooks.set_presence(RunnerName::Legendary, "app")),
            Err(HookError("unavailable"))
        );
        assert_eq!(
            block_on(hooks.clear_presence(RunnerName::Legendary)),
            Err(HookError("unavailable"))
        );
        assert_eq!(
            block_on(hooks.persist_bottle_wine_version(RunnerName::Steam, "1", json!(null))),
            Err(HookError("unavailable"))
        );
    }

    funnel_hook_op_test!(
        update_gog_playtime_sends_the_instants_and_decodes_an_acknowledgement,
        "update_gog_playtime",
        json!({ "appName": "app", "start": "2026-01-01T00:00:00.000Z", "end": "2026-01-01T01:00:00.000Z" }),
        json!(true),
        json!(false),
        |hooks| block_on(hooks.update_gog_playtime(
            "app",
            "2026-01-01T00:00:00.000Z",
            "2026-01-01T01:00:00.000Z",
        ))
    );

    funnel_hook_op_test!(
        wine_settings_write_sends_the_two_wine_values_and_decodes_an_acknowledgement,
        "wine_settings_write",
        json!({ "appName": "app", "global": { "name": "g" }, "game": { "name": "w" } }),
        json!(true),
        json!(null),
        |hooks| block_on(hooks.wine_settings_write(
            "app",
            gamelib_launch::hooks::WineSettingsWrite {
                global: Some(json!({ "name": "g" })),
                game: Some(json!({ "name": "w" })),
            },
        ))
    );

    #[test]
    fn a_wine_write_with_only_the_game_value_leaves_the_global_key_out() {
        let (invoke, seen) = scripted(Ok(json!(true)));
        let write = gamelib_launch::hooks::WineSettingsWrite {
            global: None,
            game: Some(json!({ "name": "w" })),
        };
        let reply = block_on(SidecarManagerHooks::new(invoke).wine_settings_write("app", write));
        assert_eq!(reply, Ok(()));
        assert_eq!(
            seen.lock().unwrap()[0].1[1],
            json!({ "appName": "app", "game": { "name": "w" } })
        );
    }

    #[test]
    fn a_funnel_hook_whose_thread_ends_without_answering_is_an_error_not_a_hang() {
        let invoke: HookInvoke = Arc::new(|_, _| panic!("the sidecar handle blew up"));
        let hooks = SidecarManagerHooks::new(invoke);
        assert_eq!(
            block_on(hooks.launch(RunnerName::Gog, "app", launch_hook_args(false))),
            Err(HookError("sidecar"))
        );
        assert_eq!(
            block_on(hooks.launch_facts(RunnerName::Gog, "app")),
            Err(HookError("sidecar"))
        );
    }

    #[test]
    fn the_installed_context_carries_the_funnel_shell_over_the_shells_own_functions() {
        // `install` builds the context from an AppHandle no unit test has, so its composition is pinned as source.
        let install = install_source();
        assert!(install.contains("with_shell_hooks(ctx)"));
        assert!(install.contains(".with_shell(Arc::new(ShellFunnel"));
        // ShellFunnel is the shell's own functions: the window, the wake lock, and the graceful exit.
        let source = include_str!("launch_dispatch.rs");
        let start = source
            .find("impl gamelib_launch::funnel::shell::FunnelShell for ShellFunnel")
            .unwrap();
        let end = start
            + source[start..]
                .find("/// The hooks the shell's launch context carries")
                .unwrap();
        let shell = &source[start..end];
        for call in [
            "app_lifecycle::rpc_main_window_hide(&self.app)",
            "wake_lock::wake_lock_start(kind)",
            "wake_lock::wake_lock_stop(id)",
            "app_lifecycle::rpc_app_exit(&self.app)",
        ] {
            assert!(shell.contains(call), "{call}");
        }
        // A failed hide or wake lock is a fixed line and never an error of the launch.
        assert_eq!(shell.matches("shell_log(\"launch funnel: ").count(), 3);
    }

    type FlightOver = fn(Option<&Arc<LaunchCtx>>, &[Value]) -> Result<Value, String>;

    fn flight_key() -> Value {
        json!({ "runner": "steam", "appName": "480" })
    }

    #[test]
    fn flight_begin_then_end_releases() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let led = flight_begin_over(Some(&ctx), &[flight_key()]).unwrap();
        let id = led["lead"]
            .as_str()
            .expect("the first caller leads")
            .to_string();
        assert_eq!(id.len(), 32);
        assert_eq!(ctx.flights.len(), 1);
        // A second caller of the same key joins; a different key leads on its own.
        assert_eq!(
            flight_begin_over(Some(&ctx), &[flight_key()]).unwrap(),
            json!({ "join": true })
        );
        let other = flight_begin_over(
            Some(&ctx),
            &[json!({ "runner": "legendary", "appName": "480" })],
        )
        .unwrap();
        assert!(other["lead"].is_string());
        assert_eq!(ctx.flights.len(), 2);

        // An id nobody minted releases nothing; the real id settles and releases its key only.
        let forged = json!({ "flightId": "0".repeat(32), "result": true });
        assert_eq!(
            flight_end_over(Some(&ctx), &[forged]).unwrap(),
            json!(false)
        );
        assert_eq!(ctx.flights.len(), 2);
        let end = json!({ "flightId": id, "result": true });
        assert_eq!(
            flight_end_over(Some(&ctx), std::slice::from_ref(&end)).unwrap(),
            json!(true)
        );
        assert_eq!(ctx.flights.len(), 1);
        assert_eq!(
            flight_end_over(Some(&ctx), &[end]).unwrap(),
            json!(false),
            "ended once"
        );
        // The key is free: the next caller leads again.
        let again = flight_begin_over(Some(&ctx), &[flight_key()]).unwrap();
        assert!(again["lead"].is_string());
    }

    #[test]
    fn a_wait_answers_the_leaders_value() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let led = flight_begin_over(Some(&ctx), &[flight_key()]).unwrap();
        let id = led["lead"].as_str().unwrap().to_string();
        let (answered, answer) = std::sync::mpsc::channel();
        let waiter = {
            let ctx = Arc::clone(&ctx);
            thread::spawn(move || {
                let _ = answered.send(flight_wait_over(Some(&ctx), &[flight_key()]));
            })
        };
        assert!(
            answer.recv_timeout(Duration::from_millis(150)).is_err(),
            "a joiner waits while the leader is in flight"
        );
        flight_end_over(
            Some(&ctx),
            &[json!({ "flightId": id, "result": { "ok": 1 } })],
        )
        .unwrap();
        let got = answer
            .recv_timeout(Duration::from_secs(5))
            .expect("the joiner answers");
        assert_eq!(got, Ok(json!({ "ok": 1 })));
        waiter.join().unwrap();
    }

    #[test]
    fn a_wait_on_a_sidecar_flight_answers_abandoned_after_sidecar_eof() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        flight_begin_over(Some(&ctx), &[flight_key()]).unwrap();
        let (answered, answer) = std::sync::mpsc::channel();
        let waiter = {
            let ctx = Arc::clone(&ctx);
            thread::spawn(move || {
                let _ = answered.send(flight_wait_over(Some(&ctx), &[flight_key()]));
            })
        };
        assert!(
            answer.recv_timeout(Duration::from_millis(150)).is_err(),
            "the joiner is waiting on a leader that has not ended"
        );
        // The reader thread's EOF handling: the sidecar-led flights are released.
        assert_eq!(release_sidecar_flights_over(Some(&ctx)), 1);
        let got = answer
            .recv_timeout(Duration::from_secs(5))
            .expect("the joiner must answer at the release, not wait for ever");
        assert_eq!(got, Ok(json!("abandoned")));
        waiter.join().unwrap();
        assert!(ctx.flights.is_empty(), "the key is given back");
        // Nothing left to release, and no context is a no-op.
        assert_eq!(release_sidecar_flights_over(Some(&ctx)), 0);
        assert_eq!(release_sidecar_flights_over(None), 0);
    }

    #[test]
    fn the_sidecar_eof_path_releases_the_flights_right_after_failing_the_pending_invokes() {
        // The reader thread is a closure over a live child no unit test has, so the order is pinned as source.
        let source = include_str!("sidecar.rs");
        let drain = source
            .find("drain_pending_invokes(&state.pending, &state.abandoned)")
            .expect("the EOF path drains the pending invokes");
        let release = source
            .find("launch_dispatch::release_sidecar_flights()")
            .expect("the EOF path releases the sidecar-led launch flights");
        assert!(
            drain < release,
            "released after the pending invokes are failed"
        );
        let cancel_jobs = source.find("on_sidecar_eof_cancel_jobs();").unwrap();
        assert!(release < cancel_jobs, "released before the slow teardown");
    }

    #[test]
    fn the_flight_arms_are_not_ready_before_the_install_and_reject_a_wrong_call_the_same_way_after()
    {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let secret = "SECRET-FLIGHT-KEY";
        assert_eq!(
            flight_begin_over(None, &[flight_key()]),
            Err("launch_flight_begin:not-ready".to_string())
        );
        assert_eq!(
            flight_wait_over(None, &[flight_key()]),
            Err("launch_flight_wait:not-ready".to_string())
        );
        assert_eq!(
            flight_end_over(
                None,
                &[json!({ "flightId": "a".repeat(32), "result": true })]
            ),
            Err("launch_flight_end:not-ready".to_string())
        );

        let wrong_key: Vec<Vec<Value>> = vec![
            vec![],
            vec![json!(secret)],
            vec![json!({})],
            vec![json!({ "runner": secret })],
            vec![json!({ "appName": secret })],
            vec![json!({ "runner": 1, "appName": secret })],
            vec![flight_key(), json!(secret)],
        ];
        for args in &wrong_key {
            for ctx in [None, Some(&ctx)] {
                for (op, over) in [
                    ("launch_flight_begin", flight_begin_over as FlightOver),
                    ("launch_flight_wait", flight_wait_over as FlightOver),
                ] {
                    let err = over(ctx, args).unwrap_err();
                    assert_eq!(err, format!("{op}:bad-args"), "{args:?}");
                    assert!(!err.contains(secret), "{args:?}");
                }
            }
        }
        // An unknown key and a name the crate bounds (empty, a path separator) are the crate's to refuse, which needs the context.
        for bad in [
            json!({ "runner": "steam", "appName": "1", "extra": secret }),
            json!({ "runner": "steam", "appName": "" }),
            json!({ "runner": "a/b", "appName": secret }),
        ] {
            for (op, over) in [
                ("launch_flight_begin", flight_begin_over as FlightOver),
                ("launch_flight_wait", flight_wait_over as FlightOver),
            ] {
                let err = over(Some(&ctx), std::slice::from_ref(&bad)).unwrap_err();
                assert_eq!(err, format!("{op}:bad-args"));
                assert!(!err.contains(secret));
            }
        }
        assert!(ctx.flights.is_empty(), "no refused call led a flight");

        let wrong_end: Vec<Vec<Value>> = vec![
            vec![],
            vec![json!(secret)],
            vec![json!({})],
            vec![json!({ "flightId": "a".repeat(32) })],
            vec![json!({ "result": true })],
            vec![json!({ "flightId": 7, "result": true })],
            vec![
                json!({ "flightId": "a".repeat(32), "result": true }),
                json!(secret),
            ],
        ];
        for args in &wrong_end {
            for ctx in [None, Some(&ctx)] {
                let err = flight_end_over(ctx, args).unwrap_err();
                assert_eq!(err, "launch_flight_end:bad-args", "{args:?}");
                assert!(!err.contains(secret), "{args:?}");
            }
        }
        // A flight id of the wrong shape, an unknown key and an uppercase id are the crate's to refuse.
        for bad in [
            json!({ "flightId": secret, "result": true }),
            json!({ "flightId": "A".repeat(32), "result": true }),
            json!({ "flightId": "a".repeat(32), "result": true, "extra": secret }),
        ] {
            let err = flight_end_over(Some(&ctx), &[bad]).unwrap_err();
            assert_eq!(err, "launch_flight_end:bad-args");
            assert!(!err.contains(secret));
        }
    }

    // ---- re-adoption at boot and its announcement (88.3-12) ------------------------------------------

    /// What the renderer would have been pushed.
    #[derive(Default)]
    struct Pushed(std::sync::Mutex<Vec<(String, Vec<Value>)>>);

    impl Pushed {
        fn statuses(&self) -> Vec<Value> {
            self.0
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .iter()
                .filter(|(channel, _)| channel == "gameStatusUpdate")
                .flat_map(|(_, args)| args.clone())
                .collect()
        }
    }

    impl gamelib_core::emitter::FrontendEmitter for Pushed {
        fn emit(&self, channel: &str, args: Vec<Value>) {
            self.0
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .push((channel.to_string(), args));
        }
    }

    /// Ends the game it names when dropped, on a pass or a panic.
    #[cfg(unix)]
    struct Stray(u32, Option<u64>);

    #[cfg(unix)]
    impl Drop for Stray {
        fn drop(&mut self) {
            if let Some(stamp) = self.1 {
                let _ = gamelib_proc::kill_tree::kill_game_tree(
                    self.0,
                    stamp,
                    std::time::Duration::from_millis(500),
                );
            }
        }
    }

    #[test]
    fn the_readoption_arm_is_not_ready_before_the_install_and_rejects_a_wrong_call_the_same_way_after(
    ) {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        assert_eq!(
            readopted_announce_over(None, &[]),
            Err("launch_readopted_announce:not-ready".to_string())
        );
        // Nothing adopted: the announcement says so and marks the context.
        assert_eq!(readopted_announce_over(Some(&ctx), &[]), Ok(json!(0)));
        let secret = "/Users/someone/secret-profile-path";
        for args in [
            vec![json!(secret)],
            vec![json!({ "appName": secret })],
            vec![Value::Null],
        ] {
            for ctx in [None, Some(&ctx)] {
                let err = readopted_announce_over(ctx, &args).unwrap_err();
                assert_eq!(err, "launch_readopted_announce:bad-args", "{args:?}");
                assert!(!err.contains(secret));
            }
        }
    }

    #[test]
    fn the_boot_call_is_one_named_thread_started_right_after_the_install() {
        let main = include_str!("main.rs");
        let setup = main
            .split("fn run_setup(")
            .nth(1)
            .expect("run_setup is in main.rs");
        assert_eq!(
            setup.matches("launch_dispatch::start_readoption()").count(),
            1
        );
        let install = setup
            .find("launch_dispatch::install(app.handle())")
            .expect("run_setup installs the launch context");
        let start = setup
            .find("launch_dispatch::start_readoption()")
            .expect("run_setup starts re-adoption");
        assert!(install < start, "re-adoption starts after the install");
        // Setup never waits for the scan: it runs on its own named thread.
        let source = include_str!("launch_dispatch.rs");
        let body = source
            .split("pub(crate) fn start_readoption()")
            .nth(1)
            .and_then(|rest| rest.split("\n}\n").next())
            .expect("start_readoption is in launch_dispatch.rs");
        assert!(body.contains("\"launch-readopt\""), "{body}");
        assert!(body.contains(".spawn("), "{body}");
        assert!(!body.contains(".join("), "setup must not wait for the scan");
    }

    #[test]
    fn the_boot_scan_without_an_install_does_nothing() {
        // The shell's context is a process-wide static no unit test installs, so the call is a no-op here.
        assert!(launch_ctx().is_none());
        start_readoption();
    }

    #[cfg(unix)]
    #[test]
    fn a_surviving_game_is_adopted_at_boot_announced_and_killed_by_the_quit() {
        use gamelib_launch::game::record::{
            read_record, record_path, write_atomic, LaunchRecord, RecordState, RECORD_VERSION,
        };
        let home = FakeHome::new("launch-shell-");
        let pushed = Arc::new(Pushed::default());
        let ctx = Arc::new(ctx_built_with(&home, None, Some(pushed.clone())));

        // The game an earlier GameLib started: its own session, its leader and start stamp the proof. The handle is
        // dropped without waiting, as a crash drops it.
        let mut cmd = std::process::Command::new("sleep");
        cmd.arg("300")
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        let handle = gamelib_proc::spawn_game_tracked(cmd, None).expect("spawn the game");
        let (pid, stamp) = (handle.pid, handle.stamp.expect("the game's start stamp"));
        let _stray = Stray(pid, Some(stamp));
        drop(handle);

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock")
            .as_millis() as u64;
        let app_folder = home.root().join("app");
        let path = record_path(&app_folder, RunnerName::Sideload, "survivor");
        write_atomic(
            &path,
            &LaunchRecord {
                version: RECORD_VERSION,
                runner: "sideload".to_string(),
                app_name: "survivor".to_string(),
                pid,
                stamp,
                pgid: pid,
                members: Vec::new(),
                launch_started_at_ms: now.saturating_sub(5_000),
                start_playing_at_ms: now.saturating_sub(4_000),
                state: RecordState::Running,
                killed_at_ms: None,
                after_script: None,
            },
        )
        .expect("the record is written");

        // The boot scan, the way `start_readoption` runs it (on a plain thread, as the named one is).
        let scan = {
            let ctx = Arc::clone(&ctx);
            std::thread::spawn(move || readopt_over(&ctx, &Default::default()))
        };
        scan.join().expect("the scan thread");

        // Nothing is announced before the renderer listens; then the announce answers one game, as Playing.
        assert!(pushed.statuses().is_empty(), "{:?}", pushed.statuses());
        assert_eq!(readopted_announce_over(Some(&ctx), &[]), Ok(json!(1)));
        assert_eq!(
            pushed.statuses(),
            vec![json!({ "appName": "survivor", "runner": "sideload", "status": "playing" })]
        );
        // The quit dialog sees it.
        assert_eq!(games_running_over(Some(&ctx), &[]), Ok(json!(true)));
        assert!(gamelib_proc::probe::is_alive(pid));

        // The quit's kill ends it through its proof, and its record is owed (`quitKilled`).
        assert_eq!(tracked_kill_all_over(Some(&ctx), &[]), Ok(json!(1)));
        assert!(
            wait_until(|| !gamelib_proc::probe::is_alive(pid)),
            "the game was not ended"
        );
        assert!(
            wait_until(
                || read_record(&path).is_ok_and(|record| record.state == RecordState::QuitKilled)
            ),
            "the record never read quitKilled"
        );
        assert!(
            wait_until(|| games_running_over(Some(&ctx), &[]) == Ok(json!(false))),
            "the registry still holds the game"
        );
    }
}
