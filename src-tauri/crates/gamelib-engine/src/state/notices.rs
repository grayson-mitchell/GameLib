//! The engine notices store (`engineNoticeStore.ts` and the dismissal half of `engineState.ts`): which
//! engine notices the user dismissed, kept in `<userData>/store_cache/steam_engine_notices.json`.
//!
//! Read and written only through the StoreHost (D-07, D-18), never by file I/O of this crate's own. An
//! entry is two keys, the value and a `__timestamp.<key>` text, written as two dot-path sets exactly
//! as the TS `CacheStore` did (kind user-state, no expiry). The store is opened lazily on first use, so
//! building the context does no file read (D-17).
//!
//! A notices file that is not a JSON object is kept, never reset (FND-06): the host refuses to open it
//! (and keeps one `.corrupt.<stamp>.json` copy of its bytes beside it), every notice reads as not
//! dismissed, and a dismissal is refused (`ok: false`) instead of replacing the file. The TS replaced it
//! on the first write; that and the two consequences of the host's policy are the deliberate differences
//! from the goldens, recorded in `golden/state/deltas.json`. The failed open is remembered for the life
//! of the process, so the copy is made once and a state read never repeats it.

use std::cell::Cell;
use std::sync::{Arc, Mutex};

use gamelib_store::host::Store;
use gamelib_store::json::Json;
use serde_json::Value;

use crate::crossover::tested_versions::{dismiss_untested_notice, NoticeStore};
use crate::ctx::EngineCtx;
use crate::state::engine_state::TRIAL_NOTICE_DAYS;

pub use crate::crossover::tested_versions::{MAX_DISMISSED, UNTESTED_DISMISSED_KEY};

/// The on-disk file name (`store_cache/<name>.json`). It must not change: renaming it would reset every
/// user's dismissed notices.
pub const NOTICES_STORE: &str = "steam_engine_notices";
/// The store key of the "no CrossOver installed" note's dismissal.
pub const NO_CROSSOVER_KEY: &str = "noCrossoverNoteDismissed";
/// The store key of the CrossOver trial notice's dismissal: the estimated end day (UTC epoch day) of the
/// trial that was dismissed, one integer. Like [`NOTICES_STORE`], the name must never change.
pub const TRIAL_DISMISSED_END_DAY_KEY: &str = "crossoverTrialNoticeDismissedEndDay";
/// How many days a trial's computed end day may lie past the stored one and still count as the same
/// trial. CrossOver rounds the day count, and a Healthy page pre-flight is cached without a TTL, so the
/// computed end day drifts by a day or two within one trial. A new trial cannot be mistaken for the
/// dismissed one: the notice only shows at 7 days or fewer left and a trial is 15 days, so a new trial
/// ends at least 8 days after a dismissed one.
pub const TRIAL_DISMISS_SLACK_DAYS: u64 = 3;

const MS_PER_DAY: u64 = 86_400_000;

/// The estimated end day of a trial: the UTC epoch day of `now_ms` plus the days CrossOver reports left.
/// The trial's only identity GameLib has (it reads no profile content, so not `InstallTime`).
pub fn trial_end_day(now_ms: u64, days_remaining: u64) -> u64 {
    (now_ms / MS_PER_DAY).saturating_add(days_remaining)
}

/// Whether the trial ending on `end_day` is the one the user dismissed (or an earlier one). Only a
/// non-negative integer under [`TRIAL_DISMISSED_END_DAY_KEY`] counts; anything else reads as not
/// dismissed, so a corrupt value shows the notice.
pub fn is_trial_notice_dismissed(store: &dyn NoticeStore, end_day: u64) -> bool {
    store
        .get(TRIAL_DISMISSED_END_DAY_KEY)
        .and_then(|value| value.as_u64())
        .is_some_and(|stored| end_day <= stored.saturating_add(TRIAL_DISMISS_SLACK_DAYS))
}

/// Where the store stands: not opened yet, open, or refused (an unreadable file, never retried).
#[derive(Default)]
enum Slot {
    #[default]
    Unopened,
    Open(Arc<Store>),
    Refused,
}

/// The notices store of one context: opened on first use, held after.
#[derive(Default)]
pub struct Notices {
    store: Mutex<Slot>,
}

impl Notices {
    pub fn new() -> Notices {
        Notices::default()
    }

    /// Whether the store has been opened (a boot test asserts it has not, D-17).
    pub fn is_loaded(&self) -> bool {
        !matches!(
            *self.store.lock().unwrap_or_else(|e| e.into_inner()),
            Slot::Unopened
        )
    }

    /// Runs `f` over the store's view, opening the store first when it is not open. An unreadable (corrupt)
    /// file leaves a view with no store: every read answers nothing and every write is refused, and the
    /// file is never touched. The lock is held for the whole call, so a dismissal's read and write cannot
    /// interleave with another's.
    pub fn with_view<R>(&self, ctx: &EngineCtx, f: impl FnOnce(&NoticeView) -> R) -> R {
        let mut slot = self.store.lock().unwrap_or_else(|e| e.into_inner());
        if matches!(*slot, Slot::Unopened) {
            let dir = ctx.paths.user_data.join("store_cache");
            *slot = match ctx.host.open_cache(&dir, NOTICES_STORE) {
                Ok(store) => Slot::Open(store),
                Err(_) => Slot::Refused,
            };
        }
        let view = NoticeView {
            store: match &*slot {
                Slot::Open(store) => Some(Arc::clone(store)),
                _ => None,
            },
            now_ms: ctx.clock.now_ms(),
            write_refused: Cell::new(false),
        };
        f(&view)
    }
}

/// One use of the store: reads, and the two-key write. `write_refused` is raised when a write could not
/// be made (a corrupt or read-only store).
pub struct NoticeView {
    store: Option<Arc<Store>>,
    now_ms: u64,
    write_refused: Cell<bool>,
}

impl NoticeView {
    /// Whether any write of this use was refused.
    pub fn write_refused(&self) -> bool {
        self.write_refused.get()
    }
}

impl NoticeStore for NoticeView {
    fn get(&self, key: &str) -> Option<Value> {
        self.store.as_ref()?.get(key).map(|json| json.to_value())
    }

    /// `CacheStore.set`: the value, then the `Date()` text at `__timestamp.<key>`.
    fn set(&self, key: &str, value: Value) {
        let Some(store) = &self.store else {
            self.write_refused.set(true);
            return;
        };
        if store.read_only().is_some() {
            self.write_refused.set(true);
            return;
        }
        let stamp = Json::Str(js_date_string(self.now_ms));
        let written = store
            .set(key, Json::from(value))
            .and_then(|()| store.set(&format!("__timestamp.{key}"), stamp));
        if written.is_err() {
            self.write_refused.set(true);
        }
    }
}

/// `dismissEngineNotice`: `{kind: 'no-crossover'}`, `{kind: 'untested-crossover', build}` or
/// `{kind: 'crossover-trial', daysRemaining}`. Any other shape, a build that is not four dotted numbers,
/// a day count above [`TRIAL_NOTICE_DAYS`] and a write the store refused answer `false` and write nothing
/// more. The trial kind is the only one that writes a line to the log.
pub fn dismiss(ctx: &EngineCtx, args: &Value) -> bool {
    let Some(object) = args.as_object() else {
        return false;
    };
    if matches!(object.get("kind"), Some(Value::String(kind)) if kind == "crossover-trial") {
        return dismiss_trial(ctx, object);
    }
    ctx.notices.with_view(ctx, |view| match object.get("kind") {
        Some(Value::String(kind)) if kind == "no-crossover" => {
            view.set(NO_CROSSOVER_KEY, Value::Bool(true));
            !view.write_refused()
        }
        Some(Value::String(kind)) if kind == "untested-crossover" => {
            let Some(Value::String(build)) = object.get("build") else {
                return false;
            };
            dismiss_untested_notice(build, view) && !view.write_refused()
        }
        _ => false,
    })
}

/// The `crossover-trial` dismissal. It stores the larger of the stored and the new end day, so a dismissal
/// on an earlier-ending bottle never un-hides a later one. A count above [`TRIAL_NOTICE_DAYS`] is refused
/// and writes nothing. One info line is logged either way (numbers and a bool, never a path).
fn dismiss_trial(ctx: &EngineCtx, object: &serde_json::Map<String, Value>) -> bool {
    let Some(days) = object.get("daysRemaining").and_then(Value::as_u64) else {
        return false;
    };
    let (end, ok) = ctx.notices.with_view(ctx, |view| {
        let end = trial_end_day(view.now_ms, days);
        if days > TRIAL_NOTICE_DAYS {
            return (end, false);
        }
        let prior = view
            .get(TRIAL_DISMISSED_END_DAY_KEY)
            .and_then(|value| value.as_u64())
            .unwrap_or(0);
        view.set(TRIAL_DISMISSED_END_DAY_KEY, Value::from(prior.max(end)));
        (end, !view.write_refused())
    });
    if let Some(log) = &ctx.log {
        log.info(&format!(
            "Engine: CrossOver trial notice dismissed daysRemaining={days} trialEndDay={end} ok={ok}"
        ));
    }
    ok
}

const WEEKDAYS: [&str; 7] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/// JS `Date()` as Node prints it under `TZ=UTC`: `Mon Nov 23 2026 12:00:00 GMT+0000 (Coordinated
/// Universal Time)`. The TS wrote the machine's local form of the same instant; this is the UTC one, and
/// both parse to the same instant (the same stamp `gamelib-info`'s cache view writes).
pub fn js_date_string(ms: u64) -> String {
    let days = (ms / 86_400_000) as i64;
    let secs = (ms / 1000) % 86_400;
    // Howard Hinnant's civil_from_days over days since 1970-01-01.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    let weekday = WEEKDAYS[((days + 4).rem_euclid(7)) as usize];
    format!(
        "{weekday} {} {day:02} {year:04} {:02}:{:02}:{:02} GMT+0000 (Coordinated Universal Time)",
        MONTHS[(month - 1) as usize],
        secs / 3600,
        (secs / 60) % 60,
        secs % 60
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn the_stamp_is_the_js_utc_long_form() {
        // 2026-11-23 12:00:00 UTC, the goldens' start.
        assert_eq!(
            js_date_string(1_795_435_200_000),
            "Mon Nov 23 2026 12:00:00 GMT+0000 (Coordinated Universal Time)"
        );
        assert_eq!(
            js_date_string(0),
            "Thu Jan 01 1970 00:00:00 GMT+0000 (Coordinated Universal Time)"
        );
        // A leap day and the last second of a year.
        assert_eq!(
            js_date_string(1_709_164_800_000),
            "Thu Feb 29 2024 00:00:00 GMT+0000 (Coordinated Universal Time)"
        );
        assert_eq!(
            js_date_string(1_767_225_599_000),
            "Wed Dec 31 2025 23:59:59 GMT+0000 (Coordinated Universal Time)"
        );
    }

    use std::cell::RefCell;
    use std::collections::HashMap;

    /// A platform-neutral notice store held in memory.
    #[derive(Default)]
    struct MemStore {
        map: RefCell<HashMap<String, Value>>,
    }

    impl NoticeStore for MemStore {
        fn get(&self, key: &str) -> Option<Value> {
            self.map.borrow().get(key).cloned()
        }

        fn set(&self, key: &str, value: Value) {
            self.map.borrow_mut().insert(key.to_string(), value);
        }
    }

    #[test]
    fn a_trial_is_keyed_by_its_estimated_end_day() {
        // 2026-11-23 12:00 UTC is epoch day 20780.
        assert_eq!(trial_end_day(1_795_435_200_000, 5), 20_785);
        assert_eq!(trial_end_day(1_795_435_200_000, 0), 20_780);
        assert_eq!(trial_end_day(u64::MAX, u64::MAX), u64::MAX);
    }

    #[test]
    fn a_trial_is_dismissed_within_the_slack_of_the_stored_end_day_and_earlier() {
        let store = MemStore::default();
        assert!(!is_trial_notice_dismissed(&store, 20_785));
        store.set(TRIAL_DISMISSED_END_DAY_KEY, Value::from(20_785u64));
        for dismissed in [20_785, 20_788, 20_700] {
            assert!(is_trial_notice_dismissed(&store, dismissed), "{dismissed}");
        }
        assert!(!is_trial_notice_dismissed(&store, 20_789));
    }

    #[test]
    fn a_stored_value_that_is_not_a_non_negative_integer_reads_as_not_dismissed() {
        let store = MemStore::default();
        for bad in [json!("x"), json!(-1), json!(1.5), json!(true), json!(null)] {
            store.set(TRIAL_DISMISSED_END_DAY_KEY, bad.clone());
            assert!(!is_trial_notice_dismissed(&store, 0), "{bad}");
        }
    }
}
