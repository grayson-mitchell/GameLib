//! The signed-in CM session as a single actor task (RESEARCH Pattern 2, D-01, D-03, D-07).
//!
//! Callers hold a cheap `SessionHandle` and talk to the actor over an mpsc channel with oneshot
//! replies. The control loop never awaits CM I/O: logons, canaries, op closures and the owed
//! go-online payment all run in spawned tasks that report back as messages (085 Run A stall).
//!
//! Guarantees ported from `user.ts`: lease counting with one shared logon, a 60 s idle close, a
//! generation fence so a logon that lands after sign-out or shutdown is closed at once, a 35 s
//! logon bound, and shutdown ordering (abandon pending logon, close, then pay the wrap's owed
//! go-online). Plan 79-11 adds recovery: a failed op triggers a probe, a dead probe a rebuild of
//! the connection (fresh logon, backoff), and the op is then retried once. A non-idempotent op is
//! never resent: it reports `Ambiguous`. LoggedOff 34 is terminal (no reconnect, 085 ping-pong);
//! a wall-vs-monotonic gap on a 5 s tick detects sleep. There is no periodic probe (D-01).
//!
//! Secret hygiene: the token lives in the actor as a `RefreshTokenSecret` only; diag lines carry
//! reasons, causes and counts, never the token.

use std::collections::HashSet;
use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime};

use futures_util::future::BoxFuture;
use serde::Serialize;
use tokio::sync::{mpsc, oneshot, watch};
use tokio::time::{Instant, MissedTickBehavior};

use crate::backend::{
    Authed, CmBackend, CmConn, LicenseEntry, PicsId, PicsRequest, RefreshTokenSecret,
};
use crate::error::{
    diag, eresult_of, is_credential_refusal, is_transient, CmError, ERESULT_LOGON_SESSION_REPLACED,
};
use crate::liveness::{
    classify, indicates_dead, kind_name, Backoff, FailureAction, GapDetector, COMMAND_DEADLINE,
    GAP_TICK, PROBE_TIMEOUT, RECONNECT_ATTEMPT_BOUND,
};

pub type LeaseId = u32;

/// `AUTH_SESSION_IDLE_GRACE_MS`: the session closes this long after the last release.
pub const IDLE_GRACE: Duration = Duration::from_secs(60);
/// `AUTH_LOGON_BOUND_MS`: a logon slower than this is reported as client-not-ready.
pub const LOGON_BOUND: Duration = Duration::from_secs(35);
/// The app the canary asks PICS about.
pub const CANARY_APP_ID: u32 = 753;
pub const CANARY_TIMEOUT: Duration = Duration::from_secs(5);

/// Matches TS `AuthSessionRefusal`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Refusal {
    ShuttingDown,
    LogonRejected,
    ClientNotReady,
    GoOfflineRequired,
    NotSignedIn,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LogonFailure {
    pub kind: &'static str,
    pub eresult: Option<i32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OpFailure {
    LeaseUnknown,
    Timeout,
    Cm(CmError),
    Replaced,
    Ambiguous,
    ShuttingDown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RestoreTrigger {
    Boot,
    Shutdown,
}

/// TS `MacSteamRestoreOutcome` plus the Rust-only `TimedOut` (a bounded shutdown), which
/// serialises as `restore-unconfirmed`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RestoreOutcome {
    NotDarwin,
    NotOwed,
    Restored,
    RestoreUnconfirmed,
    KeptNotRunning,
    KeptProbeFailed,
    KeptOwnerAlive,
    #[serde(rename = "restore-unconfirmed")]
    TimedOut,
}

/// Proof that `before_logon` succeeded; handed back to `after_logon`.
#[derive(Debug, Default)]
pub struct WrapTicket(pub u64);

/// `before_logon` refused: the logon must not be attempted ("never a silent logon").
#[derive(Debug, Default)]
pub struct WrapRefused {
    pub reason: String,
}

/// The go-offline wrap hook (plans 79-12/79-13).
pub trait LogonWrap: Send + Sync + 'static {
    fn before_logon(&self) -> impl Future<Output = Result<WrapTicket, WrapRefused>> + Send;
    fn after_logon(&self, t: WrapTicket) -> impl Future<Output = ()> + Send;
    fn pay_owed(&self, trigger: RestoreTrigger) -> impl Future<Output = RestoreOutcome> + Send;
}

/// The wrap for platforms and modes with nothing to wrap.
pub struct NoWrap;

impl LogonWrap for NoWrap {
    async fn before_logon(&self) -> Result<WrapTicket, WrapRefused> {
        Ok(WrapTicket(0))
    }
    async fn after_logon(&self, _t: WrapTicket) {}
    async fn pay_owed(&self, _trigger: RestoreTrigger) -> RestoreOutcome {
        RestoreOutcome::NotOwed
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatus {
    pub connected: bool,
    pub lease_count: usize,
    pub logon_failure: Option<LogonFailure>,
    pub licenses_len: usize,
}

enum Cmd<C> {
    Acquire {
        token: RefreshTokenSecret,
        reason: String,
        logon_id: u32,
        reply: oneshot::Sender<Result<(LeaseId, u64), Refusal>>,
    },
    AcquireOpen {
        reason: String,
        reply: oneshot::Sender<Option<(LeaseId, u64)>>,
    },
    Release(LeaseId),
    Conn {
        lease: LeaseId,
        reply: oneshot::Sender<Result<ConnRef<C>, OpFailure>>,
    },
    /// An op failed on connection `epoch` with a link-level `cause`: probe, rebuild if dead.
    /// Replies `Ok(true)` when the connection was rebuilt, `Ok(false)` when it proved alive.
    Recover {
        lease: LeaseId,
        epoch: u64,
        cause: &'static str,
        reply: oneshot::Sender<Result<bool, OpFailure>>,
    },
    Licenses {
        lease: LeaseId,
        reply: oneshot::Sender<Result<Vec<LicenseEntry>, OpFailure>>,
    },
    Ensure {
        reply: oneshot::Sender<bool>,
    },
    Logout {
        reply: oneshot::Sender<()>,
    },
    Shutdown {
        bound: Duration,
        reply: oneshot::Sender<RestoreOutcome>,
    },
    Status {
        reply: oneshot::Sender<SessionStatus>,
    },
}

enum LogonErr {
    WrapRefused,
    Cm(CmError),
}

/// What an op needs to run against the current connection.
struct ConnRef<C> {
    conn: Arc<C>,
    epoch: u64,
    /// Set when the session is torn down under the op (LoggedOff 34): the op must give up.
    kill: watch::Receiver<Option<OpFailure>>,
}

enum RecWaiter<C> {
    Recover(oneshot::Sender<Result<bool, OpFailure>>),
    Conn {
        lease: LeaseId,
        reply: oneshot::Sender<Result<ConnRef<C>, OpFailure>>,
    },
    Ensure(oneshot::Sender<bool>),
    Acquire(oneshot::Sender<Result<(LeaseId, u64), Refusal>>),
}

#[derive(PartialEq, Eq)]
enum Phase {
    Probing,
    Rebuilding,
}

struct Recovery<C> {
    rid: u64,
    phase: Phase,
    waiters: Vec<RecWaiter<C>>,
    cancel: Arc<AtomicBool>,
}

enum Internal<C> {
    Connected {
        generation: u64,
        result: Result<Authed<C>, LogonErr>,
    },
    Canary {
        generation: u64,
        ok: bool,
    },
    Probe {
        rid: u64,
        ok: bool,
    },
    Rebuilt {
        rid: u64,
        generation: u64,
        result: Result<Authed<C>, LogonErr>,
        ms: u128,
    },
}

enum Ev<C> {
    Cmd(Option<Cmd<C>>),
    Internal(Internal<C>),
    Idle,
    Tick,
    Off(Option<i32>),
}

enum Waiter {
    Acquire(oneshot::Sender<Result<(LeaseId, u64), Refusal>>),
    Ensure(oneshot::Sender<bool>),
}

struct Connecting {
    generation: u64,
    waiters: Vec<Waiter>,
}

/// Cheap to clone; every method is a message to the actor.
pub struct SessionHandle<B: CmBackend> {
    tx: mpsc::UnboundedSender<Cmd<B::Conn>>,
}

impl<B: CmBackend> Clone for SessionHandle<B> {
    fn clone(&self) -> Self {
        Self {
            tx: self.tx.clone(),
        }
    }
}

impl<B: CmBackend> SessionHandle<B> {
    /// Spawn the actor onto the current runtime. It stops when every handle is dropped.
    pub fn spawn<W: LogonWrap>(backend: Arc<B>, wrap: Arc<W>) -> Self {
        Self::spawn_with_wall(backend, wrap, Arc::new(SystemTime::now))
    }

    /// `spawn` with an injectable wall clock, so tests can simulate a system sleep.
    pub(crate) fn spawn_with_wall<W: LogonWrap>(
        backend: Arc<B>,
        wrap: Arc<W>,
        wall: Arc<dyn Fn() -> SystemTime + Send + Sync>,
    ) -> Self {
        let (tx, rx) = mpsc::unbounded_channel();
        let (itx, irx) = mpsc::unbounded_channel();
        let actor = Actor {
            backend,
            wrap,
            itx,
            creds: None,
            next_lease: 1,
            leases: HashSet::new(),
            generation: 0,
            connecting: None,
            conn: None,
            logged_off: None,
            epoch: 0,
            kill: None,
            recovery: None,
            next_rid: 1,
            suspect: false,
            replaced: false,
            wall,
            steam_id: 0,
            licenses: Vec::new(),
            shutting_down: false,
            logon_failure: None,
            idle_deadline: None,
            canary_waiters: Vec::new(),
        };
        tokio::spawn(actor.run(rx, irx));
        Self { tx }
    }

    async fn ask<T>(&self, make: impl FnOnce(oneshot::Sender<T>) -> Cmd<B::Conn>) -> Option<T> {
        let (rtx, rrx) = oneshot::channel();
        self.tx.send(make(rtx)).ok()?;
        rrx.await.ok()
    }

    pub async fn acquire(
        &self,
        token: RefreshTokenSecret,
        reason: String,
        logon_id: u32,
    ) -> Result<(LeaseId, u64), Refusal> {
        self.ask(|reply| Cmd::Acquire {
            token,
            reason,
            logon_id,
            reply,
        })
        .await
        .unwrap_or(Err(Refusal::ShuttingDown))
    }

    /// A lease on the live session, or `None`. Never logs on.
    pub async fn acquire_open(&self, reason: String) -> Option<(LeaseId, u64)> {
        self.ask(|reply| Cmd::AcquireOpen { reason, reply })
            .await
            .flatten()
    }

    pub fn release(&self, lease: LeaseId) {
        let _ = self.tx.send(Cmd::Release(lease));
    }

    /// Run `f` against the session's connection under `timeout`. The call runs in the caller's
    /// task, so a stalled op never blocks the actor or other callers.
    ///
    /// A link-level failure (timeout, closed, io) makes the actor probe the connection and, when
    /// it is dead, rebuild it; an idempotent op is then run once more. A non-idempotent op is
    /// never resent after a rebuild: it reports `Ambiguous`. The whole command, retry included,
    /// is bounded by `COMMAND_DEADLINE`.
    pub async fn run_op<T>(
        &self,
        lease: LeaseId,
        idempotent: bool,
        timeout: Duration,
        f: impl Fn(Arc<B::Conn>) -> BoxFuture<'static, Result<T, CmError>>,
    ) -> Result<T, OpFailure> {
        let deadline = Instant::now() + COMMAND_DEADLINE;
        let mut retried = false;
        loop {
            let cref = match tokio::time::timeout_at(
                deadline,
                self.ask(|reply| Cmd::Conn { lease, reply }),
            )
            .await
            {
                Err(_) => return Err(OpFailure::Timeout),
                Ok(r) => r.unwrap_or(Err(OpFailure::ShuttingDown))?,
            };
            let ConnRef {
                conn,
                epoch,
                mut kill,
            } = cref;
            let bound = timeout.min(deadline.saturating_duration_since(Instant::now()));
            let err = tokio::select! {
                r = tokio::time::timeout(bound, f(conn)) => match r {
                    Ok(Ok(v)) => return Ok(v),
                    Ok(Err(e)) => e,
                    Err(_) => CmError::Timeout,
                },
                k = kill.wait_for(|k| k.is_some()) => {
                    return Err(k.ok().and_then(|k| k.clone()).unwrap_or(OpFailure::Replaced));
                }
            };
            match classify(&err, idempotent) {
                FailureAction::Terminal(f) => return Err(f),
                FailureAction::FailNoRetry if !indicates_dead(&err) => return Err(op_failure(err)),
                _ => {}
            }
            if retried {
                return Err(op_failure(err));
            }
            let recovered = tokio::time::timeout_at(
                deadline,
                self.ask(|reply| Cmd::Recover {
                    lease,
                    epoch,
                    cause: kind_name(&err),
                    reply,
                }),
            )
            .await;
            let rebuilt = match recovered {
                Err(_) => return Err(OpFailure::Timeout),
                Ok(None) => return Err(OpFailure::ShuttingDown),
                Ok(Some(Err(f))) => return Err(f),
                Ok(Some(Ok(rebuilt))) => rebuilt,
            };
            if !idempotent {
                // The request may have reached Steam before the link died: never resend it.
                return Err(if rebuilt {
                    OpFailure::Ambiguous
                } else {
                    op_failure(err)
                });
            }
            retried = true;
        }
    }

    /// Canary the live session; on failure end it and log on once more. `false` with no session.
    pub async fn ensure_connected(&self) -> bool {
        self.ask(|reply| Cmd::Ensure { reply })
            .await
            .unwrap_or(false)
    }

    pub async fn logout(&self) {
        let _ = self.ask(|reply| Cmd::Logout { reply }).await;
    }

    /// Abandon any logon, close the session, then pay the wrap's owed go-online, all under `bound`.
    pub async fn shutdown(&self, bound: Duration) -> RestoreOutcome {
        self.ask(|reply| Cmd::Shutdown { bound, reply })
            .await
            .unwrap_or(RestoreOutcome::NotOwed)
    }

    pub async fn status(&self) -> SessionStatus {
        self.ask(|reply| Cmd::Status { reply })
            .await
            .unwrap_or(SessionStatus {
                connected: false,
                lease_count: 0,
                logon_failure: None,
                licenses_len: 0,
            })
    }

    pub async fn licenses(&self, lease: LeaseId) -> Result<Vec<LicenseEntry>, OpFailure> {
        self.ask(|reply| Cmd::Licenses { lease, reply })
            .await
            .unwrap_or(Err(OpFailure::ShuttingDown))
    }
}

struct Actor<B: CmBackend, W: LogonWrap> {
    backend: Arc<B>,
    wrap: Arc<W>,
    itx: mpsc::UnboundedSender<Internal<B::Conn>>,
    /// Most recent token and logon id; replaced on each acquire, reused by reconnects (D-07).
    creds: Option<(Arc<RefreshTokenSecret>, u32)>,
    next_lease: LeaseId,
    leases: HashSet<LeaseId>,
    /// Bumped by logout; a logon result from an older generation is stale.
    generation: u64,
    connecting: Option<Connecting>,
    conn: Option<Arc<B::Conn>>,
    /// The connection's LoggedOff stream, selected in the control loop.
    logged_off: Option<mpsc::Receiver<i32>>,
    /// Bumped on every installed connection; an op's failure is only acted on for its own epoch.
    epoch: u64,
    kill: Option<watch::Sender<Option<OpFailure>>>,
    recovery: Option<Recovery<B::Conn>>,
    next_rid: u64,
    /// A sleep was seen while no lease was held: probe before the session is next used.
    suspect: bool,
    /// The session ended with LoggedOff 34 and has not been logged on again.
    replaced: bool,
    wall: Arc<dyn Fn() -> SystemTime + Send + Sync>,
    steam_id: u64,
    licenses: Vec<LicenseEntry>,
    shutting_down: bool,
    logon_failure: Option<LogonFailure>,
    idle_deadline: Option<Instant>,
    canary_waiters: Vec<oneshot::Sender<bool>>,
}

impl<B: CmBackend, W: LogonWrap> Actor<B, W> {
    async fn run(
        mut self,
        mut rx: mpsc::UnboundedReceiver<Cmd<B::Conn>>,
        mut irx: mpsc::UnboundedReceiver<Internal<B::Conn>>,
    ) {
        let mut tick = tokio::time::interval(GAP_TICK);
        tick.set_missed_tick_behavior(MissedTickBehavior::Delay);
        let mut gap = GapDetector::default();
        loop {
            let idle = self.idle_deadline;
            // Taken out so the select arm does not borrow `self`; put back before any handler.
            let mut lo = self.logged_off.take();
            let ev = tokio::select! {
                cmd = rx.recv() => Ev::Cmd(cmd),
                Some(msg) = irx.recv() => Ev::Internal(msg),
                _ = async {
                    match idle {
                        Some(d) => tokio::time::sleep_until(d).await,
                        None => std::future::pending::<()>().await,
                    }
                } => Ev::Idle,
                _ = tick.tick() => Ev::Tick,
                off = async {
                    match lo.as_mut() {
                        Some(r) => r.recv().await,
                        None => std::future::pending::<Option<i32>>().await,
                    }
                } => Ev::Off(off),
            };
            if !matches!(ev, Ev::Off(None)) {
                self.logged_off = lo;
            }
            match ev {
                Ev::Cmd(Some(c)) => self.on_cmd(c),
                Ev::Cmd(None) => break,
                Ev::Internal(msg) => self.on_internal(msg),
                Ev::Idle => self.on_idle(),
                Ev::Tick => {
                    if let Some(secs) = gap.tick((self.wall)(), Instant::now()) {
                        self.on_gap(secs);
                    }
                }
                Ev::Off(Some(code)) => self.on_logged_off(code),
                Ev::Off(None) => {}
            }
        }
        self.close_conn("handles-dropped");
    }

    fn on_cmd(&mut self, cmd: Cmd<B::Conn>) {
        match cmd {
            Cmd::Acquire {
                token,
                reason,
                logon_id,
                reply,
            } => self.on_acquire(token, reason, logon_id, reply),
            Cmd::AcquireOpen { reason, reply } => {
                let r = match (&self.conn, self.shutting_down) {
                    (Some(_), false) => {
                        diag(&format!("CM session open acquire reason={reason}"));
                        self.probe_if_suspect();
                        Some((self.new_lease(), self.steam_id))
                    }
                    _ => None,
                };
                if r.is_none() {
                    let _ = reply.send(None);
                } else if let Some(id) = r.map(|(l, _)| l) {
                    if reply.send(r).is_err() {
                        self.drop_lease(id);
                    }
                }
            }
            Cmd::Release(lease) => self.drop_lease(lease),
            Cmd::Conn { lease, reply } => {
                if self.shutting_down {
                    let _ = reply.send(Err(OpFailure::ShuttingDown));
                } else if !self.leases.contains(&lease) {
                    let _ = reply.send(Err(OpFailure::LeaseUnknown));
                } else if let Some(rec) = &mut self.recovery {
                    // Ops queued during a probe or rebuild wait for it; they start no recovery.
                    rec.waiters.push(RecWaiter::Conn { lease, reply });
                } else {
                    let _ = reply.send(self.conn_ref());
                }
            }
            Cmd::Recover {
                lease,
                epoch,
                cause,
                reply,
            } => self.on_recover(lease, epoch, cause, reply),
            Cmd::Licenses { lease, reply } => {
                let r = if self.shutting_down {
                    Err(OpFailure::ShuttingDown)
                } else if !self.leases.contains(&lease) {
                    Err(OpFailure::LeaseUnknown)
                } else {
                    Ok(self.licenses.clone())
                };
                let _ = reply.send(r);
            }
            Cmd::Ensure { reply } => self.on_ensure(reply),
            Cmd::Logout { reply } => {
                self.generation += 1;
                self.leases.clear();
                self.idle_deadline = None;
                self.creds = None;
                self.logon_failure = None;
                self.abandon_pending(Refusal::NotSignedIn);
                self.close_conn("logout");
                let _ = reply.send(());
            }
            Cmd::Shutdown { bound, reply } => {
                self.shutting_down = true;
                self.leases.clear();
                self.idle_deadline = None;
                self.abandon_pending(Refusal::ShuttingDown);
                self.close_conn("shutdown");
                let wrap = self.wrap.clone();
                tokio::spawn(async move {
                    let out = tokio::time::timeout(bound, wrap.pay_owed(RestoreTrigger::Shutdown))
                        .await
                        .unwrap_or(RestoreOutcome::TimedOut);
                    let _ = reply.send(out);
                });
            }
            Cmd::Status { reply } => {
                let _ = reply.send(SessionStatus {
                    connected: self.conn.is_some(),
                    lease_count: self.leases.len(),
                    logon_failure: self.logon_failure.clone(),
                    licenses_len: self.licenses.len(),
                });
            }
        }
    }

    fn new_lease(&mut self) -> LeaseId {
        let id = self.next_lease;
        self.next_lease += 1;
        self.leases.insert(id);
        self.idle_deadline = None;
        id
    }

    fn drop_lease(&mut self, lease: LeaseId) {
        if self.leases.remove(&lease) && self.leases.is_empty() && self.conn.is_some() {
            self.idle_deadline = Some(Instant::now() + IDLE_GRACE);
        }
    }

    fn on_acquire(
        &mut self,
        token: RefreshTokenSecret,
        reason: String,
        logon_id: u32,
        reply: oneshot::Sender<Result<(LeaseId, u64), Refusal>>,
    ) {
        if self.shutting_down {
            let _ = reply.send(Err(Refusal::ShuttingDown));
            return;
        }
        self.creds = Some((Arc::new(token), logon_id));
        self.replaced = false;
        if let Some(rec) = &mut self.recovery {
            if self.conn.is_none() {
                rec.waiters.push(RecWaiter::Acquire(reply));
                return;
            }
        }
        if self.conn.is_some() {
            self.probe_if_suspect();
            let id = self.new_lease();
            if reply.send(Ok((id, self.steam_id))).is_err() {
                self.drop_lease(id);
            }
            return;
        }
        match &mut self.connecting {
            Some(c) => c.waiters.push(Waiter::Acquire(reply)),
            None => {
                self.start_connect(&reason, vec![Waiter::Acquire(reply)]);
            }
        }
    }

    fn start_connect(&mut self, reason: &str, waiters: Vec<Waiter>) {
        let Some((token, logon_id)) = self.creds.clone() else {
            fail_waiters(waiters, Refusal::NotSignedIn);
            return;
        };
        diag(&format!("CM logon mode=authenticated reason={reason}"));
        let generation = self.generation;
        self.connecting = Some(Connecting {
            generation,
            waiters,
        });
        let backend = self.backend.clone();
        let wrap = self.wrap.clone();
        let itx = self.itx.clone();
        tokio::spawn(async move {
            let result = match wrap.before_logon().await {
                Err(_) => Err(LogonErr::WrapRefused),
                Ok(ticket) => {
                    let r =
                        tokio::time::timeout(LOGON_BOUND, backend.connect_authed(&token, logon_id))
                            .await;
                    wrap.after_logon(ticket).await;
                    match r {
                        Err(_) => Err(LogonErr::Cm(CmError::Timeout)),
                        Ok(Ok(a)) => Ok(a),
                        Ok(Err(e)) => Err(LogonErr::Cm(e)),
                    }
                }
            };
            let _ = itx.send(Internal::Connected { generation, result });
        });
    }

    fn abandon_pending(&mut self, why: Refusal) {
        let op = match why {
            Refusal::NotSignedIn => OpFailure::LeaseUnknown,
            _ => OpFailure::ShuttingDown,
        };
        self.fail_recovery(op, why);
        if let Some(c) = self.connecting.take() {
            fail_waiters(c.waiters, why);
        }
        for w in self.canary_waiters.drain(..) {
            let _ = w.send(false);
        }
    }

    fn close_conn(&mut self, cause: &str) {
        if let Some(conn) = self.conn.take() {
            conn.close();
            diag(&format!(
                "CM session closed mode=authenticated cause={cause} leases={}",
                self.leases.len()
            ));
        }
        self.logged_off = None;
        self.kill = None;
        self.licenses.clear();
        self.steam_id = 0;
    }

    fn on_idle(&mut self) {
        self.idle_deadline = None;
        if self.leases.is_empty() && self.recovery.is_none() {
            self.close_conn("idle");
        }
    }

    fn on_ensure(&mut self, reply: oneshot::Sender<bool>) {
        if self.shutting_down {
            let _ = reply.send(false);
            return;
        }
        if let Some(c) = &mut self.connecting {
            c.waiters.push(Waiter::Ensure(reply));
            return;
        }
        if let Some(rec) = &mut self.recovery {
            rec.waiters.push(RecWaiter::Ensure(reply));
            return;
        }
        let Some(conn) = self.conn.clone() else {
            let _ = reply.send(false);
            return;
        };
        let first = self.canary_waiters.is_empty();
        self.canary_waiters.push(reply);
        if !first {
            return;
        }
        let generation = self.generation;
        let itx = self.itx.clone();
        tokio::spawn(async move {
            let probe = async {
                let tokens = conn.pics_access_tokens(vec![CANARY_APP_ID], vec![]).await?;
                let access_token = tokens
                    .apps
                    .iter()
                    .find(|(id, _)| *id == CANARY_APP_ID)
                    .map(|(_, t)| *t)
                    .unwrap_or(0);
                conn.pics_product_info(PicsRequest {
                    apps: vec![PicsId {
                        id: CANARY_APP_ID,
                        access_token,
                    }],
                    packages: vec![],
                    meta_data_only: true,
                })
                .await
                .map(|_| ())
            };
            let ok = matches!(
                tokio::time::timeout(CANARY_TIMEOUT, probe).await,
                Ok(Ok(()))
            );
            let _ = itx.send(Internal::Canary { generation, ok });
        });
    }

    fn on_internal(&mut self, msg: Internal<B::Conn>) {
        match msg {
            Internal::Connected { generation, result } => self.on_connected(generation, result),
            Internal::Canary { generation, ok } => {
                if generation != self.generation || self.shutting_down {
                    for w in self.canary_waiters.drain(..) {
                        let _ = w.send(false);
                    }
                    return;
                }
                if ok {
                    for w in self.canary_waiters.drain(..) {
                        let _ = w.send(true);
                    }
                    return;
                }
                // The canary is a stronger probe than `probe()`: go straight to the rebuild.
                let waiters: Vec<RecWaiter<B::Conn>> = self
                    .canary_waiters
                    .drain(..)
                    .map(RecWaiter::Ensure)
                    .collect();
                self.begin_rebuild("canary", waiters);
            }
            Internal::Probe { rid, ok } => self.on_probe(rid, ok),
            Internal::Rebuilt {
                rid,
                generation,
                result,
                ms,
            } => self.on_rebuilt(rid, generation, result, ms),
        }
    }

    fn conn_ref(&self) -> Result<ConnRef<B::Conn>, OpFailure> {
        match (&self.conn, &self.kill) {
            (Some(conn), Some(kill)) => Ok(ConnRef {
                conn: conn.clone(),
                epoch: self.epoch,
                kill: kill.subscribe(),
            }),
            _ if self.replaced => Err(OpFailure::Replaced),
            _ => Err(OpFailure::Cm(CmError::Closed)),
        }
    }

    /// Make `a` the session's connection.
    fn install(&mut self, a: Authed<B::Conn>) {
        self.epoch += 1;
        self.conn = Some(Arc::new(a.conn));
        self.logged_off = Some(a.logged_off);
        self.kill = Some(watch::channel(None).0);
        self.steam_id = a.steam_id;
        self.licenses = a.licenses;
        self.logon_failure = None;
        self.replaced = false;
        self.suspect = false;
    }

    // ---- recovery (79-11) ----

    fn on_recover(
        &mut self,
        lease: LeaseId,
        epoch: u64,
        cause: &'static str,
        reply: oneshot::Sender<Result<bool, OpFailure>>,
    ) {
        if self.shutting_down {
            let _ = reply.send(Err(OpFailure::ShuttingDown));
        } else if !self.leases.contains(&lease) {
            let _ = reply.send(Err(OpFailure::LeaseUnknown));
        } else if let Some(rec) = &mut self.recovery {
            rec.waiters.push(RecWaiter::Recover(reply));
        } else if self.conn.is_none() {
            let _ = reply.send(Err(if self.replaced {
                OpFailure::Replaced
            } else {
                OpFailure::Cm(CmError::Closed)
            }));
        } else if epoch != self.epoch {
            // The connection that failed has already been replaced.
            let _ = reply.send(Ok(true));
        } else {
            self.start_probe(cause, vec![RecWaiter::Recover(reply)]);
        }
    }

    fn probe_if_suspect(&mut self) {
        if self.suspect && self.recovery.is_none() && self.conn.is_some() {
            self.start_probe("suspect", Vec::new());
        }
    }

    fn on_gap(&mut self, secs: f64) {
        if self.conn.is_none() || self.shutting_down {
            return;
        }
        diag(&format!("CM sleep gap {secs:.0}s detected"));
        if self.leases.is_empty() {
            self.suspect = true;
        } else if self.recovery.is_none() {
            self.start_probe("sleep", Vec::new());
        }
    }

    fn start_probe(&mut self, cause: &'static str, waiters: Vec<RecWaiter<B::Conn>>) {
        let Some(conn) = self.conn.clone() else {
            return;
        };
        self.suspect = false;
        let rid = self.next_rid;
        self.next_rid += 1;
        self.recovery = Some(Recovery {
            rid,
            phase: Phase::Probing,
            waiters,
            cancel: Arc::new(AtomicBool::new(false)),
        });
        diag(&format!("CM probing session (cause={cause})"));
        let itx = self.itx.clone();
        tokio::spawn(async move {
            let ok = matches!(
                tokio::time::timeout(PROBE_TIMEOUT, conn.probe()).await,
                Ok(Ok(()))
            );
            let _ = itx.send(Internal::Probe { rid, ok });
        });
    }

    fn on_probe(&mut self, rid: u64, ok: bool) {
        match &self.recovery {
            Some(r) if r.rid == rid && r.phase == Phase::Probing => {}
            _ => return,
        }
        if ok {
            self.finish_recovery(false);
        } else {
            self.begin_rebuild("probe", Vec::new());
        }
    }

    /// End the dead connection and log on again with backoff. Joins a recovery in progress.
    fn begin_rebuild(&mut self, cause: &'static str, waiters: Vec<RecWaiter<B::Conn>>) {
        match &mut self.recovery {
            Some(r) if r.phase == Phase::Rebuilding => {
                r.waiters.extend(waiters);
                return;
            }
            Some(r) => {
                r.waiters.extend(waiters);
                r.phase = Phase::Rebuilding;
            }
            None => {
                let rid = self.next_rid;
                self.next_rid += 1;
                self.recovery = Some(Recovery {
                    rid,
                    phase: Phase::Rebuilding,
                    waiters,
                    cancel: Arc::new(AtomicBool::new(false)),
                });
            }
        }
        let Some((token, logon_id)) = self.creds.clone() else {
            self.fail_recovery(OpFailure::LeaseUnknown, Refusal::NotSignedIn);
            return;
        };
        self.close_conn(cause);
        let Some(rec) = &self.recovery else {
            return;
        };
        let (rid, cancel) = (rec.rid, rec.cancel.clone());
        let generation = self.generation;
        let backend = self.backend.clone();
        let wrap = self.wrap.clone();
        let itx = self.itx.clone();
        tokio::spawn(async move {
            let t0 = Instant::now();
            let mut last = CmError::Closed;
            let mut result = None;
            for (i, delay) in Backoff::new().enumerate() {
                tokio::time::sleep(delay).await;
                if cancel.load(Ordering::SeqCst) {
                    return;
                }
                diag(&format!(
                    "CM session dead (cause={cause}), rebuilding attempt={}",
                    i + 1
                ));
                let ticket = match wrap.before_logon().await {
                    Ok(t) => t,
                    Err(_) => {
                        result = Some(Err(LogonErr::WrapRefused));
                        break;
                    }
                };
                let r = tokio::time::timeout(
                    RECONNECT_ATTEMPT_BOUND,
                    backend.connect_authed(&token, logon_id),
                )
                .await;
                wrap.after_logon(ticket).await;
                match r {
                    Ok(Ok(a)) => {
                        result = Some(Ok(a));
                        break;
                    }
                    Ok(Err(e)) => {
                        let transient = is_transient(&e);
                        last = e;
                        if !transient {
                            break;
                        }
                    }
                    Err(_) => last = CmError::Timeout,
                }
            }
            let result = result.unwrap_or(Err(LogonErr::Cm(last)));
            let _ = itx.send(Internal::Rebuilt {
                rid,
                generation,
                result,
                ms: t0.elapsed().as_millis(),
            });
        });
    }

    fn on_rebuilt(
        &mut self,
        rid: u64,
        generation: u64,
        result: Result<Authed<B::Conn>, LogonErr>,
        ms: u128,
    ) {
        let current = self.recovery.as_ref().map(|r| r.rid) == Some(rid)
            && generation == self.generation
            && !self.shutting_down;
        if !current {
            if let Ok(a) = result {
                a.conn.close();
                diag("CM rebuild landed after sign-out/shutdown, closed");
            }
            return;
        }
        match result {
            Ok(a) => {
                self.install(a);
                diag(&format!("CM session rebuilt in {ms}ms"));
                self.finish_recovery(true);
            }
            Err(LogonErr::WrapRefused) => self.fail_recovery(
                OpFailure::Cm(CmError::Protocol("go-offline-required".into())),
                Refusal::GoOfflineRequired,
            ),
            Err(LogonErr::Cm(e)) => {
                let refusal = if is_credential_refusal(&e) {
                    self.logon_failure = Some(LogonFailure {
                        kind: "logon-rejected",
                        eresult: eresult_of(&e),
                    });
                    Refusal::LogonRejected
                } else {
                    Refusal::ClientNotReady
                };
                diag(&format!(
                    "CM rebuild failed cause={} verdict={refusal:?}",
                    kind_name(&e)
                ));
                self.fail_recovery(op_failure(e), refusal);
            }
        }
    }

    /// The probe found the link alive (`rebuilt == false`) or the rebuild installed a new one.
    fn finish_recovery(&mut self, rebuilt: bool) {
        let Some(rec) = self.recovery.take() else {
            return;
        };
        for w in rec.waiters {
            match w {
                RecWaiter::Recover(r) => {
                    let _ = r.send(Ok(rebuilt));
                }
                RecWaiter::Conn { lease, reply } => {
                    let _ = reply.send(if self.leases.contains(&lease) {
                        self.conn_ref()
                    } else {
                        Err(OpFailure::LeaseUnknown)
                    });
                }
                RecWaiter::Ensure(r) => {
                    let _ = r.send(true);
                }
                RecWaiter::Acquire(r) => {
                    let id = self.new_lease();
                    if r.send(Ok((id, self.steam_id))).is_err() {
                        self.drop_lease(id);
                    }
                }
            }
        }
        if self.leases.is_empty() && self.conn.is_some() {
            self.idle_deadline = Some(Instant::now() + IDLE_GRACE);
        }
    }

    /// Cancel the recovery and fail everything waiting on it.
    fn fail_recovery(&mut self, op: OpFailure, refusal: Refusal) {
        let Some(rec) = self.recovery.take() else {
            return;
        };
        rec.cancel.store(true, Ordering::SeqCst);
        for w in rec.waiters {
            match w {
                RecWaiter::Recover(r) => {
                    let _ = r.send(Err(op.clone()));
                }
                RecWaiter::Conn { reply, .. } => {
                    let _ = reply.send(Err(op.clone()));
                }
                RecWaiter::Ensure(r) => {
                    let _ = r.send(false);
                }
                RecWaiter::Acquire(r) => {
                    let _ = r.send(Err(refusal));
                }
            }
        }
    }

    fn on_logged_off(&mut self, eresult: i32) {
        if eresult == ERESULT_LOGON_SESSION_REPLACED {
            // Another client took the session. Reconnecting would only ping-pong (085).
            diag("CM session replaced (eresult 34), not reconnecting");
            if let Some(k) = &self.kill {
                let _ = k.send(Some(OpFailure::Replaced));
            }
            self.replaced = true;
            self.fail_recovery(OpFailure::Replaced, Refusal::ClientNotReady);
            for w in self.canary_waiters.drain(..) {
                let _ = w.send(false);
            }
            self.close_conn("replaced");
            return;
        }
        if self.leases.is_empty() {
            self.close_conn("logged-off");
            return;
        }
        if self.conn.is_some() {
            diag(&format!(
                "CM logged off (eresult {eresult}) with leases held"
            ));
            self.begin_rebuild("logged-off", Vec::new());
        }
    }

    fn on_connected(&mut self, generation: u64, result: Result<Authed<B::Conn>, LogonErr>) {
        let current = self.connecting.as_ref().map(|c| c.generation) == Some(generation)
            && generation == self.generation
            && !self.shutting_down;
        if !current {
            if let Ok(a) = result {
                a.conn.close();
                diag("CM logon landed after sign-out/shutdown, closed");
            }
            return;
        }
        let Some(connecting) = self.connecting.take() else {
            return;
        };
        match result {
            Ok(a) => {
                self.install(a);
                for w in connecting.waiters {
                    match w {
                        Waiter::Acquire(reply) => {
                            let id = self.new_lease();
                            if reply.send(Ok((id, self.steam_id))).is_err() {
                                self.drop_lease(id);
                            }
                        }
                        Waiter::Ensure(reply) => {
                            let _ = reply.send(true);
                        }
                    }
                }
                if self.leases.is_empty() {
                    self.idle_deadline = Some(Instant::now() + IDLE_GRACE);
                }
            }
            Err(LogonErr::WrapRefused) => {
                fail_waiters(connecting.waiters, Refusal::GoOfflineRequired);
            }
            Err(LogonErr::Cm(e)) => {
                let refusal = if is_credential_refusal(&e) {
                    self.logon_failure = Some(LogonFailure {
                        kind: "logon-rejected",
                        eresult: eresult_of(&e),
                    });
                    Refusal::LogonRejected
                } else {
                    Refusal::ClientNotReady
                };
                diag(&format!(
                    "CM logon failed mode=authenticated verdict={refusal:?}"
                ));
                fail_waiters(connecting.waiters, refusal);
            }
        }
    }
}

fn op_failure(e: CmError) -> OpFailure {
    match e {
        CmError::Timeout => OpFailure::Timeout,
        CmError::Replaced => OpFailure::Replaced,
        e => OpFailure::Cm(e),
    }
}

fn fail_waiters(waiters: Vec<Waiter>, why: Refusal) {
    for w in waiters {
        match w {
            Waiter::Acquire(reply) => {
                let _ = reply.send(Err(why));
            }
            Waiter::Ensure(reply) => {
                let _ = reply.send(false);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fake::FakeBackend;
    use std::sync::Mutex;

    type H = SessionHandle<FakeBackend>;

    fn tok() -> RefreshTokenSecret {
        RefreshTokenSecret::new("t".into())
    }

    fn setup() -> (Arc<FakeBackend>, H) {
        let b = Arc::new(FakeBackend::new());
        let h = SessionHandle::spawn(b.clone(), Arc::new(NoWrap));
        (b, h)
    }

    async fn acq(h: &H) -> Result<(LeaseId, u64), Refusal> {
        h.acquire(tok(), "test".into(), 0).await
    }

    fn secs(n: u64) -> Duration {
        Duration::from_secs(n)
    }

    #[tokio::test(start_paused = true)]
    async fn concurrent_acquires_share_one_logon() {
        let (b, h) = setup();
        let (a, c) = tokio::join!(acq(&h), acq(&h));
        let (a, c) = (a.unwrap(), c.unwrap());
        assert_ne!(a.0, c.0);
        assert_eq!(b.connect_count(), 1);
        assert_eq!(h.status().await.lease_count, 2);
    }

    #[tokio::test(start_paused = true)]
    async fn idle_close_after_grace_and_reuse_inside_it() {
        let (b, h) = setup();
        let (l1, _) = acq(&h).await.unwrap();
        let (l2, _) = acq(&h).await.unwrap();
        h.release(l1);
        h.release(l2);
        tokio::time::sleep(secs(59)).await;
        assert!(h.status().await.connected);
        // An acquire inside the window cancels the close and reuses the session.
        let (l3, _) = acq(&h).await.unwrap();
        tokio::time::sleep(secs(120)).await;
        assert!(h.status().await.connected);
        assert_eq!(b.connect_count(), 1);
        h.release(l3);
        tokio::time::sleep(secs(59)).await;
        assert!(h.status().await.connected);
        tokio::time::sleep(secs(2)).await;
        assert!(!h.status().await.connected);
        assert!(b.all_closed());
    }

    #[tokio::test(start_paused = true)]
    async fn acquire_open_never_connects_and_reuses_a_session() {
        let (b, h) = setup();
        assert_eq!(h.acquire_open("t".into()).await, None);
        assert_eq!(b.connect_count(), 0);
        let (l1, id) = acq(&h).await.unwrap();
        h.release(l1);
        tokio::time::sleep(secs(50)).await;
        let (l2, id2) = h.acquire_open("t".into()).await.unwrap();
        assert_eq!(id, id2);
        // Held lease: the original idle deadline no longer closes the session.
        tokio::time::sleep(secs(30)).await;
        assert!(h.status().await.connected);
        h.release(l2);
        assert_eq!(b.connect_count(), 1);
    }

    #[tokio::test(start_paused = true)]
    async fn logout_during_connect_closes_the_late_conn() {
        let (b, h) = setup();
        b.set_delay("connect_authed", secs(10));
        let h2 = h.clone();
        let acquire = tokio::spawn(async move { acq(&h2).await });
        tokio::time::sleep(secs(1)).await;
        h.logout().await;
        assert_eq!(acquire.await.unwrap(), Err(Refusal::NotSignedIn));
        tokio::time::sleep(secs(15)).await;
        assert!(b.all_closed());
        let s = h.status().await;
        assert!(!s.connected);
        assert_eq!(s.lease_count, 0);
    }

    #[tokio::test(start_paused = true)]
    async fn slow_logon_is_client_not_ready_and_discarded() {
        let (b, h) = setup();
        b.set_delay("connect_authed", secs(40));
        assert_eq!(acq(&h).await, Err(Refusal::ClientNotReady));
        tokio::time::sleep(secs(10)).await;
        assert!(!h.status().await.connected);
        assert_eq!(h.status().await.logon_failure, None);
    }

    #[tokio::test(start_paused = true)]
    async fn credential_refusal_latches_logon_failure() {
        let (b, h) = setup();
        b.push_authed(Err(CmError::EResult(15)));
        assert_eq!(acq(&h).await, Err(Refusal::LogonRejected));
        let f = h.status().await.logon_failure.unwrap();
        assert_eq!((f.kind, f.eresult), ("logon-rejected", Some(15)));
    }

    #[tokio::test(start_paused = true)]
    async fn transient_failure_never_claims_a_credential_problem() {
        let (b, h) = setup();
        b.push_authed(Err(CmError::Timeout));
        assert_eq!(acq(&h).await, Err(Refusal::ClientNotReady));
        assert_eq!(h.status().await.logon_failure, None);
        // 34 is not a refusal either.
        b.push_authed(Err(CmError::Replaced));
        assert_eq!(acq(&h).await, Err(Refusal::ClientNotReady));
        assert_eq!(h.status().await.logon_failure, None);
    }

    #[tokio::test(start_paused = true)]
    async fn run_op_unknown_lease_and_timeout_do_not_block_the_actor() {
        let (b, h) = setup();
        let none = h
            .run_op(99, true, secs(5), |c| {
                Box::pin(async move { c.probe().await })
            })
            .await;
        assert_eq!(none, Err(OpFailure::LeaseUnknown));
        let (l, _) = acq(&h).await.unwrap();
        h.release(l);
        let released = h
            .run_op(l, true, secs(5), |c| {
                Box::pin(async move { c.probe().await })
            })
            .await;
        assert_eq!(released, Err(OpFailure::LeaseUnknown));
        let (l, _) = acq(&h).await.unwrap();
        b.set_delay("probe", secs(30));
        let h2 = h.clone();
        let slow = tokio::spawn(async move {
            h2.run_op(l, true, secs(5), |c| {
                Box::pin(async move { c.probe().await })
            })
            .await
        });
        tokio::time::sleep(secs(1)).await;
        let t0 = Instant::now();
        let st = h.status().await;
        assert!(st.connected);
        assert!(t0.elapsed() < Duration::from_millis(10));
        assert_eq!(slow.await.unwrap(), Err(OpFailure::Timeout));
        b.set_delay("probe", Duration::ZERO);
        let ok = h
            .run_op(l, true, secs(5), |c| {
                Box::pin(async move { c.probe().await })
            })
            .await;
        assert_eq!(ok, Ok(()));
    }

    // ---- Task 2: shutdown ordering, wrap hooks, canary ----

    type Log = Arc<Mutex<Vec<&'static str>>>;

    struct RecordingWrap {
        log: Log,
        backend: Arc<FakeBackend>,
        refuse: bool,
        owed_delay: Duration,
    }

    impl LogonWrap for RecordingWrap {
        async fn before_logon(&self) -> Result<WrapTicket, WrapRefused> {
            self.log.lock().unwrap().push("before_logon");
            if self.refuse {
                Err(WrapRefused::default())
            } else {
                Ok(WrapTicket(1))
            }
        }
        async fn after_logon(&self, _t: WrapTicket) {
            self.log.lock().unwrap().push("after_logon");
        }
        async fn pay_owed(&self, _trigger: RestoreTrigger) -> RestoreOutcome {
            // Recorded with the backend's closed state at the moment the payment starts.
            let closed = self.backend.all_closed();
            self.log.lock().unwrap().push(if closed {
                "pay_owed:closed"
            } else {
                "pay_owed:open"
            });
            tokio::time::sleep(self.owed_delay).await;
            RestoreOutcome::Restored
        }
    }

    fn recorded(refuse: bool, owed_delay: Duration) -> (Arc<FakeBackend>, H, Log) {
        let b = Arc::new(FakeBackend::new());
        let log: Log = Arc::default();
        let w = Arc::new(RecordingWrap {
            log: log.clone(),
            backend: b.clone(),
            refuse,
            owed_delay,
        });
        (b.clone(), SessionHandle::spawn(b, w), log)
    }

    #[tokio::test(start_paused = true)]
    async fn shutdown_closes_before_paying_owed() {
        let (b, h, log) = recorded(false, Duration::ZERO);
        let _ = acq(&h).await.unwrap();
        assert_eq!(h.shutdown(secs(5)).await, RestoreOutcome::Restored);
        assert!(b.all_closed());
        assert_eq!(
            *log.lock().unwrap(),
            vec!["before_logon", "after_logon", "pay_owed:closed"]
        );
        assert_eq!(acq(&h).await, Err(Refusal::ShuttingDown));
        assert_eq!(b.connect_count(), 1);
    }

    #[tokio::test(start_paused = true)]
    async fn shutdown_during_connect_abandons_it_then_pays() {
        let (b, h, log) = recorded(false, Duration::ZERO);
        b.set_delay("connect_authed", secs(10));
        let h2 = h.clone();
        let pending = tokio::spawn(async move { acq(&h2).await });
        tokio::time::sleep(secs(1)).await;
        assert_eq!(h.shutdown(secs(5)).await, RestoreOutcome::Restored);
        assert_eq!(pending.await.unwrap(), Err(Refusal::ShuttingDown));
        assert!(!h.status().await.connected);
        tokio::time::sleep(secs(15)).await;
        // The late logon is closed, and after_logon still ran exactly once.
        assert!(b.all_closed());
        assert!(!h.status().await.connected);
        let l = log.lock().unwrap().clone();
        assert_eq!(l.iter().filter(|e| **e == "after_logon").count(), 1);
        assert!(l
            .iter()
            .position(|e| *e == "pay_owed:closed" || *e == "pay_owed:open")
            .is_some());
    }

    #[tokio::test(start_paused = true)]
    async fn shutdown_is_bounded_when_pay_owed_hangs() {
        let (_b, h, _log) = recorded(false, secs(3600));
        let t0 = Instant::now();
        assert_eq!(h.shutdown(secs(5)).await, RestoreOutcome::TimedOut);
        assert!(t0.elapsed() <= secs(6));
        assert_eq!(
            serde_json::to_string(&RestoreOutcome::TimedOut).unwrap(),
            "\"restore-unconfirmed\""
        );
    }

    #[tokio::test(start_paused = true)]
    async fn wrap_refusal_means_go_offline_required_without_connecting() {
        let (b, h, log) = recorded(true, Duration::ZERO);
        assert_eq!(acq(&h).await, Err(Refusal::GoOfflineRequired));
        assert_eq!(b.connect_count(), 0);
        assert_eq!(h.status().await.logon_failure, None);
        assert_eq!(*log.lock().unwrap(), vec!["before_logon"]);
    }

    #[tokio::test(start_paused = true)]
    async fn after_logon_runs_once_per_attempt_even_on_failure() {
        let (b, h, log) = recorded(false, Duration::ZERO);
        b.push_authed(Err(CmError::EResult(15)));
        assert_eq!(acq(&h).await, Err(Refusal::LogonRejected));
        b.set_delay("connect_authed", secs(40));
        assert_eq!(acq(&h).await, Err(Refusal::ClientNotReady));
        let l = log.lock().unwrap().clone();
        assert_eq!(l.iter().filter(|e| **e == "before_logon").count(), 2);
        assert_eq!(l.iter().filter(|e| **e == "after_logon").count(), 2);
    }

    #[tokio::test(start_paused = true)]
    async fn ensure_connected_healthy_reconnects_on_canary_failure_and_false_without_session() {
        let (b, h) = setup();
        assert!(!h.ensure_connected().await);
        assert_eq!(b.connect_count(), 0);
        let (l, _) = acq(&h).await.unwrap();
        assert!(h.ensure_connected().await);
        assert_eq!(b.connect_count(), 1);
        b.inject_job_failure(1, CmError::Timeout);
        assert!(h.ensure_connected().await);
        assert_eq!(b.connect_count(), 2);
        assert!(h.status().await.connected);
        // The lease survived the reconnect.
        assert_eq!(
            h.run_op(l, true, secs(5), |c| Box::pin(
                async move { c.probe().await }
            ))
            .await,
            Ok(())
        );
    }

    #[test]
    fn refusal_and_outcome_serialise_kebab_case() {
        assert_eq!(
            serde_json::to_string(&Refusal::GoOfflineRequired).unwrap(),
            "\"go-offline-required\""
        );
        assert_eq!(
            serde_json::to_string(&RestoreOutcome::KeptProbeFailed).unwrap(),
            "\"kept-probe-failed\""
        );
    }

    // ---- 79-11: probe, rebuild, retry once, 34, sleep gap ----

    use std::sync::atomic::AtomicUsize;

    async fn personas_op(
        h: &H,
        lease: LeaseId,
        idem: bool,
        runs: &Arc<AtomicUsize>,
    ) -> Result<(), OpFailure> {
        let runs = runs.clone();
        h.run_op(lease, idem, secs(5), move |c| {
            runs.fetch_add(1, Ordering::SeqCst);
            Box::pin(async move { c.personas(vec![]).await.map(|_| ()) })
        })
        .await
    }

    #[tokio::test(start_paused = true)]
    async fn dead_probe_rebuilds_once_then_retries_the_op() {
        let (b, h) = setup();
        let (l, _) = acq(&h).await.unwrap();
        // Job 1 is the op, job 2 the probe.
        b.inject_job_failure(2, CmError::Timeout);
        let runs = Arc::new(AtomicUsize::new(0));
        assert_eq!(personas_op(&h, l, true, &runs).await, Ok(()));
        assert_eq!(b.connect_count(), 2);
        assert_eq!(runs.load(Ordering::SeqCst), 2);
        assert!(h.status().await.connected);
    }

    #[tokio::test(start_paused = true)]
    async fn live_probe_retries_without_a_rebuild() {
        let (b, h) = setup();
        let (l, _) = acq(&h).await.unwrap();
        b.inject_job_failure(1, CmError::Timeout);
        let runs = Arc::new(AtomicUsize::new(0));
        assert_eq!(personas_op(&h, l, true, &runs).await, Ok(()));
        assert_eq!(b.connect_count(), 1);
        assert_eq!(runs.load(Ordering::SeqCst), 2);
    }

    #[tokio::test(start_paused = true)]
    async fn a_second_failure_is_final_and_steam_answers_are_not_retried() {
        let (b, h) = setup();
        let (l, _) = acq(&h).await.unwrap();
        // Op, probe (alive after the first), then the retried op fails again.
        b.script(|s| {
            s.fail_err = CmError::Timeout;
            s.fail_jobs = 1;
        });
        let runs = Arc::new(AtomicUsize::new(0));
        b.set_delay("personas", secs(30));
        assert_eq!(
            personas_op(&h, l, true, &runs).await,
            Err(OpFailure::Timeout)
        );
        assert_eq!(runs.load(Ordering::SeqCst), 2);
        b.set_delay("personas", Duration::ZERO);
        b.inject_job_failure(1, CmError::EResult(5));
        let runs = Arc::new(AtomicUsize::new(0));
        assert_eq!(
            personas_op(&h, l, true, &runs).await,
            Err(OpFailure::Cm(CmError::EResult(5)))
        );
        assert_eq!(runs.load(Ordering::SeqCst), 1);
    }

    #[tokio::test(start_paused = true)]
    async fn failed_rebuild_is_bounded_and_status_stays_responsive() {
        let (b, h) = setup();
        let (l, _) = acq(&h).await.unwrap();
        for _ in 0..4 {
            b.push_authed(Err(CmError::Discovery));
        }
        b.inject_job_failure(2, CmError::Timeout);
        let t0 = Instant::now();
        let h2 = h.clone();
        let op = tokio::spawn(async move {
            let runs = Arc::new(AtomicUsize::new(0));
            personas_op(&h2, l, true, &runs).await
        });
        tokio::time::sleep(secs(20)).await;
        let t1 = Instant::now();
        let st = h.status().await;
        assert!(!st.connected);
        assert!(t1.elapsed() < Duration::from_millis(10));
        assert_eq!(op.await.unwrap(), Err(OpFailure::Cm(CmError::Discovery)));
        let took = t0.elapsed();
        assert!(took >= secs(55) && took <= secs(95), "{took:?}");
        assert!(took < COMMAND_DEADLINE);
        assert_eq!(b.connect_count(), 5);
    }

    #[tokio::test(start_paused = true)]
    async fn the_command_deadline_bounds_attempt_probe_reconnect_and_retry() {
        let (b, h) = setup();
        let (l, _) = acq(&h).await.unwrap();
        b.set_delay("connect_authed", secs(100));
        b.inject_job_failure(2, CmError::Timeout);
        let t0 = Instant::now();
        let runs = Arc::new(AtomicUsize::new(0));
        assert_eq!(
            personas_op(&h, l, true, &runs).await,
            Err(OpFailure::Timeout)
        );
        assert_eq!(t0.elapsed(), COMMAND_DEADLINE);
        // The actor is still free.
        assert_eq!(h.status().await.lease_count, 1);
    }

    #[tokio::test(start_paused = true)]
    async fn a_redeem_style_op_is_never_resent_after_a_rebuild() {
        let (b, h) = setup();
        let (l, _) = acq(&h).await.unwrap();
        b.inject_job_failure(2, CmError::Closed);
        let runs = Arc::new(AtomicUsize::new(0));
        assert_eq!(
            personas_op(&h, l, false, &runs).await,
            Err(OpFailure::Ambiguous)
        );
        assert_eq!(runs.load(Ordering::SeqCst), 1);
        assert_eq!(b.connect_count(), 2);
        assert!(h.status().await.connected);
    }

    #[tokio::test(start_paused = true)]
    async fn a_non_idempotent_op_on_a_live_link_reports_its_own_failure() {
        let (b, h) = setup();
        let (l, _) = acq(&h).await.unwrap();
        b.inject_job_failure(1, CmError::Timeout);
        let runs = Arc::new(AtomicUsize::new(0));
        assert_eq!(
            personas_op(&h, l, false, &runs).await,
            Err(OpFailure::Timeout)
        );
        assert_eq!(runs.load(Ordering::SeqCst), 1);
        assert_eq!(b.connect_count(), 1);
    }

    #[tokio::test(start_paused = true)]
    async fn logged_off_34_is_terminal_with_no_reconnect() {
        let (b, h) = setup();
        let (l1, _) = acq(&h).await.unwrap();
        let (_l2, _) = acq(&h).await.unwrap();
        b.set_delay("personas", secs(100));
        let h2 = h.clone();
        let inflight = tokio::spawn(async move {
            h2.run_op(l1, true, secs(110), |c| {
                Box::pin(async move { c.personas(vec![]).await.map(|_| ()) })
            })
            .await
        });
        tokio::time::sleep(secs(1)).await;
        b.send_logged_off(34).await;
        assert_eq!(inflight.await.unwrap(), Err(OpFailure::Replaced));
        assert!(!h.status().await.connected);
        tokio::time::sleep(secs(600)).await;
        assert!(!h.status().await.connected);
        assert_eq!(b.connect_count(), 1);
        // A later op on the dead session is told why.
        b.set_delay("personas", Duration::ZERO);
        let runs = Arc::new(AtomicUsize::new(0));
        assert_eq!(
            personas_op(&h, l1, true, &runs).await,
            Err(OpFailure::Replaced)
        );
        assert_eq!(b.connect_count(), 1);
        // The next acquire logs on fresh.
        let (l3, _) = acq(&h).await.unwrap();
        assert_eq!(b.connect_count(), 2);
        assert!(h.status().await.connected);
        assert_eq!(personas_op(&h, l3, true, &runs).await, Ok(()));
    }

    #[tokio::test(start_paused = true)]
    async fn other_logged_off_codes_with_a_lease_count_as_dead() {
        let (b, h) = setup();
        let (_l, _) = acq(&h).await.unwrap();
        b.send_logged_off(5).await;
        tokio::time::sleep(secs(20)).await;
        assert_eq!(b.connect_count(), 2);
        assert!(h.status().await.connected);
    }

    #[tokio::test(start_paused = true)]
    async fn logged_off_without_leases_just_closes() {
        let (b, h) = setup();
        let (l, _) = acq(&h).await.unwrap();
        h.release(l);
        tokio::time::sleep(secs(1)).await;
        b.send_logged_off(5).await;
        tokio::time::sleep(secs(20)).await;
        assert_eq!(b.connect_count(), 1);
        assert!(!h.status().await.connected);
    }

    /// A session whose wall clock can be jumped forward (seconds) to simulate a system sleep.
    fn sleepy(b: Arc<FakeBackend>) -> (H, Arc<AtomicUsize>) {
        let jump = Arc::new(AtomicUsize::new(0));
        let (base, start) = (SystemTime::now(), Instant::now());
        let j = jump.clone();
        let wall = Arc::new(move || {
            base + start.elapsed() + Duration::from_secs(j.load(Ordering::SeqCst) as u64)
        });
        (
            SessionHandle::spawn_with_wall(b, Arc::new(NoWrap), wall),
            jump,
        )
    }

    #[tokio::test(start_paused = true)]
    async fn a_sleep_with_a_lease_probes_at_once_and_a_dead_probe_rebuilds() {
        let b = Arc::new(FakeBackend::new());
        let (h, jump) = sleepy(b.clone());
        let (_l, _) = acq(&h).await.unwrap();
        tokio::time::sleep(secs(12)).await;
        let jobs = b.job_count();
        jump.store(365, Ordering::SeqCst);
        b.inject_job_failure(1, CmError::Timeout);
        tokio::time::sleep(secs(6)).await;
        assert_eq!(b.job_count(), jobs + 1);
        // No caller op was needed for the rebuild.
        tokio::time::sleep(secs(30)).await;
        assert_eq!(b.connect_count(), 2);
        assert!(h.status().await.connected);
    }

    #[tokio::test(start_paused = true)]
    async fn a_sleep_with_a_live_link_probes_without_a_rebuild() {
        let b = Arc::new(FakeBackend::new());
        let (h, jump) = sleepy(b.clone());
        let (_l, _) = acq(&h).await.unwrap();
        tokio::time::sleep(secs(12)).await;
        let jobs = b.job_count();
        jump.store(365, Ordering::SeqCst);
        tokio::time::sleep(secs(30)).await;
        assert_eq!(b.job_count(), jobs + 1);
        assert_eq!(b.connect_count(), 1);
    }

    #[tokio::test(start_paused = true)]
    async fn a_sleep_with_no_lease_makes_no_cm_call_until_the_session_is_used() {
        let b = Arc::new(FakeBackend::new());
        let (h, jump) = sleepy(b.clone());
        let (l, _) = acq(&h).await.unwrap();
        h.release(l);
        tokio::time::sleep(secs(12)).await;
        let jobs = b.job_count();
        jump.store(365, Ordering::SeqCst);
        tokio::time::sleep(secs(10)).await;
        assert_eq!(b.job_count(), jobs);
        assert_eq!(b.connect_count(), 1);
        // The next use probes the suspect session first.
        let (_l, _) = h.acquire_open("t".into()).await.unwrap();
        tokio::time::sleep(secs(1)).await;
        assert_eq!(b.job_count(), jobs + 1);
        assert_eq!(b.connect_count(), 1);
    }

    #[tokio::test(start_paused = true)]
    async fn no_probe_runs_while_a_lease_is_idle_for_a_long_time() {
        let (b, h) = setup();
        let (_l, _) = acq(&h).await.unwrap();
        tokio::time::sleep(secs(3600)).await;
        assert_eq!(b.job_count(), 0);
        assert_eq!(b.connect_count(), 1);
    }

    #[tokio::test(start_paused = true)]
    async fn logout_during_a_rebuild_fences_it() {
        let (b, h) = setup();
        let (l, _) = acq(&h).await.unwrap();
        b.set_delay("connect_authed", secs(10));
        b.inject_job_failure(2, CmError::Timeout);
        let h2 = h.clone();
        let op = tokio::spawn(async move {
            let runs = Arc::new(AtomicUsize::new(0));
            personas_op(&h2, l, true, &runs).await
        });
        // The rebuild's connect (about 5 s in) is in flight when the user signs out.
        tokio::time::sleep(secs(8)).await;
        h.logout().await;
        assert_eq!(op.await.unwrap(), Err(OpFailure::LeaseUnknown));
        tokio::time::sleep(secs(30)).await;
        assert!(b.all_closed());
        assert!(!h.status().await.connected);
        assert_eq!(b.connect_count(), 2);
    }

    #[tokio::test(start_paused = true)]
    async fn logout_before_the_rebuild_attempt_starts_no_logon() {
        let (b, h) = setup();
        let (l, _) = acq(&h).await.unwrap();
        b.inject_job_failure(2, CmError::Timeout);
        let h2 = h.clone();
        let op = tokio::spawn(async move {
            let runs = Arc::new(AtomicUsize::new(0));
            personas_op(&h2, l, true, &runs).await
        });
        tokio::time::sleep(secs(1)).await;
        h.logout().await;
        assert_eq!(op.await.unwrap(), Err(OpFailure::LeaseUnknown));
        tokio::time::sleep(secs(60)).await;
        assert_eq!(b.connect_count(), 1);
    }

    #[tokio::test(start_paused = true)]
    async fn every_rebuild_passes_through_the_logon_wrap() {
        let (b, h, log) = recorded(false, Duration::ZERO);
        let (l, _) = acq(&h).await.unwrap();
        b.inject_job_failure(2, CmError::Timeout);
        let runs = Arc::new(AtomicUsize::new(0));
        assert_eq!(personas_op(&h, l, true, &runs).await, Ok(()));
        assert_eq!(b.connect_count(), 2);
        assert_eq!(
            *log.lock().unwrap(),
            vec!["before_logon", "after_logon", "before_logon", "after_logon"]
        );
    }

    #[tokio::test(start_paused = true)]
    async fn concurrent_failures_share_one_rebuild() {
        let (b, h) = setup();
        let (l, _) = acq(&h).await.unwrap();
        // Two ops fail, one probe fails.
        b.inject_job_failure(3, CmError::Timeout);
        let runs = Arc::new(AtomicUsize::new(0));
        let (a, c) = tokio::join!(
            personas_op(&h, l, true, &runs),
            personas_op(&h, l, true, &runs)
        );
        assert_eq!((a, c), (Ok(()), Ok(())));
        assert_eq!(b.connect_count(), 2);
    }
}
