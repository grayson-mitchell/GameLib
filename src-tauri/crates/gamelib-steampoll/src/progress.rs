//! Port of steamDownloadProgress.ts (pure progress maths) plus `formatEta` and `rollingRateMiBs`
//! from depotRust/progress.ts. Ported by plan 06.
//!
//! Numbers are `f64` wherever the TS uses `number`. Parsing is hand-rolled (no regex dependency)
//! and mirrors the TS regexes, including their leftmost-match and greedy-backtrack behaviour.

use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub enum ContentLogEvent {
    Started {
        app_id: String,
        download_done: f64,
        download_total: f64,
    },
    Phase {
        app_id: String,
        phase: String,
    },
    Ended {
        app_id: String,
    },
    Session,
}

/// Every `AppID <digits> ` occurrence in `line`, as `(app_id, text after the trailing space)`.
fn app_id_matches(line: &str) -> Vec<(&str, &str)> {
    const NEEDLE: &str = "AppID ";
    let mut out = vec![];
    let mut from = 0;
    while let Some(i) = line[from..].find(NEEDLE) {
        let start = from + i + NEEDLE.len();
        let rest = &line[start..];
        let digits = rest.bytes().take_while(u8::is_ascii_digit).count();
        if digits > 0 && rest[digits..].starts_with(' ') {
            out.push((&rest[..digits], &rest[digits + 1..]));
        }
        from += i + 1;
    }
    out
}

/// `download (\d+)/(\d+)(?:,|\s|$)` anchored at the start of `s`.
fn parse_started_tail(s: &str) -> Option<(f64, f64)> {
    let s = s.strip_prefix("update started : download ")?;
    let a = s.bytes().take_while(u8::is_ascii_digit).count();
    if a == 0 {
        return None;
    }
    let s2 = s[a..].strip_prefix('/')?;
    let b = s2.bytes().take_while(u8::is_ascii_digit).count();
    if b == 0 {
        return None;
    }
    let term = s2[b..].chars().next();
    if !matches!(term, None | Some(',')) && !term.is_some_and(char::is_whitespace) {
        return None;
    }
    Some((s[..a].parse().ok()?, s2[..b].parse().ok()?))
}

/// content_log.txt is CRLF and `.` never matches `\r`, so strip it before matching.
pub fn parse_content_log_line(raw: &str) -> Option<ContentLogEvent> {
    let line = raw.replace('\r', "");
    // Steam writes this once per client start-up; no update survives a restart.
    if let Some(rest) = line.strip_prefix('[') {
        if let Some(end) = rest.find(']') {
            if rest[end + 1..].starts_with(" Client version: ") {
                return Some(ContentLogEvent::Session);
            }
        }
    }
    let matches = app_id_matches(&line);
    for (app_id, tail) in &matches {
        if let Some((done, total)) = parse_started_tail(tail) {
            return Some(ContentLogEvent::Started {
                app_id: (*app_id).to_string(),
                download_done: done,
                download_total: total,
            });
        }
    }
    for (app_id, tail) in &matches {
        if let Some(phase) = tail.strip_prefix("App update changed : ") {
            let phase = phase.trim();
            let phase = phase.strip_suffix(',').unwrap_or(phase);
            if phase == "None" {
                return Some(ContentLogEvent::Ended {
                    app_id: (*app_id).to_string(),
                });
            }
            return Some(ContentLogEvent::Phase {
                app_id: (*app_id).to_string(),
                phase: phase.to_string(),
            });
        }
    }
    for (app_id, tail) in &matches {
        if ["scheduler finished", "finished update", "update canceled"]
            .iter()
            .any(|p| tail.starts_with(p))
        {
            return Some(ContentLogEvent::Ended {
                app_id: (*app_id).to_string(),
            });
        }
    }
    None
}

#[derive(Debug, Clone, PartialEq)]
pub enum NettopRow {
    Header,
    Flow { flow: String, bytes_in: f64 },
}

/// Parses one line of `nettop -x -J bytes_in` output (pty, so CRLF).
pub fn parse_nettop_row(raw: &str) -> Option<NettopRow> {
    let line = raw.replace('\r', "");
    if line.starts_with(",bytes_in") {
        return Some(NettopRow::Header);
    }
    // ^(?:tcp|udp)\S*\s+(\S+),(\d*),
    let rest = line
        .strip_prefix("tcp")
        .or_else(|| line.strip_prefix("udp"))?;
    let rest = rest.trim_start_matches(|c: char| !c.is_whitespace());
    let after_ws = rest.trim_start_matches(char::is_whitespace);
    if after_ws.len() == rest.len() {
        return None;
    }
    let token = after_ws
        .split(char::is_whitespace)
        .next()
        .unwrap_or_default();
    // `(\S+)` is greedy: take the last comma that is followed by `\d*,`.
    let tb = token.as_bytes();
    let mut found: Option<(&str, &str)> = None;
    for i in (1..tb.len()).rev() {
        if tb[i] != b',' {
            continue;
        }
        let digits = tb[i + 1..]
            .iter()
            .take_while(|b| b.is_ascii_digit())
            .count();
        if tb.get(i + 1 + digits) == Some(&b',') {
            found = Some((&token[..i], &token[i + 1..i + 1 + digits]));
            break;
        }
    }
    let (flow, digits) = found?;
    if digits.is_empty() {
        return None;
    }
    if flow.contains("127.0.0.1") || flow.contains("::1") {
        return None;
    }
    let bytes_in: f64 = digits.parse().ok()?;
    if !bytes_in.is_finite() {
        return None;
    }
    Some(NettopRow::Flow {
        flow: flow.to_string(),
        bytes_in,
    })
}

#[derive(Debug, Clone, Default)]
pub struct FlowAccumulator {
    pub cum: f64,
    pub blocks: u32,
    pub flows: HashMap<String, f64>,
}

impl FlowAccumulator {
    pub fn new() -> Self {
        Self::default()
    }
}

/// Applies a parsed row. The first block is a baseline only.
pub fn apply_nettop_row(acc: &mut FlowAccumulator, row: &NettopRow) {
    match row {
        NettopRow::Header => acc.blocks += 1,
        NettopRow::Flow { flow, bytes_in } => {
            let prev = acc.flows.get(flow).copied();
            if acc.blocks > 1 {
                // A flow first seen after the baseline counts from 0; a decrease adds nothing.
                let base = prev.unwrap_or(0.0);
                if *bytes_in > base {
                    acc.cum += bytes_in - base;
                }
            }
            acc.flows.insert(flow.clone(), *bytes_in);
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ActiveUpdate {
    pub download_done: f64,
    pub download_total: f64,
    pub cum_at_start: f64,
}

#[derive(Debug, Clone, Default)]
pub struct UpdateTracker {
    pub active: HashMap<String, ActiveUpdate>,
}

impl UpdateTracker {
    pub fn new() -> Self {
        Self::default()
    }
}

pub fn apply_content_log_event(tracker: &mut UpdateTracker, event: &ContentLogEvent, cum_now: f64) {
    match event {
        // A new Steam client session: any `update started` before it can never get its end line.
        ContentLogEvent::Session => tracker.active.clear(),
        ContentLogEvent::Started {
            app_id,
            download_done,
            download_total,
        } => {
            tracker.active.insert(
                app_id.clone(),
                ActiveUpdate {
                    download_done: *download_done,
                    download_total: *download_total,
                    cum_at_start: cum_now,
                },
            );
        }
        ContentLogEvent::Ended { app_id } => {
            tracker.active.remove(app_id);
        }
        ContentLogEvent::Phase { .. } => {}
    }
}

pub fn active_count(tracker: &UpdateTracker) -> usize {
    tracker.active.len()
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LiveProgress {
    pub bytes_done: f64,
    pub total: f64,
    /// 0..99, unrounded.
    pub percent: f64,
}

#[derive(Debug, Clone, Copy)]
pub struct LiveProgressInput {
    pub download_done: f64,
    pub download_total: f64,
    pub cum_at_start: f64,
    pub cum_now: f64,
    pub acf_bytes_downloaded: f64,
    pub acf_bytes_to_download: f64,
}

pub fn live_progress(input: &LiveProgressInput) -> Option<LiveProgress> {
    let total = if input.acf_bytes_to_download > 0.0 {
        input.acf_bytes_to_download
    } else {
        input.download_total
    };
    if total.is_nan() || total <= 0.0 {
        return None;
    }
    let bytes_done = input
        .acf_bytes_downloaded
        .max(input.download_done + (input.cum_now - input.cum_at_start).max(0.0));
    Some(LiveProgress {
        bytes_done,
        total,
        percent: ((bytes_done / total) * 100.0).min(99.0),
    })
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Sample {
    pub ms: f64,
    pub cum: f64,
}

pub const DEFAULT_WINDOW_MS: f64 = 3000.0;

/// Bytes/s over the samples inside `window_ms`. `None` when not measurable.
pub fn window_rate_in(samples: &[Sample], now_ms: f64, window_ms: f64) -> Option<f64> {
    let in_win: Vec<&Sample> = samples
        .iter()
        .filter(|s| now_ms - s.ms <= window_ms)
        .collect();
    if in_win.len() < 2 {
        return None;
    }
    let first = in_win.first()?;
    let last = in_win.last()?;
    let dt = last.ms - first.ms;
    if dt < 500.0 {
        return None;
    }
    let rate = ((last.cum - first.cum) / dt) * 1000.0;
    if !rate.is_finite() || rate < 0.0 {
        return None;
    }
    Some(rate)
}

/// `window_rate_in` with the 3000 ms default window.
pub fn window_rate(samples: &[Sample], now_ms: f64) -> Option<f64> {
    window_rate_in(samples, now_ms, DEFAULT_WINDOW_MS)
}

const BYTES_PER_MIB: f64 = 1024.0 * 1024.0;
const MIN_RATE_WINDOW_SEC: f64 = 0.05;

/// `HH:MM:SS` ETA, zero-padded. JS `Math.round` rounds half toward +infinity, so `floor(x + 0.5)`.
pub fn format_eta(total_seconds: f64) -> String {
    let s = (total_seconds + 0.5).floor().max(0.0) as u64;
    format!("{:02}:{:02}:{:02}", s / 3600, (s % 3600) / 60, s % 60)
}

/// Instantaneous MiB/s over the window since the last emit; reuses `previous_mib_s` when the
/// window is too small to be meaningful.
pub fn rolling_rate_mib_s(bytes_delta: f64, ms_delta: f64, previous_mib_s: f64) -> f64 {
    let sec_delta = ms_delta / 1000.0;
    if sec_delta < MIN_RATE_WINDOW_SEC {
        return previous_mib_s;
    }
    let rate = bytes_delta / sec_delta / BYTES_PER_MIB;
    if rate > 0.0 {
        rate
    } else {
        0.0
    }
}
