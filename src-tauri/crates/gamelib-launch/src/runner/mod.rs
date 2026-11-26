//! The command runner's helper path (88.2-07, D-02, D-21): `callRunner` ported from `commandRunner.ts`.
//! [`redact`] is the credential redaction, [`sanitize`] the named auth log sanitizers, [`stream`] the log hand-off, the sinks and the chunk window,
//! [`call_runner`] the run itself, [`wine_command`] the wine launch variant (88.2-12), [`error_handler`] the runner's `errorHandler` and `askForceUninstall`, and this file holds the state a context keeps across calls: the
//! in-flight table, the abort table and the PowerShell probe ([`RunnerTables`]), and the seam the
//! runner's `errorHandler` is reached through ([`RunnerErrors`]).

pub mod call_runner;
pub mod error_handler;
pub mod redact;
pub mod sanitize;
pub mod stream;
pub mod wine_command;

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};

use serde::Deserialize;
use tokio::sync::watch;
use tokio_util::sync::CancellationToken;

use call_runner::ExecResult;

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

/// The runners `callRunner` runs, spelled as the renderer spells them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RunnerName {
    Legendary,
    Gog,
    Nile,
    Sideload,
    Steam,
}

impl RunnerName {
    pub fn as_str(self) -> &'static str {
        match self {
            RunnerName::Legendary => "legendary",
            RunnerName::Gog => "gog",
            RunnerName::Nile => "nile",
            RunnerName::Sideload => "sideload",
            RunnerName::Steam => "steam",
        }
    }
}

/// The runner's `errorHandler` (`handleError` in the TS: it reads a run's output for known failures and
/// tells the user). Called fire and forget, exactly where the TS called it. A context with none runs
/// [`error_handler::error_handler`] (88.2-09); this seam is how a test records the calls instead.
pub trait RunnerErrors: Send + Sync {
    /// `error` is the joined output of a finished run or the message of a failed one.
    fn handle(&self, error: &str, app_name: &str, runner: RunnerName);
}

/// One thing the tables did, recorded only by [`RunnerTables::recording`] (the golden replay reads it).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RunnerEvent {
    /// A run took this abort id.
    AbortCreate(String),
    /// A run registered under `(runner, key)` for a tracked kill.
    Track { runner: String, key: String },
    /// A run gave its abort id back; `aborted` is whether its token had been cancelled by then.
    AbortRemove { id: String, aborted: bool },
    /// The error handler was reached (noted by a recording handler, so order across seams is kept).
    ErrorHandler {
        error: String,
        app_name: String,
        runner: String,
    },
}

/// A run in flight that identical calls join.
pub(crate) struct Flight {
    pub(crate) serial: u64,
    pub(crate) result: watch::Receiver<Option<ExecResult>>,
}

/// A token with the serial of the run that registered it, so a run only gives back its own.
pub(crate) struct Registered {
    pub(crate) serial: u64,
    pub(crate) token: CancellationToken,
}

/// What a context keeps across runner calls. Lives in the `LaunchCtx`, never at module scope.
pub struct RunnerTables {
    pub(crate) flights: Mutex<HashMap<String, Flight>>,
    pub(crate) aborts: Mutex<HashMap<String, Registered>>,
    pub(crate) tracked: Mutex<HashMap<(String, String), Registered>>,
    /// Whether the PowerShell wrapper is used; probed once, on the first call.
    pub(crate) powershell: OnceLock<bool>,
    serial: AtomicU64,
    events: Option<Arc<Mutex<Vec<RunnerEvent>>>>,
}

impl Default for RunnerTables {
    fn default() -> Self {
        RunnerTables::new()
    }
}

impl RunnerTables {
    pub fn new() -> RunnerTables {
        RunnerTables {
            flights: Mutex::new(HashMap::new()),
            aborts: Mutex::new(HashMap::new()),
            tracked: Mutex::new(HashMap::new()),
            powershell: OnceLock::new(),
            serial: AtomicU64::new(0),
            events: None,
        }
    }

    /// Tables that also keep the ordered list of what they did, for a test to read.
    pub fn recording() -> RunnerTables {
        RunnerTables::recording_into(Arc::new(Mutex::new(Vec::new())))
    }

    /// Tables that append to a list another set of tables (another context over the same replay) also
    /// appends to, so one list holds the order across them.
    pub fn recording_into(events: Arc<Mutex<Vec<RunnerEvent>>>) -> RunnerTables {
        RunnerTables {
            events: Some(events),
            ..RunnerTables::new()
        }
    }

    /// The next number: unique per run in this context (the abort id of a call that names none).
    pub(crate) fn next_serial(&self) -> u64 {
        self.serial.fetch_add(1, Ordering::SeqCst)
    }

    /// Records `event` when these tables record.
    pub fn note(&self, event: RunnerEvent) {
        if let Some(events) = &self.events {
            lock(events).push(event);
        }
    }

    /// What was recorded, in order (empty unless built with [`RunnerTables::recording`]).
    pub fn events(&self) -> Vec<RunnerEvent> {
        self.events
            .as_ref()
            .map(|events| lock(events).clone())
            .unwrap_or_default()
    }
}
