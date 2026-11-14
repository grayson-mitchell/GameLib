//! Scripted in-memory `CmBackend` for tests (cfg(test) only). Answers from queues, with a default
//! per method, optional per-method delays (so paused-clock tests can drive timeouts), injected job
//! failures, and a kick channel per connection.

// Helpers are consumed by later plans' tests (79-05+); not every one is used yet.
#![allow(dead_code)]

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::sync::mpsc;

use crate::backend::*;
use crate::error::CmError;

pub(crate) struct Slot<T> {
    pub queue: VecDeque<Result<T, CmError>>,
    pub default: T,
}

impl<T: Default> Default for Slot<T> {
    fn default() -> Self {
        Self {
            queue: VecDeque::new(),
            default: T::default(),
        }
    }
}

impl<T: Clone> Slot<T> {
    fn next(&mut self) -> Result<T, CmError> {
        self.queue
            .pop_front()
            .unwrap_or_else(|| Ok(self.default.clone()))
    }
}

type AuthedScript = Result<(u64, Vec<LicenseEntry>), CmError>;

pub(crate) struct Script {
    pub authed: VecDeque<AuthedScript>,
    pub default_steam_id: u64,
    pub default_licenses: Vec<LicenseEntry>,
    pub anon: VecDeque<Result<(), CmError>>,
    pub tokens: Slot<AccessTokens>,
    pub pics: Slot<PicsRaw>,
    pub depot_key: Slot<DepotKeyRaw>,
    pub request_code: Slot<u64>,
    pub cdn: Slot<Vec<CdnServerRaw>>,
    pub owned: Slot<Vec<OwnedGameRaw>>,
    pub register: Slot<PurchaseRaw>,
    pub personas: Slot<Vec<PersonaRaw>>,
    pub delays: HashMap<&'static str, Duration>,
    pub fail_jobs: usize,
    pub fail_err: CmError,
    pub connects: usize,
    pub jobs: usize,
    pub kick: Vec<mpsc::Sender<i32>>,
    pub closed_flags: Vec<Arc<AtomicBool>>,
}

impl Default for Script {
    fn default() -> Self {
        Self {
            authed: VecDeque::new(),
            default_steam_id: 76561198000000001,
            default_licenses: Vec::new(),
            anon: VecDeque::new(),
            tokens: Slot::default(),
            pics: Slot::default(),
            depot_key: Slot::default(),
            request_code: Slot::default(),
            cdn: Slot::default(),
            owned: Slot::default(),
            register: Slot::default(),
            personas: Slot::default(),
            delays: HashMap::new(),
            fail_jobs: 0,
            fail_err: CmError::Timeout,
            connects: 0,
            jobs: 0,
            kick: Vec::new(),
            closed_flags: Vec::new(),
        }
    }
}

#[derive(Clone, Default)]
pub(crate) struct FakeBackend {
    script: Arc<Mutex<Script>>,
}

pub(crate) struct FakeConn {
    script: Arc<Mutex<Script>>,
    closed: Arc<AtomicBool>,
}

impl FakeBackend {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn script<R>(&self, f: impl FnOnce(&mut Script) -> R) -> R {
        f(&mut self.script.lock().unwrap())
    }

    pub fn push_authed(&self, r: AuthedScript) {
        self.script(|s| s.authed.push_back(r));
    }

    /// The next `n` jobs on any connection fail with `err`.
    pub fn inject_job_failure(&self, n: usize, err: CmError) {
        self.script(|s| {
            s.fail_jobs = n;
            s.fail_err = err;
        });
    }

    pub fn set_delay(&self, method: &'static str, d: Duration) {
        self.script(|s| {
            s.delays.insert(method, d);
        });
    }

    /// Deliver a LoggedOff eresult on every live connection's `logged_off` receiver.
    pub async fn send_logged_off(&self, eresult: i32) {
        let senders: Vec<_> = self.script(|s| s.kick.clone());
        for tx in senders {
            let _ = tx.send(eresult).await;
        }
    }

    /// Every connect attempt, authed or anonymous, successful or not.
    pub fn connect_count(&self) -> usize {
        self.script(|s| s.connects)
    }

    pub fn job_count(&self) -> usize {
        self.script(|s| s.jobs)
    }

    /// True when every connection handed out so far has been closed.
    pub fn all_closed(&self) -> bool {
        self.script(|s| s.closed_flags.iter().all(|f| f.load(Ordering::SeqCst)))
    }
}

impl FakeConn {
    fn new(script: &Arc<Mutex<Script>>) -> Self {
        let closed = Arc::new(AtomicBool::new(false));
        script.lock().unwrap().closed_flags.push(closed.clone());
        Self {
            script: script.clone(),
            closed,
        }
    }

    async fn run<T>(
        &self,
        method: &'static str,
        pick: impl FnOnce(&mut Script) -> Result<T, CmError>,
    ) -> Result<T, CmError> {
        let (result, delay) = {
            let mut s = self.script.lock().unwrap();
            s.jobs += 1;
            if self.closed.load(Ordering::SeqCst) {
                return Err(CmError::Closed);
            }
            let delay = s.delays.get(method).copied();
            if s.fail_jobs > 0 {
                s.fail_jobs -= 1;
                (Err(s.fail_err.clone()), delay)
            } else {
                (pick(&mut s), delay)
            }
        };
        if let Some(d) = delay {
            tokio::time::sleep(d).await;
        }
        result
    }
}

impl CmBackend for FakeBackend {
    type Conn = FakeConn;

    async fn connect_authed(
        &self,
        _token: &RefreshTokenSecret,
        _logon_id: u32,
    ) -> Result<Authed<FakeConn>, CmError> {
        let (scripted, delay) = {
            let mut s = self.script.lock().unwrap();
            s.connects += 1;
            let r = match s.authed.pop_front() {
                Some(r) => r,
                None => Ok((s.default_steam_id, s.default_licenses.clone())),
            };
            (r, s.delays.get("connect_authed").copied())
        };
        if let Some(d) = delay {
            tokio::time::sleep(d).await;
        }
        let (steam_id, licenses) = scripted?;
        let (tx, rx) = mpsc::channel(4);
        self.script.lock().unwrap().kick.push(tx);
        Ok(Authed {
            conn: FakeConn::new(&self.script),
            steam_id,
            licenses,
            logged_off: rx,
        })
    }

    async fn connect_anon(&self) -> Result<FakeConn, CmError> {
        {
            let mut s = self.script.lock().unwrap();
            s.connects += 1;
            if let Some(r) = s.anon.pop_front() {
                r?;
            }
        }
        Ok(FakeConn::new(&self.script))
    }
}

impl CmConn for FakeConn {
    async fn pics_access_tokens(
        &self,
        _apps: Vec<u32>,
        _packages: Vec<u32>,
    ) -> Result<AccessTokens, CmError> {
        self.run("pics_access_tokens", |s| s.tokens.next()).await
    }

    async fn pics_product_info(&self, _req: PicsRequest) -> Result<PicsRaw, CmError> {
        self.run("pics_product_info", |s| s.pics.next()).await
    }

    async fn depot_key(&self, _app_id: u32, _depot_id: u32) -> Result<DepotKeyRaw, CmError> {
        self.run("depot_key", |s| s.depot_key.next()).await
    }

    async fn manifest_request_code(
        &self,
        _app_id: u32,
        _depot_id: u32,
        _manifest_id: u64,
        _branch: String,
    ) -> Result<u64, CmError> {
        self.run("manifest_request_code", |s| s.request_code.next())
            .await
    }

    async fn cdn_servers(&self, _cell_id: u32, _max: u32) -> Result<Vec<CdnServerRaw>, CmError> {
        self.run("cdn_servers", |s| s.cdn.next()).await
    }

    async fn owned_games(
        &self,
        _steam_id: u64,
        _opts: OwnedOpts,
    ) -> Result<Vec<OwnedGameRaw>, CmError> {
        self.run("owned_games", |s| s.owned.next()).await
    }

    async fn register_key(&self, _key: String) -> Result<PurchaseRaw, CmError> {
        self.run("register_key", |s| s.register.next()).await
    }

    async fn personas(&self, _steam_ids: Vec<u64>) -> Result<Vec<PersonaRaw>, CmError> {
        self.run("personas", |s| s.personas.next()).await
    }

    async fn probe(&self) -> Result<(), CmError> {
        self.run("probe", |_| Ok(())).await
    }

    fn close(&self) {
        self.closed.store(true, Ordering::SeqCst);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tok() -> RefreshTokenSecret {
        RefreshTokenSecret::new("t".into())
    }

    #[tokio::test]
    async fn scripted_connects_in_order_and_counted() {
        let b = FakeBackend::new();
        b.push_authed(Err(CmError::EResult(15)));
        b.push_authed(Ok((7, vec![LicenseEntry::default()])));
        assert!(matches!(
            b.connect_authed(&tok(), 0).await,
            Err(CmError::EResult(15))
        ));
        let a = b.connect_authed(&tok(), 0).await.ok().unwrap();
        assert_eq!((a.steam_id, a.licenses.len()), (7, 1));
        let d = b.connect_authed(&tok(), 0).await.ok().unwrap();
        assert_eq!(d.steam_id, 76561198000000001);
        assert_eq!(b.connect_count(), 3);
    }

    #[tokio::test]
    async fn job_failure_injection_counts_down() {
        let b = FakeBackend::new();
        let a = b.connect_authed(&tok(), 0).await.ok().unwrap();
        b.inject_job_failure(2, CmError::Timeout);
        assert_eq!(a.conn.probe().await, Err(CmError::Timeout));
        assert_eq!(a.conn.probe().await, Err(CmError::Timeout));
        assert_eq!(a.conn.probe().await, Ok(()));
    }

    #[tokio::test]
    async fn queued_responses_then_default() {
        let b = FakeBackend::new();
        let a = b.connect_authed(&tok(), 0).await.ok().unwrap();
        b.script(|s| {
            s.request_code.queue.push_back(Ok(11));
            s.request_code.default = 99;
        });
        let c = &a.conn;
        assert_eq!(
            c.manifest_request_code(1, 2, 3, "public".into()).await,
            Ok(11)
        );
        assert_eq!(
            c.manifest_request_code(1, 2, 3, "public".into()).await,
            Ok(99)
        );
    }

    #[tokio::test]
    async fn logged_off_is_delivered() {
        let b = FakeBackend::new();
        let mut a = b.connect_authed(&tok(), 0).await.ok().unwrap();
        b.send_logged_off(34).await;
        assert_eq!(a.logged_off.recv().await, Some(34));
    }

    #[tokio::test]
    async fn close_makes_jobs_fail_closed() {
        let b = FakeBackend::new();
        let a = b.connect_authed(&tok(), 0).await.ok().unwrap();
        assert!(!b.all_closed());
        a.conn.close();
        assert!(b.all_closed());
        assert_eq!(a.conn.probe().await, Err(CmError::Closed));
    }

    #[tokio::test(start_paused = true)]
    async fn delay_drives_paused_clock() {
        let b = FakeBackend::new();
        let a = b.connect_authed(&tok(), 0).await.ok().unwrap();
        b.set_delay("probe", Duration::from_secs(30));
        let r = tokio::time::timeout(Duration::from_secs(5), a.conn.probe()).await;
        assert!(r.is_err());
        let r = tokio::time::timeout(Duration::from_secs(60), a.conn.probe()).await;
        assert_eq!(r.unwrap(), Ok(()));
    }
}
