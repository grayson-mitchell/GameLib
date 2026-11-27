//! The funnel's in-memory launch sessions (88.3-07, D-08, D-31): one per launch that is past its pre-launch work
//! and about to hand the game to the `launch` hook.
//!
//! A game-class spawn does not know the funnel; the funnel does not know the spawn. They meet here: a spawn site
//! (any of the five launch sites, through `game::record::record_game_spawn`) asks [`LaunchSessions::for_run`]
//! with the run's `{ runner, key }` and, when a session answers, writes the launch record for it. The session
//! carries what the record needs (the times, the after-script's arguments, the record's path), the game's entry
//! once it is registered (the exit watch of a lost sidecar waits on it), and whether the quit's kill ended the
//! game (D-31), which the funnel's tail reads to skip the work that must not run inside the exit budget.
//!
//! A session is removed when its [`SessionGuard`] is dropped, however the launch ends. The record on disk is not
//! removed by that: a launch cancelled by the shutdown token leaves its game running and its record in place for
//! the next start to re-adopt; only [`SessionGuard::finish`] (the funnel ending normally) deletes it.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};

use crate::game::record::{LaunchRecord, RecordMember};
use crate::game::registry::EntryId;
use crate::runner::script::ScriptRunArgs;
use crate::runner::RunnerName;

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

/// What the quit-kill does for a session at the moment the kill ended its game: record the play time and
/// rewrite the record. Called with no sessions lock held, under the killed game's own handle lock, so it is
/// finished before the run that owns the game can reap it and the funnel's tail can start.
pub type QuitHook = Arc<dyn Fn(SessionId) + Send + Sync>;

/// One session's identity within a [`LaunchSessions`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SessionId(pub u64);

/// What a launch tells the sessions table when it begins one.
#[derive(Clone)]
pub struct SessionFacts {
    pub runner: RunnerName,
    pub app_name: String,
    /// `startPlayingDate` of the funnel: taken before any pre-launch work.
    pub launch_started_at_ms: u64,
    /// Taken right at the launch hook's call: the time the game ran from.
    pub start_playing_at_ms: u64,
    /// The after-script's arguments, when the game has one: they ride in the record so a crash owes the script.
    pub after_script: Option<ScriptRunArgs>,
    /// Where the record goes (`game::record::record_path`).
    pub record_path: PathBuf,
    /// What the quit-kill does for this session (`None`: nothing).
    pub on_quit: Option<QuitHook>,
}

struct SessionState {
    facts: SessionFacts,
    /// The game's registry entry, once a spawn site has attached it.
    entry: Option<EntryId>,
    /// The record as last written (or attempted), so a rewrite changes only what changed.
    record: Option<LaunchRecord>,
    quit_killed: bool,
}

#[derive(Default)]
struct Inner {
    next: u64,
    sessions: BTreeMap<u64, SessionState>,
}

/// The launches whose game the funnel is about to run or is running. A context owns its own.
#[derive(Default)]
pub struct LaunchSessions {
    inner: Mutex<Inner>,
}

impl LaunchSessions {
    pub fn new() -> LaunchSessions {
        LaunchSessions::default()
    }

    /// Begins a session; it ends when the guard is dropped.
    pub fn begin(self: &Arc<Self>, facts: SessionFacts) -> SessionGuard {
        let mut inner = lock(&self.inner);
        let id = SessionId(inner.next);
        inner.next += 1;
        inner.sessions.insert(
            id.0,
            SessionState {
                facts,
                entry: None,
                record: None,
                quit_killed: false,
            },
        );
        SessionGuard {
            sessions: Arc::clone(self),
            id,
        }
    }

    /// The session a run belongs to, from the `{ runner, key }` the run is registered under. The key is the
    /// app name at every launch site (`abortId`/`trackKey`), and the sideload Wine launch registers under the
    /// runner `wine`, which belongs to the `sideload` session.
    pub fn for_run(&self, runner: &str, key: &str) -> Option<SessionId> {
        lock(&self.inner)
            .sessions
            .iter()
            .find(|(_, state)| matches_run(&state.facts, runner, key))
            .map(|(id, _)| SessionId(*id))
    }

    pub fn is_empty(&self) -> bool {
        lock(&self.inner).sessions.is_empty()
    }

    /// The session's facts.
    pub fn facts(&self, id: SessionId) -> Option<SessionFacts> {
        lock(&self.inner)
            .sessions
            .get(&id.0)
            .map(|state| state.facts.clone())
    }

    /// Notes the game's registry entry.
    pub fn attach_entry(&self, id: SessionId, entry: EntryId) {
        if let Some(state) = lock(&self.inner).sessions.get_mut(&id.0) {
            state.entry = Some(entry);
        }
    }

    pub fn entry(&self, id: SessionId) -> Option<EntryId> {
        lock(&self.inner).sessions.get(&id.0).and_then(|s| s.entry)
    }

    /// Keeps the record as written.
    pub fn set_record(&self, id: SessionId, record: LaunchRecord) {
        if let Some(state) = lock(&self.inner).sessions.get_mut(&id.0) {
            state.record = Some(record);
        }
    }

    /// The record as last written.
    pub fn record(&self, id: SessionId) -> Option<LaunchRecord> {
        lock(&self.inner)
            .sessions
            .get(&id.0)
            .and_then(|s| s.record.clone())
    }

    /// Replaces the record's member list when it differs from the one last kept, answering the path and the
    /// record to write; `None` when nothing changed, nothing was written yet, or the quit-kill has the record.
    pub fn replace_members(
        &self,
        id: SessionId,
        members: Vec<RecordMember>,
    ) -> Option<(PathBuf, LaunchRecord)> {
        let mut inner = lock(&self.inner);
        let state = inner.sessions.get_mut(&id.0)?;
        if state.quit_killed {
            return None;
        }
        let record = state.record.as_mut()?;
        if record.members == members {
            return None;
        }
        record.members = members;
        Some((state.facts.record_path.clone(), record.clone()))
    }

    /// Marks the record quit-killed at `killed_at_ms`, answering the path and the record to write.
    pub fn quit_killed_record(
        &self,
        id: SessionId,
        killed_at_ms: u64,
    ) -> Option<(PathBuf, LaunchRecord)> {
        let mut inner = lock(&self.inner);
        let state = inner.sessions.get_mut(&id.0)?;
        let record = state.record.as_mut()?;
        record.state = crate::game::record::RecordState::QuitKilled;
        record.killed_at_ms = Some(killed_at_ms);
        Some((state.facts.record_path.clone(), record.clone()))
    }

    /// The quit's kill ended the game of the run `{ runner, key }` (D-31): the session is marked, so the
    /// funnel's tail skips what must not run inside the exit budget, and its quit hook runs (with no lock
    /// held). Nothing when no session owns the run.
    pub fn quit_killed(&self, runner: &str, key: &str) {
        let (id, hook) = {
            let mut inner = lock(&self.inner);
            let Some((id, state)) = inner
                .sessions
                .iter_mut()
                .find(|(_, state)| matches_run(&state.facts, runner, key))
            else {
                return;
            };
            state.quit_killed = true;
            (SessionId(*id), state.facts.on_quit.clone())
        };
        if let Some(hook) = hook {
            hook(id);
        }
    }

    pub fn is_quit_killed(&self, id: SessionId) -> bool {
        lock(&self.inner)
            .sessions
            .get(&id.0)
            .is_some_and(|s| s.quit_killed)
    }

    /// The record's path when the session ended normally and a record was written: the path to delete.
    fn take_path_to_remove(&self, id: SessionId) -> Option<PathBuf> {
        let mut inner = lock(&self.inner);
        let state = inner.sessions.get_mut(&id.0)?;
        if state.quit_killed {
            return None;
        }
        state.record.take()?;
        Some(state.facts.record_path.clone())
    }

    fn end(&self, id: SessionId) {
        lock(&self.inner).sessions.remove(&id.0);
    }
}

fn matches_run(facts: &SessionFacts, runner: &str, key: &str) -> bool {
    key == facts.app_name
        && (runner == facts.runner.as_str()
            || (facts.runner == RunnerName::Sideload
                && runner == crate::runner::wine_command::WINE_RUNNER))
}

/// A session, until it is dropped.
pub struct SessionGuard {
    sessions: Arc<LaunchSessions>,
    id: SessionId,
}

impl SessionGuard {
    pub fn id(&self) -> SessionId {
        self.id
    }

    /// Whether the quit's kill ended this session's game.
    pub fn quit_killed(&self) -> bool {
        self.sessions.is_quit_killed(self.id)
    }

    /// The game's registry entry, once it has spawned.
    pub fn entry(&self) -> Option<EntryId> {
        self.sessions.entry(self.id)
    }

    /// The funnel ended this launch normally: the record is deleted (a regular-file delete of the computed
    /// path, nothing recursive). A quit-killed session keeps its record, and so does one that is dropped
    /// without this call (the shutdown token fired and the game was left running).
    pub fn finish(&self) {
        if let Some(path) = self.sessions.take_path_to_remove(self.id) {
            // A record that will not go is left for the next start, which proves it before it believes it.
            let _ = crate::game::record::remove_record(&path);
        }
    }
}

impl Drop for SessionGuard {
    fn drop(&mut self) {
        self.sessions.end(self.id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn facts(runner: RunnerName, app: &str) -> SessionFacts {
        SessionFacts {
            runner,
            app_name: app.to_string(),
            launch_started_at_ms: 1,
            start_playing_at_ms: 2,
            after_script: None,
            record_path: PathBuf::from("/nowhere/record.json"),
            on_quit: None,
        }
    }

    #[test]
    fn a_run_finds_its_session_by_key_and_the_wine_runner_belongs_to_sideload() {
        let sessions = Arc::new(LaunchSessions::new());
        let legendary = sessions.begin(facts(RunnerName::Legendary, "alpha"));
        let sideload = sessions.begin(facts(RunnerName::Sideload, "beta"));
        assert_eq!(sessions.for_run("legendary", "alpha"), Some(legendary.id()));
        assert_eq!(sessions.for_run("sideload", "beta"), Some(sideload.id()));
        assert_eq!(sessions.for_run("wine", "beta"), Some(sideload.id()));
        // Another key, another runner, and the wine runner of a store game belong to no session.
        assert_eq!(sessions.for_run("legendary", "beta"), None);
        assert_eq!(sessions.for_run("gog", "alpha"), None);
        assert_eq!(sessions.for_run("wine", "alpha"), None);
        drop(legendary);
        assert_eq!(sessions.for_run("legendary", "alpha"), None);
    }

    #[test]
    fn a_dropped_guard_ends_its_session_and_the_quit_hook_runs_once_with_no_lock_held() {
        let sessions = Arc::new(LaunchSessions::new());
        let seen = Arc::new(Mutex::new(Vec::new()));
        let mut with_hook = facts(RunnerName::Gog, "gamma");
        {
            let seen = Arc::clone(&seen);
            let again = Arc::clone(&sessions);
            with_hook.on_quit = Some(Arc::new(move |id| {
                // Taking the table's lock again from the hook would deadlock if the call held it.
                assert!(again.is_quit_killed(id));
                lock(&seen).push(id);
            }));
        }
        let guard = sessions.begin(with_hook);
        assert!(!guard.quit_killed());
        sessions.quit_killed("gog", "gamma");
        assert!(guard.quit_killed());
        assert_eq!(*lock(&seen), vec![guard.id()]);
        // No session, no hook.
        sessions.quit_killed("gog", "other");
        assert_eq!(lock(&seen).len(), 1);
        drop(guard);
        assert!(sessions.is_empty());
    }
}
