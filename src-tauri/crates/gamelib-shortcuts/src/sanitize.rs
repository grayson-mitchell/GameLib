//! A hand port of the npm `sanitize-filename` package (Pitfall 9), the one that cleans a game title
//! into a file name for the `.desktop`, `.lnk` and `.app` shortcut files.
//!
//! The package works on UTF-16 code units, so this port does too: [`sanitize_utf16`] is the faithful
//! form (a lone surrogate survives, as it does in JavaScript) and [`sanitize_filename`] is the `&str`
//! convenience over it. The 255 limit is in UTF-8 bytes, counted the way `truncate-utf8-bytes` does:
//! a valid surrogate pair is four bytes, a lone surrogate three (Node encodes it as U+FFFD).
//!
//! The steps, in the package's order, each a global replace with the empty string:
//!
//! 1. the illegal characters `/ ? < > \ : * | "`,
//! 2. the control characters `U+0000..=U+001F` and `U+0080..=U+009F`,
//! 3. a name made only of dots (`.`, `..`, `...`),
//! 4. a Windows reserved name (`con`, `prn`, `aux`, `nul`, `com0..9`, `lpt0..9`), any case, with or
//!    without an extension,
//! 5. trailing dots and spaces,
//! 6. truncation to 255 UTF-8 bytes.
//!
//! Pinned to the package's own output by the `golden/sanitize` replay.

/// The longest result, in UTF-8 bytes.
const MAX_BYTES: usize = 255;

/// The characters `illegalRe` removes: `/ ? < > \ : * | "`.
fn is_illegal(unit: u16) -> bool {
    matches!(
        unit,
        0x2F | 0x3F | 0x3C | 0x3E | 0x5C | 0x3A | 0x2A | 0x7C | 0x22
    )
}

/// `controlRe`: `[\x00-\x1f\x80-\x9f]`.
fn is_control(unit: u16) -> bool {
    unit <= 0x1F || (0x80..=0x9F).contains(&unit)
}

/// A JavaScript `.` does not match a line terminator.
fn is_line_terminator(unit: u16) -> bool {
    matches!(unit, 0x0A | 0x0D | 0x2028 | 0x2029)
}

/// `windowsReservedRe`: `^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$`, case-insensitive. The flag
/// is not Unicode-aware, so only ASCII letters fold, which is what the literals need.
fn is_windows_reserved(units: &[u16]) -> bool {
    let lower = |u: u16| -> u16 {
        if (0x41..=0x5A).contains(&u) {
            u + 0x20
        } else {
            u
        }
    };
    let ascii: Vec<u16> = units.iter().take(5).map(|&u| lower(u)).collect();
    let word = |w: &str| -> bool {
        let w: Vec<u16> = w.encode_utf16().collect();
        ascii.len() >= w.len() && ascii[..w.len()] == w[..]
    };
    let head_len = if word("con") || word("prn") || word("aux") || word("nul") {
        3
    } else if (word("com") || word("lpt"))
        && ascii.get(3).is_some_and(|d| (0x30..=0x39).contains(d))
    {
        4
    } else {
        return false;
    };
    match units.get(head_len) {
        None => true,
        Some(&0x2E) => !units[head_len + 1..].iter().any(|&u| is_line_terminator(u)),
        Some(_) => false,
    }
}

fn is_high_surrogate(unit: u16) -> bool {
    (0xD800..=0xDBFF).contains(&unit)
}

fn is_low_surrogate(unit: u16) -> bool {
    (0xDC00..=0xDFFF).contains(&unit)
}

/// `truncate-utf8-bytes`: keeps whole segments (a surrogate pair, or one code unit) while the total
/// stays within `limit` bytes.
fn truncate_utf8_bytes(units: Vec<u16>, limit: usize) -> Vec<u16> {
    let mut total = 0usize;
    let mut i = 0usize;
    while i < units.len() {
        let paired =
            is_high_surrogate(units[i]) && units.get(i + 1).is_some_and(|&u| is_low_surrogate(u));
        let (segment_units, segment_bytes) = if paired {
            (2, 4)
        } else {
            (1, utf8_len_of_unit(units[i]))
        };
        if total + segment_bytes > limit {
            return units[..i].to_vec();
        }
        total += segment_bytes;
        i += segment_units;
    }
    units
}

/// Node's `Buffer.byteLength` of one lone code unit: 1, 2 or 3 bytes (a lone surrogate is U+FFFD).
fn utf8_len_of_unit(unit: u16) -> usize {
    match unit {
        0x0000..=0x007F => 1,
        0x0080..=0x07FF => 2,
        _ => 3,
    }
}

/// `sanitize(input)` over UTF-16 code units.
pub fn sanitize_utf16(input: &[u16]) -> Vec<u16> {
    let mut units: Vec<u16> = input
        .iter()
        .copied()
        .filter(|&u| !is_illegal(u) && !is_control(u))
        .collect();
    // `^\.+$`: only dots, at least one.
    if !units.is_empty() && units.iter().all(|&u| u == 0x2E) {
        units.clear();
    }
    if is_windows_reserved(&units) {
        units.clear();
    }
    while matches!(units.last(), Some(&0x2E) | Some(&0x20)) {
        units.pop();
    }
    truncate_utf8_bytes(units, MAX_BYTES)
}

/// [`sanitize_utf16`] over text. A `&str` has no lone surrogate, and every step removes whole code
/// units or cuts at a segment boundary, so the result is always valid text.
pub fn sanitize_filename(input: &str) -> String {
    let units: Vec<u16> = input.encode_utf16().collect();
    String::from_utf16_lossy(&sanitize_utf16(&units))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_plain_title_is_unchanged() {
        assert_eq!(sanitize_filename("Plain Game"), "Plain Game");
    }

    #[test]
    fn illegal_and_control_characters_are_removed() {
        assert_eq!(sanitize_filename("a/b?c<d>e\\f:g*h|i\"j"), "abcdefghij");
        assert_eq!(sanitize_filename("a\u{0}b\u{1f}c\u{80}d\u{9f}e"), "abcde");
        assert_eq!(sanitize_filename("a\u{7f}b"), "a\u{7f}b");
    }

    #[test]
    fn dots_only_names_and_trailing_dots_and_spaces_go() {
        assert_eq!(sanitize_filename("."), "");
        assert_eq!(sanitize_filename("..."), "");
        assert_eq!(sanitize_filename("a. . "), "a");
        assert_eq!(sanitize_filename(" lead"), " lead");
    }

    #[test]
    fn windows_reserved_names_go_with_or_without_an_extension() {
        for reserved in [
            "con", "CON", "Prn", "aux", "NUL", "com1", "lpt9", "con.txt", "LPT3.a.b",
        ] {
            assert_eq!(sanitize_filename(reserved), "", "{reserved}");
        }
        for kept in ["com10", "console", "con2", "lpt", "xcon", "con-x", "comx"] {
            assert_eq!(sanitize_filename(kept), kept, "{kept}");
        }
    }

    #[test]
    fn a_reserved_name_with_a_unicode_line_separator_in_the_extension_is_kept() {
        // `.` does not match U+2028, so the extension group cannot span it.
        assert_eq!(sanitize_filename("con.a\u{2028}b"), "con.a\u{2028}b");
    }

    #[test]
    fn the_limit_is_255_utf8_bytes_cut_on_a_segment() {
        let long = "x".repeat(300);
        assert_eq!(sanitize_filename(&long).len(), 255);
        // 254 ASCII bytes then a 2-byte character: 256 > 255, so the character is dropped.
        let edge = format!("{}\u{e9}", "x".repeat(254));
        assert_eq!(sanitize_filename(&edge), "x".repeat(254));
        // 252 bytes then an astral character (4 bytes) lands exactly on 256: dropped.
        let astral = format!("{}\u{1F3AE}", "x".repeat(252));
        assert_eq!(sanitize_filename(&astral), "x".repeat(252));
        let fits = format!("{}\u{1F3AE}", "x".repeat(251));
        assert_eq!(sanitize_filename(&fits), fits);
    }

    #[test]
    fn a_lone_surrogate_survives_and_counts_three_bytes() {
        let lone = [0x61u16, 0xD83C, 0x62];
        assert_eq!(sanitize_utf16(&lone), lone.to_vec());
        // 253 ASCII + a lone surrogate (3 bytes) = 256 > 255: the surrogate is cut.
        let mut over: Vec<u16> = vec![0x78; 253];
        over.push(0xD800);
        assert_eq!(sanitize_utf16(&over), vec![0x78u16; 253]);
    }
}
