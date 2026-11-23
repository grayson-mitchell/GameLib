//! The environment reports of one boot (`winetricksEnvironment.ts`, D-16): environment-level
//! warnings (an unsupported wine version, missing host dependencies) surfaced alongside a queue run,
//! kept per game rather than on a run, because they can be known with no run in flight (right after
//! the tab mounts) and must survive a run ending.
//!
//! Pure state plus one change-listener slot, owned by the context's
//! [`ToolsState`](crate::tools::state::ToolsState) so every op of a boot shares it. No timer, no
//! watcher, no I/O. The listener is the queue's (87-33): it is called after the report is stored and
//! outside the lock, so it may read the report back.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};

use serde::Serialize;

/// What the renderer's banner shows (`WinetricksEnvironmentReport`).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentReport {
    /// The wine version winetricks no longer supports, `None` when the bottle's wine is supported
    /// (or has not been probed).
    pub unsupported_wine_version: Option<String>,
    /// The host dependencies `which` did not find, sorted.
    pub missing_dependencies: Vec<String>,
}

/// Called with `(runner, app_name)` after a report changed.
pub type ChangeListener = Arc<dyn Fn(&str, &str) + Send + Sync>;

/// The reports and the single listener slot of one boot.
#[derive(Default)]
pub struct WinetricksEnvironment {
    reports: Mutex<HashMap<String, EnvironmentReport>>,
    listener: Mutex<Option<ChangeListener>>,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    // A panic while a guard was held leaves the data as it was; the state is plain values.
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

fn key(runner: &str, app_name: &str) -> String {
    format!("{runner}:{app_name}")
}

impl WinetricksEnvironment {
    pub fn new() -> WinetricksEnvironment {
        WinetricksEnvironment::default()
    }

    /// Sets the one listener (a second call replaces the first, as the TS slot did).
    pub fn on_changed(&self, listener: ChangeListener) {
        *lock(&self.listener) = Some(listener);
    }

    /// The report of a game: an empty one when nothing was recorded. A copy, so a caller can never
    /// change the stored one.
    pub fn report(&self, runner: &str, app_name: &str) -> EnvironmentReport {
        lock(&self.reports)
            .get(&key(runner, app_name))
            .cloned()
            .unwrap_or_default()
    }

    fn notify(&self, runner: &str, app_name: &str) {
        let listener = lock(&self.listener).clone();
        if let Some(listener) = listener {
            listener(runner, app_name);
        }
    }

    /// Records the exact missing subset (an empty one clears an earlier record). No change, no call.
    pub fn record_missing_dependencies(&self, runner: &str, app_name: &str, deps: &[String]) {
        {
            let mut reports = lock(&self.reports);
            let current = reports.entry(key(runner, app_name)).or_default();
            if current.missing_dependencies == deps {
                return;
            }
            current.missing_dependencies = deps.to_vec();
        }
        self.notify(runner, app_name);
    }

    /// Records the wine version winetricks does not support; `None` means "this bottle's wine is
    /// supported" and only the list-all probe (`check_wine_version`) ever writes it. No change, no
    /// call.
    pub fn record_unsupported_wine(&self, runner: &str, app_name: &str, version: Option<&str>) {
        {
            let mut reports = lock(&self.reports);
            let current = reports.entry(key(runner, app_name)).or_default();
            if current.unsupported_wine_version.as_deref() == version {
                return;
            }
            current.unsupported_wine_version = version.map(str::to_string);
        }
        self.notify(runner, app_name);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn counting() -> (Arc<AtomicUsize>, ChangeListener) {
        let calls = Arc::new(AtomicUsize::new(0));
        let seen = calls.clone();
        (
            calls,
            Arc::new(move |_, _| {
                seen.fetch_add(1, Ordering::SeqCst);
            }),
        )
    }

    #[test]
    fn an_unseen_game_has_an_empty_report() {
        let env = WinetricksEnvironment::new();
        assert_eq!(env.report("gog", "1"), EnvironmentReport::default());
    }

    #[test]
    fn only_a_change_calls_the_listener() {
        let env = WinetricksEnvironment::new();
        let (calls, listener) = counting();
        env.on_changed(listener);
        let deps = vec!["7z".to_string(), "zenity".to_string()];
        env.record_missing_dependencies("gog", "1", &deps);
        env.record_missing_dependencies("gog", "1", &deps);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        env.record_missing_dependencies("gog", "1", &[]);
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        // null -> null is a no-op, as is an empty first record.
        env.record_unsupported_wine("gog", "1", None);
        env.record_missing_dependencies("gog", "2", &[]);
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        env.record_unsupported_wine("gog", "1", Some("7.7"));
        env.record_unsupported_wine("gog", "1", Some("7.7"));
        assert_eq!(calls.load(Ordering::SeqCst), 3);
        env.record_unsupported_wine("gog", "1", None);
        assert_eq!(calls.load(Ordering::SeqCst), 4);
    }

    #[test]
    fn a_returned_report_is_a_copy() {
        let env = WinetricksEnvironment::new();
        env.record_missing_dependencies("gog", "1", &["curl".to_string()]);
        let mut report = env.report("gog", "1");
        report.missing_dependencies.clear();
        assert_eq!(env.report("gog", "1").missing_dependencies, ["curl"]);
    }

    #[test]
    fn the_report_serialises_like_the_ts_object() {
        let report = EnvironmentReport {
            unsupported_wine_version: Some("7.7".into()),
            missing_dependencies: vec!["7z".into()],
        };
        assert_eq!(
            serde_json::to_value(&report).unwrap(),
            serde_json::json!({"unsupportedWineVersion": "7.7", "missingDependencies": ["7z"]})
        );
    }
}
