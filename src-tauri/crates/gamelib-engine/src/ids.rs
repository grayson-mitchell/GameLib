//! The engine override id grammar (Phase 59 D-14, ported from `engineIds.ts`). A closed set:
//! anything else, including any path, parses to `automatic`. This is the validation point for the
//! renderer-supplied per-game override.

use serde_json::Value;

use crate::pins::{pins, EnginePin};

/// `automatic`, `crossover`, `pinned:<id>` or `wine-manager:<version>`; the TS type is a string
/// union, so the id travels as a string.
pub type EngineOverrideId = String;

pub const AUTOMATIC: &str = "automatic";
pub const CROSSOVER: &str = "crossover";
pub const PINNED_PREFIX: &str = "pinned:";
pub const WINE_MANAGER_PREFIX: &str = "wine-manager:";

/// The pin the shared table ships under `id`, current first (`pinById`).
pub fn pin_by_id(id: &str) -> Option<&'static EnginePin> {
    let table = pins().ok()?;
    if table.current.id == id {
        return Some(&table.current);
    }
    table.previous.as_ref().filter(|p| p.id == id)
}

/// `^[A-Za-z0-9._-]{1,64}$`: a Wine Manager version, or a marker id.
pub fn is_version_token(text: &str) -> bool {
    !text.is_empty()
        && text.len() <= 64
        && text
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
}

/// `parseEngineOverride` for a string.
pub fn parse_engine_override_str(raw: &str) -> EngineOverrideId {
    if raw == AUTOMATIC || raw == CROSSOVER {
        return raw.to_string();
    }
    if let Some(id) = raw.strip_prefix(PINNED_PREFIX) {
        return if pin_by_id(id).is_some() {
            raw.to_string()
        } else {
            AUTOMATIC.to_string()
        };
    }
    if let Some(version) = raw.strip_prefix(WINE_MANAGER_PREFIX) {
        if !is_version_token(version) || version.contains("..") || version.ends_with("-DXMT") {
            return AUTOMATIC.to_string();
        }
        let lower = version.to_ascii_lowercase();
        if lower.contains("toolkit") || lower.contains("gptk") || lower.contains("porting") {
            return AUTOMATIC.to_string();
        }
        return raw.to_string();
    }
    AUTOMATIC.to_string()
}

/// `parseEngineOverride` for any JSON value: a non-string is `automatic`.
pub fn parse_engine_override(raw: &Value) -> EngineOverrideId {
    match raw.as_str() {
        Some(text) => parse_engine_override_str(text),
        None => AUTOMATIC.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn the_closed_grammar_keeps_only_known_ids() {
        assert_eq!(parse_engine_override(&json!("crossover")), "crossover");
        assert_eq!(
            parse_engine_override(&json!("pinned:wine-staging-11.20")),
            "pinned:wine-staging-11.20"
        );
        assert_eq!(parse_engine_override(&json!("pinned:nope")), "automatic");
        assert_eq!(parse_engine_override(&json!("/usr/bin/wine")), "automatic");
        assert_eq!(parse_engine_override(&json!(5)), "automatic");
        assert_eq!(
            parse_engine_override(&json!("wine-manager:Wine-Staging-10.5")),
            "wine-manager:Wine-Staging-10.5"
        );
    }

    #[test]
    fn wine_manager_names_are_filtered() {
        for bad in [
            "wine-manager:a..b",
            "wine-manager:x-DXMT",
            "wine-manager:GPTK-2",
            "wine-manager:Game-Porting-Toolkit",
            "wine-manager:Porting-1",
            "wine-manager:has space",
            "wine-manager:",
        ] {
            assert_eq!(parse_engine_override_str(bad), "automatic", "{bad}");
        }
        assert_eq!(
            parse_engine_override_str(&format!("wine-manager:{}", "a".repeat(64))).len(),
            13 + 64
        );
        assert_eq!(
            parse_engine_override_str(&format!("wine-manager:{}", "a".repeat(65))),
            "automatic"
        );
    }
}
