//! The classifier for raw winetricks output (`winetricksOutputClassifier.ts` and
//! `common/winetricks/logBuffer.ts`): every line is given exactly one kind before it reaches the log
//! or the renderer, the wine version a `wine --version` run printed is reduced the way winetricks
//! reduces it, and a chunk of output is split into lines.
//!
//! The TS patterns are regular expressions, and this crate has no regex dependency, so each is
//! written out by hand with the JavaScript semantics spelled explicitly: `\s` is the ECMAScript
//! whitespace set ([`is_js_whitespace`], not Rust's), `\d` is ASCII `0-9`, `\b` is an ASCII word
//! boundary, `.` stops at a line terminator, `String.length` counts UTF-16 units. The vectors of
//! `golden/../vectors/winetricks_pure.json` pin every one of them.

use gamelib_engine::jsutil::{is_js_whitespace, js_trim};
use serde::Serialize;

/// A process that never emits a newline must not grow our buffer without bound (T-45-17).
pub const MAX_REMAINDER_CHARS: usize = 65536;
/// A single forwarded line is never allowed to be larger than this.
pub const MAX_LINE_CHARS: usize = 2000;
/// The bounded line buffer of one flush and of one queue run.
pub const MAX_BUFFERED_LINES: usize = 200;

/// What a line of winetricks output is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LineKind {
    Progress,
    Noise,
    Info,
    Environment,
    Error,
}

/// One classified line (`WinetricksLogLine`). `percent` is only on a progress row of curl's meter.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LogLine {
    pub kind: LineKind,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percent: Option<u32>,
}

impl LogLine {
    pub fn new(kind: LineKind, text: impl Into<String>) -> LogLine {
        LogLine {
            kind,
            text: text.into(),
            percent: None,
        }
    }
}

/// ECMAScript `\w`.
fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

/// `.` of a regular expression without the `s` flag: anything but a line terminator.
fn is_line_terminator(c: char) -> bool {
    matches!(c, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

/// `/^\s*%\s+Total\b/`.
fn curl_header(line: &str) -> bool {
    let rest = line.trim_start_matches(is_js_whitespace);
    let Some(rest) = rest.strip_prefix('%') else {
        return false;
    };
    let after_ws = rest.trim_start_matches(is_js_whitespace);
    if after_ws.len() == rest.len() {
        return false;
    }
    match after_ws.strip_prefix("Total") {
        Some(tail) => !tail.chars().next().is_some_and(is_word),
        None => false,
    }
}

/// `/^\s*Dload\s+Upload\b/`.
fn curl_subheader(line: &str) -> bool {
    let rest = line.trim_start_matches(is_js_whitespace);
    let Some(rest) = rest.strip_prefix("Dload") else {
        return false;
    };
    let after_ws = rest.trim_start_matches(is_js_whitespace);
    if after_ws.len() == rest.len() {
        return false;
    }
    match after_ws.strip_prefix("Upload") {
        Some(tail) => !tail.chars().next().is_some_and(is_word),
        None => false,
    }
}

fn all_digits(token: &str) -> bool {
    !token.is_empty() && token.chars().all(|c| c.is_ascii_digit())
}

fn short_number(token: &str) -> bool {
    all_digits(token) && token.len() <= 3
}

/// `/^\s*(\d{1,3})\s+\S+\s+\d{1,3}\s+\S+\s+\d+\s+\d+\s+/`: the percentage of curl's meter row. The
/// pattern is six whitespace-separated fields (percent, size, percent, size, then two counters) with
/// whitespace after the sixth; its pieces are disjoint classes, so there is nothing to backtrack.
fn curl_row_percent(line: &str) -> Option<u32> {
    let mut rest = line.trim_start_matches(is_js_whitespace);
    let mut fields: Vec<&str> = Vec::with_capacity(6);
    while fields.len() < 6 {
        let end = rest.find(is_js_whitespace)?;
        fields.push(&rest[..end]);
        rest = rest[end..].trim_start_matches(is_js_whitespace);
    }
    // `find` found a whitespace after the sixth field, so the trailing `\s+` is satisfied.
    if short_number(fields[0])
        && short_number(fields[2])
        && all_digits(fields[4])
        && all_digits(fields[5])
    {
        fields[0].parse().ok()
    } else {
        None
    }
}

/// `/^([0-9a-f]{4,}:)?(fixme|err|warn|trace):/`.
fn wine_channel(trimmed: &str) -> bool {
    let after_channel = |text: &str| {
        ["fixme:", "err:", "warn:", "trace:"]
            .iter()
            .any(|channel| text.starts_with(channel))
    };
    let hex = trimmed
        .bytes()
        .take_while(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
        .count();
    if hex >= 4 && trimmed.as_bytes().get(hex) == Some(&b':') && after_channel(&trimmed[hex + 1..])
    {
        return true;
    }
    after_channel(trimmed)
}

/// `/^-{10,}$/`.
fn dashed(trimmed: &str) -> bool {
    trimmed.len() >= 10 && trimmed.bytes().all(|b| b == b'-')
}

/// `/Aborting\.?\s*$/` over a trimmed line.
fn aborting(trimmed: &str) -> bool {
    trimmed.ends_with("Aborting") || trimmed.ends_with("Aborting.")
}

/// `/returned status \d+/`.
fn returned_status(trimmed: &str) -> bool {
    const NEEDLE: &str = "returned status ";
    let mut from = 0;
    while let Some(at) = trimmed[from..].find(NEEDLE) {
        let after = from + at + NEEDLE.len();
        if trimmed[after..]
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_digit())
        {
            return true;
        }
        from += at + 1;
    }
    false
}

/// Wine's `regedit: The file '<path>' was not found`: a registry import (`regedit /S file.reg`) whose
/// `.reg` file was not there. Winetricks' `w_try` does not abort on it and the verb's run exits 0, so the
/// verb looked installed while its settings never reached the registry (87-59 item 4(c): `fontsmooth=bgr`
/// printed `regedit: The file 'C:\windows\Temp\_fontsmooth=bgr\fontsmooth.reg' was not found`, exit 0, and
/// the bottle's `user.reg` stayed as it was). A CLOSED rule (D-06 gate fix): this one form only, a quoted
/// non-empty path between the two fixed halves, never every `err:` line of wine, which is noise.
pub fn is_missing_regedit_file(line: &str) -> bool {
    const HEAD: &str = "regedit: The file '";
    const TAIL: &str = "' was not found";
    let trimmed = js_trim(line);
    trimmed.len() > HEAD.len() + TAIL.len() && trimmed.starts_with(HEAD) && trimmed.ends_with(TAIL)
}

/// `/^\S+ not installed! Winetricks might fail/`.
fn dependency_missing(trimmed: &str) -> bool {
    let end = trimmed.find(is_js_whitespace).unwrap_or(trimmed.len());
    end > 0 && trimmed[end..].starts_with(" not installed! Winetricks might fail")
}

/// `/Your version of wine (\S+) is no longer supported upstream/`: the captured version, searched
/// for from the left (the first occurrence that completes the pattern wins).
fn unsupported_notice(text: &str) -> Option<&str> {
    const LEAD: &str = "Your version of wine ";
    const TAIL: &str = " is no longer supported upstream";
    let mut from = 0;
    while let Some(at) = text[from..].find(LEAD) {
        let start = from + at + LEAD.len();
        let rest = &text[start..];
        let end = rest.find(is_js_whitespace).unwrap_or(rest.len());
        if end > 0 && rest[end..].starts_with(TAIL) {
            return Some(&rest[..end]);
        }
        from += at + 1;
    }
    None
}

/// `parseUnsupportedWineVersion`: the wine version of winetricks' "no longer supported" notice.
pub fn parse_unsupported_wine_version(line: &str) -> Option<String> {
    unsupported_notice(line).map(str::to_string)
}

/// `/^\d/`.
fn starts_with_digit(text: &str) -> bool {
    text.chars().next().is_some_and(|c| c.is_ascii_digit())
}

/// `parseWineVersionOutput`: winetricks' own derivation of `_wine_version_stripped` from the output of
/// `wine --version`, step for step.
pub fn parse_wine_version_output(raw: &str) -> Option<String> {
    // `winetricks_early_wine` strips \r; take the first non-empty line.
    let cleaned = raw.replace('\r', "");
    let line = cleaned
        .split('\n')
        .find(|candidate| !candidate.is_empty())?;
    // sed 's/.*wine/wine/': greedy, so up to the LAST lowercase "wine"; a `.` does not cross a
    // line terminator, so the match starts in the first segment (split at U+2028/U+2029) that holds
    // one.
    let mut after_sed = line.to_string();
    let mut segment_start = 0;
    for segment in line.split_inclusive(['\u{2028}', '\u{2029}']) {
        let body = segment.trim_end_matches(['\u{2028}', '\u{2029}']);
        if let Some(last) = body.rfind("wine") {
            after_sed = format!(
                "{}wine{}",
                &line[..segment_start],
                &line[segment_start + last + "wine".len()..]
            );
            break;
        }
        segment_start += segment.len();
    }
    // cut -d ' ' -f1
    let first_field = after_sed.split(' ').next()?;
    // sed -e 's/wine-//' -e 's/-rc.*//'
    let mut stripped = first_field.replacen("wine-", "", 1);
    if let Some(at) = stripped.find("-rc") {
        let tail = &stripped[at..];
        let stop = tail.find(is_line_terminator).unwrap_or(tail.len());
        stripped = format!("{}{}", &stripped[..at], &tail[stop..]);
    }
    starts_with_digit(&stripped).then_some(stripped)
}

/// `parseInt(text, 10)`; `NaN` is `None`.
fn js_parse_int(text: &str) -> Option<f64> {
    let trimmed = text.trim_start_matches(is_js_whitespace);
    let (sign, digits) = match trimmed.as_bytes().first() {
        Some(b'-') => (-1.0, &trimmed[1..]),
        Some(b'+') => (1.0, &trimmed[1..]),
        _ => (1.0, trimmed),
    };
    let run: String = digits.chars().take_while(|c| c.is_ascii_digit()).collect();
    if run.is_empty() {
        return None;
    }
    run.parse::<f64>().ok().map(|n| sign * n)
}

/// `isUnsupportedWineVersion`: winetricks' `w_wine_version_in ,7.99`, a numeric field-by-field
/// comparison against (7, 99, 0), so `10.0` sorts above `7.99`, not below it.
pub fn is_unsupported_wine_version(version: &str) -> bool {
    let fields: Vec<&str> = version.split('.').take(3).collect();
    let field =
        |i: usize| -> f64 { js_parse_int(fields.get(i).copied().unwrap_or("0")).unwrap_or(0.0) };
    for (i, threshold) in [7.0, 99.0, 0.0].into_iter().enumerate() {
        let actual = field(i);
        if actual != threshold {
            return actual < threshold;
        }
    }
    true
}

/// The first `MAX_LINE_CHARS` UTF-16 units of `line` and `...`, or the line itself.
fn clipped(line: &str) -> String {
    let units: Vec<u16> = line.encode_utf16().collect();
    if units.len() > MAX_LINE_CHARS {
        format!("{}...", String::from_utf16_lossy(&units[..MAX_LINE_CHARS]))
    } else {
        line.to_string()
    }
}

/// `classifyWinetricksLine`. `None` for a blank line.
pub fn classify_line(line: &str) -> Option<LogLine> {
    let trimmed = js_trim(line);
    if trimmed.is_empty() {
        return None;
    }
    let text = clipped(line);

    if curl_header(line) || curl_subheader(line) {
        return Some(LogLine::new(LineKind::Progress, text));
    }
    if let Some(percent) = curl_row_percent(line) {
        if percent <= 100 {
            return Some(LogLine {
                kind: LineKind::Progress,
                text,
                percent: Some(percent),
            });
        }
    }

    if wine_channel(trimmed) || dashed(trimmed) {
        return Some(LogLine::new(LineKind::Noise, text));
    }

    // Before `environment`: a failed `w_try` arrives behind a `warning:` prefix and must not be
    // downgraded to a generic warning.
    if aborting(trimmed) || returned_status(trimmed) || is_missing_regedit_file(trimmed) {
        return Some(LogLine::new(LineKind::Error, text));
    }

    if unsupported_notice(trimmed).is_some()
        || dependency_missing(trimmed)
        || trimmed.starts_with("warning:")
    {
        return Some(LogLine::new(LineKind::Environment, text));
    }

    Some(LogLine::new(LineKind::Info, text))
}

/// `appendLogLine`: appends `line` to a bounded line buffer. A progress line REPLACES the previous
/// progress line when nothing but wine noise has been appended since (curl redraws one meter), and
/// keeps the last known percent when the replacing line (a header) carries none. The oldest entry is
/// dropped once the buffer exceeds `cap`.
pub fn append_log_line(buffer: &mut Vec<LogLine>, line: LogLine, cap: usize) {
    if line.kind == LineKind::Progress {
        for i in (0..buffer.len()).rev() {
            match buffer[i].kind {
                LineKind::Progress => {
                    let percent = line.percent.or(buffer[i].percent);
                    buffer[i] = LogLine {
                        kind: LineKind::Progress,
                        text: line.text,
                        percent,
                    };
                    return;
                }
                LineKind::Noise => {}
                _ => break,
            }
        }
    }
    buffer.push(line);
    while buffer.len() > cap {
        buffer.remove(0);
    }
}

/// The lines of one chunk and what is left over for the next one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SplitChunk {
    pub lines: Vec<String>,
    pub remainder: String,
}

/// `splitOutputChunk`: splits on `\n` AND `\r` (curl redraws its meter with a bare `\r`, so splitting
/// on `\n` alone would hold the whole download as one unterminated "line"). Blank lines are dropped;
/// a tail past [`MAX_REMAINDER_CHARS`] UTF-16 units is cut off in pieces of that size.
pub fn split_output_chunk(remainder: &str, chunk: &str) -> SplitChunk {
    let text = format!("{remainder}{chunk}");
    let mut pieces: Vec<&str> = Vec::new();
    let bytes = text.as_bytes();
    let (mut start, mut i) = (0, 0);
    while i < bytes.len() {
        match bytes[i] {
            b'\r' if bytes.get(i + 1) == Some(&b'\n') => {
                pieces.push(&text[start..i]);
                i += 2;
                start = i;
            }
            b'\n' | b'\r' => {
                pieces.push(&text[start..i]);
                i += 1;
                start = i;
            }
            _ => i += 1,
        }
    }
    pieces.push(&text[start..]);
    let tail = pieces.pop().unwrap_or_default();
    let mut lines: Vec<String> = pieces
        .into_iter()
        .filter(|piece| !js_trim(piece).is_empty())
        .map(str::to_string)
        .collect();
    let mut units: Vec<u16> = tail.encode_utf16().collect();
    while units.len() > MAX_REMAINDER_CHARS {
        let rest = units.split_off(MAX_REMAINDER_CHARS);
        lines.push(String::from_utf16_lossy(&units));
        units = rest;
    }
    SplitChunk {
        lines,
        remainder: String::from_utf16_lossy(&units),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kind(line: &str) -> Option<LineKind> {
        classify_line(line).map(|l| l.kind)
    }

    #[test]
    fn curl_rows_carry_their_percent_and_a_row_over_100_is_not_progress() {
        let row = classify_line(" 42 12.3M   42 5229k    0     0  1234k      0  0:00:10").unwrap();
        assert_eq!((row.kind, row.percent), (LineKind::Progress, Some(42)));
        assert_eq!(
            kind("101 12.3M  101 12.3M    0     0  1234k      0  0:00:10"),
            Some(LineKind::Info)
        );
        // Four digits is not `\d{1,3}`.
        assert_eq!(
            kind("1000 12.3M  100 12.3M    0     0  1234k  x"),
            Some(LineKind::Info)
        );
        // No whitespace after the sixth field.
        assert_eq!(kind("5 a 5 b 0 0"), Some(LineKind::Info));
    }

    #[test]
    fn kinds_follow_the_ts_order() {
        assert_eq!(kind("   "), None);
        assert_eq!(kind("  % Total    % Received"), Some(LineKind::Progress));
        assert_eq!(kind("Dload  Upload   Total"), Some(LineKind::Progress));
        assert_eq!(kind("0024:fixme:ntdll:x"), Some(LineKind::Noise));
        assert_eq!(kind("trace:x:y z"), Some(LineKind::Noise));
        assert_eq!(kind("----------"), Some(LineKind::Noise));
        assert_eq!(kind("---------"), Some(LineKind::Info));
        assert_eq!(
            kind("warning: Note: command x returned status 2. Aborting."),
            Some(LineKind::Error)
        );
        assert_eq!(kind("warning: something"), Some(LineKind::Environment));
        assert_eq!(
            kind("zenity not installed! Winetricks might fail to install"),
            Some(LineKind::Environment)
        );
        assert_eq!(kind("Executing w_do_call x"), Some(LineKind::Info));
    }

    #[test]
    fn an_overlong_line_is_clipped() {
        let long = "x".repeat(2100);
        let line = classify_line(&long).unwrap();
        assert_eq!(line.text.len(), MAX_LINE_CHARS + 3);
        assert!(line.text.ends_with("..."));
    }

    #[test]
    fn the_unsupported_notice_needs_a_version_token() {
        assert_eq!(
            parse_unsupported_wine_version(
                "warning: Your version of wine 7.7 is no longer supported upstream. x"
            )
            .as_deref(),
            Some("7.7")
        );
        assert_eq!(
            parse_unsupported_wine_version("Your version of wine is no longer supported upstream"),
            None
        );
    }

    #[test]
    fn wine_versions_reduce_like_winetricks() {
        assert_eq!(
            parse_wine_version_output("wine-9.0\n").as_deref(),
            Some("9.0")
        );
        assert_eq!(
            parse_wine_version_output("wine-8.0-rc1\n").as_deref(),
            Some("8.0")
        );
        assert_eq!(
            parse_wine_version_output("CrossOver wine-8.0.1\n").as_deref(),
            Some("8.0.1")
        );
        assert_eq!(parse_wine_version_output("garbage\n"), None);
        assert_eq!(parse_wine_version_output(""), None);
    }

    #[test]
    fn the_threshold_is_numeric_not_textual() {
        assert!(is_unsupported_wine_version("7.7"));
        assert!(is_unsupported_wine_version("7.99"));
        assert!(!is_unsupported_wine_version("7.100"));
        assert!(!is_unsupported_wine_version("10.0"));
        assert!(!is_unsupported_wine_version("8.0"));
        assert!(is_unsupported_wine_version("7.99.0"));
        assert!(!is_unsupported_wine_version("7.99.1"));
    }

    #[test]
    fn a_progress_line_replaces_the_previous_one_across_noise_only() {
        let mut buffer = Vec::new();
        let progress = |text: &str, percent: Option<u32>| LogLine {
            kind: LineKind::Progress,
            text: text.to_string(),
            percent,
        };
        append_log_line(&mut buffer, progress("a", Some(10)), 200);
        append_log_line(&mut buffer, LogLine::new(LineKind::Noise, "n"), 200);
        append_log_line(&mut buffer, progress("header", None), 200);
        assert_eq!(buffer.len(), 2);
        assert_eq!(buffer[0], progress("header", Some(10)));
        append_log_line(&mut buffer, LogLine::new(LineKind::Info, "i"), 200);
        append_log_line(&mut buffer, progress("b", Some(20)), 200);
        assert_eq!(buffer.len(), 4);
        // The cap drops the oldest.
        append_log_line(&mut buffer, LogLine::new(LineKind::Info, "j"), 3);
        assert_eq!(buffer.len(), 3);
        assert_eq!(buffer[0].text, "i");
    }

    #[test]
    fn a_chunk_splits_on_every_line_ending_and_keeps_the_tail() {
        let split = split_output_chunk("par", "t one\r\nnext\r 20 x\r\n\n  \npart");
        assert_eq!(split.lines, ["part one", "next", " 20 x"]);
        assert_eq!(split.remainder, "part");
        let empty = split_output_chunk("keep", "");
        assert!(empty.lines.is_empty());
        assert_eq!(empty.remainder, "keep");
        let long = "y".repeat(MAX_REMAINDER_CHARS * 2 + 5);
        let cut = split_output_chunk("", &long);
        assert_eq!(cut.lines.len(), 2);
        assert_eq!(cut.remainder.len(), 5);
    }
    /// 87-64 (D-06 gate fix): exactly the one form of 87-59 is a failed registry import; its neighbours
    /// are not, and none of wine's `err:` noise is.
    #[test]
    fn only_the_regedit_file_not_found_form_is_a_failed_import() {
        let line =
            r"regedit: The file 'C:\windows\Temp\_fontsmooth=bgr\fontsmooth.reg' was not found";
        assert!(is_missing_regedit_file(line));
        assert!(is_missing_regedit_file(&format!("  {line}  ")));
        assert_eq!(classify_line(line).unwrap().kind, LineKind::Error);
        for not in [
            "",
            "regedit: The file '' was not found",
            "regedit: The file 'a.reg' was found",
            "regedit: Unable to open the file 'a.reg'",
            "xregedit: The file 'a.reg' was not found",
            "The file 'a.reg' was not found",
            "err:reg:foo: The file 'a.reg' was not found",
            "0024:err:ole:CoGetClassObject class not registered",
            "Executing regedit /S a.reg",
        ] {
            assert!(!is_missing_regedit_file(not), "{not:?}");
        }
    }
}
