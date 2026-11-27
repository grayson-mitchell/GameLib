//! The per-launch record (88.3-07, D-08): `<appFolder>/launches/<runner>-<safe app name>.json`, a plain file
//! (not a store kind, RESEARCH A1) that a funnel launch writes when its game spawns and deletes when the funnel
//! ends the session normally. After a crash it is what the next start has to find the game again: the leader's
//! pid and start stamp, the process group, and the live members seen while GameLib ran (Pitfall 10: the Wine
//! loader exits about a second in and the game lives on in the group), plus the after-script's arguments, which a
//! crash or a quit owes.
//!
//! **One writer.** [`record_game_spawn`] is the only function that builds a [`LaunchRecord`] for a spawn; both
//! game arms (`call_runner`'s and `wine_command`'s) call it. It never fails the launch: a record that cannot be
//! written is one fixed `gamelib.log` line.
//!
//! **Files (T-88.3-15, RESEARCH V12).** A write creates the temp sibling with `create_new` and mode 0600, syncs it
//! and renames it over the target, and refuses a symlink at the target or at the `launches` folder. A read takes a
//! regular file only (opened `O_NOFOLLOW` on unix), at most [`RECORD_MAX_BYTES`], owned by the current user and
//! readable by nobody else, decoded strictly (`deny_unknown_fields`, one `version`). A record is only ever a
//! claim: whoever acts on one proves the process again (`gamelib_proc::adopt`) before it signals anything.

use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use gamelib_log::{Level, Prefix};
use gamelib_proc::adopt::{snapshot_members, Member};
use gamelib_proc::probe;
use serde::{Deserialize, Serialize};

use super::capture::safe_name;
use super::registry::GameEntry;
use crate::ctx::LaunchCtx;
use crate::funnel::session::SessionId;
use crate::runner::script::ScriptRunArgs;
use crate::runner::RunnerName;

/// The record format this build writes and reads.
pub const RECORD_VERSION: u32 = 1;

/// The largest record the reader accepts (and the writer produces).
pub const RECORD_MAX_BYTES: u64 = 64 * 1024;

/// One process of the game's tree: its pid and `probe::start_time` stamp.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecordMember {
    pub pid: u32,
    pub stamp: u64,
}

impl From<Member> for RecordMember {
    fn from(member: Member) -> RecordMember {
        RecordMember {
            pid: member.pid,
            stamp: member.stamp,
        }
    }
}

impl From<RecordMember> for Member {
    fn from(member: RecordMember) -> Member {
        Member {
            pid: member.pid,
            stamp: member.stamp,
        }
    }
}

/// Where the launch stands: `running` until the funnel ends it, `quitKilled` once the quit's kill ended the game
/// and the after-script is owed to the next start (D-31).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RecordState {
    Running,
    QuitKilled,
}

/// One launch's record.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LaunchRecord {
    pub version: u32,
    pub runner: String,
    pub app_name: String,
    /// The game leader's pid and its `probe::start_time` stamp.
    pub pid: u32,
    pub stamp: u64,
    /// The leader's process group (the leader's own pid; on Windows the pid, which names the Game Job).
    pub pgid: u32,
    /// The live members of the tree other than the leader, as last seen.
    pub members: Vec<RecordMember>,
    pub launch_started_at_ms: u64,
    pub start_playing_at_ms: u64,
    pub state: RecordState,
    /// When the quit's kill ended the game (`state` is `quitKilled`).
    #[serde(default)]
    pub killed_at_ms: Option<u64>,
    /// The after-script this launch still owes, when its game has one.
    #[serde(default)]
    pub after_script: Option<ScriptRunArgs>,
}

/// Why a record was not written or not accepted. Fixed words only: a record's own text is never echoed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecordError {
    Io(io::ErrorKind),
    /// A symlink, a directory or another non-regular file where a record (or its folder) belongs.
    NotRegular,
    /// More than [`RECORD_MAX_BYTES`].
    TooLarge,
    /// Another owner, or readable by group or other.
    Insecure,
    /// Not a record: bad JSON, an unknown field or a missing one.
    Decode,
    /// A record of another `version`.
    Version,
}

impl RecordError {
    pub fn word(self) -> &'static str {
        match self {
            RecordError::Io(_) => "io",
            RecordError::NotRegular => "not-regular",
            RecordError::TooLarge => "too-large",
            RecordError::Insecure => "insecure",
            RecordError::Decode => "decode",
            RecordError::Version => "version",
        }
    }
}

fn io_error(e: io::Error) -> RecordError {
    RecordError::Io(e.kind())
}

/// `<app_folder>/launches/<runner>-<safe app name>.json`, the file name built the way the capture file's is.
pub fn record_path(app_folder: &Path, runner: RunnerName, app_name: &str) -> PathBuf {
    app_folder
        .join("launches")
        .join(format!("{}-{}.json", runner.as_str(), safe_name(app_name)))
}

/// The folder the record goes in: made (0700 on unix) when missing, refused when it is a symlink.
fn ensure_dir(dir: &Path) -> Result<(), RecordError> {
    match std::fs::symlink_metadata(dir) {
        Ok(meta) if meta.file_type().is_dir() => Ok(()),
        Ok(_) => Err(RecordError::NotRegular),
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            let mut builder = std::fs::DirBuilder::new();
            builder.recursive(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::DirBuilderExt;
                builder.mode(0o700);
            }
            builder.create(dir).map_err(io_error)
        }
        Err(e) => Err(io_error(e)),
    }
}

static TEMP_SERIAL: AtomicU64 = AtomicU64::new(0);

/// Writes `record` to `path`: a `create_new` temp sibling (0600), written, synced, renamed over the target.
/// Refuses a symlink (or any non-regular file) at the target, and a record over [`RECORD_MAX_BYTES`].
pub fn write_atomic(path: &Path, record: &LaunchRecord) -> Result<(), RecordError> {
    let bytes = serde_json::to_vec(record).map_err(|_| RecordError::Decode)?;
    if bytes.len() as u64 > RECORD_MAX_BYTES {
        return Err(RecordError::TooLarge);
    }
    let dir = path.parent().ok_or(RecordError::NotRegular)?;
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or(RecordError::NotRegular)?;
    ensure_dir(dir)?;
    match std::fs::symlink_metadata(path) {
        Ok(meta) if !meta.file_type().is_file() => return Err(RecordError::NotRegular),
        Ok(_) => {}
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(e) => return Err(io_error(e)),
    }
    let temp = dir.join(format!(
        "{name}.tmp-{}-{}",
        std::process::id(),
        TEMP_SERIAL.fetch_add(1, Ordering::Relaxed)
    ));
    let written = (|| -> io::Result<()> {
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        drop(file);
        std::fs::rename(&temp, path)
    })();
    if let Err(e) = written {
        let _ = std::fs::remove_file(&temp);
        return Err(io_error(e));
    }
    Ok(())
}

/// Reads and checks a record: a regular file (never followed through a symlink), at most
/// [`RECORD_MAX_BYTES`], on unix mode 0600 (nothing for group or other) and owned by the current user, decoded
/// strictly, of the current `version`.
pub fn read_record(path: &Path) -> Result<LaunchRecord, RecordError> {
    let meta = std::fs::symlink_metadata(path).map_err(io_error)?;
    if !meta.file_type().is_file() {
        return Err(RecordError::NotRegular);
    }
    if meta.len() > RECORD_MAX_BYTES {
        return Err(RecordError::TooLarge);
    }
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW);
    }
    let file = options.open(path).map_err(io_error)?;
    // The opened file is the one checked: a swap after the first look is caught here.
    let meta = file.metadata().map_err(io_error)?;
    if !meta.file_type().is_file() {
        return Err(RecordError::NotRegular);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        // SAFETY: `geteuid` takes no arguments, touches no memory and cannot fail.
        let me = unsafe { libc::geteuid() };
        if meta.uid() != me || meta.permissions().mode() & 0o077 != 0 {
            return Err(RecordError::Insecure);
        }
    }
    let mut bytes = Vec::new();
    file.take(RECORD_MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(io_error)?;
    if bytes.len() as u64 > RECORD_MAX_BYTES {
        return Err(RecordError::TooLarge);
    }
    // The version is read first, so a record of another version is `Version` and not a decode failure of the
    // fields that version may have changed.
    let value: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|_| RecordError::Decode)?;
    if value.get("version").and_then(serde_json::Value::as_u64) != Some(u64::from(RECORD_VERSION)) {
        return Err(RecordError::Version);
    }
    serde_json::from_value(value).map_err(|_| RecordError::Decode)
}

/// Deletes the record: a regular file only, the one computed path, nothing recursive. A record that is already
/// gone is fine.
pub fn remove_record(path: &Path) -> Result<(), RecordError> {
    match std::fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_file() => std::fs::remove_file(path).map_err(io_error),
        Ok(_) => Err(RecordError::NotRegular),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(io_error(e)),
    }
}

fn warn(ctx: &LaunchCtx, text: &str) {
    ctx.log_sink.general(Prefix::Backend, Level::Warning, text);
}

/// The one writer of a spawn's record. A game-class run that has just registered calls this: when a funnel
/// session owns the run (`{ runner, key }`), the session learns the game's entry and the record is written
/// before the run waits on anything. A run with no session writes nothing. Never fails the launch: a record
/// that cannot be written is one fixed line, and a record too large to hold the after-script is written
/// without it (the line says so).
pub fn record_game_spawn(ctx: &LaunchCtx, entry: &GameEntry) -> Option<SessionId> {
    let id = ctx.sessions.for_run(&entry.ids.runner, &entry.ids.key)?;
    ctx.sessions.attach_entry(id, entry.id);
    let facts = ctx.sessions.facts(id)?;
    let Some(stamp) = entry.stamp else {
        // The leader had already gone when it registered: there is nothing to prove a later start with.
        warn(ctx, "Launch record not written (no start stamp)");
        return Some(id);
    };
    let pgid = probe::pgid_of(entry.pid).unwrap_or(entry.pid);
    let mut record = LaunchRecord {
        version: RECORD_VERSION,
        runner: facts.runner.as_str().to_string(),
        app_name: facts.app_name.clone(),
        pid: entry.pid,
        stamp,
        pgid,
        members: Vec::new(),
        launch_started_at_ms: facts.launch_started_at_ms,
        start_playing_at_ms: facts.start_playing_at_ms,
        state: RecordState::Running,
        killed_at_ms: None,
        after_script: facts.after_script.clone(),
    };
    let mut written = write_atomic(&facts.record_path, &record);
    if written == Err(RecordError::TooLarge) && record.after_script.is_some() {
        record.after_script = None;
        warn(
            ctx,
            "Launch record written without its after script (too large)",
        );
        written = write_atomic(&facts.record_path, &record);
    }
    match written {
        Ok(()) => ctx.sessions.set_record(id, record),
        Err(e) => warn(ctx, &format!("Launch record not written ({})", e.word())),
    }
    Some(id)
}

/// The leader is gone and its group lives (Pitfall 10, D-31): takes the group's members and rewrites the
/// record when the set differs from the one last kept. Called every group poll, so the writes are bounded by
/// the number of times the member set changes.
pub fn refresh_members(ctx: &LaunchCtx, id: SessionId, entry: &GameEntry) {
    let Some(record) = ctx.sessions.record(id) else {
        return;
    };
    let members: Vec<RecordMember> = snapshot_members(record.pgid, entry.pid)
        .into_iter()
        .map(RecordMember::from)
        .collect();
    let Some((path, changed)) = ctx.sessions.replace_members(id, members) else {
        return;
    };
    if let Err(e) = write_atomic(&path, &changed) {
        warn(ctx, &format!("Launch record not updated ({})", e.word()));
    }
}

/// The quit's kill ended the session's game at `killed_at_ms`: the record says `quitKilled` and when.
pub fn mark_quit_killed(ctx: &LaunchCtx, id: SessionId, killed_at_ms: u64) {
    let Some((path, record)) = ctx.sessions.quit_killed_record(id, killed_at_ms) else {
        return;
    };
    if let Err(e) = write_atomic(&path, &record) {
        warn(ctx, &format!("Launch record not updated ({})", e.word()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> LaunchRecord {
        LaunchRecord {
            version: RECORD_VERSION,
            runner: "sideload".to_string(),
            app_name: "alpha".to_string(),
            pid: 4242,
            stamp: 99,
            pgid: 4242,
            members: vec![RecordMember {
                pid: 4243,
                stamp: 100,
            }],
            launch_started_at_ms: 1,
            start_playing_at_ms: 2,
            state: RecordState::Running,
            killed_at_ms: None,
            after_script: None,
        }
    }

    #[test]
    fn the_path_is_inside_launches_and_a_crafted_name_cannot_leave_it() {
        let path = record_path(Path::new("/app"), RunnerName::Gog, "../../etc/pass wd");
        assert_eq!(path.parent(), Some(Path::new("/app/launches")));
        assert_eq!(
            path.file_name().and_then(|n| n.to_str()),
            Some("gog-.._.._etc_pass_wd.json")
        );
    }

    #[test]
    fn a_record_round_trips_through_the_file_and_leaves_no_temp_behind() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = record_path(dir.path(), RunnerName::Sideload, "alpha");
        write_atomic(&path, &sample()).expect("writes");
        let read = read_record(&path).expect("reads");
        assert_eq!(read.pid, 4242);
        assert_eq!(read.members, sample().members);
        let names: Vec<String> = std::fs::read_dir(path.parent().expect("parent"))
            .expect("dir")
            .map(|e| e.expect("entry").file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["sideload-alpha.json".to_string()]);
        remove_record(&path).expect("removes");
        remove_record(&path).expect("a second removal is fine");
        assert!(!path.exists());
    }

    #[cfg(unix)]
    #[test]
    fn write_atomic_refuses_a_symlink_at_the_target_and_at_the_folder() {
        let dir = tempfile::tempdir().expect("tempdir");
        let victim = dir.path().join("victim.txt");
        std::fs::write(&victim, b"keep").expect("victim");
        let launches = dir.path().join("launches");
        std::fs::create_dir(&launches).expect("launches");
        let path = launches.join("sideload-alpha.json");
        std::os::unix::fs::symlink(&victim, &path).expect("symlink");
        assert_eq!(write_atomic(&path, &sample()), Err(RecordError::NotRegular));
        assert_eq!(std::fs::read(&victim).expect("victim"), b"keep");
        // A symlinked folder is refused the same way.
        let elsewhere = tempfile::tempdir().expect("elsewhere");
        let other = tempfile::tempdir().expect("other app folder");
        std::os::unix::fs::symlink(elsewhere.path(), other.path().join("launches")).expect("link");
        let through = record_path(other.path(), RunnerName::Sideload, "alpha");
        assert_eq!(
            write_atomic(&through, &sample()),
            Err(RecordError::NotRegular)
        );
        assert_eq!(
            std::fs::read_dir(elsewhere.path())
                .expect("elsewhere")
                .count(),
            0
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_written_record_is_mode_0600_and_its_folder_0700_when_it_was_made() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().expect("tempdir");
        let path = record_path(dir.path(), RunnerName::Sideload, "alpha");
        write_atomic(&path, &sample()).expect("writes");
        let mode = |p: &Path| std::fs::metadata(p).expect("meta").permissions().mode() & 0o777;
        assert_eq!(mode(&path), 0o600);
        assert_eq!(mode(path.parent().expect("parent")), 0o700);
    }

    #[test]
    fn a_record_too_large_to_write_is_refused_before_anything_is_created() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = record_path(dir.path(), RunnerName::Sideload, "alpha");
        let mut record = sample();
        record.runner = "x".repeat(RECORD_MAX_BYTES as usize);
        assert_eq!(write_atomic(&path, &record), Err(RecordError::TooLarge));
        assert!(!dir.path().join("launches").exists());
    }
}
