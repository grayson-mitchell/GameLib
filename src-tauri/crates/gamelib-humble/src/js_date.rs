//! The one piece of JavaScript `Date` the classifier leans on: `new Date(string)` (V8's ISO and legacy
//! parsers), `new Date(year, month, day)`, `getTime()` and `toISOString()` (Phase 94, Pitfall 6).
//!
//! The TypeScript `extractExpiration` accepts whatever `new Date(raw)` accepts, so a Humble order can
//! carry `"2026-08-01 12:34"`, `"Sat, 01 Aug 2026 12:34:56 GMT"`, `"March 5, 2020"` or `"8/1/26"` and
//! get a date. This module is a port of V8's `DateParser` (`src/date/dateparser*.{h,cc}`), the
//! ECMAScript 5 date-time parser tried first and the legacy (Safari-compatible) parser after it.
//!
//! Time values are `i64` milliseconds since the epoch, like a JavaScript time value. They are not
//! `jiff::Timestamp`: V8 accepts years up to 275760, and a `Timestamp` stops at 9999.
//!
//! Local time. A string with no zone (`"2026-08-01 12:34"`, `"2026/08/01"`) is read in the host's zone.
//! The crate allows fixed-offset civil time only (no tz database), so the host's zone is a
//! [`LocalZone`] the caller supplies; 94-15 decides where the shell gets it. A zone that observes
//! daylight saving cannot be one fixed offset, which is the one place this port is narrower than V8.

/// The host's local zone as a fixed offset east of UTC.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LocalZone {
    east_secs: i32,
}

impl LocalZone {
    pub const UTC: LocalZone = LocalZone { east_secs: 0 };

    pub const fn from_east_secs(east_secs: i32) -> LocalZone {
        LocalZone { east_secs }
    }

    fn east_ms(self) -> i64 {
        i64::from(self.east_secs) * 1000
    }
}

const MS_PER_DAY: i64 = 86_400_000;
/// ECMAScript's `TimeClip` bound: a time value is valid up to this many ms either side of the epoch.
const MAX_TIME_MS: i64 = 8_640_000_000_000_000;
/// V8 refuses to convert a local time to UTC past this (`kMaxTimeBeforeUTCInMs`).
const MAX_TIME_BEFORE_UTC_MS: i64 = MAX_TIME_MS + 31 * MS_PER_DAY;
/// V8's `MakeDay` bounds (`kMinYear`, `kMaxYear`, `kMinMonth`, `kMaxMonth`).
const MIN_YEAR: i64 = -1_000_000;
const MAX_YEAR: i64 = 1_000_000;
const MIN_MONTH: i64 = -10_000_000;
const MAX_MONTH: i64 = 10_000_000;

/// ECMAScript whitespace plus line terminators (what `String.prototype.trim` strips, and what V8's
/// date scanner treats as white space).
pub fn is_js_whitespace(c: char) -> bool {
    matches!(
        c,
        '\u{9}'
            | '\u{a}'
            | '\u{b}'
            | '\u{c}'
            | '\u{d}'
            | '\u{20}'
            | '\u{a0}'
            | '\u{1680}'
            | '\u{2000}'
            ..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}'
    )
}

fn is_js_whitespace_unit(c: u16) -> bool {
    char::from_u32(u32::from(c)).is_some_and(is_js_whitespace)
}

/// V8's `IsWhiteSpaceChar`, which the word scanner asks: white space WITHOUT the line terminators.
/// LF and CR sit below `'A'` so they never reach a word; U+2028 and U+2029 do, and a word they start
/// is an unknown keyword (so `"2026-08-01 "` is invalid, where a trailing NBSP is fine).
fn is_word_break_unit(c: u16) -> bool {
    is_js_whitespace_unit(c) && !matches!(c, 0x2028 | 0x2029)
}

/// `TimeClip` over a double: not finite or past the bound is an invalid date, otherwise truncated.
pub fn time_clip(t: f64) -> Option<i64> {
    if !t.is_finite() || t.abs() > MAX_TIME_MS as f64 {
        return None;
    }
    Some(t.trunc() as i64)
}

fn time_clip_ms(t: i64) -> Option<i64> {
    (t.abs() <= MAX_TIME_MS).then_some(t)
}

// ---------------------------------------------------------------------------------------------
// Civil calendar arithmetic (proleptic Gregorian, days since 1970-01-01)
// ---------------------------------------------------------------------------------------------

/// Days since the epoch of the civil date `y-m-d` (`m` is 1..=12, `d` may overflow the month).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y.rem_euclid(400);
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// The civil date `(year, month 1..=12, day)` of a day number.
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// V8's `MakeDay(year, month0, day)`: the day number, or `None` where V8 answers NaN. `month0` and
/// `day` roll over (`new Date(2026, 12, 45)` is 2027-02-14).
fn make_day(year: i64, month0: i64, day: i64) -> Option<i64> {
    if !(MIN_YEAR..=MAX_YEAR).contains(&year) || !(MIN_MONTH..=MAX_MONTH).contains(&month0) {
        return None;
    }
    let y = year + month0.div_euclid(12);
    let m = month0.rem_euclid(12);
    Some(days_from_civil(y, m + 1, 1) + day - 1)
}

/// `new Date(year, month0, day)` in `zone`: local midnight as a time value. A year of 0..=99 is read
/// as 1900..=1999, as the constructor does.
pub fn local_midnight(year: i64, month0: i64, day: i64, zone: LocalZone) -> Option<i64> {
    let year = if (0..=99).contains(&year) {
        1900 + year
    } else {
        year
    };
    let t = make_day(year, month0, day)?.checked_mul(MS_PER_DAY)?;
    if t.abs() > MAX_TIME_BEFORE_UTC_MS {
        return None;
    }
    time_clip_ms(t - zone.east_ms())
}

/// `Date.prototype.toISOString`: `None` where JavaScript throws a `RangeError` (an invalid date).
pub fn to_iso_string(ms: i64) -> Option<String> {
    time_clip_ms(ms)?;
    let days = ms.div_euclid(MS_PER_DAY);
    let in_day = ms.rem_euclid(MS_PER_DAY);
    let (year, month, day) = civil_from_days(days);
    let year = if (0..=9999).contains(&year) {
        format!("{year:04}")
    } else {
        format!("{}{:06}", if year < 0 { '-' } else { '+' }, year.abs())
    };
    Some(format!(
        "{year}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        in_day / 3_600_000,
        in_day / 60_000 % 60,
        in_day / 1000 % 60,
        in_day % 1000
    ))
}

// ---------------------------------------------------------------------------------------------
// V8's DateParser
// ---------------------------------------------------------------------------------------------

const NONE: i32 = i32::MAX;
/// Digits of a numeral V8 keeps (`kMaxSignificantDigits`); a longer numeral is cut to its first nine.
const MAX_SIGNIFICANT_DIGITS: usize = 9;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Kw {
    Invalid,
    MonthName,
    TimeZoneName,
    TimeSeparator,
    AmPm,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Tok {
    Number { value: i32, len: usize },
    Symbol(u16),
    WhiteSpace,
    Unknown,
    Keyword { kind: Kw, value: i32, len: usize },
    End,
    Invalid,
}

impl Tok {
    fn is_number(self) -> bool {
        matches!(self, Tok::Number { .. })
    }

    fn number(self) -> i32 {
        match self {
            Tok::Number { value, .. } => value,
            _ => 0,
        }
    }

    fn is_fixed_length_number(self, n: usize) -> bool {
        matches!(self, Tok::Number { len, .. } if len == n)
    }

    fn is_symbol(self, c: char) -> bool {
        matches!(self, Tok::Symbol(s) if s == c as u16)
    }

    fn is_ascii_sign(self) -> bool {
        self.is_symbol('+') || self.is_symbol('-')
    }

    fn ascii_sign(self) -> i32 {
        if self.is_symbol('-') {
            -1
        } else {
            1
        }
    }

    fn is_keyword_type(self, kind: Kw) -> bool {
        matches!(self, Tok::Keyword { kind: k, .. } if k == kind)
    }

    fn is_keyword_z(self) -> bool {
        matches!(
            self,
            Tok::Keyword {
                kind: Kw::TimeZoneName,
                len: 1,
                ..
            }
        )
    }
}

/// The keyword table: three lower-case letters (NUL padded), type, value.
const KEYWORDS: &[([u8; 3], Kw, i32)] = &[
    (*b"jan", Kw::MonthName, 1),
    (*b"feb", Kw::MonthName, 2),
    (*b"mar", Kw::MonthName, 3),
    (*b"apr", Kw::MonthName, 4),
    (*b"may", Kw::MonthName, 5),
    (*b"jun", Kw::MonthName, 6),
    (*b"jul", Kw::MonthName, 7),
    (*b"aug", Kw::MonthName, 8),
    (*b"sep", Kw::MonthName, 9),
    (*b"oct", Kw::MonthName, 10),
    (*b"nov", Kw::MonthName, 11),
    (*b"dec", Kw::MonthName, 12),
    (*b"am\0", Kw::AmPm, 0),
    (*b"pm\0", Kw::AmPm, 12),
    (*b"ut\0", Kw::TimeZoneName, 0),
    (*b"utc", Kw::TimeZoneName, 0),
    (*b"z\0\0", Kw::TimeZoneName, 0),
    (*b"gmt", Kw::TimeZoneName, 0),
    (*b"cdt", Kw::TimeZoneName, -5),
    (*b"cst", Kw::TimeZoneName, -6),
    (*b"edt", Kw::TimeZoneName, -4),
    (*b"est", Kw::TimeZoneName, -5),
    (*b"mdt", Kw::TimeZoneName, -6),
    (*b"mst", Kw::TimeZoneName, -7),
    (*b"pdt", Kw::TimeZoneName, -7),
    (*b"pst", Kw::TimeZoneName, -8),
    (*b"t\0\0", Kw::TimeSeparator, 0),
];

fn keyword_lookup(prefix: [u32; 3], len: usize) -> (Kw, i32) {
    for (word, kind, value) in KEYWORDS {
        let matches = word.iter().zip(prefix).all(|(a, b)| u32::from(*a) == b);
        // A word longer than the keyword only matches a month name ("August", "Sept").
        if matches && (len <= 3 || *kind == Kw::MonthName) {
            return (*kind, *value);
        }
    }
    (Kw::Invalid, 0)
}

/// V8's `DateStringTokenizer` over UTF-16 code units. A NUL ends the input, as in V8.
struct Scanner<'a> {
    s: &'a [u16],
    pos: usize,
    next: Tok,
}

impl<'a> Scanner<'a> {
    fn new(s: &'a [u16]) -> Scanner<'a> {
        let mut scanner = Scanner {
            s,
            pos: 0,
            next: Tok::End,
        };
        scanner.next = scanner.scan();
        scanner
    }

    fn ch(&self) -> u16 {
        self.s.get(self.pos).copied().unwrap_or(0)
    }

    fn is_digit(c: u16) -> bool {
        (u16::from(b'0')..=u16::from(b'9')).contains(&c)
    }

    fn scan(&mut self) -> Tok {
        let pre = self.pos;
        let c = self.ch();
        if c == 0 {
            return Tok::End;
        }
        if Self::is_digit(c) {
            let mut n: i32 = 0;
            let mut i = 0usize;
            while self.ch() == u16::from(b'0') {
                self.pos += 1;
            }
            while Self::is_digit(self.ch()) {
                if i < MAX_SIGNIFICANT_DIGITS {
                    n = n * 10 + i32::from(self.ch() - u16::from(b'0'));
                }
                i += 1;
                self.pos += 1;
            }
            return Tok::Number {
                value: n,
                len: self.pos - pre,
            };
        }
        for symbol in *b":-+.)" {
            if c == u16::from(symbol) {
                self.pos += 1;
                return Tok::Symbol(c);
            }
        }
        if c >= u16::from(b'A') && !is_word_break_unit(c) {
            let mut prefix = [0u32; 3];
            let mut len = 0usize;
            while self.ch() != 0 && self.ch() >= u16::from(b'A') && !is_word_break_unit(self.ch()) {
                if len < 3 {
                    prefix[len] = u32::from(self.ch() | 0x20);
                }
                len += 1;
                self.pos += 1;
            }
            let (kind, value) = keyword_lookup(prefix, len);
            return Tok::Keyword { kind, value, len };
        }
        if is_js_whitespace_unit(c) {
            self.pos += 1;
            return Tok::WhiteSpace;
        }
        if c == u16::from(b'(') {
            let mut balance = 0i32;
            loop {
                if self.ch() == u16::from(b')') {
                    balance -= 1;
                } else if self.ch() == u16::from(b'(') {
                    balance += 1;
                }
                self.pos += 1;
                if !(balance > 0 && self.ch() != 0) {
                    break;
                }
            }
            return Tok::Unknown;
        }
        self.pos += 1;
        Tok::Unknown
    }

    fn next(&mut self) -> Tok {
        let result = self.next;
        self.next = self.scan();
        result
    }

    fn peek(&self) -> Tok {
        self.next
    }

    fn skip_symbol(&mut self, c: char) -> bool {
        if self.next.is_symbol(c) {
            self.next = self.scan();
            true
        } else {
            false
        }
    }
}

fn is_month(n: i32) -> bool {
    (1..=12).contains(&n)
}

fn is_day(n: i32) -> bool {
    (1..=31).contains(&n)
}

fn is_hour(n: i32) -> bool {
    (0..=23).contains(&n)
}

fn is_hour12(n: i32) -> bool {
    (0..=12).contains(&n)
}

fn is_minute(n: i32) -> bool {
    (0..=59).contains(&n)
}

fn is_second(n: i32) -> bool {
    (0..=59).contains(&n)
}

fn is_millisecond(n: i32) -> bool {
    (0..=999).contains(&n)
}

struct DayComposer {
    comp: [i32; 3],
    index: usize,
    named_month: i32,
    is_iso_date: bool,
}

impl DayComposer {
    fn new() -> DayComposer {
        DayComposer {
            comp: [0; 3],
            index: 0,
            named_month: NONE,
            is_iso_date: false,
        }
    }

    fn is_empty(&self) -> bool {
        self.index == 0
    }

    fn add(&mut self, n: i32) -> bool {
        if self.index < 3 {
            self.comp[self.index] = n;
            self.index += 1;
            true
        } else {
            false
        }
    }

    /// `(year, month0, day)`.
    fn write(&mut self) -> Option<(i64, i64, i64)> {
        if self.index < 1 {
            return None;
        }
        // Day and month default to 1.
        while self.index < 3 {
            self.comp[self.index] = 1;
            self.index += 1;
        }
        let mut year;
        let month;
        let day;
        if self.named_month == NONE {
            if self.is_iso_date || !is_day(self.comp[0]) {
                // YMD
                year = self.comp[0];
                month = self.comp[1];
                day = self.comp[2];
            } else {
                // MD(Y)
                month = self.comp[0];
                day = self.comp[1];
                year = self.comp[2];
            }
        } else {
            month = self.named_month;
            if !is_day(self.comp[0]) {
                // YMD, MYD or YDM
                year = self.comp[0];
                day = self.comp[1];
            } else {
                // DMY, MDY or DYM
                day = self.comp[0];
                year = self.comp[1];
            }
        }
        if !self.is_iso_date {
            if (0..=49).contains(&year) {
                year += 2000;
            } else if (50..=99).contains(&year) {
                year += 1900;
            }
        }
        if !is_month(month) || !is_day(day) {
            return None;
        }
        Some((i64::from(year), i64::from(month - 1), i64::from(day)))
    }
}

struct TimeComposer {
    comp: [i32; 4],
    index: usize,
    hour_offset: i32,
}

impl TimeComposer {
    fn new() -> TimeComposer {
        TimeComposer {
            comp: [0; 4],
            index: 0,
            hour_offset: NONE,
        }
    }

    fn is_empty(&self) -> bool {
        self.index == 0
    }

    fn is_expecting(&self, n: i32) -> bool {
        (self.index == 1 && is_minute(n))
            || (self.index == 2 && is_second(n))
            || (self.index == 3 && is_millisecond(n))
    }

    fn add(&mut self, n: i32) -> bool {
        if self.index < 4 {
            self.comp[self.index] = n;
            self.index += 1;
            true
        } else {
            false
        }
    }

    fn add_final(&mut self, n: i32) -> bool {
        if !self.add(n) {
            return false;
        }
        while self.index < 4 {
            self.comp[self.index] = 0;
            self.index += 1;
        }
        true
    }

    /// `(hour, minute, second, millisecond)`.
    fn write(&mut self) -> Option<(i64, i64, i64, i64)> {
        while self.index < 4 {
            self.comp[self.index] = 0;
            self.index += 1;
        }
        let [mut hour, minute, second, millisecond] = self.comp;
        if self.hour_offset != NONE {
            if !is_hour12(hour) {
                return None;
            }
            hour %= 12;
            hour += self.hour_offset;
        }
        if (!is_hour(hour) || !is_minute(minute) || !is_second(second) || !is_millisecond(millisecond))
            // A 24th hour is allowed if the minutes, seconds and milliseconds are 0.
            && (hour != 24 || minute != 0 || second != 0 || millisecond != 0)
        {
            return None;
        }
        Some((
            i64::from(hour),
            i64::from(minute),
            i64::from(second),
            i64::from(millisecond),
        ))
    }
}

struct TimeZoneComposer {
    sign: i32,
    hour: i32,
    minute: i32,
}

impl TimeZoneComposer {
    fn new() -> TimeZoneComposer {
        TimeZoneComposer {
            sign: NONE,
            hour: NONE,
            minute: NONE,
        }
    }

    fn set(&mut self, offset_in_hours: i32) {
        self.sign = if offset_in_hours < 0 { -1 } else { 1 };
        self.hour = offset_in_hours * self.sign;
        self.minute = 0;
    }

    fn set_sign(&mut self, sign: i32) {
        self.sign = if sign < 0 { -1 } else { 1 };
    }

    fn is_expecting(&self, n: i32) -> bool {
        self.hour != NONE && self.minute == NONE && is_minute(n)
    }

    fn is_utc(&self) -> bool {
        self.hour == 0 && self.minute == 0
    }

    fn is_empty(&self) -> bool {
        self.hour == NONE
    }

    /// The offset in seconds east of UTC, `Some(None)` for "no zone" (local time), `None` on failure.
    fn write(&mut self) -> Option<Option<i64>> {
        if self.sign == NONE {
            return Some(None);
        }
        if self.hour == NONE {
            self.hour = 0;
        }
        if self.minute == NONE {
            self.minute = 0;
        }
        let total = i64::from(self.hour) * 3600 + i64::from(self.minute) * 60;
        if total > i64::from(i32::MAX) {
            return None;
        }
        Some(Some(if self.sign < 0 { -total } else { total }))
    }
}

/// The ES5 `ReadMilliseconds`: the first three significant digits of a numeral, as milliseconds.
fn read_milliseconds(token: Tok) -> i32 {
    let Tok::Number { value, len } = token else {
        return 0;
    };
    let mut number = value;
    let mut length = len;
    if length < 3 {
        if length == 1 {
            number *= 100;
        } else if length == 2 {
            number *= 10;
        }
    } else if length > 3 {
        length = length.min(MAX_SIGNIFICANT_DIGITS);
        let mut factor = 1;
        loop {
            factor *= 10;
            length -= 1;
            if length <= 3 {
                break;
            }
        }
        number /= factor;
    }
    number
}

/// The ECMAScript 5 date-time string: `[+-yy]yyyy[-MM[-DD]][THH:mm[:ss[.sss]][Z|(+|-)hh:mm]]`. Returns
/// the first token it could not take (the legacy parser continues from it), `Tok::End` when the whole
/// string was an ES5 date-time, or `Tok::Invalid`.
fn parse_es5(
    scanner: &mut Scanner<'_>,
    day: &mut DayComposer,
    time: &mut TimeComposer,
    tz: &mut TimeZoneComposer,
) -> Tok {
    // The mandatory date: [('-'|'+')yy]yyyy[':'MM[':'DD]]
    if scanner.peek().is_ascii_sign() {
        // Keep the sign token: it signals the time zone.
        let sign_token = scanner.next();
        if !scanner.peek().is_fixed_length_number(6) {
            return sign_token;
        }
        let sign = sign_token.ascii_sign();
        let year = scanner.next().number();
        if sign < 0 && year == 0 {
            return sign_token;
        }
        day.add(sign * year);
    } else if scanner.peek().is_fixed_length_number(4) {
        day.add(scanner.next().number());
    } else {
        return scanner.next();
    }
    if scanner.skip_symbol('-') {
        if !scanner.peek().is_fixed_length_number(2) || !is_month(scanner.peek().number()) {
            return scanner.next();
        }
        day.add(scanner.next().number());
        if scanner.skip_symbol('-') {
            if !scanner.peek().is_fixed_length_number(2) || !is_day(scanner.peek().number()) {
                return scanner.next();
            }
            day.add(scanner.next().number());
        }
    }
    // The optional time.
    if !scanner.peek().is_keyword_type(Kw::TimeSeparator) {
        if scanner.peek() != Tok::End {
            return scanner.next();
        }
    } else {
        scanner.next();
        if !scanner.peek().is_fixed_length_number(2) || !(0..=24).contains(&scanner.peek().number())
        {
            return Tok::Invalid;
        }
        // 24:00[:00[.000]] is allowed, no other time starting with 24.
        let hour_is_24 = scanner.peek().number() == 24;
        time.add(scanner.next().number());
        if !scanner.skip_symbol(':') {
            return Tok::Invalid;
        }
        if !scanner.peek().is_fixed_length_number(2)
            || !is_minute(scanner.peek().number())
            || (hour_is_24 && scanner.peek().number() > 0)
        {
            return Tok::Invalid;
        }
        time.add(scanner.next().number());
        if scanner.skip_symbol(':') {
            if !scanner.peek().is_fixed_length_number(2)
                || !is_second(scanner.peek().number())
                || (hour_is_24 && scanner.peek().number() > 0)
            {
                return Tok::Invalid;
            }
            time.add(scanner.next().number());
            if scanner.skip_symbol('.') {
                if !scanner.peek().is_number() || (hour_is_24 && scanner.peek().number() > 0) {
                    return Tok::Invalid;
                }
                // More or less than the mandated three digits is allowed.
                let ms = read_milliseconds(scanner.next());
                time.add(ms);
            }
        }
        // The optional zone: 'Z' | ('+'|'-')hh:mm
        if scanner.peek().is_keyword_z() {
            scanner.next();
            tz.set(0);
        } else if scanner.peek().is_symbol('+') || scanner.peek().is_symbol('-') {
            tz.set_sign(if scanner.next().is_symbol('+') { 1 } else { -1 });
            if scanner.peek().is_fixed_length_number(4) {
                // The hhmm extension.
                let hourmin = scanner.next().number();
                let hour = hourmin / 100;
                let min = hourmin % 100;
                if !is_hour(hour) || !is_minute(min) {
                    return Tok::Invalid;
                }
                tz.hour = hour;
                tz.minute = min;
            } else {
                // hh:mm
                if !scanner.peek().is_fixed_length_number(2) || !is_hour(scanner.peek().number()) {
                    return Tok::Invalid;
                }
                tz.hour = scanner.next().number();
                if !scanner.skip_symbol(':') {
                    return Tok::Invalid;
                }
                if !scanner.peek().is_fixed_length_number(2) || !is_minute(scanner.peek().number())
                {
                    return Tok::Invalid;
                }
                tz.minute = scanner.next().number();
            }
        }
        if scanner.peek() != Tok::End {
            return Tok::Invalid;
        }
    }
    // "When the time zone offset is absent, date-only forms are interpreted as a UTC time and
    // date-time forms are interpreted as a local time."
    if tz.is_empty() && time.is_empty() {
        tz.set(0);
    }
    day.is_iso_date = true;
    Tok::End
}

/// `new Date(raw).getTime()`: `None` where JavaScript answers `NaN`.
pub fn parse_js_date(raw: &str, zone: LocalZone) -> Option<i64> {
    let units: Vec<u16> = raw.encode_utf16().collect();
    let mut scanner = Scanner::new(&units);
    let mut day = DayComposer::new();
    let mut time = TimeComposer::new();
    let mut tz = TimeZoneComposer::new();

    let mut token = parse_es5(&mut scanner, &mut day, &mut time, &mut tz);
    if token == Tok::Invalid {
        return None;
    }
    let mut has_read_number = !day.is_empty();
    // Whatever is left goes to the legacy parser.
    while token != Tok::End {
        match token {
            Tok::Number { value: n, .. } => {
                has_read_number = true;
                if scanner.skip_symbol(':') {
                    if scanner.skip_symbol(':') {
                        // n + "::"
                        if !time.is_empty() {
                            return None;
                        }
                        time.add(n);
                        time.add(0);
                    } else {
                        // n + ":"
                        if !time.add(n) {
                            return None;
                        }
                        if scanner.peek().is_symbol('.') {
                            scanner.next();
                        }
                    }
                } else if scanner.skip_symbol('.') && time.is_expecting(n) {
                    time.add(n);
                    if !scanner.peek().is_number() {
                        return None;
                    }
                    let ms = read_milliseconds(scanner.next());
                    if ms < 0 {
                        return None;
                    }
                    time.add_final(ms);
                } else if tz.is_expecting(n) {
                    tz.minute = n;
                } else if time.is_expecting(n) {
                    time.add_final(n);
                    // End, white space, "Z", "+" or "-" must follow a finalised time.
                    let peek = scanner.peek();
                    if peek != Tok::End
                        && peek != Tok::WhiteSpace
                        && !peek.is_keyword_z()
                        && !peek.is_ascii_sign()
                    {
                        return None;
                    }
                } else {
                    if !day.add(n) {
                        return None;
                    }
                    scanner.skip_symbol('-');
                }
            }
            Tok::Keyword { kind, value, .. } => {
                if kind == Kw::AmPm && !time.is_empty() {
                    time.hour_offset = value;
                } else if kind == Kw::MonthName {
                    day.named_month = value;
                    scanner.skip_symbol('-');
                } else if kind == Kw::TimeZoneName && has_read_number {
                    tz.set(value);
                } else {
                    // Garbage words are illegal once a number has been read.
                    if has_read_number {
                        return None;
                    }
                    // The first number has to be separated from garbage words.
                    if scanner.peek().is_number() {
                        return None;
                    }
                }
            }
            t if t.is_ascii_sign() && (tz.is_utc() || !time.is_empty()) => {
                // A UTC offset, only after UTC or a time.
                tz.set_sign(t.ascii_sign());
                // The following number may be missing.
                let mut n = 0;
                let mut length = 0;
                if scanner.peek().is_number() {
                    let next = scanner.next();
                    if let Tok::Number { value, len } = next {
                        n = value;
                        length = len;
                    }
                }
                has_read_number = true;
                if scanner.peek().is_symbol(':') {
                    tz.hour = n;
                    tz.minute = NONE;
                } else if length == 2 || length == 1 {
                    // GMT-8
                    tz.hour = n;
                    tz.minute = 0;
                } else if length == 4 || length == 3 {
                    // hhmm
                    tz.hour = n / 100;
                    tz.minute = n % 100;
                } else {
                    // No time zones like GMT-12345.
                    return None;
                }
            }
            t if (t.is_ascii_sign() || t.is_symbol(')')) && has_read_number => {
                // An extra sign or ')' is illegal once a number has been read.
                return None;
            }
            _ => {
                // Other characters and white space are ignored.
            }
        }
        token = scanner.next();
    }

    let (year, month0, dom) = day.write()?;
    let (hour, minute, second, ms) = time.write()?;
    let offset = tz.write()?;

    let days = make_day(year, month0, dom)?;
    let time_of_day = ((hour * 60 + minute) * 60 + second) * 1000 + ms;
    let date = days.checked_mul(MS_PER_DAY)?.checked_add(time_of_day)?;
    let utc = match offset {
        None => {
            if date.abs() > MAX_TIME_BEFORE_UTC_MS {
                return None;
            }
            date - zone.east_ms()
        }
        Some(secs) => date - secs * 1000,
    };
    time_clip_ms(utc)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_epoch_and_the_range_ends_format_like_to_iso_string() {
        assert_eq!(
            to_iso_string(0).as_deref(),
            Some("1970-01-01T00:00:00.000Z")
        );
        assert_eq!(
            to_iso_string(MAX_TIME_MS).as_deref(),
            Some("+275760-09-13T00:00:00.000Z")
        );
        assert_eq!(
            to_iso_string(-MAX_TIME_MS).as_deref(),
            Some("-271821-04-20T00:00:00.000Z")
        );
        assert_eq!(to_iso_string(MAX_TIME_MS + 1), None);
        assert_eq!(
            to_iso_string(-1).as_deref(),
            Some("1969-12-31T23:59:59.999Z")
        );
    }

    #[test]
    fn a_year_before_1000_is_zero_padded_and_year_zero_is_four_digits() {
        let ms = local_midnight(2, 0, 1, LocalZone::UTC);
        // 0..=99 reads as 1900..=1999.
        assert_eq!(
            to_iso_string(ms.unwrap()).as_deref(),
            Some("1902-01-01T00:00:00.000Z")
        );
        let ms = parse_js_date("0200-03-04T00:00:00Z", LocalZone::UTC).unwrap();
        assert_eq!(
            to_iso_string(ms).as_deref(),
            Some("0200-03-04T00:00:00.000Z")
        );
    }

    #[test]
    fn civil_arithmetic_round_trips_across_the_range() {
        for days in [
            -100_000_000i64,
            -719_468,
            -1,
            0,
            1,
            59,
            60,
            11_016,
            100_000_000,
        ] {
            let (y, m, d) = civil_from_days(days);
            assert_eq!(days_from_civil(y, m, d), days);
        }
    }

    #[test]
    fn local_midnight_rolls_over_and_follows_the_zone() {
        let phoenix = LocalZone::from_east_secs(-7 * 3600);
        let ms = local_midnight(2026, 1, 30, phoenix).unwrap();
        assert_eq!(
            to_iso_string(ms).as_deref(),
            Some("2026-03-02T07:00:00.000Z")
        );
        let ms = local_midnight(2026, 12, 45, LocalZone::UTC).unwrap();
        assert_eq!(
            to_iso_string(ms).as_deref(),
            Some("2027-02-14T00:00:00.000Z")
        );
    }

    #[test]
    fn javascript_whitespace_is_not_unicode_white_space() {
        assert!(is_js_whitespace('\u{feff}'));
        assert!(!is_js_whitespace('\u{85}'));
        assert!(is_js_whitespace('\u{2028}'));
        assert!(!is_js_whitespace('x'));
    }

    #[test]
    fn unparseable_text_is_not_a_date() {
        for raw in ["", "   ", "nope", "not-a-date", "1785000000", "2026-13-45"] {
            assert_eq!(parse_js_date(raw, LocalZone::UTC), None, "{raw:?}");
        }
    }
}
