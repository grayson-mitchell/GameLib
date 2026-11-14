//! The signed-in CM session as a single actor task (RESEARCH Pattern 2, D-01, D-03, D-07).
//!
//! Callers hold a cheap `SessionHandle` and talk to the actor over an mpsc channel with oneshot
//! replies. The control loop never awaits CM I/O: logons, canaries, op closures and the owed
//! go-online payment all run in spawned tasks that report back as messages (085 Run A stall).
//!
//! Guarantees ported from `user.ts`: lease counting with one shared logon, a 60 s idle close, a
//! generation fence so a logon that lands after sign-out or shutdown is closed at once, a 35 s
//! logon bound, and shutdown ordering (abandon pending logon, close, then pay the wrap's owed
//! go-online). Liveness probing, reconnect backoff and 34 handling come in plan 79-11.
//!
//! Secret hygiene: the token lives in the actor as a `RefreshTokenSecret` only; diag lines carry
//! reasons, causes and counts, never the token.

use std::collections::HashSet;
use std::future::Future;
use std::sync::Arc;
use std::time::Duration;

use futures_util::future::BoxFuture;
use serde::Serialize;
use tokio::sync::{mpsc, oneshot};
use tokio::time::Instant;

use crate::backend::{
    Authed, CmBackend, CmConn, LicenseEntry, PicsId, PicsRequest, RefreshTokenSecret,
};
use crate::error::{diag, eresult_of, is_credential_refusal, CmError};

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
        reply: oneshot::Sender<Result<Arc<C>, OpFailure>>,
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

enum Internal<C> {
    Connected {
        generation: u64,
        result: Result<Authed<C>, LogonErr>,
    },
    Canary {
        generation: u64,
        ok: bool,
    },
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
            _logged_off: None,
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
    pub async fn run_op<T>(
        &self,
        lease: LeaseId,
        _idempotent: bool,
        timeout: Duration,
        f: impl FnOnce(Arc<B::Conn>) -> BoxFuture<'static, Result<T, CmError>>,
    ) -> Result<T, OpFailure> {
        let conn = self
            .ask(|reply| Cmd::Conn { lease, reply })
            .await
            .unwrap_or(Err(OpFailure::ShuttingDown))?;
        match tokio::time::timeout(timeout, f(conn)).await {
            Err(_) => Err(OpFailure::Timeout),
            Ok(Ok(v)) => Ok(v),
            Ok(Err(CmError::Replaced)) => Err(OpFailure::Replaced),
            Ok(Err(e)) => Err(OpFailure::Cm(e)),
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
    /// Held so the connection's LoggedOff forwarder keeps a receiver (plan 79-11 consumes it).
    _logged_off: Option<mpsc::Receiver<i32>>,
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
        loop {
            let idle = self.idle_deadline;
            tokio::select! {
                cmd = rx.recv() => match cmd {
                    Some(c) => self.on_cmd(c),
                    None => break,
                },
                Some(msg) = irx.recv() => self.on_internal(msg),
                _ = async {
                    match idle {
                        Some(d) => tokio::time::sleep_until(d).await,
                        None => std::future::pending::<()>().await,
                    }
                } => self.on_idle(),
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
                let r = if self.shutting_down {
                    Err(OpFailure::ShuttingDown)
                } else if !self.leases.contains(&lease) {
                    Err(OpFailure::LeaseUnknown)
                } else {
                    self.conn.clone().ok_or(OpFailure::Cm(CmError::Closed))
                };
                let _ = reply.send(r);
            }
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
        if self.conn.is_some() {
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
        self._logged_off = None;
        self.licenses.clear();
        self.steam_id = 0;
    }

    fn on_idle(&mut self) {
        self.idle_deadline = None;
        if self.leases.is_empty() {
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
                // Plan 79-11 replaces this with probe + backoff: end the session, log on once.
                self.close_conn("canary-failed");
                let waiters: Vec<Waiter> =
                    self.canary_waiters.drain(..).map(Waiter::Ensure).collect();
                if self.connecting.is_none() {
                    self.start_connect("canary-failed", waiters);
                } else if let Some(c) = &mut self.connecting {
                    c.waiters.extend(waiters);
                }
            }
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
                self.conn = Some(Arc::new(a.conn));
                self._logged_off = Some(a.logged_off);
                self.steam_id = a.steam_id;
                self.licenses = a.licenses;
                self.logon_failure = None;
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
}
