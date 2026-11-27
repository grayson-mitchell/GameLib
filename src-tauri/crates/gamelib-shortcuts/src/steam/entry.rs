//! The `shortcuts.vdf` entry Add to Steam writes, ported from `addNonSteamGame` and `rustEntryFields`
//! (`nonesteamgame.ts`): the program and start folder, the launch options, `LastPlayTime`, and the typed
//! field list in the order the TS wrote it. Steam stores the flags as int32 and the `appid` as the int32 bit
//! pattern.
//!
//! The crate reads no environment: the shell supplies the executable, working folder, Flatpak id, AppImage
//! path and portable-exe paths in [`ShortcutsCtx`].
//!
//! `LaunchOptions` percent-encodes the app name and runner with `launch_url(.., true)` inside its double
//! quotes, as the `.lnk` and `run.sh` writers do (quick 261128-4j2). The TS wrote them raw, so a name holding a
//! double quote ended the quoted argument early. A shortcut written earlier keeps its raw line, because Add
//! never rewrites an entry already titled like the game, and `proves_app_name` still proves the raw form, so
//! Remove from Steam still removes it. The `appid` comes from `Exe` and `AppName` only, so it does not move.
//! The one golden whose bytes differ is recorded in `tests/fixtures/golden/steam/deltas.json`.

use gamelib_store::json::Json;
use gamelib_store::table::row_for_key;

use crate::ctx::{EntryField, Platform, ShortcutsCtx};
use crate::game::ShortcutGame;
use crate::launch_url::launch_url;

/// The quoted program and start folder of a new entry.
pub struct Program {
    pub exe: String,
    pub start_dir: String,
}

/// `Exe` and `StartDir`: the shell executable and its working folder, replaced by the Flatpak launcher, the
/// AppImage (off Windows) or the portable executable (on Windows), in that order of precedence.
pub fn program(ctx: &ShortcutsCtx) -> Program {
    let quoted = |text: &str| format!("\"{text}\"");
    let mut exe = quoted(&ctx.paths.shell_exe.to_string_lossy());
    let mut start_dir = quoted(&ctx.paths.cwd.to_string_lossy());
    let windows = ctx.platform == Platform::Windows;
    if ctx.flatpak_id.is_some() {
        exe = quoted("flatpak");
    } else if let Some(image) = ctx
        .appimage
        .as_deref()
        .filter(|path| !path.is_empty() && !windows)
    {
        exe = quoted(image);
    } else if let Some(portable) = ctx.portable_exe.as_ref().filter(|_| windows) {
        exe = quoted(&portable.file.to_string_lossy());
        start_dir = quoted(&portable.dir.to_string_lossy());
    }
    Program { exe, start_dir }
}

/// `LaunchOptions`: `--no-gui`, `--no-sandbox` off Windows, then the quoted, percent-encoded launch URL;
/// `run <id>` first under Flatpak.
pub fn launch_options(ctx: &ShortcutsCtx, game: &ShortcutGame) -> String {
    let mut args = vec!["--no-gui".to_string()];
    if ctx.platform != Platform::Windows {
        args.push("--no-sandbox".to_string());
    }
    args.push(format!(
        "\"{}\"",
        launch_url(&game.app_name, &game.runner, true)
    ));
    let joined = args.join(" ");
    match &ctx.flatpak_id {
        Some(id) => format!("run {id} {joined}"),
        None => joined,
    }
}

/// The fields of a new entry.
pub struct NewEntry {
    pub app_name: String,
    pub exe: String,
    pub start_dir: String,
    pub appid: i64,
    pub icon: Option<String>,
    pub launch_options: String,
    /// Unix seconds.
    pub last_play_time: i64,
}

/// The typed fields, in the key order the TS writer used.
pub fn fields(entry: &NewEntry) -> Vec<EntryField> {
    let string = |key: &str, value: &str| EntryField::String {
        key: key.to_string(),
        value: value.to_string(),
    };
    let int = |key: &str, value: i64| EntryField::Int32 {
        key: key.to_string(),
        value,
    };
    let mut out = vec![
        string("AppName", &entry.app_name),
        string("Exe", &entry.exe),
        string("StartDir", &entry.start_dir),
        int("appid", entry.appid),
    ];
    if let Some(icon) = entry.icon.as_deref().filter(|icon| !icon.is_empty()) {
        out.push(string("icon", icon));
    }
    out.extend([
        string("LaunchOptions", &entry.launch_options),
        int("IsHidden", 0),
        int("AllowDesktopConfig", 1),
        int("AllowOverlay", 1),
        int("OpenVR", 0),
        int("Devkit", 0),
        int("DevkitOverrideAppID", 0),
        int("LastPlayTime", entry.last_play_time),
    ]);
    out
}

/// `LastPlayTime`: the game's `lastPlayed` from the `timestamp` store, as unix seconds, else now.
///
/// What the TS did with the stored value is `new Date(value)` when it is truthy: an ISO string or epoch
/// milliseconds. An empty string, `0` and an absent key all mean now. A value that is not a date made the TS
/// send `null` and the write fail (the 94-07 `add-lastplayed-not-a-date` golden records the `null`); here it
/// means now as well, so a garbled timestamp never stops a game being added. Seconds outside the int32 Steam
/// stores are not a date either.
pub fn last_play_time(ctx: &ShortcutsCtx, app_name: &str) -> i64 {
    let now = (ctx.clock.now_ms() / 1000) as i64;
    stored_last_played(ctx, app_name)
        .and_then(|value| date_ms(&value))
        .map(|ms| ms.div_euclid(1000))
        .filter(|seconds| i32::try_from(*seconds).is_ok())
        .unwrap_or(now)
}

fn stored_last_played(ctx: &ShortcutsCtx, app_name: &str) -> Option<Json> {
    let dir = ctx.user_data.as_ref()?;
    let row = row_for_key("store/timestamp")?;
    let store = ctx
        .host
        .open_row(row, dir.join("store").join("timestamp.json"))
        .ok()?;
    store.get(&format!("{app_name}.lastPlayed"))
}

/// `new Date(value).getTime()` for a truthy `value`: an ISO string or epoch milliseconds. `None` is a falsy
/// value or one that is not a date.
fn date_ms(value: &Json) -> Option<i64> {
    match value {
        Json::Str(text) if !text.is_empty() => parse_iso_ms(text),
        Json::Num(_) => {
            let ms = value.as_f64()?;
            // JS `TimeClip`: finite, within 8.64e15, truncated; zero is falsy, so now.
            (ms.is_finite() && ms.abs() <= 8.64e15 && ms.trunc() != 0.0).then(|| ms.trunc() as i64)
        }
        _ => None,
    }
}

fn digits(bytes: &[u8], at: usize, len: usize) -> Option<i64> {
    let slice = bytes.get(at..at + len)?;
    if !slice.iter().all(u8::is_ascii_digit) {
        return None;
    }
    slice
        .iter()
        .try_fold(0i64, |acc, d| Some(acc * 10 + i64::from(d - b'0')))
}

/// Days since 1970-01-01 of a proleptic Gregorian date (Hinnant's `days_from_civil`).
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn days_in_month(year: i64, month: i64) -> i64 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        _ if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 => 29,
        _ => 28,
    }
}

/// An ISO 8601 date, or a date and time with a `Z` or `+hh:mm` zone (what `Date.prototype.toISOString` writes,
/// and the only form GameLib ever stores). A time with no zone is local time in JS and is refused here, as is
/// anything else.
fn parse_iso_ms(text: &str) -> Option<i64> {
    let b = text.as_bytes();
    let year = digits(b, 0, 4)?;
    if *b.get(4)? != b'-' || *b.get(7)? != b'-' {
        return None;
    }
    let (month, day) = (digits(b, 5, 2)?, digits(b, 8, 2)?);
    if !(1..=12).contains(&month) || day < 1 || day > days_in_month(year, month) {
        return None;
    }
    let date_ms = days_from_civil(year, month, day) * 86_400_000;
    if b.len() == 10 {
        return Some(date_ms);
    }
    if b[10] != b'T' || *b.get(13)? != b':' {
        return None;
    }
    let (hour, minute) = (digits(b, 11, 2)?, digits(b, 14, 2)?);
    let mut pos = 16;
    let (mut second, mut millis) = (0, 0);
    if b.get(pos) == Some(&b':') {
        second = digits(b, pos + 1, 2)?;
        pos += 3;
        if b.get(pos) == Some(&b'.') {
            let start = pos + 1;
            let end = b[start..]
                .iter()
                .position(|c| !c.is_ascii_digit())
                .map_or(b.len(), |n| start + n);
            if end == start {
                return None;
            }
            let mut fraction = text[start..end].chars().take(3).collect::<String>();
            while fraction.len() < 3 {
                fraction.push('0');
            }
            millis = fraction.parse().ok()?;
            pos = end;
        }
    }
    if hour > 23 || minute > 59 || second > 59 {
        return None;
    }
    let offset_ms = match b.get(pos)? {
        b'Z' if pos + 1 == b.len() => 0,
        sign @ (b'+' | b'-') if pos + 6 == b.len() && b[pos + 3] == b':' => {
            let (oh, om) = (digits(b, pos + 1, 2)?, digits(b, pos + 4, 2)?);
            if oh > 23 || om > 59 {
                return None;
            }
            let magnitude = (oh * 60 + om) * 60_000;
            if *sign == b'+' {
                magnitude
            } else {
                -magnitude
            }
        }
        _ => return None,
    };
    Some(date_ms + ((hour * 60 + minute) * 60 + second) * 1000 + millis - offset_ms)
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_store::json::Num;

    #[test]
    fn an_iso_instant_is_its_epoch_milliseconds() {
        assert_eq!(
            parse_iso_ms("2023-11-14T22:13:20.000Z"),
            Some(1_700_000_000_000)
        );
        assert_eq!(
            parse_iso_ms("2023-11-14T22:13:20.999Z"),
            Some(1_700_000_000_999)
        );
        assert_eq!(parse_iso_ms("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(parse_iso_ms("2024-02-29"), Some(1_709_164_800_000));
    }

    #[test]
    fn a_zone_offset_is_applied_and_a_zoneless_time_is_refused() {
        assert_eq!(
            parse_iso_ms("2023-11-14T23:13:20+01:00"),
            Some(1_700_000_000_000)
        );
        assert_eq!(
            parse_iso_ms("2023-11-14T20:43:20-01:30"),
            Some(1_700_000_000_000)
        );
        for bad in [
            "2023-11-14T22:13:20",
            "not a date",
            "2023-13-01",
            "2023-02-29",
            "2023-11-14T25:00:00Z",
            "2023-11-14T22:13:20.Z",
            "2023-11-14T22:13:20Zjunk",
            "",
        ] {
            assert_eq!(parse_iso_ms(bad), None, "{bad}");
        }
    }

    #[test]
    fn a_before_1970_instant_floors_to_the_second_below() {
        let ms = parse_iso_ms("1969-12-31T23:59:59.500Z").expect("a date");
        assert_eq!(ms, -500);
        assert_eq!(ms.div_euclid(1000), -1);
    }

    #[test]
    fn falsy_and_non_date_values_are_no_date() {
        assert_eq!(date_ms(&Json::Str(String::new())), None);
        assert_eq!(date_ms(&Json::Num(Num::I(0))), None);
        assert_eq!(date_ms(&Json::Num(Num::F(0.0))), None);
        assert_eq!(date_ms(&Json::Null), None);
        assert_eq!(date_ms(&Json::Bool(true)), None);
        assert_eq!(date_ms(&Json::Num(Num::F(f64::INFINITY))), None);
        assert_eq!(
            date_ms(&Json::Num(Num::U(1_700_000_000_000))),
            Some(1_700_000_000_000)
        );
    }

    #[test]
    fn the_field_list_keeps_the_ts_order_and_drops_an_empty_icon() {
        let entry = |icon: Option<&str>| NewEntry {
            app_name: "A".to_string(),
            exe: "\"x\"".to_string(),
            start_dir: "\"y\"".to_string(),
            appid: -5,
            icon: icon.map(str::to_string),
            launch_options: "o".to_string(),
            last_play_time: 7,
        };
        let keys = |fields: &[EntryField]| -> Vec<String> {
            fields
                .iter()
                .map(|f| match f {
                    EntryField::String { key, .. } | EntryField::Int32 { key, .. } => key.clone(),
                })
                .collect()
        };
        assert_eq!(
            keys(&fields(&entry(Some("/i.jpg")))),
            [
                "AppName",
                "Exe",
                "StartDir",
                "appid",
                "icon",
                "LaunchOptions",
                "IsHidden",
                "AllowDesktopConfig",
                "AllowOverlay",
                "OpenVR",
                "Devkit",
                "DevkitOverrideAppID",
                "LastPlayTime"
            ]
        );
        assert_eq!(fields(&entry(None)).len(), 12);
        assert_eq!(fields(&entry(Some(""))).len(), 12);
    }
}
