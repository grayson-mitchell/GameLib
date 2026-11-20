use super::*;
use std::sync::mpsc::Receiver;
use std::time::Instant;

// ---- Shell state ----

/// Shared handle to the sidecar: its stdin, the pending-invoke correlation table, and an
/// id counter. Wrapped in an Arc and `manage`d so the four commands can reach it.
pub(crate) struct SidecarState {
    pub(crate) stdin: Mutex<ChildStdin>,
    /// id -> (channel, one-shot sender the reader thread fulfils when the matching response
    /// arrives). The channel name is retained alongside the sender so an abandoned id can still
    /// be ATTRIBUTED after the fact — see `abandoned` below and F-9 (quick task `260905-omc`).
    pub(crate) pending: Mutex<HashMap<String, (String, Sender<Result<Value, String>>)>>,
    /// Recently abandoned invokes: `id -> channel`, for ids whose pending entry was removed by a
    /// timeout or a sidecar disconnect. Bounded at `ABANDONED_IDS_CAP`, oldest-dropped.
    ///
    /// Exists so the reader thread's late-response diagnostic can NAME the channel. Without it,
    /// `pending.remove(&id)` at the timeout branch destroys the only record of which channel
    /// opened that id, and the resulting `[shell] response for unknown/timed-out id=N (dropped)`
    /// is unattributable — permanently, not just inconveniently. That is precisely what stranded
    /// F-9 (`.planning/todos/pending/2026-08-23-f9-...`): `id=1575` fired live, and because the
    /// diagnostic named no channel, whether it co-occurred with a cookie operation could not be
    /// settled afterwards and is recorded as UNDETERMINED to this day. This field does not answer
    /// that question — nothing can, the scrollback is gone — it makes the NEXT one answerable.
    ///
    /// A `VecDeque` of pairs rather than a map: the cap is small, lookups happen only on the rare
    /// late-response path, and insertion order is what makes oldest-dropped eviction trivial.
    pub(crate) abandoned: Mutex<VecDeque<(String, String)>>,
    pub(crate) counter: AtomicU64,
    /// The shell owns the sidecar's lifetime: held alive so it is not reaped early, and
    /// explicitly killed by `shutdown_child()` on app exit (WR-03).
    pub(crate) child: Mutex<Child>,
    /// Set by `begin_shutdown()` on every intentional exit, BEFORE the sidecar is closed, so the
    /// reader thread's EOF handler can tell a normal quit from a dead sidecar (D-03).
    pub(crate) shutting_down: AtomicBool,
    /// Latches once the dead-sidecar dialog has been surfaced, so it shows at most once.
    pub(crate) eof_surfaced: AtomicBool,
    /// Latches once `reap_dead_sidecar_tree` has killed and waited the tree, telling
    /// `shutdown_child` not to signal the (possibly recycled) pgid again.
    pub(crate) tree_reaped: AtomicBool,
    /// Windows kill-on-close Job Object holding the sidecar tree (D-20). `None` if creation
    /// failed (shell then falls back to `child.kill()`).
    #[cfg(windows)]
    pub(crate) job: Mutex<Option<gamelib_proc::job::Job>>,
}

impl SidecarState {
    /// Marks the coming sidecar EOF as intentional (D-03). Call before any exit/relaunch path
    /// closes the sidecar.
    pub(crate) fn begin_shutdown(&self) {
        self.shutting_down.store(true, Ordering::SeqCst);
    }

    pub(crate) fn next_id(&self) -> String {
        self.counter.fetch_add(1, Ordering::Relaxed).to_string()
    }

    /// WR-01: unconditionally reap the dead sidecar's whole tree before the dead-sidecar dialog.
    /// The unix group SIGKILL happens BEFORE any wait/try_wait reaps the leader: an unreaped
    /// zombie leader keeps its pid, and so the pgid, from being recycled, so the signal cannot
    /// hit an unrelated group. Does not call `begin_shutdown()`; the dialog path does that.
    pub(crate) fn reap_dead_sidecar_tree(&self) {
        let mut child = match self.child.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        #[cfg(unix)]
        {
            let pgid = child.id() as i32;
            if let Err(e) = gamelib_proc::kill_tree::kill_process_group(pgid) {
                if e.raw_os_error() != Some(libc::ESRCH) {
                    shell_eprintln!("[shell] dead-sidecar group kill failed: {e}");
                }
            }
        }
        #[cfg(not(unix))]
        {
            let _ = child.kill();
            // 72-12 D-20: closing the last job handle kills every remaining member.
            #[cfg(windows)]
            {
                let taken = match self.job.lock() {
                    Ok(mut g) => g.take(),
                    Err(p) => p.into_inner().take(),
                };
                drop(taken);
            }
        }
        if let Err(e) = child.wait() {
            shell_eprintln!("[shell] dead-sidecar wait() failed: {e}");
        }
        // The tree is reaped and the leader waited: a restart can recycle this pgid, so the
        // reaper must stop holding it (D-11; a stale registration could signal an unrelated group).
        #[cfg(unix)]
        gamelib_proc::reaper::unregister_group(child.id() as i32);
        self.tree_reaped.store(true, Ordering::SeqCst);
    }

    /// WR-03: kill and reap the sidecar process. Called from the `RunEvent::Exit`
    /// handler in `main()`. Normal window close (red X / Cmd+Q / Alt+F4) does not route
    /// through `app_exit`/`app_relaunch` (the only two in-app call sites that used to be
    /// the sole way this process died), so without this an orphaned sidecar can survive
    /// after the user believes the app has quit, retaining an authenticated Steam session,
    /// open network sockets, and file handles. This runs on the exit path, so a poisoned
    /// mutex, an already-exited process, or a kill error must all be logged and swallowed
    /// rather than panicking -- an unwind here is worse than a leak.
    ///
    /// UPDATED (quick task 260907-juv, Layer B): killing/waiting on the sidecar alone left
    /// its own long-lived children (GOG's `comet`, the Steam bridge helper) reparented and
    /// orphaned on exactly this path -- `Child::kill()` is SIGKILL on unix, which the
    /// sidecar's own Node process can never catch to run its own JS-side teardown
    /// (`backend/longLivedChildren.ts`'s `shutdownLongLivedChildren()` is unreachable here
    /// by construction; that registry only ever runs from the in-app `handleExit()` quit
    /// path, `backend/utils.ts`). On unix, `configure_sidecar_process_group` (called at both
    /// spawn sites, `spawn_sidecar_dev`/`spawn_sidecar_packaged`) puts the sidecar in its OWN
    /// process group, so this signals that WHOLE group through
    /// `gamelib_proc::kill_tree::terminate_group` -- SIGTERM first (catchable, giving
    /// comet/the bridge helper a chance at their own graceful exit; the todo's own evidence
    /// measured comet exiting ~1s after a plain SIGTERM), a bounded grace period polled via
    /// `try_wait()`, then SIGKILL if still alive after the grace window. Windows has no
    /// process-group-signal equivalent reachable from this crate, so it keeps the
    /// sidecar-only `child.kill()` plus dropping the kill-on-close Job (`#[cfg(not(unix))]`
    /// below).
    ///
    /// Phase 83 (D-12, D-16): `grace` is the share of the one 5 s exit budget the caller has left
    /// for killing children (`ExitBudget::child_grace` at most), not a fixed 2 s. Its one call
    /// site is `handle_exit`'s children stage, after the steamcm, steampoll and depot drains.
    pub(crate) fn shutdown_child(&self, grace: Duration) {
        self.begin_shutdown();
        let mut child = match self.child.lock() {
            Ok(guard) => guard,
            Err(poisoned) => {
                shell_eprintln!("[shell] sidecar mutex poisoned during exit shutdown; recovering");
                poisoned.into_inner()
            }
        };

        #[cfg(unix)]
        {
            // After a dead-sidecar reap the user may sit at the dialog for minutes, during which
            // the old pgid can be recycled to an unrelated group, so do not signal it again.
            if !self.tree_reaped.load(Ordering::SeqCst) {
                // `configure_sidecar_process_group` put the sidecar in its own process group at
                // spawn time (`process_group(0)`), making its pgid equal to its own pid -- so
                // this pid IS the group id to signal. `terminate_group` refuses pgid <= 1, runs
                // SIGTERM -> `try_wait` poll -> SIGKILL, and waits (reaps) the leader.
                let pgid = child.id() as i32;
                gamelib_proc::kill_tree::terminate_group(pgid, &mut child, grace);
            }
        }

        #[cfg(not(unix))]
        {
            // No group signal to grace-period on Windows: the kill is immediate.
            let _ = grace;
            if let Err(e) = child.kill() {
                shell_eprintln!("[shell] sidecar kill() failed during exit shutdown (may have already exited): {e}");
            }
            // D-20: closing the last handle to the kill-on-close job kills every remaining
            // member (store CLIs, powershell wrappers, games).
            #[cfg(windows)]
            {
                let taken = match self.job.lock() {
                    Ok(mut g) => g.take(),
                    Err(p) => p.into_inner().take(),
                };
                drop(taken);
            }
        }

        if let Err(e) = child.wait() {
            shell_eprintln!("[shell] sidecar wait() failed during exit shutdown: {e}");
        } else {
            shell_eprintln!("[shell] sidecar terminated on exit");
        }
    }

    /// Serialize an arbitrary `serde_json::Value` and write it (newline-terminated) to the
    /// sidecar's stdin. Used both for outbound request frames (via `write_frame` below) and
    /// for `rustInvoke` response frames written back on the same pipe (Phase 28).
    pub(crate) fn write_raw(&self, value: &Value) -> Result<(), String> {
        let line = serde_json::to_string(value).map_err(|e| e.to_string())?;
        let mut stdin = self.stdin.lock().map_err(|e| e.to_string())?;
        write_line(&mut stdin, &line)
    }

    /// Serialize a request frame and write it (newline-terminated) to the sidecar's stdin.
    pub(crate) fn write_frame(&self, req: &SidecarRpcRequest) -> Result<(), String> {
        let value = serde_json::to_value(req).map_err(|e| e.to_string())?;
        self.write_raw(&value)
    }

    /// Write an 'invoke' frame and block until the correlated response (or timeout).
    pub(crate) fn invoke(&self, channel: String, args: Vec<Value>) -> Result<Value, String> {
        // CR-03: resolve the per-channel bound BEFORE `channel` is moved into the frame.
        let timeout = timeout_for(&channel);
        let id = self.next_id();
        let (tx, rx) = mpsc_channel::<Result<Value, String>>();
        {
            let mut pending = self.pending.lock().map_err(|e| e.to_string())?;
            pending.insert(id.clone(), (channel.clone(), tx));
        }
        let req = SidecarRpcRequest {
            id: id.clone(),
            kind: "invoke",
            channel: channel.clone(),
            args,
        };
        if let Err(e) = self.write_frame(&req) {
            self.pending.lock().ok().and_then(|mut p| p.remove(&id));
            // Deliberately NOT recorded as abandoned: the frame never reached the pipe, so the
            // sidecar cannot answer it late. Only ids that were actually SENT can produce the
            // unknown-id response this ring exists to attribute; recording unsent ids would
            // dilute a bounded table with entries that can never be looked up.
            return Err(e);
        }
        self.await_reply(&id, &channel, &rx, timeout)
    }

    /// `invoke` that must settle by `deadline` (80-REVIEW B/WR-02, iteration 2 B/WR-01). The
    /// poll host's state-event ack has to be answered or given up before the crate's own
    /// `ACK_TIMEOUT_MS` timer drops the future, and the frame must never reach the pipe after
    /// that, because the crate has re-queued the event and a newer one may have been applied.
    ///
    /// So the deadline is checked again AFTER the stdin lock is taken (the lock is shared with
    /// every other invoke and every rustInvoke response, and its wait can eat the budget), and
    /// the frame is written under that same guard. The reply wait is then sized from what is
    /// left after the write, never from a bound computed before it. Fewer than `min_left` left
    /// counts as no time: a frame written with ~1 ms to wait is almost always applied but not
    /// acked, which only produces a duplicate replay (80-REVIEW B/IN-04).
    ///
    /// Residual, by design: a blocking `write_all` into a full pipe (the sidecar has stopped
    /// reading stdin) cannot be bounded here. Such a write can still land after the deadline;
    /// the TS per-appId seq guard (80-REVIEW C/IN-04) discards it as stale.
    pub(crate) fn invoke_until(
        &self,
        channel: String,
        args: Vec<Value>,
        deadline: Instant,
        min_left: Duration,
    ) -> Result<Value, String> {
        let stale = || Err(format!("{channel}:stale"));
        // Cheap early out before any allocation or table entry (the closure may have been
        // queued behind a full blocking pool until past the deadline).
        if time_left_to_write(deadline, Instant::now(), min_left).is_none() {
            return stale();
        }
        let id = self.next_id();
        let req = SidecarRpcRequest {
            id: id.clone(),
            kind: "invoke",
            channel: channel.clone(),
            args,
        };
        let line = serde_json::to_value(&req)
            .and_then(|v| serde_json::to_string(&v))
            .map_err(|e| e.to_string())?;
        let (tx, rx) = mpsc_channel::<Result<Value, String>>();
        {
            let mut pending = self.pending.lock().map_err(|e| e.to_string())?;
            pending.insert(id.clone(), (channel.clone(), tx));
        }
        {
            let mut stdin = match self.stdin.lock() {
                Ok(guard) => guard,
                Err(e) => {
                    self.pending.lock().ok().and_then(|mut p| p.remove(&id));
                    return Err(e.to_string());
                }
            };
            // The lock wait may have used up the budget: then the frame is not written at all.
            // Not recorded as abandoned, for the same reason as an unwritten `invoke` frame.
            if time_left_to_write(deadline, Instant::now(), min_left).is_none() {
                drop(stdin);
                self.pending.lock().ok().and_then(|mut p| p.remove(&id));
                return stale();
            }
            if let Err(e) = write_line(&mut stdin, &line) {
                drop(stdin);
                self.pending.lock().ok().and_then(|mut p| p.remove(&id));
                return Err(e);
            }
        }
        // Sized from the deadline AFTER the write: a slow write shortens the wait instead of
        // pushing it past the deadline. Zero left still polls once for a reply already in.
        let left = deadline.saturating_duration_since(Instant::now());
        self.await_reply(&id, &channel, &rx, Some(left))
    }

    /// Wait for the reply to a frame that WAS written. Shared by `invoke` and `invoke_until`, so
    /// the two abandonment arms (and their diagnostics) exist exactly once.
    fn await_reply(
        &self,
        id: &str,
        channel: &str,
        rx: &Receiver<Result<Value, String>>,
        timeout: Option<Duration>,
    ) -> Result<Value, String> {
        let (id, channel) = (id.to_string(), channel.to_string());
        // Until this task, both `Err(_)` arms below were silent: they removed the pending entry,
        // recorded the abandonment into the ring, and returned an `Err` — printing nothing. The
        // `response for unknown/timed-out` diagnostic (reader thread, below) only ever fires if a
        // LATE response eventually arrives; if the sidecar simply never answers, nothing else
        // observes that at all. The rule this task acts on: a transport failure that leaves no trace is indistinguishable from no failure.
        // So each arm now emits one `shell_diag` line naming both id and channel BEFORE
        // `record_abandoned` — a placement `abandonedInvokeAttribution.test.ts`'s ordering pin
        // requires, not an arbitrary choice.
        match timeout {
            Some(bound) => match rx.recv_timeout(bound) {
                Ok(result) => result,
                Err(_) => {
                    self.pending.lock().ok().and_then(|mut p| p.remove(&id));
                    shell_diag(&invoke_abandoned_message("timeout", &id, &channel));
                    self.record_abandoned(&id, &channel);
                    Err(invoke_timeout_message(&channel))
                }
            },
            // Long-running channel: block until the sidecar answers. A dead sidecar does not
            // wake this by itself -- the sender lives in `pending`, not in the child. It wakes
            // because the reader thread's `drain_pending_invokes` sends an `Err` to every
            // waiter once stdout ends; this `Err(_)` arm covers a sender dropped any other way.
            None => match rx.recv() {
                Ok(result) => result,
                Err(_) => {
                    self.pending.lock().ok().and_then(|mut p| p.remove(&id));
                    shell_diag(&invoke_abandoned_message("sidecar closed", &id, &channel));
                    self.record_abandoned(&id, &channel);
                    Err("sidecar closed before responding".into())
                }
            },
        }
    }

    /// Note that `id` was abandoned while awaiting `channel`, so a late response can still be
    /// attributed. Lock poisoning is swallowed: this is a diagnostic aid on an already-failing
    /// path, and it must never convert a timeout into a panic.
    fn record_abandoned(&self, id: &str, channel: &str) {
        if let Ok(mut ring) = self.abandoned.lock() {
            push_abandoned(&mut ring, id, channel);
        }
    }
}

/// Write one newline-terminated frame under an already-held stdin guard.
fn write_line(stdin: &mut ChildStdin, line: &str) -> Result<(), String> {
    stdin
        .write_all(line.as_bytes())
        .and_then(|_| stdin.write_all(b"\n"))
        .and_then(|_| stdin.flush())
        .map_err(|e| e.to_string())
}

/// Time left before `deadline` at `now`, or `None` when no more than `min_left` remains and a
/// deadline-bound frame must not be written (80-REVIEW B/WR-01, B/IN-04).
pub(crate) fn time_left_to_write(
    deadline: Instant,
    now: Instant,
    min_left: Duration,
) -> Option<Duration> {
    let left = deadline.saturating_duration_since(now);
    (left > min_left).then_some(left)
}
