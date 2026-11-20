//! The reaper's control protocol: newline-delimited text over the reaper's stdin.
//!
//! ```text
//! + <pgid> <start> <label>     register a process group (start 0 = unknown)
//! - <pgid>                     unregister it
//! disarm                       the parent is quitting cleanly; signal nothing
//! ```
//!
//! The protocol has no command that names anything but a group the parent registered, and a pgid
//! of 1 or less never parses (`kill(-1)` is every process the user owns, `kill(0)` the caller's own
//! group). Malformed input parses to `None`; it is never a panic and never a signal.

/// Longest label kept, after sanitising.
pub const MAX_LABEL: usize = 32;

/// Longest line the parser looks at; anything longer is garbage by construction.
pub const MAX_LINE: usize = 256;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ReaperLine {
    Register {
        pgid: i32,
        /// Leader start stamp from `probe::start_time`; 0 means unknown.
        start: u64,
        label: String,
    },
    Unregister {
        pgid: i32,
    },
    Disarm,
}

/// Keeps `[A-Za-z0-9_-]`, replaces everything else with `_`, caps at `MAX_LABEL`, and never
/// returns an empty string (an empty label would not survive a whitespace-split round trip).
pub fn sanitize_label(label: &str) -> String {
    let mut out: String = label
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .take(MAX_LABEL)
        .collect();
    if out.is_empty() {
        out.push_str("unnamed");
    }
    out
}

impl ReaperLine {
    /// One protocol line, without its trailing newline.
    pub fn encode(&self) -> String {
        match self {
            ReaperLine::Register { pgid, start, label } => {
                format!("+ {pgid} {start} {}", sanitize_label(label))
            }
            ReaperLine::Unregister { pgid } => format!("- {pgid}"),
            ReaperLine::Disarm => "disarm".to_string(),
        }
    }

    /// `None` for anything malformed, over-long, or naming a pgid <= 1.
    pub fn parse(line: &str) -> Option<ReaperLine> {
        if line.len() > MAX_LINE {
            return None;
        }
        let mut tok = line.split_whitespace();
        match tok.next()? {
            "disarm" => tok.next().is_none().then_some(ReaperLine::Disarm),
            "-" => {
                let pgid: i32 = tok.next()?.parse().ok()?;
                (pgid > 1 && tok.next().is_none()).then_some(ReaperLine::Unregister { pgid })
            }
            "+" => {
                let pgid: i32 = tok.next()?.parse().ok()?;
                let start: u64 = tok.next()?.parse().ok()?;
                let label = sanitize_label(tok.next().unwrap_or(""));
                (pgid > 1 && tok.next().is_none()).then_some(ReaperLine::Register {
                    pgid,
                    start,
                    label,
                })
            }
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_encoded_line_parses_back_to_the_same_value() {
        let lines = [
            ReaperLine::Register {
                pgid: 4242,
                start: 0,
                label: "sidecar".into(),
            },
            ReaperLine::Register {
                pgid: 2,
                start: 1_700_000_000_123_456,
                label: "standin-idle-1".into(),
            },
            ReaperLine::Unregister { pgid: 4242 },
            ReaperLine::Disarm,
        ];
        for l in lines {
            assert_eq!(ReaperLine::parse(&l.encode()), Some(l.clone()), "{l:?}");
        }
    }

    #[test]
    fn pgids_that_would_signal_everything_or_the_caller_parse_to_none() {
        for bad in ["+ 0 0 x", "+ 1 0 x", "+ -5 0 x", "- 0", "- 1", "- -5"] {
            assert_eq!(ReaperLine::parse(bad), None, "{bad}");
        }
    }

    #[test]
    fn a_label_with_spaces_or_non_ascii_is_sanitised() {
        assert_eq!(sanitize_label("a b/c"), "a_b_c");
        assert_eq!(sanitize_label("caf\u{e9}"), "caf_");
        assert_eq!(sanitize_label(""), "unnamed");
        assert_eq!(sanitize_label(&"x".repeat(200)).len(), MAX_LABEL);
        // A label that needed sanitising still encodes to a line that parses.
        let l = ReaperLine::Register {
            pgid: 77,
            start: 5,
            label: "has space \u{1f600}".into(),
        };
        assert_eq!(
            ReaperLine::parse(&l.encode()),
            Some(ReaperLine::Register {
                pgid: 77,
                start: 5,
                label: "has_space__".into(),
            })
        );
    }

    #[test]
    fn garbage_parses_to_none_without_panicking() {
        let junk500 = "\u{0}\u{ff}garbage ".repeat(40);
        assert!(junk500.len() >= 400);
        for bad in [
            "",
            "   ",
            "disarm now",
            "+",
            "+ 5",
            "+ 5 x label",
            "+ 5 0 a b",
            "- x",
            "- 5 6",
            "kill -9",
            "\u{0}",
            junk500.as_str(),
        ] {
            assert_eq!(ReaperLine::parse(bad), None, "{bad:?}");
        }
        assert_eq!(ReaperLine::parse(&"a".repeat(500)), None);
    }
}
