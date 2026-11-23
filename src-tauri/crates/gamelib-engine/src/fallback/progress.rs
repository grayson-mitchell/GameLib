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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pins::pins;
    use crate::testing::{RecordingEmitter, RecordingLog};

    fn contexts(emitter: &RecordingEmitter) -> Vec<String> {
        emitter
            .pushed()
            .iter()
            .map(|(_, args)| {
                args[0]["context"]
                    .as_str()
                    .or(args[0]["status"].as_str())
                    .unwrap()
                    .to_string()
            })
            .collect()
    }

    fn step(phase: Phase, artifact: Artifact, percentage: Option<f64>) -> FallbackProgress {
        FallbackProgress {
            phase,
            artifact,
            percentage,
        }
    }

    #[test]
    fn the_percent_is_weighted_across_both_archives_and_never_goes_down() {
        let emitter = Arc::new(RecordingEmitter::new());
        let pin = pins().unwrap().current.clone();
        let reporter = Reporter::new(emitter.clone(), "app", "nile", &pin);
        reporter.on_progress(&step(Phase::Downloading, Artifact::Dxvk, Some(0.0)));
        reporter.on_progress(&step(Phase::Downloading, Artifact::Dxvk, Some(100.0)));
        reporter.on_progress(&step(Phase::Verifying, Artifact::Dxvk, None));
        reporter.on_progress(&step(Phase::Extracting, Artifact::Dxvk, None));
        // Wine starts at 0% of its own: the overall figure is the DXVK share, not a reset to 0.
        reporter.on_progress(&step(Phase::Downloading, Artifact::Wine, Some(0.0)));
        reporter.on_progress(&step(Phase::Downloading, Artifact::Wine, Some(100.0)));
        let dxvk_share =
            (100.0 * pin.dxvk.size as f64 / (pin.dxvk.size + pin.wine.size) as f64).floor() as i64;
        assert_eq!(
            contexts(&emitter),
            vec![
                "downloading:0".to_string(),
                format!("downloading:{dxvk_share}"),
                "verifying".to_string(),
                "extracting".to_string(),
                // The same figure after a phase word is a new context, so it is sent again.
                format!("downloading:{dxvk_share}"),
                "downloading:100".to_string(),
            ]
        );
    }

    #[test]
    fn a_repeated_context_is_sent_once_and_setting_up_follows_only_after_a_status() {
        let emitter = Arc::new(RecordingEmitter::new());
        let pin = pins().unwrap().current.clone();
        let quiet = Reporter::new(emitter.clone(), "app", "nile", &pin);
        quiet.ready();
        assert!(
            emitter.pushed().is_empty(),
            "an installed engine says nothing"
        );

        let reporter = Reporter::new(emitter.clone(), "app", "nile", &pin);
        let zero = step(Phase::Downloading, Artifact::Dxvk, Some(0.0));
        reporter.on_progress(&zero);
        reporter.on_progress(&zero);
        reporter.on_progress(&step(Phase::Downloading, Artifact::Dxvk, Some(-5.0)));
        reporter.ready();
        assert_eq!(contexts(&emitter), vec!["downloading:0", "setting-up"]);
    }

    #[test]
    fn a_failure_and_an_abort_are_logged_and_end_with_done() {
        let emitter = Arc::new(RecordingEmitter::new());
        let log = RecordingLog::new();
        let pin = pins().unwrap().current.clone();
        let reporter = Reporter::new(emitter.clone(), "app", "nile", &pin);
        reporter.failed(Some(&log), "hash-mismatch");
        reporter.aborted(Some(&log));
        assert_eq!(
            log.lines(),
            vec![
                (
                    "warn",
                    "built-in engine unavailable for nile app: hash-mismatch".to_string()
                ),
                (
                    "info",
                    "built-in engine download aborted for nile app".to_string()
                ),
            ]
        );
        assert_eq!(contexts(&emitter), vec!["done", "done"]);
    }
}
