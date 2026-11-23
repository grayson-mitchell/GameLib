//! The Wine manager: the release lists of the seven GitHub feeds, the `wine-downloader-info` store,
//! install with progress, checksum and abort, and guarded removal. A port of `src/backend/wine/manager/`
//! (`utils.ts`, `downloader/main.ts`, `downloader/utilities.ts`, `downloader/constants.ts`).
//!
//! Crate-only (D-06): the ops exist and nothing calls them yet; 87-20 flips every wine-manager caller
//! in one plan so the store and `<tools>/wine` never have a TS and a Rust writer at once.
//!
//! - [`releases`]: the feeds, the merge against the stored list, `wine_releases_info_ready`.
//! - [`store`]: the `wine-releases` key of `store/wine-downloader-info`, through the StoreHost.
//! - [`install`]: download with progress, sha512, extraction, backup and restore, notifications.
//! - [`remove`]: removal of the stored `installDir` only, through `gamelib-safety`.
//!
//! Nothing here reads the environment: every directory, the platform, the architecture, the clock and
//! the sinks arrive in [`WineCtx`]. No error or log line carries a URL, a path or a response body
//! (T-87-09, T-87-21): a failure is a category word.

pub mod install;
pub mod releases;
pub mod remove;
pub mod store;
#[cfg(all(test, feature = "testing"))]
pub(crate) mod testkit;

use std::path::Path;

use gamelib_safety::remove::remove_tree;
use gamelib_safety::safe_path::CaseMode;
use gamelib_safety::wire::{Outcome, Request, Target, TargetKind};
use gamelib_store::json::{Json, Num};
use serde_json::{json, Map, Value};

use crate::ctx::WineCtx;

/// `JSON.stringify`-visible truthiness of a stored value (JS `if (value)`): absent, `null`, `false`,
/// `0`, `NaN` and `""` are falsy.
pub(crate) fn truthy(value: Option<&Json>) -> bool {
    match value {
        None | Some(Json::Null) => false,
        Some(Json::Bool(b)) => *b,
        Some(Json::Num(Num::U(n))) => *n != 0,
        Some(Json::Num(Num::I(n))) => *n != 0,
        Some(Json::Num(Num::F(f))) => *f != 0.0 && !f.is_nan(),
        Some(Json::Str(s)) => !s.is_empty(),
        Some(Json::Arr(_) | Json::Obj(_)) => true,
    }
}

/// The text of `key` in an entry, `None` when absent or not text.
pub(crate) fn text_of<'a>(entry: &'a Json, key: &str) -> Option<&'a str> {
    entry.get(key).and_then(Json::as_str)
}

/// A whole number as the store holds it.
pub(crate) fn number(n: u64) -> Json {
    Json::Num(Num::U(n))
}

/// `Date.parse` for the ISO forms GitHub feeds and the store hold: `YYYY-MM-DD` and
/// `YYYY-MM-DDTHH:MM:SS[.fff]Z`. `None` is JS `NaN`, which orders as equal and compares false.
pub(crate) fn date_ms(text: &str) -> Option<i64> {
    let (day, time) = match text.split_once('T') {
        Some((day, time)) => (day, Some(time)),
        None => (text, None),
    };
    let mut parts = day.split('-');
    let (year, month, date) = (parts.next()?, parts.next()?, parts.next()?);
    if parts.next().is_some() || year.len() != 4 || month.len() != 2 || date.len() != 2 {
        return None;
    }
    let (year, month, date): (i64, i64, i64) =
        (year.parse().ok()?, month.parse().ok()?, date.parse().ok()?);
    if !(1..=12).contains(&month) || !(1..=31).contains(&date) {
        return None;
    }
    let mut ms = days_from_civil(year, month, date) * 86_400_000;
    if let Some(time) = time {
        let time = time.strip_suffix('Z')?;
        let (clock, fraction) = match time.split_once('.') {
            Some((clock, fraction)) => (clock, Some(fraction)),
            None => (time, None),
        };
        let mut hms = clock.split(':');
        let (h, m, s): (i64, i64, i64) = (
            hms.next()?.parse().ok()?,
            hms.next()?.parse().ok()?,
            hms.next()?.parse().ok()?,
        );
        if hms.next().is_some() || h > 24 || m > 59 || s > 59 {
            return None;
        }
        ms += (h * 3600 + m * 60 + s) * 1000;
        if let Some(fraction) = fraction {
            let digits: String = fraction.chars().take(3).collect();
            if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
                return None;
            }
            ms += format!("{digits:0<3}").parse::<i64>().ok()?;
        }
    }
    Some(ms)
}

/// Days since 1970-01-01 of a proleptic Gregorian date (Howard Hinnant's `days_from_civil`).
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// The renderer push `wineVersionsUpdated`.
pub(crate) fn emit_updated(ctx: &WineCtx) {
    ctx.engine.emitter.emit("wineVersionsUpdated", Vec::new());
}

/// The renderer push `progressOfWineManager(version, state)`.
pub(crate) fn emit_progress(ctx: &WineCtx, version: &str, state: Value) {
    ctx.engine
        .emitter
        .emit("progressOfWineManager", vec![json!(version), state]);
}

/// A system notification whose body is the catalog text of `key`, `default` when the catalog has none.
/// Headless (no UI sink) nothing is shown.
pub(crate) fn notify(ctx: &WineCtx, title: &str, key: &str, default: &str) {
    if let Some(ui) = &ctx.engine.ui {
        let body = ctx.engine.i18n.t(key, default, &Map::new());
        ui.notify(title, &body);
    }
}

pub(crate) fn log_info(ctx: &WineCtx, line: &str) {
    if let Some(log) = &ctx.engine.log {
        log.info(line);
    }
}

pub(crate) fn log_warn(ctx: &WineCtx, line: &str) {
    if let Some(log) = &ctx.engine.log {
        log.warn(line);
    }
}

pub(crate) fn log_error(ctx: &WineCtx, line: &str) {
    if let Some(log) = &ctx.engine.log {
        log.error(line);
    }
}

/// The version of a release as a path component (`<install dir>/<version>`): the renderer sends it, so
/// a separator, a drive colon, a NUL, or a dot segment could name a directory outside the install
/// directory. Refused before any path is built.
pub(crate) fn plain_component(text: &str) -> bool {
    !text.is_empty()
        && text != "."
        && text != ".."
        && text.len() <= 255
        && !text.contains(['/', '\\', ':', '\0'])
}

/// Why a guarded removal did not remove.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RemoveFailure {
    /// `gamelib-safety` did not say yes (a refusal, an unknown, a path that is not text): nothing was
    /// removed (D-19).
    Refused,
    /// `gamelib-safety` said yes and the delete itself failed part way.
    Failed,
}

/// Removes `path` through `gamelib-safety` with `trust_root` as the folder it must lie strictly
/// inside. The home, the app folder and the tools directory are protected roots, the known-installs
/// list is known and empty (no game owns a wine-manager install), and a link is unlinked and its
/// referent left (D-15). Only `Removed` is `Ok`.
pub(crate) fn remove_guarded(
    ctx: &WineCtx,
    path: &Path,
    trust_root: &Path,
) -> Result<(), RemoveFailure> {
    let text = |p: &Path| p.to_str().map(str::to_string);
    let (Some(target), Some(root)) = (text(path), text(trust_root)) else {
        return Err(RemoveFailure::Refused);
    };
    let request = Request {
        targets: vec![Target {
            id: "wine-manager".to_string(),
            path: target,
            kind: TargetKind::AppData,
            trust_root: Some(root),
            executable: None,
        }],
        known_installs: Some(Vec::new()),
        self_key: None,
        protected_roots: [
            &ctx.engine.paths.user_home,
            &ctx.engine.paths.app_folder,
            &ctx.engine.paths.tools_path,
        ]
        .into_iter()
        .filter_map(|p| text(p))
        .collect(),
    };
    match remove_tree(&request, CaseMode::Auto).outcome {
        Outcome::Removed => Ok(()),
        Outcome::Refused => Err(RemoveFailure::Refused),
        Outcome::Failed => Err(RemoveFailure::Failed),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn date_ms_reads_the_iso_forms_and_nothing_else() {
        assert_eq!(date_ms("1970-01-01"), Some(0));
        assert_eq!(date_ms("1970-01-02"), Some(86_400_000));
        assert_eq!(date_ms("2024-06-02"), Some(1_717_286_400_000));
        assert_eq!(date_ms("2024-06-02T00:00:01Z"), Some(1_717_286_401_000));
        assert_eq!(date_ms("2024-06-02T00:00:00.5Z"), Some(1_717_286_400_500));
        for bad in ["", "June 2", "2024-13-01", "2024-06", "2024-06-02T10:00:00"] {
            assert_eq!(date_ms(bad), None, "{bad}");
        }
    }

    #[test]
    fn a_version_is_one_plain_component() {
        assert!(plain_component("GE-Proton9-27"));
        for bad in ["", ".", "..", "a/b", "a\\b", "C:x", "a\0b", "../x"] {
            assert!(!plain_component(bad), "{bad:?}");
        }
    }

    #[test]
    fn truthiness_follows_javascript() {
        assert!(!truthy(None));
        assert!(!truthy(Some(&Json::Null)));
        assert!(!truthy(Some(&Json::Str(String::new()))));
        assert!(!truthy(Some(&Json::Bool(false))));
        assert!(!truthy(Some(&number(0))));
        assert!(truthy(Some(&Json::Str("x".into()))));
        assert!(truthy(Some(&Json::Bool(true))));
        assert!(truthy(Some(&Json::Arr(Vec::new()))));
    }
}
