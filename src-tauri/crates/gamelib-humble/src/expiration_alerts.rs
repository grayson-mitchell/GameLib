//! The Humble expiry digest, ported from `src/backend/humble/expirationAlerts.ts` (Phase 94, D-06,
//! D-17, HSTORE-03).
//!
//! After a library sync, [`detect_and_notify_expiration_transitions`] finds the keys whose `expiration`
//! moved from nothing (or from another date) to a new date, records each one in the
//! `humble_notified_expiration` store, and raises ONE digest notification for the lot.
//!
//! - **Dedupe (D-92).** The record is keyed `gamekey:machineName` and holds `{expiration}`. The same date
//!   seen again is silent; a moved date fires again. The record is written BEFORE the notification is
//!   raised, so no expiry can be shown twice (a key whose record cannot be written is not shown at all).
//! - **Backfill (WR-01).** An entry written before the composite-key migration is keyed by the machine
//!   name alone. When the composite entry is absent and the bare one exists, the bare entry is copied to
//!   the composite key, so an upgrade preserves "already notified". The bare entry stays (idempotent).
//! - **Gates.** A first-ever sync seeds the baseline silently (`suppress_notifications`); the settings
//!   switch (D-93) and Steam Deck Game Mode (Pitfall 4) withhold the toast. All three still advance the
//!   record, so lifting a gate later does not re-fire a date already seen.
//! - **Text.** Title and body come from `humble.notification.*` through [`Catalog::t_unescaped`], the same
//!   keys, defaults and params as the i18next calls, which each pass `interpolation: { escapeValue: false }`
//!   (see below).
//! - **The date** follows the UI language: the resolved language of `ctx.catalog`, the same catalog the
//!   text renders through, which the shell loads from the profile language. A per-language layout
//!   measured from CLDR through Intl is picked by it ([`digest_date`]). `en`, an unshipped language and
//!   a catalog-less context keep the en-US `M/D/YYYY` the TypeScript goldens pin. The calendar day is
//!   still read in the host zone. The TypeScript this was ported from renders the host's locale
//!   instead; the divergence ends when that TypeScript is deleted (94-30).
//!
//! Title and body render through [`Catalog::t_unescaped`], exactly as the TypeScript's per-call
//! `interpolation: { escapeValue: false }`, so a title or date reaches the notification as written
//! (`Tom & Jerry's`, `1/2/2027`). The OS notification is plain text (macOS UNUserNotificationCenter; the
//! Windows toast escapes its own XML), so i18next's default HTML escaping had shown `Tom &amp; Jerry` and
//! `1&#x2F;2&#x2F;2027`. Both sides were fixed together with the goldens (quick 261128-3qh,
//! `2026-11-24-humble-digest-text-is-html-escaped`), so the goldens stay TypeScript-written and no delta
//! exists.
//!
//! Nothing here is wired to a caller yet: the library sync calls it (94-25).

use std::io;

use gamelib_i18n::Catalog;
use gamelib_store::host::Store;
use gamelib_store::json::{Json, Obj};
use serde_json::{Map, Value};

use crate::classify::HumbleKey;
use crate::ctx::HumbleCtx;
use crate::js_date::parse_js_date;
use crate::stores::{js_date_string, HumbleStore};

const MS_PER_DAY: i64 = 86_400_000;

/// What the digest reads of a key: only the display-safe fields (Pitfall 5). The key value and key index
/// are never part of this type, so they cannot reach a notification.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AlertKey {
    pub gamekey: String,
    pub machine_name: String,
    pub title: String,
    pub expiration: Option<String>,
}

impl From<&HumbleKey> for AlertKey {
    fn from(key: &HumbleKey) -> AlertKey {
        AlertKey {
            gamekey: key.gamekey.clone(),
            machine_name: key.machine_name.clone(),
            title: key.title.clone(),
            expiration: key.expiration.clone(),
        }
    }
}

/// What the TypeScript read from outside the function: the `suppressNotifications` option, the
/// `notifyHumbleExpirations` setting and `isSteamDeckGameMode`. This crate reads neither the settings
/// nor the environment, so the caller supplies them.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AlertOptions {
    /// A first-ever sync: seed the baseline and show nothing (locked decision 3).
    pub suppress_notifications: bool,
    /// D-93: `notifyHumbleExpirations === true`.
    pub notify_humble_expirations: bool,
    /// Pitfall 4: no OS toast in Steam Deck Game Mode.
    pub steam_deck_game_mode: bool,
}

/// Why a digest for newly expiring keys was not raised. The record was advanced all the same.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Withheld {
    /// The first-sync baseline.
    Baseline,
    /// `notifyHumbleExpirations` is off.
    SettingOff,
    /// Steam Deck Game Mode.
    SteamDeckGameMode,
    /// The context has no UI to notify through (a headless run).
    NoUi,
}

/// One i18next call the digest makes: the key, the inline default and the params (empty for the titles).
/// Every digest call also passes `interpolation: { escapeValue: false }`, because the notification is
/// plain text; [`DigestCall::to_value`] records it.
#[derive(Debug, Clone, PartialEq)]
pub struct DigestCall {
    pub key: &'static str,
    pub default: &'static str,
    pub params: Map<String, Value>,
}

impl DigestCall {
    /// The call as the golden records it: `[key, default, options]`, where the options are the params
    /// plus `interpolation: { escapeValue: false }` (every digest call passes it, titles included).
    pub fn to_value(&self) -> Value {
        let mut options = self.params.clone();
        let mut interpolation = Map::new();
        interpolation.insert("escapeValue".to_string(), Value::Bool(false));
        options.insert("interpolation".to_string(), Value::Object(interpolation));
        Value::Array(vec![
            Value::String(self.key.to_string()),
            Value::String(self.default.to_string()),
            Value::Object(options),
        ])
    }
}

/// A key that gained or moved an expiration: what the digest copy reads of it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Transition {
    pub title: String,
    /// The expiration as the digest date text, already rendered (see [`digest_date`]).
    pub date: String,
}

/// The digest that was raised.
#[derive(Debug, Clone, PartialEq)]
pub struct Digest {
    pub title: String,
    pub body: String,
    /// The i18next calls it was rendered from, in call order (title, then body).
    pub calls: Vec<DigestCall>,
}

/// What a run did.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct AlertOutcome {
    /// Keys whose expiration changed and whose record was written.
    pub newly_expiring: usize,
    /// The digest, when one was raised.
    pub notification: Option<Digest>,
    /// Why no digest was raised though keys newly expire.
    pub withheld: Option<Withheld>,
    /// Records that could not be written. Such a key is not counted in `newly_expiring` and is not shown.
    pub write_failures: usize,
    /// The notified-expiration store could not be opened: nothing is recorded and nothing is shown.
    pub store_unavailable: bool,
}

/// `detectAndNotifyExpirationTransitions`.
pub fn detect_and_notify_expiration_transitions(
    ctx: &HumbleCtx,
    keys: &[AlertKey],
    opts: &AlertOptions,
) -> AlertOutcome {
    let mut outcome = AlertOutcome::default();
    let Some(store) = HumbleStore::NotifiedExpiration.open(ctx) else {
        // Without the record there is no dedupe, so the safe answer is to show nothing.
        ctx.warn("humble alerts: the notified-expiration store is unavailable");
        outcome.store_unavailable = true;
        return outcome;
    };

    let mut newly_expiring: Vec<Transition> = Vec::new();
    for key in keys {
        let composite = format!("{}:{}", key.gamekey, key.machine_name);

        // WR-01 one-time legacy backfill. A composite key always holds a colon, so a bare machine name
        // cannot collide with one.
        if store.get(&composite).is_none() {
            if let Some(legacy) = store.get(&key.machine_name) {
                if record(ctx, &store, &composite, legacy).is_err() {
                    ctx.warn("humble alerts: a legacy record could not be copied forward");
                    outcome.write_failures += 1;
                }
            }
        }

        let Some(current) = key.expiration.as_deref() else {
            continue;
        };
        let last = store
            .get(&composite)
            .and_then(|entry| expiration_of(&entry));
        if last.as_deref() == Some(current) {
            continue;
        }

        // The dedupe write comes first, and advances under every gate (locked decision 3).
        let mut entry = Obj::new();
        entry.insert_js("expiration", Json::Str(current.to_string()));
        if record(ctx, &store, &composite, Json::Obj(entry)).is_err() {
            // No record means this date would fire again on the next sync: show nothing for it.
            ctx.warn("humble alerts: a record could not be written");
            outcome.write_failures += 1;
            continue;
        }
        newly_expiring.push(Transition {
            title: key.title.clone(),
            date: digest_date(ctx, current),
        });
    }
    outcome.newly_expiring = newly_expiring.len();

    if opts.suppress_notifications {
        if !newly_expiring.is_empty() {
            outcome.withheld = Some(Withheld::Baseline);
        }
        return outcome;
    }
    if newly_expiring.is_empty() {
        return outcome;
    }
    if !opts.notify_humble_expirations {
        outcome.withheld = Some(Withheld::SettingOff);
        return outcome;
    }
    if opts.steam_deck_game_mode {
        outcome.withheld = Some(Withheld::SteamDeckGameMode);
        return outcome;
    }
    let Some(ui) = ctx.ui.as_ref() else {
        outcome.withheld = Some(Withheld::NoUi);
        return outcome;
    };

    // A catalog-less context renders each key's inline default, as i18next does with no resources.
    let empty = Catalog::default();
    let catalog = ctx.catalog.as_deref().unwrap_or(&empty);
    let (title, body) = build_digest_copy(catalog, &newly_expiring);
    ui.notify(&title, &body);
    outcome.notification = Some(Digest {
        title,
        body,
        calls: digest_calls(&newly_expiring).into(),
    });
    outcome
}

/// The two i18next calls the digest copy makes: the title, then the body. One transition names the title
/// and the date; any other number names the count. Each passes `interpolation: { escapeValue: false }`
/// (see [`DigestCall`]).
pub fn digest_calls(transitions: &[Transition]) -> [DigestCall; 2] {
    if let [single] = transitions {
        let mut params = Map::new();
        params.insert("title".to_string(), Value::String(single.title.clone()));
        params.insert("date".to_string(), Value::String(single.date.clone()));
        return [
            DigestCall {
                key: "humble.notification.expiringTitleSingle",
                default: "Humble key expiring",
                params: Map::new(),
            },
            DigestCall {
                key: "humble.notification.expiringBodySingle",
                default: "{{title}}'s Humble key now expires on {{date}}",
                params,
            },
        ];
    }
    let mut params = Map::new();
    params.insert("count".to_string(), Value::from(transitions.len() as u64));
    [
        DigestCall {
            key: "humble.notification.expiringTitlePlural",
            default: "Humble keys expiring",
            params: Map::new(),
        },
        DigestCall {
            key: "humble.notification.expiringBodyPlural",
            default: "{{count}} Humble keys gained expiration dates",
            params,
        },
    ]
}

/// `buildDigestCopy`: the notification title and body. Reads only each key's title and date (Pitfall 5).
/// Both render unescaped, as the TypeScript's `interpolation: { escapeValue: false }` does.
pub fn build_digest_copy(catalog: &Catalog, transitions: &[Transition]) -> (String, String) {
    let [title, body] = digest_calls(transitions);
    (
        catalog.t_unescaped(title.key, title.default, &title.params),
        catalog.t_unescaped(body.key, body.default, &body.params),
    )
}

/// The `expiration` string of a record, or `None` when it is absent or not a string.
fn expiration_of(entry: &Json) -> Option<String> {
    let Json::Obj(fields) = entry else {
        return None;
    };
    match fields.get("expiration") {
        Some(Json::Str(text)) => Some(text.clone()),
        _ => None,
    }
}

/// `CacheStore.set`: the value, then the `Date()` text at `__timestamp.<key>`.
fn record(ctx: &HumbleCtx, store: &Store, key: &str, value: Json) -> io::Result<()> {
    store.set(key, value)?;
    store.set(
        &format!("__timestamp.{key}"),
        Json::Str(js_date_string(ctx.clock.now_ms())),
    )
}

/// `new Date(expiration).toLocaleDateString(<language>)`: the date in the layout of the UI language (see
/// [`date_layout`]), read in the host zone. An empty string is the TypeScript's `''` and an unparsable
/// one its `Invalid Date`.
///
/// The language is the one `ctx.catalog` resolved, the catalog the digest text renders through; with no
/// catalog it is `en`. A date with no zone is read in the host offset in force at that local time; the
/// calendar day is then read in the offset in force at the instant.
pub fn digest_date(ctx: &HumbleCtx, expiration: &str) -> String {
    if expiration.is_empty() {
        return String::new();
    }
    let Some(instant) = parse_js_date(expiration, ctx.local_zone()) else {
        return "Invalid Date".to_string();
    };
    let east_ms = i64::from(ctx.zone.offset_east_secs_at(instant)) * 1000;
    let (year, month, day) = civil_from_days((instant + east_ms).div_euclid(MS_PER_DAY));
    let language = ctx.catalog.as_deref().map_or("en", |c| c.language());
    date_layout(language).render(year, month, day)
}

/// The order of the three date fields.
#[derive(Debug, Clone, Copy)]
enum FieldOrder {
    MonthDayYear,
    DayMonthYear,
    YearMonthDay,
}

/// How one language writes a calendar day: a field order, one separator between the fields, whether the
/// day and the month are zero-padded (decided separately), and a trailing suffix. The year is never padded.
#[derive(Debug, Clone, Copy)]
struct DateLayout {
    order: FieldOrder,
    separator: &'static str,
    pad_day: bool,
    pad_month: bool,
    suffix: &'static str,
}

impl DateLayout {
    fn render(&self, year: i64, month: i64, day: i64) -> String {
        let day = if self.pad_day {
            format!("{day:02}")
        } else {
            day.to_string()
        };
        let month = if self.pad_month {
            format!("{month:02}")
        } else {
            month.to_string()
        };
        let year = year.to_string();
        let fields = match self.order {
            FieldOrder::MonthDayYear => [&month, &day, &year],
            FieldOrder::DayMonthYear => [&day, &month, &year],
            FieldOrder::YearMonthDay => [&year, &month, &day],
        };
        format!(
            "{}{sep}{}{sep}{}{}",
            fields[0],
            fields[1],
            fields[2],
            self.suffix,
            sep = self.separator
        )
    }
}

/// The layout for a shipped language directory name, measured from CLDR through Intl (see the table in
/// the tests). `en` has no arm: it is the fallback, so `en` and an unknown language cannot drift apart
/// and both give the en-US `M/D/YYYY`.
fn date_layout(language: &str) -> DateLayout {
    match language {
        "be" | "de" | "et" | "fi" | "he" | "nb_NO" => DateLayout {
            order: FieldOrder::DayMonthYear,
            separator: ".",
            pad_day: false,
            pad_month: false,
            suffix: "",
        },
        "az" | "ro" | "ru" | "tr" | "uk" => DateLayout {
            order: FieldOrder::DayMonthYear,
            separator: ".",
            pad_day: true,
            pad_month: true,
            suffix: "",
        },
        "pl" => DateLayout {
            order: FieldOrder::DayMonthYear,
            separator: ".",
            pad_day: false,
            pad_month: true,
            suffix: "",
        },
        "bg" => DateLayout {
            order: FieldOrder::DayMonthYear,
            separator: ".",
            pad_day: false,
            pad_month: true,
            suffix: " г.",
        },
        "ca" | "el" | "es" | "gl" | "id" | "ml" | "ta" | "vi" => DateLayout {
            order: FieldOrder::DayMonthYear,
            separator: "/",
            pad_day: false,
            pad_month: false,
            suffix: "",
        },
        "fr" | "ga" | "it" | "pt" | "pt_BR" => DateLayout {
            order: FieldOrder::DayMonthYear,
            separator: "/",
            pad_day: true,
            pad_month: true,
            suffix: "",
        },
        "nl" => DateLayout {
            order: FieldOrder::DayMonthYear,
            separator: "-",
            pad_day: false,
            pad_month: false,
            suffix: "",
        },
        "bs" | "sr" => DateLayout {
            order: FieldOrder::DayMonthYear,
            separator: ". ",
            pad_day: false,
            pad_month: false,
            suffix: ".",
        },
        "hr" => DateLayout {
            order: FieldOrder::DayMonthYear,
            separator: ". ",
            pad_day: true,
            pad_month: true,
            suffix: ".",
        },
        "cs" | "sk" => DateLayout {
            order: FieldOrder::DayMonthYear,
            separator: ". ",
            pad_day: false,
            pad_month: false,
            suffix: "",
        },
        // U+200F after the day and the month, as CLDR writes it.
        "ar" => DateLayout {
            order: FieldOrder::DayMonthYear,
            separator: "\u{200F}/",
            pad_day: false,
            pad_month: false,
            suffix: "",
        },
        // Gregorian with Latin digits (CLDR's `fa-u-ca-gregory-nu-latn`); the crate converts no calendars.
        "fa" => DateLayout {
            order: FieldOrder::YearMonthDay,
            separator: "/",
            pad_day: false,
            pad_month: false,
            suffix: "",
        },
        "eu" | "ja" | "zh_Hans" | "zh_Hant" => DateLayout {
            order: FieldOrder::YearMonthDay,
            separator: "/",
            pad_day: false,
            pad_month: false,
            suffix: "",
        },
        "hu" => DateLayout {
            order: FieldOrder::YearMonthDay,
            separator: ". ",
            pad_day: true,
            pad_month: true,
            suffix: ".",
        },
        "ko" => DateLayout {
            order: FieldOrder::YearMonthDay,
            separator: ". ",
            pad_day: false,
            pad_month: false,
            suffix: ".",
        },
        "lt" | "sv" => DateLayout {
            order: FieldOrder::YearMonthDay,
            separator: "-",
            pad_day: true,
            pad_month: true,
            suffix: "",
        },
        _ => DateLayout {
            order: FieldOrder::MonthDayYear,
            separator: "/",
            pad_day: false,
            pad_month: false,
            suffix: "",
        },
    }
}

/// The proleptic Gregorian date of a day count since 1970-01-01 (Howard Hinnant's `civil_from_days`).
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let day_of_era = z.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let mp = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ctx::{HostZone, HumbleUi, Platform};
    use crate::http::NoHttp;
    use gamelib_core::clock::Clock;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use std::sync::{Arc, Mutex};

    /// 2026-11-24T12:00:00Z, the instant the goldens pin.
    const NOW_MS: u64 = 1_795_521_600_000;

    struct FixedClock;

    impl Clock for FixedClock {
        fn now_ms(&self) -> u64 {
            NOW_MS
        }
    }

    /// Records every notification.
    #[derive(Default)]
    struct Recording(Mutex<Vec<(String, String)>>);

    impl HumbleUi for Recording {
        fn notify(&self, title: &str, body: &str) {
            self.0
                .lock()
                .unwrap()
                .push((title.to_string(), body.to_string()));
        }
        fn send_to_sidecar(&self, _channel: &str, _args: Vec<Value>) {}
    }

    impl Recording {
        fn shown(&self) -> Vec<(String, String)> {
            self.0.lock().unwrap().clone()
        }
    }

    struct Fixture {
        home: FakeHome,
        ui: Arc<Recording>,
        ctx: HumbleCtx,
    }

    fn fixture() -> Fixture {
        let home = FakeHome::new("humble-alerts-");
        let ui = Arc::new(Recording::default());
        let ctx = HumbleCtx::new(
            Arc::new(StoreHost::new()),
            home.root().to_path_buf(),
            Arc::new(FixedClock),
            Platform::Linux,
            Shutdown::new(),
            Arc::new(NoHttp),
        )
        .with_ui(ui.clone());
        Fixture { home, ui, ctx }
    }

    impl Fixture {
        fn store(&self) -> Arc<Store> {
            HumbleStore::NotifiedExpiration
                .open(&self.ctx)
                .expect("the store opens")
        }

        fn recorded(&self, key: &str) -> Option<String> {
            self.store()
                .get(key)
                .and_then(|entry| expiration_of(&entry))
        }

        fn seed(&self, key: &str, expiration: &str) {
            let mut entry = Obj::new();
            entry.insert_js("expiration", Json::Str(expiration.to_string()));
            self.store().set(key, Json::Obj(entry)).unwrap();
        }
    }

    const ON: AlertOptions = AlertOptions {
        suppress_notifications: false,
        notify_humble_expirations: true,
        steam_deck_game_mode: false,
    };

    fn key(gamekey: &str, machine: &str, title: &str, expiration: Option<&str>) -> AlertKey {
        AlertKey {
            gamekey: gamekey.to_string(),
            machine_name: machine.to_string(),
            title: title.to_string(),
            expiration: expiration.map(str::to_string),
        }
    }

    fn some_key(machine: &str, title: &str, expiration: &str) -> AlertKey {
        key("order-1", machine, title, Some(expiration))
    }

    #[test]
    fn null_to_date_on_a_non_baseline_sync_records_the_key_and_fires_one_notification() {
        let f = fixture();
        let k = some_key("sometitle_steam", "Some Title", "2026-08-01");
        let out = detect_and_notify_expiration_transitions(&f.ctx, &[k], &ON);
        assert_eq!(
            f.recorded("order-1:sometitle_steam").as_deref(),
            Some("2026-08-01")
        );
        assert_eq!(f.ui.shown().len(), 1);
        assert_eq!(out.newly_expiring, 1);
    }

    #[test]
    fn d92_dedup_the_same_expiration_seen_again_is_a_no_op() {
        let f = fixture();
        f.seed("order-1:sometitle_steam", "2026-08-01");
        let k = some_key("sometitle_steam", "Some Title", "2026-08-01");
        let out = detect_and_notify_expiration_transitions(&f.ctx, &[k], &ON);
        assert!(f.ui.shown().is_empty());
        assert_eq!(out, AlertOutcome::default());
    }

    #[test]
    fn d92_a_moved_date_fires_again_and_updates_the_record() {
        let f = fixture();
        f.seed("order-1:sometitle_steam", "2026-08-01");
        let k = some_key("sometitle_steam", "Some Title", "2026-09-15");
        detect_and_notify_expiration_transitions(&f.ctx, &[k], &ON);
        assert_eq!(
            f.recorded("order-1:sometitle_steam").as_deref(),
            Some("2026-09-15")
        );
        assert_eq!(f.ui.shown().len(), 1);
    }

    #[test]
    fn locked_decision_3_a_first_sync_seeds_every_expiration_with_zero_notifications() {
        let f = fixture();
        let a = key("order-1", "a_steam", "Game A", Some("2026-08-01"));
        let b = key("order-1", "b_steam", "Game B", Some("2026-09-01"));
        let opts = AlertOptions {
            suppress_notifications: true,
            ..ON
        };
        let out = detect_and_notify_expiration_transitions(&f.ctx, &[a, b], &opts);
        assert_eq!(f.recorded("order-1:a_steam").as_deref(), Some("2026-08-01"));
        assert_eq!(f.recorded("order-1:b_steam").as_deref(), Some("2026-09-01"));
        assert!(f.ui.shown().is_empty());
        assert_eq!(out.withheld, Some(Withheld::Baseline));
    }

    #[test]
    fn wr01_a_duplicate_machine_name_across_two_orders_fires_both_once_then_neither() {
        let f = fixture();
        let a = key("order-a", "shared_steam", "Game A", Some("2026-08-01"));
        let b = key("order-b", "shared_steam", "Game B", Some("2026-09-15"));
        let keys = [a, b];
        let first = detect_and_notify_expiration_transitions(&f.ctx, &keys, &ON);
        assert_eq!(f.ui.shown().len(), 1);
        // The body names the count of two.
        assert!(f.ui.shown()[0].1.contains('2'));
        assert_eq!(first.newly_expiring, 2);
        assert_eq!(
            f.recorded("order-a:shared_steam").as_deref(),
            Some("2026-08-01")
        );
        assert_eq!(
            f.recorded("order-b:shared_steam").as_deref(),
            Some("2026-09-15")
        );
        // A second identical sync fires neither: the composite keys each hold their own date.
        detect_and_notify_expiration_transitions(&f.ctx, &keys, &ON);
        assert_eq!(f.ui.shown().len(), 1);
    }

    #[test]
    fn wr01_when_only_one_of_two_orders_changes_date_only_that_one_re_fires() {
        let f = fixture();
        f.seed("order-a:shared_steam", "2026-08-01");
        f.seed("order-b:shared_steam", "2026-09-15");
        let a = key("order-a", "shared_steam", "Game A", Some("2026-08-01"));
        let b = key("order-b", "shared_steam", "Game B", Some("2026-10-01"));
        let out = detect_and_notify_expiration_transitions(&f.ctx, &[a, b], &ON);
        assert_eq!(out.newly_expiring, 1);
        assert_eq!(f.ui.shown().len(), 1);
        assert_eq!(
            f.recorded("order-b:shared_steam").as_deref(),
            Some("2026-10-01")
        );
        assert_eq!(
            f.recorded("order-a:shared_steam").as_deref(),
            Some("2026-08-01")
        );
    }

    #[test]
    fn wr01_legacy_backfill_treats_a_machine_name_entry_as_already_notified_and_creates_the_composite(
    ) {
        let f = fixture();
        f.seed("legacy_steam", "2026-08-01");
        let k = key("order-a", "legacy_steam", "Some Title", Some("2026-08-01"));
        let out = detect_and_notify_expiration_transitions(&f.ctx, &[k], &ON);
        assert!(f.ui.shown().is_empty());
        assert_eq!(out.newly_expiring, 0);
        assert_eq!(
            f.recorded("order-a:legacy_steam").as_deref(),
            Some("2026-08-01")
        );
        // The legacy entry stays, which keeps the backfill idempotent.
        assert_eq!(f.recorded("legacy_steam").as_deref(), Some("2026-08-01"));
    }

    #[test]
    fn d90_a_single_affected_key_uses_the_singular_body_naming_the_title() {
        let f = fixture();
        let k = some_key("sometitle_steam", "Solo Game", "2026-08-01");
        detect_and_notify_expiration_transitions(&f.ctx, &[k], &ON);
        let shown = f.ui.shown();
        assert_eq!(shown.len(), 1);
        assert!(shown[0].1.contains("Solo Game"));
        assert_eq!(shown[0].0, "Humble key expiring");
    }

    #[test]
    fn d90_two_or_more_affected_keys_use_the_plural_body_with_a_count() {
        let f = fixture();
        let a = key("order-1", "a_steam", "A", Some("2026-08-01"));
        let b = key("order-1", "b_steam", "B", Some("2026-09-01"));
        detect_and_notify_expiration_transitions(&f.ctx, &[a, b], &ON);
        let shown = f.ui.shown();
        assert_eq!(shown.len(), 1);
        assert_eq!(shown[0].0, "Humble keys expiring");
        assert_eq!(shown[0].1, "2 Humble keys gained expiration dates");
    }

    #[test]
    fn d93_with_the_setting_off_the_record_still_advances_but_nothing_fires() {
        let f = fixture();
        let opts = AlertOptions {
            notify_humble_expirations: false,
            ..ON
        };
        let k = some_key("sometitle_steam", "Some Title", "2026-08-01");
        let out = detect_and_notify_expiration_transitions(&f.ctx, std::slice::from_ref(&k), &opts);
        assert_eq!(
            f.recorded("order-1:sometitle_steam").as_deref(),
            Some("2026-08-01")
        );
        assert!(f.ui.shown().is_empty());
        assert_eq!(out.withheld, Some(Withheld::SettingOff));
        // Turning the setting on later does not re-fire the date already seen.
        detect_and_notify_expiration_transitions(&f.ctx, &[k], &ON);
        assert!(f.ui.shown().is_empty());
    }

    #[test]
    fn pitfall_4_steam_deck_game_mode_suppresses_the_toast_and_the_record_advances() {
        let f = fixture();
        let opts = AlertOptions {
            steam_deck_game_mode: true,
            ..ON
        };
        let k = some_key("sometitle_steam", "Some Title", "2026-08-01");
        let out = detect_and_notify_expiration_transitions(&f.ctx, &[k], &opts);
        assert_eq!(
            f.recorded("order-1:sometitle_steam").as_deref(),
            Some("2026-08-01")
        );
        assert!(f.ui.shown().is_empty());
        assert_eq!(out.withheld, Some(Withheld::SteamDeckGameMode));
    }

    #[test]
    fn pitfall_5_the_digest_copy_is_built_only_from_the_title_and_the_date() {
        // `AlertKey` has no field for a key value or index, so none can leak; the body is exactly the
        // template over the title and the date (verbatim: the notification is plain text).
        let f = fixture();
        let k = some_key("sometitle_steam", "Safe Title", "2026-08-01T00:00:00.000Z");
        detect_and_notify_expiration_transitions(&f.ctx, &[k], &ON);
        let shown = f.ui.shown();
        assert_eq!(shown[0].0, "Humble key expiring");
        assert_eq!(
            shown[0].1,
            "Safe Title's Humble key now expires on 8/1/2026"
        );
    }

    #[test]
    fn a_hostile_title_and_the_date_reach_the_notification_verbatim() {
        let f = fixture();
        let k = some_key(
            "sometitle_steam",
            "Tom & Jerry's <b>\"Cheese\"</b> / Co",
            "2026-08-01T00:00:00.000Z",
        );
        let out = detect_and_notify_expiration_transitions(&f.ctx, &[k], &ON);
        let shown = f.ui.shown();
        assert_eq!(shown.len(), 1);
        assert_eq!(
            shown[0].1,
            "Tom & Jerry's <b>\"Cheese\"</b> / Co's Humble key now expires on 8/1/2026"
        );
        // The contrast: the escaping call renders other text, so the choice of call matters.
        let digest = out.notification.expect("a digest was raised");
        let body = &digest.calls[1];
        assert_ne!(
            Catalog::default().t(body.key, body.default, &body.params),
            shown[0].1
        );
    }

    #[test]
    fn no_newly_expiring_keys_means_no_notification_and_no_store_writes() {
        let f = fixture();
        let k = key("order-1", "sometitle_steam", "Some Title", None);
        let out = detect_and_notify_expiration_transitions(&f.ctx, &[k], &ON);
        assert!(f.ui.shown().is_empty());
        assert_eq!(out, AlertOutcome::default());
        let file = f
            .home
            .root()
            .join("store_cache")
            .join("humble_notified_expiration.json");
        assert!(!file.exists(), "a no-op run wrote the store file");
    }

    #[test]
    fn a_headless_context_records_and_shows_nothing() {
        let f = fixture();
        let headless = HumbleCtx::new(
            Arc::new(StoreHost::new()),
            f.home.root().to_path_buf(),
            Arc::new(FixedClock),
            Platform::Linux,
            Shutdown::new(),
            Arc::new(NoHttp),
        );
        let k = some_key("sometitle_steam", "Some Title", "2026-08-01");
        let out = detect_and_notify_expiration_transitions(&headless, &[k], &ON);
        assert_eq!(out.withheld, Some(Withheld::NoUi));
        assert!(out.notification.is_none());
    }

    #[test]
    fn a_record_that_cannot_be_written_is_never_shown() {
        // A store file that is not JSON opens read-only: the host never overwrites it, so no dedupe
        // record can be written, and a digest raised anyway would fire again on the next sync.
        let f = fixture();
        let dir = f.home.root().join("store_cache");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("humble_notified_expiration.json"), b"{ not json").unwrap();
        let k = some_key("sometitle_steam", "Some Title", "2026-08-01");
        let out = detect_and_notify_expiration_transitions(&f.ctx, &[k], &ON);
        assert!(
            f.ui.shown().is_empty(),
            "a digest was raised without a record"
        );
        assert!(out.write_failures >= 1 || out.store_unavailable);
        assert_eq!(out.newly_expiring, 0);
    }

    #[test]
    fn the_dedupe_record_exists_before_the_notification_is_raised() {
        /// A UI that reads the store at the instant it is notified.
        struct Probe {
            seen: Mutex<Option<String>>,
            store: Mutex<Option<Arc<Store>>>,
        }
        impl HumbleUi for Probe {
            fn notify(&self, _title: &str, _body: &str) {
                let store = self.store.lock().unwrap().clone().expect("probe is wired");
                *self.seen.lock().unwrap() = store
                    .get("order-1:sometitle_steam")
                    .and_then(|entry| expiration_of(&entry));
            }
            fn send_to_sidecar(&self, _channel: &str, _args: Vec<Value>) {}
        }
        let home = FakeHome::new("humble-alerts-order-");
        let probe = Arc::new(Probe {
            seen: Mutex::new(None),
            store: Mutex::new(None),
        });
        let ctx = HumbleCtx::new(
            Arc::new(StoreHost::new()),
            home.root().to_path_buf(),
            Arc::new(FixedClock),
            Platform::Linux,
            Shutdown::new(),
            Arc::new(NoHttp),
        )
        .with_ui(probe.clone());
        *probe.store.lock().unwrap() = HumbleStore::NotifiedExpiration.open(&ctx);
        let k = some_key("sometitle_steam", "Some Title", "2026-08-01");
        detect_and_notify_expiration_transitions(&ctx, &[k], &ON);
        assert_eq!(probe.seen.lock().unwrap().as_deref(), Some("2026-08-01"));
    }

    #[test]
    fn without_a_catalog_the_date_is_the_en_us_month_day_year_with_no_padding() {
        let f = fixture();
        for (raw, want) in [
            ("2027-01-02T00:00:00.000Z", "1/2/2027"),
            ("2027-12-31T00:00:00.000Z", "12/31/2027"),
            ("2028-02-29T23:59:59.999Z", "2/29/2028"),
            ("2026-08-01", "8/1/2026"),
            ("", ""),
            ("not a date", "Invalid Date"),
        ] {
            assert_eq!(digest_date(&f.ctx, raw), want, "{raw}");
        }
    }

    #[test]
    fn a_de_catalog_renders_the_digest_date_in_the_german_layout() {
        let locales =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../public/locales");
        let f = fixture();
        let ctx = f.ctx.with_catalog(Arc::new(Catalog::load(&locales, "de")));
        let k = some_key("sometitle_steam", "Some Title", "2027-01-02T00:00:00.000Z");
        let out = detect_and_notify_expiration_transitions(&ctx, &[k], &ON);
        // `de` has no humble.notification keys, so the text is the English template with a German date.
        assert_eq!(
            f.ui.shown(),
            vec![(
                "Humble key expiring".to_string(),
                "Some Title's Humble key now expires on 2.1.2027".to_string()
            )]
        );
        let digest = out.notification.expect("a digest was raised");
        assert_eq!(digest.calls[1].params["date"], "2.1.2027");
    }

    /// +13:00 all year, so a UTC evening is already the next local day.
    struct Auckland;

    impl HostZone for Auckland {
        fn offset_east_secs_at(&self, _utc_ms: i64) -> i32 {
            13 * 3600
        }
    }

    #[test]
    fn the_calendar_day_is_read_in_the_host_zone() {
        let f = fixture();
        let ctx = fixture().ctx.with_zone(Arc::new(Auckland));
        assert_eq!(digest_date(&f.ctx, "2027-01-02T20:00:00.000Z"), "1/2/2027");
        assert_eq!(digest_date(&ctx, "2027-01-02T20:00:00.000Z"), "1/3/2027");
    }

    #[test]
    fn a_zone_less_expiry_is_read_at_its_own_dates_offset() {
        // Auckland 2026, synced on 2026-11-24 (NZDT, +13h). The expiry falls in NZST (+12h), so
        // 2026-07-01 00:30 local is 2026-06-30T12:30Z, which is 7/1 in the zone then in force. Reading
        // it with the sync-time offset gave 6/30/2026.
        let ctx = fixture()
            .ctx
            .with_zone(Arc::new(crate::js_date::test_zones::Auckland2026));
        assert_eq!(digest_date(&ctx, "2026-07-01 00:30"), "7/1/2026");
    }

    #[test]
    fn every_shipped_language_renders_the_measured_layout() {
        // Measured with Node v22.23.4, ICU 78.3, CLDR 48.0: `new Date(Date.UTC(2027, 0, 2))` and
        // `Date.UTC(2027, 11, 31)` through `toLocaleDateString(<tag>, { timeZone: 'UTC' })`, the `_` of a
        // directory name read as `-`. `fa` is measured as `fa-u-ca-gregory-nu-latn`: the plain tag renders
        // the Persian calendar in Persian digits, which a layout over the Gregorian day cannot express.
        let measured: &[(&str, &str, &str)] = &[
            (
                "ar",
                "2\u{200F}/1\u{200F}/2027",
                "31\u{200F}/12\u{200F}/2027",
            ),
            ("az", "02.01.2027", "31.12.2027"),
            ("be", "2.1.2027", "31.12.2027"),
            ("bg", "2.01.2027 г.", "31.12.2027 г."),
            ("bs", "2. 1. 2027.", "31. 12. 2027."),
            ("ca", "2/1/2027", "31/12/2027"),
            ("cs", "2. 1. 2027", "31. 12. 2027"),
            ("de", "2.1.2027", "31.12.2027"),
            ("el", "2/1/2027", "31/12/2027"),
            ("en", "1/2/2027", "12/31/2027"),
            ("es", "2/1/2027", "31/12/2027"),
            ("et", "2.1.2027", "31.12.2027"),
            ("eu", "2027/1/2", "2027/12/31"),
            ("fa", "2027/1/2", "2027/12/31"),
            ("fi", "2.1.2027", "31.12.2027"),
            ("fr", "02/01/2027", "31/12/2027"),
            ("ga", "02/01/2027", "31/12/2027"),
            ("gl", "2/1/2027", "31/12/2027"),
            ("he", "2.1.2027", "31.12.2027"),
            ("hr", "02. 01. 2027.", "31. 12. 2027."),
            ("hu", "2027. 01. 02.", "2027. 12. 31."),
            ("ja", "2027/1/2", "2027/12/31"),
            ("ko", "2027. 1. 2.", "2027. 12. 31."),
            ("id", "2/1/2027", "31/12/2027"),
            ("it", "02/01/2027", "31/12/2027"),
            ("lt", "2027-01-02", "2027-12-31"),
            ("ml", "2/1/2027", "31/12/2027"),
            ("nb_NO", "2.1.2027", "31.12.2027"),
            ("nl", "2-1-2027", "31-12-2027"),
            ("pl", "2.01.2027", "31.12.2027"),
            ("pt", "02/01/2027", "31/12/2027"),
            ("pt_BR", "02/01/2027", "31/12/2027"),
            ("ro", "02.01.2027", "31.12.2027"),
            ("ru", "02.01.2027", "31.12.2027"),
            ("sr", "2. 1. 2027.", "31. 12. 2027."),
            ("sk", "2. 1. 2027", "31. 12. 2027"),
            ("sv", "2027-01-02", "2027-12-31"),
            ("ta", "2/1/2027", "31/12/2027"),
            ("tr", "02.01.2027", "31.12.2027"),
            ("uk", "02.01.2027", "31.12.2027"),
            ("vi", "2/1/2027", "31/12/2027"),
            ("zh_Hans", "2027/1/2", "2027/12/31"),
            ("zh_Hant", "2027/1/2", "2027/12/31"),
        ];
        let mut languages: Vec<&str> = measured.iter().map(|row| row.0).collect();
        languages.sort_unstable();
        let mut shipped: Vec<&str> = gamelib_i18n::SHIPPED_LANGUAGES.to_vec();
        shipped.sort_unstable();
        assert_eq!(
            languages, shipped,
            "the table must hold exactly one row per shipped language"
        );
        let none = std::env::temp_dir().join("gamelib-humble-no-locales");
        for (language, jan, dec) in measured {
            let ctx = fixture()
                .ctx
                .with_catalog(Arc::new(Catalog::load(&none, language)));
            assert_eq!(
                digest_date(&ctx, "2027-01-02T00:00:00.000Z"),
                *jan,
                "{language} 2027-01-02"
            );
            assert_eq!(
                digest_date(&ctx, "2027-12-31T00:00:00.000Z"),
                *dec,
                "{language} 2027-12-31"
            );
        }
    }

    #[test]
    fn an_unshipped_language_or_no_catalog_keeps_the_en_layout() {
        let none = std::env::temp_dir().join("gamelib-humble-no-locales");
        let unshipped = fixture()
            .ctx
            .with_catalog(Arc::new(Catalog::load(&none, "xx")));
        let default = fixture().ctx.with_catalog(Arc::new(Catalog::default()));
        let bare = fixture().ctx;
        for ctx in [&unshipped, &default, &bare] {
            assert_eq!(digest_date(ctx, "2027-01-02T00:00:00.000Z"), "1/2/2027");
        }
    }

    #[test]
    fn a_non_en_layout_reads_the_host_zone_and_keeps_the_empty_and_invalid_rules() {
        let none = std::env::temp_dir().join("gamelib-humble-no-locales");
        let with = |language: &str| {
            fixture()
                .ctx
                .with_zone(Arc::new(Auckland))
                .with_catalog(Arc::new(Catalog::load(&none, language)))
        };
        assert_eq!(
            digest_date(&with("de"), "2027-01-02T20:00:00.000Z"),
            "3.1.2027"
        );
        assert_eq!(
            digest_date(&with("ja"), "2027-01-02T20:00:00.000Z"),
            "2027/1/3"
        );
        for language in ["de", "hu", "ar"] {
            let ctx = with(language);
            assert_eq!(digest_date(&ctx, ""), "", "{language}");
            assert_eq!(
                digest_date(&ctx, "not a date"),
                "Invalid Date",
                "{language}"
            );
        }
    }

    #[test]
    fn civil_from_days_covers_the_epoch_leap_days_and_dates_before_1970() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(-1), (1969, 12, 31));
        assert_eq!(civil_from_days(19_782), (2024, 2, 29));
        assert_eq!(civil_from_days(11_016), (2000, 2, 29));
        assert_eq!(civil_from_days(-719_468), (0, 3, 1));
    }

    #[test]
    fn the_digest_calls_are_the_title_key_then_the_body_key_with_the_params() {
        let one = [Transition {
            title: "T".to_string(),
            date: "1/2/2027".to_string(),
        }];
        let [title, body] = digest_calls(&one);
        assert_eq!(
            title.to_value(),
            serde_json::json!([
                "humble.notification.expiringTitleSingle",
                "Humble key expiring",
                { "interpolation": { "escapeValue": false } }
            ])
        );
        assert_eq!(
            body.to_value(),
            serde_json::json!([
                "humble.notification.expiringBodySingle",
                "{{title}}'s Humble key now expires on {{date}}",
                {
                    "title": "T",
                    "date": "1/2/2027",
                    "interpolation": { "escapeValue": false }
                }
            ])
        );
        let many: Vec<Transition> = (0..5)
            .map(|n| Transition {
                title: format!("G{n}"),
                date: String::new(),
            })
            .collect();
        let [title, body] = digest_calls(&many);
        assert_eq!(title.key, "humble.notification.expiringTitlePlural");
        assert_eq!(
            body.to_value(),
            serde_json::json!([
                "humble.notification.expiringBodyPlural",
                "{{count}} Humble keys gained expiration dates",
                { "count": 5, "interpolation": { "escapeValue": false } }
            ])
        );
    }

    #[test]
    fn the_base_plural_key_renders_the_same_text_as_the_one_and_other_keys() {
        // The crate looks up the base key only (no plural suffixes), where i18next picks `_one` or
        // `_other` by the count. They must be the same text in every shipped locale, or a count would
        // render differently here.
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../public/locales");
        let mut checked = 0;
        for entry in std::fs::read_dir(&root).unwrap() {
            let dir = entry.unwrap().path();
            let Ok(text) = std::fs::read_to_string(dir.join("translation.json")) else {
                continue;
            };
            let json: Value = serde_json::from_str(&text).unwrap();
            let node = &json["humble"]["notification"];
            if node.is_null() {
                continue;
            }
            let base = node["expiringBodyPlural"].as_str();
            for suffix in ["expiringBodyPlural_one", "expiringBodyPlural_other"] {
                if let Some(variant) = node[suffix].as_str() {
                    assert_eq!(base, Some(variant), "{} {suffix}", dir.display());
                }
            }
            checked += 1;
        }
        assert!(
            checked >= 1,
            "no locale carried the humble.notification keys"
        );
    }
}
