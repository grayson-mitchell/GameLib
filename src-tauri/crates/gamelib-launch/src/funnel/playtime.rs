//! The playtime step of the launch funnel (88.3-05, SVC-03): `tsStore`'s `firstPlayed`, `lastPlayed` and
//! `totalPlayed` (82 amendment row `timestampStore`, target 88.3) and the macOS "Runs for me" record
//! (82 amendment row `runsForMeStore`, target 88.3), both through the store host.
//!
//! **Play time** is the TS launcher's own arithmetic, copied as recorded: `startPlayingDate` is taken before any
//! pre-launch work (so a session includes the save download, the engine step and the before script), the session
//! is the whole minutes since then (`Math.floor` of the stored total plus the fractional session), and a store
//! that refuses a write is a fixed warning, never a failed launch.
//!
//! **Runs for me** is `common/runsForMe.ts` and `backend/runsForMe/index.ts`: a per-game tri-state kept as one
//! whole-record `games` map keyed `<appName>_<runner>` (a dotted app name is a dot path to the store, so the map
//! is read and written as a unit), auto-set once a session lasted [`RUNS_FOR_ME_AUTO_THRESHOLD_MS`], never
//! overriding a user's choice, macOS only, and never failing the launch. The TS stays for the renderer and the
//! Steam bottle monitor, so `golden/runs_for_me` stays live as the pin between the two.
//!
//! D-20 candidates copied as recorded, not fixed here: the map is read twice per write (once to decide, once
//! inside the write), a push failure after a successful write is reported as "could not record", and a
//! hand-edited store holding an array is read by index.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;

use gamelib_engine::ctx::Platform;
use gamelib_log::{Level, Prefix};
use gamelib_store::host::Store;
use gamelib_store::json::Json;
use gamelib_store::table::row_for_key;
use serde_json::{json, Map, Value};

use crate::ctx::LaunchCtx;
use crate::runner::stream::LaunchLogSink;
use crate::runner::RunnerName;

/// A game that stayed running this long (ms) is marked runs-for-me (`RUNS_FOR_ME_AUTO_THRESHOLD_MS`).
pub const RUNS_FOR_ME_AUTO_THRESHOLD_MS: i64 = 60_000;

/// `Date.prototype.toISOString` for a millisecond instant (UTC, four-digit years).
pub fn iso_string(ms: u64) -> String {
    let days = (ms / 86_400_000) as i64;
    let in_day = ms % 86_400_000;
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
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        in_day / 3_600_000,
        in_day / 60_000 % 60,
        in_day / 1000 % 60,
        in_day % 1000
    )
}

/// The `store/timestamp` store (`tsStore`) one launch writes its play time to.
pub struct PlayTimes {
    /// `None` when the store cannot be opened: play time is then not recorded.
    store: Option<Arc<Store>>,
}

impl PlayTimes {
    pub fn open(ctx: &LaunchCtx) -> PlayTimes {
        let store = row_for_key("store/timestamp").and_then(|row| {
            let path = ctx
                .engine
                .paths
                .user_data
                .join("store")
                .join("timestamp.json");
            ctx.engine.host.open_row(row, path).ok()
        });
        PlayTimes { store }
    }

    /// `tsStore.set(key, value)`. A store that refuses the write is a fixed warning, not a failed launch.
    fn set(&self, ctx: &LaunchCtx, key: &str, value: Value) {
        let Some(store) = &self.store else {
            return;
        };
        if store.set(key, Json::from(value)).is_err() {
            ctx.log_sink.general(
                Prefix::Backend,
                Level::Warning,
                "Recording play time failed",
            );
        }
    }

    /// `if (!tsStore.has(appName)) tsStore.set(`${appName}.firstPlayed`, now)`.
    pub fn first_played_if_new(&self, ctx: &LaunchCtx, app_name: &str, now_ms: u64) {
        let Some(store) = &self.store else {
            return;
        };
        if store.get(app_name).is_none() {
            self.set(
                ctx,
                &format!("{app_name}.firstPlayed"),
                json!(iso_string(now_ms)),
            );
        }
    }

    /// The end of a session: `lastPlayed`, then `totalPlayed` as the stored total plus the session's minutes,
    /// floored. `started_ms` is the instant taken before the pre-launch work.
    pub fn record_session_end(
        &self,
        ctx: &LaunchCtx,
        app_name: &str,
        started_ms: u64,
        ended_ms: u64,
    ) {
        self.set(
            ctx,
            &format!("{app_name}.lastPlayed"),
            json!(iso_string(ended_ms)),
        );
        let stored_total = self
            .store
            .as_ref()
            .and_then(|store| store.get(&format!("{app_name}.totalPlayed")))
            .and_then(|value| value.to_value().as_f64())
            .unwrap_or(0.0);
        let session_minutes = ended_ms.saturating_sub(started_ms) as f64 / 1000.0 / 60.0;
        let total = (session_minutes + stored_total).floor();
        self.set(ctx, &format!("{app_name}.totalPlayed"), json!(total as i64));
    }
}

/// What a session that ended outside the funnel's own tail records (88.3-07's quit-kill, 88.3-09's re-adopted
/// game): `lastPlayed` and `totalPlayed` from the launch's own start, as the funnel's tail writes them, then, but
/// for Steam (its launch promise tracks a hand-off, not the game), the macOS runs-for-me record from the time the
/// game ran.
pub fn record_session_playtime(
    ctx: &LaunchCtx,
    runner: RunnerName,
    app_name: &str,
    launch_started_at_ms: u64,
    start_playing_at_ms: u64,
    ended_ms: u64,
) {
    PlayTimes::open(ctx).record_session_end(ctx, app_name, launch_started_at_ms, ended_ms);
    if runner != RunnerName::Steam {
        let elapsed = ended_ms.saturating_sub(start_playing_at_ms);
        record_play_session(
            ctx,
            app_name,
            runner,
            i64::try_from(elapsed).unwrap_or(i64::MAX),
            ctx.engine.platform,
        );
    }
}

/// The three states of a game's override (`RunsForMeState`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunsForMeState {
    Auto,
    UserOn,
    UserOff,
}

impl RunsForMeState {
    pub fn as_str(self) -> &'static str {
        match self {
            RunsForMeState::Auto => "auto",
            RunsForMeState::UserOn => "user-on",
            RunsForMeState::UserOff => "user-off",
        }
    }

    /// The state a stored word names; any other word is garbage (T-mkz-02).
    pub fn parse(word: &str) -> Option<RunsForMeState> {
        match word {
            "auto" => Some(RunsForMeState::Auto),
            "user-on" => Some(RunsForMeState::UserOn),
            "user-off" => Some(RunsForMeState::UserOff),
            _ => None,
        }
    }
}

/// `runsForMeKey`: the same shape as `gameKey()` in the Library filter engine.
pub fn runs_for_me_key(app_name: &str, runner: RunnerName) -> String {
    format!("{app_name}_{}", runner.as_str())
}

/// `isRunsForMeOn`: effective "on" is `auto` or `user-on`.
pub fn is_runs_for_me_on(state: Option<RunsForMeState>) -> bool {
    matches!(state, Some(RunsForMeState::Auto | RunsForMeState::UserOn))
}

/// `nextRunsForMeAfterSession`: only an unset game can become `auto`; a user's choice is never overwritten.
pub fn next_runs_for_me_after_session(
    current: Option<RunsForMeState>,
    elapsed_ms: i64,
) -> Option<RunsForMeState> {
    if current.is_none() && elapsed_ms >= RUNS_FOR_ME_AUTO_THRESHOLD_MS {
        return Some(RunsForMeState::Auto);
    }
    current
}

/// `nextRunsForMeAfterUserToggle`.
pub fn next_runs_for_me_after_user_toggle(on: bool) -> RunsForMeState {
    if on {
        RunsForMeState::UserOn
    } else {
        RunsForMeState::UserOff
    }
}

/// `getRunsForMeMap`: the persisted map with every value outside the three-state set dropped. A value that is
/// not an object is empty; an array is read by index, as `Object.entries` does (a recorded D-20 candidate).
pub fn runs_for_me_map(raw: &Value) -> BTreeMap<String, RunsForMeState> {
    let entries: Vec<(String, &Value)> = match raw {
        Value::Object(map) => map
            .iter()
            .map(|(key, value)| (key.clone(), value))
            .collect(),
        Value::Array(items) => items
            .iter()
            .enumerate()
            .map(|(index, value)| (index.to_string(), value))
            .collect(),
        _ => Vec::new(),
    };
    entries
        .into_iter()
        .filter_map(|(key, value)| {
            value
                .as_str()
                .and_then(RunsForMeState::parse)
                .map(|state| (key, state))
        })
        .collect()
}

fn map_value(map: &BTreeMap<String, RunsForMeState>) -> Value {
    let mut out = Map::new();
    for (key, state) in map {
        out.insert(key.clone(), json!(state.as_str()));
    }
    Value::Object(out)
}

/// What a record needs of its store and the renderer: the `games` read (`get('games', {})`), the whole-record
/// write and the `runsForMeChanged` push. Each answers a fixed category word on a failure, so no error text
/// (a path, an OS message) reaches `gamelib.log`.
pub trait RunsForMeIo {
    fn read_games(&self) -> Result<Value, &'static str>;
    fn write_games(&self, games: &Value) -> Result<(), &'static str>;
    fn push(&self, games: &Value) -> Result<(), &'static str>;
}

/// The production IO: the `store/runs-for-me` store of the context's store host and its frontend emitter.
pub struct CtxRunsForMe<'a> {
    ctx: &'a LaunchCtx,
}

impl<'a> CtxRunsForMe<'a> {
    pub fn new(ctx: &'a LaunchCtx) -> CtxRunsForMe<'a> {
        CtxRunsForMe { ctx }
    }

    fn store(&self) -> Option<Arc<Store>> {
        let row = row_for_key("store/runs-for-me")?;
        let path: PathBuf = self
            .ctx
            .engine
            .paths
            .user_data
            .join("store")
            .join("runs-for-me.json");
        self.ctx.engine.host.open_row(row, path).ok()
    }
}

impl RunsForMeIo for CtxRunsForMe<'_> {
    fn read_games(&self) -> Result<Value, &'static str> {
        let store = self.store().ok_or("store-read")?;
        Ok(store
            .get("games")
            .map_or_else(|| json!({}), |value| value.to_value()))
    }

    fn write_games(&self, games: &Value) -> Result<(), &'static str> {
        let store = self.store().ok_or("store-write")?;
        store
            .set("games", Json::from(games.clone()))
            .map_err(|_| "store-write")
    }

    fn push(&self, games: &Value) -> Result<(), &'static str> {
        self.ctx
            .engine
            .emitter
            .emit("runsForMeChanged", vec![games.clone()]);
        Ok(())
    }
}

/// `writeAndPush`: a whole-record read (never `get('games.' + key)`: dots in app names), the key set, the
/// record written, and the renderer told.
fn write_and_push(
    io: &dyn RunsForMeIo,
    key: &str,
    state: RunsForMeState,
) -> Result<BTreeMap<String, RunsForMeState>, &'static str> {
    let mut next = runs_for_me_map(&io.read_games()?);
    next.insert(key.to_string(), state);
    let value = map_value(&next);
    io.write_games(&value)?;
    io.push(&value)?;
    Ok(next)
}

/// `setRunsForMeByUser` (U-1): an explicit user toggle, which wins over auto until toggled again.
pub fn set_runs_for_me_by_user(
    io: &dyn RunsForMeIo,
    app_name: &str,
    runner: RunnerName,
    on: bool,
) -> Result<BTreeMap<String, RunsForMeState>, &'static str> {
    write_and_push(
        io,
        &runs_for_me_key(app_name, runner),
        next_runs_for_me_after_user_toggle(on),
    )
}

/// `recordPlaySession` (U-2) over an IO and a log: records a finished session, auto-setting once it lasted the
/// threshold and never overriding a user's choice. macOS only (`platform` is `process.platform`'s word). Never
/// fails: a store problem is a fixed warning, because it must not break a game-stop path (T-mkz-03).
pub fn record_play_session_with(
    io: &dyn RunsForMeIo,
    log: &dyn LaunchLogSink,
    app_name: &str,
    runner: RunnerName,
    elapsed_ms: i64,
    platform: &str,
) {
    if platform != "darwin" {
        return;
    }
    let attempt = || -> Result<(), &'static str> {
        let key = runs_for_me_key(app_name, runner);
        let current = runs_for_me_map(&io.read_games()?).get(&key).copied();
        let next = next_runs_for_me_after_session(current, elapsed_ms);
        let Some(next) = next else {
            return Ok(());
        };
        if Some(next) == current {
            return Ok(());
        }
        write_and_push(io, &key, next)?;
        log.general(
            Prefix::Backend,
            Level::Info,
            &format!(
                "Runs for me: auto-set for {app_name} ({}) after {}s of play",
                runner.as_str(),
                (elapsed_ms as f64 / 1000.0).round() as i64
            ),
        );
        Ok(())
    };
    if let Err(word) = attempt() {
        log.general(
            Prefix::Backend,
            Level::Warning,
            &format!("Runs for me: could not record play session for {app_name}: {word}"),
        );
    }
}

/// `process.platform`'s word for a platform.
pub fn platform_word(platform: Platform) -> &'static str {
    match platform {
        Platform::Mac => "darwin",
        Platform::Windows => "win32",
        Platform::Linux => "linux",
    }
}

/// `recordPlaySession` over the context's stores: what the funnel calls when a launch ends.
pub fn record_play_session(
    ctx: &LaunchCtx,
    app_name: &str,
    runner: RunnerName,
    elapsed_ms: i64,
    platform: Platform,
) {
    record_play_session_with(
        &CtxRunsForMe::new(ctx),
        ctx.log_sink.as_ref(),
        app_name,
        runner,
        elapsed_ms,
        platform_word(platform),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_iso_string_is_to_iso_string() {
        assert_eq!(iso_string(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso_string(1_767_225_600_000), "2026-01-01T00:00:00.000Z");
        assert_eq!(iso_string(1_767_225_690_123), "2026-01-01T00:01:30.123Z");
        // A leap day and the last millisecond of a year.
        assert_eq!(iso_string(1_709_164_800_000), "2024-02-29T00:00:00.000Z");
        assert_eq!(iso_string(1_798_761_599_999), "2026-12-31T23:59:59.999Z");
    }

    #[test]
    fn only_an_unset_game_becomes_auto_and_only_at_the_threshold() {
        assert_eq!(next_runs_for_me_after_session(None, 59_999), None);
        assert_eq!(
            next_runs_for_me_after_session(None, 60_000),
            Some(RunsForMeState::Auto)
        );
        assert_eq!(
            next_runs_for_me_after_session(Some(RunsForMeState::UserOff), 3_600_000),
            Some(RunsForMeState::UserOff)
        );
        assert_eq!(next_runs_for_me_after_session(None, -1), None);
    }

    #[test]
    fn the_map_drops_garbage_and_reads_an_array_by_index() {
        let map = runs_for_me_map(&json!({ "a_gog": "auto", "b_nile": "maybe", "c": 3 }));
        assert_eq!(map.len(), 1);
        assert_eq!(map["a_gog"], RunsForMeState::Auto);
        let by_index = runs_for_me_map(&json!(["auto"]));
        assert_eq!(by_index["0"], RunsForMeState::Auto);
        assert!(runs_for_me_map(&json!("auto")).is_empty());
        assert!(runs_for_me_map(&Value::Null).is_empty());
    }
}
