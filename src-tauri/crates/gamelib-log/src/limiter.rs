//! The `gamelib.log` rate limiter (Phase 84 plan 04, D-14; D-15 scopes it).
//!
//! A repeating line must not flood the file (origin 80 A-IN-01: a hung poll loop grew `gamelib.log`
//! without bound). Lines with the same prefix, level and body are counted per `LIMIT_WINDOW`
//! window: the first `LIMIT_BURST` are written, the rest are suppressed, and when the window closes
//! one summary line with the same level and prefix and the body
//! `<first LIMIT_EXCERPT_CHARS chars of the body> (repeated <K> more times)` is written, K being
//! the number suppressed.
//!
//! The body is the one the line carries (already sanitised or converted), so a message that embeds a
//! changing counter, pid or path is a different key every time and never collapses; the first
//! `LIMIT_BURST` occurrences of any repeating line are always written, so a gate grepping a line
//! still sees it (84-RESEARCH Pitfall 9). At most `LIMIT_MAX_KEYS` keys are tracked: inserting one
//! more evicts the key with the oldest window, with its summary, so unique messages cannot grow
//! memory.
//!
//! This module owns no clock and no file: the writer feeds it each entry's own timestamp and asks
//! for closed windows (`expire`) on every message, on its tick and at flush (`drain`). Only
//! general-target line entries ever reach it. A game or runner transcript is raw child output users
//! upload, and is never limited (D-15).

use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::time::Duration;

use crate::prefix::{Level, Prefix};

/// How long one counting window lasts, from the first occurrence of a key.
pub const LIMIT_WINDOW: Duration = Duration::from_secs(60);
/// How many occurrences of a key are written per window.
pub const LIMIT_BURST: u32 = 5;
/// How many keys are tracked at once.
pub const LIMIT_MAX_KEYS: usize = 256;
/// How many characters of the body a summary repeats.
pub const LIMIT_EXCERPT_CHARS: usize = 200;

const WINDOW_MS: u64 = LIMIT_WINDOW.as_millis() as u64;

/// One closed window's tail: what the writer appends as a normal line.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Summary {
    pub level: Level,
    pub prefix: Prefix,
    /// `<excerpt> (repeated <K> more times)`.
    pub body: String,
}

struct Slot {
    window_start_ms: u64,
    /// Insertion order, the tie-break for "oldest window" so eviction is deterministic.
    seq: u64,
    count: u32,
    level: Level,
    prefix: Prefix,
    excerpt: String,
}

impl Slot {
    /// `None` when nothing was suppressed in this window.
    fn summary(&self) -> Option<Summary> {
        let suppressed = self.count.saturating_sub(LIMIT_BURST);
        if suppressed == 0 {
            return None;
        }
        Some(Summary {
            level: self.level,
            prefix: self.prefix,
            body: format!("{} (repeated {suppressed} more times)", self.excerpt),
        })
    }
}

#[derive(Default)]
pub struct RateLimiter {
    slots: HashMap<u64, Slot>,
    next_seq: u64,
    /// Summaries of keys evicted by `admit`, handed out by the next `take_evicted`, `expire` or
    /// `drain`.
    evicted: Vec<Summary>,
}

fn key_of(level: Level, prefix: Prefix, body: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    prefix.as_str().hash(&mut hasher);
    level.as_str().hash(&mut hasher);
    body.hash(&mut hasher);
    hasher.finish()
}

fn summaries_of(mut slots: Vec<Slot>) -> Vec<Summary> {
    slots.sort_by_key(|s| (s.window_start_ms, s.seq));
    slots.iter().filter_map(Slot::summary).collect()
}

impl RateLimiter {
    pub fn new() -> RateLimiter {
        RateLimiter::default()
    }

    /// How many keys are tracked right now (never above `LIMIT_MAX_KEYS`).
    pub fn tracked_keys(&self) -> usize {
        self.slots.len()
    }

    /// `true` when the line is to be written. Admission uses the entry's own timestamp `ts_ms`.
    pub fn admit(&mut self, ts_ms: u64, level: Level, prefix: Prefix, body: &str) -> bool {
        let key = key_of(level, prefix, body);
        if let Some(slot) = self.slots.get_mut(&key) {
            // `expire` normally closes an elapsed window before this entry arrives; a caller that
            // skipped it still gets the right answer, with the summary kept for the next hand-out.
            if ts_ms.saturating_sub(slot.window_start_ms) >= WINDOW_MS {
                if let Some(summary) = slot.summary() {
                    self.evicted.push(summary);
                }
                slot.window_start_ms = ts_ms;
                slot.count = 0;
            }
            slot.count = slot.count.saturating_add(1);
            return slot.count <= LIMIT_BURST;
        }
        if self.slots.len() >= LIMIT_MAX_KEYS {
            self.evict_oldest();
        }
        self.next_seq += 1;
        self.slots.insert(
            key,
            Slot {
                window_start_ms: ts_ms,
                seq: self.next_seq,
                count: 1,
                level,
                prefix,
                excerpt: body.chars().take(LIMIT_EXCERPT_CHARS).collect(),
            },
        );
        true
    }

    fn evict_oldest(&mut self) {
        let oldest = self
            .slots
            .iter()
            .min_by_key(|(_, s)| (s.window_start_ms, s.seq))
            .map(|(k, _)| *k);
        if let Some(slot) = oldest.and_then(|k| self.slots.remove(&k)) {
            if let Some(summary) = slot.summary() {
                self.evicted.push(summary);
            }
        }
    }

    /// Summaries of keys `admit` evicted since the last hand-out.
    pub fn take_evicted(&mut self) -> Vec<Summary> {
        std::mem::take(&mut self.evicted)
    }

    /// Closes every window that has lasted `LIMIT_WINDOW` at `now_ms` and returns its summary
    /// (oldest window first), after any eviction summaries not yet handed out.
    pub fn expire(&mut self, now_ms: u64) -> Vec<Summary> {
        let closed: Vec<u64> = self
            .slots
            .iter()
            .filter(|(_, s)| now_ms.saturating_sub(s.window_start_ms) >= WINDOW_MS)
            .map(|(k, _)| *k)
            .collect();
        let slots: Vec<Slot> = closed
            .into_iter()
            .filter_map(|k| self.slots.remove(&k))
            .collect();
        let mut out = self.take_evicted();
        out.extend(summaries_of(slots));
        out
    }

    /// Closes every window now (flush and shutdown): a log that goes quiet still gets its summary.
    pub fn drain(&mut self) -> Vec<Summary> {
        let slots: Vec<Slot> = self.slots.drain().map(|(_, s)| s).collect();
        let mut out = self.take_evicted();
        out.extend(summaries_of(slots));
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SEC: u64 = 1000;

    fn warn(l: &mut RateLimiter, ts: u64, body: &str) -> bool {
        l.admit(ts, Level::Warning, Prefix::Backend, body)
    }

    #[test]
    fn the_first_five_in_a_window_are_written_and_the_rest_summarised_at_close() {
        let mut l = RateLimiter::new();
        let written = (0..7)
            .filter(|t| warn(&mut l, t * SEC, "poll failed"))
            .count();
        assert_eq!(written, 5);
        assert!(l.expire(59 * SEC).is_empty(), "the window is still open");
        assert_eq!(
            l.expire(60 * SEC),
            vec![Summary {
                level: Level::Warning,
                prefix: Prefix::Backend,
                body: "poll failed (repeated 2 more times)".to_string(),
            }]
        );
        assert_eq!(l.tracked_keys(), 0);
    }

    #[test]
    fn three_identical_lines_write_three_and_close_without_a_summary() {
        let mut l = RateLimiter::new();
        assert!((0..3).all(|t| warn(&mut l, t * SEC, "three")));
        assert!(l.expire(61 * SEC).is_empty());
        assert_eq!(l.tracked_keys(), 0);
    }

    #[test]
    fn the_same_body_at_two_levels_is_two_keys() {
        let mut l = RateLimiter::new();
        for t in 0..5 {
            assert!(warn(&mut l, t * SEC, "same body"));
            assert!(l.admit(t * SEC, Level::Info, Prefix::Backend, "same body"));
        }
        assert_eq!(l.tracked_keys(), 2);
        // A different prefix is a third key.
        assert!(l.admit(0, Level::Warning, Prefix::Steam, "same body"));
        assert_eq!(l.tracked_keys(), 3);
    }

    #[test]
    fn a_body_with_a_changing_counter_never_collapses() {
        let mut l = RateLimiter::new();
        for i in 1..=300 {
            assert!(
                warn(&mut l, i, &format!("poll {i}")),
                "poll {i} was limited"
            );
        }
        assert!(l.expire(61 * SEC).is_empty());
    }

    #[test]
    fn the_summary_carries_the_first_200_characters_of_a_long_body() {
        let mut l = RateLimiter::new();
        let body: String = "é".repeat(500);
        let written = (0..10).filter(|t| warn(&mut l, *t, &body)).count();
        assert_eq!(written, 5);
        let summary = l.expire(60 * SEC).remove(0);
        assert_eq!(
            summary.body,
            format!(
                "{} (repeated 5 more times)",
                "é".repeat(LIMIT_EXCERPT_CHARS)
            )
        );
    }

    #[test]
    fn a_window_restarts_after_it_closes() {
        let mut l = RateLimiter::new();
        for t in 0..6 {
            warn(&mut l, t, "again");
        }
        assert_eq!(l.expire(60 * SEC).len(), 1);
        assert!((0..5).all(|t| warn(&mut l, 61 * SEC + t, "again")));
        assert!(!warn(&mut l, 62 * SEC, "again"));
    }

    #[test]
    fn admit_closes_an_elapsed_window_itself_when_expire_was_skipped() {
        let mut l = RateLimiter::new();
        for t in 0..7 {
            warn(&mut l, t, "late");
        }
        assert!(warn(&mut l, 61 * SEC, "late"), "a new window admits again");
        assert_eq!(
            l.take_evicted().len(),
            1,
            "the old window's summary is kept"
        );
    }

    #[test]
    fn at_most_256_keys_are_tracked_and_the_oldest_is_evicted_with_its_summary() {
        let mut l = RateLimiter::new();
        for key in 0..LIMIT_MAX_KEYS {
            let body = format!("unique {key}");
            // Seven occurrences each: two suppressed per key.
            for n in 0..7 {
                warn(&mut l, key as u64 * 10 + n, &body);
            }
        }
        assert_eq!(l.tracked_keys(), LIMIT_MAX_KEYS);
        assert!(l.take_evicted().is_empty());
        assert!(warn(&mut l, 5000, "one more key"));
        assert_eq!(l.tracked_keys(), LIMIT_MAX_KEYS, "memory stays bounded");
        assert_eq!(
            l.take_evicted(),
            vec![Summary {
                level: Level::Warning,
                prefix: Prefix::Backend,
                body: "unique 0 (repeated 2 more times)".to_string(),
            }]
        );
    }

    #[test]
    fn an_evicted_key_that_suppressed_nothing_leaves_no_summary() {
        let mut l = RateLimiter::new();
        for key in 0..=LIMIT_MAX_KEYS {
            warn(&mut l, key as u64, &format!("quiet {key}"));
        }
        assert_eq!(l.tracked_keys(), LIMIT_MAX_KEYS);
        assert!(l.take_evicted().is_empty());
    }

    #[test]
    fn drain_closes_every_window_oldest_first() {
        let mut l = RateLimiter::new();
        for t in 0..7 {
            warn(&mut l, t, "first");
        }
        for t in 10..16 {
            warn(&mut l, t, "second");
        }
        let bodies: Vec<String> = l.drain().into_iter().map(|s| s.body).collect();
        assert_eq!(
            bodies,
            [
                "first (repeated 2 more times)",
                "second (repeated 1 more times)"
            ]
        );
        assert_eq!(l.tracked_keys(), 0);
    }

    #[test]
    fn ten_thousand_identical_lines_over_ten_minutes_write_five_plus_one_summary_per_window() {
        let mut l = RateLimiter::new();
        let mut written = 0;
        let mut summaries = 0;
        for i in 0..10_000u64 {
            let ts = i * 60; // 10,000 lines over 600 s
            summaries += l.expire(ts).len();
            if warn(&mut l, ts, "connection refused") {
                written += 1;
            }
        }
        summaries += l.drain().len();
        // Ten 60 s windows, 1,000 lines in each: 5 written and one summary of the other 995.
        assert_eq!(written, 5 * 10);
        assert_eq!(summaries, 10);
    }
}
