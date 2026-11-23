//! Scripted fakes for every seam of [`crate::ctx::EngineCtx`] (feature `testing`): the golden tests
//! and the CLI build a context from these instead of the real spawn, network, window and clock.
//!
//! - [`ScriptedSpecRunner`]: scripted outputs keyed by program and argv, recording every spawn it
//!   saw with the environment diffed against a base (a fake profile's), in the shape the TS oracle's
//!   `spawns.json` uses.
//! - [`ScriptedDxvk`]: a [`DxvkInstaller`] that records its requests and answers a scripted bool.
//! - [`RecordingEmitter`], [`RecordingUi`], [`RecordingLog`]: what an op pushed, notified or logged.
//! - [`FixedClock`]: a clock a test sets, advances or steps.
//!
//! `Replay` (the recorded-case `Fetch`) is [`crate::fetch::Replay`].

use std::collections::{BTreeMap, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use gamelib_core::clock::Clock;
use gamelib_core::emitter::FrontendEmitter;
use gamelib_core::process::{BoxFuture, LineSink, ProcSpec, SpecOutput, SpecRunner};
use serde_json::{json, Value};

use crate::dxvk::{DxvkInstaller, DxvkRequest};
use crate::sinks::{EngineLog, EngineUi};

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

/// A clock a test controls. [`FixedClock::new`] always answers the same millisecond,
/// [`FixedClock::stepping`] answers `start`, `start + step`, ... one read at a time (so a test
/// decides how many "seconds" each progress chunk costs without sleeping), and
/// [`FixedClock::advance`] and [`FixedClock::set`] move it by hand.
#[derive(Debug)]
pub struct FixedClock {
    now: AtomicU64,
    step: u64,
}

impl FixedClock {
    pub fn new(now_ms: u64) -> FixedClock {
        FixedClock::stepping(now_ms, 0)
    }

    pub fn stepping(start_ms: u64, step_ms: u64) -> FixedClock {
        FixedClock {
            now: AtomicU64::new(start_ms),
            step: step_ms,
        }
    }

    pub fn set(&self, now_ms: u64) {
        self.now.store(now_ms, Ordering::SeqCst);
    }

    pub fn advance(&self, ms: u64) {
        self.now.fetch_add(ms, Ordering::SeqCst);
    }
}

impl Clock for FixedClock {
    fn now_ms(&self) -> u64 {
        self.now.fetch_add(self.step, Ordering::SeqCst)
    }
}

/// One spawn a [`ScriptedSpecRunner`] saw, in the oracle's `spawns.json` vocabulary.
#[derive(Debug, Clone, PartialEq)]
pub struct RecordedSpawn {
    pub program: String,
    pub argv: Vec<String>,
    /// The environment the child would see that differs from the base: set or changed variables.
    pub env_set: BTreeMap<String, String>,
    /// Base variables the child would not see (`replace_env` with a variable left out).
    pub env_unset: Vec<String>,
    pub replace_env: bool,
    pub cwd: Option<PathBuf>,
    pub stdin: Option<String>,
    pub timeout: Option<Duration>,
    pub label: &'static str,
    /// What the script answered (`code: None` and an explanatory stderr when none matched).
    pub result: SpecOutput,
}

impl RecordedSpawn {
    /// The trace entry the TS oracle writes (`program`, `argv`, `envDiff`, `cwd`, `stdin`, `via`,
    /// `result`), so a golden compares it directly.
    pub fn to_json(&self) -> Value {
        json!({
            "program": self.program,
            "argv": self.argv,
            "envDiff": { "set": self.env_set, "unset": self.env_unset },
            "cwd": self.cwd.as_ref().map(|p| p.to_string_lossy().into_owned()),
            "stdin": self.stdin,
            "via": "run",
            "result": {
                "code": self.result.code,
                "stdout": self.result.stdout,
                "stderr": self.result.stderr,
            },
        })
    }
}

struct Script {
    program: String,
    /// `None`: any argv.
    argv: Option<Vec<String>>,
    outputs: VecDeque<SpecOutput>,
}

/// A [`SpecRunner`] that spawns nothing: it answers the scripted output for the program and argv
/// and records the spec. An exact-argv script wins over a program-only one. Several scripts for the
/// same key answer in order, the last one repeating. A spawn nothing matches is recorded, listed in
/// [`ScriptedSpecRunner::unscripted`] and answers `code: None` with a stderr saying so.
pub struct ScriptedSpecRunner {
    base_env: Vec<(String, String)>,
    scripts: Mutex<Vec<Script>>,
    spawns: Mutex<Vec<RecordedSpawn>>,
}

impl ScriptedSpecRunner {
    /// `base_env` is the environment a spawn is diffed against: a fake profile's variables
    /// (`FakeHome::env()` as strings), so a recorded `env_set` names only what the op added.
    pub fn new(base_env: Vec<(String, String)>) -> ScriptedSpecRunner {
        ScriptedSpecRunner {
            base_env,
            scripts: Mutex::new(Vec::new()),
            spawns: Mutex::new(Vec::new()),
        }
    }

    /// Answers `output` to `program` with exactly `argv`.
    pub fn on(self, program: &str, argv: &[&str], output: SpecOutput) -> ScriptedSpecRunner {
        self.script(program, Some(argv), output)
    }

    /// Answers `output` to `program` with any argv.
    pub fn on_program(self, program: &str, output: SpecOutput) -> ScriptedSpecRunner {
        self.script(program, None, output)
    }

    fn script(
        self,
        program: &str,
        argv: Option<&[&str]>,
        output: SpecOutput,
    ) -> ScriptedSpecRunner {
        let argv = argv.map(|a| a.iter().map(|s| (*s).to_string()).collect::<Vec<_>>());
        {
            let mut scripts = lock(&self.scripts);
            match scripts
                .iter_mut()
                .find(|s| s.program == program && s.argv == argv)
            {
                Some(existing) => existing.outputs.push_back(output),
                None => scripts.push(Script {
                    program: program.to_string(),
                    argv,
                    outputs: VecDeque::from([output]),
                }),
            }
        }
        self
    }

    /// Every spawn seen so far, in order.
    pub fn spawns(&self) -> Vec<RecordedSpawn> {
        lock(&self.spawns).clone()
    }

    /// The spawns no script matched, as `program argv...`.
    pub fn unscripted(&self) -> Vec<String> {
        lock(&self.spawns)
            .iter()
            .filter(|s| s.result.stderr.starts_with(UNSCRIPTED))
            .map(|s| format!("{} {}", s.program, s.argv.join(" ")))
            .collect()
    }

    fn answer(&self, spec: &ProcSpec) -> SpecOutput {
        let mut scripts = lock(&self.scripts);
        let exact = scripts
            .iter()
            .position(|s| s.program == spec.program && s.argv.as_deref() == Some(&spec.argv[..]));
        let any = scripts
            .iter()
            .position(|s| s.program == spec.program && s.argv.is_none());
        match exact.or(any) {
            Some(i) => {
                let outputs = &mut scripts[i].outputs;
                if outputs.len() > 1 {
                    outputs.pop_front().unwrap_or_default()
                } else {
                    outputs.front().cloned().unwrap_or_default()
                }
            }
            None => SpecOutput {
                code: None,
                stderr: format!("{UNSCRIPTED}: {}", spec.program),
                ..SpecOutput::default()
            },
        }
    }

    fn diff(&self, spec: &ProcSpec) -> (BTreeMap<String, String>, Vec<String>) {
        let base: BTreeMap<&str, &str> = self
            .base_env
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect();
        let set = spec
            .env
            .iter()
            .filter(|(k, v)| base.get(k.as_str()) != Some(&v.as_str()))
            .cloned()
            .collect();
        let unset = if spec.replace_env {
            base.keys()
                .filter(|k| !spec.env.iter().any(|(sk, _)| sk == *k))
                .map(|k| (*k).to_string())
                .collect()
        } else {
            Vec::new()
        };
        (set, unset)
    }
}

/// What a scripted runner's stderr starts with when no script matched the spawn.
const UNSCRIPTED: &str = "scripted runner: no script for";

impl SpecRunner for ScriptedSpecRunner {
    fn run(&self, spec: ProcSpec, on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
        let output = self.answer(&spec);
        let (env_set, env_unset) = self.diff(&spec);
        lock(&self.spawns).push(RecordedSpawn {
            program: spec.program,
            argv: spec.argv,
            env_set,
            env_unset,
            replace_env: spec.replace_env,
            cwd: spec.cwd,
            stdin: spec.stdin,
            timeout: spec.timeout,
            label: spec.label,
            result: output.clone(),
        });
        if let Some(mut on_line) = on_line {
            for line in output.stdout.lines() {
                on_line(line);
            }
        }
        Box::pin(async move { output })
    }
}

/// A [`DxvkInstaller`] that records its requests and answers the scripted results in order (the
/// last repeating; `true` when none was scripted).
pub struct ScriptedDxvk {
    results: Mutex<VecDeque<bool>>,
    requests: Mutex<Vec<DxvkRequest>>,
}

impl ScriptedDxvk {
    pub fn new(results: &[bool]) -> ScriptedDxvk {
        ScriptedDxvk {
            results: Mutex::new(results.iter().copied().collect()),
            requests: Mutex::new(Vec::new()),
        }
    }

    pub fn requests(&self) -> Vec<DxvkRequest> {
        lock(&self.requests).clone()
    }
}

impl DxvkInstaller for ScriptedDxvk {
    fn install_remove(&self, req: DxvkRequest) -> BoxFuture<bool> {
        lock(&self.requests).push(req);
        let mut results = lock(&self.results);
        let answer = if results.len() > 1 {
            results.pop_front().unwrap_or(true)
        } else {
            results.front().copied().unwrap_or(true)
        };
        Box::pin(async move { answer })
    }
}

/// A [`FrontendEmitter`] that keeps every push.
#[derive(Default)]
pub struct RecordingEmitter {
    pushed: Mutex<Vec<(String, Vec<Value>)>>,
}

impl RecordingEmitter {
    pub fn new() -> RecordingEmitter {
        RecordingEmitter::default()
    }

    /// Every `(channel, args)` pushed, in order.
    pub fn pushed(&self) -> Vec<(String, Vec<Value>)> {
        lock(&self.pushed).clone()
    }
}

impl FrontendEmitter for RecordingEmitter {
    fn emit(&self, channel: &str, args: Vec<Value>) {
        lock(&self.pushed).push((channel.to_string(), args));
    }
}

/// One call on an [`EngineUi`].
#[derive(Debug, Clone, PartialEq)]
pub enum UiEvent {
    Notify {
        title: String,
        body: String,
    },
    ShowDialog {
        title: String,
        body: String,
        kind: String,
        ack_id: String,
    },
    RaiseMainWindow,
    SendToSidecar {
        channel: String,
        args: Vec<Value>,
    },
}

/// An [`EngineUi`] that keeps every call. `show_dialog` answers `true` (the frame was sent) unless
/// [`RecordingUi::dialog_unsent`] says otherwise.
pub struct RecordingUi {
    events: Mutex<Vec<UiEvent>>,
    dialog_sent: bool,
}

impl RecordingUi {
    pub fn new() -> RecordingUi {
        RecordingUi {
            events: Mutex::new(Vec::new()),
            dialog_sent: true,
        }
    }

    /// A UI whose dialog frame never gets sent (`show_dialog` answers `false`).
    pub fn dialog_unsent() -> RecordingUi {
        RecordingUi {
            events: Mutex::new(Vec::new()),
            dialog_sent: false,
        }
    }

    pub fn events(&self) -> Vec<UiEvent> {
        lock(&self.events).clone()
    }
}

impl Default for RecordingUi {
    fn default() -> Self {
        RecordingUi::new()
    }
}

impl EngineUi for RecordingUi {
    fn notify(&self, title: &str, body: &str) {
        lock(&self.events).push(UiEvent::Notify {
            title: title.to_string(),
            body: body.to_string(),
        });
    }

    fn show_dialog(&self, title: &str, body: &str, kind: &str, ack_id: &str) -> bool {
        lock(&self.events).push(UiEvent::ShowDialog {
            title: title.to_string(),
            body: body.to_string(),
            kind: kind.to_string(),
            ack_id: ack_id.to_string(),
        });
        self.dialog_sent
    }

    fn raise_main_window(&self) {
        lock(&self.events).push(UiEvent::RaiseMainWindow);
    }

    fn send_to_sidecar(&self, channel: &str, args: Vec<Value>) {
        lock(&self.events).push(UiEvent::SendToSidecar {
            channel: channel.to_string(),
            args,
        });
    }
}

/// An [`EngineLog`] that keeps every line as `(level, line)`.
#[derive(Default)]
pub struct RecordingLog {
    lines: Mutex<Vec<(&'static str, String)>>,
}

impl RecordingLog {
    pub fn new() -> RecordingLog {
        RecordingLog::default()
    }

    pub fn lines(&self) -> Vec<(&'static str, String)> {
        lock(&self.lines).clone()
    }
}

impl EngineLog for RecordingLog {
    fn info(&self, line: &str) {
        lock(&self.lines).push(("info", line.to_string()));
    }

    fn warn(&self, line: &str) {
        lock(&self.lines).push(("warn", line.to_string()));
    }

    fn error(&self, line: &str) {
        lock(&self.lines).push(("error", line.to_string()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dxvk::{DxvkAction, DxvkTool};
    use gamelib_testutil::FakeHome;
    use std::sync::Arc;

    fn base(home: &FakeHome) -> Vec<(String, String)> {
        home.env()
            .into_iter()
            .map(|(k, v)| (k.to_string(), v.to_string_lossy().into_owned()))
            .collect()
    }

    fn out(code: i32, stdout: &str) -> SpecOutput {
        SpecOutput {
            code: Some(code),
            stdout: stdout.to_string(),
            ..SpecOutput::default()
        }
    }

    #[tokio::test]
    async fn the_runner_answers_by_argv_then_program_and_records_the_env_diff() {
        let home = FakeHome::new("engine-testing-");
        let runner = ScriptedSpecRunner::new(base(&home))
            .on("tar", &["-xf", "a.tar"], out(0, "exact"))
            .on_program("tar", out(2, "any"));

        let mut spec = ProcSpec::new("test", "tar");
        spec.argv = vec!["-xf".into(), "a.tar".into()];
        spec.env = vec![
            ("HOME".into(), home.root().to_string_lossy().into_owned()),
            ("WINEPREFIX".into(), "/p".into()),
        ];
        spec.cwd = Some(PathBuf::from("/work"));
        let seen = Arc::new(Mutex::new(Vec::<String>::new()));
        let sink = seen.clone();
        let exact = runner
            .run(
                spec,
                Some(Box::new(move |l| sink.lock().unwrap().push(l.to_string()))),
            )
            .await;
        assert_eq!(exact.stdout, "exact");
        assert_eq!(*seen.lock().unwrap(), ["exact"]);

        let mut other = ProcSpec::new("test", "tar");
        other.argv = vec!["-tf".into()];
        assert_eq!(runner.run(other, None).await.code, Some(2));

        let spawns = runner.spawns();
        assert_eq!(spawns.len(), 2);
        // HOME equals the base so it is not part of the diff; WINEPREFIX is what the op added.
        assert_eq!(
            spawns[0].to_json()["envDiff"],
            json!({"set": {"WINEPREFIX": "/p"}, "unset": []})
        );
        assert_eq!(spawns[0].to_json()["cwd"], "/work");
        assert!(runner.unscripted().is_empty());
    }

    #[tokio::test]
    async fn an_unscripted_spawn_is_recorded_and_listed() {
        let runner = ScriptedSpecRunner::new(Vec::new());
        let mut spec = ProcSpec::new("test", "wine");
        spec.argv = vec!["--version".into()];
        let result = runner.run(spec, None).await;
        assert_eq!(result.code, None);
        assert_eq!(runner.unscripted(), ["wine --version"]);
    }

    #[tokio::test]
    async fn scripts_for_one_key_answer_in_order_and_the_last_repeats() {
        let runner = ScriptedSpecRunner::new(Vec::new())
            .on_program("p", out(1, ""))
            .on_program("p", out(0, ""));
        let code = |runner: &ScriptedSpecRunner| {
            let fut = runner.run(ProcSpec::new("t", "p"), None);
            async move { fut.await.code }
        };
        assert_eq!(code(&runner).await, Some(1));
        assert_eq!(code(&runner).await, Some(0));
        assert_eq!(code(&runner).await, Some(0));
    }

    #[tokio::test]
    async fn a_replace_env_spawn_lists_the_base_variables_it_dropped() {
        let runner = ScriptedSpecRunner::new(vec![("HOME".into(), "/h".into())])
            .on_program("p", SpecOutput::default());
        let mut spec = ProcSpec::new("t", "p");
        spec.replace_env = true;
        spec.env = vec![("PATH".into(), "/bin".into())];
        runner.run(spec, None).await;
        assert_eq!(
            runner.spawns()[0].to_json()["envDiff"],
            json!({"set": {"PATH": "/bin"}, "unset": ["HOME"]})
        );
    }

    #[tokio::test]
    async fn scripted_dxvk_records_requests_and_answers_in_order() {
        let dxvk = ScriptedDxvk::new(&[false, true]);
        let req = || DxvkRequest {
            settings: json!({"winePrefix": "/p"}),
            tool: DxvkTool::Dxvk,
            action: DxvkAction::Backup,
            source: None,
        };
        assert!(!dxvk.install_remove(req()).await);
        assert!(dxvk.install_remove(req()).await);
        assert!(dxvk.install_remove(req()).await);
        assert_eq!(dxvk.requests().len(), 3);
    }

    #[test]
    fn the_recording_sinks_keep_what_they_were_told() {
        let emitter = RecordingEmitter::new();
        emitter.emit("gameStatusUpdate", vec![json!({"appName": "480"})]);
        assert_eq!(emitter.pushed()[0].0, "gameStatusUpdate");

        let ui = RecordingUi::new();
        ui.notify("t", "b");
        assert!(ui.show_dialog("t", "b", "MESSAGE", "ack-1"));
        ui.raise_main_window();
        ui.send_to_sidecar("ch", vec![json!(1)]);
        let events = ui.events();
        assert_eq!(events.len(), 4);
        assert_eq!(events[2], UiEvent::RaiseMainWindow);
        assert!(!RecordingUi::dialog_unsent().show_dialog("t", "b", "MESSAGE", "a"));

        let log = RecordingLog::new();
        log.info("one");
        log.error("two");
        assert_eq!(
            log.lines(),
            [("info", "one".to_string()), ("error", "two".to_string())]
        );
    }

    #[test]
    fn the_fixed_clock_stands_still_steps_and_moves_by_hand() {
        let fixed = FixedClock::new(5);
        assert_eq!((fixed.now_ms(), fixed.now_ms()), (5, 5));
        fixed.advance(10);
        assert_eq!(fixed.now_ms(), 15);
        fixed.set(100);
        assert_eq!(fixed.now_ms(), 100);
        let stepping = FixedClock::stepping(0, 400);
        assert_eq!(
            [stepping.now_ms(), stepping.now_ms(), stepping.now_ms()],
            [0, 400, 800]
        );
    }
}
