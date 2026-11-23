//! The two key owners and the SteamGridDB plaintext migration (86-14, D-19, D-25, D-26), over a
//! `MemorySecretSource` and a FakeHome. Nothing here touches the Keychain or the environment.

use std::path::Path;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use gamelib_core::clock::Clock;
use gamelib_core::shutdown::Shutdown;
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform};
use gamelib_info::http::ReqwestHttp;
use gamelib_info::secrets::{
    migrate_sgdb_plaintext, KeySource, MemorySecretSource, MigrationOutcome, SecretSource, Slot,
    FAILURE_MEMO_MS,
};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;

/// A settable clock, for the failure memo.
struct TestClock(AtomicU64);

impl Clock for TestClock {
    fn now_ms(&self) -> u64 {
        self.0.load(Ordering::SeqCst)
    }
}

/// Counts every call, and can be told to fail reads, writes or both.
#[derive(Default)]
struct Probe {
    inner: MemorySecretSource,
    gets: AtomicUsize,
    sets: AtomicUsize,
    deletes: AtomicUsize,
    fail_get: Mutex<Option<&'static str>>,
    fail_set: Mutex<Option<&'static str>>,
    /// When set, a `get` answers this instead of the stored value (a keyring that lies).
    lie_get: Mutex<Option<String>>,
}

impl SecretSource for Probe {
    fn get(&self, slot: Slot) -> Result<Option<String>, String> {
        self.gets.fetch_add(1, Ordering::SeqCst);
        if let Some(e) = *self.fail_get.lock().unwrap() {
            return Err(e.to_string());
        }
        if let Some(v) = self.lie_get.lock().unwrap().clone() {
            return Ok(Some(v));
        }
        self.inner.get(slot)
    }
    fn set(&self, slot: Slot, value: &str) -> Result<(), String> {
        self.sets.fetch_add(1, Ordering::SeqCst);
        if let Some(e) = *self.fail_set.lock().unwrap() {
            return Err(e.to_string());
        }
        self.inner.set(slot, value)
    }
    fn delete(&self, slot: Slot) -> Result<(), String> {
        self.deletes.fetch_add(1, Ordering::SeqCst);
        if let Some(e) = *self.fail_set.lock().unwrap() {
            return Err(e.to_string());
        }
        self.inner.delete(slot)
    }
}

struct Fixture {
    home: FakeHome,
    ctx: InfoCtx,
    probe: Arc<Probe>,
    clock: Arc<TestClock>,
}

impl Fixture {
    fn new() -> Fixture {
        let home = FakeHome::new("secrets-");
        let user_data = home.root().join("userData");
        std::fs::create_dir_all(user_data.join("store")).unwrap();
        let clock = Arc::new(TestClock(AtomicU64::new(1_000_000)));
        let probe = Arc::new(Probe::default());
        let mut ctx = InfoCtx::new(
            Arc::new(StoreHost::new()),
            clock.clone(),
            Platform::Linux,
            InfoPaths {
                app_folder: user_data.clone(),
                user_data,
                temp: home.root().join("temp"),
                public_dir: None,
            },
            "0.0.0-test".to_string(),
            Shutdown::new(),
            Arc::new(ReqwestHttp::new()),
        );
        ctx.secrets = Some(probe.clone());
        Fixture {
            home,
            ctx,
            probe,
            clock,
        }
    }

    fn app_folder(&self) -> std::path::PathBuf {
        self.home.root().join("userData")
    }

    fn write_settings(&self, text: &str) {
        std::fs::write(self.app_folder().join("config.json"), text).unwrap();
    }

    fn write_mirror(&self, text: &str) {
        std::fs::write(self.app_folder().join("store").join("config.json"), text).unwrap();
    }

    fn read(&self, path: &Path) -> String {
        std::fs::read_to_string(path).unwrap()
    }
}

// ---- ItadKey ----

#[test]
fn itad_precedence_is_user_then_env_then_baked() {
    let mut f = Fixture::new();
    f.ctx.itad_env_key = Some("env-key".into());
    f.ctx.itad_baked_key = Some("baked-key".into());

    // No user key: the env key wins over the baked one.
    let got = f.ctx.itad_key.effective(&f.ctx).unwrap();
    assert_eq!((got.key.as_str(), got.source), ("env-key", KeySource::Env));

    // A user key beats both.
    f.ctx.itad_key.set(&f.ctx, "t", "user-key").unwrap();
    let got = f.ctx.itad_key.effective(&f.ctx).unwrap();
    assert_eq!(
        (got.key.as_str(), got.source),
        ("user-key", KeySource::User)
    );

    // No env key: the baked key is used.
    f.ctx.itad_key.set(&f.ctx, "t", "").unwrap();
    f.ctx.itad_env_key = None;
    let got = f.ctx.itad_key.effective(&f.ctx).unwrap();
    assert_eq!(
        (got.key.as_str(), got.source),
        ("baked-key", KeySource::Baked)
    );

    // Nothing at all: no key, which the adapter turns into notConfigured.
    f.ctx.itad_baked_key = None;
    assert!(f.ctx.itad_key.effective(&f.ctx).is_none());
}

#[test]
fn itad_blank_env_and_baked_keys_do_not_count() {
    let mut f = Fixture::new();
    f.ctx.itad_env_key = Some("  \t".into());
    f.ctx.itad_baked_key = Some("".into());
    assert!(f.ctx.itad_key.effective(&f.ctx).is_none());
    f.ctx.itad_env_key = Some("  padded  ".into());
    assert_eq!(f.ctx.itad_key.effective(&f.ctx).unwrap().key, "padded");
}

#[test]
fn itad_source_labels_are_the_golden_key_per_request_words() {
    assert_eq!(KeySource::User.label(), "user");
    assert_eq!(KeySource::Env.label(), "env");
    assert_eq!(KeySource::Baked.label(), "baked");
}

#[test]
fn itad_rejected_user_key_is_skipped_until_a_set_clears_the_flag() {
    let mut f = Fixture::new();
    f.ctx.itad_baked_key = Some("baked-key".into());
    f.ctx.itad_key.set(&f.ctx, "t", "user-key").unwrap();
    assert!(!f.ctx.itad_key.is_rejected());

    f.ctx.itad_key.mark_rejected();
    assert!(f.ctx.itad_key.is_rejected());
    let got = f.ctx.itad_key.effective(&f.ctx).unwrap();
    assert_eq!(got.source, KeySource::Baked);
    // The stored key is still there; only this session ignores it.
    assert_eq!(
        f.ctx.itad_key.get(&f.ctx, "t").unwrap().as_deref(),
        Some("user-key")
    );

    // Saving a key clears the flag, even when it is the same key.
    f.ctx.itad_key.set(&f.ctx, "t", "user-key").unwrap();
    assert!(!f.ctx.itad_key.is_rejected());
    assert_eq!(
        f.ctx.itad_key.effective(&f.ctx).unwrap().source,
        KeySource::User
    );
}

#[test]
fn itad_clearing_the_key_also_clears_the_rejected_flag() {
    let f = Fixture::new();
    f.ctx.itad_key.mark_rejected();
    f.ctx.itad_key.set(&f.ctx, "t", "   ").unwrap();
    assert!(!f.ctx.itad_key.is_rejected());
}

#[test]
fn itad_a_failing_write_still_clears_the_rejected_flag() {
    let f = Fixture::new();
    *f.probe.fail_set.lock().unwrap() = Some("unavailable");
    f.ctx.itad_key.mark_rejected();
    assert!(f.ctx.itad_key.set(&f.ctx, "t", "k").is_err());
    assert!(!f.ctx.itad_key.is_rejected());
}

#[test]
fn itad_effective_is_total_when_the_source_is_missing_or_failing() {
    let mut f = Fixture::new();
    f.ctx.itad_baked_key = Some("baked-key".into());
    *f.probe.fail_get.lock().unwrap() = Some("timeout");
    assert_eq!(
        f.ctx.itad_key.effective(&f.ctx).unwrap().source,
        KeySource::Baked
    );
    f.ctx.secrets = None;
    assert_eq!(
        f.ctx.itad_key.effective(&f.ctx).unwrap().source,
        KeySource::Baked
    );
}

#[test]
fn a_resolved_key_debug_never_prints_the_key() {
    let mut f = Fixture::new();
    f.ctx.itad_baked_key = Some("super-secret-value".into());
    let shown = format!("{:?}", f.ctx.itad_key.effective(&f.ctx).unwrap());
    assert!(shown.contains("Baked"));
    assert!(!shown.contains("super-secret-value"));
}

// ---- The shared owner behaviour, through SgdbKey ----

#[test]
fn set_trims_and_stores_the_trimmed_value() {
    let f = Fixture::new();
    f.ctx.sgdb_key.set(&f.ctx, "t", "  key-1 \n").unwrap();
    assert_eq!(
        f.probe.inner.get(Slot::SteamGridDb).unwrap().as_deref(),
        Some("key-1")
    );
    assert_eq!(
        f.ctx.sgdb_key.get(&f.ctx, "t").unwrap().as_deref(),
        Some("key-1")
    );
}

#[test]
fn an_empty_or_blank_value_clears_the_slot() {
    let f = Fixture::new();
    f.ctx.sgdb_key.set(&f.ctx, "t", "key-1").unwrap();
    f.ctx.sgdb_key.set(&f.ctx, "t", "  ").unwrap();
    assert_eq!(f.probe.deletes.load(Ordering::SeqCst), 1);
    assert_eq!(f.probe.sets.load(Ordering::SeqCst), 1);
    assert_eq!(f.ctx.sgdb_key.get(&f.ctx, "t").unwrap(), None);
    assert_eq!(f.probe.inner.get(Slot::SteamGridDb).unwrap(), None);
}

#[test]
fn reads_are_cached_and_a_set_drops_the_cache() {
    let f = Fixture::new();
    f.probe.inner.set(Slot::SteamGridDb, "stored").unwrap();
    for _ in 0..3 {
        assert_eq!(
            f.ctx.sgdb_key.get(&f.ctx, "t").unwrap().as_deref(),
            Some("stored")
        );
    }
    assert_eq!(f.probe.gets.load(Ordering::SeqCst), 1, "one Keychain read");

    // Behind the owner's back the slot changes; the cache still answers.
    f.probe.inner.set(Slot::SteamGridDb, "changed").unwrap();
    assert_eq!(
        f.ctx.sgdb_key.get(&f.ctx, "t").unwrap().as_deref(),
        Some("stored")
    );
    // `invalidate` (what a set does first) makes the next read a real one.
    f.ctx.sgdb_key.invalidate();
    assert_eq!(
        f.ctx.sgdb_key.get(&f.ctx, "t").unwrap().as_deref(),
        Some("changed")
    );
    assert_eq!(f.probe.gets.load(Ordering::SeqCst), 2);
}

#[test]
fn an_absent_slot_is_cached_too() {
    let f = Fixture::new();
    for _ in 0..3 {
        assert_eq!(f.ctx.sgdb_key.get(&f.ctx, "t").unwrap(), None);
    }
    assert_eq!(f.probe.gets.load(Ordering::SeqCst), 1);
}

#[test]
fn a_successful_set_caches_the_written_value_without_a_read() {
    let f = Fixture::new();
    f.ctx.sgdb_key.set(&f.ctx, "t", "fresh").unwrap();
    assert_eq!(
        f.ctx.sgdb_key.get(&f.ctx, "t").unwrap().as_deref(),
        Some("fresh")
    );
    assert_eq!(f.probe.gets.load(Ordering::SeqCst), 0);
}

/// A source whose first read parks until released and whose write parks until released, so a test
/// can interleave one read inside one write.
struct GatedSource {
    inner: MemorySecretSource,
    get_entered: Mutex<std::sync::mpsc::Sender<()>>,
    get_release: Mutex<std::sync::mpsc::Receiver<()>>,
    set_entered: Mutex<std::sync::mpsc::Sender<()>>,
    set_release: Mutex<std::sync::mpsc::Receiver<()>>,
    first_get: AtomicUsize,
}

impl SecretSource for GatedSource {
    fn get(&self, slot: Slot) -> Result<Option<String>, String> {
        let answer = self.inner.get(slot);
        if self.first_get.fetch_add(1, Ordering::SeqCst) == 0 {
            self.get_entered.lock().unwrap().send(()).unwrap();
            self.get_release.lock().unwrap().recv().unwrap();
        }
        answer
    }
    fn set(&self, slot: Slot, value: &str) -> Result<(), String> {
        self.set_entered.lock().unwrap().send(()).unwrap();
        self.set_release.lock().unwrap().recv().unwrap();
        self.inner.set(slot, value)
    }
    fn delete(&self, slot: Slot) -> Result<(), String> {
        self.inner.delete(slot)
    }
}

#[test]
fn a_read_that_overlaps_a_set_cannot_cache_the_older_key() {
    use std::sync::mpsc::channel;
    let (get_entered_tx, get_entered_rx) = channel();
    let (get_release_tx, get_release_rx) = channel();
    let (set_entered_tx, set_entered_rx) = channel();
    let (set_release_tx, set_release_rx) = channel();
    let source = Arc::new(GatedSource {
        inner: MemorySecretSource::with(Slot::SteamGridDb, "old"),
        get_entered: Mutex::new(get_entered_tx),
        get_release: Mutex::new(get_release_rx),
        set_entered: Mutex::new(set_entered_tx),
        set_release: Mutex::new(set_release_rx),
        first_get: AtomicUsize::new(0),
    });
    let mut f = Fixture::new();
    f.ctx.secrets = Some(source.clone());
    let ctx = Arc::new(f.ctx);

    // The write starts: the cache is dropped and the keyring write is in progress.
    let writer = {
        let ctx = ctx.clone();
        std::thread::spawn(move || ctx.sgdb_key.set(&ctx, "t", "new").unwrap())
    };
    set_entered_rx.recv().unwrap();
    // A read starts during the write and gets the old key from the source.
    let reader = {
        let ctx = ctx.clone();
        std::thread::spawn(move || ctx.sgdb_key.get(&ctx, "t").unwrap())
    };
    get_entered_rx.recv().unwrap();
    // The write finishes first, then the read returns.
    set_release_tx.send(()).unwrap();
    writer.join().unwrap();
    get_release_tx.send(()).unwrap();
    assert_eq!(reader.join().unwrap().as_deref(), Some("old"));

    // The read's stale answer must not have been cached over the written key.
    assert_eq!(ctx.sgdb_key.get(&ctx, "t").unwrap().as_deref(), Some("new"));
}

#[test]
fn a_failed_set_leaves_nothing_cached_and_names_only_the_category() {
    let f = Fixture::new();
    f.probe.inner.set(Slot::SteamGridDb, "old").unwrap();
    assert!(f.ctx.sgdb_key.get(&f.ctx, "t").is_ok());
    *f.probe.fail_set.lock().unwrap() = Some("unavailable");
    let err = f.ctx.sgdb_key.set(&f.ctx, "t", "new-value").unwrap_err();
    assert_eq!(err, "t:secret-unavailable");
    assert!(!err.contains("new-value"));
    // The stale cache was dropped by the set, so the next read goes to the source.
    f.probe.gets.store(0, Ordering::SeqCst);
    assert_eq!(
        f.ctx.sgdb_key.get(&f.ctx, "t").unwrap().as_deref(),
        Some("old")
    );
    assert_eq!(f.probe.gets.load(Ordering::SeqCst), 1);
}

#[test]
fn a_failed_read_is_memoised_for_two_minutes_then_retried() {
    let f = Fixture::new();
    *f.probe.fail_get.lock().unwrap() = Some("timeout");
    let first = f.ctx.sgdb_key.get(&f.ctx, "t").unwrap_err();
    assert_eq!(first, "t:secret-timeout");
    assert_eq!(f.ctx.sgdb_key.get(&f.ctx, "t").unwrap_err(), first);
    assert_eq!(f.probe.gets.load(Ordering::SeqCst), 1, "the memo answered");

    // Just inside the window: still memoised.
    f.clock.0.fetch_add(FAILURE_MEMO_MS - 1, Ordering::SeqCst);
    assert!(f.ctx.sgdb_key.get(&f.ctx, "t").is_err());
    assert_eq!(f.probe.gets.load(Ordering::SeqCst), 1);

    // Past it, with the Keychain back: a real read, and the memo is gone.
    f.clock.0.fetch_add(1, Ordering::SeqCst);
    *f.probe.fail_get.lock().unwrap() = None;
    f.probe.inner.set(Slot::SteamGridDb, "back").unwrap();
    assert_eq!(
        f.ctx.sgdb_key.get(&f.ctx, "t").unwrap().as_deref(),
        Some("back")
    );
    assert_eq!(f.probe.gets.load(Ordering::SeqCst), 2);
}

#[test]
fn a_set_drops_the_failure_memo() {
    let f = Fixture::new();
    *f.probe.fail_get.lock().unwrap() = Some("timeout");
    assert!(f.ctx.sgdb_key.get(&f.ctx, "t").is_err());
    *f.probe.fail_get.lock().unwrap() = None;
    f.ctx.sgdb_key.set(&f.ctx, "t", "k").unwrap();
    assert_eq!(
        f.ctx.sgdb_key.get(&f.ctx, "t").unwrap().as_deref(),
        Some("k")
    );
}

#[test]
fn no_source_answers_the_fixed_no_secret_source_error() {
    let mut f = Fixture::new();
    f.ctx.secrets = None;
    assert_eq!(
        f.ctx.sgdb_key.get(&f.ctx, "sgdb_search").unwrap_err(),
        "sgdb_search:no-secret-source"
    );
    assert_eq!(
        f.ctx.sgdb_key.set(&f.ctx, "sgdb_set", "k").unwrap_err(),
        "sgdb_set:no-secret-source"
    );
    assert_eq!(
        f.ctx.itad_key.get(&f.ctx, "itad_search").unwrap_err(),
        "itad_search:no-secret-source"
    );
}

#[test]
fn the_two_owners_use_their_own_slots() {
    let f = Fixture::new();
    f.ctx.sgdb_key.set(&f.ctx, "t", "sgdb").unwrap();
    f.ctx.itad_key.set(&f.ctx, "t", "itad").unwrap();
    assert_eq!(
        f.probe.inner.get(Slot::SteamGridDb).unwrap().as_deref(),
        Some("sgdb")
    );
    assert_eq!(
        f.probe.inner.get(Slot::Itad).unwrap().as_deref(),
        Some("itad")
    );
}

// ---- migrate_sgdb_plaintext ----

const MIRROR_WITH_KEY: &str =
    r#"{"settings":{"language":"en","steamGridDbApiKey":"plain-key"},"games":{"recent":[]}}"#;

fn settings_doc(key_json: &str) -> String {
    format!(
        "{{\n  \"defaultSettings\": {{\n    \"language\": \"en\",\n    \"steamGridDbApiKey\": {key_json}\n  }},\n  \"version\": \"v2\"\n}}"
    )
}

#[test]
fn migration_moves_the_key_proves_it_and_clears_both_settings_copies() {
    let f = Fixture::new();
    f.write_settings(&settings_doc("\"plain-key\""));
    f.write_mirror(MIRROR_WITH_KEY);

    assert_eq!(migrate_sgdb_plaintext(&f.ctx), MigrationOutcome::Migrated);

    // The keyring holds it.
    assert_eq!(
        f.probe.inner.get(Slot::SteamGridDb).unwrap().as_deref(),
        Some("plain-key")
    );
    // The order was write, then a real read back (the cache was dropped in between).
    assert_eq!(f.probe.sets.load(Ordering::SeqCst), 1);
    assert_eq!(f.probe.gets.load(Ordering::SeqCst), 1);

    // The document keeps everything else and now holds the empty string.
    let doc = f.read(&f.app_folder().join("config.json"));
    assert!(!doc.contains("plain-key"), "{doc}");
    assert!(doc.contains("\"steamGridDbApiKey\": \"\""), "{doc}");
    assert!(doc.contains("\"language\": \"en\""), "{doc}");
    assert!(doc.contains("\"version\": \"v2\""), "{doc}");

    // So does the renderer's mirror, with its other keys intact.
    let mirror = f.read(&f.app_folder().join("store").join("config.json"));
    assert!(!mirror.contains("plain-key"), "{mirror}");
    assert!(mirror.contains("\"steamGridDbApiKey\""), "{mirror}");
    assert!(mirror.contains("\"games\""), "{mirror}");
}

#[test]
fn migration_is_idempotent() {
    let f = Fixture::new();
    f.write_settings(&settings_doc("\"plain-key\""));
    assert_eq!(migrate_sgdb_plaintext(&f.ctx), MigrationOutcome::Migrated);
    let after_first = f.read(&f.app_folder().join("config.json"));
    let sets = f.probe.sets.load(Ordering::SeqCst);

    assert_eq!(
        migrate_sgdb_plaintext(&f.ctx),
        MigrationOutcome::NothingToDo
    );
    assert_eq!(f.probe.sets.load(Ordering::SeqCst), sets, "no second write");
    assert_eq!(f.read(&f.app_folder().join("config.json")), after_first);
}

#[test]
fn migration_with_no_plaintext_does_nothing() {
    let f = Fixture::new();
    // No settings document at all, an empty value, a missing key and a non-string value.
    assert_eq!(
        migrate_sgdb_plaintext(&f.ctx),
        MigrationOutcome::NothingToDo
    );
    for text in [
        settings_doc("\"\""),
        settings_doc("null"),
        settings_doc("42"),
        "{\"defaultSettings\": {\"language\": \"en\"}, \"version\": \"v2\"}".to_string(),
    ] {
        let probe = Fixture::new();
        probe.write_settings(&text);
        assert_eq!(
            migrate_sgdb_plaintext(&probe.ctx),
            MigrationOutcome::NothingToDo,
            "{text}"
        );
        assert_eq!(probe.probe.sets.load(Ordering::SeqCst), 0);
        assert_eq!(probe.read(&probe.app_folder().join("config.json")), text);
    }
}

#[test]
fn a_blank_setting_never_deletes_a_stored_key() {
    let f = Fixture::new();
    f.probe.inner.set(Slot::SteamGridDb, "real-key").unwrap();
    f.write_settings(&settings_doc("\"   \""));
    assert_eq!(
        migrate_sgdb_plaintext(&f.ctx),
        MigrationOutcome::NothingToDo
    );
    assert_eq!(f.probe.deletes.load(Ordering::SeqCst), 0);
    assert_eq!(
        f.probe.inner.get(Slot::SteamGridDb).unwrap().as_deref(),
        Some("real-key")
    );
}

#[test]
fn a_read_back_mismatch_leaves_the_plaintext_in_place() {
    let f = Fixture::new();
    let text = settings_doc("\"plain-key\"");
    f.write_settings(&text);
    f.write_mirror(MIRROR_WITH_KEY);
    *f.probe.lie_get.lock().unwrap() = Some("something-else".to_string());

    assert_eq!(
        migrate_sgdb_plaintext(&f.ctx),
        MigrationOutcome::ReadBackFailed
    );
    assert_eq!(f.read(&f.app_folder().join("config.json")), text);
    assert_eq!(
        f.read(&f.app_folder().join("store").join("config.json")),
        MIRROR_WITH_KEY
    );
}

#[test]
fn a_failing_read_back_leaves_the_plaintext_in_place() {
    let f = Fixture::new();
    let text = settings_doc("\"plain-key\"");
    f.write_settings(&text);
    *f.probe.fail_get.lock().unwrap() = Some("timeout");
    assert_eq!(
        migrate_sgdb_plaintext(&f.ctx),
        MigrationOutcome::ReadBackFailed
    );
    assert_eq!(f.read(&f.app_folder().join("config.json")), text);
}

#[test]
fn a_failing_keyring_write_leaves_the_plaintext_in_place() {
    let f = Fixture::new();
    let text = settings_doc("\"plain-key\"");
    f.write_settings(&text);
    *f.probe.fail_set.lock().unwrap() = Some("unavailable");
    assert_eq!(migrate_sgdb_plaintext(&f.ctx), MigrationOutcome::Failed);
    assert_eq!(f.read(&f.app_folder().join("config.json")), text);
}

#[test]
fn with_no_secret_source_the_migration_fails_and_changes_nothing() {
    let mut f = Fixture::new();
    f.ctx.secrets = None;
    let text = settings_doc("\"plain-key\"");
    f.write_settings(&text);
    assert_eq!(migrate_sgdb_plaintext(&f.ctx), MigrationOutcome::Failed);
    assert_eq!(f.read(&f.app_folder().join("config.json")), text);
}

#[test]
fn a_legacy_ciphertext_is_never_written_to_the_keyring() {
    let f = Fixture::new();
    let text = settings_doc("\"sgdb:v1:AAAA\"");
    f.write_settings(&text);
    assert_eq!(migrate_sgdb_plaintext(&f.ctx), MigrationOutcome::Ciphertext);
    assert_eq!(f.probe.sets.load(Ordering::SeqCst), 0);
    assert_eq!(f.read(&f.app_folder().join("config.json")), text);
}

#[test]
fn a_padded_plaintext_is_stored_trimmed() {
    let f = Fixture::new();
    f.write_settings(&settings_doc("\"  padded-key \""));
    assert_eq!(migrate_sgdb_plaintext(&f.ctx), MigrationOutcome::Migrated);
    assert_eq!(
        f.probe.inner.get(Slot::SteamGridDb).unwrap().as_deref(),
        Some("padded-key")
    );
}

#[test]
fn a_migration_without_a_mirror_still_clears_the_document() {
    let f = Fixture::new();
    f.write_settings(&settings_doc("\"plain-key\""));
    // No store/config.json at all: nothing to clear there, and none is created.
    assert_eq!(migrate_sgdb_plaintext(&f.ctx), MigrationOutcome::Migrated);
    assert!(!f.app_folder().join("store").join("config.json").exists());
}

// ---- spawn_sgdb_migration: the migration as bounded boot work (86-15, D-26) ----

use gamelib_info::{spawn_sgdb_migration, SGDB_MIGRATION_BOUND};
use std::sync::mpsc;
use std::time::Duration;

/// Runs the boot migration over `ctx` and returns the one word it reported.
fn run_boot_migration(ctx: Arc<InfoCtx>, bound: Duration) -> String {
    let (tx, rx) = mpsc::channel();
    spawn_sgdb_migration(ctx, bound, move |word| {
        let _ = tx.send(word.to_string());
    })
    .unwrap();
    rx.recv_timeout(Duration::from_secs(10))
        .expect("the boot migration reported nothing")
}

#[test]
fn the_boot_migration_is_bounded_at_ten_seconds() {
    assert_eq!(SGDB_MIGRATION_BOUND, Duration::from_secs(10));
}

#[test]
fn the_boot_migration_moves_the_key_in_the_background_and_releases_its_registrant() {
    let f = Fixture::new();
    f.write_settings(&settings_doc("\"plain-key\""));
    let shutdown = f.ctx.shutdown.clone();
    let probe = f.probe.clone();
    let settings = f.app_folder().join("config.json");
    let word = run_boot_migration(Arc::new(f.ctx), Duration::from_secs(10));
    assert_eq!(word, "migrated");
    assert_eq!(
        probe.inner.get(Slot::SteamGridDb).unwrap().as_deref(),
        Some("plain-key")
    );
    assert!(!std::fs::read_to_string(settings)
        .unwrap()
        .contains("plain-key"));
    // The registrant named for the work is gone once it has finished.
    assert!(shutdown.drain(Duration::from_secs(2)).is_empty());
}

#[test]
fn the_boot_migration_with_nothing_to_move_reports_it_and_touches_no_keyring() {
    let f = Fixture::new();
    let probe = f.probe.clone();
    assert_eq!(
        run_boot_migration(Arc::new(f.ctx), Duration::from_secs(10)),
        "nothing-to-do"
    );
    assert_eq!(probe.gets.load(Ordering::SeqCst), 0);
    assert_eq!(probe.sets.load(Ordering::SeqCst), 0);
}

#[test]
fn the_report_word_is_never_the_key() {
    let f = Fixture::new();
    f.write_settings(&settings_doc("\"sgdb:v1:AAAA\""));
    let word = run_boot_migration(Arc::new(f.ctx), Duration::from_secs(10));
    assert_eq!(word, "ciphertext-left-in-place");
    assert!(!word.contains("AAAA"));
}

/// A keyring whose write takes `0` to finish.
struct SlowSet(Duration, MemorySecretSource);

impl SecretSource for SlowSet {
    fn get(&self, slot: Slot) -> Result<Option<String>, String> {
        self.1.get(slot)
    }
    fn set(&self, slot: Slot, value: &str) -> Result<(), String> {
        std::thread::sleep(self.0);
        self.1.set(slot, value)
    }
    fn delete(&self, slot: Slot) -> Result<(), String> {
        self.1.delete(slot)
    }
}

#[test]
fn a_slow_keyring_ends_the_wait_at_the_bound_but_the_work_keeps_its_registrant_until_done() {
    let mut f = Fixture::new();
    f.write_settings(&settings_doc("\"plain-key\""));
    f.ctx.secrets = Some(Arc::new(SlowSet(
        Duration::from_millis(600),
        MemorySecretSource::new(),
    )));
    let shutdown = f.ctx.shutdown.clone();
    let started = std::time::Instant::now();
    let word = run_boot_migration(Arc::new(f.ctx), Duration::from_millis(50));
    assert_eq!(word, "timeout");
    assert!(
        started.elapsed() < Duration::from_millis(500),
        "the wait ended at the bound, not when the keyring answered"
    );
    // The worker is still inside the keyring write: it holds the registrant, so an exit that began
    // now would wait for it within its budget rather than cut the write short.
    assert_eq!(
        shutdown.drain(Duration::from_millis(1)),
        ["info-sgdb-migrate"]
    );
}

#[test]
fn a_migration_that_panics_reports_panic() {
    struct Boom;
    impl SecretSource for Boom {
        fn get(&self, _slot: Slot) -> Result<Option<String>, String> {
            panic!("boom")
        }
        fn set(&self, _slot: Slot, _value: &str) -> Result<(), String> {
            panic!("boom")
        }
        fn delete(&self, _slot: Slot) -> Result<(), String> {
            panic!("boom")
        }
    }
    let mut f = Fixture::new();
    f.write_settings(&settings_doc("\"plain-key\""));
    f.ctx.secrets = Some(Arc::new(Boom));
    assert_eq!(
        run_boot_migration(Arc::new(f.ctx), Duration::from_secs(10)),
        "panic"
    );
}

#[test]
fn a_migration_requested_after_shutdown_began_is_not_started() {
    let f = Fixture::new();
    f.write_settings(&settings_doc("\"plain-key\""));
    let probe = f.probe.clone();
    let settings = f.app_folder().join("config.json");
    // Begin the exit: the token is cancelled.
    assert!(f.ctx.shutdown.drain(Duration::from_millis(1)).is_empty());
    assert_eq!(
        run_boot_migration(Arc::new(f.ctx), Duration::from_secs(10)),
        "shutdown"
    );
    assert_eq!(probe.sets.load(Ordering::SeqCst), 0);
    assert!(std::fs::read_to_string(settings)
        .unwrap()
        .contains("plain-key"));
}

/// A source whose reads and writes park until the test lets them go (a Keychain behind a prompt).
struct Stuck {
    release: Mutex<std::sync::mpsc::Receiver<()>>,
}

impl SecretSource for Stuck {
    fn get(&self, _slot: Slot) -> Result<Option<String>, String> {
        let _ = self.release.lock().unwrap().recv();
        Ok(None)
    }
    fn set(&self, _slot: Slot, _value: &str) -> Result<(), String> {
        let _ = self.release.lock().unwrap().recv();
        Ok(())
    }
    fn delete(&self, _slot: Slot) -> Result<(), String> {
        let _ = self.release.lock().unwrap().recv();
        Ok(())
    }
}

/// WR-04: a Keychain read or write that is parked must not keep a guarded op from answering
/// `<op>:shutdown`, nor keep the op's `info` registrant held.
#[tokio::test(flavor = "multi_thread", worker_threads = 3)]
async fn a_parked_keychain_call_does_not_hold_an_op_past_shutdown() {
    use gamelib_info::dispatch;
    use std::time::Duration;

    for (op, args) in [
        ("info_itad_key_status", serde_json::json!({})),
        ("info_steamgrid_has_key", serde_json::json!({})),
        ("info_itad_set_key", serde_json::json!({ "key": "k" })),
        ("info_steamgrid_set_key", serde_json::json!({ "key": "k" })),
    ] {
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let mut f = Fixture::new();
        f.ctx.secrets = Some(Arc::new(Stuck {
            release: Mutex::new(release_rx),
        }));
        let _home = f.home;
        let ctx = Arc::new(f.ctx);
        let token = ctx.shutdown.token();
        let canceller = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(100)).await;
            token.cancel();
        });
        // Spawned, so a read that blocks its worker thread shows up as a timeout and not a hang.
        let running = {
            let ctx = Arc::clone(&ctx);
            tokio::spawn(async move { dispatch(op, &[args], &ctx).await })
        };
        let out = tokio::time::timeout(Duration::from_secs(5), running)
            .await
            .unwrap_or_else(|_| panic!("{op} was not cancelled by shutdown"))
            .unwrap();
        canceller.await.unwrap();
        assert_eq!(out, Err(format!("{op}:shutdown")));
        assert!(
            ctx.shutdown.drain(Duration::from_millis(500)).is_empty(),
            "{op} must release its registrant"
        );
        // Let the parked pool thread finish.
        let _ = release_tx.send(());
    }
}
