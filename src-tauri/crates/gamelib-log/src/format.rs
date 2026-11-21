//! `formatter.ts` and the `log_writer.ts` string rules, byte for byte.

use crate::prefix::{Level, Prefix, MAX_LEVEL_LEN, MAX_PREFIX_LEN};

/// `HH:MM:SS` of the origin's local wall clock: `ts_ms` plus its timezone offset in minutes.
pub fn hms(ts_ms: u64, tz_min: i32) -> String {
    let wall_ms = ts_ms as i64 + i64::from(tz_min) * 60_000;
    let secs_of_day = wall_ms.div_euclid(1000).rem_euclid(86_400);
    format!(
        "{:02}:{:02}:{:02}",
        secs_of_day / 3600,
        (secs_of_day % 3600) / 60,
        secs_of_day % 60
    )
}

fn pad_end(mut s: String, width: usize) -> String {
    let len = s.chars().count();
    for _ in len..width {
        s.push(' ');
    }
    s
}

/// One formatted line: `(HH:MM:SS) [LEVEL]:<pad> [Prefix]:<pad> body`. `None` for an empty body
/// (TS returns an empty string, which the writer then drops). No pid or origin field (D-04); the
/// General prefix has no chunk at all.
pub fn format_line(
    ts_ms: u64,
    tz_min: i32,
    level: Level,
    prefix: Prefix,
    body: &str,
) -> Option<String> {
    if body.is_empty() {
        return None;
    }
    let mut out = format!("({})", hms(ts_ms, tz_min));
    out.push(' ');
    out.push_str(&pad_end(
        format!("[{}]:", level.as_str()),
        MAX_LEVEL_LEN + 3,
    ));
    if prefix != Prefix::General {
        out.push(' ');
        out.push_str(&pad_end(
            format!("[{}]:", prefix.as_str()),
            MAX_PREFIX_LEN + 3,
        ));
    }
    out.push(' ');
    out.push_str(body);
    Some(out)
}

/// Exactly the characters JS `String.prototype.trim` strips: WhiteSpace plus LineTerminator. U+0085
/// is not among them (it is whitespace to Rust's `char::is_whitespace`, not to JS).
fn is_js_space(c: char) -> bool {
    matches!(
        c,
        '\u{0009}'
            | '\u{000A}'
            | '\u{000B}'
            | '\u{000C}'
            | '\u{000D}'
            | '\u{0020}'
            | '\u{00A0}'
            | '\u{1680}'
            | '\u{2000}'
            ..='\u{200A}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202F}'
                | '\u{205F}'
                | '\u{3000}'
                | '\u{FEFF}'
    )
}

/// `!message.trim().length`.
pub fn js_is_blank(s: &str) -> bool {
    s.chars().all(is_js_space)
}

/// The per-chunk rule of `LogWriter#writeString`: a blank chunk writes nothing, otherwise a newline
/// is appended only when the chunk does not already end with one.
pub fn normalise_chunk(s: &str) -> Option<String> {
    if js_is_blank(s) {
        return None;
    }
    let mut out = s.to_string();
    if !out.ends_with('\n') {
        out.push('\n');
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    // 2026-11-20 13:05:09 at UTC+13 is 00:05:09 UTC.
    const TS: u64 = 1_795_133_109_000;

    #[test]
    fn hms_is_the_origins_wall_clock() {
        assert_eq!(hms(TS, 780), "13:05:09");
        assert_eq!(hms(TS, 0), "00:05:09");
        assert_eq!(hms(TS, -300), "19:05:09");
        assert_eq!(hms(0, 345), "05:45:00");
        assert_eq!(hms(0, -1), "23:59:00");
    }

    #[test]
    fn a_line_pads_the_level_to_10_and_the_prefix_to_18() {
        assert_eq!(
            format_line(TS, 780, Level::Info, Prefix::Backend, "hi").as_deref(),
            Some("(13:05:09) [INFO]:    [Backend]:         hi")
        );
        assert_eq!(
            format_line(TS, 780, Level::Warning, Prefix::ProtocolHandler, "x").as_deref(),
            Some("(13:05:09) [WARNING]: [ProtocolHandler]: x")
        );
        assert_eq!(
            format_line(TS, 780, Level::Info, Prefix::Shell, "reaper").as_deref(),
            Some("(13:05:09) [INFO]:    [Shell]:           reaper")
        );
    }

    #[test]
    fn the_general_prefix_has_no_chunk_and_an_empty_body_no_line() {
        assert_eq!(
            format_line(TS, 780, Level::Debug, Prefix::General, "hello").as_deref(),
            Some("(13:05:09) [DEBUG]:   hello")
        );
        assert_eq!(format_line(TS, 780, Level::Info, Prefix::Backend, ""), None);
    }

    #[test]
    fn js_blank_matches_js_trim_exactly() {
        for c in [
            '\t', '\n', '\u{b}', '\u{c}', '\r', ' ', '\u{a0}', '\u{1680}',
        ] {
            assert!(js_is_blank(&c.to_string()), "{:?}", c);
        }
        for c in [
            '\u{2000}', '\u{200a}', '\u{2028}', '\u{2029}', '\u{202f}', '\u{205f}', '\u{3000}',
            '\u{feff}',
        ] {
            assert!(js_is_blank(&c.to_string()), "{:?}", c);
        }
        assert!(js_is_blank(""));
        // NEL is whitespace to Rust, not to JS trim; U+180E and U+200B are neither.
        assert!(!js_is_blank("\u{85}"));
        assert!(!js_is_blank("\u{200b}"));
        assert!(!js_is_blank("\u{180e}"));
        assert!(!js_is_blank(" a "));
    }

    #[test]
    fn normalise_drops_blank_and_appends_one_newline_only_when_missing() {
        assert_eq!(normalise_chunk("   \n"), None);
        assert_eq!(normalise_chunk("\t"), None);
        assert_eq!(normalise_chunk("a").as_deref(), Some("a\n"));
        assert_eq!(normalise_chunk("a\n").as_deref(), Some("a\n"));
        assert_eq!(normalise_chunk("a\r\n").as_deref(), Some("a\r\n"));
        assert_eq!(normalise_chunk("\u{85}").as_deref(), Some("\u{85}\n"));
    }
}
