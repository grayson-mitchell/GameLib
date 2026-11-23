//! Which prefix a non-Steam game launches in, over untyped JSON (the golden and op surface of
//! [`crate::game_prefix::resolve_game_prefix`], ported from `gamePrefix.ts` in Phase 61 and kept in
//! `game_prefix.rs`). This module owns the JSON in and out the bottle goldens replay: the effective
//! engine as `{kind, id, source}` or `{kind, label}`, and the prefix as the TS object.

use serde_json::{json, Map, Value};

use crate::config::{EffectiveEngine, EngineSource};
use crate::game_prefix::{BottleOrigin, GamePrefix};
use crate::jsutil::prop;

pub use crate::game_prefix::resolve_game_prefix;

/// An effective engine from its JSON (`{kind: 'legacy', label?}` or `{kind: 'override', id, source}`).
/// A shape that is neither reads as a legacy engine with no label, which is what every rule of the
/// resolver treats as "launch as before".
pub fn effective_from_value(value: &Value) -> EffectiveEngine {
    match prop(value, "kind").and_then(Value::as_str) {
        Some("override") => EffectiveEngine::Override {
            id: prop(value, "id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            source: if prop(value, "source").and_then(Value::as_str) == Some("derived") {
                EngineSource::Derived
            } else {
                EngineSource::Stored
            },
        },
        _ => EffectiveEngine::Legacy {
            label: prop(value, "label").cloned(),
        },
    }
}

/// The prefix as the TS object (`{kind: 'bottle', bottleName, origin, previousPrefix?}` and so on).
/// An absent member is left out, as `JSON.stringify` leaves out `undefined`.
pub fn prefix_to_value(prefix: &GamePrefix) -> Value {
    match prefix {
        GamePrefix::Legacy => json!({"kind": "legacy"}),
        GamePrefix::Invalid => json!({"kind": "invalid"}),
        GamePrefix::Plain { wine_prefix } => {
            let mut map = Map::new();
            map.insert("kind".into(), json!("plain"));
            if let Some(value) = wine_prefix {
                map.insert("winePrefix".into(), value.clone());
            }
            Value::Object(map)
        }
        GamePrefix::Bottle {
            bottle_name,
            origin,
            previous_prefix,
        } => {
            let mut map = Map::new();
            map.insert("kind".into(), json!("bottle"));
            map.insert("bottleName".into(), json!(bottle_name));
            map.insert(
                "origin".into(),
                json!(match origin {
                    BottleOrigin::LegacyCrossover => "legacy-crossover",
                    BottleOrigin::PerGame => "per-game",
                    BottleOrigin::SwitchedFromPlain => "switched-from-plain",
                }),
            );
            if let Some(value) = previous_prefix {
                map.insert("previousPrefix".into(), value.clone());
            }
            Value::Object(map)
        }
    }
}

/// `resolveGamePrefix` over `{runner, appName, settings, effective}` as JSON. A runner or app name
/// that is not a string has no per-game bottle, which the resolver answers `invalid`.
pub fn resolve_game_prefix_value(input: &Value) -> Value {
    let text = |key: &str| prop(input, key).and_then(Value::as_str);
    let effective = effective_from_value(prop(input, "effective").unwrap_or(&Value::Null));
    let settings = prop(input, "settings").cloned().unwrap_or(Value::Null);
    let prefix = match (text("runner"), text("appName")) {
        (Some(runner), Some(app_name)) => {
            resolve_game_prefix(runner, app_name, &settings, &effective)
        }
        _ if matches!(effective, EffectiveEngine::Legacy { .. }) => GamePrefix::Legacy,
        _ => GamePrefix::Invalid,
    };
    prefix_to_value(&prefix)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_switched_plain_game_reports_its_old_prefix_and_a_legacy_one_nothing() {
        let switched = resolve_game_prefix_value(&json!({
            "runner": "gog", "appName": "1207658924",
            "settings": {"winePrefix": "/p", "wineVersion": {"type": "wine"}},
            "effective": {"kind": "override", "id": "automatic", "source": "stored"}
        }));
        assert_eq!(
            switched,
            json!({"kind": "bottle", "bottleName": "GameLib-gog-1207658924",
                   "origin": "switched-from-plain", "previousPrefix": "/p"})
        );
        let legacy = resolve_game_prefix_value(&json!({
            "runner": "bad", "appName": "1", "settings": {}, "effective": {"kind": "legacy", "label": "x"}
        }));
        assert_eq!(legacy, json!({"kind": "legacy"}));
    }
}
