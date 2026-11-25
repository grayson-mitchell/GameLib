//! `setupWrapperEnvVars` and `setupWrappers` (`launcher.ts`), and the `shlex.split` / `shlex.join` of the
//! npm `shlex` 2.1.2 package the managers and the launcher pass wrapper arguments through.
//!
//! Pitfall 12: the Rust `shlex` crate (2.0.1) does not answer what npm shlex answers, so the two helpers
//! here port the npm lexer instead of wrapping the crate. Measured against the recorded vectors of
//! `golden/builders` (see the differential test below), the crate differs on:
//! - `shlex-split-unterminated-single-quote`, `-double-quote` and `-trailing-backslash`: npm throws
//!   `Got EOF while in a quoted string` / `Got EOF while in an escape sequence`; the crate answers `None`
//!   for both and cannot say which;
//! - `shlex-split-hash-is-not-a-comment-here`: the crate starts a comment at `#` (`["a"]`), npm does not
//!   (`["a", "#b", "c"]`);
//! - `shlex-join-embedded-quotes` and `shlex-join-backslash`: the crate quotes with `"` where a string
//!   holds a single quote or a backslash, npm always single-quotes (`'a'"'"'b'`).
//!
//! npm also reads `$'..'` (ANSI C) and `$".."` quotes and drops an escaped newline, which the crate does
//! not. The recorded TS answer wins in every case (D-20): a quirk of npm shlex is kept as recorded.

use std::collections::BTreeMap;

use gamelib_knownfix::types::Runner;
use serde::Deserialize;

/// What `shlex.split` throws, as the message npm shlex gives it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShlexError {
    /// `Got EOF while in a quoted string`.
    QuotedEof,
    /// `Got EOF while in an escape sequence`.
    EscapeEof,
}

impl ShlexError {
    /// The text of the TS `Error` (a fixed literal: no input is echoed).
    pub fn message(self) -> &'static str {
        match self {
            ShlexError::QuotedEof => "Got EOF while in a quoted string",
            ShlexError::EscapeEof => "Got EOF while in an escape sequence",
        }
    }
}

impl std::fmt::Display for ShlexError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.message())
    }
}

impl std::error::Error for ShlexError {}

fn is_whitespace(c: char) -> bool {
    matches!(c, ' ' | '\t' | '\r' | '\n')
}

/// The code unit npm `String.fromCharCode` makes of `value` (only the low 16 bits count). A lone
/// surrogate has no `char`, so it becomes U+FFFD, which is what a lossy conversion of the TS string
/// would hold.
fn from_char_code(value: u32) -> char {
    char::from_u32(value & 0xFFFF).unwrap_or('\u{FFFD}')
}

/// Up to `max` characters of `chars` starting at `at` that satisfy `digit`; their count.
fn take_digits(chars: &[char], at: usize, max: usize, digit: impl Fn(char) -> bool) -> usize {
    chars[at..]
        .iter()
        .take(max)
        .take_while(|c| digit(**c))
        .count()
}

fn parse_radix(chars: &[char], radix: u32) -> u32 {
    let text: String = chars.iter().collect();
    u32::from_str_radix(&text, radix).unwrap_or(0)
}

/// `processEscapes` for an ANSI C (`$'..'`) string: `\a \b \e \E \f \n \r \t \v`, octal, `\x`, `\u`,
/// `\U`, `\cX`, and the literal `\\ \' \" \?`. Any other backslash stays as written.
fn process_ansi_c(token: &str) -> String {
    let chars: Vec<char> = token.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] != '\\' || i + 1 >= chars.len() {
            out.push(chars[i]);
            i += 1;
            continue;
        }
        let c = chars[i + 1];
        // The alternatives of the npm regex, in its order; the first that matches wins.
        let simple = match c {
            '\\' | '\'' | '"' | '?' => Some(c),
            'a' => Some('\x07'),
            'b' => Some('\x08'),
            'e' | 'E' => Some('\x1b'),
            'f' => Some('\x0c'),
            'n' => Some('\n'),
            'r' => Some('\r'),
            't' => Some('\t'),
            'v' => Some('\x0b'),
            _ => None,
        };
        if let Some(simple) = simple {
            out.push(simple);
            i += 2;
            continue;
        }
        let octal = take_digits(&chars, i + 1, 3, |d| ('0'..='7').contains(&d));
        if octal > 0 {
            out.push(from_char_code(parse_radix(&chars[i + 1..i + 1 + octal], 8)));
            i += 1 + octal;
            continue;
        }
        let hex_run = |max: usize| take_digits(&chars, i + 2, max, |d| d.is_ascii_hexdigit());
        let (marker_len, max) = match c {
            'x' => (1, 2),
            'u' => (1, 4),
            'U' => (1, 8),
            _ => (0, 0),
        };
        if marker_len == 1 {
            let n = hex_run(max);
            if n > 0 {
                out.push(from_char_code(parse_radix(&chars[i + 2..i + 2 + n], 16)));
                i += 2 + n;
                continue;
            }
        }
        if c == 'c' {
            if let Some(x) = chars.get(i + 2).copied() {
                if !matches!(x, '\n' | '\r' | '\u{2028}' | '\u{2029}') {
                    out.push(match x {
                        '?' => '\x7f',
                        '@' => '\0',
                        other => char::from_u32(other as u32 & 31).unwrap_or('\0'),
                    });
                    i += 3;
                    continue;
                }
            }
        }
        out.push('\\');
        i += 1;
    }
    out
}

/// `processEscapes` for a double-quoted string: only `\\` and `\"` lose their backslash.
fn process_double_quoted(token: &str) -> String {
    let chars: Vec<char> = token.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '\\' && matches!(chars.get(i + 1), Some('\\' | '"')) {
            out.push(chars[i + 1]);
            i += 2;
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

/// npm `shlex.split`: shell-like words with `'..'`, `".."`, `$'..'`, `$".."` and backslash escapes, no
/// comments and no expansion. An unterminated quote or a trailing backslash is an error.
pub fn split(input: &str) -> Result<Vec<String>, ShlexError> {
    let mut words = Vec::new();
    let mut in_quote: Option<char> = None;
    let mut dollar_quote: Option<char> = None;
    let mut escaped: Option<char> = None;
    let mut last_dollar: i64 = -2;
    let mut token: Option<String> = None;
    let mut chars = input.chars().enumerate();
    loop {
        let Some((pos, c)) = chars.next() else {
            if in_quote.is_some() {
                return Err(ShlexError::QuotedEof);
            }
            if escaped.is_some() {
                return Err(ShlexError::EscapeEof);
            }
            words.extend(token);
            return Ok(words);
        };
        let pos = pos as i64;
        if let Some(backslash) = escaped {
            if c == '\n' {
                // An escaped newline continues the command: ignored.
            } else if in_quote.is_some() {
                // Inside a quote the whole escape sequence is kept and interpreted when the quote closes.
                let t = token.get_or_insert_with(String::new);
                t.push(backslash);
                t.push(c);
            } else {
                token.get_or_insert_with(String::new).push(c);
            }
            escaped = None;
            continue;
        }
        if c == '\\' && (in_quote.is_none() || dollar_quote.is_some() || in_quote == Some('"')) {
            escaped = Some(c);
            continue;
        }
        if let Some(quote) = in_quote {
            if c == quote {
                let raw = token.take().unwrap_or_default();
                token = Some(if dollar_quote == Some('\'') {
                    process_ansi_c(&raw)
                } else if quote == '"' {
                    process_double_quoted(&raw)
                } else {
                    raw
                });
                in_quote = None;
                dollar_quote = None;
            } else {
                token.get_or_insert_with(String::new).push(c);
            }
            continue;
        }
        if c == '\'' || c == '"' {
            in_quote = Some(c);
            if last_dollar == pos - 1 {
                dollar_quote = Some(c);
            }
            let t = token.get_or_insert_with(String::new);
            if dollar_quote.is_some() {
                // Drop the opening `$` captured before.
                t.pop();
            }
            continue;
        }
        if c == '$' {
            last_dollar = pos;
        }
        if is_whitespace(c) {
            words.extend(token.take());
            continue;
        }
        token.get_or_insert_with(String::new).push(c);
    }
}

/// npm `shlex.quote`: a string of only `\w @ % - + = : , . /` stays as it is, the empty string is `''`,
/// anything else is single-quoted with each run of `'` written as `'"'..."'`.
fn quote(word: &str) -> String {
    if word.is_empty() {
        return "''".to_string();
    }
    let safe = |c: char| c.is_ascii_alphanumeric() || "_@%-+=:,./".contains(c);
    if word.chars().all(safe) {
        return word.to_string();
    }
    let mut wrapped = String::from("'");
    let mut chars = word.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\'' {
            let mut run = String::from("'");
            while chars.peek() == Some(&'\'') {
                run.push('\'');
                chars.next();
            }
            wrapped.push_str(&format!("'\"{run}\"'"));
        } else {
            wrapped.push(c);
        }
    }
    wrapped.push('\'');
    // `.replace(/^''|''$/g, '')`: an empty quote pair at either end goes.
    let head = wrapped.strip_prefix("''").unwrap_or(&wrapped);
    head.strip_suffix("''").unwrap_or(head).to_string()
}

/// npm `shlex.join`: each word quoted, joined by a space.
pub fn join<'a>(words: impl IntoIterator<Item = &'a str>) -> String {
    words.into_iter().map(quote).collect::<Vec<_>>().join(" ")
}

/// The per-store GAMEID source env (`wrapperStoreEnv`): steam sets neither.
fn wrapper_store_env(runner: Runner) -> &'static [(&'static str, &'static str)] {
    match runner {
        Runner::Gog => &[("HEROIC_APP_SOURCE", "gog"), ("STORE", "gog")],
        Runner::Legendary => &[("HEROIC_APP_SOURCE", "epic"), ("STORE", "egs")],
        Runner::Nile => &[("HEROIC_APP_SOURCE", "amazon"), ("STORE", "amazon")],
        Runner::Sideload => &[("HEROIC_APP_SOURCE", "sideload")],
        Runner::Steam => &[],
    }
}

/// `setupWrapperEnvVars`: the variables a wrapper (and umu) reads about the game.
pub fn setup_wrapper_env_vars(app_name: &str, runner: Runner) -> BTreeMap<String, String> {
    let mut ret = BTreeMap::new();
    let mut put = |key: &str, value: &str| {
        ret.insert(key.to_string(), value.to_string());
    };
    put("HEROIC_APP_NAME", app_name);
    put("HEROIC_APP_RUNNER", runner.as_str());
    put("GAMEID", "umu-0");
    for (key, value) in wrapper_store_env(runner) {
        put(key, value);
    }
    ret
}

/// One `{ exe, args }` of `GameSettings.wrapperOptions` (`WrapperVariable`). An absent `exe` is the empty
/// string, which `setupWrappers` filters out as the TS does with `undefined`.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WrapperVariable {
    #[serde(default)]
    pub exe: String,
    #[serde(default)]
    pub args: Option<String>,
}

/// `setupWrappers`, in the TS order: the gamescope command first, then each user wrapper (its `exe`, then
/// its `args` split), the MangoHud command only when the gamescope command is present and empty, the
/// GameMode binary last; empty entries dropped. A wrapper whose `args` has an unterminated quote is an
/// error, as the TS throws shlex's own (recorded D-20 quirk, a todo of 88.1-01).
pub fn setup_wrappers(
    wrapper_options: Option<&[WrapperVariable]>,
    mango_hud_command: Option<&[String]>,
    game_mode_bin: Option<&str>,
    game_scope_command: Option<&[String]>,
) -> Result<Vec<String>, ShlexError> {
    let mut wrappers: Vec<String> = Vec::new();
    if let Some(game_scope) = game_scope_command {
        wrappers.extend(game_scope.iter().cloned());
    }
    for entry in wrapper_options.unwrap_or_default() {
        wrappers.push(entry.exe.clone());
        wrappers.extend(split(entry.args.as_deref().unwrap_or(""))?);
    }
    if let (Some(mango), Some([])) = (mango_hud_command, game_scope_command) {
        wrappers.extend(mango.iter().cloned());
    }
    if let Some(game_mode) = game_mode_bin {
        wrappers.push(game_mode.to_string());
    }
    wrappers.retain(|word| !word.is_empty());
    Ok(wrappers)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn words(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn split_reads_quotes_and_escapes_like_npm() {
        assert_eq!(split("a 'b c' d").unwrap(), words(&["a", "b c", "d"]));
        assert_eq!(split("a\\ b c").unwrap(), words(&["a b", "c"]));
        assert_eq!(split("\"a\\\"b\" c").unwrap(), words(&["a\"b", "c"]));
        assert_eq!(split("'a\\b' c").unwrap(), words(&["a\\b", "c"]));
        assert_eq!(split("a #b c").unwrap(), words(&["a", "#b", "c"]));
        assert_eq!(split("a''b").unwrap(), words(&["ab"]));
        assert_eq!(split("a '' b").unwrap(), words(&["a", "", "b"]));
        assert_eq!(split("   \t ").unwrap(), Vec::<String>::new());
    }

    #[test]
    fn split_reads_ansi_c_and_locale_quotes() {
        assert_eq!(split("$'a\\tb' c").unwrap(), words(&["a\tb", "c"]));
        assert_eq!(split("$'\\x41\\101\\u0042'").unwrap(), words(&["AAB"]));
        assert_eq!(split("$'\\q'").unwrap(), words(&["\\q"]));
        assert_eq!(split("$\"a\\\"b\"").unwrap(), words(&["a\"b"]));
        assert_eq!(split("a\\\nb").unwrap(), words(&["ab"]));
    }

    #[test]
    fn split_errors_say_which_of_the_two_things_was_left_open() {
        assert_eq!(split("a 'b c"), Err(ShlexError::QuotedEof));
        assert_eq!(split("a \"b c"), Err(ShlexError::QuotedEof));
        assert_eq!(split("a b\\"), Err(ShlexError::EscapeEof));
        assert_eq!(
            ShlexError::QuotedEof.message(),
            "Got EOF while in a quoted string"
        );
        assert_eq!(
            ShlexError::EscapeEof.message(),
            "Got EOF while in an escape sequence"
        );
    }

    #[test]
    fn join_single_quotes_anything_unsafe() {
        assert_eq!(join(["a", "b c"]), "a 'b c'");
        assert_eq!(join(["a'b"]), "'a'\"'\"'b'");
        assert_eq!(join(["", "x"]), "'' x");
        assert_eq!(join(Vec::<&str>::new()), "");
        assert_eq!(join(["'"]), "\"'\"");
    }

    #[test]
    fn join_then_split_round_trips() {
        let original = ["a b", "c'd", "e\"f", "g\\h", "", "$HOME"];
        let joined = join(original);
        assert_eq!(split(&joined).unwrap(), words(&original));
    }

    /// Where the crate and npm agree the two answers are the same; where they differ is the list in the
    /// module comment, kept here so a crate upgrade that starts agreeing is noticed.
    #[test]
    fn the_crate_agrees_with_the_port_on_plain_input_and_differs_where_documented() {
        for plain in ["a b c", "a 'b c' d", "a \"b c\" d", "a\\ b c", ""] {
            assert_eq!(
                ::shlex::split(plain).unwrap(),
                split(plain).unwrap(),
                "{plain}"
            );
        }
        assert_eq!(::shlex::split("a 'b c"), None);
        assert_eq!(::shlex::split("a #b c").unwrap(), words(&["a"]));
        assert_ne!(
            ::shlex::try_join(["a'b"]).unwrap(),
            join(["a'b"]),
            "the crate quotes a single quote differently"
        );
    }

    #[test]
    fn wrapper_env_vars_name_the_store_and_steam_adds_none() {
        let gog = setup_wrapper_env_vars("g1", Runner::Gog);
        assert_eq!(gog["HEROIC_APP_SOURCE"], "gog");
        assert_eq!(gog["STORE"], "gog");
        assert_eq!(gog["GAMEID"], "umu-0");
        assert_eq!(gog["HEROIC_APP_NAME"], "g1");
        assert_eq!(gog["HEROIC_APP_RUNNER"], "gog");
        let steam = setup_wrapper_env_vars("s1", Runner::Steam);
        assert!(!steam.contains_key("HEROIC_APP_SOURCE"));
        assert!(!steam.contains_key("STORE"));
        assert_eq!(steam.len(), 3);
        assert_eq!(
            setup_wrapper_env_vars("x", Runner::Sideload)["HEROIC_APP_SOURCE"],
            "sideload"
        );
    }

    #[test]
    fn wrappers_keep_the_ts_order_and_drop_empty_entries() {
        let options = [
            WrapperVariable {
                exe: "first".into(),
                args: Some("a b".into()),
            },
            WrapperVariable {
                exe: String::new(),
                args: Some("kept".into()),
            },
        ];
        let got = setup_wrappers(
            Some(&options),
            Some(&words(&["mango"])),
            Some("gm"),
            Some(&words(&["gs", "--"])),
        )
        .unwrap();
        // The MangoHud command only follows an EMPTY gamescope command.
        assert_eq!(got, words(&["gs", "--", "first", "a", "b", "kept", "gm"]));
        let with_empty_scope =
            setup_wrappers(None, Some(&words(&["mango"])), None, Some(&[])).unwrap();
        assert_eq!(with_empty_scope, words(&["mango"]));
        assert_eq!(
            setup_wrappers(None, None, None, None).unwrap(),
            Vec::<String>::new()
        );
    }

    #[test]
    fn a_wrapper_with_an_unterminated_quote_is_the_recorded_error() {
        let options = [WrapperVariable {
            exe: "env".into(),
            args: Some("FOO=\"a b".into()),
        }];
        assert_eq!(
            setup_wrappers(Some(&options), None, None, None),
            Err(ShlexError::QuotedEof)
        );
    }
}
