//! Re-adoption (88.3-09, D-08 to D-10, D-31): what the next start does with the launch records a funnel launch left
//! under `<appFolder>/launches/`.
//!
//! A game is its own session and outlives a GameLib that crashed or was Force Quit (D-05). Its record says which
//! process it was. [`start`] reads the records once at boot, inside [`READOPT_BOOT_BOUND`] and at most
//! [`READOPT_RECORD_CAP`] of them, and for each:
//!
//! - a `running` record whose game `gamelib_proc::adopt::identify` still proves (the leader's pid and start stamp
//!   first, then a recorded member, then the Windows Game Job) is **adopted**: it gets a session (so the quit's
//!   kill reaches it like a live launch), an [`AdoptedEntry`](super::registry::AdoptedEntry) in the registry (so the
//!   quit dialog asks about it and a Stop ends it through its proof), one fixed line in the game's own log, and an
//!   exit watch;
//! - a `running` record whose game is gone, or whose pid now belongs to another process, is removed. Nothing is
//!   signalled and no play time is recorded: nothing proves when the game ended;
//! - a `quitKilled` record is a launch the quit ended: its play time was recorded then, and its after-script is
//!   owed (D-31). It runs as a Helper in a bounded task, and the record is removed after it;
//! - a file that cannot be read as a record is removed only when it is a regular file the current user owns.
//!
//! **A record is only a claim.** Nothing here signals a process on a record's word: the proof is repeated by
//! `kill_adopted_tree` right before any signal, and a record is never used to start anything.
//!
//! **The exit watch** holds a shutdown registrant from adoption to the end of its tail and ends on the shutdown
//! token with nothing signalled and the record kept. When the game is over it records play time, runs the
//! after-script (bounded by the shutdown token and [`READOPT_SCRIPT_LIMIT`]), sends `done`, removes the record and
//! unregisters. If the quit's kill ended the game, the kill's observer already recorded play time and marked the
//! record `quitKilled`, so the tail only says so and leaves the record for the next start.
//!
//! **Not captured (D-09).** A re-adopted game's output is not tailed any more: the game's log gains one fixed line
//! saying so, appended with no rotation. `.planning/todos/pending/2026-11-27-resume-log-capture-for-a-re-adopted-game-from-its-capture-file.md`
//! owns the idea of resuming from the capture file.
//!
//! Every line written to `gamelib.log` is fixed text: a count, a word, never a path, a pid or a record's content.

use std::path::Path;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use gamelib_log::{Level, Prefix};
use gamelib_proc::adopt::{identify, AdoptProof, Identity, Member};
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;

use super::end::GROUP_POLL;
use super::record::{
    is_ours_regular_file, read_record, record_path, remove_record, LaunchRecord, RecordError,
    RecordState,
};
use super::registry::{AdoptedEntry, EntryId, RunIds};
use crate::ctx::LaunchCtx;
use crate::funnel::log::LaunchLog;
use crate::funnel::playtime::record_session_playtime;
use crate::funnel::run::begin_session;
use crate::funnel::session::SessionGuard;
use crate::runner::call_runner::RunnerHost;
use crate::runner::script::{run_script_for_game, ScriptRunArgs};
use crate::runner::RunnerName;

/// How long the boot scan may spend reading records. What is left when it runs out is left for the next boot.
pub const READOPT_BOOT_BOUND: Duration = Duration::from_secs(2);

/// How many records one boot reads (T-88.3-21).
pub const READOPT_RECORD_CAP: usize = 64;

/// How long an owed or exit after-script may run. The shutdown token ends it sooner (the script is stopped with
/// GameLib).
pub const READOPT_SCRIPT_LIMIT: Duration = Duration::from_secs(5 * 60);

/// The most directory entries one scan looks at, so a folder full of files cannot stall the boot before the first
/// record is read.
const ENUMERATE_LIMIT: usize = 1024;

/// The one line a re-adopted game's own log gains (D-09): fixed, naming no path.
pub const RE_ADOPTED_LINE: &str =
    "GameLib restarted while this game was running and has re-adopted it. No further output of this session is captured.";

/// What the boot scan did, as counts only.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ReadoptReport {
    /// Games proved and registered as running.
    pub adopted: usize,
    /// Records removed: a game that was gone or not ours, a file that was not a record.
    pub removed: usize,
    /// `quitKilled` records whose after-script was started.
    pub owed_scripts: usize,
    /// Records left for the next boot: past the cap or the deadline, or refused and not ours to remove.
    pub skipped: usize,
}

/// [`start_with_host`] over an empty script environment: a script that needs `HOME` or `PATH` wants the shell's
/// own host, which only the shell has.
pub fn start(ctx: &LaunchCtx) -> ReadoptReport {
    start_with_host(ctx, &RunnerHost::default())
}

/// The boot scan (D-08, D-31), with the environment an owed or exit after-script inherits (`host`, as the
/// funnel's own scripts get it from the shell).
pub fn start_with_host(ctx: &LaunchCtx, host: &RunnerHost) -> ReadoptReport {
    start_bounded(ctx, host, READOPT_RECORD_CAP, READOPT_BOOT_BOUND)
}

/// [`start_with_host`] with its two bounds as arguments (the tests prove them without 64 records or two seconds).
pub fn start_bounded(
    ctx: &LaunchCtx,
    host: &RunnerHost,
    cap: usize,
    bound: Duration,
) -> ReadoptReport {
    let deadline = Instant::now() + bound;
    let mut report = ReadoptReport::default();
    let app_folder = ctx.engine.paths.app_folder.clone();
    let names = record_names(&app_folder.join("launches"));
    let mut read = 0;
    for name in &names {
        if read >= cap || Instant::now() >= deadline {
            break;
        }
        read += 1;
        process_record(
            ctx,
            host,
            &app_folder.join("launches").join(name),
            &mut report,
        );
    }
    let left = names.len() - read;
    if left > 0 {
        report.skipped += left;
        general(
            ctx,
            Level::Warning,
            &format!("Launch re-adoption left {left} launch records for the next start"),
        );
    }
    report
}

/// The `.json` file names of the launches folder, sorted, at most [`ENUMERATE_LIMIT`]. A folder that is missing,
/// or a symlink or another non-directory, has none (nothing follows a link out of the app folder).
fn record_names(dir: &Path) -> Vec<String> {
    match std::fs::symlink_metadata(dir) {
        Ok(meta) if meta.file_type().is_dir() => {}
        _ => return Vec::new(),
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .take(ENUMERATE_LIMIT)
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| name.ends_with(".json"))
        .collect();
    names.sort_unstable();
    names
}

fn general(ctx: &LaunchCtx, level: Level, text: &str) {
    ctx.log_sink.general(Prefix::Backend, level, text);
}

fn parse_runner(word: &str) -> Option<RunnerName> {
    serde_json::from_value(Value::String(word.to_string())).ok()
}

/// `gameStatusUpdate` to the renderer.
fn emit_status(ctx: &LaunchCtx, runner: &str, app_name: &str, status: &str) {
    ctx.engine.emitter.emit(
        "gameStatusUpdate",
        vec![json!({ "appName": app_name, "runner": runner, "status": status })],
    );
}

/// Removes a file that is not a record, only when it is a regular file the current user owns. Counts it removed
/// or, when it is someone else's or not a plain file, left.
fn remove_unreadable(ctx: &LaunchCtx, path: &Path, why: &str, report: &mut ReadoptReport) {
    if is_ours_regular_file(path) && remove_record(path).is_ok() {
        report.removed += 1;
        return;
    }
    report.skipped += 1;
    general(
        ctx,
        Level::Warning,
        &format!("Launch record refused and left in place ({why})"),
    );
}

fn process_record(ctx: &LaunchCtx, host: &RunnerHost, path: &Path, report: &mut ReadoptReport) {
    let record = match read_record(path) {
        Ok(record) => record,
        Err(RecordError::Decode | RecordError::TooLarge | RecordError::Insecure) => {
            let why = "unreadable";
            return remove_unreadable(ctx, path, why, report);
        }
        Err(e) => {
            // A newer build's record, an I/O error, a link or a folder: not ours to judge or to delete.
            report.skipped += 1;
            general(
                ctx,
                Level::Warning,
                &format!("Launch record refused and left in place ({})", e.word()),
            );
            return;
        }
    };
    // The file must be the one this record's own runner and app name compute: a misfiled record is not one
    // GameLib wrote.
    let runner = parse_runner(&record.runner);
    let expected =
        runner.map(|runner| record_path(&ctx.engine.paths.app_folder, runner, &record.app_name));
    let (Some(runner), Some(expected)) = (runner, expected) else {
        return remove_unreadable(ctx, path, "runner", report);
    };
    if expected != path || record.pid <= 1 {
        return remove_unreadable(ctx, path, "misfiled", report);
    }
    // A game GameLib already tracks in this run is not touched.
    if ctx.registry.contains(&record.runner, &record.app_name)
        || ctx
            .sessions
            .for_run(&record.runner, &record.app_name)
            .is_some()
    {
        report.skipped += 1;
        return;
    }
    match record.state {
        RecordState::QuitKilled => owed_script(ctx, host, runner, record, path, report),
        RecordState::Running => {
            let proof = AdoptProof {
                leader_pid: record.pid,
                leader_stamp: record.stamp,
                members: record.members.iter().copied().map(Member::from).collect(),
            };
            match identify(&proof) {
                Identity::Leader | Identity::Member(_) | Identity::Job => {
                    if adopt(ctx, host, runner, record, proof) {
                        report.adopted += 1;
                    } else {
                        report.skipped += 1;
                    }
                }
                // Gone, or the pid is another process now: nothing is signalled and nothing is recorded.
                Identity::Gone | Identity::NotOurs => {
                    if remove_record(path).is_ok() {
                        report.removed += 1;
                    } else {
                        report.skipped += 1;
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// A quit-killed launch's owed after-script (D-31)
// ---------------------------------------------------------------------------------------------

fn owed_script(
    ctx: &LaunchCtx,
    host: &RunnerHost,
    runner: RunnerName,
    record: LaunchRecord,
    path: &Path,
    report: &mut ReadoptReport,
) {
    let Some(args) = record.after_script.clone() else {
        // Owes nothing: its play time was recorded at the quit.
        if remove_record(path).is_ok() {
            report.removed += 1;
        } else {
            report.skipped += 1;
        }
        return;
    };
    let Some(handle) = crate::task_handle() else {
        report.skipped += 1;
        return;
    };
    report.owed_scripts += 1;
    let (ctx, host, path) = (ctx.clone(), host.clone(), path.to_path_buf());
    handle.spawn(async move {
        // Held for as long as the script runs, so the exit waits for it (or cancels it).
        let _registrant = ctx.engine.shutdown.register("readopt-owed-script");
        let log = LaunchLog::open_appending(ctx.log_sink.clone(), &record.app_name, runner);
        let end = run_after_script(&ctx, &host, args, &log).await;
        // A script the shutdown stopped is still owed: its record stays for the next start.
        if end != ScriptEnd::Stopped {
            let _ = remove_record(&path);
        }
    });
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ScriptEnd {
    Ran,
    Failed,
    /// GameLib is closing and the script was stopped with it.
    Stopped,
}

/// Runs a game's after-script as a Helper, writing to the game's log as the funnel's own scripts do, bounded by
/// the shutdown token and [`READOPT_SCRIPT_LIMIT`]. A script that cannot be started or runs out of time is a
/// fixed line, never its text.
async fn run_after_script(
    ctx: &LaunchCtx,
    host: &RunnerHost,
    mut args: ScriptRunArgs,
    log: &LaunchLog,
) -> ScriptEnd {
    // The record could not carry the writer: the game's log, appended to, is where the script's output goes.
    args.log_target = args.verbose.then(|| log.hand_off().to_runner_hand_off());
    let result =
        tokio::time::timeout(READOPT_SCRIPT_LIMIT, run_script_for_game(ctx, args, host)).await;
    match result {
        Ok(Ok(_)) => ScriptEnd::Ran,
        Ok(Err(_)) if ctx.engine.shutdown.token().is_cancelled() => ScriptEnd::Stopped,
        Ok(Err(_)) => {
            general(
                ctx,
                Level::Warning,
                "The after script of a re-adopted launch could not run",
            );
            ScriptEnd::Failed
        }
        Err(_) => {
            general(
                ctx,
                Level::Warning,
                "The after script of a re-adopted launch ran out of time",
            );
            ScriptEnd::Failed
        }
    }
}

// ---------------------------------------------------------------------------------------------
// An adopted game
// ---------------------------------------------------------------------------------------------

/// Unregisters the adopted entry when dropped, the watch ending however it ends.
struct AdoptedGuard<'a> {
    ctx: &'a LaunchCtx,
    id: EntryId,
}

impl Drop for AdoptedGuard<'_> {
    fn drop(&mut self) {
        self.ctx.registry.unregister_adopted(self.id);
    }
}

/// Registers the proved game and starts its exit watch. `false` when there is nowhere to run the watch (the
/// record is left for the next boot).
fn adopt(
    ctx: &LaunchCtx,
    host: &RunnerHost,
    runner: RunnerName,
    record: LaunchRecord,
    proof: AdoptProof,
) -> bool {
    let Some(handle) = crate::task_handle() else {
        return false;
    };
    let app_name = record.app_name.clone();
    // The session first: the quit's kill finds the game through it the moment the entry is registered.
    let session = begin_session(
        ctx,
        runner,
        &app_name,
        record.launch_started_at_ms,
        record.start_playing_at_ms,
        record.after_script.clone(),
    );
    ctx.sessions.set_record(session.id(), record.clone());
    let ids = RunIds {
        runner: runner.as_str().to_string(),
        key: app_name.clone(),
        abort_id: app_name.clone(),
        stream_id: String::new(),
    };
    let entry = ctx
        .registry
        .register_adopted(ids, ctx.engine.clock.now_ms(), proof);
    ctx.sessions.attach_entry(session.id(), entry);

    // D-09: one line, appended to the log the crashed GameLib was writing.
    let mut log = LaunchLog::open_appending(ctx.log_sink.clone(), &app_name, runner);
    log.write_line(Level::Info, Prefix::General, RE_ADOPTED_LINE, true);

    // Pitfall 9: a renderer that is already listening hears of it at once; otherwise `announce` will.
    if ctx.frontend_ready.load(Ordering::SeqCst) {
        emit_status(ctx, runner.as_str(), &app_name, "playing");
    }

    let (ctx, host) = (ctx.clone(), host.clone());
    handle.spawn(async move {
        watch(ctx, host, runner, entry, session, record, log).await;
    });
    true
}

/// Sends `gameStatusUpdate { status: 'playing' }` for every adopted game and marks the context frontend-ready, so
/// a game adopted after this is announced as it is adopted (Pitfall 9). Answers how many it announced. The shell
/// calls it on every `frontendReady` (88.3-12).
pub fn announce(ctx: &LaunchCtx) -> usize {
    // Marked first: an adoption racing this call either is listed below or sees the mark and announces itself.
    ctx.frontend_ready.store(true, Ordering::SeqCst);
    let adopted = ctx.registry.adopted();
    for entry in &adopted {
        emit_status(ctx, &entry.ids.runner, &entry.ids.key, "playing");
    }
    adopted.len()
}

/// Sleeps `period`; `true` when `token` fired first.
async fn cancelled_during(token: &CancellationToken, period: Duration) -> bool {
    tokio::select! {
        biased;
        _ = token.cancelled() => true,
        _ = tokio::time::sleep(period) => false,
    }
}

/// The adopted game's exit watch and the tail of its session.
async fn watch(
    ctx: LaunchCtx,
    host: RunnerHost,
    runner: RunnerName,
    entry: EntryId,
    session: SessionGuard,
    record: LaunchRecord,
    mut log: LaunchLog,
) {
    // Held from adoption to the end of the tail, and no longer.
    let _registrant = ctx.engine.shutdown.register("readopt-watch");
    let token = ctx.engine.shutdown.token();
    let _entry = AdoptedGuard {
        ctx: &ctx,
        id: entry,
    };
    let Some(adopted) = ctx.registry.adopted_entry(entry) else {
        return;
    };
    let app_name = record.app_name.as_str();

    // GameLib is closing: nothing is signalled and the record stays for the next start.
    if !wait_for_end(&adopted, &token).await {
        return;
    }
    // A kill in progress holds the gate until its bookkeeping is done; after this nothing signals the game.
    if !adopted.finish_session(&token, GROUP_POLL).await {
        return;
    }

    if session.quit_killed() {
        // Play time was recorded at the kill and the record says `quitKilled` (the kill's observer).
        general(
            &ctx,
            Level::Info,
            &format!(
                "{app_name} was ended by the quit; its after script is owed to the next start"
            ),
        );
        log.close();
        emit_status(&ctx, runner.as_str(), app_name, "done");
        return;
    }

    let ended_ms = ctx.engine.clock.now_ms();
    record_session_playtime(
        &ctx,
        runner,
        app_name,
        record.launch_started_at_ms,
        record.start_playing_at_ms,
        ended_ms,
    );
    if let Some(args) = record.after_script.clone() {
        if run_after_script(&ctx, &host, args, &log).await == ScriptEnd::Stopped {
            // The play time is recorded: what is owed now is only the script, as after a quit.
            super::record::mark_quit_killed(&ctx, session.id(), ended_ms);
            return;
        }
    }
    log.close();
    emit_status(&ctx, runner.as_str(), app_name, "done");
    // The game and its after script are over: the record has nothing left to prove.
    session.finish();
}

/// Polls the proof until the game is over. `false` when the shutdown token fired first.
async fn wait_for_end(entry: &AdoptedEntry, token: &CancellationToken) -> bool {
    loop {
        if matches!(identify(&entry.proof), Identity::Gone | Identity::NotOurs) {
            return true;
        }
        if cancelled_during(token, GROUP_POLL).await {
            return false;
        }
    }
}
