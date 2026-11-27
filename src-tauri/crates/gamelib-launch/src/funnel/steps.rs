//! The in-process steps the launch funnel runs (88.3-04, D-01, D-26): the engine selection, the Wine check, the
//! force-uninstall question, the launch scripts and the recent-games write.
//!
//! In the TS funnel each of these was a call over `rustInvoke` (a `launch_*` or `engine_*` op) from the
//! sidecar into Rust. Now that the funnel is Rust, each is a direct call into the function behind that op, and
//! [`FunnelSteps`] is the one place the funnel names them. [`CtxFunnelSteps`] is the production implementation
//! and a test sets [`testing::RecordingSteps`], which answers from a golden case's recorded replies.

use std::future::Future;
use std::pin::Pin;

use gamelib_engine::launch::step::{
    end_engine_launch, select_engine_for_launch, CtxStepDeps, SelectArgs, SelectReply,
};
use gamelib_info::recent::{self, AddArgs};
use gamelib_wine::wine_cmd::WineHost;

use crate::ctx::LaunchCtx;
use crate::prepare::check_wine::{check_wine_before_launch, CheckWineArgs, CheckWineReply};
use crate::prepare::deps::CtxPrepareDeps;
use crate::runner::call_runner::RunnerHost;
use crate::runner::error_handler::ask_force_uninstall;
use crate::runner::script::{run_script_for_game, ScriptRunArgs};
use crate::runner::RunnerName;

/// A future that may borrow the context and the arguments it runs over.
pub type Fut<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// The steps of one launch that run in this process.
pub trait FunnelSteps: Send + Sync {
    /// `engine_launch_select`: selects and prepares the engine for the launch (a skip when it does not apply).
    fn select_engine<'a>(
        &'a self,
        ctx: &'a LaunchCtx,
        args: &'a SelectArgs,
    ) -> Fut<'a, SelectReply>;

    /// `engine_launch_end`: the launch is over, so the engine's watch, overlay, deadline and ledger entry go.
    fn end_engine(&self, ctx: &LaunchCtx, key: &str);

    /// `launch_check_wine_before_launch`. `Err` is a fixed reason word.
    fn check_wine<'a>(
        &'a self,
        ctx: &'a LaunchCtx,
        args: CheckWineArgs,
        host: &'a WineHost,
    ) -> Fut<'a, Result<CheckWineReply, &'static str>>;

    /// `launch_ask_force_uninstall`: the index of the clicked button, `None` for a dismissal.
    fn ask_force_uninstall<'a>(
        &'a self,
        ctx: &'a LaunchCtx,
        runner: RunnerName,
        app_name: &'a str,
    ) -> Fut<'a, Option<usize>>;

    /// `launch_script_run`: a before or after launch script. `Err` is the text of a program that could not start.
    fn run_script<'a>(
        &'a self,
        ctx: &'a LaunchCtx,
        args: ScriptRunArgs,
        host: &'a RunnerHost,
    ) -> Fut<'a, Result<bool, String>>;

    /// `info_recent_add`: puts the game first in the recent-games list. `Err` is a fixed op reason.
    fn recent_add(&self, ctx: &LaunchCtx, args: AddArgs) -> Result<(), String>;
}

/// The production steps: each one the real function, over the context it is given.
#[derive(Debug, Default, Clone, Copy)]
pub struct CtxFunnelSteps;

impl FunnelSteps for CtxFunnelSteps {
    fn select_engine<'a>(
        &'a self,
        ctx: &'a LaunchCtx,
        args: &'a SelectArgs,
    ) -> Fut<'a, SelectReply> {
        Box::pin(async move { select_engine_for_launch(&ctx.engine, &CtxStepDeps, args).await })
    }

    fn end_engine(&self, ctx: &LaunchCtx, key: &str) {
        end_engine_launch(&ctx.engine, key);
    }

    fn check_wine<'a>(
        &'a self,
        ctx: &'a LaunchCtx,
        args: CheckWineArgs,
        host: &'a WineHost,
    ) -> Fut<'a, Result<CheckWineReply, &'static str>> {
        Box::pin(async move {
            let deps = CtxPrepareDeps::new(ctx, host);
            check_wine_before_launch(ctx, &deps, args, host).await
        })
    }

    fn ask_force_uninstall<'a>(
        &'a self,
        ctx: &'a LaunchCtx,
        runner: RunnerName,
        app_name: &'a str,
    ) -> Fut<'a, Option<usize>> {
        Box::pin(async move { ask_force_uninstall(ctx, runner, app_name).await })
    }

    fn run_script<'a>(
        &'a self,
        ctx: &'a LaunchCtx,
        args: ScriptRunArgs,
        host: &'a RunnerHost,
    ) -> Fut<'a, Result<bool, String>> {
        Box::pin(async move { run_script_for_game(ctx, args, host).await })
    }

    fn recent_add(&self, ctx: &LaunchCtx, args: AddArgs) -> Result<(), String> {
        recent::add(&ctx.info, args)
    }
}

#[cfg(feature = "testing")]
pub mod testing {
    use std::sync::Mutex;

    use serde_json::{json, Value};

    use super::*;
    use crate::funnel::testing::Tape;
    use gamelib_engine::launch::step::SelectKind;

    /// One call a [`RecordingSteps`] saw.
    #[derive(Debug, Clone, PartialEq)]
    pub enum StepCall {
        SelectEngine(Value),
        EndEngine(String),
        CheckWine {
            app_name: String,
        },
        AskForceUninstall {
            runner: RunnerName,
            app_name: String,
        },
        RunScript {
            script_path: String,
        },
        RecentAdd(Value),
    }

    /// Steps that answer from a script (by default: the engine layer skips, the Wine check passes, the dialog
    /// is dismissed, a script runs and the recent-games write succeeds) and record every call, in order.
    ///
    /// With a tape the select and the recent-games write also appear in the TS recorder's `rust` event shape
    /// (`{ kind, channel, args, reply }`), with the args as the TS sent them over `rustInvoke`, so a golden case's
    /// events compare against them.
    pub struct RecordingSteps {
        select: SelectReply,
        recent_add: Result<(), String>,
        ask: Option<usize>,
        script: Result<bool, String>,
        calls: Mutex<Vec<StepCall>>,
        tape: Option<Tape>,
    }

    impl Default for RecordingSteps {
        fn default() -> Self {
            RecordingSteps {
                select: SelectReply {
                    kind: SelectKind::Skip,
                    key: None,
                    selection: None,
                    prefix: None,
                    log_lines: Vec::new(),
                    launch_settings: None,
                },
                recent_add: Ok(()),
                ask: None,
                script: Ok(true),
                calls: Mutex::new(Vec::new()),
                tape: None,
            }
        }
    }

    impl RecordingSteps {
        pub fn new() -> RecordingSteps {
            RecordingSteps::default()
        }

        pub fn with_select(mut self, reply: SelectReply) -> RecordingSteps {
            self.select = reply;
            self
        }

        pub fn with_recent_add(mut self, reply: Result<(), String>) -> RecordingSteps {
            self.recent_add = reply;
            self
        }

        pub fn with_ask(mut self, answer: Option<usize>) -> RecordingSteps {
            self.ask = answer;
            self
        }

        pub fn with_script(mut self, answer: Result<bool, String>) -> RecordingSteps {
            self.script = answer;
            self
        }

        pub fn with_tape(mut self, tape: Tape) -> RecordingSteps {
            self.tape = Some(tape);
            self
        }

        pub fn calls(&self) -> Vec<StepCall> {
            self.calls.lock().unwrap_or_else(|e| e.into_inner()).clone()
        }

        fn note(&self, call: StepCall) {
            self.calls
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .push(call);
        }
    }

    /// The `engine_launch_select` request as the TS built it: absent optionals are left out.
    pub fn select_request(args: &SelectArgs) -> Value {
        let mut request = serde_json::Map::new();
        request.insert("runner".into(), json!(args.runner));
        request.insert("appName".into(), json!(args.app_name));
        request.insert("title".into(), json!(args.title));
        if let Some(path) = &args.install_path {
            request.insert("installPath".into(), json!(path));
        }
        if let Some(platform) = &args.platform {
            request.insert("platform".into(), json!(platform));
        }
        request.insert("isNative".into(), json!(args.is_native));
        request.insert("settings".into(), args.settings.clone());
        request.insert("offline".into(), json!(args.offline));
        Value::Object(request)
    }

    impl FunnelSteps for RecordingSteps {
        fn select_engine<'a>(
            &'a self,
            _ctx: &'a LaunchCtx,
            args: &'a SelectArgs,
        ) -> Fut<'a, SelectReply> {
            let request = select_request(args);
            self.note(StepCall::SelectEngine(request.clone()));
            let reply = self.select.clone();
            if let Some(tape) = &self.tape {
                tape(json!({
                    "kind": "rust",
                    "channel": "engine_launch_select",
                    "args": [request],
                    "reply": reply.to_value(),
                }));
            }
            Box::pin(async move { reply })
        }

        fn end_engine(&self, _ctx: &LaunchCtx, key: &str) {
            self.note(StepCall::EndEngine(key.to_string()));
        }

        fn check_wine<'a>(
            &'a self,
            _ctx: &'a LaunchCtx,
            args: CheckWineArgs,
            _host: &'a WineHost,
        ) -> Fut<'a, Result<CheckWineReply, &'static str>> {
            self.note(StepCall::CheckWine {
                app_name: args.app_name,
            });
            Box::pin(async {
                Ok(CheckWineReply {
                    ok: true,
                    wine_version: None,
                    persist_game_wine: false,
                    global_wine_version: None,
                    log: Vec::new(),
                })
            })
        }

        fn ask_force_uninstall<'a>(
            &'a self,
            _ctx: &'a LaunchCtx,
            runner: RunnerName,
            app_name: &'a str,
        ) -> Fut<'a, Option<usize>> {
            self.note(StepCall::AskForceUninstall {
                runner,
                app_name: app_name.to_string(),
            });
            let answer = self.ask;
            Box::pin(async move { answer })
        }

        fn run_script<'a>(
            &'a self,
            _ctx: &'a LaunchCtx,
            args: ScriptRunArgs,
            _host: &'a RunnerHost,
        ) -> Fut<'a, Result<bool, String>> {
            self.note(StepCall::RunScript {
                script_path: args.script_path,
            });
            let answer = self.script.clone();
            Box::pin(async move { answer })
        }

        fn recent_add(&self, _ctx: &LaunchCtx, args: AddArgs) -> Result<(), String> {
            let request = json!({
                "appName": args.app_name,
                "title": args.title,
                "runner": args.runner,
            });
            self.note(StepCall::RecentAdd(request.clone()));
            let answer = self.recent_add.clone();
            if let Some(tape) = &self.tape {
                // The TS recorder wrote a rejection as `rejected: <message>` in place of `reply`.
                let mut event = json!({
                    "kind": "rust",
                    "channel": "info_recent_add",
                    "args": [request],
                });
                match &answer {
                    Ok(()) => event["reply"] = Value::Null,
                    Err(reason) => event["rejected"] = json!(reason),
                }
                tape(event);
            }
            answer
        }
    }
}
