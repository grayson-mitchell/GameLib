//! The named auth log sanitizers (88.2-08, D-02): the gog and nile `authLogSanitizer` functions, which
//! the TS handed to `callRunner` as `logSanitizer` and which run on each chunk written to a log target
//! (never on the stream a caller watches, never on the result window).
//!
//! Each reproduces `JSON.parse(line)`, an assignment of `<redacted>` to four top-level keys, and
//! `JSON.stringify(output) + '\n'`, and answers the line itself when it does not parse. The recorded
//! behaviour (`golden/redaction`, 34 vectors) is kept as it is, including what looks wrong (nested
//! tokens are left, absent keys are added): D-20, filed as a todo, never fixed in a port.
//!
//! The parse and the stringify are written here rather than taken from `serde_json`, because the output
//! has to be what JavaScript prints: keys in the order the engine keeps them (integer-like keys first,
//! ascending, then insertion order, a repeated key keeping its first place and its last value), numbers
//! as `Number#toString` prints them (`12345678901234567890` is `12345678901234567000`, `1.0` is `1`,
//! `-0` is `0`), and strings as `JSON.stringify` writes them. `serde_json`'s order-preserving feature
//! stays off in every manifest (feature unification would change map order in every crate), so its maps
//! could not keep the parsed order anyway.

use serde::Deserialize;

/// The text a token is replaced with.
const REDACTED: &str = "<redacted>";

/// Deeper than this is not parsed and the line comes back as it is. Rust recurses here; a runner line
/// that nests objects 512 deep is not a token reply, and handing it back unchanged leaks nothing a
/// four-key reply would carry.
const MAX_DEPTH: usize = 512;

/// A sanitizer a call names. `camelCase` on the wire (`"gogAuth"`, `"nileAuth"`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LogSanitizer {
    /// gog's `authLogSanitizer` (`gog/user.ts`).
    GogAuth,
    /// nile's `authLogSanitizer` (`nile/user.ts`).
    NileAuth,
}

impl LogSanitizer {
    /// The top-level keys this sanitizer overwrites, in the order its TS function assigns them.
    pub fn keys(self) -> [&'static str; 4] {
        match self {
            LogSanitizer::GogAuth => ["access_token", "session_id", "refresh_token", "user_id"],
            LogSanitizer::NileAuth => ["url", "code_verifier", "serial", "client_id"],
        }
    }

    /// The text to write for one chunk `line`: its keys overwritten and the object printed on one line
    /// with a trailing newline, or `line` itself when it is not one JSON value (the TS `catch`).
    ///
    /// A top-level value that is not an object or an array (a number, a string, `true`, `null`) is
    /// answered as it came: the TS assigns a property to it, which throws in strict mode (a module's
    /// mode) and is caught.
    pub fn apply(&self, line: &str) -> String {
        let Some(mut value) = parse(line) else {
            return line.to_string();
        };
        match &mut value {
            Json::Obj(members) => {
                for key in self.keys() {
                    set(members, utf16(key), Json::Str(utf16(REDACTED)));
                }
            }
            // The TS assigns named properties onto the array, which `JSON.stringify` leaves out.
            Json::Arr(_) => {}
            _ => return line.to_string(),
        }
        let mut out = String::with_capacity(line.len() + 64);
        stringify(&value, &mut out);
        out.push('\n');
        out
    }
}

// ---------------------------------------------------------------------------------------------
// The value model
// ---------------------------------------------------------------------------------------------

/// A parsed JSON value. A string is a sequence of UTF-16 code units, as in JavaScript, so a lone
/// surrogate (`"\ud800"` parses) survives to the output.
#[derive(Debug, Clone, PartialEq)]
enum Json {
    Null,
    Bool(bool),
    Num(f64),
    Str(Vec<u16>),
    Arr(Vec<Json>),
    Obj(Vec<(Vec<u16>, Json)>),
}

fn utf16(text: &str) -> Vec<u16> {
    text.encode_utf16().collect()
}

/// An assignment to an own property: the value of a key that is there changes in place, a key that is
/// not there goes last.
fn set(members: &mut Vec<(Vec<u16>, Json)>, key: Vec<u16>, value: Json) {
    match members.iter_mut().find(|(existing, _)| *existing == key) {
        Some(slot) => slot.1 = value,
        None => members.push((key, value)),
    }
}

/// The value of an array index key (`"0"`, `"17"`; not `"01"`, not `"-1"`, at most 2^32 - 2), which
/// JavaScript lists before every other key, ascending.
fn array_index(key: &[u16]) -> Option<u32> {
    if key.is_empty() || key.len() > 10 || (key.len() > 1 && key[0] == u16::from(b'0')) {
        return None;
    }
    let mut value: u64 = 0;
    for unit in key {
        let digit = unit.checked_sub(u16::from(b'0')).filter(|d| *d <= 9)?;
        value = value * 10 + u64::from(digit);
    }
    u32::try_from(value).ok().filter(|v| *v != u32::MAX)
}

/// An object's own keys in the order `JSON.stringify` visits them.
fn js_key_order(members: Vec<(Vec<u16>, Json)>) -> Vec<(Vec<u16>, Json)> {
    let (mut indexed, others): (Vec<_>, Vec<_>) = members
        .into_iter()
        .partition(|(key, _)| array_index(key).is_some());
    indexed.sort_by_key(|(key, _)| array_index(key));
    indexed.extend(others);
    indexed
}

// ---------------------------------------------------------------------------------------------
// JSON.parse
// ---------------------------------------------------------------------------------------------

struct Parser<'a> {
    chars: &'a [char],
    at: usize,
}

/// `JSON.parse`: one value with only JSON whitespace around it, or `None` where JavaScript throws.
fn parse(text: &str) -> Option<Json> {
    let chars: Vec<char> = text.chars().collect();
    let mut parser = Parser {
        chars: &chars,
        at: 0,
    };
    let value = parser.value(0)?;
    parser.skip_whitespace();
    (parser.at == chars.len()).then_some(value)
}

impl Parser<'_> {
    fn peek(&self) -> Option<char> {
        self.chars.get(self.at).copied()
    }

    fn skip_whitespace(&mut self) {
        while matches!(self.peek(), Some(' ' | '\t' | '\n' | '\r')) {
            self.at += 1;
        }
    }

    fn eat(&mut self, expected: char) -> Option<()> {
        (self.peek() == Some(expected)).then(|| self.at += 1)
    }

    fn literal(&mut self, word: &str, value: Json) -> Option<Json> {
        for expected in word.chars() {
            self.eat(expected)?;
        }
        Some(value)
    }

    fn value(&mut self, depth: usize) -> Option<Json> {
        self.skip_whitespace();
        match self.peek()? {
            '{' => self.object(depth),
            '[' => self.array(depth),
            '"' => self.string().map(Json::Str),
            't' => self.literal("true", Json::Bool(true)),
            'f' => self.literal("false", Json::Bool(false)),
            'n' => self.literal("null", Json::Null),
            '-' | '0'..='9' => self.number(),
            _ => None,
        }
    }

    fn object(&mut self, depth: usize) -> Option<Json> {
        if depth >= MAX_DEPTH {
            return None;
        }
        self.eat('{')?;
        let mut members: Vec<(Vec<u16>, Json)> = Vec::new();
        self.skip_whitespace();
        if self.eat('}').is_some() {
            return Some(Json::Obj(members));
        }
        loop {
            self.skip_whitespace();
            let key = self.string()?;
            self.skip_whitespace();
            self.eat(':')?;
            let value = self.value(depth + 1)?;
            // A repeated key keeps its first place and takes its last value.
            set(&mut members, key, value);
            self.skip_whitespace();
            match self.peek()? {
                ',' => self.at += 1,
                '}' => {
                    self.at += 1;
                    return Some(Json::Obj(js_key_order(members)));
                }
                _ => return None,
            }
        }
    }

    fn array(&mut self, depth: usize) -> Option<Json> {
        if depth >= MAX_DEPTH {
            return None;
        }
        self.eat('[')?;
        let mut items = Vec::new();
        self.skip_whitespace();
        if self.eat(']').is_some() {
            return Some(Json::Arr(items));
        }
        loop {
            items.push(self.value(depth + 1)?);
            self.skip_whitespace();
            match self.peek()? {
                ',' => self.at += 1,
                ']' => {
                    self.at += 1;
                    return Some(Json::Arr(items));
                }
                _ => return None,
            }
        }
    }

    fn string(&mut self) -> Option<Vec<u16>> {
        self.eat('"')?;
        let mut out: Vec<u16> = Vec::new();
        loop {
            let c = self.peek()?;
            self.at += 1;
            match c {
                '"' => return Some(out),
                // A raw control character is not allowed inside a JSON string.
                c if (c as u32) < 0x20 => return None,
                '\\' => {
                    let escaped = self.peek()?;
                    self.at += 1;
                    let unit = match escaped {
                        '"' => u16::from(b'"'),
                        '\\' => u16::from(b'\\'),
                        '/' => u16::from(b'/'),
                        'b' => 0x08,
                        'f' => 0x0c,
                        'n' => 0x0a,
                        'r' => 0x0d,
                        't' => 0x09,
                        'u' => {
                            let mut unit: u16 = 0;
                            for _ in 0..4 {
                                let digit = self.peek()?.to_digit(16)?;
                                self.at += 1;
                                unit = unit * 16 + u16::try_from(digit).ok()?;
                            }
                            unit
                        }
                        _ => return None,
                    };
                    out.push(unit);
                }
                other => {
                    let mut buffer = [0u16; 2];
                    out.extend_from_slice(other.encode_utf16(&mut buffer));
                }
            }
        }
    }

    fn digits(&mut self) -> Option<()> {
        let from = self.at;
        while matches!(self.peek(), Some('0'..='9')) {
            self.at += 1;
        }
        (self.at > from).then_some(())
    }

    /// `-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?`, read as the nearest double.
    fn number(&mut self) -> Option<Json> {
        let from = self.at;
        self.eat('-');
        if self.eat('0').is_none() {
            // `[1-9][0-9]*`: a leading zero is its own whole integer part.
            if !matches!(self.peek(), Some('1'..='9')) {
                return None;
            }
            self.digits()?;
        }
        if self.eat('.').is_some() {
            self.digits()?;
        }
        if matches!(self.peek(), Some('e' | 'E')) {
            self.at += 1;
            if matches!(self.peek(), Some('+' | '-')) {
                self.at += 1;
            }
            self.digits()?;
        }
        let text: String = self.chars[from..self.at].iter().collect();
        text.parse::<f64>().ok().map(Json::Num)
    }
}

// ---------------------------------------------------------------------------------------------
// JSON.stringify
// ---------------------------------------------------------------------------------------------

/// `Number#toString` for a finite number: the shortest digits that read back as the same double, laid out
/// as ECMAScript's `Number::toString` does (positional up to 21 digits, exponent form beyond, and below
/// 1e-6).
fn js_number(value: f64) -> String {
    if value == 0.0 {
        // Both zeros print as `0`.
        return "0".to_string();
    }
    let magnitude = format!("{:e}", value.abs());
    let (mantissa, exponent) = magnitude.split_once('e').unwrap_or((&magnitude, "0"));
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let exponent: i32 = exponent.parse().unwrap_or(0);
    // `k` digits, and the decimal point sits after the first `n` of them.
    let k = i32::try_from(digits.len()).unwrap_or(i32::MAX);
    let n = exponent + 1;
    let sign = if value < 0.0 { "-" } else { "" };
    let body = if k <= n && n <= 21 {
        format!(
            "{digits}{}",
            "0".repeat(usize::try_from(n - k).unwrap_or(0))
        )
    } else if 0 < n && n <= 21 {
        let split = usize::try_from(n).unwrap_or(0);
        format!("{}.{}", &digits[..split], &digits[split..])
    } else if -6 < n && n <= 0 {
        format!("0.{}{digits}", "0".repeat(usize::try_from(-n).unwrap_or(0)))
    } else {
        let shown = n - 1;
        let sign_of_exponent = if shown < 0 { '-' } else { '+' };
        if k == 1 {
            format!("{digits}e{sign_of_exponent}{}", shown.abs())
        } else {
            format!(
                "{}.{}e{sign_of_exponent}{}",
                &digits[..1],
                &digits[1..],
                shown.abs()
            )
        }
    };
    format!("{sign}{body}")
}

/// `JSON.stringify`'s quoting of a string: the two quote characters, the five short escapes, every other
/// control character as `\u00xx`, and a lone surrogate as `\udxxx` (lowercase hex); the rest as it is.
fn quote(units: &[u16], out: &mut String) {
    out.push('"');
    for decoded in char::decode_utf16(units.iter().copied()) {
        match decoded {
            Ok('"') => out.push_str("\\\""),
            Ok('\\') => out.push_str("\\\\"),
            Ok('\u{8}') => out.push_str("\\b"),
            Ok('\u{c}') => out.push_str("\\f"),
            Ok('\n') => out.push_str("\\n"),
            Ok('\r') => out.push_str("\\r"),
            Ok('\t') => out.push_str("\\t"),
            Ok(c) if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            Ok(c) => out.push(c),
            Err(lone) => out.push_str(&format!("\\u{:04x}", lone.unpaired_surrogate())),
        }
    }
    out.push('"');
}

fn stringify(value: &Json, out: &mut String) {
    match value {
        Json::Null => out.push_str("null"),
        Json::Bool(true) => out.push_str("true"),
        Json::Bool(false) => out.push_str("false"),
        // `Infinity` (a literal too large for a double) stringifies as `null`.
        Json::Num(number) if !number.is_finite() => out.push_str("null"),
        Json::Num(number) => out.push_str(&js_number(*number)),
        Json::Str(units) => quote(units, out),
        Json::Arr(items) => {
            out.push('[');
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                stringify(item, out);
            }
            out.push(']');
        }
        Json::Obj(members) => {
            out.push('{');
            for (index, (key, member)) in members.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                quote(key, out);
                out.push(':');
                stringify(member, out);
            }
            out.push('}');
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_gog_line_loses_its_four_tokens_and_keeps_the_rest_in_order() {
        let line = r#"{"zebra":1,"refresh_token":"t","apple":2,"access_token":"a","mid":3}"#;
        assert_eq!(
            LogSanitizer::GogAuth.apply(line),
            "{\"zebra\":1,\"refresh_token\":\"<redacted>\",\"apple\":2,\"access_token\":\"<redacted>\",\"mid\":3,\"session_id\":\"<redacted>\",\"user_id\":\"<redacted>\"}\n"
        );
    }

    #[test]
    fn a_nile_line_is_redacted_on_nile_keys_only() {
        let line = r#"{"access_token":"kept","url":"u"}"#;
        assert_eq!(
            LogSanitizer::NileAuth.apply(line),
            "{\"access_token\":\"kept\",\"url\":\"<redacted>\",\"code_verifier\":\"<redacted>\",\"serial\":\"<redacted>\",\"client_id\":\"<redacted>\"}\n"
        );
    }

    #[test]
    fn a_line_that_does_not_parse_comes_back_as_it_was() {
        for line in [
            "",
            "   ",
            "Traceback: not json at all",
            "{\"access_token\":\"a-synt",
            "{\"a\":1}\n{\"b\":2}\n",
            "{\"a\":1,}",
            "{'a':1}",
            "{\"a\":01}",
            "{\"a\":\"\u{1}\"}",
            "\u{feff}{}",
        ] {
            assert_eq!(LogSanitizer::GogAuth.apply(line), line, "{line:?}");
        }
    }

    #[test]
    fn a_top_level_primitive_comes_back_as_it_was_and_an_array_is_printed_alone() {
        for line in ["123", "\"text\"", "true", "null"] {
            assert_eq!(LogSanitizer::GogAuth.apply(line), line);
        }
        assert_eq!(
            LogSanitizer::NileAuth.apply("[1, 2, {\"a\": 3}]"),
            "[1,2,{\"a\":3}]\n"
        );
    }

    #[test]
    fn a_repeated_key_keeps_its_first_place_and_its_last_value() {
        assert_eq!(
            LogSanitizer::GogAuth.apply(r#"{"x":1,"y":2,"x":3}"#),
            "{\"x\":3,\"y\":2,\"access_token\":\"<redacted>\",\"session_id\":\"<redacted>\",\"refresh_token\":\"<redacted>\",\"user_id\":\"<redacted>\"}\n"
        );
    }

    #[test]
    fn integer_like_keys_come_first_in_ascending_order() {
        assert_eq!(
            LogSanitizer::GogAuth.apply(r#"{"b":1,"10":2,"2":3,"01":4,"a":5}"#),
            "{\"2\":3,\"10\":2,\"b\":1,\"01\":4,\"a\":5,\"access_token\":\"<redacted>\",\"session_id\":\"<redacted>\",\"refresh_token\":\"<redacted>\",\"user_id\":\"<redacted>\"}\n"
        );
    }

    #[test]
    fn numbers_print_as_number_to_string_does() {
        for (written, printed) in [
            ("12345678901234567890", "12345678901234567000"),
            ("1.0", "1"),
            ("1e3", "1000"),
            ("-0", "0"),
            ("0.000001", "0.000001"),
            ("0.0000001", "1e-7"),
            ("1e21", "1e+21"),
            ("123456789012345678901", "123456789012345680000"),
            ("1e300", "1e+300"),
            ("1.5e-10", "1.5e-10"),
            ("-12.5", "-12.5"),
            ("0.1", "0.1"),
            ("100", "100"),
            ("5e-324", "5e-324"),
            ("1e999", "null"),
        ] {
            let got = LogSanitizer::GogAuth.apply(&format!("{{\"n\":{written}}}"));
            let want_prefix = format!("{{\"n\":{printed},");
            assert!(got.starts_with(&want_prefix), "{written}: {got}");
        }
    }

    #[test]
    fn strings_are_decoded_and_written_as_json_stringify_writes_them() {
        // `\u0061` is `a`; `\ud83d\ude00` is one character; `\/` is `/`.
        let got = LogSanitizer::GogAuth
            .apply(r#"{"s":"\u0061 \u00e9 \ud83d\ude00 a\/b \u0001 \t \"q\" \\ \u007f"}"#);
        assert!(
            got.starts_with("{\"s\":\"a \u{e9} \u{1f600} a/b \\u0001 \\t \\\"q\\\" \\\\ \u{7f}\","),
            "{got}"
        );
    }

    #[test]
    fn a_lone_surrogate_is_written_as_an_escape() {
        let got = LogSanitizer::GogAuth.apply(r#"{"s":"\ud800","t":"\ude00x"}"#);
        assert!(
            got.starts_with("{\"s\":\"\\ud800\",\"t\":\"\\ude00x\","),
            "{got}"
        );
    }

    #[test]
    fn a_nested_token_is_left_and_whitespace_around_the_value_is_allowed() {
        let got = LogSanitizer::GogAuth.apply(" \n{ \"o\" : { \"access_token\" : \"n\" } }\r\n");
        assert!(
            got.starts_with("{\"o\":{\"access_token\":\"n\"},\"access_token\":\"<redacted>\""),
            "{got}"
        );
    }

    #[test]
    fn nesting_past_the_bound_is_not_parsed_and_the_line_comes_back() {
        let deep = format!("{}{}", "[".repeat(600), "]".repeat(600));
        assert_eq!(LogSanitizer::GogAuth.apply(&deep), deep);
        let fine = format!("{}{}", "[".repeat(100), "]".repeat(100));
        assert_eq!(LogSanitizer::GogAuth.apply(&fine), format!("{fine}\n"));
    }

    #[test]
    fn a_sanitizer_is_named_in_camel_case_on_the_wire() {
        let named: LogSanitizer = serde_json::from_str("\"gogAuth\"").expect("gogAuth");
        assert_eq!(named, LogSanitizer::GogAuth);
        let named: LogSanitizer = serde_json::from_str("\"nileAuth\"").expect("nileAuth");
        assert_eq!(named, LogSanitizer::NileAuth);
        assert!(serde_json::from_str::<LogSanitizer>("\"mask-secret\"").is_err());
    }
}
