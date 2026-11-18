//! Fakes for the parity harness and the contract tests: `RecordingHost` (the parity stream
//! recorder), `ScriptedRunner`, `FakeClock`.

use crate::events::{AckReply, StateEvent};
use crate::host::{
    BoxFuture, Clock, Notification, NotifyText, PollHost, ProcessRunner, RunOutput, StreamingChild,
};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

/// One recorded effect, serialised as `{"frontend":{channel,args}}`, `{"notify":{title,body}}`,
/// or `{"state":{...event}}`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum StreamRecord {
    Frontend { channel: String, args: Vec<Value> },
    Notify { title: String, body: String },
    State(StateEvent),
}

/// How `state_event` answers.
#[derive(Debug, Clone)]
pub enum AckMode {
    Reply(AckReply),
    /// Never acks (ack-timeout scenario).
    Never,
    /// Sidecar not yet READY: immediate `not_acked`.
    NotReady,
}

pub struct RecordingHost {
    records: Mutex<Vec<StreamRecord>>,
    ack: Mutex<AckMode>,
}

impl Default for RecordingHost {
    fn default() -> Self {
        Self::new(AckMode::Reply(AckReply {
            applied: true,
            ..AckReply::default()
        }))
    }
}

fn text(t: &NotifyText) -> String {
    match t {
        NotifyText::Literal(s) => s.clone(),
        NotifyText::Key { key, .. } => key.clone(),
    }
}

impl RecordingHost {
    pub fn new(ack: AckMode) -> Self {
        RecordingHost {
            records: Mutex::new(vec![]),
            ack: Mutex::new(ack),
        }
    }
    pub fn set_ack(&self, ack: AckMode) {
        *self.ack.lock().unwrap_or_else(|e| e.into_inner()) = ack;
    }
    pub fn records(&self) -> Vec<StreamRecord> {
        self.records
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }
    fn push(&self, r: StreamRecord) {
        self.records
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push(r);
    }
}

impl PollHost for RecordingHost {
    fn emit_frontend(&self, channel: &str, args: Vec<Value>) {
        self.push(StreamRecord::Frontend {
            channel: channel.to_string(),
            args,
        });
    }
    fn notify(&self, n: Notification) {
        self.push(StreamRecord::Notify {
            title: text(&n.title),
            body: text(&n.body),
        });
    }
    fn state_event(&self, ev: StateEvent) -> BoxFuture<AckReply> {
        self.push(StreamRecord::State(ev));
        let mode = self.ack.lock().unwrap_or_else(|e| e.into_inner()).clone();
        Box::pin(async move {
            match mode {
                AckMode::Reply(r) => r,
                AckMode::NotReady => AckReply::not_acked(),
                AckMode::Never => std::future::pending().await,
            }
        })
    }
    fn bridge_helper_path(&self) -> Option<PathBuf> {
        None
    }
    fn shell_pid(&self) -> u32 {
        1
    }
}

#[derive(Default)]
pub struct ScriptedRunner {
    runs: Mutex<HashMap<String, Vec<RunOutput>>>,
    streams: Mutex<HashMap<String, Vec<String>>>,
    calls: Mutex<Vec<String>>,
}

fn call_key(program: &str, argv: &[String]) -> String {
    std::iter::once(program)
        .chain(argv.iter().map(String::as_str))
        .collect::<Vec<_>>()
        .join(" ")
}

/// Map key for scripted outputs: path separators are folded to `/` on both the scripting and
/// the lookup side, so a test that builds its expected path with a different mix of separators
/// than the code under test (e.g. `join("a/b")` vs `join("a").join("b")` on Windows) still matches.
fn script_key(key: &str) -> String {
    key.replace('\\', "/")
}

impl ScriptedRunner {
    /// Script outputs for `program argv...`; they are consumed in order, the last one repeats.
    pub fn on(&self, key: &str, outputs: Vec<RunOutput>) {
        self.runs
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(script_key(key), outputs);
    }
    pub fn on_stream(&self, key: &str, lines: Vec<String>) {
        self.streams
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(script_key(key), lines);
    }
    pub fn calls(&self) -> Vec<String> {
        self.calls.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }
}

impl ProcessRunner for ScriptedRunner {
    fn run(&self, program: &str, argv: Vec<String>, _timeout: Duration) -> BoxFuture<RunOutput> {
        let key = call_key(program, &argv);
        self.calls
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push(key.clone());
        let mut runs = self.runs.lock().unwrap_or_else(|e| e.into_inner());
        let out = match runs.get_mut(&script_key(&key)) {
            Some(v) if v.len() > 1 => v.remove(0),
            Some(v) => v.first().cloned().unwrap_or_default(),
            None => RunOutput::default(),
        };
        Box::pin(async move { out })
    }

    fn spawn_streaming(&self, program: &str, argv: Vec<String>) -> std::io::Result<StreamingChild> {
        let key = call_key(program, &argv);
        self.calls
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push(key.clone());
        let lines = self
            .streams
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(&script_key(&key))
            .cloned()
            .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "unscripted"))?;
        let (tx, rx) = tokio::sync::mpsc::channel(lines.len().max(1));
        for l in lines {
            let _ = tx.try_send(l);
        }
        Ok(StreamingChild {
            lines: rx,
            kill: tokio_util::sync::CancellationToken::new(),
        })
    }
}

#[derive(Default)]
pub struct FakeClock(AtomicU64);

impl FakeClock {
    pub fn new(ms: u64) -> Self {
        FakeClock(AtomicU64::new(ms))
    }
    pub fn set(&self, ms: u64) {
        self.0.store(ms, Ordering::Relaxed);
    }
    pub fn advance(&self, ms: u64) {
        self.0.fetch_add(ms, Ordering::Relaxed);
    }
}

impl Clock for FakeClock {
    fn now_ms(&self) -> u64 {
        self.0.load(Ordering::Relaxed)
    }
}
