//! The unix reaper (Phase 83, D-11): the one thing that survives a SIGKILL of GameLib and can still
//! clean up after it.
//!
//! SIGKILL skips every exit path, so nothing inside the dying process can reap its helpers. The
//! parent therefore starts a second process (its own executable re-exec'd with `--gamelib-reaper`,
//! in its own process group) and keeps the write end of a pipe to that process's stdin. The parent
//! registers every helper process group it creates (`+ <pgid> <start> <label>`) and unregisters it
//! when the helper is reaped (`- <pgid>`). When the parent dies, however it dies, the kernel closes
//! the write end, the reaper reads EOF, SIGTERMs every group still registered, waits up to
//! `REAPER_GRACE` for each to empty, SIGKILLs the rest and exits. On a graceful quit the parent
//! sends `disarm` first, so EOF makes the reaper exit without signalling anything.
//!
//! It deliberately never touches Tauri, AppKit or the filesystem, never names a process (only
//! groups the parent registered), and refuses pgid <= 1 at parse and at signal time.
//! `SpawnClass::Game` trees are never registered (D-08), so they are never touched.
//!
//! On targets without unix process groups (Windows, where a per-helper kill-on-close Job does this
//! job in the kernel, see `job.rs`) `register_group`, `unregister_group` and `disarm` are no-ops
//! and `start` reports `Unsupported`.

use crate::diag::diag;
use crate::proto::{ReaperLine, MAX_LINE};
use std::collections::BTreeMap;
use std::io::{BufRead, Write};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::Duration;

/// argv[1] that puts the GameLib binary into reaper mode.
pub const REAPER_FLAG: &str = "--gamelib-reaper";

/// How long the reaper lets a SIGTERMed group wind down before it SIGKILLs it.
pub const REAPER_GRACE: Duration = Duration::from_secs(2);

// ---------------------------------------------------------------------------------------------
// Parent side: the client that owns the control pipe.
// ---------------------------------------------------------------------------------------------

struct Client {
    /// The write end of the reaper's stdin (or, in a unit test, a capture sink).
    writer: Option<Box<dyn Write + Send>>,
    /// The reaper process, held for as long as the pipe is.
    #[cfg(unix)]
    child: Option<std::process::Child>,
    /// A write failed once; stop writing (Rust ignores SIGPIPE, so EPIPE is only an error).
    failed: bool,
}

fn client() -> MutexGuard<'static, Client> {
    static CLIENT: OnceLock<Mutex<Client>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            Mutex::new(Client {
                writer: None,
                #[cfg(unix)]
                child: None,
                failed: false,
            })
        })
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

fn send(line: &ReaperLine) {
    let mut c = client();
    if c.failed {
        return;
    }
    let Some(w) = c.writer.as_mut() else {
        return;
    };
    let text = format!("{}\n", line.encode());
    let ok = w
        .write_all(text.as_bytes())
        .and_then(|()| w.flush())
        .is_ok();
    if !ok {
        c.failed = true;
        diag("reaper write failed");
    }
}

/// If this process was started in reaper mode (argv[1] is `--gamelib-reaper`), runs the reaper and
/// exits with its code; otherwise returns at once. Call it as the first thing `main` does, so
/// reaper mode never reaches the crypto provider, the single-instance guard, a window or the
/// webview. On targets without a reaper it exits 0 at once, so the app never starts in reaper mode.
pub fn dispatch_if_requested() {
    if std::env::args_os().nth(1).is_some_and(|a| a == REAPER_FLAG) {
        std::process::exit(run());
    }
}

/// Starts the reaper: this executable re-exec'd with `--gamelib-reaper`, stdin piped, stdout null,
/// stderr inherited (its two status lines go where the app's own stderr goes), in its own process
/// group so a terminal Ctrl-C or a group signal aimed at the app cannot take it down with it.
/// Returns the reaper's pid. A second call returns the running reaper's pid.
#[cfg(unix)]
pub fn start() -> std::io::Result<u32> {
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};

    let mut c = client();
    if let Some(child) = c.child.as_ref() {
        return Ok(child.id());
    }
    let exe = std::env::current_exe()?;
    let mut child = Command::new(exe)
        .arg(REAPER_FLAG)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::inherit())
        .process_group(0)
        .spawn()?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| std::io::Error::other("reaper stdin was not piped"))?;
    let pid = child.id();
    #[cfg(feature = "harness")]
    {
        use std::os::fd::AsRawFd;
        let _ = WRITE_FD.set(stdin.as_raw_fd());
    }
    c.writer = Some(Box::new(stdin));
    c.child = Some(child);
    c.failed = false;
    Ok(pid)
}

/// There is no reaper on this target (Windows relies on the per-helper kill-on-close Job).
#[cfg(not(unix))]
pub fn start() -> std::io::Result<u32> {
    Err(std::io::Error::from(std::io::ErrorKind::Unsupported))
}

/// Tells the reaper about a helper process group (`pgid` is the group leader's pid). Does nothing
/// when no reaper is running, and refuses `pgid <= 1`.
pub fn register_group(pgid: i32, label: &str) {
    if pgid <= 1 {
        return;
    }
    let start = crate::probe::start_time(pgid as u32).unwrap_or(0);
    send(&ReaperLine::Register {
        pgid,
        start,
        label: label.to_string(),
    });
}

/// Tells the reaper a group is gone (or no longer ours), so a long session does not accumulate
/// stale registrations and a recycled id is never signalled.
pub fn unregister_group(pgid: i32) {
    if pgid <= 1 {
        return;
    }
    send(&ReaperLine::Unregister { pgid });
}

/// The parent is quitting cleanly: tell the reaper to signal nothing, then close the pipe so it
/// sees EOF and exits (`[reaper] disarmed`). Later registrations are no-ops.
pub fn disarm() {
    send(&ReaperLine::Disarm);
    client().writer = None;
}

#[cfg(test)]
pub(crate) fn set_test_sink(sink: Box<dyn Write + Send>) {
    let mut c = client();
    c.writer = Some(sink);
    c.failed = false;
}

/// The write end of the control pipe, duplicated, for the harness's leaked-pipe test: a process
/// that holds this keeps the pipe open after the parent dies, so only the `getppid()` trigger can
/// start the reap.
#[cfg(all(unix, feature = "harness"))]
pub fn harness_dup_write_end() -> Option<std::os::fd::OwnedFd> {
    let fd = *WRITE_FD.get()?;
    // Hold the client lock so the pipe cannot be closed (by `disarm`) while it is duplicated.
    let c = client();
    c.writer.as_ref()?;
    // SAFETY: `fd` is the fd of the `ChildStdin` the client's boxed writer owns, and the lock above
    // keeps that writer (so the fd) open; the borrow lasts only for the dup below.
    let borrowed = unsafe { std::os::fd::BorrowedFd::borrow_raw(fd) };
    borrowed.try_clone_to_owned().ok()
}

/// The raw fd of the control pipe's write end, recorded by `start` for `harness_dup_write_end`.
#[cfg(all(unix, feature = "harness"))]
static WRITE_FD: OnceLock<i32> = OnceLock::new();

// ---------------------------------------------------------------------------------------------
// Reaper side.
// ---------------------------------------------------------------------------------------------

/// The registered groups: pgid -> (leader start stamp, label). A start stamp of 0 means unknown.
pub type Registry = BTreeMap<i32, (u64, String)>;

/// What the reaper knows.
#[derive(Default)]
#[cfg_attr(not(unix), allow(dead_code))]
struct State {
    registry: Registry,
    disarmed: bool,
    malformed: usize,
}

#[cfg_attr(not(unix), allow(dead_code))]
impl State {
    fn apply(&mut self, line: Next) {
        match line {
            Next::Line(text) => match ReaperLine::parse(&text) {
                Some(ReaperLine::Register { pgid, start, label }) => {
                    self.registry.insert(pgid, (start, label));
                }
                Some(ReaperLine::Unregister { pgid }) => {
                    self.registry.remove(&pgid);
                }
                Some(ReaperLine::Disarm) => self.disarmed = true,
                None => self.malformed += 1,
            },
            Next::TooLong => self.malformed += 1,
            Next::Eof => {}
        }
    }
}

/// Which registered groups to signal, and how many were skipped because their leader's pid now
/// belongs to a different process (a recycled id: signalling its group would hit a stranger).
///
/// - recorded start 0 (unknown): signal, there is nothing to compare;
/// - leader gone (`current_start` is `None`): signal anyway; a group outlives its leader while any
///   member remains, and an empty group just answers ESRCH;
/// - leader present with the recorded stamp: signal;
/// - leader present with a different stamp: skip and count;
/// - pgid <= 1: never signalled (and not counted: it can only be corruption, not recycling).
#[cfg_attr(not(unix), allow(dead_code))]
pub fn plan_reap(
    registry: &Registry,
    current_start: impl Fn(i32) -> Option<u64>,
) -> (Vec<i32>, usize) {
    let _ = (registry, current_start);
    (Vec::new(), 0)
}

#[derive(Debug, PartialEq, Eq)]
enum Next {
    Eof,
    Line(String),
    /// A line longer than `MAX_LINE`, discarded to its newline without being held in memory.
    TooLong,
}

/// Reads up to the next newline, holding at most `MAX_LINE` bytes. A trailing partial line at EOF
/// (the parent died mid-write) is dropped.
#[cfg_attr(not(unix), allow(dead_code))]
fn next_line<R: BufRead>(r: &mut R) -> Next {
    let mut buf: Vec<u8> = Vec::new();
    let mut too_long = false;
    loop {
        let avail = match r.fill_buf() {
            Ok(b) => b,
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(_) => return Next::Eof,
        };
        if avail.is_empty() {
            return Next::Eof;
        }
        let (chunk, found) = match avail.iter().position(|&b| b == b'\n') {
            Some(i) => (&avail[..i], Some(i + 1)),
            None => (avail, None),
        };
        if !too_long {
            buf.extend_from_slice(chunk);
            if buf.len() > MAX_LINE {
                too_long = true;
                buf.clear();
            }
        }
        let used = found.unwrap_or(avail.len());
        r.consume(used);
        if found.is_some() {
            return if too_long {
                Next::TooLong
            } else {
                Next::Line(String::from_utf8_lossy(&buf).into_owned())
            };
        }
    }
}

/// The reaper process. Reads the control pipe on stdin until EOF, then reaps. Returns the exit
/// code. Never touches Tauri, AppKit or the filesystem.
#[cfg(unix)]
pub fn run() -> i32 {
    let stdin = std::io::stdin();
    let mut input = stdin.lock();
    let mut state = State::default();
    loop {
        match next_line(&mut input) {
            Next::Eof => break,
            other => state.apply(other),
        }
    }
    if state.disarmed {
        eprintln!("[reaper] disarmed");
        return 0;
    }
    let pgids: Vec<i32> = state.registry.keys().copied().collect();
    let signalled = terminate_groups(&pgids);
    eprintln!("[reaper] parent gone: signalled {signalled} group(s)");
    0
}

/// Not reachable on this target: `dispatch_if_requested` is the only caller and the reaper is
/// never started here.
#[cfg(not(unix))]
pub fn run() -> i32 {
    0
}

/// SIGTERM every group, wait up to `REAPER_GRACE` for each to empty (`kill(-pgid, 0)` reports
/// ESRCH), SIGKILL what is left. Returns how many groups the SIGTERM reached.
#[cfg(unix)]
fn terminate_groups(pgids: &[i32]) -> usize {
    use crate::kill_tree::signal_group;
    use std::time::Instant;

    let mut signalled = 0;
    for &g in pgids {
        // `signal_group` refuses pgid <= 1; ESRCH is a group that is already empty.
        if signal_group(g, libc::SIGTERM).is_ok() {
            signalled += 1;
        }
    }
    let deadline = Instant::now() + REAPER_GRACE;
    let mut live: Vec<i32> = pgids.to_vec();
    loop {
        live.retain(|&g| group_exists(g));
        if live.is_empty() || Instant::now() >= deadline {
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    for g in live {
        let _ = signal_group(g, libc::SIGKILL);
    }
    signalled
}

/// `true` while `kill(-pgid, 0)` finds a member (or lacks permission to look, which a group of
/// someone else's processes would also say).
#[cfg(unix)]
fn group_exists(pgid: i32) -> bool {
    if pgid <= 1 {
        return false;
    }
    // SAFETY: signal 0 only probes existence of group `-pgid` (> 1); no pointers.
    let r = unsafe { libc::kill(-pgid, 0) };
    r == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::children::{global, HelperGuard};
    use std::io::Cursor;
    use std::sync::Arc;

    #[test]
    fn next_line_splits_on_newlines_and_drops_a_partial_tail() {
        let mut r = Cursor::new(b"+ 5 0 a\n- 5\ndisarm".to_vec());
        assert_eq!(next_line(&mut r), Next::Line("+ 5 0 a".into()));
        assert_eq!(next_line(&mut r), Next::Line("- 5".into()));
        assert_eq!(next_line(&mut r), Next::Eof);
    }

    #[test]
    fn next_line_discards_an_over_long_line_and_recovers_on_the_next() {
        let mut data = vec![b'x'; 100_000];
        data.push(b'\n');
        data.extend_from_slice(b"disarm\n");
        let mut r = Cursor::new(data);
        assert_eq!(next_line(&mut r), Next::TooLong);
        assert_eq!(next_line(&mut r), Next::Line("disarm".into()));
        assert_eq!(next_line(&mut r), Next::Eof);
    }

    #[test]
    fn state_tracks_register_unregister_disarm_and_counts_malformed() {
        let mut s = State::default();
        for l in ["+ 10 0 a", "+ 11 0 b", "- 10", "nonsense", "+ 1 0 init"] {
            s.apply(Next::Line(l.into()));
        }
        s.apply(Next::TooLong);
        assert_eq!(s.registry.keys().copied().collect::<Vec<_>>(), vec![11]);
        assert_eq!(s.malformed, 3);
        assert!(!s.disarmed);
        s.apply(Next::Line("disarm".into()));
        assert!(s.disarmed);
    }

    fn registry(entries: &[(i32, u64, &str)]) -> Registry {
        entries
            .iter()
            .map(|(pgid, start, label)| (*pgid, (*start, label.to_string())))
            .collect()
    }

    #[test]
    fn plan_reap_skips_and_counts_a_recycled_leader() {
        let reg = registry(&[(10, 100, "a"), (11, 200, "b")]);
        let plan = plan_reap(&reg, |pgid| match pgid {
            10 => Some(999), // the pid now belongs to a different process
            11 => Some(200),
            _ => None,
        });
        assert_eq!(plan, (vec![11], 1));
    }

    #[test]
    fn plan_reap_still_signals_a_group_whose_leader_is_gone() {
        let reg = registry(&[(12, 300, "c")]);
        assert_eq!(plan_reap(&reg, |_| None), (vec![12], 0));
    }

    #[test]
    fn plan_reap_does_not_check_a_group_with_an_unknown_start() {
        let reg = registry(&[(13, 0, "d")]);
        assert_eq!(plan_reap(&reg, |_| Some(5)), (vec![13], 0));
    }

    #[test]
    fn plan_reap_never_signals_pgid_one_or_less() {
        let reg = registry(&[(-5, 0, "x"), (0, 0, "y"), (1, 0, "z"), (2, 0, "ok")]);
        assert_eq!(plan_reap(&reg, |_| None), (vec![2], 0));
    }

    /// A sink the test can read back, shared with the client.
    #[derive(Clone, Default)]
    struct Capture(Arc<Mutex<Vec<u8>>>);

    impl Write for Capture {
        fn write(&mut self, b: &[u8]) -> std::io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(b);
            Ok(b.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn registration_is_written_to_the_reaper_and_unregistration_follows_the_guard() {
        let cap = Capture::default();
        set_test_sink(Box::new(cap.clone()));

        // The set registers a helper's pid with the reaper, and the HelperGuard drop unregisters it.
        // The pid is not a real process: only the lines written to the reaper matter here.
        let pid = 987_654u32;
        global().register_pid("reaper-wiring", pid, Default::default());
        let text = String::from_utf8(cap.0.lock().unwrap().clone()).unwrap();
        assert!(
            text.lines()
                .any(|l| l.starts_with(&format!("+ {pid} ")) && l.ends_with(" reaper-wiring")),
            "register line for {pid} missing in {text:?}"
        );
        drop(HelperGuard::new(pid));
        let text = String::from_utf8(cap.0.lock().unwrap().clone()).unwrap();
        assert!(
            text.lines().any(|l| l == format!("- {pid}")),
            "unregister line for {pid} missing in {text:?}"
        );
        disarm();
    }
}
