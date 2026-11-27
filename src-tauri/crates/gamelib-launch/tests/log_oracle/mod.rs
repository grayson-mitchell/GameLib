//! The test-side oracle for the general-log form (quick 261127-u6h, 88.2 prohibition 1). The TS recorded
//! `gamelib.log` lines with the runner path, every argument path and the env values in them; Rust now
//! reduces them (runner and deep absolute arguments to a file name, env to names only). The TS recorders
//! were deleted in 88.2-24, so the recorded `events.json` lines stay as the TS wrote them, and the replays
//! derive the expected line here, from the recorded text, with rules written out independently of the
//! production reduction: this module calls no `gamelib_launch` function, so a replay compares two
//! derivations of the same rule rather than one against itself.
//!
//! A recorded path is the rig's text for a path: it opens with `/` or with a placeholder `<NAME>/`
//! (`<TOOLS>`, `<HOME>`, ...). Only two or more segments are reduced; `/S` and `/games` stay as written.
#![allow(dead_code)]

fn is_separator(c: char) -> bool {
    c == '/' || c == '\\'
}

fn segments(token: &str) -> usize {
    token.split(is_separator).filter(|s| !s.is_empty()).count()
}

fn last_segment(token: &str) -> &str {
    token
        .rsplit(is_separator)
        .find(|s| !s.is_empty())
        .unwrap_or(token)
}

/// The length of a `<NAME>` placeholder (ASCII uppercase letters) at the start of `text`, if one is there.
fn placeholder_len(text: &str) -> Option<usize> {
    let rest = text.strip_prefix('<')?;
    let letters = rest.chars().take_while(|c| c.is_ascii_uppercase()).count();
    if letters > 0 && rest[letters..].starts_with('>') {
        Some(letters + 2)
    } else {
        None
    }
}

/// Every recorded absolute path of two or more segments in `text`, replaced by its last segment. A path
/// begins at the start of the text or right after a space, `"` or `=`, opens with `/` or `<NAME>/`, and
/// runs to the next space, backtick, `"` or the end.
pub fn reduce_recorded_paths(text: &str) -> String {
    let mut out = String::new();
    let mut i = 0;
    let mut prev: Option<char> = None;
    while i < text.len() {
        let rest = &text[i..];
        let boundary = prev.map_or(true, |c| c == ' ' || c == '"' || c == '=');
        let opens = rest.starts_with('/')
            || placeholder_len(rest).is_some_and(|n| rest[n..].starts_with('/'));
        if boundary && opens {
            let end = rest.find([' ', '`', '"']).unwrap_or(rest.len());
            let token = &rest[..end];
            let count = match placeholder_len(token) {
                Some(n) => 1 + segments(&token[n..]),
                None => segments(token),
            };
            if count >= 2 {
                out.push_str(last_segment(token));
            } else {
                out.push_str(token);
            }
            prev = token.chars().last();
            i += end;
            continue;
        }
        let c = rest.chars().next().expect("not at the end");
        out.push(c);
        prev = Some(c);
        i += c.len_utf8();
    }
    out
}

/// The recorded command with its leading env words (`NAME=value`) taken off and their names appended as
/// ` (env: A, B)`, and every deep path in the rest reduced.
pub fn reduce_recorded_command(cmd: &str) -> String {
    let mut names: Vec<String> = Vec::new();
    let mut rest = cmd;
    loop {
        let name_len = rest
            .char_indices()
            .take_while(|(i, c)| {
                c.is_ascii_alphabetic() || *c == '_' || (*i > 0 && c.is_ascii_digit())
            })
            .count();
        if name_len == 0 || !rest[name_len..].starts_with('=') {
            break;
        }
        let value = &rest[name_len + 1..];
        let value_len = if value.starts_with('"') {
            // Ends at the first later `"` that is followed by a space or the end.
            let mut end = None;
            for (j, c) in value.char_indices().skip(1) {
                if c == '"' && (value[j + 1..].is_empty() || value[j + 1..].starts_with(' ')) {
                    end = Some(j + 1);
                    break;
                }
            }
            end.unwrap_or(value.len())
        } else {
            value.find(' ').unwrap_or(value.len())
        };
        names.push(rest[..name_len].to_string());
        rest = value[value_len..].trim_start_matches(' ');
    }
    let mut out = reduce_recorded_paths(rest);
    if !names.is_empty() {
        out.push_str(&format!(" (env: {})", names.join(", ")));
    }
    out
}

/// Whether `token` is a deep absolute path by the production rule, written out again: `~/`, a drive form,
/// a `\\` start, or a `/` or `\` start with two or more segments.
fn is_deep_path(token: &str) -> bool {
    if token.starts_with("~/") || token.starts_with("~\\") || token.starts_with("\\\\") {
        return true;
    }
    let b = token.as_bytes();
    if b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b[2] == b'/' || b[2] == b'\\')
    {
        return true;
    }
    token.starts_with(is_separator) && segments(token) >= 2
}

/// Whether a general-log line still carries a rig placeholder or a deep absolute path.
pub fn carries_a_path(text: &str) -> bool {
    let mut at = 0;
    while let Some(found) = text[at..].find('<') {
        let start = at + found;
        if placeholder_len(&text[start..]).is_some() {
            return true;
        }
        at = start + 1;
    }
    text.split(|c: char| c.is_whitespace() || matches!(c, '"' | '`' | '=' | ',' | '(' | ')'))
        .any(is_deep_path)
}

#[test]
fn the_oracle_reduces_a_recorded_command() {
    assert_eq!(
        reduce_recorded_command(
            "LANG=en_NZ.UTF-8 <TOOLS>/legendary/legendary launch app-legendary"
        ),
        "legendary launch app-legendary (env: LANG)"
    );
    assert_eq!(
        reduce_recorded_command("gog launch /games/app-gog app-gog --flag"),
        "gog launch app-gog app-gog --flag"
    );
    assert_eq!(
        reduce_recorded_command("gog download app-gog --path /games"),
        "gog download app-gog --path /games"
    );
    assert_eq!(
        reduce_recorded_command("A=\"a b\" B=2 <HOME>/Games/Game/game.exe -flag"),
        "game.exe -flag (env: A, B)"
    );
}

#[test]
fn the_oracle_spots_a_leftover_path() {
    assert!(carries_a_path("run <HOME>/x"));
    assert!(carries_a_path("--path=/Users/x/Games"));
    assert!(!carries_a_path("legendary launch /S (env: LANG)"));
}
