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
    /// `Err` is a fixed reason word for a step that could not answer at all (the TS saw a rejected channel).
    fn select_engine<'a>(
        &'a self,
        ctx: &'a LaunchCtx,
        args: &'a SelectArgs,
    ) -> Fut<'a, Result<SelectReply, &'static str>>;

    /// `engine_launch_end`: the launch is over, so the engine's watch, overlay, deadline and ledger entry go.
    /// `Err` is a fixed reason word; the funnel logs it and never lets it replace the launch's own result.
    fn end_engine(&self, ctx: &LaunchCtx, key: &str) -> Result<(), &'static str>;

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
    ) -> Fut<'a, Result<SelectReply, &'static str>> {
        Box::pin(async move { Ok(select_engine_for_launch(&ctx.engine, &CtxStepDeps, args).await) })
    }

    fn end_engine(&self, ctx: &LaunchCtx, key: &str) -> Result<(), &'static str> {
        end_engine_launch(&ctx.engine, key);
        Ok(())
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
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Mutex;

    use gamelib_engine::launch::step::SelectKind;
    use serde_json::{json, Value};

    use super::*;
    use crate::funnel::testing::Tape;
    use crate::prepare::launch::LogEntry;

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

    /// What a step answers, the nth call getting the nth entry (the last entry answering every call after it):
    /// the JSON the TS recorder wrote as the Rust reply, kept verbatim for the tape, and the typed answer the
    /// funnel reads; or the message the scripted channel rejected with.
    struct Script<T> {
        answers: Vec<Result<(Value, T), String>>,
        calls: AtomicUsize,
    }

    impl<T: Clone> Script<T> {
        fn new(answers: Vec<Result<(Value, T), String>>) -> Script<T> {
            Script {
                answers,
                calls: AtomicUsize::new(0),
            }
        }

        fn next(&self) -> Result<(Value, T), String> {
            let call = self.calls.fetch_add(1, Ordering::SeqCst);
            self.answers[call.min(self.answers.len() - 1)].clone()
        }
    }

    fn select_reply_of(json: &Value) -> SelectReply {
        let kind = match json.get("kind").and_then(Value::as_str) {
            Some("legacy") => SelectKind::Legacy,
            Some("refused") => SelectKind::Refused,
            Some("use") => SelectKind::Use,
            _ => SelectKind::Skip,
        };
        SelectReply {
            kind,
            key: json.get("key").and_then(Value::as_str).map(str::to_string),
            selection: None,
            prefix: None,
            log_lines: json
                .get("logLines")
                .and_then(Value::as_array)
                .map(|lines| {
                    lines
                        .iter()
                        .filter_map(|line| line.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default(),
            launch_settings: json.get("launchSettings").cloned(),
        }
    }

    fn static_level(level: &str) -> &'static str {
        match level {
            "warning" => "warning",
            "error" => "error",
            "debug" => "debug",
            _ => "info",
        }
    }

    fn check_reply_of(json: &Value) -> CheckWineReply {
        let wine = |key: &str| {
            json.get(key)
                .filter(|value| !value.is_null())
                .and_then(|value| serde_json::from_value(value.clone()).ok())
        };
        CheckWineReply {
            ok: json.get("ok").and_then(Value::as_bool).unwrap_or(false),
            wine_version: wine("wineVersion"),
            persist_game_wine: json.get("persistGameWine") == Some(&Value::Bool(true)),
            global_wine_version: wine("globalWineVersion"),
            log: json
                .get("log")
                .and_then(Value::as_array)
                .map(|entries| {
                    entries
                        .iter()
                        .map(|entry| LogEntry {
                            level: static_level(
                                entry.get("level").and_then(Value::as_str).unwrap_or("info"),
                            ),
                            parts: entry
                                .get("parts")
                                .and_then(Value::as_array)
                                .cloned()
                                .unwrap_or_default(),
                        })
                        .collect()
                })
                .unwrap_or_default(),
        }
    }

    /// Steps that answer from a script (by default: the engine layer skips, the Wine check passes, the dialog
    /// is dismissed, a script runs and the recent-games write succeeds) and record every call, in order.
    ///
    /// With a tape each step also appears in the TS recorder's event shape (`{ kind: 'rust', channel, args, reply }`
    /// for the Rust channels, `{ kind: 'script', ... }` for a launch script), with the args as the TS sent them,
    /// so a golden case's events compare against them.
    pub struct RecordingSteps {
        select: Script<SelectReply>,
        check_wine: Script<CheckWineReply>,
        end_engine: Result<(), String>,
        recent_add: Result<(), String>,
        ask: Option<usize>,
        script_before: Result<bool, String>,
        script_after: Result<bool, String>,
        calls: Mutex<Vec<StepCall>>,
        tape: Option<Tape>,
    }

    impl Default for RecordingSteps {
        fn default() -> Self {
            let skip = json!({ "kind": "skip" });
            RecordingSteps {
                select: Script::new(vec![Ok((skip.clone(), select_reply_of(&skip)))]),
                check_wine: Script::new(vec![Ok((
                    json!({ "ok": true, "log": [] }),
                    CheckWineReply {
                        ok: true,
                        wine_version: None,
                        persist_game_wine: false,
                        global_wine_version: None,
                        log: Vec::new(),
                    },
                ))]),
                end_engine: Ok(()),
                recent_add: Ok(()),
                ask: None,
                script_before: Ok(true),
                script_after: Ok(true),
                calls: Mutex::new(Vec::new()),
                tape: None,
            }
        }
    }

    impl RecordingSteps {
        pub fn new() -> RecordingSteps {
            RecordingSteps::default()
        }

        pub fn with_select(self, reply: SelectReply) -> RecordingSteps {
            let json = reply.to_value();
            self.with_select_sequence(vec![Ok((json, reply))])
        }

        /// The engine step answers each call from the TS recorder's scripted JSON (`Ok`) or rejects with its
        /// message (`Err`); the last entry answers every call after it.
        pub fn with_select_script(self, answers: Vec<Result<Value, String>>) -> RecordingSteps {
            let answers = answers
                .into_iter()
                .map(|answer| answer.map(|json| (json.clone(), select_reply_of(&json))))
                .collect();
            self.with_select_sequence(answers)
        }

        fn with_select_sequence(
            mut self,
            answers: Vec<Result<(Value, SelectReply), String>>,
        ) -> RecordingSteps {
            self.select = Script::new(answers);
            self
        }

        /// The Wine check answers each call from the TS recorder's scripted JSON, as `with_select_script` does.
        pub fn with_check_wine_script(
            mut self,
            answers: Vec<Result<Value, String>>,
        ) -> RecordingSteps {
            self.check_wine = Script::new(
                answers
                    .into_iter()
                    .map(|answer| answer.map(|json| (json.clone(), check_reply_of(&json))))
                    .collect(),
            );
            self
        }

        pub fn with_recent_add(mut self, reply: Result<(), String>) -> RecordingSteps {
            self.recent_add = reply;
            self
        }

        /// The engine release rejects with this message.
        pub fn with_end_engine(mut self, reply: Result<(), String>) -> RecordingSteps {
            self.end_engine = reply;
            self
        }

        pub fn with_ask(mut self, answer: Option<usize>) -> RecordingSteps {
            self.ask = answer;
            self
        }

        /// Both launch scripts answer `answer`.
        pub fn with_script(mut self, answer: Result<bool, String>) -> RecordingSteps {
            self.script_before = answer.clone();
            self.script_after = answer;
            self
        }

        /// The before and the after launch script answer separately.
        pub fn with_scripts(
            mut self,
            before: Result<bool, String>,
            after: Result<bool, String>,
        ) -> RecordingSteps {
            self.script_before = before;
            self.script_after = after;
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

        /// A `rust` event with its reply, or with `rejected` in place of one (the TS recorder's shape).
        fn rust_event(&self, channel: &str, request: Value, answer: &Result<Value, String>) {
            let Some(tape) = &self.tape else {
                return;
            };
            let mut event = json!({ "kind": "rust", "channel": channel, "args": [request] });
            match answer {
                Ok(reply) => event["reply"] = reply.clone(),
                Err(message) => event["rejected"] = json!(message),
            }
            tape(event);
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
        ) -> Fut<'a, Result<SelectReply, &'static str>> {
            let request = select_request(args);
            self.note(StepCall::SelectEngine(request.clone()));
            let answer = self.select.next();
            self.rust_event(
                "engine_launch_select",
                request,
                &answer.clone().map(|(json, _)| json),
            );
            let answer = answer.map(|(_, reply)| reply).map_err(|_| "rejected");
            Box::pin(async move { answer })
        }

        fn end_engine(&self, _ctx: &LaunchCtx, key: &str) -> Result<(), &'static str> {
            self.note(StepCall::EndEngine(key.to_string()));
            let answer = self.end_engine.clone().map(|()| Value::Null);
            self.rust_event("engine_launch_end", json!({ "key": key }), &answer);
            answer.map(|_| ()).map_err(|_| "rejected")
        }

        fn check_wine<'a>(
            &'a self,
            _ctx: &'a LaunchCtx,
            args: CheckWineArgs,
            _host: &'a WineHost,
        ) -> Fut<'a, Result<CheckWineReply, &'static str>> {
            self.note(StepCall::CheckWine {
                app_name: args.app_name.clone(),
            });
            let request = json!({
                "appName": args.app_name,
                "runner": args.runner.0.as_str(),
                "wineVersion": args.wine_version,
                "verboseLogs": args.verbose_logs,
                "disableLogs": args.disable_logs,
            });
            let answer = self.check_wine.next();
            self.rust_event(
                "launch_check_wine_before_launch",
                request,
                &answer.clone().map(|(json, _)| json),
            );
            let answer = answer.map(|(_, reply)| reply).map_err(|_| "rejected");
            Box::pin(async move { answer })
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
            self.rust_event(
                "launch_ask_force_uninstall",
                json!({ "runner": runner.as_str(), "appName": app_name }),
                &Ok(answer.map_or(Value::Null, |index| json!(index))),
            );
            Box::pin(async move { answer })
        }

        fn run_script<'a>(
            &'a self,
            _ctx: &'a LaunchCtx,
            args: ScriptRunArgs,
            _host: &'a RunnerHost,
        ) -> Fut<'a, Result<bool, String>> {
            self.note(StepCall::RunScript {
                script_path: args.script_path.clone(),
            });
            // The TS recorder wrote the settings the script was handed: the Wine name and both script paths.
            if let Some(tape) = &self.tape {
                let settings: Value =
                    serde_json::from_str(&args.settings_json).unwrap_or(Value::Null);
                let text = |key: &str| {
                    settings
                        .get(key)
                        .and_then(Value::as_str)
                        .map_or(Value::Null, |t| json!(t))
                };
                tape(json!({
                    "kind": "script",
                    "when": args.stage.as_str(),
                    "appName": args.app_name,
                    "wine": settings
                        .pointer("/wineVersion/name")
                        .and_then(Value::as_str)
                        .map_or(Value::Null, |name| json!(name)),
                    "beforeLaunchScriptPath": text("beforeLaunchScriptPath"),
                    "afterLaunchScriptPath": text("afterLaunchScriptPath"),
                    "target": {
                        "kind": "game",
                        "appName": args.app_name,
                        "runner": args.runner,
                        "type": "launch",
                    },
                }));
            }
            let answer = match args.stage {
                crate::runner::script::ScriptStage::Before => self.script_before.clone(),
                crate::runner::script::ScriptStage::After => self.script_after.clone(),
            };
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
            // The TS recorder wrote a rejection as `rejected: <message>` in place of `reply`.
            self.rust_event(
                "info_recent_add",
                request,
                &answer.clone().map(|()| Value::Null),
            );
            answer
        }
    }
}
