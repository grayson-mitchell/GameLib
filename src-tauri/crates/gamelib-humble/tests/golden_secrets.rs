//! Replays every secrets golden recorded from the TypeScript (94-09, D-05/D-06/D-18) through the Rust
//! secret owner and the plaintext migration: the same cache, in-flight dedupe, negative memo, totality,
//! invalidate-before-write and read-back-before-delete.
//!
//! A golden is `{input, steps, keyringCalls, logs, result, keyringAfter, stateBefore, stateAfter}`. The
//! goldens carry no script, so each case id has its scenario written here, mirroring the TS script that
//! recorded it (`secretsAlerts.oracle.test.ts`). What the TypeScript recorded is never typed here:
//!
//! - the keyring is a [`GoldenSource`] driven by the golden's own `keyringCalls`: each call the Rust makes
//!   must be the next recorded call (op, slot, written value, and the fake clock's time at the call), and
//!   it answers what the recording answered or threw. A call the TS did not make, a missing call or one
//!   out of order is a problem the case reports;
//! - an `invalidateCache` entry in the recording means the call after it ran with the slot's cache cold,
//!   which the source checks through [`HumbleSecrets::cache_state`] at the moment of the call;
//! - the case's result, the keyring contents after it and the exact bytes of the config store file after
//!   it are compared with the golden's; the number of warnings the Rust wrote equals the TS's;
//! - no log line carries a stored value.
//!
//! Nothing here builds a keyring `Entry`: the keyring is scripted, so a test never reaches an OS store.

use std::collections::{BTreeMap, HashMap, VecDeque};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::time::Duration;

use gamelib_core::clock::Clock;
use gamelib_core::shutdown::Shutdown;
use gamelib_humble::ctx::{HumbleCtx, HumbleLog, Platform};
use gamelib_humble::http::NoHttp;
use gamelib_humble::secrets::{
    migrate_plaintext, CacheState, HumbleSecretSource, HumbleSecrets, HumbleSlot, SecretRead,
};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use serde::Deserialize;
use serde_json::{json, Value};

/// The instant the TypeScript harness pinned its fake clock to; a recorded `atMs` is relative to it.
const BASE_MS: u64 = 1_795_521_600_000;

/// The stored values the cases use, visibly fake. No log line may carry one.
const FAKE_VALUES: [&str; 4] = [
    "fake-secret-value-0001",
    "fake-secret-value-0002",
    "fake-secret-value-0003",
    "fake-secret-value-9999",
];
const SECRET: &str = "fake-secret-value-0001";
const SECRET_B: &str = "fake-secret-value-0002";

#[derive(Deserialize)]
struct Manifest {
    count: usize,
    floor: usize,
}

#[derive(Deserialize)]
struct Input {
    #[serde(rename = "keyringInitial")]
    keyring_initial: BTreeMap<String, String>,
}

#[derive(Deserialize, Clone)]
struct Recorded {
    op: String,
    slot: String,
    #[serde(default)]
    value: Option<String>,
    #[serde(rename = "atMs")]
    at_ms: u64,
    #[serde(default)]
    answered: Option<Value>,
    #[serde(default)]
    threw: Option<String>,
}

#[derive(Deserialize)]
struct RecordedLog {
    level: String,
}

#[derive(Deserialize)]
struct Bytes {
    utf8: String,
}

#[derive(Deserialize)]
struct Case {
    input: Input,
    #[serde(rename = "keyringCalls")]
    keyring_calls: Vec<Recorded>,
    logs: Vec<RecordedLog>,
    #[serde(default)]
    result: Option<Value>,
    #[serde(rename = "keyringAfter")]
    keyring_after: BTreeMap<String, String>,
    #[serde(rename = "stateBefore")]
    state_before: BTreeMap<String, Bytes>,
    #[serde(rename = "stateAfter")]
    state_after: BTreeMap<String, Bytes>,
}

fn fixtures() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/golden/secrets")
}

fn locked<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// The keyring account the TS recorded for a slot (the shell's names; pinned here as literals).
fn label(slot: HumbleSlot) -> &'static str {
    match slot {
        HumbleSlot::Session => "humble-session",
        HumbleSlot::Csrf => "humble-csrf",
    }
}

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

/// A call parked inside the source until the test releases it: a slow Keychain read.
#[derive(Default)]
struct Gate {
    entered: AtomicBool,
    released: Mutex<bool>,
    wake: Condvar,
}

impl Gate {
    /// Called from the source's blocking thread.
    fn park(&self) {
        self.entered.store(true, Ordering::SeqCst);
        let mut released = locked(&self.released);
        while !*released {
            released = self.wake.wait(released).unwrap_or_else(|e| e.into_inner());
        }
    }

    fn release(&self) {
        *locked(&self.released) = true;
        self.wake.notify_all();
    }

    async fn wait_entered(&self) {
        for _ in 0..5_000 {
            if self.entered.load(Ordering::SeqCst) {
                return;
            }
            tokio::time::sleep(Duration::from_millis(1)).await;
        }
        panic!("the source call never started");
    }
}

enum Step {
    /// The recording's `invalidateCache`: the next call on this slot sees a cold cache.
    Invalidate(String),
    Call(Recorded),
}

/// A keyring whose calls and answers are the golden's.
struct GoldenSource {
    script: Mutex<VecDeque<Step>>,
    slots: Mutex<BTreeMap<String, String>>,
    clock: Arc<TestClock>,
    secrets: OnceLock<Arc<HumbleSecrets>>,
    problems: Mutex<Vec<String>>,
    gates: Mutex<HashMap<&'static str, Arc<Gate>>>,
}

impl GoldenSource {
    fn new(case: &Case, clock: Arc<TestClock>) -> GoldenSource {
        let script = case
            .keyring_calls
            .iter()
            .map(|c| {
                if c.op == "invalidateCache" {
                    Step::Invalidate(c.slot.clone())
                } else {
                    Step::Call(c.clone())
                }
            })
            .collect();
        GoldenSource {
            script: Mutex::new(script),
            slots: Mutex::new(case.input.keyring_initial.clone()),
            clock,
            secrets: OnceLock::new(),
            problems: Mutex::new(Vec::new()),
            gates: Mutex::new(HashMap::new()),
        }
    }

    fn problem(&self, text: String) {
        locked(&self.problems).push(text);
    }

    /// The next call of `op` blocks inside the source until the returned gate is released.
    fn gate_next(&self, op: &'static str) -> Arc<Gate> {
        let gate = Arc::new(Gate::default());
        locked(&self.gates).insert(op, Arc::clone(&gate));
        gate
    }

    /// Consumes the recorded steps up to the call being made and checks it is the one recorded.
    fn next(&self, op: &str, slot: HumbleSlot, value: Option<&str>) -> Option<Recorded> {
        let mut cold = false;
        let recorded = {
            let mut script = locked(&self.script);
            loop {
                match script.pop_front() {
                    Some(Step::Invalidate(s)) if s == label(slot) => cold = true,
                    Some(Step::Invalidate(_)) => {}
                    Some(Step::Call(call)) => break Some(call),
                    None => break None,
                }
            }
        };
        let Some(recorded) = recorded else {
            self.problem(format!("unexpected extra call {op} {}", label(slot)));
            return None;
        };
        if recorded.op != op || recorded.slot != label(slot) {
            self.problem(format!(
                "call {op} {} where the TS made {} {}",
                label(slot),
                recorded.op,
                recorded.slot
            ));
        }
        if recorded.value.as_deref() != value {
            self.problem(format!("call {op} wrote a different value than the TS"));
        }
        let at = self.clock.now_ms().saturating_sub(BASE_MS);
        if recorded.at_ms != at {
            self.problem(format!(
                "call {op} was made at {at} ms where the TS made it at {} ms",
                recorded.at_ms
            ));
        }
        if cold {
            if let Some(secrets) = self.secrets.get() {
                let state = secrets.cache_state(slot);
                if state != CacheState::Cold {
                    self.problem(format!(
                        "call {op} {}: the cache was {state:?}, not invalidated first",
                        label(slot)
                    ));
                }
            }
        }
        Some(recorded)
    }

    fn park_if_gated(&self, op: &'static str) {
        let gate = locked(&self.gates).remove(op);
        if let Some(gate) = gate {
            gate.park();
        }
    }

    fn answer(recorded: Option<Recorded>) -> Result<Value, String> {
        match recorded {
            None => Err("unexpected".to_string()),
            Some(r) => match r.threw {
                Some(message) => Err(message),
                None => Ok(r.answered.unwrap_or(Value::Null)),
            },
        }
    }
}

impl HumbleSecretSource for GoldenSource {
    fn get(&self, slot: HumbleSlot) -> Result<Option<String>, String> {
        let recorded = self.next("keyring_get", slot, None);
        self.park_if_gated("keyring_get");
        match GoldenSource::answer(recorded)? {
            Value::String(text) => Ok(Some(text)),
            _ => Ok(None),
        }
    }

    fn set(&self, slot: HumbleSlot, value: &str) -> Result<(), String> {
        let recorded = self.next("keyring_set", slot, Some(value));
        self.park_if_gated("keyring_set");
        GoldenSource::answer(recorded)?;
        locked(&self.slots).insert(label(slot).to_string(), value.to_string());
        Ok(())
    }

    fn delete(&self, slot: HumbleSlot) -> Result<(), String> {
        let recorded = self.next("keyring_delete", slot, None);
        self.park_if_gated("keyring_delete");
        GoldenSource::answer(recorded)?;
        locked(&self.slots).remove(label(slot));
        Ok(())
    }

    fn available(&self) -> Result<bool, String> {
        let recorded = self.next("keyring_available", HumbleSlot::Session, None);
        self.park_if_gated("keyring_available");
        Ok(GoldenSource::answer(recorded)? == Value::Bool(true))
    }
}

/// What a scenario drives.
struct Env {
    ctx: Arc<HumbleCtx>,
    source: Arc<GoldenSource>,
    clock: Arc<TestClock>,
}

impl Env {
    fn advance(&self, ms: u64) {
        self.clock.0.fetch_add(ms, Ordering::SeqCst);
    }

    async fn read(&self, slot: HumbleSlot) -> Value {
        read_json(
            self.ctx
                .secrets
                .read_secret(&self.ctx, slot, "boot-probe")
                .await,
        )
    }

    async fn get(&self, slot: HumbleSlot) -> Value {
        json!(self.ctx.secrets.get(&self.ctx, slot).await)
    }

    /// The migration is blocking, as the shell runs it.
    async fn migrate(&self) {
        let ctx = Arc::clone(&self.ctx);
        tokio::task::spawn_blocking(move || migrate_plaintext(&ctx))
            .await
            .expect("the migration did not panic");
    }
}

/// `TokenReadOutcome` as the TS golden spells it.
fn read_json(read: SecretRead) -> Value {
    match read {
        SecretRead::Present(token) => json!({ "status": "present", "token": token }),
        SecretRead::Absent => json!({ "status": "absent" }),
        SecretRead::Unavailable(reason) => {
            json!({ "status": "unreadable", "reason": reason.word() })
        }
    }
}

use HumbleSlot::{Csrf, Session};

/// Lets tasks that were just spawned reach the point where they join an in-flight read. The recorded
/// result is the same whether or not they joined (one call either way); this only makes the join path
/// the usual one.
async fn let_joiners_arrive() {
    tokio::time::sleep(Duration::from_millis(50)).await;
}

/// The scenario for one case id: the TS script that recorded it, over the Rust owner.
async fn scenario(id: &str, env: &Env) -> Value {
    let ctx = &env.ctx;
    match id {
        "read-caches-a-present-value-for-the-process-lifetime" => {
            let first = env.get(Session).await;
            env.advance(24 * 60 * 60 * 1000);
            let second = env.get(Session).await;
            let third = env.read(Session).await;
            json!({ "first": first, "second": second, "third": third })
        }
        "read-caches-an-absent-slot-as-empty" => {
            let first = env.read(Session).await;
            let second = env.read(Session).await;
            json!({ "first": first, "second": second, "getSecret": env.get(Session).await })
        }
        "concurrent-reads-share-one-keyring-call" => {
            let gate = env.source.gate_next("keyring_get");
            let reads = {
                let (a, b, c) = (Arc::clone(ctx), Arc::clone(ctx), Arc::clone(ctx));
                [
                    tokio::spawn(async move { json!(a.secrets.get(&a, Session).await) }),
                    tokio::spawn(async move {
                        read_json(b.secrets.read_secret(&b, Session, "boot-probe").await)
                    }),
                    tokio::spawn(async move { json!(c.secrets.get(&c, Session).await) }),
                ]
            };
            gate.wait_entered().await;
            let_joiners_arrive().await;
            gate.release();
            let mut out = Vec::new();
            for read in reads {
                out.push(read.await.expect("a read task"));
            }
            Value::Array(out)
        }
        "failure-memo-answers-unreadable-without-a-keyring-call-for-120-s" => {
            let at0 = env.read(Session).await;
            env.advance(60_000);
            let at60s = env.read(Session).await;
            env.advance(59_999);
            let at119999 = env.read(Session).await;
            env.advance(1);
            let at120000 = env.read(Session).await;
            json!({ "at0": at0, "at60s": at60s, "at119999": at119999, "at120000": at120000 })
        }
        "failure-is-classified-timeout-or-unavailable-per-slot" => {
            json!({ "session": env.read(Session).await, "csrf": env.read(Csrf).await })
        }
        "getsecret-is-total-on-a-failing-keyring" => json!({ "value": env.get(Session).await }),
        "set-invalidates-then-writes-then-serves-the-next-read-from-cache" => {
            ctx.secrets.set(ctx, Session, SECRET).await;
            let read = env.get(Session).await;
            let available = ctx.secrets.available(ctx, "store-humble-secret").await;
            json!({ "read": read, "available": available })
        }
        "set-failure-is-total-and-leaves-the-cache-cold" => {
            ctx.secrets.set(ctx, Session, SECRET).await;
            json!({ "read": env.get(Session).await })
        }
        "clear-invalidates-before-each-delete" => {
            let before = env.get(Session).await;
            ctx.secrets.clear(ctx).await;
            let after = env.get(Session).await;
            let csrf_after = env.get(Csrf).await;
            json!({ "before": before, "after": after, "csrfAfter": csrf_after })
        }
        "clear-failure-is-total-and-never-resurrects-a-cached-value" => {
            let before = env.get(Session).await;
            ctx.secrets.clear(ctx).await;
            json!({ "before": before, "after": env.get(Session).await })
        }
        "a-read-in-flight-never-overwrites-a-newer-write" => {
            let gate = env.source.gate_next("keyring_get");
            let slow = {
                let c = Arc::clone(ctx);
                tokio::spawn(async move { json!(c.secrets.get(&c, Session).await) })
            };
            gate.wait_entered().await;
            ctx.secrets.set(ctx, Session, SECRET_B).await;
            env.advance(1000);
            gate.release();
            let slow = slow.await.expect("the slow read");
            json!({ "slow": slow, "afterwards": env.get(Session).await })
        }
        "invalidate-clears-the-failure-memo" => {
            let failed = env.read(Session).await;
            ctx.secrets.invalidate(Session);
            json!({ "failed": failed, "again": env.read(Session).await })
        }
        "availability-probe-is-cached-and-deduped-and-a-failure-is-not-cached" => {
            let gate = env.source.gate_next("keyring_available");
            let probes = {
                let (a, b, c) = (Arc::clone(ctx), Arc::clone(ctx), Arc::clone(ctx));
                [
                    tokio::spawn(async move { a.secrets.available(&a, "first").await }),
                    tokio::spawn(async move { b.secrets.available(&b, "second").await }),
                    tokio::spawn(async move { c.secrets.available(&c, "third").await }),
                ]
            };
            gate.wait_entered().await;
            let_joiners_arrive().await;
            env.advance(200);
            gate.release();
            let mut concurrent = Vec::new();
            for probe in probes {
                concurrent.push(probe.await.expect("a probe task"));
            }
            let cached = ctx.secrets.available(ctx, "cached").await;
            ctx.secrets.invalidate(Session);
            let failing = ctx.secrets.available(ctx, "after-invalidate").await;
            let retried = ctx.secrets.available(ctx, "retry").await;
            json!({ "concurrent": concurrent, "cached": cached, "failing": failing, "retried": retried })
        }
        "slow-keyring-read-fails-as-a-timeout-after-the-rust-bound" => {
            let gate = env.source.gate_next("keyring_get");
            let read = {
                let c = Arc::clone(ctx);
                tokio::spawn(async move {
                    read_json(c.secrets.read_secret(&c, Session, "boot-probe").await)
                })
            };
            gate.wait_entered().await;
            env.advance(45_000);
            gate.release();
            let first = read.await.expect("the slow read");
            env.advance(119_999);
            json!({ "first": first, "memo": env.read(Session).await })
        }
        "the-two-slots-are-independent" => {
            let session = env.read(Session).await;
            let csrf = env.read(Csrf).await;
            json!({ "session": session, "csrf": csrf, "sessionAgain": env.get(Session).await })
        }
        "migration-moves-both-secrets-with-a-read-back" => {
            let before = env.get(Session).await;
            env.migrate().await;
            let after = env.get(Session).await;
            let csrf_after = env.get(Csrf).await;
            json!({ "before": before, "after": after, "csrfAfter": csrf_after })
        }
        "migration-with-nothing-to-migrate-makes-no-keyring-call"
        | "migration-write-failure-leaves-the-plaintext-in-place"
        | "migration-read-back-failure-leaves-the-plaintext-in-place"
        | "migration-read-back-mismatch-is-never-rounded-up-to-success"
        | "migration-is-per-secret-so-a-csrf-failure-never-strands-the-session"
        | "migration-only-the-csrf-token-is-plaintext"
        | "boot-hook-logs-the-install-line-and-fires-the-migration" => {
            env.migrate().await;
            Value::Null
        }
        other => panic!("no scenario for golden {other}: add it beside its TypeScript script"),
    }
}

fn write_state(home: &FakeHome, files: &BTreeMap<String, Bytes>) {
    for (rel, bytes) in files {
        let mut path = home.root().to_path_buf();
        for part in rel.split('/') {
            path.push(part);
        }
        fs::create_dir_all(path.parent().expect("a state file has a parent")).unwrap();
        fs::write(&path, bytes.utf8.as_bytes()).unwrap();
    }
}

fn read_state(home: &FakeHome, rel: &str) -> Option<String> {
    let mut path = home.root().to_path_buf();
    for part in rel.split('/') {
        path.push(part);
    }
    fs::read_to_string(path).ok()
}

/// What a replay of every case saw, for the floor.
#[derive(Default)]
struct Coverage {
    cases: usize,
    gated: usize,
    warned: usize,
    config_bytes_checked: usize,
    plaintext_kept: usize,
    plaintext_deleted: usize,
}

async fn replay(id: &str, case: &Case, coverage: &mut Coverage) -> Vec<String> {
    let mut failures = Vec::new();
    let home = FakeHome::new("humble-secrets-golden-");
    write_state(&home, &case.state_before);
    let clock = Arc::new(TestClock(AtomicU64::new(BASE_MS)));
    let source = Arc::new(GoldenSource::new(case, Arc::clone(&clock)));
    let lines = Arc::new(Lines::default());
    let ctx = Arc::new(
        HumbleCtx::new(
            Arc::new(StoreHost::new()),
            home.root().to_path_buf(),
            clock.clone(),
            Platform::Linux,
            Shutdown::new(),
            Arc::new(NoHttp),
        )
        .with_log(lines.clone())
        .with_secrets(source.clone()),
    );
    let _ = source.secrets.set(Arc::clone(&ctx.secrets));
    let env = Env {
        ctx: Arc::clone(&ctx),
        source: Arc::clone(&source),
        clock,
    };

    let got = match tokio::time::timeout(Duration::from_secs(60), scenario(id, &env)).await {
        Ok(value) => value,
        Err(_) => {
            failures.push(format!("{id}: the scenario did not finish"));
            return failures;
        }
    };

    if got != case.result.clone().unwrap_or(Value::Null) {
        failures.push(format!(
            "{id}: result {got} where the TS recorded {}",
            case.result.clone().unwrap_or(Value::Null)
        ));
    }
    for problem in locked(&source.problems).iter() {
        failures.push(format!("{id}: {problem}"));
    }
    let left = locked(&source.script)
        .iter()
        .filter(|s| matches!(s, Step::Call(_)))
        .count();
    if left != 0 {
        failures.push(format!(
            "{id}: {left} recorded keyring call(s) were never made"
        ));
    }
    if *locked(&source.slots) != case.keyring_after {
        failures.push(format!(
            "{id}: the keyring ends with different slots than the TS's"
        ));
    }

    let recorded_warns = case.logs.iter().filter(|l| l.level == "warn").count();
    let text = locked(&lines.0).clone();
    let warns = text.iter().filter(|l| l.starts_with("warn ")).count();
    if warns != recorded_warns {
        failures.push(format!(
            "{id}: {warns} warning(s) where the TS wrote {recorded_warns}: {text:?}"
        ));
    }
    for value in FAKE_VALUES {
        if text.iter().any(|line| line.contains(value)) {
            failures.push(format!("{id}: a log line carries a stored value"));
        }
    }

    for (rel, want) in &case.state_after {
        coverage.config_bytes_checked += 1;
        match read_state(&home, rel) {
            Some(have) if have == want.utf8 => {}
            Some(_) => failures.push(format!("{id}: {rel} differs from the TS's bytes")),
            None => failures.push(format!("{id}: {rel} is missing")),
        }
    }
    if id.starts_with("migration-") || id.starts_with("boot-hook") {
        let before = case
            .state_before
            .get("humble_store/config.json")
            .map(|b| b.utf8.clone())
            .unwrap_or_default();
        let after = read_state(&home, "humble_store/config.json").unwrap_or_default();
        for key in ["sessionCookie", "csrfToken"] {
            let needle = format!("\"{key}\"");
            match (before.contains(&needle), after.contains(&needle)) {
                (true, true) => coverage.plaintext_kept += 1,
                (true, false) => coverage.plaintext_deleted += 1,
                _ => {}
            }
        }
    }

    coverage.cases += 1;
    if recorded_warns > 0 {
        coverage.warned += 1;
    }
    if case.keyring_calls.iter().any(|c| c.op == "keyring_get") && id.contains("concurrent") {
        coverage.gated += 1;
    }
    failures
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn every_secrets_golden_replays_through_the_rust_owner_and_the_migration() {
    let dir = fixtures();
    let manifest: Manifest =
        serde_json::from_str(&fs::read_to_string(dir.join("MANIFEST.json")).unwrap()).unwrap();

    let mut ids: Vec<String> = fs::read_dir(&dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .filter(|n| n.ends_with(".json") && n != "MANIFEST.json")
        .map(|n| n.trim_end_matches(".json").to_string())
        .collect();
    ids.sort();
    assert_eq!(
        ids.len(),
        manifest.count,
        "the manifest count and the golden files disagree: a truncated set must not pass"
    );
    assert!(manifest.count >= manifest.floor);

    let mut coverage = Coverage::default();
    let mut failures = Vec::new();
    for id in &ids {
        let text = fs::read_to_string(dir.join(format!("{id}.json"))).unwrap();
        let case: Case = serde_json::from_str(&text).unwrap_or_else(|e| panic!("{id}: {e}"));
        failures.extend(replay(id, &case, &mut coverage).await);
    }
    assert!(
        failures.is_empty(),
        "{} replay failure(s):\n{}",
        failures.len(),
        failures.join("\n")
    );

    // The replay itself: every golden ran, with warnings, byte-compared config files, a plaintext that
    // was deleted and a plaintext that was kept.
    assert_eq!(coverage.cases, manifest.count);
    assert!(coverage.gated >= 1, "the in-flight dedupe case did not run");
    assert!(coverage.warned >= 5, "too few failure cases replayed");
    assert!(coverage.config_bytes_checked >= 7);
    assert!(
        coverage.plaintext_deleted >= 3,
        "no migration deleted a plaintext key"
    );
    assert!(
        coverage.plaintext_kept >= 4,
        "no migration kept a plaintext key"
    );
}

/// The migration's one promise, replayed against the one golden that matters most: a read back that
/// answers a different value leaves the plaintext's exact bytes in the config.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_read_back_mismatch_keeps_the_plaintext_bytes_in_the_config() {
    let id = "migration-read-back-mismatch-is-never-rounded-up-to-success";
    let text = fs::read_to_string(fixtures().join(format!("{id}.json"))).unwrap();
    let case: Case = serde_json::from_str(&text).unwrap();
    let mut coverage = Coverage::default();
    let failures = replay(id, &case, &mut coverage).await;
    assert!(failures.is_empty(), "{failures:?}");

    let before = &case.state_before["humble_store/config.json"].utf8;
    let after = &case.state_after["humble_store/config.json"].utf8;
    assert!(after.contains("\"sessionCookie\": \"fake-secret-value-0001\""));
    assert_eq!(before, after, "the config bytes are exactly as they were");
}
