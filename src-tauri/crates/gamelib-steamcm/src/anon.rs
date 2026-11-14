//! The anonymous CM session as its own actor (D-04, port of `anonymousClient.ts`).
//!
//! Public app data (platform capture, metacritic capture, PICS type lookups) needs no account, so
//! this session never sees a token and never shares state with the signed-in `SessionHandle`.
//!
//! Lifetime: concurrent reads share one connection and one connect; the connect is bounded at
//! 15 s; the connection closes 60 s after the last in-flight read finishes, never while one is
//! running (54-REVIEW WR-09). A failed or timed-out read closes the connection so the next read
//! reconnects; nothing here retries. The control loop never awaits CM I/O: the connect and every
//! read run in spawned or caller tasks.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use futures_util::future::BoxFuture;
use tokio::sync::{mpsc, oneshot};
use tokio::time::Instant;

use crate::backend::{CmBackend, CmConn};
use crate::error::{diag, CmError};
use crate::session::OpFailure;

/// `ANON_CONNECT_TIMEOUT_MS`.
pub const ANON_CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
/// `ANON_IDLE_CLOSE_MS`.
pub const ANON_IDLE_CLOSE: Duration = Duration::from_secs(60);

type Grant<C> = Result<(Arc<C>, u64), OpFailure>;

enum Cmd<C> {
    Acquire {
        reason: &'static str,
        reply: oneshot::Sender<Grant<C>>,
    },
    /// A read ended. `failed` closes the connection it ran on (if still current).
    Done {
        generation: u64,
        failed: bool,
    },
    Close(&'static str),
    Shutdown,
}

enum Internal<C> {
    Connected {
        generation: u64,
        result: Result<C, OpFailure>,
    },
}

/// Cheap to clone; every method is a message to the actor.
pub struct AnonHandle<B: CmBackend> {
    tx: mpsc::UnboundedSender<Cmd<B::Conn>>,
    connected: Arc<AtomicBool>,
}

impl<B: CmBackend> Clone for AnonHandle<B> {
    fn clone(&self) -> Self {
        Self {
            tx: self.tx.clone(),
            connected: self.connected.clone(),
        }
    }
}

/// Reports the read's end to the actor even when the caller's future is dropped mid-read.
struct DoneGuard<C> {
    tx: mpsc::UnboundedSender<Cmd<C>>,
    generation: u64,
    failed: bool,
}

impl<C> Drop for DoneGuard<C> {
    fn drop(&mut self) {
        let _ = self.tx.send(Cmd::Done {
            generation: self.generation,
            failed: self.failed,
        });
    }
}

impl<B: CmBackend> AnonHandle<B> {
    /// Spawn the actor onto the current runtime. It stops when every handle is dropped.
    pub fn spawn(backend: Arc<B>) -> Self {
        let (tx, rx) = mpsc::unbounded_channel();
        let (itx, irx) = mpsc::unbounded_channel();
        let connected = Arc::new(AtomicBool::new(false));
        let actor = Actor {
            backend,
            itx,
            connected: connected.clone(),
            conn: None,
            generation: 0,
            connecting: None,
            in_flight: 0,
            idle_deadline: None,
            shutting_down: false,
        };
        tokio::spawn(actor.run(rx, irx));
        Self { tx, connected }
    }

    /// Run `f` on the shared anonymous connection under `timeout`, connecting first if needed.
    /// The read runs in the caller's task, so a stalled read never blocks the actor.
    pub async fn run_read<T>(
        &self,
        reason: &'static str,
        timeout: Duration,
        f: impl FnOnce(Arc<B::Conn>) -> BoxFuture<'static, Result<T, CmError>>,
    ) -> Result<T, OpFailure> {
        let (rtx, rrx) = oneshot::channel();
        if self.tx.send(Cmd::Acquire { reason, reply: rtx }).is_err() {
            return Err(OpFailure::ShuttingDown);
        }
        let (conn, generation) = rrx.await.unwrap_or(Err(OpFailure::ShuttingDown))?;
        let mut guard = DoneGuard {
            tx: self.tx.clone(),
            generation,
            failed: false,
        };
        let out = match tokio::time::timeout(timeout, f(conn)).await {
            Err(_) => Err(OpFailure::Timeout),
            Ok(Ok(v)) => Ok(v),
            Ok(Err(CmError::Replaced)) => Err(OpFailure::Replaced),
            Ok(Err(e)) => Err(OpFailure::Cm(e)),
        };
        guard.failed = out.is_err();
        out
    }

    /// Drop the connection at once ("logout" and the like). A later read reconnects.
    pub fn close(&self, reason: &'static str) {
        let _ = self.tx.send(Cmd::Close(reason));
    }

    /// Drop the connection and refuse every later read (stdin EOF).
    pub fn shutdown(&self) {
        let _ = self.tx.send(Cmd::Shutdown);
    }

    pub fn is_connected(&self) -> bool {
        self.connected.load(Ordering::SeqCst)
    }
}

struct Connecting<C> {
    generation: u64,
    waiters: Vec<oneshot::Sender<Grant<C>>>,
}

struct Actor<B: CmBackend> {
    backend: Arc<B>,
    itx: mpsc::UnboundedSender<Internal<B::Conn>>,
    connected: Arc<AtomicBool>,
    conn: Option<Arc<B::Conn>>,
    /// Bumped on every close; results and read completions from an older generation are stale.
    generation: u64,
    connecting: Option<Connecting<B::Conn>>,
    in_flight: usize,
    idle_deadline: Option<Instant>,
    shutting_down: bool,
}

impl<B: CmBackend> Actor<B> {
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
        self.drop_conn("handles-dropped");
    }

    fn on_cmd(&mut self, cmd: Cmd<B::Conn>) {
        match cmd {
            Cmd::Acquire { reason, reply } => self.on_acquire(reason, reply),
            Cmd::Done { generation, failed } => {
                if generation != self.generation || self.conn.is_none() {
                    return;
                }
                self.in_flight = self.in_flight.saturating_sub(1);
                if failed {
                    self.drop_conn("error");
                } else if self.in_flight == 0 {
                    self.idle_deadline = Some(Instant::now() + ANON_IDLE_CLOSE);
                }
            }
            Cmd::Close(reason) => self.drop_conn(reason),
            Cmd::Shutdown => {
                self.shutting_down = true;
                self.drop_conn("shutdown");
            }
        }
    }

    fn on_acquire(&mut self, reason: &'static str, reply: oneshot::Sender<Grant<B::Conn>>) {
        if self.shutting_down {
            let _ = reply.send(Err(OpFailure::ShuttingDown));
            return;
        }
        if let Some(conn) = &self.conn {
            self.in_flight += 1;
            self.idle_deadline = None;
            let grant = Ok((conn.clone(), self.generation));
            if reply.send(grant).is_err() {
                self.in_flight -= 1;
                self.rearm_if_idle();
            }
            return;
        }
        if let Some(c) = &mut self.connecting {
            c.waiters.push(reply);
            return;
        }
        diag(&format!("CM logon mode=anonymous reason={reason}"));
        let generation = self.generation;
        self.connecting = Some(Connecting {
            generation,
            waiters: vec![reply],
        });
        let backend = self.backend.clone();
        let itx = self.itx.clone();
        tokio::spawn(async move {
            let result =
                match tokio::time::timeout(ANON_CONNECT_TIMEOUT, backend.connect_anon()).await {
                    Err(_) => Err(OpFailure::Timeout),
                    Ok(Ok(c)) => Ok(c),
                    Ok(Err(e)) => Err(OpFailure::Cm(e)),
                };
            let _ = itx.send(Internal::Connected { generation, result });
        });
    }

    fn on_internal(&mut self, msg: Internal<B::Conn>) {
        let Internal::Connected { generation, result } = msg;
        let Some(c) = self.connecting.take_if(|c| c.generation == generation) else {
            // Closed or shut down while connecting: the late connection is dropped at once.
            if let Ok(conn) = result {
                conn.close();
            }
            return;
        };
        match result {
            Err(failure) => {
                diag(&format!(
                    "CM session closed mode=anonymous cause={}",
                    if failure == OpFailure::Timeout {
                        "connect-timeout"
                    } else {
                        "connect-failed"
                    }
                ));
                for w in c.waiters {
                    let _ = w.send(Err(failure.clone()));
                }
            }
            Ok(conn) => {
                let conn = Arc::new(conn);
                self.conn = Some(conn.clone());
                self.connected.store(true, Ordering::SeqCst);
                self.in_flight = 0;
                for w in c.waiters {
                    self.in_flight += 1;
                    if w.send(Ok((conn.clone(), generation))).is_err() {
                        self.in_flight -= 1;
                    }
                }
                self.idle_deadline = None;
                self.rearm_if_idle();
            }
        }
    }

    fn rearm_if_idle(&mut self) {
        if self.conn.is_some() && self.in_flight == 0 {
            self.idle_deadline = Some(Instant::now() + ANON_IDLE_CLOSE);
        }
    }

    fn on_idle(&mut self) {
        self.idle_deadline = None;
        if self.in_flight == 0 {
            self.drop_conn("idle");
        }
    }

    fn drop_conn(&mut self, cause: &str) {
        self.generation += 1;
        self.idle_deadline = None;
        self.in_flight = 0;
        if let Some(c) = self.connecting.take() {
            let failure = if self.shutting_down {
                OpFailure::ShuttingDown
            } else {
                OpFailure::Replaced
            };
            for w in c.waiters {
                let _ = w.send(Err(failure.clone()));
            }
        }
        if let Some(conn) = self.conn.take() {
            conn.close();
            diag(&format!("CM session closed mode=anonymous cause={cause}"));
        }
        self.connected.store(false, Ordering::SeqCst);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fake::FakeBackend;

    fn probe(c: Arc<crate::fake::FakeConn>) -> BoxFuture<'static, Result<(), CmError>> {
        Box::pin(async move { c.probe().await })
    }

    fn setup() -> (Arc<FakeBackend>, AnonHandle<FakeBackend>) {
        let b = Arc::new(FakeBackend::new());
        let h = AnonHandle::spawn(b.clone());
        (b, h)
    }

    const T: Duration = Duration::from_secs(120);

    #[tokio::test(start_paused = true)]
    async fn concurrent_reads_share_one_connect() {
        let (b, h) = setup();
        b.set_delay("connect_anon", Duration::from_secs(1));
        let (a, c, d) = tokio::join!(
            h.run_read("t", T, probe),
            h.run_read("t", T, probe),
            h.run_read("t", T, probe)
        );
        assert_eq!((a, c, d), (Ok(()), Ok(()), Ok(())));
        assert_eq!(b.connect_count(), 1);
        assert!(h.is_connected());
    }

    #[tokio::test(start_paused = true)]
    async fn long_read_not_cut_off_and_close_fires_60s_after() {
        let (b, h) = setup();
        b.set_delay("probe", Duration::from_secs(90));
        assert_eq!(h.run_read("t", T, probe).await, Ok(()));
        assert!(h.is_connected());
        tokio::time::sleep(Duration::from_secs(59)).await;
        assert!(h.is_connected());
        tokio::time::sleep(Duration::from_secs(2)).await;
        assert!(!h.is_connected());
        assert!(b.all_closed());
    }

    #[tokio::test(start_paused = true)]
    async fn idle_timer_does_not_fire_while_read_runs() {
        let (b, h) = setup();
        assert_eq!(h.run_read("t", T, probe).await, Ok(()));
        // A second read starts 50 s in and runs 90 s: the first idle deadline passes mid-read.
        tokio::time::sleep(Duration::from_secs(50)).await;
        b.set_delay("probe", Duration::from_secs(90));
        assert_eq!(h.run_read("t", T, probe).await, Ok(()));
        assert_eq!(b.connect_count(), 1);
        assert!(!b.all_closed());
    }

    #[tokio::test(start_paused = true)]
    async fn connect_timeout_then_reconnect() {
        let (b, h) = setup();
        b.set_delay("connect_anon", Duration::from_secs(30));
        assert_eq!(h.run_read("t", T, probe).await, Err(OpFailure::Timeout));
        assert!(!h.is_connected());
        b.set_delay("connect_anon", Duration::from_secs(0));
        assert_eq!(h.run_read("t", T, probe).await, Ok(()));
        assert_eq!(b.connect_count(), 2);
    }

    #[tokio::test(start_paused = true)]
    async fn failed_read_closes_and_next_reconnects() {
        let (b, h) = setup();
        assert_eq!(h.run_read("t", T, probe).await, Ok(()));
        b.inject_job_failure(1, CmError::Closed);
        assert_eq!(
            h.run_read("t", T, probe).await,
            Err(OpFailure::Cm(CmError::Closed))
        );
        tokio::task::yield_now().await;
        assert!(!h.is_connected());
        assert_eq!(h.run_read("t", T, probe).await, Ok(()));
        assert_eq!(b.connect_count(), 2);
    }

    #[tokio::test(start_paused = true)]
    async fn timed_out_read_closes_connection() {
        let (b, h) = setup();
        b.set_delay("probe", Duration::from_secs(30));
        assert_eq!(
            h.run_read("t", Duration::from_secs(5), probe).await,
            Err(OpFailure::Timeout)
        );
        tokio::task::yield_now().await;
        assert!(!h.is_connected());
        assert!(b.all_closed());
    }

    #[tokio::test(start_paused = true)]
    async fn close_is_immediate_and_shutdown_refuses_reads() {
        let (b, h) = setup();
        assert_eq!(h.run_read("t", T, probe).await, Ok(()));
        h.close("logout");
        tokio::task::yield_now().await;
        assert!(!h.is_connected());
        assert!(b.all_closed());
        assert_eq!(h.run_read("t", T, probe).await, Ok(()));
        h.shutdown();
        assert_eq!(
            h.run_read("t", T, probe).await,
            Err(OpFailure::ShuttingDown)
        );
        assert!(b.all_closed());
    }
}
