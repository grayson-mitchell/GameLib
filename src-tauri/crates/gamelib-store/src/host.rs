//! The store host: one owner per store file (Phase 84 `StoreHost`, widened here in Phase 85, D-13).
//!
//! It moved from `gamelib-core::store` (core holds traits only) and keeps the method shapes
//! (`open_cache`, `get`, `set`, `remove`, `snapshot`, `on_change`), the in-memory rollback when a
//! persist fails, the 0600 files and 0700 new directories, and the atomic write with a direct-write
//! fallback (those last three now live in [`crate::atomic`]). What changed is the value type, the
//! ordered [`Json`] (a `serde_json::Value` cannot hold a nested object's key order), and that a file
//! is decided on open by the version [`engine`](crate::engine) and written in the exact bytes the TS
//! store stack wrote: a conf store is tab-indented and carries the `__internal__` version envelope,
//! a settings document is two-space. A Phase 84 file (2-space, no envelope) is adopted without a
//! write and becomes tab plus envelope on the next change.
//!
//! The envelope is the engine's namespace: [`Store::get`] never finds it, [`Store::snapshot`] never
//! lists it, and a write that names it is refused.
//!
//! Writes: [`Store::apply`] takes the store's lock, applies the op, persists (`sync_all` for every
//! kind but a cache, D-21), assigns the next `rev` and pushes the [`StoreChange`] onto the host's one
//! event queue, all before the lock is released. That is the ordering rule: a change is never
//! announced after its lock is gone, so another writer's change cannot overtake it. One dispatcher
//! thread (`store-events`, started with the first listener) drains the queue and calls each
//! listener in order, holding no lock while it does, so a listener may call back into the store.
//! The dispatcher is idle, not in-flight work, and holds no shutdown registrant; in-flight work is
//! the applies, counted by [`StoreHost::in_flight`] for the exit drain.

use std::collections::HashMap;
use std::io;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::time::{Duration, Instant, SystemTime};

use crate::atomic::{write_atomic, Durability};
use crate::engine::{open_file, Flavour, OpenOutcome, ReadOnlyReason, StoreKind};
use crate::envelope::{set_settings_version, stamp_for_write, RESERVED_KEY};
use crate::json::{to_settings_bytes, to_store_bytes, Json, Obj};
use crate::migrate::Chains;
use crate::ops::{self, Op, OpReject};
use crate::table::{row_for_key, Family, Kind, TableRow};

/// Who asked for a change.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Origin {
    /// A Rust module of the shell.
    Rust,
    /// The sidecar's mirror; `seq` is its frame number, echoed so it can match an ack.
    Sidecar { seq: u64 },
    /// The renderer, through a native handler.
    Renderer,
}

/// What a change did, without the value: a store holds tokens, and an event is logged and queued.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OpSummary {
    Set { key: String },
    Delete { key: String },
    Clear,
    Replace,
}

impl OpSummary {
    fn of(op: &Op) -> OpSummary {
        match op {
            Op::Set { key, .. } => OpSummary::Set { key: key.clone() },
            Op::Delete { key } => OpSummary::Delete { key: key.clone() },
            Op::Clear => OpSummary::Clear,
            Op::Replace(_) => OpSummary::Replace,
        }
    }
}

/// A change that is on disk. `rev` counts a store's changes from 1 and is strictly increasing in
/// delivery order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoreChange {
    /// The store table key.
    pub store: String,
    pub rev: u64,
    pub op: OpSummary,
    pub origin: Origin,
}

/// Why an [`Store::apply`] did not change the store. None of these wrote a byte or fired an event.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApplyError {
    ReadOnly(ReadOnlyReason),
    /// The store's directory was evicted (the profile is being replaced); it takes no more writes.
    Evicted,
    Rejected(OpReject),
    /// The write failed; the in-memory view was restored.
    Io(io::ErrorKind),
}

impl From<ApplyError> for io::Error {
    fn from(e: ApplyError) -> io::Error {
        match e {
            ApplyError::ReadOnly(_) => {
                io::Error::new(io::ErrorKind::PermissionDenied, "store is read-only")
            }
            ApplyError::Evicted => io::Error::other("store was evicted"),
            ApplyError::Rejected(r) => {
                io::Error::new(io::ErrorKind::InvalidInput, format!("{r:?}"))
            }
            ApplyError::Io(kind) => io::Error::from(kind),
        }
    }
}

type Listener = Arc<dyn Fn(&StoreChange) + Send + Sync>;

/// Locks, ignoring poisoning: a listener that panicked must not make the store unreadable.
fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// The write seam: how bytes reach the disk. The default is [`write_atomic`]; a test injects one to
/// observe the durability asked for, to fail a write, or to hold one open.
pub type Writer = Arc<dyn Fn(&Path, &[u8], Durability) -> io::Result<()> + Send + Sync>;

fn default_writer() -> Writer {
    Arc::new(write_atomic)
}

/// A queued change and the store it came from (listeners can be bound to one store).
struct Queued {
    store_id: u64,
    change: StoreChange,
}

/// Which stores a listener hears: one, or every store of the host.
type Listeners = Arc<Mutex<Vec<(Option<u64>, Listener)>>>;

/// The host's one event queue and its dispatcher.
#[derive(Default)]
struct Dispatch {
    listeners: Listeners,
    tx: Mutex<Option<Sender<Queued>>>,
}

impl Dispatch {
    /// Registers a listener, and starts the dispatcher with the first one. Changes made before the
    /// first listener are not queued: nobody could hear them.
    fn add(&self, store_id: Option<u64>, f: Listener) {
        lock(&self.listeners).push((store_id, f));
        let mut tx = lock(&self.tx);
        if tx.is_some() {
            return;
        }
        let (sender, receiver) = channel::<Queued>();
        let listeners = Arc::clone(&self.listeners);
        let spawned = std::thread::Builder::new()
            .name("store-events".to_string())
            .spawn(move || {
                while let Ok(queued) = receiver.recv() {
                    // Cloned out of the lock: a listener may register another, or write.
                    let heard: Vec<Listener> = lock(&listeners)
                        .iter()
                        .filter(|(only, _)| match only {
                            None => true,
                            Some(id) => *id == queued.store_id,
                        })
                        .map(|(_, l)| Arc::clone(l))
                        .collect();
                    for listener in heard {
                        // A listener that panics must not end delivery for every store.
                        let _ = catch_unwind(AssertUnwindSafe(|| listener(&queued.change)));
                    }
                }
            });
        if spawned.is_ok() {
            *tx = Some(sender);
        }
    }

    /// Called with the store's lock held, which is what orders delivery by `rev`.
    fn enqueue(&self, store_id: u64, change: StoreChange) {
        if let Some(tx) = lock(&self.tx).as_ref() {
            let _ = tx.send(Queued { store_id, change });
        }
    }
}

/// How many applies are running (waiting for a store's lock included), for the exit drain.
#[derive(Default)]
struct Idle {
    count: Mutex<usize>,
    cv: Condvar,
}

struct InFlight<'a>(&'a Idle);

impl<'a> InFlight<'a> {
    fn enter(idle: &'a Idle) -> InFlight<'a> {
        *lock(&idle.count) += 1;
        InFlight(idle)
    }
}

impl Drop for InFlight<'_> {
    fn drop(&mut self) {
        let mut n = lock(&self.0.count);
        *n -= 1;
        if *n == 0 {
            self.0.cv.notify_all();
        }
    }
}

/// The mutable part of a store, behind its lock.
struct StoreState {
    /// The document as on disk, envelope included; reads go through `ops::get`, which hides it.
    view: Json,
    /// The version a write stamps: the chain's current version.
    version: u32,
    /// Changes applied since open.
    rev: u64,
    /// Writes are refused while this is set; the file's bytes are never touched.
    read_only: Option<(ReadOnlyReason, String)>,
    /// The directory was evicted: the view is dropped and writes are refused.
    evicted: bool,
}

/// One store file. Keys follow the row's `dot_paths`; the top-level order is the file's order.
pub struct Store {
    id: u64,
    path: PathBuf,
    key: String,
    kind: StoreKind,
    dot_paths: bool,
    flavour: Flavour,
    outcome: OpenOutcome,
    state: Mutex<StoreState>,
    dispatch: Arc<Dispatch>,
    idle: Arc<Idle>,
    writer: Writer,
}

impl Store {
    /// The store table key (`store/uploadedLogs`).
    pub fn key(&self) -> &str {
        &self.key
    }

    /// What opening the file decided (adopt, migrate, read-only, ...).
    pub fn open_outcome(&self) -> &OpenOutcome {
        &self.outcome
    }

    /// The value at `key`; the reserved `__internal__` key reads as absent.
    pub fn get(&self, key: &str) -> Option<Json> {
        let st = lock(&self.state);
        ops::get(&st.view, key, self.dot_paths).cloned()
    }

    /// Persists atomically, then queues the change. On a persist failure the in-memory view is
    /// rolled back, so memory never claims what the disk does not hold. Setting a key to the value
    /// it already holds writes nothing and fires nothing.
    pub fn set(&self, key: &str, value: Json) -> io::Result<()> {
        self.apply_inner(
            Op::Set {
                key: key.to_string(),
                value,
            },
            Origin::Rust,
        )
        .map(|_| ())
        .map_err(io::Error::from)
    }

    /// `Ok(true)` when the key was present (the file is rewritten without it and the change is
    /// queued), `Ok(false)` when it was absent (nothing is written, nothing is queued).
    pub fn remove(&self, key: &str) -> io::Result<bool> {
        self.apply_inner(
            Op::Delete {
                key: key.to_string(),
            },
            Origin::Rust,
        )
        .map(|(_, changed)| changed)
        .map_err(io::Error::from)
    }

    /// Applies `op`: refuses a read-only or evicted store, persists a change (synced by kind), and
    /// returns the store's `rev`. An op that changes nothing writes nothing and returns the
    /// current `rev`.
    pub fn apply(&self, op: Op, origin: Origin) -> Result<u64, ApplyError> {
        self.apply_inner(op, origin).map(|(rev, _)| rev)
    }

    fn apply_inner(&self, op: Op, origin: Origin) -> Result<(u64, bool), ApplyError> {
        let _flight = InFlight::enter(&self.idle);
        let mut st = lock(&self.state);
        if st.evicted {
            return Err(ApplyError::Evicted);
        }
        if let Some((reason, _)) = st.read_only {
            return Err(ApplyError::ReadOnly(reason));
        }
        // A settings document is written whole (`writeSettingsFile`), so only a replace reaches it.
        if self.flavour == Flavour::Settings && !matches!(op, Op::Replace(_)) {
            return Err(ApplyError::Rejected(OpReject::NotReplace));
        }
        let previous = st.view.clone();
        let changed = match ops::apply(&mut st.view, &op, self.dot_paths) {
            Ok(changed) => changed,
            Err(reject) => {
                st.view = previous;
                return Err(ApplyError::Rejected(reject));
            }
        };
        if !changed {
            return Ok((st.rev, false));
        }
        if let Err(e) = self.persist(&mut st) {
            st.view = previous;
            return Err(ApplyError::Io(e.kind()));
        }
        st.rev += 1;
        let rev = st.rev;
        // Still under the store's lock: the next writer cannot get a rev, or queue, before this.
        self.dispatch.enqueue(
            self.id,
            StoreChange {
                store: self.key.clone(),
                rev,
                op: OpSummary::of(&op),
                origin,
            },
        );
        Ok((rev, true))
    }

    /// Every top-level `(key, value)` in file order, without the `__internal__` envelope; a key set
    /// after open is at the end.
    pub fn snapshot(&self) -> Vec<(String, Json)> {
        self.snapshot_with_rev().0
    }

    /// [`Store::snapshot`] and [`Store::rev`] read under one lock, so the rev names exactly the
    /// state the entries show (the renderer's fetch result carries both, 85-16).
    pub fn snapshot_with_rev(&self) -> (Vec<(String, Json)>, u64) {
        let st = lock(&self.state);
        let entries = match &st.view {
            Json::Obj(o) => o
                .iter()
                .filter(|(k, _)| k.as_str() != RESERVED_KEY)
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect(),
            _ => Vec::new(),
        };
        (entries, st.rev)
    }

    /// Calls `f` for every change of this store, in `rev` order, on the host's dispatcher thread.
    pub fn on_change(&self, f: Box<dyn Fn(&StoreChange) + Send + Sync>) {
        self.dispatch.add(Some(self.id), Arc::from(f));
    }

    /// The reason writes are refused, if they are.
    pub fn read_only(&self) -> Option<ReadOnlyReason> {
        lock(&self.state).read_only.as_ref().map(|(r, _)| *r)
    }

    /// Changes applied since this store was opened.
    pub fn rev(&self) -> u64 {
        lock(&self.state).rev
    }

    /// Writes the view in this store's byte layout, version stamped. `view` is replaced by the
    /// stamped document only once the bytes are on disk.
    fn persist(&self, st: &mut StoreState) -> io::Result<()> {
        let (stamped, bytes) = match self.flavour {
            Flavour::Store => {
                let stamped = stamp_for_write(&st.view, st.version);
                let bytes = to_store_bytes(&stamped);
                (stamped, bytes)
            }
            Flavour::Settings => {
                let mut stamped = st.view.clone();
                set_settings_version(&mut stamped, st.version);
                let bytes = to_settings_bytes(&stamped);
                (stamped, bytes)
            }
        };
        (self.writer)(&self.path, &bytes, durability_of(self.kind))?;
        st.view = stamped;
        Ok(())
    }
}

/// D-21: user data is `sync_all`-ed before it replaces the file, a rebuildable cache is not.
fn durability_of(kind: StoreKind) -> Durability {
    match kind {
        StoreKind::Cache => Durability::Unsynced,
        StoreKind::UserState | StoreKind::Account | StoreKind::Settings => Durability::Synced,
    }
}

/// The engine kind a row opens as. `None` is a row Rust never opens (`store/migrations`, D-07).
fn engine_kind(row: &TableRow) -> Option<StoreKind> {
    match row.family {
        Family::Excluded => None,
        // `uploadedLogs` is owned by a Rust module but is still a cache of its own kind.
        Family::Native => Some(match row.kind {
            Kind::Cache => StoreKind::Cache,
            Kind::UserState => StoreKind::UserState,
        }),
        _ => row.store_kind(),
    }
}

/// The row a runtime cache store (one the table does not list) opens with. The shell's store
/// dispatcher builds the same row to decide ownership of a `store_cache/<name>` frame.
pub fn runtime_cache_row(key: String, dir: &str, name: &str) -> TableRow {
    TableRow {
        key,
        dir: dir.to_string(),
        name: Some(name.to_string()),
        ts_names: Vec::new(),
        kind: Kind::Cache,
        family: Family::Cache,
        token_bearing: false,
        dot_paths: true,
        flavour: Flavour::Store,
        chain: None,
    }
}

/// D-13 / T-85-34: the port of `store_backend.ts`'s `tightenTokenPaths`. A token-bearing store's
/// existing file becomes 0600 and its directory 0700, each only when it carries group or other
/// bits. Runs on open, before the file is read, and only on unix (Windows has no such modes; its
/// files are left untouched). A missing file or directory is skipped. A failure is logged with the
/// store key and the error kind, never a path's contents or a value, and the open goes on.
fn tighten_token_paths(key: &str, path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let dir = path.parent();
        let targets = [(Some(path), 0o600), (dir, 0o700)];
        for (target, mode) in targets {
            let Some(target) = target else { continue };
            let result = match std::fs::metadata(target) {
                Ok(meta) if meta.permissions().mode() & 0o077 != 0 => {
                    std::fs::set_permissions(target, std::fs::Permissions::from_mode(mode))
                }
                Ok(_) => Ok(()),
                Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
                Err(e) => Err(e),
            };
            if let Err(e) = result {
                eprintln!("store tighten failed: {key} {:?}", e.kind());
            }
        }
    }
    #[cfg(not(unix))]
    {
        let _ = (key, path);
    }
}

/// One plain path segment: what a `GamesConfig/<app>` name must be (`isContainedGameConfig` /
/// `isPlainAppName` on the TS side, `plain_name` in the shell's dispatcher): 1-255 bytes, not `.`
/// or `..`, no separator, NUL or `..` run.
fn plain_segment(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 255
        && name != "."
        && name != ".."
        && !name.contains(['/', '\\', '\0'])
        && !name.contains("..")
}

/// A file that is not a readable store: a cache that starts empty over it, or any store that opens
/// read-only because it could not be read, copied aside or migrated. (A `Newer` file is readable.)
fn unreadable(outcome: &OpenOutcome) -> bool {
    matches!(
        outcome,
        OpenOutcome::StartEmpty { .. }
            | OpenOutcome::ReadOnly {
                reason: ReadOnlyReason::Failed,
                ..
            }
    )
}

type Clock = Arc<dyn Fn() -> SystemTime + Send + Sync>;

/// Opens stores and hands out one `Arc<Store>` per file.
pub struct StoreHost {
    open: Mutex<HashMap<PathBuf, Arc<Store>>>,
    chains: Chains,
    now: Clock,
    writer: Writer,
    dispatch: Arc<Dispatch>,
    idle: Arc<Idle>,
    next_id: AtomicU64,
}

impl Default for StoreHost {
    fn default() -> Self {
        StoreHost::new()
    }
}

impl StoreHost {
    pub fn new() -> StoreHost {
        StoreHost::with_parts(Arc::new(SystemTime::now), default_writer())
    }

    /// A host whose side files (corrupt copy, pre-migration backup) are stamped by `now`.
    pub fn with_clock(now: Clock) -> StoreHost {
        StoreHost::with_parts(now, default_writer())
    }

    /// A host whose store writes go through `writer` (the test seam of [`Writer`]).
    pub fn with_writer(writer: Writer) -> StoreHost {
        StoreHost::with_parts(Arc::new(SystemTime::now), writer)
    }

    fn with_parts(now: Clock, writer: Writer) -> StoreHost {
        StoreHost {
            open: Mutex::new(HashMap::new()),
            chains: Chains::baseline(),
            now,
            writer,
            dispatch: Arc::new(Dispatch::default()),
            idle: Arc::new(Idle::default()),
            next_id: AtomicU64::new(1),
        }
    }

    /// Calls `f` for every change of every store of this host, in each store's `rev` order. Stores
    /// opened later are heard too.
    pub fn on_any_change(&self, f: Box<dyn Fn(&StoreChange) + Send + Sync>) {
        self.dispatch.add(None, Arc::from(f));
    }

    /// How many applies are running right now.
    pub fn in_flight(&self) -> usize {
        *lock(&self.idle.count)
    }

    /// Waits up to `bound` for every running apply to finish. `true` when the host is idle,
    /// `false` when something is still writing at the deadline.
    pub fn wait_idle(&self, bound: Duration) -> bool {
        let deadline = Instant::now() + bound;
        let mut n = lock(&self.idle.count);
        while *n > 0 {
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                return false;
            }
            n = self
                .idle
                .cv
                .wait_timeout(n, left)
                .unwrap_or_else(|e| e.into_inner())
                .0;
        }
        true
    }

    /// Marks every open store whose file is at or under `path` evicted: its view is dropped and it
    /// takes no more writes, so a profile being replaced is not written back over. The stores are
    /// forgotten too, so a later open reads the new files. Returns how many were evicted.
    pub fn evict_path(&self, path: &Path) -> usize {
        let mut open = lock(&self.open);
        let doomed: Vec<PathBuf> = open
            .keys()
            .filter(|p| p.starts_with(path))
            .cloned()
            .collect();
        for p in &doomed {
            if let Some(store) = open.remove(p) {
                let mut st = lock(&store.state);
                st.evicted = true;
                st.view = Json::Obj(Obj::new());
            }
        }
        doomed.len()
    }

    /// Every open store that refuses writes, as `(key, reason, detail)`, ordered by key. The
    /// detail names versions and error kinds, never a value.
    pub fn read_only_entries(&self) -> Vec<(String, ReadOnlyReason, String)> {
        let mut entries: Vec<(String, ReadOnlyReason, String)> = lock(&self.open)
            .values()
            .filter_map(|store| {
                lock(&store.state)
                    .read_only
                    .as_ref()
                    .map(|(reason, detail)| (store.key.clone(), *reason, detail.clone()))
            })
            .collect();
        entries.sort_by(|a, b| a.0.cmp(&b.0));
        entries
    }

    /// Opens `<dir>/<name>.json` as the table row `<dir's name>/<name>` (a cache row with dot paths
    /// for a store the table does not list). A missing file is an empty store (nothing is written
    /// until the first change). A file that is not a JSON object is left untouched and is
    /// `InvalidData`: this entry point never lets a corrupt file be overwritten (Phase 84). A store
    /// the host never opens from Rust (`store/migrations`, D-07) is `InvalidInput`.
    pub fn open_cache(&self, dir: &Path, name: &str) -> io::Result<Arc<Store>> {
        if name.is_empty() || name.contains(['/', '\\', '\0']) || name.contains("..") {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "store name must be one plain file name",
            ));
        }
        let path = dir.join(format!("{name}.json"));
        let dir_name = dir.file_name().and_then(|n| n.to_str()).unwrap_or_default();
        let key = format!("{dir_name}/{name}");
        let row = match row_for_key(&key) {
            Some(row) => row.clone(),
            None => runtime_cache_row(key, dir_name, name),
        };
        self.open_inner(&row, path, true)
    }

    /// Opens a settings document: `settings/global` (`<appFolder>/config.json`) or
    /// `GamesConfig/<app>` (`<appFolder>/GamesConfig/<app>.json`), at `path`, which the caller
    /// resolves. It is a settings-flavour store under `key` itself (so a read-only report and a
    /// change name the document, not the `settings/game` pattern row): two-space bytes with no
    /// trailing newline, the top-level `version: 'vN'` string stamped by its chain
    /// (`settings/global` or `settings/game`), `sync_all` on write (D-21), and only a whole-document
    /// [`Op::Replace`] is applied (a set, delete or clear is [`OpReject::NotReplace`]). A
    /// `GamesConfig` app name must be one plain path segment (T-85-37), else `InvalidInput` and
    /// nothing is opened. Like [`StoreHost::open_row`], a file that cannot be read opens read-only
    /// rather than failing, and a missing one is an empty document written on the first replace.
    pub fn open_doc(&self, key: &str, path: PathBuf) -> io::Result<Arc<Store>> {
        let pattern = if key == "settings/global" {
            "settings/global"
        } else {
            match key.strip_prefix("GamesConfig/") {
                Some(app) if plain_segment(app) => "settings/game",
                _ => {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidInput,
                        "not a settings document key",
                    ))
                }
            }
        };
        let Some(row) = row_for_key(pattern) else {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "the store table has no settings document row",
            ));
        };
        let mut row = row.clone();
        row.key = key.to_string();
        self.open_inner(&row, path, false)
    }

    /// Opens the file at `path` as `row`, whatever the engine decides: a file that cannot be read
    /// opens read-only (or, for a cache, empty) instead of failing. The boot sweep and the family
    /// plans open stores this way.
    pub fn open_row(&self, row: &TableRow, path: PathBuf) -> io::Result<Arc<Store>> {
        self.open_inner(row, path, false)
    }

    fn open_inner(&self, row: &TableRow, path: PathBuf, strict: bool) -> io::Result<Arc<Store>> {
        let Some(kind) = engine_kind(row) else {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "this store is not opened from Rust",
            ));
        };
        let mut open = lock(&self.open);
        if let Some(store) = open.get(&path) {
            // A store the boot sweep opened as unreadable is still unreadable to the strict entry.
            if strict && unreadable(&store.outcome) {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "store file is not a readable store",
                ));
            }
            return Ok(Arc::clone(store));
        }
        if row.token_bearing {
            tighten_token_paths(&row.key, &path);
        }
        let opened = open_file(
            &path,
            row.flavour,
            kind,
            row.chain_key(),
            &self.chains,
            (self.now)(),
        );
        let read_only = match &opened.outcome {
            OpenOutcome::ReadOnly { reason, detail } => Some((*reason, detail.clone())),
            _ => None,
        };
        if strict && unreadable(&opened.outcome) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "store file is not a readable store",
            ));
        }
        let store = Arc::new(Store {
            id: self.next_id.fetch_add(1, Ordering::Relaxed),
            path: path.clone(),
            key: row.key.clone(),
            kind,
            dot_paths: row.dot_paths,
            flavour: row.flavour,
            outcome: opened.outcome,
            state: Mutex::new(StoreState {
                view: opened.view,
                version: opened.version,
                rev: 0,
                read_only,
                evicted: false,
            }),
            dispatch: Arc::clone(&self.dispatch),
            idle: Arc::clone(&self.idle),
            writer: Arc::clone(&self.writer),
        });
        open.insert(path, Arc::clone(&store));
        Ok(store)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::{parse, Num, Obj};
    use gamelib_testutil::FakeHome;
    use std::fs;
    use std::sync::atomic::AtomicUsize;
    use std::sync::mpsc;

    /// A v0.10 `uploadedLogs.json`: tab-indented, the version envelope last.
    const TS_SHAPED: &str = "{\n\t\"https://dpaste.com/ZZ99\": {\n\t\t\"name\": \"launch.log\",\n\t\t\"token\": \"1\",\n\t\t\"uploadedAt\": 1795133109000\n\t},\n\t\"https://dpaste.com/AA11\": {\n\t\t\"name\": \"gamelib.log\",\n\t\t\"token\": \"1\",\n\t\t\"uploadedAt\": 1795133100000\n\t},\n\t\"__internal__\": {\n\t\t\"gamelib\": {\n\t\t\t\"schemaVersion\": 1\n\t\t}\n\t}\n}";

    /// What Phase 84 wrote: 2-space, no envelope.
    const PHASE_84: &str = "{\n  \"https://dpaste.com/ZZ99\": {\n    \"name\": \"launch.log\",\n    \"token\": \"1\",\n    \"uploadedAt\": 1795133109000\n  }\n}";

    fn dir_of(home: &FakeHome) -> PathBuf {
        home.root().join("store")
    }

    fn seed(home: &FakeHome, text: &str) -> PathBuf {
        let dir = dir_of(home);
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("uploadedLogs.json");
        fs::write(&file, text).unwrap();
        file
    }

    fn entry(name: &str, at: u64) -> Json {
        let mut o = Obj::new();
        o.insert_js("name", Json::Str(name.to_string()));
        o.insert_js("token", Json::Str("1".to_string()));
        o.insert_js("uploadedAt", Json::Num(Num::U(at)));
        Json::Obj(o)
    }

    fn num(n: u64) -> Json {
        Json::Num(Num::U(n))
    }

    fn keys(store: &Store) -> Vec<String> {
        store.snapshot().into_iter().map(|(k, _)| k).collect()
    }

    fn open(home: &FakeHome) -> Arc<Store> {
        StoreHost::new()
            .open_cache(&dir_of(home), "uploadedLogs")
            .unwrap()
    }

    #[test]
    fn a_missing_file_opens_empty_and_writes_nothing_until_the_first_set() {
        let home = FakeHome::new("gamelib-store-host-");
        let store = open(&home);
        assert!(store.snapshot().is_empty());
        assert_eq!(store.get("k"), None);
        assert!(!dir_of(&home).exists());
        assert_eq!(store.key(), "store/uploadedLogs");
        assert_eq!(*store.open_outcome(), OpenOutcome::Missing);
    }

    #[test]
    fn a_v010_file_lists_without_internal_and_a_set_rewrites_it_with_the_same_bytes_and_order() {
        let home = FakeHome::new("gamelib-store-host-");
        let file = seed(&home, TS_SHAPED);
        let store = open(&home);
        assert_eq!(
            keys(&store),
            ["https://dpaste.com/ZZ99", "https://dpaste.com/AA11"]
        );
        assert_eq!(store.get("__internal__"), None);
        assert_eq!(
            store.get("https://dpaste.com/AA11"),
            Some(entry("gamelib.log", 1_795_133_100_000))
        );
        // Re-setting an existing key to its value changes nothing: nothing is written.
        store
            .set(
                "https://dpaste.com/ZZ99",
                entry("launch.log", 1_795_133_109_000),
            )
            .unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), TS_SHAPED);
        // The envelope keeps its place and a new key follows it, as a conf write does.
        store
            .set("https://dpaste.com/NEW1", entry("x.log", 5))
            .unwrap();
        let written = parse(fs::read(&file).unwrap().as_slice()).unwrap();
        let order: Vec<&str> = written
            .as_object()
            .unwrap()
            .iter()
            .map(|(k, _)| k.as_str())
            .collect();
        assert_eq!(
            order,
            [
                "https://dpaste.com/ZZ99",
                "https://dpaste.com/AA11",
                "__internal__",
                "https://dpaste.com/NEW1"
            ]
        );
        assert!(fs::read_to_string(&file).unwrap().starts_with("{\n\t\""));
    }

    #[test]
    fn a_phase_84_file_is_adopted_without_a_write_and_becomes_tab_plus_envelope_on_change() {
        let home = FakeHome::new("gamelib-store-host-");
        let file = seed(&home, PHASE_84);
        let before = fs::metadata(&file).unwrap().modified().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(30));
        let store = open(&home);
        assert_eq!(*store.open_outcome(), OpenOutcome::Adopted);
        assert_eq!(keys(&store), ["https://dpaste.com/ZZ99"]);
        assert_eq!(fs::read_to_string(&file).unwrap(), PHASE_84);
        assert_eq!(fs::metadata(&file).unwrap().modified().unwrap(), before);
        store.set("https://dpaste.com/B", num(1)).unwrap();
        assert_eq!(
            fs::read_to_string(&file).unwrap(),
            "{\n\t\"https://dpaste.com/ZZ99\": {\n\t\t\"name\": \"launch.log\",\n\t\t\"token\": \"1\",\n\t\t\"uploadedAt\": 1795133109000\n\t},\n\t\"https://dpaste.com/B\": 1,\n\t\"__internal__\": {\n\t\t\"gamelib\": {\n\t\t\t\"schemaVersion\": 1\n\t\t}\n\t}\n}"
        );
    }

    #[test]
    fn a_corrupt_file_is_left_byte_identical_and_reports_invalid_data() {
        let home = FakeHome::new("gamelib-store-host-");
        for bad in ["{not json", "[1, 2]", ""] {
            let file = seed(&home, bad);
            let err = StoreHost::new()
                .open_cache(&dir_of(&home), "uploadedLogs")
                .err()
                .expect("corrupt store must not open");
            assert_eq!(err.kind(), io::ErrorKind::InvalidData, "{bad:?}");
            assert_eq!(fs::read_to_string(&file).unwrap(), bad);
        }
    }

    #[test]
    fn a_newer_file_opens_read_only_and_every_write_is_refused() {
        let home = FakeHome::new("gamelib-store-host-");
        let newer = TS_SHAPED.replace("\"schemaVersion\": 1", "\"schemaVersion\": 9");
        let file = seed(&home, &newer);
        let store = open(&home);
        assert_eq!(store.read_only(), Some(ReadOnlyReason::Newer));
        assert!(store.set("k", num(1)).is_err());
        assert!(store.remove("https://dpaste.com/ZZ99").is_err());
        assert_eq!(fs::read_to_string(&file).unwrap(), newer);
    }

    #[test]
    fn migrations_json_is_never_opened_from_rust() {
        let home = FakeHome::new("gamelib-store-host-");
        let dir = dir_of(&home);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("migrations.json"), "{}").unwrap();
        let err = StoreHost::new()
            .open_cache(&dir, "migrations")
            .err()
            .expect("excluded row");
        assert_eq!(err.kind(), io::ErrorKind::InvalidInput);
        assert_eq!(
            fs::read_to_string(dir.join("migrations.json")).unwrap(),
            "{}"
        );
    }

    #[cfg(unix)]
    #[test]
    fn the_file_is_0600_and_a_new_directory_0700() {
        use std::os::unix::fs::PermissionsExt;
        let home = FakeHome::new("gamelib-store-host-");
        let store = open(&home);
        store.set("k", num(1)).unwrap();
        let mode = |p: &Path| fs::metadata(p).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(&dir_of(&home)), 0o700);
        assert_eq!(mode(&dir_of(&home).join("uploadedLogs.json")), 0o600);
    }

    #[test]
    fn the_same_dir_and_name_share_one_store_and_a_different_name_does_not() {
        let home = FakeHome::new("gamelib-store-host-");
        let host = StoreHost::new();
        let a = host.open_cache(&dir_of(&home), "uploadedLogs").unwrap();
        let b = host.open_cache(&dir_of(&home), "uploadedLogs").unwrap();
        let c = host.open_cache(&dir_of(&home), "other").unwrap();
        assert!(Arc::ptr_eq(&a, &b));
        assert!(!Arc::ptr_eq(&a, &c));
        a.set("k", Json::Str("v".into())).unwrap();
        assert_eq!(b.get("k"), Some(Json::Str("v".into())));
        assert_eq!(c.get("k"), None);
    }

    #[test]
    fn a_store_name_must_be_one_plain_file_name() {
        let home = FakeHome::new("gamelib-store-host-");
        for bad in ["", "a/b", "a\\b", "..", "a\0b"] {
            let err = StoreHost::new()
                .open_cache(&dir_of(&home), bad)
                .err()
                .expect("bad name");
            assert_eq!(err.kind(), io::ErrorKind::InvalidInput, "{bad:?}");
        }
    }

    #[test]
    fn remove_of_a_present_key_persists_without_it_and_an_absent_key_changes_nothing() {
        let home = FakeHome::new("gamelib-store-host-");
        let file = seed(&home, TS_SHAPED);
        let store = open(&home);
        assert!(!store.remove("https://dpaste.com/none").unwrap());
        assert_eq!(fs::read_to_string(&file).unwrap(), TS_SHAPED);
        assert!(store.remove("https://dpaste.com/ZZ99").unwrap());
        let text = fs::read_to_string(&file).unwrap();
        assert!(!text.contains("ZZ99") && text.contains("AA11"));
        assert_eq!(keys(&store), ["https://dpaste.com/AA11"]);
        assert!(store.remove("https://dpaste.com/AA11").unwrap());
        // An emptied store keeps its envelope.
        assert_eq!(
            fs::read_to_string(&file).unwrap(),
            "{\n\t\"__internal__\": {\n\t\t\"gamelib\": {\n\t\t\t\"schemaVersion\": 1\n\t\t}\n\t}\n}"
        );
        assert!(store.snapshot().is_empty());
    }

    #[test]
    fn a_write_naming_the_envelope_is_refused_and_changes_nothing() {
        let home = FakeHome::new("gamelib-store-host-");
        let file = seed(&home, TS_SHAPED);
        let store = open(&home);
        assert!(store.set("__internal__", num(1)).is_err());
        assert!(store.remove("__internal__").is_err());
        assert_eq!(fs::read_to_string(&file).unwrap(), TS_SHAPED);
    }

    #[test]
    fn a_url_key_with_dots_stays_one_key_because_the_row_has_dot_paths_off() {
        let home = FakeHome::new("gamelib-store-host-");
        let store = open(&home);
        store
            .set("https://paste.example.com/a.log", num(1))
            .unwrap();
        store.set("a.b", num(2)).unwrap();
        assert_eq!(store.get("a"), None);
        assert_eq!(store.get("a.b"), Some(num(2)));
        assert_eq!(keys(&store), ["https://paste.example.com/a.log", "a.b"]);
    }

    #[test]
    fn snapshot_is_in_file_order_with_a_new_key_appended_at_the_end() {
        let home = FakeHome::new("gamelib-store-host-");
        seed(&home, TS_SHAPED);
        let store = open(&home);
        store.set("https://dpaste.com/AAA0", num(1)).unwrap();
        assert_eq!(
            keys(&store),
            [
                "https://dpaste.com/ZZ99",
                "https://dpaste.com/AA11",
                "https://dpaste.com/AAA0"
            ]
        );
    }

    /// Polls until `cond` holds; the dispatcher is another thread.
    fn wait_until(what: &str, mut cond: impl FnMut() -> bool) {
        let deadline = Instant::now() + Duration::from_secs(10);
        while !cond() {
            assert!(Instant::now() < deadline, "timed out waiting for {what}");
            std::thread::sleep(Duration::from_millis(2));
        }
    }

    #[test]
    fn a_listener_fires_once_per_successful_set_and_remove_after_the_persist_and_not_for_a_no_op() {
        let home = FakeHome::new("gamelib-store-host-");
        let file = seed(&home, TS_SHAPED);
        let store = open(&home);
        let seen = Arc::new(Mutex::new(Vec::<(StoreChange, bool)>::new()));
        let sink = Arc::clone(&seen);
        let watched = file.clone();
        store.on_change(Box::new(move |c| {
            // On disk already: the file holds the key (set) or no longer does (removed).
            let text = fs::read_to_string(&watched).unwrap();
            let key = match &c.op {
                OpSummary::Set { key } | OpSummary::Delete { key } => key.clone(),
                other => panic!("unexpected {other:?}"),
            };
            let on_disk = match c.op {
                OpSummary::Set { .. } => text.contains(key.as_str()),
                _ => !text.contains(key.as_str()),
            };
            sink.lock().unwrap().push((c.clone(), on_disk));
        }));
        let delivered = |n: usize| {
            let seen = Arc::clone(&seen);
            wait_until("a change event", move || seen.lock().unwrap().len() >= n);
        };
        store.set("https://dpaste.com/N", num(1)).unwrap();
        delivered(1);
        store.remove("https://dpaste.com/none").unwrap();
        store.remove("https://dpaste.com/N").unwrap();
        delivered(2);
        std::thread::sleep(Duration::from_millis(50));
        let change = |rev: u64, op: OpSummary| StoreChange {
            store: "store/uploadedLogs".to_string(),
            rev,
            op,
            origin: Origin::Rust,
        };
        assert_eq!(
            seen.lock().unwrap().clone(),
            vec![
                (
                    change(
                        1,
                        OpSummary::Set {
                            key: "https://dpaste.com/N".into()
                        }
                    ),
                    true
                ),
                (
                    change(
                        2,
                        OpSummary::Delete {
                            key: "https://dpaste.com/N".into()
                        }
                    ),
                    true
                ),
            ]
        );
        assert_eq!(store.rev(), 2);
    }

    #[test]
    fn a_listener_may_call_back_into_the_store() {
        let home = FakeHome::new("gamelib-store-host-");
        let store = open(&home);
        let again = Arc::clone(&store);
        let count = Arc::new(AtomicUsize::new(0));
        let c = Arc::clone(&count);
        store.on_change(Box::new(move |_| {
            // Reads, and even writes, from inside a listener must not deadlock the dispatcher.
            let _ = again.get("k");
            c.store(again.snapshot().len(), Ordering::SeqCst);
        }));
        store.set("k", num(1)).unwrap();
        wait_until("the listener", || count.load(Ordering::SeqCst) == 1);
    }

    #[test]
    fn a_failed_persist_rolls_the_in_memory_value_back_fires_nothing_and_leaves_no_temp_file() {
        let home = FakeHome::new("gamelib-store-host-");
        let dir = dir_of(&home);
        let store = open(&home);
        store.set("k", num(1)).unwrap();
        // A directory where the file must go makes the temp write, the rename and the direct write
        // fail.
        fs::remove_file(dir.join("uploadedLogs.json")).unwrap();
        fs::create_dir(dir.join("uploadedLogs.json")).unwrap();
        let fired = Arc::new(AtomicUsize::new(0));
        let f = Arc::clone(&fired);
        store.on_change(Box::new(move |_| {
            f.fetch_add(1, Ordering::SeqCst);
        }));
        assert!(store.set("k", num(2)).is_err());
        assert!(store.set("new", num(3)).is_err());
        assert!(store.remove("k").is_err());
        assert_eq!(store.get("k"), Some(num(1)));
        assert_eq!(store.get("new"), None);
        assert_eq!(fired.load(Ordering::SeqCst), 0);
        let leftovers: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|n| n.contains(".tmp"))
            .collect();
        assert!(leftovers.is_empty(), "{leftovers:?}");
    }

    // ---- apply, ordering, durability, read-only, eviction, in-flight (85-09 task 2) ----

    /// Opens the table row `key` under `home` at its own `<dir>/<name>.json`.
    fn open_row_at(host: &StoreHost, home: &FakeHome, key: &str) -> Arc<Store> {
        let row = row_for_key(key).unwrap_or_else(|| panic!("no row {key}"));
        let file = format!("{}.json", row.name.as_deref().unwrap());
        host.open_row(row, home.root().join(&row.dir).join(file))
            .unwrap()
    }

    fn set_op(key: &str, value: Json) -> Op {
        Op::Set {
            key: key.to_string(),
            value,
        }
    }

    #[test]
    fn durability_follows_the_store_kind() {
        let home = FakeHome::new("gamelib-store-host-");
        let asked = Arc::new(Mutex::new(Vec::<(String, Durability)>::new()));
        let sink = Arc::clone(&asked);
        let host = StoreHost::with_writer(Arc::new(move |path, bytes, durability| {
            let name = path.file_name().unwrap().to_string_lossy().into_owned();
            sink.lock().unwrap().push((name, durability));
            write_atomic(path, bytes, durability)
        }));
        for (key, want) in [
            ("store_cache/steam_metadata", Durability::Unsynced),
            ("store_cache/steam_library", Durability::Synced),
            ("steam_store/config", Durability::Synced),
            ("store/config", Durability::Synced),
        ] {
            let store = open_row_at(&host, &home, key);
            store.apply(set_op("k", num(1)), Origin::Rust).unwrap();
            let last = asked.lock().unwrap().last().cloned().unwrap();
            assert_eq!(last.1, want, "{key}");
        }
        assert_eq!(asked.lock().unwrap().len(), 4);
    }

    #[test]
    fn eight_writer_threads_see_strictly_increasing_revs_in_delivery_order() {
        const THREADS: u64 = 8;
        const EACH: u64 = 200;
        let home = FakeHome::new("gamelib-store-host-");
        let host = Arc::new(StoreHost::new());
        let store = host.open_cache(&dir_of(&home), "uploadedLogs").unwrap();
        let revs = Arc::new(Mutex::new(Vec::<u64>::new()));
        let sink = Arc::clone(&revs);
        store.on_change(Box::new(move |c| sink.lock().unwrap().push(c.rev)));
        let writers: Vec<_> = (0..THREADS)
            .map(|t| {
                let store = Arc::clone(&store);
                std::thread::spawn(move || {
                    for n in 0..EACH {
                        store.set(&format!("t{t}-{n}"), num(n)).unwrap();
                    }
                })
            })
            .collect();
        for w in writers {
            w.join().unwrap();
        }
        let total = (THREADS * EACH) as usize;
        wait_until("every event", || revs.lock().unwrap().len() >= total);
        let delivered = revs.lock().unwrap().clone();
        assert_eq!(delivered, (1..=total as u64).collect::<Vec<_>>());
        assert_eq!(store.rev(), total as u64);
        // Neither write was lost: the file is the last view.
        let on_disk = parse(&fs::read(dir_of(&home).join("uploadedLogs.json")).unwrap()).unwrap();
        let on_disk = crate::envelope::strip_envelope(&on_disk);
        let in_file: Vec<(String, Json)> = on_disk
            .as_object()
            .unwrap()
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();
        assert_eq!(in_file, store.snapshot());
        assert_eq!(in_file.len(), total);
    }

    #[test]
    fn apply_carries_the_origin_and_never_the_value_and_a_no_op_returns_the_current_rev() {
        let home = FakeHome::new("gamelib-store-host-");
        let store = open(&home);
        let seen = Arc::new(Mutex::new(Vec::<StoreChange>::new()));
        let sink = Arc::clone(&seen);
        store.on_change(Box::new(move |c| sink.lock().unwrap().push(c.clone())));
        let secret = Json::Str("secret-token-value".into());
        let first = store
            .apply(set_op("k", secret.clone()), Origin::Sidecar { seq: 7 })
            .unwrap();
        assert_eq!(first, 1);
        let again = store.apply(set_op("k", secret), Origin::Renderer).unwrap();
        assert_eq!(again, 1, "a no-op writes nothing and keeps the rev");
        assert_eq!(store.apply(Op::Clear, Origin::Renderer).unwrap(), 2);
        wait_until("two events", || seen.lock().unwrap().len() >= 2);
        let seen = seen.lock().unwrap().clone();
        assert_eq!(seen[0].origin, Origin::Sidecar { seq: 7 });
        assert_eq!(seen[1].op, OpSummary::Clear);
        assert!(!format!("{seen:?}").contains("secret-token-value"));
        assert_eq!(seen.len(), 2);
    }

    #[test]
    fn a_failed_persist_returns_an_error_restores_the_view_and_fires_no_event() {
        let home = FakeHome::new("gamelib-store-host-");
        let failing = Arc::new(AtomicUsize::new(0));
        let flag = Arc::clone(&failing);
        let host = StoreHost::with_writer(Arc::new(move |path, bytes, durability| {
            if flag.load(Ordering::SeqCst) == 1 {
                return Err(io::Error::other("forced write failure"));
            }
            write_atomic(path, bytes, durability)
        }));
        let store = host.open_cache(&dir_of(&home), "uploadedLogs").unwrap();
        let fired = Arc::new(AtomicUsize::new(0));
        let f = Arc::clone(&fired);
        store.on_change(Box::new(move |_| {
            f.fetch_add(1, Ordering::SeqCst);
        }));
        store.apply(set_op("k", num(1)), Origin::Rust).unwrap();
        wait_until("the first event", || fired.load(Ordering::SeqCst) == 1);
        let file = dir_of(&home).join("uploadedLogs.json");
        let before = fs::read(&file).unwrap();

        failing.store(1, Ordering::SeqCst);
        assert_eq!(
            store.apply(set_op("k", num(2)), Origin::Rust),
            Err(ApplyError::Io(io::ErrorKind::Other))
        );
        assert_eq!(
            store.apply(set_op("new", num(3)), Origin::Rust),
            Err(ApplyError::Io(io::ErrorKind::Other))
        );
        assert_eq!(store.get("k"), Some(num(1)));
        assert_eq!(store.get("new"), None);
        assert_eq!(store.rev(), 1);
        assert_eq!(fs::read(&file).unwrap(), before);
        std::thread::sleep(Duration::from_millis(50));
        assert_eq!(fired.load(Ordering::SeqCst), 1);
        // The store is still usable once writes work again, and its next rev is not skipped.
        failing.store(0, Ordering::SeqCst);
        assert_eq!(store.apply(set_op("k", num(4)), Origin::Rust), Ok(2));
    }

    #[test]
    fn an_interrupted_write_leaves_the_previous_file_and_no_temp_file() {
        // The real writer, with the live file's name taken by a directory: the temp write, the
        // rename and the direct write all fail, as an interrupted write before the rename would.
        let home = FakeHome::new("gamelib-store-host-");
        let dir = dir_of(&home);
        let store = open(&home);
        store.set("k", num(1)).unwrap();
        let file = dir.join("uploadedLogs.json");
        let before = fs::read(&file).unwrap();
        fs::remove_file(&file).unwrap();
        fs::create_dir(&file).unwrap();
        assert!(store.set("k", num(2)).is_err());
        fs::remove_dir(&file).unwrap();
        fs::write(&file, &before).unwrap();
        let names: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, ["uploadedLogs.json"], "no temp file may remain");
        assert_eq!(fs::read(&file).unwrap(), before);
    }

    #[test]
    fn a_read_only_store_refuses_apply_leaves_its_bytes_and_is_listed() {
        let home = FakeHome::new("gamelib-store-host-");
        let newer = TS_SHAPED.replace("\"schemaVersion\": 1", "\"schemaVersion\": 9");
        let file = seed(&home, &newer);
        let host = StoreHost::new();
        let store = host.open_cache(&dir_of(&home), "uploadedLogs").unwrap();
        assert_eq!(
            store.apply(set_op("k", num(1)), Origin::Rust),
            Err(ApplyError::ReadOnly(ReadOnlyReason::Newer))
        );
        assert_eq!(fs::read_to_string(&file).unwrap(), newer);
        let entries = host.read_only_entries();
        assert_eq!(entries.len(), 1);
        assert_eq!(
            (entries[0].0.as_str(), entries[0].1),
            ("store/uploadedLogs", ReadOnlyReason::Newer)
        );
        assert!(entries[0].2.contains("newer"), "{}", entries[0].2);
        assert!(
            !entries[0].2.contains("dpaste"),
            "a detail never carries a value"
        );
    }

    #[test]
    fn an_evicted_store_refuses_apply_and_creates_no_file() {
        let home = FakeHome::new("gamelib-store-host-");
        let host = StoreHost::new();
        let store = host.open_cache(&dir_of(&home), "uploadedLogs").unwrap();
        store.set("k", num(1)).unwrap();
        assert_eq!(host.evict_path(&dir_of(&home)), 1);
        let file = dir_of(&home).join("uploadedLogs.json");
        fs::remove_file(&file).unwrap();
        assert_eq!(
            store.apply(set_op("k", num(2)), Origin::Rust),
            Err(ApplyError::Evicted)
        );
        assert!(!file.exists());
        assert_eq!(store.get("k"), None);
        assert!(store.snapshot().is_empty());
        // An unrelated path evicts nothing, and a later open reads the files as they are now.
        assert_eq!(host.evict_path(&home.root().join("elsewhere")), 0);
        let fresh = host.open_cache(&dir_of(&home), "uploadedLogs").unwrap();
        assert!(!Arc::ptr_eq(&store, &fresh));
        assert_eq!(fresh.get("k"), None);
    }

    #[test]
    fn a_rejected_op_is_an_error_and_changes_nothing() {
        let home = FakeHome::new("gamelib-store-host-");
        let file = seed(&home, TS_SHAPED);
        let store = open(&home);
        assert_eq!(
            store.apply(set_op("__internal__.x", num(1)), Origin::Rust),
            Err(ApplyError::Rejected(OpReject::ReservedKey))
        );
        assert_eq!(fs::read_to_string(&file).unwrap(), TS_SHAPED);
        assert_eq!(store.rev(), 0);
    }

    #[test]
    fn in_flight_is_zero_when_idle_and_wait_idle_gives_up_while_an_apply_is_blocked() {
        let home = FakeHome::new("gamelib-store-host-");
        let (entered_tx, entered_rx) = mpsc::channel::<()>();
        let (release_tx, release_rx) = mpsc::channel::<()>();
        let entered_tx = Mutex::new(entered_tx);
        let release_rx = Mutex::new(release_rx);
        let host = StoreHost::with_writer(Arc::new(move |path, bytes, durability| {
            entered_tx.lock().unwrap().send(()).unwrap();
            let _ = release_rx.lock().unwrap().recv();
            write_atomic(path, bytes, durability)
        }));
        assert_eq!(host.in_flight(), 0);
        assert!(host.wait_idle(Duration::from_millis(1)));
        let store = host.open_cache(&dir_of(&home), "uploadedLogs").unwrap();
        let writer = {
            let store = Arc::clone(&store);
            std::thread::spawn(move || store.set("k", num(1)))
        };
        entered_rx.recv_timeout(Duration::from_secs(10)).unwrap();
        assert_eq!(host.in_flight(), 1);
        assert!(!host.wait_idle(Duration::from_millis(50)));
        release_tx.send(()).unwrap();
        writer.join().unwrap().unwrap();
        assert!(host.wait_idle(Duration::from_secs(10)));
        assert_eq!(host.in_flight(), 0);
    }

    #[test]
    fn a_host_listener_hears_every_store_and_a_store_listener_only_its_own() {
        let home = FakeHome::new("gamelib-store-host-");
        let host = StoreHost::new();
        let a = host.open_cache(&dir_of(&home), "uploadedLogs").unwrap();
        let b = host.open_cache(&dir_of(&home), "other").unwrap();
        let all = Arc::new(Mutex::new(Vec::<String>::new()));
        let only_a = Arc::new(Mutex::new(Vec::<String>::new()));
        let (s1, s2) = (Arc::clone(&all), Arc::clone(&only_a));
        host.on_any_change(Box::new(move |c| s1.lock().unwrap().push(c.store.clone())));
        a.on_change(Box::new(move |c| s2.lock().unwrap().push(c.store.clone())));
        a.set("k", num(1)).unwrap();
        b.set("k", num(1)).unwrap();
        wait_until("both stores", || all.lock().unwrap().len() >= 2);
        std::thread::sleep(Duration::from_millis(30));
        assert_eq!(*all.lock().unwrap(), ["store/uploadedLogs", "store/other"]);
        assert_eq!(*only_a.lock().unwrap(), ["store/uploadedLogs"]);
    }

    #[test]
    fn a_corrupt_file_the_boot_sweep_opened_is_still_invalid_data_to_open_cache() {
        let home = FakeHome::new("gamelib-store-host-");
        let file = seed(&home, "{not json");
        let host = StoreHost::new();
        let row = row_for_key("store/uploadedLogs").unwrap();
        let swept = host.open_row(row, file.clone()).unwrap();
        assert!(matches!(
            swept.open_outcome(),
            OpenOutcome::StartEmpty { .. }
        ));
        let err = host
            .open_cache(&dir_of(&home), "uploadedLogs")
            .err()
            .expect("strict entry refuses what the sweep found unreadable");
        assert_eq!(err.kind(), io::ErrorKind::InvalidData);
        assert_eq!(fs::read_to_string(&file).unwrap(), "{not json");
    }
}

/// `host::tighten_*`: the token-path tightening on open (T-85-34) and what a token-bearing account
/// file keeps across a Rust re-save (T-85-36). Every value is synthetic.
#[cfg(test)]
mod tighten_tests {
    use super::*;
    use crate::json::Num;
    use gamelib_testutil::FakeHome;
    use std::fs;

    /// A v0.10-shaped `steam_store/config.json` with ciphertext-looking values and an unknown key.
    const STEAM_CONFIG: &str = "{\n\t\"refreshToken\": \"steam:v1:REDACTED\",\n\t\"isLoggedIn\": false,\n\t\"userData\": {\n\t\t\"username\": \"placeholder-user\"\n\t},\n\t\"aFieldFromALaterVersion\": {\n\t\t\"nested\": [\n\t\t\t1,\n\t\t\t\"humble:v1:REDACTED\"\n\t\t]\n\t},\n\t\"__internal__\": {\n\t\t\"gamelib\": {\n\t\t\t\"schemaVersion\": 1\n\t\t}\n\t}\n}";

    /// Plants `text` at the row's own `<dir>/<name>.json` under `home`.
    fn plant(home: &FakeHome, key: &str, text: &str) -> (&'static TableRow, PathBuf) {
        let row = row_for_key(key).unwrap_or_else(|| panic!("no row {key}"));
        let dir = home.root().join(&row.dir);
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join(format!("{}.json", row.name.as_deref().unwrap()));
        fs::write(&file, text).unwrap();
        (row, file)
    }

    #[cfg(unix)]
    fn set_mode(p: &Path, mode: u32) {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(p, fs::Permissions::from_mode(mode)).unwrap();
    }

    #[cfg(unix)]
    fn mode(p: &Path) -> u32 {
        use std::os::unix::fs::PermissionsExt;
        fs::metadata(p).unwrap().permissions().mode() & 0o777
    }

    #[cfg(unix)]
    #[test]
    fn tighten_a_0644_token_file_in_a_0755_dir_becomes_0600_in_0700_on_open() {
        let home = FakeHome::new("gamelib-store-tighten-");
        for key in ["steam_store/config", "humble_store/config"] {
            let (row, file) = plant(&home, key, STEAM_CONFIG);
            let dir = file.parent().unwrap().to_path_buf();
            set_mode(&file, 0o644);
            set_mode(&dir, 0o755);
            let store = StoreHost::new().open_row(row, file.clone()).unwrap();
            assert_eq!(mode(&file), 0o600, "{key} file");
            assert_eq!(mode(&dir), 0o700, "{key} dir");
            // Tightening changes modes only: the open read the file as it was.
            assert_eq!(fs::read_to_string(&file).unwrap(), STEAM_CONFIG);
            assert_eq!(store.get("isLoggedIn"), Some(Json::Bool(false)));
        }
    }

    #[cfg(unix)]
    #[test]
    fn tighten_leaves_a_file_and_dir_with_no_group_or_other_bits_alone() {
        let home = FakeHome::new("gamelib-store-tighten-");
        let (row, file) = plant(&home, "steam_store/config", STEAM_CONFIG);
        let dir = file.parent().unwrap().to_path_buf();
        // Owner-only modes that are not 0600/0700 are not "fixed" to them: only group/other bits trigger.
        set_mode(&file, 0o400);
        set_mode(&dir, 0o700);
        StoreHost::new().open_row(row, file.clone()).unwrap();
        assert_eq!(mode(&file), 0o400);
        assert_eq!(mode(&dir), 0o700);
        set_mode(&file, 0o600);
    }

    #[cfg(unix)]
    #[test]
    fn tighten_skips_a_row_that_is_not_token_bearing_and_a_missing_file() {
        let home = FakeHome::new("gamelib-store-tighten-");
        let (row, file) = plant(&home, "gog_store/config", "{}");
        assert!(!row.token_bearing);
        let dir = file.parent().unwrap().to_path_buf();
        set_mode(&file, 0o644);
        set_mode(&dir, 0o755);
        StoreHost::new().open_row(row, file.clone()).unwrap();
        assert_eq!(mode(&file), 0o644, "gog_store/config is not token-bearing");
        assert_eq!(mode(&dir), 0o755);

        // A token-bearing row whose file does not exist yet: the existing directory is tightened,
        // no file is created, and nothing is written until the first change.
        let row = row_for_key("steam_store/config").unwrap();
        let dir = home.root().join(&row.dir);
        fs::create_dir_all(&dir).unwrap();
        set_mode(&dir, 0o755);
        let file = dir.join("config.json");
        StoreHost::new().open_row(row, file.clone()).unwrap();
        assert!(!file.exists());
        assert_eq!(mode(&dir), 0o700);
    }

    /// Runs on every OS (Windows included, where tightening is a no-op): the shared Steam file keeps
    /// its ciphertext and unknown keys byte-identical across a Rust write of another key.
    #[test]
    fn tighten_open_then_a_write_keeps_ciphertext_and_unknown_keys_byte_identical() {
        let home = FakeHome::new("gamelib-store-tighten-");
        let (row, file) = plant(&home, "steam_store/config", STEAM_CONFIG);
        let store = StoreHost::new().open_row(row, file.clone()).unwrap();
        store.set("isLoggedIn", Json::Bool(true)).unwrap();
        assert_eq!(
            fs::read_to_string(&file).unwrap(),
            STEAM_CONFIG.replace("\"isLoggedIn\": false", "\"isLoggedIn\": true")
        );
        // A key appended by the write lands after the existing ones, before nothing it displaced.
        store.set("provisioned", Json::Num(Num::U(1))).unwrap();
        let text = fs::read_to_string(&file).unwrap();
        assert!(text.contains("\"refreshToken\": \"steam:v1:REDACTED\""));
        assert!(text.contains("\t\t\t\"humble:v1:REDACTED\"\n"));
        assert_eq!(store.get("provisioned"), Some(Json::Num(Num::U(1))));
    }
}

/// 85-15: settings documents (`settings/global`, `GamesConfig/<app>`) through [`StoreHost::open_doc`].
#[cfg(test)]
mod doc_tests {
    use super::*;
    use crate::json::{parse, Num, Obj};
    use gamelib_testutil::FakeHome;
    use std::fs;

    fn games_config(home: &FakeHome) -> PathBuf {
        home.root().join("GamesConfig")
    }

    fn obj(text: &str) -> Obj {
        match parse(text.as_bytes()).unwrap() {
            Json::Obj(o) => o,
            other => panic!("not an object: {other:?}"),
        }
    }

    /// The document `GameConfig.flush` writes for one game in explicit mode.
    fn game_doc(app: &str, value: u64) -> Obj {
        obj(&format!(
            "{{\"{app}\": {{\"maxSharpness\": {value}, \"launcherArgs\": \"-x\"}}, \"version\": \"v0\", \"explicit\": true}}"
        ))
    }

    #[test]
    fn host_doc_a_replace_writes_two_space_bytes_with_no_trailing_newline_and_the_chain_version() {
        let home = FakeHome::new("gamelib-store-doc-");
        let path = games_config(&home).join("1245620.json");
        let host = StoreHost::new();
        let doc = host.open_doc("GamesConfig/1245620", path.clone()).unwrap();
        assert_eq!(
            doc.key(),
            "GamesConfig/1245620",
            "the store is named by its document key"
        );
        assert_eq!(doc.open_outcome(), &OpenOutcome::Missing);
        assert!(!path.exists(), "nothing is written until the first replace");

        assert_eq!(
            doc.apply(Op::Replace(game_doc("1245620", 3)), Origin::Rust),
            Ok(1)
        );
        // The game chain is at v2 (D-04, pinned to TS), so `version` is re-stamped where it sits.
        let expected = "{\n  \"1245620\": {\n    \"maxSharpness\": 3,\n    \"launcherArgs\": \"-x\"\n  },\n  \"version\": \"v2\",\n  \"explicit\": true\n}";
        assert_eq!(fs::read_to_string(&path).unwrap(), expected);
        // The replace is visible to a reader at once, version included.
        assert_eq!(doc.get("version"), Some(Json::Str("v2".to_string())));
        assert_eq!(doc.get("1245620.maxSharpness"), Some(Json::Num(Num::U(3))));
    }

    #[test]
    fn host_doc_the_global_document_is_its_own_store_and_reopens_as_ok() {
        let home = FakeHome::new("gamelib-store-doc-");
        let path = home.root().join("config.json");
        let host = StoreHost::new();
        let doc = host.open_doc("settings/global", path.clone()).unwrap();
        let body = obj(
            "{\"defaultSettings\": {\"language\": \"en\", \"maxWorkers\": 0}, \"version\": \"v0\"}",
        );
        doc.apply(Op::Replace(body), Origin::Rust).unwrap();
        let text = fs::read_to_string(&path).unwrap();
        assert_eq!(
            text,
            "{\n  \"defaultSettings\": {\n    \"language\": \"en\",\n    \"maxWorkers\": 0\n  },\n  \"version\": \"v2\"\n}"
        );
        // The same path is one store; a second host reads it back as current (no migration, no write).
        assert!(Arc::ptr_eq(
            &doc,
            &host.open_doc("settings/global", path.clone()).unwrap()
        ));
        let again = StoreHost::new()
            .open_doc("settings/global", path.clone())
            .unwrap();
        assert_eq!(again.open_outcome(), &OpenOutcome::Ok);
        assert_eq!(fs::read_to_string(&path).unwrap(), text);
    }

    #[test]
    fn host_doc_set_delete_and_clear_are_refused_and_write_nothing() {
        let home = FakeHome::new("gamelib-store-doc-");
        let path = games_config(&home).join("app.json");
        let doc = StoreHost::new()
            .open_doc("GamesConfig/app", path.clone())
            .unwrap();
        let refused = Err(ApplyError::Rejected(OpReject::NotReplace));
        let set = Op::Set {
            key: "app.x".to_string(),
            value: Json::Bool(true),
        };
        assert_eq!(doc.apply(set, Origin::Rust), refused);
        assert_eq!(
            doc.apply(
                Op::Delete {
                    key: "app".to_string()
                },
                Origin::Rust
            ),
            refused
        );
        assert_eq!(doc.apply(Op::Clear, Origin::Rust), refused);
        assert!(!path.exists());
        assert_eq!(doc.rev(), 0);
        assert!(doc.set("app", Json::Bool(true)).is_err());
    }

    #[test]
    fn host_doc_an_app_name_that_is_not_one_plain_segment_is_refused_before_any_path_is_used() {
        let home = FakeHome::new("gamelib-store-doc-");
        let host = StoreHost::new();
        let long = "a".repeat(256);
        for bad in [
            "GamesConfig/",
            "GamesConfig/.",
            "GamesConfig/..",
            "GamesConfig/../config",
            "GamesConfig/a/b",
            "GamesConfig/a\\b",
            "GamesConfig/a..b",
            "GamesConfig/a\0b",
            &format!("GamesConfig/{long}"),
            "settings/game",
            "store/config",
            "config",
        ] {
            let err = host
                .open_doc(bad, home.root().join("escape.json"))
                .err()
                .unwrap_or_else(|| panic!("{bad:?} was opened"));
            assert_eq!(err.kind(), io::ErrorKind::InvalidInput, "{bad:?}");
        }
        assert!(
            fs::read_dir(home.root()).unwrap().next().is_none(),
            "nothing was created"
        );
        // 255 bytes is the longest name allowed.
        let max = "b".repeat(255);
        assert!(host
            .open_doc(
                &format!("GamesConfig/{max}"),
                games_config(&home).join("max.json")
            )
            .is_ok());
    }

    #[test]
    fn host_doc_an_older_document_is_migrated_with_a_backup_on_open() {
        let home = FakeHome::new("gamelib-store-doc-");
        let dir = games_config(&home);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("app.json");
        let v0 = "{\n  \"app\": {\n    \"maxSharpness\": 3\n  }\n}";
        fs::write(&path, v0).unwrap();
        let doc = StoreHost::new()
            .open_doc("GamesConfig/app", path.clone())
            .unwrap();
        assert!(
            matches!(
                doc.open_outcome(),
                OpenOutcome::Migrated { from: 0, to: 2, .. }
            ),
            "{:?}",
            doc.open_outcome()
        );
        let backups: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().ends_with(".bak.json"))
            .collect();
        assert_eq!(backups.len(), 1);
        assert_eq!(fs::read_to_string(backups[0].path()).unwrap(), v0);
        assert_eq!(doc.get("version"), Some(Json::Str("v2".to_string())));
    }
}
