//! `CacheView` against the TS `CacheStore` (`src/backend/__tests__/cache.test.ts`), plus the cases
//! the TS suite never had: dotted titles, integer-like keys, the per-store invalidate checks and a
//! read-only store. Every store is opened through a StoreHost rooted in a FakeHome.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use gamelib_core::clock::Clock;
use gamelib_info::cache_view::{
    js_date_string, parse_js_date, CacheParams, CacheView, InvalidateCheck, CROSSOVER_INDEX, UMU,
    WIKIGAMEINFO,
};
use gamelib_store::host::{Store, StoreHost};
use gamelib_store::json::{parse, to_compact_bytes, Json, Num};
use gamelib_testutil::FakeHome;

/// A settable clock, so a test can write at one time and read at another.
struct TestClock(AtomicU64);

impl TestClock {
    fn new(ms: u64) -> Arc<TestClock> {
        Arc::new(TestClock(AtomicU64::new(ms)))
    }
    fn set(&self, ms: u64) {
        self.0.store(ms, Ordering::SeqCst);
    }
}

impl Clock for TestClock {
    fn now_ms(&self) -> u64 {
        self.0.load(Ordering::SeqCst)
    }
}

/// `Sat Nov 21 2026 18:07:08 GMT+0000`, the instant the plan's `Date()` example names.
const NOW: u64 = 1_795_284_428_000;
const MINUTE: u64 = 60_000;
const HOUR: u64 = 60 * MINUTE;
const DAY: u64 = 24 * HOUR;

/// The TS suite's `new CacheStore('test_store', undefined, ...)`: 6 hours, the default check.
const TEST_STORE: CacheParams = CacheParams {
    store: "test_store",
    lifespan_min: Some(60 * 6),
    invalidate: InvalidateCheck::Always,
};

struct Fixture {
    _home: FakeHome,
    user_data: PathBuf,
    host: StoreHost,
    clock: Arc<TestClock>,
}

impl Fixture {
    fn new() -> Fixture {
        let home = FakeHome::new("cache-view-");
        let user_data = home.root().join("userData");
        std::fs::create_dir_all(user_data.join("store_cache")).unwrap();
        Fixture {
            _home: home,
            user_data,
            host: StoreHost::new(),
            clock: TestClock::new(NOW),
        }
    }

    fn view(&self, params: CacheParams) -> CacheView {
        CacheView::open(&self.host, &self.user_data, params, self.clock.clone()).unwrap()
    }

    /// The host's own handle on the same file: what the TS suite calls `internalStore`.
    fn internal(&self, name: &str) -> Arc<Store> {
        self.host
            .open_cache(&self.user_data.join("store_cache"), name)
            .unwrap()
    }

    fn file(&self, name: &str) -> PathBuf {
        self.user_data
            .join("store_cache")
            .join(format!("{name}.json"))
    }
}

fn text(s: &str) -> Json {
    Json::Str(s.to_string())
}

fn date_at(ms: u64) -> Json {
    text(&js_date_string(ms as i64))
}

#[test]
fn js_date_string_is_the_utc_form_node_prints() {
    // `TZ=UTC node -e 'String(new Date(1795284428000))'`
    assert_eq!(
        js_date_string(1_795_284_428_000),
        "Sat Nov 21 2026 18:07:08 GMT+0000 (Coordinated Universal Time)"
    );
    // The epoch, a single-digit day (zero padded) and a leap day.
    assert_eq!(
        js_date_string(0),
        "Thu Jan 01 1970 00:00:00 GMT+0000 (Coordinated Universal Time)"
    );
    assert_eq!(
        js_date_string(1_709_209_199_000),
        "Wed Feb 28 2024 11:59:59 GMT+0000 (Coordinated Universal Time)"
    );
    assert_eq!(
        js_date_string(1_709_251_200_000),
        "Thu Feb 29 2024 12:00:00 GMT+0000 (Coordinated Universal Time)"
    );
}

#[test]
fn js_date_string_reads_back_through_parse_js_date() {
    for ms in [0i64, 1_000, 1_795_284_428_000, 4_102_444_799_000] {
        assert_eq!(parse_js_date(&js_date_string(ms)), Some(ms));
    }
}

#[test]
fn value_is_written() {
    let fx = Fixture::new();
    fx.view(TEST_STORE).set("foo", text("bar")).unwrap();
    assert_eq!(fx.internal("test_store").get("foo"), Some(text("bar")));
    // The entry lives at <userData>/store_cache/<name>.json, never a shared config.json.
    assert!(fx.file("test_store").is_file());
}

#[test]
fn timestamp_is_written() {
    let fx = Fixture::new();
    fx.view(TEST_STORE).set("foo", text("bar")).unwrap();
    assert_eq!(
        fx.internal("test_store").get("__timestamp.foo"),
        Some(date_at(NOW))
    );
}

#[test]
fn valid_value_is_returned() {
    let fx = Fixture::new();
    let view = fx.view(TEST_STORE);
    view.set("foo", text("bar")).unwrap();
    assert_eq!(view.get_opt("foo"), Some(text("bar")));
    assert_eq!(view.get("foo", text("fb")), text("bar"));
}

#[test]
fn invalid_value_is_cleared() {
    let fx = Fixture::new();
    let view = fx.view(TEST_STORE);
    fx.clock.set(NOW - 8 * HOUR);
    view.set("foo", text("bar")).unwrap();
    fx.clock.set(NOW);
    assert_eq!(view.get_opt("foo"), None);
    assert_eq!(view.get("foo", text("fb")), text("fb"));
    let internal = fx.internal("test_store");
    assert!(internal.get("foo").is_none());
    assert!(internal.get("__timestamp.foo").is_none());
}

#[test]
fn custom_lifetime_works() {
    let fx = Fixture::new();
    let view = fx.view(CacheParams {
        store: "test_store_2",
        lifespan_min: Some(60),
        invalidate: InvalidateCheck::Always,
    });
    fx.clock.set(NOW - 3 * HOUR);
    view.set("foo", text("bar")).unwrap();
    fx.clock.set(NOW);
    assert_eq!(view.get_opt("foo"), None);
}

#[test]
fn allows_having_no_expiration_time() {
    let fx = Fixture::new();
    let view = fx.view(CacheParams {
        store: "test_store_2",
        lifespan_min: None,
        invalidate: InvalidateCheck::Always,
    });
    fx.clock.set(NOW - 3 * HOUR);
    view.set("foo", text("bar")).unwrap();
    fx.clock.set(NOW + 400 * DAY);
    assert_eq!(view.get_opt("foo"), Some(text("bar")));
}

#[test]
fn a_missing_timestamp_gives_the_fallback_when_a_lifespan_is_set() {
    let fx = Fixture::new();
    let view = fx.view(TEST_STORE);
    // A value some other writer left without its bookkeeping key.
    fx.internal("test_store").set("bare", text("v")).unwrap();
    assert_eq!(view.get_opt("bare"), None);
    // The entry is left alone: only expiry deletes.
    assert!(fx.internal("test_store").get("bare").is_some());
}

#[test]
fn entries_exclude_timestamp_bookkeeping_on_the_file_backed_store() {
    let fx = Fixture::new();
    let view = fx.view(TEST_STORE);
    view.set("foo", text("bar")).unwrap();
    view.set("baz", text("qux")).unwrap();
    // The nested bookkeeping group really is on disk...
    assert!(matches!(
        fx.internal("test_store").get("__timestamp"),
        Some(Json::Obj(_))
    ));
    // ...but never leaks through entries().
    assert_eq!(
        view.entries(),
        vec![
            ("foo".to_string(), text("bar")),
            ("baz".to_string(), text("qux"))
        ]
    );
}

#[test]
fn has_delete_and_clear() {
    let fx = Fixture::new();
    let view = fx.view(TEST_STORE);
    view.set("a", Json::Num(Num::U(1))).unwrap();
    view.set("b", Json::Num(Num::U(2))).unwrap();
    assert!(view.has("a"));
    assert!(!view.has("nope"));
    view.delete("a").unwrap();
    assert!(!view.has("a"));
    let internal = fx.internal("test_store");
    assert!(internal.get("__timestamp.a").is_none());
    assert!(internal.get("__timestamp.b").is_some());
    view.clear().unwrap();
    assert!(!view.has("b"));
    assert!(view.entries().is_empty());
    assert!(internal.get("__timestamp.b").is_none());
    // Deleting an absent key is not an error.
    view.delete("never-there").unwrap();
}

#[test]
fn a_dotted_title_nests_and_its_timestamp_nests_under_one_timestamp_object() {
    let fx = Fixture::new();
    let view = fx.view(WIKIGAMEINFO);
    let title = "S.T.A.L.K.E.R.";
    view.set(title, text("v")).unwrap();
    // Read it back through the same dot path, fresh.
    assert_eq!(view.get_opt(title), Some(text("v")));
    // On disk: one top-level `S` chain, one top-level `__timestamp` object, no literal dotted key.
    let bytes = std::fs::read(fx.file("wikigameinfo")).unwrap();
    let doc = parse(&bytes).unwrap();
    let obj = doc.as_object().unwrap();
    let keys: Vec<&str> = obj.iter().map(|(k, _)| k.as_str()).collect();
    assert_eq!(keys, ["S", "__internal__", "__timestamp"]);
    // `S.T.A.L.K.E.R.` ends in a dot, so dot-prop's last segment is the empty string.
    assert_eq!(
        String::from_utf8(to_compact_bytes(obj.get("S").unwrap())).unwrap(),
        r#"{"T":{"A":{"L":{"K":{"E":{"R":{"":"v"}}}}}}}"#
    );
    let stamp = format!(
        r#"{{"S":{{"T":{{"A":{{"L":{{"K":{{"E":{{"R":{{"":"{}"}}}}}}}}}}}}}}}}"#,
        js_date_string(NOW as i64)
    );
    assert_eq!(
        String::from_utf8(to_compact_bytes(obj.get("__timestamp").unwrap())).unwrap(),
        stamp
    );
}

#[test]
fn a_dotted_title_expires_and_deletes_both_nested_keys() {
    let fx = Fixture::new();
    let view = fx.view(WIKIGAMEINFO);
    view.set("S.T.A.L.K.E.R.", text("v")).unwrap();
    fx.clock.set(NOW + 31 * DAY);
    assert_eq!(view.get_opt("S.T.A.L.K.E.R."), None);
    assert_eq!(view.get_opt("S.T.A.L.K.E.R."), None);
    assert!(fx.internal("wikigameinfo").get("S.T.A.L.K.E.R.").is_none());
    assert!(fx
        .internal("wikigameinfo")
        .get("__timestamp.S.T.A.L.K.E.R.")
        .is_none());
}

#[test]
fn never_keeps_an_expired_value_and_still_serves_it() {
    // The CrossOver index: `() => false`. TS falls through to `return current_store.get(key)`.
    let fx = Fixture::new();
    let view = fx.view(CROSSOVER_INDEX);
    view.set("index", text("data")).unwrap();
    fx.clock.set(NOW + 3 * DAY);
    assert_eq!(view.get_opt("index"), Some(text("data")));
    let internal = fx.internal("crossover_index");
    assert!(internal.get("index").is_some());
    assert!(internal.get("__timestamp.index").is_some());
}

#[test]
fn when_falsy_keeps_an_expired_truthy_value_and_deletes_a_falsy_one() {
    // umu: `(data) => !data`.
    let fx = Fixture::new();
    let view = fx.view(UMU);
    view.set("gog_1", text("umu-12345")).unwrap();
    view.set("gog_2", Json::Null).unwrap();
    view.set("gog_3", text("")).unwrap();
    fx.clock.set(NOW + 7 * HOUR);
    // Truthy and expired: served, and both keys stay (the TS asymmetry).
    assert_eq!(view.get_opt("gog_1"), Some(text("umu-12345")));
    let internal = fx.internal("umu");
    assert!(internal.get("gog_1").is_some());
    assert!(internal.get("__timestamp.gog_1").is_some());
    // Falsy and expired: both keys deleted, the fallback returned.
    assert_eq!(view.get_opt("gog_2"), None);
    assert_eq!(view.get_opt("gog_3"), None);
    assert!(internal.get("gog_2").is_none());
    assert!(internal.get("__timestamp.gog_2").is_none());
    assert!(internal.get("gog_3").is_none());
}

#[test]
fn an_unreadable_timestamp_serves_the_value_as_js_does() {
    // `new Date('garbage').getTime()` is NaN and `NaN > lifespan` is false.
    let fx = Fixture::new();
    let view = fx.view(TEST_STORE);
    let internal = fx.internal("test_store");
    internal.set("foo", text("bar")).unwrap();
    internal.set("__timestamp.foo", text("not a date")).unwrap();
    assert_eq!(view.get_opt("foo"), Some(text("bar")));
}

#[test]
fn an_iso_timestamp_and_a_numeric_one_are_read_too() {
    let fx = Fixture::new();
    let view = fx.view(TEST_STORE);
    let internal = fx.internal("test_store");
    internal.set("iso", text("v")).unwrap();
    internal
        .set("__timestamp.iso", text("2026-11-21T18:07:08Z"))
        .unwrap();
    internal.set("num", text("v")).unwrap();
    internal
        .set("__timestamp.num", Json::Num(Num::U(NOW)))
        .unwrap();
    assert_eq!(view.get_opt("iso"), Some(text("v")));
    assert_eq!(view.get_opt("num"), Some(text("v")));
    fx.clock.set(NOW + 7 * HOUR);
    assert_eq!(view.get_opt("iso"), None);
    assert_eq!(view.get_opt("num"), None);
}

#[test]
fn an_integer_like_key_lands_in_js_order_matching_the_85_golden_bytes() {
    let fx = Fixture::new();
    let view = fx.view(WIKIGAMEINFO);
    let mut value = gamelib_store::json::Obj::new();
    value.insert_js("score", Json::Num(Num::U(96)));
    value.insert_js("tags", Json::Arr(vec![text("fps"), text("classic")]));
    view.set("480", Json::Obj(value)).unwrap();
    let produced = std::fs::read_to_string(fx.file("wikigameinfo")).unwrap();
    // The 85 golden (the TS bytes) wrote its timestamp as the number 1700000000000; CacheView
    // writes the `Date()` string there. Everything else, including the order `480`, `__internal__`,
    // `__timestamp`, is byte for byte the golden's.
    let golden = std::fs::read_to_string(
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("gamelib-store")
            .join("tests")
            .join("fixtures")
            .join("golden")
            .join("expected")
            .join("cache-ops-dotpath-intkey")
            .join("store_cache")
            .join("wikigameinfo.json"),
    )
    .unwrap();
    assert!(golden.contains("1700000000000"), "the golden moved");
    let expected = golden.replace(
        "1700000000000",
        &format!("\"{}\"", js_date_string(NOW as i64)),
    );
    assert_eq!(produced, expected);
}

#[test]
fn setting_the_same_entry_twice_at_the_same_clock_leaves_identical_bytes() {
    let fx = Fixture::new();
    let view = fx.view(WIKIGAMEINFO);
    view.set("Half-Life", text("v")).unwrap();
    let first = std::fs::read(fx.file("wikigameinfo")).unwrap();
    view.set("Half-Life", text("v")).unwrap();
    assert_eq!(std::fs::read(fx.file("wikigameinfo")).unwrap(), first);
}

#[test]
fn a_read_only_store_refuses_writes_silently_as_ts_does() {
    let fx = Fixture::new();
    // A cache written by a newer GameLib opens read-only (the 85 golden `engine-newer-readonly-cache`).
    let src = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("gamelib-store")
        .join("tests")
        .join("fixtures")
        .join("golden")
        .join("expected")
        .join("engine-newer-readonly-cache")
        .join("store_cache")
        .join("wikigameinfo.json");
    std::fs::copy(&src, fx.file("wikigameinfo")).unwrap();
    let before = std::fs::read(fx.file("wikigameinfo")).unwrap();
    let view = fx.view(WIKIGAMEINFO);
    view.set("foo", text("bar")).unwrap();
    view.delete("a").unwrap();
    view.clear().unwrap();
    assert_eq!(std::fs::read(fx.file("wikigameinfo")).unwrap(), before);
    assert!(view.has("a"));
}
