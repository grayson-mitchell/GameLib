//! The download reporter every store shares (`pinnedEngineProgress.ts`): one weighted percent across
//! the DXVK and Wine archives, then the verify and unpack phases, then `setting-up`, sent as
//! `gameStatusUpdate {appName, runner, status: 'engine-download', context}` through the
//! `FrontendEmitter`. A failure or an abort ends with `{status: 'done'}`.

use std::sync::{Arc, Mutex};

use gamelib_core::emitter::FrontendEmitter;
use serde_json::json;

use crate::pins::EnginePin;
use crate::sinks::EngineLog;

/// The channel the renderer listens on.
pub const STATUS_CHANNEL: &str = "gameStatusUpdate";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Artifact {
    Wine,
    Dxvk,
}

impl Artifact {
    pub fn as_str(self) -> &'static str {
        match self {
            Artifact::Wine => "wine",
            Artifact::Dxvk => "dxvk",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    Downloading,
    Verifying,
    Extracting,
}

impl Phase {
    pub fn as_str(self) -> &'static str {
        match self {
            Phase::Downloading => "downloading",
            Phase::Verifying => "verifying",
            Phase::Extracting => "extracting",
        }
    }
}

/// One step of the engine's own progress (`FallbackDownloadProgress`). The ETA the TS carried is not
/// kept: the reporter never read it.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FallbackProgress {
    pub phase: Phase,
    pub artifact: Artifact,
    pub percentage: Option<f64>,
}

struct State {
    wine_done: bool,
    dxvk_done: bool,
    highest: i64,
    last_context: String,
    sent_any: bool,
}

struct Inner {
    emitter: Arc<dyn FrontendEmitter>,
    app_name: String,
    runner: String,
    dxvk_weight: f64,
    wine_weight: f64,
    state: Mutex<State>,
}

/// One caller's reporter. Cheap to clone; the clones share the state.
#[derive(Clone)]
pub struct Reporter {
    inner: Arc<Inner>,
}

impl Reporter {
    pub fn new(
        emitter: Arc<dyn FrontendEmitter>,
        app_name: &str,
        runner: &str,
        pin: &EnginePin,
    ) -> Reporter {
        Reporter {
            inner: Arc::new(Inner {
                emitter,
                app_name: app_name.to_string(),
                runner: runner.to_string(),
                dxvk_weight: pin.dxvk.size as f64,
                wine_weight: pin.wine.size as f64,
                state: Mutex::new(State {
                    wine_done: false,
                    dxvk_done: false,
                    highest: 0,
                    last_context: String::new(),
                    sent_any: false,
                }),
            }),
        }
    }

    /// The engine's progress as a status: a weighted download percent that never goes down, or the
    /// phase word (which also marks the artifact's download as finished).
    pub fn on_progress(&self, p: &FallbackProgress) {
        let context = {
            let mut st = self.inner.state.lock().unwrap_or_else(|e| e.into_inner());
            if p.phase == Phase::Downloading {
                let mut done = 0.0;
                if st.dxvk_done {
                    done += self.inner.dxvk_weight;
                }
                if st.wine_done {
                    done += self.inner.wine_weight;
                }
                let own = p.percentage.unwrap_or(0.0).clamp(0.0, 100.0) / 100.0;
                let weight = match p.artifact {
                    Artifact::Dxvk => self.inner.dxvk_weight,
                    Artifact::Wine => self.inner.wine_weight,
                };
                let total = self.inner.dxvk_weight + self.inner.wine_weight;
                let overall = if total > 0.0 {
                    ((100.0 * (done + own * weight)) / total).floor() as i64
                } else {
                    (own * 100.0).floor() as i64
                };
                st.highest = st.highest.max(overall);
                format!("downloading:{}", st.highest)
            } else {
                match p.artifact {
                    Artifact::Dxvk => st.dxvk_done = true,
                    Artifact::Wine => st.wine_done = true,
                }
                p.phase.as_str().to_string()
            }
        };
        self.send_context(&context);
    }

    fn send_context(&self, context: &str) {
        {
            let mut st = self.inner.state.lock().unwrap_or_else(|e| e.into_inner());
            if st.last_context == context {
                return;
            }
            st.last_context = context.to_string();
            st.sent_any = true;
        }
        self.inner.emitter.emit(
            STATUS_CHANNEL,
            vec![json!({
                "appName": self.inner.app_name,
                "runner": self.inner.runner,
                "status": "engine-download",
                "context": context,
            })],
        );
    }

    /// The engine is ready: `setting-up`, but only when this caller saw any status at all (an engine
    /// that was already installed says nothing).
    pub fn ready(&self) {
        let sent_any = self
            .inner
            .state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .sent_any;
        if sent_any {
            self.send_context("setting-up");
        }
    }

    /// A cancel or a quit: logged, then `done`.
    pub fn aborted(&self, log: Option<&dyn EngineLog>) {
        if let Some(log) = log {
            log.info(&format!(
                "built-in engine download aborted for {} {}",
                self.inner.runner, self.inner.app_name
            ));
        }
        self.done();
    }

    /// The engine could not be made available: logged with the reason, then `done`.
    pub fn failed(&self, log: Option<&dyn EngineLog>, reason: &str) {
        if let Some(log) = log {
            log.warn(&format!(
                "built-in engine unavailable for {} {}: {}",
                self.inner.runner, self.inner.app_name, reason
            ));
        }
        self.done();
    }

    fn done(&self) {
        self.inner.emitter.emit(
            STATUS_CHANNEL,
            vec![json!({
                "appName": self.inner.app_name,
                "runner": self.inner.runner,
                "status": "done",
            })],
        );
    }
}
