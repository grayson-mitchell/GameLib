//! The Humble secret owner (Phase 94, D-18): the session cookie and the CSRF token behind a seam the
//! shell implements over the Keychain (or the dev vault), and the one-time move of a legacy plaintext
//! secret into it. A copy of the TypeScript `SidecarHumbleSecretStore` over `SidecarKeyringSlotStore`
//! (`sidecar/humbleSecretStore.ts`, `sidecar/keyringTokenStore.ts`), replayed against the 94-09 goldens.
//!
//! This crate has no `keyring` dependency: [`HumbleSecretSource`] is where the Keychain meets it, so the
//! signed binary's ACL sees the same items under the same service and accounts (FND-07). Errors a source
//! answers are fixed categories (`timeout`, `unavailable`), never an OS message, and no log line, error
//! or `Debug` output carries a secret value (T-94-38).
//!
//! What [`HumbleSecrets`] does per slot, as the TS slot store does:
//!
//! - a process-lifetime success cache (a confirmed empty slot is cached as empty);
//! - in-flight dedupe: concurrent readers of one slot share one source call, unless
//!   [`HumbleSecrets::invalidate`] ran after that call began (a sign-out during a read must not hand the
//!   next caller the pre-sign-out value);
//! - a negative memo: a failed read is remembered for [`FAILURE_MEMO_MS`] on `ctx.clock` and answered as
//!   unreadable with the original reason, without asking the Keychain again;
//! - an epoch: [`HumbleSecrets::invalidate`] bumps it, and a read already in flight when it moved never
//!   writes its answer (or a memo) over the cleared state;
//! - totality: no method errors to its caller; a failure is a fixed-text warning.
//!
//! A write or delete invalidates BEFORE the source call (a disconnect cannot resurrect a cached session),
//! and a failed one leaves the slot invalidated rather than guessing.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use tokio::sync::watch;

use crate::ctx::{HumbleCtx, HumbleLog};
use crate::stores::{set_config_flag, ConfigFlag};

/// How long a failed read is remembered (`KEYRING_FAILURE_MEMO_MS` in `keyringTokenStore.ts`, more than
/// twice the shell's 45 s read bound).
pub const FAILURE_MEMO_MS: u64 = 120_000;

/// One of the two Humble secrets. The Keychain account names belong to the shell; the config keys are
/// where a legacy plaintext copy sat (`HumbleSecretKey` in `humble/secretStore.ts`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum HumbleSlot {
    /// `sessionCookie`.
    Session,
    /// `csrfToken`.
    Csrf,
}

impl HumbleSlot {
    pub const ALL: [HumbleSlot; 2] = [HumbleSlot::Session, HumbleSlot::Csrf];

    /// The word a log line names the slot by.
    pub fn word(self) -> &'static str {
        match self {
            HumbleSlot::Session => "session",
            HumbleSlot::Csrf => "csrf",
        }
    }

    /// The config-store key a legacy plaintext copy was stored under.
    pub fn config_key(self) -> &'static str {
        match self {
            HumbleSlot::Session => "sessionCookie",
            HumbleSlot::Csrf => "csrfToken",
        }
    }

    fn index(self) -> usize {
        match self {
            HumbleSlot::Session => 0,
            HumbleSlot::Csrf => 1,
        }
    }
}

/// Where the secrets live. Every method is a blocking call (a Keychain read can wait for a person to
/// answer a prompt); the owner runs them on the blocking pool. An `Err` is a fixed category, never a
/// value or an OS message.
pub trait HumbleSecretSource: Send + Sync + 'static {
    /// The stored secret, or `None` when the slot is empty.
    fn get(&self, slot: HumbleSlot) -> Result<Option<String>, String>;
    fn set(&self, slot: HumbleSlot, value: &str) -> Result<(), String>;
    /// Deleting an empty slot is success.
    fn delete(&self, slot: HumbleSlot) -> Result<(), String>;
    /// Whether the secure storage is reachable (a non-prompting probe). Not whether a secret is stored.
    fn available(&self) -> Result<bool, String>;
}

/// The source a context has until the shell's is wired in: nothing is readable or writable.
#[derive(Debug, Default, Clone, Copy)]
pub struct UnavailableSecretSource;

impl HumbleSecretSource for UnavailableSecretSource {
    fn get(&self, _slot: HumbleSlot) -> Result<Option<String>, String> {
        Err("unavailable".to_string())
    }
    fn set(&self, _slot: HumbleSlot, _value: &str) -> Result<(), String> {
        Err("unavailable".to_string())
    }
    fn delete(&self, _slot: HumbleSlot) -> Result<(), String> {
        Err("unavailable".to_string())
    }
    fn available(&self) -> Result<bool, String> {
        Ok(false)
    }
}

/// Why a read produced nothing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Unreadable {
    Timeout,
    Unavailable,
}

impl Unreadable {
    pub fn word(self) -> &'static str {
        match self {
            Unreadable::Timeout => "timeout",
            Unreadable::Unavailable => "unavailable",
        }
    }

    /// `classifyKeyringFailure`: a message with `timeout` or `timed out` (any case) is a timeout, every
    /// other failure is unavailable. The shell's own category `timeout` is one.
    pub fn classify(error: &str) -> Unreadable {
        let lower = error.to_ascii_lowercase();
        if lower.contains("timeout") || lower.contains("timed out") {
            Unreadable::Timeout
        } else {
            Unreadable::Unavailable
        }
    }
}

/// The three-state read the boot sign-in probe uses: unlike [`HumbleSecrets::get`], an empty slot
/// (`Absent`) is told apart from a read that failed.
#[derive(Clone, PartialEq, Eq)]
pub enum SecretRead {
    Present(String),
    Absent,
    /// The read failed (or answered from the negative memo); the reason is the original failure's.
    Unavailable(Unreadable),
}

impl std::fmt::Debug for SecretRead {
    /// Never the value.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SecretRead::Present(_) => f.write_str("Present(..)"),
            SecretRead::Absent => f.write_str("Absent"),
            SecretRead::Unavailable(reason) => write!(f, "Unavailable({})", reason.word()),
        }
    }
}

impl SecretRead {
    fn from_value(value: &str) -> SecretRead {
        if value.is_empty() {
            SecretRead::Absent
        } else {
            SecretRead::Present(value.to_string())
        }
    }
}

/// What a slot's cache holds, for a test that checks "invalidated before the call".
#[cfg(any(test, feature = "testing"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CacheState {
    /// Nothing cached and no memo.
    Cold,
    /// A confirmed value (or a confirmed empty slot) is cached.
    Cached,
    /// A failed read is memoised.
    Memoized,
}

struct Pending {
    id: u64,
    epoch: u64,
    rx: watch::Receiver<Option<SecretRead>>,
}

struct AvailPending {
    id: u64,
    rx: watch::Receiver<Option<bool>>,
}

#[derive(Default)]
struct SlotState {
    epoch: u64,
    /// `Some("")` is a confirmed empty slot; `None` is not cached.
    cached: Option<String>,
    /// The time and reason of the last failed read.
    failed: Option<(u64, Unreadable)>,
    pending: Option<Pending>,
    /// The last successful availability probe. Kept on the session slot, as the TS store answers
    /// `isAvailable` from its session slot store.
    available: Option<bool>,
    available_pending: Option<AvailPending>,
}

struct Shared {
    slots: [Mutex<SlotState>; 2],
    next_id: AtomicU64,
}

fn locked<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn warn_to(log: &Option<Arc<dyn HumbleLog>>, line: &str) {
    if let Some(log) = log {
        log.warn(line);
    }
}

/// The Humble secret owner over one [`HumbleSecretSource`].
pub struct HumbleSecrets {
    source: Arc<dyn HumbleSecretSource>,
    shared: Arc<Shared>,
}

enum Begin<T> {
    Done(T),
    Wait(watch::Receiver<Option<T>>),
}

/// The value a joiner waits for. A sender dropped without sending (the runtime went away) is `None`.
async fn wait_for<T: Clone>(mut rx: watch::Receiver<Option<T>>) -> Option<T> {
    match rx.wait_for(|v| v.is_some()).await {
        Ok(value) => value.clone(),
        Err(_) => None,
    }
}

impl HumbleSecrets {
    pub fn new(source: Arc<dyn HumbleSecretSource>) -> HumbleSecrets {
        HumbleSecrets {
            source,
            shared: Arc::new(Shared {
                slots: [
                    Mutex::new(SlotState::default()),
                    Mutex::new(SlotState::default()),
                ],
                next_id: AtomicU64::new(1),
            }),
        }
    }

    fn slot_state(&self, slot: HumbleSlot) -> MutexGuard<'_, SlotState> {
        locked(&self.shared.slots[slot.index()])
    }

    fn next_id(&self) -> u64 {
        self.shared.next_id.fetch_add(1, Ordering::Relaxed)
    }

    /// Drops one slot's cache, its failure memo and (for the session slot) the availability answer, and
    /// moves the epoch so a read already in flight cannot write over what this cleared. An in-flight
    /// call is not cancelled.
    pub fn invalidate(&self, slot: HumbleSlot) {
        let mut st = self.slot_state(slot);
        st.cached = None;
        st.failed = None;
        st.available = None;
        st.epoch += 1;
    }

    /// What `slot` holds in cache: for a test of invalidate-before-call.
    #[cfg(any(test, feature = "testing"))]
    pub fn cache_state(&self, slot: HumbleSlot) -> CacheState {
        let st = self.slot_state(slot);
        if st.cached.is_some() {
            CacheState::Cached
        } else if st.failed.is_some() {
            CacheState::Memoized
        } else {
            CacheState::Cold
        }
    }

    /// One source call on the blocking pool, holding a `humble-keychain` shutdown registrant for exactly
    /// as long as the call really runs (the registrant moves into the closure, so an exit waits for an
    /// abandoned call within the one exit budget). `None` once shutdown has begun or when the call
    /// panicked.
    async fn blocking<R, F>(&self, ctx: &HumbleCtx, call: F) -> Option<R>
    where
        R: Send + 'static,
        F: FnOnce(Arc<dyn HumbleSecretSource>) -> R + Send + 'static,
    {
        if ctx.shutdown.token().is_cancelled() {
            return None;
        }
        let registrant = ctx.shutdown.register("humble-keychain");
        let source = Arc::clone(&self.source);
        tokio::task::spawn_blocking(move || {
            let _registrant = registrant;
            call(source)
        })
        .await
        .ok()
    }

    /// The three-state read. `trigger` is a fixed label naming why the read happened (never a value).
    pub async fn read_secret(
        &self,
        ctx: &HumbleCtx,
        slot: HumbleSlot,
        trigger: &'static str,
    ) -> SecretRead {
        match self.begin_read(ctx, slot, trigger) {
            Begin::Done(read) => read,
            Begin::Wait(rx) => wait_for(rx)
                .await
                .unwrap_or(SecretRead::Unavailable(Unreadable::Unavailable)),
        }
    }

    /// `getSecret`: the stored secret, or `""` when none is stored or the read failed. Total.
    pub async fn get(&self, ctx: &HumbleCtx, slot: HumbleSlot) -> String {
        match self.read_secret(ctx, slot, "unspecified").await {
            SecretRead::Present(value) => value,
            _ => String::new(),
        }
    }

    fn begin_read(
        &self,
        ctx: &HumbleCtx,
        slot: HumbleSlot,
        trigger: &'static str,
    ) -> Begin<SecretRead> {
        let mut st = self.slot_state(slot);
        if let Some(value) = &st.cached {
            return Begin::Done(SecretRead::from_value(value));
        }
        if let Some(pending) = &st.pending {
            // A read begun before the last `invalidate` is not joined.
            if pending.epoch == st.epoch {
                return Begin::Wait(pending.rx.clone());
            }
        }
        if let Some((at, reason)) = st.failed {
            if ctx.clock.now_ms().saturating_sub(at) < FAILURE_MEMO_MS {
                return Begin::Done(SecretRead::Unavailable(reason));
            }
        }
        if ctx.shutdown.token().is_cancelled() {
            return Begin::Done(SecretRead::Unavailable(Unreadable::Unavailable));
        }

        let id = self.next_id();
        let epoch = st.epoch;
        let (tx, rx) = watch::channel(None);
        st.pending = Some(Pending {
            id,
            epoch,
            rx: rx.clone(),
        });
        drop(st);

        let registrant = ctx.shutdown.register("humble-keychain");
        let source = Arc::clone(&self.source);
        let shared = Arc::clone(&self.shared);
        let clock = Arc::clone(&ctx.clock);
        let log = ctx.log.clone();
        // Detached on purpose: the read finishes and clears its own `pending` even when the caller that
        // began it is cancelled, so a joiner is never left waiting on a read nobody drives.
        tokio::spawn(async move {
            let joined = tokio::task::spawn_blocking(move || {
                let _registrant = registrant;
                source.get(slot)
            })
            .await;
            let result = joined.unwrap_or_else(|_| Err("unavailable".to_string()));
            let now = clock.now_ms();
            let outcome = {
                let mut st = locked(&shared.slots[slot.index()]);
                if st.pending.as_ref().is_some_and(|p| p.id == id) {
                    st.pending = None;
                }
                match result {
                    Ok(value) => {
                        let value = value.unwrap_or_default();
                        // A read superseded by an invalidate answers its caller and writes nothing.
                        if st.epoch == epoch {
                            st.cached = Some(value.clone());
                            st.failed = None;
                        }
                        SecretRead::from_value(&value)
                    }
                    Err(error) => {
                        let reason = Unreadable::classify(&error);
                        if st.epoch == epoch {
                            st.failed = Some((now, reason));
                        }
                        SecretRead::Unavailable(reason)
                    }
                }
            };
            if let SecretRead::Unavailable(reason) = &outcome {
                warn_to(
                    &log,
                    &format!(
                        "secret read failed: slot={} reason={} trigger={trigger}",
                        slot.word(),
                        reason.word()
                    ),
                );
                warn_to(
                    &log,
                    &format!(
                        "secret read failure memoized: slot={} reason={} ms={FAILURE_MEMO_MS} trigger={trigger}",
                        slot.word(),
                        reason.word()
                    ),
                );
            }
            let _ = tx.send(Some(outcome));
        });
        Begin::Wait(rx)
    }

    /// `setSecret`: invalidates, writes, and on success caches the new value. A failure is one warning
    /// and leaves the slot invalidated (a write that did not land is never cached). Total.
    pub async fn set(&self, ctx: &HumbleCtx, slot: HumbleSlot, value: &str) {
        self.invalidate(slot);
        let owned = value.to_string();
        let done = self
            .blocking(ctx, move |source| source.set(slot, &owned))
            .await;
        match done {
            Some(Ok(())) => {
                self.slot_state(slot).cached = Some(value.to_string());
            }
            _ => ctx.warn(&format!("secret write failed: slot={}", slot.word())),
        }
    }

    /// Deletes one slot: invalidates first, then deletes, and on success caches the slot as empty. A
    /// failure is one warning and leaves it invalidated. Total.
    pub async fn delete(&self, ctx: &HumbleCtx, slot: HumbleSlot) {
        self.invalidate(slot);
        match self.blocking(ctx, move |source| source.delete(slot)).await {
            Some(Ok(())) => {
                self.slot_state(slot).cached = Some(String::new());
            }
            _ => ctx.warn(&format!("secret delete failed: slot={}", slot.word())),
        }
    }

    /// `clearSecrets`: both slots, each independent of the other's outcome. Total.
    pub async fn clear(&self, ctx: &HumbleCtx) {
        for slot in HumbleSlot::ALL {
            self.delete(ctx, slot).await;
        }
    }

    /// Whether the secure storage is reachable, from cache when it has been asked. Only a successful
    /// probe is cached (a probe that answered `false` included); a failed one is `false`, one warning,
    /// and asked again next time. Concurrent callers share one probe. Total.
    pub async fn available(&self, ctx: &HumbleCtx, trigger: &'static str) -> bool {
        let session = HumbleSlot::Session;
        enum Start {
            Done(bool),
            Wait(watch::Receiver<Option<bool>>),
            Probe(
                u64,
                u64,
                watch::Sender<Option<bool>>,
                watch::Receiver<Option<bool>>,
            ),
        }
        let start = {
            let mut st = self.slot_state(session);
            if let Some(value) = st.available {
                Start::Done(value)
            } else if let Some(pending) = &st.available_pending {
                Start::Wait(pending.rx.clone())
            } else if ctx.shutdown.token().is_cancelled() {
                Start::Done(false)
            } else {
                let id = self.next_id();
                let (tx, rx) = watch::channel(None);
                st.available_pending = Some(AvailPending { id, rx: rx.clone() });
                Start::Probe(id, st.epoch, tx, rx)
            }
        };
        match start {
            Start::Done(value) => value,
            Start::Wait(rx) => wait_for(rx).await.unwrap_or(false),
            Start::Probe(id, epoch, tx, rx) => self.probe(ctx, trigger, id, epoch, tx, rx).await,
        }
    }

    async fn probe(
        &self,
        ctx: &HumbleCtx,
        trigger: &'static str,
        id: u64,
        epoch: u64,
        tx: watch::Sender<Option<bool>>,
        rx: watch::Receiver<Option<bool>>,
    ) -> bool {
        let session = HumbleSlot::Session;
        let registrant = ctx.shutdown.register("humble-keychain");
        let source = Arc::clone(&self.source);
        let shared = Arc::clone(&self.shared);
        let log = ctx.log.clone();
        tokio::spawn(async move {
            let joined = tokio::task::spawn_blocking(move || {
                let _registrant = registrant;
                source.available()
            })
            .await;
            let result = joined.unwrap_or_else(|_| Err("unavailable".to_string()));
            let value = {
                let mut st = locked(&shared.slots[session.index()]);
                if st.available_pending.as_ref().is_some_and(|p| p.id == id) {
                    st.available_pending = None;
                }
                match &result {
                    Ok(value) => {
                        if st.epoch == epoch {
                            st.available = Some(*value);
                        }
                        *value
                    }
                    Err(_) => false,
                }
            };
            if result.is_err() {
                warn_to(
                    &log,
                    &format!("secret availability probe failed: trigger={trigger}"),
                );
            }
            let _ = tx.send(Some(value));
        });
        wait_for(rx).await.unwrap_or(false)
    }

    /// What `HumbleUser.storeHumbleSecret` does: persists the secret, then records the user-visible
    /// `encryptionDegraded` flag off the availability probe. A config store that cannot be written is
    /// one warning. Total.
    pub async fn store(&self, ctx: &HumbleCtx, slot: HumbleSlot, value: &str) {
        self.set(ctx, slot, value).await;
        let available = self.available(ctx, "store-humble-secret").await;
        if set_config_flag(ctx, ConfigFlag::EncryptionDegraded, !available).is_err() {
            ctx.warn("secret store: the encryption flag could not be written");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stores::HumbleStore;
    use gamelib_core::clock::Clock;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_store::host::StoreHost;
    use gamelib_store::json::Json;
    use std::collections::HashMap;
    use std::sync::atomic::AtomicUsize;
    use std::time::Duration;

    use crate::http::NoHttp;

    struct TestClock(AtomicU64);

    impl Clock for TestClock {
        fn now_ms(&self) -> u64 {
            self.0.load(Ordering::SeqCst)
        }
    }

    #[derive(Default)]
    struct Lines(Mutex<Vec<String>>);

    impl HumbleLog for Lines {
        fn info(&self, line: &str) {
            locked(&self.0).push(format!("info {line}"));
        }
        fn warn(&self, line: &str) {
            locked(&self.0).push(format!("warn {line}"));
        }
        fn error(&self, line: &str) {
            locked(&self.0).push(format!("error {line}"));
        }
    }

    /// A source over a map, counting calls, with a switch that makes every call fail.
    #[derive(Default)]
    struct MapSource {
        slots: Mutex<HashMap<&'static str, String>>,
        gets: AtomicUsize,
        sets: AtomicUsize,
        fail: Mutex<Option<&'static str>>,
        probe: Mutex<Option<bool>>,
    }

    impl MapSource {
        fn failing(&self, category: Option<&'static str>) {
            *locked(&self.fail) = category;
        }
        fn seed(&self, slot: HumbleSlot, value: &str) {
            locked(&self.slots).insert(slot.word(), value.to_string());
        }
        fn peek(&self, slot: HumbleSlot) -> Option<String> {
            locked(&self.slots).get(slot.word()).cloned()
        }
        fn check(&self) -> Result<(), String> {
            match *locked(&self.fail) {
                Some(category) => Err(category.to_string()),
                None => Ok(()),
            }
        }
    }

    impl HumbleSecretSource for MapSource {
        fn get(&self, slot: HumbleSlot) -> Result<Option<String>, String> {
            self.gets.fetch_add(1, Ordering::SeqCst);
            self.check()?;
            Ok(self.peek(slot))
        }
        fn set(&self, slot: HumbleSlot, value: &str) -> Result<(), String> {
            self.sets.fetch_add(1, Ordering::SeqCst);
            self.check()?;
            self.seed(slot, value);
            Ok(())
        }
        fn delete(&self, slot: HumbleSlot) -> Result<(), String> {
            self.check()?;
            locked(&self.slots).remove(slot.word());
            Ok(())
        }
        fn available(&self) -> Result<bool, String> {
            self.check()?;
            Ok(locked(&self.probe).unwrap_or(true))
        }
    }

    struct Rig {
        ctx: HumbleCtx,
        source: Arc<MapSource>,
        clock: Arc<TestClock>,
        lines: Arc<Lines>,
        _home: gamelib_testutil::FakeHome,
    }

    fn rig() -> Rig {
        let home = gamelib_testutil::FakeHome::new("humble-secrets-");
        let source = Arc::new(MapSource::default());
        let clock = Arc::new(TestClock(AtomicU64::new(1_000_000)));
        let lines = Arc::new(Lines::default());
        let ctx = HumbleCtx::new(
            Arc::new(StoreHost::new()),
            home.root().to_path_buf(),
            clock.clone(),
            crate::ctx::Platform::Linux,
            Shutdown::new(),
            Arc::new(NoHttp),
        )
        .with_log(lines.clone())
        .with_secrets(source.clone());
        Rig {
            ctx,
            source,
            clock,
            lines,
            _home: home,
        }
    }

    fn advance(rig: &Rig, ms: u64) {
        rig.clock.0.fetch_add(ms, Ordering::SeqCst);
    }

    #[test]
    fn the_failure_classifier_is_the_ts_one() {
        assert_eq!(Unreadable::classify("timeout"), Unreadable::Timeout);
        assert_eq!(
            Unreadable::classify("keyring read timed out after 45 s"),
            Unreadable::Timeout
        );
        assert_eq!(Unreadable::classify("Keyring TIMEOUT"), Unreadable::Timeout);
        assert_eq!(Unreadable::classify("unavailable"), Unreadable::Unavailable);
        assert_eq!(
            Unreadable::classify("access to the keychain was denied"),
            Unreadable::Unavailable
        );
    }

    #[test]
    fn a_secret_read_never_prints_its_value() {
        let text = format!(
            "{:?}",
            SecretRead::Present("fake-secret-value-0001".to_string())
        );
        assert!(!text.contains("fake-secret"));
        assert_eq!(format!("{:?}", SecretRead::Absent), "Absent");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_present_secret_is_cached_and_an_absent_one_is_cached_empty() {
        let rig = rig();
        rig.source
            .seed(HumbleSlot::Session, "fake-secret-value-0001");
        let first = rig.ctx.secrets.get(&rig.ctx, HumbleSlot::Session).await;
        let second = rig.ctx.secrets.get(&rig.ctx, HumbleSlot::Session).await;
        assert_eq!(
            (first.as_str(), second.as_str()),
            ("fake-secret-value-0001", "fake-secret-value-0001")
        );
        assert_eq!(rig.source.gets.load(Ordering::SeqCst), 1);

        let csrf = rig
            .ctx
            .secrets
            .read_secret(&rig.ctx, HumbleSlot::Csrf, "test")
            .await;
        assert_eq!(csrf, SecretRead::Absent);
        let _ = rig.ctx.secrets.get(&rig.ctx, HumbleSlot::Csrf).await;
        assert_eq!(
            rig.source.gets.load(Ordering::SeqCst),
            2,
            "an empty slot is cached"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_failed_read_is_memoised_for_120_s_and_asks_again_at_the_edge() {
        let rig = rig();
        rig.source
            .seed(HumbleSlot::Session, "fake-secret-value-0001");
        rig.source.failing(Some("timeout"));
        async fn read(rig: &Rig) -> SecretRead {
            rig.ctx
                .secrets
                .read_secret(&rig.ctx, HumbleSlot::Session, "t")
                .await
        }
        assert_eq!(
            read(&rig).await,
            SecretRead::Unavailable(Unreadable::Timeout)
        );
        rig.source.failing(None);
        advance(&rig, FAILURE_MEMO_MS - 1);
        assert_eq!(
            read(&rig).await,
            SecretRead::Unavailable(Unreadable::Timeout),
            "still memoised one ms before the end"
        );
        assert_eq!(rig.source.gets.load(Ordering::SeqCst), 1);
        advance(&rig, 1);
        assert_eq!(
            read(&rig).await,
            SecretRead::Present("fake-secret-value-0001".to_string())
        );
        // One failure is two warnings (the failure and the memo line), never the value.
        let lines = locked(&rig.lines.0);
        assert_eq!(lines.iter().filter(|l| l.starts_with("warn")).count(), 2);
        assert!(lines.iter().all(|l| !l.contains("fake-secret")));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_write_invalidates_first_and_a_failed_write_leaves_the_slot_cold() {
        let rig = rig();
        rig.source
            .seed(HumbleSlot::Session, "fake-secret-value-0002");
        assert_eq!(
            rig.ctx.secrets.get(&rig.ctx, HumbleSlot::Session).await,
            "fake-secret-value-0002"
        );
        rig.source.failing(Some("unavailable"));
        rig.ctx
            .secrets
            .set(&rig.ctx, HumbleSlot::Session, "fake-secret-value-0001")
            .await;
        assert_eq!(
            rig.ctx.secrets.cache_state(HumbleSlot::Session),
            CacheState::Cold
        );
        rig.source.failing(None);
        // The next read goes to the source and answers what it really holds.
        assert_eq!(
            rig.ctx.secrets.get(&rig.ctx, HumbleSlot::Session).await,
            "fake-secret-value-0002"
        );
        assert!(locked(&rig.lines.0)
            .iter()
            .all(|l| !l.contains("fake-secret")));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_clear_deletes_both_slots_and_caches_them_empty() {
        let rig = rig();
        rig.source
            .seed(HumbleSlot::Session, "fake-secret-value-0001");
        rig.source.seed(HumbleSlot::Csrf, "fake-secret-value-0003");
        rig.ctx.secrets.clear(&rig.ctx).await;
        assert_eq!(rig.source.peek(HumbleSlot::Session), None);
        assert_eq!(rig.source.peek(HumbleSlot::Csrf), None);
        let gets = rig.source.gets.load(Ordering::SeqCst);
        assert_eq!(rig.ctx.secrets.get(&rig.ctx, HumbleSlot::Session).await, "");
        assert_eq!(
            rig.source.gets.load(Ordering::SeqCst),
            gets,
            "served from cache"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn the_availability_probe_caches_a_success_and_not_a_failure() {
        let rig = rig();
        rig.source.failing(Some("unavailable"));
        assert!(!rig.ctx.secrets.available(&rig.ctx, "t").await);
        rig.source.failing(None);
        assert!(
            rig.ctx.secrets.available(&rig.ctx, "t").await,
            "a failure was not cached"
        );
        *locked(&rig.source.probe) = Some(false);
        assert!(
            rig.ctx.secrets.available(&rig.ctx, "t").await,
            "the answer is cached"
        );
        rig.ctx.secrets.invalidate(HumbleSlot::Session);
        assert!(
            !rig.ctx.secrets.available(&rig.ctx, "t").await,
            "asked again after invalidate"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn store_writes_the_secret_and_then_the_encryption_flag_off_the_probe() {
        let rig = rig();
        // The config the flag is written into (and the key a legacy copy would sit in).
        let config = HumbleStore::Config.open(&rig.ctx).expect("config store");
        config.set("isLoggedIn", Json::Bool(true)).unwrap();
        rig.ctx
            .secrets
            .store(&rig.ctx, HumbleSlot::Session, "fake-secret-value-0001")
            .await;
        assert_eq!(
            rig.source.peek(HumbleSlot::Session).as_deref(),
            Some("fake-secret-value-0001")
        );
        assert_eq!(config.get("encryptionDegraded"), Some(Json::Bool(false)));

        *locked(&rig.source.probe) = Some(false);
        rig.ctx.secrets.invalidate(HumbleSlot::Session);
        rig.ctx
            .secrets
            .store(&rig.ctx, HumbleSlot::Csrf, "fake-secret-value-0003")
            .await;
        assert_eq!(config.get("encryptionDegraded"), Some(Json::Bool(true)));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn once_shutdown_has_begun_no_new_source_call_is_started() {
        let rig = rig();
        rig.ctx.shutdown.drain(Duration::ZERO);
        let read = rig
            .ctx
            .secrets
            .read_secret(&rig.ctx, HumbleSlot::Session, "t")
            .await;
        assert_eq!(read, SecretRead::Unavailable(Unreadable::Unavailable));
        rig.ctx
            .secrets
            .set(&rig.ctx, HumbleSlot::Session, "fake-secret-value-0001")
            .await;
        assert_eq!(rig.source.gets.load(Ordering::SeqCst), 0);
        assert_eq!(rig.source.sets.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn the_default_context_source_reads_and_writes_nothing() {
        let source = UnavailableSecretSource;
        assert!(source.get(HumbleSlot::Session).is_err());
        assert!(source.set(HumbleSlot::Session, "x").is_err());
        assert!(source.delete(HumbleSlot::Csrf).is_err());
        assert_eq!(source.available(), Ok(false));
    }
}
