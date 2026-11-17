//! Phase 81 Open Question 3 and D-14: the evidence readers behind the adoption watch.
//!
//! Every reader here is pure with respect to the watch (it takes a path or a reader and returns a
//! verdict), is size-capped, and answers "no evidence" on any I/O or parse failure. Nothing logs an
//! app name, a path or a SteamID (T-81-18).
//!
//! # The content_log rule (Open Question 3)
//!
//! Steam logs `Loaded N apps from install folder "<steamapps>\appmanifest_*.acf".` to
//! `logs/content_log.txt` each time it (re)scans a library folder. A rescan that finds more apps
//! than the previous one means Steam saw something new: a line for the record's own steamapps
//! folder, appearing past the byte offset captured when the watch was registered, with N greater
//! than the last count logged for that folder before the offset, is adoption evidence. With no
//! prior count for the folder the rule stays off: there is nothing to compare against.
//!
//! The folder text differs per OS (macOS mixes `/` with a trailing `\appmanifest_*.acf`, Windows
//! is all backslashes), so both sides are reduced to [`folder_key`] before they are compared.
//!
//! # Linux and Windows readings (spikes 087 and 088)
//!
//! Linux: Steam lists an adopted app in the `apps` map of `steamapps/libraryfolders.vdf`, and never
//! rewrites the ACF (spike 088), so [`library_folders_list_app`] is its evidence. Signed-in is the
//! last `Logged On` / `Logged Off` state line of `logs/connection_log.txt`
//! ([`connection_log_signed_in`]). Windows: signed-in is `HKCU\Software\Valve\Steam\ActiveProcess`
//! `ActiveUser` ([`windows_signed_in`]); 0 means signed out. A Steam pid change, including Steam not
//! running, is never evidence on either OS: a sign-out restarts Steam without adopting anything.

use crate::constants::{ADOPTION_CONNECTION_LOG_TAIL_BYTES, ADOPTION_LOG_TAIL_BYTES};
use gamelib_steamfiles::readers::RegistryDword;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// Reduces a library folder, or a manifest path inside it, to a comparison key: backslashes become
/// `/`, a final `appmanifest_*` component (the glob in the log line, or the manifest file itself)
/// is dropped, trailing `/` is trimmed and the result is ASCII-lowercased.
pub fn folder_key(path: &str) -> String {
    let mut s = path.replace('\\', "/");
    if let Some(i) = s.rfind('/') {
        if s[i + 1..].to_ascii_lowercase().starts_with("appmanifest_") {
            s.truncate(i);
        }
    } else if s.to_ascii_lowercase().starts_with("appmanifest_") {
        s.clear();
    }
    while s.ends_with('/') {
        s.pop();
    }
    s.make_ascii_lowercase();
    s
}

/// Parses one content_log line of the form
/// `[ts] Loaded N apps from install folder "<folder>"` into `(folder_key(folder), N)`. Anything
/// else, including a missing count or a missing closing quote, is `None`.
pub fn parse_loaded_apps_line(line: &str) -> Option<(String, u32)> {
    let line = line.trim_end_matches(['\r', '\n']);
    let after = &line[line.find("] Loaded ")? + "] Loaded ".len()..];
    let digits = after.bytes().take_while(u8::is_ascii_digit).count();
    if digits == 0 {
        return None;
    }
    let count: u32 = after[..digits].parse().ok()?;
    let folder = after[digits..].strip_prefix(" apps from install folder \"")?;
    let end = folder.find('"')?;
    Some((folder_key(&folder[..end]), count))
}

/// Where the watch stopped reading `content_log.txt`, and what the log said before that.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LogCursor {
    /// Byte offset of the first line not yet read; always at a line start.
    pub offset: u64,
    /// The last `Loaded N` count logged for `key` before `offset`; `None` when there was none.
    pub prior_count: Option<u32>,
    /// The [`folder_key`] of the record's steamapps folder.
    pub key: String,
}

/// The last `Loaded N` count for `key` among the complete lines of `text`.
fn last_count_for(text: &str, key: &str) -> Option<u32> {
    text.split('\n')
        .filter_map(parse_loaded_apps_line)
        .filter(|(folder, _)| folder == key)
        .map(|(_, count)| count)
        .next_back()
}

/// Captures the cursor for a watch registered now: the offset is the end of the last complete line
/// (the file length for a log that ends in a newline, 0 for an absent one) and `prior_count` is the
/// last count logged for `key` in the final [`ADOPTION_LOG_TAIL_BYTES`] before it.
pub fn capture_log_cursor(path: &Path, key: &str) -> LogCursor {
    let none = |offset: u64| LogCursor {
        offset,
        prior_count: None,
        key: key.to_string(),
    };
    let Ok(mut file) = File::open(path) else {
        return none(0);
    };
    let Ok(meta) = file.metadata() else {
        return none(0);
    };
    if !meta.is_file() {
        return none(0);
    }
    let len = meta.len();
    let start = len.saturating_sub(ADOPTION_LOG_TAIL_BYTES);
    let mut buf = Vec::new();
    if file.seek(SeekFrom::Start(start)).is_err()
        || file.take(len - start).read_to_end(&mut buf).is_err()
    {
        return none(0);
    }
    // A last line still being written is left for the scan to read once it is complete.
    let (complete_len, offset) = match buf.iter().rposition(|b| *b == b'\n') {
        Some(i) => (i + 1, start + i as u64 + 1),
        None if start == 0 => (0, 0),
        None => (0, len),
    };
    let mut complete = &buf[..complete_len];
    if start > 0 {
        // The window began inside a line: drop that fragment.
        complete = match complete.iter().position(|b| *b == b'\n') {
            Some(i) => &complete[i + 1..],
            None => &[],
        };
    }
    LogCursor {
        offset,
        prior_count: last_count_for(&String::from_utf8_lossy(complete), key),
        key: key.to_string(),
    }
}

/// Reads what was appended to the log since `cursor.offset` and reports whether it holds a
/// `Loaded N` line for `cursor.key` with N above `cursor.prior_count`. Advances `cursor.offset`
/// past the last complete line it read; a line still being written is left for the next call. A
/// file shorter than the offset was rotated and is read from 0. At most
/// [`ADOPTION_LOG_TAIL_BYTES`] are read per call: a longer append is read from its last window and
/// that window's partial first line is dropped. Any I/O failure is no evidence.
pub fn scan_log_for_rescan(path: &Path, cursor: &mut LogCursor) -> bool {
    let Some((found, offset)) = scan(path, cursor) else {
        return false;
    };
    cursor.offset = offset;
    found
}

fn scan(path: &Path, cursor: &LogCursor) -> Option<(bool, u64)> {
    let mut file = File::open(path).ok()?;
    let meta = file.metadata().ok()?;
    if !meta.is_file() {
        return None;
    }
    let len = meta.len();
    let offset = if len < cursor.offset {
        0
    } else {
        cursor.offset
    };
    if len == offset {
        return Some((false, offset));
    }
    let start = len.saturating_sub(ADOPTION_LOG_TAIL_BYTES).max(offset);
    file.seek(SeekFrom::Start(start)).ok()?;
    let mut buf = Vec::new();
    file.take(len - start).read_to_end(&mut buf).ok()?;
    let mut base = start;
    let mut window = &buf[..];
    if start > offset {
        // The window began inside a line: drop that fragment.
        let nl = window.iter().position(|b| *b == b'\n')?;
        window = &window[nl + 1..];
        base += nl as u64 + 1;
    }
    let last_nl = window.iter().rposition(|b| *b == b'\n')?;
    let complete = &window[..=last_nl];
    let new_offset = base + last_nl as u64 + 1;
    let found = cursor.prior_count.is_some_and(|prior| {
        String::from_utf8_lossy(complete)
            .split('\n')
            .filter_map(parse_loaded_apps_line)
            .any(|(folder, count)| folder == cursor.key && count > prior)
    });
    Some((found, new_offset))
}

/// True when `libraryfolders.vdf` at `path` lists `app_id` under some folder's `apps` map AND the
/// file was modified after `recorded_at_ms`. An app listed in a file that predates the record is an
/// older install, not this one; a file that cannot be read or parsed is "not listed".
pub fn library_folders_list_app(path: &Path, app_id: &str, recorded_at_ms: f64) -> bool {
    let modified_ms = std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64);
    let Some(modified_ms) = modified_ms else {
        return false;
    };
    if modified_ms <= recorded_at_ms {
        return false;
    }
    gamelib_steamfiles::library::read_library_folder_apps(path)
        .is_some_and(|apps| apps.iter().any(|id| id == app_id))
}

/// The HKCU subkey and value that name the account Steam is signed in as.
const ACTIVE_PROCESS_SUBKEY: &str = "Software\\Valve\\Steam\\ActiveProcess";
const ACTIVE_USER_VALUE: &str = "ActiveUser";

/// Windows signed-in: `ActiveUser` 0 is signed out, any other value is signed in, and a missing
/// value or a read error is unknown. Never reads `Apps\<id>\Installed`: spike 087 found that key
/// unreliable as adoption evidence.
pub fn windows_signed_in(reg: &dyn RegistryDword) -> Option<bool> {
    match reg.hkcu_dword(ACTIVE_PROCESS_SUBKEY, ACTIVE_USER_VALUE) {
        Ok(Some(0)) => Some(false),
        Ok(Some(_)) => Some(true),
        Ok(None) | Err(()) => None,
    }
}

/// The state word of a connection_log `[YYYY-MM-DD HH:MM:SS] [State, n, m] ...` line (the grammar
/// `gamelib-steamcm`'s wrap.rs reads, copied rather than imported: that parser is private).
fn state_word(line: &str) -> Option<&str> {
    let line = line.trim_end_matches('\r');
    let b = line.as_bytes();
    if b.len() < 24 || b[0] != b'[' || b[5] != b'-' || b[8] != b'-' || b[11] != b' ' {
        return None;
    }
    let number = |range: std::ops::Range<usize>| line.get(range)?.parse::<u32>().ok();
    number(1..5)?;
    number(6..8)?;
    number(9..11)?;
    number(12..14)?;
    number(15..17)?;
    number(18..20)?;
    let rest = line.get(20..)?.strip_prefix("] [")?;
    let inner = &rest[..rest.find(']')?];
    let mut parts = inner.split(", ");
    let word = parts.next()?;
    if word.is_empty() || !word.chars().all(|c| c.is_ascii_alphabetic() || c == ' ') {
        return None;
    }
    parts.next()?.parse::<i64>().ok()?;
    parts.next()?.parse::<i64>().ok()?;
    Some(word)
}

/// Linux signed-in: the last state line in the final
/// [`ADOPTION_CONNECTION_LOG_TAIL_BYTES`] of `connection_log.txt`. `Logged On` is signed in,
/// `Logged Off` signed out; any other state word, no state line or an unreadable file is unknown.
pub fn connection_log_signed_in(path: &Path) -> Option<bool> {
    let mut file = File::open(path).ok()?;
    let meta = file.metadata().ok()?;
    if !meta.is_file() {
        return None;
    }
    let len = meta.len();
    let start = len.saturating_sub(ADOPTION_CONNECTION_LOG_TAIL_BYTES);
    file.seek(SeekFrom::Start(start)).ok()?;
    let mut buf = Vec::new();
    file.take(len - start).read_to_end(&mut buf).ok()?;
    let text = String::from_utf8_lossy(&buf);
    let mut lines = text.split('\n');
    if start > 0 {
        // The window began inside a line: drop that fragment.
        lines.next();
    }
    match lines.filter_map(state_word).next_back()? {
        "Logged On" => Some(true),
        "Logged Off" => Some(false),
        _ => None,
    }
}
