//! The `kind:"log"` frame the sidecar forwarder sends (Phase 84, D-20): typed targets and entries,
//! never a path. Every field is validated here and a bad frame is rejected whole, by category.
//!
//! The contract is shared with the TS side through `src/common/__fixtures__/logFrameVectors.json`.

use gamelib_core::paths::{log_file, GameLogType, LogRunner, LogTarget, Platform};
use serde::Deserialize;
use serde_json::Value;

use crate::prefix::{Level, Prefix};
use crate::writer::{Entry, TargetBatch};

/// The largest frame line the shell accepts, in bytes.
pub const LOG_FRAME_MAX_BYTES: usize = 4 * 1024 * 1024;
/// The longest single entry (a line's message or a raw chunk), in UTF-16 code units (the unit the
/// TS side counts in).
pub const LOG_ENTRY_MAX_UTF16: usize = 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LogFrame {
    pub kind: String,
    pub batch: Vec<FrameBatch>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FrameBatch {
    pub target: FrameTarget,
    pub rotate: bool,
    pub entries: Vec<FrameEntry>,
}

/// One flat struct for every target kind. The closed-set fields are read as strings and checked
/// explicitly, so each failure maps to its own category.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FrameTarget {
    pub kind: String,
    pub app_name: Option<String>,
    pub runner: Option<String>,
    #[serde(rename = "type")]
    pub log_type: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FrameEntry {
    Line(FrameLine),
    Raw(String),
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FrameLine {
    pub ts: u64,
    pub tz: i32,
    pub level: String,
    pub prefix: String,
    pub msg: String,
}

/// Why a frame was rejected. `as_str` is the reason string the shared vectors use.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FrameReject {
    UnknownField,
    Shape,
    Prefix,
    Level,
    Runner,
    Type,
    PathSegment,
    TooLarge,
}

impl FrameReject {
    pub fn as_str(self) -> &'static str {
        match self {
            FrameReject::UnknownField => "unknown-field",
            FrameReject::Shape => "shape",
            FrameReject::Prefix => "prefix",
            FrameReject::Level => "level",
            FrameReject::Runner => "runner",
            FrameReject::Type => "type",
            FrameReject::PathSegment => "path-segment",
            FrameReject::TooLarge => "too-large",
        }
    }
}

fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

fn target_of(t: FrameTarget) -> Result<LogTarget, FrameReject> {
    let none_of = |fields: &[&Option<String>]| {
        if fields.iter().any(|f| f.is_some()) {
            Err(FrameReject::Shape)
        } else {
            Ok(())
        }
    };
    let runner_of = |r: &Option<String>| {
        r.as_deref()
            .and_then(LogRunner::from_str)
            .ok_or(FrameReject::Runner)
    };
    match t.kind.as_str() {
        "general" => {
            none_of(&[&t.app_name, &t.runner, &t.log_type])?;
            Ok(LogTarget::General)
        }
        "gogRedist" => {
            none_of(&[&t.app_name, &t.runner, &t.log_type])?;
            Ok(LogTarget::GogRedist)
        }
        "runner" => {
            none_of(&[&t.app_name, &t.log_type])?;
            Ok(LogTarget::Runner(runner_of(&t.runner)?))
        }
        "game" => {
            let runner = runner_of(&t.runner)?;
            if runner == LogRunner::Comet {
                return Err(FrameReject::Runner);
            }
            let kind = t
                .log_type
                .as_deref()
                .and_then(GameLogType::from_str)
                .ok_or(FrameReject::Type)?;
            let app_name = t.app_name.ok_or(FrameReject::Shape)?;
            let target = LogTarget::Game {
                app_name,
                runner,
                kind,
            };
            // The same validation the writer applies to the path (empty, over 255 bytes, a
            // separator, NUL or `..`).
            log_file(Platform::current(), "", "", &target).map_err(|_| FrameReject::PathSegment)?;
            Ok(target)
        }
        _ => Err(FrameReject::Shape),
    }
}

fn entry_of(e: FrameEntry) -> Result<Entry, FrameReject> {
    match e {
        FrameEntry::Raw(text) => {
            if utf16_len(&text) > LOG_ENTRY_MAX_UTF16 {
                return Err(FrameReject::TooLarge);
            }
            Ok(Entry::Raw(text))
        }
        FrameEntry::Line(l) => {
            if utf16_len(&l.msg) > LOG_ENTRY_MAX_UTF16 {
                return Err(FrameReject::TooLarge);
            }
            let level = Level::from_str(&l.level).ok_or(FrameReject::Level)?;
            let prefix = Prefix::from_value(&l.prefix).ok_or(FrameReject::Prefix)?;
            Ok(Entry::Line {
                ts: l.ts,
                tz: l.tz,
                level,
                prefix,
                msg: l.msg,
            })
        }
    }
}

/// Parses one frame line (already JSON-decoded; `line_len` is its length in bytes) into batches.
/// The size check comes first, then shape, then each field, then the path validation.
pub fn parse_frame(line_len: usize, value: Value) -> Result<Vec<TargetBatch>, FrameReject> {
    if line_len > LOG_FRAME_MAX_BYTES {
        return Err(FrameReject::TooLarge);
    }
    let frame: LogFrame = serde_json::from_value(value).map_err(|e| {
        if e.to_string().contains("unknown field") {
            FrameReject::UnknownField
        } else {
            FrameReject::Shape
        }
    })?;
    if frame.kind != "log" {
        return Err(FrameReject::Shape);
    }
    let mut out = Vec::with_capacity(frame.batch.len());
    for b in frame.batch {
        let target = target_of(b.target)?;
        let entries = b
            .entries
            .into_iter()
            .map(entry_of)
            .collect::<Result<Vec<_>, _>>()?;
        out.push(TargetBatch {
            target,
            rotate: b.rotate,
            entries,
        });
    }
    Ok(out)
}

/// The targets of the batches in a raw frame `value` that claim a rotation (`rotate: true`) and
/// name a valid non-general target, read without validating anything else. For a frame about to be
/// rejected whole: the rotation it claimed is not lost with it, the caller owes it
/// ([`crate::writer::Logger::owe_rotation`]). Reads only what it needs; a malformed frame yields
/// nothing.
pub fn rotating_targets(value: &Value) -> Vec<LogTarget> {
    let Some(batches) = value.get("batch").and_then(Value::as_array) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for b in batches {
        if b.get("rotate").and_then(Value::as_bool) != Some(true) {
            continue;
        }
        let Some(raw) = b.get("target") else {
            continue;
        };
        let Ok(parsed) = serde_json::from_value::<FrameTarget>(raw.clone()) else {
            continue;
        };
        if let Ok(target) = target_of(parsed) {
            if target != LogTarget::General && !out.contains(&target) {
                out.push(target);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const VECTORS: &str = include_str!("../../../../src/common/__fixtures__/logFrameVectors.json");

    fn vectors() -> Value {
        serde_json::from_str(VECTORS).expect("logFrameVectors.json")
    }

    fn parse(frame: &Value) -> Result<Vec<TargetBatch>, FrameReject> {
        let len = serde_json::to_string(frame).expect("serialise").len();
        parse_frame(len, frame.clone())
    }

    fn name(v: &Value) -> &str {
        v["name"].as_str().expect("vector name")
    }

    #[test]
    fn the_limits_match_the_shared_vectors() {
        let v = vectors();
        assert_eq!(
            v["maxFrameBytes"].as_u64(),
            Some(LOG_FRAME_MAX_BYTES as u64)
        );
        assert_eq!(
            v["maxEntryUtf16"].as_u64(),
            Some(LOG_ENTRY_MAX_UTF16 as u64)
        );
    }

    #[test]
    fn every_valid_vector_parses() {
        let v = vectors();
        let valid = v["valid"].as_array().expect("valid");
        assert!(!valid.is_empty());
        for item in valid {
            let got = parse(&item["frame"]);
            assert!(
                got.is_ok(),
                "valid vector {:?}: {:?}",
                name(item),
                got.err()
            );
        }
    }

    #[test]
    fn a_mixed_batch_keeps_targets_rotate_flags_and_entry_order() {
        let v = vectors();
        let item = v["valid"]
            .as_array()
            .expect("valid")
            .iter()
            .find(|i| name(i).starts_with("mixed batch"))
            .expect("mixed vector");
        let batches = parse(&item["frame"]).expect("parses");
        assert_eq!(batches.len(), 2);
        assert!(batches[0].rotate);
        assert!(matches!(batches[0].entries[0], Entry::Line { .. }));
        assert!(matches!(batches[0].entries[1], Entry::Raw(_)));
    }

    #[test]
    fn every_invalid_vector_is_rejected_with_its_exact_reason() {
        let v = vectors();
        let invalid = v["invalid"].as_array().expect("invalid");
        let mut checked = 0;
        for item in invalid {
            let reason = item["reason"].as_str().expect("reason");
            let got = if item["frame"].get("generate").is_some() {
                // The `generate` stanza: one general-target raw entry of `rawBytes` ASCII bytes.
                let raw =
                    "a".repeat(item["frame"]["generate"]["rawBytes"].as_u64().expect("n") as usize);
                let frame = json!({"kind": "log", "batch": [
                    {"target": {"kind": "general"}, "rotate": false, "entries": [{"raw": raw}]}
                ]});
                parse(&frame)
            } else {
                parse(&item["frame"])
            };
            match got {
                Err(e) => assert_eq!(e.as_str(), reason, "vector {:?}", name(item)),
                Ok(_) => panic!("invalid vector {:?} parsed", name(item)),
            }
            checked += 1;
        }
        assert_eq!(checked, invalid.len());
    }

    fn general_frame(entry: Value) -> Value {
        json!({"kind": "log", "batch": [
            {"target": {"kind": "general"}, "rotate": false, "entries": [entry]}
        ]})
    }

    #[test]
    fn an_entry_over_the_utf16_cap_is_too_large_but_the_cap_itself_is_fine() {
        let over = general_frame(json!({"raw": "a".repeat(LOG_ENTRY_MAX_UTF16 + 1)}));
        assert_eq!(parse(&over).err(), Some(FrameReject::TooLarge));
        let at = general_frame(json!({"raw": "a".repeat(LOG_ENTRY_MAX_UTF16)}));
        assert!(parse(&at).is_ok());
        // One astral character is two UTF-16 units: the cap counts units, not chars or bytes.
        let astral = general_frame(json!({"raw": "\u{1F600}".repeat(LOG_ENTRY_MAX_UTF16 / 2 + 1)}));
        assert_eq!(parse(&astral).err(), Some(FrameReject::TooLarge));
        let line = general_frame(json!({"line": {"ts": 1, "tz": 0, "level": "INFO",
            "prefix": "Backend", "msg": "a".repeat(LOG_ENTRY_MAX_UTF16 + 1)}}));
        assert_eq!(parse(&line).err(), Some(FrameReject::TooLarge));
    }

    #[test]
    fn rotating_targets_reads_only_the_valid_non_general_claims() {
        let game = json!({"kind": "game", "appName": "480", "runner": "steam", "type": "launch"});
        let frame = json!({"kind": "log", "batch": [
            {"target": {"kind": "general"}, "rotate": true, "entries": []},
            {"target": game, "rotate": false, "entries": []},
            {"target": {"kind": "game", "appName": "../x", "runner": "steam", "type": "launch"},
             "rotate": true, "entries": []},
            {"target": game, "rotate": true, "entries": [{"raw": 7}]},
            {"target": game, "rotate": true, "entries": []},
            {"target": {"kind": "runner", "runner": "legendary"}, "rotate": true, "entries": []}
        ]});
        let got = rotating_targets(&frame);
        assert_eq!(got.len(), 2, "{got:?}");
        assert!(matches!(got[0], LogTarget::Game { .. }));
        assert!(matches!(got[1], LogTarget::Runner(_)));
        assert!(rotating_targets(&json!(7)).is_empty());
        assert!(rotating_targets(&json!({"batch": 3})).is_empty());
    }

    #[test]
    fn a_frame_over_the_byte_cap_is_too_large_before_anything_else_is_read() {
        // Not even valid JSON shape: the size check comes first.
        assert_eq!(
            parse_frame(LOG_FRAME_MAX_BYTES + 1, json!(7)).err(),
            Some(FrameReject::TooLarge)
        );
        assert_eq!(
            parse_frame(LOG_FRAME_MAX_BYTES, json!(7)).err(),
            Some(FrameReject::Shape)
        );
    }

    #[test]
    fn a_wrong_kind_or_an_extraneous_target_field_is_a_shape_error() {
        let bad_kind = json!({"kind": "other", "batch": []});
        assert_eq!(parse(&bad_kind).err(), Some(FrameReject::Shape));
        let extra = json!({"kind": "log", "batch": [
            {"target": {"kind": "general", "runner": "steam"}, "rotate": false, "entries": []}
        ]});
        assert_eq!(parse(&extra).err(), Some(FrameReject::Shape));
    }
}
