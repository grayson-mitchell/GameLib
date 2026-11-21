//! The shell's side of the sidecar's store writes (Phase 85 plan 10, FND-06): the `kind:"store"`
//! frame arm of the stdout reader, and the one worker that applies the frames.
//!
//! A store the ownership file moved to Rust is mirrored in the sidecar (`mirrorCell.ts`), which
//! sends one ordered frame per write. They travel on stdout, read by the shell's single in-order
//! reader, because `rustInvoke` runs one worker thread per call with no order (Pitfall 7). The
//! reader arm only validates and enqueues: it never blocks and never writes a file (the 2026-10-05
//! send-queue freeze). One `store-frames` worker applies the frames in arrival order through
//! [`StoreHost::apply`] with `Origin::Sidecar { seq }`, then answers each with a `storeMirrorEvent`
//! (`applied`, `refused` or `flushed`) written to the sidecar in the same order (85-SPIKES.md S1
//! rules 1, 3, 6 and 7: persist before emit, one FIFO, `originSeq` acks, a nack on a failed persist).
//!
//! Values cross as `valueJson` TEXT and are parsed only by `gamelib_store::json`, the ordered
//! parser, so a nested object keeps the key order the sidecar held and the bytes written equal what
//! the TS store would have written.
//!
//! The queue is unbounded and never drops a frame: a store write is not lost to pressure. Crossing
//! [`STORE_QUEUE_HIGH_WATER`] logs one counted warning. Rejections are logged by category only
//! (`store frame rejected: <reason>`): a key or a value can be a token and `gamelib.log` is the file
//! users upload.
//!
//! Rust shutdown contract: the worker holds a `store` registrant from the first enqueued frame until
//! its queue is empty and nothing is being applied, so exit waits for queued writes inside the one
//! 5 s budget (`store_boot::drain` bounds the same wait). The worker is a plain `std` thread that
//! sleeps on a condvar; it spawns no process.

use std::collections::VecDeque;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant};

use gamelib_core::shutdown::{Registrant, Shutdown};
use gamelib_store::host::{runtime_cache_row, ApplyError, Origin, StoreHost};
use gamelib_store::json::{self, Json, Obj};
use gamelib_store::ops::{Op, OpReject};
use gamelib_store::table::{row_for_key, TableRow};
use serde_json::{json, Value};

use crate::shell_state::SidecarState;
use crate::store_boot::{self, Ownership, StoreMode};
use crate::SidecarRpcRequest;

pub(crate) use crate::ipc_contract::{STORE_FRAME_KIND, STORE_MIRROR_EVENT_CHANNEL};

/// The queue depth at which one counted warning is logged. From 85-SPIKES.md "Constants" (S3): the
/// worst measured burst (50 frames of 600 KB, `sync_all` per frame) peaked at 44 queued; 4 x 44 =
/// 176, rounded up to 256. A warning only: the queue stays unbounded and no write is dropped.
pub(crate) const STORE_QUEUE_HIGH_WATER: usize = 256;

/// A frame line longer than this is rejected whole (`maxFrameBytes` of the shared frame vectors).
pub(crate) const MAX_FRAME_BYTES: usize = 10 * 1024 * 1024;

/// Why a frame was rejected. The strings are the shared vectors' reason categories.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum StoreFrameReject {
    UnknownField,
    Shape,
    Seq,
    Op,
    StoreKey,
    KeyPath,
    ReservedKey,
    ValueJson,
    TooLarge,
}

impl StoreFrameReject {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            StoreFrameReject::UnknownField => "unknown-field",
            StoreFrameReject::Shape => "shape",
            StoreFrameReject::Seq => "seq",
            StoreFrameReject::Op => "op",
            StoreFrameReject::StoreKey => "store-key",
            StoreFrameReject::KeyPath => "key-path",
            StoreFrameReject::ReservedKey => "reserved-key",
            StoreFrameReject::ValueJson => "value-json",
            StoreFrameReject::TooLarge => "too-large",
        }
    }
}

/// What a frame asks for, with its value already parsed by the ordered parser.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum FrameOp {
    Set { key: String, value: Json },
    Delete { key: String },
    Clear,
    Replace(Obj),
    Flush,
}

/// One validated `kind:"store"` frame.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct StoreFrame {
    pub(crate) seq: u64,
    pub(crate) store: String,
    pub(crate) op: FrameOp,
}

const FRAME_FIELDS: [&str; 6] = ["kind", "seq", "store", "op", "key", "valueJson"];

/// A path segment dot-prop refuses, because it would reach the prototype chain in JS.
fn disallowed_segment(segment: &str) -> bool {
    matches!(segment, "__proto__" | "prototype" | "constructor")
}

/// A plain file name: what `GamesConfig/<app>` may name (never a path).
fn plain_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 255
        && name != "."
        && name != ".."
        && !name.contains(['/', '\\', '\0'])
        && !name.contains("..")
}

/// A runtime cache name: `CACHE_STORE_NAME_PATTERN` of `storePolicy.ts` (`^[A-Za-z0-9_-]{1,64}$`).
fn cache_name(name: &str) -> bool {
    (1..=64).contains(&name.len())
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

/// The table row a store key names: a listed row with a file name, `settings/global`,
/// `GamesConfig/<app>` (the `settings/game` pattern row) or a runtime `store_cache/<name>`. Anything
/// else (an unknown directory, a path escape, the pattern row's own key) is `None`.
fn row_for_store_key(key: &str) -> Option<TableRow> {
    if let Some(app) = key.strip_prefix("GamesConfig/") {
        return if plain_name(app) {
            row_for_key("settings/game").cloned()
        } else {
            None
        };
    }
    if let Some(row) = row_for_key(key) {
        return row.name.is_some().then(|| row.clone());
    }
    let name = key.strip_prefix("store_cache/")?;
    cache_name(name).then(|| runtime_cache_row(key.to_string(), "store_cache", name))
}

/// Where a store's file is, under the user-data directory (`store_boot::candidates` agrees).
fn path_for(user_data: &Path, key: &str, row: &TableRow) -> PathBuf {
    if let Some(app) = key.strip_prefix("GamesConfig/") {
        return user_data.join("GamesConfig").join(format!("{app}.json"));
    }
    if key == "settings/global" {
        return user_data.join("config.json");
    }
    user_data
        .join(&row.dir)
        .join(format!("{}.json", row.name.as_deref().unwrap_or_default()))
}

/// Validates one frame the way `validateStoreFrame` (`storeFrames.ts`) does, in the same order, so
/// both sides accept and reject the same shared frame vectors. `line_len` is the
/// length of the line the frame arrived on. The result never carries a key or a value.
pub(crate) fn parse_store_frame(
    line_len: usize,
    value: &Value,
) -> Result<StoreFrame, StoreFrameReject> {
    use StoreFrameReject as R;
    let Some(frame) = value.as_object() else {
        return Err(R::Shape);
    };
    if line_len > MAX_FRAME_BYTES {
        return Err(R::TooLarge);
    }
    if frame.get("kind").and_then(Value::as_str) != Some(STORE_FRAME_KIND) {
        return Err(R::Shape);
    }
    if frame.keys().any(|k| !FRAME_FIELDS.contains(&k.as_str())) {
        return Err(R::UnknownField);
    }
    let seq = match frame.get("seq") {
        Some(Value::Number(n)) => n.as_u64().filter(|s| (1..=(1u64 << 53) - 1).contains(s)),
        _ => return Err(R::Shape),
    }
    .ok_or(R::Seq)?;
    let (Some(Value::String(store)), Some(Value::String(op))) =
        (frame.get("store"), frame.get("op"))
    else {
        return Err(R::Shape);
    };
    if !matches!(
        op.as_str(),
        "set" | "delete" | "clear" | "replace" | "flush"
    ) {
        return Err(R::Op);
    }
    if row_for_store_key(store).is_none() {
        return Err(R::StoreKey);
    }

    let needs_key = matches!(op.as_str(), "set" | "delete");
    let needs_value = matches!(op.as_str(), "set" | "replace");
    let key = match frame.get("key") {
        None => None,
        Some(Value::String(k)) => Some(k.as_str()),
        Some(_) => return Err(R::Shape),
    };
    let value_json = match frame.get("valueJson") {
        None => None,
        Some(Value::String(v)) => Some(v.as_str()),
        Some(_) => return Err(R::Shape),
    };
    if needs_key != key.is_some() || needs_value != value_json.is_some() {
        return Err(R::Shape);
    }

    if let Some(key) = key {
        let mut segments = key.split('.');
        if segments.next() == Some("__internal__") {
            return Err(R::ReservedKey);
        }
        if key
            .split('.')
            .any(|segment| segment.is_empty() || disallowed_segment(segment))
        {
            return Err(R::KeyPath);
        }
    }
    let parsed = match value_json {
        Some(text) => Some(json::parse(text.as_bytes()).map_err(|_| R::ValueJson)?),
        None => None,
    };

    let op = match (op.as_str(), key, parsed) {
        ("set", Some(key), Some(value)) => FrameOp::Set {
            key: key.to_string(),
            value,
        },
        ("delete", Some(key), None) => FrameOp::Delete {
            key: key.to_string(),
        },
        ("clear", None, None) => FrameOp::Clear,
        ("replace", None, Some(Json::Obj(obj))) => FrameOp::Replace(obj),
        ("replace", None, Some(_)) => return Err(R::ValueJson),
        ("flush", None, None) => FrameOp::Flush,
        _ => return Err(R::Shape),
    };
    Ok(StoreFrame {
        seq,
        store: store.clone(),
        op,
    })
}

/// What a rejected frame can still be answered with: its `seq` and store, when both are readable.
/// A frame the shell refuses should not leave an op pending in the sidecar's mirror forever (S1
/// rule 7), so a refusal is nacked when it says who to nack.
fn nack_target(value: &Value) -> Option<(u64, String)> {
    let frame = value.as_object()?;
    let seq = frame
        .get("seq")?
        .as_u64()
        .filter(|s| (1..=(1u64 << 53) - 1).contains(s))?;
    let store = frame.get("store")?.as_str()?;
    (!store.is_empty() && store.len() <= 128).then(|| (seq, store.to_string()))
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// Where the shell writes a `storeMirrorEvent` payload: the sidecar's stdin as a `send` frame.
pub(crate) type EventSink = Arc<dyn Fn(Value) + Send + Sync>;

/// One line into the shell log (a test captures them).
pub(crate) type LogSink = Arc<dyn Fn(&str) + Send + Sync>;

/// What the worker needs to resolve a frame to a file.
#[derive(Clone)]
pub(crate) struct Config {
    pub(crate) user_data: PathBuf,
    pub(crate) mode: StoreMode,
    pub(crate) ownership: Ownership,
}

struct Queue {
    items: VecDeque<StoreFrame>,
    /// A frame has been taken and is being applied.
    busy: bool,
    /// Held from the first enqueued frame until the queue is empty and nothing is being applied.
    registrant: Option<Registrant>,
    worker_started: bool,
    /// The depth has crossed [`STORE_QUEUE_HIGH_WATER`] and not yet fallen back: one warning per
    /// crossing.
    above_high_water: bool,
}

/// The queue, its worker and what the worker needs. One per process in production ([`global`]);
/// a test builds its own over a throwaway host.
pub(crate) struct Dispatcher {
    host: Arc<StoreHost>,
    config: Config,
    shutdown: Shutdown,
    events: EventSink,
    log: LogSink,
    queue: Mutex<Queue>,
    /// Wakes the worker when a frame is queued.
    work: Condvar,
    /// Wakes `wait_idle` when the queue empties.
    idle: Condvar,
}

impl Dispatcher {
    pub(crate) fn new(
        host: Arc<StoreHost>,
        config: Config,
        shutdown: Shutdown,
        events: EventSink,
        log: LogSink,
    ) -> Arc<Dispatcher> {
        Arc::new(Dispatcher {
            host,
            config,
            shutdown,
            events,
            log,
            queue: Mutex::new(Queue {
                items: VecDeque::new(),
                busy: false,
                registrant: None,
                worker_started: false,
                above_high_water: false,
            }),
            work: Condvar::new(),
            idle: Condvar::new(),
        })
    }

    /// Validates one frame line's value and queues it. A rejected frame is logged by category and,
    /// when it says who sent it, answered `refused` so the sidecar's mirror drops the op.
    pub(crate) fn enqueue(self: &Arc<Self>, line_len: usize, value: Value) {
        match parse_store_frame(line_len, &value) {
            Ok(frame) => self.push(frame),
            Err(reject) => {
                (self.log)(&format!("WARN: store frame rejected: {}", reject.as_str()));
                if let Some((seq, store)) = nack_target(&value) {
                    self.reply(&store, 0, "refused", seq, Some("rejected"));
                }
            }
        }
    }

    /// Queues a frame and makes sure the worker is running. Never blocks and never writes a file.
    fn push(self: &Arc<Self>, frame: StoreFrame) {
        let (start_worker, crossed) = {
            let mut q = lock(&self.queue);
            if q.registrant.is_none() {
                q.registrant = Some(self.shutdown.register("store"));
            }
            q.items.push_back(frame);
            let depth = q.items.len();
            let crossed = (depth > STORE_QUEUE_HIGH_WATER && !q.above_high_water).then(|| {
                q.above_high_water = true;
                depth
            });
            (!std::mem::replace(&mut q.worker_started, true), crossed)
        };
        if let Some(depth) = crossed {
            // A count only, once per crossing: the queue stays unbounded and nothing is dropped.
            (self.log)(&format!(
                "WARN: store queue high-water: {depth} frames queued"
            ));
        }
        if start_worker {
            let worker = Arc::clone(self);
            let spawned = std::thread::Builder::new()
                .name("store-frames".into())
                .spawn(move || worker.run());
            if spawned.is_err() {
                lock(&self.queue).worker_started = false;
                (self.log)("WARN: store frame worker could not start");
            }
        }
        self.work.notify_one();
    }

    /// The worker: applies queued frames in arrival order and sleeps when there are none.
    fn run(self: Arc<Self>) {
        loop {
            let frame = {
                let mut q = lock(&self.queue);
                loop {
                    if let Some(frame) = q.items.pop_front() {
                        q.busy = true;
                        if q.above_high_water && q.items.len() <= STORE_QUEUE_HIGH_WATER / 2 {
                            q.above_high_water = false;
                        }
                        break frame;
                    }
                    // Empty and nothing in flight: the exit drain has nothing left to wait for.
                    q.busy = false;
                    q.registrant = None;
                    self.idle.notify_all();
                    q = self.work.wait(q).unwrap_or_else(|e| e.into_inner());
                }
            };
            // A bug in one frame's handling must not strand the queue (and the registrant) forever.
            if catch_unwind(AssertUnwindSafe(|| self.handle(frame))).is_err() {
                (self.log)("WARN: store frame worker recovered from a panic");
            }
        }
    }

    /// Applies one frame and answers it.
    fn handle(&self, frame: StoreFrame) {
        let StoreFrame { seq, store, op } = frame;
        let target = row_for_store_key(&store).filter(|row| {
            row.store_kind().is_some()
                && store_boot::is_rust_owned(row, self.config.mode, &self.config.ownership)
        });
        let Some(row) = target else {
            self.reply(&store, 0, "refused", seq, Some("not-owned"));
            return;
        };
        if matches!(op, FrameOp::Flush) {
            // Every earlier frame was applied before the worker reached this one.
            self.reply(&store, 0, "flushed", seq, None);
            return;
        }
        let path = path_for(&self.config.user_data, &store, &row);
        let opened = match self.host.open_row(&row, path) {
            Ok(opened) => opened,
            Err(_) => {
                self.reply(&store, 0, "refused", seq, Some("io"));
                return;
            }
        };
        let op = match op {
            FrameOp::Set { key, value } => Op::Set { key, value },
            FrameOp::Delete { key } => Op::Delete { key },
            FrameOp::Clear => Op::Clear,
            FrameOp::Replace(obj) => Op::Replace(obj),
            FrameOp::Flush => return,
        };
        match opened.apply(op, Origin::Sidecar { seq }) {
            Ok(rev) => self.reply(&store, rev, "applied", seq, None),
            Err(refusal) => {
                let reason = match refusal {
                    ApplyError::ReadOnly(_) => "read-only",
                    ApplyError::Evicted => "evicted",
                    ApplyError::Rejected(OpReject::ReservedKey | OpReject::KeyPath) => "rejected",
                    ApplyError::Io(_) => "io",
                };
                self.reply(&store, opened.rev(), "refused", seq, Some(reason));
            }
        }
    }

    /// Writes one `storeMirrorEvent` to the sidecar. The worker is the only caller, so events leave
    /// in the order the frames were applied.
    fn reply(&self, store: &str, rev: u64, op: &str, seq: u64, reason: Option<&str>) {
        let mut event = json!({ "store": store, "rev": rev, "op": op, "originSeq": seq });
        if let (Some(reason), Some(map)) = (reason, event.as_object_mut()) {
            map.insert("reason".to_string(), Value::String(reason.to_string()));
        }
        (self.events)(event);
    }

    /// Waits up to `bound` for the queue to empty and the frame being applied to finish. `true`
    /// when nothing is left, `false` when frames remain at the deadline.
    pub(crate) fn wait_idle(&self, bound: Duration) -> bool {
        let deadline = Instant::now() + bound;
        let mut q = lock(&self.queue);
        while !q.items.is_empty() || q.busy {
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                return false;
            }
            q = self
                .idle
                .wait_timeout(q, left)
                .unwrap_or_else(|e| e.into_inner())
                .0;
        }
        true
    }
}

// ---- the process-wide dispatcher ------------------------------------------------------------

static CONFIG: OnceLock<Config> = OnceLock::new();
static SIDECAR: OnceLock<Arc<SidecarState>> = OnceLock::new();
static GLOBAL: OnceLock<Arc<Dispatcher>> = OnceLock::new();

/// Tells the dispatcher where the stores live and who owns them. Called once from `run_setup`, with
/// the values the boot open used. First call wins.
pub(crate) fn configure(user_data: PathBuf, mode: StoreMode) {
    let _ = CONFIG.set(Config {
        user_data,
        mode,
        ownership: Ownership::embedded().clone(),
    });
}

/// Hands the dispatcher the sidecar's state, so it can answer frames. Installed before the stdout
/// reader starts, so no frame can arrive before there is somewhere to answer.
pub(crate) fn install_sidecar(state: &Arc<SidecarState>) {
    let _ = SIDECAR.set(Arc::clone(state));
}

fn global() -> Option<&'static Arc<Dispatcher>> {
    if let Some(d) = GLOBAL.get() {
        return Some(d);
    }
    let config = CONFIG.get()?.clone();
    let events: EventSink = Arc::new(|payload| {
        let Some(state) = SIDECAR.get() else {
            return;
        };
        let req = SidecarRpcRequest {
            id: state.next_id(),
            kind: "send",
            channel: STORE_MIRROR_EVENT_CHANNEL.to_string(),
            args: vec![payload],
        };
        // A dead pipe just means the sidecar is gone; EOF handling owns that.
        let _ = state.write_frame(&req);
    });
    let log: LogSink = Arc::new(|line| crate::shell_log(line));
    let created = Dispatcher::new(
        Arc::clone(store_boot::host()),
        config,
        gamelib_core::shutdown::global().clone(),
        events,
        log,
    );
    Some(GLOBAL.get_or_init(|| created))
}

/// The reader's store arm: validates one `kind:"store"` frame and queues it. Never blocks, never
/// writes a file. With the dispatcher unconfigured (no home directory) the frame is dropped with one
/// line.
pub(crate) fn enqueue(line_len: usize, value: Value) {
    match global() {
        Some(dispatcher) => dispatcher.enqueue(line_len, value),
        None => {
            crate::shell_log("WARN: store frame dropped: the store dispatcher is not configured")
        }
    }
}

/// `true` when no frame is queued or being applied (and when no frame ever arrived).
pub(crate) fn wait_idle(bound: Duration) -> bool {
    GLOBAL.get().is_none_or(|d| d.wait_idle(bound))
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_testutil::FakeHome;
    use std::fs;
    use std::sync::atomic::{AtomicBool, Ordering};

    /// Everything a test needs: a dispatcher over a throwaway user-data directory, the events it
    /// sent the sidecar and the lines it logged.
    struct Rig {
        home: FakeHome,
        host: Arc<StoreHost>,
        shutdown: Shutdown,
        dispatcher: Arc<Dispatcher>,
        events: Arc<Mutex<Vec<Value>>>,
        logs: Arc<Mutex<Vec<String>>>,
    }

    const TRACER: &str = "store_cache/wikigameinfo";

    fn tracer_ownership() -> Ownership {
        Ownership::parse(r#"{"families":{},"stores":{"store_cache/wikigameinfo":true}}"#).unwrap()
    }

    fn rig_with(ownership: Ownership, mode: StoreMode) -> Rig {
        rig_over(Arc::new(StoreHost::new()), ownership, mode)
    }

    fn rig_over(host: Arc<StoreHost>, ownership: Ownership, mode: StoreMode) -> Rig {
        let home = FakeHome::new("store-dispatch-");
        let shutdown = Shutdown::new();
        let events = Arc::new(Mutex::new(Vec::new()));
        let logs = Arc::new(Mutex::new(Vec::new()));
        let (e, l) = (Arc::clone(&events), Arc::clone(&logs));
        let dispatcher = Dispatcher::new(
            Arc::clone(&host),
            Config {
                user_data: home.root().to_path_buf(),
                mode,
                ownership,
            },
            shutdown.clone(),
            Arc::new(move |event| lock(&e).push(event)),
            Arc::new(move |line| lock(&l).push(line.to_string())),
        );
        Rig {
            home,
            host,
            shutdown,
            dispatcher,
            events,
            logs,
        }
    }

    /// A writer that waits at a gate before writing, so a test can hold the worker mid-apply with
    /// frames queued behind it. `fail_first` makes the first write fail (after the gate opens).
    struct Gate {
        open: Mutex<bool>,
        cv: Condvar,
        entered: Mutex<usize>,
        entered_cv: Condvar,
    }

    impl Gate {
        fn new(open: bool) -> Arc<Gate> {
            Arc::new(Gate {
                open: Mutex::new(open),
                cv: Condvar::new(),
                entered: Mutex::new(0),
                entered_cv: Condvar::new(),
            })
        }

        fn release(&self) {
            *lock(&self.open) = true;
            self.cv.notify_all();
        }

        /// Waits until the writer has been entered `n` times (the worker is held at the gate).
        fn wait_entered(&self, n: usize) {
            let mut entered = lock(&self.entered);
            let deadline = Instant::now() + Duration::from_secs(10);
            while *entered < n {
                let left = deadline.saturating_duration_since(Instant::now());
                assert!(!left.is_zero(), "the worker never reached the writer");
                entered = self
                    .entered_cv
                    .wait_timeout(entered, left)
                    .unwrap_or_else(|e| e.into_inner())
                    .0;
            }
        }
    }

    fn gated_host(gate: &Arc<Gate>, fail_first: bool) -> Arc<StoreHost> {
        let gate = Arc::clone(gate);
        let failed = Arc::new(AtomicBool::new(!fail_first));
        Arc::new(StoreHost::with_writer(Arc::new(move |path, bytes, dur| {
            *lock(&gate.entered) += 1;
            gate.entered_cv.notify_all();
            let mut open = lock(&gate.open);
            while !*open {
                open = gate.cv.wait(open).unwrap_or_else(|e| e.into_inner());
            }
            drop(open);
            if !failed.swap(true, Ordering::SeqCst) {
                return Err(std::io::Error::other("disk full"));
            }
            gamelib_store::atomic::write_atomic(path, bytes, dur)
        })))
    }

    fn rig() -> Rig {
        rig_with(tracer_ownership(), StoreMode::Rust)
    }

    fn frame(
        seq: u64,
        store: &str,
        op: &str,
        key: Option<&str>,
        value_json: Option<&str>,
    ) -> Value {
        let mut f = json!({ "kind": "store", "seq": seq, "store": store, "op": op });
        if let Some(key) = key {
            f["key"] = json!(key);
        }
        if let Some(value) = value_json {
            f["valueJson"] = json!(value);
        }
        f
    }

    fn send(rig: &Rig, value: Value) {
        let len = serde_json::to_string(&value).unwrap().len();
        rig.dispatcher.enqueue(len, value);
    }

    fn settle(rig: &Rig) {
        assert!(rig.dispatcher.wait_idle(Duration::from_secs(10)));
    }

    #[test]
    fn store_frame_kind_and_event_channel_match_the_ts_transport_constants() {
        assert_eq!(STORE_FRAME_KIND, "store");
        assert_eq!(STORE_MIRROR_EVENT_CHANNEL, "storeMirrorEvent");
        let ts = include_str!("../../src/common/types/sidecarTransport.ts");
        assert!(ts.contains("export const STORE_FRAME_KIND = 'store' as const"));
        assert!(
            ts.contains("export const STORE_MIRROR_EVENT_CHANNEL = 'storeMirrorEvent' as const")
        );
    }

    #[test]
    fn store_frame_golden_ops_write_the_bytes_ts_wrote_and_are_acked_in_order() {
        let rig = rig();
        // The ops of the 85-01 golden `cache-ops-dotpath-intkey`, as the sidecar's mirror sends them.
        let frames = [
            frame(
                1,
                TRACER,
                "set",
                Some("480"),
                Some(r#"{"title":"Half-Life","score":96,"tags":["fps","classic"]}"#),
            ),
            frame(2, TRACER, "set", Some("480.title"), Some(r#""x""#)),
            frame(
                3,
                TRACER,
                "set",
                Some("__timestamp.480"),
                Some("1700000000000"),
            ),
            frame(4, TRACER, "delete", Some("480.title"), None),
        ];
        for f in frames {
            send(&rig, f);
        }
        settle(&rig);

        let written = fs::read(rig.home.root().join("store_cache/wikigameinfo.json")).unwrap();
        let expected = fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/crates/gamelib-store/tests/fixtures/golden/expected/cache-ops-dotpath-intkey/store_cache/wikigameinfo.json"
        ))
        .unwrap();
        assert_eq!(
            String::from_utf8_lossy(&written),
            String::from_utf8_lossy(&expected),
            "the file Rust wrote differs from the bytes the TS store wrote for the same ops"
        );
        assert_eq!(written, expected);

        let events = lock(&rig.events);
        let seqs: Vec<(u64, u64, &str)> = events
            .iter()
            .map(|e| {
                (
                    e["originSeq"].as_u64().unwrap(),
                    e["rev"].as_u64().unwrap(),
                    e["op"].as_str().unwrap(),
                )
            })
            .collect();
        assert_eq!(
            seqs,
            vec![
                (1, 1, "applied"),
                (2, 2, "applied"),
                (3, 3, "applied"),
                (4, 4, "applied")
            ]
        );
        assert!(events.iter().all(|e| e["store"] == TRACER));
        assert!(lock(&rig.logs).is_empty(), "{:?}", lock(&rig.logs));
    }

    #[test]
    fn store_frame_for_a_store_rust_does_not_own_is_refused_not_owned_and_writes_nothing() {
        // `store/config` is not flipped; the whole mode off refuses even the tracer.
        let rig = rig();
        send(&rig, frame(1, "store/config", "set", Some("k"), Some("1")));
        let ts_mode = rig_with(tracer_ownership(), StoreMode::Ts);
        send(&ts_mode, frame(1, TRACER, "set", Some("k"), Some("1")));
        settle(&rig);
        settle(&ts_mode);
        for r in [&rig, &ts_mode] {
            let events = lock(&r.events);
            assert_eq!(events.len(), 1);
            assert_eq!(events[0]["op"], "refused");
            assert_eq!(events[0]["reason"], "not-owned");
            assert_eq!(events[0]["originSeq"], 1);
            assert!(!r.home.root().join("store").exists());
            assert!(!r.home.root().join("store_cache").exists());
        }
    }

    #[test]
    fn store_frame_for_the_native_and_excluded_stores_is_never_owned() {
        let all = Ownership::parse(
            r#"{"families":{"cache":true,"user-state":true,"account":true,"settings":true},"stores":{"store/migrations":true}}"#,
        )
        .unwrap();
        let rig = rig_with(all, StoreMode::Rust);
        send(
            &rig,
            frame(1, "store/uploadedLogs", "set", Some("k"), Some("1")),
        );
        send(
            &rig,
            frame(2, "store/migrations", "set", Some("k"), Some("1")),
        );
        settle(&rig);
        let events = lock(&rig.events);
        assert_eq!(events.len(), 2);
        assert!(events.iter().all(|e| e["reason"] == "not-owned"));
    }

    #[test]
    fn store_frame_rejected_is_logged_by_category_only_and_nacked() {
        let rig = rig();
        send(
            &rig,
            frame(
                7,
                TRACER,
                "set",
                Some("__internal__.gamelib"),
                Some(r#""SECRET-TOKEN""#),
            ),
        );
        let logs = lock(&rig.logs);
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0], "WARN: store frame rejected: reserved-key");
        assert!(!logs[0].contains("SECRET"));
        let events = lock(&rig.events);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["op"], "refused");
        assert_eq!(events[0]["reason"], "rejected");
        assert_eq!(events[0]["originSeq"], 7);
        // Nothing was queued, so no worker ran and nothing was written.
        assert!(!rig.home.root().join("store_cache").exists());
    }

    #[test]
    fn store_frame_without_a_readable_seq_is_logged_and_not_nacked() {
        let rig = rig();
        send(
            &rig,
            json!({ "kind": "store", "store": TRACER, "op": "clear" }),
        );
        send(
            &rig,
            json!({ "kind": "store", "seq": 0, "store": TRACER, "op": "clear" }),
        );
        assert_eq!(lock(&rig.logs).len(), 2);
        assert!(lock(&rig.events).is_empty());
    }

    #[test]
    fn store_frame_apply_failures_are_refused_with_their_reason() {
        let rig = rig();
        // A newer-than-supported file opens read-only: the apply is refused and the file untouched.
        let dir = rig.home.root().join("store_cache");
        fs::create_dir_all(&dir).unwrap();
        let newer = br#"{"a":1,"__internal__":{"gamelib":{"schemaVersion":999}}}"#;
        fs::write(dir.join("wikigameinfo.json"), newer).unwrap();
        send(&rig, frame(1, TRACER, "set", Some("a"), Some("2")));
        settle(&rig);
        let events = lock(&rig.events);
        assert_eq!(events[0]["op"], "refused");
        assert_eq!(events[0]["reason"], "read-only");
        assert_eq!(fs::read(dir.join("wikigameinfo.json")).unwrap(), newer);
    }

    #[test]
    fn store_frame_worker_holds_the_store_registrant_until_the_queue_is_empty() {
        let rig = rig();
        send(&rig, frame(1, TRACER, "set", Some("a"), Some("1")));
        settle(&rig);
        // Everything applied: the registrant is released, so a drain returns at once.
        assert!(rig.shutdown.drain(Duration::from_millis(500)).is_empty());
        let _ = &rig.host;
    }

    const VECTORS: &str = include_str!("../../src/common/__fixtures__/storeFrameVectors.json");

    fn vectors() -> Value {
        serde_json::from_str(VECTORS).unwrap()
    }

    /// The frame a vector names: a `generate` stanza is expanded into a `set` whose `valueJson` is
    /// that many ASCII bytes (a JSON string).
    fn frame_of(vector: &Value) -> Value {
        let frame = &vector["frame"];
        match frame.get("generate") {
            Some(g) => {
                let n = usize::try_from(g["valueJsonBytes"].as_u64().unwrap()).unwrap();
                let text = format!("\"{}\"", "a".repeat(n - 2));
                frame_value(1, "store/config", "set", Some("k"), Some(&text))
            }
            None => frame.clone(),
        }
    }

    fn frame_value(
        seq: u64,
        store: &str,
        op: &str,
        key: Option<&str>,
        value_json: Option<&str>,
    ) -> Value {
        frame(seq, store, op, key, value_json)
    }

    #[test]
    fn store_frame_every_valid_vector_parses() {
        let doc = vectors();
        assert_eq!(doc["maxFrameBytes"], MAX_FRAME_BYTES);
        let valid = doc["valid"].as_array().unwrap();
        assert!(valid.len() >= 16, "the vectors cannot pass vacuously");
        for vector in valid {
            let frame = frame_of(vector);
            let len = serde_json::to_string(&frame).unwrap().len();
            let parsed = parse_store_frame(len, &frame);
            assert!(
                parsed.is_ok(),
                "{}: {:?}",
                vector["name"].as_str().unwrap(),
                parsed.err()
            );
        }
    }

    #[test]
    fn store_frame_every_invalid_vector_is_rejected_with_exactly_its_reason() {
        let doc = vectors();
        let invalid = doc["invalid"].as_array().unwrap();
        assert!(invalid.len() >= 31, "the vectors cannot pass vacuously");
        let mut seen = std::collections::BTreeSet::new();
        for vector in invalid {
            let frame = frame_of(vector);
            let len = serde_json::to_string(&frame).unwrap().len();
            let want = vector["reason"].as_str().unwrap();
            let got = parse_store_frame(len, &frame)
                .map(|_| "accepted")
                .map_err(|r| r.as_str());
            assert_eq!(got, Err(want), "{}", vector["name"].as_str().unwrap());
            seen.insert(want.to_string());
        }
        // All nine reason categories are exercised, including the generated oversized frame.
        assert_eq!(seen.len(), 9, "{seen:?}");
        assert!(seen.contains("too-large"));
    }

    #[test]
    fn store_frame_a_valid_vector_keeps_nested_key_order_and_big_numbers_as_text() {
        let doc = vectors();
        let first = &doc["valid"][0];
        let text = first["frame"]["valueJson"].as_str().unwrap();
        let parsed = parse_store_frame(text.len(), &first["frame"]).unwrap();
        let FrameOp::Set { value, .. } = parsed.op else {
            panic!("a set vector")
        };
        // The ordered parser keeps the order serde_json::Value would sort away.
        assert_eq!(
            String::from_utf8(gamelib_store::json::to_compact_bytes(&value)).unwrap(),
            text
        );
    }

    #[test]
    fn store_frame_the_queue_flush_is_answered_only_after_every_earlier_frame_is_applied() {
        let gate = Gate::new(false);
        let rig = rig_over(
            gated_host(&gate, false),
            tracer_ownership(),
            StoreMode::Rust,
        );
        for (i, key) in ["a", "b", "c"].iter().enumerate() {
            send(
                &rig,
                frame(i as u64 + 1, TRACER, "set", Some(key), Some("1")),
            );
        }
        send(&rig, frame(4, TRACER, "flush", None, None));
        gate.wait_entered(1);
        assert!(
            lock(&rig.events).is_empty(),
            "nothing is answered while the first apply is still writing"
        );
        gate.release();
        settle(&rig);
        let events = lock(&rig.events);
        let order: Vec<(u64, &str)> = events
            .iter()
            .map(|e| (e["originSeq"].as_u64().unwrap(), e["op"].as_str().unwrap()))
            .collect();
        assert_eq!(
            order,
            vec![
                (1, "applied"),
                (2, "applied"),
                (3, "applied"),
                (4, "flushed")
            ]
        );
    }

    #[test]
    fn store_frame_a_failed_persist_is_refused_io_consumes_no_rev_and_leaves_no_file() {
        let gate = Gate::new(true);
        let rig = rig_over(gated_host(&gate, true), tracer_ownership(), StoreMode::Rust);
        send(&rig, frame(1, TRACER, "set", Some("a"), Some("1")));
        send(&rig, frame(2, TRACER, "set", Some("b"), Some("2")));
        settle(&rig);
        let events = lock(&rig.events);
        assert_eq!(events[0]["op"], "refused");
        assert_eq!(events[0]["reason"], "io");
        assert_eq!(events[0]["originSeq"], 1);
        // The failed write consumed no rev: the next change is rev 1, not 2 (S1 rule 1).
        assert_eq!(events[1]["op"], "applied");
        assert_eq!(events[1]["rev"], 1);
        let written =
            fs::read_to_string(rig.home.root().join("store_cache/wikigameinfo.json")).unwrap();
        assert!(!written.contains("\"a\""), "{written}");
        assert!(written.contains("\"b\""), "{written}");
    }

    #[test]
    fn store_frame_worker_holds_a_store_registrant_while_frames_are_queued_and_releases_it_when_empty(
    ) {
        let gate = Gate::new(false);
        let rig = rig_over(
            gated_host(&gate, false),
            tracer_ownership(),
            StoreMode::Rust,
        );
        send(&rig, frame(1, TRACER, "set", Some("a"), Some("1")));
        send(&rig, frame(2, TRACER, "set", Some("b"), Some("2")));
        gate.wait_entered(1);
        // Held while the queue is non-empty and a frame is mid-apply: a drain names it.
        assert_eq!(rig.shutdown.drain(Duration::from_millis(60)), vec!["store"]);
        // `wait_idle(bound)` reports frames remaining past the bound.
        assert!(!rig.dispatcher.wait_idle(Duration::from_millis(40)));
        gate.release();
        settle(&rig);
        assert!(rig.shutdown.drain(Duration::from_millis(500)).is_empty());
        assert_eq!(rig.host.in_flight(), 0);
        // A later frame takes the registrant again and releases it again.
        send(&rig, frame(3, TRACER, "set", Some("c"), Some("3")));
        settle(&rig);
        assert!(rig.shutdown.drain(Duration::from_millis(500)).is_empty());
    }

    #[test]
    fn store_frame_queue_high_water_is_logged_once_per_crossing_and_never_drops_a_frame() {
        let gate = Gate::new(false);
        let rig = rig_over(
            gated_host(&gate, false),
            tracer_ownership(),
            StoreMode::Rust,
        );
        // The first frame is taken by the worker and held at the gate; the rest queue behind it.
        send(&rig, frame(1, TRACER, "set", Some("k0"), Some("0")));
        gate.wait_entered(1);
        let total = STORE_QUEUE_HIGH_WATER + 40;
        for i in 0..total {
            let key = format!("k{}", i + 1);
            send(
                &rig,
                frame(i as u64 + 2, TRACER, "set", Some(&key), Some("1")),
            );
        }
        let lines: Vec<String> = lock(&rig.logs)
            .iter()
            .filter(|l| l.contains("store queue high-water"))
            .cloned()
            .collect();
        assert_eq!(
            lines,
            vec![format!(
                "WARN: store queue high-water: {} frames queued",
                STORE_QUEUE_HIGH_WATER + 1
            )]
        );
        gate.release();
        settle(&rig);
        // Every frame was applied and answered: the queue never drops a store write.
        let events = lock(&rig.events);
        assert_eq!(events.len(), total + 1);
        assert!(events.iter().all(|e| e["op"] == "applied"));
        let seqs: Vec<u64> = events
            .iter()
            .map(|e| e["originSeq"].as_u64().unwrap())
            .collect();
        assert_eq!(seqs, (1..=total as u64 + 1).collect::<Vec<_>>());
    }
}
