//! `getRunnerCallWithoutCredentials` and `quoteIfNecessary`: the only form of a runner's command line
//! that is ever written to a log (88.2-07, D-02, T-88.2-10). An exact port of `commandRunner.ts`.
//!
//! The eight flags are matched by exact array element, never by prefix, so `--code` can never swallow
//! `--code-verifier` or the other way round. On the PowerShell branch the arguments are not array
//! members but one string (the member after `-ArgumentList`), each wrapped as `"`"value`""`, so that
//! branch redacts with a pattern over the wrapped shape. 88.2-08 replays every `golden/redaction`
//! vector against this module; the runner goldens replay it through every call here.

use std::collections::BTreeMap;

/// The runner flags whose value is a credential, in the order the TS loop visits them.
pub const SENSITIVE_FLAGS: [&str; 8] = [
    "--code",
    "--token",
    "--code-verifier",
    "--password",
    "--serial",
    "--client-id",
    "--access-token",
    "--refresh-token",
];

/// The text every credential is replaced with.
pub const REDACTED: &str = "<redacted>";

/// `quoteIfNecessary`: wraps a string that holds a space in double quotes, unless it already starts
/// and ends with one.
pub fn quote_if_necessary(text: &str) -> String {
    let already_quoted = text.starts_with('"') && text.ends_with('"');
    if !already_quoted && text.contains(' ') {
        format!("\"{text}\"")
    } else {
        text.to_string()
    }
}

/// What `.` does not match in a JavaScript regular expression.
fn is_line_terminator(c: char) -> bool {
    matches!(c, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

/// The PowerShell branch of one flag: replaces the value of the first
/// `` `"<flag>`"","`"(.*?)`"" `` match in the `-ArgumentList` string with `<redacted>`, as the TS
/// `String.replace` with a non-global regular expression does. `(.*?)` is lazy (the first closing
/// `` `"" `` wins) and does not cross a line terminator; a start that cannot complete is passed over
/// and the next occurrence of the opening text is tried.
fn redact_wrapped(argument_list: &str, flag: &str) -> String {
    let open = format!("`\"{flag}`\"\",\"`\"");
    let close = "`\"\"";
    let mut from = 0;
    while let Some(found) = argument_list[from..].find(&open) {
        let start = from + found;
        let value_start = start + open.len();
        let rest = &argument_list[value_start..];
        // The first line terminator or closing text, whichever comes first.
        let stop = rest
            .char_indices()
            .find(|(i, c)| is_line_terminator(*c) || rest[*i..].starts_with(close));
        if let Some((i, _)) = stop {
            if rest[i..].starts_with(close) {
                let value_end = value_start + i;
                return format!(
                    "{}{}{}",
                    &argument_list[..value_start],
                    REDACTED,
                    &argument_list[value_end..]
                );
            }
        }
        // `start` is a char boundary; move one character on.
        from = start
            + argument_list[start..]
                .chars()
                .next()
                .map_or(1, char::len_utf8);
    }
    argument_list.to_string()
}

/// `getRunnerCallWithoutCredentials`.
///
/// - `command`: the runner's argv (an array, never the legendary command object: the adapter
///   converts it first).
/// - `env`: the variables the caller added, in the caller's own order.
/// - `own_env`: GameLib's own environment; a variable the caller set to the very value GameLib already
///   has is not listed.
/// - `runner_path`: the runner executable as it appears on the line (`powershell` selects the
///   PowerShell branch).
pub fn get_runner_call_without_credentials(
    command: &[String],
    env: &[(String, String)],
    own_env: &BTreeMap<String, String>,
    runner_path: &str,
) -> String {
    let mut modified: Vec<String> = command.to_vec();
    for flag in SENSITIVE_FLAGS {
        if runner_path == "powershell" {
            // `indexOf('-ArgumentList') + 1` is 0 when absent; a missing member is skipped.
            let Some(position) = modified.iter().position(|part| part == "-ArgumentList") else {
                continue;
            };
            let Some(argument_list) = modified.get(position + 1) else {
                continue;
            };
            modified[position + 1] = redact_wrapped(argument_list, flag);
        } else {
            let Some(position) = modified.iter().position(|part| part == flag) else {
                continue;
            };
            // JavaScript assigns past the end by growing the array.
            if position + 1 < modified.len() {
                modified[position + 1] = REDACTED.to_string();
            } else {
                modified.push(REDACTED.to_string());
            }
        }
    }

    let mut words: Vec<String> = Vec::new();
    for (key, value) in env {
        if own_env.get(key) == Some(value) {
            continue;
        }
        words.push(format!("{key}={}", quote_if_necessary(value)));
    }
    words.push(quote_if_necessary(runner_path));
    words.extend(modified.iter().map(|part| quote_if_necessary(part)));
    words.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn argv(parts: &[&str]) -> Vec<String> {
        parts.iter().map(|p| (*p).to_string()).collect()
    }

    fn line(parts: &[&str], runner: &str) -> String {
        get_runner_call_without_credentials(&argv(parts), &[], &BTreeMap::new(), runner)
    }

    #[test]
    fn quoting_wraps_a_space_and_leaves_a_quoted_string() {
        assert_eq!(quote_if_necessary("a b"), "\"a b\"");
        assert_eq!(quote_if_necessary("\"a b\""), "\"a b\"");
        assert_eq!(quote_if_necessary("ab"), "ab");
        assert_eq!(quote_if_necessary("\"a b"), "\"\"a b\"");
    }

    #[test]
    fn each_flag_redacts_the_next_element_only() {
        for flag in SENSITIVE_FLAGS {
            assert_eq!(
                line(&["auth", flag, "secret", "--keep", "v"], "runner"),
                format!("runner auth {flag} <redacted> --keep v")
            );
        }
    }

    #[test]
    fn a_flag_is_matched_exactly_so_code_never_swallows_code_verifier() {
        assert_eq!(
            line(&["--code-verifier", "v1", "--code", "c1"], "r"),
            "r --code-verifier <redacted> --code <redacted>"
        );
        assert_eq!(
            line(&["--code-verifier", "v1"], "r"),
            "r --code-verifier <redacted>"
        );
    }

    #[test]
    fn a_trailing_flag_grows_the_line_as_the_ts_array_assignment_does() {
        assert_eq!(
            line(&["login", "--token"], "r"),
            "r login --token <redacted>"
        );
    }

    #[test]
    fn the_powershell_branch_redacts_inside_the_argument_list() {
        let list = "\"`\"--code`\"\",\"`\"abc def`\"\",\"`\"--keep`\"\"";
        let got = line(&["-NoProfile", "-ArgumentList", list], "powershell");
        assert!(got.contains("<redacted>"), "{got}");
        assert!(!got.contains("abc"), "{got}");
        assert!(got.contains("--keep"), "{got}");
    }

    #[test]
    fn the_powershell_pattern_does_not_cross_a_line_terminator() {
        let list = "`\"--code`\"\",\"`\"abc\ndef`\"\"";
        let got = redact_wrapped(list, "--code");
        assert_eq!(got, list, "the lazy match cannot span a newline");
    }

    #[test]
    fn the_powershell_pattern_tries_the_next_opening_when_the_first_cannot_complete() {
        let first = "`\"--code`\"\",\"`\"a\nb";
        let second = "`\"--code`\"\",\"`\"s3cret`\"\"";
        let got = redact_wrapped(&format!("{first} {second}"), "--code");
        assert!(got.contains("<redacted>"), "{got}");
        assert!(!got.contains("s3cret"), "{got}");
    }

    #[test]
    fn the_powershell_branch_skips_a_missing_argument_list() {
        assert_eq!(
            line(&["-NoProfile", "--code", "x"], "powershell"),
            "powershell -NoProfile --code x"
        );
    }

    #[test]
    fn an_env_value_equal_to_the_own_env_is_not_listed() {
        let own: BTreeMap<String, String> = [("KEEP".to_string(), "same".to_string())]
            .into_iter()
            .collect();
        let env = vec![
            ("KEEP".to_string(), "same".to_string()),
            ("OPT".to_string(), "a b".to_string()),
            ("KEEP2".to_string(), "x".to_string()),
        ];
        assert_eq!(
            get_runner_call_without_credentials(&argv(&["list"]), &env, &own, "/bin/r"),
            "OPT=\"a b\" KEEP2=x /bin/r list"
        );
    }
}
