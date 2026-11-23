//! The one rule that says which prefix a non-Steam game launches in (Phase 61 D-01, D-02, D-04,
//! D-05, ported from `gamePrefix.ts`). Pure: settings in, a value out, no filesystem access.
//!
//! Whether a game is on its per-game bottle is inferred from `wineCrossoverBottle` equalling the
//! per-game bottle name, not from the presence of an engine key: a first save on a legacy
//! shared-bottle game (D-05) writes an engine key, and that save must not silently move the game to
//! a fresh bottle (D-02). Only a game whose stored bottle IS its per-game name, or a plain-prefix
//! game switched to Automatic/CrossOver (D-04), lands on a per-game bottle.
//!
//! D-04: a switch from a plain prefix always means a fresh bottle. The old prefix is reported as
//! `previous_prefix` for display only; it is never adopted, symlinked or written.

use serde_json::Value;

use crate::bottles::paths::is_clean_bottle_name;
use crate::config::EffectiveEngine;
use crate::game_engine::per_game_bottle_name;
use crate::ids::{AUTOMATIC, CROSSOVER};
use crate::jsutil::prop;

/// Why a game is on the bottle it is on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BottleOrigin {
    LegacyCrossover,
    PerGame,
    SwitchedFromPlain,
}

#[derive(Debug, Clone, PartialEq)]
pub enum GamePrefix {
    Legacy,
    Invalid,
    /// `winePrefix` is whatever the settings held (absent in the TS is `None`).
    Plain {
        wine_prefix: Option<Value>,
    },
    Bottle {
        bottle_name: String,
        origin: BottleOrigin,
        previous_prefix: Option<Value>,
    },
}

/// The settings `resolveGamePrefix` reads: `wineVersion`, `wineCrossoverBottle` and `winePrefix`.
pub fn resolve_game_prefix(
    runner: &str,
    app_name: &str,
    settings: &Value,
    effective: &EffectiveEngine,
) -> GamePrefix {
    // (1) legacy: launch exactly as today (D-07)
    if matches!(effective, EffectiveEngine::Legacy { .. }) {
        return GamePrefix::Legacy;
    }
    resolve_non_legacy(runner, app_name, settings, effective)
}

fn resolve_non_legacy(
    runner: &str,
    app_name: &str,
    settings: &Value,
    effective: &EffectiveEngine,
) -> GamePrefix {
    let Some(per_game) = per_game_bottle_name(runner, app_name) else {
        return GamePrefix::Invalid;
    };
    let stored_bottle = prop(settings, "wineCrossoverBottle");
    // (2) a CrossOver game keeps the bottle it already names (D-02, D-05)
    let crossover = prop(settings, "wineVersion")
        .and_then(|wine| prop(wine, "type"))
        .and_then(Value::as_str)
        == Some("crossover");
    if crossover {
        // Only a name the sanitiser leaves unchanged is kept; a padded or unsafe one falls back to
        // GameLib (quick 261124-8f3).
        let name = match stored_bottle {
            Some(Value::String(text)) if is_clean_bottle_name(text) => text.clone(),
            _ => "GameLib".to_string(),
        };
        let origin = if name == per_game {
            BottleOrigin::PerGame
        } else {
            BottleOrigin::LegacyCrossover
        };
        return GamePrefix::Bottle {
            bottle_name: name,
            origin,
            previous_prefix: None,
        };
    }
    // (3) a non-CrossOver game whose stored bottle is its per-game name (D-01)
    if stored_bottle.and_then(Value::as_str) == Some(per_game.as_str()) {
        return GamePrefix::Bottle {
            bottle_name: per_game,
            origin: BottleOrigin::PerGame,
            previous_prefix: None,
        };
    }
    // (4) plain-prefix game switched to Automatic/CrossOver: fresh bottle (D-04)
    if let EffectiveEngine::Override { id, .. } = effective {
        if id == AUTOMATIC || id == CROSSOVER {
            return GamePrefix::Bottle {
                bottle_name: per_game,
                origin: BottleOrigin::SwitchedFromPlain,
                previous_prefix: prop(settings, "winePrefix").cloned(),
            };
        }
    }
    // (5) otherwise the plain prefix stays (D-04, D-06)
    GamePrefix::Plain {
        wine_prefix: prop(settings, "winePrefix").cloned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::EngineSource;
    use serde_json::json;

    fn automatic() -> EffectiveEngine {
        EffectiveEngine::Override {
            id: "automatic".to_string(),
            source: EngineSource::Derived,
        }
    }

    #[test]
    fn legacy_and_invalid_come_first() {
        let legacy = EffectiveEngine::Legacy { label: None };
        assert_eq!(
            resolve_game_prefix("gog", "1", &json!({}), &legacy),
            GamePrefix::Legacy
        );
        assert_eq!(
            resolve_game_prefix("steam", "620", &json!({}), &automatic()),
            GamePrefix::Bottle {
                bottle_name: "GameLib-steam-620".to_string(),
                origin: BottleOrigin::SwitchedFromPlain,
                previous_prefix: None
            }
        );
        assert_eq!(
            resolve_game_prefix("gog", "../x", &json!({}), &automatic()),
            GamePrefix::Invalid
        );
    }

    #[test]
    fn a_crossover_game_keeps_its_bottle_and_a_plain_game_keeps_its_prefix() {
        let crossover =
            json!({"wineVersion": {"type": "crossover"}, "wineCrossoverBottle": "Shared"});
        assert_eq!(
            resolve_game_prefix("gog", "1234", &crossover, &automatic()),
            GamePrefix::Bottle {
                bottle_name: "Shared".to_string(),
                origin: BottleOrigin::LegacyCrossover,
                previous_prefix: None
            }
        );
        let own = json!({"wineCrossoverBottle": "GameLib-gog-1234"});
        assert!(matches!(
            resolve_game_prefix("gog", "1234", &own, &automatic()),
            GamePrefix::Bottle {
                origin: BottleOrigin::PerGame,
                ..
            }
        ));
        let pinned = EffectiveEngine::Override {
            id: "pinned:wine-staging-11.20".to_string(),
            source: EngineSource::Stored,
        };
        let plain = json!({"winePrefix": "/p"});
        assert_eq!(
            resolve_game_prefix("gog", "1234", &plain, &pinned),
            GamePrefix::Plain {
                wine_prefix: Some(json!("/p"))
            }
        );
    }

    #[test]
    fn a_padded_crossover_bottle_falls_back_like_an_unsafe_one() {
        let shared_gamelib = |bottle: Value| {
            let settings =
                json!({"wineVersion": {"type": "crossover"}, "wineCrossoverBottle": bottle});
            resolve_game_prefix("gog", "1207658924", &settings, &automatic())
        };
        let gamelib = GamePrefix::Bottle {
            bottle_name: "GameLib".to_string(),
            origin: BottleOrigin::LegacyCrossover,
            previous_prefix: None,
        };
        for refused in [
            json!(" Shared "),
            json!(" GameLib-gog-1207658924"),
            json!("Shared\u{2028}"),
            json!("a/b"),
            json!(""),
            json!(null),
            json!(7),
        ] {
            assert_eq!(shared_gamelib(refused.clone()), gamelib, "{refused}");
        }
        assert_eq!(
            shared_gamelib(json!("Shared")),
            GamePrefix::Bottle {
                bottle_name: "Shared".to_string(),
                origin: BottleOrigin::LegacyCrossover,
                previous_prefix: None
            }
        );
    }
}
