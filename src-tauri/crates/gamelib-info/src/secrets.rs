//! The seam for the two API keys (D-19). The shell implements [`SecretSource`] over the Keychain
//! (86-14); this crate has no `keyring` dependency, and `gamelib-info-cli` reads the keys from its
//! own environment only, never the Keychain.
//!
//! Errors are fixed categories, never a value: a key must not reach a log or an error string.
//!
//! On top of the seam sit the two key owners (86-14, D-26), copies of the TS owners over
//! `ctx.secrets`: [`ItadKey`] (`storeSearch/itadSecrets.ts` plus the precedence in `itad.ts`) and
//! [`SgdbKey`] (`sidecar/steamgridSecretStore.ts`), and the one-time plaintext migration
//! [`migrate_sgdb_plaintext`] that replaces the TS `migrateSteamGridDbApiKey`.
//!
//! Both owners have a blocking form (`get`, `set`, `effective`) and an `_async` form. The ops use the
//! `_async` one: it runs the Keychain call, which the shell bounds at 45 s, on the blocking pool, so
//! an op's `guarded` race can still see the shutdown token while it waits (WR-04). The blocking form
//! stays for the boot migration, which runs on its own bounded thread.

#[cfg(feature = "testing")]
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard};

use gamelib_store::host::Store;
use gamelib_store::json::{Json, Obj};
use gamelib_store::ops::Op;
use gamelib_store::table::row_for_key;

use crate::ctx::InfoCtx;

/// A key's slot. The names the shell stores them under (`steamgrid-api-key`, `itad-api-key`) belong
/// to the shell.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Slot {
    SteamGridDb,
    Itad,
}

/// Where the keys live.
pub trait SecretSource: Send + Sync {
    /// The stored key, or `None` when the slot is empty.
    fn get(&self, slot: Slot) -> Result<Option<String>, String>;
    fn set(&self, slot: Slot, value: &str) -> Result<(), String>;
    fn delete(&self, slot: Slot) -> Result<(), String>;
}

/// Reads the keys from two environment variables whose names the caller gives (the CLI passes
/// `GAMELIB_INFO_ITAD_KEY` and `GAMELIB_INFO_SGDB_KEY`). Read-only: it never sets a variable, so
/// `set` and `delete` answer `read-only`. The library itself reads no environment variable; only a
/// binary that builds this source does.
pub struct EnvSecretSource {
    itad_var: String,
    steamgrid_var: String,
}

impl EnvSecretSource {
    pub fn new(itad_var: &str, steamgrid_var: &str) -> EnvSecretSource {
        EnvSecretSource {
            itad_var: itad_var.to_string(),
            steamgrid_var: steamgrid_var.to_string(),
        }
    }

    fn var(&self, slot: Slot) -> &str {
        match slot {
            Slot::Itad => &self.itad_var,
            Slot::SteamGridDb => &self.steamgrid_var,
        }
    }
}

impl SecretSource for EnvSecretSource {
    fn get(&self, slot: Slot) -> Result<Option<String>, String> {
        match std::env::var(self.var(slot)) {
            Ok(v) if !v.trim().is_empty() => Ok(Some(v.trim().to_string())),
            Ok(_) | Err(std::env::VarError::NotPresent) => Ok(None),
            Err(std::env::VarError::NotUnicode(_)) => Err("not-unicode".to_string()),
        }
    }

    fn set(&self, _slot: Slot, _value: &str) -> Result<(), String> {
        Err("read-only".to_string())
    }

    fn delete(&self, _slot: Slot) -> Result<(), String> {
        Err("read-only".to_string())
    }
}

/// An in-memory source for tests. Its `Debug` names the occupied slots and never a value.
#[cfg(feature = "testing")]
#[derive(Default)]
pub struct MemorySecretSource {
    slots: Mutex<HashMap<Slot, String>>,
}

#[cfg(feature = "testing")]
impl MemorySecretSource {
    pub fn new() -> MemorySecretSource {
        MemorySecretSource::default()
    }

    /// A source already holding `value` in `slot`.
    pub fn with(slot: Slot, value: &str) -> MemorySecretSource {
        let source = MemorySecretSource::new();
        source.lock().insert(slot, value.to_string());
        source
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<Slot, String>> {
        self.slots.lock().unwrap_or_else(|e| e.into_inner())
    }
}

#[cfg(feature = "testing")]
impl std::fmt::Debug for MemorySecretSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut held: Vec<Slot> = self.lock().keys().copied().collect();
        held.sort_by_key(|s| *s as u8);
        f.debug_struct("MemorySecretSource")
            .field("slots", &held)
            .finish()
    }
}

#[cfg(feature = "testing")]
impl SecretSource for MemorySecretSource {
    fn get(&self, slot: Slot) -> Result<Option<String>, String> {
        Ok(self.lock().get(&slot).cloned())
    }

    /// Trims, and an empty value clears the slot, as the keyring owners do.
    fn set(&self, slot: Slot, value: &str) -> Result<(), String> {
        let value = value.trim();
        let mut slots = self.lock();
        if value.is_empty() {
            slots.remove(&slot);
        } else {
            slots.insert(slot, value.to_string());
        }
        Ok(())
    }

    fn delete(&self, slot: Slot) -> Result<(), String> {
        self.lock().remove(&slot);
        Ok(())
    }
}

// ---- The key owners (86-14, D-26) ----

/// How long a failed read is remembered, so a denied or hung Keychain prompt is not asked again on
/// every call (`KEYRING_FAILURE_MEMO_MS` in `keyringTokenStore.ts`, comfortably over twice the shell's
/// 45 s read bound).
pub const FAILURE_MEMO_MS: u64 = 120_000;

fn locked<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// Runs one Keychain call on the blocking pool (WR-04) holding an `info-keychain` shutdown
/// registrant for exactly as long as the call really runs (WR-65). The registrant moves into the
/// blocking closure, as [`crate::spawn_sgdb_migration`]'s does: when shutdown wins an op's `guarded`
/// race the op answers `<op>:shutdown` at once, but the abandoned call keeps the exit drain waiting
/// for it within the one exit budget instead of being cut off mid-write. Once shutdown has begun no
/// new call is started.
///
/// The outer `Err` is only that refusal, already a full `<op>:shutdown`. The inner value is the
/// call's own answer, with `unavailable` for a call that panicked.
async fn keychain_call<T, F>(ctx: &InfoCtx, op: &str, call: F) -> Result<Result<T, String>, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    if ctx.shutdown.token().is_cancelled() {
        return Err(format!("{op}:shutdown"));
    }
    let registrant = ctx.shutdown.register("info-keychain");
    let outcome = tokio::task::spawn_blocking(move || {
        let _registrant = registrant;
        call()
    })
    .await
    .unwrap_or_else(|_| Err("unavailable".to_string()));
    Ok(outcome)
}

/// The read cache of one slot. `value` is `None` when nothing is cached, `Some(None)` for a confirmed
/// empty slot. `epoch` moves on every write, so a read that was already in flight when a write
/// happened cannot cache its stale answer.
#[derive(Default)]
struct SlotCache {
    epoch: u64,
    value: Option<Option<String>>,
    /// The time and fixed category of the last failed read.
    failed: Option<(u64, String)>,
}

/// One key slot over `ctx.secrets`, with the TS slot store's cache, failure memo and trimming.
struct SlotOwner {
    slot: Slot,
    cache: Mutex<SlotCache>,
    /// Serialises fetches so concurrent readers wait for one Keychain read and then hit its cache.
    fetch: Mutex<()>,
    /// The same serialisation for [`SlotOwner::get_async`], whose guard is held across an `await`.
    fetch_async: tokio::sync::Mutex<()>,
}

impl SlotOwner {
    fn new(slot: Slot) -> SlotOwner {
        SlotOwner {
            slot,
            cache: Mutex::new(SlotCache::default()),
            fetch: Mutex::new(()),
            fetch_async: tokio::sync::Mutex::new(()),
        }
    }

    /// The cached answer, or the memoised failure, if either is current.
    fn peek(&self, ctx: &InfoCtx, op: &str) -> Option<Result<Option<String>, String>> {
        let cache = locked(&self.cache);
        if let Some(value) = &cache.value {
            return Some(Ok(value.clone()));
        }
        if let Some((at, reason)) = &cache.failed {
            if ctx.clock.now_ms().saturating_sub(*at) < FAILURE_MEMO_MS {
                return Some(Err(format!("{op}:secret-{reason}")));
            }
        }
        None
    }

    fn get(&self, ctx: &InfoCtx, op: &str) -> Result<Option<String>, String> {
        let Some(source) = ctx.secrets.as_ref() else {
            return Err(format!("{op}:no-secret-source"));
        };
        if let Some(hit) = self.peek(ctx, op) {
            return hit;
        }
        let _fetching = locked(&self.fetch);
        if let Some(hit) = self.peek(ctx, op) {
            return hit;
        }
        let epoch = locked(&self.cache).epoch;
        let outcome = source.get(self.slot);
        self.finish_read(ctx, op, epoch, outcome)
    }

    /// [`SlotOwner::get`] with the Keychain read on the blocking pool (WR-04). The read can take as
    /// long as the shell's 45 s bound, and a synchronous one inside a guarded op stops the op's
    /// `select!` from ever seeing the shutdown token; awaiting the blocking task lets it win. A read
    /// abandoned that way finishes on its pool thread and its answer is dropped, never cached; it
    /// holds its `info-keychain` registrant until it returns (WR-65).
    async fn get_async(&self, ctx: &InfoCtx, op: &str) -> Result<Option<String>, String> {
        let Some(source) = ctx.secrets.clone() else {
            return Err(format!("{op}:no-secret-source"));
        };
        if let Some(hit) = self.peek(ctx, op) {
            return hit;
        }
        let _fetching = self.fetch_async.lock().await;
        if let Some(hit) = self.peek(ctx, op) {
            return hit;
        }
        let epoch = locked(&self.cache).epoch;
        let slot = self.slot;
        let outcome = keychain_call(ctx, op, move || source.get(slot)).await?;
        self.finish_read(ctx, op, epoch, outcome)
    }

    /// Caches (or memoises the failure of) a read that began at `epoch`, unless a write moved the
    /// epoch since.
    fn finish_read(
        &self,
        ctx: &InfoCtx,
        op: &str,
        epoch: u64,
        outcome: Result<Option<String>, String>,
    ) -> Result<Option<String>, String> {
        let mut cache = locked(&self.cache);
        match outcome {
            Ok(value) => {
                let value = value.filter(|v| !v.is_empty());
                if cache.epoch == epoch {
                    cache.value = Some(value.clone());
                    cache.failed = None;
                }
                Ok(value)
            }
            Err(reason) => {
                if cache.epoch == epoch {
                    cache.failed = Some((ctx.clock.now_ms(), reason.clone()));
                }
                Err(format!("{op}:secret-{reason}"))
            }
        }
    }

    /// Trims; an empty value clears the slot. The cache is dropped first and holds the written value
    /// only once the write succeeded.
    fn set(&self, ctx: &InfoCtx, op: &str, value: &str) -> Result<(), String> {
        let Some(source) = ctx.secrets.as_ref() else {
            return Err(format!("{op}:no-secret-source"));
        };
        self.invalidate();
        let value = value.trim();
        let (written, outcome) = if value.is_empty() {
            (None, source.delete(self.slot))
        } else {
            (Some(value.to_string()), source.set(self.slot, value))
        };
        self.finish_write(op, written, outcome)
    }

    /// [`SlotOwner::set`] with the Keychain write on the blocking pool (WR-04), for the same reason
    /// as [`SlotOwner::get_async`]. A write abandoned by shutdown still holds its `info-keychain`
    /// registrant until it returns, so the exit drain waits for it within its budget (WR-65).
    async fn set_async(&self, ctx: &InfoCtx, op: &str, value: &str) -> Result<(), String> {
        let Some(source) = ctx.secrets.clone() else {
            return Err(format!("{op}:no-secret-source"));
        };
        self.invalidate();
        let value = value.trim().to_string();
        let slot = self.slot;
        let written = (!value.is_empty()).then(|| value.clone());
        let outcome = keychain_call(ctx, op, move || {
            if value.is_empty() {
                source.delete(slot)
            } else {
                source.set(slot, &value)
            }
        })
        .await?;
        self.finish_write(op, written, outcome)
    }

    fn finish_write(
        &self,
        op: &str,
        written: Option<String>,
        outcome: Result<(), String>,
    ) -> Result<(), String> {
        match outcome {
            Ok(()) => {
                let mut cache = locked(&self.cache);
                // A read that began after `invalidate` but before this write finished holds the
                // older answer; the epoch moves again so it cannot cache it over the written value.
                cache.epoch += 1;
                cache.value = Some(written);
                cache.failed = None;
                Ok(())
            }
            Err(reason) => Err(format!("{op}:secret-{reason}")),
        }
    }

    /// Drops the cached answer and the failure memo; a read already in flight will not cache.
    fn invalidate(&self) {
        let mut cache = locked(&self.cache);
        cache.epoch += 1;
        cache.value = None;
        cache.failed = None;
    }
}

/// Where the key an ITAD request uses came from. The labels are the 86-07 golden's `keyPerRequest`
/// words.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeySource {
    User,
    Env,
    Baked,
}

impl KeySource {
    pub fn label(self) -> &'static str {
        match self {
            KeySource::User => "user",
            KeySource::Env => "env",
            KeySource::Baked => "baked",
        }
    }
}

/// A resolved ITAD key and where it came from. `Debug` names the source and never the key.
#[derive(Clone, PartialEq, Eq)]
pub struct ResolvedKey {
    pub key: String,
    pub source: KeySource,
}

impl std::fmt::Debug for ResolvedKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ResolvedKey")
            .field("source", &self.source)
            .finish_non_exhaustive()
    }
}

/// The optional user-supplied IsThereAnyDeal key (`itadSecrets.ts`) and the key precedence of
/// `itad.ts`: the user key (set, and not rejected this session), then `ctx.itad_env_key`, then
/// `ctx.itad_baked_key`. The `rejected` flag is session state: a restart forgets it, and a `set`
/// clears it.
pub struct ItadKey {
    owner: SlotOwner,
    rejected: AtomicBool,
}

impl Default for ItadKey {
    fn default() -> ItadKey {
        ItadKey::new()
    }
}

impl ItadKey {
    pub fn new() -> ItadKey {
        ItadKey {
            owner: SlotOwner::new(Slot::Itad),
            rejected: AtomicBool::new(false),
        }
    }

    /// The stored user key (cached). `Ok(None)` when the slot is empty; `Err` is a fixed
    /// `<op>:no-secret-source` or `<op>:secret-<category>`, never a value.
    pub fn get(&self, ctx: &InfoCtx, op: &str) -> Result<Option<String>, String> {
        self.owner.get(ctx, op)
    }

    /// [`ItadKey::get`] with the Keychain read on the blocking pool, so a guarded op can still be
    /// cancelled by shutdown while it waits (WR-04).
    pub async fn get_async(&self, ctx: &InfoCtx, op: &str) -> Result<Option<String>, String> {
        self.owner.get_async(ctx, op).await
    }

    /// Clears the rejected flag, trims, then stores; an empty or whitespace-only value clears the
    /// slot. The flag is cleared even when the write fails, as in TS.
    pub fn set(&self, ctx: &InfoCtx, op: &str, value: &str) -> Result<(), String> {
        self.rejected.store(false, Ordering::SeqCst);
        self.owner.set(ctx, op, value)
    }

    /// [`ItadKey::set`] with the Keychain write on the blocking pool (WR-04).
    pub async fn set_async(&self, ctx: &InfoCtx, op: &str, value: &str) -> Result<(), String> {
        self.rejected.store(false, Ordering::SeqCst);
        self.owner.set_async(ctx, op, value).await
    }

    /// The key a request uses, or `None` when there is none at all (the adapter raises
    /// `notConfigured`). Total like the TS owner: a source that is missing or failing only means
    /// there is no user key, and the env and baked keys are tried.
    pub fn effective(&self, ctx: &InfoCtx) -> Option<ResolvedKey> {
        if !self.is_rejected() {
            if let Ok(Some(user)) = self.owner.get(ctx, "itad_key") {
                return Some(ResolvedKey {
                    key: user,
                    source: KeySource::User,
                });
            }
        }
        Self::fallback(ctx)
    }

    /// [`ItadKey::effective`] with the Keychain read on the blocking pool (WR-04): the request path
    /// uses this one, so a slow Keychain does not keep an op from answering `<op>:shutdown`.
    pub async fn effective_async(&self, ctx: &InfoCtx) -> Option<ResolvedKey> {
        if !self.is_rejected() {
            if let Ok(Some(user)) = self.owner.get_async(ctx, "itad_key").await {
                return Some(ResolvedKey {
                    key: user,
                    source: KeySource::User,
                });
            }
        }
        Self::fallback(ctx)
    }

    /// The env key, then the baked key.
    fn fallback(ctx: &InfoCtx) -> Option<ResolvedKey> {
        let pick = |key: &Option<String>| {
            key.as_deref()
                .map(str::trim)
                .filter(|k| !k.is_empty())
                .map(str::to_owned)
        };
        if let Some(key) = pick(&ctx.itad_env_key) {
            return Some(ResolvedKey {
                key,
                source: KeySource::Env,
            });
        }
        pick(&ctx.itad_baked_key).map(|key| ResolvedKey {
            key,
            source: KeySource::Baked,
        })
    }

    /// Records, for this session only, that ITAD refused the user key (a 401 or 403).
    pub fn mark_rejected(&self) {
        self.rejected.store(true, Ordering::SeqCst);
    }

    pub fn is_rejected(&self) -> bool {
        self.rejected.load(Ordering::SeqCst)
    }
}

/// The SteamGridDB API key (`steamgridSecretStore.ts`).
pub struct SgdbKey {
    owner: SlotOwner,
}

impl Default for SgdbKey {
    fn default() -> SgdbKey {
        SgdbKey::new()
    }
}

impl SgdbKey {
    pub fn new() -> SgdbKey {
        SgdbKey {
            owner: SlotOwner::new(Slot::SteamGridDb),
        }
    }

    /// The stored key (cached); see [`ItadKey::get`] for the answers.
    pub fn get(&self, ctx: &InfoCtx, op: &str) -> Result<Option<String>, String> {
        self.owner.get(ctx, op)
    }

    /// [`SgdbKey::get`] with the Keychain read on the blocking pool (WR-04).
    pub async fn get_async(&self, ctx: &InfoCtx, op: &str) -> Result<Option<String>, String> {
        self.owner.get_async(ctx, op).await
    }

    /// Trims, then stores; an empty or whitespace-only value clears the slot (WR-02 in TS).
    pub fn set(&self, ctx: &InfoCtx, op: &str, value: &str) -> Result<(), String> {
        self.owner.set(ctx, op, value)
    }

    /// [`SgdbKey::set`] with the Keychain write on the blocking pool (WR-04).
    pub async fn set_async(&self, ctx: &InfoCtx, op: &str, value: &str) -> Result<(), String> {
        self.owner.set_async(ctx, op, value).await
    }

    /// Drops the read cache, so the next `get` is a real round trip (the migration's proof).
    pub fn invalidate(&self) {
        self.owner.invalidate();
    }
}

// ---- The one-time SteamGridDB plaintext migration (86-14, D-26) ----

/// What [`migrate_sgdb_plaintext`] did. The shell logs one line for the outcome; the crate has no
/// logger and the key never appears in it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MigrationOutcome {
    /// The key is in the keyring, proved by a read back, and the setting is cleared.
    Migrated,
    /// No plaintext key (idempotency: a second run does nothing).
    NothingToDo,
    /// The setting holds an `sgdb:v1:` ciphertext no Rust build can decrypt; left in place.
    Ciphertext,
    /// The keyring did not hand back what was written (or the read failed); the setting is kept.
    ReadBackFailed,
    /// The settings document, the keyring write or the clearing write failed; the setting is kept
    /// unless the failure was in the very last step.
    Failed,
}

impl MigrationOutcome {
    /// The one word the boot log line carries for this outcome. Never a key, a length or a path.
    pub fn label(self) -> &'static str {
        match self {
            MigrationOutcome::Migrated => "migrated",
            MigrationOutcome::NothingToDo => "nothing-to-do",
            MigrationOutcome::Ciphertext => "ciphertext-left-in-place",
            MigrationOutcome::ReadBackFailed => "read-back-failed",
            MigrationOutcome::Failed => "failed",
        }
    }
}

/// The `sgdb:v1:` prefix of a ciphertext written by an Electron `safeStorage` build.
const SGDB_CIPHERTEXT_PREFIX: &str = "sgdb:v1:";
const SETTING: &str = "steamGridDbApiKey";

/// Moves an old plaintext `steamGridDbApiKey` setting into the keyring, in TS's order: write the
/// keyring, drop the cache, read it back, compare, and only on an exact match clear the setting.
/// Any failure leaves the setting where it is. A value that is empty after trimming is not a key
/// (storing it would delete a real one) and counts as nothing to do.
///
/// Run once per boot by [`crate::spawn_sgdb_migration`], which bounds it (86-15, D-26).
pub fn migrate_sgdb_plaintext(ctx: &InfoCtx) -> MigrationOutcome {
    const OP: &str = "sgdb_migrate";
    let Ok(global) = ctx
        .host
        .open_doc("settings/global", ctx.paths.app_folder.join("config.json"))
    else {
        return MigrationOutcome::Failed;
    };
    let Some(Json::Obj(settings)) = global.get("defaultSettings") else {
        return MigrationOutcome::NothingToDo;
    };
    let Some(Json::Str(stored)) = settings.get(SETTING) else {
        return MigrationOutcome::NothingToDo;
    };
    let plaintext = stored.trim().to_string();
    if plaintext.is_empty() {
        return MigrationOutcome::NothingToDo;
    }
    if plaintext.starts_with(SGDB_CIPHERTEXT_PREFIX) {
        return MigrationOutcome::Ciphertext;
    }
    if ctx.sgdb_key.set(ctx, OP, &plaintext).is_err() {
        return MigrationOutcome::Failed;
    }
    // The write cached its value: drop it, so the read back below is a real round trip.
    ctx.sgdb_key.invalidate();
    match ctx.sgdb_key.get(ctx, OP) {
        Ok(Some(back)) if back == plaintext => {}
        _ => return MigrationOutcome::ReadBackFailed,
    }
    if clear_setting(ctx, &global).is_err() {
        return MigrationOutcome::Failed;
    }
    MigrationOutcome::Migrated
}

/// `setSetting('steamGridDbApiKey', '')`: the renderer's mirror (`store/config.json` `settings`)
/// first, then the settings document, as TS's `setSetting` ordered them. The document goes last so
/// it stays the migration's trigger until everything else is clean.
fn clear_setting(ctx: &InfoCtx, global: &Store) -> Result<(), ()> {
    if let Some(row) = row_for_key("store/config") {
        let path = ctx.paths.user_data.join("store").join("config.json");
        let mirror = ctx.host.open_row(row, path).map_err(|_| ())?;
        if let Some(Json::Obj(mut settings)) = mirror.get("settings") {
            settings.insert_js(SETTING, Json::Str(String::new()));
            mirror
                .set("settings", Json::Obj(settings))
                .map_err(|_| ())?;
        }
    }
    let mut doc = Obj::new();
    for (key, value) in global.snapshot() {
        doc.insert_js(key, value);
    }
    if let Some(Json::Obj(settings)) = doc.get_mut("defaultSettings") {
        settings.insert_js(SETTING, Json::Str(String::new()));
    }
    global
        .apply(Op::Replace(doc), gamelib_store::host::Origin::Rust)
        .map(|_| ())
        .map_err(|_| ())
}
